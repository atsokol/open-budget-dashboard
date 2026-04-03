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
import {get_treetab_diff} from "./components/icicle.js";

const [inck_raw, kek_raw, fkv_raw, incomes, expenses_econ, expenses_func, reverse_subsidy, debts, credits] = await Promise.all([
  FileAttachment("data/classificators/KDB.json").json(),
  FileAttachment("data/classificators/KEKV.json").json(),
  FileAttachment("data/classificators/FKV.json").json(),
  FileAttachment("data/incomes.arrow").arrow()
    .then(t => [...t].map(r => ({
      CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
      FUND_TYP: r.FUND_TYP, COD_INCO: Number(r.COD_INCO), NAME_INC: r.NAME_INC,
      ZAT_AMT: r.ZAT_AMT, PLANS_AMT: r.PLANS_AMT, FAKT_AMT: r.FAKT_AMT
    }))),
  FileAttachment("data/expenses.arrow").arrow()
    .then(t => [...t].map(r => ({
      CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
      FUND_TYP: r.FUND_TYP, COD_CONS_EK: Number(r.COD_CONS_EK),
      ZAT_AMT: r.ZAT_AMT, PLANS_AMT: r.PLANS_AMT, FAKT_AMT: r.FAKT_AMT
    }))),
  FileAttachment("data/expenses-functional.arrow").arrow()
    .then(t => [...t].map(r => ({
      CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
      FUND_TYP: r.FUND_TYP, COD_CONS_MB_FK: Number(r.COD_CONS_MB_FK),
      ZAT_AMT: r.ZAT_AMT, PLANS_AMT: r.PLANS_AMT, FAKT_AMT: r.FAKT_AMT
    }))),
  FileAttachment("data/reverse-subsidy.arrow").arrow()
    .then(t => [...t].map(r => ({
      CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
      FUND_TYP: r.FUND_TYP, COD_CONS_MB_PK: Number(r.COD_CONS_MB_PK), COD_CONS_MB_PK_NAME: r.COD_CONS_MB_PK_NAME,
      ZAT_AMT: r.ZAT_AMT, PLANS_AMT: r.PLANS_AMT, FAKT_AMT: r.FAKT_AMT
    }))),
  FileAttachment("data/debts.arrow").arrow()
    .then(t => [...t].map(r => ({
      CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD), FUND_TYP: r.FUND_TYP,
      COD_BUDGET: r.COD_BUDGET, COD_FINA: r.COD_FINA != null ? Number(r.COD_FINA) : null,
      NAME_FIN: r.NAME_FIN, ZAT_AMT: r.ZAT_AMT, FAKT_AMT: r.FAKT_AMT
    }))),
  FileAttachment("data/credits.arrow").arrow()
    .then(t => [...t].map(r => ({
      CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD), FUND_TYP: r.FUND_TYP,
      COD_BUDGET: r.COD_BUDGET, ZAT_AMT: r.ZAT_AMT, PLANS_AMT: r.PLANS_AMT, FAKT_AMT: r.FAKT_AMT
    })))
]);
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
const fkv_prep  = prepClassificator(fkv_raw,  "Загальні видатки");

const inckNameByCode = new Map(inck_prep.map(d => [d.code, d.name]));
const kekNameByCode  = new Map(kek_prep.map(d => [d.code, d.name]));
const fkvNameByCode  = new Map(fkv_prep.map(d => [d.code, d.name]));

// Category definitions loaded from config.yaml
const cfg = await FileAttachment("data/config.json").json();
const updateIncCat  = cfg.summaryIncomeCategories;
const updateExpCat  = cfg.summaryExpenseCategories;
const modelIncCat   = cfg.modelIncomeCategories;
const modelExpCat  = cfg.modelExpenseCategories;
const financingCodeMap = Object.fromEntries(Object.entries(cfg.financingCodes).map(([k,v]) => [Number(k), v]));
const cashCodeMap      = Object.fromEntries(Object.entries(cfg.cashCodes).map(([k,v]) => [Number(k), v]));
const summaryTotals          = cfg.summaryTotals;
const summaryRowOrder        = cfg.summaryRowOrder;

function categorize(code, cats) {
  for (const cat of cats) {
    if (code <= cat.breakEnd) return cat.name;
  }
  return null;
}

// Capital codes: defaults derived from config range rules applied to both KDB classificator codes
// and actual transaction codes — ensures codes like Target funds (absent from KDB due to dateto)
// are still classified as capital if they fall in a Capital revenues range.
const defaultCapIncCodes = [...new Set([
  ...inck_prep.filter(d => d.level > 0).map(d => d.code),
  ...incomes.map(d => d.COD_INCO)
].filter(code => categorize(code, updateIncCat) === "Capital revenues"))];
const defaultCapExpCodes = kek_prep.filter(d => d.level > 0 && categorize(d.code, updateExpCat) === "Capital expenditures").map(d => d.code);
const capIncSet = new Set((() => {
  try { const s = localStorage.getItem("capitalIncomeCodes"); return s ? JSON.parse(s) : defaultCapIncCodes; }
  catch { return defaultCapIncCodes; }
})());
const capExpSet = new Set((() => {
  try { const s = localStorage.getItem("capitalExpenseCodes"); return s ? JSON.parse(s) : defaultCapExpCodes; }
  catch { return defaultCapExpCodes; }
})());

const adjCatCodes = capIncSet;

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

const budgetMonth = Math.max(...incomes
  .filter(d => d.CITY === selectCity && d.REP_PERIOD.getUTCFullYear() === yearTo)
  .map(d => d.REP_PERIOD.getUTCMonth()), -1);
const hasBudget = budgetMonth >= 0;

// Aggregate data by cut-based categories, returning [{TYPE, CAT, actuals:{colKey:val}, budget}]
// naturalCats: optional summary-level catDefs used to guard adjCodes overrides.
// When provided, the adjLabel override only fires if the display type (from catDefs) matches
// the natural summary type — preventing named display sub-categories (e.g. "Interest received")
// from being collapsed back into the adjLabel group.

function aggByCut(data, codeField, catDefs, city, cols, adjCodes, adjLabel, naturalCats) {
  const filtered = data.filter(d => d.CITY === city && d.FUND_TYP === "T");
  const typeSums = new Map();
  const typeBudgets = new Map();
  for (const d of filtered) {
    let type = categorize(d[codeField], catDefs);
    if (adjCodes && adjCodes.has(d[codeField])) {
      const naturalType = naturalCats ? categorize(d[codeField], naturalCats) : type;
      if (naturalType === type) type = adjLabel;
    }
    if (!type) continue;
    const year = d.REP_PERIOD.getUTCFullYear();
    const month = d.REP_PERIOD.getUTCMonth() + 1;
    for (const col of cols) {
      if (year === col.year && month === col.month) {
        if (!typeSums.has(type)) typeSums.set(type, {});
        const amt = col.isBudget ? (d.ZAT_AMT || 0) : (d.FAKT_AMT || 0);
        typeSums.get(type)[col.key] = (typeSums.get(type)[col.key] || 0) + amt / 1e6;
      }
    }
    if (year === yearTo && d.REP_PERIOD.getUTCMonth() === budgetMonth) {
      typeBudgets.set(type, (typeBudgets.get(type) || 0) + (d.ZAT_AMT || 0) / 1e6);
    }
  }
  return [...new Set([...typeSums.keys(), ...typeBudgets.keys()])].map(type => ({
    TYPE: type,
    actuals: Object.fromEntries(cols.map(c => [c.key, (typeSums.get(type) || {})[c.key] || 0])),
    budget: typeBudgets.get(type) || 0
  }));
}

