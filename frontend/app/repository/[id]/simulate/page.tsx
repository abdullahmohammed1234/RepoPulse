'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  AlertTriangle, TrendingDown, FileCode, Users, 
  Clock, Lightbulb, ArrowLeft, Loader2, Sparkles,
  Target, Zap, ChevronRight
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Mock userId for demo - must use valid UUID format for API to save simulations
const userId = '00000000-0000-0000-0000-000000000001';

interface SimulationInput {
  lines_added: number;
  lines_deleted: number;
  files_changed: number;
  commits_count: number;
  contributor_id: number | null;
  target_files: number[];
}

interface TopFactor {
  feature: string;
  value: number;
  impact_weight: number;
}

interface SimulationResult {
  simulation_id?: string;
  risk_score: number;
  risk_level: string;
  risk_vs_repo_avg: string;
  relative_label: string;
  top_factors: TopFactor[];
  recommendations: string[];
  risk_reduction_estimate?: {
    potential_reduction: number;
    reduction_percent: string;
    message: string;
  };
  repo_avg_risk: number;
  lines_added?: number;
  lines_deleted?: number;
  files_changed?: number;
  commits_count?: number;
  contributor_id?: number;
  target_files?: number[];
}

interface Contributor {
  id: number;
  login: string;
  avatar_url: string;
  experience_score: number;
}

interface HighChurnFile {
  id: number;
  filename: string;
  churnScore: number;
  isHotspot: boolean;
  modificationCount: number;
}

// Debounce hook for live preview
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Risk Gauge Component
function RiskGauge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const dimensions = size === 'lg' ? 'w-48 h-48' : size === 'md' ? 'w-36 h-36' : 'w-28 h-28';
  const textSize = size === 'lg' ? 'text-4xl' : size === 'md' ? 'text-3xl' : 'text-xl';
  const labelSize = size === 'lg' ? 'text-sm' : 'text-xs';
  
  const getColor = () => {
    if (score > 0.7) return '#ef4444';
    if (score > 0.4) return '#eab308';
    return '#22c55e';
  };
  
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (score * circumference);
  
  return (
    <div className={`${dimensions} relative flex items-center justify-center`}>
      <svg className="transform -rotate-90" width="100%" height="100%" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="40"
          stroke="#e5e7eb"
          strokeWidth="8"
          fill="none"
        />
        <circle
          cx="50"
          cy="50"
          r="40"
          stroke={getColor()}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-700 ease-out"
          style={{
            filter: `drop-shadow(0 0 6px ${getColor()}40)`
          }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`${textSize} font-bold`} style={{ color: getColor() }}>
          {(score * 100).toFixed(0)}
        </span>
        <span className={`${labelSize} text-muted-foreground`}>Risk Score</span>
      </div>
    </div>
  );
}

