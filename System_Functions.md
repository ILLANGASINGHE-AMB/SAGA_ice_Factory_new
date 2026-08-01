# Sagacious Cube Factory Management System — Functionalities Prompt

Add all business logic and feature functionality to the existing UI.
All state management is in-memory / React state for now (database integration comes separately).

---

## Authentication & Role Logic

- Login form validates email + password
- Two roles: admin and user
- Store logged-in user and role in React Context (AuthContext)
- Role-based route guards: redirect unauthorized users away from protected pages
- Settings page: admin only
- Reports page: admin only
- Logout clears context and redirects to Login

Role permission enforcement:
- Inventory: user can only ADD cubes; admin can add, remove, edit price
- Customers: user can add + view; admin can add, edit, delete, view
- Sales: price per cube editable by admin only; both roles can place orders
- Debts: both roles can view; settling available to both

---

## Inventory Logic

- Display current stock quantities for MFC, RSC, WST
- Add cubes: validate quantity is a positive integer → update stock
- Remove cubes (admin only): validate quantity does not exceed current stock → update stock
- Edit price per cube (admin only): validate positive decimal value
- Block any sale if price per cube is not set for selected cube type

---

## Customer Logic

- Auto-generate customer_code on creation: CUST-0001, CUST-0002, etc.
- Validate WhatsApp number: exactly 10 digits, numeric only
- Duplicate WhatsApp number check before saving
- Name must not be empty
- Edit customer (admin only): pre-fill form with existing data
- Delete customer (admin only): show confirmation dialog first

---

## Sales Logic

New Order flow:
1. Select payment type (Cash or Debt)
2. Search customers by name or WhatsApp number (filter from customer list)
   - If found: auto-fill customer details
   - If not found: show mini create-customer form; auto-save on order placement
3. Auto-fill current date/time
4. Select cube type (Manufactured or Resell)
5. Auto-fetch price per cube from inventory for selected type
6. Enter quantity — validate positive integer, does not exceed stock
7. Auto-calculate total: price × quantity
8. On "Place Order":
   - Auto-generate sale_code: SALE-0001, SALE-0002, etc.
   - Deduct quantity from inventory
   - If Debt: create debt record (total_amount, paid_amount=0, remaining=total, status=pending)
   - Trigger PDF bill generation (see PDF logic)
   - Show "Send to WhatsApp?" prompt

Sales table:
- Search by customer name or sale code
- Sort by date, amount, type

---

## Debt Logic

Debt table filters:
- Filter by status: pending / partial / settled
- Filter by customer name search
- Filter by date range

Settle Debt flow:
1. Click Settle on a debt record
2. Enter payment amount (validate: positive, not exceeding remaining)
3. Update paid_amount += entered amount
4. Update remaining_amount = total - paid_amount
5. If remaining = 0: set status to settled
6. If 0 < remaining < total: set status to partial
7. Trigger PDF settlement receipt generation
8. Show "Send to WhatsApp?" prompt

---

## PDF Generation Logic (jsPDF)

Bill PDF layout:
- Company logo (top left)
- Company name, address, phone, email (top right)
- Title: "SALES BILL" + sale_code
- Date and time of transaction
- Customer name, WhatsApp, address
- Itemized table: Cube Type | Qty | Price Per Cube | Total
- Grand Total row
- Payment type label (Cash / Debt)
- Footer: "Thank you for your business"

Settlement Receipt PDF layout:
- Same header as bill
- Title: "SETTLEMENT RECEIPT" + unique code
- Original sale reference
- Amount paid, remaining balance, new status
- Footer: "Thank you for your business"

Report PDF layout (for all 5 report types):
- Company logo + name header
- Report title + date range
- Sales table: Customer | Cube Type | Qty | Amount | Payment Type | Date
- Summary section:
  - Total Revenue (Cash + Debt split)
  - Total Cubes Sold by Type
  - Number of New Customers in Period
  - Settled vs Outstanding Debts list
- Page footer with generation timestamp

---

## WhatsApp Integration

After every order placement and debt settlement:
- Show a prompt: "Send to WhatsApp?"
- On confirm: open in new tab:
  https://wa.me/<whatsapp_number>?text=<URL-encoded-message>

Bill message:
  "Hello [Customer Name], your bill for [Sale Code] is ready. Total: LKR [Amount]. View/Download: [PDF URL]"

Settlement message:
  "Hello [Customer Name], your settlement receipt for [Sale Code] is ready. Amount Paid: LKR [Amount]. Remaining: LKR [Remaining]. View/Download: [PDF URL]"

---

## Reports Logic

Weekly Report:
- Filter sales by current week (Mon–Sun) or user-selected week
- Calculate total revenue, cube counts, new customers, debt summary

Monthly Report:
- Filter sales by selected month/year
- Same calculations + top 5 customers by revenue

Full Report:
- Date range picker (from / to)
- All sales within range + full summary

Debtors Report:
- All customers with status pending or partial
- Show total owed per customer

Customer Details Report:
- All customers + full purchase history per customer

All reports: preview in browser + trigger PDF download on button click

---

## Settings Logic

Company Branding:
- Save company name, address, phone, email to app state / localStorage
- Logo upload: store as base64 or object URL in state; display preview immediately
- All saved branding used across PDFs and Login page

Appearance:
- Dark/light mode toggle: apply Tailwind dark class to root, persist in localStorage
- Text size: apply CSS variable (--text-base) to root, persist in localStorage

Data Management:
- Backup: serialize all in-memory data (customers, sales, inventory, debts, settlements, settings) to JSON → trigger browser download as .json file
- Import: read uploaded .json file, parse, replace app state after admin confirmation dialog

---

## Form Validation Rules (React Hook Form + Zod)

Customer form:
- name: required, min 2 chars
- whatsapp_number: required, exactly 10 digits, numeric regex
- email: optional, valid email format if provided

Order form:
- quantity: required, positive integer
- price_per_cube: required, positive decimal (admin edit only)

Settlement form:
- amount_paid: required, positive decimal, max = remaining_amount

---

## Key Business Rules to Enforce in Code

1. Inventory quantity never goes below zero — validate before deducting
2. Price per cube must be set before placing any sale — show error if unset
3. WhatsApp number: exactly 10 digits, no duplicates
4. New customer during sale: auto-save with name + WhatsApp
5. Every sale and settlement generates a PDF bill
6. Debt settlements can be partial — track remaining balance
7. WST (Waste) cubes: no price, not selectable in sales
8. Only admin can delete or edit prices
