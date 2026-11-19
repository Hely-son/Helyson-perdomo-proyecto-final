# Tracker de implementación — MedSupply AI

Seguimiento operativo del MVP. Solo registra estado: la definición de cada ticket, su orden, dependencias y criterios están en los archivos del [backlog](README.md), y el contenido de cada spec en `specs/`.

**Lo actualiza exclusivamente la sesión coordinadora** (ver `CLAUDE.md`, "Coordinación del desarrollo"). Los subagentes no lo editan.

## Estados de ticket

`Pendiente` · `En análisis` · `En desarrollo` · `En infraestructura` · `En QA` · `En revisión de seguridad` · `Pendiente de aprobación humana` · `Requiere ajustes` · `Bloqueado` · `Hecho`

- No todos los tickets pasan por todos los estados.
- **Responsable actual** es el agente que trabaja el ticket en ese momento (`qa-bdd-analyst`, `backend-engineer`, `frontend-engineer`, `database-engineer`, `infrastructure-engineer`, `security-engineer`, `coordinador` o `usuario`).
- `Bloqueado` y `Requiere ajustes` llevan el motivo entre paréntesis en la columna Estado.
- `Hecho` solo se registra con la aprobación humana explícita del cierre (fecha) y el commit que cita el ticket.

## Tickets MVP

| Ticket | Estado | Responsable actual | Commit | Aprobación humana |
|---|---|---|---|---|
| TK-00.8 | Hecho | — | `1cc966d`, `d646368` | 2026-11-18 |
| TK-00.1 | Hecho | — | `c0e2423` | 2026-11-19 |
| TK-00.2 | Pendiente de aprobación humana | usuario | — | — |
| TK-00.6 | Pendiente | — | — | — |
| TK-00.3 | Pendiente | — | — | — |
| TK-00.5 | Pendiente | — | — | — |
| TK-00.4 | Pendiente | — | — | — |
| TK-00.7 | Pendiente | — | — | — |
| TK-01.1 | Pendiente | — | — | — |
| TK-01.2 | Pendiente | — | — | — |
| TK-01.3 | Pendiente | — | — | — |
| TK-02.4 | Pendiente | — | — | — |
| TK-03.1 | Pendiente | — | — | — |
| TK-03.2 | Pendiente | — | — | — |
| TK-03.3 | Pendiente | — | — | — |
| TK-03.4 | Pendiente | — | — | — |
| TK-04.1 | Pendiente | — | — | — |
| TK-04.3 | Pendiente | — | — | — |
| TK-04.5 | Pendiente | — | — | — |
| TK-05.7 | Pendiente | — | — | — |
| TK-05.1 | Pendiente | — | — | — |
| TK-05.2 | Pendiente | — | — | — |
| TK-05.3 | Pendiente | — | — | — |
| TK-05.6 | Pendiente | — | — | — |
| TK-05.4 | Pendiente | — | — | — |
| TK-05.5 | Pendiente | — | — | — |
| TK-06.1 | Pendiente | — | — | — |
| TK-06.2 | Pendiente | — | — | — |
| TK-06.3 | Pendiente | — | — | — |
| TK-06.4 | Pendiente | — | — | — |
| TK-06.5 | Pendiente | — | — | — |

Las filas siguen el orden de los archivos del backlog. El orden de ejecución lo fijan `backlog/README.md` y el campo **Depende de** de cada ticket.

## Seguimientos abiertos

Observaciones operativas que surgieron durante un ticket y deben revisarse en otro. Se eliminan al resolverse.

