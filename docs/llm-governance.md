# Uso de IA generativa (Anthropic) — controles

HADES funciona **sin IA generativa**. Los agentes CHARON, MINOS, PERSEPHONE, ELYSIUM y TARTARUS ejecutan adaptadores
deterministas por reglas (importes, porcentajes, plazos, hash SHA-256). La única salida de red hacia un proveedor de IA es el
planificador de misiones (`packages/api/src/planner/ClaudeAnthropicPlanner.ts`), que solo se usa en `POST /api/v1/missions`.
El flujo de Auditoría y el pipeline multi-documento **nunca** lo invocan.

## Qué lo controla (`packages/api/src/llm-governor.ts`)

Cada llamada atraviesa, en este orden, y cualquier fallo devuelve el planificador determinista (nunca un error al usuario):

1. **Autorización explícita del operador**: `HADES_LLM_ENABLED=true` en el servidor. Por defecto está apagado, aunque exista
   `ANTHROPIC_API_KEY`. No se puede activar desde la interfaz.
2. **Clave presente** en el entorno del servidor (el navegador nunca la recibe; el Vault solo dice "configurada").
3. **Minimización**: solo viajan título (200 car.), descripción (500 car.) y prioridad. No se envían presupuesto, etiquetas,
   organización ni historial. Antes de enviar se tachan claves (`sk-…`, `ed25519:…`, claves privadas PEM), correos, hashes
   largos, cuentas `.near`/`.testnet` y secuencias largas de dígitos; tope total `HADES_LLM_MAX_INPUT_CHARS` (1200 por defecto).
4. **Tope diario** `HADES_LLM_DAILY_LIMIT` (20 por defecto), contado sobre las decisiones PERMIT persistidas de CERBERUS.
5. **Puerta de CERBERUS**: herramienta `llm.plan` (agente HADES, rol SYSTEM, solo parámetros `model`, `promptSha256`, `chars`).
   La parada de emergencia la bloquea. El permiso es de un solo uso (`consumeGrant`).
6. **Límites del cliente**: salida máx. 1500 tokens, timeout 20 s, sin reintentos.

## Registro

Cada decisión queda en `cerberus_decisions` y en la cadena de auditoría con hash (`LLM_CALL`, `LLM_CALL_DENIED`):
modelo, tamaños, número de redacciones y resultado. **Nunca** se guarda el prompt ni la respuesta, solo el SHA-256 del prompt.

## Cómo se distingue lo determinista de lo generado por IA

* Cada tarea lleva `origin`: `RULE_BASED` o `LLM_GENERATED`. Un plan de IA se marca así y sus advertencias lo indican.
* Cada etapa del flujo de Auditoría lleva `decidedBy` (`HUMAN`, `DETERMINISTIC_RULES`, `RULES_AND_HUMAN`) y la respuesta
  incluye `generativeAi: false`. La interfaz lo muestra junto a cada etapa.

## Decisión de diseño que conviene conocer

`llm.plan` está clasificada como efecto `WRITE`, no `EXTERNAL`: no exige una aprobación humana por llamada (bloquearía la
creación de misiones). La autorización es la activación explícita del operador más el tope diario. Si se prefiere
aprobación por llamada, basta cambiar su clase a `EXTERNAL` en `packages/core/src/cerberus/tools.ts` (el planificador ya
cae al modo determinista cuando la puerta responde ESCALATE).

## Garantías verificadas por pruebas

`llm-governor.test.ts` (apagado por defecto; fail-closed sin gobernador; minimización; registro solo por hash; tope diario;
parada de emergencia; error del proveedor sin filtrar la clave) y `egress-guard.test.ts` (el SDK solo lo importa el planificador y
va precedido de `governor.request`; los clientes NEAR RPC están en módulos conocidos; ningún `fetch`/socket/proceso hijo;
`payment.execute` no tiene ejecutor).
