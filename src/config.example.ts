/**
 * Configuration Example
 * Copy this file to config.ts and fill in your values
 */

export interface Config {
    redis: {
        connectionString: string;
        defaultTTLDays: number;
    };
    ecdict: {
        dbPath: string;
    };
    server: {
        port: number;
    };
}

const config: Config = {
    redis: {
        // Redis connection string
        // Format: redis://[user]:[password]@[host]:[port]/[db]
        connectionString: 'redis://default:YOUR_PASSWORD@YOUR_HOST:PORT/DB',
        // Default TTL in days (can be overridden via Redis key "tl_config:cache_ttl_days")
        defaultTTLDays: 30,
    },
    ecdict: {
        // SQLite database path (download from release or use migration script)
        dbPath: './data/ecdict.db',
    },
    server: {
        port: 9000,
    },
};

export default config;
