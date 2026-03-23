---
title: Financial Summary
toc: false
---

# Financial Summary

High-level financial summary table with plan vs actual figures.

```js
import * as d3 from "npm:d3";
import * as aq from "npm:arquero";
import {buildCombiTable} from "./components/combi-tree.js";

const inck_raw = await FileAttachment("data/classificators/KDB.json").json();
const kek_raw  = await FileAttachment("data/classificators/KEKV.json").json();

const incomes = await FileAttachment("data/incomes.parquet").parquet()
  .then(t => [...t].map(r => ({
    CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
    FUND_TYP: r.FUND_TYP, COD_INCO: Number(r.COD_INCO), NAME_INC: r.NAME_INC,
    ZAT_AMT: r.ZAT_AMT, PLANS_AMT: r.PLANS_AMT, FAKT_AMT: r.FAKT_AMT
  })));

const expenses_econ = await FileAttachment("data/expenses.parquet").parquet()
  .then(t => [...t].map(r => ({
    CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
    FUND_TYP: r.FUND_TYP, COD_CONS_EK: Number(r.COD_CONS_EK),
    ZAT_AMT: r.ZAT_AMT, PLANS_AMT: r.PLANS_AMT, FAKT_AMT: r.FAKT_AMT
  })));

const expenses_func = await FileAttachment("data/expenses-functional.parquet").parquet()
  .then(t => [...t].map(r => ({
    CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
    FUND_TYP: r.FUND_TYP, COD_CONS_MB_FK: Number(r.COD_CONS_MB_FK),
    ZAT_AMT: r.ZAT_AMT, PLANS_AMT: r.PLANS_AMT, FAKT_AMT: r.FAKT_AMT
  })));

const debts = await FileAttachment("data/debts.parquet").parquet()
  .then(t => [...t].map(r => ({
    ...r,
    REP_PERIOD: new Date(r.REP_PERIOD),
    COD_FINA: r.COD_FINA != null ? Number(r.COD_FINA) : null
  })));

const credits = await FileAttachment("data/credits.parquet").parquet()
  .then(t => [...t].map(r => ({
    ...r,
    REP_PERIOD: new Date(r.REP_PERIOD)
  })));
```

```js
function prepClassificator(raw, rootName) {
  return [
    {code: 0, parentCode: null, name: rootName, level: 0},
    ...Array.from(new Map(
      raw.filter(d => d.dateto == null)
         .map(d => ({code: +d.code, parentCode: d.parentCode ? +d.parentCode : 0, name: d.name, level: d.level}))
         .map(d => [d.code, d])
    ).values()).sort((a, b) => a.code - b.code)
  ];
}
const inck_prep = prepClassificator(inck_raw, "Загальні доходи");
const kek_prep  = prepClassificator(kek_raw,  "Загальні видатки");

// Capital codes from localStorage (set on Capital Adjustments page)
const defaultCapIncCodes = [30000000, 42000000, 21050000, 24110000, 21010500, 21010700, 21010800, 21010900];
const defaultCapExpCodes = [2281, 3000];

function getDescendants(code, flatData) {
  const codes = [code];
  flatData.filter(d => d.parentCode === code).forEach(c => codes.push(...getDescendants(c.code, flatData)));
  return codes;
}
function expandCodes(parentCodes, flatData) {
  const s = new Set();
  parentCodes.forEach(pc => { if (flatData.find(d => d.code === pc)) getDescendants(pc, flatData).forEach(c => s.add(c)); });
  return [...s];
}

const capitalIncomeCodesArr = (() => {
  try { const s = localStorage.getItem("capitalIncomeCodes"); return s ? JSON.parse(s) : expandCodes(defaultCapIncCodes, inck_prep); }
  catch { return expandCodes(defaultCapIncCodes, inck_prep); }
})();
const capitalExpenseCodesArr = (() => {
  try { const s = localStorage.getItem("capitalExpenseCodes"); return s ? JSON.parse(s) : expandCodes(defaultCapExpCodes, kek_prep); }
  catch { return expandCodes(defaultCapExpCodes, kek_prep); }
})();
const capIncSet = new Set(capitalIncomeCodesArr);
const capExpSet = new Set(capitalExpenseCodesArr);

const combi_table = buildCombiTable(inck_prep, kek_prep, capIncSet);

const cityNames = [...new Set(incomes.map(d => d.CITY))].sort();
const availableYears = [...new Set(incomes.map(d => d.REP_PERIOD.getUTCFullYear()))].sort();
```

