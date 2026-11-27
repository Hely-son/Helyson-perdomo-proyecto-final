// globalSetup de Playwright (TK-01.2, D2): una sola vez por ejecución, en el proceso principal y antes de los
// workers. Prepara el operador E2E en medsupply_test con el script del backend (que valida por su cuenta el destino).
// Sin shell; la URL, el email, el nombre y la contraseña viajan solo por el entorno del proceso hijo. No imprime valores.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { resolveTestDatabaseUrl } from '../playwright.config';
import {
  E2E_CHAT_CUSTOMER_NAME,
  E2E_CHAT_CUSTOMER_PHONE,
  E2E_CHAT_CUSTOMER_TAX_ID,
  E2E_INACTIVE_CHAT_CUSTOMER_NAME,
  E2E_INACTIVE_CHAT_CUSTOMER_PHONE,
  E2E_INACTIVE_CHAT_CUSTOMER_TAX_ID,
  E2E_OPERATOR_EMAIL,
  E2E_OPERATOR_NAME,
  e2eOperatorPassword,
} from './support/e2e-env';

export const BACKEND_DIR = path.resolve(import.meta.dirname, '..', '..', 'backend');
export const TSX_BIN = path.join(BACKEND_DIR, 'node_modules', '.bin', 'tsx');
export const UPSERT_SCRIPT = path.join(BACKEND_DIR, 'tests', 'e2e-support', 'upsert-e2e-operator.ts');

export const UPSERT_CHAT_CUSTOMER_SCRIPT = path.join(BACKEND_DIR, 'tests', 'e2e-support', 'upsert-e2e-chat-customer.ts');

export default function globalSetup(): void {
  const result = spawnSync(TSX_BIN, [UPSERT_SCRIPT], {
    cwd: BACKEND_DIR,
    shell: false,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: resolveTestDatabaseUrl(),
      E2E_OPERATOR_EMAIL,
      E2E_OPERATOR_NAME,
      E2E_OPERATOR_PASSWORD: e2eOperatorPassword(),
    },
  });
  if (result.status !== 0) {
    throw new Error(`global-setup: no se pudo preparar el operador E2E (código ${String(result.status)})`);
  }

  // TK-05.4 (D2): cliente ficticio activo del simulador de chat; mismo patrón y mismas garantías que el operador.
  const customer = spawnSync(TSX_BIN, [UPSERT_CHAT_CUSTOMER_SCRIPT], {
    cwd: BACKEND_DIR,
    shell: false,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: resolveTestDatabaseUrl(),
      E2E_CHAT_CUSTOMER_NAME,
      E2E_CHAT_CUSTOMER_TAX_ID,
      E2E_CHAT_CUSTOMER_PHONE,
    },
  });
  if (customer.status !== 0) {
    throw new Error(`global-setup: no se pudo preparar el cliente E2E del chat (código ${String(customer.status)})`);
  }

  // TK-05.5 (D2): cliente ficticio INACTIVO del chat (CA-06, ESC-03); mismo script, con E2E_CHAT_CUSTOMER_ACTIVE=false.
  const inactive = spawnSync(TSX_BIN, [UPSERT_CHAT_CUSTOMER_SCRIPT], {
    cwd: BACKEND_DIR,
    shell: false,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: resolveTestDatabaseUrl(),
      E2E_CHAT_CUSTOMER_NAME: E2E_INACTIVE_CHAT_CUSTOMER_NAME,
      E2E_CHAT_CUSTOMER_TAX_ID: E2E_INACTIVE_CHAT_CUSTOMER_TAX_ID,
      E2E_CHAT_CUSTOMER_PHONE: E2E_INACTIVE_CHAT_CUSTOMER_PHONE,
      E2E_CHAT_CUSTOMER_ACTIVE: 'false',
    },
  });
  if (inactive.status !== 0) {
    throw new Error(`global-setup: no se pudo preparar el cliente E2E inactivo del chat (código ${String(inactive.status)})`);
  }
}
