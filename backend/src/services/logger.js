/**
 * Structured Logging Service
 * Production-grade logging with correlation IDs, metrics, and event tracking
 */

const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

/**
 * Log levels configuration
 */
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

/**
 * Custom format for structured logging
 */
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    const log = {
      timestamp,
      level: level.toUpperCase(),
      message,
      service: process.env.SERVICE_NAME || 'repopulse',
      environment: process.env.NODE_ENV || 'development',
      ...metadata
    };

    // Clean up undefined values
    Object.keys(log).forEach(key => {
      if (log[key] === undefined) {
        delete log[key];
      }
    });

    return JSON.stringify(log);
  })
);

/**
 * Console format with colors for development
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata, null, 2)}`;
    }
    
    return msg;
  })
);

/**
 * Create logger instance
 */
const logger = winston.createLogger({
  levels: LOG_LEVELS,
  level: process.env.LOG_LEVEL || 'info',
  format: structuredFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat
    })
  ]
});

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({ 
    filename: 'logs/error.log', 
    level: 'error',
    maxsize: 10485760, // 10MB
    maxFiles: 5
  }));
  
  logger.add(new winston.transports.File({ 
    filename: 'logs/combined.log',
    maxsize: 10485760,
    maxFiles: 5
  }));
}

/**
 * Request correlation middleware
 */
function correlationMiddleware(req, res, next) {
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
}

/**
 * Create child logger with additional context
 */
function createChildLogger(context) {
  return logger.child(context);
}

/**
 * Log levels and their specific event types
 */
const EVENT_TYPES = {
  // User events
  USER_ACTION: 'user_action',
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  
  // Generation events
  GENERATE_START: 'generate_start',
  GENERATE_COMPLETE: 'generate_complete',
  GENERATE_ERROR: 'generate_error',
  REGENERATE_SECTION: 'regenerate_section',
  
  // ML events
  ML_PREDICTION_START: 'ml_prediction_start',
  ML_PREDICTION_COMPLETE: 'ml_prediction_complete',
  ML_PREDICTION_ERROR: 'ml_prediction_error',
  
  // Version events
  VERSION_CREATE: 'version_create',
  VERSION_RESTORE: 'version_restore',
  VERSION_COMPARE: 'version_compare',
  
  // Feedback events
  FEEDBACK_SUBMITTED: 'feedback.submitted',
  FEEDBACK_EDIT_DETECTED: 'feedback.edit_detected',
  FEEDBACK_SECTION_RATED: 'feedback.section_rated',
  FEEDBACK_REGENERATE_REQUESTED: 'feedback.regenerate_requested',
  
  // Export events
  EXPORT_START: 'export_start',
  EXPORT_COMPLETE: 'export_complete',
  EXPORT_ERROR: 'export_error',
  
  // System events
  API_REQUEST: 'api_request',
  API_RESPONSE: 'api_response',
  RATE_LIMIT_HIT: 'rate_limit_hit',
  CIRCUIT_BREAKER_OPEN: 'circuit_breaker_open',
  VALIDATION_ERROR: 'validation_error',
  
  // Performance events
  PERFORMANCE_WARNING: 'performance_warning',
  TIMEOUT_ERROR: 'timeout_error'
};

/**
 * Structured logging helper
 */
