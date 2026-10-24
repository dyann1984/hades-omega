# HADES OMEGA — Integración NEAR Testnet

**Versión:** 0.2 (Cierre de planificación)
**Fecha:** Octubre 2026

---

## ⚠ Estado de la cuenta NEAR — NO VERIFICADA

> La cuenta `hades-omega.testnet` **no ha sido creada ni verificada**. Su existencia debe confirmarse el Día 1 del hackathon antes de planificar cualquier trabajo sobre ella.
>
> **Tarea F-006 (Día 1):** ejecutar `near state hades-omega.testnet --networkId testnet` y confirmar respuesta real. Si la cuenta no existe, crearla en ese momento vía `wallet.testnet.near.org`. Si el nombre está ocupado, elegir nombre alternativo y actualizar todos los documentos.
>
> Ninguna dirección de contrato (`audit.hades-omega.testnet`) debe considerarse existente hasta que F-006 esté en estado IMPLEMENTADA.

### Distinción de estados de la integración NEAR

| Función | Estado actual | Cuándo cambia |
|---------|--------------|---------------|
| Cuenta `hades-omega.testnet` | **PLANIFICADA — no verificada** | Después de F-006 el Día 1 |
| Contrato `audit.hades-omega.testnet` | **PLANIFICADA — no desplegada** | Después de N-002 el Día 8 |
| NEAR Bridge modo simulación | **PLANIFICADA — no implementada** | Después de N-003 el Día 7 |
| NEAR Bridge modo real | **PLANIFICADA — no implementada** | Después de N-004 el Día 8 |
| Transacciones en testnet | **PLANIFICADA — 0 txs reales** | Después de primera tx manual el Día 8 |

---

## 1. Principios de la integración

### Lo que NEAR aporta a HADES OMEGA

NEAR Testnet actúa como **registro verificable e inmutable** para decisiones críticas del sistema. Su valor en la demo es demostrable sin ambigüedad: cualquier juez puede abrir un explorador y ver la transacción.

### Separación obligatoria: simulación vs. ejecución real

Esta distinción es no negociable durante el desarrollo:

```
NEAR_EXECUTION_MODE=simulation  (default)
  → NEAR Bridge escribe en SQLite local
  → No se consumen tokens de testnet
  → Safe para desarrollo y CI

NEAR_EXECUTION_MODE=real  (flag explícito requerido)
  → NEAR Bridge envía transacciones reales a testnet
  → Requiere account configurado y fondos en testnet
  → Solo para demo y validación manual
```

**Nunca** cambiar este flag sin intención explícita. Las funciones que llaman a NEAR en modo real deben tener comentarios claros indicando que producen efectos externos.

---

## 2. Alcance del MVP — Qué sí y qué no

### ✅ Sí haremos en el MVP

| Item | Descripción |
|------|-------------|
| Cuenta testnet | Crear `hades-omega.testnet` con NEAR CLI |
| Contrato de auditoría | Un contrato Rust que almacena AuditRecord hashes |
| Transacción verificable | Al menos una tx real con hash en `testnet.nearblocks.io` |
| Protección de claves | Claves en `~/.near-credentials`, nunca en código |
| Control de permisos | Function call access keys con allowance limitado |
| Modo simulación | Fallback funcional sin NEAR para demo offline |

### ❌ No haremos en el MVP

| Item | Razón |
|------|-------|
| Staking o yield farming | Fuera del alcance del MVP de 14 días |
| Gobernanza DAO | Complejidad innecesaria para la demo |
| Múltiples contratos | Aumenta riesgo de bugs bajo presión de tiempo |
| Wallets individuales por agente | No es necesario para demostrar el concepto |
| Mainnet | Solo testnet para el hackathon |
| NFTs o tokens propios | Fuera del alcance |

---

## 3. Contrato de auditoría — Especificación

### 3.1 Nombre y ubicación

- **Contract ID (a crear):** `audit.hades-omega.testnet`
- **Ruta en el repo:** `packages/contracts/audit-registry/`

### 3.2 Funciones del contrato

