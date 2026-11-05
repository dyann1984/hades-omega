# Matriz de cumplimiento — NEAR HACKATHON 2026

Base: `docs/requisitos-entrega-hackathon.md` (lectura de https://nearhackathon.com/ y `/HACKATHON.md` del 2026-11-02).
**Relectura del 2026-11-05: no fue posible.** Tanto el agente de lectura web como una petición directa desde esta máquina fallaron
(`ECONNREFUSED` / «No es posible conectar con el servidor remoto»). Los requisitos de abajo no se han reconfirmado hoy; **el dueño debe releer ambas páginas antes de enviar** (el envío no se puede editar).

Estado: ✅ cumplido y comprobado · ⚠️ cumplido con reserva · ⛔ bloquea el envío · 👤 acción del dueño (no automatizable)

| # | Requisito | Estado | Evidencia comprobable | Acción / bloqueo exacto |
|---|---|---|---|---|
| 1 | Repositorio público durante el juicio | ⚠️ | `origin` = `github.com/dyann1984/hades-omega`; visibilidad pública consultada el 2026-11-02 | 👤 Reconfirmar en navegador sin sesión; no se publicó nada desde esta sesión |
| 2 | La rama juzgada contiene el trabajo | ⛔ | La rama de trabajo actual es `codex/hades-omega-finalizacion`; el requisito documentado indica que la rama por defecto es `main` y no contenía los commits recientes | 👤 Integrar a `main` (PR) o cambiar la rama por defecto. **Requiere autorización: no se hizo** |
| 3 | `LICENSE` | ⛔ | `Test-Path LICENSE` → ausente | 👤 Elegir licencia (MIT sugerida). No se añadió: define derechos sobre la obra |
| 4 | Publicación en X con video, @NEARProtocol y #NEARHackathon | ⛔ | Guion en `docs/guion-video-3min.md`; no existe publicación | 👤 Grabar y publicar desde su cuenta |
| 5 | Formulario de envío (campos, cartera de premio, descripción 20–2000 caracteres) | ⛔ | Borrador de descripción en `docs/requisitos-entrega-hackathon.md` | 👤 Decidir cartera NEAR de premio (mainnet; una cuenta testnet no cobra) y enviar antes del 2026-11-14 23:59 UTC |
| 6 | README humano/máquina; cribado por Claude Code/Codex | ✅ | Enlaces, rutas y scripts del README/JUDGES verificados (0 rotos); `e2e-audit-flow.cjs` 22/22; `check-public-demo-safety.cjs` todo en verde | Reejecutar tras integrar a `main` |
| 7 | Declarar IA, librerías y trabajo previo | ✅ | README «Hackathon disclosures»; primer commit 2026-10-24 (posterior al anuncio) | — |
| 8 | Integración NEAR construida en la ventana y explicada | ✅ (con reserva de verificación) | Contrato Rust propio, 12 pruebas unitarias + 6 de integración (documentadas); tubería de envío con pruebas de dobles | La **verificación on-chain actual está INCONCLUSIVE**: `verify-attestation-onchain.cjs` salió con código 2 («ningún RPC respondió», HTTP 408) el 2026-11-05. La evidencia previa (tx `BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3`) no equivale a una verificación de hoy |
| 9 | Testnet elegible; sin integración obligatoria | ✅ | Todo opera en Testnet; firma desactivada por defecto | — |
| 10 | Afirmaciones veraces (los jueces verifican que haga lo que dice) | ✅ | Tabla «real / simulado / pendiente» del README; capacidades sin ejecutor rechazadas con `CAPABILITY_NOT_IMPLEMENTED` (prueba); pagos y NEAR Intents declarados como no implementados | — |
| 11 | Derechos promocionales sobre video/capturas | ℹ️ | — | 👤 Revisar que no contengan claves ni datos personales |

## Tracks
Recomendados: **AI Security & Defense** y **AI Swarms**. No marcar «Autonomous Business» ni «Agent Economy» (sin tesorería ni pagos implementados).
