# Habilitadores técnicos

| Fase | Requisitos | Puntos | Depende de |
|---|---|---|---|
| `MVP` | RNF-01, RNF-02, RNF-05, RNF-06, RNF-08 | 28 | — (TK-00.4 depende además de TK-02.4) |

Estos tickets no entregan valor directo al usuario, pero todas las historias los necesitan. Base: [ARCHITECTURE](../docs/ARCHITECTURE.md).

## Tickets

### TK-00.8 · [API] Contrato OpenAPI del MVP
**Fase:** `MVP` · **Puntos:** 5 · **Depende de:** — · **Spec:** docs/ARCHITECTURE.md

Crear `docs/openapi.yaml` como contrato único de la API (RNF-02), a partir de la tabla de API y de las decisiones transversales de la arquitectura. Es documentación: no implementa endpoints.

**Hecho cuando:**
- El archivo es un documento OpenAPI 3 válido según una validación automática que se puede ejecutar en local con un comando documentado.
- Documenta todos los endpoints `MVP` de la tabla de API de la arquitectura, con parámetros, cuerpos de petición, respuestas y errores. No incluye endpoints `V2`.
- Define el esquema de error `{ error: { code, message } }`, el catálogo de códigos con su status HTTP (incluidos `INVALID_CREDENTIALS`, `STOCK_INSUFFICIENT`, `PRODUCT_INACTIVE`, `PRICE_CHANGED`, `STOCK_CHANGED`, el conflicto de transición de pedido y el de sesión de chat inválida o expirada), la autenticación Bearer de las rutas de operador y el formato de paginación de `GET /orders`.
- `info.version` está definido y el prefijo `/api/v1` coincide con la arquitectura.
- El usuario aprueba el contrato antes de implementar los endpoints (flujo SDD).

### TK-00.1 · [INFRA] Proyecto backend
**Fase:** `MVP` · **Puntos:** 3 · **Depende de:** — · **Spec:** docs/ARCHITECTURE.md

Crear `backend/` con Express + TypeScript, organizado en capas y módulos (RNF-07).

**Hecho cuando:**
- `npm run dev`, `test`, `lint` y `typecheck` funcionan.
- Existe el middleware global de errores con el formato `{ error: { code, message } }`.
- Existe el middleware de validación con Zod.
- La configuración se lee de variables de entorno y se valida al arrancar, incluidas `DATABASE_URL`, la clave JWT, `JWT_EXPIRES_IN` y `CHAT_SESSION_TTL_MINUTES`. Existe `.env.example` sin valores reales (RNF-08).
- `GET /api/v1/health` responde 200.

**Decisiones de implementación** (aprobadas por el usuario el 2026-11-19, puerta 1 de TK-00.1):
- **Stack:** Node.js 26.x LTS (`engines`), TypeScript 6.0.x, Express 5.x, Zod 4.6.7, Jest 30.x + ts-jest 29.4.x + Supertest 7.x, ESLint 10.x + typescript-eslint 8.x, tsx 4.x, CommonJS. Dependencias directas con versión exacta en `package.json` y `package-lock.json`. Sin dotenv: `--env-file-if-exists=../.env`, de modo que si falta el archivo la validación decide.
- **Archivos en la raíz:** `.env.example` y un `.gitignore` mínimo que ignora `.env` y `.env.*`, excepto `.env.example`, además de `node_modules/` y las salidas de build y cobertura.
- **Variables:**
  - `DATABASE_URL`: obligatoria, con esquema `postgres://` o `postgresql://`. Solo se valida el formato, no la conexión.
  - `JWT_SECRET`: obligatoria, de al menos 32 bytes UTF-8.
  - `JWT_EXPIRES_IN`: opcional, `8h` por defecto. Formato `^[1-9]\d*[smhd]$`.
  - `CHAT_SESSION_TTL_MINUTES`: opcional, 30 por defecto. Entero positivo.
  - `PORT`: opcional, 3000 por defecto. Entero de 1 a 65535.
  - Una variable opcional vacía cuenta como ausente; una obligatoria vacía es inválida.
