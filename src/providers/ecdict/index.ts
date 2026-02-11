/**
 * ECDICT Provider
 * Local SQLite-based English-Chinese dictionary (3.4M entries)
 */

import { DictionaryProvider } from '../base';
import { DictionaryResponse, QueryOptions, QueryResult, createEmptyResponse } from '../../core/types';
import { ECDictDatabase } from './database';
import { parseExchange, parseTranslation, parseDefinition, buildFrequency } from './parser';

/**
 * ECDICT Dictionary Provider
 */
export class ECDictProvider implements DictionaryProvider {
    readonly name = 'ecdict';
    readonly displayName = 'ECDICT 英汉词典';
    readonly supportedLanguages = ['en'];

    private db: ECDictDatabase;

    constructor(dbPath: string) {
        this.db = new ECDictDatabase(dbPath);
    }

    /**
     * Initialize the provider
     */
    init(): boolean {
        return this.db.init();
    }

    /**
     * Check if provider is available
     */
    isAvailable(): boolean {
        return this.db.isAvailable();
    }

    /**
     * Get word count
     */
    getWordCount(): number {
        return this.db.getWordCount();
    }

    /**
     * Query a word
     */
    async query(word: string, options?: QueryOptions): Promise<QueryResult> {
        if (!this.isAvailable()) {
            return {
                found: false,
                response: null,
                error: 'ECDICT database not available',
            };
        }

        const record = this.db.query(word);

        if (!record) {
            return {
                found: false,
                response: null,
            };
        }

        // Transform record to response
        const response = this.transformRecord(record);

        return {
            found: true,
            response,
        };
    }

    /**
     * Check if response is valid (has meaningful translation)
     */
    isValidResult(response: DictionaryResponse | null): boolean {
        if (!response) return false;
        // Some entries may have EN definitions but empty CN translations.
        // Treat either side as a valid hit so EN lookup can still return data.
        return response.translations.length > 0 || response.definitions.length > 0;
    }

    /**
     * Transform database record to unified response
     */
    private transformRecord(record: any): DictionaryResponse {
        const response = createEmptyResponse(record.word);

        // Phonetics
        if (record.phonetic) {
            response.phonetics.uk = record.phonetic;
            response.phonetics.us = record.phonetic;
        }

        // Audio - not provided by ECDICT (client handles TTS)
        response.audio = { uk: '', us: '' };

        // Translations (Chinese)
        if (record.translation) {
            response.translations = parseTranslation(record.translation);
        }

        // Definitions (English)
        if (record.definition) {
            response.definitions = parseDefinition(record.definition);
        }

        // Word forms (exchange)
        if (record.exchange) {
            response.exchange = parseExchange(record.exchange);
        }

        // Frequency
        response.frequency = buildFrequency(
            record.collins,
            record.oxford,
            record.bnc,
            record.frq,
            record.tag
        );

        // Source
        response.source = 'ecdict';
        response.cached = false;

        return response;
    }

    /**
     * Close provider
     */
    close(): void {
        this.db.close();
    }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create ECDICT provider instance
 */
export function createECDictProvider(dbPath: string): ECDictProvider {
    const provider = new ECDictProvider(dbPath);
    provider.init();
    return provider;
}
