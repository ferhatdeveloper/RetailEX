/**
 * IndexedDB Cache System
 * Provides offline support and 10x faster data access
 * Uses localForage for better browser compatibility
 */

import localforage from 'localforage';
import { logger } from './logger';

// Cache instances for different data types
const productCache = localforage.createInstance({
  name: 'retailos',
  storeName: 'products',
  description: 'Product data cache'
});

const customerCache = localforage.createInstance({
  name: 'retailos',
  storeName: 'customers',
  description: 'Customer data cache'
});

const salesCache = localforage.createInstance({
  name: 'retailos',
  storeName: 'sales',
  description: 'Sales data cache'
});

const configCache = localforage.createInstance({
  name: 'retailos',
  storeName: 'config',
  description: 'Configuration cache'
});

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: string;
}

const CACHE_VERSION = '1.0.0';
const DEFAULT_TTL = 1000 * 60 * 60; // 1 hour

/**
 * Generic cache manager
 */
class CacheManager<T> {
  constructor(private store: LocalForage, private ttl: number = DEFAULT_TTL) {}

  /**
   * Get data from cache
   * Returns null if cache is expired or doesn't exist
   */
  async get(key: string): Promise<T | null> {
    try {
      const entry = await this.store.getItem<CacheEntry<T>>(key);
      
      if (!entry) {
        logger.log(`Cache miss: ${key}`);
        return null;
      }

      // Check version
      if (entry.version !== CACHE_VERSION) {
        logger.log(`Cache version mismatch: ${key}`);
        await this.remove(key);
        return null;
      }

      // Check TTL
      const now = Date.now();
      if (now - entry.timestamp > this.ttl) {
        logger.log(`Cache expired: ${key}`);
        await this.remove(key);
        return null;
      }

      logger.log(`Cache hit: ${key}`);
      return entry.data;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set data to cache
   */
  async set(key: string, data: T): Promise<void> {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        version: CACHE_VERSION
      };
      await this.store.setItem(key, entry);
      logger.log(`Cache set: ${key}`);
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  }

  /**
   * Remove data from cache
   */
  async remove(key: string): Promise<void> {
    try {
      await this.store.removeItem(key);
      logger.log(`Cache removed: ${key}`);
    } catch (error) {
      logger.error('Cache remove error:', error);
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    try {
      await this.store.clear();
      logger.log('Cache cleared');
    } catch (error) {
      logger.error('Cache clear error:', error);
    }
  }

  /**
   * Get all keys
   */
  async keys(): Promise<string[]> {
    try {
      return await this.store.keys();
    } catch (error) {
      logger.error('Cache keys error:', error);
      return [];
    }
  }
}

// Export cache managers
export const productsCache = new CacheManager(productCache, 1000 * 60 * 30); // 30 min
export const customersCache = new CacheManager(customerCache, 1000 * 60 * 30); // 30 min
export const salesCacheManager = new CacheManager(salesCache, 1000 * 60 * 60 * 24); // 24 hours
export const configCacheManager = new CacheManager(configCache, 1000 * 60 * 60 * 24 * 7); // 7 days

// Generic cache instance for system-wide use (used by centralDataBroadcast, offlineQueue, etc.)
const systemCache = localforage.createInstance({
  name: 'retailos',
  storeName: 'system',
  description: 'System-wide cache for broadcast, queue, etc.'
});

export const dbCache = new CacheManager(systemCache, Infinity); // No expiration for system data

/**
 * Clear all caches
 */
export const clearAllCaches = async (): Promise<void> => {
  await Promise.all([
    productsCache.clear(),
    customersCache.clear(),
    salesCacheManager.clear(),
    configCacheManager.clear(),
    dbCache.clear()
  ]);
  logger.log('All caches cleared');
};

/**
 * Get cache statistics
 */
export const getCacheStats = async (): Promise<{
  products: number;
  customers: number;
  sales: number;
  config: number;
  system: number;
}> => {
  const [productsKeys, customersKeys, salesKeys, configKeys, systemKeys] = await Promise.all([
    productsCache.keys(),
    customersCache.keys(),
    salesCacheManager.keys(),
    configCacheManager.keys(),
    dbCache.keys()
  ]);

  return {
    products: productsKeys.length,
    customers: customersKeys.length,
    sales: salesKeys.length,
    config: configKeys.length,
    system: systemKeys.length
  };
};
