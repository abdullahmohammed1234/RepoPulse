/**
 * Feedback API utilities
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface FeedbackSubmission {
  generationId: string; // UUID
  rating: boolean;
  ratingScore?: number;
  reasonCategory?: string;
  reasonDetails?: string;
  sectionFeedback?: SectionFeedback[];
  modelUsed?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

export interface SectionFeedback {
  section: string;
  position?: number;
  rating?: boolean;
  score?: number;
  issueType?: string;
  issueDescription?: string;
  severity?: string;
  suggestedImprovement?: string;
}

export interface FeedbackResponse {
  success: boolean;
  feedback: {
    id: number;
    rating: boolean;
    ratingScore?: number;
    reasonCategory?: string;
    createdAt: string;
  };
}

export interface FeedbackAnalytics {
  total_feedback: number;
  positive_count: number;
  negative_count: number;
  avg_rating_score: number;
  total_edit_distance: number;
  avg_edit_distance: number;
  total_edits: number;
}

export interface FeedbackTrend {
  date: string;
  feedback_count: number;
  positive_count: number;
  negative_count: number;
  avg_rating_score: number;
}

/**
 * Submit feedback for a generation
 */
export async function submitFeedback(data: FeedbackSubmission): Promise<FeedbackResponse> {
  const response = await fetch(`${API_URL}/api/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to submit feedback');
  }

  return response.json();
}

/**
 * Record user edit to generated content
 */
export async function recordEdit(
  generationId: number,
  originalContent: string,
  editedContent: string,
  metadata?: {
    modelUsed?: string;
    tokensUsed?: number;
    latencyMs?: number;
  }
): Promise<{ success: boolean; edit: { editDistance: number; editTokenCount: number } }> {
  const response = await fetch(`${API_URL}/api/feedback/${generationId}/edit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      originalContent,
      editedContent,
      ...metadata,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to record edit');
  }

  return response.json();
}

/**
 * Get feedback analytics
 */
export async function getFeedbackAnalytics(
  days: number = 30
): Promise<{ analytics: FeedbackAnalytics; period: { start: string; end: string } }> {
  const response = await fetch(`${API_URL}/api/feedback/analytics/summary?days=${days}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch analytics');
  }

  return response.json();
}

/**
 * Get feedback trends
 */
export async function getFeedbackTrends(days: number = 30): Promise<{ trends: FeedbackTrend[]; days: number }> {
  const response = await fetch(`${API_URL}/api/feedback/analytics/trends?days=${days}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch trends');
  }

  return response.json();
}

/**
 * Get feedback constants (reason categories, issue types, etc.)
 */
export async function getFeedbackConstants(): Promise<{
  REASON_CATEGORIES: Record<string, string>;
  ISSUE_TYPES: Record<string, string>;
  SEVERITY: Record<string, string>;
}> {
  const response = await fetch(`${API_URL}/api/feedback/constants`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch constants');
  }

  return response.json();
}

/**
 * Get feedback dashboard data
 */
export async function getFeedbackDashboard(): Promise<any> {
  const response = await fetch(`${API_URL}/api/feedback/dashboard`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch dashboard');
  }

  return response.json();
}
