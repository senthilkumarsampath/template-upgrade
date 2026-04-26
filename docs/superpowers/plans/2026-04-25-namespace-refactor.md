# Namespace Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce `upgrade-templates-v2.jsx` — a namespace-refactored version of the original that fixes 5 real bugs while keeping every InDesign API call identical.

**Architecture:** One new ExtendScript file. All helpers collapse into 6 namespace objects (`Logger`, `UI`, `DocSettings`, `Styles`, `MasterSpreads`, `ContentSync`). Two top-level orchestrators (`upgradeTemplate`, `main`) and three standalone helpers (`openDoc`, `collectFiles`, `createDocumentPages`) remain at module scope. Original file is never touched.

**Tech Stack:** ExtendScript ES3 (InDesign CC 2026 scripting). No `let`/`const`, no arrow functions, no `class`. No test framework — verification is done by running the script in InDesign. Every namespace object is a plain object literal with function properties.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `upgrade-templates-v2.jsx` | **Create** | Complete refactored script |
| `upgrade-templates.jsx` | **Untouched** | Original — leave alone |

---

### Task 1: Scaffold the file

**Files:**
- Create: `upgrade-templates-v2.jsx`

- [ ] **Step 1: Create the file with header, constants, and empty namespace skeletons**

```javascript
// upgrade-templates-v2.jsx
// Namespace-refactored version of upgrade-templates.jsx.
// Fixes: duplicate find-master functions, var-i hoisting, double openDoc, double
// win.update(), two-pass page-item traversal.
// Original file is unchanged — run either from InDesign's Scripts panel.

#target indesign

var UPGRADED_FOLDER = "upgraded";
var LOG_FILE        = "upgrade-log.txt";

// ─── Namespaces (populated below) ────────────────────────────────────────────
var Logger       = {};
var UI           = {};
var DocSettings  = {};
var Styles       = {};
var MasterSpreads = {};
var ContentSync  = {};
```

- [ ] **Step 2: Commit scaffold**

```bash
git add upgrade-templates-v2.jsx
git commit -m "feat: scaffold upgrade-templates-v2.jsx with empty namespaces"
```

---

### Task 2: Logger namespace

**Files:**
- Modify: `upgrade-templates-v2.jsx`

Replaces: `openLog`, `writeLog`, `closeLog`

- [ ] **Step 1: Append Logger implementation after the namespace declarations**

```javascript
// ─── Logger ──────────────────────────────────────────────────────────────────

Logger.open = function(outFolder, srcFolder, total) {
    var f = new File(outFolder + "/" + LOG_FILE);
    f.open("w");
    f.writeln("InDesign Template Upgrade Log");
    f.writeln("Date   : " + new Date().toString());
    f.writeln("Source : " + srcFolder.fsName);
    f.writeln("Output : " + outFolder.fsName);
    f.writeln("Files  : " + total);
    f.writeln("---");
    return f;
};

Logger.write = function(f, status, name, msg) {
    f.writeln("[" + status + "] " + name + (msg ? " | " + msg : ""));
};

Logger.close = function(f, ok, fail) {
    f.writeln("---");
    f.writeln("Result : " + ok + " succeeded, " + fail + " failed");
    f.close();
};
```

- [ ] **Step 2: Commit**

```bash
git add upgrade-templates-v2.jsx
git commit -m "feat: add Logger namespace (open, write, close)"
```

---

### Task 3: UI namespace

**Files:**
- Modify: `upgrade-templates-v2.jsx`

Replaces: `buildProgressUI`, `setUIFile`, `setUIStep`, `setUIProgress`  
Fix: Extract `UI._refresh` — eliminates `win.update() + $.sleep(1)` duplication in `setStep` and `setProgress`.

- [ ] **Step 1: Append UI implementation**

