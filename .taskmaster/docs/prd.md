
# nv-switcher — Product & Technical Spec (v1.0)

## 0) Summary

A new Obsidian plugin that provides a **one-box** nvALT flow:

* **Type → open; Enter → create** if no match (supports `folder/Note`).
* **Full-text** search (title, path, headings, tags, symbols, body).
* **`>` Commands mode** (type `>` to search & run commands).
* **nvALT-style preview**: inline snippet in the list + multi-fragment bottom preview with highlights.
* **macOS + iOS** compatible; no external binaries; portable indexing.
* **TDD-first**: core logic covered by unit tests; modal behaviors covered by integration tests.

Non-goals for v1: saved searches, backlinks/2-hop, OCR of images/PDFs.

---

## 1) User stories

1. **Open or create fast**
   As a user, I press **⌘N**, type a title, and hit **Enter** to open if found or **create** if not. **⇧Enter** force-creates.
2. **Search inside notes**
   I type a few words and see ranked results with an **inline snippet** and a **bottom preview** showing the best fragments with highlighted matches.
3. **Commands quickly**
   I type **`>`** then a command name and press Enter to execute.
4. **Vimmy navigation**
   I use **⌘J/⌘K** (or Ctrl on Win/Linux) to move selection, **Tab** to focus preview, **⌥←/→** to rotate fragments.
5. **Customize behavior**
   I can rebind keys, tune search weights, and configure preview density without editing code.

---

## 2) UX & layout (nvALT-like)

Modal (own implementation on top of `SuggestModal` or custom modal):

* **Top**: single-line input.
* **Middle: Results list** (virtualized if easy):

  * **Left**: **Title — inline snippet** (first/best fragment), with `<mark>` highlights.
  * **Right**: **Modified** (relative or locale date) + small path.
  * First row becomes **“Create ‘{Query}’”** when there are zero matches.
* **Bottom: Preview pane** (fixed height):

  * 3–5 **fragments** (\~120 chars each) around matches with `<mark>` highlights.
  * Chevrons ◀ ▶ and **⌥←/→** to cycle when >N fragments.
  * Header line with file title; optional tags/path.

**Commands mode**

* If input starts with `>`: results list shows **commands** from `app.commands.listCommands()`.
* Fuzzy search by command name/id; Enter executes; **⌘Enter** tries “open in split” if the command supports target leaf (otherwise ignored).
* Removing the `>` returns to file mode with previous query preserved.

---

## 3) Keyboard (all customizable in Hotkeys)

* **Open modal**: default **⌘N**.
* **Move**: ↓/↑ and **⌘J/⌘K** (or Ctrl+J/K on Win/Linux).
* **Open**: **Enter** (on match).
* **Create**: **Enter** if no match; **⇧Enter** always create (force).
* **Open in split**: **⌘Enter** (if applicable).
* **Focus preview**: **Tab** → preview; **Esc** returns to input; **Esc** again closes.
* **Cycle fragments**: **⌥← / ⌥→**.
* **Toggle inline snippet** (optional command): unassigned.

---

## 4) Search design

### 4.1 Engine choice

* **v1 default**: a **portable, bundled index** using a MiniSearch-style inverted index (either vendored lib or small wrapper).

  * Works on macOS & iOS; no ripgrep/binaries.
  * Field boosts + fuzzy/prefix built-in → **less code**, **faster to ship**.
* **Provider interface** (future-proof):

  ```ts
  interface SearchProvider {
    indexAll(files: TFile[]): Promise<void>;
    upsert(file: TFile, content: string): Promise<void>;
    remove(file: TFile): Promise<void>;
    query(q: ParsedQuery, limit: number): Promise<SearchResult[]>;
  }
  ```

  * **BuiltInProvider** ships in v1.
  * **OmnisearchProvider** can be added later (optional dependency) without changing UX.

### 4.2 Indexed fields

* `title` (basename)
* `path` (folder path tokens)
* `headings` (H1–H6 text)
* `symbols` (links `[[target]]`, block refs `^id`, fenced code identifiers)
* `tags` (frontmatter + inline `#tag`)
* `body` (markdown text, excluding code blocks optionally—toggle in settings)

### 4.3 Query language

