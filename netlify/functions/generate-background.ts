import {resolve,signingKey} from '../lib/jobs.ts'
import {storage,run} from '../lib/workflow.ts'

export default async function worker(req:Request) {
  if (req.method!=='POST') return
  const token=req.headers.get('authorization')?.replace(/^Bearer /,'') ?? ''
  const claim=resolve(token,signingKey())
  if (!claim?.startsWith('worker:')) return
  await run(storage(),claim.slice(7))
}
