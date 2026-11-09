/* Native WebGL Neural Ring 3D v4.46: no external library or popup. */
export function createNeuralRing3D(canvas,{onError}={}) {
  if (!canvas) throw new Error('Neural Ring canvas ausente');
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,premultipliedAlpha:false,powerPreference:'low-power'})
    || canvas.getContext('experimental-webgl',{alpha:true,antialias:true,depth:true});
  if(!gl) throw new Error('WebGL indisponível para o Neural Ring 3D');
  const vsText=[
    'attribute vec3 aPos; attribute vec3 aNormal;',
    'uniform float uTime; uniform float uRing; uniform float uScale; uniform float uAspect; uniform float uYaw; uniform float uPitch; uniform float uZoom;',
    'varying float vLight; varying float vDepth;',
    'void main(){',
    ' float ty=uTime*(.20+uRing*.06)+uRing*1.43;',
    ' float tx=.55+sin(uTime*.25+uRing)*.23+uRing*.23;',
    ' float cy=cos(ty),sy=sin(ty),cx=cos(tx),sx=sin(tx);',
    ' vec3 p=vec3(aPos.x*cy+aPos.z*sy,aPos.y,-aPos.x*sy+aPos.z*cy);',
    ' p=vec3(p.x,p.y*cx-p.z*sx,p.y*sx+p.z*cx);',
    ' vec3 n=vec3(aNormal.x*cy+aNormal.z*sy,aNormal.y,-aNormal.x*sy+aNormal.z*cy);',
    ' n=normalize(vec3(n.x,n.y*cx-n.z*sx,n.y*sx+n.z*cx));',
    ' float uy=cos(uYaw),vy=sin(uYaw),up=cos(uPitch),vp=sin(uPitch);',
    ' p=vec3(p.x*uy+p.z*vy,p.y,-p.x*vy+p.z*uy);',
    ' n=vec3(n.x*uy+n.z*vy,n.y,-n.x*vy+n.z*uy);',
    ' p=vec3(p.x,p.y*up-p.z*vp,p.y*vp+p.z*up);',
    ' n=normalize(vec3(n.x,n.y*up-n.z*vp,n.y*vp+n.z*up));',
    ' float perspective=2.65/(3.25-p.z);',
    ' gl_Position=vec4((p.x*perspective*uScale*uZoom)/max(.68,uAspect),p.y*perspective*uScale*uZoom,.38-p.z*.15,1.);',
    ' vLight=.25+.75*abs(dot(n,normalize(vec3(.38,.62,.68))));',
    ' vDepth=clamp(.45+p.z*.42,0.,1.);',
    '}'
  ].join('\n');
  const fsText=[
    'precision mediump float;',
    'uniform vec3 uColor; uniform float uAlpha;',
    'varying float vLight; varying float vDepth;',
    'void main(){',
    ' float glow=clamp(vLight*.9+vDepth*.24,0.,1.);',
    ' gl_FragColor=vec4(uColor*(.42+glow*.72),uAlpha*(.53+glow*.47));',
    '}'
  ].join('\n');
  const compile=(type,code)=>{
    const shader=gl.createShader(type);
    gl.shaderSource(shader,code);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
      const error=gl.getShaderInfoLog(shader);gl.deleteShader(shader);
      throw new Error('Neural Ring shader: '+error);
    }
    return shader;
  };
  const program=gl.createProgram(),vertex=compile(gl.VERTEX_SHADER,vsText),fragment=compile(gl.FRAGMENT_SHADER,fsText);
  gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  gl.deleteShader(vertex);gl.deleteShader(fragment);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Neural Ring WebGL link: '+gl.getProgramInfoLog(program));
  const posLoc=gl.getAttribLocation(program,'aPos'),normalLoc=gl.getAttribLocation(program,'aNormal');
  const locations={
    time:gl.getUniformLocation(program,'uTime'),ring:gl.getUniformLocation(program,'uRing'),
    scale:gl.getUniformLocation(program,'uScale'),aspect:gl.getUniformLocation(program,'uAspect'),
    color:gl.getUniformLocation(program,'uColor'),alpha:gl.getUniformLocation(program,'uAlpha'),
    yaw:gl.getUniformLocation(program,'uYaw'),pitch:gl.getUniformLocation(program,'uPitch'),zoom:gl.getUniformLocation(program,'uZoom')
  };
  const verts=[],norms=[],indices=[],sections=176,tubes=14;
  for(let i=0;i<=sections;i++){
    const angle=i/sections*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle);
    for(let j=0;j<=tubes;j++){
      const tube=j/tubes*Math.PI*2,tc=Math.cos(tube),ts=Math.sin(tube),radius=.77+.027*tc;
      verts.push(radius*c,radius*s,.027*ts);norms.push(tc*c,tc*s,ts);
    }
  }
  for(let i=0;i<sections;i++)for(let j=0;j<tubes;j++){
    const a=i*(tubes+1)+j,b=a+(tubes+1);
    indices.push(a,b,a+1,b,b+1,a+1);
  }
  const posBuffer=gl.createBuffer(),normalBuffer=gl.createBuffer(),indexBuffer=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,posBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(verts),gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(norms),gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  const colors=[[.91,.25,.34],[.29,.65,1.],[.84,.91,1.],[.45,.35,.68]],
    scales=[1.04,.88,1.13,.49],alphas=[.80,.63,.57,.43];
  let visible=false,paused=false,disposed=false,frame=0,lastFrame=0;
  let cachedWidth=0,cachedHeight=0;
  const mobileMedia=window.matchMedia('(max-width: 820px)');
  const lowMemory=Number(navigator.deviceMemory||4)<=2;
  let yaw=0,pitch=0,zoom=1,dragging=null;
  const touchPoints=new Map();
  let pinch=null;
  const touchDistance=()=>{
    const p=[...touchPoints.values()];
    return p.length<2?0:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
  };
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  let started=performance.now();const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  function resize(){
    if(disposed)return;
    const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,mobileMedia.matches?(lowMemory?1:1.35):1.6);
    const width=Math.max(1,Math.round(r.width*dpr)),height=Math.max(1,Math.round(r.height*dpr));
    if(width!==cachedWidth||height!==cachedHeight){
      cachedWidth=width;cachedHeight=height;
      canvas.width=width;canvas.height=height;
      gl.viewport(0,0,width,height);
    }
  }
  function render(now){
    frame=0;if(!visible||paused||disposed||document.hidden)return;
    const interval=mobileMedia.matches?(lowMemory?50:34):25;
    if(now-lastFrame>=interval){
      lastFrame=now;
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1f(locations.time,reduce.matches?0:(now-started)/1000);
      gl.uniform1f(locations.aspect,Math.max(.5,canvas.width/canvas.height));
      gl.uniform1f(locations.yaw,yaw);gl.uniform1f(locations.pitch,pitch);gl.uniform1f(locations.zoom,zoom);
      gl.bindBuffer(gl.ARRAY_BUFFER,posBuffer);gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc,3,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffer);gl.enableVertexAttribArray(normalLoc);
      gl.vertexAttribPointer(normalLoc,3,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);
      for(let i=0;i<colors.length;i++){
        gl.uniform1f(locations.ring,i);gl.uniform1f(locations.scale,scales[i]);
        gl.uniform3fv(locations.color,colors[i]);gl.uniform1f(locations.alpha,alphas[i]);
        gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
      }
    }
    frame=requestAnimationFrame(render);
  }
  function start(){if(disposed||paused||!visible||document.hidden)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(render);}
  const onVisibility=()=>{cancelAnimationFrame(frame);if(!document.hidden)start();};
  const onContextLost=(e)=>{e.preventDefault();paused=true;cancelAnimationFrame(frame);onError?.(new Error('WebGL context lost'));};
  document.addEventListener('visibilitychange',onVisibility);
  canvas.addEventListener('webglcontextlost',onContextLost);
  // Move the true WebGL geometry by dragging: hover alone never rotates.
  const releasePointer=id=>{
    if(canvas.releasePointerCapture&&id!=null&&canvas.hasPointerCapture?.(id)){
      try{canvas.releasePointerCapture(id);}catch{}
    }
  };
  const beginDrag=event=>{
    if(!visible||disposed)return;
    if(event.pointerType!=='touch'&&event.button!==0)return;
    if(event.pointerType==='touch'){
      touchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(touchPoints.size>=2){
        pinch={distance:Math.max(1,touchDistance()),zoom};
        dragging=null;
        event.preventDefault();
        return;
      }
    }
    dragging={pointerId:event.pointerId,x:event.clientX,y:event.clientY,yaw,pitch};
    if(canvas.setPointerCapture&&event.pointerId!=null){
      try{canvas.setPointerCapture(event.pointerId);}catch{}
    }
    event.preventDefault();
  };
  const moveDrag=event=>{
    if(!visible||disposed)return;
    if(event.pointerType==='touch'&&touchPoints.has(event.pointerId)){
      touchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(pinch&&touchPoints.size>=2){
        zoom=clamp(pinch.zoom*touchDistance()/pinch.distance,.62,1.9);
        event.preventDefault();
        return;
      }
    }
    if(!dragging)return;
    if(event.pointerId!=null&&event.pointerId!==dragging.pointerId)return;
    if(event.pointerType==='mouse'&&!(event.buttons&1)){endDrag();return;}
    yaw=dragging.yaw+(event.clientX-dragging.x)*.009;
    pitch=clamp(dragging.pitch+(event.clientY-dragging.y)*.009,-1.45,1.45);
  };
  const endDrag=event=>{
    if(event?.pointerType==='touch'){
      touchPoints.delete(event.pointerId);
      if(touchPoints.size<2)pinch=null;
      if(dragging?.pointerId===event.pointerId)dragging=null;
      releasePointer(event.pointerId);
      return;
    }
    const id=dragging?.pointerId;
    dragging=null;
    if(!event){touchPoints.clear();pinch=null;}
    releasePointer(id);
  };
  function zoomBy(deltaY){
    if(!visible||disposed||!Number.isFinite(deltaY))return false;
    zoom=clamp(zoom*Math.exp(-deltaY*.001),.62,1.9);
    return true;
  }
  const adjustZoom=event=>{
    if(!visible || disposed || event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    zoomBy(event.deltaY);
  };
  canvas.addEventListener('pointerdown',beginDrag);
  window.addEventListener('pointermove',moveDrag,true);
  window.addEventListener('pointerup',endDrag,true);
  window.addEventListener('pointercancel',endDrag,true);
  window.addEventListener('blur',endDrag);
  canvas.addEventListener('wheel',adjustZoom,{passive:false});
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
  const viewportResize=()=>resize();
  window.addEventListener('orientationchange',viewportResize);
  window.addEventListener('resize',viewportResize);
  observer?.observe(canvas.parentElement||canvas);
  return {
    engine:'webgl',get active(){return visible&&!paused;},get rings(){return colors.length;},
    get state(){return {yaw,pitch,zoom,dragging:Boolean(dragging),active:visible&&!paused};},
    setVisible(value){visible=Boolean(value);canvas.hidden=!visible;cancelAnimationFrame(frame);if(!visible)endDrag();if(visible){resize();start();}},
    resize,zoomBy,
    reset(){started=performance.now();yaw=0;pitch=0;zoom=1;endDrag();return {ok:true,engine:'webgl'};},
    destroy(){
      disposed=true;visible=false;cancelAnimationFrame(frame);observer?.disconnect();
      window.removeEventListener('orientationchange',viewportResize);
      window.removeEventListener('resize',viewportResize);
      endDrag();canvas.removeEventListener('pointerdown',beginDrag);
      window.removeEventListener('pointermove',moveDrag,true);
      window.removeEventListener('pointerup',endDrag,true);
      window.removeEventListener('pointercancel',endDrag,true);
      window.removeEventListener('blur',endDrag);
      canvas.removeEventListener('wheel',adjustZoom);
      document.removeEventListener('visibilitychange',onVisibility);
      canvas.removeEventListener('webglcontextlost',onContextLost);
      gl.deleteBuffer(posBuffer);gl.deleteBuffer(normalBuffer);gl.deleteBuffer(indexBuffer);gl.deleteProgram(program);
    }
  };
}
