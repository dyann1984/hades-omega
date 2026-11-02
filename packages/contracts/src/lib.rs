use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, PanicOnDefault};

/// Immutable audit record. Only the SHA-256 of the off-chain HADES audit record is stored, never the record itself.
#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Debug)]
pub struct AuditEntry {
    pub audit_id: String,        // HADES audit identifier, [A-Za-z0-9-], max 64 chars
    pub content_hash: String,    // SHA-256, 64 lowercase hex characters
    pub operation_type: String,  // e.g. "PURCHASE_ORDER", [A-Z_], max 64 chars
    pub agent_name: String,      // e.g. "CHARON", max 32 chars
    pub decision: String,        // PERMIT | DENY | ESCALATE
    pub timestamp_ms: u64,       // off-chain event time (Unix ms)
    pub recorder: AccountId,     // account that wrote the entry (always the owner)
    pub block_height: u64,       // block in which the entry was written
    pub block_timestamp: u64,    // block timestamp (ns)
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct AuditRegistry {
    entries: LookupMap<String, AuditEntry>,
    owner: AccountId,
    count: u64,
}

fn valid_id(s: &str, max: usize, allow: impl Fn(char) -> bool) -> bool {
    !s.is_empty() && s.len() <= max && s.chars().all(allow)
}

#[near]
impl AuditRegistry {
    /// `owner_id` is the only account that may record entries (the dedicated HADES testnet account).
    ///
    /// `#[private]`: only the contract's own account may initialize it, i.e. whoever holds the contract account's key and
    /// signs the deployment. A third party can therefore never claim ownership of a deployed-but-uninitialized contract, even
    /// if the deploy and the init are not in the same transaction. `#[init]` itself refuses a second initialization.
    #[init]
    #[private]
    pub fn new(owner_id: AccountId) -> Self {
        Self { entries: LookupMap::new(b"e"), owner: owner_id, count: 0 }
    }

    /// Records an audit hash. Not payable: any attached deposit makes the call fail.
    /// Idempotent: repeating an identical record returns the existing entry and changes nothing, so a client can
    /// safely retry after a network failure. Reusing an `audit_id` with different content panics.
    pub fn store_audit_hash(
        &mut self,
        audit_id: String,
        content_hash: String,
        operation_type: String,
        agent_name: String,
        decision: String,
        timestamp_ms: u64,
    ) -> AuditEntry {
        assert_eq!(env::predecessor_account_id(), self.owner, "only the owner may record entries");
        assert!(valid_id(&audit_id, 64, |c| c.is_ascii_alphanumeric() || c == '-'), "invalid audit_id");
        assert!(
            content_hash.len() == 64 && content_hash.chars().all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c)),
            "content_hash must be 64 lowercase hex characters"
        );
        assert!(valid_id(&operation_type, 64, |c| c.is_ascii_uppercase() || c == '_'), "invalid operation_type");
        assert!(valid_id(&agent_name, 32, |c| c.is_ascii_alphanumeric() || c == '_'), "invalid agent_name");
        assert!(["PERMIT", "DENY", "ESCALATE"].contains(&decision.as_str()), "decision must be PERMIT, DENY or ESCALATE");

        if let Some(existing) = self.entries.get(&audit_id) {
            let same = existing.content_hash == content_hash
                && existing.operation_type == operation_type
                && existing.agent_name == agent_name
                && existing.decision == decision
                && existing.timestamp_ms == timestamp_ms;
            assert!(same, "audit_id already recorded with different content");
            return existing.clone();
        }