function aggFinancing(debtsData, city, cols) {
  const codeMap = financingCodeMap;
  const filtered = debtsData.filter(d => d.CITY === city && d.FUND_TYP === "T" && codeMap[Number(d.COD_FINA)]);
  const typeSums = new Map();
  const typeBudgets = new Map();
  for (const d of filtered) {
    const type = codeMap[Number(d.COD_FINA)];
    const year = d.REP_PERIOD.getUTCFullYear();
    const month = d.REP_PERIOD.getUTCMonth() + 1;
    for (const col of cols) {
      if (year === col.year && month === col.month) {
        if (!typeSums.has(type)) typeSums.set(type, {});
        const amt = col.isBudget ? (d.ZAT_AMT || 0) : (d.FAKT_AMT || 0);
        typeSums.get(type)[col.key] = (typeSums.get(type)[col.key] || 0) + amt / 1e6;
      }
    }
    if (year === yearTo && d.REP_PERIOD.getUTCMonth() === budgetMonth) {
      typeBudgets.set(type, (typeBudgets.get(type) || 0) + (d.ZAT_AMT || 0) / 1e6);
    }
  }
  const allTypes = new Set([...Object.values(codeMap), ...typeSums.keys(), ...typeBudgets.keys()]);
  return [...allTypes].map(type => ({
    TYPE: type, CAT: "Financing",
    actuals: Object.fromEntries(cols.map(c => [c.key, (typeSums.get(type) || {})[c.key] || 0])),
    budget: typeBudgets.get(type) || 0
  }));
}

function aggCash(debtsData, city, cols) {
  const codeMap = cashCodeMap;
  const filtered = debtsData.filter(d => d.CITY === city && d.FUND_TYP === "T" && codeMap[Number(d.COD_FINA)]);
  const typeSums = new Map();
  const typeBudgets = new Map();
  for (const d of filtered) {
    const type = codeMap[Number(d.COD_FINA)];
    const year = d.REP_PERIOD.getUTCFullYear();
    const month = d.REP_PERIOD.getUTCMonth() + 1;
    for (const col of cols) {
      if (year === col.year && month === col.month) {
        if (!typeSums.has(type)) typeSums.set(type, {});
        const amt = col.isBudget ? Math.abs(d.ZAT_AMT || 0) : Math.abs(d.FAKT_AMT || 0);
        typeSums.get(type)[col.key] = (typeSums.get(type)[col.key] || 0) + amt / 1e6;
      }
    }
    if (year === yearTo && d.REP_PERIOD.getUTCMonth() === budgetMonth) {
      typeBudgets.set(type, (typeBudgets.get(type) || 0) + Math.abs(d.ZAT_AMT || 0) / 1e6);
    }
  }
  return [...new Set([...typeSums.keys(), ...typeBudgets.keys()])].map(type => ({
    TYPE: type, CAT: "Cash balance",
    actuals: Object.fromEntries(cols.map(c => [c.key, (typeSums.get(type) || {})[c.key] || 0])),
    budget: typeBudgets.get(type) || 0
  }));
}

function aggCredits(creditsData, city, cols) {
  const filtered = creditsData.filter(d => d.CITY === city && d.FUND_TYP === "T");
  const sums = Object.fromEntries(cols.map(c => [c.key, 0]));
  let budgetVal = 0;
  for (const d of filtered) {
    const year = d.REP_PERIOD.getUTCFullYear();
    const month = d.REP_PERIOD.getUTCMonth() + 1;
    for (const col of cols) {
      if (year === col.year && month === col.month) {
        sums[col.key] += (col.isBudget ? (d.ZAT_AMT || 0) : (d.FAKT_AMT || 0)) / 1e6;
      }
    }
    if (year === yearTo && d.REP_PERIOD.getUTCMonth() === budgetMonth) budgetVal += (d.ZAT_AMT || 0) / 1e6;
  }
  return [{
    TYPE: "Budget loans balance", CAT: "Loans",
    actuals: Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, -v])),
    budget: -budgetVal
  }];
}

function aggReverseSubsidy(expData, city, cols) {
  const filtered = expData.filter(d => d.CITY === city && d.FUND_TYP === "T");
  const sums = Object.fromEntries(cols.map(c => [c.key, 0]));
  let budgetVal = 0;
  for (const d of filtered) {
    const year = d.REP_PERIOD.getUTCFullYear();
    const month = d.REP_PERIOD.getUTCMonth() + 1;
    for (const col of cols) {
      if (year === col.year && month === col.month) {
        sums[col.key] += (col.isBudget ? (d.ZAT_AMT || 0) : (d.FAKT_AMT || 0)) / 1e6;
      }
    }
    if (year === yearTo && d.REP_PERIOD.getUTCMonth() === budgetMonth) budgetVal += (d.ZAT_AMT || 0) / 1e6;
  }
  return [{
    TYPE: "Reverse subsidy", CAT: "Expense",
    actuals: Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, -v])),
    budget: -budgetVal
  }];
}

// ── Financial Summary (SUMMARY_UPDATE matching R) ──
const incUpdate = aggByCut(incomes, "COD_INCO", updateIncCat, selectCity, columns, adjCatCodes, "Capital revenues", updateIncCat);
incUpdate.forEach(r => r.CAT = "Income");

const expUpdateRaw = aggByCut(expenses_econ, "COD_CONS_EK", updateExpCat, selectCity, columns, capExpSet, "Capital expenditures");
const expUpdate = expUpdateRaw.map(r => ({
  ...r, CAT: "Expense",
  actuals: Object.fromEntries(Object.entries(r.actuals).map(([k, v]) => [k, -v])),
  budget: -r.budget
}));

const finRows = aggFinancing(debts, selectCity, columns);
const credRows = aggCredits(credits, selectCity, columns);
const cashRows = aggCash(debts, selectCity, columns);
const reverseSubsidyRows = aggReverseSubsidy(reverse_subsidy, selectCity, columns);

function buildSummaryTemplate(allRows, cols) {
  const rows = [...allRows];
  function addTotal(name, componentNames) {
    const actuals = {};
    for (const col of cols) {
      let sum = 0;
      for (const n of componentNames) {
        const r = rows.find(r => r.TYPE === n);
        if (r) sum += r.actuals[col.key] || 0;
      }
      actuals[col.key] = sum;
    }
    let bsum = 0;
    for (const n of componentNames) {
      const r = rows.find(r => r.TYPE === n);
      if (r) bsum += r.budget || 0;
    }
    rows.push({TYPE: name, CAT: "Total", actuals, budget: bsum});
  }
  for (const t of summaryTotals) addTotal(t.name, t.components);

  return rows
    .filter(r => r.TYPE && summaryRowOrder.includes(r.TYPE))
    .sort((a, b) => summaryRowOrder.indexOf(a.TYPE) - summaryRowOrder.indexOf(b.TYPE));
}

const financialSummary = buildSummaryTemplate(
  [...incUpdate, ...expUpdate, ...finRows, ...credRows, ...cashRows, ...reverseSubsidyRows], columns
);

// ── Summary Financials sheet: annual (FY) + period (Nm) column sets ──
// annualSummaryCols: FY for yearFrom..yearTo-1 (current budget year shown as Budget column)
// periodSummaryCols: effectiveMonth for yearFrom..yearTo (all years at the same YTD cutoff)
const annualSummaryCols = d3.range(yearFrom, yearTo).map(y => ({
  year: y, month: 12, key: `s_ann_${y}`, label: String(y)
}));
const periodSummaryCols = d3.range(yearFrom, yearTo + 1).map(y => ({
  year: y, month: effectiveMonth, key: `s_per_${y}`,
  label: effectiveMonth === 12 ? String(y) : `${effectiveMonth}m ${y}`
}));

