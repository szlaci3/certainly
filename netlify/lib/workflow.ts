import {getStore} from '@netlify/blobs'
import * as agent from './agent.ts'

export function storage() {
  return getStore({name:'material-jobs',consistency:'strong'})
}
type Store = ReturnType<typeof storage>
type Input = {target:string,prompt:string,previous:string}
type Job = {input:Input,deadline:number}
type Outcome = {recipe:unknown}|{error:string}
export const lifetime = 14 * 60_000

export async function read(store:Store,id:string):Promise<Job|null> {
  return store.get(id+'/request',{type:'json'})
}

async function finish(store:Store,id:string,outcome:Outcome) {
  await store.setJSON(id+'/outcome',outcome,{onlyIfNew:true})
}

export async function status(store:Store,id:string) {
  const job=await read(store,id)
  if (!job) return null
  if (Date.now()>=job.deadline) await finish(store,id,{error:'Material generation timed out.'})
  const outcome:Outcome|null=await store.get(id+'/outcome',{type:'json'})
  return outcome ?? {pending:true}
}

export async function run(store:Store,id:string) {
  const job=await read(store,id)
  if (!job || await store.get(id+'/outcome')) return
  if (Date.now()>=job.deadline) {await status(store,id);return}
  let interaction=await store.get(id+'/interaction',{type:'text'})
  if (!interaction) {
    // Exactly one delivery earns permission to POST. Never release this claim,
    // even after an ambiguous failure between the POST and the checkpoint.
    const claim=await store.set(id+'/claim','starting',{onlyIfNew:true})
    if (!claim.modified) return
    try {
      const initial=await agent.start(job.input.target,job.input.prompt,job.input.previous)
      const response=agent.result(initial)
      if (Date.now()>=job.deadline) {await status(store,id);return}
      if (!response.pending) {await finish(store,id,{recipe:response.recipe});return}
      if (!initial.id) throw Error('Missing Gemini interaction ID.')
      interaction=initial.id
    } catch(e) {
      await finish(store,id,{error:e instanceof Error?e.message:'Gemini submission failed.'})
      return
    }
    await store.set(id+'/interaction',interaction,{onlyIfNew:true})
  }
  // Redelivery may safely resume GETs against the checkpointed interaction.
  let delay=3000
  while (Date.now()<job.deadline) {
    if (await store.get(id+'/outcome')) return
    let outcome:Outcome|undefined
    try {
      const response=agent.result(await agent.poll(interaction))
      if (!response.pending) outcome={recipe:response.recipe}
      delay=6000
    } catch(e) {
      if (agent.retryable(e)) delay=Math.min(delay*2,30_000)
      else outcome={error:e instanceof Error?e.message:'Generation failed.'}
    }
    if (outcome && Date.now()<job.deadline) {await finish(store,id,outcome);return}
    await new Promise(r=>setTimeout(r,Math.max(0,Math.min(delay,job.deadline-Date.now()))))
  }
  await status(store,id)
}
