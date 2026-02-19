/**
 * Model Router API Routes
 * Phase 5: Endpoints for model routing and cost tracking
 */

const express = require('express');
const router = express.Router();
const { modelRouter, MODEL_CONFIG } = require('../services/modelRouterService');
const logger = require('../services/logger');

// Ensure logger has methods
if (typeof logger.info !== 'function') {
  logger.info = (msg) => console.log('[INFO]', msg);
  logger.error = (msg) => console.error('[ERROR]', msg);
}

/**
 * POST /api/model-router/select
 * Select appropriate model for a request
 */
router.post('/select', async (req, res) => {
  try {
    const { prompt, taskType, userId, promptType } = req.body;
    
    if (!prompt && !taskType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Either prompt or taskType is required' 
      });
    }
    
    const result = await modelRouter.selectModel({
      prompt,
      taskType,
      userId,
      promptType
    });
    
    res.json({ 
      success: true, 
      model: result.model,
      routing: result.routing
    });
  } catch (error) {
    logger.error('Failed to select model:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/model-router/classify
 * Classify task type without selecting model
 */
router.post('/classify', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ 
        success: false, 
        error: 'Prompt is required' 
      });
    }
    
    const taskType = modelRouter.classifyTask(prompt);
    const classification = require('../services/modelRouterService').TASK_CLASSIFICATION[taskType];
    
    res.json({ 
      success: true, 
      taskType,
      classification
    });
  } catch (error) {
    logger.error('Failed to classify task:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/model-router/estimate-cost
 * Estimate cost for a request
 */
router.post('/estimate-cost', async (req, res) => {
  try {
    const { modelId, prompt, inputTokens, outputTokens } = req.body;
    
    // Find model config
    const allModels = [
      ...MODEL_CONFIG.FAST_MODELS,
      ...MODEL_CONFIG.QUALITY_MODELS,
      ...MODEL_CONFIG.EVALUATION_MODELS
    ];
    
    const model = allModels.find(m => m.id === modelId);
    
    if (!model) {
      return res.status(400).json({ 
        success: false, 
        error: 'Unknown model ID' 
      });
    }
    
    let estimation;
    if (prompt) {
      estimation = modelRouter.estimateCost(model, prompt);
    } else if (inputTokens && outputTokens) {
      const inputCost = (inputTokens / 1000) * model.costPer1KInput;
      const outputCost = (outputTokens / 1000) * model.costPer1KOutput;
      estimation = {
        inputTokens,
        outputTokens,
        estimatedCost: inputCost + outputCost
      };
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Either prompt or token counts are required' 
      });
    }
    
    res.json({ 
      success: true, 
      model: model.id,
      estimation
    });
  } catch (error) {
    logger.error('Failed to estimate cost:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/model-router/record-usage
 * Record token usage for a request
 */
router.post('/record-usage', async (req, res) => {
  try {
    const usageData = {
      userId: req.body.userId,
      sessionId: req.body.sessionId,
      requestId: req.body.requestId,
      modelId: req.body.modelId,
      provider: req.body.provider,
      promptType: req.body.promptType,
      inputTokens: req.body.inputTokens || 0,
      outputTokens: req.body.outputTokens || 0,
      costUsd: req.body.costUsd || 0,
      latencyMs: req.body.latencyMs,
      taskType: req.body.taskType,
      routingDecision: req.body.routingDecision,
      failoverUsed: req.body.failoverUsed || false,
      originalModel: req.body.originalModel
    };
    
    await modelRouter.recordTokenUsage(usageData);
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to record usage:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/model-router/models
 * Get available models
 */
router.get('/models', async (req, res) => {
  try {
    const models = {
      fast: MODEL_CONFIG.FAST_MODELS,
      quality: MODEL_CONFIG.QUALITY_MODELS,
      evaluation: MODEL_CONFIG.EVALUATION_MODELS
    };
    
    res.json({ success: true, models });
  } catch (error) {
    logger.error('Failed to get models:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/model-router/models/:id/health
 * Get model health status
 */
router.get('/models/:id/health', async (req, res) => {
  try {
    const health = await modelRouter.getModelHealth(req.params.id);
    
    if (!health) {
      return res.json({ 
        success: true, 
        health: { 
          model_id: req.params.id, 
          status: 'unknown',
          message: 'No health data available'
        } 
      });
    }
    
    res.json({ success: true, health });
  } catch (error) {
    logger.error('Failed to get model health:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/model-router/metrics
 * Get model performance metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await modelRouter.getModelMetrics();
    res.json({ success: true, metrics });
  } catch (error) {
    logger.error('Failed to get metrics:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/model-router/cost-stats
 * Get cost statistics
 */
router.get('/cost-stats', async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;
    
    const stats = await modelRouter.getCostStats(userId, startDate, endDate);
    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Failed to get cost stats:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/model-router/task-classification
 * Get task classification rules
 */
router.get('/task-classification', async (req, res) => {
  try {
    const { TASK_CLASSIFICATION } = require('../services/modelRouterService');
    res.json({ success: true, classification: TASK_CLASSIFICATION });
  } catch (error) {
    logger.error('Failed to get task classification:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
