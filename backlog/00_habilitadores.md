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
**Fase:** `MVP` · **Puntos:** 8 (reestimado de 5 en la puerta 1) · **Depende de:** TK-00.3 · **Spec:** docs/ARCHITECTURE.md

Configurar Jest + Supertest en el backend contra PostgreSQL real, Jest para las pruebas unitarias de la lógica del frontend y Playwright para E2E (RNF-01, RNF-04).

**Hecho cuando:**
- Los tests usan la base `medsupply_test`: se recrea con las migraciones al iniciar la suite y se vacía entre tests.
- El pool de conexiones de los tests admite más de una conexión, y existe una utilidad para lanzar peticiones en paralelo reales (base de RNF-04).
- Existe un test de ejemplo de integración y otro E2E que pasan.
- El frontend tiene un script `test` que ejecuta sus pruebas unitarias con Jest. La configuración permite probar la lógica del frontend (por ejemplo, las decisiones de sesión, de redirección y de resaltado) como funciones, sin renderizar componentes ni añadir una biblioteca de pruebas de componentes. Deja preparada la infraestructura para los escenarios de nivel U de la spec 05, y existe un test unitario de ejemplo del frontend que pasa. La ejecución de este script en CI corresponde a TK-00.7.
- Un solo comando levanta backend y frontend para correr los E2E.

**Decisiones de la puerta 1 (aprobadas por el usuario, 2026-11-20).** No modifican los criterios anteriores. Fuera del ticket: cliente de base de datos de la aplicación (TK-01.1), pruebas reales de concurrencia de negocio (RNF-04, TK-05.3 y TK-05.5), seed (TK-00.4), CI (TK-00.7), bibliotecas de pruebas de componentes y todo lo `V2`.
1. **D-1 · Excepción de CI.** Limitada a TK-00.5 (ver Seguimientos del tracker). Evidencia local contra PostgreSQL 16 de las suites, lint y typecheck de backend y frontend. TK-00.5 no implementa ni configura CI; el requisito de CI no se declara cumplido.
2. **D-2 · Recreación y limpieza (resuelve I-4 de TK-00.3).** Recreación inicial: conexión a la base de mantenimiento `postgres`, comprobación del entorno, `DROP` y `CREATE` de `medsupply_test` y `prisma migrate deploy` con el binario local. Limpieza entre tests: `Client` dedicado que comprueba `current_database()` y ejecuta `TRUNCATE` y el reinicio de secuencias en una misma transacción. `medsupply_test` es una constante literal; la limpieza no acepta un `Pool`; sin `WITH (FORCE)`; si hay conexiones abiertas, error controlado; nunca se toca `medsupply`. I-4 se cierra solo con implementación y verificación.
3. **D-3 · Pool y concurrencia.** El pool es del arnés de pruebas (`pg.Pool` con `max` mayor que 1), con una prueba de al menos dos conexiones simultáneas. La utilidad HTTP lanza peticiones concurrentes contra un servidor real. No demuestra concurrencia de consultas de negocio.
4. **D-4 · Scripts.** `npm test` del backend sigue sin PostgreSQL. `npm run test:db` es la suite de integración, con recreación inicial y limpieza entre tests. Son suites complementarias.
5. **D-5 · Ubicación de Playwright.** En `frontend/`, con `frontend/e2e/` y el script `test:e2e`. Sin un tercer proyecto npm.
6. **D-6 · Base E2E.** Los E2E reutilizan `medsupply_test` y se ejecutan en serie con `test:db`, nunca en paralelo. Sin bases ni infraestructura PostgreSQL adicionales.
7. **D-7 · Puertos E2E.** Backend en 3100; Vite en 5174 con `strictPort`; `reuseExistingServer: false`. El proxy de Vite toma su destino de una variable de entorno sin prefijo `VITE_`, con el comportamiento de desarrollo como valor por defecto. Reutiliza el PostgreSQL de desarrollo (5432) y no interfiere con la entrega (8080).
8. **D-8 · Playwright.** `@playwright/test` 1.64.1 exacta, mediante su CLI y la API de Playwright Test; E2E en TypeScript; solo Chromium. Sin Playwright MCP ni agentes o herramientas MCP adicionales. La instalación del navegador y sus requisitos se documentan para el evaluador.
9. **D-9 · Dependencias y seguridad.** En el frontend, `jest` 30.5.2, `ts-jest` 29.4.15 y `@types/jest` 30.0.0 exactas, iguales al backend. Los 18 avisos moderados conocidos de SEC-02 se aceptan condicionalmente; los nuevos de Playwright se evalúan uno a uno; ante un aviso high o critical se consulta. Sin `npm audit fix` ni actualizaciones automáticas.
10. **D-10 · Seguimientos de TK-00.2.** Los ejemplos exigidos cubren ESC-45 y ESC-49a (unitarias) y ESC-40 (E2E de navegación y menú), sin criterios adicionales. ESC-40 y ESC-49 siguen parcialmente abiertos por la sesión (TK-01.2). QA-00.2-14 sigue en TK-01.2.
11. **D-11 · Comprobación de viabilidad previa a la implementación**, con autorización propia: Node 26 en macOS arm64; Playwright 1.64.1 con Chromium; Jest y `ts-jest` ejecutando una prueba real sobre una función pura del frontend ESM (`verbatimModuleSyntax`, `moduleResolution: bundler`, `import.meta.env` e imports de UI sin renderizado); recreación de `medsupply_test` con el rol de aplicación; `prisma migrate deploy` sobre la base nueva. Si algo falla: detenerse, informar con evidencia y pedir decisión, sin cambiar versiones, introducir transformaciones ni refactorizar.
12. **D-12 · Estimación y responsables.** 8 puntos. En serie: `qa-bdd-analyst` (escenarios), `database-engineer` (recreación, limpieza, pool y `globalSetup` de `test:db`), `backend-engineer` (utilidad HTTP concurrente y test de integración), `frontend-engineer` (Jest, test unitario y variable del proxy), `infrastructure-engineer` (Playwright, `webServer`, puertos, comando único y documentación), `qa-bdd-analyst` (verificación independiente y regresión) y `security-engineer` (revisión obligatoria). Los especialistas escriben las pruebas de su componente; QA no es el único autor de lo que verifica.

