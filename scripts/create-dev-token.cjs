const crypto = require('node:crypto')

const secret = process.env.JWT_SECRET
if (!secret || secret.length < 32) process.exit(1)
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const input = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'local-operator', roles: ['ADMIN', 'OPERATOR', 'AUDITOR'], exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 })}`
process.stdout.write(`${input}.${crypto.createHmac('sha256', secret).update(input).digest('base64url')}`)
