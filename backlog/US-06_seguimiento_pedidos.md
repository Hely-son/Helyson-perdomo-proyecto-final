# US-06 · Seguimiento y gestión de pedidos

| Requisitos | Reglas | Criterios PRD | Puntos | Depende de |
|---|---|---|---|---|
| CH-08, CH-09, PE-01, PE-02 | RN-05, RN-08 | CA-07, CA-08 | 13 | US-05 |

## Historia

**Como** comprador de una clínica o farmacia,
**quiero** consultar el estado de mis pedidos y cancelar los que aún no se procesan,
**para** saber cuándo llega mi compra y corregir errores a tiempo.

**Como** operador,
**quiero** ver los pedidos y avanzar su estado,
**para** gestionar su preparación y entrega.

## Criterios de aceptación

1. **Dado** un pedido propio, **cuando** el cliente ingresa su número en "Mis pedidos", **entonces** ve el estado, los ítems, el total y el estado del reclamo si existe (CH-08).
2. **Dado** un número de orden de otro cliente o inexistente, **cuando** lo consulta, **entonces** recibe "Pedido no encontrado" (RN-08, CA-07).
3. **Dado** un pedido propio en `PENDING`, **cuando** el cliente lo cancela, **entonces** queda `CANCELLED` y el stock se restituye (CH-09, CA-08). En cualquier otro estado, el bot no ofrece cancelar.
4. **Dado** un pedido, **cuando** el operador lo avanza, **entonces** solo puede ir al siguiente estado de RN-05, sin retroceder.
5. **Dado** un pedido en `PENDING` o `PROCESSING`, **cuando** el operador lo cancela, **entonces** queda `CANCELLED` y el stock se restituye. Desde `DISPATCHED` o `DELIVERED` no se puede cancelar.
6. **Dado** el listado de pedidos, **cuando** el operador filtra por estado, **entonces** ve solo esos pedidos y puede abrir el detalle con cliente, ítems, total y reclamos (PE-01).

## Tickets

### TK-06.1 · [API] Transiciones de estado del pedido
**Puntos:** 3 · **Depende de:** TK-05.3 · **Spec:** specs/04_orders_claims.spec.md

Crear en `orders.service` la máquina de transiciones de RN-05, con el actor (`CUSTOMER` u `OPERATOR`) como parámetro. La cancelación restituye el stock en una transacción.

**Hecho cuando:**
- Una transición no permitida para el actor devuelve un error de dominio (409 vía API).
- Hay tests unitarios para todas las combinaciones de estado × actor.

### TK-06.2 · [API] Endpoints de pedidos para el operador
**Puntos:** 2 · **Depende de:** TK-06.1, TK-01.1 · **Spec:** specs/04_orders_claims.spec.md

Crear `GET /orders` con filtro y paginación, `GET /orders/:id` y `PATCH /orders/:id/status`.

**Hecho cuando:**
- El detalle incluye el cliente, los ítems y los reclamos.

### TK-06.3 · [API] "Mis pedidos" en el chat
**Puntos:** 3 · **Depende de:** TK-06.1, TK-05.1 · **Spec:** specs/03_conversational_bot.spec.md

Crear los estados del FSM para pedir el número de orden, mostrar el pedido y ofrecer cancelar si está `PENDING`.

**Hecho cuando:**
- La búsqueda filtra por el cliente de la sesión (RN-08).
- Cancelar pide confirmación antes de ejecutarse.

### TK-06.4 · [UI] Pantalla de pedidos
**Puntos:** 3 · **Depende de:** TK-06.2, TK-01.2 · **Spec:** specs/04_orders_claims.spec.md

Crear la tabla con filtro por estado, el detalle en drawer o página y los botones de la siguiente transición y de cancelar.

**Hecho cuando:**
- Solo se muestran las acciones válidas para el estado actual.

### TK-06.5 · [TEST] Pruebas de seguimiento
**Puntos:** 2 · **Depende de:** TK-06.3, TK-06.4 · **Spec:** specs/04_orders_claims.spec.md

**Hecho cuando:**
- Los E2E de CA-07 y CA-08 pasan.
- Hay un test de integración de la cancelación del operador desde `PROCESSING` con restitución de stock.
