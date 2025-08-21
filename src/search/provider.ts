// ABOUTME: SearchProvider interface and provider configuration for pluggable search backends
// ABOUTME: Defines the async contract for search providers and factory pattern for creation

import type { Doc, ParsedQuery, SearchResult, QueryOptions } from './types';

/**
 * Core search provider interface defining the contract for all search backends.
 * 
 * Lifecycle expectations:
 * - Providers should be ready to handle queries after construction
 * - indexAll() should be called once during initial vault scan
 * - upsert/remove handle incremental updates during runtime
 * - clear() resets the provider to empty state
 * 
 * Threading/async guarantees:
 * - All methods are async and return Promises
 * - Implementations should handle concurrent calls safely
 * - Long-running operations should respect AbortSignal when provided
 * - Provider switching should be seamless via interface compliance
 */
export interface SearchProvider {
	/**
	 * Bulk index multiple documents, typically during initial vault scan.
	 * Should replace any existing index with the provided documents.
	 * 
	 * @param docs Array of documents to index
	 */
	indexAll(docs: Doc[]): Promise<void>;
	
	/**
	 * Insert or update a single document in the index.
	 * If a document with the same id exists, it should be replaced.
	 * 
	 * @param doc Document to insert or update
	 */
	upsert(doc: Doc): Promise<void>;
	
	/**
	 * Remove a document from the index by its identifier.
	 * Should be a no-op if the document doesn't exist.
	 * 
	 * @param id Document identifier to remove
	 */
	remove(id: string): Promise<void>;
	
	/**
	 * Execute a search query and return matching results.
	 * Results should be sorted by relevance (highest score first).
	 * 
	 * @param q Parsed query to execute
	 * @param opts Optional query options including limit and cancellation signal
	 * @returns Array of search results sorted by score (descending)
	 */
	query(q: ParsedQuery, opts?: QueryOptions): Promise<SearchResult[]>;
	
	/**
	 * Clear all indexed documents and reset to empty state.
	 * Should be equivalent to indexAll([]).
	 */
	clear(): Promise<void>;
}

/**
 * Configuration for the built-in search provider
 */
export interface BuiltInProviderConfig {
	kind: 'builtIn';
	options?: {
		/** Maximum number of documents to keep in memory */
		maxDocs?: number;
		/** Enable debug logging */
		debug?: boolean;
		[key: string]: unknown;
	};
}

/**
 * Configuration for external search providers (e.g., Omnisearch)
 */
export interface ExternalProviderConfig {
	kind: 'external';
	/** Name of the external provider */
	name: string;
	options?: {
		/** Provider-specific configuration */
		[key: string]: unknown;
	};
}

/**
 * Discriminated union for provider configuration.
 * Allows selection between built-in and external providers.
 */
export type ProviderConfig = BuiltInProviderConfig | ExternalProviderConfig;

/**
 * Default provider configuration using the built-in provider
 */
export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
	kind: 'builtIn',
	options: {}
};

/**
 * Factory function signature for creating search providers.
 * Implementations will provide the actual provider instances.
 * 
 * @param config Provider configuration, defaults to built-in
 * @returns A SearchProvider instance ready for use
 */
export type ProviderFactory = (config?: ProviderConfig) => SearchProvider;

/**
 * Creates a search provider based on the configuration.
 * This is a placeholder that will be implemented when providers are available.
 * 
 * @param config Provider configuration
 * @returns Search provider instance
 */
export function createProvider(config: ProviderConfig = DEFAULT_PROVIDER_CONFIG): SearchProvider {
	// Placeholder implementation - actual providers will be plugged in later
	// For now, return a stub that satisfies the interface
	
	if (config.kind === 'builtIn') {
		// Will be replaced with actual BuiltInProvider import
		return createStubProvider('built-in');
	} else if (config.kind === 'external') {
		// Will be replaced with external provider factory/plugin system
		return createStubProvider(config.name);
	}
	
	// Type-safe exhaustive check
	const _exhaustive: never = config;
	throw new Error(`Unknown provider configuration: ${JSON.stringify(_exhaustive)}`);
}

/**
 * Temporary stub provider for type checking.
 * Will be removed when actual providers are implemented.
 */
function createStubProvider(name: string): SearchProvider {
	return {
		async indexAll(docs: Doc[]): Promise<void> {
			console.log(`[${name}] Indexing ${docs.length} documents (stub)`);
		},
		
		async upsert(doc: Doc): Promise<void> {
			console.log(`[${name}] Upserting document ${doc.id} (stub)`);
		},
		
		async remove(id: string): Promise<void> {
			console.log(`[${name}] Removing document ${id} (stub)`);
		},
		
		async query(q: ParsedQuery, opts?: QueryOptions): Promise<SearchResult[]> {
			console.log(`[${name}] Querying: ${q.raw} (stub)`);
			return [];
		},
		
		async clear(): Promise<void> {
			console.log(`[${name}] Clearing index (stub)`);
		}
	};
}

/**
 * Type guard to check if a config is for the built-in provider
 */
export function isBuiltInProvider(config: ProviderConfig): config is BuiltInProviderConfig {
	return config.kind === 'builtIn';
}

/**
 * Type guard to check if a config is for an external provider
 */
export function isExternalProvider(config: ProviderConfig): config is ExternalProviderConfig {
	return config.kind === 'external';
}