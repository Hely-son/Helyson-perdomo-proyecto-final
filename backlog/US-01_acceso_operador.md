# US-01 · Acceso del operador

| Requisitos | Criterios PRD | Puntos | Depende de |
|---|---|---|---|
| AU-01, AU-02 | CA-11 | 7 | Habilitadores |

## Historia

**Como** operador de la distribuidora,
**quiero** iniciar sesión en el dashboard con mi email y contraseña,
**para** que solo personal autorizado pueda gestionar la operación.

## Criterios de aceptación

1. **Dado** un operador creado por seed, **cuando** ingresa credenciales válidas, **entonces** entra al dashboard.
2. **Dado** un email inexistente o una contraseña incorrecta, **cuando** intenta entrar, **entonces** ve un único mensaje genérico, sin indicar cuál dato falló.
3. **Dado** que no hay sesión o el token expiró, **cuando** accede a una ruta del dashboard o de la API de operador, **entonces** se le redirige a login o recibe 401 (CA-11).
4. **Dado** un operador con sesión, **cuando** cierra sesión, **entonces** el token se descarta y vuelve a login.

## Tickets

### TK-01.1 · [API] Login y middleware JWT
**Puntos:** 3 · **Depende de:** TK-00.3 · **Spec:** specs/05_operator_dashboard.spec.md

Crear `POST /auth/login` (bcrypt + JWT con expiración) y el middleware que protege todas las rutas de operador.

**Hecho cuando:**
- Un login válido devuelve el token. Uno inválido devuelve 401 con código `INVALID_CREDENTIALS`.
- Las rutas de operador responden 401 sin token, con token inválido o con token expirado.
- Las rutas `/chat/*` y `/auth/login` siguen siendo públicas.

### TK-01.2 · [UI] Pantalla de login y rutas protegidas
**Puntos:** 2 · **Depende de:** TK-01.1, TK-00.2 · **Spec:** specs/05_operator_dashboard.spec.md

Crear el formulario de login, guardar el token, proteger `/dashboard/*` y agregar el botón de logout.

**Hecho cuando:**
- Cualquier respuesta 401 limpia el token y redirige a `/login`.
- Tras el login se navega a `/dashboard`.

### TK-01.3 · [TEST] Pruebas de acceso
**Puntos:** 2 · **Depende de:** TK-01.1, TK-01.2 · **Spec:** specs/05_operator_dashboard.spec.md

**Hecho cuando:**
- Hay tests de integración para login válido, login inválido y los tres casos de 401.
- El E2E de CA-11 pasa.
