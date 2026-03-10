'use client';

import { useState, useEffect } from 'react';
import { 
  Network, 
  Users, 
  Flame, 
  Clock, 
  BarChart3,
  Settings,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import DependencyGraph from '@/components/DependencyGraph';
import ContributorNetwork from '@/components/ContributorNetwork';
import CodeHeatmap from '@/components/CodeHeatmap';
import InteractiveTimeline from '@/components/InteractiveTimeline';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface BenchmarkRank {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  language: string | null;
  stars: number;
}

type VisualizationTab = 'dependency' | 'network' | 'heatmap' | 'timeline';

export default function VisualizationsPage() {
  const [activeTab, setActiveTab] = useState<VisualizationTab>('heatmap');
  const [repositories, setRepositories] = useState<BenchmarkRank[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<number | null>(null);
  const [githubToken, setGithubToken] = useState('');
  const [githubTokenInput, setGithubTokenInput] = useState('');
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRepositories();
  }, []);

  const fetchRepositories = async () => {
    setLoading(true);
    setError(null);
    try {
      // Use benchmark rankings API to get repositories
      const response = await fetch(`${API_URL}/api/benchmark/rankings`);
      const data = await response.json();
      
      // The benchmark API returns an array directly, not {success, rankings}
      if (Array.isArray(data) && data.length > 0) {
        setRepositories(data);
        setSelectedRepo(data[0].id);
      } else {
        setError('No repositories found in benchmark. Add repositories to see visualizations.');
      }
    } catch (err) {
      console.error('Failed to fetch repositories:', err);
      setError('Could not connect to API. Please ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleTokenSave = () => {
    setGithubToken(githubTokenInput);
  };

  const tabs = [
    { id: 'heatmap' as const, label: 'Code Heatmap', icon: Flame },
    { id: 'timeline' as const, label: 'Timeline', icon: Clock },
    { id: 'dependency' as const, label: 'Dependencies', icon: Network },
    { id: 'network' as const, label: 'Contributors', icon: Users },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const selectedRepoData = repositories.find(r => r.id === selectedRepo);

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-200">Advanced Visualizations</h1>
          <p className="text-slate-400 mt-1">
            Interactive visualizations for repository analysis
          </p>
        </div>
        
        <button
          onClick={fetchRepositories}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>
      
      {/* Error message */}
      {error && (
        <div className="bg-yellow-900/50 border border-yellow-700 rounded-lg p-3 flex items-center gap-2 text-yellow-300">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
      
      {/* Controls Row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Repository selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-400">Repository:</label>
          <select
            value={selectedRepo || ''}
            onChange={(e) => setSelectedRepo(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 min-w-[250px]"
            disabled={repositories.length === 0}
          >
            {repositories.length === 0 ? (
              <option value="">No repositories available</option>
            ) : (
              repositories.map(repo => (
                <option key={repo.id} value={repo.id}>
                  {repo.full_name} ({repo.language || 'unknown'})
                </option>
              ))
            )}
          </select>
        </div>
        
        {/* Days selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-400">Period:</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-200"
          >
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
          </select>
        </div>
        
        {/* GitHub Token */}
        <div className="flex items-center gap-2 flex-1 min-w-[300px]">
          <input
            type="password"
            value={githubTokenInput}
            onChange={(e) => setGithubTokenInput(e.target.value)}
            placeholder="GitHub PAT (optional)"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 text-sm"
          />
          <button
            onClick={handleTokenSave}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm"
          >
            Save Token
          </button>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-700 pb-4 overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>
      
      {/* Visualization content */}
      <div className="bg-slate-800/30 rounded-lg p-6 min-h-[400px]">
        {!selectedRepo || repositories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <BarChart3 className="w-12 h-12 mb-4 opacity-50" />
            <p>No repositories available.</p>
            <p className="text-sm">Add repositories to the benchmark to see visualizations.</p>
          </div>
        ) : (
          <>
            {activeTab === 'dependency' && (
              <DependencyGraph
                repositoryId={selectedRepo}
                githubToken={githubToken}
                apiUrl={API_URL}
              />
            )}
            
            {activeTab === 'network' && (
              <ContributorNetwork
                repositoryId={selectedRepo}
                githubToken={githubToken}
                apiUrl={API_URL}
              />
            )}
            
            {activeTab === 'heatmap' && (
              <CodeHeatmap
                repositoryId={selectedRepo}
                days={days}
                apiUrl={API_URL}
              />
            )}
            
            {activeTab === 'timeline' && (
              <InteractiveTimeline
                repositoryId={selectedRepo}
                days={days}
                apiUrl={API_URL}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
