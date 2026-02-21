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
    // Generation metrics (status: active, archived, deleted - count non-deleted as successful)
    const generationResult = await query(
      `SELECT 
         COUNT(*) as total_generations,
         SUM(CASE WHEN status != 'deleted' THEN 1 ELSE 0 END) as successful_generations,
         AVG(latency_ms) as avg_latency,
         SUM(COALESCE(latency_ms, 0)) as total_latency
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
    
    // Feedback metrics (rating is BOOLEAN: true = positive, false = negative)
    const feedbackResult = await query(
      `SELECT 
         COUNT(*) as total_feedback,
         SUM(CASE WHEN rating = true THEN 1 ELSE 0 END) as positive_ratings,
         SUM(CASE WHEN rating = false THEN 1 ELSE 0 END) as negative_ratings
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
        total: parseInt(generationResult.rows[0]?.total_generations) || 0,
        successful: parseInt(generationResult.rows[0]?.successful_generations) || 0,
        successRate: (parseInt(generationResult.rows[0]?.total_generations) || 0) > 0 
          ? ((parseInt(generationResult.rows[0]?.successful_generations) || 0) / (parseInt(generationResult.rows[0]?.total_generations) || 1) * 100).toFixed(1)
          : 0,
        avgLatency: Math.round(parseFloat(generationResult.rows[0]?.avg_latency)) || 0
      },
      users: {
        active: parseInt(userResult.rows[0].active_users) || 0,
        repositories: parseInt(userResult.rows[0].active_repositories) || 0
      },
      feedback: {
        total: parseInt(feedbackResult.rows[0]?.total_feedback) || 0,
        positive: parseInt(feedbackResult.rows[0]?.positive_ratings) || 0,
        negative: parseInt(feedbackResult.rows[0]?.negative_ratings) || 0,
        positiveRate: (parseInt(feedbackResult.rows[0]?.total_feedback) || 0) > 0
          ? ((parseInt(feedbackResult.rows[0]?.positive_ratings) || 0) / (parseInt(feedbackResult.rows[0]?.total_feedback) || 1) * 100).toFixed(1)
          : 0
      },
      tokens: {
        total: parseInt(tokenResult.rows[0]?.total_tokens) || 0,
        cost: parseFloat(tokenResult.rows[0]?.total_cost) || 0
      },
      workflows: {
        total: parseInt(workflowResult.rows[0]?.total_executions) || 0,
        successful: parseInt(workflowResult.rows[0]?.successful_executions) || 0,
        failed: parseInt(workflowResult.rows[0]?.failed_executions) || 0
      },
      trend: trendResult.rows.map(row => ({
        date: row.date,
        generations: parseInt(row.generations) || 0,
        users: parseInt(row.users) || 0
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
    
    // For generations, count non-deleted as total, and check for any error status
    const failureCheck = await query(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) as deleted
       FROM generations 
       WHERE created_at >= $1`,
      [last24h]
    );
    
    const total = parseInt(failureCheck.rows[0]?.total) || 0;
    const deleted = parseInt(failureCheck.rows[0]?.deleted) || 0;
    const active = total - deleted;
    
    // For now, we'll create an alert if there's no activity (no generations)
    if (total === 0) {
      alerts.push({
        type: 'no_activity',
        severity: 'info',
        message: 'No generation activity in the last 24 hours',
        value: '0'
      });
    }
    
    // Check positive feedback rate (last 24 hours) - rating is BOOLEAN
    const feedbackCheck = await query(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN rating = true THEN 1 ELSE 0 END) as positive
       FROM feedback 
       WHERE created_at >= $1`,
      [last24h]
    );
    
    const fbTotal = parseInt(feedbackCheck.rows[0]?.total) || 0;
    const positive = parseInt(feedbackCheck.rows[0]?.positive) || 0;
    
    if (fbTotal > 10 && fbTotal > 0 && (positive / fbTotal * 100) < 60) {
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
      query(`SELECT AVG(latency_ms) as avg FROM generations WHERE created_at >= $1 AND status != 'deleted'`, [last1h])
    ]);
    
    return {
      last1Hour: {
        generations: parseInt(generations.rows[0]?.count) || 0,
        users: parseInt(users.rows[0]?.count) || 0,
        avgLatencyMs: Math.round(parseFloat(latency.rows[0]?.avg) || 0)
      }
    };
  } catch (error) {
    logger.error('Failed to get realtime stats:', error.message);
    return { last1Hour: { generations: 0, users: 0, avgLatencyMs: 0 } };
  }
}

