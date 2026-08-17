# Legacy Web Application Modernization & Landscape Responsive Migration Prompt

Copy and paste the master prompt below into your AI coding assistant (e.g. Antigravity / Claude / ChatGPT) when starting the migration of your legacy web app.

---

```markdown
# Context & Objective
You are an expert full-stack engineer and UI/UX architect specializing in modern React web applications, high-performance design systems, and responsive ergonomics (specifically **Tablet PC & Mobile Landscape/Portrait views**).

Your task is to analyze our legacy web application and systematically convert it to a modern, robust, and beautifully designed web application using the exact tech stack and mobile/landscape optimization patterns outlined below.

---

## 1. Target Technology Stack

Build the modernized application with the following stack:

1. **Framework & Build System**:
   - **React 19** (`react`, `react-dom`) with modern hooks, Suspense, and `React.lazy` code-splitting.
   - **Vite 8** (`vite`, `@vitejs/plugin-react`) for lightning-fast HMR and optimized production bundles.

2. **Styling & Design System**:
   - **Tailwind CSS v4** (`@tailwindcss/vite`, `tailwindcss`) for styling with tailored color palettes (e.g. Navy, Slate, Emerald, Amber, Rose), dark mode support, and custom CSS variables.
   - **Vanilla CSS (`src/index.css`)** for touch-action manipulation (`touch-action: manipulation`), font size stabilization (16px base on inputs to prevent iOS auto-zoom), dynamic font scaling (`--text-base-size`), and smooth momentum scrolling (`-webkit-overflow-scrolling: touch`).

3. **Routing & Navigation**:
   - **React Router v7** (`react-router-dom`) with route guards (`ProtectedRoute`, `AdminRoute`), 404 handling, and role-based permissions.

4. **State Management & Data Layer**:
   - **TanStack React Query v5** (`@tanstack/react-query`) for asynchronous server-state fetching, caching, optimistic updates, and background revalidation.
   - **React Context API** for global client state (e.g., Auth, Theme, Notifications).

5. **Forms & Schema Validation**:
   - **React Hook Form** (`react-hook-form`) for uncontrolled, high-performance form state.
   - **Zod** (`zod`, `@hookform/resolvers`) for strict schema validation and error feedback.

6. **Data Visualization & Exporting**:
   - **Recharts v3** (`recharts`) for responsive financial and operational charts.
   - **jsPDF** (`jspdf`, `jspdf-autotable`) + **html2canvas** for client-side invoice and report generation.

7. **Icons & UI Tokens**:
   - **Lucide React** (`lucide-react`) for crisp, consistent iconography.

---

## 2. Mandatory Mobile & Tablet PC Landscape Optimizations

The system will frequently be used on **Tablet PCs** and **Mobile devices in Landscape view** (resolutions: 1024×768, 1280×800, 1366×768, and 844×390). You must strictly adhere to these UX/UI layout rules:

1. **Collapsible Sidebar Rail**:
   - Provide a collapsible sidebar that shrinks to a 68px icon rail with hover tooltips when collapsed or on smaller landscape screens.
   - Persist collapse state in `localStorage`.
   - On mobile devices, hide the bottom navigation bar in landscape orientation (`landscape:hidden`) to preserve vertical height.

2. **Multi-Column Modals in Landscape**:
   - In landscape view, vertical space is constrained (375px–768px) while horizontal width is ample.
   - **Never** render tall single-column form inputs inside modals that get cut off vertically.
   - Format modal form fields into responsive 2-column grids (`grid grid-cols-1 sm:grid-cols-2 gap-3`).
   - Modal dialogs must have bounded max heights (`max-h-[90vh] landscape:max-h-[86vh]`), pinned headers/footers, and a scrollable body with smooth touch scrolling (`touch-scroll`).

3. **Touch Ergonomics & Tap Targets**:
   - Standardize buttons and input fields to touch-friendly heights (`min-h-[38px]` to `min-h-[44px]`).
   - Add active press feedback (`active:scale-[0.98]`).
   - Use `touch-action: manipulation` across interactive controls to prevent 300ms tap delays.

4. **Adaptive KPI & Summary Cards**:
   - Render KPI summary cards in a 4-column horizontal grid in landscape mode (`grid grid-cols-2 md:grid-cols-4 landscape:grid-cols-4 gap-2.5 sm:gap-4`).

5. **Compact Visual Analytics**:
   - Scale chart containers to compact heights (`h-44 sm:h-52 md:h-56`) so charts and data tables sit side-by-side without pushing page content off-screen.

6. **High-Density Responsive Tables**:
   - Use compact table cell padding (`px-3.5 sm:px-6 py-2.5 sm:py-3.5`) with sticky headers and horizontal touch momentum scrolling.
   - Keep pagination controls in a compact single row.

---

## 3. Migration Workflow & Execution Plan

Execute the conversion following these phases:

### Phase 1: Codebase Audit & Feature Inventory
1. Scan the existing `.js` files, folder structure, business logic, data models, and API endpoints.
2. Produce an architectural summary listing:
   - Existing pages, modals, and user journeys.
   - State management, API contracts, and storage mechanisms.
   - Data validation rules and role permissions.

### Phase 2: Project Setup & Foundation
1. Initialize the project with Vite + React 19 + Tailwind CSS v4 + React Router v7.
2. Configure `src/index.css` with touch utilities, landscape media queries, and design tokens.
3. Setup `QueryClientProvider`, `AuthProvider`, `ToastProvider`, and `ErrorBoundary`.

### Phase 3: Core Design System & Components
1. Build reusable UI components:
   - `AppShell`: Collapsible icon-rail navigation + compact landscape header.
   - `Table`: High-density responsive table with sorting and sticky headers.
   - `Modal`: Landscape-bounded popup container with scrollable body.
   - `Button`: Touch-optimized buttons with loading spinners and active scaling.
   - `FormFields` (`Input`, `Select`, `TextArea`, `Checkbox`): Built with React Hook Form compatibility.
   - `Badge` & `Skeleton`: Status indicators and loading skeletons.

### Phase 4: Data Layer & API Hooks
1. Create custom hooks using `@tanstack/react-query` for all CRUD operations, caching, and mutations.
2. Define Zod validation schemas for all form entities.

### Phase 5: Page-by-Page Migration & Landscape Polish
1. Migrate each page component, ensuring landscape multi-column layouts, 4-column KPI cards, and compact charts.
2. Replace hardcoded DOM manipulations and legacy JS patterns with declarative React 19 components.

### Phase 6: Quality Assurance & Build Verification
1. Verify clean production build (`npm run build`).
2. Test responsive layouts on standard desktop, tablet landscape (1024×768), and mobile landscape (844×390) viewports.

---

## Output Request:
Please start by analyzing the current codebase files and present:
1. **Legacy Architecture Audit** (detected features, state handling, and data models).
2. **Step-by-Step Modernization Plan** tailored to this project before executing code changes.
```
