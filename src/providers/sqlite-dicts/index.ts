/**
 * Generic provider for local SQLite dictionaries (Enjoy dict schema).
 */

import { DictionaryProvider } from '../base';
import { DataSource, DictionaryResponse, QueryOptions, QueryResult, createEmptyResponse } from '../../core/types';
import { SqliteDictionaryDatabase } from './database';
const { JSDOM } = require('jsdom');

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

        response.definitions = this.parseDefinitions(definition);

        return response;
    }

    private parseDefinitions(rawDefinition: string): DictionaryResponse['definitions'] {
        if (!this.looksLikeHtml(rawDefinition)) {
            const plain = this.cleanText(rawDefinition);
            return plain
                ? [
                      {
                          partOfSpeech: '',
                          definition: plain,
                          example: '',
                          synonyms: [],
                          antonyms: [],
                      },
                  ]
                : [];
        }

        try {
            const dom = new JSDOM(rawDefinition);
            const doc: any = dom.window.document;

            const result: DictionaryResponse['definitions'] = [];
            const dedupe = new Set<string>();

            // Oxford-like structure: each .msDict usually holds one sense.
            const senseNodes: any[] = Array.from(doc.querySelectorAll('.msDict') as any);
            for (const node of senseNodes) {
                const defNode = node.querySelector('.df');
                const definition = this.cleanText(defNode?.textContent || '');
                if (!definition) continue;

                const partOfSpeech = this.extractPartOfSpeech(node);
                const example = this.cleanText(node.querySelector('.eg')?.textContent || '');
                const key = `${partOfSpeech}|${definition}`;
                if (dedupe.has(key)) continue;
                dedupe.add(key);

                result.push({
                    partOfSpeech,
                    definition,
                    example,
                    synonyms: [],
                    antonyms: [],
                });
            }

            if (result.length > 0) {
                return result;
            }

            const textFallback = this.cleanText(doc.body?.textContent || doc.documentElement?.textContent || '');
            if (!textFallback) return [];
            return [
                {
                    partOfSpeech: '',
                    definition: textFallback,
                    example: '',
                    synonyms: [],
                    antonyms: [],
                },
            ];
        } catch {
            const plain = this.cleanText(rawDefinition);
            if (!plain) return [];
            return [
                {
                    partOfSpeech: '',
                    definition: plain,
                    example: '',
                    synonyms: [],
                    antonyms: [],
                },
            ];
        }
    }

    private extractPartOfSpeech(node: any): string {
        const se1 = node.closest('.se1');
        if (!se1) return '';

        const raw = this.cleanText(
            se1.querySelector('.pos .tg_pos')?.textContent ||
                se1.querySelector('.pos')?.textContent ||
                ''
        ).toLowerCase();

        if (!raw) return '';

        if (raw.includes('noun')) return 'noun';
        if (raw.includes('verb')) return 'verb';
        if (raw.includes('adjective')) return 'adjective';
        if (raw.includes('adverb')) return 'adverb';
        if (raw.includes('pronoun')) return 'pronoun';
        if (raw.includes('preposition')) return 'preposition';
        if (raw.includes('conjunction')) return 'conjunction';
        if (raw.includes('interjection')) return 'interjection';
        if (raw.includes('determiner')) return 'determiner';
        if (raw.includes('number') || raw.includes('numeral')) return 'numeral';

        return raw;
    }

    private looksLikeHtml(text: string): boolean {
        return /<\/?[a-z][\s\S]*>/i.test(text);
    }

    private cleanText(text: string): string {
        if (!text) return '';
        return text
            .replace(/\s+/g, ' ')
            .replace(/\u00A0/g, ' ')
            .replace(/\s*\|\s*$/g, '')
            .replace(/\s*:\s*$/g, '')
            .trim();
    }
}

export function createSqliteDictProvider(options: SqliteDictProviderOptions): SqliteDictProvider {
    const provider = new SqliteDictProvider(options);
    provider.init();
    return provider;
}