* **Fuzzy** by default with **prefix** matching.
* **Filters / prefixes**:

  * `#` → search **headings only**.
  * `@` → search **symbols** (links/block ids/code labels).
  * `tag:foo` or `#foo` → tag filter.
  * `path:proj/x` / `in:Inbox` → folder filter.
  * `"exact phrase"` → phrase match in body/title.
  * `/regex/` (with optional `i`) → regex body match (applied to a prefiltered candidate set).
  * `-term` exclude; `OR` keyword; default AND.
* **Edge cases**:

  * Empty query → show recent notes by `mtime desc`.
  * Regex: apply to top **K** fuzzy candidates (configurable, default K=300) for perf.

### 4.4 Scoring

* Weighted sum:

  ```
  score = w_title*fuzzy(title)
        + w_headings*fuzzy(headings)
        + w_path*fuzzy(path)
        + w_tags*fuzzy(tags)
        + w_symbols*fuzzy(symbols)
        + w_body*fuzzy(body)
        + recencyBonus(mtime)
  ```
* Defaults: `w_title=4, w_headings=2, w_path=1.5, w_tags=1.5, w_symbols=1.5, w_body=1, recencyBonus≤0.5`.
* Diacritic folding on by default; case-insensitive.

---

## 5) Create semantics

* **Enter** creates `Query.md` when there are no results.
* **⇧Enter** always creates, even with matches.
* **Path support**: `folderOne/folderTwo/My Note` → ensure folders exist.
* **Create location** (setting): vault root | same as active note | fixed folder.

---

## 6) Preview & highlighting

### 6.1 Inline snippet (per row)

* Pick first/best match position across tokens → extract a **\~120 char** fragment.
* HTML-escape, then wrap matched tokens with `<mark>` (single combined regex, word-boundary-aware).
* Collapse whitespace/newlines; prepend/append ellipses as needed.

### 6.2 Bottom preview

* Generate up to **N fragments** (default 3, max 5) across the note (skip code blocks if setting enabled).
* Each fragment \~120 chars; merge overlapping hits; **<mark>** each token.
* Show chevrons ◀ ▶ and support **⌥←/→** to cycle additional fragments.
* Header: file title; optional chips for tags/path.

---

## 7) Performance targets

* **Desktop**:

  * 10–30k notes: first usable result list < **200 ms** after first keystroke for typical queries.
  * Startup: titles/path indexed immediately; bodies indexed lazily (chunked or via Web Worker).
* **Mobile**:

  * Smooth typing; chunked indexing on the main thread; suspend/resume friendly.
* **Memory**:

  * Body text stored as lowercased copy; consider optional size cap per doc (e.g., don’t index >2 MB files).
* **Persistence**:

  * Cache `{fileId, mtime, size, tokens?}` in plugin data to skip re-tokenizing unchanged files.

---

## 8) Settings (v1)

**General**

* Open hotkey (default **⌘N**).
* Create location (root / same as active / fixed folder).
* Include code blocks in body index (off by default).
* Max results shown (default 100).

**Search**

* Backend: Built-in | Auto (Built-in; Omnisearch when available) | Omnisearch (if installed).
* Weights sliders for title/headings/path/tags/symbols/body/recency.
* Diacritic folding (on/off).
* Regex candidate cap (K).

**Preview**

* Inline snippet (on/off).
* Fragment length (60–240).
* Max fragments (1–10).
* Show frontmatter (off), show tags (on), show path (on).
* Highlight color (uses theme var; optional custom CSS var).

**Commands mode**

* Enable `>` prefix (on).
* Show IDs alongside names (off).
* “Open in split” modifier (⌘ by default).

**Hotkeys**

* Rebind every modal action (move, open, force create, cycle fragments, focus preview, toggle inline snippet).

---

## 9) Architecture

**Packages/stack**

* TypeScript + esbuild/tsup bundling to single JS.
* No Node/Rust/runtime deps; OK to vendor a small search lib.

**Modules**

* `plugin.ts`: lifecycle, settings, register commands/hotkeys.
* `modal.tsx` (or `modal.ts`): input + results + preview layout, keyboard handling.
* `search/`:

  * `provider.ts` (interface)
  * `builtInProvider.ts` (MiniSearch-style index)
  * `queryParser.ts` (prefixes, quotes, OR/NOT, regex)
  * `scorer.ts` (weights & recency)
