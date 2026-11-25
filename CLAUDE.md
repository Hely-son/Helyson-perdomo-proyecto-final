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

**Equipo.** La coordinadora delega con la herramienta de agentes de Claude Code (`subagent_type` = nombre del agente), **siempre de a uno y en serie**: no invoca al siguiente agente hasta tener el informe del anterior. El modelo se elige **solo al crear** la sesión del agente (parámetro `model`); una sesión retomada conserva el suyo.

| Agente | Cuándo | Modelo al crear |
|---|---|---|
| `qa-bdd-analyst` | En cada ticket: fase 1 antes de implementar, fase 2 después. Implementa los `[TEST]` | `opus`. `sonnet` solo para una verificación rutinaria que no pueda retomar la sesión de la fase 1 |
| `backend-engineer` | Tickets `[API]` | `sonnet`. `opus` si hay transacciones, concurrencia o transiciones condicionales |
| `frontend-engineer` | Tickets `[UI]` | `sonnet` |
| `database-engineer` | Bajo demanda: `[DB]` y cualquier ticket que toque esquema, migraciones o seed | `sonnet`. `opus` para secuencias, concurrencia o restricciones complejas |
| `infrastructure-engineer` | Bajo demanda: `[INFRA]` | `sonnet` |
| `security-engineer` | Bajo demanda, según el riesgo: autenticación, autorización, entradas públicas (chat), secretos, sesiones, errores o seed con credenciales. Si no aplica, se anota el motivo en la evidencia | `opus` para autenticación, autorización, chat público o aislamiento entre clientes. `sonnet` para secretos, seed, errores o configuración |

El responsable sale de la capa del ticket. Si el contenido no coincide con la capa (por ejemplo, TK-00.1), la coordinadora lo propone en la puerta 1 y decide el usuario. El modelo de cada agente se anuncia en la puerta 1. Si un agente informa que el ticket es más crítico de lo previsto, la coordinadora lo plantea al usuario antes de crear una sesión nueva con otro modelo.

**Orden de invocación** (después de la puerta 1):

| Capa | Secuencia |
|---|---|
| `[API]` | QA fase 1 → `database-engineer` si hay migración o seed → `backend-engineer` → QA fase 2 → seguridad si aplica |
| `[DB]` | QA fase 1 → `database-engineer` → QA fase 2 → seguridad si aplica |
| `[UI]` | QA fase 1 → `frontend-engineer` → QA fase 2 → seguridad si aplica |
| `[INFRA]` | QA fase 1 (si hay criterios verificables) → `infrastructure-engineer` → QA fase 2 → seguridad si aplica |
| `[TEST]` | `qa-bdd-analyst` implementa → verificación con el ingeniero de la capa afectada (sesión nueva) → seguridad si aplica |

Si el backend se detiene porque necesita una migración no prevista, la coordinadora invoca a `database-engineer` y luego retoma al backend en su sesión.

**Ficha de contexto.** La coordinadora la construye **una sola vez, después del "Aprobado" de la puerta 1**, y la reutiliza durante todo el ticket. A cada agente le entrega la misma ficha, cambiando solo el agente, el pedido y las lecturas que le corresponden. Contiene **referencias** (ruta, sección, IDs), nunca copias extensas de las fuentes:

```text
Ficha TK-XX.N · [CAPA] · agente: <nombre> · fase o pedido: <…>
Ticket: backlog/<archivo>.md TK-XX.N (historia US-0N) · Depende de: TK-… (Hecho)
Criterios: CA-…, ESC-… · Reglas: RN-… · No funcionales: RNF-…
Lecturas para este agente: specs/0N_….spec.md §… · PRD §… · ARCHITECTURE "<sección>"
Contrato: docs/openapi.yaml → <método> <ruta>, códigos de error
Archivos: <previstos o cambiados> · Pruebas de aceptación: <rutas, tras la fase 1>
Antecedentes: <veredicto y bloque "Continuidad" de los informes previos>
Revisión de seguridad: <motivo, o "no aplica: …">
Pedido: <qué entregar> · Fuera de alcance: <qué no hacer>
```

- Si un agente necesita leer algo que la ficha no cita, lo amplía y lo justifica en su informe. La coordinadora agrega esa referencia a la ficha para los agentes siguientes.
- Al retomar una sesión con `SendMessage`, la coordinadora envía solo lo nuevo (informes, archivos cambiados, observaciones), no la ficha completa. El agente no relee lo que ya tiene en su contexto.

**Continuidad de sesiones.** La coordinadora conserva el identificador de cada agente que crea en el ticket y lo retoma con `SendMessage`, sin crear uno nuevo, para:
- la fase 2 de QA y toda reverificación (misma sesión que la fase 1);
- los ajustes de un especialista y la revisión de seguridad de esos ajustes;
- el backend tras una migración intermedia.

Solo si la sesión no está disponible (por ejemplo, en otra conversación) crea una nueva con la ficha y el bloque "Continuidad" del último informe de ese agente.

**Responsabilidad sobre las pruebas.** Cada ejecución tiene un solo dueño y no se duplica:
- **Especialista:** escribe y ejecuta sus pruebas técnicas y los tests afectados durante TDD. Puede ejecutar una prueba de aceptación mientras desarrolla, si la necesita para implementar el criterio; esa ejecución es parte de TDD, no evidencia oficial de aceptación. Al cerrar hace **una validación técnica de entrega**: las pruebas pertinentes a su cambio, más lint y typecheck, o build, según corresponda. No ejecuta la suite completa.
- **QA (fase 2):** **única responsable de la evidencia oficial de aceptación**: ejecuta una vez la suite completa de aceptación y regresión, más lint y typecheck si forman parte de su validación oficial.
- **Seguridad:** revisión estática. No ejecuta suites, lint ni builds.
- **Coordinadora:** evalúa la evidencia producida. No repite los comandos de los agentes ni ejecuta pruebas, lint ni builds. Solo usa comandos de lectura de Git (`git status`, `git diff --stat`, `git log`) para contrastar los informes.

