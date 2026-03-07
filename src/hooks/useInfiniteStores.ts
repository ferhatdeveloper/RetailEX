// React Query hook for infinite store loading

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { storeApiService, type SearchFilters, type Store } from '../services/storeApiService';

export function useInfiniteStores(filters?: SearchFilters, pageSize: number = 50) {
  return useInfiniteQuery({
    queryKey: ['stores', 'infinite', filters, pageSize],
    queryFn: ({ pageParam = 0 }) => 
      storeApiService.fetchStores(pageParam as number, pageSize, filters),
    getNextPageParam: (lastPage) => 
      lastPage.pagination.cursor ? parseInt(lastPage.pagination.cursor) : undefined,
    staleTime: 60000, // 1 minute
    gcTime: 5 * 60000, // 5 minutes (formerly cacheTime)
    refetchOnWindowFocus: false,
  });
}

export function useSearchStores(query: string, filters?: SearchFilters, limit: number = 50) {
  return useQuery({
    queryKey: ['stores', 'search', query, filters, limit],
    queryFn: () => storeApiService.searchStores(query, filters, limit),
    enabled: query.length > 0,
    staleTime: 30000,
    gcTime: 2 * 60000,
  });
}

export function useAggregatedStats(filters?: SearchFilters) {
  return useQuery({
    queryKey: ['stores', 'stats', 'aggregated', filters],
    queryFn: () => storeApiService.getAggregatedStats(filters),
    staleTime: 60000,
    gcTime: 5 * 60000,
    refetchInterval: 60000, // Auto-refresh every minute
  });
}

export function useRegionStats() {
  return useQuery({
    queryKey: ['stores', 'stats', 'regions'],
    queryFn: () => storeApiService.getRegionStats(),
    staleTime: 60000,
    gcTime: 5 * 60000,
  });
}

export function useTopStores(limit: number = 10) {
  return useQuery({
    queryKey: ['stores', 'top', limit],
    queryFn: () => storeApiService.getTopStores(limit),
    staleTime: 60000,
    gcTime: 5 * 60000,
  });
}

export function useCriticalAlerts(limit: number = 50) {
  return useQuery({
    queryKey: ['alerts', 'critical', limit],
    queryFn: () => storeApiService.getCriticalAlerts(limit),
    staleTime: 30000,
    gcTime: 2 * 60000,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });
}

export function useStoreStats(storeId: string) {
  return useQuery({
    queryKey: ['stores', 'stats', storeId],
    queryFn: () => storeApiService.getStoreStats(storeId),
    enabled: !!storeId,
    staleTime: 60000,
  });
}



