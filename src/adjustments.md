---
title: Capital Adjustments
toc: false
---

# Capital Adjustments

Configure which budget categories should be excluded from the current surplus calculation. Current surplus represents the difference between current (non-capital) revenues and current (non-capital) expenditures.

```js
Inputs.button("Reset to Defaults", {
  reduce: () => {
    sessionStorage.removeItem('capitalSettingsVersion');
    sessionStorage.removeItem('capitalIncomeCodes');
    sessionStorage.removeItem('capitalExpenseCodes');
    location.reload();
  }
})
```

```js
// Load config and classificators
import {defaultCapitalIncomeCodes, defaultCapitalExpenseCodes, categorize} from "./components/capital-defaults.js";
const cfg = await FileAttachment("data/config.json").json();
const inck_table = await FileAttachment("data/classificators/KDB.json").json();
const kek_table = await FileAttachment("data/classificators/KEKV.json").json();

// Prepare classificator tables with deduplication and convert codes to numbers
const inck_prep = Array.from(new Map(
  inck_table
    .filter(d => d.dateto == null)  // Only active codes
    .map(d => ({code: +d.code, parentCode: d.parentCode ? +d.parentCode : 0, name: d.name, level: d.level}))
    .map(d => [d.code, d])
).values()).sort((a, b) => a.code - b.code);

const kek_prep = Array.from(new Map(
  kek_table
    .filter(d => d.dateto == null)  // Only active codes
    .map(d => ({code: +d.code, parentCode: d.parentCode ? +d.parentCode : 0, name: d.name, level: d.level}))
    .map(d => [d.code, d])
).values()).sort((a, b) => a.code - b.code);

// Load data to filter tree to codes present for the selected city
const selectedCity = sessionStorage.getItem("selectedCity");
const [inc_raw, exp_raw] = await Promise.all([
  FileAttachment("data/incomes.arrow").arrow(),
  FileAttachment("data/expenses.arrow").arrow()
]);
const presentIncCodes = new Set(
  [...inc_raw].filter(r => !selectedCity || r.CITY === selectedCity).map(r => Number(r.COD_INCO))
);
const presentExpCodes = new Set(
  [...exp_raw].filter(r => !selectedCity || r.CITY === selectedCity).map(r => Number(r.COD_CONS_EK))
);

// Default selections derived from config categories
const defaultCapIncCodes = defaultCapitalIncomeCodes(inck_prep, presentIncCodes, cfg.summaryIncomeCategories);
const defaultCapExpCodes = defaultCapitalExpenseCodes(kek_prep, cfg.summaryExpenseCategories);

// Version key to invalidate cached sessionStorage when defaults change
const CAPITAL_SETTINGS_VERSION = "v4";
const versionKey = sessionStorage.getItem('capitalSettingsVersion');
if (versionKey !== CAPITAL_SETTINGS_VERSION) {
  sessionStorage.removeItem('capitalIncomeCodes');
  sessionStorage.removeItem('capitalExpenseCodes');
  sessionStorage.setItem('capitalSettingsVersion', CAPITAL_SETTINGS_VERSION);
}

// Load saved selections from sessionStorage or use defaults
const loadSavedIncomeCodes = () => {
  const saved = sessionStorage.getItem('capitalIncomeCodes');
  if (saved) return JSON.parse(saved);
  sessionStorage.setItem('capitalIncomeCodes', JSON.stringify(defaultCapIncCodes));
  return defaultCapIncCodes;
};

const loadSavedExpenseCodes = () => {
  const saved = sessionStorage.getItem('capitalExpenseCodes');
  if (saved) return JSON.parse(saved);
  sessionStorage.setItem('capitalExpenseCodes', JSON.stringify(defaultCapExpCodes));
  return defaultCapExpCodes;
};

// Build hierarchical structure - check for both null and 0 as root
function buildHierarchy(flatData, parentCode = null) {
  const items = flatData.filter(d => d.parentCode === parentCode || (parentCode === null && d.parentCode === 0));
  return items.map(d => ({
    ...d,
    children: buildHierarchy(flatData, d.code)
  }));
}

// Get all descendant codes
function getDescendantCodes(node, flatData) {
  const codes = [node.code];
  const children = flatData.filter(d => d.parentCode === node.code);
  children.forEach(child => {
    codes.push(...getDescendantCodes(child, flatData));
  });
  return codes;
}
```

