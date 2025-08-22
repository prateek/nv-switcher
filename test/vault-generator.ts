// ABOUTME: Generates test vault content using our synthetic fixtures
// ABOUTME: Populates test/vaults/nv-switcher with realistic documents for E2E testing

import { promises as fs } from 'fs';
import { join } from 'path';
import { FIXTURE_SETS } from '../src/test/fixtures';

const VAULT_PATH = 'test/vaults/nv-switcher';

async function generateTestVault() {
	console.log('🏗️  Generating test vault for E2E testing...');
	
	// Use our development fixture set (100 docs)
	const testDocs = FIXTURE_SETS.development();
	
	// Create folder structure
	const folders = new Set<string>();
	testDocs.forEach(doc => {
		if (doc.path.length > 0) {
			for (let i = 0; i < doc.path.length; i++) {
				const folderPath = doc.path.slice(0, i + 1).join('/');
				folders.add(folderPath);
			}
		}
	});

	// Create directories
	for (const folder of folders) {
		await fs.mkdir(join(VAULT_PATH, folder), { recursive: true });
	}

	// Create markdown files
	for (const doc of testDocs) {
		const filePath = doc.path.length > 0 
			? join(VAULT_PATH, ...doc.path, doc.id)
			: join(VAULT_PATH, doc.id);

		// Create realistic markdown content
		const frontmatter = doc.tags.length > 0 ? 
			`---\ntags:\n${doc.tags.map(tag => `  - ${tag}`).join('\n')}\n---\n\n` : '';
		
		const headingsContent = doc.headings.length > 0 ?
			doc.headings.map(h => `## ${h}\n\nContent for ${h} section.\n`).join('\n') : '';

		const symbolsContent = doc.symbols.length > 0 ?
			`\n\n### References\n${doc.symbols.join(', ')}\n` : '';

		const fullContent = `${frontmatter}# ${doc.title}\n\n${doc.body}\n\n${headingsContent}${symbolsContent}`;

		await fs.writeFile(filePath, fullContent);
		
		// Set mtime to match the document metadata for recency testing
		await fs.utimes(filePath, new Date(doc.mtime), new Date(doc.mtime));
	}

	console.log(`✅ Created ${testDocs.length} test documents in vault`);
}

// Run if called directly
if (require.main === module) {
	generateTestVault().catch(console.error);
}

export { generateTestVault };