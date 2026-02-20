'use client';

import { useState, useEffect } from 'react';
import { Users, FileText, Zap, DollarSign, AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Clock, Activity } from 'lucide-react';
import TrendAnalysis from '@/components/TrendAnalysis';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface DashboardMetrics {
  period: { startDate: string; days: number };
  generations: { total: number; successful: number; successRate: string; avgLatency: number };
  users: { active: number; repositories: number };
  feedback: { total: number; positive: number; negative: number; positiveRate: string };
  tokens: { total: number; cost: number };
  workflows: { total: number; successful: number; failed: number };
  trend: { date: string; generations: number; users: number }[];
}

interface Alert {
  type: string;
  severity: 'warning' | 'critical' | 'success' | 'info';
  message: string;
  value: string;
}

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    fetchData();
  }, [days]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [metricsRes, alertsRes] = await Promise.all([
        fetch(`${API_URL}/api/analytics/dashboard?days=${days}`),
        fetch(`${API_URL}/api/analytics/alerts`)
      ]);
      
      const metricsData = await metricsRes.json();
      const alertsData = await alertsRes.json();
      
      if (metricsData.success) {
        setMetrics(metricsData.metrics);
      }
      if (alertsData.success) {
        setAlerts(alertsData.alerts);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatCurrency = (num: number) => {
    return '$' + num.toFixed(2);
  };

  const getAlertColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-900/30 border-red-700 text-red-300';
      case 'warning': return 'bg-yellow-900/30 border-yellow-700 text-yellow-300';
      case 'success': return 'bg-green-900/30 border-green-700 text-green-300';
      default: return 'bg-blue-900/30 border-blue-700 text-blue-300';
    }
  };

  const getAlertIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle size={16} />;
      case 'warning': return <AlertTriangle size={16} />;
      case 'success': return <CheckCircle size={16} />;
      default: return <Activity size={16} />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics Dashboard</h1>
          <p className="text-muted-foreground">Monitor system performance, usage, and costs</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="px-4 py-2 bg-card border border-border rounded-lg text-foreground"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Active Users</p>
              <p className="text-2xl font-bold text-foreground">{metrics?.users.active || 0}</p>
            </div>
            <div className="p-3 bg-blue-900/50 rounded-lg">
              <Users className="w-6 h-6 text-blue-400" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{metrics?.users.repositories || 0} repositories</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Generations</p>
              <p className="text-2xl font-bold text-foreground">{formatNumber(metrics?.generations.total || 0)}</p>
            </div>
            <div className="p-3 bg-purple-900/50 rounded-lg">
              <FileText className="w-6 h-6 text-purple-400" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {metrics?.generations.successRate}% success rate
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Token Usage</p>
              <p className="text-2xl font-bold text-foreground">{formatNumber(metrics?.tokens.total || 0)}</p>
            </div>
            <div className="p-3 bg-green-900/50 rounded-lg">
              <Zap className="w-6 h-6 text-green-400" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Avg latency: {metrics?.generations.avgLatency}ms</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Cost</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(metrics?.tokens.cost || 0)}</p>
            </div>
            <div className="p-3 bg-yellow-900/50 rounded-lg">
              <DollarSign className="w-6 h-6 text-yellow-400" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {metrics?.workflows.total || 0} workflow runs
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Generation Trend */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Generation Trend</h3>
          <div className="h-48 flex items-end gap-2">
            {metrics?.trend.slice(0, 14).reverse().map((day, i) => {
              const max = Math.max(...(metrics?.trend || []).map(t => t.generations), 1);
              const height = (day.generations / max) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div 
                    className="w-full bg-blue-600 rounded-t hover:bg-blue-500 transition-colors"
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${day.generations} generations`}
                  ></div>
                  <span className="text-xs text-muted-foreground mt-1">
                    {new Date(day.date).getDate()}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>Older</span>
            <span>Recent</span>
          </div>
        </div>

        {/* Feedback Distribution */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Feedback Distribution</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Positive</span>
                <span className="font-medium text-green-400">{metrics?.feedback.positiveRate || 0}%</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${metrics?.feedback.positiveRate || 0}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Neutral/No Feedback</span>
                <span className="font-medium text-gray-400">
                  {100 - (parseFloat(metrics?.feedback.positiveRate || '0')) - (metrics?.feedback.negative ? 0 : 0)}%
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gray-500 rounded-full"
                  style={{ width: `${Math.max(0, 100 - (parseFloat(metrics?.feedback.positiveRate || '0')) - (metrics?.feedback.negative ? 0 : 0))}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Negative</span>
                <span className="font-medium text-red-400">
                  {metrics?.feedback.negative || 0}
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-red-500 rounded-full"
                  style={{ width: `${(metrics?.feedback.negative || 0) / Math.max(metrics?.feedback.total || 1, 1) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Total feedback: {metrics?.feedback.total || 0} responses
          </p>
        </div>
      </div>

      {/* Workflows and Performance Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Workflow Stats */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Workflow Executions</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold text-foreground">{metrics?.workflows.total || 0}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
            <div className="text-center p-4 bg-green-900/30 rounded-lg">
              <p className="text-2xl font-bold text-green-400">{metrics?.workflows.successful || 0}</p>
              <p className="text-sm text-muted-foreground">Successful</p>
            </div>
            <div className="text-center p-4 bg-red-900/30 rounded-lg">
              <p className="text-2xl font-bold text-red-400">{metrics?.workflows.failed || 0}</p>
              <p className="text-sm text-muted-foreground">Failed</p>
            </div>
          </div>
        </div>

        {/* Generation Stats */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Generation Performance</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Success Rate</span>
              <span className="font-semibold text-green-400">{metrics?.generations.successRate || 0}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Average Latency</span>
              <span className="font-semibold text-foreground">{metrics?.generations.avgLatency || 0}ms</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Cost per 1K tokens</span>
              <span className="font-semibold text-foreground">~0.003</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts Section */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Active Alerts</h3>
        {alerts.length > 0 ? (
          <div className="space-y-3">
            {alerts.map((alert, i) => (
              <div 
                key={i}
                className={`flex items-center gap-3 p-4 rounded-lg border ${getAlertColor(alert.severity)}`}
              >
                {getAlertIcon(alert.severity)}
                <span className="font-medium">{alert.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 text-muted-foreground">
            <CheckCircle size={20} />
            <span>No active alerts - system is healthy</span>
          </div>
        )}
      </div>

      {/* Trend Analysis Section */}
      <div className="bg-card border border-border rounded-xl p-6">
        <TrendAnalysis />
      </div>
    </div>
  );
}
