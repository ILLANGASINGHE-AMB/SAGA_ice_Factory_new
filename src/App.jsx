import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import { ProtectedRoute, AdminRoute } from './components/RouteGuards';
import { AppShell } from './components/AppShell';
import { useSettings } from './hooks/useSettings';

// Import Pages
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { CustomersPage } from './pages/CustomersPage';
import { SalesPage } from './pages/SalesPage';
import { DebtsPage } from './pages/DebtsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

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
          <Routes>
            {/* Public Auth Route */}
            <Route path="/login" element={<LoginPage />} />

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
              path="/settings"
              element={
                <AdminRoute>
                  <AppShell>
                    <SettingsPage />
                  </AppShell>
                </AdminRoute>
              }
            />

            {/* Fallback Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
