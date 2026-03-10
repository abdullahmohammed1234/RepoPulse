const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

class MLService {
  constructor() {
    this.client = axios.create({
      baseURL: ML_SERVICE_URL,
      timeout: 30000,
    });
  }

  /**
   * Train the risk model
   */
  async trainRiskModel(repositoryId) {
    try {
      const response = await this.client.post('/ml/train-risk-model', {
        repository_id: repositoryId,
      });
      return response.data;
    } catch (error) {
      console.error('ML Service error (train-risk-model):', error.message);
      throw error;
    }
  }

  /**
   * Predict PR risk score with explanation
   */
  async predictRisk(prFeatures) {
    try {
      const response = await this.client.post('/ml/predict-risk', {
        f1: prFeatures.f1,
        f2: prFeatures.f2,
        f3: prFeatures.f3,
        f4: prFeatures.f4,
        f5: prFeatures.f5,
        f6: prFeatures.f6,
        f7: prFeatures.f7,
        f8: prFeatures.f8,
      });
      return response.data;
    } catch (error) {
      console.error('ML Service error (predict-risk):', error.message);
      // Return fallback risk score with default explanation
      return this.getFallbackRiskResponse();
    }
  }

  /**
   * Generate fallback response when ML service is unavailable
   */
  getFallbackRiskResponse() {
    return {
      risk_score: 0.5,
      risk_level: 'Medium',
      confidence: 0.5,
      model_used: 'fallback',
      top_factors: [
        { feature: 'Unknown', value: 0, impact_weight: 0.33 },
        { feature: 'Unknown', value: 0, impact_weight: 0.33 },
        { feature: 'Unknown', value: 0, impact_weight: 0.34 }
      ],
      recommendations: ['Unable to generate recommendations at this time.']
    };
  }

  /**
   * Determine risk level from score
   */
  getRiskLevel(score) {
    if (score < 0.4) return 'Low';
    if (score <= 0.7) return 'Medium';
    return 'High';
  }

  /**
   * Predict file churn
   */
  async predictChurn(fileFeatures) {
    try {
      const response = await this.client.post('/ml/predict-churn', {
        features: fileFeatures,
      });
      return response.data;
    } catch (error) {
      console.error('ML Service error (predict-churn):', error.message);
      return { churn_probability: 0.5, model_used: 'fallback' };
    }
  }

  /**
   * Detect contributor anomalies
   */
  async detectAnomalies(contributorFeatures) {
    try {
      const response = await this.client.post('/ml/detect-anomalies', {
        features: contributorFeatures,
      });
      return response.data;
    } catch (error) {
      console.error('ML Service error (detect-anomalies):', error.message);
      return { anomaly_scores: [], model_used: 'fallback' };
    }
  }

