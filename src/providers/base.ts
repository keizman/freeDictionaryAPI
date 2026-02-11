/**
 * Base Dictionary Provider Interface
 * All dictionary providers must implement this interface
 */

import { DictionaryResponse, QueryOptions, QueryResult } from '../core/types';

/**
 * Dictionary Provider Interface
 */
export interface DictionaryProvider {
    /**
     * Provider name (e.g., 'ecdict', 'google')
     */
    readonly name: string;

    /**
     * Provider display name
     */
    readonly displayName: string;

    /**
     * Supported languages
     */
    readonly supportedLanguages: string[];

    /**
     * Whether this provider is available (initialized correctly)
     */
    isAvailable(): boolean;

    /**
     * Query a word
     * @param word Word to look up
     * @param options Query options
     * @returns Query result with response or error
     */
    query(word: string, options?: QueryOptions): Promise<QueryResult>;

    /**
     * Check if result is valid (has meaningful content)
     * @param response Dictionary response
     * @returns true if response has useful content
     */
    isValidResult(response: DictionaryResponse | null): boolean;

    /**
     * Close/cleanup provider resources
     */
    close(): void;
}

/**
 * Provider priority for fallback chain
 */
export interface ProviderPriority {
    provider: DictionaryProvider;
    priority: number;
}

/**
 * Provider registry for managing multiple providers
 */
export class ProviderRegistry {
    private providers: Map<string, DictionaryProvider> = new Map();
    private priorityOrder: ProviderPriority[] = [];

    /**
     * Register a provider
     */
    register(provider: DictionaryProvider, priority: number = 0): void {
        this.providers.set(provider.name, provider);
        this.priorityOrder.push({ provider, priority });
        this.priorityOrder.sort((a, b) => b.priority - a.priority);
        console.log(`[REGISTRY] Registered provider: ${provider.name} (priority: ${priority})`);
    }

    /**
     * Unregister a provider by name
     */
    unregister(name: string): boolean {
        const provider = this.providers.get(name);
        if (!provider) return false;

        provider.close();
        this.providers.delete(name);
        this.priorityOrder = this.priorityOrder.filter(p => p.provider.name !== name);
        console.log(`[REGISTRY] Unregistered provider: ${name}`);
        return true;
    }

    /**
     * Get provider by name
     */
    get(name: string): DictionaryProvider | undefined {
        return this.providers.get(name);
    }

    /**
     * Get all providers in priority order
     */
    getAll(): DictionaryProvider[] {
        return this.priorityOrder.map(p => p.provider);
    }

    /**
     * Get available providers in priority order
     */
    getAvailable(): DictionaryProvider[] {
        return this.priorityOrder
            .filter(p => p.provider.isAvailable())
            .map(p => p.provider);
    }

    /**
     * Close all providers
     */
    closeAll(): void {
        for (const provider of this.providers.values()) {
            provider.close();
        }
        this.providers.clear();
        this.priorityOrder = [];
    }
}

// Global registry instance
export const registry = new ProviderRegistry();
