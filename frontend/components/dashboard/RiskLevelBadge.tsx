interface RiskLevelBadgeProps {
  level?: string;
}

export function RiskLevelBadge({ level }: RiskLevelBadgeProps) {
  let classes = 'bg-gray-500';
  let label = 'Unknown';
  
  if (level === 'High') {
    classes = 'bg-red-500';
    label = 'High Risk';
  } else if (level === 'Medium') {
    classes = 'bg-yellow-500';
    label = 'Medium Risk';
  } else if (level === 'Low') {
    classes = 'bg-green-500';
    label = 'Low Risk';
  }
  
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${classes} text-white`}>
      {label}
    </span>
  );
}
