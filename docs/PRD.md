# PRD — MedSupply AI

| Versión | Estado | Fecha |
|---|---|---|
| 1.0 (MVP) | Aprobado para escribir specs | 2026-09-12 |

Este documento define **qué** hace el producto y **por qué**. El **cómo** (esquemas, API, máquina de estados, pantallas) vive en `specs/`. Todos los requisitos y reglas tienen ID para poder referenciarlos sin copiarlos.

## 1. Problema

Las distribuidoras de insumos médicos atienden a clínicas y farmacias por mensajería. La verificación manual provoca ventas de productos sin stock real, demoras en confirmar pedidos y reposiciones tardías. MedSupply automatiza la validación de stock durante la conversación, ofrece alternativas cuando la cantidad pedida supera las existencias y centraliza pedidos, reclamos y alertas de reposición para el operador.

## 2. Usuarios

| Usuario | Descripción | Canal |
|---|---|---|
| **Cliente B2B** | Clínica o farmacia registrada previamente por la distribuidora, identificada por su teléfono. | Simulador de chat |
| **Operador** | Empleado de la distribuidora que gestiona inventario, clientes, pedidos, reclamos y reposición. Rol único. | Dashboard web |

## 3. Objetivos del MVP

1. Ningún pedido se confirma con stock insuficiente.
2. Todo producto activo con stock bajo el mínimo aparece en las alertas del dashboard.
3. Un cliente puede comprar, consultar, cancelar y reclamar solo por chat, sin que intervenga el operador.

## 4. Alcance

**Incluido:** simulador web de chat, catálogo con carrito, validación de stock, pedidos y sus estados, reclamos, gestión de clientes y productos, alertas de stock, órdenes de reposición y acceso autenticado al dashboard.

**Fuera del MVP:**

- Integración real con WhatsApp (solo simulador web).
- Funciones de IA en el producto: el bot es un menú determinista. La IA se usa únicamente para desarrollar.
- Pagos, facturación e impuestos.
- Logística de envíos: el operador cambia los estados a mano.
- Lotes, fechas de vencimiento y registro sanitario.
- Gestión de proveedores como entidad.
- Gestión de usuarios operadores desde la UI.
- Notificaciones fuera del dashboard (email, SMS, push).

## 5. Requisitos funcionales

### 5.1 Acceso al dashboard (AU)

- **AU-01** Todas las funciones del dashboard requieren iniciar sesión con email y contraseña.
- **AU-02** Existe un único rol de operador. Las cuentas se crean mediante seed.

### 5.2 Clientes (CL)

- **CL-01** El operador crea, edita y desactiva clientes con razón social, documento tributario y teléfono.
- **CL-02** Un cliente desactivado se trata como no registrado en el chat.

### 5.3 Canal conversacional (CH)

- **CH-01** El simulador web imita WhatsApp. Quien lo usa indica el teléfono desde el que "escribe".
- **CH-02** Si el teléfono no pertenece a un cliente activo, el bot pide contactar a la distribuidora y no muestra el menú.
- **CH-03** Menú principal: 1) Catálogo y compra, 2) Mis pedidos, 3) Reclamo. Desde cualquier paso, `0` vuelve al menú. Ante una entrada inválida, el bot repite la pregunta.
- **CH-04** El catálogo lista los productos activos con precio. Los agotados se muestran como "Sin stock" y no se pueden elegir.
- **CH-05** El cliente agrega productos al carrito indicando una cantidad entera mayor a 0. Si la cantidad supera el stock, el bot ofrece ajustarla al disponible o descartar el ítem. El cliente puede ver el carrito y quitar ítems.
- **CH-06** Al confirmar, el bot muestra un resumen (ítems, subtotales, total) y pide confirmación final. Si al confirmar algún ítem ya no tiene stock suficiente (RN-02), lo informa y ofrece ajustar, quitar el ítem o cancelar la compra.
- **CH-07** Una compra confirmada devuelve el número de orden (RN-04) con estado `PENDING`.
- **CH-08** En "Mis pedidos", con un número de orden el bot muestra estado, ítems, total y el estado del reclamo si existe. Solo muestra pedidos propios (RN-08).
- **CH-09** El cliente puede cancelar un pedido propio que esté en `PENDING` (RN-05).
- **CH-10** Para reclamar, el cliente indica número de orden, tipo y descripción. Aplican RN-06 y RN-08.

### 5.4 Inventario (IN)

- **IN-01** El operador crea, edita y desactiva productos con nombre, descripción, precio, stock actual y stock mínimo.
- **IN-02** El operador puede ajustar el stock a mano (entero ≥ 0).
- **IN-03** El dashboard muestra un panel de alertas (RN-09). Desde una alerta se crea una orden de reposición con el producto precargado.

### 5.5 Reposición (RP)

- **RP-01** El operador crea órdenes de reposición con producto, cantidad y nombre del proveedor (texto opcional). Se crean en estado `DRAFT`.
- **RP-02** El operador avanza la orden `DRAFT → SENT → RECEIVED` (RN-11).
- **RP-03** El listado de órdenes de reposición se puede filtrar por estado.

