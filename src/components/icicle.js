import * as d3 from "npm:d3";
import * as aq from "npm:arquero";

// Helper function to prepare tree table data for icicle charts
export function get_treetab(dataset, c_table, codeString, selectCity, selectYear, month_max, adjust = false) {
  let data_select = dataset
    .filter(d => d.FUND_TYP == "T") 
    .filter(d => d.CITY == selectCity)
    .map(d => ({...d, 
      value: d.FAKT_AMT / 1000000 / (adjust ? 2 : 1),
      code: d[codeString],
      YEAR: d.REP_PERIOD.getUTCFullYear(), 
      MONTH: d.REP_PERIOD.getMonth()
    }))
    .filter(d => d.YEAR == selectYear);

  let data_transform = aq.from(data_select)
    .params({month_max: month_max})
    .filter(d => d.MONTH == month_max)
    .select("code", "value")
    .groupby("code")
    .rollup({value: aq.op.sum("value")})
    .orderby("code");

  const result = aq.from(c_table)
    .join_left(data_transform, "code")
    .objects();
  
  // Get codes that have values
  const codesWithValues = new Set(result.filter(d => d.value != null).map(d => d.code));
  
  // Include codes with values plus their ancestors
  const ancestorCodes = new Set();
  result.forEach(d => {
    if (codesWithValues.has(d.code)) {
      let current = d;
      while (current && current.parentCode != null) {
        ancestorCodes.add(current.parentCode);
        current = result.find(r => r.code === current.parentCode);
      }
    }
  });
  
  // Return only codes with values or their ancestors, ensuring uniqueness
  const uniqueCodes = new Set();
  return result.filter(d => {
    const shouldInclude = codesWithValues.has(d.code) || 
                         ancestorCodes.has(d.code) || 
                         d.parentCode == null;  // Always include root
    
    if (shouldInclude && !uniqueCodes.has(d.code)) {
      uniqueCodes.add(d.code);
      return true;
    }
    return false;
  });
}

// Helper function to prepare tree table data showing differences between two years
export function get_treetab_diff(dataset, c_table, codeString, selectCity, selectYear, baseYear, month_max, adjust = false) {
  const filterAndAggregate = (year) => {
    const data_select = dataset
      .filter(d => d.FUND_TYP == "T")
      .filter(d => d.CITY == selectCity)
      .map(d => ({...d,
        value: d.FAKT_AMT / 1000000 / (adjust ? 2 : 1),
        code: d[codeString],
        YEAR: d.REP_PERIOD.getUTCFullYear(),
        MONTH: d.REP_PERIOD.getMonth()
      }))
      .filter(d => d.YEAR == year);

    return aq.from(data_select)
      .params({month_max: month_max})
      .filter(d => d.MONTH == month_max)
      .select("code", "value")
      .groupby("code")
      .rollup({value: aq.op.sum("value")})
      .orderby("code");
  };

  const data_current = filterAndAggregate(selectYear);
  const data_base = filterAndAggregate(baseYear);

  const result = aq.from(c_table)
    .join_left(data_current, "code")
    .rename({value: "value_current"})
    .join_left(data_base, "code")
    .rename({value: "value_base"})
    .objects()
    .map(d => ({
      ...d,
      value_current: d.value_current ?? 0,
      value_base: d.value_base ?? 0,
      diff: (d.value_current ?? 0) - (d.value_base ?? 0),
      value: Math.max(d.value_current ?? 0, d.value_base ?? 0, 0)
    }));

  // Get codes that have non-zero diffs
  const codesWithValues = new Set(result.filter(d => d.value_current !== 0 || d.value_base !== 0).map(d => d.code));

  // Include codes with values plus their ancestors
  const ancestorCodes = new Set();
  result.forEach(d => {
    if (codesWithValues.has(d.code)) {
      let current = d;
      while (current && current.parentCode != null) {
        ancestorCodes.add(current.parentCode);
        current = result.find(r => r.code === current.parentCode);
      }
    }
  });

  const uniqueCodes = new Set();
  return result.filter(d => {
    const shouldInclude = codesWithValues.has(d.code) ||
                         ancestorCodes.has(d.code) ||
                         d.parentCode == null;

    if (shouldInclude && !uniqueCodes.has(d.code)) {
      uniqueCodes.add(d.code);
      return true;
    }
    return false;
  });
}

