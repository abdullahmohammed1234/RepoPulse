const { pool } = require('../config/db');

/**
 * Benchmark Calculation Service
 * Computes normalized metrics, percentiles, and z-scores for repositories
 */

class BenchmarkService {
  /**
   * Compute statistics (mean, std dev) for an array of values
   */
  computeStats(values) {
    if (!values || values.length === 0) {
      return { mean: 0, stdDev: 0 };
    }
    
    const n = values.length;
    const mean = values.reduce((sum, val) => sum + val, 0) / n;
    
    if (n === 1) {
      return { mean, stdDev: 0 };
    }
    
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / (n - 1);
    const stdDev = Math.sqrt(variance);
    
    return { mean, stdDev };
  }

  /**
   * Compute percentile rank (percentage of values below this value)
   */
  computePercentile(value, allValues) {
    if (!allValues || allValues.length === 0) return 0;
    const belowCount = allValues.filter(v => v < value).length;
    return Math.round((belowCount / allValues.length) * 100);
  }

  /**
   * Compute z-score for a value
   */
  computeZScore(value, mean, stdDev) {
    if (stdDev === 0) return 0;
    return (value - mean) / stdDev;
  }

  /**
   * Normalize a value to 0-100 range
   */
  normalizeTo100(value, min, max) {
    if (max === min) return 50;
    const normalized = ((value - min) / (max - min)) * 100;
    return Math.round(Math.max(0, Math.min(100, normalized)));
  }

