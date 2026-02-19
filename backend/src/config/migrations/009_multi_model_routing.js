/**
 * Database Migration: Multi-Model Routing Layer
 * Phase 5: Adds tables for cost tracking and model routing
 */

const { pool } = require('../db');

const migrationSQL = `
-- ============================================
-- MULTI-MODEL ROUTING TABLES
-- ============================================

-- Token usage tracking
CREATE TABLE IF NOT EXISTS token_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  session_id UUID,
  
  -- Request details
  request_id UUID,
  model_id VARCHAR(100) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  prompt_type VARCHAR(50),
  
  -- Token counts
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  
  -- Cost calculation
  cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  
  -- Latency
  latency_ms INTEGER,
  
  -- Routing info
  task_type VARCHAR(20),
  routing_decision VARCHAR(50),
  failover_used BOOLEAN DEFAULT false,
  original_model VARCHAR(100),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_token_usage_user ON token_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage(session_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_prompt_type ON token_usage(prompt_type);
CREATE INDEX IF NOT EXISTS idx_token_usage_time ON token_usage(created_at DESC);

-- Daily cost aggregation
CREATE TABLE IF NOT EXISTS daily_cost_aggregation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  user_id UUID,
  
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

CREATE INDEX IF NOT EXISTS idx_daily_cost_date ON daily_cost_aggregation(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_cost_user ON daily_cost_aggregation(user_id);

-- User budget tracking
CREATE TABLE IF NOT EXISTS user_budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE,
  
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

CREATE INDEX IF NOT EXISTS idx_user_budgets_user ON user_budgets(user_id);

-- Model availability and health
CREATE TABLE IF NOT EXISTS model_health (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id VARCHAR(100) NOT NULL UNIQUE,
  provider VARCHAR(50) NOT NULL,
  
  -- Status
  status VARCHAR(20) DEFAULT 'available',
  -- available, degraded, unavailable, unknown
  
  -- Metrics
  avg_latency_ms INTEGER,
  success_rate DECIMAL(5, 2) DEFAULT 100.00,
  total_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,
  
  -- Circuit breaker
  failure_count INTEGER DEFAULT 0,
  circuit_state VARCHAR(20) DEFAULT 'closed',
  -- closed, open, half-open
  last_failure_at TIMESTAMP,
  next_attempt_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_model_health_model ON model_health(model_id);
CREATE INDEX IF NOT EXISTS idx_model_health_status ON model_health(status);

-- Failover log
CREATE TABLE IF NOT EXISTS failover_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID,
  original_model VARCHAR(100) NOT NULL,
  fallback_model VARCHAR(100) NOT NULL,
  
  -- Result
  success BOOLEAN NOT NULL,
  error_message TEXT,
  
  -- Timing
  failover_time_ms INTEGER,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_failover_log_request ON failover_log(request_id);
CREATE INDEX IF NOT EXISTS idx_failover_log_time ON failover_log(created_at DESC);
`;

async function runMigration() {
  console.log('Running multi-model routing migration...');
  
  try {
    await pool.query(migrationSQL);
    console.log('✅ Multi-model routing tables created successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  runMigration();
}

module.exports = { migrationSQL, runMigration };
