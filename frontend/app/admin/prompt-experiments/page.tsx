'use client';

import { useState, useEffect } from 'react';
import { Plus, Play, Square, Trophy, RotateCcw, BarChart3, Settings } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface PromptVersion {
  id: string;
  prompt_type: string;
  version: string;
  system_prompt: string;
  user_prompt_template: string;
  description: string;
  is_active: boolean;
  is_control: boolean;
  is_winner: boolean;
  traffic_allocation: number;
  status: 'draft' | 'running' | 'completed' | 'archived';
  total_samples: number;
  completion_rate: number | null;
  avg_feedback_score: number | null;
  avg_latency_ms: number | null;
  created_at: string;
}

interface Metrics {
  current: {
    total_samples: number;
    completion_rate: number | null;
    avg_feedback_score: number | null;
    avg_latency_ms: number | null;
    edit_frequency: number | null;
    regenerate_rate: number | null;
  };
  total_assignments: number;
}

export default function PromptExperimentsPage() {
  const [experiments, setExperiments] = useState<PromptVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExperiment, setSelectedExperiment] = useState<PromptVersion | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newExperiment, setNewExperiment] = useState({
    prompt_type: 'summary',
    version: '',
    system_prompt: '',
    user_prompt_template: '',
    description: '',
    traffic_allocation: 50,
    is_control: false
  });

  useEffect(() => {
    fetchExperiments();
  }, []);

  const fetchExperiments = async () => {
    try {
      const res = await fetch(`${API_URL}/api/prompt-experiments`);
      const data = await res.json();
      if (data.success) {
        setExperiments(data.data);
        // Update selected experiment if it exists in the new list
        if (selectedExperiment) {
          const updated = data.data.find((e: PromptVersion) => e.id === selectedExperiment.id);
          if (updated) {
            setSelectedExperiment(updated);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch experiments:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMetrics = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/prompt-experiments/${id}/metrics`);
      const data = await res.json();
      if (data.success) {
        setMetrics(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    }
  };

  const handleSelectExperiment = async (exp: PromptVersion) => {
    setSelectedExperiment(exp);
    await fetchMetrics(exp.id);
  };

  const startExperiment = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/prompt-experiments/${id}/start`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        // Refresh the experiments list
        await fetchExperiments();
        // Also refresh metrics if this is the selected experiment
        if (selectedExperiment?.id === id) {
          setSelectedExperiment(prev => prev ? { ...prev, status: 'running' } : null);
          await fetchMetrics(id);
        }
      }
    } catch (err) {
      console.error('Failed to start experiment:', err);
    }
  };

  const stopExperiment = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/prompt-experiments/${id}/stop`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        // Refresh the experiments list
        await fetchExperiments();
        // Also refresh metrics if this is the selected experiment
        if (selectedExperiment?.id === id) {
          setSelectedExperiment(prev => prev ? { ...prev, status: 'completed' } : null);
          await fetchMetrics(id);
        }
      }
    } catch (err) {
      console.error('Failed to stop experiment:', err);
    }
  };

  const selectWinner = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/prompt-experiments/${id}/select-winner`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        // Refresh the experiments list
        await fetchExperiments();
        // Also refresh metrics if this is the selected experiment
        if (selectedExperiment?.id === id) {
          await fetchMetrics(id);
        }
        alert(`Winner selected! ${data.data.winner?.version}`);
      } else {
        alert(`Not eligible: ${data.data.reason}`);
      }
    } catch (err) {
      console.error('Failed to select winner:', err);
    }
  };

  const createExperiment = async () => {
    try {
      const res = await fetch(`${API_URL}/api/prompt-experiments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newExperiment)
      });
      const data = await res.json();
      if (data.success) {
        fetchExperiments();
        setShowCreateForm(false);
        setNewExperiment({
          prompt_type: 'summary',
          version: '',
          system_prompt: '',
          user_prompt_template: '',
          description: '',
          traffic_allocation: 50,
          is_control: false
        });
      }
    } catch (err) {
      console.error('Failed to create experiment:', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'archived': return 'bg-gray-100 text-gray-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading experiments...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            A/B Prompt Experiments
          </h1>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={20} />
            New Experiment
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Experiments List */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 dark:text-white">Prompt Versions</h2>
            
            {experiments.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">No experiments yet. Create one to get started.</p>
            ) : (
              <div className="space-y-4">
                {experiments.map((exp) => (
                  <div
                    key={exp.id}
                    onClick={() => handleSelectExperiment(exp)}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      selectedExperiment?.id === exp.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold dark:text-white">{exp.prompt_type}</span>
                        <span className="text-gray-500 dark:text-gray-400">v{exp.version}</span>
                        {exp.is_control && (
                          <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded">Control</span>
                        )}
                        {exp.is_winner && (
                          <Trophy size={16} className="text-yellow-500" />
                        )}
                      </div>
                      <span className={`px-2 py-1 text-xs rounded ${getStatusColor(exp.status)}`}>
                        {exp.status}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {exp.description || 'No description'}
                    </p>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <span>Traffic: {exp.traffic_allocation}%</span>
                      <span>Samples: {exp.total_samples}</span>
                      {exp.completion_rate !== null && (
                        <span>Completion: {(exp.completion_rate * 100).toFixed(1)}%</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Experiment Details */}
          <div className="space-y-6">
            {selectedExperiment ? (
              <>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h2 className="text-xl font-semibold mb-4 dark:text-white">
                    {selectedExperiment.prompt_type} v{selectedExperiment.version}
                  </h2>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        System Prompt
                      </label>
                      <textarea
                        readOnly
                        value={selectedExperiment.system_prompt}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg bg-gray-50"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        User Prompt Template
                      </label>
                      <textarea
                        readOnly
                        value={selectedExperiment.user_prompt_template}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg bg-gray-50"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 mt-6">
                    {(selectedExperiment.status === 'draft' || selectedExperiment.status === 'archived') && (
                      <button
                        onClick={() => startExperiment(selectedExperiment.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 cursor-pointer"
                      >
                        <Play size={16} />
                        Start Experiment
                      </button>
                    )}
                    {selectedExperiment.status === 'running' && (
                      <button
                        onClick={() => stopExperiment(selectedExperiment.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer"
                      >
                        <Square size={16} />
                        Stop
                      </button>
                    )}
                    {selectedExperiment.status === 'completed' && !selectedExperiment.is_winner && (
                      <button
                        onClick={() => selectWinner(selectedExperiment.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 cursor-pointer"
                      >
                        <Trophy size={16} />
                        Select as Winner
                      </button>
                    )}
                    {selectedExperiment.is_winner && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg">
                        <Trophy size={16} />
                        Winner!
                      </div>
                    )}
                  </div>
                </div>

                {/* Metrics */}
                {metrics && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold mb-4 dark:text-white flex items-center gap-2">
                      <BarChart3 size={20} />
                      Metrics
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="text-2xl font-bold dark:text-white">{metrics.current.total_samples}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Total Samples</div>
                      </div>
                      
                      <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="text-2xl font-bold dark:text-white">{metrics.total_assignments}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Assignments</div>
                      </div>
                      
                      <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="text-2xl font-bold dark:text-white">
                          {metrics.current.completion_rate ? (metrics.current.completion_rate * 100).toFixed(1) : 'N/A'}%
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Completion Rate</div>
                      </div>
                      
                      <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="text-2xl font-bold dark:text-white">
                          {metrics.current.avg_feedback_score?.toFixed(1) || 'N/A'}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Avg Feedback Score</div>
                      </div>
                      
                      <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="text-2xl font-bold dark:text-white">
                          {metrics.current.avg_latency_ms ? `${Math.round(metrics.current.avg_latency_ms)}ms` : 'N/A'}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Avg Latency</div>
                      </div>
                      
                      <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="text-2xl font-bold dark:text-white">
                          {metrics.current.edit_frequency ? (metrics.current.edit_frequency * 100).toFixed(1) : 'N/A'}%
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Edit Frequency</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <p className="text-gray-500 dark:text-gray-400 text-center">
                  Select an experiment to view details
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Create Form Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-6 dark:text-white">Create New Experiment</h2>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Prompt Type
                      </label>
                      <select
                        value={newExperiment.prompt_type}
                        onChange={(e) => setNewExperiment({ ...newExperiment, prompt_type: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                      >
                        <option value="summary">Summary</option>
                        <option value="analysis">Analysis</option>
                        <option value="risk_assessment">Risk Assessment</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Version
                      </label>
                      <input
                        type="text"
                        value={newExperiment.version}
                        onChange={(e) => setNewExperiment({ ...newExperiment, version: e.target.value })}
                        placeholder="1.0.0"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      System Prompt
                    </label>
                    <textarea
                      value={newExperiment.system_prompt}
                      onChange={(e) => setNewExperiment({ ...newExperiment, system_prompt: e.target.value })}
                      rows={3}
                      placeholder="You are a helpful AI assistant..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      User Prompt Template
                    </label>
                    <textarea
                      value={newExperiment.user_prompt_template}
                      onChange={(e) => setNewExperiment({ ...newExperiment, user_prompt_template: e.target.value })}
                      rows={2}
                      placeholder="Provide a summary of {repo_name}..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={newExperiment.description}
                      onChange={(e) => setNewExperiment({ ...newExperiment, description: e.target.value })}
                      placeholder="What's different in this version?"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Traffic Allocation (%)
                      </label>
                      <input
                        type="number"
                        value={newExperiment.traffic_allocation}
                        onChange={(e) => setNewExperiment({ ...newExperiment, traffic_allocation: parseInt(e.target.value) })}
                        min={0}
                        max={100}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                      />
                    </div>
                    
                    <div className="flex items-center mt-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newExperiment.is_control}
                          onChange={(e) => setNewExperiment({ ...newExperiment, is_control: e.target.checked })}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        <span className="text-gray-700 dark:text-gray-300">Control version</span>
                      </label>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={createExperiment}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Create Experiment
                  </button>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