```js
const params = new URLSearchParams(location.search);
const initialCity     = params.get("city") ?? localStorage.getItem("selectedCity") ?? "Cherkasy";
const initialYearTo   = +(params.get("yearTo")   ?? Math.max(...availableYears));
const initialYearFrom = +(params.get("yearFrom") ?? Math.min(...availableYears));
const initialPeriod   = params.get("period")     ?? "Latest";
```

<div class="grid grid-cols-4" style="gap: 0.5rem; margin-bottom: 1rem;">
<div>

```js
const selectCity = view(Inputs.select(cityNames, {label: "City", value: initialCity}));
```

</div>
<div>

```js
const yearFrom = view(Inputs.select(availableYears, {
  label: "Year from", value: initialYearFrom, format: d => d.toString()
}));
```

</div>
<div>

```js
const yearTo = view(Inputs.select(availableYears, {
  label: "Year to", value: initialYearTo, format: d => d.toString()
}));
```

</div>
<div>

```js
const selectPeriod = view(Inputs.select(["Latest", "3m", "6m", "9m", "FY"], {
  label: "Period", value: initialPeriod
}));
```

</div>
</div>

```js
{
  const p = new URLSearchParams(location.search);
  p.set("city", selectCity); p.set("yearTo", yearTo); p.set("yearFrom", yearFrom); p.set("period", selectPeriod);
  history.replaceState(null, "", "?" + p.toString());
  localStorage.setItem("selectedCity", selectCity);
}
```

