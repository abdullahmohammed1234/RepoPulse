'use client';

import { useState, useEffect } from 'react';
import { 
  Github, ArrowLeft, Clock, AlertTriangle, 
  TrendingDown, FileCode, Users, Activity
} from 'lucide-react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Simulation {
  id: string;
  repository_id: number;
  lines_added: number;
  lines_deleted: number;
  files_changed: number;
  commits_count: number;
  risk_score: number;
  risk_level: string;
  risk_reduction_estimate: {
    potential_reduction: number;
    reduction_percent: string;
    message: string;
  };
  created_at: string;
}

interface Repository {
  id: number;
  name: string;
  full_name: string;
}

export default function SimulationsHistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch repositories that have simulations
  useEffect(() => {
    const fetchRepositories = async () => {
      try {
        const response = await fetch(`${API_URL}/api/repository`);
        const data = await response.json();
        
        if (Array.isArray(data)) {
          setRepositories(data);
          if (data.length > 0) {
            setSelectedRepo(data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch repositories:', err);
      }
    };
    fetchRepositories();
  }, []);

  // Fetch simulations when repository is selected
  useEffect(() => {
    if (!selectedRepo) return;

    const fetchSimulations = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${API_URL}/api/repository/${selectedRepo}/simulations?userId=00000000-0000-0000-0000-000000000001`
        );
        const data = await response.json();
        
        setSimulations(data.simulations || []);
        setError(null);
      } catch (err) {
        setError('Failed to load simulation history');
        console.error('Failed to fetch simulations:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSimulations();
  }, [selectedRepo]);

  const getRiskColor = (riskScore: number) => {
    if (riskScore > 0.7) return 'text-red-500';
    if (riskScore > 0.4) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getRiskBgColor = (riskScore: number) => {
    if (riskScore > 0.7) return 'bg-red-500/10 border-red-500/20';
    if (riskScore > 0.4) return 'bg-yellow-500/10 border-yellow-500/20';
    return 'bg-green-500/10 border-green-500/20';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Simulation History</h1>
              <p className="text-muted-foreground">View past PR risk simulations</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Repository Selector */}
        {repositories.length > 0 && (
          <div className="mb-6">
            <label className="text-sm font-medium mb-2 block">Select Repository</label>
            <select
              value={selectedRepo || ''}
              onChange={(e) => setSelectedRepo(Number(e.target.value))}
              className="w-full max-w-md px-4 py-2 rounded-lg border border-border bg-background"
            >
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.full_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Activity className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500">
            {error}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && simulations.length === 0 && (
          <div className="text-center py-12">
            <TrendingDown className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Simulations Yet</h3>
            <p className="text-muted-foreground mb-4">
              Run a simulation from the home page to see it here.
            </p>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              Go to Home
            </button>
          </div>
        )}

        {/* Simulations List */}
        {!loading && !error && simulations.length > 0 && (
          <div className="space-y-4">
            {simulations.map((sim) => (
              <div
                key={sim.id}
                className={`p-4 rounded-lg border ${getRiskBgColor(sim.risk_score)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                      <span className={`font-bold text-lg ${getRiskColor(sim.risk_score)}`}>
                        {Math.round(sim.risk_score * 100)}% Risk
                      </span>
                      <span className="text-sm text-muted-foreground capitalize">
                        {sim.risk_level}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <FileCode className="h-4 w-4 text-muted-foreground" />
                        <span>+{sim.lines_added} -{sim.lines_deleted} lines</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileCode className="h-4 w-4 text-muted-foreground" />
                        <span>{sim.files_changed} files</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span>{sim.commits_count} commits</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{formatDate(sim.created_at)}</span>
                      </div>
                    </div>

                    {sim.risk_reduction_estimate && (
                      <div className="mt-3 p-3 bg-card rounded-md">
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingDown className="h-4 w-4 text-blue-500" />
                          <span className="font-medium">Risk Reduction Estimate</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {sim.risk_reduction_estimate.message}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
