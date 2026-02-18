/**
 * Output Schema Validation Layer
 * Validates ML service responses and ensures data integrity
 */

const Joi = require('joi');

/**
 * Output validation schemas for ML responses
 */
const outputSchemas = {
  // Risk prediction validation
  riskPrediction: Joi.object({
    risk_score: Joi.number()
      .min(0)
      .max(1)
      .required()
      .messages({
        'number.min': 'Risk score must be between 0 and 1',
        'number.max': 'Risk score must be between 0 and 1',
        'any.required': 'Risk score is required'
      }),

    risk_level: Joi.string()
      .valid('Low', 'Medium', 'High')
      .required()
      .messages({
        'any.only': 'Risk level must be Low, Medium, or High',
        'any.required': 'Risk level is required'
      }),

    confidence: Joi.number()
      .min(0)
      .max(1)
      .optional()
      .default(0.85),

    model_used: Joi.string()
      .max(100)
      .required(),

    top_factors: Joi.array()
      .items(
        Joi.object({
          feature: Joi.string()
            .max(200)
            .required(),
          value: Joi.number()
            .required(),
          impact_weight: Joi.number()
            .min(0)
            .max(1)
            .required()
        })
      )
      .max(10)
      .optional()
      .default([]),

    recommendations: Joi.array()
      .items(Joi.string().max(1000))
      .max(20)
      .optional()
      .default([])
  }),

  // Churn prediction validation
  churnPrediction: Joi.object({
    churn_probability: Joi.number()
      .min(0)
      .max(1)
      .required(),

    churn_level: Joi.string()
      .valid('low', 'medium', 'high', 'critical')
      .required(),

    model_used: Joi.string()
      .max(100)
      .required()
  }),

  // Anomaly detection validation
  anomalyDetection: Joi.object({
    anomaly_scores: Joi.array()
      .items(Joi.number().min(0).max(1))
      .required(),

    flagged_contributors: Joi.array()
      .items(
        Joi.object({
          index: Joi.number().integer().min(0),
          anomaly_score: Joi.number().min(0).max(1),
          flag: Joi.string().max(500)
        })
      )
      .optional()
      .default([]),

    model_used: Joi.string()
      .max(100)
      .required()
  }),

  // AI Generation output validation
  generatedContent: Joi.object({
    content: Joi.string()
      .max(50000)
      .required()
      .messages({
        'string.max': 'Generated content exceeds maximum length',
        'any.required': 'Generated content is required'
      }),

    version: Joi.string()
      .pattern(/^v\d+$/)
      .required(),

    timestamp: Joi.date()
      .iso()
      .required(),

    tokens_used: Joi.number()
      .integer()
      .min(0)
      .optional(),

    model: Joi.string()
      .max(100)
      .optional(),

    metadata: Joi.object({
      sections: Joi.array()
        .items(Joi.string())
        .optional(),
      tone: Joi.string()
        .optional(),
      length: Joi.string()
        .optional()
    })
    .optional()
  }),

  // Benchmark data validation
  benchmarkData: Joi.object({
    health_score: Joi.number()
      .min(0)
      .max(100)
      .required(),

    momentum_score: Joi.number()
      .min(0)
      .max(100)
      .required(),

    risk_index: Joi.number()
      .min(0)
      .max(100)
      .required(),

    velocity_index: Joi.number()
      .min(0)
      .max(100)
      .required(),

    stability_index: Joi.number()
      .min(0)
      .max(100)
      .required(),

    health_percentile: Joi.number()
      .min(0)
      .max(100)
      .optional(),

    insight: Joi.string()
      .max(5000)
      .optional()
  })
};

/**
 * Validate ML service response
 * @param {string} type - Response type to validate
 * @param {object} data - Data to validate
 * @returns {object} - Validation result with validated data or errors
 */
function validateOutput(type, data) {
  const schema = outputSchemas[type];

  if (!schema) {
    return {
      valid: false,
      errors: [{ message: `Unknown output type: ${type}` }],
      data: null
    };
  }

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    convert: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value
    }));

    return {
      valid: false,
      errors,
      data: null
    };
  }

  return {
    valid: true,
    errors: [],
    data: value
  };
}

/**
 * Validate array of outputs
 * @param {string} type - Response type to validate
 * @returns {function} - Validation function
 */
function validateOutputArray(type) {
  return (items) => {
    if (!Array.isArray(items)) {
      return {
        valid: false,
        errors: [{ message: 'Expected array of items' }],
        data: null
      };
    }

    const results = items.map((item, index) => ({
      index,
      ...validateOutput(type, item)
    }));

    const failed = results.filter(r => !r.valid);

    if (failed.length > 0) {
      return {
        valid: false,
        errors: failed.map(f => ({
          index: f.index,
          ...f.errors
        })),
        data: null
      };
    }

    return {
      valid: true,
      errors: [],
      data: results.map(r => r.data)
    };
  };
}

/**
 * Fallback response generators for when validation fails
 */
const fallbackResponses = {
  riskPrediction: () => ({
    risk_score: 0.5,
    risk_level: 'Medium',
    confidence: 0.5,
    model_used: 'fallback',
    top_factors: [
      { feature: 'Validation Error', value: 0, impact_weight: 0.33 },
      { feature: 'Using Default', value: 0, impact_weight: 0.33 },
      { feature: 'Please Retry', value: 0, impact_weight: 0.34 }
    ],
    recommendations: ['Unable to generate recommendations at this time.']
  }),

  churnPrediction: () => ({
    churn_probability: 0.5,
    churn_level: 'medium',
    model_used: 'fallback'
  }),

  anomalyDetection: () => ({
    anomaly_scores: [],
    flagged_contributors: [],
    model_used: 'fallback'
  }),

  generatedContent: (prompt) => ({
    content: JSON.stringify({
      error: 'Content generation failed',
      original_prompt: prompt?.substring(0, 100)
    }),
    version: 'v1',
    timestamp: new Date().toISOString(),
    tokens_used: 0,
    model: 'fallback'
  }),

  benchmarkData: () => ({
    health_score: 50,
    momentum_score: 50,
    risk_index: 50,
    velocity_index: 50,
    stability_index: 50,
    insight: 'Unable to generate benchmark data at this time.'
  })
};

/**
 * Safe validation with fallback
 * Returns validated data or fallback response
 */
function validateWithFallback(type, data, logger = null) {
  const result = validateOutput(type, data);

  if (result.valid) {
    return { success: true, data: result.data };
  }

  // Log validation failure
  if (logger) {
    logger.warn({
      type: 'output_validation_failed',
      outputType: type,
      errors: result.errors,
      originalData: data
    }, 'Output validation failed, using fallback');
  } else {
    console.warn('Output validation failed:', type, result.errors);
  }

  // Return fallback
  const fallback = fallbackResponses[type] 
    ? fallbackResponses[type](data?.prompt || null)
    : null;

  if (fallback) {
    return { 
      success: false, 
      data: fallback,
      fallback: true,
      validationErrors: result.errors
    };
  }

  return {
    success: false,
    data: null,
    fallback: false,
    validationErrors: result.errors
  };
}

/**
 * Data integrity checker
 * Verifies consistency between related fields
 */
function checkIntegrity(data, rules) {
  const violations = [];

  for (const rule of rules) {
    const { field, condition, message } = rule;

    if (!condition(data[field], data)) {
      violations.push({ field, message });
    }
  }

  return {
    valid: violations.length === 0,
    violations
  };
}

module.exports = {
  outputSchemas,
  validateOutput,
  validateOutputArray,
  validateWithFallback,
  fallbackResponses,
  checkIntegrity
};
