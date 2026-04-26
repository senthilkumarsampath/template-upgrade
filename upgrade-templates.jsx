// upgrade-templates.jsx
// Batch-upgrades CS3/CS4 InDesign templates to CC 2026 by building fresh
// documents and importing all assets — avoiding the corruption caused by
// simply opening and re-saving old files.
//
// Run from InDesign: Window > Utilities > Scripts panel > double-click this file
//
// Output: an "upgraded/" folder alongside the selected source folder,
// containing .indt files and upgrade-log.txt

#target indesign

var UPGRADED_FOLDER = "upgraded";
var LOG_FILE        = "upgrade-log.txt";

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

    var log = openLog(outFolder, srcFolder, files.length);

    // Show progress UI
    var ui = buildProgressUI(files.length);
    ui.win.show();

    var prevInteraction = app.scriptPreferences.userInteractionLevel;
    app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;

    var ok = 0, fail = 0;
    try {
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            setUIFile(ui, i, f.name, files.length);
            try {
                upgradeTemplate(f, outFolder, ui);
                writeLog(log, "SUCCESS", f.name, "");
                ok++;
            } catch (e) {
                writeLog(log, "ERROR", f.name, e.message);
                fail++;
                setUIStep(ui, "Error: " + e.message, true);
            }
            setUIProgress(ui, i + 1, files.length, ok, fail);
        }
    } finally {
        app.scriptPreferences.userInteractionLevel = prevInteraction;
    }

    closeLog(log, ok, fail);
    ui.win.close();

    alert("Done!\n\n" +
          ok   + " template" + (ok   !== 1 ? "s" : "") + " upgraded successfully\n" +
          fail + " template" + (fail !== 1 ? "s" : "") + " failed" +
          (fail > 0 ? " — see upgrade-log.txt" : "") +
          "\n\nOutput folder:\n" + outFolder.fsName);
}

// ─── Progress UI ─────────────────────────────────────────────────────────────

function buildProgressUI(total) {
    var win = new Window("palette", "InDesign Template Upgrader", undefined, {closeButton: false});
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 12;
    win.margins = [20, 16, 20, 20];
    win.preferredSize.width = 460;

    // Title
    var title = win.add("statictext", undefined, "Upgrading Templates to CC 2026");
    title.graphics.font = ScriptUI.newFont("dialog", "BOLD", 13);

    win.add("panel", [0, 0, 460, 1]); // divider

    // Current file
    var fileRow = win.add("group");
    fileRow.orientation = "row";
    fileRow.alignChildren = ["left", "center"];
    fileRow.spacing = 6;
    fileRow.add("statictext", undefined, "File:");
    var fileName = fileRow.add("statictext", [0, 0, 370, 18], "—");
    fileName.graphics.font = ScriptUI.newFont("dialog", "BOLD", 11);

    // Step status
    var stepText = win.add("statictext", [0, 0, 460, 16], "Starting...");
    stepText.graphics.font = ScriptUI.newFont("dialog", "ITALIC", 11);

    // Progress bar
    var bar = win.add("progressbar", [0, 0, 460, 18], 0, total);

    // Counter row
    var counterRow = win.add("group");
    counterRow.orientation = "row";
    counterRow.alignChildren = ["left", "center"];
    counterRow.spacing = 0;

    var counter    = counterRow.add("statictext", undefined, "0 of " + total + " templates");
    var spacer     = counterRow.add("statictext", undefined, "");
    spacer.preferredSize.width = 200;
    var okCount    = counterRow.add("statictext", undefined, "✓ 0");
    okCount.graphics.foregroundColor = okCount.graphics.newPen(
        okCount.graphics.PenType.SOLID_COLOR, [0.1, 0.5, 0.1, 1], 1);
    counterRow.add("statictext", undefined, "  ");
    var failCount  = counterRow.add("statictext", undefined, "✗ 0");
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
}

function setUIFile(ui, index, name, total) {
    ui.fileName.text = name;
    ui.counter.text  = (index + 1) + " of " + total + " templates";
    ui.bar.value     = index;
    setUIStep(ui, "Opening source document...", false);
}

function setUIStep(ui, msg, isError) {
    ui.stepText.text = msg;
    ui.win.update();
    $.sleep(1); // yield to InDesign's event loop so the palette repaints
}

function setUIProgress(ui, done, total, ok, fail) {
    ui.bar.value      = done;
    ui.counter.text   = done + " of " + total + " templates";
    ui.okCount.text   = "✓ " + ok;
    ui.failCount.text = "✗ " + fail;
    ui.win.update();
    $.sleep(1);
}

// ─── File collection ─────────────────────────────────────────────────────────

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

// ─── Per-template upgrade ────────────────────────────────────────────────────

