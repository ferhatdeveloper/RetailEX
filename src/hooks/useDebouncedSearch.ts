import { useState, useEffect, useCallback } from 'react';
import { logger } from '../utils/logger';

/**
 * Debounced search hook
 * Delays search execution until user stops typing
 */
export function useDebouncedSearch<T>(
  items: T[],
  searchFn: (items: T[], query: string) => T[],
  delay: number = 300
) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<T[]>(items);
  const [isSearching, setIsSearching] = useState(false);

  // Debounce the query
  useEffect(() => {
    setIsSearching(true);
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setIsSearching(false);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [query, delay]);

  // Perform search when debounced query changes
  useEffect(() => {
    const startTime = performance.now();
    
    if (!debouncedQuery) {
      setResults(items);
      return;
    }

    const searchResults = searchFn(items, debouncedQuery);
    setResults(searchResults);
    
    const duration = performance.now() - startTime;
    logger.log('search', `Search completed in ${duration.toFixed(2)}ms`, {
      query: debouncedQuery,
      resultCount: searchResults.length,
      totalItems: items.length
    });
  }, [debouncedQuery, items, searchFn]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setResults(items);
  }, [items]);

  return {
    query,
    setQuery,
    debouncedQuery,
    results,
    isSearching,
    clearSearch
  };
}

/**
 * Throttled function execution
 * Limits how often a function can be called
 */
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const [lastRan, setLastRan] = useState(Date.now());

  return useCallback(
    ((...args) => {
      const now = Date.now();
      
      if (now - lastRan >= delay) {
        setLastRan(now);
        return callback(...args);
      }
    }) as T,
    [callback, delay, lastRan]
  );
}

/**
 * Simple debounce hook for any value
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

