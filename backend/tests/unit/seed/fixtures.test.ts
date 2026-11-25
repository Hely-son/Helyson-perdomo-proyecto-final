import { normalizePhone } from '../../../src/modules/customers/customers.service';
import { DEFAULT_SEED_FIXTURES } from '../../../src/seed/fixtures';

// TK-00.4 · fixtures estáticos del seed (spec 01 "Seed"; spec 05 §7.3 reglas 1–4, DP-04; RN-05, RN-09, RN-10; plan N3).
// Escenarios: docs/qa/TK-00.4-scenarios.md (QA-00.4-09..11).

const { customers, products, orders } = DEFAULT_SEED_FIXTURES;
const RN05_STATUSES = ['PENDING', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED'];
const MONEY = /^\d+(\.\d{1,2})?$/;

/** Céntimos de un importe decimal escrito como texto (sin Float en la comparación). */
function cents(amount: string): number {
  const [int, dec = ''] = amount.split('.');
  return Number(int) * 100 + Number(dec.padEnd(2, '0'));
}

const isAlert = (p: { currentStock: number; minStockAlert: number }) => p.currentStock <= p.minStockAlert;

describe('TK-00.4 · fixtures de clientes', () => {
  test('QA-00.4-09 spec 01 "Seed" 3 activos y 1 inactivo', () => {
    expect(customers).toHaveLength(4);
    expect(customers.filter((c) => c.isActive)).toHaveLength(3);
    expect(customers.filter((c) => !c.isActive)).toHaveLength(1);
    for (const c of customers) expect(c.businessName.trim()).not.toBe('');
  });

  test('QA-00.4-09 §7.3 regla 1 formatos de entrada: con espacios, sin +56 y con +56', () => {
    const raw = customers.map((c) => c.phone);
    expect(raw.some((p) => p.includes(' '))).toBe(true);
    expect(raw.some((p) => /^[0-9]/.test(p))).toBe(true);
    expect(raw.some((p) => p.startsWith('+56'))).toBe(true);
  });

  test('QA-00.4-09 ESC-18 §7.3 reglas 1–2 todos normalizan con normalizePhone a +56 y nueve dígitos', () => {
    for (const c of customers) {
      const result = normalizePhone(c.phone);
      expect({ taxId: c.taxId, result }).toEqual({ taxId: c.taxId, result: { ok: true, phone: expect.stringMatching(/^\+56\d{9}$/) } });
    }
  });

  test('QA-00.4-09 §7.3 regla 3 tax_id y teléfono normalizado únicos entre sí', () => {
    const taxIds = customers.map((c) => c.taxId);
    const phones = customers.map((c) => {
      const r = normalizePhone(c.phone);
      return r.ok ? r.phone : `invalid:${c.taxId}`;
    });
    expect(new Set(taxIds).size).toBe(customers.length);
    expect(new Set(phones).size).toBe(customers.length);
  });

  test('QA-00.4-09 §7.3 regla 4 tax_id ficticio con forma de RUT (sin validar el dígito verificador)', () => {
    for (const c of customers) expect(c.taxId).toMatch(/^(\d{1,2}(\.\d{3}){2}|\d{7,8})-[0-9kK]$/);
  });
});

describe('TK-00.4 · fixtures de productos', () => {
  test('QA-00.4-10 N3 diez productos con claves únicas y valores válidos para el modelo', () => {
    expect(products).toHaveLength(10);
    expect(new Set(products.map((p) => p.key)).size).toBe(10);
    for (const p of products) {
      expect(p.name.trim()).not.toBe('');
      expect(p.price).toMatch(MONEY);
      expect(cents(p.price)).toBeGreaterThan(0);
      expect(Number.isInteger(p.currentStock) && p.currentStock >= 0).toBe(true);
      expect(Number.isInteger(p.minStockAlert) && p.minStockAlert >= 0).toBe(true);
    }
  });

  test('QA-00.4-10 spec 01 "Seed" CH-04 al menos un producto ACTIVO con stock 0 (agotado visible en el catálogo)', () => {
    expect(products.some((p) => p.isActive && p.currentStock === 0)).toBe(true);
  });

  test('QA-00.4-10 RN-09 exactamente 2 activos con stock ≤ mínimo: uno igual y otro por debajo', () => {
    const alerts = products.filter((p) => p.isActive && isAlert(p));
    expect(alerts).toHaveLength(2);
    expect(alerts.filter((p) => p.currentStock === p.minStockAlert)).toHaveLength(1);
    expect(alerts.filter((p) => p.currentStock < p.minStockAlert)).toHaveLength(1);
  });

  test('QA-00.4-10 RN-10 dos inactivos, al menos uno con stock ≤ mínimo', () => {
    const inactive = products.filter((p) => !p.isActive);
    expect(inactive).toHaveLength(2);
    expect(inactive.some(isAlert)).toBe(true);
  });
});

describe('TK-00.4 · fixtures de pedidos', () => {
  test('QA-00.4-11 RN-05 cinco pedidos, uno en cada estado (incluido PROCESSING)', () => {
    expect(orders).toHaveLength(5);
    expect(orders.map((o) => o.status).sort()).toEqual([...RN05_STATUSES].sort());
  });

  test('QA-00.4-11 spec 01 "Seed" referencian clientes del fixture por tax_id, de al menos 2 clientes activos distintos', () => {
    const byTaxId = new Map(customers.map((c) => [c.taxId, c]));
    for (const o of orders) expect(byTaxId.has(o.customerTaxId)).toBe(true);
    const activeCustomers = new Set(orders.map((o) => o.customerTaxId).filter((t) => byTaxId.get(t)?.isActive));
    expect(activeCustomers.size).toBeGreaterThanOrEqual(2);
  });

  test('QA-00.4-11 TK-00.4 ítems: producto del fixture, una línea por producto, quantity > 0, unitPrice > 0, total > 0', () => {
    const keys = new Set(products.map((p) => p.key));
    for (const o of orders) {
      expect(o.items.length).toBeGreaterThanOrEqual(1);
      const itemKeys = o.items.map((i) => i.productKey);
      expect(new Set(itemKeys).size).toBe(itemKeys.length);
      let total = 0;
      for (const i of o.items) {
        expect(keys.has(i.productKey)).toBe(true);
        expect(Number.isInteger(i.quantity) && i.quantity > 0).toBe(true);
        expect(i.unitPrice).toMatch(MONEY);
        expect(cents(i.unitPrice)).toBeGreaterThan(0);
        total += i.quantity * cents(i.unitPrice);
      }
      expect(total).toBeGreaterThan(0);
    }
  });
});