## Income Categories to Exclude

Select income categories that should be treated as **capital (non-current)** revenues and excluded from current surplus calculation:

```js
// Build income hierarchy (all levels)

const incomeHierarchy = buildHierarchy(inck_prep.filter(d => d.level > 0));
```

```js
// Render income tree with vanilla JS DOM manipulation
{
  const container = document.createElement('div');
  container.className = 'tree-container';
  
  const countDisplay = document.createElement('div');
  countDisplay.className = 'note';
  
  let currentSelection = new Set(loadSavedIncomeCodes());
  
  // Get leaf codes (codes that are not parent of any other code)
  const parentCodes = new Set(inck_prep.map(d => d.parentCode).filter(Boolean));
  const leafCodes = new Set(inck_prep.filter(d => !parentCodes.has(d.code)).map(d => d.code));
  
  function updateCount() {
    const selectedLeaves = [...currentSelection].filter(c => leafCodes.has(c));
    countDisplay.innerHTML = `Currently selected: <strong>${selectedLeaves.length}</strong> income categories`;
  }
  
  // Check if any descendant is selected (for initial expand state)
  function hasSelectedDescendant(node) {
    const descendantCodes = getDescendantCodes(node, inck_prep);
    return descendantCodes.some(c => currentSelection.has(c));
  }
  
  function renderNode(node, parentEl) {
    const descendantCodes = getDescendantCodes(node, inck_prep);
    if (!descendantCodes.some(c => presentIncCodes.has(c))) return;
    const hasChildren = node.children && node.children.length > 0;
    
    const wrapper = document.createElement('div');
    
    if (hasChildren) {
      const details = document.createElement('details');
      // Expand by default if any descendant is selected
      if (hasSelectedDescendant(node)) {
        details.open = true;
      }
      
      const summary = document.createElement('summary');
      summary.className = 'tree-summary';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = descendantCodes.every(c => currentSelection.has(c));
      checkbox.dataset.codes = JSON.stringify(descendantCodes);
      checkbox.onclick = (e) => e.stopPropagation();
      checkbox.onchange = (e) => {
        descendantCodes.forEach(code => {
          if (e.target.checked) {
            currentSelection.add(code);
          } else {
            currentSelection.delete(code);
          }
        });
        sessionStorage.setItem('capitalIncomeCodes', JSON.stringify([...currentSelection]));
        updateAllCheckboxStates();
        updateCount();
      };
      
      summary.appendChild(checkbox);
      summary.appendChild(document.createTextNode(` `));
      const strong = document.createElement('strong');
      strong.textContent = node.code;
      summary.appendChild(strong);
      summary.appendChild(document.createTextNode(` ${node.name}`));
      
      details.appendChild(summary);
      
      const childContainer = document.createElement('div');
      childContainer.className = 'tree-children';
      node.children.forEach(child => renderNode(child, childContainer));
      details.appendChild(childContainer);
      
      wrapper.appendChild(details);
    } else {
      wrapper.className = 'tree-leaf';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = currentSelection.has(node.code);
      checkbox.dataset.codes = JSON.stringify(descendantCodes);
      checkbox.onchange = (e) => {
        descendantCodes.forEach(code => {
          if (e.target.checked) {
            currentSelection.add(code);
          } else {
            currentSelection.delete(code);
          }
        });
        sessionStorage.setItem('capitalIncomeCodes', JSON.stringify([...currentSelection]));
        updateAllCheckboxStates();
        updateCount();
      };
      
      wrapper.appendChild(checkbox);
      wrapper.appendChild(document.createTextNode(` `));
      const strong = document.createElement('strong');
      strong.textContent = node.code;
      wrapper.appendChild(strong);
      wrapper.appendChild(document.createTextNode(` ${node.name}`));
    }
    
    parentEl.appendChild(wrapper);
  }
  
  function updateAllCheckboxStates() {
    // Update checkbox states without rebuilding the tree
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      const codes = JSON.parse(cb.dataset.codes || '[]');
      if (codes.length > 0) {
        cb.checked = codes.every(c => currentSelection.has(c));
      }
    });
  }
  
  incomeHierarchy.forEach(node => renderNode(node, container));
  updateCount();
  
  const result = document.createElement('div');
  result.appendChild(container);
  result.appendChild(countDisplay);
  display(result);
}
```

