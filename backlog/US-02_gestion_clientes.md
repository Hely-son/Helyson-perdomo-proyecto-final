# US-02 · Clientes: identificación (MVP) y gestión (V2)

| Fase | Requisitos | Reglas | Puntos | Depende de |
|---|---|---|---|---|
| `MVP` | CL-02, CL-03 | RN-12 | 2 | Habilitadores (TK-00.3, TK-00.5) |
| `V2` | CL-01 | RN-10 | 7 | US-01 |

En el MVP los clientes solo se cargan por seed (PRD §10). Esta historia aporta al MVP la consulta de clientes por teléfono que usa el chat; la gestión desde el dashboard queda en V2.

## Historias

`MVP` **Como** distribuidora,
**quiero** que el sistema reconozca a mis clientes por su teléfono, sin importar cómo lo escriban,
**para** que solo las clínicas y farmacias habilitadas puedan comprar por el chat.

`V2` **Como** operador,
**quiero** registrar y mantener las clínicas y farmacias habilitadas,
**para** que solo clientes autorizados puedan comprar por el chat.

## Criterios de aceptación

1. `MVP` **Dado** un teléfono escrito con espacios, separadores o sin `+56`, **cuando** se carga por seed o se ingresa en el chat, **entonces** se normaliza igual en ambos casos y se reconoce al mismo cliente (RN-12, CL-03).
2. `MVP` **Dado** un teléfono vacío o con formato evidentemente inválido, **cuando** se normaliza, **entonces** se rechaza (RN-12).
3. `MVP` **Dado** un cliente inactivo, **cuando** se consulta su teléfono, **entonces** la consulta indica que existe pero está inactivo, y el chat lo trata como no registrado (CL-02; se verifica en US-05 con CA-06).
4. `V2` **Dado** el formulario de cliente, **cuando** guardo razón social, documento tributario y teléfono válidos, **entonces** el cliente queda activo y aparece en el listado.
5. `V2` **Dado** un teléfono o documento ya registrado, **cuando** intento guardarlo en otro cliente, **entonces** se rechaza con un mensaje claro.
6. `V2` **Dado** un cliente activo, **cuando** lo desactivo, **entonces** no se elimina y conserva sus pedidos (RN-10).

## Tickets

### TK-02.4 · [API] Normalización de teléfonos y consulta de clientes
**Fase:** `MVP` · **Puntos:** 2 · **Depende de:** TK-00.3, TK-00.5 · **Spec:** specs/05_operator_dashboard.spec.md

Crear la función de normalización de RN-12 y, en `customers.service`, la consulta por teléfono de CL-03. No crea endpoints HTTP.

**Hecho cuando:**
- Tests unitarios de la normalización: separadores, número nacional sin prefijo, número con `+56`, número con otro prefijo internacional, prefijo no duplicado, entrada vacía e inválida.
- Tests de integración de la consulta: cliente activo, cliente inactivo y teléfono inexistente.
- La función es la misma que usan el seed (TK-00.4) y el chat (TK-05.1).

### TK-02.1 · [API] Endpoints de clientes
**Fase:** `V2` · **Puntos:** 3 · **Depende de:** TK-01.1, TK-02.4 · **Spec:** specs/05_operator_dashboard.spec.md

Crear listar, crear, editar y desactivar clientes, con validación Zod y normalización del teléfono (RN-12).

**Hecho cuando:**
- Un duplicado de teléfono o documento devuelve 409.
- No existe ningún endpoint de borrado.

### TK-02.2 · [UI] Pantalla de clientes
**Fase:** `V2` · **Puntos:** 3 · **Depende de:** TK-02.1, TK-01.2 · **Spec:** specs/05_operator_dashboard.spec.md

Crear la tabla de clientes con indicador activo/inactivo, un formulario modal para crear o editar y la acción de desactivar con confirmación.

**Hecho cuando:**
- Los errores 409 y 422 se muestran junto al campo correspondiente.

### TK-02.3 · [TEST] Pruebas de clientes
**Fase:** `V2` · **Puntos:** 1 · **Depende de:** TK-02.1 · **Spec:** specs/05_operator_dashboard.spec.md

**Hecho cuando:**
- Hay tests de integración para unicidad y desactivación.
