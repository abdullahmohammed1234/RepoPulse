'use client';

import CodeQualityMetrics from '@/components/CodeQualityMetrics';

export default function CodeQualityPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Code Quality Metrics</h1>
          <p className="text-muted-foreground">Analyze cyclomatic complexity, technical debt, code coverage, and integrate with ESLint/SonarQube</p>
        </div>
      </div>

      <CodeQualityMetrics />
    </div>
  );
}
