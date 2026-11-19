import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseDirectorIntent,parseRegionalNewsVisualIntent,parseBriefingIntent,parsePublicCameraAudioIntent,
 parseCommunicationNotificationIntent,parseNewsVisualCloseIntent,parseMobilePairingIntent} from "../modules/jarvis-communication-intents.js";
import {buildRegionalNewsVisual} from "../modules/jarvis-regional-news-visual.js";
import {isExplicitSleepCommand} from "../modules/voice-runtime-policy.js";
import {parseWorldCameraCommand} from "../modules/jarvis-public-world-cameras-model.js";
import {parseLocalCommand} from "../modules/jarvis-local-commands.js";
const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
// Public streams must never activate the user's local optical sensor.
for(const phrase of ["Jarvis, mostre uma câmera pública de Jerusalém", "mostre câmera pública de Jerusalém", "abra uma webcam pública de Recife", "mostre uma câmera ao vivo de Jerusalém"]){
 const intent=parseWorldCameraCommand(phrase);
 assert.deepEqual(intent,{type:"search",term:phrase.includes("Recife")?"recife":"jerusalem"},phrase);
}
for(const phrase of ["Jarvis, abra minha câmera do notebook","mostre uma câmera pública do meu celular","como mostrar uma câmera pública de Jerusalém"])
 assert.equal(parseWorldCameraCommand(phrase),null,phrase);

const cases=[
 [parseDirectorIntent,"Jarvis, feche o diretor visual",{type:"close"}],
 [parseNewsVisualCloseIntent,"Jarvis, feche as notícias e imagens",{type:"news"}],
 [parseNewsVisualCloseIntent,"feche os vídeos",{type:"videos"}],
 [parseNewsVisualCloseIntent,"oculte as imagens",{type:"images"}],
 [parseDirectorIntent,"Jarvis, próxima cena",{type:"next"}],
 [parseDirectorIntent,"Volte para a cena anterior",{type:"previous"}],
 [parseDirectorIntent,"Jarvis, mostre as notícias e imagens no Neural Ring",{type:"scene",scene:"news"}],
 [parseBriefingIntent,"Jarvis, abra o boletim de notícias",{type:"open"}],
 [parseBriefingIntent,"Feche o painel de notícias",{type:"close"}],
 [parseBriefingIntent,"Atualize o boletim mundial",{type:"refresh"}],
 [parsePublicCameraAudioIntent,"Jarvis, ative o áudio das câmeras mundiais",{enabled:true}],
 [parsePublicCameraAudioIntent,"Desative o som das webcams mundiais",{enabled:false}],
 [parseCommunicationNotificationIntent,"Ative as notificações do Jarvis",{type:"enable"}],
 [parseCommunicationNotificationIntent,"Desative os alertas de notícias",{type:"disable"}]
];
for(const [parser,input,expected]of cases)assert.deepEqual(parser(input),expected,input);
for(const phrase of [
 "Não feche o diretor visual","Como fechar o diretor visual?",
 "Não ative o áudio das câmeras mundiais","Se eu desativar as notificações do Jarvis",
 "Não feche o boletim de notícias","Não feche as notícias e imagens"
])for(const parse of [parseDirectorIntent,parseBriefingIntent,
 parsePublicCameraAudioIntent,parseCommunicationNotificationIntent,parseNewsVisualCloseIntent])
 assert.equal(parse(phrase),null,phrase);
assert.deepEqual(parseWorldCameraCommand("Jarvis, as câmeras mundiais estão abertas, feche as câmeras mundiais"),{type:"close"});
assert.equal(parseWorldCameraCommand("não feche as câmeras mundiais"),null);
assert.equal(parseWorldCameraCommand("feche a câmera do meu celular"),null);
assert.equal(parseLocalCommand("a previsão do tempo está aberta, feche a previsão do tempo")?.type,"meteorological-close");
for(const phrase of ["Jarvis, durma","dormir","Ultron, pare de responder"])
 assert.equal(isExplicitSleepCommand(phrase),true,phrase);
for(const phrase of ["Não pare de responder","Como encerrar conversa?","se eu disser dormir",
 "ainda não quero dormir","eu não quero que você pare de responder"])
 assert.equal(isExplicitSleepCommand(phrase),false,phrase);
