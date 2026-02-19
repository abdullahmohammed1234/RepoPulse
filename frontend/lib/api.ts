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

// ============================================================================
// Webhook API
// ============================================================================

export interface WebhookConfig {
  id: number;
  repositoryId: number;
  webhookUrl: string;
  events: string[];
  isActive: boolean;
  lastDelivered?: string;
  lastStatus?: string;
}

export interface WebhookEvent {
  id: number;
  eventType: string;
  eventAction?: string;
  deliveryId?: string;
  signatureValid: boolean;
  processed: boolean;
  processingError?: string;
  createdAt: string;
  processedAt?: string;
}

export interface WebhookStats {
  eventType: string;
  total: number;
  processed: number;
  invalidSignatures: number;
  firstEvent: string;
  lastEvent: string;
}

export interface EventTrigger {
  id: number;
  repositoryId: number;
  eventType: string;
  triggerAction: string;
  config: Record<string, unknown>;
  isActive: boolean;
  lastTriggered?: string;
  triggerCount: number;
}

/**
 * Configure webhook for a repository
 */
export async function configureWebhook(
  repositoryId: number,
  webhookUrl: string,
  events: string[] = ['push', 'pull_request', 'issues'],
  secret?: string
): Promise<{ config: WebhookConfig }> {
  const response = await fetch(`${API_URL}/api/webhooks/config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ repositoryId, webhookUrl, events, secret }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to configure webhook');
  }

  return response.json();
}

/**
 * Get webhook configuration for a repository
 */
export async function getWebhookConfig(repositoryId: number): Promise<{ config: WebhookConfig }> {
  const response = await fetch(`${API_URL}/api/webhooks/config/${repositoryId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get webhook config');
  }

  return response.json();
}

/**
 * List all webhook configurations
 */
export async function listWebhookConfigs(): Promise<{ configs: WebhookConfig[] }> {
  const response = await fetch(`${API_URL}/api/webhooks/configs`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to list webhook configs');
  }

  return response.json();
}

/**
 * Delete webhook configuration
 */
export async function deleteWebhookConfig(repositoryId: number): Promise<{ message: string }> {
  const response = await fetch(`${API_URL}/api/webhooks/config/${repositoryId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete webhook config');
  }

  return response.json();
}

// ===========================================
// Team Collaboration API
// ===========================================

// Types
export interface TeamUser {
  id: string;
  uuid: string;
  email: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  role: string;
}

export interface Team {
  id: number;
  uuid: string;
  name: string;
  slug: string;
  description?: string;
  avatar_url?: string;
  owner_id?: string;
  settings: Record<string, unknown>;
  notification_preferences: Record<string, boolean>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  member_role?: string;
}

export interface TeamMember {
  id: string;
  uuid: string;
  email: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  user_role: string;
  team_role: string;
  joined_at: string;
}

export interface WatchlistItem {
  id: number;
  team_id: number;
  repository_id: number;
  added_by?: string;
  watch_settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  name: string;
  full_name: string;
  owner: string;
  url: string;
  language?: string;
  stars: number;
}

export interface Notification {
  id: number;
  uuid: string;
  user_id?: string;
  team_id?: number;
  type: string;
  title: string;
  message?: string;
  data: Record<string, unknown>;
  link?: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
}

export interface PRComment {
  id: number;
  uuid: string;
  pull_request_id: number;
  team_id?: number;
  parent_id?: number;
  author_id?: string;
  content: string;
  is_internal: boolean;
  is_resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
  author_username?: string;
  author_display_name?: string;
  author_avatar?: string;
  resolved_by_username?: string;
  children: PRComment[];
}

// Helper function to get auth headers
function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

// Authentication
export async function registerUser(data: {
  email: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}): Promise<{ user: TeamUser; token: string }> {
  const response = await fetch(`${API_URL}/api/team/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Registration failed');
  }

  const result = await response.json();
  if (result.token && typeof window !== 'undefined') {
    localStorage.setItem('auth_token', result.token);
  }
  return result;
}

export async function loginUser(email: string): Promise<{ user: TeamUser; token: string }> {
  const response = await fetch(`${API_URL}/api/team/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  }

  const result = await response.json();
  if (result.token && typeof window !== 'undefined') {
    localStorage.setItem('auth_token', result.token);
  }
  return result;
}

export async function loginWithGitHub(data: {
  github_id: string;
  github_access_token: string;
  email?: string;
  username?: string;
  avatar_url?: string;
}): Promise<{ user: TeamUser; token: string }> {
  const response = await fetch(`${API_URL}/api/team/auth/github`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'GitHub login failed');
  }

  const result = await response.json();
  if (result.token && typeof window !== 'undefined') {
    localStorage.setItem('auth_token', result.token);
  }
  return result;
}

export async function logoutUser(): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  if (!token) return;

  try {
    await fetch(`${API_URL}/api/team/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  } finally {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }
}

export async function getCurrentUser(): Promise<{ user: TeamUser }> {
  const response = await fetch(`${API_URL}/api/team/auth/me`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get user');
  }

  return response.json();
}

// Teams
export async function getUserTeams(): Promise<{ teams: Team[] }> {
  const response = await fetch(`${API_URL}/api/team/teams`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get teams');
  }

  return response.json();
}

export async function createTeam(data: {
  name: string;
  description?: string;
  avatar_url?: string;
  settings?: Record<string, unknown>;
}): Promise<{ team: Team }> {
  const response = await fetch(`${API_URL}/api/team/teams`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create team');
  }

  return response.json();
}

export async function getTeam(teamId: number): Promise<{
  team: Team;
  members: TeamMember[];
  watchlist: WatchlistItem[];
  highRiskWatches: unknown[];
}> {
  const response = await fetch(`${API_URL}/api/team/teams/${teamId}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get team');
  }

  return response.json();
}

export async function updateTeam(teamId: number, data: Partial<Team>): Promise<{ team: Team }> {
  const response = await fetch(`${API_URL}/api/team/teams/${teamId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update team');
  }

  return response.json();
}

export async function getTeamMembers(teamId: number): Promise<{ members: TeamMember[] }> {
  const response = await fetch(`${API_URL}/api/team/teams/${teamId}/members`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get members');
  }

  return response.json();
}

export async function addTeamMember(
  teamId: number,
  data: { user_id?: string; email?: string; role?: string }
): Promise<{ member: TeamMember }> {
  const response = await fetch(`${API_URL}/api/team/teams/${teamId}/members`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add member');
  }

  return response.json();
}

export async function removeTeamMember(teamId: number, userId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_URL}/api/team/teams/${teamId}/members/${userId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to remove member');
  }

  return response.json();
}

export async function inviteTeamMember(
  teamId: number,
  data: { email: string; role?: string }
): Promise<{ invitation: { invitation_link: string } }> {
  const response = await fetch(`${API_URL}/api/team/teams/${teamId}/invitations`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to invite member');
  }

  return response.json();
}

export async function acceptInvitation(token: string): Promise<{ success: boolean; team_id: number }> {
  const response = await fetch(`${API_URL}/api/team/invitations/${token}/accept`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to accept invitation');
  }

  return response.json();
}

// Watchlist
export async function getTeamWatchlist(teamId: number): Promise<{ watchlist: WatchlistItem[] }> {
  const response = await fetch(`${API_URL}/api/team/teams/${teamId}/watchlist`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get watchlist');
  }

  return response.json();
}

export async function addToWatchlist(
  teamId: number,
  repositoryId: number,
  watchSettings?: Record<string, unknown>
): Promise<{ watchlist: WatchlistItem }> {
  const response = await fetch(`${API_URL}/api/team/teams/${teamId}/watchlist`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ repository_id: repositoryId, watch_settings: watchSettings }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add to watchlist');
  }

  return response.json();
}

