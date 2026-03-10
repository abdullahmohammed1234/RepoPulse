/**
 * Export Service
 * Handles exporting repository data in various formats
 */

const { query } = require('../config/db');
const logger = require('./logger');

class ExportService {
  /**
   * Export repository data in specified format
   */
  async exportRepository(repositoryId, format = 'json') {
    try {
      // Get repository data
      const repoResult = await query(
        'SELECT * FROM repositories WHERE id = $1',
        [repositoryId]
      );
      
      if (repoResult.rows.length === 0) {
        throw new Error('Repository not found');
      }
      
      const repository = repoResult.rows[0];
      
      // Get related data based on format
      let data;
      
      switch (format) {
        case 'json':
          data = await this.exportAsJSON(repositoryId);
          break;
        case 'csv':
          data = await this.exportAsCSV(repositoryId);
          break;
        case 'markdown':
          data = await this.exportAsMarkdown(repository);
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
      
      return {
        format,
        data,
        exportedAt: new Date().toISOString(),
        repository: {
          id: repository.id,
          name: repository.name,
          fullName: repository.full_name
        }
      };
      
    } catch (error) {
      logger.error('Export failed', { error: error.message, repositoryId, format });
      throw error;
    }
  }
  
  /**
   * Export as JSON
   */
  async exportAsJSON(repositoryId) {
    const repoResult = await query(
      'SELECT * FROM repositories WHERE id = $1',
      [repositoryId]
    );
    
    const prsResult = await query(
      'SELECT * FROM pull_requests WHERE repository_id = $1 ORDER BY created_at DESC',
      [repositoryId]
    );
    
    const contributorsResult = await query(
      'SELECT * FROM contributors WHERE repository_id = $1 ORDER BY contributions DESC',
      [repositoryId]
    );
    
    return {
      repository: repoResult.rows[0],
      pullRequests: prsResult.rows,
      contributors: contributorsResult.rows,
      exportedAt: new Date().toISOString()
    };
  }
  
  /**
   * Export as CSV
   */
  async exportAsCSV(repositoryId) {
    const prsResult = await query(
      `SELECT 
        number, title, state, risk_score, risk_level,
        lines_added, lines_deleted, files_changed,
        created_at, merged_at
       FROM pull_requests 
       WHERE repository_id = $1 
       ORDER BY created_at DESC`,
      [repositoryId]
    );
    
    // Convert to CSV
    const headers = Object.keys(prsResult.rows[0] || {}).join(',');
    const rows = prsResult.rows.map(row => 
      Object.values(row).map(v => 
        typeof v === 'string' && v.includes(',') ? `"${v}"` : v
      ).join(',')
    );
    
    return [headers, ...rows].join('\n');
  }
  
  /**
   * Export as Markdown
   */
  async exportAsMarkdown(repository) {
    const prsResult = await query(
      `SELECT 
        number, title, state, risk_score, risk_level,
        lines_added, lines_deleted
       FROM pull_requests 
       WHERE repository_id = $1 
       ORDER BY created_at DESC
       LIMIT 20`,
      [repository.id]
    );
    
    const contributorsResult = await query(
      `SELECT login, contributions, experience_score
       FROM contributors 
       WHERE repository_id = $1 
       ORDER BY contributions DESC
       LIMIT 10`,
      [repository.id]
    );
    
    let markdown = `# ${repository.full_name}\n\n`;
    markdown += `${repository.description || 'No description'}\n\n`;
    markdown += `**Language:** ${repository.language || 'Unknown'}\n`;
    markdown += `**Stars:** ${repository.stars || 0}\n`;
    markdown += `**Forks:** ${repository.forks || 0}\n\n`;
    
    markdown += `## Recent Pull Requests\n\n`;
    markdown += `| # | Title | State | Risk | Lines |\n`;
    markdown += `|---|-------|-------|------|-------|\n`;
    
    for (const pr of prsResult.rows) {
      markdown += `| ${pr.number} | ${pr.title} | ${pr.state} | ${pr.risk_level || 'N/A'} | +${pr.lines_added} -${pr.lines_deleted} |\n`;
    }
    
    markdown += `\n## Top Contributors\n\n`;
    for (const contributor of contributorsResult.rows) {
      markdown += `- ${contributor.login} (${contributor.contributions} contributions)\n`;
    }
    
    return markdown;
  }
  
  /**
   * Export PR analysis
   */
  async exportPRAnalysis(pullRequestId) {
    const prResult = await query(
      'SELECT * FROM pull_requests WHERE id = $1',
      [pullRequestId]
    );
    
    if (prResult.rows.length === 0) {
      throw new Error('Pull request not found');
    }
    
    const pr = prResult.rows[0];
    
    return {
      pullRequest: pr,
      analysis: {
        riskScore: pr.risk_score,
        riskLevel: pr.risk_level,
        topFactors: pr.top_factors,
        recommendations: pr.recommendations
      },
      exportedAt: new Date().toISOString()
    };
  }
}

module.exports = new ExportService();