function buildSummaryForCols(cols) {
  const incR = aggByCut(incomes, "COD_INCO", updateIncCat, selectCity, cols, adjCatCodes, "Capital revenues", updateIncCat);
  incR.forEach(r => r.CAT = "Income");
  const expRaw = aggByCut(expenses_econ, "COD_CONS_EK", updateExpCat, selectCity, cols, capExpSet, "Capital expenditures");
  const expR = expRaw.map(r => ({
    ...r, CAT: "Expense",
    actuals: Object.fromEntries(Object.entries(r.actuals).map(([k, v]) => [k, -v])),
    budget: -r.budget
  }));
  const finR  = aggFinancing(debts, selectCity, cols);
  const credR = aggCredits(credits, selectCity, cols);
  const cashR = aggCash(debts, selectCity, cols);
  const revSubR = aggReverseSubsidy(reverse_subsidy, selectCity, cols);
  return buildSummaryTemplate([...incR, ...expR, ...finR, ...credR, ...cashR, ...revSubR], cols);
}

const fsAnnual = buildSummaryForCols(annualSummaryCols);
const fsPeriod = buildSummaryForCols(periodSummaryCols);

// ── Financial Model (SUMMARY_MODEL matching R) ──
const incModel = aggByCut(incomes, "COD_INCO", modelIncCat, selectCity, columns, adjCatCodes, "Capital grants");
incModel.forEach(r => r.CAT = "Income");

const expModelRaw = aggByCut(expenses_econ, "COD_CONS_EK", modelExpCat, selectCity, columns);
const expModel = expModelRaw.map(r => ({
  ...r, CAT: "Expense",
  actuals: Object.fromEntries(Object.entries(r.actuals).map(([k, v]) => [k, -v])),
  budget: -r.budget
}));

const financialModel = [...incModel, ...expModel, ...finRows, ...credRows, ...cashRows]
  .filter(r => r.TYPE);

// ── Capital Adjustments sheet (income + expense selected items) ──
function buildCapAdjSheet(incData, expData, city, cols, incCatDefs, expCatDefs) {
  const rows = [];

  // Income
  const incMap = new Map();
  for (const d of incData.filter(d => d.CITY === city && d.FUND_TYP === "T")) {
    if (!adjCatCodes.has(d.COD_INCO)) continue;
    const name = d.NAME_INC;
    if (!incMap.has(name)) incMap.set(name, {cat: categorize(d.COD_INCO, incCatDefs), code: d.COD_INCO, actuals: Object.fromEntries(cols.map(c => [c.key, 0])), budget: 0});
    const entry = incMap.get(name);
    const year = d.REP_PERIOD.getUTCFullYear();
    const month = d.REP_PERIOD.getUTCMonth() + 1;
    for (const col of cols) {
      if (year === col.year && month === col.month) entry.actuals[col.key] += (d.FAKT_AMT || 0) / 1e6;
    }
    if (year === yearTo && d.REP_PERIOD.getUTCMonth() === budgetMonth) entry.budget += (d.ZAT_AMT || 0) / 1e6;
  }
  for (const [name, data] of [...incMap.entries()].sort((a, b) => a[1].code - b[1].code)) {
    const obj = {GROUP: "Income", CAT: data.cat, TYPE: name, CODE: data.code};
    for (const col of cols) obj[col.label] = data.actuals[col.key];
    if (budgetMonth >= 0) obj[`Budget ${yearTo}`] = data.budget;
    rows.push(obj);
  }

  // Expense
  const expMap = new Map();
  for (const d of expData.filter(d => d.CITY === city && d.FUND_TYP === "T")) {
    if (!capExpSet.has(d.COD_CONS_EK)) continue;
    const code = d.COD_CONS_EK;
    if (!expMap.has(code)) expMap.set(code, {cat: categorize(code, expCatDefs), code, actuals: Object.fromEntries(cols.map(c => [c.key, 0])), budget: 0});
    const entry = expMap.get(code);
    const year = d.REP_PERIOD.getUTCFullYear();
    const month = d.REP_PERIOD.getUTCMonth() + 1;
    for (const col of cols) {
      if (year === col.year && month === col.month) entry.actuals[col.key] += (d.FAKT_AMT || 0) / 1e6;
    }
    if (year === yearTo && d.REP_PERIOD.getUTCMonth() === budgetMonth) entry.budget += (d.ZAT_AMT || 0) / 1e6;
  }
  for (const [code, data] of [...expMap.entries()].sort((a, b) => a[0] - b[0])) {
    const obj = {GROUP: "Expense", CAT: data.cat, TYPE: kekNameByCode.get(code) ?? String(code), CODE: code};
    for (const col of cols) obj[col.label] = data.actuals[col.key];
    if (budgetMonth >= 0) obj[`Budget ${yearTo}`] = data.budget;
    rows.push(obj);
  }

  return rows;
}

// ── Transfers and Capital Grants detail sheets (for XLSX) ──
function buildDetailSheet(incData, city, cols, catDefs, filterType) {
  const filtered = incData.filter(d => d.CITY === city && d.FUND_TYP === "T");
  const nameMap = new Map();
  for (const d of filtered) {
    const type = categorize(d.COD_INCO, catDefs);
    if (type !== filterType) continue;
    const name = d.NAME_INC;
    if (!nameMap.has(name)) nameMap.set(name, {code: d.COD_INCO, actuals: Object.fromEntries(cols.map(c => [c.key, 0])), budget: 0});
    const entry = nameMap.get(name);
    const year = d.REP_PERIOD.getUTCFullYear();
    const month = d.REP_PERIOD.getUTCMonth() + 1;
    for (const col of cols) {
      if (year === col.year && month === col.month) entry.actuals[col.key] += (d.FAKT_AMT || 0) / 1e6;
    }
    if (year === yearTo && d.REP_PERIOD.getUTCMonth() === budgetMonth) entry.budget += (d.ZAT_AMT || 0) / 1e6;
  }
  return [...nameMap.entries()].map(([name, data]) => {
    const obj = {CAT: filterType, TYPE: name};
    for (const col of cols) obj[col.label] = data.actuals[col.key];
    if (budgetMonth >= 0) obj[`Budget ${yearTo}`] = data.budget;
    return obj;
  });
}

const capAdjSheet = buildCapAdjSheet(incomes, expenses_econ, selectCity, columns, modelIncCat, modelExpCat);
const transfersSheet = buildDetailSheet(incomes, selectCity, columns, modelIncCat, "Transfers");
const capitalGrantsSheet = buildDetailSheet(incomes, selectCity, columns, modelIncCat, "Capital grants");
```

## ${selectCity}

```js
{
  const button = document.createElement("button");
  button.textContent = "📥 Download Excel";
  button.style.cssText = "padding: 6px 12px; cursor: pointer; border: 1px solid #ccc; border-radius: 4px; background: #f8f8f8; font-size: 14px;";
  button.onmouseenter = () => button.style.background = "#e8e8e8";
  button.onmouseleave = () => button.style.background = "#f8f8f8";
  button.onclick = () => downloadXlsx();
  display(button);
}
```

```js
const fmt0 = d3.format(",.0f");
const displayData = financialSummary;
const totalTypes = new Set(cfg.summaryTotals.map(t => t.name));
const nCols = 2 + columns.length + (hasBudget ? 1 : 0);
const colStyle = "text-align:right; padding: 0 8px; min-width:80px; vertical-align:middle";
const headerStyle = "background:var(--theme-foreground-faintest); font-weight:600; padding: 4px 8px";

