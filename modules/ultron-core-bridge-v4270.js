import {directPlan,runActionPlan} from "./jarvis-action-engine.js?v=4.68.0";
import {runLocalCommand} from "./jarvis-local-commands.js?v=4.67.0";
import API_CONFIG from "../config.js";

const API_BASE = String(API_CONFIG?.backendUrl || "").replace(/\/$/, "");
const output = document.getElementById("output-box");
const video = document.getElementById("webcam");

function log(message, alert = false) {
  if (!output) return;
  const line = document.createElement("p");
  if (alert) line.className = "alert";
  line.textContent = `> [CORE] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function prepareVisual(data) {
  const panel = window.ULTRON_VISUAL_PANEL;
  if (!panel) return;
  if (data?.visualContext) {
    panel.showContext?.({
      ...data.visualContext,
      caption: data.visualContext.caption || data.text || ""
    });
  } else {
    panel.clearImages?.();
    panel.clearCards?.();
    panel.setCaption?.(data?.text || "");
  }
}

function playAudio(base64, mime = "audio/mpeg") {
  try {
    if (!base64) return false;
    const audio = document.getElementById("voice-audio");
    if (!audio) return false;
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    if (audio.dataset.audioUrl) URL.revokeObjectURL(audio.dataset.audioUrl);
    audio.dataset.audioUrl = url;
    audio.src = url;
    audio.load();
    audio.play().catch(() => {});
    audio.onended = () => {
      if (audio.dataset.audioUrl === url) {
        URL.revokeObjectURL(url);
        delete audio.dataset.audioUrl;
      }
    };
    return true;
  } catch {
    return false;
  }
}

function currentTelemetry() {
  const neural3d = window.ULTRON_NEURAL_3D?.state || {};
  const gesture = window.ULTRON_HAND_GESTURES?.state || {};
  const remoteCamera = window.ULTRON_MOBILE_CAMERA?.state || {};
  return {
    systemCapabilities:{neuralRing:!!window.ULTRON_NEURAL_RING_3D,earth:!!window.ULTRON_EARTH,visualContext:!!window.ULTRON_NEURAL_ANSWER,liveNews:!!window.ULTRON_INTELLIGENCE,deviceControl:!!window.ULTRON_DEVICES,orchestration:!!window.ULTRON_ORCHESTRATOR,voiceOutput:!!window.ULTRON_VOICE_OUTPUT,voiceInput:!!window.ULTRON_VOICE_INPUT,memory:!!window.ULTRON_MEMORY,vision:!!window.ULTRON_VISION_ROUTER,starkCore:!!window.ULTRON_STARK_CORE,innerMesh:!!window.ULTRON_STARK_MESH},
    optical: {
      active: Boolean(remoteCamera.active || window.ULTRON_CAMERA_CONTROLLER?.isActive?.()),
      source: remoteCamera.mode || "MOBILE_BRIDGE",
      resolution: video?.videoWidth && video?.videoHeight ? `${video.videoWidth}x${video.videoHeight}` : null,
      gesture: gesture.gesture || null,
      handCount: neural3d.handCount || 0
    },
    neural3d: {
      azimuth: Math.round(Number(neural3d.ry || 0)),
      elevation: Math.round(Number(neural3d.rx || 0)),
      roll: Math.round(Number(neural3d.rz || 0)),
      zoom: Number(neural3d.scale || 1)
    },
    orchestrator: window.ULTRON_ORCHESTRATOR?.state || null
  };
}

async function ask(message) {
  const clean = String(message || "").trim();
  if (!clean) return { ok: false, error: "Comando vazio." };
  const local=await runLocalCommand(clean);if(local){log(local.text);return local;}
  const plan=directPlan(clean);if(plan){const result=await runActionPlan(plan,clean);log(result.text);return result;}
  const id=window.__ultronQuestionSequence=(Number(window.__ultronQuestionSequence)||0)+1;
  const emit=(type,detail={})=>window.dispatchEvent(new CustomEvent("ultron:"+type,{detail:{id,...detail}}));
  const current=()=>window.__ultronQuestionSequence===id;
  emit("question-start",{question:clean});
  try {
    if (!API_BASE) throw new Error("Backend não configurado.");
    const response = await fetch(`${API_BASE}/api/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        message: clean,
        clientOwnsSpeech:true,
        preferFastResponse:window.ULTRON_VOICE_OUTPUT?.available===true,
        memoryKey: window.ULTRON_MEMORY?.getMemoryKey?.() || null,
        conversationId: window.ULTRON_MEMORY?.getConversationId?.() || null,
        telemetry: currentTelemetry()
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.text) throw new Error(data?.details || data?.error || `HTTP ${response.status}`);
    if (!current()) return {ok:true,...data,superseded:true};
    const provider = data.providerLabel || data.provider || "AI";
    log(`ULTRON [${provider}]: ${data.text}`);
    // The orchestrator handles both typed and spoken commands. Publish the
    // answer to the same Neural Ring surface before audio or legacy visuals.
    emit("answer",{text:data.text,visualContext:data.visualContext,webResearch:data.webResearch});
    prepareVisual(data);
    const played = playAudio(data.audioBase64, data.audioMimeType || "audio/mpeg");
    if (!played) window.ULTRON_VOICE_OUTPUT?.speak?.(data.text,{reason:"orchestrator-ai",announce:false});
    return { ok: true, ...data };
  } catch(error) {
    const message=String(error?.message||error);
    if(current()){
      log(`AI ERROR: ${message}`, true);
      emit("answer-error",{message});
    }
    return {ok:false,error:message};
  }
}

