# NEAR testnet runbook — dedicated account, audit contract, first authorized transaction

Status verified on 2026-11-02 by read-only RPC (`rpc.testnet.near.org`, chain `testnet`):

| Item | Result |
|---|---|
| `audit.hades-omega.testnet` | **does not exist** (`UNKNOWN_ACCOUNT`) |
| `hades-omega.testnet` | **does not exist** — and since anyone can register testnet names, pick a name you control now |

**Superseded in detail by docs/near-testnet-preparacion.md** (current hash ae9a75ff…, #[private] init, official-doc commands, recovery). See also (attested WASM hash, costs, exact first operation) and docs/contract-attestation.json.

Nothing below has been executed by the code or by an assistant. Every command that creates an account, uses a faucet,
deploys, or sends a transaction is for **you** to run, deliberately, with testnet funds only.

## 0. Principles

- Testnet only. The server refuses non-`.testnet` accounts, non-testnet RPC hosts and `NEAR_EXECUTION_MODE=mainnet`.
- Two accounts, least privilege: a **signer** account (owns the contract, pays gas) and a **contract** sub-account.
  The server holds only a **function-call access key** limited to `store_audit_hash` on the contract, never a full-access key.
- Private keys live in the server environment or a key file outside the repository. They are never in the frontend,
  git, logs or API responses.

## 1. Create the signer account (testnet)

Choose a unique name, e.g. `hades-<yourhandle>.testnet`. With near-cli-rs (`npm`/`cargo` install per
<https://github.com/near/near-cli-rs>; syntax can differ between versions, check `near account create-account --help`):

```
near account create-account sponsor-by-faucet-service hades-<yourhandle>.testnet autogenerate-new-keypair save-to-keychain network-config testnet create
near state hades-<yourhandle>.testnet --networkId testnet       # or: near account view-account-summary ...
```

The faucet-sponsored account receives testnet NEAR only. Do not reuse any mainnet key or seed phrase.

## 2. Build and test the contract (needs Rust; not available in the CI of this repo)

```
cd packages/contracts
rustup target add wasm32-unknown-unknown
cargo test                      # unit tests in src/lib.rs
cargo install cargo-near && cargo near build
```

Without installing Rust, if Docker Desktop is running, the unit tests can run in a throwaway container that leaves the
repository untouched (copy first, because Cargo writes a lockfile):

```
docker run --rm -v "L:\HADES\packages\contracts:/src:ro" rust:1 sh -c "cp -r /src /work && cd /work && cargo test"
```

What *is* verified without a toolchain (`packages/api/src/near/contract-conformance.test.ts`): the source still exposes
`store_audit_hash` with the exact argument order the API sends, is owner-only and non-payable, has the duplicate / invalid
input / permission unit tests, and every intent the API accepts also satisfies the contract's own validation rules
(randomized, mutation-checked). That is a source-level check, **not** a compilation.

**Verified on 2026-11-02** in a throwaway `rust:1` Docker container (cargo 1.99.1, nothing installed on the host, nothing deployed):

- `cargo test`: **12 passed, 0 failed** (owner-only write, idempotent retry, conflicting duplicate, short/uppercase/non-hex hash,
  malformed/over-long id, lowercase operation type, unknown decision, independent ids).
- `cargo build --release --target wasm32-unknown-unknown`: OK, `hades_audit_registry.wasm` = 218 046 bytes,
  SHA-256 `AE9A75FFF7BB44E00BF3769E10CCC4E855B1F3C249ABC768FD275B34DFB9F685 (after the #[private] init fix; was 5B1429BB… before)`. The binary exports `store_audit_hash`,
  `get_audit_entry`, `get_count`, `get_owner`, and contains the non-payable guard ("doesn't accept deposit").
- Dependencies are pinned by the committed `Cargo.lock` (near-sdk resolved to 5.30.0; `Cargo.toml` only says `5.5.0`).
- That wasm came from plain `cargo build`. Before the real deployment build it with `cargo near build` (the reproducible
  build) and use *that* artifact; its hash will differ. Not verified on a live network.
## 3. Create the contract sub-account and deploy (spends testnet NEAR)

```
near account create-account fund-myself audit.hades-<yourhandle>.testnet '3 NEAR' autogenerate-new-keypair save-to-keychain sign-as hades-<yourhandle>.testnet network-config testnet sign-with-keychain send
near contract deploy audit.hades-<yourhandle>.testnet use-file ./target/near/hades_audit_registry.wasm with-init-call new json-args '{"owner_id":"hades-<yourhandle>.testnet"}' prepaid-gas '100 TGas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
```

Verify (read-only): `near contract call-function as-read-only audit.hades-<yourhandle>.testnet get_owner json-args '{}' network-config testnet now`
must print your signer account.

## 4. Give the server a restricted key

```
near account add-key hades-<yourhandle>.testnet grant-function-call-access --contract-account-id audit.hades-<yourhandle>.testnet --function-names 'store_audit_hash' --allowance '0.25 NEAR' autogenerate-new-keypair save-to-legacy-keychain network-config testnet sign-with-keychain send
```

Export that new key's private key into the server environment (never into the repo).

## 5. Server configuration (all server-side)

```
NEAR_EXECUTION_MODE=testnet
NEAR_SIGNING_ENABLED=true                       # exact string; anything else keeps signing off
NEAR_SIGNER_ACCOUNT_ID=hades-<yourhandle>.testnet
NEAR_SIGNER_PRIVATE_KEY=ed25519:...             # or NEAR_SIGNER_KEY_FILE=/secure/path/credentials.json
NEAR_AUDIT_CONTRACT_ID=audit.hades-<yourhandle>.testnet
# optional: NEAR_RPC_URL (testnet hosts only), NEAR_MIN_SIGNER_BALANCE_YOCTO
```

Then, as ADMIN, allow the contract as a destination: `POST /api/v1/cerberus/gate/recipients/add`
`{"tool":"near.audit_hash_submit","recipient":"audit.hades-<yourhandle>.testnet"}`.

## 6. First authorized transaction (only after the owner says go)

1. Open the **NEAR** page. Config must show no blockers.
2. Enter an event text, **Revisar parámetros**, check every field (zero deposit, 30 Tgas, `store_audit_hash`), create.
3. **Aprobar (10 min)** — a one-time approval bound to the exact parameter hash.
4. **Firmar y enviar** — preflight verifies chain, deployed contract, owner, key permissions, balance and that the id is
   not already recorded; only then is the approval consumed and the transaction signed and broadcast.
5. **Consultar confirmación** until `CONFIRMED` with “verificado en el contrato: sí”. Open the explorer link.
   Keep that transaction hash as the evidence; do not invent or copy hashes from anywhere else.

## 7. Failure handling

| Situation | What the system does |
|---|---|
| Broadcast fails after signing | Intent stays `BROADCAST_PENDING`; the **same signed bytes** are re-sent (network dedups by hash). |
| Crash before a signature was stored | Intent becomes `FAILED`; nothing exists on the network; create a new intent + approval. |
| Signature older than ~80 000 blocks, tx unknown | `RECONCILIATION_REQUIRED`; reconcile reads contract state only and never re-sends. |
| Emergency stop on | No new submission, no re-broadcast; reads and status checks continue. |
