/**
 * Prompt Router Service
 * Handles A/B prompt experimentation, assignment, and metric tracking
 */

const { query } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Decision rules for winner selection
const WINNER_DECISION_RULES = {
  PRIMARY_METRIC: 'feedback_score',
  MIN_SAMPLE_SIZE: 100,
  MIN_RUNTIME_HOURS: 24,
  MIN_IMPROVEMENT: 5,
  P_VALUE_THRESHOLD: 0.05,
  REQUIRED_POSITIVE_METRICS: ['feedback_score', 'completion_rate'],
  MAX_DEGRADATION: -2
};

class PromptRouter {
  /**
   * Assign user to prompt version using weighted random selection
   */
  async assignPromptVersion(sessionId, promptType, userId = null) {
    try {
      // Get active experiments for prompt type
      const experiments = await this.getActiveExperiments(promptType);
      
      if (experiments.length === 0) {
        // No experiment, return default production version
        return await this.getProductionVersion(promptType);
      }
      
      // Check if user already has assignment
      const existingAssignment = await this.getExistingAssignment(sessionId, promptType);
      if (existingAssignment) {
        return {
          ...existingAssignment.prompt_version,
          assignmentGroup: existingAssignment.assignment_group
        };
      }
      
      // Weighted random assignment
      const selectedExperiment = this.weightedRandomSelection(experiments);
      
      // Determine assignment group
      const assignmentGroup = selectedExperiment.is_control ? 'control' : 'variant_a';
      
      // Record assignment
      await this.recordAssignment(sessionId, selectedExperiment.id, assignmentGroup, userId);
      
      // Increment sample count
      await this.incrementSampleCount(selectedExperiment.id);
      
      return {
        ...selectedExperiment,
        assignmentGroup
      };
    } catch (error) {
      console.error('Error assigning prompt version:', error);
      // Fallback to default
      return await this.getProductionVersion(promptType);
    }
  }
  
  /**
   * Get active experiments for a prompt type
   */
  async getActiveExperiments(promptType) {
    const result = await query(
      `SELECT * FROM prompt_versions 
       WHERE prompt_type = $1 AND status = 'running' AND traffic_allocation > 0
       ORDER BY traffic_allocation DESC`,
      [promptType]
    );
    return result.rows;
  }
  
