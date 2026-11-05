# HADES OMEGA — lista de verificación de envío (NEAR HACKATHON 2026)

Fecha: 2026-11-05 · Rama: `codex/hades-omega-finalizacion` · Plazo oficial documentado: **2026-11-14 23:59 UTC** (no releído hoy; ver bloqueo B6).

## Veredicto: **NO LISTO PARA ENVÍO**

El software está listo; el envío no, por bloqueos que sólo puede resolver el dueño del proyecto (B1–B5) y una verificación externa que hoy no se pudo hacer (B6, B7).

## Bloqueos exactos

| ID | Bloqueo | Evidencia | Quién / acción |
|---|---|---|---|
| B1 | **No existe `LICENSE`** (requisito documentado) | `Test-Path LICENSE` → ausente | Dueño: elegir licencia (MIT sugerida) |
| B2 | **La rama que se juzga no contiene el trabajo**: el trabajo está en `codex/hades-omega-finalizacion`; la rama por defecto documentada es `main` | `git branch --show-current`; `docs/requisitos-entrega-hackathon.md` fila 2 | Dueño: autorizar PR/merge o cambiar la rama por defecto. No se hizo |
| B3 | **Publicación en X con video, @NEARProtocol y #NEARHackathon** no existe | Guion en `docs/guion-video-3min.md` | Dueño: grabar y publicar |
| B4 | **Formulario de envío** sin enviar; falta decidir la **cartera NEAR de premio** (mainnet; testnet no cobra) | Borrador de descripción en `docs/requisitos-entrega-hackathon.md` | Dueño |
| B5 | Repositorio: confirmar que es público y que `main` tiene README y `docs/JUDGES.md` | Visibilidad consultada por última vez el 2026-11-02 | Dueño, en navegador sin sesión |
| B6 | **Requisitos oficiales no releídos**: `nearhackathon.com` inalcanzable | `ECONNREFUSED` (agente web) y «No es posible conectar con el servidor remoto» (petición directa) | Dueño: releer `https://nearhackathon.com/` y `/HACKATHON.md` antes de enviar |
| B7 | **Verificación on-chain de hoy: INCONCLUSIVE** | `node scripts/verify-attestation-onchain.cjs` → exit 2, «ningún RPC respondió (6 intentos)», HTTP 408 | Repetir el día del envío; la evidencia previa (tx `BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3`) no equivale a una verificación actual |

## Verificado hoy (evidencia local, reproducible)

| Comprobación | Resultado | Comando |
|---|---|---|
| Árbol Git limpio al inicio; cambios en commits pequeños | ✅ | `git status --short` vacío; último commit de código `58f4cd2` |
| Regresión completa sin caché | ✅ 12/12 tareas; **461 aprobadas, 3 omitidas** (api 294, core 92, frontend 75); lint 0 errores; build correcto | `$env:CI='1'; npx turbo run test type-check lint build --force --concurrency=1` |
| Playwright (navegador, escritorio y móvil) | ✅ 22 aprobadas, 2 omitidas | `npm run test:e2e` |
| Flujo principal solicitud → agentes → CERBERUS → aprobación → informe/sello → evidencia → seguimiento → NEAR *preparado, no enviado* → auditoría | ✅ en navegador (spec «approval completes the mission», ahora también comprueba `verified: true` de la cadena y los eventos `POLICY_EVALUATED`/`POLICY_ACTIVE`); rechazo bloquea los pasos protegidos | `e2e/operations.spec.ts` |
| Flujo por HTTP | ✅ 22/22 | `node scripts/e2e-audit-flow.cjs` |
| Demo pública no puede firmar ni enviar | ✅ | `node scripts/check-public-demo-safety.cjs` |
| Aprobaciones locales no ejecutan parámetros distintos a los autorizados | ✅ brecha comprobada y corregida; 5 pruebas (4 fallaban antes) | `npx vitest run src/local-approval-binding.test.ts` (en `packages/api`) |
| Exportación y verificación externa de `headHash`/`hashedEvents` | ✅ sin transacciones | `node scripts/verify-audit-chain.cjs --db <base> --export-anchor ancla.json` y `--anchor-file ancla.json`; `GET /api/v1/cerberus/audit/anchor` (ADMIN) |
| README, `docs/JUDGES.md`, `docs/demo-hackathon.md`: enlaces, rutas y scripts | ✅ 0 rotos | verificación por script (rutas relativas, `node scripts/…`, `npm run …`) |
| Firma/transmisión NEAR | ✅ desactivada; ninguna transacción enviada en esta fase | `NEAR_SIGNING_ENABLED` sin definir |

## Capacidades NO implementadas (declaradas así en README y JUDGES)

Pagos (`payment.execute` sin ejecutor) · NEAR Intents / Chain Signatures / mainnet · eventos de gobernanza NEP-297 on-chain (requiere cambio de contrato: bloque F) · 6 capacidades del registro (`cap:procurement:eval`, `cap:policy:verify`, `cap:financial:analyze`, `cap:resilience:recover`, `cap:orchestration:plan`, `cap:security:guard`; rechazadas con `CAPABILITY_NOT_IMPLEMENTED`) · enlace «evidencia de misión → registro on-chain» en la UI · despliegue público alojado · LLM real no ejercitado contra el proveedor.

## Riesgos residuales conocidos

- La ancla interna de la cadena de auditoría puede reescribirla quien controle el archivo; sólo un ancla guardada fuera del servidor lo detecta (custodia manual).
- Las aprobaciones creadas antes de la migración 14 no tienen hash y no se verifican.
- La verificación on-chain depende de que un RPC público responda.

## Para pasar a LISTO PARA ENVÍO

1. B1: añadir `LICENSE`. 2. B2: integrar a la rama que se juzga (requiere autorización). 3. B6: releer las reglas oficiales. 4. B7: ejecutar `node scripts/verify-attestation-onchain.cjs` con un RPC disponible y obtener PASS. 5. B3–B5: publicar el video en X, completar y enviar el formulario antes del plazo. 6. Repetir la regresión y Playwright tras integrar.