```rust
// Almacena un hash de registro de auditoría
// Solo el owner account puede llamar esta función
pub fn store_audit_hash(
    &mut self,
    audit_id: String,           // UUID del AuditRecord
    content_hash: String,        // SHA-256 del contenido
    operation_type: String,     // tipo de operación
    agent_name: String,         // nombre del agente
    decision: String,            // PERMIT | DENY | ESCALATE
    timestamp_ms: u64,           // timestamp Unix ms
) -> AuditEntry

// Recupera un registro por su ID
pub fn get_audit_entry(
    &self,
    audit_id: String,
) -> Option<AuditEntry>

// Lista los últimos N registros
pub fn list_recent_entries(
    &self,
    limit: u64,
) -> Vec<AuditEntry>

// Retorna el total de registros almacenados
pub fn get_total_count(&self) -> u64
```

### 3.3 Estructura de datos on-chain

```rust
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize)]
pub struct AuditEntry {
    pub audit_id:       String,
    pub content_hash:   String,
    pub operation_type: String,
    pub agent_name:     String,
    pub decision:       String,
    pub timestamp_ms:   u64,
    pub block_height:   u64,    // añadido automáticamente
    pub block_timestamp: u64,   // añadido automáticamente (nanosegundos)
}
```

### 3.4 Consideraciones de almacenamiento

- NEAR cobra por almacenamiento en storage (state staking)
- Cada entry ≈ 200-300 bytes
- Para la demo: máximo 100 entries → ~30 KB → costo mínimo en testnet
- Implementar un límite máximo de entries configurable en el contrato

---

## 4. Configuración de cuenta NEAR

### 4.1 Pasos para configurar (durante desarrollo, Días 1-2)

```bash
# Paso 1: Instalar NEAR CLI
npm install -g near-cli

# Paso 2: Crear cuenta en testnet
# → Ir a wallet.testnet.near.org y crear cuenta hades-omega.testnet
# (Esto NO se hace desde código — es una acción manual del operador)

# Paso 3: Autenticar CLI localmente
near login
# Esto escribe las claves en ~/.near-credentials/testnet/hades-omega.testnet.json
# NUNCA commitear ese archivo

# Paso 4: Verificar cuenta
near state hades-omega.testnet --networkId testnet

# Paso 5: Crear sub-cuenta para el contrato
near create-account audit.hades-omega.testnet \
  --masterAccount hades-omega.testnet \
  --initialBalance 5 \
  --networkId testnet
```

### 4.2 Manejo de claves — Reglas obligatorias

1. **Nunca** incluir claves privadas en código fuente, variables de entorno del repo o archivos commiteados
2. Las claves de desarrollo viven en `~/.near-credentials/` (gitignoreado)
3. Para el sistema, usar **function call access keys** con allowance limitado (no full access keys)
4. El archivo `.env.example` documenta qué variables se necesitan pero sin valores
5. Antes de cada commit, verificar que no haya claves con `git grep -r "ed25519:" .`

### 4.3 Variables de entorno para NEAR (sin valores)

```bash
# .env.example — NUNCA incluir valores reales aquí
NEAR_NETWORK=testnet
NEAR_ACCOUNT_ID=                          # e.g. hades-omega.testnet
NEAR_CONTRACT_ID=                         # e.g. audit.hades-omega.testnet
NEAR_CREDENTIALS_PATH=~/.near-credentials # default del CLI
```

---

## 5. NEAR Bridge — Diseño del módulo

### 5.1 Responsabilidad

El NEAR Bridge es el único punto de contacto entre CERBERUS AUDIT y la blockchain. Es invocado por AUDIT cuando un AuditRecord cumple los criterios de registro on-chain.

### 5.2 Interfaz del Bridge

```typescript
interface NEARBridge {
  // Envía un AuditRecord a NEAR (simulación o real según modo)
  submitAuditRecord(record: AuditRecord): Promise<NEARSubmissionResult>

  // Verifica que un hash existe en NEAR
  verifyAuditHash(auditId: string, contentHash: string): Promise<boolean>

  // Obtiene el enlace al explorador para una tx
  getExplorerUrl(txHash: string): string

  // Estado actual de la conexión
  getConnectionStatus(): NEARConnectionStatus
}

interface NEARSubmissionResult {
  mode:          'simulation' | 'real'
  txHash:        string | null    // null en modo simulación
  explorerUrl:   string | null    // null en modo simulación
  blockHeight:   number | null
  simulationId:  string | null    // ID en DB local si es simulación
  timestamp:     number
}
```