  /**
   * Get production version (default)
   */
  async getProductionVersion(promptType) {
    const result = await query(
      `SELECT * FROM prompt_versions 
       WHERE prompt_type = $1 AND is_active = true AND status = 'completed'
       ORDER BY created_at DESC LIMIT 1`,
      [promptType]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    // Return default template if no versions exist
    return this.getDefaultPrompt(promptType);
  }
  
  /**
   * Get default prompt template
   */
  getDefaultPrompt(promptType) {
    const defaults = {
      summary: {
        id: 'default',
        prompt_type: promptType,
        version: '1.0.0',
        system_prompt: 'You are a helpful AI assistant that analyzes GitHub repositories.',
        user_prompt_template: 'Provide a summary of the repository: {repo_name}',
        few_shot_examples: [],
        is_active: true,
        is_control: true,
        traffic_allocation: 100
      },
      analysis: {
        id: 'default',
        prompt_type: promptType,
        version: '1.0.0',
        system_prompt: 'You are a helpful AI assistant that analyzes code repositories.',
        user_prompt_template: 'Analyze the following repository and provide insights: {repo_data}',
        few_shot_examples: [],
        is_active: true,
        is_control: true,
        traffic_allocation: 100
      }
    };
    
    return defaults[promptType] || defaults.summary;
  }
  
  /**
   * Get existing assignment for session
   */
  async getExistingAssignment(sessionId, promptType) {
    const result = await query(
      `SELECT pa.*, pv.*
       FROM prompt_assignments pa
       JOIN prompt_versions pv ON pa.prompt_version_id = pv.id
       WHERE pa.session_id = $1 AND pv.prompt_type = $2
       ORDER BY pa.created_at DESC LIMIT 1`,
      [sessionId, promptType]
    );
    return result.rows[0] || null;
  }
  
  /**
   * Weighted random selection based on traffic allocation
   */
  weightedRandomSelection(experiments) {
    const totalWeight = experiments.reduce((sum, e) => sum + e.traffic_allocation, 0);
    let random = Math.random() * totalWeight;
    
    for (const experiment of experiments) {
      random -= experiment.traffic_allocation;
      if (random <= 0) {
        return experiment;
      }
    }
    
    return experiments[0];
  }
  
  /**
   * Record assignment in database
   */
  async recordAssignment(sessionId, promptVersionId, assignmentGroup, userId) {
    await query(
      `INSERT INTO prompt_assignments (session_id, prompt_version_id, assignment_group, user_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (session_id, prompt_version_id) DO NOTHING`,
      [sessionId, promptVersionId, assignmentGroup, userId]
    );
  }
  
  /**
   * Increment sample count for prompt version
   */
  async incrementSampleCount(promptVersionId) {
    await query(
      `UPDATE prompt_versions 
       SET total_samples = total_samples + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [promptVersionId]
    );
  }
  
  /**
   * Record metrics for a generation
   */
  async recordMetrics(sessionId, promptVersionId, metrics) {
    const { completionRate, feedbackScore, editFrequency, regenerateRate, latencyMs, tokensUsed } = metrics;
    
    // Get current metrics
    const result = await query(
      `SELECT * FROM prompt_versions WHERE id = $1`,
      [promptVersionId]
    );
    
    if (result.rows.length === 0) return;
    
    const current = result.rows[0];
    const n = current.total_samples || 1;
    
    // Calculate running averages
    const newCompletionRate = completionRate !== undefined 
      ? ((current.completion_rate || completionRate) * (n - 1) + completionRate) / n
      : current.completion_rate;
    
    const newFeedbackScore = feedbackScore !== undefined
      ? ((current.avg_feedback_score || feedbackScore) * (n - 1) + feedbackScore) / n
      : current.avg_feedback_score;
    
    const newLatency = latencyMs !== undefined
      ? ((current.avg_latency_ms || latencyMs) * (n - 1) + latencyMs) / n
      : current.avg_latency_ms;
    
    const newTokens = tokensUsed !== undefined
      ? ((current.avg_tokens_used || tokensUsed) * (n - 1) + tokensUsed) / n
      : current.avg_tokens_used;
    
    const newEditFrequency = editFrequency !== undefined
      ? ((current.edit_frequency || editFrequency) * (n - 1) + editFrequency) / n
      : current.edit_frequency;
    
    const newRegenerateRate = regenerateRate !== undefined
      ? ((current.regenerate_rate || regenerateRate) * (n - 1) + regenerateRate) / n
      : current.regenerate_rate;
    
    await query(
      `UPDATE prompt_versions 
       SET completion_rate = $1, avg_feedback_score = $2, avg_latency_ms = $3,
           avg_tokens_used = $4, edit_frequency = $5, regenerate_rate = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [newCompletionRate, newFeedbackScore, newLatency, newTokens, newEditFrequency, newRegenerateRate, promptVersionId]
    );
  }
}

/**
 * Experiment Analyzer
 * Statistical analysis for experiment results
 */
class ExperimentAnalyzer {
  /**
   * Calculate statistical significance using two-proportion z-test
   */
  calculateSignificance(control, variant) {
    const n1 = control.sampleSize;
    const n2 = variant.sampleSize;
    const p1 = control.successRate;
    const p2 = variant.successRate;
    
    if (n1 === 0 || n2 === 0) {
      return { isSignificant: false, pValue: 1 };
    }
    
    // Pooled proportion
    const p = (p1 * n1 + p2 * n2) / (n1 + n2);
    
    // Standard error
    const se = Math.sqrt(p * (1 - p) * (1/n1 + 1/n2));
    
    // Handle division by zero
    if (se === 0) {
      return { isSignificant: false, pValue: 1 };
    }
    
    // Z-score
    const z = (p2 - p1) / se;
    
    // P-value (two-tailed) using normal approximation
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));
    
    return {
      zScore: z,
      pValue: pValue,
      isSignificant: pValue < 0.05,
      confidenceLevel: 1 - pValue,
      improvement: p1 > 0 ? ((p2 - p1) / p1) * 100 : 0
    };
  }
  
  /**
   * Standard normal cumulative distribution function
   */
  normalCDF(x) {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;
    
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    
    return 0.5 * (1.0 + sign * y);
  }
  
  /**
   * Calculate confidence interval for the difference
   */
  calculateConfidenceInterval(control, variant, confidence = 0.95) {
    const zScore = this.getZScoreForConfidence(confidence);
    const se = Math.sqrt(
      (control.variance / control.sampleSize) +
      (variant.variance / variant.sampleSize)
    );
    
    const diff = variant.mean - control.mean;
    const margin = zScore * se;
    
    return {
      lower: diff - margin,
      upper: diff + margin,
      mean: diff,
      confidence: confidence
    };
  }
  
  getZScoreForConfidence(confidence) {
    const zScores = {
      0.90: 1.645,
      0.95: 1.96,
      0.99: 2.576
    };
    return zScores[confidence] || 1.96;
  }
}

/**
 * Winner Selector
 * Automatic winner selection based on decision rules
 */
class WinnerSelector {
  constructor() {
    this.analyzer = new ExperimentAnalyzer();
  }
  
