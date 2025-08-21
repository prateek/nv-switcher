// ABOUTME: Scoring model for search results with fuzzy/prefix matching and recency bonus
// ABOUTME: Implements weighted field scoring, diacritic folding, and exponential recency decay

import { Doc, ParsedQuery, MatchSpan, SearchableField } from './types';
import { normalizeText, tokenizeWords } from './normalize';

/**
 * Configuration for the scoring algorithm
 */
export interface ScorerConfig {
	/** Field weights for scoring */
	weights: Record<SearchableField | 'recency', number>;
	/** Whether to preserve diacritics in matching */
	diacritics: boolean;
	/** Half-life for recency scoring in days */
	recencyHalfLife: number;
}

/**
 * Result of scoring a document
 */
export interface ScoredDoc {
	/** Document that was scored */
	doc: Doc;
	/** Total relevance score */
	score: number;
	/** Match spans for highlighting */
	matchSpans: MatchSpan[];
}

/**
 * Computes Damerau-Levenshtein distance between two strings, capped at maxDistance
 */
function damerauLevenshtein(s1: string, s2: string, maxDistance: number = 2): number {
	const len1 = s1.length;
	const len2 = s2.length;
	
	// Early termination for performance
	if (Math.abs(len1 - len2) > maxDistance) {
		return maxDistance + 1;
	}
	
	// Create distance matrix
	const matrix: number[][] = [];
	for (let i = 0; i <= len1; i++) {
		matrix[i] = Array(len2 + 1).fill(0);
		matrix[i][0] = i;
	}
	for (let j = 0; j <= len2; j++) {
		matrix[0][j] = j;
	}
	
	// Fill matrix
	for (let i = 1; i <= len1; i++) {
		for (let j = 1; j <= len2; j++) {
			const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
			
			matrix[i][j] = Math.min(
				matrix[i - 1][j] + 1,     // deletion
				matrix[i][j - 1] + 1,     // insertion
				matrix[i - 1][j - 1] + cost // substitution
			);
			
			// Damerau: transposition
			if (i > 1 && j > 1 && 
				s1[i - 1] === s2[j - 2] && 
				s1[i - 2] === s2[j - 1]) {
				matrix[i][j] = Math.min(
					matrix[i][j],
					matrix[i - 2][j - 2] + cost
				);
			}
		}
	}
	
	return Math.min(matrix[len1][len2], maxDistance + 1);
}

/**
 * Scores a single token against a query term using fuzzy matching with prefix bonus
 */
function scoreToken(query: string, token: string): number {
	// Exact prefix match gets full score
	if (token.startsWith(query)) {
		return 1.0;
	}
	
	// Fuzzy matching with distance-based scoring
	const distance = damerauLevenshtein(query, token, 2);
	if (distance > 2) {
		return 0; // Too far for fuzzy match
	}
	
	const maxLength = Math.max(query.length, token.length);
	return Math.max(0, 1 - distance / maxLength);
}

/**
 * Scores a field value against multiple query terms
 */
function scoreField(fieldValue: string | string[], terms: string[], config: ScorerConfig): { score: number; spans: MatchSpan[]; field: SearchableField } {
	if (!terms || terms.length === 0) {
		return { score: 0, spans: [], field: 'body' };
	}
	
	// Convert field value to string and normalize
	const textValue = Array.isArray(fieldValue) ? fieldValue.join(' ') : fieldValue;
	const normalizedField = normalizeText(textValue, config.diacritics);
	const fieldTokens = tokenizeWords(normalizedField, config.diacritics);
	
	if (fieldTokens.length === 0) {
		return { score: 0, spans: [], field: 'body' };
	}
	
	const termScores: number[] = [];
	const spans: MatchSpan[] = [];
	
	// Score each term independently
	for (const term of terms) {
		const normalizedTerm = normalizeText(term, config.diacritics);
		let bestScore = 0;
		let bestMatchSpan: MatchSpan | null = null;
		
		// Find best matching token for this term
		for (let i = 0; i < fieldTokens.length; i++) {
			const token = fieldTokens[i];
			const tokenScore = scoreToken(normalizedTerm, token);
			
			if (tokenScore > bestScore) {
				bestScore = tokenScore;
				
				// Find the position in the original text for the match span
				const tokenIndex = normalizedField.indexOf(token);
				if (tokenIndex >= 0) {
					bestMatchSpan = {
						field: 'body', // Will be updated by caller
						start: tokenIndex,
						end: tokenIndex + token.length
					};
				}
			}
		}
		
		termScores.push(bestScore);
		if (bestMatchSpan) {
			spans.push(bestMatchSpan);
		}
	}
	
	// Average score across all terms
	const avgScore = termScores.length > 0 ? termScores.reduce((sum, score) => sum + score, 0) / termScores.length : 0;
	
	return { score: avgScore, spans, field: 'body' };
}

