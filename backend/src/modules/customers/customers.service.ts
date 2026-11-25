import { normalizePhone, type PhoneRejection } from './phone-normalization';

// Puerta única a RN-12 (spec 05 §3, D-01): el seed y el chat usan normalizePhone a través de este servicio.
export { normalizePhone } from './phone-normalization';
export type { PhoneNormalization, PhoneRejection } from './phone-normalization';

/** Datos del cliente (modelo Customer). */
export interface CustomerRecord {
  id: number;
  businessName: string;
  taxId: string;
  phone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Lo único que el servicio necesita del cliente de base de datos; el PrismaClient lo cumple. */
export interface CustomerDb {
  customer: {
    findUnique(args: { where: { phone: string } }): Promise<CustomerRecord | null>;
  };
}

/** Resultado de CL-03 (spec 05 §7.1, D-04). Solo `active` trae los datos del cliente. */
export type CustomerIdentification =
  | { status: 'invalid'; reason: PhoneRejection }
  | { status: 'not_found' }
  | { status: 'inactive' }
  | { status: 'active'; customer: CustomerRecord };

/**
 * Identifica a un cliente por teléfono (CL-03). Solo lectura; no gestiona la conexión.
 * Con un teléfono inválido no consulta la base. Un error de la base se propaga.
 */
export async function identifyCustomerByPhone(db: CustomerDb, phone: string): Promise<CustomerIdentification> {
  const normalized = normalizePhone(phone);
  if (!normalized.ok) return { status: 'invalid', reason: normalized.reason };

  const customer = await db.customer.findUnique({ where: { phone: normalized.phone } });
  if (customer === null) return { status: 'not_found' };
  if (!customer.isActive) return { status: 'inactive' };
  return { status: 'active', customer };
}
