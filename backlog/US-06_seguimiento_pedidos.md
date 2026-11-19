# US-06 · Seguimiento y gestión de pedidos

| Fase | Requisitos | Reglas | Criterios PRD | Puntos | Depende de |
|---|---|---|---|---|---|
| `MVP` | CH-08 (sin reclamos), PE-01 (sin reclamos), PE-02 | RN-05 (operador), RN-08 | CA-07, CA-12 | 15 | US-05 |
| `V2` | CH-09 | RN-05 (cliente) | CA-08 | 3 | US-06 `MVP` |

## Historias

`MVP` **Como** comprador de una clínica o farmacia,
**quiero** consultar el estado de mis pedidos,
**para** saber cuándo llega mi compra.

`V2` **Como** comprador de una clínica o farmacia,
**quiero** cancelar los pedidos que aún no se procesan,
**para** corregir errores a tiempo.

`MVP` **Como** operador,
**quiero** ver los pedidos, avanzar su estado y cancelarlos cuando corresponda,
**para** gestionar su preparación y entrega.

## Criterios de aceptación

1. `MVP` **Dado** un pedido propio, **cuando** el cliente ingresa su número en "Mis pedidos", **entonces** ve el número de orden, el estado, los ítems y el total (CH-08).
2. `MVP` **Dado** un número de orden de otro cliente o inexistente, **cuando** lo consulta, **entonces** recibe "Pedido no encontrado" (RN-08, CA-07).
3. `V2` **Dado** un pedido propio en `PENDING`, **cuando** el cliente lo cancela, **entonces** queda `CANCELLED` y el stock se restituye (CH-09, CA-08). En cualquier otro estado, el bot no ofrece cancelar.
4. `MVP` **Dado** un pedido, **cuando** el operador lo avanza, **entonces** solo puede ir al siguiente estado de RN-05, sin saltos ni retroceso.
5. `MVP` **Dado** un pedido en `PENDING` o `PROCESSING`, **cuando** el operador lo cancela, **entonces** queda `CANCELLED` y el stock se restituye una sola vez, aunque la cancelación se repita o llegue en paralelo. Desde `DISPATCHED`, `DELIVERED` o `CANCELLED` se rechaza sin cambios (CA-12).
6. `MVP` **Dado** el listado de pedidos, **cuando** el operador filtra por estado, **entonces** ve solo esos pedidos, ordenados por fecha, y puede abrir el detalle con cliente, ítems y total (PE-01).

## Tickets

### TK-06.1 · [API] Transiciones de estado del pedido
**Fase:** `MVP` · **Puntos:** 5 · **Depende de:** TK-05.3 · **Spec:** specs/04_orders_claims.spec.md

Crear en `orders.service` la máquina de transiciones de RN-05 para el actor `OPERATOR`: avance al estado siguiente y cancelación desde `PENDING` o `PROCESSING` con restitución de stock en una transacción. Cada cambio de estado es una actualización condicional sobre el estado esperado.

**Hecho cuando:**
- Una transición no permitida o una carrera perdida devuelve un error de dominio (409 vía API).
- Hay tests unitarios para todas las combinaciones de estado × transición del operador.
- Los tests de integración contra PostgreSQL cubren CA-12: cancelación desde `PROCESSING` con restitución, rechazo desde `DISPATCHED`, `DELIVERED` y `CANCELLED`, y cancelaciones repetidas en paralelo que restituyen el stock una sola vez.
- La restitución de la cancelación actualiza los productos en orden ascendente de `productId`, y ante un interbloqueo o conflicto de serialización (`P2034`) la transacción de cancelación se reintenta entera hasta 3 veces, igual que la confirmación (spec 04, D-05).
- Hay test de integración contra PostgreSQL de ESC-28 (spec 04): cancelar un pedido `PENDING` cuyo producto se desactivó después de confirmarse deja el pedido en `CANCELLED` y aumenta el stock del producto, que sigue inactivo y fuera de las alertas.
- Hay test de concurrencia contra PostgreSQL de ESC-29 (spec 04): la cancelación de un pedido con A y B en paralelo con la confirmación de otro pedido con B y A termina sin interbloqueo ni error interno, y el stock final es el inicial más lo restituido menos lo confirmado.

