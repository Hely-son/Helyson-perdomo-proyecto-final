import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { BACKEND_URL, E2E_OPERATOR_EMAIL, e2eOperatorPassword } from './e2e-env';

// TK-06.5 · Preparación de datos compartida por los E2E de CA-07 y CA-12. Matriz: docs/qa/TK-06.5-matrix.md.
// Solo la API real contra medsupply_test: productos propios de nombre único (operador) y pedidos confirmados por el chat.
// No borra ni limpia nada y no depende del seed, de conteos ni de ids o números secuenciales: se capturan al ejecutar.
// El token no se imprime.

const API = `${BACKEND_URL}/api/v1`;

export interface OwnProduct {
  id: number;
  name: string;
  currentStock: number;
}

export interface OrderDetail {
  id: number;
  orderNumber: string;
  status: string;
  totalAmount: string;
  customer: { id: number; businessName: string; taxId: string; phone: string };
  items: { productId: number; productName: string; quantity: number; unitPrice: string; subtotal: string }[];
}

interface OrderPage {
  items: { id: number; orderNumber: string }[];
  pagination: { totalPages: number };
}

export class Operator {
  private constructor(
    private readonly request: APIRequestContext,
    private readonly headers: Record<string, string>,
  ) {}

  static async login(request: APIRequestContext): Promise<Operator> {
    const login = await request.post(`${API}/auth/login`, {
      data: { email: E2E_OPERATOR_EMAIL, password: e2eOperatorPassword() },
    });
    expect(login.status(), 'datos: login del operador E2E').toBe(200);
    const { token } = (await login.json()) as { token: string };
    return new Operator(request, { Authorization: `Bearer ${token}` });
  }

  private async read<T>(path: string): Promise<T> {
    const response = await this.request.get(`${API}${path}`, { headers: this.headers });
    expect(response.status(), `GET ${path}`).toBe(200);
    return (await response.json()) as T;
  }

  async createProduct(tag: string, price: string, stock: number): Promise<OwnProduct> {
    const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const created = await this.request.post(`${API}/products`, {
      headers: this.headers,
      data: { name: `QA TK-06.5 ${tag} ${unique}`, description: null, price, currentStock: stock, minStockAlert: 1 },
    });
    expect(created.status(), 'datos: createProduct').toBe(201);
    return (await created.json()) as OwnProduct;
  }

  /** Stock actual de cada producto, en el orden pedido. */
  async stocks(...products: OwnProduct[]): Promise<number[]> {
    const read = await Promise.all(products.map((p) => this.read<OwnProduct>(`/products/${p.id}`)));
    return read.map((p) => p.currentStock);
  }

  order(id: number): Promise<OrderDetail> {
    return this.read<OrderDetail>(`/orders/${id}`);
  }

  /** Busca el pedido por su número recorriendo el listado del operador (más recientes primero) y devuelve el detalle. */
  async findOrder(orderNumber: string): Promise<OrderDetail> {
    let totalPages = 1;
    for (let page = 1; page <= totalPages; page += 1) {
      const listed = await this.read<OrderPage>(`/orders?page=${page}&pageSize=100`);
      const found = listed.items.find((o) => o.orderNumber === orderNumber);
      if (found) return this.order(found.id);
      totalPages = listed.pagination.totalPages;
    }
    throw new Error(`datos: la API del operador no lista el pedido ${orderNumber}`);
  }

  changeStatus(id: number, status: string): Promise<APIResponse> {
    return this.request.patch(`${API}/orders/${id}/status`, { headers: this.headers, data: { status } });
  }
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Confirma por la API del chat, en una sesión nueva del teléfono dado, un pedido con esas líneas. Devuelve su número. */
export async function createChatOrder(
  request: APIRequestContext,
  phone: string,
  lines: { product: OwnProduct; quantity: number }[],
): Promise<string> {
  const started = await request.post(`${API}/chat/sessions`, { data: { phone } });
  expect(started.status(), 'datos: startChatSession (¿el globalSetup preparó el cliente?)').toBe(201);
  const { sessionId } = (await started.json()) as { sessionId: string | null };
  expect(sessionId, 'datos: el cliente E2E tiene sesión de chat').not.toBeNull();

  const say = async (text: string): Promise<string> => {
    const response = await request.post(`${API}/chat/sessions/${sessionId}/messages`, { data: { text } });
    expect(response.status(), `datos: sendChatMessage("${text}")`).toBe(200);
    return ((await response.json()) as { messages: { text: string }[] }).messages.map((m) => m.text).join('\n');
  };

  for (const { product, quantity } of lines) {
    const catalog = await say('1'); // menú: catálogo · carrito: agregar un producto
    const line = new RegExp(`^(\\d+)\\) ${escapeRegExp(product.name)} - `, 'm').exec(catalog);
    expect(line, `datos: el catálogo del chat lista "${product.name}"`).not.toBeNull();
    await say((line as RegExpExecArray)[1]);
    await say(String(quantity));
  }
  await say('3'); // confirmar compra → resumen
  const confirmed = await say('1'); // confirmar pedido
  const orderNumber = /MED-\d{5,}/.exec(confirmed)?.[0];
  expect(orderNumber, 'datos: número del pedido confirmado').toBeDefined();
  return orderNumber as string;
}
