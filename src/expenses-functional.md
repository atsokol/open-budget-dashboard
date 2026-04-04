---
title: Expenses (Functional)
toc: false
---

# Expenses (Functional)

```js
import * as d3 from "npm:d3";
import {TrendsChart} from "./components/trends-chart.js";
import {Icicle, IcicleDiff, get_treetab, get_treetab_diff} from "./components/icicle.js";

const [fkv_raw, kekv_raw, expenses_func, expenses_func_econ] = await Promise.all([
  FileAttachment("data/classificators/FKV.json").json(),
  FileAttachment("data/classificators/KEKV.json").json(),
  FileAttachment("data/expenses-functional.arrow").arrow()
    .then(t => [...t].map(r => ({
      CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
      FUND_TYP: r.FUND_TYP, COD_CONS_MB_FK: Number(r.COD_CONS_MB_FK), FAKT_AMT: r.FAKT_AMT
    }))),
  FileAttachment("data/expenses-functional-economic.arrow").arrow()
    .then(t => [...t].map(r => ({
      CITY: r.CITY, REP_PERIOD: new Date(r.REP_PERIOD),
      FUND_TYP: r.FUND_TYP, COD_CONS_EK: Number(r.COD_CONS_EK), COD_CONS_MB_FK: Number(r.COD_CONS_MB_FK),
      FAKT_AMT: r.FAKT_AMT
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
const fkv_prep  = prepClassificator(fkv_raw,  "Загальні видатки (функціональні)");
const kekv_prep = prepClassificator(kekv_raw, "Загальні видатки");

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

---

## Expense by economic class × functional category — ${selectCity} ${selectYear}

```js
// Build combined hierarchy: Economic L1 (outer) → FKV functional tree (inner)
function buildCrossClassFlatData(expFuncEcon, kekPrep, fkvPrep, city, year, monthMax) {
  const fkvByCode  = new Map(fkvPrep.filter(d => d.level > 0).map(d => [d.code, d]));
  const kekByCode  = new Map(kekPrep.map(d => [d.code, d]));

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
    const gp = fkvByCode.get(par.parentCode);
    return {l1: gp && gp.level > 0 ? gp : null, l2: par, leaf: node};
  }

  // Aggregate (ekL1Code, fkvLeafCode) → value
  const leafAgg = {};
  for (const d of expFuncEcon) {
    if (d.CITY !== city || d.FUND_TYP !== "T") continue;
    if (d.REP_PERIOD.getUTCFullYear() !== year) continue;
    if (d.REP_PERIOD.getUTCMonth() !== monthMax) continue;
    const ek = getKekL1(d.COD_CONS_EK);
    if (!ek) continue;
    const key = `${ek.code}__${d.COD_CONS_MB_FK}`;
    leafAgg[key] = (leafAgg[key] || 0) + (d.FAKT_AMT || 0) / 1e6;
  }

  if (Object.keys(leafAgg).length === 0) return [];

  const interNodes = new Map();
  const leafNodes  = [];

  interNodes.set("root", {code: "root", parentCode: null, level: 0, name: "Total expenses"});

  for (const [key, val] of Object.entries(leafAgg)) {
    if (!val || val <= 0) continue;
    const [ekStr, fkvStr] = key.split("__");
    const ekCode = +ekStr, fkvLeafCode = +fkvStr;
    const ekNode  = kekByCode.get(ekCode);
    const fkvPath = getFkvPath(fkvLeafCode);
    if (!ekNode || !fkvPath) continue;

    const ekId = `ek_${ekCode}`;
    if (!interNodes.has(ekId))
      interNodes.set(ekId, {code: ekId, parentCode: "root", level: 1, name: ekNode.name});

    let leafParentId = ekId;

    if (fkvPath.l1 && fkvPath.l1.code !== fkvLeafCode) {
      const l1Id = `${ekCode}_${fkvPath.l1.code}`;
      if (!interNodes.has(l1Id))
        interNodes.set(l1Id, {code: l1Id, parentCode: ekId, level: 2, name: fkvPath.l1.name});
      leafParentId = l1Id;

      if (fkvPath.l2 && fkvPath.l2.code !== fkvLeafCode) {
        const l2Id = `${ekCode}_${fkvPath.l2.code}`;
        if (!interNodes.has(l2Id))
          interNodes.set(l2Id, {code: l2Id, parentCode: l1Id, level: 3, name: fkvPath.l2.name});
        leafParentId = l2Id;
      }
    }

    const leafId = `${ekCode}__leaf__${fkvLeafCode}`;
    leafNodes.push({code: leafId, parentCode: leafParentId, level: fkvPath.leaf.level + 1, name: fkvPath.leaf.name, value: val});
  }

  return [...interNodes.values(), ...leafNodes];
}

const cross_trtab = buildCrossClassFlatData(expenses_func_econ, kekv_prep, fkv_prep, selectCity, selectYear, month_max);
display(cross_trtab.length > 0
  ? Icicle(cross_trtab, {label: d => d.name, width: 1152, height: 500})
  : html`<p style="color:gray">No cross-classification data available for ${selectCity} ${selectYear}.</p>`
);
```
