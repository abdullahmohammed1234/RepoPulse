/**
 * Code Quality Metrics Service
 * Provides cyclomatic complexity analysis, technical debt estimation,
 * code coverage insights, and integration with ESLint/SonarQube
 */

const axios = require('axios');
const logger = require('./logger');

class CodeQualityService {
  constructor() {
    this.sonarQubeUrl = process.env.SONARQUBE_URL || null;
    this.sonarQubeToken = process.env.SONARQUBE_TOKEN || null;
    
    // Complexity thresholds
    this.complexityThresholds = {
      low: 10,
      medium: 20,
      high: 30,
      critical: 50
    };
    
    // Technical debt estimation rates (minutes per complexity point)
    this.debtRates = {
      perComplexityPoint: 15, // minutes to fix per complexity point above threshold
      perCodeSmell: 30,       // minutes per code smell
      perBug: 240,            // minutes per bug (4 hours)
      perVulnerability: 480    // minutes per vulnerability (8 hours)
    };
  }

  /**
   * Analyze cyclomatic complexity of JavaScript/TypeScript code
   * @param {string} code - Source code to analyze
   * @returns {Object} Complexity metrics
   */
  analyzeCyclomaticComplexity(code) {
    const lines = code.split('\n');
    let complexity = 1;
    let functions = [];
    let currentFunction = null;
    
    // Keywords that increase complexity
    const controlStructures = /\b(if|else|elif|else if|for|while|do|case|catch|&&|\|\||\?)\b/g;
    
    // Function detection patterns
    const functionPatterns = [
      /function\s+(\w+)/g,
      /(\w+)\s*\([^)]*\)\s*{/g,
      /const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
      /(\w+):\s*(?:async\s*)?\([^)]*\)\s*=>/g,
      /class\s+(\w+)/g
    ];
    
    // Find all functions and their complexity
    let lineNumber = 0;
    let functionStack = [];
    let inFunction = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      lineNumber = i + 1;
      
      // Check for function declarations
      const functionMatch = line.match(/function\s+(\w+)/);
      if (functionMatch) {
        inFunction = true;
        functionStack.push({ name: functionMatch[1], complexity: 1, startLine: lineNumber });
      }
      
