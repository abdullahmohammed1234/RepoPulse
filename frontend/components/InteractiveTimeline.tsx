'use client';

import { useEffect, useState } from 'react';
import { 
  Clock, 
  GitPullRequest, 
  Sparkles, 
  ThumbsUp, 
  ThumbsDown,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';

interface TimelineEvent {
  id: number;
  type: 'pull_request' | 'generation' | 'feedback';
  title?: string;
  prNumber?: number;
  state?: string;
  merged?: boolean;
  riskScore?: number;
  mergeTimeHours?: number;
  status?: string;
  model?: string;
  latencyMs?: number;
  rating?: boolean;
  score?: number;
  category?: string;
  timestamp: string;
  endTimestamp?: string;
}

interface TimelineDay {
  date: string;
  events: TimelineEvent[];
  summary: {
    prs: number;
    generations: number;
    feedback: number;
  };
}

interface TimelineData {
  events: TimelineEvent[];
  timeline: TimelineDay[];
  metadata: {
    totalEvents: number;
    period: { days: number; startDate: string };
    generatedAt: string;
  };
}

interface InteractiveTimelineProps {
  repositoryId: number;
  days?: number;
  apiUrl?: string;
}

export default function InteractiveTimeline({
  repositoryId,
  days = 90,
  apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
}: InteractiveTimelineProps) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<TimelineDay | null>(null);
  const [zoomLevel, setZoomLevel] = useState<'week' | 'month' | 'quarter'>('month');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    fetchTimelineData();
  }, [repositoryId, days]);

  const fetchTimelineData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `${apiUrl}/api/analytics/timeline/${repositoryId}?days=${days}`
      );
      
      const result = await response.json();
      
      if (result.success) {
        setData(result.timeline);
      } else {
        setError(result.error || 'Failed to load timeline data');
        setData(generateDemoData());
      }
    } catch (err) {
      setError('Failed to connect to server');
      setData(generateDemoData());
    } finally {
      setLoading(false);
    }
  };

  const generateDemoData = (): TimelineData => {
    const events: TimelineEvent[] = [];
    const timeline: TimelineDay[] = [];
    
    // Generate events for the past 30 days
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayEvents: TimelineEvent[] = [];
      
      // Random PR events
      const numPRs = Math.floor(Math.random() * 3);
      for (let j = 0; j < numPRs; j++) {
        dayEvents.push({
          id: i * 10 + j,
          type: 'pull_request',
          title: `Feature implementation #${100 + i}`,
          prNumber: 100 + i,
          state: Math.random() > 0.3 ? 'merged' : 'open',
          merged: Math.random() > 0.3,
          riskScore: Math.random() * 0.8,
          mergeTimeHours: Math.random() * 48 + 1,
          timestamp: date.toISOString()
        });
      }
      
      // Random generation events
      const numGens = Math.floor(Math.random() * 5);
      for (let j = 0; j < numGens; j++) {
        dayEvents.push({
          id: i * 10 + numPRs + j,
          type: 'generation',
          status: Math.random() > 0.1 ? 'success' : 'failed',
          model: ['gpt-4', 'claude-3', 'gemini-pro'][Math.floor(Math.random() * 3)],
          latencyMs: Math.floor(Math.random() * 5000) + 500,
          timestamp: date.toISOString()
        });
      }
      
      // Random feedback events
      const numFeedback = Math.floor(Math.random() * 3);
      for (let j = 0; j < numFeedback; j++) {
        dayEvents.push({
          id: i * 10 + numPRs + numGens + j,
          type: 'feedback',
          rating: Math.random() > 0.4,
          score: Math.floor(Math.random() * 10) + 1,
          category: ['accuracy', 'style', 'completeness'][Math.floor(Math.random() * 3)],
          timestamp: date.toISOString()
        });
      }
      
      timeline.push({
        date: dateStr,
        events: dayEvents,
        summary: {
          prs: numPRs,
          generations: numGens,
          feedback: numFeedback
        }
      });
      
      events.push(...dayEvents);
    }
    
    return {
      events,
      timeline,
      metadata: {
        totalEvents: events.length,
        period: { days, startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() },
        generatedAt: new Date().toISOString()
      }
    };
  };

  const getFilteredTimeline = () => {
    if (!data) return [];
    
    switch (zoomLevel) {
      case 'week':
        return data.timeline.slice(0, 7);
      case 'month':
        return data.timeline.slice(0, 30);
      case 'quarter':
        return data.timeline;
      default:
        return data.timeline;
    }
  };

  const getChartData = () => {
    const filtered = getFilteredTimeline();
    return filtered.map(day => ({
      date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      prs: day.summary.prs,
      generations: day.summary.generations,
      feedback: day.summary.feedback,
      total: day.summary.prs + day.summary.generations + day.summary.feedback
    })).reverse();
  };

  const navigateTimeline = (direction: 'prev' | 'next') => {
    const maxIndex = Math.max(0, getFilteredTimeline().length - 5);
    if (direction === 'prev') {
      setCurrentIndex(Math.max(0, currentIndex - 5));
    } else {
      setCurrentIndex(Math.min(maxIndex, currentIndex + 5));
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'pull_request':
        return <GitPullRequest className="w-4 h-4 text-blue-400" />;
      case 'generation':
        return <Sparkles className="w-4 h-4 text-purple-400" />;
      case 'feedback':
        return <ThumbsUp className="w-4 h-4 text-green-400" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-900 rounded-lg">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold text-slate-200">
          <Clock className="w-5 h-5 text-blue-500" />
          Interactive Timeline
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoomLevel('week')}
            className={`px-3 py-1 rounded text-sm ${
              zoomLevel === 'week' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setZoomLevel('month')}
            className={`px-3 py-1 rounded text-sm ${
              zoomLevel === 'month' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setZoomLevel('quarter')}
            className={`px-3 py-1 rounded text-sm ${
              zoomLevel === 'quarter' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            Quarter
          </button>
        </div>
      </div>
      
      {error && (
        <div className="bg-yellow-900/50 text-yellow-300 px-3 py-2 rounded text-sm">
          Showing demo data: {error}
        </div>
      )}
      
      {/* Chart */}
      <div className="bg-slate-900 rounded-lg p-4 h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={getChartData()}>
            <defs>
              <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
              dataKey="date" 
              stroke="#94a3b8" 
              fontSize={10}
              interval="preserveStartEnd"
            />
            <YAxis stroke="#94a3b8" fontSize={10} />
            <Tooltip
              contentStyle={{ 
                backgroundColor: '#1e293b', 
                border: '1px solid #334155',
                borderRadius: '8px'
              }}
              labelStyle={{ color: '#e2e8f0' }}
            />
            <Area 
              type="monotone" 
              dataKey="total" 
              stroke="#3b82f6" 
              fillOpacity={1} 
              fill="url(#colorTotal)" 
              name="Total Events"
            />
            <Line 
              type="monotone" 
              dataKey="prs" 
              stroke="#22d3ee" 
              strokeWidth={2}
              dot={false}
              name="PRs"
            />
            <Line 
              type="monotone" 
              dataKey="generations" 
              stroke="#a855f7" 
              strokeWidth={2}
              dot={false}
              name="Generations"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigateTimeline('prev')}
          disabled={currentIndex === 0}
          className="flex items-center gap-1 px-3 py-2 bg-slate-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>
        
        <div className="text-sm text-slate-400">
          {data?.metadata.totalEvents || 0} events in {days} days
        </div>
        
        <button
          onClick={() => navigateTimeline('next')}
          disabled={currentIndex >= getFilteredTimeline().length - 5}
          className="flex items-center gap-1 px-3 py-2 bg-slate-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      
      {/* Event list */}
      <div className="bg-slate-900 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
        {getFilteredTimeline().slice(currentIndex, currentIndex + 5).map((day, idx) => (
          <div 
            key={day.date} 
            className={`border-b border-slate-800 cursor-pointer hover:bg-slate-800/50 ${
              selectedDay?.date === day.date ? 'bg-slate-800' : ''
            }`}
            onClick={() => setSelectedDay(selectedDay?.date === day.date ? null : day)}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-4">
                <span className="text-slate-200 font-medium">
                  {new Date(day.date).toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </span>
                <div className="flex items-center gap-3 text-sm">
                  <span className="flex items-center gap-1 text-cyan-400">
                    <GitPullRequest className="w-3 h-3" />
                    {day.summary.prs}
                  </span>
                  <span className="flex items-center gap-1 text-purple-400">
                    <Sparkles className="w-3 h-3" />
                    {day.summary.generations}
                  </span>
                  <span className="flex items-center gap-1 text-green-400">
                    <ThumbsUp className="w-3 h-3" />
                    {day.summary.feedback}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Expanded event details */}
            {selectedDay?.date === day.date && (
              <div className="bg-slate-950 px-4 pb-3">
                {day.events.slice(0, 10).map((event, eIdx) => (
                  <div 
                    key={eIdx} 
                    className="flex items-center gap-3 py-2 text-sm border-t border-slate-800"
                  >
                    {getEventIcon(event.type)}
                    <span className="text-slate-300 flex-1 truncate">
                      {event.type === 'pull_request' && event.title}
                      {event.type === 'generation' && `${event.status} (${event.model})`}
                      {event.type === 'feedback' && `${event.rating ? 'Positive' : 'Negative'} feedback`}
                    </span>
                    <span className="text-slate-500 text-xs">
                      {new Date(event.timestamp).toLocaleTimeString('en-US', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>
                ))}
                {day.events.length > 10 && (
                  <div className="text-sm text-slate-500 py-2">
                    +{day.events.length - 10} more events
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-sm text-slate-400">
        <span className="flex items-center gap-2">
          <GitPullRequest className="w-4 h-4 text-cyan-400" />
          Pull Requests
        </span>
        <span className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          Generations
        </span>
        <span className="flex items-center gap-2">
          <ThumbsUp className="w-4 h-4 text-green-400" />
          Feedback
        </span>
      </div>
    </div>
  );
}
