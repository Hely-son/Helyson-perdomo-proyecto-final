# Spec 05 — Operador: clientes, acceso y pantallas

| Estado | Cubre | Tickets |
|---|---|---|
| Aprobada v1.1 (Entrega 2). Fecha de aprobación: 2026-11-18. Historial: v1.0 aprobada el 2026-11-18 (DP-01..DP-09, ESC-01..ESC-51); v1.1 incorpora el resaltado de stock crítico según DP-04 de la spec 02, resuelta en la spec 02 v1.2, con ESC-52..ESC-55, y añade ESC-56 (validación local del teléfono en el simulador) y ESC-57 (acciones sobre productos inactivos, según DP-01 y DP-02 de la spec 02 v1.2). Las alineaciones de backlog OBS-03, OBS-04 y OBS-08 están cerradas (TK-02.4, TK-00.4 y TK-01.2). Alcance: clientes (§1 a §14), acceso del operador (§15) y estructura y comportamiento transversal del dashboard (§16) | Clientes `MVP`: CL-02, CL-03, RN-12 · Acceso `MVP`: AU-01, AU-02, AU-03, RNF-08 · Criterios: CA-06, CA-11 · `V2`: CL-01, RN-10 (clientes) | Clientes `MVP`: TK-02.4 · Acceso `MVP`: TK-01.1, TK-01.2, TK-01.3 · relacionados: TK-00.1, TK-00.2, TK-00.3, TK-00.4, TK-05.1, TK-03.3, TK-04.3, TK-06.4 · `V2`: TK-02.1, TK-02.2, TK-02.3 |

**Fuentes.** [PRD](../docs/PRD.md) v1.2 · [ARCHITECTURE](../docs/ARCHITECTURE.md) · [`docs/openapi.yaml`](../docs/openapi.yaml) `info.version` 1.0.0 · [spec 01](01_data_models.spec.md) Aprobada v1.1 · [spec 02](02_inventory_system.spec.md) Aprobada v1.2 (v1.1 aprobada) · [spec 03](03_conversational_bot.spec.md) Aprobada v1.1 · [spec 04](04_orders_claims.spec.md) Aprobada v1.0 · [backlog](../backlog/README.md) US-01 a US-07.

**Asignación de este archivo.** `CLAUDE.md` y ARCHITECTURE ("Módulos") asignan a la spec 05 los módulos `customers` y `auth` y las pantallas del operador. Esta versión cubre los tres: el dominio de clientes (§1 a §14), el acceso del operador (§15) y la estructura compartida y el comportamiento transversal del dashboard (§16). Las reglas de negocio de las pantallas de inventario y de pedidos siguen en las specs 02 y 04.

Esta spec define **la normalización de teléfonos, la identificación y la consulta interna de clientes** (`customers.service`), **el acceso del operador** (módulo `auth`) y **la estructura compartida del dashboard**. No repite:

- la tabla `customers`, sus restricciones e índices: ver spec 01;
- qué responde el chat ante un cliente identificado o no, la sesión y su expiración: ver spec 03;
- pedidos y su relación con el cliente: ver spec 04;
- reglas de inventario, alertas y pedidos que se muestran en el dashboard: ver specs 02 y 04;
- payloads y status HTTP: ver `docs/openapi.yaml`.

Las reglas `RN-` se aplican solo en `customers.service` (RNF-07). Los identificadores `ESC-`, `D-`, `DP-` y `OBS-` son **locales de esta spec**; los de otras specs se citan con su spec.

## 1. Objetivo

Que solo las clínicas y farmacias registradas y activas puedan comprar por chat, reconociéndolas por su teléfono **sin importar cómo lo escriban**, y que el seed y el chat lleguen siempre al mismo valor normalizado para el mismo número (US-02 `MVP`, CL-03, RN-12).

Que solo personal autorizado gestione la operación desde el dashboard, con una sesión que expira y un comportamiento uniforme de las pantallas ante errores y sesión vencida (US-01, AU-01..AU-03, CA-11, RNF-08).

## 2. Alcance

### 2.1 Incluido en el MVP

| Capacidad | Requisitos | Sección |
|---|---|---|
| Normalización de teléfonos, única para seed, chat y cualquier consulta interna | RN-12 | §6 |
| Identificación de un cliente por coincidencia exacta del teléfono normalizado, indicando si existe y si está activo | CL-03 | §7 |
| Tratamiento de cliente inactivo como no registrado en el chat | CL-02 | §8 |
| Carga de clientes (activos e inactivos) exclusivamente por seed | PRD §10, spec 01 "Seed" | §7.3 |
| Unicidad del teléfono normalizado | spec 01 | §10 |
| Acceso del operador con email y contraseña; JWT con expiración configurable (8 horas por defecto); cierre de sesión en el cliente | AU-01, AU-02, AU-03, RNF-08 | §15 |
| Protección de rutas y operaciones; redirección a `/login` sin sesión o con la sesión expirada | AU-01, CA-11 | §15.5, §15.6 |
| Login, estructura compartida del dashboard y comportamiento transversal de las pantallas `MVP` | AU-01, CA-11 | §16 |

En el MVP **no existen endpoints HTTP de clientes** (ARCHITECTURE, "Módulos": `customers` "`MVP` solo consulta… Sin endpoints HTTP en el MVP"). La única operación HTTP que usa esta capacidad es `startChatSession` (§8).

### 2.2 Diferido a V2 (no implementable en el MVP)

| Capacidad | IDs | Tickets |
|---|---|---|
| Crear, editar y desactivar clientes desde el dashboard (razón social, documento tributario, teléfono) | CL-01, RN-10 (clientes) | TK-02.1, TK-02.2, TK-02.3 |
| Endpoints `GET/POST /customers`, `GET/PATCH /customers/:id`, `POST /customers/:id/deactivate` | CL-01 (ARCHITECTURE, "API") | TK-02.1 |
| Pantalla `/dashboard/customers` | CL-01 | TK-02.2 |
| Pantallas `/dashboard/claims` y `/dashboard/purchase-orders` (especificadas en las specs 04 y 02) | RE-01, RE-02, RP-01..RP-03 | TK-07.4, TK-04.4 |

Ver §14.3 y §16.7.

### 2.3 Fuera del producto o de esta spec

- Validación exhaustiva del plan de numeración de SUBTEL, de códigos de área y de números especiales 600 y 800 (RN-12, "Alcance").
- Verificación de existencia, titularidad o asignación oficial del número, y de la identidad del cliente mediante terceros (RN-12; ARCHITECTURE, "Limitaciones conocidas").
- Normalización o validación del RUT (`tax_id`): sin reglas en el PRD; en el MVP solo lo carga el seed (spec 01, "Puntos abiertos").
- Mensajes del chat y creación de la sesión: spec 03.
- Gestión de operadores desde la UI, roles adicionales, permisos granulares, *refresh token*, endpoint de logout y revocación de tokens (PRD §4.3; AU-02; contrato).
- Diseño visual detallado de las pantallas.

## 3. Actores y responsabilidades

| Actor / componente | Responsabilidad | No hace |
|---|---|---|
| **Cliente B2B** | Escribe su teléfono en el simulador (CH-01) | — |
| **Seed** (TK-00.4) | Carga los clientes aplicando la normalización de esta spec | No usa otra normalización (D-01) |
| **`customers.service`** (TK-02.4) | Normaliza (§6) e identifica (§7). Es la única implementación de RN-12 | No crea ni modifica clientes en el MVP; no conoce HTTP ni la sesión |
| **Chat FSM** (spec 03) | Llama a la identificación en `startChatSession` y decide la respuesta: menú o mensaje de CH-02 | No normaliza teléfonos ni consulta Prisma |
| **`orders.service`** (spec 04) | Usa el cliente fijado en la sesión para crear y consultar pedidos | No revalida el estado del cliente en el MVP (OBS-04 de la spec 04) |
| **PostgreSQL** | Garantiza la unicidad del teléfono normalizado y el formato `^\+[0-9]+$` (spec 01) | — |
| **Operador** (AU-02) | Inicia y cierra sesión; usa las pantallas `MVP` del dashboard | No gestiona clientes ni operadores en el MVP |
| **Módulo `auth`** (TK-01.1) | `login`: valida credenciales y emite el JWT; middleware que exige el token en las operaciones de operador | No define roles ni revoca tokens |
| **Frontend del dashboard** (TK-01.2; rutas y cliente API de TK-00.2) | Login, protección de rutas, layout, navegación y estados transversales (§16) | No aplica reglas `RN-` (RNF-07; ARCHITECTURE) |

## 4. Modelo conceptual de clientes

Lo define la spec 01 (`Customer` → `customers`). Papel de cada atributo en esta spec:

| Atributo | Uso en el dominio |
|---|---|
| `id` | Identidad del cliente que la sesión fija y los pedidos referencian (`orders.customer_id`, `Restrict`) |
| `businessName` | Se muestra en el saludo del chat (spec 03) y en los pedidos (spec 04) |
| `taxId` | Único; sin uso en la identificación del MVP |
| `phone` | Clave de identificación: se guarda **ya normalizado**, es **único** y cumple `^\+[0-9]+$` |
| `isActive` | Distingue cliente activo de inactivo (CL-02); en el MVP solo lo fija el seed |

Relación: un cliente tiene cero o más pedidos (spec 01). Un cliente nunca se borra (RN-10). En el MVP no hay columnas adicionales ni se necesitan: ninguna capacidad de esta spec requiere datos que el modelo aprobado no tenga.

## 5. Reglas de negocio

### 5.1 Reglas del PRD

| Regla | Fase | Aplicación |
|---|---|---|
| **RN-12** | `MVP` | Normalización de §6, aplicada igual al seed y al chat; identificación por coincidencia del teléfono normalizado. Sin validar existencia, titularidad ni plan de numeración |
| **CL-03** | `MVP` | Consulta reutilizable que normaliza, identifica y dice si el cliente existe y si está activo (§7). No depende de CL-01 |
| **CL-02** | `MVP` | Un cliente inactivo se trata como no registrado en el chat (la respuesta la define la spec 03) |
| **CH-02** | `MVP` | Si el teléfono no pertenece a un cliente activo, el chat no muestra el menú (spec 03 F-1) |
| **RN-10** | `MVP` / `V2` | Los clientes no se borran. En el MVP los inactivos provienen del seed; la desactivación desde el dashboard es `V2` (CL-01) |

### 5.2 Decisiones de diseño de esta spec

Propuestas; quedan aprobadas solo si se aprueba esta spec. Ninguna cambia RN-12.