for(const phrase of ["Jarvis, conecte meu celular pelo Mobile Link", "parear celular", "Jarvis, vincule meu Android ao Bridge"])
 assert.deepEqual(parseMobilePairingIntent(phrase),{type:"open"},phrase);
for(const phrase of ["Não conecte meu celular", "Como conectar meu celular?", "Se eu parear celular"])
 assert.equal(parseMobilePairingIntent(phrase),null,phrase);
const orchestrator=file("modules/ultron-orchestrator-v4270.js");
assert.ok(orchestrator.includes("parseMobilePairingIntent(message)"));
assert.ok(orchestrator.includes('status:"pairing-requested",paired:false'));

for(const fn of ["parseDirectorIntent","parseBriefingIntent","parsePublicCameraAudioIntent",
 "parseCommunicationNotificationIntent","parseNewsVisualCloseIntent"])
 assert.ok(orchestrator.includes(fn+"(message)"),fn+" must route before generic AI");
const index=file("index.html");
assert.match(index,/jarvis-communication-notifications\.js\?v=5\.53\.0/);
const briefing=file("modules/ultron-intelligence-briefing.js");
assert.match(briefing,/open:openBriefing,close:hideBriefing/);
assert.match(briefing,/verifiedNewStories/);
assert.match(briefing,/freshCutoff/);
const cameras=file("modules/jarvis-public-world-cameras.js");
assert.match(cameras,/setAudio,/);
assert.match(cameras,/audioVerified:false/);
const news=file("modules/ultron-neural-answer.js");
assert.match(news,/autoplay=1&mute=1/);
assert.match(news,/Abrir notícia na fonte/);
assert.match(news,/clearMedia/);
assert.match(news,/currentMode/);
const notification=file("modules/jarvis-communication-notifications.js");
assert.match(notification,/requestPermission\(\)/);
assert.match(notification,/if\(!userGesture\)/);
assert.match(notification,/backgroundPush:false/);
assert.match(notification,/document\.hidden/);
const sw=file("jarvis-notification-sw.js");
assert.match(sw,/addEventListener\("notificationclick"/);
assert.match(sw,/addEventListener\("push"/);
assert.doesNotMatch(sw,/addEventListener\("fetch"/,"Do not hijack other app requests");
const voice=file("modules/voice-listener-v4290.js");
assert.match(voice,/isExplicitSleepCommand\(text\)/);
assert.match(voice,/recognitionSupported:Boolean\(SpeechRecognition\)/);
const css=file("modules/jarvis-command-center-v4330.css");
assert.match(css,/ultron-tv-display \.jarvis-intel-controls button/);
assert.match(css,/min-height:56px/);
assert.match(css,/@media\(max-width:420px\)/);
const answerCss=file("modules/ultron-neural-answer.css");
assert.match(answerCss,/\.jarvis-intel-panel\[hidden\]\{display:none!important\}/);
assert.match(answerCss,/\.jarvis-intel-heading button/);
const worker=file("backend/worker.js");
assert.match(worker,/checkPushSubscription\(env,auth.accountId,body.endpoint\)/);
assert.match(worker,/pollOfficialPush\(env\)/);
const pushClient=file("modules/jarvis-communication-push-client.js");
assert.match(pushClient,/action:"status",endpoint:subscription.endpoint/);

// Real operator log regression: visual news must not be geocoded, and
// "volte a cena anterior" / voice-truncated "anterio" must not reach AI.
for(const phrase of [
 "volte a cena anterior","Volte para a cena anterio",
 "Jarvis, volte para a cena anterior","retorne a cena anterior"
])assert.deepEqual(parseDirectorIntent(phrase),{type:"previous"},phrase);
for(const phrase of [
 "Jarvis, mostre as notícias do brasil e imagens no Neural Ring.",
 "Jarvis, mostre as notícias mais recentes do Brasil com imagens no Neural Ring.",
 "Jarvis, mostre as principais notícias do Brasil com imagens no Neural Ring.",
 "mostre notícias do Brasil com imagens no Neural Ring",
 "mostre as notícias brasileiras no neural ring"
])assert.deepEqual(parseRegionalNewsVisualIntent(phrase),{type:"show",region:"brasil"},phrase);
assert.deepEqual(parseRegionalNewsVisualIntent("mostre as notícias do mundo e imagens no Neural Ring"),
 {type:"show",region:"mundo"});
assert.deepEqual(parseRegionalNewsVisualIntent("Jarvis, mostre as notícias e imagens no Neural Ring"),
 {type:"show",region:"all"});
for(const phrase of ["Não mostre notícias do Brasil","Como mostrar notícias do Brasil?",
 "Se eu mostrar notícias do Brasil","mostre a China no globo",
 "não volte a cena anterior"]){
 assert.equal(parseRegionalNewsVisualIntent(phrase),null,phrase);
}
assert.equal(parseDirectorIntent("não volte a cena anterior"),null);
const now=Date.UTC(2026,10,18,14,0,0);
const at=offset=>new Date(now-offset).toISOString();
const data={briefing:{ok:true,fetchedAt:at(20*60000),topics:[
 {id:"brasil",label:"Brasil",articles:[
  {title:"Manchete brasileira",url:"https://agenciabrasil.ebc.com.br/noticias/teste",
   imageUrl:"https://agenciabrasil.ebc.com.br/imagens/teste.jpg",
   source:"Agência Brasil",publishedAt:at(40*60000)},
  {title:"Duplicada",url:"https://agenciabrasil.ebc.com.br/noticias/teste?utm=1",
   publishedAt:at(20*60000)},
  {title:"Muito antiga",url:"https://example.org/old",publishedAt:at(25*60*60000)},
  {title:"Sem fonte segura",url:"http://example.org/insecure",publishedAt:at(20*60000)}
 ]},
 {id:"santa-catarina",label:"Santa Catarina",articles:[
  {title:"Defesa Civil de SC",url:"https://www.defesacivil.sc.gov.br/aviso",
   imageUrl:"http://example.org/insecure-image.jpg",
   publishedAt:at(30*60000)}
 ]},
 {id:"mundo",label:"Mundo",articles:[
  {title:"Notícia internacional",url:"https://www.bbc.com/news/example",
   publishedAt:at(30*60000)}
 ]}
]}};
const brazil=buildRegionalNewsVisual(data,{region:"brasil",now});
assert.equal(brazil.ok,true);
assert.equal(brazil.count,2,"Only two distinct, fresh Brazil/SC source articles");
assert.equal(brazil.imageCount,1,"Never invent images missing from verified sources");
assert.equal(brazil.visual.mode,"news");
assert.equal(brazil.visual.cards[0].title,"Manchete brasileira");
assert.equal(brazil.visual.cards[0].imageUrl,"https://agenciabrasil.ebc.com.br/imagens/teste.jpg");
assert.equal(brazil.visual.cards[1].imageUrl,undefined);
const combined=buildRegionalNewsVisual(data,{region:"all",now});
assert.equal(combined.count,3,"General news must include Brazil and world, without invented media");
const world=buildRegionalNewsVisual(data,{region:"mundo",now});
assert.equal(world.count,1);
assert.equal(world.visual.cards[0].title,"Notícia internacional");
assert.equal(buildRegionalNewsVisual(data,{region:"brasil",now:now+3*60*60000}).ok,false,
 "Stale briefing cannot be shown as current");
const orchestratorNew=file("modules/ultron-orchestrator-v4270.js");
assert.ok(orchestratorNew.indexOf("const regionalNewsIntent=parseRegionalNewsVisualIntent(message)")<
 orchestratorNew.indexOf("const directorIntent=parseDirectorIntent(message)"),
 "Regional news must route before generic director/Earth/AI");
assert.match(orchestratorNew,/if\(\/\\b\(\?:noticias\?\|manchetes\?/,
 "Earth place parser must reject media/news commands");
assert.match(file("index.html"),/ultron-orchestrator-v4270\.js\?v=5\.66\.0/);

console.log("JARVIS COMMUNICATION 7 PASS: command safety, voice, visual, news, camera audio and consented notifications");
