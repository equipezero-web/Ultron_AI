import { JARVIS_CAPABILITIES } from "../backend/jarvis-capabilities.js?v=4.67.0";
import {clearVisibleInterface} from "./jarvis-clear-interface.js?v=4.98.0";
import {parseMeteoIntent} from "./jarvis-meteorological-sources.js?v=4.98.0";

export const normalizeCommand=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/^(?:(?:ei|ola|hey)\s+)?(?:jarvis|j\.a\.r\.v\.i\.s\.?|ultron)[, :!?\s]+/,"").replace(/^(?:por favor[, ]+|me diga[, ]+|me fale[, ]+|eu quero que voce\s+|quero que voce\s+)+/,"").replace(/\s+/g," ").trim();

export function parseLocalCommand(value){
  const q=normalizeCommand(value);
  // Never interpret an explanation, negation or hypothetical as a command.
  if(/^(?:nao|nunca|se |e se |como (?:eu |posso |faco |faz)|por que|porque)\b/.test(q))return null;
  const plain=q.replace(/[.!?]+$/,"").trim();
  if(/^(?:(?:o que|que) (?:voce|tu|o jarvis|o ultron) (?:pode|consegue|sabe) fazer|(?:o que|que) (?:voce|tu) faz|quais (?:sao )?(?:as )?(?:suas|tuas) (?:capacidades|habilidades|funcoes|funcionalidades|ferramentas)|quais (?:sao )?(?:as )?funcionalidades (?:do|de) (?:jarvis|ultron)|quem e voce|o que mais voce pode fazer|quais recursos voce tem|me mostre suas funcionalidades)$/.test(plain))return {type:"capabilities"};
  // "Limpar tudo" means the visible command surface, NEVER stored history/data.
  if(/^(?:por favor )?(?:(?:pode|consegue) )?(?:limpar|limpe|limpa|apagar|apague|apaga)\s+(?:tudo|(?:a |o )?(?:tela|painel(?: neural)?|interface(?: do jarvis)?))(?:\s+(?:agora|por favor))?$/.test(plain))return {type:"clear-interface"};
  const meteo=parseMeteoIntent(plain);
  if(meteo)return {type:"meteorological-center",...meteo};
  const match=plain.match(/^(?:por favor )?(?:pode |consegue |quero )?(desative|desativar|desativa|oculte|ocultar|esconda|esconder|remova|remover|retire|retirar|tire|tirar|ative|ativar|ativa|habilite|habilitar|ligue|ligar|mostre|mostrar|exiba|exibir|restaure|restaurar|volte a mostrar|pare de mostrar)\s+(?:o |os |a |as )?(?:textos?|respostas? em texto|legendas?)(?:\s+(?:(?:do|no|da|na)\s+(?:painel\s+)?(?:neural ring|neural|anel neural|painel de respostas|jarvis)|(?:agora|por favor)))*$/);
  if(!match)return null;
  return {type:"neural-text",enabled:/^(?:ative|ativar|ativa|habilite|habilitar|ligue|ligar|mostre|mostrar|exiba|exibir|restaure|restaurar|volte a mostrar)$/.test(match[1])};
}
export async function runLocalCommand(command){
  const intent=parseLocalCommand(command);
  if(!intent)return null;
  if(intent.type==="clear-interface"){
    const result=clearVisibleInterface();
    return {ok:result.ok,handled:true,quiet:result.ok,cleared:result.cleared,
      route:"local-clear-interface",provider:"jarvis-local",text:result.ok?
      "Painel visual limpo. Dados armazenados preservados.":
      "Não consegui limpar completamente o painel visual. "+result.errors.join("; ").slice(0,180)};
  }
  if(intent.type==="meteorological-center"){
    if(!window.ULTRON_METEO_CENTER?.open)await import("./jarvis-meteorological-center.js?v=4.98.0");
    const result=await window.ULTRON_METEO_CENTER?.open?.({tab:intent.tab,view:intent.view});
    const ok=result?.ok===true&&result.visible===true;
    return {ok,handled:true,route:"local-meteorological-center",provider:"jarvis-local",
      text:ok?"Centro meteorológico aberto no Neural Ring: "+intent.tab.toUpperCase()+". "+
        "Radar, satélite, observação e previsão são identificados separadamente.":
        "Não foi possível abrir o centro meteorológico no Neural Ring."};
  }
  // Wait briefly for the mounted UI, without calling an external provider.
  let answer=window.ULTRON_NEURAL_ANSWER;
  for(let i=0;!answer&&i<20;i++){await new Promise(r=>setTimeout(r,50));answer=window.ULTRON_NEURAL_ANSWER;}
  let text,ok=true;
  if(intent.type==="neural-text"){
    if(typeof answer?.setTextEnabled!=="function"){ok=false;text="Não consegui alterar os textos: o painel neural ainda não está disponível.";}
    else{
      answer.setTextEnabled(intent.enabled);
      ok=answer.textEnabled===intent.enabled;
      text=ok?(intent.enabled?"Textos do Neural Ring ativados.":"Textos do Neural Ring desativados. Imagens, vídeos e voz continuam disponíveis."):"Não consegui verificar a alteração dos textos.";
    }
  }else{
    text="Sou o J.A.R.V.I.S., seu centro de comando. Estas são as minhas funções projetadas:\n\n"+JARVIS_CAPABILITIES.map(([name,description])=>"• "+name+": "+description).join("\n")+"\n• Controle da interface: ativar e desativar os textos do Neural Ring por comando, sem confirmação adicional.\n\nPosso executar comandos claros nos módulos disponíveis; funções externas dependem de conexão, configuração e permissões. Não preciso pesquisar na internet para explicar minhas capacidades.";
    const id=window.__ultronQuestionSequence=(Number(window.__ultronQuestionSequence)||0)+1;
    window.dispatchEvent(new CustomEvent("ultron:question-start",{detail:{id,question:command}}));
    window.dispatchEvent(new CustomEvent("ultron:answer",{detail:{id,text,visualContext:null,webResearch:{requested:false,used:false,sources:[]}}}));
  }
  window.ULTRON_VOICE_OUTPUT?.speak?.(text,{reason:"local-command",announce:false});
  return {ok,handled:true,route:intent.type==="capabilities"?"local-capabilities":"neural-text-control",text,enabled:intent.enabled,provider:"jarvis-local"};
}
