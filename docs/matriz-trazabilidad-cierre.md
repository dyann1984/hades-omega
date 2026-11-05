# Matriz de trazabilidad del cierre funcional

Estado observado el 2026-11-05. La matriz distingue las verificaciones ejecutadas de los criterios aún no satisfechos.

| Requisito | Implementación | Prueba y resultado | Evidencia | Limitaciones |
|---|---|---|---|---|
| Cifrado persistente y acceso ADMIN de Vault | `packages/api/src/secret-vault.ts`, `routes/vault.ts` | `secret-vault.test.ts` y signer-loader: 13 aprobadas; suite LLM/Vault: 33 aprobadas | SQLite temporal, reinicio, clave incorrecta, alteración y control HTTP | Falta procedimiento operativo de rotación y coordinación entre instancias |
| Rotación y coordinación | `secret-vault.ts` | Misma suite: bloqueo SQLite y rechazo de instancia con clave anterior | Dos conexiones a la misma base temporal; rotación bajo bloqueo devuelve error y no cambia el registro | Falta procedimiento operativo completo, coordinación de instancias y recuperación de clave externa |
| Parada y revocación | `cerberus-gate.ts` | Suite focalizada anterior: 78 aprobadas | Pruebas de permiso y aprobación revocados, con NEAR de prueba | Las rutas alternativas y la cancelación de trabajos activos no están cubiertas integralmente |
| Agentes | `capability-dispatcher.ts`, `packages/core/src/agents` | Regresión previa sin caché | El despachador rechaza capacidades no implementadas | Falta inventario completo y validación extremo a extremo por capacidad |
| CHRONOS concurrencia y recuperación | `packages/api/src/chronos/chronos.ts` | `chronos/chronos.test.ts`: 13 aprobadas | SQLite temporal, dos conexiones, reclamo condicional, reintentos y reinicio | Recuperación concurrente de trabajos RUNNING y exclusión entre procesos no demostradas |
| Frontend escritorio y móvil | `e2e/` | Ejecución previa: 22 aprobadas, 2 omitidas | Playwright con API local y base temporal | No cubre todos los controles |
| NEAR y LLM | `near/signer.ts`, `server.ts`, `llm-governor.ts`, `planner/ClaudeAnthropicPlanner.ts` | Vault y signer: 13 aprobadas; LLM, egreso y Vault: 33 aprobadas | Firmante sintético recuperado desde Vault tras reinicio; LLM con cliente falso y política explícita | No hay verificación on-chain actual ni llamada real al proveedor |
| Regresión de proyecto | `package.json`, `turbo.json` | Ejecución previa: 402 aprobadas, 3 omitidas; build, tipos y lint correctos con advertencias | `npx turbo run test type-check lint build --force --concurrency=1` | Es anterior a los cambios recientes de Vault, consumidores y CHRONOS |
