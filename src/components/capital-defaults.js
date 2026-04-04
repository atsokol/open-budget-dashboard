// Shared helpers for computing default capital adjustment code lists.
// Used by adjustments.md, current-surplus.md, and comparison.md.

export function categorize(code, cats) {
  const n = Number(code);
  for (const c of cats) if (n <= c.breakEnd) return c.name;
  return null;
}

// Returns all leaf/present income codes that fall under "Capital revenues".
// inck_prep    — classificator table (objects with {code, level})
// presentCodes — iterable of income codes present in actual data
// summaryIncomeCategories — from cfg.summaryIncomeCategories
export function defaultCapitalIncomeCodes(inck_prep, presentCodes, summaryIncomeCategories) {
  return [...new Set([
    ...inck_prep.filter(d => d.level > 0).map(d => d.code),
    ...[...presentCodes]
  ].filter(code => categorize(code, summaryIncomeCategories) === "Capital revenues"))];
}

// Returns all KEKV leaf codes that fall under "Capital expenditures".
// kek_prep    — classificator table (objects with {code, level})
// summaryExpenseCategories — from cfg.summaryExpenseCategories
export function defaultCapitalExpenseCodes(kek_prep, summaryExpenseCategories) {
  return kek_prep
    .filter(d => d.level > 0 && categorize(d.code, summaryExpenseCategories) === "Capital expenditures")
    .map(d => d.code);
}
