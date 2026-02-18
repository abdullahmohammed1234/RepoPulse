/**
 * Generation Routes
 * API endpoints for AI-generated content with fallback support
 */

const express = require('express');
const router = express.Router();
const aiGenerationService = require('../services/aiGenerationService');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/db');

// POST /api/generation/repository/:id/summary - Generate repository summary
router.post('/repository/:id/summary', async (req, res, next) => {
  try {
    const repositoryId = parseInt(req.params.id);
    
    if (isNaN(repositoryId)) {
      return res.status(400).json({ error: 'Invalid repository ID' });
    }
    
    const result = await aiGenerationService.generateRepositorySummary(repositoryId);
    
    res.json({
      success: true,
      data: result,
      aiUsed: aiGenerationService.isAIAvailable()
    });
  } catch (error) {
    console.error('Error generating repository summary:', error);
    next(error);
  }
});

// POST /api/generation/pull-request/:id/description - Generate PR description
router.post('/pull-request/:id/description', async (req, res, next) => {
  try {
    const pullRequestId = parseInt(req.params.id);
    
    if (isNaN(pullRequestId)) {
      return res.status(400).json({ error: 'Invalid pull request ID' });
    }
    
    const result = await aiGenerationService.generatePRDescription(pullRequestId);
    
    res.json({
      success: true,
      data: result,
      aiUsed: aiGenerationService.isAIAvailable()
    });
  } catch (error) {
    console.error('Error generating PR description:', error);
    next(error);
  }
});

// POST /api/generation/pull-request/:id/review - Generate code review summary
router.post('/pull-request/:id/review', async (req, res, next) => {
  try {
    const pullRequestId = parseInt(req.params.id);
    
    if (isNaN(pullRequestId)) {
      return res.status(400).json({ error: 'Invalid pull request ID' });
    }
    
    const result = await aiGenerationService.generateCodeReviewSummary(pullRequestId);
    
    res.json({
      success: true,
      data: result,
      aiUsed: aiGenerationService.isAIAvailable()
    });
  } catch (error) {
    console.error('Error generating code review:', error);
    next(error);
  }
});

// POST /api/generation/contributor/:id/insights - Generate contributor insights
router.post('/contributor/:id/insights', async (req, res, next) => {
  try {
    const contributorId = parseInt(req.params.id);
    
    if (isNaN(contributorId)) {
      return res.status(400).json({ error: 'Invalid contributor ID' });
    }
    
    const result = await aiGenerationService.generateContributorInsights(contributorId);
    
    res.json({
      success: true,
      data: result,
      aiUsed: aiGenerationService.isAIAvailable()
    });
  } catch (error) {
    console.error('Error generating contributor insights:', error);
    next(error);
  }
});

// POST /api/generation/custom - Custom AI generation
router.post('/custom', async (req, res, next) => {
  try {
    const { prompt, type, context } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }
    
    const result = await aiGenerationService.generate(prompt, { type, context });
    
    res.json({
      success: true,
      data: result,
      aiUsed: aiGenerationService.isAIAvailable()
    });
  } catch (error) {
    console.error('Error in custom generation:', error);
    next(error);
  }
});

// GET /api/generation/status - Check AI availability
router.get('/status', (req, res) => {
  res.json({
    aiAvailable: aiGenerationService.isAIAvailable(),
    provider: process.env.OPENAI_API_KEY ? 'openai' : 
              process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'none'
  });
});

module.exports = router;