/**
 * Computes phrase match bonus
 */
function scorePhrases(doc: Doc, phrases: string[], config: ScorerConfig): number {
	if (!phrases || phrases.length === 0) {
		return 0;
	}
	
	let bonusScore = 0;
	
	// Check phrases in title and body
	const titleText = normalizeText(doc.title, config.diacritics);
	const bodyText = normalizeText(doc.body, config.diacritics);
	
	for (const phrase of phrases) {
		const normalizedPhrase = normalizeText(phrase, config.diacritics);
		
		// Count occurrences in title and body
		const titleMatches = (titleText.match(new RegExp(escapeRegex(normalizedPhrase), 'g')) || []).length;
		const bodyMatches = (bodyText.match(new RegExp(escapeRegex(normalizedPhrase), 'g')) || []).length;
		
		// Add 0.25 per occurrence
		bonusScore += (titleMatches + bodyMatches) * 0.25;
	}
	
	return bonusScore;
}

/**
 * Escapes special regex characters
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Computes recency bonus based on document modification time
 */
function computeRecencyBonus(mtime: number, halfLifeDays: number): number {
	const now = Date.now();
	const ageDays = (now - mtime) / (1000 * 60 * 60 * 24); // Convert to days
	
	// Exponential decay with configurable half-life, capped at 0.5
	const bonus = 0.5 * Math.exp(-ageDays * Math.LN2 / halfLifeDays);
	return Math.min(Math.max(bonus, 0), 0.5);
}

/**
 * Checks if document should be excluded based on exclude terms
 */
function isExcluded(doc: Doc, excludes: string[], config: ScorerConfig): boolean {
	if (!excludes || excludes.length === 0) {
		return false;
	}
	
	// Check if any exclude term appears in any field
	const searchableText = [
		doc.title,
		doc.path.join(' '),
		doc.tags.join(' '),
		doc.headings.join(' '),
		doc.symbols.join(' '),
		doc.body
	].join(' ');
	
	const normalizedText = normalizeText(searchableText, config.diacritics);
	
	for (const exclude of excludes) {
		const normalizedExclude = normalizeText(exclude, config.diacritics);
		if (normalizedText.includes(normalizedExclude)) {
			return true;
		}
	}
	
	return false;
}

/**
 * Scores a single document against a parsed query
 */
export function scoreDoc(doc: Doc, query: ParsedQuery, config: ScorerConfig): ScoredDoc | null {
	// Check exclusions first
	if (isExcluded(doc, query.excludes, config)) {
		return null;
	}
	
	let totalScore = 0;
	const allMatchSpans: MatchSpan[] = [];
	
	// Score each field
	const fieldResults = {
		title: scoreField(doc.title, query.terms, config),
		headings: scoreField(doc.headings, query.terms, config),
		path: scoreField(doc.path, query.terms, config),
		tags: scoreField(doc.tags, query.terms, config),
		symbols: scoreField(doc.symbols, query.terms, config),
		body: scoreField(doc.body, query.terms, config)
	};
	
	// Apply weights and accumulate scores
	for (const [fieldName, result] of Object.entries(fieldResults)) {
		const field = fieldName as SearchableField;
		const weight = config.weights[field] || 0;
		totalScore += weight * result.score;
		
		// Update match spans with correct field
		const fieldSpans = result.spans.map(span => ({ ...span, field: field as keyof Doc }));
		allMatchSpans.push(...fieldSpans);
	}
	
	// Add phrase match bonus
	const phraseBonus = scorePhrases(doc, query.phrases, config);
	totalScore += phraseBonus;
	
	// Add recency bonus
	const recencyBonus = computeRecencyBonus(doc.mtime, config.recencyHalfLife);
	totalScore += config.weights.recency * recencyBonus;
	
	return {
		doc,
		score: totalScore,
		matchSpans: allMatchSpans
	};
}

/**
 * Creates a scorer function with the given configuration
 */
export function createScorer(config: ScorerConfig) {
	return (doc: Doc, query: ParsedQuery): ScoredDoc | null => {
		return scoreDoc(doc, query, config);
	};
}

/**
 * Default scorer configuration
 */
export const DEFAULT_SCORER_CONFIG: ScorerConfig = {
	weights: {
		title: 4.0,
		headings: 2.0,
		path: 1.5,
		tags: 1.5,
		symbols: 1.5,
		body: 1.0,
		recency: 0.5
	},
	diacritics: true,
	recencyHalfLife: 30
};