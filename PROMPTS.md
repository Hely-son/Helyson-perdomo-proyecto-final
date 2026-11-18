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

## Entrega 2.A — Actualizacion en base a observaciones de entrega 1 

### Prompt 2.A.1: Auditoría integral sin modificaciones

**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Actúa como arquitecto de software senior y revisor de proyectos bajo metodología Spec-Driven Development (SDD).
Necesito preparar MedSupply AI para incorporar las observaciones de una evaluación académica de su primera entrega.
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
Verificar qué partes de la evaluación académica ya están cubiertas y cuáles faltan.

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

# PROMPT 2.A.2 — Actualización del PRD a v1.1: alcance MVP y decisiones aprobadas

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

**Qué salió:**: Genero un nuevo archivo con el contrato del open api, cubre los 14 endpoints MVP y Claude dejó claro qué validaciones ejecutó y cuáles no.



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

**Qué salió:**: Genero una auditoria encontro decisiones y problemas, indica como ajustarlo, lo que recomienda, y queda a la espera de mis descisiones 


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

**Qué salió:**: Genero la version en 1.0.0 y realizo commit y push, indico que claude, readme quedaron desactualizados 

### Prompt 2.A.14: implementar ticket 008
**Modelo:** Opus 1M xHigh
**Herramienta:** Claude Code

```
Corrige CLAUDE.md y README para reflejar openapi.yaml creado
```

**Qué salió:**: ahora todo el sistema esta actualizado, indica hacer commit y push.


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

**Qué salió:**: Indico que el veredicto para esta spec era aprobado, dejo una seccion Puntos abiertos (no bloqueantes)


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

**Qué salió:**: Creo el archivo de inventory, indico, resumen, decisiones, tambien las inconsitencias encontradas, indico caminos para resolverlas.

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

**Qué salió:**: aplico lo solicitado, dio el resumen. pero indica que aun hay decisiones que no estan cerradas.
