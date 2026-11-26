import { AppError } from '../../lib/app-error';

// Catálogo de productos (spec 02 F-1..F-4, RN-10). Sin transacciones ni bloqueos (D3):
// cada operación es una sentencia atómica sobre solo los campos que cambia.

export interface ProductRecord {
  id: number;
  name: string;
  description: string | null;
  price: { toFixed(digits: number): string };
  currentStock: number;
  minStockAlert: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: string;
  currentStock: number;
  minStockAlert: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductInput {
  name: string;
  description?: string | null;
  price: string;
  currentStock: number;
  minStockAlert: number;
}

export interface UpdateProductInput {
  name?: string;
  description?: string | null;
  price?: string;
  minStockAlert?: number;
}

/** Elemento del catálogo del chat (spec 02 F-7): solo lo que el cliente ve. */
export interface CatalogItem {
  id: number;
  name: string;
  price: string;
  currentStock: number;
}

/** Estado y stock actuales de un producto (spec 02 §8.2). */
export interface ProductAvailability {
  id: number;
  name: string;
  isActive: boolean;
  currentStock: number;
}

export interface AdjustStockInput {
  newStock: number;
  expectedStock: number;
}

/** Forma de la referencia de campo de Prisma (FieldRef) que el servicio necesita. */
export type IntFieldRef = { readonly modelName: 'Product'; readonly name: string; readonly typeName: 'Int'; readonly isList: boolean };

/** Lo único que el servicio necesita de la base; el PrismaClient lo cumple. */
export interface ProductDb {
  product: {
    findMany(args: {
      where?: { isActive: boolean; currentStock?: { lte: IntFieldRef } };
      orderBy: { name: 'asc' } | Array<{ name: 'asc' } | { id: 'asc' }>;
    }): Promise<ProductRecord[]>;
    /** Referencias de campo de Prisma: permiten comparar columnas en el filtro. */
    fields: { minStockAlert: IntFieldRef };
    findUnique(args: { where: { id: number } }): Promise<ProductRecord | null>;
    create(args: { data: CreateProductInput }): Promise<ProductRecord>;
    update(args: {
      where: { id: number; currentStock?: number };
      data: UpdateProductInput | { currentStock: number };
    }): Promise<ProductRecord>;
    updateMany(args: { where: { id: number; isActive: boolean }; data: { isActive: boolean } }): Promise<{ count: number }>;
  };
}

export interface ProductService {
  list(): Promise<{ items: Product[] }>;
  listStockAlerts(): Promise<{ items: Product[] }>;
  get(id: number): Promise<Product>;
  create(input: CreateProductInput): Promise<Product>;
  update(id: number, input: UpdateProductInput): Promise<Product>;
  deactivate(id: number): Promise<Product>;
  adjustStock(id: number, input: AdjustStockInput): Promise<Product>;
  /** Productos activos con precio y stock, stock 0 incluido (spec 02 F-7, RN-10). Solo lectura. */
  listCatalog(): Promise<{ items: CatalogItem[] }>;
  /** Estado y stock actuales; null si no existe. Sin caché ni reserva (RN-02, DP-01). */
  getAvailability(id: number): Promise<ProductAvailability | null>;
}

const notFound = () => new AppError(404, 'PRODUCT_NOT_FOUND', 'El producto no existe.');

export function toProduct(p: ProductRecord): Product {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price.toFixed(2),
    currentStock: p.currentStock,
    minStockAlert: p.minStockAlert,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function isRecordNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2025';
}

export function createProductService(deps: { prisma: ProductDb }): ProductService {
  const db = deps.prisma.product;
  return {
    async list() {
      const rows = await db.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }] });
      return { items: rows.map(toProduct) };
    },

    async listStockAlerts() {
      // RN-09: alerta = activo con current_stock <= min_stock_alert (inclusivo). Se filtra en PostgreSQL
      // comparando columnas con una referencia de campo; solo lectura (IN-03).
      const rows = await db.findMany({
        where: { isActive: true, currentStock: { lte: db.fields.minStockAlert } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      return { items: rows.map(toProduct) };
    },

    async listCatalog() {
      const rows = await db.findMany({ where: { isActive: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
      return {
        items: rows.map((r) => ({ id: r.id, name: r.name, price: r.price.toFixed(2), currentStock: r.currentStock })),
      };
    },

    async getAvailability(id) {
      const row = await db.findUnique({ where: { id } });
      if (row === null) return null;
      return { id: row.id, name: row.name, isActive: row.isActive, currentStock: row.currentStock };
    },

    async get(id) {
      const row = await db.findUnique({ where: { id } });
      if (row === null) throw notFound();
      return toProduct(row);
    },

    async create(input) {
      // El producto nace activo (default de la base). description ausente queda null.
      const row = await db.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          price: input.price,
          currentStock: input.currentStock,
          minStockAlert: input.minStockAlert,
        },
      });
      return toProduct(row);
    },

    async update(id, input) {
      // UPDATE parcial: solo los campos recibidos (F-3, D3). Nunca stock ni isActive.
      const data: UpdateProductInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.description !== undefined) data.description = input.description;
      if (input.price !== undefined) data.price = input.price;
      if (input.minStockAlert !== undefined) data.minStockAlert = input.minStockAlert;
      try {
        return toProduct(await db.update({ where: { id }, data }));
      } catch (err) {
        if (isRecordNotFound(err)) throw notFound();
        throw err;
      }
    },

    async deactivate(id) {
      // Transición condicional (RN-10): un producto ya inactivo no se escribe (ESC-07).
      await db.updateMany({ where: { id, isActive: true }, data: { isActive: false } });
      const row = await db.findUnique({ where: { id } });
      if (row === null) throw notFound();
      return toProduct(row);
    },

    async adjustStock(id, input) {
      // Compare-and-set atómico (F-5, RN-01): una sola sentencia condicionada al stock esperado.
      // Solo toca current_stock; permitido sobre productos inactivos.
      try {
        const row = await db.update({
          where: { id, currentStock: input.expectedStock },
          data: { currentStock: input.newStock },
        });
        return toProduct(row);
      } catch (err) {
        if (!isRecordNotFound(err)) throw err;
        if ((await db.findUnique({ where: { id } })) === null) throw notFound();
        throw new AppError(409, 'STOCK_CHANGED', 'El stock cambió desde que lo consultaste. Recarga e inténtalo de nuevo.');
      }
    },
  };
}
