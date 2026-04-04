import ExcelJS from "npm:exceljs";

// Font style per hierarchy level
const levelStyles = {
  1: {bold: true, size: 14},
  2: {bold: false, size: 12},
  3: {bold: false, italic: true, size: 11},
  4: {bold: false, italic: true, size: 10},
};
function fontForLevel(level) {
  return levelStyles[level] || {bold: false, italic: true, size: 9};
}

const HEADER_FILL = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FFD6E4F0'}};
const ALIGN_MID   = {vertical: "middle"};
const ALIGN_RIGHT = {horizontal: "right", vertical: "middle"};

// ── Low-level helpers ──────────────────────────────────────────────────────

function colLetter(idx) {
  // Convert 1-based column index to Excel letter(s)
  let s = "";
  while (idx > 0) { const r = (idx - 1) % 26; s = String.fromCharCode(65 + r) + s; idx = Math.floor((idx - 1) / 26); }
  return s;
}

// ── Multi-sheet workbook helpers (exported) ────────────────────────────────

export function createWorkbook() {
  return new ExcelJS.Workbook();
}

// Add a flat table sheet to an existing workbook
// headers: optional array of keys to control column order; defaults to Object.keys(rows[0])
// Returns the worksheet for optional post-processing.
export function addFlatSheet(wb, rows, sheetName, headers = null) {
  const ws = wb.addWorksheet(sheetName);
  if (!rows || rows.length === 0) return ws;
  const keys = headers || Object.keys(rows[0]);
  ws.columns = keys.map(k => ({header: k, key: k, width: Math.max(String(k).length + 2, 16)}));
  const h1 = ws.getRow(1);
  h1.font = {bold: true, size: 11};
  h1.eachCell({includeEmpty: false}, (cell, col) => {
    const isCodeHeader = /code/i.test(keys[col - 1]);
    const isNumericHeader = typeof rows[0][keys[col - 1]] === "number" && !isCodeHeader;
    cell.alignment = (isNumericHeader || isCodeHeader) ? ALIGN_RIGHT : ALIGN_MID;
    cell.fill = HEADER_FILL;
  });
  for (const row of rows) {
    const cells = keys.map(k => row[k]);
    const exRow = ws.addRow(cells);
    cells.forEach((v, i) => {
      const isCode = /code/i.test(keys[i]);
      if (typeof v === "number" && !isCode) exRow.getCell(i + 1).numFmt = "#,##0";
      if (isCode) exRow.getCell(i + 1).alignment = ALIGN_RIGHT;
    });
  }
  return ws;
}

