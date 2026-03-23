import * as Plot from "npm:@observablehq/plot";

// Year-over-year comparison chart showing difference between two years
export function YoYComparisonChart(data_pivot, selectCity, indicatorName, selectYear, baseYear, formatValue = (d) => `${d}`, yLabel = "Amount") {
  return Plot.plot({
    title: `${indicatorName} dynamics in ${selectCity}`,
    marginLeft: 50,
    marginRight: 50,
    x: {
      transform: (d) => new Date(2021, d, 1),
      tickFormat: "%b",
      line: true,
      label: null
    },
    y: { nice: true, grid: true, zero: true, label: yLabel, tickFormat: formatValue },
    color: { scheme: "RdYlBu", label: "colder" },
    marks: [
      Plot.differenceY(data_pivot.filter(d => d.city == selectCity), {
        x: "month",
        y1: "current",
        y2: "base",
        positiveFill: () => "1",
        negativeFill: () => "2",
        curve: "catmull-rom",
        tip: true
      }),
      Plot.text(
        data_pivot.filter(d => d.city == selectCity),
        Plot.selectMaxY({
          x: "month",
          y: "current",
          text: () => `Current year (${selectYear})` ,
          dy: -6
        })
      ),
      Plot.text(
        data_pivot.filter(d => d.city == selectCity),
        Plot.selectMaxY({
          x: "month",
          y: "base",
          text: () => `Base year (${baseYear})`,
          dy: -6
        })
      ),
    ]
  });
}
