# 🧊 Sagacious Cube Factory Management System (Saga Ice)

An enterprise-grade, modern Web ERP and Point-of-Sale (POS) management application designed specifically for ice manufacturing and distribution facilities.

---

## ⚡ Key Features

- 📊 **Executive Dashboard**: Real-time stats, daily revenue tracking, weekly inventory trends, and payment method distribution charts.
- 📦 **Inventory Management**: Track stock levels for Manufactured Cubes (`MFC`), Resell Cubes (`RSC`), and Waste (`WST`) with automated stock deduction.
- 👥 **Customer Directory**: Auto-generated customer codes (`CUST-XXXX`), 10-digit WhatsApp number validation, duplicate detection, and contact history.
- 🧾 **Sales & Order Engine**: Multi-step sales flow, automated inventory validation, cash & credit payment options, and instant PDF invoice generation.
- 💳 **Debt Management & Settlements**: Track pending/partial credit balances, process partial or full debt payments, generate settlement receipts, and send automated notifications.
- 💬 **WhatsApp Integration**: Single-click dispatch of invoices and payment receipts to customer WhatsApp numbers.
- 📈 **Analytical Reports**: Standardized report generation (Weekly, Monthly, Full Date Range, Debtors, Customer Details) with PDF exports.
- 🔐 **Role-Based Access Control**: Granular permissions distinguishing `admin` users (price editing, removal, settings, full reports) from standard `user` operators.
- 🎨 **Customizable Enterprise Branding**: Configurable company logo, header details, light/dark themes, and system data backups.

---

## 🛠️ Technology Stack

- **Frontend**: React 19, Vite 8, React Router v7, Tailwind CSS v4
- **Database & Backend**: Supabase PostgreSQL with Row Level Security (RLS) & Postgres Realtime WebSocket channels
- **Visualization**: Recharts
- **Document Generation**: jsPDF & jsPDF-AutoTable
- **Icons & UI Utilities**: Lucide React, React Hook Form, Zod

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn

### 2. Installation
```bash
git clone git@github.com:ILLANGASINGHE-AMB/SAGA_ice_Factory_new.git
cd SAGA_ice_Factory_new
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory (refer to `.env.example`):
```env
VITE_SUPABASE_URL=https://your-supabase-project-url.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 4. Database Setup
Import the provided SQL schema into your Supabase SQL Editor:
- Execute all SQL statements in [`supabase_schema.sql`](file:///Users/anjana/Documents/Saga%20Ice/supabase_schema.sql).

### 5. Run Locally
```bash
npm run dev
```

---

## 🌐 Netlify Deployment Guide

1. **Connect Repository**: Connect this repository to your Netlify account.
2. **Build Settings**:
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist`
   - *(Note: These settings are pre-configured in `netlify.toml`)*
3. **Environment Variables**:
   In Netlify Site Settings > **Environment variables**, add:
   - `VITE_SUPABASE_URL`: Your Supabase URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase Public Anon Key
4. **Deploy**: Trigger a manual or automatic git push build.

---

## 📄 License

Internal Enterprise Application for Sagacious Ice Factory developed by Helllsinghe Digi Tech.
