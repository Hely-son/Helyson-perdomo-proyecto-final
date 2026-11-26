// Motor FSM del chat (spec 03 §4.2, F-3, F-4, F-5). Sin acceso a datos ni HTTP: la disponibilidad sale del
// servicio de productos (deps.products). SUMMARY y RESOLVE_STOCK llegan en TK-05.6; ORDER_LOOKUP en TK-06.3.
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

export interface ChatDeps {
  products: ChatProducts;
}

/** Contexto de la conversación (D-4): vive en la propia sesión y se aísla entre sesiones. */
export interface ChatContext {
  /** Ids de la última lista de catálogo mostrada, en orden: el número `N` es `catalogIds[N-1]` (D-04). */
  catalogIds: number[];
  /** Producto elegido, en `ASK_QUANTITY`. */
  chosen?: { productId: number; name: string };
  /** Cantidad máxima informada, en `STOCK_EXCEEDED`. */
  excess?: { productId: number; name: string; informedStock: number };
}

export interface FsmSession {
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

const menuReply = (): string[] => [msgs.menuPrompt, MENU_TEXT];

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

async function showCart(session: FsmSession, deps: ChatDeps): Promise<string[]> {
  session.state = 'CART';
  if (session.cart.length === 0) return [`${msgs.emptyCart}\n1) Agregar un producto`];
  const labels = await lineLabels(session, deps);
  return [['Tu carrito:', ...labels.map((l) => `- ${l}`), '1) Agregar otro producto', '2) Quitar un ítem'].join('\n')];
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
    return showCart(session, deps);
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
    session.state = 'MAIN_MENU';
    return menuReply();
  }
  const handler = handlers[session.state];
  if (!handler) return menuReply(); // estados aún sin comportamiento: no cambian nada
  return handler(session, input, deps);
}