const log = {
  // Basic logging
  error: (message, meta = {}) => logger.error(message, meta),
  warn: (message, meta = {}) => logger.warn(message, meta),
  info: (message, meta = {}) => logger.info(message, meta),
  http: (message, meta = {}) => logger.http(message, meta),
  debug: (message, meta = {}) => logger.debug(message, meta),

  // API request/response logging
  apiRequest: (req, meta = {}) => {
    logger.http('API Request', {
      event: EVENT_TYPES.API_REQUEST,
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      query: req.query,
      body: sanitizeBody(req.body),
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.id,
      ...meta
    });
  },

  apiResponse: (req, res, meta = {}) => {
    logger.http('API Response', {
      event: EVENT_TYPES.API_RESPONSE,
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime: meta.responseTime,
      ...meta
    });
  },

  // Generation event logging
  generateStart: (prompt, userId, meta = {}) => {
    logger.info('Generation started', {
      event: EVENT_TYPES.GENERATE_START,
      userId,
      promptLength: prompt?.length,
      promptHash: hashString(prompt),
      timestamp: new Date().toISOString(),
      ...meta
    });
  },

  generateComplete: (result, userId, meta = {}) => {
    logger.info('Generation completed', {
      event: EVENT_TYPES.GENERATE_COMPLETE,
      userId,
      tokensUsed: result?.tokens_used,
      latency: result?.latency,
      model: result?.model,
      version: result?.version,
      timestamp: new Date().toISOString(),
      ...meta
    });
  },

  generateError: (error, userId, meta = {}) => {
    logger.error('Generation error', {
      event: EVENT_TYPES.GENERATE_ERROR,
      userId,
      errorMessage: error.message,
      errorStack: error.stack,
      timestamp: new Date().toISOString(),
      ...meta
    });
  },

  // ML prediction logging
  mlPredictionStart: (type, features, meta = {}) => {
    logger.info('ML Prediction started', {
      event: EVENT_TYPES.ML_PREDICTION_START,
      predictionType: type,
      featuresKeys: Object.keys(features || {}),
      timestamp: new Date().toISOString(),
      ...meta
    });
  },

  mlPredictionComplete: (type, result, latency, meta = {}) => {
    logger.info('ML Prediction completed', {
      event: EVENT_TYPES.ML_PREDICTION_COMPLETE,
      predictionType: type,
      latency,
      resultKeys: Object.keys(result || {}),
      timestamp: new Date().toISOString(),
      ...meta
    });
  },

  mlPredictionError: (type, error, meta = {}) => {
    logger.error('ML Prediction error', {
      event: EVENT_TYPES.ML_PREDICTION_ERROR,
      predictionType: type,
      errorMessage: error.message,
      errorCode: error.code,
      timestamp: new Date().toISOString(),
      ...meta
    });
  },

  // Version logging
  versionCreate: (versionId, userId, meta = {}) => {
    logger.info('Version created', {
      event: EVENT_TYPES.VERSION_CREATE,
      versionId,
      userId,
      timestamp: new Date().toISOString(),
      ...meta
    });
  },

  versionRestore: (versionId, userId, meta = {}) => {
    logger.info('Version restored', {
      event: EVENT_TYPES.VERSION_RESTORE,
      versionId,
      userId,
      timestamp: new Date().toISOString(),
      ...meta
    });
  },

  // Export logging
  exportStart: (format, userId, meta = {}) => {
    logger.info('Export started', {
      event: EVENT_TYPES.EXPORT_START,
      exportFormat: format,
      userId,
      timestamp: new Date().toISOString(),
      ...meta
    });
  },

  exportComplete: (format, userId, meta = {}) => {
    logger.info('Export completed', {
      event: EVENT_TYPES.EXPORT_COMPLETE,
      exportFormat: format,
      userId,
      timestamp: new Date().toISOString(),
      ...meta
    });
  },

  // Regenerate section logging
  regenerateSection: (section, userId, meta = {}) => {
    logger.info('Section regenerated', {
      event: EVENT_TYPES.REGENERATE_SECTION,
      section,
      userId,
      timestamp: new Date().toISOString(),
      ...meta
    });
  },

  // Error logging with stack trace
  logError: (error, context = {}) => {
    logger.error(error.message, {
      errorName: error.name,
      errorStack: error.stack,
      ...context
    });
  },

  // Rate limit logging
  rateLimitHit: (userId, limit, window, meta = {}) => {
    logger.warn('Rate limit hit', {
      event: EVENT_TYPES.RATE_LIMIT_HIT,
      userId,
      limit,
      window,
      timestamp: new Date().toISOString(),
      ...meta
    });
  },

  // Validation error logging
  validationError: (errors, context = {}) => {
    logger.warn('Validation error', {
      event: EVENT_TYPES.VALIDATION_ERROR,
      errors,
      timestamp: new Date().toISOString(),
      ...context
    });
  },

  // Performance logging
  performanceWarning: (operation, duration, threshold, meta = {}) => {
    logger.warn('Performance warning', {
      event: EVENT_TYPES.PERFORMANCE_WARNING,
      operation,
      duration,
      threshold,
      timestamp: new Date().toISOString(),
      ...meta
    });
  },

  timeoutError: (operation, meta = {}) => {
    logger.error('Timeout error', {
      event: EVENT_TYPES.TIMEOUT_ERROR,
      operation,
      timeout: meta.timeout,
      timestamp: new Date().toISOString(),
      ...meta
    });
  }
};

