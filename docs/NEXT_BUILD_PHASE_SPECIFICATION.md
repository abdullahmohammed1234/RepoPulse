# RepoPulse Next Generation - Technical Specification

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              REPOPULSE NEXT GEN                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   │
│  │   Frontend   │   │   Backend    │   │  ML Service  │   │  Multi-Model │   │
│  │   (Next.js)  │◄──│  (Express)   │◄──│  (FastAPI)   │   │   Router     │   │
│  └──────────────┘   └──────┬───────┘   └──────────────┘   └──────┬───────┘   │
│                            │                                    │             │
│  ┌─────────────────────────────────────────────────────────────┴─────────┐   │
│  │                         PostgreSQL Database                          │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │   │
│  │  │Core Data│ │Versions │ │Feedback │ │Experi- │ │Workflow │        │   │
│  │  │         │ │         │ │         │ │ments    │ │Artifacts│        │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │                     Event & Metrics Pipeline                         │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │    │
│  │  │ Logger  │─►│Analytics│─►│Alerts   │─►│Dash-    │─►│ML Feed-│    │    │
│  │  │(Winston)│  │(StatsD) │  │(Pager)  │  │board    │  │back    │    │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## PHASE 1: FEEDBACK LOOP SYSTEM

### 1.1 Database Schema

```sql
-- Feedback table for output-level ratings
CREATE TABLE feedback (
  id SERIAL PRIMARY KEY,
  generation_id INTEGER REFERENCES generations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID,
  
  -- Rating
  rating BOOLEAN NOT NULL, -- true = thumbs up, false = thumbs down
  rating_score INTEGER CHECK (rating_score BETWEEN 1 AND 5),
  
  -- Section-level feedback
  section_feedback JSONB DEFAULT '[]',
  /* Example:
    [
      {"section": "summary", "rating": "negative", "reason": "unclear"},
      {"section": "recommendations", "rating": "positive", "reason": null}
    ]
  */
  
  -- Reason categories
  reason_category VARCHAR(50), -- unclear, incomplete, incorrect, repetitive, too_long, too_short, irrelevant
  reason_details TEXT,
  
  -- Edit tracking
  original_content TEXT,
  edited_content TEXT,
  edit_distance INTEGER, -- Levenshtein distance between original and edited
  edit_token_count INTEGER,
  edit_timestamp TIMESTAMP,
  
  -- Context
  prompt_version_id INTEGER REFERENCES prompt_versions(id),
  model_used VARCHAR(100),
  tokens_used INTEGER,
  latency_ms INTEGER,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT,
  ip_hash VARCHAR(64)
);

-- Indexes for feedback queries
CREATE INDEX idx_feedback_generation ON feedback(generation_id);
CREATE INDEX idx_feedback_user ON feedback(user_id);
CREATE INDEX idx_feedback_session ON feedback(session_id);
CREATE INDEX idx_feedback_rating ON feedback(rating);
CREATE INDEX idx_feedback_reason ON feedback(reason_category);
CREATE INDEX idx_feedback_created ON feedback(created_at);
CREATE INDEX idx_feedback_prompt_version ON feedback(prompt_version_id);

-- Section feedback details table (for granular tracking)
CREATE TABLE section_feedback (
  id SERIAL PRIMARY KEY,
  feedback_id INTEGER REFERENCES feedback(id) ON DELETE CASCADE,
  section_name VARCHAR(100) NOT NULL,
  section_position INTEGER, -- Order in the output
  
  -- Section-specific rating
  section_rating BOOLEAN,
  section_score INTEGER CHECK (section_score BETWEEN 1 AND 5),
  
  -- Issues identified
  issue_type VARCHAR(50), -- unclear, incomplete, incorrect, repetitive, missing_context, too_detailed
  issue_description TEXT,
  severity VARCHAR(20), -- low, medium, high, critical
  
  -- Improvement suggestions
  suggested_improvement TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_section_feedback_feedback ON section_feedback(feedback_id);
CREATE INDEX idx_section_feedback_section ON section_feedback(section_name);
```

### 1.2 API Endpoints

```javascript
// POST /api/feedback - Submit feedback for a generation
// POST /api/feedback/:generationId - Submit output-level feedback
// GET /api/feedback/analytics - Get feedback analytics
// GET /api/feedback/trends - Get feedback trends over time

// Request body examples:
{
  "generationId": "123",
  "rating": true, // thumbs up
  "ratingScore": 4,
  "reasonCategory": null,
  "reasonDetails": "Great summary!"
}

// For negative feedback:
{
  "generationId": "123",
  "rating": false,
  "ratingScore": 2,
  "reasonCategory": "unclear",
  "reasonDetails": "The risk factors were vague",
  "sectionFeedback": [
    {
      "section": "risk_factors",
      "rating": false,
      "reason": "incorrect",
      "issueType": "incomplete",
      "severity": "high"
    }
  ]
}
```

### 1.3 Event Logging Structure

```javascript
// Event types for feedback
const FEEDBACK_EVENTS = {
  FEEDBACK_SUBMITTED: 'feedback.submitted',
  FEEDBACK_EDIT_DETECTED: 'feedback.edit_detected',
  FEEDBACK_SECTION_RATED: 'feedback.section_rated',
  FEEDBACK_REGENERATE_REQUESTED: 'feedback.regenerate_requested'
};

// Structured event log
{
  "event": "feedback.submitted",
  "timestamp": "2026-02-18T02:49:48.860Z",
  "correlationId": "gen-abc-123",
  "userId": "user-uuid",
  "sessionId": "session-uuid",
  "data": {
    "generationId": 123,
    "rating": false,
    "ratingScore": 2,
    "reasonCategory": "unclear",
    "editDistance": 450,
    "timeToEdit": 45000, // ms since generation
    "promptVersion": "v2.3.1",
    "model": "claude-3-opus"
  }
}
```

### 1.4 How Feedback Improves Prompt Iterations

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────┐
│  User       │───►│ Feedback     │───►│ Prompt      │───►│ A/B Test    │
│  Provides   │    │ Aggregator   │    │ Optimizer   │    │ New Version │
│  Feedback   │    └──────────────┘    └─────────────┘    └─────────────┘
└─────────────┘           │                   │                   │
                          │                   │                   │
                   ┌──────▼──────┐      ┌──────▼──────┐     ┌──────▼──────┐
                   │ Issue       │      │ Change      │     │ Winner      │
                   │ Classifier  │      │ Generator   │     │ Selector    │
                   └─────────────┘      └─────────────┘     └─────────────┘
```

**Prompt Optimization Pipeline:**
1. Aggregate feedback by reason category and section
2. Identify patterns (e.g., "30% of users find recommendations unclear")
3. Generate prompt modification suggestions using AI
4. Create new prompt version with changes
5. Run A/B test comparing old vs new
6. Auto-promote winning version

### 1.5 Metrics Derived from Feedback

| Metric | Formula | Target |
|--------|---------|--------|
| **Feedback Rate** | feedback_count / generation_count | > 20% |
| **Positive Rating %** | positive_ratings / total_ratings | > 70% |
| **Edit Rate** | edits_detected / generations | < 15% |
| **Avg Edit Distance** | sum(edit_distance) / edits | < 500 |
| **Section-specific Score** | weighted avg by section | > 3.5/5 |
| **Regenerate Rate** | regenerate_requests / generations | < 25% |
| **Time to Feedback** | avg(ms between generation and feedback) | < 5 min |

---

## PHASE 2: A/B PROMPT EXPERIMENTATION FRAMEWORK

### 2.1 Prompt Version Table Schema

```sql
-- Prompt versions table
CREATE TABLE prompt_versions (
  id SERIAL PRIMARY KEY,
  prompt_type VARCHAR(50) NOT NULL, -- 'analysis', 'summary', 'risk评估', etc.
  version VARCHAR(20) NOT NULL,
  
  -- Prompt content
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  few_shot_examples JSONB DEFAULT '[]',
  
  -- Version metadata
  description TEXT,
  changelog TEXT,
  parent_version_id INTEGER REFERENCES prompt_versions(id),
  
  -- Experiment configuration
  is_active BOOLEAN DEFAULT false,
  is_control BOOLEAN DEFAULT false,
  traffic_allocation INTEGER DEFAULT 0, -- 0-100 percentage
  
  -- Performance metrics (updated periodically)
  total_samples INTEGER DEFAULT 0,
  completion_rate FLOAT,
  avg_latency_ms FLOAT,
  avg_tokens_used FLOAT,
  avg_feedback_score FLOAT,
  edit_frequency FLOAT,
  regenerate_rate FLOAT,
  
  -- Statistical significance
  p_value FLOAT,
  confidence_level FLOAT,
  is_winner BOOLEAN DEFAULT false,
  
  -- Lifecycle
  status VARCHAR(20) DEFAULT 'draft', -- draft, running, completed, archived
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  
  UNIQUE(prompt_type, version)
);

