// Datos ficticios del seed (spec 01 "Seed"; spec 05 §7.3; TK-00.4, plan N3). Sin datos reales.

export interface CustomerFixture {
  businessName: string;
  taxId: string;
  /** Tal como se escribe: el seed lo normaliza con normalizePhone (RN-12). */
  phone: string;
  isActive: boolean;
}

export interface ProductFixture {
  key: string;
  name: string;
  description?: string | null;
  price: string;
  currentStock: number;
  minStockAlert: number;
  isActive: boolean;
}

export interface OrderItemFixture {
  productKey: string;
  quantity: number;
  unitPrice: string;
}

export interface OrderFixture {
  customerTaxId: string;
  status: 'PENDING' | 'PROCESSING' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  items: OrderItemFixture[];
}

export interface SeedFixtures {
  customers: CustomerFixture[];
  products: ProductFixture[];
  orders: OrderFixture[];
}

export const DEFAULT_SEED_FIXTURES: SeedFixtures = {
  customers: [
    { businessName: 'Clínica Demo Norte', taxId: '76.111.111-1', phone: '9 1111 1111', isActive: true },
    { businessName: 'Farmacia Demo Centro', taxId: '76.222.222-2', phone: '922222222', isActive: true },
    { businessName: 'Hospital Demo Sur', taxId: '76.333.333-3', phone: '+56 9 3333 3333', isActive: true },
    { businessName: 'Centro Médico Demo Inactivo', taxId: '76.444.444-4', phone: '+56944444444', isActive: false },
  ],
  products: [
    { key: 'guantes', name: 'Guantes de nitrilo (caja 100)', description: 'Talla M', price: '8500.00', currentStock: 120, minStockAlert: 20, isActive: true },
    { key: 'mascarillas', name: 'Mascarillas quirúrgicas (caja 50)', description: null, price: '4200.00', currentStock: 300, minStockAlert: 50, isActive: true },
    { key: 'jeringas', name: 'Jeringas 5 ml (caja 100)', description: null, price: '6900.00', currentStock: 80, minStockAlert: 15, isActive: true },
    { key: 'gasas', name: 'Gasas estériles (paquete 10)', description: null, price: '1500.00', currentStock: 200, minStockAlert: 40, isActive: true },
    { key: 'alcohol', name: 'Alcohol gel 500 ml', description: null, price: '2900.00', currentStock: 60, minStockAlert: 10, isActive: true },
    { key: 'termometro', name: 'Termómetro digital', description: null, price: '5500.00', currentStock: 0, minStockAlert: 5, isActive: true },
    { key: 'vendas', name: 'Vendas elásticas', description: null, price: '3100.00', currentStock: 10, minStockAlert: 10, isActive: true },
    { key: 'suero', name: 'Suero fisiológico 1 L', description: null, price: '2200.00', currentStock: 40, minStockAlert: 25, isActive: true },
    { key: 'camilla', name: 'Camilla plegable', description: 'Descontinuada', price: '95000.00', currentStock: 2, minStockAlert: 4, isActive: false },
    { key: 'oximetro', name: 'Oxímetro de pulso', description: 'Descontinuado', price: '18900.00', currentStock: 15, minStockAlert: 3, isActive: false },
  ],
  orders: [
    {
      customerTaxId: '76.111.111-1',
      status: 'PENDING',
      items: [
        { productKey: 'guantes', quantity: 10, unitPrice: '8500.00' },
        { productKey: 'mascarillas', quantity: 5, unitPrice: '4200.00' },
      ],
    },
    { customerTaxId: '76.222.222-2', status: 'PROCESSING', items: [{ productKey: 'jeringas', quantity: 4, unitPrice: '6900.00' }] },
    {
      customerTaxId: '76.333.333-3',
      status: 'DISPATCHED',
      items: [
        { productKey: 'gasas', quantity: 20, unitPrice: '1500.00' },
        { productKey: 'alcohol', quantity: 6, unitPrice: '2900.00' },
      ],
    },
    { customerTaxId: '76.111.111-1', status: 'DELIVERED', items: [{ productKey: 'vendas', quantity: 3, unitPrice: '3100.00' }] },
    { customerTaxId: '76.222.222-2', status: 'CANCELLED', items: [{ productKey: 'suero', quantity: 12, unitPrice: '2200.00' }] },
  ],
};