/**
 * Metrics collection (simple in-memory for now)
 */
class MetricsCollector {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        success: 0,
        errors: 0,
        byEndpoint: {}
      },
      generations: {
        total: 0,
        tokensUsed: 0,
        latencySum: 0
      },
      mlPredictions: {
        total: 0,
        latencySum: 0,
        byType: {}
      },
      exports: {
        total: 0,
        byFormat: {}
      }
    };
  }

  recordRequest(endpoint, success = true) {
    this.metrics.requests.total++;
    if (success) {
      this.metrics.requests.success++;
    } else {
      this.metrics.requests.errors++;
    }
    
    if (!this.metrics.requests.byEndpoint[endpoint]) {
      this.metrics.requests.byEndpoint[endpoint] = { total: 0, success: 0, errors: 0 };
    }
    this.metrics.requests.byEndpoint[endpoint].total++;
    if (success) {
      this.metrics.requests.byEndpoint[endpoint].success++;
    } else {
      this.metrics.requests.byEndpoint[endpoint].errors++;
    }
  }

  recordGeneration(tokensUsed, latency) {
    this.metrics.generations.total++;
    this.metrics.generations.tokensUsed += tokensUsed || 0;
    this.metrics.generations.latencySum += latency || 0;
  }

  recordMLPrediction(type, latency) {
    this.metrics.mlPredictions.total++;
    this.metrics.mlPredictions.latencySum += latency || 0;
    
    if (!this.metrics.mlPredictions.byType[type]) {
      this.metrics.mlPredictions.byType[type] = { total: 0, latencySum: 0 };
    }
    this.metrics.mlPredictions.byType[type].total++;
    this.metrics.mlPredictions.byType[type].latencySum += latency || 0;
  }

  recordExport(format) {
    this.metrics.exports.total++;
    if (!this.metrics.exports.byFormat[format]) {
      this.metrics.exports.byFormat[format] = 0;
    }
    this.metrics.exports.byFormat[format]++;
  }

  getMetrics() {
    return {
      ...this.metrics,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      generatedAt: new Date().toISOString()
    };
  }

  reset() {
    this.metrics = {
      requests: { total: 0, success: 0, errors: 0, byEndpoint: {} },
      generations: { total: 0, tokensUsed: 0, latencySum: 0 },
      mlPredictions: { total: 0, latencySum: 0, byType: {} },
      exports: { total: 0, byFormat: {} }
    };
  }
}

// Create global metrics collector
const metrics = new MetricsCollector();

/**
 * Helper functions
 */
function sanitizeBody(body) {
  if (!body) return undefined;
  
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'authorization'];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

function hashString(str) {
  if (!str) return undefined;
  // Simple hash for tracking without storing actual content
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

module.exports = {
  logger,
  log,
  metrics,
  correlationMiddleware,
  createChildLogger,
  EVENT_TYPES,
  MetricsCollector
};