```javascript
// ─── UI ──────────────────────────────────────────────────────────────────────

UI.build = function(total) {
    var win = new Window("palette", "InDesign Template Upgrader", undefined, {closeButton: false});
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 12;
    win.margins = [20, 16, 20, 20];
    win.preferredSize.width = 460;

    var title = win.add("statictext", undefined, "Upgrading Templates to CC 2026");
    title.graphics.font = ScriptUI.newFont("dialog", "BOLD", 13);

    win.add("panel", [0, 0, 460, 1]);

    var fileRow = win.add("group");
    fileRow.orientation = "row";
    fileRow.alignChildren = ["left", "center"];
    fileRow.spacing = 6;
    fileRow.add("statictext", undefined, "File:");
    var fileName = fileRow.add("statictext", [0, 0, 370, 18], "—");
    fileName.graphics.font = ScriptUI.newFont("dialog", "BOLD", 11);

    var stepText = win.add("statictext", [0, 0, 460, 16], "Starting...");
    stepText.graphics.font = ScriptUI.newFont("dialog", "ITALIC", 11);

    var bar = win.add("progressbar", [0, 0, 460, 18], 0, total);

    var counterRow = win.add("group");
    counterRow.orientation = "row";
    counterRow.alignChildren = ["left", "center"];
    counterRow.spacing = 0;

    var counter   = counterRow.add("statictext", undefined, "0 of " + total + " templates");
    var spacer    = counterRow.add("statictext", undefined, "");
    spacer.preferredSize.width = 200;
    var okCount   = counterRow.add("statictext", undefined, "✓ 0");
    okCount.graphics.foregroundColor = okCount.graphics.newPen(
        okCount.graphics.PenType.SOLID_COLOR, [0.1, 0.5, 0.1, 1], 1);
    counterRow.add("statictext", undefined, "  ");
    var failCount = counterRow.add("statictext", undefined, "✗ 0");
    failCount.graphics.foregroundColor = failCount.graphics.newPen(
        failCount.graphics.PenType.SOLID_COLOR, [0.7, 0.1, 0.1, 1], 1);

    win.layout.layout(true);

    return {
        win:       win,
        fileName:  fileName,
        stepText:  stepText,
        bar:       bar,
        counter:   counter,
        okCount:   okCount,
        failCount: failCount,
        total:     total
    };
};

UI._refresh = function(ui) {
    ui.win.update();
    $.sleep(1);
};

UI.setFile = function(ui, index, name, total) {
    ui.fileName.text = name;
    ui.counter.text  = (index + 1) + " of " + total + " templates";
    ui.bar.value     = index;
    UI.setStep(ui, "Opening source document...", false);
};

UI.setStep = function(ui, msg, isError) {
    ui.stepText.text = msg;
    UI._refresh(ui);
};

UI.setProgress = function(ui, done, total, ok, fail) {
    ui.bar.value      = done;
    ui.counter.text   = done + " of " + total + " templates";
    ui.okCount.text   = "✓ " + ok;
    ui.failCount.text = "✗ " + fail;
    UI._refresh(ui);
};
```

- [ ] **Step 2: Commit**

```bash
git add upgrade-templates-v2.jsx
git commit -m "feat: add UI namespace with _refresh helper extracted"
```

---

### Task 4: DocSettings namespace

**Files:**
- Modify: `upgrade-templates-v2.jsx`

Replaces: `readSettings`, `applySettings`, `applyMeasurementUnits`

- [ ] **Step 1: Append DocSettings implementation**

