---
title: City Comparison
toc: false
---

# City Comparison

Compare budget indicators across all Ukrainian municipalities.

```js
import * as d3 from "npm:d3";
import * as aq from "npm:arquero";
import {HorizontalComparisonChart} from "./components/horizontal-comparison.js";
import {defaultCapitalIncomeCodes, defaultCapitalExpenseCodes, categorize} from "./components/capital-defaults.js";

const [inck_raw, kek_raw, incomes, expenses_econ] = await Promise.all([
  FileAttachment("data/classificators/KDB.json").json(),
  FileAttachment("data/classificators/KEKV.json").json(),
  FileAttachment("data/incomes.arrow").arrow()
    .then(t => [...t].map(r => ({
      CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
      FUND_TYP: r.FUND_TYP, COD_INCO: Number(r.COD_INCO), FAKT_AMT: r.FAKT_AMT
    }))),
  FileAttachment("data/expenses.arrow").arrow()
    .then(t => [...t].map(r => ({
      CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
      FUND_TYP: r.FUND_TYP, COD_CONS_EK: Number(r.COD_CONS_EK), FAKT_AMT: r.FAKT_AMT
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

const cfg = await FileAttachment("data/config.json").json();
const defaultCapIncCodes = defaultCapitalIncomeCodes(inck_prep, incomes.map(d => d.COD_INCO), cfg.summaryIncomeCategories);
const defaultCapExpCodes = defaultCapitalExpenseCodes(kek_prep, cfg.summaryExpenseCategories);

const capIncSet = new Set((() => {
  try { const s = localStorage.getItem("capitalIncomeCodes"); return s ? JSON.parse(s) : defaultCapIncCodes; }
  catch { return defaultCapIncCodes; }
})());
const capExpSet = new Set((() => {
  try { const s = localStorage.getItem("capitalExpenseCodes"); return s ? JSON.parse(s) : defaultCapExpCodes; }
  catch { return defaultCapExpCodes; }
})());

// Aggregate per city/period from raw parquet using dynamic capital codes
const data = (() => {
  const agg = {};
  for (const d of incomes) {
    if (d.FUND_TYP !== "T") continue;
    const k = `${d.CITY}|${d.REP_PERIOD.getTime()}`;
    if (!agg[k]) agg[k] = { CITY: d.CITY, REP_PERIOD: d.REP_PERIOD, income: 0, income_curr: 0, income_transfer: 0, expense: 0, expense_curr: 0 };
    const amt = d.FAKT_AMT || 0;
    agg[k].income += amt;
    if (!capIncSet.has(d.COD_INCO)) agg[k].income_curr += amt;
    if (d.COD_INCO >= 40000000 && d.COD_INCO < 50000000) agg[k].income_transfer += amt;
  }
  for (const d of expenses_econ) {
    if (d.FUND_TYP !== "T") continue;
    const k = `${d.CITY}|${d.REP_PERIOD.getTime()}`;
    if (!agg[k]) agg[k] = { CITY: d.CITY, REP_PERIOD: d.REP_PERIOD, income: 0, income_curr: 0, income_transfer: 0, expense: 0, expense_curr: 0 };
    const amt = d.FAKT_AMT || 0;
    agg[k].expense += amt;
    if (!capExpSet.has(d.COD_CONS_EK)) agg[k].expense_curr += amt;
  }
  return Object.values(agg).map(d => ({
    CITY: d.CITY,
    REP_PERIOD: d.REP_PERIOD,
    income: Math.round(d.income / 1e6 * 10) / 10,
    income_curr: Math.round(d.income_curr / 1e6 * 10) / 10,
    expense: Math.round(d.expense / 1e6 * 10) / 10,
    expense_curr: Math.round(d.expense_curr / 1e6 * 10) / 10,
    income_transfer: Math.round(d.income_transfer / 1e6 * 10) / 10,
    curr_surplus: Math.round((d.income_curr - d.expense_curr) / 1e6 * 10) / 10,
    year: d.REP_PERIOD.getUTCFullYear(),
    month: d.REP_PERIOD.getUTCMonth() + 1
  })).sort((a, b) => a.CITY.localeCompare(b.CITY) || a.REP_PERIOD - b.REP_PERIOD);
})();

const cityNames = [...new Set(data.map(d => d.CITY))].sort();
const availableYears = [...new Set(data.map(d => d.year))].sort();
```

```js
const params = new URLSearchParams(location.search);
const initialCity     = params.get("city") ?? localStorage.getItem("selectedCity") ?? "Cherkasy";
const initialYear     = +(params.get("year")     ?? localStorage.getItem("selectedYear") ?? Math.max(...availableYears));
const initialBaseYear = +(params.get("baseYear") ?? localStorage.getItem("selectedBaseYear") ?? Math.max(...availableYears) - 1);
```

```js
const indicators = [
  {name: "Revenues",         indicator: "income"},
  {name: "Current revenues", indicator: "income_curr"},
  {name: "Current surplus",  indicator: "curr_surplus"}
];
```

<div class="grid grid-cols-4" style="gap: 0.5rem; margin-bottom: 1rem;">
<div>

```js
const selectCity = view(Inputs.select(cityNames, {label: "Highlight city", value: initialCity}));
```

</div>
<div>

```js
const selectIndicator = view(Inputs.select(indicators, {label: "Indicator", format: d => d.name}));
```

</div>
<div>

```js
const selectYear = view(Inputs.select(availableYears.slice(-4), {
  label: "Year", value: initialYear, format: d => d.toString()
}));
```

</div>
<div>

```js
const baseYear = view(Inputs.select(availableYears.slice(-5, -1), {
  label: "Base year", value: initialBaseYear, format: d => d.toString()
}));
```

</div>
</div>

```js
{
  const p = new URLSearchParams(location.search);
  p.set("city", selectCity); p.set("year", selectYear); p.set("baseYear", baseYear);
  history.replaceState(null, "", "?" + p.toString());
  localStorage.setItem("selectedCity", selectCity);
  localStorage.setItem("selectedYear", selectYear);
  localStorage.setItem("selectedBaseYear", baseYear);
}

const data_transform = data.map(d => ({...d, YEAR: d.year, MONTH: d.month - 1}));

const month_max = Math.max(...data_transform
  .filter(d => d.YEAR == selectYear)
  .map(d => d.MONTH));

const data_pivot = aq.from(data_transform.filter(d => d.YEAR == baseYear || d.YEAR == selectYear))
  .groupby(["CITY", "MONTH"])
  .pivot(["YEAR"], [selectIndicator.indicator])
  .rename(aq.names(["city", "month", "base", "current"]))
  .objects();

const data_change = aq.from(data_pivot)
  .groupby("city")
  .filter(d => d.current != undefined)
  .filter(d => d.month == aq.op.max(d.month))
  .derive({pct_change: d => (d.current - d.base) / d.base})
  .objects();
```


```js
HorizontalComparisonChart(data_change, selectCity, selectIndicator.name, month_max, selectYear, baseYear, d3.format(",d"))
```