**Autorizaciones separadas:** la puerta 1 no autoriza D-11 ni la implementación. D-11, la implementación (incluida la documentación del entregable en `docs/ARCHITECTURE.md` y `README.md`) y las operaciones posteriores (commit, push, limpieza y cierre) requieren cada una su aprobación expresa. `CLAUDE.md` queda fuera del ticket.

**Decisiones de la fase de análisis (aprobadas por el usuario, 2026-11-20).** Resuelven las ambigüedades del informe de QA sobre los escenarios QA-00.5-01 a 47. No modifican los criterios ni las exclusiones.
- **A1.** `current_database()` se ejecuta antes de `BEGIN` y por la misma conexión. QA-00.3-04 (`backend/tests/db/guard.test.ts`) se conserva sin modificaciones.
- **A2.** La limpieza rechaza un `Pool` en ejecución (obligatorio) y por tipos cuando sea posible sin modificar QA-00.3-04.
- **A3.** La recreación comprueba que la URL sea válida, que el destino sea exactamente `medsupply_test` y que la conexión de mantenimiento esté en `postgres`.
- **A4.** La limpieza usa un `Client` dedicado cuyo ciclo de vida controla el arnés. Sin abstracciones innecesarias.
- **A5.** `current_database()` se comprueba fuera de la transacción.
- **A6.** El comportamiento ante una base inexistente se define durante la implementación, con la evidencia de D-11. No se impone `IF EXISTS` sin justificarlo.
- **A7.** Si `migrate deploy` falla en el `globalSetup`, la suite aborta sin ejecutar tests y conserva el error original y el código de salida.
- **A8.** El test de integración de ejemplo demuestra el arnés y una petición HTTP real, sin lógica de negocio ni el cliente de base de datos de la aplicación.
- **A9.** La concurrencia HTTP se demuestra con un `http.Server` real en un puerto efímero, no solo con `supertest(app)`.
- **A10.** Las pruebas unitarias de ESC-45 y ESC-49a usan `routes.ts` y `menu.ts` sin importar `router.ts`. Sin DOM, jsdom ni refactor de TK-00.2.
- **A11.** ESC-49a se limita a la lógica verificable sin sesión real. No se adelanta TK-01.2.
- **A12.** El E2E de ESC-40 lo implementa `frontend-engineer`; `infrastructure-engineer` prepara el runner y su configuración. No se impone comportamiento de cierre de sesión no especificado.
- **A13.** `test:e2e` no recrea ni migra PostgreSQL: `test:db` prepara `medsupply_test` y las suites se ejecutan en serie. El backend de E2E arranca con build + start, sin watcher.
- **A14.** La ejecución en serie se garantiza con el flujo documentado (`test:db` y después `test:e2e`), sin mecanismos de bloqueo.
- **A15.** El typecheck del frontend incluye `e2e/` y `playwright.config.ts`, con un `tsconfig` específico si hace falta, integrado en `npm run typecheck`.

