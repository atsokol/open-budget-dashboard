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

// Custom Icicle chart function (based on @d3/icicle-component)
export function Icicle(data, {
  id = d => d.code,
  parentId = d => d.parentCode,
  value = d => d.value,
  format = ",.0f",
  label = d => d.name,
  title = (d, n) => `${n.ancestors().reverse().map(d => d.data.name).join(" > ")}\n${n.value.toLocaleString("en")}`,
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
