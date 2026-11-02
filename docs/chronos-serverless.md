# CHRONOS on hosts that sleep or are serverless

CHRONOS stores tasks and runs in SQLite. On a long-lived host the API runs the scheduler in-process every
`CHRONOS_TICK_MS` (default 30000 ms). Disable with `CHRONOS_SCHEDULER=off`.

A sleeping host (e.g. a free tier that spins down) or a serverless function cannot keep that timer alive. Instead,
call the tick endpoint from an external scheduler. One pass claims due tasks (a unique index prevents double runs, even
with several callers), coalesces slots missed while asleep into one catch-up run, and executes due retries.

## Configuration

1. Generate a secret of at least 32 characters and set it only on the API host:
   `CHRONOS_TICK_SECRET=<random 40+ chars>`. Without it the endpoint is **not registered** (404).
2. Call it from any scheduler, with the secret as a bearer token:

```
curl -fsS -X POST https://<api-host>/internal/chronos/tick -H "Authorization: Bearer $CHRONOS_TICK_SECRET"
```

`GET` is also accepted for schedulers that can only issue GET. Response: `{ success, data: { started, retried, runs[] } }`.

Examples of schedulers: a GitHub Actions workflow with `on: schedule` (store the secret in repository secrets), a
Render Cron Job, or any external cron service. Run it at most every minute; cron expressions have minute resolution
and are evaluated in UTC. Note that Vercel Cron only calls paths of its own project, so it cannot reach a separately
hosted API directly.

## Security properties

- Constant-time comparison; wrong, missing, truncated or non-Bearer credentials get 401 and execute nothing.
- The secret is not a user session: it does not authenticate `/api/v1/*`.
- The tick only runs registered READ jobs, each authorized through the CERBERUS gate as `SYSTEM/CHRONOS`.
- The endpoint is subject to the global rate limit. Never put the secret in the frontend or in query strings.
