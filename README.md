# MedSupply AI

Plataforma de gestión y venta de insumos médicos para distribuidoras que atienden a clínicas y farmacias.

## 1. Ficha del proyecto

| | |
|---|---|
| **Nombre** | MedSupply AI |
| **Descripción** | Canal de ventas conversacional (simulador de WhatsApp) con validación de stock en tiempo real, y dashboard web para gestionar productos, stock, alertas y pedidos |
| **Tipo** | Proyecto final AIDEVS |
| **Autor** | Helyson Perdomo |
| **Repositorio** | https://github.com/Hely-son/Helyson-perdomo-proyecto-final |
| **Metodología** | Spec-Driven Development (SDD) asistido por Claude Code |

## 2. Descripción general del producto

### Objetivo

Evitar que las distribuidoras vendan insumos sin stock real y agilizar la atención a sus clientes B2B. El sistema valida las existencias durante la conversación, confirma los pedidos de forma segura aunque haya compras simultáneas y centraliza pedidos y alertas de stock en un dashboard.

### Características

- **Validación estricta de stock:** ningún pedido se confirma sin existencias, ni siquiera con compras simultáneas. La confirmación es atómica y vuelve a validar stock, disponibilidad y precio de cada producto.
- **Clientes B2B pre-registrados:** solo las clínicas y farmacias habilitadas pueden comprar, identificadas por su teléfono.
- **Bot determinista:** menú guiado, predecible y fácil de probar.
- **Trazabilidad:** productos y clientes no se borran, y cada pedido conserva el precio con el que se confirmó.

### Alcance del MVP

| Cliente B2B (chat) | Operador (dashboard) |
|---|---|
| Consultar el catálogo con precios y disponibilidad | Iniciar sesión |
| Armar un carrito de varios productos | Gestionar productos y ajustar su stock |
| Ajustar cantidades cuando no hay stock suficiente | Consultar alertas de stock crítico |
| Confirmar el pedido y recibir su número `MED-XXXXX` | Consultar pedidos, avanzar su estado y cancelarlos |
| Consultar el estado de sus pedidos | |

En el MVP los clientes se cargan por seed.

### Fuera del MVP (V2)

Documentado en el PRD, pero no se implementa en esta entrega:

- Gestión de clientes desde el dashboard.
- Cancelación de pedidos por el cliente desde el chat.
- Reclamos: registro por chat y resolución por el operador.
- Órdenes de reposición y su recepción.

El detalle normativo (alcance por fase, requisitos con ID, reglas de negocio, requisitos no funcionales y criterios de aceptación) está en el [PRD](docs/PRD.md).

## 3. Arquitectura tecnológica

Monolito modular cliente-servidor: una SPA React con el simulador de chat y el dashboard, y una API REST en Express sobre PostgreSQL.

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite, Ant Design, React Router |
| Backend | Node.js + Express + TypeScript, Zod |
| Datos | Prisma + PostgreSQL 16 en desarrollo, pruebas, CI y entrega |
| Autenticación | JWT + bcrypt |
| Contrato API | OpenAPI (`docs/openapi.yaml`) |
| Testing | Jest + Supertest (contra PostgreSQL real) · Playwright |
| Entorno y entrega | Docker Compose |
| CI | GitHub Actions |

Detalle y justificación en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 4. Documentación

| Entregable | Documento |
|---|---|
| Ficha y descripción general | Este README · [PRD](docs/PRD.md) |
| Requisitos, reglas y criterios (v1.3) | [docs/PRD.md](docs/PRD.md) |
| Arquitectura del sistema y stack | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Modelo de datos (diagrama ER con PK y FK) | [specs/01_data_models.spec.md](specs/01_data_models.spec.md) (aprobada v1.1) |
| Specs por módulo | [specs/02_inventory_system.spec.md](specs/02_inventory_system.spec.md) (aprobada v1.2) · [specs/03_conversational_bot.spec.md](specs/03_conversational_bot.spec.md) (aprobada v1.1) · [specs/04_orders_claims.spec.md](specs/04_orders_claims.spec.md) (aprobada v1.0) · [specs/05_operator_dashboard.spec.md](specs/05_operator_dashboard.spec.md) (aprobada v1.1: clientes, acceso del operador y dashboard; gestión de clientes en V2) |
| Contrato de la API | [docs/openapi.yaml](docs/openapi.yaml): OpenAPI 3.0.3 del MVP, contrato base aprobado para la Entrega 2, con aspectos provisionales pendientes de revisión (OBS-03 de la spec 03) |
| Historias de usuario y tickets | [backlog/](backlog/README.md): 7 historias y 42 tickets, 124 puntos. MVP: 31 tickets, 97 puntos. V2: 11 tickets, 27 puntos |
| Guía del agente (SDD) | [CLAUDE.md](CLAUDE.md) |

