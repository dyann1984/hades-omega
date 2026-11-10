# Matriz de cumplimiento — NEAR HACKATHON 2026

Base: lectura directa de https://nearhackathon.com/ y https://nearhackathon.com/HACKATHON.md.
**Releídas el 2026-11-10: ambas respondieron HTTP 200 y los requisitos de abajo están reconfirmados contra ellas.**
Fecha límite confirmada en ambas páginas: **`2026-11-14T23:59:00Z`**. Juicio 16–18 nov; resultados antes del 18 nov.
Aun así, el envío **no se puede editar** (los cambios van por `/request-changes`), de modo que conviene una última relectura inmediatamente antes de enviar.

Auditoría completa que respalda esta matriz: [`AUDITORIA_FINAL_NEAR_HACKATHON_2026.md`](AUDITORIA_FINAL_NEAR_HACKATHON_2026.md).

Estado: ✅ cumplido y comprobado · ⚠️ cumplido con reserva · ⛔ bloquea el envío · 👤 acción del dueño (no automatizable)

| # | Requisito | Estado | Evidencia comprobable | Acción / bloqueo exacto |
|---|---|---|---|---|
| 1 | Repositorio público durante el juicio | ✅ | API pública de GitHub sin autenticar, 2026-11-10: `visibility: public`, `private: false` | — |
| 2 | La rama que abren los jueces contiene el trabajo | ⛔ | `default_branch: main` = `701113b`; la rama de trabajo `codex/hades-omega-finalizacion` = `265357c` está **82 commits por delante, 0 por detrás** (avance directo limpio, sin conflictos). GitHub reporta `pushed_at: 2026-11-03` | 👤 Publicar el trabajo y dejar `main` como rama juzgada. Ninguna página oficial fija una regla de rama, pero los jueces abren la URL del repositorio y aterrizan en `main`. **Requiere autorización: no se hizo** |
| 3 | `LICENSE` (Q-014: «Any. MIT is fine… add a LICENSE file») | ⚠️ | Existe localmente: `LICENSE`, MIT, «Copyright (c) 2026 Diana Lopez», commit `e53f624`. La API de GitHub devuelve `license: null` porque **no está publicada** | 👤 **Confirmar la licencia explícitamente.** Es un requisito del concurso, pero define derechos sobre la obra y aún es reversible porque no se ha publicado |
| 4 | Código funcional | ✅ | Ejecutado el 2026-11-10: 461 pruebas unitarias (+3 omitidas por diseño), 22 E2E de navegador (+2 omitidas), 22/22 del flujo completo sobre HTTP real, 25/25 de seguridad de la demo pública. Type-check, lint (0 errores) y build en verde | — |
| 5 | Integración NEAR construida en la ventana y explicada | ✅ | Contrato Rust propio desplegado en `audit.hades-omega.testnet`; WASM on-chain **idéntico byte a byte** a `contract-attestation.json`; transacción `BGzHzQAr…` **FINAL y exitosa**, verificada el 2026-11-10 contra dos nodos archival independientes; `get_count` = 1. Primer commit 2026-10-24 (anuncio 2026-10-19) | — |
| 6 | Testnet elegible (Q-010: «Testnet-only projects eligible? Yes, all tracks») | ✅ | Todo opera en testnet; firma desactivada por defecto; lista blanca de RPC que excluye mainnet | — |
| 7 | README reproducible; cribado por Claude Code/Codex (Q-017) | ✅ | `npm ci && npm run build` + dos scripts; `check-doc-links.cjs` → 0 enlaces rotos (2026-11-10) | Reejecutar tras publicar |
| 8 | Declarar librerías y código de IA en el README (Q-005) | ✅ | Sección «Hackathon disclosures»: Claude Code declarado, librerías listadas, cronología del trabajo. *(No existe un requisito explícito de declaración de IA en las fuentes oficiales; este punto se cumple de sobra)* | — |
| 9 | Evidencia técnica | ✅ | `JUDGES.md`, `contract-attestation.json`, `evidence-*.json`, verificador independiente de 18 comprobaciones, verificador de la cadena de auditoría | — |
| 10 | Afirmaciones veraces (los jueces verifican que haga lo que dice) | ✅ | Tablas «real / simulado / pendiente»; capacidades sin ejecutor rechazadas con `CAPABILITY_NOT_IMPLEMENTED` (con prueba que impide la desincronización); pagos, NEAR Intents y NEP-297 declarados como no implementados | Las cinco afirmaciones desactualizadas detectadas en la auditoría del 2026-11-10 ya están corregidas (dos de ellas *subestimaban* el proyecto) |
| 11 | Video demostrativo adjunto a la publicación en X | ⛔ | Guion en `guion-video-3min.md`. **No existe el video.** Las fuentes oficiales no fijan duración máxima ni servicio de alojamiento | 👤 Grabar y adjuntarlo a la publicación en X |
| 12 | Publicación en X con `@NEARProtocol` y `#NEARHackathon` + video o capturas | ⛔ | No existe. Opcionales: `@NearLegion`, `@NearBuilders` | 👤 Publicar desde su cuenta |
| 13 | Descripción del proyecto, 20–2000 caracteres | ⚠️ | Borrador en `entrega-oficial-borradores.md` | 👤 Revisar y fijar el texto final |
| 14 | Dirección de billetera para el premio | ⛔ | **Debe ser de MAINNET**: cuenta nombrada tipo `algo.near` o implícita de 64 caracteres (`^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$`, 2–64 caracteres). **Una cuenta testnet no cobra.** Pago único, sin *vesting*, dentro de 30 días del resultado | 👤 Decidir y crear la cuenta mainnet |
| 15 | Formulario oficial `https://nearhackathon.com/#apply` | ⛔ | No enviado. **Una sola entrega por proyecto y por repositorio** | 👤 Enviar antes del `2026-11-14T23:59Z` |
| 16 | Fecha límite | ⚠️ | `2026-11-14T23:59:00Z` | 👤 Quedan 4 días contados desde el 2026-11-10 |
| 17 | Demo alojada (Q-012: «Hosted demo is a plus; keep it up to 2026-11-18, ideally 2026-11-25») | ✅ | **En línea y comprobada el 2026-11-10**: web `hades-omega-ten.vercel.app` (HTTP 200), API `hades-omega.onrender.com/health` OK. Sesión DEMO sin credenciales, `403` en las 6 rutas sensibles probadas, `401` anónimo, `transactionsSigned: 0` | 👤 Mantenerla en línea hasta el 2026-11-25. Defecto conocido: `/verify/index.html` devuelve la SPA; corregido en `vercel.json`, surte efecto al redesplegar |
| 18 | Derechos promocionales sobre video y capturas | ℹ️ | — | 👤 Revisar que no contengan claves ni datos personales |