// Add a Summary Financials sheet with combined column set and explicit diff specs.
// Left side: value columns (all cols); right side (after GAP spacer): diff columns per diffSpecs.
// rows: [{TYPE, CAT, actuals:{key:val}}]
// cols: [{year, month, key, label}] — combined (FY + period + budget), budget cols have isBudget:true
// diffSpecs: [{fromKey, toKey, label}] — explicit diff pairs; length may differ from cols.length-1
export function addSummaryFinancialsSheet(wb, rows, cols, sheetName, diffSpecs = []) {
  const ws = wb.addWorksheet(sheetName);
  const LABEL_COLS = 2; // Category, Type
  const GAP = 3;        // empty columns between value and diff sections

  // cols and diffSpecs may contain {separator:true} entries for visual section gaps.
  const nVal  = cols.length;
  const nDiff = diffSpecs.length;

  const t1Start       = LABEL_COLS + 1;
  const typeRepeatCol = t1Start + nVal + GAP;
  const t3Start       = typeRepeatCol + 1;

  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 35;
  cols.forEach((c, i) => { ws.getColumn(t1Start + i).width = c && !c.separator ? 16 : 4; });
  for (let i = t1Start + nVal; i < typeRepeatCol; i++) ws.getColumn(i).width = 3;
  ws.getColumn(typeRepeatCol).width = 35;
  diffSpecs.forEach((s, i) => { ws.getColumn(t3Start + i).width = s && !s.separator ? 18 : 4; });

  const IDENTITY_TYPES = ["Cash, eop", "Cash, bop", "Net surplus", "Interbudget loans", "Deposit operations"];

  const hRow = ws.getRow(1);
  hRow.font = {bold: true, size: 11};
  hRow.getCell(1).value = "Category"; hRow.getCell(1).alignment = ALIGN_MID; hRow.getCell(1).fill = HEADER_FILL;
  hRow.getCell(2).value = "Type";     hRow.getCell(2).alignment = ALIGN_MID; hRow.getCell(2).fill = HEADER_FILL;
  cols.forEach((c, i) => {
    if (!c || c.separator) return;
    const cell = hRow.getCell(t1Start + i);
    cell.value = c.label; cell.alignment = ALIGN_RIGHT; cell.fill = HEADER_FILL;
  });
  hRow.getCell(typeRepeatCol).value = "Type"; hRow.getCell(typeRepeatCol).alignment = ALIGN_MID; hRow.getCell(typeRepeatCol).fill = HEADER_FILL;
  diffSpecs.forEach((spec, i) => {
    if (!spec || spec.separator) return;
    const cell = hRow.getCell(t3Start + i);
    cell.value = spec.label; cell.alignment = ALIGN_RIGHT; cell.fill = HEADER_FILL;
  });

  let rowNum = 2;
  const typeRowMap = {};
  for (const r of rows) {
    const row = ws.getRow(rowNum);
    row.getCell(1).value = r.CAT;
    row.getCell(2).value = r.TYPE;
    const valsMap = {};
    for (const c of cols) { if (c && !c.separator) valsMap[c.key] = r.actuals[c.key] || 0; }
    cols.forEach((c, i) => {
      if (!c || c.separator) return;
      const cell = row.getCell(t1Start + i);
      cell.value = valsMap[c.key]; cell.numFmt = '#,##0';
    });
    row.getCell(typeRepeatCol).value = r.TYPE;
    diffSpecs.forEach((spec, d) => {
      if (!spec || spec.separator) return;
      const cell = row.getCell(t3Start + d);
      cell.value = (valsMap[spec.toKey] || 0) - (valsMap[spec.fromKey] || 0);
      cell.numFmt = '#,##0';
    });
    row.font = r.CAT === "Total" ? {bold: true, size: 11} : {size: 10};
    if (r.CAT === "Total") {
      const lastFill = nDiff > 0 ? t3Start + nDiff - 1 : typeRepeatCol;
      for (let c = 1; c <= lastFill; c++) {
        row.getCell(c).fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FFFFFDE7'}};
      }
    }
    typeRowMap[r.TYPE] = rowNum;
    rowNum++;
  }
  const afterData = rowNum;

  if (rows.length > 0 && nDiff > 0) {
    diffSpecs.forEach((spec, d) => {
      if (!spec || spec.separator) return;
      const col = colLetter(t3Start + d);
      ws.addConditionalFormatting({
        ref: `${col}2:${col}${afterData - 1}`,
        rules: [{
          type: "colorScale",
          cfvo: [{type: "min"}, {type: "num", value: 0}, {type: "max"}],
          color: [{argb: "FFF8696B"}, {argb: "FFFFFFFF"}, {argb: "FF63BE7B"}]
        }]
      });
    });
  }

  // Check row
  const checkRow = ws.getRow(afterData + 1);
  checkRow.getCell(2).value = "Check";
  checkRow.getCell(typeRepeatCol).value = "Check";
  const labelFont = {italic: true, size: 10};
  checkRow.getCell(2).font = labelFont;
  checkRow.getCell(typeRepeatCol).font = labelFont;
  const IDENTITY_TYPES_ROWS = IDENTITY_TYPES.map(t => typeRowMap[t]);
  if (!IDENTITY_TYPES_ROWS.some(r => r == null)) {
    cols.forEach((c, ci) => {
      if (!c || c.separator) return;
      const colIdx = t1Start + ci;
      const col = colLetter(colIdx);
      const [r0, r1, r2, r3, r4] = IDENTITY_TYPES_ROWS;
      const formula = `ABS(${col}${r0}-${col}${r1}-${col}${r2}-${col}${r3}-${col}${r4})<0.5`;
      const cell = checkRow.getCell(colIdx);
      cell.value = {formula};
      cell.font = labelFont;
    });
  }
}

