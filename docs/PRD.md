# PRD — MedSupply AI

| Versión | Estado | Fecha |
|---|---|---|
| 1.2 (MVP Entrega 2) | Aprobado por el responsable del proyecto para elaborar las specs de la Entrega 2 | 2026-11-18 |

Este documento define **qué** hace el producto y **por qué**. El **cómo** (esquemas, API, máquina de estados, pantallas) vive en `specs/` y en el contrato `docs/openapi.yaml`. Todos los requisitos y reglas tienen ID para poder referenciarlos sin copiarlos.

**Fases.** Cada requisito, regla y criterio lleva una fase: `MVP` (se entrega en este ciclo) o `V2` (documentado y diferido, no se implementa en el MVP). Los IDs de la versión 1.0 se conservan y no se reutilizan para otra funcionalidad.

### Historial de cambios

| Versión | Fecha | Cambios |
|---|---|---|
| 1.0 | 2026-09-12 | Versión inicial (Entrega 1). |
| 1.1 | 2026-11-18 | Reducción del MVP según la evaluación de la Entrega 1: clasificación `MVP`/`V2` de requisitos, reglas y criterios; CL-01, CH-09, CH-10, RE, RP, RN-06, RN-07, RN-11, CA-02, CA-08, CA-09 y CA-10 pasan a V2. IN-03, PE-01, CH-03, CH-08 y RN-05 se dividen por fase. RN-04 pasa de "consecutivo" a "único y creciente". Nuevos: CL-03, RN-12, CA-12, CA-13 y RNF-01..09. CA-01 se limita a alertas y CA-06 incluye clientes desactivados. IN-02 incorpora el control de concurrencia del ajuste. |
| 1.2 | 2026-11-18 | Cinco decisiones funcionales: producto desactivado antes de confirmar (RN-02, CH-06, CA-14); cambio de precio entre resumen y confirmación (RN-03, CH-06, CA-15); formato de número de pedido sin límite de dígitos (RN-04); expiración de la sesión de chat (CH-11, CA-16); expiración de la sesión del operador (AU-03, CA-11, RNF-08). Supuesto del carrito actualizado. |

## 1. Problema

Las distribuidoras de insumos médicos atienden a clínicas y farmacias por mensajería. La verificación manual provoca ventas de productos sin stock real, demoras en confirmar pedidos y reposiciones tardías. MedSupply automatiza la validación de stock durante la conversación, ofrece alternativas cuando la cantidad pedida supera las existencias y centraliza los pedidos y las alertas de stock para el operador. La gestión de reclamos y de órdenes de reposición se aborda en V2.

## 2. Usuarios

| Usuario | Descripción | Canal |
|---|---|---|
| **Cliente B2B** | Clínica o farmacia registrada previamente por la distribuidora, identificada por su teléfono. En el MVP los clientes se cargan por seed. | Simulador de chat |
| **Operador** | Empleado de la distribuidora. En el MVP gestiona productos, stock, alertas y pedidos. En V2 también clientes, reclamos y reposición. Rol único. | Dashboard web |

## 3. Objetivos del MVP

1. Un cliente registrado y activo compra por chat varios productos con validación de stock en cada paso, sin intervención del operador.
2. Ningún pedido se confirma con stock insuficiente, ni siquiera con confirmaciones simultáneas: la confirmación es atómica y el stock nunca queda negativo.
3. El cliente consulta por chat el estado de sus pedidos, y solo los propios.
4. El operador gestiona lo básico de la operación desde el dashboard: catálogo de productos, ajuste de stock, consulta de pedidos, avance de estado y cancelación.
5. Todo producto activo con stock igual o menor al mínimo aparece en las alertas del dashboard.

## 4. Alcance

### 4.1 Incluido en el MVP

- Simulador web de chat con identificación del cliente por teléfono.
- Catálogo con carrito, validación de stock y confirmación atómica del pedido.
- Consulta de pedidos propios por chat ("Mis pedidos").
- Acceso autenticado al dashboard.
- Gestión de productos y ajuste manual de stock.
- Consulta de alertas de stock crítico.
- Consulta de pedidos, avance de estado y cancelación por el operador.
- Consulta de clientes activos por teléfono como capacidad de dominio (CL-03). Los clientes se cargan por seed.

