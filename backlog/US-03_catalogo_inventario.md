# US-03 · Catálogo e inventario

| Fase | Requisitos | Reglas | Criterios PRD | Puntos | Depende de |
|---|---|---|---|---|---|
| `MVP` | IN-01, IN-02 | RN-01, RN-03, RN-09, RN-10 | CA-13 | 9 | US-01 |

**Dependencia puntual entre tickets:** TK-03.3 requiere TK-04.1 (US-04). Este ticket puede ejecutarse anticipadamente, una vez satisfechas sus propias dependencias, sin adelantar el resto de US-04. La dependencia general de US-03 sigue siendo US-01 (ver `backlog/README.md`, "Dependencias entre historias y entre tickets").

## Historia

**Como** operador,
**quiero** mantener el catálogo de productos y corregir su stock,
**para** que el chat ofrezca productos, precios y existencias reales.

## Criterios de aceptación

1. **Dado** el formulario de producto, **cuando** guardo nombre, precio > 0, stock ≥ 0 y mínimo ≥ 0, **entonces** el producto queda activo.
2. **Dado** un precio ≤ 0 o un stock o mínimo negativo, **cuando** intento guardar, **entonces** se rechaza (precio y mínimo: IN-01 y los `CHECK` `price > 0` y `min_stock_alert >= 0` de la spec 01; stock: RN-01 y el `CHECK` `current_stock >= 0`).
3. **Dado** un producto, **cuando** ajusto su stock a mano a un entero ≥ 0 indicando el stock que tenía a la vista, **entonces** el nuevo valor se refleja de inmediato (IN-02).
4. **Dado** que el stock cambió desde que lo vi, **cuando** envío el ajuste, **entonces** se rechaza con `STOCK_CHANGED` y el stock conserva su valor actual (IN-02, CA-13).
5. **Dado** un producto con pedidos, **cuando** cambio su precio, **entonces** los pedidos existentes conservan su precio original (RN-03).
6. **Dado** un producto, **cuando** lo desactivo, **entonces** no se elimina y deja de estar disponible para el chat (RN-10).

## Tickets

### TK-03.1 · [API] Endpoints de productos
**Fase:** `MVP` · **Puntos:** 3 · **Depende de:** TK-01.1 · **Spec:** specs/02_inventory_system.spec.md

Crear listar, crear, editar y desactivar productos, con validación Zod.

**Hecho cuando:**
- No existe endpoint de borrado.
- Los tests de integración de las validaciones (RN-01), el cambio de precio sin efecto en pedidos existentes (RN-03) y la desactivación (RN-10) pasan.
- `updateProduct` modifica solo los campos recibidos (nombre, descripción, precio, mínimo), nunca `currentStock` ni `isActive`, y no lee y reescribe el producto completo. También se permite sobre productos inactivos, sin reactivarlos. No existe reactivación (spec 02, DP-01, DP-02, DP-06).
- Hay tests de integración de ESC-32 y ESC-33, y tests de concurrencia contra PostgreSQL real de ESC-35, ESC-36 y ESC-37 (spec 02).

### TK-03.2 · [API] Ajuste manual de stock con control optimista
**Fase:** `MVP` · **Puntos:** 2 · **Depende de:** TK-03.1 · **Spec:** specs/02_inventory_system.spec.md

Crear `PATCH /products/:id/stock` con el nuevo valor absoluto y el `expectedStock`, aplicado como actualización condicional (ARCHITECTURE, flujo de ajuste de stock).

**Hecho cuando:**
- Un valor negativo o no entero devuelve 422.
- Si `expectedStock` no coincide con el stock actual, responde 409 `STOCK_CHANGED` y el stock no cambia (CA-13).
- Los tests de integración cubren el ajuste aplicado y el conflicto cuando el stock cambia entre la lectura y el ajuste.
- El ajuste también se permite sobre productos inactivos, con `expectedStock` y `STOCK_CHANGED`, y no los reactiva; el producto sigue fuera de `listStockAlerts` (spec 02, DP-02). Hay test de integración de ESC-34 (spec 02).

### TK-03.3 · [UI] Pantalla de inventario
**Fase:** `MVP` · **Puntos:** 3 · **Depende de:** TK-03.1, TK-03.2, TK-01.2, TK-04.1, TK-01.4 · **Spec:** specs/02_inventory_system.spec.md

Crear la tabla de productos (precio, stock, mínimo, estado), el formulario modal, la acción "Ajustar stock" y la de desactivar.

**Hecho cuando:**
- Los productos con stock crítico se identifican con `listStockAlerts` (RN-09) y se resaltan las filas de la tabla cuyo `id` figura en esa respuesta (DP-04 de la spec 02; spec 05 §16.4). El frontend no calcula stock actual, stock mínimo ni estado para decidir el resaltado, y los productos inactivos no se resaltan.
- "Ajustar stock" envía el stock mostrado como `expectedStock`. Ante `STOCK_CHANGED` informa del conflicto y recarga el valor actual.
- Las filas de productos inactivos ofrecen editar y ajustar stock; no hay acción de reactivación en el MVP (spec 02, DP-01 y DP-02; spec 05 §16.4). Hay prueba de interfaz de ESC-57 (spec 05).

### TK-03.4 · [TEST] E2E de inventario
**Fase:** `MVP` · **Puntos:** 1 · **Depende de:** TK-03.3, TK-00.4 · **Spec:** specs/02_inventory_system.spec.md

**Hecho cuando:**
- El E2E de CA-13 pasa: un ajuste con el stock vigente se aplica y uno con un stock desactualizado se rechaza sin cambiar el stock.