display(html`<table style="width:100%; border-collapse:collapse; font-size:14px; font-variant-numeric:tabular-nums">
  <thead>
    <tr style="border-bottom:2px solid var(--theme-foreground-faint)">
      <th style="text-align:left; padding:4px 8px">Category</th>
      <th style="text-align:left; padding:4px 8px; min-width:200px">Type</th>
      ${columns.map(c => html`<th style="${colStyle}">${c.label}</th>`)}
      ${hasBudget ? html`<th style="${colStyle}">Budget ${yearTo}</th>` : ""}
    </tr>
  </thead>
  <tbody>
    ${displayData.map(r => {
      const isTotal = r.CAT === "Total" || totalTypes.has(r.TYPE);
      const rowStyle = isTotal
        ? `font-weight:700; border-top:1px solid var(--theme-foreground-faint); background:#fffde7`
        : "";
      return html`<tr style="border-bottom:1px solid var(--theme-foreground-faintest); ${rowStyle}">
        <td style="padding:4px 8px; vertical-align:middle">${r.CAT}</td>
        <td style="padding:4px 8px; vertical-align:middle">${r.TYPE}</td>
        ${columns.map(c => html`<td style="${colStyle}">${fmt0(r.actuals[c.key])}</td>`)}
        ${hasBudget ? html`<td style="${colStyle}">${fmt0(r.budget || 0)}</td>` : ""}
      </tr>`;
    })}
    <tr style="border-top:2px solid var(--theme-foreground-faint)">
      <td colspan="2" style="padding:4px 8px; font-style:italic; font-size:12px">Check</td>
      ${columns.map(c => {
        const get = type => (financialSummary.find(r => r.TYPE === type)?.actuals[c.key] || 0);
        const diff = Math.abs(get("Cash, eop") - get("Cash, bop") - get("Net surplus") - get("Interbudget loans") - get("Deposit operations"));
        const ok = diff < 0.5;
        return html`<td style="${colStyle}; color:${ok ? "#2e8b57" : "#dc143c"}; font-style:italic; font-size:12px">${ok ? "TRUE" : "FALSE"}</td>`;
      })}
      ${hasBudget ? (() => {
        const getb = type => (financialSummary.find(r => r.TYPE === type)?.budget || 0);
        const diff = Math.abs(getb("Cash, eop") - getb("Cash, bop") - getb("Net surplus") - getb("Interbudget loans") - getb("Deposit operations"));
        const ok = diff < 0.5;
        return html`<td style="${colStyle}; color:${ok ? "#2e8b57" : "#dc143c"}; font-style:italic; font-size:12px">${ok ? "TRUE" : "FALSE"}</td>`;
      })() : ""}
    </tr>
  </tbody>
</table>
<p style="color:var(--theme-foreground-muted); font-size:12px; margin-top:8px">Values in million UAH.</p>`);
```

