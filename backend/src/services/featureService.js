const { query } = require('../config/db');

class FeatureService {
  /**
   * Calculate feature engineering for a repository's pull requests
   */
  async computeFeatures(repositoryId) {
    console.log('🧠 Computing features for repository...');
    
    // Get all PRs for the repository
    const prsResult = await query(
      `SELECT pr.*, c.login, c.experience_score, c.total_commits, c.months_active
       FROM pull_requests pr
       LEFT JOIN contributors c ON pr.contributor_id = c.id
       WHERE pr.repository_id = $1`,
      [repositoryId]
    );
    
    const prs = prsResult.rows;
    console.log(`   Computing features for ${prs.length} pull requests`);
    
    // Get all contributors for the repository
    const contributorsResult = await query(
      `SELECT * FROM contributors WHERE repository_id = $1`,
      [repositoryId]
    );
    const contributors = contributorsResult.rows;
    
    // Calculate contributor rejection rates
    const rejectionRates = this.calculateRejectionRates(prs);
    
    // Get file churn data
    const fileChurnData = await this.getFileChurnData(repositoryId);
    
    // Process each PR and compute features
    for (const pr of prs) {
      const features = this.computePRFeatures(pr, rejectionRates, fileChurnData);
      
      // Store features (convert to integers for database columns)
      await query(
        `UPDATE pull_requests SET 
          lines_added = $1,
          lines_deleted = $2,
          files_changed = $3
         WHERE id = $4`,
        [Math.round(features.f1), Math.round(features.f2), Math.round(features.f3), pr.id]
      );
    }
    
    // Update contributor experience scores if not already done
    for (const contributor of contributors) {
      const experienceScore = contributor.total_commits / (1 + contributor.months_active);
      await query(
        `UPDATE contributors SET experience_score = $1 WHERE id = $2`,
        [experienceScore, contributor.id]
      );
    }
    
    // Mark files as hotspots based on churn
    await this.identifyHotspots(repositoryId, fileChurnData);
    
    console.log('✅ Feature computation complete');
    return { prsCount: prs.length, contributorsCount: contributors.length };
  }

  /**
   * Calculate rejection rates for contributors
   */
  calculateRejectionRates(pullRequests) {
    const contributorStats = {};
    
    for (const pr of pullRequests) {
      if (!pr.contributor_id) continue;
      
      if (!contributorStats[pr.contributor_id]) {
        contributorStats[pr.contributor_id] = {
          total: 0,
          rejected: 0,
        };
      }
      
      contributorStats[pr.contributor_id].total++;
      
      // Consider a PR rejected if it was closed without merging
      if (pr.state === 'closed' && !pr.is_merged) {
        contributorStats[pr.contributor_id].rejected++;
      }
    }
    
    const rejectionRates = {};
    for (const [contributorId, stats] of Object.entries(contributorStats)) {
      rejectionRates[contributorId] = stats.total > 0 
        ? stats.rejected / stats.total 
        : 0;
    }
    
    return rejectionRates;
  }

  /**
   * Get file churn data for the repository
   */
  async getFileChurnData(repositoryId) {
    const result = await query(
      `SELECT filename, 
              SUM(additions) as total_additions, 
              SUM(deletions) as total_deletions, 
              COUNT(*) as modification_count
       FROM files
       WHERE repository_id = $1
       GROUP BY filename`,
      [repositoryId]
    );
    
    const fileChurn = {};
    for (const row of result.rows) {
      const additions = parseInt(row.total_additions) || 0;
      const deletions = parseInt(row.total_deletions) || 0;
      const modifications = parseInt(row.modification_count) || 1;
      
      fileChurn[row.filename] = {
        additions,
        deletions,
        modifications,
        churnScore: (additions + deletions) / (1 + modifications),
      };
    }
    
    return fileChurn;
  }

  /**
   * Get file churn data by file ID
   */
  async getFileChurnDataById(repositoryId) {
    const result = await query(
      `SELECT id, filename, file_churn_score, is_hotspot, modification_count
       FROM files
       WHERE repository_id = $1 AND file_churn_score IS NOT NULL`,
      [repositoryId]
    );
    
    const fileChurn = {};
    for (const row of result.rows) {
      fileChurn[row.id] = {
        filename: row.filename,
        churnScore: parseFloat(row.file_churn_score) || 0,
        isHotspot: row.is_hotspot,
        modificationCount: parseInt(row.modification_count) || 0,
      };
    }
    
    return fileChurn;
  }

