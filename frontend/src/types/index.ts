export type UnitType = 'kg' | 'g' | 'L' | 'mL' | 'unit';

export interface User {
  id: number;
  username: string;
  email: string;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  sku: string;
  unit_type: UnitType;
  created_at: string;
  updated_at: string;
}

export interface Stock {
  id: number;
  product: number;
  product_name?: string;
  quantity: string;
  available_quantity: string;
  unit_cost: string;
  source: 'manual' | 'purchase_order';
  created_at: string;
}

export interface PurchaseOrderItem {
  id?: number;
  product: number;
  product_name?: string;
  quantity: string;
  unit_price: string;
  total_price?: string;
}

export interface PurchaseOrder {
  id: number;
  status: 'draft' | 'confirmed' | 'cancelled';
  supplier: string;
  notes: string;
  items: PurchaseOrderItem[];
  created_at: string;
}

export interface SalesOrderItem {
  id?: number;
  product: number;
  product_name?: string;
  quantity: string;
  unit_price: string;
  total_price?: string;
}

export interface SalesOrder {
  id: number;
  status: 'draft' | 'confirmed' | 'cancelled';
  customer: string;
  notes: string;
  items: SalesOrderItem[];
  created_at: string;
}

export interface ProductFinancial {
  product_id: number;
  product_name: string;
  total_purchased_quantity: string;
  total_purchase_cost: string;
  total_sold_quantity: string;
  total_sales_revenue: string;
  profit: string;
  profit_margin: string;
  current_stock: string;
}

export interface DashboardFinancial {
  total_revenue: string;
  total_cost: string;
  total_profit: string;
  profit_margin: string;
  products_summary: ProductFinancial[];
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
