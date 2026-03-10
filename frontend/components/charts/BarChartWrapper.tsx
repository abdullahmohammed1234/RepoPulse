'use client';

import {
  BarChart as RechartsBarChart,
  Bar,
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

interface BarChartWrapperProps {
  data: DataPoint[];
  dataKeys: { key: string; color: string; name?: string }[];
  xAxisKey?: string;
  layout?: 'horizontal' | 'vertical';
  height?: number;
}

export default function BarChartWrapper({
  data,
  dataKeys,
  xAxisKey = 'name',
  layout = 'horizontal',
  height = 300,
}: BarChartWrapperProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        layout={layout}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        {layout === 'horizontal' ? (
          <XAxis dataKey={xAxisKey} className="text-xs fill-muted-foreground" />
        ) : (
          <YAxis className="text-xs fill-muted-foreground" />
        )}
        {layout === 'horizontal' ? (
          <YAxis className="text-xs fill-muted-foreground" />
        ) : (
          <XAxis dataKey={xAxisKey} type="number" className="text-xs fill-muted-foreground" />
        )}
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
          }}
        />
        <Legend />
        {dataKeys.map((dk) => (
          <Bar
            key={dk.key}
            dataKey={dk.key}
            name={dk.name || dk.key}
            fill={dk.color}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
