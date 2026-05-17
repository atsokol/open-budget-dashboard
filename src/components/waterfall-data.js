import * as d3 from "npm:d3";
import * as aq from "npm:arquero";

export const periodLabel = (month_max, year) =>
  month_max === 11 ? `${year}` : `${month_max + 1}m ${year}`;

// Transform data for waterfall chart (single year - showing components)
export function prepareWaterfallData(data, c_table, codeString, selectCat, selectCity, selectYear, month_max, adjust = false) {
  const c_tree = d3.stratify()
    .id(d => d.code)
    .parentId(d => d.parentCode)(c_table);

  const selectNode = c_tree.descendants().find(d => d.id == selectCat.code);
  const groupDepth = selectNode.depth + 1;   // 1 for root, 2 for L1 summary parents
  const c_leaves = selectNode.descendants(); // no .copy() — preserves absolute depths

  const getGroupCode = (node) => {
    return node.ancestors().find(d => d.depth === groupDepth)?.data.code ?? null;
  };
  
  const codeMap = c_leaves.map(d => ({
    code: d.data.code,
    groupCode: getGroupCode(d)
  }));
  
  const data_select = data
    .filter(d => d.FUND_TYP == "T")
    .filter(d => d.CITY == selectCity)
    .map(d => ({
      ...d,
      code: d[codeString],
      YEAR: d.REP_PERIOD ? new Date(d.REP_PERIOD).getUTCFullYear() : null,
      MONTH: d.REP_PERIOD ? new Date(d.REP_PERIOD).getUTCMonth() : null
    }))
    .filter(d => codeMap.map(D => D.code).includes(d.code));
  
  const data_agg = aq.from(data_select)
    .params({selectYear: selectYear, selectCity: selectCity, month_max: month_max, adjust: adjust})
    .join_left(aq.from(codeMap), "code")
    .derive({
      code: d => d.groupCode,
      value: d => d.FAKT_AMT / 1000000 / (adjust ? 2 : 1)
    })
    .select("CITY", "YEAR", "MONTH", "code", "value")
    .filter(d => d.YEAR == selectYear)
    .groupby("code", "YEAR", "CITY")
    .filter(d => d.MONTH == month_max)
    .rollup({value: aq.op.sum("value")})
    .orderby("code")
    .join_left(aq.from(c_table), "code");
  
  const sumByCol = data_agg
    .groupby("YEAR")
    .rollup({Total: aq.op.sum("value")});
  
  const arr = data_agg
    .groupby("code")
    .groupby("YEAR")
    .pivot("name", "value", {sort: false})
    .join_left(sumByCol, "YEAR")
    .fold([aq.not("YEAR")])
    .derive({
      nextKey: d => aq.op.lead(d.key),
      accu: aq.rolling(d => aq.op.sum(d.value))
    })
    .derive({
      accu: d => d.key == "Total" ? d.value : d.accu,
      prior: d => d.key == "Total" ? 0 : aq.op.lag(d.accu) ?? 0
    })
    .objects()
    .map(d => ({
      ...d,
      key: d.key === "Total" ? `${selectCat.name}\n${periodLabel(month_max, selectYear)}` : d.key
    }));

  // Update nextKey references to point to renamed Total
  const totalName = `${selectCat.name}\n${periodLabel(month_max, selectYear)}`;
  arr.forEach((d, i) => {
    if (d.nextKey === "Total") {
      arr[i].nextKey = totalName;
    }
  });
  
  return arr;
}