```js
// Resolve effective month from period selector (matching R logic)
const month_max_avail = Math.max(...incomes
  .filter(d => d.REP_PERIOD.getUTCFullYear() === yearTo)
  .map(d => d.REP_PERIOD.getUTCMonth() + 1), 0);

function periodToMonth(period) {
  if (period === "3m") return 3;
  if (period === "6m") return 6;
  if (period === "9m") return 9;
  if (period === "FY") return 12;
  return month_max_avail; // "Latest"
}

const effectiveMonth = periodToMonth(selectPeriod);
const periodLabel = effectiveMonth === 12 ? "FY" : `${effectiveMonth}m`;

// Build column specs: full-year for older years, chosen period for last two
// Each column: { year, month (cutoff), key (unique id), label }
const columns = [];
const allYears = d3.range(yearFrom, yearTo + 1);

if (effectiveMonth === 12) {
  // FY mode: all years are full-year
  for (const y of allYears) {
    columns.push({ year: y, month: 12, key: `${y}`, label: `${y}` });
  }
} else {
  // Period mode: full years up to yearTo-2, FY + period for yearTo-1, period for yearTo
  for (const y of allYears) {
    if (y <= yearTo - 2) {
      columns.push({ year: y, month: 12, key: `FY_${y}`, label: `${y}` });
    } else if (y === yearTo - 1) {
      columns.push({ year: y, month: 12, key: `FY_${y}`, label: `${y}` });
      columns.push({ year: y, month: effectiveMonth, key: `${effectiveMonth}m_${y}`, label: `${effectiveMonth}m ${y}` });
    } else {
      columns.push({ year: y, month: effectiveMonth, key: `${effectiveMonth}m_${y}`, label: `${effectiveMonth}m ${y}` });
    }
  }
}

function aggregateByColumns(incData, expData, city, cols, combi) {
  const tree = d3.stratify()
    .id(d => d.code)
    .parentId(d => d.parentCode)
    (combi);

  const topLevel = tree.children || [];

  return topLevel.map(node => {
    const leafCodes = node.descendants().map(d => +d.data.code);
    const isIncome = node.data.code >= 100000000;
    const codeField = isIncome ? "COD_INCO" : "COD_CONS_EK";

    const actuals = {};
    for (const col of cols) {
      const src = isIncome ? incData : expData;
      const val = src
        .filter(d => d.CITY === city && d.REP_PERIOD.getUTCFullYear() === col.year
                  && d.REP_PERIOD.getUTCMonth() === col.month - 1 && d.FUND_TYP === "T"
                  && leafCodes.includes(d[codeField]))
        .reduce((s, d) => s + (d.FAKT_AMT || 0), 0) / 1e6;
      actuals[col.key] = Math.round(val * 10) / 10;
    }
    return { name: node.data.name, isIncome, actuals };
  });
}

const summaryRows = aggregateByColumns(incomes, expenses_econ, selectCity, columns, combi_table);

// Aggregate budget (plan) for yearTo using latest available month
const budgetMonth = Math.max(...incomes
  .filter(d => d.CITY === selectCity && d.REP_PERIOD.getUTCFullYear() === yearTo)
  .map(d => d.REP_PERIOD.getUTCMonth()), -1);

function aggregateBudget(incData, expData, city, combi) {
  const tree = d3.stratify().id(d => d.code).parentId(d => d.parentCode)(combi);
  const topLevel = tree.children || [];
  return topLevel.map(node => {
    const leafCodes = node.descendants().map(d => +d.data.code);
    const isIncome = node.data.code >= 100000000;
    const codeField = isIncome ? "COD_INCO" : "COD_CONS_EK";
    const src = isIncome ? incData : expData;
    const val = src
      .filter(d => d.CITY === city && d.REP_PERIOD.getUTCFullYear() === yearTo
                && d.REP_PERIOD.getUTCMonth() === budgetMonth && d.FUND_TYP === "T"
                && leafCodes.includes(d[codeField]))
      .reduce((s, d) => s + (d.PLANS_AMT || 0), 0) / 1e6;
    return { name: node.data.name, isIncome, budget: Math.round(val * 10) / 10 };
  });
}
const budgetRows = budgetMonth >= 0 ? aggregateBudget(incomes, expenses_econ, selectCity, combi_table) : [];
const budgetMap = new Map(budgetRows.map(r => [r.name, r.budget]));

// Compute totals per column
const totalsInc = {}, totalsExp = {}, surplus = {};
for (const col of columns) {
  totalsInc[col.key] = Math.round(summaryRows.filter(r => r.isIncome).reduce((s, r) => s + r.actuals[col.key], 0) * 10) / 10;
  totalsExp[col.key] = Math.round(summaryRows.filter(r => !r.isIncome).reduce((s, r) => s + r.actuals[col.key], 0) * 10) / 10;
  surplus[col.key]   = Math.round((totalsInc[col.key] - totalsExp[col.key]) * 10) / 10;
}

const budgetTotInc = Math.round(budgetRows.filter(r => r.isIncome).reduce((s, r) => s + r.budget, 0) * 10) / 10;
const budgetTotExp = Math.round(budgetRows.filter(r => !r.isIncome).reduce((s, r) => s + r.budget, 0) * 10) / 10;
const budgetSurplus = Math.round((budgetTotInc - budgetTotExp) * 10) / 10;
const hasBudget = budgetMonth >= 0;

// Compute capital amounts per column using localStorage capital codes
const capitalIncTotals = {}, capitalExpTotals = {}, currentSurplus = {};
for (const col of columns) {
  capitalIncTotals[col.key] = Math.round(incomes
    .filter(d => d.CITY === selectCity && d.REP_PERIOD.getUTCFullYear() === col.year
              && d.REP_PERIOD.getUTCMonth() === col.month - 1 && d.FUND_TYP === "T"
              && capIncSet.has(d.COD_INCO))
    .reduce((s, d) => s + (d.FAKT_AMT || 0), 0) / 1e6 * 10) / 10;

  capitalExpTotals[col.key] = Math.round(expenses_econ
    .filter(d => d.CITY === selectCity && d.REP_PERIOD.getUTCFullYear() === col.year
              && d.REP_PERIOD.getUTCMonth() === col.month - 1 && d.FUND_TYP === "T"
              && capExpSet.has(d.COD_CONS_EK))
    .reduce((s, d) => s + (d.FAKT_AMT || 0), 0) / 1e6 * 10) / 10;

  currentSurplus[col.key] = Math.round(
    ((totalsInc[col.key] - capitalIncTotals[col.key]) - (totalsExp[col.key] - capitalExpTotals[col.key])) * 10
  ) / 10;
}

const budgetCapInc = budgetMonth >= 0 ? Math.round(incomes
  .filter(d => d.CITY === selectCity && d.REP_PERIOD.getUTCFullYear() === yearTo
            && d.REP_PERIOD.getUTCMonth() === budgetMonth && d.FUND_TYP === "T"
            && capIncSet.has(d.COD_INCO))
  .reduce((s, d) => s + (d.PLANS_AMT || 0), 0) / 1e6 * 10) / 10 : 0;

const budgetCapExp = budgetMonth >= 0 ? Math.round(expenses_econ
  .filter(d => d.CITY === selectCity && d.REP_PERIOD.getUTCFullYear() === yearTo
            && d.REP_PERIOD.getUTCMonth() === budgetMonth && d.FUND_TYP === "T"
            && capExpSet.has(d.COD_CONS_EK))
  .reduce((s, d) => s + (d.PLANS_AMT || 0), 0) / 1e6 * 10) / 10 : 0;

const budgetCurrentSurplus = Math.round(
  ((budgetTotInc - budgetCapInc) - (budgetTotExp - budgetCapExp)) * 10
) / 10;
```

## ${selectCity}

```js
const dlButton = view(Inputs.button("Download XLSX", {reduce: downloadXlsx}));
```

