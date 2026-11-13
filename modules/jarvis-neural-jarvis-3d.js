import {NEURAL_JARVIS_ARCHITECTURE,clampBands,computeNeuralJarvisVisual}
 from "./jarvis-neural-jarvis-model.js";

// One WebGL canvas, inside the existing Command Center. No extra pages,
// duplicate controls or unrequested microphone/camera access.
// Geometry follows the operator's provided three-layer holographic matrix.
export function createNeuralJarvis3D(canvas,{onError}={}){
 if(!canvas)throw Error("Canvas Neural Jarvis indisponível");
 const gl=canvas.getContext("webgl",{alpha:true,antialias:true,depth:true,
  premultipliedAlpha:false,powerPreference:"low-power"})||
  canvas.getContext("experimental-webgl",{alpha:true,antialias:true,depth:true});
 if(!gl)throw Error("WebGL indisponível para Neural Jarvis");
 const vsource=[
  "attribute vec3 aPos;",
  "uniform float uTime,uAspect,uYaw,uPitch,uZoom,uSpeed,uExpand;",
  "uniform float uBass,uMid,uHigh,uKind,uLayer,uSize;",
  "varying float vLight; varying float vPoint;",
  "vec3 ry(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(v.x*c+v.z*s,v.y,-v.x*s+v.z*c);}",
  "vec3 rx(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(v.x,v.y*c-v.z*s,v.y*s+v.z*c);}",
  "void main(){",
  " vec3 p=aPos; float t=uTime*uSpeed;",
  " if(uKind<.5){",
  "  float lateral=sin(p.y*6.+t*7.)*cos(p.x*4.-t*5.);",
  "  float d=uBass*.21+(lateral*uBass*.17)+sin(p.z*8.+t*6.)*uMid*.09;",
  "  p+=normalize(p)*d;",
  " }else if(uKind<1.5){",
  "  p*=max(.08,1.-uExpand*(.11+uLayer*.22));",
  "  p=ry(p,t*(.095+uLayer*.028)*(mod(uLayer,2.)<.5?1.:-1.));",
  "  p=rx(p,t*(.047+uLayer*.021));",
  " }else if(uKind<2.5){",
  "  p*=1.+uExpand*.12;",
  "  p=ry(p,t*(.14+uLayer*.04)*(mod(uLayer,2.)<.5?1.:-1.));",
  "  p=rx(p,t*(.07+uLayer*.02));",
  " }else if(uKind<3.5){",
  "  p=ry(p,t*.09);p+=normalize(p)*sin(t*14.+p.y*5.)*uMid*.06;",
  " }else if(uKind<4.5){",
  "  p=ry(p,-t*.055);p*=1.+uExpand*.18+sin(t*17.+p.x*7.)*uHigh*.04;",
  " }else if(uKind<5.5){",
  "  p=ry(p,t*.17);p=rx(p,t*.04);",
  " }",
  " p=ry(p,uYaw);p=rx(p,uPitch);",
  " float pr=8.2/max(6.,12.-p.z);",
  " float fit=uAspect<.85?.65:.88;",
  " gl_Position=vec4(p.x*pr*uZoom*.38*fit/max(.80,uAspect),",
  "                  p.y*pr*uZoom*.38*fit,(-p.z)/12.,1.);",
  " gl_PointSize=uSize*(1.+uHigh*.75);",
  " vLight=.35+.65*abs(dot(normalize(p+vec3(.01,.01,.02)),normalize(vec3(.3,.6,.9))));",
  " vPoint=uKind>3.5&&uKind<4.5?1.:0.;",
  "}"
 ].join("\n");
 const fsource=[
  "precision mediump float;",
  "uniform vec3 uColor; uniform float uAlpha;",
  "varying float vLight; varying float vPoint;",
  "void main(){",
  " float falloff=1.;",
  " if(vPoint>.5){",
  "  float r=length(gl_PointCoord-vec2(.5));",
  "  if(r>.48)discard;",
  "  falloff=1.-smoothstep(.13,.48,r);",
  " }",
  " gl_FragColor=vec4(uColor*(.55+vLight*.66),uAlpha*falloff);",
  "}"
 ].join("\n");
 const shader=(type,source)=>{
  const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
   const issue=gl.getShaderInfoLog(s);gl.deleteShader(s);
   throw Error("Neural Jarvis shader: "+issue);
  }
  return s;
 };
 const program=gl.createProgram();
 const vs=shader(gl.VERTEX_SHADER,vsource),fs=shader(gl.FRAGMENT_SHADER,fsource);
 gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
 gl.deleteShader(vs);gl.deleteShader(fs);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))
  throw Error("Neural Jarvis program: "+gl.getProgramInfoLog(program));
 const pos=gl.getAttribLocation(program,"aPos");
 const uniform=Object.fromEntries(["Time","Aspect","Yaw","Pitch","Zoom","Speed",
  "Expand","Bass","Mid","High","Kind","Layer","Size","Color","Alpha"]
  .map(k=>[k,gl.getUniformLocation(program,"u"+k)]));
 const geometry=[];
 function upload(name,vertices,{mode=gl.TRIANGLES,color=[.88,.92,1],alpha=.6,
  kind=0,layer=0,pointSize=2.6}={}){
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  const floats=new Float32Array(vertices);
  gl.bufferData(gl.ARRAY_BUFFER,floats,gl.STATIC_DRAW);
  geometry.push({name,buffer,count:floats.length/3,mode,
   color:new Float32Array(color),alpha,kind,layer,pointSize});
 }
 const sphere=(radius,lat=22,lon=34)=>{
  const grid=[];
  for(let i=0;i<=lat;i++){
   const phi=i/lat*Math.PI;
   for(let j=0;j<=lon;j++){
    const th=j/lon*Math.PI*2;
    grid.push([radius*Math.sin(phi)*Math.cos(th),
     radius*Math.cos(phi),radius*Math.sin(phi)*Math.sin(th)]);
   }
  }
  const out=[];
  const push=idx=>out.push(...grid[idx]);
  for(let i=0;i<lat;i++)for(let j=0;j<lon;j++){
   const a=i*(lon+1)+j,b=a+lon+1;
   push(a);push(b);push(a+1);push(b);push(b+1);push(a+1);
  }
  return out;
 };
 upload("core",sphere(.76),{kind:0,color:[.94,.96,1],alpha:.91});
 upload("outer-core",sphere(1.06,10,18),{
  kind:5,color:[.57,.78,.93],alpha:.13});
 // Deterministic fragmented shell plates, 18 + 22 + 24 sectors, 3 layers.
 const plateRadii=[1.75,2.45,3.15],plateColors=[
  [.63,.79,.86],[.51,.68,.78],[.68,.78,.88]];
 NEURAL_JARVIS_ARCHITECTURE.plates.forEach((count,layer)=>{
  const vertices=[],radius=plateRadii[layer],golden=2.399963229728653;
  for(let i=0;i<count;i++){
   const y=1-2*(i+.5)/count,phi=Math.acos(y),theta=i*golden;
   const w=(.24+layer*.015),h=.20;
   const point=(a,b)=>{
    const p=phi+a,q=theta+b;
    return [radius*Math.sin(p)*Math.cos(q),
     radius*Math.cos(p),radius*Math.sin(p)*Math.sin(q)];
   };
   const a=point(-h,-w),b=point(-h,w),c=point(h,-w),d=point(h,w);
   vertices.push(...a,...c,...b,...b,...c,...d);
  }
  upload("shell-"+layer,vertices,{
   kind:1,layer,color:plateColors[layer],alpha:.35});
 });
 const rot=(p,rx,ry,rz)=>{
  let [x,y,z]=p;
  let c=Math.cos(rx),s=Math.sin(rx);[y,z]=[y*c-z*s,y*s+z*c];
  c=Math.cos(ry);s=Math.sin(ry);[x,z]=[x*c+z*s,-x*s+z*c];
  c=Math.cos(rz);s=Math.sin(rz);[x,y]=[x*c-y*s,x*s+y*c];
  return [x,y,z];
 };
 const arcSpec=[
  [2.15,1.4,Math.PI/3,.2,0,.018],
  [2.75,1.2,-Math.PI/4,Math.PI/5,.4,.014],
  [3.35,.95,Math.PI/2.2,-.3,.8,.022],
  [3.75,1.6,.3,Math.PI/3,-.5,.012],
  [4.1,.8,-.5,-Math.PI/4,.2,.016]
 ];
 arcSpec.forEach(([radius,turns,rx,ry,rz,width],layer)=>{
  const out=[],segments=128;
  for(let i=0;i<segments;i++){
   const a=i/segments*turns*Math.PI,b=(i+1)/segments*turns*Math.PI;
   const at=(t,r)=>rot([r*Math.cos(t),r*Math.sin(t),0],rx,ry,rz);
   const p1=at(a,radius-width),p2=at(a,radius+width);
   const p3=at(b,radius-width),p4=at(b,radius+width);
   out.push(...p1,...p2,...p3,...p3,...p2,...p4);
  }
  upload("gyro-"+layer,out,{kind:2,layer,color:[.84,.91,.99],alpha:.71-layer*.075});
 });
 let seed=0x9e3779b9;
 const rand=()=>{
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;
 };
 const nodes=[];
 for(let i=0;i<NEURAL_JARVIS_ARCHITECTURE.nodes;i++){
  const theta=2*Math.PI*rand(),v=2*rand()-1,r=1.3+rand()*2.1;
  const p=Math.acos(v);
  nodes.push([r*Math.sin(p)*Math.cos(theta),
   r*Math.sin(p)*Math.sin(theta),r*Math.cos(p)]);
 }
 const links=[];
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
  const a=nodes[i],b=nodes[j];
  if(Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])<.87)
   links.push(...a,...b);
 }
 upload("synapses",links,{mode:gl.LINES,kind:3,color:[.49,.80,.99],alpha:.28});
 const sparks=[];
 for(let i=0;i<NEURAL_JARVIS_ARCHITECTURE.particles;i++){
  const theta=rand()*Math.PI*2,v=2*rand()-1,r=1.15+rand()*2.85;
  const p=Math.acos(v);
  sparks.push(r*Math.sin(p)*Math.cos(theta),r*Math.sin(p)*Math.sin(theta),
   r*Math.cos(p));
 }
 upload("particles",sparks,{mode:gl.POINTS,kind:4,color:[.9,.96,1],alpha:.75,
  pointSize:window.devicePixelRatio>1?3.0:2.3});
 gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
 let visible=false,disposed=false,paused=false,frame=0,lastFrame=0;
 const mobile=window.matchMedia("(max-width: 820px)");
 const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
 const lowMemory=Number(navigator.deviceMemory||4)<=2;
 let width=0,height=0,yaw=0,pitch=0,zoom=1,expanded=false,overdrive=false;
 let bands=clampBands(),drag=null,started=performance.now();
 const touches=new Map();let pinch=null;
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 function resize(){
  if(disposed)return;
  const r=canvas.getBoundingClientRect();
  const dpr=Math.min(window.devicePixelRatio||1,mobile.matches?(lowMemory?1:1.3):1.6);
  const w=Math.max(1,Math.floor(r.width*dpr)),h=Math.max(1,Math.floor(r.height*dpr));
  if(w!==width||h!==height){width=w;height=h;canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
 }
 function render(now){
  frame=0;
  if(!visible||paused||disposed||document.hidden)return;
  const interval=mobile.matches?(lowMemory?60:38):28;
  if(now-lastFrame>=interval){
   lastFrame=now;
   gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   gl.useProgram(program);
   const values=computeNeuralJarvisVisual({
    time:(now-started)/1000,bands,overdrive,expanded,reducedMotion:reduced.matches});
   const u=(name,n)=>gl.uniform1f(uniform[name],n);
   u("Time",(now-started)/1000);u("Speed",values.speed);
   u("Aspect",Math.max(.6,width/height));u("Yaw",yaw);u("Pitch",pitch);u("Zoom",zoom);
   u("Expand",values.expansion);
   u("Bass",bands.bass);u("Mid",bands.mid);u("High",bands.high);
   gl.enableVertexAttribArray(pos);
   for(const piece of geometry){
    gl.bindBuffer(gl.ARRAY_BUFFER,piece.buffer);
    gl.vertexAttribPointer(pos,3,gl.FLOAT,false,0,0);
    u("Kind",piece.kind);u("Layer",piece.layer);
    u("Size",piece.pointSize);
    gl.uniform3fv(uniform.Color,piece.color);u("Alpha",piece.alpha);
    // Draw each authored component from a separate buffer, no extra pages.
    gl.drawArrays(piece.mode,0,piece.count);
   }
  }
  frame=requestAnimationFrame(render);
 }
 function start(){
  if(disposed||paused||!visible||document.hidden)return;
  cancelAnimationFrame(frame);frame=requestAnimationFrame(render);
 }
 function endDrag(e){
  if(e?.pointerType==="touch"){
   touches.delete(e.pointerId);if(touches.size<2)pinch=null;
   if(drag?.id===e.pointerId)drag=null;
  }else{drag=null;if(!e){touches.clear();pinch=null;}}
  if(e?.pointerId!=null&&canvas.hasPointerCapture?.(e.pointerId)){
   try{canvas.releasePointerCapture(e.pointerId);}catch{}
  }
 }
 function onDown(e){
  if(!visible||disposed||(e.pointerType!=="touch"&&e.button!==0))return;
  if(e.pointerType==="touch"){
   touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(touches.size===2){
    const [a,b]=[...touches.values()];
    pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom};
    drag=null;e.preventDefault();return;
   }
  }
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,oy:yaw,op:pitch,prevY:e.clientY,
   mobileScroll:false};
  try{canvas.setPointerCapture?.(e.pointerId);}catch{}
  e.preventDefault();
 }
 function onMove(e){
  if(!visible||disposed)return;
  if(e.pointerType==="touch"&&touches.has(e.pointerId)){
   touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(touches.size>=2&&pinch){
    const [a,b]=[...touches.values()];
    zoom=clamp(pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pinch.distance,.54,1.8);
    e.preventDefault();return;
   }
  }
  if(!drag||e.pointerId!==drag.id)return;
  if(e.pointerType==="mouse"&&!(e.buttons&1)){endDrag(e);return;}
  if(e.pointerType==="touch"&&touches.size===1){
   const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
   if(!drag.mobileScroll&&Math.abs(dy)>9&&Math.abs(dy)>Math.abs(dx)*1.3)
    drag.mobileScroll=true;
   if(drag.mobileScroll){
    window.scrollBy({top:drag.prevY-e.clientY,behavior:"instant"});
    drag.prevY=e.clientY;return;
   }
  }
  yaw=drag.oy+(e.clientX-drag.x)*.008;
  pitch=clamp(drag.op+(e.clientY-drag.y)*.008,-1.35,1.35);
 }
 function zoomBy(deltaY){
  if(!visible||disposed||!Number.isFinite(deltaY))return false;
  zoom=clamp(zoom*Math.exp(-deltaY*.001),.54,1.8);return true;
 }
 function onWheel(e){if(!visible||disposed)return;e.preventDefault();e.stopPropagation();zoomBy(e.deltaY);}
 const onVisibility=()=>{cancelAnimationFrame(frame);if(!document.hidden)start();};
 const onLost=e=>{e.preventDefault();paused=true;cancelAnimationFrame(frame);
  onError?.(Error("Neural Jarvis: WebGL context lost"));};
 const onRestored=()=>{paused=true;onError?.(Error("Neural Jarvis: reload needed after GPU reset"));};
 const observer=typeof ResizeObserver==="function"?new ResizeObserver(resize):null;
 const onResize=()=>resize();
 document.addEventListener("visibilitychange",onVisibility);
 canvas.addEventListener("webglcontextlost",onLost);
 canvas.addEventListener("webglcontextrestored",onRestored);
 canvas.addEventListener("pointerdown",onDown);
 window.addEventListener("pointermove",onMove,true);
 window.addEventListener("pointerup",endDrag,true);
 window.addEventListener("pointercancel",endDrag,true);
 window.addEventListener("blur",endDrag);
 canvas.addEventListener("wheel",onWheel,{passive:false});
 observer?.observe(canvas.parentElement||canvas);
 window.addEventListener("resize",onResize);
 window.addEventListener("orientationchange",onResize);
 return {
  engine:"webgl",architecture:NEURAL_JARVIS_ARCHITECTURE,
  get active(){return visible&&!paused;},
  get rings(){return NEURAL_JARVIS_ARCHITECTURE.arcs;},
  get state(){return {visible,active:visible&&!paused,yaw,pitch,zoom,expanded,overdrive,
   dragging:!!drag,audioBands:{...bands},renderedComponents:geometry.length};},
  setVisible(value){
   visible=!!value;canvas.hidden=!visible;cancelAnimationFrame(frame);
   if(!visible)endDrag();
   if(visible){resize();start();}
  },
  resize,zoomBy,
  setAudioBands(next){bands=clampBands(next);},
  setOverdrive(next){overdrive=!!next;return overdrive;},
  setExpanded(next){expanded=!!next;return expanded;},
  reset(){
   started=performance.now();yaw=0;pitch=0;zoom=1;expanded=false;
   overdrive=false;bands=clampBands();endDrag();return {ok:true,engine:"webgl"};
  },
  destroy(){
   if(disposed)return;
   disposed=true;visible=false;cancelAnimationFrame(frame);observer?.disconnect();
   document.removeEventListener("visibilitychange",onVisibility);
   window.removeEventListener("resize",onResize);
   window.removeEventListener("orientationchange",onResize);
   canvas.removeEventListener("webglcontextlost",onLost);
   canvas.removeEventListener("webglcontextrestored",onRestored);
   canvas.removeEventListener("pointerdown",onDown);
   window.removeEventListener("pointermove",onMove,true);
   window.removeEventListener("pointerup",endDrag,true);
   window.removeEventListener("pointercancel",endDrag,true);
   window.removeEventListener("blur",endDrag);
   canvas.removeEventListener("wheel",onWheel);
   for(const item of geometry)gl.deleteBuffer(item.buffer);
   gl.deleteProgram(program);
  }
 };
}
