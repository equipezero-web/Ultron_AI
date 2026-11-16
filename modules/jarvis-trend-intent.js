// Read-only, deterministic commands; never search private user data.
const normalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/^(?:(?:oi|ei|hey|ola) )?(?:jarvis|ultron)[, :!? ]+/,"")
 .replace(/\s+/g," ").trim().replace(/[.!?]+$/,"");
const groups=[
 ["moda",/\b(moda|roupas?|estilo|vestuario|fashion)\b/],
 ["beleza",/\b(beleza|maquiagem|cosmeticos|skincare)\b/],
 ["tecnologia",/\b(tecnologia|inteligencia artificial|ia |inteligencia de maquina|celulares?|smartphones?)\b/],
 ["economia",/\b(economia|inflacao|juros|emprego)\b/],
 ["negocios",/\b(negocios|empreendedorismo|comercio|vendas|varejo)\b/],
 ["politica",/\b(politica|governo|congresso)\b/],
 ["ciencia",/\b(ciencia|descobertas cientificas|pesquisa cientifica)\b/],
 ["saude",/\b(saude|medicina|medicamentos)\b/],
 ["clima",/\b(clima|tempo meteorologico|meio ambiente|aquecimento global)\b/],
 ["alimentacao",/\b(comida|alimentacao|gastronomia|restaurantes?)\b/],
 ["entretenimento",/\b(filmes?|series|cinema|streaming|novelas?)\b/],
 ["musica",/\b(musica|cantores?|artistas musicais|shows?)\b/],
 ["esportes",/\b(esportes?|futebol|basquete|voleibol)\b/],
 ["games",/\b(games?|jogos digitais|videogames?|esports)\b/],
 ["educacao",/\b(educacao|enem|faculdades?|universidades?)\b/],
 ["turismo",/\b(turismo|viagens?|destinos de viagem)\b/],
 ["seguranca-digital",/\b(ciberseguranca|seguranca digital|hackers|golpes digitais)\b/],
 ["redes-sociais",/\b(redes sociais|instagram|tiktok|influenciadores?)\b/],
 ["cultura",/\b(cultura|comportamento|sociedade)\b/],
 ["mobilidade",/\b(carros?|motos?|automoveis|mobilidade|veiculos?)\b/]
];
export function parseTrendIntent(value){
 const q=normalize(value);
 if(!q||q.length>350||/^(?:nao|nunca|jamais|se |e se |como |por que|porque)\b/.test(q))return null;
 if(/^(?:feche|fechar|oculte|ocultar|encerre|encerrar)\s+(?:o painel de |as? )?(?:tendencias|trends|assuntos em alta)(?:\s+(?:do|no) jarvis)?$/.test(q))
  return {type:"trend-intelligence-close"};
 const intro=/^(?:(?:por favor )?(?:me )?(?:mostre|mostrar|mostra|exiba|exibir|abra|abrir|resuma|resumir|apresente|apresentar|informe|informar|atualize|atualizar|analise|analisar)|quero (?:ver|saber|acompanhar)|(?:quais|qual) (?:sao |e )?(?:as |a |os |o )?|o que (?:esta|ta) (?:em alta|bombando)|o que esta acontecendo com)\b/;
 const subject=/\b(tendencias?|trends|modas?|assuntos? em alta|em alta|assuntos? do dia|buscas? em alta|viralizando|bombando|popularidade)\b/;
 if(!intro.test(q)||!subject.test(q))return null;
 const region=/\b(brasil|brasileir[ao]s?|recife|pernambuco)\b/.test(q)?"br":
  /\b(mundo|mundial|globais?|internacional|exterior)\b/.test(q)?"world":"all";
 const focus=groups.find(([,regex])=>regex.test(q));
 const category=focus?.[0]||(/\b(buscas?|google trends|pesquisas? em alta)\b/.test(q)?"pesquisas":"all");
 // Broad "modas e tendências em todas as áreas" is a request for all topics,
 // not exclusively the fashion sector.
 return {type:"trend-intelligence",region,category:
  /\b(todos os assuntos|todas as areas|todos os setores|sobre tudo|de tudo)\b/.test(q)?"all":category,
  refresh:/\b(atualize|atualizar|hoje|agora|ultimas|novas)\b/.test(q)};
}
