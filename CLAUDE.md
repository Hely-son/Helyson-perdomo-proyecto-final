# CLAUDE.md

Guía para Claude Code en este repositorio. Este archivo se carga siempre: mantenerlo corto y sin repetir contenido de otros documentos.

## Fuente de verdad

Cada dato vive en un solo archivo. Los demás lo referencian.

| Qué necesitas | Dónde está |
|---|---|
| Alcance, requisitos (`CH-`, `IN-`, `PE-`…), reglas de negocio (`RN-`), criterios (`CA-`) | [docs/PRD.md](docs/PRD.md) |
| Componentes, capas, módulos, API general, stack y su justificación | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Diseño detallado de cada módulo: modelo de datos, contratos, FSM, pantallas | `specs/*.spec.md` |
| Historias de usuario, tickets (`TK-`), estimación, definición de hecho | [backlog/](backlog/README.md) |

- Citar IDs (`RN-05`, `CH-06`, `TK-05.3`) en lugar de copiar texto entre documentos, código o tests.
- Leer solo lo necesario para la tarea en curso: el ticket, su spec y las secciones del PRD que citen.
- Si una spec o un ticket contradice el PRD, **detenerse y preguntar**. No resolverlo por cuenta propia.
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
| `specs/01_data_models.spec.md` | Entidades, restricciones, índices, seed | Borrador |
| `specs/02_inventory_system.spec.md` | IN, RP, RN-01/09/10/11 | Pendiente |
| `specs/03_conversational_bot.spec.md` | CH, RN-02/04/08 (FSM del chat) | Pendiente |
| `specs/04_orders_claims.spec.md` | PE, RE, RN-03/05/06/07 | Pendiente |
| `specs/05_operator_dashboard.spec.md` | AU, CL, pantallas del operador | Pendiente |

## Convenciones de código

- **Stack:** React 18 + Vite + Ant Design · Express + TypeScript + Zod · Prisma (SQLite dev/test, PostgreSQL prod) · JWT · Jest + Supertest + Playwright.
- **Capas del backend:** `routes → controllers → services → Prisma`. Las reglas `RN-` viven solo en los servicios. Controllers y frontend no las aplican.
- Nada de SQL ni funciones exclusivas de SQLite o PostgreSQL.
- Los commits citan el ticket: `TK-05.3: …`.

## Comandos

Todavía no hay código. Completar esta sección al crear `backend/` y `frontend/` (TK-00.1, TK-00.2).
