// Data loader: expenses-functional.parquet → Arrow IPC stream
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet/src/node.js";
import { tableFromArrays, tableToIPC } from "@uwdata/flechette";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rows = await parquetReadObjects({ file: await asyncBufferFromFile(join(__dirname, "expenses-functional.parquet")) });
const n = rows.length;

const CITY = new Array(n);
const REP_PERIOD = new Float64Array(n);
const FUND_TYP = new Array(n);
const COD_CONS_MB_FK = new Array(n);
const ZAT_AMT = new Float64Array(n);
const PLANS_AMT = new Float64Array(n);
const FAKT_AMT = new Float64Array(n);

for (let i = 0; i < n; i++) {
  const r = rows[i];
  CITY[i] = r.CITY;
  REP_PERIOD[i] = r.REP_PERIOD.getTime();
  FUND_TYP[i] = r.FUND_TYP;
  COD_CONS_MB_FK[i] = String(r.COD_CONS_MB_FK).padStart(4, '0');
  ZAT_AMT[i] = r.ZAT_AMT ?? 0;
  PLANS_AMT[i] = r.PLANS_AMT ?? 0;
  FAKT_AMT[i] = r.FAKT_AMT ?? 0;
}

const table = tableFromArrays({ CITY, REP_PERIOD, FUND_TYP, COD_CONS_MB_FK, ZAT_AMT, PLANS_AMT, FAKT_AMT });
process.stdout.write(tableToIPC(table, { format: "stream" }));
