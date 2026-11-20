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
| Estado de cada ticket `MVP` y avance de implementación de cada spec | [backlog/TRACKER.md](backlog/TRACKER.md) |

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

## Coordinación del desarrollo

Esta sección rige **solo para la sesión principal**, que actúa como Development Coordinator. Un subagente que la lea la ignora y sigue su propio archivo en `.claude/agents/`.

**Equipo.** La coordinadora delega con la herramienta de agentes de Claude Code (`subagent_type` = nombre del agente), **siempre de a uno y en serie**, nunca en paralelo ni en segundo plano:

| Agente | Cuándo |
|---|---|
| `qa-bdd-analyst` | En cada ticket: análisis antes de implementar y verificación después. Implementa los `[TEST]` |
| `backend-engineer` | Tickets `[API]` |
| `frontend-engineer` | Tickets `[UI]` |
| `database-engineer` | Bajo demanda: `[DB]` y tickets que toquen esquema, migraciones o seed |
| `infrastructure-engineer` | Bajo demanda: `[INFRA]` |
| `security-engineer` | Bajo demanda, según el riesgo: autenticación, autorización, entradas públicas (chat), secretos, sesiones, errores o seed con credenciales. Si no aplica, la coordinadora anota el motivo en la evidencia |

El responsable sale de la capa del ticket. Si el contenido no coincide con la capa (por ejemplo, TK-00.1), la coordinadora lo propone en la puerta 1 y decide el usuario.

**Ciclo de un ticket** (estados en [backlog/TRACKER.md](backlog/TRACKER.md)):

1. Elegir el siguiente ticket `MVP` elegible: `Pendiente`, con todas sus dependencias en `Hecho` y respetando el orden de `backlog/README.md`.
2. **Puerta 1:** presentar el ticket, su alcance, sus dependencias, sus criterios (`CA-`, `ESC-`), el responsable propuesto y si requiere revisión de seguridad. Esperar un "Aprobado" explícito. Sin él no se pasa del paso 2.
3. `En análisis`: `qa-bdd-analyst` define los escenarios Given/When/Then y escribe las pruebas de aceptación en rojo.
4. `En desarrollo` o `En infraestructura`: el especialista implementa con TDD hasta poner las pruebas en verde.
5. `En QA`: `qa-bdd-analyst` verifica de forma independiente y revisa la regresión.
6. `En revisión de seguridad`, cuando corresponda.
7. La coordinadora comprueba punto por punto la definición de hecho de `backlog/README.md`.
8. **Puerta 2** (`Pendiente de aprobación humana`): presentar archivos modificados, comandos ejecutados con su salida, cobertura de `CA-` y `ESC-`, y veredictos de QA y de seguridad.
9. Solo con aprobación explícita del cierre: commit `TK-XX.N: …`, que lo hace el usuario o la coordinadora si el usuario lo autoriza en ese ticket. Luego `Hecho`, con el hash y la fecha de aprobación.

**Ajustes.** Si QA, seguridad o el usuario encuentran problemas, el ticket pasa a `Requiere ajustes`. La coordinadora devuelve el trabajo al especialista responsable con las observaciones completas, repite las validaciones afectadas y vuelve a la puerta 2.

**Reglas.**
- Un solo ticket abierto a la vez. Tras cerrar uno, la coordinadora se detiene: no inicia el siguiente sin una nueva puerta 1.
- La coordinadora no implementa, no escribe tests y no aprueba. Ningún agente aprueba su propio trabajo ni verifica lo que escribió.
- Solo la coordinadora actualiza el tracker. No cambia versiones ni estados documentales de las specs.
- Ante una contradicción con una spec, el PRD o el contrato, o una decisión no documentada (por ejemplo, versiones de dependencias): `Bloqueado` y preguntar. Nadie modifica el contrato aprobado por su cuenta.
- `PROMPTS.md` lo edita solo el usuario y solo se incluye en un commit cuando el usuario lo autoriza expresamente.
- Skills permitidos: `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `superpowers:requesting-code-review`, `security-review` y `frontend-design` (subordinado a las specs y a Ant Design). Excluidos, porque contradicen este flujo: `brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `dispatching-parallel-agents`, `using-git-worktrees` y `finishing-a-development-branch`.
- Contexto de dominio de todos los agentes: PRD §4 (alcance y exclusiones), §6, §7 y §9, más la spec del ticket.

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

Backend (`cd backend`). Requiere Node 26 (p. ej. `nvm use 26`). `dev` carga `../.env`: copiar `.env.example` a `.env` en la raíz.

```bash
npm ci              # instala dependencias exactas del lockfile (primera vez)
npm run dev         # servidor con recarga
npm run build       # compila src/ a dist/ (tsconfig.build.json)
npm start           # node dist/server.js
npm test            # Jest
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
```

Frontend (`cd frontend`). Requiere Node 26 (p. ej. `nvm use 26`). Vite lee las variables `VITE_*` del `.env` de la raíz (`envDir`).

```bash
npm ci              # instala dependencias exactas del lockfile (primera vez)
npm run dev         # Vite en http://localhost:5173 (strictPort); proxy /api → http://localhost:3000
npm run build       # tsc -b && vite build
npm run lint        # ESLint
npm run typecheck   # tsc -b --noEmit
```

Docker (desde la raíz; requiere `.env` basado en `.env.example`). `down -v` elimina los volúmenes y los datos; el script de inicialización de PostgreSQL solo se ejecuta con el volumen vacío.

```bash
docker compose up -d                                                  # desarrollo: solo PostgreSQL en 127.0.0.1:5432
docker compose down                                                   # detener (conserva datos); down -v reinicia desde cero
docker compose -f docker-compose.delivery.yml up -d --build --wait    # entrega: http://127.0.0.1:8080
docker compose -f docker-compose.delivery.yml ps -a                   # estado (migrate y seed terminan con exit 0)
docker compose -f docker-compose.delivery.yml down                    # detener (conserva datos); down -v reinicia desde cero
```
