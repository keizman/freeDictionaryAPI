/**
 * Generic SQLite dictionary database for Enjoy-style dict schema:
 * - words(id, word, definition_id)
 * - definitions(id, key, definition)
 */

import Database from 'better-sqlite3';

export interface SqliteDictionaryRecord {
    word: string;
    key: string | null;
    definition: string | null;
}

export class SqliteDictionaryDatabase {
    private db: Database.Database | null = null;
    private readonly dbPath: string;
    private wordCount = 0;

    constructor(dbPath: string) {
        this.dbPath = dbPath;
    }

    init(): boolean {
        try {
            this.db = new Database(this.dbPath, { readonly: true });
            this.wordCount = this.count();
            console.log(`[SQLITE-DICT] Database opened: ${this.dbPath}`);
            console.log(`[SQLITE-DICT] Word count: ${this.wordCount.toLocaleString()}`);
            return true;
        } catch (err) {
            console.error(`[SQLITE-DICT] Failed to open database: ${err}`);
            console.log(`[SQLITE-DICT] Failed to open database: ${err}`);
            return false;
        }
    }

    isAvailable(): boolean {
        return this.db !== null;
    }

    query(word: string): SqliteDictionaryRecord | null {
        if (!this.db) return null;

        const stmt = this.db.prepare(`
      SELECT w.word AS word, d.key AS key, d.definition AS definition
      FROM words w
      JOIN definitions d ON d.id = w.definition_id
      WHERE w.word = ? COLLATE NOCASE
      LIMIT 1
    `);

        const row = stmt.get(word) as SqliteDictionaryRecord | undefined;
        return row || null;
    }

    count(): number {
        if (!this.db) return 0;
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM words');
        const result = stmt.get() as { count: number };
        return result.count;
    }

    getWordCount(): number {
        return this.wordCount;
    }

    close(): void {
        if (!this.db) return;
        this.db.close();
        this.db = null;
        console.log('[SQLITE-DICT] Database closed');
    }
}
