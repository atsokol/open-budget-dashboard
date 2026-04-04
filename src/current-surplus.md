---
title: Current Surplus
toc: false
---

# Current Surplus

Current surplus = current (non-capital) revenues − current (non-capital) expenditures.

```js
import * as d3 from "npm:d3";
import {TrendsChart} from "./components/trends-chart.js";
import {WaterfallChart, WaterfallComparisonChart} from "./components/waterfall.js";
import {prepareWaterfallData, prepareWaterfallComparisonData} from "./components/waterfall-data.js";
import {defaultCapitalIncomeCodes, defaultCapitalExpenseCodes, categorize} from "./components/capital-defaults.js";

const [inck_raw, kek_raw, incomes, expenses_econ] = await Promise.all([
  FileAttachment("data/classificators/KDB.json").json(),
  FileAttachment("data/classificators/KEKV.json").json(),
  FileAttachment("data/incomes.arrow").arrow()
    .then(t => [...t].map(r => ({
      CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
      FUND_TYP: r.FUND_TYP, COD_INCO: r.COD_INCO, FAKT_AMT: r.FAKT_AMT
    }))),
  FileAttachment("data/expenses.arrow").arrow()
    .then(t => [...t].map(r => ({
      CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
      FUND_TYP: r.FUND_TYP, COD_CONS_EK: r.COD_CONS_EK, FAKT_AMT: r.FAKT_AMT
    })))
]);
```

```js
function prepClassificator(raw, rootName) {
  return [
    {code: "0", parentCode: null, name: rootName, level: 0},
    ...Array.from(new Map(
      raw.filter(d => d.dateto == null)
         .map(d => ({code: String(d.code), parentCode: d.parentCode ? String(d.parentCode) : "0", name: d.name, level: d.level}))
         .map(d => [d.code, d])
    ).values()).sort((a, b) => Number(a.code) - Number(b.code))
  ];
}
const inck_prep = prepClassificator(inck_raw, "Загальні доходи");
const kek_prep  = prepClassificator(kek_raw,  "Загальні видатки");
const cfg = await FileAttachment("data/config.json").json();

const defaultCapIncCodes = defaultCapitalIncomeCodes(inck_prep, incomes.map(d => d.COD_INCO), cfg.summaryIncomeCategories);
const defaultCapExpCodes = defaultCapitalExpenseCodes(kek_prep, cfg.summaryExpenseCategories);
const capitalIncomeCodes = (() => {
  try { const s = sessionStorage.getItem("capitalIncomeCodes"); return s ? JSON.parse(s) : defaultCapIncCodes; }
  catch { return defaultCapIncCodes; }
})();
const capitalExpenseCodes = (() => {
  try { const s = sessionStorage.getItem("capitalExpenseCodes"); return s ? JSON.parse(s) : defaultCapExpCodes; }
  catch { return defaultCapExpCodes; }
})();
const capIncSet = new Set(capitalIncomeCodes);
const capExpSet = new Set(capitalExpenseCodes);

const cityNames = [...new Set(incomes.map(d => d.CITY))].sort();
const availableYears = [...new Set(incomes.map(d => d.REP_PERIOD.getUTCFullYear()))].sort();
```

```js
const params = new URLSearchParams(location.search);
const initialCity     = params.get("city") ?? sessionStorage.getItem("selectedCity") ?? "Cherkasy";
const initialYear     = +(params.get("year")     ?? sessionStorage.getItem("selectedYear") ?? Math.max(...availableYears));
const initialBaseYear = +(params.get("baseYear") ?? sessionStorage.getItem("selectedBaseYear") ?? Math.max(...availableYears) - 1);
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
  sessionStorage.setItem("selectedCity", selectCity);
  sessionStorage.setItem("selectedYear", selectYear);
  sessionStorage.setItem("selectedBaseYear", baseYear);
}

const month_max = Math.max(...incomes
  .filter(d => d.REP_PERIOD.getUTCFullYear() == selectYear)
  .map(d => d.REP_PERIOD.getUTCMonth()));
```

