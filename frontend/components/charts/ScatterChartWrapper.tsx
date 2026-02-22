'use client';

import {
  ScatterChart as RechartsScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ZAxis,
} from 'recharts';

interface DataPoint {
  x: number;
  y: number;
  z?: number;
  name?: string;
}

interface ScatterChartWrapperProps {
  data: DataPoint[];
  dataKeys: { key: string; color: string; name?: string }[];
  height?: number;
}

export default function ScatterChartWrapper({
  data,
  dataKeys,
  height = 300,
}: ScatterChartWrapperProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsScatterChart margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis type="number" dataKey="x" name="X" className="text-xs fill-muted-foreground" />
        <YAxis type="number" dataKey="y" name="Y" className="text-xs fill-muted-foreground" />
        <ZAxis type="number" dataKey="z" range={[50, 400]} name="Size" />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          contentStyle={{
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
          }}
        />
        <Legend />
        {dataKeys.map((dk, index) => (
          <Scatter
            key={dk.key}
            name={dk.name || dk.key}
            data={data}
            fill={dk.color}
          />
        ))}
      </RechartsScatterChart>
    </ResponsiveContainer>
  );
}
