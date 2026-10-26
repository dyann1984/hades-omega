# HADES OMEGA — Deployment Guide

## Preview URL (Vercel + Railway)

### 1. Backend — Railway

**One-click deploy:**

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/hades-omega)

**Manual steps:**
1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. New Project → Deploy from GitHub Repo → select `dyann1984/hades-omega`
3. Railway auto-detects `railway.toml` and `packages/api/Dockerfile`
4. Add volume: Settings → Volumes → Mount at `/data` (SQLite persistence)
5. Set environment variables:
   ```
   NODE_ENV=production
   API_PORT=3001
   DB_PATH=/data/hades.db
   NEAR_EXECUTION_MODE=simulation
   NEAR_NETWORK=testnet
   ```
6. Deploy → copy the Railway domain (e.g. `hades-omega-api.railway.app`)

### 2. Frontend — Vercel

**One-click deploy:**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/dyann1984/hades-omega)

**Manual steps:**
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. New Project → Import `dyann1984/hades-omega`
3. Framework: Other (vercel.json handles config)
4. Add environment variables:
   ```
   VITE_API_URL=https://<your-railway-domain>
   VITE_WS_URL=wss://<your-railway-domain>
   ```
5. Deploy → your URL will be `https://hades-omega-<hash>.vercel.app`

---

## Demo Mode (No Backend Required)

The frontend includes a **Demo Mode** that simulates the full agent workflow without a backend. Use it to preview the UI from any device:

1. Open the Vercel preview URL on any browser
2. Click **▶ Run Demo** in the Mission Control panel
3. Watch the full agent flow: ELYSIUM → CHARON → CERBERUS → MINOS → TARTARUS
4. The demo auto-runs for ~30 seconds and shows all features

---

## NEAR Testnet Integration

Current status: **SIMULATION MODE** (default)

To enable real NEAR Testnet transactions:

1. Create a testnet account at [wallet.testnet.near.org](https://wallet.testnet.near.org)
2. Export credentials to `~/.near-credentials/testnet/hades-omega.testnet.json`
3. Build and deploy the Rust contract:
   ```bash
   cd packages/contracts/audit-registry
   cargo build --target wasm32-unknown-unknown --release
   near deploy --accountId audit.hades-omega.testnet \
     --wasmFile target/wasm32-unknown-unknown/release/audit_registry.wasm
   ```
4. Set environment variables:
   ```
   NEAR_EXECUTION_MODE=real
   NEAR_ACCOUNT_ID=hades-omega.testnet
   NEAR_CONTRACT_ID=audit.hades-omega.testnet
   NEAR_CREDENTIALS_PATH=~/.near-credentials
   ```

**Without these steps:** The system runs in SIMULATION mode — SHA-256 derived pseudo-hashes with nearblocks.io URLs. All transactions are clearly labeled `◇ SIMULATED` in the UI.

---

## Test from Android

1. Open Chrome on Android
2. Navigate to the Vercel preview URL
3. The UI is fully responsive with bottom tab navigation on mobile
4. Tap **▶ Run Demo** to see the full agent flow
5. Tap **MINOS — Approve** when the escalation modal appears (in demo, auto-approves after 5s)

---

## Local Development

```bash
# Install dependencies
pnpm install

# Start both frontend and backend
pnpm dev

# Run tests (64 tests, 0 failures)
pnpm test

# Type check both packages
pnpm test:ci
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  HADES OMEGA v0.3                        │
├─────────────┬─────────────────────┬────────────────────┤
│  Frontend   │       Backend       │   NEAR Testnet     │
│  React+Vite │  Fastify+SQLite     │  Rust Contract     │
│  Vercel     │  Railway+Docker     │  audit-registry    │
│  port 5173  │  port 3001          │  hades-omega.near  │
└─────────────┴─────────────────────┴────────────────────┘
      │ WebSocket (wss://)  │
      └─────────────────────┘
```

## Agent Flow

```
Mission Input
     │
     ▼
 HADES (orchestrator)
     │
     ├── ELYSIUM  → Critical path + risk scoring
     ├── CHARON   → Vendor evaluation
     │     └── CERBERUS → Policy guard (PERMIT/DENY/ESCALATE)
     │           └── MINOS → Human approval (blocks until resolved)
     ├── PERSEPHONE → Budget validation
     └── TARTARUS → Post-execution security scan
               │
               ▼
          NEAR Testnet (audit hash)
```