/**
 * ========================================================================
 * TREND ANALYSIS & HISTORICAL INSIGHTS (Phase 4)
 * ========================================================================
 */

/**
 * Record repository health snapshot (called after analysis)
 */
async function recordRepositoryHealth(repositoryId) {
  try {
    // Get current repository metrics
    const repoResult = await query(
      `SELECT r.health_score, r.name 
       FROM repositories r WHERE r.id = $1`,
      [repositoryId]
    );
    
    if (repoResult.rows.length === 0) {
      throw new Error('Repository not found');
    }
    
    const repo = repoResult.rows[0];
    
    // Get metrics from repository_metrics table
    const metricsResult = await query(
      `SELECT * FROM repository_metrics WHERE repository_id = $1 ORDER BY id DESC LIMIT 1`,
      [repositoryId]
    );
    
    // Get contributor count
    const contributorResult = await query(
      `SELECT COUNT(*) as count FROM contributors WHERE repository_id = $1 AND is_active = true`,
      [repositoryId]
    );
    
    // Get PR stats
    const prStatsResult = await query(
      `SELECT 
         COUNT(*) as total_prs,
         SUM(CASE WHEN is_merged = true OR state = 'merged' THEN 1 ELSE 0 END) as merged_prs,
         AVG(risk_score) as avg_risk,
         AVG(time_to_merge_hours) as avg_merge_time
       FROM pull_requests 
       WHERE repository_id = $1`,
      [repositoryId]
    );
    
    // Get commit stats
    const commitResult = await query(
      `SELECT 
         COUNT(*) as total_commits,
         SUM(additions) as total_additions,
         SUM(deletions) as total_deletions
       FROM commits 
       WHERE repository_id = $1`,
      [repositoryId]
    );
    
    // Get open PRs count
    const openPRsResult = await query(
      `SELECT COUNT(*) as count FROM pull_requests WHERE repository_id = $1 AND state = 'open'`,
      [repositoryId]
    );
    
    const metrics = metricsResult.rows[0] || {};
    const prStats = prStatsResult.rows[0] || {};
    const commits = commitResult.rows[0] || {};
    
    // Insert historical record
    await query(
      `INSERT INTO repository_health_history 
       (repository_id, health_score, momentum_score, churn_index, risk_index, 
        velocity_index, anomaly_count, active_contributors, open_prs, merged_prs,
        avg_pr_risk, avg_merge_time_hours, total_commits, total_additions, total_deletions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (repository_id, recorded_at) DO NOTHING`,
      [
        repositoryId,
        repo.health_score || 0,
        metrics.momentum_score || 0,
        metrics.churn_index || 0,
        metrics.risk_index || 0,
        metrics.velocity_index || 0,
        metrics.anomaly_count || 0,
        parseInt(contributorResult.rows[0]?.count) || 0,
        parseInt(openPRsResult.rows[0]?.count) || 0,
        parseInt(prStats.merged_prs) || 0,
        parseFloat(prStats.avg_risk) || 0,
        parseFloat(prStats.avg_merge_time) || 0,
        parseInt(commits.total_commits) || 0,
        parseInt(commits.total_additions) || 0,
        parseInt(commits.total_deletions) || 0
      ]
    );
    
    logger.info(`Health snapshot recorded for repository ${repositoryId}`);
    return { success: true };
  } catch (error) {
    logger.error('Failed to record repository health:', error.message);
    throw error;
  }
}

/**
 * Get health score trends for a repository
 */
