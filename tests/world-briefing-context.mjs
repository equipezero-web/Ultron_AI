import {deepenNews,meaningfulDescription} from '../backend/news-details.js';
import assert from "node:assert/strict";
import {createWorldBriefing,normalizeWarnings,parseEnsoBulletin,safeNewsImage,findPublisherImage,findPublisherDescription} from "../backend/world-briefing.js";
assert.equal(safeNewsImage("javascript:alert(1)"),null);
assert.equal(safeNewsImage("http://localhost/image.jpg"),null);
assert.equal(safeNewsImage("https://cdn.example.org/image.jpg"),"https://cdn.example.org/image.jpg");
assert.equal(findPublisherImage('<meta content="https://cdn.example.org/article.jpg" property="og:image">'),
  "https://cdn.example.org/article.jpg","Extract an actual publisher OG image regardless of attribute order");
assert.equal(findPublisherImage('<meta content="javascript:alert(1)" property="og:image">'),null);
const detailText="As equipes de defesa civil foram mobilizadas em três municípios após as chuvas intensas. O atendimento inclui abrigos temporários e acompanhamento das áreas de risco.";
assert.ok(findPublisherDescription('<article><p>'+detailText+'</p></article>','Chuvas em municípios').includes('abrigos temporários'));
assert.equal(meaningfulDescription('Chuvas em municípios','Chuvas em municípios'),false);
const now=Date.now(),fresh=new Date(now-30*60*1000).toISOString();
const stale=new Date(now-11*24*60*60*1000).toISOString();
const warning = {
  idunico:"teste-sc-1",descricao:"Tempestades",severidade:"Perigo",
  estados:"SC; PR",data_fim:new Date(now+86400000).toISOString()
};
const parsed=normalizeWarnings({hoje:[warning,warning],futuro:[
  {descricao:"Aviso antigo",severidade:"Perigo",data_fim:stale},
  {descricao:"Onda de calor",severidade:"Perigo Potencial",estados:"PE"}
]},now);
assert.equal(parsed.length,2,"duplicate and expired warnings must be filtered");
assert.equal(parsed[0].title,"Tempestades");
assert.equal(parsed[0].regions[0],"SC");
assert.equal(parsed[0].phase,"vigente");
assert.ok(parsed.some(x=>x.title==="Onda de calor"));
assert.equal(normalizeWarnings({status:"bad"},now).length,0);
const ens=parseEnsoBulletin("<html><body>issued by CLIMATE PREDICTION CENTER/NCEP/NWS 8 October 2026 ENSO Alert System Status: El Niño Advisory Synopsis: El Niño continues to strengthen, with a strong-to-very strong El Niño likely through January-March 2027. Most Niño indices increased.</body></html>");
assert.equal(ens.status,"El Niño Advisory");
const encoded=parseEnsoBulletin("<div>ENSO Alert System Status: El Ni&ntilde;o Advisory</div>");
assert.equal(encoded.status,"El Niño Advisory","NOAA HTML entities must be decoded before reading ENSO status");
assert.equal(ens.issued,"8 October 2026");
assert.ok(ens.synopsis?.includes("El Niño continues"));
assert.equal(parseEnsoBulletin("<html>NO STATUS OR VERIFIED CONTENT</html>"),null);

