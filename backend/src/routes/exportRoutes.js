/**
 * Export Routes
 * API endpoints for exporting data
 */

const express = require('express');
const router = express.Router();
const exportService = require('../services/exportService');

// GET /api/export/repository/:id - Export repository
router.get('/repository/:id', async (req, res, next) => {
  try {
    const repositoryId = parseInt(req.params.id);
    const format = req.query.format || 'json';
    
    if (isNaN(repositoryId)) {
      return res.status(400).json({ error: 'Invalid repository ID' });
    }
    
    const result = await exportService.exportRepository(repositoryId, format);
    
    if (format === 'json') {
      res.json(result);
    } else if (format === 'csv' || format === 'markdown') {
      res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="repository-${repositoryId}.${format}"`);
      res.send(result.data);
    }
    
  } catch (error) {
    console.error('Export error:', error);
    next(error);
  }
});

// GET /api/export/pull-request/:id - Export PR analysis
router.get('/pull-request/:id', async (req, res, next) => {
  try {
    const pullRequestId = parseInt(req.params.id);
    
    if (isNaN(pullRequestId)) {
      return res.status(400).json({ error: 'Invalid pull request ID' });
    }
    
    const result = await exportService.exportPRAnalysis(pullRequestId);
    res.json(result);
    
  } catch (error) {
    console.error('Export error:', error);
    next(error);
  }
});

module.exports = router;
