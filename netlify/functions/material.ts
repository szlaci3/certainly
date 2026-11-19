import {start, poll, result} from '../lib/agent.ts'
import {issue, resolve, signingKey} from '../lib/jobs.ts'

export const config = {path: ['/api/material', '/api/material/:job']}

function json(body: object, status = 200) {
  return Response.json(body, {status, headers: {'Cache-Control': 'no-store'}})
}

export default async function material(req: Request) {
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
      const job = await start(data.target,data.prompt,String(data.previous ?? '').slice(0,1800))
      const response = result(job)
      if (!response.pending) return json(response)
      if (!job.id) throw Error('Antigravity omitted the interaction ID.')
      return json({...response,job:issue(job.id,key)})
    }
    const match = /^\/api\/material\/([^/]+)$/.exec(path)
    if (!match) return json({error:'Unknown endpoint.'},404)
    if (req.method !== 'GET') return json({error:'Use GET to check a material.'},405)
    const id = resolve(match[1],signingKey())
    if (!id) return json({error:'Invalid or expired material request. Please try again.'},404)
    return json(result(await poll(id)))
  } catch (e) {
    return json({error:e instanceof Error ? e.message : 'Material request failed.'},503)
  }
}
