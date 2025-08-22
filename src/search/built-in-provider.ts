// ABOUTME: Built-in search provider using inverted index with regex post-filtering
// ABOUTME: Implements SearchProvider interface with MiniSearch-style inverted indexing

import { Doc, ParsedQuery, QueryOptions, SearchResult, MatchSpan, SearchableField } from './types';
import { SearchProvider } from './provider';
import { createScorer, ScorerConfig, DEFAULT_SCORER_CONFIG } from './scorer';
import { tokenizeWords, normalizeText } from './normalize';
import { MinHeap, createSearchResultHeap } from './min-heap';

/**
 * Posting list entry for a term in the inverted index
 */
interface PostingEntry {
	/** Document ID */
	docId: string;
	/** Field where term appears */
	field: SearchableField;
	/** Term frequency in this field */
	tf: number;
	/** Token positions in the field (for highlight spans) */
	positions: number[];
}

/**
 * Posting list for a specific term
 */
type PostingList = PostingEntry[];

/**
 * Document metadata stored separately from index
 */
interface DocMetadata {
	doc: Doc;
	/** Field lengths for TF-IDF normalization */
	fieldLengths: Record<SearchableField, number>;
}

/**
 * Configuration for BuiltInProvider
 */
interface BuiltInProviderOptions {
	/** Maximum number of documents to keep in memory */
	maxDocs?: number;
	/** Enable debug logging */
	debug?: boolean;
	/** Maximum body text length to index (2MB default) */
	maxBodyLength?: number;
	/** Maximum number of candidates for regex filtering */
	regexCandidateK?: number;
	/** Scorer configuration */
	scorerConfig?: ScorerConfig;
}

/**
 * Built-in search provider with inverted index and regex post-filtering
 */
export class BuiltInProvider implements SearchProvider {
	private readonly options: Required<BuiltInProviderOptions>;
	private readonly scorer: (doc: Doc, query: ParsedQuery) => { score: number; matchSpans: MatchSpan[] } | null;
	
	/** Inverted index: term -> posting list */
	private readonly index = new Map<string, PostingList>();
	
	/** Document store: docId -> document metadata */
	private readonly docs = new Map<string, DocMetadata>();
	
	/** Document frequency: term -> number of docs containing term */
	private readonly df = new Map<string, number>();
	
	/** Total number of documents */
	private totalDocs = 0;

	constructor(options: BuiltInProviderOptions = {}) {
		this.options = {
			maxDocs: options.maxDocs ?? 50000,
			debug: options.debug ?? false,
			maxBodyLength: options.maxBodyLength ?? 2 * 1024 * 1024, // 2MB
			regexCandidateK: options.regexCandidateK ?? 300,
			scorerConfig: options.scorerConfig ?? DEFAULT_SCORER_CONFIG,
		};
		
		this.scorer = createScorer(this.options.scorerConfig);
	}

	async indexAll(docs: Doc[]): Promise<void> {
		this.debug(`Indexing ${docs.length} documents`);
		
		// Clear existing index
		await this.clear();
		
		// Index all documents
		for (const doc of docs) {
			await this.upsert(doc);
		}
		
		this.debug(`Indexing complete. Total docs: ${this.totalDocs}`);
	}

