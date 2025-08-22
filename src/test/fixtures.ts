// ABOUTME: Deterministic synthetic data generators for testing with realistic vault distributions
// ABOUTME: Provides fixtures for unit tests, E2E tests, and property-based testing scenarios

import type { Doc } from '../search/types';

export interface FixtureOptions {
	/** Number of documents to generate */
	count: number;
	/** Random seed for deterministic generation */
	seed?: number;
	/** Include diacritics and Unicode content */
	includeDiacritics?: boolean;
	/** Include regex-heavy content for testing edge cases */
	includeRegexContent?: boolean;
	/** Maximum body size in characters */
	maxBodySize?: number;
	/** Time range for document mtimes (days ago) */
	timeRangeDays?: number;
}

/**
 * Simple seeded random number generator for deterministic fixtures
 */
class SeededRandom {
	private seed: number;

	constructor(seed: number = 12345) {
		this.seed = seed;
	}

	next(): number {
		this.seed = (this.seed * 9301 + 49297) % 233280;
		return this.seed / 233280;
	}

	integer(min: number, max: number): number {
		return Math.floor(this.next() * (max - min + 1)) + min;
	}

	choice<T>(array: T[]): T {
		return array[this.integer(0, array.length - 1)];
	}

	sample<T>(array: T[], count: number): T[] {
		const result: T[] = [];
		const available = [...array];
		for (let i = 0; i < Math.min(count, available.length); i++) {
			const index = this.integer(0, available.length - 1);
			result.push(available.splice(index, 1)[0]);
		}
		return result;
	}
}

/**
 * Realistic content templates based on common note patterns
 */
const CONTENT_TEMPLATES = {
	small: [
		"Quick reminder about {topic}",
		"Meeting at {time} with {person}",
		"TODO: {action}",
		"Idea: {concept}",
		"Note to self: {reminder}",
		"Shopping list: {items}",
		"Phone number: {contact}",
		"Address: {location}",
		"Password hint: {hint}",
		"Bookmark: {url}"
	],
	
	medium: [
		"Project planning document for {project}. Key stakeholders include {stakeholders}. Timeline spans {duration} with major milestones at {milestones}. Budget considerations include {budget} and resource allocation needs careful review.",
		"Meeting notes from {meeting_type} covering {topics}. Action items assigned to {assignees} with deadlines on {dates}. Follow-up scheduled for {next_date}.",
		"Research analysis on {subject} revealing {findings}. Methodology involved {methods} with sample size of {sample}. Recommendations include {recommendations}.",
		"Technical implementation covering {technology} with {architecture}. Performance considerations include {performance} and security requirements documented as {security}.",
		"Product requirements for {feature} including user stories, acceptance criteria, and technical constraints. Wireframes attached showing {ui_elements}."
	],
	
	large: [
		"Comprehensive project documentation including detailed analysis of requirements, technical architecture, implementation strategy, and deployment considerations. This document serves as the primary reference for all stakeholders involved in the project lifecycle.\n\n## Overview\nThe project aims to {objective} by implementing {solution} using {technology_stack}. Key business drivers include {business_drivers} and success will be measured by {metrics}.\n\n## Technical Architecture\nSystem design follows {architecture_pattern} with {components}. Database schema includes {entities} with relationships {relationships}. API design implements {api_pattern} with endpoints for {endpoints}.\n\n## Implementation Strategy\nDevelopment will proceed in {phases} phases over {timeline}. Each phase delivers {deliverables} and includes {testing_strategy}. Resource requirements include {resources} and dependencies on {dependencies}.\n\n## Risk Assessment\nKey risks include {risks} with mitigation strategies {mitigations}. Contingency plans address {contingencies} and success criteria include {success_criteria}.",
		
		"Research findings and analysis report documenting extensive investigation into {research_area}. The research methodology involved {methodology} and data collection through {data_sources}.\n\n## Executive Summary\nKey findings reveal {key_findings} with implications for {implications}. Market analysis shows {market_trends} and competitive landscape includes {competitors}.\n\n## Detailed Analysis\nQuantitative analysis of {metrics} shows {quantitative_results}. Qualitative insights from {qualitative_sources} indicate {qualitative_insights}. Cross-analysis reveals {correlations} and statistical significance of {statistical_findings}.\n\n## Recommendations\nStrategic recommendations include {strategic_recommendations} with tactical steps {tactical_steps}. Implementation roadmap spans {implementation_timeline} with resource requirements {resource_requirements}.\n\n## Appendices\nSupporting data includes {supporting_data} and methodology details cover {methodology_details}. References include {references} and acknowledgments to {acknowledgments}."
	]
};

