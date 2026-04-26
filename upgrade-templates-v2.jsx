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
var Masters = {};
var ContentSync  = {};

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

// ─── DocSettings ─────────────────────────────────────────────────────────────
// Only page dimensions, facing-pages flag, bleed, and slug need to be set on
// the new document. Margins travel with the master spreads via duplicate().

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
    var f;
    for (var i = 0; i < formats.length; i++) {
        f = undefined; // reset each iteration — var is function-scoped in ES3
        try { f = ImportFormat[formats[i][0]]; } catch (e) {}
        if (f === undefined || f === null) f = formats[i][1];
        try { doc.importStyles(f, srcFile, strat); } catch (e) {}
    }
};

// loadSwatches() is the correct InDesign API — importSwatches() does not exist.
Styles.importSwatches = function(doc, srcFile) {
    try { doc.loadSwatches(srcFile); } catch (e) {}
};

// ─── Masters ───────────────────────────────────────────────────────────

Masters.find = function(doc, prefix, baseName) {
    for (var i = 0; i < doc.masterSpreads.length; i++) {
        var m = doc.masterSpreads[i];
        if (m.namePrefix === prefix && m.baseName === baseName) return m;
    }
    return null;
};

Masters.copy = function(srcDoc, newDoc) {
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
};

// duplicate() transfers page items but margin guides may revert to document
// defaults. Match each loaded master spread back to its source counterpart by
// prefix + baseName, then copy margins page-by-page explicitly.
Masters.applyMargins = function(srcDoc, newDoc) {
    for (var i = 0; i < newDoc.masterSpreads.length; i++) {
        var tgt = newDoc.masterSpreads[i];
        var src = Masters.find(srcDoc, tgt.namePrefix, tgt.baseName);
        if (!src) continue;
        for (var p = 0; p < tgt.pages.length && p < src.pages.length; p++) {
            Masters._copyPageMargins(src.pages[p], tgt.pages[p]);
        }
    }
};

Masters._copyPageMargins = function(srcPage, tgtPage) {
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
            try { srcNext = srcItem.nextTextFrame; } catch (e) { srcNext = null; } // non-text-frames throw; null falls through guard below
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

// Sets up exactly 3 document pages with the correct parent pages applied:
//   Page 1   → A-CH_OP
//   Pages 2–3 → B-CH_BODY
function createDocumentPages(newDoc) {
    while (newDoc.pages.length > 3) {
        try { newDoc.pages[newDoc.pages.length - 1].remove(); } catch (e) { break; }
    }
    while (newDoc.pages.length < 3) {
        try { newDoc.pages.add(LocationOptions.AT_END); } catch (e) { break; }
    }

    var chop   = Masters.find(newDoc, "A", "CH_OP");
    var chbody = Masters.find(newDoc, "B", "CH_BODY");

    if (chop)   try { newDoc.pages[0].appliedMaster = chop;   } catch (e) {}
    if (chbody) try { newDoc.pages[1].appliedMaster = chbody; } catch (e) {}
    if (chbody) try { newDoc.pages[2].appliedMaster = chbody; } catch (e) {}
}

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
        Masters.copy(srcDoc, newDoc);

        UI.setStep(ui, "Applying master page margins...", false);
        Masters.applyMargins(srcDoc, newDoc);

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
