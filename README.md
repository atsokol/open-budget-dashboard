# Ukraine Municipal Budget Analysis

An interactive dashboard for analyzing municipal budgets of Ukrainian cities, built with [Observable Framework](https://observablehq.com/framework/).

## Pages

- **Summary** — high-level financial overview across all budget categories
- **Revenues** — revenue trends and waterfall charts by income category
- **Expenses (Economic)** — expense analysis by economic classification
- **Expenses (Functional)** — expense analysis by functional classification
- **Current Surplus** — non-capital revenues minus expenses
- **City Comparison** — cross-city comparison of key financial indicators
- **Capital Adjustments** — configure which codes are considered capital vs. current

## Data

Budget data is sourced as Parquet files from [openbudget-data-update](https://github.com/atsokol/openbudget-data-update). The `fetch-data` script downloads five datasets before each build:

- `incomes.parquet`
- `expenses.parquet`
- `expenses-functional.parquet`
- `debts.parquet`
- `credits.parquet`

Static classificator lookups (KDB, KEKV, FKV) are stored as JSON in `src/data/classificators/`.

## Getting started

Requires Node.js ≥ 18.

```bash
npm install
npm run dev
```

This will fetch the latest data and start a local dev server.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Fetch data and start the dev server |
| `npm run build` | Fetch data and build the static site |
| `npm run deploy` | Build and deploy to Observable Cloud |
| `npm run fetch-data` | Download latest Parquet files |
| `npm run clean` | Remove generated files |

## Tech stack

- [Observable Framework](https://observablehq.com/framework/) — static site generator for data apps
- [D3](https://d3js.org/) — data visualization
- [Arquero](https://uwdata.github.io/arquero/) — data transformation
- [Apache Arrow / Parquet](https://arrow.apache.org/) — columnar data format
