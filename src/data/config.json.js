// Data loader: Configuration
// Converts config.yaml to JSON for dashboard consumption

import * as fs from "fs";
import * as yaml from "js-yaml";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const configPath = path.join(__dirname, "../../config.yaml");
const configYaml = fs.readFileSync(configPath, "utf8");
const config = yaml.load(configYaml);

const result = {
  summaryIncomeCategories:    config.summary_income_categories,
  summaryExpenseCategories:   config.summary_expense_categories,
  modelIncomeCategories:      config.model_income_categories,
  modelExpenseCategories:     config.model_expense_categories,
  financingCodes:             config.financing_codes,
  cashCodes:                  config.cash_codes,
  summaryTotals:              config.summary_totals,
  summaryRowOrder:            config.summary_row_order,
  colors:                     config.colors
};

process.stdout.write(JSON.stringify(result));
