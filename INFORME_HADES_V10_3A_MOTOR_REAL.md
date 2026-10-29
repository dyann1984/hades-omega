# HADES V10.3A — despachador multiagente

**Estado: incompleto. El motor real no está terminado y el criterio de éxito no se cumple.**

## Recuperación

Rama `codex/hades-v10-3-ejecucion-real`. El commit `dc5b484` conserva los siete archivos de telemetría revisados, sobre el punto anterior `c025495`. No incluye bases de datos, secretos, temporales ni respaldos locales. No se modificó el holograma ni la interfaz, ni se fusionó o desplegó.

## Implementación parcial

Se añadió `capability-dispatcher.ts` con un despachador determinista aislado que comprueba la compatibilidad del agente y la capacidad en el registro existente y rechaza capacidades no implementadas. Sus funciones encadenan extracción de texto y evidencia (CHARON), validación básica de entrada (MINOS), recopilación comparativa de números (PERSEPHONE), informe textual (ELYSIUM) y hash SHA-256 del informe (TARTARUS). Son funciones locales por capacidad, no invocaciones a las clases de agentes existentes. La búsqueda numérica no interpreta moneda ni significado contractual y no constituye asesoría jurídica ni inteligencia generativa.

En una prueba aislada, los documentos con importes 12,100, 45,600 y 78,900 produjeron esos mismos valores; el sello se comparó con el hash calculado independientemente del informe. También se probaron capacidad incompatible, capacidad sin implementación y entrada inválida. Estas pruebas no demuestran ejecución de una misión persistente.

## Problemas y riesgos pendientes

- El despachador **no está conectado** a la creación ni a la ejecución de misiones. No registra transiciones ni resultados en SQLite y no invoca las clases de agentes existentes.
- El flujo multidocumento anterior **todavía crea tareas con `EXECUTED` sin invocar ejecutores**. Permanece funcional y no debe interpretarse como evidencia de una ejecución multiagente real.
- Faltan estados pendientes y en ejecución, fallos y bloqueos persistidos, integración real de CERBERUS, aprobación y reanudación del nuevo flujo, concurrencia y recuperación tras interrupción. El nuevo código no cambia resultados históricos.
- No se ha realizado la prueba obligatoria integrada de tres documentos, aprobación, rechazo, cancelación, duplicados, aislamiento y reinicio sobre el despachador nuevo. No hay E2E de backend del motor nuevo.

## Validación

- Pruebas aisladas del despachador: 2 aprobadas. Typecheck de API: aprobado.
- Suite sin caché: 118 pruebas aprobadas (64 API, 49 core, 5 frontend). Build y typecheck completos sin caché: aprobados. Incluyen pruebas de seguridad y SQLite del flujo existente, pero no un E2E del nuevo despachador.
- Los cambios del despachador y este informe permanecen sin commit; `dc5b484` es el commit de recuperación realizado.
