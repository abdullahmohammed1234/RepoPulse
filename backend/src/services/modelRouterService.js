/**
 * Multi-Model Routing Service
 * Phase 5: Handles model selection, routing, failover, and cost tracking
 */

const { query, pool } = require('../config/db');
const logger = require('./logger');

// Ensure logger has info method
if (typeof logger.info !== 'function') {
  logger.info = (msg) => console.log('[INFO]', msg);
  logger.warn = (msg) => console.log('[WARN]', msg);
  logger.error = (msg) => console.error('[ERROR]', msg);
}

// Model configuration
const MODEL_CONFIG = {
  // Fast/cheap models for simple tasks
  FAST_MODELS: [
    { 
      id: 'claude-3-haiku',
      provider: 'anthropic',
      contextWindow: 200000,
      costPer1KInput: 0.00025,
      costPer1KOutput: 0.00125,
      avgLatencyMs: 800,
      strengths: ['speed', 'cost', 'simple_queries'],
      weaknesses: ['complex_reasoning', 'long_form']
    },
    {
      id: 'gpt-4o-mini',
      provider: 'openai',
      contextWindow: 128000,
      costPer1KInput: 0.00015,
      costPer1KOutput: 0.0006,
      avgLatencyMs: 600,
      strengths: ['cost', 'fast'],
      weaknesses: ['nuanced_analysis']
    }
  ],
  
  // High-quality models for complex tasks
  QUALITY_MODELS: [
    {
      id: 'claude-3-opus',
      provider: 'anthropic',
      contextWindow: 200000,
      costPer1KInput: 0.015,
      costPer1KOutput: 0.075,
      avgLatencyMs: 3000,
      strengths: ['reasoning', 'analysis', 'long_context'],
      weaknesses: ['cost', 'speed']
    },
    {
      id: 'gpt-4-turbo',
      provider: 'openai',
      contextWindow: 128000,
      costPer1KInput: 0.01,
      costPer1KOutput: 0.03,
      avgLatencyMs: 2500,
      strengths: ['reasoning', 'code'],
      weaknesses: ['cost']
    }
  ],
  
  // Evaluation models
  EVALUATION_MODELS: [
    {
      id: 'claude-3-sonnet',
      provider: 'anthropic',
      contextWindow: 200000,
      costPer1KInput: 0.003,
      costPer1KOutput: 0.015,
      avgLatencyMs: 1500,
      quality: 'medium'
    }
  ]
};

// Task classification
const TASK_CLASSIFICATION = {
  SIMPLE: {
    indicators: ['summary', 'list', 'extract', 'count', 'boolean', 'simple_transformation', 'get', 'fetch', 'retrieve'],
    modelCategory: 'FAST',
    maxTokens: 1000,
    timeoutMs: 5000
  },
  
  COMPLEX: {
    indicators: ['analyze', 'compare', 'evaluate', 'reason', 'explain_complex', 'create_plan', 'generate_strategy', 'deep_dive', 'complex'],
    modelCategory: 'QUALITY',
    maxTokens: 4000,
    timeoutMs: 30000
  },
  
  EVALUATION: {
    indicators: ['evaluate', 'score', 'assess', 'rate', 'review', 'check', 'validate'],
    modelCategory: 'EVALUATION',
    maxTokens: 2000,
    timeoutMs: 10000
  },
  
  CREATIVE: {
    indicators: ['write', 'compose', 'draft', 'generate_content', 'create'],
    modelCategory: 'QUALITY',
    maxTokens: 3000,
    timeoutMs: 20000
  }
};

// Failover chains
const FAILOVER_CHAINS = {
  'claude-3-opus': [
    { model: 'claude-3-sonnet', delay: 0 },
    { model: 'claude-3-haiku', delay: 0 },
    { model: 'gpt-4-turbo', delay: 1000 },
    { model: 'gpt-4o-mini', delay: 1000 }
  ],
  
  'claude-3-sonnet': [
    { model: 'claude-3-haiku', delay: 0 },
    { model: 'gpt-4-turbo', delay: 1000 },
    { model: 'gpt-4o-mini', delay: 1000 }
  ],
  
  'gpt-4-turbo': [
    { model: 'gpt-4o-mini', delay: 0 },
    { model: 'claude-3-sonnet', delay: 1000 },
    { model: 'claude-3-haiku', delay: 1000 }
  ],
  
  'claude-3-haiku': [
    { model: 'gpt-4o-mini', delay: 0 }
  ],
  
  'gpt-4o-mini': [
    { model: 'claude-3-haiku', delay: 0 }
  ]
};

/**
 * Model Router Class
 */
class ModelRouter {
  constructor() {
    this.modelHealth = new Map();
    this.circuitBreakerThreshold = 5;
    this.circuitBreakerResetMs = 60000;
  }
  
