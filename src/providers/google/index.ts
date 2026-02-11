/**
 * Google Dictionary Provider
 * Fallback provider using Google Dictionary API proxy
 */

import { DictionaryProvider } from '../base';
import { DictionaryResponse, QueryOptions, QueryResult, createEmptyResponse } from '../../core/types';
import config from '../../config';
const fetch = require('node-fetch');

// Import legacy dictionary module
const legacyDictionary = require('../../../modules/dictionary');

/**
 * Google Dictionary Provider
 */
export class GoogleProvider implements DictionaryProvider {
    readonly name = 'google';
    readonly displayName = 'DictionaryAPI.dev (fallback)';
    readonly supportedLanguages = ['en', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'ru', 'pt-BR', 'ar', 'tr'];

    private available: boolean = true;
    private readonly dictionaryApiBaseUrl: string;
    private readonly disableGoogleSearch: boolean;

    constructor() {
        this.dictionaryApiBaseUrl =
            (
                process.env.DICTIONARY_API_BASE_URL ||
                (config as any)?.fallback?.dictionary_api_base_url ||
                'https://api.dictionaryapi.dev/api/v2'
            ).replace(/\/+$/, '');

        this.disableGoogleSearch = this.resolveDisableGoogleSearch();
    }

    /**
     * Check if provider is available
     */
    isAvailable(): boolean {
        return this.available;
    }

    /**
     * Query a word
     */
    async query(word: string, options?: QueryOptions): Promise<QueryResult> {
        const language = options?.language || 'en';

        console.log(
            `[GOOGLE] Querying dictionaryapi.dev word="${word}" lang="${language}" disable_google_search=${String(
                this.disableGoogleSearch
            )}`
        );

        try {
            const primaryResult = await this.queryDictionaryApiDev(word, language);
            if (primaryResult.found) {
                return primaryResult;
            }

            // Keep legacy Google scraping logic as optional backup path.
            if (!this.disableGoogleSearch) {
                console.log(`[GOOGLE] fallback to legacy google scraping word="${word}" lang="${language}"`);
                const legacyResult = await this.queryLegacyGoogle(word, language);
                if (legacyResult.found) {
                    return legacyResult;
                }
                return legacyResult;
            }

            console.log(`[GOOGLE] legacy google scraping disabled by disable_google_search`);
            return primaryResult;
        } catch (err: any) {
            console.error(`[GOOGLE] Error querying word="${word}":`, err.message);
            return {
                found: false,
                response: null,
                error: err.message,
            };
        }
    }

    private async queryDictionaryApiDev(word: string, language: string): Promise<QueryResult> {
        const languageCandidates = this.buildLanguageCandidates(language);
        let lastError = '';

        for (const lang of languageCandidates) {
            const url = `${this.dictionaryApiBaseUrl}/entries/${encodeURIComponent(lang)}/${encodeURIComponent(word)}`;
            try {
                const res = await fetch(url, { method: 'GET' });
                console.log(`[GOOGLE] dictionaryapi.dev status=${res.status} lang="${lang}" word="${word}"`);

                if (res.status === 404) {
                    continue;
                }

                if (res.status !== 200) {
                    const bodyText = await res.text();
                    lastError = `dictionaryapi.dev status ${res.status} body=${bodyText.slice(0, 200)}`;
                    continue;
                }

                const data = await res.json();
                if (!Array.isArray(data) || data.length === 0) {
                    continue;
                }

                const response = this.transformGoogleResponse(data, word);
                console.log(`[GOOGLE] dictionaryapi.dev word="${word}" found=true definitions=${response.definitions.length}`);
                return {
                    found: true,
                    response,
                };
            } catch (err: any) {
                lastError = err?.message || String(err);
                console.error(`[GOOGLE] dictionaryapi.dev error word="${word}" lang="${lang}":`, lastError);
            }
        }

        return {
            found: false,
            response: null,
            error: lastError || `dictionaryapi.dev no definitions for "${word}"`,
        };
    }

