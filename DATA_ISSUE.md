# Functional Expenses Data Duplication Issue

## Summary

The `expenses_functional.parquet` file from `atsokol/openbudget-data-update` contains inflated `FAKT_AMT` values. The total of functional expenses (`FUND_TYP = 'T'`) is exactly **2× the total of economic expenses** for the same city/period, even though both datasets represent the same underlying budget expenditures classified differently.

## Evidence

Cherkasy, December 2024, `FUND_TYP = 'T'`:

| Dataset | Rows | SUM(FAKT_AMT) |
|---------|------|----------------|
| `expenses.parquet` (economic) | 28 | 4,712,566,611 |
| `expenses_functional.parquet` | 40 | 9,425,133,222 |

**Ratio: 2.000x**

The ratio varies across years (~6× in 2021, ~2× in 2024), confirming this is a data generation issue rather than a fixed multiplier.

## What was ruled out (dashboard code is correct)

- **No row duplication**: Each functional code (`COD_CONS_MB_FK`) appears exactly once per city/period/fund_type
- **No classificator overlap**: FKV.json has 0 duplicate active codes; none of the 40 data codes are ancestors of other data codes in the tree
- **No double-counting in aggregation**: The dashboard aggregates each parquet file independently; functional and economic data are never mixed in the same calculation
- **FUND_TYP filtering is correct**: Code filters for `'T'` (total) consistently

## How to reproduce

Run these queries against the parquet files in `openbudget-data-update/data/parquet/`:

```sql
-- Compare totals for any city/month
SELECT 'economic' AS src, SUM(FAKT_AMT) AS total
FROM read_parquet('expenses.parquet')
WHERE CITY = 'Cherkasy'
  AND YEAR(REP_PERIOD) = 2024
  AND MONTH(REP_PERIOD) = 12
  AND FUND_TYP = 'T'

UNION ALL

SELECT 'functional' AS src, SUM(FAKT_AMT) AS total
FROM read_parquet('expenses_functional.parquet')
WHERE CITY = 'Cherkasy'
  AND YEAR(REP_PERIOD) = 2024
  AND MONTH(REP_PERIOD) = 12
  AND FUND_TYP = 'T';
```

Expected: both totals should be approximately equal (same expenditures, different classification).

```sql
-- Check the ratio across multiple years
SELECT yr,
       SUM(CASE WHEN src = 'econ' THEN total END) AS econ,
       SUM(CASE WHEN src = 'func' THEN total END) AS func,
       SUM(CASE WHEN src = 'func' THEN total END)
         / SUM(CASE WHEN src = 'econ' THEN total END) AS ratio
FROM (
  SELECT 'econ' AS src, YEAR(REP_PERIOD) AS yr, SUM(FAKT_AMT) AS total
  FROM read_parquet('expenses.parquet')
  WHERE CITY = 'Cherkasy' AND MONTH(REP_PERIOD) = 12 AND FUND_TYP = 'T'
  GROUP BY 2
  UNION ALL
  SELECT 'func' AS src, YEAR(REP_PERIOD) AS yr, SUM(FAKT_AMT) AS total
  FROM read_parquet('expenses_functional.parquet')
  WHERE CITY = 'Cherkasy' AND MONTH(REP_PERIOD) = 12 AND FUND_TYP = 'T'
  GROUP BY 2
)
GROUP BY 1
ORDER BY 1;
```

## Where to look in the data pipeline

The issue is in the code that generates `expenses_functional.parquet`. Likely causes:

1. **Aggregation before export**: The pipeline may be summing across a dimension it shouldn't (e.g., `COD_CONS_MB_PK` sub-programs) and then also keeping the already-aggregated parent rows, effectively doubling amounts.
2. **FUND_TYP generation**: The `'T'` (total) rows might be computed as `C + S` from data that already includes totals, or from data that was already pre-aggregated.
3. **Join producing duplicates**: A join on functional codes might be multiplying rows if the join key isn't unique on one side.

Check the ETL step that:
- Reads raw expense data from the OpenBudget API
- Groups/aggregates by `COD_CONS_MB_FK` (functional classification code)
- Writes the final parquet file
