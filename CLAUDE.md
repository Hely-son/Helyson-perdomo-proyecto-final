# CLAUDE.md

Guía para Claude Code en este repositorio. Este archivo se carga siempre: mantenerlo corto y sin repetir contenido de otros documentos.

## Fuente de verdad

Cada dato vive en un solo archivo. Los demás lo referencian.

| Qué necesitas | Dónde está |
|---|---|
| Alcance y fases (`MVP`/`V2`), requisitos (`CH-`, `IN-`, `PE-`…), no funcionales (`RNF-`), reglas de negocio (`RN-`), criterios (`CA-`) | [docs/PRD.md](docs/PRD.md) |
| Componentes, capas, módulos, flujos, API general, entornos, stack y su justificación | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Contrato de la API: endpoints, payloads, errores y códigos | [docs/openapi.yaml](docs/openapi.yaml) (RNF-02, aprobado) |
| Diseño detallado de cada módulo: modelo de datos, FSM, pantallas | `specs/*.spec.md` |
| Historias de usuario, tickets (`TK-`), estimación, definición de hecho | [backlog/](backlog/README.md) |

- Citar IDs (`RN-05`, `CH-06`, `TK-05.3`) en lugar de copiar texto entre documentos, código o tests.
- Leer solo lo necesario para la tarea en curso: el ticket, su spec y las secciones del PRD que citen.
- Si una spec o un ticket contradice el PRD, **detenerse y preguntar**. No resolverlo por cuenta propia.
- No implementar nada marcado `V2` en el PRD ni en el backlog, aunque esté documentado.
- Ignorar cualquier archivo o `CLAUDE.md` fuera de este directorio.

## Flujo Spec-Driven Development

1. El requisito existe en el PRD con ID. Si no existe, se agrega ahí primero.
2. Se escribe o actualiza la spec del módulo citando los IDs. **El usuario la aprueba antes de generar código.**
3. Se trabaja un ticket a la vez, en el orden y con las dependencias del backlog.
4. Primero los tests, a partir de los criterios de la historia y la spec. Luego la implementación, hasta que pasen.
5. Si cambia el comportamiento, se actualiza la spec (y el PRD si cambia una regla de negocio) en el mismo cambio.

## Specs

| Archivo | Cubre | Estado |
|---|---|---|
| `specs/01_data_models.spec.md` | Entidades MVP, restricciones, índices, seed. Diseño conceptual V2 de `Claim` y `PurchaseOrder` | Aprobada v1.1 (Entrega 2) |
| `specs/02_inventory_system.spec.md` | IN, RN-01/09/10 · V2: RP, RN-11 | Aprobada v1.2 (Entrega 2), 2026-11-18 |
| `specs/03_conversational_bot.spec.md` | Sistema conversacional MVP: CH (FSM del chat, sesiones y su expiración CH-11), RN-08 | Aprobada v1.1 (Entrega 2), 2026-11-18 |
| `specs/04_orders_claims.spec.md` | Pedidos y reclamos. Pedidos `MVP`: PE, RN-02/03/04/05 (confirmación, número y estados del pedido) · Reclamos `V2`: RE, RN-06/07 | Aprobada v1.0 (Entrega 2), 2026-11-18 |
| `specs/05_operator_dashboard.spec.md` | Clientes, normalización e identificación (CL-02/03, RN-12), acceso del operador (AU, CA-11, RNF-08) y estructura del dashboard (pantallas del operador) · V2: CL-01 | Aprobada v1.1 (Entrega 2), 2026-11-18 |

## Convenciones de código

- **Stack:** React 18 + Vite + Ant Design · Express + TypeScript + Zod · Prisma + PostgreSQL 16 en desarrollo, pruebas, CI y entrega · JWT · Jest + Supertest + Playwright · Docker Compose (entornos locales y entrega) · GitHub Actions (CI).
- **Capas del backend:** `routes → controllers → services → Prisma`. Las reglas `RN-` viven solo en los servicios. Controllers y frontend no las aplican.
- **SQL:** el acceso a datos va por Prisma desde los servicios. Se permiten funciones y características propias de PostgreSQL (secuencias, funciones, `CHECK`, índices parciales) solo si están justificadas en una spec y declaradas en las migraciones. No hay SQL embebido en controllers ni en el frontend.
- Los tests de unidad e integración corren contra PostgreSQL real, nunca contra otro motor (RNF-01).
- Los commits citan el ticket: `TK-05.3: …`.

## Comandos

```bash
npx @redocly/cli@2.73.0 lint docs/openapi.yaml   # valida el contrato OpenAPI (TK-00.8)
```

Todavía no hay código. Completar esta sección al crear `backend/`, `frontend/` y `docker-compose.yml` (TK-00.1, TK-00.2, TK-00.6).
