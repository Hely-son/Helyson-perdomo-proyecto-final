# US-01 · Acceso del operador

| Fase | Requisitos | Criterios PRD | Puntos | Depende de |
|---|---|---|---|---|
| `MVP` | AU-01, AU-02, AU-03, RNF-08 | CA-11 | 6 | Habilitadores |

## Historia

**Como** operador de la distribuidora,
**quiero** iniciar sesión en el dashboard con mi email y contraseña,
**para** que solo personal autorizado pueda gestionar la operación.

## Criterios de aceptación

1. **Dado** un operador creado por seed, **cuando** ingresa credenciales válidas, **entonces** entra al dashboard.
2. **Dado** un email inexistente o una contraseña incorrecta, **cuando** intenta entrar, **entonces** ve un único mensaje genérico, sin indicar cuál dato falló (RNF-08).
3. **Dado** que no hay sesión o el token expiró, **cuando** accede a una ruta del dashboard o de la API de operador, **entonces** se le redirige a login o recibe 401 (CA-11).
4. **Dado** un inicio de sesión, **cuando** pasa el tiempo configurado (8 horas por defecto), **entonces** el token deja de ser válido y debe iniciar sesión de nuevo (AU-03).
5. **Dado** un operador con sesión, **cuando** cierra sesión, **entonces** el token se descarta y vuelve a login.

## Tickets

### TK-01.1 · [API] Login y middleware JWT
**Fase:** `MVP` · **Puntos:** 3 · **Depende de:** TK-00.3, TK-00.5 · **Spec:** specs/05_operator_dashboard.spec.md

Crear `POST /auth/login` (bcrypt + JWT con la expiración de `JWT_EXPIRES_IN`, por defecto `8h`) y el middleware que protege todas las rutas de operador.

**Hecho cuando:**
- Un login válido devuelve el token. Uno inválido devuelve 401 con código `INVALID_CREDENTIALS`.
- Las rutas de operador responden 401 sin token, con token inválido o con token expirado (AU-03).
- Las rutas `/chat/*`, `/auth/login` y `/health` siguen siendo públicas.
- Los tests de integración de login válido, login inválido y los tres casos de 401 pasan. El caso expirado usa una expiración corta configurada en el test.

### TK-01.2 · [UI] Pantalla de login y rutas protegidas
**Fase:** `MVP` · **Puntos:** 2 · **Depende de:** TK-01.1, TK-00.2 · **Spec:** specs/05_operator_dashboard.spec.md

Crear el formulario de login, guardar el token, proteger `/dashboard/*` y agregar el botón de logout.

**Hecho cuando:**
- Cualquier respuesta 401, incluida la de un token expirado, limpia el token y redirige a `/login`.
- Tras el login se navega a `/dashboard`.

### TK-01.3 · [TEST] E2E de acceso
**Fase:** `MVP` · **Puntos:** 1 · **Depende de:** TK-01.2, TK-00.4 · **Spec:** specs/05_operator_dashboard.spec.md

**Hecho cuando:**
- El E2E de CA-11 pasa en sus dos casos: sin sesión y con sesión expirada.