```js
const fmt0 = d3.format(",.0f");

const incomeRows = summaryRows.filter(r => r.isIncome);
const expenseRows = summaryRows.filter(r => !r.isIncome);

const nCols = 1 + columns.length + (hasBudget ? 1 : 0);

const tableData = [
  {name: "── INCOME ──", isHeader: true},
  ...incomeRows.map(r => ({...r, sign: 1})),
  {name: "Total Income", isSubtotal: true, actuals: totalsInc, budget: budgetTotInc},
  {name: "── EXPENSES ──", isHeader: true},
  ...expenseRows.map(r => ({...r, sign: -1})),
  {name: "Total Expenses", isSubtotal: true, actuals: totalsExp, budget: budgetTotExp},
  {name: "Current Surplus", isTotal: true, actuals: currentSurplus, budget: budgetCurrentSurplus},
  {name: "Total Surplus", isTotal: true, actuals: surplus, budget: budgetSurplus}
];

const colStyle = "text-align:right; padding: 0 8px; min-width:80px";
const headerStyle = "background:var(--theme-foreground-faintest); font-weight:600; padding: 4px 8px";

display(html`<table style="width:100%; border-collapse:collapse; font-size:14px; font-variant-numeric:tabular-nums">
  <thead>
    <tr style="border-bottom:2px solid var(--theme-foreground-faint)">
      <th style="text-align:left; padding:4px 8px">Category</th>
      ${columns.map(c => html`<th style="${colStyle}">${c.label}</th>`)}
      ${hasBudget ? html`<th style="${colStyle}">Budget ${yearTo}</th>` : ""}
    </tr>
  </thead>
  <tbody>
    ${tableData.map(r => {
      if (r.isHeader) return html`<tr><td colspan="${nCols}" style="${headerStyle}">${r.name}</td></tr>`;
      const bv = r.budget != null ? r.budget : (budgetMap.get(r.name) ?? 0);
      const rowStyle = r.isTotal
        ? "font-weight:700; border-top:2px solid var(--theme-foreground-faint)"
        : r.isSubtotal
        ? "font-weight:600; border-top:1px solid var(--theme-foreground-faint)"
        : "";
      return html`<tr style="border-bottom:1px solid var(--theme-foreground-faintest); ${rowStyle}">
        <td style="padding:4px 8px">${r.name}</td>
        ${columns.map(c => html`<td style="${colStyle}">${fmt0(r.actuals[c.key])}</td>`)}
        ${hasBudget ? html`<td style="${colStyle}">${fmt0(bv)}</td>` : ""}
      </tr>`;
    })}
  </tbody>
</table>
<p style="color:var(--theme-foreground-muted); font-size:12px; margin-top:8px">Values in million UAH.</p>`);
```

