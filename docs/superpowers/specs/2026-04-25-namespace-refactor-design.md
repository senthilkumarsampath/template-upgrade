# Design: Namespace Refactor — upgrade-templates-v2.jsx

**Date:** 2026-04-25  
**Status:** Approved  
**Output file:** `upgrade-templates-v2.jsx` (new file — original untouched)

---

## Goal

Refactor the flat collection of global functions in `upgrade-templates.jsx` into
ES3-compatible namespace objects, fix two real bugs, and eliminate all duplicate logic.
No behaviour changes — every InDesign API call stays identical.

---

## Constraints

- **ExtendScript ES3** — `var` only, no `let`/`const`, no arrow functions, no `class`
- `#target indesign` directive at top
- All InDesign API calls unchanged
- `NEVER_INTERACT` guard + `finally` restore must remain in `upgradeTemplate`
- Per-template try/catch isolation in the batch loop must remain

---

## Namespace Structure

Six namespace objects replace all helper globals. `main()` and `upgradeTemplate()` remain
top-level orchestrators.

### `Logger`

Owns the log file lifecycle.

| Method | Replaces |
|--------|----------|
| `Logger.open(outFolder, srcFolder, total)` | `openLog` |
| `Logger.write(f, status, name, msg)` | `writeLog` |
| `Logger.close(f, ok, fail)` | `closeLog` |

### `UI`

Owns the progress palette lifecycle. Adds `_refresh(ui)` private helper.

| Method | Replaces |
|--------|----------|
| `UI.build(total)` | `buildProgressUI` |
| `UI.setFile(ui, index, name, total)` | `setUIFile` |
| `UI.setStep(ui, msg, isError)` | `setUIStep` — calls `UI._refresh` |
| `UI.setProgress(ui, done, total, ok, fail)` | `setUIProgress` — calls `UI._refresh` |
| `UI._refresh(ui)` | NEW — extracts the `win.update() + $.sleep(1)` duplication |

### `DocSettings`

Owns page geometry reads and writes.

| Method | Replaces |
|--------|----------|
| `DocSettings.read(doc)` | `readSettings` |
| `DocSettings.apply(doc, s)` | `applySettings` |
| `DocSettings.applyUnits(doc)` | `applyMeasurementUnits` |

### `Styles`

Owns style and swatch import.

| Method | Replaces |
|--------|----------|
| `Styles.importAll(doc, srcFile)` | `importAllStyles` |
| `Styles.importSwatches(doc, srcFile)` | `safeImportSwatches` |

### `MasterSpreads`

Owns all master-spread operations. Merges the two identical find-by-prefix functions.

| Method | Replaces |
|--------|----------|
| `MasterSpreads.find(doc, prefix, baseName)` | `findMasterSpread` + `findSourceMaster` (merged) |
| `MasterSpreads.copy(srcDoc, newDoc)` | `copyMasterSpreads` |
| `MasterSpreads.applyMargins(srcDoc, newDoc)` | `applyMasterPageMargins` |
| `MasterSpreads._copyPageMargins(srcPage, tgtPage)` | `copyPageMargins` |

### `ContentSync`

Owns all per-document content migration.

| Method | Replaces |
|--------|----------|
| `ContentSync.syncLayers(srcDoc, newDoc)` | `syncLayers` |
| `ContentSync.syncTextVariables(srcDoc, newDoc)` | `syncTextVariables` |
| `ContentSync.syncXmlTags(srcDoc, newDoc)` | `syncXmlTags` |
| `ContentSync.copyDocumentPageContent(srcDoc, newDoc)` | `copyDocumentPageContent` |
| `ContentSync.copyFootnoteOptions(srcDoc, newDoc)` | `copyFootnoteOptions` |

---

## Bugs Fixed

### 1. Duplicate find-master functions

`findMasterSpread(doc, prefix, baseName)` and `findSourceMaster(srcDoc, prefix, baseName)`
are byte-for-byte identical. Both replaced by `MasterSpreads.find(doc, prefix, baseName)`.
All callers updated.

### 2. `var i` redeclared three times in `copyFootnoteOptions`

ES3 hoists all `var` declarations to function scope, so three `var i` declarations in three
separate `for` loops are actually one shared variable. This is not a runtime error today but
is a correctness risk if loop bodies are ever reordered. Fix: rename loop variables to `si`
(simpleProps), `swi` (swatchProps), `sti` (strokeProps).

### 3. Duplicate `openDoc` pattern

The `OPEN_ORIGINAL_ONLY` try/catch + ternary open call appears twice in `upgradeTemplate`.
Extracted to a module-level helper:

```js
function openDoc(srcFile) { ... }
```

### 4. Duplicate `win.update() + $.sleep(1)` in UI

`setUIStep` and `setUIProgress` both call the same two-line repaint sequence.
Extracted to `UI._refresh(ui)`.

### 5. Two-pass page-item traversal in `copyDocumentPageContent`

Phase 1 and Phase 2 both iterate `srcDoc.pages[p].pageItems` in separate outer loops.
Collapsed to one outer loop per page: Phase 1 (duplicate + map) runs item-by-item,
threading metadata is collected in a deferred list, then Phase 2 re-threads from the
deferred list — same correctness, one traversal.

---

## File Layout

```
upgrade-templates.jsx        — original, untouched
upgrade-templates-v2.jsx     — refactored output
```

---

## Out of Scope

- No logic changes to `createDocumentPages` hardcoded master names (A/CH_OP, B/CH_BODY)
- No changes to the batch loop, progress reporting cadence, or log format
- No changes to how styles, swatches, or XML tags are imported
