import ExcelJS from "npm:exceljs";
import * as d3 from "npm:d3";

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

function addGroupedSheetToWb(wb, headers, dataRows, maxLevel, sheetName) {
  const ws = wb.addWorksheet(sheetName);
  ws.properties.outlineLevelRow = 0;
  ws.properties.outlineProperties = {summaryBelow: false};
  ws.columns = headers.map((h, i) => ({
    header: h, key: `c${i}`,
    width: i < maxLevel ? 45 : i === maxLevel ? 14 : 18
  }));
  const headerRow = ws.getRow(1);
  headerRow.font = {bold: true, size: 11};
  headerRow.eachCell({includeEmpty: false}, (cell, col) => {
    cell.alignment = col > maxLevel + 1 ? ALIGN_RIGHT : ALIGN_MID;
    cell.fill = HEADER_FILL;
  });
  for (const {cells, level} of dataRows) {
    const row = ws.addRow(cells);
    row.outlineLevel = level - 1;
    row.font = fontForLevel(level);
    for (let c = maxLevel + 2; c <= headers.length; c++) {
      row.getCell(c).numFmt = '#,##0';
    }
  }
  return ws;
}

function buildIcicleSheetParts(flatData) {
  const root = d3.stratify()
    .id(d => d.code)
    .parentId(d => d.parentCode)(flatData);
  root.sum(d => Math.max(0, d.value || 0));
  root.sort((a, b) => d3.descending(a.value, b.value));
  const maxLevel = d3.max(flatData.filter(d => d.level > 0), d => d.level) || 1;
  const headers = [];
  for (let lvl = 1; lvl <= maxLevel; lvl++) headers.push(`Level ${lvl}`);
  headers.push("Code", "Amount (UAH mn)");
  const dataRows = [];
  function walk(node) {
    if (node.data.level > 0) {
      const cells = [];
      for (let lvl = 1; lvl <= maxLevel; lvl++) {
        cells.push(node.data.level === lvl ? node.data.name : "");
      }
      cells.push(node.data.code, node.value);
      dataRows.push({cells, level: node.data.level});
    }
    if (node.children) for (const child of node.children) walk(child);
  }
  walk(root);
  return {headers, dataRows, maxLevel};
}

function periodLabel(month) {
  return month === 12 ? "FY" : `${month}m`;
}

function buildIcicleDiffSheetParts(flatData, {currentYear, baseYear, month} = {}) {
  const root = d3.stratify()
    .id(d => d.code)
    .parentId(d => d.parentCode)(flatData);
  root.sum(d => Math.max(0, d.value || 0));
  root.sort((a, b) => d3.descending(a.value, b.value));
  root.each(node => {
    node._current = node.data.value_current || 0;
    node._base = node.data.value_base || 0;
  });
  root.eachAfter(node => {
    if (node.children) {
      node._current = d3.sum(node.children, d => d._current);
      node._base = d3.sum(node.children, d => d._base);
    }
  });
  const maxLevel = d3.max(flatData.filter(d => d.level > 0), d => d.level) || 1;
  const headers = [];
  for (let lvl = 1; lvl <= maxLevel; lvl++) headers.push(`Level ${lvl}`);
  const ml = month ? periodLabel(month) : "";
  const cyLabel = ml ? `${ml} ${currentYear || "Current"}` : (currentYear || "Current");
  const byLabel = ml ? `${ml} ${baseYear || "Base"}` : (baseYear || "Base");
  headers.push("Code", `${cyLabel} (UAH mn)`, `${byLabel} (UAH mn)`, "Change (UAH mn)");
  const dataRows = [];
  function walk(node) {
    if (node.data.level > 0) {
      const cells = [];
      for (let lvl = 1; lvl <= maxLevel; lvl++) {
        cells.push(node.data.level === lvl ? node.data.name : "");
      }
      cells.push(node.data.code, node._current, node._base, node._current - node._base);
      dataRows.push({cells, level: node.data.level});
    }
    if (node.children) for (const child of node.children) walk(child);
  }
  walk(root);
  return {headers, dataRows, maxLevel};
}

// ── Multi-sheet workbook helpers (exported) ────────────────────────────────

export function createWorkbook() {
  return new ExcelJS.Workbook();
}

// Add a single-year icicle tree sheet to an existing workbook
export function addIcicleSheet(wb, flatData, sheetName) {
  const {headers, dataRows, maxLevel} = buildIcicleSheetParts(flatData);
  addGroupedSheetToWb(wb, headers, dataRows, maxLevel, sheetName);
}