## 5. Estado

**Entrega 2 — Implementación en curso.** Existen el proyecto backend (`backend/`, TK-00.1) y el proyecto frontend (`frontend/`, TK-00.2). Existen los archivos de Docker Compose `docker-compose.yml` y `docker-compose.delivery.yml` (TK-00.6) y, en TK-00.3 (en curso), el esquema Prisma con su migración inicial, que el servicio `migrate` de la entrega aplica. Todavía no existe el pipeline de CI (TK-00.7). El PRD v1.3 está aprobado; la arquitectura, el modelo de datos y el backlog están alineados con él. El contrato `docs/openapi.yaml` (TK-00.8) es el contrato base aprobado para la Entrega 2, con aspectos provisionales pendientes de revisión documentados en OBS-03 de la spec 03. Las cinco specs están aprobadas: 01 (v1.1), 02 (v1.2), 03 (v1.1), 04 (v1.0) y 05 (v1.1). DP-04 de la spec 02 (resaltado de stock crítico cruzando `listProducts` con `listStockAlerts`) está resuelta en la spec 02 v1.2, y su presentación en el dashboard está documentada en la spec 05 v1.1. Las alineaciones de tickets OBS-03, OBS-04 y OBS-08 de la spec 05 están cerradas. Siguen vigentes las observaciones y limitaciones conocidas que documenta cada spec. Siguientes pasos: continuar implementando el backlog `MVP` en orden.

## 6. Instalación y ejecución

### Requisitos

- Docker con Docker Compose. Probado con Docker 29.7.2 y Compose v5.5.1.
- Solo para desarrollo en el host: Node 26.

### Configuración

```bash
cp .env.example .env
```

Rellenar en `.env` las variables obligatorias que indica [.env.example](.env.example): `POSTGRES_USER`, `POSTGRES_PASSWORD`, `APP_DB_USER`, `APP_DB_PASSWORD`, `JWT_SECRET` (al menos 32 bytes) y las del operador del seed: `SEED_OPERATOR_EMAIL`, `SEED_OPERATOR_PASSWORD` y `SEED_OPERATOR_NAME`. Para desarrollo en el host, también `DATABASE_URL` con el usuario y la contraseña de aplicación. Las dos contraseñas deben ser exclusivamente alfanuméricas y distintas entre sí. El archivo `.env` nunca se commitea.

### Entrega

```bash
docker compose -f docker-compose.delivery.yml up -d --build --wait
```

La aplicación queda en http://127.0.0.1:8080, accesible solo desde la misma máquina. El servicio `migrate` aplica las migraciones y el servicio `seed` (`node dist/seed/index.js`) carga el operador y los datos de ejemplo. El seed es idempotente: repetirlo no duplica ni modifica datos existentes. Si detecta un conflicto de datos termina con código distinto de 0 y el backend no arranca. En desarrollo se ejecuta con `cd backend && npm run db:seed` (Node 26; carga `../.env`).

En la entrega, la sesión del operador dura 8 horas y la del chat 30 minutos (valores por defecto). `JWT_EXPIRES_IN` y `CHAT_SESSION_TTL_MINUTES` no se transmiten al backend de entrega, así que cambiarlas en `.env` no altera esos valores; solo tienen efecto en desarrollo (backend en el host).

```bash
docker compose -f docker-compose.delivery.yml ps -a     # estado de los servicios
docker compose -f docker-compose.delivery.yml logs      # logs
docker compose -f docker-compose.delivery.yml down      # detener (conserva los datos)
docker compose -f docker-compose.delivery.yml down -v   # reiniciar desde cero: elimina los volúmenes y los datos
```

