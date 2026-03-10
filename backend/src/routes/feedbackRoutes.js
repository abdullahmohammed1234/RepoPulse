/**
 * Feedback Routes
 * API endpoints for feedback submission and analytics
 * Note: Route order matters - more specific routes must come before parameterized routes
 */

const express = require('express');
const router = express.Router();
const feedbackService = require('../services/feedbackService');
const { v4: uuidv4 } = require('uuid');

// ============================================
// MORE SPECIFIC ROUTES FIRST (no parameters)
// ============================================

// GET /api/feedback/constants - Get feedback constants
router.get('/constants', (req, res) => {
  res.json({
    REASON_CATEGORIES: {
      UNCLEAR: 'unclear',
      INCOMPLETE: 'incomplete',
      INCORRECT: 'incorrect',
      REPETITIVE: 'repetitive',
      TOO_LONG: 'too_long',
      TOO_SHORT: 'too_short',
      IRRELEVANT: 'irrelevant'
    },
    ISSUE_TYPES: {
      UNCLEAR: 'unclear',
      INCOMPLETE: 'incomplete',
      INCORRECT: 'incorrect',
      REPETITIVE: 'repetitive',
      MISSING_CONTEXT: 'missing_context',
      TOO_DETAILED: 'too_detailed'
    },
    SEVERITY: {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      CRITICAL: 'critical'
    }
  });
});

// GET /api/feedback/dashboard - Get aggregated dashboard data
router.get('/dashboard', async (req, res, next) => {
  try {
    const dashboard = await feedbackService.aggregateForDashboard();
    res.json(dashboard);
  } catch (error) {
    console.error('Error getting dashboard:', error);
    next(error);
  }
});

// GET /api/feedback/analytics/summary - Get feedback analytics
router.get('/analytics/summary', async (req, res, next) => {
  try {
    const { startDate, endDate, days } = req.query;
    
    let start, end;
    
    if (days) {
      end = new Date();
      start = new Date(end.getTime() - parseInt(days) * 24 * 60 * 60 * 1000);
    } else if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      // Default: last 30 days
      end = new Date();
      start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    
    const analytics = await feedbackService.getAnalytics(start, end);
    
    res.json({
      analytics,
      period: {
        start,
        end
      }
    });
  } catch (error) {
    console.error('Error getting analytics:', error);
    next(error);
  }
});

// GET /api/feedback/analytics/trends - Get feedback trends over time
router.get('/analytics/trends', async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    
    const trends = await feedbackService.getTrends(parseInt(days));
    
    res.json({
      trends,
      days: parseInt(days)
    });
  } catch (error) {
    console.error('Error getting trends:', error);
    next(error);
  }
});

// GET /api/feedback/analytics/reasons - Get feedback by reason category
router.get('/analytics/reasons', async (req, res, next) => {
  try {
    const { startDate, endDate, days } = req.query;
    
    let start, end;
    
    if (days) {
      end = new Date();
      start = new Date(end.getTime() - parseInt(days) * 24 * 60 * 60 * 1000);
    } else if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      end = new Date();
      start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    
    const reasons = await feedbackService.getByReasonCategory(start, end);
    
    res.json({
      reasons,
      period: { start, end }
    });
  } catch (error) {
    console.error('Error getting reasons:', error);
    next(error);
  }
});

// GET /api/feedback/analytics/sections - Get most edited sections
router.get('/analytics/sections', async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    
    const sections = await feedbackService.getMostEditedSections(parseInt(limit));
    
    res.json({ sections });
  } catch (error) {
    console.error('Error getting sections:', error);
    next(error);
  }
});

// ============================================
// POST ROUTES
// ============================================

// POST /api/feedback - Submit feedback for a generation
router.post('/', async (req, res, next) => {
  try {
    const {
      generationId,
      rating,
      ratingScore,
      reasonCategory,
      reasonDetails,
      sectionFeedback,
      modelUsed,
      tokensUsed,
      latencyMs
    } = req.body;
    
    // Validate required fields
    if (!generationId || rating === undefined) {
      return res.status(400).json({
        error: 'generationId and rating are required'
      });
    }
    
    // Validate rating is boolean
    if (typeof rating !== 'boolean') {
      return res.status(400).json({
        error: 'rating must be a boolean (true for thumbs up, false for thumbs down)'
      });
    }
    
    // Validate rating score if provided
    if (ratingScore !== undefined && (ratingScore < 1 || ratingScore > 5)) {
      return res.status(400).json({
        error: 'ratingScore must be between 1 and 5'
      });
    }
    
    // Get user info from session or generate session ID
    const userId = req.user?.id || null;
    const sessionId = req.sessionID || uuidv4();
    
    // Get client info for analytics
    const userAgent = req.get('user-agent') || null;
    const ipHash = req.ip ? require('crypto').createHash('sha256').update(req.ip).digest('hex') : null;
    
    const result = await feedbackService.submitFeedback({
      generationId,
      userId,
      sessionId,
      rating,
      ratingScore,
      reasonCategory,
      reasonDetails,
      sectionFeedback: sectionFeedback || [],
      modelUsed,
      tokensUsed,
      latencyMs,
      userAgent,
      ipHash
    });
    
    res.status(201).json(result);
  } catch (error) {
    console.error('Error submitting feedback:', error);
    next(error);
  }
});

// ============================================
// PARAMETERIZED ROUTES (must come last)
// ============================================

// GET /api/feedback/:generationId - Get feedback for a generation
router.get('/:generationId', async (req, res, next) => {
  try {
    const { generationId } = req.params;
    
    const feedback = await feedbackService.getFeedbackByGeneration(generationId);
    
    if (!feedback) {
      return res.status(404).json({
        error: 'No feedback found for this generation'
      });
    }
    
    res.json({ feedback });
  } catch (error) {
    console.error('Error getting feedback:', error);
    next(error);
  }
});

// POST /api/feedback/:generationId/edit - Record user edit to generated content
router.post('/:generationId/edit', async (req, res, next) => {
  try {
    const { generationId } = req.params;
    const {
      originalContent,
      editedContent,
      editTimestamp,
      modelUsed,
      tokensUsed,
      latencyMs
    } = req.body;
    
    // Validate required fields
    if (!originalContent || !editedContent) {
      return res.status(400).json({
        error: 'originalContent and editedContent are required'
      });
    }
    
    const userId = req.user?.id || null;
    const sessionId = req.sessionID || uuidv4();
    
    const result = await feedbackService.recordEdit({
      generationId,
      userId,
      sessionId,
      originalContent,
      editedContent,
      editTimestamp: editTimestamp ? new Date(editTimestamp) : new Date(),
      modelUsed,
      tokensUsed,
      latencyMs
    });
    
    res.status(201).json(result);
  } catch (error) {
    console.error('Error recording edit:', error);
    next(error);
  }
});

module.exports = router;