- **Errores de configuración:** un solo error nombra todas las variables inválidas, sin mostrar sus valores. Los valores de `JWT_SECRET` y `DATABASE_URL` nunca aparecen en errores, logs ni respuestas. Con configuración inválida, el proceso termina con error antes de escuchar.
- **`.env.example`:** solo las cinco variables anteriores. `JWT_SECRET` va vacío; `DATABASE_URL` lleva un ejemplo sin credenciales reales. Las variables del operador del seed las agrega TK-00.4 (ESC-51).
- **Errores HTTP**, solo con los códigos del contrato y exactamente `{ error: { code, message } }`:
  - Cuerpo que no es JSON válido, y cualquier otro fallo del parser (incluido un cuerpo demasiado grande): 400 `MALFORMED_REQUEST`.
  - JSON válido, aunque sea primitivo, que no cumple el esquema: 422 `VALIDATION_ERROR`. El middleware valida cuerpo, query y parámetros de ruta.
  - Ruta o método inexistente: 404 `NOT_FOUND`.
  - Error no controlado, síncrono o asíncrono: 500 `INTERNAL_ERROR`, con mensaje genérico, sin stack ni el mensaje original.
- **Diseño para pruebas:**
  - `loadConfig(env)` recibe el entorno como parámetro.
  - `createApp()` construye la aplicación sin escuchar.
  - `validate(schema)` es el middleware de Zod.
  - `createApp` acepta un router opcional que solo usan las pruebas. `server.ts` nunca lo monta.
- **Verificaciones posteriores, no cumplidas en este ticket:** las pruebas contra PostgreSQL (TK-00.3, TK-00.5) y la ejecución en CI (TK-00.7).

### TK-00.2 · [INFRA] Proyecto frontend
**Fase:** `MVP` · **Puntos:** 2 · **Depende de:** — · **Spec:** docs/ARCHITECTURE.md

Crear `frontend/` con Vite + React 18 + TypeScript + Ant Design + React Router.

**Hecho cuando:**
- Existen las rutas `MVP` de la arquitectura (`/chat`, `/login`, `/dashboard`, `/dashboard/products`, `/dashboard/orders`) con layout base. No hay rutas ni menús de funciones `V2`.
- Existe un cliente API centralizado con la URL base configurable por variable de entorno.
- `npm run dev`, `build` y `lint` funcionan.

### TK-00.6 · [INFRA] Docker Compose
**Fase:** `MVP` · **Puntos:** 3 · **Depende de:** TK-00.1, TK-00.2 · **Spec:** docs/ARCHITECTURE.md

Crear `docker-compose.yml` (desarrollo: solo PostgreSQL 16) y `docker-compose.delivery.yml` (entrega: PostgreSQL 16, backend y frontend), según la tabla de entornos de la arquitectura (RNF-01, RNF-05).

**Hecho cuando:**
- En desarrollo, Compose levanta solo PostgreSQL con las bases `medsupply` y `medsupply_test`, y backend y frontend corren en el host.
- Un único comando documentado levanta base, backend y frontend desde un clon limpio, aplica las migraciones y carga el seed (entrega).
- PostgreSQL tiene healthcheck y el backend no arranca hasta que la base está lista.
- Las credenciales salen del archivo de variables, no del `docker-compose.yml`.

### TK-00.3 · [DB] Esquema Prisma y migración inicial
**Fase:** `MVP` · **Puntos:** 5 (reestimado de 3 en la puerta 1) · **Depende de:** TK-00.1, TK-00.6 · **Spec:** specs/01_data_models.spec.md

Implementar las entidades `MVP`, enums, índices, restricciones, la secuencia y `next_order_number()` de la spec 01. No se crean `Claim` ni `PurchaseOrder` (PRD §7).

**Hecho cuando:**
- La migración se aplica sin errores en PostgreSQL 16.
- Los `CHECK` rechazan stock negativo, precio ≤ 0, cantidades ≤ 0 y teléfonos sin normalizar.
- Borrar un producto con pedidos falla (`Restrict`).
- Insertar pedidos asigna `MED-00001`, `MED-00002`… y un valor de secuencia superior a 99 999 produce un número de 6 dígitos sin recortarse (RN-04).