/**
 * Realistic tag patterns based on common organizational systems
 */
const TAG_PATTERNS = {
	categories: ['project', 'personal', 'work', 'study', 'reference', 'archive'],
	priorities: ['urgent', 'high', 'medium', 'low'],
	statuses: ['todo', 'in-progress', 'done', 'blocked', 'deferred'],
	contexts: ['home', 'office', 'travel', 'meeting', 'review'],
	projects: ['alpha', 'beta', 'gamma', 'delta', 'epsilon'],
	people: ['alice', 'bob', 'charlie', 'diana', 'eve'],
	technologies: ['typescript', 'react', 'node', 'docker', 'aws', 'obsidian'],
	special: ['📝', '🔥', '⭐', '💡', '🚀', '⚠️'] // Unicode tags
};

/**
 * Common folder structures for realistic path generation
 */
const FOLDER_STRUCTURES = [
	['Inbox'],
	['Projects', 'Work'],
	['Projects', 'Personal'],
	['Areas', 'Health'],
	['Areas', 'Finance'],
	['Resources', 'Technical'],
	['Resources', 'Reference'],
	['Archive', '2023'],
	['Archive', '2024'],
	['Daily Notes'],
	['Templates'],
	['Attachments']
];

/**
 * Patterns that stress regex parsing and special characters
 */
const REGEX_STRESS_CONTENT = [
	"Function definition: function testRegex() { return /[a-z]+/gi.test(input); }",
	"Regex patterns: /\\d{4}-\\d{2}-\\d{2}/ for dates, /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/ for emails",
	"SQL query: SELECT * FROM users WHERE email LIKE '%@example.com' AND created_at > '2023-01-01'",
	"Path matching: /usr/local/bin/{app1,app2}/*.{js,ts} and ~/Documents/**/*.{md,txt}",
	"Special chars: !@#$%^&*()[]{}|\\:;\"'<>,.?/~`±§€£¥¢∞",
	"Unicode mix: café naïve résumé Москва 北京市 العربية हिन्दी 日本語 🎉🔥💡",
	"Code blocks with symbols: [[wikilink]] #tag @person !important $variable %template",
	"Mathematical notation: ∀x∈ℝ: f(x) = ∑(i=1→∞) aᵢxⁱ where aᵢ ≠ 0"
];

/**
 * Diacritic-rich content for internationalization testing
 */
const DIACRITIC_CONTENT = [
	"français: café, naïve, résumé, Noël, coopération",
	"español: niño, mañana, corazón, lingüística, años",
	"português: ação, coração, não, pão, informação",
	"deutsch: Mädchen, Größe, weiß, Straße, Bär",
	"polski: ćwiczenie, łódź, ż, ą, ę, ł, ń, ó, ś, ź",
	"čeština: žluťoučký, kůň, úpěl, ďábelské, ódy",
	"norsk: æ, ø, å, bjørn, kjærlighet, håp",
	"türkçe: çocuk, ğül, ı, ş, ü, ö"
];

/**
 * Generate deterministic synthetic vault with realistic distribution
 */