        let entry = AuditEntry {
            audit_id: audit_id.clone(),
            content_hash,
            operation_type,
            agent_name,
            decision,
            timestamp_ms,
            recorder: env::predecessor_account_id(),
            block_height: env::block_height(),
            block_timestamp: env::block_timestamp(),
        };
        self.entries.insert(audit_id, entry.clone());
        self.count += 1;
        env::log_str(&format!("HADES_AUDIT {} {} {}", entry.audit_id, entry.content_hash, entry.block_height));
        entry
    }

    pub fn get_audit_entry(&self, audit_id: String) -> Option<AuditEntry> {
        self.entries.get(&audit_id).cloned()
    }

    pub fn get_count(&self) -> u64 {
        self.count
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(predecessor: AccountId) -> VMContextBuilder {
        let mut c = VMContextBuilder::new();
        c.predecessor_account_id(predecessor);
        c
    }
    fn record(c: &mut AuditRegistry, id: &str, hash: &str) -> AuditEntry {
        c.store_audit_hash(id.into(), hash.into(), "PLANNING".into(), "HADES".into(), "PERMIT".into(), 1_700_000_000_000)
    }

    #[test]
    fn records_and_reads_back() {
        testing_env!(ctx(accounts(0)).build());
        let mut c = AuditRegistry::new(accounts(0));
        let e = record(&mut c, "audit-1", &"a".repeat(64));
        assert_eq!(e.recorder, accounts(0));
        assert_eq!(c.get_count(), 1);
        assert_eq!(c.get_audit_entry("audit-1".into()), Some(e));
        assert_eq!(c.get_audit_entry("missing".into()), None);
    }

    #[test]
    fn identical_retry_is_a_no_op() {
        testing_env!(ctx(accounts(0)).build());
        let mut c = AuditRegistry::new(accounts(0));
        let first = record(&mut c, "audit-1", &"a".repeat(64));
        let again = record(&mut c, "audit-1", &"a".repeat(64));
        assert_eq!(first, again);
        assert_eq!(c.get_count(), 1);
    }

    #[test]
    #[should_panic(expected = "different content")]
    fn conflicting_reuse_of_an_id_panics() {
        testing_env!(ctx(accounts(0)).build());
        let mut c = AuditRegistry::new(accounts(0));
        record(&mut c, "audit-1", &"a".repeat(64));
        record(&mut c, "audit-1", &"b".repeat(64));
    }

    #[test]
    #[should_panic(expected = "only the owner")]
    fn non_owner_cannot_record() {
        testing_env!(ctx(accounts(0)).build());
        let mut c = AuditRegistry::new(accounts(0));
        testing_env!(ctx(accounts(1)).build());
        record(&mut c, "audit-1", &"a".repeat(64));
    }

    #[test]
    #[should_panic(expected = "lowercase hex")]
    fn rejects_uppercase_or_short_hashes() {
        testing_env!(ctx(accounts(0)).build());
        let mut c = AuditRegistry::new(accounts(0));
        record(&mut c, "audit-1", &"A".repeat(64));
    }

    #[test]
    #[should_panic(expected = "decision must be")]
    fn rejects_unknown_decision() {
        testing_env!(ctx(accounts(0)).build());
        let mut c = AuditRegistry::new(accounts(0));
        c.store_audit_hash("audit-1".into(), "a".repeat(64), "PLANNING".into(), "HADES".into(), "MAYBE".into(), 0);
    }

    #[test]
    #[should_panic(expected = "lowercase hex")]
    fn rejects_short_hash() {
        testing_env!(ctx(accounts(0)).build());
        let mut c = AuditRegistry::new(accounts(0));
        record(&mut c, "audit-1", &"a".repeat(63));
    }

    #[test]
    #[should_panic(expected = "lowercase hex")]
    fn rejects_non_hex_hash() {
        testing_env!(ctx(accounts(0)).build());
        let mut c = AuditRegistry::new(accounts(0));
        record(&mut c, "audit-1", &format!("{}g", "a".repeat(63)));
    }

    #[test]
    #[should_panic(expected = "invalid audit_id")]
    fn rejects_overlong_id() {
        testing_env!(ctx(accounts(0)).build());
        let mut c = AuditRegistry::new(accounts(0));
        record(&mut c, &"a".repeat(65), &"a".repeat(64));
    }

    #[test]
    #[should_panic(expected = "invalid operation_type")]
    fn rejects_lowercase_operation_type() {
        testing_env!(ctx(accounts(0)).build());
        let mut c = AuditRegistry::new(accounts(0));
        c.store_audit_hash("audit-1".into(), "a".repeat(64), "planning".into(), "HADES".into(), "PERMIT".into(), 0);
    }

    #[test]
    fn distinct_ids_are_independent_and_counted() {
        testing_env!(ctx(accounts(0)).build());
        let mut c = AuditRegistry::new(accounts(0));
        record(&mut c, "audit-1", &"a".repeat(64));
        record(&mut c, "audit-2", &"a".repeat(64)); // same hash under a different id is a different record
        assert_eq!(c.get_count(), 2);
        assert_eq!(c.get_owner(), accounts(0));
    }

    #[test]
    #[should_panic(expected = "invalid audit_id")]
    fn rejects_malformed_ids() {
        testing_env!(ctx(accounts(0)).build());
        let mut c = AuditRegistry::new(accounts(0));
        record(&mut c, "bad id!", &"a".repeat(64));
    }
}
