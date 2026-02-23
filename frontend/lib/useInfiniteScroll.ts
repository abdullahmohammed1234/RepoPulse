'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseInfiniteScrollOptions<T> {
  fetchFn: (page: number) => Promise<T[]>;
  initialPage?: number;
  pageSize?: number;
  enabled?: boolean;
}

interface UseInfiniteScrollResult<T> {
  data: T[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
  observerRef: (node: HTMLElement | null) => void;
}

export function useInfiniteScroll<T>({
  fetchFn,
  initialPage = 1,
  pageSize = 20,
  enabled = true,
}: UseInfiniteScrollOptions<T>): UseInfiniteScrollResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const observerTarget = useRef<HTMLElement | null>(null);

  // Initial fetch
  useEffect(() => {
    if (!enabled) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const newData = await fetchFn(initialPage);
        setData(newData);
        setHasMore(newData.length >= pageSize);
        setPage(initialPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [enabled, fetchFn, initialPage, pageSize]);

  // Load more function
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const newData = await fetchFn(nextPage);
      
      if (newData.length > 0) {
        setData((prev) => [...prev, ...newData]);
        setPage(nextPage);
        setHasMore(newData.length >= pageSize);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }, [fetchFn, hasMore, loadingMore, page, pageSize]);

  // Refresh function
  const refresh = useCallback(() => {
    setData([]);
    setPage(initialPage);
    setHasMore(true);
    setError(null);
  }, [initialPage]);

  // Intersection observer callback
  const observerRef = useCallback(
    (node: HTMLElement | null) => {
      if (!node || !enabled) return;

      observerTarget.current = node;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore && !loadingMore) {
            loadMore();
          }
        },
        {
          threshold: 0.1,
          rootMargin: '100px',
        }
      );

      observer.observe(node);

      return () => {
        observer.disconnect();
      };
    },
    [enabled, hasMore, loadingMore, loadMore]
  );

  return {
    data,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
    observerRef,
  };
}
