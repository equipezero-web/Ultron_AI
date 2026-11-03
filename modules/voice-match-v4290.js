const PROFILE_KEY = 'ultron_voice_match_profile_v1';
const SETTINGS_KEY = 'ultron_voice_match_settings_v1';
const SAMPLE_COUNT = 3;
const CAPTURE_MS = 1800;
const RECENT_WINDOW_MS = 3200;
const FRAME_INTERVAL_MS = 80;
const MIN_RMS = 0.012;
const WAKE_WORD = 'Jarvis';

const output = document.getElementById('output-box');
const statusEl = document.getElementById('voice-match-state');
const enrollButton = document.getElementById('btn-enroll-voice-match');
const disableButton = document.getElementById('btn-disable-voice-match');

let monitor = null;
let monitorTimer = null;
let recentFrames = [];
let enrolling = false;
let lastVerification = null;

function log(message, alert = false) {
  if (!output) return;
  const line = document.createElement('p');
  if (alert) line.className = 'alert';
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  line.textContent = `> [${time}] [VOICE-MATCH] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}
function safeJsonParse(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function loadProfile() { return safeJsonParse(localStorage.getItem(PROFILE_KEY), null); }
function loadSettings() { return { required: true, allowTrustedMobile: true, ...safeJsonParse(localStorage.getItem(SETTINGS_KEY), {}) }; }
function saveSettings(value) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(value)); }
function setStatus(state, detail = '') {
  if (!statusEl) return;
  const labels = { missing:'NÃO CADASTRADO', ready:'READY', enrolling:'CADASTRANDO', match:'MATCH', rejected:'REJECTED', error:'ERROR', disabled:'DESATIVADO' };
  statusEl.textContent = detail || labels[state] || state.toUpperCase();
  statusEl.className = ['ready','match','enrolling'].includes(state) ? 'green' : '';
}
function currentProfile() { return loadProfile(); }
function isEnrolled() { const profile=currentProfile(); return Boolean(profile?.vector?.length && profile?.version===1); }
function settings() { return loadSettings(); }
function normalizeVector(vector) { const norm=Math.sqrt(vector.reduce((s,v)=>s+v*v,0))||1; return vector.map(v=>v/norm); }
function cosineSimilarity(a,b) { if(!a?.length||a.length!==b?.length)return 0; let dot=0,aa=0,bb=0; for(let i=0;i<a.length;i+=1){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];} return dot/((Math.sqrt(aa)*Math.sqrt(bb))||1); }
function averageVectors(vectors) { if(!vectors.length)return[]; const out=new Array(vectors[0].length).fill(0); for(const vector of vectors)for(let i=0;i<out.length;i+=1)out[i]+=Number(vector[i]||0); return out.map(v=>v/vectors.length); }
function featureFrame(analyser,sampleRate){
  const frequency=new Float32Array(analyser.frequencyBinCount); const time=new Float32Array(analyser.fftSize); analyser.getFloatFrequencyData(frequency); analyser.getFloatTimeDomainData(time);
  let rmsSum=0,zeroCrossings=0; for(let i=0;i<time.length;i+=1){const value=time[i];rmsSum+=value*value;if(i>0&&Math.sign(time[i-1])!==Math.sign(value))zeroCrossings+=1;}
  const rms=Math.sqrt(rmsSum/time.length); if(!Number.isFinite(rms)||rms<MIN_RMS)return null;
  const minHz=100,maxHz=Math.min(4200,sampleRate/2-50),bands=14,values=[]; let weightedHz=0,powerTotal=0;
  for(let band=0;band<bands;band+=1){const t0=band/bands,t1=(band+1)/bands,lowHz=minHz*Math.pow(maxHz/minHz,t0),highHz=minHz*Math.pow(maxHz/minHz,t1); const start=Math.max(1,Math.floor((lowHz/(sampleRate/2))*frequency.length)); const end=Math.max(start+1,Math.min(frequency.length,Math.ceil((highHz/(sampleRate/2))*frequency.length))); let sum=0,count=0; for(let i=start;i<end;i+=1){const db=Number.isFinite(frequency[i])?frequency[i]:-120,linear=Math.pow(10,db/20);sum+=linear;count+=1;const hz=(i/frequency.length)*(sampleRate/2);weightedHz+=hz*linear;powerTotal+=linear;} values.push(count?sum/count:0);}
  return {at:performance.now(),vector:normalizeVector([...normalizeVector(values),powerTotal>0?weightedHz/powerTotal/maxHz:0,zeroCrossings/time.length])};
}
function aggregateFrames(frames){const valid=frames.filter(f=>f?.vector?.length);return valid.length<4?null:normalizeVector(averageVectors(valid.map(f=>f.vector)));}
async function openMonitor(){
  if(monitor)return monitor; if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microfone indisponível neste navegador.');
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false}); const AudioContextClass=window.AudioContext||window.webkitAudioContext; if(!AudioContextClass){stream.getTracks().forEach(t=>t.stop());throw new Error('Web Audio não está disponível neste navegador.');}
  const context=new AudioContextClass(),source=context.createMediaStreamSource(stream),analyser=context.createAnalyser(); analyser.fftSize=2048;analyser.smoothingTimeConstant=.18;source.connect(analyser); monitor={stream,context,analyser};recentFrames=[];
  monitorTimer=setInterval(()=>{if(!monitor||enrolling||window.JARVIS_RUNTIME?.state?.speaking)return;const frame=featureFrame(monitor.analyser,monitor.context.sampleRate);if(frame)recentFrames.push(frame);const cutoff=performance.now()-RECENT_WINDOW_MS;recentFrames=recentFrames.filter(i=>i.at>=cutoff);},FRAME_INTERVAL_MS); return monitor;
}
async function closeMonitor(){if(monitorTimer)clearInterval(monitorTimer);monitorTimer=null;recentFrames=[];if(!monitor)return;monitor.stream?.getTracks?.().forEach(t=>t.stop());if(monitor.context&&monitor.context.state!=='closed')await monitor.context.close().catch(()=>{});monitor=null;}
async function captureSample(ms=CAPTURE_MS){const active=await openMonitor(),frames=[],started=performance.now();while(performance.now()-started<ms){const frame=featureFrame(active.analyser,active.context.sampleRate);if(frame)frames.push(frame);await new Promise(r=>setTimeout(r,FRAME_INTERVAL_MS));}return aggregateFrames(frames);}
async function enroll(){
  if(enrolling)return false;enrolling=true;setStatus('enrolling');window.ULTRON_VOICE_INPUT?.suspend?.('voice-match-enroll');recentFrames=[];
  try{const samples=[];for(let index=0;index<SAMPLE_COUNT;index+=1){log(`AMOSTRA ${index+1}/${SAMPLE_COUNT}: diga “${WAKE_WORD}” com sua voz normal.`);await new Promise(r=>setTimeout(r,650));const vector=await captureSample();if(!vector)throw new Error('Pouca voz detectada. Fale mais próximo do microfone e tente novamente.');samples.push(vector);log(`AMOSTRA ${index+1}/${SAMPLE_COUNT}: capturada.`);await new Promise(r=>setTimeout(r,450));}
    const template=normalizeVector(averageVectors(samples)),similarities=samples.map(s=>cosineSimilarity(s,template)),threshold=Math.max(.78,Math.min(.91,Math.min(...similarities)-.06)); const profile={version:1,createdAt:new Date().toISOString(),samples:SAMPLE_COUNT,vector:template,threshold,wakeWord:WAKE_WORD};localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));saveSettings({...settings(),required:true});setStatus('ready');log(`Perfil vocal J.A.R.V.I.S. cadastrado. Limiar dinâmico: ${Math.round(threshold*100)}%.`);window.dispatchEvent(new CustomEvent('ultron:voice-match-enrolled',{detail:{threshold,wakeWord:WAKE_WORD}}));return true;
  }catch(error){setStatus('error');log(`Falha no cadastro de voz: ${error?.message||error}`,true);return false;}finally{enrolling=false;window.ULTRON_VOICE_INPUT?.resume?.('voice-match-enroll');}}
async function verifyLocalWake(){const profile=currentProfile();if(!profile?.vector?.length)return{matched:true,method:'wake-word-only',score:null,enrolled:false};try{await openMonitor();}catch(error){return{matched:false,method:'local-voice-match',score:null,reason:error?.message||String(error)}}const cutoff=performance.now()-RECENT_WINDOW_MS,vector=aggregateFrames(recentFrames.filter(f=>f.at>=cutoff));if(!vector)return{matched:false,method:'local-voice-match',score:null,reason:'Áudio insuficiente para comparar a voz.'};const score=cosineSimilarity(vector,profile.vector),threshold=Number(profile.threshold||.82),matched=score>=threshold;lastVerification={at:Date.now(),score,threshold,matched};setStatus(matched?'match':'rejected',`${matched?'MATCH':'REJECTED'} ${Math.round(score*100)}%`);setTimeout(()=>{if(isEnrolled())setStatus('ready')},1800);window.dispatchEvent(new CustomEvent('ultron:voice-match-result',{detail:lastVerification}));return{matched,method:'local-voice-match',score,threshold};}
async function authorizeWake({source='local',trustedDevice=false,voiceMatch=false}={}){const cfg=settings(),profile=currentProfile();if(!profile?.vector?.length||cfg.required===false)return{matched:true,method:profile?.vector?.length?'voice-match-disabled':'wake-word-only'};if(source==='mobile'){if(voiceMatch===true)return{matched:true,method:'mobile-voice-match'};if(cfg.allowTrustedMobile&&trustedDevice)return{matched:true,method:'paired-mobile-trust'};return{matched:false,method:'remote-unverified',reason:'Fonte remota sem Voice Match verificável.'}}return verifyLocalWake();}
async function enableRequired(){if(!isEnrolled()){log('Cadastre sua voz antes de exigir Voice Match.',true);return false;}saveSettings({...settings(),required:true});setStatus('ready');await openMonitor().catch(()=>{});return true;}
function disableRequired(){saveSettings({...settings(),required:false});setStatus('disabled');log('Voice Match desativado. O wake word Jarvis continuará funcionando sem comparação de voz.');return true;}
async function initialize(){const profile=currentProfile(),cfg=settings();if(!profile?.vector?.length){setStatus('missing');return;}if(cfg.required===false){setStatus('disabled');return;}setStatus('ready');try{const permission=await navigator.permissions?.query?.({name:'microphone'});if(!permission||permission.state==='granted')await openMonitor();}catch{}}
enrollButton?.addEventListener('click',enroll);disableButton?.addEventListener('click',()=>{if(settings().required===false)enableRequired();else disableRequired();});window.addEventListener('ultron:voice-listening-enabled',()=>{if(isEnrolled()&&settings().required!==false)openMonitor().catch(()=>{})});window.addEventListener('ultron:speech-start',()=>{recentFrames=[];});window.addEventListener('beforeunload',()=>closeMonitor());
window.ULTRON_VOICE_MATCH={version:'4.32.1',wakeWord:WAKE_WORD,enroll,authorizeWake,verifyLocalWake,enableRequired,disableRequired,get enrolled(){return isEnrolled()},get required(){return isEnrolled()&&settings().required!==false},get allowTrustedMobile(){return settings().allowTrustedMobile!==false},get state(){return{enrolled:isEnrolled(),required:isEnrolled()&&settings().required!==false,monitorActive:Boolean(monitor),lastVerification,wakeWord:WAKE_WORD}}};
window.JARVIS_VOICE_MATCH=window.ULTRON_VOICE_MATCH;
initialize();
