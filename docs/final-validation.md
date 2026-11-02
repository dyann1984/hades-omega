# Validación final — qué se verificó y qué no

## Verificado

| Área | Resultado |
|---|---|
| Contrato Rust (Docker temporal `rust:1`, cargo 1.99.1) | 12 pruebas pasan; compilación `wasm32-unknown-unknown` release correcta (217,149 bytes) |
| Interfaz real (Playwright, Edge, build de producción) | 20 pruebas: escritorio 1366×800 y móvil 390×844; login, navegación de las 15 secciones, Vault, destinatarios, parada de emergencia, aprobar/rechazar en Auditoría, NEAR, CERBERUS, CHRONOS; sin secretos en HTML/texto/respuestas (canarios) |
| Agentes | CHARON, MINOS, PERSEPHONE, ELYSIUM, TARTARUS ejecutan tareas reales con resultado, marca de tiempo y eventos de ejecución persistidos; etapas planificadas no se muestran como ejecutadas |
| IA generativa | Apagada por defecto; ver `docs/llm-governance.md` |

Evidencia visual: `npx playwright test e2e/evidence.spec.ts` con `E2E_SCREENSHOTS=1` genera capturas en `docs/evidence-ui/`
(carpeta ignorada por git por la regla `evidence-*/`).

## Limitaciones reales

* **NEAR no está confirmado on-chain.** No existe cuenta testnet ni contrato desplegado (consulta RPC: `UNKNOWN_ACCOUNT`).
  Nada se ha firmado, enviado ni desplegado. La pantalla muestra «Configuración pendiente».
* El WASM de la prueba es un build de verificación con `cargo build`; para desplegar hay que usar `cargo near build`
  (ver `docs/near-testnet-runbook.md`). No se desplegó.
* El análisis de documentos es determinista por reglas: no es dictamen jurídico ni entiende texto libre complejo; PDF solo con
  texto extraíble (sin OCR).
* `payment.execute` está registrada en CERBERUS pero **no existe ejecutor de pagos** (a propósito).
* No hay detección de inyección de instrucciones en el texto de los documentos; al no usar IA en esos flujos, no hay un modelo al
  que inyectar. El planificador con IA lo mitiga con minimización y con validación estricta de la respuesta.
* Rutas de lectura NEAR (`/vault/near/probe`, solo ADMIN, sin firma) no pasan por `authorize`; el acceso de lectura a una cuenta
  (`near.account_view`) sí.
* Las pruebas E2E usan Edge instalado (`channel: 'msedge'`); en otra máquina hace falta Edge o cambiar el canal.
* No se hizo push, merge ni despliegue. Todo está en la rama local `dev/e2e-playwright`.
