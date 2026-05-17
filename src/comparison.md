---
title: City Comparison
toc: false
---

# City Comparison

Compare budget indicators across all Ukrainian municipalities.

```js
import * as d3 from "npm:d3";
import * as aq from "npm:arquero";
import {HorizontalComparisonChart, CityRatioChart} from "./components/horizontal-comparison.js";
import {withDownload} from "./components/chart-download.js";
import {defaultCapitalIncomeCodes, defaultCapitalExpenseCodes, categorize} from "./components/capital-defaults.js";
import {prepClassificator, periodLabel} from "./components/waterfall-data.js";

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
const inck_prep = prepClassificator(inck_raw, "Загальні доходи");
const kek_prep  = prepClassificator(kek_raw,  "Загальні видатки");

const cfg = await FileAttachment("data/config.json").json();
const defaultCapIncCodes = defaultCapitalIncomeCodes(inck_prep, incomes.map(d => d.COD_INCO), cfg.summaryIncomeCategories);
const defaultCapExpCodes = defaultCapitalExpenseCodes(kek_prep, cfg.summaryExpenseCategories);

const capIncSet = new Set((() => {
  try { const s = sessionStorage.getItem("capitalIncomeCodes"); return s ? JSON.parse(s) : defaultCapIncCodes; }
  catch { return defaultCapIncCodes; }
})());
const capExpSet = new Set((() => {
  try { const s = sessionStorage.getItem("capitalExpenseCodes"); return s ? JSON.parse(s) : defaultCapExpCodes; }
  catch { return defaultCapExpCodes; }
})());

// Aggregate per city/period from raw parquet using dynamic capital codes
const data = (() => {
  const agg = {};
  for (const d of incomes) {
    if (d.FUND_TYP !== "T") continue;
    const k = `${d.CITY}|${d.REP_PERIOD.getTime()}`;
    if (!agg[k]) agg[k] = { CITY: d.CITY, REP_PERIOD: d.REP_PERIOD, income: 0, income_curr: 0, income_own: 0, income_transfer: 0, expense: 0, expense_curr: 0 };
    const amt = d.FAKT_AMT || 0;
    agg[k].income += amt;
    const _c = Number(d.COD_INCO);
    if (!capIncSet.has(d.COD_INCO)) agg[k].income_curr += amt;
    if (_c >= 40000000 && _c < 50000000) {
      agg[k].income_transfer += amt;
    } else if (!capIncSet.has(d.COD_INCO)) {
      agg[k].income_own += amt;
    }
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
    income_own: Math.round(d.income_own / 1e6 * 10) / 10,
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
const initialCity     = params.get("city") ?? sessionStorage.getItem("selectedCity") ?? "Cherkasy";
const initialYear     = +(params.get("year")     ?? sessionStorage.getItem("selectedYear") ?? Math.max(...availableYears));
const initialBaseYear = +(params.get("baseYear") ?? sessionStorage.getItem("selectedBaseYear") ?? Math.max(...availableYears) - 1);
```

```js
const indicators = [
  {name: "Revenues",         indicator: "income"},
  {name: "Current revenues", indicator: "income_curr"},
  {name: "Current surplus",  indicator: "curr_surplus"}
];
```

<div style="display: flex; gap: 2rem; margin-bottom: 1rem; align-items: flex-start;">
<div>

```js
const selectCity = view(Inputs.select(cityNames, {label: "Highlight city", value: initialCity}));
```

```js
const selectYear = view(Inputs.select(availableYears.slice(-4), {
  label: "Year", value: initialYear, format: d => d.toString()
}));
```

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

const data_transform = data.map(d => ({...d, YEAR: d.year, MONTH: d.month - 1}));

const month_max = Math.max(...data_transform
  .filter(d => d.YEAR == selectYear)
  .map(d => d.MONTH));

const data_pivot = selectYear === baseYear
  ? []
  : aq.from(data_transform.filter(d => d.YEAR == baseYear || d.YEAR == selectYear))
      .groupby(["CITY", "MONTH"])
      .pivot(["YEAR"], [selectIndicator.indicator])
      .rename(aq.names(["city", "month", "base", "current"]))
      .objects();

const baseRevenuesByCityMonth = Object.fromEntries(
  data_transform
    .filter(d => d.YEAR == baseYear)
    .map(d => [`${d.CITY}|${d.MONTH}`, d.income])
);

const data_change = selectYear === baseYear
  ? []
  : aq.from(data_pivot)
      .groupby("city")
      .filter(d => d.current != undefined)
      .filter(d => d.month == aq.op.max(d.month))
      .derive({pct_change: d => (d.current - d.base) / aq.op.abs(d.base)})
      .objects()
      .map(d => selectIndicator.indicator === "curr_surplus"
        ? {...d, pct_change: (d.current - d.base) / (baseRevenuesByCityMonth[`${d.city}|${d.month}`] || Math.abs(d.base))}
        : d);

const data_ratios = data
  .filter(d => d.year == selectYear && d.month == month_max + 1 && d.income > 0)
  .map(d => ({
    city: d.CITY,
    own_rev_share: d.income_own / d.income,
    cs_rev_ratio: d.income_curr > 0 ? d.curr_surplus / d.income_curr : 0
  }));
```

<div class="grid grid-cols-2" style="gap: 0.5rem; margin-bottom: 1rem;">

```js
withDownload(CityRatioChart(data_ratios.map(d => ({city: d.city, value: d.own_rev_share})), selectCity, `Own revenues share, ${periodLabel(month_max, selectYear)}`, d3.format(".1%")), `own-rev-share-${selectCity}-${selectYear}.png`)
```

```js
withDownload(CityRatioChart(data_ratios.map(d => ({city: d.city, value: d.cs_rev_ratio})), selectCity, `Current surplus / current revenues, ${periodLabel(month_max, selectYear)}`, d3.format(".1%")), `cs-rev-ratio-${selectCity}-${selectYear}.png`)
```

</div>

```js
const selectIndicator = view(Inputs.select(indicators, {label: "Indicator", format: d => d.name}));
```

```js
withDownload(HorizontalComparisonChart(data_change, selectCity, selectIndicator.name, month_max, selectYear, baseYear), `comparison-${selectCity}-${selectYear}.png`)
```
