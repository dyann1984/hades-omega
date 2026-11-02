# NEAR testnet intent gate (partial)

The admin-only API can persist an audit intent and an approval, but there is **no signer, transaction construction, broadcaster, confirmation polling, or UI for intents**. Do not treat an approval as permission to send a transaction: no send endpoint exists. This mechanism has not been validated with a real wallet or contract.

`POST /api/v1/near/intents` accepts exactly the following fields. This is an illustrative fixture, not a prepared real operation:

```json
{"network":"testnet","signerId":"source.testnet","receiverId":"audit.testnet","type":"AUDIT_HASH","amountYocto":"0","auditId":"audit-1","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","operationType":"PLANNING","agentName":"HADES","decision":"PERMIT","timestampMs":1700000000000,"gas":"30000000000000"}
```

The returned hash covers these fields in a fixed order. `POST /api/v1/near/intents/{id}/request-approval` evaluates CERBERUS and requires an escalation. `POST /api/v1/near/intents/{id}/approve` accepts the returned hash and an expiry in milliseconds, at most 15 minutes in the future. `GET /api/v1/near/intents/{id}` returns the recorded status. `POST /api/v1/near/intents/{id}/resolve` accepts `REJECTED` or `CANCELLED`; `POST /api/v1/near/emergency-stop` accepts `{ "stopped": true }` or `{ "stopped": false }`. All require an authenticated administrator. The gate can atomically consume approval internally, but is intentionally not exposed as an execution route.

A successful review does not check that the supplied hash matches a persisted audit record or that the contract exists. Before implementing a signer, bind the request to verified audit evidence and an approved contract and key, enforce the emergency stop at signing and broadcast, persist signed bytes and hash before broadcast, and implement reconciliation without re-signing. Do not send funds or sign without specific user authorization.

Dependency audit on 2026-11-02: the `uuid` advisory GHSA-w5hq-g745-h8pq was removed by upgrading direct dependencies to 11.1.1. Twelve low-severity findings remain in the `near-api-js` 5.1.1 dependency chain through `elliptic` (GHSA-848j-6mx2-7j84). The installed SDK is only used for read-only RPC; its use for signing remains unvalidated. Avoid `npm audit fix --force`.
