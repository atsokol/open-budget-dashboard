// Classificator gap analysis script
// Checks all active KDB/KEKV codes are covered by the model categories in config.yaml.
// Also validates that derived summary lists match expectations.
//
// Run with: node src/data/validate-classificators.js

import * as fs from "fs";
import * as yaml from "js-yaml";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");

const config = yaml.load(fs.readFileSync(path.join(root, "config.yaml"), "utf8"));
const kdb  = JSON.parse(fs.readFileSync(path.join(__dirname, "classificators/KDB.json"),  "utf8"));
const kekv = JSON.parse(fs.readFileSync(path.join(__dirname, "classificators/KEKV.json"), "utf8"));

function categorize(code, cats) {
  for (const cat of cats) {
    if (code <= cat.breakEnd) return cat.name;
  }
  return null;
}

function deriveSummaryCategories(modelCats) {
  const result = [];
  for (const entry of modelCats) {
    const last = result[result.length - 1];
    if (last && last.name === entry.parent) {
      last.breakEnd = entry.breakEnd;
    } else {
      result.push({ name: entry.parent, breakEnd: entry.breakEnd });
    }
  }
  return result;
}

// ── Print derived summary lists ───────────────────────────────────────────────

const modelInc = config.model_income_categories;
const modelExp = config.model_expense_categories;
const derivedIncSummary = deriveSummaryCategories(modelInc);
const derivedExpSummary = deriveSummaryCategories(modelExp);

console.log("\n=== Derived summary_income_categories ===");
for (const e of derivedIncSummary) {
  console.log(`  {name: "${e.name}", breakEnd: ${e.breakEnd}}`);
}

console.log("\n=== Derived summary_expense_categories ===");
for (const e of derivedExpSummary) {
  console.log(`  {name: "${e.name}", breakEnd: ${e.breakEnd}}`);
}

// ── Income hierarchy index ────────────────────────────────────────────────────

console.log("\n=== Income hierarchy (summary → model) ===");
const incHierarchy = new Map();
for (const e of modelInc) {
  if (!incHierarchy.has(e.parent)) incHierarchy.set(e.parent, new Set());
  incHierarchy.get(e.parent).add(e.name);
}
for (const [parent, children] of incHierarchy) {
  console.log(`  ${parent}:`);
  for (const child of children) console.log(`    - ${child}`);
}

console.log("\n=== Expense hierarchy (summary → model) ===");
const expHierarchy = new Map();
for (const e of modelExp) {
  if (!expHierarchy.has(e.parent)) expHierarchy.set(e.parent, new Set());
  expHierarchy.get(e.parent).add(e.name);
}
for (const [parent, children] of expHierarchy) {
  console.log(`  ${parent}:`);
  for (const child of children) console.log(`    - ${child}`);
}

// ── Coverage check ────────────────────────────────────────────────────────────

function checkCoverage(classifier, modelCats, label) {
  const active = classifier.filter(d => d.isactive === 1 || d.isactive === undefined);
  const uncovered = active.filter(d => categorize(Number(d.code), modelCats) === null);

  console.log(`\n=== ${label} ===`);
  console.log(`Active entries: ${active.length}`);
  console.log(`Uncovered:      ${uncovered.length}`);

  if (uncovered.length > 0) {
    console.log("Uncovered codes:");
    for (const d of uncovered) {
      console.log(`  code=${d.code}  level=${d.level}  name=${String(d.name).slice(0, 70)}`);
    }
  }

  const byModel = new Map();
  for (const d of active) {
    const cat = categorize(Number(d.code), modelCats) ?? "(uncovered)";
    byModel.set(cat, (byModel.get(cat) ?? 0) + 1);
  }
  console.log("Coverage by model category:");
  for (const [cat, count] of [...byModel.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${cat}: ${count}`);
  }
}

// Strip parent field for the categorize() call (backward-compatible)
const modelIncStripped = modelInc.map(({ name, breakEnd }) => ({ name, breakEnd }));
const modelExpStripped = modelExp.map(({ name, breakEnd }) => ({ name, breakEnd }));

checkCoverage(kdb,  modelIncStripped, "KDB  (income)  vs model_income_categories");
checkCoverage(kekv, modelExpStripped, "KEKV (expense) vs model_expense_categories");

console.log("\nDone.");