  /**
   * Select appropriate model based on task analysis
   */
  async selectModel(request) {
    const { prompt, taskType, userId, promptType } = request;
    
    // Determine task type if not provided
    const classifiedTaskType = taskType || this.classifyTask(prompt);
    const classification = TASK_CLASSIFICATION[classifiedTaskType] || TASK_CLASSIFICATION.COMPLEX;
    
    // Get user budget if available
    const budget = await this.getUserBudget(userId);
    
    // Determine model category
    let modelCategory = classification.modelCategory;
    
    // Apply cost optimization if budget is limited
    if (budget && budget.isLimited) {
      modelCategory = this.selectCostOptimizedCategory(modelCategory);
    }
    
    // Check model availability and get best model
    const model = await this.selectAvailableModel(modelCategory);
    
    // Estimate costs and latency
    const estimatedCost = this.estimateCost(model, prompt);
    const estimatedLatency = model.avgLatencyMs;
    
    return {
      model,
      routing: {
        taskType: classifiedTaskType,
        modelCategory,
        estimatedCost,
        estimatedLatency,
        maxTokens: classification.maxTokens,
        timeoutMs: classification.timeoutMs,
        budgetOptimized: budget?.isLimited || false
      }
    };
  }
  
  /**
   * Classify task based on prompt analysis
   */
  classifyTask(prompt) {
    if (!prompt) return 'SIMPLE';
    
    const promptLower = prompt.toLowerCase();
    
    // Check evaluation indicators first
    for (const indicator of TASK_CLASSIFICATION.EVALUATION.indicators) {
      if (promptLower.includes(indicator)) {
        return 'EVALUATION';
      }
    }
    
    // Check complex indicators
    for (const indicator of TASK_CLASSIFICATION.COMPLEX.indicators) {
      if (promptLower.includes(indicator)) {
        return 'COMPLEX';
      }
    }
    
    // Check creative indicators
    for (const indicator of TASK_CLASSIFICATION.CREATIVE.indicators) {
      if (promptLower.includes(indicator)) {
        return 'CREATIVE';
      }
    }
    
    // Check simple indicators
    for (const indicator of TASK_CLASSIFICATION.SIMPLE.indicators) {
      if (promptLower.includes(indicator)) {
        return 'SIMPLE';
      }
    }
    
    // Default to simple for unknown tasks
    return 'SIMPLE';
  }
  
  /**
   * Select available model from category
   */
  async selectAvailableModel(category) {
    const models = MODEL_CONFIG[`${category}_MODELS`] || MODEL_CONFIG.QUALITY_MODELS;
    
    // Filter by health status
    for (const model of models) {
      const health = await this.getModelHealth(model.id);
      if (health && health.status === 'available') {
        return model;
      }
    }
    
    // If all models in category are unavailable, try any available model
    const allModels = [...MODEL_CONFIG.FAST_MODELS, ...MODEL_CONFIG.QUALITY_MODELS];
    for (const model of allModels) {
      const health = await this.getModelHealth(model.id);
      if (!health || health.status === 'available') {
        return model;
      }
    }
    
    // Fallback to first model in category
    return models[0];
  }
  