```javascript
// ─── DocSettings ─────────────────────────────────────────────────────────────

DocSettings.read = function(doc) {
    var dp = doc.documentPreferences;
    return {
        pageWidth:    dp.pageWidth,
        pageHeight:   dp.pageHeight,
        facingPages:  dp.facingPages,
        bleedTop:     dp.documentBleedTopOffset,
        bleedBottom:  dp.documentBleedBottomOffset,
        bleedInside:  dp.documentBleedInsideOrLeftOffset,
        bleedOutside: dp.documentBleedOutsideOrRightOffset,
        slugTop:      dp.slugTopOffset,
        slugBottom:   dp.slugBottomOffset,
        slugInside:   dp.slugInsideOrLeftOffset,
        slugOutside:  dp.slugRightOrOutsideOffset
    };
};

DocSettings.apply = function(doc, s) {
    var dp = doc.documentPreferences;
    dp.facingPages = s.facingPages;
    dp.pageWidth   = s.pageWidth;
    dp.pageHeight  = s.pageHeight;

    dp.documentBleedTopOffset            = s.bleedTop;
    dp.documentBleedBottomOffset         = s.bleedBottom;
    dp.documentBleedInsideOrLeftOffset   = s.bleedInside;
    dp.documentBleedOutsideOrRightOffset = s.bleedOutside;

    dp.slugTopOffset            = s.slugTop;
    dp.slugBottomOffset         = s.slugBottom;
    dp.slugInsideOrLeftOffset   = s.slugInside;
    dp.slugRightOrOutsideOffset = s.slugOutside;
};

DocSettings.applyUnits = function(doc) {
    var pt;
    try { pt = MeasurementUnits.POINTS; } catch (e) { pt = 2054188905; }
    var vp = doc.viewPreferences;
    try { vp.horizontalMeasurementUnits  = pt; } catch (e) {}
    try { vp.verticalMeasurementUnits    = pt; } catch (e) {}
    try { vp.typographicMeasurementUnits = pt; } catch (e) {}
    try { vp.textSizeMeasurementUnits    = pt; } catch (e) {}
    try { vp.strokeMeasurementUnits      = pt; } catch (e) {}
    try { vp.printDialogMeasurementUnits = pt; } catch (e) {}
};
```

- [ ] **Step 2: Commit**

```bash
git add upgrade-templates-v2.jsx
git commit -m "feat: add DocSettings namespace (read, apply, applyUnits)"
```

---

### Task 5: Styles namespace

**Files:**
- Modify: `upgrade-templates-v2.jsx`

Replaces: `importAllStyles`, `safeImportSwatches`

- [ ] **Step 1: Append Styles implementation**

```javascript
// ─── Styles ──────────────────────────────────────────────────────────────────

Styles.importAll = function(doc, srcFile) {
    var strat;
    try { strat = GlobalClashResolutionStrategy.LOAD_ALL_WITH_OVERWRITE; }
    catch (e) { strat = 1279350607; }

    var formats = [
        ["PARAGRAPH_STYLES_FORMAT",    1885885300],
        ["CHARACTER_STYLES_FORMAT",    1131565940],
        ["TABLE_STYLES_FORMAT",        1700033396],
        ["CELL_STYLES_FORMAT",         1698919284],
        ["OBJECT_STYLES_FORMAT",       1332368244],
        ["TEXT_STYLES_FORMAT",         1668305780],
        ["TOC_STYLES_FORMAT",          1415795572]
    ];
    for (var i = 0; i < formats.length; i++) {
        var f;
        try { f = ImportFormat[formats[i][0]]; } catch (e) {}
        if (f === undefined || f === null) f = formats[i][1];
        try { doc.importStyles(f, srcFile, strat); } catch (e) {}
    }
};

Styles.importSwatches = function(doc, srcFile) {
    try { doc.loadSwatches(srcFile); } catch (e) {}
};
```

- [ ] **Step 2: Commit**

```bash
git add upgrade-templates-v2.jsx
git commit -m "feat: add Styles namespace (importAll, importSwatches)"
```

---

### Task 6: MasterSpreads namespace

**Files:**
- Modify: `upgrade-templates-v2.jsx`

Replaces: `findMasterSpread`, `findSourceMaster`, `copyMasterSpreads`, `applyMasterPageMargins`, `copyPageMargins`  
Fix: `findMasterSpread` and `findSourceMaster` were identical — merged into `MasterSpreads.find`.

- [ ] **Step 1: Append MasterSpreads implementation**

