# CERBERUS — catálogo estable de códigos de decisión (C-7)

Fuente única: `packages/core/src/cerberus/decision-codes.ts` (`GATE_CODES`, `GUARD_CODES`, `DECISION_CODES`).
Los **códigos** son contrato público: no se renombran ni reutilizan. Los textos `reason` pueden cambiar.
Consulta en vivo (cualquier rol autenticado): `GET /api/v1/cerberus/gate/codes`.
Los registros de decisiones (`/cerberus/gate/decisions`) siguen siendo sólo ADMIN porque contienen texto dinámico.

## Gate de herramientas
`OK`, `UNKNOWN_TOOL`, `INVALID_PARAMS`, `EMERGENCY_STOP`, `EGRESS_NOT_AUTHORIZED`, `AGENT_NOT_PERMITTED`, `ROLE_NOT_PERMITTED`,
`INVALID_AMOUNT`, `AMOUNT_LIMIT`, `RECIPIENT_NOT_ALLOWED`, `BUDGET_EXCEEDED`, `APPROVAL_REQUIRED`, `APPROVAL_PENDING`,
`APPROVAL_NOT_FOUND`, `APPROVAL_REJECTED`, `APPROVAL_EXPIRED`, `APPROVAL_REUSED`, `PARAMS_ALTERED`, `POLICY_CHANGED`,
`GATE_INTERNAL_ERROR` (fail-secure: cualquier excepción durante la evaluación es DENY y se audita).

## Guard de políticas (`GUARDDecision.reasonCode`)
`POLICY_PERMITTED`, `POLICY_AMOUNT_LIMIT`, `POLICY_AMOUNT_ESCALATION`, `POLICY_VENDOR_NOT_ALLOWED`, `POLICY_BUDGET_EXCEEDED`,
`POLICY_AGENT_NOT_PERMITTED`, `POLICY_INVALID_AMOUNT`, `POLICY_APPROVAL_REQUIRED`, `POLICY_TOOL_NOT_AUTHORIZED`,
`POLICY_HIDDEN_EFFECT`, `POLICY_DEFAULT_DENY`, `POLICY_CUSTOM_RULE`, `GUARD_INTERNAL_ERROR`, `GUARD_POLICY_STALE`.

## Garantías verificadas por pruebas
- Una prueba fija la lista de códigos (`fail-secure.test.ts`) y otra comprueba que todo literal `deny('…')` del gate está en el catálogo.
- El guard ordena reglas por prioridad, luego DENY > ESCALATE > PERMIT, luego id (orden total, independiente del orden del arreglo).
- Las respuestas HTTP de denegación exponen el código y una descripción genérica, nunca texto dinámico ni detalle interno.
