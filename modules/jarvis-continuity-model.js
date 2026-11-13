// Model stays testable without browser globals; it never treats sampled data
// or a source listing as a prediction, breaking news, or device authorization.
const ALLOWED=new Set(["healthy","partial","stale","unavailable"]);
const formatAge=(n)=>Number.isFinite(n)&&n>=0?Math.round(n)+" min":"sem horário";
const clean=(value,max=130)=>String(value??"").replace(/[\r\n<>]/g," ").trim().slice(0,max);
export function continuityView(report){
  if(report?.ok!==true||report?.collection!=="read-only-persisted"||
    !ALLOWED.has(report?.world?.state)||!ALLOWED.has(report?.weather?.state)||
    !Array.isArray(report.world.sources)||!Array.isArray(report.world.highlights)||
    !Array.isArray(report.weather.highlights)){
    return {ok:false,text:"CONTINUIDADE // Nenhum panorama persistido verificável foi recebido.",
      ring:"CONTINUIDADE · SEM DADOS VERIFICADOS",lines:[]};
  }
  const w=report.world,t=report.weather;
  const names={healthy:"ATUALIZADA",partial:"PARCIAL",stale:"DESATUALIZADA",unavailable:"INDISPONÍVEL"};
  const lines=[
    "MUNDO // "+names[w.state]+" // coleta há "+formatAge(w.ageMinutes)+
      " // fontes: "+Number(w.sourceCount||0)+"/3.",
    "METEOROLOGIA // "+names[t.state]+" // coleta há "+formatAge(t.ageMinutes)+
      " // amostras recentes: "+Number(t.sampledRegions||0)+"/6."
  ];
  const near=Array.isArray(w.highlights)?w.highlights.filter(e=>e.nearBrazil===true):[];
  if(w.state!=="healthy"&&w.state!=="partial")
    lines.push("Eventos mundiais antigos ou indisponíveis: nenhum destaque deve ser considerado atual.");
  else if(near.length){
    lines.push("PRÓXIMO AO BRASIL // "+Math.min(near.length,6)+
      " evento(s) catalogado(s) entre os destaques. Proximidade não significa impacto.");
  }else{
    lines.push("PRÓXIMO AO BRASIL // nenhum destaque comprovado nesta amostra; cobertura não é integral.");
  }
  for(const event of w.highlights.slice(0,4)){
    if(w.state==="unavailable")break;
    lines.push("REGISTRO "+clean(event.source,14)+" // "+clean(event.title,116)+
      " // publicado "+clean(event.eventAt,30)+(w.state==="stale"?" // DADO ANTIGO":""));
  }
  if(w.state==="healthy"||w.state==="partial"){
    const failed=w.sources.filter(s=>s.status!=="ready").map(s=>clean(s.name,16));
    if(failed.length)lines.push("FONTES NÃO CONFIRMADAS // "+failed.join(", ")+".");
  }
  lines.push("Os mapas e boletins usam fontes específicas. Estes registros não são previsões de risco nem alertas oficiais.");
  const ring="CONTINUIDADE · MUNDO "+names[w.state]+" ("+Number(w.sourceCount||0)+
    "/3) · CLIMA "+names[t.state]+" ("+Number(t.sampledRegions||0)+"/6)";
  return {ok:true,ring,lines,
    text:"CONTINUIDADE // "+lines.slice(0,3).join(" "),
    status:{world:w.state,weather:t.state,worldAt:w.checkedAt||null,
      weatherAt:t.checkedAt||null}};
}
