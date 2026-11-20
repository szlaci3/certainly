function toneChannel(value,style){
  return Math.round(style==='Darker'?value*.70:value+(255-value)*.30)
}
// Each palette entry gets its own seeded stream, independent of layer order.
function recolorRecipe(source,style,seed){
  const range={Joker:20,Harlequin:40,Carnival:60}[style]
  const colors=new Map()
  function shift(input){
    const hex=input.toLowerCase()
    if(colors.has(hex))return colors.get(hex)
    let state=2166136261
    for(const ch of style+':'+seed+':'+hex)state=Math.imul(state^ch.charCodeAt(0),16777619)
    let output='#'
    for(const offset of [1,3,5]){
      state=(Math.imul(state,1664525)+1013904223)>>>0
      const delta=Math.floor(state/4294967296*(2*range+1))-range
      const channel=parseInt(hex.slice(offset,offset+2),16)+delta
      const value=style==='Darker'||style==='Lighter'
        ?toneChannel(parseInt(hex.slice(offset,offset+2),16),style)
        :Math.max(0,Math.min(255,channel))
      output+=value.toString(16).padStart(2,'0')
    }
    output+=hex.slice(7)
    colors.set(hex,output)
    return output
  }
  return {...source,name:source.name+' · '+style,base:shift(source.base),
    layers:source.layers.map(layer=>({...layer,color:shift(layer.color)}))}
}
