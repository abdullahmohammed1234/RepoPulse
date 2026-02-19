/**
 * Migration: Webhooks and Realtime Monitoring
 * Adds webhook configurations, event log, and realtime subscriptions
 */

const { pool } = require('../db');

const migrationSQL = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Webhook configurations table
CREATE TABLE IF NOT EXISTS webhook_configs (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  webhook_url VARCHAR(500) NOT NULL,
  secret VARCHAR(255),
  events JSONB DEFAULT '["push", "pull_request", "issues"]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_delivered_at TIMESTAMP,
  last_status VARCHAR(50),
  UNIQUE(repository_id)
);

-- Webhook events log table
CREATE TABLE IF NOT EXISTS webhook_events (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  event_action VARCHAR(100),
  payload JSONB,
  delivery_id VARCHAR(100),
  signature_valid BOOLEAN DEFAULT true,
  processed BOOLEAN DEFAULT false,
  processing_error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

-- Realtime subscriptions table (WebSocket connections)
CREATE TABLE IF NOT EXISTS realtime_subscriptions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  user_id INTEGER,
  repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  event_types JSONB DEFAULT '["*"]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  disconnected_at TIMESTAMP,
  last_heartbeat TIMESTAMP,
  UNIQUE(session_id)
);

-- Event triggers for auto-analysis
CREATE TABLE IF NOT EXISTS event_triggers (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  trigger_action VARCHAR(100) NOT NULL,
  config JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_triggered_at TIMESTAMP,
  trigger_count INTEGER DEFAULT 0,
  UNIQUE(repository_id, event_type, trigger_action)
);

-- Create indexes for webhook performance
CREATE INDEX IF NOT EXISTS idx_webhook_configs_repository ON webhook_configs(repository_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_repository ON webhook_events(repository_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_delivery ON webhook_events(delivery_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at);
CREATE INDEX IF NOT EXISTS idx_realtime_subscriptions_session ON realtime_subscriptions(session_id);
CREATE INDEX IF NOT EXISTS idx_realtime_subscriptions_repository ON realtime_subscriptions(repository_id);
CREATE INDEX IF NOT EXISTS idx_event_triggers_repository ON event_triggers(repository_id);
CREATE INDEX IF NOT EXISTS idx_event_triggers_active ON event_triggers(is_active);
`;

async function migrate() {
  try {
    console.log('🔄 Running webhook migration...');
    await pool.query(migrationSQL);
    console.log('✅ Webhook tables created successfully!');
    
    // Verify tables
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('webhook_configs', 'webhook_events', 'realtime_subscriptions', 'event_triggers')
      ORDER BY table_name
    `);
    
    console.log('\n📋 Created tables:');
    result.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    console.log('\n✅ Webhook migration complete!');
  } catch (error) {
    console.error('❌ Webhook migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate, migrationSQL };
