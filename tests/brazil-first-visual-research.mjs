import assert from 'node:assert/strict';
import {needsVisualResearch,shouldResearchBeforeAnswer,searchGoogle,researchVisualContext,normalizeResearchQuestion,resolveResearchQuery,answerLooksUncertain,youtubeVideoId} from '../backend/web-research.js';
import {isGeneralNewsIntent,isLiveNewsIntent,loadLiveNewsContext} from '../backend/news-context.js';
assert.ok(isGeneralNewsIntent('Qual a notícia principal de hoje?'));
assert.ok(isGeneralNewsIntent('JARVIS, quais são as principais notícias de hoje?'));
assert.equal(isGeneralNewsIntent('Quais as novidades do iPhone hoje?'),false);
assert.equal(isLiveNewsIntent('Qual a temperatura em Recife hoje?'),false);
assert.equal(isLiveNewsIntent('Qual o preço do dólar hoje?'),false);
assert.equal(normalizeResearchQuestion('Jarvis, me diga como anda o governo da China atualmente?'),'como anda o governo da China atualmente?');
assert.ok(shouldResearchBeforeAnswer('Jarvis, como anda o governo da China atualmente?').needed);
assert.equal(shouldResearchBeforeAnswer('Jarvis, ligue a TV agora').needed,false);
assert.equal(shouldResearchBeforeAnswer('Escreva uma história sobre a China hoje').needed,false);
assert.equal(shouldResearchBeforeAnswer('Quanto é 2 + 2?').needed,false);
assert.match(resolveResearchQuery('E hoje?','Como anda o governo da China?'),/China.*hoje/);
assert.equal(resolveResearchQuery('E hoje?','Qual meu saldo?'),'E hoje?');
assert.ok(answerLooksUncertain('Quer que eu pesquise?'));
for(const question of [
 'Como funciona um motor turbo?', 'Quem foi Nikola Tesla?', 'Quanto custa a Pulsar N150?',
 'O que aconteceu na Argentina hoje?', 'Como está o mercado de inteligência artificial?',
 'Qual a diferença entre mitose e meiose?', 'Me fale sobre a Islândia',
 'Fotossíntese', 'Mercado de semicondutores', 'Qual é a capital do Cazaquistão?',
 'O Japão tem terremotos?', 'O que significa entropia?', 'Vale a pena usar energia solar?'
]) assert.ok(shouldResearchBeforeAnswer(question).needed,question);
for(const question of ['Jarvis, ligue a TV agora','Escreva uma história sobre a China hoje','Qual meu saldo?','Qual minha senha?','Mostre meus arquivos','Obrigado','Quanto é 2 + 2?']) assert.equal(shouldResearchBeforeAnswer(question).needed,false,question);
assert.ok(needsVisualResearch('Quem foi Nikola Tesla?'));
assert.ok(needsVisualResearch('Mostre uma foto de um axolote'));
assert.equal(isGeneralNewsIntent('O que aconteceu na Argentina hoje?'),false);
assert.equal(isGeneralNewsIntent('Quais as novidades do iPhone hoje?'),false);
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
 if(url.includes('google.serper.dev/videos'))return new Response(JSON.stringify({videos:[{title:'Vídeo de teste',link:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}]}),{status:200});
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
 assert.ok(requests.some(u=>u.includes('/videos')));
 assert.equal(researchVisualContext(research).videos[0].id,'dQw4w9WgXcQ');
 assert.equal(youtubeVideoId('https://evil.example/watch?v=dQw4w9WgXcQ'),null);
 const motor=await searchGoogle({SERPER_API_KEY:'mock'},'Como funciona um motor turbo?');
 assert.ok(motor.images.length&&motor.videos.length,'Media retrieval must work beyond named countries');
 // A normal question must yield media even when regular search fails.
 const successfulMock=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{
   const u=String(input);
   if(u.endsWith('/search'))return new Response('{}',{status:503});
   return successfulMock(input,init);
 };
 const partial=await searchGoogle({SERPER_API_KEY:'mock'},'Como funciona um motor turbo?');
 assert.equal(partial.results.length,0);
 assert.ok(partial.images.length&&partial.videos.length,'Text-search failure must preserve actual media');
 assert.equal(partial.mediaStatus.automatic,true);
 globalThis.fetch=async(input,init)=>{
   const u=String(input),q=JSON.parse(init?.body||'{}').q||'';
   if(u.endsWith('/videos'))return new Response('{}',{status:503});
   if(u.endsWith('/search')&&q.includes('site:youtube.com/watch'))return new Response(JSON.stringify({organic:[{title:'Motor turbo',link:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}]}),{status:200});
   return successfulMock(input,init);
 };
 const recovered=await searchGoogle({SERPER_API_KEY:'mock'},'Como funciona um motor turbo?');
 assert.equal(recovered.videos[0].id,'dQw4w9WgXcQ');
 globalThis.fetch=successfulMock;
 const news=await loadLiveNewsContext('Quais as novidades de hoje?',{limit:6});
 assert.ok(news.articles.length>=2,JSON.stringify(news));
 assert.equal(news.articles[0].region,'Brasil');
 assert.ok(news.articles.some(x=>x.region==='Mundo'));
 assert.ok(news.contextText.includes('[Brasil]'));
 assert.ok(news.visualContext.images.length);
 console.log('BRAZIL FIRST + AUTOMATIC IMAGES PASS');
}finally{globalThis.fetch=original;}
