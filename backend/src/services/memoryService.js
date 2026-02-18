/**
 * Memory Service
 * Manages short-term (session) and long-term (database) memory with context selection
 */

const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

/**
 * Memory types
 */
const MEMORY_TYPES = {
  SHORT_TERM: 'short_term',
  LONG_TERM: 'long_term',
  CONTEXT: 'context',
  FACT: 'fact',
  PREFERENCE: 'preference'
};

/**
 * Token budget for context injection
 */
const TOKEN_BUDGET = {
  MAX_CONTEXT_TOKENS: 4000,
  MAX_HISTORY_TOKENS: 2000,
  MAX_MEMORIES_TOKENS: 2000
};

/**
 * Average tokens per character (rough estimate)
 */
const TOKENS_PER_CHAR = 0.25;

class MemoryService {
  /**
   * Create a new session
   */
  async createSession(userId, deviceId, ipAddress, userAgent) {
    const result = await pool.query(
      `INSERT INTO user_sessions (user_id, device_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, deviceId, ipAddress, userAgent]
    );
    return result.rows[0];
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId) {
    await pool.query(
      `UPDATE user_sessions 
       SET last_activity_at = NOW() 
       WHERE id = $1`,
      [sessionId]
    );
  }

  /**
   * End a session
   */
  async endSession(sessionId) {
    await pool.query(
      `UPDATE user_sessions 
       SET ended_at = NOW() 
       WHERE id = $1`,
      [sessionId]
    );
  }

  /**
   * Record a session event
   */
  async recordEvent(sessionId, eventType, eventData = {}) {
    const result = await pool.query(
      `INSERT INTO session_events (session_id, event_type, event_data)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [sessionId, eventType, JSON.stringify(eventData)]
    );
    return result.rows[0];
  }

  /**
   * Store a memory
   */
  async storeMemory(userId, sessionId, memoryType, content, options = {}) {
    const { 
      generationId = null, 
      importanceScore = 0.5, 
      source = 'user',
      expiresAt = null 
    } = options;

    const result = await pool.query(
      `INSERT INTO memories (user_id, session_id, generation_id, memory_type, content, importance_score, source, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, sessionId, generationId, memoryType, content, importanceScore, source, expiresAt]
    );
    return result.rows[0];
  }

  /**
   * Store multiple memories
   */
  async storeMemories(memories) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      for (const memory of memories) {
        await client.query(
          `INSERT INTO memories (user_id, session_id, generation_id, memory_type, content, importance_score, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            memory.userId, 
            memory.sessionId, 
            memory.generationId, 
            memory.memoryType, 
            memory.content, 
            memory.importanceScore || 0.5, 
            memory.source || 'system'
          ]
        );
      }
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get memories for context injection
   * Implements importance-based selection with token budget
   */
  async getMemoriesForContext(userId, options = {}) {
    const {
      sessionId = null,
      memoryTypes = [MEMORY_TYPES.CONTEXT, MEMORY_TYPES.FACT, MEMORY_TYPES.PREFERENCE],
      maxTokens = TOKEN_BUDGET.MAX_MEMORIES_TOKENS
    } = options;

    let query = `
      SELECT id, memory_type, content, importance_score, created_at, last_accessed_at
      FROM memories
      WHERE user_id = $1 
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
    `;
    
    const params = [userId];
    
    if (sessionId) {
      query += ` AND session_id = $${params.length + 1}`;
      params.push(sessionId);
    }
    
    if (memoryTypes && memoryTypes.length > 0) {
      query += ` AND memory_type = ANY($${params.length + 1})`;
      params.push(memoryTypes);
    }
    
    query += ` ORDER BY importance_score DESC, created_at DESC LIMIT 100`;
    
    const result = await pool.query(query, params);
    
    // Filter by token budget
    const selectedMemories = [];
    let currentTokens = 0;
    
    for (const memory of result.rows) {
      const memoryTokens = memory.content.length * TOKENS_PER_CHAR;
      
      if (currentTokens + memoryTokens <= maxTokens) {
        selectedMemories.push(memory);
        currentTokens += memoryTokens;
        
        // Update last accessed
        await pool.query(
          `UPDATE memories SET last_accessed_at = NOW() WHERE id = $1`,
          [memory.id]
        );
      } else {
        break;
      }
    }
    
    return selectedMemories;
  }

