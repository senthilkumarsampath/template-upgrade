# InDesign Template Upgrade Script

`upgrade-templates.jsx` — ExtendScript batch utility that upgrades legacy Adobe InDesign CS3/CS4 templates to CC 2026 format.

---

## Problem

Legacy `.indt` / `.indd` templates created in CS3 or CS4 carry two known corruptions when simply opened and re-saved in modern InDesign:

1. **Hyphenation settings** in paragraph styles do not reflect when new documents are created from the template.
2. **Span Across Columns** text frame attribute causes InDesign to quit — on both desktop and server — whenever one of these templates is opened.

Simply saving the file in a newer version does not fix either issue because the corruption is preserved in the binary structure of the document.

---

## Solution

Rather than opening and re-saving, the script builds a **brand-new CC 2026 document** and programmatically migrates every asset from the source. Because InDesign's import APIs re-serialise all data through the current engine, both corruptions are eliminated in the output.

---

## How to Run

1. Open **Adobe InDesign CC 2026**.
2. Go to **Window › Utilities › Scripts**.
3. Navigate to `upgrade-templates.jsx` and double-click it.
4. A folder picker appears — select the folder that contains your `.indt` or `.indd` files. Both formats are supported.
5. The script processes all templates (recursively) and saves the results as `.indt`.

**Output** is written to an `upgraded/` folder placed **alongside** the selected source folder:

```
/path/to/your/folder/
  source-template.indt
upgraded/
  source-template.indt   ← upgraded copy
  upgrade-log.txt        ← per-file result log
```

---

## Architecture

The script is a single self-contained ExtendScript (ES3) file.  
No external dependencies. No `let`/`const`, no arrow functions — compatible with InDesign's legacy SpiderMonkey engine.

### Execution flow

```
main()
 ├── collectFiles()          — build file list recursively
 ├── buildProgressUI()       — show floating palette
 └── for each file:
      └── upgradeTemplate()
           ├── Phase A  — open source → readSettings() → close
           ├── Phase B  — create newDoc → applySettings() → applyMeasurementUnits()
           ├── Phase C  — importAllStyles() + safeImportSwatches()   (file closed)
           ├── Phase D  — reopen source
           │    ├── syncLayers()
           │    ├── syncTextVariables()
           │    ├── syncXmlTags()
           │    ├── copyMasterSpreads()
           │    ├── applyMasterPageMargins()
           │    ├── copyFootnoteOptions()
           │    ├── createDocumentPages()
           │    └── copyDocumentPageContent()
           └── Phase E  — close source → saveACopy() as .indt
```

> **Why two opens?**  
> `doc.importStyles()` cannot read from a file InDesign already holds open as a document. The source is closed before all style and swatch imports, then reopened for content and document-level operations.

---

## Modules

### 1. Entry & Batch — `main()`, `collectFiles()`

**Purpose:** Orchestrates the entire batch run.

| Method | Description |
|--------|-------------|
| `main()` | Prompts for a source folder, collects files, creates the `upgraded/` output folder, opens the progress UI, iterates every template, and shows a final summary alert. Wraps the loop in a `finally` block to restore `UserInteractionLevels` even if the script crashes mid-run. |
| `collectFiles(folder)` | Recursively walks a folder tree and returns an array of every `.indt` and `.indd` file found. Subdirectories are traversed automatically. |

---

### 2. Progress UI — `buildProgressUI()`, `setUIFile()`, `setUIStep()`, `setUIProgress()`

**Purpose:** A floating ScriptUI palette that gives real-time feedback during the batch run.

| Method | Description |
|--------|-------------|
| `buildProgressUI(total)` | Builds and returns a `Window("palette")` containing a title, a horizontal divider, the current filename (bold), a step status line (italic), a progress bar, and a counter row showing "X of Y templates" with live ✓ / ✗ tallies. |
| `setUIFile(ui, index, name, total)` | Called once per template at the start of each iteration. Updates the filename label, counter, and progress bar position. |
| `setUIStep(ui, msg, isError)` | Updates the italic step-status line and calls `win.update()` followed by `$.sleep(1)`. The 1 ms sleep yields to InDesign's event loop so the palette repaints during synchronous execution — without it, the window appears frozen. |
| `setUIProgress(ui, done, total, ok, fail)` | Called after each template completes. Advances the progress bar and updates the ✓ / ✗ counters. |

---

### 3. Per-Template Upgrade — `upgradeTemplate()`

**Purpose:** Coordinates all migration steps for a single source file.

Key behaviours:

