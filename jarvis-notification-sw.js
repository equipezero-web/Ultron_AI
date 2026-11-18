/* J.A.R.V.I.S. notifications: no fetch interception, no offline caching and no device access. */
self.addEventListener("push",event=>{
 event.waitUntil((async()=>{
  let payload;try{payload=event.data?.json();}catch{return;}
  if(!payload||!["official-alert","verified-news"].includes(payload.kind))return;
  const timestamp=Date.parse(payload.publishedAt);
  if(!Number.isFinite(timestamp)||Date.now()-timestamp>24*60*60*1000||
     timestamp>Date.now()+5*60*1000)return;
  let url;try{const parsed=new URL(payload.url);if(parsed.protocol!=="https:"||
    parsed.username||parsed.password)return;url=parsed.href;}catch{return;}
  const title=String(payload.title||"").replace(/[<>\r\n]/g," ").slice(0,110);
  if(!title)return;
  await self.registration.showNotification(title,{
   body:String(payload.body||"Verifique a fonte e a validade do aviso.").replace(/[<>\r\n]/g," ").slice(0,180),
   tag:"jarvis-push-"+String(payload.id||timestamp).replace(/[^a-z0-9-]/gi,"").slice(0,48),
   data:{url},renotify:false
  });
 })());
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  let href;try{const url=new URL(event.notification.data?.url);
   if(url.protocol!=="https:"||url.username||url.password)return;href=url.href;}catch{return;}
  const clientsList=await clients.matchAll({type:"window",includeUncontrolled:true});
  const match=clientsList.find(client=>client.url===href);
  if(match){await match.focus();return;}
  await clients.openWindow(href);
 })());
});
