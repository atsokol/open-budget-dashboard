import * as d3 from "npm:d3";
import * as aq from "npm:arquero";

// Transform data for waterfall chart (single year - showing components)
export function prepareWaterfallData(data, c_table, codeString, selectCat, selectCity, selectYear, month_max, adjust = false) {
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
      key: d.key === "Total" ? `${selectCat.name}\n${month_max + 1}m ${selectYear}` : d.key
    }));
  
  // Update nextKey references to point to renamed Total
  const totalName = `${selectCat.name}\n${month_max + 1}m ${selectYear}`;
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
    .filter(d => codeMap.map(D => D.code).includes(d.code));
  
  const data_agg = aq.from(data_select)
    .params({selectYear: selectYear, baseYear: baseYear, selectCity: selectCity, month_max: month_max, adjust: adjust})
    .join_left(aq.from(codeMap), "code")
    .derive({
      code: d => d.groupCode,
      value: d => d.FAKT_AMT / 1000000 / (adjust ? 2 : 1)
    })
    .select("CITY", "YEAR", "MONTH", "code", "value")
    .filter(d => d.YEAR == selectYear || d.YEAR == baseYear)
    .groupby("code", "YEAR", "CITY")
    .filter(d => d.MONTH == month_max)
    .rollup({value: aq.op.sum("value")})
    .orderby("code")
    .join_left(aq.from(c_table), "code");
  
  const sumByCol = data_agg
    .groupby("YEAR")
    .rollup({Total: aq.op.sum("value")})
    .derive({Total_lag: aq.op.lag("Total")});
  
  const arr = data_agg
    .groupby("code")
    .derive({value_diff: d => d.value - aq.op.lag(d.value)})
    .groupby("YEAR")
    .pivot("name", "value_diff", {sort: false})
    .join_left(sumByCol, "YEAR")
    .filter(d => d.YEAR == selectYear)
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
        ? `${selectCat.name}\n${month_max + 1}m ${selectYear}` 
        : (d.key === "Total_lag" 
          ? `${selectCat.name}\n${month_max + 1}m ${baseYear}` 
          : d.key)
    }));
  
  // Update nextKey references to point to renamed keys
  const baseYearName = `${selectCat.name}\n${month_max + 1}m ${baseYear}`;
  const currentYearName = `${selectCat.name}\n${month_max + 1}m ${selectYear}`;
  arr.forEach((d, i) => {
    if (d.nextKey === "Total_lag") {
      arr[i].nextKey = baseYearName;
    } else if (d.nextKey === "Total") {
      arr[i].nextKey = currentYearName;
    }
  });
  
  // Adjust base year if needed (for EUR mode to show at original rate)
  if (baseYearAdjustment !== null) {
    const baseLagIndex = arr.findIndex(d => d.key.includes(baseYear.toString()) && d.key.includes('m '));
    if (baseLagIndex !== -1) {
      arr[baseLagIndex].value += baseYearAdjustment;
      arr[baseLagIndex].accu += baseYearAdjustment;
      
      // Recalculate all subsequent prior and accu values
      for (let i = baseLagIndex + 1; i < arr.length; i++) {
        if (arr[i].key.includes(selectYear.toString()) && arr[i].key.includes('m ')) {
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
    const totalIndex = arr.findIndex(d => d.key.includes(selectYear.toString()) && d.key.includes('m '));
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

// Helper function to get all descendant codes from a tree
export function get_codes(c_table, base_codes) {
  let tree = d3.stratify()
    .id(d => d.code)
    .parentId(d => d.parentCode)(c_table);
  
  let tree_codes = [];
  for (let code of base_codes) {
    let arr = tree.descendants().find(d => d.id == code).copy().descendants().map(d => d.data.code);
    tree_codes = tree_codes.concat(arr);
  }
  return tree_codes;
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