export function generateSyntheticVault(options: FixtureOptions): Doc[] {
	const {
		count,
		seed = 12345,
		includeDiacritics = true,
		includeRegexContent = true,
		maxBodySize = 50000,
		timeRangeDays = 365
	} = options;

	const rng = new SeededRandom(seed);
	const docs: Doc[] = [];
	// Use fixed timestamp for deterministic generation
	const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
	const dayMs = 24 * 60 * 60 * 1000;

	for (let i = 0; i < count; i++) {
		// Realistic size distribution based on typical vaults:
		// 20% small (10-99 chars), 49% medium (100-999 chars), 
		// 28% large (1K-9K chars), 3% extra large (10K+ chars)
		const sizeCategory = rng.next();
		let content: string;
		let baseTemplate: string;

		if (sizeCategory < 0.20) {
			// Small notes
			baseTemplate = rng.choice(CONTENT_TEMPLATES.small);
			content = expandTemplate(baseTemplate, rng).substring(0, 50 + rng.integer(0, 49));
		} else if (sizeCategory < 0.69) {
			// Medium notes
			baseTemplate = rng.choice(CONTENT_TEMPLATES.medium);
			content = expandTemplate(baseTemplate, rng).substring(0, 100 + rng.integer(0, 899));
		} else if (sizeCategory < 0.97) {
			// Large notes
			baseTemplate = rng.choice(CONTENT_TEMPLATES.large);
			const expandedContent = expandTemplate(baseTemplate, rng);
			const repeat = 1 + rng.integer(0, 2); // 1-3x repetition
			content = (expandedContent + "\n\n").repeat(repeat).substring(0, Math.min(1000 + rng.integer(0, 8000), maxBodySize));
		} else {
			// Extra large notes
			baseTemplate = rng.choice(CONTENT_TEMPLATES.large);
			const expandedContent = expandTemplate(baseTemplate, rng);
			content = (expandedContent + "\n\n").repeat(3).substring(0, Math.min(10000 + rng.integer(0, 40000), maxBodySize));
		}

		// Add special content for testing (but respect maxBodySize)
		if (includeDiacritics && rng.next() < 0.15) {
			const additionalContent = "\n\n" + rng.choice(DIACRITIC_CONTENT);
			if (content.length + additionalContent.length <= maxBodySize) {
				content += additionalContent;
			}
		}

		if (includeRegexContent && rng.next() < 0.10) {
			const additionalContent = "\n\n" + rng.choice(REGEX_STRESS_CONTENT);
			if (content.length + additionalContent.length <= maxBodySize) {
				content += additionalContent;
			}
		}

		// Final size enforcement
		if (content.length > maxBodySize) {
			content = content.substring(0, maxBodySize);
		}

		// Generate realistic metadata
		const folderPath = rng.choice(FOLDER_STRUCTURES);
		const tags = generateTags(rng, i);
		const headings = generateHeadings(rng, content);
		const symbols = generateSymbols(rng, content);

		docs.push({
			id: `synthetic-${i.toString().padStart(5, '0')}.md`,
			title: generateTitle(rng, i, tags),
			path: folderPath,
			tags,
			headings,
			symbols,
			body: content,
			mtime: baseTime - rng.integer(0, timeRangeDays * dayMs),
			size: content.length
		});
	}

	return docs;
}

/**
 * Generate realistic tags for a document
 */
function generateTags(rng: SeededRandom, docIndex: number): string[] {
	const tags: string[] = [];
	
	// Most docs have 1-4 tags
	const tagCount = rng.integer(1, 4);
	
	// Always include a category
	tags.push(rng.choice(TAG_PATTERNS.categories));
	
	// 60% chance of priority
	if (rng.next() < 0.6) {
		tags.push(rng.choice(TAG_PATTERNS.priorities));
	}
	
	// 40% chance of status
	if (rng.next() < 0.4) {
		tags.push(rng.choice(TAG_PATTERNS.statuses));
	}
	
	// 30% chance of context
	if (rng.next() < 0.3) {
		tags.push(rng.choice(TAG_PATTERNS.contexts));
	}
	
	// 25% chance of project association
	if (rng.next() < 0.25) {
		tags.push(rng.choice(TAG_PATTERNS.projects));
	}
	
	// 20% chance of person association
	if (rng.next() < 0.2) {
		tags.push(rng.choice(TAG_PATTERNS.people));
	}
	
	// 15% chance of technology tag
	if (rng.next() < 0.15) {
		tags.push(rng.choice(TAG_PATTERNS.technologies));
	}
	
	// 10% chance of special Unicode tag
	if (rng.next() < 0.1) {
		tags.push(rng.choice(TAG_PATTERNS.special));
	}
	
	// Add some unique tags based on doc index
	if (docIndex % 10 === 0) {
		tags.push(`milestone-${Math.floor(docIndex / 10)}`);
	}
	
	if (docIndex % 25 === 0) {
		tags.push(`batch-${Math.floor(docIndex / 25)}`);
	}

	// Remove duplicates and limit to reasonable count
	return [...new Set(tags)].slice(0, tagCount);
}

/**
 * Generate realistic headings based on content
 */
function generateHeadings(rng: SeededRandom, content: string): string[] {
	const headings: string[] = [];
	const headingTemplates = [
		"Overview", "Introduction", "Background", "Analysis", "Results", 
		"Discussion", "Conclusion", "Next Steps", "References", "Appendix",
		"Goals", "Objectives", "Requirements", "Implementation", "Testing",
		"Performance", "Security", "Deployment", "Maintenance", "Support"
	];

	// Number of headings based on content length
	const headingCount = content.length < 200 ? 
		rng.integer(0, 2) : 
		content.length < 1000 ? 
			rng.integer(1, 4) : 
			rng.integer(2, 8);

	for (let i = 0; i < headingCount; i++) {
		const base = rng.choice(headingTemplates);
		const variation = rng.integer(1, 100);
		
		if (variation > 80) {
			headings.push(`${base} ${rng.integer(1, 10)}`);
		} else if (variation > 60) {
			headings.push(`${base} Details`);
		} else {
			headings.push(base);
		}
	}

	return [...new Set(headings)]; // Remove duplicates
}

