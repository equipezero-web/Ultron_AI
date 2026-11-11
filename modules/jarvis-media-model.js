// Phase 2: media belongs to the answer, not to the 3D stage background.
// The normalized collection is small, source-attributed and separate by kind.
export const mediaUrl=value=>{
 try{const url=new URL(String(value||""));return ["http:","https:"].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}
 catch{return null;}
};
const short=(value,max=110)=>String(value||"").replace(/[\r\n\t]+/g," ").replace(/\s+/g," ").trim().slice(0,max);
const dateText=value=>{
 if(!value)return "";
 const d=new Date(value);
 return Number.isFinite(d.getTime())?d.toLocaleDateString("pt-BR"):"";
};
const ytid=value=>/^[a-zA-Z0-9_-]{11}$/.test(String(value||""))?String(value):null;
export function buildMediaModel(visual,{maxImages=4,maxVideos=2}={}){
 const cards=Array.isArray(visual?.cards)?visual.cards:[];
 const imageInputs=[
  ...(Array.isArray(visual?.images)?visual.images:[]).map(item=>typeof item==="string"?{src:item}:item),
  ...cards.filter(c=>c&&(c.image||c.imageUrl||(!c.videoId&&c.thumbnail))).map(c=>({
   src:c.image||c.imageUrl||c.thumbnail,title:c.title||c.alt,
   description:c.description||c.summary,source:c.source||c.publisher,
   date:c.publishedAt||c.date,sourceUrl:c.url||c.sourceUrl
  }))
 ];
 const seenImages=new Set(),images=[];
 for(const item of imageInputs){
  const src=mediaUrl(item?.src||item?.image||item?.imageUrl);
  if(!src||seenImages.has(src))continue;
  seenImages.add(src);
  const title=short(item.title||item.alt||"Imagem relacionada",90);
  images.push({
   src,title,
   alt:short(item.alt||item.title||"Imagem relacionada ao assunto",150),
   description:short(item.description||item.summary,180),
   source:short(item.source||item.publisher,60),
   date:dateText(item.publishedAt||item.date),
   sourceUrl:mediaUrl(item.sourceUrl||item.url),
   thumbnail:mediaUrl(item.thumbnail)
  });
  if(images.length>=maxImages)break;
 }
 const seenVideos=new Set(),videos=[];
 for(const item of Array.isArray(visual?.videos)?visual.videos:[]){
  const id=ytid(item?.id);
  if(!id||seenVideos.has(id))continue;
  seenVideos.add(id);
  videos.push({
   id,title:short(item.title||"Vídeo relacionado",110),
   description:short(item.description||item.summary,160),
   source:short(item.source||item.channel||"YouTube",60),
   date:dateText(item.publishedAt||item.date),
   poster:mediaUrl(item.thumbnail)||"https://i.ytimg.com/vi/"+id+"/hqdefault.jpg",
   sourceUrl:"https://www.youtube.com/watch?v="+id
  });
  if(videos.length>=maxVideos)break;
 }
 return {images,videos};
}