export async function removeFromWatchlist(teamId: number, repositoryId: number): Promise<{ success: boolean }> {
  const response = await fetch(`${API_URL}/api/team/teams/${teamId}/watchlist/${repositoryId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to remove from watchlist');
  }

  return response.json();
}

export async function updateWatchlistSettings(
  teamId: number,
  repositoryId: number,
  watchSettings: Record<string, unknown>
): Promise<{ watchlist: WatchlistItem }> {
  const response = await fetch(`${API_URL}/api/team/teams/${teamId}/watchlist/${repositoryId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ watch_settings: watchSettings }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update watchlist');
  }

  return response.json();
}

// Notifications
export async function getNotifications(options?: {
  limit?: number;
  offset?: number;
  unread_only?: boolean;
}): Promise<{ notifications: Notification[]; unread_count: number }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.unread_only) params.set('unread_only', 'true');

  const response = await fetch(`${API_URL}/api/team/notifications?${params}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get notifications');
  }

  return response.json();
}

export async function markNotificationRead(notificationId: number): Promise<{ success: boolean }> {
  const response = await fetch(`${API_URL}/api/team/notifications/${notificationId}/read`, {
    method: 'PUT',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to mark notification read');
  }

  return response.json();
}

export async function markAllNotificationsRead(): Promise<{ success: boolean }> {
  const response = await fetch(`${API_URL}/api/team/notifications/read-all`, {
    method: 'PUT',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to mark all notifications read');
  }

  return response.json();
}

// Comments
export async function getPRComments(
  pullRequestId: number,
  includeInternal?: boolean
): Promise<{ comments: PRComment[] }> {
  const params = includeInternal ? '?include_internal=true' : '';
  const response = await fetch(`${API_URL}/api/team/pull-requests/${pullRequestId}/comments${params}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get comments');
  }

  return response.json();
}

