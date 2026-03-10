'use client';

import {
  Treemap as RechartsTreemap,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface TreeMapData {
  name: string;
  size?: number;
  value?: number;
  children?: TreeMapData[];
}

interface TreemapWrapperProps {
  data: TreeMapData[];
  height?: number;
  colors?: string[];
}

const DEFAULT_COLORS = [
  '#22c55e', '#eab308', '#ef4444', '#3b82f6', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

export default function TreemapWrapper({
  data,
  height = 300,
}: TreemapWrapperProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsTreemap
        data={data}
        dataKey="size"
        aspectRatio={4 / 3}
        stroke="#fff"
        fill="#8884d8"
      >
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
          }}
        />
      </RechartsTreemap>
    </ResponsiveContainer>
  );
}
