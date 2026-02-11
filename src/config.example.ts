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
        trustProxy?: boolean | number;
    };
    localDicts?: {
        oxford_en_mac?: {
            enabled: boolean;
            dbPath: string;
        };
        koen_mac?: {
            enabled: boolean;
            dbPath: string;
        };
        jaen_mac?: {
            enabled: boolean;
            dbPath: string;
        };
        deen_mac?: {
            enabled: boolean;
            dbPath: string;
        };
        ruen_mac?: {
            enabled: boolean;
            dbPath: string;
        };
    };
    localDictLifecycle?: {
        // Idle release timeout for lazy local dictionaries (non-EN)
        idleReleaseMs?: number;
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
        // Set to 1 when app is behind one reverse proxy (recommended for Nginx/LB)
        trustProxy: 1,
    },
    localDicts: {
        // EN -> EN definitions (used to enrich ECDICT "en" response)
        oxford_en_mac: {
            enabled: false,
            dbPath: './data/oxford_en_mac.sqlite',
        },
        // Bi-directional pair dictionaries (query via corresponding language code)
        koen_mac: {
            enabled: false,
            dbPath: './data/koen_mac.sqlite',
        },
        jaen_mac: {
            enabled: false,
            dbPath: './data/jaen_mac.sqlite',
        },
        deen_mac: {
            enabled: false,
            dbPath: './data/deen_mac.sqlite',
        },
        ruen_mac: {
            enabled: false,
            dbPath: './data/ruen_mac.sqlite',
        },
    },
    localDictLifecycle: {
        // Default 10 minutes. For local verification you can set 10000 (10s).
        idleReleaseMs: 600000,
    },
};

export default config;