**Decisiones de la puerta 1 (aprobadas por el usuario, 2026-11-20):**
1. `prisma`, `@prisma/client` y `@prisma/adapter-pg` en 7.10.1 exacta, y `pg` en una versión exacta compatible. Sin versiones RC ni rangos abiertos. Nunca `npx prisma` en Compose, Dockerfile ni scripts.
2. Un único rol de aplicación, dueño de las bases, para migrar y ejecutar: limitación aceptada del MVP, a documentar en ARCHITECTURE. Prohibidos `$queryRawUnsafe` y `$executeRawUnsafe`.
3. `migrate` de entrega usa un target propio del Dockerfile derivado de la etapa de build. El CLI de Prisma no entra en la imagen final del backend.
4. Arnés mínimo de pruebas en `backend/tests/db/`, con los scripts `test:db` y `db:migrate:test`. La URL de pruebas se deriva de `DATABASE_URL` y se comprueba el nombre real de la base (`medsupply_test`) antes de cualquier operación destructiva. La recreación automática de la base sigue siendo de TK-00.5.
5. Excepción limitada a TK-00.3 en el criterio 2 de la DoD ("también en CI"): pruebas locales contra PostgreSQL 16 con evidencia; la CI es de TK-00.7 (ver Seguimientos del tracker).
6. Los seguimientos de logging y SEC-03 de TK-00.1 pasan a TK-01.1. TK-00.3 conserva QA-00.6-D10 (logs de `migrate`).
7. Se prueban los siete `CHECK` de la spec 01, ESC-02 solo en su parte de base de datos (`INSERT` directos) y ESC-17.
8. `updated_at` se declara `@default(now()) @updatedAt`.
9. Reestimado a 5 puntos, como una sola unidad.
10. Los 18 avisos moderados de `npm audit` (SEC-02 de TK-00.1) se aceptan condicionalmente también en la imagen de `migrate`, documentando dependencias, severidad, exposición y justificación. Avisos altos o críticos se consultan antes de aceptarlos.
11. Responsables: `database-engineer` (principal); `infrastructure-engineer` (Dockerfile, Compose, `.dockerignore` y documentación de infraestructura, después y en serie); `qa-bdd-analyst`; revisión de `security-engineer` obligatoria.
12. Primera tarea del desarrollo: comprobación acotada de Prisma 7.10.1 con Node 26 y TypeScript 6 (instalación, adaptador `pg`, migraciones, deriva con el SQL manual y transaccionalidad ante fallo). Si falla, `Bloqueado` y consulta; no se cambia de versión automáticamente.

**Decisiones posteriores a la comprobación de viabilidad (aprobadas por el usuario, 2026-11-20):**
13. `overrides` con `effect` en 3.22.5 exacta (resuelve los 3 avisos `high` de GHSA-7589-6fvf-x4pw que arrastra `@prisma/config` 7.10.1), manteniendo Prisma 7.10.1. Sin `npm audit fix --force` ni otras actualizaciones indirectas. Versiones exactas adicionales: `pg` 8.23.1 y `@types/pg` 8.23.1.
14. Las migraciones SQL editadas a mano se envuelven en `BEGIN;`/`COMMIT;` (Prisma no revierte una migración fallida). La recuperación se documenta, sin automatizarla.
15. El arnés de pruebas usa un helper mínimo con `deriveTestDatabaseUrl`, `connectTestDatabase` y `resetDatabase`. Los tests de integración pueden usar `pg` directamente con consultas parametrizadas para validar el SQLSTATE.
16. La preparación del entorno (dependencias, `.env` local y PostgreSQL de desarrollo) precede a la escritura y ejecución de las pruebas en rojo. QA no implementa el esquema ni resuelve anticipadamente los fallos.
17. Sin `GRANT` ni `REVOKE` innecesarios: se mantienen los permisos predeterminados de PostgreSQL.
18. Se incorporan el escenario QA-00.3-37 (un `ROLLBACK` consume un número de la secuencia) y `PRISMA_HIDE_UPDATE_MESSAGE=1` en el servicio `migrate`. La nota sobre el `detail` de los errores de PostgreSQL va al seguimiento de logging de TK-01.1.

**Limitación aceptada en la fase de QA (aprobada por el usuario, 2026-11-20):**
19. La imagen `medsupply-migrate:delivery` pesa ~1,25 GB porque hereda de la etapa `build` (con dependencias de desarrollo). Se acepta para el MVP: un target mínimo exigiría una instalación selectiva más compleja. No se optimiza por este motivo.