// Custom Icicle chart function (based on @d3/icicle-component)
export function Icicle(data, {
  id = d => d.code,
  parentId = d => d.parentCode,
  value = d => d.value,
  format = ",.0f",
  label = d => d.name,
  title = (d, n) => `${d.name}\n${Math.round(n.value).toLocaleString("en")}`,
  width = 1152,
  height = 450,
  margin = 0,
  marginTop = margin,
  marginRight = margin,
  marginBottom = margin,
  marginLeft = margin,
  padding = 1,
  round = false,
  color = d3.interpolateRainbow,
  fill = "#ccc",
  fillOpacity = 0.6
} = {}) {
  // Create hierarchy from flat data
  const root = d3.stratify()
    .id(id)
    .parentId(parentId)(data);
  
  // Compute values
  root.sum(d => Math.max(0, value(d) || 0));
  
  // Sort by descending value
  root.sort((a, b) => d3.descending(a.value, b.value));
  
  // Compute formats
  if (typeof format !== "function") format = d3.format(format);
  
  // Compute partition layout (note x and y are swapped for horizontal layout)
  d3.partition()
    .size([height - marginTop - marginBottom, width - marginLeft - marginRight])
    .padding(padding)
    .round(round)(root);
  
  // Construct color scale
  let colorScale = null;
  if (color != null && root.children) {
    colorScale = d3.scaleSequential([0, root.children.length - 1], color).unknown(fill);
    root.children.forEach((child, i) => child.index = i);
  }
  
  // Create SVG
  const svg = d3.create("svg")
    .attr("viewBox", [-marginLeft, -marginTop, width, height])
    .attr("width", width)
    .attr("height", height)
    .attr("style", "max-width: 100%; height: auto; height: intrinsic;")
    .attr("font-family", "sans-serif")
    .attr("font-size", 10);
  
  // Create cells
  const cell = svg.selectAll("g")
    .data(root.descendants())
    .join("g")
    .attr("transform", d => `translate(${d.y0},${d.x0})`);
  
  cell.append("rect")
    .attr("width", d => d.y1 - d.y0)
    .attr("height", d => d.x1 - d.x0)
    .attr("fill", colorScale ? d => colorScale(d.ancestors().reverse()[1]?.index) : fill)
    .attr("fill-opacity", fillOpacity);
  
  // Add text labels (only for cells with enough height)
  const text = cell.filter(d => d.x1 - d.x0 > 10).append("text")
    .attr("x", 4)
    .attr("y", d => Math.min(9, (d.x1 - d.x0) / 2))
    .attr("dy", "0.32em");
  
    // Label - wrap text if enough space, else truncate
    if (label != null) {
      text.each(function(d) {
        const labelText = label(d.data, d);
        const availableWidth = d.y1 - d.y0 - 8; // subtract padding
        const availableHeight = d.x1 - d.x0 - 4; // subtract padding
        const charWidth = 6; // approximate character width at 10px font
        const lineHeight = 12; // px per line
        const maxCharsPerLine = Math.floor(availableWidth / charWidth);
        const maxLines = Math.floor(availableHeight / lineHeight);
        const valueWidth = format(d.value).length * charWidth + 3;
        const maxLabelChars = Math.floor((availableWidth - valueWidth) / charWidth);
        let lines = [];
        if (maxLines > 1 && labelText.length > maxCharsPerLine) {
          // Word wrap
          let words = labelText.split(/\s+/);
          let line = "";
          for (let word of words) {
            if ((line + word).length > maxCharsPerLine) {
              lines.push(line.trim());
              line = word + " ";
              if (lines.length >= maxLines) break;
            } else {
              line += word + " ";
            }
          }
          if (lines.length < maxLines && line.trim().length > 0) {
            lines.push(line.trim());
          }
          // If still too long, truncate last line
          if (lines.length > maxLines) {
            lines = lines.slice(0, maxLines);
            lines[maxLines-1] = lines[maxLines-1].slice(0, maxCharsPerLine-1) + "…";
          }
          lines.forEach((l, i) => {
            d3.select(this)
              .append("tspan")
              .attr("x", 4)
              .attr("y", 8 + i * lineHeight)
              .text(l);
          });
        } else {
          // Truncate if not enough space
          let out = labelText;
          if (labelText.length > maxLabelChars && maxLabelChars > 3) {
            out = labelText.slice(0, maxLabelChars - 1) + "…";
          }
          d3.select(this)
            .append("tspan")
            .attr("x", 4)
            .attr("y", 8)
            .text(out);
        }
      });
    }
  
  // Value
  text.append("tspan")
    .attr("fill-opacity", 0.7)
    .attr("dx", label == null ? null : 3)
    .text(d => format(d.value));
  
  // Add titles
  if (title != null) {
    cell.append("title")
      .text(d => title(d.data, d));
  }
  
  return svg.node();
}