### TK-06.2 · [API] Endpoints de pedidos para el operador
**Fase:** `MVP` · **Puntos:** 3 · **Depende de:** TK-06.1, TK-01.1 · **Spec:** specs/04_orders_claims.spec.md

Crear `GET /orders` con filtro por estado, paginación y orden por fecha de creación, `GET /orders/:id` y `PATCH /orders/:id/status`.

**Hecho cuando:**
- El detalle incluye el cliente, los ítems y el total.
- El listado no se ordena por `order_number` (spec 01).
- El listado se ordena por `createdAt` descendente y, a igualdad de fecha, por `id` descendente, de forma determinista (spec 04, DP-01). Hay test de integración de ESC-32 (spec 04) con dos pedidos de igual `createdAt`.
- Hay tests de integración del filtro, del detalle y de los códigos de error del cambio de estado.

### TK-06.3 · [API] "Mis pedidos" en el chat
**Fase:** `MVP` · **Puntos:** 2 · **Depende de:** TK-05.1, TK-05.3 · **Spec:** specs/03_conversational_bot.spec.md

Crear los estados del FSM para pedir el número de orden y mostrar el pedido (CH-08, parte `MVP`).

**Hecho cuando:**
- La búsqueda filtra por el cliente de la sesión (RN-08).
- Antes de buscar, el FSM elimina los espacios al inicio y al final del número recibido y lo convierte a mayúsculas. El servicio localiza el pedido por igualdad exacta con el número completo (`order_number`), sin búsquedas parciales ni solo por dígitos: `42` no encuentra `MED-00042` (spec 03, DP-10; spec 04, D-08). Hay test unitario de ESC-41 (spec 03): ` med-00042 ` muestra el pedido propio; `42`, `MED-99999` y `hola` reciben "Pedido no encontrado".
- La respuesta muestra número, estado, ítems y total, sin información de reclamos.
- No ofrece cancelar el pedido (CH-09 es `V2`).
- Hay tests unitarios del pedido propio, del ajeno y del inexistente.

### TK-06.4 · [UI] Pantalla de pedidos
**Fase:** `MVP` · **Puntos:** 3 · **Depende de:** TK-06.2, TK-01.2 · **Spec:** specs/04_orders_claims.spec.md

Crear la tabla con filtro por estado, el detalle en drawer o página y los botones de la siguiente transición y de cancelar.

**Hecho cuando:**
- Solo se muestran las acciones válidas para el estado actual.
- Un 409 se informa y se recarga el estado actual del pedido.

### TK-06.5 · [TEST] E2E de seguimiento
**Fase:** `MVP` · **Puntos:** 2 · **Depende de:** TK-06.3, TK-06.4, TK-00.4 · **Spec:** specs/04_orders_claims.spec.md

**Hecho cuando:**
- El E2E de CA-07 pasa.
- El E2E de la cancelación por el operador desde `PROCESSING` pasa, y verifica el estado y la restitución de stock (CA-12).

### TK-06.6 · [API] Cancelación por el cliente en el chat
**Fase:** `V2` · **Puntos:** 3 · **Depende de:** TK-06.1, TK-06.3 · **Spec:** specs/03_conversational_bot.spec.md, specs/04_orders_claims.spec.md

Agregar a `orders.service` el actor `CUSTOMER` para cancelar desde `PENDING`, y a "Mis pedidos" la opción de cancelar un pedido propio en `PENDING` (CH-09).

**Hecho cuando:**
- Cancelar pide confirmación antes de ejecutarse.
- El bot solo ofrece cancelar si el pedido está `PENDING`.
- El E2E de CA-08 pasa.