-- Prompt experiment assignments
CREATE TABLE prompt_assignments (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID,
  prompt_version_id INTEGER REFERENCES prompt_versions(id),
  assignment_group VARCHAR(50), -- 'control', 'variant_a', 'variant_b'
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, prompt_version_id)
);

-- Experiment metrics snapshots
CREATE TABLE experiment_snapshots (
  id SERIAL PRIMARY KEY,
  experiment_id INTEGER REFERENCES prompt_versions(id),
  snapshot_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Metrics at snapshot
  sample_size INTEGER,
  completion_rate FLOAT,
  feedback_score FLOAT,
  edit_frequency FLOAT,
  regenerate_rate FLOAT,
  
  -- Statistical data
  mean_score FLOAT,
  std_deviation FLOAT,
  confidence_interval_95 JSONB,
  
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.2 Assignment Logic

```javascript
// Prompt routing service
class PromptRouter {
  /**
   * Assign user to prompt version using weighted random selection
   */
  async assignPromptVersion(sessionId, promptType) {
    // Get active experiments for prompt type
    const experiments = await this.getActiveExperiments(promptType);
    
    if (experiments.length === 0) {
      // No experiment, return default production version
      return await this.getProductionVersion(promptType);
    }
    
    // Check if user already has assignment
    const existingAssignment = await this.getExistingAssignment(sessionId);
    if (existingAssignment) {
      return existingAssignment.prompt_version;
    }
    
    // Weighted random assignment
    const assignment = this.weightedRandomSelection(experiments);
    
    // Record assignment
    await this.recordAssignment(sessionId, assignment);
    
    return assignment;
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
}
```

### 2.3 Statistical Comparison Method

```javascript
// Statistical analysis for experiment results
class ExperimentAnalyzer {
  /**
   * Calculate statistical significance using two-proportion z-test
   */
  calculateSignificance(control, variant) {
    const n1 = control.sampleSize;
    const n2 = variant.sampleSize;
    const p1 = control.successRate;
    const p2 = variant.successRate;
    
    // Pooled proportion
    const p = (p1 * n1 + p2 * n2) / (n1 + n2);
    
    // Standard error
    const se = Math.sqrt(p * (1 - p) * (1/n1 + 1/n2));
    
    // Z-score
    const z = (p2 - p1) / se;
    
    // P-value (two-tailed)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));
    
    return {
      zScore: z,
      pValue: pValue,
      isSignificant: pValue < 0.05,
      confidenceLevel: 1 - pValue,
      improvement: ((p2 - p1) / p1) * 100 // Percentage improvement
    };
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
}
```

### 2.4 Decision Rule for Winning Prompt

```javascript
// Automatic winner selection rules
const WINNER_DECISION_RULES = {
  // Primary metric must show improvement
  PRIMARY_METRIC: 'feedback_score',
  
  // Minimum sample size required
  MIN_SAMPLE_SIZE: 100,
  
  // Minimum runtime (hours)
  MIN_RUNTIME_HOURS: 24,
  
  // Minimum improvement required (%)
  MIN_IMPROVEMENT: 5,
  
  // Statistical significance threshold
  P_VALUE_THRESHOLD: 0.05,
  
  // Multiple metrics must be positive
  REQUIRED_POSITIVE_METRICS: ['feedback_score', 'completion_rate'],
  
  // If any metric degrades beyond threshold, don't select winner
  MAX_DEGRADATION: -2
};

class WinnerSelector {
  async evaluateWinner(experiment) {
    const metrics = await this.getMetrics(experiment);
    
    // Check minimum requirements
    if (metrics.sampleSize < WINNER_DECISION_RULES.MIN_SAMPLE_SIZE) {
      return { eligible: false, reason: 'insufficient_sample_size' };
    }
    
    if (metrics.runtimeHours < WINNER_DECISION_RULES.MIN_RUNTIME_HOURS) {
      return { eligible: false, reason: 'insufficient_runtime' };
    }
    
    // Check statistical significance
    const significance = this.calculateSignificance(control, variant);
    if (!significance.isSignificant) {
      return { eligible: false, reason: 'not_significant', pValue: significance.pValue };
    }
    
    // Check improvement threshold
    if (significance.improvement < WINNER_DECISION_RULES.MIN_IMPROVEMENT) {
      return { eligible: false, reason: 'insufficient_improvement' };
    }
    
    // Check no degradation in other metrics
    for (const metric of WINNER_DECISION_RULES.REQUIRED_POSITIVE_METRICS) {
      const degradation = this.calculateDegradation(metric);
      if (degradation < WINNER_DECISION_RULES.MAX_DEGRADATION) {
        return { eligible: false, reason: 'metric_degradation', metric };
      }
    }
    
    return { eligible: true, winner: variant, stats: significance };
  }
}
```

### 2.5 Rollback Strategy

```sql
-- Rollback procedure
CREATE OR REPLACE FUNCTION rollback_prompt_version(prompt_type VARCHAR, target_version VARCHAR)
RETURNS VOID AS $$
DECLARE
  current_version_id INTEGER;
  target_version_id INTEGER;
BEGIN
  -- Get current active version
  SELECT id INTO current_version_id 
  FROM prompt_versions 
  WHERE prompt_type = $1 AND is_active = true;
  
  -- Get target version to rollback to
  SELECT id INTO target_version_id 
  FROM prompt_versions 
  WHERE prompt_type = $1 AND version = $2 AND status = 'archived';
  
  -- Deactivate current
  UPDATE prompt_versions 
  SET is_active = false, updated_at = NOW() 
  WHERE id = current_version_id;
  
  -- Activate target
  UPDATE prompt_versions 
  SET is_active = true, status = 'running', updated_at = NOW() 
  WHERE id = target_version_id;
  
  -- Log rollback event
  INSERT INTO system_events (event_type, details, created_at)
  VALUES ('prompt_rollback', jsonb_build_object(
    'prompt_type', $1,
    'from_version', current_version_id,
    'to_version', target_version_id,
    'triggered_at', NOW()
  ));
END;
$$ LANGUAGE plpgsql;
```

---

## PHASE 3: AI SELF-EVALUATION LAYER

### 3.1 Evaluation Rubric

```javascript
const EVALUATION_RUBRIC = {
  // Clarity Score (1-10)
  clarity: {
    weight: 0.25,
    criteria: [
      "Language is unambiguous and precise",
      "Technical terms are properly defined",
      "Sentences are concise and well-structured",
      "No contradictory statements",
      "Follows consistent terminology"
    ]
  },
  
  // Completeness Score (1-10)
  completeness: {
    weight: 0.30,
    criteria: [
      "All required sections present",
      "No placeholder text or TODO markers",
      "All requested information provided",
      "No truncated or cut-off content",
      "All edge cases addressed"
    ]
  },
  
  // Structural Quality (1-10)
  structure: {
    weight: 0.20,
    criteria: [
      "Logical section organization",
      "Clear hierarchical headings",
      "Appropriate use of lists and tables",
      "Consistent formatting",
      "Easy navigation between sections"
    ]
  },
  
  // Redundancy Score (1-10, inverted)
  redundancy: {
    weight: 0.10,
    criteria: [
      "No duplicate information",
      "No repetitive phrasing",
      "No redundant explanations",
      "Each section adds unique value"
    ]
  },
  
  // Logical Consistency (1-10)
  consistency: {
    weight: 0.15,
    criteria: [
      "No logical contradictions",
      "Recommendations match analysis",
      "Data citations are accurate",
      "Cause-effect relationships valid",
      "Timeline/references consistent"
    ]
  }
};

// Calculate weighted score
function calculateEvaluationScore(evaluations) {
  let totalWeight = 0;
  let weightedSum = 0;
  
  for (const [dimension, data] of Object.entries(evaluations)) {
    const rubric = EVALUATION_RUBRIC[dimension];
    weightedSum += data.score * rubric.weight;
    totalWeight += rubric.weight;
  }
  
  return (weightedSum / totalWeight) * 10; // Convert to 0-10 scale
}
```

### 3.2 Evaluation Prompt Template

```javascript
const EVALUATION_PROMPT = `
You are an expert AI quality evaluator. Your task is to evaluate the following AI-generated output against specific quality criteria.

## OUTPUT TO EVALUATE:
{{output_content}}

## CONTEXT:
- Prompt Type: {{prompt_type}}
- Target Use Case: {{use_case}}
- User Expertise Level: {{expertise_level}}

## EVALUATION CRITERIA:

### 1. CLARITY (Weight: 25%)
Rate 1-10: How clear and unambiguous is the language?
- 1-3: Many unclear passages, confusing terminology
- 4-6: Generally understandable but some unclear sections
- 7-8: Clear language with minor ambiguities
- 9-10: Exceptionally clear, no ambiguities

### 2. COMPLETENESS (Weight: 30%)
Rate 1-10: How complete is the response?
- 1-3: Major sections missing, incomplete analysis
- 4-6: Most content present but some gaps
- 7-8: Complete with minor missing details
- 9-10: Fully complete, no gaps

### 3. STRUCTURE (Weight: 20%)
Rate 1-10: How well-organized is the content?
- 1-3: Poor organization, hard to follow
- 4-6: Acceptable structure but could be improved
- 7-8: Well-organized, clear hierarchy
- 9-10: Excellent structure, easy navigation

### 4. REDUNDANCY (Weight: 10%)
Rate 1-10 (inverted): How much redundant content?
- 1-2: High redundancy, repeated information
- 3-4: Some repetition noted
- 5-6: Minimal redundancy
- 7-10: No redundancy detected

### 5. CONSISTENCY (Weight: 15%)
Rate 1-10: How internally consistent?
- 1-3: Multiple contradictions
- 4-6: Some inconsistencies
- 7-8: Mostly consistent
- 9-10: Fully consistent

## OUTPUT FORMAT:
Provide your evaluation as JSON:
{
  "clarity": {"score": X, "issues": ["issue1", "issue2"], "strengths": ["strength1"]},
  "completeness": {"score": X, "missing_sections": [], "gaps": []},
  "structure": {"score": X, "organization_issues": [], "suggestions": []},
  "redundancy": {"score": X, "repeated_content": []},
  "consistency": {"score": X, "contradictions": []},
  "overall_score": X.X,
  "recommendations": ["recommendation1"]
}
`;
```

### 3.3 Improvement Prompt Template

```javascript
const IMPROVEMENT_PROMPT = `
You are an AI content improvement specialist. Based on the evaluation feedback, improve the following output.

## ORIGINAL OUTPUT:
{{original_output}}

## EVALUATION FEEDBACK:
{{evaluation_feedback}}

## ISSUES TO ADDRESS:
{{issues_list}}

## IMPROVEMENT INSTRUCTIONS:
1. Address each issue identified in the evaluation
2. Maintain all accurate information
3. Preserve the original structure where appropriate
4. Only improve, don't rewrite unnecessarily
5. Keep the same tone and style

## OUTPUT FORMAT:
Return the improved version of the output, with changes highlighted using markdown.
Include a brief summary of changes made.
`;
```

### 3.4 Cost Optimization Strategy

```javascript
const EVALUATION_STRATEGY = {
  // Skip evaluation for low-risk generations
  SKIP_CONDITIONS: {
    minScoreThreshold: 8.0, // Skip if previous similar output scored > 8
    maxLatencyMs: 2000, // Skip if generation already took > 2s
    maxTokensForEvaluation: 4000, // Skip if output > 4000 tokens (expensive)
    highConfidenceContexts: ['routine_summary', 'simple_analysis']
  },
  
  // Use cheaper model for evaluation
  EVALUATION_MODEL: 'claude-3-haiku', // Fast and cheap for evaluation
  
  // Batching for cost efficiency
  BATCH_EVALUATION: {
    enabled: true,
    batchSize: 10,
    batchWindowSeconds: 60,
    maxWaitTimeMs: 60000
  },
  
  // Caching for similar evaluations
  CACHE_STRATEGY: {
    enabled: true,
    cacheKeyFields: ['prompt_type', 'output_hash', 'context_hash'],
    cacheTtlSeconds: 3600,
    maxCacheSize: 10000
  }
};

// Decision logic for when to evaluate
async function shouldEvaluate(generationContext) {
  // Skip if explicitly disabled
  if (!config.evaluationEnabled) return false;
  
  // Skip if output too large
  if (generationContext.tokens > EVALUATION_STRATEGY.SKIP_CONDITIONS.maxTokensForEvaluation) {
    return false;
  }
  
  // Skip if generation already slow
  if (generationContext.latencyMs > EVALUATION_STRATEGY.SKIP_CONDITIONS.maxLatencyMs) {
    return false;
  }
  
  // Skip for high-confidence routine contexts
  if (EVALUATION_STRATEGY.SKIP_CONDITIONS.highConfidenceContexts.includes(generationContext.promptType)) {
    return false;
  }
  
  // Check cache first
  const cachedResult = await evaluationCache.get(generationContext);
  if (cachedResult) {
    return { evaluate: false, cachedResult };
  }
  
  // Sample-based evaluation for cost savings
  const sampleRate = getEvaluationSampleRate(generationContext);
  if (Math.random() > sampleRate) {
    return false;
  }
  
  return true;
}

function getEvaluationSampleRate(context) {
  // Higher sample rate for new prompts, lower for mature ones
  const promptAge = Date.now() - context.promptCreatedAt;
  const ageDays = promptAge / (1000 * 60 * 60 * 24);
  
  if (ageDays < 7) return 1.0; // 100% for new prompts
  if (ageDays < 30) return 0.5; // 50% for developing prompts
  return 0.1; // 10% for mature prompts
}
```

---

## PHASE 4: WORKFLOW EXPANSION SYSTEM

### 4.1 Workflow Node Architecture

```sql
-- Workflow definitions
CREATE TABLE workflows (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  workflow_type VARCHAR(50) NOT NULL, -- 'task_list', 'action_plan', 'content_calendar', 'email_series', 'document'
  
  -- Configuration
  nodes JSONB NOT NULL, -- Node definitions
  edges JSONB NOT NULL, -- Connections between nodes
  entry_node_id VARCHAR(100),
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  version VARCHAR(20) DEFAULT '1.0.0',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100)
);

-- Workflow execution instances
CREATE TABLE workflow_executions (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER REFERENCES workflows(id),
  execution_id UUID UNIQUE NOT NULL,
  
  -- Execution state
  status VARCHAR(20) DEFAULT 'pending', -- pending, running, completed, failed, paused
  current_node_id VARCHAR(100),
  
  -- Input/Output
  input_data JSONB,
  output_data JSONB,
  
  -- Execution tracking
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  total_duration_ms INTEGER,
  
  -- Error tracking
  error_message TEXT,
  error_node_id VARCHAR(100),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Node execution history
CREATE TABLE node_executions (
  id SERIAL PRIMARY KEY,
  execution_id UUID REFERENCES workflow_executions(execution_id),
  node_id VARCHAR(100) NOT NULL,
  node_type VARCHAR(50) NOT NULL,
  
  -- Node input/output
  input_data JSONB,
  output_data JSONB,
  
  -- Execution details
  status VARCHAR(20) DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  
  -- Model used
  model VARCHAR(100),
  tokens_used INTEGER,
  cost_usd FLOAT,
  
  -- Error details
  error_message TEXT,
  retry_count INTEGER DEFAULT 0
);

CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_node_executions_execution ON node_executions(execution_id);
```

### 4.2 Node Types Definition

```javascript
const NODE_TYPES = {
  // Input nodes
  INPUT: {
    type: 'input',
    category: 'trigger',
    description: 'Initial input for workflow'
  },
  
  // AI transformation nodes
  GENERATE_TASK_LIST: {
    type: 'generate_task_list',
    category: 'ai_transform',
    description: 'Convert output to task list',
    model: 'claude-3-opus',
    outputFormat: 'tasks'
  },
  
  GENERATE_ACTION_PLAN: {
    type: 'generate_action_plan',
    category: 'ai_transform',
    description: 'Create action plan with timeline',
    model: 'claude-3-opus',
    outputFormat: 'action_plan'
  },
  
  GENERATE_CONTENT_CALENDAR: {
    type: 'generate_content_calendar',
    category: 'ai_transform',
    description: 'Schedule content over time',
    model: 'claude-3-opus',
    outputFormat: 'calendar'
  },
  
  GENERATE_EMAIL_SERIES: {
    type: 'generate_email_series',
    category: 'ai_transform',
    description: 'Create email sequence',
    model: 'claude-3-opus',
    outputFormat: 'emails'
  },
  
  GENERATE_DOCUMENT: {
    type: 'generate_document',
    category: 'ai_transform',
    description: 'Structure as formal document',
    model: 'claude-3-opus',
    outputFormat: 'document'
  },
  
  // Utility nodes
  FILTER: {
    type: 'filter',
    category: 'utility',
    description: 'Filter content based on criteria'
  },
  
  MERGE: {
    type: 'merge',
    category: 'utility',
    description: 'Merge multiple node outputs'
  },
  
  TRANSFORM: {
    type: 'transform',
    category: 'utility',
    description: 'Transform data format'
  },
  
  // Output nodes
  OUTPUT: {
    type: 'output',
    category: 'terminal',
    description: 'Final output'
  }
};

// Node configuration schema
const NODE_CONFIG_SCHEMA = {
  generate_task_list: {
    maxTasks: { type: 'number', default: 10, min: 1, max: 50 },
    priorityOrdering: { type: 'boolean', default: true },
    includeDependencies: { type: 'boolean', default: true },
    estimateEffort: { type: 'boolean', default: false }
  },
  
  generate_action_plan: {
    timelineUnit: { type: 'enum', values: ['days', 'weeks', 'months'], default: 'weeks' },
    includeMilestones: { type: 'boolean', default: true },
    assignOwners: { type: 'boolean', default: false },
    riskAssessment: { type: 'boolean', default: true }
  },
  
  generate_content_calendar: {
    duration: { type: 'number', default: 30 },
    frequency: { type: 'enum', values: ['daily', 'weekly', 'biweekly'], default: 'weekly' },
    includeTopics: { type: 'boolean', default: true },
    includeFormats: { type: 'boolean', default: true }
  },
  
  generate_email_series: {
    emailCount: { type: 'number', default: 5 },
    includeSubjectLines: { type: 'boolean', default: true },
    includeCallToAction: { type: 'boolean', default: true },
    tone: { type: 'enum', values: ['formal', 'casual', 'professional'], default: 'professional' }
  }
};
```

### 4.3 State Management Structure

```javascript
class WorkflowStateManager {
  constructor(executionId) {
    this.executionId = executionId;
    this.state = {
      nodes: new Map(),
      edges: [],
      context: {},
      history: []
    };
  }
  
  /**
   * Initialize workflow state
   */
  async initialize(workflowDefinition, inputData) {
    this.state.workflowId = workflowDefinition.id;
    this.state.entryNodeId = workflowDefinition.entry_node_id;
    this.state.inputData = inputData;
    this.state.nodes = new Map();
    
    // Initialize each node
    for (const node of workflowDefinition.nodes) {
      this.state.nodes.set(node.id, {
        id: node.id,
        type: node.type,
        config: node.config,
        status: 'pending',
        input: null,
        output: null,
        error: null,
        retries: 0
      });
    }
    
    this.state.edges = workflowDefinition.edges;
    
    // Persist initial state
    await this.persist();
  }
  
  /**
   * Get next node to execute
   */
  getNextNode(currentNodeId) {
    const outgoingEdges = this.state.edges.filter(
      edge => edge.source === currentNodeId
    );
    
    // Handle conditional edges
    for (const edge of outgoingEdges) {
      if (edge.condition) {
        const nodeState = this.state.nodes.get(currentNodeId);
        if (this.evaluateCondition(edge.condition, nodeState.output)) {
          return edge.target;
        }
      } else {
        return edge.target;
      }
    }
    
    return null;
  }
  
  /**
   * Update node state
   */
  async updateNodeState(nodeId, updates) {
    const node = this.state.nodes.get(nodeId);
    Object.assign(node, updates);
    this.state.nodes.set(nodeId, node);
    
    // Record history
    this.state.history.push({
      nodeId,
      action: 'node_updated',
      timestamp: Date.now(),
      data: updates
    });
    
    await this.persist();
  }
  
  /**
   * Evaluate condition for edge routing
   */
  evaluateCondition(condition, nodeOutput) {
    switch (condition.type) {
      case 'always':
        return true;
      case 'never':
        return false;
      case 'equals':
        return nodeOutput[condition.field] === condition.value;
      case 'contains':
        return nodeOutput[condition.field]?.includes(condition.value);
      case 'greaterThan':
        return nodeOutput[condition.field] > condition.value;
      case 'lessThan':
        return nodeOutput[condition.field] < condition.value;
      case 'regex':
        return new RegExp(condition.pattern).test(nodeOutput[condition.field]);
      default:
        return true;
    }
  }
}
```

### 4.4 Orchestration Logic

```javascript
class WorkflowOrchestrator {
  constructor() {
    this.executors = new Map();
    this.stateManagers = new Map();
  }
  
  /**
   * Execute workflow
   */
  async execute(workflowDefinition, inputData) {
    const executionId = uuidv4();
    
    // Initialize state manager
    const stateManager = new WorkflowStateManager(executionId);
    await stateManager.initialize(workflowDefinition, inputData);
    this.stateManagers.set(executionId, stateManager);
    
    // Create execution record
    const execution = await this.createExecutionRecord(executionId, workflowDefinition.id);
    
    try {
      // Start execution
      await this.updateExecutionStatus(executionId, 'running');
      
      // Execute from entry node
      let currentNodeId = workflowDefinition.entry_node_id;
      
      while (currentNodeId) {
        const result = await this.executeNode(
          executionId,
          currentNodeId,
          stateManager
        );
        
        if (result.error && result.retryable) {
          // Handle retry
          await this.handleRetry(executionId, currentNodeId, stateManager);
        }
        
        // Get next node
        currentNodeId = stateManager.getNextNode(currentNodeId);
        
        // Check for pause condition
        if (await this.shouldPause(executionId)) {
          await this.pauseExecution(executionId);
          return { status: 'paused', executionId };
        }
      }
      
      // Complete execution
      const finalOutput = stateManager.getFinalOutput();
      await this.completeExecution(executionId, finalOutput);
      
      return { status: 'completed', executionId, output: finalOutput };
      
    } catch (error) {
      await this.failExecution(executionId, error);
      throw error;
    } finally {
      this.stateManagers.delete(executionId);
    }
  }
  
  /**
   * Execute single node
   */
  async executeNode(executionId, nodeId, stateManager) {
    const node = stateManager.state.nodes.get(nodeId);
    
    // Update status to running
    await stateManager.updateNodeState(nodeId, { 
      status: 'running', 
      startedAt: Date.now() 
    });
    
    // Get input from previous nodes or initial input
    const input = await this.resolveNodeInput(nodeId, stateManager);
    
    try {
      // Get executor for node type
      const executor = this.getExecutor(node.type);
      
      // Execute
      const result = await executor.execute(input, node.config);
      
      // Update state with output
      await stateManager.updateNodeState(nodeId, {
        status: 'completed',
        output: result,
        completedAt: Date.now(),
        durationMs: Date.now() - node.startedAt
      });
      
      return { success: true, output: result };
      
    } catch (error) {
      await stateManager.updateNodeState(nodeId, {
        status: 'failed',
        error: error.message,
        failedAt: Date.now()
      });
      
      return { error: error.message, retryable: this.isRetryable(error) };
    }
  }
}
```

### 4.5 Failure Handling Strategy

```javascript
const FAILURE_HANDLING = {
  // Retry configuration
  RETRY_CONFIG: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitter: true
  },
  
  // Failure types and handling
  FAILURE_TYPES: {
    TRANSIENT: {
      retryable: true,
      examples: ['timeout', 'rate_limit', 'network_error'],
      strategy: 'exponential_backoff'
    },
    
    MODEL_ERROR: {
      retryable: true,
      examples: ['model_overloaded', 'context_length_exceeded'],
      strategy: 'fallback_model'
    },
    
    VALIDATION_ERROR: {
      retryable: false,
      examples: ['invalid_input', 'schema_mismatch'],
      strategy: 'fail_fast'
    },
    
    CONTENT_ERROR: {
      retryable: true,
      examples: ['content_filtered', 'safety_check_failed'],
      strategy: 'retry_with_modification'
    },
    
    TIMEOUT: {
      retryable: true,
      examples: ['generation_timeout', 'execution_timeout'],
      strategy: 'timeout_with_partial'
    }
  },
  
  // Circuit breaker
  CIRCUIT_BREAKER: {
    failureThreshold: 5,
    resetTimeoutMs: 60000,
    halfOpenRequests: 3
  }
};

class FailureHandler {
  async handleFailure(nodeExecution, error) {
    const failureType = this.classifyFailure(error);
    
    switch (failureType.strategy) {
      case 'exponential_backoff':
        return await this.handleWithBackoff(nodeExecution, error);
        
      case 'fallback_model':
        return await this.handleWithFallbackModel(nodeExecution, error);
        
      case 'retry_with_modification':
        return await this.handleWithModification(nodeExecution, error);
        
      case 'fail_fast':
        return await this.handleFailFast(nodeExecution, error);
        
      default:
        return await this.defaultHandling(nodeExecution, error);
    }
  }
  
  /**
   * Circuit breaker to prevent cascading failures
   */
  async checkCircuitBreaker(model) {
    const circuit = this.circuits.get(model);
    
    if (circuit.state === 'open') {
      if (Date.now() > circuit.nextAttempt) {
        // Try half-open
        circuit.state = 'half-open';
        return true;
      }
      throw new Error(`Circuit breaker open for ${model}`);
    }
    
    return true;
  }
}
```

---

## PHASE 5: MULTI-MODEL ROUTING LAYER

### 5.1 Routing Decision Tree

```
                        ┌─────────────────┐
                        │  Request Start  │
                        └────────┬────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Classify Task Type     │
                    └────────────┬────────────┘
                                 │
           ┌─────────────────────┼─────────────────────┐
           │                     │                     │
    ┌──────▼──────┐       ┌──────▼──────┐       ┌──────▼──────┐
    │   Simple    │       │   Complex   │       │   Eval/     │
    │   Task      │       │   Reasoning │       │   Scoring   │
    └──────┬──────┘       └──────┬──────┘       └──────┬──────┘
           │                     │                     │
    ┌──────▼──────┐       ┌──────▼──────┐       ┌──────▼──────┐
    │  Use Fast   │       │  Use High   │       │  Use Cheap  │
    │  Model      │       │  Quality    │       │  Model      │
    └─────────────┘       └─────────────┘       └─────────────┘
           │                     │                     │
           └─────────────────────┴─────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Combine Output │
                    └─────────────────┘
```

### 5.2 Model Selection Logic

```javascript
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

// Task classification for routing
const TASK_CLASSIFICATION = {
  SIMPLE: {
    indicators: [
      'summary',
      'list',
      'extract',
      'count',
      'boolean_query',
      'simple_transformation'
    ],
    model: 'FAST',
    maxTokens: 1000,
    timeoutMs: 5000
  },
  
  COMPLEX: {
    indicators: [
      'analyze',
      'compare',
      'evaluate',
      'reason',
      'explain_complex',
      'create_plan',
      'generate_strategy',
      'deep_dive'
    ],
    model: 'QUALITY',
    maxTokens: 4000,
    timeoutMs: 30000
  },
  
  EVALUATION: {
    indicators: [
      'evaluate',
      'score',
      'assess',
      'rate',
      'review'
    ],
    model: 'EVALUATION',
    maxTokens: 2000,
    timeoutMs: 10000
  },
  
  CREATIVE: {
    indicators: [
      'write',
      'compose',
      'draft',
      'generate_content'
    ],
    model: 'QUALITY',
    maxTokens: 3000,
    timeoutMs: 20000
  }
};

class ModelRouter {
  /**
   * Select appropriate model based on task analysis
   */
  async selectModel(request) {
    // Analyze request
    const taskType = this.classifyTask(request);
    const contextSize = this.estimateContextSize(request);
    const complexity = await this.assessComplexity(request);
    
    // Check budget constraints
    const budget = await this.getUserBudget(request.userId);
    
    // Select model category
    let modelCategory;
    if (budget.isLimited && taskType !== 'CRITICAL') {
      modelCategory = this.selectCostOptimizedModel(taskType, budget);
    } else {
      modelCategory = TASK_CLASSIFICATION[taskType].model;
    }
    
    // Select specific model
    const model = this.selectModelFromCategory(
      modelCategory,
      { contextSize, complexity, budget }
    );
    
    // Check model availability
    if (!await this.isModelAvailable(model.id)) {
      return this.getFallback(modelCategory);
    }
    
    return {
      model: model,
      routing: {
        taskType,
        complexity,
        estimatedCost: this.estimateCost(model, request),
        estimatedLatency: model.avgLatencyMs
      }
    };
  }
  
  /**
   * Classify task based on prompt analysis
   */
  classifyTask(request) {
    const prompt = request.prompt.toLowerCase();
    
    // Check evaluation indicators
    for (const indicator of TASK_CLASSIFICATION.EVALUATION.indicators) {
      if (prompt.includes(indicator)) {
        return 'EVALUATION';
      }
    }
    
    // Check complex indicators
    for (const indicator of TASK_CLASSIFICATION.COMPLEX.indicators) {
      if (prompt.includes(indicator)) {
        return 'COMPLEX';
      }
    }
    
    // Check simple indicators
    for (const indicator of TASK_CLASSIFICATION.SIMPLE.indicators) {
      if (prompt.includes(indicator)) {
        return 'SIMPLE';
      }
    }
    
    // Default to complex for unknown tasks (safer)
    return 'COMPLEX';
  }
  
  /**
   * Estimate context size for token budgeting
   */
  estimateContextSize(request) {
    const promptTokens = this.estimateTokens(request.prompt);
    const historyTokens = request.history?.reduce(
      (sum, msg) => sum + this.estimateTokens(msg.content), 0
    ) || 0;
    
    return promptTokens + historyTokens;
  }
  
  /**
   * Cost-optimized model selection
   */
  selectCostOptimizedModel(taskType, budget) {
    const category = TASK_CLASSIFICATION[taskType].model;
    const models = MODEL_CONFIG[`${category}_MODELS`];
    
    // Sort by cost
    return models.sort((a, b) => a.costPer1KOutput - b.costPer1KOutput)[0];
  }
}
```

### 5.3 Failover Sequence

```javascript
class ModelFailover {
  constructor() {
    this.failoverChains = new Map();
    this.initializeFailoverChains();
  }
  
  initializeFailoverChains() {
    // Define failover sequences for each model category
    this.failoverChains.set('claude-3-opus', [
      { model: 'claude-3-sonnet', delay: 0 },
      { model: 'claude-3-haiku', delay: 0 },
      { model: 'gpt-4-turbo', delay: 1000 },
      { model: 'gpt-4o-mini', delay: 1000 }
    ]);
    
    this.failoverChains.set('claude-3-sonnet', [
      { model: 'claude-3-haiku', delay: 0 },
      { model: 'gpt-4-turbo', delay: 1000 },
      { model: 'gpt-4o-mini', delay: 1000 }
    ]);
    
    this.failoverChains.set('gpt-4-turbo', [
      { model: 'gpt-4o-mini', delay: 0 },
      { model: 'claude-3-sonnet', delay: 1000 },
      { model: 'claude-3-haiku', delay: 1000 }
    ]);
  }
  
  /**
   * Execute with failover support
   */
  async executeWithFailover(request, primaryModel) {
    const chain = this.failoverChains.get(primaryModel.id) || [];
    let lastError = null;
    
    for (const fallback of chain) {
      try {
        // Wait for delay if specified
        if (fallback.delay > 0) {
          await this.sleep(fallback.delay);
        }
        
        // Try fallback model
        const result = await this.executeRequest(request, fallback.model);
        
        // Log successful failover
        await this.logFailover({
          originalModel: primaryModel.id,
          fallbackModel: fallback.model,
          requestId: request.id,
          success: true
        });
        
        return {
          ...result,
          model: fallback.model,
          failover: {
            used: true,
            originalModel: primaryModel.id
          }
        };
        
      } catch (error) {
        lastError = error;
        console.error(`Fallback to ${fallback.model} failed:`, error.message);
        
        // Log failed failover attempt
        await this.logFailover({
          originalModel: primaryModel.id,
          fallbackModel: fallback.model,
          requestId: request.id,
          success: false,
          error: error.message
        });
        
        // Continue to next fallback
        continue;
      }
    }
    
    // All fallbacks exhausted
    throw new Error(
      `All failover attempts failed. Last error: ${lastError?.message}`
    );
  }
  
  /**
   * Handle timeout with partial results
   */
  async handleTimeout(request, model, partialResult) {
    // If we have partial results, try to complete with faster model
    if (partialResult && partialResult.content) {
      const completionModel = this.selectCheaperModel(model);
      
      try {
        return await completionModel.complete(partialResult);
      } catch (error) {
        // Return partial if completion fails
        return {
          content: partialResult.content,
          partial: true,
          error: 'Completed with partial output due to timeout'
        };
      }
    }
    
    throw new Error(`Request timeout after ${request.timeoutMs}ms`);
  }
}
```

### 5.4 Cost Tracking Model

```sql
-- Token usage tracking
CREATE TABLE token_usage (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  session_id UUID,
  
  -- Request details
  request_id UUID,
  model_id VARCHAR(100) NOT NULL,
  prompt_type VARCHAR(50),
  
  -- Token counts
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  
  -- Cost calculation
  cost_usd DECIMAL(10, 6) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  
  -- Latency
  latency_ms INTEGER,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Daily cost aggregation
CREATE TABLE daily_cost_aggregation (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  user_id UUID REFERENCES users(id),
  
  -- Aggregated metrics
  total_requests INTEGER DEFAULT 0,
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,
  total_cost_usd DECIMAL(12, 6) DEFAULT 0,
  
  -- By model breakdown
  cost_by_model JSONB DEFAULT '{}',
  tokens_by_model JSONB DEFAULT '{}',
  
  UNIQUE(date, user_id)
);

-- User budget tracking
CREATE TABLE user_budgets (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) UNIQUE,
  
  -- Budget limits
  monthly_budget_usd DECIMAL(10, 2),
  monthly_token_limit BIGINT,
  
  -- Current usage
  current_month_usage_usd DECIMAL(10, 2) DEFAULT 0,
  current_month_tokens BIGINT DEFAULT 0,
  current_period_start DATE,
  
  -- Budget alerts
  alert_threshold_percent INTEGER DEFAULT 80,
  alert_sent BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cost optimization recommendations
CREATE TABLE cost_recommendations (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  
  recommendation_type VARCHAR(50),
  potential_savings_usd DECIMAL(10, 2),
  details JSONB,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## PHASE 6: ADMIN & ANALYTICS DASHBOARD

### 6.1 Metrics Definitions

```javascript
const METRICS_DEFINITIONS = {
  // User metrics
  DAILY_ACTIVE_USERS: {
    name: 'Daily Active Users (DAU)',
    description: 'Unique users who generated at least one output',
    aggregation: 'unique_count',
    source: 'generations.user_id',
    timeframe: 'daily',
    displayFormat: 'number'
  },
  
  MONTHLY_ACTIVE_USERS: {
    name: 'Monthly Active Users (MAU)',
    description: 'Unique users in last 30 days',
    aggregation: 'unique_count',
    source: 'generations.user_id',
    timeframe: 'monthly',
    displayFormat: 'number'
  },
  
  // Generation metrics
  GENERATION_VOLUME: {
    name: 'Generation Volume',
    description: 'Total number of AI generations',
    aggregation: 'count',
    source: 'generations.id',
    timeframe: 'daily',
    displayFormat: 'number'
  },
  
  GENERATION_SUCCESS_RATE: {
    name: 'Success Rate',
    description: 'Percentage of successful generations',
    aggregation: 'ratio',
    formula: 'successful / total * 100',
    timeframe: 'daily',
    displayFormat: 'percentage'
  },
  
  // Token and cost metrics
  TOKEN_USAGE: {
    name: 'Token Usage',
    description: 'Total tokens consumed',
    aggregation: 'sum',
    source: 'token_usage.total_tokens',
    timeframe: 'daily',
    displayFormat: 'compact_number'
  },
  
  COST_PER_USER: {
    name: 'Cost Per User',
    description: 'Average cost per active user',
    aggregation: 'average',
    formula: 'total_cost / unique_users',
    timeframe: 'daily',
    displayFormat: 'currency'
  },
  
  // Feedback metrics
  FEEDBACK_RATE: {
    name: 'Feedback Rate',
    description: 'Percentage of generations with feedback',
    aggregation: 'ratio',
    formula: 'generations_with_feedback / total_generations * 100',
    timeframe: 'daily',
    displayFormat: 'percentage'
  },
  
  POSITIVE_RATING_PERCENT: {
    name: 'Positive Rating %',
    description: 'Percentage of positive ratings',
    aggregation: 'ratio',
    formula: 'positive_ratings / total_ratings * 100',
    timeframe: 'daily',
    displayFormat: 'percentage'
  },
  
  // Prompt performance
  PROMPT_COMPLETION_RATE: {
    name: 'Completion Rate',
    description: 'Users who got useful output without regeneration',
    aggregation: 'ratio',
    formula: '(generations - regenerations) / generations * 100',
    timeframe: 'daily',
    displayFormat: 'percentage'
  },
  
  REGENERATE_RATE: {
    name: 'Regenerate Rate',
    description: 'Percentage requiring regeneration',
    aggregation: 'ratio',
    formula: 'regenerations / generations * 100',
    timeframe: 'daily',
    displayFormat: 'percentage'
  },
  
  // Section analytics
  MOST_EDITED_SECTIONS: {
    name: 'Most Edited Sections',
    description: 'Sections with highest edit frequency',
    aggregation: 'grouped_count',
    source: 'section_feedback.section_name',
    timeframe: 'weekly',
    displayFormat: 'ranked_list'
  },
  
  // Failure analytics
  FAILURE_RATE: {
    name: 'Failure Rate',
    description: 'Percentage of failed generations',
    aggregation: 'ratio',
    formula: 'failures / total * 100',
    timeframe: 'daily',
    displayFormat: 'percentage'
  },
  
  COMMON_FAILURE_TYPES: {
    name: 'Common Failure Types',
    description: 'Most frequent error categories',
    aggregation: 'grouped_count',
    source: 'error_logs.error_type',
    timeframe: 'daily',
    displayFormat: 'distribution'
  }
};
```

### 6.2 Data Aggregation Logic

```javascript
class AnalyticsAggregator {
  /**
   * Aggregate metrics for dashboard
   */
  async aggregateMetrics(config) {
    const { metric, startDate, endDate, granularity, filters } = config;
    
    switch (granularity) {
      case 'hourly':
        return await this.aggregateHourly(metric, startDate, endDate, filters);
      case 'daily':
        return await this.aggregateDaily(metric, startDate, endDate, filters);
      case 'weekly':
        return await this.aggregateWeekly(metric, startDate, endDate, filters);
      case 'monthly':
        return await this.aggregateMonthly(metric, startDate, endDate, filters);
      default:
        throw new Error(`Unknown granularity: ${granularity}`);
    }
  }
  
  /**
   * Daily aggregation with pre-computed rollups
   */
  async aggregateDaily(metric, startDate, endDate, filters) {
    const metricDef = METRICS_DEFINITIONS[metric];
    
    // Try pre-computed first
    const precomputed = await this.getPrecomputed(
      'daily_metrics',
      { metric, startDate, endDate, ...filters }
    );
    
    if (precomputed) {
      return precomputed;
    }
    
    // Fall back to live computation
    const query = this.buildQuery(metric, 'day', filters);
    query.where('timestamp', '>=', startDate);
    query.where('timestamp', '<=', endDate);
    
    return await query.execute();
  }
  
  /**
   * Real-time metrics (last 24 hours)
   */
  async getRealtimeMetrics() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    return {
      generationsLast24h: await this.countSince('generations', since),
      activeUsersLast24h: await this.uniqueCountSince('generations', 'user_id', since),
      avgLatencyLast24h: await this.avgSince('generations', 'latency_ms', since),
      errorRateLast24h: await this.ratioSince('generations', 'status', 'error', since),
      tokenUsageLast24h: await this.sumSince('token_usage', 'total_tokens', since),
      costLast24h: await this.sumSince('token_usage', 'cost_usd', since)
    };
  }
  
  /**
   * Time-series data for charts
   */
  async getTimeSeriesData(metrics, startDate, endDate, interval = 'day') {
    const dataPoints = [];
    
    // Generate time intervals
    const intervals = this.generateIntervals(startDate, endDate, interval);
    
    for (const interval of intervals) {
      const point = {
        timestamp: interval.start,
        period: interval.label
      };
      
      for (const metric of metrics) {
        point[metric] = await this.aggregateForPeriod(
          metric,
          interval.start,
          interval.end
        );
      }
      
      dataPoints.push(point);
    }
    
    return dataPoints;
  }
}
```

### 6.3 Dashboard Layout

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                         REPOPULSE ANALYTICS DASHBOARD                          │
├────────────────────────────────────────────────────────────────────────────────┤
│  Date Range: [Last 7 Days ▼]  [Compare to Previous Period ✓]  [Export ▼]      │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │
│  │    DAU       │ │   Generations│ │  Token Usage │ │   Cost/Day   │          │
│  │    1,247     │ │    12,459    │ │   4.2M       │ │   $234.50    │          │
│  │   +12.3% ▲   │ │   +8.7% ▲    │ │  +15.2% ▲    │ │   -5.3% ▼    │          │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘          │
│                                                                                │
│  ┌─────────────────────────────────────────┐ ┌─────────────────────────────┐  │
│  │         GENERATION VOLUME TREND         │ │      PROMPT PERFORMANCE     │  │
│  │                                         │ │                             │  │
│  │    ▂▄▆██▆▄▂▄▆█▆▄▂▄▆█                   │ │  v2.3.1 (active)  [78%]    │  │
│  │                                         │ │  v2.3.0 (control) [72%]    │  │
│  │                                         │ │  v2.2.9          [65%]    │  │
│  └─────────────────────────────────────────┘ └─────────────────────────────┘  │
│                                                                                │
│  ┌─────────────────────────────────────────┐ ┌─────────────────────────────┐  │
│  │           FEEDBACK TRENDS               │ │     SECTION EDIT RATE       │  │
│  │                                         │ │                             │  │
│  │   Positive: ████████████░░░ 75%        │ │  Recommendations:  23%      │  │
│  │   Negative:  ████░░░░░░░░░░░░ 15%       │ │  Risk Factors:    18%       │  │
│  │   No feedback: █████░░░░░░░░░ 10%       │ │  Summary:         12%       │  │
│  └─────────────────────────────────────────┘ │  Analysis:         8%        │  │
│                                               └─────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                         FAILURE ANALYSIS                                │    │
│  │                                                                         │    │
│  │  Rate Limit:  ██████████░░░░░░░░ 35%                                  │    │
│  │  Timeout:     ████████░░░░░░░░░░░ 28%                                  │    │
│  │  Invalid In:  ████░░░░░░░░░░░░░░░ 15%                                  │    │
│  │  Model Error: ███░░░░░░░░░░░░░░░░ 10%                                  │    │
│  │  Other:       ████░░░░░░░░░░░░░░░ 12%                                  │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                           ALERTS                                        │    │
│  │  ⚠️  Cost exceeds daily budget by 15%                                   │    │
│  │  ⚠️  Failure rate increased to 4.2% (threshold: 3%)                    │    │
│  │  ✅  Prompt v2.3.1 reached statistical significance                    │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 6.4 Alert Triggers

```javascript
const ALERT_CONFIGS = {
  // Cost alerts
  COST_THRESHOLD: {
    metric: 'daily_cost',
    condition: 'greater_than',
    threshold: 500, // USD
    window: '1d',
    severity: 'warning',
    cooldownMinutes: 60
  },
  
  COST_BUDGET_EXCEEDED: {
    metric: 'monthly_cost',
    condition: 'greater_than',
    threshold: 10000, // USD
    window: '30d',
    severity: 'critical',
    cooldownMinutes: 0
  },
  
  // Performance alerts
  FAILURE_RATE_HIGH: {
    metric: 'failure_rate',
    condition: 'greater_than',
    threshold: 3, // percentage
    window: '1h',
    severity: 'warning',
    cooldownMinutes: 30
  },
  
  LATENCY_HIGH: {
    metric: 'p95_latency',
    condition: 'greater_than',
    threshold: 10000, // ms
    window: '15m',
    severity: 'warning',
    cooldownMinutes: 15
  },
  
  // Engagement alerts
  FEEDBACK_NEGATIVE_SPIKE: {
    metric: 'positive_rating_percent',
    condition: 'less_than',
    threshold: 60, // percentage
    window: '1h',
    severity: 'warning',
    cooldownMinutes: 60
  },
  
  REGENERATE_RATE_HIGH: {
    metric: 'regenerate_rate',
    condition: 'greater_than',
    threshold: 30, // percentage
    window: '1d',
    severity: 'info',
    cooldownMinutes: 120
  },
  
  // System alerts
  PROMPT_EXPERIMENT_SIGNIFICANT: {
    metric: 'prompt_version_p_value',
    condition: 'less_than',
    threshold: 0.05,
    window: null,
    severity: 'success',
    cooldownMinutes: 0
  },
  
  MODEL_AVAILABILITY_LOW: {
    metric: 'model_success_rate',
    condition: 'less_than',
    threshold: 95, // percentage
    window: '30m',
    severity: 'critical',
    cooldownMinutes: 15
  }
};

