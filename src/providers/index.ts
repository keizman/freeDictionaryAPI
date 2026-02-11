/**
 * Provider Registry and Exports
 * Central point for managing all dictionary providers
 */

export { DictionaryProvider, ProviderRegistry, registry } from './base';
export { ECDictProvider, createECDictProvider } from './ecdict';
export { GoogleProvider, createGoogleProvider } from './google';
export { SqliteDictProvider, createSqliteDictProvider } from './sqlite-dicts';
