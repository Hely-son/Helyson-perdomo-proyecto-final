# US-02 · Clientes: identificación (MVP) y gestión (V2)

| Fase | Requisitos | Reglas | Puntos | Depende de |
|---|---|---|---|---|
| `MVP` | CL-02, CL-03 | RN-12 | 2 | Habilitadores (TK-00.3, TK-00.5) |
| `V2` | CL-01 | RN-10 | 7 | US-01 |

En el MVP los clientes solo se cargan por seed (PRD §10). Esta historia aporta al MVP la consulta de clientes por teléfono que usa el chat; la gestión desde el dashboard queda en V2.

## Historias

`MVP` **Como** distribuidora,
**quiero** que el sistema reconozca a mis clientes por su teléfono, sin importar cómo lo escriban,
**para** que solo las clínicas y farmacias habilitadas puedan comprar por el chat.

`V2` **Como** operador,
**quiero** registrar y mantener las clínicas y farmacias habilitadas,
**para** que solo clientes autorizados puedan comprar por el chat.

## Criterios de aceptación

1. `MVP` **Dado** un teléfono escrito con espacios, separadores o sin `+56`, **cuando** se carga por seed o se ingresa en el chat, **entonces** se normaliza igual en ambos casos y se reconoce al mismo cliente (RN-12, CL-03).
2. `MVP` **Dado** un teléfono vacío o con formato evidentemente inválido, **cuando** se normaliza, **entonces** se rechaza (RN-12).
3. `MVP` **Dado** un cliente inactivo, **cuando** se consulta su teléfono, **entonces** la consulta indica que existe pero está inactivo, y el chat lo trata como no registrado (CL-02; se verifica en US-05 con CA-06).
4. `V2` **Dado** el formulario de cliente, **cuando** guardo razón social, documento tributario y teléfono válidos, **entonces** el cliente queda activo y aparece en el listado.
5. `V2` **Dado** un teléfono o documento ya registrado, **cuando** intento guardarlo en otro cliente, **entonces** se rechaza con un mensaje claro.
6. `V2` **Dado** un cliente activo, **cuando** lo desactivo, **entonces** no se elimina y conserva sus pedidos (RN-10).

## Tickets

### TK-02.4 · [API] Normalización de teléfonos y consulta de clientes
**Fase:** `MVP` · **Puntos:** 3 (reestimado de 2 en la puerta 1) · **Depende de:** TK-00.3, TK-00.5 · **Spec:** specs/05_operator_dashboard.spec.md

Crear la función de normalización de RN-12 y, en `customers.service`, la consulta por teléfono de CL-03. No crea endpoints HTTP.

**Hecho cuando:**
- La normalización sigue la spec 05 §6.1:
  - elimina **solo** los separadores aprobados (espacio ASCII, guion `-`, punto `.` y paréntesis `(` `)`); cualquier otro carácter, o un `+` fuera de la primera posición, la invalida (DP-01);
  - una entrada **sin `+`** es nacional y debe tener **exactamente nueve dígitos**: con nueve devuelve `+56` seguido de esos dígitos; con menos o con más es inválida y nunca se completan dígitos (DP-02, DP-03);
  - un **`+` explícito** indica prefijo internacional y se conserva sin anteponer `+56`; no se infieren códigos de país sin `+` y `00` no es prefijo (DP-02).
- Ante una entrada inválida, la función devuelve el motivo (vacía, faltan *n* dígitos, sobran dígitos, formato no admitido) para uso interno de la aplicación (spec 05 §6.3 B).
- Tests unitarios de la normalización: cada separador aprobado; nueve dígitos nacionales; ocho y menos dígitos con la cantidad que falta; diez o más dígitos sin `+`; `+56` explícito sin un segundo `+56` (prefijo no duplicado); otro prefijo internacional con `+` conservado; `56…` y `00…` sin `+` rechazados; entrada vacía, solo espacios y caracteres no admitidos (spec 05 ESC-01..ESC-08, ESC-21).
- Tests de integración de la consulta: cliente activo, cliente inactivo y teléfono inexistente. Los fixtures incluyen teléfonos escritos como número nacional sin prefijo internacional, con `+56` y con un prefijo internacional distinto de `+56` (spec 03, ESC-06).
- La función es la misma que usan el seed (TK-00.4) y el chat (TK-05.1). El backend revalida y normaliza todo teléfono recibido, aunque el simulador ya lo haya validado.
- La identificación (CL-03) devuelve inválido, inexistente, inactivo o activo; con un teléfono inválido no consulta la base. El motivo del rechazo **no** se añade al contrato ni a la respuesta del chat: ante un teléfono inválido, inexistente o inactivo, el chat mantiene la respuesta genérica de la spec 03 (F-1, CL-02).
- La validación local del simulador (prefijo fijo `+56`, aviso de dígitos que faltan o sobran y no envío de la petición; spec 05 §6.3 A) es del frontend del chat (TK-05.4), no de este ticket.

