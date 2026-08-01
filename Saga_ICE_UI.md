# Sagacious Cube Factory Management System — UI Build Prompt

Build the complete frontend UI for an Ice Cube Factory management web app.
No backend logic, no database connections — UI and layout only.

---

## Tech Stack
- React (Vite) + Tailwind CSS
- React Router v6
- Recharts (for charts)
- DM Sans (body font), Space Grotesk (headings)

---

## Theme & Design
- Clean industrial aesthetic
- Dark navy/slate base with icy blue accents
- Full Dark / Light mode support (toggle in Settings, persisted via localStorage)
- Text Size selector: Small / Medium / Large (CSS variable applied system-wide)
- Mobile-first responsive layout
- Sidebar on desktop → collapses to bottom navigation bar on mobile
- Skeleton loaders for all data-fetching areas
- Toast notification components (success, error, info)
- Confirmation dialog component (for DELETE actions)
- Friendly illustrated empty states for all empty tables

---

## Pages & Layouts

### Login Page
- Company logo (top center)
- Company name below logo
- Email + password fields
- Login button
- Error message display area

---

### App Shell
- Sidebar (desktop) with navigation links:
  Dashboard | Inventory | Customers | Sales | Debts | Reports | Settings
- Bottom nav bar (mobile) with icons for same links
- Top header bar: company name/logo + logged-in user name + logout button

---

### 1. Dashboard Page
Summary Cards Row (4 cards):
- Total Manufactured Cubes Sold Today
- Total Resell Cubes Sold Today
- Today's Total Revenue
- Number of Pending Debts

Charts Section:
- Weekly Sales Bar Chart (Manufactured vs Resell, side-by-side per day) — Recharts
- Monthly Revenue Line Chart — Recharts
- Debt vs Cash Sales Pie Chart — Recharts

Tables Section:
- Recent Sales table: Customer Name | Type | Qty | Amount | Date
- Recent Debts table: Customer | Amount | Remaining | Status
- Recent Settlements table: Customer | Amount Paid | Date

---

### 2. Inventory Page
Three stock cards with type code badges:
- MFC — Manufactured Cubes (quantity + price per cube)
- RSC — Resell Cubes (quantity + price per cube)
- WST — Waste (quantity only, no price)

Each card has:
- "Add" button (visible to all)
- "Remove" button (admin only — hidden/disabled for user)
- "Edit Price" button (admin only — hidden/disabled for user)

Add/Remove form (modal or inline): quantity input field

---

### 3. Customers Page
Table columns: Customer Code | Name | WhatsApp | Address | Email | Actions

Actions (admin): Edit | Delete
Actions (user): View only

Top bar:
- Search input
- "Add Customer" button

Add/Edit Customer modal form:
- Name (required)
- WhatsApp Number (required, 10 digits)
- Address (optional)
- Email (optional)

---

### 4. Sales Page
Top bar: Inventory Summary strip showing live stock for MFC | RSC | WST

"New Order" button → opens multi-step modal:
  Step 1: Select Payment Type (Cash / Debt toggle)
  Step 2: Customer Search field
    - Show results dropdown
    - "Create New Customer" mini-form if not found (Name + WhatsApp)
  Step 3: Order Details
    - Auto-filled date/time
    - Cube Type selector (Manufactured / Resell)
    - Price per cube (pre-filled, editable field for admin only)
    - Quantity input
    - Auto-calculated Total display
  Step 4: Confirmation screen showing order summary
    - "Place Order" button
    - "Send to WhatsApp?" prompt after placement

Sales Table:
- Columns: Sale Code | Customer | Type | Qty | Amount | Payment Type | Date | Bill
- Search bar + sort controls

---

### 5. Debts Page
Filter bar: Status (All / Pending / Partial / Settled) | Customer search | Date range picker

Debt Table:
- Columns: Customer Name | Sale Code | Total Amount | Paid | Remaining | Status | Date | Action

"Settle" button → opens Settle modal:
  - Debt summary display
  - Amount to pay input
  - Updated remaining amount preview
  - "Confirm Settlement" button
  - "Send receipt to WhatsApp?" prompt after settlement

---

### 6. Reports Page
Report type selector cards (5 types):
- Weekly Report
- Monthly Report
- Full Report (date range)
- Debtors Report
- Customer Details Report

Each card has a "Generate" button.
Date range / week / month picker shown per report type.

Report Preview panel: shows a styled in-browser preview of the report layout.
"Download PDF" button on preview.

---

### 7. Settings Page (Admin only)

Company Branding section:
- Logo upload input + preview
- Company Name field
- Address field
- Phone field
- Email field
- Save button

Appearance section:
- Dark / Light mode toggle
- Text size selector (Small / Medium / Large)

Data Management section:
- "Backup to Local PC" button
- "Import from Backup" button (file upload input)

---

## Reusable UI Components to Build
- Button (variants: primary, secondary, danger, ghost)
- Modal (with overlay, close button, title slot)
- Table (with sort headers, empty state, loading skeleton)
- Badge (for type codes: MFC, RSC, WST, status labels)
- Toast notification (success, error, info)
- Confirmation dialog
- Search input
- Form fields (text, number, email, file upload)
- Skeleton loader blocks
- Stats card
- Step indicator (for multi-step modal)
