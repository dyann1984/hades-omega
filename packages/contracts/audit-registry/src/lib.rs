/*!
 * HADES OMEGA — Audit Registry Smart Contract
 * NEAR Testnet · audit.hades-omega.testnet
 *
 * Stores SHA-256 audit hashes from the HADES agent system.
 * Each hash is immutable — once stored it cannot be modified or deleted.
 * This creates a tamper-proof, on-chain audit trail for all enterprise operations.
 *
 * Deployment (testnet):
 *   cargo build --target wasm32-unknown-unknown --release
 *   near deploy --accountId audit.hades-omega.testnet --wasmFile target/wasm32-unknown-unknown/release/audit_registry.wasm
 *
 * Interaction:
 *   near call audit.hades-omega.testnet store_audit_hash \
 *     '{"hash":"<sha256>","agent_name":"CHARON","operation_type":"PURCHASE_ORDER","decision":"PERMIT","timestamp":1700000000}' \
 *     --accountId hades-omega.testnet
 *
 *   near view audit.hades-omega.testnet get_audit_entry '{"hash":"<sha256>"}'
 *   near view audit.hades-omega.testnet get_total_count '{}'
 */

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::UnorderedMap;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near_bindgen, AccountId, BorshStorageKey, PanicOnDefault};

// ── Storage key enum ─────────────────────────────────────────────────────────

#[derive(BorshSerialize, BorshStorageKey)]
enum StorageKey {
    AuditEntries,
}

// ── Data structures ──────────────────────────────────────────────────────────

