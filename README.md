# MedSupply AI

Plataforma de gestión y venta de insumos médicos para distribuidoras que atienden a clínicas y farmacias.

## 1. Ficha del proyecto

| | |
|---|---|
| **Nombre** | MedSupply AI |
| **Descripción** | Canal de ventas conversacional (simulador de WhatsApp) con validación de stock en tiempo real, y dashboard web para gestionar productos, stock, alertas y pedidos |
| **Tipo** | Proyecto final AIDEVS |
| **Autor** | Helyson Perdomo |
| **Repositorio** | https://github.com/Hely-son/Helyson-perdomo-proyecto-final |
| **Metodología** | Spec-Driven Development (SDD) asistido por Claude Code |

## 2. Descripción general del producto

### Objetivo

Evitar que las distribuidoras vendan insumos sin stock real y agilizar la atención a sus clientes B2B. El sistema valida las existencias durante la conversación, confirma los pedidos de forma segura aunque haya compras simultáneas y centraliza pedidos y alertas de stock en un dashboard.

### Características

- **Validación estricta de stock:** ningún pedido se confirma sin existencias, ni siquiera con compras simultáneas. La confirmación es atómica y vuelve a validar stock, disponibilidad y precio de cada producto.
- **Clientes B2B pre-registrados:** solo las clínicas y farmacias habilitadas pueden comprar, identificadas por su teléfono.
- **Bot determinista:** menú guiado, predecible y fácil de probar.
- **Trazabilidad:** productos y clientes no se borran, y cada pedido conserva el precio con el que se confirmó.

### Alcance del MVP

| Cliente B2B (chat) | Operador (dashboard) |
|---|---|
| Consultar el catálogo con precios y disponibilidad | Iniciar sesión |
| Armar un carrito de varios productos | Gestionar productos y ajustar su stock |
| Ajustar cantidades cuando no hay stock suficiente | Consultar alertas de stock crítico |
| Confirmar el pedido y recibir su número `MED-XXXXX` | Consultar pedidos, avanzar su estado y cancelarlos |
| Consultar el estado de sus pedidos | |

En el MVP los clientes se cargan por seed.

### Fuera del MVP (V2)

Documentado en el PRD, pero no se implementa en esta entrega:

- Gestión de clientes desde el dashboard.
- Cancelación de pedidos por el cliente desde el chat.
- Reclamos: registro por chat y resolución por el operador.
- Órdenes de reposición y su recepción.

El detalle normativo (alcance por fase, requisitos con ID, reglas de negocio, requisitos no funcionales y criterios de aceptación) está en el [PRD](docs/PRD.md).

## 3. Arquitectura tecnológica

Monolito modular cliente-servidor: una SPA React con el simulador de chat y el dashboard, y una API REST en Express sobre PostgreSQL.

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite, Ant Design, React Router |
| Backend | Node.js + Express + TypeScript, Zod |
| Datos | Prisma + PostgreSQL 16 en desarrollo, pruebas, CI y entrega |
| Autenticación | JWT + bcrypt |
| Contrato API | OpenAPI (`docs/openapi.yaml`) |
| Testing | Jest + Supertest (contra PostgreSQL real) · Playwright |
| Entorno y entrega | Docker Compose |
| CI | GitHub Actions |

Detalle y justificación en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 4. Documentación

| Entregable | Documento |
|---|---|
| Ficha y descripción general | Este README · [PRD](docs/PRD.md) |
| Requisitos, reglas y criterios (v1.2) | [docs/PRD.md](docs/PRD.md) |
| Arquitectura del sistema y stack | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Modelo de datos (diagrama ER con PK y FK) | [specs/01_data_models.spec.md](specs/01_data_models.spec.md) |
| Specs por módulo | `specs/02` a `specs/05` (pendientes) |
| Contrato de la API | `docs/openapi.yaml` (pendiente) |
| Historias de usuario y tickets | [backlog/](backlog/README.md): 7 historias y 41 tickets. MVP: 30 tickets, 94 puntos. V2: 11 tickets, 27 puntos |
| Guía del agente (SDD) | [CLAUDE.md](CLAUDE.md) |
| Registro de prompts y evidencia de IA | [PROMPTS.md](PROMPTS.md) |

## 5. Estado

**Entrega 2 — Documentación y diseño.** Todavía no hay código: no existen `backend/`, `frontend/`, `docker-compose.yml` ni el pipeline de CI. El PRD v1.2 está aprobado; la arquitectura, el modelo de datos y el backlog están alineados con él. Siguientes pasos: crear `docs/openapi.yaml`, completar las specs 02 a 05 e implementar el backlog `MVP` en orden.