## Expense Categories to Exclude

Select expense categories that should be treated as **capital (non-current)** expenditures and excluded from current surplus calculation:

```js
// Build expense hierarchy
const expenseHierarchy = buildHierarchy(kek_prep.filter(d => d.level > 0));
```

```js
// Render expense tree with vanilla JS DOM manipulation
{
  const container = document.createElement('div');
  container.className = 'tree-container';
  
  const countDisplay = document.createElement('div');
  countDisplay.className = 'note';
  
  let currentSelection = new Set(loadSavedExpenseCodes());
  
  // Get leaf codes (codes that are not parent of any other code)
  const parentCodes = new Set(kek_prep.map(d => d.parentCode).filter(Boolean));
  const leafCodes = new Set(kek_prep.filter(d => !parentCodes.has(d.code)).map(d => d.code));
  
  function updateCount() {
    const selectedLeaves = [...currentSelection].filter(c => leafCodes.has(c));
    countDisplay.innerHTML = `Currently selected: <strong>${selectedLeaves.length}</strong> expense categories`;
  }
  
  // Check if any descendant is selected (for initial expand state)
  function hasSelectedDescendant(node) {
    const descendantCodes = getDescendantCodes(node, kek_prep);
    return descendantCodes.some(c => currentSelection.has(c));
  }
  
  function renderNode(node, parentEl) {
    const descendantCodes = getDescendantCodes(node, kek_prep);
    if (!descendantCodes.some(c => presentExpCodes.has(c))) return;
    const hasChildren = node.children && node.children.length > 0;
    
    const wrapper = document.createElement('div');
    
    if (hasChildren) {
      const details = document.createElement('details');
      // Expand by default if any descendant is selected
      if (hasSelectedDescendant(node)) {
        details.open = true;
      }
      
      const summary = document.createElement('summary');
      summary.className = 'tree-summary';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = descendantCodes.every(c => currentSelection.has(c));
      checkbox.dataset.codes = JSON.stringify(descendantCodes);
      checkbox.onclick = (e) => e.stopPropagation();
      checkbox.onchange = (e) => {
        descendantCodes.forEach(code => {
          if (e.target.checked) {
            currentSelection.add(code);
          } else {
            currentSelection.delete(code);
          }
        });
        sessionStorage.setItem('capitalExpenseCodes', JSON.stringify([...currentSelection]));
        updateAllCheckboxStates();
        updateCount();
      };
      
      summary.appendChild(checkbox);
      summary.appendChild(document.createTextNode(` `));
      const strong = document.createElement('strong');
      strong.textContent = node.code;
      summary.appendChild(strong);
      summary.appendChild(document.createTextNode(` ${node.name}`));
      
      details.appendChild(summary);
      
      const childContainer = document.createElement('div');
      childContainer.className = 'tree-children';
      node.children.forEach(child => renderNode(child, childContainer));
      details.appendChild(childContainer);
      
      wrapper.appendChild(details);
    } else {
      wrapper.className = 'tree-leaf';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = currentSelection.has(node.code);
      checkbox.dataset.codes = JSON.stringify(descendantCodes);
      checkbox.onchange = (e) => {
        descendantCodes.forEach(code => {
          if (e.target.checked) {
            currentSelection.add(code);
          } else {
            currentSelection.delete(code);
          }
        });
        sessionStorage.setItem('capitalExpenseCodes', JSON.stringify([...currentSelection]));
        updateAllCheckboxStates();
        updateCount();
      };
      
      wrapper.appendChild(checkbox);
      wrapper.appendChild(document.createTextNode(` `));
      const strong = document.createElement('strong');
      strong.textContent = node.code;
      wrapper.appendChild(strong);
      wrapper.appendChild(document.createTextNode(` ${node.name}`));
    }
    
    parentEl.appendChild(wrapper);
  }
  
  function updateAllCheckboxStates() {
    // Update checkbox states without rebuilding the tree
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      const codes = JSON.parse(cb.dataset.codes || '[]');
      if (codes.length > 0) {
        cb.checked = codes.every(c => currentSelection.has(c));
      }
    });
  }
  
  expenseHierarchy.forEach(node => renderNode(node, container));
  updateCount();
  
  const result = document.createElement('div');
  result.appendChild(container);
  result.appendChild(countDisplay);
  display(result);
}
```

