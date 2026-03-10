/**
 * Feedback Service
 * Handles feedback submission, section ratings, and edit tracking
 */

const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Reason categories for feedback
const REASON_CATEGORIES = {
  UNCLEAR: 'unclear',
  INCOMPLETE: 'incomplete',
  INCORRECT: 'incorrect',
  REPETITIVE: 'repetitive',
  TOO_LONG: 'too_long',
  TOO_SHORT: 'too_short',
  IRRELEVANT: 'irrelevant'
};

// Issue types for section feedback
const ISSUE_TYPES = {
  UNCLEAR: 'unclear',
  INCOMPLETE: 'incomplete',
  INCORRECT: 'incorrect',
  REPETITIVE: 'repetitive',
  MISSING_CONTEXT: 'missing_context',
  TOO_DETAILED: 'too_detailed'
};

// Severity levels
const SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

class FeedbackService {
  /**
   * Submit feedback for a generation
   */
  async submitFeedback(data) {
    const {
      generationId,
      userId = null,
      sessionId = null,
      rating,
      ratingScore = null,
      reasonCategory = null,
      reasonDetails = null,
      sectionFeedback = [],
      promptVersionId = null,
      modelUsed = null,
      tokensUsed = null,
      latencyMs = null,
      userAgent = null,
      ipHash = null
    } = data;

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Insert feedback record
      const feedbackResult = await client.query(
        `INSERT INTO feedback (
          generation_id, user_id, session_id, rating, rating_score,
          reason_category, reason_details, section_feedback,
          prompt_version_id, model_used, tokens_used, latency_ms,
          user_agent, ip_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          generationId, userId, sessionId, rating, ratingScore,
          reasonCategory, reasonDetails, JSON.stringify(sectionFeedback),
          promptVersionId, modelUsed, tokensUsed, latencyMs,
          userAgent, ipHash
        ]
      );
      
      const feedback = feedbackResult.rows[0];
      
      // Insert section-level feedback if provided
      if (sectionFeedback && sectionFeedback.length > 0) {
        for (const section of sectionFeedback) {
          await client.query(
            `INSERT INTO section_feedback (
              feedback_id, section_name, section_position,
              section_rating, section_score, issue_type,
              issue_description, severity, suggested_improvement
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              feedback.id,
              section.section,
              section.position || null,
              section.rating !== undefined ? section.rating : null,
              section.score || null,
              section.issueType || null,
              section.issueDescription || null,
              section.severity || null,
              section.suggestedImprovement || null
            ]
          );
        }
      }
      
      // Log feedback event
      await client.query(
        `INSERT INTO feedback_events (
          event_type, feedback_id, generation_id, user_id, session_id, event_data
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          'feedback_submitted',
          feedback.id,
          generationId,
          userId,
          sessionId,
          JSON.stringify({ rating, ratingScore, reasonCategory })
        ]
      );
      
      // Update generation with feedback_id
      if (generationId) {
        await client.query(
          'UPDATE generations SET feedback_id = $1 WHERE id = $2',
          [feedback.id, generationId]
        );
      }
      
      await client.query('COMMIT');
      
      return {
        success: true,
        feedback: {
          id: feedback.id,
          rating: feedback.rating,
          ratingScore: feedback.rating_score,
          reasonCategory: feedback.reason_category,
          createdAt: feedback.created_at
        }
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error submitting feedback:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Detect and record user edits to generated content
   */
  async recordEdit(data) {
    const {
      generationId,
      userId = null,
      sessionId = null,
      originalContent,
      editedContent,
      editTimestamp = new Date(),
      promptVersionId = null,
      modelUsed = null,
      tokensUsed = null,
      latencyMs = null
    } = data;
    
    // Calculate edit distance (simple character-based)
    const editDistance = this.calculateLevenshteinDistance(originalContent, editedContent);
    
    // Estimate token count for edit
    const editTokenCount = Math.ceil(editedContent.split(/\s+/).length * 1.3);
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if feedback already exists
      let feedbackResult = await client.query(
        'SELECT * FROM feedback WHERE generation_id = $1 AND user_id = $2',
        [generationId, userId]
      );
      
      let feedback;
      
      if (feedbackResult.rows.length > 0) {
        // Update existing feedback with edit info
        feedback = feedbackResult.rows[0];
        await client.query(
          `UPDATE feedback SET 
            original_content = $1, 
            edited_content = $2, 
            edit_distance = $3, 
            edit_token_count = $4,
            edit_timestamp = $5
          WHERE id = $6`,
          [originalContent, editedContent, editDistance, editTokenCount, editTimestamp, feedback.id]
        );
      } else {
        // Create new feedback record with edit info
        feedbackResult = await client.query(
          `INSERT INTO feedback (
            generation_id, user_id, session_id, rating,
            original_content, edited_content, edit_distance,
            edit_token_count, edit_timestamp, prompt_version_id,
            model_used, tokens_used, latency_ms
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING *`,
          [
            generationId, userId, sessionId, null, // no rating yet
            originalContent, editedContent, editDistance,
            editTokenCount, editTimestamp, promptVersionId,
            modelUsed, tokensUsed, latencyMs
          ]
        );
        feedback = feedbackResult.rows[0];
      }
      
      // Log edit event
      await client.query(
        `INSERT INTO feedback_events (
          event_type, feedback_id, generation_id, user_id, session_id, event_data
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          'edit_detected',
          feedback.id,
          generationId,
          userId,
          sessionId,
          JSON.stringify({ editDistance, editTokenCount })
        ]
      );
      
      await client.query('COMMIT');
      
      return {
        success: true,
        edit: {
          feedbackId: feedback.id,
          editDistance,
          editTokenCount
        }
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error recording edit:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get feedback for a generation
   */
  async getFeedbackByGeneration(generationId) {
    const result = await pool.query(
      `SELECT f.*, 
        COALESCE(json_agg(sf) FILTER (WHERE sf.id IS NOT NULL), '[]') as section_feedback_details
       FROM feedback f
       LEFT JOIN section_feedback sf ON f.id = sf.feedback_id
       WHERE f.generation_id = $1
       GROUP BY f.id`,
      [generationId]
    );
    
    return result.rows[0] || null;
  }
  
  /**
   * Get feedback analytics
   */
  async getAnalytics(startDate, endDate) {
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_feedback,
        SUM(CASE WHEN rating = true THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN rating = false THEN 1 ELSE 0 END) as negative_count,
        AVG(CASE WHEN rating_score IS NOT NULL THEN rating_score END) as avg_rating_score,
        SUM(edit_distance) as total_edit_distance,
        AVG(edit_distance) as avg_edit_distance,
        COUNT(CASE WHEN edit_distance > 0 THEN 1 END) as total_edits
       FROM feedback
       WHERE created_at BETWEEN $1 AND $2`,
      [startDate, endDate]
    );
    
    return result.rows[0];
  }
  
  /**
   * Get feedback trends over time
   */
  async getTrends(days = 30) {
    const result = await pool.query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as feedback_count,
        SUM(CASE WHEN rating = true THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN rating = false THEN 1 ELSE 0 END) as negative_count,
        AVG(rating_score) as avg_rating_score
       FROM feedback
       WHERE created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    );
    
    return result.rows;
  }
  
  /**
   * Get feedback by reason category
   */
  async getByReasonCategory(startDate, endDate) {
    const result = await pool.query(
      `SELECT 
        reason_category,
        COUNT(*) as count,
        AVG(rating_score) as avg_score
       FROM feedback
       WHERE reason_category IS NOT NULL
         AND created_at BETWEEN $1 AND $2
       GROUP BY reason_category
       ORDER BY count DESC`,
      [startDate, endDate]
    );
    
    return result.rows;
  }
  
  /**
   * Get most edited sections
   */
  async getMostEditedSections(limit = 10) {
    const result = await pool.query(
      `SELECT 
        section_name,
        COUNT(*) as edit_count,
        AVG(CASE WHEN section_score IS NOT NULL THEN section_score END) as avg_score,
        json_agg(DISTINCT issue_type) FILTER (WHERE issue_type IS NOT NULL) as issue_types
       FROM section_feedback
       GROUP BY section_name
       ORDER BY edit_count DESC
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   */
  calculateLevenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    
    // Create matrix
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    // Initialize
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    // Fill matrix
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(
            dp[i - 1][j],     // delete
            dp[i][j - 1],     // insert
            dp[i - 1][j - 1]  // replace
          );
        }
      }
    }
    
    return dp[m][n];
  }
  
  /**
   * Aggregate feedback for dashboard
   */
  async aggregateForDashboard() {
    const today = new Date();
    const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const [
      overallStats,
      trends,
      byReason,
      bySection
    ] = await Promise.all([
      this.getAnalytics(last30Days, today),
      this.getTrends(30),
      this.getByReasonCategory(last30Days, today),
      this.getMostEditedSections()
    ]);
    
    return {
      overall: overallStats,
      trends,
      byReason,
      bySection,
      period: {
        start: last30Days,
        end: today
      }
    };
  }
}

module.exports = new FeedbackService();
module.exports.REASON_CATEGORIES = REASON_CATEGORIES;
module.exports.ISSUE_TYPES = ISSUE_TYPES;
module.exports.SEVERITY = SEVERITY;
