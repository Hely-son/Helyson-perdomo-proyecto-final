// Acceso HTTP centralizado del frontend (TK-00.2). Único módulo que llama a fetch.
// La URL base sale de VITE_API_BASE_URL; en desarrollo es relativa y el proxy de Vite la reenvía.
const DEFAULT_BASE_URL = '/api/v1';

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL;

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

export interface ApiRequestOptions {
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
  const { method = 'GET', body, headers = {}, signal } = options;
  const init: RequestInit = {
    method,
    headers: { Accept: 'application/json', ...headers },
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
    throw new ApiError(response.status, error?.code ?? null, error?.message ?? response.statusText);
  }
  return data as T;
}
