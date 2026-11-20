// Render only the finite operations in the recipe. All noise lattices wrap at tile edges.
const frac = n => n - Math.floor(n)
const mix = (a,b,t) => a+(b-a)*t
function hash(i,j,seed){
  let h=Math.imul(i,374761393)+Math.imul(j,668265263)+seed
  h=Math.imul(h^(h>>>13),1274126177)
  return ((h^(h>>>16))>>>0)/4294967296
}
function noise(u,v,n,m,seed){
  const x=frac(u)*n,y=frac(v)*m,i=Math.floor(x),j=Math.floor(y)
  let a=x-i,b=y-j
  a=a*a*(3-2*a);b=b*b*(3-2*b)
  const k=(i+1)%n,l=(j+1)%m
  return mix(mix(hash(i,j,seed),hash(k,j,seed),a),mix(hash(i,l,seed),hash(k,l,seed),a),b)
}
function weight(layer,u,v,seed){
  const n=layer.x,m=layer.y
  const distortion=(noise(u,v,4,4,seed)-.5)*layer.warp
  const x=u*n+distortion,y=v*m+distortion
  const a=frac(x),b=frac(y)
  switch(layer.pattern){
    case 'noise':return noise(u+distortion/n,v+distortion/m,n,m,seed)
    case 'veins':return Math.exp(-13*Math.abs(Math.sin(Math.PI*(x+y+distortion*2))))
    case 'rings':return .5+.5*Math.cos(34*Math.hypot(a-.5,b-.5))
    case 'waves':return .5+.5*Math.sin(2*Math.PI*(y+.25*Math.sin(2*Math.PI*x)))
    case 'dots':return Math.max(0,1-3*Math.hypot(a-.5,b-.5))
    case 'blades':return Math.max(0,1-12*Math.abs(a-.25-b*.45))*(1-b)
    default:{
      const row=((Math.floor(y)%m)+m)%m
      const shifted=x+(row%2)*.5,c=frac(shifted)
      const edge=Math.min(c,1-c,b,1-b)
      const shade=hash(((Math.floor(shifted)%n)+n)%n,row,seed)
      return Math.min(1,edge*(layer.pattern==='bricks'?22:75))*(.55+.45*shade)
    }
  }
}
function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))}
// Score candidate palettes after the layers have blended. Palette shifts that
// cancel each other, or affect only a nearly invisible layer, score poorly.
function chooseVariation(source,style,seed){
  const samples=[]
  for(let y=0;y<12;y++)for(let x=0;x<12;x++){
    samples.push(source.layers.map((l,i)=>l.opacity*weight(l,(x+.5)/12,(y+.5)/12,i*48947+31)))
  }
  const palette=r=>[rgb(r.base),...r.layers.map(l=>rgb(l.color))]
  const original=palette(source)
  let best,bestScore=-1
  for(let i=0;i<24;i++){
    const candidate=recolorRecipe(source,style,seed+':'+i)
    const delta=palette(candidate).map((c,j)=>c.map((v,k)=>v-original[j][k]))
    let score=0
    for(const weights of samples){
      for(let channel=0;channel<3;channel++){
        let difference=delta[0][channel]
        for(let j=0;j<weights.length;j++)difference=mix(difference,delta[j+1][channel],weights[j])
        score+=Math.abs(difference)
      }
    }
    if(score>bestScore){best=candidate;bestScore=score}
  }
  return best
}
importScripts('palette.js')
self.onmessage=async({data})=>{
  const recipe=data.style?chooseVariation(data.recipe,data.style,data.seed):data
  const size=1024, canvas=new OffscreenCanvas(size,size),ctx=canvas.getContext('2d')
  const image=ctx.createImageData(size,size),base=rgb(recipe.base)
  const layers=recipe.layers.map(l=>({...l,rgb:rgb(l.color)}))
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    let [r,g,b]=base
    for(let i=0;i<layers.length;i++){
      const l=layers[i],a=l.opacity*weight(l,x/size,y/size,i*48947+31)
      r=mix(r,l.rgb[0],a);g=mix(g,l.rgb[1],a);b=mix(b,l.rgb[2],a)
    }
    const j=(y*size+x)*4
    image.data[j]=r;image.data[j+1]=g;image.data[j+2]=b;image.data[j+3]=255
  }
  ctx.putImageData(image,0,0)
  const blob=await canvas.convertToBlob({type:'image/png'})
  self.postMessage(data.style?{recipe,blob}:blob)
}
