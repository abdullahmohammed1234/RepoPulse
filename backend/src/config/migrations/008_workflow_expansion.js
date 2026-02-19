/**
 * Database Migration: Workflow Expansion System
 * Phase 4: Adds tables for workflow engine
 */

const { pool } = require('../db');

const migrationSQL = `
-- ============================================
-- WORKFLOW EXPANSION TABLES
-- ============================================

-- Workflow templates/definitions
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL DEFAULT 'custom',
  
  -- Definition (nodes and edges)
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  entry_node_id VARCHAR(100),
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  is_template BOOLEAN DEFAULT false,
  
  -- Usage tracking
  execution_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  
  -- Ownership
  created_by UUID,
  organization_id UUID,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflows_category ON workflows(category);
CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows(is_active);
CREATE INDEX IF NOT EXISTS idx_workflows_template ON workflows(is_template);
CREATE INDEX IF NOT EXISTS idx_workflows_owner ON workflows(created_by);

-- Workflow execution runs
CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  
  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending, running, paused, completed, failed, cancelled
  
  -- Input/Output
  input_data JSONB,
  output_data JSONB,
  
  -- Execution details
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  paused_at TIMESTAMP,
  duration_ms INTEGER,
  
  -- Error tracking
  error_message TEXT,
  error_node_id VARCHAR(100),
  
  -- User context
  user_id UUID,
  repository_id UUID,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_user ON workflow_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_repo ON workflow_executions(repository_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_time ON workflow_executions(created_at DESC);

-- Individual node execution tracking
CREATE TABLE IF NOT EXISTS node_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_id VARCHAR(100) NOT NULL,
  node_type VARCHAR(50) NOT NULL,
  node_name VARCHAR(255),
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending, running, completed, failed, skipped
  
  -- Input/Output
  input_data JSONB,
  output_data JSONB,
  
  -- Timing
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  
  -- Retry info
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- Error tracking
  error_message TEXT,
  error_details JSONB,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_node_executions_execution ON node_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_node_executions_node ON node_executions(node_id);
CREATE INDEX IF NOT EXISTS idx_node_executions_status ON node_executions(status);
CREATE INDEX IF NOT EXISTS idx_node_executions_time ON node_executions(created_at DESC);

-- Workflow state snapshots (for pause/resume)
CREATE TABLE IF NOT EXISTS workflow_state_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  
  -- State data
  node_states JSONB NOT NULL,
  context_data JSONB,
  history JSONB DEFAULT '[]',
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_state_snapshots_execution ON workflow_state_snapshots(execution_id);
`;

async function runMigration() {
  console.log('Running workflow expansion migration...');
  
  try {
    await pool.query(migrationSQL);
    console.log('✅ Workflow expansion tables created successfully');
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