| ID | Decisión | Base |
|---|---|---|
| D-01 | **Una sola normalización.** Existe una única función de normalización, en el módulo `customers`, usada por el seed, por la identificación del chat y por cualquier operación interna que use el teléfono como clave. Ningún otro módulo normaliza teléfonos | RN-12 ("la misma normalización"); TK-02.4 ("la misma función que usan el seed y el chat"); spec 01 |
| D-02 | **Formato de salida.** El resultado de una normalización válida es `+` seguido solo de dígitos, el mismo formato que exige el `CHECK` de la spec 01 | spec 01 (`phone ~ '^\+[0-9]+$'`) |
| D-03 | **Función pura.** La normalización no accede a la base ni depende de qué clientes existen: el mismo texto produce siempre el mismo resultado | RN-12 (formato consistente); CL-03 (reutilizable) |
| D-04 | **Resultado de la identificación.** La consulta de CL-03 devuelve uno de cuatro resultados: teléfono **inválido** (no normalizable), cliente **inexistente**, cliente **inactivo** o cliente **activo** (con sus datos). El resultado **inválido** incluye el motivo de la normalización (vacía, faltan *n* dígitos, sobran dígitos, formato no admitido). Con un teléfono inválido no se consulta la base | CL-03 ("indica si existe y si está activo"); RN-12 (entradas inválidas rechazadas) |
| D-05 | **Coincidencia exacta.** La búsqueda compara el valor normalizado por igualdad con `customers.phone`. Sin coincidencias parciales, por sufijo ni aproximadas | RN-12; spec 01 |
| D-06 | **Solo lectura en el MVP.** La identificación no crea, modifica ni reactiva clientes | ARCHITECTURE (`customers` solo consulta); PRD §10 (solo seed) |
| D-07 | **Dos códigos de 401.** `UNAUTHORIZED` en una operación protegida descarta el token y redirige a `/login`; `INVALID_CREDENTIALS` en `login` se muestra en la pantalla de login sin redirigir. Se distinguen por `code` (§15.6) | Contrato (dos códigos con el mismo status); TK-01.2; US-01 crit. 2 y 3 |
| D-08 | **Navegación solo `MVP`.** El layout muestra Inicio (alertas), Productos, Pedidos y Cerrar sesión, sin entradas `V2` (§16.2) | ARCHITECTURE "Frontend"; TK-00.2; US-01 crit. 5 |
| D-09 | **Clasificación de errores.** Autenticación, validación, recurso no encontrado, conflicto de negocio y error técnico se presentan de forma distinta, y solo `UNAUTHORIZED` cierra la sesión (§16.5) | Contrato (catálogo de códigos); specs 02 y 04 |

## 6. Normalización de teléfonos (RN-12)

### 6.1 Procedimiento

El MVP trabaja con clientes y teléfonos ficticios y controlados, con Chile como mercado predeterminado. Los pasos aplican RN-12 con las decisiones resueltas DP-01, DP-02 y DP-03 (§13) y se ejecutan en este orden.

1. **Vacío.** Una entrada vacía o formada solo por espacios es inválida (motivo: vacía) (RN-12; contrato `startChatSession`: "incluido uno formado solo por espacios").
2. **Separadores permitidos (DP-01).** Se eliminan, en cualquier posición, **exclusivamente**: espacio ASCII, guion `-`, punto `.` y paréntesis `(` `)`. No hay otros separadores.
3. **Caracteres restantes.** Tras el paso 2 solo pueden quedar dígitos y, **como primer carácter**, un `+`. Cualquier otro carácter (letras, `/`, otros signos o espacios distintos del ASCII) o un `+` en otra posición hace la entrada inválida (motivo: formato no admitido), porque no puede producir el formato de D-02. No se hace un tratamiento específico de cada variante Unicode: simplemente no está en la lista permitida.
4. **Prefijo internacional explícito (DP-02).** Si empieza por `+` y tiene al menos un dígito, se conserva tal cual: el resultado es `+` seguido de sus dígitos. No se antepone `+56` y no se aplican otras validaciones internacionales. Un `+` sin dígitos es inválido (motivo: formato no admitido).
5. **Número nacional (DP-02, DP-03).** Si no empieza por `+`, la entrada es un número nacional y debe tener **exactamente 9 dígitos**:
   - 9 dígitos: el resultado es `+56` seguido de esos dígitos;
   - menos de 9: inválido, indicando **cuántos dígitos faltan** (motivo: faltan *n* dígitos). No se completan dígitos;
   - más de 9: inválido, indicando que el número **tiene demasiados dígitos** para el formato nacional (motivo: sobran dígitos). No se antepone `+56` ni se infiere ningún código de país.
6. **Salida.** Si nada lo invalida, el resultado cumple D-02 (`+` seguido de dígitos).

No hay detección automática de códigos de país sin `+`: `56…`, `00…` u otro código escrito sin `+` se trata como entrada nacional y, si no tiene exactamente 9 dígitos, se rechaza. No se aplican límites de longitud de E.164 ni reglas de SUBTEL, códigos de área o números 600/800 (§2.3). La regla de 9 dígitos es el **formato nacional esperado en el MVP**, no una validación del plan de numeración. Cumplir estos pasos no demuestra que el número exista, esté asignado o pertenezca al cliente.

### 6.2 Ejemplos de entrada y salida

| Entrada | Resultado | Regla |
|---|---|---|
| `949076876` | `+56949076876` | Paso 5: 9 dígitos |
| `9 4907-6876` | `+56949076876` | Pasos 2 y 5 |
| `(9) 4907.6876` | `+56949076876` | Pasos 2 y 5 |
| `94907687` | Inválido: falta 1 dígito | Paso 5 |
| `9490768` | Inválido: faltan 2 dígitos | Paso 5 |
| `9490768765` | Inválido: sobran dígitos | Paso 5 |
| `56949076876` | Inválido: sobran dígitos (sin `+` no se reconoce el código de país) | Paso 5 |
| `0056949076876` | Inválido: sobran dígitos (`00` no es prefijo) | Paso 5 |
| `+56949076876` | `+56949076876` | Paso 4: se conserva, sin segundo `+56` |
| `+56 9 4907 6876` | `+56949076876` | Pasos 2 y 4 |
| `+14155552671` | `+14155552671` | Paso 4: prefijo internacional explícito |
| `+54 9 11 1234 5678` | `+5491112345678` | Pasos 2 y 4 |
| `""`, `"   "` | Inválido: vacía | Paso 1 |
| `abc`, `9/4907/6876`, `56+949076876`, `+` | Inválido: formato no admitido | Pasos 3 y 4 |

Propiedad derivada: todo resultado válido empieza por `+`, así que normalizarlo de nuevo lo deja igual (pasos 2 y 4). Por eso el seed puede repetirse sin producir valores distintos para el mismo número.

### 6.3 Interfaz y normalización compartida

Hay **dos niveles de validación** con responsabilidades distintas.

**A. Validación local del simulador (antes de llamar al backend).**

- El campo de teléfono presenta `+56` como **prefijo fijo** y el usuario introduce solo los **nueve dígitos** nacionales, con o sin separadores permitidos.
- Mensajes del campo:

  | Entrada en el campo | Mensaje |
  |---|---|
  | Vacía | Indica que debe ingresar el número |
  | 8 dígitos | `Falta 1 dígito` |
  | Menos de 9 dígitos | Cuántos dígitos faltan (por ejemplo, `Faltan 2 dígitos`) |
  | Más de 9 dígitos | Que sobran dígitos |

- En cualquiera de estos casos el simulador **no envía la solicitud** a `startChatSession` (ESC-56).
- Con nueve dígitos, envía solo esos dígitos y el backend antepone `+56`, así que el prefijo no se duplica.
- Estos mensajes pertenecen **exclusivamente** a la validación visual local del campo, como validación básica de formato que ARCHITECTURE permite al frontend ("valida formatos básicos para dar feedback rápido"). **No** son respuestas conversacionales del bot ni códigos de error HTTP.

**B. Validación del backend.**

- El backend **vuelve a validar y normalizar** todo teléfono recibido con la misma función que usa el seed (D-01). No confía solo en la validación del simulador.
- Si recibe directamente un teléfono inválido (por ejemplo, una llamada a la API que no pasa por el simulador), mantiene el comportamiento aprobado en la spec 03 (F-1) y en el contrato de `startChatSession`: la misma respuesta que para un cliente inexistente o inactivo, sin sesión.
- **No** expone al cliente el motivo del rechazo en la respuesta conversacional, ni amplía el contrato HTTP.
- La normalización conserva internamente el motivo (vacía, faltan *n* dígitos, sobran dígitos, formato no admitido) para uso de la aplicación, por ejemplo, para informar el registro afectado en el seed o en las pruebas (D-04).

**Normalización compartida.** El seed y el chat usan la misma función (D-01). Una entrada nacional de nueve dígitos produce el mismo resultado desde ambos, y una entrada que ya contiene `+56` no recibe un segundo prefijo.

**Límite conocido.** Una entrada con `+` explícito se conserva sin comprobar los nueve dígitos (§6.1, paso 4). Con el prefijo fijo del simulador, el cliente no escribe `+`; el `+` explícito aparece en los fixtures o en llamadas directas a la API, y un número así solo identifica a un cliente si coincide exactamente con un teléfono guardado.

## 7. Identificación y consulta interna (CL-03)

### 7.1 Procedimiento

1. Normalizar la entrada (§6). Si es inválida, el resultado es **inválido** y no se consulta la base (D-04).
2. Buscar el cliente con `phone` igual al valor normalizado (D-05). Por la unicidad del teléfono (spec 01), hay como máximo uno.
3. Sin coincidencia: **inexistente**.
4. Con coincidencia e `isActive = false`: **inactivo** (CL-02).
5. Con coincidencia e `isActive = true`: **activo**, con el cliente.

### 7.2 Consumidores

| Consumidor | Uso | Spec |
|---|---|---|
| `startChatSession` (vía `customers.service`) | Crear la sesión solo con un cliente activo | 03 F-1 |
| Seed | Cargar clientes con el teléfono normalizado y comprobar después que se encuentran | 01 "Seed"; TK-00.4 |
| Gestión de clientes (`V2`) | Normalizar el teléfono al crear o editar | §14.3 |

### 7.3 Clientes del seed

El seed carga 3 clientes activos y 1 inactivo (spec 01 "Seed") desde **fixtures ficticios, estáticos y definidos en el repositorio**. Es la única vía para registrar clientes en el MVP (PRD §10). No es un motor genérico de importación.

**Reglas del seed (DP-04, resuelta).**

1. Cada fixture representa un número nacional válido de **nueve dígitos**, escrito en alguno de los formatos que pide la spec 01 (con espacios, sin `+56`, con `+56`).
2. Todos los teléfonos se normalizan con la **misma función** que usa el chat (D-01).
3. Los fixtures tienen `tax_id` y teléfono normalizado **únicos entre sí**. Una colisión en los fixtures se corrige en el propio archivo de datos.
4. El `tax_id` se usa **solo** como identificador estable para reconocer registros del seed. No se valida su formato (sin reglas de RUT) ni se usa para identificar clientes en el chat, que solo usa el teléfono (§7.1).

| Caso | Situación | Comportamiento |
|---|---|---|
| A | Existe un cliente con el mismo `tax_id` y el mismo teléfono normalizado | Se reconoce el registro existente: no se duplica ni se modifica |
| B | Existe un cliente con el mismo `tax_id` y otro teléfono | Se informa el conflicto con el registro afectado y se detiene el procesamiento. No se sobrescribe el cliente |
| C | Otro `tax_id` ya usa el teléfono normalizado | La restricción `UNIQUE` de PostgreSQL impide el duplicado; el seed informa el error con el registro afectado y se detiene |
| D | Sin coincidencias | Se inserta el cliente con el teléfono normalizado |

**Ante un conflicto** (casos B y C), el seed informa el registro afectado y **detiene el procesamiento**. Las inserciones ya completadas pueden permanecer: no hay una transacción global especial para toda la carga. Una ejecución posterior con los fixtures corregidos las reconoce como caso A, sin duplicarlas.

**No incluye:** fusión de clientes ni reemplazo automático de registros, deduplicación por nombre, recuperación automática de conflictos, un mecanismo sofisticado de resolución de colisiones, ni validaciones exhaustivas de RUT o teléfonos. La restricción `UNIQUE` de PostgreSQL sigue siendo la protección final contra duplicados.

## 8. Integración con el bot y los demás dominios

| Dominio | Interacción | Responsabilidad de esta spec | Responsabilidad de la otra spec |
|---|---|---|---|
| Chat (spec 03) | `startChatSession` llama a la identificación | Normalizar e identificar; devolver uno de los cuatro resultados (D-04) | Crear la sesión solo si el resultado es **activo**; responder el mensaje de CH-02 sin menú en los otros tres casos, que el cliente no distingue (spec 03 F-1, ESC-01..ESC-06); renovación y expiración de la sesión |
| Pedidos (spec 04) | El pedido usa el cliente fijado en la sesión | Proveer la identidad al iniciar la sesión | Crear y consultar pedidos de ese cliente (RN-08). No revalida que siga activo (OBS-04 de la spec 04) |
| Inventario (spec 02) | Ninguna | — | — |