```javascript
// ─── MasterSpreads ───────────────────────────────────────────────────────────

MasterSpreads.find = function(doc, prefix, baseName) {
    for (var i = 0; i < doc.masterSpreads.length; i++) {
        var m = doc.masterSpreads[i];
        if (m.namePrefix === prefix && m.baseName === baseName) return m;
    }
    return null;
};

MasterSpreads.copy = function(srcDoc, newDoc) {
    var p;
    for (p = 0; p < newDoc.pages.length; p++) {
        try { newDoc.pages[p].appliedMaster = NothingEnum.NOTHING; } catch (e) {}
    }
    for (var m = newDoc.masterSpreads.length - 1; m >= 0; m--) {
        try { newDoc.masterSpreads[m].remove(); } catch (e) {}
    }
    for (var i = 0; i < srcDoc.masterSpreads.length; i++) {
        try {
            srcDoc.masterSpreads[i].duplicate(LocationOptions.AT_END, newDoc);
        } catch (e) {}
    }
};

MasterSpreads.applyMargins = function(srcDoc, newDoc) {
    for (var i = 0; i < newDoc.masterSpreads.length; i++) {
        var tgt = newDoc.masterSpreads[i];
        var src = MasterSpreads.find(srcDoc, tgt.namePrefix, tgt.baseName);
        if (!src) continue;
        for (var p = 0; p < tgt.pages.length && p < src.pages.length; p++) {
            MasterSpreads._copyPageMargins(src.pages[p], tgt.pages[p]);
        }
    }
};

MasterSpreads._copyPageMargins = function(srcPage, tgtPage) {
    try {
        var sm = srcPage.marginPreferences;
        var tm = tgtPage.marginPreferences;
        tm.top          = sm.top;
        tm.bottom       = sm.bottom;
        tm.left         = sm.left;
        tm.right        = sm.right;
        tm.columnCount  = sm.columnCount;
        tm.columnGutter = sm.columnGutter;
    } catch (e) {}
};
```

- [ ] **Step 2: Commit**

```bash
git add upgrade-templates-v2.jsx
git commit -m "feat: add MasterSpreads namespace, merge duplicate find functions"
```

---

### Task 7: ContentSync namespace

**Files:**
- Modify: `upgrade-templates-v2.jsx`

Replaces: `syncLayers`, `syncTextVariables`, `syncXmlTags`, `copyDocumentPageContent`, `copyFootnoteOptions`  
Fix 1: `var i` redeclared 3× in `copyFootnoteOptions` — renamed to `si`, `swi`, `sti`.  
Fix 2: Two separate `pageItems` traversal loops in `copyDocumentPageContent` — collapsed to one pass with a deferred threading list.

- [ ] **Step 1: Append ContentSync implementation**