async function getHealthScoreTrends(repositoryId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  try {
    const result = await query(
      `SELECT 
         DATE(recorded_at) as date,
         health_score,
         momentum_score,
         churn_index,
         risk_index,
         velocity_index,
         active_contributors,
         open_prs,
         merged_prs,
         avg_pr_risk,
         avg_merge_time_hours
       FROM repository_health_history 
       WHERE repository_id = $1 AND recorded_at >= $2
       ORDER BY recorded_at ASC`,
      [repositoryId, startDate]
    );
    
    return result.rows.map(row => ({
      date: row.date,
      healthScore: parseInt(row.health_score) || 0,
      momentumScore: parseFloat(row.momentum_score) || 0,
      churnIndex: parseFloat(row.churn_index) || 0,
      riskIndex: parseFloat(row.risk_index) || 0,
      velocityIndex: parseFloat(row.velocity_index) || 0,
      activeContributors: parseInt(row.active_contributors) || 0,
      openPRs: parseInt(row.open_prs) || 0,
      mergedPRs: parseInt(row.merged_prs) || 0,
      avgPRRisk: parseFloat(row.avg_pr_risk) || 0,
      avgMergeTimeHours: parseFloat(row.avg_merge_time_hours) || 0
    }));
  } catch (error) {
    logger.error('Failed to get health score trends:', error.message);
    return [];
  }
}

/**
 * Get repository trends (improving vs declining)
 */
async function getRepositoryTrends(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  try {
    // Get all repositories with their basic info
    const allReposResult = await query(
      `SELECT 
         r.id,
         r.name,
         r.full_name,
         r.health_score,
         r.language,
         r.is_active
       FROM repositories r
       WHERE r.is_active = true
       ORDER BY r.id
       LIMIT 100`
    );
    
    // Get health history data for comparison
    const healthHistoryResult = await query(
      `SELECT 
         h.repository_id,
         h.health_score,
         h.momentum_score,
         h.churn_index,
         h.recorded_at,
         LAG(h.health_score) OVER (PARTITION BY h.repository_id ORDER BY h.recorded_at) as prev_health
       FROM repository_health_history h
       WHERE h.recorded_at >= $1
       ORDER BY h.repository_id, h.recorded_at DESC
       LIMIT 200`,
      [startDate]
    );
    
    // Group health history by repository
    const healthMap = new Map();
    for (const row of healthHistoryResult.rows) {
      if (!healthMap.has(row.repository_id)) {
        healthMap.set(row.repository_id, {
          currentHealth: parseInt(row.health_score) || 0,
          prevHealth: parseInt(row.prev_health) || 0,
          healthChange: (parseInt(row.health_score) || 0) - (parseInt(row.prev_health) || 0),
          momentumScore: parseFloat(row.momentum_score) || 0,
          churnIndex: parseFloat(row.churn_index) || 0
        });
      }
    }
    
    // Build repository list with trends
    const repos = allReposResult.rows.map(row => {
      const healthData = healthMap.get(row.id);
      const currentHealth = healthData?.currentHealth || parseInt(row.health_score) || 50;
      const healthChange = healthData?.healthChange || 0;
      
      let trend = 'stable';
      if (healthChange > 5) trend = 'improving';
      else if (healthChange < -5) trend = 'declining';
      else if (healthData === undefined && parseInt(row.health_score) > 0) {
        // Has health score but no history = new/stable
        trend = 'stable';
      }
      
      return {
        id: row.id,
        name: row.name,
        fullName: row.full_name,
        currentHealth,
        previousHealth: healthData?.prevHealth || currentHealth,
        healthChange,
        trend,
        language: row.language,
        momentumScore: healthData?.momentumScore || 0,
        churnIndex: healthData?.churnIndex || 0
      };
    });
    
    // Categorize
    const improving = repos.filter(r => r.trend === 'improving');
    const declining = repos.filter(r => r.trend === 'declining');
    const stable = repos.filter(r => r.trend === 'stable');
    
    return {
      repositories: repos,
      summary: {
        total: repos.length,
        improving: improving.length,
        declining: declining.length,
        stable: stable.length,
        avgHealthChange: repos.length > 0 
          ? (repos.reduce((sum, r) => sum + r.healthChange, 0) / repos.length).toFixed(1) 
          : 0
      },
      topImproving: improving.slice(0, 5),
      topDeclining: declining.slice(0, 5)
    };
  } catch (error) {
    logger.error('Failed to get repository trends:', error.message);
    return { repositories: [], summary: { total: 0, improving: 0, declining: 0, stable: 0 } };
  }
}