El cliente queda fijado al crear la sesión y no cambia dentro de ella (spec 03 §9). En el MVP un cliente no puede desactivarse en ejecución, porque su estado solo lo fija el seed.

## 9. Errores y escenarios de excepción

| Situación | Resultado de la identificación | Efecto en el chat (spec 03) | Escenario |
|---|---|---|---|
| `phone` ausente o `""` | No llega a la identificación: error de validación del contrato | `VALIDATION_ERROR`; sin sesión | spec 03 ESC-05 |
| Solo espacios | Inválido | Mensaje de CH-02, sin sesión | ESC-06 |
| Formato no admitido, faltan o sobran dígitos | Inválido, con su motivo | Mensaje de CH-02, sin sesión. El simulador puede avisar del motivo antes de llamar a la API (§6.3) | ESC-05, ESC-07, ESC-21 |
| Número sin cliente | Inexistente | Mensaje de CH-02, sin sesión | ESC-11 |
| Cliente inactivo | Inactivo | Mensaje de CH-02, sin sesión (CL-02) | ESC-10 |
| Cliente activo | Activo | Sesión y menú | ESC-09 |
| Error de base de datos en la búsqueda | Error | `INTERNAL_ERROR` del contrato | — |
| Seed: mismo `tax_id` con otro teléfono (caso B) | — | No aplica al chat; el seed informa y se detiene | ESC-22 |
| Seed: teléfono normalizado ya usado por otro `tax_id` (caso C) | — | No aplica al chat; `UNIQUE` lo impide y el seed informa y se detiene | ESC-16 |

El chat responde lo mismo para inválido, inexistente e inactivo; distinguirlos sirve a CL-03 y a las pruebas, no al cliente.

## 10. Integridad, unicidad y concurrencia

1. **Unicidad.** `customers.phone` es único (spec 01): no puede haber dos clientes con el mismo teléfono normalizado. La identificación devuelve como máximo un cliente.
2. **Formato en la base.** El `CHECK` `^\+[0-9]+$` impide guardar un teléfono sin normalizar; es la última barrera si el seed no aplicara D-01.
3. **Colisiones.** Dos textos distintos que se normalizan al mismo valor representan el mismo número para el sistema. En el MVP solo el seed escribe clientes, así que el caso solo puede darse en el seed. No hay deduplicación, reemplazo ni fusión: el seed informa el conflicto y se detiene (casos B y C de §7.3, DP-04), y la colisión se corrige en los fixtures. La restricción `UNIQUE` impide en cualquier caso un segundo cliente con ese teléfono.
4. **Concurrencia.** En ejecución, la identificación solo lee. No hay escrituras concurrentes de clientes en el MVP; el seed se ejecuta antes de servir tráfico (ARCHITECTURE, "Entornos").
5. **Estado estable.** `isActive` no cambia en ejecución en el MVP; por eso la spec 04 no revalida al cliente al confirmar (OBS-04 de la spec 04).

## 11. Escenarios de aceptación

Nivel: **U** unidad · **I** integración contra PostgreSQL · **E** E2E. Los mensajes y la sesión del chat se verifican en la spec 03; aquí se verifican la normalización, la identificación, el acceso del operador y el comportamiento transversal del dashboard. Las reglas de negocio de las pantallas se verifican en las specs 02 y 04.

### 11.1 Normalización (§6)

| ID | Entrada | Resultado esperado | Trazas | Nivel |
|---|---|---|---|---|
| ESC-01 | `912345678` y `949076876` | `+56912345678` y `+56949076876`: nueve dígitos nacionales reciben `+56` | RN-12, DP-02, DP-03 · US-02 crit. 1 · TK-02.4 | U |
| ESC-02 | `+56912345678` y `+56 9 1234 5678` | `+56912345678` en ambos; no se antepone un segundo `+56` | RN-12, DP-02 · US-02 crit. 1 · TK-02.4 | U |
| ESC-03 | `+54 9 11 1234 5678` y `+14155552671` | `+5491112345678` y `+14155552671`: el prefijo internacional explícito se conserva y no recibe `+56` | RN-12, DP-02 · TK-02.4 | U |
| ESC-04 | `9 4907-6876`, `(9) 4907.6876`, `9 1234 5678` y `+56 (9) 1234-5678` | `+56949076876`, `+56949076876`, `+56912345678` y `+56912345678`: se eliminan exactamente espacio, `-`, `.`, `(` y `)` | RN-12, DP-01 · US-02 crit. 1 · TK-02.4 | U |
| ESC-05 | `9490768765` (10 dígitos), `56949076876` y `0056949076876` | Inválido en los tres, motivo **sobran dígitos**: el formato nacional exige nueve y sin `+` no se infiere ningún código de país | RN-12, DP-02, DP-03 · US-02 crit. 2 · TK-02.4 | U |
| ESC-06 | `""` y `"   "` | Inválido, motivo **vacía** | RN-12 · US-02 crit. 2 · TK-02.4 | U |
| ESC-07 | `abc`, `+`, `9/4907/6876` y `56+949076876` | Inválido, motivo **formato no admitido**: carácter fuera de la lista, `+` sin dígitos o `+` fuera de la posición inicial | RN-12, DP-01, DP-02 · US-02 crit. 2 · TK-02.4 | U |
| ESC-08 | Cada salida válida de ESC-01..ESC-04 | Normalizarla otra vez devuelve el mismo valor | RN-12, D-02 · TK-02.4 | U |

### 11.2 Identificación (§7)

| ID | Precondiciones | Acción | Resultado esperado | Trazas | Nivel |
|---|---|---|---|---|---|
| ESC-09 | Cliente activo del seed con `+56912345678` | Identificar `9 1234 5678`, `912345678` y `+56 9 1234 5678` | Las tres: **activo**, el mismo cliente | CL-03, RN-12 · US-02 crit. 1 · TK-02.4 · spec 03 ESC-01 | I |
| ESC-10 | Cliente inactivo del seed | Identificar su teléfono en cualquier formato | **Inactivo**; el chat lo trata como no registrado | CL-02, CL-03, CA-06 · US-02 crit. 3 · TK-02.4 · spec 03 ESC-03 | I |
| ESC-11 | Ningún cliente con `+56900000000` | Identificar `9 0000 0000` | **Inexistente** | CL-03, CA-06 · TK-02.4 · spec 03 ESC-02 | I |
| ESC-12 | — | Identificar `abc`, `"   "` y `94907687` | **Inválido** en los tres, con su motivo (formato no admitido, vacía, falta 1 dígito), sin consulta a la base | RN-12, D-04 · US-02 crit. 2 · TK-02.4 | U, I |
| ESC-13 | Fixture de TK-02.4: cliente con prefijo distinto de `+56` (por ejemplo `+5491112345678`) | Identificar `+54 9 11 1234 5678`; después `9 11 1234 5678` | Primero: **activo** (prefijo explícito conservado). Después: **inválido**, motivo sobran dígitos (11 dígitos sin `+`); no se consulta la base. El chat responde igual que a un teléfono no registrado (OBS-06) | RN-12, CL-03 · TK-02.4 · spec 03 ESC-06 | I |
| ESC-14 | Base vacía; fixtures válidos (nueve dígitos nacionales, `tax_id` y teléfonos únicos) | Ejecutar el seed | Caso D para cada cliente: todos quedan insertados con teléfono `+56` + 9 dígitos (pasa el `CHECK`), y cada uno se identifica con el formato en que lo escribió el seed y con su forma normalizada | RN-12, D-01, DP-04 (caso D) · spec 01 "Seed" · TK-00.4 | I |
| ESC-15 | Seed ya ejecutado | Ejecutar el seed otra vez, con los mismos fixtures | Caso A para cada cliente: mismo `tax_id` y mismo teléfono normalizado; no se inserta ningún duplicado ni cambia ningún registro (`updatedAt` incluido); la identificación da el mismo resultado | DP-04 (caso A) · spec 01 "Seed" · TK-00.4 | I |
| ESC-16 | Seed ya ejecutado con el cliente X (`tax_id` 1, `+56912345678`); datos de seed con un cliente Y de `tax_id` 2 y teléfono `9 1234 5678` | Ejecutar el seed | Caso C: la restricción `UNIQUE` impide insertar Y; el seed informa el error con el registro de Y y se detiene; X no cambia; no existe un cliente con `tax_id` 2; nunca hay dos clientes con `+56912345678` | RN-12, DP-04 (caso C) · spec 01 · TK-00.4 | I |
| ESC-17 | — | Insertar directamente un cliente con teléfono `9 1234 5678` | La base lo rechaza (`CHECK`) | RN-12 · spec 01 · TK-00.3 | I |
| ESC-18 | Fixtures de TK-02.4 | Comparar el valor que guarda el seed y el que busca la identificación para cada entrada | Son idénticos: ambos usan la misma función (D-01) | RN-12, D-01 · TK-02.4, TK-00.4 | U |
| ESC-19 | Cliente activo | Identificarlo varias veces | Ningún dato del cliente cambia (`updatedAt` incluido) | D-06 · TK-02.4 | I |
| ESC-20 | MVP desplegado | Revisar el contrato | No hay operaciones de clientes; la única operación HTTP que usa la identificación es `startChatSession` | CL-01 (`V2` excluido) · ARCHITECTURE | I |
| ESC-21 | — | Normalizar `94907687`, `9490768`, `949076` y `949076876`; identificar `9490768` | `94907687`: inválido, **falta 1 dígito**; `9490768`: inválido, **faltan 2 dígitos**; `949076`: inválido, **faltan 3 dígitos**; `949076876`: `+56949076876`. No se completan dígitos. La identificación de `9490768` devuelve **inválido** sin consultar la base | RN-12, DP-03, D-04 · US-02 crit. 2 · TK-02.4 | U, I |
| ESC-22 | Seed ya ejecutado con el cliente X (`tax_id` 1, `+56912345678`); datos de seed con `tax_id` 1 y teléfono `9 8765 4321` | Ejecutar el seed | Caso B: el seed informa el conflicto con ese registro y se detiene; X conserva `+56912345678` y el resto de sus datos; no se crea otro cliente | DP-04 (caso B) · spec 01 · TK-00.4 | I |

### 11.3 Acceso del operador (§15)