/// A single audit record stored on-chain.
/// All fields are immutable after storage.
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct AuditEntry {
    /// SHA-256 hash of the audit record (content integrity proof)
    pub hash: String,
    /// Agent that originated the operation (HADES|CHARON|PERSEPHONE|MINOS|ELYSIUM|TARTARUS)
    pub agent_name: String,
    /// Type of operation (PURCHASE_ORDER|BUDGET_COMMITMENT|HUMAN_APPROVAL|etc.)
    pub operation_type: String,
    /// CERBERUS decision (PERMIT|DENY|ESCALATE)
    pub decision: String,
    /// Unix timestamp (milliseconds) from the off-chain system
    pub timestamp: u64,
    /// NEAR account that submitted this record
    pub submitted_by: AccountId,
    /// Block height at submission time
    pub block_height: u64,
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct AuditRegistry {
    entries: UnorderedMap<String, AuditEntry>,
    total_count: u64,
    /// Account authorized to call privileged methods (contract owner)
    owner: AccountId,
}

#[near_bindgen]
impl AuditRegistry {
    /// Initialize the contract. Called once at deployment.
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        assert!(!env::state_exists(), "Already initialized");
        Self {
            entries: UnorderedMap::new(StorageKey::AuditEntries),
            total_count: 0,
            owner: owner_id,
        }
    }

    // ── Write methods ─────────────────────────────────────────────────────────

    /// Store an audit hash. The hash must be a non-empty, unique SHA-256 hex string.
    /// Any caller can submit; each hash is stored exactly once (immutable).
    pub fn store_audit_hash(
        &mut self,
        hash: String,
        agent_name: String,
        operation_type: String,
        decision: String,
        timestamp: u64,
    ) {
        // Validate inputs
        assert!(!hash.is_empty(), "Hash cannot be empty");
        assert!(hash.len() == 64, "Hash must be 64-character SHA-256 hex string");
        assert!(
            hash.chars().all(|c| c.is_ascii_hexdigit()),
            "Hash must contain only hex characters [0-9a-f]"
        );
        assert!(!agent_name.is_empty(), "Agent name cannot be empty");
        assert!(!operation_type.is_empty(), "Operation type cannot be empty");
        assert!(
            decision == "PERMIT" || decision == "DENY" || decision == "ESCALATE",
            "Decision must be PERMIT, DENY, or ESCALATE"
        );

        // Prevent duplicate storage (immutability guarantee)
        assert!(
            !self.entries.contains_key(&hash),
            "Hash already registered — audit records are immutable"
        );

        let entry = AuditEntry {
            hash: hash.clone(),
            agent_name,
            operation_type,
            decision,
            timestamp,
            submitted_by: env::predecessor_account_id(),
            block_height: env::block_height(),
        };

        self.entries.insert(&hash, &entry);
        self.total_count += 1;

        // Emit log event for off-chain indexers
        env::log_str(&format!(
            r#"{{"event":"audit_stored","hash":"{}","agent":"{}","decision":"{}","block":{}}}"#,
            &entry.hash[..8],
            entry.agent_name,
            entry.decision,
            entry.block_height
        ));
    }

    // ── Read methods ──────────────────────────────────────────────────────────

    /// Retrieve a specific audit entry by its SHA-256 hash.
    pub fn get_audit_entry(&self, hash: String) -> Option<AuditEntry> {
        self.entries.get(&hash)
    }

    /// Verify that a hash exists on-chain (cheaper than get_audit_entry).
    pub fn verify_hash(&self, hash: String) -> bool {
        self.entries.contains_key(&hash)
    }

    /// Return the total number of stored audit records.
    pub fn get_total_count(&self) -> u64 {
        self.total_count
    }

    /// Return up to `limit` recent entries (max 50).
    /// Note: UnorderedMap has no guaranteed order; use off-chain indexing for ordering.
    pub fn list_recent_entries(&self, limit: u64) -> Vec<AuditEntry> {
        let limit = limit.min(50) as usize;
        self.entries.values().take(limit).collect()
    }

    /// Return entries by agent name (no index — O(n) scan, max 50 results).
    pub fn get_entries_by_agent(&self, agent_name: String, limit: u64) -> Vec<AuditEntry> {
        let limit = limit.min(50) as usize;
        self.entries
            .values()
            .filter(|e| e.agent_name == agent_name)
            .take(limit)
            .collect()
    }

    /// Return entries by decision type (no index — O(n) scan, max 50 results).
    pub fn get_entries_by_decision(&self, decision: String, limit: u64) -> Vec<AuditEntry> {
        let limit = limit.min(50) as usize;
        self.entries
            .values()
            .filter(|e| e.decision == decision)
            .take(limit)
            .collect()
    }

    /// Return contract metadata.
    pub fn get_contract_info(&self) -> serde_json::Value {
        near_sdk::serde_json::json!({
            "name": "HADES OMEGA Audit Registry",
            "version": "0.1.0",
            "owner": self.owner,
            "total_records": self.total_count,
            "network": "testnet"
        })
    }
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn get_context(predecessor: AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor);
        builder
    }

    fn valid_hash(n: u8) -> String {
        format!("{:0>64}", format!("{:x}", n).repeat(8))
    }

    #[test]
    fn test_new_contract() {
        let context = get_context(accounts(0));
        testing_env!(context.build());
        let contract = AuditRegistry::new(accounts(0));
        assert_eq!(contract.get_total_count(), 0);
    }

    #[test]
    fn test_store_and_retrieve() {
        let context = get_context(accounts(1));
        testing_env!(context.build());
        let mut contract = AuditRegistry::new(accounts(0));

        let hash = "a".repeat(64);
        contract.store_audit_hash(
            hash.clone(),
            "CHARON".to_string(),
            "PURCHASE_ORDER".to_string(),
            "PERMIT".to_string(),
            1700000000000,
        );

        assert_eq!(contract.get_total_count(), 1);
        assert!(contract.verify_hash(hash.clone()));

        let entry = contract.get_audit_entry(hash).expect("Entry should exist");
        assert_eq!(entry.agent_name, "CHARON");
        assert_eq!(entry.operation_type, "PURCHASE_ORDER");
        assert_eq!(entry.decision, "PERMIT");
    }

    #[test]
    #[should_panic(expected = "Hash already registered")]
    fn test_duplicate_hash_rejected() {
        let context = get_context(accounts(1));
        testing_env!(context.build());
        let mut contract = AuditRegistry::new(accounts(0));

        let hash = "b".repeat(64);
        contract.store_audit_hash(hash.clone(), "CHARON".to_string(), "PURCHASE_ORDER".to_string(), "PERMIT".to_string(), 1);
        // Second call with same hash must panic
        contract.store_audit_hash(hash, "HADES".to_string(), "AUDIT".to_string(), "PERMIT".to_string(), 2);
    }

    #[test]
    #[should_panic(expected = "Decision must be PERMIT, DENY, or ESCALATE")]
    fn test_invalid_decision_rejected() {
        let context = get_context(accounts(1));
        testing_env!(context.build());
        let mut contract = AuditRegistry::new(accounts(0));
        contract.store_audit_hash("c".repeat(64), "HADES".to_string(), "OP".to_string(), "APPROVE".to_string(), 1);
    }

    #[test]
    #[should_panic(expected = "Hash must be 64-character SHA-256 hex string")]
    fn test_short_hash_rejected() {
        let context = get_context(accounts(1));
        testing_env!(context.build());
        let mut contract = AuditRegistry::new(accounts(0));
        contract.store_audit_hash("short".to_string(), "CHARON".to_string(), "PURCHASE_ORDER".to_string(), "PERMIT".to_string(), 1);
    }

    #[test]
    fn test_entries_by_agent() {
        let context = get_context(accounts(1));
        testing_env!(context.build());
        let mut contract = AuditRegistry::new(accounts(0));

        contract.store_audit_hash("a".repeat(64), "CHARON".to_string(), "PURCHASE_ORDER".to_string(), "PERMIT".to_string(), 1);
        contract.store_audit_hash("b".repeat(64), "PERSEPHONE".to_string(), "BUDGET_COMMITMENT".to_string(), "PERMIT".to_string(), 2);
        contract.store_audit_hash("c".repeat(64), "CHARON".to_string(), "PURCHASE_ORDER".to_string(), "DENY".to_string(), 3);

        let charon_entries = contract.get_entries_by_agent("CHARON".to_string(), 10);
        assert_eq!(charon_entries.len(), 2);

        let deny_entries = contract.get_entries_by_decision("DENY".to_string(), 10);
        assert_eq!(deny_entries.len(), 1);
    }

    #[test]
    fn test_verify_nonexistent_hash() {
        let context = get_context(accounts(1));
        testing_env!(context.build());
        let contract = AuditRegistry::new(accounts(0));
        assert!(!contract.verify_hash("d".repeat(64)));
    }
}