```js
// Compute current surplus trends
const trendData = (() => {
  const agg = {};
  for (const d of incomes) {
    if (d.FUND_TYP !== "T") continue;
    const k = `${d.CITY}|${d.REP_PERIOD.getTime()}`;
    if (!agg[k]) agg[k] = { CITY: d.CITY, REP_PERIOD: d.REP_PERIOD, inc: 0, capInc: 0, exp: 0, capExp: 0 };
    agg[k].inc += d.FAKT_AMT || 0;
    if (capIncSet.has(d.COD_INCO)) agg[k].capInc += d.FAKT_AMT || 0;
  }
  for (const d of expenses_econ) {
    if (d.FUND_TYP !== "T") continue;
    const k = `${d.CITY}|${d.REP_PERIOD.getTime()}`;
    if (!agg[k]) agg[k] = { CITY: d.CITY, REP_PERIOD: d.REP_PERIOD, inc: 0, capInc: 0, exp: 0, capExp: 0 };
    agg[k].exp += d.FAKT_AMT || 0;
    if (capExpSet.has(d.COD_CONS_EK)) agg[k].capExp += d.FAKT_AMT || 0;
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
// Build a flat synthetic classificator from Financial Model categories.
// Income model categories get synthetic codes 1..N (positive FAKT_AMT).
// Expense model categories get synthetic codes N+1..N+M (expenses negated so surplus = sum).
// This lets the existing waterfall components display the breakdown at model-category level
// rather than at individual budget code level.

const modelIncCat = cfg.modelIncomeCategories;
const modelExpCat = cfg.modelExpenseCategories;

// Ordered unique category names
const incCatNames = [...new Map(modelIncCat.map(d => [d.name, true])).keys()];
const expCatNames = [...new Map(modelExpCat.map(d => [d.name, true])).keys()];

// Assign synthetic integer codes
const incCatCode = Object.fromEntries(incCatNames.map((n, i) => [n, i + 1]));
const expCatCode = Object.fromEntries(expCatNames.map((n, i) => [n, incCatNames.length + i + 1]));

// Flat 2-level hierarchy: root = "Current surplus", leaves = model categories
const synth_table = [
  {code: 0, parentCode: null, name: "Current surplus", level: 0},
  ...incCatNames.map(n => ({code: incCatCode[n], parentCode: 0, name: n, level: 1})),
  ...expCatNames.map(n => ({code: expCatCode[n], parentCode: 0, name: n, level: 1})),
];

// Pre-aggregate raw data into synthetic category codes.
// Capital codes (capIncSet / capExpSet) are excluded.
// Expenses are negated so current surplus = sum of all entries.
const synth_data = [];
for (const d of incomes) {
  if (capIncSet.has(d.COD_INCO)) continue;
  const cat = categorize(d.COD_INCO, modelIncCat);
  if (cat == null || incCatCode[cat] == null) continue;
  synth_data.push({CITY: d.CITY, REP_PERIOD: d.REP_PERIOD, FUND_TYP: d.FUND_TYP, COD: incCatCode[cat], FAKT_AMT: d.FAKT_AMT});
}
for (const d of expenses_econ) {
  if (capExpSet.has(d.COD_CONS_EK)) continue;
  const cat = categorize(d.COD_CONS_EK, modelExpCat);
  if (cat == null || expCatCode[cat] == null) continue;
  synth_data.push({CITY: d.CITY, REP_PERIOD: d.REP_PERIOD, FUND_TYP: d.FUND_TYP, COD: expCatCode[cat], FAKT_AMT: -d.FAKT_AMT});
}
```

```js
const cs_root = {code: 0, name: "Current surplus"};

const curr_surplus_wf = prepareWaterfallData(
  synth_data, synth_table, "COD", cs_root,
  selectCity, selectYear, month_max
);
display(WaterfallChart(curr_surplus_wf, `Current surplus waterfall: ${selectCity} ${selectYear}`, d3.format(",d"), "UAH million"))
```

---

```js
const curr_surplus_wfd = prepareWaterfallComparisonData(
  synth_data, synth_table, "COD", cs_root,
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