| ID | Precondiciones | Acción | Resultado esperado | Trazas | Nivel |
|---|---|---|---|---|---|
| ESC-23 | Operador del seed | `login` con su email y contraseña | Éxito: token, tipo `Bearer`, momento de expiración y operador (identificador, email, nombre); la respuesta no contiene la contraseña ni su hash | AU-01, RNF-08 · US-01 crit. 1 · TK-01.1 | I |
| ESC-24 | Operador del seed con email `operador@…` | `login` con el email en mayúsculas | Éxito: el email se compara en minúsculas | AU-01 · spec 01 · TK-01.1 | I |
| ESC-25 | Operador del seed | `login` con contraseña incorrecta; después, con un email inexistente | Ambos: `INVALID_CREDENTIALS` con el mismo mensaje genérico, sin indicar qué dato falló | RNF-08 · US-01 crit. 2 · TK-01.1 | I |
| ESC-26 | — | `login` sin email, sin contraseña, con contraseña vacía o con email sin formato; después, con un cuerpo que no es JSON | `VALIDATION_ERROR` en los primeros; `MALFORMED_REQUEST` en el último; no se emite token | AU-01 · contrato · TK-01.1 | I |
| ESC-27 | — | `listProducts` sin token y con un token de firma o formato inválido | `UNAUTHORIZED` en ambos, sin efectos | AU-01, CA-11 · US-01 crit. 3 · TK-01.1 | I |
| ESC-28 | `JWT_EXPIRES_IN` corto configurado en el test | Obtener un token, esperar a que expire y llamar a `listProducts` | `UNAUTHORIZED` | AU-03, CA-11 · US-01 crit. 3, 4 · TK-01.1 | I |
| ESC-29 | Token válido | Llamar a `listProducts`, `listStockAlerts` y `listOrders` | Las tres responden con éxito | AU-01 · TK-01.1 | I |
| ESC-30 | Sin token | Llamar a `getHealth`, `login` y `startChatSession` | Las tres son públicas: no responden `UNAUTHORIZED` | AU-01 · contrato · TK-01.1 | I |
| ESC-31 | Sin `JWT_EXPIRES_IN` configurado | `login` | El momento de expiración es 8 horas después de la emisión | AU-03 · TK-01.1, TK-00.1 | U, I |
| ESC-32 | Base cargada por el seed | Leer `users` y revisar el repositorio | La contraseña del operador está guardada solo como hash bcrypt; sus credenciales vienen de variables de entorno; el repositorio no contiene secretos, solo `.env.example` | RNF-08 · TK-00.4, TK-00.1 | I |

### 11.4 Pantallas del operador (§16)

| ID | Precondiciones | Acción | Resultado esperado | Trazas | Nivel |
|---|---|---|---|---|---|
| ESC-33 | Operador del seed; sin sesión | Iniciar sesión en `/login` con credenciales válidas | Navega a `/dashboard` y muestra el panel de alertas | AU-01 · US-01 crit. 1 · TK-01.2 | E |
| ESC-34 | Sin sesión | Iniciar sesión con contraseña incorrecta | Mensaje genérico; se permanece en `/login`; no se guarda token | RNF-08 · US-01 crit. 2 · TK-01.2 | E |
| ESC-35 | Sin sesión | Enviar el formulario con un campo vacío o con un email sin formato | Error junto al campo y **ninguna** petición a `login` | AU-01 · TK-01.2 | U, E |
| ESC-36 | Sin token guardado | Abrir directamente `/dashboard`, `/dashboard/products` y `/dashboard/orders` | Redirige a `/login` en los tres casos | CA-11 (sin sesión) · US-01 crit. 3 · TK-01.2, TK-01.3 | E |
| ESC-37 | Token guardado con `expiresAt` vigente que el backend rechaza (por ejemplo, firma inválida) | Abrir `/dashboard/products` | La API responde `UNAUTHORIZED`; el frontend descarta el token y redirige a `/login`. El token **expirado** se detecta antes, de forma local (ESC-46, ESC-47) | AU-03, CA-11 · US-01 crit. 3 · TK-01.2, TK-01.3 | E |
| ESC-38 | Sesión iniciada | Usar **Cerrar sesión** y luego abrir `/dashboard` | El token desaparece de memoria y de `localStorage`; se navega a `/login`; el acceso posterior a `/dashboard` redirige a `/login` | US-01 crit. 5 · TK-01.2 | E |
| ESC-39 | Sin sesión | Recibir `INVALID_CREDENTIALS` en `login` | Se muestra el mensaje en `/login` sin aplicar la redirección global de §15.6 | D-07 · TK-01.2 | U |
| ESC-40 | Sesión iniciada | Recorrer la navegación | Solo hay Inicio, Productos, Pedidos y Cerrar sesión; cada entrada abre su ruta; no hay entradas de clientes, reclamos ni reposición | AU-01, D-08 · TK-00.2, TK-01.2 | E |
| ESC-41 | Sesión iniciada; respuestas de la API controladas en el test | Abrir cada pantalla mientras la respuesta está pendiente y después con listas vacías | Indicador de carga mientras espera; mensaje de "sin resultados" con lista vacía: sin alertas, catálogo vacío, sin pedidos o filtro sin resultados | IN-03, IN-01, PE-01 (presentación) · TK-04.3, TK-03.3, TK-06.4 | U |
| ESC-42 | Sesión iniciada | La API responde `INTERNAL_ERROR` o falla la red al cargar una pantalla | Mensaje genérico sin detalles técnicos; no se cierra la sesión ni se presentan datos antiguos como vigentes | D-09 · TK-03.3, TK-04.3, TK-06.4 | U |
| ESC-43 | Sesión iniciada | Provocar `STOCK_CHANGED` al ajustar stock y `INVALID_ORDER_TRANSITION` al cambiar un estado | Cada pantalla informa el conflicto y recarga el dato según su spec (02 y 04); la sesión sigue activa | D-09 · spec 02 CA-13 · spec 04 DP-02 · TK-03.3, TK-06.4 | U, E |
| ESC-44 | Sesión iniciada | Enviar un formulario de producto con datos fuera de esquema | `VALIDATION_ERROR` mostrado junto al campo; no se trata como pérdida de sesión | D-09 · TK-03.3 | U |
| ESC-45 | MVP desplegado | Revisar el menú y las rutas registradas | No existen `/dashboard/customers`, `/dashboard/claims` ni `/dashboard/purchase-orders`, ni entradas de menú para ellos | CL-01, RE-01, RP-01 (`V2` excluidos) · TK-00.2 | U |

### 11.5 Decisiones de acceso y layout (DP-05..DP-09)

| ID | Precondiciones | Acción | Resultado esperado | Trazas | Nivel |
|---|---|---|---|---|---|
| ESC-46 | Sesión iniciada con un `expiresAt` corto; el plazo ya pasó | Navegar a `/dashboard/orders` | No se hace ninguna petición a la API; el token desaparece de memoria y de `localStorage`; se redirige a `/login` con el aviso de que la sesión expiró | AU-03, CA-11 (sesión expirada), DP-05 · US-01 crit. 3, 4 · TK-01.2, TK-01.3 | U, E |
| ESC-47 | En `/dashboard/products` con sesión iniciada; el `expiresAt` pasa mientras la pantalla sigue abierta | Lanzar una acción que llama a una operación protegida (por ejemplo, ajustar stock) | La petición **no** se envía; se limpia la autenticación y se redirige a `/login` con el aviso de que la sesión expiró | AU-03, DP-05 · TK-01.2 | U |
| ESC-48 | (a) Sesión válida; (b) sin token; (c) token con `expiresAt` vencido | Abrir `/login` | (a) Redirige a `/dashboard`; (b) muestra el formulario; (c) limpia la autenticación y muestra el formulario. No hay bucle de redirección | AU-01, DP-06 · TK-01.2 | U, E |
| ESC-49 | (a) Sesión válida; (b) sin sesión | Abrir `/dashboard/inexistente` y `/dashboard/claims` | (a) Redirige a `/dashboard`; (b) redirige a `/login`. No se muestra una pantalla de "no encontrado" ni hay bucle | DP-07, CL-01/RE-01 (`V2` excluidos) · TK-00.2, TK-01.2 | U, E |
| ESC-50 | Operador del seed con nombre conocido | Iniciar sesión | El layout muestra ese nombre junto a Cerrar sesión, tomado de la respuesta de `login`, sin llamadas adicionales a la API | DP-09 · US-01 crit. 1 · TK-01.2 | E |
| ESC-51 | Código del módulo `auth`, `.env.example` y logs de un login correcto y de uno fallido | Revisar y ejecutar | El costo de bcrypt está en una constante; `.env.example` solo tiene un marcador de posición para la contraseña del operador; ningún log ni respuesta contiene la contraseña ni su hash; el seed toma la contraseña del entorno | RNF-08, DP-08 · TK-01.1, TK-00.4, TK-00.1 | I |

### 11.6 Resaltado de stock crítico (DP-04 de la spec 02)

| ID | Precondiciones | Acción | Resultado esperado | Trazas | Nivel |
|---|---|---|---|---|---|
| ESC-52 | Respuestas de la API controladas en el test, que representan **dos lecturas en momentos distintos**. En la lectura de `listProducts`: A (activo, stock 3, mínimo 3), B (activo, 2/3), C (activo, 9/3) y D (inactivo, 1/3). **Entre ambas lecturas** un cambio de stock deja a A fuera de la condición de alerta. En la lectura **posterior** de `listStockAlerts` solo aparece B | Abrir `/dashboard/products` | Solo se resalta B. A no se resalta, aunque sus datos de catálogo parezcan cumplir RN-09, porque su `id` no está en la respuesta de alertas; eso demuestra que el frontend usa la respuesta del backend y no recalcula RN-09. C y D no se resaltan; D porque el backend excluye a los inactivos | RN-09, CA-01, DP-04 (spec 02) · TK-03.3, TK-04.1 | U |
| ESC-53 | `listProducts` responde bien con un producto activo con stock 2 y mínimo 3; `listStockAlerts` responde `INTERNAL_ERROR` | Abrir `/dashboard/products` | La tabla se muestra sin ningún resaltado, con un aviso explícito de que el indicador de stock crítico no está disponible; el producto 2/3 no se resalta (no hay cálculo local); la sesión sigue activa | RN-09, DP-04 (spec 02), D-09 · TK-03.3 | U |
| ESC-54 | Producto activo con stock 10 y mínimo 5, sin resaltar | Ajustarlo con `adjustProductStock` (`newStock` 5, `expectedStock` 10); después cambiar su mínimo a 4 con `updateProduct` | Tras cada operación exitosa se vuelven a solicitar `listProducts` y `listStockAlerts`. Tras el ajuste el producto aparece en alertas y se resalta; tras el cambio de mínimo deja de aparecer y de resaltarse | RN-09, IN-02, DP-04 (spec 02) · TK-03.3, TK-04.1 | U, E |
| ESC-55 | Producto activo con stock 2 y mínimo 3, resaltado | Desactivarlo con `deactivateProduct` | Se vuelven a solicitar ambas listas; el producto sigue en la tabla como inactivo y deja de resaltarse, porque `listStockAlerts` ya no lo devuelve | RN-09, RN-10, DP-04 (spec 02) · TK-03.3 | U, E |

### 11.7 Validación local del teléfono en el simulador (§6.3 A)

Este escenario verifica **solo** la validación local del campo de teléfono del simulador (TK-05.4). No sustituye a los escenarios de la normalización en el backend (ESC-01..ESC-08, ESC-21), definida en §6.3 B, ni redefine la experiencia conversacional de la spec 03 (F-1).

| ID | Precondiciones | Acción | Resultado esperado | Trazas | Nivel |
|---|---|---|---|---|---|
| ESC-56 | Simulador abierto en `/chat`, sin sesión; las llamadas a `startChatSession` se registran en el test | Escribir en el campo de teléfono cada entrada de la tabla de ejemplos e intentar continuar | Según la tabla de ejemplos de este escenario | RN-12, CL-03 (caso válido), §6.3 A · `startChatSession` (caso válido) · TK-05.4 | E |

Ejemplos de ESC-56:

| Entrada en el campo | Resultado esperado |
|---|---|
| Vacía | Mensaje que indica que debe ingresar el número |
| `94907687` (8 dígitos) | `Falta 1 dígito` |
| `9490768` (7 dígitos) | Mensaje que indica que faltan 2 dígitos |
| `9490768765` (10 dígitos) | Mensaje que indica que sobran dígitos |
| `949076876` (9 dígitos) | Se permite continuar |

