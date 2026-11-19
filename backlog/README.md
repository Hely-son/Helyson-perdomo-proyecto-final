# Backlog — MedSupply AI

Cada archivo `US-XX` contiene la historia de usuario, sus criterios de aceptación y sus tickets de trabajo. Los requisitos y reglas se citan por ID del [PRD](../docs/PRD.md). No se copian.

## Resumen

| Orden | Historia | Requisitos | Depende de | Puntos |
|---|---|---|---|---|
| 0 | [Habilitadores técnicos](00_habilitadores.md) | — | — | 13 |
| 1 | [US-01 Acceso del operador](US-01_acceso_operador.md) | AU | Habilitadores | 7 |
| 2 | [US-02 Gestión de clientes](US-02_gestion_clientes.md) | CL | US-01 | 7 |
| 3 | [US-03 Catálogo e inventario](US-03_catalogo_inventario.md) | IN-01, IN-02 | US-01 | 8 |
| 4 | [US-04 Alertas y reposición](US-04_alertas_reposicion.md) | IN-03, RP | US-03 | 11 |
| 5 | [US-05 Compra conversacional](US-05_compra_conversacional.md) | CH-01..07 | US-02, US-03 | 21 |
| 6 | [US-06 Seguimiento de pedidos](US-06_seguimiento_pedidos.md) | CH-08, CH-09, PE | US-05 | 13 |
| 7 | [US-07 Gestión de reclamos](US-07_gestion_reclamos.md) | CH-10, RE | US-06 | 11 |
| | **Total** | | | **91 pts ≈ 91 h** |

## Estimación

Puntos Fibonacci por ticket. La historia suma los puntos de sus tickets. Como referencia de planificación, **1 punto ≈ 1 hora** de trabajo con Claude, incluyendo spec, tests y revisión.

| Puntos | Complejidad | Ejemplo |
|---|---|---|
| 1 | Trivial, un solo archivo | Endpoint de solo lectura sin reglas |
| 2 | Simple, patrón conocido | Pantalla de listado con filtro |
| 3 | Moderada, varias piezas | CRUD con validaciones y tests |
| 5 | Compleja, reglas o transacciones | Confirmación de pedido con concurrencia |
| 8 | Muy compleja | **Máximo.** Si supera 8, se divide el ticket |

## Formato de ticket

```markdown
### TK-XX.N · [CAPA] Título
**Puntos:** N · **Depende de:** TK-… · **Spec:** specs/0N_….spec.md

Qué hay que hacer, en una o dos líneas.

**Hecho cuando:**
- Condición técnica verificable
```

Capas: `INFRA`, `DB`, `API`, `UI`, `TEST`.

## Definición de hecho

Un ticket está terminado cuando:

1. Su spec está aprobada y el código la cumple.
2. Los tests del ticket pasan, junto con lint y typecheck.
3. Los criterios `CA-` que cubre están automatizados.
4. El commit cita el ID del ticket (ej. `TK-05.3: confirmación atómica de pedido`).
5. Si cambió el comportamiento, la spec quedó actualizada en el mismo cambio.