// Write workbook to buffer and trigger browser download
export async function downloadWorkbook(wb, filename) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Add a Financial Summary Breakdown sheet with combined column set and explicit diff specs.
// Main table: 5 label cols + value cols. Diff table to the right (after GAP spacer):
//   repeated Item label + diff columns per diffSpecs.
// rows: [{level, name, cat, code, isTotal, actuals:{colKey:val}}]
// cols: [{key, label}] — combined (FY + period + budget), budget cols have isBudget:true
// diffSpecs: [{fromKey, toKey, label}] — explicit diff pairs
export function addSummaryBreakdownSheet(wb, rows, cols, sheetName, diffSpecs = []) {
  const ws = wb.addWorksheet(sheetName);
  ws.properties.outlineLevelRow = 0;
  ws.properties.outlineProperties = {summaryBelow: false};

  // cols and diffSpecs may contain {separator:true} entries for visual section gaps.
  const LABEL_COLS = 5; // Category | Type | Sub-type | Item | Code
  const GAP = 3;
  const nVal  = cols.length;
  const nDiff = diffSpecs.length;

  // Column positions (1-based)
  const valStart   = LABEL_COLS + 1;
  const nameRepCol = valStart + nVal + GAP;
  const diffStart  = nameRepCol + 1;

  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 28;
  ws.getColumn(3).width = 35;
  ws.getColumn(4).width = 45;
  ws.getColumn(5).width = 14;
  cols.forEach((c, i) => { ws.getColumn(valStart + i).width = c && !c.separator ? 16 : 4; });
  for (let i = valStart + nVal; i < nameRepCol; i++) ws.getColumn(i).width = 3;
  ws.getColumn(nameRepCol).width = 45;
  diffSpecs.forEach((s, i) => { ws.getColumn(diffStart + i).width = s && !s.separator ? 18 : 4; });

  const yellowFill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FFFFFDE7'}};

  // Header row
  const h = ws.getRow(1);
  h.font = {bold: true, size: 11};
  [{col: 1, val: "Category"}, {col: 2, val: "Type"}, {col: 3, val: "Sub-type"}, {col: 4, val: "Item"}, {col: 5, val: "Code"}].forEach(({col, val}) => {
    const cell = h.getCell(col);
    cell.value = val; cell.alignment = col === 5 ? ALIGN_RIGHT : ALIGN_MID; cell.fill = HEADER_FILL;
  });
  cols.forEach((c, i) => {
    if (!c || c.separator) return;
    const cell = h.getCell(valStart + i);
    cell.value = c.label; cell.alignment = ALIGN_RIGHT; cell.fill = HEADER_FILL;
  });
  const nameRepHeader = h.getCell(nameRepCol);
  nameRepHeader.value = "Item"; nameRepHeader.alignment = ALIGN_MID; nameRepHeader.fill = HEADER_FILL;
  diffSpecs.forEach((spec, i) => {
    if (!spec || spec.separator) return;
    const cell = h.getCell(diffStart + i);
    cell.value = spec.label; cell.alignment = ALIGN_RIGHT; cell.fill = HEADER_FILL;
  });

  // Data rows
  let rn = 2;
  for (const r of rows) {
    const row = ws.getRow(rn++);
    // Main label columns
    row.getCell(1).value = r.level === 1 ? (r.cat || "") : "";
    row.getCell(2).value = r.level === 1 ? r.name : "";
    row.getCell(3).value = r.level === 2 && r.code == null ? r.name : "";
    row.getCell(4).value = r.level === 3 || (r.level === 2 && r.code != null) ? r.name : "";
    row.getCell(5).value = r.code != null ? r.code : ""; row.getCell(5).alignment = ALIGN_RIGHT;
    // Value columns
    const valsMap = {};
    for (const c of cols) { if (c && !c.separator) valsMap[c.key] = r.actuals[c.key] || 0; }
    cols.forEach((c, i) => {
      if (!c || c.separator) return;
      const cell = row.getCell(valStart + i);
      cell.value = valsMap[c.key]; cell.numFmt = "#,##0";
    });
    // Diff table: repeated name + diffs
    row.getCell(nameRepCol).value = r.name;
    diffSpecs.forEach((spec, d) => {
      if (!spec || spec.separator) return;
      const cell = row.getCell(diffStart + d);
      cell.value = (valsMap[spec.toKey] || 0) - (valsMap[spec.fromKey] || 0);
      cell.numFmt = "#,##0";
    });
    row.outlineLevel = r.isTotal ? 0 : Math.max(0, r.level - 1);
    row.font = fontForLevel(r.level);
    if (r.isTotal) {
      for (let c = 1; c <= LABEL_COLS + nVal; c++) row.getCell(c).fill = yellowFill;
      row.getCell(nameRepCol).fill = yellowFill;
      for (let c = diffStart; c < diffStart + nDiff; c++) row.getCell(c).fill = yellowFill;
    }
  }

  // Color scale on diff columns (skip separators)
  if (rows.length > 0 && nDiff > 0) {
    diffSpecs.forEach((spec, d) => {
      if (!spec || spec.separator) return;
      const col = colLetter(diffStart + d);
      ws.addConditionalFormatting({
        ref: `${col}2:${col}${rn - 1}`,
        rules: [{
          type: "colorScale",
          cfvo: [{type: "min"}, {type: "num", value: 0}, {type: "max"}],
          color: [{argb: "FFF8696B"}, {argb: "FFFFFFFF"}, {argb: "FF63BE7B"}]
        }]
      });
    });
  }
}

