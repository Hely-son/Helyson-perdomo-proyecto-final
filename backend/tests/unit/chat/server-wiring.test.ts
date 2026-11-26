import type { CreateAppOptions } from '../../../src/app';
import { ChatSessionStore } from '../../../src/modules/chat/session-store';

// TK-05.1 · Seguimiento D-2 de TK-05.7 (aprobado en la puerta 1): server.ts crea el almacén con
// CHAT_SESSION_TTL_MINUTES, lo entrega a createApp (opción `chatSessionStore`) e inicia su barrido.
// Se importa server.ts con configuración, Prisma y createApp simulados (sin red ni base de datos).
// Matriz: docs/qa/TK-05.1-matrix.md

const TTL_MINUTES = 7;
const MIN = 60_000;

const createAppMock = jest.fn();
jest.mock('../../../src/app', () => ({ createApp: (...args: unknown[]) => createAppMock(...args) }));
jest.mock('../../../src/lib/prisma', () => ({ createPrismaClient: jest.fn(() => ({})) }));
jest.mock('../../../src/config/env', () => ({
  loadConfig: jest.fn(() => ({
    port: 0,
    databaseUrl: 'postgresql://ficticio:ficticio@127.0.0.1:9/ficticio',
    jwtSecret: 'secreto-ficticio-solo-pruebas-0123456789',
    jwtExpiresIn: '8h',
    chatSessionTtlMinutes: 7,
  })),
}));

let startSweep: jest.SpyInstance;
let nowSpy: jest.SpyInstance;
let offsetMs = 0;
let store: NonNullable<CreateAppOptions['chatSessionStore']> | undefined;

beforeAll(async () => {
  const base = Date.now();
  nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => base + offsetMs); // reloj congelado
  startSweep = jest.spyOn(ChatSessionStore.prototype, 'startSweep');
  createAppMock.mockReturnValue({ listen: jest.fn(() => ({ on: jest.fn() })) });
  jest.requireActual('../../../src/server'); // ejecuta server.ts con las dependencias simuladas
  const options = createAppMock.mock.calls[0]?.[0] as CreateAppOptions | undefined;
  store = options?.chatSessionStore;
});

afterAll(() => {
  store?.stopSweep();
  startSweep.mockRestore();
  nowSpy.mockRestore();
});

describe('TK-05.1 · server.ts conecta el almacén de sesiones (D-2 de TK-05.7)', () => {
  test('createApp recibe un ChatSessionStore en la opción chatSessionStore', () => {
    expect(createAppMock).toHaveBeenCalledTimes(1);
    expect(store).toBeInstanceOf(ChatSessionStore);
  });

  test('el barrido periódico se inicia una vez, sobre ese mismo almacén', () => {
    expect(startSweep).toHaveBeenCalledTimes(1);
    expect(startSweep.mock.contexts[0]).toBe(store);
  });

  test('el TTL del almacén es config.chatSessionTtlMinutes (7): 7 min de inactividad siguen vigentes y 7 min + 1 ms expiran', () => {
    offsetMs = 0;
    const session = store!.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });
    offsetMs = TTL_MINUTES * MIN;
    expect(store!.get(session.id)).toBeDefined();
    offsetMs = TTL_MINUTES * MIN + 1;
    expect(store!.get(session.id)).toBeUndefined();
  });
});
