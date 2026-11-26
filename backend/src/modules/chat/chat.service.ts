import { AppError } from '../../lib/app-error';
import { identifyCustomerByPhone, type CustomerDb } from '../customers/customers.service';
import { handleChatMessage, MENU_TEXT, type Cart, type ConversationState } from './chat-fsm';
import type { ChatSessionStore } from './session-store';

export type ChatStore = ChatSessionStore<ConversationState, Cart>;

export interface ChatReply {
  sessionId: string | null;
  active: boolean;
  messages: { text: string }[];
}

export interface ChatService {
  startSession(phone: string): Promise<{ status: 200 | 201; body: ChatReply }>;
  sendMessage(sessionId: string, text: string): Promise<ChatReply>;
}

const toMessages = (texts: string[]) => texts.map((text) => ({ text }));

// CH-02: mismo mensaje para no registrado, inactivo, inválido y no normalizable (F-1).
const NOT_ENABLED = 'No encontramos tu número. Contacta a la distribuidora para habilitarlo.';

export function createChatService(deps: { db: CustomerDb; store: ChatStore }): ChatService {
  return {
    async startSession(phone) {
      const result = await identifyCustomerByPhone(deps.db, phone);
      if (result.status !== 'active') {
        return { status: 200, body: { sessionId: null, active: false, messages: toMessages([NOT_ENABLED]) } };
      }
      const session = deps.store.create({ customerId: result.customer.id, state: 'MAIN_MENU', cart: [] });
      return {
        status: 201,
        body: {
          sessionId: session.id,
          active: true,
          messages: toMessages([`Hola, ${result.customer.businessName}. Elige una opción.`, MENU_TEXT]),
        },
      };
    },
    async sendMessage(sessionId, text) {
      const outcome = await deps.store.process(sessionId, (session) => handleChatMessage(session, text));
      if (outcome.status === 'invalid') {
        throw new AppError(404, 'SESSION_INVALID', 'La conversación no es válida o expiró. Inicia una nueva conversación.');
      }
      return { sessionId, active: true, messages: toMessages(outcome.result) };
    },
  };
}