**SEC-02 en TK-00.3: detalle de los 18 avisos moderados aceptados (decisión 10; datos de `npm audit` real, fase de QA, 2026-11-20):**
- `npm audit`: 18 moderados, 0 high, 0 critical. `npm audit --omit=dev`: 0. Sin avisos nuevos respecto a SEC-02 de TK-00.1.
- Avisos de origen: `glob` 13.0.7 y 10.5.0 (GHSA-3g3m-2fjr-6pw4, rango 9.0.0–14.0.1) y `minimatch` 10.2.6 y 9.0.9 (GHSA-g3hv-75wg-m249, rango 7.0.0–11.0.0). Los otros 16 paquetes figuran solo por la cadena de dependencias: `test-exclude` 7.0.2, `babel-plugin-istanbul` 8.0.0, `@jest/transform`, `babel-jest`, `@jest/reporters`, `@jest/core`, `jest` (directa), `jest-cli`, `jest-config`, `jest-runner`, `jest-runtime`, `jest-circus`, `jest-snapshot`, `jest-resolve-dependencies`, `@jest/expect` y `@jest/globals`, todos 30.5.2.
- Vía: `jest`/`ts-jest` → `@jest/*` → `glob`/`test-exclude` → `minimatch`. Todos son solo de desarrollo.
- Exposición: viajan en `medsupply-migrate:delivery` (hereda la etapa `build`; contenedor de un solo uso, sin puertos, que solo ejecuta `prisma migrate deploy` y nunca Jest), y no en `medsupply-backend:delivery`.
- Justificación: código de pruebas que no se ejecuta en entrega; `npm audit` solo propone bajar a `jest` 29.7.0, que no se aplica. Avisos high o critical no quedan cubiertos por esta aceptación.

**Condición obligatoria del paso de infraestructura y de la puerta 2 (aprobada por el usuario, 2026-11-20):**
- **SEC-00.3-01 · La imagen final del backend incorpora el CLI de Prisma por dependencias `devOptional`** (`npm ci --omit=dev` instala 221 paquetes, `prisma` incluido; con `--omit=dev --omit=optional`, 88). Condición:
  - la instalación de la imagen final añade `--omit=optional` a los parámetros existentes;
  - `node_modules/prisma` no existe en la imagen final;
  - el backend funciona sin el CLI de Prisma;
  - el target de `migrate` sí tiene el CLI y el motor de migraciones;
  - se mantiene la separación entre ambas imágenes (decisión 3).

### TK-00.5 · [TEST] Infraestructura de pruebas
**Fase:** `MVP` · **Puntos:** 5 · **Depende de:** TK-00.3 · **Spec:** docs/ARCHITECTURE.md

Configurar Jest + Supertest en el backend contra PostgreSQL real, Jest para las pruebas unitarias de la lógica del frontend y Playwright para E2E (RNF-01, RNF-04).

**Hecho cuando:**
- Los tests usan la base `medsupply_test`: se recrea con las migraciones al iniciar la suite y se vacía entre tests.
- El pool de conexiones de los tests admite más de una conexión, y existe una utilidad para lanzar peticiones en paralelo reales (base de RNF-04).
- Existe un test de ejemplo de integración y otro E2E que pasan.
- El frontend tiene un script `test` que ejecuta sus pruebas unitarias con Jest. La configuración permite probar la lógica del frontend (por ejemplo, las decisiones de sesión, de redirección y de resaltado) como funciones, sin renderizar componentes ni añadir una biblioteca de pruebas de componentes. Deja preparada la infraestructura para los escenarios de nivel U de la spec 05, y existe un test unitario de ejemplo del frontend que pasa. La ejecución de este script en CI corresponde a TK-00.7.
- Un solo comando levanta backend y frontend para correr los E2E.

### TK-00.4 · [DB] Seed
**Fase:** `MVP` · **Puntos:** 2 · **Depende de:** TK-00.3, TK-02.4 · **Spec:** specs/01_data_models.spec.md

Cargar los datos de la sección Seed de la spec 01. Usa la normalización de RN-12 de TK-02.4 para los teléfonos de los clientes. La idempotencia se evalúa **por separado en cada tabla**: clientes por `tax_id` (spec 05 §7.3); productos y pedidos solo cuando su tabla está vacía. Por integridad referencial, los pedidos solo se cargan si los productos del fixture se insertaron en la misma ejecución. Los registros existentes nunca se sobrescriben.

