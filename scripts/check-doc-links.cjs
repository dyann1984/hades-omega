#!/usr/bin/env node
/*
 * Checks every link in the judge-facing Markdown files:
 *   - relative links must exist in the given Git ref (default HEAD), anchors must match a heading,
 *   - absolute http(s) links must answer 2xx/3xx (HEAD, then GET).
 * Read-only. Usage: node scripts/check-doc-links.cjs [ref] [file ...]
 */
const { execFileSync } = require('node:child_process')
const ref = process.argv[2] || 'HEAD'
const files = process.argv.length > 3 ? process.argv.slice(3) : ['README.md', 'docs/JUDGES.md', 'docs/requisitos-entrega-hackathon.md', 'docs/guion-video-3min.md']
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 26 })
const tree = new Set(git('ls-tree', '-r', '--name-only', ref).split(/\r?\n/).filter(Boolean))
const slug = h => h.toLowerCase().replace(/<[^>]+>/g, '').replace(/[`*_~]/g, '').replace(/[^\p{L}\p{N} -]/gu, '').trim().replace(/ /g, '-')
let bad = 0
const report = (ok, where, link, why = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${where}  ${link}${why ? '  — ' + why : ''}`); if (!ok) bad++ }
async function status(url) {
  for (const method of ['HEAD', 'GET']) {
    try { const r = await fetch(url, { method, redirect: 'follow', headers: { 'user-agent': 'hades-link-check' }, signal: AbortSignal.timeout(20000) }); if (r.status < 400) return r.status; if (method === 'GET') return r.status } catch (e) { if (method === 'GET') return 'ERR ' + e.message }
  }
}
;(async () => {
  for (const f of files) {
    if (!tree.has(f)) { report(false, f, '(file)', `not in ${ref}`); continue }
    const text = git('show', `${ref}:${f}`).replace(/```[\s\S]*?```/g, '')
    const heads = new Set([...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map(m => slug(m[1])))
    const links = new Set([...text.matchAll(/\]\(([^)\s]+)\)/g)].map(m => m[1]).concat([...text.matchAll(/<(https?:\/\/[^>\s]+)>/g)].map(m => m[1])))
    for (const l of links) {
      if (/^https?:\/\//.test(l)) { const s = await status(l); report(typeof s === 'number' && s < 400, f, l, String(s)); continue }
      if (/^mailto:/.test(l)) continue
      const [p, anchor] = l.split('#'); const base = f.includes('/') ? f.slice(0, f.lastIndexOf('/') + 1) : ''
      const target = p ? require('node:path').posix.normalize(base + p) : f
      const exists = tree.has(target) || [...tree].some(t => t.startsWith(target + '/'))
      if (!exists) { report(false, f, l, 'missing in ' + ref); continue }
      if (anchor && target.endsWith('.md')) { const h2 = target === f ? heads : new Set([...git('show', `${ref}:${target}`).matchAll(/^#{1,6}\s+(.+)$/gm)].map(m => slug(m[1]))); report(h2.has(anchor), f, l, h2.has(anchor) ? '' : 'anchor not found'); continue }
      report(true, f, l)
    }
  }
  console.log(bad ? `\n${bad} BROKEN LINK(S)` : '\nALL LINKS OK')
  process.exit(bad ? 1 : 0)
})()
