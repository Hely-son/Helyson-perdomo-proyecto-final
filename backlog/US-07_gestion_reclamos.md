# US-07 · Gestión de reclamos

| Requisitos | Reglas | Criterios PRD | Puntos | Depende de |
|---|---|---|---|---|
| CH-10, RE-01, RE-02 | RN-06, RN-07, RN-08 | CA-09, CA-10 | 11 | US-06 |

## Historia

**Como** comprador de una clínica o farmacia,
**quiero** registrar un reclamo sobre un pedido entregado,
**para** reportar devoluciones, productos defectuosos o entregas incompletas.

**Como** operador,
**quiero** revisar y resolver los reclamos dejando constancia,
**para** dar respuesta trazable a cada cliente.

## Criterios de aceptación

1. **Dado** un pedido propio `DELIVERED` sin reclamo abierto, **cuando** el cliente indica número de orden, tipo y descripción, **entonces** se crea el reclamo `OPEN` y aparece en el dashboard (CH-10, CA-09).
2. **Dado** un pedido propio que no está `DELIVERED`, **cuando** intenta reclamar, **entonces** el bot lo rechaza e indica el motivo (RN-06, CA-09).
3. **Dado** un pedido con un reclamo `OPEN`, **cuando** intenta otro, **entonces** se rechaza. Si el reclamo anterior ya fue resuelto, sí puede abrir uno nuevo (RN-06).
4. **Dado** un número de orden ajeno o inexistente, **cuando** intenta reclamar, **entonces** recibe "Pedido no encontrado" (RN-08).
5. **Dado** un reclamo `OPEN`, **cuando** el operador intenta resolverlo sin nota, **entonces** no se permite. Con nota, queda `APPROVED` o `REJECTED` con fecha de resolución (RE-02, CA-10).
6. **Dado** un reclamo resuelto, **entonces** el stock y el estado del pedido no cambian (RN-07), y el cliente ve el resultado en "Mis pedidos" (CH-08).
7. **Dado** el listado de reclamos, **cuando** el operador filtra por estado o tipo, **entonces** ve solo esos reclamos, con acceso al pedido asociado (RE-01).

## Tickets

### TK-07.1 · [API] Servicio de reclamos
**Puntos:** 3 · **Depende de:** TK-06.1 · **Spec:** specs/04_orders_claims.spec.md

Crear en `claims.service` la creación de reclamos (valida propiedad, estado `DELIVERED` y unicidad de `OPEN` en una transacción) y su resolución con nota obligatoria.

**Hecho cuando:**
- Cada rechazo tiene un código de error propio (`ORDER_NOT_DELIVERED`, `CLAIM_ALREADY_OPEN`, `ORDER_NOT_FOUND`).
- Resolver un reclamo que no está `OPEN` devuelve 409.

### TK-07.2 · [API] Opción "Reclamo" en el chat
**Puntos:** 2 · **Depende de:** TK-07.1, TK-05.1 · **Spec:** specs/03_conversational_bot.spec.md

Crear los estados del FSM para pedir número de orden, tipo (opciones numeradas) y descripción, y confirmar el registro.

**Hecho cuando:**
- Los errores del servicio se traducen a mensajes comprensibles para el cliente.

### TK-07.3 · [API] Endpoints de reclamos para el operador
**Puntos:** 1 · **Depende de:** TK-07.1, TK-01.1 · **Spec:** specs/04_orders_claims.spec.md

Crear `GET /claims` con filtros, `GET /claims/:id` y `POST /claims/:id/resolve`.

**Hecho cuando:**
- Sin `resolutionNote`, o con la nota vacía, se devuelve 422.

### TK-07.4 · [UI] Pantalla de reclamos
**Puntos:** 3 · **Depende de:** TK-07.3, TK-01.2 · **Spec:** specs/04_orders_claims.spec.md

Crear la tabla con filtros por estado y tipo, el detalle con enlace al pedido y el modal de resolución con nota obligatoria.

**Hecho cuando:**
- Los reclamos `OPEN` se destacan y el modal no permite enviar sin nota.

### TK-07.5 · [TEST] Pruebas de reclamos
**Puntos:** 2 · **Depende de:** TK-07.2, TK-07.4 · **Spec:** specs/04_orders_claims.spec.md

**Hecho cuando:**
- Hay tests de integración para RN-06 (tres casos de rechazo) y RN-07 (sin efectos en stock ni pedido).
- Los E2E de CA-09 y CA-10 pasan.
