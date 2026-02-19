/**
 * Migration: Add Team Collaboration Fields to Users
 * Adds missing columns to the existing users table
 */

const { pool } = require('../db');

const migrationSQL = `
-- Add missing columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'member';
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
`;

async function migrate() {
  try {
    console.log('🔄 Running user fields migration...');
    await pool.query(migrationSQL);
    console.log('✅ User fields added successfully!');
    
    // Verify columns
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Users table columns:');
    result.rows.forEach(row => {
      console.log(`   - ${row.column_name}`);
    });
    
    console.log('\n✅ User fields migration complete!');
  } catch (error) {
    console.error('❌ User fields migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate, migrationSQL };