  async evaluateWinner(experimentId) {
    const experiment = await this.getExperiment(experimentId);
    if (!experiment) {
      return { eligible: false, reason: 'experiment_not_found' };
    }
    
    const metrics = await this.getMetrics(experiment);
    
    // Check minimum requirements
    if (metrics.sampleSize < WINNER_DECISION_RULES.MIN_SAMPLE_SIZE) {
      return { eligible: false, reason: 'insufficient_sample_size', current: metrics.sampleSize };
    }
    
    if (metrics.runtimeHours < WINNER_DECISION_RULES.MIN_RUNTIME_HOURS) {
      return { eligible: false, reason: 'insufficient_runtime', current: metrics.runtimeHours };
    }
    
    // Get control version for comparison
    const control = await this.getControlVersion(experiment.prompt_type);
    if (!control) {
      return { eligible: false, reason: 'no_control_version' };
    }
    
    const controlMetrics = await this.getMetrics(control);
    
    // Check statistical significance
    const significance = this.analyzer.calculateSignificance(
      { sampleSize: controlMetrics.sampleSize, successRate: controlMetrics.completionRate || 0.5 },
      { sampleSize: metrics.sampleSize, successRate: metrics.completionRate || 0.5 }
    );
    
    if (!significance.isSignificant) {
      return { eligible: false, reason: 'not_significant', pValue: significance.pValue };
    }
    
    // Check improvement threshold
    if (significance.improvement < WINNER_DECISION_RULES.MIN_IMPROVEMENT) {
      return { eligible: false, reason: 'insufficient_improvement', improvement: significance.improvement };
    }
    
    return { 
      eligible: true, 
      winner: experiment, 
      stats: significance,
      controlMetrics,
      experimentMetrics: metrics
    };
  }
  
  async getExperiment(experimentId) {
    const result = await query(
      'SELECT * FROM prompt_versions WHERE id = $1',
      [experimentId]
    );
    return result.rows[0] || null;
  }
  
  async getControlVersion(promptType) {
    const result = await query(
      `SELECT * FROM prompt_versions 
       WHERE prompt_type = $1 AND is_control = true AND status = 'running'`,
      [promptType]
    );
    return result.rows[0] || null;
  }
  
  async getMetrics(experiment) {
    const startedAt = experiment.started_at || experiment.created_at;
    const runtimeMs = Date.now() - new Date(startedAt).getTime();
    const runtimeHours = runtimeMs / (1000 * 60 * 60);
    
    return {
      sampleSize: experiment.total_samples || 0,
      completionRate: experiment.completion_rate,
      feedbackScore: experiment.avg_feedback_score,
      editFrequency: experiment.edit_frequency,
      regenerateRate: experiment.regenerate_rate,
      runtimeHours
    };
  }
  
  async selectWinner(experimentId) {
    const evaluation = await this.evaluateWinner(experimentId);
    
    if (!evaluation.eligible) {
      return evaluation;
    }
    
    // Mark experiment as winner
    await query(
      `UPDATE prompt_versions 
       SET is_winner = true, status = 'completed', ended_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [experimentId]
    );
    
    // Deactivate control and other variants
    await query(
      `UPDATE prompt_versions 
       SET is_active = false, status = 'archived', ended_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE prompt_type = $1 AND id != $2`,
      [evaluation.winner.prompt_type, experimentId]
    );
    
    // Activate winner as production
    await query(
      `UPDATE prompt_versions 
       SET is_active = true, status = 'completed', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [experimentId]
    );
    
    return evaluation;
  }
  
  /**
   * Rollback to a previous version
   */
  async rollback(promptType, targetVersion) {
    // Get current active version
    const current = await query(
      `SELECT * FROM prompt_versions 
       WHERE prompt_type = $1 AND is_active = true`,
      [promptType]
    );
    
    // Get target version
    const target = await query(
      `SELECT * FROM prompt_versions 
       WHERE prompt_type = $1 AND version = $2 AND status = 'archived'`,
      [promptType, targetVersion]
    );
    
    if (target.rows.length === 0) {
      return { success: false, reason: 'target_version_not_found' };
    }
    
    // Deactivate current
    if (current.rows.length > 0) {
      await query(
        `UPDATE prompt_versions 
         SET is_active = false, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [current.rows[0].id]
      );
    }
    
    // Activate target
    await query(
      `UPDATE prompt_versions 
       SET is_active = true, status = 'running', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [target.rows[0].id]
    );
    
    return { success: true, targetVersion: target.rows[0] };
  }
}

module.exports = {
  PromptRouter,
  ExperimentAnalyzer,
  WinnerSelector,
  WINNER_DECISION_RULES
};
