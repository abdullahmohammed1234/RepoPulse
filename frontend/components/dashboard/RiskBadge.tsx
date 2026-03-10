interface RiskBadgeProps {
  score: number;
}

export function RiskBadge({ score }: RiskBadgeProps) {
  let color = 'bg-green-500';
  let label = 'Low';
  
  if (score > 0.7) {
    color = 'bg-red-500';
    label = 'High';
  } else if (score > 0.4) {
    color = 'bg-yellow-500';
    label = 'Medium';
  }
  
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${color} text-white`}>
      {label} ({(score * 100).toFixed(0)}%)
    </span>
  );
}
