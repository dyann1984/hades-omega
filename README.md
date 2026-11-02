# HADES OMEGA

HADES OMEGA is a TypeScript multi-agent orchestration prototype with a Fastify API, a React dashboard, deterministic policy checks, and a local document-comparison workflow. It is being prepared for the NEAR Hackathon 2026. **This repository is not yet a complete blockchain-enabled submission.**

## Verified scope and limitations

- The local multi-document workflow dispatches implemented document and hashing capabilities, records execution events, and can wait for an administrator's decision. Its automated integration tests exercise these paths.
- CERBERUS evaluates proposals against deterministic rules. Unregistered operation names are denied and recognized sensitive operations require human review. This does not yet establish a complete execution boundary, bind approvals to exact transaction parameters, or implement an emergency stop.
- NEAR transactions are simulated. The existing real transaction path throws an error; no wallet, signing, submission, or on-chain confirmation is implemented. An admin-only read-only testnet account and balance lookup uses near-api-js in the backend and is available in Vault. It was verified against the public guestbook.near-examples.testnet account; it does not prepare, sign or send transactions.
- CHRONOS currently keeps illustrative task state in the frontend; it is not a persistent scheduler and its “run now” control does not execute a backend job.
- Some Vault information is static and must not be relied on as live configuration. Demo data is isolated and labeled in supported demo flows.
- The CommonJS-compatible near-api-js 5.1.1 dependency introduces low-severity transitive npm audit advisories; it is used only for read-only RPC and is not approved for transaction signing. The dependency tree also reports a moderate uuid advisory.
- The Rust audit contract is source code only; deployment and testnet operation have not been verified here.

## Development

Prerequisites: Node.js 20 or later and npm. Rust and Cargo are needed to test the contract.

```sh
npm ci
npm run type-check
npm run test
npm run dev:all
```

The API requires environment configuration; consult `.env.example` and the setup documentation before running it. Do not commit credentials. The test suite uses local network sockets for WebSocket tests and needs permission to connect to localhost. On restricted Windows environments, setting `TEMP` and `TMP` to a writable workspace directory may be necessary for Vitest.

`npm run lint` currently runs no lint tasks and is not a valid quality check. Contract tests can be run with `cargo test --manifest-path packages/contracts/Cargo.toml` where Cargo and dependencies are available.

## Architecture

- `packages/core`: agents, policy engine, planner, audit, and NEAR bridge.
- `packages/api`: Fastify API, authenticated sessions, SQLite persistence and local execution workflows.
- `packages/frontend`: React/Vite interface.
- `packages/contracts`: NEAR Rust audit registry source.
- `docs`: design and operational documentation; older documents may describe planned rather than implemented behavior.

See [the initial audit](AUDITORIA_HACKATHON_INICIAL.md) for identified gaps. No deployment, actual blockchain transaction, or contest submission is performed by these development commands.


