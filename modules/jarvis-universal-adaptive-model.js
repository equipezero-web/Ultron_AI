// Device and connection adaptation without device-name sniffing, fabricated
// network reachability, or assuming navigator.connection exists on iOS/Safari.
// Pure functions allow identical decisions across browsers and Node tests.
const finite=(v,fallback)=>Number.isFinite(Number(v))?Number(v):fallback;
const bound=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const validType=new Set(["slow-2g","2g","3g","4g"]);
export function classifyJarvisNetwork({
 online=true,effectiveType="",downlink=null,rtt=null,saveData=false
}={}){
 const type=validType.has(String(effectiveType).toLowerCase())?
  String(effectiveType).toLowerCase():"unknown";
 const rate=downlink===null?null:bound(finite(downlink,0),0,10000);
 const latency=rtt===null?null:bound(finite(rtt,0),0,100000);
 if(!online)return {status:"offline",tier:"offline",effectiveType:type,
  saveData:!!saveData,slow:true,reason:"navigator-offline"};
 const slow=type==="slow-2g"||type==="2g"||type==="3g"||
  (rate!==null&&rate<1.5)||(latency!==null&&latency>=600);
 const tier=saveData||slow?"limited":"standard";
 return {status:"browser-online",tier,effectiveType:type,
  downlink:rate,rtt:latency,saveData:!!saveData,slow,
  reason:saveData?"user-save-data":slow?"network-hint":"browser-network-unknown"};
}
// '4g' is a measured/effective network category, NOT proof that the phone's
// cellular radio is on LTE: browsers often report 4g for 5G and Wi-Fi too.
export function classifyJarvisDevice({
 width=390,height=844,coarsePointer=true,deviceMemory=null,
 hardwareConcurrency=null,reducedMotion=false
}={}){
 const w=bound(finite(width,390),1,16384),h=bound(finite(height,844),1,16384);
 const shortest=Math.min(w,h);
 const coarse=!!coarsePointer;
 const layout=coarse&&shortest<650?"phone":
  coarse&&shortest<1024?"tablet":
  !coarse&&w>=1920?"tv":w<820?"phone":w<1100?"tablet":"desktop";
 const mem=deviceMemory===null?null:bound(finite(deviceMemory,4),0,256);
 const cores=hardwareConcurrency===null?null:bound(finite(hardwareConcurrency,4),0,256);
 const lowPower=(mem!==null&&mem<=2)||(cores!==null&&cores<=4);
 return {layout,width:w,height:h,coarsePointer:coarse,
  deviceMemory:mem,hardwareConcurrency:cores,lowPower,
  reducedMotion:!!reducedMotion,landscape:w>h};
}
export function deriveJarvisProfile(device,network){
 const layout=device.layout||"phone";
 let tier=device.lowPower?"economy":layout==="phone"||layout==="tablet"?
  "balanced":"high";
 if(network?.tier==="limited"||network?.tier==="offline")tier="economy";
 const params={
  economy:{fps:15,dprCap:1,maxCanvasPixels:390000,particleStride:4,
   animationScale:.7},
  balanced:{fps:24,dprCap:1.25,maxCanvasPixels:850000,particleStride:2,
   animationScale:1},
  high:{fps:30,dprCap:1.45,maxCanvasPixels:1550000,particleStride:1,
   animationScale:1}
 }[tier];
 return {...params,tier,layout,networkTier:network?.tier||"standard",
  reducedMotion:!!device.reducedMotion,
  visualEffects:!device.reducedMotion&&tier!=="economy",
  allowAutoplayMedia:false,allowUnrequestedTransfers:false,
  onlineStatus:network?.status||"browser-online"};
}
export function jarvisRenderDimensions(cssWidth,cssHeight,devicePixelRatio,profile){
 const w=Math.max(1,finite(cssWidth,1)),h=Math.max(1,finite(cssHeight,1));
 const dpr=bound(finite(devicePixelRatio,1),.25,8);
 const cap=bound(finite(profile?.dprCap,1),.5,3);
 const pixelBudget=bound(finite(profile?.maxCanvasPixels,390000),10000,16000000);
 const ratio=Math.min(dpr,cap,Math.sqrt(pixelBudget/(w*h)));
 return {width:Math.max(1,Math.floor(w*ratio)),
  height:Math.max(1,Math.floor(h*ratio)),pixelRatio:ratio};
}
export function jarvisNetworkMessage(network){
 if(network.tier==="offline")
  return "NAVEGADOR SEM REDE · TERMINAL LOCAL";
 if(network.tier==="limited")
  return "REDE LIMITADA · MODO ECONÔMICO";
 return "NAVEGADOR CONECTADO · BACKEND NÃO VERIFICADO";
}
