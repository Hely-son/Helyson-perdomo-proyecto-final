// Motor FSM del chat (spec 03 §4.2, F-3, F-4, F-5). Sin acceso a datos ni HTTP: la disponibilidad sale del
// servicio de productos (deps.products); la confirmación, del de pedidos (deps.orders). ORDER_LOOKUP llega en TK-06.3.
import type { ConfirmedOrder, OrderService, Rejection } from '../orders/orders.service';
import type { ProductService } from '../products/products.service';

export type ConversationState =
  | 'MAIN_MENU'
  | 'CATALOG'
  | 'ASK_QUANTITY'
  | 'STOCK_EXCEEDED'
  | 'CART'
  | 'REMOVE_ITEM'
  | 'SUMMARY'
  | 'RESOLVE_STOCK'
  | 'ORDER_LOOKUP';

/** Una línea por producto, sin precio (spec 03 §4.3). */
export interface CartLine {
  productId: number;
  quantity: number;
}

export type Cart = CartLine[];

/** Lo único que el FSM consume del servicio de productos (spec 02 §8.2). */
export type ChatProducts = Pick<ProductService, 'listCatalog' | 'getAvailability'>;

/** Lo único que el FSM consume del servicio de pedidos (spec 04 F-1). */
export type ChatOrders = Pick<OrderService, 'confirmOrder'>;

export interface ChatDeps {
  products: ChatProducts;
  orders: ChatOrders;
  /** Textos de la respuesta al crearse el pedido (D-C). Se invoca con la sesión ya cerrada (MAIN_MENU, carrito vacío). */
  confirmedOrderMessage?: (order: ConfirmedOrder) => string[];
}

/** Contexto de la conversación (D-4): vive en la propia sesión y se aísla entre sesiones. */
export interface ChatContext {
  /** Ids de la última lista de catálogo mostrada, en orden: el número `N` es `catalogIds[N-1]` (D-04). */
  catalogIds: number[];
  /** Producto elegido, en `ASK_QUANTITY`. */
  chosen?: { productId: number; name: string };
  /** Cantidad máxima informada, en `STOCK_EXCEEDED`. */
  excess?: { productId: number; name: string; informedStock: number };
  /** Resumen mostrado (D-07): nombre, precio mostrado (string decimal) y cantidad de cada línea, en el orden del carrito. */
  summary?: { productId: number; name: string; unitPrice: string; quantity: number }[];
  /** Ítems por resolver en `RESOLVE_STOCK`, en el orden del carrito (D-09). */
  pending?: { productId: number; name: string; availableStock: number }[];
}

export interface FsmSession {
  customerId: number;
  state: ConversationState;
  cart: Cart;
  context?: ChatContext;
}

export const MENU_TEXT = '1) Catálogo y compra\n2) Mis pedidos';

const msgs = {
  menuPrompt: 'Elige una opción.',
  orderLookup: 'Mis pedidos (próximamente). Responde 0 para volver al menú.',
  invalid: 'Opción no válida.',
  soldOut: 'Ese producto está agotado (Sin stock) y no se puede elegir.',
  notAvailable: 'Ese producto ya no está disponible.',
  askQuantityRetry: 'Indica la cantidad con un número entero mayor que 0, o 0 para volver al menú.',
  emptyCart: 'Tu carrito está vacío.',
} as const;

function defaultConfirmedMessage(order: ConfirmedOrder): string[] {
  return [`Tu pedido ${order.orderNumber} fue creado con estado PENDING. Total: $${order.totalAmount}.`, MENU_TEXT];
}

const menuReply = (): string[] => [msgs.menuPrompt, MENU_TEXT];

// Importes en centavos enteros (BigInt) derivados del string decimal: sin punto flotante (D-B).
function toCents(price: string): bigint {
  const m = /^(\d+)\.(\d{2})$/.exec(price);
  if (!m) throw new Error(`Importe con formato inesperado: ${price}`);
  return BigInt(m[1]) * 100n + BigInt(m[2]);
}

