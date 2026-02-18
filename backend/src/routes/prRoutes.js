const express = require('express');
const router = express.Router();
const { query } = require('../config/db');

// Helper function to get risk level from score
function getRiskLevel(score) {
  if (score < 0.4) return 'Low';
  if (score <= 0.7) return 'Medium';
  return 'High';
}

// Helper function to determine risk level from score
function getRiskLevelFromScore(score) {
  if (score === null || score === undefined) return 'Low';
  if (score < 0.4) return 'Low';
  if (score <= 0.7) return 'Medium';
  return 'High';
}

// GET /api/pull-request/:id/details - Get detailed PR information
router.get('/:id/details', async (req, res) => {
  try {
    const { id } = req.params;
    
    const prResult = await query(
      `SELECT pr.*, 
              c.login as contributor_login, 
              c.avatar_url as contributor_avatar,
              c.experience_score as contributor_experience,
              c.anomaly_score as contributor_anomaly
       FROM pull_requests pr
       LEFT JOIN contributors c ON pr.contributor_id = c.id
       WHERE pr.id = $1`,
      [id]
    );
    
    if (prResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pull request not found' });
    }
    
    const pr = prResult.rows[0];
    
    // Get files changed in this PR
    const filesResult = await query(
      `SELECT * FROM files WHERE pull_request_id = $1 ORDER BY changes DESC`,
      [id]
    );
    
    // Parse stored top_factors and recommendations
    let topFactors = [];
    let recommendations = [];
    
    try {
      if (pr.top_factors) {
        topFactors = typeof pr.top_factors === 'string' 
          ? JSON.parse(pr.top_factors) 
          : pr.top_factors;
      }
      if (pr.recommendations) {
        recommendations = typeof pr.recommendations === 'string' 
          ? JSON.parse(pr.recommendations) 
          : pr.recommendations;
      }
    } catch (e) {
      console.error('Error parsing PR explanations:', e);
    }
    
    // Get risk level (from stored value or calculate)
    const riskLevel = pr.risk_level || getRiskLevelFromScore(pr.risk_score);
    const riskScore = pr.risk_score || 0;
    
    // Calculate explainable factors for risk score if not stored
    const factors = [];
    
    if (riskScore > 0.7) {
      factors.push({
        name: 'High Risk',
        description: 'This PR has been flagged as high risk by the ML model',
        impact: 'high',
      });
    }
    
    if (pr.files_changed > 10) {
      factors.push({
        name: 'Large Change Set',
        description: `This PR modifies ${pr.files_changed} files, increasing review complexity`,
        impact: 'medium',
      });
    }
    
    if (pr.commits_count > 5) {
      factors.push({
        name: 'Many Commits',
        description: `${pr.commits_count} commits suggest multiple iterations or a large feature`,
        impact: 'medium',
      });
    }
    
    if (pr.time_to_merge_hours && pr.time_to_merge_hours > 72) {
      factors.push({
        name: 'Slow Merge Time',
        description: `Took ${Math.round(pr.time_to_merge_hours)} hours to merge, indicating potential issues`,
        impact: 'low',
      });
    }
    
    if (pr.review_comments === 0) {
      factors.push({
        name: 'No Review Comments',
        description: 'PR was merged without any review comments',
        impact: 'medium',
      });
    }
    
    if (pr.lines_added + pr.lines_deleted > 500) {
      factors.push({
        name: 'Large Diff',
        description: `Total changes of ${pr.lines_added + pr.lines_deleted} lines is substantial`,
        impact: 'medium',
      });
    }
    
    // Get related high-risk PRs from same contributor
    if (pr.contributor_id) {
      const relatedPRsResult = await query(
        `SELECT id, number, title, risk_score, state
         FROM pull_requests
         WHERE contributor_id = $1 AND id != $2
         ORDER BY risk_score DESC
         LIMIT 5`,
        [pr.contributor_id, id]
      );
      
      pr.related_high_risk_prs = relatedPRsResult.rows;
    }
    
    res.json({
      pullRequest: {
        ...pr,
        risk_level: riskLevel,
        risk_score: riskScore,
      },
      files: filesResult.rows,
      riskFactors: factors,
      top_factors: topFactors,
      recommendations: recommendations,
      risk_level: riskLevel,
    });
  } catch (error) {
    console.error('Get PR details error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