- **Entradas inválidas** (las cuatro primeras): el usuario permanece en el campo de teléfono, no se completa ningún dígito, **no** se invoca `startChatSession` y no se crea sesión ni se inicia la conversación.
- **Entrada válida** (`949076876`): el campo muestra visualmente el prefijo fijo `+56`; se invoca `startChatSession` **una sola vez**, con el teléfono `949076876`, sin `+56` ni separadores, así que el prefijo no se duplica. La normalización y lo que ocurre después corresponden al backend (§6.3 B) y a la spec 03.

### 11.8 Acciones sobre productos inactivos (DP-01 y DP-02 de la spec 02)

| ID | Precondiciones | Acción | Resultado esperado | Trazas | Nivel |
|---|---|---|---|---|---|
| ESC-57 | Sesión iniciada; un producto inactivo con stock 1 y mínimo 3 en `listProducts` | Abrir `/dashboard/products`; editar el precio del producto inactivo y después ajustar su stock con el `expectedStock` mostrado | La fila del producto inactivo aparece, no resaltada, y ofrece las acciones de editar y ajustar stock, sin ninguna acción de reactivación. Ambas operaciones se completan, se recargan las listas (§16.4) y el producto sigue inactivo y sin resaltar | DP-01, DP-02 (spec 02) · RN-09, RN-10 · TK-03.3 | E |
## 12. Trazabilidad

### 12.1 Requisitos, reglas y criterios

| ID PRD | Fase | Sección | Capacidad u operación | Criterio PRD | Historia | Tickets | Escenarios |
|---|---|---|---|---|---|---|---|
| RN-12 | `MVP` | §6, §6.3 A, §7.3 | Normalización (`customers.service`); seed | — | US-02 crit. 1, 2 | TK-02.4, TK-00.4, TK-05.4 | ESC-01..ESC-08, ESC-12..ESC-18, ESC-21, ESC-22, ESC-56 (validación local) |
| CL-03 | `MVP` | §7 | Identificación (`customers.service`) · `startChatSession` | CA-06 | US-02 crit. 1, 3 | TK-02.4, TK-05.1, TK-05.4 | ESC-09..ESC-13, ESC-56 (caso válido) |
| CL-02 | `MVP` | §5, §8 | Identificación → resultado inactivo | CA-06 | US-02 crit. 3 · US-05 crit. 1 | TK-02.4, TK-05.1, TK-05.5 | ESC-10 |
| CH-02 | `MVP` | §8 | `startChatSession` (spec 03) | CA-06 | US-05 crit. 1 | TK-05.1, TK-05.5 | ESC-09..ESC-12 (lado identificación) |
| RN-10 (clientes) | `MVP` / `V2` | §4, §14.3 | — | — | US-02 crit. 6 (`V2`) | TK-02.1 | ESC-19 |
| CL-01 | `V2` | §14.3 | Endpoints de clientes (no existen en el MVP) | — | US-02 crit. 4..6 | TK-02.1, TK-02.2, TK-02.3 | ESC-20 (exclusión) |
| AU-01 | `MVP` | §15.2, §15.5, §16 | `login`; operaciones Bearer | — | US-01 crit. 1, 3 | TK-01.1, TK-01.2 | ESC-23..ESC-27, ESC-29, ESC-30, ESC-33..ESC-36 |
| AU-02 | `MVP` | §15.1 | — | — | — | TK-00.4, TK-01.1 | ESC-32 |
| AU-03 | `MVP` | §15.4 | `login` | CA-11 | US-01 crit. 4 | TK-01.1, TK-00.1, TK-01.2 | ESC-28, ESC-31, ESC-37, ESC-46, ESC-47 |
| CA-11 | `MVP` | §15.5, §15.6 | Operaciones Bearer | CA-11 | US-01 crit. 3 | TK-01.1, TK-01.2, TK-01.3 | ESC-27, ESC-28, ESC-36, ESC-37, ESC-46 |
| RNF-08 | `MVP` | §15.3 | `login` | — | US-01 crit. 2 | TK-01.1, TK-00.1, TK-00.4 | ESC-23, ESC-25, ESC-31, ESC-32, ESC-51 |
| RNF-07 | `MVP` | §3 | Todas | — | — | Definición de hecho | Revisión de código |

### 12.2 Tickets

| Ticket | Fase | Responsabilidad según esta spec | Spec declarada en el backlog | Escenarios |
|---|---|---|---|---|
| TK-02.4 | `MVP` | Función de normalización (§6), con motivo de rechazo, y consulta de CL-03 (§7); fixtures con número nacional de nueve dígitos, con `+56` y con otro prefijo explícito | 05 | ESC-01..ESC-13, ESC-18, ESC-19, ESC-21 |
| TK-00.4 | `MVP` | Seed estático con la misma normalización; identidad por `tax_id`, casos A..D y detención ante conflictos (DP-04) | 01 | ESC-14..ESC-16, ESC-18, ESC-22 |
| TK-00.3 | `MVP` | `CHECK` y unicidad de `phone` | 01 | ESC-17 |
| TK-05.1 | `MVP` | Uso de la identificación en `startChatSession` y respuesta del chat | 03 | spec 03 ESC-01..ESC-06 |
| TK-05.5 | `MVP` | E2E de CA-06 | 04 y 03 | spec 03 ESC-02, ESC-03 |
| TK-05.4 | `MVP` | Solo la validación local del teléfono del simulador (§6.3 A); el resto del simulador es de la spec 03 | 03 | ESC-56 |
| TK-02.1..TK-02.3 | `V2` | Gestión de clientes | 05 | — |
| TK-01.1 | `MVP` | `login`, middleware JWT y costo de bcrypt en una constante (§15.2..§15.5) | 05 | ESC-23..ESC-32, ESC-51 |
| TK-01.2 | `MVP` | Pantalla de login, rutas protegidas, respuesta a 401 y cierre de sesión (§15.6..§15.8, §16.2, §16.3) | 05 | ESC-33..ESC-40, ESC-46..ESC-50 |
| TK-01.3 | `MVP` | E2E de CA-11, sin sesión y con sesión expirada | 05 | ESC-36, ESC-37, ESC-46 |
| TK-00.1 | `MVP` | Configuración de `JWT_EXPIRES_IN` y secretos | ARCHITECTURE | ESC-31, ESC-32 |
| TK-00.2 | `MVP` | Rutas y cliente API del frontend; esta spec fija su navegación (§16.2) | ARCHITECTURE | ESC-40, ESC-45 |
| TK-03.3, TK-04.3, TK-06.4 | `MVP` | Pantallas de productos, alertas y pedidos: reglas en las specs 02 y 04; esta spec fija sus estados transversales, el resaltado por cruce con `listStockAlerts` y las acciones sobre productos inactivos (editar y ajustar, sin reactivación) (§16.4, §16.5) | 02 y 04 | ESC-41..ESC-44, ESC-52..ESC-55, ESC-57 |

No hay responsabilidades duplicadas con la spec 03: esta spec decide **quién es** el cliente; la spec 03 decide **qué ve** el cliente. Tampoco con las specs 02 y 04: esta spec define cómo se accede a sus pantallas y cómo se comportan ante la sesión y los errores; ellas definen las reglas de negocio.

### 12.3 Cobertura de las responsabilidades de la spec 05

| ID PRD | Regla funcional | Escenarios | Operación | Historia | Ticket | Fase | Sección | Cobertura |
|---|---|---|---|---|---|---|---|---|
| RN-12 | Normalización única para seed y chat | ESC-01..ESC-08, ESC-12..ESC-18, ESC-21, ESC-22 | Interna; `startChatSession` | US-02 crit. 1, 2 | TK-02.4, TK-00.4 | `MVP` | §6, §7.3 | Cubierto (los tickets deben alinearse: OBS-03, OBS-04) |
| CL-03 | Identificación por teléfono normalizado | ESC-09..ESC-13 | `startChatSession` | US-02 crit. 1, 3 | TK-02.4 | `MVP` | §7 | Cubierto |
| RN-12 (interfaz) | Validación local del teléfono en el simulador: prefijo fijo `+56`, nueve dígitos, mensajes locales y sin petición si la entrada es inválida | ESC-56 | `startChatSession` (caso válido) | US-05 | TK-05.4 | `MVP` | §6.3 A | Cubierto; la normalización en el backend (§6.3 B) la cubren ESC-01..ESC-08 y ESC-21, y la experiencia conversacional, la spec 03 |
| CL-02 | Cliente inactivo tratado como no registrado | ESC-10 | `startChatSession` | US-02 crit. 3 | TK-02.4, TK-05.1 | `MVP` | §5, §8 | Cubierto |
| AU-01 | Login obligatorio para el dashboard | ESC-23..ESC-27, ESC-29, ESC-30, ESC-33..ESC-36, ESC-48 | `login`; operaciones Bearer | US-01 crit. 1, 3 | TK-01.1, TK-01.2 | `MVP` | §15.2, §15.5 | Cubierto |
| AU-02 | Rol único; cuentas por seed | ESC-32 | — | — | TK-00.4, TK-01.1 | `MVP` | §15.1 | Cubierto |
| AU-03 | Expiración de 8 horas, configurable | ESC-28, ESC-31, ESC-37, ESC-46, ESC-47 | `login` | US-01 crit. 4 | TK-01.1, TK-00.1, TK-01.2 | `MVP` | §15.4 | Cubierto, incluida la comprobación local de la expiración (DP-05, resuelta) |
| CA-11 | Redirección a `/login` sin sesión o con la sesión expirada | ESC-27, ESC-28, ESC-36, ESC-37, ESC-46 | Operaciones Bearer | US-01 crit. 3 | TK-01.1, TK-01.2, TK-01.3 | `MVP` | §15.5, §15.6 | Cubierto |
| RNF-08 | Hash con sal, mensaje genérico, expiración, secretos fuera del repositorio | ESC-23, ESC-25, ESC-31, ESC-32, ESC-51 | `login` | US-01 crit. 2 | TK-01.1, TK-00.1, TK-00.4 | `MVP` | §15.3 | Cubierto (costo de bcrypt y contraseña del seed: DP-08, resuelta) |
| — (US-01 crit. 5) | Cierre de sesión en el cliente, sin revocación | ESC-38 | — | US-01 crit. 5 | TK-01.2 | `MVP` | §15.8 | Cubierto |
| — | Layout y navegación del dashboard | ESC-40, ESC-45, ESC-49, ESC-50 | — | US-01 | TK-00.2, TK-01.2 | `MVP` | §16.2 | Cubierto (rutas desconocidas: DP-07; nombre del operador: DP-09; ambas resueltas) |
| — | Pantalla de login | ESC-33..ESC-35, ESC-39, ESC-48 | `login` | US-01 crit. 1, 2 | TK-01.2 | `MVP` | §16.3 | Cubierto (`/login` con sesión válida: DP-06, resuelta) |
| IN-01, IN-02, IN-03, PE-01, PE-02 (presentación) | Estados transversales de alertas, productos y pedidos; resaltado de stock crítico; acciones sobre productos inactivos | ESC-41..ESC-44, ESC-52..ESC-55, ESC-57 | Operaciones de §16.1 | US-03, US-04, US-06 | TK-03.3, TK-04.3, TK-06.4 | `MVP` | §16.4, §16.5 | Cubierto; las reglas son de las specs 02 y 04, el resaltado de stock crítico sigue DP-04 de la spec 02, y las acciones sobre inactivos, DP-01 y DP-02; todas resueltas en la spec 02 v1.2 (aprobada). La concurrencia de la edición (DP-06) es del backend |
| CL-01, RN-10 | Gestión de clientes | ESC-20, ESC-45 (exclusión) | — | US-02 crit. 4..6 | TK-02.1..TK-02.3 | `V2` | §14.3, §16.7 | Diseño conceptual; no implementable en el MVP |

## 13. Decisiones

### 13.1 Decisiones resueltas

