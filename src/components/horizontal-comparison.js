import * as d3 from "npm:d3";
import * as Plot from "npm:@observablehq/plot";

// Cross-city ratio chart (e.g. own revenues share, CS/revenue ratio)
export function CityRatioChart(data, selectCity, title, format) {
  return Plot.plot({
    title,
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
      Plot.barX(data, {
        x: "value",
        y: "city",
        fill: d => d.value > 0,
        sort: { y: "x" }
      }),
      Plot.barX(data.filter(d => d.city === selectCity), {
        x: "value",
        y: "city",
        fill: "#1f77b4",
        sort: { y: "x" }
      }),
      Plot.gridX({ stroke: "white", strokeOpacity: 0.5 }),
      d3
        .groups(data, d => d.value > 0)
        .map(([positive, cities]) => [
          Plot.axisY({
            x: 0,
            ticks: cities.map(d => d.city),
            tickSize: 0,
            anchor: positive ? "left" : "right"
          }),
          Plot.textX(cities, {
            x: "value",
            y: "city",
            text: d => format(d.value),
            textAnchor: positive ? "start" : "end",
            dx: positive ? 4 : -4
          })
        ]),
      Plot.ruleX([0])
    ]
  });
}

const periodLabel = (month_max, year) =>
  month_max === 11 ? `${year}` : `${month_max + 1}m ${year}`;

// Horizontal comparison chart showing YoY change across cities
export function HorizontalComparisonChart(data_change, selectCity, indicatorName, month_max, selectYear, baseYear) {
  return Plot.plot({
    title: `Change in ${indicatorName}, ${periodLabel(month_max, selectYear)} vs ${baseYear} YoY`,
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