  /**
   * Compute features for a single PR
   */
  computePRFeatures(pr, rejectionRates, fileChurnData) {
    const linesAdded = pr.lines_added || 0;
    const linesDeleted = pr.lines_deleted || 0;
    const filesChanged = pr.files_changed || 0;
    const commitsCount = pr.commits_count || 0;
    const reviewComments = pr.review_comments || 0;
    const timeToMerge = pr.time_to_merge_hours || 0;
    
    // f1 = log(1 + lines_added + lines_deleted)
    const f1 = Math.log(1 + linesAdded + linesDeleted);
    
    // f2 = files_changed
    const f2 = filesChanged;
    
    // f3 = commits_count
    const f3 = commitsCount;
    
    // f4 = review_comments
    const f4 = reviewComments;
    
    // f5 = time_to_merge (normalized)
    const f5 = Math.min(timeToMerge / 168, 1); // Normalize to 1 week
    
    // f6 = contributor_rejection_rate
    const f6 = rejectionRates[pr.contributor_id] || 0;
    
    // f7 = contributor_experience_score (normalized)
    const f7 = Math.min((pr.experience_score || 0) / 100, 1);
    
    // f8 = average_churn_of_modified_files
    // This would require fetching files for this PR, simplified here
    const f8 = 0.5; // Default value
    
    return {
      f1,
      f2,
      f3,
      f4,
      f5,
      f6,
      f7,
      f8,
    };
  }

  /**
   * Identify hotspot files based on churn score
   */
  async identifyHotspots(repositoryId, fileChurnData) {
    const threshold = 100; // Files with churn score above this are hotspots
    
    for (const [filename, data] of Object.entries(fileChurnData)) {
      const isHotspot = data.churnScore > threshold;
      
      await query(
        `UPDATE files SET 
          file_churn_score = $1,
          is_hotspot = $2
         WHERE repository_id = $3 AND filename = $4`,
        [data.churnScore, isHotspot, repositoryId, filename]
      );
    }
  }