Aprobadas por el responsable del proyecto. Conservan su ID, su contexto y las alternativas que se evaluaron. DP-01 se mantiene sin cambios; DP-02, DP-03 y DP-04 se **simplificaron** para el MVP, que trabaja con clientes y teléfonos ficticios y controlados, y su resolución actual **sustituye** a la alternativa A aprobada antes.

| ID | Pregunta | Contexto | Resolución aprobada | Alternativas evaluadas | Se aplica en | Escenarios |
|---|---|---|---|---|---|---|
| DP-01 | ¿Qué caracteres son "separadores permitidos"? | RN-12 dice "se eliminan espacios y separadores permitidos" sin definirlos. Las fuentes solo muestran espacios (seed de la spec 01, ejemplo del contrato `9 1234 5678`) | **A** (sin cambios). Exclusivamente espacio ASCII, guion `-`, punto `.` y paréntesis `(` `)`, eliminados antes de normalizar. Cualquier otro carácter se rechaza; no se desarrolla un tratamiento específico de variantes Unicode | (B) Solo espacios y guiones. (C) Solo espacios | §6.1 pasos 2 y 3 | ESC-04, ESC-07 |
| DP-02 | ¿Qué formas cuentan como "prefijo internacional" y cómo se evita duplicar `+56`? | RN-12 conserva el prefijo internacional y evita duplicarlo, pero no dice cómo reconocerlo sin `+` | **Simplificada (sustituye a la A anterior).** Chile es el mercado predeterminado y el simulador presenta `+56` como prefijo fijo. (1) Un `+` inicial, tras quitar separadores, indica prefijo internacional explícito: se conserva y no recibe `+56`. (2) Sin `+`, la entrada es nacional y debe tener exactamente nueve dígitos; con nueve recibe `+56`. (3) No hay detección automática de códigos de país sin `+`, y `00` no es prefijo. (4) Una entrada sin `+` de más de nueve dígitos no recibe `+56`: se rechaza como formato no admitido. (5) Un `+` en otra posición es inválido. La regla de nueve dígitos es el formato nacional esperado en el MVP, no una validación del plan de SUBTEL. RN-12 ("los números que ya contienen un prefijo internacional lo conservan") se aplica a los que lo escriben con `+` | Anterior A, sustituida: además, 11 dígitos que empiezan por `56` sin `+` recibían `+`, y el resto sin `+` recibía `+56`. (B) `00` equivalente a `+`. (C) Solo `+` como prefijo y `56…` sin `+` inválido | §6.1 pasos 3 a 5, §6.3 | ESC-01..ESC-05, ESC-07, ESC-13 |
| DP-03 | ¿Hay límites de cantidad de dígitos para considerar un formato "evidentemente inválido"? | RN-12 rechaza "formato evidentemente inválido" sin definirlo; RN-12 excluye la validación según SUBTEL | **Simplificada (sustituye a la A anterior).** Para entradas nacionales: exactamente nueve dígitos son válidos; con menos se rechaza indicando cuántos faltan; con más se rechaza indicando que exceden el formato esperado. No se completan dígitos. Para entradas con `+` explícito solo se exige que tengan dígitos tras quitar los separadores. No hay límites generales de E.164 ni validaciones de SUBTEL | Anterior A, sustituida: entre 8 y 15 dígitos tras normalizar. (B) Sin límites. (C) Exactamente 11 dígitos para `+56` | §6.1 paso 5 | ESC-01, ESC-05, ESC-12, ESC-21 |
| DP-04 | ¿Cómo reconoce el seed un cliente ya cargado y qué hace ante colisiones? | El seed debe ser idempotente (spec 01) y la restricción única impide dos clientes con el mismo teléfono | **Simplificada (sustituye a la A anterior).** Fixtures ficticios, estáticos y en el repositorio, con teléfonos nacionales válidos de nueve dígitos y `tax_id` y teléfonos únicos entre sí. Misma normalización que el chat. El `tax_id` solo reconoce registros del seed. Caso A: se reconoce sin duplicar ni modificar. Caso B (mismo `tax_id`, otro teléfono): se informa el conflicto y no se sobrescribe. Caso C (teléfono ya usado por otro `tax_id`): `UNIQUE` lo impide y el seed informa el error. Caso D: se inserta. Ante un conflicto el seed informa el registro afectado y se detiene; lo ya insertado puede permanecer y se reconoce en una ejecución posterior; la colisión se corrige en los fixtures. Sin fusión, reemplazo, deduplicación por nombre, transacción global especial, recuperación automática ni validaciones exhaustivas de RUT o teléfonos | Anterior A, sustituida: igual reconocimiento por `tax_id`, pero sin precisar el origen de los datos ni si el seed continuaba tras un conflicto. (B) Identificar por teléfono y omitir el segundo cliente. (C) Identificar por teléfono y actualizar el existente | §7.3, §10 | ESC-14..ESC-16, ESC-22 |

### 13.2 Decisiones del acceso del operador y del dashboard (resueltas)

Aprobadas por el responsable del proyecto con la alternativa A, con las precisiones indicadas. Conservan su ID.

| ID | Pregunta | Alternativas evaluadas | Aprobada | Justificación | Reglas resultantes | Escenarios |
|---|---|---|---|---|---|---|
| DP-05 | ¿El frontend comprueba localmente la expiración del token y avisa de ella? | (A) Comprobar `expiresAt` al navegar y antes de cada petición, y avisar; `UNAUTHORIZED` como red de seguridad. (B) Solo `UNAUTHORIZED`, sin aviso | **A** | Evita peticiones condenadas a fallar y explica la redirección, sin debilitar la seguridad: el backend sigue siendo la autoridad | §15.4: comprobación al navegar y antes de cada petición protegida; si expiró, limpia memoria y `localStorage`, no envía la petición, redirige a `/login` y avisa. Es ayuda de experiencia de usuario, no una frontera de seguridad. `UNAUTHORIZED` y `INVALID_CREDENTIALS` se distinguen por `code` (§15.6) | ESC-46, ESC-47, ESC-37, ESC-39 |
| DP-06 | ¿Qué ocurre al abrir `/login` con una sesión válida? | (A) Redirigir a `/dashboard`. (B) Mostrar el formulario | **A** | Con un único rol, volver a iniciar sesión no aporta nada y puede confundir | §16.3: con sesión válida redirige a `/dashboard`; sin token muestra el login; con token vencido limpia y muestra el login. Sin rutas nuevas | ESC-48 |
| DP-07 | ¿Qué ocurre con una ruta que no existe en el MVP, incluidas las de V2? | (A) Con sesión, a `/dashboard`; sin sesión, a `/login`. (B) Pantalla de "no encontrado" | **A** | La más simple; no expone rutas ni añade pantallas | §16.2: redirección según la sesión; las rutas V2 se tratan como desconocidas; sin pantalla de "no encontrado"; sin bucles de redirección | ESC-49, ESC-45 |
| DP-08 | ¿Qué costo de bcrypt se usa y se exige una política a la contraseña del seed? | (A) Costo por defecto de la biblioteca en una constante; sin política de complejidad. (B) Costo configurable por variable de entorno. (C) Longitud mínima validada al arrancar | **A**, con precisiones | Cumple RNF-08 sin añadir configuración ni reglas que el PRD no pide | §15.3: costo predeterminado declarado en una constante y estable; sin política de complejidad; contraseña del seed desde el entorno, nunca en el repositorio; `.env.example` con marcador de posición y recomendación; nunca se registran ni devuelven contraseñas ni hashes; sin endpoints de registro, recuperación ni administración de usuarios | ESC-32, ESC-51 |
| DP-09 | ¿El layout muestra la identificación del operador? | (A) Mostrar el nombre junto a Cerrar sesión. (B) No mostrarlo | **A** | Confirma qué cuenta está activa con un dato que `login` ya devuelve | §16.2: nombre (`operator.name` de `login`) junto a Cerrar sesión, sin campos ni llamadas adicionales | ESC-50 |

### 13.3 Decisiones pendientes

Ninguna en esta spec, y no hay dependencias externas pendientes de decisión: DP-04 (resaltado de stock crítico), DP-01 (sin reactivación), DP-02 (edición y ajuste de inactivos) y DP-06 (concurrencia de la edición general) de la spec 02 están resueltas en la spec 02 v1.2, aprobada. Su presentación en `/dashboard/products` está en §16.4.

## 14. Observaciones y limitaciones conocidas

### 14.1 Observaciones

| ID | Estado | Observación | Dónde |
|---|---|---|---|
| OBS-01 | Cerrada | Esta spec desarrollaba solo clientes y dejaba sin especificar el acceso del operador y las pantallas. §15 cubre AU-01..AU-03, CA-11 y RNF-08 (TK-01.1..TK-01.3), y §16 la estructura compartida, el login y el comportamiento transversal de las pantallas `MVP`. Lo que quedaba abierto se identificó como decisiones pendientes (DP-05..DP-09), no como alcance sin especificar; después se resolvieron (§13.2) | `CLAUDE.md`; ARCHITECTURE "Módulos"; `backlog/US-01_acceso_operador.md` |
| OBS-02 | Registrada | La dependencia señalada en OBS-01 de la spec 03 (normalización RN-12 en la spec 05) queda cubierta por §6 y §7, ahora sin puntos abiertos tras resolver DP-01..DP-03. Esta spec no modifica ni cierra la observación de la spec 03 | `specs/03_conversational_bot.spec.md`, OBS-01 |
| OBS-03 | Cerrada | TK-02.4 requiere alineación con las reglas definitivas: exige tests de "separadores", "prefijo no duplicado" y "número con otro prefijo internacional", pero no enumera la lista exacta de separadores (DP-01), la regla de nueve dígitos nacionales con el motivo de rechazo (faltan *n* / sobran dígitos) ni el `+` obligatorio para prefijos internacionales (DP-02, DP-03). Cerrada: TK-02.4 (`backlog/US-02_gestion_clientes.md`) enumera ahora la lista exacta de separadores (DP-01), la regla de nueve dígitos nacionales con el motivo de rechazo y el `+` obligatorio para los prefijos internacionales (DP-02, DP-03); distingue la validación del backend de la validación local del simulador, que deja en TK-05.4; y mantiene la respuesta genérica de la spec 03 (F-1) | `backlog/US-02_gestion_clientes.md`, TK-02.4 |
| OBS-04 | Cerrada | TK-00.4 requiere alineación con el seed simplificado de DP-04: fixtures estáticos de nueve dígitos, reconocimiento por `tax_id`, casos A..D y detención ante un conflicto con el registro afectado. La spec 01 solo registra como punto abierto la idempotencia de los pedidos. Cerrada: TK-00.4 (`backlog/00_habilitadores.md`) refleja ahora los fixtures estáticos de nueve dígitos, el reconocimiento por `tax_id`, los casos A..D, la protección `UNIQUE`, la detención ante un conflicto con el registro afectado y las exclusiones; también las credenciales del operador según §15.3 (DP-08) | `backlog/00_habilitadores.md`, TK-00.4; spec 01 "Puntos abiertos" |
| OBS-05 | Registrada | El contrato distingue `phone` ausente o `""` (error de validación) de un teléfono solo de espacios (respuesta normal sin sesión). Esta spec respeta esa distinción: lo segundo es un resultado **inválido** de la normalización | `docs/openapi.yaml`, `startChatSession` |
| OBS-06 | Cerrada | ESC-06 de la spec 03 decía que el número internacional escrito sin su prefijo "recibe `+56`, no coincide y responde como ESC-02", lo que no coincidía con DP-02 simplificada. Corregido en la spec 03 v1.1 (aprobada el 2026-11-18): ESC-06 usa ahora un número internacional con prefijo `+` explícito (por ejemplo, `+54 9 11 1234 5678`), que la normalización conserva (`+5491112345678`) sin anteponer `+56`, en línea con §6.1 de esta spec | `specs/03_conversational_bot.spec.md`, ESC-06 |
| OBS-07 | Cerrada | DP-02 y DP-03 piden informar cuántos dígitos faltan o que sobran, y que el simulador presente `+56` como prefijo fijo. No contradice la spec 03 (F-1, aprobada): los mensajes sobre la cantidad de dígitos pertenecen a la validación visual local del campo del simulador, que no envía la solicitud cuando el teléfono es inválido (§6.3 A). El backend vuelve a validar con la misma normalización y, ante un teléfono inválido, conserva el comportamiento conversacional aprobado y el contrato de `startChatSession`, sin exponer el motivo (§6.3 B). TK-05.4 (simulador) no describe todavía el prefijo fijo ni estos mensajes; es una alineación de backlog que no afecta a la spec 03 | `specs/03_conversational_bot.spec.md`, F-1; `backlog/US-05_compra_conversacional.md`, TK-05.4 |
| OBS-08 | Cerrada | TK-01.2 dice "cualquier respuesta 401 … limpia el token y redirige a `/login`". Aplicado al pie de la letra, también lo haría con `INVALID_CREDENTIALS` del login. Esta spec lo precisa con D-07 (solo `UNAUTHORIZED`); conviene alinear el texto del ticket. Cerrada: TK-01.2 (`backlog/US-01_acceso_operador.md`) distingue ahora por `code` `UNAUTHORIZED` (descarta el JWT, limpia el estado y redirige a `/login`) de `INVALID_CREDENTIALS` (mensaje en el formulario, sin cierre de sesión), y excluye un interceptor que cierre la sesión ante cualquier 401 (§15.6, D-07) | `backlog/US-01_acceso_operador.md`, TK-01.2 |
| OBS-09 | Cerrada | `CLAUDE.md` y `README.md` describían la spec 05 con el acceso del operador y las pantallas como pendientes, cuando esta versión ya los especificaba. Cerrada con la aprobación de la v1.0 (2026-11-18): `CLAUDE.md` y `README.md` reflejan ahora su estado aprobado y su alcance; §15 (acceso del operador) y §16 (dashboard) están desarrolladas, y la cobertura del MVP está documentada en §12.3 | `CLAUDE.md`; `README.md` |

