// Loaders del router: aplican las decisiones puras de src/auth/guards.ts antes de mostrar cada pantalla (spec 05 §15.5, §16.2, §16.3).
import { redirect, type LoaderFunctionArgs } from 'react-router';
import { markSessionLossHandled } from '../api/client';
import { getOrder, listOrders, type OrderDetail, type OrderPage } from '../api/orders';
import { listProducts, listStockAlerts, type Product } from '../api/products';
import { resolveLoginAccess, resolveProtectedAccess, resolveUnknownRoute } from '../auth/guards';
import { sessionStore } from '../auth/session-store';
import { classifyOrderError, parseOrdersQuery, type OrdersQuery } from '../orders/orders';
import { classifyProductError } from '../products/inventory';

/** Ruta protegida: sin sesión o con sesión vencida redirige a /login sin llamar a la API. */
export function protectedLoader(): null {
  const decision = resolveProtectedAccess(sessionStore.getSession(), Date.now());
  if (decision.kind === 'allow') return null;
  // El loader ya redirige: el cliente no debe duplicar la navegación (no-op si hay sesión activa).
  if (decision.reason !== 'expired') markSessionLossHandled();
  if (decision.reason === 'expired') {
    // Expiración coordinada: el aviso viaja con la redirección y el cliente HTTP no vuelve a notificar.
    sessionStore.clearSession('expired');
    markSessionLossHandled();
  }
  throw redirect(decision.to);
}

export interface LoginLoaderData {
  /** true si se llega a /login tras detectar una sesión expirada (DP-05). */
  sessionExpired: boolean;
}

/** /login: con sesión válida redirige a /dashboard; si hay una sesión vencida, la limpia. */
export function loginLoader(): LoginLoaderData {
  const decision = resolveLoginAccess(sessionStore.getSession(), Date.now());
  if (decision.kind === 'redirect') throw redirect(decision.to);
  if (decision.clearExpired) {
    // Llegada directa con token vencido (§16.3 "Token vencido"): se limpia y se muestra el formulario sin aviso.
    sessionStore.clearSession('expired');
    sessionStore.consumeEndReason();
    markSessionLossHandled();
  }
  return { sessionExpired: sessionStore.consumeEndReason() === 'expired' };
}

/** Ruta desconocida o V2 (DP-07): destino según la sesión. */
export function unknownRouteLoader(): string {
  return resolveUnknownRoute(sessionStore.getSession(), Date.now());
}

export type ProductsLoaderData =
  | { status: 'ready'; products: Product[]; alerts: Product[] | null }
  | { status: 'error' }
  /** La sesión se perdió: el flujo de sesión ya redirige a /login; la pantalla no muestra error. */
  | { status: 'session' };

const isSessionError = (error: unknown): boolean => classifyProductError(error).kind === 'session';

/**
 * /dashboard/products: lee productos y alertas en paralelo, cada una con su propio manejo (spec 05 §16.4).
 * Nunca lanza: los fallos viajan en el resultado. Si solo fallan las alertas, alerts es null (sin resaltado).
 */
export async function productsLoader(): Promise<ProductsLoaderData> {
  const [products, alerts] = await Promise.allSettled([listProducts(), listStockAlerts()]);
  if (
    (products.status === 'rejected' && isSessionError(products.reason)) ||
    (alerts.status === 'rejected' && isSessionError(alerts.reason))
  ) {
    return { status: 'session' };
  }
  if (products.status === 'rejected' || !Array.isArray(products.value?.items)) return { status: 'error' };
  const alertItems = alerts.status === 'fulfilled' && Array.isArray(alerts.value?.items) ? alerts.value.items : null;
  return { status: 'ready', products: products.value.items, alerts: alertItems };
}

export type AlertsLoaderData =
  | { status: 'ready'; alerts: Product[] }
  | { status: 'error' }
  /** La sesión se perdió: el flujo de sesión ya redirige a /login; el panel no muestra error. */
  | { status: 'session' };

/**
 * /dashboard: lee las alertas de stock (spec 05 §16.4, spec 02 F-6). La condición de alerta la decide la API (RN-09).
 * Nunca lanza: los fallos viajan en el resultado.
 */
export async function alertsLoader(): Promise<AlertsLoaderData> {
  try {
    const response = await listStockAlerts();
    if (!Array.isArray(response?.items)) return { status: 'error' };
    return { status: 'ready', alerts: response.items };
  } catch (error) {
    return isSessionError(error) ? { status: 'session' } : { status: 'error' };
  }
}

export type OrderDetailState =
  | { status: 'ready'; order: OrderDetail }
  | { status: 'not-found' }
  | { status: 'invalid'; message: string }
  | { status: 'error' };

export type OrdersLoaderData =
  /** detail es null si la URL no abre ningún pedido. Un fallo del detalle no oculta el listado. */
  | { status: 'ready'; query: OrdersQuery; orders: OrderPage; detail: OrderDetailState | null }
  | { status: 'error'; query: OrdersQuery; detail: OrderDetailState | null }
  | { status: 'invalid'; query: OrdersQuery; message: string; detail: OrderDetailState | null }
  /** La sesión se perdió: el flujo de sesión ya redirige a /login; la pantalla no muestra error. */
  | { status: 'session' };

function orderDetailState(result: PromiseSettledResult<OrderDetail | null>): OrderDetailState | null {
  if (result.status === 'fulfilled') {
    const order = result.value;
    if (order === null) return null;
    return Array.isArray(order?.items) && order.customer ? { status: 'ready', order } : { status: 'error' };
  }
  const error = classifyOrderError(result.reason);
  if (error.kind === 'not-found') return { status: 'not-found' };
  if (error.kind === 'validation') return { status: 'invalid', message: error.message };
  return { status: 'error' };
}

/**
 * /dashboard/orders: lee en paralelo el listado y, si la URL abre un pedido, su detalle (spec 05 §16.4, spec 04 F-3).
 * Nunca lanza: los fallos viajan en el resultado.
 */
export async function ordersLoader({ request }: LoaderFunctionArgs): Promise<OrdersLoaderData> {
  const query = parseOrdersQuery(new URL(request.url).searchParams);
  const [orders, order] = await Promise.allSettled([
    listOrders(query),
    query.orderId === null ? Promise.resolve(null) : getOrder(query.orderId),
  ]);
  const lostSession = (result: PromiseSettledResult<unknown>) =>
    result.status === 'rejected' && classifyOrderError(result.reason).kind === 'session';
  if (lostSession(orders) || lostSession(order)) return { status: 'session' };

  const detail = orderDetailState(order);
  if (orders.status === 'rejected') {
    const error = classifyOrderError(orders.reason);
    return error.kind === 'validation'
      ? { status: 'invalid', query, message: error.message, detail }
      : { status: 'error', query, detail };
  }
  if (!Array.isArray(orders.value?.items) || !orders.value.pagination) return { status: 'error', query, detail };
  return { status: 'ready', query, orders: orders.value, detail };
}
