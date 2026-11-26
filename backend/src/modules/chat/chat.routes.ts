import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { createChatController } from './chat.controller';
import { sendMessageBody, sessionIdParams, startSessionBody } from './chat.schemas';
import type { ChatService } from './chat.service';

// Públicas (sin requireAuth): el sessionId es la credencial de la conversación. Se montan bajo /api/v1/chat.
export function createChatRouter(service: ChatService): Router {
  const c = createChatController(service);
  const router = Router();
  router.post('/sessions', validate({ body: startSessionBody }), c.start);
  router.post('/sessions/:sessionId/messages', validate({ params: sessionIdParams, body: sendMessageBody }), c.send);
  return router;
}