```javascript
// ─── ContentSync ─────────────────────────────────────────────────────────────

ContentSync.syncLayers = function(srcDoc, newDoc) {
    for (var i = srcDoc.layers.length - 1; i >= 0; i--) {
        var sl = srcDoc.layers[i];
        var tl = newDoc.layers.itemByName(sl.name);
        if (!tl.isValid) {
            newDoc.layers.add({
                name:       sl.name,
                visible:    sl.visible,
                locked:     sl.locked,
                layerColor: sl.layerColor
            });
        } else {
            try { tl.visible    = sl.visible;    } catch (e) {}
            try { tl.locked     = sl.locked;     } catch (e) {}
            try { tl.layerColor = sl.layerColor; } catch (e) {}
        }
    }
};

ContentSync.syncTextVariables = function(srcDoc, newDoc) {
    for (var i = 0; i < srcDoc.textVariables.length; i++) {
        var sv = srcDoc.textVariables[i];
        if (newDoc.textVariables.itemByName(sv.name).isValid) continue;

        try {
            var props = { name: sv.name, variableType: sv.variableType };

            switch (sv.variableType) {
                case VariableTypes.CUSTOM_TEXT_TYPE:
                    props.variableValue = sv.variableValue;
                    break;
                case VariableTypes.FILE_NAME_TYPE:
                    props.includeExtension = sv.includeExtension;
                    props.includePath      = sv.includePath;
                    break;
                case VariableTypes.CREATION_DATE_TYPE:
                case VariableTypes.MODIFICATION_DATE_TYPE:
                case VariableTypes.OUTPUT_DATE_TYPE:
                    props.dateFormat = sv.dateFormat;
                    break;
                case VariableTypes.MATCH_PARAGRAPH_STYLE_TYPE:
                case VariableTypes.MATCH_CHARACTER_STYLE_TYPE:
                    props.textBefore         = sv.textBefore;
                    props.textAfter          = sv.textAfter;
                    props.includeFirstOnPage = sv.includeFirstOnPage;
                    break;
                case VariableTypes.CHAPTER_NUMBER_TYPE:
                    props.format = sv.format;
                    break;
            }

            newDoc.textVariables.add(props);
        } catch (e) {}
    }
};

ContentSync.syncXmlTags = function(srcDoc, newDoc) {
    for (var i = 0; i < srcDoc.xmlTags.length; i++) {
        var st = srcDoc.xmlTags[i];
        try {
            if (!newDoc.xmlTags.itemByName(st.name).isValid) {
                newDoc.xmlTags.add({ name: st.name, color: st.color });
            }
        } catch (e) {}
    }
};

ContentSync.copyDocumentPageContent = function(srcDoc, newDoc) {
    var frameMap    = {};
    var threadPairs = []; // deferred: {srcId, nextId} — collected in first pass
    var pageCount   = Math.min(srcDoc.pages.length, newDoc.pages.length);

    for (var p = 0; p < pageCount; p++) {
        var items = srcDoc.pages[p].pageItems;
        for (var j = 0; j < items.length; j++) {
            var srcItem = items[j];

            // Phase 1: duplicate
            try {
                var dup = srcItem.duplicate(newDoc.pages[p]);
                frameMap[srcItem.id] = dup;
            } catch (e) {}

            // Collect threading intent in the same pass
            var srcNext;
            try { srcNext = srcItem.nextTextFrame; } catch (e) { srcNext = null; }
            if (srcNext && srcNext.isValid) {
                threadPairs.push({ srcId: srcItem.id, nextId: srcNext.id });
            }
        }
    }

    // Phase 2: re-thread from deferred list
    for (var t = 0; t < threadPairs.length; t++) {
        var tgtFrame = frameMap[threadPairs[t].srcId];
        var tgtNext  = frameMap[threadPairs[t].nextId];
        if (!tgtFrame || !tgtNext) continue;
        try { tgtFrame.nextTextFrame = tgtNext; } catch (e) {}
    }
};

ContentSync.copyFootnoteOptions = function(srcDoc, newDoc) {
    var src, tgt;
    try { src = srcDoc.footnoteOptions; } catch (e) { return; }
    try { tgt = newDoc.footnoteOptions;  } catch (e) { return; }

    var simpleProps = [
        "continuingRuleGapOverprint", "continuingRuleGapTint",
        "continuingRuleLeftIndent",   "continuingRuleLineWeight",
        "continuingRuleOffset",       "continuingRuleOn",
        "continuingRuleOverprint",    "continuingRuleTint",
        "continuingRuleWidth",        "enableStraddling",
        "eosPlacement",               "footnoteFirstBaselineOffset",
        "footnoteMinimumFirstBaselineOffset", "footnoteNumberingStyle",
        "markerPositioning",          "noSplitting",
        "prefix",                     "restartNumbering",
        "ruleGapOverprint",           "ruleGapTint",
        "ruleLeftIndent",             "ruleLineWeight",
        "ruleOffset",                 "ruleOn",
        "ruleOverprint",              "ruleTint",
        "ruleWidth",                  "separatorText",
        "showPrefixSuffix",           "spaceBetween",
        "spacer",                     "startAt",
        "suffix"
    ];
    for (var si = 0; si < simpleProps.length; si++) {
        try { tgt[simpleProps[si]] = src[simpleProps[si]]; } catch (e) {}
    }

    try {
        var tsName = src.footnoteTextStyle.name;
        var ts = newDoc.paragraphStyles.itemByName(tsName);
        if (ts.isValid) tgt.footnoteTextStyle = ts;
    } catch (e) {}

    try {
        var msName = src.footnoteMarkerStyle.name;
        var ms = newDoc.characterStyles.itemByName(msName);
        if (ms.isValid) tgt.footnoteMarkerStyle = ms;
    } catch (e) {}

    var swatchProps = [
        "continuingRuleColor", "continuingRuleGapColor",
        "ruleColor",           "ruleGapColor"
    ];
    for (var swi = 0; swi < swatchProps.length; swi++) {
        try {
            var sw = newDoc.swatches.itemByName(src[swatchProps[swi]].name);
            if (sw.isValid) tgt[swatchProps[swi]] = sw;
        } catch (e) {}
    }

    var strokeProps = ["continuingRuleType", "ruleType"];
    for (var sti = 0; sti < strokeProps.length; sti++) {
        try {
            var strokeStyle = newDoc.strokeStyles.itemByName(src[strokeProps[sti]].name);
            if (strokeStyle.isValid) tgt[strokeProps[sti]] = strokeStyle;
        } catch (e) {}
    }
};
```

