// Operaciones de productos (docs/openapi.yaml, tag Products). Todas son protegidas (Bearer).
import { apiRequest } from './client';

export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: string;
  currentStock: number;
  minStockAlert: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductList {
  items: Product[];
}

export interface CreateProductRequest {
  name: string;
  description?: string | null;
  price: string;
  currentStock: number;
  minStockAlert: number;
}

/** Sin currentStock ni isActive: el stock se ajusta con adjustProductStock y no hay reactivación (DP-01). */
export interface UpdateProductRequest {
  name?: string;
  description?: string | null;
  price?: string;
  minStockAlert?: number;
}

export interface AdjustStockRequest {
  newStock: number;
  expectedStock: number;
}

// El id se codifica siempre: nunca puede alterar la ruta (S-3).
const productPath = (id: number): string => `/products/${encodeURIComponent(String(id))}`;

export const listProducts = (): Promise<ProductList> => apiRequest<ProductList>('/products', { auth: true });

export const listStockAlerts = (): Promise<ProductList> => apiRequest<ProductList>('/products/alerts', { auth: true });

export const getProduct = (id: number): Promise<Product> => apiRequest<Product>(productPath(id), { auth: true });

export const createProduct = (body: CreateProductRequest): Promise<Product> =>
  apiRequest<Product>('/products', { auth: true, method: 'POST', body });

export const updateProduct = (id: number, body: UpdateProductRequest): Promise<Product> =>
  apiRequest<Product>(productPath(id), { auth: true, method: 'PATCH', body });

export const deactivateProduct = (id: number): Promise<Product> =>
  apiRequest<Product>(`${productPath(id)}/deactivate`, { auth: true, method: 'POST' });

export const adjustProductStock = (id: number, body: AdjustStockRequest): Promise<Product> =>
  apiRequest<Product>(`${productPath(id)}/stock`, { auth: true, method: 'PATCH', body });
