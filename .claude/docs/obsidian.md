# Obsidian Plugin Development Guide

## Overview

This guide provides comprehensive information for developing Obsidian plugins, based on official documentation and well-architected plugin examples from the community.

## Quick Start

### Setup
```bash
# Navigate to vault plugins directory
cd path/to/vault
mkdir .obsidian/plugins
cd .obsidian/plugins

# Clone sample plugin
git clone https://github.com/obsidianmd/obsidian-sample-plugin.git
cd obsidian-sample-plugin

# Install dependencies and build
npm install
npm run dev
```

### Basic Plugin Structure

```typescript
import { Plugin } from 'obsidian';

export default class ExamplePlugin extends Plugin {
  async onload() {
    // Configure resources needed by the plugin
    console.log('loading plugin');
    
    // Add ribbon icon
    this.addRibbonIcon('dice', 'Greet', () => {
      new Notice('Hello, world!');
    });
  }
  
  async onunload() {
    // Release any resources configured by the plugin
    console.log('unloading plugin');
  }
}
```

## Essential Concepts

### Plugin Lifecycle
- **onload()**: Called when plugin is enabled - setup resources, event listeners, UI elements
- **onunload()**: Called when plugin is disabled - cleanup resources to prevent memory leaks
- Use `this.register*` methods for automatic cleanup

### App Instance Access
- **Always use `this.app`** within your plugin class
- **Never use global `app`** - it's for debugging only and may be removed

### Resource Management
```typescript
export default class MyPlugin extends Plugin {
  onload() {
    // Automatic cleanup with register methods
    this.registerEvent(this.app.vault.on('create', this.onCreate));
    this.registerDomEvent(element, 'click', callback);
    this.registerInterval(setInterval(callback, 1000));
  }

  onCreate = (file: TAbstractFile) => {
    // Handle file creation
  }
}
```

## Core APIs

### Vault Operations
```typescript
// Prefer Vault API over Adapter API for performance
const file = this.app.vault.getFileByPath('path/to/file.md');
const content = await this.app.vault.read(file);

// For active files, use Editor API instead of Vault.modify()
const editor = this.app.workspace.activeEditor?.editor;
if (editor) {
  editor.replaceRange('new text', editor.getCursor());
}

// For background file edits, use Vault.process for atomic operations
await this.app.vault.process(file, (content) => {
  return content.replace('old', 'new');
});
```

### Frontmatter Management
```typescript
// Use FileManager.processFrontMatter for safe frontmatter editing
await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
  frontmatter['new-key'] = 'new-value';
  delete frontmatter['old-key'];
});
```

### Workspace and Views
```typescript
// Access active view safely
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
if (view) {
  const editor = view.editor;
  const file = view.file;
}

// Modern editor access (v1.1.1+)
const { activeEditor } = this.app.workspace;
if (activeEditor) {
  const editor = activeEditor.editor;
  const file = activeEditor.file;
}
```

### Data Persistence
```typescript
// Use Plugin.loadData() and Plugin.saveData() for plugin data
export default class MyPlugin extends Plugin {
  async onload() {
    const data = await this.loadData();
    if (data) {
      console.log('Loaded data:', data);
    }
  }

  async saveMyData(data: any) {
    await this.saveData(data);
  }
}
```

## UI Development

### DOM Creation (Secure)
```typescript
// Secure DOM creation - avoid innerHTML
function createSecureElement(containerEl: HTMLElement, name: string) {
  containerEl.empty(); // Safely clear content
  const div = containerEl.createDiv({ cls: "my-class" });
  div.createEl("b", { text: "Your name is: " });
  div.createSpan({ text: name });
}
```

### CSS Best Practices
```css
/* Use CSS classes, not inline styles */
.my-plugin-container {
  color: var(--text-normal);
  background-color: var(--background-modifier-error);
}

/* Use logical properties for RTL support */
.element {
  margin-inline-start: 16px; /* Instead of margin-left */
  padding-inline-end: 12px;  /* Instead of padding-right */
}
```

### Settings Tab
```typescript
// Use setHeading() for consistent styling
new Setting(containerEl)
  .setName('Your Heading Title')
  .setHeading();

new Setting(containerEl)
  .setName('Setting name')
  .setDesc('Setting description')
  .addText(text => text
    .setPlaceholder('Enter value')
    .setValue(this.settings.value)
    .onChange(async (value) => {
      this.settings.value = value;
      await this.saveSettings();
    }));
```

