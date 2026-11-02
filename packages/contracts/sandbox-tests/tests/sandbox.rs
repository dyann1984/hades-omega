// Runs the exact release WASM (path in HADES_WASM) in a local near-sandbox. Nothing here touches testnet or mainnet.
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, AccountId, Contract};
use near_workspaces::operations::Function;
use serde_json::json;

fn wasm() -> Vec<u8> {
    let p = std::env::var("HADES_WASM").unwrap_or_else(|_| "/work/target/wasm32-unknown-unknown/release/hades_audit_registry.wasm".into());
    std::fs::read(&p).unwrap_or_else(|e| panic!("cannot read WASM at {p}: {e}"))
}

const HASH: &str = "2fb2ee51eef07c7085a11be1d60459ed31315c8a7ad529252e0eab382879d053";

struct Env { owner: Account, mallory: Account, contract_acct: Account }

async fn setup() -> (near_workspaces::Worker<near_workspaces::network::Sandbox>, Env) {
    let worker = near_workspaces::sandbox().await.unwrap();
    let root = worker.root_account().unwrap();
    let owner = root.create_subaccount("owner").initial_balance(NearToken::from_near(20)).transact().await.unwrap().into_result().unwrap();
    let mallory = root.create_subaccount("mallory").initial_balance(NearToken::from_near(20)).transact().await.unwrap().into_result().unwrap();
    let contract_acct = root.create_subaccount("audit").initial_balance(NearToken::from_near(10)).transact().await.unwrap().into_result().unwrap();
    (worker, Env { owner, mallory, contract_acct })
}

fn store_args(id: &str) -> serde_json::Value {
    json!({ "audit_id": id, "content_hash": HASH, "operation_type": "CONTRACT_ATTESTATION", "agent_name": "HADES", "decision": "PERMIT", "timestamp_ms": 1_700_000_000_000u64 })
}

async fn deploy_only(e: &Env) -> Contract {
    e.contract_acct.deploy(&wasm()).await.unwrap().into_result().unwrap()
}
async fn init_as(caller: &Account, contract: &AccountId, owner: &AccountId) -> near_workspaces::result::ExecutionFinalResult {
    caller.call(contract, "new").args_json(json!({ "owner_id": owner })).max_gas().transact().await.unwrap()
}
// The release profile uses panic = "abort", so on-chain failures surface as a WASM trap without the panic text: tests assert the failure and, above all, the state that must remain unchanged.
fn assert_fails(r: near_workspaces::result::ExecutionFinalResult) { assert!(r.is_failure(), "expected the call to fail: {r:?}"); }

#[tokio::test]
async fn owner_flow_atomic_deploy_and_init_by_the_contract_account() {
    let (_w, e) = setup().await;
    // One transaction: DeployContract + FunctionCall(new), signed by the contract account itself.
    let r = e.contract_acct.batch(e.contract_acct.id()).deploy(&wasm())
        .call(Function::new("new").args_json(json!({ "owner_id": e.owner.id() })).gas(Gas::from_tgas(100))).transact().await.unwrap();
    assert!(r.is_success(), "{r:?}");
    let owner: AccountId = e.contract_acct.view(e.contract_acct.id(), "get_owner").await.unwrap().json().unwrap();
    assert_eq!(&owner, e.owner.id());

    // Owner records with zero deposit.
    let ok = e.owner.call(e.contract_acct.id(), "store_audit_hash").args_json(store_args("hades-attest-0001")).max_gas().transact().await.unwrap();
    assert!(ok.is_success(), "{ok:?}");
    let count: u64 = e.contract_acct.view(e.contract_acct.id(), "get_count").await.unwrap().json().unwrap();
    assert_eq!(count, 1);
    let entry: serde_json::Value = e.contract_acct.view(e.contract_acct.id(), "get_audit_entry").args_json(json!({ "audit_id": "hades-attest-0001" })).await.unwrap().json().unwrap();
    assert_eq!(entry["content_hash"], HASH);
    assert_eq!(entry["recorder"], e.owner.id().to_string());

    // Identical retry is idempotent; a different content under the same id fails.
    let again = e.owner.call(e.contract_acct.id(), "store_audit_hash").args_json(store_args("hades-attest-0001")).max_gas().transact().await.unwrap();
    assert!(again.is_success());
    let count: u64 = e.contract_acct.view(e.contract_acct.id(), "get_count").await.unwrap().json().unwrap();
    assert_eq!(count, 1);
    let mut other = store_args("hades-attest-0001"); other["decision"] = json!("DENY");
    let conflict = e.owner.call(e.contract_acct.id(), "store_audit_hash").args_json(other).max_gas().transact().await.unwrap();
    assert_fails(conflict);
    let entry: serde_json::Value = e.contract_acct.view(e.contract_acct.id(), "get_audit_entry").args_json(json!({ "audit_id": "hades-attest-0001" })).await.unwrap().json().unwrap();
    assert_eq!(entry["decision"], "PERMIT", "the original record must be unchanged");
}

