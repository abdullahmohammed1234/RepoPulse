/**
 * Prompt Experiment Routes
 * API endpoints for A/B prompt experimentation
 */

const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { PromptRouter, ExperimentAnalyzer, WinnerSelector, WINNER_DECISION_RULES } = require('../services/promptRouterService');

// Initialize services
const promptRouter = new PromptRouter();
const experimentAnalyzer = new ExperimentAnalyzer();
const winnerSelector = new WinnerSelector();

// GET /api/prompt-experiments - List all prompt experiments
router.get('/', async (req, res, next) => {
  try {
    const { prompt_type, status } = req.query;
    
    let sql = 'SELECT * FROM prompt_versions';
    const params = [];
    const conditions = [];
    
    if (prompt_type) {
      conditions.push(`prompt_type = $${params.length + 1}`);
      params.push(prompt_type);
    }
    
    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const result = await query(sql, params);
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error listing prompt experiments:', error);
    next(error);
  }
});

// GET /api/prompt-experiments/:id - Get specific prompt version
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      'SELECT * FROM prompt_versions WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prompt version not found' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error getting prompt version:', error);
    next(error);
  }
});

// POST /api/prompt-experiments - Create new prompt version
router.post('/', async (req, res, next) => {
  try {
    const {
      prompt_type,
      version,
      system_prompt,
      user_prompt_template,
      few_shot_examples = [],
      description,
      changelog,
      parent_version_id,
      traffic_allocation = 0,
      is_control = false,
      created_by
    } = req.body;
    
    if (!prompt_type || !version || !system_prompt || !user_prompt_template) {
      return res.status(400).json({ 
        error: 'Missing required fields: prompt_type, version, system_prompt, user_prompt_template' 
      });
    }
    
    // Check for duplicate
    const existing = await query(
      'SELECT id FROM prompt_versions WHERE prompt_type = $1 AND version = $2',
      [prompt_type, version]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Prompt version already exists' });
    }
    
    const result = await query(
      `INSERT INTO prompt_versions (
        prompt_type, version, system_prompt, user_prompt_template, 
        few_shot_examples, description, changelog, parent_version_id,
        traffic_allocation, is_control, created_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        prompt_type, version, system_prompt, user_prompt_template,
        JSON.stringify(few_shot_examples), description, changelog, parent_version_id,
        traffic_allocation, is_control, created_by, 'draft'
      ]
    );
    
    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating prompt version:', error);
    next(error);
  }
});

// PUT /api/prompt-experiments/:id - Update prompt version
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Build update query
    const allowedFields = [
      'system_prompt', 'user_prompt_template', 'few_shot_examples',
      'description', 'changelog', 'traffic_allocation', 'is_control'
    ];
    
    const setClause = [];
    const params = [id];
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClause.push(`${field} = $${params.length + 1}`);
        params.push(field === 'few_shot_examples' ? JSON.stringify(updates[field]) : updates[field]);
      }
    }
    
    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    setClause.push('updated_at = CURRENT_TIMESTAMP');
    
    const result = await query(
      `UPDATE prompt_versions SET ${setClause.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prompt version not found' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating prompt version:', error);
    next(error);
  }
});

// POST /api/prompt-experiments/:id/start - Start experiment
router.post('/:id/start', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      `UPDATE prompt_versions 
       SET status = 'running', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status IN ('draft', 'archived')
       RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ 
        error: 'Cannot start experiment. It may not exist or already be running.' 
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error starting experiment:', error);
    next(error);
  }
});

// POST /api/prompt-experiments/:id/stop - Stop experiment
router.post('/:id/stop', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      `UPDATE prompt_versions 
       SET status = 'completed', ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'running'
       RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ 
        error: 'Cannot stop experiment. It may not exist or not be running.' 
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error stopping experiment:', error);
    next(error);
  }
});

// POST /api/prompt-experiments/:id/select-winner - Auto-select winning prompt
router.post('/:id/select-winner', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const evaluation = await winnerSelector.selectWinner(id);
    
    res.json({
      success: evaluation.eligible,
      data: evaluation
    });
  } catch (error) {
    console.error('Error selecting winner:', error);
    next(error);
  }
});

// GET /api/prompt-experiments/:id/evaluation - Get experiment evaluation
router.get('/:id/evaluation', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const evaluation = await winnerSelector.evaluateWinner(id);
    
    res.json({
      success: true,
      data: evaluation,
      rules: WINNER_DECISION_RULES
    });
  } catch (error) {
    console.error('Error evaluating experiment:', error);
    next(error);
  }
});