  /**
   * Run full ML analysis on repository
   */
  async analyzeRepository(repositoryId, prs, contributors) {
    console.log('🤖 Running ML analysis...');
    
    try {
      // 1. Train and predict risk for all PRs
      console.log('   Processing PR risk scores with explanations...');
      const prRiskResults = [];
      
      for (const pr of prs) {
        const features = this.extractPRFeatures(pr);
        const result = await this.predictRisk(features);
        
        pr.risk_score = result.risk_score;
        pr.risk_level = result.risk_level || this.getRiskLevel(result.risk_score);
        pr.top_factors = result.top_factors || [];
        pr.recommendations = result.recommendations || [];
        
        prRiskResults.push({
          id: pr.id,
          risk_score: pr.risk_score,
          risk_level: pr.risk_level,
          top_factors: pr.top_factors,
          recommendations: pr.recommendations
        });
      }
      
      // 2. Predict churn for hotspot files
      console.log('   Processing file churn prediction...');
      const churnResults = await this.predictChurn({});
      
      // 3. Detect contributor anomalies
      console.log('   Processing anomaly detection...');
      const anomalyResults = await this.detectAnomalies(
        contributors.map(c => ({
          experience_score: c.experience_score,
          contributions: c.contributions,
          rejection_rate: c.rejection_rate || 0,
        }))
      );

      // 4. Calculate repository insights for executive summary
      console.log('   Generating repository insights...');
      const repoInsights = this.generateRepositoryInsights(prs, contributors, churnResults);
      
      return {
        prRiskScores: prRiskResults,
        churnResults,
        anomalyResults,
        repoInsights,
      };
    } catch (error) {
      console.error('ML analysis failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate repository-level insights for executive summary
   */
  generateRepositoryInsights(prs, contributors, churnResults) {
    const insights = {
      avgRiskTrend: 'stable',
      topChurnFiles: [],
      contributorAnomalyCount: 0,
      mergeVelocityChange: 0,
      summary: ''
    };
    
    // Calculate average risk
    if (prs.length > 0) {
      const avgRisk = prs.reduce((sum, pr) => sum + (pr.risk_score || 0), 0) / prs.length;
      
      // Determine risk trend
      const recentPRs = prs.slice(0, Math.min(10, prs.length));
      const recentAvgRisk = recentPRs.reduce((sum, pr) => sum + (pr.risk_score || 0), 0) / recentPRs.length;
      
      if (recentAvgRisk > avgRisk + 0.1) {
        insights.avgRiskTrend = 'increasing';
      } else if (recentAvgRisk < avgRisk - 0.1) {
        insights.avgRiskTrend = 'decreasing';
      } else {
        insights.avgRiskTrend = 'stable';
      }
      
      insights.avgRisk = avgRisk;
    }
    
    // Count high-risk PRs
    const highRiskCount = prs.filter(pr => (pr.risk_score || 0) > 0.7).length;
    insights.highRiskCount = highRiskCount;
    
    // Count contributor anomalies
    const anomalyCount = contributors.filter(c => (c.anomaly_score || 0) > 0.7).length;
    insights.contributorAnomalyCount = anomalyCount;
    
    // Calculate merge velocity (average time to merge)
    const mergedPRs = prs.filter(pr => pr.state === 'merged' && pr.time_to_merge_hours);
    if (mergedPRs.length > 1) {
      // Compare recent half to older half
      const midpoint = Math.floor(mergedPRs.length / 2);
      const recentPRs = mergedPRs.slice(0, midpoint);
      const olderPRs = mergedPRs.slice(midpoint);
      
      const recentAvgTime = recentPRs.reduce((sum, pr) => sum + pr.time_to_merge_hours, 0) / recentPRs.length;
      const olderAvgTime = olderPRs.reduce((sum, pr) => sum + pr.time_to_merge_hours, 0) / olderPRs.length;
      
      if (olderAvgTime > 0) {
        insights.mergeVelocityChange = Math.round(((olderAvgTime - recentAvgTime) / olderAvgTime) * 100);
      }
    }
    
    // Generate summary text
    let riskDesc = 'moderate';
    if (insights.avgRisk > 0.6) riskDesc = 'high';
    else if (insights.avgRisk < 0.3) riskDesc = 'low';
    
    const riskTrendDesc = insights.avgRiskTrend === 'increasing' ? 'increasing' : 
                          insights.avgRiskTrend === 'decreasing' ? 'decreasing' : 'stable';
    
    let summary = `This repository shows ${riskDesc} PR risk with ${riskTrendDesc} trends.`;
    
    if (highRiskCount > 0) {
      summary += ` ${highRiskCount} high-risk PR${highRiskCount > 1 ? 's are' : ' is'} currently pending.`;
    }
    
    if (anomalyCount > 0) {
      summary += ` ${anomalyCount} contributor anomal${anomalyCount > 1 ? 'ies' : 'y'} detected.`;
    }
    
    if (insights.mergeVelocityChange !== 0) {
      const direction = insights.mergeVelocityChange > 0 ? 'increased' : 'decreased';
      summary += ` Merge velocity has ${direction} by ${Math.abs(insights.mergeVelocityChange)}% this week.`;
    }
    
    insights.summary = summary;
    
    return insights;
  }

  /**
   * Extract features from PR for ML prediction
   */
  extractPRFeatures(pr) {
    return {
      f1: Math.log(1 + (pr.lines_added || 0) + (pr.lines_deleted || 0)),
      f2: pr.files_changed || 0,
      f3: pr.commits_count || 0,
      f4: pr.review_comments || 0,
      f5: Math.min((pr.time_to_merge_hours || 0) / 168, 1),
      f6: pr.contributor_rejection_rate || 0,
      f7: Math.min((pr.contributor_experience_score || 0) / 100, 1),
      f8: 0.5, // Average file churn (would need file data)
    };
  }
}

module.exports = new MLService();
