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
  // D-3 (TK-05.2): mensajes aceptados y aún no terminados por sesión (en cola o en proceso).
  private readonly pending = new Map<string, number>();
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
    // Sin mensajes pendientes, una sesión expirada se rechaza y se elimina al recibir (no se reactiva).
    // Una sesión ocupada se acepta aunque haya alcanzado el TTL: su plazo se renueva al terminar (DP-06) y la
    // expiración se vuelve a comprobar al llegar el turno de cada mensaje.
    const busy = this.pending.has(id);
    if (busy ? !this.sessions.has(id) : !this.get(id)) return Promise.resolve({ status: 'invalid' });
    // El contador sube de forma síncrona, antes de cualquier espera, para que el barrido respete el mensaje (D-3).
    this.pending.set(id, (this.pending.get(id) ?? 0) + 1);
    const previous = this.queues.get(id) ?? Promise.resolve();
    const run = async (): Promise<ProcessResult<R>> => {
      try {
        // La expiración se comprueba también cuando le llega el turno (D-3a de TK-05.7).
        const session = this.get(id);
        if (!session) return { status: 'invalid' };
        const result = await handler(session);
        session.lastProcessedAt = Date.now(); // D-6: al terminar con éxito
        return { status: 'processed', result };
      } finally {
        this.release(id);
      }
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

  private release(id: string): void {
    const count = (this.pending.get(id) ?? 1) - 1;
    if (count > 0) this.pending.set(id, count);
    else this.pending.delete(id);
  }

  private sweep(): void {
    for (const [id, session] of this.sessions) {
      if (this.pending.has(id)) continue; // con mensajes pendientes o en proceso (D-3)
      if (this.isExpired(session)) this.sessions.delete(id);
    }
  }

  private isExpired(session: ChatSession<TState, TCart>): boolean {
    return Date.now() - session.lastProcessedAt > this.ttlMs; // D-3c: estrictamente mayor
  }
}