## Tracks

Texto oficial, literal:

- **AI Security & Defense** (`security`): «Build spending limits, policy engines, sandboxed wallets, reputation and scam detection. Give AI money without giving it the keys to everything.»
- **AI Swarms** (`swarms`): «Build coordination markets, bidding, collective purchasing, intent-based settlement and emergent economies between agents.»

**Recomendación: marcar únicamente AI Security & Defense.**

| Track | Correspondencia | Por qué |
|---|---|---|
| **AI Security & Defense** | **MUY ALTA** | Correspondencia punto por punto con lo que el proyecto demuestra: *policy engine* = CERBERUS con deny-by-default y orden total de reglas; *spending limits* = *allowance* acotado de 0,2498 NEAR y topes de importe; *sandboxed wallet* = llave FunctionCall limitada a **un método de un contrato**, con FullAccess rechazada. La frase «give AI money without giving it the keys to everything» es literalmente la tesis del README, y está verificada on-chain |
| **AI Swarms** | **BAJA — no marcarlo** | El track pide mercados de coordinación, pujas, compra colectiva, liquidación basada en *intents* y economías emergentes entre agentes. HADES tiene **orquestación jerárquica**, no un mercado: no hay pujas ni liquidación entre agentes, y NEAR Intents está declarado como no usado. Marcarlo invita a un juez a concluir que el proyecto se sobre-declara, justo en la dimensión —la honestidad— en la que hoy es más fuerte |

Varios tracks pueden marcarse en una misma entrega, de modo que la elección es libre; lo anterior es criterio estratégico, no reglamento. **No marcar** «Autonomous Business» ni «Agent Economy» (sin tesorería ni pagos implementados).
