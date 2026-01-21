/**
 * Redis Client Module
 * Provides connection management and basic operations
 */

import Redis from 'ioredis';

// ============================================================================
// Types
// ============================================================================

export interface RedisConfig {
    connectionString: string;
    defaultTTLDays: number;
}

// ============================================================================
// Redis Client
// ============================================================================

let redisClient: Redis | null = null;
let redisConfig: RedisConfig | null = null;

/**
 * Initialize Redis connection
 */
export function initRedis(config: RedisConfig): Redis {
    if (redisClient) {
        return redisClient;
    }

    redisConfig = config;
    redisClient = new Redis(config.connectionString, {
        retryStrategy: (times) => {
            if (times > 3) {
                console.error('[REDIS] Connection failed after 3 retries');
                return null; // Stop retrying
            }
            return Math.min(times * 200, 2000);
        },
        maxRetriesPerRequest: 3,
    });

    redisClient.on('connect', () => {
        console.log('[REDIS] Connected successfully');
    });

    redisClient.on('error', (err) => {
        console.error('[REDIS] Connection error:', err.message);
    });

    redisClient.on('close', () => {
        console.log('[REDIS] Connection closed');
    });

    return redisClient;
}

/**
 * Get Redis client instance
 */
export function getRedis(): Redis | null {
    return redisClient;
}

/**
 * Get cache TTL from Redis config key
 * Falls back to default if not set
 */
export async function getCacheTTLDays(): Promise<number> {
    if (!redisClient || !redisConfig) {
        return 30; // Default
    }

    try {
        const ttlStr = await redisClient.get('tl_config:cache_ttl_days');
        if (ttlStr) {
            const ttl = parseInt(ttlStr, 10);
            if (!isNaN(ttl) && ttl > 0) {
                return ttl;
            }
        }
    } catch (err) {
        console.error('[REDIS] Error getting cache TTL:', err);
    }

    return redisConfig.defaultTTLDays || 30;
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        console.log('[REDIS] Disconnected');
    }
}

// ============================================================================
// Exports
// ============================================================================

export default {
    initRedis,
    getRedis,
    getCacheTTLDays,
    closeRedis,
};