**Decisiones de la puerta 1 y del plan (aprobadas por el usuario, 2026-11-20).** No modifican los criterios anteriores. Fuera del ticket: endpoints HTTP, `startChatSession` (TK-05.1), validación del simulador (TK-05.4), seed (TK-00.4), login (TK-01.1), validación de RUT, deduplicación y `V2`.
- **D-A · Cliente de base de datos de la aplicación.** La primera conexión funcional de la aplicación a la base se adelanta de TK-01.1 a TK-02.4. `backend/src/lib/prisma.ts` expone `createPrismaClient(databaseUrl)` con el adaptador `pg`, con la URL explícita y sin instancias globales al importarse. `customers.service` recibe el cliente como dependencia y no gestiona su ciclo de vida. No se cablea en `server.ts`: TK-01.1 creará la instancia única en el servidor y la reutilizará. `docs/ARCHITECTURE.md` se actualiza en el mismo cambio. Sin autenticación, autorización, endpoints ni infraestructura adicional.
- **D-B · Aislamiento de pruebas.** Las pruebas de integración usan solo `medsupply_test`: el cliente de pruebas recibe la URL derivada por el arnés de TK-00.5 (`deriveTestDatabaseUrl`) y se comprueba `current_database()` antes de las pruebas. Nunca se consulta ni modifica `medsupply`.
- **D-C · Generación de Prisma.** `npm run db:generate` pasa a ser precondición documentada de build, typecheck y pruebas (README). Seguimiento para la CI de TK-00.7 en el tracker. Sin cambios en Dockerfile ni Compose.
- **D-D · Seguridad.** Revisión puntual de `security-engineer` tras la verificación de QA: validación y normalización de entradas malformadas, ausencia de expresiones regulares con retroceso catastrófico, consulta Prisma tipada sin SQL crudo, teléfonos fuera de logs y mensajes de error. Sin auditoría general ni endurecimiento de producción.
- **D-E · Responsables.** `backend-engineer` (implementación, incluida la documentación del cambio), `qa-bdd-analyst` (análisis y verificación) y `security-engineer` (revisión puntual). Sin tareas para `database-engineer`.
- **Estimación:** 3 puntos.
- **Excepción de CI (DoD 2).** Limitada a TK-02.4: evidencia local de `npm test`, `npm run test:db`, lint, typecheck, build y el E2E existente; la ejecución en CI corresponde a TK-00.7 (ver Seguimientos del tracker). No se declara cumplido el requisito de CI.
- **Ajuste de compatibilidad de Jest (aprobado por el usuario tras el bloqueo de T0, 2026-11-20).** El generador de Prisma (`importFileExtension = "js"`) produce archivos `.ts` que se importan con sufijo `.js`; `tsc` los resuelve, pero Jest no. Se añade `moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' }` a `backend/jest.config.js` y `backend/jest.db.config.js`. Se justifica por el primer uso real del cliente generado en TK-02.4; no reabre TK-00.5 ni modifica su historial. Sin cambios en `schema.prisma`, versiones, configuración de TypeScript ni código generado.
- **Segundo ajuste de compatibilidad de Jest (aprobado por el usuario tras el segundo bloqueo de T0, 2026-11-24).** El cliente generado carga su motor con `import()` dinámico, que Jest (dentro de `vm`) solo admite con `--experimental-vm-modules` (`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG`). Se añade ese flag exclusivamente al script `test:db` de `backend/package.json`, igual que el `npm test` del frontend (H1 de TK-00.5). No afecta a producción: `node dist/server.js` ejecuta el `import()` de forma nativa.
- **Cierre (puerta 2, aprobado por el usuario, 2026-11-24).** QA y seguridad: aprobados con observaciones, sin hallazgos bloqueantes. Evidencia local: `npm test` 110/110, `npm run test:db` 118/118, lint, typecheck, build y `test:e2e` 2/2; `medsupply` intacta. **Desviación de TDD:** `backend/tests/db/customers-identification.test.ts` se escribió después del servicio y pasó en verde sin rojo previo; las pruebas unitarias del mismo comportamiento sí pasaron por rojo. Observaciones de QA (informativas): una entrada solo de separadores (`---`) devuelve faltan 9 dígitos, conforme con §6.1, sin test propio; una aserción final de QA-02.4-21 no aporta; el test de tiempo lineal usa un umbral de 1 s que podría fallar en una CI lenta. Las observaciones de seguridad para TK-05.1 están en Seguimientos del tracker.
- **Escenarios de este ticket:** spec 05 ESC-01..ESC-13, ESC-18 (parcial: el valor buscado sale de la misma función; el valor guardado por el seed es de TK-00.4), ESC-19 y ESC-21. ESC-14..ESC-16 y ESC-22 son del seed (TK-00.4); ESC-17 quedó cubierto en TK-00.3; ESC-20 se verifica por inspección.

### TK-02.1 · [API] Endpoints de clientes
**Fase:** `V2` · **Puntos:** 3 · **Depende de:** TK-01.1, TK-02.4 · **Spec:** specs/05_operator_dashboard.spec.md

Crear listar, crear, editar y desactivar clientes, con validación Zod y normalización del teléfono (RN-12).

**Hecho cuando:**
- Un duplicado de teléfono o documento devuelve 409.
- No existe ningún endpoint de borrado.

### TK-02.2 · [UI] Pantalla de clientes
**Fase:** `V2` · **Puntos:** 3 · **Depende de:** TK-02.1, TK-01.2 · **Spec:** specs/05_operator_dashboard.spec.md

Crear la tabla de clientes con indicador activo/inactivo, un formulario modal para crear o editar y la acción de desactivar con confirmación.

**Hecho cuando:**
- Los errores 409 y 422 se muestran junto al campo correspondiente.

### TK-02.3 · [TEST] Pruebas de clientes
**Fase:** `V2` · **Puntos:** 1 · **Depende de:** TK-02.1 · **Spec:** specs/05_operator_dashboard.spec.md

**Hecho cuando:**
- Hay tests de integración para unicidad y desactivación.