export async function createPRComment(
  pullRequestId: number,
  data: {
    team_id?: number;
    parent_id?: number;
    content: string;
    is_internal?: boolean;
  }
): Promise<{ comment: PRComment }> {
  const response = await fetch(`${API_URL}/api/team/pull-requests/${pullRequestId}/comments`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create comment');
  }

  return response.json();
}

export async function updateComment(
  commentId: number,
  content: string
): Promise<{ comment: PRComment }> {
  const response = await fetch(`${API_URL}/api/team/comments/${commentId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update comment');
  }

  return response.json();
}

export async function deleteComment(commentId: number): Promise<{ success: boolean }> {
  const response = await fetch(`${API_URL}/api/team/comments/${commentId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete comment');
  }

  return response.json();
}

export async function resolveComment(commentId: number): Promise<{ comment: PRComment }> {
  const response = await fetch(`${API_URL}/api/team/comments/${commentId}/resolve`, {
    method: 'PUT',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to resolve comment');
  }

  return response.json();
}

export async function unresolveComment(commentId: number): Promise<{ comment: PRComment }> {
  const response = await fetch(`${API_URL}/api/team/comments/${commentId}/unresolve`, {
    method: 'PUT',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to unresolve comment');
  }

  return response.json();
}

// High Risk Watches
export async function getHighRiskWatches(teamId: number): Promise<{ watches: unknown[] }> {
  const response = await fetch(`${API_URL}/api/team/teams/${teamId}/high-risk-watches`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get high risk watches');
  }

  return response.json();
}

export async function createHighRiskWatch(
  teamId: number,
  repositoryId: number,
  riskThreshold?: number,
  notifyTeamMembers?: boolean
): Promise<{ watch: unknown }> {
  const response = await fetch(`${API_URL}/api/team/teams/${teamId}/high-risk-watches`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      repository_id: repositoryId,
      risk_threshold: riskThreshold || 0.7,
      notify_team_members: notifyTeamMembers !== false,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create high risk watch');
  }

  return response.json();
}

export async function deleteHighRiskWatch(teamId: number, repositoryId: number): Promise<{ success: boolean }> {
  const response = await fetch(`${API_URL}/api/team/teams/${teamId}/high-risk-watches/${repositoryId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete high risk watch');
  }

  return response.json();
}

export async function checkHighRiskPRs(teamId: number): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_URL}/api/team/teams/${teamId}/check-high-risk`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to check high risk PRs');
  }

  return response.json();
}

/**
 * Get webhook events for a repository
 */
export async function getWebhookEvents(
  repositoryId: number,
  limit: number = 50
): Promise<{ events: WebhookEvent[] }> {
  const response = await fetch(`${API_URL}/api/webhooks/events/${repositoryId}?limit=${limit}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get webhook events');
  }

  return response.json();
}

/**
 * Get webhook statistics
 */
export async function getWebhookStats(
  repositoryId: number,
  days: number = 7
): Promise<{ stats: WebhookStats[] }> {
  const response = await fetch(`${API_URL}/api/webhooks/stats/${repositoryId}?days=${days}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get webhook stats');
  }

  return response.json();
}

/**
 * Create event trigger for auto-analysis
 */
export async function createEventTrigger(
  repositoryId: number,
  eventType: string,
  triggerAction: string,
  config: Record<string, unknown> = {}
): Promise<{ trigger: EventTrigger }> {
  const response = await fetch(`${API_URL}/api/webhooks/triggers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ repositoryId, eventType, triggerAction, config }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create event trigger');
  }

  return response.json();
}

/**
 * Get event triggers for a repository
 */
export async function getEventTriggers(repositoryId: number): Promise<{ triggers: EventTrigger[] }> {
  const response = await fetch(`${API_URL}/api/webhooks/triggers/${repositoryId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get event triggers');
  }

  return response.json();
}