- [ ] **Step 2: Commit**

```bash
git add upgrade-templates-v2.jsx
git commit -m "feat: add ContentSync namespace, fix var-i hoisting and single-pass page copy"
```

---

### Task 8: Top-level helpers

**Files:**
- Modify: `upgrade-templates-v2.jsx`

Adds: `openDoc` (extracted from duplicated inline block), `collectFiles` (unchanged), `createDocumentPages` (updated to use `MasterSpreads.find`)

- [ ] **Step 1: Append the three helpers**

```javascript
// ─── Helpers ─────────────────────────────────────────────────────────────────

function openDoc(srcFile) {
    var openOrig;
    try { openOrig = OpenOptions.OPEN_ORIGINAL_ONLY; } catch (e) {}
    return openOrig ? app.open(srcFile, false, openOrig) : app.open(srcFile, false);
}

function collectFiles(folder) {
    var result = [];
    var items  = folder.getFiles();
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item instanceof File && /\.(indt|indd)$/i.test(item.name)) {
            result.push(item);
        } else if (item instanceof Folder) {
            var sub = collectFiles(item);
            for (var j = 0; j < sub.length; j++) result.push(sub[j]);
        }
    }
    return result;
}

function createDocumentPages(newDoc) {
    while (newDoc.pages.length > 3) {
        try { newDoc.pages[newDoc.pages.length - 1].remove(); } catch (e) { break; }
    }
    while (newDoc.pages.length < 3) {
        try { newDoc.pages.add(LocationOptions.AT_END); } catch (e) { break; }
    }

    var chop   = MasterSpreads.find(newDoc, "A", "CH_OP");
    var chbody = MasterSpreads.find(newDoc, "B", "CH_BODY");

    if (chop)   try { newDoc.pages[0].appliedMaster = chop;   } catch (e) {}
    if (chbody) try { newDoc.pages[1].appliedMaster = chbody; } catch (e) {}
    if (chbody) try { newDoc.pages[2].appliedMaster = chbody; } catch (e) {}
}
```

- [ ] **Step 2: Commit**

```bash
git add upgrade-templates-v2.jsx
git commit -m "feat: add openDoc helper, collectFiles, createDocumentPages"
```

---

### Task 9: upgradeTemplate and main

**Files:**
- Modify: `upgrade-templates-v2.jsx`

Wires all namespaces together. `upgradeTemplate` uses `openDoc` instead of the inline block (twice). All step/progress calls use `UI.*`, log calls use `Logger.*`.

- [ ] **Step 1: Append upgradeTemplate**