### Custom Views
```typescript
export const VIEW_TYPE_EXAMPLE = 'example-view';

export class ExampleView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_EXAMPLE;
  }

  getDisplayText() {
    return 'Example view';
  }

  async onOpen() {
    const container = this.contentEl;
    container.empty();
    container.createEl('h4', { text: 'Example view' });
  }

  async onClose() {
    // Cleanup
  }
}

// Register in plugin
this.registerView(
  VIEW_TYPE_EXAMPLE,
  (leaf) => new ExampleView(leaf)
);
```

## Commands and Events

### Adding Commands
```typescript
this.addCommand({
  id: 'example-command',
  name: 'Example Command',
  callback: () => {
    new Notice('Command executed!');
  }
});

// For editor-specific commands
this.addCommand({
  id: 'editor-command',
  name: 'Editor Command',
  editorCallback: (editor: Editor, view: MarkdownView) => {
    editor.replaceSelection('Hello World!');
  }
});
```

### Event Handling
```typescript
// Vault events
this.registerEvent(
  this.app.vault.on('create', this.onFileCreate)
);

this.registerEvent(
  this.app.vault.on('modify', this.onFileModify)
);

// Workspace events
this.registerEvent(
  this.app.workspace.on('file-open', this.onFileOpen)
);
```

## Modern Framework Integration

### React Integration
```bash
# Install React dependencies
npm install react react-dom
npm install --save-dev @types/react @types/react-dom
```

```tsx
// React component
export const ReactView = () => {
  return <h4>Hello, React!</h4>;
};

// Render in view
import { createRoot } from 'react-dom/client';

export class ReactExampleView extends ItemView {
  async onOpen() {
    const root = createRoot(this.contentEl);
    root.render(<ReactView />);
  }
}
```

### Svelte Integration
```bash
# Install Svelte dependencies
npm install --save-dev svelte svelte-preprocess esbuild-svelte svelte-check
npm install typescript@~5.0.0
```

```javascript
// Update esbuild.config.mjs
import esbuildSvelte from 'esbuild-svelte';
import { sveltePreprocess } from 'svelte-preprocess';

const context = await esbuild.context({
  plugins: [
    esbuildSvelte({
      compilerOptions: { css: 'injected' },
      preprocess: sveltePreprocess(),
    }),
  ],
  // ...
});
```

## Performance Best Practices

### Load Time Optimization
```typescript
// Defer heavy operations until workspace is ready
class MyPlugin extends Plugin {
  onload() {
    this.app.workspace.onLayoutReady(() => {
      // Heavy initialization here
      this.registerEvent(this.app.vault.on('create', this.onCreate));
    });
  }
}
```

### Efficient File Operations
```typescript
// Use direct file access instead of iteration
const file = this.app.vault.getFileByPath(filePath);
const folder = this.app.vault.getFolderByPath(folderPath);

// Avoid this in large vaults:
// this.app.vault.getFiles().find(file => file.path === filePath);
```

### Path Normalization
```typescript
import { normalizePath } from 'obsidian';

function cleanPath(userPath: string): string {
  return normalizePath(userPath);
}
```

## Mobile Development

### Platform Detection
```typescript
import { Platform } from 'obsidian';

if (Platform.isMobile) {
  // Mobile-specific logic
}

if (Platform.isIosApp) {
  // iOS-specific logic
}

if (Platform.isAndroidApp) {
  // Android-specific logic
}
```

### Mobile Testing
```typescript
// Enable mobile emulation in desktop
this.app.emulateMobile(true);

// Toggle mobile emulation
this.app.emulateMobile(!this.app.isMobile);

// Disable mobile emulation
this.app.emulateMobile(false);
```

### Network Requests
```typescript
import { requestUrl } from 'obsidian';

// Use requestUrl instead of fetch for mobile compatibility
async function fetchData(url: string) {
  try {
    const response = await requestUrl(url);
    return response.json;
  } catch (error) {
    console.error('Request failed:', error);
  }
}
```

## Plugin Submission & Release

### Required Files
- `README.md`: Plugin description and usage
- `LICENSE`: Usage terms (consider MIT license)
- `manifest.json`: Plugin metadata
- `main.js`: Compiled plugin code (release only)
- `styles.css`: Plugin styles (optional)

