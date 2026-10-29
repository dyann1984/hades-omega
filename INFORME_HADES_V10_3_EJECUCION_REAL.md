# HADES V10.3 — ejecución documental y telemetría

Fecha: 29 de octubre de 2026. **Estado: avance parcial; la condición de éxito NO está verificada.**

## Preservación y estado inicial

- Rama `codex/hades-v10-3-ejecucion-real`, creada sobre `e5e0b06` con los cambios locales V10.2 conservados.
- Los cinco archivos frontend modificados y el informe V10.2 se copiaron en `recovery-v10-2-before-v10-3`. No se modificó `main`, se fusionó ni desplegó. Los cambios están sin commit.
- La suite base `npm run test:all` terminó con seis tareas satisfactorias; cuatro resultados procedían de caché de Turbo, incluidos los tests de core y API. Frontend: cinco pruebas ejecutadas y build completado. No es una regresión completa sin caché.

## Auditoría de ejecución

- `SqliteRepository.createMultiDocumentMission` crea las tres primeras tareas como `EXECUTED` directamente. No despacha las instancias CHARON, MINOS y PERSEPHONE ni registra el comienzo y final de cada una. MINOS usa una coincidencia elemental de texto; antes PERSEPHONE devolvía discrepancias fijas independientemente de la entrada.
- `decideLocalOperation` antes generaba cifras, conclusiones y un dictamen fijos en el informe. El hash de la tarea posterior se calculaba a partir de un identificador y otro hash, no del entregable. La rama genérica declaraba una tarea ejecutada sin un ejecutor correspondiente.
- El estado `simulated: false` en esas tareas no demuestra por sí mismo ejecución del agente. El guardado de misión y aprobación no constituye evidencia de que CERBERUS haya evaluado la operación en el flujo multidocumental.
- Se identificaron otras declaraciones `simulated: false` en agentes, orquestador y planificador. No se han auditado exhaustivamente todas sus rutas ni se ha demostrado que correspondan a ejecuciones reales. NEAR real sigue sin implementar; el puente demo no acredita transacciones.
- Los registros históricos no se migraron ni reescribieron. Las operaciones históricas pendientes aún requieren una estrategia explícita de recuperación y no deben interpretarse como un flujo V10.3 verificado.

## Cambios locales

- Se añadió extracción determinista de importes, porcentajes y palabras de cláusulas a partir de cada texto, con offset, hash SHA-256 y tamaño. Es búsqueda textual; no interpreta semántica, moneda asociada, validez jurídica ni inteligencia generativa. Los resultados de estas etapas y del informe y sello locales se etiquetan como `DEMO`/simulados respecto al despacho de agentes.
- La salida de comparación del flujo local usa esa evidencia en lugar de las tres discrepancias prefijadas. El informe se construye con los hallazgos de los documentos y declara su alcance limitado, sin cifras ni dictamen prefijados.
- El hash de custodia posterior usa el contenido exacto del informe en UTF-8. Se valida que las capacidades posteriores estén disponibles y se rechazan capacidades desconocidas en lugar de marcarlas como ejecutadas. La tarea de custodia nueva se asigna a TARTARUS.
- Estos cambios **no convierten el flujo en un motor multiagente real**: los ejecutores específicos no se despachan, los primeros estados finales siguen siendo prematuros, la evaluación CERBERUS no está integrada y las transiciones solicitadas no se han implementado. No debe utilizarse el flujo como evidencia de actividad real de agentes.

## Pruebas y resultados

- Análisis documental: dos pruebas con tres textos distintos, importes, offsets, hashes y ausencia de hallazgos inventados.
- Regresión dirigida: cinco pruebas aprobadas en tres archivos, incluida una prueba con tres importes nuevos, verificación del hash del informe, prevención de aprobación duplicada y persistencia tras reabrir SQLite. También pasaron las suites locales y de fase 8 existentes. Estas pruebas no demuestran despacho real de agentes ni holograma.
- Type-check de API: aprobado. La primera regresión de API sin caché produjo 59 pruebas aprobadas y un timeout en revocación de WebSocket bajo ejecución concurrente; con un solo worker pasaron las 60. Estas ejecuciones precedieron a los últimos ajustes de etiquetado; después pasaron seis pruebas dirigidas de análisis, evidencia y fase 8.

## Eventos, visualización y pendientes

- Eventos persistentes V10.3 añadidos: **ninguno**. No hay secuencia recuperable ni replay autorizado. El WebSocket existente y el holograma no están conectados a transiciones persistentes de este flujo.
- Falta implementar colas, inicio real, transacciones de estado, recuperación tras fallos, ejecución por capacidades y políticas CERBERUS, aislamiento y secuencia por misión, replay, deduplicación y efectos visuales correlacionados.
- No se realizó E2E desde la interfaz, captura de holograma, prueba de rechazo y error visual, medición GPU/FPS o verificación WCAG/móvil. No hay capturas ni resultados que acrediten esas etapas.
- Riesgo principal: el flujo existente sigue mostrando tareas `EXECUTED` y declaraciones de ejecutores sin haber despachado dichos agentes. El cambio de resultados fijos reduce un error de contenido, pero no corrige esa discrepancia de ejecución. Se necesita completar el motor y sus pruebas antes de declarar PASS o usarlo como evidencia.