Si la inicialización de la base falla (por ejemplo, por una contraseña no alfanumérica), corregir `.env` y ejecutar `down -v` antes de volver a levantar: el script de inicialización solo se ejecuta con el volumen vacío.

Si una migración falla, `migrate` termina con error y el backend no arranca. En la entrega no hay datos que preservar: corregir la migración y ejecutar `down -v` (borra los datos) antes de volver a levantar. Esto vale solo para la entrega; en desarrollo `down -v` borraría también `medsupply` (ver "Migración fallida en desarrollo").

### Desarrollo

Compose levanta solo PostgreSQL en `127.0.0.1:5432`; backend y frontend corren en el host, cada uno en su propia terminal desde la raíz del repositorio.

```bash
docker compose up -d                      # PostgreSQL
cd backend && npm ci && npm run db:generate   # genera el cliente de Prisma: precondición de build, typecheck, npm test, test:db y del test:e2e del frontend (tras npm ci y tras cambiar el esquema)
cd backend && npm run db:migrate:deploy   # aplica las migraciones a la base medsupply (DATABASE_URL del .env)
cd backend && npm test                    # pruebas del backend (no requieren PostgreSQL)
cd backend && npm run test:db             # integración: recrea y migra medsupply_test al iniciar (db:migrate:test ya no es obligatorio)
cd frontend && npm test                   # pruebas unitarias (Jest ESM; el aviso experimental de Node es esperado)
cd frontend && node_modules/.bin/playwright install chromium   # una vez; requiere red y ~600 MB libres
cd frontend && npm run test:e2e           # E2E: levanta backend (3100) y Vite (5174) y abre Chromium
cd backend && npm run dev                 # API en http://localhost:3000
cd frontend && npm ci && npm run dev      # http://localhost:5173, proxy /api → backend
```

`test:db` se ejecuta con `node --experimental-vm-modules` (el aviso experimental de Node es esperado): el cliente generado de Prisma usa `import()` dinámico, que Jest solo admite con esa opción (TK-02.4).

**Orden de las pruebas.** Ejecutar en serie `cd backend && npm run test:db` y después `cd frontend && npm run test:e2e`; nunca a la vez, porque comparten `medsupply_test`. `test:e2e` no recrea ni migra la base: usa la que dejó `test:db`. Requisitos de `test:e2e`: PostgreSQL de desarrollo arriba, puertos 3100 y 5174 libres (no reutiliza servidores existentes; ver la limitación conocida más abajo) y `DATABASE_URL` en el entorno o en el `.env` de la raíz (`playwright.config.ts` la necesita siempre, también con `playwright test --list`). El backend de E2E se compila con `npm run build` y arranca con `node dist/server.js`; no toca la entrega (8080).

**Secreto JWT y operador de E2E (TK-01.2).** `playwright.config.ts` genera en cada ejecución un `JWT_SECRET` aleatorio de E2E y una contraseña aleatoria para el operador de E2E. Se crean una sola vez en el proceso principal; los workers los heredan por el entorno. El backend de E2E recibe ese `JWT_SECRET` por el entorno del `webServer`, que tiene prioridad sobre el `.env` cargado con `--env-file-if-exists`. Así no se usa el secreto de desarrollo. Antes de los workers, `e2e/global-setup.ts` ejecuta una vez `backend/tests/e2e-support/upsert-e2e-operator.ts` con el `tsx` del backend. Ese script crea o actualiza solo el operador ficticio `operador.e2e@medsupply.test` en `medsupply_test` y no ejecuta el seed general. Comprueba antes de conectarse que la base destino sea exactamente `medsupply_test`; si no lo es, termina con error sin escribir nada. Ningún valor se imprime, se guarda en disco ni se pasa por la línea de comandos. Si `.env` define `JWT_SECRET`, `e2e/jwt-secret-isolation.spec.ts` comprueba que el backend de E2E rechaza los tokens firmados con él. El script no se incluye en `dist/` ni en la imagen.

