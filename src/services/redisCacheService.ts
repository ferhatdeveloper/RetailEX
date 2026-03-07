// Redis Cache Service - Multi-Layer Caching Strategy

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  ttl: {
    default: number;
    stores: number;
    products: number;
    customers: number;
    sales: number;
    aggregations: number;
  };
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

export type CacheStrategy = 'LRU' | 'LFU' | 'FIFO' | 'TTL';

class RedisCacheService {
  private config: CacheConfig = {
    host: 'localhost',
    port: 6379,
    ttl: {
      default: 300,        // 5 minutes
      stores: 3600,        // 1 hour
      products: 1800,      // 30 minutes
      customers: 1800,     // 30 minutes
      sales: 60,           // 1 minute
      aggregations: 300    // 5 minutes
    }
  };

  private localCache: Map<string, CacheEntry<any>> = new Map();
  private maxLocalCacheSize: number = 1000;
  private strategy: CacheStrategy = 'LRU';
  private isConnected: boolean = false;
  private simulationMode: boolean = true; // For demo without real Redis

  private hitCount: number = 0;
  private missCount: number = 0;

  constructor(config?: Partial<CacheConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.init();
  }

  /**
   * Initialize Redis connection
   */
  private async init() {
    if (this.simulationMode) {
      console.log('?? Redis Cache Service (Simulation Mode)');
      this.isConnected = true;
      this.startCleanupInterval();
      return;
    }

    try {
      // In real implementation:
      // this.client = createClient({
      //   socket: {
      //     host: this.config.host,
      //     port: this.config.port
      //   },
      //   password: this.config.password,
      //   database: this.config.db
      // });
      // await this.client.connect();

      this.isConnected = true;
      console.log('?? Redis connected:', this.config.host);
    } catch (error) {
      console.error('? Redis connection failed:', error);
      this.isConnected = false;
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (this.simulationMode) {
      return this.getFromLocalCache<T>(key);
    }

    // Real Redis implementation
    // const value = await this.client.get(key);
    // if (value) {
    //   this.hitCount++;
    //   return JSON.parse(value);
    // }

    this.missCount++;
    return null;
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const cacheTTL = ttl || this.config.ttl.default;

    if (this.simulationMode) {
      this.setInLocalCache(key, value, cacheTTL);
      return;
    }

    // Real Redis implementation
    // await this.client.setEx(key, cacheTTL, JSON.stringify(value));
    console.log('?? Cached:', key, 'TTL:', cacheTTL);
  }

  /**
   * Delete from cache
   */
  async del(key: string): Promise<void> {
    if (this.simulationMode) {
      this.localCache.delete(key);
      console.log('??? Deleted from cache:', key);
      return;
    }

    // await this.client.del(key);
  }

  /**
   * Delete by pattern (cache invalidation)
   */
  async delPattern(pattern: string): Promise<number> {
    if (this.simulationMode) {
      let count = 0;
      const regex = new RegExp(pattern.replace('*', '.*'));

      for (const key of this.localCache.keys()) {
        if (regex.test(key)) {
          this.localCache.delete(key);
          count++;
        }
      }

      console.log('??? Invalidated', count, 'keys matching:', pattern);
      return count;
    }

    // Real Redis implementation
    // const keys = await this.client.keys(pattern);
    // if (keys.length > 0) {
    //   await this.client.del(keys);
    // }
    // return keys.length;

    return 0;
  }

  /**
   * Get or set (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache
    let cached = await this.get<T>(key);

    if (cached !== null) {
      this.hitCount++;
      return cached;
    }

    // Cache miss - fetch data
    this.missCount++;
    const data = await fetcher();

    // Store in cache
    await this.set(key, data, ttl);

    return data;
  }

  /**
   * Multi-get (batch retrieval)
   */
  async mget<T>(keys: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();

    if (this.simulationMode) {
      for (const key of keys) {
        results.set(key, this.getFromLocalCache<T>(key));
      }
      return results;
    }

    // Real Redis implementation
    // const values = await this.client.mGet(keys);
    // keys.forEach((key, index) => {
    //   results.set(key, values[index] ? JSON.parse(values[index]) : null);
    // });

    return results;
  }

  /**
   * Multi-set (batch storage)
   */
  async mset(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    if (this.simulationMode) {
      for (const entry of entries) {
        this.setInLocalCache(entry.key, entry.value, entry.ttl || this.config.ttl.default);
      }
      console.log('?? Batch cached:', entries.length, 'items');
      return;
    }

    // Real Redis implementation with pipeline
    // const pipeline = this.client.multi();
    // entries.forEach(entry => {
    //   pipeline.setEx(entry.key, entry.ttl || this.config.ttl.default, JSON.stringify(entry.value));
    // });
    // await pipeline.exec();
  }

  /**
   * Increment counter (for rate limiting, analytics)
   */
  async incr(key: string, expireInSeconds?: number): Promise<number> {
    if (this.simulationMode) {
      const current = this.getFromLocalCache<number>(key) || 0;
      const newValue = current + 1;
      this.setInLocalCache(key, newValue, expireInSeconds || this.config.ttl.default);
      return newValue;
    }

    // const value = await this.client.incr(key);
    // if (expireInSeconds) {
    //   await this.client.expire(key, expireInSeconds);
    // }
    // return value;

    return 1;
  }

  /**
   * Cache store data (optimized)
   */
  async cacheStore(storeId: string, data: any): Promise<void> {
    const key = `store:${storeId}`;
    await this.set(key, data, this.config.ttl.stores);
  }

  /**
   * Cache product data
   */
  async cacheProduct(productId: string, data: any): Promise<void> {
    const key = `product:${productId}`;
    await this.set(key, data, this.config.ttl.products);
  }

  /**
   * Cache aggregated stats
   */
  async cacheAggregation(aggregationType: string, filters: any, data: any): Promise<void> {
    const filterKey = JSON.stringify(filters);
    const key = `agg:${aggregationType}:${Buffer.from(filterKey).toString('base64')}`;
    await this.set(key, data, this.config.ttl.aggregations);
  }

  /**
   * Invalidate store cache
   */
  async invalidateStore(storeId: string): Promise<void> {
    await this.del(`store:${storeId}`);
    // Invalidate related caches
    await this.delPattern(`agg:*store:${storeId}*`);
    console.log('?? Invalidated cache for store:', storeId);
  }

  /**
   * Invalidate all stores
   */
  async invalidateAllStores(): Promise<void> {
    await this.delPattern('store:*');
    console.log('?? Invalidated all store caches');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
    maxSize: number;
  } {
    const total = this.hitCount + this.missCount;
    const hitRate = total > 0 ? (this.hitCount / total) * 100 : 0;

    return {
      hits: this.hitCount,
      misses: this.missCount,
      hitRate: Math.round(hitRate * 100) / 100,
      size: this.localCache.size,
      maxSize: this.maxLocalCacheSize
    };
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    if (this.simulationMode) {
      this.localCache.clear();
      this.hitCount = 0;
      this.missCount = 0;
      console.log('??? Cache cleared');
      return;
    }

    // await this.client.flushDb();
  }

  /**
   * Local cache operations (for simulation)
   */
  private getFromLocalCache<T>(key: string): T | null {
    const entry = this.localCache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl * 1000) {
      this.localCache.delete(key);
      return null;
    }

    // Update hit count
    entry.hits++;

    return entry.data as T;
  }

