/**
 * ECDICT Database Operations
 * SQLite-based local dictionary access
 */

import Database from 'better-sqlite3';

// ============================================================================
// Types
// ============================================================================

/**
 * Raw database record structure
 */
export interface ECDictRecord {
    id: number;
    word: string;
    sw: string;
    phonetic: string | null;
    definition: string | null;
    translation: string | null;
    pos: string | null;
    collins: number | null;
    oxford: number | null;
    tag: string | null;
    bnc: number | null;
    frq: number | null;
    exchange: string | null;
    detail: string | null;
    audio: string | null;
}

/**
 * Match result
 */
export interface MatchResult {
    id: number;
    word: string;
}

// ============================================================================
// Database Class
// ============================================================================

/**
 * ECDICT SQLite Database
 */
export class ECDictDatabase {
    private db: Database.Database | null = null;
    private dbPath: string;
    private wordCount: number = 0;

    constructor(dbPath: string) {
        this.dbPath = dbPath;
    }

    /**
     * Initialize database connection
     */
    init(): boolean {
        try {
            this.db = new Database(this.dbPath, { readonly: true });
            this.wordCount = this.count();
            console.log(`[ECDICT] Database opened: ${this.dbPath}`);
            console.log(`[ECDICT] Word count: ${this.wordCount.toLocaleString()}`);
            return true;
        } catch (err) {
            console.error(`[ECDICT] Failed to open database: ${err}`);
            return false;
        }
    }

    /**
     * Check if database is available
     */
    isAvailable(): boolean {
        return this.db !== null;
    }

    /**
     * Query single word
     */
    query(word: string): ECDictRecord | null {
        if (!this.db) return null;

        const stmt = this.db.prepare('SELECT * FROM stardict WHERE word = ? COLLATE NOCASE');
        const record = stmt.get(word) as ECDictRecord | undefined;

        if (record) {
            console.log(`[ECDICT] word="${word}" found=true has_translation=${!!record.translation}`);
        } else {
            console.log(`[ECDICT] word="${word}" found=false`);
        }

        return record || null;
    }

    /**
     * Query by ID
     */
    queryById(id: number): ECDictRecord | null {
        if (!this.db) return null;

        const stmt = this.db.prepare('SELECT * FROM stardict WHERE id = ?');
        return (stmt.get(id) as ECDictRecord) || null;
    }

    /**
     * Match words by prefix
     */
    match(prefix: string, limit: number = 10): MatchResult[] {
        if (!this.db) return [];

        const stmt = this.db.prepare(`
      SELECT id, word FROM stardict 
      WHERE word >= ? 
      ORDER BY word COLLATE NOCASE 
      LIMIT ?
    `);

        return stmt.all(prefix, limit) as MatchResult[];
    }

    /**
     * Get total word count
     */
    count(): number {
        if (!this.db) return 0;

        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM stardict');
        const result = stmt.get() as { count: number };
        return result.count;
    }

    /**
     * Get cached word count
     */
    getWordCount(): number {
        return this.wordCount;
    }

    /**
     * Close database
     */
    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.log('[ECDICT] Database closed');
        }
    }
}
