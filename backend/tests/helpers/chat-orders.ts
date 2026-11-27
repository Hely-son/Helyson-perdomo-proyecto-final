// Utilidad de pruebas (TK-05.6): servicio de pedidos simulado para el FSM del chat.
// Supuesto de interfaz (spec 03 F-7; interfaz de TK-05.3 en src/modules/orders/orders.service.ts): el FSM consume del servicio
// de pedidos SOLO `confirmOrder({ customerId, items: [{ productId, quantity, shownUnitPrice }] })` y recibe
//   { ok: true, order: { id, orderNumber, status: 'PENDING', totalAmount, items: [{ productId, quantity, unitPrice }] } }
//   | { ok: false, rejections: [...] }
// o una excepción. Todos los importes son `string` con dos decimales (nunca `number`).
// El simulado registra una copia de cada llamada y responde con un guion: cada llamada consume el siguiente elemento de `script`
// (un resultado, un Error que se lanza, o una función); sin guion, crea el pedido con los precios mostrados.

export interface ConfirmItemInput {
  productId: number;
  quantity: number;
  shownUnitPrice: string;
}
export interface ConfirmOrderInput {
  customerId: number;
  items: ConfirmItemInput[];
}
export type FakeRejection =
  | { productId: number; reason: 'PRODUCT_INACTIVE' }
  | { productId: number; reason: 'STOCK_INSUFFICIENT'; availableStock: number }
  | { productId: number; reason: 'PRICE_CHANGED'; currentUnitPrice: string };
export interface FakeConfirmedOrder {
  id: number;
  orderNumber: string;
  status: 'PENDING';
  totalAmount: string;
  items: { productId: number; quantity: number; unitPrice: string }[];
}
export type FakeConfirmResult = { ok: true; order: FakeConfirmedOrder } | { ok: false; rejections: FakeRejection[] };

export type Scripted = FakeConfirmResult | Error | ((input: ConfirmOrderInput) => FakeConfirmResult | Promise<FakeConfirmResult>);

export interface FakeOrdersService {
  confirmOrder(input: ConfirmOrderInput): Promise<FakeConfirmResult>;
}

export interface FakeOrders {
  /** Lo que el FSM recibe como `deps.orders`. */
  service: FakeOrdersService;
  /** Copias de las entradas recibidas, en orden. */
  calls: ConfirmOrderInput[];
  /** Guion de respuestas: se consume en orden (shift) una por llamada. */
  script: Scripted[];
  /** Gancho que se ejecuta DENTRO de confirmOrder, antes de responder: sirve para observar la sesión mientras el servicio "trabaja". */
  onCall?: (input: ConfirmOrderInput) => void;
}

/** Total exacto en centavos (BigInt): unitPrice × quantity, sin punto flotante. */
export function exactTotalCents(items: { quantity: number; unitPrice: string }[]): string {
  let cents = 0n;
  for (const item of items) {
    const [whole, frac] = item.unitPrice.split('.');
    cents += (BigInt(whole) * 100n + BigInt(frac)) * BigInt(item.quantity);
  }
  const text = cents.toString().padStart(3, '0');
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

export function createFakeOrders(): FakeOrders {
  const calls: ConfirmOrderInput[] = [];
  const script: Scripted[] = [];
  let created = 0;
  const fake: FakeOrders = {
    calls,
    script,
    service: {
      async confirmOrder(input) {
        calls.push(structuredClone(input));
        fake.onCall?.(input);
        const next = script.shift();
        if (next instanceof Error) throw next;
        if (typeof next === 'function') return next(input);
        if (next) return next;
        created += 1;
        const items = input.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.shownUnitPrice }));
        return {
          ok: true,
          order: {
            id: created,
            orderNumber: `MED-${String(41 + created).padStart(5, '0')}`,
            status: 'PENDING',
            totalAmount: exactTotalCents(items),
            items,
          },
        };
      },
    },
  };
  return fake;
}

export const rejected = (...rejections: FakeRejection[]): FakeConfirmResult => ({ ok: false, rejections });
