import { resolveLoginAccess, resolveProtectedAccess, resolveUnknownRoute } from '../../src/auth/guards';
import type { Session } from '../../src/auth/session';

// TK-01.2 · spec 05 §15.5, §16.2 (DP-07), §16.3 (DP-06), §15.4 (DP-05). Matriz: docs/qa/TK-01.2-matrix.md.
// Decisiones puras: no limpian la sesión (eso lo hace quien las aplica) ni llaman a la API.

const NOW = Date.parse('2026-11-24T12:00:00.000Z');
const valid: Session = { token: 't', expiresAt: new Date(NOW + 60_000).toISOString(), operatorName: 'Op' };
const expired: Session = { ...valid, expiresAt: new Date(NOW - 60_000).toISOString() };

const PROTECTED = ['/dashboard', '/dashboard/products', '/dashboard/orders'] as const;
const UNKNOWN = ['/dashboard/inexistente', '/dashboard/claims', '/dashboard/customers', '/dashboard/purchase-orders', '/'];

describe('QA-01.2-04 (ESC-36, ESC-46 U; §15.5): resolveProtectedAccess', () => {
  it('ESC-36: sin sesión → /login, motivo none (sin aviso de expiración)', () => {
    expect(resolveProtectedAccess(null, NOW)).toEqual({ kind: 'redirect', to: '/login', reason: 'none' });
  });

  it('ESC-46: con expiresAt vencido → /login, motivo expired', () => {
    expect(resolveProtectedAccess(expired, NOW)).toEqual({ kind: 'redirect', to: '/login', reason: 'expired' });
  });

  it('ESC-46: expiresAt igual a ahora cuenta como vencido', () => {
    const edge = { ...valid, expiresAt: new Date(NOW).toISOString() };
    expect(resolveProtectedAccess(edge, NOW)).toEqual({ kind: 'redirect', to: '/login', reason: 'expired' });
  });

  it('con sesión válida → se permite', () => {
    expect(resolveProtectedAccess(valid, NOW)).toEqual({ kind: 'allow' });
  });
});

describe('QA-01.2-05 (ESC-48 a/b/c U; DP-06): resolveLoginAccess', () => {
  it('ESC-48 (a) sesión válida → redirige a /dashboard', () => {
    expect(resolveLoginAccess(valid, NOW)).toEqual({ kind: 'redirect', to: '/dashboard' });
  });

  it('ESC-48 (b) sin token → formulario, sin nada que limpiar', () => {
    expect(resolveLoginAccess(null, NOW)).toEqual({ kind: 'form', clearExpired: false });
  });

  it('ESC-48 (c) token vencido → formulario y limpiar la sesión vencida', () => {
    expect(resolveLoginAccess(expired, NOW)).toEqual({ kind: 'form', clearExpired: true });
  });
});

describe('QA-01.2-06 (ESC-49 a/b U; DP-07): resolveUnknownRoute', () => {
  it.each(UNKNOWN)('ESC-49 (a) %s con sesión válida → /dashboard', () => {
    expect(resolveUnknownRoute(valid, NOW)).toBe('/dashboard');
  });

  it.each(UNKNOWN)('ESC-49 (b) %s sin sesión → /login', () => {
    expect(resolveUnknownRoute(null, NOW)).toBe('/login');
  });

  it('con sesión vencida no hay sesión válida → /login', () => {
    expect(resolveUnknownRoute(expired, NOW)).toBe('/login');
  });
});

describe('QA-01.2-07 (§16.2): sin bucles de redirección', () => {
  type Outcome = { rendered: string } | { loop: string[] };

  /** Sigue las redirecciones como lo haría el router, aplicando la limpieza que piden las decisiones. */
  function navigate(start: string, initial: Session | null): Outcome {
    let session = initial;
    let path = start;
    const visited: string[] = [];
    for (let step = 0; step < 5; step += 1) {
      visited.push(path);
      if (path === '/login') {
        const decision = resolveLoginAccess(session, NOW);
        if (decision.kind === 'form') return { rendered: '/login' };
        path = decision.to;
      } else if ((PROTECTED as readonly string[]).includes(path)) {
        const decision = resolveProtectedAccess(session, NOW);
        if (decision.kind === 'allow') return { rendered: path };
        if (decision.reason === 'expired') session = null;
        path = decision.to;
      } else {
        path = resolveUnknownRoute(session, NOW);
      }
    }
    return { loop: visited };
  }

  const starts = ['/login', ...PROTECTED, ...UNKNOWN];

  it.each(starts)('%s sin sesión termina en /login', (start) => {
    expect(navigate(start, null)).toEqual({ rendered: '/login' });
  });

  it.each(starts)('%s con sesión vencida termina en /login', (start) => {
    expect(navigate(start, expired)).toEqual({ rendered: '/login' });
  });

  it.each(starts)('%s con sesión válida termina en una pantalla del dashboard', (start) => {
    const expected = (PROTECTED as readonly string[]).includes(start) ? start : '/dashboard';
    expect(navigate(start, valid)).toEqual({ rendered: expected });
  });
});