### 5.3 Flujo de envío en modo real

```
1. CERBERUS AUDIT genera AuditRecord con contentHash
2. AUDIT invoca NEARBridge.submitAuditRecord(record)
3. Bridge llama near-api-js → functionCall en audit.hades-omega.testnet
4. NEAR Testnet procesa la transacción
5. Bridge recibe txHash y blockHeight
6. Bridge construye explorerUrl: https://testnet.nearblocks.io/txns/{txHash}
7. Bridge retorna NEARSubmissionResult con txHash y explorerUrl
8. AUDIT actualiza AuditRecord con nearTxHash y nearExplorerUrl
9. WebSocket notifica al frontend: nuevo registro on-chain disponible
```

### 5.4 Manejo de errores

| Error | Acción |
|-------|--------|
| NEAR Testnet no disponible | Reintentar 3 veces con backoff exponencial, luego marcar como `NEAR_PENDING` |
| Fondos insuficientes en account | Alerta inmediata al operador, registrar localmente |
| Tx rechazada por el contrato | Log de error, no reintentar, notificar a TARTARUS |
| Timeout > 30 segundos | Marcar como `NEAR_TIMEOUT`, continuar operación local |

Los errores de NEAR **nunca bloquean** la operación de los agentes — el registro local es el fallback.

---

## 6. Verificación en el explorador NEAR

### URL del explorador para testnet

```
https://testnet.nearblocks.io/txns/{TX_HASH}
https://testnet.nearblocks.io/address/{ACCOUNT_ID}
```

### Qué verifica un juez en el explorador

1. El **tx hash** existe en testnet
2. El **account** `audit.hades-omega.testnet` es el receptor
3. El método llamado es `store_audit_hash`
4. Los **argumentos** incluyen el `audit_id` y `content_hash`
5. El **timestamp** del bloque corresponde con la operación

### Flujo de demo verificable

```
Demo TechCore Industries — presupuesto $50,000 MXN:
  1. CHARON propone PO de $78,500 MXN
  2. CERBERUS GUARD → DENY (fondos insuficientes; PERSEPHONE validó)
     → AuditRecord con DENY generado y almacenado localmente
  3. CHARON re-evalúa → propone alternativa $42,000 MXN
  4. CERBERUS GUARD → ESCALATE (supera límite autónomo $10,000 MXN)
  5. MINOS → presenta al operador humano con contexto completo
  6. Operador aprueba → HumanDecision registrada con identidad
  7. CERBERUS AUDIT → AuditRecord con humanApprovedBy + contentHash
  8. NEAR Bridge → tx real en testnet → txHash recibido
  9. Dashboard muestra enlace directo al explorador
  [Juez abre el enlace y ve la transacción real confirmada]
```
> **Nota:** La tx real corresponde a la aprobación humana del paso 6 (ESCALATE resuelto), no al DENY del paso 2. El DENY se registra localmente pero no genera tx NEAR (no está en CRITICAL_OPS con `near_on_deny`). Esto simplifica la integración NEAR sin perder trazabilidad.

---

## 7. Riesgos de integración NEAR

| Riesgo | Mitigación |
|--------|-----------|
| Cuenta no disponible en el momento de la demo | Crear cuenta en Día 1, verificar el Día 13 |
| Testnet con alta latencia | Modo simulación siempre disponible como fallback |
| Contrato con bug descubierto tarde | Deploy del contrato en Día 6 para tener tiempo de corregir |
| near-api-js breaking change | Pinear versión exacta en package.json |
| Fondos de testnet agotados | Solicitar faucet en Día 1, monitorear balance |

---

*Relacionado: `01-architecture.md`, `03-cerberus-spec.md`, `05-security-threats.md`*
