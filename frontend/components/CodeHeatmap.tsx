'use client';

import { useEffect, useState } from 'react';
import { Flame, FileCode, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { 
  Treemap, 
  ResponsiveContainer,
  Tooltip
} from 'recharts';

interface FileData {
  file: string;
  path: string;
  changes: number;
  language: string;
  lastModified?: string;
}

interface DirectoryData {
  directory: string;
  files: FileData[];
  totalChanges: number;
}

interface HeatmapData {
  files: FileData[];
  directories: DirectoryData[];
  metadata: {
    totalFiles: number;
    period: { days: number; startDate: string };
    generatedAt: string;
  };
}

interface CodeHeatmapProps {
  repositoryId: number;
  days?: number;
  apiUrl?: string;
}

const languageColors: Record<string, string> = {
  javascript: '#f7df1e',
  typescript: '#3178c6',
  python: '#3572A5',
  java: '#b07219',
  go: '#00ADD8',
  rust: '#dea584',
  ruby: '#701516',
  php: '#4F5D95',
  csharp: '#178600',
  cpp: '#f34b7d',
  html: '#e34c26',
  css: '#563d7c',
  json: '#292929',
  yaml: '#cb171e',
  markdown: '#083fa1',
  sql: '#e38c00',
  shell: '#89e051',
  unknown: '#6b7280'
};

export default function CodeHeatmap({
  repositoryId,
  days = 90,
  apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
}: CodeHeatmapProps) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [viewMode, setViewMode] = useState<'treemap' | 'list'>('treemap');

  useEffect(() => {
    fetchHeatmapData();
  }, [repositoryId, days]);

  const fetchHeatmapData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `${apiUrl}/api/analytics/code-heatmap/${repositoryId}?days=${days}`
      );
      
      const result = await response.json();
      
      if (result.success) {
        setData(result.heatmap);
      } else {
        setError(result.error || 'Failed to load heatmap data');
        setData(generateDemoData());
      }
    } catch (err) {
      setError('Failed to connect to server');
      setData(generateDemoData());
    } finally {
      setLoading(false);
    }
  };

  const generateDemoData = (): HeatmapData => {
    const files: FileData[] = [
      { file: 'src/index.ts', path: 'src/index.ts', changes: 45, language: 'typescript' },
      { file: 'src/services/analytics.ts', path: 'src/services/analytics.ts', changes: 38, language: 'typescript' },
      { file: 'src/routes/api.ts', path: 'src/routes/api.ts', changes: 32, language: 'typescript' },
      { file: 'frontend/components/Chart.tsx', path: 'frontend/components/Chart.tsx', changes: 28, language: 'typescript' },
      { file: 'frontend/lib/utils.ts', path: 'frontend/lib/utils.ts', changes: 24, language: 'typescript' },
      { file: 'package.json', path: 'package.json', changes: 18, language: 'json' },
      { file: 'src/config/db.ts', path: 'src/config/db.ts', changes: 15, language: 'typescript' },
      { file: 'README.md', path: 'README.md', changes: 12, language: 'markdown' },
      { file: '.gitignore', path: '.gitignore', changes: 8, language: 'unknown' },
      { file: 'src/middleware/auth.ts', path: 'src/middleware/auth.ts', changes: 7, language: 'typescript' },
    ];
    
    const directories: DirectoryData[] = [
      { directory: 'src', files: files.filter(f => f.path.startsWith('src/')), totalChanges: 137 },
      { directory: 'frontend', files: files.filter(f => f.path.startsWith('frontend/')), totalChanges: 52 },
      { directory: 'root', files: files.filter(f => !f.path.includes('/')), totalChanges: 20 },
    ];
    
    return {
      files,
      directories,
      metadata: {
        totalFiles: files.length,
        period: { days, startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() },
        generatedAt: new Date().toISOString()
      }
    };
  };

  const toggleDir = (dir: string) => {
    const newExpanded = new Set(expandedDirs);
    if (newExpanded.has(dir)) {
      newExpanded.delete(dir);
    } else {
      newExpanded.add(dir);
    }
    setExpandedDirs(newExpanded);
  };

  const getTreemapData = () => {
    if (!data) return [];
    
    return data.directories.map(dir => ({
      name: dir.directory,
      size: dir.totalChanges,
      files: dir.files
    }));
  };

  // Custom treemap content using simple rectangles
  const CustomTreemapContent = (props: any) => {
    const { x, y, width, height, name, size } = props;
    
    if (width < 40 || height < 30) return null;
    
    const color = name === 'src' ? '#3b82f6' : name === 'frontend' ? '#8b5cf6' : '#64748b';
    
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: color,
            stroke: '#1e293b',
            strokeWidth: 2,
            opacity: 0.8
          }}
        />
        {width > 60 && height > 40 && (
          <>
            <text
              x={x + width / 2}
              y={y + height / 2 - 8}
              textAnchor="middle"
              fill="#fff"
              fontSize={12}
              fontWeight="bold"
            >
              {name}
            </text>
            <text
              x={x + width / 2}
              y={y + height / 2 + 8}
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize={10}
            >
              {size} changes
            </text>
          </>
        )}
      </g>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-900 rounded-lg">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold text-slate-200">
          <Flame className="w-5 h-5 text-orange-500" />
          Code Heatmap
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('treemap')}
            className={`px-3 py-1 rounded text-sm ${
              viewMode === 'treemap' 
                ? 'bg-blue-600 text-white' 
                : 'bg-slate-700 text-slate-300'
            }`}
          >
            Treemap
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 rounded text-sm ${
              viewMode === 'list' 
                ? 'bg-blue-600 text-white' 
                : 'bg-slate-700 text-slate-300'
            }`}
          >
            List
          </button>
        </div>
      </div>
      
      {error && (
        <div className="bg-yellow-900/50 text-yellow-300 px-3 py-2 rounded text-sm">
          Showing demo data: {error}
        </div>
      )}
      
      {viewMode === 'treemap' ? (
        <div className="bg-slate-900 rounded-lg p-4 h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={getTreemapData()}
              dataKey="size"
              aspectRatio={4 / 3}
              stroke="#1e293b"
              content={CustomTreemapContent as any}
            >
              <Tooltip
                content={({ payload }) => {
                  if (payload && payload.length > 0) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-800 p-3 rounded shadow-lg">
                        <div className="font-medium text-slate-200">{data.name}</div>
                        <div className="text-sm text-slate-400">{data.size} changes</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {data.files?.length || 0} files
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </Treemap>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="bg-slate-900 rounded-lg overflow-hidden max-h-[350px] overflow-y-auto">
          {data?.directories.map(dir => (
            <div key={dir.directory} className="border-b border-slate-800">
              <button
                onClick={() => toggleDir(dir.directory)}
                className="w-full flex items-center gap-2 px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition-colors"
              >
                {expandedDirs.has(dir.directory) ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
                <FileCode className="w-4 h-4 text-slate-400" />
                <span className="text-slate-200 font-medium flex-1 text-left">
                  {dir.directory}
                </span>
                <span className="text-orange-400 font-mono text-sm">
                  {dir.totalChanges}
                </span>
              </button>
              
              {expandedDirs.has(dir.directory) && (
                <div className="bg-slate-900">
                  {dir.files.map((file, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedFile(file)}
                      className={`w-full flex items-center gap-2 px-6 py-2 hover:bg-slate-800 transition-colors ${
                        selectedFile?.path === file.path ? 'bg-slate-800' : ''
                      }`}
                    >
                      <div 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: languageColors[file.language] || languageColors.unknown }}
                      />
                      <span className="text-slate-300 text-sm flex-1 text-left truncate">
                        {file.file}
                      </span>
                      <span className="text-orange-400 font-mono text-xs">
                        {file.changes}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Selected file details */}
      {selectedFile && (
        <div className="bg-slate-800 rounded-lg p-4">
          <h4 className="font-medium text-slate-200 mb-2">{selectedFile.file}</h4>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <span className="text-slate-400">Changes:</span>{' '}
              <span className="text-orange-400">{selectedFile.changes}</span>
            </div>
            <div>
              <span className="text-slate-400">Language:</span>{' '}
              <span className="text-slate-300 capitalize">{selectedFile.language}</span>
            </div>
            <div>
              <span className="text-slate-400">Path:</span>{' '}
              <span className="text-slate-300">{selectedFile.path}</span>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>{data?.metadata.totalFiles || 0} files changed in {days} days</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" /> High
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-purple-500" /> Medium
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-slate-500" /> Low
          </span>
        </div>
      </div>
    </div>
  );
}
