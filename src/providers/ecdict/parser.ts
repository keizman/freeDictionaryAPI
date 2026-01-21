/**
 * ECDICT Data Parsers
 * Parse exchange, pos, tag, translation fields
 */

import { WordForms, Translation, Definition, Frequency } from '../../core/types';

// ============================================================================
// Exchange Parser
// ============================================================================

/**
 * Parse exchange field to word forms
 * Input: "d:perceived/p:perceived/3:perceives/i:perceiving"
 */
export function parseExchange(exchangeStr: string | null): WordForms {
    const result: WordForms = {
        past: '',
        pastParticiple: '',
        presentParticiple: '',
        thirdPerson: '',
        plural: '',
        comparative: '',
        superlative: '',
        lemma: '',
    };

    if (!exchangeStr || exchangeStr.trim() === '') {
        return result;
    }

    const typeMap: Record<string, keyof WordForms> = {
        'p': 'past',
        'd': 'pastParticiple',
        'i': 'presentParticiple',
        '3': 'thirdPerson',
        's': 'plural',
        'r': 'comparative',
        't': 'superlative',
        '0': 'lemma',
    };

    const parts = exchangeStr.split('/');
    for (const part of parts) {
        const colonIndex = part.indexOf(':');
        if (colonIndex > 0) {
            const type = part.substring(0, colonIndex);
            const value = part.substring(colonIndex + 1);
            const key = typeMap[type];
            if (key) {
                result[key] = value;
            }
        }
    }

    return result;
}

// ============================================================================
// POS Parser
// ============================================================================

interface ParsedPos {
    pos: string;
    ratio: number;
}

/**
 * Parse POS distribution
 * Input: "n:46/v:54"
 */
export function parsePos(posStr: string | null): ParsedPos[] {
    const result: ParsedPos[] = [];

    if (!posStr || posStr.trim() === '') {
        return result;
    }

    const parts = posStr.split('/');
    for (const part of parts) {
        const colonIndex = part.indexOf(':');
        if (colonIndex > 0) {
            const pos = part.substring(0, colonIndex);
            const ratio = parseInt(part.substring(colonIndex + 1), 10);
            if (!isNaN(ratio)) {
                result.push({ pos, ratio });
            }
        }
    }

    return result;
}

// ============================================================================
// Tag Parser
// ============================================================================

/**
 * Parse tag string to array
 * Input: "zk gk cet4 cet6 toefl"
 */
export function parseTag(tagStr: string | null): string[] {
    if (!tagStr || tagStr.trim() === '') {
        return [];
    }
    return tagStr.split(/\s+/).filter(t => t.length > 0);
}

// ============================================================================
// Translation Parser
// ============================================================================

/**
 * Parse Chinese translation text
 * Input: "n. 包裹, 套装软件\nvt. 包装, 打包"
 */
export function parseTranslation(translationStr: string | null): Translation[] {
    if (!translationStr || translationStr.trim() === '') {
        return [];
    }

    const result: Translation[] = [];
    const lines = translationStr.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Try to extract POS prefix (e.g., "n.", "vt.", "a.")
        const posMatch = trimmed.match(/^([a-z]+\.)\s*/i);

        if (posMatch) {
            const pos = posMatch[1];
            const meaningsStr = trimmed.substring(posMatch[0].length);
            const meanings = meaningsStr
                .split(/[,;，；]/)
                .map(m => m.trim())
                .filter(m => m.length > 0);

            if (meanings.length > 0) {
                result.push({ pos, meanings });
            }
        } else {
            // Check for [xxx] prefix like [计], [医]
            const bracketMatch = trimmed.match(/^\[([^\]]+)\]\s*/);

            if (bracketMatch) {
                const pos = `[${bracketMatch[1]}]`;
                const meaningsStr = trimmed.substring(bracketMatch[0].length);
                const meanings = meaningsStr
                    .split(/[,;，；]/)
                    .map(m => m.trim())
                    .filter(m => m.length > 0);

                if (meanings.length > 0) {
                    result.push({ pos, meanings });
                }
            } else {
                // No prefix - add as general
                const meanings = trimmed
                    .split(/[,;，；]/)
                    .map(m => m.trim())
                    .filter(m => m.length > 0);

                if (meanings.length > 0) {
                    let general = result.find(r => r.pos === '');
                    if (!general) {
                        general = { pos: '', meanings: [] };
                        result.push(general);
                    }
                    general.meanings.push(...meanings);
                }
            }
        }
    }

    return result;
}

// ============================================================================
// Definition Parser
// ============================================================================

const POS_MAP: Record<string, string> = {
    'n': 'noun',
    'v': 'verb',
    'vt': 'verb',
    'vi': 'verb',
    'a': 'adjective',
    'adj': 'adjective',
    'adv': 'adverb',
    'prep': 'preposition',
    'conj': 'conjunction',
    'pron': 'pronoun',
    'interj': 'interjection',
    'num': 'numeral',
};

/**
 * Parse English definition text
 * Input: "n. something packed\nv. to pack something"
 */
export function parseDefinition(definitionStr: string | null): Definition[] {
    if (!definitionStr || definitionStr.trim() === '') {
        return [];
    }

    const result: Definition[] = [];
    const lines = definitionStr.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const posMatch = trimmed.match(/^([a-z]+\.?)\s+/i);

        if (posMatch) {
            const posAbbr = posMatch[1].replace('.', '').toLowerCase();
            const partOfSpeech = POS_MAP[posAbbr] || posAbbr;
            const definition = trimmed.substring(posMatch[0].length);

            result.push({
                partOfSpeech,
                definition,
                example: '',
                synonyms: [],
                antonyms: [],
            });
        } else {
            result.push({
                partOfSpeech: '',
                definition: trimmed,
                example: '',
                synonyms: [],
                antonyms: [],
            });
        }
    }

    return result;
}

// ============================================================================
// Frequency Builder
// ============================================================================

/**
 * Build frequency object from record fields
 */
export function buildFrequency(
    collins: number | null,
    oxford: number | null,
    bnc: number | null,
    frq: number | null,
    tag: string | null
): Frequency {
    return {
        collins: collins || 0,
        oxford: oxford || 0,
        bnc: bnc || 0,
        frq: frq || 0,
        tag: parseTag(tag),
    };
}