```javascript
// ─── Per-template upgrade ────────────────────────────────────────────────────

function upgradeTemplate(srcFile, outFolder, ui) {
    var srcDoc = null;
    var newDoc = null;

    var prevUnit;
    try { prevUnit = app.scriptPreferences.measurementUnit; } catch (e) {}
    try { app.scriptPreferences.measurementUnit = MeasurementUnits.POINTS; } catch (e) {}

    try {
        UI.setStep(ui, "Opening source document...", false);
        srcDoc = openDoc(srcFile);
        UI.setStep(ui, "Reading page size, bleed and slug...", false);
        var settings = DocSettings.read(srcDoc);
        srcDoc.close(SaveOptions.NO);
        srcDoc = null;

        UI.setStep(ui, "Creating new CC 2026 document...", false);
        newDoc = app.documents.add(false);
        DocSettings.apply(newDoc, settings);
        UI.setStep(ui, "Setting all rulers and units to points...", false);
        DocSettings.applyUnits(newDoc);

        UI.setStep(ui, "Importing paragraph, character, table, cell and object styles...", false);
        Styles.importAll(newDoc, srcFile);
        UI.setStep(ui, "Importing colour swatches...", false);
        Styles.importSwatches(newDoc, srcFile);

        UI.setStep(ui, "Reopening source for content operations...", false);
        srcDoc = openDoc(srcFile);

        UI.setStep(ui, "Syncing layers...", false);
        ContentSync.syncLayers(srcDoc, newDoc);

        UI.setStep(ui, "Recreating text variables...", false);
        ContentSync.syncTextVariables(srcDoc, newDoc);

        UI.setStep(ui, "Syncing XML tags...", false);
        ContentSync.syncXmlTags(srcDoc, newDoc);

        UI.setStep(ui, "Loading master pages (parent pages)...", false);
        MasterSpreads.copy(srcDoc, newDoc);

        UI.setStep(ui, "Applying master page margins...", false);
        MasterSpreads.applyMargins(srcDoc, newDoc);

        UI.setStep(ui, "Copying document footnote options (formatting + layout)...", false);
        ContentSync.copyFootnoteOptions(srcDoc, newDoc);

        UI.setStep(ui, "Creating document pages and assigning parent pages...", false);
        createDocumentPages(newDoc);

        UI.setStep(ui, "Copying page frames...", false);
        ContentSync.copyDocumentPageContent(srcDoc, newDoc);

        srcDoc.close(SaveOptions.NO);
        srcDoc = null;

        UI.setStep(ui, "Saving as .indt template...", false);
        var baseName   = srcFile.name.replace(/\.(indt|indd)$/i, "");
        var outputFile = new File(outFolder + "/" + baseName + ".indt");
        newDoc.saveACopy(outputFile, true);

        UI.setStep(ui, "Done.", false);
    } finally {
        if (newDoc) try { newDoc.close(SaveOptions.NO); } catch (e) {}
        if (srcDoc) try { srcDoc.close(SaveOptions.NO); } catch (e) {}
        if (prevUnit !== undefined) {
            try { app.scriptPreferences.measurementUnit = prevUnit; } catch (e) {}
        }
    }
}
```

- [ ] **Step 2: Append main**

