// Operaciones de pedidos del operador (docs/openapi.yaml, tag Orders). Todas son protegidas (Bearer).
import { apiRequest } from './client';

export type OrderStatus = 'PENDING' | 'PROCESSING' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
/** PENDING nunca es destino (RN-05). */
export type OrderTargetStatus = Exclude<OrderStatus, 'PENDING'>;

export interface OrderSummary {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: string;
  customer: { id: number; businessName: string };
  createdAt: string;
}

export interface OrderItem {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface OrderDetail {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: string;
  customer: { id: number; businessName: string; taxId: string; phone: string };
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderPage {
  items: OrderSummary[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

// El id se codifica siempre: nunca puede alterar la ruta (S-3).
const orderPath = (id: number): string => `/orders/${encodeURIComponent(String(id))}`;

/** Sin pageSize: se usa el valor por defecto del contrato. */
export function listOrders({ status, page }: { status: OrderStatus | null; page: number }): Promise<OrderPage> {
  const params = new URLSearchParams();
  if (status !== null) params.set('status', status);
  if (page > 1) params.set('page', String(page));
  const search = params.toString();
  return apiRequest<OrderPage>(search === '' ? '/orders' : `/orders?${search}`, { auth: true });
}

export const getOrder = (id: number): Promise<OrderDetail> => apiRequest<OrderDetail>(orderPath(id), { auth: true });

export const changeOrderStatus = (id: number, status: OrderTargetStatus): Promise<OrderDetail> =>
  apiRequest<OrderDetail>(`${orderPath(id)}/status`, { auth: true, method: 'PATCH', body: { status } });