const realFetch=globalThis.fetch;
let requests=[];
globalThis.fetch=async (url)=>{
  const address=String(url);requests.push(address);
  if(address.includes("apiprevmet3.inmet.gov.br")){
    return {ok:true,json:async()=>({hoje:[warning],futuro:[]})};
  }
  if(address.includes("enso_advisory")){
    return {ok:true,text:async()=>"<html>NOAA Bulletin temporarily unavailable</html>"};
  }
  if(address.includes("weather.gov/twc/enso")){
    return {ok:true,text:async()=>"<html>ENSO Alert System Status: El Niño Advisory Synopsis: El Niño is strengthening. Most Niño indices increased.</html>"};
  }
  if(address.includes("agenciabrasil.ebc.com.br/rss/")){
    const item="<item><title><![CDATA[Atualização internacional da Agência Brasil]]></title>"+
      "<link>https://agenciabrasil.ebc.com.br/internacional/noticia-confirmada</link>"+
      "<enclosure url=\"https://cdn.example.org/rss-photo.jpg\" type=\"image/jpeg\" />"+
      "<pubDate>"+new Date(now-540000).toUTCString()+"</pubDate></item>";
    const extra="<item><title>Reportagem com imagem na página original</title>"+
      "<link>https://agenciabrasil.ebc.com.br/meio-ambiente/sem-imagem-rss</link>"+
      "<pubDate>"+new Date(now-420000).toUTCString()+"</pubDate></item>";
    return {ok:true,text:async()=>"<rss><channel>"+item+extra+"</channel></rss>"};
  }
  if(address.includes("agenciabrasil.ebc.com.br/meio-ambiente/sem-imagem-rss")){
    return {ok:true,headers:{get:()=> "text/html; charset=utf-8"},
      text:async()=>'<html><head><meta property="og:image" content="https://cdn.example.org/original-report-photo.jpg"></head></html>'};
  }
  if(address.includes("gdeltproject.org")){
    const title="Notícia verificada recente de teste";
    return {ok:true,json:async()=>({articles:[
      {title,url:"https://agenciabrasil.ebc.com.br/noticias/noticia-teste",domain:"agenciabrasil.ebc.com.br",seendate:fresh,socialimage:"https://cdn.example.org/gdelt-photo.jpg"},
      {title:"Boato antigo",url:"https://example.org/old",domain:"example.org",seendate:stale}
    ]})};
  }
  if(address.includes("news.google.com")){
    const xml="<rss><channel><item><title>Outro fato verificado</title><link>https://example.org/fato-recente</link><source>Jornal exemplo</source><pubDate>"+new Date(now-600000).toUTCString()+"</pubDate></item></channel></rss>";
    return {ok:true,text:async()=>xml};
  }
  throw Error("Unexpected fetch "+address);
};
try {
  const briefing=await createWorldBriefing({now});
  assert.equal(briefing.ok,true);
  assert.equal(briefing.topics.length,10);
  assert.ok(briefing.topics.some(t=>t.id==="oceania"));
  assert.ok(briefing.topics.some(t=>t.id==="africa"));
  assert.equal(briefing.priority[0],"Brasil");
  assert.equal(briefing.priority[1],"Santa Catarina");
  assert.ok(briefing.topics[0].articles.length>=2,"Live and official RSS can provide extra verified headlines");
  assert.ok(briefing.topics.every(item=>item.articles.every(article=>Date.parse(article.publishedAt)>=now-7*24*60*60*1000)));
  assert.equal(briefing.topics[0].articles.some(article=>article.title==="Boato antigo"),false);
  assert.ok(briefing.topics[0].articles.some(article=>article.imageUrl==="https://cdn.example.org/gdelt-photo.jpg"),
    "GDELT article image must reach the verified bulletin");
  assert.ok(briefing.topics.find(t=>t.id==="mundo").articles.some(article=>article.imageUrl==="https://cdn.example.org/rss-photo.jpg"),
    "Official RSS enclosure image must reach the verified bulletin");
  assert.ok(briefing.topics.some(t=>t.articles.some(article=>
    article.imageUrl==="https://cdn.example.org/original-report-photo.jpg")),
    "Official Agency Brasil article page must supply photo when RSS lacks one");
  assert.equal(briefing.alerts.checked,true);
  assert.equal(briefing.alerts.warnings[0].title,"Tempestades");
  assert.equal(briefing.enso.bulletin.status,"El Niño Advisory");
  assert.equal(briefing.enso.bulletin.source,"NOAA / Climate Prediction Center");
  assert.ok(briefing.topics.find(x=>x.id==="mundo").articles.some(x=>x.source==="Agência Brasil"),"International RSS must be accepted when recent");
  assert.ok(briefing.enso.bulletin.url.includes("weather.gov/twc/enso"),"NOAA secondary official source must be used when primary cannot be parsed");
  assert.ok(requests.some(q=>q.includes("news.google.com/rss/search")));
  assert.ok(requests.some(q=>q.includes("apiprevmet3.inmet.gov.br")));
  assert.ok(requests.some(q=>q.includes("enso_advisory")));
  globalThis.fetch=async(input,init)=>{
    assert.ok(String(input).endsWith('/search'),'Detailed news must use text search only');
    return new Response(JSON.stringify({organic:[
      {title:'Defesa Civil mobiliza equipes após chuvas intensas',link:'https://example.org/defesa-civil',snippet:detailText},
      {title:'Mercado financeiro abre em alta',link:'https://example.org/mercado',snippet:'Informação completamente diferente. Este texto não deve aparecer na notícia sobre as equipes mobilizadas.'}
    ]}),{status:200});
  };
  const [detail]=await deepenNews({SERPER_API_KEY:'mock'},[{title:'Defesa Civil mobiliza equipes após chuvas intensas',description:'Defesa Civil mobiliza equipes após chuvas intensas'}]);
  assert.equal(detail.status,'detailed');
  assert.ok(detail.description.includes('abrigos temporários'));
  assert.equal(detail.sources[0].url,'https://example.org/defesa-civil');
  assert.ok(!detail.description.includes('Mercado financeiro'));
  console.log("WORLD BRIEFING PASS: sourced Brazil/SC/climate/world, freshness filters, INMET warnings, NOAA status and official links");
}finally{globalThis.fetch=realFetch;}
