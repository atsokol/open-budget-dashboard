import * as d3 from "npm:d3";

export function DrilldownWaterfallChart(computeLevel, synth_table_hier, {
  title = "",
  fmt = d => d,
  yLabel = "million UAH",
  width = 1152,
  height = 500,
  comparison = false
} = {}) {
  const MARGIN = {top: 52, right: 20, bottom: 80, left: 60};
  const BAR_STEP = 125;
  const WRAP_CHARS = 14;
  const COLORS = {positive: "#649334", negative: "#cc392b", total: "#1f77b4"};
  const FADE_MS = 400;

  const level1Entries = synth_table_hier.filter(d => d.level === 1);
  const parentsByCode = new Map(level1Entries.map(d => [d.code, d.name]));
  const nameToCode = new Map([...parentsByCode].map(([code, name]) => [name, code]));
  const childCount = new Map();
  synth_table_hier.filter(d => d.level === 2).forEach(d => {
    childCount.set(d.parentCode, (childCount.get(d.parentCode) || 0) + 1);
  });

  let isLevel1 = true;
  let animating = false;
  let savedLevel1Data = null;
  let savedClickedKey = null;
  let savedYScale = null;

  const svg = d3.create("svg")
    .attr("width", width).attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("style", "max-width: 100%; height: auto; font-family: sans-serif;");

  svg.append("text")
    .attr("class", "chart-title")
    .attr("x", MARGIN.left + 20).attr("y", 18)
    .attr("font-size", 18).attr("font-weight", "bold")
    .text(title);

  const breadcrumbG = svg.append("g").attr("class", "breadcrumb");
  const chartG = svg.append("g").attr("class", "chart-content");

  function wrapLabel(text) {
    const lines = [];
    for (const seg of String(text).split("\n")) {
      let cur = "";
      for (const w of seg.split(" ")) {
        const next = cur ? `${cur} ${w}` : w;
        if (cur && next.length > WRAP_CHARS) { lines.push(cur); cur = w; }
        else cur = next;
      }
      if (cur) lines.push(cur);
    }
    return lines;
  }

  function updateBreadcrumb(parentName) {
    breadcrumbG.selectAll("*").remove();
    if (!parentName) return;
    breadcrumbG.append("text")
      .attr("x", MARGIN.left + 20).attr("y", 36)
      .attr("text-anchor", "start")
      .attr("fill", COLORS.total)
      .attr("cursor", "pointer")
      .attr("font-size", "12px")
      .text(`Go back to ${parentName}`)
      .on("click", () => { if (!animating) navigateBack(); });
  }

  function buildScales(data) {
    const W = Math.min(width, MARGIN.left + MARGIN.right + data.length * BAR_STEP);
    const allY = data.flatMap(d => [d.prior, d.accu]);
    const yMin = Math.min(0, ...allY);
    const yMax = Math.max(0, ...allY);
    const yPad = (yMax - yMin) * 0.04;
    const xScale = d3.scaleBand()
      .domain(data.map(d => d.key))
      .range([MARGIN.left, W - MARGIN.right])
      .paddingInner(0.25).paddingOuter(0.1);
    const yScale = d3.scaleLinear()
      .domain([yMin - yPad, yMax + yPad]).nice()
      .range([height - MARGIN.bottom, MARGIN.top]);
    return {W, xScale, yScale};
  }

  // Draws all chart elements into chartG. skipKey bar is placed at its final
  // position immediately; all others grow from the zero line when growOthers=true.
  function drawChartContent(data, xScale, yScale, W, {skipKey = null, growOthers = false} = {}) {
    chartG.append("rect")
      .attr("class", "bg-rect")
      .attr("x", 0).attr("y", 0).attr("width", W).attr("height", height)
      .attr("fill", "transparent")
      .attr("cursor", isLevel1 ? "default" : "pointer")
      .on("click", () => { if (!isLevel1 && !animating) navigateBack(); });

    const connectors = chartG.selectAll("line.connector")
      .data(data.filter(d => d.nextKey != null), d => d.key)
      .join("line").attr("class", "connector")
      .attr("x1", d => xScale(d.key) + xScale.bandwidth())
      .attr("x2", d => xScale(d.nextKey))
      .attr("y1", d => yScale(d.accu)).attr("y2", d => yScale(d.accu))
      .attr("stroke", "#aaa").attr("stroke-dasharray", "4 2").attr("stroke-width", 1)
      .attr("opacity", growOthers ? 0 : 1);
    if (growOthers) connectors.transition().delay(FADE_MS * 2).duration(FADE_MS).attr("opacity", 1);

    chartG.append("line")
      .attr("class", "zero-rule")
      .attr("x1", MARGIN.left).attr("x2", W - MARGIN.right)
      .attr("y1", yScale(0)).attr("y2", yScale(0))
      .attr("stroke", "#555").attr("stroke-dasharray", "4 2").attr("stroke-width", 1);

    const isTotal = (i) => i === data.length - 1 || (comparison && isLevel1 && i === 0);
    const isDrillable = (d, i) =>
      isLevel1 && !isTotal(i) && (childCount.get(nameToCode.get(d.key)) || 0) > 1;
    const barColor = (d, i) =>
      isTotal(i) ? COLORS.total : d.value >= 0 ? COLORS.positive : COLORS.negative;

    const barY = d => yScale(Math.max(d.prior, d.accu));
    const barH = d => Math.max(1, Math.abs(yScale(d.prior) - yScale(d.accu)));

    const bars = chartG.selectAll("rect.bar")
      .data(data, d => d.key)
      .join("rect").attr("class", "bar")
      .attr("x", d => xScale(d.key))
      .attr("width", xScale.bandwidth())
      .attr("fill", (d, i) => barColor(d, i))
      .attr("cursor", (d, i) => isDrillable(d, i) ? "pointer" : "default")
      .on("mouseenter", function(event, d) {
        if (animating) return;
        const i = data.indexOf(d);
        if (isDrillable(d, i)) d3.select(this).attr("fill-opacity", 0.75);
      })
      .on("mouseleave", function() { d3.select(this).attr("fill-opacity", 1); })
      .on("click", (event, d) => {
        if (animating) return;
        event.stopPropagation();
        const i = data.indexOf(d);
        if (!isDrillable(d, i)) return;
        const code = nameToCode.get(d.key);
        if (code) navigateTo(code, d.key);
      });

    if (growOthers) {
      bars
        .attr("y", d => d.key === skipKey ? barY(d) : yScale(0))
        .attr("height", d => d.key === skipKey ? barH(d) : 0);
      bars.filter(d => d.key !== skipKey)
        .transition().duration(FADE_MS * 2).ease(d3.easeCubicOut)
        .attr("y", barY).attr("height", barH);
    } else {
      bars.attr("y", barY).attr("height", barH);
    }

    const labels = chartG.selectAll("text.bar-label")
      .data(data, d => d.key)
      .join("text").attr("class", "bar-label")
      .attr("x", d => xScale(d.key) + xScale.bandwidth() / 2)
      .attr("y", d => d.value >= 0 ? yScale(d.accu) - 5 : yScale(d.accu) + 13)
      .attr("text-anchor", "middle")
      .attr("font-size", "11px").attr("font-weight", "bold").attr("fill", "#333")
      .text(d => fmt(d.value))
      .attr("opacity", growOthers ? 0 : 1);
    if (growOthers) labels.transition().delay(FADE_MS * 1.5).duration(FADE_MS).attr("opacity", 1);

    const xAxisG = chartG.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${height - MARGIN.bottom})`)
      .call(d3.axisBottom(xScale).tickSizeOuter(0));
    xAxisG.select(".domain").remove();
    xAxisG.selectAll(".tick text")
      .each(function(d) {
        const el = d3.select(this).text(null);
        wrapLabel(String(d)).forEach((line, i) => {
          el.append("tspan").attr("x", 0).attr("dy", i === 0 ? "1em" : "1.1em").text(line);
        });
      })
      .attr("font-size", "11px");

    const yAxisG = chartG.append("g")
      .attr("class", "y-axis")
      .attr("transform", `translate(${MARGIN.left},0)`)
      .call(d3.axisLeft(yScale).ticks(6));
    yAxisG.select(".domain").remove();
    yAxisG.append("text")
      .attr("x", -MARGIN.left + 4).attr("y", MARGIN.top - 8)
      .attr("fill", "#555").attr("text-anchor", "start")
      .attr("font-size", "11px").text(`↑ ${yLabel}`);

    if (growOthers) {
      chartG.selectAll(".x-axis, .y-axis")
        .attr("opacity", 0)
        .transition().delay(FADE_MS * 1.5).duration(FADE_MS).attr("opacity", 1);
    }
  }

  function fadeOutOverlay() {
    chartG.selectAll(".x-axis, .y-axis, line.connector, line.zero-rule")
      .transition().duration(FADE_MS * 0.5).attr("opacity", 0);
    chartG.selectAll("text.bar-label")
      .transition().duration(FADE_MS).attr("opacity", 0);
  }

  function renderChart(data) {
    const {W, xScale, yScale} = buildScales(data);
    savedYScale = yScale;
    svg.attr("width", W).attr("viewBox", `0 0 ${W} ${height}`);
    chartG.selectAll("*").remove();

    if (!data || data.length === 0) {
      chartG.append("text")
        .attr("x", W / 2).attr("y", height / 2)
        .attr("text-anchor", "middle").attr("fill", "#999")
        .text("No data for selected period");
      return;
    }

    if (isLevel1) savedLevel1Data = data;
    drawChartContent(data, xScale, yScale, W);
  }

  function navigateTo(pCode, pName) {
    if (animating) return;
    animating = true;
    savedClickedKey = pName;
    isLevel1 = false;

    const parentEntry = synth_table_hier.find(d => d.code === pCode);
    const newData = computeLevel(pCode, parentEntry);
    const {W: newW, xScale: newXScale, yScale: newYScale} = buildScales(newData);
    const newTotalBar = newData.at(-1);

    svg.attr("width", newW).attr("viewBox", `0 0 ${newW} ${height}`);

    fadeOutOverlay();

    // Fade out all bars except the clicked one
    chartG.selectAll("rect.bar").filter(d => d.key !== pName)
      .transition().duration(FADE_MS).attr("opacity", 0);

    // Move clicked bar to the total position in the new scale
    const clickedBar = chartG.selectAll("rect.bar").filter(d => d.key === pName);
    if (clickedBar.empty()) { animating = false; return; }

    clickedBar
      .transition().duration(FADE_MS).ease(d3.easeCubicInOut)
      .attr("x", newXScale(newTotalBar.key))
      .attr("width", newXScale.bandwidth())
      .attr("y", newYScale(Math.max(newTotalBar.prior, newTotalBar.accu)))
      .attr("height", Math.max(1, Math.abs(newYScale(newTotalBar.prior) - newYScale(newTotalBar.accu))))
      .attr("fill", COLORS.total)
      .on("end", () => {
        chartG.selectAll("*").remove();
        drawChartContent(newData, newXScale, newYScale, newW, {
          skipKey: newTotalBar.key,
          growOthers: true
        });
        savedYScale = newYScale;
        updateBreadcrumb(savedLevel1Data.at(-1).key.split("\n")[0]);
        animating = false;
      });
  }

  function navigateBack() {
    if (animating) return;
    animating = true;
    isLevel1 = true;

    const l1Data = savedLevel1Data;
    const pKey = savedClickedKey;
    const curYScale = savedYScale;
    const {W: newW, xScale: newXScale, yScale: newYScale} = buildScales(l1Data);
    const parentBarInL1 = l1Data.find(d => d.key === pKey);

    svg.attr("width", newW).attr("viewBox", `0 0 ${newW} ${height}`);

    fadeOutOverlay();

    const allBars = chartG.selectAll("rect.bar");
    if (allBars.empty()) { animating = false; return; }

    // Shrink subcategory bars (all except last) down to the zero line
    allBars.filter((_, i, nodes) => i !== nodes.length - 1)
      .transition().duration(FADE_MS)
      .attr("y", curYScale(0))
      .attr("height", 0);

    // Move the total bar (last bar) back to the parent's position in level 1
    const totalBarSel = allBars.filter((_, i, nodes) => i === nodes.length - 1);

    if (parentBarInL1) {
      totalBarSel
        .transition().duration(FADE_MS).ease(d3.easeCubicInOut)
        .attr("x", newXScale(pKey))
        .attr("width", newXScale.bandwidth())
        .attr("y", newYScale(Math.max(parentBarInL1.prior, parentBarInL1.accu)))
        .attr("height", Math.max(1, Math.abs(newYScale(parentBarInL1.prior) - newYScale(parentBarInL1.accu))))
        .attr("fill", parentBarInL1.value >= 0 ? COLORS.positive : COLORS.negative)
        .on("end", () => {
          chartG.selectAll("*").remove();
          drawChartContent(l1Data, newXScale, newYScale, newW, {
            skipKey: pKey,
            growOthers: true
          });
          savedYScale = newYScale;
          updateBreadcrumb(null);
          animating = false;
        });
    } else {
      totalBarSel.transition().duration(FADE_MS).attr("opacity", 0)
        .on("end", () => {
          chartG.selectAll("*").remove();
          drawChartContent(l1Data, newXScale, newYScale, newW, {growOthers: true});
          savedYScale = newYScale;
          updateBreadcrumb(null);
          animating = false;
        });
    }
  }

  // Initial render
  renderChart(computeLevel(0, null));
  return svg.node();
}
