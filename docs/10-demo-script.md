# HADES OMEGA — Guion de Demostración

**Versión:** 0.1 (Fase de Planificación)
**Fecha:** Octubre 2026
**Audiencia:** Jueces del NEAR Hackathon 2026
**Duración objetivo:** 3–5 minutos en vivo + 2 min de preguntas

---

## 1. Propuesta de valor para abrir la demo

> "Las empresas toman miles de decisiones operativas por día — compras, validaciones de presupuesto, evaluaciones de proveedores — que son lentas, propensas a errores y casi imposibles de auditar.
>
> HADES OMEGA es el primer sistema operativo empresarial de agentes autónomos de IA donde cada decisión es verificable on-chain en NEAR Blockchain.
>
> En los próximos 3 minutos van a ver a 6 agentes de IA colaborar en una misión empresarial real, con auditoría en tiempo real y una transacción verificable en NEAR Testnet que cualquiera puede abrir ahora mismo."

---

## 2. Escenario de demo

### La misión

**Empresa ficticia:** TechCore Industries *(datos 100% sintéticos)*
**Misión:** "Evaluar y seleccionar un proveedor de infraestructura cloud para expandir capacidad de servidores. Presupuesto total disponible: $50,000 MXN. Se necesitan al menos 5 servidores durante 12 meses."

Esta misión fue elegida porque:
- Es reconocible para jueces no técnicos
- Involucra los 6 agentes de forma natural
- Genera **dos momentos CERBERUS distintos**: un DENY por presupuesto insuficiente y un ESCALATE para aprobación humana
- Produce una transacción NEAR verificable en la resolución final

### Flujo esperado del escenario

```
1. HADES descompone misión → tareas a CHARON, PERSEPHONE, ELYSIUM
2. CHARON evalúa proveedores → selecciona CloudPro (87/100)
3. CHARON propone orden de compra por $78,500 MXN (paquete premium)
4. PERSEPHONE valida: $78,500 > $50,000 disponibles → DENY por fondos insuficientes
5. CERBERUS GUARD → DENY (regla: INSUFFICIENT_FUNDS)
   → CERBERUS AUDIT → AuditRecord con contentHash
   → TARTARUS recibe el DENY, registra anomalía de tipo BUDGET_EXCEEDED
6. CHARON recibe el DENY → re-evalúa con restricción de presupuesto
7. CHARON propone alternativa: CloudPro paquete estándar $42,000 MXN
8. PERSEPHONE valida: $42,000 < $50,000 → dentro del presupuesto ✓
9. CERBERUS GUARD evalúa: $42,000 > límite autónomo ($10,000 MXN) → ESCALATE a MINOS
10. MINOS presenta la operación al operador humano con contexto completo
11. Operador aprueba → CERBERUS AUDIT genera AuditRecord con humanApprovedBy
12. NEAR Bridge → tx real en testnet → hash verificable en explorador
13. HADES sintetiza el informe final
```

---

## 3. Guion paso a paso

### Paso 1 — El núcleo (30 seg)

**Pantalla:** Home con núcleo holográfico

> "Esto es HADES OMEGA. El núcleo central es el orquestador HADES. Los 6 nodos conectados son agentes especializados — cada uno tiene un dominio de responsabilidad distinto. Las conexiones muestran el flujo de información en tiempo real."

*[Señalar el núcleo 3D y las conexiones a los agentes]*

> "Todos están actualmente en reposo. Vamos a darle una misión."

---

### Paso 2 — Ingreso de la misión (20 seg)

**Acción:** Hacer clic en "+ Nueva Misión"

> "Ingreso la misión en lenguaje natural."

*[Escribir o pegar el texto de la misión]*

**Acción:** Hacer clic en "Ejecutar"

> "HADES recibe la misión y en segundos descompone esto en tareas concretas para cada agente."

*[Los agentes se encienden en el núcleo holográfico — glow azul]*

---

### Paso 3 — Los agentes en acción (45 seg)

**Pantalla:** Dashboard de misión — tareas aparecen en tiempo real

> "Pueden ver las tareas asignándose en tiempo real:
>
> CHARON está evaluando tres proveedores de infraestructura cloud.
> PERSEPHONE está validando que el presupuesto de $50,000 MXN está disponible.
> ELYSIUM está calculando el cronograma de implementación."

*[Esperar a que aparezcan los primeros resultados]*

> "CHARON completa la evaluación — CloudPro obtiene el puntaje más alto: 87 de 100. Ahora CHARON va a proponer la orden de compra para el paquete premium."

---

### Paso 4 — CERBERUS: el primer DENY (40 seg)

