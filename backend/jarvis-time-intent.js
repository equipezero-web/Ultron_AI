// Clock questions are operational requests, not web research or model recall.
// The Worker clock provides an observed server timestamp, NOT a certified
// official Brazilian time service. Never infer that a user's clock is wrong.
const clean=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^a-z0-9: ]+/g," ").replace(/\s+/g," ").trim();

export function isClockQuestion(message){
 const q=clean(message);
 if(!q || q.length>420)return false;
 if(/\b(?:alarme|temporizador|cronometro|fuso horario de|quando foi|que horas abre|que horas fecha|hora de dormir|quantas horas|quanto tempo|horas extras)\b/.test(q))return false;
 return /\b(?:que horas sao|que horas e|qual(?: e)? o horario(?: oficial)?(?: agora| atual| de brasilia| em recife| no brasil)?|qual(?: e)? a hora(?: certa| agora| atual)?|me diga as horas|informe as horas|horario agora|hora certa agora|hora atual|horario atual|hora oficial de brasilia|horario oficial de brasilia)\b/.test(q)
  || /^(?:jarvis |ultron )?(?:horas|horario|hora)(?: agora| atual)?$/.test(q);
}

export function clockAnswer(message, now=new Date()){
 if(!isClockQuestion(message))return null;
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))return null;
 const zone="America/Sao_Paulo";
 const fmt=new Intl.DateTimeFormat("pt-BR",{timeZone:zone,day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
 const value=fmt.format(now);
 const userMentionedDevice=/\b(?:notebook|computador|pc|celular|dispositivo|relogio|meu horario|aqui mostra|aqui marca)\b/.test(clean(message));
 return {
  text:"Pelo relógio do servidor do J.A.R.V.I.S., em Brasília (UTC−3), agora são "+value+". "+
   "Esta é uma leitura do servidor, não uma certificação de um serviço oficial de horário."+
   (userMentionedDevice?" Uma diferença entre os horários não comprova, por si só, problema no relógio do seu dispositivo.":""),
  provider:"jarvis-local",providerLabel:"J.A.R.V.I.S.",model:"server-clock",
  attempts:[],clock:{source:"server",timezone:zone,observedAt:now.toISOString(),official:false},
  visualContext:null,webResearch:{requested:false,used:false,sourceCount:0,sources:[]},
  audioBase64:null,audioMimeType:null
 };
}
