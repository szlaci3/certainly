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
}else $('.caption h2').textContent='WebGL 2 is required'
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
  const card=$('#'+t);card.querySelector('img').src=src;card.querySelector('strong').textContent=name;redraw();return true
}
for(const [t,s] of Object.entries(surfaces)){
  const card=document.createElement('div');card.id=t;card.className='card'
  card.innerHTML='<img alt=""><div><label>'+t.toUpperCase()+'</label><strong></strong></div><button aria-label="Upload '+t+' image" title="Upload image">↑</button>'
  $('#cards').append(card);card.querySelector('button').onclick=()=>{uploadTarget=t;$('#file').click()}
  setImage(t,s.src,s.name)
}
for(const [id, name] of Object.entries({wood:'Wooden floor', brick:'Brick wall', marble:'Marble', grass:'Grass'})){
  const button=document.createElement('button')
  const image=document.createElement('img')
  const src='materials/'+id+'.webp'
  image.src=src
  image.alt=''
  button.append(image,document.createTextNode(name))
  button.onclick=async()=>{
    const surface=target
    try{
      if(await setImage(surface,src,name))surfaces[surface].description=name
    }catch{message('Could not load '+name+'.')}
  }
  $('.swatches').append(button)
}
function message(text,user=false){const p=document.createElement('p');p.className='bubble'+(user?' user':'');p.textContent=text;$('#log').append(p);p.scrollIntoView({block:'nearest'})}
$('#file').onchange=async e=>{const f=e.target.files[0];if(!f)return;const surface=uploadTarget,src=URL.createObjectURL(f);try{if(await setImage(surface,src,f.name))surfaces[surface].description=f.name}catch{URL.revokeObjectURL(src);message('Could not decode that image.')}e.target.value=''}
function select(t){target=t;document.querySelectorAll('[data-t]').forEach(b=>{b.classList.toggle('active',b.dataset.t===t);b.setAttribute('aria-pressed',b.dataset.t===t)})}
document.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>select(b.dataset.t));select(target)
document.querySelectorAll('.suggest button').forEach((b,i)=>b.onclick=()=>{select(i?'ceiling':'floor');$('textarea').value=b.textContent.replace(' ↗','');$('textarea').focus()})
$('form').onsubmit=async e=>{
  e.preventDefault();const prompt=$('textarea').value.trim(),t=target;if(!prompt||$('#send').disabled)return
  message(t+' · '+prompt,true);$('#send').disabled=true;$('#send').textContent='Generating…'
  try{const res=await fetch('/api/material',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target:t,prompt,previous:surfaces[t].description||surfaces[t].name})})
    let data=await res.json()
    if(!res.ok)throw Error(data.error||'Generation failed.')
    const job=data.job
    while(data.pending){
      $('#send').textContent='Antigravity is composing…'
      await new Promise(resolve=>setTimeout(resolve,6000))
      const status=await fetch('/api/material/'+encodeURIComponent(job))
      data=await status.json()
      if(!status.ok)throw Error(data.error||'Could not check material status.')
    }
    const recipe=data.recipe
    const blob=await new Promise((resolve,reject)=>{
      const worker=new Worker('compose.js')
      worker.onmessage=e=>{worker.terminate();resolve(e.data)}
      worker.onerror=()=>{worker.terminate();reject(Error('The texture could not be rendered.'))}
      worker.postMessage(recipe)
    })
    const src=URL.createObjectURL(blob)
    try{if(!await setImage(t,src,recipe.name))return}catch(err){URL.revokeObjectURL(src);throw err}
    surfaces[t].description=recipe.name+' — '+prompt
    message('Applied '+recipe.name+' to the '+t+'.');$('textarea').value=''
  }catch(err){message(err.message)}finally{$('#send').disabled=false;$('#send').textContent='✧  Generate material  ↗'}
}
let pointer=null
canvas.onpointerdown=e=>{pointer=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId)}
canvas.onlostpointercapture=()=>pointer=null
canvas.onpointermove=e=>{if(!pointer)return;yaw-=(e.clientX-pointer[0])*.004;pitch=Math.max(-1.45,Math.min(1.45,pitch+(e.clientY-pointer[1])*.004));pointer=[e.clientX,e.clientY];redraw()}
let last=0
function move(now){if(!keys.size){last=0;return}const step=last?Math.min(now-last,50)*.004:0;last=now
 const f=keys.has('w')-keys.has('s'),r=keys.has('d')-keys.has('a')
 x+=(f*Math.sin(yaw)+r*Math.cos(yaw))*step;z+=(f*Math.cos(yaw)-r*Math.sin(yaw))*step;redraw();requestAnimationFrame(move)}
let moving=false
window.onkeydown=e=>{const k=e.key.toLowerCase();if(e.ctrlKey||e.metaKey||e.altKey||e.target.matches('input,textarea')||!['w','a','s','d'].includes(k))return;if(!keys.size&&!last)requestAnimationFrame(move);keys.add(k)}
window.onkeyup=e=>keys.delete(e.key.toLowerCase());window.onblur=()=>keys.clear()
$('#reset').onclick=()=>{yaw=x=z=0;pitch=-.035;redraw()}
$('#expand').onclick=()=>document.fullscreenElement?document.exitFullscreen():$('#viewport').requestFullscreen()
