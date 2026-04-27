import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';
import type { SalesOrder, SalesOrderItem, PaginatedResponse } from '../types';

export interface SalesOrderInput {
  customer: string;
  notes?: string;
  items: Array<Pick<SalesOrderItem, 'product' | 'quantity' | 'unit_price'>>;
}

export function useSalesOrders(page = 1) {
  return useQuery({
    queryKey: ['sales-orders', { page }],
    queryFn: () =>
      api
        .get<PaginatedResponse<SalesOrder>>('/sales-orders/', {
          params: { page },
        })
        .then((res) => res.data),
  });
}

export function useSalesOrder(id: number | undefined) {
  return useQuery({
    queryKey: ['sales-orders', id],
    queryFn: () =>
      api.get<SalesOrder>(`/sales-orders/${id}/`).then((res) => res.data),
    enabled: !!id,
  });
}

export function useCreateSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SalesOrderInput) =>
      api.post<SalesOrder>('/sales-orders/', data).then((res) => res.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-orders'] }),
  });
}

export function useConfirmSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<SalesOrder>(`/sales-orders/${id}/confirm/`).then((res) => res.data),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      qc.invalidateQueries({ queryKey: ['sales-orders', id] });
      qc.invalidateQueries({ queryKey: ['stocks'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['finance'] });
    },
  });
}

export function useCancelSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<SalesOrder>(`/sales-orders/${id}/cancel/`).then((res) => res.data),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      qc.invalidateQueries({ queryKey: ['sales-orders', id] });
    },
  });
}