	async upsert(doc: Doc): Promise<void> {
		// Remove existing document if present
		if (this.docs.has(doc.id)) {
			await this.remove(doc.id);
		}
		
		// Check document limits
		if (this.totalDocs >= this.options.maxDocs) {
			throw new Error(`Maximum document limit reached (${this.options.maxDocs})`);
		}
		
		// Truncate body if too large
		const processedDoc = {
			...doc,
			body: doc.body.length > this.options.maxBodyLength 
				? doc.body.substring(0, this.options.maxBodyLength)
				: doc.body
		};
		
		// Calculate field lengths and tokenize all fields
		const fieldLengths: Record<SearchableField, number> = {} as any;
		const fieldTokens: Record<SearchableField, { tokens: string[], positions: Map<string, number[]> }> = {} as any;
		
		// Process each searchable field
		const fields: Array<{ field: SearchableField, content: string | string[] }> = [
			{ field: 'title', content: processedDoc.title },
			{ field: 'path', content: processedDoc.path.join(' ') },
			{ field: 'headings', content: processedDoc.headings.join(' ') },
			{ field: 'tags', content: processedDoc.tags.join(' ') },
			{ field: 'symbols', content: processedDoc.symbols.join(' ') },
			{ field: 'body', content: processedDoc.body },
		];
		
		for (const { field, content } of fields) {
			const text = Array.isArray(content) ? content.join(' ') : content;
			const tokens = tokenizeWords(text, this.options.scorerConfig.diacritics);
			
			fieldLengths[field] = tokens.length;
			
			// Track token positions for each unique token
			const positions = new Map<string, number[]>();
			tokens.forEach((token, index) => {
				const normalized = normalizeText(token, this.options.scorerConfig.diacritics);
				if (!positions.has(normalized)) {
					positions.set(normalized, []);
				}
				positions.get(normalized)!.push(index);
			});
			
			fieldTokens[field] = { tokens, positions };
		}
		
		// Store document metadata
		const docMetadata: DocMetadata = {
			doc: processedDoc,
			fieldLengths,
		};
		this.docs.set(doc.id, docMetadata);
		
		// Add to inverted index
		for (const { field } of fields) {
			const { positions } = fieldTokens[field];
			
			for (const [term, termPositions] of Array.from(positions)) {
				// Get or create posting list
				let postingList = this.index.get(term);
				if (!postingList) {
					postingList = [];
					this.index.set(term, postingList);
					this.df.set(term, 0);
				}
				
				// Add posting entry
				postingList.push({
					docId: doc.id,
					field,
					tf: termPositions.length,
					positions: termPositions,
				});
				
				// Update document frequency
				this.df.set(term, this.df.get(term)! + 1);
			}
		}
		
		this.totalDocs++;
		this.debug(`Upserted document ${doc.id}`);
	}

	async remove(id: string): Promise<void> {
		const docMetadata = this.docs.get(id);
		if (!docMetadata) {
			return; // Document not found, no-op
		}
		
		// Remove from document store
		this.docs.delete(id);
		this.totalDocs--;
		
		// Remove from inverted index
		for (const [term, postingList] of Array.from(this.index)) {
			// Filter out entries for this document
			const originalLength = postingList.length;
			const filteredList = postingList.filter(entry => entry.docId !== id);
			
			if (filteredList.length !== originalLength) {
				// Document was in this posting list
				if (filteredList.length === 0) {
					// No more documents have this term
					this.index.delete(term);
					this.df.delete(term);
				} else {
					// Update posting list and document frequency
					this.index.set(term, filteredList);
					this.df.set(term, filteredList.length);
				}
			}
		}
		
		this.debug(`Removed document ${id}`);
	}

	async query(q: ParsedQuery, opts?: QueryOptions): Promise<SearchResult[]> {
		const limit = opts?.limit ?? 50;
		
		// Handle empty query: return recent documents
		if (this.isEmpty(q)) {
			return this.getRecentDocuments(limit);
		}
		
		// Use optimized heap-based scoring
		const results: SearchResult[] = [];
		for await (const result of this.queryStream(q, opts)) {
			results.push(result);
			// Enforce limit to prevent exceeding expected count
			if (results.length >= limit) {
				break;
			}
		}
		
		return results;
	}

