'use client';

import { useState, useEffect } from 'react';
import { 
  configureWebhook, 
  deleteWebhookConfig, 
  getWebhookEvents, 
  getWebhookStats,
  createEventTrigger,
  getEventTriggers,
  listWebhookConfigs,
  WebhookConfig,
  WebhookEvent,
  WebhookStats,
  EventTrigger 
} from '@/lib/api';

export default function WebhooksPage() {
  const [configs, setConfigs] = useState<WebhookConfig[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<number | null>(null);
  const [manualRepoId, setManualRepoId] = useState<string>('');
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [stats, setStats] = useState<WebhookStats[]>([]);
  const [triggers, setTriggers] = useState<EventTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'configs' | 'events' | 'triggers'>('configs');
  const [formMessage, setFormMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  // Form state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['push', 'pull_request', 'issues']);
  const [webhookSecret, setWebhookSecret] = useState('');
  const [isConfiguring, setIsConfiguring] = useState(false);
  
  // Trigger form state
  const [triggerEventType, setTriggerEventType] = useState('*');
  const [triggerAction, setTriggerAction] = useState('analyze_pr');
  const [triggerConfig, setTriggerConfig] = useState('{}');

  const availableEvents = [
    'push',
    'pull_request',
    'issues',
    'pull_request_review',
    'pull_request_review_comment',
    'check_run',
    'check_suite',
    'create',
    'delete',
    '*'
  ];

  const triggerActions = [
    { value: 'analyze_pr', label: 'Analyze PR' },
    { value: 'analyze_on_merge', label: 'Analyze on Merge' },
    { value: 'alert_on_failures', label: 'Alert on Failures' },
    { value: 'update_metrics', label: 'Update Metrics' },
  ];

  useEffect(() => {
    loadConfigs();
  }, []);

  useEffect(() => {
    if (selectedRepo) {
      loadRepoData(selectedRepo);
    }
  }, [selectedRepo]);

  async function loadConfigs() {
    try {
      setLoading(true);
      const result = await listWebhookConfigs();
      setConfigs(result.configs);
      if (result.configs.length > 0 && !selectedRepo) {
        setSelectedRepo(result.configs[0].repositoryId);
      }
    } catch (error) {
      console.error('Failed to load webhook configs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadRepoData(repoId: number) {
    try {
      const [eventsResult, statsResult, triggersResult] = await Promise.all([
        getWebhookEvents(repoId, 20),
        getWebhookStats(repoId, 7),
        getEventTriggers(repoId)
      ]);
      setEvents(eventsResult.events);
      setStats(statsResult.stats);
      setTriggers(triggersResult.triggers);
    } catch (error) {
      console.error('Failed to load repo data:', error);
    }
  }

  async function handleConfigureWebhook() {
    // Use manual repo ID if provided, otherwise use selected repo
    const repoId = manualRepoId ? parseInt(manualRepoId) : selectedRepo;
    if (!repoId || !webhookUrl) return;
    
    try {
      setIsConfiguring(true);
      setFormMessage(null);
      await configureWebhook(repoId, webhookUrl, selectedEvents, webhookSecret || undefined);
      await loadConfigs();
      setWebhookUrl('');
      setWebhookSecret('');
      setManualRepoId('');
      setFormMessage({type: 'success', text: 'Webhook configured successfully!'});
    } catch (error) {
      console.error('Failed to configure webhook:', error);
      setFormMessage({type: 'error', text: 'Failed to configure webhook'});
    } finally {
      setIsConfiguring(false);
    }
  }

  async function handleDeleteWebhook(repoId: number) {
    if (!confirm('Are you sure you want to delete this webhook configuration?')) return;
    
    try {
      await deleteWebhookConfig(repoId);
      await loadConfigs();
      if (selectedRepo === repoId) {
        setSelectedRepo(configs.find(c => c.repositoryId !== repoId)?.repositoryId || null);
      }
    } catch (error) {
      console.error('Failed to delete webhook:', error);
    }
  }

  async function handleCreateTrigger() {
    if (!selectedRepo) return;
    
    try {
      let config = {};
      try {
        config = JSON.parse(triggerConfig);
      } catch {
        alert('Invalid JSON config');
        return;
      }
      
      await createEventTrigger(selectedRepo, triggerEventType, triggerAction, config);
      await loadRepoData(selectedRepo);
      alert('Event trigger created!');
    } catch (error) {
      console.error('Failed to create trigger:', error);
      alert('Failed to create trigger');
    }
  }

  function toggleEvent(event: string) {
    setSelectedEvents(prev => 
      prev.includes(event) 
        ? prev.filter(e => e !== event)
        : [...prev, event]
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">Webhooks & Realtime</h1>
        <p className="text-gray-400 mt-2">
          Configure GitHub webhooks and auto-trigger analysis for repository events
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-700 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('configs')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'configs'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-500'
            }`}
          >
            Webhook Configurations
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'events'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-500'
            }`}
          >
            Event Log
          </button>
          <button
            onClick={() => setActiveTab('triggers')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'triggers'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-500'
            }`}
          >
            Event Triggers
          </button>
        </nav>
      </div>

      {/* Configs Tab */}
      {activeTab === 'configs' && (
        <div className="space-y-6">
          {/* Configure New Webhook */}
          <div className="bg-gray-800 rounded-lg shadow p-6 border border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-4">Configure Webhook</h2>
            
            {/* Show repo selector if configs exist */}
            {configs.length > 0 ? (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select Repository
                </label>
                <select
                  value={selectedRepo || ''}
                  onChange={(e) => setSelectedRepo(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                >
                  <option value="">Select a repository...</option>
                  {configs.map(config => (
                    <option key={config.id} value={config.repositoryId}>
                      Repository ID: {config.repositoryId}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              /* Show manual entry if no configs */
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Repository ID
                </label>
                <input
                  type="number"
                  value={manualRepoId}
                  onChange={(e) => setManualRepoId(e.target.value)}
                  placeholder="Enter repository ID"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter the ID of the repository you want to configure webhooks for
                </p>
              </div>
            )}

            {/* Form message */}
            {formMessage && (
              <div className={`mb-4 p-3 rounded ${formMessage.type === 'success' ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'}`}>
                {formMessage.text}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Webhook URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://your-server.com/api/webhooks/github/1"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Events to Receive
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableEvents.map(event => (
                    <button
                      key={event}
                      onClick={() => toggleEvent(event)}
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        selectedEvents.includes(event)
                          ? 'bg-blue-900 text-blue-200 border border-blue-600'
                          : 'bg-gray-700 text-gray-300 border border-gray-600'
                      }`}
                    >
                      {event}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Webhook Secret (optional)
                </label>
                <input
                  type="password"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder="Your webhook secret"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400"
                />
              </div>

              <button
                onClick={handleConfigureWebhook}
                disabled={isConfiguring || !webhookUrl || !(selectedRepo || manualRepoId)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConfiguring ? 'Configuring...' : 'Configure Webhook'}
              </button>
            </div>
          </div>

          {/* Active Configurations */}
          <div className="bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">Active Webhooks</h2>
            </div>
            
            {configs.length === 0 ? (
              <div className="p-6 text-gray-400 text-center">
                No webhooks configured yet
              </div>
            ) : (
              <div className="divide-y divide-gray-700">
                {configs.map(config => (
                  <div key={config.id} className="p-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-white">Repository #{config.repositoryId}</h3>
                        <p className="text-sm text-gray-400 mt-1">{config.webhookUrl}</p>
                        <div className="flex gap-2 mt-2">
                          {config.events.map(event => (
                            <span key={event} className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs">
                              {event}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          config.isActive 
                            ? 'bg-green-900 text-green-200' 
                            : 'bg-gray-700 text-gray-300'
                        }`}>
                          {config.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <button
                          onClick={() => handleDeleteWebhook(config.repositoryId)}
                          className="px-3 py-1 text-red-400 border border-red-700 rounded hover:bg-red-900"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Events Tab */}
      {activeTab === 'events' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {stats.map(stat => (
              <div key={stat.eventType} className="bg-gray-800 rounded-lg shadow p-4 border border-gray-700">
                <div className="text-sm text-gray-400">{stat.eventType}</div>
                <div className="text-2xl font-bold text-white mt-1">{stat.total}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Processed: {stat.processed} | Invalid: {stat.invalidSignatures}
                </div>
              </div>
            ))}
          </div>

          {/* Event Log */}
          <div className="bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">Recent Events</h2>
            </div>
            
            {events.length === 0 ? (
              <div className="p-6 text-gray-400 text-center">
                No events received yet
              </div>
            ) : (
              <div className="divide-y divide-gray-700">
                {events.map(event => (
                  <div key={event.id} className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-medium text-white">{event.eventType}</span>
                        {event.eventAction && (
                          <span className="ml-2 px-2 py-0.5 bg-blue-900 text-blue-200 rounded text-xs">
                            {event.eventAction}
                          </span>
                        )}
                        <div className="text-sm text-gray-400 mt-1">
                          {new Date(event.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          event.processed
                            ? 'bg-green-900 text-green-200'
                            : 'bg-yellow-900 text-yellow-200'
                        }`}>
                          {event.processed ? 'Processed' : 'Pending'}
                        </span>
                        {!event.signatureValid && (
                          <span className="px-2 py-1 rounded text-xs bg-red-900 text-red-200">
                            Invalid Signature
                          </span>
                        )}
                      </div>
                    </div>
                    {event.processingError && (
                      <div className="mt-2 text-sm text-red-400">
                        Error: {event.processingError}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Triggers Tab */}
      {activeTab === 'triggers' && (
        <div className="space-y-6">
          {/* Create Trigger */}
          <div className="bg-gray-800 rounded-lg shadow p-6 border border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-4">Create Event Trigger</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Event Type
                </label>
                <select
                  value={triggerEventType}
                  onChange={(e) => setTriggerEventType(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                >
                  {availableEvents.map(event => (
                    <option key={event} value={event}>{event}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Action
                </label>
                <select
                  value={triggerAction}
                  onChange={(e) => setTriggerAction(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                >
                  {triggerActions.map(action => (
                    <option key={action.value} value={action.value}>{action.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Config (JSON)
                </label>
                <input
                  type="text"
                  value={triggerConfig}
                  onChange={(e) => setTriggerConfig(e.target.value)}
                  placeholder='{"pr_actions": ["opened"]}'
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400"
                />
              </div>
            </div>

            <button
              onClick={handleCreateTrigger}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create Trigger
            </button>
          </div>

          {/* Active Triggers */}
          <div className="bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">Active Triggers</h2>
            </div>
            
            {triggers.length === 0 ? (
              <div className="p-6 text-gray-400 text-center">
                No triggers configured yet
              </div>
            ) : (
              <div className="divide-y divide-gray-700">
                {triggers.map(trigger => (
                  <div key={trigger.id} className="p-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{trigger.eventType}</span>
                          <span className="text-gray-500">→</span>
                          <span className="px-2 py-0.5 bg-purple-900 text-purple-200 rounded text-xs">
                            {trigger.triggerAction}
                          </span>
                        </div>
                        <div className="text-sm text-gray-400 mt-1">
                          Triggered {trigger.triggerCount} times
                          {trigger.lastTriggered && ` • Last: ${new Date(trigger.lastTriggered).toLocaleString()}`}
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs ${
                        trigger.isActive
                          ? 'bg-green-900 text-green-200'
                          : 'bg-gray-700 text-gray-300'
                      }`}>
                        {trigger.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
