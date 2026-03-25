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

// Export single-year icicle tree data to a grouped Excel file
export async function treeToExcel(flatData, filename = "budget_data.xlsx", sheetName = "Data") {
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

  await writeGroupedExcel(headers, dataRows, maxLevel, filename, sheetName);
}

// Export diff icicle tree data to a grouped Excel file
export async function treeDiffToExcel(flatData, filename = "budget_diff.xlsx", sheetName = "Comparison", {currentYear, baseYear} = {}) {
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
  headers.push("Code", `${currentYear || "Current"} (UAH mn)`, `${baseYear || "Base"} (UAH mn)`, "Change (UAH mn)");

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

  await writeGroupedExcel(headers, dataRows, maxLevel, filename, sheetName);
}

async function writeGroupedExcel(headers, dataRows, maxLevel, filename, sheetName) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);

  // Outline settings: summary rows above detail
  ws.properties.outlineLevelRow = 0;
  ws.properties.outlineProperties = {summaryBelow: false};

  // Column definitions
  const numValueCols = headers.length - maxLevel - 1; // all after Code
  ws.columns = headers.map((h, i) => ({
    header: h,
    key: `c${i}`,
    width: i < maxLevel ? 45 : i === maxLevel ? 14 : 18
  }));

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.font = {bold: true, size: 11};
  headerRow.alignment = {vertical: "middle"};

  // Add data rows
  for (const {cells, level} of dataRows) {
    const row = ws.addRow(cells);
    row.outlineLevel = level - 1; // level 1 → outline 0 (always visible)
    row.font = fontForLevel(level);

    // Number format for value columns (after level columns + Code)
    for (let c = maxLevel + 2; c <= headers.length; c++) {
      row.getCell(c).numFmt = '#,##0.######';
    }
  }

  // Write to buffer and trigger download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