  /**
   * Fetch all repositories with their analysis data
   */
  async fetchRepositoryData() {
    const query = `
      SELECT 
        r.id,
        r.name,
        r.full_name,
        r.owner,
        r.health_score,
        r.language,
        r.stars,
        r.last_analyzed_at,
        -- Get PR statistics
        COALESCE((
          SELECT AVG(pr.risk_score) 
          FROM pull_requests pr 
          WHERE pr.repository_id = r.id AND pr.risk_score IS NOT NULL
        ), 0) as avg_pr_risk,
        COALESCE((
          SELECT AVG(pr.time_to_merge_hours) 
          FROM pull_requests pr 
          WHERE pr.repository_id = r.id AND pr.time_to_merge_hours IS NOT NULL
        ), 0) as merge_velocity,
        -- Get contributor statistics
        COALESCE((
          SELECT COUNT(DISTINCT c.id)
          FROM contributors c
          WHERE c.repository_id = r.id
        ), 0) as contributor_count,
        -- Get anomaly count
        COALESCE((
          SELECT COUNT(*)
          FROM anomalies a
          WHERE a.repository_id = r.id
        ), 0) as anomaly_count,
        -- Get churn metrics
        COALESCE((
          SELECT AVG(c.total_changes)
          FROM commits c
          WHERE c.repository_id = r.id
        ), 0) as avg_commit_changes,
        -- Get merged PR count
        COALESCE((
          SELECT COUNT(*)
          FROM pull_requests pr
          WHERE pr.repository_id = r.id AND pr.is_merged = true
        ), 0) as merged_pr_count,
        -- Get total PR count
        COALESCE((
          SELECT COUNT(*)
          FROM pull_requests pr
          WHERE pr.repository_id = r.id
        ), 0) as total_pr_count
      FROM repositories r
      WHERE r.is_active = true
      ORDER BY r.name
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  /**
   * Compute momentum score based on activity metrics
   */
  computeMomentumScore(repo) {
    const starsWeight = Math.min(repo.stars / 100, 1) * 30;
    const prActivity = repo.total_pr_count > 0 
      ? Math.min(repo.merged_pr_count / repo.total_pr_count, 1) * 40 
      : 0;
    const contributorFactor = Math.min(repo.contributor_count / 10, 1) * 30;
    
    return Math.round(starsWeight + prActivity + contributorFactor);
  }

  /**
   * Compute risk index (inverse - lower is better)
   */
  computeRiskIndex(avgPrRisk, anomalyCount, contributorCount) {
    const riskFromPr = avgPrRisk * 50 || 0;
    const riskFromAnomalies = Math.min(anomalyCount * 5, 25) || 0;
    const riskFromContributors = contributorCount < 3 ? 25 : 0;
    
    return Math.round(100 - (riskFromPr + riskFromAnomalies + riskFromContributors));
  }

  /**
   * Compute velocity index (higher is better)
   */
  computeVelocityIndex(mergeVelocity) {
    if (!mergeVelocity || mergeVelocity === 0) return 50;
    // Lower merge time is better - normalize inversely
    // Assume optimal merge time is 24 hours, worst is 168 hours (1 week)
    const optimal = 24;
    const worst = 168;
    if (mergeVelocity <= optimal) return 100;
    if (mergeVelocity >= worst) return 0;
    return Math.round(100 - ((mergeVelocity - optimal) / (worst - optimal)) * 100);
  }

  /**
   * Compute stability index
   */
  computeStabilityIndex(anomalyCount, avgCommitChanges) {
    const anomalyPenalty = Math.min(anomalyCount * 3, 40);
    // High commit changes might indicate instability
    const changePenalty = avgCommitChanges > 500 ? 20 : avgCommitChanges > 200 ? 10 : 0;
    
    return Math.round(100 - anomalyPenalty - changePenalty);
  }

  /**
   * Main function to compute and store benchmarks for all repositories
   */
  async computeBenchmarks() {
    const repos = await this.fetchRepositoryData();
    
    if (repos.length === 0) {
      console.log('No repositories to benchmark');
      return { computed: false, reason: 'No repositories found' };
    }

    // Extract arrays for percentile computation
    const healthScores = repos.map(r => r.health_score || 0);
    const momentumScores = repos.map(r => this.computeMomentumScore(r));
    const riskIndices = repos.map(r => this.computeRiskIndex(r.avg_pr_risk, r.anomaly_count, r.contributor_count));
    const velocityIndices = repos.map(r => this.computeVelocityIndex(r.merge_velocity));
    const stabilityIndices = repos.map(r => this.computeStabilityIndex(r.anomaly_count, r.avg_commit_changes));

    // Compute statistics for z-scores
    const healthStats = this.computeStats(healthScores);
    const momentumStats = this.computeStats(momentumScores);
    const riskStats = this.computeStats(riskIndices);
    const velocityStats = this.computeStats(velocityIndices);
    const stabilityStats = this.computeStats(stabilityIndices);

    // Compute benchmarks for each repository
    const benchmarkResults = repos.map(repo => {
      const healthScore = repo.health_score || 0;
      const momentumScore = this.computeMomentumScore(repo);
      const riskIndex = this.computeRiskIndex(repo.avg_pr_risk, repo.anomaly_count, repo.contributor_count);
      const velocityIndex = this.computeVelocityIndex(repo.merge_velocity);
      const stabilityIndex = this.computeStabilityIndex(repo.anomaly_count, repo.avg_commit_changes);

      // Compute percentiles
      const healthPercentile = this.computePercentile(healthScore, healthScores);
      const momentumPercentile = this.computePercentile(momentumScore, momentumScores);
      const riskPercentile = this.computePercentile(riskIndex, riskIndices);
      const velocityPercentile = this.computePercentile(velocityIndex, velocityIndices);
      const stabilityPercentile = this.computePercentile(stabilityIndex, stabilityIndices);

      // Compute z-scores
      const healthZscore = this.computeZScore(healthScore, healthStats.mean, healthStats.stdDev);
      const momentumZscore = this.computeZScore(momentumScore, momentumStats.mean, momentumStats.stdDev);
      const riskZscore = this.computeZScore(riskIndex, riskStats.mean, riskStats.stdDev);
      const velocityZscore = this.computeZScore(velocityIndex, velocityStats.mean, velocityStats.stdDev);
      const stabilityZscore = this.computeZScore(stabilityIndex, stabilityStats.mean, stabilityStats.stdDev);

      return {
        repository_id: repo.id,
        health_score: healthScore,
        momentum_score: momentumScore,
        avg_pr_risk: repo.avg_pr_risk || 0,
        merge_velocity: repo.merge_velocity || 0,
        churn_index: repo.avg_commit_changes || 0,
        anomaly_count: repo.anomaly_count,
        risk_index: riskIndex,
        velocity_index: velocityIndex,
        stability_index: stabilityIndex,
        health_percentile: healthPercentile,
        momentum_percentile: momentumPercentile,
        risk_percentile: riskPercentile,
        velocity_percentile: velocityPercentile,
        stability_percentile: stabilityPercentile,
        health_zscore: Math.round(healthZscore * 100) / 100,
        momentum_zscore: Math.round(momentumZscore * 100) / 100,
        risk_zscore: Math.round(riskZscore * 100) / 100,
        velocity_zscore: Math.round(velocityZscore * 100) / 100,
        stability_zscore: Math.round(stabilityZscore * 100) / 100,
        analysis_date: new Date()
      };
    });

    // Store benchmarks in database (upsert for each repository)
    for (const benchmark of benchmarkResults) {
      await pool.query(`
        INSERT INTO repository_metrics (
          repository_id, health_score, momentum_score, avg_pr_risk,
          merge_velocity, churn_index, anomaly_count, risk_index,
          velocity_index, stability_index, health_percentile,
          momentum_percentile, risk_percentile, velocity_percentile,
          stability_percentile, health_zscore, momentum_zscore,
          risk_zscore, velocity_zscore, stability_zscore, analysis_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        ON CONFLICT (repository_id) DO UPDATE SET
          health_score = EXCLUDED.health_score,
          momentum_score = EXCLUDED.momentum_score,
          avg_pr_risk = EXCLUDED.avg_pr_risk,
          merge_velocity = EXCLUDED.merge_velocity,
          churn_index = EXCLUDED.churn_index,
          anomaly_count = EXCLUDED.anomaly_count,
          risk_index = EXCLUDED.risk_index,
          velocity_index = EXCLUDED.velocity_index,
          stability_index = EXCLUDED.stability_index,
          health_percentile = EXCLUDED.health_percentile,
          momentum_percentile = EXCLUDED.momentum_percentile,
          risk_percentile = EXCLUDED.risk_percentile,
          velocity_percentile = EXCLUDED.velocity_percentile,
          stability_percentile = EXCLUDED.stability_percentile,
          health_zscore = EXCLUDED.health_zscore,
          momentum_zscore = EXCLUDED.momentum_zscore,
          risk_zscore = EXCLUDED.risk_zscore,
          velocity_zscore = EXCLUDED.velocity_zscore,
          stability_zscore = EXCLUDED.stability_zscore,
          analysis_date = EXCLUDED.analysis_date
      `, [
        benchmark.repository_id,
        benchmark.health_score,
        benchmark.momentum_score,
        benchmark.avg_pr_risk,
        benchmark.merge_velocity,
        benchmark.churn_index,
        benchmark.anomaly_count,
        benchmark.risk_index,
        benchmark.velocity_index,
        benchmark.stability_index,
        benchmark.health_percentile,
        benchmark.momentum_percentile,
        benchmark.risk_percentile,
        benchmark.velocity_percentile,
        benchmark.stability_percentile,
        benchmark.health_zscore,
        benchmark.momentum_zscore,
        benchmark.risk_zscore,
        benchmark.velocity_zscore,
        benchmark.stability_zscore,
        benchmark.analysis_date
      ]);
    }

    console.log(`✅ Computed benchmarks for ${repos.length} repositories`);
    return { computed: true, count: repos.length };
  }

  /**
   * Get benchmark overview statistics
   */
  async getOverview() {
    const reposResult = await pool.query(`
      SELECT COUNT(*) as total FROM repositories WHERE is_active = true
    `);
    const totalRepositories = parseInt(reposResult.rows[0].total);

    if (totalRepositories === 0) {
      return {
        total_repositories: 0,
        top_repository: null,
        bottom_repository: null,
        average_health_score: 0
      };
    }

    // Get top repository by health score
    const topResult = await pool.query(`
      SELECT r.name, r.full_name, rm.health_score, rm.health_percentile
      FROM repositories r
      JOIN repository_metrics rm ON r.id = rm.repository_id
      ORDER BY rm.health_score DESC, rm.health_percentile DESC
      LIMIT 1
    `);

    // Get bottom repository by health score
    const bottomResult = await pool.query(`
      SELECT r.name, r.full_name, rm.health_score, rm.health_percentile
      FROM repositories r
      JOIN repository_metrics rm ON r.id = rm.repository_id
      ORDER BY rm.health_score ASC, rm.health_percentile ASC
      LIMIT 1
    `);

    // Get average health score
    const avgResult = await pool.query(`
      SELECT AVG(health_score) as avg_health FROM repository_metrics
    `);
    const averageHealthScore = Math.round(avgResult.rows[0].avg_health || 0);

    return {
      total_repositories: totalRepositories,
      top_repository: topResult.rows[0] || null,
      bottom_repository: bottomResult.rows[0] || null,
      average_health_score: averageHealthScore
    };
  }

  /**
   * Get all repository rankings
   */
  async getRankings() {
    const result = await pool.query(`
      SELECT 
        r.id,
        r.name,
        r.full_name,
        r.owner,
        r.language,
        r.stars,
        rm.health_score,
        rm.health_percentile,
        rm.momentum_score,
        rm.momentum_percentile,
        rm.risk_index,
        rm.risk_percentile,
        rm.velocity_index,
        rm.velocity_percentile,
        rm.stability_index,
        rm.stability_percentile,
        rm.health_zscore,
        rm.momentum_zscore,
        rm.risk_zscore,
        rm.velocity_zscore,
        rm.stability_zscore,
        rm.analysis_date
      FROM repositories r
      JOIN repository_metrics rm ON r.id = rm.repository_id
      ORDER BY rm.health_score DESC, rm.health_percentile DESC
    `);

    return result.rows;
  }

  /**
   * Get distribution data for histograms
   */
  async getDistribution() {
    const healthResult = await pool.query(`
      SELECT 
        CASE 
          WHEN health_score >= 90 THEN '90-100'
          WHEN health_score >= 80 THEN '80-89'
          WHEN health_score >= 70 THEN '70-79'
          WHEN health_score >= 60 THEN '60-69'
          WHEN health_score >= 50 THEN '50-59'
          WHEN health_score >= 40 THEN '40-49'
          WHEN health_score >= 30 THEN '30-39'
          WHEN health_score >= 20 THEN '20-29'
          WHEN health_score >= 10 THEN '10-19'
          ELSE '0-9'
        END as range,
        COUNT(*) as count
      FROM repository_metrics
      GROUP BY range
      ORDER BY range DESC
    `);

    return healthResult.rows;
  }

  /**
   * Get specific repository's benchmark data
   */
  async getRepositoryBenchmark(identifier) {
    // Check if identifier is a number (ID) or string (full_name)
    const isNumeric = !isNaN(parseInt(identifier));
    
    let result;
    if (isNumeric) {
      result = await pool.query(`
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
    } else {
      result = await pool.query(`
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
    }

    return result.rows[0] || null;
  }

  /**
   * Generate insight text for a repository
   */
  generateInsight(benchmark) {
    if (!benchmark) return 'No benchmark data available.';
    
    const insights = [];
    
    // Health percentile insights
    if (benchmark.health_percentile >= 90) {
      insights.push('This repository ranks in the top 10% for engineering health.');
    } else if (benchmark.health_percentile >= 75) {
      insights.push('This repository ranks in the top 25% for engineering health.');
    } else if (benchmark.health_percentile >= 50) {
      insights.push('This repository is above average for engineering health.');
    } else if (benchmark.health_percentile >= 25) {
      insights.push('This repository is below average for engineering health.');
    } else {
      insights.push('This repository ranks in the bottom 25% for engineering health.');
    }
    
    // Velocity comparison
    if (benchmark.velocity_percentile >= 75) {
      insights.push('Merge velocity is excellent compared to peers.');
    } else if (benchmark.velocity_percentile < 50) {
      insights.push('Merge velocity is below average compared to peers.');
    }
    
    // Risk comparison
    if (benchmark.risk_percentile >= 75) {
      insights.push('Risk profile is better than most peer repositories.');
    } else if (benchmark.risk_percentile < 25) {
      insights.push('Risk profile needs attention compared to peers.');
    }
    
    // Stability comparison
    if (benchmark.stability_percentile >= 75) {
      insights.push('Codebase stability is in the top tier.');
    } else if (benchmark.stability_percentile < 50) {
      insights.push('Codebase stability could be improved.');
    }
    
    // Momentum insights
    if (benchmark.momentum_percentile >= 75) {
      insights.push('Project momentum is strong with high activity.');
    } else if (benchmark.momentum_percentile < 25) {
      insights.push('Project activity is lower than peer repositories.');
    }
    
    return 'RepoPulse Benchmark Insight: ' + insights.join(' ');
  }
}

module.exports = new BenchmarkService();
