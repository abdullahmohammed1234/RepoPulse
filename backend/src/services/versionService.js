/**
 * Versioning Service
 * Manages version control for AI generations with full history tracking
 */

const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

/**
 * Change types for versioning
 */
const CHANGE_TYPES = {
  INITIAL: 'initial',
  REGENERATE: 'regenerate',
  EDIT: 'edit',
  RESTORE: 'restore',
  PARTIAL_REGENERATE: 'partial_regenerate'
};

/**
 * Sections that can be regenerated independently
 */
const SECTIONS = {
  SUMMARY: 'summary',
  RECOMMENDATIONS: 'recommendations',
  ANALYSIS: 'analysis',
  RISK_FACTORS: 'risk_factors',
  ALL: 'all'
};

class VersionService {
  /**
   * Create a new generation with versioning
   */
  async createGeneration(data) {
    const {
      userId = null,
      sessionId = null,
      repositoryId = null,
      parentVersionId = null,
      prompt,
      content,
      rawOutput = null,
      section = 'all',
      model = null,
      tokensUsed = null,
      latencyMs = null
    } = data;

    // Get version number
    let versionNumber = 1;
    if (parentVersionId) {
      const parent = await this.getGeneration(parentVersionId);
      if (parent) {
        versionNumber = parent.version_number + 1;
      }
    }

    const version = `v${versionNumber}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert generation
      const genResult = await client.query(
        `INSERT INTO generations (
          user_id, session_id, repository_id, parent_version_id,
          prompt, content, raw_output, version, version_number, section,
          model, tokens_used, latency_ms, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active')
        RETURNING *`,
        [
          userId, sessionId, repositoryId, parentVersionId,
          prompt, JSON.stringify(content), rawOutput, version, versionNumber, section,
          model, tokensUsed, latencyMs
        ]
      );

      const generation = genResult.rows[0];

      // Create initial version record
      await client.query(
        `INSERT INTO versions (
          generation_id, version_number, content, change_summary, change_type, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          generation.id,
          versionNumber,
          JSON.stringify(content),
          'Initial generation',
          CHANGE_TYPES.INITIAL,
          userId
        ]
      );

      await client.query('COMMIT');
      return generation;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get generation by ID
   */
  async getGeneration(generationId) {
    const result = await pool.query(
      `SELECT * FROM generations WHERE id = $1`,
      [generationId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get generations for a user/repository with pagination
   */
  async getGenerations(userId, repositoryId, options = {}) {
    const {
      page = 1,
      limit = 20,
      section = null,
      status = 'active'
    } = options;

    const offset = (page - 1) * limit;

    // Return empty result for demo/non-UUID userIds
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!userId || !uuidRegex.test(userId)) {
      return {
        generations: [],
        total: 0,
        page,
        limit,
        totalPages: 0
      };
    }

    let query = `
      SELECT g.*, 
        (SELECT COUNT(*) FROM versions v WHERE v.generation_id = g.id) as version_count
      FROM generations g
      WHERE g.user_id = $1 AND g.repository_id = $2
    `;
    
    const params = [userId, repositoryId];
    let paramIndex = 3;

    if (section) {
      query += ` AND g.section = $${paramIndex}`;
      params.push(section);
      paramIndex++;
    }

    if (status) {
      query += ` AND g.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY g.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM generations
      WHERE user_id = $1 AND repository_id = $2
    `;
    const countResult = await pool.query(countQuery, [userId, repositoryId]);

    return {
      generations: result.rows,
      total: parseInt(countResult.rows[0].total),
      page,
      limit,
      totalPages: Math.ceil(countResult.rows[0].total / limit)
    };
  }

  /**
   * Create a new version (regenerate)
   */
  async createVersion(generationId, newContent, changeType, options = {}) {
    const {
      changeSummary = '',
      regeneratedSection = null,
      userId = null
    } = options;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get current generation
      const genResult = await client.query(
        `SELECT * FROM generations WHERE id = $1`,
        [generationId]
      );

      if (genResult.rows.length === 0) {
        throw new Error('Generation not found');
      }

      const generation = genResult.rows[0];
      const newVersionNumber = generation.version_number + 1;
      const newVersion = `v${newVersionNumber}`;

      // Update generation with new content
      await client.query(
        `UPDATE generations 
         SET content = $1, 
             version_number = $2, 
             version = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [JSON.stringify(newContent), newVersionNumber, newVersion, generationId]
      );

      // Create version record
      const versionResult = await client.query(
        `INSERT INTO versions (
          generation_id, version_number, content, change_summary, change_type, regenerated_section, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          generationId,
          newVersionNumber,
          JSON.stringify(newContent),
          changeSummary,
          changeType,
          regeneratedSection,
          userId
        ]
      );

      await client.query('COMMIT');
      return versionResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Regenerate a specific section
   */
  async regenerateSection(generationId, section, newSectionContent, userId = null) {
    const generation = await this.getGeneration(generationId);
    
    if (!generation) {
      throw new Error('Generation not found');
    }

    const currentContent = typeof generation.content === 'string' 
      ? JSON.parse(generation.content) 
      : generation.content;

    // Update only the specified section
    const updatedContent = {
      ...currentContent,
      [section]: newSectionContent,
      _regeneratedSections: [
        ...(currentContent._regeneratedSections || []),
        { section, timestamp: new Date().toISOString() }
      ]
    };

    return await this.createVersion(
      generationId,
      updatedContent,
      CHANGE_TYPES.PARTIAL_REGENERATE,
      {
        changeSummary: `Regenerated section: ${section}`,
        regeneratedSection: section,
        userId
      }
    );
  }

  /**
   * Get version history for a generation
   */
  async getVersionHistory(generationId) {
    const result = await pool.query(
      `SELECT v.*, u.login as created_by_login
       FROM versions v
       LEFT JOIN users u ON v.created_by = u.id
       WHERE v.generation_id = $1
       ORDER BY v.version_number DESC`,
      [generationId]
    );
    return result.rows;
  }

  /**
   * Get specific version
   */
  async getVersion(generationId, versionNumber) {
    const result = await pool.query(
      `SELECT * FROM versions 
       WHERE generation_id = $1 AND version_number = $2`,
      [generationId, versionNumber]
    );
    return result.rows[0] || null;
  }

  /**
   * Restore a previous version
   */
  async restoreVersion(generationId, versionNumber, userId = null) {
    const version = await this.getVersion(generationId, versionNumber);
    
    if (!version) {
      throw new Error('Version not found');
    }

    const content = typeof version.content === 'string' 
      ? JSON.parse(version.content) 
      : version.content;

    return await this.createVersion(
      generationId,
      content,
      CHANGE_TYPES.RESTORE,
      {
        changeSummary: `Restored to version ${versionNumber}`,
        userId
      }
    );
  }

  /**
   * Compare two versions
   */
  async compareVersions(generationId, version1, version2) {
    const v1 = await this.getVersion(generationId, version1);
    const v2 = await this.getVersion(generationId, version2);

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    const content1 = typeof v1.content === 'string' ? JSON.parse(v1.content) : v1.content;
    const content2 = typeof v2.content === 'string' ? JSON.parse(v2.content) : v2.content;

    // Simple diff comparison
    const changes = [];
    
    // Compare keys
    const allKeys = new Set([...Object.keys(content1), ...Object.keys(content2)]);
    
    for (const key of allKeys) {
      if (JSON.stringify(content1[key]) !== JSON.stringify(content2[key])) {
        changes.push({
          key,
          oldValue: content1[key],
          newValue: content2[key]
        });
      }
    }

    return {
      version1: v1,
      version2: v2,
      changes,
      summary: `${changes.length} changes found between v${version1} and v${version2}`
    };
  }

  /**
   * Archive a generation (soft delete)
   */
  async archiveGeneration(generationId, userId) {
    await pool.query(
      `UPDATE generations 
       SET status = 'archived', updated_at = NOW()
       WHERE id = $1`,
      [generationId]
    );
  }

  /**
   * Delete a generation (permanent)
   */
  async deleteGeneration(generationId) {
    // This will cascade to versions due to foreign key constraint
    await pool.query(
      `DELETE FROM generations WHERE id = $1`,
      [generationId]
    );
  }

  /**
   * Get latest generation for a repository
   */
  async getLatestGeneration(userId, repositoryId, section = null) {
    let query = `
      SELECT * FROM generations
      WHERE user_id = $1 AND repository_id = $2 AND status = 'active'
    `;
    
    const params = [userId, repositoryId];
    
    if (section) {
      query += ` AND section = $3`;
      params.push(section);
    }
    
    query += ` ORDER BY created_at DESC LIMIT 1`;
    
    const result = await pool.query(query, params);
    return result.rows[0] || null;
  }

  /**
   * Add user feedback to a generation
   */
  async addFeedback(generationId, rating, feedback) {
    await pool.query(
      `UPDATE generations 
       SET rating = $1, feedback = $2, updated_at = NOW()
       WHERE id = $3`,
      [rating, feedback, generationId]
    );
  }

  /**
   * Get generations by rating
   */
  async getGenerationsByRating(userId, minRating) {
    const result = await pool.query(
      `SELECT * FROM generations
       WHERE user_id = $1 AND rating >= $2
       ORDER BY rating DESC, created_at DESC`,
      [userId, minRating]
    );
    return result.rows;
  }
}

module.exports = new VersionService();
module.exports.CHANGE_TYPES = CHANGE_TYPES;
module.exports.SECTIONS = SECTIONS;
