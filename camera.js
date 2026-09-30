import {rememberCameraAccepted} from "./storage.js";

export class CameraController {
  constructor(video,onState){
    this.video=video; this.onState=onState; this.stream=null;
  }
  async start(){
    if(!navigator.mediaDevices?.getUserMedia) throw new Error("Câmera indisponível. Use HTTPS ou localhost.");
    this.stream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:"user",width:{ideal:1280},height:{ideal:720}},audio:false
    });
    this.video.srcObject=this.stream;
    await this.video.play();
    rememberCameraAccepted();
    this.onState("active",this.stream);
  }
  stop(){
    this.stream?.getTracks().forEach(t=>t.stop());
    this.stream=null; this.video.srcObject=null; this.onState("stopped");
  }
}
