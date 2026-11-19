# US-05 · Compra conversacional

| Fase | Requisitos | Reglas | Criterios PRD | Puntos | Depende de |
|---|---|---|---|---|---|
| `MVP` | CH-01..CH-07, CH-11, CL-02, CL-03, RNF-03, RNF-04 | RN-01, RN-02, RN-03, RN-04, RN-10, RN-12 | CA-03, CA-04, CA-05, CA-06, CA-14, CA-15, CA-16 | 34 | US-02 `MVP`, US-03 |

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

### TK-05.7 · [API] Sesiones de chat: almacén, expiración y procesamiento en serie
**Fase:** `MVP` · **Puntos:** 3 · **Depende de:** TK-00.1, TK-00.5 · **Spec:** specs/03_conversational_bot.spec.md

Crear el almacén de sesiones en memoria (ARCHITECTURE): creación, lectura, expiración por inactividad, renovación del plazo, barrido periódico y procesamiento en serie de los mensajes de cada sesión (CH-11). No conoce el FSM ni HTTP: recibe el procesamiento de cada mensaje como una función. Se separó de TK-05.1, que superaba el máximo de 8 puntos.

**Hecho cuando:**
- Una sesión guarda el cliente identificado, el estado de conversación, el carrito y la hora del último mensaje procesado (spec 03, §4.1).
- Una sesión con más inactividad que `CHAT_SESSION_TTL_MINUTES` (por defecto 30) se trata como inexistente y se descarta con su carrito. Solo renueva el plazo el procesamiento de un mensaje (spec 03, DP-06). Un barrido periódico elimina las sesiones expiradas.
- Un mismo cliente puede tener varias sesiones, cada una con su carrito (spec 03, DP-09).
- Los mensajes de una misma sesión se procesan en serie: uno simultáneo espera a que termine el anterior y se interpreta con el estado ya actualizado, sin bloquear otras sesiones (spec 03, DP-08). La garantía supone una sola instancia del backend (spec 03, §12.4).
- Tests unitarios con reloj controlado: renovación del plazo (ESC-11, ESC-45), expiración, barrido (ESC-13) y sesiones independientes del mismo cliente (ESC-46).
- Test unitario del mecanismo de procesamiento en serie con un manejador simulado: dos mensajes de una misma sesión se procesan en su orden de llegada, y un mensaje de otra sesión se procesa sin esperar a que termine el de la primera. Este test no crea pedidos; la prueba de negocio de confirmaciones concurrentes es ESC-35, en TK-05.5.

### TK-05.1 · [API] Motor FSM, endpoints e identificación del chat
**Fase:** `MVP` · **Puntos:** 5 · **Depende de:** TK-05.7, TK-02.4 · **Spec:** specs/03_conversational_bot.spec.md

Crear el motor de estados y los endpoints `POST /chat/sessions` y `POST /chat/sessions/:id/messages` sobre el almacén de TK-05.7. Incluye la identificación por teléfono con la consulta de CL-03, el menú `MVP`, el comando `0` y el manejo de entradas inválidas.

**Hecho cuando:**
- Las transiciones están definidas como tabla o mapa declarativo, no como `if` anidados.
- El menú solo ofrece 1) Catálogo y compra y 2) Mis pedidos.
- Una sesión inexistente o expirada devuelve 404 `SESSION_INVALID` y el mensaje no se procesa (CH-11).
- Las respuestas normales de `sendChatMessage` llevan `active: true` (spec 03, DP-11).
- Los rechazos por JSON inválido o por validación del contrato no llegan al procesamiento del mensaje, así que no renuevan el plazo (spec 03, DP-06, ESC-45).
- Los estados del menú tienen tests unitarios. La identificación (activo, inactivo, inexistente) y la expiración a través del endpoint (ESC-08, con un plazo corto configurado en el test) tienen tests de integración.

