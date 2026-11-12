// Deterministic read-only commands for the existing worldwide intelligence Ring.
// Never interpret a normal question or a negated command as an action.
export function parseGlobalIntelligenceIntent(command){
 const q=String(command||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/^(?:jarvis|ultron)[, :!?]+/,"").trim().replace(/[.!?]+$/,"");
 if(q.length>350||/^(?:nao|nunca|como |por que|porque|e se |se |o que e |qual e )/.test(q))return null;
 const verb=/^(?:por favor )?(?:(?:me )?(?:mostre|mostra|mostrar|apresente|apresentar|abra|abrir|ative|ativar|exiba|exibir|resuma|relate|visualize|visualizar|informe)|quero ver|quero acompanhar|quero saber)\b/;
 if(!verb.test(q))return null;
 if(!/\b(?:inteligencia global|global intelligence|monitoramento mundial|monitoramento global|eventos mundiais|acontecimentos (?:no mundo|mundiais)|desastres (?:no mundo|mundiais|globais)|ocorrencias mundiais|panorama global|eventos (?:naturais|do planeta)|terremotos (?:no mundo|globais)|sismos mundiais)\b/.test(q))return null;
 const region=/\bbrasil\b/.test(q)&&!/\b(?:mundo|mundial|global|planeta)\b/.test(q)?"brazil":"world";
 const view=/\b(?:3d|globo)\b/.test(q)?"3d":/\b(?:2d|mapa)\b/.test(q)?"2d":"3d";
 const category=/\b(?:terremotos|sismos)\b/.test(q)?"earthquake":
  /\b(?:incendios|queimadas)\b/.test(q)?"wildfires":
  /\b(?:inundacoes|enchentes)\b/.test(q)?"floods":
  /\b(?:ciclones|tempestades|furacoes)\b/.test(q)?"severeStorms":"all";
 return {type:"global-intelligence",view,region,category};
}