- Sets `app.scriptPreferences.measurementUnit = MeasurementUnits.POINTS` at the start and restores the previous value in a `finally` block, ensuring all numeric reads and writes during the run are in points regardless of the document's own unit setting.
- Opens the source **twice**: once briefly to read layout settings, and again later for content operations. This two-open pattern is required because `importStyles` and `loadSwatches` cannot read a file that InDesign holds open.
- Wraps all work in `try/finally` so both the source and new document are always closed, even on error.
- Saves the result using `saveACopy(outputFile, true)` — the `true` flag produces an InDesign template (`.indt`) rather than a regular document.

---

### 4. Document Settings — `readSettings()`, `applySettings()`

**Purpose:** Transfers page geometry from source to new document.

| Method | What is copied |
|--------|----------------|
| `readSettings(doc)` | Reads `documentPreferences`: page width, page height, facing-pages flag, all four bleed offsets (top, bottom, inside/left, outside/right), and all four slug offsets. Returns a plain settings object. |
| `applySettings(doc, s)` | Writes the settings object to `newDoc.documentPreferences`. **Margins are intentionally excluded** — they travel with the master spreads via `duplicate()` and are then applied explicitly per-page by `applyMasterPageMargins()`. |

> All values are in **points** because `measurementUnit` is set to POINTS before this code runs.

---

### 5. Measurement Units — `applyMeasurementUnits()`

**Purpose:** Sets every ruler and measurement field in the new document to points.

Applies `MeasurementUnits.POINTS` to all six properties on `doc.viewPreferences`:

| Property | Controls |
|----------|----------|
| `horizontalMeasurementUnits` | Horizontal ruler, X position, width fields |
| `verticalMeasurementUnits` | Vertical ruler, Y position, height fields |
| `typographicMeasurementUnits` | Leading, paragraph spacing |
| `textSizeMeasurementUnits` | Font size display |
| `strokeMeasurementUnits` | Stroke weight fields |
| `printDialogMeasurementUnits` | Print dialog offset fields |

Uses a numeric fallback (`2054188905`) in case the `MeasurementUnits` enum is inaccessible.

---

### 6. Styles & Swatches — `importAllStyles()`, `safeImportSwatches()`

**Purpose:** Imports all style categories and colour swatches from the closed source file.

| Method | Details |
|--------|---------|
| `importAllStyles(doc, srcFile)` | Calls `doc.importStyles(format, srcFile, strategy)` once per style category. The first parameter is `ImportFormat` — **not** `StyleType`, which is a different enum used for style objects. Uses `GlobalClashResolutionStrategy.LOAD_ALL_WITH_OVERWRITE` so source styles replace any CC defaults. Each format is accessed via bracket notation (`ImportFormat["PARAGRAPH_STYLES_FORMAT"]`) with a verified numeric fallback from the CC 2026 scripting reference. |
| `safeImportSwatches(doc, srcFile)` | Calls `doc.loadSwatches(srcFile)`. Note: `importSwatches()` does not exist in the InDesign API — the correct method is `loadSwatches()`. |

**Style categories imported:**

| Format constant | Covers |
|-----------------|--------|
| `PARAGRAPH_STYLES_FORMAT` | Paragraph styles and groups |
| `CHARACTER_STYLES_FORMAT` | Character styles |
| `TABLE_STYLES_FORMAT` | Table styles |
| `CELL_STYLES_FORMAT` | Cell styles |
| `OBJECT_STYLES_FORMAT` | Object styles |
| `TEXT_STYLES_FORMAT` | All text styles combined |
| `TOC_STYLES_FORMAT` | Table of contents styles |

> The source file must be **closed** when these calls are made, otherwise InDesign refuses to read from it.

---

### 7. Layers — `syncLayers()`

**Purpose:** Replicates the source document's layer stack in the new document, preserving name, visibility, lock state, and panel colour.

Iterates source layers in **reverse order** (bottom to top) so `layers.add()` builds the correct stacking sequence.

- If a layer with the same name does **not** exist in the new document, it is created with all four properties.
- If a layer already exists (e.g. the default "Layer 1" that every new document starts with), its `visible`, `locked`, and `layerColor` properties are updated to match the source.

---

### 8. Text Variables — `syncTextVariables()`

**Purpose:** Recreates all text variables defined in the source document.

Each variable type requires different properties, handled via a `switch` on `sv.variableType`:

