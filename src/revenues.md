---
title: Revenues
toc: false
---

# Revenues

```js
import * as d3 from "npm:d3";
import * as aq from "npm:arquero";
import {TrendsChart} from "./components/trends-chart.js";
import {WaterfallChart, WaterfallComparisonChart} from "./components/waterfall.js";
import {prepareWaterfallData, prepareWaterfallComparisonData} from "./components/waterfall-data.js";
import {Icicle, get_treetab} from "./components/icicle.js";

const inck_raw = await FileAttachment("data/classificators/KDB.json").json();

const incomes = await FileAttachment("data/incomes.parquet").parquet()
  .then(t => [...t].map(r => ({
    CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
    FUND_TYP: r.FUND_TYP, COD_INCO: Number(r.COD_INCO), NAME_INC: r.NAME_INC, FAKT_AMT: r.FAKT_AMT
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

// Capital income codes from localStorage (set on Adjustments page)
const defaultCapIncCodes = [30000000, 42000000, 21050000, 24110000, 21010500, 21010700, 21010800, 21010900];

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

const capIncSet = new Set((() => {
  try { const s = localStorage.getItem("capitalIncomeCodes"); return s ? JSON.parse(s) : expandCodes(defaultCapIncCodes, inck_prep); }
  catch { return expandCodes(defaultCapIncCodes, inck_prep); }
})());

// Build modified classificator with "Capital revenues" as a separate top-level node
const synCapIncCode = 99000000;
const inck_modified = [
  ...inck_prep.map(d => {
    if (d.code !== 0 && capIncSet.has(d.code) && !capIncSet.has(d.parentCode))
      return {...d, parentCode: synCapIncCode};
    return d;
  }),
  {code: synCapIncCode, parentCode: 0, name: "Capital revenues", level: 1}
];

// Aggregate total income per city/period from raw parquet
const data = (() => {
  const agg = {};
  for (const d of incomes) {
    if (d.FUND_TYP !== "T") continue;
    const k = `${d.CITY}|${d.REP_PERIOD.getTime()}`;
    if (!agg[k]) agg[k] = { CITY: d.CITY, REP_PERIOD: d.REP_PERIOD, income: 0 };
    agg[k].income += d.FAKT_AMT || 0;
  }
  return Object.values(agg).map(d => ({
    CITY: d.CITY, REP_PERIOD: d.REP_PERIOD,
    income: Math.round(d.income / 1e6 * 10) / 10,
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

const month_max = Math.max(...incomes
  .filter(d => d.REP_PERIOD.getUTCFullYear() == selectYear)
  .map(d => d.REP_PERIOD.getUTCMonth()));
```

```js
TrendsChart(data, selectCity, "Revenues", "income", d3.format(",d"), "UAH million")
```

---

```js
const selectIncWf = view(Inputs.select(
  inck_modified.filter(d => d.level <= 1),
  {label: "Revenue category", format: d => d.name}
));
```

```js
const inc_wf = prepareWaterfallData(
  incomes, inck_modified, "COD_INCO", selectIncWf,
  selectCity, selectYear, month_max
);
display(WaterfallChart(inc_wf, `Revenue breakdown: ${selectCity} ${month_max + 1}m ${selectYear}`, d3.format(",d"), "UAH million"))
```

---

```js
const selectIncComp = view(Inputs.select(
  inck_modified.filter(d => d.level <= 1),
  {label: "Revenue category", format: d => d.name}
));
```

```js
const inc_wfd = prepareWaterfallComparisonData(
  incomes, inck_modified, "COD_INCO", selectIncComp,
  selectCity, selectYear, baseYear, month_max
);
display(WaterfallComparisonChart(inc_wfd, `Revenue change: ${selectCity} ${month_max + 1}m ${selectYear} vs ${baseYear}`, d3.format(",d"), "UAH million"))
```

---

## Revenue classification — ${selectCity} ${selectYear}

```js
const inc_trtab = get_treetab(incomes, inck_modified, "COD_INCO", selectCity, selectYear, month_max);
display(Icicle(inc_trtab, {label: d => d.name, width: 1152, height: 450}))
```
