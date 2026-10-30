import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }
const derive = (password: string, salt: string): Promise<Buffer> => new Promise((resolve,reject) => scrypt(password,salt,64,parameters,(error,key) => error ? reject(error) : resolve(key as Buffer)))
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || Buffer.byteLength(password,'utf8') > 1024) throw new Error('Password must contain at least 12 characters and at most 1024 bytes')
  const salt = randomBytes(16).toString('hex'), hash = await derive(password,salt)
  return `scrypt-32768-8-3:${salt}:${hash.toString('hex')}`
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm,salt,encoded]=stored.split(':')
  if (algorithm !== 'scrypt-32768-8-3' || !/^[0-9a-f]{32}$/.test(salt ?? '') || !/^[0-9a-f]{128}$/.test(encoded ?? '') || Buffer.byteLength(password,'utf8') > 1024) return false
  const actual=await derive(password,salt!)
  return timingSafeEqual(actual,Buffer.from(encoded!,'hex'))
}

const COMMON = new Set(['password','passwordpassword','123456789012','qwertyuiopas','administrator','adminadminadmin','letmeinletmein','hadeshades1234','iloveyou1234'])
/**
 * Password policy: accepts memorable passphrases (several words) or 12-128 character passwords.
 * Returns an error code or null. Never logs the value.
 */
export function validatePasswordPolicy(password: string, username?: string): string | null {
  if (typeof password !== 'string' || password.length < 12) return 'PASSWORD_TOO_SHORT'
  if (password.length > 128 || Buffer.byteLength(password, 'utf8') > 1024) return 'PASSWORD_TOO_LONG'
  const lower = password.toLowerCase().replace(/\s+/g, '')
  if (COMMON.has(lower)) return 'PASSWORD_TOO_COMMON'
  if (username && username.length >= 3 && lower.includes(username.toLowerCase())) return 'PASSWORD_CONTAINS_USERNAME'
  if (new Set(password).size < 6) return 'PASSWORD_LOW_VARIETY'
  const words = password.trim().split(/[\s._-]+/).filter(w => w.length >= 3)
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(password)).length
  if (words.length >= 3 || password.length >= 20) return null // passphrase
  return classes >= 3 ? null : 'PASSWORD_TOO_WEAK'
}
