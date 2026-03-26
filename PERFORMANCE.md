# Performance Improvements

## Summary of changes

### 1. Parallel data loading ✅
**Files:** `src/index.md`, `src/comparison.md`, `src/current-surplus.md`

All independent `FileAttachment` calls on multi-file pages are now wrapped in `Promise.all([...])`. Files download simultaneously instead of one after another.

- `index.md`: 8 files now fetch in parallel (was 8 sequential awaits)
- `comparison.md` and `current-surplus.md`: 4 files each, now parallel

### 2. Lazy ExcelJS import ✅
**File:** `src/index.md`

The `excel-export.js` static import was replaced with a dynamic `await import(...)` inside the `downloadXlsx()` function. ExcelJS (916 KB) now only loads when the user clicks "Download Excel", not on every page visit.

### 3. Arrow IPC data loaders ✅
**New files:** `src/data/*.arrow.js` (5 loaders)
**Changed files:** all 6 data pages

Five new Observable Framework data loaders convert the raw `.parquet` files to Apache Arrow IPC stream format at build time:

| Loader | Input | Output |
|--------|-------|--------|
| `incomes.arrow.js` | `incomes.parquet` | `incomes.arrow` |
| `expenses.arrow.js` | `expenses.parquet` | `expenses.arrow` |
| `expenses-functional.arrow.js` | `expenses-functional.parquet` | `expenses-functional.arrow` |
| `debts.arrow.js` | `debts.parquet` | `debts.arrow` |
| `credits.arrow.js` | `credits.parquet` | `credits.arrow` |

All pages now use `FileAttachment("data/foo.arrow").arrow()` instead of `.parquet()`.

**Why this matters:**
- `.parquet()` requires `parquet-wasm` (6.4 MB WebAssembly) in the browser
- `.arrow()` uses `apache-arrow` (204 KB) which is already in the bundle
- Arrow IPC is parsed with near-zero CPU cost (no decompression loop)
- Arrow IPC files compress extremely well with gzip: on CDN/Observable Cloud deployments the `.arrow` files are **smaller** than the original `.parquet` files (e.g. `incomes`: 1.6 MB parquet → 0.9 MB arrow+gzip)

> **Note:** The full benefit of the Arrow IPC change is realised when files are served with HTTP gzip/brotli compression, which is the default on Observable Cloud and most modern CDNs. On a local dev server without compression the Arrow files are larger in raw bytes.

---

## Before / After (estimated, per-page first load)

| Page | Before | After |
|------|--------|-------|
| Summary (index) | ~18 MB (11 MB data + 6.4 MB WASM + 0.9 MB ExcelJS) | ~7 MB data + 204 KB Arrow lib |
| Revenues | ~8 MB (1.5 MB data + 6.4 MB WASM) | ~0.9 MB data + 204 KB Arrow lib |
| Expenses (Func) | ~13 MB (6.5 MB data + 6.4 MB WASM) | ~4.4 MB data + 204 KB Arrow lib |
| Comparison | ~11 MB (4.2 MB data + 6.4 MB WASM) | ~2.6 MB data + 204 KB Arrow lib |

*Estimates assume gzip compression. WASM cost is amortised after first load due to browser caching.*

---

## What's still possible (future work)

- **Pre-aggregate index summary** — the index page loads all 5 data files to build a summary table. A `src/data/summary.json.js` data loader could pre-compute the table at build time (~100 KB), further reducing the index page payload.
