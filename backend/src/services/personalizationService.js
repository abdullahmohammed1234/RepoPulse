/**
 * Personalization Service
 * Handles user preferences and personalized experiences
 */

const { query } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

// Default preferences
const DEFAULT_PREFERENCES = {
  theme: 'system',
  language: 'en',
  notifications: {
    email: true,
    push: true,
    riskAlerts: true
  },
  display: {
    showRiskScores: true,
    showContributors: true,
    defaultView: 'overview'
  },
  ai: {
    autoGenerate: true,
    preferredModel: 'auto',
    fallbackToMock: true
  }
};

class PersonalizationService {
  /**
   * Get user preferences
   */
  async getPreferences(userId) {
    try {
      if (!userId) {
        return DEFAULT_PREFERENCES;
      }
      
      const result = await query(
        'SELECT preferences FROM user_preferences WHERE user_id = $1',
        [userId]
      );
      
      if (result.rows.length === 0) {
        // Create default preferences for new user
        return await this.setPreferences(userId, DEFAULT_PREFERENCES);
      }
      
      return result.rows[0].preferences;
      
    } catch (error) {
      logger.error('Error getting preferences', { error: error.message, userId });
      return DEFAULT_PREFERENCES;
    }
  }
  
  /**
   * Set user preferences
   */
  async setPreferences(userId, preferences) {
    try {
      const mergedPreferences = {
        ...DEFAULT_PREFERENCES,
        ...preferences
      };
      
      await query(
        `INSERT INTO user_preferences (user_id, preferences, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) 
         DO UPDATE SET preferences = $2, updated_at = NOW()`,
        [userId, JSON.stringify(mergedPreferences)]
      );
      
      return mergedPreferences;
      
    } catch (error) {
      logger.error('Error setting preferences', { error: error.message, userId });
      throw error;
    }
  }
  
  /**
   * Update specific preference
   */
  async updatePreference(userId, key, value) {
    try {
      const current = await this.getPreferences(userId);
      
      // Handle nested keys like "notifications.email"
      const keys = key.split('.');
      let obj = current;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) {
          obj[keys[i]] = {};
        }
        obj = obj[keys[i]];
      }
      
      obj[keys[keys.length - 1]] = value;
      
      return await this.setPreferences(userId, current);
      
    } catch (error) {
      logger.error('Error updating preference', { error: error.message, userId, key });
      throw error;
    }
  }
  
  /**
   * Get personalized dashboard config
   */
  async getDashboardConfig(userId) {
    const preferences = await this.getPreferences(userId);
    
    return {
      layout: preferences.display?.defaultView || 'overview',
      showRiskScores: preferences.display?.showRiskScores ?? true,
      showContributors: preferences.display?.showContributors ?? true,
      theme: preferences.theme || 'system',
      ai: preferences.ai
    };
  }
  
  /**
   * Get personalization history
   */
  async getHistory(userId, limit = 10) {
    try {
      const result = await query(
        `SELECT * FROM personalization_history 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [userId, limit]
      );
      
      return result.rows;
      
    } catch (error) {
      logger.error('Error getting history', { error: error.message, userId });
      return [];
    }
  }
  
  /**
   * Record personalization action
   */
  async recordAction(userId, action, data) {
    try {
      await query(
        `INSERT INTO personalization_history (user_id, action, data)
         VALUES ($1, $2, $3)`,
        [userId, action, JSON.stringify(data)]
      );
      
    } catch (error) {
      logger.error('Error recording action', { error: error.message, userId, action });
    }
  }
}

module.exports = new PersonalizationService();
