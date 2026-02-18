/**
 * AI Generation Service
 * Provides AI-generated content with fallback to mock data
 */

const { query } = require('../config/db');
const logger = require('./logger');

// Ensure logger has info method
if (typeof logger.info !== 'function') {
  logger.info = (msg) => console.log('[INFO]', msg);
  logger.warn = (msg) => console.log('[WARN]', msg);
  logger.error = (msg) => console.error('[ERROR]', msg);
}

// Mock data templates for fallback
const MOCK_DATA = {
  repositorySummary: (repo) => ({
    summary: `This is an AI-generated summary for ${repo.name}.`,
    overview: `${repo.name} is a ${repo.language || 'unknown'} project with ${repo.stars || 0} stars.`,
    keyInsights: [
      'The repository has a healthy contribution pattern',
      'Code review process is well established',
      'Recent activity shows consistent development'
    ],
    recommendations: [
      'Continue maintaining current code review practices',
      'Consider adding more documentation for new contributors',
      'Monitor dependency updates regularly'
    ]
  }),
  
  prDescription: (pr, repo) => ({
    title: pr.title,
    description: `This PR addresses key improvements for ${repo.name}.`,
    changes: [
      'Modified core functionality for better performance',
      'Added new features as requested in issue tracker',
      'Fixed identified bugs and edge cases'
    ],
    impact: 'This change will improve the overall stability and performance of the codebase.',
    testing: 'All tests pass locally and in CI/CD pipeline.'
  }),
  
  codeReviewSummary: (pr) => ({
    summary: `Code review for PR #${pr.number}: ${pr.title}`,
    overallAssessment: 'The changes look good with some suggestions for improvement.',
    strengths: [
      'Code follows project conventions',
      'Tests are comprehensive',
      'Documentation is updated appropriately'
    ],
    suggestions: [
      'Consider adding more inline comments for complex logic',
      'Edge case handling could be more thorough',
      'Performance optimization opportunities exist'
    ],
    risks: [
      { level: 'low', description: 'Minor edge cases not covered' }
    ]
  }),
  
  contributorInsights: (contributor) => ({
    name: contributor.login,
    overview: `Analysis of ${contributor.login}'s contributions to the repository.`,
    strengths: [
      'Consistent commit history',
      'Good code quality',
      'Active participation in code reviews'
    ],
    recommendations: [
      'Consider mentoring new contributors',
      'Could take on more leadership roles in design discussions'
    ],
    stats: {
      totalContributions: contributor.contributions || 0,
      experienceLevel: contributor.experience_score > 0.7 ? 'Senior' : 'Mid-level'
    }
  })
};

