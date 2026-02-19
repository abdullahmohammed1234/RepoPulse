/**
 * Analytics Service
 * Phase 6: Admin & Analytics Dashboard
 */

const { query, pool } = require('../config/db');
const logger = require('./logger');

// Ensure logger has info method
if (typeof logger.info !== 'function') {
  logger.info = (msg) => console.log('[INFO]', msg);
  logger.warn = (msg) => console.log('[WARN]', msg);
  logger.error = (msg) => console.error('[ERROR]', msg);
}

/**
 * Get dashboard overview metrics
 */
async function getDashboardMetrics(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  try {
    // Generation metrics
    const generationResult = await query(
      `SELECT 
         COUNT(*) as total_generations,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_generations,
         AVG(latency_ms) as avg_latency,
         SUM(latency_ms) as total_latency
       FROM generations 
       WHERE created_at >= $1`,
      [startDate]
    );
    
    // User metrics
    const userResult = await query(
      `SELECT 
         COUNT(DISTINCT user_id) as active_users,
         COUNT(DISTINCT repository_id) as active_repositories
       FROM generations 
       WHERE created_at >= $1 AND user_id IS NOT NULL`,
      [startDate]
    );
    
    // Feedback metrics
    const feedbackResult = await query(
      `SELECT 
         COUNT(*) as total_feedback,
         SUM(CASE WHEN rating = 'positive' THEN 1 ELSE 0 END) as positive_ratings,
         SUM(CASE WHEN rating = 'negative' THEN 1 ELSE 0 END) as negative_ratings
       FROM feedback 
       WHERE created_at >= $1`,
      [startDate]
    );
    
    // Token usage from Phase 5 tables
    const tokenResult = await query(
      `SELECT 
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(cost_usd), 0) as total_cost
       FROM token_usage 
       WHERE created_at >= $1`,
      [startDate]
    );
    
    // Workflow execution metrics
    const workflowResult = await query(
      `SELECT 
         COUNT(*) as total_executions,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_executions,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_executions
       FROM workflow_executions 
       WHERE created_at >= $1`,
      [startDate]
    );
    
    // Daily trend data
    const trendResult = await query(
      `SELECT 
         DATE(created_at) as date,
         COUNT(*) as generations,
         COUNT(DISTINCT user_id) as users
       FROM generations 
       WHERE created_at >= $1
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [startDate]
    );
    
    return {
      period: {
        startDate: startDate.toISOString(),
        days
      },
      generations: {
        total: parseInt(generationResult.rows[0].total_generations) || 0,
        successful: parseInt(generationResult.rows[0].successful_generations) || 0,
        successRate: generationResult.rows[0].total_generations > 0 
          ? (generationResult.rows[0].successful_generations / generationResult.rows[0].total_generations * 100).toFixed(1)
          : 0,
        avgLatency: Math.round(generationResult.rows[0].avg_latency) || 0
      },
      users: {
        active: parseInt(userResult.rows[0].active_users) || 0,
        repositories: parseInt(userResult.rows[0].active_repositories) || 0
      },
      feedback: {
        total: parseInt(feedbackResult.rows[0].total_feedback) || 0,
        positive: parseInt(feedbackResult.rows[0].positive_ratings) || 0,
        negative: parseInt(feedbackResult.rows[0].negative_ratings) || 0,
        positiveRate: feedbackResult.rows[0].total_feedback > 0
          ? (feedbackResult.rows[0].positive_ratings / feedbackResult.rows[0].total_feedback * 100).toFixed(1)
          : 0
      },
      tokens: {
        total: parseInt(tokenResult.rows[0].total_tokens) || 0,
        cost: parseFloat(tokenResult.rows[0].total_cost) || 0
      },
      workflows: {
        total: parseInt(workflowResult.rows[0].total_executions) || 0,
        successful: parseInt(workflowResult.rows[0].successful_executions) || 0,
        failed: parseInt(workflowResult.rows[0].failed_executions) || 0
      },
      trend: trendResult.rows.map(row => ({
        date: row.date,
        generations: parseInt(row.generations),
        users: parseInt(row.users)
      }))
    };
  } catch (error) {
    logger.error('Failed to get dashboard metrics:', error.message);
    throw error;
  }
}

/**
 * Get feedback trends by section
 */
async function getFeedbackTrends(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  try {
    // Section-level feedback
    const sectionResult = await query(
      `SELECT 
         section_name,
         COUNT(*) as total,
         SUM(CASE WHEN rating = 'positive' THEN 1 ELSE 0 END) as positive,
         SUM(CASE WHEN rating = 'negative' THEN 1 ELSE 0 END) as negative
       FROM section_feedback 
       WHERE created_at >= $1
       GROUP BY section_name
       ORDER BY total DESC
       LIMIT 10`,
      [startDate]
    );
    
    // Rating distribution over time
    const ratingTrend = await query(
      `SELECT 
         DATE(created_at) as date,
         rating,
         COUNT(*) as count
       FROM feedback 
       WHERE created_at >= $1 AND rating IS NOT NULL
       GROUP BY DATE(created_at), rating
       ORDER BY date DESC`,
      [startDate]
    );
    
    return {
      bySection: sectionResult.rows.map(row => ({
        section: row.section_name,
        total: parseInt(row.total),
        positive: parseInt(row.positive),
        negative: parseInt(row.negative),
        positiveRate: row.total > 0 ? (row.positive / row.total * 100).toFixed(1) : 0
      })),
      ratingTrend: ratingTrend.rows.map(row => ({
        date: row.date,
        rating: row.rating,
        count: parseInt(row.count)
      }))
    };
  } catch (error) {
    logger.error('Failed to get feedback trends:', error.message);
    throw error;
  }
}

/**
 * Get failure analysis
 */
async function getFailureAnalysis(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  try {
    // Failed generations
    const failedGenerations = await query(
      `SELECT 
         error_type,
         COUNT(*) as count,
         PERCENT_RANK() OVER (ORDER BY COUNT(*)) as percentage
       FROM generations 
       WHERE created_at >= $1 AND status = 'failed'
       GROUP BY error_type
       ORDER BY count DESC
       LIMIT 10`,
      [startDate]
    );
    
    // Failed workflow executions
    const failedWorkflows = await query(
      `SELECT 
         error_message,
         COUNT(*) as count
       FROM workflow_executions 
       WHERE created_at >= $1 AND status = 'failed'
       GROUP BY error_message
       ORDER BY count DESC
       LIMIT 5`,
      [startDate]
    );
    
    // Calculate failure rates
    const totalGenerations = await query(
      `SELECT COUNT(*) as total FROM generations WHERE created_at >= $1`,
      [startDate]
    );
    
    const totalWorkflows = await query(
      `SELECT COUNT(*) as total FROM workflow_executions WHERE created_at >= $1`,
      [startDate]
    );
    
    const genTotal = parseInt(totalGenerations.rows[0].total) || 1;
    const wfTotal = parseInt(totalWorkflows.rows[0].total) || 1;
    
    return {
      generationFailures: failedGenerations.rows.map(row => ({
        errorType: row.error_type || 'unknown',
        count: parseInt(row.count),
        percentage: (parseInt(row.count) / genTotal * 100).toFixed(1)
      })),
      workflowFailures: failedWorkflows.rows.map(row => ({
        error: row.error_message || 'Unknown error',
        count: parseInt(row.count)
      })),
      summary: {
        totalGenerations: genTotal,
        totalWorkflows: wfTotal,
        generationFailureRate: (failedGenerations.rows.reduce((sum, r) => sum + parseInt(r.count), 0) / genTotal * 100).toFixed(1),
        workflowFailureRate: (failedWorkflows.rows.reduce((sum, r) => sum + parseInt(r.count), 0) / wfTotal * 100).toFixed(1)
      }
    };
  } catch (error) {
    logger.error('Failed to get failure analysis:', error.message);
    throw error;
  }
}

/**
 * Get prompt experiment performance
 */
async function getPromptPerformance() {
  try {
    const result = await query(
      `SELECT 
         pv.id,
         pv.prompt_type,
         pv.version,
         pv.status,
         pv.total_samples,
         pv.completion_rate,
         pv.avg_feedback_score,
         pv.avg_latency_ms,
         pv.is_winner
       FROM prompt_versions pv
       WHERE pv.is_active = true
       ORDER BY pv.total_samples DESC
       LIMIT 10`
    );
    
    return result.rows.map(row => ({
      id: row.id,
      promptType: row.prompt_type,
      version: row.version,
      status: row.status,
      samples: parseInt(row.total_samples) || 0,
      completionRate: parseFloat(row.completion_rate) || 0,
      avgFeedbackScore: parseFloat(row.avg_feedback_score) || 0,
      avgLatencyMs: parseInt(row.avg_latency_ms) || 0,
      isWinner: row.is_winner
    }));
  } catch (error) {
    logger.error('Failed to get prompt performance:', error.message);
    return [];
  }
}

/**
 * Get model performance metrics (from Phase 5)
 */
async function getModelPerformance() {
  try {
    const result = await query(
      `SELECT 
         model_id,
         provider,
         status,
         avg_latency_ms,
         success_rate,
         total_requests,
         failed_requests
       FROM model_health
       ORDER BY total_requests DESC
       LIMIT 10`
    );
    
    return result.rows.map(row => ({
      modelId: row.model_id,
      provider: row.provider,
      status: row.status,
      avgLatencyMs: parseInt(row.avg_latency_ms) || 0,
      successRate: parseFloat(row.success_rate) || 100,
      totalRequests: parseInt(row.total_requests) || 0,
      failedRequests: parseInt(row.failed_requests) || 0
    }));
  } catch (error) {
    logger.error('Failed to get model performance:', error.message);
    return [];
  }
}

/**
 * Get cost breakdown
 */
async function getCostBreakdown(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  try {
    // Cost by model
    const byModel = await query(
      `SELECT 
         model_id,
         SUM(cost_usd) as total_cost,
         SUM(input_tokens) as input_tokens,
         SUM(output_tokens) as output_tokens,
         COUNT(*) as requests
       FROM token_usage 
       WHERE created_at >= $1
       GROUP BY model_id
       ORDER BY total_cost DESC`,
      [startDate]
    );
    
    // Cost by day
    const byDay = await query(
      `SELECT 
         DATE(created_at) as date,
         SUM(cost_usd) as cost,
         SUM(total_tokens) as tokens
       FROM token_usage 
       WHERE created_at >= $1
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [startDate]
    );
    
    return {
      byModel: byModel.rows.map(row => ({
        modelId: row.model_id,
        cost: parseFloat(row.total_cost) || 0,
        inputTokens: parseInt(row.input_tokens) || 0,
        outputTokens: parseInt(row.output_tokens) || 0,
        requests: parseInt(row.requests) || 0
      })),
      byDay: byDay.rows.map(row => ({
        date: row.date,
        cost: parseFloat(row.cost) || 0,
        tokens: parseInt(row.tokens) || 0
      }))
    };
  } catch (error) {
    logger.error('Failed to get cost breakdown:', error.message);
    return { byModel: [], byDay: [] };
  }
}

