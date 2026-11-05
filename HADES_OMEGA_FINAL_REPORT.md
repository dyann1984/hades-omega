# HADES OMEGA — informe de avance y brechas

Fecha: 2026-11-05. Rama: `codex/hades-omega-finalizacion`, creada desde `6ad144b`. Este informe no certifica el sistema para producción: la auditoría y las fases solicitadas siguen incompletas.

## Inventario y estado

| Módulo | Clasificación | Evidencia y brechas |
|---|---|---|
| CHRONOS | IMPLEMENTADO, PENDIENTE DE VALIDACIÓN | SQLite, tareas, historial, recuperación y reintentos. Se corrigió la ejecución de reintentos durante la pausa; 12 pruebas específicas pasaron. Falta completar regresión integral y revisar concurrencia multiproceso. |
| Motor de agentes y flujo documental | IMPLEMENTADO, PENDIENTE DE VALIDACIÓN | Hay orquestación y capacidades deterministas reales; algunas capacidades registradas no tienen ejecutor. Falta validar integralmente responsabilidades, cancelación y límites. |
| CERBERUS y sesiones | IMPLEMENTADO, PENDIENTE DE VALIDACIÓN | Existen autorización, roles, aprobaciones y auditoría encadenada. La parada documentada bloquea efectos sensibles, no se ha demostrado que detenga todas las operaciones nuevas y tareas cancelables como exige la misión. |
| Vault | PENDIENTE | El módulo existente informa estado y presencia de configuración; no constituye un almacén persistente cifrado de secretos. |
| LLM | BLOQUEADO POR DEPENDENCIA EXTERNA | Planificador Anthropic, política de egreso y límites implementados; falta validación con proveedor real y revisión completa de requisitos. No se utilizaron credenciales ni se efectuaron llamadas de pago. |
| NEAR | BLOQUEADO POR DEPENDENCIA EXTERNA | Código de preparación, autorización y envío existente; los artefactos históricos se conservan. La verificación pública actual no terminó: el RPC no devolvió la transacción esperada y el script falló al acceder a la respuesta. No se firmó ni transmitió ninguna transacción. |
| Frontend | IMPLEMENTADO, PENDIENTE DE VALIDACIÓN | React/Vite y paneles existentes; no se ha comprobado cada control ni completado la revisión de integración. |
| Persistencia | IMPLEMENTADO, PENDIENTE DE VALIDACIÓN | SQLite y migraciones, con opción de instantáneas durables; falta la validación completa de recuperación y despliegue. |

## Cambios y pruebas

### Reanudación tras corte de energía — 2026-11-05

- Se encontró HEAD `dd1f4e2` en `codex/hades-omega-finalizacion`, con árbol Git inicialmente limpio. `d616831` es un antecesor; las carpetas ignoradas de datos y recuperación se conservaron. No se ha demostrado corrupción atribuible al corte.
- Regresión `npx turbo run test --force --concurrency=1` fuera del sandbox: 398 pruebas aprobadas y 3 omitidas; las compilaciones de API, core y frontend pasaron. En el sandbox Vitest falló antes de las pruebas por `EPERM` al renombrar temporales. CHRONOS pasó sus 12 pruebas específicas fuera del sandbox.
- El verificador de atestación informa ahora errores HTTP y JSON-RPC y emite JSON válido también cuando falla. Se comprobó su sintaxis y el manejo de un error RPC inducido localmente. La consulta real no pudo conectarse (`fetch failed`), incluso fuera del sandbox: no hay verificación actual en cadena.
- La regresión de navegador y el flujo integral no se repitieron en esta reanudación. Las brechas y autorizaciones de este informe siguen vigentes; estos resultados no certifican el producto completo.

- CHRONOS ahora mantiene los reintentos pendientes durante la pausa y los ejecuta tras reanudar. Prueba con base SQLite real, pausa y reinicio: `npx vitest run src/chronos/chronos.test.ts`, 12 aprobadas, fuera del sandbox.
- `npm test` y `npm run build` inicialmente devolvieron éxito desde caché de Turbo: no cuentan como ejecución nueva.
- Suite sin caché dentro del sandbox: falló antes de ejecutar pruebas por `EPERM` al renombrar archivos temporales de Vitest. La repetición fuera del sandbox pasó: 398 pruebas aprobadas y 3 omitidas (API 245 + 3 omitidas, core 78, frontend 75).
- `node scripts/e2e-audit-flow.cjs`: el primer intento dentro del sandbox falló esperando el token de inicialización; fuera del sandbox pasaron los 22 controles del flujo local sin firma ni envío.
- Build sin caché fuera del sandbox: 3 paquetes compilados correctamente. Playwright fuera del sandbox: 22 pruebas aprobadas y 2 omitidas.
- `node scripts/verify-attestation-onchain.cjs`: en sandbox falló la conexión; fuera de él no obtuvo la transacción y terminó con error. Los 18 checks no se verificaron en esta ejecución. `docs/evidencia-hades-attest-0001.md`, `docs/evidence-hades-attest-0001.json` y el verificador permanecen sin modificar. La evidencia previa no equivale a una verificación actual.

## Configuración y ejecución local

`npm ci`, `npm run build`, `npm run dev:all`; pruebas `npm test` y `npm run test:e2e`. La API requiere `JWT_SECRET` y `ALLOWED_ORIGIN`; `HADES_DB_FILE` y `HADES_DATA_FILE` controlan la persistencia local. El planificador opcional usa `ANTHROPIC_API_KEY` y `ANTHROPIC_PLANNER_MODEL`. CHRONOS admite `CHRONOS_SCHEDULER`, `CHRONOS_TICK_MS` y `CHRONOS_TICK_SECRET`. NEAR depende de configuración explícita de red, contrato, firmante y habilitación; consultar `.env.example` y los runbooks antes de activarlo. Nunca poner valores secretos en Git o frontend. La documentación de variables debe revisarse contra el código antes de producción.

## Limitaciones y autorización

Faltan el almacén cifrado, la parada y cancelación completas, cobertura funcional de capacidades y controles, validación LLM, E2E, pruebas de seguridad y verificación pública actual. No se ha auditado todo el repositorio ni se ha demostrado que no existan fallos críticos. Producción no está preparada ni modificada. Cualquier uso de credenciales NEAR, firma, envío, despliegue o publicación requiere autorización explícita del usuario. La validación real del LLM requiere proveedor, credenciales y autorización de egreso.

## Commits

La rama conserva los commits existentes. Véase `git log` para el commit de este avance; ningún commit implica certificación de producción.


