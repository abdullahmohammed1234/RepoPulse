/**
 * Database Migration: Memory and Versioning System
 * Adds tables for storing generations, versions, user preferences, and memory
 */

const { pool } = require('../db');

const migrationSQL = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS (Basic table for foreign keys)
-- ============================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE,
  login VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- USER SESSIONS (Short-term Memory)
-- ============================================

-- User sessions for tracking activity
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  device_id VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_started_at ON user_sessions(started_at);

-- Session events for tracking user actions
CREATE TABLE IF NOT EXISTS session_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES user_sessions(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_session_events_session ON session_events(session_id);
CREATE INDEX idx_session_events_type ON session_events(event_type);
CREATE INDEX idx_session_events_created ON session_events(created_at);

-- ============================================
-- GENERATIONS (Long-term Memory)
-- ============================================

-- AI generations for storing outputs
CREATE TABLE IF NOT EXISTS generations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
  repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  parent_version_id UUID REFERENCES generations(id) ON DELETE SET NULL,
  
  -- Content
  prompt TEXT NOT NULL,
  content JSONB NOT NULL,
  raw_output TEXT,
  
  -- Metadata
  version VARCHAR(20) NOT NULL DEFAULT 'v1',
  version_number INTEGER NOT NULL DEFAULT 1,
  section VARCHAR(50), -- 'summary', 'recommendations', 'analysis', 'risk_factors', 'all'
  
  -- AI metadata
  model VARCHAR(100),
  tokens_used INTEGER,
  latency_ms INTEGER,
  
  -- User feedback
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  feedback TEXT,
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP, -- For auto-cleanup of temp data
  
  -- Constraints
  CONSTRAINT fk_generations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_generations_repository FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
);

CREATE INDEX idx_generations_user_id ON generations(user_id);
CREATE INDEX idx_generations_session_id ON generations(session_id);
CREATE INDEX idx_generations_repository_id ON generations(repository_id);
CREATE INDEX idx_generations_parent_version ON generations(parent_version_id);
CREATE INDEX idx_generations_section ON generations(section);
CREATE INDEX idx_generations_created_at ON generations(created_at);
CREATE INDEX idx_generations_status ON generations(status);

-- ============================================
-- VERSIONS (Version Control)
-- ============================================

-- Version history for tracking changes
CREATE TABLE IF NOT EXISTS versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  generation_id UUID REFERENCES generations(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content JSONB NOT NULL,
  change_summary TEXT,
  change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('initial', 'regenerate', 'edit', 'restore', 'partial_regenerate')),
  regenerated_section VARCHAR(50), -- Which section was regenerated
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- User who made the change
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Constraints
  CONSTRAINT fk_versions_generation FOREIGN KEY (generation_id) REFERENCES generations(id) ON DELETE CASCADE,
  UNIQUE(generation_id, version_number)
);

CREATE INDEX idx_versions_generation ON versions(generation_id);
CREATE INDEX idx_versions_number ON versions(version_number);
CREATE INDEX idx_versions_created ON versions(created_at);

-- ============================================
-- USER PREFERENCES (Personalization)
-- ============================================

-- User preferences for personalization
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  
  -- Tone preferences
  tone VARCHAR(20) CHECK (tone IN ('formal', 'casual', 'persuasive', 'technical')) DEFAULT 'technical',
  
  -- Length preferences
  output_length VARCHAR(20) CHECK (output_length IN ('short', 'medium', 'long')) DEFAULT 'medium',
  
  -- Industry context
  industry VARCHAR(100),
  
  -- Custom instructions
  custom_instructions TEXT,
  
  -- Notification preferences
  notify_on_complete BOOLEAN DEFAULT true,
  notify_on_error BOOLEAN DEFAULT true,
  
  -- Default export format
  default_export_format VARCHAR(20) CHECK (default_export_format IN ('pdf', 'markdown', 'json', 'notion')) DEFAULT 'json',
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_preferences_user ON user_preferences(user_id);

-- ============================================
-- MEMORY (Context Storage)
-- ============================================

-- Memory entries for storing context
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES user_sessions(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,
  
  -- Memory content
  memory_type VARCHAR(50) NOT NULL CHECK (memory_type IN ('short_term', 'long_term', 'context', 'fact', 'preference')),
  content TEXT NOT NULL,
  importance_score FLOAT DEFAULT 0.5 CHECK (importance_score >= 0 AND importance_score <= 1),
  
  -- Source
  source VARCHAR(50), -- Where the memory came from
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE INDEX idx_memories_user ON memories(user_id);
CREATE INDEX idx_memories_session ON memories(session_id);
CREATE INDEX idx_memories_type ON memories(memory_type);
CREATE INDEX idx_memories_generation ON memories(generation_id);
CREATE INDEX idx_memories_created ON memories(created_at);

-- ============================================
-- EXPORT RECORDS
-- ============================================

-- Export history
CREATE TABLE IF NOT EXISTS exports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,
  
  -- Export details
  format VARCHAR(20) NOT NULL CHECK (format IN ('pdf', 'markdown', 'json', 'notion')),
  content TEXT,
  file_name VARCHAR(255),
  file_size INTEGER,
  
  -- Notion specific (if applicable)
  notion_page_id VARCHAR(100),
  notion_block_id VARCHAR(100),
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_exports_user ON exports(user_id);
CREATE INDEX idx_exports_generation ON exports(generation_id);
CREATE INDEX idx_exports_format ON exports(format);
CREATE INDEX idx_exports_created ON exports(created_at);

-- ============================================
-- RATE LIMITS
-- ============================================

-- Rate limiting tracking
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ip_address VARCHAR(45),
  endpoint VARCHAR(100) NOT NULL,
  
  -- Rate limit data
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP NOT NULL,
  window_duration INTEGER NOT NULL DEFAULT 3600, -- seconds
  limit_value INTEGER NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(user_id, endpoint, window_start)
);

CREATE INDEX idx_rate_limits_user ON rate_limits(user_id);
CREATE INDEX idx_rate_limits_window ON rate_limits(window_start);

-- ============================================
-- API KEYS (For external integrations)
-- ============================================

-- User API keys for external integrations
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  
  -- Permissions
  permissions JSONB DEFAULT '[]',
  
  -- Usage
  last_used_at TIMESTAMP,
  request_count INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
`;

async function runMigration() {
  try {
    console.log('🔄 Running memory and versioning migration...');
    
    // Create tables
    await pool.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify tables
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN (
          'user_sessions', 'session_events', 'generations', 
          'versions', 'user_preferences', 'memories', 
          'exports', 'rate_limits', 'api_keys'
        )
      ORDER BY table_name
    `);
    
    console.log('\n📋 Created tables:');
    result.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runMigration, migrationSQL };