### 14.2 Limitaciones conocidas

- **Identidad declarada.** El simulador confía en el teléfono escrito; no se verifica titularidad (ARCHITECTURE, "Limitaciones conocidas"; RN-12).
- **Enumeración.** La respuesta de `startChatSession` permite saber si un teléfono corresponde a un cliente activo; no se limitan los intentos (contrato, limitación conocida del MVP).
- **Estado del cliente estático.** Sin CL-01 no hay desactivación en ejecución; cuando exista (V2), habrá que revisar OBS-04 de la spec 04.
- **Sin revocación de tokens.** Cerrar sesión solo descarta el token en el cliente; un token copiado antes sigue siendo válido hasta su expiración (§15.8).
- **Sin límite de intentos de login.** No hay bloqueo de cuentas ni limitación de intentos: no lo exige ningún requisito (§15.2).
- **Token en `localStorage`.** Expuesto ante una vulnerabilidad XSS; limitación aceptada en ARCHITECTURE (§15.7).
- **Rol único.** No hay distinción de permisos entre operadores (AU-02).

### 14.3 Diseño conceptual V2: gestión de clientes (CL-01)

- **Capacidad:** el operador crea, edita y desactiva clientes con razón social, documento tributario y teléfono (CL-01), sin borrarlos (RN-10).
- **Normalización:** al crear o editar se aplica la misma función de §6 (D-01). Un teléfono o documento ya registrado en otro cliente se rechaza como conflicto (TK-02.1: 409).
- **Endpoints previstos** (ARCHITECTURE, `V2`): `GET/POST /customers`, `GET/PATCH /customers/:id`, `POST /customers/:id/deactivate`. No existen en el contrato del MVP.
- **Impacto en otros dominios:** desactivar un cliente con una sesión abierta reabre OBS-04 de la spec 04. Formato y validación del RUT, sin definir (spec 01 "Puntos abiertos").
- **Tickets:** TK-02.1 (endpoints), TK-02.2 (pantalla), TK-02.3 (pruebas). US-02 crit. 4..6.

## 15. Acceso del operador (AU-01, AU-02, AU-03, CA-11, RNF-08)

### 15.1 Cuentas y modelo de acceso

- **Modelo.** `users` (spec 01): `id`, `email` único y guardado en minúsculas, `password_hash` (bcrypt) y `name`. No se relaciona con otras tablas y no tiene columnas de rol ni de permisos.
- **Rol único (AU-02).** Todo usuario autenticado es operador y accede a todas las operaciones de operador. No hay roles, permisos granulares ni matriz de autorización.
- **Alta de cuentas.** Solo por seed (AU-02), con las credenciales del operador tomadas de variables de entorno (RNF-08, TK-00.4). No hay alta, edición ni cambio de contraseña desde la interfaz (PRD §4.3, "Gestión de usuarios operadores desde la UI" fuera del producto).

### 15.2 Inicio de sesión (`login`)

1. El operador envía email y contraseña con `login` (contrato: `LoginRequest`).
2. **Validación de entrada (contrato).** Ambos campos son obligatorios, el email debe tener formato de email y la contraseña al menos un carácter. Fuera de esquema: `VALIDATION_ERROR`; cuerpo que no es JSON: `MALFORMED_REQUEST`.
3. El servicio convierte el email a minúsculas y busca el usuario (spec 01; contrato: "el email se compara en minúsculas").
4. Compara la contraseña recibida con `password_hash` (bcrypt).
5. **Fallo.** Usuario inexistente o contraseña incorrecta: `INVALID_CREDENTIALS` con **un único mensaje genérico**, sin indicar qué dato falló (RNF-08, US-01 crit. 2).
6. **Éxito.** Emite un JWT firmado (HS256) que expira según `JWT_EXPIRES_IN` y responde con el token, el tipo `Bearer`, el momento de expiración y los datos del operador (identificador, email, nombre), según `LoginResponse`. La respuesta nunca incluye la contraseña ni su hash.

No se limita la cantidad de intentos ni se bloquean cuentas: no hay requisito (§14.2).

### 15.3 Seguridad de credenciales (RNF-08)

| Exigencia | Cómo se cumple | Fuente |
|---|---|---|
| Contraseñas solo como hash con sal, nunca en texto plano | `password_hash` con bcrypt, que incorpora la sal | RNF-08; spec 01; ARCHITECTURE "Autenticación" |
| El hash no se expone en la API | El schema `Operator` del contrato solo tiene identificador, email y nombre | RNF-08; contrato |
| Login fallido con mensaje genérico | `INVALID_CREDENTIALS` idéntico para email inexistente y contraseña incorrecta | RNF-08; US-01 crit. 2 |
| Tokens que expiran según AU-03 | `JWT_EXPIRES_IN`, 8 horas por defecto (§15.4) | RNF-08; AU-03 |
| Secretos fuera del repositorio | Clave de firma, credenciales de base de datos y del operador del seed en variables de entorno; el repositorio solo incluye `.env.example` sin valores reales | RNF-08; TK-00.1; TK-00.4 |

**Costo de bcrypt y contraseña del seed (DP-08, resuelta):**

- El costo de bcrypt es el **predeterminado de la biblioteca** elegida para el proyecto, **declarado explícitamente en una constante** del módulo `auth`. Se mantiene estable mientras no se apruebe un cambio de configuración o de dependencia.
- **No hay política de complejidad** obligatoria de contraseñas en el MVP.
- La contraseña real del operador del seed se lee de la **configuración de entorno** y **nunca** queda escrita en el repositorio. `.env.example` solo incluye un marcador de posición y la recomendación de usar una contraseña robusta.
- Las contraseñas y sus hashes **nunca** se registran en logs ni se devuelven en respuestas HTTP.
- No hay endpoints de registro, recuperación de contraseña ni administración de usuarios.

### 15.4 JWT y expiración (AU-03)

- El token se envía como `Authorization: Bearer` (contrato, `bearerAuth`).
- Expira según `JWT_EXPIRES_IN`, **configurable**, con **8 horas** por defecto (AU-03; ARCHITECTURE; TK-00.1 la valida al arrancar). El momento de expiración viaja en la respuesta de `login`.
- Un token **ausente, inválido** (firma o formato) **o expirado** produce `UNAUTHORIZED` en cualquier operación protegida, sin efectos (contrato; CA-11).
- No hay renovación ni *refresh token*: al expirar, el operador inicia sesión de nuevo (AU-03).
- **Comprobación local de la expiración (DP-05, resuelta).** El frontend guarda el `expiresAt` devuelto por `login` junto al token y lo compara con la hora actual **al navegar a una ruta protegida** y **antes de cada petición protegida**. Si ya pasó:
  - elimina el token del estado de autenticación en memoria y de `localStorage`;
  - **no** envía la petición;
  - redirige a `/login` e **informa que la sesión expiró**.
- La comprobación local es una **ayuda de experiencia de usuario, no una frontera de seguridad**. El backend sigue validando la firma y la expiración del JWT, y su respuesta `UNAUTHORIZED` es la protección definitiva (§15.6).

### 15.5 Protección de operaciones y rutas

**Operaciones HTTP** (`docs/openapi.yaml`):

| Acceso | `operationId` |
|---|---|
| Públicas (`security: []`) | `getHealth`, `login`, `startChatSession`, `sendChatMessage` |
| Bearer JWT | `listProducts`, `createProduct`, `listStockAlerts`, `getProduct`, `updateProduct`, `deactivateProduct`, `adjustProductStock`, `listOrders`, `getOrder`, `changeOrderStatus` |

**Rutas del frontend** (ARCHITECTURE, "Frontend"): `/login` y `/chat` son públicas; `/dashboard`, `/dashboard/products` y `/dashboard/orders` son protegidas.

| Situación | Comportamiento |
|---|---|
| Ruta protegida sin token guardado (incluido el acceso directo por URL) | Redirige a `/login` sin llamar a la API (CA-11, caso sin sesión) |
| Ruta protegida con token guardado cuyo `expiresAt` ya pasó | Limpia la autenticación, redirige a `/login` e informa que la sesión expiró, sin llamar a la API (DP-05; CA-11, caso expirado) |
| Ruta protegida con token guardado y vigente | Muestra la pantalla; si la API responde `UNAUTHORIZED`, se aplica §15.6 |
| Ruta desconocida o `V2` | Con sesión válida, redirige a `/dashboard`; sin sesión válida, a `/login` (DP-07, §16.2) |
| Operación protegida sin token, con token inválido o expirado | `UNAUTHORIZED`, sin efectos (contrato) |
| Autorización | No existe un error de autorización en el MVP: rol único y sin respuesta de "prohibido" en el contrato |

### 15.6 Respuesta del frontend ante `UNAUTHORIZED` (D-07)

- `UNAUTHORIZED` en cualquier operación protegida: el frontend **descarta el token** (memoria y `localStorage`) y **redirige a `/login`** (TK-01.2, CA-11). Si varias peticiones lo reciben a la vez, el resultado es una sola redirección.
- `INVALID_CREDENTIALS` en `login` **no** es pérdida de sesión: la pantalla de login muestra el mensaje genérico y no ejecuta el cierre global de sesión.
- Ambos llegan con el mismo status HTTP (401). La lógica de autenticación los distingue por el **`code`** del error, no solo por el status ni por `message` (contrato; D-07; DP-05).

### 15.7 Almacenamiento del token

