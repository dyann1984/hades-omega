#!/usr/bin/env node
/*
 * Builds the PUBLIC demo frontend from a clean export of the current commit and stages a self-contained folder
 * that can be deployed as its own Vercel project. It deploys NOTHING and talks to no remote service.
 *
 *   node scripts/prepare-public-demo.cjs --api-url https://<demo-api-host> [--out <dir>] [--env-file <f> ...]
 *
 * Steps: git archive HEAD -> npm ci --ignore-scripts -> build core + frontend with ONLY VITE_API_URL set ->
 *        scripts/check-bundle-secrets.cjs (fails the run on any finding) -> dist + generated vercel.json into <out>.
 * The staged folder has no .vercel link, so `vercel deploy` from it can never touch an existing project.
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto')
const args = process.argv.slice(2)
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const apiUrl = opt('--api-url'), envFiles = args.flatMap((a, i) => a === '--env-file' ? [args[i + 1]] : [])
if (!apiUrl || !/^https:\/\/[a-z0-9.-]+$/i.test(apiUrl)) { console.error('--api-url must be an https origin without path, e.g. https://hades-demo-api.onrender.com'); process.exit(2) }
const root = path.resolve(__dirname, '..')
const out = path.resolve(opt('--out') || path.join(os.tmpdir(), 'hades-public-demo-' + Date.now()))
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hades-demo-build-'))
const run = (cmd, a, o = {}) => execFileSync(cmd, a, { stdio: 'inherit', shell: process.platform === 'win32', ...o })
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim()
if (dirty) { console.error('Working tree has uncommitted changes; the build uses the committed HEAD only. Commit first.\n' + dirty); process.exit(2) }

console.log('1/5 exporting HEAD', execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim())
const tar = path.join(work, 'src.tar'); execFileSync('git', ['archive', 'HEAD', '-o', tar], { cwd: root }); const src = path.join(work, 'src'); fs.mkdirSync(src); run('tar', ['-xf', tar, '-C', src])
console.log('2/5 npm ci --ignore-scripts'); run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: src })
console.log('3/5 build (only VITE_API_URL is set)')
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(VITE_|NEAR_|JWT_|ANTHROPIC|HADES_)/.test(k))); env.VITE_API_URL = apiUrl
run('npm', ['run', 'build', '--workspace=packages/core'], { cwd: src, env }); run('npm', ['run', 'build', '--workspace=packages/frontend'], { cwd: src, env })
const dist = path.join(src, 'packages', 'frontend', 'dist')
console.log('4/5 bundle secret scan')
run(process.execPath, [path.join(root, 'scripts', 'check-bundle-secrets.cjs'), dist, '--api-url', apiUrl, ...envFiles.flatMap(f => ['--env-file', f])])
console.log('5/5 staging ->', out)
fs.mkdirSync(out, { recursive: true }); fs.cpSync(dist, out, { recursive: true })
const verify = fs.readFileSync(path.join(out, 'verify', 'index.html'), 'utf8')
const inline = /<script>([\s\S]*?)<\/script>/.exec(verify); if (!inline) throw new Error('verify page has no inline script')
const hash = "sha256-" + crypto.createHash('sha256').update(inline[1].replace(/\r\n?/g, '\n'), 'utf8').digest('base64') // browsers normalise newlines before hashing inline scripts
const tpl = fs.readFileSync(path.join(root, 'deploy', 'demo', 'vercel.template.json'), 'utf8').replace("'__VERIFY_SCRIPT_HASH__'", `'${hash}'`)
JSON.parse(tpl); fs.writeFileSync(path.join(out, 'vercel.json'), tpl)
console.log(`\nReady: ${out}\n  files: ${fs.readdirSync(out).join(', ')}\n  verify-page CSP script hash: ${hash}\n  .vercel present: ${fs.existsSync(path.join(out, '.vercel'))}\nNothing was deployed.`)
fs.rmSync(work, { recursive: true, force: true })
