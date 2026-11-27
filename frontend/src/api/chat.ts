// Operaciones de chat (docs/openapi.yaml, tag Chat). Públicas: sin Bearer.
import { apiRequest } from './client';

export interface ChatReply {
  sessionId: string | null;
  active: boolean;
  messages: { text: string }[];
}

export function startChatSession(phone: string): Promise<ChatReply> {
  return apiRequest<ChatReply>('/chat/sessions', { method: 'POST', body: { phone } });
}

export function sendChatMessage(sessionId: string, text: string): Promise<ChatReply> {
  return apiRequest<ChatReply>(`/chat/sessions/${encodeURIComponent(sessionId)}/messages`, { method: 'POST', body: { text } });
}
