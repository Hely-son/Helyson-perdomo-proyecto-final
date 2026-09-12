# US-05 · Compra conversacional

| Requisitos | Reglas | Criterios PRD | Puntos | Depende de |
|---|---|---|---|---|
| CH-01..CH-07, CL-02 | RN-01, RN-02, RN-03, RN-04 | CA-03, CA-04, CA-05, CA-06 | 21 | US-02, US-03 |

## Historia

**Como** comprador de una clínica o farmacia registrada,
**quiero** armar y confirmar un pedido de varios productos por chat,
**para** comprar con la seguridad de que hay stock, sin esperar una verificación manual.

## Criterios de aceptación

1. **Dado** un teléfono que no pertenece a un cliente activo, **cuando** inicia la conversación, **entonces** el bot pide contactar a la distribuidora y no muestra el menú (CH-02, CA-06).
2. **Dado** un cliente activo, **cuando** inicia la conversación, **entonces** ve el menú. Desde cualquier paso, `0` vuelve al menú, y una entrada inválida repite la pregunta (CH-03).
3. **Dado** el catálogo, **cuando** lo consulta, **entonces** ve los productos activos con precio. Los agotados aparecen como "Sin stock" y no se pueden elegir (CH-04).
4. **Dado** un producto con stock 5, **cuando** pide 8, **entonces** el bot ofrece ajustar a 5 o descartar el ítem (CH-05, CA-04).
5. **Dado** un carrito con ítems, **cuando** lo consulta, **entonces** puede ver las líneas y quitar ítems. Agregar un producto que ya está en el carrito suma a la línea existente.
6. **Dado** un carrito, **cuando** pide confirmar, **entonces** ve el resumen con ítems, subtotales y total, y debe confirmar explícitamente (CH-06).
7. **Dado** que confirma y hay stock, **entonces** recibe un número `MED-XXXXX` en `PENDING`, el stock de cada producto baja y cada ítem guarda su precio (CH-07, RN-03, RN-04, CA-03).
8. **Dado** que otro cliente consumió el stock mientras tanto, **cuando** confirma, **entonces** no se crea el pedido, el stock no queda negativo y el bot ofrece ajustar, quitar o cancelar (RN-02, CA-05).

## Tickets

### TK-05.1 · [API] Motor FSM y sesiones de chat
**Puntos:** 5 · **Depende de:** TK-02.1 · **Spec:** specs/03_conversational_bot.spec.md

Crear el motor de estados, el almacén de sesiones en memoria y los endpoints `POST /chat/sessions` y `POST /chat/sessions/:id/messages`. Incluye la identificación por teléfono, el menú, el comando `0` y el manejo de entradas inválidas.

**Hecho cuando:**
- Las transiciones están definidas como tabla o mapa declarativo, no como `if` anidados.
- Una sesión inexistente devuelve 404.
- Los estados del menú tienen tests unitarios.

### TK-05.2 · [API] Catálogo y carrito en el chat
**Puntos:** 5 · **Depende de:** TK-05.1, TK-03.1 · **Spec:** specs/03_conversational_bot.spec.md

Crear los estados para listar el catálogo, elegir producto, ingresar cantidad, ajustar o descartar por stock, ver el carrito y quitar ítems.

**Hecho cuando:**
- La validación de stock usa el servicio de productos. El FSM no consulta Prisma.
- Hay tests unitarios de los criterios 3, 4 y 5.

### TK-05.3 · [API] Confirmación atómica del pedido
**Puntos:** 5 · **Depende de:** TK-05.2, TK-00.3 · **Spec:** specs/04_orders_claims.spec.md

Crear en `orders.service` la operación de crear un pedido a partir de un carrito: transacción, descuento condicional de stock por ítem, precio congelado y `orderNumber`.

**Hecho cuando:**
- Si falla cualquier ítem, se revierte todo y se devuelve la lista de ítems sin stock.
- Dos confirmaciones concurrentes por la última unidad producen exactamente un pedido.

### TK-05.4 · [UI] Simulador de chat
**Puntos:** 3 · **Depende de:** TK-05.1, TK-00.2 · **Spec:** specs/03_conversational_bot.spec.md

Crear en `/chat` la interfaz estilo WhatsApp con Ant Design: ingreso de teléfono, burbujas de cliente y bot, campo de texto y botón para reiniciar la conversación.

**Hecho cuando:**
- La UI solo muestra lo que devuelve la API. No contiene lógica de flujo.

### TK-05.5 · [TEST] Pruebas de compra
**Puntos:** 3 · **Depende de:** TK-05.3, TK-05.4 · **Spec:** specs/03_conversational_bot.spec.md

**Hecho cuando:**
- Hay un test de integración de concurrencia para RN-02 (CA-05).
- Los E2E de CA-03, CA-04 y CA-06 pasan.