```javascript
// ─── Entry ───────────────────────────────────────────────────────────────────

function main() {
    var srcFolder = Folder.selectDialog("Select folder containing InDesign templates (.indt / .indd)");
    if (!srcFolder) return;

    var files = collectFiles(srcFolder);
    if (files.length === 0) {
        alert("No .indt or .indd files found in:\n" + srcFolder.fsName);
        return;
    }

    var outFolder = new Folder(srcFolder.parent + "/" + UPGRADED_FOLDER);
    if (!outFolder.exists) outFolder.create();

    var log = Logger.open(outFolder, srcFolder, files.length);
    var ui  = UI.build(files.length);
    ui.win.show();

    var prevInteraction = app.scriptPreferences.userInteractionLevel;
    app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;

    var ok = 0, fail = 0;
    try {
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            UI.setFile(ui, i, f.name, files.length);
            try {
                upgradeTemplate(f, outFolder, ui);
                Logger.write(log, "SUCCESS", f.name, "");
                ok++;
            } catch (e) {
                Logger.write(log, "ERROR", f.name, e.message);
                fail++;
                UI.setStep(ui, "Error: " + e.message, true);
            }
            UI.setProgress(ui, i + 1, files.length, ok, fail);
        }
    } finally {
        app.scriptPreferences.userInteractionLevel = prevInteraction;
    }

    Logger.close(log, ok, fail);
    ui.win.close();

    alert("Done!\n\n" +
          ok   + " template" + (ok   !== 1 ? "s" : "") + " upgraded successfully\n" +
          fail + " template" + (fail !== 1 ? "s" : "") + " failed" +
          (fail > 0 ? " — see upgrade-log.txt" : "") +
          "\n\nOutput folder:\n" + outFolder.fsName);
}

main();
```

- [ ] **Step 3: Commit**

```bash
git add upgrade-templates-v2.jsx
git commit -m "feat: add upgradeTemplate and main, complete namespace wiring"
```

---

### Task 10: Self-check — verify all callers match defined names

**Files:**
- Read: `upgrade-templates-v2.jsx`

Before declaring the script ready, verify that every caller uses the correct method name as defined. Run these grep checks — each should return matches only in the correct places.

- [ ] **Step 1: Confirm no old global function names remain as callers**

```bash
# These should return ZERO results (old names must not be called anywhere)
grep -n "buildProgressUI\|setUIFile\|setUIStep\|setUIProgress" upgrade-templates-v2.jsx
grep -n "openLog\|writeLog\|closeLog" upgrade-templates-v2.jsx
grep -n "readSettings\|applySettings\|applyMeasurementUnits" upgrade-templates-v2.jsx
grep -n "importAllStyles\|safeImportSwatches" upgrade-templates-v2.jsx
grep -n "findMasterSpread\|findSourceMaster\|copyMasterSpreads\|applyMasterPageMargins\|copyPageMargins" upgrade-templates-v2.jsx
grep -n "syncLayers\|syncTextVariables\|syncXmlTags\|copyDocumentPageContent\|copyFootnoteOptions" upgrade-templates-v2.jsx
```

Expected output for all: no lines returned.

- [ ] **Step 2: Confirm namespace method calls are present**

```bash
# Each should return lines
grep -n "Logger\."        upgrade-templates-v2.jsx
grep -n "UI\."            upgrade-templates-v2.jsx
grep -n "DocSettings\."   upgrade-templates-v2.jsx
grep -n "Styles\."        upgrade-templates-v2.jsx
grep -n "MasterSpreads\." upgrade-templates-v2.jsx
grep -n "ContentSync\."   upgrade-templates-v2.jsx
```

- [ ] **Step 3: Confirm var-i fix is in place**

```bash
# Should show si, swi, sti — NOT three separate "var i" in copyFootnoteOptions
grep -n "var si\|var swi\|var sti" upgrade-templates-v2.jsx
```

Expected: 3 lines, one for each loop variable.

- [ ] **Step 4: Confirm openDoc is called (not the inline try/catch block)**

```bash
grep -n "openDoc\|OPEN_ORIGINAL_ONLY" upgrade-templates-v2.jsx
```

Expected: `openDoc` defined once, called twice in `upgradeTemplate`; `OPEN_ORIGINAL_ONLY` appears only inside `openDoc`.

- [ ] **Step 5: Commit final verification**

```bash
git add upgrade-templates-v2.jsx
git commit -m "chore: verify namespace wiring and fix correctness — v2 ready for InDesign testing"
```

---

## Running in InDesign

1. Open InDesign CC 2026
2. Window > Utilities > Scripts
3. Navigate to `upgrade-templates-v2.jsx` → double-click
4. Select the source folder when prompted
5. Compare `upgraded/upgrade-log.txt` output against a run of the original script on the same folder — SUCCESS/ERROR counts and file names should match
