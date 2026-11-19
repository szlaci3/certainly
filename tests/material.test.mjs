import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {BlobsServer} from '@netlify/blobs/server'
import {setEnvironmentContext} from '@netlify/blobs'
import handler from '../netlify/functions/material.ts'
import worker from '../netlify/functions/generate-background.ts'
import {storage,read,status} from '../netlify/lib/workflow.ts'
import {result} from '../netlify/lib/agent.ts'
import {issue,resolve} from '../netlify/lib/jobs.ts'

test('durable submission, redelivery, polling, and stored result', {timeout:20_000}, async t=>{
  const directory=await mkdtemp(join(tmpdir(),'material-blobs-'))
  const server=new BlobsServer({directory,token:'local-test',logger:()=>{}})
  const {port}=await server.start()
  t.after(async()=>{await server.stop();await rm(directory,{recursive:true,force:true})})
  setEnvironmentContext({siteID:'test-site',token:'local-test',apiURL:'http://127.0.0.1:'+port})
  process.env.GEMINI_API_KEY='test-key'
  process.env.JOB_TOKEN_SECRET='test-only-secret'.repeat(3)
  process.env.DEPLOY_URL='https://test.example'
  const realFetch=globalThis.fetch
  const url='https://test.example/api/material'
  const recipe={name:'Oak',base:'#aa8844',layers:[{pattern:'noise',x:2,y:8,color:'#554433',warp:0.2,opacity:1}]}
  const complete={status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(recipe)}]}]}
  let delivery,posts=0,reads=0
  t.mock.method(globalThis,'fetch',async (url,init)=>{
    if(String(url).startsWith('https://test.example/')){
      delivery=new Request(url,init)
      return new Response(null,{status:202})
    }
    if(!String(url).startsWith('https://generativelanguage.googleapis.com/')) return realFetch(url,init)
    if(init.method==='POST'){
      posts++
      return Response.json({id:'interaction-1',status:'queued'})
    }
    reads++
    if(reads===1)return new Response(null,{status:503})
    return Response.json(complete)
  })
  const submit=()=>handler(new Request(url,{method:'POST',headers:{'Idempotency-Key':'0123456789abcdef'},body:JSON.stringify({target:'floor',prompt:'oak'})}))
  const accepted=await submit()
  assert.equal(accepted.status,202)
  const {job}=await accepted.json()
  assert.equal((await submit()).status,202)
  const check=async()=> (await handler(new Request(url+'/'+job))).json()
  assert.deepEqual(await check(),{pending:true})
  const work=worker(delivery.clone())
  for(let i=0;!posts && i<200;i++)await new Promise(r=>setTimeout(r,10))
  assert.equal(posts,1)
  await worker(delivery.clone())
  await work
  assert.equal(posts,1)
  assert.deepEqual(await check(),{recipe})
  assert.deepEqual(await check(),{recipe})
  assert.equal((await handler(new Request(url+'/'+job+'x'))).status,404)

  const launch=async nonce=>{
    const resp=await handler(new Request(url,{method:'POST',headers:{'Idempotency-Key':nonce},
      body:JSON.stringify({target:'ceiling',prompt:'Clouds'})}))
    return (await resp.json()).job
  }
  const ambiguous=await launch('unknown-start-result')
  const underlying=globalThis.fetch
  let attempted=0
  t.mock.method(globalThis,'fetch',(url,init)=>{
    if(String(url).startsWith('https://generativelanguage.googleapis.com/') && init.method==='POST'){
      attempted++; throw new TypeError('Connection lost')
    }
    return underlying(url,init)
  })
  await worker(delivery.clone())
  await worker(delivery.clone())
  const failure=await handler(new Request(url+'/'+ambiguous))
  assert.equal(failure.status,422)
  assert.equal(attempted,1)

  const expired=await launch('expired-before-start')
  const id=resolve(expired,process.env.JOB_TOKEN_SECRET).slice('material:'.length)
  const store=storage(), entry=await read(store,id)
  await store.setJSON(id+'/request',{...entry,deadline:Date.now()-1})
  await worker(delivery.clone())
  assert.match((await status(store,id)).error,/timed out/)
  assert.match((await store.get(id+'/outcome',{type:'json'})).error,/timed out/)
  assert.equal(attempted,1)
})

test('expired handles and invalid recipes',t=>{
  const token=issue('test','key')
  t.mock.method(Date,'now',()=>new Date().getTime()+3_600_001)
  assert.equal(resolve(token,'key'),null)
  assert.throws(()=>result({status:'completed',steps:[]}),/unusable/)
})