// Add a year-over-year icicle diff sheet to an existing workbook
// month: 1-indexed period month (e.g. 3 → "3m 2025", 12 → "FY 2025")
export function addIcicleDiffSheet(wb, flatData, sheetName, {currentYear, baseYear, month} = {}) {
  const {headers, dataRows, maxLevel} = buildIcicleDiffSheetParts(flatData, {currentYear, baseYear, month});
  const ws = addGroupedSheetToWb(wb, headers, dataRows, maxLevel, sheetName);
  if (dataRows.length > 0) {
    // Change column: level cols + Code + Current + Base + Change (1-based: maxLevel + 4)
    const cl = colLetter(maxLevel + 4);
    ws.addConditionalFormatting({
      ref: `${cl}2:${cl}${dataRows.length + 1}`,
      rules: [{
        type: "colorScale",
        cfvo: [{type: "min"}, {type: "num", value: 0}, {type: "max"}],
        color: [{argb: "FFF8696B"}, {argb: "FFFFFFFF"}, {argb: "FF63BE7B"}]
      }]
    });
  }
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
    const isNumericHeader = typeof rows[0][keys[col - 1]] === "number" && !/code/i.test(keys[col - 1]);
    cell.alignment = isNumericHeader ? ALIGN_RIGHT : ALIGN_MID;
    cell.fill = HEADER_FILL;
  });
  for (const row of rows) {
    const cells = keys.map(k => row[k]);
    const exRow = ws.addRow(cells);
    cells.forEach((v, i) => { if (typeof v === "number" && !/code/i.test(keys[i])) exRow.getCell(i + 1).numFmt = "#,##0"; });
  }
  return ws;
}

// Append a blank row then an identity check row with Excel formulas and conditional formatting.
// typeRowMap: { typeName: excelRowNumber } for all rows in the sheet (header=1, data starts at 2).
// numDataCols: number of actuals columns; hasBudgetCol: whether a budget column follows.
// Identity checked: Cash, eop = Cash, bop + Net surplus + Interbudget loans + Deposit operations
export function appendIdentityCheckRow(ws, labelCols, typeRowMap, numDataCols, hasBudgetCol) {
  const IDENTITY_TYPES = ["Cash, eop", "Cash, bop", "Net surplus", "Interbudget loans", "Deposit operations"];
  const typeRows = IDENTITY_TYPES.map(t => typeRowMap[t]);
  if (typeRows.some(r => r == null)) return; // required rows missing

  ws.addRow([]); // blank separator

  const checkRow = ws.addRow([]);
  const checkRowNum = checkRow.number;
  checkRow.getCell(labelCols).value = "Check";
  checkRow.getCell(labelCols).font = {italic: true, size: 10};

  const totalValueCols = numDataCols + (hasBudgetCol ? 1 : 0);
  for (let ci = 0; ci < totalValueCols; ci++) {
    const colIdx = labelCols + 1 + ci;
    const col = colLetter(colIdx);
    const formula = `ABS(${col}${typeRows[0]}-${col}${typeRows[1]}-${col}${typeRows[2]}-${col}${typeRows[3]}-${col}${typeRows[4]})<0.5`;
    const cell = checkRow.getCell(colIdx);
    cell.value = {formula};
    cell.font = {italic: true, size: 10};
  }

}

