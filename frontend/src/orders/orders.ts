// Lógica pura de la pantalla de pedidos (spec 05 §16.4, §16.5; spec 04 F-6, DP-02). Sin React ni red.
// El mapa de acciones es solo una ayuda visual: la autoridad sobre las transiciones (RN-05) es el backend.
import { ApiError, NoSessionError, SessionExpiredError } from '../api/client';
import type { OrderStatus, OrderTargetStatus } from '../api/orders';

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pendiente',
  PROCESSING: 'En proceso',
  DISPATCHED: 'Despachado',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

export const ACTION_LABELS: Record<OrderTargetStatus, string> = {
  PROCESSING: 'Procesar',
  DISPATCHED: 'Despachar',
  DELIVERED: 'Entregar',
  CANCELLED: 'Cancelar',
};

const ACTIONS: Record<OrderStatus, readonly OrderTargetStatus[]> = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const availableOrderActions = (status: OrderStatus): readonly OrderTargetStatus[] => ACTIONS[status] ?? [];

export const formatOrderDate = (iso: string): string =>
  new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });

export interface OrdersQuery {
  status: OrderStatus | null;
  page: number;
  orderId: number | null;
}

const isOrderStatus = (value: string | null): value is OrderStatus => value !== null && Object.hasOwn(STATUS_LABELS, value);

function positiveInteger(value: string | null): number | null {
  if (value === null || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Lee status, page y order de la URL. Un valor inválido se descarta y no llega a la API. */
export function parseOrdersQuery(params: URLSearchParams): OrdersQuery {
  const status = params.get('status');
  return {
    status: isOrderStatus(status) ? status : null,
    page: positiveInteger(params.get('page')) ?? 1,
    orderId: positiveInteger(params.get('order')),
  };
}

/** Query string (con "?") de una consulta; omite los valores por defecto. */
export function ordersSearch({ status, page, orderId }: OrdersQuery): string {
  const params = new URLSearchParams();
  if (status !== null) params.set('status', status);
  if (page > 1) params.set('page', String(page));
  if (orderId !== null) params.set('order', String(orderId));
  const search = params.toString();
  return search === '' ? '' : `?${search}`;
}

/** Cambiar el filtro vuelve a la página 1 y cierra el detalle. */
export const withStatusFilter = (_current: OrdersQuery, status: OrderStatus | null): OrdersQuery => ({
  status,
  page: 1,
  orderId: null,
});

export type OrderErrorOutcome =
  | { kind: 'session' }
  | { kind: 'validation'; message: string }
  | { kind: 'conflict'; message: string; reload: true }
  | { kind: 'not-found'; message: string; reload: true }
  | { kind: 'technical'; message: string; reload: true };

export type OrderActionResult<T> = { ok: true; value: T } | { ok: false; error: OrderErrorOutcome };

const CONFLICT_MESSAGE = 'El estado del pedido cambió. Se actualizó la información; revisa el estado actual.';
const NOT_FOUND_MESSAGE = 'El pedido no existe. Se actualizó la lista.';
const MALFORMED_MESSAGE = 'Los datos enviados no son válidos.';
const TECHNICAL_MESSAGE = 'No se pudo completar la operación. Se volvió a consultar la información; revisa el estado actual.';

/** Clasifica por `code` (spec 05 §16.5). Los errores técnicos nunca exponen detalles del servidor. */
export function classifyOrderError(error: unknown): OrderErrorOutcome {
  if (error instanceof SessionExpiredError || error instanceof NoSessionError) return { kind: 'session' };
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'UNAUTHORIZED':
        return { kind: 'session' };
      case 'VALIDATION_ERROR':
        return { kind: 'validation', message: error.message };
      case 'MALFORMED_REQUEST':
        return { kind: 'validation', message: MALFORMED_MESSAGE };
      case 'INVALID_ORDER_TRANSITION':
        return { kind: 'conflict', message: CONFLICT_MESSAGE, reload: true };
      case 'ORDER_NOT_FOUND':
        return { kind: 'not-found', message: NOT_FOUND_MESSAGE, reload: true };
    }
  }
  return { kind: 'technical', message: TECHNICAL_MESSAGE, reload: true };
}

/**
 * Ejecuta un cambio y vuelve a leer tras un éxito, un conflicto, un pedido inexistente o un fallo técnico (el
 * resultado es incierto). Nunca rechaza.
 */
export async function runOrderAction<T>(action: () => Promise<T>, reload: () => unknown): Promise<OrderActionResult<T>> {
  try {
    const value = await action();
    reload();
    return { ok: true, value };
  } catch (cause) {
    const error = classifyOrderError(cause);
    if ('reload' in error) reload();
    return { ok: false, error };
  }
}
