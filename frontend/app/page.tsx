'use client';

import { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { 
  Github, Search, AlertTriangle, TrendingUp, Users, 
  FileCode, Activity, CheckCircle, XCircle, Clock, 
  AlertCircle, Lightbulb, Info, Target, Sparkles, Download
} from 'lucide-react';
import FeedbackButton from '@/components/FeedbackButton';
import QuickCodeAnalyzer from '@/components/QuickCodeAnalyzer';
import { Skeleton, RiskBadge, RiskLevelBadge } from '@/components/dashboard';

const COLORS = ['#22c55e', '#eab308', '#ef4444'];

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Repository {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  description: string;
  url: string;
  language: string;
  stars: number;
  health_score: number;
  insights_summary?: string;
}

interface Stats {
  total: number;
  open: number;
  merged: number;
  closed: number;
  avg_risk: number;
  high_risk: number;
  contributors: number;
  anomalies: number;
  health_score?: number;
}

interface PullRequest {
  id: number;
  number: number;
  title: string;
  state: string;
  risk_score: number;
  risk_level?: string;
  top_factors?: TopFactor[];
  recommendations?: string[];
  lines_added: number;
  lines_deleted: number;
  files_changed: number;
  created_at: string;
  contributor_login: string;
}

interface TopFactor {
  feature: string;
  value: number;
  impact_weight: number;
}

interface Hotspot {
  filename: string;
  total_changes: number;
  modification_count: number;
  churn_score: number;
  is_hotspot: boolean;
  suggestions: string[];
}

interface Contributor {
  id: number;
  login: string;
  avatar_url: string;
  contributions: number;
  experience_score: number;
  anomaly_score: number;
  pr_count: number;
}

interface TopChurnFile {
  filename: string;
  churn_score: number;
  modification_count: number;
}

// Top Factors Chart Component
function TopFactorsChart({ factors }: { factors: TopFactor[] }) {
  if (!factors || factors.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No factor data available
      </div>
    );
  }
  
  // Prepare data for chart
  const chartData = factors.map(f => ({
    name: f.feature.length > 20 ? f.feature.substring(0, 20) + '...' : f.feature,
    fullName: f.feature,
    value: f.impact_weight * 100,
    actualValue: f.value
  }));
  
  const getBarColor = (index: number) => {
    const colors = ['#ef4444', '#f97316', '#eab308'];
    return colors[index] || '#6b7280';
  };
  
  return (
    <div className="space-y-3">
      {factors.map((factor, idx) => (
        <div key={idx} className="space-y-1">
          <div className="flex justify-between items-center text-sm">
            <span className="font-medium flex items-center gap-1">
              {factor.feature}
              <span className="text-muted-foreground font-normal">
                (value: {factor.value.toFixed(2)})
              </span>
            </span>
            <span className="text-muted-foreground">
              {(factor.impact_weight * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-500"
              style={{ 
                width: `${factor.impact_weight * 100}%`,
                backgroundColor: getBarColor(idx)
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Recommendations Card Component
function RecommendationsCard({ recommendations }: { recommendations: string[] }) {
  if (!recommendations || recommendations.length === 0) {
    return null;
  }
  
  return (
    <div className="space-y-3">
      {recommendations.map((rec, idx) => (
        <div 
          key={idx} 
          className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
        >
          <Lightbulb className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900 dark:text-amber-100">{rec}</p>
        </div>
      ))}
    </div>
  );
}

// Executive Summary Panel Component
function ExecutiveSummaryPanel({ 
  insights, 
  topChurnFiles 
}: { 
  insights?: string | null; 
  topChurnFiles?: TopChurnFile[];
}) {
  return (
    <div className="p-6 rounded-lg border border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">RepoPulse Insight Summary</h3>
      </div>
      
      {insights ? (
        <p className="text-muted-foreground mb-4">{insights}</p>
      ) : (
        <p className="text-muted-foreground mb-4">
          Analyzing repository data...
        </p>
      )}
      
      {topChurnFiles && topChurnFiles.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Top Churn Files
          </h4>
          <div className="space-y-2">
            {topChurnFiles.slice(0, 3).map((file, idx) => (
              <div 
                key={idx} 
                className="flex items-center justify-between text-sm p-2 rounded bg-muted/50"
              >
                <code className="text-xs truncate max-w-[200px]">{file.filename}</code>
                <span className="text-xs text-muted-foreground">
                  {(file.churn_score * 100).toFixed(0)}% churn
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// PR Detail Modal Component
function PRDetailModal({ 
  pr, 
  onClose 
}: { 
  pr: PullRequest; 
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<any>(null);
  
  useEffect(() => {
    const fetchPRDetails = async () => {
      try {
        const res = await fetch(`${API_URL}/api/pull-request/${pr.id}/details`);
        const data = await res.json();
        setDetails(data);
      } catch (err) {
        console.error('Failed to fetch PR details:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchPRDetails();
  }, [pr.id]);
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="p-6 border-b border-border">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold">#{pr.number} {pr.title}</h2>
              <p className="text-muted-foreground text-sm mt-1">
                by {pr.contributor_login}
              </p>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              {/* Risk Score Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Risk Analysis</h3>
                  <RiskLevelBadge level={details?.risk_level || pr.risk_level} />
                </div>
                
                <div className="p-4 rounded-lg bg-card border">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-muted-foreground">Risk Score</span>
                    <RiskBadge score={pr.risk_score} />
                  </div>
                  
                  {details?.top_factors && details.top_factors.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-1">
                        <Info className="h-4 w-4" />
                        Top Contributing Factors
                      </h4>
                      <TopFactorsChart factors={details.top_factors} />
                    </div>
                  )}
                </div>
              </div>
              
              {/* Recommendations Section */}
              {(details?.recommendations && details.recommendations.length > 0) && (
                <div className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" />
                    Actionable Recommendations
                  </h3>
                  <RecommendationsCard recommendations={details.recommendations} />
                </div>
              )}
              
              {/* PR Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg bg-muted">
                  <div className="text-2xl font-bold">{pr.files_changed}</div>
                  <div className="text-xs text-muted-foreground">Files Changed</div>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <div className="text-2xl font-bold text-green-500">+{pr.lines_added}</div>
                  <div className="text-xs text-muted-foreground">Lines Added</div>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <div className="text-2xl font-bold text-red-500">-{pr.lines_deleted}</div>
                  <div className="text-xs text-muted-foreground">Lines Deleted</div>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <div className="text-2xl font-bold">
                    {pr.state === 'merged' ? '✓' : pr.state === 'closed' ? '✗' : '○'}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">{pr.state}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Simulate PR Tab Component - Embedded Simulation UI
function SimulatePRTab({ repositoryId }: { repositoryId: number }) {
  const [loading, setLoading] = useState(true);
  const [simLoading, setSimLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    lines_added: 50,
    lines_deleted: 20,
    files_changed: 5,
    commits_count: 3,
    contributor_id: null as number | null,
    target_files: [] as number[],
  });
  
  // Available data
  const [contributors, setContributors] = useState<any[]>([]);
  const [highChurnFiles, setHighChurnFiles] = useState<any[]>([]);
  const [repoAvgRisk, setRepoAvgRisk] = useState(0.5);
  
  // Result state
  const [result, setResult] = useState<any>(null);
  
  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_URL}/api/repository/${repositoryId}/simulation-data`);
        const data = await response.json();
        setContributors(data.contributors || []);
        setHighChurnFiles(data.high_churn_files || []);
        setRepoAvgRisk(data.repo_averages?.avgRiskScore || 0.5);
        
        if (data.contributors && data.contributors.length > 0) {
          setFormData(prev => ({ ...prev, contributor_id: data.contributors[0].id }));
        }
      } catch (err) {
        setError('Failed to load simulation data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [repositoryId]);
  
  // Run simulation
  useEffect(() => {
    if (loading) return;
    
    const runSimulation = async () => {
      try {
        setSimLoading(true);
        const response = await fetch(`${API_URL}/api/repository/${repositoryId}/simulate-pr`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            userId: '00000000-0000-0000-0000-000000000001'
          }),
        });
        const data = await response.json();
        setResult(data);
      } catch (err) {
        console.error('Simulation error:', err);
      } finally {
        setSimLoading(false);
      }
    };
    
    const timer = setTimeout(runSimulation, 300);
    return () => clearTimeout(timer);
  }, [formData, repositoryId, loading]);
  
  const handleInputChange = (field: string, value: number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  
  const handleFileToggle = (fileId: number) => {
    setFormData(prev => {
      const newFiles = prev.target_files.includes(fileId)
        ? prev.target_files.filter(id => id !== fileId)
        : [...prev.target_files, fileId];
      return { ...prev, target_files: newFiles };
    });
  };
  
  const getRiskColor = (score: number) => {
    if (score > 0.7) return '#ef4444';
    if (score > 0.4) return '#eab308';
    return '#22c55e';
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading simulation...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold">PR Risk Simulator</h2>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel - Input */}
        <div className="space-y-4">
          <div className="bg-card rounded-lg border p-4">
            <h3 className="font-semibold mb-4">PR Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1">Lines Added</label>
                <input
                  type="number"
                  min="0"
                  value={formData.lines_added}
                  onChange={(e) => handleInputChange('lines_added', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Lines Deleted</label>
                <input
                  type="number"
                  min="0"
                  value={formData.lines_deleted}
                  onChange={(e) => handleInputChange('lines_deleted', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Files Changed</label>
                <input
                  type="number"
                  min="0"
                  value={formData.files_changed}
                  onChange={(e) => handleInputChange('files_changed', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Commits</label>
                <input
                  type="number"
                  min="0"
                  value={formData.commits_count}
                  onChange={(e) => handleInputChange('commits_count', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                />
              </div>
            </div>
          </div>
          
          <div className="bg-card rounded-lg border p-4">
            <h3 className="font-semibold mb-4">Contributor</h3>
            <select
              value={formData.contributor_id || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, contributor_id: e.target.value ? parseInt(e.target.value) : null }))}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="">Select contributor...</option>
              {contributors.map((c) => (
                <option key={c.id} value={c.id}>{c.login}</option>
              ))}
            </select>
          </div>
          
          <div className="bg-card rounded-lg border p-4">
            <h3 className="font-semibold mb-2">Target Files (optional)</h3>
            <p className="text-xs text-muted-foreground mb-3">Select high-churn files you're modifying</p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {highChurnFiles.map((file) => (
                <label key={file.id} className="flex items-center gap-2 p-1 rounded hover:bg-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.target_files.includes(file.id)}
                    onChange={() => handleFileToggle(file.id)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm truncate">{file.filename}</span>
                  {file.isHotspot && <span className="text-xs bg-red-100 text-red-700 px-1 rounded">Hotspot</span>}
                </label>
              ))}
            </div>
          </div>
        </div>
        
        {/* Right Panel - Results */}
        <div className="space-y-4">
          <div className="bg-card rounded-lg border p-6 text-center">
            <h3 className="font-semibold mb-4">Risk Score</h3>
            {simLoading ? (
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            ) : result ? (
              <>
                <div className="relative w-32 h-32 mx-auto mb-4">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" stroke="#e5e7eb" strokeWidth="8" fill="none" />
                    <circle
                      cx="50" cy="50" r="40"
                      stroke={getRiskColor(result.risk_score)}
                      strokeWidth="8"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 40}
                      strokeDashoffset={2 * Math.PI * 40 * (1 - result.risk_score)}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-bold" style={{ color: getRiskColor(result.risk_score) }}>
                      {Math.round(result.risk_score * 100)}
                    </span>
                  </div>
                </div>
                
                <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                  result.risk_score > 0.7 ? 'bg-red-100 text-red-700' :
                  result.risk_score > 0.4 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {result.risk_level} Risk
                </div>
                
                <div className="mt-3 text-sm text-muted-foreground">
                  {result.risk_vs_repo_avg} vs repo average ({(result.repo_avg_risk * 100).toFixed(0)}%)
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Enter PR details to see prediction</p>
            )}
          </div>
          
          {result?.risk_reduction_estimate && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-lg border border-blue-200 p-4">
              <h4 className="font-semibold flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-blue-500" />
                Risk Reduction Estimator
              </h4>
              <p className="text-sm text-muted-foreground">
                {result.risk_reduction_estimate.message}
              </p>
            </div>
          )}
          
          {result?.top_factors && result.top_factors.length > 0 && (
            <div className="bg-card rounded-lg border p-4">
              <h3 className="font-semibold mb-3">Top Risk Factors</h3>
              <div className="space-y-2">
                {result.top_factors.slice(0, 3).map((factor: any, idx: number) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{factor.feature}</span>
                      <span>{(factor.impact_weight * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${factor.impact_weight * 100}%`, backgroundColor: ['#ef4444', '#f97316', '#eab308'][idx] }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {result?.recommendations && result.recommendations.length > 0 && (
            <div className="bg-card rounded-lg border p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-500" />
                Recommendations
              </h3>
              <ul className="space-y-2">
                {result.recommendations.map((rec: string, idx: number) => (
                  <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span>•</span> {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentRepo, setCurrentRepo] = useState<Repository | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [selectedPR, setSelectedPR] = useState<PullRequest | null>(null);
  const [insights, setInsights] = useState<string | null>(null);
  const [topChurnFiles, setTopChurnFiles] = useState<TopChurnFile[]>([]);
  const [currentGenerationId, setCurrentGenerationId] = useState<string | null>(null);

  const analyzeRepo = async () => {
    if (!repoUrl.trim()) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${API_URL}/api/repository/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: repoUrl.trim() }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze repository');
      }
      
      // Fetch overview data
      const overviewRes = await fetch(`${API_URL}/api/repository/${data.repositoryId}/overview`);
      const overviewData = await overviewRes.json();
      
      setCurrentRepo(overviewData.repository);
      setStats(overviewData.stats);
      setInsights(overviewData.insights);
      setTopChurnFiles(overviewData.topChurnFiles || []);
      
      // Fetch PRs
      const prsRes = await fetch(`${API_URL}/api/repository/${data.repositoryId}/pull-requests?sort=risk_score&order=desc`);
      const prsData = await prsRes.json();
      setPullRequests(prsData.pullRequests);
      
      // Fetch hotspots
      const hotspotsRes = await fetch(`${API_URL}/api/repository/${data.repositoryId}/hotspots`);
      const hotspotsData = await hotspotsRes.json();
      setHotspots(hotspotsData.hotspots);
      
      // Fetch contributors
      const contribsRes = await fetch(`${API_URL}/api/repository/${data.repositoryId}/contributors`);
      const contribsData = await contribsRes.json();
      setContributors(contribsData.contributors);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getRiskDistribution = () => {
    if (!stats) return [];
    return [
      { name: 'Low Risk', value: stats.total - stats.high_risk, color: '#22c55e' },
      { name: 'High Risk', value: stats.high_risk, color: '#ef4444' },
    ];
  };

  const getPRsByState = () => {
    if (!stats) return [];
    return [
      { name: 'Merged', value: stats.merged, color: '#22c55e' },
      { name: 'Open', value: stats.open, color: '#3b82f6' },
      { name: 'Closed', value: stats.closed, color: '#ef4444' },
    ];
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="border-b border-border bg-card/50">
        <div className="container mx-auto px-4 py-12">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl mb-4">
              Repository Analytics
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Detect risky PRs, identify bottlenecks, predict file churn, and spot contributor anomalies.
            </p>
            
            {/* Search Form */}
            <div className="flex gap-2 max-w-xl mx-auto">
              <div className="relative flex-1">
                <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Enter GitHub repository URL (e.g., facebook/react)"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && analyzeRepo()}
                  className="w-full h-12 pl-10 pr-4 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <button
                onClick={analyzeRepo}
                disabled={loading}
                className="h-12 px-6 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? (
                  <Activity className="h-5 w-5 animate-spin" />
                ) : (
                  <Search className="h-5 w-5" />
                )}
                Analyze
              </button>
            </div>
            
            {error && (
              <div className="mt-4 p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive">
                {error}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Dashboard Content */}
      {currentRepo && stats && (
        <section className="container mx-auto px-4 py-8">
          {/* Repository Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center">
                <Github className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{currentRepo.full_name}</h2>
                <p className="text-muted-foreground">{currentRepo.description}</p>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  {currentRepo.language && <span>{currentRepo.language}</span>}
                  <span>⭐ {currentRepo.stars}</span>
                </div>
              </div>
            </div>
            
            {/* Health Score */}
            <div className="flex items-center gap-6">
              <div className="text-center px-6 py-2 bg-muted rounded-lg">
                <div className="text-4xl font-bold text-primary">{stats.health_score || currentRepo.health_score || 0}</div>
                <div className="text-sm text-muted-foreground">Health Score</div>
              </div>
            </div>
          </div>

          {/* AI Generation & Feedback */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    // Generate a new UUID for this generation
                    const generationId = crypto.randomUUID();
                    setCurrentGenerationId(generationId);
                    
                    const res = await fetch(`${API_URL}/api/generation/repository/${currentRepo.id}/summary`, { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                      alert(`AI Summary: ${data.data.summary}\n\n(Mock data: ${data.data.mock})`);
                    }
                  } catch (err) {
                    alert('Failed to generate summary');
                  }
                }}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2"
              >
                <Sparkles size={16} />
                Generate AI Summary
              </button>
              <button
                onClick={async () => {
                  window.open(`${API_URL}/api/export/repository/${currentRepo.id}?format=markdown`, '_blank');
                }}
                className="px-4 py-2 border border-border rounded-lg hover:bg-muted flex items-center gap-2"
              >
                <Download size={16} />
                Export
              </button>
            </div>
            <FeedbackButton generationId={currentGenerationId || ''} />
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-border">
            {['overview', 'pull-requests', 'hotspots', 'contributors', 'simulate'].map((tab) => (
              <button
                key={tab}
                onClick={() => setSelectedTab(tab)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                  selectedTab === tab
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.replace('-', ' ')}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {selectedTab === 'overview' && (
            <div className="space-y-6">
              {/* Executive Summary Panel */}
              <ExecutiveSummaryPanel 
                insights={insights} 
                topChurnFiles={topChurnFiles} 
              />
              
              {/* Stats Cards */}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <div className="p-6 rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-3 mb-2">
                    <Activity className="h-5 w-5 text-primary" />
                    <span className="font-medium">Total PRs</span>
                  </div>
                  <div className="text-3xl font-bold">{stats.total}</div>
                  <div className="text-sm text-muted-foreground">
                    {stats.open} open, {stats.merged} merged
                  </div>
                </div>
                
                <div className="p-6 rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-3 mb-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <span className="font-medium">High Risk PRs</span>
                  </div>
                  <div className="text-3xl font-bold">{stats.high_risk}</div>
                  <div className="text-sm text-muted-foreground">
                    Avg risk: {(stats.avg_risk || 0).toFixed(2)}
                  </div>
                </div>
                
                <div className="p-6 rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-3 mb-2">
                    <Users className="h-5 w-5 text-blue-500" />
                    <span className="font-medium">Contributors</span>
                  </div>
                  <div className="text-3xl font-bold">{stats.contributors}</div>
                  <div className="text-sm text-muted-foreground">
                    {stats.anomalies} anomalies detected
                  </div>
                </div>
                
                <div className="p-6 rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-3 mb-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    <span className="font-medium">Merge Rate</span>
                  </div>
                  <div className="text-3xl font-bold">
                    {stats.total > 0 ? Math.round((stats.merged / stats.total) * 100) : 0}%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {stats.merged} of {stats.total} PRs
                  </div>
                </div>
              </div>

              {/* Quick Code Quality Analyzer */}
              <QuickCodeAnalyzer />

              {/* Charts */}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 md:col-span-2">
                <div className="p-6 rounded-lg border border-border bg-card md:col-span-2">
                  <h3 className="text-lg font-semibold mb-4">Risk Distribution</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={getRiskDistribution()}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {getRiskDistribution().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div className="p-6 rounded-lg border border-border bg-card md:col-span-2">
                  <h3 className="text-lg font-semibold mb-4">PR Status</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={getPRsByState()}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {getPRsByState().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pull Requests Tab */}
          {selectedTab === 'pull-requests' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">High Risk Pull Requests</h3>
              {pullRequests.length === 0 ? (
                <p className="text-muted-foreground">No pull requests found.</p>
              ) : (
                <div className="space-y-3">
                  {pullRequests.slice(0, 10).map((pr) => (
                    <div
                      key={pr.id}
                      className="block p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedPR(pr)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-muted-foreground">#{pr.number}</span>
                            {pr.state === 'merged' ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : pr.state === 'closed' ? (
                              <XCircle className="h-4 w-4 text-destructive" />
                            ) : (
                              <Clock className="h-4 w-4 text-blue-500" />
                            )}
                          </div>
                          <h4 className="font-medium truncate">{pr.title}</h4>
                          <p className="text-sm text-muted-foreground">
                            by {pr.contributor_login} • {pr.files_changed} files • +{pr.lines_added} -{pr.lines_deleted}
                          </p>
                        </div>
                        <RiskBadge score={pr.risk_score || 0} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Hotspots Tab */}
          {selectedTab === 'hotspots' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Hotspot Files (High Churn)</h3>
              {hotspots.length === 0 ? (
                <p className="text-muted-foreground">No hotspot files detected.</p>
              ) : (
                <div className="space-y-3">
                  {hotspots.map((file, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border bg-card ${
                        file.is_hotspot ? 'border-destructive/50' : 'border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <FileCode className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <code className="text-sm font-mono">{file.filename}</code>
                            <p className="text-xs text-muted-foreground">
                              {file.modification_count} modifications • {file.total_changes} total changes
                            </p>
                          </div>
                        </div>
                        {file.is_hotspot && (
                          <span className="px-2 py-1 text-xs font-medium bg-destructive/10 text-destructive rounded">
                            Hotspot
                          </span>
                        )}
                      </div>
                      {file.suggestions.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Suggestions:</p>
                          <ul className="text-sm space-y-1">
                            {file.suggestions.map((s, i) => (
                              <li key={i} className="text-muted-foreground">• {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Contributors Tab */}
          {selectedTab === 'contributors' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Contributor Leaderboard</h3>
              {contributors.length === 0 ? (
                <p className="text-muted-foreground">No contributors found.</p>
              ) : (
                <div className="space-y-3">
                  {contributors.map((contributor) => (
                    <div
                      key={contributor.id}
                      className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card"
                    >
                      {contributor.avatar_url ? (
                        <img
                          src={contributor.avatar_url}
                          alt={contributor.login}
                          className="h-12 w-12 rounded-full"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                          <Users className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1">
                        <h4 className="font-medium">{contributor.login}</h4>
                        <p className="text-sm text-muted-foreground">
                          {contributor.contributions} contributions • {contributor.pr_count || 0} PRs
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">Experience</p>
                        <p className="text-2xl font-bold text-primary">
                          {Math.round(contributor.experience_score || 0)}
                        </p>
                      </div>
                      {contributor.anomaly_score > 0.7 && (
                        <div className="px-3 py-1 bg-destructive/10 text-destructive rounded text-sm">
                          ⚠️ Anomaly
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Simulate PR Tab */}
          {selectedTab === 'simulate' && currentRepo && (
            <SimulatePRTab repositoryId={currentRepo.id} />
          )}
        </section>
      )}

      {/* PR Detail Modal */}
      {selectedPR && (
        <PRDetailModal 
          pr={selectedPR} 
          onClose={() => setSelectedPR(null)} 
        />
      )}
    </div>
  );
}
