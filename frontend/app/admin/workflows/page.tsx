'use client';

import { useState, useEffect } from 'react';
import { Play, Plus, FileText, Calendar, Mail, ListChecks, BookOpen, X, Clock, CheckCircle, XCircle, ArrowRight } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  config?: Record<string, unknown>;
  position?: { x: number; y: number };
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: WorkflowNode[];
  edges: { source: string; target: string }[];
  entry_node_id: string;
  is_template: boolean;
  is_active: boolean;
  execution_count: number;
  success_count: number;
  failure_count: number;
  created_at: string;
}

interface WorkflowExecution {
  id: string;
  workflow_id: string;
  workflow_name?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

interface WorkflowStats {
  total_executions: number;
  completed: number;
  failed: number;
  avg_duration_ms: number | null;
  last_execution: string | null;
}

const NODE_ICONS: Record<string, React.ElementType> = {
  input: FileText,
  generate_task_list: ListChecks,
  generate_action_plan: ArrowRight,
  generate_content_calendar: Calendar,
  generate_email_series: Mail,
  generate_document: BookOpen,
  output: FileText,
  filter: FileText,
  merge: FileText,
  transform: FileText
};

const CATEGORY_COLORS: Record<string, string> = {
  productivity: 'bg-blue-900 text-blue-200',
  planning: 'bg-purple-900 text-purple-200',
  marketing: 'bg-green-900 text-green-200',
  custom: 'bg-gray-700 text-gray-300'
};

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<Workflow[]>([]);
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'templates' | 'executions'>('templates');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [inputText, setInputText] = useState('');
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<WorkflowExecution | null>(null);
  const [stats, setStats] = useState<WorkflowStats | null>(null);
  const [initializing, setInitializing] = useState(false);

  useEffect(() => {
    fetchWorkflows();
    fetchExecutions();
  }, []);

  const fetchWorkflows = async () => {
    try {
      const res = await fetch(`${API_URL}/api/workflows?includeTemplates=true`);
      const data = await res.json();
      if (data.success) {
        const parsed = data.workflows.map((w: Workflow) => ({
          ...w,
          nodes: typeof w.nodes === 'string' ? JSON.parse(w.nodes) : w.nodes,
          edges: typeof w.edges === 'string' ? JSON.parse(w.edges) : w.edges
        }));
        setWorkflows(parsed.filter((w: Workflow) => !w.is_template));
        setTemplates(parsed.filter((w: Workflow) => w.is_template));
      }
    } catch (err) {
      console.error('Failed to fetch workflows:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchExecutions = async () => {
    try {
      const res = await fetch(`${API_URL}/api/workflows/executions/all?limit=50`);
      const data = await res.json();
      if (data.success) {
        const parsed = data.executions.map((e: WorkflowExecution) => ({
          ...e,
          input_data: typeof e.input_data === 'string' ? JSON.parse(e.input_data) : e.input_data,
          output_data: typeof e.output_data === 'string' ? JSON.parse(e.output_data) : e.output_data
        }));
        setExecutions(parsed);
      }
    } catch (err) {
      console.error('Failed to fetch executions:', err);
    }
  };

  const fetchStats = async (workflowId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/workflows/${workflowId}/stats`);
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const executeWorkflow = async () => {
    if (!selectedWorkflow) return;
    
    setExecuting(true);
    setExecutionResult(null);
    
    try {
      const res = await fetch(`${API_URL}/api/workflows/${selectedWorkflow.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_data: { content: inputText } })
      });
      
