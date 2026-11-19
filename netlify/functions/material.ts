import {createHmac, randomUUID} from 'node:crypto'
import {storage, read, status, lifetime} from '../lib/workflow.ts'
import {poll, result} from '../lib/agent.ts'
import {issue, resolve, signingKey} from '../lib/jobs.ts'

export const config = {path: ['/api/material', '/api/material/:job']}

function json(body: object, status = 200) {
  return Response.json(body, {status, headers: {'Cache-Control': 'no-store'}})
}

export default async function material(req: Request, context?: {site?: {url?: string}}) {
  const path = new URL(req.url).pathname
  try {
    if (path === '/api/material') {
      if (req.method !== 'POST') return json({error:'Use POST to start a material.'},405)
      const raw = await req.text()
      if (Buffer.byteLength(raw) > 24_000) return json({error:'Request too large.'},413)
      let data
      try { data = JSON.parse(raw) } catch { return json({error:'Invalid JSON.'},400) }
      if (!data || !['floor','ceiling'].includes(data.target) || typeof data.prompt !== 'string' ||
          !data.prompt.trim() || data.prompt.length > 1600) return json({error:'Describe a floor or ceiling in 1–1600 characters.'},400)
      const key = signingKey()
      const nonce=req.headers.get('Idempotency-Key') ?? randomUUID()
      if (!/^[a-zA-Z0-9_-]{16,100}$/.test(nonce)) return json({error:'Invalid request ID.'},400)
      const id=createHmac('sha256',key).update('material:'+nonce).digest('hex')
      const input={target:data.target,prompt:data.prompt,previous:String(data.previous ?? '').slice(0,1800)}
      const store=storage()
      await store.setJSON(id+'/request',{input,deadline:Date.now()+lifetime},{onlyIfNew:true})
      const entry=await read(store,id)
      if (!entry) throw Error('Material job unavailable.')
      if (JSON.stringify(entry.input)!==JSON.stringify(input)) return json({error:'Request ID already in use.'},409)
      if (Date.now()<entry.deadline && !await store.get(id+'/claim')) {
        // Use the trusted deploy URL, never a client-provided Host header.
        const origin=process.env.NETLIFY_DEV==='true' ? new URL(req.url).origin : (process.env.DEPLOY_URL || context?.site?.url)
        if (!origin) throw Error('Netlify deploy URL is unavailable.')
        const dispatch=await fetch(new URL('/.netlify/functions/generate-background',origin),{
          method:'POST',headers:{Authorization:'Bearer '+issue('worker:'+id,key)},
          redirect:'error',signal:AbortSignal.timeout(8000)
        })
        if (dispatch.status!==202) throw Error('Could not queue material generation.')
      }
      return json({pending:true,job:issue('material:'+id,key)},202)
    }
    const match = /^\/api\/material\/([^/]+)$/.exec(path)
    if (!match) return json({error:'Unknown endpoint.'},404)
    if (req.method !== 'GET') return json({error:'Use GET to check a material.'},405)
    const id = resolve(match[1],signingKey())
    if (!id) return json({error:'Invalid or expired material request. Please try again.'},404)
    if (id.startsWith('material:')) {
      const state=await status(storage(),id.slice(9))
      return state ? json(state,'error' in state?422:200) : json({error:'Material request expired.'},404)
    }
    if (id.startsWith('worker:')) return json({error:'Invalid job handle.'},404)
    // Poll handles issued by the previous deploy until their original expiry.
    return json(result(await poll(id)))
  } catch (e) {
    return json({error:e instanceof Error ? e.message : 'Material request failed.'},503)
  }
}