### 4.2 Diferido a V2

Documentado en este PRD con fase `V2`. No se implementa en el MVP:

- Gestión de clientes desde el dashboard (CL-01).
- Cancelación de pedidos por el cliente desde el chat (CH-09, CA-08).
- Reclamos: registro por chat y gestión por el operador (CH-10, RE-01, RE-02, RN-06, RN-07, CA-09, CA-10).
- Órdenes de reposición, su recepción y la suma de stock asociada (IN-03 parte V2, RP-01..03, RN-11, CA-02).
- Pantallas del dashboard para las funcionalidades anteriores.

Las entidades `Claim` y `PurchaseOrder` son de V2 y no forman parte del esquema físico inicial del MVP (§7).

### 4.3 Fuera del producto

- Integración real con WhatsApp (solo simulador web).
- Funciones de IA en el producto: el bot es un menú determinista. La IA se usa únicamente para desarrollar (RNF-09).
- Pagos, facturación e impuestos.
- Logística de envíos: el operador cambia los estados a mano.
- Lotes, fechas de vencimiento y registro sanitario.
- Gestión de proveedores como entidad.
- Gestión de usuarios operadores desde la UI.
- Notificaciones fuera del dashboard (email, SMS, push).

## 5. Requisitos funcionales

### 5.1 Acceso al dashboard (AU)

- **AU-01** `MVP` Todas las funciones del dashboard requieren iniciar sesión con email y contraseña.
- **AU-02** `MVP` Existe un único rol de operador. Las cuentas se crean mediante seed.
- **AU-03** `MVP` La sesión del operador expira a las 8 horas de iniciada; el valor es configurable. Con la sesión expirada, el dashboard exige iniciar sesión de nuevo.

### 5.2 Clientes (CL)

- **CL-01** `V2` El operador crea, edita y desactiva clientes con razón social, documento tributario y teléfono.
- **CL-02** `MVP` Un cliente desactivado se trata como no registrado en el chat.
- **CL-03** `MVP` El sistema ofrece una consulta de clientes por teléfono, reutilizable por cualquier módulo, que normaliza el número (RN-12), identifica al cliente e indica si existe y si está activo. El chat la usa para aceptar o rechazar la conversación (CH-02, CL-02). No depende de la gestión de clientes de CL-01. En el MVP los clientes, incluidos los desactivados, se cargan por seed.

### 5.3 Canal conversacional (CH)

- **CH-01** `MVP` El simulador web imita WhatsApp. Quien lo usa indica el teléfono desde el que "escribe".
- **CH-02** `MVP` Si el teléfono no pertenece a un cliente activo (CL-03), el bot pide contactar a la distribuidora y no muestra el menú.
- **CH-03** Menú principal. Desde cualquier paso, `0` vuelve al menú. Ante una entrada inválida, el bot repite la pregunta.
  - `MVP` Opciones: 1) Catálogo y compra, 2) Mis pedidos. El menú no muestra opciones de funcionalidades no implementadas.
  - `V2` Se agrega 3) Reclamo (CH-10).
- **CH-04** `MVP` El catálogo lista los productos activos con precio. Los agotados se muestran como "Sin stock" y no se pueden elegir.
- **CH-05** `MVP` El cliente agrega productos al carrito indicando una cantidad entera mayor a 0. Si la cantidad supera el stock, el bot ofrece ajustarla al disponible o descartar el ítem. El cliente puede ver el carrito y quitar ítems.
- **CH-06** `MVP` Al confirmar, el bot muestra un resumen (ítems, subtotales, total) y pide confirmación final. Al recibirla:
  - Si algún ítem ya no tiene stock suficiente (RN-02), lo informa y ofrece ajustar, quitar el ítem o cancelar la compra.
  - Si algún producto se desactivó (RN-02), informa que ya no está disponible y el pedido no se crea con él.
  - Si el precio de algún producto cambió respecto del resumen mostrado (RN-03), el pedido no se crea: el bot muestra un nuevo resumen con los precios vigentes y pide una nueva confirmación.