      const data = await res.json();
      if (data.success) {
        setExecutionResult(data.execution);
        fetchExecutions();
        if (selectedWorkflow.id) {
          fetchStats(selectedWorkflow.id);
        }
      } else {
        console.error('Execution failed:', data.error);
      }
    } catch (err) {
      console.error('Failed to execute workflow:', err);
    } finally {
      setExecuting(false);
    }
  };

  const initializeTemplates = async () => {
    setInitializing(true);
    try {
      const res = await fetch(`${API_URL}/api/workflows/init`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        fetchWorkflows();
      }
    } catch (err) {
      console.error('Failed to initialize templates:', err);
    } finally {
      setInitializing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="flex items-center gap-1 text-green-400"><CheckCircle size={14} /> Completed</span>;
      case 'running':
        return <span className="flex items-center gap-1 text-blue-400"><Clock size={14} /> Running</span>;
      case 'failed':
        return <span className="flex items-center gap-1 text-red-400"><XCircle size={14} /> Failed</span>;
      case 'paused':
        return <span className="flex items-center gap-1 text-yellow-400"><Clock size={14} /> Paused</span>;
      default:
        return <span className="text-gray-400">{status}</span>;
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Workflow Expansion</h1>
          <p className="text-muted-foreground">Transform outputs into task lists, action plans, content calendars, and more</p>
        </div>
        {!loading && templates.length === 0 && (
          <button
            onClick={initializeTemplates}
            disabled={initializing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {initializing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Initializing...
              </>
            ) : (
              <>
                <Plus size={18} />
                Initialize Templates
              </>
            )}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('templates')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'templates'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-500'
            }`}
          >
            Workflow Templates
          </button>
          <button
            onClick={() => setActiveTab('executions')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'executions'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-500'
            }`}
          >
            Execution History
          </button>
        </nav>
      </div>

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((workflow) => {
            const Icon = NODE_ICONS[workflow.nodes[1]?.type] || FileText;
            return (
              <div
                key={workflow.id}
                className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-blue-900/50 rounded-lg">
                    <Icon className="w-6 h-6 text-blue-400" />
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${CATEGORY_COLORS[workflow.category] || CATEGORY_COLORS.custom}`}>
                    {workflow.category}
                  </span>
                </div>
                
                <h3 className="font-semibold text-lg text-foreground mb-2">{workflow.name}</h3>
                <p className="text-muted-foreground text-sm mb-4">{workflow.description}</p>
                
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <span>{workflow.nodes.length} nodes</span>
                  <span>{workflow.edges.length} connections</span>
                </div>
                
                <button
                  onClick={() => {
                    setSelectedWorkflow(workflow);
                    fetchStats(workflow.id);
                    setShowExecuteModal(true);
                  }}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  <Play size={16} />
                  Run Workflow
                </button>
              </div>
            );
          })}
          
          {templates.length === 0 && (
            <div className="col-span-full text-center py-12">
              <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No workflow templates available</p>
              <p className="text-sm text-gray-600">Click "Initialize Templates" to get started</p>
            </div>
          )}
        </div>
      )}

      {/* Executions Tab */}
      {activeTab === 'executions' && (
        <div className="space-y-4">
          {executions.length > 0 ? (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Workflow</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Started</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Duration</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {executions.map((execution) => (
                    <tr key={execution.id} className="hover:bg-muted/50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-foreground">
                          {(execution as any).workflow_name || execution.workflow_id}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(execution.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(execution.started_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {formatDuration(execution.duration_ms)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setExecutionResult(execution);
                            setShowExecuteModal(true);
                          }}
                          className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                        >
                          View Result
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 bg-card border border-border rounded-xl">
              <Clock className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No executions yet</p>
              <p className="text-sm text-gray-600">Run a workflow to see execution history</p>
            </div>
          )}
        </div>
      )}

      {/* Execute Modal */}
      {showExecuteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-xl font-semibold text-foreground">
                {executionResult ? 'Execution Result' : `Run: ${selectedWorkflow?.name}`}
              </h2>
              <button
                onClick={() => {
                  setShowExecuteModal(false);
                  setSelectedWorkflow(null);
                  setExecutionResult(null);
                  setInputText('');
                }}
                className="text-gray-400 hover:text-gray-300"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {!executionResult ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Input Content
                    </label>
                    <textarea
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Enter the content you want to transform..."
                      className="w-full h-40 px-4 py-2 bg-muted border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-foreground"
                    />
                  </div>
                  
                  {selectedWorkflow && stats && (
                    <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-foreground">{stats.total_executions || 0}</div>
                        <div className="text-xs text-muted-foreground">Total Runs</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-400">{stats.completed || 0}</div>
                        <div className="text-xs text-muted-foreground">Successful</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-400">{formatDuration(stats.avg_duration_ms)}</div>
                        <div className="text-xs text-muted-foreground">Avg Time</div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    {getStatusBadge(executionResult.status)}
                  </div>
                  
                  {executionResult.error_message && (
                    <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg">
                      <p className="text-sm text-red-400 font-medium">Error:</p>
                      <p className="text-sm text-red-300">{executionResult.error_message}</p>
                    </div>
                  )}
                  
                  {executionResult.output_data && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">Output:</p>
                      <pre className="p-4 bg-muted border border-border rounded-lg overflow-x-auto text-sm text-foreground">
                        {JSON.stringify(executionResult.output_data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="p-6 border-t border-border bg-muted/50 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowExecuteModal(false);
                  setSelectedWorkflow(null);
                  setExecutionResult(null);
                  setInputText('');
                }}
                className="px-4 py-2 text-foreground hover:bg-muted rounded-lg"
              >
                Close
              </button>
              
              {!executionResult && (
                <button
                  onClick={executeWorkflow}
                  disabled={executing || !inputText.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {executing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Executing...
                    </>
                  ) : (
                    <>
                      <Play size={16} />
                      Execute
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
