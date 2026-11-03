# Guion de video — 3 minutos — flujo CERBERUS → NEAR → verificación on-chain

**Para:** publicación en X (HACKATHON.md: «Lead with the user problem», «Show one complete moment», explicar el papel de NEAR). **Duración:** 3:00. **Idioma sugerido:** voz en inglés con subtítulos (los jueces y el cribado automático leen inglés); texto en pantalla corto.
**Regla de honestidad:** todo lo que se muestre debe ser real o estar etiquetado. En pantalla debe verse «Testnet».

## Preparación antes de grabar (sin tocar NEAR)

1. `npm run build` y arrancar con `JWT_SECRET` aleatorio; `NEAR_SIGNING_ENABLED` **sin definir**. No uses tu sesión con claves guardadas.
2. Crear el primer admin con el `X-Setup-Token` (no grabar el token ni la contraseña).
3. Tener abierta en otra pestaña `docs/verify/index.html` y el explorador con la transacción.
4. Cerrar notificaciones, gestores de contraseñas y cualquier ventana con `.near-credentials` o `.env.local`.
5. Ensayar una vez; el paso 2 (aprobación) y el paso 5 (verificador) son los que no pueden fallar en directo. Plan B para el 5: ejecutar `node scripts/verify-attestation-onchain.cjs` en terminal.

## Guion

| Tiempo | Pantalla | Voz (inglés) | Texto en pantalla |
|---|---|---|---|
| 0:00–0:20 | Titular: «AI agents + wallets = one prompt away from losing funds» → logo HADES | "Give an AI agent a key and one bad prompt can drain it. HADES OMEGA lets agents work without ever holding the keys to everything." | *AI Security & Defense · NEAR Testnet* |
| 0:20–0:50 | Panel de la misión; clic en **Crear misión y ejecutar agentes**; se ven los agentes | "HADES plans a document audit. CHARON reads the documents, MINOS checks the conditions, PERSEPHONE compares them. It stops here, at CERBERUS, waiting for a human." | *Agents analyse. They cannot act alone.* |
| 0:50–1:20 | Pantalla de CERBERUS / aprobación pendiente; clic en **Aprobar (ADMIN)**; informe sellado con SHA-256 | "CERBERUS denies by default. The approval is bound to the exact parameters, expires, and can be used once. After approval, ELYSIUM writes the report and TARTARUS seals it with SHA-256." | *One-time approval · hash-sealed* |
| 1:20–1:45 | **Registrar evidencia**, **Programar seguimiento diario** (CHRONOS), **Preparar registro NEAR** → mensaje «No se firmó ni se envió» | "CHRONOS schedules a daily read-only check of that evidence. The NEAR record is prepared — and in this public build nothing can be signed: no key, signing disabled." | *Public build: signing OFF* |
| 1:45–2:10 | Explorador con la tx `BGzHzQAr…w1V3` (FINAL); zoom a: `store_audit_hash`, firmante, llave | "Here is a real record on NEAR Testnet. One FunctionCall, `store_audit_hash`, FINAL. It went through the same CERBERUS gate with a human approval, and was signed by a key that can do only that one thing on one contract." | *Real tx · FINAL · 1 action* |
| 2:10–2:40 | `docs/verify/index.html`: 13 comprobaciones en verde; resaltar «key restricted», «get_count = 1», «content hash matches» | "Don't trust us — verify. This page, or one Node script, queries a public RPC node: the content hash matches, the contract bytes hash to the attested WASM, and the key is limited to `store_audit_hash`. No install, no keys." | *All checks PASS — read-only* |
| 2:40–3:00 | README: tabla «real / simulated / pending»; enlace del repo | "What's real: the gate, the agents, one on-chain record. What's simulated: the public demo's NEAR. Not built: payments and mainnet. Code and verifier are public — link below." | *github.com/dyann1984/hades-omega · @NEARProtocol #NEARHackathon* |

## Cuidado con estas afirmaciones (ya verificadas; no las cambies en el guion)

* El registro on-chain atestigua **el contrato** (`CONTRACT_ATTESTATION`), no la misión que se muestra en el paso 2. Di «a real record», no «this mission's record». Si no, un juez que lea el contrato lo detectará.
* La demo pública **no** firma: es simulada por diseño. No mostrar «NEAR connected» ni saldos de la cuenta firmante.
* No decir «production», «mainnet», «autonomous payments» ni «NEAR Intents».
* No mostrar la contraseña de admin, el `X-Setup-Token`, `.env.local`, ni la carpeta `.near-credentials`.

## Texto del post en X (borrador; lo publicas tú)

> Built at #NEARHackathon by @NEARProtocol: HADES OMEGA — AI agents that audit documents but can only touch the chain through CERBERUS: one-time human approval, restricted NEAR FunctionCall key, hash-chained audit log.
> Real Testnet record + 30-second read-only verifier (no install, no keys).
> Repo: https://github.com/dyann1984/hades-omega · Demo video 👇

(Antes de publicar: el repo debe mostrar el README nuevo en la rama por defecto.)
