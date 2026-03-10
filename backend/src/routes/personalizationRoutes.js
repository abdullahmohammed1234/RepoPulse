/**
 * Personalization Routes
 * API endpoints for user preferences
 */

const express = require('express');
const router = express.Router();
const personalizationService = require('../services/personalizationService');

// GET /api/personalization/preferences - Get user preferences
router.get('/preferences', async (req, res, next) => {
  try {
    const userId = req.query.userId || req.user?.id;
    const preferences = await personalizationService.getPreferences(userId);
    res.json({ preferences });
  } catch (error) {
    console.error('Error getting preferences:', error);
    next(error);
  }
});

// PUT /api/personalization/preferences - Set user preferences
router.put('/preferences', async (req, res, next) => {
  try {
    const userId = req.body.userId || req.user?.id;
    const { preferences } = req.body;
    
    if (!preferences) {
      return res.status(400).json({ error: 'preferences is required' });
    }
    
    const result = await personalizationService.setPreferences(userId, preferences);
    res.json({ preferences: result });
  } catch (error) {
    console.error('Error setting preferences:', error);
    next(error);
  }
});

// PATCH /api/personalization/preferences/:key - Update specific preference
router.patch('/preferences/:key', async (req, res, next) => {
  try {
    const userId = req.query.userId || req.user?.id;
    const { key } = req.params;
    const { value } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key and value are required' });
    }
    
    const result = await personalizationService.updatePreference(userId, key, value);
    res.json({ preferences: result });
  } catch (error) {
    console.error('Error updating preference:', error);
    next(error);
  }
});

// GET /api/personalization/dashboard - Get dashboard config
router.get('/dashboard', async (req, res, next) => {
  try {
    const userId = req.query.userId || req.user?.id;
    const config = await personalizationService.getDashboardConfig(userId);
    res.json({ config });
  } catch (error) {
    console.error('Error getting dashboard config:', error);
    next(error);
  }
});

// GET /api/personalization/history - Get personalization history
router.get('/history', async (req, res, next) => {
  try {
    const userId = req.query.userId || req.user?.id;
    const { limit = 10 } = req.query;
    
    const history = await personalizationService.getHistory(userId, parseInt(limit));
    res.json({ history });
  } catch (error) {
    console.error('Error getting history:', error);
    next(error);
  }
});

// POST /api/personalization/record - Record action
router.post('/record', async (req, res, next) => {
  try {
    const userId = req.body.userId || req.user?.id;
    const { action, data } = req.body;
    
    if (!action) {
      return res.status(400).json({ error: 'action is required' });
    }
    
    await personalizationService.recordAction(userId, action, data || {});
    res.json({ success: true });
  } catch (error) {
    console.error('Error recording action:', error);
    next(error);
  }
});

module.exports = router;
