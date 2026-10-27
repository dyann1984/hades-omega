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
