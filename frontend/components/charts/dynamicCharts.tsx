'use client';

import dynamic from 'next/dynamic';

// Loading component for chart placeholders
function ChartLoading() {
  return (
    <div className="flex items-center justify-center h-[300px] bg-muted/30 rounded-lg animate-pulse">
      <div className="text-muted-foreground text-sm">Loading chart...</div>
    </div>
  );
}

// Dynamic imports for charts - code splitting
// These components are loaded on-demand to reduce initial bundle size

// Bar Chart with dynamic import
export const BarChart = dynamic(
  () => import('./BarChartWrapper').then((mod) => mod.default),
  { 
    ssr: false,
    loading: () => <ChartLoading />
  }
);

// Line Chart with dynamic import
export const LineChart = dynamic(
  () => import('./LineChartWrapper').then((mod) => mod.default),
  { 
    ssr: false,
    loading: () => <ChartLoading />
  }
);

// Pie Chart with dynamic import
export const PieChart = dynamic(
  () => import('./PieChartWrapper').then((mod) => mod.default),
  { 
    ssr: false,
    loading: () => <ChartLoading />
  }
);

// Area Chart with dynamic import
export const AreaChart = dynamic(
  () => import('./AreaChartWrapper').then((mod) => mod.default),
  { 
    ssr: false,
    loading: () => <ChartLoading />
  }
);

// Composed Chart with dynamic import
export const ComposedChart = dynamic(
  () => import('./ComposedChartWrapper').then((mod) => mod.default),
  { 
    ssr: false,
    loading: () => <ChartLoading />
  }
);

// Radar Chart with dynamic import
export const RadarChart = dynamic(
  () => import('./RadarChartWrapper').then((mod) => mod.default),
  { 
    ssr: false,
    loading: () => <ChartLoading />
  }
);

// Scatter Chart with dynamic import
export const ScatterChart = dynamic(
  () => import('./ScatterChartWrapper').then((mod) => mod.default),
  { 
    ssr: false,
    loading: () => <ChartLoading />
  }
);

// Treemap with dynamic import
export const Treemap = dynamic(
  () => import('./TreemapWrapper').then((mod) => mod.default),
  { 
    ssr: false,
    loading: () => <ChartLoading />
  }
);
