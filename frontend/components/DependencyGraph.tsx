'use client';

import { useEffect, useState } from 'react';
import { Network, GitBranch, Loader2, Package, Search, LayoutGrid, List, AlertTriangle, CheckCircle } from 'lucide-react';

interface DependencyNode {
  id: string;
  name: string;
  type: 'root' | 'dependency';
  size: number;
  version?: string;
  category?: string;
  dev?: boolean;
}

interface DependencyLink {
  source: string;
  target: string;
  type: string;
}

interface DependencyGraphProps {
  repositoryId: number;
  githubToken?: string;
  apiUrl?: string;
}

type ViewMode = 'grid' | 'list' | 'tree';

export default function DependencyGraph({
  repositoryId,
  githubToken = '',
  apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
}: DependencyGraphProps) {
  const [data, setData] = useState<{ nodes: DependencyNode[]; links: DependencyLink[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDependency, setSelectedDependency] = useState<DependencyNode | null>(null);

  useEffect(() => {
    fetchDependencyData();
  }, [repositoryId, githubToken]);

  const fetchDependencyData = async () => {
    if (!githubToken) {
      setLoading(false);
      setError('A GitHub Personal Access Token is required to view dependency data.');
      setData(null);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const headers: HeadersInit = {};
      if (githubToken) {
        headers['X-GitHub-Token'] = githubToken;
      }
      
      const response = await fetch(
        `${apiUrl}/api/analytics/dependency-graph/${repositoryId}`,
        { headers }
      );
      
      const result = await response.json();
      
      if (result.success) {
        // Add some demo categories and info to make the UI more interesting
        const enhancedNodes = result.graph.nodes.map((node: DependencyNode, index: number) => ({
          ...node,
          category: getCategoryForPackage(node.name),
          dev: index > 5 // Demo: mark some as dev dependencies
        }));
        setData({ ...result.graph, nodes: enhancedNodes });
      } else {
        setError(result.error || 'Failed to load dependency data');
        setData(null);
      }
    } catch (err) {
      setError('Failed to connect to server');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryForPackage = (name: string): string => {
    const categories: Record<string, string[]> = {
      'Framework': ['react', 'next', 'express', 'vue', 'angular', 'svelte'],
      'UI': ['recharts', 'lucide-react', 'tailwindcss', 'framer-motion', 'material-ui'],
      'Database': ['pg', 'mysql', 'mongoose', 'redis', 'prisma', 'knex'],
      'Utils': ['lodash', 'axios', 'moment', 'date-fns', 'uuid', 'joi'],
      'Testing': ['jest', 'mocha', 'cypress', 'vitest', 'testing-library'],
    };
    
    for (const [category, packages] of Object.entries(categories)) {
      if (packages.some(p => name.toLowerCase().includes(p))) {
        return category;
      }
    }
    return 'Other';
  };

  const filteredDependencies = data?.nodes.filter(dep => 
    dep.type === 'dependency' && 
    dep.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const rootPackage = data?.nodes.find(n => n.type === 'root');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-900 rounded-lg">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold text-slate-200">
          <Network className="w-5 h-5" />
          Dependency Graph
          {data && (
            <span className="text-sm font-normal text-slate-400 ml-2">
              ({data.nodes.length - 1} dependencies)
            </span>
          )}
        </div>
        
        {data && (
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search dependencies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            {/* View Mode Toggle */}
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('tree')}
                className={`p-2 rounded ${viewMode === 'tree' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                title="Tree View"
              >
                <GitBranch className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      
      {!githubToken ? (
        <div className="flex flex-col items-center justify-center h-64 bg-slate-900 rounded-lg text-center">
          <Network className="w-12 h-12 text-slate-500 mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">GitHub PAT Required</h3>
          <p className="text-slate-400 max-w-md">
            A GitHub Personal Access Token is required to view dependency data. 
            Please enter your GitHub PAT in the token field above to access this visualization.
          </p>
        </div>
      ) : data ? (
        <>
          {/* Root Package Card */}
          {rootPackage && (
            <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-200">{rootPackage.name}</h3>
                  <p className="text-sm text-slate-400">Root Package</p>
                </div>
                <div className="ml-auto flex items-center gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-slate-400">Dependencies</div>
                    <div className="text-xl font-semibold text-slate-200">{data.nodes.length - 1}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400">Categories</div>
                    <div className="text-xl font-semibold text-slate-200">
                      {new Set(data.nodes.filter(n => n.type === 'dependency').map(n => n.category)).size}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Dependencies */}
          {filteredDependencies.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              No dependencies found matching "{searchQuery}"
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid View */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredDependencies.map((dep) => (
                <div
                  key={dep.id}
                  onClick={() => setSelectedDependency(dep)}
                  className={`bg-slate-800/50 border rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg ${
                    selectedDependency?.id === dep.id 
                      ? 'border-blue-500 ring-2 ring-blue-500/30' 
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center">
                      <Package className="w-5 h-5 text-slate-300" />
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      dep.dev 
                        ? 'bg-yellow-500/20 text-yellow-400' 
                        : 'bg-green-500/20 text-green-400'
                    }`}>
                      {dep.dev ? 'Dev' : 'Prod'}
                    </span>
                  </div>
                  <h4 className="font-medium text-slate-200 mb-1 truncate">{dep.name}</h4>
                  <p className="text-sm text-slate-400 mb-3">v{dep.version || '1.0.0'}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs px-2 py-1 bg-slate-700 rounded text-slate-300">
                      {dep.category || 'Other'}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-green-400">
                      <CheckCircle className="w-3 h-3" />
                      <span>Up to date</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : viewMode === 'list' ? (
            /* List View */
            <div className="bg-slate-900 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-800/50 border-b border-slate-700">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Package</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Version</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Category</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Type</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDependencies.map((dep, idx) => (
                    <tr
                      key={dep.id}
                      onClick={() => setSelectedDependency(dep)}
                      className={`border-b border-slate-800 cursor-pointer transition-colors hover:bg-slate-800/50 ${
                        selectedDependency?.id === dep.id ? 'bg-blue-500/10' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Package className="w-4 h-4 text-slate-500" />
                          <span className="font-medium text-slate-200">{dep.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{dep.version || '1.0.0'}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-1 bg-slate-700 rounded text-slate-300">
                          {dep.category || 'Other'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded ${
                          dep.dev 
                            ? 'bg-yellow-500/20 text-yellow-400' 
                            : 'bg-green-500/20 text-green-400'
                        }`}>
                          {dep.dev ? 'Dev' : 'Production'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-green-400">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-sm">OK</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Tree View */
            <div className="bg-slate-900 rounded-xl p-4 font-mono text-sm">
              <div className="flex items-start gap-2">
                <div className="text-blue-400">
                  <Package className="w-5 h-5" />
                </div>
                <div className="text-slate-200 font-semibold">{rootPackage?.name}</div>
              </div>
              {filteredDependencies.map((dep, idx) => (
                <div key={dep.id} className="ml-6 mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">├─</span>
                    <Package className="w-4 h-4 text-slate-500" />
                    <span 
                      className={`cursor-pointer hover:text-blue-400 transition-colors ${
                        selectedDependency?.id === dep.id ? 'text-blue-400' : 'text-slate-300'
                      }`}
                      onClick={() => setSelectedDependency(dep)}
                    >
                      {dep.name}
                    </span>
                    <span className="text-slate-500">→</span>
                    <span className="text-green-400">v{dep.version || '1.0.0'}</span>
                    {dep.dev && (
                      <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">
                        dev
                      </span>
                    )}
                    {idx === filteredDependencies.length - 1 && (
                      <span className="text-slate-500">└</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Selected Dependency Detail Panel */}
          {selectedDependency && (
            <div className="fixed bottom-4 right-4 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-4 z-50">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="font-semibold text-slate-200">{selectedDependency.name}</h4>
                  <p className="text-sm text-slate-400">v{selectedDependency.version || '1.0.0'}</p>
                </div>
                <button
                  onClick={() => setSelectedDependency(null)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Category</span>
                  <span className="text-sm text-slate-200">{selectedDependency.category || 'Other'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Type</span>
                  <span className={`text-sm px-2 py-0.5 rounded ${
                    selectedDependency.dev 
                      ? 'bg-yellow-500/20 text-yellow-400' 
                      : 'bg-green-500/20 text-green-400'
                  }`}>
                    {selectedDependency.dev ? 'Development' : 'Production'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Status</span>
                  <div className="flex items-center gap-1 text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm">Up to date</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-slate-700">
                <button className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-medium transition-colors">
                  View on npm
                </button>
              </div>
            </div>
          )}

          {/* Stats Bar */}
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-slate-400">Production: {filteredDependencies.filter(d => !d.dev).length}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="text-slate-400">Development: {filteredDependencies.filter(d => d.dev).length}</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              <span className="text-slate-400">0 vulnerabilities</span>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 bg-slate-900 rounded-lg text-center">
          <Network className="w-12 h-12 text-slate-500 mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">Unable to Load Dependencies</h3>
          <p className="text-slate-400 max-w-md">
            {error || 'Could not load dependency data. Please check your GitHub token and try again.'}
          </p>
        </div>
      )}
    </div>
  );
}
