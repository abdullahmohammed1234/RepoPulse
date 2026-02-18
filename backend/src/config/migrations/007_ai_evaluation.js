/**
 * Database Migration: AI Self-Evaluation System
 * Phase 3: Adds tables for evaluation caching
 */

const { pool } = require('../db');

const migrationSQL = `
-- ============================================
-- AI EVALUATION TABLES
-- ============================================

-- Evaluation cache for cost optimization
CREATE TABLE IF NOT EXISTS evaluation_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cache_key VARCHAR(64) NOT NULL UNIQUE,
  prompt_type VARCHAR(50) NOT NULL,
  evaluation_result JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_evaluation_cache_key ON evaluation_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_evaluation_cache_prompt ON evaluation_cache(prompt_type);
CREATE INDEX IF NOT EXISTS idx_evaluation_cache_time ON evaluation_cache(created_at DESC);

-- Store evaluation history for analytics
CREATE TABLE IF NOT EXISTS evaluation_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  generation_id UUID,
  output_hash VARCHAR(64),
  prompt_type VARCHAR(50) NOT NULL,
  
  -- Scores
  clarity_score FLOAT,
  completeness_score FLOAT,
  structure_score FLOAT,
  redundancy_score FLOAT,
  consistency_score FLOAT,
  overall_score FLOAT NOT NULL,
  
  -- Details
  evaluation_details JSONB,
  improvement_applied BOOLEAN DEFAULT false,
  improvement_output TEXT,
  
  -- Context
  latency_ms INTEGER,
  tokens_used INTEGER,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_evaluation_history_generation ON evaluation_history(generation_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_history_prompt ON evaluation_history(prompt_type);
CREATE INDEX IF NOT EXISTS idx_evaluation_history_score ON evaluation_history(overall_score);
CREATE INDEX IF NOT EXISTS idx_evaluation_history_time ON evaluation_history(created_at DESC);
`;

async function runMigration() {
  console.log('Running AI evaluation migration...');
  
  try {
    await pool.query(migrationSQL);
    console.log('✅ AI evaluation tables created successfully');
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
