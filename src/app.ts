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
import config from './config';
import { initRedis, closeRedis } from './core/redis';
import { registry, createECDictProvider, createGoogleProvider } from './providers';
import dictionaryRoutes from './routes/dictionary';

// ============================================================================
// Express App
// ============================================================================

const app = express();

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

    // 1. ECDICT Provider (priority: 100 - highest)
    try {
        const ecdictProvider = createECDictProvider(config.ecdict.dbPath);
        registry.register(ecdictProvider, 100);
    } catch (err) {
        console.error('[STARTUP] Failed to load ECDICT:', err);
    }

    // 2. Google Provider (priority: 50 - fallback)
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