      // Check for arrow functions and method definitions
      const arrowMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=/);
      if (arrowMatch && line.includes('=>')) {
        inFunction = true;
        functionStack.push({ name: arrowMatch[1], complexity: 1, startLine: lineNumber });
      }
      
      // Count control structures
      const matches = line.match(controlStructures);
      if (matches) {
        if (inFunction && functionStack.length > 0) {
          functionStack[functionStack.length - 1].complexity += matches.length;
        } else {
          complexity += matches.length;
        }
      }
      
      // Check for function end
      if (line.includes('}') && functionStack.length > 0) {
        const closed = (line.match(/}/g) || []).length;
        const opened = (line.match(/{/g) || []).length;
        
        if (closed >= opened) {
          const fn = functionStack.pop();
          functions.push({
            name: fn.name || `anonymous_${fn.startLine}`,
            complexity: fn.complexity,
            startLine: fn.startLine,
            endLine: lineNumber,
            rating: this.getComplexityRating(fn.complexity)
          });
          
          if (functionStack.length === 0) {
            inFunction = false;
          }
        }
      }
    }
    
    return {
      overallComplexity: complexity,
      averageComplexity: functions.length > 0 
        ? Math.round(functions.reduce((sum, f) => sum + f.complexity, 0) / functions.length)
        : complexity,
      functions: functions,
      rating: this.getComplexityRating(complexity),
      thresholds: this.complexityThresholds,
      lineCount: lines.length,
      linesPerComplexity: lines.length / Math.max(complexity, 1)
    };
  }

  /**
   * Get complexity rating based on thresholds
   * @param {number} complexity - Cyclomatic complexity value
   * @returns {string} Rating (low, medium, high, critical)
   */
  getComplexityRating(complexity) {
    if (complexity <= this.complexityThresholds.low) return 'low';
    if (complexity <= this.complexityThresholds.medium) return 'medium';
    if (complexity <= this.complexityThresholds.high) return 'high';
    return 'critical';
  }

  /**
   * Estimate technical debt based on code analysis
   * @param {Object} complexityMetrics - Results from complexity analysis
   * @param {Object} eslintResults - ESLint analysis results (optional)
   * @param {Object} sonarResults - SonarQube analysis results (optional)
   * @returns {Object} Technical debt estimation
   */
  estimateTechnicalDebt(complexityMetrics, eslintResults = null, sonarResults = null) {
    let debtMinutes = 0;
    let debtBreakdown = [];
    
    // Debt from complexity
    const highComplexityFunctions = complexityMetrics.functions.filter(
      f => f.complexity > this.complexityThresholds.medium
    );
    
    const complexityDebt = highComplexityFunctions.reduce((total, fn) => {
      const excessComplexity = fn.complexity - this.complexityThresholds.low;
      return total + (excessComplexity * this.debtRates.perComplexityPoint);
    }, 0);
    
    if (complexityDebt > 0) {
      debtMinutes += complexityDebt;
      debtBreakdown.push({
        category: 'Complexity',
        items: highComplexityFunctions.length,
        minutes: Math.round(complexityDebt),
        description: 'Functions exceeding complexity thresholds'
      });
    }
    
    // Debt from ESLint issues
    if (eslintResults && eslintResults.results) {
      const errorCount = eslintResults.errorCount || 0;
      const warningCount = eslintResults.warningCount || 0;
      
      const eslintDebt = (errorCount * this.debtRates.perCodeSmell * 2) + 
                         (warningCount * this.debtRates.perCodeSmell);
      
      if (eslintDebt > 0) {
        debtMinutes += eslintDebt;
        debtBreakdown.push({
          category: 'ESLint Issues',
          errors: errorCount,
          warnings: warningCount,
          minutes: Math.round(eslintDebt),
          description: 'ESLint errors and warnings requiring resolution'
        });
      }
    }
    
    // Debt from SonarQube issues
    if (sonarResults && sonarResults.issues) {
      const bugs = sonarResults.issues.filter(i => i.severity === 'BLOCKER' || i.severity === 'CRITICAL').length;
      const codeSmells = sonarResults.issues.filter(i => i.severity === 'MAJOR' || i.severity === 'MINOR').length;
      const vulnerabilities = sonarResults.issues.filter(i => i.type === 'VULNERABILITY').length;
      
      const sonarDebt = (bugs * this.debtRates.perBug) +
                        (codeSmells * this.debtRates.perCodeSmell) +
                        (vulnerabilities * this.debtRates.perVulnerability);
      
      if (sonarDebt > 0) {
        debtMinutes += sonarDebt;
        debtBreakdown.push({
          category: 'SonarQube Issues',
          bugs: bugs,
          codeSmells: codeSmells,
          vulnerabilities: vulnerabilities,
          minutes: Math.round(sonarDebt),
          description: 'Bugs, code smells, and vulnerabilities from SonarQube'
        });
      }
    }
    
    // Convert to human-readable format
    const debtDays = Math.round(debtMinutes / 480 * 10) / 10; // 8 hours = 1 day
    const debtHours = Math.round(debtMinutes / 60 * 10) / 10;
    
    return {
      totalMinutes: Math.round(debtMinutes),
      totalHours: debtHours,
      totalDays: debtDays,
      breakdown: debtBreakdown,
      priority: this.getDebtPriority(debtDays),
      recommendation: this.getDebtRecommendation(debtDays)
    };
  }

  /**
   * Get debt priority based on days
   * @param {number} days - Estimated debt in days
   * @returns {string} Priority level
   */
  getDebtPriority(days) {
    if (days <= 1) return 'low';
    if (days <= 5) return 'medium';
    if (days <= 20) return 'high';
    return 'critical';
  }

  /**
   * Get recommendation based on debt
   * @param {number} days - Estimated debt in days
   * @returns {string} Recommendation
   */
  getDebtRecommendation(days) {
    if (days <= 1) return 'Technical debt is minimal. Continue regular maintenance.';
    if (days <= 5) return 'Technical debt is manageable. Schedule refactoring in next sprint.';
    if (days <= 20) return 'Technical debt is significant. Consider dedicated refactoring sprint.';
    return 'Critical technical debt. Immediate action required to prevent further accumulation.';
  }

  /**
   * Analyze code coverage from coverage reports
   * @param {Object} coverageData - Coverage report data (LCOV, JSON, or similar)
   * @returns {Object} Code coverage insights
   */
  analyzeCodeCoverage(coverageData) {
    const coverage = {
      line: coverageData.line || 0,
      statement: coverageData.statement || 0,
      function: coverageData.function || 0,
      branch: coverageData.branch || 0
    };
    
    // Calculate coverage scores
    const scores = {
      line: this.calculateCoverageScore(coverage.line),
      statement: this.calculateCoverageScore(coverage.statement),
      function: this.calculateCoverageScore(coverage.function),
      branch: this.calculateCoverageScore(coverage.branch)
    };
    
    // Overall coverage (weighted average)
    const overall = Math.round(
      (coverage.line * 0.35) +
      (coverage.statement * 0.25) +
      (coverage.function * 0.25) +
      (coverage.branch * 0.15)
    );
    
    return {
      coverage: coverage,
      scores: scores,
      overall: overall,
      rating: this.getCoverageRating(overall),
      recommendation: this.getCoverageRecommendation(overall)
    };
  }

  /**
   * Calculate coverage score (0-100)
   * @param {number} value - Coverage percentage
   * @returns {number} Score
   */
  calculateCoverageScore(value) {
    return Math.min(100, Math.max(0, Math.round(value || 0)));
  }

  /**
   * Get coverage rating
   * @param {number} percentage - Coverage percentage
   * @returns {string} Rating
   */
  getCoverageRating(percentage) {
    if (percentage >= 80) return 'excellent';
    if (percentage >= 70) return 'good';
    if (percentage >= 50) return 'fair';
    return 'poor';
  }

  /**
   * Get coverage recommendation
   * @param {number} percentage - Coverage percentage
   * @returns {string} Recommendation
   */
  getCoverageRecommendation(percentage) {
    if (percentage >= 80) return 'Excellent code coverage. Maintain current practices.';
    if (percentage >= 70) return 'Good coverage. Consider adding tests for uncovered areas.';
    if (percentage >= 50) return 'Fair coverage. Prioritize adding tests for critical functionality.';
    return 'Poor coverage. Immediate action needed to increase test coverage.';
  }

  /**
   * Run ESLint analysis on code
   * @param {string} code - Source code to analyze
   * @param {Object} options - ESLint options
   * @returns {Object} ESLint results
   */
  async runESLintAnalysis(code, options = {}) {
    // Simulated ESLint analysis (in production, use actual ESLint)
    const issues = [];
    const lines = code.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      
      // Check for common issues (simulated rules)
      
      // Console.log detection
      if (line.includes('console.log') && !options.allowConsole) {
        issues.push({
          line: lineNumber,
          column: line.indexOf('console.log') + 1,
          severity: 'warning',
          rule: 'no-console',
          message: 'Unexpected console statement.'
        });
      }
      
      // TODO comments
      const todoMatch = line.match(/\/\/\s*TODO/);
      if (todoMatch) {
        issues.push({
          line: lineNumber,
          column: line.indexOf('TODO') + 1,
          severity: 'info',
          rule: 'no-todo',
          message: 'TODO comment found.'
        });
      }
      
      // Long lines
      if (line.length > 120) {
        issues.push({
          line: lineNumber,
          column: 121,
          severity: 'warning',
          rule: 'max-len',
          message: `Line exceeds ${options.maxLineLength || 120} characters.`
        });
      }
      
      // Magic numbers
      const magicNumberMatch = line.match(/(?<![.\w])(?:\d{3,})(?![.\d])/);
      if (magicNumberMatch && !line.includes('version') && !line.includes('PORT')) {
        issues.push({
          line: lineNumber,
          column: line.indexOf(magicNumberMatch[0]) + 1,
          severity: 'warning',
          rule: 'no-magic-numbers',
          message: 'Magic number detected. Consider extracting to a named constant.'
        });
      }
      
      // Unused variables (simple detection)
      const unusedMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*[^;]+;\s*(?:\/\/.*)?$/);
      if (unusedMatch && !line.includes('//') && i < lines.length - 5) {
        // Check if variable is used in next few lines
        const nextLines = lines.slice(i + 1, i + 5).join(' ');
        if (!nextLines.includes(unusedMatch[1])) {
          issues.push({
            line: lineNumber,
            column: line.indexOf(unusedMatch[1]) + 1,
            severity: 'warning',
            rule: 'no-unused-vars',
            message: `'${unusedMatch[1]}' is assigned a value but never used.`
          });
        }
      }
    }
    
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const infoCount = issues.filter(i => i.severity === 'info').length;
    
    return {
      results: [{
        filePath: options.filePath || 'code.js',
        messages: issues,
        errorCount: errorCount,
        warningCount: warningCount,
        fixableErrorCount: 0,
        fixableWarningCount: 0
      }],
      errorCount: errorCount,
      warningCount: warningCount,
      infoCount: infoCount,
      totalIssues: issues.length,
      summary: this.getESLintSummary(errorCount, warningCount, infoCount)
    };
  }

  /**
   * Get ESLint summary
   * @param {number} errors - Error count
   * @param {number} warnings - Warning count
   * @param {number} info - Info count
   * @returns {string} Summary
   */
  getESLintSummary(errors, warnings, info) {
    if (errors > 0) return 'Critical issues found. Fix errors immediately.';
    if (warnings > 10) return 'Multiple warnings detected. Review and address.';
    if (warnings > 0) return 'Minor warnings present. Consider addressing.';
    if (info > 0) return 'Code is clean with some informational notes.';
    return 'Excellent! No issues detected.';
  }

  /**
   * Fetch SonarQube metrics for a project
   * @param {string} projectKey - SonarQube project key
   * @returns {Object} SonarQube metrics
   */
  async getSonarQubeMetrics(projectKey) {
    if (!this.sonarQubeUrl || !this.sonarQubeToken) {
      logger.warn('SonarQube not configured. Set SONARQUBE_URL and SONARQUBE_TOKEN environment variables.');
      return null;
    }
    
    try {
      const response = await axios.get(
        `${this.sonarQubeUrl}/api/measures/component`,
        {
          params: {
            component: projectKey,
            metricKeys: 'complexity,coverage,duplicated_lines_density,ncloc,code_smells,bugs,vulnerabilities,sqale_debt_ratio'
          },
          headers: {
            'Authorization': `Bearer ${this.sonarQubeToken}`
          }
        }
      );
      
      return this.parseSonarQubeMetrics(response.data);
    } catch (error) {
      logger.error('Failed to fetch SonarQube metrics:', error.message);
      return null;
    }
  }

  /**
   * Parse SonarQube response into structured metrics
   * @param {Object} response - SonarQube API response
   * @returns {Object} Parsed metrics
   */
  parseSonarQubeMetrics(response) {
    const metrics = {};
    
    if (response.component && response.component.measures) {
      for (const measure of response.component.measures) {
        metrics[measure.metric] = parseFloat(measure.value);
      }
    }
    
    return {
      project: response.component?.key || 'unknown',
      metrics: metrics,
      complexity: metrics.complexity || 0,
      coverage: metrics.coverage || 0,
      duplicatedLines: metrics.duplicated_lines_density || 0,
      linesOfCode: metrics.ncloc || 0,
      codeSmells: metrics.code_smells || 0,
      bugs: metrics.bugs || 0,
      vulnerabilities: metrics.vulnerabilities || 0,
      debtRatio: metrics.sqale_debt_ratio || 0,
      rating: this.getSonarQubeRating(metrics)
    };
  }

  /**
   * Get overall SonarQube rating
   * @param {Object} metrics - SonarQube metrics
   * @returns {string} Rating
   */
  getSonarQubeRating(metrics) {
    if (metrics.bugs > 0 || metrics.vulnerabilities > 0) return 'D';
    if (metrics.code_smells > 20 || metrics.duplicated_lines_density > 10) return 'C';
    if (metrics.code_smells > 10 || metrics.duplicated_lines_density > 5) return 'B';
    return 'A';
  }

  /**
   * Get all issues from SonarQube
   * @param {string} projectKey - SonarQube project key
   * @returns {Array} List of issues
   */
  async getSonarQubeIssues(projectKey) {
    if (!this.sonarQubeUrl || !this.sonarQubeToken) {
      return [];
    }
    
    try {
      const response = await axios.get(
        `${this.sonarQubeUrl}/api/issues/search`,
        {
          params: {
            componentKeys: projectKey,
            statuses: 'OPEN,CONFIRMED,REOPENED'
          },
          headers: {
            'Authorization': `Bearer ${this.sonarQubeToken}`
          }
        }
      );
      
      return response.data.issues || [];
    } catch (error) {
      logger.error('Failed to fetch SonarQube issues:', error.message);
      return [];
    }
  }

  /**
   * Generate comprehensive code quality report
   * @param {string} code - Source code to analyze
   * @param {Object} options - Analysis options
   * @returns {Object} Comprehensive report
   */
  async generateQualityReport(code, options = {}) {
    const report = {
      timestamp: new Date().toISOString(),
      analysisOptions: options
    };
    
    // Cyclomatic complexity analysis
    report.complexity = this.analyzeCyclomaticComplexity(code);
    
    // ESLint analysis
    if (options.runESLint !== false) {
      try {
        report.eslint = await this.runESLintAnalysis(code, options.eslintOptions || {});
      } catch (error) {
        logger.error('ESLint analysis failed:', error.message);
        report.eslint = { error: error.message };
      }
    }
    
    // Technical debt estimation
    report.technicalDebt = this.estimateTechnicalDebt(
      report.complexity,
      report.eslint,
      options.sonarResults || null
    );
    
    // Code coverage (if provided)
    if (options.coverageData) {
      report.coverage = this.analyzeCodeCoverage(options.coverageData);
    }
    
    // SonarQube integration (if configured and project key provided)
    if (options.sonarProjectKey) {
      try {
        const sonarMetrics = await this.getSonarQubeMetrics(options.sonarProjectKey);
        const sonarIssues = await this.getSonarQubeIssues(options.sonarProjectKey);
        
        report.sonarQube = {
          metrics: sonarMetrics,
          issues: sonarIssues,
          issueCount: sonarIssues.length
        };
        
        // Update technical debt with SonarQube data
        if (sonarMetrics) {
          report.technicalDebt = this.estimateTechnicalDebt(
            report.complexity,
            report.eslint,
            { issues: sonarIssues }
          );
        }
      } catch (error) {
        logger.error('SonarQube analysis failed:', error.message);
        report.sonarQube = { error: error.message };
      }
    }
    
    // Overall quality score
    report.overallScore = this.calculateOverallScore(report);
    
    return report;
  }

  /**
   * Calculate overall quality score
   * @param {Object} report - Quality report
   * @returns {Object} Overall score and grade
   */
  calculateOverallScore(report) {
    let score = 100;
    const factors = [];
    
    // Complexity factor
    if (report.complexity) {
      const complexityPenalty = Math.max(0, (report.complexity.overallComplexity - 10) * 2);
      score -= complexityPenalty;
      factors.push({
        factor: 'Complexity',
        impact: -complexityPenalty,
        description: 'Cyclomatic complexity score'
      });
    }
    
    // ESLint factor
    if (report.eslint && !report.eslint.error) {
      const eslintPenalty = (report.eslint.errorCount * 5) + (report.eslint.warningCount * 1);
      score -= eslintPenalty;
      factors.push({
        factor: 'Code Style',
        impact: -eslintPenalty,
        description: 'ESLint errors and warnings'
      });
    }
    
    // Coverage factor
    if (report.coverage) {
      const coverageGap = Math.max(0, 80 - report.coverage.overall);
      const coveragePenalty = coverageGap * 0.3;
      score -= coveragePenalty;
      factors.push({
        factor: 'Test Coverage',
        impact: -coveragePenalty,
        description: 'Code coverage percentage'
      });
    }
    
    // SonarQube factor
    if (report.sonarQube && report.sonarQube.metrics) {
      const sonarPenalty = (report.sonarQube.metrics.bugs * 10) + 
                          (report.sonarQube.metrics.vulnerabilities * 15) +
                          (report.sonarQube.metrics.codeSmells * 0.5);
      score -= sonarPenalty;
      factors.push({
        factor: 'Code Health',
        impact: -sonarPenalty,
        description: 'SonarQube bugs and vulnerabilities'
      });
    }
    
    score = Math.max(0, Math.min(100, Math.round(score)));
    
    let grade;
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';
    else grade = 'F';
    
    return {
      score: score,
      grade: grade,
      factors: factors,
      rating: score >= 80 ? 'Good' : score >= 60 ? 'Needs Improvement' : 'Poor'
    };
  }
}

module.exports = new CodeQualityService();