/**
 * Get alerts based on thresholds
 */
async function getAlerts() {
  const alerts = [];
  
  try {
    // Check failure rate (last 24 hours)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const failureCheck = await query(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM generations 
       WHERE created_at >= $1`,
      [last24h]
    );
    
    const total = parseInt(failureCheck.rows[0].total) || 0;
    const failed = parseInt(failureCheck.rows[0].failed) || 0;
    
    if (total > 0 && (failed / total * 100) > 3) {
      alerts.push({
        type: 'failure_rate',
        severity: 'warning',
        message: `Failure rate is ${(failed / total * 100).toFixed(1)}% (threshold: 3%)`,
        value: (failed / total * 100).toFixed(1)
      });
    }
    
    // Check positive feedback rate (last 24 hours)
    const feedbackCheck = await query(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN rating = 'positive' THEN 1 ELSE 0 END) as positive
       FROM feedback 
       WHERE created_at >= $1`,
      [last24h]
    );
    
    const fbTotal = parseInt(feedbackCheck.rows[0].total) || 0;
    const positive = parseInt(feedbackCheck.rows[0].positive) || 0;
    
    if (fbTotal > 10 && (positive / fbTotal * 100) < 60) {
      alerts.push({
        type: 'negative_feedback',
        severity: 'warning',
        message: `Positive feedback rate dropped to ${(positive / fbTotal * 100).toFixed(1)}% (threshold: 60%)`,
        value: (positive / fbTotal * 100).toFixed(1)
      });
    }
    
    // Check for winning prompt experiment
    const winnerCheck = await query(
      `SELECT pv.version, pv.prompt_type
       FROM prompt_versions pv
       WHERE pv.is_winner = true AND pv.status = 'running'
       LIMIT 1`
    );
    
    if (winnerCheck.rows.length > 0) {
      alerts.push({
        type: 'prompt_winner',
        severity: 'success',
        message: `Prompt ${winnerCheck.rows[0].prompt_type} v${winnerCheck.rows[0].version} is performing as winner`,
        value: winnerCheck.rows[0].version
      });
    }
    
    // Check for model availability issues
    const modelCheck = await query(
      `SELECT model_id, status, success_rate
       FROM model_health
       WHERE success_rate < 95
       LIMIT 3`
    );
    
    for (const model of modelCheck.rows) {
      alerts.push({
        type: 'model_degraded',
        severity: 'critical',
        message: `Model ${model.model_id} success rate is ${parseFloat(model.success_rate).toFixed(1)}%`,
        value: model.success_rate
      });
    }
    
    return alerts;
  } catch (error) {
    logger.error('Failed to get alerts:', error.message);
    return alerts;
  }
}

/**
 * Get real-time stats
 */
async function getRealtimeStats() {
  const last1h = new Date(Date.now() - 60 * 60 * 1000);
  
  try {
    const [generations, users, latency] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM generations WHERE created_at >= $1`, [last1h]),
      query(`SELECT COUNT(DISTINCT user_id) as count FROM generations WHERE created_at >= $1 AND user_id IS NOT NULL`, [last1h]),
      query(`SELECT AVG(latency_ms) as avg FROM generations WHERE created_at >= $1 AND status = 'completed'`, [last1h])
    ]);
    
    return {
      last1Hour: {
        generations: parseInt(generations.rows[0].count) || 0,
        users: parseInt(users.rows[0].count) || 0,
        avgLatencyMs: Math.round(parseFloat(latency.rows[0].avg) || 0)
      }
    };
  } catch (error) {
    logger.error('Failed to get realtime stats:', error.message);
    return { last1Hour: { generations: 0, users: 0, avgLatencyMs: 0 } };
  }
}

module.exports = {
  getDashboardMetrics,
  getFeedbackTrends,
  getFailureAnalysis,
  getPromptPerformance,
  getModelPerformance,
  getCostBreakdown,
  getAlerts,
  getRealtimeStats
};
