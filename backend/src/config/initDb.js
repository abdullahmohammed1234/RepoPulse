const { pool } = require('./db');

const createTablesSQL = `
-- Drop tables if they exist (for fresh setup)
DROP TABLE IF EXISTS repository_metrics CASCADE;
DROP TABLE IF EXISTS anomalies CASCADE;
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS commits CASCADE;
DROP TABLE IF EXISTS pull_requests CASCADE;
DROP TABLE IF EXISTS contributors CASCADE;
DROP TABLE IF EXISTS repositories CASCADE;

-- Repositories table
CREATE TABLE repositories (
  id SERIAL PRIMARY KEY,
  github_id BIGINT UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL UNIQUE,
  owner VARCHAR(255) NOT NULL,
  description TEXT,
  url VARCHAR(500) NOT NULL,
  default_branch VARCHAR(100) DEFAULT 'main',
  language VARCHAR(100),
  stars INTEGER DEFAULT 0,
  forks INTEGER DEFAULT 0,
  open_issues INTEGER DEFAULT 0,
  watchers INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_analyzed_at TIMESTAMP,
  health_score INTEGER,
  insights_summary TEXT,
  is_active BOOLEAN DEFAULT true
);

-- Contributors table
CREATE TABLE contributors (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  github_id BIGINT NOT NULL,
  login VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(500),
  html_url VARCHAR(500),
  contributions INTEGER DEFAULT 0,
  total_commits INTEGER DEFAULT 0,
  total_additions INTEGER DEFAULT 0,
  total_deletions INTEGER DEFAULT 0,
  months_active INTEGER DEFAULT 0,
  experience_score FLOAT DEFAULT 0,
  rejection_rate FLOAT DEFAULT 0,
  anomaly_score FLOAT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(repository_id, github_id)
);

-- Pull Requests table
CREATE TABLE pull_requests (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  contributor_id INTEGER REFERENCES contributors(id) ON DELETE SET NULL,
  github_id BIGINT NOT NULL,
  number INTEGER NOT NULL,
  title VARCHAR(500),
  body TEXT,
  state VARCHAR(50) NOT NULL,
  html_url VARCHAR(500),
  diff_url VARCHAR(500),
  patch_url VARCHAR(500),
  lines_added INTEGER DEFAULT 0,
  lines_deleted INTEGER DEFAULT 0,
  files_changed INTEGER DEFAULT 0,
  commits_count INTEGER DEFAULT 0,
  review_comments INTEGER DEFAULT 0,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  merged_at TIMESTAMP,
  closed_at TIMESTAMP,
  time_to_merge_hours FLOAT,
  risk_score FLOAT,
  risk_level VARCHAR(20),
  top_factors JSONB,
  recommendations JSONB,
  is_merged BOOLEAN DEFAULT false,
  UNIQUE(repository_id, github_id)
);

-- Commits table
CREATE TABLE commits (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  contributor_id INTEGER REFERENCES contributors(id) ON DELETE SET NULL,
  pull_request_id INTEGER REFERENCES pull_requests(id) ON DELETE SET NULL,
  sha VARCHAR(40) NOT NULL,
  message TEXT,
  author_name VARCHAR(255),
  author_email VARCHAR(255),
  additions INTEGER DEFAULT 0,
  deletions INTEGER DEFAULT 0,
  total_changes INTEGER DEFAULT 0,
  committed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(repository_id, sha)
);

-- Files table
CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  pull_request_id INTEGER REFERENCES pull_requests(id) ON DELETE SET NULL,
  filename VARCHAR(500) NOT NULL,
  status VARCHAR(50),
  additions INTEGER DEFAULT 0,
  deletions INTEGER DEFAULT 0,
  changes INTEGER DEFAULT 0,
  raw_url VARCHAR(500),
  contents_url VARCHAR(500),
  file_churn_score FLOAT DEFAULT 0,
  modification_count INTEGER DEFAULT 0,
  total_changes INTEGER DEFAULT 0,
  is_hotspot BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(repository_id, pull_request_id, filename)
);

-- Anomalies table
CREATE TABLE anomalies (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  contributor_id INTEGER REFERENCES contributors(id) ON DELETE CASCADE,
  pull_request_id INTEGER REFERENCES pull_requests(id) ON DELETE CASCADE,
  anomaly_type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL,
  description TEXT,
  score FLOAT,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_resolved BOOLEAN DEFAULT false
);

-- Repository Metrics table for benchmarking
CREATE TABLE repository_metrics (
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
  -- Percentile ranks (computed)
  health_percentile FLOAT,
  momentum_percentile FLOAT,
  risk_percentile FLOAT,
  velocity_percentile FLOAT,
  stability_percentile FLOAT,
  -- Z-scores for advanced benchmarking
  health_zscore FLOAT,
  momentum_zscore FLOAT,
  risk_zscore FLOAT,
  velocity_zscore FLOAT,
  stability_zscore FLOAT,
  analysis_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(repository_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_repositories_owner ON repositories(owner);
CREATE INDEX idx_contributors_repository ON contributors(repository_id);
CREATE INDEX idx_pull_requests_repository ON pull_requests(repository_id);
CREATE INDEX idx_pull_requests_state ON pull_requests(state);
CREATE INDEX idx_pull_requests_risk ON pull_requests(risk_score);
CREATE INDEX idx_commits_repository ON commits(repository_id);
CREATE INDEX idx_files_repository ON files(repository_id);
CREATE INDEX idx_files_hotspot ON files(is_hotspot);
CREATE INDEX idx_anomalies_repository ON anomalies(repository_id);
CREATE INDEX idx_anomalies_contributor ON anomalies(contributor_id);
CREATE INDEX idx_repository_metrics_repository ON repository_metrics(repository_id);
CREATE INDEX idx_repository_metrics_date ON repository_metrics(analysis_date);
`;

async function initDb() {
  try {
    console.log('🔄 Initializing database...');
    await pool.query(createTablesSQL);
    console.log('✅ Database tables created successfully!');
    
    // Verify tables
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('\n📋 Created tables:');
    result.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    await pool.end();
    console.log('\n✅ Database initialization complete!');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  initDb();
}

module.exports = { initDb };
