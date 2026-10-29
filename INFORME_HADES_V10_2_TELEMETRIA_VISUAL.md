# HADES V10.2 — auditoría y avance de telemetría visual

Fecha: 29 de octubre de 2026. **Estado: incompleto; criterio de éxito no demostrado.**

## Seguridad y alcance

Rama local `codex/hades-v10-2-telemetria`, creada desde `codex/hades-premium-v10` en `e5e0b06`. `main`, `develop`, los respaldos y archivos preexistentes sin seguimiento no se integraron ni eliminaron. No hay despliegue, fusión ni gasto externo. Los cambios de esta entrega están sin commit.

## Inventario verificable

| Fuente | Productor y transporte | Persistencia y límite |
|---|---|---|
| `AGENT_STATUS_CHANGED` | `AgentBase.setStatus`, bus y WebSocket | En memoria; `missionId` puede faltar. En la implementación actual solo llega a ADMIN. Se comparte entre HADES, CHARON, PERSEPHONE, MINOS, ELYSIUM y TARTARUS cuando usan `AgentBase`. |
| `MISSION_PROGRESS`, `TASK_UPDATED` | Orquestador HADES y rutas locales; bus y WebSocket | Se filtran por propietario o ADMIN cuando se encuentra la misión. El flujo local publica instantáneas después de completar la operación, no las transiciones en vivo. La ruta general guarda la misión después de ejecutarla, por lo que sus eventos previos pueden carecer de una misión persistida para autorizar al propietario. |
| `CERBERUS_DECISION` | `AgentBase.proposeOperation`, bus y WebSocket | Auditoría en memoria y evidencia SQLite según ruta; WebSocket solo ADMIN. CERBERUS es un servicio transversal. |
| `ESCALATION_CREATED` | MINOS, bus y WebSocket | En memoria; WebSocket solo ADMIN. |
| `NEAR_TX_CONFIRMED` | `AgentBase`, solo para una respuesta de modo real; WebSocket solo ADMIN | El puente real lanza una excepción por no estar implementado; la simulación genera identificadores `DEMO-`, sin confirmación de cadena. `GET /near/status` expone modo y conexión, pero `connected` es actualmente siempre falso. |
| `LOCAL_EXECUTION_STATE` | Repositorio SQLite; `GET /local-missions/:id/history` | `CREATED`, `WAITING_APPROVAL`, decisión y estados posteriores; historia autorizada por propietario o ADMIN. No es un flujo WebSocket ni identifica las transiciones de cada agente. |
| `audit_events` | SQLite | Eventos persistidos de misión, auditoría, sesión y otros; no constituye una secuencia completa de actividad de agentes. |

El WebSocket exige JWT mediante mensaje `AUTH`, valida sesión y roles y revoca sockets. No ofrece secuencia persistente, deduplicación ni replay. El cliente solicita actualización de misiones al conectarse; esto no equivale a recuperación completa de eventos. Al cerrar sesión se limpia el estado privado existente.

## Correspondencia solicitada

| Evento objetivo | Evidencia disponible | Reacción segura / estado |
|---|---|---|
| `agent.started`, `agent.completed`, `agent.failed` | Hay estados y tareas, pero no eventos canónicos persistidos con secuencia; la instantánea local no demuestra inicio en vivo. | NO IMPLEMENTADOS como telemetría verificable completa. |
| `budget.alert`, `vendor.scored` | No se encontró productor canónico trazable en el bus para estas transiciones. | NO IMPLEMENTADOS. |
| `approval.requested`, `approval.granted`, `approval.denied` | `LOCAL_EXECUTION_STATE` registra espera, `APPROVED` y `REJECTED` en SQLite. | Historia comprobable, no pulso en vivo implementado. |
| `cerberus.blocked`, `cerberus.escalated` | `CERBERUS_DECISION` puede contener `DENY`/`ESCALATE`; acceso WS solo ADMIN. | Disponible como decisión, sin efecto temporal correlacionado implementado. |
| `near.tx.created`, `near.tx.confirmed` | Confirmación declarada en el bus pero ruta real no implementada; demo no confirma cadena. | NO IMPLEMENTADOS como transacciones reales verificadas. |

Mapeo previsto, aún no completo: `IDLE` azul estable; `PLANNING` y `RUNNING` azul solo con estado confirmado; `WAITING_APPROVAL` ámbar desde espera persistida; `COMPLETED` dorado y `FAILED` rojo solo para transición reciente y correlacionada; desconexión o estado desconocido neutral. No debe atribuirse un pulso de comunicación a una línea o a una instantánea histórica.

## Hallazgo que impide la demostración E2E solicitada

`createMultiDocumentMission` construye tareas ya `EXECUTED` y discrepancias prefijadas; `decideLocalOperation` incluye cifras y conclusiones prefijadas en el informe y genera resultados deterministas para tareas posteriores. Los resultados se etiquetan `simulated: false`, pero no prueban que los agentes indicados hayan realizado esas comparaciones, evaluación de seguridad o custodia. La ruta no aporta transiciones verificables por agente para la secuencia solicitada. Corregirlo exige trabajo de lógica empresarial e instrumentación, fuera de la prohibición de alterar dicha lógica. No se declara demostrada una misión real de tres documentos, rechazo ni error visual.

## Cambios realizados

- Se eliminó del Dashboard el temporizador que asignaba actividad y progreso ficticios a agentes y se sustituyó por espera de respuesta.
- El núcleo ya no convierte rechazos históricos en alerta roja permanente ni genera un pulso por el mero aumento de transacciones históricas. Las líneas no se activan por un estado de agente.
- Se solicita refresco de misiones tras la conexión o reconexión WebSocket; no hay replay ni reconciliación integral.
- Se mejora el contraste de navegación y se elimina la afirmación incondicional de NEAR TESTNET / modo demo de la cabecera.
- Eventos añadidos: ninguno. No se han añadido productores ni se han completado nodos NEAR, conexiones reactivas o estados visuales solicitados.

## Validación y evidencia pendientes

- `npm run type-check --workspace=@hades/frontend`: aprobado. `git diff --check`: aprobado.
- Tres suites de API (`websocket`, revocación de sesión y fase 8): 7 pruebas aprobadas al ejecutarlas fuera del aislamiento; este bloqueó inicialmente las conexiones locales. Cubren los contratos existentes, no una secuencia visual completa. Compilación y E2E visual no ejecutados.
- FPS: no medidos. Edge con GPU Intel, carga CPU/GPU, móvil, WCAG AA y movimiento reducido: no verificados en esta sesión.
- Capturas de agentes activos, aprobación, bloqueo y comparación antes/después: no obtenidas; no se sustituyen por imágenes de simulación.
- Riesgos: ausencia de secuencia y replay, asociación insuficiente de eventos con propietario/misión, instantáneas históricas, estado de agentes compartido, NEAR real no implementado, contenido multidocumento prefijado y cobertura visual incompleta. Requiere instrumentación transaccional autorizada, pruebas de aislamiento entre usuarios y una ejecución con datos reales antes de declarar éxito.
