# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

Batch-upgrades legacy InDesign CS3/CS4 templates to CC 2026. The core problem: simply opening and re-saving old templates in CC carries forward two known corruptions — hyphenation settings not reflecting in new documents, and Span Across Columns causing InDesign to quit. The fix is to build a fresh CC 2026 document and import all assets programmatically.

## Single deliverable

```
upgrade-templates.jsx   — the entire script, run directly from InDesign's Scripts panel
```

Output at runtime: an `upgraded/` folder placed alongside the selected source folder, containing `.indt` files and `upgrade-log.txt`.

## How to run

1. Open InDesign CC 2026
2. Window > Utilities > Scripts
3. Navigate to `upgrade-templates.jsx` → double-click
4. Select the source folder when prompted
5. Script processes all `.indt`/`.indd` files recursively

## What the script migrates

| Asset | API used |
|---|---|
| Paragraph, character, table, object styles | `doc.importStyles(StyleType.*, srcFile, GlobalClashResolutionStrategy.LOAD_ALL_WITH_OVERWRITE)` |
| Color swatches | `doc.importSwatches(srcFile)` |
| Layers | Iterate `srcDoc.layers`, recreate in reverse order |
| Text variables | Iterate `srcDoc.textVariables`, switch on `variableType` |
| XML tags | Iterate `srcDoc.xmlTags`, recreate and re-apply via `item.markup(tag)` |
| Master spreads (full content) | `pageItem.duplicate(targetPage)` across documents |
| Page size, margins, bleed, slug | `documentPreferences` + `marginPreferences` |

## Language and constraints

- **ExtendScript (ES3)** — no `let`/`const`, no arrow functions, no `Array.forEach`
- Target directive: `#target indesign` at top of file
- InDesign suppresses all dialogs during batch via `UserInteractionLevels.NEVER_INTERACT`; always restore the previous level in a `finally` block
- Each template is wrapped in `try/catch` so failures are logged and the batch continues

## Known edge cases to watch

- `saveACopy(file, true)` — `true` is the stationery flag for template format; if rejected, fall back to `doc.save(file, true)`
- `VariableTypes` enum names differ slightly between InDesign versions (e.g. `MATCH_PARAGRAPH_STYLE_TYPE` vs `RUNNING_HEADER_PARAGRAPH_STYLE_TYPE`)
- Cross-document `duplicate()` skips linked graphics silently — errors appear in `upgrade-log.txt`
- Master spreads beyond "A-Master" are created via `masterSpreads.add()` and then `baseName` is set
