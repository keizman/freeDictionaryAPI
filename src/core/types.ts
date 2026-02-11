/**
 * Unified Response Types
 * Shared types for all dictionary providers
 */

// ============================================================================
// Provider Response Types
// ============================================================================

/**
 * Phonetics (UK/US pronunciation)
 */
export interface Phonetics {
    uk: string;
    us: string;
}

/**
 * Audio URLs
 */
export interface AudioUrls {
    uk: string;
    us: string;
}

/**
 * Translation entry (Chinese)
 */
export interface Translation {
    pos: string;
    meanings: string[];
}

/**
 * Definition entry (English)
 */
export interface Definition {
    partOfSpeech: string;
    definition: string;
    example: string;
    synonyms: string[];
    antonyms: string[];
}

/**
 * Word form variations (exchange)
 */
export interface WordForms {
    past: string;
    pastParticiple: string;
    presentParticiple: string;
    thirdPerson: string;
    plural: string;
    comparative: string;
    superlative: string;
    lemma: string;
}

/**
 * Word frequency info
 */
export interface Frequency {
    collins: number;
    oxford: number;
    bnc: number;
    frq: number;
    tag: string[];
}

/**
 * Data source identifier
 */
export type DataSource =
    | 'ecdict'
    | 'google'
    | 'cache'
    | 'unknown'
    | 'ecdict+oxford'
    | 'oxford_en_mac'
    | 'koen_mac'
    | 'jaen_mac'
    | 'deen_mac'
    | 'ruen_mac';

/**
 * Complete unified dictionary response
 */
export interface DictionaryResponse {
    word: string;
    phonetics: Phonetics;
    audio: AudioUrls;
    translations: Translation[];
    definitions: Definition[];
    exchange: WordForms;
    frequency: Frequency;
    source: DataSource;
    cached: boolean;
    detailUrl: string;
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Query options for dictionary lookup
 */
export interface QueryOptions {
    language?: string;
    includeDefinitions?: boolean;
    includeTranslations?: boolean;
}

/**
 * Query result from a provider
 */
export interface QueryResult {
    found: boolean;
    response: DictionaryResponse | null;
    error?: string;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create empty response with all fields initialized
 */
export function createEmptyResponse(word: string): DictionaryResponse {
    return {
        word,
        phonetics: { uk: '', us: '' },
        audio: { uk: '', us: '' },
        translations: [],
        definitions: [],
        exchange: {
            past: '',
            pastParticiple: '',
            presentParticiple: '',
            thirdPerson: '',
            plural: '',
            comparative: '',
            superlative: '',
            lemma: '',
        },
        frequency: {
            collins: 0,
            oxford: 0,
            bnc: 0,
            frq: 0,
            tag: [],
        },
        source: 'unknown',
        cached: false,
        detailUrl: `https://dict.eudic.net/dicts/en/${encodeURIComponent(word)}`,
    };
}
