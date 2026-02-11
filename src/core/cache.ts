/**
 * Cache Service Module
 * Provides Redis-based caching with hit tracking
 * 
 * Cache entry structure:
 * {
 *   data: <response object>,
 *   hit_count: number,
 *   created_at: timestamp,
 *   last_hit_at: timestamp
 * }
 */

import { getRedis, getCacheTTLDays } from './redis';

// ============================================================================
// Types
// ============================================================================

/**
 * Cache entry wrapper
 */
export interface CacheEntry<T> {
    data: T;
    hit_count: number;
    created_at: number;
    last_hit_at: number;
}

/**
 * Cache statistics for logging
 */
export interface CacheStats {
    hit: boolean;
    hit_count?: number;
    age_days?: number;
}

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Generate cache key for dictionary entry
 */
export function makeCacheKey(word: string, language: string): string {
    return `dict:${language}:${word.toLowerCase()}`;
}

// ============================================================================
// Cache Service
// ============================================================================

/**
 * Get cached entry
 * Increments hit_count and updates last_hit_at on hit
 * 
 * @returns Cached data or null if not found
 */
export async function getCached<T>(word: string, language: string): Promise<{ data: T; stats: CacheStats } | null> {
    const redis = getRedis();
    if (!redis) {
        console.log(`[CACHE MISS] word="${word}" lang="${language}" (Redis not connected)`);
        return null;
    }
    if (redis.status !== 'ready') {
        console.log(`[CACHE MISS] word="${word}" lang="${language}" (Redis status=${redis.status})`);
        return null;
    }

    const key = makeCacheKey(word, language);

    try {
        const raw = await redis.get(key);
        if (!raw) {
            console.log(`[CACHE MISS] word="${word}" lang="${language}"`);
            return null;
        }

        const entry: CacheEntry<T> = JSON.parse(raw);

        // Update hit stats
        entry.hit_count += 1;
        entry.last_hit_at = Date.now();

        // Get current TTL to preserve it
        const ttl = await redis.ttl(key);
        if (ttl > 0) {
            // Update entry with new stats, keeping remaining TTL
            await redis.setex(key, ttl, JSON.stringify(entry));
        }

        const ageDays = Math.floor((Date.now() - entry.created_at) / (1000 * 60 * 60 * 24));
        console.log(`[CACHE HIT] word="${word}" lang="${language}" hit_count=${entry.hit_count} age=${ageDays}d`);

        return {
            data: entry.data,
            stats: {
                hit: true,
                hit_count: entry.hit_count,
                age_days: ageDays,
            },
        };
    } catch (err) {
        console.error(`[CACHE ERROR] word="${word}" lang="${language}":`, err);
        return null;
    }
}

/**
 * Set cache entry
 * Only caches if source is not 'ecdict' (local dictionary doesn't need caching)
 * 
 * @param word Word being cached
 * @param language Language code
 * @param data Response data to cache
 * @param source Data source ('ecdict', 'google', etc)
 */
export async function setCached<T>(
    word: string,
    language: string,
    data: T,
    source: string
): Promise<boolean> {
    // Skip caching for local dictionary results
    if (source === 'ecdict') {
        console.log(`[CACHE SKIP] word="${word}" lang="${language}" source=ecdict (local, no cache needed)`);
        return false;
    }

    const redis = getRedis();
    if (!redis) {
        console.log(`[CACHE SKIP] word="${word}" lang="${language}" (Redis not connected)`);
        return false;
    }
    if (redis.status !== 'ready') {
        console.log(`[CACHE SKIP] word="${word}" lang="${language}" (Redis status=${redis.status})`);
        return false;
    }

    const key = makeCacheKey(word, language);

    try {
        const ttlDays = await getCacheTTLDays();
        const ttlSeconds = ttlDays * 24 * 60 * 60;

        const entry: CacheEntry<T> = {
            data,
            hit_count: 0,
            created_at: Date.now(),
            last_hit_at: Date.now(),
        };

        await redis.setex(key, ttlSeconds, JSON.stringify(entry));
        console.log(`[CACHE SET] word="${word}" lang="${language}" ttl=${ttlDays}d`);
        return true;
    } catch (err) {
        console.error(`[CACHE ERROR] Failed to set word="${word}":`, err);
        return false;
    }
}

/**
 * Delete cached entry
 */
export async function deleteCached(word: string, language: string): Promise<boolean> {
    const redis = getRedis();
    if (!redis) {
        return false;
    }
    if (redis.status !== 'ready') {
        return false;
    }

    const key = makeCacheKey(word, language);

    try {
        await redis.del(key);
        console.log(`[CACHE DEL] word="${word}" lang="${language}"`);
        return true;
    } catch (err) {
        console.error(`[CACHE ERROR] Failed to delete word="${word}":`, err);
        return false;
    }
}

/**
 * Get cache entry info without incrementing hit count
 */
export async function getCacheInfo(word: string, language: string): Promise<CacheEntry<unknown> | null> {
    const redis = getRedis();
    if (!redis) {
        return null;
    }
    if (redis.status !== 'ready') {
        return null;
    }

    const key = makeCacheKey(word, language);

    try {
        const raw = await redis.get(key);
        if (!raw) {
            return null;
        }
        return JSON.parse(raw);
    } catch (err) {
        return null;
    }
}

// ============================================================================
// Exports
// ============================================================================

export default {
    makeCacheKey,
    getCached,
    setCached,
    deleteCached,
    getCacheInfo,
};
