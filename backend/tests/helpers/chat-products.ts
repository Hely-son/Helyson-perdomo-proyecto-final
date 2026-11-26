// Utilidad de pruebas (TK-05.2): servicio de productos simulado para el FSM del chat.
// Supuesto de interfaz (declarado en docs/qa/TK-05.2-matrix.md): el FSM consume del servicio de productos
// solo dos capacidades de lectura, sin reserva de stock (RN-02):
//   listCatalog(): Promise<{ items: { id, name, price: string, currentStock }[] }>   -> productos ACTIVOS (spec 02 F-7, RN-10)
//   getAvailability(id): Promise<{ id, name, isActive, currentStock } | null>          -> estado y stock actuales; null si no existe
// El simulado no ofrece ninguna operación que modifique productos: si el FSM intentara reservar o descontar, fallaría.

export interface FakeProduct {
  id: number;
  name: string;
  price: string;
  currentStock: number;
  isActive: boolean;
}

export interface FakeProductsService {
  listCatalog(): Promise<{ items: { id: number; name: string; price: string; currentStock: number }[] }>;
  getAvailability(id: number): Promise<{ id: number; name: string; price: string; isActive: boolean; currentStock: number } | null>;
}

export interface FakeProducts {
  /** Lo que el FSM recibe como `deps.products`. */
  service: FakeProductsService;
  /** Productos del simulado; el test los muta para simular cambios del operador. El catálogo respeta este orden. */
  products: FakeProduct[];
  /** Registro de las llamadas, en orden: `listCatalog` y `getAvailability:<id>`. */
  calls: string[];
  find(id: number): FakeProduct;
}

export function createFakeProducts(initial: FakeProduct[]): FakeProducts {
  const products = initial.map((p) => ({ ...p }));
  const calls: string[] = [];
  const find = (id: number): FakeProduct => {
    const p = products.find((x) => x.id === id);
    if (!p) throw new Error(`el simulado no tiene el producto ${id}`);
    return p;
  };
  const service: FakeProductsService = {
    async listCatalog() {
      calls.push('listCatalog');
      return {
        items: products
          .filter((p) => p.isActive)
          .map(({ id, name, price, currentStock }) => ({ id, name, price, currentStock })),
      };
    },
    async getAvailability(id) {
      calls.push(`getAvailability:${id}`);
      const p = products.find((x) => x.id === id);
      if (!p) return null;
      return { id: p.id, name: p.name, price: p.price, isActive: p.isActive, currentStock: p.currentStock };
    },
  };
  return { service, products, calls, find };
}

/** Productos de uso común: A (stock 10) y B (stock 0) activos; C inactivo con stock 5; D activo con stock 20 (ESC-17). */
export const PRODUCT_A: FakeProduct = { id: 101, name: 'Guantes de nitrilo QA', price: '1500.00', currentStock: 10, isActive: true };
export const PRODUCT_B: FakeProduct = { id: 102, name: 'Mascarilla N95 QA', price: '800.00', currentStock: 0, isActive: true };
export const PRODUCT_C: FakeProduct = { id: 103, name: 'Jeringa de 5 ml QA', price: '300.00', currentStock: 5, isActive: false };
export const PRODUCT_D: FakeProduct = { id: 104, name: 'Alcohol gel QA', price: '2500.00', currentStock: 20, isActive: true };

/** Expresión regular tolerante al formato del precio: `1500.00` casa con `1500`, `1.500`, `1,500`, `$1.500,00`… */
export function priceRegex(price: string): RegExp {
  const [int, dec] = price.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '[.,\\s]?');
  const decimals = dec && dec !== '00' ? `[.,]${dec}` : '(?:[.,]00)?';
  return new RegExp(`${grouped}${decimals}(?!\\d)`);
}
