const { pool } = require('./db');

const migrationSQL = `
-- Add missing columns to pull_requests table
ALTER TABLE pull_requests ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20);
ALTER TABLE pull_requests ADD COLUMN IF NOT EXISTS top_factors JSONB;
ALTER TABLE pull_requests ADD COLUMN IF NOT EXISTS recommendations JSONB;

-- Add insights_summary and last_analyzed_at columns to repositories table
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS insights_summary TEXT;
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS last_analyzed_at TIMESTAMP;

-- Create repository_metrics table for benchmarking
CREATE TABLE IF NOT EXISTS repository_metrics (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  health_score FLOAT DEFAULT 0,
  momentum_score FLOAT DEFAULT 0,
  avg_pr_risk FLOAT DEFAULT 0,
  merge_velocity FLOAT DEFAULT 0,
  churn_index FLOAT DEFAULT 0,
  anomaly_count INTEGER DEFAULT 0,
  risk_index FLOAT DEFAULT 0,
  velocity_index FLOAT DEFAULT 0,
  stability_index FLOAT DEFAULT 0,
  health_percentile FLOAT,
  momentum_percentile FLOAT,
  risk_percentile FLOAT,
  velocity_percentile FLOAT,
  stability_percentile FLOAT,
  health_zscore FLOAT,
  momentum_zscore FLOAT,
  risk_zscore FLOAT,
  velocity_zscore FLOAT,
  stability_zscore FLOAT,
  analysis_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(repository_id)
);

-- Add missing columns to files table if they don't exist
ALTER TABLE files ADD COLUMN IF NOT EXISTS modification_count INTEGER DEFAULT 0;
ALTER TABLE files ADD COLUMN IF NOT EXISTS total_changes INTEGER DEFAULT 0;

-- Create index on risk_score for better query performance
CREATE INDEX IF NOT EXISTS idx_pull_requests_risk ON pull_requests(risk_score);
`;

async function migrate() {
  try {
    console.log('🔄 Running database migration...');
    await pool.query(migrationSQL);
    console.log('✅ Database migration completed successfully!');
    await pool.end();
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
