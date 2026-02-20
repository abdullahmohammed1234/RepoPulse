'use client';

import { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, Minus, Activity, AlertTriangle, 
  CheckCircle, XCircle, Clock, Users, GitPullRequest, BarChart3 
} from 'lucide-react';
import { 
  getRepositoryTrends, 
  getSystemTrends, 
  getChurnPredictions,
  RepositoryTrend,
  SystemTrends,
  ChurnPrediction
} from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface TrendAnalysisProps {
  repositoryId?: number;
}

export default function TrendAnalysis({ repositoryId }: TrendAnalysisProps) {
  const [repoTrends, setRepoTrends] = useState<{
    repositories: RepositoryTrend[];
    summary: { total: number; improving: number; declining: number; stable: number; avgHealthChange: string };
    topImproving: RepositoryTrend[];
    topDeclining: RepositoryTrend[];
  } | null>(null);
  
  const [systemTrends, setSystemTrends] = useState<SystemTrends | null>(null);
  const [churnPredictions, setChurnPredictions] = useState<ChurnPrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [selectedRepoId, setSelectedRepoId] = useState<number | undefined>(repositoryId);
  const [activeTab, setActiveTab] = useState<'overview' | 'repositories' | 'predictions'>('overview');

  useEffect(() => {
    fetchTrendData();
  }, [days, repositoryId]);

  // Fetch predictions when selectedRepoId changes
  useEffect(() => {
    if (selectedRepoId) {
      getChurnPredictions(selectedRepoId)
        .then(setChurnPredictions)
        .catch(err => console.error('Failed to fetch predictions:', err));
    } else {
      setChurnPredictions(null);
    }
  }, [selectedRepoId]);

  const fetchTrendData = async () => {
    setLoading(true);
    try {
      const trendsPromise = getRepositoryTrends(days);
      const systemPromise = getSystemTrends(days);
      
      const [trendsData, systemData] = await Promise.all([trendsPromise, systemPromise]);
      setRepoTrends(trendsData);
      setSystemTrends(systemData);

      // Fetch churn predictions if repository is specified
      if (selectedRepoId) {
        const predictions = await getChurnPredictions(selectedRepoId);
        setChurnPredictions(predictions);
      }
    } catch (err) {
      console.error('Failed to fetch trend data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="text-green-500" size={16} />;
      case 'declining': return <TrendingDown className="text-red-500" size={16} />;
      default: return <Minus className="text-gray-500" size={16} />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'improving': return 'text-green-500';
      case 'declining': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getHealthColor = (health: number) => {
    if (health >= 70) return 'text-green-500';
    if (health >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getChurnRiskColor = (risk: string) => {
    switch (risk) {
      case 'High': return 'text-red-500 bg-red-900/30';
      case 'Medium': return 'text-yellow-500 bg-yellow-900/30';
      default: return 'text-green-500 bg-green-900/30';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Period Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Trend Analysis</h2>
          <p className="text-sm text-muted-foreground">Track health score changes over time</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'overview' 
              ? 'border-blue-500 text-blue-500' 
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('repositories')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'repositories' 
              ? 'border-blue-500 text-blue-500' 
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Repositories
        </button>
        {selectedRepoId && (
          <button
            onClick={() => setActiveTab('predictions')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'predictions' 
                ? 'border-blue-500 text-blue-500' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Predictions
          </button>
        )}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Total Repositories */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="text-blue-500" size={20} />
                <span className="text-sm text-muted-foreground">Total Repositories</span>
              </div>
              <div className="text-2xl font-bold">
                {systemTrends?.current.totalRepositories || 0}
              </div>
              <div className="text-xs text-muted-foreground">
                {systemTrends?.current.avgHealthScore || 0} avg health score
              </div>
            </div>

            {/* Improving */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="text-green-500" size={20} />
                <span className="text-sm text-muted-foreground">Improving</span>
              </div>
              <div className="text-2xl font-bold text-green-500">
                {repoTrends?.summary.improving || 0}
              </div>
              <div className="text-xs text-muted-foreground">
                repos with improving health
              </div>
            </div>

            {/* Declining */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="text-red-500" size={20} />
                <span className="text-sm text-muted-foreground">Declining</span>
              </div>
              <div className="text-2xl font-bold text-red-500">
                {repoTrends?.summary.declining || 0}
              </div>
              <div className="text-xs text-muted-foreground">
                repos with declining health
              </div>
            </div>

            {/* Stable */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Minus className="text-gray-500" size={20} />
                <span className="text-sm text-muted-foreground">Stable</span>
              </div>
              <div className="text-2xl font-bold text-gray-500">
                {repoTrends?.summary.stable || 0}
              </div>
              <div className="text-xs text-muted-foreground">
                repos with stable health
              </div>
            </div>
          </div>

          {/* System Health History */}
          {systemTrends?.history && systemTrends.history.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">System Health Trend</h3>
              <div className="h-48 flex items-end gap-2">
                {systemTrends.history.slice(0, 14).map((item, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                    <div 
                      className="w-full bg-blue-500/80 rounded-t"
                      style={{ 
                        height: `${(item.healthScore / 100) * 100}%`,
                        minHeight: item.healthScore > 0 ? '4px' : '0'
                      }}
                    />
                    <span className="text-xs text-muted-foreground transform -rotate-45">
                      {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Activity Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <GitPullRequest className="text-purple-500" size={18} />
                <span className="text-sm text-muted-foreground">Total PRs</span>
              </div>
              <div className="text-xl font-semibold">
                {systemTrends?.current.totalPRs || 0}
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="text-green-500" size={18} />
                <span className="text-sm text-muted-foreground">Merge Rate</span>
              </div>
              <div className="text-xl font-semibold">
                {systemTrends?.current.mergeRate || '0'}%
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="text-orange-500" size={18} />
                <span className="text-sm text-muted-foreground">Contributors</span>
              </div>
              <div className="text-xl font-semibold">
                {systemTrends?.current.contributors || 0}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Repositories Tab */}
      {activeTab === 'repositories' && (
        <div className="space-y-6">
          {/* Repository Selector */}
          <div className="bg-card border border-border rounded-lg p-4">
            <label className="block text-sm font-medium mb-2">
              Select a repository for detailed predictions
            </label>
            <select
              value={selectedRepoId || ''}
              onChange={async (e) => {
                const repoId = e.target.value ? Number(e.target.value) : undefined;
                setSelectedRepoId(repoId);
                if (repoId) {
                  try {
                    const predictions = await getChurnPredictions(repoId);
                    setChurnPredictions(predictions);
                  } catch (err) {
                    console.error('Failed to fetch predictions:', err);
                  }
                }
              }}
              className="w-full max-w-md px-4 py-2 bg-background border border-border rounded-lg"
            >
              <option value="">-- Select Repository --</option>
              {repoTrends?.repositories.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.name} ({repo.language || 'Unknown'} - Health: {repo.currentHealth})
                </option>
              ))}
            </select>
            {selectedRepoId && churnPredictions && (
              <div className="mt-4 p-4 bg-blue-900/20 border border-blue-800/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-muted-foreground">Churn Risk: </span>
                    <span className={`font-bold ${
                      churnPredictions.churnRisk === 'High' ? 'text-red-500' :
                      churnPredictions.churnRisk === 'Medium' ? 'text-yellow-500' : 'text-green-500'
                    }`}>
                      {churnPredictions.churnRisk}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">30-Day Health: </span>
                    <span className="font-bold text-blue-400">
                      {churnPredictions.predictions.health30d}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Top Improving Repositories */}
          {repoTrends?.topImproving && repoTrends.topImproving.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="text-green-500" size={20} />
                Top Improving Repositories
              </h3>
              <div className="space-y-3">
                {repoTrends.topImproving.map((repo) => (
                  <div 
                    key={repo.id}
                    className="flex items-center justify-between p-3 bg-green-900/10 border border-green-800/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                        <TrendingUp className="text-green-500" size={18} />
                      </div>
                      <div>
                        <div className="font-medium">{repo.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {repo.language} • {repo.fullName}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${getHealthColor(repo.currentHealth)}`}>
                        {repo.currentHealth}
                      </div>
                      <div className="text-xs text-green-500">
                        +{repo.healthChange} points
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Declining Repositories */}
          {repoTrends?.topDeclining && repoTrends.topDeclining.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingDown className="text-red-500" size={20} />
                Repositories Needing Attention
              </h3>
              <div className="space-y-3">
                {repoTrends.topDeclining.map((repo) => (
                  <div 
                    key={repo.id}
                    className="flex items-center justify-between p-3 bg-red-900/10 border border-red-800/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                        <TrendingDown className="text-red-500" size={18} />
                      </div>
                      <div>
                        <div className="font-medium">{repo.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {repo.language} • {repo.fullName}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${getHealthColor(repo.currentHealth)}`}>
                        {repo.currentHealth}
                      </div>
                      <div className="text-xs text-red-500">
                        {repo.healthChange} points
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Repositories Table */}
          {repoTrends?.repositories && repoTrends.repositories.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">All Repositories</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Repository</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Language</th>
                      <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">Current Health</th>
                      <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">Change</th>
                      <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repoTrends.repositories.slice(0, 20).map((repo) => (
                      <tr key={repo.id} className="border-b border-border/50">
                        <td className="py-3 px-2">
                          <div className="font-medium">{repo.name}</div>
                          <div className="text-xs text-muted-foreground">{repo.fullName}</div>
                        </td>
                        <td className="py-3 px-2 text-sm">{repo.language || '-'}</td>
                        <td className={`py-3 px-2 text-center font-bold ${getHealthColor(repo.currentHealth)}`}>
                          {repo.currentHealth}
                        </td>
                        <td className={`py-3 px-2 text-center ${getTrendColor(repo.trend)}`}>
                          {repo.healthChange > 0 ? '+' : ''}{repo.healthChange}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {getTrendIcon(repo.trend)}
                            <span className={`text-sm capitalize ${getTrendColor(repo.trend)}`}>
                              {repo.trend}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Predictions Tab */}
      {activeTab === 'predictions' && selectedRepoId && churnPredictions && (
        <div className="space-y-6">
          {/* Churn Risk Assessment */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle className="text-yellow-500" size={20} />
              Churn Risk Assessment
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className={`p-4 rounded-lg ${getChurnRiskColor(churnPredictions.churnRisk)}`}>
                <div className="text-sm opacity-80">Churn Risk</div>
                <div className="text-2xl font-bold">{churnPredictions.churnRisk}</div>
                <div className="text-sm opacity-80">
                  {Math.round(churnPredictions.churnProbability * 100)}% probability
                </div>
              </div>
              
              <div className="p-4 bg-blue-900/30 rounded-lg">
                <div className="text-sm text-blue-300">Health Trend</div>
                <div className="text-2xl font-bold text-blue-200">{churnPredictions.riskTrend}</div>
                <div className="text-sm text-blue-300">Current score: {churnPredictions.currentHealth}</div>
              </div>
              
              <div className="p-4 bg-purple-900/30 rounded-lg">
                <div className="text-sm text-purple-300">30-Day Prediction</div>
                <div className="text-2xl font-bold text-purple-200">
                  {churnPredictions.predictions.health30d}
                </div>
                <div className="text-sm text-purple-300">
                  Predicted churn: {churnPredictions.predictions.churn30d} PRs
                </div>
              </div>
            </div>

            {/* Risk Factors */}
            <div className="space-y-3">
              <h4 className="font-medium">Risk Factors</h4>
              {churnPredictions.factors.map((factor, idx) => (
                <div 
                  key={idx}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    factor.impact === 'negative' 
                      ? 'bg-red-900/20 border border-red-800/30' 
                      : 'bg-green-900/20 border border-green-800/30'
                  }`}
                >
                  <span className="text-sm">{factor.factor}</span>
                  <span className={`text-sm ${factor.impact === 'negative' ? 'text-red-400' : 'text-green-400'}`}>
                    {factor.impact === 'negative' ? 'Negative impact' : 'No significant impact'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Metrics */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Current Metrics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-background rounded-lg">
                <div className="text-2xl font-bold">{churnPredictions.metrics.contributors}</div>
                <div className="text-sm text-muted-foreground">Contributors</div>
              </div>
              <div className="text-center p-4 bg-background rounded-lg">
                <div className="text-2xl font-bold">{churnPredictions.metrics.openPRs}</div>
                <div className="text-sm text-muted-foreground">Open PRs</div>
              </div>
              <div className="text-center p-4 bg-background rounded-lg">
                <div className="text-2xl font-bold">{churnPredictions.metrics.avgRiskScore}</div>
                <div className="text-sm text-muted-foreground">Avg Risk Score</div>
              </div>
              <div className="text-center p-4 bg-background rounded-lg">
                <div className="text-2xl font-bold capitalize">{churnPredictions.metrics.recentHealthTrend}</div>
                <div className="text-sm text-muted-foreground">Health Trend</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {activeTab === 'predictions' && selectedRepoId && !churnPredictions && (
        <div className="text-center py-12">
          <Activity className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No prediction data available</p>
          <p className="text-sm text-muted-foreground mt-2">
            Analyze the repository to generate predictions
          </p>
        </div>
      )}
    </div>
  );
}
