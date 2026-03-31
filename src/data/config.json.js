// Data loader: Configuration
// Converts config.yaml to JSON for dashboard consumption

import * as fs from "fs";
import * as yaml from "js-yaml";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const configPath = path.join(__dirname, "../../config.yaml");
const configYaml = fs.readFileSync(configPath, "utf8");
const config = yaml.load(configYaml);

// ── Hierarchy derivation ──────────────────────────────────────────────────────

// Run-length encode a name field over the ordered model category list into a flat breakEnd array.
// Result: categorize(code, derived) correctly maps codes using the first matching breakEnd.
function deriveCategories(modelCats, nameFn) {
  const result = [];
  for (const entry of modelCats) {
    const name = nameFn(entry);
    const last = result[result.length - 1];
    if (last && last.name === name) {
      last.breakEnd = entry.breakEnd;
    } else {
      result.push({ name, breakEnd: entry.breakEnd });
    }
  }
  return result;
}

// Summary (fiscal group) level: grandparent ?? parent — used by adjustments to detect capital codes.
function deriveSummaryCategories(modelCats) {
  return deriveCategories(modelCats, e => e.grandparent || e.parent);
}

// Display level: parent — produces named sub-rows (Interest received, Sale of assets, etc.).
function deriveDisplayCategories(modelCats) {
  return deriveCategories(modelCats, e => e.parent);
}

// Build a hierarchy index: { summaryName: [modelName, ...] } with unique ordered model names.
function buildHierarchyIndex(modelCats) {
  const index = new Map();
  for (const e of modelCats) {
    if (!index.has(e.parent)) index.set(e.parent, []);
    const arr = index.get(e.parent);
    if (!arr.includes(e.name)) arr.push(e.name);
  }
  return Object.fromEntries(index);
}

// Strip the parent field for backward-compatible model category lists.
function stripParent(cats) {
  return cats.map(({ name, breakEnd }) => ({ name, breakEnd }));
}

// ── Validate ──────────────────────────────────────────────────────────────────

const modelIncomeCats  = config.model_income_categories;
const modelExpenseCats = config.model_expense_categories;

for (const e of modelIncomeCats) {
  if (!e.parent) throw new Error(`model_income_categories entry missing parent: ${JSON.stringify(e)}`);
}
for (const e of modelExpenseCats) {
  if (!e.parent) throw new Error(`model_expense_categories entry missing parent: ${JSON.stringify(e)}`);
}

// ── Build result ──────────────────────────────────────────────────────────────

const result = {
  // Model-level (detail) — backward-compatible, parent field stripped
  modelIncomeCategories:      stripParent(modelIncomeCats),
  modelExpenseCategories:     stripParent(modelExpenseCats),

  // Summary-level — derived from model (eliminates the old manual summary_* lists)
  summaryIncomeCategories:    deriveSummaryCategories(modelIncomeCats),
  summaryExpenseCategories:   deriveSummaryCategories(modelExpenseCats),

  // Display-level — like summary but uses display_parent where set, creating named sub-rows
  displayIncomeCategories:    deriveDisplayCategories(modelIncomeCats),

  // Annotated model lists — include parent field for per-row hierarchy lookups
  annotatedIncomeCategories:  modelIncomeCats,
  annotatedExpenseCategories: modelExpenseCats,

  // Hierarchy index: summaryName -> [modelName, ...]
  incomeHierarchy:            buildHierarchyIndex(modelIncomeCats),
  expenseHierarchy:           buildHierarchyIndex(modelExpenseCats),

  reverseSubsidyFkvCode:      config.reverse_subsidy_fkv_code,
  financingCodes:             config.financing_codes,
  cashCodes:                  config.cash_codes,
  summaryTotals:              config.summary_totals,
  summaryRowOrder:            config.summary_row_order,
  colors:                     config.colors
};

process.stdout.write(JSON.stringify(result));
