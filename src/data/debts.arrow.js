// Data loader: debts.parquet → Arrow IPC stream
// Columns: REP_PERIOD, FUND_TYP, COD_BUDGET, COD_FINA, NAME_FIN, ZAT_AMT, FAKT_AMT, CITY
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet/src/node.js";
import { tableFromArrays, tableToIPC } from "@uwdata/flechette";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rows = await parquetReadObjects({ file: await asyncBufferFromFile(join(__dirname, "debts.parquet")) });
const n = rows.length;

const CITY = new Array(n);
const REP_PERIOD = new Float64Array(n);
const FUND_TYP = new Array(n);
const COD_BUDGET = new Array(n);
const COD_FINA = new Array(n);   // nullable integer
const NAME_FIN = new Array(n);
const ZAT_AMT = new Float64Array(n);
const FAKT_AMT = new Float64Array(n);

for (let i = 0; i < n; i++) {
  const r = rows[i];
  CITY[i] = r.CITY;
  REP_PERIOD[i] = r.REP_PERIOD.getTime();
  FUND_TYP[i] = r.FUND_TYP;
  COD_BUDGET[i] = r.COD_BUDGET ?? null;
  COD_FINA[i] = r.COD_FINA != null ? Number(r.COD_FINA) : null;
  NAME_FIN[i] = r.NAME_FIN ?? null;
  ZAT_AMT[i] = r.ZAT_AMT ?? 0;
  FAKT_AMT[i] = r.FAKT_AMT ?? 0;
}

const table = tableFromArrays({ CITY, REP_PERIOD, FUND_TYP, COD_BUDGET, COD_FINA, NAME_FIN, ZAT_AMT, FAKT_AMT });
process.stdout.write(tableToIPC(table, { format: "stream" }));