function upgradeTemplate(srcFile, outFolder, ui) {
    var srcDoc = null;
    var newDoc = null;

    // Normalise all measurement reads/writes to points for this template.
    var prevUnit;
    try { prevUnit = app.scriptPreferences.measurementUnit; } catch (e) {}
    try { app.scriptPreferences.measurementUnit = MeasurementUnits.POINTS; } catch (e) {}

    try {
        // 1 — open source, read layout settings, close before importing styles
        setUIStep(ui, "Opening source document...", false);
        var openOrig;
        try { openOrig = OpenOptions.OPEN_ORIGINAL_ONLY; } catch (e) {}
        srcDoc = openOrig ? app.open(srcFile, false, openOrig) : app.open(srcFile, false);
        setUIStep(ui, "Reading page size, bleed and slug...", false);
        var settings = readSettings(srcDoc);
        srcDoc.close(SaveOptions.NO);
        srcDoc = null;

        // 2 — create fresh CC 2026 document and apply page layout
        setUIStep(ui, "Creating new CC 2026 document...", false);
        newDoc = app.documents.add(false);
        applySettings(newDoc, settings);
        setUIStep(ui, "Setting all rulers and units to points...", false);
        applyMeasurementUnits(newDoc);

        // 3 — import styles and swatches while source file is closed
        setUIStep(ui, "Importing paragraph, character, table, cell and object styles...", false);
        importAllStyles(newDoc, srcFile);
        setUIStep(ui, "Importing colour swatches...", false);
        safeImportSwatches(newDoc, srcFile);

        // 4 — reopen source for all content and document-level operations
        setUIStep(ui, "Reopening source for content operations...", false);
        srcDoc = openOrig ? app.open(srcFile, false, openOrig) : app.open(srcFile, false);

        setUIStep(ui, "Syncing layers...", false);
        syncLayers(srcDoc, newDoc);

        setUIStep(ui, "Recreating text variables...", false);
        syncTextVariables(srcDoc, newDoc);

        setUIStep(ui, "Syncing XML tags...", false);
        syncXmlTags(srcDoc, newDoc);

        setUIStep(ui, "Loading master pages (parent pages)...", false);
        copyMasterSpreads(srcDoc, newDoc);

        setUIStep(ui, "Applying master page margins...", false);
        applyMasterPageMargins(srcDoc, newDoc);

        setUIStep(ui, "Copying document footnote options (formatting + layout)...", false);
        copyFootnoteOptions(srcDoc, newDoc);

        // 5 — set up 3 document pages with correct parent pages applied
        setUIStep(ui, "Creating document pages and assigning parent pages...", false);
        createDocumentPages(newDoc);

        // 6 — copy page frames from source and restore text frame threading
        setUIStep(ui, "Copying page frames...", false);
        copyDocumentPageContent(srcDoc, newDoc);

        srcDoc.close(SaveOptions.NO);
        srcDoc = null;

        // 7 — save
        setUIStep(ui, "Saving as .indt template...", false);
        var baseName   = srcFile.name.replace(/\.(indt|indd)$/i, "");
        var outputFile = new File(outFolder + "/" + baseName + ".indt");
        newDoc.saveACopy(outputFile, true);

        setUIStep(ui, "Done.", false);
    } finally {
        if (newDoc) try { newDoc.close(SaveOptions.NO); } catch (e) {}
        if (srcDoc) try { srcDoc.close(SaveOptions.NO); } catch (e) {}
        if (prevUnit !== undefined) {
            try { app.scriptPreferences.measurementUnit = prevUnit; } catch (e) {}
        }
    }
}

// ─── Document settings ───────────────────────────────────────────────────────
// Only page dimensions, facing-pages flag, bleed, and slug need to be set on
// the new document. Margins travel with the master spreads via duplicate().

function readSettings(doc) {
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
}

function applySettings(doc, s) {
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
}

// ─── Measurement units ───────────────────────────────────────────────────────

function applyMeasurementUnits(doc) {
    var pt;
    try { pt = MeasurementUnits.POINTS; } catch (e) { pt = 2054188905; }
    var vp = doc.viewPreferences;
    try { vp.horizontalMeasurementUnits  = pt; } catch (e) {}
    try { vp.verticalMeasurementUnits    = pt; } catch (e) {}
    try { vp.typographicMeasurementUnits = pt; } catch (e) {}
    try { vp.textSizeMeasurementUnits    = pt; } catch (e) {}
    try { vp.strokeMeasurementUnits      = pt; } catch (e) {}
    try { vp.printDialogMeasurementUnits = pt; } catch (e) {}
}