	/**
	 * Stream search results progressively with heap-based top-K optimization
	 */
	async *queryStream(q: ParsedQuery, opts?: QueryOptions): AsyncGenerator<SearchResult, void, unknown> {
		const limit = opts?.limit ?? 50;
		
		// Handle empty query: return recent documents
		if (this.isEmpty(q)) {
			const recentResults = this.getRecentDocuments(limit);
			for (const result of recentResults) {
				yield result;
			}
			return;
		}
		
		// Gather candidates using inverted index
		const candidates = this.gatherCandidates(q);
		
		// Use min-heap to maintain top-K results efficiently
		const topResults = createSearchResultHeap(limit);
		const yieldedIds = new Set<string>(); // Track yielded results to avoid duplicates
		let processedCount = 0;
		
		// Score candidates progressively
		for (const docId of Array.from(candidates)) {
			const docMetadata = this.docs.get(docId);
			if (!docMetadata) continue;
			
			const scored = this.scorer(docMetadata.doc, q);
			if (scored && scored.score > 0) {
				const result: SearchResult = {
					id: docId,
					score: scored.score,
					matchSpans: scored.matchSpans,
				};
				
				// Add to heap (automatically maintains top-K)
				topResults.push(result);
			}
			
			processedCount++;
			
			// Yield intermediate results every 100 processed documents
			// This provides progressive loading while maintaining efficiency
			if (processedCount % 100 === 0 && topResults.size > 0) {
				// Get current top results without emptying heap
				const currentTop = topResults.toArray()
					.sort((a, b) => b.score - a.score)
					.slice(0, Math.min(5, Math.floor(limit / 2))); // Conservative intermediate yield
				
				for (const result of currentTop) {
					if (!yieldedIds.has(result.id)) {
						yieldedIds.add(result.id);
						yield result;
					}
				}
			}
		}
		
		// Get final top-K results sorted by score descending
		const finalResults = topResults.extractAll().reverse();
		
		// Apply regex post-filtering if present
		let filteredResults = finalResults;
		if (q.regex) {
			filteredResults = this.applyRegexFilter(finalResults, q.regex, limit);
		}
		
		// Yield final results (only those not already yielded)
		for (const result of filteredResults) {
			if (!yieldedIds.has(result.id)) {
				yield result;
			}
		}
	}

	async clear(): Promise<void> {
		this.index.clear();
		this.docs.clear();
		this.df.clear();
		this.totalDocs = 0;
		this.debug('Index cleared');
	}

	/**
	 * Check if query is effectively empty
	 */
	private isEmpty(q: ParsedQuery): boolean {
		return q.terms.length === 0 && 
			   q.phrases.length === 0 && 
			   q.orGroups.length === 0 &&
			   !q.regex;
	}

	/**
	 * Get recent documents sorted by mtime descending
	 */
	private getRecentDocuments(limit: number): SearchResult[] {
		const results: SearchResult[] = [];
		
		for (const [docId, docMetadata] of Array.from(this.docs)) {
			results.push({
				id: docId,
				score: docMetadata.doc.mtime,
				matchSpans: [],
			});
		}
		
		// Sort by mtime descending
		results.sort((a, b) => b.score - a.score);
		
		// Set scores to descending values for consistency
		results.forEach((result, index) => {
			result.score = results.length - index;
		});
		
		return results.slice(0, limit);
	}

