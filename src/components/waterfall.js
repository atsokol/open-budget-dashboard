import * as d3 from "npm:d3";
import * as Plot from "npm:@observablehq/plot";

// Helper function for waterfall chart labels
function plotLabel(data, dy, fmt) {
  return Plot.text(data, {
    x: "key",
    y: "accu",
    dy: dy,
    fontWeight: "bold",
    text: d => fmt(d.value)
  });
}

// Waterfall chart for single year (showing components building to total)
export function WaterfallChart(data, title, fmt, yLabel = "million UAH") {
  const colorDomain = ["Increase", "Decrease", "Total"];
  const colorRange = ["#649334", "#cc392b", "#1f77b4"];

  return Plot.plot({
    title: title,
    width: Math.min(1152, data.length * 125),
    x: {
      align: 0,
      round: false,
      domain: data.map(d => d.key)
    },
    y: {
      grid: true,
      nice: true,
      label: yLabel
    },
    color: {
      domain: colorDomain,
      range: colorRange
    },
    marks: [
      Plot.barY(data, {
        x: "key",
        y1: "prior",
        y2: "accu",
        fill: (d, i) => i === data.length - 1 ? "Total" : d.value >= 0 ? "Increase" : "Decrease",
        title: d => `${d.key}\nProfit: ${fmt(d.value)}\nRunning Total: ${fmt(d.accu)}`
      }),
      Plot.ruleY(data.filter(d => d.nextKey != null), {
        x1: "key",
        x2: "nextKey",
        y: "accu",
        strokeDasharray: "1.5"
      }),
      Plot.ruleY([0], {strokeDasharray: "1.5"}),
      plotLabel(data.filter(d => d.value >= 0), -7, fmt),
      plotLabel(data.filter(d => d.value < 0), 7, fmt),
      Plot.axisX({label: null, lineWidth: 8.5, fontSize: 12, marginBottom: 70})
    ]
  });
}

// Waterfall chart for year-over-year comparison (showing changes)
export function WaterfallComparisonChart(data, title, fmt, yLabel = "million UAH") {
  const colorDomain = ["Increase", "Decrease", "Total"];
  const colorRange = ["#649334", "#cc392b", "#1f77b4"];

  return Plot.plot({
    title: title,
    width: Math.min(1152, data.length * 125),
    x: {
      align: 0,
      round: false,
      domain: data.map(d => d.key)
    },
    y: {
      grid: true,
      nice: true,
      label: yLabel
    },
    color: {
      domain: colorDomain,
      range: colorRange
    },
    marks: [
      Plot.barY(data, {
        x: "key",
        y1: "prior",
        y2: "accu",
        fill: (d, i) => (i === 0 || i === data.length - 1) ? "Total" : d.value >= 0 ? "Increase" : "Decrease",
        title: d => `${d.key}\nProfit: ${fmt(d.value)}\nRunning Total: ${fmt(d.accu)}`
      }),
      Plot.ruleY(data.filter(d => d.nextKey != null), {
        x1: "key",
        x2: "nextKey",
        y: "accu",
        strokeDasharray: "1.5"
      }),
      Plot.ruleY([0], {strokeDasharray: "1.5"}),
      plotLabel(data.filter(d => d.value >= 0), -7, fmt),
      plotLabel(data.filter(d => d.value < 0), 7, fmt),
      Plot.axisX({label: null, lineWidth: 8.5, fontSize: 12, marginBottom: 70})
    ]
  });
}
