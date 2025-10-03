/**
 * Client-side caching layer for API requests using localStorage
 * Reduces edge function invocations by serving cached responses
 */

const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'dow_cache_';
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE_MB = 8; // Leave some room (localStorage ~10MB limit)

type CacheEntry = {
  data: any;
  timestamp: number;
  version: string;
  url: string;
};

type CacheConfig = {
  ttl?: number; // Time to live in milliseconds
  bypassCache?: boolean; // Force fresh fetch
  cacheKey?: string; // Custom cache key (default: URL)
};

/**
 * Check if localStorage is available and working
 */
function isLocalStorageAvailable(): boolean {
  try {
    const testKey = '__test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get cache key for a URL
 */
function getCacheKey(url: string, customKey?: string): string {
  return `${CACHE_PREFIX}${customKey || url}`;
}

/**
 * Get cached entry if valid
 */
function getCachedEntry(cacheKey: string, ttlMs: number): CacheEntry | null {
  if (!isLocalStorageAvailable()) return null;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const entry: CacheEntry = JSON.parse(cached);

    // Check version
    if (entry.version !== CACHE_VERSION) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    // Check TTL
    const age = Date.now() - entry.timestamp;
    if (age > ttlMs) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return entry;
  } catch (error) {
    console.warn('[CachedFetch] Error reading cache:', error);
    return null;
  }
}

/**
 * Store entry in cache
 */
function setCacheEntry(cacheKey: string, url: string, data: any): void {
  if (!isLocalStorageAvailable()) return;

  try {
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      version: CACHE_VERSION,
      url,
    };

    localStorage.setItem(cacheKey, JSON.stringify(entry));
  } catch (error) {
    // Quota exceeded - try to make space
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn('[CachedFetch] Quota exceeded, clearing old entries');
      clearOldestEntries(5); // Remove 5 oldest entries

      // Try again
      try {
        const entry: CacheEntry = {
          data,
          timestamp: Date.now(),
          version: CACHE_VERSION,
          url,
        };
        localStorage.setItem(cacheKey, JSON.stringify(entry));
      } catch {
        console.warn('[CachedFetch] Still cannot cache after cleanup');
      }
    } else {
      console.warn('[CachedFetch] Error writing cache:', error);
    }
  }
}

/**
 * Clear oldest cache entries
 */
function clearOldestEntries(count: number): void {
  if (!isLocalStorageAvailable()) return;

  try {
    const entries: Array<{ key: string; timestamp: number }> = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        try {
          const entry: CacheEntry = JSON.parse(localStorage.getItem(key)!);
          entries.push({ key, timestamp: entry.timestamp });
        } catch {
          // Invalid entry, remove it
          localStorage.removeItem(key);
        }
      }
    }

    // Sort by timestamp (oldest first) and remove
    entries.sort((a, b) => a.timestamp - b.timestamp);
    entries.slice(0, count).forEach(({ key }) => {
      localStorage.removeItem(key);
    });
  } catch (error) {
    console.warn('[CachedFetch] Error clearing old entries:', error);
  }
}

/**
 * Cached fetch - drop-in replacement for fetch() with client-side caching
 *
 * @param url - URL to fetch
 * @param config - Cache configuration
 * @returns Promise that resolves to Response
 *
 * @example
 * const response = await cachedFetch('/api/leaderboards', { ttl: 24 * 60 * 60 * 1000 });
 * const data = await response.json();
 */
export async function cachedFetch(
  url: string,
  config: CacheConfig = {}
): Promise<Response> {
  const { ttl = DEFAULT_TTL_MS, bypassCache = false, cacheKey: customKey } = config;
  const cacheKey = getCacheKey(url, customKey);

  // Check cache first (unless bypassing)
  if (!bypassCache) {
    const cached = getCachedEntry(cacheKey, ttl);
    if (cached) {
      console.log(`[CachedFetch] Cache HIT for ${url} (age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);

      // Return a Response-like object with cached data
      return new Response(JSON.stringify(cached.data), {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'application/json',
          'X-Cache': 'HIT',
          'X-Cache-Age': String(Date.now() - cached.timestamp),
        },
      });
    }
  }

  // Cache miss or bypassed - fetch from network
  console.log(`[CachedFetch] Cache MISS for ${url}, fetching...`);

  try {
    const response = await fetch(url);

    // Only cache successful GET responses
    if (response.ok && response.status === 200) {
      // Clone response so we can read it twice
      const cloned = response.clone();
      const data = await cloned.json();

      // Store in cache
      setCacheEntry(cacheKey, url, data);

      return response;
    }

    return response;
  } catch (error) {
    console.error(`[CachedFetch] Fetch error for ${url}:`, error);
    throw error;
  }
}

/**
 * Clear all cached entries
 */
export function clearAllCache(): void {
  if (!isLocalStorageAvailable()) return;

  try {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`[CachedFetch] Cleared ${keysToRemove.length} cache entries`);
  } catch (error) {
    console.warn('[CachedFetch] Error clearing cache:', error);
  }
}

/**
 * Clear cache for specific URL
 */
export function clearCacheForUrl(url: string): void {
  if (!isLocalStorageAvailable()) return;

  try {
    const cacheKey = getCacheKey(url);
    localStorage.removeItem(cacheKey);
    console.log(`[CachedFetch] Cleared cache for ${url}`);
  } catch (error) {
    console.warn('[CachedFetch] Error clearing cache for URL:', error);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  count: number;
  sizeKB: number;
  oldestAge: number;
  entries: Array<{ url: string; ageSeconds: number; sizeKB: number }>;
} {
  const stats = {
    count: 0,
    sizeKB: 0,
    oldestAge: 0,
    entries: [] as Array<{ url: string; ageSeconds: number; sizeKB: number }>,
  };

  if (!isLocalStorageAvailable()) return stats;

  try {
    const now = Date.now();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        try {
          const value = localStorage.getItem(key)!;
          const entry: CacheEntry = JSON.parse(value);
          const age = now - entry.timestamp;
          const sizeKB = new Blob([value]).size / 1024;

          stats.count++;
          stats.sizeKB += sizeKB;
          stats.oldestAge = Math.max(stats.oldestAge, age);
          stats.entries.push({
            url: entry.url,
            ageSeconds: Math.round(age / 1000),
            sizeKB: Math.round(sizeKB * 10) / 10,
          });
        } catch {
          // Ignore invalid entries
        }
      }
    }

    stats.sizeKB = Math.round(stats.sizeKB * 10) / 10;
    stats.entries.sort((a, b) => b.ageSeconds - a.ageSeconds);
  } catch (error) {
    console.warn('[CachedFetch] Error getting cache stats:', error);
  }

  return stats;
}

/**
 * Check if cache is getting too large and cleanup if needed
 */
export function checkAndCleanupCache(): void {
  const stats = getCacheStats();
  const sizeMB = stats.sizeKB / 1024;

  if (sizeMB > MAX_CACHE_SIZE_MB) {
    console.warn(`[CachedFetch] Cache size ${sizeMB.toFixed(2)}MB exceeds limit, cleaning up`);
    clearOldestEntries(Math.ceil(stats.count * 0.3)); // Remove 30% of entries
  }
}