**Pantalla:** Se activa el panel CERBERUS — badge rojo aparece

> "CHARON propone la orden de compra por $78,500 MXN — el paquete premium con redundancia completa."

*[Badge rojo DENY aparece instantáneamente]*

> "CERBERUS GUARD lo detiene en milisegundos. PERSEPHONE ya había validado: el presupuesto disponible es $50,000 MXN. $78,500 supera ese límite. La regla es matemática, sin ambigüedad."

*[Mostrar el AuditRecord con DENY y el contentHash SHA-256]*

> "Noten algo importante: ese DENY no fue una opinión del modelo de IA. Fue una evaluación determinista de código. Mismo input, mismo resultado, siempre."

> "TARTARUS registra el evento. CHARON recibe el DENY y, con su lógica de razonamiento, busca una alternativa."

---

### Paso 4b — CERBERUS: el ESCALATE (40 seg)

**Pantalla:** Nueva operación en panel CERBERUS — badge dorado

> "CHARON propone ahora el paquete estándar de CloudPro: $42,000 MXN. Dentro del presupuesto."

*[Badge dorado ESCALATE aparece]*

> "Esta vez PERSEPHONE aprueba el presupuesto. Pero la política de la empresa establece que órdenes superiores a $10,000 MXN requieren autorización humana. CERBERUS GUARD emite ESCALATE — y MINOS toma el control."

*[Panel CERBERUS muestra el AuditRecord con ESCALATE]*

---

### Paso 5 — Aprobación humana con MINOS (30 seg)

**Pantalla:** Aparece el panel de escalación de MINOS

> "MINOS presenta la operación al operador con todo el contexto necesario: proveedor, monto, justificación de CHARON, validación de PERSEPHONE, y el AuditRecord de la propuesta anterior que fue rechazada. Historia completa."

*[Señalar el formulario: CloudPro, $42,000 MXN, score 87/100, presupuesto disponible $50,000 MXN]*

> "Apruebo la alternativa."

**Acción:** Clic en "✓ Aprobar"

> "Mi identidad y el timestamp quedan registrados en el AuditRecord. Esta decisión es irrevocable — no hay manera de modificarla después."

---

### Paso 6 — La transacción NEAR (45 seg)

**Pantalla:** Panel NEAR se ilumina con badge dorado

> "Y aquí está el momento clave: CERBERUS AUDIT genera un hash SHA-256 del registro de esta decisión — incluyendo quién la tomó, qué operación era y cuál fue el resultado — y lo envía a NEAR Testnet."

*[NEARTransactionBadge aparece con el hash]*

> "Esta es la transacción real."

**Acción:** Clic en el enlace del explorador

*[El explorador de NEAR Testnet se abre en el navegador]*

> "Pueden ver el hash, el bloque, el timestamp, el contrato `audit.hades-omega.testnet`, y los argumentos: el audit_id, el content_hash, el tipo de operación, el agente y la decisión. Esto está en NEAR Testnet ahora mismo. Cualquier persona con este hash puede verificar que esta decisión ocurrió."

---

### Paso 7 — El informe final (20 seg)

**Pantalla:** HADES sintetiza el informe

> "HADES consolida todo: proveedor seleccionado, presupuesto aprobado, operación verificada on-chain. La empresa tiene ahora un registro inmutable e inalterable de toda la misión."

*[Señalar las estadísticas del panel CERBERUS: X operaciones evaluadas, Y en NEAR]*

---

### Cierre (20 seg)

> "HADES OMEGA demuestra que los agentes de IA autónomos pueden operar en contextos empresariales con las garantías que los negocios reales necesitan: políticas deterministas, auditoría completa y verificabilidad blockchain.
>
> Esta es la infraestructura sobre la que se construirá la empresa autónoma del futuro — y está operando sobre NEAR."

---

## 4. Plan B — Modo simulación

Si NEAR Testnet no está disponible durante la demo:

> "Normalmente cada operación crítica genera una transacción real en NEAR Testnet. Esta demo está configurada para continuar funcionando incluso offline — los registros se almacenan localmente con el mismo hash verificable. Tenemos [mostrar] transacciones reales confirmadas durante nuestras pruebas."

*[Tener capturas de pantalla del explorador NEAR como respaldo]*

---

## 5. Preguntas frecuentes anticipadas

**"¿Por qué NEAR y no otra blockchain?"**
> NEAR ofrece fees mínimos en testnet, contratos en Rust con SDK maduro, y velocidades de confirmación de ~1 segundo — ideal para registros de auditoría empresarial donde la latencia importa.

