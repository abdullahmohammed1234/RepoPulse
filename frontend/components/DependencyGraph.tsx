'use client';

import { useEffect, useRef, useState } from 'react';
import { Network, GitBranch, Loader2 } from 'lucide-react';

interface DependencyNode {
  id: string;
  name: string;
  type: 'root' | 'dependency';
  size: number;
  version?: string;
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

export default function DependencyGraph({
  repositoryId,
  githubToken = '',
  apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
}: DependencyGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<{ nodes: DependencyNode[]; links: DependencyLink[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<DependencyNode | null>(null);

  useEffect(() => {
    fetchDependencyData();
  }, [repositoryId, githubToken]);

  useEffect(() => {
    if (data && canvasRef.current) {
      renderGraph();
    }
  }, [data, selectedNode]);

  const fetchDependencyData = async () => {
    // If no GitHub token is provided, show message asking for one
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
        setData(result.graph);
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

  const generateDemoData = () => {
    const nodes: DependencyNode[] = [
      { id: 'repopulse', name: 'RepoPulse', type: 'root', size: 30 },
      { id: 'react', name: 'react', type: 'dependency', size: 18, version: '^18.2.0' },
      { id: 'next', name: 'next', type: 'dependency', size: 18, version: '14.1.0' },
      { id: 'recharts', name: 'recharts', type: 'dependency', size: 15, version: '^2.12.0' },
      { id: 'lucide-react', name: 'lucide-react', type: 'dependency', size: 14, version: '^0.323.0' },
      { id: 'tailwindcss', name: 'tailwindcss', type: 'dependency', size: 14, version: '^3.4.1' },
      { id: 'express', name: 'express', type: 'dependency', size: 16, version: '^4.18.2' },
      { id: 'pg', name: 'pg', type: 'dependency', size: 14, version: '^8.11.0' },
      { id: 'octokit', name: 'octokit', type: 'dependency', size: 15, version: '^3.1.0' },
    ];
    
    const links: DependencyLink[] = [
      { source: 'repopulse', target: 'react', type: 'depends' },
      { source: 'repopulse', target: 'next', type: 'depends' },
      { source: 'repopulse', target: 'recharts', type: 'depends' },
      { source: 'repopulse', target: 'lucide-react', type: 'depends' },
      { source: 'repopulse', target: 'tailwindcss', type: 'depends' },
      { source: 'repopulse', target: 'express', type: 'depends' },
      { source: 'repopulse', target: 'pg', type: 'depends' },
      { source: 'repopulse', target: 'octokit', type: 'depends' },
    ];
    
    return { nodes, links };
  };

  const renderGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      canvas.width = rect.width;
      canvas.height = 400;
    }

    // Clear canvas
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Simple force-directed layout simulation
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Position nodes in a radial layout
    const nodes = data.nodes.map((node, i) => {
      if (node.type === 'root') {
        return { ...node, x: centerX, y: centerY };
      }
      const angle = (i / (data.nodes.length - 1)) * 2 * Math.PI;
      const radius = 120;
      return {
        ...node,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      };
    });

    // Draw links
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    data.links.forEach(link => {
      const source = nodes.find(n => n.id === link.source);
      const target = nodes.find(n => n.id === link.target);
      if (source && target) {
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }
    });

    // Draw nodes
    nodes.forEach(node => {
      const isSelected = selectedNode?.id === node.id;
      const isRoot = node.type === 'root';
      
      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size, 0, 2 * Math.PI);
      
      if (isRoot) {
        ctx.fillStyle = '#3b82f6';
      } else if (isSelected) {
        ctx.fillStyle = '#f59e0b';
      } else {
        ctx.fillStyle = '#64748b';
      }
      ctx.fill();
      
      // Node border
      ctx.strokeStyle = isSelected ? '#fbbf24' : '#1e293b';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();
      
      // Node label
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `${isRoot ? 14 : 11}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(node.name, node.x, node.y + node.size + 16);
    });
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find clicked node
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    const nodes = data.nodes.map((node, i) => {
      if (node.type === 'root') {
        return { ...node, x: centerX, y: centerY };
      }
      const angle = (i / (data.nodes.length - 1)) * 2 * Math.PI;
      const radius = 120;
      return {
        ...node,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      };
    });

    const clickedNode = nodes.find(node => {
      const dx = node.x - x;
      const dy = node.y - y;
      return Math.sqrt(dx * dx + dy * dy) < node.size;
    });

    setSelectedNode(clickedNode || null);
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
      <div className="flex items-center gap-2 text-lg font-semibold text-slate-200">
        <Network className="w-5 h-5" />
        Dependency Graph
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
        <div className="relative bg-slate-900 rounded-lg overflow-hidden">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className="w-full h-[400px] cursor-pointer"
          />
          
          {/* Legend */}
          <div className="absolute top-4 left-4 bg-slate-800/80 rounded p-3 text-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-slate-300">Root Repository</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-500" />
              <span className="text-slate-300">Dependency</span>
            </div>
          </div>
          
          {error && (
            <div className="absolute bottom-4 left-4 bg-yellow-900/50 text-yellow-300 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 bg-slate-900 rounded-lg text-center">
          <Network className="w-12 h-12 text-slate-500 mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">Unable to Load Dependencies</h3>
          <p className="text-slate-400 max-w-md">
            {error || 'Could not load dependency data. Please check your GitHub token and try again.'}
          </p>
        </div>
      )}
      
      {/* Selected node details */}
      {selectedNode && data && (
        <div className="bg-slate-800 rounded-lg p-4">
          <h4 className="font-medium text-slate-200 mb-2">Selected: {selectedNode.name}</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-slate-400">Type:</span>{' '}
              <span className="text-slate-300 capitalize">{selectedNode.type}</span>
            </div>
            {selectedNode.version && (
              <div>
                <span className="text-slate-400">Version:</span>{' '}
                <span className="text-slate-300">{selectedNode.version}</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {data && (
        <div className="text-sm text-slate-400">
          {data.nodes.length} dependencies • Click nodes for details
        </div>
      )}
    </div>
  );
}
