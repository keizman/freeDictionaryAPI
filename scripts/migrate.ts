/**
 * CSV to SQLite Migration Script
 * Converts ECDICT CSV file to SQLite database
 * 
 * Usage: npx ts-node scripts/migrate.ts [csvPath] [dbPath]
 * Default: Uses stardict/stardict.csv (3.4M entries)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import Database from 'better-sqlite3';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_DB_PATH = './data/ecdict.db';
const BATCH_SIZE = 5000; // Records per transaction

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Strip word to alphanumeric lowercase for fuzzy matching
 */
function stripWord(word: string): string {
    return word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

/**
 * Decode CSV escape sequences
 * Handles: \\n -> \n, \\r -> \r, \\\\ -> \\
 */
function decodeCSVValue(text: string | null): string | null {
    if (!text) return null;

    let result = '';
    let i = 0;
    const len = text.length;

    while (i < len) {
        const c = text[i];
        if (c === '\\' && i + 1 < len) {
            const next = text[i + 1];
            if (next === 'n') {
                result += '\n';
                i += 2;
                continue;
            } else if (next === 'r') {
                result += '\r';
                i += 2;
                continue;
            } else if (next === '\\') {
                result += '\\';
                i += 2;
                continue;
            }
        }
        result += c;
        i++;
    }

    return result;
}

/**
 * Parse CSV line (handles quoted fields)
 */
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const c = line[i];

        if (c === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Escaped quote
                current += '"';
                i++;
            } else {
                // Toggle quote mode
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += c;
        }
    }

    result.push(current);
    return result;
}

/**
 * Safe parseInt with null handling
 */
function safeInt(text: string | undefined): number | null {
    if (!text || text.trim() === '') return null;
    const num = parseInt(text, 10);
    return isNaN(num) ? null : num;
}

// ============================================================================
// Migration
// ============================================================================

