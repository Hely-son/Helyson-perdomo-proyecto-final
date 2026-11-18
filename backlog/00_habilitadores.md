# Habilitadores técnicos

| Fase | Requisitos | Puntos | Depende de |
|---|---|---|---|
| `MVP` | RNF-01, RNF-02, RNF-05, RNF-06, RNF-08 | 26 | — (TK-00.4 depende además de TK-02.4) |

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

### TK-00.2 · [INFRA] Proyecto frontend
**Fase:** `MVP` · **Puntos:** 2 · **Depende de:** — · **Spec:** docs/ARCHITECTURE.md

Crear `frontend/` con Vite + React 18 + TypeScript + Ant Design + React Router.

**Hecho cuando:**
- Existen las rutas `MVP` de la arquitectura (`/chat`, `/login`, `/dashboard`, `/dashboard/products`, `/dashboard/orders`) con layout base. No hay rutas ni menús de funciones `V2`.
- Existe un cliente API centralizado con la URL base configurable por variable de entorno.
- `npm run dev`, `build` y `lint` funcionan.

### TK-00.6 · [INFRA] Docker Compose
**Fase:** `MVP` · **Puntos:** 3 · **Depende de:** TK-00.1, TK-00.2 · **Spec:** docs/ARCHITECTURE.md

Crear `docker-compose.yml` con PostgreSQL 16, backend y frontend, según la tabla de entornos de la arquitectura (RNF-01, RNF-05).

**Hecho cuando:**
- En desarrollo, Compose levanta solo PostgreSQL con las bases `medsupply` y `medsupply_test`, y backend y frontend corren en el host.
- Un único comando documentado levanta base, backend y frontend desde un clon limpio, aplica las migraciones y carga el seed (entrega).
- PostgreSQL tiene healthcheck y el backend no arranca hasta que la base está lista.
- Las credenciales salen del archivo de variables, no del `docker-compose.yml`.

### TK-00.3 · [DB] Esquema Prisma y migración inicial
**Fase:** `MVP` · **Puntos:** 3 · **Depende de:** TK-00.1, TK-00.6 · **Spec:** specs/01_data_models.spec.md

Implementar las entidades `MVP`, enums, índices, restricciones, la secuencia y `next_order_number()` de la spec 01. No se crean `Claim` ni `PurchaseOrder` (PRD §7).

**Hecho cuando:**
- La migración se aplica sin errores en PostgreSQL 16.
- Los `CHECK` rechazan stock negativo, precio ≤ 0, cantidades ≤ 0 y teléfonos sin normalizar.
- Borrar un producto con pedidos falla (`Restrict`).
- Insertar pedidos asigna `MED-00001`, `MED-00002`… y un valor de secuencia superior a 99 999 produce un número de 6 dígitos sin recortarse (RN-04).

### TK-00.5 · [TEST] Infraestructura de pruebas
**Fase:** `MVP` · **Puntos:** 5 · **Depende de:** TK-00.3 · **Spec:** docs/ARCHITECTURE.md

Configurar Jest + Supertest en el backend contra PostgreSQL real y Playwright para E2E (RNF-01, RNF-04).

**Hecho cuando:**
- Los tests usan la base `medsupply_test`: se recrea con las migraciones al iniciar la suite y se vacía entre tests.
- El pool de conexiones de los tests admite más de una conexión, y existe una utilidad para lanzar peticiones en paralelo reales (base de RNF-04).
- Existe un test de ejemplo de integración y otro E2E que pasan.
- Un solo comando levanta backend y frontend para correr los E2E.

### TK-00.4 · [DB] Seed
**Fase:** `MVP` · **Puntos:** 2 · **Depende de:** TK-00.3, TK-02.4 · **Spec:** specs/01_data_models.spec.md

Cargar los datos de la sección Seed de la spec 01. Usa la normalización de RN-12 de TK-02.4 para los teléfonos de los clientes.

**Hecho cuando:**
- `npx prisma db seed` es idempotente: correrlo dos veces no duplica datos.
- Las credenciales del operador salen de variables de entorno (RNF-08).
- Los teléfonos escritos en distintos formatos quedan guardados normalizados y se encuentran con la consulta de CL-03.

### TK-00.7 · [INFRA] Pipeline de CI
**Fase:** `MVP` · **Puntos:** 3 · **Depende de:** TK-00.5, TK-00.8 · **Spec:** docs/ARCHITECTURE.md

Crear el workflow de GitHub Actions de la arquitectura (RNF-06).

**Hecho cuando:**
- Se ejecuta en cada push y pull request.
- Usa un servicio `postgres:16`, aplica las migraciones y corre lint, typecheck, los tests de unidad e integración (incluidos los de concurrencia de RNF-04) y los E2E.
- Valida que `docs/openapi.yaml` es un documento OpenAPI válido (RNF-02).
- El pipeline falla si falla cualquiera de esos pasos.
