# Sagacious Cube Factory Management System — Dexie.js Database Prompt

Replace all in-memory/React state data storage with a persistent
local database using Dexie.js (IndexedDB wrapper).
All data must survive page refreshes.

---

## Setup

Install: npm install dexie

Create: src/lib/db.js

---

## Database Definition

```js
import Dexie from 'dexie';

export const db = new Dexie('SagaciousIceFactory');

db.version(1).stores({
  profiles:         '++id, role, full_name, created_at',
  inventory:        '++id, code, type, quantity, price_per_cube, updated_at',
  customers:        '++id, customer_code, name, whatsapp_number, address, email, created_at',
  sales:            '++id, sale_code, customer_id, cube_type, quantity, price_per_cube, total_amount, payment_type, bill_pdf_url, sale_date, created_by',
  debts:            '++id, sale_id, customer_id, total_amount, paid_amount, remaining_amount, status, created_at',
  debt_settlements: '++id, debt_id, customer_id, amount_paid, settlement_date, bill_pdf_url, created_by',
  settings:         '++id, company_name, company_address, company_phone, company_email, logo_url, updated_at'
});
```

---

## Seed Data on First Load

On app startup, check if inventory table is empty.
If empty, insert default rows:

```js
await db.inventory.bulkAdd([
  { code: 'MFC-0001', type: 'manufactured', quantity: 0, price_per_cube: null, updated_at: new Date() },
  { code: 'RSC-0001', type: 'resell',       quantity: 0, price_per_cube: null, updated_at: new Date() },
  { code: 'WST-0001', type: 'waste',        quantity: 0, price_per_cube: null, updated_at: new Date() },
]);
```

On app startup, check if settings table is empty.
If empty, insert default row:

```js
await db.settings.add({
  company_name: 'Sagacious Cube Factory',
  company_address: '',
  company_phone: '',
  company_email: '',
  logo_url: null,
  updated_at: new Date()
});
```

---

## Profiles Table

```js
// Create profile (called after login/register)
await db.profiles.add({ role: 'admin', full_name: 'Admin User', created_at: new Date() });

// Get profile by id
await db.profiles.get(id);

// Update role
await db.profiles.update(id, { role: 'user' });
```

---

## Inventory Operations

```js
// Get all inventory items
await db.inventory.toArray();

// Get by type
await db.inventory.where('type').equals('manufactured').first();

// Add stock
await db.inventory.update(id, {
  quantity: db.inventory.get(id).then(r => r.quantity + addAmount),
  updated_at: new Date()
});

// Remove stock (validate before calling)
await db.inventory.update(id, {
  quantity: currentQty - removeAmount,
  updated_at: new Date()
});

// Update price per cube (admin only)
await db.inventory.update(id, { price_per_cube: newPrice, updated_at: new Date() });
```

---

## Customer Operations

```js
// Auto-generate customer_code
const count = await db.customers.count();
const customer_code = `CUST-${String(count + 1).padStart(4, '0')}`;

// Add customer
await db.customers.add({ customer_code, name, whatsapp_number, address, email, created_at: new Date() });

// Check duplicate WhatsApp
const existing = await db.customers.where('whatsapp_number').equals(number).first();

// Search customers (by name or whatsapp)
await db.customers.filter(c =>
  c.name.toLowerCase().includes(query) ||
  c.whatsapp_number.includes(query)
).toArray();

// Update customer (admin only)
await db.customers.update(id, { name, whatsapp_number, address, email });

// Delete customer (admin only)
await db.customers.delete(id);
```

---

## Sales Operations

```js
// Auto-generate sale_code
const count = await db.sales.count();
const sale_code = `SALE-${String(count + 1).padStart(4, '0')}`;

// Add sale
await db.sales.add({
  sale_code,
  customer_id,
  cube_type,
  quantity,
  price_per_cube,
  total_amount: price_per_cube * quantity,
  payment_type,   // 'cash' or 'debt'
  bill_pdf_url,
  sale_date: new Date(),
  created_by
});

// Get all sales (with customer join via separate query)
const sales = await db.sales.orderBy('sale_date').reverse().toArray();

// Get today's sales
const today = new Date(); today.setHours(0,0,0,0);
await db.sales.where('sale_date').aboveOrEqual(today).toArray();

// Search by sale_code or customer_id
await db.sales.filter(s =>
  s.sale_code.includes(query) || s.customer_id === customerId
).toArray();
```