**Limitación conocida (escenario 35, Playwright 1.64.1).** `reuseExistingServer: false` impide reutilizar un servidor ya existente en 3100 o 5174. Si el puerto lo ocupa un servicio que responde HTTP, `test:e2e` falla en seguida con "is already used". Si lo ocupa un listener que acepta conexiones pero no responde HTTP, la comprobación previa de Playwright puede quedarse bloqueada más allá del `timeout` del `webServer`; en ese caso hay que interrumpir la ejecución y liberar el puerto. No es un cumplimiento completo de "falla si los puertos están ocupados".

```bash
docker compose ps        # estado
docker compose down      # detener (conserva los datos)
docker compose down -v   # reiniciar desde cero: elimina los volúmenes y los datos
```

#### Migración fallida en desarrollo

Las migraciones van envueltas en `BEGIN;`/`COMMIT;`, así que una migración fallida se revierte entera, pero Prisma deja su fila en `_prisma_migrations` sin terminar y los siguientes `migrate deploy` fallan con P3009.

**Leer bien el error.** Tras un fallo, PostgreSQL responde `current transaction is aborted, commands ignored until end of transaction block` a las sentencias siguientes, y Prisma puede mostrar ese mensaje en lugar de la causa. Es un error secundario: la salida de `migrate` puede mostrar solo ese mensaje. La causa original (por ejemplo, `relation "…" does not exist`) se busca en los logs de PostgreSQL (desarrollo: `docker compose logs db`; entrega: `docker compose -f docker-compose.delivery.yml logs db`), sin decidir por el último mensaje. Antes de reintentar, revisar `migrate status` (abajo) y el estado real de la base.

**`medsupply_test` (base exclusiva de pruebas, se puede vaciar).** Pasos: (1) conectar a `medsupply_test` con el rol de aplicación; (2) comprobar que `current_database()` es exactamente `medsupply_test` y abortar si no; (3) `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` en esa misma conexión; (4) `npm run db:migrate:test` desde `backend/`. Comando propuesto para los pasos 1 a 3, desde la raíz con el Compose de desarrollo levantado (el rol de aplicación entra por el socket local del contenedor):

```bash
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$APP_DB_USER" -d medsupply_test' <<'SQL'
SELECT current_database() = 'medsupply_test' AS ok \gset
\if :ok
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
\else
SELECT 1/0; -- no es medsupply_test: aborta con error sin tocar nada
\endif
SQL
```

Nunca usar `down -v` para este caso. Este comando fue ejecutado y validado por QA en una instancia PostgreSQL desechable y aislada, incluida la comprobación negativa del guard contra otras bases de esa instancia (aborta sin tocarlas).

**`medsupply` (desarrollo).** No se elimina como recuperación rutinaria ni se recomienda `down -v`: se perderían sus datos. Una migración fallida allí requiere un procedimiento separado: inspeccionar `migrate status` y el estado real de la base antes de decidir, y preservar sus datos.

**`migrate status` y `migrate resolve`.** No tienen script de npm; se ejecutan desde `backend/` con el binario local (nunca `npx`) y apuntan a la `DATABASE_URL` del `.env`, es decir, a `medsupply`:

```bash
node_modules/.bin/prisma migrate status
node_modules/.bin/prisma migrate resolve --rolled-back <migración>
node_modules/.bin/prisma migrate resolve --applied <migración>
```

- `--rolled-back`: cuando la migración fallida no dejó cambios (con `BEGIN`/`COMMIT` se revierte entera; confirmarlo en la base) y se quiere reintentar tras corregirla.
- `--applied`: solo si se verificó que todos sus cambios quedaron aplicados aunque Prisma no la registrara como exitosa.
- Ninguno sin inspeccionar antes la base y `migrate status`. No son una solución automática para cualquier P3009.
- Para `medsupply_test` habría que pasar la URL de pruebas como `DATABASE_URL`; no hay forma verificada y sencilla de hacerlo, así que el camino para esa base es el vaciado de arriba.

`prisma migrate status` se ejecutó y confirmó que la migración está aplicada. `prisma migrate resolve` no se ha ejecutado: sus instrucciones siguen condicionadas a inspeccionar antes el estado real de la base.

Detalle de los entornos en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