**"¿Los agentes toman decisiones o solo ejecutan reglas?"**
> Los agentes razonan con LLMs para analizar, evaluar y planificar. Las políticas de seguridad y cumplimiento se ejecutan en código determinista (CERBERUS). Separamos razonamiento de política deliberadamente.

**"¿Qué pasa si el LLM da una respuesta incorrecta?"**
> CERBERUS es la línea de defensa. Un agente manipulado o que razone incorrectamente puede proponer una operación, pero CERBERUS evalúa el *output* (la propuesta) contra las políticas — no el razonamiento interno. Una propuesta fuera de política siempre es bloqueada.

**"¿Esto escala a empresas reales?"**
> El MVP demuestra el concepto con un contrato simple. La arquitectura soporta múltiples organizaciones con políticas independientes, identidades de agentes on-chain, y registros particionados por cliente.

**"¿Cuánto cuesta una transacción en NEAR Testnet?"**
> En testnet: cero. En mainnet, el costo de almacenamiento para un AuditRecord (~300 bytes) es aproximadamente $0.003 NEAR — menos de un centavo.

---

## 6. Setup técnico el Día de la Demo

### Checklist pre-demo (30 min antes)

- [ ] Sistema corriendo: `pnpm dev` en todos los paquetes
- [ ] Base de datos limpia (sin datos de pruebas previas)
- [ ] `NEAR_EXECUTION_MODE=real` configurado
- [ ] Balance de cuenta `hades-omega.testnet` > 1 NEAR (verificar con `near state`)
- [ ] `testnet.nearblocks.io` abierto en pestaña del navegador (verificar que carga)
- [ ] Browser en zoom 100%, resolución 1920×1080 o similar
- [ ] Tema oscuro activado en HADES OMEGA
- [ ] Datos de demo pre-cargados (lista de proveedores de ejemplo)
- [ ] Video de respaldo grabado y accesible offline

### En caso de fallo técnico

| Escenario | Acción |
|-----------|--------|
| NEAR Testnet down | Cambiar a modo simulación, mostrar capturas de pantalla de txs previas |
| LLM Provider error | Usar respuestas cacheadas (preparar durante pruebas del Día 13) |
| Frontend no carga | Cambiar a demo de API con curl/Postman + terminal |
| Sistema completo no funciona | Presentar el video grabado + walkthrough de código |

---

## 7. Métricas para mencionar en la presentación

*(Completar con datos reales del Día 13)*

| Métrica | Valor |
|---------|-------|
| Operaciones evaluadas por CERBERUS en las pruebas | TBD |
| Transacciones reales en NEAR Testnet | TBD |
| Tiempo promedio de evaluación GUARD | TBD ms |
| Tiempo de flujo de misión completa | TBD segundos |
| Tests que pasan (unit + integration) | TBD / TBD |
| Cobertura de CERBERUS engine | TBD % |

---

## 8. Publicación en X (Twitter) — Día 14

La publicación en X es un entregable obligatorio del hackathon (backlog D-010).

### Contenido del post (borrador)

```
🔱 HADES OMEGA — Enterprise AI Agent OS, built on @NEARProtocol

6 autonomous AI agents that execute business missions with
on-chain audit trail for every critical decision.

CERBERUS security engine: deterministic policy enforcement, not LLM guesswork.
Every approval → a verified NEAR Testnet transaction.

🔗 GitHub: [repo URL]
🎬 Demo: [video URL]

#NEARHackathon2026 #AI #Blockchain #Agents
```

### Capturas obligatorias para el post (preparar el Día 13)

1. Núcleo holográfico con los 6 agentes activos
2. Panel CERBERUS mostrando el AuditRecord de DENY ($78,500 MXN)
3. Badge NEAR con hash de transacción real y enlace al explorador
4. El explorador NEAR Testnet con la tx confirmada

> **Nota VER-002:** Confirmar antes del Día 14 si el post debe ir en inglés o español según las bases del hackathon.

---

## 9. Recursos para los jueces

Preparar para la presentación:
- URL del repositorio GitHub (público desde el Día 13)
- URL del contrato en NEAR Testnet: `https://testnet.nearblocks.io/address/audit.hades-omega.testnet` *(URL tentativa — confirmar después de N-002 el Día 8)*
- Hash de transacción real (de las pruebas del Día 11–12)
- Video de demo (2–4 min)
- Post en X con el link al repo

> **Nota:** La URL del contrato en NEAR depende del nombre final de la cuenta. No usar esta URL hasta que F-006 confirme la existencia de `hades-omega.testnet`.

---

*Relacionado: `09-backlog.md` (items D-006 al D-011), `04-near-integration.md`*
