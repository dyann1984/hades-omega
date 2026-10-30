# Recuperación de la cuenta administradora (ADMIN)

Principios: la contraseña y el token **nunca** se escriben en chats, informes, Git ni logs; siempre se introducen de forma interactiva y privada.

## A. Cambio normal de contraseña / usuario (con sesión iniciada)
1. Entra a HADES → **Cuenta**.
2. Contraseña actual + nueva contraseña (frase de varias palabras, o 12–16+ caracteres) + repetirla.
3. Opcional: «Nuevo usuario» (p. ej. `admin`) — actualiza el mismo usuario; no crea otro administrador.
4. Al guardar se cierran todas las demás sesiones. Cinco intentos fallidos bloquean la cuenta 15 minutos.

## B. Olvidé la contraseña — servidor con acceso a su archivo SQLite (local o disco persistente)
```powershell
$env:HADES_DB_FILE = '<ruta al .sqlite>'
# La contraseña nueva se lee por stdin (no queda en el historial de comandos):
Read-Host 'Nueva contraseña' -AsSecureString | ForEach-Object { [Net.NetworkCredential]::new('', $_).Password } | node scripts/reset-local-password.cjs admin
```
Revoca todas las sesiones existentes. Requiere haber compilado la API (`npm run build`).

## C. Después de un despliegue en Render Free (base efímera → sin usuarios)
Render Free **no tiene shell y el disco es efímero**: tras un despliegue la base queda vacía y la API vuelve al modo de primer arranque.
1. Render → servicio `hades-omega` → **Logs**: busca «FIRST RUN DETECTED» y copia el `X-Setup-Token` (válido **1 hora**; si expira, un reinicio genera otro mientras no existan usuarios). No lo pegues en ningún chat/informe.
2. En PowerShell (entrada oculta):
```powershell
$t = [Net.NetworkCredential]::new('', (Read-Host 'Setup token' -AsSecureString)).Password
$p = [Net.NetworkCredential]::new('', (Read-Host 'Nueva passphrase' -AsSecureString)).Password
$body = @{ username = 'admin'; password = $p } | ConvertTo-Json
Invoke-RestMethod -Method Post https://hades-omega.onrender.com/api/v1/setup/init -Headers @{ 'X-Setup-Token' = $t } -ContentType 'application/json' -Body $body
Remove-Variable t, p, body
```
3. Inicia sesión en el frontend con `admin` y la passphrase. El endpoint queda deshabilitado (409/404) en cuanto existe un usuario.
4. Hazlo **inmediatamente** tras el despliegue: mientras no haya usuarios, cualquiera con acceso a los logs de Render podría usar el token. El modo DEMO no crea usuarios ni abre esta ventana.

## D. Prevención
- Guarda la passphrase en un gestor de contraseñas.
- Respaldos locales consistentes: `HADES_DB_FILE=<db> node scripts/backup-sqlite.cjs <respaldo.sqlite>` (VACUUM INTO + integrity_check). Restauración: detener la API, copiar el respaldo sobre `HADES_DB_FILE` (borrando `-wal`/`-shm`) y arrancar.
- Para que los datos sobrevivan a los despliegues se necesita disco persistente (plan de pago de Render); no contratado.