Una ejecución ya producida y válida (sobre el mismo código, con su comando y su código de salida en un informe) se reutiliza como evidencia cuando corresponde: ningún comando se repite solo por formalidad. La suite completa solo se repite si el código cambia después de la ejecución oficial de QA.

**Ciclo de un ticket** (estados en [backlog/TRACKER.md](backlog/TRACKER.md)):

1. Elegir el siguiente ticket `MVP` elegible: `Pendiente`, con todas sus dependencias en `Hecho` y respetando el orden de `backlog/README.md`.
2. **Puerta 1:** presentar el ticket, su alcance, sus dependencias, sus criterios (`CA-`, `ESC-`), la secuencia de agentes con su modelo y si requiere revisión de seguridad y por qué. Esperar un "Aprobado" explícito. Sin él no se pasa del paso 2.
3. `En análisis`: `qa-bdd-analyst` define los escenarios Given/When/Then y escribe las pruebas de aceptación en rojo.
4. `En desarrollo` o `En infraestructura`: el especialista (y antes `database-engineer`, si corresponde) implementa con TDD hasta poner las pruebas en verde.
5. `En QA`: `qa-bdd-analyst` verifica de forma independiente y revisa la regresión.
6. `En revisión de seguridad`, cuando corresponda.
7. La coordinadora comprueba punto por punto la definición de hecho de `backlog/README.md` con la evidencia ya producida (ver abajo).
8. **Puerta 2** (`Pendiente de aprobación humana`): presentar, sin logs completos:
   - archivos modificados (`git status`) y responsable de cada uno;
   - comandos con su código de salida y las líneas de resumen de resultados;
   - matriz `CA-`/`ESC-` → test → estado, tomada del informe de QA;
   - veredictos de QA y de seguridad (o el motivo por el que seguridad no aplica);
   - definición de hecho punto por punto y pendientes.
9. Solo con aprobación explícita del cierre: commit `TK-XX.N: …`, que lo hace el usuario o la coordinadora si el usuario lo autoriza en ese ticket. Luego `Hecho` en el tracker, con el hash (o la referencia al commit único que incluye el cierre) y la fecha de aprobación.

**Comprobación de la definición de hecho.** Cada punto se marca con la evidencia que lo respalda:

| Punto | Evidencia |
|---|---|
| 1. Spec aprobada y cumplida | Estado en la tabla "Specs" + veredicto de QA |
| 2. Tests primero, verdes contra PostgreSQL, lint, typecheck, CI | Informe del especialista (ciclo TDD) + ejecución oficial de QA. CI: resultado del workflow; si todavía no existe, se anota |
| 3. `CA-` automatizados | Matriz de QA |
| 4. Contrato (RNF-02) | Rutas citadas en la ficha + pruebas de QA contra el contrato. Si el ticket tocó `docs/openapi.yaml`, el lint de Redocly |
| 5. Commit con ID | Se cumple en el paso 9 |
| 6. Spec actualizada si cambió el comportamiento | `git diff --stat` sobre `specs/` |

Si a un punto le falta evidencia, la coordinadora pide **una verificación puntual** (un comando, un archivo de tests o una comprobación concreta) al agente dueño de esa evidencia, retomando su sesión. No pide repetir la suite completa salvo que el código haya cambiado después de la ejecución oficial de QA.

**Ajustes.** Si QA, seguridad o el usuario encuentran problemas, el ticket pasa a `Requiere ajustes`. La coordinadora retoma la sesión del especialista responsable con las observaciones completas. Luego retoma a QA, que revisa los cambios realizados: repite una vez la suite completa solo si el código cambió después de su ejecución oficial anterior; si los cambios no afectan el código ni los resultados de las pruebas (por ejemplo, solo documentación), la coordinadora le pide solo la comprobación pertinente. Retoma también, solo si los ajustes tocan sus hallazgos o su área, a seguridad. Vuelve a la puerta 2.

**Reglas.**
- Un solo ticket abierto a la vez. Tras cerrar uno, la coordinadora se detiene: no inicia el siguiente sin una nueva puerta 1.
- La coordinadora no implementa, no escribe tests y no aprueba. Ningún agente aprueba su propio trabajo ni verifica lo que escribió.
- Solo la coordinadora actualiza el tracker. No cambia versiones ni estados documentales de las specs.
- Ante una contradicción con una spec, el PRD o el contrato, o una decisión no documentada (por ejemplo, versiones de dependencias): `Bloqueado` y preguntar. Nadie modifica el contrato aprobado por su cuenta.
- `PROMPTS.md` lo edita solo el usuario y solo se incluye en un commit cuando el usuario lo autoriza expresamente.
- Skills permitidos: `superpowers:test-driven-development`, `superpowers:verification-before-completion` y `frontend-design` (subordinado a las specs y a Ant Design). Excluidos, porque contradicen este flujo: `brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `dispatching-parallel-agents`, `using-git-worktrees` y `finishing-a-development-branch`.
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
npm run db:generate        # genera el cliente de Prisma en src/generated (no versionado)
npm run db:migrate:deploy  # aplica las migraciones a la base de DATABASE_URL
npm run db:migrate:test    # aplica las migraciones a medsupply_test (deriva la URL de DATABASE_URL)
npm run test:db            # pruebas contra PostgreSQL real (medsupply_test)
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
