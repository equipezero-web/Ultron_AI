import {buildVisualStoryboard} from "./jarvis-visual-orchestration-model.js";
import {buildImmersiveSequence} from "./jarvis-immersive-sequence.js";

// Phase XIII: strictly local multimodal references to already verified
// records. No arbitrary speech-to-code, AI-generated coordinates or URLs.
const clean=(v,n=180)=>String(v??"").replace(/[<>\r\n]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const time=v=>{const x=Date.parse(String(v??""));return Number.isFinite(x)?x:null;};
function https(value){
 try{
  const u=new URL(String(value??""));
  if(u.protocol!=="https:"||u.username||u.password||u.port||
    /^(?:localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|\[)/i.test(u.hostname))return null;
  return u.href;
 }catch{return null;}
}
const normalized=raw=>clean(raw,320).normalize("NFD")
 .replace(/[\u0300-\u036f]/g,"").toLowerCase()
 .replace(/^(?:jarvis|ultron)[ ,:.-]+/,"").replace(/[.!?]+$/,"").trim();

export function parseMultimodalCommand(raw){
 const command=normalized(raw);
 if(!command)return null;
 if(/^(?:o que (?:estou|estamos) vendo|o que e isso|explique (?:isso|essa cena|esta cena|o evento|este evento|essa noticia|esta noticia|a imagem)|resuma (?:isso|esta cena|esse evento)|detalhes (?:dessa cena|desse evento|desta noticia))$/.test(command))
  return {type:"explain"};
 if(/^(?:qual (?:e )?a fonte(?: disso| deste evento| dessa noticia| da imagem)?|mostre (?:a fonte|a origem)(?: disso| deste evento| dessa noticia| desta imagem)?|de onde (?:veio|vem) (?:isso|essa noticia|esta imagem))$/.test(command))
  return {type:"source"};
 if(/^(?:mostre|mostrar|exiba|exibir|abra|abrir) (?:a )?(?:imagem|foto) (?:dessa|desta|da) noticia$/.test(command))
  return {type:"image"};
 if(/^(?:mostre|mostrar|passe|passar|mude|mudar|coloque|colocar) (?:isso|este evento|esse evento|esta cena) (?:no |em |para (?:o )?)(?:mapa )?2d$/.test(command)||
   /^(?:volte|voltar) (?:ao |para o )?mapa(?: 2d)?$/.test(command))
  return {type:"visualize",view:"2d"};
 if(/^(?:mostre|mostrar|passe|passar|mude|mudar|coloque|colocar) (?:isso|este evento|esse evento|esta cena) (?:no |em |para (?:o )?)(?:globo )?3d$/.test(command)||
   /^(?:leve|levar) (?:isso|este evento|esse evento) (?:ao |para o )?globo(?: 3d)?$/.test(command))
  return {type:"visualize",view:"3d"};
 if(/^(?:proximo item|proximo destaque|proximo da tela|item seguinte)$/.test(command))
  return {type:"navigate",direction:1};
 if(/^(?:item anterior|destaque anterior|anterior da tela)$/.test(command))
  return {type:"navigate",direction:-1};
 if(/^(?:volte|voltar|retorne|retornar) (?:a |para a |para |as |para as )?noticias(?: e imagens)?$/.test(command))
  return {type:"scene",scene:"news"};
 if(/^(?:status|estado|diagnostico) (?:da |do )?(?:orquestracao multimodal|controle contextual|contexto visual)$/.test(command))
  return {type:"status"};
 return null;
}

export function resolveMultimodalContext({
 digest=null,news=null,director=null,immersive=null,now=Date.now()
}={}){
 if(!Number.isFinite(now))return {ok:false,reason:"INVALID_CLOCK"};
 const plan=buildVisualStoryboard({digest,news:news?.state||null,now});
 const directorActive=director?.active===true;
 const scene=directorActive?director.scene:null;
 const currentImmersive=immersive?.active===true?immersive.current:null;
 const candidates=buildImmersiveSequence(digest,{now});
 const geo=candidates.ok?candidates.items:[];
 // Director selection is authoritative. Do not borrow a stale news card or
 // map marker from an unrelated, hidden panel.
 if((scene==="tour"||scene==="map")||(!directorActive&&currentImmersive)){
  const key=scene==="map"?director?.focusKey||null:
   scene==="tour"?(currentImmersive?.key||director?.focusKey||null):
   currentImmersive?.key||null;
  const found=geo.find(x=>x.key===key);
  if(!found)return {ok:false,reason:"UNVERIFIED_CURRENT_EVENT",scene};
  return {
   ok:true,scene:scene||"tour",type:"cataloged",eventKey:found.key,
   title:clean(found.title),source:clean(found.sourceName),
   url:found.sourceUrl,publishedAt:found.publishedAt,
   imageUrl:null,hasImage:false,
   description:found.explanation+" "+found.locationNote,
   evidence:"Coordenada "+found.lat.toFixed(3)+"°, "+found.lng.toFixed(3)+
    "°; registro da fonte, não previsão de impacto."
  };
 }
 if(scene==="priorities"){
  const current=plan.scenes.find(x=>x.id==="priorities");
  const priority=current?.entries?.find(x=>x.id===director?.selectedPriorityKey);
  if(!priority)return {ok:false,reason:"NO_SELECTED_VERIFIED_PRIORITY",scene};
  const url=https(priority.url),date=time(priority.publishedAt);
  if(!url||date===null)return {ok:false,reason:"INVALID_SOURCE",scene};
  const found=geo.find(x=>x.key===priority.id);
  return {
   ok:true,scene,type:priority.type,
   eventKey:found?.key||null,
   title:clean(priority.title),source:clean(priority.source),
   url,publishedAt:priority.publishedAt,
   imageUrl:null,hasImage:false,
   description:priority.type==="official-alert"?
    "Aviso publicado pela fonte oficial. Confirme horário, vigência e área no documento original; não é previsão personalizada.":
    priority.type==="news"?
    "Manchete publicada e selecionada na lista de prioridades. A notícia não fornece, por si só, coordenadas de impacto.":
    found?found.explanation+" "+found.locationNote:
    "Registro catalogado pela fonte. Não há coordenada verificada disponível para este destaque.",
   evidence:found?"Evento com coordenada verificada na fonte.":"Sem localização individual confirmada."
  };
 }
 if(scene==="news"||(!directorActive&&(news?.requested===true||news?.state?.requested===true))){
  const a=news?.selectedArticle;
  const url=https(a?.url),published=time(a?.publishedAt),archive=time(news?.state?.lastUpdate);
  if(!url||!news?.state?.verified||archive===null||
    archive>now+300000||now-archive>2*3600_000||published===null||
    published>now+300000||now-published>24*3600_000)
   return {ok:false,reason:"NEWS_NOT_CURRENTLY_VERIFIED",scene:"news"};
  const imageUrl=https(a?.imageUrl);
  return {
   ok:true,scene:"news",type:"news",eventKey:null,
   title:clean(a.title),source:clean(a.source),url,publishedAt:a.publishedAt,
   imageUrl,hasImage:Boolean(imageUrl),
   description:"Manchete publicada pela fonte; o registro não contém uma simulação geográfica confirmada."+
    (imageUrl?" Imagem atribuída à publicação original.":" Nenhuma imagem atual da fonte foi fornecida."),
   evidence:"Notícia do monitor de 24 horas; não é um aviso oficial de risco."
  };
 }
 return {ok:false,reason:"NO_ACTIVE_VISUAL_CONTEXT",scene:null};
}
