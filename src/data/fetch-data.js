#!/usr/bin/env node
// Pre-build script: downloads parquet files from GitHub and saves locally.
// Run via: npm run fetch-data  (also triggered automatically by prebuild / predev)

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_URL = "https://raw.githubusercontent.com/atsokol/openbudget-data-update/main/data/parquet";

const FILES = [
  { remote: "incomes.parquet",                        local: "incomes.parquet" },
  { remote: "expenses.parquet",                       local: "expenses.parquet" },
  { remote: "expenses_functional.parquet",            local: "expenses-functional.parquet" },
  { remote: "expenses_functional_economic.parquet",   local: "expenses-functional-economic.parquet" },
  { remote: "debts.parquet",                          local: "debts.parquet" },
  { remote: "credits.parquet",                        local: "credits.parquet" },
];

for (const { remote, local } of FILES) {
  const url = `${BASE_URL}/${remote}`;
  const dest = join(__dirname, local);
  console.error(`Fetching ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = await res.arrayBuffer();
  writeFileSync(dest, Buffer.from(buf));
  console.error(`  → saved ${local} (${(buf.byteLength / 1024).toFixed(0)} KB)`);
}

console.error("fetch-data: done");
