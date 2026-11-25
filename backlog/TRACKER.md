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
| TK-00.2 | Hecho | — | `f99cb47` | 2026-11-19 |
| TK-00.6 | Hecho | — | `25915f5` | 2026-11-20 |
| TK-00.3 | Hecho | — | `7e9a5a8` | 2026-11-20 |
| TK-00.5 | Hecho | — | `6528e29` | 2026-11-20 |
| TK-00.4 | Hecho | — | commit único `TK-00.4: seed reproducible del MVP` (implementación y cierre) | 2026-11-24 |
| TK-00.7 | Pendiente | — | — | — |
| TK-01.1 | Pendiente | — | — | — |
| TK-01.2 | Pendiente | — | — | — |
| TK-01.3 | Pendiente | — | — | — |
| TK-02.4 | Hecho | — | commit único `TK-02.4: normalización de teléfonos y consulta de clientes` (implementación y cierre) | 2026-11-24 |
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
| TK-00.1 (paso 2, SEC-02) | `npm audit`: 18 avisos moderados, solo en dependencias de desarrollo (transitivas de `glob` y `minimatch`). `npm audit --omit=dev`: 0 vulnerabilidades. **Riesgo aceptado temporalmente** por el usuario (puerta 2, 2026-11-19). No degradar Jest ni modificar dependencias por este motivo. Desde TK-00.3 (2026-11-20) los mismos 18 moderados viajan también en la imagen `medsupply-migrate:delivery` (no en la del backend); aceptado por el usuario (decisión 10 de TK-00.3), con el detalle en `backlog/00_habilitadores.md`, TK-00.3 | Cuando exista una versión corregida compatible con las versiones aprobadas |
| TK-00.1 (paso 2) | npm bloqueó los scripts de instalación de `esbuild` y `@parcel/watcher` por no estar aprobados; `tsx` funciona en local. Parte Docker resuelta en TK-00.6: las imágenes instalan con `npm ci --ignore-scripts` y los builds pasan (QA-00.6-34) | TK-00.7 (CI) |
| TK-00.2 (versiones, R5) | npm bloquea el script de instalación de `fsevents@2.3.3` (opcional de Vite, solo macOS). **No aprobado** por decisión del usuario: el binario ya viene compilado y funciona sin él. Una primera instalación sin lockfile no instala `fsevents` y el vigilante de Vite pasa a polling en macOS; con `npm ci` y lockfile se instala. En Linux no se instala. Parte Docker resuelta en TK-00.6: en las imágenes Linux no se instala y se usa `npm ci --ignore-scripts` (QA-00.6-34) | TK-00.7 (CI) |
| TK-00.2 (DoD 2, excepción de CI) | **Excepción aprobada por el usuario, limitada a TK-00.2 y distinta de la excepción D3/OBS-03, ya resuelta en TK-00.5:** lint y typecheck del frontend pasan en local, pero no se ejecutan en CI porque la CI aún no existe. TK-00.7 debe ejecutar en CI lint y typecheck del frontend y del backend, junto con las demás comprobaciones del backend | TK-00.7 |
| TK-00.2 (QA, ESC-40) | Cobertura parcial: la navegación y el menú sin sesión (Inicio, Productos, Pedidos y la entrada "Cerrar sesión", sin afirmar si está habilitada) están automatizados en el E2E de TK-00.5 (QA-00.5-31). Pendiente: sesión iniciada y cierre de sesión real. No está completamente satisfecho | TK-01.2 |
| TK-00.2 (QA, ESC-49) | Cobertura parcial: la parte (a), provisional (`/` y las rutas desconocidas o `V2` redirigen a `/dashboard` sin bucles), está automatizada con una prueba unitaria en TK-00.5 (QA-00.5-30). Pendiente: la parte (b), sin sesión → `/login`, y el nivel E de ESC-49. No está completamente satisfecho | TK-01.2 |
| TK-00.2 (QA-00.2-14) | El valor por defecto `/api/v1` se verificó con un build aislado del cliente HTTP, porque ninguna pantalla lo importa y Vite lo elimina del bundle (método alternativo aprobado). Volver a verificarlo en el build de la app cuando alguna pantalla use el cliente HTTP. Reasignado a TK-01.2, primer ticket que importa el cliente HTTP (decisión Q5 de TK-00.6; escenario diferido QA-00.6-D24) | TK-01.2 |
| TK-00.1 (paso 4) | Express responde automáticamente a `OPTIONS` con 200 `text/plain` y la cabecera `Allow`, en lugar del 404 JSON aprobado para métodos no declarados. Aceptado como limitación (alternativa a). Definir explícitamente el comportamiento y sus pruebas al diseñar CORS | Diseño de CORS (sin ticket asignado) |
| TK-00.1 (paso 4) | Los errores 500 no se registran en ningún log (sin logging en TK-00.1 por decisión del usuario). Definir una política de logging que proteja credenciales, datos de conexión y demás información sensible (RNF-08). Reasignado de TK-00.3 a TK-01.1 en la puerta 1 de TK-00.3 (2026-11-20). Nota de TK-00.3: con el adaptador `pg`, el `detail` de los errores de PostgreSQL incluye la fila completa que falló (`Failing row contains (...)`); no debe llegar a logs ni respuestas. Nota de seguridad de TK-00.3 (I-2, 2026-11-20): en los logs del servidor PostgreSQL, las líneas `DETAIL` de las violaciones de restricciones incluyen valores de claves y filas completas (`Key (email)=(…)`, `Key (phone)=(…)`, `Key (tax_id)=(…)`, `Failing row contains (…)`); con datos reales llegarían email, teléfono y RUT, y una violación `NOT NULL` en `users` incluiría `password_hash`. Hoy solo los ve quien accede a `docker logs` (mismo nivel de confianza que la base) y el MVP no tiene datos reales. La política de logging debe cubrir también los logs del servidor | TK-01.1 |
| TK-00.1 (paso 6, SEC-03) | Si el puerto está ocupado, `listen()` termina con código 1 y muestra el stack en stderr. Tratarlo dentro de la política de logging y manejo controlado de errores operacionales, sin exponer stacks ni información sensible innecesaria. Reasignado de TK-00.3 a TK-01.1 en la puerta 1 de TK-00.3 (2026-11-20) | TK-01.1 |
| TK-00.1 (paso 3) | El helper de pruebas `backend/tests/helpers/error-response.ts` lee el enum `ErrorCode` de `docs/openapi.yaml`: los tests del backend necesitan `docs/` disponible. En Docker no aplica: las imágenes no ejecutan tests (TK-00.6) | TK-00.7 (CI) |
| TK-00.3 (seguridad, I-6) | **Informativo** (revisión de seguridad de TK-00.3, 2026-11-20). El motor de migraciones de Prisma (schema-engine) se descarga en el build desde el CDN de Prisma, que verifica su checksum, pero no queda fijado en el lockfile, y la imagen `medsupply-migrate:delivery` depende de la arquitectura de la máquina de build (verificada en arm64; amd64 sin probar). Tenerlo en cuenta en la CI | TK-00.7 |
| TK-00.3 (incidencia Docker, 2026-11-20) | La coordinadora ejecutó `docker image prune -f --filter dangling=true` tras reconstruir las imágenes de MedSupply. Ese comando elimina todas las imágenes sin etiqueta del sistema y pudo borrar imágenes intermedias de otros proyectos; no se puede deshacer y no se intentará recuperarlas. Contenedores y volúmenes ajenos no se vieron afectados. Regla desde entonces: sin limpiezas globales de Docker (`image prune`, `system prune`); solo se manipulan recursos identificados de MedSupply AI | Toda tarea con Docker |
| TK-00.3 (DoD 2, excepción) | **Excepción aprobada por el usuario (2026-11-20), limitada a TK-00.3; no es cumplimiento íntegro del criterio 2 ni modifica la DoD general.** Las pruebas de base de datos se ejecutan en local contra PostgreSQL 16 (`npm run test:db`) con evidencia; su ejecución en CI queda para TK-00.7 (decisión 5 de la puerta 1) | TK-00.7 (CI) |
| TK-00.6 (DoD 2, excepción) | **Excepción aprobada por el usuario (2026-11-20), limitada a TK-00.6; no es cumplimiento íntegro del criterio 2 ni modifica la DoD general.** Criterio: tests escritos antes y pasando contra PostgreSQL, más lint y typecheck, también en CI. No se exigen pruebas automatizadas nuevas para este ticket de infraestructura: la evidencia equivalente son los 48 escenarios de `docs/qa/TK-00.6-matrix.md`, definidos antes de implementar y ejecutados por QA independiente (48 PASS). Lint y typecheck de backend y frontend pasan en local (QA) y los 72 tests existentes del backend siguen pasando. Las pruebas de integración contra PostgreSQL quedan para los tickets que implementen esa integración; lint, typecheck y build en CI, para TK-00.7 | TK-00.7 (CI) y tickets que integren PostgreSQL |
| TK-00.6 (paso 8, I-2) | **Riesgo aceptado del MVP (no resuelto)**, vinculado a TK-00.1. En desarrollo, `npm run dev` deja el backend escuchando en todas las interfaces (`*:3000`; `server.ts` llama a `listen(port)` sin host). Justificación: comportamiento del servidor de desarrollo existente; el Compose de desarrollo no publica el backend y en entrega el backend no publica puertos. Impacto: la exposición efectiva depende de la red y del firewall del equipo; hoy solo hay `/health`. Ampliación de TK-00.5 (2026-11-20): el backend de E2E (`npm run test:e2e`) también escucha en todas las interfaces (`*:3100`) mientras dura la ejecución, contra `medsupply_test`, y usa el mismo `JWT_SECRET` del `.env` que el backend de desarrollo, así que, cuando exista autenticación, los tokens que emita serían válidos en desarrollo | Reevaluar en TK-01.1 (autenticación); y si cambia la exposición del backend de desarrollo o se usa en un entorno compartido |
| TK-00.6 (paso 8, I-4) | **Riesgo condicionado aceptado del MVP (no resuelto)**, componente `frontend/nginx.conf` (proxy `/api/`). `X-Forwarded-For` puede contener valores enviados por el cliente. Justificación: el backend no usa ese valor para autorización, identificación ni seguridad (sin `trust proxy`). Impacto: ninguno hoy | Reevaluar si una funcionalidad usa la IP del cliente como dato de confianza (configuración del proxy y forma de obtener la IP) |
| TK-00.6 (paso 8, I-5) | **Riesgo condicionado aceptado del MVP (no resuelto)**, componente Nginx (log de acceso). El log registra las URL con sus parámetros. Justificación: hoy no viajan datos sensibles en la URL (el token va en la cabecera). Impacto: ninguno hoy | Reevaluar si se incorporan tokens, teléfonos, credenciales u otros datos sensibles en URL |
| TK-00.6 (paso 8, D) | **Informativo, aceptado** (paso 8 y hallazgo 2 del paso 3), componente `db` (healthcheck). `pg_isready` y `psql` se conectan sin contraseña por `127.0.0.1` dentro del contenedor por el `pg_hba` de la imagen oficial; desde la red interna y desde el puerto publicado se exige contraseña. Justificación: solo lo usa quien ya tiene `docker exec`, que no gana privilegios. Impacto: ninguno. Sin cambios de configuración | Reevaluar si otro contenedor comparte el espacio de red de `db` (`network_mode: service:db`) |
| TK-00.6 (paso 8, I-3) | **Limitación informativa del MVP**, componente Nginx (proxy `/api/`). Nginx resuelve la IP de `backend` al arrancar: si el backend se recrea con otra IP, la API responde 502 hasta reiniciar Nginx. Justificación: solo disponibilidad, dentro de la limitación de errores HTML de Nginx (#9); no se añade descubrimiento dinámico ni recuperación automática. Impacto: reiniciar Nginx tras recrear el backend | Reevaluar si se recrea el backend sin reiniciar Nginx en el flujo documentado |
| TK-00.6 (D18) | Validación de integración final de C2 y RNF-05 desde la interfaz (QA-00.6-D18): es el único escenario que puede declararlos cumplidos. Ejecutable cuando estén en `Hecho` TK-00.4, TK-01.1, TK-01.2, TK-03.1, TK-03.3, TK-06.2 y TK-06.4. Ningún ticket existente reúne todas las dependencias; el ticket de validación final está pendiente de autorización (no creado) | Ticket de validación final (pendiente de autorización) |
| TK-00.6 (diferidos) | Escenarios diferidos de `docs/qa/TK-00.6-matrix.md`, sección B, a verificar en su ticket: TK-00.7 D22–D23; TK-01.1 D07; TK-01.2 D24. D18 en la fila anterior. Los de TK-00.3 (D01–D06 y D08–D10) quedaron verificados por QA en TK-00.3 (QA-00.3-43 a 55). Los de TK-00.4 (D11–D17 y D19) quedaron verificados por QA en TK-00.4 (2026-11-24, proyecto aislado `medsupply-tk004-qa`; D16(a) por pruebas automáticas). Los de TK-00.5 (D20 y D21) quedaron verificados por QA en TK-00.5 (D20: QA-00.5-01, 02 y 14 con `npm run test:db`; D21: QA-00.5-38, también con la entrega levantada en 8080) | TK-00.7, TK-01.1 y TK-01.2 |
| TK-00.5 (DoD 2, excepción) | **Excepción aprobada por el usuario en la puerta 1 (2026-11-20, decisión D-1), limitada a TK-00.5; no es cumplimiento íntegro del criterio 2 ni modifica la DoD general.** TK-00.7 (CI) depende de TK-00.5, así que la CI no puede existir dentro de este ticket. TK-00.5 aporta evidencia local, contra PostgreSQL 16, de sus suites, de lint y de typecheck de backend y frontend, y no implementa ni configura CI. TK-00.7 debe ejecutar en CI: (1) `npm test` del backend (suite unitaria, incluidos los tests existentes); (2) `npm run test:db` del backend (suite de integración contra PostgreSQL); (3) `npm test` del frontend (suite unitaria); (4) `npm run test:e2e` (E2E con Chromium); (5) lint y (6) typecheck de backend y frontend. El requisito de CI no se declara cumplido en TK-00.5 | TK-00.7 (CI) |
| TK-00.5 (escenario 35) | **Limitación aceptada, cumplimiento parcial** (puerta 2, 2026-11-20). Con `reuseExistingServer: false`, si un servicio que responde HTTP ocupa 3100 o 5174, `test:e2e` falla en seguida; si lo ocupa un listener que acepta conexiones sin responder HTTP, la comprobación previa de Playwright 1.64.1 puede bloquearse más allá del `timeout` del `webServer`. Documentado en el README (§6) | Reevaluar si cambia la versión de Playwright o la forma de arrancar los servidores de E2E |
| TK-00.5 (O-4) | **Informativo.** Playwright ejecuta los E2E con 2 workers sobre la `medsupply_test` compartida. Hoy los E2E no escriben en la base | Revisar cuando existan E2E que escriban en la base (por ejemplo, TK-01.2 o los flujos de pedidos) |
| TK-02.4 (DoD 2, excepción) | **Excepción aprobada por el usuario (2026-11-20), limitada a TK-02.4; no es cumplimiento íntegro del criterio 2 ni modifica la DoD general.** Evidencia local de `npm test`, `npm run test:db` (contra PostgreSQL 16), lint, typecheck, build y el E2E existente; su ejecución en CI corresponde a TK-00.7. El requisito de CI no se declara cumplido en TK-02.4 | TK-00.7 (CI) |
| TK-02.4 (D-C, `db:generate`) | Desde TK-02.4, `src/` importa el cliente generado de Prisma (`src/generated`, no versionado): `npm run db:generate` es precondición de lint, typecheck, build y tests del backend, y del `test:e2e` del frontend (su `webServer` compila el backend). La CI debe ejecutarlo tras `npm ci` y antes de esos pasos. El Dockerfile ya lo hace. Además, desde TK-02.4 el script `test:db` usa `--experimental-vm-modules` (el cliente generado carga su motor con `import()` dinámico dentro de Jest): la CI debe ejecutar `npm run test:db` tal cual, con Node 26 | TK-00.7 (CI) |
| TK-02.4 (seguridad, longitud) | **Informativo** (revisión de seguridad de TK-02.4, 2026-11-24). `normalizePhone` no limita la longitud en la ruta internacional (spec 05 §6, sin límites E.164). El contrato ya define `maxLength: 30` para `phone` en `startChatSession`: validarlo con Zod antes de llamar a `identifyCustomerByPhone`, para acotar la entrada pública | TK-05.1 |
| TK-02.4 (seguridad, errores) | **Informativo** (revisión de seguridad de TK-02.4, 2026-11-24). Los errores de Prisma que propaga `identifyCustomerByPhone` pueden incluir los argumentos de la consulta (el teléfono). Hoy nada los registra; si se añade logging, no volcar `err.message` de Prisma ni el teléfono (RNF-08). Relacionado con la política de logging de TK-01.1 | TK-05.1 y TK-01.1 |
| TK-00.4 (DoD 2, excepción) | **Excepción aprobada por el usuario (2026-11-24), limitada a TK-00.4; no es cumplimiento íntegro del criterio 2 ni modifica la DoD general.** Evidencia local de `npm test`, `npm run test:db` (PostgreSQL 16), lint, typecheck, build y E2E; su ejecución en CI corresponde a TK-00.7 | TK-00.7 (CI) |
| TK-00.4 (auth adelantado) | TK-00.4 creó solo `backend/src/modules/auth/password.ts` (`BCRYPT_COST = 10`, `hashPassword()`, bcryptjs 3.0.3). TK-01.1 lo reutiliza y no redefine el costo; la verificación usa la misma biblioteca y el email se compara en minúsculas, igual que el seed. Nota de seguridad: bcrypt trunca a 72 bytes (informativo) | TK-01.1 |

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
