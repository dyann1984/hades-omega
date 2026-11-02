# Auditoría inicial — HADES OMEGA (2026-11-02)

Estado: **preliminar e incompleta**. Inspección estática de los componentes centrales y línea base; no sustituye revisión completa, pruebas de navegador ni despliegue. Rama: `feat/hades-hackathon-hardening`, basada en `88299a9`.

## Hallazgos

| Severidad | Hallazgo | Evidencia | Acción pendiente |
|---|---|---|---|
| CRÍTICO | La demostración blockchain requerida no existe: el puente genera hashes DEMO y la ruta real lanza una excepción. No hay transacción verificable. | `packages/core/src/near-bridge/index.ts` | Diseñar flujo testnet con firma y aprobación humana; verificarlo sin mover fondos sin autorización. |
| ALTO | README afirma registro real en testnet y transacciones verificables, contrario al puente implementado. | `README.md`, `packages/core/src/near-bridge/index.ts` | Corregir las afirmaciones y documentar límites. |
| ALTO | CHRONOS afirma ejecutar tareas y persistirlas, pero mantiene estado en React; ejecutar ahora solo registra y navega. | `packages/frontend/src/pages/ChronosPanel.tsx` | Implementar planificador real o presentar claramente el prototipo. |
| ALTO | Vault presenta políticas y variables como activas mediante listas constantes, sin consultar configuración; varias descripciones no coinciden con las reglas reales. | `packages/frontend/src/pages/VaultPanel.tsx`, `packages/core/src/cerberus/policy.ts` | Obtener estado verificable o identificarlo como ilustrativo. |
| ALTO | GUARD permite por defecto operaciones sin regla coincidente; la autorización por agente no exige aprobación humana para toda operación financiera. No debe conectarse a ejecución financiera real sin un modelo cerrado y pruebas. | `packages/core/src/cerberus/guard.ts`, `packages/core/src/cerberus/policy.ts` | Definir política de acciones sensibles y límites con validación estricta. |
| MEDIO | `npm run lint` informa éxito con cero tareas ejecutadas; no hay scripts lint en los paquetes. | `package.json`, `packages/*/package.json` | Configurar ESLint y ejecutarlo realmente. |
| MEDIO | El planificador general utiliza plantillas y marca la mayoría como DEMO; el dispatcher implementa capacidades concretas de documentos y SHA-256. No se ha demostrado autonomía general. | `packages/core/src/planning/RuleBasedPlanner.ts`, `packages/api/src/capability-dispatcher.ts` | Delimitar capacidades y probar flujos reales de extremo a extremo. |
| BAJO | El contrato comprueba longitud del hash, pero no que sea hexadecimal. Despliegue y ejecución real no verificados. | `packages/contracts/src/lib.rs` | Validar formato y probar contrato. |

## Evidencia positiva y límites

La API contiene autenticación JWT con sesiones del servidor, límites de tasa, roles, rutas de aprobación, cancelación y eventos persistidos. El flujo local multidocumental dispone de implementaciones deterministas y seguimiento en SQLite. Su seguridad integral, recuperación, aislamiento y ejecución en navegador todavía requieren auditoría y pruebas completas. Las aprobaciones generales registran una decisión sin autorizar ejecución; las aprobaciones de operaciones locales tienen un flujo diferente.

## Concurso

Según https://nearhackathon.com/, AI Swarms y AI Security & Defense podrían ser relevantes, pero no hay evidencia de las categorías elegidas en la inscripción. El sitio indica selección múltiple, repositorio público, demostración pública en X y entrega hasta 14 de noviembre de 2026 23:59 UTC. No se ha consultado ni modificado ninguna inscripción.

## Línea base

- `npm run type-check`: 4 tareas correctas.
- `npm run lint`: cero tareas; no valida código.
- `npm run test`: primer intento bloqueado por EPERM en el temporal de Vitest; repetición con TEMP/TMP en `.test-tmp` en curso al redactar.
- Aún no se han verificado Rust, E2E, accesibilidad, rendimiento, móvil ni testnet.

### Actualización de pruebas

- Con `TEMP` y `TMP` dentro del workspace, núcleo: 7 archivos y 55 pruebas correctas. La suite completa continúa; se observaron fallas en pruebas WebSocket, pendientes de diagnóstico.
- `cargo test --offline`: no pudo iniciarse: `cargo` no se encuentra en PATH.

### Continuación del 2 de noviembre

`origin/main` se actualizó a `701113b` y se integró en la rama sin sobrescribir la guía local. Las cinco pruebas WebSocket pasaron fuera del sandbox con acceso a localhost; en el sandbox fallaban por `EACCES 127.0.0.1`. CERBERUS recibió reglas adicionales para tipos sensibles explícitos; no constituye una frontera completa para nombres arbitrarios de operaciones. La nueva verificación de cuenta NEAR solo consulta RPC y se probó con respuestas simuladas. La escritura real sigue sin implementarse.