class AIGenerationService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    this.useMock = !this.apiKey;
    
    if (this.useMock) {
      logger.info('AI Generation: Using mock data (no API key configured)');
    }
  }
  
  /**
   * Generate repository insights using AI or fallback
   */
  async generateRepositorySummary(repositoryId) {
    try {
      const repoResult = await query(
        'SELECT * FROM repositories WHERE id = $1',
        [repositoryId]
      );
      
      if (repoResult.rows.length === 0) {
        throw new Error('Repository not found');
      }
      
      const repo = repoResult.rows[0];
      
      if (!this.useMock) {
        try {
          return await this.callAIApi({
            type: 'repository_summary',
            repository: repo
          });
        } catch (aiError) {
          logger.warn('AI generation failed, using mock data', { error: aiError.message });
        }
      }
      
      return this.generateMockData('repositorySummary', repo);
      
    } catch (error) {
      logger.error('Repository summary generation failed', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Generate PR description using AI or fallback
   */
  async generatePRDescription(pullRequestId) {
    try {
      const prResult = await query(
        `SELECT pr.*, r.name as repo_name, r.language 
         FROM pull_requests pr 
         JOIN repositories r ON pr.repository_id = r.id 
         WHERE pr.id = $1`,
        [pullRequestId]
      );
      
      if (prResult.rows.length === 0) {
        throw new Error('Pull request not found');
      }
      
      const pr = prResult.rows[0];
      
      if (!this.useMock) {
        try {
          return await this.callAIApi({
            type: 'pr_description',
            pullRequest: pr
          });
        } catch (aiError) {
          logger.warn('AI generation failed, using mock data', { error: aiError.message });
        }
      }
      
      return this.generateMockData('prDescription', pr, { repo: pr });
      
    } catch (error) {
      logger.error('PR description generation failed', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Generate code review summary using AI or fallback
   */
  async generateCodeReviewSummary(pullRequestId) {
    try {
      const prResult = await query(
        'SELECT * FROM pull_requests WHERE id = $1',
        [pullRequestId]
      );
      
      if (prResult.rows.length === 0) {
        throw new Error('Pull request not found');
      }
      
      const pr = prResult.rows[0];
      
      if (!this.useMock) {
        try {
          return await this.callAIApi({
            type: 'code_review_summary',
            pullRequest: pr
          });
        } catch (aiError) {
          logger.warn('AI generation failed, using mock data', { error: aiError.message });
        }
      }
      
      return this.generateMockData('codeReviewSummary', pr);
      
    } catch (error) {
      logger.error('Code review summary generation failed', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Generate contributor insights using AI or fallback
   */
  async generateContributorInsights(contributorId) {
    try {
      const contributorResult = await query(
        'SELECT * FROM contributors WHERE id = $1',
        [contributorId]
      );
      
      if (contributorResult.rows.length === 0) {
        throw new Error('Contributor not found');
      }
      
      const contributor = contributorResult.rows[0];
      
      if (!this.useMock) {
        try {
          return await this.callAIApi({
            type: 'contributor_insights',
            contributor
          });
        } catch (aiError) {
          logger.warn('AI generation failed, using mock data', { error: aiError.message });
        }
      }
      
      return this.generateMockData('contributorInsights', contributor);
      
    } catch (error) {
      logger.error('Contributor insights generation failed', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Generic generation with AI fallback
   */
  async generate(prompt, options = {}) {
    const { type = 'custom', context = {} } = options;
    
    if (!this.useMock) {
      try {
        return await this.callAIApi({ type, prompt, context });
      } catch (aiError) {
        logger.warn('AI generation failed, using mock data', { error: aiError.message, type });
      }
    }
    
    return {
      content: `This is mock AI-generated content for: ${type}`,
      mock: true,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Call AI API (OpenAI or Anthropic)
   */
  async callAIApi(request) {
    const { type, prompt, context, repository, pullRequest, contributor } = request;
    
    const systemPrompt = this.getSystemPrompt(type);
    const userPrompt = this.getUserPrompt(type, { repository, pullRequest, contributor, prompt, context });
    
    if (process.env.OPENAI_API_KEY) {
      return await this.callOpenAI(systemPrompt, userPrompt);
    }
    
    if (process.env.ANTHROPIC_API_KEY) {
      return await this.callAnthropic(systemPrompt, userPrompt);
    }
    
    throw new Error('No AI API key configured');
  }
  
  async callOpenAI(systemPrompt, userPrompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API error');
    }
    
    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      model: 'openai',
      usage: data.usage
    };
  }
  
  async callAnthropic(systemPrompt, userPrompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.7,
        max_tokens: 2000
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Anthropic API error');
    }
    
    const data = await response.json();
    return {
      content: data.content[0].text,
      model: 'anthropic',
      usage: data.usage
    };
  }
  
  getSystemPrompt(type) {
    const prompts = {
      repository_summary: 'You are an expert software developer and technical writer. Analyze repositories and provide insightful summaries.',
      pr_description: 'You are an expert developer. Write clear, concise pull request descriptions.',
      code_review_summary: 'You are an expert code reviewer. Provide constructive feedback on code changes.',
      contributor_insights: 'You are an expert in developer productivity. Analyze contributor patterns and provide insights.',
      custom: 'You are a helpful AI assistant.'
    };
    return prompts[type] || prompts.custom;
  }
  
  getUserPrompt(type, data) {
    const { repository, pullRequest, contributor, prompt, context } = data;
    
    switch (type) {
      case 'repository_summary':
        return `Generate a summary for this repository:\nName: ${repository?.name}\nLanguage: ${repository?.language}\nStars: ${repository?.stars}\nDescription: ${repository?.description}`;
      
      case 'pr_description':
        return `Generate a pull request description for:\nTitle: ${pullRequest?.title}\nLines added: ${pullRequest?.lines_added}\nLines deleted: ${pullRequest?.lines_deleted}\nFiles changed: ${pullRequest?.files_changed}`;
      
      case 'code_review_summary':
        return `Provide a code review summary for:\nPR Title: ${pullRequest?.title}\nRisk Level: ${pullRequest?.risk_level}\nRisk Score: ${pullRequest?.risk_score}`;
      
      case 'contributor_insights':
        return `Generate insights for contributor:\nLogin: ${contributor?.login}\nTotal Contributions: ${contributor?.contributions}\nExperience Score: ${contributor?.experience_score}`;
      
      default:
        return prompt || 'Generate helpful content based on the context.';
    }
  }
  
  /**
   * Generate mock data based on type
   */
  generateMockData(type, ...args) {
    const generator = MOCK_DATA[type];
    if (!generator) {
      return {
        content: `Mock content for ${type}`,
        mock: true,
        timestamp: new Date().toISOString()
      };
    }
    
    const result = generator(...args);
    return {
      ...result,
      mock: true,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Check if AI is available
   */
  isAIAvailable() {
    return !this.useMock;
  }
}

module.exports = new AIGenerationService();
