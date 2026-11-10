#!/usr/bin/env node
/*
 * Gate for the PUBLIC frontend bundle (run before any deploy).
 *   node scripts/check-bundle-secrets.cjs <dist-dir> [--api-url https://host] [--env-file path ...]
 * Fails (exit 1) if the bundle contains: key/token-shaped strings, server-side variable names, source maps,
 * a VITE_* variable outside the allowlist, any http(s) API origin other than the expected one, or the VALUE of any
 * secret-looking variable found in the given env files / process environment (values are never printed).
 */
const fs = require('node:fs'), path = require('node:path')
const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const envFiles = args.flatMap((a, i) => a === '--env-file' ? [args[i + 1]] : [])
const apiUrl = opt('--api-url')
const dist = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')) && fs.existsSync(a) && fs.statSync(a).isDirectory())
if (!dist) { console.error('usage: check-bundle-secrets.cjs <dist-dir> [--api-url URL] [--env-file F]'); process.exit(2) }

const ALLOWED_VITE = new Set(['VITE_API_URL', 'VITE_WS_URL'])
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
const files = walk(dist)
let bad = 0
const check = (name, ok, extra) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) bad++ }

const textFiles = files.filter(f => /\.(js|mjs|css|html|json|txt|map|svg|webmanifest)$/i.test(f))
const blobs = textFiles.map(f => ({ f: path.relative(dist, f), s: fs.readFileSync(f, 'utf8') }))
const all = blobs.map(b => b.s).join('\n')
const hits = (re) => blobs.filter(b => re.test(b.s)).map(b => b.f)

check('no source maps shipped', !files.some(f => f.endsWith('.map')))
const shapes = [
  ['private-key-shaped NEAR ed25519 (>=80 base58)', /ed25519:[1-9A-HJ-NP-Za-km-z]{80,}/],
  ['PEM private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['GitHub token', /\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{30,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['signed JWT (header.payload.signature)', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['server-side variable names', /\b(JWT_SECRET|ANTHROPIC_API_KEY|NEAR_SIGNER_PRIVATE_KEY|NEAR_SIGNER_KEY_FILE|HADES_SNAPSHOT_KEY|HADES_DURABLE_DATABASE_URL|master_seed_phrase)\b/], // names of secret-bearing variables; NEAR_SIGNING_ENABLED is a public on/off flag name that UI help text may cite
]
for (const [label, re] of shapes) { const h = hits(re); check(`no ${label}`, h.length === 0, h.length ? 'in ' + h.join(', ') : '') }

const viteNames = new Set([...all.matchAll(/\bVITE_[A-Z0-9_]+\b/g)].map(m => m[0]))
const stray = [...viteNames].filter(n => !ALLOWED_VITE.has(n))
check('only allowlisted VITE_* names are referenced', stray.length === 0, stray.length ? stray.join(', ') : [...viteNames].join(', ') || '(none)')

// Values of local secrets must not be in the bundle (never printed).
const secretish = /(SECRET|TOKEN|PASSWORD|PASSPHRASE|PRIVATE|API_KEY|SEED)/i
const candidates = []
for (const f of envFiles) { try { for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line); if (m) candidates.push([`${path.basename(f)}:${m[1]}`, m[2].replace(/^['"]|['"]$/g, '')]) } } catch { check(`env file readable: ${f}`, false) } }
for (const [k, v] of Object.entries(process.env)) if (secretish.test(k) && v) candidates.push([`process.env:${k}`, v])
const tested = candidates.filter(([k, v]) => (secretish.test(k) || /^VITE_/.test(k.split(':')[1])) && v.length >= 12)
const leaked = tested.filter(([, v]) => all.includes(v)).map(([k]) => k)
check(`no secret VALUE from ${tested.length} local variables appears in the bundle`, leaked.length === 0, leaked.length ? 'LEAKED: ' + leaked.join(', ') : '')

// Network origins the bundle may talk to
const origins = new Set([...all.matchAll(/https?:\/\/[a-z0-9.-]+(?::\d+)?/gi)].map(m => m[0].toLowerCase()))
// Public NEAR *testnet* read-only RPC endpoints the browser verifier (verify/index.html) falls back across.
// Read-only by construction: the page holds no key and the check below asserts it cannot send a transaction.
// No mainnet endpoint belongs here.
const NEAR_TESTNET_RPC = 'rpc\\.testnet\\.near\\.org|archival-rpc\\.testnet\\.near\\.org|test\\.rpc\\.fastnear\\.com|archival-rpc\\.testnet\\.fastnear\\.com'
const known = new RegExp(`^(https?:\\/\\/(www\\.w3\\.org|localhost(:\\d+)?|127\\.0\\.0\\.1(:\\d+)?|explorer\\.testnet\\.near\\.org|${NEAR_TESTNET_RPC}|fonts\\.(googleapis|gstatic)\\.com|reactjs\\.org|react\\.dev|github\\.com|nearhackathon\\.com|unpkg\\.com|cdn\\.jsdelivr\\.net|threejs\\.org|developer\\.mozilla\\.org|docs\\.pmnd\\.rs|reactrouter\\.com)|http:\\/\\/localhost)`) // last two: URLs inside library error messages
const unknown = [...origins].filter(o => !known.test(o) && !(apiUrl && o === new URL(apiUrl).origin.toLowerCase()))
check('bundle references no unexpected network origin', unknown.length === 0, unknown.length ? unknown.join(', ') : `${origins.size} origins, all expected`)
if (apiUrl) check('configured API origin is embedded', all.toLowerCase().includes(new URL(apiUrl).origin.toLowerCase()))
check('public verifier page is present and cannot sign', blobs.some(b => b.f.replace(/\\/g, '/') === 'verify/index.html' && !/send_tx|broadcast_tx/.test(b.s)))

console.log(`\n${files.length} files scanned (${textFiles.length} text). ` + (bad ? `${bad} CHECK(S) FAILED` : 'BUNDLE CLEAN'))
process.exit(bad ? 1 : 0)
