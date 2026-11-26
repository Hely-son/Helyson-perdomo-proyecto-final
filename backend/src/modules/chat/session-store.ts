import { randomUUID } from 'node:crypto';

// TK-05.7 · Almacén en memoria de sesiones de chat (spec 03 §4.1, F-2, F-7, CH-11, DP-06/08/09).
// Genérico en estado y carrito; sin HTTP ni Prisma.

const SWEEP_INTERVAL_MS = 60_000; // D-1: barrido fijo de 1 minuto

export interface ChatSession<TState, TCart> {
  readonly id: string;
  readonly customerId: number;
  state: TState;
  cart: TCart;
  lastProcessedAt: number;
}

export type ProcessResult<R> = { status: 'processed'; result: R } | { status: 'invalid' };

export class ChatSessionStore<TState, TCart> {
  private readonly ttlMs: number;
  private readonly sessions = new Map<string, ChatSession<TState, TCart>>();
  // Cola por sesión: última promesa encolada (nunca rechaza).
  private readonly queues = new Map<string, Promise<unknown>>();
  private sweepTimer: NodeJS.Timeout | undefined;

  constructor(options: { ttlMinutes: number }) {
    this.ttlMs = options.ttlMinutes * 60_000;
  }

  get size(): number {
    return this.sessions.size;
  }

  create(input: { customerId: number; state: TState; cart: TCart }): ChatSession<TState, TCart> {
    const session: ChatSession<TState, TCart> = {
      id: randomUUID(),
      customerId: input.customerId,
      state: input.state,
      cart: input.cart,
      lastProcessedAt: Date.now(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  // No renueva el plazo (DP-06). Descarta la sesión si expiró.
  get(id: string): ChatSession<TState, TCart> | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (this.isExpired(session)) {
      this.sessions.delete(id);
      return undefined;
    }
    return session;
  }

  process<R>(
    id: string,
    handler: (session: ChatSession<TState, TCart>) => Promise<R> | R,
  ): Promise<ProcessResult<R>> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const run = async (): Promise<ProcessResult<R>> => {
      // La expiración se comprueba cuando le llega el turno (D-3a).
      const session = this.get(id);
      if (!session) return { status: 'invalid' };
      const result = await handler(session);
      session.lastProcessedAt = Date.now(); // D-6: al terminar con éxito
      return { status: 'processed', result };
    };
    const current = previous.then(run);
    const tail = current.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(id, tail);
    void tail.then(() => {
      if (this.queues.get(id) === tail) this.queues.delete(id);
    });
    return current;
  }

  startSweep(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  stopSweep(): void {
    if (!this.sweepTimer) return;
    clearInterval(this.sweepTimer);
    this.sweepTimer = undefined;
  }

  private sweep(): void {
    for (const [id, session] of this.sessions) {
      if (this.isExpired(session)) this.sessions.delete(id);
    }
  }

  private isExpired(session: ChatSession<TState, TCart>): boolean {
    return Date.now() - session.lastProcessedAt > this.ttlMs; // D-3c: estrictamente mayor
  }
}
