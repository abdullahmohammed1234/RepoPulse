/**
 * Seed Script - Creates sample data for testing
 * Run with: node src/config/seed.js
 */

const { pool } = require('./db');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  console.log('🌱 Seeding database with sample data...');
  
  const client = await pool.connect();
  
  try {
    // Create a test user
    const userId = '00000000-0000-0000-0000-000000000001';
    
    // Ensure user exists
    await client.query(
      `INSERT INTO users (id, email, login, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [userId, 'demo@repopulse.com', 'demo_user']
    );
    
    // Check if we already have data
    const existingGenerations = await client.query(
      'SELECT COUNT(*) FROM generations WHERE user_id = $1',
      [userId]
    );
    
    if (parseInt(existingGenerations.rows[0].count) > 0) {
      console.log('⚠️  Database already has generations. Clearing and reseeding...');
      await client.query('DELETE FROM generations WHERE user_id = $1', [userId]);
    }
    
    // Get first repository
    const repoResult = await client.query('SELECT id FROM repositories LIMIT 1');
    
    if (repoResult.rows.length === 0) {
      console.log('⚠️  No repositories found. Please analyze a repository first.');
      return;
    }
    
    const repositoryId = repoResult.rows[0].id;
    
    // Create sample generations with versioning
    const generation1Id = uuidv4();
    const generation2Id = uuidv4();
    const generation3Id = uuidv4();
    
    // Generation 1 - Initial
    await client.query(
      `INSERT INTO generations (id, user_id, repository_id, prompt, content, version, version_number, section, model, tokens_used, rating)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        generation1Id,
        userId,
        repositoryId,
        'Generate initial analysis report',
        JSON.stringify({
          summary: 'This repository shows moderate activity with good maintainability. The codebase has been actively maintained with regular contributions.',
          recommendations: [
            'Consider implementing automated testing to reduce regressions',
            'Add documentation for core modules',
            'Review and optimize high-churn files'
          ],
          risk_factors: [
            'Some files have high modification frequency',
            'Limited test coverage on critical paths'
          ],
          analysis: {
            health_score: 72,
            trend: 'stable',
            key_insights: [
              'Consistent commit patterns',
              'Good contributor diversity',
              'Moderate PR review turnaround'
            ]
          }
        }),
        'v1',
        1,
        'all',
        'gpt-4',
        1500,
        4
      ]
    );
    
    // Generation 2 - Regenerated
    await client.query(
      `INSERT INTO generations (id, user_id, repository_id, prompt, content, version, version_number, section, model, tokens_used, parent_version_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        generation2Id,
        userId,
        repositoryId,
        'Regenerate with more detailed analysis',
        JSON.stringify({
          summary: 'This repository demonstrates strong project health with excellent contributor engagement. The codebase follows best practices.',
          recommendations: [
            'Continue current testing practices',
            'Consider adding performance benchmarks',
            'Maintain documentation standards'
          ],
          risk_factors: [
            'Minor dependency update delays',
            'Some legacy code portions'
          ],
          analysis: {
            health_score: 85,
            trend: 'improving',
            key_insights: [
              'Strong test coverage',
              'Active community involvement',
              'Consistent coding standards'
            ]
          }
        }),
        'v2',
        2,
        'all',
        'gpt-4',
        1800,
        generation1Id
      ]
    );
    
    // Generation 3 - Partial regenerate (summary only)
    await client.query(
      `INSERT INTO generations (id, user_id, repository_id, prompt, content, version, version_number, section, model, tokens_used, parent_version_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        generation3Id,
        userId,
        repositoryId,
        'Update only the summary section',
        JSON.stringify({
          summary: 'Updated: Repository shows significant improvement in maintainability metrics. Technical debt has been reduced by 25% in the last quarter.',
          recommendations: [
            'Continue current testing practices',
            'Consider adding performance benchmarks',
            'Maintain documentation standards'
          ],
          risk_factors: [
            'Minor dependency update delays',
            'Some legacy code portions'
          ],
          analysis: {
            health_score: 85,
            trend: 'improving',
            key_insights: [
              'Strong test coverage',
              'Active community involvement',
              'Consistent coding standards'
            ]
          }
        }),
        'v3',
        3,
        'summary',
        'gpt-4',
        500,
        generation2Id
      ]
    );
    
    // Create user preferences
    await client.query(
      `INSERT INTO user_preferences (user_id, tone, output_length, default_export_format, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, 'formal', 'medium', 'markdown']
    );
    
    // Create sample exports
    const exportId1 = uuidv4();
    const exportId2 = uuidv4();
    
    await client.query(
      `INSERT INTO exports (id, user_id, generation_id, format, content, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '1 day')`,
      [exportId1, userId, generation1Id, 'markdown', '# Analysis Report\n\nGenerated content here...', 'completed']
    );
    
    await client.query(
      `INSERT INTO exports (id, user_id, generation_id, format, content, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '2 hours')`,
      [exportId2, userId, generation2Id, 'pdf', 'PDF binary data would go here', 'completed']
    );
    
    console.log('✅ Seed completed successfully!');
    console.log(`   - Created 3 generations with versioning`);
    console.log(`   - Created user preferences`);
    console.log(`   - Created 2 export records`);
    console.log(`   - User ID: ${userId}`);
    console.log(`   - Repository ID: ${repositoryId}`);
    
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