// POST /api/prompt-experiments/:id/rollback - Rollback to previous version
router.post('/:id/rollback', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { target_version } = req.body;
    
    // Get the experiment to find its prompt_type
    const experiment = await query(
      'SELECT prompt_type FROM prompt_versions WHERE id = $1',
      [id]
    );
    
    if (experiment.rows.length === 0) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    
    const result = await winnerSelector.rollback(experiment.rows[0].prompt_type, target_version);
    
    res.json({
      success: result.success,
      data: result
    });
  } catch (error) {
    console.error('Error rolling back:', error);
    next(error);
  }
});

// GET /api/prompt-experiments/:id/metrics - Get experiment metrics
router.get('/:id/metrics', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Get current metrics
    const experiment = await query(
      'SELECT * FROM prompt_versions WHERE id = $1',
      [id]
    );
    
    if (experiment.rows.length === 0) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    
    const exp = experiment.rows[0];
    
    // Get historical snapshots
    const snapshots = await query(
      `SELECT * FROM experiment_snapshots 
       WHERE experiment_id = $1 
       ORDER BY snapshot_time DESC 
       LIMIT 100`,
      [id]
    );
    
    // Get assignments count
    const assignments = await query(
      'SELECT COUNT(*) as total FROM prompt_assignments WHERE prompt_version_id = $1',
      [id]
    );
    
    res.json({
      success: true,
      data: {
        current: {
          total_samples: exp.total_samples,
          completion_rate: exp.completion_rate,
          avg_latency_ms: exp.avg_latency_ms,
          avg_tokens_used: exp.avg_tokens_used,
          avg_feedback_score: exp.avg_feedback_score,
          edit_frequency: exp.edit_frequency,
          regenerate_rate: exp.regenerate_rate,
          p_value: exp.p_value,
          confidence_level: exp.confidence_level,
          is_winner: exp.is_winner,
          status: exp.status,
          started_at: exp.started_at,
          ended_at: exp.ended_at
        },
        snapshots: snapshots.rows,
        total_assignments: parseInt(assignments.rows[0].total)
      }
    });
  } catch (error) {
    console.error('Error getting metrics:', error);
    next(error);
  }
});

// POST /api/prompt-experiments/assign - Assign user to prompt version
router.post('/assign', async (req, res, next) => {
  try {
    const { session_id, prompt_type, user_id } = req.body;
    
    if (!session_id || !prompt_type) {
      return res.status(400).json({ 
        error: 'Missing required fields: session_id, prompt_type' 
      });
    }
    
    const assignment = await promptRouter.assignPromptVersion(
      session_id, 
      prompt_type, 
      user_id
    );
    
    res.json({
      success: true,
      data: {
        prompt_version_id: assignment.id,
        version: assignment.version,
        system_prompt: assignment.system_prompt,
        user_prompt_template: assignment.user_prompt_template,
        few_shot_examples: assignment.few_shot_examples,
        assignment_group: assignment.assignmentGroup,
        is_control: assignment.is_control
      }
    });
  } catch (error) {
    console.error('Error assigning prompt:', error);
    next(error);
  }
});

// POST /api/prompt-experiments/record-metrics - Record metrics for a generation
router.post('/record-metrics', async (req, res, next) => {
  try {
    const { session_id, prompt_version_id, metrics } = req.body;
    
    if (!prompt_version_id || !metrics) {
      return res.status(400).json({ 
        error: 'Missing required fields: prompt_version_id, metrics' 
      });
    }
    
    await promptRouter.recordMetrics(session_id, prompt_version_id, metrics);
    
    res.json({
      success: true
    });
  } catch (error) {
    console.error('Error recording metrics:', error);
    next(error);
  }
});

// POST /api/prompt-experiments/compare - Compare two prompt versions
router.post('/compare', async (req, res, next) => {
  try {
    const { version1_id, version2_id } = req.body;
    
    if (!version1_id || !version2_id) {
      return res.status(400).json({ 
        error: 'Missing required fields: version1_id, version2_id' 
      });
    }
    
    const v1 = await query('SELECT * FROM prompt_versions WHERE id = $1', [version1_id]);
    const v2 = await query('SELECT * FROM prompt_versions WHERE id = $2', [version2_id]);
    
    if (v1.rows.length === 0 || v2.rows.length === 0) {
      return res.status(404).json({ error: 'One or both versions not found' });
    }
    
    const control = {
      sampleSize: v1.rows[0].total_samples || 0,
      successRate: v1.rows[0].completion_rate || 0.5,
      variance: 0.25 // Assume max variance for binomial
    };
    
    const variant = {
      sampleSize: v2.rows[0].total_samples || 0,
      successRate: v2.rows[0].completion_rate || 0.5,
      variance: 0.25
    };
    
    const significance = experimentAnalyzer.calculateSignificance(control, variant);
    
    res.json({
      success: true,
      data: {
        version1: v1.rows[0],
        version2: v2.rows[0],
        comparison: significance
      }
    });
  } catch (error) {
    console.error('Error comparing versions:', error);
    next(error);
  }
});

module.exports = router;
