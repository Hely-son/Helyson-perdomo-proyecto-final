// TK-05.1 · Motor FSM del chat (spec 03 §4.2, F-3). Sin acceso a datos ni HTTP.
// Solo MAIN_MENU, CATALOG y ORDER_LOOKUP tienen comportamiento aquí; el resto llega en TK-05.2/05.6/06.3.

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

/** Líneas del carrito; su forma se define en TK-05.2. */
export type Cart = unknown[];

export interface FsmSession {
  state: ConversationState;
  cart: Cart;
}

export const MENU_TEXT = '1) Catálogo y compra\n2) Mis pedidos';

const msgs = {
  menuPrompt: 'Elige una opción.',
  catalog: 'Catálogo (próximamente). Responde 0 para volver al menú.',
  orderLookup: 'Mis pedidos (próximamente). Responde 0 para volver al menú.',
} as const;

interface Transition {
  next: ConversationState;
  reply: () => string[];
}

type StateDef = {
  /** Respuesta que repite la pregunta del estado (entrada inválida, CH-03). */
  prompt: () => string[];
  /** Transiciones por entrada exacta (ya recortada). */
  on: Readonly<Record<string, Transition>>;
};

const menuReply = (): string[] => [msgs.menuPrompt, MENU_TEXT];

const toMenu: Transition = { next: 'MAIN_MENU', reply: menuReply };

const TABLE: Partial<Record<ConversationState, StateDef>> = {
  MAIN_MENU: {
    prompt: menuReply,
    on: {
      '1': { next: 'CATALOG', reply: () => [msgs.catalog] },
      '2': { next: 'ORDER_LOOKUP', reply: () => [msgs.orderLookup] },
    },
  },
  CATALOG: { prompt: () => [msgs.catalog], on: {} },
  ORDER_LOOKUP: { prompt: () => [msgs.orderLookup], on: {} },
};

/** Procesa un mensaje: `0` vuelve al menú desde cualquier estado conservando el carrito (CH-03). */
export function handleChatMessage(session: FsmSession, text: string): string[] {
  const input = text.trim();
  if (input === '0') {
    session.state = toMenu.next;
    return toMenu.reply();
  }
  const def = TABLE[session.state];
  if (!def) return menuReply(); // estados aún sin comportamiento: no cambian nada
  const transition = def.on[input];
  if (!transition) return def.prompt();
  session.state = transition.next;
  return transition.reply();
}
