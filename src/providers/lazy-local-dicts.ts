/**
 * Lazy local dictionary manager:
 * - Non-EN local dictionaries are loaded on first request.
 * - Dictionaries are released after idle timeout.
 */

import { createSqliteDictProvider } from './sqlite-dicts';
import { DataSource } from '../core/types';
import { registry } from './base';

type LazyLocalName = Extract<DataSource, 'koen_mac' | 'jaen_mac' | 'deen_mac' | 'ruen_mac'>;

export interface LazyLocalDictDescriptor {
    name: LazyLocalName;
    displayName: string;
    supportedLanguages: string[];
    dbPath: string;
    priority: number;
}

interface RuntimeState {
    descriptor: LazyLocalDictDescriptor;
    loaded: boolean;
    lastUsedAt: number;
    releaseTimer: NodeJS.Timeout | null;
}

class LazyLocalDictManager {
    private readonly states: Map<LazyLocalName, RuntimeState> = new Map();
    private readonly languageMap: Map<string, LazyLocalName> = new Map();
    private readonly loadLocks: Map<LazyLocalName, Promise<boolean>> = new Map();
    private idleReleaseMs: number = 10 * 60 * 1000;

    configure(descriptors: LazyLocalDictDescriptor[], idleReleaseMs: number): void {
        this.close();
        this.idleReleaseMs = idleReleaseMs > 0 ? idleReleaseMs : 10 * 60 * 1000;

        for (const descriptor of descriptors) {
            this.states.set(descriptor.name, {
                descriptor,
                loaded: false,
                lastUsedAt: 0,
                releaseTimer: null,
            });

            for (const language of descriptor.supportedLanguages) {
                this.languageMap.set(language, descriptor.name);
            }

            console.log(
                `[LAZY-DICT] deferred provider="${descriptor.name}" languages=[${descriptor.supportedLanguages.join(',')}] idle_release_ms=${this.idleReleaseMs}`
            );
        }
    }

    getProviderNameByLanguage(language: string): LazyLocalName | null {
        return this.languageMap.get(language) || null;
    }

    async ensureProviderForLanguage(language: string): Promise<LazyLocalName | null> {
        const name = this.getProviderNameByLanguage(language);
        if (!name) return null;

        const ok = await this.ensureProvider(name);
        if (!ok) return null;
        return name;
    }

    async ensureProvider(name: LazyLocalName): Promise<boolean> {
        const state = this.states.get(name);
        if (!state) return false;

        if (state.loaded && registry.get(name)?.isAvailable()) {
            this.touch(name);
            console.log(`[LAZY-DICT] reuse provider="${name}"`);
            return true;
        }

        const existingLock = this.loadLocks.get(name);
        if (existingLock) {
            return existingLock;
        }

        const loadingTask = this.loadProvider(name);
        this.loadLocks.set(name, loadingTask);

        try {
            return await loadingTask;
        } finally {
            this.loadLocks.delete(name);
        }
    }

    touch(name: LazyLocalName): void {
        const state = this.states.get(name);
        if (!state || !state.loaded) return;

        state.lastUsedAt = Date.now();
        this.scheduleRelease(name);
    }

    close(): void {
        for (const [name, state] of this.states) {
            if (state.releaseTimer) {
                clearTimeout(state.releaseTimer);
                state.releaseTimer = null;
            }
            if (state.loaded) {
                registry.unregister(name);
                state.loaded = false;
            }
        }

        this.states.clear();
        this.languageMap.clear();
        this.loadLocks.clear();
    }

    private async loadProvider(name: LazyLocalName): Promise<boolean> {
        const state = this.states.get(name);
        if (!state) return false;

        const descriptor = state.descriptor;
        console.log(`[LAZY-DICT] loading provider="${name}" db="${descriptor.dbPath}"`);

        try {
            const provider = createSqliteDictProvider({
                name: descriptor.name,
                displayName: descriptor.displayName,
                supportedLanguages: descriptor.supportedLanguages,
                dbPath: descriptor.dbPath,
            });

            if (!provider.isAvailable()) {
                console.log(`[LAZY-DICT] load failed provider="${name}" reason=unavailable_after_init`);
                provider.close();
                state.loaded = false;
                return false;
            }

            registry.register(provider, descriptor.priority);
            state.loaded = true;
            state.lastUsedAt = Date.now();
            this.scheduleRelease(name);
            console.log(`[LAZY-DICT] loaded provider="${name}"`);
            return true;
        } catch (err: any) {
            console.error(`[LAZY-DICT] load failed provider="${name}":`, err?.message || err);
            state.loaded = false;
            return false;
        }
    }

    private scheduleRelease(name: LazyLocalName): void {
        const state = this.states.get(name);
        if (!state || !state.loaded) return;

        if (state.releaseTimer) {
            clearTimeout(state.releaseTimer);
            state.releaseTimer = null;
        }

        state.releaseTimer = setTimeout(() => {
            const current = this.states.get(name);
            if (!current || !current.loaded) return;

            const idleForMs = Date.now() - current.lastUsedAt;
            if (idleForMs < this.idleReleaseMs) {
                this.scheduleRelease(name);
                return;
            }

            registry.unregister(name);
            current.loaded = false;
            current.releaseTimer = null;
            console.log(`[LAZY-DICT] unloaded provider="${name}" reason=idle_timeout idle_ms=${idleForMs}`);
        }, this.idleReleaseMs);
    }
}

export const lazyLocalDictManager = new LazyLocalDictManager();
