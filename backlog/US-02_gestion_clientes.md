# US-02 · Gestión de clientes

| Requisitos | Reglas | Puntos | Depende de |
|---|---|---|---|
| CL-01, CL-02 | RN-10 | 7 | US-01 |

## Historia

**Como** operador,
**quiero** registrar y mantener las clínicas y farmacias habilitadas,
**para** que solo clientes autorizados puedan comprar por el chat.

## Criterios de aceptación

1. **Dado** el formulario de cliente, **cuando** guardo razón social, documento tributario y teléfono válidos, **entonces** el cliente queda activo y aparece en el listado.
2. **Dado** un teléfono o documento ya registrado, **cuando** intento guardarlo en otro cliente, **entonces** se rechaza con un mensaje claro.
3. **Dado** un teléfono escrito con espacios o guiones, **cuando** se guarda, **entonces** queda normalizado y se reconoce igual en el chat.
4. **Dado** un cliente activo, **cuando** lo desactivo, **entonces** no se elimina, conserva sus pedidos (RN-10) y el chat lo trata como no registrado (CL-02; se verifica en US-05).

## Tickets

### TK-02.1 · [API] Endpoints de clientes
**Puntos:** 3 · **Depende de:** TK-01.1 · **Spec:** specs/05_operator_dashboard.spec.md

Crear listar, crear, editar y desactivar clientes, con validación Zod y normalización del teléfono a E.164.

**Hecho cuando:**
- Un duplicado de teléfono o documento devuelve 409.
- No existe ningún endpoint de borrado.

### TK-02.2 · [UI] Pantalla de clientes
**Puntos:** 3 · **Depende de:** TK-02.1, TK-01.2 · **Spec:** specs/05_operator_dashboard.spec.md

Crear la tabla de clientes con indicador activo/inactivo, un formulario modal para crear o editar y la acción de desactivar con confirmación.

**Hecho cuando:**
- Los errores 409 y 422 se muestran junto al campo correspondiente.

### TK-02.3 · [TEST] Pruebas de clientes
**Puntos:** 1 · **Depende de:** TK-02.1 · **Spec:** specs/05_operator_dashboard.spec.md

**Hecho cuando:**
- Hay tests de integración para unicidad, normalización del teléfono y desactivación.
