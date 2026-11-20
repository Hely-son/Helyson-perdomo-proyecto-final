# Registro de Prompts de IA — MedSupply AI

Este documento registra los prompts y la interacción con Claude (Anthropic) siguiendo la metodología **Spec-Driven Development (SDD)** para la generación del proyecto.

---

## Entrega 1 — Documentación Técnica y Especificaciones

### Prompt 1.1: Definición de Alcance y PRD

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
**Contexto/Rol:** Senior Product Manager y Arquitecto de Software.  
**Solicitud:**  
"Actúa como Senior Product Manager. Necesito redactar el PRD para un proyecto académico llamado MedSupply AI: una plataforma B2B de comercio de insumos médicos para clínicas/farmacias. El sistema cuenta con dos partes:
1. Un simulador de chat web (tipo WhatsApp) para clientes B2B pre-registrados con un bot determinista (FSM).
2. Un Dashboard Web de Operador en Ant Design para gestionar inventario, pedidos, reclamos y reposición.

Estructura el documento `docs/PRD.md` definiendo problema, usuarios, objetivos, alcance (incluido/excluido), requisitos funcionales identificados con IDs (`AU`, `CL`, `CH`, `IN`, `RP`, `PE`, `RE`), reglas de negocio (`RN-01` a `RN-11`) y criterios de aceptación del MVP (`CA-01` a `CA-11`).

