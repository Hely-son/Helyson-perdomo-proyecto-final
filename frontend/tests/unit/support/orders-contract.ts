// TK-06.4 · contrato observable de /dashboard/orders (spec 04 F-3..F-6, DP-02; spec 05 §16.4, §16.5).
// Matriz y contrato de interfaz: docs/qa/TK-06.4-matrix.md. No es un archivo de pruebas (Jest solo ejecuta *.test.ts).
// El montaje de la app es el de products-harness.ts (router real, loaders reales, fetch simulado por ruta), sin modificarlo.
import { jsonResponse } from './app-harness';
import { loadModule, type ApiCall } from './products-harness';

export const ORDERS_PATH = '/dashboard/orders';

export type OrderStatus = 'PENDING' | 'PROCESSING' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
export type OrderTargetStatus = Exclude<OrderStatus, 'PENDING'>;

/** Acciones por estado actual (RN-05, ayuda visual de DP-02). El orden no se fija. */
export const ACTIONS_BY_STATUS: Record<OrderStatus, readonly OrderTargetStatus[]> = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};
export const ALL_STATUSES = Object.keys(ACTIONS_BY_STATUS) as OrderStatus[];

// ── Detectores del HTML (los textos exactos los fija la implementación) ──────────────────────────────────────────
/** Sin pedidos o filtro sin resultados (ESC-41). */
export const EMPTY_ORDERS = /no hay pedidos|sin pedidos|no se encontraron pedidos/i;
/** Error técnico del listado (ESC-42). */
export const LIST_ERROR = /no se (?:pudo cargar el listado|pudieron cargar los pedidos)/i;
/** Error técnico del detalle (ESC-42). */
export const DETAIL_ERROR = /no se pudo cargar el (?:detalle|pedido)/i;
/** El pedido no existe (§16.4 "Recurso no encontrado"). */
export const ORDER_GONE = /pedido[^<.]*(?:no existe|no se encontr[oó])/i;
/** Control del filtro por estado (etiqueta visible o aria-label). */
export const STATUS_FILTER = /filtrar por estado/i;

// ── Formas del contrato (docs/openapi.yaml, tag Orders) ──────────────────────────────────────────────────────────
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

export function summary(id: number, status: OrderStatus, overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id,
    orderNumber: `MED-${String(id).padStart(5, '0')}`,
    status,
    totalAmount: `${1000 + id}.00`,
    customer: { id: 90, businessName: `Clínica Ficticia ${id}` },
    createdAt: '2026-11-20T10:00:00.000Z',
    ...overrides,
  };
}

/** Detalle con valores distintivos. totalAmount NO es la suma de los subtotales a propósito: la pantalla no calcula. */
export function detail(id: number, status: OrderStatus): OrderDetail {
  return {
    id,
    orderNumber: `MED-${String(id).padStart(5, '0')}`,
    status,
    totalAmount: '905.75',
    customer: { id: 90, businessName: 'Farmacia Ficticia Austral', taxId: '76543210-K', phone: '+56912345678' },
    items: [
      { productId: 1, productName: 'Guante de nitrilo', quantity: 7, unitPrice: '111.50', subtotal: '780.50' },
      { productId: 2, productName: 'Jeringa estéril', quantity: 4, unitPrice: '25.00', subtotal: '100.00' },
    ],
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
  };
}

export function orderPage(items: readonly OrderSummary[], pagination: Partial<Record<'page' | 'pageSize' | 'totalItems' | 'totalPages', number>> = {}) {
  const page = pagination.page ?? 1;
  const pageSize = pagination.pageSize ?? 20;
  const totalItems = pagination.totalItems ?? items.length;
  return jsonResponse(200, {
    items,
    pagination: { page, pageSize, totalItems, totalPages: pagination.totalPages ?? Math.ceil(totalItems / pageSize) },
  });
}

export const orderResponse = (order: OrderDetail) => jsonResponse(200, order);

/** Parámetros efectivos de una llamada al listado: omitir page o pageSize equivale a los valores por defecto. */
export function listParams(call: ApiCall): { status: string | null; page: string; pageSize: string } {
  const params = new URL(call.url, 'http://qa.local').searchParams;
  return { status: params.get('status'), page: params.get('page') ?? '1', pageSize: params.get('pageSize') ?? '20' };
}

/** Valores de data-order-action presentes en el HTML, ordenados. */
export function actionsIn(html: string): string[] {
  return [...html.matchAll(/data-order-action="([A-Z]+)"/g)].map((m) => m[1]).sort();
}

/** Valores de data-order-status presentes en un fragmento de HTML. */
export function statusesIn(html: string | null): string[] {
  return [...(html ?? '').matchAll(/data-order-status="([A-Z]+)"/g)].map((m) => m[1]);
}

// ── Contrato de los módulos nuevos ───────────────────────────────────────────────────────────────────────────────
export interface OrdersQuery {
  status: OrderStatus | null;
  page: number;
  orderId: number | null;
}

export type OrderErrorOutcome =
  | { kind: 'session' }
  | { kind: 'validation'; message: string }
  | { kind: 'conflict'; message: string; reload: true }
  | { kind: 'not-found'; message: string; reload: true }
  | { kind: 'technical'; message: string; reload: true };

export type OrderActionResult<T> = { ok: true; value: T } | { ok: false; error: OrderErrorOutcome };

export type OrderDetailState =
  | { status: 'ready'; order: OrderDetail }
  | { status: 'not-found' }
  | { status: 'invalid'; message: string }
  | { status: 'error' };

export interface OrdersModule {
  availableOrderActions(status: OrderStatus): readonly OrderTargetStatus[];
  parseOrdersQuery(params: URLSearchParams): OrdersQuery;
  ordersSearch(query: OrdersQuery): string;
  withStatusFilter(query: OrdersQuery, status: OrderStatus | null): OrdersQuery;
  classifyOrderError(error: unknown): OrderErrorOutcome;
  runOrderAction<T>(action: () => Promise<T>, reload: () => unknown): Promise<OrderActionResult<T>>;
}

export interface OrdersApiModule {
  changeOrderStatus(id: number, status: OrderTargetStatus): Promise<OrderDetail>;
}

export interface OrderDetailPanelProps {
  detail: OrderDetailState;
  submitting: boolean;
  onChangeStatus: (target: OrderTargetStatus) => void;
}

export interface OrderDetailPanelModule {
  OrderDetailPanel: (props: OrderDetailPanelProps) => import('react').ReactElement | null;
}

export const loadOrders = () => loadModule<OrdersModule>('orders/orders');
export const loadOrdersApi = () => loadModule<OrdersApiModule>('api/orders');
export const loadOrderDetailPanel = () => loadModule<OrderDetailPanelModule>('orders/OrderDetailPanel');