// Icicle chart for year-over-year differences (green = increase, red = decrease)
export function IcicleDiff(data, {
  id = d => d.code,
  parentId = d => d.parentCode,
  value = d => d.value,
  diff = d => d.diff,
  format = ",.0f",
  label = d => d.name,
  title = (d, n) => {
    const sign = n._diff >= 0 ? "+" : "";
    const fmt = v => Math.round(v).toLocaleString("en");
    return `${d.name}\nBase: ${fmt(n._base)}\nCurrent: ${fmt(n._current)}\nDiff: ${sign}${fmt(n._diff)}`;
  },
  width = 1152,
  height = 450,
  margin = 0,
  marginTop = margin,
  marginRight = margin,
  marginBottom = margin,
  marginLeft = margin,
  padding = 1,
  round = false,
  fillOpacity = 0.75
} = {}) {
  // Create hierarchy from flat data
  const root = d3.stratify()
    .id(id)
    .parentId(parentId)(data);

  // Size by max of base and current year values (ensures parent = sum of children)
  const sizeAccessor = d => Math.max(0, d.value_base || 0, d.value_current || 0);
  root.sum(sizeAccessor);

  // Sort by descending value
  root.sort((a, b) => d3.descending(a.value, b.value));

  if (typeof format !== "function") format = d3.format(format);

  d3.partition()
    .size([height - marginTop - marginBottom, width - marginLeft - marginRight])
    .padding(padding)
    .round(round)(root);

  // Compute the aggregate diff, base and current for each node
  root.each(d => {
    if (d.children) {
      d._diff = d.leaves().reduce((s, l) => s + (diff(l.data) || 0), 0);
      d._base = d.leaves().reduce((s, l) => s + (l.data.value_base || 0), 0);
      d._current = d.leaves().reduce((s, l) => s + (l.data.value_current || 0), 0);
    } else {
      d._diff = diff(d.data) || 0;
      d._base = d.data.value_base || 0;
      d._current = d.data.value_current || 0;
    }
  });

  // Build a diverging color scale on absolute diff
  const maxAbsDiff = d3.max(root.descendants(), d => Math.abs(d._diff)) || 1;
  const colorScale = d3.scaleDiverging()
    .domain([-maxAbsDiff, 0, maxAbsDiff])
    .interpolator(d3.interpolateRdYlGn);

  const svg = d3.create("svg")
    .attr("viewBox", [-marginLeft, -marginTop, width, height])
    .attr("width", width)
    .attr("height", height)
    .attr("style", "max-width: 100%; height: auto; height: intrinsic;")
    .attr("font-family", "sans-serif")
    .attr("font-size", 10);

  const cell = svg.selectAll("g")
    .data(root.descendants())
    .join("g")
    .attr("transform", d => `translate(${d.y0},${d.x0})`);

  cell.append("rect")
    .attr("width", d => d.y1 - d.y0)
    .attr("height", d => d.x1 - d.x0)
    .attr("fill", d => colorScale(d._diff))
    .attr("fill-opacity", fillOpacity);

  const text = cell.filter(d => d.x1 - d.x0 > 10).append("text")
    .attr("x", 4)
    .attr("y", d => Math.min(9, (d.x1 - d.x0) / 2))
    .attr("dy", "0.32em");

  if (label != null) {
    text.each(function(d) {
      const labelText = label(d.data, d);
      const availableWidth = d.y1 - d.y0 - 8;
      const availableHeight = d.x1 - d.x0 - 4;
      const charWidth = 6;
      const lineHeight = 12;
      const maxCharsPerLine = Math.floor(availableWidth / charWidth);
      const maxLines = Math.floor(availableHeight / lineHeight);
      const diffVal = d._diff;
      const sign = diffVal >= 0 ? "+" : "";
      const valueStr = `${sign}${format(diffVal)}`;
      const valueWidth = valueStr.length * charWidth + 3;
      const maxLabelChars = Math.floor((availableWidth - valueWidth) / charWidth);
      let lines = [];
      if (maxLines > 1 && labelText.length > maxCharsPerLine) {
        let words = labelText.split(/\s+/);
        let line = "";
        for (let word of words) {
          if ((line + word).length > maxCharsPerLine) {
            lines.push(line.trim());
            line = word + " ";
            if (lines.length >= maxLines) break;
          } else {
            line += word + " ";
          }
        }
        if (lines.length < maxLines && line.trim().length > 0) {
          lines.push(line.trim());
        }
        if (lines.length > maxLines) {
          lines = lines.slice(0, maxLines);
          lines[maxLines-1] = lines[maxLines-1].slice(0, maxCharsPerLine-1) + "…";
        }
        lines.forEach((l, i) => {
          d3.select(this)
            .append("tspan")
            .attr("x", 4)
            .attr("y", 8 + i * lineHeight)
            .text(l);
        });
      } else {
        let out = labelText;
        if (labelText.length > maxLabelChars && maxLabelChars > 3) {
          out = labelText.slice(0, maxLabelChars - 1) + "…";
        }
        d3.select(this)
          .append("tspan")
          .attr("x", 4)
          .attr("y", 8)
          .text(out);
      }
    });
  }

  // Value — show signed diff
  text.append("tspan")
    .attr("fill-opacity", 0.7)
    .attr("dx", label == null ? null : 3)
    .text(d => {
      const sign = d._diff >= 0 ? "+" : "";
      return `${sign}${format(d._diff)}`;
    });

  if (title != null) {
    cell.append("title")
      .text(d => title(d.data, d));
  }

  return svg.node();
}
