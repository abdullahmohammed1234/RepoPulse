/**
 * Database Migration: Feedback Loop System
 * Phase 1: Adds tables for user feedback, section ratings, and edit tracking
 */

const { pool } = require('../db');

const migrationSQL = `
-- ============================================
-- FEEDBACK SYSTEM TABLES
-- ============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Main feedback table for output-level ratings
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  generation_id UUID REFERENCES generations(id) ON DELETE CASCADE,
  user_id UUID,
  session_id UUID,
  
  -- Rating
  rating BOOLEAN NOT NULL, -- true = thumbs up, false = thumbs down
  rating_score INTEGER CHECK (rating_score BETWEEN 1 AND 5),
  
  -- Section-level feedback (JSONB for flexibility)
  section_feedback JSONB DEFAULT '[]',
  
  -- Reason categories: unclear, incomplete, incorrect, repetitive, too_long, too_short, irrelevant
  reason_category VARCHAR(50),
  reason_details TEXT,
  
  -- Edit tracking (for detecting user modifications)
  original_content TEXT,
  edited_content TEXT,
  edit_distance INTEGER, -- Levenshtein distance between original and edited
  edit_token_count INTEGER,
  edit_timestamp TIMESTAMP,
  
  -- Context for analytics
  prompt_version_id INTEGER,
  model_used VARCHAR(100),
  tokens_used INTEGER,
  latency_ms INTEGER,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT,
  ip_hash VARCHAR(64)
);

-- Indexes for feedback queries
CREATE INDEX idx_feedback_generation ON feedback(generation_id);
CREATE INDEX idx_feedback_user ON feedback(user_id);
CREATE INDEX idx_feedback_session ON feedback(session_id);
CREATE INDEX idx_feedback_rating ON feedback(rating);
CREATE INDEX idx_feedback_reason ON feedback(reason_category);
CREATE INDEX idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX idx_feedback_prompt_version ON feedback(prompt_version_id);

-- Section feedback details table (for granular tracking)
CREATE TABLE IF NOT EXISTS section_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feedback_id UUID REFERENCES feedback(id) ON DELETE CASCADE,
  section_name VARCHAR(100) NOT NULL,
  section_position INTEGER,
  section_rating BOOLEAN,
  section_score INTEGER CHECK (section_score BETWEEN 1 AND 5),
  issue_type VARCHAR(50),
  issue_description TEXT,
  severity VARCHAR(20),
  suggested_improvement TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_section_feedback_feedback ON section_feedback(feedback_id);
CREATE INDEX idx_section_feedback_section ON section_feedback(section_name);

-- Feedback events for audit trail
CREATE TABLE IF NOT EXISTS feedback_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(50) NOT NULL,
  feedback_id UUID REFERENCES feedback(id) ON DELETE SET NULL,
  generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,
  user_id UUID,
  session_id UUID,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feedback_events_type ON feedback_events(event_type);
CREATE INDEX idx_feedback_events_feedback ON feedback_events(feedback_id);
CREATE INDEX idx_feedback_events_generation ON feedback_events(generation_id);
CREATE INDEX idx_feedback_events_created ON feedback_events(created_at DESC);

-- Feedback analytics aggregated data (for dashboard performance)
CREATE TABLE IF NOT EXISTS feedback_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  total_feedback INTEGER DEFAULT 0,
  positive_count INTEGER DEFAULT 0,
  negative_count INTEGER DEFAULT 0,
  positive_rate FLOAT DEFAULT 0,
  section_ratings JSONB DEFAULT '{}',
  reason_distribution JSONB DEFAULT '{}',
  total_edits INTEGER DEFAULT 0,
  avg_edit_distance FLOAT DEFAULT 0,
  by_prompt_type JSONB DEFAULT '{}',
  by_model JSONB DEFAULT '{}',
  UNIQUE(date)
);

CREATE INDEX idx_feedback_analytics_date ON feedback_analytics(date DESC);
`;

const alterGenerationsSQL = `
ALTER TABLE generations ADD COLUMN IF NOT EXISTS feedback_id UUID REFERENCES feedback(id);
`;

async function runMigration() {
  console.log('Running feedback system migration...');
  
  try {
    // Create tables
    await pool.query(migrationSQL);
    console.log('✅ Tables created successfully');
    
    // Alter generations table
    await pool.query(alterGenerationsSQL);
    console.log('✅ Generations table altered successfully');
    
    console.log('✅ Feedback system migration completed successfully');
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

module.exports = { migrationSQL, alterGenerationsSQL, runMigration };
