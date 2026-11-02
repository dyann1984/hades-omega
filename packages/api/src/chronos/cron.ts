/** Minimal 5-field cron (minute hour day-of-month month day-of-week), evaluated in UTC. */
export interface ParsedCron { minute: Set<number>; hour: Set<number>; dom: Set<number>; month: Set<number>; dow: Set<number>; domAny: boolean; dowAny: boolean }

const FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day-of-month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day-of-week', min: 0, max: 7 },
] as const

function parseField(raw: string, min: number, max: number, name: string): Set<number> {
  const out = new Set<number>()
  for (const part of raw.split(',')) {
    const [rangePart, stepPart, extra] = part.split('/')
    if (extra !== undefined || !rangePart) throw new Error(`Invalid cron ${name}: "${raw}"`)
    const step = stepPart === undefined ? 1 : Number(stepPart)
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid cron step in ${name}: "${raw}"`)
    let lo: number, hi: number
    if (rangePart === '*') { lo = min; hi = max }
    else if (/^\d+$/.test(rangePart)) { lo = Number(rangePart); hi = stepPart === undefined ? lo : max }
    else if (/^\d+-\d+$/.test(rangePart)) { [lo, hi] = rangePart.split('-').map(Number) as [number, number] }
    else throw new Error(`Invalid cron ${name}: "${raw}"`)
    if (lo < min || hi > max || lo > hi) throw new Error(`Cron ${name} out of range ${min}-${max}: "${raw}"`)
    for (let v = lo; v <= hi; v += step) out.add(v)
  }
  return out
}

export function parseCron(expr: string): ParsedCron {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error('Cron expression must have exactly 5 fields')
  const [mi, ho, dm, mo, dw] = parts as [string, string, string, string, string]
  const dow = parseField(dw, FIELDS[4].min, FIELDS[4].max, FIELDS[4].name)
  if (dow.delete(7)) dow.add(0)
  return {
    minute: parseField(mi, FIELDS[0].min, FIELDS[0].max, FIELDS[0].name),
    hour: parseField(ho, FIELDS[1].min, FIELDS[1].max, FIELDS[1].name),
    dom: parseField(dm, FIELDS[2].min, FIELDS[2].max, FIELDS[2].name),
    month: parseField(mo, FIELDS[3].min, FIELDS[3].max, FIELDS[3].name),
    dow,
    domAny: dm.startsWith('*'),
    dowAny: dw.startsWith('*'),
  }
}

/** First matching minute strictly after `afterMs`, or null if none within ~5 years. */
export function nextCronRun(expr: string, afterMs: number): number | null {
  const c = parseCron(expr)
  const d = new Date(afterMs)
  d.setUTCSeconds(0, 0)
  d.setUTCMinutes(d.getUTCMinutes() + 1)
  const limit = afterMs + 5 * 366 * 86_400_000
  while (d.getTime() <= limit) {
    if (!c.month.has(d.getUTCMonth() + 1)) { d.setUTCMonth(d.getUTCMonth() + 1, 1); d.setUTCHours(0, 0, 0, 0); continue }
    const domOk = c.dom.has(d.getUTCDate()), dowOk = c.dow.has(d.getUTCDay())
    // Standard cron: when both day fields are restricted, either may match.
    const dayOk = c.domAny || c.dowAny ? domOk && dowOk : domOk || dowOk
    if (!dayOk) { d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(0, 0, 0, 0); continue }
    if (!c.hour.has(d.getUTCHours())) { d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0); continue }
    if (!c.minute.has(d.getUTCMinutes())) { d.setUTCMinutes(d.getUTCMinutes() + 1); continue }
    return d.getTime()
  }
  return null
}
