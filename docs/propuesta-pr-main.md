# Propuesta de Pull Request: `feat/hades-hackathon-hardening` → `main` (NO abierto, NO fusionado)

**Estado:** borrador. No existe PR en GitHub. Abrirlo es visible públicamente (el repo es público) y para incluir los últimos commits locales hay que publicar la rama primero: ambos pasos esperan tu autorización.

## Resultado del análisis de diferencias

| Dato | Valor |
|---|---|
| Base | `origin/main` = `701113b` |
| `origin/main` ya contenido en la rama | **Sí** (la base de fusión es `origin/main`): el PR sería un avance rápido, **sin conflictos** |
| Commits en la rama que no están en `main` | 38 al momento del análisis (a publicar + los commits nuevos de hoy) |
| Tamaño (hasta `12deab2`) | 119 archivos, +13 379 / −616 líneas |
| Archivos borrados o renombrados | **Ninguno** |
| `vercel.json`, `render.yaml` | **Sin cambios** |
| Áreas | API 39 · docs 29 · frontend 15 · core 9 · e2e 5 · scripts 5 · contrato Rust 4 · config 6 |
| Cambios de configuración | `package.json` (+scripts `test:e2e`, devDependencies ESLint y Playwright), `packages/*/package.json` (script `lint`; `@types/node`; `uuid` fijado a `11.1.1`), `package-lock.json`, `.gitignore` (+Playwright, `artifacts/`), `playwright.config.ts` |

## ⚠️ Lo que debes saber antes de fusionar

1. **Despliegues automáticos.** `render.yaml` y el proyecto Vercel `hades-omega` (`hades-omega-ten.vercel.app`) existen. **No pude comprobar** si están conectados a `main` con despliegue automático (eso se ve en sus paneles). Si lo están, fusionar **redesplegará** el sitio y la API existentes con el código nuevo. Antes de fusionar, revisa esos dos paneles o desactiva el auto-deploy. Comportamiento nuevo en la API: bloqueo por defecto de rutas NEAR/CERBERUS, sesiones DEMO aisladas, tubería de firma (apagada si faltan variables `NEAR_*`).
2. **`uuid` 10 → 11.1.1** en `packages/core` (único cambio de dependencia de producción; 78 pruebas de core pasan).
3. El contrato Rust cambia (`new` es `#[init] #[private]`). **Nada se redespliega** al fusionar; el contrato ya desplegado es el de este código y su hash está atestado.
4. El README de `main` pasa a ser el nuevo (describe lo real, simulado y pendiente).

## Título propuesto

`Hackathon hardening: CERBERUS one-time approvals, NEAR Testnet audit pipeline (restricted key), verifier, judges docs`

## Descripción propuesta

```markdown
## What
Integrates the verified hackathon version of HADES OMEGA.

## Verified
- type-check, ESLint (forced), build, unit tests: api 244 (+3 skipped live-RPC), core 78, frontend 75
- Rust: 12 unit + 6 near-sandbox integration tests
- Playwright (Edge, 1 worker, retries 0): 22 passed + 2 opt-in screenshot tests run separately and passed; 0 failures
- e2e-audit-flow 22/22; public-demo-safety 25/25; bundle-secrets 13/13
- Gitleaks over full history: 0 findings
- On-chain: tx BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3 (NEAR Testnet), `node scripts/verify-attestation-onchain.cjs` -> 18/18

## Not changed
No deletes/renames. vercel.json and render.yaml untouched. No contract redeploy.

## Risk
If auto-deploy is wired to main, merging redeploys the existing Vercel/Render services. Review before merging.

## Merge type
Fast-forward is possible (main is an ancestor). Prefer a merge commit or squash per repo policy.
```

## Comando preparado (no ejecutado)

```powershell
gh pr create --draft --base main --head feat/hades-hackathon-hardening `
  --title "Hackathon hardening: CERBERUS one-time approvals, NEAR Testnet audit pipeline (restricted key), verifier, judges docs" `
  --body-file docs/propuesta-pr-main.md   # usar solo el bloque de "Descripción propuesta"
```
Se crearía como **borrador** (`--draft`); fusionar sigue siendo una acción distinta y posterior.
