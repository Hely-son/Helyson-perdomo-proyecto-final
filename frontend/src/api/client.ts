// Acceso HTTP centralizado del frontend (TK-00.2). Único módulo que llama a fetch.
// La URL base sale de VITE_API_BASE_URL; en desarrollo es relativa y el proxy de Vite la reenvía.
import { isSessionLost } from '../auth/errors';
import { isSessionValid } from '../auth/session';
import { sessionStore } from '../auth/session-store';

const DEFAULT_BASE_URL = '/api/v1';

// `import.meta.env` no existe fuera de Vite (Jest/Node): se lee de forma defensiva.
const viteEnv = import.meta.env as { VITE_API_BASE_URL?: string } | undefined;
export const API_BASE_URL: string = viteEnv?.VITE_API_BASE_URL || DEFAULT_BASE_URL;

/**
 * Error devuelto por el API con el formato `Error` de docs/openapi.yaml.
 * La UI decide los mensajes por `code`, nunca por `message`.
 * `code` es null si la respuesta no trae ese formato (p. ej. fallo de red o respuesta no JSON).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** La sesión local venció antes de enviar una petición protegida (spec 05 §15.4, DP-05). */
export class SessionExpiredError extends Error {
  constructor() {
    super('La sesión expiró.');
    this.name = 'SessionExpiredError';
  }
}

/** Se intentó una petición protegida sin sesión guardada (spec 05 §15.5). */
export class NoSessionError extends Error {
  constructor() {
    super('No hay una sesión iniciada.');
    this.name = 'NoSessionError';
  }
}

export type SessionLostReason = 'expired' | 'unauthorized' | 'none';
type SessionLostHandler = (reason: SessionLostReason) => void;

let sessionLostHandler: SessionLostHandler | null = null;
// Una pérdida de sesión es un único evento: la primera causa (expired, unauthorized o none) se notifica una vez y
// las siguientes se ignoran hasta que se establezca una sesión nueva. Las peticiones posteriores siguen rechazándose.
let lossNotified = false;

function notifySessionLost(reason: SessionLostReason): void {
  if (lossNotified) return;
  lossNotified = true;
  sessionLostHandler?.(reason);
}

/**
 * Registra una pérdida de sesión detectada fuera del cliente (los loaders del router, que ya redirigen a /login):
 * integra esa causa en la misma coordinación, sin invocar el manejador, para que las peticiones posteriores no
 * notifiquen ni naveguen de nuevo.
 */
export function markSessionLossHandled(): void {
  if (sessionStore.getSession() !== null) return; // con una sesión activa no hay pérdida que coordinar
  lossNotified = true;
}

sessionStore.subscribe(() => {
  if (sessionStore.getSession() !== null) lossNotified = false;
});

/**
 * Único punto de integración con la navegación: quien lo registre decide cómo llevar al operador a /login
 * (este módulo no importa el router).
 */
export function setSessionLostHandler(handler: SessionLostHandler | null): void {
  sessionLostHandler = handler;
  lossNotified = false;
}

export interface ApiRequestOptions {
  /** true en las operaciones protegidas (Bearer): comprueba la sesión y adjunta el token. */
  auth?: boolean;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function buildUrl(path: string): string {
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function readErrorBody(body: unknown): { code: string; message: string } | null {
  if (typeof body !== 'object' || body === null || !('error' in body)) return null;
  const error = (body as { error: unknown }).error;
  if (typeof error !== 'object' || error === null) return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code !== 'string') return null;
  return { code, message: typeof message === 'string' ? message : '' };
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Llama al API y devuelve el cuerpo JSON tal como lo envía el backend. */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, signal, auth = false } = options;
  let sentToken: string | null = null;
  if (auth) {
    const session = sessionStore.getSession();
    if (session === null) {
      notifySessionLost('none');
      throw new NoSessionError();
    }
    if (!isSessionValid(session, Date.now())) {
      sessionStore.clearSession('expired');
      notifySessionLost('expired');
      throw new SessionExpiredError();
    }
    sentToken = session.token;
  }
  const init: RequestInit = {
    method,
    headers: {
      Accept: 'application/json',
      ...headers,
      ...(sentToken === null ? {} : { Authorization: `Bearer ${sentToken}` }),
    },
    signal,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { ...init.headers, 'Content-Type': 'application/json' };
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path), init);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, null, 'No se pudo conectar con el servidor.');
  }

  const data = await parseJson(response);
  if (!response.ok) {
    const error = readErrorBody(data);
    const apiError = new ApiError(response.status, error?.code ?? null, error?.message ?? response.statusText);
    // Una sola notificación aunque varias respuestas lleguen a la vez: solo si la sesión enviada sigue activa.
    if (isSessionLost(apiError, { auth }) && sessionStore.getSession()?.token === sentToken) {
      sessionStore.clearSession('unauthorized');
      notifySessionLost('unauthorized');
    }
    throw apiError;
  }
  return data as T;
}
