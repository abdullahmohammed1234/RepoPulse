const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const benchmarkService = require('../services/benchmarkService');

// GET /api/benchmark/overview - Returns overview statistics
router.get('/overview', async (req, res, next) => {
  try {
    const overview = await benchmarkService.getOverview();
    res.json(overview);
  } catch (error) {
    next(error);
  }
});

// GET /api/benchmark/rankings - Returns all repository rankings
router.get('/rankings', async (req, res, next) => {
  try {
    const rankings = await benchmarkService.getRankings();
    res.json(rankings);
  } catch (error) {
    next(error);
  }
});

// GET /api/benchmark/distribution - Returns health score distribution
router.get('/distribution', async (req, res, next) => {
  try {
    const distribution = await benchmarkService.getDistribution();
    res.json(distribution);
  } catch (error) {
    next(error);
  }
});

// GET /api/benchmark/repository/:id - Get specific repository benchmark
router.get('/repository/:identifier', async (req, res, next) => {
  try {
    const { identifier } = req.params;
    
    // Check if identifier is a number (ID) or string (full_name)
    const isNumeric = !isNaN(parseInt(identifier));
    let benchmark;
    
    if (isNumeric) {
      // Fetch by ID
      const result = await pool.query(`
        SELECT 
          r.id,
          r.name,
          r.full_name,
          r.owner,
          r.language,
          r.stars,
          rm.*
        FROM repositories r
        JOIN repository_metrics rm ON r.id = rm.repository_id
        WHERE r.id = $1
      `, [parseInt(identifier)]);
      benchmark = result.rows[0];
    } else {
      // Fetch by full_name
      const result = await pool.query(`
        SELECT 
          r.id,
          r.name,
          r.full_name,
          r.owner,
          r.language,
          r.stars,
          rm.*
        FROM repositories r
        JOIN repository_metrics rm ON r.id = rm.repository_id
        WHERE r.full_name = $1
      `, [identifier]);
      benchmark = result.rows[0];
    }
    
    if (!benchmark) {
      return res.status(404).json({ error: 'Benchmark not found for this repository' });
    }
    
    // Generate insight text
    const insight = benchmarkService.generateInsight(benchmark);
    
    res.json({
      ...benchmark,
      insight
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/benchmark/compute - Trigger benchmark computation
router.post('/compute', async (req, res, next) => {
  try {
    const result = await benchmarkService.computeBenchmarks();
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/benchmark/insight/:id - Get just the insight for a repository
router.get('/insight/:identifier', async (req, res, next) => {
  try {
    const { identifier } = req.params;
    const benchmark = await benchmarkService.getRepositoryBenchmark(identifier);
    
    if (!benchmark) {
      return res.status(404).json({ error: 'Benchmark not found' });
    }
    
    const insight = benchmarkService.generateInsight(benchmark);
    res.json({ insight });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
