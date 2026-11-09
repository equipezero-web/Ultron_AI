import assert from "node:assert/strict";
import {HISTORY_WINDOW_MS,mergeIntelligenceHistory,selectWakeIntelligence}
  from "../backend/world-intelligence-history.js";

const now=Date.parse("2026-11-09T18:00:00.000Z");
const at=ms=>new Date(ms).toISOString();
const article=(title,url,age)=>({
  title,url,publishedAt:at(now-age),source:"Agência de testes"
});
const result={
  ok:true,partial:false,hasNews:true,
  topics:[
    {id:"brasil",articles:[
      article("Brasil: chuva e alagamentos","https://example.org/br1?utm_source=feed",35*60000),
      article("Notícia antiga","https://example.org/old",30*60*60000)
    ]},
    {id:"santa-catarina",articles:[
      article("Tempestades em Santa Catarina","https://example.org/sc1",50*60000)
    ]},
    {id:"mundo",articles:[
      article("Novidade internacional","https://example.org/world",40*60000)
    ]},
    {id:"asia",articles:[
      article("Atualização na Ásia","https://example.org/asia",45*60000)
    ]}
  ],
  alerts:{
    checked:true,warnings:[
      {title:"Chuvas Intensas",severity:"Perigo",endsAt:at(now+3600000),url:"https://avisos.inmet.gov.br/"},
      {title:"Aviso expirado",severity:"Perigo",endsAt:at(now-3600000),url:"https://avisos.inmet.gov.br/"}
    ]
  },
  enso:{checked:true,bulletin:{
    status:"El Niño Advisory",issued:"8 October 2026",
    url:"https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.html"
  }}
};
const initial=mergeIntelligenceHistory(null,result,{now});
assert.equal(initial.ok,true);
assert.equal(initial.windowHours,24);
assert.equal(initial.checkCount,1);
assert.equal(initial.events.length,4,"Old (>24h) news must not enter the archive");
assert.ok(initial.events.every(e=>e.publishedAt&&e.firstSeenAt&&e.url));
assert.ok(initial.events.some(e=>e.category==="asia"));
const waking=selectWakeIntelligence(initial,{now,lastWakeAt:at(now-60*60000),limit:8});
assert.equal(waking.unseenCount,4);
assert.equal(waking.checks24h,1);
assert.equal(waking.alertStatus,"recently-checked");
assert.equal(waking.alerts.length,1,"Expired warning must not be reported as current");
assert.equal(waking.enso.status,"El Niño Advisory");
assert.equal(waking.highlights[0].category,"brasil","Brazil has priority in the wake summary");
assert.equal(waking.highlights[1].category,"santa-catarina","Santa Catarina has priority in the wake summary");

const later=now+15*60000;
const repeated={
  ...result,
  topics:result.topics.map(g=>({
    ...g,
    articles:g.articles.map(a=>({...a,url:a.url.replace("?utm_source=feed","")}))
  }))
};
const second=mergeIntelligenceHistory(initial,repeated,{now:later});
assert.equal(second.events.length,4,"Repeat sources and tracker URLs must not duplicate events");
assert.equal(second.checkCount,2);
assert.ok(second.events.every(e=>Date.parse(e.firstSeenAt)===now));
const noNews=selectWakeIntelligence(second,{now:later,lastWakeAt:at(now+3000)});
assert.equal(noNews.unseenCount,0,"Wake-up must not repeat old headlines as new");
assert.ok(noNews.total24h>=4);
const nextDay=mergeIntelligenceHistory(second,{ok:true,topics:[],alerts:{checked:false},enso:{checked:false}},{
  now:now+HISTORY_WINDOW_MS+30*60000
});
assert.equal(nextDay.events.length,0,"The archive keeps only the rolling 24h period");
assert.equal(nextDay.checks.length,1,"Monitoring checks also roll forward");
assert.equal(nextDay.latest.alerts.checked,false,"Failed official source must not retain a current-alert label");
const stale=selectWakeIntelligence(nextDay,{now:now+HISTORY_WINDOW_MS+3*60*60000});
assert.equal(stale.alertStatus,"not-currently-verified");

console.log("24H WORLD MONITOR PASS: rolling history, event dedup, region coverage, wake delta, alerts, old-news removal");