	/**
	 * Gather candidate documents using inverted index
	 */
	private gatherCandidates(q: ParsedQuery): Set<string> {
		const candidates = new Set<string>();
		
		// Handle OR groups
		if (q.orGroups.length > 0) {
			// Each OR group contributes candidates, then we intersect across groups
			const groupCandidates: Set<string>[] = [];
			
			for (const orGroup of q.orGroups) {
				const groupSet = new Set<string>();
				for (const term of orGroup) {
					const normalized = normalizeText(term, this.options.scorerConfig.diacritics);
					const postingList = this.index.get(normalized);
					if (postingList) {
						for (const entry of postingList) {
							groupSet.add(entry.docId);
						}
					}
				}
				if (groupSet.size > 0) {
					groupCandidates.push(groupSet);
				}
			}
			
			// Intersect all groups
			if (groupCandidates.length > 0) {
				// Start with first group
				for (const docId of Array.from(groupCandidates[0])) {
					candidates.add(docId);
				}
				
				// Intersect with remaining groups
				for (let i = 1; i < groupCandidates.length; i++) {
					for (const docId of Array.from(candidates)) {
						if (!groupCandidates[i].has(docId)) {
							candidates.delete(docId);
						}
					}
				}
			}
		} else {
			// Regular terms: collect candidates and apply AND semantics
			const termCandidates: Set<string>[] = [];
			
			for (const term of q.terms) {
				const normalized = normalizeText(term, this.options.scorerConfig.diacritics);
				const postingList = this.index.get(normalized);
				if (postingList) {
					const termSet = new Set<string>();
					for (const entry of postingList) {
						termSet.add(entry.docId);
					}
					termCandidates.push(termSet);
				}
			}
			
			// AND semantics: intersect all term candidates
			if (termCandidates.length > 0) {
				// Start with first term
				for (const docId of Array.from(termCandidates[0])) {
					candidates.add(docId);
				}
				
				// Intersect with remaining terms
				for (let i = 1; i < termCandidates.length; i++) {
					for (const docId of Array.from(candidates)) {
						if (!termCandidates[i].has(docId)) {
							candidates.delete(docId);
						}
					}
				}
			}
		}
		
		// If no terms but we have phrases, collect phrase candidates
		if (candidates.size === 0 && q.phrases.length > 0) {
			// For phrases, we need to do a more complex search
			// For now, just collect all documents as candidates
			// The scorer will handle phrase matching
			for (const docId of Array.from(this.docs.keys())) {
				candidates.add(docId);
			}
		}
		
		// If still no candidates and we have filters only, return all docs
		if (candidates.size === 0 && (q.filters.tag?.length || q.filters.path?.length || q.filters.in?.length)) {
			for (const docId of Array.from(this.docs.keys())) {
				candidates.add(docId);
			}
		}
		
		return candidates;
	}

	/**
	 * Apply regex filter to top-K candidates
	 */
	private applyRegexFilter(
		results: SearchResult[], 
		regexSpec: { source: string; flags: string },
		limit: number
	): SearchResult[] {
		try {
			// Ensure global flag is set for matchAll to work
			const flags = regexSpec.flags.includes('g') ? regexSpec.flags : regexSpec.flags + 'g';
			const regex = new RegExp(regexSpec.source, flags);
			const topK = results.slice(0, this.options.regexCandidateK);
			const filtered: SearchResult[] = [];
			
			for (const result of topK) {
				const docMetadata = this.docs.get(result.id);
				if (!docMetadata) continue;
				
				const doc = docMetadata.doc;
				
				// Test regex against title and body
				if (regex.test(doc.title) || regex.test(doc.body)) {
					// Update match spans to include regex matches
					const regexMatches = this.findRegexMatches(doc, regex);
					result.matchSpans = [...result.matchSpans, ...regexMatches];
					filtered.push(result);
				}
			}
			
			return filtered.slice(0, limit);
		} catch (error) {
			// Invalid regex, ignore and return original results
			this.debug(`Invalid regex: ${regexSpec.source}`);
			return results.slice(0, limit);
		}
	}

	/**
	 * Find regex matches in document and create match spans
	 */
	private findRegexMatches(doc: Doc, regex: RegExp): MatchSpan[] {
		const matches: MatchSpan[] = [];
		
		// Search in title
		const titleMatches = Array.from(doc.title.matchAll(regex));
		for (const match of titleMatches) {
			if (match.index !== undefined && match[0]) {
				matches.push({
					field: 'title',
					start: match.index,
					end: match.index + match[0].length,
				});
			}
		}
		
		// Search in body
		const bodyMatches = Array.from(doc.body.matchAll(regex));
		for (const match of bodyMatches) {
			if (match.index !== undefined && match[0]) {
				matches.push({
					field: 'body',
					start: match.index,
					end: match.index + match[0].length,
				});
			}
		}
		
		return matches;
	}

	/**
	 * Debug logging
	 */
	private debug(message: string): void {
		if (this.options.debug) {
			console.log(`[BuiltInProvider] ${message}`);
		}
	}
}