| Variable type | Extra properties copied |
|---------------|------------------------|
| `CUSTOM_TEXT_TYPE` | `variableValue` |
| `FILE_NAME_TYPE` | `includeExtension`, `includePath` |
| `CREATION_DATE_TYPE`, `MODIFICATION_DATE_TYPE`, `OUTPUT_DATE_TYPE` | `dateFormat` |
| `MATCH_PARAGRAPH_STYLE_TYPE`, `MATCH_CHARACTER_STYLE_TYPE` | `textBefore`, `textAfter`, `includeFirstOnPage` |
| `CHAPTER_NUMBER_TYPE` | `format` |

Variables that already exist in the new document (by name) are skipped.

---

### 9. XML Tags — `syncXmlTags()`

**Purpose:** Recreates all XML structure tags defined in the source.

For each tag in `srcDoc.xmlTags`, creates a matching tag in `newDoc` with the same `name` and `color`. Tags that already exist (by name) are skipped.

---

### 10. Master Spreads — `copyMasterSpreads()`, `applyMasterPageMargins()`

**Purpose:** Loads all source master spreads (parent pages) into the new document as complete units, then applies the correct margins to each master page.

#### `copyMasterSpreads(srcDoc, newDoc)`

Implements the equivalent of **Pages panel › Load Parent Pages**:

1. Detaches all document pages from their current masters (`appliedMaster = NothingEnum.NOTHING`) so the default blank masters are unreferenced.
2. Removes all existing masters from the new document.
3. Calls `srcDoc.masterSpreads[i].duplicate(LocationOptions.AT_END, newDoc)` for each source master — this transfers the entire spread as a unit including text frames, image frames, guides, and page geometry, without manual item-by-item copying.

#### `applyMasterPageMargins(srcDoc, newDoc)`

After `duplicate()`, margin guides may revert to document defaults. This function:

1. Iterates every master spread in the new document.
2. Finds its counterpart in the source by matching `namePrefix` and `baseName` via `findSourceMaster()`.
3. Copies `top`, `bottom`, `left`, `right`, `columnCount`, and `columnGutter` from `srcPage.marginPreferences` to `tgtPage.marginPreferences` for each page in the spread, using `copyPageMargins()`.

---

### 11. Document Pages — `createDocumentPages()`, `findMasterSpread()`

**Purpose:** Sets up exactly 3 document pages and assigns the correct parent pages.

After master spreads are loaded:

1. Trims or extends the page count to exactly **3**.
2. Finds `A-CH_OP` (opening chapter master) using `findMasterSpread(doc, "A", "CH_OP")`.
3. Finds `B-CH_BODY` (body chapter master) using `findMasterSpread(doc, "B", "CH_BODY")`.
4. Assigns:
   - Page 1 → `A-CH_OP`
   - Pages 2–3 → `B-CH_BODY`

If a named master does not exist in the template being processed, the assignment is silently skipped so the batch does not fail.

---

### 12. Footnote Options — `copyFootnoteOptions()`

**Purpose:** Copies all document footnote settings — both the Formatting and Layout tabs — from source to new document.

Handles three categories of properties:

| Category | Properties | Method |
|----------|-----------|--------|
| **Simple values** (33 properties) | Numbers, booleans, strings, and enum values including `footnoteNumberingStyle`, `markerPositioning`, `restartNumbering`, `showPrefixSuffix`, `spaceBetween`, `spacer`, `eosPlacement`, `noSplitting`, `enableStraddling`, baseline settings, all rule on/off/width/weight/offset/tint/overprint properties for both the first-column rule and the continuing-column rule | Assigned directly in a loop |
| **Style references** | `footnoteTextStyle` (ParagraphStyle), `footnoteMarkerStyle` (CharacterStyle) | Looked up by name in `newDoc`'s already-imported style collections |
| **Swatch & stroke references** | `ruleColor`, `ruleGapColor`, `continuingRuleColor`, `continuingRuleGapColor`, `ruleType`, `continuingRuleType` | Looked up by name in `newDoc.swatches` and `newDoc.strokeStyles` |

This function runs **after** styles and swatches are imported so all name lookups resolve correctly.

---

### 13. Page Content & Threading — `copyDocumentPageContent()`

**Purpose:** Copies all top-level page items from source document pages to the corresponding pages in the new document, then restores text frame threading.

Operates in two phases:

**Phase 1 — Duplicate**  
Iterates source pages up to `min(srcDoc.pages.length, newDoc.pages.length)` (capped at 3). Each top-level item on `srcDoc.pages[p]` is duplicated to `newDoc.pages[p]` using `srcItem.duplicate(targetPage)`. A `frameMap` dictionary records `sourceItemId → duplicateItem` for every successfully duplicated item.

