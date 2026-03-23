---
title: Expenses (Economic)
toc: false
---

# Expenses (Economic)

```js
import * as d3 from "npm:d3";
import * as aq from "npm:arquero";
import {TrendsChart} from "./components/trends-chart.js";
import {WaterfallChart, WaterfallComparisonChart} from "./components/waterfall.js";
import {prepareWaterfallData, prepareWaterfallComparisonData} from "./components/waterfall-data.js";
import {Icicle, get_treetab} from "./components/icicle.js";

const kek_raw = await FileAttachment("data/classificators/KEKV.json").json();

const expenses_econ = await FileAttachment("data/expenses.parquet").parquet()
  .then(t => [...t].map(r => ({
    CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
    FUND_TYP: r.FUND_TYP, COD_CONS_EK: Number(r.COD_CONS_EK), FAKT_AMT: r.FAKT_AMT
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
const kek_prep = prepClassificator(kek_raw, "Загальні видатки");

// Capital expense codes from localStorage (set on Adjustments page)
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

const capExpSet = new Set((() => {
  try { const s = localStorage.getItem("capitalExpenseCodes"); return s ? JSON.parse(s) : expandCodes(defaultCapExpCodes, kek_prep); }
  catch { return expandCodes(defaultCapExpCodes, kek_prep); }
})());

// Build modified classificator with "Capital expenses" as a separate top-level node
const synCapExpCode = 99000;
const kek_modified = [
  ...kek_prep.map(d => {
    if (d.code !== 0 && capExpSet.has(d.code) && !capExpSet.has(d.parentCode))
      return {...d, parentCode: synCapExpCode};
    return d;
  }),
  {code: synCapExpCode, parentCode: 0, name: "Капітальні видатки", level: 1}
];

// Aggregate total expense per city/period from raw parquet
const data = (() => {
  const agg = {};
  for (const d of expenses_econ) {
    if (d.FUND_TYP !== "T") continue;
    const k = `${d.CITY}|${d.REP_PERIOD.getTime()}`;
    if (!agg[k]) agg[k] = { CITY: d.CITY, REP_PERIOD: d.REP_PERIOD, expense: 0 };
    agg[k].expense += d.FAKT_AMT || 0;
  }
  return Object.values(agg).map(d => ({
    CITY: d.CITY, REP_PERIOD: d.REP_PERIOD,
    expense: Math.round(d.expense / 1e6 * 10) / 10,
    year: d.REP_PERIOD.getUTCFullYear()
  })).sort((a, b) => a.REP_PERIOD - b.REP_PERIOD);
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

<div class="grid grid-cols-3" style="gap: 0.5rem; margin-bottom: 1rem;">
<div>

```js
const selectCity = view(Inputs.select(cityNames, {label: "City", value: initialCity}));
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

const month_max = Math.max(...expenses_econ
  .filter(d => d.REP_PERIOD.getUTCFullYear() == selectYear)
  .map(d => d.REP_PERIOD.getUTCMonth()));
```

```js
TrendsChart(data, selectCity, "Expenses", "expense", d3.format(",d"), "UAH million")
```

---

```js
const selectExpWf = view(Inputs.select(
  kek_modified.filter(d => d.level <= 1),
  {label: "Expense category", format: d => d.name}
));
```

```js
const exp_wf = prepareWaterfallData(
  expenses_econ, kek_modified, "COD_CONS_EK", selectExpWf,
  selectCity, selectYear, month_max
);
display(WaterfallChart(exp_wf, `Expense breakdown: ${selectCity} ${month_max + 1}m ${selectYear}`, d3.format(",d"), "UAH million"))
```

---

```js
const selectExpComp = view(Inputs.select(
  kek_modified.filter(d => d.level <= 1),
  {label: "Expense category", format: d => d.name}
));
```

```js
const exp_wfd = prepareWaterfallComparisonData(
  expenses_econ, kek_modified, "COD_CONS_EK", selectExpComp,
  selectCity, selectYear, baseYear, month_max
);
display(WaterfallComparisonChart(exp_wfd, `Expense change: ${selectCity} ${selectYear} vs ${baseYear}`, d3.format(",d"), "UAH million"))
```

---

## Expense (economic) categories — ${selectCity} ${selectYear}

```js
const exp_trtab = get_treetab(expenses_econ, kek_modified, "COD_CONS_EK", selectCity, selectYear, month_max);
display(Icicle(exp_trtab, {label: d => d.name, width: 1152, height: 450}))
```
