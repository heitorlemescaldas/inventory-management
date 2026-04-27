import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';
import type { Stock, PaginatedResponse } from '../types';

export function useStocks(productId?: number) {
  return useQuery({
    queryKey: ['stocks', { productId }],
    queryFn: () =>
      api
        .get<PaginatedResponse<Stock> | Stock[]>('/stocks/', {
          params: productId ? { product: productId, page_size: 1000 } : { page_size: 1000 },
        })
        .then((res) => {
          const data = res.data as any;
          return Array.isArray(data) ? (data as Stock[]) : (data.results as Stock[]);
        }),
  });
}

export function useCreateStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { product: number; quantity: string; unit_cost: string }) =>
      api.post<Stock>('/stocks/', data).then((res) => res.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['stocks'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['finance'] });
      if (vars.product) {
        qc.invalidateQueries({ queryKey: ['finance', 'product', vars.product] });
      }
    },
  });
}