**Phase 2 — Re-thread**  
Re-iterates the same pages. For each item, it attempts to read `nextTextFrame` — this throws on non-text-frame objects (image frames, groups, etc.) which are skipped via `catch`. When a source text frame had a valid `nextTextFrame`, both the current frame and its next frame are looked up in `frameMap` and `tgtFrame.nextTextFrame = tgtNext` re-establishes the thread link. This correctly restores threading chains that span multiple pages.

---

### 14. Logging — `openLog()`, `writeLog()`, `closeLog()`

**Purpose:** Writes a plain-text audit trail to `upgrade-log.txt` in the output folder.

| Method | Description |
|--------|-------------|
| `openLog(outFolder, srcFolder, total)` | Opens the log file for writing and writes the header: date, source path, output path, and total file count. |
| `writeLog(f, status, name, msg)` | Appends one line per template: `[SUCCESS] filename.indt` or `[ERROR] filename.indt \| error message`. |
| `closeLog(f, ok, fail)` | Writes the final summary line (`X succeeded, Y failed`) and closes the file handle. |

---

## What Gets Migrated

| Asset | API used |
|-------|----------|
| Paragraph styles | `doc.importStyles(ImportFormat.PARAGRAPH_STYLES_FORMAT, file, strategy)` |
| Character styles | `doc.importStyles(ImportFormat.CHARACTER_STYLES_FORMAT, ...)` |
| Table styles | `doc.importStyles(ImportFormat.TABLE_STYLES_FORMAT, ...)` |
| Cell styles | `doc.importStyles(ImportFormat.CELL_STYLES_FORMAT, ...)` |
| Object styles | `doc.importStyles(ImportFormat.OBJECT_STYLES_FORMAT, ...)` |
| TOC styles | `doc.importStyles(ImportFormat.TOC_STYLES_FORMAT, ...)` |
| Colour swatches | `doc.loadSwatches(file)` |
| Layers (name, visibility, lock, colour) | `doc.layers.add()` / property assignment |
| Text variables | `doc.textVariables.add()` with type-specific properties |
| XML tags | `doc.xmlTags.add()` |
| Master spreads (full content) | `masterSpread.duplicate(LocationOptions.AT_END, targetDoc)` |
| Master page margins | `page.marginPreferences` read/write |
| Document footnote options | `doc.footnoteOptions` — all 46 properties |
| Page dimensions, bleed, slug | `doc.documentPreferences` |
| Document pages + parent page assignments | `doc.pages.add()` + `page.appliedMaster` |
| Page frame content | `pageItem.duplicate(targetPage)` |
| Text frame threading | `textFrame.nextTextFrame` |
| Ruler & measurement units | `doc.viewPreferences.*MeasurementUnits` |

---

## Output Files

| File | Description |
|------|-------------|
| `upgraded/<name>.indt` | Upgraded InDesign CC 2026 template |
| `upgraded/upgrade-log.txt` | Run log with per-file SUCCESS / ERROR status |

---

## Supported Source Formats

Both `.indt` (InDesign template) and `.indd` (InDesign document) files are processed identically. The `collectFiles()` function matches both extensions (case-insensitive). Output is always saved as `.indt` regardless of the source extension.

When opening `.indt` files, the script passes `OpenOptions.OPEN_ORIGINAL_ONLY` so InDesign opens the template file itself rather than creating a new untitled document from it. A runtime fallback covers InDesign versions where this enum is unavailable.

---

## Cross-Platform Path Safety

The script runs on both **macOS** and **Windows** without modification.

All path construction uses ExtendScript `Folder` and `File` objects directly rather than `.fsName` strings:

```javascript
// Safe on both platforms — ExtendScript stringifies Folder/File as a POSIX path
var outFolder = new Folder(srcFolder.parent + "/" + UPGRADED_FOLDER);
var outputFile = new File(outFolder + "/" + baseName + ".indt");
```

- On macOS, `Folder` and `File` objects stringify as POSIX paths (`/Volumes/...`).
- On Windows, ExtendScript internally translates them to UNC/drive paths when the OS call is made — the script author never needs to handle backslashes.
- Using `.fsName` would return OS-native paths (backslashes on Windows), which break when concatenated with `/` separators.

---

## Language Constraints

The script targets InDesign's legacy **ExtendScript (ES3)** engine:

- No `let` or `const` — use `var`
- No arrow functions — use `function` keyword
- No `Array.forEach` — use `for` loops
- No template literals — use string concatenation
- `#target indesign` directive required at the top of the file
- All enum values accessed with named properties and numeric integer fallbacks for version safety