// Transform data for waterfall chart (year-over-year comparison - showing changes)
export function prepareWaterfallComparisonData(data, c_table, codeString, selectCat, selectCity, selectYear, baseYear, month_max, fxAdjustment = null, baseYearAdjustment = null, adjust = false) {
  const c_tree = d3.stratify()
    .id(d => d.code)
    .parentId(d => d.parentCode)(c_table);
  
  const c_leaves = c_tree.descendants().find(d => d.id == selectCat.code).copy().descendants();
  
  const getGroupCode = (node) => {
    const ancestor = node.ancestors().find(d => d.depth === 1);
    return ancestor ? ancestor.data.code : null;
  };
  
  const codeMap = c_leaves.map(d => ({
    code: d.data.code,
    groupCode: getGroupCode(d)
  }));
  
  const data_select = data
    .filter(d => d.FUND_TYP == "T")
    .filter(d => d.CITY == selectCity)
    .map(d => ({
      ...d,
      code: d[codeString],
      YEAR: d.REP_PERIOD ? new Date(d.REP_PERIOD).getUTCFullYear() : null,
      MONTH: d.REP_PERIOD ? new Date(d.REP_PERIOD).getUTCMonth() : null
    }))
    .filter(d => codeMap.map(D => D.code).includes(d.code))
    .filter(d => d.YEAR == selectYear || d.YEAR == baseYear)
    .filter(d => d.MONTH == month_max);
  
  // Map each row to its groupCode and aggregate
  const codeMapObj = Object.fromEntries(codeMap.map(d => [d.code, d.groupCode]));
  const aggMap = new Map();
  for (const d of data_select) {
    const gc = codeMapObj[d.code];
    if (!gc) continue;
    const key = `${gc}|${d.YEAR}`;
    aggMap.set(key, (aggMap.get(key) || 0) + d.FAKT_AMT / 1000000 / (adjust ? 2 : 1));
  }

  // Build scaffold: union of all group codes × both years, fill missing with 0
  // Exclude categories where both years are 0
  const allGroupCodes = [...new Set([...codeMap.map(d => d.groupCode).filter(Boolean)])];
  const aggRows = [];
  for (const gc of allGroupCodes) {
    const valBase = aggMap.get(`${gc}|${baseYear}`) || 0;
    const valCurrent = aggMap.get(`${gc}|${selectYear}`) || 0;
    if (valBase === 0 && valCurrent === 0) continue;
    for (const yr of [baseYear, selectYear]) {
      const key = `${gc}|${yr}`;
      aggRows.push({ code: gc, YEAR: yr, CITY: selectCity, value: aggMap.get(key) || 0 });
    }
  }

  const data_agg = aq.from(aggRows)
    .orderby("code")
    .join_left(aq.from(c_table), "code");
  
  const sumByCol = data_agg
    .groupby("YEAR")
    .rollup({Total: aq.op.sum("value")})
    .derive({Total_lag: aq.op.lag("Total")});
  
  // Build code-to-name lookup
  const codeToName = Object.fromEntries(c_table.map(d => [d.code, d.name]));

  const arr = data_agg
    .groupby("code")
    .derive({value_diff: d => d.value - aq.op.lag(d.value)})
    .groupby("YEAR")
    .pivot("code", "value_diff", {sort: false})
    .join_left(sumByCol, "YEAR")
    .params({_selectYear: selectYear})
    .filter((d, $) => d.YEAR == $._selectYear)
    .relocate("Total_lag", {before: 1})
    .fold([aq.not("YEAR")])
    .derive({
      nextKey: d => aq.op.lead(d.key),
      accu: aq.rolling(d => aq.op.sum(d.value))
    })
    .derive({
      accu: d => d.key == "Total" ? d.value : d.accu,
      prior: d => d.key == "Total" ? 0 : aq.op.lag(d.accu) ?? 0
    })
    .objects()
    .map(d => ({
      ...d,
      key: d.key === "Total"
        ? `${selectCat.name}\n${periodLabel(month_max, selectYear)}`
        : (d.key === "Total_lag"
          ? `${selectCat.name}\n${periodLabel(month_max, baseYear)}`
          : (codeToName[d.key] || d.key))
    }));

  // Update nextKey references: map codes to names and rename Total/Total_lag
  const baseYearName = `${selectCat.name}\n${periodLabel(month_max, baseYear)}`;
  const currentYearName = `${selectCat.name}\n${periodLabel(month_max, selectYear)}`;
  arr.forEach((d, i) => {
    if (d.nextKey === "Total_lag") {
      arr[i].nextKey = baseYearName;
    } else if (d.nextKey === "Total") {
      arr[i].nextKey = currentYearName;
    } else if (d.nextKey && codeToName[d.nextKey]) {
      arr[i].nextKey = codeToName[d.nextKey];
    }
  });
  
  // Adjust base year if needed (for EUR mode to show at original rate)
  if (baseYearAdjustment !== null) {
    const baseLagIndex = arr.findIndex(d => d.key.includes(String(baseYear)) && d.key.includes('\n'));
    if (baseLagIndex !== -1) {
      arr[baseLagIndex].value += baseYearAdjustment;
      arr[baseLagIndex].accu += baseYearAdjustment;
      
      // Recalculate all subsequent prior and accu values
      for (let i = baseLagIndex + 1; i < arr.length; i++) {
        if (arr[i].key.includes(String(selectYear)) && arr[i].key.includes('\n')) {
          // Skip recalc for final Total (it has prior=0)
          break;
        }
        arr[i].prior = arr[i - 1].accu;
        arr[i].accu = arr[i].prior + arr[i].value;
      }
    }
  }
  
  // Insert FX adjustment if provided (EUR mode)
  if (fxAdjustment !== null && Math.abs(fxAdjustment) > 0.01) {
    // Find the Total (current year) index - should be the last item
    const totalIndex = arr.findIndex(d => d.key.includes(String(selectYear)) && d.key.includes('\n'));
    if (totalIndex !== -1) {
      // Insert FX adjustment before the Total
      const fxItem = {
        YEAR: selectYear,
        key: "FX adjustment",
        value: fxAdjustment,
        nextKey: arr[totalIndex].key,
        accu: arr[totalIndex - 1].accu + fxAdjustment,
        prior: arr[totalIndex - 1].accu
      };
      
      // Update the previous item's nextKey to point to FX adjustment
      if (totalIndex > 0) {
        arr[totalIndex - 1].nextKey = "FX adjustment";
      }
      
      // Insert FX adjustment before the final total
      arr.splice(totalIndex, 0, fxItem);
      
      // Total item should stay as-is: prior=0, accu=value (don't add cumulative FX)
      // The original code already set this correctly when key === "Total"
    }
  }
  
  return arr;
}

