// Structural contract adapted from the operator's 3D holographic Neural Jarvis HTML.
// Counts describe geometry drawn by the renderer, not real-world compute capacity.
export const NEURAL_JARVIS_ARCHITECTURE=Object.freeze({
 name:"Neural Jarvis",
 version:"1.0.0",
 plates:Object.freeze([18,22,24]),
 arcs:5,
 nodes:180,
 particles:1400,
 spectralBands:Object.freeze(["graves","medios","agudos"]),
 shader:"GLSL native WebGL",
 supportedModes:Object.freeze(["ring","globe"])
});
export const NEURAL_JARVIS_FILES=Object.freeze([
 Object.freeze({code:"SYS-CORE-01",title:"Núcleo Energético Central",
  detail:"Núcleo holográfico de deformação orgânica orientado pelos graves e médios do áudio autorizado.",
  technical:"WebGL GLSL · áudio somente com permissão · animação de vértices"}),
 Object.freeze({code:"SHD-SEG-02",title:"Redoma Satélite Protetora",
  detail:"Três camadas de placas orbitais que se afastam ao expandir a estrutura.",
  technical:"18 + 22 + 24 placas · 64 setores geométricos · expansão visual"}),
 Object.freeze({code:"GYR-ORB-03",title:"Anéis Giroscópicos Táticos",
  detail:"Cinco arcos orientados em eixos diferentes, com rotação independente.",
  technical:"5 arcos · rotação 3D · controles de arrastar e zoom"}),
 Object.freeze({code:"NET-SYN-04",title:"Rede Neural & Sinapses",
  detail:"Rede gráfica de filamentos e pontos reativos às bandas de áudio, sem representar conexões físicas reais.",
  technical:"180 nós gráficos · 1.400 partículas gráficas · bandas graves/médios/agudos"})
]);
export function neuralJarvisGeometryCount(){
 const {plates,arcs,nodes,particles}=NEURAL_JARVIS_ARCHITECTURE;
 return {plates:plates.reduce((a,b)=>a+b,0),layers:plates.length,arcs,nodes,particles};
}
export function clampBands(bands={}){
 const bounded=v=>Number.isFinite(Number(v))?
  Math.max(0,Math.min(1,Number(v))):0;
 return {bass:bounded(bands.bass),mid:bounded(bands.mid),high:bounded(bands.high)};
}
export function computeNeuralJarvisVisual({time=0,bands={},overdrive=false,expanded=false,reducedMotion=false}={}){
 const b=clampBands(bands);
 const t=Number.isFinite(time)?Math.max(0,time):0;
 return {
  bands:b,
  speed:reducedMotion?0:(overdrive?2.1:1)*(1+b.bass*.8),
  pulse:reducedMotion?1:1+Math.sin(t*2.5)*.035+b.bass*.17,
  expansion:expanded?1:0,
  audioReactive:b.bass+b.mid+b.high>0.01
 };
}
export function validateNeuralJarvisArchive(files=NEURAL_JARVIS_FILES){
 return Array.isArray(files)&&files.length===4&&
  new Set(files.map(x=>x.code)).size===4&&
  files.every(x=>/^[A-Z]{3}-[A-Z]{3,4}-\d{2}$/.test(x.code)&&
  typeof x.title==="string"&&typeof x.detail==="string");
}
