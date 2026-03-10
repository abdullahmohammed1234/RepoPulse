/**
 * AI Self-Evaluation Service
 * Phase 3: Evaluates AI-generated output on quality dimensions
 */

const { query } = require('../config/db');

// Evaluation Rubric
const EVALUATION_RUBRIC = {
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
  
  redundancy: {
    weight: 0.10,
    criteria: [
      "No duplicate information",
      "No repetitive phrasing",
      "No redundant explanations",
      "Each section adds unique value"
    ]
  },
  
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

// Evaluation Strategy for cost optimization
const EVALUATION_STRATEGY = {
  SKIP_CONDITIONS: {
    minScoreThreshold: 8.0,
    maxLatencyMs: 2000,
    maxTokensForEvaluation: 4000,
    highConfidenceContexts: ['routine_summary', 'simple_analysis']
  },
  
  EVALUATION_MODEL: 'claude-3-haiku',
  
  BATCH_EVALUATION: {
    enabled: true,
    batchSize: 10,
    batchWindowSeconds: 60
  },
  
  CACHE_STRATEGY: {
    enabled: true,
    cacheKeyFields: ['prompt_type', 'output_hash', 'context_hash'],
    cacheTtlSeconds: 3600
  }
};

// Evaluation Prompt Template
const EVALUATION_PROMPT = `You are an expert AI quality evaluator. Your task is to evaluate the following AI-generated output against specific quality criteria.

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

// Improvement Prompt Template
const IMPROVEMENT_PROMPT = `You are an AI content improvement specialist. Based on the evaluation feedback, improve the following output.

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
Return the improved version of the output.
Include a brief summary of changes made.
`;

/**
 * Calculate weighted evaluation score
 */
function calculateEvaluationScore(evaluations) {
  let totalWeight = 0;
  let weightedSum = 0;
  
  for (const [dimension, data] of Object.entries(evaluations)) {
    if (EVALUATION_RUBRIC[dimension]) {
      const rubric = EVALUATION_RUBRIC[dimension];
      weightedSum += data.score * rubric.weight;
      totalWeight += rubric.weight;
    }
  }
  
  return totalWeight > 0 ? (weightedSum / totalWeight) * 10 : 0; // Convert to 0-10 scale
}

/**
 * Determine if evaluation should be skipped based on cost optimization rules
 */
async function shouldEvaluate(generationContext) {
  // Skip if explicitly disabled via environment variable
  if (process.env.EVALUATION_ENABLED === 'false') {
    return { evaluate: false, reason: 'evaluation_disabled' };
  }
  
  // Skip if output too large (expensive to evaluate)
  if (generationContext.tokens > EVALUATION_STRATEGY.SKIP_CONDITIONS.maxTokensForEvaluation) {
    return { evaluate: false, reason: 'output_too_large', tokens: generationContext.tokens };
  }
  
  // Skip if generation already slow (avoid adding more latency)
  if (generationContext.latencyMs > EVALUATION_STRATEGY.SKIP_CONDITIONS.maxLatencyMs) {
    return { evaluate: false, reason: 'generation_too_slow', latencyMs: generationContext.latencyMs };
  }
  
  // Skip for high-confidence routine contexts
  if (EVALUATION_STRATEGY.SKIP_CONDITIONS.highConfidenceContexts.includes(generationContext.promptType)) {
    return { evaluate: false, reason: 'high_confidence_context' };
  }
  
  // Check cache first if enabled
  if (EVALUATION_STRATEGY.CACHE_STRATEGY.enabled) {
    const cachedResult = await getCachedEvaluation(generationContext);
    if (cachedResult) {
      return { evaluate: false, reason: 'cache_hit', cachedResult };
    }
  }
  
  // Sample-based evaluation for cost savings
  const sampleRate = getEvaluationSampleRate(generationContext);
  if (Math.random() > sampleRate) {
    return { evaluate: false, reason: 'sampling' };
  }
  
  return { evaluate: true, reason: 'full_evaluation' };
}

/**
 * Get evaluation sample rate based on prompt maturity
 */
function getEvaluationSampleRate(context) {
  const promptAge = Date.now() - (context.promptCreatedAt || Date.now());
  const ageDays = promptAge / (1000 * 60 * 60 * 24);
  
  if (ageDays < 7) return 1.0; // 100% for new prompts
  if (ageDays < 30) return 0.5; // 50% for developing prompts
  return 0.1; // 10% for mature prompts
}

/**
 * Get cached evaluation result
 */
async function getCachedEvaluation(context) {
  // Simple cache key based on output hash
  const cacheKey = generateCacheKey(context);
  
  try {
    const result = await query(
      'SELECT evaluation_result FROM evaluation_cache WHERE cache_key = $1 AND created_at > NOW() - INTERVAL \'1 hour\'',
      [cacheKey]
    );
    return result.rows[0]?.evaluation_result || null;
  } catch (err) {
    console.error('Cache lookup error:', err);
    return null;
  }
}

/**
 * Generate cache key for evaluation
 */
function generateCacheKey(context) {
  const hash = require('crypto').createHash('md5');
  hash.update(context.output || '');
  hash.update(context.promptType || '');
  return hash.digest('hex');
}

/**
 * Main evaluation function
 */
async function evaluateOutput(output, context) {
  // Check if we should skip evaluation
  const shouldEvalResult = await shouldEvaluate({
    tokens: output?.length || 0,
    latencyMs: context.latencyMs || 0,
    promptType: context.promptType || 'summary',
    promptCreatedAt: context.promptCreatedAt,
    output: output
  });
  
  if (!shouldEvalResult.evaluate) {
    return {
      skipped: true,
      reason: shouldEvalResult.reason,
      cachedResult: shouldEvalResult.cachedResult,
      evaluation: null
    };
  }
  
  // Build evaluation prompt
  const prompt = EVALUATION_PROMPT
    .replace('{{output_content}}', output)
    .replace('{{prompt_type}}', context.promptType || 'summary')
    .replace('{{use_case}}', context.useCase || 'general')
    .replace('{{expertise_level}}', context.expertiseLevel || 'intermediate');
  
  try {
    // Call AI to evaluate
    const evaluation = await callAIForEvaluation(prompt);
    
    // Cache the result
    if (EVALUATION_STRATEGY.CACHE_STRATEGY.enabled) {
      await cacheEvaluation(context, evaluation);
    }
    
    return {
      skipped: false,
      reason: 'full_evaluation',
      evaluation: evaluation
    };
  } catch (err) {
    console.error('Evaluation error:', err);
    return {
      skipped: true,
      reason: 'evaluation_error',
      error: err.message,
      evaluation: null
    };
  }
}

/**
 * Call AI for evaluation
 */
async function callAIForEvaluation(prompt) {
  // Use OpenAI or Anthropic API if available
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  
  let response;
  let evaluationText;
  
  if (anthropicKey) {
    // Use Anthropic
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await response.json();
    evaluationText = data.content?.[0]?.text;
  } else if (openaiKey) {
    // Use OpenAI
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })
    });
    const data = await response.json();
    evaluationText = data.choices?.[0]?.message?.content;
  } else {
    // Fallback to mock evaluation
    return generateMockEvaluation();
  }
  
  // Parse JSON from response
  try {
    // Extract JSON from the response
    const jsonMatch = evaluationText?.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const evaluation = JSON.parse(jsonMatch[0]);
      return evaluation;
    }
    return generateMockEvaluation();
  } catch (err) {
    console.error('Parse error:', err);
    return generateMockEvaluation();
  }
}

/**
 * Generate mock evaluation for testing/fallback
 */
function generateMockEvaluation() {
  return {
    clarity: { score: 7, issues: [], strengths: ['Clear language', 'Good examples'] },
    completeness: { score: 8, missing_sections: [], gaps: [] },
    structure: { score: 7, organization_issues: [], suggestions: [] },
    redundancy: { score: 9, repeated_content: [] },
    consistency: { score: 8, contradictions: [] },
    overall_score: 7.8,
    recommendations: ['Consider adding more examples']
  };
}

/**
 * Improve output based on evaluation
 */
async function improveOutput(originalOutput, evaluation, context) {
  if (!evaluation || evaluation.overall_score >= 8.0) {
    return { improved: false, output: originalOutput, reason: 'score_sufficient' };
  }
  
  // Build issues list
  const issuesList = [];
  for (const [dimension, data] of Object.entries(evaluation)) {
    if (data.issues && data.issues.length > 0) {
      issuesList.push(...data.issues);
    }
    if (data.missing_sections && data.missing_sections.length > 0) {
      issuesList.push(...data.missing_sections.map(s => `Missing: ${s}`));
    }
    if (data.organization_issues && data.organization_issues.length > 0) {
      issuesList.push(...data.organization_issues);
    }
    if (data.contradictions && data.contradictions.length > 0) {
      issuesList.push(...data.contradictions.map(c => `Contradiction: ${c}`));
    }
  }
  
  // Build improvement prompt
  const prompt = IMPROVEMENT_PROMPT
    .replace('{{original_output}}', originalOutput)
    .replace('{{evaluation_feedback}}', JSON.stringify(evaluation, null, 2))
    .replace('{{issues_list}}', issuesList.join('\n'));
  
  try {
    const improvedText = await callAIForImprovement(prompt);
    return {
      improved: true,
      output: improvedText,
      reason: 'improvement_applied'
    };
  } catch (err) {
    console.error('Improvement error:', err);
    return {
      improved: false,
      output: originalOutput,
      reason: 'improvement_error'
    };
  }
}

/**
 * Call AI for improvement
 */
async function callAIForImprovement(prompt) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  
  let response;
  let improvedText;
  
  if (anthropicKey) {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await response.json();
    improvedText = data.content?.[0]?.text;
  } else if (openaiKey) {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5
      })
    });
    const data = await response.json();
    improvedText = data.choices?.[0]?.message?.content;
  } else {
    // Fallback - just return original
    return prompt.split('## ORIGINAL OUTPUT:')[1]?.split('## EVALUATION')[0]?.trim() || 'No improvement available';
  }
  
  return improvedText;
}

/**
 * Cache evaluation result
 */
async function cacheEvaluation(context, evaluation) {
  const cacheKey = generateCacheKey(context);
  
  try {
    await query(
      `INSERT INTO evaluation_cache (cache_key, evaluation_result, prompt_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (cache_key) DO UPDATE SET evaluation_result = $2, created_at = CURRENT_TIMESTAMP`,
      [cacheKey, JSON.stringify(evaluation), context.promptType || 'summary']
    );
  } catch (err) {
    console.error('Cache insert error:', err);
  }
}

module.exports = {
  EVALUATION_RUBRIC,
  EVALUATION_STRATEGY,
  EVALUATION_PROMPT,
  IMPROVEMENT_PROMPT,
  evaluateOutput,
  improveOutput,
  shouldEvaluate,
  calculateEvaluationScore
};