// ─── Styles & swatches ───────────────────────────────────────────────────────
// importStyles(format: ImportFormat, from: File, globalStrategy)
// Correct enum is ImportFormat — NOT StyleType.
// Numeric fallbacks from the InDesign CC 2026 scripting reference.

function importAllStyles(doc, srcFile) {
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
}

// loadSwatches() is the correct method — importSwatches() does not exist.
function safeImportSwatches(doc, srcFile) {
    try { doc.loadSwatches(srcFile); } catch (e) {}
}

// ─── Layers ──────────────────────────────────────────────────────────────────

function syncLayers(srcDoc, newDoc) {
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
            // Existing layer (e.g. the default "Layer 1") — update all properties
            try { tl.visible    = sl.visible;    } catch (e) {}
            try { tl.locked     = sl.locked;     } catch (e) {}
            try { tl.layerColor = sl.layerColor; } catch (e) {}
        }
    }
}

// ─── Text variables ──────────────────────────────────────────────────────────

function syncTextVariables(srcDoc, newDoc) {
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
        } catch (e) { /* skip variables that cannot be recreated */ }
    }
}

// ─── XML tags ────────────────────────────────────────────────────────────────

function syncXmlTags(srcDoc, newDoc) {
    for (var i = 0; i < srcDoc.xmlTags.length; i++) {
        var st = srcDoc.xmlTags[i];
        try {
            if (!newDoc.xmlTags.itemByName(st.name).isValid) {
                newDoc.xmlTags.add({ name: st.name, color: st.color });
            }
        } catch (e) {}
    }
}

// ─── Master spreads ──────────────────────────────────────────────────────────
// Uses the same mechanism as Pages panel › Load Parent Pages:
// duplicate() transfers each master spread as a complete unit — preserving
// text frames, threading, guides, and page geometry without manual item copying.

function copyMasterSpreads(srcDoc, newDoc) {
    // Un-assign masters from document pages so the default blank masters
    // can be safely removed before loading from source.
    var p;
    for (p = 0; p < newDoc.pages.length; p++) {
        try { newDoc.pages[p].appliedMaster = NothingEnum.NOTHING; } catch (e) {}
    }
    for (var m = newDoc.masterSpreads.length - 1; m >= 0; m--) {
        try { newDoc.masterSpreads[m].remove(); } catch (e) {}
    }

    // Load each source master spread into the new document wholesale.
    for (var i = 0; i < srcDoc.masterSpreads.length; i++) {
        try {
            srcDoc.masterSpreads[i].duplicate(LocationOptions.AT_END, newDoc);
        } catch (e) {}
    }
}

// ─── Master page margins ─────────────────────────────────────────────────────
// duplicate() transfers page items but margin guides may revert to document
// defaults. Match each loaded master spread back to its source counterpart by
// prefix + baseName, then copy margins page-by-page explicitly.

function applyMasterPageMargins(srcDoc, newDoc) {
    for (var i = 0; i < newDoc.masterSpreads.length; i++) {
        var tgt = newDoc.masterSpreads[i];
        var src = findSourceMaster(srcDoc, tgt.namePrefix, tgt.baseName);
        if (!src) continue;
        for (var p = 0; p < tgt.pages.length && p < src.pages.length; p++) {
            copyPageMargins(src.pages[p], tgt.pages[p]);
        }
    }
}

function findSourceMaster(srcDoc, prefix, baseName) {
    for (var i = 0; i < srcDoc.masterSpreads.length; i++) {
        var m = srcDoc.masterSpreads[i];
        if (m.namePrefix === prefix && m.baseName === baseName) return m;
    }
    return null;
}

function copyPageMargins(srcPage, tgtPage) {
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
}

// ─── Document pages ───────────────────────────────────────────────────────────
// After master pages are finalised, set up exactly 3 document pages and
// assign the correct parent pages:
//   Page 1  → A-CH_OP
//   Pages 2–3 → B-CH_BODY

function createDocumentPages(newDoc) {
    while (newDoc.pages.length > 3) {
        try { newDoc.pages[newDoc.pages.length - 1].remove(); } catch (e) { break; }
    }
    while (newDoc.pages.length < 3) {
        try { newDoc.pages.add(LocationOptions.AT_END); } catch (e) { break; }
    }

    var chop   = findMasterSpread(newDoc, "A", "CH_OP");
    var chbody = findMasterSpread(newDoc, "B", "CH_BODY");

    if (chop)   try { newDoc.pages[0].appliedMaster = chop;   } catch (e) {}
    if (chbody) try { newDoc.pages[1].appliedMaster = chbody; } catch (e) {}
    if (chbody) try { newDoc.pages[2].appliedMaster = chbody; } catch (e) {}
}

