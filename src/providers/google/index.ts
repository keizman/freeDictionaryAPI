/**
 * Google Dictionary Provider
 * Fallback provider using Google Dictionary API proxy
 */

import { DictionaryProvider } from '../base';
import { DictionaryResponse, QueryOptions, QueryResult, createEmptyResponse } from '../../core/types';

// Import legacy dictionary module
const legacyDictionary = require('../../../modules/dictionary');

/**
 * Google Dictionary Provider
 */
export class GoogleProvider implements DictionaryProvider {
    readonly name = 'google';
    readonly displayName = 'Google Dictionary';
    readonly supportedLanguages = ['en', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'ru', 'pt-BR', 'ar', 'tr'];

    private available: boolean = true;

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

        console.log(`[GOOGLE] Querying word="${word}" lang="${language}"`);

        try {
            const googleResult = await legacyDictionary.findDefinitions(word, language, { include: [] });

            if (!googleResult || googleResult.length === 0) {
                console.log(`[GOOGLE] word="${word}" not found`);
                return {
                    found: false,
                    response: null,
                };
            }

            const response = this.transformGoogleResponse(googleResult, word);
            console.log(`[GOOGLE] word="${word}" found=true definitions=${response.definitions.length}`);

            return {
                found: true,
                response,
            };
        } catch (err: any) {
            console.error(`[GOOGLE] Error querying word="${word}":`, err.message);
            return {
                found: false,
                response: null,
                error: err.message,
            };
        }
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
