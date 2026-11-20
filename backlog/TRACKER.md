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
| TK-00.1 (paso 2, SEC-02) | `npm audit`: 18 avisos moderados, solo en dependencias de desarrollo (transitivas de `glob` y `minimatch`). `npm audit --omit=dev`: 0 vulnerabilidades. **Riesgo aceptado temporalmente** por el usuario (puerta 2, 2026-11-19). No degradar Jest ni modificar dependencias por este motivo. Desde TK-00.3 (2026-11-20) los mismos 18 moderados viajan también en la imagen `medsupply-migrate:delivery` (no en la del backend); aceptado por el usuario (decisión 10 de TK-00.3), con el detalle en `backlog/00_habilitadores.md`, TK-00.3 | Cuando exista una versión corregida compatible con las versiones aprobadas |
| TK-00.1 (paso 2) | npm bloqueó los scripts de instalación de `esbuild` y `@parcel/watcher` por no estar aprobados; `tsx` funciona en local. Parte Docker resuelta en TK-00.6: las imágenes instalan con `npm ci --ignore-scripts` y los builds pasan (QA-00.6-34) | TK-00.7 (CI) |
| TK-00.2 (versiones, R5) | npm bloquea el script de instalación de `fsevents@2.3.3` (opcional de Vite, solo macOS). **No aprobado** por decisión del usuario: el binario ya viene compilado y funciona sin él. Una primera instalación sin lockfile no instala `fsevents` y el vigilante de Vite pasa a polling en macOS; con `npm ci` y lockfile se instala. En Linux no se instala. Parte Docker resuelta en TK-00.6: en las imágenes Linux no se instala y se usa `npm ci --ignore-scripts` (QA-00.6-34) | TK-00.7 (CI) |
| TK-00.2 (DoD 2 y 3, excepción D3/OBS-03) | **Excepción aprobada por el usuario, no cumplimiento:** TK-00.2 no tiene tests de unidad ni de integración del frontend ni criterios automatizados (no se incorpora ningún runner en este ticket). Escribirlos cuando exista el runner del frontend | TK-00.5 |
| TK-00.2 (DoD 2, excepción de CI) | **Excepción aprobada por el usuario, limitada a TK-00.2 y distinta de la anterior:** lint y typecheck del frontend pasan en local, pero no se ejecutan en CI porque la CI aún no existe. TK-00.7 debe ejecutar en CI lint y typecheck del frontend y del backend, junto con las demás comprobaciones del backend | TK-00.7 |
| TK-00.2 (QA, ESC-40) | Cobertura parcial: solo la navegación y el menú (Inicio, Productos, Pedidos y Cerrar sesión deshabilitado), verificados a mano. Pendiente: sesión iniciada y cierre de sesión real (TK-01.2); prueba E2E (TK-00.5). No está completamente satisfecho | TK-01.2 y TK-00.5 |
| TK-00.2 (QA, ESC-45) | Cobertura parcial: ausencia de rutas y menús `V2` verificada por inspección del código y del build. Pendiente: prueba de unidad automatizada. No está completamente satisfecho | TK-00.5 |
| TK-00.2 (QA, ESC-49) | Cobertura parcial: solo la parte (a), provisional (`/` y las rutas desconocidas o `V2` redirigen a `/dashboard` sin bucles). Pendiente: la parte (b), sin sesión → `/login` (TK-01.2), y la prueba automatizada (TK-00.5). No está completamente satisfecho | TK-01.2 y TK-00.5 |
| TK-00.2 (QA-00.2-14) | El valor por defecto `/api/v1` se verificó con un build aislado del cliente HTTP, porque ninguna pantalla lo importa y Vite lo elimina del bundle (método alternativo aprobado). Volver a verificarlo en el build de la app cuando alguna pantalla use el cliente HTTP. Reasignado a TK-01.2, primer ticket que importa el cliente HTTP (decisión Q5 de TK-00.6; escenario diferido QA-00.6-D24) | TK-01.2 |
| TK-00.1 (paso 4) | Express responde automáticamente a `OPTIONS` con 200 `text/plain` y la cabecera `Allow`, en lugar del 404 JSON aprobado para métodos no declarados. Aceptado como limitación (alternativa a). Definir explícitamente el comportamiento y sus pruebas al diseñar CORS | Diseño de CORS (sin ticket asignado) |
| TK-00.1 (paso 4) | Los errores 500 no se registran en ningún log (sin logging en TK-00.1 por decisión del usuario). Definir una política de logging que proteja credenciales, datos de conexión y demás información sensible (RNF-08). Reasignado de TK-00.3 a TK-01.1 en la puerta 1 de TK-00.3 (2026-11-20). Nota de TK-00.3: con el adaptador `pg`, el `detail` de los errores de PostgreSQL incluye la fila completa que falló (`Failing row contains (...)`); no debe llegar a logs ni respuestas. Nota de seguridad de TK-00.3 (I-2, 2026-11-20): en los logs del servidor PostgreSQL, las líneas `DETAIL` de las violaciones de restricciones incluyen valores de claves y filas completas (`Key (email)=(…)`, `Key (phone)=(…)`, `Key (tax_id)=(…)`, `Failing row contains (…)`); con datos reales llegarían email, teléfono y RUT, y una violación `NOT NULL` en `users` incluiría `password_hash`. Hoy solo los ve quien accede a `docker logs` (mismo nivel de confianza que la base) y el MVP no tiene datos reales. La política de logging debe cubrir también los logs del servidor | TK-01.1 |
| TK-00.1 (paso 6, SEC-03) | Si el puerto está ocupado, `listen()` termina con código 1 y muestra el stack en stderr. Tratarlo dentro de la política de logging y manejo controlado de errores operacionales, sin exponer stacks ni información sensible innecesaria. Reasignado de TK-00.3 a TK-01.1 en la puerta 1 de TK-00.3 (2026-11-20) | TK-01.1 |
| TK-00.1 (paso 3) | El helper de pruebas `backend/tests/helpers/error-response.ts` lee el enum `ErrorCode` de `docs/openapi.yaml`: los tests del backend necesitan `docs/` disponible. En Docker no aplica: las imágenes no ejecutan tests (TK-00.6) | TK-00.7 (CI) |
| TK-00.3 (seguridad, I-4) | **Informativo** (revisión de seguridad de TK-00.3, 2026-11-20). `resetDatabase(client: Queryable)` en `backend/tests/db/helpers/test-database.ts`: si recibe un `Pool`, la comprobación de `current_database()` y el `TRUNCATE` podrían ejecutarse por conexiones distintas, aunque todas apunten a la misma base. Considerar un cliente dedicado para el reset al configurar la suite | TK-00.5 |
| TK-00.3 (seguridad, I-6) | **Informativo** (revisión de seguridad de TK-00.3, 2026-11-20). El motor de migraciones de Prisma (schema-engine) se descarga en el build desde el CDN de Prisma, que verifica su checksum, pero no queda fijado en el lockfile, y la imagen `medsupply-migrate:delivery` depende de la arquitectura de la máquina de build (verificada en arm64; amd64 sin probar). Tenerlo en cuenta en la CI | TK-00.7 |
| TK-00.3 (incidencia Docker, 2026-11-20) | La coordinadora ejecutó `docker image prune -f --filter dangling=true` tras reconstruir las imágenes de MedSupply. Ese comando elimina todas las imágenes sin etiqueta del sistema y pudo borrar imágenes intermedias de otros proyectos; no se puede deshacer y no se intentará recuperarlas. Contenedores y volúmenes ajenos no se vieron afectados. Regla desde entonces: sin limpiezas globales de Docker (`image prune`, `system prune`); solo se manipulan recursos identificados de MedSupply AI | Toda tarea con Docker |
| TK-00.3 (DoD 2, excepción) | **Excepción aprobada por el usuario (2026-11-20), limitada a TK-00.3; no es cumplimiento íntegro del criterio 2 ni modifica la DoD general.** Las pruebas de base de datos se ejecutan en local contra PostgreSQL 16 (`npm run test:db`) con evidencia; su ejecución en CI queda para TK-00.7 (decisión 5 de la puerta 1) | TK-00.7 (CI) |
| TK-00.6 (DoD 2, excepción) | **Excepción aprobada por el usuario (2026-11-20), limitada a TK-00.6; no es cumplimiento íntegro del criterio 2 ni modifica la DoD general.** Criterio: tests escritos antes y pasando contra PostgreSQL, más lint y typecheck, también en CI. No se exigen pruebas automatizadas nuevas para este ticket de infraestructura: la evidencia equivalente son los 48 escenarios de `docs/qa/TK-00.6-matrix.md`, definidos antes de implementar y ejecutados por QA independiente (48 PASS). Lint y typecheck de backend y frontend pasan en local (QA) y los 72 tests existentes del backend siguen pasando. Las pruebas de integración contra PostgreSQL quedan para los tickets que implementen esa integración; lint, typecheck y build en CI, para TK-00.7 | TK-00.7 (CI) y tickets que integren PostgreSQL |
| TK-00.6 (paso 8, I-2) | **Riesgo aceptado del MVP (no resuelto)**, vinculado a TK-00.1. En desarrollo, `npm run dev` deja el backend escuchando en todas las interfaces (`*:3000`; `server.ts` llama a `listen(port)` sin host). Justificación: comportamiento del servidor de desarrollo existente; el Compose de desarrollo no publica el backend y en entrega el backend no publica puertos. Impacto: la exposición efectiva depende de la red y del firewall del equipo; hoy solo hay `/health` | Reevaluar si cambia la exposición del backend de desarrollo o se usa en un entorno compartido |
| TK-00.6 (paso 8, I-4) | **Riesgo condicionado aceptado del MVP (no resuelto)**, componente `frontend/nginx.conf` (proxy `/api/`). `X-Forwarded-For` puede contener valores enviados por el cliente. Justificación: el backend no usa ese valor para autorización, identificación ni seguridad (sin `trust proxy`). Impacto: ninguno hoy | Reevaluar si una funcionalidad usa la IP del cliente como dato de confianza (configuración del proxy y forma de obtener la IP) |
| TK-00.6 (paso 8, I-5) | **Riesgo condicionado aceptado del MVP (no resuelto)**, componente Nginx (log de acceso). El log registra las URL con sus parámetros. Justificación: hoy no viajan datos sensibles en la URL (el token va en la cabecera). Impacto: ninguno hoy | Reevaluar si se incorporan tokens, teléfonos, credenciales u otros datos sensibles en URL |
| TK-00.6 (paso 8, D) | **Informativo, aceptado** (paso 8 y hallazgo 2 del paso 3), componente `db` (healthcheck). `pg_isready` y `psql` se conectan sin contraseña por `127.0.0.1` dentro del contenedor por el `pg_hba` de la imagen oficial; desde la red interna y desde el puerto publicado se exige contraseña. Justificación: solo lo usa quien ya tiene `docker exec`, que no gana privilegios. Impacto: ninguno. Sin cambios de configuración | Reevaluar si otro contenedor comparte el espacio de red de `db` (`network_mode: service:db`) |
| TK-00.6 (paso 8, I-3) | **Limitación informativa del MVP**, componente Nginx (proxy `/api/`). Nginx resuelve la IP de `backend` al arrancar: si el backend se recrea con otra IP, la API responde 502 hasta reiniciar Nginx. Justificación: solo disponibilidad, dentro de la limitación de errores HTML de Nginx (#9); no se añade descubrimiento dinámico ni recuperación automática. Impacto: reiniciar Nginx tras recrear el backend | Reevaluar si se recrea el backend sin reiniciar Nginx en el flujo documentado |
| TK-00.6 (aviso provisional) | `migrate` y `seed` de `docker-compose.delivery.yml` solo muestran un aviso fijo `PROVISIONAL:` y salen con 0 (D.2 #6). TK-00.3 y TK-00.4 deben reemplazar el comando completo por la operación real, sin ruta alternativa que vuelva en silencio al modo provisional; su DoD debe comprobar que el prefijo `PROVISIONAL:` ya no existe y que la operación real se ejecutó (QA-00.6-D04/D15 y D01–D03/D11). Parte de `migrate` resuelta en TK-00.3: comando real `prisma migrate deploy` sin aviso `PROVISIONAL:` y migración ejecutada (QA-00.3-43 y 45); queda `seed` | TK-00.4 (seed) |
| TK-00.6 (R-04) | Decidir qué imagen o etapa ejecutará las migraciones y el seed reales (CLI de Prisma, `prisma generate` explícito con `--ignore-scripts`, seed en TypeScript sin `tsx` en la imagen final). La estructura multi-etapa de TK-00.6 no lo impide (QA-00.6-D08). Decidido en la puerta 1 de TK-00.3: target propio derivado de la etapa de build, sin CLI en la imagen final (decisión 3 del ticket). Implementado en TK-00.3 para `migrate` (target `migrate`, CLI y motor solo en esa imagen; QA-00.3-54); queda decidir cómo ejecuta el seed | TK-00.4 (seed) |
| TK-00.6 (D18) | Validación de integración final de C2 y RNF-05 desde la interfaz (QA-00.6-D18): es el único escenario que puede declararlos cumplidos. Ejecutable cuando estén en `Hecho` TK-00.4, TK-01.1, TK-01.2, TK-03.1, TK-03.3, TK-06.2 y TK-06.4. Ningún ticket existente reúne todas las dependencias; el ticket de validación final está pendiente de autorización (no creado) | Ticket de validación final (pendiente de autorización) |
| TK-00.6 (diferidos) | Escenarios diferidos de `docs/qa/TK-00.6-matrix.md`, sección B, a verificar en su ticket: TK-00.4 D11–D17 y D19; TK-00.5 D20–D21; TK-00.7 D22–D23; TK-01.1 D07; TK-01.2 D24. D18 en la fila anterior. Los de TK-00.3 (D01–D06 y D08–D10) quedaron verificados por QA en TK-00.3 (QA-00.3-43 a 55) | TK-00.4, TK-00.5, TK-00.7, TK-01.1 y TK-01.2 |

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
