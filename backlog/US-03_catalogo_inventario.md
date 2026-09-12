# US-03 · Catálogo e inventario

| Requisitos | Reglas | Puntos | Depende de |
|---|---|---|---|
| IN-01, IN-02 | RN-01, RN-03, RN-10 | 8 | US-01 |

## Historia

**Como** operador,
**quiero** mantener el catálogo de productos y corregir su stock,
**para** que el chat ofrezca productos, precios y existencias reales.

## Criterios de aceptación

1. **Dado** el formulario de producto, **cuando** guardo nombre, precio > 0, stock ≥ 0 y mínimo ≥ 0, **entonces** el producto queda activo.
2. **Dado** un precio ≤ 0 o un stock o mínimo negativo, **cuando** intento guardar, **entonces** se rechaza (RN-01).
3. **Dado** un producto, **cuando** ajusto su stock a mano a un entero ≥ 0, **entonces** el nuevo valor se refleja de inmediato (IN-02).
4. **Dado** un producto con pedidos, **cuando** cambio su precio, **entonces** los pedidos existentes conservan su precio original (RN-03).
5. **Dado** un producto, **cuando** lo desactivo, **entonces** no se elimina y deja de estar disponible para el chat (RN-10).

## Tickets

### TK-03.1 · [API] Endpoints de productos
**Puntos:** 3 · **Depende de:** TK-01.1 · **Spec:** specs/02_inventory_system.spec.md

Crear listar, crear, editar y desactivar productos, con validación Zod.

**Hecho cuando:**
- No existe endpoint de borrado.
- El listado permite filtrar por activos o inactivos.

### TK-03.2 · [API] Ajuste manual de stock
**Puntos:** 1 · **Depende de:** TK-03.1 · **Spec:** specs/02_inventory_system.spec.md

Crear `PATCH /products/:id/stock` con el valor absoluto del nuevo stock.

**Hecho cuando:**
- Un valor negativo o no entero devuelve 422.

### TK-03.3 · [UI] Pantalla de inventario
**Puntos:** 3 · **Depende de:** TK-03.1, TK-03.2, TK-01.2 · **Spec:** specs/02_inventory_system.spec.md

Crear la tabla de productos (precio, stock, mínimo, estado), el formulario modal, la acción "Ajustar stock" y la de desactivar.

**Hecho cuando:**
- Los productos con stock ≤ mínimo se resaltan en la tabla.

### TK-03.4 · [TEST] Pruebas de inventario
**Puntos:** 1 · **Depende de:** TK-03.1, TK-03.2 · **Spec:** specs/02_inventory_system.spec.md

**Hecho cuando:**
- Hay tests de integración para las validaciones (RN-01), el ajuste de stock y la desactivación (RN-10).
