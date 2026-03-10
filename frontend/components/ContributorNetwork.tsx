'use client';

import { useEffect, useRef, useState } from 'react';
import { Users, GitPullRequest, Loader2 } from 'lucide-react';

interface ContributorNode {
  id: string;
  name: string;
  avatar?: string;
  contributions: number;
  size: number;
}

interface ContributorLink {
  source: string;
  target: string;
  strength: number;
}

interface ContributorNetworkProps {
  repositoryId: number;
  githubToken?: string;
  apiUrl?: string;
}

export default function ContributorNetwork({
  repositoryId,
  githubToken = '',
  apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
}: ContributorNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<{ nodes: ContributorNode[]; links: ContributorLink[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedContributor, setSelectedContributor] = useState<ContributorNode | null>(null);
  const [hoveredContributor, setHoveredContributor] = useState<string | null>(null);

  useEffect(() => {
    fetchContributorData();
  }, [repositoryId, githubToken]);

  useEffect(() => {
    if (data && canvasRef.current) {
      renderNetwork();
    }
  }, [data, selectedContributor, hoveredContributor]);

  const fetchContributorData = async () => {
    // If no GitHub token is provided, show message asking for one
    if (!githubToken) {
      setLoading(false);
      setError('A GitHub Personal Access Token is required to view contributor data.');
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
        `${apiUrl}/api/analytics/contributor-network/${repositoryId}`,
        { headers }
      );
      
      const result = await response.json();
      
      if (result.success) {
        setData(result.network);
      } else {
        setError(result.error || 'Failed to load contributor data');
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
    const contributors = [
      { id: 'alex-dev', name: 'alex-dev', contributions: 156, avatar: '' },
      { id: 'sarah-coder', name: 'sarah-coder', contributions: 98, avatar: '' },
      { id: 'mike-repo', name: 'mike-repo', contributions: 87, avatar: '' },
      { id: 'emma-code', name: 'emma-code', contributions: 72, avatar: '' },
      { id: 'john-pr', name: 'john-pr', contributions: 65, avatar: '' },
      { id: 'lisa-git', name: 'lisa-git', contributions: 54, avatar: '' },
      { id: 'tom-build', name: 'tom-build', contributions: 43, avatar: '' },
      { id: 'anna-test', name: 'anna-test', contributions: 38, avatar: '' },
    ];
    
    const nodes: ContributorNode[] = contributors.map(c => ({
      ...c,
      size: 10 + Math.log(c.contributions + 1) * 6
    }));
    
    const links: ContributorLink[] = [
      { source: 'alex-dev', target: 'sarah-coder', strength: 0.8 },
      { source: 'alex-dev', target: 'mike-repo', strength: 0.6 },
      { source: 'sarah-coder', target: 'emma-code', strength: 0.7 },
      { source: 'mike-repo', target: 'john-pr', strength: 0.5 },
      { source: 'emma-code', target: 'lisa-git', strength: 0.9 },
      { source: 'john-pr', target: 'tom-build', strength: 0.4 },
      { source: 'lisa-git', target: 'anna-test', strength: 0.6 },
      { source: 'tom-build', target: 'alex-dev', strength: 0.3 },
      { source: 'anna-test', target: 'sarah-coder', strength: 0.5 },
    ];
    
    return { nodes, links };
  };

  const renderNetwork = () => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      canvas.width = rect.width;
      canvas.height = 400;
    }

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Position nodes in a circular layout with some randomness
    const nodePositions = new Map<string, { x: number; y: number }>();
    
    data.nodes.forEach((node, i) => {
      const angle = (i / data.nodes.length) * 2 * Math.PI;
      const radius = 100 + Math.random() * 60;
      nodePositions.set(node.id, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      });
    });

    // Draw links
    data.links.forEach(link => {
      const source = nodePositions.get(link.source);
      const target = nodePositions.get(link.target);
      
      if (source && target) {
        const isHighlighted = 
          hoveredContributor === link.source || 
          hoveredContributor === link.target;
        
        ctx.strokeStyle = isHighlighted ? '#f59e0b' : 'rgba(100, 116, 139, 0.4)';
        ctx.lineWidth = isHighlighted ? 2 : link.strength * 2;
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }
    });

    // Draw nodes
    data.nodes.forEach(node => {
      const pos = nodePositions.get(node.id);
      if (!pos) return;

      const isSelected = selectedContributor?.id === node.id;
      const isHovered = hoveredContributor === node.id;
      const radius = node.size;

      // Glow effect for selected/hovered
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius + 8, 0, 2 * Math.PI);
        const gradient = ctx.createRadialGradient(pos.x, pos.y, radius, pos.x, pos.y, radius + 8);
        gradient.addColorStop(0, 'rgba(245, 158, 11, 0.4)');
        gradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
      
      if (isSelected) {
        ctx.fillStyle = '#f59e0b';
      } else if (isHovered) {
        ctx.fillStyle = '#fbbf24';
      } else {
        // Color based on contributions
        const hue = (node.contributions / 200) * 120 + 180;
        ctx.fillStyle = `hsl(${hue}, 60%, 50%)`;
      }
      ctx.fill();
      
      ctx.strokeStyle = isSelected ? '#fbbf24' : '#1e293b';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Avatar or initials
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.max(8, radius * 0.5)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const initials = node.name.slice(0, 2).toUpperCase();
      ctx.fillText(initials, pos.x, pos.y);
    });

    // Store positions for click detection
    (canvas as any).nodePositions = nodePositions;
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const nodePositions = (canvas as any).nodePositions as Map<string, { x: number; y: number }>;
    
    const clickedNode = data.nodes.find(node => {
      const pos = nodePositions.get(node.id);
      if (!pos) return false;
      const dx = pos.x - x;
      const dy = pos.y - y;
      return Math.sqrt(dx * dx + dy * dy) < node.size;
    });

    setSelectedContributor(clickedNode || null);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const nodePositions = (canvas as any).nodePositions as Map<string, { x: number; y: number }>;
    
    const hoveredNode = data.nodes.find(node => {
      const pos = nodePositions.get(node.id);
      if (!pos) return false;
      const dx = pos.x - x;
      const dy = pos.y - y;
      return Math.sqrt(dx * dx + dy * dy) < node.size;
    });

    setHoveredContributor(hoveredNode?.id || null);
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
        <Users className="w-5 h-5" />
        Contributor Network
      </div>
      
      {!githubToken ? (
        <div className="flex flex-col items-center justify-center h-64 bg-slate-900 rounded-lg text-center">
          <Users className="w-12 h-12 text-slate-500 mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">GitHub PAT Required</h3>
          <p className="text-slate-400 max-w-md">
            A GitHub Personal Access Token is required to view contributor data. 
            Please enter your GitHub PAT in the token field above to access this visualization.
          </p>
        </div>
      ) : data ? (
        <div className="relative bg-slate-900 rounded-lg overflow-hidden">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={() => setHoveredContributor(null)}
            className="w-full h-[400px] cursor-pointer"
          />
          
          {/* Legend */}
          <div className="absolute top-4 left-4 bg-slate-800/80 rounded p-3 text-sm">
            <div className="text-slate-400 mb-2">Contributor Activity</div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-cyan-400" />
              <span className="text-slate-300">High (100+)</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-slate-300">Medium (50-99)</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span className="text-slate-300">&lt;50</span>
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
          <Users className="w-12 h-12 text-slate-500 mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">Unable to Load Contributors</h3>
          <p className="text-slate-400 max-w-md">
            {error || 'Could not load contributor data. Please check your GitHub token and try again.'}
          </p>
        </div>
      )}
      
      {/* Selected contributor details */}
      {selectedContributor && data && (
        <div className="bg-slate-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
              {selectedContributor.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h4 className="font-medium text-slate-200">{selectedContributor.name}</h4>
              <p className="text-sm text-slate-400">
                {selectedContributor.contributions} contributions
              </p>
            </div>
          </div>
        </div>
      )}
      
      {data && (
        <div className="text-sm text-slate-400">
          {data.nodes.length} contributors • {data.links.length} collaborations • Hover to highlight
        </div>
      )}
    </div>
  );
}
