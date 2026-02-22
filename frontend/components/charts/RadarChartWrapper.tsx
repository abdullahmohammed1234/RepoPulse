'use client';

import {
  RadarChart as RechartsRadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DataPoint {
  subject: string;
  [key: string]: string | number;
}

interface RadarChartWrapperProps {
  data: DataPoint[];
  dataKeys: { key: string; color: string; name?: string }[];
  height?: number;
}

export default function RadarChartWrapper({
  data,
  dataKeys,
  height = 300,
}: RadarChartWrapperProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsRadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
        <PolarGrid className="stroke-muted" />
        <PolarAngleAxis dataKey="subject" className="text-xs fill-muted-foreground" />
        <PolarRadiusAxis angle={30} domain={[0, 100]} className="text-xs fill-muted-foreground" />
        {dataKeys.map((dk) => (
          <Radar
            key={dk.key}
            name={dk.name || dk.key}
            dataKey={dk.key}
            stroke={dk.color}
            fill={dk.color}
            fillOpacity={0.6}
          />
        ))}
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
          }}
        />
        <Legend />
      </RechartsRadarChart>
    </ResponsiveContainer>
  );
}
