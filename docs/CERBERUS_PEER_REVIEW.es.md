# Peer-review — CERBERUS (HADES OMEGA)

**De:** equipo NEXUS (HiveBid/AEGIS) · hackathon NEAR  
**Re:** CERBERUS como motor de policy/audit de HADES OMEGA  
**Fuentes:** `docs/HIVEBID_VS_HADES.md`, `D:/Temp/hades-omega/docs/03-cerberus-spec.md`, `04-near-integration.md`, `05-security-threats.md`, `06-api-contracts.md`, `09-backlog.md`; experiencia AEGIS GUARD (`tools/nexus_core/aegis.py`, `reports/SPARK-aegis-*`).

— no es un ataque. Es peer-review: observaciones y lo que mejoraríamos, con referencias a su documentación.

## Lo que vemos

- CERBERUS = motor off-chain (GUARD/AUDIT/RESPONSE), tres cabezas. Política = reglas JSON con condición `field/operator/value`, decision → PERMIT/DENY/ESCALATE + auditId.
- Fail-secure declarado como principio: ante excepción/timeout → DENY `GUARD_INTERNAL_ERROR`.
- Audit: append-only, hash en NEAR, 100% de decisiones, incluidos PERMIT.
- Lado NEAR: `04-near-integration.md` — on-chain es efectivamente un append-only hash-log (184 líneas), deploy no verificado, «0 txs reales». El motor de políticas vive fuera de la cadena.

## Hallazgos

### C-1: fail-secure queda como declaración off-chain

En la práctica «si CERBERUS cae → DENY» solo funciona si CERBERUS está en el camino de la llamada y es fail-closed por defecto. Ustedes no están en el camino del payout: la decisión de política no se comitea en la llamada NEAR, la operación continúa en el Agent Runtime. Nosotros pusimos AEGIS GUARD como gate antes de las llamadas de payout, no como recomendación. Recomendación: hacer CERBERUS un hard gate en operaciones críticas (y guardar la decisión en la transacción/log), si no cualquier agente puede evadirlo.

### C-2: orden de reglas y prioridades no especificados

Pipeline de 7 pasos (-schema→authorization→policy→threshold→conflict→decision→audit) y «primera regla que dispara». La spec no describe orden, prioridad ni tie-break. Con reglas solapadas el resultado depende del orden de diccionarios/implementación. Agregaríamos prioridad explícita y ordenamiento determinista, cubierto con property-tests «mismo input → mismo verdict».

### C-3: audit-chain no descrito como verificable

AuditRecords — append-only + hash on-chain. Pero no hay descripción de prev-hash linkage ni forma de verificación independiente de la cadena. Recomendación: Merkle/root-hash por batch o prev-hash en el registro; un comando verify para que un indexador pueda comprobarla.

### C-4: policy_hash staleness en approve

Análogo a E10-H (nosotros lo corregimos): la política puede cambiar entre la propuesta y la ejecución. Obligatorio fijar policy_hash/policy_version en OperationProposal y verificar coincidencia antes de PERMIT. Sin eso hay approval bajo política vieja.

### C-5: sensitive-classification — ¿quién la define?

En el threat-model, escalación de privilegios E1: «agente fuera de lista → DENY». Pero la sensibilidad (qué payload cuenta como sensitive) parece definirla el operador y se pasa. Nuestra lección AEGIS: sensitive controlado por el caller = agujero. Recomendación: clasificación server-side, enumeración inmutable de campos sensibles.

### C-6: confianza del NEAR-bridge no descrita

NEAR Bridge ↔ NEAR Testnet — frontera externa. El audit-hash «en NEAR» solo funciona si (a) el contrato está desplegado y (b) hay retry/reconciliación cuando testnet cae (ustedes mismos escriben «NEAR Testnet no disponible — operaciones no esperan confirmación», D3). Eso hace el audit best-effort, no verdad. Recomendación: cola de reconciliación explícita y estado «pending on-chain» en el audit.

### C-7: falta catálogo de deny-reasons / disciplina de exit-code

DENY devuelve `reason: DenyReason`, pero el catálogo de razones no está enumerado; UI/indexadores no podrán distinguir clases. Introduciríamos un enum estable + códigos.

### C-8: faltan eventos de gobernanza (como en Veto)

Cambios de política, rotación de agentes, pause no emiten eventos — el indexador ve gastos, no cambios de política. Agreguen eventos de gobernanza NEP-297.

### C-9: brecha nft/NEAR bridge — realidad on-chain

Como en `HIVEBID_VS_HADES.md`: on-chain es efectivamente un hash-log de 184 líneas, «0 txs reales». Sentido peer: no prometan garantía chain en un deploy de papel.

## Recomendaciones (resumen)

1. **Hard gate de CERBERUS en operaciones críticas; `policy_hash` en la propuesta.**
2. **Orden determinista de reglas + property-tests.**
3. **Audit-chain verificable (prev-hash/Merkle).**
4. **Eventos de gobernanza.**
5. **Cola de reconciliación para NEAR.**
6. **Clasificación sensitive server-side.**
7. **Enum estable de DenyReason.**

## Lo que preservamos

Es un documento de diseño honesto y maduro; nos gusta el principio fail-secure y las policy-schemas. Solo lo que lo mejoraría.

**Sin código, sin commits.** Reporte/nota de docs para el owner de HADES.
