// Data loader: reverse-subsidy.arrow
// Pre-filters expenses_functional_economic.parquet to rows where COD_CONS_MB_PK === 9110
// (reverse subsidy transfer from state budget to local budget).
// Outputs a small Arrow IPC stream with economic code breakdown for index.md.
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet/src/node.js";
import { tableFromArrays, tableToIPC } from "@uwdata/flechette";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const REVERSE_SUBSIDY_PK_CODE = 9110;

const __dirname = dirname(fileURLToPath(import.meta.url));
const rows = await parquetReadObjects({ file: await asyncBufferFromFile(join(__dirname, "expenses-functional-economic.parquet")) });

const filtered = rows.filter(r => r.COD_CONS_MB_PK === REVERSE_SUBSIDY_PK_CODE);
const n = filtered.length;

const CITY       = new Array(n);
const REP_PERIOD = new Float64Array(n);
const FUND_TYP   = new Array(n);
const COD_CONS_EK = new Float64Array(n);
const ZAT_AMT    = new Float64Array(n);
const PLANS_AMT  = new Float64Array(n);
const FAKT_AMT   = new Float64Array(n);

for (let i = 0; i < n; i++) {
  const r = filtered[i];
  CITY[i]        = r.CITY;
  REP_PERIOD[i]  = r.REP_PERIOD.getTime();
  FUND_TYP[i]    = r.FUND_TYP;
  COD_CONS_EK[i] = r.COD_CONS_EK;
  ZAT_AMT[i]     = r.ZAT_AMT ?? 0;
  PLANS_AMT[i]   = r.PLANS_AMT ?? 0;
  FAKT_AMT[i]    = r.FAKT_AMT ?? 0;
}

const table = tableFromArrays({ CITY, REP_PERIOD, FUND_TYP, COD_CONS_EK, ZAT_AMT, PLANS_AMT, FAKT_AMT });
process.stdout.write(tableToIPC(table, { format: "stream" }));
