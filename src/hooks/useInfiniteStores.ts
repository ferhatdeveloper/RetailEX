// React Query hook for infinite store loading

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { storeApiService, type SearchFilters } from '../services/storeApiService';
import { ERP_SETTINGS } from '../services/postgres';

function firmPeriodKey(): string {
  return `${ERP_SETTINGS.firmNr || ''}:${ERP_SETTINGS.periodNr || ''}`;
}

export function useInfiniteStores(filters?: SearchFilters, pageSize: number = 50) {
  return useInfiniteQuery({
    queryKey: ['stores', 'infinite', filters, pageSize, firmPeriodKey()],
    initialPageParam: 0,
    queryFn: ({ pageParam = 0 }) =>
      storeApiService.fetchStores(pageParam as number, pageSize, filters),
    getNextPageParam: (lastPage: Awaited<ReturnType<typeof storeApiService.fetchStores>>) =>
      lastPage.pagination.cursor ? parseInt(lastPage.pagination.cursor, 10) : undefined,
    staleTime: 60000,
    gcTime: 5 * 60000,
    refetchOnWindowFocus: false,
  });
}

export function useSearchStores(query: string, filters?: SearchFilters, limit: number = 50) {
  return useQuery({
    queryKey: ['stores', 'search', query, filters, limit, firmPeriodKey()],
    queryFn: () => storeApiService.searchStores(query, filters, limit),
    enabled: query.length > 0,
    staleTime: 30000,
    gcTime: 2 * 60000,
  });
}

export function useAggregatedStats(filters?: SearchFilters) {
  return useQuery({
    queryKey: ['stores', 'stats', 'aggregated', filters, firmPeriodKey()],
    queryFn: () => storeApiService.getAggregatedStats(filters),
    staleTime: 60000,
    gcTime: 5 * 60000,
    refetchInterval: 60000,
  });
}

export function useRegionStats() {
  return useQuery({
    queryKey: ['stores', 'stats', 'regions', firmPeriodKey()],
    queryFn: () => storeApiService.getRegionStats(),
    staleTime: 60000,
    gcTime: 5 * 60000,
  });
}

export function useTopStores(limit: number = 10) {
  return useQuery({
    queryKey: ['stores', 'top', limit, firmPeriodKey()],
    queryFn: () => storeApiService.getTopStores(limit),
    staleTime: 60000,
    gcTime: 5 * 60000,
  });
}

export function useCriticalAlerts(limit: number = 50) {
  return useQuery({
    queryKey: ['alerts', 'critical', limit, firmPeriodKey()],
    queryFn: () => storeApiService.getCriticalAlerts(limit),
    staleTime: 30000,
    gcTime: 2 * 60000,
    refetchInterval: 30000,
  });
}

export function useStoreStats(storeId: string) {
  return useQuery({
    queryKey: ['stores', 'stats', storeId, firmPeriodKey()],
    queryFn: () => storeApiService.getStoreStats(storeId),
    enabled: !!storeId,
    staleTime: 60000,
  });
}

export function useStorePanelDashboard() {
  return useQuery({
    queryKey: ['stores', 'panel-dashboard', firmPeriodKey()],
    queryFn: () => storeApiService.getStorePanelDashboard(),
    staleTime: 60000,
    refetchInterval: 60000,
  });
}

export function useStoreAnalytics(days: number = 30) {
  return useQuery({
    queryKey: ['stores', 'analytics', days, firmPeriodKey()],
    queryFn: () => storeApiService.getStoreAnalytics(days),
    staleTime: 60000,
  });
}
