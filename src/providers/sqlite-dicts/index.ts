/**
 * Generic provider for local SQLite dictionaries (Enjoy dict schema).
 */

import { DictionaryProvider } from '../base';
import { DataSource, DictionaryResponse, QueryOptions, QueryResult, createEmptyResponse } from '../../core/types';
import { SqliteDictionaryDatabase } from './database';

type LocalSqliteSource = Extract<
    DataSource,
    'oxford_en_mac' | 'koen_mac' | 'jaen_mac' | 'deen_mac' | 'ruen_mac'
>;

export interface SqliteDictProviderOptions {
    name: LocalSqliteSource;
    displayName: string;
    supportedLanguages: string[];
    dbPath: string;
}

export class SqliteDictProvider implements DictionaryProvider {
    readonly name: LocalSqliteSource;
    readonly displayName: string;
    readonly supportedLanguages: string[];

    private db: SqliteDictionaryDatabase;

    constructor(options: SqliteDictProviderOptions) {
        this.name = options.name;
        this.displayName = options.displayName;
        this.supportedLanguages = options.supportedLanguages;
        this.db = new SqliteDictionaryDatabase(options.dbPath);
    }

    init(): boolean {
        return this.db.init();
    }

    isAvailable(): boolean {
        return this.db.isAvailable();
    }

    getWordCount(): number {
        return this.db.getWordCount();
    }

    async query(word: string, _options?: QueryOptions): Promise<QueryResult> {
        if (!this.isAvailable()) {
            return {
                found: false,
                response: null,
                error: `${this.name} database not available`,
            };
        }

        const record = this.db.query(word);
        if (!record) {
            return {
                found: false,
                response: null,
            };
        }

        const response = this.transformRecord(record.word, record.definition);
        response.source = this.name;
        response.cached = false;

        return {
            found: true,
            response,
        };
    }

    isValidResult(response: DictionaryResponse | null): boolean {
        if (!response) return false;
        if (response.definitions.length === 0) return false;
        const first = response.definitions[0];
        return !!first?.definition?.trim();
    }

    close(): void {
        this.db.close();
    }

    private transformRecord(word: string, definition: string | null): DictionaryResponse {
        const response = createEmptyResponse(word);
        if (!definition) return response;

        // Keep dictionary definition payload as-is (HTML text) in the unified schema.
        response.definitions = [
            {
                partOfSpeech: '',
                definition,
                example: '',
                synonyms: [],
                antonyms: [],
            },
        ];

        return response;
    }
}

export function createSqliteDictProvider(options: SqliteDictProviderOptions): SqliteDictProvider {
    const provider = new SqliteDictProvider(options);
    provider.init();
    return provider;
}