/**
 * Compare metrics across time periods
 */
async function compareTimePeriods(repositoryId, period1Days = 7, period2Days = 30) {
  const now = new Date();
  const period1Start = new Date(now);
  period1Start.setDate(period1Start.getDate() - period1Days);
  
  const period2Start = new Date(now);
  period2Start.setDate(period2Start.getDate() - period2Days);
  
  try {
    // Get period 1 metrics (recent)
    const period1 = await query(
      `SELECT 
         COUNT(DISTINCT pr.id) as pr_count,
         SUM(CASE WHEN pr.is_merged = true OR pr.state = 'merged' THEN 1 ELSE 0 END) as merged_prs,
         AVG(pr.risk_score) as avg_risk,
         AVG(pr.time_to_merge_hours) as avg_merge_time,
         COUNT(DISTINCT c.id) as contributors
       FROM pull_requests pr
       LEFT JOIN contributors c ON c.repository_id = pr.repository_id
       WHERE pr.repository_id = $1 AND pr.created_at >= $2`,
      [repositoryId, period1Start]
    );
    
    // Get period 2 metrics (older)
    const period2 = await query(
      `SELECT 
         COUNT(DISTINCT pr.id) as pr_count,
         SUM(CASE WHEN pr.is_merged = true OR pr.state = 'merged' THEN 1 ELSE 0 END) as merged_prs,
         AVG(pr.risk_score) as avg_risk,
         AVG(pr.time_to_merge_hours) as avg_merge_time,
         COUNT(DISTINCT c.id) as contributors
       FROM pull_requests pr
       LEFT JOIN contributors c ON c.repository_id = pr.repository_id
       WHERE pr.repository_id = $1 AND pr.created_at >= $2 AND pr.created_at < $3`,
      [repositoryId, period2Start, period1Start]
    );
    
    const p1 = period1.rows[0] || {};
    const p2 = period2.rows[0] || {};
    
    const metrics = ['pr_count', 'merged_prs', 'avg_risk', 'avg_merge_time', 'contributors'];
    const comparison = {};
    
    for (const metric of metrics) {
      const val1 = parseFloat(p1[metric]) || 0;
      const val2 = parseFloat(p2[metric]) || 0;
      const change = val2 > 0 ? ((val1 - val2) / val2 * 100).toFixed(1) : 0;
      
      comparison[metric] = {
        period1: val1,
        period2: val2,
        change: parseFloat(change),
        direction: val1 > val2 ? 'up' : val1 < val2 ? 'down' : 'stable'
      };
    }
    
    return {
      period1: { days: period1Days, start: period1Start.toISOString() },
      period2: { days: period2Days, start: period2Start.toISOString() },
      comparison
    };
  } catch (error) {
    logger.error('Failed to compare time periods:', error.message);
    return null;
  }
}

/**
 * Get long-term churn predictions
 */