### Manifest Configuration
```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "minAppVersion": "0.15.0",
  "description": "A description of my plugin.",
  "author": "Your Name",
  "authorUrl": "https://yourwebsite.com",
  "fundingUrl": "https://ko-fi.com/yourname",
  "isDesktopOnly": false
}
```

### GitHub Actions Release
```yaml
name: Release Obsidian plugin
on:
  push:
    tags: ["*"]

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v3
      - name: Use Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "18.x"
      - name: Build plugin
        run: |
          npm install
          npm run build
      - name: Create release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          tag="${GITHUB_REF#refs/tags/}"
          gh release create "$tag" \
            --title="$tag" \
            --draft \
            main.js manifest.json styles.css
```

### Release Process
1. Update version in `manifest.json`
2. Create GitHub release with matching tag
3. Upload `main.js`, `manifest.json`, and `styles.css`
4. Submit to community plugins list

## Code Quality Guidelines

### TypeScript Best Practices
```typescript
// Use proper typing, avoid 'as any'
interface MyData { 
  id: number; 
  name: string; 
}

// Use modern variable declarations
const MAX_COUNT = 10;
let count = 0;

// Use async/await over Promise chains
async function fetchAndProcess(): Promise<string | null> {
  try {
    const response = await requestUrl('https://example.com');
    return response.text;
  } catch (error) {
    console.error(error);
    return null;
  }
}
```

### Security Considerations
- Never expose secrets or API keys
- Validate user input
- Use secure DOM creation methods
- Avoid global variables
- Clean up resources properly

### Plugin Architecture Patterns

Based on excellent community examples:

#### 1. **Dataview Plugin** (blacksmithgu/obsidian-dataview)
- **Architecture**: Query engine with AST parsing
- **Patterns**: Modular query language, efficient indexing
- **Structure**: Separate data layer, query engine, and UI components
- **Key Lessons**: Performance optimization for large vaults, extensible query language

#### 2. **Excalidraw Plugin** (zsviczian/obsidian-excalidraw-plugin)
- **Architecture**: Complex UI integration with external library
- **Patterns**: Event system, custom file handlers, extensive settings
- **Structure**: Modular view components, utility functions, comprehensive settings
- **Key Lessons**: Large plugin organization, external library integration

#### 3. **Tasks Plugin** (obsidian-tasks-group/obsidian-tasks)
- **Architecture**: Task management with query system
- **Patterns**: Data modeling, filtering, sorting, comprehensive testing
- **Structure**: Well-organized source with clear separation of concerns
- **Key Lessons**: Maintainable large codebase, comprehensive documentation

## Common Pitfalls to Avoid

1. **Don't use global `app`** - always use `this.app`
2. **Don't include "Obsidian" in plugin name** unless necessary
3. **Don't set default hotkeys** - let users configure
4. **Don't store view references** - use factory functions
5. **Don't detach leaves in onunload** - let Obsidian handle it
6. **Don't use innerHTML** - use secure DOM methods
7. **Don't manually manage plugin data** - use loadData/saveData
8. **Don't commit main.js** - only include in releases
9. **Don't use hardcoded styles** - use CSS classes and variables
10. **Don't ignore mobile compatibility** - test on mobile platforms

## Development Tools

### Hot Reloading
```bash
npm run dev  # Watches for changes and rebuilds
```

### Developer Console
- Open with `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Opt+I` (Mac)
- Mobile emulation: `app.emulateMobile(true)`
- Access plugin instance: Use proper debugging techniques

### Testing
```typescript
// Unit testing setup with Jest
import { Plugin } from 'obsidian';

describe('MyPlugin', () => {
  test('should initialize correctly', () => {
    // Test logic
  });
});
```

## Resources

### Official Documentation
- [Obsidian Developer Docs](https://docs.obsidian.md/Plugins)
- [Plugin API Reference](https://github.com/obsidianmd/obsidian-api)
- [Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)

### Community Examples
- [Dataview](https://github.com/blacksmithgu/obsidian-dataview) - Query language and indexing
- [Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin) - Complex UI integration
- [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) - Task management system

### Plugin Templates
- [Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin) - Official template
- [Svelte Template](https://github.com/emilio-toledo/obsidian-svelte-plugin) - Svelte + TailwindCSS

This guide provides the essential knowledge for developing high-quality Obsidian plugins. Follow these patterns and best practices to create maintainable, performant, and user-friendly plugins.