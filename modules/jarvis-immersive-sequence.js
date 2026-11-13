import {contextualMapCandidates} from "./jarvis-contextual-geo.js";

// A visual journey through sourced coordinates, not a simulated disaster.
// This module is DOM-free and never fetches sources or acts on devices.
const TOPICS=Object.freeze({
  earthquake:{name:"Sismo",explanation:"Registro geográfico publicado de atividade sísmica. A posição exibida não indica, por si só, intensidade percebida, danos ou risco futuro."},
  wildfires:{name:"Incêndio",explanation:"Ocorrência catalogada pela fonte. O ponto não delimita a área queimada, o avanço do fogo ou um perigo previsto."},
  volcanoes:{name:"Vulcão",explanation:"Registro de atividade vulcânica divulgado pela fonte. A coordenada não descreve extensão, intensidade ou evolução futura."},
  severeStorms:{name:"Tempestade",explanation:"Evento meteorológico catalogado. A posição não equivale a radar, previsão de trajetória ou alerta oficial para moradores."},
  floods:{name:"Inundação",explanation:"Evento hidrológico catalogado. O marcador não indica limites da inundação nem regiões que podem ser afetadas."},
  landslides:{name:"Deslizamento",explanation:"Evento catalogado de movimentação de encosta. O ponto não determina extensão nem probabilidade de novos eventos."}
});
const clean=(v,limit=160)=>String(v??"").replace(/[<>\r\n]/g," ").replace(/\s+/g," ").trim().slice(0,limit);
const stamp=v=>{const t=Date.parse(String(v??""));return Number.isFinite(t)?t:null;};
export function buildImmersiveSequence(digest,{now=Date.now()}={}){
  const points=contextualMapCandidates(digest,{now});
  if(!points.length)return {ok:false,reason:"NO_VERIFIED_GEO_EVENTS",items:[],count:0};
  const items=points.map((point,index)=>{
    const topic=TOPICS[point.kind];
    const published=stamp(point.observedAt);
    if(!topic||published===null)return null;
    return {
      key:point.id,index,
      title:clean(point.name,100),
      type:point.kind,category:topic.name,
      sourceName:new URL(point.source).hostname.toUpperCase(),
      sourceUrl:point.source,publishedAt:new Date(published).toISOString(),
      lat:point.lat,lng:point.lng,
      representative:point.representative===true,
      locationNote:point.representative
        ?"Coordenada representativa fornecida para este registro. Não é o contorno da área afetada."
        :"Coordenada publicada pela fonte para este registro. Não representa a extensão do acontecimento.",
      explanation:topic.explanation,
      disclaimer:"Registro verificado com fonte e horário. A visualização não é previsão, simulação de intensidade nem aviso de risco local."
    };
  }).filter(Boolean);
  return items.length?{
    ok:true,version:"1.0",source:"prioridades-georreferenciadas",
    checkedAt:clean(digest.generatedAt,36),count:items.length,items,
    disclaimer:"Exploração editorial por eventos de origem verificada. A navegação e o movimento da câmera são apenas apresentação, não movimento real dos acontecimentos."
  }:{ok:false,reason:"NO_VERIFIED_GEO_EVENTS",items:[],count:0};
}
export function createImmersiveNavigator(sequence,{mode="2d"}={}){
  if(!sequence?.ok||!Array.isArray(sequence.items)||!sequence.items.length)
    throw new Error("Verified sequence required");
  const keys=new Set(sequence.items.map(item=>item.key));
  if(keys.size!==sequence.items.length)throw new Error("Duplicate event keys");
  let index=0,view=mode==="3d"?"3d":"2d";
  const snapshot=()=>({
    ok:true,view,index,count:sequence.items.length,
    current:{...sequence.items[index]},
    hasPrevious:index>0,hasNext:index<sequence.items.length-1
  });
  const choose=key=>{
    const next=sequence.items.findIndex(item=>item.key===key);
    if(next<0)return {ok:false,reason:"ITEM_NOT_IN_VERIFIED_SEQUENCE"};
    index=next;return snapshot();
  };
  const step=delta=>{
    if(!Number.isInteger(delta)||Math.abs(delta)!==1)
      return {ok:false,reason:"INVALID_DIRECTION"};
    const next=index+delta;
    if(next<0||next>=sequence.items.length)
      return {ok:false,reason:"END_OF_SEQUENCE",...snapshot()};
    index=next;return snapshot();
  };
  const setMode=next=>{
    if(next!=="2d"&&next!=="3d")return {ok:false,reason:"UNSUPPORTED_VISUAL_MODE"};
    view=next;return snapshot();
  };
  return {snapshot,choose,step,setMode};
}
