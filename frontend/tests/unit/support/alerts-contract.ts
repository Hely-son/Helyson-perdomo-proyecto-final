// TK-04.3 · contrato observable del panel de alertas de /dashboard (spec 02 F-6, §11.3; spec 05 §16.1, §16.4, §16.5).
// Matriz y contrato de interfaz: docs/qa/TK-04.3-matrix.md. No es un archivo de pruebas (Jest solo ejecuta *.test.ts).
// Reutiliza el montaje de products-harness.ts (router real, loaders reales, fetch simulado por ruta) sin modificarlo.
import { rowTag, type Product } from './products-harness';

export const HOME_PATH = '/dashboard';
/** Pantalla del layout sin loader de datos: punto de partida para abrir Inicio con la respuesta pendiente o fallida. */
export const OTHER_PATH = '/dashboard/orders';

/** Encabezado que se conserva (TK-01.2 y ESC-40 lo comprueban en E2E). */
export const HEADING = /alertas de stock/i;
/** Marcador de "Pantalla en construcción" de la versión anterior de Inicio. */
export const PLACEHOLDER = /pantalla en construcci[oó]n/i;
/** Lista vacía (spec 05 §16.4 "Sin resultados": mensaje de que no hay productos en alerta). */
export const EMPTY_ALERTS = /no hay productos en alerta/i;
/** Error técnico del panel: mensaje genérico que nombra las alertas (los textos exactos los fija la implementación). */
export const ALERTS_ERROR = /no se (?:pudo|pudieron) cargar[^<]*alertas/i;
/** Acción de V2 que el panel no puede ofrecer (spec 02 F-6 paso 3, ESC-22). */
export const REPONER = /reponer/i;

/** Datos del loader de /dashboard (contrato para frontend-engineer; mismo patrón que ProductsLoaderData). */
export type AlertsLoaderData =
  | { status: 'ready'; alerts: Product[] }
  | { status: 'error' }
  | { status: 'session' };

/** Texto de cada <td> de la fila, sin etiquetas. */
export function cells(rowHtmlOrNull: string | null): string[] {
  return (rowHtmlOrNull?.match(/<td\b[^>]*>[\s\S]*?<\/td>/g) ?? []).map((td) => td.replace(/<[^>]*>/g, '').trim());
}

/** true si `want` aparece en `all` en ese orden (admite columnas intermedias o adicionales). */
export function inOrder(all: readonly string[], want: readonly string[]): boolean {
  let next = 0;
  for (const item of all) if (item === want[next]) next += 1;
  return next === want.length;
}

/** Ids de las filas presentes, en el orden en que aparecen en el HTML. */
export function rowOrder(html: string, ids: readonly number[]): number[] {
  return ids
    .map((id) => ({ id, at: rowTag(html, id) === null ? -1 : html.indexOf(rowTag(html, id) as string) }))
    .filter((row) => row.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((row) => row.id);
}

/** Hay un <button> cuyo texto coincide (p. ej. "Reintentar"). */
export function hasButton(html: string, label: RegExp): boolean {
  const buttons = html.match(/<button\b[\s\S]*?<\/button>/g) ?? [];
  return buttons.some((b) => label.test(b.replace(/<[^>]*>/g, '')));
}

/** La etiqueta abre un elemento interactivo (botón, enlace o rol de botón). */
export const INTERACTIVE = /<button\b|<a\b|role="button"/i;
