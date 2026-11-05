# Borradores para la entrega oficial (NO publicados, NO enviados)

Todo lo de aquí es texto preparado. Nada se ha publicado, enviado ni desplegado. Los campos entre `<…>` los completa el dueño; no se guardan en el repositorio (es público).

## 1. Campos del formulario

Fuente: `docs/requisitos-entrega-hackathon.md` (lectura del 2026-11-02; **releer https://nearhackathon.com/ y `/HACKATHON.md` antes de enviar**: el envío no se puede editar).

| Campo | Valor propuesto |
|---|---|
| Nombre del proyecto | HADES OMEGA |
| Líder del equipo | Diana Lopez |
| Correo | `<tu correo>` |
| Tamaño del equipo | `<n>` (el trabajo se hizo con Claude Code bajo dirección humana; declarado en README) |
| Tracks | **AI Security & Defense** y **AI Swarms**. No marcar «Autonomous Business» ni «Agent Economy» |
| Cartera NEAR de premio | `<tu cuenta .near de mainnet>` — decisión tuya; una cuenta `.testnet` no cobra premios |
| Repositorio | https://github.com/dyann1984/hades-omega (debe ser público y mostrar el README nuevo en la rama por defecto) |
| Publicación en X | `<enlace tras publicar>` |
| Descripción (20–2000 caracteres) | ver abajo (≈1 400 caracteres) |

### Descripción (inglés, ≈1 400 caracteres; revísala y apruébala)

> HADES OMEGA is a multi-agent system that audits business documents and can only touch the blockchain through a security gate called CERBERUS.
>
> Problem: an AI agent that holds keys is one prompt injection or bug away from losing funds.
>
> Product: specialised agents (CHARON, MINOS, PERSEPHONE, ELYSIUM, TARTARUS) analyse documents and produce a SHA-256-sealed report. Any sensitive action must pass CERBERUS: deny by default, a human approval bound to the exact parameters and the policy, expiring and single-use, a persistent emergency stop, fail-secure on internal errors, and a hash-chained audit log with an independent read-only verifier and an exportable external anchor. CHRONOS schedules read-only follow-up checks.
>
> Role of NEAR: our own Rust contract on Testnet (audit.hades-omega.testnet) stores audit hashes. The server signs only with a FunctionCall key limited to store_audit_hash on that contract (0.25 NEAR gas allowance) and rejects FullAccess keys and mainnet accounts. One real record exists (tx BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3); anyone can verify it in 30 seconds with public read-only RPC queries (18 checks, no install, no keys).
>
> Honest limits: Testnet only; the public demo simulates NEAR and cannot sign; payments, NEAR Intents, mainnet and on-chain governance events are not built; six registered agent capabilities have no executor and are rejected explicitly. 461 automated tests plus 22 browser end-to-end tests pass.

(Comprobar el recuento de caracteres al pegarlo en el formulario.)

## 2. Publicación en X (borrador; la publicas tú)

Requisitos documentados: decir que se construyó en NEAR HACKATHON, etiquetar **@NEARProtocol** y **#NEARHackathon**, y **adjuntar video** (capturas solas no bastan).

> Built at #NEARHackathon with @NEARProtocol: HADES OMEGA 🛡️ — AI agents that audit documents but can only touch the chain through CERBERUS: one-time human approval bound to exact parameters, restricted NEAR FunctionCall key, emergency stop, hash-chained audit log.
>
> A real Testnet record you can verify in 30 s (read-only, no keys). Honest about what's simulated.
>
> Repo + verifier: https://github.com/dyann1984/hades-omega
> 🎥 3-min demo below

Antes de publicar: video adjunto; repo público mostrando el README nuevo; sin claves, tokens ni contraseñas en el video.

## 3. Guion de la demostración

El guion cronometrado (3:00) está en [`guion-video-3min.md`](guion-video-3min.md). Ajustes tras las últimas verificaciones:

* La página `docs/verify/index.html` ahora prueba tres nodos RPC públicos en orden (incluido uno archivado) y muestra **13 comprobaciones**; el script `node scripts/verify-attestation-onchain.cjs` muestra **18**. Di «13» si grabas la página y «18» si grabas la terminal.
* Preparación sin riesgo: no definas `NEAR_SIGNING_ENABLED`; no grabes `.env.local`, `hades-admin*.key`, el `X-Setup-Token` ni contraseñas.
* Para la demostración local: `npm ci && npm run build`, luego las instrucciones de `docs/JUDGES.md` §3 («Explore Demo» no necesita credenciales).
* Di «a real record», nunca «this mission's record»: el registro on-chain atestigua el contrato, no una misión.

## 4. Secuencia de entrega (cada paso requiere tu autorización)

Ver `HADES_HACKATHON_RELEASE_CHECKLIST.md` § «Acciones que debes aprobar».
