'use client';

import { useState } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Code, 
  GitBranch,
  Shield,
  Zap,
  Clock,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { analyzeCodeQuality, type QualityReport } from '@/lib/api';

const COLORS = {
  primary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#06b6d4',
  purple: '#8b5cf6'
};

interface CodeQualityMetricsProps {
  code?: string;
  initialReport?: QualityReport;
  sonarProjectKey?: string;
  coverageData?: Record<string, number>;
}

export default function CodeQualityMetrics({ 
  code: initialCode = '', 
  initialReport,
  sonarProjectKey: initialSonarKey,
  coverageData 
}: CodeQualityMetricsProps) {
  const [code, setCode] = useState(initialCode);
  const [sonarProjectKey, setSonarProjectKey] = useState(initialSonarKey || '');
  const [report, setReport] = useState<QualityReport | null>(initialReport || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'complexity' | 'debt' | 'coverage' | 'eslint'>('overview');

  const handleAnalyze = async () => {
    if (!code.trim()) {
      setError('Please provide code to analyze');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await analyzeCodeQuality(code, {
        runESLint: true,
        sonarProjectKey: sonarProjectKey || undefined,
        coverageData: coverageData || undefined
      });
      setReport(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return COLORS.success;
    if (score >= 60) return COLORS.warning;
    return COLORS.danger;
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return COLORS.success;
      case 'B': return COLORS.primary;
      case 'C': return COLORS.warning;
      case 'D': return COLORS.danger;
      default: return COLORS.danger;
    }
  };

  const getComplexityColor = (rating: string) => {
    switch (rating) {
      case 'low': return COLORS.success;
      case 'medium': return COLORS.warning;
      case 'high': return COLORS.danger;
      default: return '#dc2626';
    }
  };

  const complexityChartData = report?.complexity?.functions?.slice(0, 10).map(fn => ({
    name: fn.name.length > 15 ? fn.name.substring(0, 15) + '...' : fn.name,
    complexity: fn.complexity,
    rating: fn.rating
  })) || [];

  const coverageChartData = report?.coverage ? [
    { name: 'Lines', value: report.coverage.coverage.line, fill: COLORS.primary },
    { name: 'Statements', value: report.coverage.coverage.statement, fill: COLORS.success },
    { name: 'Functions', value: report.coverage.coverage.function, fill: COLORS.warning },
    { name: 'Branches', value: report.coverage.coverage.branch, fill: COLORS.purple }
  ] : [];

  const debtChartData = report?.technicalDebt?.breakdown?.map(item => ({
    name: item.category,
    value: item.minutes,
    description: item.description
  })) || [];

  const scoreHistoryData = [
    { date: 'Week 1', score: 72 },
    { date: 'Week 2', score: 75 },
    { date: 'Week 3', score: 78 },
    { date: 'Week 4', score: report?.overallScore?.score || 0 }
  ];

  return (
    <div className="w-full max-w-6xl mx-auto p-6 bg-card border border-border rounded-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Activity className="w-6 h-6" />
          Code Quality Metrics
        </h2>
        <p className="text-muted-foreground mt-1">
          Analyze cyclomatic complexity, technical debt, code coverage, and integrate with ESLint/SonarQube
        </p>
      </div>

      {/* Analysis Input */}
      <div className="mb-6 p-4 bg-card border border-border rounded-lg">
        <div className="flex gap-4">
          <textarea
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setReport(null);
            }}
            placeholder="Paste your JavaScript/TypeScript code here for analysis..."
            className="flex-1 p-3 border border-border bg-background text-foreground rounded-md font-mono text-sm min-h-[120px] resize-y"
          />
          <div className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="SonarQube Project Key (optional)"
              value={sonarProjectKey}
              onChange={(e) => setSonarProjectKey(e.target.value)}
              className="p-2 border border-border bg-background text-foreground rounded-md text-sm"
            />
            <button
              onClick={handleAnalyze}
              disabled={loading || !code.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-muted disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Analyze Code
                </>
              )}
            </button>
          </div>
        </div>
        {error && (
          <p className="mt-2 text-destructive flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            {error}
          </p>
        )}
      </div>

      {report && (
        <>
          {/* Overall Score Card */}
          <div className="mb-6 p-6 bg-blue-900/20 rounded-lg border border-blue-800">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Overall Quality Score</h3>
                <p className="text-muted-foreground text-sm mt-1">{report.overallScore.rating}</p>
              </div>
              <div className="flex items-center gap-4">
                <div 
                  className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold"
                  style={{ 
                    backgroundColor: `${getScoreColor(report.overallScore.score)}20`,
                    color: getScoreColor(report.overallScore.score)
                  }}
                >
                  {report.overallScore.score}
                </div>
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
                  style={{ 
                    backgroundColor: `${getGradeColor(report.overallScore.grade)}20`,
                    color: getGradeColor(report.overallScore.grade)
                  }}
                >
                  {report.overallScore.grade}
                </div>
              </div>
            </div>
            
            <div className="mt-4 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scoreHistoryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                  <Line 
                    type="monotone" 
                    dataKey="score" 
                    stroke={COLORS.primary} 
                    strokeWidth={2}
                    dot={{ fill: COLORS.primary }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-6 border-b border-border">
            <nav className="flex gap-4">
              {[
                { id: 'overview', label: 'Overview', icon: Activity },
                { id: 'complexity', label: 'Complexity', icon: GitBranch },
                { id: 'debt', label: 'Technical Debt', icon: Clock },
                { id: 'coverage', label: 'Coverage', icon: CheckCircle },
                { id: 'eslint', label: 'ESLint', icon: Code }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-400'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="min-h-[400px]">
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border border-border bg-card rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <GitBranch className="w-5 h-5" style={{ color: getComplexityColor(report.complexity.rating) }} />
                    <h4 className="font-semibold text-foreground">Complexity</h4>
                  </div>
                  <p className="text-3xl font-bold" style={{ color: getComplexityColor(report.complexity.rating) }}>
                    {report.complexity.overallComplexity}
                  </p>
                  <p className="text-sm text-muted-foreground">Cyclomatic Complexity</p>
                  <div className="mt-2 flex items-center gap-1 text-sm">
                    <span className={`px-2 py-0.5 rounded ${
                      report.complexity.rating === 'low' ? 'bg-green-900/30 text-green-400' :
                      report.complexity.rating === 'medium' ? 'bg-yellow-900/30 text-yellow-400' :
                      'bg-red-900/30 text-red-400'
                    }`}>
                      {report.complexity.rating}
                    </span>
                  </div>
                </div>

                <div className="p-4 border border-border bg-card rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-5 h-5" style={{ color: report.technicalDebt.priority === 'critical' ? COLORS.danger : COLORS.warning }} />
                    <h4 className="font-semibold text-foreground">Technical Debt</h4>
                  </div>
                  <p className="text-3xl font-bold" style={{ color: COLORS.warning }}>
                    {report.technicalDebt.totalDays}d
                  </p>
                  <p className="text-sm text-muted-foreground">Estimated {report.technicalDebt.totalHours}h to fix</p>
                  <div className="mt-2 flex items-center gap-1 text-sm">
                    <span className={`px-2 py-0.5 rounded ${
                      report.technicalDebt.priority === 'low' ? 'bg-green-900/30 text-green-400' :
                      report.technicalDebt.priority === 'medium' ? 'bg-yellow-900/30 text-yellow-400' :
                      report.technicalDebt.priority === 'high' ? 'bg-orange-900/30 text-orange-400' :
                      'bg-red-900/30 text-red-400'
                    }`}>
                      {report.technicalDebt.priority} priority
                    </span>
                  </div>
                </div>

                {report.coverage && (
                  <div className="p-4 border border-border bg-card rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-5 h-5" style={{ color: report.coverage.rating === 'excellent' ? COLORS.success : COLORS.warning }} />
                      <h4 className="font-semibold text-foreground">Coverage</h4>
                    </div>
                    <p className="text-3xl font-bold" style={{ color: COLORS.success }}>
                      {report.coverage.overall}%
                    </p>
                    <p className="text-sm text-muted-foreground">Code Coverage</p>
                    <div className="mt-2 flex items-center gap-1 text-sm">
                      <span className={`px-2 py-0.5 rounded ${
                        report.coverage.rating === 'excellent' ? 'bg-green-900/30 text-green-400' :
                        report.coverage.rating === 'good' ? 'bg-blue-900/30 text-blue-400' :
                        report.coverage.rating === 'fair' ? 'bg-yellow-900/30 text-yellow-400' :
                        'bg-red-900/30 text-red-400'
                      }`}>
                        {report.coverage.rating}
                      </span>
                    </div>
                  </div>
                )}

                {report.eslint && (
                  <div className="p-4 border border-border bg-card rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <Code className="w-5 h-5" style={{ color: report.eslint.errorCount > 0 ? COLORS.danger : COLORS.success }} />
                      <h4 className="font-semibold text-foreground">ESLint</h4>
                    </div>
                    <div className="flex gap-4">
                      <div>
                        <p className="text-2xl font-bold text-red-400">{report.eslint.errorCount}</p>
                        <p className="text-sm text-muted-foreground">Errors</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-yellow-400">{report.eslint.warningCount}</p>
                        <p className="text-sm text-muted-foreground">Warnings</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-blue-400">{report.eslint.infoCount}</p>
                        <p className="text-sm text-muted-foreground">Info</p>
                      </div>
                    </div>
                  </div>
                )}

                {report.sonarQube && (
                  <div className="p-4 border border-border bg-card rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="w-5 h-5" style={{ color: getGradeColor(report.sonarQube.metrics.rating) }} />
                      <h4 className="font-semibold text-foreground">SonarQube</h4>
                    </div>
                    <div className="flex gap-4">
                      <div>
                        <p className="text-2xl font-bold text-red-400">{report.sonarQube.metrics.bugs}</p>
                        <p className="text-sm text-muted-foreground">Bugs</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-orange-400">{report.sonarQube.metrics.vulnerabilities}</p>
                        <p className="text-sm text-muted-foreground">Vulnerabilities</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-yellow-400">{report.sonarQube.metrics.codeSmells}</p>
                        <p className="text-sm text-muted-foreground">Code Smells</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-4 border border-border bg-card rounded-lg md:col-span-3 bg-blue-900/20">
                  <div className="flex items-start gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-400 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-blue-300">Recommendation</h4>
                      <p className="text-sm text-blue-200/80 mt-1">{report.technicalDebt.recommendation}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'complexity' && (
              <div>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Cyclomatic Complexity Analysis</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="p-3 bg-card border border-border rounded-lg">
                      <p className="text-2xl font-bold text-foreground">{report.complexity.overallComplexity}</p>
                      <p className="text-sm text-muted-foreground">Overall Complexity</p>
                    </div>
                    <div className="p-3 bg-card border border-border rounded-lg">
                      <p className="text-2xl font-bold text-foreground">{report.complexity.averageComplexity}</p>
                      <p className="text-sm text-muted-foreground">Average Complexity</p>
                    </div>
                    <div className="p-3 bg-card border border-border rounded-lg">
                      <p className="text-2xl font-bold text-foreground">{report.complexity.lineCount}</p>
                      <p className="text-sm text-muted-foreground">Lines of Code</p>
                    </div>
                    <div className="p-3 bg-card border border-border rounded-lg">
                      <p className="text-2xl font-bold text-foreground">{report.complexity.functions.length}</p>
                      <p className="text-sm text-muted-foreground">Functions Analyzed</p>
                    </div>
                  </div>
                </div>

                {complexityChartData.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-semibold text-foreground mb-4">Top Functions by Complexity</h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={complexityChartData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis type="number" stroke="#9ca3af" />
                          <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                          <Bar dataKey="complexity" fill={COLORS.primary}>
                            {complexityChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={getComplexityColor(entry.rating)} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-semibold text-foreground mb-4">Function Details</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-card border border-border">
                        <tr>
                          <th className="px-4 py-2 text-left text-foreground">Function</th>
                          <th className="px-4 py-2 text-left text-foreground">Complexity</th>
                          <th className="px-4 py-2 text-left text-foreground">Lines</th>
                          <th className="px-4 py-2 text-left text-foreground">Rating</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.complexity.functions.map((fn, idx) => (
                          <tr key={idx} className="border-t border-border">
                            <td className="px-4 py-2 font-mono text-xs text-foreground">{fn.name}</td>
                            <td className="px-4 py-2 text-foreground">{fn.complexity}</td>
                            <td className="px-4 py-2 text-foreground">{fn.startLine}-{fn.endLine}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                fn.rating === 'low' ? 'bg-green-900/30 text-green-400' :
                                fn.rating === 'medium' ? 'bg-yellow-900/30 text-yellow-400' :
                                fn.rating === 'high' ? 'bg-orange-900/30 text-orange-400' :
                                'bg-red-900/30 text-red-400'
                              }`}>
                                {fn.rating}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'debt' && (
              <div>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Technical Debt Estimation</h3>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="p-4 bg-red-900/20 rounded-lg border border-red-800">
                      <p className="text-3xl font-bold text-red-400">{report.technicalDebt.totalDays}d</p>
                      <p className="text-sm text-red-300">Total Debt (Days)</p>
                    </div>
                    <div className="p-4 bg-yellow-900/20 rounded-lg border border-yellow-800">
                      <p className="text-3xl font-bold text-yellow-400">{report.technicalDebt.totalHours}h</p>
                      <p className="text-sm text-yellow-300">Total Debt (Hours)</p>
                    </div>
                    <div className="p-4 bg-blue-900/20 rounded-lg border border-blue-800">
                      <p className="text-3xl font-bold text-blue-400">{report.technicalDebt.totalMinutes}m</p>
                      <p className="text-sm text-blue-300">Total Debt (Minutes)</p>
                    </div>
                  </div>
                </div>

                {debtChartData.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-semibold text-foreground mb-4">Debt Breakdown</h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={debtChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                          <YAxis stroke="#9ca3af" />
                          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                          <Bar dataKey="value" fill={COLORS.warning}>
                            {debtChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS.warning} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <div className="mb-6">
                  <h4 className="font-semibold text-foreground mb-4">Debt Details</h4>
                  <div className="space-y-3">
                    {report.technicalDebt.breakdown.map((item, idx) => (
                      <div key={idx} className="p-3 bg-card border border-border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <h5 className="font-semibold text-foreground">{item.category}</h5>
                            <p className="text-sm text-muted-foreground">{item.description}</p>
                            {item.items && <p className="text-sm text-muted-foreground">Items: {item.items}</p>}
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-yellow-400">{item.minutes}m</p>
                            <p className="text-sm text-muted-foreground">~{Math.round(item.minutes / 60 * 10) / 10}h</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-blue-900/20 rounded-lg border border-blue-800">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-blue-400 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-blue-300">Priority: {report.technicalDebt.priority.toUpperCase()}</h4>
                      <p className="text-sm text-blue-200/80 mt-1">{report.technicalDebt.recommendation}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'coverage' && report.coverage && (
              <div>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Code Coverage Insights</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    <div className="p-3 bg-card border border-border rounded-lg text-center">
                      <p className="text-2xl font-bold" style={{ color: COLORS.primary }}>{report.coverage.coverage.line}%</p>
                      <p className="text-sm text-muted-foreground">Line Coverage</p>
                    </div>
                    <div className="p-3 bg-card border border-border rounded-lg text-center">
                      <p className="text-2xl font-bold" style={{ color: COLORS.success }}>{report.coverage.coverage.statement}%</p>
                      <p className="text-sm text-muted-foreground">Statement Coverage</p>
                    </div>
                    <div className="p-3 bg-card border border-border rounded-lg text-center">
                      <p className="text-2xl font-bold" style={{ color: COLORS.warning }}>{report.coverage.coverage.function}%</p>
                      <p className="text-sm text-muted-foreground">Function Coverage</p>
                    </div>
                    <div className="p-3 bg-card border border-border rounded-lg text-center">
                      <p className="text-2xl font-bold" style={{ color: COLORS.purple }}>{report.coverage.coverage.branch}%</p>
                      <p className="text-sm text-muted-foreground">Branch Coverage</p>
                    </div>
                    <div className="p-3 bg-card border border-border rounded-lg text-center">
                      <p className="text-2xl font-bold" style={{ color: getScoreColor(report.coverage.overall) }}>{report.coverage.overall}%</p>
                      <p className="text-sm text-muted-foreground">Overall</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-foreground mb-4">Coverage Distribution</h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={coverageChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {coverageChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-foreground mb-4">Coverage Analysis</h4>
                    <div className="space-y-3">
                      {coverageChartData.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: item.fill }} />
                          <span className="flex-1 text-foreground">{item.name}</span>
                          <span className="font-semibold text-foreground">{item.value}%</span>
                          <div className="w-24 h-2 bg-muted rounded overflow-hidden">
                            <div 
                              className="h-full rounded" 
                              style={{ 
                                width: `${item.value}%`,
                                backgroundColor: item.fill 
                              }} 
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-blue-900/20 rounded-lg border border-blue-800">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-blue-400 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-blue-300">Coverage Rating: {report.coverage.rating.toUpperCase()}</h4>
                      <p className="text-sm text-blue-200/80 mt-1">{report.coverage.recommendation}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'eslint' && report.eslint && (
              <div>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">ESLint Analysis Results</h3>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="p-3 bg-red-900/20 rounded-lg border border-red-800 text-center">
                      <p className="text-2xl font-bold text-red-400">{report.eslint.errorCount}</p>
                      <p className="text-sm text-muted-foreground">Errors</p>
                    </div>
                    <div className="p-3 bg-yellow-900/20 rounded-lg border border-yellow-800 text-center">
                      <p className="text-2xl font-bold text-yellow-400">{report.eslint.warningCount}</p>
                      <p className="text-sm text-muted-foreground">Warnings</p>
                    </div>
                    <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-800 text-center">
                      <p className="text-2xl font-bold text-blue-400">{report.eslint.infoCount}</p>
                      <p className="text-sm text-muted-foreground">Info</p>
                    </div>
                  </div>
                </div>

                <div className="mb-4 p-3 bg-card border border-border rounded-lg">
                  <p className="text-foreground">{report.eslint.summary}</p>
                </div>

                <div>
                  <h4 className="font-semibold text-foreground mb-4">Issues</h4>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {report.eslint.results[0]?.messages.map((msg, idx) => (
                      <div 
                        key={idx} 
                        className={`p-3 rounded-lg border ${
                          msg.severity === 'error' ? 'bg-red-900/20 border-red-800' :
                          msg.severity === 'warning' ? 'bg-yellow-900/20 border-yellow-800' :
                          'bg-blue-900/20 border-blue-800'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {msg.severity === 'error' ? (
                            <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                          ) : msg.severity === 'warning' ? (
                            <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                          ) : (
                            <CheckCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-foreground">{msg.rule}</span>
                              <span className="text-xs text-muted-foreground">Line {msg.line}, Col {msg.column}</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{msg.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!report && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          <Code className="w-12 h-12 mx-auto mb-4 text-gray-600" />
          <p>Enter your code above and click "Analyze Code" to see quality metrics</p>
        </div>
      )}
    </div>
  );
}