// Comparison Badge Component
function ComparisonBadge({ riskVsRepoAvg, relativeLabel }: { riskVsRepoAvg: string; relativeLabel: string }) {
  const isHigher = riskVsRepoAvg.startsWith('+');
  const isNeutral = riskVsRepoAvg === '0%' || riskVsRepoAvg === '+0%' || riskVsRepoAvg === '-0%';
  
  let bgColor = 'bg-gray-100 text-gray-700';
  let icon = null;
  
  if (!isNeutral) {
    if (isHigher) {
      bgColor = 'bg-red-100 text-red-700';
      icon = <AlertTriangle className="w-3 h-3" />;
    } else {
      bgColor = 'bg-green-100 text-green-700';
      icon = <TrendingDown className="w-3 h-3" />;
    }
  }
  
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${bgColor}`}>
      {icon}
      <span>{relativeLabel}</span>
      <span className="opacity-75">({riskVsRepoAvg} vs avg)</span>
    </div>
  );
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
    <div className="bg-card rounded-lg border p-4">
      <h4 className="font-semibold flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-yellow-500" />
        Recommendations
      </h4>
      <ul className="space-y-2">
        {recommendations.map((rec, idx) => (
          <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
            <ChevronRight className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
            {rec}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Risk Reduction Estimator Component
function RiskReductionEstimator({ estimate }: { estimate: SimulationResult['risk_reduction_estimate'] }) {
  if (!estimate) return null;
  
  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-lg border border-blue-200 dark:border-blue-800 p-4">
      <h4 className="font-semibold flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-blue-500" />
        Risk Reduction Estimator
      </h4>
      <p className="text-sm text-muted-foreground">
        {estimate.message}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-green-500 rounded-full transition-all duration-500"
            style={{ width: `${parseInt(estimate.reduction_percent)}%` }}
          />
        </div>
        <span className="text-sm font-medium text-green-600">
          -{estimate.reduction_percent}%
        </span>
      </div>
    </div>
  );
}

// Main Simulation Page
export default function SimulationPage() {
  const params = useParams();
  const router = useRouter();
  const repositoryId = params?.id;
  
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<SimulationInput>({
    lines_added: 50,
    lines_deleted: 20,
    files_changed: 5,
    commits_count: 3,
    contributor_id: null,
    target_files: [],
  });
  
  // Available data
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [highChurnFiles, setHighChurnFiles] = useState<HighChurnFile[]>([]);
  const [repoAvgRisk, setRepoAvgRisk] = useState(0.5);
  
  // Result state
  const [result, setResult] = useState<SimulationResult | null>(null);

  // History state
  const [history, setHistory] = useState<SimulationResult[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  // Debounce the form data for live preview
  const debouncedFormData = useDebounce(formData, 300);
  
  // Fetch initial data
  useEffect(() => {
    if (!repositoryId) return;
    
    const fetchSimulationData = async () => {
      try {
        setInitialLoading(true);
        const response = await fetch(`${API_URL}/api/repository/${repositoryId}/simulation-data`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch simulation data');
        }
        
        const data = await response.json();
        setContributors(data.contributors || []);
        setHighChurnFiles(data.high_churn_files || []);
        setRepoAvgRisk(data.repo_averages?.avgRiskScore || 0.5);
        
        // Set default contributor if available
        if (data.contributors && data.contributors.length > 0) {
          setFormData(prev => ({
            ...prev,
            contributor_id: data.contributors[0].id
          }));
        }
      } catch (err) {
        console.error('Error fetching simulation data:', err);
        setError('Failed to load simulation data. Please try again.');
      } finally {
        setInitialLoading(false);
      }
    };
    
    fetchSimulationData();
  }, [repositoryId]);
  
  // Run simulation when debounced form data changes
  useEffect(() => {
    if (initialLoading) return;
    
    const runSimulation = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`${API_URL}/api/repository/${repositoryId}/simulate-pr`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...debouncedFormData,
            userId
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Simulation failed');
        }
        
        const data = await response.json();
        setResult(data);
        // Refresh history
        fetchHistory();
      } catch (err) {
        console.error('Simulation error:', err);
        setError(err instanceof Error ? err.message : 'Simulation failed');
      } finally {
        setLoading(false);
      }
    };
    
    runSimulation();
  }, [debouncedFormData, repositoryId, initialLoading]);

  // Fetch simulation history
  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const response = await fetch(`${API_URL}/api/repository/${repositoryId}/simulations?userId=${userId}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.simulations || []);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Load history on mount
  useEffect(() => {
    if (repositoryId) {
      fetchHistory();
    }
  }, [repositoryId]);
  
  const handleInputChange = (field: keyof SimulationInput, value: number | number[]) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };
  
  const handleContributorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setFormData(prev => ({
      ...prev,
      contributor_id: value ? parseInt(value) : null,
    }));
  };
  
  const handleFileToggle = (fileId: number) => {
    setFormData(prev => {
      const currentFiles = prev.target_files || [];
      const newFiles = currentFiles.includes(fileId)
        ? currentFiles.filter(id => id !== fileId)
        : [...currentFiles, fileId];
      return {
        ...prev,
        target_files: newFiles,
      };
    });
  };
  
  const getRiskColor = (score: number) => {
    if (score > 0.7) return 'text-red-500';
    if (score > 0.4) return 'text-yellow-500';
    return 'text-green-500';
  };
  
  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading simulation data...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Target className="w-6 h-6 text-primary" />
                  PR Risk Simulator
                </h1>
                <p className="text-muted-foreground">
                  Simulate a pull request before opening it
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Panel - Input Form */}
          <div className="space-y-6">
            {/* Basic Info Card */}
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileCode className="w-5 h-5" />
                PR Details
              </h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Lines Added
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.lines_added}
                    onChange={(e) => handleInputChange('lines_added', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border rounded-md bg-background"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Lines Deleted
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.lines_deleted}
                    onChange={(e) => handleInputChange('lines_deleted', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border rounded-md bg-background"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Files Changed
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.files_changed}
                    onChange={(e) => handleInputChange('files_changed', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border rounded-md bg-background"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Commits
                  </label>
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
            
            {/* Contributor Selection */}
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Contributor
              </h2>
              
              <select
                value={formData.contributor_id || ''}
                onChange={handleContributorChange}
                className="w-full px-3 py-2 border rounded-md bg-background"
              >
                <option value="">Select contributor...</option>
                {contributors.map((contributor) => (
                  <option key={contributor.id} value={contributor.id}>
                    {contributor.login} (exp: {contributor.experience_score?.toFixed(1) || 'N/A'})
                  </option>
                ))}
              </select>
            </div>
            
            {/* Target Files Selection */}
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileCode className="w-5 h-5" />
                Target Files <span className="text-muted-foreground font-normal">(optional)</span>
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Select high-churn files you're modifying to get more accurate risk prediction
              </p>
              
              <div className="max-h-64 overflow-y-auto space-y-2">
                {highChurnFiles.map((file) => (
                  <label
                    key={file.id}
                    className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                      formData.target_files?.includes(file.id)
                        ? 'bg-primary/10 border border-primary'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.target_files?.includes(file.id) || false}
                      onChange={() => handleFileToggle(file.id)}
                      className="w-4 h-4 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        Churn: {file.churnScore.toFixed(1)} • {file.modificationCount} mods
                      </p>
                    </div>
                    {file.isHotspot && (
                      <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                        Hotspot
                      </span>
                    )}
                  </label>
                ))}
                
                {highChurnFiles.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No high-churn files available
                  </p>
                )}
              </div>
            </div>
          </div>
          
          {/* Right Panel - Results */}
          <div className="space-y-6">
            {/* Risk Score Display */}
            <div className="bg-card rounded-lg border p-6">
              <div className="flex flex-col items-center">
                <h2 className="text-lg font-semibold mb-4">Risk Assessment</h2>
                
                {loading ? (
                  <div className="py-12">
                    <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground mt-4">Analyzing...</p>
                  </div>
                ) : result ? (
                  <>
                    <RiskGauge score={result.risk_score} size="lg" />
                    
                    <div className="mt-4">
                      <ComparisonBadge 
                        riskVsRepoAvg={result.risk_vs_repo_avg}
                        relativeLabel={result.relative_label}
                      />
                    </div>
                    
                    <div className="mt-4 text-sm text-muted-foreground">
                      Repository average: {(result.repo_avg_risk * 100).toFixed(0)}%
                    </div>
                  </>
                ) : (
                  <div className="py-12 text-center">
                    <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mt-4">
                      Enter PR details to see risk prediction
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Risk Reduction Estimator */}
            {result?.risk_reduction_estimate && (
              <RiskReductionEstimator estimate={result.risk_reduction_estimate} />
            )}
            
            {/* Top Risk Factors */}
            {result && result.top_factors && result.top_factors.length > 0 && (
              <div className="bg-card rounded-lg border p-6">
                <h2 className="text-lg font-semibold mb-4">Top Risk Factors</h2>
                <TopFactorsChart factors={result.top_factors} />
              </div>
            )}
            
            {/* Recommendations */}
            {result && result.recommendations && result.recommendations.length > 0 && (
              <RecommendationsCard recommendations={result.recommendations} />
            )}
            
            {/* Quick Tips */}
            <div className="bg-muted/50 rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Optimization Tips
              </h2>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                  Keep PRs under 400 lines for faster reviews
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                  Limit changes to 5 files when possible
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                  Avoid modifying high-churn files in the same PR
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                  Break large features into smaller PRs
                </li>
              </ul>
            </div>
            
            {/* Simulation History */}
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Simulation History
              </h2>
              
              {historyLoading ? (
                <div className="py-4">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                </div>
              ) : history.length > 0 ? (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {history.map((sim, index) => (
                    <div 
                      key={sim.simulation_id || index}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                      onClick={() => {
                        // Restore simulation parameters
                        setFormData(prev => ({
                          ...prev,
                          lines_added: (sim as any).lines_added || 0,
                          lines_deleted: (sim as any).lines_deleted || 0,
                          files_changed: (sim as any).files_changed || 0,
                          commits_count: (sim as any).commits_count || 0,
                          contributor_id: (sim as any).contributor_id,
                          target_files: (sim as any).target_files || []
                        }));
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          sim.risk_level === 'low' ? 'bg-green-500' :
                          sim.risk_level === 'medium' ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`} />
                        <div>
                          <p className="text-sm font-medium">
                            +{(sim as any).lines_added} / -{(sim as any).lines_deleted} lines
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(sim as any).files_changed} files, {(sim as any).commits_count} commits
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${
                          sim.risk_level === 'low' ? 'text-green-500' :
                          sim.risk_level === 'medium' ? 'text-yellow-500' :
                          'text-red-500'
                        }`}>
                          {(sim.risk_score * 100).toFixed(0)}%
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {sim.risk_level}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No simulation history yet. Run a simulation to see it here.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