function fromCents(cents: bigint): string {
  const text = cents.toString().padStart(3, '0');
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

const contextOf = (session: FsmSession): ChatContext => (session.context ??= { catalogIds: [] });

/** Entero positivo escrito solo con dígitos; las cifras desmesuradas se acotan (nunca superan el stock real). */
function parseCount(input: string): number | null {
  if (!/^\d+$/.test(input)) return null;
  const n = Math.min(Number(input), Number.MAX_SAFE_INTEGER);
  return n > 0 ? n : null;
}

async function showCatalog(session: FsmSession, deps: ChatDeps, notice?: string): Promise<string[]> {
  const { items } = await deps.products.listCatalog();
  const context = contextOf(session);
  context.catalogIds = items.map((i) => i.id);
  delete context.chosen;
  delete context.excess;
  const rows = items.map(
    (i, idx) => `${idx + 1}) ${i.name} - $${i.price}${i.currentStock > 0 ? '' : ' - Sin stock'}`,
  );
  const body = [
    items.length > 0 ? 'Catálogo de productos:' : 'No hay productos disponibles por ahora.',
    ...rows,
    `${items.length + 1}) Ver carrito`,
    'Responde con el número de una opción, o 0 para volver al menú.',
  ].join('\n');
  session.state = 'CATALOG';
  return notice ? [notice, body] : [body];
}

/** Nombres actuales de las líneas del carrito (el carrito no guarda nombres ni precios). */
async function lineLabels(session: FsmSession, deps: ChatDeps): Promise<string[]> {
  return Promise.all(
    session.cart.map(async (line) => {
      const p = await deps.products.getAvailability(line.productId);
      return `${p?.name ?? `Producto ${line.productId}`} × ${line.quantity}`;
    }),
  );
}

async function showCart(session: FsmSession, deps: ChatDeps, notices: string[] = []): Promise<string[]> {
  session.state = 'CART';
  if (session.cart.length === 0) return [...notices, `${msgs.emptyCart}\n1) Agregar un producto`];
  const labels = await lineLabels(session, deps);
  return [...notices, ['Tu carrito:', ...labels.map((l) => `- ${l}`), '1) Agregar otro producto', '2) Quitar un ítem', '3) Confirmar compra'].join('\n')];
}

function renderSummary(session: FsmSession): string[] {
  const rows = contextOf(session).summary ?? [];
  let total = 0n;
  const body = rows.map((r) => {
    const subtotal = toCents(r.unitPrice) * BigInt(r.quantity);
    total += subtotal;
    return `- ${r.name} × ${r.quantity} = $${fromCents(subtotal)}`;
  });
  return [['Resumen de tu pedido:', ...body, `Total: $${fromCents(total)}`, '1) Confirmar pedido', '2) Volver al carrito'].join('\n')];
}

/** Resumen a precios vigentes (F-6, D-07): consulta cada precio y lo guarda como mostrado. No valida estado ni stock (D-10). */
async function showSummary(session: FsmSession, deps: ChatDeps, notices: string[] = []): Promise<string[]> {
  const rows = await Promise.all(
    session.cart.map(async (line) => {
      const p = await deps.products.getAvailability(line.productId);
      if (p === null) throw new Error(`Producto ${line.productId} inexistente al generar el resumen`);
      return { productId: line.productId, name: p.name, unitPrice: p.price, quantity: line.quantity };
    }),
  );
  const context = contextOf(session);
  context.summary = rows;
  delete context.pending;
  session.state = 'SUMMARY';
  return [...notices, ...renderSummary(session)];
}

function resolvePrompt(item: NonNullable<ChatContext['pending']>[number], quantity: number): string {
  const adjust = item.availableStock > 0 ? `1) Ajustar a ${item.availableStock} unidades` : '1) Ajustar (sin stock: se retira el producto)';
  return [
    `Stock insuficiente de ${item.name}: pediste ${quantity} y hay ${item.availableStock} disponibles.`,
    adjust,
    '2) Quitar este producto',
    '3) Cancelar la compra',
  ].join('\n');
}

/** Tras resolver los ítems: siguiente pendiente, o nuevo resumen (o carrito vacío) con los avisos acumulados. */
async function nextResolution(session: FsmSession, deps: ChatDeps, notices: string[]): Promise<string[]> {
  const item = contextOf(session).pending?.[0];
  if (item) {
    const quantity = session.cart.find((l) => l.productId === item.productId)?.quantity ?? 0;
    session.state = 'RESOLVE_STOCK';
    return [...notices, resolvePrompt(item, quantity)];
  }
  if (session.cart.length === 0) return showCart(session, deps, notices);
  return showSummary(session, deps, notices);
}

/** Procedimiento ante un rechazo (F-7, DP-03): inactivos, luego stock, luego nuevo resumen. */
async function applyRejections(session: FsmSession, deps: ChatDeps, rejections: Rejection[]): Promise<string[]> {
  const notices: string[] = [];
  const nameOf = async (productId: number) => (await deps.products.getAvailability(productId))?.name ?? `Producto ${productId}`;
  const inactive = new Set(rejections.filter((r) => r.reason === 'PRODUCT_INACTIVE').map((r) => r.productId));
  for (const line of session.cart.filter((l) => inactive.has(l.productId))) {
    notices.push(`${await nameOf(line.productId)} ya no está disponible y se retiró de tu carrito.`);
  }
  session.cart = session.cart.filter((l) => !inactive.has(l.productId));
  const stock = new Map<number, number>();
  for (const r of rejections) if (r.reason === 'STOCK_INSUFFICIENT' && !inactive.has(r.productId)) stock.set(r.productId, r.availableStock);
  const pending: NonNullable<ChatContext['pending']> = [];
  for (const line of session.cart) {
    const availableStock = stock.get(line.productId);
    if (availableStock !== undefined) pending.push({ productId: line.productId, name: await nameOf(line.productId), availableStock });
  }
  const context = contextOf(session);
  delete context.summary;
  context.pending = pending;
  return nextResolution(session, deps, notices);
}

async function showRemoveList(session: FsmSession, deps: ChatDeps): Promise<string[]> {
  const labels = await lineLabels(session, deps);
  session.state = 'REMOVE_ITEM';
  return [['¿Qué ítem quieres quitar? Responde con su número.', ...labels.map((l, i) => `${i + 1}) ${l}`)].join('\n')];
}

function excessPrompt(name: string, informedStock: number): string {
  return [
    `El máximo disponible de ${name} es ${informedStock} unidades.`,
    `1) Ajustar a ${informedStock} unidades`,
    '2) Descartar este producto',
  ].join('\n');
}

function setLineQuantity(cart: Cart, productId: number, quantity: number): void {
  const line = cart.find((l) => l.productId === productId);
  if (line) line.quantity = quantity;
  else cart.push({ productId, quantity });
}

type Handler = (session: FsmSession, input: string, deps: ChatDeps) => Promise<string[]>;

const handlers: Partial<Record<ConversationState, Handler>> = {
  async MAIN_MENU(session, input, deps) {
    if (input === '1') return showCatalog(session, deps);
    if (input === '2') {
      session.state = 'ORDER_LOOKUP';
      return [msgs.orderLookup];
    }
    return menuReply();
  },

  async CATALOG(session, input, deps) {
    const ids = contextOf(session).catalogIds;
    const n = parseCount(input);
    if (n === null || n > ids.length + 1) return showCatalog(session, deps, msgs.invalid);
    if (n === ids.length + 1) return showCart(session, deps);
    // DP-01: se revalida estado y stock al elegir (el producto se identifica con la última lista mostrada, D-04).
    const product = await deps.products.getAvailability(ids[n - 1]);
    if (product === null || !product.isActive) return showCatalog(session, deps, msgs.notAvailable);
    if (product.currentStock <= 0) return showCatalog(session, deps, msgs.soldOut);
    contextOf(session).chosen = { productId: product.id, name: product.name };
    session.state = 'ASK_QUANTITY';
    return [`Elegiste ${product.name}. ¿Qué cantidad deseas?`];
  },

  async ASK_QUANTITY(session, input, deps) {
    const chosen = contextOf(session).chosen;
    if (!chosen) return showCatalog(session, deps);
    const requested = parseCount(input);
    if (requested === null) return [msgs.askQuantityRetry];
    const product = await deps.products.getAvailability(chosen.productId);
    if (product === null || !product.isActive) return showCatalog(session, deps, msgs.notAvailable);
    if (product.currentStock <= 0) return showCatalog(session, deps, msgs.soldOut);
    // D-05: se valida la cantidad total resultante de la línea. Sin reserva de stock (RN-02).
    const total = (session.cart.find((l) => l.productId === chosen.productId)?.quantity ?? 0) + requested;
    if (total <= product.currentStock) {
      setLineQuantity(session.cart, chosen.productId, total);
      delete contextOf(session).chosen;
      return showCart(session, deps);
    }
    const context = contextOf(session);
    delete context.chosen;
    context.excess = { productId: chosen.productId, name: chosen.name, informedStock: product.currentStock };
    session.state = 'STOCK_EXCEEDED';
    return [excessPrompt(chosen.name, product.currentStock)];
  },

  async STOCK_EXCEEDED(session, input, deps) {
    const excess = contextOf(session).excess;
    if (!excess) return showCatalog(session, deps);
    if (input === '1') {
      setLineQuantity(session.cart, excess.productId, excess.informedStock);
      delete contextOf(session).excess;
      return showCart(session, deps);
    }
    if (input === '2') return showCatalog(session, deps);
    return [excessPrompt(excess.name, excess.informedStock)];
  },

  async CART(session, input, deps) {
    if (input === '1') return showCatalog(session, deps);
    if (input === '2' && session.cart.length > 0) return showRemoveList(session, deps);
    if (input === '3' && session.cart.length > 0) return showSummary(session, deps);
    return showCart(session, deps);
  },

  async SUMMARY(session, input, deps) {
    const context = contextOf(session);
    if (!context.summary) return showCart(session, deps);
    if (input === '2') {
      delete context.summary;
      return showCart(session, deps);
    }
    if (input !== '1') return renderSummary(session); // D-E: repite el resumen guardado sin consultar precios
    // D-A: nada cambia hasta recibir el resultado; si confirmOrder lanza, el error se propaga y la sesión sigue en SUMMARY.
    const result = await deps.orders.confirmOrder({
      customerId: session.customerId,
      items: context.summary.map((r) => ({ productId: r.productId, quantity: r.quantity, shownUnitPrice: r.unitPrice })),
    });
    if (!result.ok) return applyRejections(session, deps, result.rejections);
    // Cierre (F-7, ESC-48): primer paso, antes de construir el mensaje o cualquier otra operación que pueda fallar.
    session.state = 'MAIN_MENU';
    session.cart = [];
    delete context.summary;
    delete context.pending;
    return (deps.confirmedOrderMessage ?? defaultConfirmedMessage)(result.order);
  },

  async RESOLVE_STOCK(session, input, deps) {
    const context = contextOf(session);
    const item = context.pending?.[0];
    if (!item) return showCart(session, deps);
    const quantity = session.cart.find((l) => l.productId === item.productId)?.quantity ?? 0;
    if (input === '3') {
      session.cart = [];
      delete context.pending;
      session.state = 'MAIN_MENU';
      return menuReply();
    }
    if (input !== '1' && input !== '2') return [resolvePrompt(item, quantity)];
    const notices: string[] = [];
    if (input === '1' && item.availableStock > 0) {
      setLineQuantity(session.cart, item.productId, item.availableStock);
    } else {
      session.cart = session.cart.filter((l) => l.productId !== item.productId); // D-D: ajustar con 0 = retirar
      if (input === '1') notices.push(`${item.name} está agotado (sin stock) y se retiró de tu carrito.`);
    }
    context.pending = (context.pending ?? []).slice(1);
    return nextResolution(session, deps, notices);
  },

  async REMOVE_ITEM(session, input, deps) {
    const n = parseCount(input);
    if (n === null || n > session.cart.length) return showRemoveList(session, deps);
    session.cart.splice(n - 1, 1);
    return showCart(session, deps);
  },

  async ORDER_LOOKUP() {
    return [msgs.orderLookup];
  },
};

/** Procesa un mensaje: `0` vuelve al menú desde cualquier estado conservando el carrito (CH-03). */
export async function handleChatMessage(session: FsmSession, text: string, deps: ChatDeps): Promise<string[]> {
  const input = text.trim();
  if (input === '0') {
    const context = contextOf(session);
    delete context.chosen;
    delete context.excess;
    delete context.summary; // D-07: el resumen deja de ser válido
    delete context.pending;
    session.state = 'MAIN_MENU';
    return menuReply();
  }
  const handler = handlers[session.state];
  if (!handler) return menuReply(); // estados aún sin comportamiento: no cambian nada
  return handler(session, input, deps);
}