class AlertManager {
  /**
   * Check and trigger alerts
   */
  async checkAlerts() {
    for (const [name, config] of Object.entries(ALERT_CONFIGS)) {
      // Check cooldown
      if (this.isInCooldown(name)) {
        continue;
      }
      
      // Get current metric value
      const value = await this.getMetricValue(config);
      
      // Evaluate condition
      const triggered = this.evaluateCondition(value, config);
      
      if (triggered) {
        await this.triggerAlert(name, config, value);
        this.setCooldown(name, config.cooldownMinutes);
      }
    }
  }
  
  /**
   * Evaluate alert condition
   */
  evaluateCondition(value, config) {
    switch (config.condition) {
      case 'greater_than':
        return value > config.threshold;
      case 'less_than':
        return value < config.threshold;
      case 'equals':
        return value === config.threshold;
      case 'change_greater_than':
        return Math.abs(value.change) > config.threshold;
      default:
        return false;
    }
  }
}
```

---

## IMPLEMENTATION ROADMAP

### Priority Matrix

| Phase | Impact | Effort | Priority | Quarter |
|-------|--------|--------|----------|---------|
| Phase 1: Feedback Loop | High | Medium | P0 | Q1 |
| Phase 2: A/B Testing | High | High | P0 | Q1-Q2 |
| Phase 3: AI Self-Eval | Medium | Medium | P1 | Q2 |
| Phase 4: Workflows | High | High | P1 | Q2-Q3 |
| Phase 5: Multi-Model | Medium | High | P2 | Q3 |
| Phase 6: Dashboard | High | Medium | P0 | Q1-Q2 |

### Detailed Implementation Timeline

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                              IMPLEMENTATION ROADMAP                           │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  Q1 (Weeks 1-12)                                                               │
│  ├── Phase 1: Feedback Loop System                                            │
│  │   ├── Week 1-2: Database schema + migration                                │
│  │   ├── Week 3: Feedback API endpoints                                       │
│  │   ├── Week 4: Event logging integration                                    │
│  │   ├── Week 5-6: Frontend feedback UI components                            │
│  │   └── Week 7-8: Metrics derivation + testing                               │
│  │                                                                          │
│  ├── Phase 2: A/B Testing (Foundation)                                        │
│  │   ├── Week 9-10: Prompt version table + CRUD                              │
│  │   ├── Week 11: Assignment logic                                           │
│  │   └── Week 12: Basic statistical comparison                               │
│  │                                                                          │
│  └── Phase 6: Analytics Dashboard (Foundation)                               │
│      ├── Week 5-6: Metrics definitions + aggregation                         │
│      ├── Week 7-8: Dashboard UI layout                                        │
│      └── Week 9-12: Alert system + real-time updates                          │
│                                                                                │
│  Q2 (Weeks 13-24)                                                             │
│  ├── Phase 2: A/B Testing (Complete)                                         │
│  │   ├── Week 13-14: Statistical significance testing                        │
│  │   ├── Week 15-16: Winner selection automation                              │
│  │   ├── Week 17-18: Rollback system                                          │
│  │   └── Week 19-20: Integration + monitoring                                │
│  │                                                                          │
│  ├── Phase 3: AI Self-Evaluation                                             │
│  │   ├── Week 13-14: Evaluation rubric + prompts                            │
│  │   ├── Week 15-16: Evaluation service implementation                       │
│  │   ├── Week 17-18: Improvement prompt template                             │
│  │   ├── Week 19-20: Cost optimization + caching                             │
│  │   └── Week 21-22: Latency rules + integration                             │
│  │                                                                          │
│  └── Phase 6: Dashboard (Complete)                                           │
│      ├── Week 17-18: Advanced visualizations                                 │
│      ├── Week 19-20: Custom reports                                          │
│      └── Week 21-24: Dashboard polish + optimization                         │
│                                                                                │
│  Q3 (Weeks 25-36)                                                             │
│  ├── Phase 4: Workflow Expansion                                             │
│  │   ├── Week 25-26: Workflow schema + definitions                           │
│  │   ├── Week 27-28: Node execution engine                                   │
│  │   ├── Week 29-30: State management                                        │
│  │   ├── Week 31-32: Failure handling                                        │
│  │   └── Week 33-35: UI integration + testing                               │
│  │                                                                          │
│  └── Phase 5: Multi-Model Routing                                            │
│      ├── Week 29-30: Model config + selection logic                          │
│      │   ├── Week 31-32: Failover sequences                                   │
│      │   ├── Week 33-34: Cost tracking + budgeting                           │
│      │   └── Week 35-36: Optimization + monitoring                            │
│      │                                                                        │
│  Q4 (Weeks 37-48): Optimization & Scale                                      │
│  ├── Performance tuning across all phases                                    │
│  ├── Advanced analytics + ML-powered insights                                │
│  ├── Enterprise features (SSO, audit logs)                                    │
│  └── Mobile optimization                                                      │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## SECURITY CONSIDERATIONS

### Authentication & Authorization
```javascript
const SECURITY_CONFIG = {
  // API Security
  API_RATE_LIMITS: {
    standard: { windowMs: 60000, max: 100 },
    feedback: { windowMs: 60000, max: 50 },
    analytics: { windowMs: 60000, max: 30 }
  },
  
  // Data protection
  PII_FIELDS: ['email', 'name', 'ip_hash'],
  DATA_RETENTION: {
    feedback: '2_years',
    analytics: '3_years',
    token_usage: '1_year'
  },
  
  // Anonymization
  ANONYMIZATION: {
    enabled: true,
    fields: ['ip_hash', 'user_agent'],
    salt_rotation_days: 90
  },
  
  // Audit logging
  AUDIT_EVENTS: [
    'prompt_version_change',
    'experiment_winner_selected',
    'budget_limit_reached',
    'user_data_exported'
  ]
};
```

### Data Privacy
- All user feedback anonymized after 90 days
- IP addresses hashed with rotating salt
- Export data subject to GDPR compliance
- Feedback data used only for model improvement

---

## SCALING CONSIDERATIONS

### Horizontal Scaling Architecture
```
                    ┌─────────────────┐
                    │   Load Balancer │
                    └────────┬────────┘
                             │
    ┌────────────┬───────────┼───────────┬────────────┐
    │            │           │           │            │
