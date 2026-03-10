require('dotenv').config();
const { pool } = require('./db');

/**
 * Migration: Add modification_count column to files table
 * and populate it with aggregated data
 */
const migrationSQL = `
-- Add modification_count column to files table if it doesn't exist
ALTER TABLE files ADD COLUMN IF NOT EXISTS modification_count INTEGER DEFAULT 0;
`;

async function addModificationCountColumn() {
  try {
    console.log('🔄 Adding modification_count column to files table...');
    
    // Add the column
    await pool.query(migrationSQL);
    console.log('Column added successfully.');
    
    // Populate the modification_count by counting file occurrences per filename per repository
    console.log('Populating modification_count values...');
    
    await pool.query(`
      UPDATE files f
      SET modification_count = fc.cnt
      FROM (
        SELECT repository_id, filename, COUNT(*) as cnt
        FROM files
        GROUP BY repository_id, filename
      ) fc
      WHERE f.repository_id = fc.repository_id AND f.filename = fc.filename
    `);
    
    console.log('✅ Migration completed successfully!');
    await pool.end();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  addModificationCountColumn();
}

module.exports = { addModificationCountColumn };
