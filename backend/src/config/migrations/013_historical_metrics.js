/**
 * Migration: Add Historical Metrics & Trend Analysis Tables
 * Phase 4: Trend Analysis & Historical Insights
 */

const { pool } = require('../db');

const migrationSQL = `
-- Historical Repository Health Scores (track changes over time)
CREATE TABLE IF NOT EXISTS repository_health_history (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  health_score INTEGER NOT NULL,
  momentum_score FLOAT DEFAULT 0,
  churn_index FLOAT DEFAULT 0,
  risk_index FLOAT DEFAULT 0,
  velocity_index FLOAT DEFAULT 0,
  anomaly_count INTEGER DEFAULT 0,
  active_contributors INTEGER DEFAULT 0,
  open_prs INTEGER DEFAULT 0,
  merged_prs INTEGER DEFAULT 0,
  avg_pr_risk FLOAT DEFAULT 0,
  avg_merge_time_hours FLOAT DEFAULT 0,
  total_commits INTEGER DEFAULT 0,
  total_additions INTEGER DEFAULT 0,
  total_deletions INTEGER DEFAULT 0,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(repository_id, recorded_at)
);

-- Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_health_history_repo_time 
ON repository_health_history(repository_id, recorded_at DESC);

-- Repository Trend Analysis (computed daily snapshots)
CREATE TABLE IF NOT EXISTS repository_trends (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Health trend direction
  health_trend VARCHAR(20) DEFAULT 'stable', -- improving, declining, stable
  health_change INTEGER DEFAULT 0,
  
  -- Activity metrics
  pr_count INTEGER DEFAULT 0,
  pr_merged_count INTEGER DEFAULT 0,
  pr_merged_rate FLOAT DEFAULT 0,
  commit_count INTEGER DEFAULT 0,
  contributor_count INTEGER DEFAULT 0,
  
  -- Risk metrics
  avg_risk_score FLOAT DEFAULT 0,
  high_risk_prs INTEGER DEFAULT 0,
  
  -- Velocity metrics
  avg_merge_time_hours FLOAT DEFAULT 0,
  merge_velocity_change FLOAT DEFAULT 0,
  
  -- Churn metrics
  file_churn_avg FLOAT DEFAULT 0,
  hotspot_file_count INTEGER DEFAULT 0,
  
  -- Predictions (ML-based)
  churn_risk_score FLOAT DEFAULT 0,
  churn_prediction_30d FLOAT DEFAULT 0,
  risk_prediction_30d FLOAT DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(repository_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_repo_trends_time 
ON repository_trends(repository_id, period_start DESC);

-- Overall System Trend Snapshots (daily aggregated metrics)
CREATE TABLE IF NOT EXISTS system_trends (
  id SERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL UNIQUE,
  
  -- Aggregate counts
  total_repositories INTEGER DEFAULT 0,
  active_repositories INTEGER DEFAULT 0,
  total_users INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 0,
  
  -- Health distribution
  avg_health_score FLOAT DEFAULT 0,
  healthy_repos INTEGER DEFAULT 0,
  at_risk_repos INTEGER DEFAULT 0,
  critical_repos INTEGER DEFAULT 0,
  
  -- Activity totals
  total_prs INTEGER DEFAULT 0,
  total_merged_prs INTEGER DEFAULT 0,
  total_commits INTEGER DEFAULT 0,
  
  -- Trend indicators
  improving_repos INTEGER DEFAULT 0,
  declining_repos INTEGER DEFAULT 0,
  stable_repos INTEGER DEFAULT 0,
  
  -- Predictions
  predicted_churn_30d FLOAT DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_trends_date ON system_trends(snapshot_date DESC);
`;

async function migrate() {
  try {
    console.log('🔄 Running historical metrics migration...');
    await pool.query(migrationSQL);
    console.log('✅ Historical metrics tables created successfully!');
    
    // Verify tables
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('repository_health_history', 'repository_trends', 'system_trends')
    `);
    
    console.log('\n📋 Created tables:');
    tables.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    console.log('\n✅ Historical metrics migration complete!');
  } catch (error) {
    console.error('❌ Historical metrics migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate, migrationSQL };