#[tokio::test]
async fn zero_deposit_only_and_owner_only() {
    let (_w, e) = setup().await;
    let r = e.contract_acct.batch(e.contract_acct.id()).deploy(&wasm()).call(Function::new("new").args_json(json!({ "owner_id": e.owner.id() }))).transact().await.unwrap();
    assert!(r.is_success());
    let dep = e.owner.call(e.contract_acct.id(), "store_audit_hash").args_json(store_args("a-1")).deposit(NearToken::from_yoctonear(1)).max_gas().transact().await.unwrap();
    assert_fails(dep);
    let intruder = e.mallory.call(e.contract_acct.id(), "store_audit_hash").args_json(store_args("a-2")).max_gas().transact().await.unwrap();
    assert_fails(intruder);
    let count: u64 = e.contract_acct.view(e.contract_acct.id(), "get_count").await.unwrap().json().unwrap();
    assert_eq!(count, 0, "neither failed call may leave a record");
}

#[tokio::test]
async fn a_third_party_cannot_initialize_a_deployed_but_uninitialized_contract() {
    let (_w, e) = setup().await;
    let c = deploy_only(&e).await; // deployment interrupted before the init step
    let attack = init_as(&e.mallory, c.id(), e.mallory.id()).await; // front-running attempt: claim ownership
    assert_fails(attack);
    // Still uninitialized: nothing is readable or writable.
    assert!(c.view("get_owner").await.is_err());
    let w = e.owner.call(c.id(), "store_audit_hash").args_json(store_args("x-1")).max_gas().transact().await.unwrap();
    assert!(w.is_failure());
    // The owner account itself is not the contract account either, so it cannot init; only the contract account can.
    assert!(init_as(&e.owner, c.id(), e.owner.id()).await.is_failure());
}

#[tokio::test]
async fn an_interrupted_deployment_is_recoverable_by_the_contract_account() {
    let (_w, e) = setup().await;
    let c = deploy_only(&e).await;
    assert!(c.view("get_count").await.is_err(), "uninitialized contract must not answer");
    let r = init_as(&e.contract_acct, c.id(), e.owner.id()).await; // the legitimate continuation
    assert!(r.is_success(), "{r:?}");
    let owner: AccountId = c.view("get_owner").await.unwrap().json().unwrap();
    assert_eq!(&owner, e.owner.id());
}

#[tokio::test]
async fn duplicate_initialization_is_rejected_even_from_the_contract_account() {
    let (_w, e) = setup().await;
    let r = e.contract_acct.batch(e.contract_acct.id()).deploy(&wasm()).call(Function::new("new").args_json(json!({ "owner_id": e.owner.id() }))).transact().await.unwrap();
    assert!(r.is_success());
    assert_fails(init_as(&e.contract_acct, e.contract_acct.id(), e.mallory.id()).await);
    assert_fails(init_as(&e.mallory, e.contract_acct.id(), e.mallory.id()).await);
    let owner: AccountId = e.contract_acct.view(e.contract_acct.id(), "get_owner").await.unwrap().json().unwrap();
    assert_eq!(&owner, e.owner.id(), "the owner never changes");
}

#[tokio::test]
async fn atomic_batch_rolls_back_if_init_fails_so_no_half_deployed_contract_remains() {
    let (_w, e) = setup().await;
    // Init with an invalid argument: the whole transaction (deploy included) must fail and leave no code behind.
    let r = e.contract_acct.batch(e.contract_acct.id()).deploy(&wasm()).call(Function::new("new").args_json(json!({ "owner_id": "NOT A VALID ACCOUNT!" }))).transact().await.unwrap();
    assert!(r.is_failure());
    assert!(e.contract_acct.view(e.contract_acct.id(), "get_count").await.is_err(), "no contract may be left deployed");
}