Importante:  NO asumas nada hazme las preguntas y te las ire contestando 1 a 1 cuando tengas todo ok empieza a redactar el PRD, teniendo en cuenta que este es proyeto donde se buscara trabajar con claude y ssd, la idea es que el agente no tenga informacion duplicada o que le llene el contexto."
```

**Respuestas dadas a las preguntas de Claude (una por una):**

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿El producto incluye IA o solo el desarrollo? | Solo en desarrollo; el bot es un menú determinista |
| 2 | ¿Quién compra por el chat? | B2B: clínicas y farmacias |
| 3 | ¿Qué queda fuera del MVP? | WhatsApp real, pagos y facturación, logística de envíos, lotes y vencimientos |
| 4 | ¿El dashboard requiere autenticación? | Login con un solo rol, autenticación con JWT |
| 5 | ¿Cómo se identifica el cliente en el chat? | Clientes pre-registrados por el operador (razón social, documento, teléfono) |
| 6 | ¿Qué se valida al consultar o reclamar un pedido? | Que el pedido pertenezca al teléfono de la conversación |
| 7 | ¿Un pedido puede tener varios productos? | Sí, con carrito |
| 8 | ¿Cuándo se descuenta el stock? | Al confirmar el pedido, en transacción atómica; el carrito no reserva |
| 9 | ¿Transiciones y cancelación del pedido? | Lineal sin retroceso; el cliente cancela en `PENDING`, el operador en `PENDING`/`PROCESSING`; cancelar devuelve stock |
| 10 | ¿Sobre qué pedidos se reclama y con qué plazo? | Solo `DELIVERED`, sin plazo, un reclamo abierto por pedido |
| 11 | ¿Qué pasa al aprobar un reclamo? | Solo cambia de estado, con nota de resolución obligatoria |
| 12 | ¿Proveedores y reposición? | Sin entidad proveedor (texto opcional); `RECEIVED` suma stock automáticamente |
| 13 | ¿Catálogo y alertas? | Mostrar agotados como "Sin stock" sin permitir comprarlos; alerta cuando stock ≤ mínimo |
| 14 | ¿Stack? | React 18 + Ant Design + Express + Prisma; SQLite en dev, PostgreSQL en prod; chat con Ant Design, sin FloatUI |
| 15 | ¿Organización de la documentación? | `README.md` (humanos) + `docs/PRD.md` (producto) + `CLAUDE.md` (agente) + `specs/` |

**Decisiones propuestas por Claude y aceptadas:** `0` vuelve al menú y una entrada inválida repite la pregunta; formato de orden `MED-00001`; ajuste manual de stock (IN-02) para poder ejecutar CA-01; supuestos de moneda única sin impuestos, carrito que se pierde al reiniciar la conversación y datos iniciales por seed.

**Qué salió:** Genero el PRD con las decisiones solicitadas

### Prompt 1.2: Configuración del Contexto de Desarrollo (`CLAUDE.md`)

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
**Contexto/Rol:** Lead Architect & Developer Experience.  
**Solicitud:**  
"Genera un archivo `CLAUDE.md` para la raíz del repositorio que sirva como guía de contexto para Claude Code. Debe establecer el principio de Spec-Driven Development (SDD), definir la fuente de verdad mapeando el PRD y las specs (`specs/*.spec.md`), documentar el stack (React 18 + Vite + Antd, Express + TS, Prisma + SQLite/Postgres) y la arquitectura monolítica modular."
```

**Qué salió:** Genero el archivo claude con lo indicado

### Prompt 1.3: Estructura del `README.md` Principal

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
**Contexto/Rol:** Technical Writer / Evaluador Académico.  
**Solicitud:**  
"Genera la ficha formal del proyecto en `README.md` para la Entrega 1. Debe incluir la ficha técnica, descripción general, mapa de documentación del proyecto, enlace al PRD y el estado actual de la fase de especificación sin incluir código ejecutable aún."
```

**Qué salió:** Genero el archivo README con lo indicado

### Prompt 1.4: Revisión contra los requisitos de la Entrega 1

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
**Contexto/Rol:** Evaluador académico / Tech Lead.  
**Solicitud:**  
"Revisa si lo que está en este proyecto cumple con la Entrega 1 — Documentación técnica. Debe incluir: ficha del proyecto (nombre, descripción, URL del repo), descripción general del producto (objetivo, características, funcionalidades), arquitectura del sistema y modelo de datos, historias de usuario y tickets de trabajo, y stack tecnológico elegido. No incluye código: es 100% documentación. Dime qué falta y qué archivos debemos generar, respetando que el agente no reciba información duplicada. Considera como proyecto únicamente el directorio actual; ignora cualquier archivo o CLAUDE.md fuera de él."
```

**Qué salió:** Tabla de cumplimiento. Faltaban el modelo de datos, las historias de usuario y los tickets; la arquitectura y el stack estaban incompletos; la descripción general del README era insuficiente. Propuso crear `docs/ARCHITECTURE.md`, `specs/01_data_models.spec.md` y `backlog/`, y ajustar `README.md` y `CLAUDE.md`. No generó archivos.

### Prompt 1.5: Arquitectura del sistema y modelo de datos

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
**Contexto/Rol:** Arquitecto de Software.  
**Solicitud:**  
"A partir de `docs/PRD.md` y `CLAUDE.md` genera dos documentos, sin código. Cita los IDs del PRD (RN-, CH-, CA-…) en lugar de copiar su texto.

1. `docs/ARCHITECTURE.md`:
   - Vista general: monolito modular cliente-servidor con diagrama Mermaid. Cliente B2B → `/chat`, Operador → `/dashboard/*`, ambos en una sola SPA React. Backend Express `/api/v1` con rutas de chat públicas y rutas de operador con JWT, motor FSM con sesiones en memoria, servicios de dominio y Prisma hacia SQLite (dev/test) o PostgreSQL (prod).
   - Capas `routes → controllers → services → Prisma`: tabla con la responsabilidad y lo que NO debe hacer cada capa (incluido el FSM del chat).
   - Módulos `auth`, `customers`, `products`, `purchase-orders`, `orders`, `claims`, `chat`, mapeados a IDs del PRD y a las specs 02-05. Un módulo usa a otro solo vía su servicio.
   - Tabla general de endpoints por grupo (Auth, Chat, Customers, Products, Purchase orders, Orders, Claims) con su acceso. Sin endpoint de borrado; desactivar vía `POST /:id/deactivate`.
   - Decisiones transversales: formato de error `{ error: { code, message } }`; transacciones para RN-02, RN-05 y RN-11; descuento de stock con actualización condicional sin bloqueos; portabilidad SQLite/PostgreSQL; JWT HS256 + bcrypt.
   - Rutas del frontend, que no aplica reglas de negocio; un 401 redirige a `/login`.
   - Stack con justificación por capa. Agrega Zod (validación) y React Router (enrutado).
   - Estructura del repositorio (`backend/`, `frontend/`, `docs/`, `specs/`, `backlog/`, `CLAUDE.md`, `PROMPTS.md`), entornos y limitaciones conocidas (identidad por teléfono no verificada, sesiones en memoria).

2. `specs/01_data_models.spec.md`:
   - Cabecera con estado Borrador, reglas cubiertas y tickets TK-00.3 y TK-00.4.
   - Diagrama ER solo con relaciones: Customer–Order, Order–OrderItem, Product–OrderItem, Order–Claim, Product–PurchaseOrder, y User aislado.
   - Convenciones: modelos PascalCase y campos camelCase con `@map` a snake_case; `id` autoincremental, `createdAt` y `updatedAt` en todas; dinero en `Decimal(12,2)`; UTC; `onDelete: Restrict`; enums de Prisma.
   - Una tabla por entidad (campo, tipo, restricciones):
     - User: email único, passwordHash, name.
     - Customer: businessName, taxId único, phone único normalizado a E.164, isActive.
     - Product: name, description opcional, price > 0, currentStock ≥ 0, minStockAlert ≥ 0, isActive.
     - Order: orderNumber único = `MED-` + id con 5 dígitos, generado en la misma transacción; customerId en lugar de teléfono; status; totalAmount.
     - OrderItem: quantity > 0, unitPrice congelado, único (orderId, productId).
     - Claim: type, description, status, resolutionNote obligatoria al resolver, resolvedAt. La unicidad de reclamo OPEN se valida en el servicio.
     - PurchaseOrder: requestedQuantity > 0, supplierName opcional, status, sentAt, receivedAt.
   - CHECK constraints por SQL manual en la migración inicial, índices con su uso, lo que queda fuera del modelo persistente (sesión y carrito en memoria, auditoría) y un seed que permita ejecutar los CA."
```

**Qué salió:** `docs/ARCHITECTURE.md` y `specs/01_data_models.spec.md` con lo indicado.

### Prompt 1.6: Backlog de historias de usuario y tickets

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
**Contexto/Rol:** Product Owner / Scrum Master.  
**Solicitud:**  
"Genera el backlog en la carpeta `backlog/` a partir de `docs/PRD.md`, `docs/ARCHITECTURE.md` y `specs/01_data_models.spec.md`. Cubre todos los IDs del PRD citándolos, sin copiar su texto. Estructura:

- `backlog/README.md`: tabla resumen (orden, historia con enlace, requisitos, dependencias, puntos, total); escala de estimación; formato de ticket y capas (`INFRA`, `DB`, `API`, `UI`, `TEST`); definición de hecho (spec aprobada, tests + lint + typecheck, CA automatizados, commit que cita el ticket, spec actualizada).
- `backlog/00_habilitadores.md`: tickets técnicos previos, sin historia: backend, frontend, esquema Prisma + migración, seed idempotente, infraestructura de tests.
- 7 historias, una por archivo:
  - US-01_acceso_operador (AU)
  - US-02_gestion_clientes (CL)
  - US-03_catalogo_inventario (IN-01, IN-02)
  - US-04_alertas_reposicion (IN-03, RP)
  - US-05_compra_conversacional (CH-01..CH-07)
  - US-06_seguimiento_pedidos (CH-08, CH-09, PE)
  - US-07_gestion_reclamos (CH-10, RE)

Cada historia tiene:
- Cabecera con requisitos, reglas, criterios CA, puntos y dependencias.
- Historia 'Como / quiero / para'. US-06 y US-07 llevan una para el cliente y otra para el operador.
- Criterios de aceptación en formato Dado / Cuando / Entonces que citan RN- y CA-.
- Sección `## Tickets` dentro del mismo archivo.

Formato de ticket: `### TK-XX.N · [CAPA] Título`, con puntos, dependencias (ticket) y spec de referencia, una descripción de 1-2 líneas y 'Hecho cuando' con condiciones técnicas verificables. Cada historia termina con un ticket [TEST] que automatiza sus CA.

Estimación: puntos Fibonacci (1, 2, 3, 5, 8) por ticket, sumados por historia, con la referencia 1 punto ≈ 1 hora con Claude. 8 es el máximo; si se supera, se divide el ticket. Incluye una tabla con ejemplos por valor."
```

**Qué salió:** `backlog/` con README, habilitadores y 7 historias: 35 tickets y 91 puntos en total.

### Prompt 1.7: Actualización de `CLAUDE.md` y `README.md` para la Entrega 1

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
**Contexto/Rol:** Technical Writer / Developer Experience.  
**Solicitud:**  
"Actualiza `CLAUDE.md` y `README.md` para reflejar los documentos nuevos, sin duplicar contenido.

`CLAUDE.md` (se carga siempre, debe ser corto):
- Tabla 'Fuente de verdad': PRD (requisitos, RN, CA), ARCHITECTURE (componentes, módulos, API, stack), `specs/*.spec.md` (diseño detallado), `backlog/` (historias, tickets, estimación, definición de hecho).
- Reglas: citar IDs, incluidos los TK-; leer solo el ticket, su spec y las secciones del PRD citadas; si algo contradice el PRD, detenerse y preguntar; ignorar archivos fuera de este directorio.
- Flujo SDD en 5 pasos: requisito en PRD → spec aprobada por el usuario → un ticket a la vez según el backlog → tests primero y luego implementación → actualizar spec/PRD en el mismo cambio.
- Tabla de specs 01-05 con lo que cubre cada una; 01 en Borrador y el resto Pendiente.
- Convenciones: el stack en una línea, capas del backend con reglas RN solo en servicios, sin SQL exclusivo de un motor, commits que citan el ticket.
- Comandos: pendiente hasta TK-00.1 y TK-00.2.

`README.md` (entrada para el evaluador):
1. Ficha: nombre, descripción, tipo, autor Helyson Perdomo, URL del repositorio, metodología.
2. Descripción general: objetivo, características (validación estricta de stock, clientes pre-registrados, bot determinista, trazabilidad) y una tabla de funcionalidades Cliente B2B (chat) vs Operador (dashboard), con enlace al PRD.
3. Tabla 'Documentación de la Entrega 1' que mapee cada entregable a su documento, incluidos CLAUDE.md y PROMPTS.md.
4. Estado: Entrega 1 sin código; siguiente paso, specs 02-05 y backlog."
```

**Qué salió:** `CLAUDE.md` y `README.md` actualizados con lo indicado.

---

## Entrega 2.A — Actualizacion en base a observaciones de entrega 1

### Prompt 2.A.1: Auditoría integral sin modificaciones

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Actúa como arquitecto de software senior y revisor de proyectos bajo metodología Spec-Driven Development (SDD).
Antes de realizar cambios, inspecciona el repositorio y contrasta los documentos existentes.

Contexto documental
Fuentes de verdad:
docs/PRD.md: requisitos funcionales, reglas de negocio y criterios de aceptación.
docs/ARCHITECTURE.md: arquitectura, módulos, stack y decisiones técnicas.
specs/01_data_models.spec.md: modelo de persistencia.
CLAUDE.md: instrucciones y restricciones del agente.
backlog/README.md: planificación e historias.
backlog/00_habilitadores.md: infraestructura inicial.
backlog/US-01 a backlog/US-07: historias, criterios y tickets.
PROMPTS.md: registro de prompts y decisiones del desarrollo.
Las especificaciones specs/02 a specs/05 todavía no existen.

Objetivos de la auditoría
Verificar que los archivos reales coincidan con la documentación recibida.
Detectar contradicciones entre PRD, arquitectura, modelo de datos, CLAUDE.md y backlog.
Identificar requisitos sin cobertura en historias o tickets.
Identificar tickets sin trazabilidad a requisitos, reglas o criterios de aceptación.
Revisar dependencias y estimaciones.
Identificar decisiones técnicas incompletas o riesgos de implementación.
Identificar el impacto de reducir el alcance del MVP.
Verificar qué partes ya están cubiertas y cuáles faltan.

Observaciones de evaluación que debes considerar
Reducir el MVP a compra conversacional con validación de stock, creación de pedidos y dashboard mínimo.
Mantener login, catálogo, ajuste de stock, consulta y actualización de pedidos.
Mantener las alertas de stock como una consulta sencilla.
Evaluar para V2 la gestión completa de reclamos, órdenes de reposición, cancelaciones de clientes y pantalla de gestión de clientes.
Completar el diagrama ER con campos, PK y FK.
Definir contratos API completos y OpenAPI.
Utilizar PostgreSQL para desarrollo, testing y producción.
Probar concurrencia real en la confirmación de pedidos.
Incorporar evidencia de IA en implementación, testing, despliegue y mantenimiento.

Restricciones
No modificar ningún archivo.
No crear archivos.
No implementar código.
No asumir que una funcionalidad existe porque aparece en un documento.
No eliminar decisiones anteriores sin justificarlo.
Mantener los IDs existentes siempre que sea posible.
Distinguir claramente hechos, contradicciones, riesgos y recomendaciones.

Entregable
Presenta un informe con:
Inventario de documentos encontrados.
Matriz de consistencia documental.
Hallazgos críticos, altos y medios.
Mapa de impacto del cambio de alcance.
Decisiones que requieren aprobación humana.
Propuesta de secuencia de ajustes.
Lista exacta de archivos que deberán modificarse o crearse.
Finaliza esperando mi aprobación. No continúes automáticamente.
```

**Qué salió:** Resumen de problemas del proyecto, contradicciones, falta de definiciones, que puede o no aplicar, y a la espera de mis decisiones

### Prompt 2.A.2: Actualización del PRD a v1.1: alcance MVP y decisiones aprobadas

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Actúa como Product Owner técnico y Business Analyst senior, especializado en documentación de requisitos y trazabilidad bajo Spec-Driven Development (SDD).

Debes actualizar el PRD de MedSupply AI a la versión 1.1, incorporando las decisiones aprobadas para preparar la Entrega 2. En base a la propuesta que me indicaste modifica exclusivamente  `docs/PRD.md`

No modifiques ni crees ningún otro archivo.
Esta ejecución es exclusivamente documental. No implementes código, no crees specs, no actualices el backlog y no ejecutes migraciones.
Antes de editar, lee nuevamente el PRD completo y verifica los IDs y contenidos existentes.

## 2. Decisiones aprobadas

Estas decisiones están aprobadas por el responsable del proyecto. No debes volver a consultarlas ni sustituirlas por alternativas:
| ID | Decisión |
|---|---|
| D1 | RN-04 define un número de pedido único y creciente. Se permiten saltos cuando una transacción falla o se revierte. |
| D2 | Mantener los IDs originales y clasificar requisitos y criterios por fase MVP o V2. |
| D3 | La cancelación por operador permanece en el MVP para pedidos PENDING y PROCESSING, con restitución de stock. |
| D4 | Mantener Mis pedidos en el chat. Retirar la opción Reclamos del menú MVP. |
| D5 | Claim y PurchaseOrder son entidades de V2 y no forman parte del esquema físico inicial del MVP. |
| D6 | El contrato central de API será `docs/openapi.yaml`. |
| D7 | PostgreSQL será el motor de todos los entornos. Docker Compose para desarrollo local y PostgreSQL real en CI. |
| D8 | El despliegue de la entrega será local y reproducible mediante Docker Compose. No se utilizará plataforma externa. |
| D9 | El ajuste manual de stock será absoluto y utilizará `expectedStock` para control optimista. Si el stock actual no coincide, se devolverá conflicto HTTP 409. |
| D10 | Incorporar requisitos no funcionales con IDs `RNF-*` en el PRD. |
| D11 | El mercado objetivo es Chile. Utilizar E.164 y `+56` como prefijo por defecto cuando se ingresen números nacionales sin prefijo internacional. |
| D12 | El modelo Prisma seguirá llamándose `Order`, mapeado a la tabla física `orders`. |

## 3. Alcance funcional definitivo

### MVP

Mantener en el MVP:

- AU-01: autenticación del operador.
- AU-02: cuentas de operador seed y rol único.
- CL-02: validación de clientes activos por teléfono en el chat.
- CH-01 a CH-08: simulador conversacional, catálogo, carrito, confirmación y consulta de pedidos.
- IN-01: catálogo y administración de productos aprobada para el MVP.
- IN-02: ajuste manual de stock.
- IN-03: consulta de alertas de stock crítico, sin creación de órdenes de reposición.
- PE-01: consulta administrativa de pedidos y detalle.
- PE-02: avance de estado por operador y cancelación por operador bajo las condiciones de RN-05.
- CA-03 a CA-07, según su aplicabilidad al alcance aprobado.
- CA-11: protección del dashboard.

### V2

Diferir:

- CL-01: gestión CRUD de clientes desde el dashboard.
- CH-09: cancelación del pedido por el cliente desde el chat.
- CH-10: reclamos desde el chat.
- RE-01 y RE-02: gestión administrativa de reclamos.
- RP-01, RP-02 y RP-03: órdenes de reposición.
- Recepción de reposiciones y su correspondiente actualización de stock.
- Gestión completa de reclamos.
- Pantallas administrativas de funcionalidades V2.


El objetivo principal debe centrarse en:

- Compra conversacional.
- Validación de stock.
- Confirmación segura del pedido.
- Gestión operativa básica.
- Consulta de pedidos.
- Alertas de inventario.

No prometer cancelación por chat, reclamos ni reposición como capacidades del MVP.

Alcance incluido y excluido

Mantener las funcionalidades V2 dentro del documento, pero separarlas claramente del alcance MVP.
Utilizar una clasificación explícita:
`MVP` o `V2`.

No eliminar requisitos ni reutilizar sus IDs para funcionalidades distintas.
No eliminar estos requisitos ni sus IDs. Mantenerlos documentados y marcados como V2.
No hagas commit ni push.
Detente al finalizar y dame un resumen de los cambios, y siguiendo la propuesta proximos pasos-
```

**Qué salió:** Se actualizo el prd, con lo esperado para mvp y v2, nuevo alcance y objetivo diferenciacion clara.

### Prompt 2.A.3: Actualizacion de incosistencias

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Respecto a estas dudas se aclaran las definiciones

Clientes y compra conversacional
La gestión CRUD de clientes desde el dashboard pasa a V2.
Sin embargo, el MVP necesita consultar clientes activos por teléfono.
Incluir explícitamente una capacidad mínima de lectura/búsqueda de clientes por teléfono, que permita:
- Identificar al cliente.
- Comprobar que existe.
- Comprobar que está activo.
- Rechazar el acceso al chat cuando no está registrado o está desactivado.
Los clientes del MVP se obtendrán mediante seed.
La consulta de clientes debe ser una capacidad de dominio reutilizable. No debe depender de implementar toda la pantalla CRUD de clientes.

Teléfonos chilenos

- Usar `+56` para números nacionales sin prefijo internacional.
- Rechazar formatos ambiguos o inválidos.
- Aplicar la misma normalización al registrar/seedear clientes y al identificar clientes en el chat.


Chat
Mantener CH-08 para consultar pedidos propios.
La respuesta de Mis pedidos debe mostrar:
- Número de pedido.
- Estado.
- Ítems.
- Total.

No incluir estado del reclamo en la respuesta del MVP porque los reclamos pasan a V2.
Retirar la opción Reclamos del menú MVP. No mostrar una opción que prometa una funcionalidad todavía no implementada.
No incluir CH-09 en el flujo MVP.
No hagas commit ni push.
Detente al finalizar y dame un resumen de los cambios, y siguiendo la propuesta proximos pasos

```

**Qué salió:** Actualizacion de las dudas pricipales de claude, se indica las definiciones que faltan para poder continuar, se modifica unicamente el prd

### Prompt 2.A.4: Actualizacion de pedidos inventarios y reclamos

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Continuando con la fase de definiciones en cuanto a
Inventario y reposición
Dividir conceptualmente IN-03:
- La consulta y visualización de alertas permanece en MVP.
- La creación de órdenes de reposición pasa a V2.
Actualizar CA-01 para verificar únicamente que los productos activos con stock menor o igual al mínimo aparezcan en alertas.
Pasar CA-02 a V2 porque depende de la recepción de órdenes de reposición.

Pedidos y cancelaciones
Mantener la cancelación por operador en MVP.
Dividir claramente los comportamientos de RN-05 por actor y fase:
**MVP:**
- Avance de estado permitido.
- Cancelación por operador desde PENDING.
- Cancelación por operador desde PROCESSING.
- Restitución de stock en la cancelación.
**V2:**
- Cancelación por cliente desde el chat cuando el pedido está PENDING.
Mantener RN-05 y su trazabilidad. Si es necesario agregar subreglas o aclaraciones, hacerlo sin perder el ID original.
CA-08, que valida cancelación por cliente, pasa a V2.
Agregar un criterio de aceptación nuevo, con ID disponible, que verifique la cancelación por operador desde PROCESSING y la restitución de stock exactamente una vez.
No modificar arbitrariamente la máquina de estados ni permitir retrocesos.

Reclamos
Pasar CH-10, RE-01, RE-02, RN-06, RN-07, CA-09 y CA-10 a V2.
Mantener sus IDs y contenido funcional histórico.
Aclarar que no se implementará gestión de reclamos en el MVP.

RN-04: numeración de pedidos
Cambiar la semántica de consecutivo a único y creciente.
Definición propuesta:
"Cada pedido debe recibir un identificador único y creciente, generado por el backend, con el formato MED-00001. Se permiten saltos en la numeración cuando una transacción falla o se revierte."
La implementación utilizará un mecanismo compatible con PostgreSQL.
Solo sigue modificando el prd en base a las aclaraciones, no otro archivo, 
No hagas commit ni push.
Detente al finalizar y dame un resumen de los cambios, y siguiendo la propuesta proximos pasos

```

**Qué salió:** Se actualizo el prd, con respecto a los items indicados se indican propuestas, y observaciones pendientes

### Prompt 2.A.5: Actualizacion version PRD

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```

Crear una sección específica para requisitos no funcionales con IDs `RNF-01`, `RNF-02`, etc.

Incluir como mínimo:

- PostgreSQL como motor único en desarrollo, testing y producción.
- Contrato API centralizado y versionado en OpenAPI.
- Confirmación de pedidos atómica y resistente a concurrencia.
- Pruebas concurrentes reales contra PostgreSQL.
- Entorno local reproducible mediante Docker Compose.
- Validación automatizada mediante CI.
- Separación de responsabilidades y modularidad de la arquitectura.
- Seguridad básica de autenticación y manejo de secretos.
- Trazabilidad y evidencia verificable del uso de IA durante el ciclo de desarrollo, sin sustituir validaciones humanas.

Los requisitos deben ser verificables. Evita expresiones subjetivas como "el sistema debe ser rápido" si no existe un umbral medible aprobado.
No inventes objetivos de rendimiento ni disponibilidad que el proyecto no haya definido.

Para finalizar en base al nuevo prd marca los siguientes Criterios de aceptación

Clasificar los criterios existentes como MVP o V2.
Conservar IDs.
Asegurar que:
- CA-01 se limite a alertas.
- CA-02 pase a V2.
- CA-07 se mantenga si CH-08 sigue en MVP.
- CA-08 pase a V2.
- CA-09 y CA-10 pasen a V2.
- CA-11 permanezca en MVP.
- Exista un criterio para la cancelación por operador y restitución de stock.

Verificar que ningún criterio MVP dependa de una entidad o funcionalidad V2.

Validación obligatoria antes de finalizar

Después de modificar el PRD, realizar una auditoría interna:

1. Todos los requisitos existentes mantienen su ID.
2. Todos los requisitos tienen fase MVP o V2.
3. Todas las reglas RN-01 en adelante tienen una fase o una aclaración de aplicabilidad.
4. Todos los criterios de aceptación tienen fase.
5. No quedan reclamos ni reposición dentro del alcance MVP.
6. La cancelación por operador continúa en MVP.
7. La cancelación por cliente queda en V2.
8. La consulta de clientes por teléfono continúa en MVP.
9. La compra conversacional no depende del CRUD de clientes.
10. RN-04 no promete numeración sin saltos.
11. Los requisitos no funcionales tienen IDs y criterios verificables.
12. No existen referencias contradictorias entre objetivos, alcance y criterios.

## 7. Informe de salida

Al finalizar, presenta:

- Resumen de cambios.
- Requisitos que pasaron a V2.
- Requisitos que permanecen en MVP.
- Nuevos requisitos agregados.
- IDs nuevos asignados.
- Decisiones aplicadas.
- Contradicciones que aún requieren revisión.
- Verificación de que solamente se modificó `docs/PRD.md`.
- Estado de git antes y después, indicando si había cambios previos sin commit.

No hagas commit ni push.

Detente al finalizar y espera aprobación humana antes de continuar con la arquitectura y el modelo de datos.
```

**Qué salió:** Se hizo un resumen todo lo actualizado en el prd, unico archivo modificado, aun se piden ajustes o cambios para aplicar

### Prompt 2.A.6: Ajustes

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
En base a las observaciones y propuestas haz estos cambios: 

1. Incorporar el escenario de concurrencia con productos en orden inverso en RNF-04.
2. Crear CA-13 para STOCK_CHANGED.
3. Precisar los estados permitidos y la idempotencia de CA-12.
4. Ejecutar una validación final de consistencia y confirmar que solo cambió docs/PRD.md.
```

**Qué salió:** Se actualizo el prd, con lo esperado para mvp y v2, nuevo alcance y objetivo diferenciacion clara.

### Prompt 2.A.7: Actualizacion version PRD

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Se aprueba el contenido cambiado en el prd, por lo que actualiza la version y estado 
- Versión: 1.1.
- Estado: aprobado para elaboración de especificaciones de la Entrega 2, sujeto a la revisión humana de esta modificación.
- Registrar la fecha de actualización.
- Incluir un breve historial de cambios de v1.0 a v1.1.

en base a los cambios, reformular los objetivos del MVP para que describan exclusivamente lo que realmente se entregará.
```

**Qué salió:** Se actualizo el prd, con lo esperado para mvp y v2, nuevo alcance y objetivo diferenciacion clara.

### Prompt 2.A.8: Arquitectura y modelo de datos

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Tomando como fuente de verdad el `docs/PRD.md` v1.1 aprobado, actualiza los siguientes documentos para que reflejen fielmente el alcance MVP/V2 y las reglas de negocio definidas:

1. `docs/ARCHITECTURE.md`
2. `specs/01_data_models.spec.md`

### Instrucciones

**Arquitectura (`ARCHITECTURE.md`):**
- Ajustar módulos, responsabilidades y flujos al MVP aprobado.
- Diferenciar claramente funcionalidades MVP y V2.
- Reflejar PostgreSQL en todos los entornos.
- Considerar Docker Compose para ejecución local y GitHub Actions para CI.
- Mantener las decisiones tecnológicas y estructurales existentes, salvo que contradigan el PRD.

**Modelo de datos (`01_data_models.spec.md`):**
- Completar el modelo entidad-relación incluyendo atributos, PK, FK, restricciones e índices.
- Definir claramente las entidades y relaciones necesarias para el MVP.
- Mantener Claim y PurchaseOrder como diseño conceptual V2, sin incluirlas en el esquema físico inicial.
- Respetar las reglas de negocio, tipos de datos y convenciones ya definidas en el proyecto.
- Mantener el mapeo de Prisma `Order` a la tabla física `orders`.

### Restricciones

- El PRD v1.1 es la fuente de verdad. No modificarlo.
- No implementar código ni crear migraciones.
- No modificar OpenAPI, backlog, historias, tickets ni otros documentos.
- No inventar requisitos ni tomar decisiones funcionales que no estén definidas.
- Si encuentras contradicciones o decisiones pendientes, documentarlas y consultarlas antes de resolverlas.
- No hacer commit ni push.

### Validación

Al finalizar:
- Verificar consistencia entre PRD, arquitectura y modelo de datos.
- Identificar requisitos MVP sin soporte arquitectónico o de datos.
- Identificar elementos V2 que estén indebidamente incluidos en el esquema físico.
- Informar archivos modificados y decisiones pendientes.

Detente al finalizar y espera mi revisión antes de continuar.
```

**Qué salió:** Se actualizo los archivos arquitecture md y el spec 01, se indican decisiones que el modelo tomo por su cuenta y se me piden revsion y validacion, ya aplico dichos cambios.

### Prompt 2.A.9: Arquitectura y modelo de datos

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Aprobado los cambios y modificaciones que propusiste, actualice el prd de ser necesarios para no tener inconsistencias 
```

**Qué salió:** Se actualizo el prd, se indica que se valide la nueva version del prd 1.2

### Prompt 2.A.10: Version 1.2 prd

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Aprobado la nueva version del prd
```

**Qué salió:** Se actualizo la nueva version del prd 1.2, se indica que claude, readme el backlog estan deprecados, no reflejan los cambios que se han realizado en la version 1.2

### Prompt 2.A.10: Alineación documental con PRD v1.2

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Objetivo
Alinear la documentación operativa y el backlog del proyecto con el `docs/PRD.md` v1.2 aprobado, respetando las decisiones funcionales, arquitectónicas y de persistencia ya establecidas.
El PRD v1.2 es la fuente de verdad funcional. `docs/ARCHITECTURE.md` y `specs/01_data_models.spec.md` son las referencias técnicas aprobadas.

Archivos autorizados para modificar
1. `CLAUDE.md`
2. `README.md`
3. `backlog/README.md`
4. `backlog/00_habilitadores.md`
5. `backlog/US-01` a `backlog/US-07` (los archivos existentes correspondientes).
No modificar ningún otro archivo.

Actualizar CLAUDE.md
- Sustituir cualquier referencia a SQLite por PostgreSQL 16.
- Reflejar PostgreSQL en desarrollo, pruebas y entrega.
- Incorporar Docker Compose para los entornos locales.
- Reflejar GitHub Actions como mecanismo de CI.
- Corregir la asignación de requisitos y reglas de negocio a sus specs:
  - RN-02 y RN-04 corresponden a Spec 04, no a Spec 03.
- Corregir las referencias a tickets y especificaciones que hayan quedado obsoletas.
- Reformular la restricción sobre SQL para permitir expresamente funciones y características específicas de PostgreSQL cuando estén justificadas y documentadas en migraciones.
- Mantener las restricciones de seguridad, alcance y aprobación humana existentes.
- Mantener la separación entre especificación e implementación.

Actualizar README.md
Reflejar el estado real del proyecto:
- Objetivo y alcance MVP.
- Funcionalidades V2 explícitamente fuera del MVP.
- Arquitectura tecnológica aprobada.
- Estado actual: documentación y diseño; no asumir que existe implementación.
- Enlaces y referencias a PRD, arquitectura, specs y backlog.
- Eliminar descripciones de funcionalidades que fueron trasladadas a V2.

Actualizar backlog
Revisar `backlog/README.md`, `00_habilitadores.md` y las historias US-01 a US-07.
Requisitos
- Alinear historias, criterios de aceptación, tickets y dependencias con PRD v1.2.
- Incorporar los requisitos nuevos:
  - AU-03: expiración configurable del JWT de 8 horas.
  - CH-11: expiración de sesiones de chat por 30 minutos de inactividad.
  - CA-14: rechazo de productos desactivados antes de confirmar.
  - CA-15: nueva confirmación cuando cambia el precio.
  - CA-16: comportamiento ante sesión de chat expirada.
- Actualizar tickets existentes cuando los nuevos criterios correspondan a funcionalidades ya contempladas.
- Crear tickets nuevos solo cuando no exista uno que cubra el trabajo.
- Mantener los IDs originales de historias y tickets siempre que sea posible.
- Reflejar las fases MVP/V2 en historias y tickets.
- Revisar dependencias y estimaciones.
- Actualizar el total de puntos y horas después de los cambios.
- Mantener los criterios de DoD existentes y coherentes con el flujo SDD/TDD.

Consideraciones
- No devolver al MVP funcionalidades que el PRD v1.2 clasifica como V2.
- No crear tickets de implementación para decisiones que siguen pendientes.
- Los criterios de aceptación deben ser verificables.
- Las pruebas unitarias y de integración deben desarrollarse junto con cada funcionalidad. Los tickets `[TEST]` deben reservarse para pruebas E2E o validaciones transversales.
- Verificar que los tickets de concurrencia contemplen PostgreSQL real, solicitudes paralelas y ausencia de pedidos o descuentos parciales.
- Verificar que los tickets de confirmación contemplen `PRODUCT_INACTIVE` y `PRICE_CHANGED`.

Validación cruzada

Antes de finalizar, comprobar:
1. No existen referencias obsoletas a SQLite.
2. CLAUDE.md asigna correctamente cada regla a su spec.
3. README representa el MVP y V2 aprobados.
4. Todos los requisitos MVP del PRD tienen cobertura en historias y tickets.
5. Todos los tickets referencian requisitos y specs existentes.
6. Las dependencias entre historias y tickets son válidas.
7. Las estimaciones y totales están recalculados.
8. No existen funcionalidades V2 presentadas como MVP.
9. No se han modificado las decisiones funcionales aprobadas.
10. No se han creado ni modificado archivos fuera de la lista autorizada.

Restricciones
- No modificar PRD v1.2.
- No modificar ARCHITECTURE.md ni las specs.
- No crear OpenAPI todavía.
- No implementar código ni crear migraciones.
- No hacer commit ni push.
- No resolver decisiones funcionales pendientes por inferencia.
- No eliminar IDs históricos sin justificarlo.
- No realizar refactorizaciones o mejoras ajenas a esta alineación.
Reporte final

Entregar:
- Archivos modificados.
- Cambios realizados por documento.
- Requisitos y criterios incorporados al backlog.
- Tickets nuevos, modificados o retirados, con justificación.
- Dependencias y estimaciones actualizadas.
- Nuevo total de puntos y horas.
- Resultado de las diez validaciones cruzadas.
- Decisiones pendientes que continúan abiertas.
- Estado de Git antes y después.

Detente al finalizar y espera aprobación humana antes de comenzar OpenAPI.
```

**Qué salió:** Se mmodificaron todos los archivos involucrados, se presente un resumen y cambios, tambien decesiones pendiente, quedo a la espera de la aprobacion para pasar a open api

### Prompt 2.A.10: Cierre de alineación documental

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
La alineación con PRD v1.2 está aprobada conceptualmente. Necesito resolver únicamente dos observaciones:

1. Revisar TK-03.1: el filtro de productos activos/inactivos no tiene trazabilidad explícita en el PRD. Si no existe una justificación funcional aprobada, retirarlo del alcance del ticket.
2. Verificar que exista un ticket específico para construir y validar `docs/openapi.yaml`, conforme a RNF-02. Si no existe, crearlo con fase MVP, dependencias, estimación Fibonacci y criterios verificables.

No modificar ningún otro comportamiento ni ampliar el alcance.
Actualizar los totales si corresponde y validar nuevamente las dependencias y la trazabilidad.
No modificar PRD, arquitectura, modelo de datos ni CLAUDE.md.
No implementar código, no crear OpenAPI todavía y no hacer commit ni push.
Informar los cambios y detenerse para revisión humana.
```

**Qué salió:** Indico el resumen de los cambios aplicados, tambien que se debe crear el tk-008,  pide aprobar para continuar con open api

### Prompt 2.A.10: implementar ticket 008

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Antes de implementar, avanza con la construcción de docs/openapi.yaml, pero en dos pasos:
1. TK-00.8: generar y validar el contrato completo.
2. Revisión humana: contrastar el contrato contra PRD, arquitectura, modelo de datos y backlog. Aprobarlo antes de comenzar los endpoints.
```

**Qué salió:** Genero un nuevo archivo con el contrato del open api, cubre los 14 endpoints MVP y Claude dejó claro qué validaciones ejecutó y cuáles no.

### Prompt 2.A.11: Auditoria open api

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Objetivo
Realizar una revisión exhaustiva de `docs/openapi.yaml` contra la documentación funcional y técnica aprobada de MedSupply AI.
Esta tarea corresponde al paso 2 de TK-00.8: revisión humana del contrato antes de aprobarlo para implementación.
**En esta fase NO debes modificar ningún archivo.**

Archivos que debes revisar
Fuentes de referencia:
  - `docs/openapi.yaml`
  - `docs/PRD.md`
  - `docs/ARCHITECTURE.md`
  - `specs/01_data_models.spec.md`
  - Specs funcionales relevantes:
    - `specs/03_chat.spec.md`
    - `specs/04_orders.spec.md`
    - `specs/05_products.spec.md`
  - Backlog:
    - `backlog/00_habilitadores.md`
    - Historias y tickets relacionados con autenticación, chat, productos y pedidos.
 Si alguna ruta no existe, identifica el problema y continúa con los archivos disponibles. No inventes información.

Controles obligatorios
 ### A. Cobertura de endpoints
  - Verificar que estén todos los endpoints MVP definidos en la arquitectura.
  - Verificar que no existan endpoints exclusivos de V2.
  - Comparar método HTTP, ruta, autenticación y responsabilidad.
  - Identificar operaciones duplicadas o funcionalidades HTTP sin respaldo documental.
  ### B. Contratos de entrada y salida
  Para cada operación verificar:
  - Parámetros de ruta, query y headers.
  - Campos obligatorios y opcionales.
  - Tipos de datos y restricciones.
  - Esquemas de request y response.
  - Códigos HTTP.
  - Esquemas de error.
  - Ejemplos coherentes con el modelo de datos.
  No basta con que el YAML sea sintácticamente válido.

  ### C. Reglas de negocio
Verificar especialmente:
  - RN-02: productos activos al confirmar pedidos.
  - RN-03: cambios de precio requieren presentar un nuevo resumen y obtener confirmación.
  - RN-04: numeración MED- con al menos cinco dígitos, sin máximo y permitiendo saltos.
  - RN-09: ajuste absoluto de stock mediante `expectedStock` y conflicto `STOCK_CHANGED`.
  - RN-12: normalización telefónica con prefijo +56 predeterminado, preservando prefijos internacionales.
  - AU-03: expiración configurable del JWT, 8 horas por defecto.
  - CH-11: expiración configurable de sesiones, 30 minutos de inactividad por defecto.
  - CA-12/CA-13: cancelación y actualización de stock según las reglas aprobadas.
  - RNF-04: consistencia ante operaciones concurrentes.
  Verificar que los contratos HTTP no permitan saltarse estas reglas.

  ### D. Modelo de datos
  Contrastar los esquemas del contrato con `specs/01_data_models.spec.md`.
  Revisar:
  - IDs y tipos.
  - Relaciones.
  - Campos nullable.
  - Importes y precisión decimal.
  - Precio histórico de los artículos del pedido.
  - Número de pedido.
  - Estados permitidos.
  - Campos de auditoría.
  - Restricciones de stock y cantidades.
  No agregar campos por conveniencia si no existen en el modelo aprobado.

  ### E. Autenticación y seguridad
  - Bearer authentication en todas las rutas de operador.
  - Rutas públicas correctamente identificadas.
  - Respuestas 401 y 403 coherentes con el modelo de autorización.
  - No exponer datos sensibles del operador.
  - No exponer estados internos de sesiones.
  - Evitar respuestas que permitan enumerar clientes registrados.

  ### F. Errores y códigos
  Distinguir expresamente:
  1. Errores HTTP de la API.
  2. Resultados funcionales internos del flujo conversacional.

  Revisar particularmente:
  - `STOCK_INSUFFICIENT`
  - `PRODUCT_INACTIVE`
  - `PRICE_CHANGED`
  - `STOCK_CHANGED`
  - `SESSION_EXPIRED`
  - `SESSION_NOT_FOUND`

  Comprobar que los códigos, estados HTTP y mensajes no se contradigan.
  Evaluar la diferencia propuesta entre `SESSION_EXPIRED` y `SESSION_NOT_FOUND`: el resultado externo no debería depender de si el proceso de limpieza ya eliminó físicamente la
  sesión.

  ### G. Paginación y formatos
  Verificar que:
  - GET /orders tenga paginación documentada.
  - Los valores por defecto y máximos estén definidos.
  - La estructura de respuesta sea consistente.
  - Los productos estén ordenados según el contrato.
  - Los importes tengan un formato decimal explícito.
  - Los límites de longitud tengan respaldo documental.

  ### H. OpenAPI
  Verificar:
  - Versión OpenAPI.
  - `info.title` y `info.version`.
  - Prefijo `/api/v1`.
  - `operationId` únicos.
  - `$ref` válidos.
  - Parámetros de ruta declarados.
  - Respuestas documentadas.
  - Schemas reutilizables.
  - Ausencia de componentes innecesarios.
  - Ejemplos coherentes con los schemas.
  Ejecutar el validador oficial documentado en el archivo:
  `npx @redocly/cli@2.73.0 lint docs/openapi.yaml`
  Si no puedes ejecutarlo por permisos o falta de conectividad, informa expresamente que no se completó. No presentes las comprobaciones alternativas como equivalentes al
  validador oficial.

  ## 3. Clasificación de hallazgos
  Cada hallazgo debe tener:
  - ID.
  - Severidad: crítica, alta, media o baja.
  - Archivo y sección involucrados.
  - Regla o requisito afectado.
  - Comportamiento actual.
  - Comportamiento esperado.
  - Recomendación concreta.

  Distingue entre:
  - Contradicción con un requisito aprobado.
  - Decisión técnica pendiente de aprobación.
  - Omisión documental.
  - Mejora opcional.

  No conviertas preferencias técnicas en requisitos obligatorios.

  ## 4. Restricciones
  - No modificar archivos.
  - No modificar el PRD.
  - No modificar archivos.
  - No modificar el PRD.
  - No modificar arquitectura ni modelo de datos.
  - No modificar specs.
  - No modificar backlog.
  - No implementar endpoints.
  - No realizar commits ni push.
  - No resolver silenciosamente decisiones pendientes.

  ## 5. Entregable

  Presentar:
  1. Resumen ejecutivo.
  2. Matriz de cobertura de endpoints.
  3. Matriz de trazabilidad PRD → arquitectura/spec → OpenAPI.
  4. Hallazgos clasificados por severidad.
  5. Decisiones que requieren aprobación humana.
  6. Resultado exacto del validador oficial o motivo por el que no pudo ejecutarse.
  7. Dictamen final: APTO PARA APROBACIÓN, REQUIERE AJUSTES o NO APTO.

  Detente al finalizar el informe y espera autorización.
```

**Qué salió:** Genero una auditoria encontro decisiones y problemas, indica como ajustarlo, lo que recomienda, y queda a la espera de mis descisiones

### Prompt 2.A.12: Cambios en base a la auditoria

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
## Objetivo
Aplicar las decisiones aprobadas durante la revisión humana de `docs/openapi.yaml`.
El contrato fue auditado contra PRD v1.2, arquitectura, modelo de datos y backlog. El validador oficial Redocly confirmó que es válido, con dos avisos y ningún error.
Esta tarea debe aplicar exclusivamente las correcciones y decisiones autorizadas a continuación.

## 1. Archivo autorizado
Único archivo modificable:
- `docs/openapi.yaml`
No modificar ningún otro archivo.

## 2. Correcciones obligatorias
### H-01 — Unificar errores de sesión
Reemplazar `SESSION_EXPIRED` y `SESSION_NOT_FOUND` por un único código:
- `SESSION_INVALID`
- HTTP 404.

Aplicarlo consistentemente en:
- Operación `sendChatMessage`.
- Catálogo de códigos de error.
- Schemas.
- Ejemplos.
- Descripciones.

Una sesión inexistente, expirada todavía en memoria o eliminada por el proceso de limpieza debe producir exactamente el mismo resultado HTTP.
No exponer detalles internos del proceso de expiración o limpieza.

### H-02 — Rechazar importes iguales a cero
Modificar `MoneyInput` para que el patrón rechace importes iguales a cero.
Utilizar:
`^(?!0+\\.00$)\\d{1,10}\\.\\d{2}$`
Verificar expresamente:
- `0`: rechazado.
- `0.00`: rechazado.
- `00.00`: rechazado.
- `0.01`: aceptado.
- `1250.00`: aceptado.
- `9999999999.99`: aceptado.
Mantener la validación de backend y las restricciones de base de datos.

## 3. Decisiones aprobadas que deben quedar reflejadas
Aplicar, cuando corresponda, las siguientes decisiones:
- H-03: contrato `info.version: 1.0.0`, aprobado provisionalmente para chat y pedidos. Las futuras specs 03 y 04 deben alinearse con este contrato; cualquier cambio contractual debe revisarse antes de implementar.
- H-04: stock modificable exclusivamente mediante `PATCH /products/{id}/stock`, utilizando `expectedStock`.
- H-05: teléfono inválido o no normalizable produce la respuesta conversacional CH-02 y no crea sesión.
- H-06: aceptar la posible enumeración de clientes como limitación conocida del MVP, sin incorporar mecanismos de rate limiting en este cambio.
- H-07: `productName` representa el nombre actual del producto y `subtotal` es un campo derivado. No agregar persistencia de nombre histórico.
- H-08: aprobar los límites de longitud documentados: name 200, description 2000, chat text 500, phone 30, email 254 y password 200.
- H-09: productos ordenados por nombre ascendente; pedidos por fecha descendente.
- H-10: importes representados como strings decimales con dos posiciones.
- H-11: desactivar un producto ya inactivo devuelve 200 sin producir cambios adicionales.
- H-12: conservar `ChatReply.active`.
- H-13: página fuera de rango devuelve `items: []`; teléfono compuesto únicamente por espacios se trata como inválido.
- H-15: mantener 422 para un `sessionId` mal formado.
No inventar comportamientos adicionales.

## 4. Avisos del validador
No modificar el contrato para eliminar artificialmente los siguientes avisos:
- `info-license`: no inventar una licencia.
- `operation-4xx-response` en `/health`: aceptar el aviso mientras no exista un requisito que exija otro comportamiento.

## 5. Validación obligatoria
Ejecutar:
`npx @redocly/cli@2.73.0 lint docs/openapi.yaml`

Además, verificar:
- Todas las referencias `$ref`.
- Unicidad de operationId.
- Coherencia del catálogo de errores.
- Ausencia de referencias a SESSION_EXPIRED y SESSION_NOT_FOUND.
- Presencia de SESSION_INVALID en todos los lugares correspondientes.
- Casos válidos e inválidos de MoneyInput.
- Conservación de los 14 endpoints MVP.
- Ausencia de endpoints V2.

## 6. Restricciones
- No modificar PRD.
- No modificar arquitectura.
- No modificar modelo de datos.
- No modificar specs.
- No modificar CLAUDE.md ni README.md.
- No modificar backlog.
- No implementar endpoints.
- No crear archivos adicionales.
- No realizar commit ni push.

## 7. Informe final
Entregar:
1. Cambios aplicados.
2. Resultado exacto del validador.
3. Resultado de las comprobaciones adicionales.
4. Confirmación de que solo se modificó `docs/openapi.yaml`.
5. Estado de Git antes y después.
Detenerse al terminar. Esperar revisión y aprobación humana antes de cualquier otra modificación.
```

**Qué salió:** Se actualizo el open api, indico el resumen de todos los cambios aplicados, pide aprobar la version.

### Prompt 2.A.13: aprobar open api

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Queda aprobada la version del api, haz commit y push de los cambios
```

**Qué salió:** Genero la version en 1.0.0 y realizo commit y push, indico que claude, readme quedaron desactualizados

### Prompt 2.A.14: implementar ticket 008

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Corrige CLAUDE.md y README para reflejar openapi.yaml creado
```

**Qué salió:** ahora todo el sistema esta actualizado, indica hacer commit y push.

---

## Entrega 2.B — Creacion de spec faltantes antes de la implementacion

### Prompt 2.B.1: Revision Spec 01

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Realiza una auditoría final de `specs/01_data_models.spec.md` para determinar si está en condiciones de aprobarse como parte del diseño de Entrega 2 de MedSupply AI.

El objetivo es validar consistencia, completitud y trazabilidad. No debes reescribir el documento innecesariamente ni introducir decisiones de diseño nuevas sin autorización.

## 1. Fuentes de verdad

Contrasta la spec con:

- `docs/PRD.md` — versión aprobada v1.2.
- `docs/ARCHITECTURE.md`.
- `docs/openapi.yaml`.
- `specs/02_inventory_system.spec.md`.
- `CLAUDE.md`.
- Backlog vigente.

Si encuentras discrepancias, identifica cuál documento debe prevalecer según las responsabilidades definidas. No modifiques automáticamente las otras fuentes.

## 2. Auditoría funcional y de datos

Verifica:

### Entidades y alcance MVP/V2
- Que las entidades físicas MVP correspondan al diseño aprobado.
- Que `users`, `customers`, `products`, `orders` y `order_items` estén correctamente definidas.
- Que `Claim` y `PurchaseOrder` permanezcan exclusivamente como diseño conceptual V2.
- Que no se introduzcan entidades, tablas o relaciones V2 en el esquema físico MVP.

### Atributos y restricciones
- Que cada entidad tenga atributos, tipos, PK y FK.
- Que las restricciones UNIQUE, NOT NULL, CHECK y DEFAULT estén justificadas.
- Que las relaciones y cardinalidades sean consistentes.
- Que los índices respondan a consultas reales del sistema.
- Que no existan atributos duplicados o responsabilidades mal ubicadas.

###  Reglas de negocio
Verifica especialmente:
- Stock no negativo.
- Precio y cantidades válidas.
- Normalización telefónica RN-12 con prefijo predeterminado +56, preservando prefijos internacionales.
- Identificación de clientes mediante teléfono normalizado.
- Conservación del precio histórico en `order_items`.
- Numeración de pedidos `MED-` seguida de al menos cinco dígitos, sin máximo de longitud y con gaps permitidos.
- Restauración de stock por cancelación sin duplicar la operación.
- Estados y transiciones de pedidos.
- Coherencia de las restricciones físicas con RN-01, RN-03, RN-04, RN-05, RN-09, RN-10 y RN-12.

No conviertas comportamientos de servicios en restricciones de base de datos si no corresponde.

### PostgreSQL y Prisma
- PostgreSQL 16 como motor en todos los entornos.
- Compatibilidad de tipos, secuencias, índices y restricciones.
- Modelo Prisma `Order` mapeado a la tabla física `orders` mediante `@@map("orders")`.
- Estrategia de numeración de pedidos compatible con PostgreSQL.
- Coherencia entre el modelo conceptual, el físico y Prisma.
- Que no existan supuestos heredados de SQLite.

### Coherencia con otras fuentes
- Contrasta las entidades y campos utilizados por OpenAPI y arquitectura.
- Verifica que Spec 02 no describa operaciones incompatibles con el modelo.
- Identifica campos o relaciones requeridos por los flujos que no estén representados.
- Comprueba que no existan contradicciones entre las reglas documentadas y las restricciones físicas.

## 3. Decisiones pendientes
Revisa las decisiones abiertas del documento.
Clasifícalas en:
- Bloqueantes para aprobar Spec 01.
- No bloqueantes, que pueden resolverse durante la implementación.
- Fuera del alcance de esta spec.

No declares aprobada ninguna decisión que no tenga respaldo explícito.

## 4. Correcciones autorizadas

Puedes corregir errores documentales, inconsistencias, referencias rotas y omisiones que se puedan resolver inequívocamente con las fuentes aprobadas.
Si encuentras una decisión de diseño que requiere intervención humana:
- No inventes una solución.
- No la incorpores como aprobada.
- Documenta la pregunta y sus alternativas.
- Indica qué otros documentos podrían verse afectados.
No cambies el alcance MVP/V2 ni agregues requisitos.

## 5. Validación final
Comprueba:
1. Integridad de entidades, atributos, PK, FK y cardinalidades.
2. Coherencia de las restricciones físicas.
3. Consistencia con PostgreSQL 16 y Prisma.
4. Trazabilidad con PRD v1.2.
5. Consistencia con arquitectura y OpenAPI.
6. Compatibilidad con Spec 02.
7. Separación efectiva entre MVP y V2.
8. Ausencia de referencias inexistentes.
9. Ausencia de contradicciones internas.
10. Que no se hayan introducido requisitos ni decisiones nuevas.

## 6. Estado de aprobación
Si todas las validaciones pasan y no quedan decisiones bloqueantes:
- Actualiza el estado documental de Spec 01 a `Aprobada v1.1 (Entrega 2)`.
- Conserva la versión v1.1, salvo que las convenciones del repositorio exijan otro incremento.
- No cambies la versión por simples correcciones editoriales.
Si existen bloqueantes, conserva `Borrador v1.1 (Entrega 2), pendiente de aprobación` y entrega las preguntas necesarias.

## 7. Informe obligatorio
Entrega:
1. Resultado de la auditoría.
2. Cambios realizados, con secciones afectadas.
3. Validaciones ejecutadas y resultados.
4. Decisiones pendientes y cuáles son bloqueantes.
5. Impacto sobre Spec 02.
6. Estado de Git antes y después, demostrando que únicamente modificaste el archivo autorizado.
7. Veredicto explícito: APROBADA o PENDIENTE DE APROBACIÓN.
No avances a implementación.

```

**Qué salió:** Indico que el veredicto para esta spec era aprobado, dejo una seccion Puntos abiertos (no bloqueantes)

### Prompt 2.B.2: Elaboración de Spec 02: Sistema de inventario

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Actúa como **Software Architect y Business Analyst senior**, especializado en Specification-Driven Development (SDD).
Tu objetivo es elaborar la especificación funcional `specs/02_inventory_system.spec.md` para MedSupply AI, utilizando la documentación aprobada como fuente de verdad.

Esta fase corresponde exclusivamente al diseño y documentación funcional. **No debes implementar código ni avanzar a otras especificaciones.**

## 1. Contexto y fuentes de verdad
Antes de redactar, inspecciona y analiza:
- `CLAUDE.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/openapi.yaml`
- `specs/01_data_models.spec.md`
- `backlog/README.md`
- `backlog/00_habilitadores.md`
- `backlog/US-01.md` hasta `backlog/US-07.md`
- Las demás especificaciones existentes que sean relevantes, únicamente como referencia de estilo y consistencia.

Respeta la jerarquía documental y las decisiones aprobadas.
En caso de contradicción:
1. No inventes una solución.
2. Identifica las fuentes y los apartados contradictorios.
3. Registra el conflicto como una observación pendiente.
4. No modifiques los documentos fuente para resolverlo.

## 2. Alcance funcional de esta especificación
La Spec 02 debe describir el dominio de productos e inventario correspondiente al MVP.
Incluye, según corresponda a los requisitos aprobados:
- Consulta y visualización del catálogo de productos.
- Información funcional de los productos.
- Creación y mantenimiento de productos.
- Edición de información de productos.
- Activación y desactivación de productos.
- Consulta de disponibilidad y stock.
- Ajustes manuales de stock por parte del operador.
- Control de concurrencia mediante `expectedStock`.
- Tratamiento de conflictos cuando el stock haya cambiado.
- Reglas de integridad y consistencia.
- Comportamiento ante productos inactivos.
- Relación del inventario con el flujo de compra conversacional.
- Reglas de stock durante la confirmación de pedidos, cuando corresponda.

No agregues funcionalidades que no estén respaldadas por el PRD, la arquitectura o el backlog.

### Límites MVP/V2
- Mantén explícitamente diferenciadas las funcionalidades MVP y V2.
- No incluyas como implementables en MVP las funcionalidades marcadas V2.
- No crees endpoints, entidades, campos o reglas nuevas para satisfacer supuestos.
- Conserva los identificadores existentes.

## 3. Contrato HTTP
`docs/openapi.yaml` es la fuente única de verdad para los contratos HTTP.
Para cada operación relacionada con productos e inventario:
- Referencia su `operationId`.
- Explica su propósito funcional.
- Describe las reglas de negocio involucradas.
- Explica los escenarios de éxito y error.
- Identifica las precondiciones y efectos secundarios.
- Relaciona la operación con los requisitos y criterios de aceptación correspondientes.
No dupliques en esta spec:
- Estructuras JSON de request.
- Estructuras JSON de response.
- Schemas.
- Códigos HTTP.
- Definiciones de parámetros.
Cuando sea necesario, referencia el componente o `operationId` correspondiente de OpenAPI.
Si detectas una operación necesaria para el comportamiento funcional que no existe en OpenAPI, registra la brecha. No modifiques el contrato.

## 4. Reglas de negocio y trazabilidad
Identifica y documenta las reglas de negocio relevantes, especialmente las relacionadas con:
- Productos activos e inactivos.
- Restricciones de modificación del stock.
- Ajustes absolutos de stock.
- Validación de `expectedStock`.
- Conflictos `409 STOCK_CHANGED`.
- Stock no negativo.
- Integridad entre inventario y pedidos.
- Productos que se desactivan mientras están en un carrito.
- Productos que no pueden utilizarse al confirmar una compra.
Utiliza los identificadores existentes del PRD y del backlog.
Cada regla debe poder rastrearse hasta su requisito, criterio de aceptación, operación HTTP y ticket cuando exista esa relación.
No inventes identificadores ni reutilices identificadores para conceptos diferentes.

## 5. Estructura esperada del documento
Adapta la estructura a los estándares existentes del repositorio, procurando incluir:
1. Identificación y objetivo de la especificación.
2. Alcance MVP y exclusiones V2.
3. Actores y responsabilidades.
4. Conceptos y terminología del dominio.
5. Reglas de negocio.
6. Flujos funcionales.
7. Comportamientos y escenarios alternativos.
8. Operaciones HTTP relacionadas, referenciadas por `operationId`.
9. Manejo de errores y situaciones excepcionales.
10. Integridad y consistencia de datos.
11. Criterios de aceptación y escenarios verificables.
12. Matriz de trazabilidad con PRD, OpenAPI y backlog.
13. Supuestos, restricciones y decisiones pendientes.
Utiliza tablas cuando faciliten la trazabilidad.
Los escenarios verificables deben ser suficientemente precisos para convertirse posteriormente en pruebas funcionales o automatizadas.

## 6. Aspectos que requieren especial atención
No des por sentado lo siguiente:
- Que un producto inactivo puede agregarse al carrito.
- Que desactivar un producto elimina automáticamente su stock.
- Que un ajuste manual de stock puede sobrescribir cambios concurrentes.
- Que el stock puede modificarse mediante la edición general del producto.
- Que un producto puede eliminarse físicamente.
- Que los pedidos existentes pierden su integridad cuando cambia el catálogo.
- Que la desactivación de un producto permite confirmar una compra previamente iniciada.
Contrasta cada comportamiento con las decisiones aprobadas.
Si una situación no está definida, documenta la incertidumbre y evita decidir unilateralmente.

## 7. Restricciones de ejecución

Esta tarea autoriza exclusivamente:
`specs/02_inventory_system.spec.md`

No modificar:
- PRD.
- Arquitectura.
- OpenAPI.
- Spec 01.
- Otras specs.
- CLAUDE.md.
- README.
- Backlog.
- PROMPTS.md.
- Código fuente.
- Migraciones.
- Seeds.
- Tests.
- Configuraciones.
No ejecutar implementación.
No crear tickets nuevos.
No realizar commit ni push.

## 8. Validación obligatoria
Antes de finalizar:
1. Verifica que todos los identificadores referenciados existan.
2. Comprueba que los `operationId` citados existan en `docs/openapi.yaml`.
3. Comprueba que no se dupliquen contratos HTTP.
4. Comprueba que no se introduzcan requisitos nuevos.
5. Comprueba la separación MVP/V2.
6. Comprueba que no existan contradicciones con PRD, arquitectura y modelo de datos.
7. Comprueba que los escenarios sean verificables.
8. Comprueba que la matriz de trazabilidad no tenga referencias inexistentes.
Si detectas inconsistencias, enuméralas como pendientes; no las resuelvas modificando otras fuentes.

## 9. Informe final
Al terminar, presenta:
- Resumen de la especificación creada.
- Secciones incorporadas.
- Requisitos y reglas cubiertos.
- `operationId` referenciados.
- Tickets relacionados.
- Escenarios de aceptación documentados.
- Decisiones pendientes y contradicciones detectadas.
- Resultado de cada validación.
- Confirmación de que únicamente se modificó `specs/02_inventory_system.spec.md`.
- Confirmación de que no se realizó commit ni push.
**Importante:** esta fase termina cuando la especificación está redactada y auditada. No continúes con implementación. Espera la revisión y aprobación humana.
```

**Qué salió:** Creo el archivo de inventory, indico, resumen, decisiones, tambien las inconsitencias encontradas, indico caminos para resolverlas.

### Prompt 2.B.3: Solventar inconvenientes Spec 02

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
# Ajustes de revisión — Spec 02 Sistema de inventario

Realiza una revisión final de `specs/02_inventory_system.spec.md` 
## Ajustes solicitados
1. **Cobertura:** incorpora CA-04 en la cabecera de cobertura, ya que está referenciado en F-7 y en la matriz de trazabilidad.
2. **ESC-08:** ajusta el escenario para verificar que no existe una operación de borrado y que el producto permanece intacto. No impongas un código HTTP que no esté definido en el contrato.
3. **ESC-28:** ajusta la condición de aceptación para verificar que las solicitudes concurrentes finalizan correctamente, sin errores internos expuestos y con stock consistente. No interpretes los bloqueos internos normales de PostgreSQL como fallos.
4. **DP-04:** conserva la decisión pendiente. Puedes documentar como alternativa recomendada que el dashboard utilice `listStockAlerts` y relacione sus resultados con `listProducts` mediante el ID del producto. No introduzcas un campo nuevo ni cambies el contrato.
5. **OBS-02 y OBS-03:** conserva ambas observaciones documentales. No modifiques otras fuentes ni declares aprobaciones que todavía no se hayan confirmado.
6. Revisa que las decisiones pendientes DP-01 a DP-06 estén correctamente identificadas y que ninguna se presente como una decisión aprobada sin respaldo.

## Validación final

Comprueba:
- Que los 31 escenarios continúan presentes.
- Que los IDs y referencias del PRD existen.
- Que los operationId utilizados existen en `docs/openapi.yaml`.
- Que la trazabilidad entre requisitos, criterios, tickets y escenarios no se haya deteriorado.
- Que no se hayan incorporado requisitos nuevos.
- Que MVP y V2 sigan claramente separados.
- Que no existan contradicciones internas después de los ajustes.

Entrega un informe con:
1. Cambios realizados.
2. Validaciones ejecutadas y resultados.
3. Decisiones que siguen requiriendo aprobación humana.
4. Estado de Git antes y después, demostrando que únicamente modificaste el archivo autorizado.

No hagas ninguna implementación.

```

**Qué salió:** aplico lo solicitado, dio el resumen. pero indica que aun hay decisiones que no estan cerradas.

### Prompt 2.B.4: Cierre documental Spec 02

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Realiza el cierre documental de `specs/02_inventory_system.spec.md` y actualiza el estado correspondiente en `CLAUDE.md`.
## Alcance autorizado
Puedes modificar exclusivamente:
- `specs/02_inventory_system.spec.md`
- `CLAUDE.md`
No modifiques PRD, arquitectura, OpenAPI, Spec 01, otras specs, backlog ni código fuente.
No realices commits ni push.
## 1. Actualización de Spec 02
- Actualiza OBS-02 para reflejar que Spec 01 está aprobada v1.1.
- Revisa que no existan referencias adicionales que indiquen que Spec 01 sigue en borrador.
- Verifica que el modelo de datos aprobado no contradiga ninguna definición de inventario.
- Conserva OBS-03 si sigue siendo válida.
- Conserva DP-01 a DP-06 como decisiones pendientes. No las apruebes implícitamente.
- No introduzcas requisitos ni decisiones nuevas.
Si no aparecen nuevas contradicciones, actualiza el estado de Spec 02 a `Aprobada v1.0 (Entrega 2)`.
Si aparece alguna contradicción bloqueante con Spec 01, conserva el estado pendiente y documenta el problema.
## 2. Actualización de CLAUDE.md
Actualiza exclusivamente la referencia al estado de Spec 01 para que indique:
`Aprobada v1.1 (Entrega 2)`
Actualiza también el estado de Spec 02 únicamente si su revisión permite aprobarla.
No cambies otras referencias ni estados documentales.
## 3. Validación
Comprueba:
- Coherencia de Spec 02 con Spec 01 aprobada.
- Referencias y estados documentales correctos.
- Conservación de los 31 escenarios ESC-01 a ESC-31.
- Trazabilidad de requisitos, criterios y tickets.
- Separación MVP/V2.
- Ausencia de contradicciones internas.
- Que no se hayan introducido decisiones nuevas.
## 4. Informe
Entrega:
1. Cambios realizados.
2. Estado final de Spec 01 y Spec 02.
3. Decisiones que siguen pendientes.
4. Validaciones ejecutadas.
5. Estado de Git antes y después, demostrando que solo modificaste los archivos autorizados.
No avances  a implementación.
```

**Qué salió:** La spec 02 queda en Aprobada v1.0 (Entrega 2). Al revisarla contra la spec 01 aprobada no apareció ninguna contradicción.

### Prompt 2.B.5: Inicializar especificación Spec 03

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Crea el archivo `specs/03_conversational_bot.spec.md` en estado de Borrador v1.0 (Entrega 2), pendiente de aprobación. 
- Lee y valida el contenido y restricciones de: docs/PRD.md (v1.2), docs/ARCHITECTURE.md, docs/openapi.yaml (v1.0.0), specs/01_data_models.spec.md (v1.1), specs/02_inventory_system.spec.md (v1.0) y CLAUDE.md.
- Define la sección de Propósito y Alcance del módulo conversacional para el MVP de Entrega 2.
- No modifiques ningún otro archivo del repositorio.
```

**Qué salió:** Creación del archivo specs/03_conversational_bot.spec.md con la estructura base, el encabezado oficial y la sección de fuentes de verdad validadas.

### Prompt 2.B.6: Definicfiones para spec 3

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Edita el archivo `specs/03_conversational_bot.spec.md` para redactar las secciones de:
1. Identificación del cliente: Inicio mediante teléfono, normalización conforme a RN-12 (aplicando prefijo +56 por defecto para números nacionales sin código internacional, conservando los existentes), coincidencia por teléfono normalizado y tratamiento de clientes inexistentes/teléfonos inválidos (sin crear sesiones para no identificados).
2. Ciclo de vida de la sesión: Creación, estados, TTL configurable mediante CHAT_SESSION_TTL_MINUTES (30 min por defecto), renovación de actividad, manejo de sesiones expiradas y coherencia con SESSION_INVALID y el contrato OpenAPI.
- Respeta estrictamente el aislamiento de estados y no inventes persistencia no definida.
```

**Qué salió:** Las secciones 2 y 3 redactadas y documentadas dentro del archivo markdown de la spec.

### Prompt 2.B.7: Navegación, Catálogo e Integración con Inventario (Spec 02)

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Edita el archivo `specs/03_conversational_bot.spec.md` para documentar:
1. Navegación y catálogo: Menú inicial, consulta de productos, precios, disponibilidad y stock.
2. Delegación estricta al módulo de inventario de la Spec 02 (sin duplicar sus reglas) para verificar productos activos/inactivos y existencias.
3. Tratamiento de productos inexistentes o inactivos durante la navegación del usuario.
```

**Qué salió:** La sección 4 de la spec integrada con el comportamiento de inventario de la Spec 02.

### Prompt 2.B.8: Gestión del Carrito de Compras

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Edita el archivo `specs/03_conversational_bot.spec.md` incorporando la sección del Carrito:
- Operaciones permitidas: Agregar productos, modificar cantidades, eliminar productos y consultar resumen.
- Validaciones en vivo: Cantidades, disponibilidad y estado activo.
- Regla crítica: Especifica claramente qué sucede cuando un producto previamente agregado al carrito se desactiva antes de la confirmación (debe rechazarse y excluirse).
- Coherencia estricta entre el estado del carrito y la sesión.
```

**Qué salió:** La sección 5 redactada con las reglas del carrito y el manejo de productos desactivados.

### Prompt 2.B.9: Confirmación de Compra y Ciclo de Pedidos

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Edita el archivo `specs/03_conversational_bot.spec.md` para la Confirmación de Compra y Pedidos:
- Revalidación obligatoria de stock, estado activo y precios vigentes frente al resumen previo.
- Comportamiento ante variación de precios: exigencia de un nuevo resumen y segunda confirmación obligatoria.
- Creación del pedido solo tras confirmación válida del cliente, utilizando el formato de numeración MED- seguido de al menos 5 dígitos.
- Manejo de confirmaciones simultáneas/mensajes repetidos y respuesta conversacional de éxito.
- Reglas para la consulta de pedidos propios del cliente (restringiendo acceso cruzado).
```

**Qué salió:** Las secciones 6 y 7 con el flujo completo de checkout, precios y pedidos.

### Prompt 2.B.10: Máquina de Estados Conversacional y Diagrama Mermaid

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Edita el archivo `specs/03_conversational_bot.spec.md` para incluir:
- La máquina de estados conversacional detallando para cada estado: ID, descripción, datos que conserva, mensajes/opciones permitidas, eventos, estados de destino, condiciones de transición y manejo de eventos inválidos.
- Distinción clara entre estado de sesión, de conversación, del carrito y del pedido (sin mezclarlos).
- Inclusión del diagrama Mermaid que represente visualmente el flujo principal.
```

**Qué salió:** La sección 4 (o equivalente) de la spec con la definición formal de estados y el diagrama Mermaid funcional.

### Prompt 2.B.11: Manejo de Errores, Contrato OpenAPI y Trazabilidad

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Edita el archivo `specs/03_conversational_bot.spec.md` para completar:
1. Manejo de errores y situaciones límite (teléfono inválido, sesión expirada, stock insuficiente, cambio de precio, etc.).
2. Relación de operationId de docs/openapi.yaml con su responsabilidad funcional y momento del flujo.
3. Escenarios concretos con identificadores estables y matriz de trazabilidad (PRD, reglas, OpenAPI, backlog y escenarios).
4. Separación explícita de MVP y V2 (excluyendo claims y cancelaciones de cliente del MVP).
5. Registro formal de decisiones pendientes (DP) y estado documental final en Borrador v1.0.
```

**Qué salió:** La especificación completamente finalizada, lista para la validación documental y el informe final.

### Prompt 2.B.12: Auditar Decisiones de Diseño en Spec 03

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Realiza una revisión exclusivamente documental (sin modificar archivos, ni hacer commits) leyendo `specs/03_conversational_bot.spec.md` junto con `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/openapi.yaml`, `specs/01_data_models.spec.md` y `specs/02_inventory_system.spec.md`.
Extrae las 12 decisiones de diseño (D-01 a D-12) de Spec 03 y construye una tabla detallada con:
- ID.
- Descripción exacta y completa.
- Justificación funcional o técnica.
- Fuente que la respalda (PRD, arquitectura, OpenAPI, otra spec o decisión explícita).
- Estado de respaldo: si ya está cubierta por una decisión previamente aprobada o si requiere aprobación humana explícita (no presentes recomendaciones de Claude como decisiones aprobadas).
- Consecuencia de aprobarla.
Guarda este análisis en memoria para el informe final. No declares la Spec 03 aprobada.
```

**Qué salió:** Una tabla estructurada con las 12 decisiones de diseño de la Spec 03 trazadas contra su documento fuente, diferenciando claramente cuáles ya tienen respaldo oficial y cuáles dependen de validación humana.

### Prompt 2.B.13: Auditar Decisiones Pendientes y su impacto

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Continuando con la revisión documental de `specs/03_conversational_bot.spec.md` y cruzando con `backlog/README.md` y los tickets del flujo conversacional (sin editar ningún archivo):
Extrae las 11 decisiones pendientes de aprobación (DP-01 a DP-11), conservando su numeración exacta sin combinarlas. Para cada una genera una ficha o fila de tabla con:
- ID y pregunta exacta que debe resolver el usuario.
- Contexto y escenario afectado en Spec 03.
- Alternativa recomendada por Claude y otras alternativas viables.
- Impacto desglosado en: requisitos, UX, arquitectura, API, pruebas y backlog.
- Tickets o escenarios dependientes.
- Nivel de bloqueo: indica si bloquea la aprobación total de Spec 03 o solo una parte de la implementación.
No resuelvas ninguna decisión en nombre del usuario.
```

**Qué salió:** El inventario completo de las 11 decisiones pendientes (DP-01 a DP-11) con matriz de impacto técnico/funcional y nivel de criticidad/bloqueo para cada una.

### Prompt 2.B.14: Detección de Observaciones y Brechas Documentales

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Analiza `specs/03_conversational_bot.spec.md` frente al resto de la documentación (`PRD.md`, `ARCHITECTURE.md`, `openapi.yaml`, `Spec 01`, `Spec 02` y `backlog`) en modo solo lectura.
Extrae por separado todas las observaciones (OBS) y brechas detectadas, clasificándolas estrictamente bajo estas categorías:
- Contradicción documental.
- Dependencia pendiente.
- Brecha de cobertura de pruebas.
- Decisión de UX pendiente.
- Deuda documental que no bloquea la aprobación.
- Riesgo técnico.
Para cada hallazgo detalla su impacto concreto en el proyecto y la acción recomendada para mitigarlo.
```

**Qué salió:** Listado categorizado de todas las observaciones y brechas (OBS), separando los riesgos bloqueantes de la deuda documental menor.

### Prompt 2.B.15: Ejecutar Validación Cruzada de Reglas Críticas y Contrato OpenAPI

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Sin modificar ningún archivo del repositorio, realiza una auditoría de cumplimiento cruzado sobre `specs/03_conversational_bot.spec.md` verificando punto por punto:
1. Reflejo exacto de reglas confirmadas sobre producto inactivo (rechazo en confirmación) y cambio de precio (nuevo resumen + segunda confirmación).
2. Formato estricto de numeración de pedidos (`MED-` seguido de mínimo 5 dígitos, sin límite máximo).
3. Configuración del TTL de sesión (`CHAT_SESSION_TTL_MINUTES` con 30 min por defecto).
4. Imposibilidad de crear pedidos sin confirmación válida del cliente y prevención de duplicados ante confirmaciones concurrentes.
5. Coherencia total entre los flujos descritos y los endpoints/errores de `docs/openapi.yaml`.
6. Dependencia estricta de la normalización telefónica con RN-12 sin introducir reglas paralelas.
7. Separación explícita entre alcance MVP y funcionalidades V2 (Claims y cancelaciones fuera de MVP).
Documenta cualquier desviación o confirmación de cumplimiento.
```

**Qué salió:** Un checklist de auditoría técnica que certifica si las 8 reglas críticas del proyecto se cumplen sin contradicciones frente a OpenAPI, Spec 01 y Spec 02.

### Prompt 2.B.12: Generar Informe Final de Revisión para Aprobación Humana

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Consolida todos los hallazgos de los pasos anteriores en un informe estructurado en consola (sin modificar ningún archivo del repositorio, sin commits y sin declarar aprobada la Spec 03) siguiendo exactamente este orden:
1. Resumen ejecutivo del estado actual de `specs/03_conversational_bot.spec.md`.
2. Tabla completa de Decisiones de Diseño (D-01 a D-12).
3. Tabla completa de Decisiones Pendientes (DP-01 a DP-11).
4. Listado clasificado de Observaciones (OBS) y gaps.
5. Riesgos críticos que podrían bloquear la aprobación funcional.
6. Recomendación clara sobre qué decisiones debería aprobar el usuario de inmediato y cuáles conviene mantener pendientes para etapas posteriores.
Verifica con `git status` que el repositorio permanece intacto.
```

**Qué salió:** El informe de auditoría completo y ordenado listo para ser presentado como entregable y servir de guía para la toma de decisiones humanas, acompañado de la evidencia de que el repositorio no fue alterado.

### Prompt 2.B.13: Aprobar spec 3

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Segun el informe de auditoria, anterior, aplica los cambios a la spec 2 y llevala a la version 1.1, despues haz una validacion de las 3 specs. segun la documentacion, buscando incosistencia entre estas, en caso de que  hayas alguna inconsistencia, indica cual, porque riesgos, posibles mitigaciones, marca la specs con problemas como rechazada, en caso de que las 3 esten aprobadas, marca la spec 3 como aprobada.
```

**Qué salió:** Encontro inconsistencias, tareas subestimadas con la spec 3, por lo que la dejo rechazada, lanzo un plan de correccion, y pide aprobacion para aplicarlo.

### Prompt 2.B.13: Aprobar plan para resolucion spec 3

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Apruebo el plan para la resolucion, pero en cuanto orders.service devuelva el pedido, la sesión pasa a MAIN_MENU y el carrito se vacía, antes de cualquier otro paso, así que un fallo posterior no puede volver a SUMMARY. ESC-48 lo verifica. Cumple los puntos 2, 3 y 4 en una sola instancia. El corte durante el COMMIT (punto 5) queda como limitación conocida del MVP, y el punto 1 no se cumple literalmente.
```

**Qué salió:** Entrego un resumen de todo lo aplicado, que ya no hay nada pendiente, recomendando aprobar y pasar a la spec 4.

### Prompt 2.B.14: Aprobacion spec 3

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Se da por aprobada la spec 3, actualiza el claude y readme para que consideren esta aprobacion, despues commit y push 
```

**Qué salió:** Spec 3 pasa a aprobado, claude y readme actualizado, recomienda seguir con la spec 4.

### Prompt 2.B.15: Inicializar Spec 04

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Vamos a elaborar `specs/04_orders_and_claims.spec.md` para el módulo de pedidos y reclamos de MedSupply AI (Entrega 2), dejándola inicialmente en estado "Borrador v1.0 (Entrega 2), pendiente de aprobación".
- Lee y analiza: `docs/PRD.md` (v1.2), `docs/ARCHITECTURE.md`, `docs/openapi.yaml`, `specs/01_data_models.spec.md` (v1.1), `specs/02_inventory_system.spec.md` (v1.1), `specs/03_conversational_bot.spec.md` (v1.0) y `backlog/README.md` (especialmente US-05, US-06 y US-07).
- Crea el archivo `specs/04_orders_and_claims.spec.md` con las secciones 1 a 4:
  1. Estado y metadatos.
  2. Objetivo.
  3. Alcance MVP/V2 y exclusiones.
  4. Actores y responsabilidades (delimitando claramente la frontera con Spec 01, Spec 02, Spec 03 y Spec 05, sin duplicar reglas ni implementar código).
- No modifiques ningún otro archivo del repositorio ni realices commits.
```

**Qué salió:** Creación de specs/04_orders_claims.spec.md con su encabezado oficial de borrador y las primeras 4 secciones redactadas respetando estrictamente las fronteras arquitectónicas con las Specs 01–03.

### Prompt 2.B.16: Especificar modelo conceptual, estados y reglas de negocio de Pedidos (MVP)

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Edita `specs/04_orders_and_claims.spec.md` para desarrollar las secciones 5, 6 y 7 enfocadas en el dominio `orders` (MVP):
- Investiga y aplica los requisitos del PRD: RN-02, RN-03, RN-04, RN-05, PE, CH-07, CH-08, CH-09, RNF-03 y RNF-04.
- Define el modelo conceptual, estados del pedido y transiciones permitidas.
- Documenta las reglas de negocio y flujos funcionales: creación de pedido, persistencia de precio histórico de ítems, generación de número `MED-` (mínimo 5 dígitos, sin máximo, permitiendo saltos), consulta de pedidos, seguimiento desde chat, gestión de estados desde dashboard y cancelación desde estados permitidos con restitución exacta de stock una sola vez.
- Respeta la frontera con Spec 03 (Spec 03 decide cuándo se confirma y maneja sesión en memoria; Spec 04 gobierna la creación efectiva del pedido).
```

**Qué salió:** Las secciones 5, 6 y 7 redactadas en specs/04_orders_claims.spec.md con todo el ciclo de vida, estados y reglas de negocio de pedidos para el MVP.

### Prompt 2.B.17: Documentar contrato OpenAPI, transacciones PostgreSQL y errores (Spec 04)

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Edita `specs/04_orders_and_claims.spec.md` para desarrollar las secciones 8, 9 y 10:
- Contrato API (Sección 8): Mapea las operaciones `GET /orders`, `GET /orders/{id}` y `PATCH /orders/{id}/status` usando sus `operationId` reales de `docs/openapi.yaml` (sin duplicar payloads ni modificar OpenAPI).
- Errores y excepciones (Sección 9): Define errores de negocio, validaciones y transiciones inválidas.
- Integridad, transacciones y concurrencia (Sección 10): Detalla la atomicidad en PostgreSQL (creación de pedido, ítems y descuento de stock en una sola transacción con rollback ante fallos previos al COMMIT), prevención de sobreventa concurrente y no duplicación al restituir stock.
- Distingue expresamente: (1) atomicidad en PostgreSQL, (2) coordinación con la sesión en memoria (respetando la decisión C1 de Spec 03 y su riesgo residual) y (3) garantías que el MVP no ofrece (idempotencia entre instancias).
```

**Qué salió:** Las secciones 8, 9 y 10 completadas en la especificación, garantizando rigor transaccional y coherencia total con OpenAPI y la decisión C1 de la Spec 03.

### Prompt 2.B.18: Incorporar diseño conceptual del dominio Claims para V2 (Spec 04)

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Edita `specs/04_orders_and_claims.spec.md` para redactar la sección 15 (Diseño conceptual V2 de reclamos):
- Documenta conceptualmente el dominio `claims`: objetivo, actores, ciclo de vida, estados, transiciones, reglas de negocio, flujo de resolución y relación con pedidos y clientes.
- Vincula los requisitos RE y CH-10, además de la trazabilidad con US-07 y sus tickets.
- Cumple estrictamente las restricciones: Claims queda fuera del MVP; no definir tablas físicas en PostgreSQL, modelos Prisma ni endpoints en OpenAPI, ni incluirlo en el menú del bot MVP.
```

**Qué salió:** La sección de diseño conceptual de reclamos (claims) redactada y aislada explícitamente como alcance exclusivo de V2.

### Prompt 2.B.19: Completar escenarios, matriz de trazabilidad y decisiones pendientes (Spec 04)

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Edita `specs/04_orders_and_claims.spec.md` para desarrollar las secciones 11, 12, 13 y 14:
- Sección 11 (Escenarios de aceptación): Crea escenarios numerados y verificables siguiendo la convención de las Specs 01–03.
- Sección 12 (Trazabilidad): Construye la matriz completa cruzando Requisitos PRD, Reglas de negocio, Escenarios de aceptación, OperationIds, Historias (US-05, US-06, US-07), Tickets responsables y Fase (MVP/V2), verificando que no haya duplicidad de responsabilidades con Spec 03.
- Sección 13 (Decisiones pendientes): Registra cualquier ambigüedad detectada detallando alternativas, recomendación justificada e impacto (sin aprobarlas ni inventar decisiones).
- Sección 14 (Observaciones y limitaciones conocidas): Documenta brechas o restricciones técnicas encontradas.
```

**Qué salió:** La especificación specs/04_orders_and_claims.spec.md 100% completa en estado de borrador, con trazabilidad total y decisiones pendientes formalizadas.

### Prompt 2.B.20: Validar Spec 04 y generar el informe final para revisión

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Sin modificar ningún archivo adicional, sin hacer commits y manteniendo `specs/04_orders_and_claims.spec.md` como "Borrador v1.0 (Entrega 2), pendiente de aprobación", realiza una validación cruzada completa y entrega el informe final con exactamente estos 10 puntos:
1. Archivos consultados.
2. Resumen de la especificación creada.
3. Alcance MVP y V2.
4. Matriz de trazabilidad y cobertura.
5. Escenarios de aceptación creados.
6. Decisiones pendientes, con alternativas y recomendación.
7. Observaciones o contradicciones encontradas.
8. Resultado de la validación cruzada con Specs 01–03.
9. Resultado de la validación contra OpenAPI y backlog.
10. Diff y estado de Git (`git status` y resumen de cambios demostrando que solo se creó/modificó `specs/04_orders_and_claims.spec.md`).
Detente y espera revisión humana.
```

**Qué salió:** El informe final de 10 puntos listo, junto con la comprobación de git status demostrando que solo se tocó el archivo autorizado, tambien indico decisiones que debe tomar el usuario para cerrar la spec 4

### Prompt 2.B.21: Integrar decisiones aprobadas y revisiones de coherencia en Spec 04

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Modifica exclusivamente el archivo `specs/04_orders_claims.spec.md` (sin alterar PRD, arquitectura, OpenAPI, backlog, CLAUDE.md ni Specs 01–03, y manteniendo el estado en "Borrador v1.0 (Entrega 2), pendiente de aprobación") para aplicar lo siguiente:
1. Documentar DP-01 (Ordenamiento: createdAt DESC, id DESC) como resuelta, aclarando que garantiza orden determinista pero sin prometer páginas inmutables frente a inserciones concurrentes.
2. Documentar DP-02 (Dashboard: backend como autoridad de transiciones; frontend con mapa visual estático; manejo de error 409 INVALID_ORDER_TRANSITION recargando el pedido) como resuelta.
3. Revisar y ajustar D-04 (Resultado y COMMIT) para reflejar con precisión las limitaciones de la decisión C1 de Spec 03 sin prometer garantías imposibles tras el COMMIT.
4. Afinar D-08 (Consulta desde el chat) para alinearla estrictamente con Spec 03 D-10 (número completo, espacios recortados, mayúsculas normalizadas, comparación exacta, filtrado estricto por cliente propietario sin búsquedas parciales ni de otros clientes).
5. Explicitación de la prioridad de rechazos en D-02 (1. Inactivo -> 2. Stock insuficiente -> 3. Precio modificado), consistente con Spec 03 DP-03.
6. Ajustar las observaciones: mantener abiertas OBS-01 y OBS-02, conservar OBS-03 a OBS-05, y eliminar OBS-06 si solo correspondía al nombre del archivo.
7. Verificar que los 36 escenarios mantengan sus IDs y trazabilidad. Ejecuta `git diff --check` y valida que solo se modificó el archivo autorizado.
```

**Qué salió:** La actualización de la Spec 04 incorporando formalmente las decisiones resueltas (DP-01, DP-02), la precisión de las reglas transaccionales y de consulta, y la depuración de observaciones, manteniendo el repositorio limpio y en estado de borrador.

### Prompt 2.B.22: Formalizar aprobación de Spec 04, ajustar ESC-32 y actualizar CLAUDE.md

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Realiza el cierre formal de la especificación de pedidos y reclamos realizando exclusivamente estas modificaciones:
1. En `specs/04_orders_claims.spec.md`:
   - Ajusta el escenario ESC-32 para expresar textualmente: "Al repetir la misma consulta sobre el mismo conjunto de pedidos, sin inserciones ni modificaciones entre consultas, se obtiene el mismo orden."
   - Actualiza la línea de estado de la especificación a: `Aprobada v1.0 (Entrega 2). Fecha de aprobación: 2026-11-18.`
2. En `CLAUDE.md`:
   - Actualiza únicamente la fila correspondiente a `specs/04_orders_claims.spec.md` en la tabla de especificaciones para reflejar el dominio de pedidos y reclamos, la separación MVP/V2 y el estado `Aprobada v1.0 (Entrega 2), 2026-11-18`. No modifiques ninguna otra fila.
3. Validaciones obligatorias:
   - Comprueba que ESC-32 mantenga su ID y que los 36 escenarios (ESC-01 a ESC-36) sigan intactos.
   - Verifica mediante `git diff --check` y hashes que ningún otro archivo del repositorio fue alterado.
   - Presenta el diff completo, el estado de Git y el informe de validación final. No hagas commit ni push, y no avances a la Spec 05.
```

**Qué salió:** El ajuste del escenario de prueba ESC-32, la actualización oficial de la versión y fecha de aprobación en la cabecera de la Spec 04, la sincronización de la tabla en CLAUDE.md y el informe final con los diffs correspondientes sin comprometer cambios en Git.

### Prompt 2.B.23: Iniciar la especificación de clientes

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa CLAUDE.md y el backlog para identificar el nombre correcto de la Spec 05. Analiza el PRD, la arquitectura y las especificaciones anteriores.

Crea el borrador de la especificación de clientes, respetando el alcance MVP/V2 y las responsabilidades de cada módulo. No modifiques otros archivos ni hagas commits.
```

**Qué salió:** Claude identificó `specs/05_operator_dashboard.spec.md` como nombre canónico y creó el borrador. Desarrolló el dominio de clientes y dejó acceso del operador y pantallas como secciones pendientes.
**Decisión de alcance:** Se acordó desarrollar clientes (RN-12, CL-02 y CL-03), dejando autenticación y dashboard para una etapa posterior dentro del mismo documento.

### Prompt 2.B.24: Definir las reglas de normalización telefónica

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa las decisiones pendientes DP-01 a DP-04 de la Spec 05. Propón reglas concretas para separadores, prefijos internacionales, longitud de los teléfonos e identificación de clientes en el seed.

Compara las alternativas con RN-12 y el modelo de datos. No modifiques archivos hasta tener las decisiones aprobadas.
```

**Qué salió:** Se identificaron las ambigüedades de normalización y las colisiones de teléfonos. Posteriormente se simplificó la propuesta para ajustarla al alcance real del MVP.

### Prompt 2.B.25: Simplificar la normalización y el seed

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Simplifica la normalización para el MVP. El simulador mostrará +56 como prefijo fijo y el usuario ingresará nueve dígitos.

Rechaza números incompletos o con dígitos adicionales, sin completar números automáticamente. Conserva los prefijos internacionales que vengan con + explícito.

Utiliza la misma función para el seed y el chat. Mantén el seed con fixtures ficticios, sin mecanismos complejos de importación ni recuperación.
```

**Qué salió:** Se simplificaron las reglas de normalización y el comportamiento del seed. Las decisiones DP-01 a DP-04 quedaron resueltas con una implementación conceptual acotada al MVP.

### Prompt 2.B.26: Separar validación local y validación del backend

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Aclara en la Spec 05 que la validación de los nueve dígitos ocurre primero en el simulador, antes de llamar al backend.

El backend debe volver a validar el teléfono y mantener las respuestas conversacionales ya definidas en Spec 03. Los mensajes sobre dígitos faltantes pertenecen al campo de entrada, no al bot.

Actualiza OBS-07 si la separación resuelve la inconsistencia.
```

**Qué salió:** Se documentaron los dos niveles de validación y OBS-07 quedó cerrada. Se mantuvo intacto el contrato conversacional.

### Prompt 2.B.27: Alinear ESC-06 de la Spec 03

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa ESC-06 de la Spec 03. El escenario utiliza un número internacional sin prefijo explícito, pero la normalización vigente exige el + para conservar códigos internacionales.

Corrige el ejemplo utilizando un prefijo + explícito. Conserva el ID y el propósito del escenario. Versiona la especificación como borrador v1.1 y actualiza su referencia en CLAUDE.md.
```

**Qué salió:** ESC-06 se corrigió sin modificar el comportamiento conversacional. La Spec 03 pasó a borrador v1.1, conservando el historial de la v1.0.

### Prompt 2.B.28: Formalizar Spec 03 v1.1 y actualizar referencias

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Formaliza la aprobación de la Spec 03 v1.1 con fecha 2026-11-18. Cierra OBS-06 de la Spec 05, ya que ESC-06 está alineada con la normalización vigente.

Actualiza las referencias de estado en CLAUDE.md y README.md, sin modificar las demás especificaciones.
```

**Qué salió:** Spec 03 quedó aprobada v1.1 y OBS-06 de Spec 05 se cerró. Se actualizaron las referencias documentales.

### Prompt 2.B.29: Completar acceso del operador y dashboard

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Completa las secciones pendientes de la Spec 05: acceso del operador y pantallas del dashboard.

Utiliza los requisitos AU, CA-11 y RNF-08, junto con la arquitectura y OpenAPI. Documenta el login, JWT, protección de rutas, navegación y estados de las pantallas.

Respeta las responsabilidades de inventario y pedidos de las Specs 02 y 04. No agregues endpoints ni funcionalidades V2 al MVP.
```

**Qué salió:** Se desarrollaron las secciones de autenticación y dashboard, con trazabilidad hacia las historias y tickets correspondientes.

### Prompt 2.B.30: Resolver decisiones del acceso y navegación

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Resuelve las decisiones pendientes DP-05 a DP-09 de la Spec 05.

Define el comportamiento ante expiración local del JWT, acceso a /login con sesión válida, rutas desconocidas, costo de BCrypt y presentación del nombre del operador.

Distingue UNAUTHORIZED de INVALID_CREDENTIALS por el código de error. Conserva el contrato API.
```

**Qué salió:** Las cinco decisiones quedaron resueltas. Se añadieron escenarios para expiración, navegación y presentación del operador, alcanzando ESC-51.

### Prompt 2.B.31: Formalizar aprobación de Spec 05 v1.0

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Formaliza la aprobación de la Spec 05 v1.0 con fecha 2026-11-18.

Actualiza su estado en CLAUDE.md y README.md. Cierra OBS-09, manteniendo abiertas las alineaciones de backlog que todavía no se han resuelto.
```

**Qué salió:** La Spec 05 quedó aprobada v1.0, incluyendo clientes, autenticación y dashboard. Se sincronizaron sus referencias documentales.

### Prompt 2.B.32: Resolver el resaltado de stock crítico

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Analiza DP-04 de la Spec 02. Necesitamos definir cómo destacar los productos con stock crítico en la tabla del dashboard.

Compara las alternativas utilizando los contratos existentes. Prioriza reutilizar listProducts y listStockAlerts, sin duplicar RN-09 en el frontend ni modificar OpenAPI.
```

**Qué salió:** Claude recomendó cruzar ambas respuestas por el ID del producto. Se identificaron los riesgos de lecturas en momentos diferentes y la dependencia de planificación entre TK-03.3 y TK-04.1.

### Prompt 2.B.33: Aplicar DP-04 y alinear el dashboard

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Aplica la alternativa aprobada para DP-04: el frontend debe cruzar listProducts con listStockAlerts y resaltar por identificador.

Actualiza las Specs 02 y 05, incorpora los escenarios necesarios y alinea TK-03.3 con TK-04.1 como dependencia. No modifiques OpenAPI.
```

**Qué salió:** DP-04 quedó resuelta en el diseño. Se añadieron ESC-52 a ESC-55 en Spec 05, se actualizó TK-03.3 y ambas especificaciones pasaron a nuevos borradores: Spec 02 v1.2 y Spec 05 v1.1.

### Prompt 2.B.34: Documentar excepción de planificación entre historias

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Documenta que TK-03.3 depende de TK-04.1, aunque ambos pertenezcan a historias con un orden general diferente.

Mantén los tickets en sus historias originales y explica en el backlog que TK-04.1 puede ejecutarse anticipadamente, sin adelantar el resto de US-04.
```

**Qué salió:** Se documentó la excepción en US-03 y en el README del backlog. Se verificó que no existieran ciclos ni cambios en los totales.

### Prompt 2.B.35: Corregir inconsistencias de US-03

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa OBS-04 de la Spec 02. Corrige en US-03 la referencia del criterio de aceptación sobre precios y agrega RN-09 a la cabecera de la historia.

No modifiques tickets, puntos ni dependencias. Cierra OBS-04 solamente si ambos asuntos quedan resueltos.
```

**Qué salió:** Se corrigió la atribución de las validaciones de precio, stock y mínimo, se agregó RN-09 a la cabecera de US-03 y OBS-04 quedó cerrada.

### Prompt 2.B.36: Alinear TK-02.4, TK-00.4 y TK-01.2

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Alinea los tickets TK-02.4, TK-00.4 y TK-01.2 con las reglas de las Specs 03 y 05.

Actualiza sus criterios para reflejar la normalización telefónica, el seed simplificado y la diferenciación entre UNAUTHORIZED e INVALID_CREDENTIALS.

Conserva IDs, puntos y dependencias.
```

**Qué salió:** Los tres tickets quedaron alineados. Se cerraron OBS-03, OBS-04 y OBS-08 de Spec 05.

### Prompt 2.B.37: Completar TK-05.4 y el alcance de TK-01.2

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Completa TK-05.4 con la validación local del teléfono: prefijo fijo +56, nueve dígitos, mensajes de error y bloqueo del envío ante entradas inválidas.

Completa TK-01.2 con las decisiones de expiración JWT, rutas desconocidas, acceso a /login con sesión válida y nombre del operador.

No modifiques las especificaciones.
```

**Qué salió:** Ambos tickets quedaron alineados con Spec 05. Durante la revisión se detectó que faltaba un escenario que verificara específicamente la validación local del teléfono en el simulador.

### Prompt 2.B.38: Incorporar ESC-56 al simulador

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Agrega ESC-56 a la Spec 05 para verificar la validación local del teléfono en el simulador.

Comprueba el prefijo +56, los nueve dígitos nacionales, los mensajes para entradas incompletas o excesivas y que no se invoque startChatSession cuando el teléfono sea inválido.

Mantén separados el comportamiento del simulador, la normalización del backend y la conversación de Spec 03.
```

**Qué salió:** Se incorporó ESC-56 y se actualizaron las matrices de trazabilidad y cobertura. Los 55 escenarios anteriores conservaron sus IDs y contenido.

### Prompt 2.B.39: Revisar decisiones pendientes de inventario

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Analiza DP-01, DP-02 y DP-06 de la Spec 02.

Revisa la reactivación de productos, las operaciones sobre productos inactivos y la concurrencia de updateProduct.

Contrasta las alternativas con el PRD, PostgreSQL, el modelo de datos y OpenAPI. Recomienda una solución compatible con el MVP, sin modificar archivos.
```

**Qué salió:** Se recomendaron tres decisiones: sin reactivación en MVP (A), permitir edición y ajuste de stock sobre productos inactivos sin reactivarlos (C), y utilizar actualizaciones parciales con last-write-wins para las modificaciones generales (A).

### Prompt 2.B.40: Aplicar DP-01, DP-02 y DP-06

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Aplica DP-01 (A), DP-02 (C) y DP-06 (A) en la Spec 02.

Actualiza las reglas, flujos y escenarios de aceptación. Alinea la Spec 05 para permitir editar y ajustar productos inactivos sin ofrecer reactivación.

Actualiza TK-03.1, TK-03.2 y TK-03.3 con los comportamientos aprobados. Conserva el contrato API, el modelo de datos y las estimaciones.
```

**Qué salió:** Se resolvieron las tres decisiones en Spec 02, incorporando ESC-32 a ESC-37 para inventario y concurrencia, y ESC-57 para el comportamiento de productos inactivos en el dashboard. Los tres tickets quedaron alineados, manteniendo sus puntos y dependencias.

### Prompt 2.B.41: Formalizar aprobación de las specs 02 y 05

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Formaliza la aprobación de las specs 02 y 05.

La spec 02 debe quedar aprobada en su versión 1.2 y la spec 05 en su versión 1.1, ambas con fecha 2026-11-18.

Conserva el historial de las versiones anteriores y actualiza únicamente las referencias necesarias en las propias specs, CLAUDE.md y README.md para que los cinco documentos reflejen correctamente su estado de aprobación.

No cambies decisiones, requisitos, escenarios ni observaciones. Tampoco cierres o reabras observaciones.

Verifica las versiones, la trazabilidad de escenarios, los estados de las observaciones, los totales del backlog y las referencias cruzadas.

Revisa los diffs completos y confirma que solo se modificaron los archivos autorizados. No hagas commit ni push.
```

**Qué salió:** Se formalizó la aprobación de Spec 02 v1.2 y Spec 05 v1.1. Se conservaron los historiales anteriores y se actualizaron CLAUDE.md y README.md para reflejar las cinco specs aprobadas. Las observaciones y los totales del backlog permanecieron sin cambios.

### Prompt 2.B.42: Corregir referencias desactualizadas de aprobación

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa las referencias internas de las specs 02 y 05 que todavía indican que la versión 1.2 de la spec 02 está pendiente de aprobación.

Corrige exclusivamente las cuatro referencias identificadas:
- Spec 02, introducción de §13.2.
- Spec 05, sección Fuentes.
- Spec 05, §12.3.
- Spec 05, §13.3.

Actualiza los textos para que reflejen que la spec 02 v1.2 ya está aprobada.

No modifiques decisiones, requisitos, escenarios, observaciones, versiones ni estados de aprobación.

Ejecuta git diff --check y revisa los cambios para confirmar que solo se modificaron esos cuatro fragmentos.

No hagas commit ni push.
```

**Qué salió:** Se corrigieron las cuatro referencias. Las specs 02 y 05 conservaron sus estados de aprobación y fechas. La validación confirmó que no quedaron referencias a «pendiente de aprobación» ni a «Borrador v1.2» en ambas especificaciones.

### Prompt 2.B.43: Auditoría final de consistencia documental preimplementación

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Realiza una auditoría integral de consistencia documental antes de comenzar la implementación del MVP.

Contrasta las cinco specs aprobadas con CLAUDE.md, README.md y todos los documentos del backlog.

Revisa especialmente:
- Versiones y estados de aprobación.
- Trazabilidad entre requisitos, reglas, escenarios y tickets.
- Consistencia de contratos, entidades, endpoints y errores entre dominios.
- Resoluciones de decisiones y observaciones.
- Dependencias entre historias y tickets, incluyendo la excepción TK-04.1 / TK-03.3.
- Separación entre alcance MVP y V2.
- Preparación real de cada ticket MVP para comenzar su implementación.

Identifica contradicciones, dependencias faltantes, requisitos sin cobertura y tickets que no tengan información suficiente para desarrollarse.

Distingue los problemas reales de las limitaciones y riesgos que ya están documentados y aceptados.

Entrega un informe con resumen ejecutivo, matriz de hallazgos priorizados, trazabilidad, dependencias, preparación de tickets y recomendaciones.

Esta tarea es exclusivamente de auditoría: no modifiques archivos, no cambies decisiones ni estados, no cierres observaciones y no agregues tickets.

Verifica también el estado de Git y diferencia los cambios anteriores de cualquier modificación realizada durante la auditoría.

Detente al entregar el informe y espera autorización antes de corregir cualquier hallazgo.
```

**Qué salió:** no encontró contradicciones funcionales entre las cinco specs. Los problemas detectados son principalmente omisiones en los criterios de aceptación del backlog frente a decisiones que ya están aprobadas.

### Prompt 2.B.44: Resolver H-03 — Idempotencia del seed

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Confirmo la siguiente decisión técnica para el seed del MVP:
1. Clientes:
   - Mantener el comportamiento de idempotencia ya definido en la spec 05.
   - Usar tax_id y respetar las reglas existentes para duplicados y conflictos.
2. Productos:
   - Insertar los fixtures únicamente cuando la tabla de productos esté vacía.
   - Si ya existen registros, no insertar nuevamente los fixtures ni modificar los datos existentes.
3. Pedidos:
   - Insertar los fixtures únicamente cuando la tabla de pedidos esté vacía.
   - Si ya existen registros, no insertar nuevamente los fixtures ni modificar los datos existentes.
4. Independencia:
   - Evaluar cada tabla por separado. Que una tabla tenga registros no debe impedir cargar los fixtures de otra que esté vacía.
5. Transacciones:
   - Cada conjunto de fixtures debe cargarse de manera transaccional, evitando cargas parciales.
6. Relaciones:
   - Respetar las relaciones existentes entre clientes, productos, pedidos y detalles de pedidos.
   - Respetar el modelo de datos y las reglas de integridad ya aprobadas.
   - No introducir efectos adicionales sobre el stock que contradigan las decisiones existentes.

Actualiza exclusivamente el ticket TK-00.4 en backlog/00_habilitadores.md para incorporar estos criterios en su descripción y en su sección "Hecho cuando".

Antes de editar, revisa el contenido actual del ticket y las referencias pertinentes de las specs 01 y 05 para asegurar que la redacción sea compatible con lo aprobado.

Restricciones:
- No modifiques las cinco specs aprobadas.
- No cambies el modelo de datos, las entidades ni las reglas de negocio.
- No agregues tablas, columnas, claves naturales ni endpoints.
- No alteres otros tickets, dependencias, estimaciones o totales del backlog.
- No cambies el comportamiento de seed de clientes.
- No hagas commit ni push.

Validaciones:
1. El ticket debe dejar inequívoco el comportamiento para clientes, productos y pedidos.
2. La idempotencia debe ser independiente por tabla.
3. Debe quedar explícito que los registros existentes no se sobrescriben.
4. Los fixtures deben respetar las relaciones y restricciones del modelo.
5. Comprueba que el ticket siga siendo coherente con las specs aprobadas.
6. Ejecuta git diff --check y revisa el diff completo.
7. Confirma que únicamente cambió backlog/00_habilitadores.md y que los totales del backlog permanecen iguales.

Al finalizar, presenta el cambio y las validaciones. Detente y espera mi revisión.
```

**Qué salió:** Se hicieron las modficaciones esperada, pero se encontro problemas referentes a los identificadores de productos.

### Prompt 2.B.45: Resolver H-03 — Idempotencia del seed

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa `backlog/00_habilitadores.md`, específicamente TK-00.4, y verifica en `specs/01_*.spec.md` cómo se generan y asignan los identificadores de productos.

Quiero resolver la ambigüedad sobre cómo identificar los productos del seed cuando la tabla de productos ya contiene registros, pero la tabla de pedidos está vacía y debe cargarse.

**Decisión propuesta:** utilizar UUID deterministas para identificar los productos del fixture y referenciarlos desde los ítems de los pedidos.

Antes de modificar el ticket:

1. Comprueba si el modelo de datos y las reglas aprobadas de la Spec 01 permiten asignar explícitamente el UUID al insertar un producto.
2. Comprueba que esta estrategia no contradice la generación de identificadores ni ninguna restricción del modelo aprobado.
3. Si es compatible, incorpora en TK-00.4 estas condiciones:
   - Cada producto del fixture tiene un UUID determinista y estable.
   - Al insertar productos porque la tabla está vacía, se utilizan esos UUID.
   - Si la tabla ya contiene registros, no se insertan ni modifican productos.
   - Al cargar pedidos, cada producto del fixture se localiza por su UUID determinista.
   - Se verifica que el producto encontrado corresponda al fixture esperado.
   - Si falta algún producto o existe una inconsistencia, se aborta la transacción completa de pedidos e ítems.
   - Los ítems de los pedidos referencian los UUID de los productos, nunca sus nombres.
4. Si la Spec 01 no permite esta estrategia, no improvises otra ni modifiques la spec. Detente y explícame la incompatibilidad y las alternativas.

**Restricciones:**
- Modifica exclusivamente `backlog/00_habilitadores.md`.
- No modifiques ninguna spec aprobada.
- No agregues tablas, columnas, claves naturales ni endpoints.
- No cambies el comportamiento de carga de clientes definido en Spec 05 §7.3.
- No cambies puntos, dependencias, fases ni totales del backlog.
- No realices commit ni push.

**Validaciones:**
- Revisa el diff completo.
- Ejecuta `git diff --check` sobre el archivo.
- Comprueba que el ticket no contradiga las Specs 01 y 05.
- Confirma que la identificación de productos es inequívoca incluso cuando la tabla ya contiene registros.
- Verifica que solo cambió el archivo autorizado y que los totales siguen siendo MVP 31/96, V2 11/27 y total 42/123.

Al terminar, informa qué cambió, qué validaste y el estado de Git. Detente y espera mi revisión.
```

**Qué salió:** no permitio el cambio ya que esto contradecia las reglas expuestas incialmente.

### Prompt 2.B.46: Ajustar dependencia de pedidos en TK-00.4

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Actualiza exclusivamente `backlog/00_habilitadores.md`, específicamente TK-00.4, para aplicar la alternativa A que acabamos de decidir.

**Decisión aprobada:**

La carga de productos y pedidos mantiene condiciones independientes, con una excepción por integridad referencial: los pedidos del fixture solo se cargan cuando los productos correspondientes se insertaron durante la misma ejecución del seed.

Ajusta las condiciones del ticket:

1. Mantén la idempotencia de clientes por `tax_id`, conforme a Spec 05 §7.3. No modifiques sus condiciones A a D.
2. Los productos se insertan únicamente cuando su tabla está vacía, en una única transacción. Si ya existen productos, no se insertan ni modifican.
3. Los pedidos se insertan únicamente cuando su tabla está vacía, en una única transacción junto con sus ítems.
4. Para cargar los pedidos, todos los productos del fixture deben haberse insertado correctamente durante esa misma ejecución del seed. Los ítems utilizarán los identificadores enteros generados por la base de datos en esa ejecución.
5. Si la tabla de productos ya tenía registros antes de ejecutar el seed, pero la tabla de pedidos está vacía, se omite la carga de pedidos y se informa claramente que no se cargaron porque los productos del fixture no fueron insertados en esa ejecución.
6. Si la tabla de pedidos ya contiene registros, no se insertan ni modifican pedidos ni ítems.
7. Si falla la resolución de alguna referencia o la inserción de pedidos o ítems, se revierte la transacción completa de pedidos e ítems.
8. Mantén el orden de carga: clientes, productos y pedidos con sus ítems.
9. Conserva todas las restricciones de fixtures ya definidas en Spec 01: una línea por producto en cada pedido, cantidades y precios positivos, total calculado correctamente, número asignado por la secuencia de base de datos, pedidos en los estados de RN-05, al menos dos clientes y uno en PROCESSING. Los pedidos del seed no descuentan stock.

**Restricciones:**
- No modificar ninguna spec aprobada.
- No cambiar el modelo de datos ni OpenAPI.
- No agregar tablas, columnas, claves naturales ni endpoints.
- No utilizar UUID ni IDs explícitos para productos.
- No buscar productos existentes por nombre o combinación de atributos.
- No modificar puntos, dependencias, fases ni totales del backlog.
- No realizar commit ni push.

**Validaciones:**
- Verifica coherencia con Spec 01 y Spec 05 §7.3.
- Confirma que no se sobrescriben registros existentes.
- Confirma que los pedidos nunca se cargan con referencias a productos no identificados inequívocamente.
- Revisa el diff completo y ejecuta `git diff --check` sobre el archivo.
- Confirma que solo cambió `backlog/00_habilitadores.md`.
- Verifica que los totales siguen siendo MVP 31/96, V2 11/27 y total 42/123.

Al terminar, informa los cambios y validaciones. No hagas commit ni push y espera mi revisión.
```

**Qué salió:** Se incorporó la alternativa A en backlog/00_habilitadores.md. Los pedidos del seed solo se cargan cuando los productos correspondientes fueron insertados durante esa misma ejecución. Se preservó el comportamiento de clientes de Spec 05, sin cambios en specs, puntos, dependencias ni totales. Validaciones satisfactorias. Sin commit ni push.

### Prompt 2.B.47: Cerrar H-07 en TK-01.1

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```

Revisa `backlog/US-01_acceso_operador.md` y las referencias correspondientes de `specs/05_operator_dashboard.spec.md`.

Quiero corregir H-07 del último diagnóstico: TK-01.1 no refleja explícitamente en sus criterios de aceptación dos condiciones que ya están definidas en la Spec 05:

- El costo BCrypt debe configurarse mediante una constante.
- Las contraseñas y los hashes nunca deben registrarse en logs.

Incorpora ambas condiciones en el apartado "Hecho cuando" de TK-01.1, manteniendo la trazabilidad con la Spec 05 §12.2, DP-08 y ESC-51.

**Criterio de alcance MVP:**
- No agregues mecanismos de seguridad que no estén exigidos por las specs aprobadas.
- No introduzcas rotación de credenciales, políticas de contraseñas, rate limiting, auditoría avanzada ni abstracciones adicionales.
- No amplíes el alcance de autenticación.
- Limítate a hacer explícitos los dos requisitos existentes en el ticket.

**Restricciones:**
- Modifica exclusivamente `backlog/US-01_acceso_operador.md`.
- No modifiques ninguna spec aprobada.
- No cambies puntos, dependencias, fases ni totales del backlog.
- No realices commit ni push.

**Validaciones:**
1. Comprueba que ambas condiciones quedan expresadas claramente y son verificables.
2. Verifica su coherencia con Spec 05 §12.2, DP-08 y ESC-51.
3. Revisa el diff completo y ejecuta `git diff --check` sobre el archivo.
4. Confirma que solo cambió el archivo autorizado.
5. Confirma que los totales permanecen en MVP 31/96, V2 11/27 y total 42/123.

Al terminar, informa los cambios, las validaciones y el estado de Git. Detente y espera mi revisión.
```

**Qué salió:** Se añadieron dos criterios verificables a TK-01.1: costo BCrypt predeterminado declarado en una constante y ausencia de contraseñas o hashes en logs y respuestas HTTP, tanto en login exitoso como fallido. Alineado con Spec 05 §12.2, §15.3, DP-08 y ESC-51. Sin cambios en puntos, dependencias ni totales. Sin commit ni push.

### Prompt 2.B.48: Cerrar H-01 en TK-05.3

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa `backlog/US-05_compra_conversacional.md`, específicamente TK-05.3, y contrástalo con `specs/03_conversational_bot.spec.md` y `specs/04_orders_claims.spec.md`.

Quiero resolver H-01 del último diagnóstico.

**Problema identificado:**

La Spec 04, decisión D-01, establece que cuando el backend devuelve `STOCK_INSUFFICIENT`, la respuesta debe incluir el stock disponible. La Spec 03 necesita ese dato para que el bot pueda ofrecer al cliente ajustar la cantidad solicitada.

Actualmente, los criterios de TK-05.3 contemplan el precio actualizado para `PRICE_CHANGED`, pero no exigen explícitamente el stock disponible para `STOCK_INSUFFICIENT`.

**Cambio solicitado:**

1. Incorpora en "Hecho cuando" de TK-05.3 una condición que exija que la respuesta `STOCK_INSUFFICIENT` incluya el stock disponible del producto.
2. Asegura que el criterio sea verificable mediante una prueba del contrato o de integración.
3. Mantén la trazabilidad con la decisión D-01 de la Spec 04 y los escenarios correspondientes de la Spec 03.
4. Si el contrato ya define el nombre exacto del campo, utiliza ese nombre. No inventes ni modifiques nombres de propiedades.

**Alcance MVP:**
- No agregues endpoints, errores ni campos nuevos al contrato.
- No implementes lógica adicional de inventario en el bot.
- No cambies las reglas de negocio ni el comportamiento aprobado.
- Limítate a reflejar en el ticket el dato que el contrato ya exige.

**Restricciones:**
- Modifica exclusivamente `backlog/US-05_compra_conversacional.md`.
- No modifiques specs aprobadas, OpenAPI ni otros tickets.
- No cambies puntos, dependencias, fases ni totales del backlog.
- No realices commit ni push.

**Validaciones:**
1. Confirma que el campo exigido existe en el contrato aprobado.
2. Verifica coherencia con Spec 04 D-01 y los escenarios aplicables de Spec 03.
3. Revisa el diff completo y ejecuta `git diff --check` sobre el archivo.
4. Confirma que solo cambió el archivo autorizado.
5. Verifica que los totales siguen siendo MVP 31/96, V2 11/27 y total 42/123.

Si encuentras una contradicción o el contrato no permite precisar el campo, detente y explícame el problema sin modificar otros archivos.

Al terminar, informa los cambios y validaciones. No hagas commit ni push y espera mi revisión.
```

**Qué salió:** se presentaron dos alternativas para cerrar este punto

### Prompt 2.B.49: Cerrar H-01 en TK-05.3 Aplicar opción A

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Aplica la opción A para resolver H-01 en TK-05.3 de `backlog/US-05_compra_conversacional.md`.

Añade al apartado "Hecho cuando" el criterio acordado:

- Cada ítem rechazado por `STOCK_INSUFFICIENT` incluye el stock disponible leído dentro de la transacción (spec 04, D-01). El motor conversacional utiliza ese valor en `RESOLVE_STOCK` para ofrecer ajustar la cantidad solicitada. Se verifica mediante pruebas de integración contra PostgreSQL para ESC-04 (stock disponible 1) y ESC-07 (rechazo con stock disponible), de la spec 04.

**Restricciones:**
- Modifica exclusivamente `backlog/US-05_compra_conversacional.md`.
- No inventes un nombre de propiedad ni modifiques el contrato interno.
- No modifiques specs aprobadas ni OpenAPI.
- No agregues endpoints, errores o funcionalidades.
- No cambies puntos, dependencias, fases ni totales.
- No hagas commit ni push.

**Validaciones:**
1. Comprueba la coherencia con Spec 04 D-01, ESC-04 y ESC-07.
2. Comprueba la relación con RESOLVE_STOCK de Spec 03.
3. Revisa el diff completo y ejecuta `git diff --check`.
4. Confirma que solo cambió el archivo autorizado.
5. Confirma que los totales permanecen en MVP 31/96, V2 11/27 y total 42/123.

Informa los cambios y validaciones. Detente y espera mi revisión.
```

**Qué salió:** Se incorporó a TK-05.3 el requisito de incluir el stock disponible en cada rechazo STOCK_INSUFFICIENT, leído dentro de la transacción. Se vinculó con Spec 04 D-01, ESC-04 y ESC-07, y con RESOLVE_STOCK de Spec 03. Sin modificaciones en specs ni OpenAPI. Totales del backlog preservados. Sin commit ni push.

### Prompt 2.B.50: Cerrar H-02 en TK-06.1

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa TK-06.1 en los archivos de `backlog/` y contrástalo con `specs/04_orders_claims.spec.md` (o el nombre exacto de la Spec 04 existente en el repositorio).

Quiero resolver H-02 del diagnóstico de consistencia previo a la implementación.

**Problema identificado:**

TK-06.1 no refleja explícitamente tres condiciones que ya están definidas en la Spec 04:

1. Los productos afectados deben bloquearse en orden ascendente por `productId`.
2. Se debe contemplar el reintento ante el error de concurrencia PostgreSQL `P2034`.
3. Deben existir pruebas para:
   - ESC-28: cancelación que repone stock de un producto inactivo.
   - ESC-29: cancelación concurrente con confirmación de pedido.

**Cambio solicitado:**

Incorpora estas condiciones en los criterios de aceptación de TK-06.1, manteniendo la trazabilidad con la decisión DP-05 y los escenarios ESC-28 y ESC-29 de la Spec 04.

Antes de redactar, verifica el mecanismo exacto de bloqueo y reintento descrito en la especificación. No inventes cantidad de reintentos, políticas de espera, nuevas estrategias de concurrencia ni comportamientos que la spec no establezca.

**Alcance MVP:**
- Reflejar únicamente el comportamiento ya aprobado.
- No agregar mecanismos de concurrencia adicionales.
- No modificar el modelo de datos ni los contratos.
- No ampliar el alcance de cancelación o reposición de stock.

**Restricciones:**
- Identifica el archivo que contiene TK-06.1 y modifica exclusivamente ese archivo.
- No modifiques specs aprobadas.
- No cambies puntos, dependencias, fases ni totales.
- No realices commit ni push.

**Validaciones:**
1. Comprueba coherencia con DP-05, ESC-28 y ESC-29.
2. Confirma que el orden de bloqueo es ascendente por `productId`.
3. Confirma que el tratamiento de P2034 coincide con la spec.
4. Revisa el diff completo y ejecuta `git diff --check` sobre el archivo.
5. Confirma que solo cambió el archivo autorizado.
6. Verifica que los totales permanecen en MVP 31/96, V2 11/27 y total 42/123.

Al terminar, informa los cambios, las validaciones y el estado de Git. Detente y espera mi revisión.
```

**Qué salió:** Se incorporaron tres criterios a TK-06.1: actualización de productos en orden ascendente por productId, reintento completo de la transacción ante P2034 hasta tres veces y pruebas de integración/concurrencia para ESC-28 y ESC-29. Referencias corregidas a D-05. Sin cambios en specs, puntos, dependencias ni totales. Sin commit ni push.

### Prompt 2.B.51: Completar criterio de orden en TK-06.2

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Necesito corregir la observación H-05 de la auditoría de consistencia del backlog.
**Contexto**
La Spec 04, decisión D-01, establece que el listado de pedidos debe ordenarse de forma determinística mediante:
`createdAt DESC, id DESC`
La auditoría detectó que el ticket TK-06.2 no explicita el segundo criterio de ordenamiento.
**Tarea**
1. Revisa la definición de TK-06.2 en `backlog/US-06_seguimiento_pedidos.md`.
2. Contrasta sus criterios de aceptación con la decisión D-01 de `specs/04_orders_claims.spec.md`.
3. Incorpora en el apartado **Hecho cuando** que los pedidos se ordenan por `createdAt DESC` y, cuando exista empate, por `id DESC`.
4. Conserva la terminología y el formato que ya utiliza el backlog.
**Restricciones**
- Modifica exclusivamente `backlog/US-06_seguimiento_pedidos.md`.
- No modifiques las specs aprobadas ni otros archivos.
- No agregues paginación, cursores ni comportamientos que no estén definidos en las specs.
- No cambies puntos, dependencias, prioridad, alcance ni totales del backlog.
- No hagas commit ni push.
**Validación**
- Comprueba que TK-06.2 refleja exactamente el orden establecido en D-01.
- Ejecuta `git diff --check`.
- Revisa el diff para confirmar que el cambio es puntual y que no hay modificaciones accidentales.
- Confirma que los totales del backlog permanecen iguales: MVP 31 tickets / 96 puntos; V2 11 tickets / 27 puntos; total 42 tickets / 123 puntos.
Al finalizar, informa el archivo modificado, el criterio incorporado, las validaciones realizadas y el estado de Git.
```

**Qué salió:** H-05 revisada y resuelta. El ajuste es correcto y está bien delimitado. Buena precisión con la referencia: corresponde a DP-01 de la Spec 04, no a D-01. También queda bien asociado el test de integración ESC-32 a TK-06.2.

### Prompt 2.B.52: Completar búsqueda por número de pedido en TK-06.3

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Necesito corregir la observación H-06 de la auditoría de consistencia del backlog.
**Contexto**
La Spec 03, decisión DP-10, define cómo se normaliza el número de pedido para su búsqueda:
- Eliminar espacios al inicio y al final (`trim`).
- Convertir el valor a mayúsculas.
- Utilizar el número de pedido completo.
La Spec 04, decisión D-08, mantiene este contrato. La auditoría detectó que TK-06.3 no explicita estos comportamientos.
**Tarea**
1. Revisa TK-06.3 en `backlog/US-06_seguimiento_pedidos.md`.
2. Contrasta sus criterios con DP-10 de `specs/03_conversational_bot.spec.md` y D-08 de `specs/04_orders_claims.spec.md`.
3. Completa el apartado **Hecho cuando** para indicar que la búsqueda:
   - elimina espacios al inicio y al final del número recibido;
   - normaliza el valor a mayúsculas;
   - utiliza el número de pedido completo para localizarlo.
4. Verifica qué escenario de la Spec 03 cubre este comportamiento y referencia el escenario correspondiente si resulta aplicable.
**Restricciones**
- Modifica exclusivamente `backlog/US-06_seguimiento_pedidos.md`.
- No modifiques las specs aprobadas ni otros archivos.
- No introduzcas búsquedas parciales, por subcadenas ni coincidencias aproximadas.
- No cambies el formato del número de pedido ni agregues reglas de normalización distintas de las ya aprobadas.
- No cambies puntos, dependencias, prioridad, alcance ni totales del backlog.
- No hagas commit ni push.
**Validación**
- Comprueba que TK-06.3 refleja DP-10 y D-08 sin contradicciones.
- Ejecuta `git diff --check`.
- Revisa el diff para confirmar que el cambio es puntual.
- Confirma que los totales permanecen iguales: MVP 31 tickets / 96 puntos; V2 11 tickets / 27 puntos; total 42 tickets / 123 puntos.
Al finalizar, informa el archivo modificado, los criterios incorporados, las referencias utilizadas, las validaciones realizadas y el estado de Git.
```

**Qué salió:** El criterio quedó correctamente distribuido entre las responsabilidades del FSM y el servicio: normalización antes de buscar e igualdad exacta contra order_number.

### Prompt 2.B.53: Evaluar estimaciones de TK-01.2 y TK-05.4

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Necesito evaluar la observación H-08 de la auditoría final del backlog.
**Contexto**
La auditoría identificó dos posibles subestimaciones:
- TK-01.2: 2 puntos. Contempla manejo de respuestas 401 y comportamientos de sesión asociados a DP-05, DP-06, DP-07 y DP-09 de la Spec 05.
- TK-05.4: 3 puntos. Incorpora validación local del teléfono y las reglas de normalización correspondientes.
**Tarea**
Analiza ambos tickets contrastando:
- Su descripción y criterios de aceptación actuales.
- Las responsabilidades y reglas de las specs aprobadas.
- El trabajo técnico necesario para cumplirlos dentro del MVP.
- Las dependencias y el trabajo que ya está asignado a otros tickets, para evitar contabilizar tareas dos veces.
Para cada ticket, determina si la estimación actual es razonable, ajustada o insuficiente. Justifica brevemente la evaluación y señala qué parte del trabajo sustenta tu conclusión.
**Restricciones**
- No modifiques ningún archivo.
- No cambies puntos ni totales.
- No propongas dividir tickets ni crear nuevos tickets salvo que exista una necesidad funcional real y demostrable.
- No agregues mecanismos, requisitos ni complejidad que no estén en las specs aprobadas.
- Evalúa desde la perspectiva de un MVP, no de un producto escalable a gran volumen.
**Resultado esperado**
Presenta una tabla con:
- Ticket y estimación actual.
- Complejidad estimada.
- Evaluación de la estimación.
- Justificación.
- Recomendación: mantener o reconsiderar los puntos.
Si recomiendas cambiar puntos, indica el valor sugerido y el impacto exacto sobre los totales del backlog, pero no lo apliques.
El objetivo es tomar una decisión de planificación y cerrar H-08, no abrir una nueva ronda de diseño.
```

**Qué salió:** Analisis de las estimaciones para los tickets dado y recomendacion para aplicar los cambios.

### Prompt 2.B.54: Actualizar estimación de TK-01.2

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Apruebo la recomendación de la evaluación H-08:
- TK-01.2 pasa de 2 a 3 puntos.
- TK-05.4 permanece en 3 puntos.
Actualiza exclusivamente las referencias de estimación y totales afectadas:
1. `backlog/US-01_acceso_operador.md`
   - Cambia TK-01.2 de 2 a 3 puntos.
   - Actualiza la suma de puntos de US-01 de 6 a 7.
2. `backlog/README.md`
   - Actualiza los puntos de US-01.
   - Actualiza el total MVP de 96 a 97 puntos.
   - Actualiza el total general de 123 a 124 puntos.
   - Mantén V2 en 11 tickets y 27 puntos.
3. `README.md`
   - Actualiza la referencia al total de 96 puntos del MVP para que refleje 97.
**Restricciones**
- No modifiques criterios de aceptación, descripciones, dependencias ni otros tickets.
- No cambies la estimación de TK-05.4.
- No modifiques las specs aprobadas.
- No agregues ni elimines tickets.
- No hagas commit ni push.
**Validación**
- Verifica que las sumas por historia, fase y backlog sean consistentes.
- Confirma los totales: MVP 31 tickets / 97 puntos; V2 11 tickets / 27 puntos; total 42 tickets / 124 puntos.
- Ejecuta `git diff --check`.
- Revisa el diff y confirma que solo se modificaron los tres archivos autorizados.
- Informa el estado de Git.
```

**Qué salió:** Se cerraron los puntos pendientes, se indica hacer commit y push e iniciar implementacion

### Prompt 2.B.55: Actualizar estimación de TK-01.2

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
 Con los cambios aplicados se da por finalizado la etapa de diseño 2.B,por lo que haz commit y push de los cambios ingresados
```

**Qué salió:** se hice commit y push de los cambios se finalizo el diseño.

---

## Entrega 2.C — Creacion de Agentes y flujo de trabajo

### Prompt 2.C.1: Analizar la necesidad de un agente de implementación

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Analiza el estado actual del proyecto MedSupply AI y evalúa cómo podemos utilizar agentes de IA para ejecutar los tickets del backlog de forma controlada.
Necesitamos un agente capaz de implementar funcionalidades sobre un repositorio existente, utilizando las especificaciones aprobadas como fuente de verdad.
Antes de proponer una solución:
- Revisa la estructura y documentación existente.
- Identifica las restricciones del proyecto.
- Evalúa los riesgos de delegar la implementación a agentes.
- Determina qué responsabilidades deberían mantenerse bajo supervisión humana.
No modifiques archivos ni ejecutes acciones sobre el repositorio. Presenta primero un análisis y una propuesta de organización.
```

**Qué salió:** Se estableció la necesidad de un flujo de implementación controlado, con responsabilidades delimitadas, supervisión humana y separación entre implementación y validación. El objetivo no era permitir que Claude desarrollara autónomamente, sino construir un mecanismo de ejecución trazable sobre el backlog aprobado.

### Prompt 2.C.2: Auditar el repositorio antes de configurar los agentes

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Realiza una auditoría de solo lectura del repositorio antes de crear la estructura de agentes.
Verifica:
- Estructura actual del proyecto.
- Existencia de código fuente.
- Documentación funcional y técnica.
- Especificaciones aprobadas.
- Backlog y dependencias.
- Configuración existente de Claude Code.
Identifica qué elementos están disponibles y cuáles deben crearse para habilitar el flujo de implementación.
No crees archivos, no modifiques documentación y no ejecutes comandos que alteren el repositorio.
Entrega un diagnóstico y los prerrequisitos para continuar.
```

**Qué salió:** La auditoría confirmó que el repositorio todavía no contenía código de implementación ni configuración .claude/. Se identificó que las cinco especificaciones estaban aprobadas y que TK-00.8 ya estaba realizado. Esto permitió preparar el entorno de agentes sin asumir que existía infraestructura previa.

### Prompt 2.C.3: Definir la organización de agentes especializados

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Diseña una organización de agentes especializados para implementar MedSupply AI.
Necesitamos separar las responsabilidades para evitar que un único agente concentre implementación, validación y revisión de seguridad.
Define:
- Agente responsable de coordinar el flujo.
- Agentes especializados por responsabilidad técnica.
- Agente de QA independiente.
- Agente de seguridad con capacidades de revisión de solo lectura.
Establece para cada agente:
- Objetivo.
- Responsabilidades.
- Herramientas necesarias.
- Alcance de acceso.
- Restricciones.
- Condiciones para delegar trabajo.
La organización debe respetar las especificaciones aprobadas y las exclusiones del MVP establecidas en PRD §4.3.
Presenta la propuesta antes de crear los archivos.
```

**Qué salió:** Se configuró una estructura de seis subagentes especializados. Se estableció la separación entre implementación, QA independiente y revisión de seguridad. Esta distribución permitió evitar que el mismo agente fuera responsable de implementar y aprobar su propio trabajo.

### Prompt 2.C.4: Definir el control de ejecución mediante el tracker

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Necesitamos incorporar un mecanismo centralizado para controlar la ejecución de los tickets.
Diseña el archivo backlog/TRACKER.md como fuente operativa del estado de ejecución.
Debe permitir:
- Identificar los tickets pendientes y completados.
- Registrar el estado de cada ticket.
- Controlar las dependencias.
- Identificar el agente responsable.
- Evitar que se ejecuten tickets fuera de orden.
- Mantener trazabilidad de las decisiones y resultados.
Define también las reglas para actualizar el tracker y evitar que los agentes trabajen sobre tickets que no estén habilitados.
No permitas que los agentes modifiquen arbitrariamente el orden del backlog.
```

**Qué salió:** Se incorporó backlog/TRACKER.md como mecanismo de seguimiento operativo. Se establecieron reglas para controlar los estados, las dependencias y la asignación de responsables, evitando que los agentes seleccionaran tickets de manera autónoma sin respetar el flujo definido.

### Prompt 2.C.5: Establecer reglas de ejecución secuencial

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Define las reglas de ejecución del flujo multiagente.
La implementación debe realizarse de forma secuencial, respetando las dependencias del backlog.
Establece las siguientes condiciones:
- Solo puede existir un ticket en ejecución.
- El agente debe verificar que el ticket esté pendiente y sea elegible.
- Debe comprobar las dependencias antes de iniciar.
- No debe adelantar tickets que todavía no cumplan sus condiciones.
- Debe registrar los resultados antes de continuar.
- Si aparece un bloqueo, debe detener el flujo y solicitar intervención.
Los agentes no deben decidir unilateralmente cambiar el orden de ejecución.
Documenta estas reglas en la configuración correspondiente.
```

**Qué salió:** Se estableció un flujo secuencial de ejecución, evitando implementaciones paralelas y cambios arbitrarios en el orden del backlog. La elegibilidad y las dependencias quedaron como condiciones obligatorias antes de iniciar cada ticket.

### Prompt 2.C.6: Incorporar puertas de autorización humana

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Incorpora dos puertas de autorización humana dentro del flujo de implementación.
La primera puerta debe controlar la autorización para iniciar un ticket:
- Identificación del ticket.
- Validación de elegibilidad.
- Dependencias satisfechas.
- Agente responsable.
- Alcance de implementación.
- Riesgos y exclusiones.
La segunda puerta debe controlar la aceptación del resultado:
- Cambios realizados.
- Pruebas ejecutadas.
- Resultados de QA.
- Observaciones pendientes.
- Cumplimiento de los criterios de aceptación.
Ningún agente puede superar estas puertas por decisión propia.
Si el usuario no autoriza continuar, el flujo debe detenerse sin ejecutar la siguiente etapa.
Define cómo deben comportarse los agentes ante una autorización denegada o una observación pendiente.
```

**Qué salió:** Se incorporaron dos puertas de control humano. La primera condiciona el inicio de cada ticket y la segunda permite controlar la aceptación del resultado. Se evitó que los agentes pudieran avanzar automáticamente ante decisiones que requieren aprobación del usuario.

### Prompt 2.C.7: Definir las responsabilidades de QA y seguridad

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Formaliza las responsabilidades de los agentes de QA y seguridad dentro del flujo.
QA debe realizar una revisión independiente de la implementación:
- Verificar criterios de aceptación.
- Revisar pruebas.
- Identificar defectos.
- Comprobar contratos y validaciones.
- Informar observaciones al usuario.
El agente de seguridad debe operar exclusivamente en modo de lectura:
- Identificar vulnerabilidades.
- Revisar configuraciones sensibles.
- Detectar exposición de secretos.
- Revisar riesgos de dependencias y permisos.
- Reportar hallazgos sin modificar archivos.
Ninguno de estos agentes debe asumir automáticamente la autorización humana.
Define cómo se comunican los resultados al coordinador y qué condiciones obligan a detener el flujo.
```

**Qué salió:** Se formalizó la independencia de QA respecto del agente implementador y se restringió seguridad a revisión de solo lectura. Los hallazgos deben regresar al flujo de coordinación para su evaluación, sin que los agentes puedan aprobarse mutuamente.

### Prompt 2.C.8: Restringir las operaciones Git y los cambios sobre el repositorio

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Incorpora restricciones explícitas sobre las operaciones Git y las modificaciones del repositorio.
El flujo debe cumplir las siguientes condiciones:
- No realizar commits automáticamente.
- No realizar push automáticamente.
- No modificar archivos fuera del alcance autorizado del ticket.
- No cambiar el orden del backlog.
- No modificar especificaciones aprobadas para justificar diferencias de implementación.
- No continuar si existen bloqueos o autorizaciones pendientes.
Los cambios deben quedar disponibles para revisión humana antes de cualquier operación de publicación.
Documenta estas restricciones en las instrucciones de los agentes y en el flujo de trabajo.
```

**Qué salió:** Se estableció que los agentes no pueden ejecutar commits ni push automáticamente. También se delimitaron los cambios al alcance autorizado y se mantuvo la revisión humana como condición previa a la publicación.

### Prompt 2.C.9: Incorporar las exclusiones funcionales del MVP

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa las restricciones funcionales del proyecto y asegúrate de que todos los agentes respeten las exclusiones establecidas en PRD §4.3.
Las instrucciones de los agentes deben impedir:
- Implementar funcionalidades fuera del MVP.
- Incorporar características V2 sin autorización.
- Ampliar el alcance de un ticket por iniciativa propia.
- Introducir cambios funcionales no respaldados por las especificaciones aprobadas.
Cuando un ticket o una dependencia parezca requerir una funcionalidad excluida, el agente debe detenerse y consultar al usuario.
Asegura que estas restricciones sean transversales a todos los agentes.
```

**Qué salió:** Las exclusiones del PRD §4.3 quedaron incorporadas como restricciones transversales del flujo. Se estableció que cualquier necesidad fuera del MVP debe escalarse al usuario en lugar de resolverse mediante ampliaciones autónomas.

### Prompt 2.C.10: Validar la configuración integral del flujo multiagente

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Realiza una revisión integral de la configuración de agentes y del flujo de trabajo.
Verifica:
- Existencia y coherencia de los seis subagentes.
- Responsabilidades y límites de cada uno.
- Configuración de herramientas y permisos.
- Reglas de ejecución secuencial.
- Funcionamiento de las dos puertas humanas.
- Integración del tracker.
- Independencia de QA.
- Restricciones de seguridad de solo lectura.
- Prohibición de commits y push automáticos.
- Cumplimiento de las exclusiones del MVP.
Identifica inconsistencias, instrucciones contradictorias o permisos excesivos.
No amplíes el alcance funcional ni implementes tickets durante esta revisión.
Entrega un informe con los hallazgos y las correcciones necesarias.
```

**Qué salió:** Se completó la configuración de seis subagentes, el tracker y las reglas de ejecución secuencial. Quedaron establecidos los dos controles humanos, QA independiente, seguridad de solo lectura y ausencia de commits y push automáticos.

---

## Entrega 2.D — Implementación de tickets

### Prompt 2.D.1: Identificar el siguiente ticket elegible

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa el backlog y determina cuál es el siguiente ticket que cumple las condiciones para iniciar su ejecución.
Evalúa sus dependencias, estado actual, orden de prioridad y documentación relacionada.
Todavía no delegues trabajo ni modifiques archivos. Primero presenta tu análisis y justifica cuál debería ser el siguiente ticket.
```

**Qué salió:** El coordinador identificó TK-00.1 — [INFRA] Proyecto backend como el siguiente ticket elegible. Comprobó que estaba pendiente, no tenía dependencias bloqueantes y correspondía al siguiente habilitador del backlog. Presentó la recomendación para aprobación humana.

### Prompt 2.D.2: Autorizar la preparación del ticket

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
De acuerdo con el análisis, podemos avanzar con TK-00.1.
Antes de implementar, prepara la etapa de validación. Delega al agente QA la definición de los escenarios que permitirán comprobar los criterios de aceptación del ticket.
No autorices todavía la implementación. Primero quiero revisar el resultado de QA.
```

**Qué salió:** El coordinador delegó la preparación de los escenarios al agente `qa-bdd-analyst`. Se mantuvo separada la preparación de pruebas de la implementación y se dejó pendiente la aprobación humana para continuar.

### Prompt 2.D.3: Revisar los escenarios de QA

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa el resultado entregado por QA para TK-00.1.
Comprueba que los escenarios cubran los criterios de aceptación, los errores esperados y los comportamientos relevantes del backend.
Identifica cualquier supuesto que necesite una decisión humana antes de autorizar la implementación.
```

**Qué salió:** QA preparó 22 escenarios, organizados en seis archivos, con un total de 58 pruebas. El coordinador presentó los supuestos y observaciones para revisión humana, sin modificar el contrato ni los escenarios por iniciativa propia.

### Prompt 2.D.4: Resolver las observaciones de QA

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Presenta las observaciones identificadas por QA de forma individual, indicando el comportamiento esperado, la recomendación y las consecuencias de cada alternativa.
No apliques cambios ni continúes con la implementación hasta recibir mis decisiones.
```

**Qué salió:** El coordinador presentó cinco observaciones para resolución humana:

- **O1:** aceptar la observación y registrarla para seguimiento en TK-00.6.
- **O2:** corregir el tratamiento de parámetros de ruta mal codificados para responder con 422.
- **O3:** completar la documentación operativa en `CLAUDE.md` y retirar el archivo `.gitkeep` que ya no correspondía.
- **O4:** incorporar `npm ci` como paso de instalación reproducible.
- **O5:** aceptar la observación sin introducir cambios adicionales.

### Prompt 2.D.5: Autorizar las decisiones de QA y la implementación

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Aprobar las decisiones O1 a O5 según lo acordado:
- O1: aceptar y dar seguimiento en TK-00.6.
- O2: corregir el comportamiento de los parámetros mal codificados.
- O3: completar `CLAUDE.md` y eliminar `.gitkeep`.
- O4: incorporar `npm ci`.
- O5: aceptar sin cambios.
Con estas decisiones, autorizo la implementación de TK-00.1.
Delega el trabajo a `backend-engineer`. Mantén los escenarios de QA y el contrato aprobado sin modificaciones. Respeta el límite del parser JSON inferior a 1 MB y evita exponer secretos.
El coordinador debe supervisar el resultado, pero no sustituir al agente de implementación.
```

**Qué salió:** El coordinador recibió la autorización y delegó la implementación a `backend-engineer`. El agente trabajó sobre el scaffold del backend con Express y TypeScript, respetando las decisiones aprobadas, los límites del ticket y los escenarios de QA. El coordinador mantuvo la responsabilidad de seguimiento y coordinación.

### Prompt 2.D.6: Revisar el resultado de implementación

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa el informe  entregado y comprueba que los cambios realizados correspondan al alcance de TK-00.1 y a las decisiones aprobadas.
Verifica qué pruebas se ejecutaron, qué resultados se obtuvieron y si existen observaciones pendientes.
No cierres el ticket todavía.
```

**Qué salió:** El coordinador recibió el resultado de `backend-engineer` y revisó el cumplimiento del alcance. Se confirmó la implementación de la configuración validada con Zod, la aplicación Express, el endpoint de salud, los middlewares de validación y el manejo centralizado de errores. Las observaciones identificadas durante las pruebas quedaron pendientes de resolución.

### Prompt 2.D.7: Revisar la corrección de parámetros mal codificados

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
QA identificó un comportamiento incorrecto en el tratamiento de parámetros de ruta mal codificados.
Revisa el hallazgo y solicita al agente de implementación que lo corrija de acuerdo con la decisión O2.
La respuesta debe ser 422 con `VALIDATION_ERROR`, mientras que las rutas inexistentes deben conservar el 404.
Después solicita la validación de los casos afectados.
```

**Qué salió:** El coordinador gestionó la corrección mediante `backend-engineer`. Se incorporó el tratamiento adecuado de parámetros mal codificados y la prueba `malformed-params.test.ts`. QA verificó casos como `%E0`, `%`, `%zz`, `%C3%28` y `12%E0`, confirmando que los errores de codificación respondieran con 422 y que las rutas inexistentes conservaran el 404.

### Prompt 2.D.8: Autorizar la revisión independiente de seguridad

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Autoriza una revisión de seguridad independiente mediante `security-engineer`.
La revisión debe ser de solo lectura: identifica riesgos, evalúa su impacto y presenta recomendaciones. No permitas que el agente modifique archivos ni amplíe el alcance del ticket.
```

**Qué salió:** El coordinador delegó la revisión a `security-engineer`. El agente analizó la implementación y presentó tres observaciones: SEC-01, SEC-02 y SEC-03. Los hallazgos fueron presentados al usuario para tomar las decisiones correspondientes.

### Prompt 2.D.9: Resolver los hallazgos de seguridad

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Presenta los tres hallazgos de seguridad con su riesgo, recomendación y posible tratamiento.
Necesito decidir cuáles deben corregirse ahora, cuáles pueden aceptarse y cuáles deben trasladarse a otro ticket.
No realices cambios hasta recibir mi aprobación.
```

**Qué salió:** El coordinador presentó las siguientes observaciones:
- **SEC-01:** exposición del encabezado `X-Powered-By` de Express. Se recomendó deshabilitarlo.
- **SEC-02:** riesgo asociado a dependencias de desarrollo. Se evaluó como riesgo temporal aceptable, sin degradar Jest.
- **SEC-03:** manejo y registro de errores 500 y errores de `listen()`. Se recomendó trasladar su tratamiento a TK-00.3.

### Prompt 2.D.10: Autorizar el tratamiento de los hallazgos

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Aprobar el siguiente tratamiento:
- SEC-01: corregir la exposición de `X-Powered-By`.
- SEC-02: aceptar temporalmente el riesgo.
- SEC-03: trasladar a TK-00.3.
Autoriza únicamente la corrección de SEC-01 mediante `backend-engineer`. Mantén las otras dos decisiones como están acordadas.
Después solicita la comprobación correspondiente y confirma que no se hayan introducido cambios fuera del alcance.
```

**Qué salió:** El coordinador delegó la corrección de SEC-01. Se incorporó `app.disable('x-powered-by')` y una prueba automatizada para verificar que el encabezado no apareciera en las respuestas. SEC-02 quedó como riesgo residual aceptado y SEC-03 se reservó para TK-00.3.

### Prompt 2.D.11: Validar integralmente la implementación

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Con las correcciones realizadas, solicita a QA una nueva ejecución integral de los escenarios de TK-00.1.
Comprueba también typecheck y lint. Revisa que los resultados correspondan a la versión final de la implementación.
No cierres el ticket ni prepares commits todavía. Presenta los resultados para mi revisión.
```

**Qué salió:** El coordinador solicitó la validación final a QA. Se obtuvo un resultado de 72/72 pruebas aprobadas, incluyendo los escenarios originales y las pruebas incorporadas durante las correcciones. Typecheck y lint finalizaron sin errores. Se verificó el comportamiento con Node 26.13.1 y que los archivos ajenos al alcance permanecieran intactos.

### Prompt 2.D.12: Autorizar la preparación documental y el commit A

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
La validación técnica está aprobada.
Prepara el primer commit correspondiente a la preparación documental y configuración inicial del ticket.
Antes de ejecutarlo, revisa el diff y confirma qué archivos serán incluidos. Mantén separados los cambios documentales de la implementación del backend.
No realices push.
```

**Qué salió:** El coordinador preparó y ejecutó el commit A, `8a1b861`, correspondiente a la preparación documental inicial. Se conservó la separación respecto del commit de implementación. No se realizó push.

### Prompt 2.D.13: Autorizar el commit de implementación

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Prepara ahora el commit B, correspondiente exclusivamente a la implementación de TK-00.1.
Revisa el diff y confirma que no se incorporen archivos ajenos al alcance ni cambios de documentación que deban permanecer separados.
Una vez confirmado el contenido, ejecuta el commit. No realices push.
```

**Qué salió:** El coordinador revisó el contenido y ejecutó el commit B, `c0e2423`, correspondiente a la implementación del backend. Los commits A y B quedaron separados y registrados en la rama `feature/entrega-2`. No se realizó push.

### Prompt 2.D.14: Resolver la actualización documental del alcance

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Durante la revisión del alcance documental identificamos que RNF-09 y las referencias operativas a `PROMPTS.md` no deben formar parte de los requisitos ni del Definition of Done del MVP.
Analiza el impacto de retirar RNF-09 y sus referencias en la documentación del proyecto.
No modifiques archivos todavía. Presenta los documentos afectados y las modificaciones necesarias.
```

**Qué salió:** El coordinador identificó los documentos que requerían ajustes. Se determinó retirar RNF-09 del PRD, eliminar las referencias operativas a `PROMPTS.md` y actualizar el alcance documental sin modificar código, pruebas ni especificaciones técnicas aprobadas.

### Prompt 2.D.15: Autorizar la actualización documental

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Aprobamos la eliminación de RNF-09 y la actualización de las referencias documentales identificadas.
Autoriza los cambios exclusivamente en los documentos afectados. Mantén `PROMPTS.md` fuera del proyecto, de los análisis técnicos y de los commits.
Actualiza la versión del PRD y revisa que las referencias restantes sean coherentes.
Prepara un commit separado y no realices push.
```

**Qué salió:** Se actualizaron cinco archivos: `CLAUDE.md`, `README.md`, `backlog/README.md`, `docs/ARCHITECTURE.md` y `docs/PRD.md`. El PRD pasó a la versión 1.3 y RNF-09 fue retirado. Se eliminaron las referencias operativas a `PROMPTS.md` sin modificar código, tests, specs ni `openapi.yaml`. Los cambios quedaron registrados en el commit `cf02b2f`. No se realizó push.

### Prompt 2.D.16: Autorizar el cierre de TK-00.1

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
La implementación, QA, seguridad y documentación ya fueron revisadas.
Prepara el cierre formal de TK-00.1 en el tracker.
Actualiza exclusivamente la entrada correspondiente al ticket, registrando el estado final, el commit de implementación y la fecha de aprobación.
No modifiques otros tickets, no inicies TK-00.2 y no realices push.
```

**Qué salió:** El coordinador actualizó exclusivamente `backlog/TRACKER.md`, registrando TK-00.1 como `Hecho`, con el commit de implementación `c0e2423` y la fecha 2026-11-19. El cierre quedó registrado en el commit `6f0a70f`. El ticket finalizó y TK-00.2 permaneció sin iniciar.

### Prompt 2.D.17: Evaluar la elegibilidad del siguiente ticket

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
TK-00.1 ya fue cerrado y aprobado. Analiza el estado actual del backlog y determina cuál es el siguiente ticket elegible para implementación.
Para el siguiente ticket:
- Comprueba su estado y sus dependencias.
- Revisa su descripción, alcance y criterios de aceptación.
- Identifica los documentos y especificaciones que lo respaldan.
- Determina si existen decisiones técnicas pendientes.
- No comiences la implementación ni modifiques archivos.
Quiero que primero presentes el análisis de elegibilidad y las condiciones necesarias para iniciar el trabajo.
```

**Qué salió:** El coordinador identificó TK-00.2, `[INFRA] Proyecto frontend`, como el siguiente ticket elegible después de TK-00.1. El ticket estaba pendiente, no tenía dependencias bloqueantes y correspondía al siguiente elemento del backlog. El coordinador no inició la implementación: presentó el análisis para revisión humana.

### Prompt 2.D.18: Preparar la validación funcional antes de implementar

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Antes de delegar la implementación de TK-00.2, quiero que preparemos una validación independiente de su alcance.
Pasa el ticket a análisis y delega a `qa-bdd-analyst` la elaboración de escenarios de aceptación.
El agente QA debe:
- Revisar el ticket y las especificaciones aprobadas.
- Identificar los criterios funcionales relacionados.
- Preparar escenarios Given/When/Then.
- Detectar ambigüedades, dependencias y condiciones que todavía no se pueden verificar.
- Establecer una línea base de lo que existe antes de implementar.
No delegues todavía a `frontend-engineer`. No modifiques código ni cierres el ticket.
Presenta el resultado de QA para que podamos revisar los escenarios antes de tomar decisiones técnicas.
```

**Qué salió:** El coordinador pasó TK-00.2 a `En análisis` y asignó la responsabilidad a `qa-bdd-analyst`. El agente QA preparó 25 escenarios Given/When/Then, incluyendo la cobertura de los criterios del ticket y de ESC-40, ESC-45, ESC-49 y ESC-50. Como el directorio `frontend/` todavía no existía, los escenarios quedaron inicialmente sin cumplimiento. Se estableció así una línea base independiente para comparar la implementación posterior.

### Prompt 2.D.19: Revisar los escenarios y delimitar el alcance funcional

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Presenta los 25 escenarios preparados por QA y analiza su relación con el alcance real de TK-00.2.
Necesito que distingas:
- Qué comportamiento corresponde al scaffold inicial del frontend.
- Qué comportamiento depende de la autenticación y gestión de sesión.
- Qué comportamiento requiere un entorno de pruebas automatizadas.
- Qué comportamiento pertenece a la infraestructura de despliegue.
Revisa especialmente ESC-40, ESC-45, ESC-49 y ESC-50.
No amplíes TK-00.2 para incorporar funcionalidades que pertenecen a otros tickets. Presenta las dependencias y los escenarios que solo podrán completarse en etapas posteriores.
```

**Qué salió:** Se delimitó el alcance entre varios tickets:
- TK-00.2: estructura del frontend, rutas, layout provisional, menú, cliente API, configuración de entorno y proxy.
- TK-01.2: login, sesión, protección de rutas y cierre de sesión real.
- TK-00.5: infraestructura de pruebas automatizadas y cobertura E2E.
- TK-00.6: Docker y configuración de despliegue.
- TK-00.7: integración continua.
También se determinó que TK-00.2 no debía incorporar rutas ni entradas de menú de funcionalidades V2.

### Prompt 2.D.20: Resolver las decisiones de arquitectura del frontend

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Con los escenarios de QA como referencia, prepara las decisiones técnicas necesarias para implementar TK-00.2.
Quiero revisar explícitamente:
- Stack de frontend y compatibilidad entre versiones.
- Organización de rutas y navegación.
- Comportamiento provisional de las rutas desconocidas.
- Estructura del layout y menú.
- Configuración de variables de entorno.
- Comunicación con el backend.
- Estrategia de proxy durante desarrollo.
- Comandos de desarrollo, build, lint y typecheck.
- Alcance de las pruebas automatizadas.
- Necesidad o no de una revisión de seguridad independiente.
Distingue las decisiones que requieren aprobación humana de las recomendaciones técnicas. No instales dependencias ni modifiques archivos todavía.
```

**Qué salió:** El coordinador presentó las decisiones D1–D10 y las observaciones OBS-01 a OBS-09 identificadas durante el análisis de QA.
Entre las decisiones principales quedaron:
- Implementación a cargo de `frontend-engineer` y validación independiente a cargo de `qa-bdd-analyst`.
- No incorporar un test runner en TK-00.2; trasladar la automatización a TK-00.5.
- Mantener una configuración tipada de rutas y menú.
- Redirigir temporalmente las rutas desconocidas a `/dashboard`.
- Mantener las opciones del menú con los textos exactos: Inicio, Productos, Pedidos y Cerrar sesión.
- Usar `VITE_API_BASE_URL`, con `/api/v1` como valor por defecto.
- Configurar el proxy de Vite hacia `localhost:3000`.
- Utilizar un cliente HTTP liviano basado en `fetch`, sin Axios.
- Documentar los comandos del frontend en `CLAUDE.md`.
- No requerir una revisión de seguridad independiente para este ticket, según D10.
Las decisiones quedaron pendientes de aprobación humana.

### Prompt 2.D.21: Revisar las observaciones y aprobar el alcance

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa las observaciones OBS-01 a OBS-09 presentadas por QA y relaciónalas con las decisiones D1–D10.
Quiero que las condiciones de implementación sean explícitas:
- Las dependencias deben tener versiones exactas, sin rangos `^` ni `~`.
- Debe existir un comando de typecheck.
- La ausencia de pruebas automatizadas debe quedar registrada como excepción del ticket, no como cumplimiento.
- `frontend/dist/` debe quedar ignorado por Git.
- Vite debe utilizar un puerto definido y `strictPort`.
- El comportamiento provisional de `/` y las rutas desconocidas debe quedar documentado.
- El menú debe conservar los textos aprobados.
- ESC-40, ESC-45 y ESC-49 no deben declararse completamente satisfechos si quedan pruebas o funcionalidades pendientes.
- Debe documentarse la consideración de CORS cuando se configure una URL externa.
Si no existen contradicciones, presenta el conjunto final de decisiones para mi aprobación. No implementes todavía.
```

**Qué salió:** Se consolidaron las decisiones técnicas y las nueve observaciones de QA como condiciones de implementación.
Se acordó que los escenarios que no pudieran automatizarse en TK-00.2 debían conservar su estado parcial y sus dependencias futuras. También se estableció que el proxy de desarrollo utilizaría el backend local y que la configuración de entorno no debía introducir secretos en el bundle.

### Prompt 2.D.22: Verificar las dependencias antes de instalarlas

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Antes de autorizar la instalación de dependencias, delega a `frontend-engineer` una comprobación de compatibilidad del stack aprobado.
La verificación debe realizarse fuera del repositorio del proyecto, en un entorno temporal.
Debe comprobar:
- Disponibilidad de las versiones exactas.
- Compatibilidad entre React, React DOM y sus tipos.
- Compatibilidad de TypeScript con ESLint y typescript-eslint.
- Compatibilidad de Vite con su plugin de React.
- Compatibilidad de React Router con React 18.
- Compatibilidad de Ant Design con React 18.
- Funcionamiento de instalación, lockfile, `npm ci`, build, lint y typecheck.
- Dependencias transitivas e incompatibilidades.
Presenta las versiones concretas y los resultados antes de instalar nada en el proyecto.
No modifiques el repositorio.
```

**Qué salió:** El coordinador delegó la comprobación a `frontend-engineer`. El especialista probó conjuntamente las 17 dependencias propuestas utilizando Node 26.13.1 y npm 11.20.0. La instalación, `npm ci`, `tsc -b`, `vite build` y `eslint .` finalizaron correctamente. También comprobó que `npm ls` no presentaba dependencias inválidas o incompatibles.
La comprobación permitió detectar restricciones importantes de compatibilidad antes de introducir el stack en el proyecto.

### Prompt 2.D.23: Evaluar incompatibilidades y decisiones sobre dependencias

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Presenta los resultados de la verificación de dependencias y explícame las incompatibilidades detectadas.
Quiero revisar especialmente:
- La versión de Ant Design compatible con React 18.
- La versión de React Router compatible con React 18.
- La versión de TypeScript compatible con typescript-eslint.
- La necesidad de `skipLibCheck`.
- Los scripts de instalación que npm bloquea por no estar aprobados.
- El tamaño del bundle y sus advertencias.
- La versión de Node requerida.
- La necesidad de `@types/node` para la configuración de Vite.
- La justificación de cada dependencia de desarrollo.
No cambies versiones por tu cuenta. Presenta alternativas y consecuencias para que pueda decidir.
```

**Qué salió:** Se evaluaron las siguientes decisiones:

- Ant Design 5.29.3, porque Ant Design 6 presentaba incompatibilidades de tipos con React 18.
- React Router 7.18.6, compatible con React 18, utilizando `react-router`.
- TypeScript 6.0.3, porque TypeScript 7 no era compatible con typescript-eslint 8.73.0.
- `skipLibCheck: true`, para omitir la comprobación de declaraciones de terceros sin desactivar el chequeo del código propio.
- Node 26.x como versión requerida.
- `@types/node` 26.6.6 para resolver los tipos de `node:path` utilizados por Vite.
- Aceptar temporalmente la advertencia de bundle superior a 500 kB.
- No aprobar el script de instalación de `fsevents`; registrar su seguimiento para TK-00.6 y TK-00.7.
La comprobación también confirmó la inclusión de `@eslint/js` y la justificación de `globals`.

### Prompt 2.D.24: Aprobar las versiones y autorizar la implementación

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Apruebo las 17 dependencias y sus versiones exactas, junto con las decisiones R1–R8 y las decisiones adicionales presentadas.
Confirma que la implementación respetará lo siguiente:
- React 18.3.1 y React DOM 18.3.1.
- TypeScript 6.0.3.
- Vite 8.3.8 y su plugin de React 6.3.0.
- Ant Design 5.29.3.
- React Router 7.18.6.
- ESLint 10.15.0 y el conjunto de plugins aprobado.
- `@types/node` 26.6.6.
- Node 26.x y registro de la versión de npm.
- Versiones exactas, sin `^` ni `~`.
- Lockfile obligatorio y verificación mediante `npm ci`.
El script de instalación de `fsevents` no está aprobado. Si aparece una acción de instalación adicional que requiera autorización, detente y consúltame.
Una vez confirmadas estas condiciones, autorizo la implementación de TK-00.2 por `frontend-engineer`.
```

**Qué salió:** El coordinador registró la aprobación de las dependencias y las decisiones técnicas. TK-00.2 pasó a `En desarrollo`, con `frontend-engineer` como responsable de implementación. La autorización mantuvo las restricciones de alcance y las condiciones de instalación previamente acordadas.

### Prompt 2.D.25: Delegar la implementación del frontend

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Delega la implementación de TK-00.2 a `frontend-engineer`, utilizando exclusivamente las decisiones aprobadas y los escenarios de QA como referencia.
La implementación debe contemplar:
- Scaffold de React, TypeScript y Vite.
- Configuración de rutas y navegación.
- Layout base y menú provisional.
- Pantallas correspondientes a las rutas MVP.
- Cliente API centralizado con `fetch`.
- Configuración de `VITE_API_BASE_URL`.
- Proxy de desarrollo hacia el backend.
- Scripts de desarrollo, build, lint y typecheck.
- Configuración de TypeScript, ESLint y Vite.
- Lockfile y versiones exactas.
Restricciones:
- No incorporar funcionalidades de autenticación ni gestión de sesión.
- No crear rutas ni menús V2.
- No incorporar un test runner.
- No modificar backend, especificaciones ni documentación fuera de los archivos expresamente autorizados.
- No realizar commits ni push.
- No leer, modificar ni incorporar `PROMPTS.md`.
Si aparece una discrepancia técnica que requiera una decisión nueva, detente y preséntamela antes de continuar.
```

**Qué salió:** El coordinador delegó la implementación al especialista frontend. Se construyeron los 21 archivos del proyecto frontend, además de los cambios autorizados en `.env.example`, `.gitignore` y la sección de comandos de `CLAUDE.md`.
El especialista utilizó Node 26.13.1 y npm 11.20.0, generó el lockfile y comprobó la instalación desde cero.
La aplicación incorporó las rutas MVP, el layout provisional, el menú aprobado, las pantallas iniciales, el cliente API y el proxy de desarrollo.
No se incorporaron autenticación, sesión, rutas V2 ni pruebas automatizadas.

### Prompt 2.D.26: Resolver el comportamiento de la URL base vacía

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Durnte la revisión de la implementación se identificó un detalle en la configuración de `VITE_API_BASE_URL`.
El operador de fallback utiliza `??`, por lo que una variable definida como cadena vacía no activa el valor por defecto.
Analiza el problema y presenta una corrección mínima que permita utilizar `/api/v1` tanto cuando la variable no existe como cuando está vacía, sin alterar los valores personalizados válidos.
No modifiques el código hasta presentar la solución y solicitar mi aprobación.
```

**Qué salió:** El coordinador presentó el problema y propuso utilizar `||` en lugar de `??` para resolver el fallback.
Se aprobó el cambio.
`frontend-engineer` modificó una línea en `frontend/src/api/client.ts` y comprobó los siguientes casos:
- Variable ausente: `/api/v1`.
- Variable vacía: `/api/v1`.
- Variable `/api/v1`: se conserva.
- Variable personalizada: se conserva.
Typecheck, lint y build volvieron a pasar.

### Prompt 2.D.27: Solicitar validación independiente de la implementación

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
La implementación de TK-00.2 está terminada. Antes de preparar su cierre, delega la validación independiente a `qa-bdd-analyst`.
El agente debe:
- Ejecutar los escenarios preparados antes de la implementación.
- Verificar instalación y dependencias.
- Comprobar build, lint y typecheck.
- Revisar las rutas y el menú en navegador.
- Validar el proxy contra el backend real.
- Comprobar la configuración de entorno y que no se expongan secretos.
- Revisar que no se hayan incorporado funcionalidades fuera del alcance.
- Comprobar que el backend no haya sufrido modificaciones.
La validación debe ser independiente: QA no debe modificar el código del implementador.
Solicita un informe con evidencias, escenarios aprobados, parciales, defectos y observaciones. No cierres el ticket.
```

**Qué salió:** El coordinador pasó TK-00.2 a `En QA` y asignó la validación a `qa-bdd-analyst`.
El especialista ejecutó las comprobaciones de forma independiente y emitió un informe con el veredicto **Aprobado con observaciones**.
No encontró defectos bloqueantes. Confirmó el funcionamiento de las rutas, el menú, el proxy, el build, lint y typecheck, además de la ausencia de secretos en el bundle.
También verificó que los 72 tests del backend continuaban pasando.

### Prompt 2.D.28: Evaluar el informe de QA y aceptar sus observaciones

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Presenta y analiza el informe de `qa-bdd-analyst`.
Necesito distinguir:
- Escenarios aprobados.
- Escenarios parciales por alcance.
- Escenarios verificados mediante métodos alternativos.
- Observaciones no bloqueantes.
- Excepciones aprobadas durante el diseño.
- Trabajo que debe trasladarse a otros tickets.
No conviertas una cobertura parcial en cumplimiento completo.
Considera que:
- El tamaño del bundle fue aceptado en R6.
- La ausencia de favicon y el comportamiento del menú en pantallas estrechas quedan fuera del alcance aprobado.
- Las observaciones O-4 y O-5 fueron resueltas.
- QA-00.2-14 utilizó un método alternativo porque el cliente HTTP no es importado por ninguna pantalla y Vite lo elimina del bundle.
Presenta tu recomendación, pero no cierres el ticket ni modifiques el tracker sin mi autorización.
```

**Qué salió:**
El informe de QA registró 22 escenarios aprobados y tres parciales:
- QA-00.2-08, relacionado con ESC-40.
- QA-00.2-11, relacionado con ESC-49.
- QA-00.2-14, relacionado con la verificación del valor por defecto del cliente HTTP.
Para QA-00.2-14, el especialista compiló el cliente HTTP de forma aislada y comprobó los distintos valores de configuración. El método alternativo fue aceptado, sin forzar la inclusión del cliente en el bundle de la aplicación.

### Prompt 2.D.29: Revisar la Definition of Done antes del cierre

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Antes de preparar el paquete de cierre, revisa la Definition of Done de `backlog/README.md` punto por punto contra la evidencia de implementación y QA.
Distingue claramente:
- Criterios cumplidos.
- Criterios parcialmente cubiertos.
- Criterios no aplicables.
- Excepciones aprobadas.
- Pendientes que corresponden a otros tickets.
No asumas que la aprobación de QA equivale automáticamente al cumplimiento completo de la Definition of Done.
Si encuentras un criterio obligatorio que no esté cubierto por las excepciones aprobadas, detente y explícame la discrepancia.
No modifiques archivos, no hagas commits y no cierres el ticket durante esta revisión.
```

**Qué salió:** La revisión identificó que el punto 2 de la Definition of Done tenía dos aspectos diferentes:
- Las pruebas de unidad e integración y los criterios automatizados estaban exceptuados por D3/OBS-03 y quedaban pendientes de TK-00.5.
- Lint y typecheck pasaban localmente, pero todavía no podían ejecutarse en CI porque la infraestructura de integración continua correspondía a TK-00.7.
El coordinador detectó que la excepción de D3/OBS-03 no cubría explícitamente la ejecución en CI y solicitó una decisión humana antes de preparar el cierre.

### Prompt 2.D.30: Aprobar la excepción de CI y autorizar el seguimiento

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Apruebo ampliar explícitamente la excepción del punto 2 de la Definition of Done para TK-00.2.
El estado debe quedar documentado así:
- Tests de unidad e integración: exceptuados por D3/OBS-03, pendientes de TK-00.5.
- Lint local: cumplido.
- Typecheck local: cumplido.
- Lint y typecheck en CI: pendientes de TK-00.7.
No marques el punto 2 completo como cumplido. La excepción de CI es distinta de la excepción de pruebas y se limita a TK-00.2.
También autorizo los cambios correspondientes en `backlog/TRACKER.md`:
- Pasar TK-00.2 a `Pendiente de aprobación humana`.
- Registrar la cobertura parcial de ESC-40, ESC-45 y ESC-49.
- Registrar la futura verificación de QA-00.2-14 en el build de la aplicación cuando alguna pantalla utilice el cliente HTTP.
- Registrar la ejecución de lint y typecheck del frontend y backend en TK-00.7.
Después de modificar el tracker, presenta el diff exacto y el paquete de cierre.
No realices commits, push ni cierres el ticket.
```

**Qué salió:** El coordinador actualizó exclusivamente `backlog/TRACKER.md`, dejando TK-00.2 en `Pendiente de aprobación humana` y registrando los seguimientos correspondientes. La revisión confirmó que no se modificaron otros archivos durante esta etapa.

### Prompt 2.D.31: Corregir la presentación de la cobertura funcional y QA

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa el paquete de cierre y separa dos dimensiones que no deben confundirse:
1. El resultado individual de cada escenario QA utilizando el método de verificación acordado.
2. El grado de cobertura completa de cada criterio funcional ESC-, incluyendo las pruebas automatizadas pendientes.
En particular:
- Los 22 escenarios aprobados deben mantenerse como aprobados.
- Los tres escenarios parciales son QA-00.2-08, QA-00.2-11 y QA-00.2-14.
- ESC-45 se verificó mediante QA-00.2-09 y QA-00.2-10, ambos aprobados.
- ESC-45 no debe contarse dos veces ni presentarse como un defecto funcional.
- Debe indicarse que su automatización queda pendiente de TK-00.5.
- ESC-40 y ESC-49 deben conservar sus pendientes funcionales y de automatización.
No ejecutes nuevas pruebas ni modifiques código. Presenta una versión corregida del paquete de cierre.
```

**Qué salió:** El coordinador presentó una versión corregida que separó los resultados de QA de la cobertura completa de los criterios funcionales.
Quedó documentado que:
- 22 de los 25 escenarios fueron aprobados.
- Tres escenarios quedaron parciales.
- ESC-45 está verificado funcionalmente por inspección del código y del build, pero su automatización sigue pendiente.
- ESC-40 y ESC-49 mantienen sus pendientes funcionales y de automatización.
- La Definition of Done conserva las excepciones de pruebas y CI diferenciadas.

### Prompt 2.D.32: Autorizar los commits y el cierre de TK-00.2

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Apruebo expresamente los dos commits y el cierre de TK-00.2.
**Commit 1 — Implementación**
Autorizo incluir:
- Los 21 archivos de `frontend/`, incluido el lockfile.
- `.env.example`.
- `.gitignore`.
- `CLAUDE.md`, exclusivamente con los cambios autorizados en la sección de comandos.
- `backlog/TRACKER.md`, con TK-00.2 en `Pendiente de aprobación humana` y los siete seguimientos registrados.
**Commit 2 — Cierre**
Autorizo un segundo commit exclusivamente sobre `backlog/TRACKER.md` para:
- Cambiar TK-00.2 a `Hecho`.
- Registrar el hash real del primer commit.
- Registrar la fecha efectiva de aprobación.
Condiciones:
- No incluir `PROMPTS.md` ni `node_modules`.
- No modificar otros archivos.
- No hacer push.
- Verificar los hashes, el contenido del segundo commit y que el árbol de trabajo quede limpio.
- Después de ambos commits, detenerse sin iniciar otro ticket.
```

**Qué salió:** El coordinador ejecutó los dos commits locales, sin push:
1. `f99cb47b826a1299b2634973c07fb4563b628ccd` — Implementación del frontend.
2. `657325aaf2060a5fa499073592fb157f98d5f586` — Cierre de TK-00.2.
El segundo commit modificó exclusivamente una línea de `backlog/TRACKER.md`, cambiando el estado a `Hecho` y registrando el hash del primer commit y la fecha `2026-11-19`.
La verificación final confirmó:
- Ninguno de los commits incluyó `PROMPTS.md` ni `node_modules`.
- El árbol de trabajo quedó limpio.
- La rama `feature/entrega-2` quedó dos commits por delante de `origin/feature/entrega-2`.
- No se realizó push.
- El coordinador se detuvo sin iniciar TK-00.6, TK-00.3 ni otro ticket.
**Resultado:** TK-00.2 quedó cerrado como `Hecho`, con dos commits locales y trazabilidad de implementación y cierre.

### Prompt 2.D.33: Evaluar la elegibilidad de TK-00.6

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Necesito evaluar la elegibilidad de TK-00.6 antes de iniciar cualquier implementación.
Actúa como coordinador del ticket. Revisa el backlog, las especificaciones aprobadas, la arquitectura existente, los requisitos no funcionales y las dependencias con los tickets anteriores.
Determina:
- Qué problema resuelve TK-00.6.
- Qué entregables requiere.
- Qué tickets o decisiones condicionan su ejecución.
- Qué requisitos deben estar resueltos antes de implementar.
- Qué aspectos necesitan análisis de QA y seguridad.
Recuerda que MedSupply AI es un MVP académico: el evaluador debe poder clonar, configurar, levantar y probar el producto. No se desplegará en producción. Evita introducir complejidad productiva que no aporte a ese objetivo.
No modifiques archivos ni cambies estados. Si falta información, identifícala y presenta el resultado para revisión.
```

**Qué salió:** Se identificó TK-00.6 como un ticket habilitador de infraestructura. Se determinó que debía preparar la ejecución reproducible del producto, considerando Docker, PostgreSQL, backend, frontend y la entrega integrada.
Se estableció que primero debía completarse el análisis y la preparación documental mediante Gate 1. No se autorizó todavía la implementación.

### Prompt 2.D.34: Construir la matriz de escenarios de QA

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Prepara la matriz de QA de TK-00.6 antes de implementar.
Delega el análisis de escenarios al especialista correspondiente y consolida los resultados.
La matriz debe cubrir:
- Configuración y validación de variables.
- Inicialización de PostgreSQL.
- Permisos del usuario de aplicación.
- Construcción de imágenes Docker.
- Comunicación entre servicios.
- Migraciones y datos iniciales.
- Acceso al producto mediante Nginx.
- Recuperación ante errores.
- Reproducibilidad del entorno.
Separa los escenarios que pertenecen a TK-00.6 de aquellos que corresponden a otros tickets.
No inventes criterios de aceptación ni modifiques las especificaciones aprobadas. Presenta los escenarios, sus dependencias y las dudas detectadas para revisión.
```

**Qué salió:** Se preparó la matriz A1 con 48 escenarios de TK-00.6 y 24 escenarios diferidos a otros tickets.
Se identificaron escenarios provisionales y dependencias que necesitaban decisiones técnicas antes de convertirse en criterios definitivos.

### Prompt 2.D.35: Analizar la arquitectura de infraestructura

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Analiza la arquitectura necesaria para implementar TK-00.6.
Delega el análisis técnico a los especialistas correspondientes y consolida una propuesta de arquitectura.
Evalúa la relación entre:
- PostgreSQL.
- Backend.
- Frontend.
- Nginx.
- Dockerfiles.
- Docker Compose.
- Migraciones y seed.
- Configuración por entorno.
Distingue el entorno de desarrollo de la entrega demostrable del MVP.
Prioriza una arquitectura sencilla y reproducible. No introduzcas infraestructura adicional ni mecanismos propios de producción que no sean necesarios para ejecutar y demostrar el producto.
Prepara el documento A2 en el scratchpad. No lo copies al repositorio ni modifiques archivos del proyecto.
```

**Qué salió:**
Se preparó la propuesta A2 de arquitectura, incluyendo la separación entre el Compose de desarrollo y el de entrega, el uso de PostgreSQL, la construcción del backend y el acceso al frontend mediante Nginx.
Quedaron identificadas decisiones técnicas que debían resolverse antes de implementar.

### Prompt 2.D.36: Consolidar las decisiones técnicas pendientes

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Consolida las decisiones técnicas necesarias para TK-00.6.
Revisa A1, A2, los requisitos, la arquitectura y las decisiones previamente aprobadas.
Para cada punto pendiente:
1. Describe el problema.
2. Explica las alternativas viables.
3. Expone las consecuencias de cada alternativa.
4. Recomienda la opción más sencilla que satisfaga los requisitos del MVP.
5. Identifica si requiere aprobación humana.
No conviertas recomendaciones en decisiones aprobadas. No modifiques los documentos ni el repositorio.
```

**Qué salió:** Se consolidaron las decisiones D.2 y los puntos técnicos pendientes. Se estableció qué aspectos podían resolverse documentalmente y cuáles condicionaban la implementación.
Se mantuvo la separación entre decisiones propuestas y decisiones que necesitaban autorización.

### Prompt 2.D.37: Revisar y aprobar las decisiones D.2

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Prepara la revisión de las decisiones D.2 de TK-00.6.
Presenta cada decisión con su justificación y sus consecuencias sobre:
- La matriz QA.
- La arquitectura.
- Los archivos de configuración.
- La construcción de imágenes.
- La ejecución de los servicios.
- La entrega del MVP.
Identifica cuáles necesitan una decisión expresa del usuario.
No apliques cambios todavía. Espera la aprobación humana antes de modificar los documentos.
```

**Qué salió:** Se revisaron 13 decisiones D.2.
El usuario aprobó ocho decisiones: #1, #2, #3, #4, #5, #8, #9 y #12. Las demás conservaron su estado según las decisiones y condiciones previamente acordadas.

### Prompt 2.D.38: Aplicar las decisiones aprobadas a la documentación

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Aplica exclusivamente las ocho decisiones D.2 aprobadas (#1, #2, #3, #4, #5, #8, #9 y #12) a los documentos autorizados.
Los especialistas pueden preparar las modificaciones, pero tú debes consolidarlas y revisar su coherencia.
Comprueba que los cambios:
- No contradigan los requisitos.
- No alteren decisiones anteriores.
- No introduzcan alcance adicional.
- Mantengan la coherencia entre QA, arquitectura y backlog.
No apliques decisiones pendientes ni modifiques archivos del repositorio. Presenta los diffs para revisión.
```

**Qué salió:** Las ocho decisiones aprobadas quedaron reflejadas en los cuatro documentos autorizados.
Se revisaron las ediciones de los especialistas y se realizó una auditoría de coherencia. No se detectaron contradicciones en los cambios consolidados.

### Prompt 2.D.39: Auditar la documentación antes de aprobar Gate 1

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Realiza una auditoría documental de TK-00.6 antes de solicitar la aprobación de Gate 1.
Revisa A1 y A2, las decisiones aplicadas y los puntos que siguen pendientes.
Comprueba:
- Trazabilidad de los escenarios.
- Coherencia de la arquitectura.
- Correspondencia entre decisiones y documentos.
- Ausencia de contradicciones.
- Identificación de escenarios diferidos.
- Que las decisiones pendientes no aparezcan como aprobadas.
Si encuentras errores, presenta el problema y propone la corrección mínima. No modifiques archivos sin autorización.
```

**Qué salió:** Se detectaron y revisaron detalles de redacción y presentación documental. Se corrigieron únicamente los puntos autorizados y se verificó que los fragmentos señalados como defectuosos no correspondían a errores reales de los documentos.
A1 y A2 quedaron preparadas para su aprobación y posterior incorporación al repositorio.

### Prompt 2.D.40: Aprobar y trasladar A1 y A2 al repositorio

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Una vez aprobados los documentos A1 y A2, prepara su incorporación al repositorio.
Antes de copiar:
1. Comprueba los archivos de origen.
2. Identifica los destinos autorizados.
3. Verifica que no existan modificaciones locales que deban preservarse.
4. Copia únicamente los documentos aprobados.
5. Compara los hashes de origen y destino.
6. Comprueba que el resto del contenido existente permanezca intacto.
No modifiques otros archivos, no hagas commits ni push y presenta los resultados.
```

**Qué salió:** A1 quedó incorporada en `docs/qa/TK-00.6-matrix.md` y A2 en `docs/ARCHITECTURE.md`.
Los hashes coincidieron con los documentos aprobados:
- A1: `c4ecf64dd504…`
- A2: `940de9d43ac6…`
Se conservaron los 48 escenarios de TK-00.6 y los 24 diferidos. No se detectaron conflictos documentales.

### Prompt 2.D.41: Preparar el plan de implementación

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Con Gate 1 preparado, construye el plan de implementación de TK-00.6.
Divide el trabajo en pasos técnicos pequeños y verificables.
El plan debe separar:
- Preparación del tracker.
- Incorporación de documentos.
- Construcción del backend.
- PostgreSQL y Compose de desarrollo.
- Dockerfile del frontend y Nginx.
- Compose de entrega.
- README y comandos de ejecución.
- QA independiente.
- Revisión de seguridad.
- Definition of Done y preparación de Gate 2.
Identifica las dependencias entre pasos y los archivos que se modificarían.
Recuerda que los pasos del plan no son Gates. Gate 2 solo puede comenzar cuando la implementación, QA, seguridad y DoD estén completos.
No ejecutes cambios. Presenta el plan para autorización.
```

**Qué salió:** Se estableció un plan de diez pasos numerados del 0 al 9.
Los pasos 0 a 6 corresponden a implementación; el paso 7 a QA independiente; el paso 8 a revisión de seguridad; y el paso 9 a DoD y preparación de Gate 2.
Se mantuvo la distinción entre los dos Gates del ticket y los diez pasos del plan.

### Prompt 2.D.42: Actualizar el tracker para iniciar infraestructura

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Con la autorización recibida, ejecuta únicamente el paso 0 del plan de TK-00.6.
Actualiza el tracker para reflejar que el ticket inicia su etapa de infraestructura y asigna el responsable definido.
Antes de modificarlo, verifica el estado actual y conserva la información de los demás tickets.
No implementes componentes, no alteres otros estados, no hagas commits ni push.
Al finalizar, presenta el diff y confirma exactamente qué cambió.
```

**Qué salió:** TK-00.6 pasó a `En infraestructura`, con `infrastructure-engineer` como responsable.
No se modificaron otros tickets ni se alteró el seguimiento de otros trabajos.

### Prompt 2.D.43: Construir la imagen Docker del backend

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Ejecuta el paso 2 del plan de infraestructura: preparar la imagen Docker del backend.
Delega la implementación al especialista correspondiente y supervisa los cambios.
La solución debe:
- Utilizar la versión de Node aprobada.
- Compilar TypeScript para producción.
- Ejecutar el backend desde `dist`.
- Instalar únicamente dependencias necesarias en la imagen final.
- Ejecutarse con un usuario no privilegiado.
- Mantener las variables de entorno fuera de la imagen.
- Respetar las decisiones de seguridad y arquitectura aprobadas.
No agregues herramientas o dependencias innecesarias.
Después, verifica build, tests, lint, typecheck y ejecución de la imagen. Presenta el diff, resultados y cualquier desviación.
No hagas commits ni push.
```

**Qué salió:** Se incorporó el Dockerfile multi-stage del backend, la configuración de compilación y los scripts necesarios.
Las verificaciones confirmaron:

- 72 tests aprobados.
- Lint y typecheck correctos.
- Build de producción satisfactorio.
- Ejecución del servidor con respuesta HTTP 200.
- Usuario no privilegiado en la imagen final.
- Ausencia de dependencias de desarrollo en la imagen final.
Se conservó la imagen construida para reutilizarla en pasos posteriores. No se realizaron commits ni push.

### Prompt 2.D.44: Configurar PostgreSQL y Compose de desarrollo

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Ejecuta el paso 3 del plan: preparar PostgreSQL y el Compose de desarrollo.
Implementa únicamente lo necesario para levantar la base de datos del entorno de desarrollo.
Respeta las decisiones aprobadas:
- PostgreSQL 16 con digest fijado.
- Puerto publicado exclusivamente en `127.0.0.1:5432`.
- Volumen persistente.
- Inicialización mediante script.
- Usuario de aplicación sin privilegios de superusuario.
- Creación de `medsupply` y `medsupply_test` en desarrollo.
- Variables obligatorias sin valores predeterminados inseguros.
- Healthcheck mediante `pg_isready -h 127.0.0.1`.
No introduzcas servicios adicionales ni modifiques el backend o frontend.
Verifica inicialización, permisos, persistencia, conexión y comportamiento ante variables inválidas. Utiliza únicamente credenciales ficticias en las pruebas.
Presenta los cambios y detente al finalizar.
```

**Qué salió:** Se incorporaron:
- `docker-compose.yml`.
- `docker/postgres/init-db.sh`.
- Las variables y documentación correspondientes en `.env.example`.
Las pruebas confirmaron la creación de las bases, los permisos del usuario de aplicación, la persistencia y el comportamiento ante credenciales inválidas.
Se detectaron dos desviaciones de método para QA:
- Escenario 06: Vite escucha en IPv6, por lo que se utilizará `localhost:5173`.
- Escenario 04: al no existir `psql` en el host, se utilizarán `nc` y un contenedor temporal con la imagen PostgreSQL aprobada.

### Prompt 2.D.45: Analizar los hallazgos del Compose de desarrollo

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Antes de continuar con el paso 4, analiza los hallazgos detectados durante la implementación del Compose de desarrollo.
Evalúa especialmente qué ocurre cuando falla la inicialización de PostgreSQL y se intenta recuperar el servicio conservando el volumen.
Determina:
- Qué estado deja PostgreSQL después del fallo.
- Si el healthcheck actual detecta una inicialización incompleta.
- Si un servicio dependiente podría arrancar con una base no inicializada.
- Qué alternativas existen para resolverlo con el menor cambio posible.
Separa los hallazgos técnicos de las decisiones que requieren autorización.
No modifiques archivos ni inicies el paso 4.
```

**Qué salió:**
Se identificó que un volumen persistente puede conservar un clúster PostgreSQL inicializado aunque el script de creación de bases haya fallado.
Por tanto, `pg_isready` por sí solo no garantiza que `medsupply` exista.
Se recomendó añadir una comprobación de existencia de `medsupply` al healthcheck, sin contraseña y conservando la comprobación TCP.
El usuario solicitó analizar también los posibles estados parciales antes de autorizar la modificación.

### Prompt 2.D.46: Evaluar los estados parciales de la inicialización

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Investiga si el script `docker/postgres/init-db.sh` puede dejar un estado parcial que no sea detectado por un healthcheck que compruebe únicamente la existencia de `medsupply`.
Revisa el orden real de ejecución de las sentencias SQL y determina:
- Si puede existir `medsupply` sin el usuario de aplicación.
- Si puede existir con atributos o permisos incompletos.
- Si puede existir sin `medsupply_test` en desarrollo.
- Qué consecuencias tendría cada escenario.
Si encuentras un estado parcial no detectado, detente y presenta alternativas. No modifiques archivos ni implementes una solución sin autorización.
```

**Qué salió:**
Se identificó un caso no detectado: si se creaba `medsupply` correctamente, pero fallaba posteriormente la creación de `medsupply_test`, el healthcheck podía considerar sano el servicio aunque la inicialización de desarrollo estuviera incompleta.
Se determinó que el usuario de aplicación no podía faltar si `medsupply` existía, porque se crea antes y la base se crea con ese usuario como propietario.
Se presentaron tres alternativas:
- (a) Reordenar la creación para que `medsupply` siempre sea la última base.
- (b) Comprobar también `medsupply_test` en desarrollo.
- (c) Aceptar el riesgo residual.
No se modificaron archivos ni se levantaron contenedores.

### Prompt 2.D.47: Corregir el orden de inicialización y el healthcheck

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Con la aprobación expresa de la opción (a), ejecuta la corrección del hallazgo 1 de TK-00.6.
Modifica exclusivamente:
- `docker/postgres/init-db.sh`.
- `docker-compose.yml`.
Primero reordena la inicialización para crear el usuario, después `medsupply_test` en desarrollo y finalmente `medsupply`.
Después amplía el healthcheck para conservar `pg_isready -h 127.0.0.1` y comprobar también la existencia de `medsupply`, sin contraseña.
Reproduce el escenario de fallo de inicialización y recuperación con un volumen persistente. Comprueba que `docker compose up --wait` no   considere sano el servicio incompleto y que el entorno se recupere al recrearlo desde cero.
Verifica también que `medsupply_test` siga existiendo únicamente en desarrollo y que los permisos del usuario no cambien.
Respeta el alcance del MVP: no agregues infraestructura, servicios ni endurecimiento productivo innecesario.
No modifiques otros archivos, no hagas commits ni push y no inicies el paso 4.
Al finalizar, presenta el diff, las evidencias de las pruebas y el estado de Git. Detente y espera mi revisión.
```

**Qué salió:** Pendiente de ejecución, se indico que el usuario aprobó la opción (a) y autorizó expresamente modificar `docker/postgres/init-db.sh` y `docker-compose.yml` para corregir el orden de inicialización y el healthcheck.
La ejecución y sus resultados todavía deben verificarse antes de documentarlos como completados.

### Prompt 2.D.51: Evaluar la seguridad con controles proporcionales al MVP

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Realiza la evaluación de seguridad correspondiente a TK-00.6, considerando que MedSupply AI es un MVP académico que no se desplegará en producción.
Evalúa los riesgos y controles existentes con un enfoque proporcional al objetivo demostrativo.
Considera especialmente:
- Configuración de PostgreSQL y privilegios del usuario de aplicación.
- Exposición de puertos y servicios.
- Configuración de Docker Compose y Nginx.
- Manejo de variables de entorno y credenciales.
- Separación de responsabilidades entre los servicios.
- Riesgos derivados de las limitaciones conocidas del entorno.
Clasifica los hallazgos por severidad y distingue entre:
- Problemas que deben corregirse antes de cerrar TK-00.6.
- Riesgos que pueden aceptarse por el alcance académico del MVP.
- Mejoras que pueden diferirse a tickets posteriores.
No introduzcas infraestructura, controles ni endurecimiento exclusivo de producción. No modifiques archivos ni implementes correcciones sin autorización.
Presenta evidencias, riesgos, recomendaciones y decisiones que requieren aprobación humana. Detente al finalizar.
```

**Qué salió:**
- La evaluación no identificó hallazgos críticos, altos ni medios que bloquearan el cierre.
- Se documentaron los hallazgos B-1 y B-2.
- Se registraron cinco riesgos o limitaciones para seguimiento.
- Se mantuvo el criterio de seguridad proporcional al MVP, sin introducir endurecimiento innecesario.

### Prompt 2.D.52: Documentar hallazgos y riesgos de seguridad

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Documenta los resultados de la evaluación de seguridad de TK-00.6.
Registra los hallazgos B-1 y B-2 y los riesgos identificados, respetando las conclusiones de la evaluación.
Al documentarlos:
- Diferencia claramente hallazgos, riesgos aceptados y mejoras diferidas.
- Explica el impacto y las limitaciones de cada elemento.
- Mantén la trazabilidad de los elementos que requieren seguimiento.
- No presentes como corregido ningún hallazgo que solo haya sido documentado.
- No conviertas mejoras exclusivas de producción en requisitos del MVP.
- No alteres decisiones técnicas previamente aprobadas.
Modifica únicamente los documentos necesarios para dejar constancia de estos resultados y los seguimientos correspondientes que estén expresamente autorizados.
No modifiques código, Docker Compose ni configuraciones técnicas. No cierres TK-00.6, no hagas commits ni push.
Al finalizar, presenta los archivos modificados, el diff y el estado de Git. Detente y espera revisión.
```

**Qué salió:**
- B-1 y B-2 quedaron documentados.
- Se registraron cinco riesgos para seguimiento.
- No se introdujeron cambios de código ni de infraestructura.
- La documentación quedó disponible para la preparación del paso 9.

### Prompt 2.D.53: Preparar el cierre técnico de TK-00.6

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Continúa con el paso 9 de TK-00.6: preparar el cierre técnico y administrativo del ticket.
Utiliza el coordinador principal existente, respetando las responsabilidades definidas en CLAUDE.md. 
Revisa:
1. Resultado de Gate 2 y su aprobación humana.
2. Estado de los criterios del DoD, incluida la excepción aprobada exclusivamente para TK-00.6.
3. Evidencias de implementación y QA.
4. Hallazgos B-1 y B-2.
5. Riesgos y limitaciones registrados.
6. Seguimientos diferidos a tickets posteriores.
7. Estado de los commits y de la rama.
Determina qué acciones son necesarias para cerrar correctamente el ticket y cuáles requieren autorización humana independiente.
No confundas la aprobación de Gate 2 con la autorización para realizar commits, push, limpieza o cierre definitivo.
No modifiques archivos, no cambies estados, no hagas commits ni push y no elimines evidencias.
Presenta un plan de cierre ordenado, indicando los archivos que deberían modificarse y las verificaciones necesarias. Detente y espera autorización.
```

**Qué salió:**
- Se preparó el plan de cierre utilizando el coordinador principal.
- Se mantuvo la separación entre aprobación de Gate 2, commits, publicación y cierre.
- Se identificaron los seguimientos pendientes y las acciones que requerían autorizaciones independientes.
- No se ejecutó automáticamente el cierre.

### Prompt 2.D.54: Crear el commit de implementación de TK-00.6

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
haz commit y push de los cambios
```

**Qué salió:**
- Commit creado: 25915f5765adf13ddcc007ef10da613aa11344fc.
- 17 archivos modificados.
- 646 inserciones y 24 eliminaciones.
- Árbol de trabajo limpio.
- TK-00.6 todavía no se había marcado como Hecho.

### Prompt 2.D.55: Registrar el cierre de TK-00.6 en el tracker

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Ejecuta exclusivamente el cierre administrativo de TK-00.6 en backlog/TRACKER.md.
La autorización comprende únicamente:
- Cambiar el estado de TK-00.6 a Hecho.
luego haz commit y push de los cambios
```

**Qué salió:**
- Commit de cierre: bf501d300715069abda901192f72416773d1f5d7.
- Únicamente se modificó la fila de TK-00.6.
- El estado quedó en Hecho.

### Prompt 2.D.56: Validar TK-00.6 desde un clon limpio

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Realiza una validación independiente de TK-00.6 desde un clon limpio del repositorio publicado.
Utiliza la rama feature/entrega-2 y comprueba que el clon incluya los commits publicados de TK-00.6.
Ejecuta el entorno de entrega mediante:
docker compose -f docker-compose.delivery.yml up -d --build --wait
Verifica:
1. Estado de salud de PostgreSQL, backend y Nginx.
2. Existencia de la base medsupply.
3. Privilegios del usuario de aplicación:
   - No debe ser superusuario.
   - No debe poder crear roles.
   - No debe poder crear bases de datos.
4. Respuesta HTTP 200 de /.
5. Respuesta HTTP 200 de /dashboard.
6. Respuesta HTTP 200 de /api/v1/health a través del proxy Nginx.
7. Exposición de puertos: solo Nginx debe estar publicado en 127.0.0.1:8080.
8. El backend no debe quedar accesible directamente desde el host.
Registra las limitaciones observadas:
- migrate y seed siguen siendo provisionales.
- C2 y RNF-05 permanecen pendientes de D18.
- No declares cumplidos requisitos que todavía no estén implementados.
Conserva las evidencias hasta completar la revisión.
No modifiques archivos del repositorio ni cambies el tracker. No realices limpieza de recursos todavía.
Presenta los resultados, comandos ejecutados, códigos de salida, evidencias y limitaciones. Detente.
```

**Qué salió:**
Validación satisfactoria
- docker compose ... up -d --build --wait: código de salida 0.
- PostgreSQL, backend y Nginx quedaron saludables.
- PostgreSQL aceptó conexiones y la base medsupply existía.
- Usuario medsupplyapp: sin privilegios de superusuario, creación de roles ni creación de bases (f | f | f).
- /: HTTP 200.
- /dashboard: HTTP 200.
- /api/v1/health: HTTP 200, respuesta {"status":"ok"}.
- Solo Nginx expuso 127.0.0.1:8080.
- Backend en puerto 3000 no accesible directamente desde el host.
Limitaciones documentadas:
- migrate y seed imprimieron PROVISIONAL: y no ejecutaron migraciones ni carga de datos.
- C2 y RNF-05 no quedaron cumplidos.
- D18 y las dependencias TK-00.3/TK-00.4 continuaron pendientes.

### Prompt 2.D.57: Limpiar los recursos temporales de QA y entrega

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Realiza la limpieza de los recursos temporales utilizados para la validación de TK-00.6.
Limita las operaciones exclusivamente a los recursos identificados como pertenecientes a la prueba de entrega de MedSupply AI.
Puedes eliminar:
- Contenedores del proyecto de entrega.
- Volumen medsupply-delivery_pgdata.
- Red Docker del proyecto de entrega.
- Clon temporal utilizado para QA y sus logs.
- Scratchpads:
  - tk006-qa-oxCn
  - tk006-qa2-Jm9f
  - qa-00.6
  - arch-proposal
- Imágenes temporales:
  - medsupply-backend:tk006
  - medsupply-frontend:tk006
Conserva expresamente:
- Los cinco contenedores ajenos pertenecientes a flowsync-ai4devs.
- Las imágenes medsupply-backend:delivery y medsupply-frontend:delivery, regeneradas durante la prueba.
Antes de eliminar cualquier recurso:
- Comprueba su pertenencia al proyecto.
- No utilices comandos globales como docker system prune.
- No elimines recursos cuyo origen no puedas confirmar.
Después:
- Verifica que los recursos temporales autorizados hayan sido eliminados.
- Confirma que los cinco contenedores ajenos continúen intactos.
- Confirma que las dos imágenes de entrega se hayan conservado.
- Comprueba que el repositorio permanezca sincronizado con origin y con el árbol limpio.
No modifiques archivos ni commits. No alteres el tracker.
Entrega un informe de recursos eliminados y conservados. Detente.
```

**Qué salió:**
- Se eliminaron los contenedores, volumen y red del proyecto medsupply-delivery.
- Se eliminó el clon temporal y sus logs.
- Se eliminaron los cuatro scratchpads indicados.
- Se eliminaron las imágenes temporales medsupply-backend:tk006 y medsupply-frontend:tk006.
- Se conservaron las imágenes medsupply-backend:delivery y medsupply-frontend:delivery.
- Los cinco contenedores de flowsync-ai4devs permanecieron intactos.
- El repositorio quedó sincronizado con origin/feature/entrega-2, árbol limpio y TK-00.6 en Hecho.

### Prompt 2.D.58: Recuperar el contexto del ticket

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Necesito trabajar en el ticket TK-00.3: [DB] Esquema Prisma y migración inicial.
Consulta el tracker y la documentación existente para recuperar la definición actual del ticket.
Por ahora, limítate a identificar y presentar:
- Descripción del ticket.
- Objetivo.
- Alcance.
- Criterios de aceptación.
- Dependencias registradas.
- Restricciones conocidas.
No evalúes todavía su elegibilidad, no propongas soluciones técnicas y no modifiques archivos ni estados.
Quiero revisar primero que estemos trabajando con la definición correcta del ticket. Detente al terminar.
```

**Qué salió:**
Se recuperó la definición de TK-00.3 y su alcance registrado. El trabajo quedó centrado en el esquema de datos y la migración inicial con Prisma, sin comenzar todavía el análisis de viabilidad ni asumir decisiones de implementación.

### Prompt 2.D.59: Evaluar la elegibilidad técnica

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
A partir de la definición recuperada de TK-00.3, analiza si el ticket está en condiciones de avanzar.
Evalúa exclusivamente su viabilidad técnica, considerando la arquitectura actual, PostgreSQL, Prisma, las dependencias y el alcance del MVP.
Identifica cualquier condición que deba resolverse antes de especificar o implementar.
No modifiques archivos ni cambies el estado del ticket. Presenta una recomendación de elegibilidad y detente.
```

**Qué salió:**
TK-00.3 fue clasificado como elegible con condiciones. Prisma y PostgreSQL resultaron viables, pero era necesario resolver decisiones sobre migraciones, integridad de datos, pruebas, seguridad y responsabilidades antes de implementar.

### Prompt 2.D.60: Comprobar la compatibilidad de Prisma

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Evalúa la compatibilidad de Prisma con la versión de Node.js, PostgreSQL y la arquitectura backend definidas para MedSupply AI.
Revisa la configuración requerida por Prisma 7, sus paquetes, el cliente generado y el uso de PostgreSQL.
Identifica incompatibilidades, dependencias adicionales y riesgos de configuración.
No instales paquetes ni modifiques archivos. Entrega únicamente el análisis técnico.
```

**Qué salió:**
Se confirmó la viabilidad de Prisma 7. Se definió trabajar con las versiones exactas 7.10.1 de prisma, @prisma/client y @prisma/adapter-pg, junto con una versión compatible de pg.

### Prompt 2.D.61: Analizar la estrategia de conexión y roles

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Analiza cómo debe gestionar Prisma las conexiones a PostgreSQL en este MVP.
Evalúa si necesitamos separar los roles de migración y ejecución, considerando la simplicidad del entorno académico y los riesgos reales.
Presenta las alternativas, sus implicaciones y una recomendación proporcional al proyecto.
No implementes ni modifiques permisos de base de datos.
```

**Qué salió:** Se acordó utilizar un único rol propietario para migrar y ejecutar la aplicación. Se aceptó expresamente esta limitación para el MVP, acompañada de restricciones sobre el uso de consultas SQL inseguras.

### Prompt 2.D.62: Definir los requisitos del esquema de datos

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Analiza las entidades que necesita el dominio de MedSupply AI para soportar el catálogo de productos médicos, los clientes, los usuarios y el flujo de pedidos.
Identifica las relaciones, atributos, tipos de datos, restricciones e índices que deben formar parte del esquema inicial.
Contrasta las necesidades del negocio con el alcance de TK-00.3. No agregues entidades de funcionalidades que pertenecen a otros tickets.
Entrega una propuesta conceptual, sin crear archivos Prisma ni SQL.
```

**Qué salió:** Se delimitó el esquema inicial a seis tablas: User, Customer, Product, Order y OrderItem, además del enum OrderStatus. No se incorporaron entidades de reclamaciones ni órdenes de compra, porque no correspondían al alcance aprobado.

### Prompt 2.D.63: Analizar las restricciones de integridad

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa las reglas de integridad que deben garantizarse directamente en PostgreSQL para el esquema de TK-00.3.
Considera stock, cantidades, precios, totales, teléfonos, claves foráneas y relaciones entre pedidos y sus detalles.
Distingue las reglas que deben quedar en la base de datos de las que corresponden a validaciones de aplicación.
No escribas migraciones ni modifiques el esquema. Presenta las restricciones necesarias y sus justificaciones.
```

**Qué salió:** Se identificaron siete restricciones CHECK que debían verificarse en PostgreSQL. También se definieron las reglas de integridad referencial y los índices requeridos por la especificación.

### Prompt 2.D.64: Resolver la numeración de pedidos

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Analiza cómo generar identificadores visibles para los pedidos del sistema.
El formato requerido es MED- seguido de al menos cinco dígitos, sin un máximo de longitud establecido.
Evalúa una estrategia compatible con PostgreSQL que evite colisiones y no dependa de calcular el siguiente número mediante consultas sobre los pedidos existentes.
No implementes la función ni modifiques archivos. Presenta una recomendación técnica.
```

**Qué salió:** Se acordó utilizar una secuencia de PostgreSQL y una función next_order_number() para generar el formato MED-00001, manteniendo la posibilidad de superar los cinco dígitos sin un límite máximo.

### Prompt 2.D.65: Definir la estrategia de migraciones

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Analiza cómo debe gestionarse la migración inicial de TK-00.3.
Compara las alternativas de Prisma para generar y aplicar migraciones, considerando que el proyecto debe poder levantarse de manera reproducible desde un clon limpio.
Define qué debe ejecutarse en desarrollo, qué debe ejecutarse en el entorno de entrega y qué prácticas deben evitarse.
No ejecutes comandos ni generes archivos. Entrega la estrategia recomendada.
```

**Qué salió:** Se acordó utilizar migraciones versionadas de Prisma y evitar mecanismos que sincronicen directamente el esquema sin historial. La migración debía poder aplicarse de manera reproducible, sin depender de una base de datos sombra.

### Prompt 2.D.66: Definir la estrategia de pruebas de base de datos

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Diseña una estrategia mínima de pruebas para verificar el esquema y la migración inicial.
Considera PostgreSQL real, las restricciones CHECK, las claves foráneas, la secuencia de pedidos y la integridad de los datos.
Define cómo aislar la base de pruebas y proteger cualquier otra base existente.
No implementes pruebas todavía. Prioriza un arnés sencillo y reproducible para el MVP.
```

**Qué salió:** Se acordó crear un arnés mínimo en tests/db/, con los scripts test:db y db:migrate:test. Se estableció que la URL de pruebas debía derivarse de DATABASE_URL y que el nombre real de la base debía verificarse antes de cualquier operación destructiva.

### Prompt 2.D.67: Evaluar los riesgos de seguridad

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa los riesgos de seguridad asociados a la implementación de TK-00.3.
Concéntrate en las operaciones de migración, las credenciales, la conexión a PostgreSQL, el uso de consultas SQL, los mensajes de error y la protección de la base de pruebas.
Distingue riesgos reales del MVP de medidas de endurecimiento propias de producción que no aporten valor suficiente.
No modifiques archivos ni implementes controles. Entrega los hallazgos y recomendaciones.
```

**Qué salió:** Se identificaron controles necesarios para evitar operaciones destructivas sobre bases equivocadas, limitar consultas SQL inseguras y prevenir la exposición de credenciales. Se acordó prohibir $queryRawUnsafe y $executeRawUnsafe en el alcance de este ticket.

### Prompt 2.D.68: Consolidar las decisiones técnicas

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Consolida las decisiones técnicas analizadas para TK-00.3.
Prepara una lista numerada de decisiones que incluya:
- Versiones y paquetes Prisma.
- Estrategia de conexión y roles.
- Generación del cliente.
- Estrategia de migraciones.
- Pruebas de base de datos.
- Restricciones de integridad.
- Numeración de pedidos.
- Manejo de fechas.
- CI y alcance de las excepciones.
- Dependencias y responsabilidades de los agentes.
Para cada decisión, presenta la recomendación y sus consecuencias.
No implementes ni actualices la especificación. Necesito revisar las decisiones antes de aprobarlas.
```

**Qué salió:** Se consolidaron las decisiones técnicas que luego fueron aprobadas por el usuario. Entre ellas quedaron las versiones exactas de Prisma, el rol único, el target independiente de migraciones, las pruebas PostgreSQL, las siete restricciones CHECK y la estrategia de numeración.

### Prompt 2.D.69: Aprobar las condiciones de elegibilidad

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Actualiza el análisis de TK-00.3 incorporando las decisiones técnicas que acabo de aprobar.
Comprueba que no existan contradicciones entre el alcance, las dependencias, las restricciones y las decisiones.
Registra el resultado de la evaluación de Puerta 1 y la estimación acordada.
No inicies implementación, no crees commits y no avances a la siguiente puerta sin autorización.
```

**Qué salió:** Se aprobó la Puerta 1. TK-00.3 quedó elegible para avanzar, con las once decisiones técnicas confirmadas y una estimación ajustada de tres a cinco puntos.

**Especificación y planificación**

### Prompt 2.D.70: Preparar la especificación técnica

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Preara la especificación técnica de TK-00.3 utilizando las decisiones aprobadas y los requisitos vigentes.
La especificación debe describir el esquema de datos, las relaciones, los tipos, las restricciones, la migración inicial, la generación del cliente y las pruebas requeridas.
No agregues decisiones nuevas ni amplíes el alcance del ticket.
Mantén la especificación enfocada en lo necesario para el MVP y deja explícitas las condiciones y limitaciones aprobadas.
```

**Qué salió:** Se preparó la especificación técnica del ticket, incluyendo el esquema inicial, la migración, la estrategia de pruebas y las restricciones acordadas.

### Prompt 2.D.71: Revisar la consistencia de la especificación

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa la especificación de TK-00.3 contra los requisitos originales y las once decisiones aprobadas.
Busca contradicciones, omisiones, criterios ambiguos y requisitos que no tengan una forma verificable de validación.
No implementes ni amplíes el alcance. Presenta los problemas encontrados y las correcciones necesarias.
```

**Qué salió:** La revisión permitió ajustar la especificación y consolidarla como versión 1.1. Se mantuvieron fuera del alcance las funcionalidades que correspondían a tickets posteriores.

### Prompt 2.D.72: Definir las responsabilidades de implementación

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Prepara la distribución de responsabilidades para implementar TK-00.3.
Considera los agentes especialistas existentes:
- database-engineer para Prisma, esquema, migraciones y pruebas de base de datos.
- infrastructure-engineer para Docker, Compose y documentación de ejecución.
- qa-bdd-analyst para la validación funcional y técnica.
- security-engineer para la revisión de riesgos y controles.
Define qué entregable corresponde a cada agente, sus dependencias y el orden de ejecución.
El coordinador debe conservar la responsabilidad de dirigir el flujo, integrar resultados y actualizar el estado de las tareas.

No crees agentes nuevos ni delegues todavía.
```

**Qué salió:** Se definió database-engineer como responsable principal de la implementación de base de datos. infrastructure-engineer quedó encargado de los cambios de infraestructura en una fase posterior y en serie. QA y Seguridad fueron definidos como revisores obligatorios.

### Prompt 2.D.73: Preparar el plan de ejecución

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code
```
Construye un plan de ejecución para TK-00.3 a partir de la especificación aprobada.
Divide el trabajo en pasos pequeños y verificables, contemplando:
1. Preparación del entorno.
2. Pruebas iniciales de base de datos.
3. Implementación del esquema y migración.
4. Configuración de infraestructura necesaria.
5. Validación de QA.
6. Revisión de seguridad.
7. Correcciones y validación final.
Identifica dependencias y criterios para avanzar entre etapas.
No ejecutes tareas ni cambies estados. Presenta el plan para autorización.
```

**Qué salió:** Se estableció una ejecución secuencial con preparación y pruebas antes de la implementación, seguida de infraestructura, QA, seguridad y correcciones. Se mantuvo la separación entre autorización de implementación y futuras autorizaciones de cierre.

### Prompt 2.D.74: Autorizar el inicio de implementación

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa el plan de ejecución aprobado para TK-00.3 y prepara el inicio de la fase de implementación.
Confirma que el alcance se limita a la especificación 01 v1.1 y a las decisiones aprobadas.
El primer paso debe ser preparar y validar el entorno de pruebas, sin implementar todavía el esquema definitivo.
No realices commits, push, cambios de estado de cierre ni avances de Gate 2.
```

**Qué salió:** Se dio paso a la implementación bajo el alcance aprobado. La primera fase quedó limitada a la preparación del entorno y la validación de la estrategia de pruebas.

**Implementación y pruebas**

### Prompt 2.D.75: Preparar el entorno de pruebas

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Delega al database-engineer la preparación del entorno de pruebas de TK-00.3.
Antes de implementar el esquema, debe comprobar:
- Versiones de Node.js, Prisma y PostgreSQL.
- Conectividad con PostgreSQL.
- Configuración de la URL de pruebas.
- Protección frente a operaciones sobre bases distintas de la base autorizada.
- Funcionamiento de los scripts previstos para las pruebas.
Debe utilizar el entorno existente y evitar modificar bases de datos ajenas al ticket.
Entrega evidencias de las comprobaciones. No implementes todavía el esquema definitivo.
```

**Qué salió:** Se validó la compatibilidad del entorno y la configuración necesaria para ejecutar las pruebas de base de datos. La preparación permitió avanzar a la fase de pruebas iniciales.

### Prompt 2.D.76: Ejecutar las pruebas iniciales en rojo

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Solicita al database-engineer implementar y ejecutar el conjunto inicial de pruebas de TK-00.3 antes de completar el esquema.
Las pruebas deben cubrir las reglas de integridad, restricciones CHECK, relaciones, secuencia de pedidos y comportamiento esperado de la migración.
Aplica el enfoque TDD: primero comprueba qué escenarios fallan porque la funcionalidad aún no está implementada y cuáles ya pasan.
No relajes las expectativas de las pruebas para obtener un resultado verde. Presenta el resumen de ejecución y detente.
```

**Qué salió:** Se prepararon 70 casos de prueba de base de datos. En la ejecución inicial, 41 fallaron como se esperaba por la ausencia de la implementación correspondiente y 29 pasaron. La suite general existente se mantuvo verde con 72 de 72 pruebas.

### Prompt 2.D.77: Revisar el resultado de las pruebas iniciales

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Analiza los resultados de la ejecución inicial de las pruebas de TK-00.3.
Verifica que los fallos correspondan a funcionalidades todavía no implementadas y que no existan errores ajenos al comportamiento esperado.
Comprueba también que los controles de seguridad de la base de pruebas impidan operar sobre una base no autorizada.
No implementes el esquema todavía. Informa si la suite está en condiciones de servir como referencia para el desarrollo.
```

**Qué salió:** Se confirmó que los fallos iniciales correspondían a la ausencia de la funcionalidad que debía construirse. El guard de seguridad de la base de pruebas fue revisado y se mantuvo como condición para continuar.

### Prompt 2.D.78: Implementar el esquema Prisma

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Delega al database-engineer la implementación del esquema Prisma de TK-00.3, siguiendo exclusivamente la especificación 01 v1.1.
Implementa los modelos, enum, relaciones, índices, tipos y restricciones acordados.
Respeta las versiones de dependencias aprobadas y las convenciones de nombres establecidas.
No agregues entidades fuera del alcance, no modifiques decisiones aprobadas y no intervengas en Docker ni en infraestructura.
Ejecuta las validaciones propias de Prisma y entrega un resumen de archivos modificados y resultados.
```

**Qué salió:** Se implementó el esquema Prisma con los seis modelos/estructuras acordados, sus relaciones, índices y tipos. El cliente generado quedó configurado en src/generated/prisma, sin versionar los artefactos generados.

### Prompt 2.D.79: Implementar la migración inicial

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Cotinúa con la migración inicial de TK-00.3.
Implementa la migración PostgreSQL a partir del esquema aprobado, incluyendo:
- Creación de tablas, relaciones e índices.
- Las siete restricciones CHECK.
- La secuencia y función de numeración de pedidos.
- La configuración de precisión y tipos temporales.
- La aplicación transaccional de la migración.
No utilices una base de datos sombra ni ejecutes operaciones destructivas sobre bases ajenas a las autorizadas.
Valida el SQL generado y presenta evidencias de la migración.
```

**Qué salió:** Se creó la migración inicial 20261120000000_init. Incluyó la secuencia order_number_seq, la función next_order_number() y las restricciones aprobadas. La migración fue construida sin utilizar una base de datos sombra.

### Prompt 2.D.80: Implementar el guard de pruebas de migración

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa e implementa el mecanismo de protección del script db:migrate:test.
El script debe validar que la conexión apunte exclusivamente a la base de pruebas autorizada, derivada de DATABASE_URL.
Debe rechazar URLs inválidas o nombres de bases no permitidos antes de ejecutar cualquier operación de migración.
No debe revelar credenciales en los mensajes de error.
Implementa las comprobaciones necesarias y prueba tanto los casos permitidos como los rechazados.
```

**Qué salió:** Se implementó el guard para proteger la ejecución de migraciones de prueba. La validación comprobó que las operaciones solo pudieran dirigirse a la base autorizada y que las URLs maliciosas o incorrectas fueran rechazadas.

### Prompt 2.D.81: Validar la implementación de base de datos

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Ejecuta la suite de pruebas de base de datos contra PostgreSQL real después de implementar el esquema y la migración.
Verifica los 70 casos previstos, las restricciones CHECK, las relaciones, la secuencia de pedidos y la aplicación de la migración.
Ejecuta también la suite general del backend para detectar regresiones.
Entrega los comandos ejecutados, resultados y cualquier fallo encontrado. No declares el ticket terminado.
```

**Qué salió:** Las 70 pruebas de base de datos pasaron y la suite general del backend obtuvo 72 de 72 pruebas exitosas. La implementación de base de datos quedó validada localmente.

### Prompt 2.D.82: Revisar dependencias y vulnerabilidades conocidas

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Analiza los resultados de auditoría de dependencias generados durante la implementación de TK-00.3.
Distingue vulnerabilidades de dependencias de desarrollo y producción, identifica su origen y evalúa su impacto en el MVP.
No ejecutes npm audit fix ni actualices dependencias automáticamente.
Si existen avisos moderados conocidos, documenta su alcance y recomienda si pueden aceptarse. Si aparecen avisos high o critical, detén el avance y solicita revisión.
```

**Qué salió:** Se identificaron 18 avisos moderados asociados a dependencias de desarrollo, principalmente en la cadena de Jest mediante glob y minimatch. No se encontraron avisos high o critical y no había avisos al excluir dependencias de desarrollo. Se aceptaron y documentaron los avisos moderados, sin aplicar actualizaciones automáticas.

**Infraestructura y reproducibilidad**

### Prompt 2.D.83: Analizar los cambios de infraestructura necesarios

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Solicita al coordinador evaluar qué cambios de infraestructura son necesarios para ejecutar TK-00.3 de forma reproducible.
Considera el Dockerfile del backend, el cliente Prisma generado, las migraciones y la ejecución de la aplicación.
Define qué debe construirse en la imagen de migraciones y qué debe estar disponible en la imagen final del backend.
No modifiques archivos todavía. Presenta una propuesta mínima que respete la arquitectura del MVP.
```

**Qué salió:** Se determinó que la migración debía ejecutarse en un target independiente, derivado del proceso de build, mientras que la imagen final del backend no debía incluir la CLI ni el motor de Prisma.

### Prompt 2.D.84: Implementar los cambios de Docker

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Delega al infrastructure-engineer la implementación de los cambios de infraestructura aprobados para TK-00.3.
Debe actualizar el Dockerfile del backend, los archivos de exclusión y la configuración Compose de entrega para:
- Generar el cliente Prisma durante el build.
- Disponer de un target independiente para ejecutar migraciones.
- Mantener el runtime del backend separado de las herramientas de migración.
- Ejecutar los procesos con el usuario no privilegiado previsto.
- No introducir secretos en las imágenes ni publicar puertos innecesarios.
No modifiques el esquema Prisma ni amplíes la infraestructura más allá de lo aprobado.
Enrega los cambios y sus validaciones. Detente antes de commits o push.
```

**Qué salió:** Se implementaron las etapas build, migrate y runtime en el Dockerfile, el .dockerignore y docker-compose.delivery.yml. La imagen final del backend quedó separada de la CLI y del motor de migraciones. Se incorporó además una protección de build para evitar imágenes sin migraciones.

### Prompt 2.D.85: Revisar la separación entre migración y runtime

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa los cambios de infraestructura realizados para TK-00.3.
Comprueba que:
- El target migrate contiene las herramientas necesarias.
- El runtime del backend no incluye la CLI ni el motor de migraciones.
- El backend no ejecuta migraciones automáticamente al arrancar.
- Los procesos utilizan el usuario esperado.
- No se incorporan credenciales a las imágenes.
- La configuración Compose mantiene los límites de exposición previstos.
No modifiques archivos. Informa los incumplimientos encontrados.
```

**Qué salió:** La revisión confirmó la separación entre la imagen de migraciones y el runtime. El backend no ejecutaba migraciones al arrancar, se ejecutaba como usuario node y no incorporaba credenciales en sus variables de entorno de imagen.

### Prompt 2.D.86: Validar la ejecución del entorno de entrega

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Ejecuta una validación del entorno de entrega de TK-00.3 utilizando Docker Compose.
Comprueba que las imágenes puedan construirse, que las migraciones se apliquen y que el backend pueda iniciar correctamente.
Verifica los servicios, sus estados de salud y los endpoints de comprobación disponibles.
No realices limpieza global de Docker ni elimines recursos ajenos al proyecto.
Entrega las evidencias de ejecución y cualquier limitación encontrada.
```

**Qué salió:** La validación de entrega confirmó que los servicios podían construirse y arrancar correctamente. La migración inicial se aplicó y los servicios de base de datos, backend y Nginx alcanzaron estado saludable. El endpoint / respondió 200 y /api/v1/health devolvió {"status":"ok"}.

**QA y revisión de seguridad**

### Prompt 2.D.87: Solicitar revisión funcional y técnica de QA

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Delega al qa-bdd-analyst la revisión de TK-00.3 contra la especificación 01 v1.1 y sus criterios de aceptación.
Debe revisar:
- Modelos y relaciones.
- Restricciones de integridad.
- Migración inicial.
- Pruebas PostgreSQL.
- Configuración de ejecución.
- Docker y Compose.
- Reproducibilidad del entorno.
Distingue defectos reales, observaciones y elementos que pertenecen a otros tickets.
No modifiques archivos ni cierres hallazgos sin evidencia. Entrega un informe priorizado.
```

**Qué salió:** QA realizó una primera revisión y detectó observaciones que requerían corrección o aclaración, entre ellas aspectos de la protección del build, configuración de infraestructura y validaciones de comportamiento.

### Prompt 2.D.88: Corregir los hallazgos de QA

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Analiza los hallazgos de la primera revisión de QA para TK-00.3.
Clasifica cada observación según su severidad y relación con la especificación.
Delega las correcciones a los agentes responsables, respetando la separación entre base de datos e infraestructura.
No cambies los criterios de aceptación para hacer desaparecer fallos. No amplíes el alcance del ticket.
Al terminar, presenta cada hallazgo con su corrección y evidencia de validación.
```

**Qué salió:** Se atendieron las correcciones identificadas como M-1, B-1, B-2, B-3, N-1 y N-2. La observación N-3 fue aceptada como una limitación no bloqueante y quedó documentada.

### Prompt 2.D.89: Ejecutar segunda ronda de QA

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Solicita al qa-bdd-analyst una segunda revisión de TK-00.3 después de las correcciones.
Debe verificar específicamente que los hallazgos de la primera ronda hayan quedado resueltos y repetir las pruebas necesarias sobre la implementación.
No debe limitarse a aceptar las declaraciones de los agentes: necesita evidencia de los resultados.
Clasifica el resultado como aprobado, aprobado con observaciones o bloqueado. Detente al entregar el informe.
```

**Qué salió:** QA completó la segunda ronda y aprobó la implementación. Las correcciones se verificaron y N-3 permaneció como observación aceptada, sin bloquear el avance.

### Prompt 2.D.90: Solicitar auditoría de seguridad

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Delega al security-engineer la auditoría de seguridad de TK-00.3.
Revisa específicamente:
- Protección de la base de pruebas.
- Validación de DATABASE_URL.
- Exposición de credenciales en errores y logs.
- Uso de consultas SQL inseguras.
- Permisos y ejecución de migraciones.
- Separación entre imágenes migrate y runtime.
- Dependencias con vulnerabilidades conocidas.
Distingue hallazgos bloqueantes de observaciones informativas. No modifiques archivos ni declares aprobado el ticket sin evidencias.
```

**Qué salió:** La auditoría no encontró hallazgos bloqueantes en la implementación revisada. Se verificó el guard de seguridad de la base de pruebas y se mantuvieron documentados los avisos moderados de dependencias.

### Prompt 2.D.91: Revisar el hallazgo L-1 de seguridad

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Analiza el hallazgo L-1 reportado por Seguridad en el script db:migrate:test.
El problema señalado es que un error al construir una URL mediante new URL() podría incluir credenciales en el mensaje de error.
Revisa el comportamiento real del script y determina cómo evitar la exposición de datos sensibles sin alterar innecesariamente el tratamiento de errores de Prisma.
No cambies otros componentes ni amplíes el alcance.
```

**Qué salió:** Se confirmó el riesgo de exposición de credenciales cuando la URL era malformada. Se definió corregirlo con manejo controlado de errores y mensajes fijos que no reprodujeran la URL original.

### Prompt 2.D.92: Corregir la exposición potencial de credenciales

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Delega al responsable de base de datos la corrección del hallazgo L-1.
El scipt db:migrate:test debe manejar de forma segura los errores de construcción y validación de DATABASE_URL.
Ante una URL ausente o inválida debe emitir un mensaje fijo, sin incluir usuario, contraseña ni URL original.
Conserva el código de salida de Prisma cuando la URL sea válida y el fallo provenga de la ejecución de Prisma.
Implementa únicamente esta corrección y presenta las pruebas realizadas.
```

**Qué salió:** El script quedó protegido mediante un try/catch que cubre la construcción y validación de la URL. El mensaje de error pasó a ser db:migrate:test: DATABASE_URL ausente o inválida, sin reproducir credenciales.

### Prompt 2.D.93: Verificar la corrección de seguridad

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Solicita al security-engineer verificar específicamente la corrección de L-1.
Debe probar URLs inválidas, puertos no numéricos, URLs vacías y casos con credenciales falsas.
Comprueba que ningún mensaje o salida de error exponga usuario, contraseña o la URL completa.
Verifica también que un error de conexión de Prisma conserve su código de salida original.
No realices nuevas modificaciones durante esta revisión. Entrega evidencias y una conclusión puntual sobre L-1.
```

**Qué salió:** Seguridad confirmó que L-1 quedó resuelto. Las pruebas no encontraron credenciales ni cadenas postgres:// en los errores examinados. También se comprobó que un error de conexión de Prisma conservaba su código de salida.

### Prompt 2.D.94: Consolidar el resultado de QA y Seguridad

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Consolida los resultados de QA y Seguridad de TK-00.3.

Verifica que cada hallazgo tenga un estado respaldado por evidencia y que no queden observaciones bloqueantes sin resolver.

Distingue expresamente:
- Hallazgos corregidos.
- Observaciones aceptadas.
- Limitaciones documentadas.
- Trabajo diferido a otros tickets.
No cambies el estado del ticket ni solicites todavía el cierre. Presenta el informe consolidado.
```

**Qué salió:** Se consolidó la revisión: QA aprobó la segunda ronda, Seguridad no mantuvo hallazgos bloqueantes y L-1 quedó resuelto. N-3 y los 18 avisos moderados de dependencias permanecieron documentados como aceptaciones. La parte de seed quedó expresamente pendiente de TK-00.4.

**Validación final y cierre**

### Prompt 2.D.95: Verificar la trazabilidad del alcance

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa la trazabilidad final de TK-00.3 contra la especificación 01 v1.1, los criterios de aceptación y las decisiones aprobadas.
Comprueba que cada requisito tenga evidencia de implementación o validación.
Identifica qué aspectos se resolvieron dentro del ticket y cuáles fueron reasignados o diferidos a tickets posteriores.
No marques como cumplido ningún criterio que tenga una excepción aprobada. No modifiques archivos.
```

**Qué salió:** Se verificó la trazabilidad del alcance. Se retiraron del seguimiento de TK-00.3 los puntos D01–D06 y D08–D10 que ya estaban validados. Se conservaron los pendientes y diferidos que correspondían a otros tickets.

### Prompt 2.D.96: Verificar la excepción de CI y los pendientes

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Revisa los criterios de aceptación de TK-00.3 relacionados con CI y los pendientes que deben continuar en otros tickets.
omprueba que la excepción local de CI quede registrada como excepción aprobada y no como cumplimiento del criterio.
Verifica que la responsabilidad de CI esté asignada al ticket correspondiente y que los pendientes de seed y otros seguimientos no se declaren resueltos prematuramente.
No modifiques la matriz histórica de QA ni cierres otros tickets.
```

**Qué salió:** La excepción de CI de TK-00.3 se mantuvo documentada como excepción aprobada. El cumplimiento de CI quedó asignado a TK-00.7. La validación del seed se mantuvo provisional y diferida a TK-00.4.

### Prompt 2.D.97: Preparar la validación desde un clon limpio

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Prepara una validación de reproducibilidad de TK-00.3 desde un clon limpio del repositorio.
El objetivo es demostrar que el evaluador puede obtener el código, configurar el entorno, construir las imágenes, aplicar las migraciones y levantar los servicios.
Define los pasos y las comprobaciones que se deben realizar.
Utiliza un proyecto Compose aislado y no reutilices ni elimines contenedores, volúmenes o redes de otros proyectos.
No ejecutes limpiezas globales de Docker.
```

**Qué salió:** Se preparó una validación aislada del entorno de entrega, utilizando un nombre de proyecto Compose independiente para evitar interferir con los recursos existentes.

### Prompt 2.D.98: Ejecutar la validación desde el clon limpio

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Ejecuta la validación de TK-00.3 desde el clon limpio y en la rama de entrega.
Comprueba:
- Construcción de las imágenes.
- Aplicación de la migración inicial.
- Estado de salud de PostgreSQL, backend y Nginx.
- Respuesta del endpoint principal.
- Respuesta del endpoint de health.
- Ausencia de credenciales en los logs de migración.
Registra los comandos y resultados reales. No elimines recursos Docker ajenos al proyecto ni declares el cierre sin autorización.
```

**Qué salió:** La validación desde el clon limpio finalizó correctamente. docker compose up -d --build --wait terminó con código 0. La migración 20261120000000_init se aplicó, los servicios quedaron saludables y los endpoints respondieron 200. No se encontraron contraseñas ni URLs PostgreSQL completas en los logs de migración.

### Prompt 2.D.99: Revisar el estado de Git antes del commit

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Prepara la revisión final de los cambios de TK-00.3 antes de crear el commit.
Comprueba exclusivamente los archivos pertenecientes al alcance aprobado del ticket.
Verifica que no se incluyan archivos de entorno, secretos, artefactos generados ni archivos externos al proyecto.
No leas ni inspecciones archivos excluidos de este flujo. No incluyas archivos de evaluación metodológica externos al repositorio de trabajo.
Presenta la lista de archivos que se propone incluir y detente antes del commit.
```

**Qué salió:** Se verificó el conjunto de cambios de TK-00.3. Se prepararon 24 archivos para el commit de implementación, excluyendo .env, backend/src/generated/prisma y PROMPTS.md.

### Prompt 2.D.100: Autorizar y crear el commit de implementación

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Con la revisión de archivos completada, prepara el commit de implementación de TK-00.3.
Incluye únicamente los 24 archivos aprobados y utiliza un mensaje que identifique el ticket y el resultado implementado.
Antes de ejecutar, confirma que el staging contenga exclusivamente esos archivos.
No cambies el estado del ticket, no crees el commit de cierre y no hagas push todavía sin autorización expresa.
```

**Qué salió:** Se creó el commit de implementación 7e9a5a8f34b1…, con el mensaje TK-00.3: esquema Prisma y migración inicial con migrate real en la entrega. Incluyó 24 archivos, con 3103 inserciones y 71 eliminaciones.

### Prompt 2.D.101: Solicitar aprobación humana de Gate 2

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Presenta el expediente de TK-00.3 para la aprobación humana de Gate 2.
Incluye:
- Implementación realizada.
- Evidencias de las 70 pruebas de base de datos y 72 pruebas generales.
- Validación Docker desde clon limpio.
- Resultados de QA y Seguridad.
- Corrección de L-1.
- Excepciones y observaciones aceptadas.
- Pendientes reasignados a TK-00.4 y TK-00.7.
- Hash del commit de implementación.
No cambies el estado del ticket, no hagas push ni crees el commit de cierre hasta recibir mi aprobación explícita.
```

**Qué salió:** Se presentó la evidencia de implementación, pruebas, QA, Seguridad y reproducibilidad. El usuario aprobó Gate 2 el 20-11-2026, habilitando el avance al cierre humano del ticket.

### Prompt 2.D.102: Actualizar el estado del ticket

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Con la aprobación humana de Gate 2 recibida, actualiza el estado de TK-00.3 siguiendo el flujo definido en el tracker.
Registra el paso por Pendiente de aprobación humana y el estado final Hecho, conservando la trazabilidad de la aprobación y el commit de implementación.
No modifiques otros tickets ni elimines observaciones históricas.
Detente después de verificar el cambio en el tracker.
```

**Qué salió:** TK-00.3 pasó de En revisión de seguridad a Pendiente de aprobación humana y finalmente a Hecho, con la aprobación humana registrada.

### Prompt 2.D.103: Preparar el commit de cierre del ticket

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Prepara el commit de cierre de TK-00.3.
El cambio debe limitarse al registro correspondiente del tracker, incluyendo el estado final, la referencia al commit de implementación y la fecha de aprobación humana.
No incluyas cambios de código ni archivos ajenos al cierre.
Presenta el diff limitado al archivo del tracker y espera autorización antes de crear el commit.
```

**Qué salió:** Se preparó un cambio exclusivo en backlog/TRACKER.md, con el estado final Hecho, la referencia al commit de implementación y la aprobación del 20-11-2026.

### Prompt 2.D.104: Crear el commit de cierre

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Con la autorización recibida, crea el commit de cierre de TK-00.3.
Incluye únicamente backlog/TRACKER.md.
Utiliza un mensaje que identifique el ticket, el cambio de estado y la referencia al commit de implementación.
Verifica el hash generado y el estado de la rama después del commit. No hagas push todavía.
```

**Qué salió:** Se creó el commit de cierre a55b7a0857a5…, con el mensaje TK-00.3: cerrar ticket en el tracker (Hecho, commit 7e9a5a8, aprobado 2026-11-20). Solo modificó backlog/TRACKER.md.

### Prompt 2.D.105: Publicar los cambios aprobados

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Publica los commits aprobados de TK-00.3 en origin/feature/entrega-2.
Antes de ejecutar el push, verifica la rama actual y que no existan cambios inesperados.
Después del push, comprueba que la rama local y remota estén sincronizadas y registra el hash final.
No realices operaciones de limpieza ni modifiques otros recursos.
```

**Qué salió:** Se publicó el trabajo en origin/feature/entrega-2. La rama local y remota quedaron sincronizadas en a55b7a0.

### Prompt 2.D.106: Verificar el estado final y la limpieza selectiva

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Realiza una verificación final del estado de TK-00.3 después del push.

Comprueba:
- Rama y commit actual.
- Sincronización con el remoto.
- Estado del tracker.
- Recursos temporales creados exclusivamente para la validación del clon.
- Conservación de los recursos Docker ajenos al proyecto.
Si es necesario limpiar recursos temporales, identifica primero cada contenedor, volumen y red por su proyecto y pertenencia. No utilices prune global ni elimines recursos compartidos o ajenos.

No modifiques archivos de trabajo ni alteres datos existentes.
```

**Qué salió:** Se verificó la sincronización final en a55b7a0. Se retiraron selectivamente los cinco contenedores, el volumen y la red pertenecientes al proyecto aislado de validación, además de los scratchpads temporales. Se conservaron los recursos de otros proyectos y los datos de medsupply-dev.

El estado final de Git quedó con PROMPTS.md como único archivo modificado en el working tree, fuera del alcance y sin incluirlo en los commits.