┌───▼───┐   ┌───▼───┐   ┌───▼───┐   ┌───▼───┐   ┌───▼───┐
│ API 1 │   │ API 2 │   │ API 3 │   │ API 4 │   │ API N │
└───┬───┘   └───┬───┘   └───┬───┘   └───┬───┘   └───┬───┘
    │           │           │           │           │
    └───────────┴───────────┼───────────┴───────────┘
                            │
                    ┌───────▼───────┐
                    │  Redis Cache  │
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │   PostgreSQL  │
                    │   (Primary)   │
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │  Read Replicas│
                    └───────────────┘
```

### Performance Targets
| Metric | Target | Threshold |
|--------|--------|-----------|
| API p50 latency | < 200ms | 500ms |
| API p99 latency | < 1000ms | 2000ms |
| Generation p95 latency | < 5000ms | 10000ms |
| Dashboard load | < 2s | 5s |
| Uptime | 99.9% | 99.5% |

### Cost Estimation (Monthly)

| Component | Small Scale | Medium Scale | Large Scale |
|-----------|-------------|--------------|--------------|
| Users | 1,000 | 10,000 | 100,000 |
| Generations/month | 50,000 | 500,000 | 5,000,000 |
| API Servers | 2 | 5 | 15 |
| Database | $200 | $500 | $2,000 |
| AI API Costs | $500 | $5,000 | $50,000 |
| Cache (Redis) | $50 | $200 | $500 |
| Monitoring | $100 | $200 | $500 |
| **Total Monthly** | **~ $2,000** | **~ $15,000** | **~ $150,000** |

---

## CONCLUSION

This specification provides a comprehensive roadmap for evolving RepoPulse into a production-grade AI product with:

1. **Closed feedback loops** - Continuously improving based on user signals
2. **Scientific experimentation** - Data-driven prompt optimization
3. **Quality assurance** - AI self-evaluation before output delivery
4. **Flexibility** - Modular workflow expansion
5. **Cost efficiency** - Intelligent multi-model routing
6. **Visibility** - Full-stack analytics and monitoring

Each phase builds upon the previous, creating a virtuous cycle of improvement while maintaining system stability and cost control.