```js
// ── Summary sheet data (Financial Summary) ──
const summarySheetData = financialSummary.map(r => {
  const obj = {CAT: r.CAT, TYPE: r.TYPE};
  for (const c of columns) obj[c.label] = r.actuals[c.key];
  if (hasBudget) obj[`Budget ${yearTo}`] = r.budget || 0;
  return obj;
});

// ── Model sheet data (Financial Model) ──
const modelSheetData = financialModel.map(r => {
  const obj = {CAT: r.CAT, TYPE: r.TYPE};
  for (const c of columns) obj[c.label] = r.actuals[c.key];
  if (hasBudget) obj[`Budget ${yearTo}`] = r.budget || 0;
  return obj;
});

// ── Base year for single-year export sheets (year before yearTo) ──
const baseYearExport = (() => {
  const idx = availableYears.indexOf(yearTo);
  return idx > 0 ? availableYears[idx - 1] : yearTo;
})();

// month_max as 0-indexed (for icicle/waterfall functions)
const month_max_export = effectiveMonth - 1;

// ── Icicle diff datasets for export (diff sheets only; plain icicle omitted) ──
const inc_diff_export = get_treetab_diff(incomes,      inck_prep, "COD_INCO",       selectCity, yearTo, baseYearExport, month_max_export);
const exp_econ_diff   = get_treetab_diff(expenses_econ, kek_prep,  "COD_CONS_EK",    selectCity, yearTo, baseYearExport, month_max_export);
const exp_func_diff   = get_treetab_diff(expenses_func, fkv_prep,  "COD_CONS_MB_FK", selectCity, yearTo, baseYearExport, month_max_export);

// ── Budget vs prev-year-actuals datasets (only when budget data exists) ──
// Synthetic rows with FAKT_AMT = ZAT_AMT and a fake year (9998) act as the "budget year"
const BUDGET_YEAR = 9998;
function makeBudgetRows(rawData) {
  return rawData
    .filter(d => d.FUND_TYP === "T"
      && d.REP_PERIOD.getUTCFullYear() === yearTo
      && d.REP_PERIOD.getUTCMonth() === month_max_export
      && (d.ZAT_AMT || 0) !== 0)
    .map(d => ({
      ...d,
      REP_PERIOD: new Date(Date.UTC(BUDGET_YEAR, 11, 1)),  // full-year = December
      FAKT_AMT: d.ZAT_AMT || 0
    }));
}

// ── Current surplus 3-level flat data for Excel export ──
// Level 1: Current revenues / Current expenditures / Current surplus
// Level 2: Financial Model categories (shown on waterfall chart)
// Level 3: individual economic classification codes
const modelIncCatNames = [...new Map(modelIncCat.map(d => [d.name, true])).keys()];
const modelExpCatNames = [...new Map(modelExpCat.map(d => [d.name, true])).keys()];

let inc_vs_budget, exp_econ_vs_budget, exp_func_vs_budget, cs_flat_budget;
if (hasBudget) {
  const incomes_aug  = [...incomes,       ...makeBudgetRows(incomes)];
  const exp_econ_aug = [...expenses_econ,  ...makeBudgetRows(expenses_econ)];
  const exp_func_aug = [...expenses_func,  ...makeBudgetRows(expenses_func)];

  inc_vs_budget      = get_treetab_diff(incomes_aug,   inck_prep, "COD_INCO",       selectCity, BUDGET_YEAR, baseYearExport, 11);
  exp_econ_vs_budget = get_treetab_diff(exp_econ_aug,  kek_prep,  "COD_CONS_EK",    selectCity, BUDGET_YEAR, baseYearExport, 11);
  exp_func_vs_budget = get_treetab_diff(exp_func_aug,  fkv_prep,  "COD_CONS_MB_FK", selectCity, BUDGET_YEAR, baseYearExport, 11);

  cs_flat_budget = buildCsFlatDiffRows(incomes_aug, exp_econ_aug, selectCity, BUDGET_YEAR, baseYearExport, 11);
}

function buildCsFlatRows(incData, expData, city, year, month) {
  const incAgg = {}, expAgg = {};
  for (const d of incData) {
    if (d.CITY !== city || d.FUND_TYP !== "T") continue;
    if (capIncSet.has(d.COD_INCO)) continue;
    if (d.REP_PERIOD.getUTCFullYear() !== year || d.REP_PERIOD.getUTCMonth() !== month) continue;
    const cat = categorize(d.COD_INCO, modelIncCat);
    if (!cat) continue;
    if (!incAgg[cat]) incAgg[cat] = {};
    incAgg[cat][d.COD_INCO] = (incAgg[cat][d.COD_INCO] || 0) + (d.FAKT_AMT || 0) / 1e6;
  }
  for (const d of expData) {
    if (d.CITY !== city || d.FUND_TYP !== "T") continue;
    if (capExpSet.has(d.COD_CONS_EK)) continue;
    if (d.REP_PERIOD.getUTCFullYear() !== year || d.REP_PERIOD.getUTCMonth() !== month) continue;
    const cat = categorize(d.COD_CONS_EK, modelExpCat);
    if (!cat) continue;
    if (!expAgg[cat]) expAgg[cat] = {};
    expAgg[cat][d.COD_CONS_EK] = (expAgg[cat][d.COD_CONS_EK] || 0) + (d.FAKT_AMT || 0) / 1e6;
  }
  const rows = [];
  let totalInc = 0;
  const incSection = [];
  for (const catName of modelIncCatNames) {
    if (!incAgg[catName]) continue;
    const codes = Object.keys(incAgg[catName]).map(Number).sort((a, b) => a - b);
    let catSum = 0;
    const codeRows = [];
    for (const code of codes) {
      const v = incAgg[catName][code];
      if (!v) continue;
      catSum += v;
      codeRows.push({level: 3, name: inckNameByCode.get(code) || `Code ${code}`, code, value: v});
    }
    if (!catSum) continue;
    totalInc += catSum;
    incSection.push({level: 2, name: catName, code: null, value: catSum}, ...codeRows);
  }
  rows.push({level: 1, name: "Current revenues", code: null, value: totalInc}, ...incSection);
  let totalExp = 0;
  const expSection = [];
  for (const catName of modelExpCatNames) {
    if (!expAgg[catName]) continue;
    const codes = Object.keys(expAgg[catName]).map(Number).sort((a, b) => a - b);
    let catSum = 0;
    const codeRows = [];
    for (const code of codes) {
      const v = expAgg[catName][code];
      if (!v) continue;
      catSum += v;
      codeRows.push({level: 3, name: kekNameByCode.get(code) || `Code ${code}`, code, value: -v});
    }
    if (!catSum) continue;
    totalExp += catSum;
    expSection.push({level: 2, name: catName, code: null, value: -catSum}, ...codeRows);
  }
  rows.push({level: 1, name: "Current expenditures", code: null, value: -totalExp}, ...expSection);
  rows.push({level: 1, name: "Current surplus", code: null, value: totalInc - totalExp});
  return rows;
}

function buildCsFlatDiffRows(incData, expData, city, selectYear, baseYear, month) {
  function buildAgg(data, codeField, capSet, catDefs, yr) {
    const agg = {};
    for (const d of data) {
      if (d.CITY !== city || d.FUND_TYP !== "T") continue;
      if (capSet.has(d[codeField])) continue;
      if (d.REP_PERIOD.getUTCFullYear() !== yr || d.REP_PERIOD.getUTCMonth() !== month) continue;
      const cat = categorize(d[codeField], catDefs);
      if (!cat) continue;
      if (!agg[cat]) agg[cat] = {};
      agg[cat][d[codeField]] = (agg[cat][d[codeField]] || 0) + (d.FAKT_AMT || 0) / 1e6;
    }
    return agg;
  }
  const incAggC = buildAgg(incData, "COD_INCO",    capIncSet, modelIncCat, selectYear);
  const incAggB = buildAgg(incData, "COD_INCO",    capIncSet, modelIncCat, baseYear);
  const expAggC = buildAgg(expData, "COD_CONS_EK", capExpSet, modelExpCat, selectYear);
  const expAggB = buildAgg(expData, "COD_CONS_EK", capExpSet, modelExpCat, baseYear);
  function allCodes(ac, ab) {
    return [...new Set([...Object.keys(ac || {}), ...Object.keys(ab || {})])].map(Number).sort((a, b) => a - b);
  }
  const rows = [];
  let tIc = 0, tIb = 0;
  const incSection = [];
  for (const catName of modelIncCatNames) {
    const ac = incAggC[catName] || {}, ab = incAggB[catName] || {};
    const codes = allCodes(ac, ab);
    let cSc = 0, cSb = 0;
    const codeRows = [];
    for (const code of codes) {
      const vc = ac[code] || 0, vb = ab[code] || 0;
      if (!vc && !vb) continue;
      cSc += vc; cSb += vb;
      codeRows.push({level: 3, name: inckNameByCode.get(code) || `Code ${code}`, code, value_current: vc, value_base: vb});
    }
    if (!cSc && !cSb) continue;
    tIc += cSc; tIb += cSb;
    incSection.push({level: 2, name: catName, code: null, value_current: cSc, value_base: cSb}, ...codeRows);
  }
  rows.push({level: 1, name: "Current revenues", code: null, value_current: tIc, value_base: tIb}, ...incSection);
  let tEc = 0, tEb = 0;
  const expSection = [];
  for (const catName of modelExpCatNames) {
    const ac = expAggC[catName] || {}, ab = expAggB[catName] || {};
    const codes = allCodes(ac, ab);
    let cSc = 0, cSb = 0;
    const codeRows = [];
    for (const code of codes) {
      const vc = ac[code] || 0, vb = ab[code] || 0;
      if (!vc && !vb) continue;
      cSc += vc; cSb += vb;
      codeRows.push({level: 3, name: kekNameByCode.get(code) || `Code ${code}`, code, value_current: -vc, value_base: -vb});
    }
    if (!cSc && !cSb) continue;
    tEc += cSc; tEb += cSb;
    expSection.push({level: 2, name: catName, code: null, value_current: -cSc, value_base: -cSb}, ...codeRows);
  }
  rows.push({level: 1, name: "Current expenditures", code: null, value_current: -tEc, value_base: -tEb}, ...expSection);
  rows.push({level: 1, name: "Current surplus", code: null, value_current: tIc - tEc, value_base: tIb - tEb});
  return rows;
}

const cs_flat      = buildCsFlatRows(incomes, expenses_econ, selectCity, yearTo, month_max_export);
const cs_flat_diff = buildCsFlatDiffRows(incomes, expenses_econ, selectCity, yearTo, baseYearExport, month_max_export);

// ── Financial Summary Breakdown — 3-level disaggregation of every summary row ──
// Level 1: financial summary TYPE (Tax revenues, Operating expenditures, etc.)
// Level 2: model sub-category within each type
// Level 3: individual code
// Computed totals (Current revenues, Current surplus, …) appear as isTotal level-1 rows.
function buildSummaryBreakdownRows(incData, expData, debtsData, creditsData, city, cols, summaryData, expFuncEconData) {
  function zeroActuals() { return Object.fromEntries(cols.map(c => [c.key, 0])); }

  // Income: type → modelCat → code → entry
  const incAgg = {};
  for (const d of incData.filter(d => d.CITY === city && d.FUND_TYP === "T")) {
    let type = categorize(d.COD_INCO, updateIncCat);
    if (adjCatCodes.has(d.COD_INCO)) {
      const naturalType = categorize(d.COD_INCO, updateIncCat);
      if (naturalType === type) type = "Capital revenues";
    }
    if (!type) continue;
    const mc = categorize(d.COD_INCO, modelIncCat) || type;
    if (!incAgg[type]) incAgg[type] = {};
    if (!incAgg[type][mc]) incAgg[type][mc] = {};
    const code = d.COD_INCO;
    if (!incAgg[type][mc][code]) incAgg[type][mc][code] = { name: inckNameByCode.get(code) || d.NAME_INC || `Code ${code}`, actuals: zeroActuals(), budget: 0 };
    const e = incAgg[type][mc][code];
    const yr = d.REP_PERIOD.getUTCFullYear(), mo = d.REP_PERIOD.getUTCMonth() + 1;
    for (const col of cols) {
      if (yr === col.year && mo === col.month) e.actuals[col.key] += (col.isBudget ? (d.ZAT_AMT || 0) : (d.FAKT_AMT || 0)) / 1e6;
    }
    if (yr === yearTo && d.REP_PERIOD.getUTCMonth() === budgetMonth) e.budget += (d.ZAT_AMT || 0) / 1e6;
  }

  // Expenses: type → modelCat → code → entry (values negated)
  const expAgg = {};
  for (const d of expData.filter(d => d.CITY === city && d.FUND_TYP === "T")) {
    let type = categorize(d.COD_CONS_EK, updateExpCat);
    if (capExpSet.has(d.COD_CONS_EK)) type = "Capital expenditures";
    if (!type) continue;
    const mc = categorize(d.COD_CONS_EK, modelExpCat) || type;
    if (!expAgg[type]) expAgg[type] = {};
    if (!expAgg[type][mc]) expAgg[type][mc] = {};
    const code = d.COD_CONS_EK;
    if (!expAgg[type][mc][code]) expAgg[type][mc][code] = { name: kekNameByCode.get(code) || `Code ${code}`, actuals: zeroActuals(), budget: 0 };
    const e = expAgg[type][mc][code];
    const yr = d.REP_PERIOD.getUTCFullYear(), mo = d.REP_PERIOD.getUTCMonth() + 1;
    for (const col of cols) {
      if (yr === col.year && mo === col.month) e.actuals[col.key] -= (col.isBudget ? (d.ZAT_AMT || 0) : (d.FAKT_AMT || 0)) / 1e6;
    }
    if (yr === yearTo && d.REP_PERIOD.getUTCMonth() === budgetMonth) e.budget -= (d.ZAT_AMT || 0) / 1e6;
  }

  // Financing & cash: type → NAME_FIN key → entry
  // Replicates aggFinancing/aggCash sign conventions; Budget loans balance uses credits (negated).
  const finBreak = {};
  for (const d of debtsData.filter(d => d.CITY === city && d.FUND_TYP === "T")) {
    const codeFina = d.COD_FINA != null ? Number(d.COD_FINA) : null;
    if (codeFina == null) continue;
    const typeName = financingCodeMap[codeFina] || cashCodeMap[codeFina];
    if (!typeName) continue;
    const isCash = !!cashCodeMap[codeFina];
    const nameKey = (d.NAME_FIN && d.NAME_FIN.trim()) ? d.NAME_FIN.trim() : `Code ${d.COD_BUDGET ?? codeFina}`;
    if (!finBreak[typeName]) finBreak[typeName] = {};
    if (!finBreak[typeName][nameKey]) {
      finBreak[typeName][nameKey] = { name: nameKey, code: d.COD_FINA ?? null, actuals: zeroActuals(), budget: 0 };
    }
    const e = finBreak[typeName][nameKey];
    const yr = d.REP_PERIOD.getUTCFullYear(), mo = d.REP_PERIOD.getUTCMonth() + 1;
    const fakt = isCash ? Math.abs(d.FAKT_AMT || 0) : (d.FAKT_AMT || 0);
    const plan = isCash ? Math.abs(d.ZAT_AMT || 0) : (d.ZAT_AMT || 0);
    for (const col of cols) {
      if (yr === col.year && mo === col.month) e.actuals[col.key] += (col.isBudget ? plan : fakt) / 1e6;
    }
    if (yr === yearTo && d.REP_PERIOD.getUTCMonth() === budgetMonth) e.budget += plan / 1e6;
  }
  // Budget loans balance from credits (negated, matching aggCredits)
  const BLB = "Budget loans balance";
  finBreak[BLB] = {};
  for (const d of creditsData.filter(d => d.CITY === city && d.FUND_TYP === "T")) {
    const nameKey = d.COD_BUDGET != null ? String(d.COD_BUDGET) : "unknown";
    if (!finBreak[BLB][nameKey]) {
      finBreak[BLB][nameKey] = { name: "", code: d.COD_BUDGET ?? null, actuals: zeroActuals(), budget: 0 };
    }
    const e = finBreak[BLB][nameKey];
    const yr = d.REP_PERIOD.getUTCFullYear(), mo = d.REP_PERIOD.getUTCMonth() + 1;
    for (const col of cols) {
      if (yr === col.year && mo === col.month) e.actuals[col.key] -= (col.isBudget ? (d.ZAT_AMT || 0) : (d.FAKT_AMT || 0)) / 1e6;
    }
    if (yr === yearTo && d.REP_PERIOD.getUTCMonth() === budgetMonth) e.budget -= (d.ZAT_AMT || 0) / 1e6;
  }

  function sumGroup(typeEntry) {
    const totals = zeroActuals(); let bud = 0;
    for (const mc of Object.values(typeEntry)) {
      for (const e of Object.values(mc)) {
        for (const k of Object.keys(totals)) totals[k] += e.actuals[k] || 0;
        bud += e.budget;
      }
    }
    return { actuals: totals, budget: bud };
  }
  function sumMc(mcEntry) {
    const totals = zeroActuals(); let bud = 0;
    for (const e of Object.values(mcEntry)) {
      for (const k of Object.keys(totals)) totals[k] += e.actuals[k] || 0;
      bud += e.budget;
    }
    return { actuals: totals, budget: bud };
  }

  // Reverse subsidy breakdown by program code (COD_CONS_MB_PK)
  const revSubBreak = {};
  for (const d of (expFuncEconData || []).filter(d => d.CITY === city && d.FUND_TYP === "T")) {
    const code = d.COD_CONS_MB_PK;
    const yr = d.REP_PERIOD.getUTCFullYear(), mo = d.REP_PERIOD.getUTCMonth() + 1;
    if (!revSubBreak[code]) revSubBreak[code] = { name: d.COD_CONS_MB_PK_NAME || `Code ${code}`, actuals: zeroActuals(), budget: 0 };
    const e = revSubBreak[code];
    for (const col of cols) {
      if (yr === col.year && mo === col.month) e.actuals[col.key] -= (col.isBudget ? (d.ZAT_AMT || 0) : (d.FAKT_AMT || 0)) / 1e6;
    }
    if (yr === yearTo && d.REP_PERIOD.getUTCMonth() === budgetMonth) e.budget -= (d.ZAT_AMT || 0) / 1e6;
  }

  const totalTypeSet = new Set(summaryTotals.map(t => t.name));
  const incMcOrder   = [...new Map(modelIncCat.map(d => [d.name, true])).keys()];
  const expMcOrder   = [...new Map(modelExpCat.map(d => [d.name, true])).keys()];

  const rows = [];
  for (const typeName of summaryRowOrder) {
    if (totalTypeSet.has(typeName)) {
      // Computed total — pull value from financialSummary
      const sr = summaryData.find(r => r.TYPE === typeName);
      if (sr) rows.push({ level: 1, name: typeName, cat: "Total", code: null, isTotal: true, actuals: {...sr.actuals}, budget: sr.budget || 0 });
    } else if (incAgg[typeName]) {
      const {actuals, budget} = sumGroup(incAgg[typeName]);
      rows.push({ level: 1, name: typeName, cat: "Income", code: null, isTotal: false, actuals, budget });
      const sortedMcs = Object.keys(incAgg[typeName]).sort((a, b) => incMcOrder.indexOf(a) - incMcOrder.indexOf(b));
      for (const mc of sortedMcs) {
        const mcData = incAgg[typeName][mc];
        const {actuals: mca, budget: mcb} = sumMc(mcData);
        rows.push({ level: 2, name: mc, cat: "", code: null, isTotal: false, actuals: mca, budget: mcb });
        for (const code of Object.keys(mcData).map(Number).sort((a, b) => a - b)) {
          const e = mcData[code];
          rows.push({ level: 3, name: e.name, cat: "", code, isTotal: false, actuals: {...e.actuals}, budget: e.budget });
        }
      }
    } else if (expAgg[typeName]) {
      const {actuals, budget} = sumGroup(expAgg[typeName]);
      rows.push({ level: 1, name: typeName, cat: "Expense", code: null, isTotal: false, actuals, budget });
      const sortedMcs = Object.keys(expAgg[typeName]).sort((a, b) => expMcOrder.indexOf(a) - expMcOrder.indexOf(b));
      for (const mc of sortedMcs) {
        const mcData = expAgg[typeName][mc];
        const {actuals: mca, budget: mcb} = sumMc(mcData);
        rows.push({ level: 2, name: mc, cat: "", code: null, isTotal: false, actuals: mca, budget: mcb });
        for (const code of Object.keys(mcData).map(Number).sort((a, b) => a - b)) {
          const e = mcData[code];
          rows.push({ level: 3, name: e.name, cat: "", code, isTotal: false, actuals: {...e.actuals}, budget: e.budget });
        }
      }
    } else if (finBreak[typeName] && Object.keys(finBreak[typeName]).length > 0) {
      // Financing / cash — level-1 total from financialSummary; level-2 from raw aggregation
      const sr = summaryData.find(r => r.TYPE === typeName);
      if (sr) {
        rows.push({ level: 1, name: typeName, cat: sr.CAT || "", code: null, isTotal: false, actuals: {...sr.actuals}, budget: sr.budget || 0 });
        for (const e of Object.values(finBreak[typeName]).sort((a, b) => (a.name > b.name ? 1 : -1))) {
          rows.push({ level: 2, name: e.name, cat: "", code: e.code, isTotal: false, actuals: {...e.actuals}, budget: e.budget });
        }
      }
    } else if (typeName === "Reverse subsidy" && Object.keys(revSubBreak).length > 0) {
      const sr = summaryData.find(r => r.TYPE === typeName);
      if (sr) {
        rows.push({ level: 1, name: typeName, cat: "Expense", code: null, isTotal: false, actuals: {...sr.actuals}, budget: sr.budget || 0 });
        for (const code of Object.keys(revSubBreak).map(Number).sort((a, b) => a - b)) {
          const e = revSubBreak[code];
          rows.push({ level: 2, name: e.name, cat: "", code, isTotal: false, actuals: {...e.actuals}, budget: e.budget });
        }
      }
    } else {
      const sr = summaryData.find(r => r.TYPE === typeName);
      if (sr) rows.push({ level: 1, name: typeName, cat: sr.CAT || "", code: null, isTotal: false, actuals: {...sr.actuals}, budget: sr.budget || 0 });
    }
  }
  return rows;
}


// ── Expense Cross-Classification rows (Economic L1 × FKV functional hierarchy) ──
// Level 1: KEKV economic L1 (Current / Capital / Other / Undistributed)
// Level 2: FKV section (code=null) or leaf FKV L1 code (code≠null)
// Level 3: FKV sub-section (code=null) or leaf FKV L2 code (code≠null)
// Level 4: FKV detail leaf (code≠null)
function buildExpCrossClassRows(expFuncEcon, kekPrep, fkvPrep, city, cols) {
  const fkvByCode = new Map(fkvPrep.filter(d => d.level > 0).map(d => [d.code, d]));
  const kekByCode = new Map(kekPrep.map(d => [d.code, d]));

  function getKekL1(code) {
    let n = kekByCode.get(code);
    while (n && n.level > 1) n = kekByCode.get(n.parentCode);
    return n && n.level === 1 ? n : null;
  }

  function getFkvPath(code) {
    const node = fkvByCode.get(code);
    if (!node) return null;
    if (node.level === 1) return {l1: node, l2: null, leaf: node};
    const par = fkvByCode.get(node.parentCode);
    if (!par) return {l1: null, l2: null, leaf: node};
    if (node.level === 2) return {l1: par, l2: null, leaf: node};
    // level 3
    const gp = fkvByCode.get(par.parentCode);
    return {l1: gp && gp.level > 0 ? gp : null, l2: par, leaf: node};
  }

  function zeroActuals() { return Object.fromEntries(cols.map(c => [c.key, 0])); }

  // Aggregate: ekL1Code → fkvL1Code|sentinel → fkvL2Code|sentinel → leafCode → {name, actuals}
  const structure = {};

  for (const d of expFuncEcon) {
    if (d.CITY !== city || d.FUND_TYP !== "T") continue;
    const ekL1Node = getKekL1(d.COD_CONS_EK);
    if (!ekL1Node) continue;
    const fkvPath = getFkvPath(d.COD_CONS_MB_FK);
    if (!fkvPath) continue;
    const yr = d.REP_PERIOD.getUTCFullYear(), mo = d.REP_PERIOD.getUTCMonth() + 1;

    for (const col of cols) {
      if (yr !== col.year || mo !== col.month) continue;
      const amt = (col.isBudget ? (d.ZAT_AMT || 0) : (d.FAKT_AMT || 0)) / 1e6;
      if (!amt) continue;

      const ekKey  = ekL1Node.code;
      const l1Key  = fkvPath.l1 ? fkvPath.l1.code : `_${fkvPath.leaf.code}`;
      const l1Name = fkvPath.l1 ? fkvPath.l1.name  : fkvPath.leaf.name;
      const l2Key  = fkvPath.l2 ? fkvPath.l2.code  : fkvPath.leaf.code;
      const l2Name = fkvPath.l2 ? fkvPath.l2.name  : fkvPath.leaf.name;
      const leafCode = fkvPath.leaf.code, leafName = fkvPath.leaf.name;

      if (!structure[ekKey]) structure[ekKey] = {name: ekL1Node.name, byL1: {}};
      const ekEntry = structure[ekKey];
      if (!ekEntry.byL1[l1Key]) ekEntry.byL1[l1Key] = {name: l1Name, byL2: {}};
      const l1Entry = ekEntry.byL1[l1Key];
      if (!l1Entry.byL2[l2Key]) l1Entry.byL2[l2Key] = {name: l2Name, byLeaf: {}};
      const l2Entry = l1Entry.byL2[l2Key];
      if (!l2Entry.byLeaf[leafCode]) l2Entry.byLeaf[leafCode] = {name: leafName, actuals: zeroActuals()};
      l2Entry.byLeaf[leafCode].actuals[col.key] += amt;
    }
  }

  function sumLeaves(iter) {
    const tot = zeroActuals();
    for (const e of iter) for (const k of cols.map(c => c.key)) tot[k] += e[k] || 0;
    return tot;
  }

  const numSort = keys => keys.slice().sort((a, b) => { const na = +a, nb = +b; return (isNaN(na) ? 1e15 : na) - (isNaN(nb) ? 1e15 : nb); });

  const rows = [];
  for (const ekKey of numSort(Object.keys(structure))) {
    const ekEntry = structure[ekKey];
    const ekActuals = zeroActuals();
    for (const l1e of Object.values(ekEntry.byL1))
      for (const l2e of Object.values(l1e.byL2))
        for (const le of Object.values(l2e.byLeaf))
          for (const k of cols.map(c => c.key)) ekActuals[k] += le.actuals[k] || 0;
    rows.push({level: 1, name: ekEntry.name, cat: "", code: null, isTotal: false, actuals: ekActuals});

    for (const l1Key of numSort(Object.keys(ekEntry.byL1))) {
      const l1Entry = ekEntry.byL1[l1Key];
      const l1Actuals = zeroActuals();
      for (const l2e of Object.values(l1Entry.byL2))
        for (const le of Object.values(l2e.byLeaf))
          for (const k of cols.map(c => c.key)) l1Actuals[k] += le.actuals[k] || 0;

      // Detect if l1 IS the leaf (fkvPath.l1 == leaf: leaf code has no children here)
      const l1IsSingleLeaf = Object.keys(l1Entry.byL2).length === 1
        && Object.values(l1Entry.byL2)[0].name === l1Entry.name;
      if (l1IsSingleLeaf) {
        // FKV L1 is the leaf — show at level 2 with code
        const soleLeaf = Object.values(Object.values(l1Entry.byL2)[0].byLeaf)[0];
        const leafCode = +Object.keys(Object.values(l1Entry.byL2)[0].byLeaf)[0];
        rows.push({level: 2, name: l1Entry.name, cat: "", code: leafCode, isTotal: false, actuals: l1Actuals});
        continue;
      }
      rows.push({level: 2, name: l1Entry.name, cat: "", code: null, isTotal: false, actuals: l1Actuals});

      for (const l2Key of numSort(Object.keys(l1Entry.byL2))) {
        const l2Entry = l1Entry.byL2[l2Key];
        const l2Actuals = zeroActuals();
        for (const le of Object.values(l2Entry.byLeaf))
          for (const k of cols.map(c => c.key)) l2Actuals[k] += le.actuals[k] || 0;

        const l2IsSingleLeaf = Object.keys(l2Entry.byLeaf).length === 1
          && Object.values(l2Entry.byLeaf)[0].name === l2Entry.name;
        if (l2IsSingleLeaf) {
          const leafCode = +Object.keys(l2Entry.byLeaf)[0];
          rows.push({level: 3, name: l2Entry.name, cat: "", code: leafCode, isTotal: false, actuals: l2Actuals});
          continue;
        }
        rows.push({level: 3, name: l2Entry.name, cat: "", code: null, isTotal: false, actuals: l2Actuals});

        for (const leafCode of numSort(Object.keys(l2Entry.byLeaf))) {
          const le = l2Entry.byLeaf[leafCode];
          rows.push({level: 4, name: le.name, cat: "", code: +leafCode, isTotal: false, actuals: {...le.actuals}});
        }
      }
    }
  }
  return rows;
}


async function downloadXlsx() {
  const {createWorkbook, addIcicleDiffSheet, addFlatSheet, appendIdentityCheckRow, addCurrentSurplusSheet, addCurrentSurplusDiffSheet, addSummaryFinancialsSheet, addSummaryBreakdownSheet, addExpCrossClassSheet, downloadWorkbook} = await import("./components/excel-export.js");
  const wb = createWorkbook();
  const sheetHeader = ["CAT", "TYPE", ...columns.map(c => c.label)];
  if (hasBudget) sheetHeader.push(`Budget ${yearTo}`);
  const detailSheetHeader = ["CAT", "TYPE", "CODE", ...columns.map(c => c.label)];
  if (hasBudget) detailSheetHeader.push(`Budget ${yearTo}`);
  const capAdjSheetHeader = ["GROUP", "CAT", "TYPE", "CODE", ...columns.map(c => c.label)];
  if (hasBudget) capAdjSheetHeader.push(`Budget ${yearTo}`);

  // Financial summary — combined single sheet
  // Columns: FY years | period years (period mode only) | budget cols (if available)
  // Visual separator columns ({separator:true}) inserted between sections in layout arrays.
  // Diffs: sequential within FY; sequential within period (first skipped, no cross-section diff);
  //        only current-year budget vs prev full year (yearTo-1 FY).
  const annColsForDiff = effectiveMonth === 12 ? periodSummaryCols : annualSummaryCols;
  const perColsForDiff = effectiveMonth === 12 ? [] : periodSummaryCols;
  const bgtCols = hasBudget ? [
    {year: baseYearExport, month: effectiveMonth, key: `bgt_${baseYearExport}`, label: `Budget ${baseYearExport}`, isBudget: true},
    {year: yearTo,         month: effectiveMonth, key: `bgt_${yearTo}`,         label: `Budget ${yearTo}`,         isBudget: true}
  ] : [];

  // Data cols for aggregation (no separators)
  const allRealCols = [...annColsForDiff, ...perColsForDiff, ...bgtCols];
  // Layout cols for Excel rendering (separators between sections)
  const SEP = {separator: true};
  const allCombinedCols = [
    ...annColsForDiff,
    ...(perColsForDiff.length > 0 ? [SEP, ...perColsForDiff] : []),
    ...(bgtCols.length > 0        ? [SEP, ...bgtCols]        : [])
  ];

  // Build diff specs (separators between sections; no diff for first period col or base-year budget)
  const diffSpecs = [];
  for (let i = 1; i < annColsForDiff.length; i++) {
    diffSpecs.push({fromKey: annColsForDiff[i-1].key, toKey: annColsForDiff[i].key, label: `Δ ${annColsForDiff[i].label} vs ${annColsForDiff[i-1].label}`});
  }
  if (perColsForDiff.length > 0) {
    diffSpecs.push(SEP);
    for (let i = 1; i < perColsForDiff.length; i++) {
      diffSpecs.push({fromKey: perColsForDiff[i-1].key, toKey: perColsForDiff[i].key, label: `Δ ${perColsForDiff[i].label} vs ${perColsForDiff[i-1].label}`});
    }
  }
  if (bgtCols.length >= 2) {
    // Budget yearTo vs yearTo-1 full year fact
    const prevFullYear = annColsForDiff.find(c => c.year === yearTo - 1);
    if (prevFullYear) {
      diffSpecs.push(SEP);
      diffSpecs.push({fromKey: prevFullYear.key, toKey: bgtCols[1].key, label: `Δ ${bgtCols[1].label} vs ${prevFullYear.label}`});
    }
  }

  const fsCombined = buildSummaryForCols(allRealCols);
  addSummaryFinancialsSheet(wb, fsCombined, allCombinedCols, "Financial summary", diffSpecs);
  const sbCombined = buildSummaryBreakdownRows(incomes, expenses_econ, debts, credits, selectCity, allRealCols, fsCombined, reverse_subsidy);
  addSummaryBreakdownSheet(wb, sbCombined, allCombinedCols, "Fin summary breakdown", diffSpecs);
  addFlatSheet(wb, capAdjSheet, "Capital adjustments", capAdjSheetHeader);

  const expenses_func_econ = await FileAttachment("data/expenses-functional-economic.arrow").arrow()
    .then(t => [...t].map(r => ({
      CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
      FUND_TYP: r.FUND_TYP, COD_CONS_EK: Number(r.COD_CONS_EK), COD_CONS_MB_FK: Number(r.COD_CONS_MB_FK),
      ZAT_AMT: r.ZAT_AMT, PLANS_AMT: r.PLANS_AMT, FAKT_AMT: r.FAKT_AMT
    })));
  const expCrossRows = buildExpCrossClassRows(expenses_func_econ, kek_prep, fkv_prep, selectCity, allRealCols);
  addExpCrossClassSheet(wb, expCrossRows, allCombinedCols, "Expenses cross-functional", diffSpecs);

  await downloadWorkbook(wb, `budget-summary-${selectCity}-${periodLabel}-${yearFrom}-${yearTo}.xlsx`);
}
```