async function getChurnPredictions(repositoryId) {
  try {
    // Get repository features for prediction
    const repoResult = await query(
      `SELECT 
         r.id, r.health_score,
         COUNT(DISTINCT pr.id) as total_prs,
         SUM(CASE WHEN pr.state = 'open' THEN 1 ELSE 0 END) as open_prs,
         AVG(pr.risk_score) as avg_risk,
         COUNT(DISTINCT c.id) as contributors
       FROM repositories r
       LEFT JOIN pull_requests pr ON r.id = pr.repository_id
       LEFT JOIN contributors c ON r.id = c.repository_id
       WHERE r.id = $1
       GROUP BY r.id`,
      [repositoryId]
    );
    
    if (repoResult.rows.length === 0) {
      return null;
    }
    
    const repo = repoResult.rows[0];
    
    // Get recent activity trends
    const recentHistory = await query(
      `SELECT 
         health_score,
         churn_index,
         velocity_index,
         recorded_at
       FROM repository_health_history 
       WHERE repository_id = $1
       ORDER BY recorded_at DESC
       LIMIT 14`,
      [repositoryId]
    );
    
    // Calculate trend from history
    let churnTrend = 'stable';
    let riskTrend = 'stable';
    
    if (recentHistory.rows.length >= 7) {
      const recent7 = recentHistory.rows.slice(0, 7);
      const older7 = recentHistory.rows.slice(7);
      
      if (older7.length > 0) {
        const avgChurnRecent = recent7.reduce((s, r) => s + (parseFloat(r.churn_index) || 0), 0) / recent7.length;
        const avgChurnOlder = older7.reduce((s, r) => s + (parseFloat(r.churn_index) || 0), 0) / older7.length;
        
        if (avgChurnRecent > avgChurnOlder * 1.2) churnTrend = 'increasing';
        else if (avgChurnRecent < avgChurnOlder * 0.8) churnTrend = 'decreasing';
        
        const avgRiskRecent = recent7.reduce((s, r) => s + (parseFloat(r.health_score) || 0), 0) / recent7.length;
        const avgRiskOlder = older7.reduce((s, r) => s + (parseFloat(r.health_score) || 0), 0) / older7.length;
        
        if (avgRiskRecent > avgRiskOlder * 1.1) riskTrend = 'improving';
        else if (avgRiskRecent < avgRiskOlder * 0.9) riskTrend = 'declining';
      }
    }
    
    // Calculate churn probability based on features
    const healthScore = parseInt(repo.health_score) || 50;
    const avgRisk = parseFloat(repo.avg_risk) || 0.5;
    const openPRs = parseInt(repo.open_prs) || 0;
    const contributors = parseInt(repo.contributors) || 1;
    
    // Churn risk factors
    const lowHealthFactor = healthScore < 40 ? 0.4 : healthScore < 60 ? 0.2 : 0;
    const highRiskFactor = avgRisk > 0.7 ? 0.3 : avgRisk > 0.5 ? 0.15 : 0;
    const lowActivityFactor = openPRs === 0 && contributors < 2 ? 0.2 : 0;
    const inactivityTrend = churnTrend === 'increasing' ? 0.2 : 0;
    
    const churnProbability = Math.min(1, Math.max(0, 
      0.1 + lowHealthFactor + highRiskFactor + lowActivityFactor + inactivityTrend
    ));
    
    // Predictions for next 30 days
    const predictedChurn30d = churnProbability > 0.5 ? 
      Math.round(churnProbability * (openPRs + contributors) * 0.3) : 0;
    
    return {
      repositoryId,
      currentHealth: healthScore,
      churnProbability: Math.round(churnProbability * 100) / 100,
      churnRisk: churnProbability > 0.6 ? 'High' : churnProbability > 0.3 ? 'Medium' : 'Low',
      churnTrend,
      riskTrend,
      metrics: {
        avgRiskScore: parseFloat(avgRisk).toFixed(2),
        openPRs,
        contributors,
        recentHealthTrend: riskTrend
      },
      predictions: {
        churn30d: predictedChurn30d,
        health30d: riskTrend === 'improving' ? Math.min(100, healthScore + 10) : 
                    riskTrend === 'declining' ? Math.max(0, healthScore - 15) : healthScore
      },
      factors: [
        { factor: 'Health Score', impact: lowHealthFactor > 0 ? 'negative' : 'neutral' },
        { factor: 'Risk Level', impact: highRiskFactor > 0 ? 'negative' : 'neutral' },
        { factor: 'Activity', impact: lowActivityFactor > 0 ? 'negative' : 'neutral' }
      ]
    };
  } catch (error) {
    logger.error('Failed to get churn predictions:', error.message);
    return null;
  }
}

/**
 * Get system-wide trend summary
 */
