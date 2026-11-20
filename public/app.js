const $ = s => document.querySelector(s)
const canvas = $('#scene'), gl = canvas.getContext('webgl2',{alpha:false,antialias:false})
const surfaces = {floor:{name:'Sienna dunes',src:'dune.jpg'},ceiling:{name:'Aurora veil',src:'aurora.jpg'}}
let target='floor', uploadTarget, yaw=0, pitch=-.035, x=0,z=0
const keys=new Set()
const fadeDuration=600
let redraw=()=>{}
if(gl){
  const program=gl.createProgram()
  function shader(type,source){
    const s=gl.createShader(type)
    gl.shaderSource(s,source);gl.compileShader(s)
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s))
    gl.attachShader(program,s)
  }
  shader(gl.VERTEX_SHADER,`#version 300 es
  out vec2 uv; void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p*2.-1.;gl_Position=vec4(uv,0.,1.);}`)
  shader(gl.FRAGMENT_SHADER,`#version 300 es
  precision highp float; in vec2 uv;out vec4 color;
  uniform sampler2D floorMap,skyMap,oldFloor,oldSky;uniform vec2 blend;uniform vec2 pos,angle;uniform float aspect;
  void main(){vec3 d=normalize(vec3(uv.x*aspect,uv.y,1.36));float p=angle.y,a=angle.x;
  d.yz=mat2(cos(p),-sin(p),sin(p),cos(p))*d.yz;
  d.xz=mat2(cos(a),-sin(a),sin(a),cos(a))*d.xz;
  float dist=(d.y<0.?1.5:3.)/max(abs(d.y),.00001);
  vec2 coord=(pos+dist*d.xz)/(d.y<0.?12.:22.);
  vec3 c=d.y<0.?texture(floorMap,coord).rgb:texture(skyMap,coord).rgb;
  if(d.y<0. && blend.x<1.)c=mix(texture(oldFloor,coord).rgb,c,blend.x);
  if(d.y>=0. && blend.y<1.)c=mix(texture(oldSky,coord).rgb,c,blend.y);
  vec3 haze=vec3(.38,.38,.42);color=vec4(mix(haze,c,exp(-dist*.017)),1.);}`)
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program))
  gl.useProgram(program)
  const loc=n=>gl.getUniformLocation(program,n)
  gl.uniform1i(loc('floorMap'),0);gl.uniform1i(loc('skyMap'),1)
  gl.uniform1i(loc('oldFloor'),2);gl.uniform1i(loc('oldSky'),3)
  const blendLocation=loc('blend')
  let frame=0
  function progress(surface,now){
    if(!surface.fade)return 1
    const t=Math.min(1,(now-surface.fade.start)/fadeDuration)
    if(t===1){
      gl.deleteTexture(surface.fade.old)
      surface.fade.resolve()
      surface.fade=null
    }
    return t*t*(3-2*t)
  }
  redraw=()=>{
    const ratio=Math.min(devicePixelRatio,2)
    const w=Math.round(canvas.clientWidth*ratio),h=Math.round(canvas.clientHeight*ratio)
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
    gl.viewport(0,0,w,h);gl.uniform1f(loc('aspect'),w/h)
    gl.uniform2f(loc('pos'),x,z);gl.uniform2f(loc('angle'),yaw,pitch)
    const now=performance.now()
    gl.uniform2f(blendLocation,progress(surfaces.floor,now),progress(surfaces.ceiling,now))
    if(!frame && (surfaces.floor.fade || surfaces.ceiling.fade)){
      frame=requestAnimationFrame(()=>{frame=0;redraw()})
    }
    gl.drawArrays(gl.TRIANGLES,0,3)
  }
  new ResizeObserver(redraw).observe(canvas)
}else $('#notice').textContent='WebGL 2 is required'
async function setImage(t,src,name){
  const surface=surfaces[t], request=Symbol()
  surface.request=request
  const image=new Image();image.src=src;await image.decode()
  if(surface.fade)await surface.fade.done
  if(surface.request!==request){
    if(src.startsWith('blob:'))URL.revokeObjectURL(src)
    return false
  }
  if(gl){
    const max=Math.min(8192,gl.getParameter(gl.MAX_TEXTURE_SIZE))
    let pixels=image
    if(Math.max(image.width,image.height)>max){
      pixels=document.createElement('canvas');const scale=max/Math.max(image.width,image.height)
      pixels.width=Math.max(1,Math.round(image.width*scale));pixels.height=Math.max(1,Math.round(image.height*scale))
      pixels.getContext('2d').drawImage(image,0,0,pixels.width,pixels.height)
    }
    const unit=t==='floor'?0:1
    const old=surface.texture
    surface.texture=gl.createTexture()
    gl.activeTexture(gl.TEXTURE0+unit)
    gl.bindTexture(gl.TEXTURE_2D,surfaces[t].texture)
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,pixels);gl.generateMipmap(gl.TEXTURE_2D)
    const ext=gl.getExtension('EXT_texture_filter_anisotropic')
    if(ext)gl.texParameterf(gl.TEXTURE_2D,ext.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)))
    if(old){
      gl.activeTexture(gl.TEXTURE0+unit+2)
      gl.bindTexture(gl.TEXTURE_2D,old)
      const fade={old,start:performance.now()}
      fade.done=new Promise(resolve=>{fade.resolve=resolve})
      surface.fade=fade
    }
  }
  const old=surfaces[t].src;Object.assign(surfaces[t],{src,name})
  if(old.startsWith('blob:'))URL.revokeObjectURL(old)
  redraw();return true
}
const library=new Map()
let db, openPanel=null
function showPanel(which){
  openPanel=which
  $('#panel').hidden=!which
  $('#library').hidden=which!=='library'
  $('#chat').hidden=which!=='chat'
  $('#heading').textContent=which==='chat'?'Material assistant':'Materials'
  for(const b of document.querySelectorAll('[data-panel]'))b.setAttribute('aria-expanded',b.dataset.panel===which)
}
for(const b of document.querySelectorAll('[data-panel]')){
  b.onclick=()=>showPanel(openPanel===b.dataset.panel?null:b.dataset.panel)
}
function closePanel(){
  document.querySelector('[data-panel="'+openPanel+'"]')?.focus()
  showPanel(null)
}
$('#close').onclick=closePanel
document.addEventListener('click',e=>{
  if(!openPanel || e.target.closest('#panel,[data-panel]'))return
  closePanel()
  // A scene click that dismisses the panel should preserve the cursor mode.
  if(e.target===canvas)e.stopPropagation()
},true)
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&openPanel)closePanel()})
function refresh(){
  for(const b of document.querySelectorAll('[data-t]'))b.setAttribute('aria-pressed',b.dataset.t===target)
  for(const b of $('.swatches').querySelectorAll('[data-id]'))b.setAttribute('aria-pressed',b.dataset.id===surfaces[target].id)
}
async function materialColor(blob){
  const bitmap=await createImageBitmap(blob)
  const tile=document.createElement('canvas')
  tile.width=tile.height=24
  const ctx=tile.getContext('2d')
  try{
    ctx.imageSmoothingEnabled=false
    ctx.drawImage(bitmap,0,0,24,24)
  }finally{bitmap.close()}
  const pixels=ctx.getImageData(0,0,24,24).data
  // Group nearby shades so grain and narrow veins do not overwhelm the main color.
  const groups=new Map()
  let largest
  for(let i=0;i<pixels.length;i+=4){
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2]
    const key=(r>>5)*64+(g>>5)*8+(b>>5)
    const group=groups.get(key)||{count:0,r:0,g:0,b:0}
    group.count++;group.r+=r;group.g+=g;group.b+=b
    groups.set(key,group)
    if(!largest||group.count>largest.count)largest=group
  }
  return '#'+[largest.r,largest.g,largest.b].map(sum=>
    Math.round(sum/largest.count).toString(16).padStart(2,'0')).join('')
}
function renderRecipe(recipe){
  return new Promise((resolve,reject)=>{
      const worker=new Worker('compose.js')
      worker.onmessage=e=>{worker.terminate();resolve(e.data)}
      worker.onerror=()=>{worker.terminate();reject(Error('The texture could not be rendered.'))}
      worker.postMessage(recipe)
    })
}
function addMaterial(m){
  library.set(m.id,m)
  const b=document.createElement('button')
  b.dataset.id=m.id
  const preview=document.createElement(m.generated?'span':'img')
  if(m.generated){
    preview.className='placeholder'
    if(m.color)preview.style.backgroundColor=m.color
    else materialColor(m.blob).then(color=>{
      preview.style.backgroundColor=color
      m.color=color
      if(db && library.has(m.id))db.transaction('materials','readwrite').objectStore('materials').put(m)
    }).catch(()=>{}) // Older records can still use the neutral placeholder.
  }
  else{preview.src=m.src||URL.createObjectURL(m.blob);preview.alt=''}
  b.append(preview,document.createTextNode(m.name))
  b.onclick=()=>applyMaterial(target,m).catch(()=>notice('Could not load this material.'))
  const row=document.createElement('div')
  row.className='material-row'
  const actions=document.createElement('button')
  actions.textContent='⋯'
  actions.setAttribute('aria-label','Actions for '+m.name)
  actions.setAttribute('aria-expanded','false')
  const menu=document.createElement('div')
  menu.className='material-actions'
  menu.hidden=true
  const remove=document.createElement('button')
  remove.textContent='Delete'
  remove.onclick=async()=>{
    if(library.size<=1)return notice('Keep at least one material in the library.')
    if(!confirm('Delete '+m.name+' from your library?'))return
    try{
      const fallback=[...library.values()].find(item=>item.id!==m.id)
      for(const t of ['floor','ceiling']){
        if(surfaces[t].id===m.id)await applyMaterial(t,fallback)
      }
      if(db){
        const tx=db.transaction('materials','readwrite'),store=tx.objectStore('materials')
        if(m.blob)store.delete(m.id)
        else store.put({id:m.id,removed:true})
        await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)})
      }
      library.delete(m.id);row.remove()
      if(preview.src?.startsWith('blob:'))URL.revokeObjectURL(preview.src)
    }catch{notice('Could not delete this material.')}
  }
  menu.append(remove)
  if(m.recipe){
    const recolor=document.createElement('button')
    recolor.textContent='Recolor'
    const styles=document.createElement('div')
    styles.hidden=true
    recolor.onclick=()=>{styles.hidden=!styles.hidden}
    for(const style of ['Joker','Harlequin','Carnival']){
      const button=document.createElement('button')
      button.textContent=style
      button.onclick=async()=>{
        const surface=target, seed=newId()
        const recipe=recolorRecipe(m.recipe,style,seed)
        try{
          const blob=await renderRecipe(recipe)
          await applyMaterial(surface,{id:newId(),name:recipe.name,recipe,seed,blob,generated:true,
            color:await materialColor(blob).catch(()=>recipe.base)})
        }catch{notice('Could not create the color variation.')}
      }
      styles.append(button)
    }
    menu.append(recolor,styles)
  }
  actions.onclick=()=>{
    menu.hidden=!menu.hidden
    actions.setAttribute('aria-expanded',String(!menu.hidden))
  }
  row.append(b,actions,menu)
  if(m.blob)$('.swatches').prepend(row)
  else $('.swatches').append(row)
}
function notice(text){$('#notice').textContent=text}
function writeState(key,value,material){
  if(!db)return
  const tx=db.transaction(material?['materials','choices']:['choices'],'readwrite')
  if(material)tx.objectStore('materials').put(material)
  tx.objectStore('choices').put(value,key)
  tx.onabort=()=>notice('Browser storage is unavailable. Changes apply to this session only.')
}
async function applyMaterial(t,m,save=true){
  const src=m.src||URL.createObjectURL(m.blob)
  try{if(!await setImage(t,src,m.name))return false}
  catch(err){if(m.blob)URL.revokeObjectURL(src);throw err}
  const fresh=!library.has(m.id)
  if(fresh)addMaterial(m)
  surfaces[t].id=m.id
  surfaces[t].description=m.description||m.name
  if(save)writeState(t,m.id,fresh?m:null)
  refresh()
  return true
}
function dbResult(request){
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(request.error)
  })
}
async function initialize(){
  for(const [id,name,src] of [
    ['wood','Wooden floor','materials/wood.webp'],['brick','Brick wall','materials/brick.webp'],
    ['marble','Marble','materials/marble.webp'],['grass','Grass','materials/grass.webp'],
    ['dune','Sienna dunes','dune.jpg'],['aurora','Aurora veil','aurora.jpg']
  ])addMaterial({id,name,src})
  let floor,ceiling,selected
  try{
    const opening=indexedDB.open('strata-world',1)
    opening.onupgradeneeded=()=>{
      opening.result.createObjectStore('materials',{keyPath:'id'})
      opening.result.createObjectStore('choices')
    }
    db=await dbResult(opening)
    const tx=db.transaction(['choices','materials'])
    const choices=tx.objectStore('choices')
    const [items,...settings]=await Promise.all([dbResult(tx.objectStore('materials').getAll()),
      ...['floor','ceiling','target'].map(k=>dbResult(choices.get(k)))])
    for(const item of items){
      if(item.removed){
        library.delete(item.id)
        $('.swatches').querySelector('[data-id="'+CSS.escape(item.id)+'"]')?.closest('.material-row').remove()
      }else addMaterial(item)
    }
    ;[floor,ceiling,selected]=settings
  }catch{notice('Browser storage is unavailable. Changes apply to this session only.')}
  target=selected==='ceiling'?'ceiling':'floor'
  await Promise.all([applyMaterial('floor',library.get(floor)||library.get('dune')||library.values().next().value,false),
    applyMaterial('ceiling',library.get(ceiling)||library.get('aurora')||library.values().next().value,false)])
}
$('.studio').inert=true
initialize().catch(()=>notice('Could not restore the scene.')).finally(()=>{$('.studio').inert=false})
for(const b of document.querySelectorAll('[data-t]'))b.onclick=()=>{
  target=b.dataset.t;refresh();writeState('target',target)
}
function newId(){return Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-')}
$('#upload').onclick=()=>{uploadTarget=target;$('#file').click()}
$('#file').onchange=async e=>{
  const blob=e.target.files[0];e.target.value=''
  if(!blob)return
  try{await applyMaterial(uploadTarget,{id:newId(),name:blob.name,blob})}
  catch{notice('Could not open that image.')}
}
function message(text,user=false){
  const p=document.createElement('p');p.className='bubble'+(user?' user':'')
  p.textContent=text;$('#log').append(p);$('#log').scrollTop=$('#log').scrollHeight
}
// Preserve the submission key after an ambiguous network failure. Retrying the
// same brief must recover its job even if the first POST response was lost.
let lastSubmission
try{lastSubmission=JSON.parse(sessionStorage.getItem('material-submission'))}catch{}
function rememberSubmission(value){
  lastSubmission=value
  try{
    if(value)sessionStorage.setItem('material-submission',JSON.stringify(value))
    else sessionStorage.removeItem('material-submission')
  }catch{} // In-memory retry still works if browser storage is disabled.
}
async function materialRequest(path,options){
  for(let attempt=0;;attempt++){
    let response
    try{response=await fetch(path,{...options,signal:AbortSignal.timeout(25000)})}
    catch(err){if(attempt>=2)throw err}
    if(response && (response.status<500 || attempt>=2)){
      if(response.status>=400 && response.status<500)rememberSubmission(null)
      const data=await response.json()
      if(!response.ok)throw Error(data.error||'Material request failed.')
      return data
    }
    await new Promise(resolve=>setTimeout(resolve,1000*2**attempt))
  }
}
$('form').onsubmit=async e=>{
  e.preventDefault();const prompt=$('textarea').value.trim(),t=target;if(!prompt||$('#send').disabled)return
  message(t+' · '+prompt,true);$('#send').disabled=true;$('#send').textContent='Generating…'
  try{
    const body=JSON.stringify({target:t,prompt,previous:surfaces[t].description||surfaces[t].name})
    if(lastSubmission?.body!==body)rememberSubmission({body,id:newId()})
    let data=await materialRequest('/api/material',{method:'POST',
      headers:{'Content-Type':'application/json','Idempotency-Key':lastSubmission.id},body})
    const job=data.job
    while(data.pending){
      $('#send').textContent='Antigravity is composing…'
      await new Promise(resolve=>setTimeout(resolve,6000))
      data=await materialRequest('/api/material/'+encodeURIComponent(job))
    }
    rememberSubmission(null)
    const recipe=data.recipe
    const blob=await renderRecipe(recipe)
    const material={id:newId(),name:recipe.name,description:recipe.name+' — '+prompt,blob,recipe,generated:true,
      color:await materialColor(blob).catch(()=>recipe.base)}
    if(!await applyMaterial(t,material))return
    message('Applied '+recipe.name+' to the '+t+'.');$('textarea').value=''
  }catch(err){message(err.message)}finally{$('#send').disabled=false;$('#send').textContent='Generate material'}
}
let pointer=null
canvas.addEventListener('click',e=>{
  if(e.pointerType==='mouse' && e.button===0)canvas.classList.toggle('free-cursor')
})
canvas.onpointerdown=e=>{
  if(e.pointerType==='mouse'||pointer)return
  pointer={id:e.pointerId,x:e.clientX,y:e.clientY}
  canvas.setPointerCapture(e.pointerId)
}
canvas.onlostpointercapture=e=>{if(pointer?.id===e.pointerId)pointer=null}
canvas.onpointermove=e=>{
  if(e.pointerType==='mouse' && canvas.classList.contains('free-cursor'))return
  let dx=e.movementX,dy=e.movementY
  if(e.pointerType!=='mouse'){
    if(pointer?.id!==e.pointerId)return
    dx=pointer.x-e.clientX;dy=pointer.y-e.clientY
    pointer.x=e.clientX;pointer.y=e.clientY
  }
  yaw+=dx*.004
  pitch=Math.max(-1.45,Math.min(1.45,pitch-dy*.004))
  redraw()
}
const arrows=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'])
let last=0, movementFrame=0
const heldArrows=new Map()
for(const button of document.querySelectorAll('[data-walk]')){
  button.onpointerdown=e=>{
    if(e.button!==0)return
    e.preventDefault()
    button.setPointerCapture(e.pointerId)
    heldArrows.set(e.pointerId,button.dataset.walk)
    if(!movementFrame)movementFrame=requestAnimationFrame(move)
  }
  button.onpointerup=button.onpointercancel=button.onlostpointercapture=e=>heldArrows.delete(e.pointerId)
  button.oncontextmenu=e=>e.preventDefault()
}
function pressed(key){
  return keys.has(key)||Array.from(heldArrows.values()).includes(key)
}
function move(now){
  movementFrame=0
  if(!keys.size&&!heldArrows.size){last=0;return}
  const step=last?Math.min(now-last,50)*.004:0;last=now
  const f=pressed('ArrowUp')-pressed('ArrowDown')
  const r=pressed('ArrowRight')-pressed('ArrowLeft')
  x+=(f*Math.sin(yaw)+r*Math.cos(yaw))*step
  z+=(f*Math.cos(yaw)-r*Math.sin(yaw))*step
  redraw();movementFrame=requestAnimationFrame(move)
}
function editing(el){return el.isContentEditable||el.matches('input,textarea,select')}
document.addEventListener('focusin',e=>{if(editing(e.target))keys.clear()})
window.onkeydown=e=>{
  if(!arrows.has(e.key)||editing(e.target)||e.ctrlKey||e.metaKey||e.altKey)return
  e.preventDefault();keys.add(e.key)
  if(!movementFrame)movementFrame=requestAnimationFrame(move)
}
window.onkeyup=e=>keys.delete(e.key)
function stopWalking(){keys.clear();heldArrows.clear()}
window.onblur=stopWalking
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopWalking()})
$('#reset').onclick=()=>{yaw=x=z=0;pitch=-.035;redraw()}
$('#expand').onclick=()=>document.fullscreenElement?document.exitFullscreen():$('#viewport').requestFullscreen()

if(!document.fullscreenEnabled)$('#expand').hidden=true
