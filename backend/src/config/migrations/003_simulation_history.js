/**
 * Database Migration: Simulation History
 * Adds table for storing PR risk simulations
 */

const { pool } = require('../db');

const migrationSQL = `
-- ============================================
-- SIMULATIONS (PR Risk Analysis History)
-- ============================================

-- Simulations for storing PR risk analysis results
CREATE TABLE IF NOT EXISTS simulations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  
  -- Input parameters
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_deleted INTEGER NOT NULL DEFAULT 0,
  files_changed INTEGER NOT NULL DEFAULT 0,
  commits_count INTEGER NOT NULL DEFAULT 0,
  contributor_id INTEGER,
  target_files INTEGER[] DEFAULT '{}',
  
  -- Risk analysis results
  risk_score FLOAT NOT NULL,
  risk_level VARCHAR(50) NOT NULL,
  risk_vs_repo_avg VARCHAR(50),
  relative_label VARCHAR(50),
  repo_avg_risk FLOAT,
  
  -- Detailed results
  top_factors JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  risk_reduction_estimate JSONB,
  
  -- Computed features
  features JSONB DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_simulations_user_id ON simulations(user_id);
CREATE INDEX idx_simulations_repository_id ON simulations(repository_id);
CREATE INDEX idx_simulations_created_at ON simulations(created_at DESC);
`;

async function runMigration() {
  console.log('Running simulation history migration...');
  
  try {
    await pool.query(migrationSQL);
    console.log('✅ Simulation history migration completed successfully');
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
