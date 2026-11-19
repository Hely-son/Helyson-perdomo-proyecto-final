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
