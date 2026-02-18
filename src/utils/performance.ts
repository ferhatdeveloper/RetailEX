/**
 * Performance Optimization Utilities
 * Pattern: Memoization + Lazy Loading + Virtual Scrolling
 */

import { useCallback, useMemo, useRef, useEffect } from 'react';

/**
 * Debounce hook
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Throttle hook
 */
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 300
): T {
  const lastRun = useRef(Date.now());

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();

      if (now - lastRun.current >= delay) {
        lastRun.current = now;
        return callback(...args);
      }
    },
    [callback, delay]
  ) as T;
}

/**
 * Intersection Observer for lazy loading
 */
export function useIntersectionObserver(
  ref: React.RefObject<Element>,
  options?: IntersectionObserverInit
): boolean {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [ref, options]);

  return isIntersecting;
}

/**
 * Virtual scrolling for large lists
 */
export function useVirtualScroll<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number
) {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleRange = useMemo(() => {
    const start = Math.floor(scrollTop / itemHeight);
    const end = Math.ceil((scrollTop + containerHeight) / itemHeight);

    return {
      start: Math.max(0, start - 5), // Buffer
      end: Math.min(items.length, end + 5)
    };
  }, [scrollTop, itemHeight, containerHeight, items.length]);

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.start, visibleRange.end).map((item, index) => ({
      item,
      index: visibleRange.start + index
    }));
  }, [items, visibleRange]);

  const totalHeight = items.length * itemHeight;
  const offsetY = visibleRange.start * itemHeight;

  return {
    visibleItems,
    totalHeight,
    offsetY,
    onScroll: (e: React.UIEvent<HTMLElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
    }
  };
}

/**
 * Memoization cache
 */
class MemoCache {
  private cache = new Map<string, { value: any; timestamp: number }>();
  private maxAge: number = 5 * 60 * 1000; // 5 minutes

  set(key: string, value: any): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  get(key: string): any | undefined {
    const cached = this.cache.get(key);
    
    if (!cached) return undefined;

    // Check expiry
    if (Date.now() - cached.timestamp > this.maxAge) {
      this.cache.delete(key);
      return undefined;
    }

    return cached.value;
  }

  clear(): void {
    this.cache.clear();
  }
}

export const memoCache = new MemoCache();

/**
 * Memoized async function
 */
export function memoizeAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyFn?: (...args: Parameters<T>) => string
): T {
  return (async (...args: Parameters<T>) => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    
    const cached = memoCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = await fn(...args);
    memoCache.set(key, result);
    
    return result;
  }) as T;
}

/**
 * Image lazy loading
 */
export function useLazyImage(src: string): {
  imageSrc: string;
  isLoaded: boolean;
} {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = src;
    
    img.onload = () => {
      setImageSrc(src);
      setIsLoaded(true);
    };

    return () => {
      img.onload = null;
    };
  }, [src]);

  return { imageSrc, isLoaded };
}

/**
 * Local storage with compression
 */
export const compressedStorage = {
  setItem(key: string, value: any): void {
    try {
      const serialized = JSON.stringify(value);
      // Simple compression: remove whitespace
      const compressed = serialized.replace(/\s+/g, '');
      localStorage.setItem(key, compressed);
    } catch (error) {
      console.error('Storage error:', error);
    }
  },

  getItem<T>(key: string): T | null {
    try {
      const compressed = localStorage.getItem(key);
      if (!compressed) return null;
      return JSON.parse(compressed);
    } catch (error) {
      console.error('Storage error:', error);
      return null;
    }
  },

  removeItem(key: string): void {
    localStorage.removeItem(key);
  }
};

/**
 * Batch operations
 */
export function batchOperations<T>(
  operations: Array<() => Promise<T>>,
  batchSize: number = 5
): Promise<T[]> {
  return new Promise(async (resolve) => {
    const results: T[] = [];
    
    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(op => op()));
      results.push(...batchResults);
    }

    resolve(results);
  });
}

/**
 * Request animation frame throttle
 */
export function rafThrottle<T extends (...args: any[]) => any>(
  callback: T
): T {
  let rafId: number | null = null;

  return ((...args: Parameters<T>) => {
    if (rafId !== null) {
      return;
    }

    rafId = requestAnimationFrame(() => {
      callback(...args);
      rafId = null;
    });
  }) as T;
}

/**
 * Performance monitoring
 */
export class PerformanceMonitor {
  private metrics = new Map<string, number[]>();

  start(label: string): () => void {
    const startTime = performance.now();

    return () => {
      const duration = performance.now() - startTime;
      
      if (!this.metrics.has(label)) {
        this.metrics.set(label, []);
      }

      this.metrics.get(label)!.push(duration);

      // Keep only last 100 measurements
      const measurements = this.metrics.get(label)!;
      if (measurements.length > 100) {
        measurements.shift();
      }
    };
  }

  getStats(label: string): {
    avg: number;
    min: number;
    max: number;
    count: number;
  } | null {
    const measurements = this.metrics.get(label);
    
    if (!measurements || measurements.length === 0) {
      return null;
    }

    return {
      avg: measurements.reduce((a, b) => a + b, 0) / measurements.length,
      min: Math.min(...measurements),
      max: Math.max(...measurements),
      count: measurements.length
    };
  }

  clear(): void {
    this.metrics.clear();
  }
}

export const perfMonitor = new PerformanceMonitor();

// React useState import
import { useState } from 'react';

