import assert from 'node:assert/strict';
import {needsVisualResearch,shouldResearchBeforeAnswer,searchGoogle,researchVisualContext} from '../backend/web-research.js';
import {isGeneralNewsIntent,isLiveNewsIntent,loadLiveNewsContext} from '../backend/news-context.js';
assert.ok(isGeneralNewsIntent('Qual a notícia principal de hoje?'));
assert.ok(isGeneralNewsIntent('Quais as novidades de hoje?'));
assert.ok(isLiveNewsIntent('Quais as novidades?'));
assert.equal(isGeneralNewsIntent('Como anda o governo da China atualmente?'),false);
assert.ok(needsVisualResearch('Como anda o governo da China atualmente?'));
assert.ok(shouldResearchBeforeAnswer('Como anda o governo da China atualmente?').needed);
assert.equal(needsVisualResearch('Quanto é dois mais dois?'),false);
const requests=[];
const original=globalThis.fetch;
globalThis.fetch=async (input,init)=>{
 const url=String(input);
 requests.push(url);
 if(url.includes('google.serper.dev/images'))return new Response(JSON.stringify({images:[{title:'China',imageUrl:'https://example.org/china.jpg',link:'https://example.org/china'}]}),{status:200});
 if(url.includes('google.serper.dev/search'))return new Response(JSON.stringify({organic:[{title:'China',link:'https://example.org/china',snippet:'Fonte de teste'}]}),{status:200});
 if(url.includes('news.google.com'))return new Response('<rss></rss>',{status:200});
 if(url.includes('gdeltproject.org')){
   const q=new URL(url).searchParams.get('query')||'';
   const world=/internacionais|mundo|world OR international|United States/i.test(q);
   const region=world?'world':'brasil';
   return new Response(JSON.stringify({articles:Array.from({length:5},(_,i)=>({title:region+' notícia '+i,url:'https://example.org/'+region+'/'+i,socialimage:'https://example.org/'+region+'/'+i+'.jpg',seendate:new Date().toISOString(),domain:'example.org',language:'Portuguese',sourcecountry:'Brazil'}))}),{status:200});
 }
 throw new Error('Unexpected fetch '+url);
};
try{
 const research=await searchGoogle({SERPER_API_KEY:'mock'},'Como anda o governo da China atualmente?');
 assert.equal(researchVisualContext(research).images[0].src,'https://example.org/china.jpg');
 assert.ok(requests.some(u=>u.includes('/images')));
 const news=await loadLiveNewsContext('Quais as novidades de hoje?',{limit:6});
 assert.ok(news.articles.length>=2,JSON.stringify(news));
 assert.equal(news.articles[0].region,'Brasil');
 assert.ok(news.articles.some(x=>x.region==='Mundo'));
 assert.ok(news.contextText.includes('[Brasil]'));
 assert.ok(news.visualContext.images.length);
 console.log('BRAZIL FIRST + AUTOMATIC IMAGES PASS');
}finally{globalThis.fetch=original;}
