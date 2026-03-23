---
title: Current Surplus
toc: false
---

# Current Surplus

Current surplus = current (non-capital) revenues − current (non-capital) expenditures.

```js
import * as d3 from "npm:d3";
import * as aq from "npm:arquero";
import {TrendsChart} from "./components/trends-chart.js";
import {WaterfallChart, WaterfallComparisonChart} from "./components/waterfall.js";
import {prepareWaterfallData, prepareWaterfallComparisonData, get_codes} from "./components/waterfall-data.js";

const inck_raw = await FileAttachment("data/classificators/KDB.json").json();
const kek_raw  = await FileAttachment("data/classificators/KEKV.json").json();

const incomes = await FileAttachment("data/incomes.parquet").parquet()
  .then(t => [...t].map(r => ({
    CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
    FUND_TYP: r.FUND_TYP, COD_INCO: Number(r.COD_INCO), FAKT_AMT: r.FAKT_AMT
  })));

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
const inck_prep = prepClassificator(inck_raw, "Загальні доходи");
const kek_prep  = prepClassificator(kek_raw,  "Загальні видатки");

// Derive cityNames and availableYears from raw parquet
const cityNames = [...new Set(incomes.map(d => d.CITY))].sort();
const availableYears = [...new Set(incomes.map(d => d.REP_PERIOD.getUTCFullYear()))].sort();
```

```js
// Capital codes from localStorage (set on Adjustments page)
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

const capitalIncomeCodes = (() => {
  try { const s = localStorage.getItem("capitalIncomeCodes"); return s ? JSON.parse(s) : expandCodes(defaultCapIncCodes, inck_prep); }
  catch { return expandCodes(defaultCapIncCodes, inck_prep); }
})();
const capitalExpenseCodes = (() => {
  try { const s = localStorage.getItem("capitalExpenseCodes"); return s ? JSON.parse(s) : expandCodes(defaultCapExpCodes, kek_prep); }
  catch { return expandCodes(defaultCapExpCodes, kek_prep); }
})();
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

const month_max = Math.max(...incomes
  .filter(d => d.REP_PERIOD.getUTCFullYear() == selectYear)
  .map(d => d.REP_PERIOD.getUTCMonth()));
```

```js
// Build current surplus data from raw parquet using capital codes from Adjustments page
const inc_cap_codes = get_codes(inck_prep, capitalIncomeCodes);
const exp_cap_codes = get_codes(kek_prep, capitalExpenseCodes);

const capIncSetLocal = new Set(capitalIncomeCodes);
const capExpSetLocal = new Set(capitalExpenseCodes);

const curr_inc = incomes.filter(d => !inc_cap_codes.includes(d.COD_INCO));
const curr_exp = expenses_econ.filter(d => !exp_cap_codes.includes(d.COD_CONS_EK));

// Combine income and expenses into a single dataset with a unified COD field
// Expenses are negated so that surplus = sum of all COD entries
const curr_surplus_data = [
  ...curr_inc.map(d => ({...d, COD: d.COD_INCO, FAKT_AMT: +d.FAKT_AMT})),
  ...curr_exp.map(d => ({...d, COD: d.COD_CONS_EK, FAKT_AMT: -d.FAKT_AMT})),
];

// Build combi hierarchy: income codes (excl. capital) + expense codes (excl. capital, excl. 2000 grouping node)
// KEKV code 2000 is a grouping node; remap its children directly to root
const combi_table = [
  {code: 0, parentCode: null, name: "Current surplus", level: 0},
  ...inck_prep.slice(1).filter(d => !inc_cap_codes.includes(d.code)),
  ...kek_prep.slice(1)
    .filter(d => d.code !== 2000)
    .filter(d => !exp_cap_codes.includes(d.code))
    .map(d => ({...d, parentCode: d.parentCode === 2000 ? 0 : d.parentCode}))
];

// Compute current surplus trends from raw data using localStorage capital codes
const trendData = (() => {
  const agg = {};
  for (const d of incomes) {
    if (d.FUND_TYP !== "T") continue;
    const k = `${d.CITY}|${d.REP_PERIOD.getTime()}`;
    if (!agg[k]) agg[k] = { CITY: d.CITY, REP_PERIOD: d.REP_PERIOD, inc: 0, capInc: 0, exp: 0, capExp: 0 };
    agg[k].inc += d.FAKT_AMT || 0;
    if (capIncSetLocal.has(d.COD_INCO)) agg[k].capInc += d.FAKT_AMT || 0;
  }
  for (const d of expenses_econ) {
    if (d.FUND_TYP !== "T") continue;
    const k = `${d.CITY}|${d.REP_PERIOD.getTime()}`;
    if (!agg[k]) agg[k] = { CITY: d.CITY, REP_PERIOD: d.REP_PERIOD, inc: 0, capInc: 0, exp: 0, capExp: 0 };
    agg[k].exp += d.FAKT_AMT || 0;
    if (capExpSetLocal.has(d.COD_CONS_EK)) agg[k].capExp += d.FAKT_AMT || 0;
  }
  return Object.values(agg).map(d => ({
    CITY: d.CITY,
    REP_PERIOD: d.REP_PERIOD,
    curr_surplus: Math.round(((d.inc - d.capInc) - (d.exp - d.capExp)) / 1e6 * 10) / 10
  })).sort((a, b) => a.REP_PERIOD - b.REP_PERIOD);
})();
```

```js
TrendsChart(trendData, selectCity, "Current surplus", "curr_surplus", d3.format(",d"), "UAH million")
```

---

```js
const curr_surplus_wf = prepareWaterfallData(
  curr_surplus_data, combi_table, "COD",
  {code: 0, name: "Current surplus"},
  selectCity, selectYear, month_max
);
display(WaterfallChart(curr_surplus_wf, `Current surplus waterfall: ${selectCity} ${selectYear}`, d3.format(",d"), "UAH million"))
```

---

```js
const curr_surplus_wfd = prepareWaterfallComparisonData(
  curr_surplus_data, combi_table, "COD",
  {code: 0, name: "Current surplus"},
  selectCity, selectYear, baseYear, month_max
);
display(WaterfallComparisonChart(curr_surplus_wfd, `Current surplus change: ${selectCity} ${selectYear} vs ${baseYear}`, d3.format(",d"), "UAH million"))
```

<div class="note">
  Capital categories used in the current surplus calculation can be configured on the <a href="./adjustments">Adjustments</a> page.
</div>

<style>
.note {
  background-color: var(--theme-foreground-faintest);
  border-left: 4px solid var(--theme-foreground-focus);
  padding: 1rem;
  margin: 2rem 0 1rem;
  border-radius: 4px;
}
.note a { color: var(--theme-foreground-focus); font-weight: 600; }
</style>
