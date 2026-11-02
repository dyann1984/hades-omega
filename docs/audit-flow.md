# Flujo de auditoría empresarial (Vault real + agentes)

Reutiliza la tubería persistente de misiones multidocumento (`createMultiDocumentMission`): CHARON → MINOS → PERSEPHONE,
decisión de CERBERUS con aprobación humana de un ADMIN, ELYSIUM (informe) y TARTARUS (sello SHA-256). No se añadió ningún
ejecutor nuevo. Encima se agregan tres acciones explícitas en `/api/v1/audit-flow/:id/*` (ADMIN u OPERATOR dueño de la misión):

| Acción | Qué hace realmente | Qué NO hace |
|---|---|---|
| `evidence` | Guarda una sola vez el texto del informe y su SHA-256 (recomputado; rechaza si no coincide con el sello). | No reescribe nunca evidencia ya guardada. |
| `followup` | Crea una tarea CHRONOS diaria (`MISSION_FOLLOWUP`, solo lectura) que re-verifica hash del informe, cadena de auditoría y estado del plan NEAR. | No se ejecuta hasta que el planificador (o «Ejecutar ahora») la corre; la etapa dice «no ejecutado» hasta entonces. |
| `near-audit` | Con firmante y contrato configurados: crea la operación y solicita aprobación (`PENDING_APPROVAL`). Sin ellos: `CONFIGURATION_PENDING`. | Nunca firma ni envía; el envío sigue en la página NEAR con aprobación de un solo uso y CERBERUS. |

`GET /audit-flow/:id` arma las etapas solo con datos persistidos y marca cada una con `executed` (verdadero únicamente si la
acción ocurrió). Orden real de agentes: CHARON → MINOS → PERSEPHONE (el orden del enunciado, PERSEPHONE antes de MINOS,
no coincide con la tubería existente; se conservó la existente).

## Vault

`GET /api/v1/vault/status` (solo ADMIN) consulta en el backend: API, base de datos (ping + cadena de auditoría), WebSocket
(clientes conectados), CERBERUS (reglas y herramientas reales, parada de emergencia), CHRONOS (planificador, tareas,
ejecuciones), NEAR («Configuración pendiente» sin cuenta/contrato) y planificador LLM. `POST /vault/near/probe` hace una
sonda de **solo lectura** a la red. Los ajustes se enumeran con lista cerrada: los secretos solo informan «configurado /
no configurado».

## Verificación

- `scripts/e2e-audit-flow.cjs`: proceso real de la API (build) con BD temporal; 22 comprobaciones; evidencia en
  `docs/evidence-e2e-audit-flow.json`. Ejecutar: `npm run build -w @hades/api && node scripts/e2e-audit-flow.cjs`.
- Pruebas: `vault.test.ts`, `audit-flow.test.ts`, `near/contract-conformance.test.ts`, `VaultPanel.test.tsx`, `AuditFlowPanel.test.tsx`.