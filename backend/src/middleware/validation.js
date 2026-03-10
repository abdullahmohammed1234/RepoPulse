/**
 * Input Validation Layer
 * Comprehensive validation for all user inputs with edge case handling
 */

const Joi = require('joi');

/**
 * Validation schemas for different input types
 */
const schemas = {
  // Repository analysis input
  analyzeRepository: Joi.object({
    repoUrl: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .pattern(/github\.com[\/][a-zA-Z0-9-]+[\/][a-zA-Z0-9-_.]+/)
      .max(500)
      .required()
      .messages({
        'string.uri': 'Invalid repository URL format',
        'string.pattern.base': 'URL must be a valid GitHub repository URL',
        'string.max': 'URL exceeds maximum length of 500 characters',
        'any.required': 'Repository URL is required'
      }),

    userId: Joi.string()
      .uuid()
      .optional()
      .messages({
        'string.guid': 'Invalid user ID format'
      })
  }),

  // PR Simulation input
  simulatePR: Joi.object({
    lines_added: Joi.number()
      .integer()
      .min(0)
      .max(100000)
      .required()
      .messages({
        'number.integer': 'Lines added must be an integer',
        'number.min': 'Lines added cannot be negative',
        'number.max': 'Lines added exceeds maximum (100,000)',
        'any.required': 'Lines added is required'
      }),

    lines_deleted: Joi.number()
      .integer()
      .min(0)
      .max(100000)
      .required()
      .messages({
        'number.integer': 'Lines deleted must be an integer',
        'number.min': 'Lines deleted cannot be negative',
        'number.max': 'Lines deleted exceeds maximum (100,000)',
        'any.required': 'Lines deleted is required'
      }),

    files_changed: Joi.number()
      .integer()
      .min(0)
      .max(1000)
      .required()
      .messages({
        'number.integer': 'Files changed must be an integer',
        'number.min': 'Files changed cannot be negative',
        'number.max': 'Files changed exceeds maximum (1,000)',
        'any.required': 'Files changed is required'
      }),

    commits_count: Joi.number()
      .integer()
      .min(0)
      .max(500)
      .required()
      .messages({
        'number.integer': 'Commits count must be an integer',
        'number.min': 'Commits count cannot be negative',
        'number.max': 'Commits count exceeds maximum (500)',
        'any.required': 'Commits count is required'
      }),

    contributor_id: Joi.number()
      .integer()
      .positive()
      .optional()
      .allow(null)
      .messages({
        'number.integer': 'Contributor ID must be an integer',
        'number.positive': 'Contributor ID must be positive'
      }),

    target_files: Joi.array()
      .items(Joi.number().integer().positive())
      .max(50)
      .optional()
      .messages({
        'array.max': 'Target files list exceeds maximum (50)',
        'number.integer': 'File ID must be an integer',
        'number.positive': 'File ID must be positive'
      })
  }),

  // Benchmark computation input
  computeBenchmark: Joi.object({
    repositoryIds: Joi.array()
      .items(Joi.number().integer().positive())
      .max(100)
      .optional()
      .messages({
        'array.max': 'Repository list exceeds maximum (100)'
      }),

    forceRefresh: Joi.boolean()
      .optional()
      .default(false)
  }),

  // Generation/Ai input with prompt injection prevention
  generateContent: Joi.object({
    prompt: Joi.string()
      .min(1)
      .max(10000)
      .required()
      .custom((value, helpers) => {
        // Prompt injection detection
        const injectionPatterns = [
          /ignore\s+(previous|above|all|prior)\s+(instructions?|rules?|prompts?)/i,
          /system\s*:\s*/i,
          /<system>/i,
          /override\s+(security|safety)/i,
          /you\s+are\s+(now|no\s+longer)/i,
          /forget\s+(everything|all|what)/i,
          /new\s+instructions/i,
          /#\#\#system/i,
          /\[SYSTEM\]/i
        ];

        for (const pattern of injectionPatterns) {
          if (pattern.test(value)) {
            return helpers.error('string.promptInjection');
          }
        }

        return value;
      })
      .messages({
        'string.min': 'Prompt cannot be empty',
        'string.max': 'Prompt exceeds maximum length (10,000 characters)',
        'any.required': 'Prompt is required',
        'string.promptInjection': 'Prompt contains potentially malicious content'
      }),

    userId: Joi.string()
      .uuid()
      .optional()
      .messages({
        'string.guid': 'Invalid user ID format'
      }),

    context: Joi.object({
      repositoryId: Joi.number()
        .integer()
        .positive()
        .optional(),

      section: Joi.string()
        .valid('summary', 'recommendations', 'analysis', 'risk_factors', 'all')
        .optional()
        .default('all'),

      previousVersions: Joi.array()
        .items(Joi.string().uuid())
        .max(5)
        .optional()
    })
    .optional(),

    preferences: Joi.object({
      tone: Joi.string()
        .valid('formal', 'casual', 'persuasive', 'technical')
        .optional(),

      length: Joi.string()
        .valid('short', 'medium', 'long')
        .optional(),

      format: Joi.string()
        .valid('json', 'markdown', 'html', 'text')
        .optional()
        .default('json')
    })
    .optional()
  }),

  // User preferences update
  updatePreferences: Joi.object({
    userId: Joi.string().optional(),
    tone: Joi.string()
      .valid('formal', 'casual', 'persuasive', 'technical')
      .optional(),

    length: Joi.string()
      .valid('short', 'medium', 'long')
      .optional(),

    format: Joi.string()
      .valid('pdf', 'markdown', 'json', 'notion')
      .optional(),

    industry: Joi.string()
      .max(100)
      .optional(),

    customInstructions: Joi.string()
      .max(2000)
      .optional()
  }),

  // Pagination
  pagination: Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .default(1),

    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(20)
  }),

  // Version restore
  restoreVersion: Joi.object({
    versionId: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.guid': 'Invalid version ID format',
        'any.required': 'Version ID is required'
      }),

    userId: Joi.string()
      .uuid()
      .optional()
  })
};

