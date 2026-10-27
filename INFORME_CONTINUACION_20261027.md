# HADES OMEGA — Informe de continuación 2026-10-27

## Estado inicial
Rama `codex/recovery-omega-20261026`, HEAD `b6df4f7`. Existían cambios sin confirmar en `hades.ts`, `index.ts`, tipos y `planning/`; se preservaron en `recovery-20261027-initial/`. Los tres archivos visuales indicados no tenían modificaciones pendientes. Node 22.23.2. La compilación inicial fallaba por errores de tipos del planificador y una expresión inválida.

## Reparaciones
- Las tareas usan el ID real de la misión. Solo una dependencia ejecutada habilita sucesoras; tareas fallidas, pendientes de aprobación o simuladas no las habilitan. Las simulaciones se suspenden sin repetición infinita y las misiones incompletas o fallidas no se declaran completadas.
- Las asignaciones a CERBERUS se representan en el tipo, pero fallan si no existe ejecutor registrado. No se inventa una implementación.
- Solo ADMIN puede registrar una decisión de aprobación. Pruebas específicas cubren autorización y dependencias.

## Evidencia y límites
- PASS: comprobación de tipos de los tres paquetes tras las correcciones.
- PASS: pruebas específicas de dependencias y autorización; pruebas existentes de núcleo y API según ejecución observada.
- La aprobación se registra, pero no reanuda ni autoriza la operación. El planificador es de reglas y marca su plan como simulado; existen agentes con datos de demostración.
- El almacenamiento implementado es JSON local, no SQLite. No se ha verificado comportamiento multiusuario ni resistencia a concurrencia o fallos de escritura.
- WebSocket `/ws` no exige autenticación y difunde eventos a todos los clientes; no apto para exposición empresarial. La ruta de aprobación no verifica que exista una escalación real.
- NEAR genera transacciones simuladas; el modo real lanza un error. El estado de conexión y enlaces simulados pueden inducir a error.
- No hay evidencia de ejecución de herramientas externas autorizadas, cancelación, coordinación empresarial completa o recuperación/reanudación tras reinicio. No se ha verificado E2E en navegador, inicio de servicios ni seguridad integral. No desplegar para uso empresarial hasta resolverlos.
- La ruta de misión espera la ejecución completa y la persistencia ocurre al final; progreso durable durante ejecución no está garantizado. Auditorías globales pueden mezclarse entre misiones.

## Siguientes pasos
Autenticar y aislar WebSocket, vincular aprobaciones a escalaciones reales con controles de identidad y reanudación segura, diseñar ejecución durable/cancelable y acceso transaccional, identificar y etiquetar todos los datos demo, integrar herramientas reales autorizadas y añadir pruebas E2E. Revisar el planificador previo y dar a CERBERUS un modelo coherente de servicio de seguridad en lugar de agente ejecutor.
