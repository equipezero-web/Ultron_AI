import { JARVIS_CAPABILITIES } from "../backend/jarvis-capabilities.js?v=4.67.0";
import {clearVisibleInterface} from "./jarvis-clear-interface.js?v=4.98.0";
import {parseMeteoIntent,parseMeteoCloseIntent} from "./jarvis-meteorological-sources.js?v=4.99.2";
import {parseGlobalIntelligenceIntent} from "./jarvis-global-intelligence-intent.js?v=5.10.0";
import {parseTrendIntent} from "./jarvis-trend-intent.js?v=1.0.0";

export const normalizeCommand=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/^(?:(?:ei|ola|hey)\s+)?(?:jarvis|j\.a\.r\.v\.i\.s\.?|ultron)[, :!?\s]+/,"").replace(/^(?:por favor[, ]+|me diga[, ]+|me fale[, ]+|eu quero que voce\s+|quero que voce\s+)+/,"").replace(/\s+/g," ").trim();

export function parseLocalCommand(value){
  const q=normalizeCommand(value);
  // Never interpret an explanation, negation or hypothetical as a command.
  if(/^(?:nao|nunca|se |e se |como (?:eu |posso |faco |faz)|por que|porque)\b/.test(q))return null;
  const plain=q.replace(/[.!?]+$/,"").trim();

  if(/^(?:ative|ativar|habilite|habilitar|ligue|ligar|inicie|iniciar)\s+(?:a\s+)?(?:escuta|microfone|comandos? de voz)(?:\s+(?:do|no)\s+jarvis)?$/.test(plain))
    return {type:"voice-listening",enabled:true};
  if(/^(?:desative|desativar|desligue|desligar|pare|parar)\s+(?:a\s+)?(?:escuta|microfone|comandos? de voz)(?:\s+(?:do|no)\s+jarvis)?$/.test(plain))
    return {type:"voice-listening",enabled:false};
  if(/^(?:ative|ativar|ligue|ligar|habilite|habilitar)\s+(?:(?:o|a)\s+)?(?:audio|som|voz|fala|respostas faladas)(?:\s+(?:do|no)\s+jarvis)?$/.test(plain))
    return {type:"voice-output",enabled:true};
  if(/^(?:silencie|silenciar|desative|desativar|desligue|desligar|mute|mutar)\s+(?:(?:o|a)\s+)?(?:audio|som|voz|fala|respostas faladas)(?:\s+(?:do|no)\s+jarvis)?$/.test(plain))
    return {type:"voice-output",enabled:false};
  if(/^(?:teste|testar|reproduza|reproduzir|ouvir)\s+(?:a\s+)?(?:sua\s+)?voz(?:\s+(?:do|no)\s+jarvis)?$/.test(plain))
    return {type:"voice-test"};
  if(/^(?:cadastre|cadastrar|registre|registrar)\s+(?:a\s+)?(?:minha\s+)?voz(?:\s+(?:no|para)\s+jarvis)?$/.test(plain))
    return {type:"voice-enroll"};
  if(/^(?:parear|pareie|vincular|vincule|conectar|conecte)\s+(?:(?:o|meu)\s+)?(?:celular|telefone|android)(?:\s+(?:ao|com)\s+jarvis)?$/.test(plain))
    return {type:"mobile-pairing"};
  if(/^(?:fechar|feche|ocultar|oculte)\s+(?:(?:os|o)\s+)?(?:arquivos?|explorador(?: de arquivos)?)\s+(?:do|de|no)\s+(?:(?:meu)\s+)?(?:celular|telefone|android)$/.test(plain))
    return {type:"remote-phone-close"};
  if(/^(?:volte|voltar|suba|subir)\s+(?:uma\s+)?pasta(?:\s+(?:no|do)\s+(?:celular|android))?$/.test(plain))
    return {type:"remote-phone-parent"};
  const phoneFile=plain.match(/^(?:abra|abrir|mostre|mostrar|exiba|exibir|leia|ler)\s+(?:o\s+)?arquivo\s+(.+?)\s+(?:do|no|de)\s+(?:(?:meu)\s+)?(?:celular|telefone|android)$/);
  if(phoneFile && !["download","downloads","dcim","documentos","documents","fotos","imagens","pictures","videos","movies","musicas","music"].includes(phoneFile[1].trim()))
    return {type:"remote-phone-file",filename:phoneFile[1].trim()};

  // Explicit imperative: browse the ANDROID folder inside the Neural Ring,
  // not a Google-search question. Android calls this directory "Download".
  const phoneFolder = plain.match(/^(?:abra|abre|abrir|mostre|mostrar|exiba|exibir|acesse|acessar|entre na|entrar na)\s+(.+?)\s+(?:do|de|no|na)\s+(?:(?:meu|meus|seu|seus)\s+)?(?:celular|telefone|android)(?:\s+(?:no|pelo)\s+jarvis)?$/);
  if(phoneFolder){
    const target=phoneFolder[1].replace(/^(?:(?:a|o|as|os|minha|minhas|meu|meus)\s+)+/,"")
      .replace(/^(?:arquivos?\s+(?:da\s+)?pasta|pasta|diretorio|arquivos?)\s+(?:(?:de|da|do|dos)\s+)?/,"").trim();
    const folders={download:"Download",downloads:"Download",dcim:"DCIM",documentos:"Documents",
      documents:"Documents",fotos:"Pictures",imagens:"Pictures",pictures:"Pictures",
      videos:"Movies",filmes:"Movies",movies:"Movies",musicas:"Music",music:"Music"};
    if(!target || ["memoria","armazenamento","arquivos","filespace"].includes(target))
      return {type:"remote-phone-folder",path:"",folder:"memoria"};
    if(Object.prototype.hasOwnProperty.call(folders,target))
      return {type:"remote-phone-folder",path:"internal:"+folders[target],folder:target};
  }
  if(/^(?:abra|abrir|mostre|mostrar|ative|ativar) (?:o |as? )?(?:painel de )?multitarefas(?: do jarvis)?$/.test(plain))
    return {type:"safe-multitask"};
  if(/^(?:abra|abrir|mostre|mostrar) (?:o |os? )?(?:editor de arquivos|arquivos autorizados|arquivos do celular|meus arquivos)$/.test(plain))
    return {type:"scoped-file-editor"};
  if(/^(?:(?:o que|que) (?:voce|tu|o jarvis|o ultron) (?:pode|consegue|sabe) fazer|(?:o que|que) (?:voce|tu) faz|quais (?:sao )?(?:as )?(?:suas|tuas) (?:capacidades|habilidades|funcoes|funcionalidades|ferramentas)|quais (?:sao )?(?:as )?funcionalidades (?:do|de) (?:jarvis|ultron)|quem e voce|o que mais voce pode fazer|quais recursos voce tem|me mostre suas funcionalidades|mostre suas funcionalidades|mostrar minhas funcionalidades|liste suas funcionalidades)$/.test(plain))return {type:"capabilities"};
  // Terminal-only cleanup is local and never clears memory, stored chats or accounts.
  if(/^(?:clear|cls|limpar terminal|limpe terminal|limpar o terminal|limpe o terminal|apagar terminal|apague terminal|apagar o terminal|apague o terminal)$/.test(plain))
    return {type:"clear-interface"};
  // "Limpar tudo" means the visible command surface, NEVER stored history/data.
  if(/^(?:por favor )?(?:(?:pode|consegue) )?(?:limpar|limpe|limpa|apagar|apague|apaga)\s+(?:tudo|(?:a |o )?(?:tela|painel(?: neural)?|interface(?: do jarvis)?))(?:\s+(?:agora|por favor))?$/.test(plain))return {type:"clear-interface"};
  if(/^(?:(?:(?:mostre|mostrar|exiba|exibir|ver|consulte|consultar)\s+(?:as? |os? )?)|(?:quais (?:sao )?(?:as |os )?))?(?:fontes? (?:dos? )?dados|origem (?:dos? )?dados|relatorio de origem|relatorio de fontes|rastreabilidade dos dados|fontes utilizadas)$/.test(plain))
    return {type:"data-evidence"};
  const trendIntent=parseTrendIntent(plain);
  if(trendIntent)return trendIntent;
  const globalIntent=parseGlobalIntelligenceIntent(plain);
  if(globalIntent)return globalIntent;
  // Natural spoken compound request: "a previsão está aberta, feche a previsão".
  // Only extract a final explicit imperative from a factual weather prefix.
  // Never turn a negation, question or quoted explanation into an action.
  const tail=plain.match(/^(?:(?:a|o)\s+)?(?:previsao(?: do tempo)?|radar|meteorologia|satelite|inmet|apac)\s+(?:esta|ta|ficou)\s+(?:abert[ao]|na tela|visivel)[,;:]\s*(fech(?:e|ar)|encer(?:re|rar)|ocult(?:e|ar)|sair d[ao])\s+(.+)$/);
  const closeInput=tail?tail[1]+" "+tail[2]:plain;
  const meteoClose=parseMeteoCloseIntent(closeInput);
  if(meteoClose)return {type:"meteorological-close",tab:meteoClose.tab};
  const meteo=parseMeteoIntent(plain);
  if(meteo)return {type:"meteorological-center",...meteo};
  const match=plain.match(/^(?:por favor )?(?:pode |consegue |quero )?(desative|desativar|desativa|oculte|ocultar|esconda|esconder|remova|remover|retire|retirar|tire|tirar|ative|ativar|ativa|habilite|habilitar|ligue|ligar|mostre|mostrar|exiba|exibir|restaure|restaurar|volte a mostrar|pare de mostrar)\s+(?:o |os |a |as )?(?:textos?|respostas? em texto|legendas?)(?:\s+(?:(?:do|no|da|na)\s+(?:painel\s+)?(?:neural ring|neural|anel neural|painel de respostas|jarvis)|(?:agora|por favor)))*$/);
  if(!match)return null;
  return {type:"neural-text",enabled:/^(?:ative|ativar|ativa|habilite|habilitar|ligue|ligar|mostre|mostrar|exiba|exibir|restaure|restaurar|volte a mostrar)$/.test(match[1])};
}
export async function runLocalCommand(command){
  const intent=parseLocalCommand(command);
  if(!intent)return null;
  if (window.JARVIS_AUDIO_POLICY?.enabled===false && ["voice-output","voice-test","voice-listening","voice-enroll"].includes(intent.type))
    return {handled:true,ok:false,route:"voice-disabled",provider:"jarvis-local",
      text:"Modo texto ativo. Escuta, Voice Match e respostas faladas estão desativados para manutenção."};
  if(intent.type==="voice-output"){
    const output=window.JARVIS_VOICE_CONTROLS;
    if(!output?.setEnabled)return {handled:true,ok:false,route:"voice-output",
      provider:"jarvis-local",text:"Controle de áudio ainda não carregado."};
    const state=output.setEnabled(intent.enabled);
    return {handled:true,ok:state.enabled===intent.enabled,route:"voice-output",
      provider:"jarvis-local",text:intent.enabled?
      "Voz e áudio do Jarvis ativados no navegador.":"Voz do Jarvis silenciada."};
  }
  if(intent.type==="voice-test"){
    const speech=window.ULTRON_VOICE_OUTPUT;
    const ok=Boolean(speech?.speak?.(
      "J.A.R.V.I.S. online. Áudio habilitado. Estou pronto para conversar.",
      {reason:"mobile-voice-test",announce:false}));
    return {handled:true,ok,route:"voice-test",provider:"jarvis-local",
      text:ok?"Teste de voz solicitado ao navegador.":"Não consegui iniciar a voz. Confira som e permissão do navegador."};
  }
  if(intent.type==="voice-listening") {
    const voice=window.ULTRON_VOICE_INPUT;
    if(!voice?.enable || !voice?.disable)return {handled:true,ok:false,route:"voice-control",
      provider:"jarvis-local",text:"Módulo de voz não foi inicializado neste navegador."};
    const ok=intent.enabled ? await voice.enable({userInitiated:true,persist:true}) :
      (voice.disable({persist:true,announce:true}),true);
    return {handled:true,ok,route:"voice-control",provider:"jarvis-local",
      text:ok?(intent.enabled?"Escuta ativada. Diga 'Jarvis' seguido do comando.":
        "Escuta desativada. Digite 'Jarvis ativar escuta' para religar.") :
        "Não foi possível ativar o microfone. Autorize o microfone nas permissões do navegador."};
  }
  if(intent.type==="voice-enroll"){
    const enroll=window.ULTRON_VOICE_MATCH?.enroll;
    if(!enroll)return {handled:true,ok:false,route:"voice-enroll",provider:"jarvis-local",
      text:"Voice Match ainda não foi carregado."};
    try{
      await enroll();
      return {handled:true,ok:true,route:"voice-enroll",provider:"jarvis-local",
        text:"Solicitação de cadastro de voz iniciada. Siga as instruções do Voice Match."};
    }catch(e){return {handled:true,ok:false,route:"voice-enroll",provider:"jarvis-local",
      text:"Não foi possível cadastrar a voz: "+String(e?.message||e)};}
  }
  if(intent.type==="mobile-pairing"){
    const start=window.ULTRON_DEVICES?.startPairing;
    if(!start)return {handled:true,ok:false,route:"mobile-pairing",provider:"jarvis-local",text:"Gateway de dispositivos indisponível."};
    try{
      const result=await start("mobile","J.A.R.V.I.S. Mobile Bridge");
      return {handled:true,ok:Boolean(result?.code),route:"mobile-pairing",provider:"jarvis-local",
        text:result?.code?"Código de pareamento do celular: "+result.code+
          ". Digite os seis números no aplicativo J.A.R.V.I.S. Bridge. O código expira em 10 minutos.":
          "Gateway não retornou código de pareamento."};
    }catch(e){return {handled:true,ok:false,route:"mobile-pairing",provider:"jarvis-local",
      text:"Falha ao gerar código do celular: "+String(e?.message||e)};}
  }
  if(["remote-phone-close","remote-phone-parent","remote-phone-file"].includes(intent.type)){
    const files=window.JARVIS_PHONE_FILES;
    const method=intent.type==="remote-phone-close"?"close":
      intent.type==="remote-phone-parent"?"parent":"openFile";
    if(!files?.[method])return {handled:true,ok:false,route:"remote-phone-files",provider:"jarvis-local",
      text:"Explorador remoto do celular ainda indisponível."};
    const result=await files[method](intent.filename);
    return {handled:true,ok:result?.ok===true,route:"remote-phone-files",provider:"jarvis-local",
      text:result?.message||result?.error||"Comando enviado ao explorador."};
  }
  if(intent.type==="remote-phone-folder"){
    const manager=window.JARVIS_PHONE_FILES;
    if(!manager?.openFolder) return {ok:false,handled:true,route:"remote-phone-files",
      provider:"jarvis-local",text:"Explorador remoto do celular ainda não carregado. Verifique o J.A.R.V.I.S. Bridge."};
    try{
      const result=await manager.openFolder(intent.path);
      const ok=result?.ok===true;
      return {ok,handled:true,route:"remote-phone-files",provider:"jarvis-local",
        text:ok?(result?.waitingAuthorization?
          "Explorador do celular aberto. Para entrar em "+intent.path.split(":")[1]+
          ", selecione a pasta no celular, ative a sessão de 10 minutos e digite o PIN de 8 números, depois pressione Enter.":
          "Pasta "+intent.path.split(":")[1]+" do celular aberta no Neural Ring.") :
          String(result?.error||"Não foi possível abrir a pasta do celular.")};
    }catch(error){
      return {ok:false,handled:true,route:"remote-phone-files",provider:"jarvis-local",
        text:"Falha ao abrir a pasta do celular: "+String(error?.message||error).slice(0,180)};
    }
  }
  if(intent.type==="safe-multitask"||intent.type==="scoped-file-editor"){
    const manager=intent.type==="safe-multitask"?
      window.ULTRON_PARALLEL_TASKS:window.ULTRON_SCOPED_FILES;
    const result=manager?.open?.()||{ok:false,error:"Módulo ainda não carregado."};
    const ok=result?.ok===true;
    return {ok,handled:true,route:intent.type==="safe-multitask"?
      "local-safe-multitask":"local-scoped-file-editor",
      provider:"jarvis-local",text:ok?
      (intent.type==="safe-multitask"?
       "Painel de consultas independentes aberto no Neural Jarvis. Até três leituras simultâneas, sem ações destrutivas.":
       "Editor local de arquivos autorizado. Selecione manualmente um documento; acesso remoto ao armazenamento do celular não foi concedido."):
       String(result?.error||"Módulo não disponível.")};
  }
  if(intent.type==="clear-interface"){
    const result=clearVisibleInterface();
    return {ok:result.ok,handled:true,quiet:result.ok,cleared:result.cleared,
      route:"local-clear-interface",provider:"jarvis-local",text:result.ok?
      "Painel visual limpo. Dados armazenados preservados.":
      "Não consegui limpar completamente o painel visual. "+result.errors.join("; ").slice(0,180)};
  }
  if(intent.type==="data-evidence"){
    const evidence=window.ULTRON_DATA_INTELLIGENCE?.latest||null;
    const text=evidence?
      (await import("./jarvis-data-intelligence-model.js")).evidenceSummary(evidence):
      "Não há relatório de origem nesta sessão. Consulte uma previsão mundial no mapa ou as estações APAC; não inventarei fontes nem medições.";
    if(evidence&&typeof window.ULTRON_NEURAL_ANSWER?.show==="function")
      window.ULTRON_NEURAL_ANSWER.show(text,{webResearch:{
        requested:false,used:false,
        sources:evidence.sources.filter(s=>s.url).map(s=>({title:s.provider,url:s.url}))
      }});
    return {ok:!!evidence,handled:true,quiet:false,route:"local-data-evidence",
      provider:"jarvis-evidence",text};
  }
  if(intent.type==="trend-intelligence"||intent.type==="trend-intelligence-close"){
    if(!window.JARVIS_TREND_INTELLIGENCE?.open)
      await import("./jarvis-trend-intelligence.js?v=1.0.0");
    const module=window.JARVIS_TREND_INTELLIGENCE;
    if(intent.type==="trend-intelligence-close"){
      const result=module?.close?.();
      return {handled:true,ok:result?.ok===true,route:"local-trend-intelligence",
        provider:"jarvis-sourced-trends",text:result?.message||"Painel de tendências indisponível."};
    }
    const result=await module?.open?.({region:intent.region,category:intent.category,refresh:intent.refresh});
    const ok=result?.ok===true;
    const message=ok?result.message:
      "Tendências indisponíveis: "+String(result?.error||"monitor de fontes não respondeu").slice(0,185);
    if(ok)window.ULTRON_VOICE_OUTPUT?.speak?.(message,{reason:"trend-briefing",announce:false});
    return {ok,handled:true,route:"local-trend-intelligence",
      provider:"jarvis-sourced-trends",text:message};
  }
  if(intent.type==="global-intelligence"){
    if(!window.ULTRON_GLOBAL_INTELLIGENCE?.open)
      await import("./jarvis-global-intelligence-ring.js?v=5.25.3");
    // The module may load before the command center mounts on mobile.
    // Wait for its singleton instead of re-importing a second URL.
    for(let i=0;!window.ULTRON_GLOBAL_INTELLIGENCE?.open&&i<35;i++)
      await new Promise(resolve=>setTimeout(resolve,100));
    const result=await window.ULTRON_GLOBAL_INTELLIGENCE?.open?.({
      view:intent.view,region:intent.region,category:intent.category
    });
    const ok=result?.ok===true&&result.visible===true;
    return {ok,handled:true,route:"local-global-intelligence",
      provider:"jarvis-local",text:ok?
      "Inteligência global exibida no Neural Jarvis. "+
      result.eventCount+" registros publicados no filtro; até "+result.plotted+
      " locais representados no mapa. Fontes e horários indicados.":
      "Não foi possível confirmar o monitoramento mundial no Neural Jarvis: "+
      String(result?.error||"sem coleta válida").slice(0,150)};
  }
  if(intent.type==="meteorological-close"){
    const module=window.ULTRON_METEO_CENTER,state=module?.state;
    const geo=window.ULTRON_GEO_VISUAL,gs=geo?.state;
    const geoForecast=Boolean(gs?.visible&&typeof gs?.scenario==="string"&&
      /^weather-(?:global-\d+|[a-z0-9-]+)$/.test(gs.scenario)&&typeof geo.close==="function");
    const closeGeo=()=>{
      if(!geoForecast)return false;
      const result=geo.close();
      return result?.ok===true&&geo.state?.visible===false;
    };
    const centerOpen=Boolean(module?.close&&state?.visible);
    if(!centerOpen&&!geoForecast)
      return {handled:true,ok:false,route:"local-meteorological-close",provider:"jarvis-local",
        text:"Nenhum painel meteorológico ou mapa de previsão está aberto. Nenhuma outra visualização foi alterada."};
    if(intent.tab&&(!centerOpen||state.tab!==intent.tab)){
      if(intent.tab==="forecast"&&closeGeo())
        return {handled:true,ok:true,route:"local-meteorological-close",provider:"jarvis-local",
          text:"PREVISÃO // mapa meteorológico fechado; outras visualizações preservadas."};
      return {handled:true,ok:false,route:"local-meteorological-close",provider:"jarvis-local",
        text:"A aba solicitada não está aberta. A visualização atual foi preservada."};
    }
    const centerClosed=centerOpen?module.close()?.ok===true&&module.state?.visible===false:false;
    const geoClosed=(!intent.tab||intent.tab==="forecast")?closeGeo():false;
    const ok=centerClosed||geoClosed;
    return {handled:true,ok,route:"local-meteorological-close",provider:"jarvis-local",
      text:ok?"METEOROLOGIA // visualização solicitada fechada no Neural Ring. "+
        "Consultas e animações do painel fechado interrompidas.":
        "Falha ao fechar meteorologia. Verifique o botão X do painel."};
  }
  if(intent.type==="meteorological-center"){
    if(!window.ULTRON_METEO_CENTER?.open)await import("./jarvis-meteorological-center.js?v=4.99.3");
    for(let i=0;!window.ULTRON_METEO_CENTER?.open&&i<35;i++)
      await new Promise(resolve=>setTimeout(resolve,100));
    const result=await window.ULTRON_METEO_CENTER?.open?.({tab:intent.tab,view:intent.view});
    const ok=result?.ok===true&&result.visible===true;
    return {ok,handled:true,route:"local-meteorological-center",provider:"jarvis-local",
      text:ok?"Centro meteorológico aberto no Neural Jarvis: "+intent.tab.toUpperCase()+". "+
        "Radar, satélite, observação e previsão são identificados separadamente.":
        "Não foi possível abrir o centro meteorológico no Neural Jarvis."};
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
      text=ok?(intent.enabled?"Textos do Neural Jarvis ativados.":"Textos do Neural Jarvis desativados. Imagens, vídeos e voz continuam disponíveis."):"Não consegui verificar a alteração dos textos.";
    }
  }else{
    text="Sou o J.A.R.V.I.S., seu centro de comando. Estas são as minhas funções projetadas:\n\n"+JARVIS_CAPABILITIES.map(([name,description])=>"• "+name+": "+description).join("\n")+"\n• Controle da interface: ativar e desativar os textos do Neural Jarvis por comando, sem confirmação adicional.\n\nPosso executar comandos claros nos módulos disponíveis; funções externas dependem de conexão, configuração e permissões. Não preciso pesquisar na internet para explicar minhas capacidades.";
    const id=window.__ultronQuestionSequence=(Number(window.__ultronQuestionSequence)||0)+1;
    window.dispatchEvent(new CustomEvent("ultron:question-start",{detail:{id,question:command}}));
    window.dispatchEvent(new CustomEvent("ultron:answer",{detail:{id,text,visualContext:null,webResearch:{requested:false,used:false,sources:[]}}}));
  }
  window.ULTRON_VOICE_OUTPUT?.speak?.(text,{reason:"local-command",announce:false});
  return {ok,handled:true,route:intent.type==="capabilities"?"local-capabilities":"neural-text-control",text,enabled:intent.enabled,provider:"jarvis-local"};
}
