import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import { ProtectedRoute, AdminRoute } from './components/RouteGuards';
import { AppShell } from './components/AppShell';
import { useSettings } from './hooks/useSettings';
import { Skeleton } from './components/Skeleton';
import { ErrorBoundary } from './components/ErrorBoundary';

// Lazy-loaded Page Components for Code Splitting
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const InventoryPage = lazy(() => import('./pages/InventoryPage').then(m => ({ default: m.InventoryPage })));
const CustomersPage = lazy(() => import('./pages/CustomersPage').then(m => ({ default: m.CustomersPage })));
const CustomerProfilePage = lazy(() => import('./pages/CustomerProfilePage').then(m => ({ default: m.CustomerProfilePage })));
const EmployeesPage = lazy(() => import('./pages/EmployeesPage').then(m => ({ default: m.EmployeesPage })));
const VehiclesPage = lazy(() => import('./pages/VehiclesPage').then(m => ({ default: m.VehiclesPage })));
const VehicleProfilePage = lazy(() => import('./pages/VehicleProfilePage').then(m => ({ default: m.VehicleProfilePage })));
const TransportPage = lazy(() => import('./pages/TransportPage').then(m => ({ default: m.TransportPage })));
const NotesPage = lazy(() => import('./pages/NotesPage').then(m => ({ default: m.NotesPage })));
const SalesPage = lazy(() => import('./pages/SalesPage').then(m => ({ default: m.SalesPage })));
const DebtsPage = lazy(() => import('./pages/DebtsPage').then(m => ({ default: m.DebtsPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ExpenseLedgerPage = lazy(() => import('./pages/ExpenseLedgerPage').then(m => ({ default: m.ExpenseLedgerPage })));
const CashBankPage = lazy(() => import('./pages/CashBankPage').then(m => ({ default: m.CashBankPage })));
const PublicBillPage = lazy(() => import('./pages/PublicBillPage').then(m => ({ default: m.PublicBillPage })));
const PublicReceiptPage = lazy(() => import('./pages/PublicReceiptPage').then(m => ({ default: m.PublicReceiptPage })));
const RecentActionsPage = lazy(() => import('./pages/RecentActionsPage').then(m => ({ default: m.RecentActionsPage })));
const TrashPage = lazy(() => import('./pages/TrashPage').then(m => ({ default: m.TrashPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })));



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

  // main.jsx sets this flag before reloading once to recover from a stale
  // deploy's "Failed to fetch dynamically imported module" error. Clear it
  // a few seconds after a successful mount so a *later*, genuinely new
  // redeploy in this same long-lived tab can still trigger one more
  // recovery reload, rather than being suppressed for the rest of the
  // session — but not immediately, so a reload that didn't actually fix
  // anything (a truly broken chunk on the CDN) still only reloads once.
  useEffect(() => {
    const timer = setTimeout(() => {
      sessionStorage.removeItem('saga_reloaded_after_stale_chunk');
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/bill/:saleCode" element={<PublicBillPage />} />
              {/* 24-hour debt-settlement receipt link, sent with the settlement message. */}
              <Route path="/receipt/:settlementCode" element={<PublicReceiptPage />} />

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
                path="/customers/:id"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <CustomerProfilePage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/employees"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <EmployeesPage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vehicles"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <VehiclesPage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vehicles/:id"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <VehicleProfilePage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/transport"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <TransportPage />
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
                path="/cash-bank"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <ErrorBoundary>
                        <CashBankPage />
                      </ErrorBoundary>
                    </AppShell>
                  </ProtectedRoute>
                }
              />

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
                path="/notes"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <NotesPage />
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

              <Route
                path="/notifications"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <NotificationsPage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/recent-actions"
                element={
                  <AdminRoute>
                    <AppShell>
                      <RecentActionsPage />
                    </AppShell>
                  </AdminRoute>
                }
              />

              <Route
                path="/trash"
                element={
                  <AdminRoute>
                    <AppShell>
                      <TrashPage />
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
  </QueryClientProvider>
);
}

export default App;
