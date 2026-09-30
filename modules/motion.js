export class MotionSensor {
  constructor(video, canvas, onMotion, onLevel){
    this.video=video; this.canvas=canvas; this.ctx=canvas.getContext("2d",{willReadFrequently:true});
    this.onMotion=onMotion; this.onLevel=onLevel; this.previous=null; this.running=false; this.frame=0;
    this.threshold=20; this.lastEvent=0; this.cooldown=3000;
  }
  start(){
    this.canvas.width=this.video.videoWidth||640; this.canvas.height=this.video.videoHeight||480;
    this.running=true; this.previous=null; requestAnimationFrame(()=>this.loop());
  }
  stop(){this.running=false;this.previous=null;}
  loop(){
    if(!this.running)return;
    this.frame++;
    // Reduz a carga: analisa 1 a cada 2 frames.
    if(this.frame%2===0){
      this.ctx.drawImage(this.video,0,0,this.canvas.width,this.canvas.height);
      const current=this.ctx.getImageData(0,0,this.canvas.width,this.canvas.height);
      if(this.previous){
        let changed=0,total=0;
        // Amostragem espacial para manter o processamento leve no celular.
        for(let i=0;i<current.data.length;i+=32){
          const d=Math.abs(current.data[i]-this.previous.data[i])+
                  Math.abs(current.data[i+1]-this.previous.data[i+1])+
                  Math.abs(current.data[i+2]-this.previous.data[i+2]);
          if(d>95)changed++; total++;
        }
        const level=Math.min(100,(changed/total)*100);
        this.onLevel(level);
        if(changed > this.threshold * 3 && performance.now()-this.lastEvent>this.cooldown){
          this.lastEvent=performance.now(); this.onMotion(level);
        }
      }
      this.previous=current;
    }
    requestAnimationFrame(()=>this.loop());
  }
}
