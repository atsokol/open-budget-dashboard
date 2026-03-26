---
title: Expenses (Functional)
toc: false
---

# Expenses (Functional)

```js
import * as d3 from "npm:d3";
import {TrendsChart} from "./components/trends-chart.js";
import {Icicle, IcicleDiff, get_treetab, get_treetab_diff} from "./components/icicle.js";

const fkv_raw = await FileAttachment("data/classificators/FKV.json").json();

const expenses_func = await FileAttachment("data/expenses-functional.arrow").arrow()
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

const data = (() => {
  const agg = {};
  for (const d of expenses_func) {
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

const month_max = Math.max(...expenses_func
  .filter(d => d.REP_PERIOD.getUTCFullYear() == selectYear)
  .map(d => d.REP_PERIOD.getUTCMonth()));
```

```js
TrendsChart(data, selectCity, "Expenses", "expense", d3.format(",d"), "UAH million")
```

---

## Expense (functional) categories — ${selectCity} ${selectYear}

```js
const exp_trtab = get_treetab(expenses_func, fkv_prep, "COD_CONS_MB_FK", selectCity, selectYear, month_max);
display(Icicle(exp_trtab, {label: d => d.name, width: 1152, height: 450}))
```

---

## Expense (functional) change — ${selectCity} ${selectYear} vs ${baseYear}

```js
const exp_diff = get_treetab_diff(expenses_func, fkv_prep, "COD_CONS_MB_FK", selectCity, selectYear, baseYear, month_max);
display(IcicleDiff(exp_diff, {label: d => d.name, width: 1152, height: 450}));
```
