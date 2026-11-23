// Strict, read-only compound request. Never activate on questions, negations, or quotes.
export function parseSystemGlobalCommand(value){
 const q=String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().trim().replace(/^(?:jarvis|j\.a\.r\.v\.i\.s\.?|ultron)[, :!?\s]+/,"")
  .replace(/[.!?]+$/,"").trim();
 if(q.length>260||/^(?:nao|nunca|como |por que|porque|e se |se )/.test(q))return null;
 const pattern=/^(?:por favor[, ]+)?(?:apresente|apresentar|mostre|mostrar|exiba|exibir|informe|informar)\s+(?:o\s+)?(?:estado|status|diagnostico)\s+(?:dos?\s+)?sistemas?\s+e\s+(?:abra|abrir|mostre|mostrar|exiba|exibir)\s+(?:a\s+)?(?:inteligencia mundial|inteligencia global|global intelligence|monitoramento mundial|monitoramento global)\s+(?:no\s+)?(?:globo\s*3d|mapa\s*3d|globo)$/;
 if(!pattern.test(q))return null;
 return {type:"system-global-composite",view:"3d",region:"world",category:"all"};
}
