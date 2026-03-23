// See https://observablehq.com/framework/config for documentation.
export default {
  title: "Ukraine Municipal Budget Analysis",

  pages: [
    {name: "Summary", path: "/"},
    {name: "Revenues", path: "/revenues"},
    {name: "Expenses (Economic)", path: "/expenses-economic"},
    {name: "Expenses (Functional)", path: "/expenses-functional"},
    {name: "Current Surplus", path: "/current-surplus"},
    {name: "City Comparison", path: "/comparison"},
    {name: "Capital Adjustments", path: "/adjustments"}
  ],

  root: "src",
  theme: "light",
  sidebar: true,
  toc: true,
  pager: true,
  search: false,

  footer: "Data: Open Budget Ukraine (openbudget.gov.ua) · Updated monthly"
};