* `preview/`:

  * `snippet.ts` (inline & fragment extraction)
  * `highlight.ts` (escape + `<mark>`)
* `indexer/`:

  * `vaultIndex.ts` (read files; extract headings/tags/symbols; track mtimes; incremental updates)
  * `worker.ts` (optional; desktop only)
* `ui/`: small helpers; date formatting; virtualized list (optional).

**Data model (per doc)**

```ts
type Doc = {
  id: string;        // vault-unique path
  title: string;     // basename
  path: string[];    // folder tokens
  tags: string[];
  headings: string[];
  symbols: string[]; // [[links]], ^blocks, code labels
  body: string;      // lowercased (possibly truncated per setting)
  mtime: number;
  size: number;
};
```

---

## 10) TDD plan

**Unit (Vitest)**

* `queryParser.test.ts`: `>cmd`, `#heading`, `@symbol`, `tag:foo`, `path:x`, quotes, `/regex/i`, `OR`, `-exclude`.
* `scorer.test.ts`: field weights & recency bonus.
* `snippet.test.ts`: fragment selection, ellipses, merge overlaps, HTML escape, highlight.
* `vaultIndex.test.ts`: add/modify/delete/rename; headings/tags/symbol extraction.
* `builtInProvider.test.ts`: indexAll, upsert, remove, query top-k with deterministic results.

**Integration (JSDOM)**

* `modal.behavior.test.ts`:

  * Enter opens/creates; ⇧Enter force-creates.
  * `>` commands list; Enter executes stubbed command.
  * ⌘J/⌘K navigate; Tab ↔ Esc focus behavior; ⌥←/→ fragment cycling.
  * Zero-result state.

**(Optional) E2E**

* Playwright scenario on a demo vault (local file server) to verify DOM structure & keyboard flows.

---

## 11) Compatibility & accessibility

* **Mobile (iOS)**: avoid long blocking tasks; chunk async work; don’t rely on Node APIs; test on large but realistic vaults.
* **A11y**: roles for listbox/options; visible focus; screen-reader labels for chevrons; ensure `<mark>` color contrasts with theme.

---

## 12) Error handling & safety

* Indexing failures logged once per file with a toast only if user-initiated (no toast storms).
* On invalid regex, show inline error chip and ignore regex filter.
* On create path collision, open existing file instead of throwing.

---

## 13) Licensing & repo

* **License**: MIT (plugin).
* Name: `obsidian-nv-switcher`.
* CI: lint, typecheck, test, build, release zip.
* Deliverables: `manifest.json`, `main.js` (bundled), `styles.css`, `README.md` with GIFs, settings description.

---

## 14) Milestones

* **M1 (Core, 3–5 days of work):**
  Modal + BuiltInProvider (title/path/body), Enter-to-create/open, ⌘J/⌘K, inline snippet, bottom preview (1 fragment), `>` commands mode, unit tests for parser/snippets/scorer, basic integration tests.

* **M2 (Depth):**
  Headings/tags/symbols indexing, preview multi-fragments + cycling, weights & settings UI, regex (prefiltered), diacritic folding, recent-by-default, hotkey customization.

* **M3 (Perf & polish):**
  Lazy body index, incremental updates, persistence of mtimes, (optional) Web Worker on desktop, virtualized list, accessibility pass, README & release.

---

## 15) Acceptance criteria (v1)

1. **macOS & iOS**: plugin loads; modal opens with **⌘N**; no external binaries.
2. **Search**: fuzzy across title/path/headings/tags/symbols/body; regex and phrase work; diacritics handled.
3. **Create/Open**: Enter creates when no results; ⇧Enter force-creates; supports `folder/Note`.
4. **Commands**: typing `>` flips to commands; Enter executes.
5. **Preview**: list inline snippet + bottom multi-fragment preview with `<mark>` highlights; cycling works.
6. **Keys**: ⌘J/⌘K (or Ctrl) move; Tab/Esc focus; ⌥←/→ cycles; ⌘Enter opens in split (if applicable).
7. **Perf**: interactive search within target budgets for a medium vault; incremental updates reflect edits without reload.
8. **Customization**: hotkeys and settings as specified.

