import {weatherCity} from "../modules/jarvis-weather-model.js";
// Shared allowlist: only these typed actions can be executed by the autonomy engine.
export const ACTIONS={
 "text.set":"Exibir/ocultar textos do Neural Ring (enabled boolean)",
 "answer.close":"Fechar resposta",
 "earth.open":"Abrir globo",
 "earth.locate":"Localizar lugar no globo (place string)",
 "earth.close":"Voltar ao Neural Ring",
 "ring.reset":"Centralizar anel",
 "ring.zoom":"Aproximar/afastar anel (direction in/out)",
 "news.refresh":"Atualizar boletim e apresentar notícias",
 "devices.list":"Consultar dispositivos pareados",
 "files.list":"Listar arquivos autorizados",
 "system.status":"Consultar estado e módulos",
 "memory.health":"Consultar saúde da memória",
 "parity.check":"Verificar integração neural",
 "device.command":"Executar comando de dispositivo explicitamente pedido (command string; usa roteador existente)",
 "research":"Responder pergunta/pesquisar assunto (question string; usa core existente)",
 "geo.show":"Visualizar o dataset ENSO em 2D/3D (scenario='enso', view='2d' ou '3d')",
 "weather.show":"Buscar previsão numérica atual via Open-Meteo para cidade brasileira permitida e mostrar no mapa 2D ou globo 3D (city string, view 2d/3d)",
 "weather.global":"Buscar previsão mundial de 3, 7 ou 16 dias por cidade ou cidade/país e exibir no mapa 2D ou globo 3D (city string, view 2d/3d, days 3/7/16)",
 "geo.view2d":"Mudar visualização geográfica para mapa 2D",
 "geo.view3d":"Mudar visualização geográfica para globo 3D",
 "geo.play":"Reproduzir quadros didáticos sem confundir com previsão",
 "geo.pause":"Pausar animação",
 "geo.next":"Próximo quadro temporal",
 "geo.previous":"Quadro temporal anterior",
 "geo.filter":"Filtrar classe geográfica (kind: all, observed, dry, wet, heat)",
 "geo.close":"Ocultar a visualização geográfica"
};
export function validatePlan(value){
 if(!Array.isArray(value?.steps)||!value.steps.length||value.steps.length>6)return null;
 const steps=[];
 for(const item of value.steps){
  const action=item?.action,a=item?.args||{};
  if(!Object.hasOwn(ACTIONS,action)||typeof a!=="object"||Array.isArray(a))return null;
  let args={};
  if(action==="text.set"){if(typeof a.enabled!=="boolean")return null;args={enabled:a.enabled};}
  if(action==="geo.show"){
   if(a.scenario!=="enso"||!["2d","3d"].includes(a.view))return null;
   args={scenario:a.scenario,view:a.view};
  }
  if(action==="weather.show"){
   const city=weatherCity(a.city);
   if(!city||!["2d","3d"].includes(a.view))return null;
   args={city:city.key,view:a.view};
  }
  if(action==="weather.global"){
    const city=String(a.city||"").trim();
    if(typeof a.city!=="string"||city.length<2||city.length>96||
      !/^[\p{L}\p{M}\p{N} .,'’()-]+$/u.test(city)||!["2d","3d"].includes(a.view)||
      ![3,7,16].includes(Number(a.days??7)))return null;
    args={city,view:a.view,days:Number(a.days??7)};
  }
  if(action==="geo.filter"){
   if(!["all","observed","dry","wet","heat","weather"].includes(a.kind))return null;
   args={kind:a.kind};
  }
  if(action==="ring.zoom"){if(!["in","out"].includes(a.direction))return null;args={direction:a.direction};}
  if(["earth.locate","device.command","research"].includes(action)){
   const key=action==="earth.locate"?"place":action==="research"?"question":"command";
   if(typeof a[key]!=="string"||!a[key].trim()||a[key].length>500)return null;
   args={[key]:a[key].trim()};
  }
  steps.push({action,args});
 }
 return {steps};
}
export function parsePlanText(text){
 try{return validatePlan(JSON.parse(String(text||"").trim().replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,"")));}catch{return null;}
}
export function isActionRequest(text){
 const q=String(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/^(?:jarvis|ultron)[, :]+/,"").replace(/^(?:por favor[, ]+|(?:eu )?quero que voce\s+|pode\s+|consegue\s+)+/,"");
 if(/^(?:nao|nunca|se|e se|como|por que|porque|o que|qual|quais|quem|quando)\b/.test(q))return false;
 return /^(?:abra|abrir|feche|fechar|ative|ativar|desative|desativar|ligue|desligue|mostre|mostrar|oculte|esconda|retorne|volte|centralize|resete|aproxime|afaste|atualize|verifique|consulte|liste|localize|encontre|procure|pesquise|execute|reinicie|suspenda|organize|analise|investigue|deixe|ajuste|configure|mude|troque|faca|crie|gere|simule|visualize|destaque|marque|pinte|pause|reproduza|retome|avance)\b/.test(q);
}
