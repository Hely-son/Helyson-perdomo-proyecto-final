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
