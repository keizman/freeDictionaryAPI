/**
 * Dictionary API Routes
 */

import { Router, Request, Response } from 'express';
import { DictionaryResponse } from '../core/types';
import { getCached, setCached } from '../core/cache';
import { registry } from '../providers';
import { DictionaryProvider } from '../providers/base';
import { lazyLocalDictManager } from '../providers/lazy-local-dicts';
import config from '../config';

const router = Router();

type ProviderHit = {
    provider: DictionaryProvider;
    response: DictionaryResponse;
};

function isEnabledFlag(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return false;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function isLocalDictDisabled(): boolean {
    if (isEnabledFlag(process.env.DISABLE_LOCAL_DICTS)) {
        return true;
    }
    return isEnabledFlag((config as any)?.fallback?.disable_local_dicts);
}

async function queryProvider(name: string, word: string, language: string): Promise<ProviderHit | null> {
    const provider = registry.get(name);
    if (!provider) {
        console.log(`[LOOKUP] skip provider="${name}" reason=not_registered`);
        return null;
    }

    if (!provider.isAvailable()) {
        console.log(`[LOOKUP] skip provider="${name}" reason=unavailable`);
        return null;
    }

    if (!provider.supportedLanguages.includes(language)) {
        console.log(
            `[LOOKUP] skip provider="${name}" reason=unsupported_language supported=[${provider.supportedLanguages.join(',')}]`
        );
        return null;
    }

    console.log(`[LOOKUP] try provider="${name}" word="${word}" lang="${language}"`);

    let result;
    try {
        result = await provider.query(word, { language });
    } catch (err: any) {
        console.error(
            `[LOOKUP] error provider="${name}" word="${word}" lang="${language}":`,
            err?.message || err
        );
        return null;
    }

    if (!result.found || !result.response) {
        if (result.error) {
            console.log(`[LOOKUP] miss provider="${name}" error="${result.error}"`);
        } else {
            console.log(`[LOOKUP] miss provider="${name}"`);
        }
        return null;
    }

    if (!provider.isValidResult(result.response)) {
        console.log(
            `[LOOKUP] invalid provider="${name}" definitions=${result.response.definitions.length} translations=${result.response.translations.length}`
        );
        return null;
    }

    console.log(
        `[LOOKUP] hit provider="${name}" definitions=${result.response.definitions.length} translations=${result.response.translations.length}`
    );

    return {
        provider,
        response: result.response!,
    };
}

/**
 * GET /api/:version/entries/:language/:word
 * Main dictionary lookup endpoint
 */
router.get('/:version/entries/:language/:word', async (req: Request, res: Response) => {
    const { version, language, word } = req.params;
    const startTime = Date.now();

    console.log(`\n[REQUEST] word="${word}" lang="${language}" version="${version}"`);

    try {
        // 1. Check cache first
        const cachedResult = await getCached<DictionaryResponse>(word, language);
        if (cachedResult) {
            const response = cachedResult.data;
            response.cached = true;
            response.source = 'cache';

            const elapsed = Date.now() - startTime;
            console.log(`[RESPONSE] word="${word}" source=cache elapsed=${elapsed}ms`);
            return res.json(response);
        }

        const disableLocalDicts = isLocalDictDisabled();
        if (disableLocalDicts) {
            console.log(`[LOOKUP] local dictionaries disabled, force fallback provider="google"`);
            const googleHit = await queryProvider('google', word, language);
            if (googleHit) {
                await setCached(word, language, googleHit.response, googleHit.response.source);
                const elapsed = Date.now() - startTime;
                console.log(`[RESPONSE] word="${word}" source=${googleHit.response.source} elapsed=${elapsed}ms`);
                return res.json(googleHit.response);
            }

            const elapsed = Date.now() - startTime;
            console.log(`[RESPONSE] word="${word}" NOT FOUND elapsed=${elapsed}ms`);
            return res.status(404).json({
                title: 'No Definitions Found',
                message: `Sorry, we couldn't find definitions for the word "${word}".`,
                resolution: 'Try checking the spelling or searching for a different word.',
            });
        }

        if (language === 'en') {
            const ecdictHit = await queryProvider('ecdict', word, language);
            const oxfordHit = await queryProvider('oxford_en_mac', word, language);

            // Base response always comes from ECDICT if available.
            // Oxford only overrides EN->EN definitions.
            if (ecdictHit) {
                const response = ecdictHit.response;
                if (oxfordHit?.response?.definitions?.length) {
                    response.definitions = oxfordHit.response.definitions;
                    response.source = 'ecdict+oxford';
                    console.log('[LOOKUP] merge definitions provider="oxford_en_mac" into provider="ecdict"');
                }

                const elapsed = Date.now() - startTime;
                console.log(`[RESPONSE] word="${word}" source=${response.source} elapsed=${elapsed}ms`);
                return res.json(response);
            }

            if (oxfordHit) {
                const elapsed = Date.now() - startTime;
                console.log(`[RESPONSE] word="${word}" source=${oxfordHit.response.source} elapsed=${elapsed}ms`);
                return res.json(oxfordHit.response);
            }

            console.log(`[LOOKUP] local providers missed word="${word}" lang="en", fallback provider="google"`);
            const googleHit = await queryProvider('google', word, language);
            if (googleHit) {
                await setCached(word, language, googleHit.response, googleHit.response.source);
                const elapsed = Date.now() - startTime;
                console.log(`[RESPONSE] word="${word}" source=${googleHit.response.source} elapsed=${elapsed}ms`);
                return res.json(googleHit.response);
            }

            console.log(`[LOOKUP] fallback provider="google" miss word="${word}" lang="en"`);
        } else {
            const providerName = await lazyLocalDictManager.ensureProviderForLanguage(language);
            if (providerName) {
                const localHit = await queryProvider(providerName, word, language);
                if (localHit) {
                    // refresh idle timer after a successful local query
                    lazyLocalDictManager.touch(providerName);
                    const elapsed = Date.now() - startTime;
                    console.log(`[RESPONSE] word="${word}" source=${localHit.response.source} elapsed=${elapsed}ms`);
                    return res.json(localHit.response);
                }
            }

            console.log(`[LOOKUP] local providers missed word="${word}" lang="${language}", fallback provider="google"`);
            const googleHit = await queryProvider('google', word, language);
            if (googleHit) {
                await setCached(word, language, googleHit.response, googleHit.response.source);
                const elapsed = Date.now() - startTime;
                console.log(`[RESPONSE] word="${word}" source=${googleHit.response.source} elapsed=${elapsed}ms`);
                return res.json(googleHit.response);
            }

            console.log(`[LOOKUP] fallback provider="google" miss word="${word}" lang="${language}"`);
        }

        // 3. Not found anywhere
        const elapsed = Date.now() - startTime;
        console.log(`[RESPONSE] word="${word}" NOT FOUND elapsed=${elapsed}ms`);

        return res.status(404).json({
            title: 'No Definitions Found',
            message: `Sorry, we couldn't find definitions for the word "${word}".`,
            resolution: 'Try checking the spelling or searching for a different word.',
        });

    } catch (err: any) {
        console.error(`[ERROR] word="${word}":`, err.message);
        return res.status(500).json({
            title: 'Internal Error',
            message: 'An error occurred while processing your request.',
            resolution: 'Please try again later.',
        });
    }
});

export default router;