**Comprobaciones de D-11** (con autorización propia, antes de la implementación):
1. Node 26 en macOS arm64.
2. Playwright 1.64.1: instalación de Chromium y una prueba trivial en TypeScript que pasa.
3. Jest 30.5.2 con `ts-jest` 29.4.15 en el frontend `"type": "module"`: formato del archivo de configuración y una prueba real que importa `routes.ts` y `menu.ts` (sin `router.ts` ni DOM) y pasa, con `verbatimModuleSyntax` y `moduleResolution: bundler`.
4. Tratamiento de `import.meta.env`: si algún módulo de esa cadena lo usa y cómo lo resuelve `ts-jest`.
5. Viabilidad de un `tsconfig` para `e2e/` y `playwright.config.ts` integrado en `npm run typecheck` sin romper el actual.
6. Recreación de `medsupply_test` con el rol de aplicación desde `postgres`, y comportamiento observado cuando la base no existe (fundamenta A6).
7. `prisma migrate deploy` con el binario local sobre la base recién creada.
8. Backend con `npm run build` y `node dist/server.js` en el puerto 3100 contra `medsupply_test`. `npm start` no carga `../.env`, así que se confirma por qué vía llegan `PORT`, `DATABASE_URL` y `JWT_SECRET` sin exponer secretos en la configuración ni en los logs.

Si alguna comprobación no resulta viable, D-11 se detiene e informa con evidencia. No se cambian versiones, no se introducen transformaciones no aprobadas ni se refactoriza por iniciativa propia: decide el usuario.

**Detalles que corresponden a la implementación (C):** forma concreta de la limpieza y del rechazo del `Pool` (A1, A2, A4, A5); comportamiento ante una base inexistente (A6); propagación del error en el `globalSetup` (A7); contenido del test de integración y de la utilidad HTTP (A8, A9); redacción de ESC-49a y del E2E de ESC-40 (A11, A12); texto del flujo en serie (A14); variable del proxy de Vite; documentación en `README.md` y `docs/ARCHITECTURE.md`.

**Escenarios de QA (QA-00.5-01 a 47).** Definidos por `qa-bdd-analyst` en la fase de análisis; se conservan sus identificadores. Responsables (D-12, A12):

| Responsable | Escenarios |
|---|---|
| `database-engineer` | 01–12, 14–18 |
| `backend-engineer` | 19, 20, 22 |
| `frontend-engineer` | 24–26, 28–31 (31: E2E de ESC-40), 36, 37 |
| `infrastructure-engineer` | 32–35, 38–41, 47 |
| Compartidos | 27 (frontend e infraestructura); 42 (frontend e infraestructura, con revisión de `security-engineer`) |
| `qa-bdd-analyst` (verificación) | 13, 21, 23, 43–46, más la verificación independiente de todos |

Sin cambios respecto del informe de QA: 02, 04, 05, 10, 13, 14–18, 20, 21, 23–25, 27, 35–37, 40–43, 45 y 46. Ajustes aprobados:

| ID | Decisión | Ajuste |
|---|---|---|
| 01 | A6 | Variante con `medsupply_test` inexistente; su resultado esperado se define en C y se aprueba entonces |
| 03 | A3 | El arnés comprueba que la conexión de mantenimiento está en `postgres` y aborta antes del `DROP` si no |
| 06 | A3 | Cubre URL válida, destino exacto `medsupply_test` y mantenimiento en `postgres` |
| 07 | A7 | Al fallar `migrate deploy`: sin tests, error original y código de salida distinto de 0 conservados; la contraseña no aparece |
| 08 | A4 | El `Client` de limpieza lo abre y lo cierra el arnés, sin handles abiertos |
| 09 | A1, A5 | `current_database()` fuera de la transacción; luego `BEGIN`, `TRUNCATE`, secuencias y `COMMIT` por la misma conexión; al abortar, una sola sentencia |
| 11 | A2, A1 | Rechazo del `Pool` en ejecución obligatorio; por tipos solo si es compatible con QA-00.3-04 sin modificarlo |
| 12 | A1 | `guard.test.ts` sin modificaciones (`git diff` vacío) |
| 19 | A9 | `http.Server` en un puerto efímero de 127.0.0.1, no solo `supertest(app)` |
| 22 | A8 | Arnés (base, pool, limpieza) más una petición HTTP real a `/health`; sin lógica de negocio ni cliente de base de datos de la aplicación |
| 26 | A10 | Importa `routes.ts` y `menu.ts`, nunca `router.ts`; sin DOM, jsdom ni refactor |
| 28 | A15 | `npm run typecheck` del frontend cubre `e2e/` y `playwright.config.ts`; un error de tipos en `e2e/` lo hace fallar |
| 29 | A10 | ESC-45 sobre `PUBLIC_ROUTES`, `DASHBOARD_ROUTES` y `DASHBOARD_MENU_ITEMS`; `router.ts` se verifica por inspección |
| 30 | A10, A11 | Unitaria: `FALLBACK_PATH` es `/dashboard`, ruta registrada (sin bucle), y las rutas desconocidas o `V2` no están registradas. Por inspección: `*` lleva a `FallbackRedirect`. Comportamiento provisional, sin afirmar nada sobre la sesión. Si falta algo en `routes.ts`, se consulta |
| 31 | A12 | Responsable `frontend-engineer`; comprueba que existe "Cerrar sesión" sin afirmar si está habilitada |
| 32 | A13 | Precondición: `medsupply_test` preparada por un `test:db` previo; backend con build + start |
| 33 | A13 | Se conserva como verificación de D-7, con el backend de build + start en 3100 |
| 34 | A13 | La inspección de `webServer` incluye build + start, sin `tsx watch` |
| 38 | A13 | `test:e2e` no ejecuta `DROP`, `CREATE` ni `migrate`: la estructura de `medsupply_test` no cambia |
| 39 | A14 | Basta el flujo documentado; no se exige mecanismo de bloqueo |
| 44 | A1 | QA-00.3-04 sin modificaciones; cualquier otro cambio en los tests de TK-00.3 se consulta antes |
| 47 | A13, A14 | La documentación incluye el orden `test:db` → `test:e2e`, que `test:e2e` no prepara la base y el arranque con build + start |

