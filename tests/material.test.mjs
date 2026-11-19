import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../netlify/functions/material.ts'
import {result} from '../netlify/lib/agent.ts'
import {resolve} from '../netlify/lib/jobs.ts'

test('start and poll use an authenticated, expiring job handle', async t => {
  process.env.GEMINI_API_KEY = 'test-key'
  process.env.JOB_TOKEN_SECRET = 'test-only-secret'.repeat(3)
  const recipe = {name:'Oak',base:'#aa8844',layers:[{pattern:'noise',x:2,y:8,color:'#554433',warp:0.2,opacity:1}]}
  const completed = {status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(recipe)}]}]}
  let calls=0
  t.mock.method(globalThis,'fetch',async (url,init)=>{
    calls++
    if(init.method==='POST'){
      assert.equal(JSON.parse(init.body).background,true)
      return Response.json({id:'interaction-1',status:'queued'})
    }
    assert.ok(url.endsWith('/interaction-1'))
    return Response.json(completed)
  })
  const url='https://example.test/api/material'
  const started=await handler(new Request(url,{method:'POST',body:JSON.stringify({target:'floor',prompt:'Oak'})}))
  const {job,pending}=await started.json()
  assert.equal(pending,true)
  assert.equal((await handler(new Request(url+'/'+job+'x'))).status,404)
  assert.deepEqual(await (await handler(new Request(url+'/'+job))).json(),{recipe})
  assert.equal(calls,2)
  t.mock.method(Date,'now',()=>new Date().getTime()+3_600_001)
  assert.equal(resolve(job,process.env.JOB_TOKEN_SECRET),null)
  recipe.layers[0].x=101
  completed.steps[0].content[0].text=JSON.stringify(recipe)
  assert.throws(()=>result(completed),/unusable/)
})
