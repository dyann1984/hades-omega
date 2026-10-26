@echo off
setlocal EnableExtensions DisableDelayedExpansion
title HADES OMEGA - Inicio local seguro

rem This launcher intentionally uses npm.cmd: it does not invoke PowerShell's npm.ps1.
set "ROOT=%~dp0"
cd /d "%ROOT%" || (echo [ERROR] No se pudo abrir el directorio del proyecto.& pause & exit /b 1)
set "ENV_FILE=%ROOT%.env.local"
set "LOG_DIR=%ROOT%logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1

where node.exe >nul 2>&1 || (echo [ERROR] Node.js 20 o superior no esta disponible.& pause & exit /b 1)
where npm.cmd >nul 2>&1 || (echo [ERROR] npm.cmd no esta disponible.& pause & exit /b 1)
if not exist "%ROOT%node_modules" (
  echo [ERROR] Faltan dependencias. Ejecute primero: npm.cmd install
  pause
  exit /b 1
)

rem Load the local, gitignored development configuration when present.
if exist "%ENV_FILE%" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do if not "%%A"=="" set "%%A=%%B"
)

rem Create only a local development secret. Hex output is never printed.
if not defined JWT_SECRET (
  for /f "usebackq delims=" %%S in (`node.exe -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))"`) do set "JWT_SECRET=%%S"
)
if not defined HADES_DATA_FILE set "HADES_DATA_FILE=%ROOT%data\hades.json"
if not defined HOST set "HOST=127.0.0.1"
set "PORT=3001"

call :find_free_port 5173 FRONTEND_PORT
if not defined FRONTEND_PORT (
  echo [ERROR] No se encontro un puerto local libre entre 5173 y 5183.
  echo         No se termino ningun proceso. Revise los puertos con: netstat -ano ^| findstr :5173
  pause
  exit /b 1
)
set "ALLOWED_ORIGIN=http://127.0.0.1:%FRONTEND_PORT%,http://localhost:%FRONTEND_PORT%"

> "%ENV_FILE%" (
  echo NODE_ENV=development
  echo HOST=%HOST%
  echo PORT=%PORT%
  echo JWT_SECRET=%JWT_SECRET%
  echo ALLOWED_ORIGIN=%ALLOWED_ORIGIN%
  echo HADES_DATA_FILE=%HADES_DATA_FILE%
  echo NEAR_EXECUTION_MODE=simulation
  echo VITE_API_URL=http://127.0.0.1:%PORT%
  echo VITE_WS_URL=ws://127.0.0.1:%PORT%/ws
)

call :api_ready
if errorlevel 1 (
  echo [HADES] Iniciando API local en 127.0.0.1:%PORT%...
  start "HADES API" /b npm.cmd run dev --workspace=@hades/api > "%LOG_DIR%\api-%PORT%.log" 2>&1
  call :wait_api
  if errorlevel 1 (
    echo [ERROR] La API no respondio. Revise "%LOG_DIR%\api-%PORT%.log"
    pause
    exit /b 1
  )
) else echo [HADES] API ya disponible en 127.0.0.1:%PORT%.

call :frontend_ready %FRONTEND_PORT%
if errorlevel 1 (
  echo [HADES] Iniciando interfaz en 127.0.0.1:%FRONTEND_PORT%...
  start "HADES Frontend" /b npm.cmd run dev --workspace=@hades/frontend -- --host 127.0.0.1 --port %FRONTEND_PORT% --strictPort > "%LOG_DIR%\frontend-%FRONTEND_PORT%.log" 2>&1
  call :wait_frontend %FRONTEND_PORT%
  if errorlevel 1 (
    echo [ERROR] El frontend no respondio. Revise "%LOG_DIR%\frontend-%FRONTEND_PORT%.log"
    pause
    exit /b 1
  )
) else echo [HADES] Frontend ya disponible en 127.0.0.1:%FRONTEND_PORT%.

rem Do not report success if a previously-running process disappeared during startup.
call :api_ready
if errorlevel 1 (
  echo [ERROR] La API dejo de responder durante el arranque. Revise "%LOG_DIR%\api-%PORT%.log"
  pause
  exit /b 1
)
call :frontend_ready %FRONTEND_PORT%
if errorlevel 1 (
  echo [ERROR] El frontend dejo de responder durante el arranque. Revise "%LOG_DIR%\frontend-%FRONTEND_PORT%.log"
  pause
  exit /b 1
)

set "HADES_URL=http://127.0.0.1:%FRONTEND_PORT%/"
echo.
echo ==============================================
echo   HADES OMEGA listo: %HADES_URL%
echo   API local:         http://127.0.0.1:%PORT%/health
echo   Seguridad: JWT/RBAC activo; NEAR en simulacion.
echo ==============================================
start "HADES OMEGA" "%HADES_URL%"
exit /b 0

:find_free_port
set "%2="
for /l %%P in (%1,1,5183) do (
  netstat -ano | findstr /r /c:":%%P .*LISTENING" >nul
  if errorlevel 1 if not defined %2 set "%2=%%P"
)
exit /b 0

:api_ready
curl.exe -fsS --max-time 2 http://127.0.0.1:3001/health >nul 2>&1
exit /b %errorlevel%

:frontend_ready
curl.exe -fsS --max-time 2 http://127.0.0.1:%1/ >nul 2>&1
exit /b %errorlevel%

:wait_api
for /l %%I in (1,1,20) do (
  call :api_ready && exit /b 0
  ping.exe -n 2 127.0.0.1 >nul
)
exit /b 1

:wait_frontend
for /l %%I in (1,1,20) do (
  call :frontend_ready %1 && exit /b 0
  ping.exe -n 2 127.0.0.1 >nul
)
exit /b 1