- **CH-07** `MVP` Una compra confirmada devuelve el número de orden (RN-04) con estado `PENDING`.
- **CH-08** En "Mis pedidos", con un número de orden el bot muestra el pedido. Solo muestra pedidos propios (RN-08).
  - `MVP` Muestra número de orden, estado, ítems y total.
  - `V2` Muestra además el estado del reclamo, si existe.
- **CH-09** `V2` El cliente puede cancelar un pedido propio que esté en `PENDING` (RN-05).
- **CH-10** `V2` Para reclamar, el cliente indica número de orden, tipo y descripción. Aplican RN-06 y RN-08.
- **CH-11** `MVP` Una sesión de chat expira tras 30 minutos sin actividad; el valor es configurable. Una sesión expirada es inválida: no acepta más mensajes y su carrito se pierde.

### 5.4 Inventario (IN)

- **IN-01** `MVP` El operador crea, edita y desactiva productos con nombre, descripción, precio, stock actual y stock mínimo.
- **IN-02** `MVP` El operador puede ajustar el stock a mano, fijando un nuevo valor entero ≥ 0. El ajuste indica el stock que el operador tenía a la vista; si el stock actual ya no coincide (por ejemplo, porque se confirmó un pedido entretanto), el ajuste se rechaza como conflicto y el stock no cambia.
- **IN-03** Panel de alertas de stock (RN-09).
  - `MVP` El dashboard muestra la consulta de productos en alerta, con su stock actual y su stock mínimo.
  - `V2` Desde una alerta se crea una orden de reposición con el producto precargado.

### 5.5 Reposición (RP) — `V2`

- **RP-01** `V2` El operador crea órdenes de reposición con producto, cantidad y nombre del proveedor (texto opcional). Se crean en estado `DRAFT`.
- **RP-02** `V2` El operador avanza la orden `DRAFT → SENT → RECEIVED` (RN-11).
- **RP-03** `V2` El listado de órdenes de reposición se puede filtrar por estado.

### 5.6 Pedidos (PE)

- **PE-01** El operador ve el listado de pedidos, con filtro por estado, y el detalle de cada uno.
  - `MVP` El detalle muestra cliente, ítems y total.
  - `V2` El detalle muestra además los reclamos del pedido.
- **PE-02** `MVP` El operador avanza el estado del pedido y lo cancela según RN-05.

### 5.7 Reclamos (RE) — `V2`

En el MVP no se implementa ninguna gestión de reclamos.

- **RE-01** `V2` El operador ve el listado de reclamos, con filtro por estado y tipo, y el detalle con su pedido.
- **RE-02** `V2` El operador resuelve un reclamo `OPEN` como `APPROVED` o `REJECTED`, con nota de resolución obligatoria (RN-07).

## 6. Reglas de negocio (RN)

- **RN-01** `MVP` El stock nunca puede quedar negativo.
- **RN-02** `MVP` El stock se descuenta al confirmar el pedido, en una operación atómica que vuelve a validar cada ítem: el producto debe seguir activo (RN-10) y tener stock suficiente. Un producto desactivado después de agregarse al carrito se rechaza y el pedido no se crea con él. El carrito no reserva stock. Si dos clientes compiten por las mismas unidades, gana el primero en confirmar.
- **RN-03** `MVP` Cada ítem guarda el precio vigente al confirmar. Los cambios de precio posteriores no afectan pedidos existentes. Si el precio vigente al confirmar difiere del mostrado en el resumen, el pedido no se crea hasta que el cliente confirme un nuevo resumen con los precios vigentes (CH-06).
- **RN-04** `MVP` Cada pedido recibe un número de orden único y creciente, generado por el backend, con el formato `MED-` seguido de un número de al menos cinco dígitos, completado con ceros a la izquierda y sin límite máximo de longitud (ej. `MED-00001`, `MED-123456`). Se permiten saltos en la numeración cuando una transacción falla o se revierte.
- **RN-05** Estados del pedido: `PENDING → PROCESSING → DISPATCHED → DELIVERED`, sin saltos ni retroceso. `CANCELLED` es un estado final. Al cancelar, las cantidades de cada ítem vuelven al stock exactamente una vez: una cancelación repetida o simultánea sobre el mismo pedido se rechaza y no restituye stock de nuevo.
  - `MVP` El operador avanza el pedido al estado siguiente.
  - `MVP` El operador cancela pedidos en `PENDING` o `PROCESSING`, con restitución de stock. Desde `DISPATCHED` o `DELIVERED` no se puede cancelar.
  - `V2` El cliente cancela por chat un pedido propio en `PENDING`, con restitución de stock (CH-09).
