# US-04 · Alertas de stock y reposición

| Requisitos | Reglas | Criterios PRD | Puntos | Depende de |
|---|---|---|---|---|
| IN-03, RP-01..03 | RN-09, RN-11 | CA-01, CA-02 | 11 | US-03 |

## Historia

**Como** operador,
**quiero** ver qué productos están en stock crítico y generar órdenes de reposición,
**para** reponer a tiempo y no perder ventas por falta de existencias.

## Criterios de aceptación

1. **Dado** un producto activo con stock igual o menor a su mínimo, **cuando** abro el dashboard, **entonces** aparece en alertas. Uno inactivo no aparece (RN-09).
2. **Dado** un producto en alerta, **cuando** elijo "Reponer", **entonces** se abre el formulario de orden con el producto precargado y se crea en `DRAFT` (CA-01).
3. **Dado** una orden, **cuando** la avanzo, **entonces** pasa de `DRAFT` a `SENT` y luego a `RECEIVED`, sin saltar pasos ni retroceder (RP-02).
4. **Dado** una orden `SENT`, **cuando** la marco `RECEIVED`, **entonces** el stock sube en la cantidad pedida y, si supera el mínimo, el producto sale de alertas (CA-02).
5. **Dado** una orden `RECEIVED`, **cuando** se intenta cambiar su estado o se repite la petición, **entonces** se rechaza y el stock no vuelve a sumarse (RN-11).
6. **Dado** el listado de órdenes, **cuando** filtro por estado, **entonces** veo solo las órdenes de ese estado (RP-03).

## Tickets

### TK-04.1 · [API] Endpoint de alertas
**Puntos:** 1 · **Depende de:** TK-03.1 · **Spec:** specs/02_inventory_system.spec.md

Crear `GET /products/alerts` aplicando RN-09.

**Hecho cuando:**
- Incluye el caso stock = mínimo y excluye productos inactivos.

### TK-04.2 · [API] Órdenes de reposición
**Puntos:** 3 · **Depende de:** TK-03.1 · **Spec:** specs/02_inventory_system.spec.md

Crear, listar con filtro y cambiar el estado de las órdenes. La transición a `RECEIVED` suma el stock en una transacción.

**Hecho cuando:**
- Una transición inválida devuelve 409.
- Dos peticiones simultáneas de `RECEIVED` suman el stock una sola vez.
- `sentAt` y `receivedAt` se asignan al hacer cada transición.

### TK-04.3 · [UI] Panel de alertas
**Puntos:** 2 · **Depende de:** TK-04.1, TK-01.2 · **Spec:** specs/02_inventory_system.spec.md

Mostrar en la página de inicio del dashboard los productos en alerta, con stock actual, mínimo y botón "Reponer".

**Hecho cuando:**
- "Reponer" abre el formulario de TK-04.4 con el producto precargado.

### TK-04.4 · [UI] Pantalla de órdenes de reposición
**Puntos:** 3 · **Depende de:** TK-04.2 · **Spec:** specs/02_inventory_system.spec.md

Crear la tabla con filtro por estado, el formulario de creación y los botones para avanzar de estado.

**Hecho cuando:**
- Solo se muestra el botón de la siguiente transición válida.

### TK-04.5 · [TEST] Pruebas de alertas y reposición
**Puntos:** 2 · **Depende de:** TK-04.2, TK-04.3, TK-04.4 · **Spec:** specs/02_inventory_system.spec.md

**Hecho cuando:**
- Hay tests de integración para RN-09 (casos límite) y RN-11 (idempotencia).
- Los E2E de CA-01 y CA-02 pasan.
