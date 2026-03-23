import * as d3 from "npm:d3";
import * as Plot from "npm:@observablehq/plot";

// Horizontal comparison chart showing YoY change across cities
export function HorizontalComparisonChart(data_change, selectCity, indicatorName, month_max, selectYear, baseYear, formatValue = (d) => `${d}`) {
  return Plot.plot({
    title: `Change in ${indicatorName}, ${month_max + 1}m ${selectYear} vs ${baseYear} YoY`,
    marginLeft: 100,
    marginRight: 50,
    label: null,
    x: {
      axis: null,
      percent: true
    },
    color: {
      scheme: "PiYG",
      type: "ordinal"
    },
    marks: [
      Plot.barX(data_change, {
        x: "pct_change",
        y: "city",
        fill: (d) => d.pct_change > 0,
        sort: { y: "x" }
      }),
      Plot.barX(data_change.filter(d => d.city === selectCity), {
        x: "pct_change",
        y: "city",
        fill: "#1f77b4",
        sort: { y: "x" }
      }),
      Plot.gridX({ stroke: "white", strokeOpacity: 0.5 }),
      d3
        .groups(data_change, (d) => d.pct_change > 0)
        .map(([growth, cities]) => [
          Plot.axisY({
            x: 0,
            ticks: cities.map((d) => d.city),
            tickSize: 0,
            anchor: growth ? "left" : "right"
          }),
          Plot.textX(cities, {
            x: "pct_change",
            y: "city",
            text: ((f) => (d) => f(d.pct_change))(d3.format("+.1%")),
            textAnchor: growth ? "start" : "end",
            dx: growth ? 4 : -4,
          })
        ]),
      Plot.ruleX([0])
    ]
  });
}
