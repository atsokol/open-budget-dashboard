import * as Plot from "npm:@observablehq/plot";

// Trends chart showing indicator dynamics across multiple years
export function TrendsChart(data, selectCity, indicatorName, indicator, formatValue = (d) => `${d}`, yLabel = "Amount") {
  return Plot.plot({
    title: `${indicatorName} dynamics in ${selectCity}`,
    marginLeft: 50,
    marginRight: 30,
    x: {
      transform: (d) => new Date(2021, d.getMonth(), d.getDay()),
      tickFormat: "%b",
      line: true,
      label: null
    },
    y: { nice: true, grid: true, zero: true, label: yLabel, tickFormat: formatValue},
    color: {type: "categorical", legend: false},
    marks: [
      Plot.line(data.filter(d => d.CITY == selectCity), {
        x: "REP_PERIOD",
        y: indicator,
        stroke: d => String(d.REP_PERIOD.getUTCFullYear()),
        curve: "catmull-rom"
      }),
      Plot.text(
        data.filter(d => d.CITY == selectCity),
        Plot.selectLast({
          x: "REP_PERIOD",
          y: indicator,
          text: d => String(d.REP_PERIOD.getUTCFullYear()),
          fill: d => String(d.REP_PERIOD.getUTCFullYear()),
          dy: -6,
          dx: 12
        })
      ),
    ]
  });
}
