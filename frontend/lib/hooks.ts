import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Type for paginated response
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// Type for API options
interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

// Generic fetch function
async function fetchApi<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// ============================================
// REPOSITORY HOOKS
// ============================================

interface RepositoryParams {
  page?: number;
  limit?: number;
  search?: string;
  language?: string;
}

export function useRepositories(params: RepositoryParams = {}) {
  const { page = 1, limit = 20, search, language } = params;

  return useQuery({
    queryKey: ['repositories', { page, limit, search, language }],
    queryFn: () => {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (search) queryParams.set('search', search);
      if (language) queryParams.set('language', language);
      
      return fetchApi<PaginatedResponse<unknown>>(`/api/repositories?${queryParams}`);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useRepository(id: number | string) {
  return useQuery({
    queryKey: ['repository', id],
    queryFn: () => fetchApi<unknown>(`/api/repositories/${id}`),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================
// ANALYTICS HOOKS
// ============================================

interface AnalyticsParams {
  days?: number;
  repositoryId?: number;
}

export function useAnalytics(params: AnalyticsParams = {}) {
  const { days = 7, repositoryId } = params;

  return useQuery({
    queryKey: ['analytics', { days, repositoryId }],
    queryFn: () => {
      const queryParams = new URLSearchParams({ days: days.toString() });
      if (repositoryId) queryParams.set('repositoryId', repositoryId.toString());
      
      return fetchApi<unknown>(`/api/analytics/dashboard?${queryParams}`);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes for analytics
    refetchInterval: 5 * 60 * 1000, // Auto-refetch every 5 minutes
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: () => fetchApi<{ success: boolean; alerts: unknown[] }>('/api/analytics/alerts'),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Auto-refetch every minute
  });
}

// ============================================
// PULL REQUEST HOOKS
// ============================================

interface PullRequestParams {
  repositoryId: number;
  page?: number;
  limit?: number;
  state?: string;
  riskLevel?: string;
}

export function usePullRequests(params: PullRequestParams) {
  const { repositoryId, page = 1, limit = 20, state, riskLevel } = params;

  return useQuery({
    queryKey: ['pullRequests', { repositoryId, page, limit, state, riskLevel }],
    queryFn: () => {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (state) queryParams.set('state', state);
      if (riskLevel) queryParams.set('riskLevel', riskLevel);
      
      return fetchApi<PaginatedResponse<unknown>>(`/api/repositories/${repositoryId}/pulls?${queryParams}`);
    },
    enabled: !!repositoryId,
    staleTime: 2 * 60 * 1000,
  });
}

// Infinite scroll hook for pull requests
export function usePullRequestsInfinite(repositoryId: number, limit = 20) {
  return useInfiniteQuery({
    queryKey: ['pullRequestsInfinite', { repositoryId, limit }],
    queryFn: ({ pageParam = 1 }) => 
      fetchApi<PaginatedResponse<unknown>>(
        `/api/repositories/${repositoryId}/pulls?page=${pageParam}&limit=${limit}`
      ),
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.hasMore) {
        return lastPage.pagination.page + 1;
      }
      return undefined;
    },
    enabled: !!repositoryId,
    initialPageParam: 1,
  });
}

// ============================================
// SIMULATION HOOKS
// ============================================

interface SimulationParams {
  page?: number;
  limit?: number;
  repositoryId?: number;
}

export function useSimulations(params: SimulationParams) {
  const { page = 1, limit = 20, repositoryId } = params;

  return useQuery({
    queryKey: ['simulations', { page, limit, repositoryId }],
    queryFn: () => {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (repositoryId) queryParams.set('repositoryId', repositoryId.toString());
      
      return fetchApi<PaginatedResponse<unknown>>(`/api/simulations?${queryParams}`);
    },
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

export function useSimulationHistory(repositoryId: number) {
  return useQuery({
    queryKey: ['simulationHistory', repositoryId],
    queryFn: () => fetchApi<unknown[]>(`/api/repositories/${repositoryId}/simulations/history`),
    enabled: !!repositoryId,
    staleTime: 2 * 60 * 1000,
  });
}

// ============================================
// WORKFLOW HOOKS
// ============================================

interface WorkflowParams {
  page?: number;
  limit?: number;
  status?: string;
}

export function useWorkflows(params: WorkflowParams = {}) {
  const { page = 1, limit = 20, status } = params;

  return useQuery({
    queryKey: ['workflows', { page, limit, status }],
    queryFn: () => {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (status) queryParams.set('status', status);
      
      return fetchApi<PaginatedResponse<unknown>>(`/api/workflows?${queryParams}`);
    },
    staleTime: 1 * 60 * 1000,
  });
}

export function useWorkflow(id: number | string) {
  return useQuery({
    queryKey: ['workflow', id],
    queryFn: () => fetchApi<unknown>(`/api/workflows/${id}`),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

// ============================================
// TEAM HOOKS
// ============================================

interface TeamParams {
  page?: number;
  limit?: number;
}

export function useTeams(params: TeamParams = {}) {
  const { page = 1, limit = 20 } = params;

  return useQuery({
    queryKey: ['teams', { page, limit }],
    queryFn: () => {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      return fetchApi<PaginatedResponse<unknown>>(`/api/teams?${queryParams}`);
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useTeamMembers(teamId: number) {
  return useQuery({
    queryKey: ['teamMembers', teamId],
    queryFn: () => fetchApi<unknown[]>(`/api/teams/${teamId}/members`),
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================
// FEEDBACK HOOKS
// ============================================

export function useFeedbackAnalytics(days = 30) {
  return useQuery({
    queryKey: ['feedbackAnalytics', days],
    queryFn: () => fetchApi<unknown>(`/api/feedback/analytics?days=${days}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useFeedbackTrends(days = 30) {
  return useQuery({
    queryKey: ['feedbackTrends', days],
    queryFn: () => fetchApi<unknown>(`/api/feedback/trends?days=${days}`),
    staleTime: 5 * 60 * 1000,
  });
}

// Mutation hook for submitting feedback
export function useSubmitFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: unknown) => fetchApi<unknown>('/api/feedback', {
      method: 'POST',
      body: data,
    }),
    onSuccess: () => {
      // Invalidate and refetch feedback queries
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
      queryClient.invalidateQueries({ queryKey: ['feedbackAnalytics'] });
      queryClient.invalidateQueries({ queryKey: ['feedbackTrends'] });
    },
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

export function useCreateSimulation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: unknown) => fetchApi<unknown>('/api/simulations', {
      method: 'POST',
      body: data,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulations'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

export function useRunBenchmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: unknown) => fetchApi<unknown>('/api/benchmark/run', {
      method: 'POST',
      body: data,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['benchmark'] });
    },
  });
}

// ============================================
// CODE QUALITY HOOKS
// ============================================

export function useCodeQualityMetrics(repositoryId: number) {
  return useQuery({
    queryKey: ['codeQuality', repositoryId],
    queryFn: () => fetchApi<unknown>(`/api/code-quality/${repositoryId}`),
    enabled: !!repositoryId,
    staleTime: 10 * 60 * 1000, // 10 minutes - code quality doesn't change often
  });
}

// ============================================
// REFETCH HOOK
// ============================================

export function useRefetchQueries() {
  const queryClient = useQueryClient();

  return {
    refetchAll: () => queryClient.refetchQueries(),
    refetchAnalytics: () => queryClient.refetchQueries({ queryKey: ['analytics'] }),
    refetchPullRequests: () => queryClient.refetchQueries({ queryKey: ['pullRequests'] }),
    refetchSimulations: () => queryClient.refetchQueries({ queryKey: ['simulations'] }),
  };
}
