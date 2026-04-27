import { MantineProvider, Center, Loader } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppLayout } from './components/AppShell';
import ErrorBoundary from './components/ErrorBoundary';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import ProductDetailPage from './pages/ProductDetailPage';
import PurchaseOrdersPage from './pages/PurchaseOrdersPage';
import PurchaseOrderNewPage from './pages/PurchaseOrderNewPage';
import PurchaseOrderDetailPage from './pages/PurchaseOrderDetailPage';
import SalesOrdersPage from './pages/SalesOrdersPage';
import SalesOrderNewPage from './pages/SalesOrderNewPage';
import SalesOrderDetailPage from './pages/SalesOrderDetailPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <Center mih="100vh">
        <Loader />
      </Center>
    );
  }
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <MantineProvider forceColorScheme="light">
        <Center mih="100vh">
          <Loader />
        </Center>
      </MantineProvider>
    );
  }
  return isAuthenticated ? (
    <Navigate to="/" replace />
  ) : (
    <MantineProvider forceColorScheme="light">{children}</MantineProvider>
  );
}

function Protected({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <RegisterPage />
          </PublicOnlyRoute>
        }
      />

      <Route
        path="/"
        element={
          <Protected>
            <DashboardPage />
          </Protected>
        }
      />
      <Route
        path="/products"
        element={
          <Protected>
            <ProductsPage />
          </Protected>
        }
      />
      <Route
        path="/products/:id"
        element={
          <Protected>
            <ProductDetailPage />
          </Protected>
        }
      />
      <Route
        path="/purchases"
        element={
          <Protected>
            <PurchaseOrdersPage />
          </Protected>
        }
      />
      <Route
        path="/purchases/new"
        element={
          <Protected>
            <PurchaseOrderNewPage />
          </Protected>
        }
      />
      <Route
        path="/purchases/:id"
        element={
          <Protected>
            <PurchaseOrderDetailPage />
          </Protected>
        }
      />
      <Route
        path="/sales"
        element={
          <Protected>
            <SalesOrdersPage />
          </Protected>
        }
      />
      <Route
        path="/sales/new"
        element={
          <Protected>
            <SalesOrderNewPage />
          </Protected>
        }
      />
      <Route
        path="/sales/:id"
        element={
          <Protected>
            <SalesOrderDetailPage />
          </Protected>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <MantineProvider defaultColorScheme="light">
      <Notifications position="top-right" />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  );
}
