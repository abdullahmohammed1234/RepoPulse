const { Octokit } = require('octokit');
const { query } = require('../config/db');

class GitHubService {
  constructor(token) {
    this.octokit = new Octokit({ auth: token });
    this.rateLimitDelay = 1000;
  }

  /**
   * Parse GitHub repository URL or full name
   */
  parseRepoUrl(repoUrlOrName) {
    // Remove trailing slashes and .git suffix
    const cleanInput = repoUrlOrName.replace(/\.git$/, '').replace(/\/$/, '');
    
    // Handle full URL
    const urlMatch = cleanInput.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (urlMatch) {
      return { owner: urlMatch[1], repo: urlMatch[2] };
    }
    
    // Handle owner/repo format
    const parts = cleanInput.split('/');
    if (parts.length === 2) {
      return { owner: parts[0], repo: parts[1] };
    }
    
    throw new Error('Invalid repository URL or name. Use format: owner/repo or https://github.com/owner/repo');
  }

  /**
   * Check and handle rate limiting
   */
  async checkRateLimit() {
    try {
      const { data } = await this.octokit.rest.rateLimit.get();
      const resetTime = new Date(data.resources.core.reset * 1000);
      const remaining = data.resources.core.remaining;
      
      if (remaining < 10) {
        console.log(`⚠️ Rate limit low (${remaining}). Waiting until ${resetTime.toISOString()}`);
        const waitTime = resetTime - new Date();
        if (waitTime > 0) {
          await this.sleep(waitTime);
        }
      }
    } catch (error) {
      console.error('Rate limit check failed:', error.message);
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch repository information
   */
  async fetchRepository(owner, repo) {
    await this.checkRateLimit();
    
    try {
      const { data } = await this.octokit.rest.repos.get({
        owner,
        repo,
      });
      
      return {
        github_id: data.id,
        name: data.name,
        full_name: data.full_name,
        owner: data.owner.login,
        description: data.description,
        url: data.html_url,
        default_branch: data.default_branch,
        language: data.language,
        stars: data.stargazers_count,
        forks: data.forks_count,
        open_issues: data.open_issues_count,
        watchers: data.subscribers_count,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    } catch (error) {
      if (error.status === 404) {
        throw new Error(`Repository not found: ${owner}/${repo}`);
      }
      if (error.status === 403) {
        throw new Error('Rate limit exceeded. Please wait or use a GitHub token.');
      }
      throw new Error(`Failed to fetch repository: ${error.message}`);
    }
  }

  /**
   * Fetch all contributors for a repository
   */
  async fetchContributors(owner, repo) {
    await this.checkRateLimit();
    
    const contributors = [];
    let page = 1;
    const perPage = 100;
    
    while (true) {
      try {
        const { data } = await this.octokit.rest.repos.listContributors({
          owner,
          repo,
          per_page: perPage,
          page,
        });
        
        if (data.length === 0) break;
        
        contributors.push(...data.map(c => ({
          github_id: c.id,
          login: c.login,
          avatar_url: c.avatar_url,
          html_url: c.html_url,
          contributions: c.contributions,
        })));
        
        if (data.length < perPage) break;
        page++;
        
        // Small delay to avoid rate limiting
        await this.sleep(100);
      } catch (error) {
        console.error(`Error fetching contributors page ${page}:`, error.message);
        break;
      }
    }
    
    return contributors;
  }

  /**
   * Fetch pull requests for a repository
   */
  async fetchPullRequests(owner, repo, state = 'all') {
    await this.checkRateLimit();
    
    const pullRequests = [];
    let page = 1;
    const perPage = 100;
    
    while (true) {
      try {
        const { data } = await this.octokit.rest.pulls.list({
          owner,
          repo,
          state,
          per_page: perPage,
          page,
          sort: 'created',
          direction: 'desc',
        });
        
        if (data.length === 0) break;
        
        for (const pr of data) {
          try {
            // Fetch additional PR details including files
            const [commits, reviews, files] = await Promise.all([
              this.fetchPRCommits(owner, repo, pr.number),
              this.fetchPRReviews(owner, repo, pr.number),
              this.fetchPRFiles(owner, repo, pr.number),
            ]);
            
            const totalAdditions = files.reduce((sum, f) => sum + (f.additions || 0), 0);
            const totalDeletions = files.reduce((sum, f) => sum + (f.deletions || 0), 0);
            
            let timeToMergeHours = null;
            if (pr.merged_at && pr.created_at) {
              const created = new Date(pr.created_at);
              const merged = new Date(pr.merged_at);
              const diff = (merged - created) / (1000 * 60 * 60);
              timeToMergeHours = isNaN(diff) ? null : diff;
            }
            
            pullRequests.push({
              github_id: pr.id,
              number: pr.number,
              title: pr.title,
              body: pr.body,
              state: pr.state,
              html_url: pr.html_url,
              diff_url: pr.diff_url,
              patch_url: pr.patch_url,
              lines_added: totalAdditions,
              lines_deleted: totalDeletions,
              files_changed: files.length,
              commits_count: commits.length,
              review_comments: pr.comments + pr.review_comments,
              created_at: pr.created_at,
              updated_at: pr.updated_at,
              merged_at: pr.merged_at,
              closed_at: pr.closed_at,
              time_to_merge_hours: timeToMergeHours,
              is_merged: pr.merged_at !== null,
            });
          } catch (prError) {
            console.error(`Error fetching PR #${pr.number}:`, prError.message);
          }
        }
        
        if (data.length < perPage) break;
        page++;
        
        await this.sleep(200);
      } catch (error) {
        console.error(`Error fetching PRs page ${page}:`, error.message);
        break;
      }
    }
    
    return pullRequests;
  }

  /**
   * Fetch commits for a specific PR
   */
  async fetchPRCommits(owner, repo, pullNumber) {
    await this.checkRateLimit();
    
    try {
      const { data } = await this.octokit.rest.pulls.listCommits({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });
      
      return data.map(c => ({
        sha: c.sha,
        message: c.commit.message,
        author_name: c.commit.author.name,
        author_email: c.commit.author.email,
        committed_at: c.commit.author.date,
      }));
    } catch (error) {
      console.error(`Error fetching commits for PR #${pullNumber}:`, error.message);
      return [];
    }
  }

  /**
   * Fetch reviews for a specific PR
   */
  async fetchPRReviews(owner, repo, pullNumber) {
    await this.checkRateLimit();
    
    try {
      const { data } = await this.octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });
      
      return data;
    } catch (error) {
      console.error(`Error fetching reviews for PR #${pullNumber}:`, error.message);
      return [];
    }
  }

  /**
   * Fetch files changed in a PR
   */
  async fetchPRFiles(owner, repo, pullNumber) {
    await this.checkRateLimit();
    
    try {
      const { data } = await this.octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });
      
      return data.map(f => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        raw_url: f.raw_url,
        contents_url: f.contents_url,
      }));
    } catch (error) {
      console.error(`Error fetching files for PR #${pullNumber}:`, error.message);
      return [];
    }
  }

  /**
   * Fetch contributor statistics including detailed commit info
   */
  async fetchContributorStats(owner, repo, contributorLogin) {
    await this.checkRateLimit();
    
    try {
      // Get contributor's commits
      const { data: commits } = await this.octokit.rest.repos.listCommits({
        owner,
        repo,
        author: contributorLogin,
        per_page: 100,
      });
      
      let totalAdditions = 0;
      let totalDeletions = 0;
      
      // Note: Commit stats require additional API calls, so we'll estimate
      // In production, you'd fetch each commit's detailed stats
      
      // Get first and last commit dates for months active
      let monthsActive = 1;
      if (commits.length > 0) {
        const firstCommit = new Date(commits[commits.length - 1].commit.author.date);
        const lastCommit = new Date(commits[0].commit.author.date);
        const diffMonths = (lastCommit - firstCommit) / (1000 * 60 * 60 * 24 * 30);
        monthsActive = Math.max(1, Math.ceil(diffMonths));
      }
      
      return {
        total_commits: commits.length,
        total_additions: totalAdditions,
        total_deletions: totalDeletions,
        months_active: monthsActive,
      };
    } catch (error) {
      console.error(`Error fetching stats for ${contributorLogin}:`, error.message);
      return {
        total_commits: 0,
        total_additions: 0,
        total_deletions: 0,
        months_active: 1,
      };
    }
  }

  /**
   * Main method to analyze a repository
   */
  async analyzeRepository(repoUrlOrName) {
    console.log(`🔍 Starting analysis for: ${repoUrlOrName}`);
    
    const { owner, repo } = this.parseRepoUrl(repoUrlOrName);
    
    // Fetch repository data
    console.log('📥 Fetching repository info...');
    const repoData = await this.fetchRepository(owner, repo);
    
    // Insert repository into database
    const repoResult = await query(
      `INSERT INTO repositories (github_id, name, full_name, owner, description, url, default_branch, language, stars, forks, open_issues, watchers, last_analyzed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       ON CONFLICT (github_id) DO UPDATE SET 
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         stars = EXCLUDED.stars,
         forks = EXCLUDED.forks,
         last_analyzed_at = NOW()
       RETURNING id`,
      [
        repoData.github_id,
        repoData.name,
        repoData.full_name,
        repoData.owner,
        repoData.description,
        repoData.url,
        repoData.default_branch,
        repoData.language,
        repoData.stars,
        repoData.forks,
        repoData.open_issues,
        repoData.watchers,
      ]
    );
    
    const repositoryId = repoResult.rows[0].id;
    console.log(`✅ Repository saved with ID: ${repositoryId}`);
    
    // Fetch and insert contributors
    console.log('👥 Fetching contributors...');
    const contributors = await this.fetchContributors(owner, repo);
    
    for (const contributor of contributors) {
      const stats = await this.fetchContributorStats(owner, repo, contributor.login);
      
      const experienceScore = stats.total_commits / (1 + stats.months_active);
      
      await query(
        `INSERT INTO contributors (repository_id, github_id, login, avatar_url, html_url, contributions, total_commits, total_additions, total_deletions, months_active, experience_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (repository_id, github_id) DO UPDATE SET
           contributions = EXCLUDED.contributions,
           total_commits = EXCLUDED.total_commits,
           experience_score = EXCLUDED.experience_score`,
        [
          repositoryId,
          contributor.github_id,
          contributor.login,
          contributor.avatar_url,
          contributor.html_url,
          contributor.contributions,
          stats.total_commits,
          stats.total_additions,
          stats.total_deletions,
          stats.months_active,
          experienceScore,
        ]
      );
    }
    console.log(`✅ Saved ${contributors.length} contributors`);
    
    // Fetch and insert pull requests
    console.log('🔀 Fetching pull requests...');
    const pullRequests = await this.fetchPullRequests(owner, repo);
    
    // Get contributor ID mapping
    const contributorMap = new Map();
    const contribResult = await query('SELECT id, login FROM contributors WHERE repository_id = $1', [repositoryId]);
    contribResult.rows.forEach(c => contributorMap.set(c.login, c.id));
    
    for (const pr of pullRequests) {
      // Find contributor (we'll use the first author from commits if available)
      let contributorId = null;
      
      // Validate and sanitize numeric values to prevent NaN
      const linesAdded = Number.isNaN(pr.lines_added) ? 0 : pr.lines_added;
      const linesDeleted = Number.isNaN(pr.lines_deleted) ? 0 : pr.lines_deleted;
      const filesChanged = Number.isNaN(pr.files_changed) ? 0 : pr.files_changed;
      const commitsCount = Number.isNaN(pr.commits_count) ? 0 : pr.commits_count;
      const reviewComments = Number.isNaN(pr.review_comments) ? 0 : pr.review_comments;
      const timeToMergeHours = Number.isNaN(pr.time_to_merge_hours) ? null : pr.time_to_merge_hours;
      
      await query(
        `INSERT INTO pull_requests (
          repository_id, contributor_id, github_id, number, title, body, state,
          html_url, diff_url, patch_url, lines_added, lines_deleted, files_changed,
          commits_count, review_comments, created_at, updated_at, merged_at, closed_at,
          time_to_merge_hours, is_merged
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        ON CONFLICT (repository_id, github_id) DO UPDATE SET
          title = EXCLUDED.title,
          state = EXCLUDED.state,
          lines_added = EXCLUDED.lines_added,
          lines_deleted = EXCLUDED.lines_deleted,
          files_changed = EXCLUDED.files_changed,
          is_merged = EXCLUDED.is_merged`,
        [
          repositoryId,
          contributorId,
          pr.github_id,
          pr.number,
          pr.title,
          pr.body,
          pr.state,
          pr.html_url,
          pr.diff_url,
          pr.patch_url,
          linesAdded,
          linesDeleted,
          filesChanged,
          commitsCount,
          reviewComments,
          pr.created_at,
          pr.updated_at,
          pr.merged_at,
          pr.closed_at,
          timeToMergeHours,
          pr.is_merged,
        ]
      );
    }
    console.log(`✅ Saved ${pullRequests.length} pull requests`);
    
    // Fetch and insert PR files (sample for hotspots)
    console.log('📁 Fetching PR files...');
    const recentPRs = pullRequests.slice(0, 50); // Limit to recent 50 for performance
    
    for (const pr of recentPRs) {
      const files = await this.fetchPRFiles(owner, repo, pr.number);
      
      const prResult = await query(
        'SELECT id FROM pull_requests WHERE repository_id = $1 AND github_id = $2',
        [repositoryId, pr.github_id]
      );
      
      if (prResult.rows.length > 0) {
        const prId = prResult.rows[0].id;
        
        for (const file of files) {
          await query(
            `INSERT INTO files (repository_id, pull_request_id, filename, status, additions, deletions, changes, raw_url, contents_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (repository_id, pull_request_id, filename) DO NOTHING`,
            [repositoryId, prId, file.filename, file.status, file.additions, file.deletions, file.changes, file.raw_url, file.contents_url]
          );
        }
      }
    }
    console.log('✅ Files saved');
    
    return {
      repositoryId,
      repository: repoData,
      contributorsCount: contributors.length,
      pullRequestsCount: pullRequests.length,
    };
  }
}

module.exports = GitHubService;