Decidido en ARCHITECTURE ("Frontend"): el token se guarda **en memoria y en `localStorage`**, de modo que sobrevive a una recarga de la página. Su exposición ante una vulnerabilidad XSS es una limitación conocida y aceptada del MVP (ARCHITECTURE, "Limitaciones conocidas"). No es una decisión pendiente.

### 15.8 Cierre de sesión

Definido por US-01 crit. 5 y el contrato ("cerrar sesión es una acción del cliente: descarta el token"):

- El layout ofrece **Cerrar sesión** (TK-01.2). Al usarlo, el frontend descarta el token de memoria y de `localStorage` y navega a `/login`.
- **No hay endpoint de logout ni revocación del JWT en el backend.** Un token copiado antes del cierre sigue siendo válido hasta su expiración (§14.2). Revocarlo exigiría un cambio de contrato y de arquitectura no aprobado.

## 16. Dashboard: estructura compartida y comportamiento de las pantallas

Esta sección define la **estructura compartida** del dashboard, la pantalla de login y el **comportamiento transversal** de las pantallas `MVP`. Las reglas de negocio de cada pantalla siguen en su spec responsable y no se repiten aquí.

### 16.1 Rutas y responsabilidades

| Ruta | Fase | Pantalla | Reglas de negocio | Qué define esta spec | Operaciones | Tickets |
|---|---|---|---|---|---|---|
| `/login` | `MVP` | Inicio de sesión | Esta spec (§15) | Todo (§16.3) | `login` | TK-01.2 |
| `/dashboard` | `MVP` | Inicio: panel de alertas, solo consulta | Spec 02 (F-6, IN-03, RN-09) | Ubicación, navegación y estados (§16.4) | `listStockAlerts` | TK-04.3 (spec 02) |
| `/dashboard/products` | `MVP` | Productos y ajuste de stock, con resaltado de stock crítico | Spec 02 (F-1..F-5, IN-01, IN-02; RN-09 en `listStockAlerts`; DP-04, DP-01, DP-02 y DP-06 de la spec 02, resueltas en la v1.2) | Ubicación, navegación, estados, resaltado por cruce de `id` con `listStockAlerts` y acciones sobre productos inactivos: editar y ajustar stock, sin reactivación (§16.4) | `listProducts`, `listStockAlerts`, `getProduct`, `createProduct`, `updateProduct`, `deactivateProduct`, `adjustProductStock` | TK-03.3 (spec 02) |
| `/dashboard/orders` | `MVP` | Pedidos y estados | Spec 04 (F-3..F-6, PE-01, PE-02; DP-02 de la spec 04, resuelta) | Ubicación, navegación y estados (§16.4) | `listOrders`, `getOrder`, `changeOrderStatus` | TK-06.4 (spec 04) |
| `/chat` | `MVP` | Simulador de chat (no es del operador) | Spec 03 | Solo el campo de teléfono (§6.3) | `startChatSession`, `sendChatMessage` | TK-05.4 (spec 03) |

La creación de las rutas y del cliente API centralizado corresponde a TK-00.2 (ARCHITECTURE).

### 16.2 Estructura compartida (layout autenticado)

- Envuelve las rutas protegidas. La protección de §15.5 se aplica **antes** de mostrar la pantalla.
- **Navegación (D-08):** Inicio (alertas), Productos y Pedidos, más **Cerrar sesión** (§15.8). Solo funciones `MVP` (ARCHITECTURE: "el menú del dashboard … muestra solo funciones `MVP`"); no hay entradas de clientes, reclamos ni reposición.
- Cada pantalla obtiene sus datos de la API al abrirse y solo muestra lo que la API devuelve (ARCHITECTURE: "el frontend no aplica reglas de negocio").
- **Identificación del operador (DP-09, resuelta).** El layout muestra el **nombre del operador** junto a **Cerrar sesión**. Usa el atributo `name` de `operator` devuelto por `login`, guardado junto al token, sin campos ni llamadas a la API adicionales.
- **Rutas desconocidas (DP-07, resuelta).** Una ruta que no existe en el MVP, incluidas las `V2` aún no implementadas, redirige a `/dashboard` si hay sesión válida y a `/login` si no la hay. No hay pantalla de "no encontrado" ni rutas adicionales.
- **Sin bucles de redirección.** "Sesión válida" significa token presente con `expiresAt` vigente. `/login` solo redirige a `/dashboard` con una sesión válida, y las rutas protegidas solo redirigen a `/login` sin ella. Cuando una redirección descarta el token (expiración local o `UNAUTHORIZED`), deja de haber sesión válida, así que `/login` muestra el formulario y no vuelve a redirigir.

### 16.3 Pantalla de inicio de sesión (`/login`)

| Estado | Comportamiento |
|---|---|
| Inicial | Formulario con email y contraseña vacíos |
| Error de validación local | Campo vacío o email sin formato de email: se indica junto al campo y **no se envía** la petición (validación básica de formato, ARCHITECTURE) |
| Enviando | El envío se deshabilita mientras la petición está en curso, para no duplicarla |
| Credenciales incorrectas | `INVALID_CREDENTIALS`: se muestra el mensaje genérico; no se guarda token y se permanece en `/login` |
| Error de validación del servidor | `VALIDATION_ERROR` o `MALFORMED_REQUEST`: mensaje de validación, sin cerrar el formulario |
| Error técnico | `INTERNAL_ERROR` o fallo de red: mensaje genérico sin detalles técnicos |
| Éxito | Guarda el token (§15.7) y navega a `/dashboard` (TK-01.2, US-01 crit. 1) |

**Al abrir `/login` (DP-06, resuelta):**

| Situación | Comportamiento |
|---|---|
| Sesión válida (token con `expiresAt` vigente) | Redirige a `/dashboard` |
| Sin token | Muestra el formulario |
| Token vencido | Limpia la autenticación y muestra el formulario |
| Llegada tras una expiración detectada (DP-05) | Muestra el formulario con el aviso de que la sesión expiró |

### 16.4 Estados transversales de las pantallas funcionales

Solo los estados que cada pantalla necesita. Los textos exactos se fijan en la implementación.

| Estado | `/dashboard` (alertas) | `/dashboard/products` | `/dashboard/orders` |
|---|---|---|---|
| Cargando | Indicador mientras llega `listStockAlerts` | Indicador mientras llega `listProducts` | Indicador mientras llega `listOrders` o `getOrder` |
| Datos disponibles | Lista de productos en alerta (spec 02) | Tabla de productos (spec 02) | Listado paginado y detalle (spec 04) |
| Sin resultados | Mensaje de que no hay productos en alerta | Mensaje de catálogo vacío | Sin pedidos, filtro sin resultados o página fuera de rango (lista vacía con totales, spec 04) |
| Error de validación | — | `VALIDATION_ERROR` en crear, editar o ajustar: junto al campo | `VALIDATION_ERROR` en filtro o cambio de estado: junto al control |
| Conflicto de negocio | — | `STOCK_CHANGED`: informa y recarga el stock (spec 02, TK-03.3) | `INVALID_ORDER_TRANSITION`: informa que el estado cambió y recarga el pedido (spec 04, DP-02) |
| Recurso no encontrado | — | `PRODUCT_NOT_FOUND`: informa y recarga la lista | `ORDER_NOT_FOUND`: informa y recarga la lista |
| Error técnico | Mensaje genérico, sin presentar datos antiguos como vigentes | Ídem | Ídem |

**Resaltado de stock crítico en `/dashboard/products` (DP-04 de la spec 02, resuelta en la v1.2).** RN-09 se aplica solo en el backend (`listStockAlerts`).

1. La pantalla solicita `listProducts` y `listStockAlerts` **en paralelo**.
2. Con los `id` devueltos por `listStockAlerts` identifica los productos en alerta.
3. Resalta **solo** las filas de `listProducts` cuyo `id` figura en esa respuesta.
4. **No** calcula `currentStock <= minStockAlert` ni evalúa `isActive` para decidir el resaltado.
5. Los productos inactivos no se resaltan porque `listStockAlerts` ya los excluye (RN-09, CA-01).

| Situación | Comportamiento |
|---|---|
| Falla `listProducts` | Estado de error técnico de la pantalla |
| Falla solo `listStockAlerts` | La tabla sigue visible, sin resaltado local, con un **aviso explícito** de que el indicador de stock crítico no está disponible. La falta de resaltado durante ese error **no** significa que no haya productos críticos |
| `UNAUTHORIZED` en cualquiera de las dos | Cierre de sesión (§15.6) |
| Un producto aparece en alertas pero no en el catálogo | Se ignora hasta la siguiente recarga |
| Creación, edición, desactivación o ajuste de stock exitosos | Se vuelven a solicitar ambas listas |
| `STOCK_CHANGED` o `PRODUCT_NOT_FOUND` | Se recargan ambas listas |

**Productos inactivos en `/dashboard/products` (DP-01 y DP-02 de la spec 02, resueltas en la v1.2).**

- Las filas de productos inactivos siguen visibles y ofrecen las acciones de **editar** (`updateProduct`) y **ajustar stock** (`adjustProductStock`, con `expectedStock`).
- **No** hay acción de reactivación: en el MVP la desactivación es irreversible.
- Editar o ajustar un producto inactivo no lo reactiva.
- Un producto inactivo **nunca se resalta** como stock crítico, porque `listStockAlerts` no lo devuelve; la pantalla no calcula RN-09.

**Limitación temporal.** Las dos lecturas son independientes y no ofrecen una fotografía transaccional común: entre una y otra el stock puede cambiar, por ejemplo por un pedido confirmado en el chat. Lanzarlas en paralelo reduce esa ventana, pero **no garantiza consistencia temporal**. Tampoco hay actualización en tiempo real: los cambios hechos desde el chat se ven en la siguiente recarga.
| No autenticado o sesión expirada | §15.6 | §15.6 | §15.6 |

### 16.5 Clasificación de errores (D-09)

| Tipo | Códigos del contrato | Presentación | ¿Cierra la sesión? |
|---|---|---|---|
| Autenticación en el login | `INVALID_CREDENTIALS` | Mensaje genérico en `/login` | No |
| Autenticación en operaciones protegidas | `UNAUTHORIZED` | Descarta el token y redirige a `/login` (§15.6) | Sí |
| Autorización | No existe en el MVP (rol único) | — | — |
| Validación | `MALFORMED_REQUEST`, `VALIDATION_ERROR` | Junto al formulario o control | No |
| Recurso no encontrado | `PRODUCT_NOT_FOUND`, `ORDER_NOT_FOUND`, `NOT_FOUND` | Informa y recarga la lista | No |
| Conflicto de negocio | `STOCK_CHANGED`, `INVALID_ORDER_TRANSITION` | Según la spec responsable (02 o 04) | No |
| Técnico | `INTERNAL_ERROR`, fallo de red | Mensaje genérico | No |

Las decisiones se toman por `code`; `message` es solo para mostrar (contrato).

### 16.6 Clientes en el dashboard

En el MVP no hay pantalla de clientes: se cargan por seed y la identificación por teléfono es interna (§7, §2.1). La gestión de clientes (CL-01) es `V2` (§14.3).

### 16.7 Exclusiones `V2`

| Ruta o función | IDs | Spec responsable | Tickets |
|---|---|---|---|
| `/dashboard/customers`: gestión de clientes | CL-01 | 05 (§14.3) | TK-02.2 |
| `/dashboard/claims`: reclamos | RE-01, RE-02 | 04 (§15.2) | TK-07.4 |
| `/dashboard/purchase-orders` y acción "Reponer" | IN-03 (`V2`), RP-01..RP-03 | 02 (§14) | TK-04.4 |

No existen en el MVP: sin rutas, entradas de menú, pantallas ni llamadas a la API. Si se abren por URL, se tratan como rutas desconocidas (DP-07).
