/**
 * Enhanced Dictionary API
 * 
 * Modular architecture supporting multiple dictionary providers:
 * - ECDICT: Local SQLite dictionary (3.4M entries)
 * - Google: Google Dictionary API (fallback)
 * - More providers can be added in providers/ directory
 */

import express, { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import config from './config';
import { initRedis, closeRedis } from './core/redis';
import { registry, createECDictProvider, createGoogleProvider, createSqliteDictProvider } from './providers';
import dictionaryRoutes from './routes/dictionary';

// ============================================================================
// Express App
// ============================================================================

const app = express();
const projectRoot = path.resolve(__dirname, '..');

function resolveDbPath(dbPath: string): string {
    if (!dbPath) return dbPath;
    return path.isAbsolute(dbPath) ? dbPath : path.resolve(projectRoot, dbPath);
}

// Required when running behind reverse proxies (Nginx/Cloudflare/LB)
// so rate-limit can read client IP from X-Forwarded-For safely.
const trustProxy = (config as any)?.server?.trustProxy ?? 1;
app.set('trust proxy', trustProxy);

// Request-level access log for easier production debugging.
app.use((req: Request, res: Response, next: NextFunction) => {
    const started = Date.now();
    res.on('finish', () => {
        const elapsed = Date.now() - started;
        console.log(`[HTTP] ${req.method} ${req.originalUrl} status=${res.statusCode} ip=${req.ip} elapsed=${elapsed}ms`);
    });
    next();
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 450,
    message: {
        title: 'Rate limit exceeded',
        message: 'Too many requests, please try again later.',
        resolution: 'Wait 5 minutes before making more requests.',
    },
});

app.use(limiter);

// ============================================================================
// Routes
// ============================================================================

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
    const providers = registry.getAll().map(p => ({
        name: p.name,
        displayName: p.displayName,
        available: p.isAvailable(),
    }));

    const ecdict = registry.get('ecdict') as any;

    res.json({
        status: 'ok',
        providers,
        ecdict: ecdict?.getWordCount?.() || 0,
        timestamp: new Date().toISOString(),
    });
});

/**
 * Dictionary API routes
 */
app.use('/api', dictionaryRoutes);

// ============================================================================
// Error Handler
// ============================================================================

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('[UNHANDLED ERROR]', err);
    res.status(500).json({
        title: 'Internal Error',
        message: 'An unexpected error occurred.',
        resolution: 'Please try again later.',
    });
});

// ============================================================================
// Startup
// ============================================================================

async function start(): Promise<void> {
    console.log('='.repeat(60));
    console.log('Enhanced Dictionary API');
    console.log('='.repeat(60));
    console.log('');

    // Initialize providers
    console.log('[STARTUP] Initializing providers...');
    console.log(`[STARTUP] Express trust proxy: ${String(trustProxy)}`);

    // 1. ECDICT Provider (priority: 100 - highest)
    try {
        const ecdictPath = resolveDbPath(config.ecdict.dbPath);
        console.log(`[STARTUP] ECDICT path: ${ecdictPath} exists=${fs.existsSync(ecdictPath)}`);
        const ecdictProvider = createECDictProvider(ecdictPath);
        registry.register(ecdictProvider, 100);
    } catch (err) {
        console.error('[STARTUP] Failed to load ECDICT:', err);
    }

    // 2. Optional local SQLite dictionary providers
    type LocalDictName = 'oxford_en_mac' | 'koen_mac' | 'jaen_mac' | 'deen_mac' | 'ruen_mac';
    const registerLocalDict = (
        name: LocalDictName,
        displayName: string,
        supportedLanguages: string[],
        priority: number
    ) => {
        const localDict = config.localDicts?.[name];
        if (!localDict?.enabled) {
            console.log(`[STARTUP] Skip ${name}: disabled`);
            return;
        }

        try {
            const dbPath = resolveDbPath(localDict.dbPath);
            console.log(`[STARTUP] ${name} path: ${dbPath} exists=${fs.existsSync(dbPath)}`);
            const provider = createSqliteDictProvider({
                name,
                displayName,
                supportedLanguages,
                dbPath,
            });
            registry.register(provider, priority);
        } catch (err) {
            console.error(`[STARTUP] Failed to load ${name}:`, err);
        }
    };

    // EN -> EN enrichment dictionary
    registerLocalDict('oxford_en_mac', 'Oxford EN-EN Dictionary', ['en'], 95);

    // Bi-directional language pair dictionaries
    registerLocalDict('koen_mac', 'Korean-English Dictionary', ['ko'], 90);
    registerLocalDict('jaen_mac', 'Japanese-English Dictionary', ['ja'], 90);
    registerLocalDict('deen_mac', 'German-English Dictionary', ['de'], 90);
    registerLocalDict('ruen_mac', 'Russian-English Dictionary', ['ru'], 90);

    // 3. Google Provider (priority: 50 - fallback)
    const googleProvider = createGoogleProvider();
    registry.register(googleProvider, 50);

    // Initialize Redis
    console.log('[STARTUP] Connecting to Redis...');
    try {
        initRedis(config.redis);
    } catch (err) {
        console.error('[STARTUP] Redis connection failed, caching disabled');
    }

    // Start server
    const port = config.server.port;
    app.listen(port, () => {
        console.log('');
        console.log(`[STARTUP] Server running on http://localhost:${port}`);
        console.log('');
        console.log('Providers:');
        for (const p of registry.getAll()) {
            const status = p.isAvailable() ? '✓' : '✗';
            console.log(`  ${status} ${p.displayName} (${p.name})`);
        }
        console.log('');
        console.log('Endpoints:');
        console.log(`  GET /health`);
        console.log(`  GET /api/v2/entries/:language/:word`);
        console.log('');
        console.log('='.repeat(60));
    });
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

process.on('SIGINT', async () => {
    console.log('\n[SHUTDOWN] Received SIGINT, closing connections...');
    await closeRedis();
    registry.closeAll();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n[SHUTDOWN] Received SIGTERM, closing connections...');
    await closeRedis();
    registry.closeAll();
    process.exit(0);
});

// Start the server
start().catch(console.error);

// ============================================================================
// Exports
// ============================================================================

export default app;