  private setInLocalCache<T>(key: string, value: T, ttl: number): void {
    // Check cache size limit
    if (this.localCache.size >= this.maxLocalCacheSize) {
      this.evictFromLocalCache();
    }

    const entry: CacheEntry<T> = {
      data: value,
      timestamp: Date.now(),
      ttl,
      hits: 0
    };

    this.localCache.set(key, entry);
  }

  /**
   * Evict entries based on strategy
   */
  private evictFromLocalCache(): void {
    if (this.localCache.size === 0) return;

    switch (this.strategy) {
      case 'LRU': // Least Recently Used
        this.evictLRU();
        break;
      case 'LFU': // Least Frequently Used
        this.evictLFU();
        break;
      case 'FIFO': // First In First Out
        this.evictFIFO();
        break;
      case 'TTL': // Shortest TTL
        this.evictShortestTTL();
        break;
    }
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.localCache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.localCache.delete(oldestKey);
      console.log('🗑️ Evicted (LRU):', oldestKey);
    }
  }

  private evictLFU(): void {
    let leastUsedKey: string | null = null;
    let leastHits = Infinity;

    for (const [key, entry] of this.localCache.entries()) {
      if (entry.hits < leastHits) {
        leastHits = entry.hits;
        leastUsedKey = key;
      }
    }

    if (leastUsedKey) {
      this.localCache.delete(leastUsedKey);
      console.log('🗑️ Evicted (LFU):', leastUsedKey);
    }
  }

  private evictFIFO(): void {
    const firstKey = this.localCache.keys().next().value;
    if (firstKey) {
      this.localCache.delete(firstKey);
      console.log('🗑️ Evicted (FIFO):', firstKey);
    }
  }

  private evictShortestTTL(): void {
    let shortestTTLKey: string | null = null;
    let shortestTTL = Infinity;

    for (const [key, entry] of this.localCache.entries()) {
      const remainingTTL = entry.ttl - (Date.now() - entry.timestamp) / 1000;
      if (remainingTTL < shortestTTL) {
        shortestTTL = remainingTTL;
        shortestTTLKey = key;
      }
    }

    if (shortestTTLKey) {
      this.localCache.delete(shortestTTLKey);
      console.log('🗑️ Evicted (TTL):', shortestTTLKey);
    }
  }

  /**
   * Cleanup expired entries (runs periodically)
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, entry] of this.localCache.entries()) {
        if (now - entry.timestamp > entry.ttl * 1000) {
          this.localCache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log('?? Cleaned up', cleaned, 'expired cache entries');
      }
    }, 60000); // Every minute
  }

  /**
   * Check if connected
   */
  isServiceConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get service status
   */
  getStatus(): { connected: boolean; mode: 'simulation' | 'real'; stats: any } {
    return {
      connected: this.isConnected,
      mode: this.simulationMode ? 'simulation' : 'real',
      stats: this.getStats()
    };
  }
}

// Singleton instance
export const redisCacheService = new RedisCacheService();


