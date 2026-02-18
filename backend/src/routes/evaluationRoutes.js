/**
 * Evaluation Routes
 * API endpoints for AI self-evaluation
 */

const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const aiEvaluationService = require('../services/aiEvaluationService');

// POST /api/evaluation/evaluate - Evaluate an output
router.post('/evaluate', async (req, res, next) => {
  try {
    const { output, context } = req.body;
    
    if (!output) {
      return res.status(400).json({ error: 'Missing required field: output' });
    }
    
    const result = await aiEvaluationService.evaluateOutput(output, context || {});
    
    // Store evaluation in history
    if (result.evaluation) {
      await query(
        `INSERT INTO evaluation_history (
          generation_id, output_hash, prompt_type,
          clarity_score, completeness_score, structure_score,
          redundancy_score, consistency_score, overall_score,
          evaluation_details, latency_ms, tokens_used
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          context?.generationId || null,
          context?.outputHash || null,
          context?.promptType || 'summary',
          result.evaluation.clarity?.score || null,
          result.evaluation.completeness?.score || null,
          result.evaluation.structure?.score || null,
          result.evaluation.redundancy?.score || null,
          result.evaluation.consistency?.score || null,
          result.evaluation.overall_score || 0,
          JSON.stringify(result.evaluation),
          context?.latencyMs || null,
          context?.tokensUsed || null
        ]
      );
    }
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error evaluating output:', error);
    next(error);
  }
});

// POST /api/evaluation/improve - Improve output based on evaluation
router.post('/improve', async (req, res, next) => {
  try {
    const { output, evaluation, context } = req.body;
    
    if (!output || !evaluation) {
      return res.status(400).json({ 
        error: 'Missing required fields: output and evaluation' 
      });
    }
    
    const result = await aiEvaluationService.improveOutput(output, evaluation, context || {});
    
    // Update evaluation history with improvement
    if (result.improved) {
      await query(
        `UPDATE evaluation_history 
         SET improvement_applied = true, improvement_output = $1
         WHERE generation_id = $2`,
        [result.output, context?.generationId]
      );
    }
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error improving output:', error);
    next(error);
  }
});

// GET /api/evaluation/history - Get evaluation history
router.get('/history', async (req, res, next) => {
  try {
    const { prompt_type, limit = 50 } = req.query;
    
    let sql = 'SELECT * FROM evaluation_history';
    const params = [];
    
    if (prompt_type) {
      sql += ' WHERE prompt_type = $1';
      params.push(prompt_type);
      sql += ' ORDER BY created_at DESC LIMIT $2';
      params.push(parseInt(limit));
    } else {
      sql += ' ORDER BY created_at DESC LIMIT $1';
      params.push(parseInt(limit));
    }
    
    const result = await query(sql, params);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error getting evaluation history:', error);
    next(error);
  }
});

// GET /api/evaluation/stats - Get evaluation statistics
router.get('/stats', async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    
    const result = await query(
      `SELECT 
        COUNT(*) as total_evaluations,
        AVG(overall_score) as avg_score,
        AVG(clarity_score) as avg_clarity,
        AVG(completeness_score) as avg_completeness,
        AVG(structure_score) as avg_structure,
        AVG(redundancy_score) as avg_redundancy,
        AVG(consistency_score) as avg_consistency,
        SUM(CASE WHEN improvement_applied THEN 1 ELSE 0 END) as improvements_made,
        COUNT(DISTINCT prompt_type) as unique_prompt_types
       FROM evaluation_history
       WHERE created_at > NOW() - INTERVAL '${parseInt(days)} days'`
    );
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error getting evaluation stats:', error);
    next(error);
  }
});

// GET /api/evaluation/should-evaluate - Check if evaluation should run
router.post('/should-evaluate', async (req, res, next) => {
  try {
    const { tokens, latencyMs, promptType, promptCreatedAt } = req.body;
    
    const result = await aiEvaluationService.shouldEvaluate({
      tokens: tokens || 0,
      latencyMs: latencyMs || 0,
      promptType: promptType || 'summary',
      promptCreatedAt: promptCreatedAt || Date.now()
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error checking evaluation:', error);
    next(error);
  }
});

module.exports = router;
