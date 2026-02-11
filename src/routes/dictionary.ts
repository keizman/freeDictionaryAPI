/**
 * Dictionary API Routes
 */

import { Router, Request, Response } from 'express';
import { DictionaryResponse } from '../core/types';
import { getCached, setCached } from '../core/cache';
import { registry } from '../providers';
import { DictionaryProvider } from '../providers/base';

const router = Router();

type ProviderHit = {
    provider: DictionaryProvider;
    response: DictionaryResponse;
};

async function queryProvider(name: string, word: string, language: string): Promise<ProviderHit | null> {
    const provider = registry.get(name);
    if (!provider || !provider.isAvailable()) return null;
    if (!provider.supportedLanguages.includes(language)) return null;

    const result = await provider.query(word, { language });
    if (!result.found || !provider.isValidResult(result.response)) return null;

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

        // 2. Try providers in priority order
        const providers = registry.getAvailable();

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

            const googleHit = await queryProvider('google', word, language);
            if (googleHit) {
                await setCached(word, language, googleHit.response, googleHit.response.source);
                const elapsed = Date.now() - startTime;
                console.log(`[RESPONSE] word="${word}" source=${googleHit.response.source} elapsed=${elapsed}ms`);
                return res.json(googleHit.response);
            }
        } else {
            for (const provider of providers) {
                // Check if provider supports this language
                if (!provider.supportedLanguages.includes(language)) {
                    continue;
                }

                const result = await provider.query(word, { language });

                if (result.found && provider.isValidResult(result.response)) {
                    const response = result.response!;

                    // Keep Redis caching as final Google fallback cache.
                    if (response.source === 'google') {
                        await setCached(word, language, response, response.source);
                    }

                    const elapsed = Date.now() - startTime;
                    console.log(`[RESPONSE] word="${word}" source=${response.source} elapsed=${elapsed}ms`);
                    return res.json(response);
                }
            }
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