- **RN-06** `V2` Solo se reclama sobre pedidos `DELIVERED`, sin plazo límite. Un pedido tiene como máximo un reclamo `OPEN` a la vez.
- **RN-07** `V2` Resolver un reclamo no modifica el stock ni el pedido. Reembolsos y reposiciones se gestionan fuera del sistema.
- **RN-08** `MVP` El chat solo accede a pedidos del cliente asociado al teléfono de la conversación. Cualquier otro número de orden responde "Pedido no encontrado". En V2 la regla aplica también a los reclamos (CH-10).
- **RN-09** `MVP` Un producto está en alerta cuando está activo y su stock actual es ≤ su stock mínimo.
- **RN-10** `MVP` Productos y clientes no se eliminan, se desactivan. Un producto inactivo no aparece en el catálogo pero conserva su historial. En el MVP los productos se desactivan desde el dashboard (IN-01) y los clientes inactivos provienen del seed; la desactivación de clientes desde el dashboard es V2 (CL-01).
- **RN-11** `V2` Al pasar una orden de reposición a `RECEIVED`, su cantidad se suma al stock una única vez. `RECEIVED` es un estado final.
- **RN-12** `MVP` Normalización de teléfonos. El sistema normaliza los teléfonos de clientes a un formato consistente para su identificación. Los números nacionales sin prefijo internacional reciben el prefijo predeterminado `+56`; los números que ya contienen un prefijo internacional lo conservan. Se eliminan espacios y separadores permitidos, y se evita duplicar prefijos. Las entradas vacías o con formato evidentemente inválido son rechazadas. No se valida la existencia, titularidad ni asignación oficial del número telefónico. La misma normalización se aplica a los clientes cargados por seed y al teléfono ingresado en el chat; el cliente se identifica por coincidencia del teléfono normalizado (CL-03).
  - **Alcance:** la validación exhaustiva conforme al plan de numeración de SUBTEL, la comprobación de códigos de área, la validación de números especiales (600 y 800) y la verificación de titularidad quedan fuera del MVP.

## 7. Entidades del negocio

Los atributos, tipos y restricciones se definen en `specs/01_data_models.spec.md`. Las entidades `V2` no forman parte del esquema físico inicial del MVP.

| Entidad | Fase | Representa | Valores controlados |
|---|---|---|---|
| **User** | `MVP` | Operador del dashboard | — |
| **Customer** | `MVP` | Clínica o farmacia registrada | Activo / inactivo |
| **Product** | `MVP` | Insumo médico vendible | Activo / inactivo |
| **Order** | `MVP` | Pedido confirmado de un cliente | `PENDING`, `PROCESSING`, `DISPATCHED`, `DELIVERED`, `CANCELLED` |
| **OrderItem** | `MVP` | Producto, cantidad y precio dentro de un pedido | — |
| **Claim** | `V2` | Reclamo sobre un pedido entregado | Tipo: `RETURN`, `DEFECTIVE`, `INCOMPLETE`. Estado: `OPEN`, `APPROVED`, `REJECTED` |
| **PurchaseOrder** | `V2` | Orden de reposición de un producto | `DRAFT`, `SENT`, `RECEIVED` |

## 8. Requisitos no funcionales (RNF)

Todos son `MVP`. Cada uno indica cómo se verifica.

