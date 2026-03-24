// combi-tree.js
// Defines the English-label hierarchy used for current surplus waterfall charts.
// Maps INC (KDB) income codes + KEKV economic expense codes into a unified tree
// whose top-level nodes become the waterfall chart bars.
// Ported from the Observable notebook's new_combi_tree definition.

import * as d3 from "npm:d3";
import { get_codes_ex, hierarchyToTable } from "./waterfall-data.js";

/**
 * Build the flat combi_table used by waterfall functions.
 * @param {Array} inck_table - Prepared KDB income classificator (with root {code:0})
 * @param {Array} kek_table  - Prepared KEKV expense classificator (with root {code:0})
 * @param {Set} [capIncSet]  - Set of capital income codes (leaf codes from localStorage).
 *                             If omitted, defaults are expanded internally.
 * @returns {Array} flat table with {code, name, parentCode}
 */
export function buildCombiTable(inck_table, kek_table, capIncSet) {
  // If no capIncSet provided, expand default parent codes to all descendants
  if (!capIncSet) {
    const defParents = [30000000, 42000000, 21050000, 24110000, 21010500, 21010700, 21010800, 21010900];
    capIncSet = new Set();
    const incTree = d3.stratify().id(d => d.code).parentId(d => d.parentCode)(inck_table);
    for (const pc of defParents) {
      const node = incTree.descendants().find(d => d.id == pc);
      if (node) node.copy().descendants().forEach(d => capIncSet.add(d.data.code));
    }
  }

  const notCap = d => !capIncSet.has(d.code);

  const tree = d3.hierarchy({
    name: "root",
    code: 0,
    children: [
      // ── Income categories ──────────────────────────────────────────────
      {
        name: "Tax revenues",
        code: 100000000,
        children: [
          {
            name: "Personal income tax",
            code: 110100000,
            children: get_codes_ex(inck_table, [11010000]).filter(notCap)
          },
          {
            name: "Unified income tax",
            code: 180500000,
            children: get_codes_ex(inck_table, [18050000]).filter(notCap)
          },
          {
            name: "Other tax revenues",
            code: 100000001,
            children: get_codes_ex(inck_table, [10000000], [11010000, 18050000]).filter(notCap)
          }
        ]
      },
      {
        name: "Non-tax revenues",
        code: 200000000,
        children: get_codes_ex(inck_table, [20000000, 50000000]).filter(notCap)
      },
      {
        name: "Capital revenues",
        code: 300000000,
        children: inck_table
          .filter(d => d.code !== 0 && capIncSet.has(d.code))
          .map(d => ({code: d.code, name: d.name}))
      },
      {
        name: "Incoming Transfers",
        code: 400000000,
        children: get_codes_ex(inck_table, [40000000]).filter(notCap)
      },
      // ── Expense categories ─────────────────────────────────────────────
      {
        name: "Staff costs",
        code: 21000,
        children: get_codes_ex(kek_table, [2100])
      },
      {
        name: "Purchase of materials",
        code: 22000,
        children: get_codes_ex(kek_table, [2210, 2220, 2230, 2240])
      },
      {
        name: "Discretionary expenditures",
        code: 22500,
        children: get_codes_ex(kek_table, [2250, 2260, 2282, 2800, 9000])
      },
      {
        name: "Utility payments",
        code: 22700,
        children: get_codes_ex(kek_table, [2270])
      },
      {
        name: "Capital expenditures",
        code: 30000,
        children: get_codes_ex(kek_table, [3100, 2281])
      },
      {
        name: "Capital transfers",
        code: 32000,
        children: get_codes_ex(kek_table, [3200])
      },
      {
        name: "Outgoing transfers",
        code: 26000,
        children: get_codes_ex(kek_table, [2600, 2700])
      },
      {
        name: "Interest paid",
        code: 24000,
        children: get_codes_ex(kek_table, [2400])
      }
    ]
  });

  return hierarchyToTable(tree);
}
