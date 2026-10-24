# HADES OMEGA

**Enterprise AI Agent Operating System**
NEAR Hackathon 2026 — Submission

---

## Propuesta de valor

HADES OMEGA es un sistema operativo empresarial donde agentes de inteligencia artificial autónomos colaboran para ejecutar misiones de negocio complejas: evaluar proveedores, administrar presupuestos, validar operaciones y registrar decisiones de forma verificable en NEAR Blockchain.

No es un chatbot ni un asistente. Es una plataforma donde cada agente tiene un dominio de responsabilidad, opera bajo políticas deterministas y cada acción relevante queda registrada on-chain, auditable por humanos en tiempo real.

---

## El problema

Las organizaciones modernas toman miles de decisiones operativas por día: aprobaciones de compra, validaciones presupuestarias, selección de proveedores, asignación de recursos. Estos procesos son lentos, propensos a errores, difícilmente auditables y casi imposibles de automatizar sin perder control.

Los LLMs actuales pueden razonar sobre estos problemas, pero no garantizan cumplimiento de políticas, no generan registros verificables y no tienen mecanismos de control cuando algo sale mal.

---

## La solución

HADES OMEGA introduce un **sistema operativo de agentes** con:

- **6 agentes especializados** que colaboran bajo un orquestador central
- **Motor CERBERUS** con control preventivo, auditoría y respuesta a incidentes
- **Registro verificable en NEAR Testnet** para cada decisión crítica
- **Dashboard empresarial** con núcleo holográfico y panel de seguridad en tiempo real

---

## Agentes del sistema

| Agente | Dominio |
|--------|---------|
| HADES | Orquestador central — descompone misiones en tareas |
| CHARON | Compras, evaluación de proveedores, negociación |
| PERSEPHONE | Finanzas, control presupuestario, alertas de desvío |
| MINOS | Validación de operaciones, autorización humana |
| ELYSIUM | Planificación y optimización de recursos |
| TARTARUS | Detección de anomalías, respuesta a incidentes |

---

## Motor de seguridad CERBERUS

```
GUARD    →  Evalúa cada operación contra políticas codificadas (PERMIT / DENY / ESCALATE)
AUDIT    →  Genera registro firmado con hash → almacenado en NEAR Testnet
RESPONSE →  Ejecuta acción predefinida: WARN / BLOCK / QUARANTINE / SHUTDOWN
```

El cumplimiento de políticas es **código determinista**, no inferencia de LLM.

---

## Integración NEAR

- Cuenta: `hades-omega.testnet` (creada durante desarrollo)
- Contrato de auditoría: recibe y almacena hashes de registros CERBERUS
- Cada decisión crítica produce una transacción verificable en `testnet.nearblocks.io`
- Las claves privadas nunca aparecen en el código fuente

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Agentes | TypeScript + LangChain / custom agent loop |
| Motor CERBERUS | TypeScript — lógica determinista, sin LLM |
| Contratos NEAR | Rust + NEAR SDK |
| Backend API | Node.js / Fastify |
| Frontend | React + Vite + TailwindCSS + React Three Fiber (R3F) |
| Comunicación | WebSocket (estado en tiempo real) |
| Base de datos | SQLite (dev) / PostgreSQL (prod) |

---

## Identidad visual

- **Negro obsidiana** `#0A0A0F` — fondo base
- **Azul eléctrico** `#00D4FF` — elementos activos, conexiones
- **Dorado** `#FFD700` — alertas, estados críticos, identidad HADES
- Núcleo holográfico animado, red de agentes, animaciones optimizadas
- Modo oscuro (default) y modo claro disponibles

---

## Documentación

| Archivo | Contenido |
|---------|-----------|
| `docs/01-architecture.md` | Arquitectura técnica y decisiones de diseño |
| `docs/02-agents-design.md` | Especificación funcional de los 6 agentes |
| `docs/03-cerberus-spec.md` | Motor CERBERUS — diseño completo |
| `docs/04-near-integration.md` | Integración NEAR Testnet |
| `docs/05-security-threats.md` | Modelo de amenazas y controles |
| `docs/06-api-contracts.md` | Interfaces y contratos de datos |
| `docs/07-frontend-design.md` | Sistema de diseño y wireframes |
| `docs/08-test-plan.md` | Plan de pruebas y criterios de aceptación |
| `docs/09-backlog.md` | Backlog P0/P1/P2 con dependencias |
| `docs/10-demo-script.md` | Guion de demostración para jueces |

---

## Cronograma

**Período de desarrollo:** 1–14 de noviembre de 2026
**Cierre de entrega:** 14 de noviembre 2026, 23:59 UTC

| Días | Fase |
|------|------|
| 1–2 | Fundamentos y scaffolding |
| 3–5 | Agentes core (HADES, CHARON, PERSEPHONE) |
| 6–8 | CERBERUS + integración NEAR |
| 9–10 | Agentes secundarios (ELYSIUM, TARTARUS, MINOS) |
| 11–12 | Frontend completo |
| 13 | Integración E2E |
| 14 | Demo, pulido, entrega |

---

*HADES OMEGA — Where autonomous agents meet enterprise accountability.*
