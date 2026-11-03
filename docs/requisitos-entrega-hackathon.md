# Requisitos de entrega — NEAR HACKATHON 2026

**Fuentes (consultadas el 2026-11-02):** https://nearhackathon.com/ y su archivo https://nearhackathon.com/HACKATHON.md. No encontré un documento de «términos y condiciones» separado: la página no enlaza reglas completas. Un resumen de terceros (issue de GitHub) coincide con los campos del formulario, pero no es oficial.
**Antes de enviar, vuelve a leer ambas páginas**: pueden cambiar y el envío no se puede editar.

## Fechas (UTC)

| Hito | Fecha |
|---|---|
| Anuncio | 2026-10-19 |
| Inicio / envíos abiertos | 2026-11-01 00:00 |
| **Fin del desarrollo y plazo de envío** | **2026-11-14 23:59 UTC** (= 17:59 en Ciudad de México, UTC−6) |
| Jueces | 2026-11-16 a 18 |
| Resultados | hasta 2026-11-18 23:59 |

## Lo que se exige y cómo estamos

| # | Requisito oficial | Estado | Qué falta (acción exacta) |
|---|---|---|---|
| 1 | **Repositorio público** durante todo el juicio («los jueces no pueden abrir uno privado») | ✅ `github.com/dyann1984/hades-omega` es público (consultado por la API pública) | Mantenerlo público hasta el 18-nov |
| 2 | **La rama que juzgan tiene el trabajo**: la rama por defecto es `main`; el trabajo está en `feat/hades-hackathon-hardening` | ⚠️ `main` NO tiene los commits recientes (contrato desplegado, verificador, README nuevo) | **Decisión del dueño**: integrar la rama a `main` (PR) o cambiar la rama por defecto. Hoy no está autorizado. Sin esto, un juez que abra el repo verá el README viejo |
| 3 | **Publicación del demo en X** (pública), que diga que se construyó en NEAR HACKATHON, etiquete **@NEARProtocol** y **#NEARHackathon**, con **video** (HACKATHON.md Q-012: «screenshots alone are not enough» para demo solo local) | ⬜ Pendiente | Grabar el video (`docs/guion-video-3min.md`) y publicarlo desde tu cuenta de X. Yo no publico en redes |
| 4 | **Formulario de envío** (una sola vez, no editable): nombre del proyecto, líder, correo, tamaño del equipo, tracks, **dirección de cartera NEAR** (donde se pagaría el premio), enlace del repo, enlace de la publicación en X, descripción de 20–2000 caracteres (problema, producto, papel de NEAR) | ⬜ Pendiente | Borrador de campos abajo. **Cartera de premio: decide tú** (¿cuenta personal o `hades-omega.testnet`? El premio se paga en NEAR real, y una cuenta testnet no sirve para cobrar) |
| 5 | **README para humanos y máquinas**, con pasos «haz X → ve Y», sin marketing; **cribado inicial por Claude Code y Codex** que comprueban que el proyecto corre y hace lo que dice el README | ✅ README reescrito con comandos verificados en un contenedor Linux limpio | Re-ejecutar la verificación tras integrar a `main` |
| 6 | **LICENSE** (Q-014: «con un archivo LICENSE», se sugiere MIT) | ❌ **No existe** archivo `LICENSE` | **Decisión del dueño**: elegir licencia (MIT es la sugerida). No la añado por mí: define derechos sobre tu obra |
| 7 | **Declarar** librerías, plantillas y código generado por IA (Q-005); lo previo al hackathon es base (Q-001) | ✅ Declarado en README (sección «Hackathon disclosures») | Si hay código anterior al 2026-10-19, indicarlo. El primer commit del repo es del 2026-10-24 |
| 8 | **Integración con NEAR construida en la ventana** y explicada concretamente (no «powered by NEAR») | ✅ Contrato propio en testnet + tubería de firma con llave restringida | — |
| 9 | Testnet es elegible en todos los tracks (Q-010); no hay integración obligatoria (Q-011) | ✅ | — |
| 10 | Si envías dos proyectos, cada README nombra al otro (Q-015) | N/A | — |
| 11 | Derechos: el equipo conserva todo; los organizadores reciben derechos promocionales no exclusivos sobre nombre, capturas, video y enlace (Q-013) | ℹ️ Informativo | Asegúrate de que el video y las capturas no contengan datos personales ni claves |

## Tracks recomendados (el formulario permite varios)

1. **AI Security & Defense**: «Give AI money without giving it the keys to everything». Encaja con CERBERUS + aprobación humana de un solo uso + llave FunctionCall limitada.
2. **AI Swarms**: sistemas multiagente. Encaja con HADES + 5 agentes.
3. Opcional: **Open Innovation**. *No* marcaría «Autonomous Business» ni «Agent Economy»: no hay tesorería, ventas ni pagos entre agentes implementados, y los jueces verifican que el proyecto haga lo que dice.

## Borrador de la descripción (≈ 900 caracteres; revisar antes de enviar)

> HADES OMEGA es un sistema multiagente que audita documentos empresariales y solo puede tocar la blockchain a través de una puerta de seguridad (CERBERUS). Problema: un agente de IA con claves es un riesgo de pérdida por un fallo o una inyección de instrucciones. Producto: los agentes analizan; cualquier acción sensible exige una aprobación humana ligada a los parámetros exactos, de un solo uso, con parada de emergencia y bitácora encadenada por hash. Papel de NEAR: un contrato propio en Testnet (`audit.hades-omega.testnet`, Rust) registra hashes de auditoría; el servidor firma con una llave FunctionCall limitada a `store_audit_hash` de ese contrato (0.25 NEAR de gas), y rechaza llaves FullAccess. Hay un registro real verificable (tx BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3) y un verificador público de solo lectura. Limitaciones: solo Testnet; la demo pública simula NEAR; no hay pagos ni NEAR Intents.

(En inglés para el formulario si lo prefieres; el límite es de caracteres, no de idioma. La versión final la apruebas tú.)

## Lista de verificación el día del envío

- [ ] Repo público y `main` (o la rama por defecto) contiene el README nuevo y `docs/JUDGES.md`
- [ ] `LICENSE` presente
- [ ] `node scripts/verify-attestation-onchain.cjs` pasa 18/18 ese mismo día
- [ ] Publicación en X visible sin iniciar sesión, con @NEARProtocol y #NEARHackathon, video adjunto
- [ ] Un navegador sin sesión abre el enlace del repo y el del post
- [ ] Formulario enviado **antes de 2026-11-14 23:59 UTC**; guardar la confirmación
- [ ] Ninguna clave, frase semilla ni contraseña en el video, capturas, repo o post