---

## Actions

<div class="grid grid-cols-2" style="gap: 1rem;">
  <div class="card">
    <h3>Reset to Defaults</h3>
    <p>Restore the original default selections</p>
    ${Inputs.button("Reset to Defaults", {
      reduce: () => {
        // Clear version to force recalculation of defaults
        sessionStorage.removeItem('capitalSettingsVersion');
        sessionStorage.removeItem('capitalIncomeCodes');
        sessionStorage.removeItem('capitalExpenseCodes');
        location.reload();
      }
    })}
  </div>
  
  <div class="card">
    <h3>View Dashboard</h3>
    <p>Go to the main dashboard to see the results</p>
    ${Inputs.button("View Dashboard →", {
      reduce: () => {
        window.location.href = "/";
      }
    })}
  </div>
</div>

<style>
.note {
  background-color: var(--theme-foreground-faintest);
  border-left: 4px solid var(--theme-foreground-focus);
  padding: 1rem;
  margin: 1rem 0;
  border-radius: 4px;
}

.button {
  display: inline-block;
  padding: 0.5rem 1rem;
  background-color: var(--theme-foreground-focus);
  color: white;
  text-decoration: none;
  border-radius: 4px;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  margin-top: 0.5rem;
}

.button:hover {
  opacity: 0.85;
  text-decoration: none;
}

.tree-container {
  border: 1px solid var(--theme-foreground-faint);
  border-radius: 4px;
  padding: 1rem;
  background: var(--theme-background);
  max-height: 600px;
  overflow-y: auto;
}

.tree-item {
  margin: 4px 0;
}

.tree-summary {
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  user-select: none;
}

.tree-summary::-webkit-details-marker {
  display: none;
}

.tree-summary:hover {
  background-color: var(--theme-foreground-faintest);
}

details > summary {
  list-style: none;
}

details[open] > summary::before {
  content: '▼';
  display: inline-block;
  width: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--theme-foreground-muted);
}

details:not([open]) > summary::before {
  content: '▶';
  display: inline-block;
  width: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--theme-foreground-muted);
}

.tree-leaf {
  padding: 8px;
  padding-left: 28px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tree-leaf:hover {
  background-color: var(--theme-foreground-faintest);
}

.tree-checkbox {
  cursor: pointer;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.tree-label {
  cursor: pointer;
  flex: 1;
}

.tree-label strong {
  font-family: var(--monospace);
  font-size: 0.9em;
  color: var(--theme-foreground-muted);
  margin-right: 0.5rem;
}

.tree-children {
  margin-left: 20px;
  border-left: 1px solid var(--theme-foreground-faintest);
  padding-left: 8px;
}
</style>