  /**
   * Get model health status
   */
  async getModelHealth(modelId) {
    try {
      const result = await query(
        'SELECT * FROM model_health WHERE model_id = $1',
        [modelId]
      );
      return result.rows[0] || null;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Get user budget
   */
  async getUserBudget(userId) {
    if (!userId) return null;
    
    try {
      const result = await query(
        'SELECT * FROM user_budgets WHERE user_id = $1',
        [userId]
      );
      
      if (!result.rows[0]) return null;
      
      const budget = result.rows[0];
      const isLimited = budget.monthly_budget_usd && 
        parseFloat(budget.current_month_usage_usd) >= parseFloat(budget.monthly_budget_usd) * 0.9;
      
      return {
        ...budget,
        isLimited
      };
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Select cost-optimized category
   */
  selectCostOptimizedCategory(category) {
    if (category === 'QUALITY') return 'FAST';
    return category;
  }
  
  /**
   * Estimate cost based on prompt
   */
  estimateCost(model, prompt) {
    const inputTokens = this.estimateTokens(prompt);
    const outputTokens = Math.ceil(inputTokens * 0.5); // Estimate output as 50% of input
    
    const inputCost = (inputTokens / 1000) * model.costPer1KInput;
    const outputCost = (outputTokens / 1000) * model.costPer1KOutput;
    
    return {
      inputTokens,
      outputTokens,
      estimatedCost: inputCost + outputCost
    };
  }
  
  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(text) {
    if (!text) return 0;
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Get failover chain for a model
   */
  getFailoverChain(modelId) {
    return FAILOVER_CHAINS[modelId] || [];
  }
  
  /**
   * Record token usage
   */
  async recordTokenUsage(usageData) {
    const {
      userId,
      sessionId,
      requestId,
      modelId,
      provider,
      promptType,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      taskType,
      routingDecision,
      failoverUsed,
      originalModel
    } = usageData;
    
    try {
      await query(
        `INSERT INTO token_usage 
         (user_id, session_id, request_id, model_id, provider, prompt_type, 
          input_tokens, output_tokens, cost_usd, latency_ms, task_type, routing_decision, 
          failover_used, original_model)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          userId, sessionId, requestId, modelId, provider, promptType,
          inputTokens, outputTokens, costUsd, latencyMs, taskType, routingDecision,
          failoverUsed, originalModel
        ]
      );
      
      // Update daily aggregation
      await this.updateDailyAggregation(userId, modelId, inputTokens, outputTokens, costUsd);
      
      // Update model health
      await this.updateModelHealth(modelId, latencyMs, true);
      
    } catch (error) {
      logger.error('Failed to record token usage:', error.message);
    }
  }
  
  /**
   * Update daily cost aggregation
   */
  async updateDailyAggregation(userId, modelId, inputTokens, outputTokens, costUsd) {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      // Try to update existing record
      const result = await query(
        `INSERT INTO daily_cost_aggregation 
         (date, user_id, total_requests, total_input_tokens, total_output_tokens, total_cost_usd, cost_by_model, tokens_by_model)
         VALUES ($1, $2, 1, $3, $4, $5, $6, $7)
         ON CONFLICT (date, user_id) DO UPDATE SET
           total_requests = daily_cost_aggregation.total_requests + 1,
           total_input_tokens = daily_cost_aggregation.total_input_tokens + $3,
           total_output_tokens = daily_cost_aggregation.total_output_tokens + $4,
           total_cost_usd = daily_cost_aggregation.total_cost_usd + $5`,
        [today, userId, inputTokens, outputTokens, costUsd, 
         JSON.stringify({ [modelId]: costUsd }),
         JSON.stringify({ [modelId]: inputTokens + outputTokens })]
      );
    } catch (error) {
      logger.error('Failed to update daily aggregation:', error.message);
    }
  }
  
  /**
   * Update model health metrics
   */
  async updateModelHealth(modelId, latencyMs, success) {
    try {
      await query(
        `INSERT INTO model_health (model_id, provider, avg_latency_ms, total_requests, failed_requests, status)
         VALUES ($1, $2, $3, 1, $4, 'available')
         ON CONFLICT (model_id) DO UPDATE SET
           avg_latency_ms = COALESCE(
             (model_health.avg_latency_ms * model_health.total_requests + $3) / (model_health.total_requests + 1),
             $3
           ),
           total_requests = model_health.total_requests + 1,
           failed_requests = model_health.failed_requests + $4,
           success_rate = CASE 
             WHEN model_health.total_requests + 1 > 0 
             THEN ((model_health.total_requests + 1 - (model_health.failed_requests + $4))::float / (model_health.total_requests + 1)) * 100 
             ELSE 100 
           END,
           updated_at = CURRENT_TIMESTAMP`,
        [modelId, 'anthropic', latencyMs, success ? 0 : 1]
      );
    } catch (error) {
      logger.error('Failed to update model health:', error.message);
    }
  }
  
  /**
   * Log failover attempt
   */
  async logFailover(requestId, originalModel, fallbackModel, success, errorMessage, failoverTimeMs) {
    try {
      await query(
        `INSERT INTO failover_log (request_id, original_model, fallback_model, success, error_message, failover_time_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [requestId, originalModel, fallbackModel, success, errorMessage, failoverTimeMs]
      );
    } catch (error) {
      logger.error('Failed to log failover:', error.message);
    }
  }
  
  /**
   * Get cost statistics
   */
  async getCostStats(userId, startDate, endDate) {
    let sql = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_requests,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(cost_usd) as total_cost,
        AVG(latency_ms) as avg_latency
      FROM token_usage
      WHERE 1=1
    `;
    const params = [];
    
    if (userId) {
      params.push(userId);
      sql += ` AND user_id = $${params.length}`;
    }
    
    if (startDate) {
      params.push(startDate);
      sql += ` AND created_at >= $${params.length}`;
    }
    
    if (endDate) {
      params.push(endDate);
      sql += ` AND created_at <= $${params.length}`;
    }
    
    sql += ' GROUP BY DATE(created_at) ORDER BY date DESC';
    
    try {
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get cost stats:', error.message);
      return [];
    }
  }
  
  /**
   * Get model performance metrics
   */
  async getModelMetrics() {
    try {
      const result = await query(
        `SELECT 
           model_id,
           provider,
           status,
           avg_latency_ms,
           success_rate,
           total_requests,
           failed_requests,
           circuit_state,
           failure_count
         FROM model_health
         ORDER BY total_requests DESC`
      );
      return result.rows;
    } catch (error) {
      logger.error('Failed to get model metrics:', error.message);
      return [];
    }
  }
}

// Export singleton instance
const modelRouter = new ModelRouter();

module.exports = {
  modelRouter,
  MODEL_CONFIG,
  TASK_CLASSIFICATION,
  FAILOVER_CHAINS
};
