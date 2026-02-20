const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const GitHubService = require('../services/githubService');
const featureService = require('../services/featureService');
const mlService = require('../services/mlService');
const benchmarkService = require('../services/benchmarkService');
const analyticsService = require('../services/analyticsService');

// GET /api/repository - Get all repositories
router.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, full_name, owner, description, url, language, stars, health_score FROM repositories ORDER BY id DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get repositories error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/repository/analyze - Analyze a repository
router.post('/analyze', async (req, res) => {
  try {
    const { repoUrl } = req.body;
    
    if (!repoUrl) {
      return res.status(400).json({ error: 'repoUrl is required' });
    }
    
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });
    }
    
    const githubService = new GitHubService(githubToken);
    
    // Step 1: Ingest repository data
    const ingestResult = await githubService.analyzeRepository(repoUrl);
    const { repositoryId } = ingestResult;
    
    // Step 2: Compute features
    await featureService.computeFeatures(repositoryId);
    
    // Step 3: Run ML predictions with explanations
    const prsResult = await query(
      'SELECT * FROM pull_requests WHERE repository_id = $1',
      [repositoryId]
    );
    
    const contributorsResult = await query(
      'SELECT * FROM contributors WHERE repository_id = $1',
      [repositoryId]
    );
    
    const mlResults = await mlService.analyzeRepository(
      repositoryId,
      prsResult.rows,
      contributorsResult.rows
    );
    
    // Step 4: Save ML results with explanations to database
    for (const prRisk of mlResults.prRiskScores) {
      await query(
        `UPDATE pull_requests 
         SET risk_score = $1, risk_level = $2, top_factors = $3, recommendations = $4 
         WHERE id = $5`,
        [
          prRisk.risk_score, 
          prRisk.risk_level,
          JSON.stringify(prRisk.top_factors || []),
          JSON.stringify(prRisk.recommendations || []),
          prRisk.id
        ]
      );
    }
    
    // Save repository insights
    if (mlResults.repoInsights) {
      await query(
        `UPDATE repositories 
         SET insights_summary = $1, last_analyzed_at = NOW() 
         WHERE id = $2`,
        [mlResults.repoInsights.summary, repositoryId]
      );
    }
    
    // Save anomaly results
    if (mlResults.anomalyResults.anomaly_scores) {
      for (let i = 0; i < mlResults.anomalyResults.anomaly_scores.length; i++) {
        const score = mlResults.anomalyResults.anomaly_scores[i];
        const contributor = contributorsResult.rows[i];
        
        if (contributor && score > 0.7) {
          await query(
            `INSERT INTO anomalies (repository_id, contributor_id, anomaly_type, severity, description, score)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              repositoryId,
              contributor.id,
              'contributor_anomaly',
              score > 0.9 ? 'high' : 'medium',
              'Unusual contributor activity pattern detected',
              score,
            ]
          );
          
          await query(
            'UPDATE contributors SET anomaly_score = $1 WHERE id = $2',
            [score, contributor.id]
          );
        }
      }
    }
    
    // Step 5: Calculate health score
    const healthData = await featureService.calculateHealthScore(repositoryId);
    
    // Step 6: Record health snapshot for trend analysis
    try {
      await analyticsService.recordRepositoryHealth(repositoryId);
    } catch (healthError) {
      console.error('Failed to record health snapshot:', healthError);
    }
    
    // Step 7: Compute benchmarks for all repositories (system-wide)
    let benchmarkResult = null;
    try {
      benchmarkResult = await benchmarkService.computeBenchmarks();
    } catch (benchError) {
      console.error('Benchmark computation error:', benchError);
    }
    
    res.json({
      success: true,
      repositoryId,
      repository: ingestResult.repository,
      summary: {
        contributorsCount: ingestResult.contributorsCount,
        pullRequestsCount: ingestResult.pullRequestsCount,
        healthScore: healthData.healthScore,
        avgRiskScore: healthData.avgPrRisk,
        highChurnFiles: healthData.highChurnFilesCount,
        insights: mlResults.repoInsights?.summary || 'Analysis complete.',
      },
      benchmarkComputed: benchmarkResult?.computed || false,
    });
  } catch (error) {
    console.error('Analyze repository error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/repository/:id/overview - Get repository overview
router.get('/:id/overview', async (req, res) => {
  try {
    const { id } = req.params;
    
    const repoResult = await query(
      'SELECT * FROM repositories WHERE id = $1',
      [id]
    );
    
    if (repoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    const repo = repoResult.rows[0];
    
    // Get PR statistics
    const prStatsResult = await query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE state = 'open') as open,
        COUNT(*) FILTER (WHERE is_merged = true) as merged,
        COUNT(*) FILTER (WHERE state = 'closed' AND is_merged = false) as closed,
        AVG(risk_score) as avg_risk,
        COUNT(*) FILTER (WHERE risk_score > 0.7) as high_risk
       FROM pull_requests 
       WHERE repository_id = $1`,
      [id]
    );
    
    // Get contributor count
    const contribCountResult = await query(
      'SELECT COUNT(*) as count FROM contributors WHERE repository_id = $1',
      [id]
    );
    
    // Get recent activity
    const recentPRsResult = await query(
      `SELECT pr.*, c.login as contributor_login
       FROM pull_requests pr
       LEFT JOIN contributors c ON pr.contributor_id = c.id
       WHERE pr.repository_id = $1
       ORDER BY pr.created_at DESC
       LIMIT 10`,
      [id]
    );
    
    // Get anomaly count
    const anomalyCountResult = await query(
      'SELECT COUNT(*) as count FROM anomalies WHERE repository_id = $1 AND is_resolved = false',
      [id]
    );
    
    // Get repository insights
    const insightsResult = await query(
      'SELECT insights_summary FROM repositories WHERE id = $1',
      [id]
    );
    
    // Get top churn files
    const topChurnFilesResult = await query(
      `SELECT filename, MAX(file_churn_score) as churn_score, COUNT(*) as modification_count
       FROM files
       WHERE repository_id = $1
       GROUP BY filename
       ORDER BY churn_score DESC
       LIMIT 5`,
      [id]
    );
    
    res.json({
      repository: repo,
      stats: {
        ...prStatsResult.rows[0],
        contributors: parseInt(contribCountResult.rows[0].count),
        anomalies: parseInt(anomalyCountResult.rows[0].count),
      },
      recentPRs: recentPRsResult.rows,
      insights: insightsResult.rows[0]?.insights_summary || null,
      topChurnFiles: topChurnFilesResult.rows,
    });
  } catch (error) {
    console.error('Get overview error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/repository/:id/pull-requests - Get PRs with filters
router.get('/:id/pull-requests', async (req, res) => {
  try {
    const { id } = req.params;
    const { state, minRisk, maxRisk, sort, order } = req.query;
    
    let whereClause = 'WHERE pr.repository_id = $1';
    const params = [id];
    let paramIndex = 2;
    
    if (state && state !== 'all') {
      whereClause += ` AND pr.state = $${paramIndex}`;
      params.push(state);
      paramIndex++;
    }
    
    if (minRisk) {
      whereClause += ` AND pr.risk_score >= $${paramIndex}`;
      params.push(parseFloat(minRisk));
      paramIndex++;
    }
    
    if (maxRisk) {
      whereClause += ` AND pr.risk_score <= $${paramIndex}`;
      params.push(parseFloat(maxRisk));
      paramIndex++;
    }
    
    const sortColumn = ['number', 'risk_score', 'created_at', 'time_to_merge_hours'].includes(sort) 
      ? sort 
      : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    
    const result = await query(
      `SELECT pr.*, c.login as contributor_login, c.avatar_url as contributor_avatar
       FROM pull_requests pr
       LEFT JOIN contributors c ON pr.contributor_id = c.id
       ${whereClause}
       ORDER BY pr.${sortColumn} ${sortOrder}
       LIMIT 50`,
      params
    );
    
    res.json({
      pullRequests: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Get pull requests error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/repository/:id/hotspots - Get hotspot files
router.get('/:id/hotspots', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      `SELECT filename, 
              SUM(additions) as total_additions, 
              SUM(deletions) as total_deletions, 
              SUM(changes) as total_changes,
              COUNT(*) as modification_count,
              MAX(file_churn_score) as churn_score,
              MAX(is_hotspot::int) as is_hotspot
       FROM files
       WHERE repository_id = $1
       GROUP BY filename
       ORDER BY churn_score DESC
       LIMIT 20`,
      [id]
    );
    
    // Get refactor suggestions based on file patterns
    const suggestions = result.rows.map(file => {
      const suggestions = [];
      
      if (file.is_hotspot) {
        suggestions.push('Consider breaking this file into smaller modules');
      }
      if (file.modification_count > 10) {
        suggestions.push('High modification frequency - review for potential refactoring');
      }
      if ((file.total_deletions || 0) > (file.total_additions || 0) * 2) {
        suggestions.push('Heavy deletions - ensure tests cover this code');
      }
      
      return {
        ...file,
        suggestions: suggestions.length > 0 ? suggestions : ['No specific issues detected'],
      };
    });
    
    res.json({ hotspots: suggestions });
  } catch (error) {
    console.error('Get hotspots error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/repository/:id/contributors - Get contributors
router.get('/:id/contributors', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      `SELECT c.*,
        COUNT(pr.id) as pr_count,
        COUNT(pr.id) FILTER (WHERE pr.is_merged = true) as merged_pr_count
       FROM contributors c
       LEFT JOIN pull_requests pr ON c.id = pr.contributor_id AND pr.repository_id = $1
       WHERE c.repository_id = $1
       GROUP BY c.id
       ORDER BY c.contributions DESC
       LIMIT 20`,
      [id]
    );
    
    res.json({ contributors: result.rows });
  } catch (error) {
    console.error('Get contributors error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/repository/:id/simulate-pr - Simulate PR risk
router.post('/:id/simulate-pr', async (req, res) => {
  try {
    const { id } = req.params;
    const { lines_added, lines_deleted, files_changed, commits_count, contributor_id, target_files, userId } = req.body;
    
    // Validate required fields
    if (lines_added === undefined || lines_deleted === undefined || files_changed === undefined || commits_count === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields: lines_added, lines_deleted, files_changed, commits_count' 
      });
    }
    
    // Verify repository exists
    const repoResult = await query('SELECT id FROM repositories WHERE id = $1', [id]);
    if (repoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    // Get available contributors for dropdown
    const contributorsResult = await query(
      `SELECT id, login, avatar_url, experience_score 
       FROM contributors 
       WHERE repository_id = $1
       ORDER BY contributions DESC
       LIMIT 20`,
      [id]
    );
    
    // Get high-churn files for target selection
    const highChurnFiles = await featureService.getHighChurnFiles(id, 20);
    
    // Compute simulation features
    const simulationInput = {
      lines_added: parseInt(lines_added) || 0,
      lines_deleted: parseInt(lines_deleted) || 0,
      files_changed: parseInt(files_changed) || 0,
      commits_count: parseInt(commits_count) || 0,
      contributor_id: contributor_id ? parseInt(contributor_id) : null,
      target_files: target_files ? target_files.map(f => parseInt(f)).filter(f => !isNaN(f)) : [],
    };
    
    const features = await featureService.computeSimulationFeatures(id, simulationInput);
    
    // Call ML service for risk prediction
    const mlResult = await mlService.predictRisk(features);
    
    // Calculate comparative insight
    const comparative = await featureService.calculateComparativeInsight(id, mlResult.risk_score);
    
    // Build response
    const response = {
      risk_score: mlResult.risk_score,
      risk_level: mlResult.risk_level,
      risk_vs_repo_avg: comparative.riskVsRepoAvg,
      relative_label: comparative.relativeLabel,
      top_factors: mlResult.top_factors,
      recommendations: mlResult.recommendations,
      features: features,
      contributors: contributorsResult.rows,
      high_churn_files: highChurnFiles,
      repo_avg_risk: comparative.repoAvgRisk,
    };
    
    // If target_files is provided, also calculate risk reduction potential
    if (lines_added > 0 || lines_deleted > 0) {
      try {
        const reducedFeatures = await featureService.estimateRiskReduction(id, simulationInput, 30);
        const reducedMlResult = await mlService.predictRisk(reducedFeatures);
        const riskReduction = mlResult.risk_score - reducedMlResult.risk_score;
        const reductionPercent = mlResult.risk_score > 0 
          ? ((riskReduction / mlResult.risk_score) * 100).toFixed(0)
          : 0;
        
        response.risk_reduction_estimate = {
          potential_reduction: riskReduction,
          reduction_percent: reductionPercent,
          message: `Reducing PR size by 30% could lower risk by ${reductionPercent}%`,
        };
      } catch (err) {
        console.warn('Risk reduction estimation failed:', err.message);
      }
    }
    
    // Save simulation to database - only if userId is a valid UUID
    let simulationId = null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validUserId = userId && uuidRegex.test(userId) ? userId : null;
    
    if (validUserId) {
      try {
        const simulationResult = await query(
          `INSERT INTO simulations 
            (user_id, repository_id, lines_added, lines_deleted, files_changed, commits_count, contributor_id, target_files, risk_score, risk_level, risk_vs_repo_avg, relative_label, repo_avg_risk, top_factors, recommendations, risk_reduction_estimate, features)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
           RETURNING id`,
          [
            validUserId,
            id,
            simulationInput.lines_added,
            simulationInput.lines_deleted,
            simulationInput.files_changed,
            simulationInput.commits_count,
            simulationInput.contributor_id,
            simulationInput.target_files,
            mlResult.risk_score,
            mlResult.risk_level,
            comparative.riskVsRepoAvg,
            comparative.relativeLabel,
            comparative.repoAvgRisk,
            JSON.stringify(mlResult.top_factors),
            JSON.stringify(mlResult.recommendations),
            response.risk_reduction_estimate ? JSON.stringify(response.risk_reduction_estimate) : null,
            JSON.stringify(features)
          ]
        );
        simulationId = simulationResult.rows[0].id;
        response.simulation_id = simulationId;
      } catch (saveErr) {
        console.warn('Failed to save simulation:', saveErr.message);
      }
    }
    
    res.json(response);
  } catch (error) {
    console.error('Simulate PR error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/repository/:id/simulation-data - Get data needed for simulation form
router.get('/:id/simulation-data', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify repository exists
    const repoResult = await query('SELECT * FROM repositories WHERE id = $1', [id]);
    if (repoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    // Get contributors for dropdown
    const contributorsResult = await query(
      `SELECT id, login, avatar_url, experience_score, contributions 
       FROM contributors 
       WHERE repository_id = $1
       ORDER BY contributions DESC`,
      [id]
    );
    
    // Get high-churn files for target selection
    const highChurnFiles = await featureService.getHighChurnFiles(id, 30);
    
    // Get repository averages for comparison
    const repoAverages = await featureService.getRepositoryAverages(id);
    
    res.json({
      repository: repoResult.rows[0],
      contributors: contributorsResult.rows,
      high_churn_files: highChurnFiles,
      repo_averages: repoAverages,
    });
  } catch (error) {
    console.error('Get simulation data error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/repository/:id/simulations - Get simulation history
router.get('/:id/simulations', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, page = 1, limit = 20 } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Validate userId - return empty for non-UUID values
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validUserId = userId && uuidRegex.test(userId) ? userId : null;
    
    // Build query based on userId - return empty for non-UUID users
    if (!validUserId) {
      res.json({
        simulations: [],
        total: 0,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: 0
      });
      return;
    }
    
    // Get simulations with valid userId
    const simulationsResult = await query(
      `SELECT id, user_id, repository_id, lines_added, lines_deleted, files_changed, 
         commits_count, contributor_id, target_files, risk_score, risk_level, 
         risk_vs_repo_avg, relative_label, repo_avg_risk, top_factors, recommendations,
         risk_reduction_estimate, features, created_at
       FROM simulations 
       WHERE repository_id = $1 AND user_id = $2
       ORDER BY created_at DESC 
       LIMIT $3 OFFSET $4`,
      [parseInt(id), validUserId, parseInt(limit), offset]
    );
    
    const countResult = await query(
      'SELECT COUNT(*) as total FROM simulations WHERE repository_id = $1 AND user_id = $2',
      [parseInt(id), validUserId]
    );
    
    res.json({
      simulations: simulationsResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(countResult.rows[0].total / parseInt(limit))
    });
  } catch (error) {
    console.error('Get simulations error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
