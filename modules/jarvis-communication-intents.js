// Deterministic communication UI commands. Never geocode, search or run devices.
export function normalizeCommunication(value){
 return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
  .trim().replace(/^(?:(?:ei|ola|hey)\s+)?(?:jarvis|j\.a\.r\.v\.i\.s|ultron)[,.:!?\s]+/,"")
  .replace(/^(?:por favor[, ]+|me ajuda a\s+)+/,"")
  .replace(/[.!?]+$/,"").replace(/\s+/g," ").trim();
}
function safe(value){
 const q=normalizeCommunication(value);
 return /^(?:nao|nunca|se\b|e se\b|como\b|por que\b|porque\b|o que\b|qual\b|quais\b)/.test(q)?null:q;
}
export function parseDirectorIntent(value){
 const q=safe(value);if(!q)return null;
 const target="(?:diretor visual|orquestracao visual|apresentacao visual|roteiro visual)";
 if(new RegExp("^(?:abrir|abra|iniciar|inicie|mostrar|mostre|ative|ativar) (?:a |o )?"+target+"$").test(q)||new RegExp("^"+target+"$").test(q))return {type:"open"};
 if(new RegExp("^(?:fechar|feche|encerrar|encerre|parar|pare|cancelar|cancele|ocultar|oculte) (?:a |o )?"+target+"$").test(q))return {type:"close"};
 if(new RegExp("^(?:status|estado|diagnostico) (?:do |da )?"+target+"$").test(q))return {type:"status"};
 if(/^(?:proxima cena|avancar cena|cena seguinte|avance para a proxima cena|mostre a proxima cena)$/.test(q))return {type:"next"};
 if(/^(?:cena anterior|voltar cena|(?:volte|volta|voltar|retorne|retornar) (?:para )?(?:a )?cena anterio(?:r)?|mostre a cena anterior)$/.test(q))return {type:"previous"};
 const scene=q.match(/^(?:mostre|mostrar|abrir|abra|exibir|exiba) (?:as |os |o )?(noticias e imagens|noticias visuais|fontes verificadas|prioridades visuais|mapa contextual 2d|globo contextual 3d)(?: no neural ring)?$/);
 if(scene)return {type:"scene",scene:/noticias/.test(scene[1])?"news":/fontes|prioridades/.test(scene[1])?"priorities":/mapa/.test(scene[1])?"map":"tour"};
 return null;
}
// Regional news requests are visual commands, not geographic place searches.
// Only explicit display verbs are accepted; negations and questions are inert.
export function parseRegionalNewsVisualIntent(value){
 const q=safe(value);if(!q)return null;
 const match=q.match(/^(?:mostre|mostrar|exiba|exibir|abra|abrir) (?:as )?(?:noticias|manchetes) (?:do brasil|brasileiras|do mundo|mundiais)(?: (?:e|com) imagens)?(?: no neural ring)?$/);
 if(!match)return null;
 return {type:"show",region:/\b(?:brasil|brasileiras)\b/.test(q)?"brasil":"mundo"};
}

export function parseBriefingIntent(value){
 const q=safe(value);if(!q)return null;
 const target="(?:boletim(?: de inteligencia| de noticias| mundial| do mundo)?|painel de noticias|resumo de inteligencia)";
 if(new RegExp("^(?:abrir|abra|mostrar|mostre|exibir|exiba) (?:o )?"+target+"$").test(q))return {type:"open"};
 if(new RegExp("^(?:fechar|feche|ocultar|oculte|encerrar|encerre) (?:o )?"+target+"$").test(q))return {type:"close"};
 if(new RegExp("^(?:atualizar|atualize|recarregar|recarregue) (?:o )?"+target+"$").test(q))return {type:"refresh"};
 if(new RegExp("^(?:status|estado) (?:do )?"+target+"$").test(q))return {type:"status"};
 return null;
}
export function parsePublicCameraAudioIntent(value){
 const q=safe(value);if(!q)return null;
 if(/^(?:ativar|ative|ligar|ligue|habilitar|habilite) (?:o )?(?:audio|som) (?:das |de |nos? )(?:cameras(?: mundiais| do mundo| publicas)?|webcams(?: mundiais)?)(?: agora)?$/.test(q))return {enabled:true};
 if(/^(?:desativar|desative|desligar|desligue|silenciar|silencie) (?:o )?(?:audio|som) (?:das |de |nos? )(?:cameras(?: mundiais| do mundo| publicas)?|webcams(?: mundiais)?)(?: agora)?$/.test(q))return {enabled:false};
 return null;
}
export function parseCommunicationNotificationIntent(value){
 const q=safe(value);if(!q)return null;
 const target="(?:notificacoes|alertas) (?:de |do |das )?(?:noticias|inteligencia|jarvis|avisos oficiais)";
 if(new RegExp("^(?:ativar|ative|habilitar|habilite|ligar|ligue) (?:as |os )?"+target+"$").test(q))return {type:"enable"};
 if(new RegExp("^(?:desativar|desative|desligar|desligue|silenciar|silencie) (?:as |os )?"+target+"$").test(q))return {type:"disable"};
 if(new RegExp("^(?:status|estado) (?:das |dos )?"+target+"$").test(q))return {type:"status"};
 return null;
}

export function parseNewsVisualCloseIntent(value){
 const q=safe(value);if(!q)return null;
 if(/^(?:fechar|feche|ocultar|oculte|encerrar|encerre) (?:as |os |a |o )?(?:noticias e imagens|noticias visuais|painel de noticias visuais|resposta de noticias)$/.test(q))
  return {type:"news"};
 if(/^(?:fechar|feche|ocultar|oculte|parar|pare) (?:os |o )?(?:videos|video|reprodutor de video|player de video)(?: do neural ring)?$/.test(q))
  return {type:"videos"};
 if(/^(?:fechar|feche|ocultar|oculte) (?:as |a )?(?:imagens|galeria de imagens)(?: do neural ring)?$/.test(q))
  return {type:"images"};
 return null;
}