/**
 * Generate realistic symbols including links and references
 */
function generateSymbols(rng: SeededRandom, content: string): string[] {
	const symbols: string[] = [];
	
	// Generate wiki-style links
	const linkCount = rng.integer(0, 5);
	for (let i = 0; i < linkCount; i++) {
		const linkType = rng.choice(['note', 'person', 'concept', 'project']);
		const linkId = rng.integer(1, 1000);
		symbols.push(`[[${linkType}-${linkId}]]`);
	}
	
	// Generate block references
	if (rng.next() < 0.3) {
		const blockId = rng.integer(1000, 9999);
		symbols.push(`^block-${blockId}`);
	}
	
	// Generate code symbols if content suggests technical nature
	if (content.includes('function') || content.includes('class') || content.includes('import')) {
		const codeSymbols = [
			'@function', '@class', '@interface', '@type', '@enum',
			'@method', '@property', '@variable', '@constant'
		];
		symbols.push(...rng.sample(codeSymbols, rng.integer(1, 3)));
	}
	
	// Add some mathematical or scientific symbols for edge case testing
	if (rng.next() < 0.1) {
		const sciSymbols = ['∀', '∃', '∈', '∉', '⊂', '⊃', '∪', '∩', '→', '↔', '¬', '∧', '∨'];
		symbols.push(rng.choice(sciSymbols));
	}

	return symbols;
}

/**
 * Generate realistic document titles
 */
function generateTitle(rng: SeededRandom, docIndex: number, tags: string[]): string {
	const titleTemplates = [
		"{Type} {Number}: {Subject}",
		"{Subject} {Action}",
		"{Date} - {Event}",
		"{Project} {Component}",
		"Notes on {Topic}",
		"{Action} {Object}",
		"How to {Verb} {Object}",
		"{Adjective} {Noun}",
		"{Subject} Analysis",
		"{Topic} Review"
	];

	const template = rng.choice(titleTemplates);
	return expandTemplate(template, rng, { docIndex, tags });
}

/**
 * Expand a template string with realistic values
 */
function expandTemplate(template: string, rng: SeededRandom, context?: { docIndex?: number; tags?: string[] }): string {
	const replacements: Record<string, string[]> = {
		'{topic}': ['authentication', 'performance', 'security', 'deployment', 'testing'],
		'{project}': ['Alpha System', 'Beta Platform', 'Core Infrastructure', 'User Interface'],
		'{technology}': ['TypeScript', 'React', 'Node.js', 'Docker', 'Kubernetes'],
		'{action}': ['implement', 'review', 'test', 'deploy', 'monitor'],
		'{subject}': ['API Design', 'Database Schema', 'User Interface', 'Authentication'],
		'{Type}': ['Meeting', 'Project', 'Research', 'Analysis', 'Review'],
		'{Number}': [rng.integer(1, 100).toString()],
		'{Subject}': ['Authentication System', 'Database Migration', 'UI Redesign'],
		'{Action}': ['Planning', 'Implementation', 'Review', 'Testing'],
		'{Date}': ['2024-01-15', '2024-02-20', '2024-03-10'],
		'{Event}': ['Sprint Planning', 'Code Review', 'Demo', 'Retrospective'],
		'{Project}': ['Project Alpha', 'System Beta', 'Platform Gamma'],
		'{Component}': ['Backend', 'Frontend', 'Database', 'API'],
		'{Topic}': ['Performance', 'Security', 'Usability', 'Scalability'],
		'{Verb}': ['implement', 'optimize', 'secure', 'test'],
		'{Object}': ['authentication', 'database', 'interface', 'workflow'],
		'{Adjective}': ['Advanced', 'Optimized', 'Secure', 'Scalable'],
		'{Noun}': ['Architecture', 'Framework', 'System', 'Platform']
	};

	let result = template;
	for (const [placeholder, options] of Object.entries(replacements)) {
		if (result.includes(placeholder)) {
			result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), rng.choice(options));
		}
	}

	return result;
}

/**
 * Predefined fixture sets for common testing scenarios
 */