| ID | Requisito | Verificación |
|---|---|---|
| **RNF-01** | PostgreSQL es el único motor de base de datos en desarrollo, testing, CI y en el despliegue de la entrega. No se usa SQLite ni otro motor en ningún entorno. | La configuración de cada entorno apunta a PostgreSQL y la suite de tests se ejecuta contra una instancia PostgreSQL real. |
| **RNF-02** | El contrato de la API vive en un único archivo OpenAPI, `docs/openapi.yaml`, versionado en el repositorio. Documenta cada endpoint del MVP con sus parámetros, cuerpos de petición, respuestas y errores. La versión del contrato (`info.version`) cambia cuando cambia el contrato. | El archivo es un documento OpenAPI válido (validación automática en CI, RNF-06) y cada endpoint implementado en el MVP figura en él. |
| **RNF-03** | La confirmación de un pedido es atómica: o se crean el pedido y todos sus ítems y se descuenta el stock de todos ellos, o no se persiste ningún cambio (RN-01, RN-02). | Test de integración en el que un ítem sin stock suficiente provoca que no exista el pedido ni cambie el stock de ningún producto. |
| **RNF-04** | El comportamiento concurrente de la confirmación se prueba contra PostgreSQL real, con varias conexiones simultáneas a la base. | Tests automatizados que lanzan las peticiones en paralelo y cubren al menos: (a) **últimas unidades:** varias confirmaciones simultáneas por las últimas unidades de un producto. Exactamente una se confirma, las demás se rechazan por stock insuficiente y el stock final no es negativo (CA-05). (b) **Productos en orden inverso:** dos confirmaciones simultáneas con los mismos productos en orden inverso (carrito 1: A y B; carrito 2: B y A). Cada una termina confirmada o rechazada por stock insuficiente, nunca con un error interno ni bloqueada indefinidamente. No queda ningún pedido parcial y el stock final de cada producto es el inicial menos las cantidades de los pedidos confirmados. Se prueba con stock suficiente para ambos pedidos (ambos se confirman) y con stock para solo uno. |
| **RNF-05** | El entorno local es reproducible con Docker Compose: a partir de un clon limpio y un archivo de variables basado en el ejemplo del repositorio, un comando documentado levanta la base de datos PostgreSQL, el backend y el frontend. Es el mecanismo de despliegue de la entrega; no se usa una plataforma externa. | Se ejecuta el procedimiento documentado sobre un clon limpio y la aplicación queda accesible con los datos del seed. |
| **RNF-06** | Un pipeline de CI se ejecuta en cada push y pull request y corre lint, typecheck y todos los tests automatizados, incluidos los de RNF-04, contra un servicio PostgreSQL real. | El pipeline falla si falla cualquiera de esos pasos; su historial queda visible en el repositorio remoto. |
| **RNF-07** | El backend se organiza en módulos y capas con responsabilidades separadas. Las reglas `RN-` se aplican solo en la capa de servicios; ni los controladores ni el frontend las aplican. Un módulo usa a otro solo a través de su servicio. | Revisión de código en cada pull request y tests de servicio que cubren cada regla `RN-` del MVP. |
| **RNF-08** | Seguridad básica: las contraseñas se guardan solo como hash con sal, nunca en texto plano, y el hash no se expone en la API. Los tokens de sesión expiran según AU-03. Un login fallido devuelve un mensaje genérico. Los secretos (clave de firma de tokens, credenciales de base de datos y del operador del seed) se leen de variables de entorno y no se versionan; el repositorio solo incluye un archivo de ejemplo sin valores reales. | Tests de integración del login y de rutas protegidas (CA-11), y revisión de que el repositorio no contiene secretos. |
| **RNF-09** | El uso de IA en el ciclo de desarrollo es trazable y verificable en implementación, testing, despliegue y mantenimiento. Cada uso relevante se registra en `PROMPTS.md` con el ticket asociado, la herramienta y el modelo, el resultado y la validación humana realizada. Todo código generado con IA pasa los mismos tests y la revisión humana que el resto; la IA no sustituye la aprobación humana de specs ni de cambios. | `PROMPTS.md` contiene entradas para cada una de las cuatro fases, que referencian tickets y commits verificables en el historial de git. |

## 9. Criterios de aceptación

