/**
 * Retry Service with Exponential Backoff
 * Handles transient failures, timeouts, and rate limits
 */

const axios = require('axios');

/**
 * Retry configuration defaults
 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ENETUNREACH',
    'EAI_AGAIN'
  ],
  timeout: 30000
};

/**
 * Sleep utility for delays
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt, config) {
  const baseDelay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt);
  const maxDelay = Math.min(baseDelay, config.maxDelay);
  
  // Add jitter (0-25% of delay) to prevent thundering herd
  const jitter = maxDelay * Math.random() * 0.25;
  
  return maxDelay + jitter;
}

/**
 * Check if error is retryable
 */
function isRetryableError(error, config) {
  // Network errors
  if (error.code && config.retryableErrors.includes(error.code)) {
    return true;
  }

  // HTTP status codes
  if (error.response) {
    const status = error.response.status;
    return config.retryableStatuses.includes(status);
  }

  // Timeout
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return true;
  }

  return false;
}

/**
 * Get rate limit retry delay from headers
 */
function getRateLimitDelay(error) {
  if (!error.response) return null;
  
  const headers = error.response.headers;
  
  // Check for Retry-After header
  if (headers['retry-after']) {
    const seconds = parseInt(headers['retry-after']);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }
  }

  // Check for X-RateLimit-Reset header
  if (headers['x-ratelimit-reset']) {
    const resetTime = parseInt(headers['x-ratelimit-reset']) * 1000;
    const now = Date.now();
    if (resetTime > now) {
      return resetTime - now;
    }
  }

  return null;
}

/**
 * Retry wrapper for any async function
 */
async function withRetry(fn, config = {}) {
  const options = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError;
  
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      const isLastAttempt = attempt === options.maxRetries;
      const canRetry = isRetryableError(error, options);
      
      if (!canRetry || isLastAttempt) {
        // Don't retry - either not retryable or out of retries
        break;
      }

      // Calculate delay
      let delay = calculateDelay(attempt, options);
      
      // Check for rate limiting
      const rateLimitDelay = getRateLimitDelay(error);
      if (rateLimitDelay) {
        delay = Math.max(delay, rateLimitDelay);
      }

      console.log(`Retry attempt ${attempt + 1}/${options.maxRetries} after ${Math.round(delay)}ms...`);
      
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Axios client with built-in retry logic
 */
function createRetryClient(axiosConfig = {}, retryConfig = {}) {
  const client = axios.create({
    ...axiosConfig,
    timeout: axiosConfig.timeout || DEFAULT_RETRY_CONFIG.timeout
  });

  // Response interceptor for logging
  client.interceptors.response.use(
    response => response,
    async error => {
      const config = error.config;
      
      // Don't retry if no config or already retried
      if (!config || config.__retryCount >= retryConfig.maxRetries) {
        return Promise.reject(error);
      }

      // Check if retryable
      if (!isRetryableError(error, retryConfig)) {
        return Promise.reject(error);
      }

      // Set retry count
      config.__retryCount = config.__retryCount || 0;
      config.__retryCount++;

      // Calculate delay
      let delay = calculateDelay(config.__retryCount - 1, retryConfig);
      const rateLimitDelay = getRateLimitDelay(error);
      if (rateLimitDelay) {
        delay = Math.max(delay, rateLimitDelay);
      }

      console.log(`Axios retry ${config.__retryCount}/${retryConfig.maxRetries} after ${Math.round(delay)}ms`);

      await sleep(delay);
      return client(config);
    }
  );

  return client;
}

/**
 * Circuit breaker pattern for ML service
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 60000; // 1 minute
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      // Check if timeout has passed
      if (Date.now() - this.lastFailureTime >= this.timeout) {
        this.state = 'HALF_OPEN';
        console.log('Circuit breaker: HALF_OPEN');
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = 'CLOSED';
        this.successes = 0;
        console.log('Circuit breaker: CLOSED');
      }
    }
  }

  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      console.log('Circuit breaker: OPEN');
    }
  }

  getState() {
    return this.state;
  }

  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
  }
}

/**
 * Rate limiter with token bucket algorithm
 */
class RateLimiter {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 100;
    this.refillRate = options.refillRate || 10; // tokens per second
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(tokens = 1) {
    this.refill();
    
    while (this.tokens < tokens) {
      const waitTime = ((tokens - this.tokens) / this.refillRate) * 1000;
      await sleep(Math.min(waitTime, 1000));
      this.refill();
    }

    this.tokens -= tokens;
    return true;
  }

  refill() {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  getAvailableTokens() {
    this.refill();
    return Math.floor(this.tokens);
  }
}

module.exports = {
  DEFAULT_RETRY_CONFIG,
  withRetry,
  createRetryClient,
  CircuitBreaker,
  RateLimiter,
  isRetryableError,
  calculateDelay
};
