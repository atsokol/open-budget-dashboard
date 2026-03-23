---
title: Expenses (Functional)
toc: false
---

# Expenses (Functional)

```js
import * as d3 from "npm:d3";
import * as aq from "npm:arquero";
import {TrendsChart} from "./components/trends-chart.js";
import {WaterfallChart, WaterfallComparisonChart} from "./components/waterfall.js";
import {prepareWaterfallData, prepareWaterfallComparisonData} from "./components/waterfall-data.js";
import {Icicle, get_treetab} from "./components/icicle.js";

const budgetData = await FileAttachment("data/budget-summary.json").json();
const fkv_raw = await FileAttachment("data/classificators/FKV.json").json();

const expenses_func = await FileAttachment("data/expenses-functional.parquet").parquet()
  .then(t => [...t].map(r => ({
    CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
    FUND_TYP: r.FUND_TYP, COD_CONS_MB_FK: Number(r.COD_CONS_MB_FK), FAKT_AMT: r.FAKT_AMT
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
const fkv_prep = prepClassificator(fkv_raw, "Загальні видатки (функціональні)");

const data = budgetData.map(d => ({
  ...d, REP_PERIOD: new Date(d.REP_PERIOD),
  curr_surplus: d.income_curr - d.expense_curr
}));
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

const month_max = Math.max(...expenses_func
  .filter(d => d.REP_PERIOD.getUTCFullYear() == selectYear)
  .map(d => d.REP_PERIOD.getUTCMonth()));
```

```js
TrendsChart(data, selectCity, "Expenses", "expense", d3.format(",d"), "UAH million")
```

---

```js
const selectExpWf = view(Inputs.select(
  fkv_prep.filter(d => d.level <= 1),
  {label: "Expense category", format: d => d.name}
));
```

```js
const exp_wf = prepareWaterfallData(
  expenses_func, fkv_prep, "COD_CONS_MB_FK", selectExpWf,
  selectCity, selectYear, month_max
);
display(WaterfallChart(exp_wf, `Expense (functional) breakdown: ${selectCity} ${month_max + 1}m ${selectYear}`, d3.format(",d"), "UAH million"))
```

---

```js
const selectExpComp = view(Inputs.select(
  fkv_prep.filter(d => d.level <= 1),
  {label: "Expense category", format: d => d.name}
));
```

```js
const exp_wfd = prepareWaterfallComparisonData(
  expenses_func, fkv_prep, "COD_CONS_MB_FK", selectExpComp,
  selectCity, selectYear, baseYear, month_max
);
display(WaterfallComparisonChart(exp_wfd, `Expense (functional) change: ${selectCity} ${selectYear} vs ${baseYear}`, d3.format(",d"), "UAH million"))
```

---

## Expense (functional) categories — ${selectCity} ${selectYear}

```js
const exp_trtab = get_treetab(expenses_func, fkv_prep, "COD_CONS_MB_FK", selectCity, selectYear, month_max);
display(Icicle(exp_trtab, {label: d => d.name, width: 1152, height: 450}))
```
