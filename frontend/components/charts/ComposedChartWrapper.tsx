'use client';

import {
  ComposedChart as RechartsComposedChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DataPoint {
  name: string;
  [key: string]: string | number;
}

interface ComposedChartWrapperProps {
  data: DataPoint[];
  dataKeys: { key: string; color: string; type: 'line' | 'bar' | 'area'; name?: string }[];
  xAxisKey?: string;
  height?: number;
}

export default function ComposedChartWrapper({
  data,
  dataKeys,
  xAxisKey = 'name',
  height = 300,
}: ComposedChartWrapperProps) {
  const renderChartElement = (dk: typeof dataKeys[0]) => {
    switch (dk.type) {
      case 'line':
        return (
          <Line
            key={dk.key}
            type="monotone"
            dataKey={dk.key}
            name={dk.name || dk.key}
            stroke={dk.color}
            strokeWidth={2}
          />
        );
      case 'bar':
        return (
          <Bar
            key={dk.key}
            dataKey={dk.key}
            name={dk.name || dk.key}
            fill={dk.color}
            radius={[4, 4, 0, 0]}
          />
        );
      case 'area':
        return (
          <Area
            key={dk.key}
            type="monotone"
            dataKey={dk.key}
            name={dk.name || dk.key}
            stroke={dk.color}
            fill={dk.color}
            fillOpacity={0.6}
          />
        );
      default:
        return null;
    }
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsComposedChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey={xAxisKey} className="text-xs fill-muted-foreground" />
        <YAxis className="text-xs fill-muted-foreground" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
          }}
        />
        <Legend />
        {dataKeys.map(renderChartElement)}
      </RechartsComposedChart>
    </ResponsiveContainer>
  );
}