function findMasterSpread(doc, prefix, baseName) {
    for (var i = 0; i < doc.masterSpreads.length; i++) {
        var m = doc.masterSpreads[i];
        if (m.namePrefix === prefix && m.baseName === baseName) return m;
    }
    return null;
}

// ─── Footnote options ────────────────────────────────────────────────────────
// Copies all document footnote settings from source to new document.
// Simple values (numbers, booleans, strings, enums) are copied directly.
// Style and swatch references are resolved by name so they bind to the
// already-imported equivalents in newDoc rather than source objects.

function copyFootnoteOptions(srcDoc, newDoc) {
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
    for (var i = 0; i < simpleProps.length; i++) {
        try { tgt[simpleProps[i]] = src[simpleProps[i]]; } catch (e) {}
    }

    // Paragraph style reference — look up by name in newDoc
    try {
        var tsName = src.footnoteTextStyle.name;
        var ts = newDoc.paragraphStyles.itemByName(tsName);
        if (ts.isValid) tgt.footnoteTextStyle = ts;
    } catch (e) {}

    // Character style reference
    try {
        var msName = src.footnoteMarkerStyle.name;
        var ms = newDoc.characterStyles.itemByName(msName);
        if (ms.isValid) tgt.footnoteMarkerStyle = ms;
    } catch (e) {}

    // Swatch references — look up by name
    var swatchProps = [
        "continuingRuleColor", "continuingRuleGapColor",
        "ruleColor",           "ruleGapColor"
    ];
    for (var i = 0; i < swatchProps.length; i++) {
        try {
            var sw = newDoc.swatches.itemByName(src[swatchProps[i]].name);
            if (sw.isValid) tgt[swatchProps[i]] = sw;
        } catch (e) {}
    }

    // Stroke style references
    var strokeProps = ["continuingRuleType", "ruleType"];
    for (var i = 0; i < strokeProps.length; i++) {
        try {
            var st = newDoc.strokeStyles.itemByName(src[strokeProps[i]].name);
            if (st.isValid) tgt[strokeProps[i]] = st;
        } catch (e) {}
    }
}

// ─── Document page content & threading ───────────────────────────────────────
// Copies all top-level page items from source pages 1–N (up to the 3 pages in
// the new document) then restores text frame threading across those pages.
//
// Phase 1 — duplicate:
//   Each top-level item on source page[p] is duplicated to newDoc.pages[p].
//   A frameMap keyed by source item ID tracks source → duplicate pairs.
//
// Phase 2 — re-thread:
//   For every item that had a nextTextFrame in the source, we look up both
//   ends in frameMap and call tgtFrame.nextTextFrame = tgtNext to restore
//   the thread chain across all three pages.

function copyDocumentPageContent(srcDoc, newDoc) {
    var frameMap  = {};
    var pageCount = Math.min(srcDoc.pages.length, newDoc.pages.length);

    // Phase 1: duplicate all top-level page items
    for (var p = 0; p < pageCount; p++) {
        var items = srcDoc.pages[p].pageItems;
        for (var j = 0; j < items.length; j++) {
            var srcItem = items[j];
            try {
                var dup = srcItem.duplicate(newDoc.pages[p]);
                frameMap[srcItem.id] = dup;
            } catch (e) {}
        }
    }

    // Phase 2: restore text frame threading
    for (var p = 0; p < pageCount; p++) {
        var items = srcDoc.pages[p].pageItems;
        for (var j = 0; j < items.length; j++) {
            var srcItem = items[j];
            var srcNext;
            // Only text frames have nextTextFrame; others throw — skip via catch.
            try { srcNext = srcItem.nextTextFrame; } catch (e) { continue; }
            if (!srcNext || !srcNext.isValid) continue;

            var tgtFrame = frameMap[srcItem.id];
            var tgtNext  = frameMap[srcNext.id];
            if (!tgtFrame || !tgtNext) continue;
            try { tgtFrame.nextTextFrame = tgtNext; } catch (e) {}
        }
    }
}

// ─── Logging ─────────────────────────────────────────────────────────────────

function openLog(outFolder, srcFolder, total) {
    var f = new File(outFolder + "/" + LOG_FILE);
    f.open("w");
    f.writeln("InDesign Template Upgrade Log");
    f.writeln("Date   : " + new Date().toString());
    f.writeln("Source : " + srcFolder.fsName);
    f.writeln("Output : " + outFolder.fsName);
    f.writeln("Files  : " + total);
    f.writeln("---");
    return f;
}

function writeLog(f, status, name, msg) {
    f.writeln("[" + status + "] " + name + (msg ? " | " + msg : ""));
}

function closeLog(f, ok, fail) {
    f.writeln("---");
    f.writeln("Result : " + ok + " succeeded, " + fail + " failed");
    f.close();
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main();
