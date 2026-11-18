# US-04 · Alertas de stock (MVP) y reposición (V2)

| Fase | Requisitos | Reglas | Criterios PRD | Puntos | Depende de |
|---|---|---|---|---|---|
| `MVP` | IN-03 (consulta de alertas) | RN-09 | CA-01 | 4 | US-03 |
| `V2` | IN-03 (crear orden desde la alerta), RP-01..03 | RN-11 | CA-02 | 6 | US-04 `MVP` |

## Historias

`MVP` **Como** operador,
**quiero** ver qué productos están en stock crítico,
**para** reponer a tiempo y no perder ventas por falta de existencias.

`V2` **Como** operador,
**quiero** generar y seguir órdenes de reposición desde las alertas,
**para** que el stock repuesto se refleje sin cargarlo a mano.

## Criterios de aceptación

1. `MVP` **Dado** un producto activo con stock igual o menor a su mínimo, **cuando** abro el dashboard, **entonces** aparece en alertas. Uno inactivo no aparece aunque cumpla la condición (RN-09, CA-01).
2. `V2` **Dado** un producto en alerta, **cuando** elijo "Reponer", **entonces** se abre el formulario de orden con el producto precargado y se crea en `DRAFT`.
3. `V2` **Dado** una orden, **cuando** la avanzo, **entonces** pasa de `DRAFT` a `SENT` y luego a `RECEIVED`, sin saltar pasos ni retroceder (RP-02).
4. `V2` **Dado** una orden `SENT`, **cuando** la marco `RECEIVED`, **entonces** el stock sube en la cantidad pedida y, si supera el mínimo, el producto sale de alertas (CA-02).
5. `V2` **Dado** una orden `RECEIVED`, **cuando** se intenta cambiar su estado o se repite la petición, **entonces** se rechaza y el stock no vuelve a sumarse (RN-11).
6. `V2` **Dado** el listado de órdenes, **cuando** filtro por estado, **entonces** veo solo las órdenes de ese estado (RP-03).

## Tickets

### TK-04.1 · [API] Endpoint de alertas
**Fase:** `MVP` · **Puntos:** 1 · **Depende de:** TK-03.1 · **Spec:** specs/02_inventory_system.spec.md

Crear `GET /products/alerts` aplicando RN-09, como consulta de solo lectura.

**Hecho cuando:**
- Los tests de integración incluyen el caso stock = mínimo y excluyen productos inactivos.
- La ruta se declara antes de `GET /products/:id`.

### TK-04.3 · [UI] Panel de alertas
**Fase:** `MVP` · **Puntos:** 2 · **Depende de:** TK-04.1, TK-01.2 · **Spec:** specs/02_inventory_system.spec.md

Mostrar en la página de inicio del dashboard los productos en alerta, con stock actual y mínimo.

**Hecho cuando:**
- El panel es solo de consulta: no ofrece "Reponer" ni ninguna acción de V2.

### TK-04.5 · [TEST] E2E de alertas
**Fase:** `MVP` · **Puntos:** 1 · **Depende de:** TK-04.3, TK-03.3, TK-00.4 · **Spec:** specs/02_inventory_system.spec.md

**Hecho cuando:**
- El E2E de CA-01 pasa: tras ajustar el stock de un producto activo a un valor ≤ mínimo aparece en alertas, y el producto inactivo del seed no aparece.

### TK-04.2 · [API] Órdenes de reposición
**Fase:** `V2` · **Puntos:** 3 · **Depende de:** TK-03.1 · **Spec:** specs/02_inventory_system.spec.md

Crear, listar con filtro y cambiar el estado de las órdenes. La transición a `RECEIVED` suma el stock en una transacción, con actualización condicional sobre `status = 'SENT'`.

**Hecho cuando:**
- Una transición inválida devuelve 409.
- Dos peticiones simultáneas de `RECEIVED` suman el stock una sola vez (RN-11).
- `sentAt` y `receivedAt` se asignan al hacer cada transición.

### TK-04.4 · [UI] Pantalla de órdenes de reposición y acción "Reponer"
**Fase:** `V2` · **Puntos:** 3 · **Depende de:** TK-04.2, TK-04.3 · **Spec:** specs/02_inventory_system.spec.md

Crear la tabla con filtro por estado, el formulario de creación, los botones para avanzar de estado y el botón "Reponer" en el panel de alertas.

**Hecho cuando:**
- Solo se muestra el botón de la siguiente transición válida.
- "Reponer" abre el formulario con el producto precargado.
- El E2E de CA-02 pasa.