| Origen | Observación | Revisar en |
|---|---|---|
| TK-00.1 (paso 2, SEC-02) | `npm audit`: 18 avisos moderados, solo en dependencias de desarrollo (transitivas de `glob` y `minimatch`). `npm audit --omit=dev`: 0 vulnerabilidades. **Riesgo aceptado temporalmente** por el usuario (puerta 2, 2026-11-19). No degradar Jest ni modificar dependencias por este motivo | Cuando exista una versión corregida compatible con las versiones aprobadas |
| TK-00.1 (paso 2) | npm bloqueó los scripts de instalación de `esbuild` y `@parcel/watcher` por no estar aprobados; `tsx` funciona en local | TK-00.6 (Docker) y TK-00.7 (CI) |
| TK-00.2 (versiones, R5) | npm bloquea el script de instalación de `fsevents@2.3.3` (opcional de Vite, solo macOS). **No aprobado** por decisión del usuario: el binario ya viene compilado y funciona sin él. Una primera instalación sin lockfile no instala `fsevents` y el vigilante de Vite pasa a polling en macOS; con `npm ci` y lockfile se instala. En Linux no se instala | TK-00.6 (Docker) y TK-00.7 (CI) |
| TK-00.2 (DoD 2 y 3, excepción D3/OBS-03) | **Excepción aprobada por el usuario, no cumplimiento:** TK-00.2 no tiene tests de unidad ni de integración del frontend ni criterios automatizados (no se incorpora ningún runner en este ticket). Escribirlos cuando exista el runner del frontend | TK-00.5 |
| TK-00.2 (DoD 2, excepción de CI) | **Excepción aprobada por el usuario, limitada a TK-00.2 y distinta de la anterior:** lint y typecheck del frontend pasan en local, pero no se ejecutan en CI porque la CI aún no existe. TK-00.7 debe ejecutar en CI lint y typecheck del frontend y del backend, junto con las demás comprobaciones del backend | TK-00.7 |
| TK-00.2 (QA, ESC-40) | Cobertura parcial: solo la navegación y el menú (Inicio, Productos, Pedidos y Cerrar sesión deshabilitado), verificados a mano. Pendiente: sesión iniciada y cierre de sesión real (TK-01.2); prueba E2E (TK-00.5). No está completamente satisfecho | TK-01.2 y TK-00.5 |
| TK-00.2 (QA, ESC-45) | Cobertura parcial: ausencia de rutas y menús `V2` verificada por inspección del código y del build. Pendiente: prueba de unidad automatizada. No está completamente satisfecho | TK-00.5 |
| TK-00.2 (QA, ESC-49) | Cobertura parcial: solo la parte (a), provisional (`/` y las rutas desconocidas o `V2` redirigen a `/dashboard` sin bucles). Pendiente: la parte (b), sin sesión → `/login` (TK-01.2), y la prueba automatizada (TK-00.5). No está completamente satisfecho | TK-01.2 y TK-00.5 |
| TK-00.2 (QA-00.2-14) | El valor por defecto `/api/v1` se verificó con un build aislado del cliente HTTP, porque ninguna pantalla lo importa y Vite lo elimina del bundle (método alternativo aprobado). Volver a verificarlo en el build de la app cuando alguna pantalla use el cliente HTTP | TK-00.5 |
| TK-00.1 (paso 4) | Express responde automáticamente a `OPTIONS` con 200 `text/plain` y la cabecera `Allow`, en lugar del 404 JSON aprobado para métodos no declarados. Aceptado como limitación (alternativa a). Definir explícitamente el comportamiento y sus pruebas al diseñar CORS | Diseño de CORS (sin ticket asignado) |
| TK-00.1 (paso 4) | Los errores 500 no se registran en ningún log (sin logging en TK-00.1 por decisión del usuario). Definir una política de logging que proteja credenciales, datos de conexión y demás información sensible (RNF-08) | TK-00.3 |
| TK-00.1 (paso 6, SEC-03) | Si el puerto está ocupado, `listen()` termina con código 1 y muestra el stack en stderr. Tratarlo dentro de la política de logging y manejo controlado de errores operacionales, sin exponer stacks ni información sensible innecesaria | TK-00.3 |
| TK-00.1 (paso 5, O1) | `npm run dev` usa `tsx watch`: ante configuración inválida el servidor termina con código 1, pero el vigilante sigue activo. Aceptado para desarrollo. Docker deberá arrancar el backend con un comando sin modo watch, apropiado para ejecución en producción | TK-00.6 |
| TK-00.1 (paso 3) | El helper de pruebas `backend/tests/helpers/error-response.ts` lee el enum `ErrorCode` de `docs/openapi.yaml`: los tests del backend necesitan `docs/` disponible | TK-00.6 (Docker) y TK-00.7 (CI) |

## Specs

| Spec | Versión | Estado documental | Avance de implementación |
|---|---|---|---|
| `specs/01_data_models.spec.md` | v1.1 | Aprobada | Pendiente |
| `specs/02_inventory_system.spec.md` | v1.2 | Aprobada | Pendiente |
| `specs/03_conversational_bot.spec.md` | v1.1 | Aprobada | Pendiente |
| `specs/04_orders_claims.spec.md` | v1.0 | Aprobada | Pendiente |
| `specs/05_operator_dashboard.spec.md` | v1.1 | Aprobada | Pendiente |

**Estado documental** (`Borrador` · `En revisión` · `Aprobada` · `Sustituida`) refleja la cabecera de la spec. Lo cambia solo una nueva versión aprobada por el usuario; la coordinadora no lo modifica al implementar.

**Avance de implementación** (`Pendiente` · `En progreso` · `Implementada` · `Validada`) se deriva de los tickets `MVP` cuyo campo **Spec:** cita la spec:

- `Pendiente`: ningún ticket vinculado salió de `Pendiente`.
- `En progreso`: al menos uno salió de `Pendiente` y no todos están en `Hecho`.
- `Implementada`: todos los tickets `MVP` vinculados están en `Hecho`.
- `Validada`: además de `Implementada`, los `CA-` que cubre la spec están automatizados y pasan junto con la suite completa de regresión (unidad, integración y E2E) en CI, y el usuario lo aprueba explícitamente. Tener todos los tickets en `Hecho` no basta.

Los tickets `V2` no cuentan para el avance ni bloquean la validación del MVP.