**Decisiones tras D-11 (aprobadas por el usuario, 2026-11-20):**
- **H1 · Jest en el frontend.** Ejecución ESM nativa con `node --experimental-vm-modules node_modules/.bin/jest`; se acepta el aviso experimental de Node. Se conserva `verbatimModuleSyntax`. Sin CommonJS, Babel ni transformaciones adicionales.
- **H2 · Typecheck de las pruebas del frontend.** `ts-jest` no comprueba tipos en modo ESM, así que los tipos de `tests/` se comprueban en `npm run typecheck` con una configuración TypeScript específica integrada en la existente (como `e2e/` en A15).
- **H3 · Backend de E2E.** Arranca con `node --env-file-if-exists=../.env dist/server.js` (desde `backend/`). Las variables definidas en el entorno del proceso (`PORT`, `DATABASE_URL` hacia `medsupply_test`) prevalecen sobre las del `.env`. Ningún secreto se escribe en archivos versionados, salidas ni logs.

**Resultado de D-11 (2026-11-20): las ocho comprobaciones resultaron viables**, con H1–H3 aprobadas. Se ejecutaron en copias del scratchpad, sin modificar el repositorio.
1. Node v26.13.1 en macOS arm64.
2. Playwright 1.64.1 con Chromium (revisión 1248): la prueba trivial en TypeScript pasa. `npm audit`: Playwright no añade avisos. Chromium ocupa unos 570 MB en disco.
3. Jest 30.5.2 con `ts-jest` 29.4.15 en modo ESM (H1): una prueba real de `routes.ts` y `menu.ts`, sin `router.ts` ni DOM, pasa. Jest trae al frontend los 18 avisos moderados conocidos de SEC-02, sin high ni critical (D-9).
4. `import.meta.env` solo aparece en `src/api/client.ts`, fuera de la cadena de ESC-45 y ESC-49a. Probar ese módulo en Jest requerirá una decisión aparte; no aplica a este ticket.
5. `tsconfig.e2e.json` referenciado desde `tsconfig.json`: `npm run typecheck`, `lint` y `build` pasan; un error de tipos en `e2e/` hace fallar el typecheck. Sin cambios en `tsconfig.app.json` ni `tsconfig.node.json`.
6. Recreación de `medsupply_test` con el rol de aplicación desde `postgres`, con las salvaguardas de D-2 y A3, sin `FORCE`. Base en uso: SQLSTATE 55006. Base inexistente: SQLSTATE 3D000 (evidencia para A6). `medsupply` sin cambios.
7. `prisma migrate deploy` con el binario local sobre la base nueva. Una única migración aplicada, `20261120000000_init`: `finished_at` informado, `rolled_back_at = NULL`, `applied_steps_count = 1`. `prisma migrate status`: el esquema está actualizado. Sin intentos fallidos ni rollbacks. La inconsistencia señalada en el informe de D-11 estaba en el resumen textual, no en los datos de PostgreSQL.
8. `npm run build` en limpio (sin `src/generated`) y `node dist/server.js` en el puerto 3100 contra `medsupply_test`: `/api/v1/health` responde 200 y los logs no contienen secretos. Las variables del entorno prevalecen sobre el `.env` (base de H3).