### TK-05.2 · [API] Catálogo y carrito en el chat
**Fase:** `MVP` · **Puntos:** 5 · **Depende de:** TK-05.1, TK-03.1 · **Spec:** specs/03_conversational_bot.spec.md

Crear los estados para listar el catálogo, elegir producto, ingresar cantidad, ajustar o descartar por stock, ver el carrito y quitar ítems.

**Hecho cuando:**
- La validación de stock usa el servicio de productos. El FSM no consulta Prisma.
- Al elegir un producto y al validar la cantidad se revalida su estado: si está inactivo, el bot informa, no lo agrega y vuelve al catálogo (spec 03, DP-01, ESC-43).
- Hay tests unitarios de los criterios 3, 4 y 5.

### TK-05.3 · [API] Confirmación atómica del pedido
**Fase:** `MVP` · **Puntos:** 8 · **Depende de:** TK-03.1, TK-00.3, TK-00.5 · **Spec:** specs/04_orders_claims.spec.md

Crear en `orders.service` la operación de crear un pedido a partir de los ítems confirmados y del precio mostrado de cada uno, según el flujo de confirmación de la arquitectura: transacción, descuento condicional por ítem (producto activo y stock suficiente) en orden ascendente de `productId`, comparación con el precio vigente, precio congelado y `orderNumber` desde la secuencia.

**Hecho cuando:**
- Si falla cualquier ítem, se revierte todo y se devuelve la lista de ítems afectados con su motivo: `STOCK_INSUFFICIENT`, `PRODUCT_INACTIVE` o `PRICE_CHANGED` con el precio vigente (RNF-03, CA-14, CA-15).
- Cada ítem rechazado por `STOCK_INSUFFICIENT` incluye el stock disponible leído dentro de la transacción (spec 04, D-01). El motor conversacional utiliza ese valor en `RESOLVE_STOCK` para ofrecer ajustar la cantidad solicitada. Se verifica mediante pruebas de integración contra PostgreSQL para ESC-04 (stock disponible 1) y ESC-07 (rechazo con stock disponible), de la spec 04.
- Ante un interbloqueo o conflicto de serialización (`P2034`), la transacción se reintenta entera hasta 3 veces.
- Los tests de integración contra PostgreSQL cubren cada motivo de rechazo y verifican que, al rechazar, no existe el pedido ni cambia el stock de ningún producto.

### TK-05.6 · [API] Resumen y confirmación en el chat
**Fase:** `MVP` · **Puntos:** 5 · **Depende de:** TK-05.2, TK-05.3 · **Spec:** specs/03_conversational_bot.spec.md

Crear los estados del FSM para mostrar el resumen con los precios vigentes (guardando en la sesión el precio mostrado), pedir la confirmación final, llamar a `orders.service` y responder según el resultado (CH-06, CH-07).

**Hecho cuando:**
- Un pedido confirmado devuelve el número de orden en `PENDING`.
- `STOCK_INSUFFICIENT`: el bot ofrece ajustar, quitar el ítem o cancelar la compra; cancelar vacía el carrito y vuelve al menú (spec 03, DP-04).
- `PRODUCT_INACTIVE`: el bot informa que el producto ya no está disponible, lo retira del carrito y muestra un nuevo resumen que pide confirmar; si el carrito queda vacío, vuelve al carrito (spec 03, DP-02).
- `PRICE_CHANGED`: el bot muestra un nuevo resumen con los precios vigentes y pide una nueva confirmación, que vuelve a pasar por TK-05.3.
- Tienen tests unitarios cada respuesta y la vuelta al resumen tras `PRICE_CHANGED`.
- Con varios motivos a la vez, se resuelven en el orden de la spec 03 (DP-03): inactivos, stock insuficiente y nuevo resumen con precios vigentes.
- Ante un error interno al confirmar con ROLLBACK, es decir, sin pedido creado (spec 03, DP-07, ESC-37): la respuesta es `INTERNAL_ERROR` sin detalles internos; la sesión conserva el resumen, el carrito y los precios mostrados; el reintento revalida estado, stock y precios y no crea pedidos duplicados. Tiene test de integración.
- En cuanto `orders.service` devuelve el pedido creado, la sesión pasa a `MAIN_MENU` y el carrito se vacía antes de cualquier otro paso (spec 03, F-7 "Cierre de la confirmación"). Test de integración de ESC-48: con un fallo inyectado después de la creación del pedido, la respuesta es `INTERNAL_ERROR`, existe exactamente un pedido, la sesión queda en `MAIN_MENU` con el carrito vacío, y un reintento de `1` muestra el catálogo sin crear otro pedido ni volver a descontar stock.