  /**
   * Get generation history for context
   */
  async getGenerationHistory(userId, repositoryId, options = {}) {
    const {
      sessionId = null,
      limit = 10,
      maxTokens = TOKEN_BUDGET.MAX_HISTORY_TOKENS
    } = options;

    let query = `
      SELECT id, prompt, content, version, section, created_at
      FROM generations
      WHERE user_id = $1 
        AND status = 'active'
        AND repository_id = $2
    `;
    
    const params = [userId, repositoryId];
    
    if (sessionId) {
      query += ` AND session_id = $${params.length + 1}`;
      params.push(sessionId);
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    
    // Filter by token budget
    const selectedGenerations = [];
    let currentTokens = 0;
    
    for (const generation of result.rows) {
      const contentStr = JSON.stringify(generation.content);
      const generationTokens = contentStr.length * TOKENS_PER_CHAR;
      
      if (currentTokens + generationTokens <= maxTokens) {
        selectedGenerations.push(generation);
        currentTokens += generationTokens;
      } else {
        break;
      }
    }
    
    return selectedGenerations;
  }

  /**
   * Build context for generation
   * Combines memories, history, and user preferences
   */
  async buildContext(userId, repositoryId, sessionId, options = {}) {
    const {
      includeMemories = true,
      includeHistory = true,
      maxTokens = TOKEN_BUDGET.MAX_CONTEXT_TOKENS
    } = options;

    const context = {
      memories: [],
      recentGenerations: [],
      preferences: null,
      tokenCount: 0
    };

    // Get user preferences
    context.preferences = await this.getUserPreferences(userId);

    // Get memories
    if (includeMemories) {
      context.memories = await this.getMemoriesForContext(userId, { sessionId });
      context.tokenCount += context.memories.reduce((sum, m) => sum + m.content.length * TOKENS_PER_CHAR, 0);
    }

    // Get recent generations
    if (includeHistory) {
      const remainingTokens = Math.max(0, maxTokens - context.tokenCount);
      context.recentGenerations = await this.getGenerationHistory(
        userId, 
        repositoryId, 
        { sessionId, maxTokens: remainingTokens }
      );
      context.tokenCount += context.recentGenerations.reduce((sum, g) => sum + JSON.stringify(g.content).length * TOKENS_PER_CHAR, 0);
    }

    return context;
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(userId) {
    const result = await pool.query(
      `SELECT * FROM user_preferences WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Store important facts from generation
   */
  async extractAndStoreFacts(userId, sessionId, generationId, content) {
    const facts = [];

    // Extract repository-specific facts
    if (content.healthScore) {
      facts.push({
        userId,
        sessionId,
        generationId,
        memoryType: MEMORY_TYPES.FACT,
        content: `Repository health score: ${content.healthScore}`,
        importanceScore: 0.7,
        source: 'generation_analysis'
      });
    }

    if (content.riskFactors && content.riskFactors.length > 0) {
      facts.push({
        userId,
        sessionId,
        generationId,
        memoryType: MEMORY_TYPES.FACT,
        content: `Identified risk factors: ${content.riskFactors.slice(0, 3).join(', ')}`,
        importanceScore: 0.8,
        source: 'generation_analysis'
      });
    }

    // Store facts
    if (facts.length > 0) {
      await this.storeMemories(facts);
    }

    return facts;
  }

  /**
   * Clean up expired memories
   */
  async cleanupExpiredMemories() {
    const result = await pool.query(
      `DELETE FROM memories 
       WHERE expires_at IS NOT NULL 
         AND expires_at < NOW()
       RETURNING id`
    );
    return result.rowCount;
  }

  /**
   * Archive old sessions
   */
  async archiveOldSessions(daysOld = 30) {
    const result = await pool.query(
      `UPDATE user_sessions 
       SET ended_at = COALESCE(ended_at, NOW())
       WHERE ended_at IS NULL 
         AND started_at < NOW() - INTERVAL '${daysOld} days'
       RETURNING id`
    );
    return result.rowCount;
  }

  /**
   * Get memory summary for a user
   */
  async getMemorySummary(userId) {
    const result = await pool.query(
      `SELECT 
         memory_type,
         COUNT(*) as count,
         MAX(created_at) as latest
       FROM memories
       WHERE user_id = $1 AND is_active = true
       GROUP BY memory_type`,
      [userId]
    );
    
    return result.rows;
  }

  /**
   * Delete specific memory
   */
  async deleteMemory(memoryId, userId) {
    await pool.query(
      `UPDATE memories 
       SET is_active = false 
       WHERE id = $1 AND user_id = $2`,
      [memoryId, userId]
    );
  }

  /**
   * Search memories
   */
  async searchMemories(userId, query, options = {}) {
    const { limit = 20 } = options;
    
    const result = await pool.query(
      `SELECT * FROM memories
       WHERE user_id = $1 
         AND is_active = true
         AND content ILIKE $2
       ORDER BY importance_score DESC, created_at DESC
       LIMIT $3`,
      [userId, `%${query}%`, limit]
    );
    
    return result.rows;
  }
}

module.exports = new MemoryService();
module.exports.MEMORY_TYPES = MEMORY_TYPES;
module.exports.TOKEN_BUDGET = TOKEN_BUDGET;
