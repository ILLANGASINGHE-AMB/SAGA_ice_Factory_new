import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import { ProtectedRoute, AdminRoute } from './components/RouteGuards';
import { AppShell } from './components/AppShell';
import { useSettings } from './hooks/useSettings';
import { Skeleton } from './components/Skeleton';

// Lazy-loaded Page Components for Code Splitting
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const InventoryPage = lazy(() => import('./pages/InventoryPage').then(m => ({ default: m.InventoryPage })));
const CustomersPage = lazy(() => import('./pages/CustomersPage').then(m => ({ default: m.CustomersPage })));
const SalesPage = lazy(() => import('./pages/SalesPage').then(m => ({ default: m.SalesPage })));
const DebtsPage = lazy(() => import('./pages/DebtsPage').then(m => ({ default: m.DebtsPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ProductionPage = lazy(() => import('./pages/ProductionPage').then(m => ({ default: m.ProductionPage })));
const ExpenseLedgerPage = lazy(() => import('./pages/ExpenseLedgerPage').then(m => ({ default: m.ExpenseLedgerPage })));
const PublicBillPage = lazy(() => import('./pages/PublicBillPage').then(m => ({ default: m.PublicBillPage })));

function PageFallback() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl w-full" />
    </div>
  );
}

function App() {
  const { settings } = useSettings();

  useEffect(() => {
    if (settings?.favicon_url) {
      let link = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = settings.favicon_url;
      if (settings.favicon_url.startsWith('data:image/svg+xml')) {
        link.type = 'image/svg+xml';
      } else if (settings.favicon_url.startsWith('data:image/png')) {
        link.type = 'image/png';
      } else {
        link.type = 'image/x-icon';
      }
    }
  }, [settings?.favicon_url]);

  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/bill/:saleCode" element={<PublicBillPage />} />

              {/* Protected App Shell Routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <DashboardPage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/production"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <ProductionPage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventory"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <InventoryPage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/customers"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <CustomersPage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <SalesPage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/debts"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <DebtsPage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />

              {/* Standard Staff & Admin Accessible Pages */}
              <Route
                path="/expenses"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <ExpenseLedgerPage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <SettingsPage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />

              {/* Admin-Only Routes */}
              <Route
                path="/reports"
                element={
                  <AdminRoute>
                    <AppShell>
                      <ReportsPage />
                    </AppShell>
                  </AdminRoute>
                }
              />

              {/* Fallback Catch-all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
