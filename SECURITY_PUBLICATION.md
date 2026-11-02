# HADES OMEGA — Checklist de publicación segura

**No cambiar la visibilidad del repositorio hasta completar todos los controles.**

## Variables privadas
- `ANTHROPIC_API_KEY`, `JWT_SECRET`, credenciales NEAR, `DATABASE_URL` y `HADES_SNAPSHOT_KEY` deben existir únicamente en el entorno del servidor o en un gestor de secretos.
- No utilizar `VITE_*` para ninguna credencial: Vite incorpora dichas variables al bundle público.
- `.env.example` debe contener exclusivamente valores de ejemplo no funcionales.
- Para Vercel: Project Settings > Environment Variables. Configurar por entorno y redeplegar cuando corresponda.

## Auditoría local obligatoria antes de publicar
1. Revisar el estado de Git: `git status --short`.
2. Comprobar qué ficheros están versionados: `git ls-files`.
3. Confirmar que ningún `.env`, archivo de credenciales NEAR o token esté ya versionado; `.gitignore` no afecta archivos que ya estén rastreados.
4. Instalar Gitleaks y ejecutar `gitleaks git --redact --verbose` en el repositorio local para inspeccionar el historial completo.
5. Ejecutar `gitleaks dir --redact --verbose .` para examinar también archivos no versionados. Evitar compartir públicamente los resultados sin revisarlos.
6. Revisar manualmente los bundles `dist` y `build` para comprobar que no contengan credenciales.
7. Ejecutar pruebas unitarias, de integración y end-to-end.
8. Verificar que el workflow `secret-scan.yml` funcione y termine correctamente.
9. Revisar los commits antiguos y todas las ramas y etiquetas pertinentes, no solo `main`.

## Respuesta ante exposición
- Si una clave estuvo alguna vez en un commit, revocarla o rotarla **antes** de publicar, aunque posteriormente se haya eliminado.
- No copiar valores reales al issue tracker, al chat, al README ni a archivos de auditoría.
- Para limpiar historial público, planificar una reescritura con `git-filter-repo`, coordinando clones y despliegues. **No realizar force push sin autorización.**

## Límites de esta preparación
La existencia del workflow y las reglas de ignorado **no certifican** que el repositorio ni su historial estén libres de secretos. La auditoría local, el escaneo completo y la rotación corresponden a pasos obligatorios y aún no validados.
