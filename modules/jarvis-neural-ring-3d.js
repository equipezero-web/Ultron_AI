/* Native WebGL Neural Ring 3D v4.46: no external library or popup. */
export function createNeuralRing3D(canvas,{onError}={}) {
  if (!canvas) throw new Error('Neural Ring canvas ausente');
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,premultipliedAlpha:false,powerPreference:'low-power'})
    || canvas.getContext('experimental-webgl',{alpha:true,antialias:true,depth:true});
  if(!gl) throw new Error('WebGL indisponível para o Neural Ring 3D');
  const vsText=[
    'attribute vec3 aPos; attribute vec3 aNormal;',
    'uniform float uTime; uniform float uRing; uniform float uScale; uniform float uAspect;',
    'varying float vLight; varying float vDepth;',
    'void main(){',
    ' float ty=uTime*(.20+uRing*.06)+uRing*1.43;',
    ' float tx=.55+sin(uTime*.25+uRing)*.23+uRing*.23;',
    ' float cy=cos(ty),sy=sin(ty),cx=cos(tx),sx=sin(tx);',
    ' vec3 p=vec3(aPos.x*cy+aPos.z*sy,aPos.y,-aPos.x*sy+aPos.z*cy);',
    ' p=vec3(p.x,p.y*cx-p.z*sx,p.y*sx+p.z*cx);',
    ' vec3 n=vec3(aNormal.x*cy+aNormal.z*sy,aNormal.y,-aNormal.x*sy+aNormal.z*cy);',
    ' n=normalize(vec3(n.x,n.y*cx-n.z*sx,n.y*sx+n.z*cx));',
    ' float perspective=2.65/(3.25-p.z);',
    ' gl_Position=vec4((p.x*perspective*uScale)/max(.68,uAspect),p.y*perspective*uScale,.38-p.z*.15,1.);',
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
    color:gl.getUniformLocation(program,'uColor'),alpha:gl.getUniformLocation(program,'uAlpha')
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
  let started=performance.now();const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  function resize(){
    if(disposed)return;
    const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,1.6);
    const width=Math.max(1,Math.round(r.width*dpr)),height=Math.max(1,Math.round(r.height*dpr));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    gl.viewport(0,0,width,height);
  }
  function render(now){
    frame=0;if(!visible||paused||disposed||document.hidden)return;
    const interval=window.matchMedia('(max-width: 700px)').matches?34:25;
    if(now-lastFrame>=interval){
      lastFrame=now;resize();
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1f(locations.time,reduce.matches?0:(now-started)/1000);
      gl.uniform1f(locations.aspect,Math.max(.5,canvas.width/canvas.height));
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
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
  observer?.observe(canvas.parentElement||canvas);
  return {
    engine:'webgl',get active(){return visible&&!paused;},get rings(){return colors.length;},
    setVisible(value){visible=Boolean(value);canvas.hidden=!visible;cancelAnimationFrame(frame);if(visible)start();},
    resize,
    reset(){started=performance.now();return {ok:true,engine:'webgl'};},
    destroy(){
      disposed=true;visible=false;cancelAnimationFrame(frame);observer?.disconnect();
      document.removeEventListener('visibilitychange',onVisibility);
      canvas.removeEventListener('webglcontextlost',onContextLost);
      gl.deleteBuffer(posBuffer);gl.deleteBuffer(normalBuffer);gl.deleteBuffer(indexBuffer);gl.deleteProgram(program);
    }
  };
}
