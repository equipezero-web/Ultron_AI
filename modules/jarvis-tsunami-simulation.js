/**
 * Educational tsunami propagation illustration near Japan.
 * NOT an ocean hydrodynamics model, hazard map, forecast, or historical reconstruction.
 * The moving points are a synthetic front for understanding wave propagation.
 */
export const TSUNAMI_DEMO_ID="tsunami-japan";
export const TSUNAMI_DEMO_ORIGIN=Object.freeze({lat:38.1,lng:143.4});
const NOAA_URL="https://www.noaa.gov/education/resource-collections/ocean-coasts/tsunamis";
const RAD=Math.PI/180;
const source={
  name:"NOAA — Educação sobre tsunamis (referência conceitual)",
  url:NOAA_URL,
  basePeriod:"Cenário hipotético — sem data de evento",
  disclaimer:"SIMULAÇÃO DIDÁTICA, NÃO É PREVISÃO OU ALERTA. Origem, velocidade, área de propagação e trajetória são hipotéticas; sem batimetria, altura de onda, tempo de chegada ou inundação costeira calculados."
};
export function japanTsunamiIntent(command){
  const q=String(command||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/^(?:jarvis|ultron)[, :]+/,"").trim().replace(/\s+/g," ");
  if(q.length<12||q.length>500)return null;
  if(/^(?:como|porque|por que|o que|qual|quais|quando|se|e se|nao|nunca)\b/.test(q)||
     /\b(?:nao|nunca|sem|evite)\s+(?:simular?|simule|mostre|crie|gere|visualize)\b/.test(q))return null;
  if(!/\btsunamis?\b/.test(q)||!/\b(?:japao|japan|japones(?:a|as|es)?)\b/.test(q))return null;
  if(!/\b(?:simule|simula|simular|simulacao|crie|criar|gere|gerar|mostre|mostrar|mostra|exiba|exibir|visualize|visualizar|reproduza|reproduzir)\b/.test(q))return null;
  const view=/\b(?:2d|mapa plano|mapa bidimensional)\b/.test(q)?"2d":"3d";
  return {action:"geo.show",args:{scenario:TSUNAMI_DEMO_ID,view}};
}
function destination(origin,angleDeg,radiusDeg){
  const angular=radiusDeg*RAD,bearing=angleDeg*RAD,lat1=origin.lat*RAD,lon1=origin.lng*RAD;
  const lat2=Math.asin(Math.sin(lat1)*Math.cos(angular)+Math.cos(lat1)*Math.sin(angular)*Math.cos(bearing));
  const lon2=lon1+Math.atan2(Math.sin(bearing)*Math.sin(angular)*Math.cos(lat1),
    Math.cos(angular)-Math.sin(lat1)*Math.sin(lat2));
  const lng=((lon2/RAD+540)%360)-180;
  return {lat:Number((lat2/RAD).toFixed(5)),lng:Number(lng.toFixed(5))};
}
export function buildJapanTsunamiDemo(){
  const frames=Array.from({length:12},(_,stage)=>{
    const radiusDeg=0.45+stage*1.13;
    const points=[{
      id:"tsunami-source",name:"Origem hipotética — ao largo do Japão",
      lat:TSUNAMI_DEMO_ORIGIN.lat,lng:TSUNAMI_DEMO_ORIGIN.lng,kind:"tsunamiOrigin",
      color:"#f5b96b",source:NOAA_URL,
      detail:"Ponto fictício escolhido somente para ilustrar ondas que podem resultar do deslocamento súbito do fundo oceânico. Não representa um terremoto detectado."
    }];
    for(let i=0;i<16;i++){
      const angle=i*360/16,coords=destination(TSUNAMI_DEMO_ORIGIN,angle,radiusDeg);
      points.push({
        id:"tsunami-front-"+i,name:"Frente de onda hipotética — setor "+(i+1),
        ...coords,kind:"tsunamiWave",color:"#53c7f2",source:NOAA_URL,
        detail:"Onda ilustrativa: quadro "+(stage+1)+" de 12. Os pontos são um desenho geométrico, não medições, previsão de chegada ou extensão de inundação."
      });
    }
    return {
      id:"wave-"+stage,name:"Propagação · "+(stage+1)+"/12",
      type:"animação didática — sem escala de tempo físico",kind:"illustrative",
      description:"Ilustração geométrica de propagação a partir de uma origem hipotética. "+ 
        "As ondas reais mudam com a profundidade e o relevo submarino; nenhuma altura, velocidade, hora ou área costeira afetada está sendo calculada.",
      points
    };
  });
  return {
    id:TSUNAMI_DEMO_ID,title:"Tsunami hipotético — Japão",
    projection:"world",source,
    theme:{topic:"tsunami",unit:"sem escala",kind:"educational-wave",coloredBy:"illustrative-front",
      legend:[{color:"#f5b96b",label:"Origem hipotética"},{color:"#53c7f2",label:"Propagação ilustrativa (não risco)"}]},
    frames
  };
}
export const JAPAN_TSUNAMI_DEMO=buildJapanTsunamiDemo();