/**
 * Validation middleware factory
 * @param {string} schemaName - Name of the schema to use
 * @param {string} source - Source of data (body, query, params)
 */
function validate(schemaName, source = 'body') {
  const schema = schemas[schemaName];
  
  if (!schema) {
    throw new Error(`Unknown schema: ${schemaName}`);
  }

  return (req, res, next) => {
    let data;

    switch (source) {
      case 'query':
        data = req.query;
        break;
      case 'params':
        data = req.params;
        break;
      case 'body':
      default:
        data = req.body;
    }

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    // Replace data with validated and sanitized value
    switch (source) {
      case 'query':
        req.query = value;
        break;
      case 'params':
        req.params = value;
        break;
      case 'body':
      default:
        req.body = value;
    }

    next();
  };
}

/**
 * Additional validation helpers
 */
const validators = {
  // Validate repository ID
  isValidRepoId: (value) => {
    const num = parseInt(value);
    return !isNaN(num) && num > 0;
  },

  // Validate UUID
  isValidUUID: (value) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  },

  // Sanitize string input (prevent XSS)
  sanitizeString: (value) => {
    if (typeof value !== 'string') return value;
    return value
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#x27;');
  },

  // Validate numeric range
  isInRange: (value, min, max) => {
    const num = parseFloat(value);
    return !isNaN(num) && num >= min && num <= max;
  },

  // Check for potentially malicious patterns
  containsMaliciousPattern: (value) => {
    if (typeof value !== 'string') return false;
    
    const maliciousPatterns = [
      /<script/i,
      /javascript:/i,
      /onerror=/i,
      /onclick=/i,
      /eval\(/i,
      /document\./i,
      /window\./i
    ];

    return maliciousPatterns.some(pattern => pattern.test(value));
  }
};

module.exports = {
  schemas,
  validate,
  validators
};
