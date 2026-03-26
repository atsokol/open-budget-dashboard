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

const [inck_raw, kek_raw, fkv_raw, incomes, expenses_econ, expenses_func, debts, credits] = await Promise.all([
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
const updateIncCat = cfg.summaryIncomeCategories;
const updateExpCat = cfg.summaryExpenseCategories;
const modelIncCat  = cfg.modelIncomeCategories;
const modelExpCat  = cfg.modelExpenseCategories;
const financingCodeMap = Object.fromEntries(Object.entries(cfg.financingCodes).map(([k,v]) => [Number(k), v]));
const cashCodeMap      = Object.fromEntries(Object.entries(cfg.cashCodes).map(([k,v]) => [Number(k), v]));
const summaryTotals    = cfg.summaryTotals;
const summaryRowOrder  = cfg.summaryRowOrder;

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
function aggByCut(data, codeField, catDefs, city, cols, adjCodes, adjLabel) {
  const filtered = data.filter(d => d.CITY === city && d.FUND_TYP === "T");
  const typeSums = new Map();
  const typeBudgets = new Map();
  for (const d of filtered) {
    let type = categorize(d[codeField], catDefs);
    if (adjCodes && adjCodes.has(d[codeField])) type = adjLabel;
    if (!type) continue;
    const year = d.REP_PERIOD.getUTCFullYear();
    const month = d.REP_PERIOD.getUTCMonth() + 1;
    for (const col of cols) {
      if (year === col.year && month === col.month) {
        if (!typeSums.has(type)) typeSums.set(type, {});
        typeSums.get(type)[col.key] = (typeSums.get(type)[col.key] || 0) + (d.FAKT_AMT || 0) / 1e6;
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
        typeSums.get(type)[col.key] = (typeSums.get(type)[col.key] || 0) + (d.FAKT_AMT || 0) / 1e6;
      }
    }
    if (year === yearTo && d.REP_PERIOD.getUTCMonth() === budgetMonth) {
      typeBudgets.set(type, (typeBudgets.get(type) || 0) + (d.ZAT_AMT || 0) / 1e6);
    }
  }
  return [...new Set([...typeSums.keys(), ...typeBudgets.keys()])].map(type => ({
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
        typeSums.get(type)[col.key] = (typeSums.get(type)[col.key] || 0) + Math.abs(d.FAKT_AMT || 0) / 1e6;
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
      if (year === col.year && month === col.month) sums[col.key] += (d.FAKT_AMT || 0) / 1e6;
    }
    if (year === yearTo && d.REP_PERIOD.getUTCMonth() === budgetMonth) budgetVal += (d.ZAT_AMT || 0) / 1e6;
  }
  return [{
    TYPE: "Budget loans balance", CAT: "Loans",
    actuals: Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, -v])),
    budget: -budgetVal
  }];
}

// ── Financial Summary (SUMMARY_UPDATE matching R) ──
const incUpdate = aggByCut(incomes, "COD_INCO", updateIncCat, selectCity, columns, adjCatCodes, "Capital revenues");
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
  [...incUpdate, ...expUpdate, ...finRows, ...credRows, ...cashRows], columns
);

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
      const isHighlighted = r.TYPE === "Current surplus" || r.TYPE === "Net surplus";
      const rowStyle = isTotal
        ? `font-weight:700; border-top:1px solid var(--theme-foreground-faint)${isHighlighted ? "; background:#fffde7" : ""}`
        : "";
      return html`<tr style="border-bottom:1px solid var(--theme-foreground-faintest); ${rowStyle}">
        <td style="padding:4px 8px; vertical-align:middle">${r.CAT}</td>
        <td style="padding:4px 8px; vertical-align:middle">${r.TYPE}</td>
        ${columns.map(c => html`<td style="${colStyle}">${fmt0(r.actuals[c.key])}</td>`)}
        ${hasBudget ? html`<td style="${colStyle}">${fmt0(r.budget || 0)}</td>` : ""}
      </tr>`;
    })}
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

async function downloadXlsx() {
  const {createWorkbook, addIcicleDiffSheet, addFlatSheet, addCurrentSurplusSheet, addCurrentSurplusDiffSheet, downloadWorkbook} = await import("./components/excel-export.js");
  const wb = createWorkbook();
  const sheetHeader = ["CAT", "TYPE", ...columns.map(c => c.label)];
  if (hasBudget) sheetHeader.push(`Budget ${yearTo}`);
  const detailSheetHeader = ["CAT", "TYPE", "CODE", ...columns.map(c => c.label)];
  if (hasBudget) detailSheetHeader.push(`Budget ${yearTo}`);
  const capAdjSheetHeader = ["GROUP", "CAT", "TYPE", "CODE", ...columns.map(c => c.label)];
  if (hasBudget) capAdjSheetHeader.push(`Budget ${yearTo}`);

  // Financial summary sheets
  addFlatSheet(wb, summarySheetData,   "Financial Summary", sheetHeader);
  addFlatSheet(wb, modelSheetData,     "Financial Model",   sheetHeader);
  addFlatSheet(wb, capitalGrantsSheet, "Capital Grants",    sheetHeader);
  addFlatSheet(wb, transfersSheet,     "Transfers",         sheetHeader);
  addFlatSheet(wb, capAdjSheet,        "Capital adjustments", capAdjSheetHeader);

  // Current surplus 3-level breakdown sheets (after Transfers)
  addCurrentSurplusSheet(wb, cs_flat, "Current surplus", {colLabel: `${periodLabel} ${yearTo} (UAH mn)`});
  addCurrentSurplusDiffSheet(wb, cs_flat_diff, "Current surplus diff", {currentYear: yearTo, baseYear: baseYearExport, month: effectiveMonth});
  if (hasBudget) addCurrentSurplusDiffSheet(wb, cs_flat_budget, "Curr surplus vs Bgt", {currentYear: `Budget ${yearTo}`, baseYear: baseYearExport, month: 12});

  // Icicle diff sheets (year-over-year comparison, columns labelled with period+year)
  const diffOpts = {currentYear: yearTo, baseYear: baseYearExport, month: effectiveMonth};
  addIcicleDiffSheet(wb, inc_diff_export, "Revenues",      diffOpts);
  addIcicleDiffSheet(wb, exp_econ_diff,   "Expenses econ", diffOpts);
  addIcicleDiffSheet(wb, exp_func_diff,   "Expenses func", diffOpts);

  // Budget vs prev-year-actuals icicle sheets (only when budget data is available)
  if (hasBudget) {
    const budgetOpts = {currentYear: `Budget ${yearTo}`, baseYear: baseYearExport, month: 12};
    addIcicleDiffSheet(wb, inc_vs_budget,      "Revenues vs Budget",  budgetOpts);
    addIcicleDiffSheet(wb, exp_econ_vs_budget, "Exp econ vs Budget",  budgetOpts);
    addIcicleDiffSheet(wb, exp_func_vs_budget, "Exp func vs Budget",  budgetOpts);
  }

  await downloadWorkbook(wb, `budget-summary-${selectCity}-${periodLabel}-${yearFrom}-${yearTo}.xlsx`);
}
```