async function migrate(csvPath: string, dbPath: string): Promise<void> {
    console.log('='.repeat(60));
    console.log('ECDICT CSV to SQLite Migration');
    console.log('='.repeat(60));
    console.log(`Source: ${csvPath}`);
    console.log(`Target: ${dbPath}`);
    console.log('');

    // Check source file exists
    if (!fs.existsSync(csvPath)) {
        console.error(`ERROR: CSV file not found: ${csvPath}`);
        process.exit(1);
    }

    // Create data directory if needed
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`Created directory: ${dbDir}`);
    }

    // Remove existing database
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log(`Removed existing database: ${dbPath}`);
    }

    // Create database
    const db = new Database(dbPath);
    console.log(`Created database: ${dbPath}`);

    // Create table (matching Python stardict.py schema)
    db.exec(`
    CREATE TABLE IF NOT EXISTS "stardict" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL UNIQUE,
      "word" VARCHAR(64) COLLATE NOCASE NOT NULL UNIQUE,
      "sw" VARCHAR(64) COLLATE NOCASE NOT NULL,
      "phonetic" VARCHAR(64),
      "definition" TEXT,
      "translation" TEXT,
      "pos" VARCHAR(16),
      "collins" INTEGER DEFAULT(0),
      "oxford" INTEGER DEFAULT(0),
      "tag" VARCHAR(64),
      "bnc" INTEGER DEFAULT(NULL),
      "frq" INTEGER DEFAULT(NULL),
      "exchange" TEXT,
      "detail" TEXT,
      "audio" TEXT
    );
  `);
    console.log('Created table: stardict');

    // Prepare insert statement
    const insert = db.prepare(`
    INSERT OR IGNORE INTO stardict 
    (word, sw, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange, detail, audio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

    // Read CSV line by line
    const fileStream = fs.createReadStream(csvPath, { encoding: 'utf-8' });
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    let lineNum = 0;
    let inserted = 0;
    let skipped = 0;
    let batch: any[][] = [];
    const startTime = Date.now();

    // Track unique words
    const seenWords = new Set<string>();

    // Begin transaction
    const insertBatch = db.transaction((records: any[][]) => {
        for (const record of records) {
            insert.run(...record);
        }
    });

    for await (const line of rl) {
        lineNum++;

        // Skip header
        if (lineNum === 1) {
            console.log(`Header: ${line.substring(0, 100)}...`);
            continue;
        }

        // Parse CSV line
        const fields = parseCSVLine(line);
        if (fields.length < 1 || !fields[0]) {
            skipped++;
            continue;
        }

        // CSV columns: word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio
        const word = fields[0];
        const wordLower = word.toLowerCase();

        // Skip duplicates
        if (seenWords.has(wordLower)) {
            skipped++;
            continue;
        }
        seenWords.add(wordLower);

        // Build record
        const record = [
            word,                              // word
            stripWord(word),                   // sw (stripped word)
            decodeCSVValue(fields[1]) || null, // phonetic
            decodeCSVValue(fields[2]) || null, // definition
            decodeCSVValue(fields[3]) || null, // translation
            fields[4] || null,                 // pos
            safeInt(fields[5]) ?? 0,           // collins
            safeInt(fields[6]) ?? 0,           // oxford
            fields[7] || null,                 // tag
            safeInt(fields[8]),                // bnc
            safeInt(fields[9]),                // frq
            fields[10] || null,                // exchange
            fields[11] || null,                // detail
            fields[12] || null,                // audio
        ];

        batch.push(record);

        // Insert batch
        if (batch.length >= BATCH_SIZE) {
            insertBatch(batch);
            inserted += batch.length;
            batch = [];

            // Progress report
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = Math.round(inserted / elapsed);
            process.stdout.write(`\rProcessed: ${inserted.toLocaleString()} words (${rate}/s)    `);
        }
    }

    // Insert remaining
    if (batch.length > 0) {
        insertBatch(batch);
        inserted += batch.length;
    }

    console.log('');
    console.log('');
    console.log('Creating indexes...');

    // Create indexes (matching Python stardict.py)
    db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS "stardict_1" ON stardict (id);
    CREATE UNIQUE INDEX IF NOT EXISTS "stardict_2" ON stardict (word);
    CREATE INDEX IF NOT EXISTS "stardict_3" ON stardict (sw, word COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS "sd_1" ON stardict (word COLLATE NOCASE);
  `);
    console.log('Created indexes: stardict_1, stardict_2, stardict_3, sd_1');

    // Optimize
    db.exec('VACUUM');
    db.exec('ANALYZE');
    console.log('Optimized database');

    // Final stats
    const elapsed = (Date.now() - startTime) / 1000;
    const dbSize = fs.statSync(dbPath).size;

    console.log('');
    console.log('='.repeat(60));
    console.log('Migration Complete!');
    console.log('='.repeat(60));
    console.log(`Total lines processed: ${lineNum.toLocaleString()}`);
    console.log(`Words inserted: ${inserted.toLocaleString()}`);
    console.log(`Skipped (duplicates/empty): ${skipped.toLocaleString()}`);
    console.log(`Time elapsed: ${elapsed.toFixed(1)}s`);
    console.log(`Database size: ${(dbSize / 1024 / 1024).toFixed(1)} MB`);
    console.log('');

    // Verify
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM stardict');
    const countResult = countStmt.get() as { count: number };
    console.log(`Verification: ${countResult.count.toLocaleString()} records in database`);

    // Sample query
    const sampleStmt = db.prepare('SELECT word, phonetic, translation FROM stardict WHERE word = ?');
    const sample = sampleStmt.get('package');
    if (sample) {
        console.log('');
        console.log('Sample query (word="package"):');
        console.log(JSON.stringify(sample, null, 2));
    }

    db.close();
}

// ============================================================================
// Main
// ============================================================================

const args = process.argv.slice(2);
const csvPath = args[0];
const dbPath = args[1] || DEFAULT_DB_PATH;

if (!csvPath) {
    console.error('Usage: npx ts-node scripts/migrate.ts <csv-path> [db-path]');
    console.error('');
    console.error('Example:');
    console.error('  npx ts-node scripts/migrate.ts ./stardict.csv ./data/ecdict.db');
    console.error('');
    console.error('Download ECDICT CSV from: https://github.com/skywind3000/ECDICT/releases');
    process.exit(1);
}

migrate(csvPath, dbPath).catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});

