import { Prisma } from '../../src/generated/prisma/client';

// Espía de TK-05.3 sobre un Prisma real: envuelve el cliente y el cliente de transacción con proxies que registran
// cada llamada, permiten pausar el servicio en puntos concretos (ESC-11) e inyectar fallos (ESC-12) sin ganchos de
// prueba en el código de producción. Todo se ejecuta contra la base real: el espía no sustituye ninguna consulta.
// Escenarios: docs/qa/TK-05.3-matrix.md.

type Fn = (...args: unknown[]) => unknown;

export type Phase = 'before-tx' | 'in-tx' | 'after-tx';

export interface SpyCall {
  /** `prisma`: llamada sobre el cliente raíz; `tx`: sobre el cliente de la transacción. */
  where: 'prisma' | 'tx';
  /** Número de intento de `$transaction` en el que ocurrió (0 si aún no se abrió ninguna). */
  attempt: number;
  phase: Phase;
  /** Ruta de la llamada, p. ej. `product.updateMany` o `$queryRaw`. */
  path: string;
  args: unknown[];
  result?: unknown;
  error?: unknown;
}

export interface SpyHooks {
  /** Se espera antes de ejecutar el primer descuento de stock de cada intento (la fila aún no está bloqueada). */
  beforeDeduction?(attempt: number): Promise<void>;
  /** Se espera tras ejecutar el primer descuento de cada intento (la fila ya está bloqueada por la transacción). */
  afterDeduction?(attempt: number): Promise<void>;
  /** Si devuelve un error, se lanza tras ejecutar la llamada real de la transacción (trabajo parcial real). */
  afterCall?(call: SpyCall, info: { isDeduction: boolean; firstDeductionOfAttempt: boolean }): unknown;
}

export interface PrismaSpy<T> {
  prisma: T;
  calls: SpyCall[];
  /** `tx-start:N`, `tx-resolved:N`, `tx-rejected:N`, en orden. */
  events: string[];
  /** Segundo argumento recibido por cada `$transaction`. */
  transactionOptions: unknown[];
  /** Cantidad de veces que se llamó a `$transaction` (intentos). */
  attempts(): number;
  /** Llamadas de la transacción (`where === 'tx'`) en orden. */
  txCalls(): SpyCall[];
}

/** Texto SQL y valores de una llamada raw (plantilla etiquetada, Prisma.Sql o cadena). */
export function rawSql(args: unknown[]): { sql: string; values: unknown[] } {
  const first = args[0];
  if (typeof first === 'string') return { sql: first, values: args.slice(1) };
  if (Array.isArray(first)) return { sql: (first as string[]).join('?'), values: args.slice(1) };
  if (typeof first === 'object' && first !== null) {
    const sqlObject = first as { strings?: readonly string[]; sql?: string; values?: unknown[] };
    if (Array.isArray(sqlObject.strings)) return { sql: sqlObject.strings.join('?'), values: sqlObject.values ?? [] };
    if (typeof sqlObject.sql === 'string') return { sql: sqlObject.sql, values: sqlObject.values ?? [] };
  }
  return { sql: '', values: [] };
}

const RAW_PATHS = new Set(['$queryRaw', '$executeRaw', '$queryRawUnsafe', '$executeRawUnsafe']);

/** Descuento de stock: `product.updateMany`/`product.update` con `currentStock` en los datos, o un UPDATE raw de products. */
export function isDeductionCall(call: Pick<SpyCall, 'path' | 'args'>): boolean {
  if (call.path === 'product.updateMany' || call.path === 'product.update') {
    const data = (call.args[0] as { data?: Record<string, unknown> } | undefined)?.data;
    return data !== undefined && 'currentStock' in data;
  }
  if (RAW_PATHS.has(call.path)) return /\bUPDATE\s+"?(public"?\."?)?products"?\b/i.test(rawSql(call.args).sql);
  return false;
}

/**
 * Producto afectado por un descuento: `where.id` en la API de modelos; en SQL raw, el primer valor que sea uno de los
 * `candidates` (las pruebas usan cantidades que no coinciden con ningún id).
 */
export function deductionProductId(call: Pick<SpyCall, 'path' | 'args'>, candidates: number[]): number | undefined {
  if (call.path.startsWith('product.')) {
    const id = (call.args[0] as { where?: { id?: unknown } } | undefined)?.where?.id;
    return typeof id === 'number' ? id : undefined;
  }
  return rawSql(call.args).values.find((v): v is number => typeof v === 'number' && candidates.includes(v));
}

