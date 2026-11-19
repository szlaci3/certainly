import {createHmac, timingSafeEqual} from 'node:crypto'

// Google owns the job state. Every instance can authenticate the same expiring handle.
export function signingKey() {
  const key = process.env.JOB_TOKEN_SECRET
  if (!key || Buffer.byteLength(key) < 32) throw Error('Configure JOB_TOKEN_SECRET with at least 32 random characters.')
  return key
}

function signature(data: string, key: string) {
  return createHmac('sha256', key).update(data).digest('base64url')
}

export function issue(id: string, key: string) {
  const data = Buffer.from(JSON.stringify([id, Date.now() + 3_600_000])).toString('base64url')
  return data + '.' + signature(data,key)
}

export function resolve(token: string, key: string): string | null {
  if (token.length > 8192) return null
  const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token)
  if (!match || !timingSafeEqual(Buffer.from(match[2]), Buffer.from(signature(match[1],key)))) return null
  const [id, expiry] = JSON.parse(Buffer.from(match[1], 'base64url').toString())
  return typeof id === 'string' && expiry > Date.now() ? id : null
}
