# HADES — Informe de Saneamiento de Secretos

**Fecha:** 2026-10-29  
**Rama:** `main`  
**HEAD saneado:** `1665799`  
**Commits en rango:** 64 (`f8229a4..1665799`)  
**Estado push:** BLOQUEADO hasta autorización explícita  

---

## 1. Resumen Ejecutivo

| Criterio | Resultado |
|----------|-----------|
| Credencial en historial (git log -S) | ✅ LIMPIO |
| Credencial en working tree (git grep HEAD) | ✅ LIMPIO |
| Archivos rastreados no-.md (ts/js/json/yml) | ✅ LIMPIO |
| Scripts locales saneados (init-live-db.cjs, run-live-demo.cjs) | ✅ env var |
| .gitignore actualizado | ✅ 8 scripts + dirs excluidos |
| Regression: 129 tests / typecheck / build | ✅ TODO PASS |
| SQLite integrity | ✅ ok |
| Fast-forward desde origin/main posible | ✅ Confirmado |
| **Veredicto** | **GO — pendiente rotación de credencial** |

---

## 2. Archivos Corregidos

### 2.1 Informes de documentación (4 archivos)

Todos los commits del rango `f8229a4..main` fueron reescritos mediante `git filter-branch --tree-filter`. La credencial administrativa fue sustituida por `[CREDENCIAL_REDACTADA]` en:

| Archivo | Commit original | Nuevo commit |
|---------|----------------|--------------|
| `INFORME_CIERRE_HADES_V10_3.md` | `cdfaccd` | reescrito |
| `INFORME_CERTIFICACION_HADES_V10_3.md` | `d87383c` | reescrito |
| `INFORME_INTEGRACION_HADES_V10_V103.md` | `1c8f0ce` | reescrito |
| `INFORME_PREMERGE_HADES_V10_3.md` | `ad3c229` | reescrito |

Los resultados E2E, hashes SHA-256, métricas y conclusiones se conservan íntegramente.

### 2.2 Scripts locales no rastreados (2 archivos)

Estos archivos permanecen FUERA de git. Solo se modificó su comportamiento en disco:

| Script | Cambio |
|--------|--------|
| `scripts/init-live-db.cjs` | `password` ahora lee `process.env.HADES_ADMIN_PASSWORD` (falla con error si no está definida) |
| `scripts/run-live-demo.cjs` | `.fill(...)` ahora lee `process.env.HADES_ADMIN_PASSWORD` (lanza error si no está definida) |

---

## 3. Método de Saneamiento del Historial

```
Herramienta:  git filter-branch --force --tree-filter
Rango:        f8229a4..HEAD  (63 commits originales → 63 commits reescritos)
Script:       redact-hades.ps1 (scratchpad local, fuera del repo)
Método:       Reemplaza la credencial en todos los archivos .md de cada commit
Respaldo:     tag backup/presanitize-dda38c4 → estado previo al saneamiento
```

**Hashes cambiados (antes → después):**

| Descripción | Hash original | Hash saneado |
|-------------|--------------|--------------|
| Commit pre-saneamiento (tip) | `dda38c4` | — |
| .gitignore update | — | `1665799` (HEAD actual) |
| INFORME_MERGE_FINAL_HADES | `dda38c4` | `4937e77` |
| INFORME_PREMERGE_V10_3 | `ad3c229` | `7c35751` |
| CI workflow | `efc76b6` | `c358007` |

**Nota importante:** La rama `integration/hades-v10-v103` NO fue reescrita. Si se publica esa rama en el futuro, deberá sanearse de forma independiente antes del push.

---

## 4. Resultado del Escaneo de Historial (Segundo Escaneo)

| Verificación | Resultado |
|-------------|-----------|
| `git grep -l [credencial] HEAD` | ✅ Sin coincidencias |
| `git log -S [credencial] f8229a4..HEAD` | ✅ Sin commits |
| Archivos .ts/.js/.cjs/.json en HEAD | ✅ LIMPIO |
| Scripts no rastreados (init-live-db, run-live-demo) | ✅ Corregidos a env var |
| origin/main (f8229a4) | ✅ No afectado (no reescrito) |

---

## 5. Rotación de Credencial Administrativa

### 5.1 Estado actual

La credencial administrativa se almacena como hash bcrypt en la base de datos SQLite local (`data/hades.json.sqlite`, tabla `users`). El hash no está en git. La credencial en texto plano nunca estuvo en el repositorio remoto (origin/main apuntaba a un único commit sin dicha credencial).

### 5.2 Cuándo rotar