```js
const xlsx = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs");

// --- Summary sheet: mirrors the on-screen table ---
const downloadData = tableData
  .filter(r => !r.isHeader)
  .map(r => {
    const obj = {"Category": r.name};
    for (const c of columns) {
      obj[`${c.label} (mln UAH)`] = r.actuals[c.key];
    }
    if (hasBudget) {
      const bv = r.budget != null ? r.budget : (budgetMap.get(r.name) ?? 0);
      obj[`Budget ${yearTo} (mln UAH)`] = bv;
    }
    return obj;
  });

// --- Financial Analysis sheet (ported from data_table_summarise.R) ---
function buildFinancialAnalysis(rows, cols) {
  const v = (name, colKey) => {
    const r = rows.find(r => r.name === name);
    return r ? (r.actuals[colKey] || 0) : 0;
  };
  const line = (type, cat, calcFn) => {
    const obj = {"Type": type, "Category": cat};
    for (const c of cols) {
      obj[c.label] = Math.round(calcFn(c.key) * 10) / 10;
    }
    return obj;
  };
  const tax    = k => v("Tax revenues", k);
  const nontax = k => v("Non-tax revenues", k);
  const trans  = k => v("Incoming Transfers", k);
  const staff  = k => v("Staff costs", k);
  const mat    = k => v("Purchase of materials", k);
  const disc   = k => v("Discretionary expenditures", k);
  const util   = k => v("Utility payments", k);
  const out    = k => v("Outgoing transfers", k);
  const int_   = k => v("Interest paid", k);
  // Use capital amounts from localStorage codes
  const currRev    = k => totalsInc[k] - capitalIncTotals[k];
  const opex       = k => staff(k) + mat(k) + disc(k) + util(k) + out(k);
  const opSurp     = k => currRev(k) - opex(k);
  const currSurp   = k => opSurp(k) - int_(k);
  const capSurp    = k => capitalIncTotals[k] - capitalExpTotals[k];
  const netSurp    = k => currSurp(k) + capSurp(k);
  return [
    line("Tax",               "Income",  tax),
    line("Non-tax",           "Income",  nontax),
    line("Transfers",         "Income",  trans),
    line("Current revenues",  "Total",   currRev),
    line("Opex",              "Expense", opex),
    line("Operating surplus", "Total",   opSurp),
    line("Interest",          "Expense", int_),
    line("Current surplus",   "Total",   currSurp),
    line("Capital revenues",  "Income",  k => capitalIncTotals[k]),
    line("Capex",             "Expense", k => capitalExpTotals[k]),
    line("Capital surplus",   "Total",   capSurp),
    line("Net surplus",       "Total",   netSurp),
  ];
}
const analysisData = buildFinancialAnalysis(summaryRows, columns);

// --- Primary data sheets (like R file's INCOMES/EXPENSES/DEBTS/CREDITS output) ---
// Include rows matching any column's year/month cutoff
// A year can have multiple cutoffs (e.g. FY + period for penultimate year)
const colMonths = new Map();
for (const c of columns) {
  if (!colMonths.has(c.year)) colMonths.set(c.year, new Set());
  colMonths.get(c.year).add(c.month);
}

function filterPrimary(data) {
  return data.filter(d => {
    const y = d.REP_PERIOD.getUTCFullYear();
    const months = colMonths.get(y);
    return d.CITY === selectCity && months != null && d.FUND_TYP === "T"
      && months.has(d.REP_PERIOD.getUTCMonth() + 1);
  });
}

const primaryIncomes = filterPrimary(incomes).map(d => ({
  CITY: d.CITY,
  REP_PERIOD: d.REP_PERIOD.toISOString().slice(0, 10),
  COD_INCO: d.COD_INCO,
  NAME_INC: d.NAME_INC,
  ZAT_AMT: d.ZAT_AMT,
  PLANS_AMT: d.PLANS_AMT,
  FAKT_AMT: d.FAKT_AMT
}));

const primaryExpensesEcon = filterPrimary(expenses_econ).map(d => ({
  CITY: d.CITY,
  REP_PERIOD: d.REP_PERIOD.toISOString().slice(0, 10),
  COD_CONS_EK: d.COD_CONS_EK,
  ZAT_AMT: d.ZAT_AMT,
  PLANS_AMT: d.PLANS_AMT,
  FAKT_AMT: d.FAKT_AMT
}));

const primaryExpensesFunc = filterPrimary(expenses_func).map(d => ({
  CITY: d.CITY,
  REP_PERIOD: d.REP_PERIOD.toISOString().slice(0, 10),
  COD_CONS_MB_FK: d.COD_CONS_MB_FK,
  ZAT_AMT: d.ZAT_AMT,
  PLANS_AMT: d.PLANS_AMT,
  FAKT_AMT: d.FAKT_AMT
}));

const primaryDebts = filterPrimary(debts).map(d => {
  const row = {...d};
  row.REP_PERIOD = d.REP_PERIOD.toISOString().slice(0, 10);
  return row;
});

const primaryCredits = filterPrimary(credits).map(d => {
  const row = {...d};
  row.REP_PERIOD = d.REP_PERIOD.toISOString().slice(0, 10);
  return row;
});

function downloadXlsx() {
  const ws1 = xlsx.utils.json_to_sheet(downloadData);
  const ws2 = xlsx.utils.json_to_sheet(analysisData);
  const ws3 = xlsx.utils.json_to_sheet(primaryIncomes);
  const ws4 = xlsx.utils.json_to_sheet(primaryExpensesEcon);
  const ws5 = xlsx.utils.json_to_sheet(primaryExpensesFunc);
  const ws6 = xlsx.utils.json_to_sheet(primaryDebts);
  const ws7 = xlsx.utils.json_to_sheet(primaryCredits);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws1, "Summary");
  xlsx.utils.book_append_sheet(wb, ws2, "Financial Analysis");
  xlsx.utils.book_append_sheet(wb, ws3, "Incomes");
  xlsx.utils.book_append_sheet(wb, ws4, "Expenses (Economic)");
  xlsx.utils.book_append_sheet(wb, ws5, "Expenses (Functional)");
  xlsx.utils.book_append_sheet(wb, ws6, "Debts");
  xlsx.utils.book_append_sheet(wb, ws7, "Credits");
  xlsx.writeFile(wb, `budget-summary-${selectCity}-${periodLabel}-${yearFrom}-${yearTo}.xlsx`);
}
```