**Estado de las autorizaciones (2026-11-20):** puerta 1 y autorización A ejecutadas; D-11 ejecutada y satisfactoria; H1–H3 aprobadas. La autorización C (implementación) sigue pendiente de aprobación expresa del usuario y no se ha iniciado la implementación.

**Decisiones de la implementación C (aprobadas por el usuario, 2026-11-20):**
- **Orden de fases.** `4a → 5a → 4b → 5b`, en serie y sin cambiar responsables: `frontend-engineer` (Jest, unitarias y variable del proxy) → `infrastructure-engineer` (runner de Playwright, `webServer` y typecheck de `e2e/`) → `frontend-engineer` (E2E de ESC-40) → `infrastructure-engineer` (verificaciones de E2E y documentación). Resuelve la dependencia entre el escenario 31 y el runner de Playwright.
- **Integración del typecheck (A15, H2).** Los `tsconfig` de pruebas (`tsconfig.test.json`) y de E2E (`tsconfig.e2e.json`) se integran en el script `npm run typecheck` (`tsc -b --noEmit && tsc -p tsconfig.test.json && tsc -p tsconfig.e2e.json`), sin referencias en `tsconfig.json`: referenciarlos rompería el `tsc -b` de la imagen de entrega del frontend.
- **A6 aprobada (puerta 2).** Al recrear `medsupply_test`, el `DROP DATABASE` tolera exclusivamente SQLSTATE `3D000` (la base no existe) y continúa con `CREATE` y `migrate`. Cualquier otro error, en especial `55006` (base en uso), se propaga como error controlado, sin `CREATE` ni `migrate`. Sin `IF EXISTS`.

**Ronda de correcciones tras QA y seguridad (aprobada por el usuario, 2026-11-20):**
- **O-1.** `README.md` documenta la limitación conocida del escenario 35 (Playwright 1.64.1): con `reuseExistingServer: false`, un servicio que responde HTTP en 3100 o 5174 hace fallar `test:e2e` en seguida; un listener que acepta conexiones sin responder HTTP puede bloquear la comprobación previa más allá del `timeout` del `webServer`. Cumplimiento parcial del escenario 35, aceptado.
- **O-2.** El nombre del test de `frontend/tests/unit/routes.test.ts` describe exactamente lo comprobado: la entrada "Cerrar sesión" existe, sin afirmar si está habilitada (A12).
- **O-3.** `frontend/e2e/proxy.spec.ts` comprueba el destino que `playwright.config.ts` entrega a Vite (`resolveApiProxyTarget` = `http://127.0.0.1:3100`) y la respuesta 200 a través del proxy, sin depender del estado del puerto 3000.
- **Helper de migraciones.** `migrateFailureError` redacta URL, usuario y contraseña (codificados y decodificados) en los errores de `prisma migrate deploy`; `safeDecode` evita el `URIError` con un `%` mal codificado; se conservan el error original de Prisma (código Pxxxx, servidor y puerto) y su código de salida. Riesgo aceptado: un secreto de 1–2 caracteres solo se redacta entre comillas o acentos graves.
- Verificación independiente de QA y revisión de `security-engineer`: aprobadas con observaciones, sin hallazgos bloqueantes. Observaciones informativas: `databaseNameOf` lanza `URIError` (sin secretos) si el nombre de la base tiene un `%` mal codificado; el grupo "unitarias, cliente falso" de `recreate.test.ts` incluye un test que ejecuta Prisma real.

### TK-00.4 · [DB] Seed
**Fase:** `MVP` · **Puntos:** 2 · **Depende de:** TK-00.3, TK-02.4 · **Spec:** specs/01_data_models.spec.md

Cargar los datos de la sección Seed de la spec 01. Usa la normalización de RN-12 de TK-02.4 para los teléfonos de los clientes. La idempotencia se evalúa **por separado en cada tabla**: clientes por `tax_id` (spec 05 §7.3); productos y pedidos solo cuando su tabla está vacía. Por integridad referencial, los pedidos solo se cargan si los productos del fixture se insertaron en la misma ejecución. Los registros existentes nunca se sobrescriben.

**Hecho cuando:**
- El seed es idempotente: correrlo dos veces no duplica datos. Se ejecuta con `npm run db:seed` en desarrollo y con `node dist/seed/index.js` en entrega, nunca con `npx` (decisión 1 de TK-00.3; R1 de la puerta 1 de TK-00.4, aprobada por el usuario el 2026-11-24).
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
