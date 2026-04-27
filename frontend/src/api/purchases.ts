import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';
import type { PurchaseOrder, PurchaseOrderItem, PaginatedResponse } from '../types';

export interface PurchaseOrderInput {
  supplier: string;
  notes?: string;
  items: Array<Pick<PurchaseOrderItem, 'product' | 'quantity' | 'unit_price'>>;
}

export function usePurchaseOrders(page = 1) {
  return useQuery({
    queryKey: ['purchase-orders', { page }],
    queryFn: () =>
      api
        .get<PaginatedResponse<PurchaseOrder>>('/purchase-orders/', {
          params: { page },
        })
        .then((res) => res.data),
  });
}

export function usePurchaseOrder(id: number | undefined) {
  return useQuery({
    queryKey: ['purchase-orders', id],
    queryFn: () =>
      api.get<PurchaseOrder>(`/purchase-orders/${id}/`).then((res) => res.data),
    enabled: !!id,
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PurchaseOrderInput) =>
      api.post<PurchaseOrder>('/purchase-orders/', data).then((res) => res.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });
}

export function useConfirmPurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<PurchaseOrder>(`/purchase-orders/${id}/confirm/`).then((res) => res.data),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders', id] });
      qc.invalidateQueries({ queryKey: ['stocks'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['finance'] });
    },
  });
}

export function useCancelPurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<PurchaseOrder>(`/purchase-orders/${id}/cancel/`).then((res) => res.data),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders', id] });
    },
  });
}