### TK-05.4 · [UI] Simulador de chat
**Fase:** `MVP` · **Puntos:** 3 · **Depende de:** TK-05.1, TK-00.2 · **Spec:** specs/03_conversational_bot.spec.md

Crear en `/chat` la interfaz estilo WhatsApp con Ant Design: ingreso de teléfono, burbujas de cliente y bot, campo de texto y botón para reiniciar la conversación.

**Hecho cuando:**
- La UI solo muestra lo que devuelve la API. No contiene lógica de flujo; la única validación propia es la de formato del teléfono que se indica abajo.
- Ante una sesión inválida o expirada muestra la respuesta de la API y permite iniciar una conversación nueva con el botón de reinicio.
- Validación local del teléfono (spec 05 §6.3 A):
  - el campo muestra `+56` como prefijo fijo y el cliente escribe solo los nueve dígitos nacionales;
  - vacío: indica que debe ingresar el número; ocho dígitos: `Falta 1 dígito`; menos de nueve: cuántos dígitos faltan; más de nueve: que sobran dígitos;
  - en esos casos **no** envía la petición a `startChatSession` y no completa dígitos;
  - con nueve dígitos envía **solo esos nueve dígitos**, sin `+56`, así que el prefijo no se duplica; el backend aplica la normalización compartida con el seed (spec 05 §6.3 B; TK-02.4).
- Estos mensajes son solo del campo del simulador: no son respuestas del bot ni errores HTTP. Ante un teléfono inválido que llegue directamente a la API, el backend mantiene la respuesta genérica de la spec 03 (F-1) sin exponer el motivo (spec 03 ESC-04; spec 05 ESC-01, ESC-21 para la normalización).

### TK-05.5 · [TEST] Concurrencia de la confirmación y E2E de compra
**Fase:** `MVP` · **Puntos:** 5 · **Depende de:** TK-05.6, TK-05.4, TK-00.4 · **Spec:** specs/04_orders_claims.spec.md, specs/03_conversational_bot.spec.md

Validación transversal de RNF-04 y E2E de los criterios de la historia.

**Hecho cuando:**
- Los tests de concurrencia corren contra PostgreSQL real, con varias conexiones y peticiones lanzadas en paralelo, y cubren:
  - (a) varias confirmaciones por las últimas unidades: exactamente un pedido, el resto `STOCK_INSUFFICIENT` y stock final ≥ 0 (CA-05);
  - (b) dos carritos con los mismos productos en orden inverso, con stock para ambos y con stock para uno solo: cada petición termina confirmada o rechazada, sin errores internos ni bloqueos; no hay pedidos parciales, y el stock final es el inicial menos lo confirmado.
  - (c) dos confirmaciones simultáneas de la misma sesión (spec 03, ESC-35, DP-08): se procesan en serie, se crea exactamente un pedido y ninguno duplicado, la conversación queda en el menú con el carrito vacío, y otra sesión que envía un mensaje en paralelo no espera a la primera.
- Los E2E de CA-03, CA-04, CA-06 (teléfono no registrado y cliente inactivo), CA-14, CA-15 y CA-16 pasan. CA-16 usa un tiempo de expiración corto configurado en el entorno de test.
