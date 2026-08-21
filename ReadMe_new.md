# 🧊 Sagacious Ice Factory Management System (SAGA ICE)
## Complete Enterprise Operational Guide & System Walkthrough

> **Designed for NotebookLM & Client Presentations**  
> **System Version:** v1.0.0 (Production Ready)  
> **Target Audience:** Factory Owners, Ice Manufacturing Directors, Plant Operations Managers, & Enterprise Clients  
> **Platform Stack:** React 19 + Supabase PostgreSQL + Tailwind CSS + Recharts + Google Gemini AI + Deno Edge Functions  

---

## 📋 Table of Contents

1. [Executive Overview](#1-executive-overview)
2. [Why Sagacious Ice Factory System?](#2-why-sagacious-ice-factory-system)
3. [Technology Stack & System Architecture](#3-technology-stack--system-architecture)
4. [Core Modules & Operational Walkthrough](#4-core-modules--operational-walkthrough)
   - [Module 1: Point of Sale (POS) & Automated Invoicing](#module-1-point-of-sale-pos--automated-invoicing)
   - [Module 2: Real-Time Inventory & Stock Audit Logs](#module-2-real-time-inventory--stock-audit-logs)
   - [Module 3: Customer Management & WhatsApp Integration](#module-3-customer-management--whatsapp-integration)
   - [Module 4: Debt Ledger & 30/60/90+ Day Aging Risk Reports](#module-4-debt-ledger--306090-day-aging-risk-reports)
   - [Module 5: Operating Expense Ledger](#module-5-operating-expense-ledger)
   - [Module 6: Executive Analytics Dashboard](#module-6-executive-analytics-dashboard)
   - [Module 7: SAGA AI Assistant (Powered by Gemini AI)](#module-7-saga-ai-assistant-powered-by-gemini-ai)
   - [Module 8: Global System Search (⌘K / Ctrl+K)](#module-8-global-system-search-k--ctrlk)
5. [Security, Concurrency & Data Protection](#5-security-concurrency--data-protection)
6. [Client Presentation Script & Video Generation Guide](#6-client-presentation-script--video-generation-guide)

---

## 1. Executive Overview

**Sagacious Ice Factory Management System (SAGA ICE)** is a state-of-the-art, web-based Enterprise Resource Planning (ERP) and Point of Sale (POS) application engineered specifically for commercial ice manufacturing and distribution facilities.

In commercial ice production, facilities process thousands of ice bags daily across manufactured tube ice, commercial block ice, and resell cubes. Operating a high-volume ice factory involves unique operational challenges:
- High energy consumption (electricity grid vs. diesel generator backup).
- Rapid stock turnover and meltage/waste management.
- Extended credit sales to commercial clients (restaurants, hotels, seafood distributors, events).
- Frequent equipment maintenance requirements (industrial compressors, ammonia chillers, RO water filtration units).

**SAGA ICE** unifies all these complex operational tracks into a single, sleek, dark-mode/light-mode reactive web portal that runs seamlessly on desktop workstations, tablets, and mobile smartphones.

---

## 2. Why Sagacious Ice Factory System?

| Traditional Manual Operations | Sagacious Ice Factory System |
|:---|:---|
| ❌ Paper logbooks prone to lost records and arithmetic errors | ✅ Real-time database sync with automatic calculation |
| ❌ Stock overselling due to untracked stock deductions | ✅ Atomic PostgreSQL row-locking prevents stock overdrafts |
| ❌ Uncollected debts and lost credit invoices | ✅ 30/60/90+ day customer debt aging reports with risk indicators |
| ❌ Manual PDF invoice creation and physical delivery | ✅ Instant auto-generated PDF invoices sent directly to customer WhatsApp |
| ❌ Static quarterly financial reviews | ✅ Live executive analytics & SAGA AI intelligent operational assistant |

---

## 3. Technology Stack & System Architecture

```
                                  +------------------------------------+
                                  |     Browser Client Application     |
                                  | React 19 + Tailwind CSS + Recharts |
                                  +-----------------+------------------+
                                                    |
                                                    v
                                  +------------------------------------+
                                  |      Global Search & Router        |
                                  | React Router v7 + React Query Cache|
                                  +-----------------+------------------+
                                                    |
                    +-------------------------------+-------------------------------+
                    |                               |                               |
                    v                               v                               v
    +-------------------------------+  +--------------------------+  +-------------------------------+
    |     Supabase PostgreSQL DB    |  | Supabase Storage (Bills) |  |   Supabase Edge Function      |
    | Atomic RPCs, RLS, Indexes     |  | Private Signed 24h URLs  |  | Proxy to Gemini AI Assistant  |
    +-------------------------------+  +--------------------------+  +-------------------------------+
```

- **Frontend Core:** React 19, Vite 8, React Router v7, Tailwind CSS v4.
- **Data Caching & Code Splitting:** `@tanstack/react-query` for 5-minute intelligent query caching and `React.lazy()` route-based code splitting.
- **Backend & Database:** Supabase PostgreSQL with PL/pgSQL Atomic Functions, Row Level Security (RLS), and database indexes.
- **Document Generation:** Client-side dynamic PDF generation using `jspdf` and `jspdf-autotable`.
- **Security & Storage:** Time-limited 24-hour signed URLs for private PDF storage buckets (`bills`).
- **AI Intelligence:** Server-side Supabase Edge Function proxying requests to Google Gemini AI models.

---

## 4. Core Modules & Operational Walkthrough

### Module 1: Point of Sale (POS) & Automated Invoicing

The **Sales & POS Module** is designed for fast, frictionless order processing at factory sales counters and dispatch desks.

#### Step-by-Step Order Flow:
1. **Initiate Order:** Click **New Order Wizard** or use shortcut.
2. **Select Ice Cube Type:** Choose between **Production Ice Cubes** (`MFC`) or **Resell Ice Cubes** (`RSC`). Real-time stock levels are displayed right on the selection card.
3. **Select or Register Customer:** Search existing customer profiles by name/WhatsApp or fill out the inline **Mini-Registration Form** for new walk-in clients.
4. **Specify Quantity & Pricing:** Enter quantity of ice bags/cubes. The system automatically pulls the price-per-cube set by administration and calculates the total amount in Sri Lankan Rupees (LKR).
5. **Select Payment Term:** Choose between **Cash Payment** or **Debt Credit**.
6. **One-Click Order Completion (Atomic Transaction):** Upon clicking **Complete Order**, the backend executes a single-transaction PostgreSQL RPC (`place_order_transaction`):
   - Deducts stock from inventory with row locking.
   - Generates a sequential sale code (`S-101-070826`).
   - Inserts sale record.
   - Logs inventory audit record.
   - Creates a pending debt entry if credit terms were selected.
7. **Instant PDF Invoicing & WhatsApp Delivery:** 
   - A professional PDF invoice is automatically generated and downloaded.
   - The PDF is uploaded to secure private cloud storage, creating a **24-hour signed URL link**.
   - A **Send to WhatsApp** prompt appears, opening WhatsApp Web/App pre-filled with the order summary and bill link for the customer.

---

### Module 2: Real-Time Inventory & Stock Audit Logs

The **Inventory Module** manages stock levels for manufactured cubes (`MFC-0001`), resell cubes (`RSC-0001`), and waste/melted stock (`WST-0001`).

#### Key Capabilities:
- **Atomic Stock Adjustments:** Add new stock batches from production or record manual stock removals. All changes execute via atomic PostgreSQL RPCs (`add_inventory_stock`, `deduct_inventory_stock`) to prevent race conditions.
- **Price Management:** Admin-restricted pricing updates for cube categories.
- **Inventory Audit Trail:** Every stock increase, sale deduction, or manual adjustment is recorded in the `inventory_transactions` audit log table with previous quantity, new quantity, net change, operator name, and timestamp.

---

### Module 3: Customer Management & WhatsApp Integration

The **Customers Module** acts as the central client directory for all wholesale buyers, commercial venues, and distributor contacts.

#### Key Capabilities:
- **Automated Customer Codes:** New customers receive an atomic sequential code (`CUST-0001`, `CUST-0002`).
- **Contact Registry:** Stores client name, WhatsApp contact number (E.164 formatted), delivery address, and email.
- **Customer History:** Click any customer profile to review their complete lifetime sales history, total volume purchased, and active credit balance.

---

### Module 4: Debt Ledger & 30/60/90+ Day Aging Risk Reports

Credit sales are a fundamental part of wholesale ice distribution. The **Debts Module** provides total financial visibility over outstanding receivables.

#### Debt Aging Analysis Brackets:
The system automatically calculates the age of every outstanding invoice from its date of issue:
1. 🟢 **0 - 30 Days (Current):** Healthy credit within standard terms.
2. 🟡 **31 - 60 Days Overdue (Watchlist):** Requires polite follow-up reminders.
3. 🟠 **61 - 90 Days Overdue (Overdue):** Warning status; restricts further credit sales.
4. 🔴 **90+ Days Overdue (Critical Risk):** High-risk accounts requiring urgent collection or legal escalation.

#### Settlement & PDF Receipt Flow:
- Operators select a debtor, enter the settlement amount, and submit.
- The system updates paid and remaining amounts, marking status as `partial` or `settled`.
- An official **Settlement Receipt PDF** is automatically generated, stored in cloud storage with a signed URL, and made available for instant WhatsApp sending.

---

### Module 5: Operating Expense Ledger

The **Expense Ledger Module** captures all overhead expenses to deliver accurate Profit & Loss (P&L) reporting.

#### Expense Categories:
- Electricity Power Utility (CEB).
- Bulk Generator Diesel.
- Equipment Spare Parts & Servicing.
- Factory Staff Salaries & Wages.
- Water Filtration & Utilities.
- Heavy-Duty Ice Bag Packaging Rollers.
- Miscellaneous Administrative Expenses.

All entries store payment method (`cash`, `bank_transfer`, `cheque`) and link to reports.

---

### Module 6: Executive Analytics Dashboard

The **Dashboard Page** provides high-level executive insights at a glance:
- **KPI Summary Cards:** Total Revenue Today, Cubes Sold, Active Outstanding Debts, Total Inventory Cubes Available.
- **Interactive Revenue Trends Chart:** Daily and weekly revenue visualization powered by Recharts.
- **Sales Breakdown Chart:** Production vs. Resell volume distribution.
- **Live Real-Time Reactive Updating:** Any sale placed at a counter updates the executive dashboard instantly across all devices.

---

### Module 7: SAGA AI Assistant (Powered by Gemini AI)

**SAGA AI** is an intelligent embedded AI operational assistant accessible via a floating action button on any page.

#### Features & Security:
- **Full Context System Analysis:** SAGA AI reads a live snapshot of sales, inventory levels, debt aging, and operating expenses.
- **Operational Questions You Can Ask SAGA AI:**
  - *"Which customers have debts overdue by more than 60 days?"*
  - *"Compare our production ice sales volume versus resell ice sales."*
- **Server-Side Security Proxy:** AI requests route through a Supabase Edge Function (`saga-ai-proxy`) so API keys remain completely hidden from client browsers.

---

### Module 8: Global System Search (⌘K / Ctrl+K)

Pressing `⌘K` (Mac) or `Ctrl+K` (Windows) opens an instant global search modal that searches across all database entities simultaneously:
- Type a customer name, phone number, sale code (`S-101`), customer code (`CUST-0002`), or expense code (`EXP-001`).
- Results populate instantly with category icons and direct navigation links.

---

## 5. Security, Concurrency & Data Protection

1. **Race-Condition Free Inventory:** High-concurrency ordering uses PostgreSQL row-level locks (`FOR UPDATE`) to ensure zero stock overdrafts even when multiple staff members complete sales at the same second.
2. **Atomic Single-Transaction Order Placement:** Stock deduction, code generation, sale creation, debt recording, and audit logging happen in a single, rollback-safe database transaction (`place_order_transaction`).
3. **Role-Based Access Control (RLS):** 
   - **Staff Operators:** Place orders, settle debts, view inventory, log production.
   - **Factory Admins:** Edit stock prices, delete sales, modify settings, view financial reports, manage profiles.
4. **Private Storage & Signed URLs:** Generated PDF bills are saved in a private storage bucket. Public users cannot browse storage files; links expire safely after 24 hours.
5. **Session Persistence:** Authenticated sessions persist seamlessly across page reloads without forcing re-logins.

---

## 6. Client Presentation Script & Video Generation Guide

> **Note for NotebookLM / Video Script Generator:**  
> Use the structured narration outline below to generate audio overview podcasts or video walkthrough scripts for prospective clients.

### 🎬 Video Presentation Outline (Duration: 3 - 5 Minutes)

#### Scene 1: Introduction (0:00 - 0:45)
- **Visual:** Smooth pan over the SAGA ICE Executive Dashboard in dark mode showing real-time KPI cards and charts.
- **Voiceover:** *"Welcome to Sagacious Ice Factory Management System — the premier digital platform built specifically for commercial ice manufacturers. Operating an ice plant requires balancing high-speed sales, inventory control, and customer credit. SAGA ICE brings every part of your factory into one intelligent, real-time portal."*

#### Scene 2: Point of Sale & Automated Invoicing (0:45 - 1:45)
- **Visual:** POS Order Wizard step-by-step: selecting manufactured ice cubes, choosing a customer, selecting credit payment, and clicking Complete Order.
- **Voiceover:** *"Dispatching ice is fast and error-free. Staff select the ice cube category, pick or register the customer, and complete the order in seconds. Behind the scenes, single-transaction database logic locks stock levels atomically to prevent overselling. Instantly, an official PDF invoice is generated and pre-formatted for direct WhatsApp sending to your client."*

#### Scene 3: Inventory Control (1:45 - 2:30)
- **Visual:** Inventory audit log table showing stock changes across Production, Resell, and Brine cube types.
- **Voiceover:** *"Inventory is updated live across all dispatch counters. Every bag added or removed is logged in an immutable audit trail, giving factory owners total clarity over stock levels at all times."*

#### Scene 4: Debt Ledger & 30/60/90+ Day Aging Reports (2:30 - 3:30)
- **Visual:** Debts Ledger page highlighting the 4 color-coded Aging Cards (Current, Watchlist, Overdue, Critical Risk) and settling a debt.
- **Voiceover:** *"Managing client credit is effortless. SAGA ICE categorizes outstanding balances into 30, 60, 90, and 90-plus day risk brackets. Factory owners can instantly spot overdue accounts and issue formal settlement receipt PDFs via WhatsApp when payments are received."*

#### Scene 5: Global Search & SAGA AI Assistant (3:30 - 4:30)
- **Visual:** Triggering `⌘K` global search and opening the SAGA AI assistant drawer to ask a question.
- **Voiceover:** *"Need information instantly? Press Command-K to search across customers, sales, stock, and expenses in milliseconds. Plus, with SAGA AI powered by Google Gemini, factory executives have a 24/7 intelligent assistant ready to analyze revenue trends and answer complex operational queries."*

#### Scene 6: Conclusion & Call to Action (4:30 - 5:00)
- **Visual:** AppShell showing responsive mobile view alongside desktop workspace.
- **Voiceover:** *"Secure, concurrent, and lightning fast on both desktop and mobile. Sagacious Ice Factory Management System transforms ice plant management into a streamlined, profitable science. Contact us today for a live factory demo."*

---

> **Document Summary:** Written by System Architecture Team on August 7, 2026. Available in repository root as `ReadMe_new.md`.