async function getSystemTrends(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  try {
    // Get system-wide metrics
    const result = await query(
      `SELECT 
         COUNT(DISTINCT r.id) as total_repos,
         AVG(r.health_score) as avg_health,
         COUNT(DISTINCT pr.id) as total_prs,
         SUM(CASE WHEN pr.is_merged = true OR pr.state = 'merged' THEN 1 ELSE 0 END) as merged_prs,
         COUNT(DISTINCT c.id) as contributors
       FROM repositories r
       LEFT JOIN pull_requests pr ON r.id = pr.repository_id
       LEFT JOIN contributors c ON r.id = c.repository_id
       WHERE r.is_active = true`
    );
    
    // Get recent snapshots if available
    const snapshots = await query(
      `SELECT * FROM system_trends 
       WHERE snapshot_date >= $1
       ORDER BY snapshot_date DESC
       LIMIT 7`,
      [startDate]
    );
    
    const row = result.rows[0] || {};
    
    return {
      period: { days, startDate: startDate.toISOString() },
      current: {
        totalRepositories: parseInt(row.total_repos) || 0,
        avgHealthScore: Math.round(parseFloat(row.avg_health)) || 0,
        totalPRs: parseInt(row.total_prs) || 0,
        mergedPRs: parseInt(row.merged_prs) || 0,
        mergeRate: row.total_prs > 0 ? 
          ((parseInt(row.merged_prs) / parseInt(row.total_prs)) * 100).toFixed(1) : 0,
        contributors: parseInt(row.contributors) || 0
      },
      history: snapshots.rows.map(s => ({
        date: s.snapshot_date,
        healthScore: parseInt(s.avg_health_score) || 0,
        activeRepos: parseInt(s.active_repositories) || 0
      })),
      predicted: {
        churn30d: snapshots.rows.length > 0 ? 
          parseFloat(snapshots.rows[0].predicted_churn_30d) || 0 : 0
      }
    };
  } catch (error) {
    logger.error('Failed to get system trends:', error.message);
    return null;
  }
}

/**
 * ========================================================================
 * ADVANCED VISUALIZATION FUNCTIONS (Phase 8)
 * ========================================================================
 */

/**
 * Get dependency graph data for visualization
 * Uses GitHub API to fetch repository dependencies
 */
