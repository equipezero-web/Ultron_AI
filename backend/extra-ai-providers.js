// Three opt-in OpenAI Chat Completions compatible providers.
// Only official fixed API endpoints. API credentials never enter diagnostics.
const DEFINITIONS = Object.freeze({
  mistral: {endpoint:"https://api.mistral.ai/v1/chat/completions",
    key:"MISTRAL_API_KEY",modelKey:"MISTRAL_MODEL",defaultModel:"mistral-small-latest"},
  deepseek: {endpoint:"https://api.deepseek.com/chat/completions",
    key:"DEEPSEEK_API_KEY",modelKey:"DEEPSEEK_MODEL",defaultModel:"deepseek-chat"},
  cerebras: {endpoint:"https://api.cerebras.ai/v1/chat/completions",
    key:"CEREBRAS_API_KEY",modelKey:"CEREBRAS_MODEL",defaultModel:"llama3.1-8b"}
});

export function extraProviderDefinition(name) {return DEFINITIONS[name] || null;}

export async function callExtraProvider(env,name,messages,{timeoutMs=12000}={}){
 const definition=extraProviderDefinition(name);
 if(!definition)throw new Error("Unknown provider");
 const key=env?.[definition.key];
 if(!key)throw new Error("Provider not configured");
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),Math.max(100,Math.min(12000,timeoutMs)));
 try{
  const model=env[definition.modelKey] || definition.defaultModel;
  const response=await fetch(definition.endpoint,{
   method:"POST",signal:controller.signal,
   headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
   body:JSON.stringify({model,messages,temperature:0.45,max_tokens:220,stream:false})
  });
  if(!response.ok){
   // Discard body: upstream may include identifiers; status is sufficient.
   const error=new Error("Upstream HTTP "+response.status);
   error.status=response.status;
   const retry=response.headers.get("retry-after");
   if(retry){
    const seconds=/^\d+$/.test(retry.trim())?Number(retry):(Date.parse(retry)-Date.now())/1000;
    if(Number.isFinite(seconds)&&seconds>0)error.retryAfterSeconds=Math.min(86400,Math.ceil(seconds));
   }
   throw error;
  }
  const data=await response.json();
  const text=data?.choices?.[0]?.message?.content;
  const normalized=typeof text==="string"?text.trim():"";
  if(!normalized)throw new Error("AI provider returned no text");
  return {text:normalized,model};
 }finally{clearTimeout(timer);}
}
