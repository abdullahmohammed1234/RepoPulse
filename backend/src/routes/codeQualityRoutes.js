/**
 * Code Quality Routes
 * API endpoints for code quality metrics, complexity analysis,
 * technical debt estimation, and integration with ESLint/SonarQube
 */

const express = require('express');
const router = express.Router();
const codeQualityService = require('../services/codeQualityService');
const logger = require('../services/logger');

/**
 * POST /api/code-quality/analyze
 * Analyze code quality metrics for provided source code
 */
router.post('/analyze', async (req, res) => {
  try {
    const { code, options } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Code is required for analysis'
      });
    }
    
    const report = await codeQualityService.generateQualityReport(code, options || {});
    
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Code quality analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze code quality',
      message: error.message
    });
  }
});

/**
 * POST /api/code-quality/complexity
 * Analyze cyclomatic complexity only
 */
router.post('/complexity', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Code is required for complexity analysis'
      });
    }
    
    const complexity = codeQualityService.analyzeCyclomaticComplexity(code);
    
    res.json({
      success: true,
      data: complexity
    });
  } catch (error) {
    logger.error('Complexity analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze complexity',
      message: error.message
    });
  }
});

/**
 * POST /api/code-quality/debt
 * Estimate technical debt
 */
router.post('/debt', async (req, res) => {
  try {
    const { complexityMetrics, eslintResults, sonarResults } = req.body;
    
    if (!complexityMetrics) {
      return res.status(400).json({
        success: false,
        error: 'Complexity metrics are required for debt estimation'
      });
    }
    
    const debt = codeQualityService.estimateTechnicalDebt(
      complexityMetrics,
      eslintResults || null,
      sonarResults || null
    );
    
    res.json({
      success: true,
      data: debt
    });
  } catch (error) {
    logger.error('Technical debt estimation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to estimate technical debt',
      message: error.message
    });
  }
});

/**
 * POST /api/code-quality/coverage
 * Analyze code coverage
 */
router.post('/coverage', async (req, res) => {
  try {
    const { coverageData } = req.body;
    
    if (!coverageData) {
      return res.status(400).json({
        success: false,
        error: 'Coverage data is required'
      });
    }
    
    const coverage = codeQualityService.analyzeCodeCoverage(coverageData);
    
    res.json({
      success: true,
      data: coverage
    });
  } catch (error) {
    logger.error('Coverage analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze coverage',
      message: error.message
    });
  }
});

/**
 * POST /api/code-quality/eslint
 * Run ESLint analysis on code
 */
router.post('/eslint', async (req, res) => {
  try {
    const { code, options } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Code is required for ESLint analysis'
      });
    }
    
    const eslintResults = await codeQualityService.runESLintAnalysis(code, options || {});
    
    res.json({
      success: true,
      data: eslintResults
    });
  } catch (error) {
    logger.error('ESLint analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run ESLint analysis',
      message: error.message
    });
  }
});

/**
 * GET /api/code-quality/sonar/:projectKey
 * Fetch SonarQube metrics for a project
 */
router.get('/sonar/:projectKey', async (req, res) => {
  try {
    const { projectKey } = req.params;
    
    const metrics = await codeQualityService.getSonarQubeMetrics(projectKey);
    const issues = await codeQualityService.getSonarQubeIssues(projectKey);
    
    res.json({
      success: true,
      data: {
        metrics: metrics,
        issues: issues,
        issueCount: issues.length
      }
    });
  } catch (error) {
    logger.error('SonarQube fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch SonarQube metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/code-quality/health
 * Get service health and configuration status
 */
router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      sonarQube: {
        configured: !!(process.env.SONARQUBE_URL && process.env.SONARQUBE_TOKEN),
        url: process.env.SONARQUBE_URL || 'Not configured',
        urlHidden: process.env.SONARQUBE_URL ? '***configured***' : null
      },
      features: {
        complexityAnalysis: true,
        eslintIntegration: true,
        sonarQubeIntegration: !!(process.env.SONARQUBE_URL && process.env.SONARQUBE_TOKEN),
        coverageAnalysis: true,
        debtEstimation: true
      },
      thresholds: codeQualityService.complexityThresholds,
      debtRates: codeQualityService.debtRates
    };
    
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message
    });
  }
});

module.exports = router;
