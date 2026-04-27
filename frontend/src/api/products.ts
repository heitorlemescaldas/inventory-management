import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';
import type { Product, PaginatedResponse } from '../types';

export interface ProductInput {
  name: string;
  description?: string;
  sku: string;
  unit_type: string;
}

export function useProducts(page = 1, search = '') {
  return useQuery({
    queryKey: ['products', { page, search }],
    queryFn: () =>
      api
        .get<PaginatedResponse<Product>>('/products/', {
          params: { page, search: search || undefined },
        })
        .then((res) => res.data),
  });
}

export function useAllProducts() {
  return useQuery({
    queryKey: ['products', 'all'],
    queryFn: () =>
      api
        .get<PaginatedResponse<Product> | Product[]>('/products/', {
          params: { page_size: 1000 },
        })
        .then((res) => {
          const data = res.data as any;
          return Array.isArray(data) ? (data as Product[]) : (data.results as Product[]);
        }),
  });
}

export function useProduct(id: number | undefined) {
  return useQuery({
    queryKey: ['products', id],
    queryFn: () => api.get<Product>(`/products/${id}/`).then((res) => res.data),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProductInput) =>
      api.post<Product>('/products/', data).then((res) => res.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useUpdateProduct(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ProductInput>) =>
      api.patch<Product>(`/products/${id}/`, data).then((res) => res.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products', id] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/products/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}