/** Lectura de la tabla de productos (modelo `product.find*`/`aggregate` o SELECT raw que menciona products). */
export function isProductRead(call: Pick<SpyCall, 'path' | 'args'>): boolean {
  if (call.path.startsWith('product.find')) return true;
  if (RAW_PATHS.has(call.path)) {
    const { sql } = rawSql(call.args);
    return /\bSELECT\b/i.test(sql) && /\bproducts\b/i.test(sql);
  }
  return false;
}

/** Error P2034 real de Prisma (conflicto de escritura o interbloqueo). */
export function prismaP2034(): Error {
  return new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict or a deadlock.', {
    code: 'P2034',
    clientVersion: Prisma.prismaVersion.client,
  });
}

/** Error conocido de Prisma con otro código (nunca debe reintentarse). */
export function prismaKnownError(code: string): Error {
  return new Prisma.PrismaClientKnownRequestError(`Error simulado ${code}`, { code, clientVersion: Prisma.prismaVersion.client });
}

/** JSON seguro (BigInt y Decimal) para buscar valores dentro de los resultados registrados. */
export function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)) ?? '';
}

export function spyOnPrisma<T extends object>(db: T, hooks: SpyHooks = {}): PrismaSpy<T> {
  const calls: SpyCall[] = [];
  const events: string[] = [];
  const transactionOptions: unknown[] = [];
  let attempt = 0;
  let phase: Phase = 'before-tx';
  const deductionSeen = new Set<number>();

  async function invoke(where: 'prisma' | 'tx', path: string, fn: Fn, self: unknown, args: unknown[]): Promise<unknown> {
    const call: SpyCall = { where, attempt, phase, path, args };
    calls.push(call);
    const isDeduction = where === 'tx' && isDeductionCall(call);
    const firstDeductionOfAttempt = isDeduction && !deductionSeen.has(attempt);
    if (firstDeductionOfAttempt) {
      deductionSeen.add(attempt);
      await hooks.beforeDeduction?.(attempt);
    }
    try {
      call.result = await Reflect.apply(fn, self, args);
    } catch (error) {
      call.error = error;
      throw error;
    }
    if (firstDeductionOfAttempt) await hooks.afterDeduction?.(attempt);
    if (where === 'tx') {
      const injected = hooks.afterCall?.(call, { isDeduction, firstDeductionOfAttempt });
      if (injected !== undefined) {
        call.error = injected;
        throw injected;
      }
    }
    return call.result;
  }

  // Solo se envuelven las funciones del cliente y los delegados de modelo (un nivel): lo demás pasa tal cual.
  function wrap<U extends object>(target: U, where: 'prisma' | 'tx', modelPath: string): U {
    return new Proxy(target, {
      get(t, prop) {
        const value = Reflect.get(t, prop, t) as unknown;
        if (typeof prop === 'symbol') return value;
        const path = modelPath === '' ? prop : `${modelPath}.${prop}`;
        if (where === 'prisma' && modelPath === '' && prop === '$transaction') return transaction;
        if (typeof value === 'function') {
          return (...args: unknown[]) => invoke(where, path, value as Fn, t, args);
        }
        if (modelPath === '' && !prop.startsWith('$') && typeof value === 'object' && value !== null) {
          return wrap(value, where, prop);
        }
        return value;
      },
    });
  }

  const transaction = async (fn: unknown, options?: unknown): Promise<unknown> => {
    if (typeof fn !== 'function') throw new Error('El espía solo admite transacciones interactivas');
    attempt += 1;
    const current = attempt;
    transactionOptions.push(options);
    events.push(`tx-start:${current}`);
    phase = 'in-tx';
    try {
      const run = (db as unknown as { $transaction(f: (tx: object) => unknown, o?: unknown): Promise<unknown> }).$transaction;
      const result = await Reflect.apply(run, db, [(tx: object) => (fn as (tx: object) => unknown)(wrap(tx, 'tx', '')), options]);
      events.push(`tx-resolved:${current}`);
      phase = 'after-tx';
      return result;
    } catch (error) {
      events.push(`tx-rejected:${current}`);
      phase = 'before-tx';
      throw error;
    }
  };

  return {
    prisma: wrap(db, 'prisma', ''),
    calls,
    events,
    transactionOptions,
    attempts: () => attempt,
    txCalls: () => calls.filter((c) => c.where === 'tx'),
  };
}
