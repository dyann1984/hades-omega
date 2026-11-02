# Uso de IA generativa (Anthropic) — política de egreso autorizado

HADES funciona **sin IA generativa**. Los agentes CHARON, MINOS, PERSEPHONE, ELYSIUM y TARTARUS ejecutan adaptadores
deterministas por reglas (importes, porcentajes, plazos, hash SHA-256). La única salida de datos hacia un proveedor de IA es el
planificador de misiones (`packages/api/src/planner/ClaudeAnthropicPlanner.ts`), usado solo por `POST /api/v1/missions`.
El flujo de Auditoría y el pipeline multi-documento **nunca** lo invocan.

## Clasificación

`llm.plan` es de clase **`EGRESS`**: ni escritura interna (`WRITE`) ni acción sensible con aprobación por llamada
(`EXTERNAL`). La puerta de CERBERUS la **deniega por sí misma** (`EGRESS_NOT_AUTHORIZED`) mientras no exista una política activa,
de modo que saltarse al gobernador tampoco permite enviar datos.

## Política (solo administrador)

Almacenada en la base de datos (`llm_policy`), **desactivada por defecto**. Ninguna variable de entorno la activa.
`GET/POST /api/v1/vault/llm-policy` (solo ADMIN; cada cambio queda en la cadena de auditoría como `LLM_POLICY_CHANGED`).
Se gestiona desde Vault → Conexiones → Planificador LLM. No se puede activar durante la parada de emergencia.

| Ajuste | Por defecto | Rango |
|---|---|---|
| `dailyLimit` (cuota diaria de llamadas) | 20 | 1–1000 |
| `maxInputTokens` | 400 | 50–4000 |
| `maxOutputTokens` | 1500 | 50–4000 |
| `dailyCostCapUsd` (tope diario **estimado**) | 1 | 0.01–100 |
| `inputUsdPerMTok` / `outputUsdPerMTok` (precios **estimados**, configurables) | 1 / 5 | 0–1000 |

El costo es una **estimación conservadora** (reserva el peor caso: todos los tokens de salida; ~3 caracteres por token). No es
facturación real: los precios los fija el administrador y deben contrastarse con la tarifa vigente del proveedor.

## Cada llamada, en orden

1. Política habilitada. 2. Clave en el servidor (el navegador nunca la recibe). 3. **Proveedor permitido**: el cliente apunta
fijo a `https://api.anthropic.com`; si `ANTHROPIC_BASE_URL` apunta a otro host, esquema o con credenciales, se bloquea.
4. **Minimización**: solo título, descripción y prioridad (sin presupuesto, etiquetas, organización ni historial), con
claves, correos, hashes, cuentas NEAR, URLs con credenciales, RFC y números largos tachados, y recorte a `maxInputTokens`.
5. Cuota diaria. 6. Costo estimado diario. 7. Puerta de CERBERUS (agente HADES, parámetros solo hash/tamaños y
`provider=api.anthropic.com`; parada de emergencia). 8. Permiso de un solo uso. Cualquier fallo devuelve el planificador
determinista; nunca un error al usuario. Salida limitada por `max_tokens`, timeout 20 s, sin reintentos.

## Registro

`cerberus_decisions` + cadena de auditoría (`LLM_CALL`, `LLM_CALL_DENIED`, `LLM_POLICY_CHANGED`) + libro `llm_usage`:
proveedor, modelo, tamaños, redacciones, costo estimado y resultado. **Nunca** el prompt ni la respuesta; solo el SHA-256 del prompt.

## Lo determinista frente a lo generado por IA

Cada tarea lleva `origin` (`RULE_BASED` / `LLM_GENERATED`). Cada etapa de Auditoría lleva `decidedBy` y la respuesta incluye
`generativeAi: false`. La interfaz lo muestra.

## Verificado por pruebas (`llm-governor.test.ts`, `egress-guard.test.ts`, E2E)

Apagado por defecto (ni siquiera `HADES_LLM_ENABLED=true` en el entorno lo activa); fail-closed sin gobernador; la puerta
deniega sin política aunque se evite al gobernador; parámetros con texto libre, proveedor ajeno, agente o rol indebido
rechazados; minimización; límite de tokens; cuota; tope de costo; proveedor permitido; parada de emergencia; error del
proveedor sin filtrar la clave; solo ADMIN cambia la política; sonda NEAR por `near.probe`. Mutaciones comprobadas.
Todas las entradas de prueba son sintéticas: no se usa información personal real.
