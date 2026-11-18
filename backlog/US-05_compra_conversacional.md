# US-05 · Compra conversacional

| Fase | Requisitos | Reglas | Criterios PRD | Puntos | Depende de |
|---|---|---|---|---|---|
| `MVP` | CH-01..CH-07, CH-11, CL-02, CL-03, RNF-03, RNF-04 | RN-01, RN-02, RN-03, RN-04, RN-10, RN-12 | CA-03, CA-04, CA-05, CA-06, CA-14, CA-15, CA-16 | 32 | US-02 `MVP`, US-03 |

## Historia

**Como** comprador de una clínica o farmacia registrada,
**quiero** armar y confirmar un pedido de varios productos por chat,
**para** comprar con la seguridad de que hay stock, sin esperar una verificación manual.

## Criterios de aceptación

1. **Dado** un teléfono que no pertenece a un cliente activo, **cuando** inicia la conversación, **entonces** el bot pide contactar a la distribuidora y no muestra el menú (CH-02, CL-02, CA-06).
2. **Dado** un cliente activo, **cuando** inicia la conversación, **entonces** ve el menú con las opciones `MVP` de CH-03. Desde cualquier paso, `0` vuelve al menú, y una entrada inválida repite la pregunta.
3. **Dado** el catálogo, **cuando** lo consulta, **entonces** ve los productos activos con precio. Los agotados aparecen como "Sin stock" y no se pueden elegir (CH-04).
4. **Dado** un producto con stock 5, **cuando** pide 8, **entonces** el bot ofrece ajustar a 5 o descartar el ítem (CH-05, CA-04).
5. **Dado** un carrito con ítems, **cuando** lo consulta, **entonces** puede ver las líneas y quitar ítems. Agregar un producto que ya está en el carrito suma a la línea existente.
6. **Dado** un carrito, **cuando** pide confirmar, **entonces** ve el resumen con ítems, subtotales y total calculados con los precios vigentes, y debe confirmar explícitamente (CH-06).
7. **Dado** que confirma y todo es válido, **entonces** recibe un número `MED-` en `PENDING`, el stock de cada producto baja y cada ítem guarda su precio (CH-07, RN-03, RN-04, CA-03).
8. **Dado** que otro cliente consumió el stock mientras tanto, **cuando** confirma, **entonces** no se crea el pedido, el stock no queda negativo y el bot ofrece ajustar, quitar o cancelar (RN-02, CA-05).
9. **Dado** que un producto del carrito se desactivó, **cuando** confirma, **entonces** el pedido no se crea con ese producto, el bot informa que ya no está disponible y el stock no cambia (RN-02, CA-14).
10. **Dado** que el precio de un producto cambió después de mostrar el resumen, **cuando** confirma, **entonces** el pedido no se crea, el bot muestra un nuevo resumen con el precio vigente y solo crea el pedido tras una nueva confirmación (RN-03, CA-15).
11. **Dado** una sesión sin actividad durante más del tiempo configurado (30 minutos por defecto), **cuando** el cliente envía un mensaje, **entonces** la sesión es inválida, el mensaje no se procesa y el carrito se pierde (CH-11, CA-16).

## Tickets

### TK-05.1 · [API] Motor FSM y sesiones de chat
**Fase:** `MVP` · **Puntos:** 8 · **Depende de:** TK-02.4, TK-00.5 · **Spec:** specs/03_conversational_bot.spec.md

Crear el motor de estados, el almacén de sesiones en memoria y los endpoints `POST /chat/sessions` y `POST /chat/sessions/:id/messages`. Incluye la identificación por teléfono con la consulta de CL-03, el menú `MVP`, el comando `0`, el manejo de entradas inválidas y la expiración de sesiones (CH-11).

**Hecho cuando:**
- Las transiciones están definidas como tabla o mapa declarativo, no como `if` anidados.
- El menú solo ofrece 1) Catálogo y compra y 2) Mis pedidos.
- Una sesión inexistente devuelve 404.
- Una sesión con más inactividad que `CHAT_SESSION_TTL_MINUTES` (por defecto 30) se trata como inválida: el mensaje no se procesa y la sesión se descarta con su carrito. Cada mensaje aceptado renueva el plazo. Un barrido periódico elimina las sesiones expiradas.
- Los estados del menú tienen tests unitarios. La identificación (activo, inactivo, inexistente) y la expiración tienen tests de integración.

### TK-05.2 · [API] Catálogo y carrito en el chat
**Fase:** `MVP` · **Puntos:** 5 · **Depende de:** TK-05.1, TK-03.1 · **Spec:** specs/03_conversational_bot.spec.md