| # | Fase | Escenario | Resultado esperado |
|---|---|---|---|
| CA-01 | `MVP` | El operador ajusta el stock de un producto activo a un valor igual o menor que su mínimo. | El producto aparece en la consulta de alertas. Un producto inactivo no aparece aunque cumpla la condición (RN-09). |
| CA-02 | `V2` | Una orden de reposición pasa a `RECEIVED`. | El stock aumenta en la cantidad pedida y, si supera el mínimo, sale de alertas. |
| CA-03 | `MVP` | Un cliente registrado compra dos productos por chat. | Se genera `MED-XXXXX` en `PENDING` y el stock de ambos baja. |
| CA-04 | `MVP` | El cliente pide más unidades de las disponibles. | El bot ofrece ajustar al disponible o descartar el ítem. |
| CA-05 | `MVP` | Dos confirmaciones compiten por las últimas unidades. | Solo una se confirma. La otra recibe la opción de ajustar y el stock no queda negativo. |
| CA-06 | `MVP` | Escribe al chat un teléfono no registrado o el de un cliente desactivado. | El bot pide contactar a la distribuidora y no muestra el menú (CH-02, CL-02). |
| CA-07 | `MVP` | El cliente consulta un pedido de otro cliente. | "Pedido no encontrado". |
| CA-08 | `V2` | El cliente cancela un pedido `PENDING`. | Queda `CANCELLED` y el stock se restituye. |
| CA-09 | `V2` | El cliente reclama un pedido `DELIVERED`; luego intenta reclamar uno no entregado. | El primero aparece en el dashboard como `OPEN`; el segundo se rechaza. |
| CA-10 | `V2` | El operador resuelve un reclamo sin nota. | No se permite. Con nota, queda `APPROVED`/`REJECTED` y el cliente lo ve en el chat. |
| CA-11 | `MVP` | Se accede al dashboard sin sesión o con la sesión expirada (AU-03). | Se redirige al login. |
| CA-12 | `MVP` | El operador cancela pedidos en distintos estados y repite la cancelación, de forma secuencial y simultánea. | (a) Desde `PENDING` o `PROCESSING`: el pedido queda `CANCELLED` y el stock de cada ítem aumenta en su cantidad. (b) Desde `DISPATCHED`, `DELIVERED` o `CANCELLED`: la cancelación se rechaza y ni el pedido ni el stock cambian. (c) Idempotencia del efecto: si se repite la cancelación de un mismo pedido, ya sea después o en paralelo, el stock se restituye una sola vez. Toda petición posterior a la que canceló se rechaza como conflicto porque el pedido ya está `CANCELLED` (RN-05). |
| CA-13 | `MVP` | El operador ajusta el stock indicando el valor que tenía a la vista, pero el stock cambió entretanto (por ejemplo, por un pedido confirmado). | El ajuste se rechaza como conflicto con el código `STOCK_CHANGED` y el stock conserva el valor actual. Si el valor indicado coincide con el actual, el ajuste se aplica (IN-02). |
| CA-14 | `MVP` | El cliente agrega un producto al carrito, el operador lo desactiva y el cliente confirma. | El pedido no se crea con ese producto, el bot informa que ya no está disponible y el stock no cambia (RN-02). |
| CA-15 | `MVP` | El bot muestra el resumen, el operador cambia el precio de un producto del carrito y el cliente confirma. | El pedido no se crea. El bot muestra un nuevo resumen con el precio vigente y solo crea el pedido tras una nueva confirmación; los ítems guardan ese precio (RN-03). |
| CA-16 | `MVP` | El cliente envía un mensaje a una sesión de chat sin actividad durante más del tiempo configurado. | La sesión se considera inválida, el mensaje no se procesa y el carrito se pierde (CH-11). |

## 10. Supuestos

- Una sola moneda, sin impuestos ni descuentos.
- El carrito existe solo durante la conversación y se pierde si esta se reinicia o expira (CH-11).
- Las cuentas de operador y un conjunto inicial de productos y clientes (activos e inactivos) se cargan por seed. En el MVP el seed es la única vía para registrar clientes.
- Mercado objetivo: Chile. Los teléfonos se normalizan según RN-12.
