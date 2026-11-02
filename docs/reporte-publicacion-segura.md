# Reporte de publicación segura — rama `feat/hades-hackathon-hardening`

Verificado el 2026-11-02. **No se ha ejecutado push, merge a `main` ni despliegue.**

## 1. Estado de la rama

| Dato | Valor |
|---|---|
| Rama local | `feat/hades-hackathon-hardening`, árbol limpio |
| Remoto (`origin/feat/...`) | `a5a403a` (HADES 11.1) |
| Commits locales por delante / por detrás | **21 / 0** (avance directo; `git push --dry-run` lo confirmó) |
| Autor de los commits pendientes | uno solo (`dyann1984`) |
| `git fsck --full` | sin errores (solo objetos colgantes normales) |
| Copia limpia (`git clone` + `npm ci`) | type-check, build y pruebas pasan: 78 core + 72 frontend + 236 api (3 omitidas) |
| Archivos prohibidos en los commits (`.env`, `.pem`, `.sqlite`, `.wasm`, `dist`, `node_modules`) | ninguno; solo `.env.example` |
| Archivos añadidos > 500 KB | ninguno |
| Etiquetas locales | 7 (`backup/*`, `recovery/*`); **no se publican** salvo que se pidan |

El único commit "vacío" es la fusión `6ce6921`, que es normal en un merge sin cambios propios.

## 2. Rama `security/pre-publication-hardening-20261102` (sin fusionar)

* Contiene 3 commits sobre una base antigua (`5976132`); añade `.github/workflows/secret-scan.yml` (Gitleaks con historial completo),
  `SECURITY_PUBLICATION.md` y reglas de `.gitignore` (`.env.*`, `.npmrc`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `service-account*.json`...).
* **Ya está en `main`** como `701113b` (PR #2, mismos 3 archivos; la diferencia entre ambas ramas en esos archivos es nula). No aporta nada nuevo.
* Fusionarla en la rama de trabajo daría **conflicto en `.gitignore`**. No se fusionó.
* Recomendación: no fusionarla; cuando se autorice, integrar `main` en la rama de trabajo (sus 3 archivos son aditivos) para que el workflow de Gitleaks corra también aquí, resolviendo `.gitignore` a mano (unión de reglas).

## 3. Revisión de credenciales

| Escaneo | Resultado |
|---|---|
| Gitleaks, **todos los refs** (130 commits) | **0 hallazgos** (con `.gitleaksignore`) |
| Gitleaks, instantánea del árbol versionado | 1 hallazgo, el mismo falso positivo (ver abajo) |
| Gitleaks, `dist` del frontend | 0 |
| Patrones propios sobre el diff a publicar (`ed25519:`, `sk-ant-`, `PRIVATE KEY`, `AKIA`, `ghp_`) | 0 (salvo claves falsas de prueba conocidas) |

Único hallazgo: `packages/api/src/demo-auth.test.ts:266`, un UUID literal usado como `Idempotency-Key` en una prueba (no es una credencial; verificado por forma:
UUID, sin prefijo de token, 1 sola aparición). Se añadió a `.gitleaksignore` (huella exacta, commit `2ae6ffb`).
El `dist` de la API sale como hallazgo solo por compilar ese mismo test; no está versionado.

Limitación: Gitleaks no demuestra ausencia de secretos. `SECURITY_PUBLICATION.md` exige además rotar cualquier clave que haya estado alguna vez en un commit;
no se encontró ninguna, pero revisa tus servicios (Anthropic, Neon, Vercel) por si usaste claves reales fuera del repositorio.

## 4. Pasos de publicación (requieren tu autorización; ninguno ejecutado)

1. Decidir si el repositorio pasa a público: **no cambiar la visibilidad** antes de completar `SECURITY_PUBLICATION.md`.
2. `git push origin feat/hades-hackathon-hardening` (avance directo, sin force).
3. Comprobar que la acción *Secret scanning* de GitHub termina en verde.
4. PR hacia `main` solo con tu aprobación explícita.
