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
 "research":"Responder pergunta/pesquisar assunto (question string; usa core existente)"
};
export function validatePlan(value){
 if(!Array.isArray(value?.steps)||!value.steps.length||value.steps.length>6)return null;
 const steps=[];
 for(const item of value.steps){
  const action=item?.action,a=item?.args||{};
  if(!Object.hasOwn(ACTIONS,action)||typeof a!=="object"||Array.isArray(a))return null;
  let args={};
  if(action==="text.set"){if(typeof a.enabled!=="boolean")return null;args={enabled:a.enabled};}
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
 return /^(?:abra|abrir|feche|fechar|ative|ativar|desative|desativar|ligue|desligue|mostre|mostrar|oculte|esconda|retorne|volte|centralize|resete|aproxime|afaste|atualize|verifique|consulte|liste|localize|encontre|procure|pesquise|execute|reinicie|suspenda|organize|analise|investigue|deixe|ajuste|configure|mude|troque|faca)\b/.test(q);
}