export const FIXTURE_SETS = {
	/**
	 * Minimal set for smoke tests (10 docs)
	 */
	smoke: (): Doc[] => generateSyntheticVault({ 
		count: 10, 
		seed: 11111,
		maxBodySize: 1000 
	}),

	/**
	 * Small development set (100 docs)
	 */
	development: (): Doc[] => generateSyntheticVault({ 
		count: 100, 
		seed: 22222,
		maxBodySize: 5000 
	}),

	/**
	 * Medium realistic vault (1000 docs)
	 */
	realistic: (): Doc[] => generateSyntheticVault({ 
		count: 1000, 
		seed: 33333,
		includeDiacritics: true,
		includeRegexContent: true 
	}),

	/**
	 * Large stress test vault (5000 docs)
	 */
	stress: (): Doc[] => generateSyntheticVault({ 
		count: 5000, 
		seed: 44444,
		includeDiacritics: true,
		includeRegexContent: true 
	}),

	/**
	 * Maximum size for performance testing (10000 docs)
	 */
	performance: (): Doc[] => generateSyntheticVault({ 
		count: 10000, 
		seed: 55555,
		includeDiacritics: true,
		includeRegexContent: true,
		timeRangeDays: 1095 // 3 years
	}),

	/**
	 * Diacritics-focused set for internationalization testing
	 */
	diacritics: (): Doc[] => generateSyntheticVault({ 
		count: 200, 
		seed: 66666,
		includeDiacritics: true,
		includeRegexContent: false,
		maxBodySize: 2000 
	}),

	/**
	 * Regex stress testing set
	 */
	regexStress: (): Doc[] => generateSyntheticVault({ 
		count: 500, 
		seed: 77777,
		includeDiacritics: false,
		includeRegexContent: true,
		maxBodySize: 10000 
	}),

	/**
	 * Edge case set with minimal and extreme documents
	 */
	edgeCases: (): Doc[] => {
		const rng = new SeededRandom(88888);
		const docs: Doc[] = [];

		const baseTime = new Date('2024-01-01T00:00:00Z').getTime();

		// Empty document
		docs.push({
			id: 'empty.md',
			title: '',
			path: [],
			tags: [],
			headings: [],
			symbols: [],
			body: '',
			mtime: baseTime,
			size: 0
		});

		// Document with only special characters
		docs.push({
			id: 'special-chars.md',
			title: '!@#$%^&*()',
			path: ['Special'],
			tags: ['🔥', '⭐'],
			headings: ['Special Characters'],
			symbols: ['[[link]]', '@symbol'],
			body: REGEX_STRESS_CONTENT[4], // Special chars content
			mtime: baseTime - 1000,
			size: 100
		});

		// Very old document
		docs.push({
			id: 'ancient.md',
			title: 'Ancient Document',
			path: ['Archive', 'Old'],
			tags: ['archive', 'old'],
			headings: ['Historical Context'],
			symbols: [],
			body: 'This document is very old and tests recency scoring.',
			mtime: baseTime - (5 * 365 * 24 * 60 * 60 * 1000), // 5 years ago
			size: 50
		});

		// Document with extreme Unicode
		docs.push({
			id: 'unicode.md',
			title: '中文 العربية हिन्दी 🌟',
			path: ['International'],
			tags: ['unicode', '中文', 'العربية'],
			headings: ['Unicode Testing', '国际化', 'تجربة'],
			symbols: ['[[中文链接]]', '@العربية', '🎉'],
			body: 'Testing Unicode handling: 中文测试 العربية हिन्दी اختبار जाँच 🌟🔥💡',
			mtime: baseTime - rng.integer(1, 30) * 24 * 60 * 60 * 1000,
			size: 200
		});

		return docs;
	}
};

/**
 * Utility to create custom fixture sets with specific characteristics
 */
export function createCustomFixture(options: {
	count: number;
	seed?: number;
	titlePatterns?: string[];
	tagPatterns?: string[];
	contentTemplates?: string[];
	folderStructure?: string[][];
}): Doc[] {
	const rng = new SeededRandom(options.seed ?? 99999);
	const docs: Doc[] = [];

	for (let i = 0; i < options.count; i++) {
		const title = options.titlePatterns ? 
			expandTemplate(rng.choice(options.titlePatterns), rng) :
			`Custom Document ${i}`;

		const content = options.contentTemplates ?
			expandTemplate(rng.choice(options.contentTemplates), rng) :
			`This is custom document ${i} with some content for testing.`;

		docs.push({
			id: `custom-${i}.md`,
			title,
			path: options.folderStructure ? rng.choice(options.folderStructure) : ['Custom'],
			tags: options.tagPatterns ? 
				rng.sample(options.tagPatterns, rng.integer(1, 3)) : 
				[`tag-${i % 5}`],
			headings: [`Section ${i % 3}`],
			symbols: [`[[link-${i}]]`],
			body: content,
			mtime: new Date('2024-01-01T00:00:00Z').getTime() - rng.integer(0, 30) * 24 * 60 * 60 * 1000,
			size: content.length
		});
	}

	return docs;
}