**Hecho cuando:**
- `npx prisma db seed` es idempotente: correrlo dos veces no duplica datos.
- Cada tabla se evalúa por separado: que una tenga registros no impide cargar los fixtures de otra que esté vacía, con una única excepción por integridad referencial: los pedidos dependen de los productos insertados en la misma ejecución (ver Pedidos). El orden de carga respeta las relaciones: clientes, productos y, por último, pedidos con sus ítems.
- Productos: los fixtures se insertan **solo si la tabla de productos está vacía**, en una única transacción (se cargan todos o ninguno). Si ya hay productos, no se inserta ningún fixture ni se modifica ningún registro existente.
- Pedidos: los fixtures se insertan **solo si la tabla de pedidos está vacía** y **todos los productos del fixture se insertaron correctamente en esa misma ejecución del seed**, en una única transacción junto con sus ítems (todos o ninguno).
  - Si ya hay pedidos, no se inserta ni se modifica ningún pedido ni ítem.
  - Si la tabla de productos ya tenía registros antes de la ejecución y la de pedidos está vacía, se omite la carga de pedidos y el seed informa claramente que no se cargaron porque los productos del fixture no se insertaron en esa ejecución.
  - Los ítems usan los identificadores enteros que la base asignó a los productos en esa misma ejecución. Los productos existentes nunca se buscan por nombre ni por combinación de atributos, y no se usan UUID ni `id` explícitos.
  - Cada pedido referencia un cliente del seed, identificado por `tax_id`. Si falla la resolución de alguna referencia o la inserción de algún pedido o ítem, se revierte la transacción completa de pedidos e ítems, se informa el error y no queda ningún pedido parcial.
  - Los fixtures cumplen el modelo de la spec 01: una línea por producto en cada pedido; `quantity > 0`; `unit_price > 0`; `total_amount` igual a la suma de `quantity × unit_price` y mayor que 0; `order_number` asignado por la base desde la secuencia; pedidos en cada estado de RN-05, de al menos dos clientes y con al menos uno en `PROCESSING`.
  - Los pedidos del seed **no descuentan stock**: el stock inicial de cada producto se fija directamente en los fixtures de productos (spec 01 "Seed").
- La carga transaccional por conjunto se aplica a productos y pedidos. Los clientes mantienen el comportamiento de la spec 05 §7.3, que se detalla a continuación.
- Las credenciales del operador salen de variables de entorno (RNF-08). La contraseña real nunca se escribe en el repositorio; se guarda solo su hash bcrypt, con el costo predeterminado declarado en la constante del módulo `auth` (spec 05 §15.3, DP-08). `.env.example` solo tiene un marcador de posición y la recomendación de usar una contraseña robusta. Ni la contraseña ni el hash aparecen en logs.
- Los teléfonos escritos en distintos formatos quedan guardados normalizados y se encuentran con la consulta de CL-03.
- Clientes del seed según la spec 05 §7.3 (DP-04):
  - fixtures ficticios, estáticos y definidos en el repositorio, con teléfonos nacionales válidos de nueve dígitos y con `tax_id` y teléfono normalizado únicos entre sí; misma normalización que el chat (TK-02.4);
  - mismo `tax_id` y mismo teléfono normalizado: se reconoce el registro existente, sin duplicarlo ni modificarlo;
  - mismo `tax_id` con otro teléfono: se informa el conflicto y no se sobrescribe el registro;
  - teléfono ya usado por otro `tax_id`: la restricción `UNIQUE` impide el duplicado y el seed informa el error;
  - ante un conflicto, el seed informa el registro afectado y se detiene; las inserciones anteriores pueden permanecer y se reconocen en la siguiente ejecución.
- No incluye motor genérico de importación, transacción global especial, recuperación automática de conflictos, deduplicación por nombre, fusión de clientes, validación de RUT ni administración de clientes por endpoints.

### TK-00.7 · [INFRA] Pipeline de CI
**Fase:** `MVP` · **Puntos:** 3 · **Depende de:** TK-00.5, TK-00.8 · **Spec:** docs/ARCHITECTURE.md

Crear el workflow de GitHub Actions de la arquitectura (RNF-06).

**Hecho cuando:**
- Se ejecuta en cada push y pull request.
- Usa un servicio `postgres:16`, aplica las migraciones y corre lint, typecheck, los tests de unidad e integración (incluidos los de concurrencia de RNF-04) y los E2E.
- Valida que `docs/openapi.yaml` es un documento OpenAPI válido (RNF-02).
- El pipeline falla si falla cualquiera de esos pasos.
