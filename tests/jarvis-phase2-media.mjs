import assert from "node:assert/strict";
import {buildMediaModel,mediaUrl} from "../modules/jarvis-media-model.js";
assert.equal(mediaUrl("javascript:alert(1)"),null);
assert.equal(mediaUrl("https://user:pass@example.org/img.png"),null);
assert.equal(mediaUrl("https://example.org/photo.png"),"https://example.org/photo.png");
const visual={
 images:[
  {src:"https://example.org/a.jpg",alt:"Foto relevante",source:"Agência pública",sourceUrl:"https://example.org/noticia",description:"Impactos confirmados no local"},
  {src:"https://example.org/a.jpg",alt:"Duplicata"},
  {src:"javascript:alert(1)",alt:"Inválido"}
 ],
 cards:[{title:"Região afetada",source:"Defesa Civil",publishedAt:"2026-11-11T12:00:00Z",imageUrl:"https://example.org/b.jpg",url:"https://example.org/relatorio"}],
 videos:[
  {id:"abcdefghijk",title:"Reportagem em vídeo",source:"Jornal",thumbnail:"https://example.org/poster.jpg"},
  {id:"abcdefghijk",title:"Duplicado"},
  {id:"invalid<script>",title:"Não permitido"}
 ]
};
const model=buildMediaModel(visual);
assert.equal(model.images.length,2,"Deduplicate and validate photos");
assert.equal(model.images[0].description,"Impactos confirmados no local");
assert.equal(model.images[0].sourceUrl,"https://example.org/noticia");
assert.equal(model.images[1].title,"Região afetada");
assert.match(model.images[1].date,/2026|11/);
assert.equal(model.videos.length,1);
assert.equal(model.videos[0].id,"abcdefghijk");
assert.equal(model.videos[0].sourceUrl,"https://www.youtube.com/watch?v=abcdefghijk");
assert.notEqual(model.images[0].src,model.videos[0].poster);
assert.deepEqual(buildMediaModel({}),{images:[],videos:[]});
const bounded=buildMediaModel({images:Array.from({length:20},(_,i)=>({src:"https://example.org/"+i+".jpg"})),videos:Array.from({length:6},(_,i)=>({id:"abcdefghij"+i}))});
assert.equal(bounded.images.length,4,"Never flood the Ring with large photo collections");
assert.equal(bounded.videos.length,2,"Limit embedded players to preserve performance");
console.log("JARVIS PHASE 2 MEDIA PASS: square-image metadata, separate video player sources, deduplication, safe URLs and bounded collections");