// Add a waterfall data sheet to an existing workbook.
// Only Category + Amount UAH m columns. Rows whose key contains "\n" are treated
// as totals (level-1 style: bold, outline 0); all other rows are components (italic, outline 1).
export function addWaterfallSheet(wb, wfData, sheetName) {
  const ws = wb.addWorksheet(sheetName);
  if (!wfData || wfData.length === 0) return;
  ws.properties.outlineLevelRow = 0;
  ws.properties.outlineProperties = {summaryBelow: true};
  ws.columns = [
    {header: "Category",     key: "cat",   width: 45},
    {header: "Amount UAH m", key: "value", width: 18},
  ];
  const wfHeader = ws.getRow(1);
  wfHeader.font = {bold: true, size: 11};
  wfHeader.eachCell({includeEmpty: false}, (cell, col) => {
    cell.alignment = col > 1 ? ALIGN_RIGHT : ALIGN_MID;
    cell.fill = HEADER_FILL;
  });
  for (const d of wfData) {
    const isTotal = d.key.includes("\n");
    const label = d.key.replace("\n", " ");
    const row = ws.addRow({cat: label, value: d.value});
    row.outlineLevel = isTotal ? 0 : 1;
    row.font = isTotal
      ? {bold: true,  size: 12}
      : {italic: true, size: 10};
    row.getCell(2).numFmt = '#,##0';
  }
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

  const HIGHLIGHT      = new Set(["Current surplus", "Net surplus"]);
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
    if (HIGHLIGHT.has(r.TYPE)) {
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

// Add a 3-level current surplus breakdown sheet (single year)
// rows: [{level (1-3), name, code (number|null), value}]
// level 1 = "Current revenues" / "Current expenditures" / "Current surplus"
// level 2 = Financial Model category
// level 3 = individual economic classification code
export function addCurrentSurplusSheet(wb, rows, sheetName, {colLabel = "Amount (UAH mn)"} = {}) {
  const ws = wb.addWorksheet(sheetName);
  ws.properties.outlineLevelRow = 0;
  ws.properties.outlineProperties = {summaryBelow: false};
  ws.columns = [
    {header: "Section",  key: "c0", width: 28},
    {header: "Category", key: "c1", width: 35},
    {header: "Item",     key: "c2", width: 42},
    {header: "Code",     key: "c3", width: 14},
    {header: colLabel,   key: "c4", width: 18},
  ];
  ws.getRow(1).font = {bold: true, size: 11};
  ws.getRow(1).eachCell({includeEmpty: false}, (cell, col) => {
    cell.alignment = col >= 5 ? ALIGN_RIGHT : ALIGN_MID;
    cell.fill = HEADER_FILL;
  });
  for (const {level, name, code, value} of rows) {
    const cells = [
      level === 1 ? name : "",
      level === 2 ? name : "",
      level === 3 ? name : "",
      level === 3 && code != null ? code : "",
      value
    ];
    const row = ws.addRow(cells);
    row.outlineLevel = level - 1;
    row.font = fontForLevel(level);
    row.getCell(5).numFmt = "#,##0";
  }
}

// Add a 3-level current surplus diff sheet (year-over-year comparison)
// rows: [{level (1-3), name, code (number|null), value_current, value_base}]
export function addCurrentSurplusDiffSheet(wb, rows, sheetName, {currentYear, baseYear, month} = {}) {
  const ml = month ? periodLabel(month) : "";
  const cyLabel = ml ? `${ml} ${currentYear || "Current"}` : String(currentYear || "Current");
  const byLabel = ml ? `${ml} ${baseYear || "Base"}` : String(baseYear || "Base");
  const ws = wb.addWorksheet(sheetName);
  ws.properties.outlineLevelRow = 0;
  ws.properties.outlineProperties = {summaryBelow: false};
  ws.columns = [
    {header: "Section",             key: "c0", width: 28},
    {header: "Category",            key: "c1", width: 35},
    {header: "Item",                key: "c2", width: 42},
    {header: "Code",                key: "c3", width: 14},
    {header: `${cyLabel} (UAH mn)`, key: "c4", width: 18},
    {header: `${byLabel} (UAH mn)`, key: "c5", width: 18},
    {header: "Change (UAH mn)",     key: "c6", width: 18},
  ];
  ws.getRow(1).font = {bold: true, size: 11};
  ws.getRow(1).eachCell({includeEmpty: false}, (cell, col) => {
    cell.alignment = col >= 5 ? ALIGN_RIGHT : ALIGN_MID;
    cell.fill = HEADER_FILL;
  });
  for (const {level, name, code, value_current, value_base} of rows) {
    const cells = [
      level === 1 ? name : "",
      level === 2 ? name : "",
      level === 3 ? name : "",
      level === 3 && code != null ? code : "",
      value_current,
      value_base,
      value_current - value_base
    ];
    const row = ws.addRow(cells);
    row.outlineLevel = level - 1;
    row.font = fontForLevel(level);
    for (let c = 5; c <= 7; c++) row.getCell(c).numFmt = "#,##0";
  }
  if (rows.length > 0) {
    ws.addConditionalFormatting({
      ref: `G2:G${rows.length + 1}`,
      rules: [{
        type: "colorScale",
        cfvo: [{type: "min"}, {type: "num", value: 0}, {type: "max"}],
        color: [{argb: "FFF8696B"}, {argb: "FFFFFFFF"}, {argb: "FF63BE7B"}]
      }]
    });
  }
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
    cell.value = val; cell.alignment = ALIGN_MID; cell.fill = HEADER_FILL;
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
    row.getCell(5).value = r.code != null ? r.code : "";
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
    cell.value = val; cell.alignment = ALIGN_MID; cell.fill = HEADER_FILL;
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
    row.getCell(5).value = r.code != null ? r.code : "";

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

// ── Standalone single-sheet export functions (used on individual pages) ────

// Export single-year icicle tree data to a grouped Excel file
export async function treeToExcel(flatData, filename = "budget_data.xlsx", sheetName = "Data") {
  const wb = createWorkbook();
  addIcicleSheet(wb, flatData, sheetName);
  await downloadWorkbook(wb, filename);
}

// Export diff icicle tree data to a grouped Excel file
export async function treeDiffToExcel(flatData, filename = "budget_diff.xlsx", sheetName = "Comparison", {currentYear, baseYear} = {}) {
  const wb = createWorkbook();
  addIcicleDiffSheet(wb, flatData, sheetName, {currentYear, baseYear});
  await downloadWorkbook(wb, filename);
}

// Returns a download button element for use in Observable pages
export function ExcelButton(flatData, filename, sheetName, {isDiff = false, currentYear, baseYear, label = "📥 Download Excel"} = {}) {
  const button = document.createElement("button");
  button.textContent = label;
  button.style.cssText = "padding: 6px 12px; cursor: pointer; border: 1px solid #ccc; border-radius: 4px; background: #f8f8f8; font-size: 14px;";
  button.onmouseenter = () => button.style.background = "#e8e8e8";
  button.onmouseleave = () => button.style.background = "#f8f8f8";
  button.onclick = () => {
    if (isDiff) treeDiffToExcel(flatData, filename, sheetName, {currentYear, baseYear});
    else treeToExcel(flatData, filename, sheetName);
  };
  return button;
}
