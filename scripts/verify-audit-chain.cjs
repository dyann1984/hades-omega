#!/usr/bin/env node
/*
 * Verificador independiente y de SOLO LECTURA de la cadena de auditoría de HADES (SQLite).
 * No importa código de HADES: recalcula los hashes con su propia implementación, de modo que un tercero pueda comprobarla.
 *
 *   node scripts/verify-audit-chain.cjs --db <archivo.sqlite> [--json] [--expect-head <sha256>] [--expect-count <n>]
 *
 *  --expect-head / --expect-count: ancla EXTERNA guardada por el operador (p. ej. de una ejecución anterior o de un registro
 *  on-chain). Sin ella sólo se puede comprobar la coherencia interna; con ella se detecta también truncamiento o reemplazo
 *  de la cola aunque se reescriba la tabla de ancla local.
 *
 * Códigos de salida: 0 = PASS, 1 = FAIL (cadena rota o no coincide con el ancla), 2 = error de uso o de lectura.
 * Fórmula (la misma que escribe la API): sha256(`${prev}|${id}|${actor}|${mission}|${action}|${result}|${correlation}|${timestamp}`)
 * con prev del primer evento encadenado = GENESIS_ + 64 ceros. Los eventos antiguos sin hash sólo se admiten antes del primero encadenado.
 */
const { createHash } = require('node:crypto')
const GENESIS = 'GENESIS_' + '0'.repeat(64)
const argv = process.argv.slice(2)
const flag = n => argv.includes(n)
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const json = flag('--json')

function done(code, out) {
  const verdict = code === 0 ? 'PASS' : code === 1 ? 'FAIL' : 'ERROR'
  const full = { verdict, checkedAt: new Date().toISOString(), ...out }
  if (json) console.log(JSON.stringify(full, null, 2))
  else if (code === 0) console.log(`PASS  eventos encadenados=${out.hashedEvents} cabeza=${out.headHash}`)
  else console.error(`${verdict}  ${out.error}`)
  process.exit(code)
}

const file = opt('--db')
if (!file) done(2, { error: 'Uso: node scripts/verify-audit-chain.cjs --db <archivo.sqlite> [--json] [--expect-head <sha256>] [--expect-count <n>]' })
const expectHead = opt('--expect-head'), expectCountRaw = opt('--expect-count')
if (expectHead !== undefined && !/^[0-9a-f]{64}$/.test(expectHead)) done(2, { error: '--expect-head debe ser un SHA-256 en hexadecimal minúscula' })
if (expectCountRaw !== undefined && !/^\d+$/.test(expectCountRaw)) done(2, { error: '--expect-count debe ser un entero' })

let db
try {
  const Database = require('better-sqlite3')
  db = new Database(file, { readonly: true, fileMustExist: true })
} catch (e) { done(2, { error: `No se pudo abrir la base en modo lectura: ${e.message}` }) }

try {
  const events = db.prepare('SELECT id,actor,mission_id,action,result,correlation_id,timestamp,prev_hash,hash FROM audit_events ORDER BY rowid ASC').all()
  let anchor = null
  try { const a = db.prepare('SELECT count, head_hash FROM audit_anchor WHERE id = 1').get(); if (a) anchor = { count: a.count, headHash: a.head_hash } } catch { /* base anterior al ancla */ }
  let prev = GENESIS, hashed = 0
  const result = extra => ({ totalEvents: events.length, hashedEvents: hashed, headHash: hashed ? prev : null, localAnchor: anchor, ...extra })
  for (const e of events) {
    if (!e.hash) {
      if (hashed > 0) done(1, result({ error: `Evento sin hash después de la cadena: ${e.id}`, brokenAtId: e.id, code: 'HASH_MISSING' }))
      continue
    }
    if (e.prev_hash !== prev) done(1, result({ error: `prev_hash no coincide en ${e.id}`, brokenAtId: e.id, code: 'CHAIN_BROKEN' }))
    const expected = createHash('sha256').update(`${e.prev_hash}|${e.id}|${e.actor}|${e.mission_id}|${e.action}|${e.result}|${e.correlation_id}|${e.timestamp}`, 'utf8').digest('hex')
    if (e.hash !== expected) done(1, result({ error: `Hash alterado en ${e.id}`, brokenAtId: e.id, code: 'HASH_MISMATCH' }))
    prev = e.hash; hashed++
  }
  if (anchor) {
    if (hashed < anchor.count) done(1, result({ error: `Truncamiento: ${hashed} eventos y el ancla local registra ${anchor.count}`, code: 'TRUNCATED' }))
    if (hashed > anchor.count) done(1, result({ error: `El ancla local (${anchor.count}) va por detrás de la cadena (${hashed})`, code: 'ANCHOR_BEHIND' }))
    if (hashed > 0 && anchor.headHash !== prev) done(1, result({ error: 'La cabeza no coincide con el ancla local', code: 'HEAD_MISMATCH' }))
  }
  if (expectCountRaw !== undefined && Number(expectCountRaw) > hashed) done(1, result({ error: `Truncamiento respecto del ancla externa: se esperaban al menos ${expectCountRaw} eventos y hay ${hashed}`, code: 'TRUNCATED_EXTERNAL' }))
  if (expectHead !== undefined) {
    // La cabeza esperada debe aparecer en la cadena; si la cadena sólo creció, sigue siendo coherente con ese ancla.
    const seen = events.some(e => e.hash === expectHead)
    if (!seen) done(1, result({ error: 'La cabeza externa esperada no aparece en la cadena (reemplazo o truncamiento)', code: 'HEAD_MISMATCH_EXTERNAL' }))
  }
  done(0, result({ externalAnchorChecked: expectHead !== undefined || expectCountRaw !== undefined }))
} catch (e) {
  done(2, { error: `Error de lectura: ${e.message}` })
} finally { try { db.close() } catch { /* ignore */ } }