// Helper function to get codes with exclusions
export function get_codes_ex(c_table, base_codes, exclude_codes = []) {
  let tree = d3.stratify()
    .id(d => d.code)
    .parentId(d => d.parentCode)(c_table);
  
  let tree_codes = [];
  for (let code of base_codes) {
    let arr = tree.descendants().find(d => d.id == code).copy().descendants().map(d => ({code: d.data.code, name: d.data.name}));
    tree_codes = tree_codes.concat(arr);
  }
  
  let ex_codes = [];
  for (let code of exclude_codes) {
    let arr = tree.descendants().find(d => d.id == code).copy().descendants().map(d => d.data.code);
    ex_codes = ex_codes.concat(arr);
  }
  
  return tree_codes.filter(d => !ex_codes.includes(d.code));
}

// Convert d3.hierarchy to a flat table format
export function hierarchyToTable(root) {
  let table = [];
  root.each((node) => {
    table.push({
      code: node.data.code,
      name: node.data.name,
      parentCode: node.parent ? node.parent.data.code : null
    });
  });
  return table;
}

// Prepare a flat classificator table from raw JSON (deduplicates by code, excludes expired entries)
export function prepClassificator(raw, rootName) {
  return [
    {code: "0", parentCode: null, name: rootName, level: 0},
    ...Array.from(new Map(
      raw.filter(d => d.dateto == null)
         .map(d => ({code: String(d.code), parentCode: d.parentCode ? String(d.parentCode) : "0", name: d.name, level: d.level}))
         .map(d => [d.code, d])
    ).values()).sort((a, b) => Number(a.code) - Number(b.code))
  ];
}

// Build synthetic flat classificator tables from Financial Model categories.
// Returns {incCatCode, expCatCode, synth_table (2-level), synth_table_hier (3-level)}.
export function buildSynthClassificator(modelIncCat, modelExpCat, {
  excludeIncParent = "Capital revenues",
  excludeExpParent = "Capital expenditures",
  rootName = "Current surplus"
} = {}) {
  const incCatNames = [...new Map(modelIncCat.map(d => [d.name, true])).keys()];
  const expCatNames = [...new Map(modelExpCat.map(d => [d.name, true])).keys()];
  const incCatCode = Object.fromEntries(incCatNames.map((n, i) => [n, i + 1]));
  const expCatCode = Object.fromEntries(expCatNames.map((n, i) => [n, incCatNames.length + i + 1]));

  const synth_table = [
    {code: 0, parentCode: null, name: rootName, level: 0},
    ...incCatNames.map(n => ({code: incCatCode[n], parentCode: 0, name: n, level: 1})),
    ...expCatNames.map(n => ({code: expCatCode[n], parentCode: 0, name: n, level: 1})),
  ];

  const incByParent = d3.group(modelIncCat.filter(d => d.parent !== excludeIncParent), d => d.parent);
  const expByParent = d3.group(modelExpCat.filter(d => d.parent !== excludeExpParent), d => d.parent);

  // Dedupe children by name: model categories may have multiple breakEnd ranges
  // sharing the same name (e.g. "Current discretionary expenditure"), which would
  // otherwise produce duplicate sibling nodes with the same code and break
  // aggregation joins downstream.
  const dedupeCats = (cats, codeOf) =>
    [...new Map(cats.map(d => [d.name, {name: d.name, code: codeOf[d.name]}])).values()];

  const synth_table_hier = d3.hierarchy({
    name: rootName, code: 0,
    children: [
      ...[...incByParent].map(([parent, cats], i) => ({
        name: parent, code: (i + 1) * 100,
        children: dedupeCats(cats, incCatCode)
      })),
      ...[...expByParent].map(([parent, cats], i) => ({
        name: parent, code: (incByParent.size + i + 1) * 100,
        children: dedupeCats(cats, expCatCode)
      }))
    ]
  }).descendants().map(node => ({
    code: node.data.code,
    parentCode: node.parent?.data.code ?? null,
    name: node.data.name,
    level: node.depth
  }));

  return {incCatCode, expCatCode, synth_table, synth_table_hier};
}
