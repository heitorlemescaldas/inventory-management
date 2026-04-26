import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Placeholder pages - agents will implement these
const LoginPage = () => <div>Login Page</div>;
const RegisterPage = () => <div>Register Page</div>;
const DashboardPage = () => <div>Dashboard</div>;
const ProductsPage = () => <div>Products</div>;
const ProductDetailPage = () => <div>Product Detail</div>;
const PurchaseOrdersPage = () => <div>Purchase Orders</div>;
const PurchaseOrderNewPage = () => <div>New Purchase Order</div>;
const PurchaseOrderDetailPage = () => <div>Purchase Order Detail</div>;
const SalesOrdersPage = () => <div>Sales Orders</div>;
const SalesOrderNewPage = () => <div>New Sales Order</div>;
const SalesOrderDetailPage = () => <div>Sales Order Detail</div>;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div>Loading...</div>;
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
      <Route path="/products/:id" element={<ProtectedRoute><ProductDetailPage /></ProtectedRoute>} />
      <Route path="/purchases" element={<ProtectedRoute><PurchaseOrdersPage /></ProtectedRoute>} />
      <Route path="/purchases/new" element={<ProtectedRoute><PurchaseOrderNewPage /></ProtectedRoute>} />
      <Route path="/purchases/:id" element={<ProtectedRoute><PurchaseOrderDetailPage /></ProtectedRoute>} />
      <Route path="/sales" element={<ProtectedRoute><SalesOrdersPage /></ProtectedRoute>} />
      <Route path="/sales/new" element={<ProtectedRoute><SalesOrderNewPage /></ProtectedRoute>} />
      <Route path="/sales/:id" element={<ProtectedRoute><SalesOrderDetailPage /></ProtectedRoute>} />
    </Routes>
  );
}

export default function App() {
  return (
    <MantineProvider>
      <Notifications />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  );
}