### 5.6 Pedidos (PE)

- **PE-01** El operador ve el listado de pedidos, con filtro por estado, y el detalle de cada uno (cliente, ítems, total, reclamos).
- **PE-02** El operador avanza el estado del pedido y lo cancela según RN-05.

### 5.7 Reclamos (RE)

- **RE-01** El operador ve el listado de reclamos, con filtro por estado y tipo, y el detalle con su pedido.
- **RE-02** El operador resuelve un reclamo `OPEN` como `APPROVED` o `REJECTED`, con nota de resolución obligatoria (RN-07).

## 6. Reglas de negocio (RN)

- **RN-01** El stock nunca puede quedar negativo.
- **RN-02** El stock se descuenta al confirmar el pedido, en una operación atómica que vuelve a validar cada ítem. El carrito no reserva stock. Si dos clientes compiten por las mismas unidades, gana el primero en confirmar.
- **RN-03** Cada ítem guarda el precio vigente al confirmar. Los cambios de precio posteriores no afectan pedidos existentes.
- **RN-04** El número de orden es único y consecutivo, con formato `MED-00001`.
- **RN-05** Estados del pedido: `PENDING → PROCESSING → DISPATCHED → DELIVERED`, sin retroceso. Se pasa a `CANCELLED` desde `PENDING` (cliente u operador) o desde `PROCESSING` (solo operador). Al cancelar, las cantidades vuelven al stock.
- **RN-06** Solo se reclama sobre pedidos `DELIVERED`, sin plazo límite. Un pedido tiene como máximo un reclamo `OPEN` a la vez.
- **RN-07** Resolver un reclamo no modifica el stock ni el pedido. Reembolsos y reposiciones se gestionan fuera del sistema.
- **RN-08** El chat solo accede a pedidos del cliente asociado al teléfono de la conversación. Cualquier otro número de orden responde "Pedido no encontrado".
- **RN-09** Un producto está en alerta cuando está activo y su stock actual es ≤ su stock mínimo.
- **RN-10** Productos y clientes no se eliminan, se desactivan. Un producto inactivo no aparece en el catálogo pero conserva su historial.
- **RN-11** Al pasar una orden de reposición a `RECEIVED`, su cantidad se suma al stock una única vez. `RECEIVED` es un estado final.

## 7. Entidades del negocio

Los atributos, tipos y restricciones se definen en `specs/01_data_models.spec.md`.

| Entidad | Representa | Valores controlados |
|---|---|---|
| **User** | Operador del dashboard | — |
| **Customer** | Clínica o farmacia registrada | Activo / inactivo |
| **Product** | Insumo médico vendible | Activo / inactivo |
| **Order** | Pedido confirmado de un cliente | `PENDING`, `PROCESSING`, `DISPATCHED`, `DELIVERED`, `CANCELLED` |
| **OrderItem** | Producto, cantidad y precio dentro de un pedido | — |
| **Claim** | Reclamo sobre un pedido entregado | Tipo: `RETURN`, `DEFECTIVE`, `INCOMPLETE`. Estado: `OPEN`, `APPROVED`, `REJECTED` |
| **PurchaseOrder** | Orden de reposición de un producto | `DRAFT`, `SENT`, `RECEIVED` |

## 8. Criterios de aceptación del MVP

| # | Escenario | Resultado esperado |
|---|---|---|
| CA-01 | El operador ajusta el stock de un producto por debajo del mínimo. | Aparece en alertas y desde ahí se crea una orden de reposición. |
| CA-02 | Una orden de reposición pasa a `RECEIVED`. | El stock aumenta en la cantidad pedida y, si supera el mínimo, sale de alertas. |
| CA-03 | Un cliente registrado compra dos productos por chat. | Se genera `MED-XXXXX` en `PENDING` y el stock de ambos baja. |
| CA-04 | El cliente pide más unidades de las disponibles. | El bot ofrece ajustar al disponible o descartar el ítem. |
| CA-05 | Dos confirmaciones compiten por las últimas unidades. | Solo una se confirma. La otra recibe la opción de ajustar y el stock no queda negativo. |
| CA-06 | Escribe al chat un teléfono no registrado. | El bot no muestra el menú. |
| CA-07 | El cliente consulta un pedido de otro cliente. | "Pedido no encontrado". |
| CA-08 | El cliente cancela un pedido `PENDING`. | Queda `CANCELLED` y el stock se restituye. |
| CA-09 | El cliente reclama un pedido `DELIVERED`; luego intenta reclamar uno no entregado. | El primero aparece en el dashboard como `OPEN`; el segundo se rechaza. |
| CA-10 | El operador resuelve un reclamo sin nota. | No se permite. Con nota, queda `APPROVED`/`REJECTED` y el cliente lo ve en el chat. |
| CA-11 | Se accede al dashboard sin sesión. | Se redirige al login. |

## 9. Supuestos

- Una sola moneda, sin impuestos ni descuentos.
- El carrito existe solo durante la conversación y se pierde si esta se reinicia.
- Las cuentas de operador y un conjunto inicial de productos y clientes se cargan por seed.