---

## Debt Operations

```js
// Create debt on sale (payment_type === 'debt')
await db.debts.add({
  sale_id,
  customer_id,
  total_amount,
  paid_amount: 0,
  remaining_amount: total_amount,
  status: 'pending',
  created_at: new Date()
});

// Get all debts with filters
await db.debts.where('status').equals('pending').toArray();
await db.debts.where('customer_id').equals(id).toArray();

// Get debts by date range
await db.debts.where('created_at').between(from, to).toArray();

// Settle debt (partial or full)
const debt = await db.debts.get(id);
const newPaid = debt.paid_amount + paymentAmount;
const newRemaining = debt.total_amount - newPaid;
const newStatus = newRemaining <= 0 ? 'settled' : 'partial';

await db.debts.update(id, {
  paid_amount: newPaid,
  remaining_amount: newRemaining,
  status: newStatus
});
```

---

## Debt Settlements Operations

```js
// Auto-generate settlement code (for PDF reference)
const count = await db.debt_settlements.count();
const settlement_code = `SETL-${String(count + 1).padStart(4, '0')}`;

// Add settlement record
await db.debt_settlements.add({
  debt_id,
  customer_id,
  amount_paid,
  settlement_date: new Date(),
  bill_pdf_url,
  created_by
});

// Get settlements for a debt
await db.debt_settlements.where('debt_id').equals(debt_id).toArray();

// Get recent settlements (last 5)
await db.debt_settlements.orderBy('settlement_date').reverse().limit(5).toArray();
```

---

## Settings Operations

```js
// Get settings (always single row)
const settings = await db.settings.toCollection().first();

// Update settings
await db.settings.update(settings.id, {
  company_name,
  company_address,
  company_phone,
  company_email,
  logo_url,
  updated_at: new Date()
});
```

---

## Backup & Import

Backup (export all tables to JSON):
```js
const backup = {
  profiles:         await db.profiles.toArray(),
  inventory:        await db.inventory.toArray(),
  customers:        await db.customers.toArray(),
  sales:            await db.sales.toArray(),
  debts:            await db.debts.toArray(),
  debt_settlements: await db.debt_settlements.toArray(),
  settings:         await db.settings.toArray(),
  exported_at:      new Date().toISOString()
};

const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
// trigger download link
```

Import (restore from JSON — admin only, after confirmation dialog):
```js
const data = JSON.parse(fileContent);

await db.transaction('rw',
  db.profiles, db.inventory, db.customers,
  db.sales, db.debts, db.debt_settlements, db.settings,
  async () => {
    await db.profiles.clear();         await db.profiles.bulkAdd(data.profiles);
    await db.inventory.clear();        await db.inventory.bulkAdd(data.inventory);
    await db.customers.clear();        await db.customers.bulkAdd(data.customers);
    await db.sales.clear();            await db.sales.bulkAdd(data.sales);
    await db.debts.clear();            await db.debts.bulkAdd(data.debts);
    await db.debt_settlements.clear(); await db.debt_settlements.bulkAdd(data.debt_settlements);
    await db.settings.clear();         await db.settings.bulkAdd(data.settings);
  }
);
```

---

## Custom Hook Pattern

Wrap all DB calls in custom hooks for clean component usage:

```js
// src/hooks/useInventory.js
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';

export function useInventory() {
  const inventory = useLiveQuery(() => db.inventory.toArray());
  
  const addStock = async (id, amount) => { ... };
  const removeStock = async (id, amount) => { ... };
  const updatePrice = async (id, price) => { ... };
  
  return { inventory, addStock, removeStock, updatePrice };
}
```

Create similar hooks for:
- useCustomers
- useSales
- useDebts
- useDebtSettlements
- useSettings
- useDashboard (aggregated queries for dashboard cards + charts)

Use useLiveQuery from dexie-react-hooks for all read operations
so components auto-update reactively when data changes.