    private async queryLegacyGoogle(word: string, language: string): Promise<QueryResult> {
        try {
            const googleResult = await legacyDictionary.findDefinitions(word, language, { include: [] });

            if (!googleResult || googleResult.length === 0) {
                console.log(`[GOOGLE] legacy word="${word}" not found`);
                return {
                    found: false,
                    response: null,
                };
            }

            const response = this.transformGoogleResponse(googleResult, word);
            console.log(`[GOOGLE] legacy word="${word}" found=true definitions=${response.definitions.length}`);

            return {
                found: true,
                response,
            };
        } catch (err: any) {
            console.error(`[GOOGLE] legacy error querying word="${word}":`, err.message);
            return {
                found: false,
                response: null,
                error: err.message,
            };
        }
    }

    private buildLanguageCandidates(language: string): string[] {
        const candidates: string[] = [];
        const normalized = String(language || '').trim();
        if (!normalized) return ['en'];

        candidates.push(normalized);

        // Some calls use region variants like pt-BR.
        if (normalized.includes('-')) {
            candidates.push(normalized.split('-')[0]);
        }

        // Keep API compatibility with old code paths using en_US / en_GB.
        if (normalized === 'en_US' || normalized === 'en_GB') {
            candidates.push('en');
        }

        return Array.from(new Set(candidates));
    }

    private resolveDisableGoogleSearch(): boolean {
        const envValue = process.env.DISABLE_GOOGLE_SEARCH;
        if (envValue !== undefined) {
            return ['1', 'true', 'yes', 'on'].includes(envValue.toLowerCase());
        }

        const configValue = (config as any)?.fallback?.disable_google_search;
        if (typeof configValue === 'boolean') {
            return configValue;
        }

        // Safe default: disable fragile scraping path unless explicitly enabled.
        return true;
    }

    /**
     * Check if response is valid
     */
    isValidResult(response: DictionaryResponse | null): boolean {
        if (!response) return false;
        if (response.definitions.length === 0) return false;
        return true;
    }

    /**
     * Transform Google API response to unified format
     */
    private transformGoogleResponse(googleData: any[], word: string): DictionaryResponse {
        if (!googleData || googleData.length === 0) {
            return createEmptyResponse(word);
        }

        const entry = googleData[0];
        const response = createEmptyResponse(entry.word || word);

        // Phonetics
        if (entry.phonetics && Array.isArray(entry.phonetics)) {
            for (const p of entry.phonetics) {
                if (p.audio) {
                    if (p.audio.includes('_gb_') || p.audio.includes('-uk')) {
                        response.phonetics.uk = p.text || '';
                        response.audio.uk = p.audio;
                    } else if (p.audio.includes('_us_') || p.audio.includes('-us')) {
                        response.phonetics.us = p.text || '';
                        response.audio.us = p.audio;
                    }
                }

                if (!response.phonetics.uk && p.text) {
                    response.phonetics.uk = p.text;
                }
                if (!response.phonetics.us && p.text) {
                    response.phonetics.us = p.text;
                }
            }
        }

        // Fallback to main phonetic
        if (entry.phonetic) {
            if (!response.phonetics.uk) response.phonetics.uk = entry.phonetic;
            if (!response.phonetics.us) response.phonetics.us = entry.phonetic;
        }

        // Meanings -> Definitions
        if (entry.meanings && Array.isArray(entry.meanings)) {
            for (const meaning of entry.meanings) {
                const partOfSpeech = meaning.partOfSpeech || '';

                if (meaning.definitions && Array.isArray(meaning.definitions)) {
                    for (const def of meaning.definitions) {
                        response.definitions.push({
                            partOfSpeech,
                            definition: def.definition || '',
                            example: def.example || '',
                            synonyms: def.synonyms || [],
                            antonyms: def.antonyms || [],
                        });
                    }
                }
            }
        }

        // Google doesn't provide translations, exchange, or frequency
        response.source = 'google';
        response.cached = false;

        return response;
    }

    /**
     * Close provider
     */
    close(): void {
        // No cleanup needed
    }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create Google provider instance
 */
export function createGoogleProvider(): GoogleProvider {
    return new GoogleProvider();
}
