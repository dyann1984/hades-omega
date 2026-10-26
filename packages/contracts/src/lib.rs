use near_sdk::{near, env, AccountId, NearToken};
use near_sdk::store::LookupMap;
use near_sdk::serde::{Serialize, Deserialize};

/// AuditEntry stores an immutable audit record hash on NEAR Testnet.
/// The full record lives off-chain in HADES; only the content hash is stored on-chain
/// for verifiability without exposing sensitive operational data.
#[derive(Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct AuditEntry {
    pub audit_id:       String,       // UUID v4
    pub content_hash:   String,       // SHA-256 hex of the off-chain AuditRecord
    pub operation_type: String,       // e.g. "PURCHASE_ORDER"
    pub agent_name:     String,       // e.g. "CHARON"
    pub decision:       String,       // PERMIT | DENY | ESCALATE
    pub timestamp_ms:   u64,          // Unix epoch ms
    pub block_height:   u64,          // NEAR block height at store time
    pub block_timestamp: u64,         // NEAR block timestamp (ns)
}

#[near(contract_state)]
pub struct AuditRegistry {
    entries: LookupMap<String, AuditEntry>,
    owner:   AccountId,
    count:   u64,
}

impl Default for AuditRegistry {
    fn default() -> Self {
        panic!("Contract must be initialized via new()")
    }
}

#[near]
impl AuditRegistry {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        assert!(!env::state_exists(), "Already initialized");
        Self {
            entries: LookupMap::new(b"e"),
            owner:   owner_id,
            count:   0,
        }
    }

    /// Store a new audit hash. Only callable by the contract owner (HADES system account).
    pub fn store_audit_hash(
        &mut self,
        audit_id:       String,
        content_hash:   String,
        operation_type: String,
        agent_name:     String,
        decision:       String,
        timestamp_ms:   u64,
    ) -> AuditEntry {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Solo la cuenta del sistema HADES puede registrar entradas"
        );
        assert!(!self.entries.contains_key(&audit_id), "audit_id ya registrado");
        assert_eq!(content_hash.len(), 64, "content_hash debe ser SHA-256 hex (64 chars)");
        assert!(
            ["PERMIT", "DENY", "ESCALATE"].contains(&decision.as_str()),
            "decision debe ser PERMIT, DENY o ESCALATE"
        );

        let entry = AuditEntry {
            audit_id:        audit_id.clone(),
            content_hash,
            operation_type,
            agent_name,
            decision,
            timestamp_ms,
            block_height:    env::block_height(),
            block_timestamp: env::block_timestamp(),
        };

        self.entries.insert(audit_id, entry.clone());
        self.count += 1;

        env::log_str(&format!(
            "HADES AUDIT: {} | {} | block {}",
            entry.audit_id, entry.decision, entry.block_height
        ));

        entry
    }

    /// Retrieve an audit entry by ID for verification.
    pub fn get_audit_entry(&self, audit_id: String) -> Option<AuditEntry> {
        self.entries.get(&audit_id).cloned()
    }

    /// Returns the total number of audit records stored.
    pub fn get_count(&self) -> u64 {
        self.count
    }

    /// Returns the contract owner account ID.
    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }
}

// ---- Unit tests ----

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn get_context(predecessor: AccountId) -> VMContextBuilder {
        let mut ctx = VMContextBuilder::new();
        ctx.predecessor_account_id(predecessor);
        ctx
    }

    #[test]
    fn test_new_contract() {
        let owner = accounts(0);
        let ctx = get_context(owner.clone());
        testing_env!(ctx.build());
        let contract = AuditRegistry::new(owner.clone());
        assert_eq!(contract.get_owner(), owner);
        assert_eq!(contract.get_count(), 0);
    }

    #[test]
    fn test_store_and_retrieve() {
        let owner = accounts(0);
        let ctx = get_context(owner.clone());
        testing_env!(ctx.build());
        let mut contract = AuditRegistry::new(owner);

        let entry = contract.store_audit_hash(
            "test-uuid-1234-5678-9abc".to_string(),
            "a".repeat(64),
            "PURCHASE_ORDER".to_string(),
            "CHARON".to_string(),
            "PERMIT".to_string(),
            1_700_000_000_000u64,
        );

        assert_eq!(entry.decision, "PERMIT");
        assert_eq!(contract.get_count(), 1);

        let fetched = contract.get_audit_entry("test-uuid-1234-5678-9abc".to_string());
        assert!(fetched.is_some());
        assert_eq!(fetched.unwrap().agent_name, "CHARON");
    }

    #[test]
    #[should_panic(expected = "Solo la cuenta del sistema")]
    fn test_unauthorized_store() {
        let owner   = accounts(0);
        let hacker  = accounts(1);
        testing_env!(get_context(owner.clone()).build());
        let mut contract = AuditRegistry::new(owner);

        testing_env!(get_context(hacker).build());
        contract.store_audit_hash(
            "evil-uuid".to_string(),
            "b".repeat(64),
            "HACK".to_string(),
            "HACKER".to_string(),
            "PERMIT".to_string(),
            0,
        );
    }

    #[test]
    #[should_panic(expected = "audit_id ya registrado")]
    fn test_duplicate_id() {
        let owner = accounts(0);
        testing_env!(get_context(owner.clone()).build());
        let mut contract = AuditRegistry::new(owner);

        let id = "same-id".to_string();
        contract.store_audit_hash(id.clone(), "c".repeat(64), "OP".to_string(), "CHARON".to_string(), "PERMIT".to_string(), 0);
        contract.store_audit_hash(id,          "d".repeat(64), "OP".to_string(), "CHARON".to_string(), "PERMIT".to_string(), 0);
    }
}