  /**
   * Calculate repository health score
   */
  async calculateHealthScore(repositoryId) {
    // Get PR risk data
    const prRiskResult = await query(
      `SELECT AVG(risk_score) as avg_risk, COUNT(*) as total
       FROM pull_requests 
       WHERE repository_id = $1 AND risk_score IS NOT NULL`,
      [repositoryId]
    );
    
    const avgPrRisk = prRiskResult.rows[0]?.avg_risk || 0;
    const totalPRs = prRiskResult.rows[0]?.total || 0;
    
    // Get high churn files count
    const highChurnResult = await query(
      `SELECT COUNT(*) as count
       FROM files
       WHERE repository_id = $1 AND is_hotspot = true`,
      [repositoryId]
    );
    
    const highChurnFilesCount = parseInt(highChurnResult.rows[0]?.count) || 0;
    
    // Get anomaly count
    const anomalyResult = await query(
      `SELECT COUNT(*) as count
       FROM anomalies
       WHERE repository_id = $1 AND is_resolved = false`,
      [repositoryId]
    );
    
    const anomalyCount = parseInt(anomalyResult.rows[0]?.count) || 0;
    
    // Calculate merge velocity score (based on recent merged PRs)
    const velocityResult = await query(
      `SELECT AVG(time_to_merge_hours) as avg_time
       FROM pull_requests
       WHERE repository_id = $1 AND is_merged = true AND time_to_merge_hours IS NOT NULL
       LIMIT 20`,
      [repositoryId]
    );
    
    const avgMergeTime = velocityResult.rows[0]?.avg_time || 168; // Default 1 week
    // Score: lower is better. 0 hours = 100, 168+ hours = 0
    const mergeVelocityScore = Math.max(0, 100 - (avgMergeTime / 1.68));
    
    // Calculate final health score
    // health_score = 100 - (avg_pr_risk * 30) - (high_churn_files_count * 2) - (anomaly_count * 5) - ((100 - merge_velocity_score) * 10)
    let healthScore = 100 
      - (avgPrRisk * 30) 
      - (highChurnFilesCount * 2) 
      - (anomalyCount * 5) 
      - ((100 - mergeVelocityScore) * 0.1 * 10);
    
    // Clamp between 0 and 100
    healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));
    
    // Update repository with health score
    await query(
      `UPDATE repositories SET health_score = $1 WHERE id = $2`,
      [healthScore, repositoryId]
    );
    
    return {
      healthScore,
      avgPrRisk,
      highChurnFilesCount,
      anomalyCount,
      mergeVelocityScore,
      totalPRs,
    };
  }

  // ============================================
  // PR SIMULATION FEATURE ENGINEERING
  // ============================================

  /**
   * Compute simulation features for a hypothetical PR
   * @param {number} repositoryId - Repository ID
   * @param {Object} simulationInput - User input for simulation
   * @param {number} simulationInput.lines_added - Lines added
   * @param {number} simulationInput.lines_deleted - Lines deleted
   * @param {number} simulationInput.files_changed - Number of files changed
   * @param {number} simulationInput.commits_count - Number of commits
   * @param {number} simulationInput.contributor_id - Contributor ID
   * @param {number[]} simulationInput.target_files - Array of file IDs
   */
  async computeSimulationFeatures(repositoryId, simulationInput) {
    const { lines_added, lines_deleted, files_changed, commits_count, contributor_id, target_files } = simulationInput;
    
    // Get repository averages and contributor data
    const repoAverages = await this.getRepositoryAverages(repositoryId);
    const contributorData = await this.getContributorData(repositoryId, contributor_id);
    const fileChurnData = await this.getFileChurnDataById(repositoryId);
    
    // Calculate feature f1 = log(1 + lines_added + lines_deleted)
    const f1 = Math.log(1 + (lines_added || 0) + (lines_deleted || 0));
    
    // f2 = files_changed
    const f2 = files_changed || 0;
    
    // f3 = commits_count
    const f3 = commits_count || 0;
    
    // f4 = estimated_review_comments (use repo average ratio)
    const f4 = repoAverages.avgReviewComments * (1 + (f2 / 10));
    
    // f5 = average_time_to_merge (use contributor history or repo average)
    const f5 = contributorData?.avgTimeToMerge 
      ? Math.min(contributorData.avgTimeToMerge / 168, 1) // Normalize to 1 week
      : Math.min(repoAverages.avgTimeToMerge / 168, 1);
    
    // f6 = contributor_rejection_rate
    const f6 = contributorData?.rejectionRate || repoAverages.avgRejectionRate || 0;
    
    // f7 = contributor_experience_score
    const f7 = contributorData?.experienceScore 
      ? Math.min(contributorData.experienceScore / 100, 1)
      : 0.5; // Default mid-level if unknown
    
    // f8 = average_churn_of_target_files
    let f8 = repoAverages.avgChurnScore / 100; // Default to repo average (normalized)
    
    if (target_files && target_files.length > 0) {
      // Calculate average churn for target files
      let totalChurn = 0;
      let fileCount = 0;
      
      for (const fileId of target_files) {
        const fileInfo = fileChurnData[fileId];
        if (fileInfo) {
          totalChurn += fileInfo.churnScore;
          fileCount++;
        }
      }
      
      if (fileCount > 0) {
        // Normalize churn score to 0-1 range (churn scores can be quite high)
        f8 = Math.min((totalChurn / fileCount) / 100, 1);
      }
    }
    
    return {
      f1: parseFloat(f1.toFixed(4)),
      f2: parseFloat(f2.toFixed(4)),
      f3: parseFloat(f3.toFixed(4)),
      f4: parseFloat(f4.toFixed(4)),
      f5: parseFloat(f5.toFixed(4)),
      f6: parseFloat(f6.toFixed(4)),
      f7: parseFloat(f7.toFixed(4)),
      f8: parseFloat(f8.toFixed(4)),
    };
  }

  /**
   * Get repository average metrics for simulation
   */
  async getRepositoryAverages(repositoryId) {
    // Get average review comments per PR
    const reviewCommentsResult = await query(
      `SELECT AVG(review_comments) as avg_review_comments 
       FROM pull_requests 
       WHERE repository_id = $1 AND review_comments IS NOT NULL`,
      [repositoryId]
    );
    
    // Get average time to merge
    const timeToMergeResult = await query(
      `SELECT AVG(time_to_merge_hours) as avg_time_to_merge 
       FROM pull_requests 
       WHERE repository_id = $1 AND is_merged = true AND time_to_merge_hours IS NOT NULL`,
      [repositoryId]
    );
    
    // Get average rejection rate for repository
    const rejectionResult = await query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE state = 'closed' AND is_merged = false) as rejected
       FROM pull_requests 
       WHERE repository_id = $1`,
      [repositoryId]
    );
    
    const avgRejectionRate = rejectionResult.rows[0].total > 0
      ? rejectionResult.rows[0].rejected / rejectionResult.rows[0].total
      : 0.2; // Default 20% if no data
    
    // Get average file churn
    const churnResult = await query(
      `SELECT AVG(file_churn_score) as avg_churn 
       FROM files 
       WHERE repository_id = $1 AND file_churn_score IS NOT NULL`,
      [repositoryId]
    );
    
    // Get average risk score for comparison
    const riskResult = await query(
      `SELECT AVG(risk_score) as avg_risk 
       FROM pull_requests 
       WHERE repository_id = $1 AND risk_score IS NOT NULL`,
      [repositoryId]
    );
    
    return {
      avgReviewComments: parseFloat(reviewCommentsResult.rows[0]?.avg_review_comments) || 2,
      avgTimeToMerge: parseFloat(timeToMergeResult.rows[0]?.avg_time_to_merge) || 72, // Default 3 days
      avgRejectionRate: parseFloat(avgRejectionRate),
      avgChurnScore: parseFloat(churnResult.rows[0]?.avg_churn) || 50, // Default medium churn
      avgRiskScore: parseFloat(riskResult.rows[0]?.avg_risk) || 0.5,
    };
  }

  /**
   * Get contributor data for simulation
   */
  async getContributorData(repositoryId, contributorId) {
    if (!contributorId) return null;
    
    const result = await query(
      `SELECT c.*,
        AVG(pr.time_to_merge_hours) as avg_time_to_merge,
        COUNT(pr.id) as pr_count,
        COUNT(pr.id) FILTER (WHERE pr.state = 'closed' AND pr.is_merged = false) as rejected_count
       FROM contributors c
       LEFT JOIN pull_requests pr ON c.id = pr.contributor_id AND pr.repository_id = $1
       WHERE c.id = $2
       GROUP BY c.id`,
      [repositoryId, contributorId]
    );
    
    if (result.rows.length === 0) return null;
    
    const contributor = result.rows[0];
    const rejectionRate = contributor.pr_count > 0
      ? contributor.rejected_count / contributor.pr_count
      : 0.2;
    
    return {
      rejectionRate: parseFloat(rejectionRate),
      experienceScore: parseFloat(contributor.experience_score) || 0,
      avgTimeToMerge: parseFloat(contributor.avg_time_to_merge) || null,
      totalPRs: contributor.pr_count,
    };
  }

  /**
   * Get high-churn files for target file selection
   */
  async getHighChurnFiles(repositoryId, limit = 20) {
    const result = await query(
      `SELECT id, filename, file_churn_score, is_hotspot, modification_count
       FROM files
       WHERE repository_id = $1 AND file_churn_score IS NOT NULL
       ORDER BY file_churn_score DESC
       LIMIT $2`,
      [repositoryId, limit]
    );
    
    return result.rows.map(row => ({
      id: row.id,
      filename: row.filename,
      churnScore: parseFloat(row.file_churn_score),
      isHotspot: row.is_hotspot,
      modificationCount: parseInt(row.modification_count),
    }));
  }

  /**
   * Calculate comparative insights
   */
  async calculateComparativeInsight(repositoryId, riskScore) {
    const repoAverages = await this.getRepositoryAverages(repositoryId);
    
    const diff = riskScore - repoAverages.avgRiskScore;
    const percentDiff = repoAverages.avgRiskScore > 0 
      ? ((diff / repoAverages.avgRiskScore) * 100).toFixed(0)
      : 0;
    
    let relativeLabel;
    if (diff > 0.1) {
      relativeLabel = 'Higher than typical PR';
    } else if (diff < -0.1) {
      relativeLabel = 'Lower than typical PR';
    } else {
      relativeLabel = 'Average risk level';
    }
    
    return {
      repoAvgRisk: repoAverages.avgRiskScore,
      riskVsRepoAvg: `${diff >= 0 ? '+' : ''}${percentDiff}%`,
      relativeLabel,
    };
  }

  /**
   * Estimate risk reduction potential
   */
  async estimateRiskReduction(repositoryId, originalInput, reductionPercent = 30) {
    // Create a modified input with reduced lines_added
    const reducedInput = {
      ...originalInput,
      lines_added: Math.round(originalInput.lines_added * (1 - reductionPercent / 100)),
      lines_deleted: Math.round(originalInput.lines_deleted * (1 - reductionPercent / 100)),
    };
    
    // Compute reduced features
    const reducedFeatures = await this.computeSimulationFeatures(repositoryId, reducedInput);
    
    // Return the features for ML prediction
    return reducedFeatures;
  }
}

module.exports = new FeatureService();
