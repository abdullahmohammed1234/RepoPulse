/**
 * Analytics API Routes
 * Phase 6: Admin & Analytics Dashboard
 */

const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analyticsService');
const logger = require('../services/logger');

// Ensure logger has methods
if (typeof logger.info !== 'function') {
  logger.info = (msg) => console.log('[INFO]', msg);
  logger.error = (msg) => console.error('[ERROR]', msg);
}

/**
 * GET /api/analytics/dashboard
 * Get dashboard overview metrics
 */
router.get('/dashboard', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const metrics = await analyticsService.getDashboardMetrics(days);
    res.json({ success: true, metrics });
  } catch (error) {
    logger.error('Failed to get dashboard metrics:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/analytics/feedback-trends
 * Get feedback trends
 */
router.get('/feedback-trends', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const trends = await analyticsService.getFeedbackTrends(days);
    res.json({ success: true, trends });
  } catch (error) {
    logger.error('Failed to get feedback trends:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/analytics/failures
 * Get failure analysis
 */
router.get('/failures', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const analysis = await analyticsService.getFailureAnalysis(days);
    res.json({ success: true, analysis });
  } catch (error) {
    logger.error('Failed to get failure analysis:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/analytics/prompt-performance
 * Get prompt experiment performance
 */
router.get('/prompt-performance', async (req, res) => {
  try {
    const performance = await analyticsService.getPromptPerformance();
    res.json({ success: true, performance });
  } catch (error) {
    logger.error('Failed to get prompt performance:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/analytics/model-performance
 * Get model performance metrics
 */
router.get('/model-performance', async (req, res) => {
  try {
    const performance = await analyticsService.getModelPerformance();
    res.json({ success: true, performance });
  } catch (error) {
    logger.error('Failed to get model performance:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/analytics/cost
 * Get cost breakdown
 */
router.get('/cost', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const breakdown = await analyticsService.getCostBreakdown(days);
    res.json({ success: true, breakdown });
  } catch (error) {
    logger.error('Failed to get cost breakdown:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/analytics/alerts
 * Get active alerts
 */
router.get('/alerts', async (req, res) => {
  try {
    const alerts = await analyticsService.getAlerts();
    res.json({ success: true, alerts });
  } catch (error) {
    logger.error('Failed to get alerts:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/analytics/realtime
 * Get real-time stats
 */
router.get('/realtime', async (req, res) => {
  try {
    const stats = await analyticsService.getRealtimeStats();
    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Failed to get realtime stats:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