Crear los estados para listar el catálogo, elegir producto, ingresar cantidad, ajustar o descartar por stock, ver el carrito y quitar ítems.

**Hecho cuando:**
- La validación de stock usa el servicio de productos. El FSM no consulta Prisma.
- Hay tests unitarios de los criterios 3, 4 y 5.

### TK-05.3 · [API] Confirmación atómica del pedido
**Fase:** `MVP` · **Puntos:** 8 · **Depende de:** TK-03.1, TK-00.3, TK-00.5 · **Spec:** specs/04_orders_claims.spec.md

Crear en `orders.service` la operación de crear un pedido a partir de los ítems confirmados y del precio mostrado de cada uno, según el flujo de confirmación de la arquitectura: transacción, descuento condicional por ítem (producto activo y stock suficiente) en orden ascendente de `productId`, comparación con el precio vigente, precio congelado y `orderNumber` desde la secuencia.

**Hecho cuando:**
- Si falla cualquier ítem, se revierte todo y se devuelve la lista de ítems afectados con su motivo: `STOCK_INSUFFICIENT`, `PRODUCT_INACTIVE` o `PRICE_CHANGED` con el precio vigente (RNF-03, CA-14, CA-15).
- Ante un interbloqueo o conflicto de serialización (`P2034`), la transacción se reintenta entera hasta 3 veces.
- Los tests de integración contra PostgreSQL cubren cada motivo de rechazo y verifican que, al rechazar, no existe el pedido ni cambia el stock de ningún producto.

### TK-05.6 · [API] Resumen y confirmación en el chat
**Fase:** `MVP` · **Puntos:** 3 · **Depende de:** TK-05.2, TK-05.3 · **Spec:** specs/03_conversational_bot.spec.md

Crear los estados del FSM para mostrar el resumen con los precios vigentes (guardando en la sesión el precio mostrado), pedir la confirmación final, llamar a `orders.service` y responder según el resultado (CH-06, CH-07).

**Hecho cuando:**
- Un pedido confirmado devuelve el número de orden en `PENDING`.
- `STOCK_INSUFFICIENT`: el bot ofrece ajustar, quitar el ítem o cancelar la compra.
- `PRODUCT_INACTIVE`: el bot informa que el producto ya no está disponible y no crea el pedido con él.
- `PRICE_CHANGED`: el bot muestra un nuevo resumen con los precios vigentes y pide una nueva confirmación, que vuelve a pasar por TK-05.3.
- Tienen tests unitarios cada respuesta y la vuelta al resumen tras `PRICE_CHANGED`.
- No implementa lo que la spec 03 no haya resuelto: las opciones que se ofrecen tras `PRODUCT_INACTIVE` y el orden de presentación cuando llegan varios motivos a la vez.

### TK-05.4 · [UI] Simulador de chat
**Fase:** `MVP` · **Puntos:** 3 · **Depende de:** TK-05.1, TK-00.2 · **Spec:** specs/03_conversational_bot.spec.md

Crear en `/chat` la interfaz estilo WhatsApp con Ant Design: ingreso de teléfono, burbujas de cliente y bot, campo de texto y botón para reiniciar la conversación.

**Hecho cuando:**
- La UI solo muestra lo que devuelve la API. No contiene lógica de flujo.
- Ante una sesión inválida o expirada muestra la respuesta de la API y permite iniciar una conversación nueva con el botón de reinicio.

### TK-05.5 · [TEST] Concurrencia de la confirmación y E2E de compra
**Fase:** `MVP` · **Puntos:** 5 · **Depende de:** TK-05.6, TK-05.4, TK-00.4 · **Spec:** specs/04_orders_claims.spec.md, specs/03_conversational_bot.spec.md

Validación transversal de RNF-04 y E2E de los criterios de la historia.

**Hecho cuando:**
- Los tests de concurrencia corren contra PostgreSQL real, con varias conexiones y peticiones lanzadas en paralelo, y cubren:
  - (a) varias confirmaciones por las últimas unidades: exactamente un pedido, el resto `STOCK_INSUFFICIENT` y stock final ≥ 0 (CA-05);
  - (b) dos carritos con los mismos productos en orden inverso, con stock para ambos y con stock para uno solo: cada petición termina confirmada o rechazada, sin errores internos ni bloqueos; no hay pedidos parciales, y el stock final es el inicial menos lo confirmado.
- Los E2E de CA-03, CA-04, CA-06 (teléfono no registrado y cliente inactivo), CA-14, CA-15 y CA-16 pasan. CA-16 usa un tiempo de expiración corto configurado en el entorno de test.