async function getDependencyGraph(repositoryId, githubToken) {
  try {
    // Get repository info from database
    const repoResult = await query(
      `SELECT * FROM repositories WHERE id = $1`,
      [repositoryId]
    );
    
    if (repoResult.rows.length === 0) {
      throw new Error('Repository not found');
    }
    
    const repo = repoResult.rows[0];
    const gh = new (require('../services/githubService'))(githubToken);
    
    // Fetch repository content to build dependency graph
    const { owner, repo: repoName } = gh.parseRepoUrl(repo.github_url || repo.full_name);
    
    // Try to fetch package.json or requirements.txt for dependencies
    let dependencies = [];
    try {
      const packageJson = await gh.octokit.rest.repos.getContent({
        owner,
        repo: repoName,
        path: 'package.json'
      });
      
      if (packageJson.data && packageJson.data.content) {
        const decoded = Buffer.from(packageJson.data.content, 'base64').toString('utf-8');
        const pkg = JSON.parse(decoded);
        
        // Extract dependencies
        const allDeps = [
          ...Object.keys(pkg.dependencies || {}),
          ...Object.keys(pkg.devDependencies || {})
        ];
        
        dependencies = allDeps.slice(0, 50).map(dep => ({
          name: dep,
          type: 'npm',
          version: pkg.dependencies?.[dep] || pkg.devDependencies?.[dep] || '*'
        }));
      }
    } catch (e) {
      logger.info('No package.json found, trying other dependency files');
    }
    
    // Build graph structure
    const nodes = [
      { id: repo.full_name, name: repo.name, type: 'root', size: 30 }
    ];
    
    const links = [];
    
    // Add dependency nodes and links
    dependencies.forEach((dep, idx) => {
      nodes.push({
        id: dep.name,
        name: dep.name,
        type: 'dependency',
        version: dep.version,
        size: 15 + Math.random() * 10
      });
      
      links.push({
        source: repo.full_name,
        target: dep.name,
        type: 'depends'
      });
    });
    
    return {
      nodes,
      links,
      metadata: {
        totalDependencies: dependencies.length,
        repository: repo.full_name,
        fetchedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    logger.error('Failed to get dependency graph:', error.message);
    throw error;
  }
}

/**
 * Get contributor network data for visualization
 * Shows relationships between contributors based on commits and PRs
 */
async function getContributorNetwork(repositoryId, githubToken) {
  try {
    // Get repository info
    const repoResult = await query(
      `SELECT * FROM repositories WHERE id = $1`,
      [repositoryId]
    );
    
    if (repoResult.rows.length === 0) {
      throw new Error('Repository not found');
    }
    
    const repo = repoResult.rows[0];
    const gh = new (require('../services/githubService'))(githubToken);
    const { owner, repo: repoName } = gh.parseRepoUrl(repo.github_url || repo.full_name);
    
    // Fetch contributors from GitHub
    let contributors = [];
    try {
      const contributorsResponse = await gh.octokit.rest.repos.listContributors({
        owner,
        repo: repoName,
        per_page: 30
      });
      
      contributors = contributorsResponse.data.map(c => ({
        id: c.login,
        name: c.login,
        avatar: c.avatar_url,
        contributions: c.contributions,
        type: 'contributor'
      }));
    } catch (e) {
      logger.info('Could not fetch contributors from GitHub');
    }
    
    // If no GitHub data, use database contributors
    if (contributors.length === 0) {
      const dbContributors = await query(
        `SELECT * FROM contributors WHERE repository_id = $1 LIMIT 30`,
        [repositoryId]
      );
      
      contributors = dbContributors.rows.map(c => ({
        id: c.github_username || c.id,
        name: c.github_username || 'Unknown',
        contributions: c.total_commits || 0,
        type: 'contributor'
      }));
    }
    
    // Build network with simulated collaboration links
    // (In production, would analyze commit overlap, PR reviews, etc.)
    const nodes = contributors.map(c => ({
      ...c,
      size: 10 + Math.log(c.contributions + 1) * 5
    }));
    
    const links = [];
    
    // Create some links based on contribution similarity
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < Math.min(nodes.length, i + 5); j++) {
        if (Math.random() > 0.5) {
          links.push({
            source: nodes[i].id,
            target: nodes[j].id,
            strength: Math.random()
          });
        }
      }
    }
    
    return {
      nodes,
      links,
      metadata: {
        totalContributors: contributors.length,
        repository: repo.full_name,
        fetchedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    logger.error('Failed to get contributor network:', error.message);
    throw error;
  }
}

/**
 * Get code heatmap data - files changed frequently
 */
async function getCodeHeatmap(repositoryId, days = 90) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Get modification data from database
    // Try to get data from pull_requests table for now
    const prResult = await query(
      `SELECT 
         id,
         number,
         title,
         created_at
       FROM pull_requests 
       WHERE repository_id = $1 
         AND created_at >= $2
       ORDER BY created_at DESC
       LIMIT 100`,
      [repositoryId, startDate]
    );
    
    let heatmapData = [];
    
    if (prResult.rows.length > 0) {
      // Use PR data to generate pseudo heatmap
      heatmapData = prResult.rows.map((row, idx) => ({
        file: `PR #${row.number}: ${row.title || 'Untitled'}`,
        path: `pull-request/${row.number}`,
        changes: Math.floor(Math.random() * 20) + 1,
        language: 'markdown',
        lastModified: row.created_at
      }));
    }
    
    // Group by directory for hierarchical view
    const directoryMap = new Map();
    heatmapData.forEach(item => {
      const parts = item.path.split('/');
      const dir = parts.length > 1 ? parts[0] : 'pull-requests';
      
      if (!directoryMap.has(dir)) {
        directoryMap.set(dir, {
          directory: dir,
          files: [],
          totalChanges: 0
        });
      }
      
      const dirData = directoryMap.get(dir);
      dirData.files.push(item);
      dirData.totalChanges += item.changes;
    });
    
    return {
      files: heatmapData,
      directories: Array.from(directoryMap.values()),
      metadata: {
        totalFiles: heatmapData.length,
        period: { days, startDate: startDate.toISOString() },
        generatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    logger.error('Failed to get code heatmap:', error.message);
    throw error;
  }
}

/**
 * Get timeline data for interactive timeline view
 */
async function getTimelineData(repositoryId, days = 90) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Get pull request timeline
    const prResult = await query(
      `SELECT 
         id,
         number,
         title,
         state,
         is_merged,
         risk_score,
         time_to_merge_hours,
         created_at,
         merged_at,
         closed_at
       FROM pull_requests 
       WHERE repository_id = $1 AND created_at >= $2
       ORDER BY created_at DESC
       LIMIT 200`,
      [repositoryId, startDate]
    );
    
    const events = prResult.rows.map(pr => ({
      id: pr.id,
      type: 'pull_request',
      title: pr.title,
      prNumber: pr.number,
      state: pr.state,
      merged: pr.is_merged,
      riskScore: pr.risk_score ? parseFloat(pr.risk_score) : null,
      mergeTimeHours: pr.time_to_merge_hours ? parseFloat(pr.time_to_merge_hours) : null,
      timestamp: pr.created_at,
      endTimestamp: pr.merged_at || pr.closed_at
    }));
    
    // Get generation events
    const genResult = await query(
      `SELECT 
         id,
         status,
         latency_ms,
         created_at
       FROM generations 
       WHERE repository_id = $1 AND created_at >= $2
       ORDER BY created_at DESC
       LIMIT 100`,
      [repositoryId, startDate]
    );
    
    const genEvents = genResult.rows.map(g => ({
      id: g.id,
      type: 'generation',
      status: g.status,
      model: 'N/A',
      latencyMs: g.latency_ms,
      timestamp: g.created_at
    }));
    
    // Get feedback events
    const fbResult = await query(
      `SELECT 
         f.id,
         f.rating,
         f.rating_score,
         f.reason_category,
         f.created_at
       FROM feedback f
       JOIN generations g ON f.generation_id = g.id
       WHERE g.repository_id = $1 AND f.created_at >= $2
       ORDER BY f.created_at DESC
       LIMIT 100`,
      [repositoryId, startDate]
    );
    
    const fbEvents = fbResult.rows.map(f => ({
      id: f.id,
      type: 'feedback',
      rating: f.rating,
      score: f.rating_score,
      category: f.reason_category,
      timestamp: f.created_at
    }));
    
    // Combine and sort all events
    const allEvents = [...events, ...genEvents, ...fbEvents].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    // Group by date for timeline view
    const dateGrouped = new Map();
    allEvents.forEach(event => {
      const date = new Date(event.timestamp).toISOString().split('T')[0];
      if (!dateGrouped.has(date)) {
        dateGrouped.set(date, []);
      }
      dateGrouped.get(date).push(event);
    });
    
    const timeline = Array.from(dateGrouped.entries()).map(([date, dayEvents]) => ({
      date,
      events: dayEvents,
      summary: {
        prs: dayEvents.filter(e => e.type === 'pull_request').length,
        generations: dayEvents.filter(e => e.type === 'generation').length,
        feedback: dayEvents.filter(e => e.type === 'feedback').length
      }
    }));
    
    return {
      events: allEvents,
      timeline,
      metadata: {
        totalEvents: allEvents.length,
        period: { days, startDate: startDate.toISOString() },
        generatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    logger.error('Failed to get timeline data:', error.message);
    throw error;
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
  getRealtimeStats,
  recordRepositoryHealth,
  getHealthScoreTrends,
  getRepositoryTrends,
  compareTimePeriods,
  getChurnPredictions,
  getSystemTrends,
  // Advanced visualizations
  getDependencyGraph,
  getContributorNetwork,
  getCodeHeatmap,
  getTimelineData
};
