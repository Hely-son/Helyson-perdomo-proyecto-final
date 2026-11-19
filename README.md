# MedSupply AI

Plataforma de gestión y venta de insumos médicos para distribuidoras que atienden a clínicas y farmacias.

## 1. Ficha del proyecto

| | |
|---|---|
| **Nombre** | MedSupply AI |
| **Descripción** | Canal de ventas conversacional (simulador de WhatsApp) con validación de stock en tiempo real, y dashboard web para gestionar inventario, pedidos, reclamos y reposición |
| **Tipo** | Proyecto final AIDEVS |
| **Autor** | Helyson Perdomo |
| **Repositorio** | https://github.com/Hely-son/Helyson-perdomo-proyecto-final |
| **Metodología** | Spec-Driven Development (SDD) asistido por Claude Code |

## 2. Descripción general del producto

### Objetivo

Evitar que las distribuidoras vendan insumos sin stock real y agilizar la atención a sus clientes B2B. El sistema valida las existencias durante la conversación, ofrece alternativas cuando no alcanzan y centraliza pedidos, reclamos y alertas de reposición en un solo dashboard.

### Características

- **Validación estricta de stock:** ningún pedido se confirma sin existencias, ni siquiera con compras simultáneas.
- **Clientes B2B pre-registrados:** solo las clínicas y farmacias habilitadas pueden comprar.
- **Bot determinista:** menú guiado, predecible y fácil de probar.
- **Trazabilidad:** productos y clientes no se borran, y cada reclamo queda con su nota de resolución.

### Funcionalidades

| Cliente B2B (chat) | Operador (dashboard) |
|---|---|
| Consultar el catálogo con precios y disponibilidad | Iniciar sesión |
| Armar un carrito de varios productos | Gestionar clientes y productos |
| Ajustar cantidades cuando no hay stock suficiente | Ajustar stock y ver alertas de stock crítico |
| Confirmar el pedido y recibir su número `MED-XXXXX` | Generar y recibir órdenes de reposición |
| Consultar y cancelar pedidos propios | Avanzar y cancelar pedidos |
| Registrar reclamos sobre pedidos entregados | Resolver reclamos |

El detalle normativo (alcance, requisitos con ID, reglas de negocio y criterios de aceptación) está en el [PRD](docs/PRD.md).

## 3. Documentación de la Entrega 1

| Entregable | Documento |
|---|---|
| Ficha y descripción general | Este README · [PRD](docs/PRD.md) |
| Arquitectura del sistema | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Modelo de datos | [specs/01_data_models.spec.md](specs/01_data_models.spec.md) |
| Historias de usuario y tickets | [backlog/](backlog/README.md): 7 historias, 35 tickets, 91 puntos |
| Stack tecnológico | [docs/ARCHITECTURE.md § Stack](docs/ARCHITECTURE.md#stack-tecnológico) |
| Guía del agente (SDD) | [CLAUDE.md](CLAUDE.md) |
| Registro de prompts | [PROMPTS.md](PROMPTS.md) |

## 4. Estado

**Entrega 1 — Documentación técnica.** Todavía no hay código. Siguiente paso: completar las specs 02 a 05 e implementar el backlog en orden.
