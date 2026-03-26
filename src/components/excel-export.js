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
  headerRow.alignment = {vertical: "middle"};
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
export function addFlatSheet(wb, rows, sheetName, headers = null) {
  const ws = wb.addWorksheet(sheetName);
  if (!rows || rows.length === 0) return;
  const keys = headers || Object.keys(rows[0]);
  ws.columns = keys.map(k => ({header: k, key: k, width: Math.max(String(k).length + 2, 16)}));
  ws.getRow(1).font = {bold: true, size: 11};
  for (const row of rows) {
    const cells = keys.map(k => row[k]);
    const exRow = ws.addRow(cells);
    cells.forEach((v, i) => { if (typeof v === "number" && !/code/i.test(keys[i])) exRow.getCell(i + 1).numFmt = "#,##0"; });
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
  ws.getRow(1).font = {bold: true, size: 11};
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
  ws.getRow(1).alignment = {vertical: "middle"};
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
  ws.getRow(1).alignment = {vertical: "middle"};
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
