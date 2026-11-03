# Propuesta — demostración pública para jueces (NO ejecutada)

**Estado:** preparada y probada en local. **No se ha desplegado nada, no se tocó ningún proyecto de Vercel/Render existente, no se creó cuenta, llave ni transacción.** Cada paso de ejecución está marcado con 🔒 y necesita tu autorización explícita.

## 1. Objetivo y alcance

Que un juez, sin depender de tu computadora, pueda: (1) entrar y entender HADES, (2) ejecutar una misión de demostración, (3) comprobar el registro real en NEAR Testnet.

La demo **no firma ni envía nada**. Lo simulado está rotulado «Simulada» en la interfaz; el registro real `hades-attest-0001` se enlaza (explorador + verificador de solo lectura). Las tres piezas ya existen en el commit `1ea6cee`.

## 2. Arquitectura propuesta (dos servicios nuevos, independientes de los existentes)

| Pieza | Dónde | Nombre | Contenido |
|---|---|---|---|
| Frontend estático | **Vercel, proyecto nuevo** | `hades-omega-judges` (el nombre debe estar libre; si no, otro) | `dist` del frontend + `vercel.json` con cabeceras; incluye `/verify/index.html` |
| API de la demo | **Render, servicio nuevo** | `hades-demo-api` | Solo sesiones DEMO: sin variables `NEAR_*`, sin clave de Anthropic, sin llave |

**Por qué no todo en Vercel:** la API es un servidor Fastify con WebSocket, SQLite y un planificador (CHRONOS) que corre con `setInterval`; no encaja en funciones serverless. Por eso el frontend va en Vercel y la API en un servicio aparte (el mismo patrón del `render.yaml` actual, pero con un servicio nuevo y menos variables).

**Aislamiento de lo existente:**
* Hoy `L:\HADES\.vercel` y `packages\frontend\.vercel` están enlazados al proyecto **existente** `hades-omega`. Desplegar desde esa carpeta lo modificaría. Por eso el paquete se **prepara en una carpeta aparte, sin `.vercel`**, y el despliegue se hace desde ahí (`.vercel present: false` verificado).
* El `vercel.json` y el `render.yaml` de la raíz **no se modifican**. Los archivos nuevos viven en `deploy/demo/`.
* Dominios existentes: no se tocan. El proyecto nuevo usa su URL `*.vercel.app`.

## 3. Configuración exacta

**Variables en Vercel (build):** únicamente `VITE_API_URL=https://<hades-demo-api>.onrender.com`. Es pública por naturaleza. `VITE_WS_URL` no es necesaria: si falta, el frontend deriva `wss://<api>/ws` de `VITE_API_URL` (`hooks/useWebSocket.ts`). No existe ninguna otra variable `VITE_*` en el código (`VITE_API_URL`, `VITE_WS_URL`); `VITE_DEV_TOKEN` de tu `.env.local` **no se usa en el código** y no entra en el bundle.

**Variables en Render** (`deploy/demo/render.demo.yaml`): `NODE_ENV=production`, `ALLOWED_ORIGIN=<URL exacta del sitio de Vercel>`, `JWT_SECRET` generado por Render (`generateValue`), rutas SQLite efímeras. **Ausentes a propósito:** `NEAR_*`, `ANTHROPIC_API_KEY`, `HADES_DURABLE_*`, cualquier llave.

**No crear ningún administrador en `hades-demo-api`.** El `X-Setup-Token` que imprime el arranque permitiría crearlo; no hace falta para la demo.

**Cabeceras** (generadas en `vercel.json`): `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` restrictiva, HSTS. La página `/verify/` lleva CSP estricta (`default-src 'none'`, script por hash, `connect-src` solo `test.rpc.fastnear.com`). La app principal **no** lleva CSP todavía (usa WebGL/Three.js y fuentes de Google); activarla sin probar podría romperla. Queda como mejora posterior.

## 4. Costos (verificados hoy en la documentación oficial)

| Servicio | Plan | Costo | Límites relevantes |
|---|---|---|---|
| Vercel | Hobby | **$0** | 100 GB de transferencia, 1 M de peticiones CDN/mes, 100 despliegues/día. **«Solo uso personal y no comercial»** (fair use). Un concurso de hackathon es de baja ambigüedad, pero conviene saberlo. Fuente: vercel.com/docs/plans/hobby |
| Render | Free (web) | **$0** | Se duerme tras **15 min sin tráfico**; despertar tarda **≈1 minuto**; sistema de archivos **efímero** (se pierde al reiniciar/redesplegar/dormir); 750 h/mes; «no usar para producción». Fuente: render.com/docs/free |
| Alternativa persistente | Render Starter | ≈ $7/mes (cifra del `render.yaml` del repo, no verificada hoy) | Sin dormirse |

