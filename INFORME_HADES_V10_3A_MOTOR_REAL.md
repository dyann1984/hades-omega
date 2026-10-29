# HADES V10.3A — despachador multiagente

## Integración posterior

La ruta multidocumento crea ahora cinco tareas `QUEUED` persistidas y despacha, en orden, adaptadores deterministas de CHARON, MINOS, PERSEPHONE, ELYSIUM y TARTARUS a través de `capability-dispatcher.ts`. Cada adaptador recibe la salida anterior; las clases originales no se invocan. Una transición a `COMPLETED` se guarda tras devolver el adaptador. Entradas, salidas, errores y transiciones se conservan en SQLite; el fallo detiene los pasos posteriores. No se han modificado resultados históricos; se bloquea la aprobación de misiones multidocumento históricas pendientes para evitar reanudarlas con el flujo anterior.

Antes del sellado se consulta el motor CERBERUS real. `DENY` bloquea; `ESCALATE` y el requisito de aprobación del sellado detienen el flujo. ADMIN puede aprobar o rechazar una sola vez; antes del hash se vuelve a evaluar la política y se bloquean cambios incompatibles. Los eventos secuenciados se registran en transacciones y se publican después de su confirmación, con recuperación mediante el cursor existente. La reasignación de tareas en este flujo está bloqueada para evitar cambiar el ejecutor después de evaluar la política.

Una prueba API autenticada crea tres archivos de texto con importes 11,111, 22,222 y 33,333 MXN, verifica los valores extraídos, la pausa de aprobación y el SHA-256 del informe. Se cubren aislamiento de propietario, reinicio mientras espera aprobación, aprobación concurrente, fallo de validación, cancelación y políticas reales `DENY` y `ESCALATE`. La comparación se limita a rangos cuando cada texto tiene exactamente un importe y una moneda explícita; no infiere conclusiones jurídicas.

Para esos textos, el rango calculado es 11,111–33,333 MXN, diferencia 22,222 MXN; el SHA-256 del informe determinista es `3119808773a4c759a7cdbf0da7091bc41785aebf9f14a5d973c52240fc0d9759`. La secuencia de éxito registra cinco `task.queued`, pares `agent.started`/`agent.completed` para los tres primeros adaptadores, `approval.requested`, `approval.granted`, pares para los dos últimos y `mission.completed`. Los eventos no incorporan el contenido documental.

La ruta admite `Idempotency-Key`: una clave repetida por el mismo propietario y con el mismo contenido devuelve la misión existente, incluso tras reinicio; con contenido distinto responde conflicto. Sin esa cabecera, las solicitudes de creación siguen siendo independientes.

**Limitaciones:** una interrupción durante una tarea o después de registrar una aprobación puede dejar la misión en `RUNNING` o `APPROVED`; no hay recuperación automática con leases ni proceso de reconciliación, y no se ha probado concurrencia entre procesos. El cursor permite recuperar eventos, pero la publicación en vivo no usa outbox y podría perderse si el proceso falla tras el commit. La interfaz anterior no se actualizó para los nuevos estados por instrucción del usuario. La prueba API usa `Fastify.inject`, no un servidor de red independiente. Estas limitaciones impiden declarar completa la integración frente a todos los criterios de recuperación y concurrencia.

Validación de esta integración: suite sin caché, 69 pruebas de API, 49 de core y 5 de frontend aprobadas; los builds incluidos en esa ejecución y el typecheck completo sin caché pasaron. Los últimos ajustes menores de compatibilidad y cancelación recibieron pruebas dirigidas adicionales. Punto de recuperación del prototipo: `cfd5f0b`; integración: `52ed140`.

**Estado de la primera entrega, anterior a la integración descrita arriba: incompleto.**

## Recuperación

Rama `codex/hades-v10-3-ejecucion-real`. El commit `dc5b484` conserva los siete archivos de telemetría revisados, sobre el punto anterior `c025495`. No incluye bases de datos, secretos, temporales ni respaldos locales. No se modificó el holograma ni la interfaz, ni se fusionó o desplegó.

## Implementación parcial

Se añadió `capability-dispatcher.ts` con un despachador determinista aislado que comprueba la compatibilidad del agente y la capacidad en el registro existente y rechaza capacidades no implementadas. Sus funciones encadenan extracción de texto y evidencia (CHARON), validación básica de entrada (MINOS), recopilación comparativa de números (PERSEPHONE), informe textual (ELYSIUM) y hash SHA-256 del informe (TARTARUS). Son funciones locales por capacidad, no invocaciones a las clases de agentes existentes. La búsqueda numérica no interpreta moneda ni significado contractual y no constituye asesoría jurídica ni inteligencia generativa.

En una prueba aislada, los documentos con importes 12,100, 45,600 y 78,900 produjeron esos mismos valores; el sello se comparó con el hash calculado independientemente del informe. También se probaron capacidad incompatible, capacidad sin implementación y entrada inválida. Estas pruebas no demuestran ejecución de una misión persistente.

## Problemas y riesgos identificados en la primera entrega

- El despachador **no está conectado** a la creación ni a la ejecución de misiones. No registra transiciones ni resultados en SQLite y no invoca las clases de agentes existentes.
- El flujo multidocumento anterior **todavía crea tareas con `EXECUTED` sin invocar ejecutores**. Permanece funcional y no debe interpretarse como evidencia de una ejecución multiagente real.
- Faltan estados pendientes y en ejecución, fallos y bloqueos persistidos, integración real de CERBERUS, aprobación y reanudación del nuevo flujo, concurrencia y recuperación tras interrupción. El nuevo código no cambia resultados históricos.
- No se ha realizado la prueba obligatoria integrada de tres documentos, aprobación, rechazo, cancelación, duplicados, aislamiento y reinicio sobre el despachador nuevo. No hay E2E de backend del motor nuevo.

## Validación

- Pruebas aisladas del despachador: 2 aprobadas. Typecheck de API: aprobado.
- Suite sin caché: 118 pruebas aprobadas (64 API, 49 core, 5 frontend). Build y typecheck completos sin caché: aprobados. Incluyen pruebas de seguridad y SQLite del flujo existente, pero no un E2E del nuevo despachador.
- Los cambios del despachador y este informe permanecen sin commit; `dc5b484` es el commit de recuperación realizado.
