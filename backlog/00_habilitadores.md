# Habilitadores técnicos

| Puntos | Depende de |
|---|---|
| 13 | — |

Estos tickets no entregan valor directo al usuario, pero todas las historias los necesitan. Base: [ARCHITECTURE](../docs/ARCHITECTURE.md).

## Tickets

### TK-00.1 · [INFRA] Proyecto backend
**Puntos:** 3 · **Depende de:** — · **Spec:** docs/ARCHITECTURE.md

Crear `backend/` con Express + TypeScript, organizado en capas y módulos.

**Hecho cuando:**
- `npm run dev`, `test`, `lint` y `typecheck` funcionan.
- Existe el middleware global de errores con el formato `{ error: { code, message } }`.
- Existe el middleware de validación con Zod.
- `GET /api/v1/health` responde 200.

### TK-00.2 · [INFRA] Proyecto frontend
**Puntos:** 2 · **Depende de:** — · **Spec:** docs/ARCHITECTURE.md

Crear `frontend/` con Vite + React 18 + TypeScript + Ant Design + React Router.

**Hecho cuando:**
- Existen las rutas `/chat`, `/login` y `/dashboard/*` con layout base.
- Existe un cliente API centralizado con la URL base configurable por variable de entorno.
- `npm run dev`, `build` y `lint` funcionan.

### TK-00.3 · [DB] Esquema Prisma y migración inicial
**Puntos:** 3 · **Depende de:** TK-00.1 · **Spec:** specs/01_data_models.spec.md

Implementar todas las entidades, enums, índices y restricciones de la spec 01.

**Hecho cuando:**
- La migración se aplica en SQLite y PostgreSQL sin errores.
- Los `CHECK` rechazan stock negativo, precio ≤ 0 y cantidades ≤ 0.
- Borrar un producto con pedidos falla (`Restrict`).

### TK-00.4 · [DB] Seed
**Puntos:** 2 · **Depende de:** TK-00.3 · **Spec:** specs/01_data_models.spec.md

Cargar los datos de la sección Seed de la spec 01.

**Hecho cuando:**
- `npx prisma db seed` es idempotente: correrlo dos veces no duplica datos.
- Las credenciales del operador salen de variables de entorno.

### TK-00.5 · [TEST] Infraestructura de pruebas
**Puntos:** 3 · **Depende de:** TK-00.3 · **Spec:** docs/ARCHITECTURE.md

Configurar Jest + Supertest en el backend y Playwright para E2E.

**Hecho cuando:**
- Los tests usan una base SQLite propia que se reinicia en cada suite.
- Existe un test de ejemplo de integración y otro E2E que pasan.
- Un solo comando levanta backend y frontend para correr los E2E.
