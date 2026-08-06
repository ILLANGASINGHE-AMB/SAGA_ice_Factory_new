# 🧊 Customized Report — Feature Proposal

## Overview

Add a new **"Customized Report"** tab to the Reports page that allows the user to build a fully flexible, filter-driven report by combining any mix of parameters — date range, specific customer, cube type, payment method, and debt status — all in one place.

---

## Filter Parameters (All Optional, Combinable)

| Filter | Control Type | Options | Behavior |
|---|---|---|---|
| **Date Range** | From / To date pickers | Any date range | Filters `sale_date` and `settlement_date` within range. If omitted → all-time data. |
| **Customer** | Searchable dropdown | All registered customers + "Walk-in" + "All Customers" (default) | Filters sales & debts to a single customer. Enables per-customer deep-dive reports. |
| **Cube Type** | Dropdown | `All Types` (default) · `Manufactured (MFC)` · `Resell (RSC)` | Filters sales by `cube_type` field. |
| **Payment Method** | Dropdown | `All Methods` (default) · `Cash` · `Debt (Credit)` | Filters sales by `payment_type` field. |
| **Include Debt Details** | Toggle switch | ON / OFF (default OFF) | When ON, appends an additional debt summary section showing all outstanding debts and settlement history for the filtered scope. |

> **Key Design Principle:** Every filter is optional. With no filters selected, the report shows everything (equivalent to "Full Ledger Report"). Each filter narrows the scope progressively.

---

## Report Preview Layout

### Summary Scorecard (Top)
A 4–6 column summary strip showing aggregated KPIs for the filtered data:

- **Total Revenue** — sum of all matching sales `total_amount`
- **Cash Revenue** — sum where `payment_type === 'cash'`
- **Credit Revenue** — sum where `payment_type === 'debt'`
- **MFC Cubes Sold** — quantity sum where `cube_type === 'manufactured'`
- **RSC Cubes Sold** — quantity sum where `cube_type === 'resell'`
- **Settlements Collected** — sum of `debt_settlements.amount_paid` in range (shown only when "Include Debt Details" is ON)

### Sales Transactions Table (Main)
Itemized table with columns:
`Sale Ref` · `Customer` · `Cube Type` · `Qty` · `Amount (LKR)` · `Payment` · `Date`

### Debt Details Section (Conditional — only when toggle is ON)
When "Include Debt Details" is enabled, show a second table below the sales table:

**Outstanding Debts Table:**
`Customer` · `Original Amount` · `Paid So Far` · `Remaining` · `Status` · `Created Date`

**Settlement History Table:**
`Settlement Code` · `Customer` · `Amount Paid` · `Remaining After` · `Settlement Date`

---

## PDF Export

The "Download PDF" button generates a branded PDF with:
1. Company header (logo, name, address, contact — from Settings)
2. Report title: **"Customized Report"**
3. Applied filters listed under "REPORT PARAMETERS" (e.g., "Customer: ABC Stores · Cube Type: Manufactured · Period: 01/08/2026 to 06/08/2026")
4. Financial summary block
5. Itemized sales table (auto-paged with `jspdf-autotable`)
6. Debt details tables (if toggle was ON)
7. Aggregate statistics footer
8. Branded footer with generation timestamp

---

## UI Placement

- New report tab button labeled **"Customized Report"** with a `SlidersHorizontal` icon
- Placed as the **last button** (6th) in the "Compile Report" sidebar after "Customer Details Report"
- When selected, the "Set Parameters" card expands to show all 5 filter controls stacked vertically
- Same "Compile Preview" button and "Report Live Preview" panel as existing reports

---

## Example Use Cases

| Scenario | Filters Applied |
|---|---|
| "Show me all manufactured cube sales this week" | Date: this week, Cube Type: MFC |
| "What does customer ABC owe us?" | Customer: ABC, Debt Details: ON |
| "Cash-only sales for July 2026" | Date: Jul 1–31, Payment: Cash |
| "Complete debt history for one customer" | Customer: XYZ, Debt Details: ON |
| "All resell cube credit sales" | Cube Type: RSC, Payment: Debt |
| "Full system export (everything)" | No filters (defaults) |