async function activateCamera({ openPreview = true } = {}) {
  const modal = document.getElementById("screen-modal");
  if (openPreview) {
    modal?.classList.add("open");
    modal?.setAttribute("aria-hidden", "false");
  }
  setText("permission-state", "CONNECTING MOBILE");
  setText("bridge-camera-state", "CONNECTING");
  const mobile = window.ULTRON_MOBILE_CAMERA;
  if (!mobile?.smartConnect && !mobile?.useBridgeCamera) {
    throw new Error("Módulo da câmera do celular ainda não está disponível.");
  }
  if (mobile.smartConnect) await mobile.smartConnect();
  else await mobile.useBridgeCamera();
  return {
    ok: true,
    active: Boolean(window.ULTRON_MOBILE_CAMERA?.state?.active || window.ULTRON_CAMERA_CONTROLLER?.isActive?.())
  };
}

async function status() {
  let unified = null;
  try { unified = await window.ULTRON_ORCHESTRATOR?.refreshState?.(); } catch {}
  const neural = window.ULTRON_NEURAL_3D?.state || {};
  const camera = window.ULTRON_MOBILE_CAMERA?.state || {};
  const result = {
    online: navigator.onLine,
    backend: document.getElementById("infra-backend")?.textContent || "UNKNOWN",
    ai: document.getElementById("gemini-module")?.textContent || "UNKNOWN",
    memory: document.getElementById("memory-module")?.textContent || "UNKNOWN",
    bridge: document.getElementById("bridge-module")?.textContent || "UNKNOWN",
    optical: Boolean(camera.active || window.ULTRON_CAMERA_CONTROLLER?.isActive?.()),
    resolution: video?.videoWidth && video?.videoHeight ? `${video.videoWidth}x${video.videoHeight}` : null,
    hands: Number(neural.handCount || 0),
    devicesOnline: unified?.devices?.filter?.((item) => item.online)?.length || 0,
    automations: unified?.automations?.length || 0
  };
  log(`STATUS // AI ${result.ai} // MEMORY ${result.memory} // BRIDGE ${result.bridge} // OPTICAL ${result.optical ? "ONLINE" : "STANDBY"} // DEVICES ${result.devicesOnline}.`);
  return result;
}

window.ULTRON_CORE = {
  version: "4.27.0",
  ask,
  activateCamera,
  status,
  currentTelemetry
};
