'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Cell, Legend
} from 'recharts';
import { Activity, TrendingUp, AlertTriangle, Clock, Shield, RefreshCw } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Types
interface BenchmarkRank {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  language: string | null;
  stars: number;
  health_score: number;
  health_percentile: number;
  momentum_score: number;
  momentum_percentile: number;
  risk_index: number;
  risk_percentile: number;
  velocity_index: number;
  velocity_percentile: number;
  stability_index: number;
  stability_percentile: number;
}

interface BenchmarkOverview {
  total_repositories: number;
  top_repository: {
    name: string;
    full_name: string;
    health_score: number;
    health_percentile: number;
  } | null;
  bottom_repository: {
    name: string;
    full_name: string;
    health_score: number;
    health_percentile: number;
  } | null;
  average_health_score: number;
}

interface DistributionData {
  range: string;
  count: number;
}

// Color palette matching the theme
const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'];

export default function BenchmarkPage() {
  const [rankings, setRankings] = useState<BenchmarkRank[]>([]);
  const [overview, setOverview] = useState<BenchmarkOverview | null>(null);
  const [distribution, setDistribution] = useState<DistributionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [insight, setInsight] = useState<string>('');
  const [selectedRepoForInsight, setSelectedRepoForInsight] = useState<number | null>(null);

  const fetchBenchmarkData = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, rankingsRes, distRes] = await Promise.all([
        fetch(`${API_URL}/api/benchmark/overview`),
        fetch(`${API_URL}/api/benchmark/rankings`),
        fetch(`${API_URL}/api/benchmark/distribution`)
      ]);

      const overviewData = await overviewRes.json();
      const rankingsData = await rankingsRes.json();
      const distData = await distRes.json();

      setOverview(overviewData);
      setRankings(rankingsData);
      setDistribution(distData);

      // Don't auto-select any repositories - user must choose
    } catch (error) {
      console.error('Failed to fetch benchmark data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const computeBenchmarks = async () => {
    setComputing(true);
    try {
      const response = await fetch(`${API_URL}/api/benchmark/compute`, { method: 'POST' });
      const result = await response.json();
      if (result.success) {
        await fetchBenchmarkData();
      }
    } catch (error) {
      console.error('Failed to compute benchmarks:', error);
    } finally {
      setComputing(false);
    }
  };

  const fetchInsight = async (repo: BenchmarkRank) => {
    try {
      const response = await fetch(`${API_URL}/api/benchmark/repository/${repo.id}`);
      const data = await response.json();
      if (data.insight) {
        setInsight(data.insight);
        // Force re-render by resetting and setting again
        setTimeout(() => {
          const el = document.getElementById('insight-panel');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } catch (error) {
      console.error('Failed to fetch insight:', error);
    }
  };

  useEffect(() => {
    fetchBenchmarkData();
  }, [fetchBenchmarkData]);

  // Prepare radar chart data
  const getRadarData = () => {
    const metrics = ['Health', 'Momentum', 'Risk', 'Velocity', 'Stability'];
    const selectedData = rankings.filter(r => selectedRepos.includes(r.full_name));
    
    if (selectedData.length === 0) return [];

    return metrics.map(metric => {
      const dataPoint: any = { metric };
      selectedData.forEach(repo => {
        switch (metric) {
          case 'Health':
            dataPoint[repo.full_name] = repo.health_score;
            break;
          case 'Momentum':
            dataPoint[repo.full_name] = repo.momentum_score;
            break;
          case 'Risk':
            dataPoint[repo.full_name] = repo.risk_index;
            break;
          case 'Velocity':
            dataPoint[repo.full_name] = repo.velocity_index;
            break;
          case 'Stability':
            dataPoint[repo.full_name] = repo.stability_index;
            break;
        }
      });
      return dataPoint;
    });
  };

  const toggleRepoSelection = (fullName: string) => {
    setSelectedRepos(prev => 
      prev.includes(fullName) 
        ? prev.filter(r => r !== fullName)
        : [...prev, fullName]
    );
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400 bg-green-500/20 border-green-500/30';
    if (score >= 60) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
    if (score >= 40) return 'text-orange-400 bg-orange-500/20 border-orange-500/30';
    return 'text-red-400 bg-red-500/20 border-red-500/30';
  };

  const getPercentileBadge = (percentile: number) => {
    if (percentile >= 90) return { label: 'Top 10% 🏆', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
    if (percentile >= 75) return { label: 'Top 25%', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
    if (percentile >= 50) return { label: 'Above Average', color: 'bg-green-500/20 text-green-400 border-green-500/30' };
    if (percentile >= 25) return { label: 'Below Average', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
    return { label: 'Needs Attention', color: 'bg-red-500/20 text-red-400 border-red-500/30' };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading benchmarks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/20 to-purple-500/20 border-b border-border">
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">🏆 Benchmark Dashboard</h1>
              <p className="text-muted-foreground text-lg">Multi-Repository Comparative Intelligence</p>
            </div>
            <button
              onClick={computeBenchmarks}
              disabled={computing}
              className={`px-6 py-3 rounded-lg font-semibold transition-all flex items-center gap-2 ${
                computing 
                  ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${computing ? 'animate-spin' : ''}`} />
              {computing ? 'Computing...' : 'Refresh Benchmarks'}
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Overview Stats */}
        {overview && overview.total_repositories > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <Activity className="w-5 h-5 text-primary" />
                <h3 className="text-muted-foreground text-sm font-medium">Total Repositories</h3>
              </div>
              <p className="text-3xl font-bold text-foreground">{overview.total_repositories}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                <h3 className="text-muted-foreground text-sm font-medium">Average Health</h3>
              </div>
              <p className="text-3xl font-bold text-primary">{overview.average_health_score}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <Shield className="w-5 h-5 text-green-400" />
                <h3 className="text-muted-foreground text-sm font-medium">🏆 Top Repository</h3>
              </div>
              <p className="text-lg font-semibold text-foreground truncate">
                {overview.top_repository?.name || 'N/A'}
              </p>
              <p className="text-sm text-muted-foreground">
                Score: {overview.top_repository?.health_score || 0}
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <h3 className="text-muted-foreground text-sm font-medium">📉 Lowest Repository</h3>
              </div>
              <p className="text-lg font-semibold text-foreground truncate">
                {overview.bottom_repository?.name || 'N/A'}
              </p>
              <p className="text-sm text-muted-foreground">
                Score: {overview.bottom_repository?.health_score || 0}
              </p>
            </div>
          </div>
        )}

        {overview && overview.total_repositories === 0 && (
          <div className="bg-card border border-border rounded-xl p-12 text-center mb-8">
            <p className="text-muted-foreground text-lg">No repositories analyzed yet.</p>
            <p className="text-muted-foreground/60 mt-2">Analyze some repositories to see benchmarks.</p>
          </div>
        )}

        {overview && overview.total_repositories > 0 && (
          <>
            {/* Leaderboard Table */}
            <div className="bg-card border border-border rounded-xl mb-8 overflow-hidden">
              <div className="p-6 border-b border-border">
                <h2 className="text-2xl font-bold text-foreground">📊 Leaderboard</h2>
                <p className="text-muted-foreground mt-1">Repository rankings by engineering health</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Rank</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Repository</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Language</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Health</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Percentile</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Momentum</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Risk Index</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rankings.map((repo, index) => {
                      const badge = getPercentileBadge(repo.health_percentile);
                      return (
                        <tr key={repo.full_name} className={selectedRepos.includes(repo.full_name) ? 'bg-primary/10' : ''}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                              index === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                              index === 1 ? 'bg-gray-400/20 text-gray-400' :
                              index === 2 ? 'bg-orange-500/20 text-orange-400' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              {index + 1}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <input
                                type="checkbox"
                                checked={selectedRepos.includes(repo.full_name)}
                                onChange={() => toggleRepoSelection(repo.full_name)}
                                className="mr-3 h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
                              />
                              <div>
                                <p className="text-sm font-medium text-foreground">{repo.name}</p>
                                <p className="text-sm text-muted-foreground">{repo.owner}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                            {repo.language || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${getScoreColor(repo.health_score)}`}>
                              {repo.health_score}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${badge.color}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                            {repo.momentum_score}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${
                              repo.risk_index >= 70 ? 'border-green-500/30 text-green-400 bg-green-500/10' :
                              repo.risk_index >= 40 ? 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10' :
                              'border-red-500/30 text-red-400 bg-red-500/10'
                            }`}>
                              {repo.risk_index}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              onClick={() => fetchInsight(repo)}
                              className="text-primary hover:text-primary/80 text-sm font-medium"
                            >
                              View Insight
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Radar Chart */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-xl font-bold text-foreground mb-4">📈 Radar Comparison</h3>
                <p className="text-muted-foreground text-sm mb-4">Select repositories to compare (checkbox in leaderboard)</p>
                <div className="h-80">
                  {selectedRepos.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={getRadarData()}>
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis dataKey="metric" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        {selectedRepos.map((repoFullName, idx) => (
                          <Radar
                            key={repoFullName}
                            name={repoFullName.split('/')[1]}
                            dataKey={repoFullName}
                            stroke={COLORS[idx % COLORS.length]}
                            fill={COLORS[idx % COLORS.length]}
                            fillOpacity={0.3}
                          />
                        ))}
                        <Legend />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }} 
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      Select repositories to compare
                    </div>
                  )}
                </div>
              </div>

              {/* Distribution Chart */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-xl font-bold text-foreground mb-4">📊 Health Score Distribution</h3>
                <p className="text-muted-foreground text-sm mb-4">Histogram of repository health scores</p>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={distribution} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" domain={[0, 'auto']} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis type="category" dataKey="range" width={60} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }} 
                      />
                      <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Insight Panel */}
            <div id="insight-panel" className="bg-gradient-to-r from-primary/10 to-purple-500/10 border border-border rounded-xl p-8 mb-8">
              <h3 className="text-2xl font-bold text-foreground mb-4">💡 Benchmark Insights</h3>
              {insight && insight.length > 0 ? (
                <p className="text-xl text-primary font-medium leading-relaxed bg-primary/10 p-4 rounded-lg border border-primary/20">
                  {insight}
                </p>
              ) : (
                <p className="text-muted-foreground italic">
                  Click "View Insight" on any repository in the leaderboard to see its comparative analysis.
                </p>
              )}
            </div>

            {/* Top 10% Badge Display */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-xl font-bold text-foreground mb-4">🏆 Top 10% Engineering Health</h3>
              <div className="flex flex-wrap gap-3">
                {rankings
                  .filter(r => r.health_percentile >= 90)
                  .map(repo => (
                    <div 
                      key={repo.full_name}
                      className="flex items-center space-x-2 bg-purple-500/10 border border-purple-500/30 rounded-full px-4 py-2"
                    >
                      <span className="text-purple-400">🏆</span>
                      <span className="text-foreground font-medium">{repo.name}</span>
                      <span className="text-purple-400 text-sm">({repo.health_score})</span>
                    </div>
                  ))}
                {rankings.filter(r => r.health_percentile >= 90).length === 0 && (
                  <p className="text-muted-foreground">No repositories in top 10% yet.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
