import type { RequestHandler } from 'express';
import type { ChatService } from './chat.service';

export function createChatController(service: ChatService): { start: RequestHandler; send: RequestHandler } {
  return {
    start: async (req, res) => {
      const { status, body } = await service.startSession((req.body as { phone: string }).phone);
      res.status(status).json(body);
    },
    send: async (req, res) => {
      const { sessionId } = req.params as unknown as { sessionId: string };
      res.status(200).json(await service.sendMessage(sessionId, (req.body as { text: string }).text));
    },
  };
}
