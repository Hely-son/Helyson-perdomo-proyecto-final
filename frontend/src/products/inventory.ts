// Lógica pura de la pantalla de inventario (spec 05 §16.4, §16.5; spec 02 DP-04, §9). Sin React ni red.
// No aplica reglas RN-: el resaltado cruza ids con listStockAlerts y los errores se deciden por `code`.
import { ApiError, NoSessionError, SessionExpiredError } from '../api/client';
import type { AdjustStockRequest, Product } from '../api/products';

/** Ids resaltados: los del catálogo que también figuran en alertas. Sin alertas (null) no hay resaltado. */
export function criticalProductIds(products: readonly Product[], alerts: readonly Product[] | null): ReadonlySet<number> {
  if (alerts === null) return new Set();
  const alertIds = new Set(alerts.map((alert) => alert.id));
  return new Set(products.filter((product) => alertIds.has(product.id)).map((product) => product.id));
}

export function buildAdjustStockRequest(shown: Pick<Product, 'currentStock'>, newStock: number): AdjustStockRequest {
  return { newStock, expectedStock: shown.currentStock };
}

export type ProductErrorOutcome =
  | { kind: 'session' }
  | { kind: 'validation'; message: string }
  | { kind: 'conflict'; message: string; reloadLists: true }
  | { kind: 'not-found'; message: string; reloadLists: true }
  | { kind: 'technical'; message: string };

export type ProductActionResult<T> = { ok: true; value: T } | { ok: false; error: ProductErrorOutcome };

export const TECHNICAL_MESSAGE = 'Ocurrió un error inesperado. Inténtalo de nuevo.';
const MALFORMED_MESSAGE = 'Los datos enviados no son válidos. Revísalos e inténtalo de nuevo.';
const CONFLICT_MESSAGE = 'El stock cambió mientras lo editabas. Se actualizó la lista; revisa el valor actual e inténtalo de nuevo.';
const NOT_FOUND_MESSAGE = 'El producto ya no existe. Se actualizó la lista.';

export function classifyProductError(error: unknown): ProductErrorOutcome {
  if (error instanceof SessionExpiredError || error instanceof NoSessionError) return { kind: 'session' };
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'UNAUTHORIZED':
        return { kind: 'session' };
      case 'VALIDATION_ERROR':
        return { kind: 'validation', message: error.message };
      case 'MALFORMED_REQUEST':
        return { kind: 'validation', message: MALFORMED_MESSAGE };
      case 'STOCK_CHANGED':
        return { kind: 'conflict', message: CONFLICT_MESSAGE, reloadLists: true };
      case 'PRODUCT_NOT_FOUND':
        return { kind: 'not-found', message: NOT_FOUND_MESSAGE, reloadLists: true };
    }
  }
  return { kind: 'technical', message: TECHNICAL_MESSAGE };
}

/** Ejecuta una operación y recarga las listas tras un éxito, un conflicto o un producto inexistente. Nunca rechaza. */
export async function runProductAction<T>(action: () => Promise<T>, reloadLists: () => unknown): Promise<ProductActionResult<T>> {
  try {
    const value = await action();
    reloadLists();
    return { ok: true, value };
  } catch (cause) {
    const error = classifyProductError(cause);
    if ('reloadLists' in error) reloadLists();
    return { ok: false, error };
  }
}
