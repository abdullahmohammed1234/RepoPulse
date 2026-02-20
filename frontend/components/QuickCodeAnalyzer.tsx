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
  Cell
} from 'recharts';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Code, 
  GitBranch,
  Zap,
  ChevronDown,
  ChevronUp,
  ExternalLink
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

export default function QuickCodeAnalyzer() {
  const [code, setCode] = useState('');
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleAnalyze = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const result = await analyzeCodeQuality(code);
      setReport(result.data);
    } catch (err) {
      console.error('Analysis failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return COLORS.success;
    if (score >= 60) return COLORS.warning;
    return COLORS.danger;
  };

  const getComplexityColor = (rating: string) => {
    switch (rating) {
      case 'low': return COLORS.success;
      case 'medium': return COLORS.warning;
      case 'high': return COLORS.danger;
      default: return '#dc2626';
    }
  };

  const complexityData = report?.complexity?.functions?.slice(0, 5).map(fn => ({
    name: fn.name.length > 12 ? fn.name.substring(0, 12) + '...' : fn.name,
    complexity: fn.complexity,
    fill: getComplexityColor(fn.rating)
  })) || [];

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div 
        className="p-4 bg-blue-900/20 cursor-pointer border-b border-border"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-900/50 rounded-lg">
              <Code className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Quick Code Analyzer</h3>
              <p className="text-sm text-muted-foreground">Analyze cyclomatic complexity, debt & ESLint issues</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {report && (
              <div className="flex items-center gap-2">
                <div 
                  className="px-3 py-1 rounded-full text-sm font-bold"
                  style={{ 
                    backgroundColor: `${getScoreColor(report.overallScore.score)}20`,
                    color: getScoreColor(report.overallScore.score)
                  }}
                >
                  Score: {report.overallScore.score}
                </div>
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ 
                    backgroundColor: `${getScoreColor(report.overallScore.score)}20`,
                    color: getScoreColor(report.overallScore.score)
                  }}
                >
                  {report.overallScore.grade}
                </div>
              </div>
            )}
            {expanded ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {/* Expandable Content */}
      {expanded && (
        <div className="p-4 border-t border-border">
          {/* Code Input */}
          <div className="mb-4">
            <textarea
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setReport(null);
              }}
              placeholder="Paste your JavaScript/TypeScript code here for instant analysis..."
              className="w-full p-3 border border-border bg-background text-foreground rounded-md font-mono text-sm min-h-[100px] resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="flex justify-between items-center mt-2">
              <a 
                href="/admin/code-quality" 
                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                Open full analyzer
              </a>
              <button
                onClick={handleAnalyze}
                disabled={loading || !code.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-muted disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Analyze
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Results */}
          {report && (
            <div className="space-y-4">
              {/* Quick Stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 bg-card border border-border rounded-lg text-center">
                  <GitBranch className="h-5 w-5 mx-auto mb-1" style={{ color: getComplexityColor(report.complexity.rating) }} />
                  <p className="text-lg font-bold text-foreground">{report.complexity.overallComplexity}</p>
                  <p className="text-xs text-muted-foreground">Complexity</p>
                </div>
                <div className="p-3 bg-card border border-border rounded-lg text-center">
                  <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-yellow-400" />
                  <p className="text-lg font-bold text-foreground">{report.technicalDebt.totalDays}d</p>
                  <p className="text-xs text-muted-foreground">Tech Debt</p>
                </div>
                <div className="p-3 bg-card border border-border rounded-lg text-center">
                  <CheckCircle className="h-5 w-5 mx-auto mb-1 text-green-400" />
                  <p className="text-lg font-bold text-foreground">{report.coverage?.overall || 0}%</p>
                  <p className="text-xs text-muted-foreground">Coverage</p>
                </div>
                <div className="p-3 bg-card border border-border rounded-lg text-center">
                  <Activity className="h-5 w-5 mx-auto mb-1 text-blue-400" />
                  <p className="text-lg font-bold text-foreground">{report.eslint?.totalIssues || 0}</p>
                  <p className="text-xs text-muted-foreground">ESLint Issues</p>
                </div>
              </div>

              {/* Complexity Chart */}
              {complexityData.length > 0 && (
                <div className="p-3 bg-card border border-border rounded-lg">
                  <h4 className="text-sm font-semibold text-foreground mb-2">Top Functions by Complexity</h4>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={complexityData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis type="number" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                        <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 9 }} stroke="#9ca3af" />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                        <Bar dataKey="complexity">
                          {complexityData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ESLint Summary */}
              {report.eslint && report.eslint.totalIssues > 0 && (
                <div className="p-3 bg-card border border-border rounded-lg">
                  <h4 className="text-sm font-semibold text-foreground mb-2">ESLint Issues</h4>
                  <div className="flex gap-4 text-sm">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      {report.eslint.errorCount} Errors
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                      {report.eslint.warningCount} Warnings
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      {report.eslint.infoCount} Info
                    </span>
                  </div>
                </div>
              )}

              {/* Recommendation */}
              <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-800">
                <p className="text-sm text-blue-300">{report.technicalDebt.recommendation}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
