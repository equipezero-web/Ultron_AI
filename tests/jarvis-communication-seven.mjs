import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseDirectorIntent,parseBriefingIntent,parsePublicCameraAudioIntent,
 parseCommunicationNotificationIntent} from "../modules/jarvis-communication-intents.js";
import {isExplicitSleepCommand} from "../modules/voice-runtime-policy.js";
import {parseWorldCameraCommand} from "../modules/jarvis-public-world-cameras-model.js";
import {parseLocalCommand} from "../modules/jarvis-local-commands.js";
const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const cases=[
 [parseDirectorIntent,"Jarvis, feche o diretor visual",{type:"close"}],
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
 "Não feche o boletim de notícias"
])for(const parse of [parseDirectorIntent,parseBriefingIntent,
 parsePublicCameraAudioIntent,parseCommunicationNotificationIntent])
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
const orchestrator=file("modules/ultron-orchestrator-v4270.js");
for(const fn of ["parseDirectorIntent","parseBriefingIntent","parsePublicCameraAudioIntent",
 "parseCommunicationNotificationIntent"])
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
console.log("JARVIS COMMUNICATION 7 PASS: command safety, voice, visual, news, camera audio and consented notifications");
