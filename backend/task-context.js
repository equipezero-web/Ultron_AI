// The browser's session topic is untrusted data, never a source of tool authority.
const take=(value,n)=>typeof value==="string"?value.replace(/[\r\n<>]/g," ").replace(/\s+/g," ").trim().slice(0,n):"";
const PRIVATE=/\b(?:senha|senhas|password|token|api[_ -]?key|cpf|rg|credenciais|meu saldo|minha conta|meus clientes|meus pedidos|e-mail pessoal|dados privados|dados pessoais|chave secreta)\b/i;
export function vetClientTaskContext(body){
 const c=body?.taskContext,message=take(body?.message,650);
 if(!c||typeof c!=="object"||c.followup!==true||!message||message.length>600)return null;
 if(!/^(?:e\s+|agora\s+|compare\s+|foque\s+|mais detalhes|e os detalhes)/i.test(message))return null;
 const topic=take(c.topic,180),region=take(c.region,100),lastQuestion=take(c.lastQuestion,280);
 if(!topic&&!lastQuestion)return null;
 if(PRIVATE.test([message,topic,region,lastQuestion].join(" ")))return null;
 return {topic,region,lastQuestion,
  visualization:["ring","globe","map-2d"].includes(c.visualization)?c.visualization:"ring"};
}
export function contextSearchQuery(message,c){
 if(!c)return take(message,500);
 return take([c.topic||c.lastQuestion,c.region,message].filter(Boolean).join(" "),500);
}