**Consecuencia de la capa gratuita:** si un juez abre la demo tras 15 min de inactividad, verá ≈1 minuto de espera; el frontend ya muestra una pantalla de arranque y «calienta» el backend. Las sesiones DEMO viven en memoria: si la API se duerme a mitad de una sesión, el juez debe pulsar «Explore Demo» otra vez. Recomiendo el plan gratuito durante la evaluación y, si ves que el cribado automático (que corre 1 sola vez) tropieza con el arranque, pasar a Starter los días 14–18 de noviembre.

## 5. Pruebas de seguridad ya hechas (evidencia reproducible)

| Prueba | Resultado |
|---|---|
| `scripts/check-public-demo-safety.cjs` — API sin variables NEAR: anónimo 401, sesión DEMO 403 en todas las rutas NEAR/CERBERUS/Vault, ADMIN sin firmante y con firma apagada | 25/25 |
| `scripts/check-bundle-secrets.cjs` sobre el bundle construido desde copia limpia (sin `.env.local`, sin `.vercel`) | 13/13: sin mapas de código, sin llaves/JWT/tokens, solo variables `VITE_` permitidas, **ningún valor de tus `.env` locales presente**, orígenes de red esperados |
| Mutación del escáner: inyecté un JWT con el valor real de `JWT_SECRET` y una clave tipo Anthropic | Detectados (el escáner falla como debe) |
| Página `/verify/` servida con las cabeceras reales de `vercel.json` en Edge | 13/13 comprobaciones, **0 violaciones de CSP**; `/near` responde como SPA; `/verify/inexistente` da 404 |
| Reproducción en Linux limpio (Node 22): `npm ci`, build, `dev:all`, sesión DEMO por el proxy con `Origin` de navegador | OK (ver `docs/test-evidence-final/`) |
| Pruebas unitarias del frontend (incluye 3 nuevas: enlace real, sin hash inventado, verificador idéntico y sin capacidad de firmar) | 75/75 |

**Lo que NO está probado todavía** (solo se puede después de desplegar): comportamiento real de Render (arranque en frío, CORS con el dominio definitivo, WebSocket a través de Render) y la CSP/cabeceras servidas por Vercel (las probé con un emulador local de `vercel.json`, no con Vercel).

## 6. Pasos de ejecución (cada uno 🔒 requiere tu autorización)

1. 🔒 **Publicar los commits locales** de la rama (hoy hay 5 sin subir). Hecho esto: re-escaneo de secretos.
2. 🔒 **Crear `hades-demo-api` en Render** desde `deploy/demo/render.demo.yaml` (crea un servicio, sin tocar `hades-api`). Obtener su URL.
3. **Preparar el paquete** (local, sin desplegar): `node scripts/prepare-public-demo.cjs --api-url https://<hades-demo-api>.onrender.com --out <carpeta>`. Falla si hay cambios sin confirmar o si el escáner encuentra algo.
4. 🔒 **Crear el proyecto nuevo en Vercel desde esa carpeta** (carpeta sin `.vercel`): `vercel deploy --prod --name hades-omega-judges` ejecutado **dentro** de la carpeta preparada, nunca en `L:\HADES`. Antes de confirmar, comprobar en la salida de la CLI que el proyecto es el **nuevo** (`hades-omega-judges`) y no `hades-omega`; si la CLI propone vincular al existente, cancelar.
5. 🔒 Fijar `ALLOWED_ORIGIN` en Render con la URL final de Vercel y reiniciar.
6. **Pruebas posteriores:** repetir `check-public-demo-safety` contra la API pública (solo peticiones de lectura y sesión DEMO), `check-bundle-secrets` contra el sitio descargado, `verify-attestation-onchain.cjs`, y un recorrido en navegador sin sesión (también desde móvil).
7. Añadir las URLs a README/JUDGES y al post de X.

**Reversión:** borrar el proyecto nuevo de Vercel y el servicio `hades-demo-api` (no afecta a los existentes). No hay datos que conservar.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Alguien abusa del endpoint público de sesiones DEMO | Ya limitado en el código: 40 sesiones totales, 5 por IP, 5 ejecuciones por sesión, 30 min de vida, 10 sesiones/min |
| Un administrador creado por un tercero | No existe admin; no crear ninguno; los endpoints sensibles exigen autenticación y dan 401/403 |
| Se filtra una clave por error de configuración | El servicio no tiene ninguna; el escáner de bundle es un requisito previo al despliegue |
| El nombre del proyecto de Vercel ya existe | Elegir otro; la URL se fija después y se actualiza `ALLOWED_ORIGIN` |
| El plan gratuito de Render se duerme | Documentado; opción Starter en las fechas de juicio |
