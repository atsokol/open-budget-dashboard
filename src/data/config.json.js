// Data loader: Configuration
// Converts config.yaml to JSON for dashboard consumption

import * as fs from "fs";
import * as yaml from "js-yaml";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read config.yaml from project root
const configPath = path.join(__dirname, "../../config.yaml");
const configYaml = fs.readFileSync(configPath, "utf8");
const config = yaml.load(configYaml);

// Create flattened structures for easy dashboard consumption
const result = {
  // City lookup: name -> codes array
  cities: config.cities.map(city => ({
    name: city.name,
    codes: city.codes
  })),
  
  // City codes -> name lookup (flattened)
  cityLookup: Object.fromEntries(
    config.cities.flatMap(city => 
      city.codes.map(code => [code, city.name])
    )
  ),
  
  // Revenue categories with colors
  revenueCategories: config.revenue_categories.map(cat => ({
    name: cat.name,
    color: cat.color,
    type: cat.type,
    codes: cat.codes
  })),
  
  // Expense categories with colors
  expenseCategories: config.expense_economic_categories.map(cat => ({
    name: cat.name,
    color: cat.color,
    type: cat.type,
    codes: cat.codes
  })),
  
  // Color schemes
  colors: config.colors
};

// Output JSON
process.stdout.write(JSON.stringify(result));
