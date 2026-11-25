# US-01 · Acceso del operador

| Fase | Requisitos | Criterios PRD | Puntos | Depende de |
|---|---|---|---|---|
| `MVP` | AU-01, AU-02, AU-03, RNF-08 | CA-11 | 9 | Habilitadores |

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
**Fase:** `MVP` · **Puntos:** 5 (reestimado de 3 en la puerta 1) · **Depende de:** TK-00.3, TK-00.5 · **Spec:** specs/05_operator_dashboard.spec.md

Crear `POST /auth/login` (bcrypt + JWT con la expiración de `JWT_EXPIRES_IN`, por defecto `8h`) y el middleware que protege todas las rutas de operador.

**Hecho cuando:**
- Un login válido devuelve el token. Uno inválido devuelve 401 con código `INVALID_CREDENTIALS`.
- Las rutas de operador responden 401 sin token, con token inválido o con token expirado (AU-03).
- Las rutas `/chat/*`, `/auth/login` y `/health` siguen siendo públicas.
- El costo de bcrypt es el predeterminado de la biblioteca, declarado explícitamente en una constante del módulo `auth` (spec 05 §15.3, DP-08).
- Ni la contraseña ni su hash aparecen en logs ni en respuestas HTTP, en un login correcto ni en uno fallido; se verifica con ESC-51 (spec 05 §12.2, DP-08).
- Los tests de integración de login válido, login inválido y los tres casos de 401 pasan. El caso expirado usa una expiración corta configurada en el test.

### TK-01.2 · [UI] Pantalla de login y rutas protegidas
**Fase:** `MVP` · **Puntos:** 3 · **Depende de:** TK-01.1, TK-00.2 · **Spec:** specs/05_operator_dashboard.spec.md

Crear el formulario de login, guardar el token, proteger `/dashboard/*` y agregar el botón de logout.

**Hecho cuando:**
- Las respuestas 401 se distinguen por el `code` del error, no solo por el status (spec 05 §15.6, D-07):
  - `UNAUTHORIZED` en una operación protegida, incluida la de un token expirado: descarta el JWT de memoria y de `localStorage`, limpia el estado autenticado y redirige a `/login`;
  - `INVALID_CREDENTIALS` al iniciar sesión: muestra el mensaje genérico de credenciales incorrectas en el formulario, sin cierre global de sesión ni redirección.
- No hay un interceptor que cierre la sesión ante cualquier 401 sin inspeccionar el `code` (spec 05 ESC-37, ESC-39).
- Tras el login se navega a `/dashboard`.
- Expiración local del JWT (spec 05 §15.4, DP-05): se compara `expiresAt` con la hora actual al navegar a una ruta protegida y antes de cada petición protegida. Si venció, no se envía la petición, se elimina el token de memoria y de `localStorage`, se limpia el estado autenticado, se redirige a `/login` y se informa que la sesión expiró. El backend sigue siendo la autoridad sobre la validez del JWT (spec 05 ESC-46, ESC-47).
- Acceso a `/login` (spec 05 §16.3, DP-06): con sesión válida redirige a `/dashboard`; sin token muestra el formulario; con token vencido lo limpia y muestra el formulario. Sin bucles de redirección (spec 05 §16.2, ESC-48).
- Rutas desconocidas (spec 05 §16.2, DP-07): con sesión válida redirigen a `/dashboard` y sin ella a `/login`; las rutas `V2` se tratan como desconocidas. No hay pantalla de "no encontrado" ni rutas `V2` (spec 05 ESC-49).
- El layout autenticado muestra `operator.name`, devuelto por `login`, junto a Cerrar sesión, sin llamadas ni campos adicionales (spec 05 §16.2, DP-09, ESC-50).
- Cerrar sesión descarta el token y el estado autenticado en el cliente; no hay endpoint de logout ni revocación del JWT (spec 05 §15.8, ESC-38).

### TK-01.3 · [TEST] E2E de acceso
**Fase:** `MVP` · **Puntos:** 1 · **Depende de:** TK-01.2, TK-00.4 · **Spec:** specs/05_operator_dashboard.spec.md

**Hecho cuando:**
- El E2E de CA-11 pasa en sus dos casos: sin sesión y con sesión expirada.
