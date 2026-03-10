/**
 * Database Migration: A/B Prompt Experimentation Framework
 * Phase 2: Adds tables for prompt versioning, A/B testing, and experiment tracking
 */

const { pool } = require('../db');

const migrationSQL = `
-- ============================================
-- PROMPT EXPERIMENTATION TABLES
-- ============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Prompt versions table
CREATE TABLE IF NOT EXISTS prompt_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_type VARCHAR(50) NOT NULL, -- 'analysis', 'summary', 'risk_assessment', etc.
  version VARCHAR(20) NOT NULL,
  
  -- Prompt content
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  few_shot_examples JSONB DEFAULT '[]',
  
  -- Version metadata
  description TEXT,
  changelog TEXT,
  parent_version_id UUID REFERENCES prompt_versions(id),
  
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
CREATE TABLE IF NOT EXISTS prompt_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL,
  user_id UUID,
  prompt_version_id UUID REFERENCES prompt_versions(id),
  assignment_group VARCHAR(50), -- 'control', 'variant_a', 'variant_b'
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, prompt_version_id)
);

-- Experiment metrics snapshots
CREATE TABLE IF NOT EXISTS experiment_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id UUID REFERENCES prompt_versions(id),
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

-- Indexes for prompt experiments
CREATE INDEX IF NOT EXISTS idx_prompt_versions_type ON prompt_versions(prompt_type);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_status ON prompt_versions(status);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_active ON prompt_versions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_prompt_assignments_session ON prompt_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_prompt_assignments_version ON prompt_assignments(prompt_version_id);
CREATE INDEX IF NOT EXISTS idx_experiment_snapshots_experiment ON experiment_snapshots(experiment_id);
CREATE INDEX IF NOT EXISTS idx_experiment_snapshots_time ON experiment_snapshots(snapshot_time DESC);
`;

async function runMigration() {
  console.log('Running prompt experimentation migration...');
  
  try {
    await pool.query(migrationSQL);
    console.log('✅ Prompt experimentation tables created successfully');
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
