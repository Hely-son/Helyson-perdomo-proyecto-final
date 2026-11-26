import { z } from 'zod';

// StartChatSessionRequest: phone 1..30 (additionalProperties false).
export const startSessionBody = z.strictObject({ phone: z.string().min(1).max(30) });

// SendChatMessageRequest: text ≤ 500 (puede ser vacío; es entrada inválida del bot).
export const sendMessageBody = z.strictObject({ text: z.string().max(500) });

export const sessionIdParams = z.object({ sessionId: z.string().uuid() });
