import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--enable-unsafe-swiftshader']
});
try {
  for(const viewport of [
    {width:390,height:844,isMobile:true,hasTouch:true},
    {width:1366,height:768},
    {width:1920,height:1080}
  ]){
    const page=await browser.newPage();
    await page.setViewport(viewport);
    // Use a deterministic local response for test pictures rather than
    // depending on example.org or the external network.
    await page.setRequestInterception(true);
    let weatherProxyOffline=false;
    let globalBackendOffline=false;
    let weatherCityBackendOffline=false;
    let watchSaved=false;
    page.on('request',req=>{
      if(weatherProxyOffline&&(/\/api\/geo\/(global|locations)/.test(req.url()))){
        return req.respond({status:404,headers:{'access-control-allow-origin':'*'},contentType:'application/json',
          body:JSON.stringify({error:'Rota não encontrada'})});
      }
      if(req.url().includes('geocoding-api.open-meteo.com/v1/search')){
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',
          body:JSON.stringify({results:[{id:1850147,name:'Tokyo',latitude:35.6895,longitude:139.6917,
            country:'Japan',country_code:'JP',admin1:'Tokyo',timezone:'Asia/Tokyo'}]})});
      }
      if(req.url().includes('api.open-meteo.com/v1/forecast')&&
         new URL(req.url()).searchParams.get('latitude')==='-8.0476'){
        const offset=-3*60*60*1000,local=new Date(Date.now()+offset);
        const midnight=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate());
        const dates=Array.from({length:3},(_,i)=>new Date(midnight+i*86400000).toISOString().slice(0,10));
        const payload={
          current:{time:local.toISOString().slice(0,16),temperature_2m:29,
            relative_humidity_2m:72,precipitation:0},
          daily:{time:dates,temperature_2m_min:[23,24,23],
            temperature_2m_max:[31,32,30],precipitation_sum:[2,5,1],
            precipitation_probability_max:[40,65,20]}
        };
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify(payload)});
      }
      if(req.url().includes('api.open-meteo.com/v1/forecast')){
        const offset=9*3600000,local=new Date(Date.now()+offset);
        const midnight=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate());
        const dates=Array.from({length:16},(_,i)=>new Date(midnight+i*86400000).toISOString().slice(0,10));
        const payload={utc_offset_seconds:32400,
          current:{time:local.toISOString().slice(0,16),temperature_2m:18.2,relative_humidity_2m:64,
            precipitation:0,wind_speed_10m:10},
          daily:{time:dates,temperature_2m_min:Array(16).fill(12),temperature_2m_max:Array(16).fill(23),
            precipitation_sum:Array(16).fill(2.5),precipitation_probability_max:Array(16).fill(40)}};
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',
          body:JSON.stringify(payload)});
      }

      // Official meteorological center: deterministic station measurements and
      // remote viewers, without depending on third-party network during tests.
      if(req.url().includes('geoportal.apac.pe.gov.br/server/rest/services/met_monitoramento_chuvas_pe/MapServer/8/query')){
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify({type:'FeatureCollection',features:[{
            type:'Feature',geometry:{type:'Polygon',coordinates:[
              [[-41,-9.5],[-35.1,-9.1],[-34.8,-8],[-37.5,-7.2],[-41,-9.5]]
            ]}
          }]})});
      }
      if(req.url().startsWith('https://geoportal.apac.pe.gov.br/server/rest/services/met_monitoramento_chuvas_pe/MapServer/')){
        const payload={features:[
          {attributes:{objectid:1,nome:"Recife",municipio:"Recife",latitude:-8.0476,
            longitude:-34.877,horas_24:31,ultima_leitura_data_hora:"2026-11-12 10:00"}},
          {attributes:{objectid:2,nome:"Olinda",municipio:"Olinda",latitude:-7.99,
            longitude:-34.85,horas_24:3,ultima_leitura_data_hora:"2026-11-12 10:00"}},
          {attributes:{objectid:3,nome:"Petrolina",municipio:"Petrolina",latitude:-9.4,
            longitude:-40.5,horas_24:0,ultima_leitura_data_hora:"2026-11-12 10:00"}}
        ]};
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify(payload)});
      }
      if(/^(?:https:\/\/sigma\.cptec\.inpe\.br\/radar\/|https:\/\/www\.cptec\.inpe\.br\/dsat\/|https:\/\/mapas\.inmet\.gov\.br\/)/.test(req.url()))
        return req.respond({status:200,contentType:'text/html',body:'<!doctype html><title>Official viewer mock</title>'});
      if(req.url().startsWith('https://api.rainviewer.com/public/weather-maps.json')){
        const now=Math.floor(Date.now()/1000);
        const times=Array.from({length:6},(_,i)=>({
          time:now-(6-i)*600,path:'/v2/radar/abc'+String(i).padStart(6,'0')
        }));
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify({
            version:'2.0',host:'https://tilecache.rainviewer.com',
            radar:{past:times,nowcast:[]},satellite:{infrared:[]}
          })});
      }
      if(req.url().startsWith('https://tilecache.rainviewer.com/v2/radar/')||
         req.url().startsWith('https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/')){
        const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==','base64');
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
          contentType:'image/png',body:png});
      }
      if(req.url().startsWith('https://apitempo.inmet.gov.br/estacoes/T')){
        const payload=[
          {CD_ESTACAO:'A001',DC_NOME:'Recife',SG_ESTADO:'PE',
            VL_LATITUDE:'-8.05',VL_LONGITUDE:'-34.88',CD_SITUACAO:'Operante'},
          {CD_ESTACAO:'A002',DC_NOME:'Olinda',SG_ESTADO:'PE',
            VL_LATITUDE:'-8.0',VL_LONGITUDE:'-34.85',CD_SITUACAO:'Pane'}
        ];
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify(payload)});
      }
      if(req.url().includes('youtube-nocookie.com/embed/'))return req.respond({status:200,contentType:'text/html',body:'<html><body>Test video player</body></html>'});
      if(req.url().includes('/api/orchestrator/')){
        const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type, authorization'};
        if(req.method()==='OPTIONS')return req.respond({status:204,headers});
        return req.respond({status:200,headers,contentType:'application/json',body:JSON.stringify({ok:true,runId:'test-run',plan:{complex:false},runs:[]})});
      }
      if(req.url().includes('/api/geo/insight')){
        const p=new URL(req.url()),type=p.searchParams.get('type');
        const location={id:1850147,key:'global-1850147',name:'Tokyo',country:'Japan',countryCode:'JP',
         region:'Tokyo',lat:35.6895,lng:139.6917,label:'Tokyo, Tokyo, Japan'};
        const response={ok:true,type,location,fetchedAt:'2026-11-11T12:00:00Z',
         source:{name:'Open-Meteo / CAMS',url:'https://open-meteo.com/en/docs/air-quality-api',
          kind:'air-quality-model',disclaimer:'Previsão de modelo não é um sensor oficial'},
         metrics:[{label:'PM2.5',value:12,unit:'µg/m³'}],series:[],bulletins:[]};
        if(type==='alerts'){response.coverage='not-integrated';response.metrics=[];response.source={
          name:'Nenhuma fonte oficial integrada',url:null,disclaimer:'Não significa ausência de avisos.'};}
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',
         body:JSON.stringify(response)});
      }
      if(req.url().includes('/api/geo/watchlist/configure')){
        const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type'};
        if(req.method()==='OPTIONS')return req.respond({status:204,headers});
        const body=JSON.parse(req.postData()||'{}');
        assert.ok(typeof body.memoryKey==='string'&&body.memoryKey.length>=32);
        assert.equal(body.id,1850147);
        watchSaved=body.action==='add';
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
         contentType:'application/json',body:JSON.stringify({ok:true,action:body.action})});
      }
      if(req.url().endsWith('/api/geo/watchlist')){
        const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type'};
        if(req.method()==='OPTIONS')return req.respond({status:204,headers});
        const body=JSON.parse(req.postData()||'{}');
        assert.ok(body.memoryKey?.length>=32);
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
         contentType:'application/json',
         body:JSON.stringify({ok:true,cadenceHours:3,
           watches:watchSaved?[{location_id:1850147,name:'Tokyo',country:'Japan',last_checked_at:null}]:[],
           history:[]})});
      }
      if(req.url().includes('/api/intelligence/global')&&globalBackendOffline){
        return req.respond({status:503,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify({
            ok:false,error:'Primeira coleta D1 ainda não registrada'})});
      }
      if(globalBackendOffline&&req.url().startsWith(
         'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson')){
        const at=Date.now()-15*60000;
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify({type:'FeatureCollection',features:[{
            id:'us-test-fallback',type:'Feature',geometry:{type:'Point',coordinates:[-35,-8]},
            properties:{time:at,updated:at,mag:5.6,title:'Terremoto publicado (teste)',
            place:'Pernambuco',url:'https://earthquake.usgs.gov/earthquakes/eventpage/us-test-fallback'}
          }]})});
      }
      if(globalBackendOffline&&req.url().startsWith(
        'https://eonet.gsfc.nasa.gov/api/v3/events/geojson')){
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify({type:'FeatureCollection',features:[{
            id:'EONET-test',type:'Feature',
            geometry:{type:'Point',coordinates:[-38,-9]},
            properties:{id:'EONET-test',title:'Incêndio natural catalogado (teste)',
              date:new Date().toISOString(),categories:[{id:'wildfires'}],
              link:'https://eonet.gsfc.nasa.gov/api/v3/events/EONET-test'}
          }]})});
      }
      if(globalBackendOffline&&req.url().includes(
          'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH')){
        return req.respond({status:503,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify({error:'Fonte indisponível'})});
      }
      if(req.url().includes('/api/intelligence/global')){
        const time=new Date().toISOString();
        const events=[
         {id:'usgs:smoke-1',source:'usgs',kind:'earthquake',
          title:'Sismo registrado pelo USGS',description:'Magnitude 5.5 observada.',
          lat:-8,lng:-35,nearBrazil:true,eventAt:time,
          url:'https://earthquake.usgs.gov/earthquakes/eventpage/us123'},
         {id:'nasa:smoke-2',source:'nasa',kind:'wildfires',
          title:'Evento natural publicado NASA EONET',description:'Evento da NASA.',
          lat:40,lng:-110,nearBrazil:false,eventAt:time,
          url:'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_100'},
         {id:'gdacs:tc:smoke-3',source:'gdacs',kind:'severeStorms',
          title:'Ciclone monitorado pelo GDACS',description:'Alerta oficial GDACS.',
          lat:14,lng:140,nearBrazil:false,eventAt:time,gdacsAlert:'red',
          url:'https://www.gdacs.org/report.aspx?eventid=100&eventtype=TC'}
        ];
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify({ok:true,
          checkedAt:time,partial:false,stale:false,eventCount:3,events,
          sourceStatus:[
           {source:'usgs',ok:true,count:1},
           {source:'nasa',ok:true,count:1},
           {source:'gdacs',ok:true,count:1}
          ],disclaimer:'Publicações verificadas, não previsão de riscos.'})});
      }
      if(req.url().includes('/api/geo/monitor')){
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',
         body:JSON.stringify({ok:true,checkedAt:'2026-11-11T12:00:00Z',cadenceHours:3,
           regions:[{name:'Recife',temperatureC:29,rainMm:5,rainChancePercent:80}],
           disclaimer:'Amostras de localidades, não do planeta inteiro'})});
      }
      if(req.url().includes('/api/geo/locations')){
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
         contentType:'application/json',body:JSON.stringify({ok:true,query:'Tokyo',
           locations:[{id:1850147,key:'global-1850147',name:'Tokyo',country:'Japan',region:'Tokyo',
             countryCode:'JP',lat:35.6895,lng:139.6917,label:'Tokyo, Tokyo, Japan'}]})});
      }
      if(req.url().includes('/api/geo/global')){
        const location={id:1850147,key:'global-1850147',name:'Tokyo',country:'Japan',countryCode:'JP',
          region:'Tokyo',lat:35.6895,lng:139.6917,label:'Tokyo, Tokyo, Japan',timezone:'Asia/Tokyo'};
        const payload={
          ok:true,kind:'global-short-term-forecast',location,fetchedAt:'2026-11-11T12:00:00.000Z',
          current:{time:'2026-11-11T21:00',temperatureC:18.2,humidityPercent:64,precipitationMm:0,windKmh:10},
          days:Array.from({length:16},(_,i)=>({date:'2026-11-'+String(i+11).padStart(2,'0'),
            minC:12,maxC:23,rainMm:2.5,rainChancePercent:40})),
          source:{name:'Open-Meteo.com e GeoNames',url:'https://open-meteo.com/en/docs',
            basePeriod:'test',disclaimer:'Previsão de modelo, não é alerta oficial.'}
        };
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
         contentType:'application/json',body:JSON.stringify(payload)});
      }
      if(req.url().includes('raw.githubusercontent.com/nvkelso/natural-earth-vector')){
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
         contentType:'application/geo+json',
         body:JSON.stringify({type:'FeatureCollection',features:[
           {type:'Feature',properties:{ADM0_A3:'BRA',ADMIN:'Brazil'},
             geometry:{type:'Polygon',coordinates:[[[-74,5],[-34,5],[-34,-34],[-74,-34],[-74,5]]]}},
           {type:'Feature',properties:{ADM0_A3:'USA',ADMIN:'United States'},
             geometry:{type:'Polygon',coordinates:[[[-122,48],[-66,48],[-66,24],[-122,24],[-122,48]]]}}
         ]})});
      }
      if(req.url().includes('/api/geo/world')){
        const u=new URL(req.url()),topic=u.searchParams.get('topic'),region=u.searchParams.get('region')||'world';
        const index=['population','gdp','co2'].includes(topic);
        const report={
          ok:true,topic,region,recordCount:2,
          dataset:{
            id:'world-'+topic+'-'+region,
            title:index?(topic==='population'?'População por país':'PIB nominal por país'):topic==='earthquakes'?'Terremotos mundiais':'Queimadas e incêndios observados',
            projection:region,source:{
              name:index?'Banco Mundial — World Development Indicators':topic==='earthquakes'?'USGS':'NASA EONET',
              url:index?'https://data.worldbank.org/':topic==='earthquakes'?
                'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php':'https://eonet.gsfc.nasa.gov/',
              basePeriod:index?'2024 a 2025':'Últimos 7 dias',
              disclaimer:index?'Valores anuais, não medições em tempo real.':'Eventos geolocalizados, não mapa de riscos.'
            },
            theme:{
              topic,
              kind:index?'country-indicator':'events',
              coloredBy:index?'national-annual-indicator':topic==='earthquakes'?
                'earthquake-magnitude':'event-category',unit:index?'habitantes':'M',
              legend:index?[{color:'#d05a67',label:'População alta'},{color:'#63a5bf',label:'População moderada'}]:
                [{color:'#78b6dc',label:'M4,5–4,9'},{color:'#d94f63',label:'M6,5–6,9'}],
              countryValues:index?{
                BRA:{value:215000000,color:'#d05a67',year:'2025'},
                USA:{value:330000000,color:'#63a5bf',year:'2024'}
              }:null
            },
            frames:[{id:'observed',name:index?'2024–2025':'últimos dias',
              type:index?'indicadores anuais':'registros oficiais',kind:'observed',
              description:index?'Valores publicados por país.':'Epicentros e ocorrências catalogadas.',
              points:index?[
                {id:'country-BRA',name:'Brasil',lat:-15.8,lng:-47.8,kind:'indicator',color:'#d05a67',
                  detail:'215 milhões em 2025',value:215000000,unit:'habitantes',
                  source:'https://data.worldbank.org/indicator/SP.POP.TOTL'},
                {id:'country-USA',name:'Estados Unidos',lat:38.9,lng:-77,kind:'indicator',color:'#63a5bf',
                  detail:'330 milhões em 2024',value:330000000,unit:'habitantes',
                  source:'https://data.worldbank.org/indicator/SP.POP.TOTL'}]:[
                {id:'ev1',name:'Ocorrência A',lat:-8,lng:-48,kind:topic==='earthquakes'?'earthquake':'wildfires',
                  color:'#78b6dc',detail:'Epicentro ou ocorrência observada',value:4.8,unit:'M',
                  source:'https://earthquake.usgs.gov/'},
                {id:'ev2',name:'Ocorrência B',lat:36,lng:139,kind:topic==='earthquakes'?'earthquake':'wildfires',
                  color:'#d94f63',detail:'Epicentro ou ocorrência observada',value:6.7,unit:'M',
                  source:'https://earthquake.usgs.gov/'}
              ]
            }]
          }
        };
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify(report)});
      }
      if(req.url().includes('/api/geo/intensity')){
        const u=new URL(req.url()),layer=u.searchParams.get('layer')||'rain';
        const region=u.searchParams.get('region')||'brazil',day=Number(u.searchParams.get('day')||'0');
        const samples=region==='world'?40:35,cols=region==='world'?8:7,rows=5,
         west=region==='world'?-180:-74,east=region==='world'?180:-34,
         north=region==='world'?60:6,south=region==='world'?-60:-34;
        const values=Array.from({length:samples},(_,i)=>{
          const row=Math.floor(i/cols),col=i%cols,dx=(east-west)/cols,dy=(north-south)/rows;
          const bounds=[west+dx*col,north-dy*(row+1),west+dx*(col+1),north-dy*row];
          const lat=(bounds[1]+bounds[3])/2,lng=(bounds[0]+bounds[2])/2;
          return {id:region+'-'+row+'-'+col,lat,lng,bounds,
            value:day*8+i*2,color:i%2?'#3276f1':'#e24b9b',
            label:i%2?'2,5–10 mm':'>50 mm',time:'2026-11-'+String(11+day).padStart(2,'0'),unit:'mm/dia'};
        });
        const legend=[{color:'#3c5571',label:'Sem chuva'},{color:'#3276f1',label:'Moderada'},
          {color:'#e24b9b',label:'Intensa'}];
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify({ok:true,layer,region,day,
            label:layer==='rain'?'Chuva prevista':'Intensidade do modelo',unit:'mm/dia',
            dataTime:'2026-11-'+String(11+day).padStart(2,'0'),
            sampledCount:samples,totalSamples:samples,cells:values,legend,
            source:{name:'Open-Meteo — previsão numérica',url:'https://open-meteo.com/en/docs'},
            disclaimer:'Valores em pontos fixos, não radar.'})});
      }
      if(req.url().includes('/api/geo/weather')){
        if(weatherCityBackendOffline)return req.respond({status:503,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify({ok:false,error:'Não foi possível consultar o provedor meteorológico.'})});

        const payload={
          ok:true,city:{key:'recife',name:'Recife',lat:-8.0476,lng:-34.877},
          fetchedAt:'2026-11-11T12:00:00.000Z',
          current:{time:'2026-11-11T09:00',temperatureC:29,humidityPercent:75,precipitationMm:0},
          days:[
            {date:'2026-11-11',minC:24,maxC:31,rainMm:1.1,rainChancePercent:30},
            {date:'2026-11-12',minC:23,maxC:30,rainMm:12,rainChancePercent:85},
            {date:'2026-11-13',minC:24,maxC:32,rainMm:0,rainChancePercent:10}
          ],source:{name:'Open-Meteo',url:'https://open-meteo.com/en/docs'},kind:'short-term-numeric-forecast'
        };
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},
          contentType:'application/json',body:JSON.stringify(payload)});
      }
      if(req.url().includes('/api/ai')){
        const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type, authorization'};
        if(req.method()==='OPTIONS')return req.respond({status:204,headers});
        return req.respond({status:200,headers,contentType:'application/json',body:JSON.stringify({text:'Resposta real do fluxo de comando: China',provider:'mock',visualContext:{images:[{src:'https://example.org/picture.jpg',alt:'China'}],videos:[{id:'dQw4w9WgXcQ',title:'Vídeo de teste',thumbnail:'https://example.org/picture.jpg',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}],cards:[{title:'China',url:'https://example.org/report'}]}})});
      }
      if(/^https:\/\/example\.org\/(picture|news)\.jpg$/.test(req.url()))
        return req.respond({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="420" height="280"><rect width="420" height="280" fill="#406b92"/></svg>'});
      if(req.url().includes('servicodados.ibge.gov.br/api/v3/malhas/paises/BR')){
        return req.respond({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/geo+json',
          body:JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[
            [[-72,3],[-52,5],[-36,-5],[-40,-23],[-50,-34],[-57,-30],[-67,-9],[-72,3]]
          ]}}]})});
      }
      return req.continue();
    });
    await page.goto('http://127.0.0.1:8766/'+(viewport.width===1920?'?display=tv':''),{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>Boolean(window.ULTRON_NEURAL_ANSWER),{timeout:12000});
    const initial=await page.evaluate(()=>({
      hidden:document.querySelector('.ultron-neural-answer').hidden,
      newsHidden:getComputedStyle(document.querySelector('.jarvis-neural-news')).display==='none',
      ring:!!document.querySelector('#jarvis-cc-canvas')
    }));
    assert.equal(initial.hidden,true,'Response starts hidden');
    assert.equal(initial.newsHidden,true,'News overlay must be absent at startup');
    assert.ok(initial.ring,'Neural Ring remains mounted');
    await page.evaluate(()=>{
      window.dispatchEvent(new CustomEvent('ultron:question-start',{detail:{id:10,question:'Qual o clima?'}}));
      window.dispatchEvent(new CustomEvent('ultron:answer',{detail:{
        id:10,text:'Resposta confirmada',webResearch:{sources:[{source:'Fonte oficial',url:'https://example.org/report'}]},
        visualContext:{images:[{src:'https://example.org/picture.jpg',alt:'Foto da fonte'}]}
      }}));
    });
    const answered=await page.evaluate(()=>({
      hidden:document.querySelector('.ultron-neural-answer').hidden,
      text:document.querySelector('.ultron-neural-answer-text').textContent,
      image:document.querySelectorAll('.ultron-neural-answer-media img').length,
      source:document.querySelector('.ultron-neural-answer-sources a')?.href,
      overflow:document.documentElement.scrollWidth-innerWidth,
      anchored:(()=>{
        const panel=document.querySelector('.ultron-neural-answer');
        const ring=document.querySelector('.jarvis-cc-center');
        const p=panel.getBoundingClientRect(),c=ring.getBoundingClientRect();
        return {
          inside:panel.parentElement===ring,
          position:getComputedStyle(panel).position,
          centerTop:c.top,panelTop:p.top,
          panelBottom:p.bottom,centerBottom:c.bottom,
          horizontal:p.left>=c.left-3&&p.right<=c.right+3,
          vertical:p.top>=c.top-3&&p.bottom<=c.bottom+3
        };
      })()
    }));
    assert.equal(answered.hidden,false);
    assert.equal(answered.text,'Resposta confirmada');
    assert.equal(answered.image,1);
    await page.waitForFunction(()=>document.querySelector('.ultron-neural-answer-media img')?.naturalWidth===420,{timeout:6000});
    const presentation=await page.$eval('.ultron-neural-answer',el=>({
      layout:el.dataset.layout,columns:getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length
    }));
    if(viewport.width<=820){
      assert.equal(presentation.layout,'compact','Phone must use an accessible stacked response');
      assert.equal(presentation.columns,1,'Phone text and visual lanes must stack instead of squeezing');
    }else assert.ok(presentation.columns>=2,'Laptop/TV text and visual lanes must occupy separate columns');
    const compactPhoto=await page.$eval('.ultron-image-card > img',el=>({
      width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,
      parent:el.parentElement.className
    }));
    assert.ok(Math.abs(compactPhoto.width-compactPhoto.height)<=2,JSON.stringify(compactPhoto));
    assert.ok(compactPhoto.width<=185,'Images must stay compact and square, never cover the stage');
    assert.equal(answered.anchored.inside,true,'Answers must belong to 3D neural stage');
    assert.equal(answered.anchored.position,'absolute','Never flow to the page bottom');
    assert.equal(answered.anchored.horizontal,true,JSON.stringify(answered.anchored));
    assert.equal(answered.anchored.vertical,true,JSON.stringify(answered.anchored));
    assert.ok(answered.source.includes('example.org/report'));
    assert.ok(answered.overflow<=3,'Response must not overflow viewport');
    const newsPicture=await page.evaluate(()=>{
      window.dispatchEvent(new CustomEvent('ultron:intelligence-visual-update',{
        detail:{waking:true,briefing:{topics:[{id:'brasil',articles:[{
          title:'Boletim verificado',description:'Descrição confirmada da notícia',source:'Agência pública',
          url:'https://example.org/news',imageUrl:'https://example.org/news.jpg'
        }]}]}}
      }));
      return document.querySelector('.ultron-neural-answer-media img')?.getAttribute('src');
    });
    assert.ok(await page.$eval('.ultron-news-intro',el=>el.textContent.includes('JARVIS ativado')));
    assert.equal(await page.$eval('.ultron-news-story h3',el=>el.textContent),'Boletim verificado');
    assert.equal(await page.$eval('.ultron-news-story p',el=>el.textContent),'Descrição confirmada da notícia');
    assert.equal(await page.$eval('.ultron-image-card figcaption strong',el=>el.textContent),'Boletim verificado');
    assert.match(await page.$eval('.ultron-image-card figcaption',el=>el.textContent),/Agência pública/);
    assert.equal(newsPicture,'https://example.org/news.jpg','Wake news must mount publisher image inside ring');
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('ultron:speech-start',{detail:{source:'intelligence-wake',text:'Resumo de notícias falado'}})));
    assert.equal(await page.$eval('.ultron-news-story h3',el=>el.textContent),'Boletim verificado','Narration must preserve the structured report');
    await page.click('.ultron-neural-answer-close');
    const closed=await page.evaluate(()=>{
      const box=document.querySelector('.ultron-neural-answer'),button=document.querySelector('.ultron-neural-answer-close');
      const rect=button.getBoundingClientRect();
      const at=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
      return {hidden:box.hidden,layout:box.dataset.layout,at:at?.className||at?.tagName,buttonRect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
      style:{display:getComputedStyle(button).display,pointer:getComputedStyle(button).pointerEvents,z:getComputedStyle(button).zIndex}};
    });
    assert.equal(closed.hidden,true,JSON.stringify(closed));
    await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('ultron:speech-start',{detail:{source:'intelligence-wake',text:'Narração atrasada'}}));window.dispatchEvent(new CustomEvent('ultron:answer',{detail:{id:10,text:'Resposta atrasada'}}));});
    assert.equal(await page.$eval('.ultron-neural-answer',el=>el.hidden),true,'Closing must suppress late speech and answers');
    // Exercise the real command path (not just synthetic answer events).
    await page.evaluate(()=>{
      const input=document.querySelector('#command-input');
      input.value='Como anda o governo da China atualmente?';
      document.querySelector('#btn-send').click();
    });
    try{
      await page.waitForFunction(()=>document.querySelector('.ultron-neural-answer-text')?.textContent==='Resposta real do fluxo de comando: China',{timeout:12000});
    }catch(error){
      console.error('COMMAND FLOW DIAGNOSTICS',JSON.stringify(await page.evaluate(()=>({
        text:document.querySelector('.ultron-neural-answer-text')?.textContent,
        terminal:document.querySelector('#output-box')?.textContent?.slice(-1800),
        route:window.ULTRON_ORCHESTRATOR?.state?.lastRoute,
        busy:window.ULTRON_ORCHESTRATOR?.state?.busy,
        core:!!window.ULTRON_CORE
      }))));
      throw error;
    }
    const ctx=await page.evaluate(()=>window.ULTRON_TASK_CONTEXT?.snapshot());
    assert.ok(ctx?.lastPublicQuestion?.includes('governo da China'),JSON.stringify(ctx));
    const followupRequest=page.waitForRequest(req=>req.url().includes('/api/ai')&&req.method()==='POST'&&req.postData()?.includes('"message":"E no Japão?"'),{timeout:12000});
    await page.evaluate(()=>{document.querySelector('#command-input').value='E no Japão?';document.querySelector('#btn-send').click();});
    const followupBody=JSON.parse((await followupRequest).postData());
    assert.equal(followupBody.taskContext?.followup,true);
    assert.ok(followupBody.taskContext?.lastQuestion?.includes('governo da China'));
    assert.equal(followupBody.taskContext?.region,'japao');
    await page.waitForFunction(()=>!window.ULTRON_ORCHESTRATOR?.state?.busy,{timeout:12000});
    assert.ok(await page.$eval('.ultron-neural-answer-media img',el=>el.src.includes('example.org/picture.jpg')));
    const mediaLayout=await page.evaluate(()=>{
      const images=document.querySelector('.ultron-media-images');
      const videos=document.querySelector('.ultron-media-videos');
      const image=images?.querySelector('.ultron-image-card > img');
      const player=videos?.querySelector('.ultron-media-play > img');
      const info=images?.querySelector('.ultron-image-card figcaption');
      const videoInfo=videos?.querySelector('.ultron-video-info strong');
      const pi=image?.getBoundingClientRect(),pv=player?.getBoundingClientRect();
      return {imageSection:!!images,videoSection:!!videos,distinct:images?.parentElement===videos?.parentElement&&images!==videos,
       imageSquare:Math.abs(pi?.width-pi?.height)<=2,imageWidth:pi?.width,videoRatio:pv?.width/pv?.height,
       videoBelow:images?.getBoundingClientRect().bottom<=videos?.getBoundingClientRect().top+2,
       imageInfo:info?.textContent,videoInfo:videoInfo?.textContent,
       overflow:document.documentElement.scrollWidth-innerWidth};
    });
    assert.ok(mediaLayout.imageSection&&mediaLayout.videoSection&&mediaLayout.distinct,JSON.stringify(mediaLayout));
    assert.ok(mediaLayout.imageSquare&&mediaLayout.imageWidth<=185,JSON.stringify(mediaLayout));
    assert.ok(Math.abs(mediaLayout.videoRatio-16/9)<0.08,JSON.stringify(mediaLayout));
    assert.ok(mediaLayout.videoBelow,'Video must occupy its own lane BELOW the photos');
    assert.match(mediaLayout.imageInfo,/China/);
    assert.match(mediaLayout.videoInfo,/Vídeo de teste/);
    assert.ok(mediaLayout.overflow<=3,'Media layout must not widen the viewport');
    await page.click('.ultron-media-play');
    await page.waitForSelector('.ultron-media-video iframe',{timeout:5000});
    const player=await page.$eval('.ultron-media-video iframe',el=>({src:el.src,width:el.getBoundingClientRect().width}));
    assert.ok(player.src.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ')&&player.width>0,'Inline player must be mounted in Ring');
    const separate=await page.evaluate(()=>{const t=document.querySelector('.ultron-neural-answer-text').getBoundingClientRect(),m=document.querySelector('.ultron-neural-answer-media').getBoundingClientRect();return t.right<=m.left+2||t.bottom<=m.top+2;});
    assert.ok(separate,'Media must never overlap answer text');
    // Use the real typed command route; local UI actions must not rely on AI.
    const aiBefore=await page.evaluate(()=>window.__ultronQuestionSequence||0);
    await page.evaluate(()=>{document.querySelector('#command-input').value='JARVIS, desative os textos do Neural Ring';document.querySelector('#btn-send').click();});
    await page.waitForFunction(()=>window.ULTRON_NEURAL_ANSWER?.textEnabled===false,{timeout:6000});
    assert.equal(await page.$eval('.ultron-neural-answer-text',el=>getComputedStyle(el).display),'none');
    assert.ok(await page.$('.ultron-media-video iframe'),'Video remains mounted when texts are disabled');
    await page.evaluate(()=>{document.querySelector('#command-input').value='Ative os textos do Neural Ring';document.querySelector('#btn-send').click();});
    await page.waitForFunction(()=>window.ULTRON_NEURAL_ANSWER?.textEnabled===true,{timeout:6000});
    assert.equal(await page.$eval('.ultron-neural-answer-text',el=>el.textContent),'Resposta real do fluxo de comando: China');
    assert.equal(await page.evaluate(()=>window.__ultronQuestionSequence||0),aiBefore,'Interface commands must not start an AI request');
    await page.evaluate(()=>{document.querySelector('#command-input').value='JARVIS, o que você pode fazer?';document.querySelector('#btn-send').click();});
    await page.waitForFunction(()=>document.querySelector('.ultron-neural-answer-text')?.textContent.includes('Controle da interface'),{timeout:6000});
    assert.equal(await page.$eval('.ultron-neural-answer-media',el=>el.children.length),0,'Self-knowledge must not display unrelated media');
    assert.equal(await page.$eval('.ultron-neural-answer-sources',el=>el.children.length),0,'Self-knowledge must not display Google links');
    await page.waitForFunction(()=>!!window.ULTRON_NEURAL_PARITY&&window.ULTRON_NEURAL_PARITY.report().starkCore&&window.ULTRON_NEURAL_PARITY.report().innerMesh,{timeout:15000});
    const parity=await page.evaluate(()=>{
      const core=window.ULTRON_STARK_CORE,mesh=window.ULTRON_STARK_MESH;
      const focused=core.focus('COMANDOS');
      const marked=document.querySelector('#command-input').dataset.starkFocused==='true';
      core.processing(true);
      const processing=document.querySelector('#jarvis-cc-state').textContent==='PROCESSANDO';
      core.processing(false);
      mesh.clearFocus();
      return {focused,marked,processing,cleared:!document.querySelector('#command-input').hasAttribute('data-stark-focused'),nodes:mesh.nodes.length,mode:core.mode,legacy:!!document.querySelector('.stark-vortex'),parity:window.ULTRON_NEURAL_PARITY.report()};
    });
    assert.ok(parity.focused&&parity.marked&&parity.processing&&parity.cleared&&parity.nodes>0,JSON.stringify(parity));
    assert.equal(parity.mode,'command-center');
    assert.equal(parity.legacy,false,'Do not restore legacy vortex over Neural Ring');
    assert.equal(parity.parity.starkCore,true);
    assert.equal(parity.parity.innerMesh,true);
    assert.equal(parity.parity.palmMatrix,false,'PalmMatrix remains untouched in current layout');
    const operation=await page.evaluate(async()=>await window.ULTRON_ORCHESTRATOR.execute('Verifique o parity check, depois feche a resposta','test'));
    assert.equal(operation.ok,true);
    assert.equal(operation.results.length,2);
    assert.equal(operation.results[0].result.steps[0].action,'parity.check');
    assert.equal(operation.results[1].result.steps[0].action,'answer.close');
    assert.equal(await page.$eval('.ultron-neural-answer',el=>el.hidden),true,'Compound plan must close the actual panel after diagnosis');
    // A contextual command selects the live globo tool instead of inventing an AI answer.
    const contextual=await page.evaluate(async()=>{
      const original=window.ULTRON_EARTH;
      const state={visible:true,selectedPlace:''};
      window.ULTRON_EARTH={state,async open(){state.visible=true;return {ok:true}},async locate(place){state.selectedPlace=place;return {ok:true}}};
      window.ULTRON_TASK_CONTEXT.captureQuestion('Analise os impactos do El Niño no Brasil');
      window.ULTRON_TASK_CONTEXT.recordAction({action:'earth.open'},{ok:true});
      const before=window.ULTRON_TASK_CONTEXT.snapshot();
      const decision=window.ULTRON_TASK_CONTEXT.resolve('Agora foque no Nordeste');
      const result=await window.ULTRON_ORCHESTRATOR.execute('Agora foque no Nordeste','test-context');
      window.ULTRON_EARTH=original;
      return {result,before,decision,context:window.ULTRON_TASK_CONTEXT.snapshot(),selected:state.selectedPlace};
    });
    assert.equal(contextual.result.ok,true);
    assert.equal(contextual.selected,'nordeste',JSON.stringify(contextual));
    assert.equal(contextual.context.region,'nordeste');
    assert.equal(contextual.context.topic,'El Niño');

    // Phase 3: a normal spoken-style command must render a real 2D map
    // within the Neural Ring and never claim numeric risk predictions.
    const geography=await page.evaluate(async()=>{
      const earth=window.ULTRON_EARTH;
      const state={visible:false,layerCount:0,playing:false,focused:null};
      window.ULTRON_EARTH={
        state,async open(){state.visible=true;return {ok:true}},
        close(){state.visible=false;state.layerCount=0;state.playing=false;return {ok:true}},
        setThematicLayer(points,{playing=false}={}){state.layerCount=points.length;state.playing=playing;return {ok:true,count:points.length};},
        setThematicGrid(cells){state.spatialCount=cells.length;return {ok:true,count:cells.length};},
        setThematicCountries(countries){state.countryCount=countries.length;return {ok:true,count:countries.length};},
        clearThematicLayer(){state.layerCount=0;return {ok:true}},focus(lat,lng){state.focused=[lat,lng];return {ok:true}}
      };
      const result=await window.ULTRON_ORCHESTRATOR.execute('JARVIS, crie uma simulação 2D do El Niño','phase3-test');
      const snapshot={result,geo:window.ULTRON_GEO_VISUAL?.state,theme:{...state}};
      window.__phase3EarthRestore=()=>{window.ULTRON_EARTH=earth;};
      window.__phase3MockState=state;
      return snapshot;
    });
    assert.equal(geography.result.ok,true,JSON.stringify(geography));
    assert.equal(geography.geo.mode,'2d');
    assert.equal(geography.geo.scenario,'enso');
    await page.waitForFunction(()=>document.querySelector('.jarvis-geo-2d svg path'),{timeout:9000});
    const mapped=await page.evaluate(()=>{
      const geo=document.querySelector('.jarvis-geo-visual'),stage=document.querySelector('.jarvis-cc-center');
      const panel=geo.getBoundingClientRect(),parent=stage.getBoundingClientRect();
      return {visible:!geo.hidden,markerCount:geo.querySelectorAll('.jarvis-geo-marker').length,
        paths:geo.querySelectorAll('.jarvis-geo-2d svg path').length,source:geo.querySelector('.jarvis-geo-footer a')?.href,
        warning:geo.querySelector('.jarvis-geo-footer small')?.textContent,
        inside:panel.left>=parent.left-3&&panel.right<=parent.right+3,
        overflow:document.documentElement.scrollWidth-innerWidth};
    });
    assert.equal(mapped.visible,true);
    assert.ok(mapped.markerCount>=5&&mapped.paths>=1,JSON.stringify(mapped));
    assert.ok(mapped.source.includes('gov.br/cemaden'));
    assert.match(mapped.warning,/Não são limites de desastre/);
    assert.ok(mapped.inside&&mapped.overflow<=3,JSON.stringify(mapped));
    await page.$eval('.jarvis-geo-region',el=>el.scrollIntoView({block:'center',inline:'nearest'}));
    const hitRegion=await page.evaluate(()=>{
      const button=document.querySelector('.jarvis-geo-region'),r=button.getBoundingClientRect();
      const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return {rect:{left:r.left,top:r.top,width:r.width,height:r.height},
        tag:el?.tagName,className:String(el?.className||''),inside:button===el||button.contains(el),
        buttonPointer:getComputedStyle(button).pointerEvents,
        panelPointer:getComputedStyle(document.querySelector('.jarvis-geo-visual')).pointerEvents,
        panelZ:getComputedStyle(document.querySelector('.jarvis-geo-visual')).zIndex,
        scrollY:window.scrollY};
    });
    assert.ok(hitRegion.inside,'Regional button must remain clickable after internal scrolling: '+JSON.stringify(hitRegion));
    await page.click('.jarvis-geo-region');
    const regionDetail=await page.$eval('.jarvis-geo-detail',el=>({
      text:el.textContent,link:el.querySelector('a')?.href||null,
      selected:document.querySelector('.jarvis-geo-region[aria-pressed=true]')?.dataset.id||null
    }));
    assert.ok(regionDetail.link?.includes('gov.br/cemaden'),JSON.stringify(regionDetail));
    await page.select('.jarvis-geo-filter','wet');
    assert.ok((await page.$eval('.jarvis-geo-visual',el=>el.querySelectorAll('.jarvis-geo-marker').length))>=1);
    await page.click('.jarvis-geo-modes [data-mode="3d"]');
    await page.waitForFunction(()=>window.ULTRON_GEO_VISUAL?.state?.mode==='3d',{timeout:7000});
    assert.ok(await page.evaluate(()=>window.__phase3MockState.layerCount)>=1,'Globe must receive filtered thematic markers');
    await page.click('.jarvis-geo-timeline button');
    assert.equal(await page.evaluate(()=>window.ULTRON_GEO_VISUAL.state.playing),true);
    assert.equal(await page.evaluate(()=>window.__phase3MockState.playing),true);
    await page.click('.jarvis-geo-timeline button');
    assert.equal(await page.evaluate(()=>window.ULTRON_GEO_VISUAL.state.playing),false);
    await page.click('.jarvis-geo-close');
    assert.equal(await page.evaluate(()=>window.ULTRON_GEO_VISUAL.state.visible),false);
    assert.equal(await page.evaluate(()=>window.__phase3MockState.layerCount),0);

    // Educational tsunami commands must create an actual moving wave visual,
    // not fall through to the text AI's weather recommendation.
    const tsunami2d=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
        "Jarvis, simule um tsunami no Japão no mapa 2D","tsunami-demo-2d");
      const state=window.ULTRON_GEO_VISUAL.state;
      return {result,state,wave:document.querySelector(".jarvis-tsunami-wave-front")?.getAttribute("d"),
        warning:document.querySelector("[data-tsunami-warning]")?.textContent,
        source:document.querySelector(".jarvis-geo-footer a")?.href};
    });
    assert.equal(tsunami2d.result.ok,true,JSON.stringify(tsunami2d));
    assert.equal(tsunami2d.state.scenario,"tsunami-japan");
    assert.equal(tsunami2d.state.mode,"2d");
    assert.equal(tsunami2d.state.playing,true);
    assert.ok(tsunami2d.wave?.startsWith("M"),"Animated SVG wavefront must exist");
    assert.match(tsunami2d.warning,/NÃO É ALERTA/);
    assert.ok(tsunami2d.source?.includes("noaa.gov"));
    const d0=tsunami2d.wave;
    await page.waitForFunction(()=>window.ULTRON_GEO_VISUAL?.state?.frame>0,{timeout:5000});
    const d1=await page.$eval(".jarvis-tsunami-wave-front",el=>el.getAttribute("d"));
    assert.notEqual(d0,d1,"Wavefront must actually move across animation frames");
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.close());
    const tsunami3d=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
        "Jarvis, simule um tsunami no Japão","tsunami-demo-3d");
      return {result,state:window.ULTRON_GEO_VISUAL.state,
        thematicCount:window.__phase3MockState.layerCount,
        thematicPlaying:window.__phase3MockState.playing};
    });
    assert.equal(tsunami3d.result.ok,true,JSON.stringify(tsunami3d));
    assert.equal(tsunami3d.state.mode,"3d");
    assert.equal(tsunami3d.state.frameCount,12);
    assert.equal(tsunami3d.thematicCount,17,"3D globe needs actual wavefront coordinates");
    assert.equal(tsunami3d.thematicPlaying,true);
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.close());

    // Phase 4: a real action chain must fetch a weather payload and render
    // distinct numeric forecast days inside the same Neural Ring (all viewports).
    const weather=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute('JARVIS, mostre a previsão do tempo em Recife no mapa 2D','phase4-test');
      const state=window.ULTRON_GEO_VISUAL.state;
      return {result,state,
        description:document.querySelector('.jarvis-geo-evidence')?.textContent,
        source:document.querySelector('.jarvis-geo-footer a')?.href};
    });
    assert.equal(weather.result.ok,true,JSON.stringify(weather));
    assert.equal(weather.state.scenario,'weather-recife');
    assert.equal(weather.state.mode,'2d');

    await page.waitForFunction(()=>document.querySelectorAll('.jarvis-geo-intensity-cell').length>=30,{timeout:7000});
    const painted=await page.evaluate(()=>({
      layer:window.ULTRON_GEO_VISUAL.state.layer,
      count:window.ULTRON_GEO_VISUAL.state.gridCount,
      shaded:document.querySelectorAll('.jarvis-geo-intensity-cell').length,
      countryClip:!!document.getElementById('jarvis-geo-brazil-mask'),
      legend:document.querySelector('.jarvis-geo-intensity-legend')?.textContent,
      note:document.querySelector('.jarvis-geo-intensity-status')?.textContent
    }));
    assert.equal(painted.layer,'rain');
    assert.equal(painted.count,35);
    assert.ok(painted.shaded>=30);
    assert.equal(painted.countryClip,true);
    assert.match(painted.legend,/Chuva prevista/);
    assert.match(painted.note,/CÉLULAS|células/);
    await page.evaluate(()=>{
      const layer=document.querySelector('.jarvis-geo-intensity-choice');
      layer.value='drought';layer.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForFunction(()=>document.querySelector('.jarvis-geo-intensity-status')?.textContent?.includes('ANA'),{timeout:3500});
    assert.equal(await page.$$eval('.jarvis-geo-intensity-cell',els=>els.length),0,
      'Never invent drought S0–S4 polygons from forecast data');
    await page.evaluate(()=>{
      const layer=document.querySelector('.jarvis-geo-intensity-choice');
      layer.value='soil';layer.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForFunction(()=>window.ULTRON_GEO_VISUAL.state.layer==='soil'&&window.ULTRON_GEO_VISUAL.state.gridCount>0,{timeout:7000});
    assert.equal(await page.$$eval('.jarvis-geo-intensity-cell',els=>els.length),35);
    await page.evaluate(()=>{
      const layer=document.querySelector('.jarvis-geo-intensity-choice');
      layer.value='marine';layer.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForFunction(()=>window.ULTRON_GEO_VISUAL.state.layer==='marine'&&window.ULTRON_GEO_VISUAL.state.gridCount>0,{timeout:7000});
    assert.equal(await page.$$eval('.jarvis-geo-intensity-cell[clip-path]',els=>els.length),0,
      'Offshore wave patches must never be clipped to the Brazil land silhouette');
    assert.ok(await page.$$eval('.jarvis-geo-intensity-cell',els=>els.length)>0,
      'Actual offshore colored cells must remain visible');
    await page.evaluate(()=>{
      const layer=document.querySelector('.jarvis-geo-intensity-choice');
      layer.value='rain';layer.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForFunction(()=>window.ULTRON_GEO_VISUAL.state.layer==='rain'&&window.ULTRON_GEO_VISUAL.state.gridCount>0,{timeout:7000});


    // Screenshot regression: the 2D map owns the entire Neural Ring stage.
    // It must no longer be a narrow floating pane in front of the large globe.
    const mapLayout=await page.evaluate(()=>{
      const stage=document.querySelector('.jarvis-cc-center').getBoundingClientRect();
      const panel=document.querySelector('.jarvis-geo-visual');
      const overlay=panel.getBoundingClientRect();
      const map=document.querySelector('.jarvis-geo-2d').getBoundingClientRect();
      const workspace=document.querySelector('.jarvis-geo-workspace').getBoundingClientRect();
      const metrics=document.querySelector('.jarvis-geo-metrics').getBoundingClientRect();
      return {stage:{x:stage.x,y:stage.y,w:stage.width,h:stage.height},
        overlay:{x:overlay.x,y:overlay.y,w:overlay.width,h:overlay.height},
        workspace:{w:workspace.width,h:workspace.height},
        metrics:{w:metrics.width,h:metrics.height},
        map:{w:map.width,h:map.height},mode:panel.dataset.mode,
        screen:panel.dataset.screen,
        columns:getComputedStyle(document.querySelector('.jarvis-geo-workspace')).gridTemplateColumns,
        innerWidth:window.innerWidth,
        scroll:getComputedStyle(panel).overflowY,
        hidden:panel.hidden};
    });
    assert.equal(mapLayout.mode,'2d');
    assert.equal(mapLayout.hidden,false);
    assert.ok(Math.abs(mapLayout.overlay.x-mapLayout.stage.x)<5,JSON.stringify(mapLayout));
    // Neural Ring can retain a small internal scroll offset on touch devices.
    assert.ok(Math.abs(mapLayout.overlay.y-mapLayout.stage.y)<20,JSON.stringify(mapLayout));
    assert.ok(mapLayout.overlay.w>mapLayout.stage.w*.95,JSON.stringify(mapLayout));
    assert.ok(mapLayout.overlay.h>mapLayout.stage.h*.95,JSON.stringify(mapLayout));
    assert.ok(mapLayout.workspace.w>mapLayout.stage.w*.86,JSON.stringify(mapLayout));
    if(mapLayout.stage.w<660)assert.equal(mapLayout.columns.split(/\\s+/).length,1,'Compact Neural Ring must stack map and metrics');
    assert.ok(mapLayout.map.w>mapLayout.stage.w*(viewport.width<=980?.76:.42),JSON.stringify(mapLayout));
    assert.ok(mapLayout.metrics.w>130,JSON.stringify(mapLayout));
    assert.equal(mapLayout.scroll,'auto');
    const forecastCards=await page.$eval('.jarvis-geo-metrics',el=>el.textContent);
    assert.match(forecastCards,/MÍNIMA PREVISTA/);
    assert.match(forecastCards,/CHUVA PREVISTA/);
    assert.match(forecastCards,/1,1 mm/);
    assert.match(forecastCards,/CHUVA PREVISTA · PRÓXIMOS DIAS/);
    assert.equal(await page.$eval('.jarvis-geo-rain-row[data-active="true"] small',el=>el.textContent),'2026-11-11');
    // Map camera controls must change the REAL SVG viewbox, not its container.
    const defaultBox=await page.$eval('.jarvis-geo-2d svg',el=>el.getAttribute('viewBox'));
    await page.evaluate(()=>document.querySelector('[aria-label="Aproximar mapa 2D"]').click());
    const zoomBox=await page.$eval('.jarvis-geo-2d svg',el=>el.getAttribute('viewBox'));
    assert.notEqual(zoomBox,defaultBox,'Zoom must change geographic camera');
    assert.equal(await page.$eval('.jarvis-geo-map-zoom',el=>el.textContent),'155%');
    await page.evaluate(()=>document.querySelector('[aria-label="Centralizar mapa no local indicado"]').click());
    assert.equal(await page.$eval('.jarvis-geo-map-zoom',el=>el.textContent),'270%');
    await page.evaluate(()=>document.querySelector('[aria-label="Restaurar extensão completa do mapa"]').click());
    assert.equal(await page.$eval('.jarvis-geo-2d svg',el=>el.getAttribute('viewBox')),defaultBox);
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.setFrame(0));
    const currentCards=await page.$eval('.jarvis-geo-metrics',el=>el.textContent);
    assert.match(currentCards,/TEMPERATURA ESTIMADA/);
    assert.match(currentCards,/29 °C/);
    assert.match(currentCards,/UMIDADE/);
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.setFrame(2));
    assert.match(await page.$eval('.jarvis-geo-metric-card[data-metric="rainMm"] strong',el=>el.textContent),/12 mm/);
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.setFrame(1));

    assert.equal(weather.state.frameCount,4,'Current estimate plus 3 forecast days');
    assert.ok(weather.description?.includes('mm'),'Must display sourced precipitation values');
    assert.match(weather.source,/open-meteo/);
    assert.equal(await page.$eval('.jarvis-geo-2d',el=>el.hidden),false);
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.setFrame(3));
    assert.equal(await page.evaluate(()=>window.ULTRON_GEO_VISUAL.state.frame),3);
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.setMode('3d'));
    assert.equal(await page.evaluate(()=>window.ULTRON_GEO_VISUAL.state.mode),'3d');
    assert.ok(await page.evaluate(()=>window.__phase3MockState.spatialCount)>=30,'3D globe must receive real sampled cell polygons');
    if(viewport.width>1000){
      const stageWidth=await page.$eval('.jarvis-cc-center',el=>el.getBoundingClientRect().width);
      const hudWidth=await page.$eval('.jarvis-geo-visual',el=>el.getBoundingClientRect().width);
      assert.ok(hudWidth<stageWidth*.8,'3D mode should recover the compact HUD instead of hiding the globe');
    }

    assert.ok(await page.evaluate(()=>window.__phase3MockState.layerCount)>0,'Forecast marker must be sent to globe');
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.close());
    // A Cloudflare 503 for the 11-capital route must recover via Open-Meteo
    // without inferring or inventing measurements.
    weatherCityBackendOffline=true;
    const cityRecovery=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
        'JARVIS, mostre a previsão do tempo em Recife no mapa 2D','phase4-city-recovery');
      return {result,state:window.ULTRON_GEO_VISUAL?.state,
        evidence:document.querySelector('.jarvis-geo-evidence')?.textContent};
    });
    assert.equal(cityRecovery.result.ok,true,'City forecast must recover from a Worker 503: '+JSON.stringify(cityRecovery));
    assert.equal(cityRecovery.state.scenario,'weather-recife');
    assert.equal(cityRecovery.state.frameCount,4);
    assert.match(cityRecovery.evidence,/mm/);
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.close());
    weatherCityBackendOffline=false;
    // Global geography must use real world coordinates, never the Brazil-only projection.
    const worldwide=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
       'Jarvis, mostre a previsão do tempo em Tokyo no mapa 2D por 16 dias','worldwide-test');
      const state=window.ULTRON_GEO_VISUAL.state;
      return {result,state,
        note:document.querySelector('.jarvis-geo-map-note')?.textContent,
        source:document.querySelector('.jarvis-geo-footer a')?.href,
        marker:document.querySelector('.jarvis-geo-marker > circle')?.getAttribute('cx')};
    });
    assert.equal(worldwide.result.ok,true,JSON.stringify(worldwide));
    assert.equal(worldwide.state.scenario,'weather-global-1850147',JSON.stringify(worldwide));
    assert.equal(worldwide.state.mode,'2d');
    assert.equal(worldwide.state.frameCount,17);
    assert.ok(worldwide.marker>650,'Tokyo marker must appear on the world projection');
    assert.match(worldwide.note,/Natural Earth/);
    assert.match(worldwide.source,/open-meteo/);
    assert.equal(await page.$eval('.jarvis-geo-place-bar',el=>el.hidden),false);
    // Explicit personal opt-in from the same ring; no implicit monitoring.
    await page.evaluate(()=>{
      const old=window.ULTRON_MEMORY||{};
      window.ULTRON_MEMORY={...old,getMemoryKey:()=>('test-memory-key-'+('z'.repeat(44)))};
    });
    await page.click('.jarvis-geo-place-bar button[title^="Acompanhar"]');
    await page.waitForFunction(()=>document.querySelector('.jarvis-geo-watch-panel')?.textContent?.includes('Tokyo'),{timeout:7000});
    assert.ok(watchSaved,'User explicitly opted into watchlist');
    assert.ok((await page.$eval('.jarvis-geo-watch-panel',el=>el.textContent)).includes('3 EM 3 HORAS'));
    await page.click('.jarvis-geo-watch-row button');
    await page.waitForFunction(()=>document.querySelector('.jarvis-geo-watch-panel')?.textContent?.includes('Nenhuma cidade'),{timeout:7000});
    assert.equal(watchSaved,false,'Stopping monitoring removes the sample');

    await page.evaluate(()=>{
      document.querySelector('.jarvis-geo-place-bar input').value='Tokyo';
      document.querySelector('.jarvis-geo-place-bar').requestSubmit();
    });
    await new Promise(resolve=>setTimeout(resolve,1350));
    const searchDebug=await page.evaluate(()=>({
      result:document.querySelector('.jarvis-geo-place-results')?.textContent,
      hidden:document.querySelector('.jarvis-geo-place-results')?.hidden,
      buttonCount:document.querySelectorAll('.jarvis-geo-place-results button').length,
      query:document.querySelector('.jarvis-geo-place-bar input')?.value,
      panelHidden:document.querySelector('.jarvis-geo-visual')?.hidden
    }));
    console.log('PHASE5 SEARCH DEBUG',JSON.stringify(searchDebug));
    await page.waitForFunction(()=>{
      const root=document.querySelector('.jarvis-geo-place-results');
      return root?.querySelectorAll('button').length||/não encontrada|Erro|indisponível/.test(root?.textContent||'');
    },{timeout:12000});
    const geoSearchState=await page.$eval('.jarvis-geo-place-results',el=>({
      text:el.textContent,buttons:el.querySelectorAll('button').length
    }));
    assert.equal(geoSearchState.buttons,1,JSON.stringify(geoSearchState));
    await page.evaluate(()=>document.querySelector('.jarvis-geo-place-results button')?.click());
    await page.waitForFunction(()=>document.querySelector('.jarvis-geo-place-results')?.textContent?.includes('atualizada'),{timeout:6000});
    assert.equal(await page.$eval('.jarvis-geo-place-bar input',el=>el.value),'Tokyo, Tokyo, Japan');
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.setFrame(16));
    assert.equal(await page.evaluate(()=>window.ULTRON_GEO_VISUAL.state.frame),16);
    assert.equal(await page.$eval('.jarvis-geo-insight-bar',el=>el.hidden),false);
    const air=await page.evaluate(async()=>{
      return await window.ULTRON_ORCHESTRATOR.execute(
        'Jarvis, mostre a qualidade do ar em Tokyo no mapa 2D','world-insight-browser');
    });
    assert.equal(air.ok,true,JSON.stringify(air));
    assert.equal(await page.evaluate(()=>window.ULTRON_GEO_VISUAL.state.scenario),'insight-air-global-1850147');
    assert.match(await page.$eval('.jarvis-geo-evidence',el=>el.textContent),/PM2.5/);
    await page.select('.jarvis-geo-insight-bar select','alerts');
    await page.evaluate(()=>document.querySelector('.jarvis-geo-insight-bar').requestSubmit());
    await page.waitForFunction(()=>document.querySelector('.jarvis-geo-place-results')?.textContent?.includes('Sem fonte oficial integrada'),
      {timeout:5000});
    await page.evaluate(()=>document.querySelector('.jarvis-geo-insight-bar button[type=button]').click());
    await page.waitForFunction(()=>document.querySelector('.jarvis-geo-place-results')?.textContent?.includes('Recife'),
      {timeout:5000});

    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.close());
    // Cloudflare D1 deploy outage must not disable public worldwide forecast.
    weatherProxyOffline=true;
    const recovered=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
        'Jarvis, mostre a previsão do tempo em Tokyo no globo 3D por 16 dias','global-provider-fallback');
      return {result,state:window.ULTRON_GEO_VISUAL?.state};
    });
    assert.equal(recovered.result.ok,true,'Direct Open-Meteo recovery must work: '+JSON.stringify(recovered));
    assert.equal(recovered.state.mode,'3d');
    assert.equal(recovered.state.frameCount,17);
    assert.equal(recovered.state.scenario,'weather-global-1850147');
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.setMode('2d'));
    await page.evaluate(()=>{
      document.querySelector('.jarvis-geo-place-bar input').value='Tokyo';
      document.querySelector('.jarvis-geo-place-bar').requestSubmit();
    });
    await page.waitForFunction(()=>document.querySelectorAll('.jarvis-geo-place-results button').length===1,{timeout:7000});
    await page.evaluate(()=>document.querySelector('.jarvis-geo-place-results button').click());
    await page.waitForFunction(()=>document.querySelector('.jarvis-geo-place-results')?.textContent?.includes('atualizada'),{timeout:7000});
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.close());
    weatherProxyOffline=false;
    // Worldwide geospatial subjects MUST open the actual 2D or 3D Ring map.
    // Research prose alone is insufficient.
    const earthquakes=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
        'Jarvis, mostre os terremotos do mundo no mapa 2D','world-geo-usgs-browser');
      return {result,state:window.ULTRON_GEO_VISUAL.state,
        legend:document.querySelector('.jarvis-geo-intensity-legend')?.textContent,
        markers:[...document.querySelectorAll('.jarvis-geo-marker > circle:last-of-type')]
          .map(n=>n.getAttribute('fill')),
        weatherControlHidden:document.querySelector('.jarvis-geo-intensity-bar')?.hidden};
    });
    assert.equal(earthquakes.result.ok,true,JSON.stringify(earthquakes));
    assert.equal(earthquakes.state.scenario,'world-earthquakes-world');
    assert.equal(earthquakes.state.mode,'2d');
    assert.equal(earthquakes.state.topic,'earthquakes');
    assert.equal(earthquakes.state.count,2);
    assert.match(earthquakes.legend,/M6,5/);
    assert.equal(earthquakes.weatherControlHidden,true,'NASA/USGS must not automatically overlay unrelated rain forecasts');
    assert.ok(earthquakes.markers.includes('#78b6dc')&&earthquakes.markers.includes('#d94f63'),
      'Earthquake magnitude should paint different colored epicenters');

    const wb=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
        'Jarvis, mostre a população dos países do mundo no mapa 2D','world-geo-worldbank-browser');
      return {result,state:window.ULTRON_GEO_VISUAL.state,
        countries:[...document.querySelectorAll('.jarvis-geo-world-country')].map(n=>n.getAttribute('data-iso3')),
        meaning:document.querySelector('.jarvis-geo-metrics')?.textContent,
        theme:document.querySelector('.jarvis-geo-intensity-legend')?.textContent};
    });
    assert.equal(wb.result.ok,true,JSON.stringify(wb));
    assert.equal(wb.state.scenario,'world-population-world');
    assert.equal(wb.state.countryCount,2);
    assert.ok(wb.countries.includes('BRA')&&wb.countries.includes('USA'),
      'World Bank metrics must actually color national country polygons in SVG');
    assert.match(wb.meaning,/Indicador anual/);
    assert.match(wb.theme,/População/);

    const globeWorld=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
        'Jarvis, mostre o PIB dos países no globo 3D','world-geo-globe-browser');
      return {result,state:window.ULTRON_GEO_VISUAL.state,
        countryCount:window.__phase3MockState.countryCount};
    });
    // API mock returns two numeric countries for every World Bank indicator.
    assert.equal(globeWorld.result.ok,true,JSON.stringify(globeWorld));
    assert.equal(globeWorld.state.mode,'3d');
    assert.ok(globeWorld.countryCount>=2,
      '3D globe should receive the grounded country geometry, not only text');

    const planetRain=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
        'Jarvis, mostre a intensidade de chuva no mundo no mapa 2D','world-geo-rain-browser');
      return {result,state:window.ULTRON_GEO_VISUAL.state};
    });
    assert.equal(planetRain.result.ok,true,JSON.stringify(planetRain));
    assert.equal(planetRain.state.scenario,'spatial-rain-world');
    assert.equal(planetRain.state.gridCount,40);
    await page.waitForFunction(()=>document.querySelectorAll('.jarvis-geo-intensity-cell').length===40,{timeout:7000});
    assert.equal(await page.$eval('.jarvis-geo-intensity-bar',el=>el.hidden),false);
    await page.evaluate(()=>window.ULTRON_GEO_VISUAL.close());


    // Official sources stay distinct: a real APAC ArcGIS response produces
    // observable gauges in the Neural Ring, not a fictional radar raster.
    const radar=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
        "Jarvis, mostre as chuvas em tempo real no Brasil","meteo-smoke");
      const panel=document.querySelector(".jarvis-meteo-center");
      return {result,inside:document.querySelector(".jarvis-cc-center").contains(panel),
        iframes:panel.querySelectorAll("iframe").length,
        stageTiles:panel.querySelectorAll(".jarvis-meteo-radar-map image").length,
        source:panel.querySelector(".jarvis-meteo-credit")?.href,
        state:window.ULTRON_METEO_CENTER.state,
        message:panel.textContent,
        fullScreen:panel.getBoundingClientRect().width/
         document.querySelector(".jarvis-cc-center").getBoundingClientRect().width};
    });
    assert.equal(radar.result.ok,true,JSON.stringify(radar));
    assert.equal(radar.result.results[0].route,"local-meteorological-center");
    assert.equal(radar.inside,true);
    assert.equal(radar.iframes,0,"No external iframe or separate weather page");
    assert.ok(radar.stageTiles>=4,"Actual radar PNG tiles must be mounted in Neural Ring");
    assert.ok(radar.fullScreen>.85,"2D radar must occupy the Neural Ring stage");
    assert.equal(radar.state.radarFrames,6);
    assert.match(radar.source,/rainviewer.com/);
    assert.match(radar.message,/Radar|RADAR/);
    const apac=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
        "Jarvis, mostre as chuvas registradas em Pernambuco","meteo-apac-test");
      const panel=document.querySelector(".jarvis-meteo-center");
      return {result,state:window.ULTRON_METEO_CENTER.state,
        gauges:panel.querySelectorAll(".jarvis-meteo-gauge").length,
        text:panel.textContent};
    });
    assert.equal(apac.result.ok,true,JSON.stringify(apac));
    assert.equal(apac.state.tab,"apac");
    assert.equal(apac.state.stationCount,3);
    assert.equal(apac.gauges,2,"By default 0 mm stations do not crowd the map");
    assert.match(apac.text,/3 estações com dados/);
    assert.match(apac.text,/2 registraram chuva/);
    assert.match(apac.text,/1 registraram 0 mm/);
    assert.match(apac.text,/31 mm|31,0 mm/);
    assert.match(apac.text,/LEGENDA/);
    assert.match(apac.text,/ONDE MAIS CHOVEU/);
    await page.waitForFunction(()=>document.querySelector('[data-meteo-state-outline="official"]'),{timeout:7000});
    await page.evaluate(()=>{
       const toggle=document.querySelector('.jarvis-meteo-only-wet input');
       toggle.checked=false;toggle.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForFunction(()=>document.querySelectorAll('.jarvis-meteo-gauge').length===3,{timeout:7000});
    const satellite=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
        "Jarvis, ative o satélite e acompanhe as nuvens","meteo-satellite-test");
      return {result,state:window.ULTRON_METEO_CENTER.state,
        iframeCount:document.querySelectorAll(".jarvis-meteo-center iframe").length,
        image:document.querySelector(".jarvis-meteo-satellite-image")?.src,
        imageStatus:document.querySelector(".jarvis-meteo-satellite-view")?.dataset.imageStatus};
    });
    assert.equal(satellite.result.ok,true);
    assert.equal(satellite.state.tab,"satellite");
    assert.equal(satellite.iframeCount,0,"Direct NOAA image, never a remote webpage");
    assert.match(satellite.image,/cdn\.star\.nesdis\.noaa\.gov\/GOES19/);
    await page.waitForFunction(()=>document.querySelector(".jarvis-meteo-satellite-view")?.dataset.imageStatus==="loaded",{timeout:7000});
    const inmet=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
        "Jarvis, abra o mapa do INMET","meteo-inmet-test");
      return {result,state:window.ULTRON_METEO_CENTER.state,
        svg:!!document.querySelector(".jarvis-meteo-inmet-map"),
        n:document.querySelectorAll(".jarvis-meteo-inmet-map circle").length,
        body:document.querySelector(".jarvis-meteo-center")?.textContent};
    });
    assert.equal(inmet.result.ok,true,JSON.stringify(inmet));
    assert.equal(inmet.state.tab,"inmet");
    assert.equal(inmet.svg,true);
    assert.equal(inmet.n,2);
    assert.match(inmet.body,/NÃO são valores de chuva|NÃO são dados de chuva/);
    await page.evaluate(()=>window.ULTRON_METEO_CENTER.close());

    // Global Intelligence is powered by hourly verified D1 snapshots; the
    // original Ring must display concrete source-linked events in 2D AND 3D.
    const global2d=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
        "Jarvis, abra o monitoramento mundial no mapa 2D","global-intel-smoke");
      const root=document.querySelector(".jarvis-global-intel-panel");
      const geo=window.ULTRON_GEO_VISUAL;
      return {result,
        panelInside:document.querySelector(".jarvis-cc-center").contains(root),
        visible:!root.hidden,items:root.querySelectorAll(".jarvis-global-intel-item").length,
        sources:root.querySelectorAll(".jarvis-global-source").length,
        route:result.results?.[0]?.route,
        geo:geo.state,
        sourceLink:root.querySelector(".jarvis-global-intel-item a")?.href,
        room:root.getBoundingClientRect().right<=window.innerWidth+1};
    });
    assert.equal(global2d.result.ok,true,JSON.stringify(global2d));
    assert.equal(global2d.route,"local-global-intelligence");
    assert.equal(global2d.panelInside,true);
    assert.equal(global2d.visible,true);
    assert.equal(global2d.items,3);
    assert.equal(global2d.sources,3);
    assert.equal(global2d.geo.scenario,"global-intelligence-events-v1");
    assert.equal(global2d.geo.mode,"2d");
    assert.equal(global2d.geo.count,3);
    assert.match(global2d.sourceLink,/gdacs\.org|earthquake\.usgs\.gov|eonet\.gsfc\.nasa\.gov/);
    assert.equal(global2d.room,true,"Global Ring overlay must fit device viewport");
    const global3d=await page.evaluate(async()=>{
      const result=await window.ULTRON_ORCHESTRATOR.execute(
        "Jarvis, mostre a inteligência global no globo 3D","global-intel-globe");
      const before=window.__phase3MockState.layerCount;
      document.querySelector(".jarvis-global-intel-item button").click();
      return {result,geo:window.ULTRON_GEO_VISUAL.state,globe:
       window.__phase3MockState,items:document.querySelectorAll(".jarvis-global-intel-item").length};
    });
    assert.equal(global3d.result.ok,true,JSON.stringify(global3d));
    assert.equal(global3d.geo.mode,"3d");
    assert.equal(global3d.geo.scenario,"global-intelligence-events-v1");
    assert.ok(global3d.globe.layerCount>=3);
    assert.ok(Array.isArray(global3d.globe.focused));
    assert.equal(global3d.items,3);
    const globalBrazil=await page.evaluate(async()=>{
      document.querySelector(".jarvis-global-intel-actions select").value="brazil";
      document.querySelector(".jarvis-global-intel-actions select").dispatchEvent(
        new Event("change",{bubbles:true}));
      return window.ULTRON_GLOBAL_INTELLIGENCE.state;
    });
    await page.waitForFunction(()=>document.querySelectorAll(".jarvis-global-intel-item").length===1,{timeout:7000});
    assert.equal(globalBrazil.hasReport,true);
    // IMPORTANT: Real pointer clicks, not JS .click() or direct module methods.
    // Check that the actual viewport hit-target reaches every active control.
    await page.click('[data-intel-action="2d"]');
    await page.waitForFunction(()=>window.ULTRON_GLOBAL_INTELLIGENCE.state.view==="2d",{timeout:7000});
    assert.equal(await page.$eval('[data-intel-action="2d"]',el=>el.getAttribute("aria-pressed")),"true");
    await page.click('[data-intel-action="3d"]');
    await page.waitForFunction(()=>window.ULTRON_GLOBAL_INTELLIGENCE.state.view==="3d",{timeout:7000});
    await page.click('[data-intel-action="close"]');
    assert.equal(await page.evaluate(()=>window.ULTRON_GLOBAL_INTELLIGENCE.state.visible),false);

    // A frontend deploy may arrive before Worker D1's first hourly data.
    // The GLOBAL INTEL button must still open the SAME Ring with verified
    // direct GeoJSON (explicitly marked as NOT persisted/24-hour monitoring).
    globalBackendOffline=true;
    await page.$eval('#btn-global-intelligence',button=>
      button.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
    const quickHit=await page.$eval('#btn-global-intelligence',button=>{
      const box=button.getBoundingClientRect();
      const at=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
      return {hit:at===button||button.contains(at),element:at?.tagName,
        text:at?.textContent?.slice(0,50),display:getComputedStyle(button).display};
    });
    assert.equal(quickHit.hit,true,'GLOBAL INTEL quick button must be reachable by pointer: '+JSON.stringify(quickHit));
    await page.click('#btn-global-intelligence');
    await page.waitForFunction(()=>window.ULTRON_GLOBAL_INTELLIGENCE.state.visible===true,{timeout:10000});
    await page.waitForFunction(()=>document.querySelector(
      '.jarvis-global-intel-panel')?.getAttribute('aria-busy')==="false",{timeout:15000});
    // Quick open can legitimately reuse cached D1 data; explicit refresh
    // must switch to genuine source fetch when Cloudflare returns 503.
    await page.click('[data-intel-action="refresh"]');
    await page.waitForFunction(()=>document.querySelector(
      '.jarvis-global-intel-panel')?.getAttribute('aria-busy')==="false"&&
      window.ULTRON_GLOBAL_INTELLIGENCE.state.lastFetchMode==="browser-direct",{timeout:20000});
    const directFallback=await page.evaluate(()=>{
      const root=document.querySelector('.jarvis-global-intel-panel');
      const button=root.querySelector('[data-intel-action="refresh"]');
      const rect=button.getBoundingClientRect();
      const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
      return {visible:!root.hidden,items:root.querySelectorAll('.jarvis-global-intel-item').length,
        sources:root.querySelectorAll('.jarvis-global-source').length,
        mode:window.ULTRON_GLOBAL_INTELLIGENCE.state.lastFetchMode,
        status:root.querySelector('.jarvis-global-intel-status').textContent,
        hit:hit===button||button.contains(hit),
        geo:window.ULTRON_GEO_VISUAL.state};
    });
    assert.equal(directFallback.visible,true,JSON.stringify(directFallback));
    assert.equal(directFallback.items,2,JSON.stringify(directFallback));
    assert.equal(directFallback.sources,3);
    assert.equal(directFallback.mode,'browser-direct');
    assert.match(directFallback.status,/sem histórico D1|Dados consultados diretamente/i);
    assert.equal(directFallback.hit,true,'Refresh button must receive real touches/clicks, not an overlapping overlay');
    await page.click('[data-intel-action="refresh"]');
    await page.waitForFunction(()=>document.querySelector(
      '.jarvis-global-intel-panel')?.getAttribute('aria-busy')==="false",{timeout:20000});
    assert.equal(await page.evaluate(()=>window.ULTRON_GLOBAL_INTELLIGENCE.state.lastFetchMode),'browser-direct');
    await page.click('[data-intel-action="2d"]');
    await page.waitForFunction(()=>window.ULTRON_GLOBAL_INTELLIGENCE.state.view==="2d",{timeout:7000});
    assert.equal(await page.evaluate(()=>window.ULTRON_GEO_VISUAL.state.mode),'2d');
    await page.click('[data-intel-action="close"]');
    assert.equal(await page.evaluate(()=>window.ULTRON_GLOBAL_INTELLIGENCE.state.visible),false);
    globalBackendOffline=false;

    // "LIMPAR TUDO" must reset the visible workspace, not search the web.
    const clearResult=await page.evaluate(async()=>{
      await window.ULTRON_GEO_VISUAL.open({scenario:"enso",view:"2d"});
      window.ULTRON_NEURAL_ANSWER.show("Resposta antiga para limpar");
      const output=document.getElementById("output-box");
      const previous=document.createElement("p");previous.textContent="CONTEÚDO ANTIGO";output.append(previous);
      document.getElementById("command-input").value="LIMPAR TUDO";
      const result=await window.ULTRON_ORCHESTRATOR.execute("LIMPAR TUDO","test-local-clear");
      return {result,geo:window.ULTRON_GEO_VISUAL.state,
        answerVisible:window.ULTRON_NEURAL_ANSWER.visible,
        outputCount:output.childNodes.length,
        input:document.getElementById("command-input").value};
    });
    assert.equal(clearResult.result.ok,true,JSON.stringify(clearResult));
    assert.equal(clearResult.result.results[0].route,"local-clear-interface");
    assert.equal(clearResult.geo.visible,false);
    assert.equal(clearResult.answerVisible,false);
    assert.equal(clearResult.outputCount,0,"No terminal logs should reappear after clear");
    assert.equal(clearResult.input,"");

    // COMMAND CENTER BUTTON AUDIT — use actual pointer/click events.
    // A previous layout hid 5/6 controls and the globe-mode button
    // changed only its label instead of opening ULTRON_EARTH.
    const ccButtons=await page.evaluate(()=>[...document.querySelectorAll(
      '#jarvis-cc-input-slot [data-cc]')].map(button=>({
      action:button.dataset.cc,visible:getComputedStyle(button).display!=='none',
      width:Math.round(button.getBoundingClientRect().width)
    })));
    assert.deepEqual(ccButtons.map(x=>x.action).sort(),
      ['agenda','camera','devices','earth','files','ring','status'].sort(),
      'All seven command-center controls, including return to Ring, must be reachable');
    assert.ok(ccButtons.every(x=>x.visible&&x.width>12),JSON.stringify(ccButtons));
    for(const action of ['status','agenda','devices','files','camera','ring']){
      const selector='[data-cc="'+action+'"]';
      await page.$eval(selector,button=>button.scrollIntoView({
        behavior:'instant',block:'center',inline:'center'
      }));
      const target=await page.$eval(selector,button=>{
        const r=button.getBoundingClientRect();
        const center=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return {ok:center===button||button.contains(center),
          blocker:center?.tagName||null,blockerText:center?.textContent?.slice(0,32),
          width:r.width,height:r.height};
      });
      assert.equal(target.ok,true,action+' must accept an actual click: '+JSON.stringify(target));
    }
    // Assert real module bootstrap BEFORE injecting any test substitutes:
    // previously a syntax error left ULTRON_DEVICES undefined in production.
    await page.waitForFunction(()=>Boolean(
      window.ULTRON_DEVICES?.listDevices&&window.ULTRON_LOCAL_FILES?.health&&
      window.ULTRON_VISION?.analyze),{timeout:18000});
    await page.evaluate(()=>{
      window.__ccAuditSavedDevices=window.ULTRON_DEVICES;
      window.__ccAuditSavedFiles=window.ULTRON_LOCAL_FILES;
      window.__ccAuditSavedMemory=window.ULTRON_MEMORY;
      window.__ccAuditSavedMobileCamera=window.ULTRON_MOBILE_CAMERA;
      window.ULTRON_MEMORY={...window.ULTRON_MEMORY,getMemoryKey:()=> 'test-operator'};
      window.ULTRON_DEVICES={listDevices:async()=>[]};
      window.ULTRON_LOCAL_FILES={health:async()=>({ok:true}),files:async()=>['Relatorio.txt']};
      window.ULTRON_MOBILE_CAMERA={smartConnect:()=>{window.__ccAuditCamera=(window.__ccAuditCamera||0)+1;return Promise.resolve(true);}};
      const tv=document.getElementById('btn-pair-tv');
      tv.click=()=>{window.__ccAuditTv=(window.__ccAuditTv||0)+1};
    });
    await page.evaluate(()=>{
      const b=document.querySelector('[data-cc="status"]');
      window.__ccStatusEvents=[];
      for(const type of ['pointerdown','pointerup','click']){
        b.addEventListener(type,e=>window.__ccStatusEvents.push(type+':'+e.target.tagName));
      }
    });
    await page.click('[data-cc="status"]');
    const ccStatusDebug=await page.evaluate(()=>({
      events:window.__ccStatusEvents,
      center:window.JARVIS_COMMAND_CENTER?.version,
      output:document.getElementById('output-box')?.textContent?.slice(-850),
      actionButtons:document.querySelectorAll('[data-cc="status"]').length,
      buttonParent:document.querySelector('[data-cc="status"]')?.parentElement?.className,
      messageCount:document.querySelectorAll('.jarvis-cc-inline-result').length,
      ccAlive:!!window.JARVIS_COMMAND_CENTER
    }));
    console.log('COMMAND CENTER STATUS DEBUG',JSON.stringify(ccStatusDebug));
    assert.ok(ccStatusDebug.output?.includes('STATUS DO SISTEMA'),
      'Real STATUS button must update terminal: '+JSON.stringify(ccStatusDebug));
    assert.ok(await page.$eval('.jarvis-cc-inline-result:last-child',
      el=>el.querySelector('button')?.textContent.includes('Atualizar status')));
    await page.click('.jarvis-cc-inline-result:last-child button');
    await page.waitForFunction(()=>[...document.querySelectorAll('.jarvis-cc-inline-result')]
      .filter(el=>el.textContent.includes('STATUS DO SISTEMA')).length>=2);
    await page.click('[data-cc="agenda"]');
    assert.match(await page.$eval('.jarvis-cc-inline-result:last-child',el=>el.textContent),/AGENDA \/ VISÃO LOCAL/);
    await page.click('[data-cc="devices"]');
    await page.waitForFunction(()=>[...document.querySelectorAll('.jarvis-cc-inline-result button')]
      .some(el=>el.textContent.includes('Configurar TV')));
    await page.$eval('.jarvis-cc-inline-result:last-child',el=>{
      const tv=[...el.querySelectorAll('button')].find(b=>b.textContent.includes('Configurar TV'));
      tv?.setAttribute('data-test-tv','true');
    });
    await page.click('[data-test-tv="true"]');
    await page.waitForFunction(()=>window.__ccAuditTv===1);
    await page.click('[data-cc="files"]');
    await page.waitForFunction(()=>[...document.querySelectorAll('.jarvis-cc-inline-result')]
      .some(el=>el.textContent.includes('ARQUIVOS LOCAIS (1)')));
    assert.ok(await page.$eval('.jarvis-cc-inline-result:last-child',
      el=>el.querySelector('button')?.textContent.includes('Atualizar arquivos')));
    await page.click('.jarvis-cc-inline-result:last-child button');
    await page.waitForFunction(()=>[...document.querySelectorAll('.jarvis-cc-inline-result')]
      .filter(el=>el.textContent.includes('ARQUIVOS LOCAIS (1)')).length>=2);
    await page.click('[data-cc="camera"]');
    await page.waitForFunction(()=>window.__ccAuditCamera===1);
    await page.$eval('[data-visual="globe"]',button=>
      button.scrollIntoView({block:'center',behavior:'instant'}));
    await page.click('[data-visual="globe"]');
    await page.waitForFunction(()=>window.__phase3MockState.visible===true);
    // The stable return-to-Ring tool must work even when a moving 3D
    // visual prevents a click on the tiny sphere-mode toggle.
    await page.$eval('[data-cc="ring"]',button=>
      button.scrollIntoView({behavior:'instant',block:'center'}));
    await page.click('[data-cc="ring"]');
    await page.waitForFunction(()=>window.__phase3MockState.visible===false&&
      document.querySelector('.jarvis-cc-visual')?.dataset.mode==='ring',{timeout:9000});
    assert.equal(await page.$eval('[data-visual="ring"]',button=>button.getAttribute('aria-pressed')),'true');
    await page.evaluate(()=>{
      const tv=document.getElementById('btn-pair-tv');
      delete tv.click;
      window.ULTRON_DEVICES=window.__ccAuditSavedDevices;
      window.ULTRON_LOCAL_FILES=window.__ccAuditSavedFiles;
      window.ULTRON_MEMORY=window.__ccAuditSavedMemory;
      window.ULTRON_MOBILE_CAMERA=window.__ccAuditSavedMobileCamera;
    });
    await page.evaluate(()=>window.__phase3EarthRestore());

    // Production shortcuts MUST be independently clickable (no overlapping
    // scroll-snap ribbon) across phone/laptop/TV. Never fake their DOM nodes.
    const productionShortcuts=[
      '[data-command="status"]','[data-command="camera"]',
      '[data-command="center"]','[data-command="clear"]',
      '#btn-pair-tv','#btn-pair-mobile','#btn-analyze-vision','#btn-analyze-image'
    ];
    for(const selector of productionShortcuts){
      await page.$eval(selector,button=>button.scrollIntoView({
        block:'center',inline:'center',behavior:'instant'
      }));
      const hit=await page.$eval(selector,button=>{
        const rect=button.getBoundingClientRect();
        const el=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
        const chain=[];
        let current=button;
        for(let level=0;level<8&&current;level++,current=current.parentElement){
          const r=current.getBoundingClientRect(),css=getComputedStyle(current);
          chain.push({tag:current.tagName,id:current.id,cls:current.className,
            width:Math.round(r.width),height:Math.round(r.height),
            display:css.display,flex:css.flex,grid:css.gridTemplateColumns,
            inlineSize:css.inlineSize,minWidth:css.minWidth,writingMode:css.writingMode});
        }
        return {hit:el===button||button.contains(el),
          width:rect.width,height:rect.height,top:rect.top,
          chain:button.id==='btn-pair-mobile'?chain:undefined};
      });
      assert.ok(hit.hit&&hit.width>60&&hit.height>=40,
        'Quick control should be tappable: '+selector+' '+JSON.stringify(hit));
    }
    await page.click('[data-command="status"]');
    await page.waitForFunction(()=>document.getElementById('output-box')
      .textContent.includes('Sistema ONLINE'),{timeout:5000});
    await page.click('[data-command="center"]');
    assert.match(await page.$eval('#output-box',el=>el.textContent),
      /Esfera holográfica centralizada/);
    await page.click('[data-command="clear"]');
    assert.equal(await page.$eval('#output-box',el=>el.children.length),0,
      'LIMPAR TERMINAL should clear responses without deleting data');
    await page.click('#btn-pair-tv');
    assert.match(await page.$eval('#output-box',el=>el.textContent),/LG WEBOS/);
    // Phone pairing must work without starting remote camera or asking for
    // camera access. Repeated presses cannot create duplicate pairing codes.
    await page.evaluate(()=>{
      window.__savedDeviceShortcut=window.ULTRON_DEVICES;
      window.__savedCameraShortcut=window.ULTRON_MOBILE_CAMERA;
      window.__mobilePairShortcutCalls=0;
      window.__cameraShortcutCalls=0;
      window.ULTRON_DEVICES={
        ...window.ULTRON_DEVICES,
        listDevices:async()=>[],
        startPairing:async()=>{
          window.__mobilePairShortcutCalls++;
          return {ok:true,code:'654321',expiresInSeconds:600};
        }
      };
      window.ULTRON_MOBILE_CAMERA={
        ...window.ULTRON_MOBILE_CAMERA,
        smartConnect:()=>{window.__cameraShortcutCalls++;return Promise.resolve(false);}
      };
    });
    await page.click('#btn-pair-mobile');
    const pairDebug=await page.evaluate(()=>({
      version:window.ULTRON_MOBILE_LINK?.version,
      current:window.ULTRON_MOBILE_LINK?.state,
      callCount:window.__mobilePairShortcutCalls,
      cameraCount:window.__cameraShortcutCalls,
      session:document.getElementById('bridge-session-state')?.textContent,
      link:document.getElementById('bridge-link-state')?.textContent,
      terminal:document.getElementById('output-box')?.textContent.slice(-650)
    }));
    console.log('PHONE PAIRING DEBUG',JSON.stringify(pairDebug));
    await page.waitForFunction(()=>document.getElementById('bridge-session-state')
      ?.textContent==='CODE 654321',{timeout:6000});
    assert.equal(await page.evaluate(()=>window.__mobilePairShortcutCalls),1);
    assert.equal(await page.evaluate(()=>window.__cameraShortcutCalls),0,
      'Connect phone must not activate remote camera');
    await page.click('#btn-pair-mobile');
    assert.equal(await page.evaluate(()=>window.__mobilePairShortcutCalls),1,
      'Do not generate a second code while previous code is valid');
    await page.evaluate(()=>{
      window.ULTRON_DEVICES.listDevices=async()=>[{
        id:'mock-mobile-bridge',deviceType:'mobile',deviceName:'Android de teste',
        online:true,status:'active',lastSeenAt:new Date().toISOString()
      }];
      return window.ULTRON_MOBILE_LINK.refresh();
    });
    await page.waitForFunction(()=>document.getElementById('bridge-link-state')
      ?.textContent==='ONLINE');
    assert.equal(await page.evaluate(()=>window.__cameraShortcutCalls),0);
    await page.evaluate(()=>{
      window.ULTRON_DEVICES.listDevices=async()=>[{
        id:'mock-mobile-bridge',deviceType:'mobile',deviceName:'Android de teste',
        online:false,status:'active',lastSeenAt:'2020-01-01 00:00:00'
      }];
      return window.ULTRON_MOBILE_LINK.refresh();
    });
    await page.waitForFunction(()=>document.getElementById('bridge-link-state')
      ?.textContent==='OFFLINE');
    await page.evaluate(()=>{
      window.ULTRON_DEVICES=window.__savedDeviceShortcut;
      window.ULTRON_MOBILE_CAMERA=window.__savedCameraShortcut;
    });

    // Offline local files remain safe, yet permit explicitly chosen files.
    await page.evaluate(()=>{
      window.__savedFilesUi=window.ULTRON_LOCAL_FILES;
      window.ULTRON_LOCAL_FILES={
        health:async()=>({ok:false,permission:'prompt',error:'Failed to fetch'}),
        files:async()=>{throw Error('Unexpected local access');}
      };
    });
    await page.click('[data-cc="files"]');
    await page.waitForFunction(()=>document.getElementById('output-box')
      .textContent.includes('LOCAL CORE OFFLINE'),{timeout:5000});
    await page.$eval('.jarvis-cc-inline-result:last-child',el=>{
      const b=[...el.querySelectorAll('button')].find(
        b=>b.textContent.includes('Selecionar arquivos manualmente'));
      b?.setAttribute('data-test-file-picker','true');
    });
    const chooserPromise=page.waitForFileChooser({timeout:8000});
    await page.click('[data-test-file-picker="true"]');
    const chooser=await chooserPromise;
    assert.ok(chooser,'Manual files action must open OS file chooser on user gesture');
    await chooser.cancel();
    await page.evaluate(()=>{window.ULTRON_LOCAL_FILES=window.__savedFilesUi;});

    // Agenda is a working, explicitly LOCAL scheduler (no invented Google sync).
    await page.click('[data-cc="agenda"]');
    await page.$eval('.jarvis-cc-inline-result:last-child',el=>{
      const b=[...el.querySelectorAll('button')].find(b=>b.textContent.includes('Adicionar compromisso'));
      b?.setAttribute('data-test-agenda-add','true');
    });
    await page.click('[data-test-agenda-add="true"]');
    await page.waitForSelector('.jarvis-cc-agenda-form input[type="datetime-local"]');
    await page.type('.jarvis-cc-agenda-form input[type="text"]','Teste de agenda local');
    await page.$eval('.jarvis-cc-agenda-form input[type="datetime-local"]',
      input=>{input.value='2099-01-01T10:00';input.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.click('.jarvis-cc-agenda-form button[type="submit"]');
    await page.waitForFunction(()=>document.getElementById('output-box')
      .textContent.includes('Teste de agenda local'),{timeout:5000});
    assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('jarvis_local_agenda_v1')||'[]')
      .some(x=>x.title==='Teste de agenda local')));
    await page.evaluate(()=>{
      const all=JSON.parse(localStorage.getItem('jarvis_local_agenda_v1')||'[]');
      localStorage.setItem('jarvis_local_agenda_v1',JSON.stringify(
        all.filter(x=>x.title!=='Teste de agenda local')));
    });
    await page.close();
  }
  console.log('NEURAL ANSWER PASS: ring-only boot; responsive stacked/split layout; compact square image cards; distinct inline video lane; mobile/laptop/TV');
}finally{await browser.close();}
