/**
 * Database Migration: Make generation_id nullable in feedback table
 * Allows feedback to be submitted without requiring a generation record
 */

const { pool } = require('../db');

const migrationSQL = `
-- Make generation_id nullable in feedback table
ALTER TABLE feedback ALTER COLUMN generation_id DROP NOT NULL;
ALTER TABLE feedback ALTER COLUMN generation_id DROP DEFAULT;

-- Also make it nullable in feedback_events
ALTER TABLE feedback_events ALTER COLUMN generation_id DROP NOT NULL;
ALTER TABLE feedback_events ALTER COLUMN generation_id DROP DEFAULT;
`;

async function runMigration() {
  console.log('Running feedback nullable generation_id migration...');
  
  try {
    await pool.query(migrationSQL);
    console.log('✅ Migration completed successfully');
  } catch (error) {
    // Ignore error if column is already nullable
    if (error.code === '42710' || error.message.includes('column')) {
      console.log('⚠️ Column may already be nullable, continuing...');
    } else {
      console.error('❌ Migration failed:', error.message);
    }
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  runMigration();
}

module.exports = { migrationSQL, runMigration };
