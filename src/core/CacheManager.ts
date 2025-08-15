import * as vscode from 'vscode';
import { MotionResponse, CacheEntry } from '../models/Types';

/**
 * Manages caching of motion calculations for performance optimization
 */
export class CacheManager {
  private static readonly CACHE_KEY = 'vimMotionTrainer.motionCache';
  private static readonly DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly DEFAULT_MAX_SIZE = 1000;
  
  private cache = new Map<string, CacheEntry>();
  private hitCount = 0;
  private missCount = 0;
  private lastCleanup = Date.now();

  constructor(
    private context: vscode.ExtensionContext,
    private ttl: number = CacheManager.DEFAULT_TTL,
    private maxSize: number = CacheManager.DEFAULT_MAX_SIZE
  ) {
    this.loadCache();
    
    // Schedule periodic cleanup
    this.scheduleCleanup();
  }

  /**
   * Get cached motion response
   * @param key Cache key
   * @returns Cached motion response or null if not found/expired
   */
  async get(key: string): Promise<MotionResponse | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.missCount++;
      return null;
    }
    
    // Check if entry is expired
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      this.missCount++;
      await this.saveCache();
      return null;
    }
    
    this.hitCount++;
    console.log(`Vim Motion Trainer: Cache hit for motion (${this.getHitRate().toFixed(1)}% hit rate)`);
    return entry.motion;
  }

  /**
   * Store motion response in cache
   * @param key Cache key
   * @param motion Motion response to cache
   */
  async set(key: string, motion: MotionResponse): Promise<void> {
    // Check cache size limit
    if (this.cache.size >= this.maxSize) {
      await this.evictOldEntries();
    }
    
    const entry: CacheEntry = {
      key,
      motion,
      expiresAt: Date.now() + this.ttl,
      provider: motion.provider
    };
    
    this.cache.set(key, entry);
    await this.saveCache();
    
    console.log(`Vim Motion Trainer: Cached motion from ${motion.provider} (cache size: ${this.cache.size})`);
  }

  /**
   * Check if a key exists in cache (without retrieving)
   * @param key Cache key
   * @returns True if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    return entry !== undefined && entry.expiresAt >= Date.now();
  }

  /**
   * Remove specific entry from cache
   * @param key Cache key to remove
   */
  async delete(key: string): Promise<boolean> {
    const deleted = this.cache.delete(key);
    if (deleted) {
      await this.saveCache();
    }
    return deleted;
  }

  /**
   * Clear all cached entries
   */
  async clearCache(): Promise<void> {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
    await this.saveCache();
    console.log('Vim Motion Trainer: Motion cache cleared');
  }

  /**
   * Clear cache entries for specific provider
   * @param provider Provider name
   */
  async clearProviderCache(provider: string): Promise<void> {
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.provider === provider) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
    
    if (keysToDelete.length > 0) {
      await this.saveCache();
      console.log(`Vim Motion Trainer: Cleared ${keysToDelete.length} cache entries for provider ${provider}`);
    }
  }

  /**
   * Get cache statistics
   * @returns Cache performance and usage statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitCount: number;
    missCount: number;
    hitRate: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
    providerBreakdown: Record<string, number>;
    memoryUsage: number; // Estimated in bytes
  } {
    let oldestTimestamp = Infinity;
    let newestTimestamp = 0;
    const providerBreakdown: Record<string, number> = {};
    let estimatedMemoryUsage = 0;
    
    for (const entry of this.cache.values()) {
      // Track oldest/newest
      const timestamp = entry.motion.calculatedAt;
      if (timestamp < oldestTimestamp) oldestTimestamp = timestamp;
      if (timestamp > newestTimestamp) newestTimestamp = timestamp;
      
      // Count by provider
      providerBreakdown[entry.provider] = (providerBreakdown[entry.provider] || 0) + 1;
      
      // Estimate memory usage (rough calculation)
      estimatedMemoryUsage += JSON.stringify(entry).length * 2; // Rough UTF-16 estimate
    }
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: this.getHitRate(),
      oldestEntry: oldestTimestamp === Infinity ? null : new Date(oldestTimestamp),
      newestEntry: newestTimestamp === 0 ? null : new Date(newestTimestamp),
      providerBreakdown,
      memoryUsage: estimatedMemoryUsage
    };
  }

  /**
   * Update cache configuration
   * @param options New cache options
   */
  async updateConfig(options: {
    ttl?: number;
    maxSize?: number;
  }): Promise<void> {
    if (options.ttl !== undefined) {
      this.ttl = options.ttl;
    }
    
    if (options.maxSize !== undefined) {
      this.maxSize = options.maxSize;
      
      // If new max size is smaller, evict entries
      if (this.cache.size > this.maxSize) {
        await this.evictOldEntries();
      }
    }
    
    console.log(`Vim Motion Trainer: Cache config updated - TTL: ${this.ttl}ms, Max Size: ${this.maxSize}`);
  }

  /**
   * Export cache data for debugging
   * @returns Serializable cache data
   */
  exportCache(): Array<{
    key: string;
    provider: string;
    confidence: number;
    age: number; // in milliseconds
    expiresIn: number; // in milliseconds
  }> {
    const now = Date.now();
    const exportData: Array<any> = [];
    
    for (const [key, entry] of this.cache.entries()) {
      exportData.push({
        key: key.substring(0, 50) + (key.length > 50 ? '...' : ''), // Truncate long keys
        provider: entry.provider,
        confidence: entry.motion.confidence,
        age: now - entry.motion.calculatedAt,
        expiresIn: entry.expiresAt - now
      });
    }
    
    return exportData.sort((a, b) => b.age - a.age); // Sort by age, newest first
  }

  /**
   * Load cache from VSCode persistent storage
   */
  private async loadCache(): Promise<void> {
    try {
      const cachedData = this.context.globalState.get<CacheEntry[]>(CacheManager.CACHE_KEY, []);
      const now = Date.now();
      let loadedCount = 0;
      let expiredCount = 0;
      
      for (const entry of cachedData) {
        if (entry.expiresAt > now) {
          this.cache.set(entry.key, entry);
          loadedCount++;
        } else {
          expiredCount++;
        }
      }
      
      console.log(`Vim Motion Trainer: Loaded ${loadedCount} cached motions, skipped ${expiredCount} expired entries`);
      
    } catch (error) {
      console.error('Vim Motion Trainer: Failed to load cache:', error);
      this.cache.clear();
    }
  }

  /**
   * Save cache to VSCode persistent storage
   */
  private async saveCache(): Promise<void> {
    try {
      const cacheArray = Array.from(this.cache.values());
      await this.context.globalState.update(CacheManager.CACHE_KEY, cacheArray);
    } catch (error) {
      console.error('Vim Motion Trainer: Failed to save cache:', error);
    }
  }

  /**
   * Evict old entries when cache is full
   */
  private async evictOldEntries(): Promise<void> {
    const entries = Array.from(this.cache.entries());
    
    // Sort by expiration time (oldest first)
    entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    
    // Remove oldest 25% of entries
    const toRemove = Math.floor(entries.length * 0.25);
    const keysToRemove = entries.slice(0, toRemove).map(([key]) => key);
    
    for (const key of keysToRemove) {
      this.cache.delete(key);
    }
    
    console.log(`Vim Motion Trainer: Evicted ${keysToRemove.length} old cache entries`);
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
    
    if (keysToDelete.length > 0) {
      console.log(`Vim Motion Trainer: Cleaned up ${keysToDelete.length} expired cache entries`);
      this.saveCache(); // Don't await to avoid blocking
    }
    
    this.lastCleanup = now;
  }

  /**
   * Schedule periodic cache cleanup
   */
  private scheduleCleanup(): void {
    const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
    
    setInterval(() => {
      this.cleanupExpired();
    }, CLEANUP_INTERVAL);
  }

  /**
   * Calculate cache hit rate
   */
  private getHitRate(): number {
    const total = this.hitCount + this.missCount;
    return total === 0 ? 0 : (this.hitCount / total) * 100;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    // Save cache one final time
    this.saveCache();
  }
}