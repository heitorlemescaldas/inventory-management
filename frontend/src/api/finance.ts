import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';
import type { DashboardFinancial, ProductFinancial } from '../types';

export function useDashboard() {
  return useQuery({
    queryKey: ['finance', 'dashboard'],
    queryFn: () =>
      api.get<DashboardFinancial>('/finance/dashboard/').then((res) => res.data),
  });
}

export function useProductFinancial(productId: number | undefined) {
  return useQuery({
    queryKey: ['finance', 'product', productId],
    queryFn: () =>
      api
        .get<ProductFinancial>(`/finance/products/${productId}/`)
        .then((res) => res.data),
    enabled: !!productId,
  });
}