Se recomienda rotar la credencial inmediatamente después del push, o antes si ya hubo accesos no autorizados. La rotación no requiere modificar código.

### 5.3 Procedimiento de rotación (ejecutar manualmente)

**Paso 1 — Generar nueva contraseña (en terminal separado, no copiar aquí):**
```bash
# Genera 20 bytes aleatorios en base64 (≥ 160 bits de entropía):
node -e "console.log(require('node:crypto').randomBytes(20).toString('base64url'))"
```

**Paso 2 — Guardar en gestor de contraseñas ANTES de continuar.**  
No registrar la contraseña en ningún archivo, log, chat ni correo.

**Paso 3 — Actualizar la base de datos local:**
```bash
cd L:\HADES
$env:HADES_ADMIN_PASSWORD = "<<nueva contraseña del gestor>>"
node scripts/reset-local-password.cjs
# El script lee la contraseña de stdin o del entorno y la hashea con bcrypt
```

**Paso 4 — Revocar sesiones activas:**
El servidor de HADES expira todas las sesiones activas automáticamente cuando se reinicia. Si hay sesiones abiertas:
```bash
# Reiniciar el servidor API:
# Ctrl+C en el proceso node o matar el proceso si corre como daemon
npm run dev --workspace=packages/api
```

**Paso 5 — Verificar acceso:**
```bash
# Probar login con la nueva contraseña desde el frontend
# o via curl:
curl -s -X POST http://127.0.0.1:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<<nueva contraseña>>"}'
```

### 5.4 Estado

**Rotación: PENDIENTE — requiere intervención del propietario.**  
No se ejecutó automáticamente para respetar la soberanía del propietario sobre sus credenciales operativas.

---

## 6. Resultados de Regresión

| Workspace | Typecheck | Build | Tests |
|-----------|-----------|-------|-------|
| `@hades/api` | ✅ exit 0 | ✅ exit 0 | ✅ 75/75 (23 archivos) |
| `@hades/core` | ✅ exit 0 | ✅ exit 0 | ✅ 49/49 (7 archivos) |
| `@hades/frontend` | ✅ exit 0 | — | ✅ 5/5 (2 archivos) |
| **Total** | **✅** | **✅** | **✅ 129/129 PASS** |

**SQLite integrity:** `ok` — base de datos local intacta.

---

## 7. Estado del Repositorio

```
Branch:          main
HEAD saneado:    1665799
origin/main:     f8229a4 (sin cambios — push aún no realizado)
FF posible:      SÍ — f8229a4 es antepasado directo de 1665799
Commits a subir: 64
```

### Respaldos disponibles

| Tag | Apunta a | Descripción |
|-----|----------|-------------|
| `backup/presanitize-dda38c4` | `dda38c4` | Estado justo antes del saneamiento |
| `backup/premerge-main-f8229a4` | `f8229a4` | Estado de main antes del merge FF |
| `backup/premium-v10-e5e0b06` | `e5e0b06` | Rama premium V10 |
| `backup/v10-3-d87383c` | `d87383c` | Rama V10.3 antes de integración |

### Archivos locales no rastreados (conservados intactos)

Los 24 archivos/directorios no rastreados permanecen en disco sin modificación de estructura ni eliminaciones:
- `recovery-*/` — 6 directorios de respaldo
- `evidence-*/` — 6 directorios de capturas
- `.test-tmp/`, `integration-v10-temp/` — temporales
- 8 scripts `.cjs` (2 con credencial corregida a env var)
- 2 informes markdown sueltos

---

## 8. Riesgos Pendientes

| Riesgo | Severidad | Estado |
|--------|-----------|--------|
| Credencial no rotada (sigue siendo válida) | Medio | Pendiente — requiere intervención del propietario |
| `integration/hades-v10-v103` contiene historial con credencial | Bajo | No publicar esa rama sin sanear primero |
| `backup/presanitize-dda38c4` tiene historial con credencial | Bajo | Tag local — no hacer push de tags de respaldo |
| JWT TTL post-logout | Bajo | Mitigado por `session_revocations` |
| NEAR en modo simulado | Medio | Documentado — no publicar como producción |

---

## 9. Veredicto

```
GO — historial saneado, 129 tests PASS, FF posible desde origin/main
CONDICIÓN PREVIA AL PUSH: rotar la credencial administrativa
```

**Para autorizar el push, ejecutar primero los pasos de rotación del §5.3,  
luego confirmar aquí con: "Credencial rotada — autorizo push".**

---

*HADES OMEGA — NEAR Hackathon 2026 — Saneamiento completado el 2026-10-29*
