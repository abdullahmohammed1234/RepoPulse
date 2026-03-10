/**
 * Migration: Team Collaboration Features
 * Adds team workspaces, shared watchlists, comments, and @mentions
 * Note: users and user_sessions tables already exist
 */

const { pool } = require('../db');

const migrationSQL = `
-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  uuid VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  avatar_url VARCHAR(500),
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  notification_preferences JSONB DEFAULT '{"email": true, "in_app": true, "high_risk_pr": true, "new_comment": true}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Team members junction table
CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL,
  user_id UUID NOT NULL,
  role VARCHAR(50) DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, user_id)
);

-- Team invitations
CREATE TABLE IF NOT EXISTS team_invitations (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'member',
  invited_by UUID,
  token VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, email)
);

-- Team repository watchlists
CREATE TABLE IF NOT EXISTS team_watchlists (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL,
  repository_id INTEGER NOT NULL,
  added_by UUID,
  watch_settings JSONB DEFAULT '{"notify_on_pr": true, "notify_on_risk": true, "risk_threshold": 0.7}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, repository_id)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  uuid VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID,
  team_id INTEGER,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  link VARCHAR(500),
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PR comment threads
CREATE TABLE IF NOT EXISTS pr_comments (
  id SERIAL PRIMARY KEY,
  uuid VARCHAR(255) UNIQUE NOT NULL,
  pull_request_id INTEGER,
  team_id INTEGER,
  parent_id INTEGER,
  author_id UUID,
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- @mentions in comments
CREATE TABLE IF NOT EXISTS comment_mentions (
  id SERIAL PRIMARY KEY,
  comment_id INTEGER NOT NULL,
  user_id UUID NOT NULL,
  mentioned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(comment_id, user_id)
);

-- High-risk PR watch records (for automatic notifications)
CREATE TABLE IF NOT EXISTS high_risk_watches (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL,
  repository_id INTEGER NOT NULL,
  risk_threshold FLOAT DEFAULT 0.7,
  notify_on_risk_above BOOLEAN DEFAULT true,
  notify_team_members BOOLEAN DEFAULT true,
  mentioned_user_ids UUID[] DEFAULT '{}',
  last_notified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, repository_id)
);

-- Add foreign keys after tables are created
ALTER TABLE team_members ADD CONSTRAINT fk_team_members_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE team_members ADD CONSTRAINT fk_team_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE team_invitations ADD CONSTRAINT fk_team_invitations_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE team_invitations ADD CONSTRAINT fk_team_invitations_user FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE team_watchlists ADD CONSTRAINT fk_team_watchlists_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE team_watchlists ADD CONSTRAINT fk_team_watchlists_repo FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE;
ALTER TABLE team_watchlists ADD CONSTRAINT fk_team_watchlists_user FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE notifications ADD CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

ALTER TABLE pr_comments ADD CONSTRAINT fk_pr_comments_pr FOREIGN KEY (pull_request_id) REFERENCES pull_requests(id) ON DELETE CASCADE;
ALTER TABLE pr_comments ADD CONSTRAINT fk_pr_comments_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE pr_comments ADD CONSTRAINT fk_pr_comments_parent FOREIGN KEY (parent_id) REFERENCES pr_comments(id) ON DELETE CASCADE;
ALTER TABLE pr_comments ADD CONSTRAINT fk_pr_comments_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE pr_comments ADD CONSTRAINT fk_pr_comments_resolved FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE comment_mentions ADD CONSTRAINT fk_comment_mentions_comment FOREIGN KEY (comment_id) REFERENCES pr_comments(id) ON DELETE CASCADE;
ALTER TABLE comment_mentions ADD CONSTRAINT fk_comment_mentions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE high_risk_watches ADD CONSTRAINT fk_high_risk_watches_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE high_risk_watches ADD CONSTRAINT fk_high_risk_watches_repo FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE;

-- Create indexes for team collaboration performance
CREATE INDEX IF NOT EXISTS idx_teams_uuid ON teams(uuid);
CREATE INDEX IF NOT EXISTS idx_teams_slug ON teams(slug);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_watchlists_team ON team_watchlists(team_id);
CREATE INDEX IF NOT EXISTS idx_team_watchlists_repository ON team_watchlists(repository_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_team ON notifications(team_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_pr_comments_pr ON pr_comments(pull_request_id);
CREATE INDEX IF NOT EXISTS idx_pr_comments_team ON pr_comments(team_id);
CREATE INDEX IF NOT EXISTS idx_pr_comments_parent ON pr_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_pr_comments_author ON pr_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_comment_mentions_comment ON comment_mentions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_mentions_user ON comment_mentions(user_id);
CREATE INDEX IF NOT EXISTS idx_high_risk_watches_team ON high_risk_watches(team_id);
CREATE INDEX IF NOT EXISTS idx_high_risk_watches_repo ON high_risk_watches(repository_id);
`;

async function migrate() {
  try {
    console.log('🔄 Running team collaboration migration...');
    await pool.query(migrationSQL);
    console.log('✅ Team collaboration tables created successfully!');
    
    // Verify tables
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN (
          'teams', 'team_members', 'team_invitations', 
          'team_watchlists', 'notifications', 'pr_comments', 
          'comment_mentions', 'high_risk_watches'
        )
      ORDER BY table_name
    `);
    
    console.log('\n📋 Created tables:');
    result.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    console.log('\n✅ Team collaboration migration complete!');
  } catch (error) {
    console.error('❌ Team collaboration migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate, migrationSQL };