// Add an Expense Cross-Classification sheet (Economic L1 × Functional hierarchy).
// Mirrors addSummaryBreakdownSheet structure but with a 4-level depth:
//   Level 1: Economic L1 (Current / Capital / Other / Undistributed)
//   Level 2: FKV section (code=null → col 2; code≠null → col 4 as leaf)
//   Level 3: FKV sub-section (code=null → col 3; code≠null → col 4 as leaf)
//   Level 4: FKV detail leaf → col 4, Code → col 5
// rows: [{level (1-4), name, cat, code, isTotal, actuals:{colKey:val}}]
// cols: combined layout cols (may include {separator:true} entries)
// diffSpecs: explicit diff pairs (may include {separator:true} entries)
export function addExpCrossClassSheet(wb, rows, cols, sheetName, diffSpecs = []) {
  const ws = wb.addWorksheet(sheetName);
  ws.properties.outlineLevelRow = 0;
  ws.properties.outlineProperties = {summaryBelow: false};

  const LABEL_COLS = 5;
  const GAP = 3;
  const nVal  = cols.length;
  const nDiff = diffSpecs.length;

  const valStart   = LABEL_COLS + 1;
  const nameRepCol = valStart + nVal + GAP;
  const diffStart  = nameRepCol + 1;

  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 35;
  ws.getColumn(3).width = 45;
  ws.getColumn(4).width = 45;
  ws.getColumn(5).width = 14;
  cols.forEach((c, i) => { ws.getColumn(valStart + i).width = c && !c.separator ? 16 : 4; });
  for (let i = valStart + nVal; i < nameRepCol; i++) ws.getColumn(i).width = 3;
  ws.getColumn(nameRepCol).width = 45;
  diffSpecs.forEach((s, i) => { ws.getColumn(diffStart + i).width = s && !s.separator ? 18 : 4; });

  // Header row
  const h = ws.getRow(1);
  h.font = {bold: true, size: 11};
  [{col: 1, val: "Economic class"}, {col: 2, val: "FKV section"}, {col: 3, val: "FKV sub-section"}, {col: 4, val: "FKV detail"}, {col: 5, val: "Code"}].forEach(({col, val}) => {
    const cell = h.getCell(col);
    cell.value = val; cell.alignment = col === 5 ? ALIGN_RIGHT : ALIGN_MID; cell.fill = HEADER_FILL;
  });
  cols.forEach((c, i) => {
    if (!c || c.separator) return;
    const cell = h.getCell(valStart + i);
    cell.value = c.label; cell.alignment = ALIGN_RIGHT; cell.fill = HEADER_FILL;
  });
  const nameRepHeader = h.getCell(nameRepCol);
  nameRepHeader.value = "Item"; nameRepHeader.alignment = ALIGN_MID; nameRepHeader.fill = HEADER_FILL;
  diffSpecs.forEach((spec, i) => {
    if (!spec || spec.separator) return;
    const cell = h.getCell(diffStart + i);
    cell.value = spec.label; cell.alignment = ALIGN_RIGHT; cell.fill = HEADER_FILL;
  });

  // Data rows
  let rn = 2;
  for (const r of rows) {
    const row = ws.getRow(rn++);
    row.getCell(1).value = r.level === 1 ? r.name : "";
    row.getCell(2).value = r.level === 2 && r.code == null ? r.name : "";
    row.getCell(3).value = r.level === 3 && r.code == null ? r.name : "";
    row.getCell(4).value = r.level === 4 || (r.level >= 2 && r.code != null) ? r.name : "";
    row.getCell(5).value = r.code != null ? r.code : ""; row.getCell(5).alignment = ALIGN_RIGHT;

    const valsMap = {};
    for (const c of cols) { if (c && !c.separator) valsMap[c.key] = r.actuals[c.key] || 0; }
    cols.forEach((c, i) => {
      if (!c || c.separator) return;
      const cell = row.getCell(valStart + i);
      cell.value = valsMap[c.key]; cell.numFmt = "#,##0";
    });
    row.getCell(nameRepCol).value = r.name;
    diffSpecs.forEach((spec, d) => {
      if (!spec || spec.separator) return;
      const cell = row.getCell(diffStart + d);
      cell.value = (valsMap[spec.toKey] || 0) - (valsMap[spec.fromKey] || 0);
      cell.numFmt = "#,##0";
    });
    row.outlineLevel = Math.max(0, r.level - 1);
    row.font = fontForLevel(r.level);
  }

  // Color scale on diff columns
  if (rows.length > 0 && nDiff > 0) {
    diffSpecs.forEach((spec, d) => {
      if (!spec || spec.separator) return;
      const col = colLetter(diffStart + d);
      ws.addConditionalFormatting({
        ref: `${col}2:${col}${rn - 1}`,
        rules: [{
          type: "colorScale",
          cfvo: [{type: "min"}, {type: "num", value: 0}, {type: "max"}],
          color: [{argb: "FFF8696B"}, {argb: "FFFFFFFF"}, {argb: "FF63BE7B"}]
        }]
      });
    });
  }
}

