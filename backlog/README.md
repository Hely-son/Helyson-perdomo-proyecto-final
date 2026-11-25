# Backlog — MedSupply AI

Cada archivo `US-XX` contiene la historia de usuario, sus criterios de aceptación y sus tickets de trabajo. Los requisitos y reglas se citan por ID del [PRD](../docs/PRD.md) v1.2. No se copian.

Cada historia, criterio y ticket lleva la fase del PRD: `MVP` (se implementa en este ciclo) o `V2` (documentado, no se implementa). Los tickets `V2` conservan su definición como referencia y se volverán a planificar (dependencias, tests y estimación) cuando V2 se priorice.

El seguimiento operativo (estado de cada ticket `MVP`, responsable, commit y aprobación humana, y avance de implementación de cada spec) vive en [TRACKER.md](TRACKER.md). Los archivos de historias no registran estado.

## Resumen

| Orden | Historia | Fase | Requisitos | Depende de | Puntos MVP | Puntos V2 |
|---|---|---|---|---|---|---|
| 0 | [Habilitadores técnicos](00_habilitadores.md) | `MVP` | RNF-01, 02, 05, 06, 08 | — | 28 | — |
| 1 | [US-01 Acceso del operador](US-01_acceso_operador.md) | `MVP` | AU | Habilitadores | 9 | — |
| 2 | [US-02 Clientes: identificación y gestión](US-02_gestion_clientes.md) | `MVP` + `V2` | CL-02, CL-03 · V2: CL-01 | Habilitadores (TK-00.3, TK-00.5) | 2 | 7 |
| 3 | [US-03 Catálogo e inventario](US-03_catalogo_inventario.md) | `MVP` | IN-01, IN-02 | US-01 | 9 | — |
| 4 | [US-04 Alertas de stock y reposición](US-04_alertas_reposicion.md) | `MVP` + `V2` | IN-03 · V2: IN-03 (reposición), RP | US-03 | 4 | 6 |
| 5 | [US-05 Compra conversacional](US-05_compra_conversacional.md) | `MVP` | CH-01..07, CH-11 | US-02 `MVP`, US-03 | 34 | — |
| 6 | [US-06 Seguimiento de pedidos](US-06_seguimiento_pedidos.md) | `MVP` + `V2` | CH-08, PE · V2: CH-09 | US-05 | 15 | 3 |
| 7 | [US-07 Gestión de reclamos](US-07_gestion_reclamos.md) | `V2` | CH-10, RE | US-06 | — | 11 |
| | **Total** | | | | **99 pts ≈ 99 h** (31 tickets) | **27 pts ≈ 27 h** (11 tickets) |

**Orden dentro de los habilitadores.** TK-00.4 (seed) depende de TK-02.4 (normalización de teléfonos), así que la secuencia es: TK-00.8, TK-00.1, TK-00.2, TK-00.6, TK-00.3, TK-00.5, TK-02.4, TK-00.4 y TK-00.7.

**Dependencias entre historias y entre tickets.** Las dependencias entre historias (columna "Depende de" del resumen) representan el orden general de ejecución. Las dependencias explícitas entre tickets pueden establecer excepciones puntuales: un ticket independiente de una historia posterior puede adelantarse cuando lo necesita un ticket de una historia anterior. Esa excepción no adelanta el resto de la historia ni modifica su dependencia general. Caso vigente: TK-04.1 (US-04) se ejecuta antes que TK-03.3 (US-03), en cuanto sus propias dependencias estén satisfechas, y TK-03.3 conserva su dependencia explícita de TK-04.1. US-04 sigue dependiendo de US-03.

**Cobertura de los no funcionales.** RNF-03 y RNF-04 se cubren en TK-05.3 y TK-05.5. El contrato de RNF-02 se construye en TK-00.8 y su cumplimiento se exige en la definición de hecho de cada ticket, igual que RNF-07.

## Estimación

Puntos Fibonacci por ticket. La historia suma los puntos de sus tickets. Como referencia de planificación, **1 punto ≈ 1 hora** de trabajo con Claude, incluyendo spec, tests y revisión.

| Puntos | Complejidad | Ejemplo |
|---|---|---|
| 1 | Trivial, un solo archivo | Endpoint de solo lectura sin reglas |
| 2 | Simple, patrón conocido | Pantalla de listado con filtro |
| 3 | Moderada, varias piezas | CRUD con validaciones y tests |
| 5 | Compleja, reglas o transacciones | Transiciones de estado con restitución de stock |
| 8 | Muy compleja | **Máximo.** Si supera 8, se divide el ticket |

## Formato de ticket

```markdown
### TK-XX.N · [CAPA] Título
**Fase:** `MVP` · **Puntos:** N · **Depende de:** TK-… · **Spec:** specs/0N_….spec.md

Qué hay que hacer, en una o dos líneas.

**Hecho cuando:**
- Condición técnica verificable
```

Capas: `INFRA`, `DB`, `API`, `UI`, `TEST`.

Los tests de unidad e integración se escriben primero y forman parte del ticket de la funcionalidad. Los tickets `[TEST]` se reservan para E2E de los criterios `CA-` y para validaciones transversales, como la concurrencia de RNF-04.

## Definición de hecho

Un ticket está terminado cuando:

1. Su spec está aprobada y el código la cumple.
2. Sus tests de unidad e integración se escribieron antes que la implementación y pasan contra PostgreSQL, junto con lint y typecheck, también en CI (RNF-06).
3. Los criterios `CA-` que cubre están automatizados.
4. Los endpoints que crea o modifica figuran en `docs/openapi.yaml` y cumplen ese contrato (RNF-02).
5. El commit cita el ID del ticket (ej. `TK-05.3: confirmación atómica de pedido`).
6. Si cambió el comportamiento, la spec quedó actualizada en el mismo cambio.
