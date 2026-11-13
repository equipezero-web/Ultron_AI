// A transport receipt ("pending"/"claimed") is not evidence of physical success.
// The bridge's authenticated completion ACK is the only success signal.
export function interpretDeviceReceipt(remote, {aborted=false}={}) {
  const status = String(remote?.status || "pending");
  if (aborted) return {ok:false,verified:false,cancelled:true,submitted:false,commandStatus:status};
  if (status === "completed") return {ok:true,verified:true,submitted:false,commandStatus:status};
  if (["failed","expired","cancelled"].includes(status)) return {ok:false,verified:false,submitted:false,commandStatus:status};
  return {ok:false,verified:false,submitted:true,commandStatus:status};
}

export function createPendingCommandTracker({now=()=>Date.now(),ttlMs=300_000,max=32}={}) {
  const active=new Map();
  function prune(){
    for(const [id,at] of active)if(now()-at>=ttlMs)active.delete(id);
    while(active.size>max)active.delete(active.keys().next().value);
  }
  return {
    track(id){
      if(!/^[0-9a-f-]{36}$/i.test(String(id||"")))return false;
      active.set(id,now());prune();return true;
    },
    settle(id){active.delete(id);},
    list(){prune();return [...active.keys()];},
    drain(){const ids=this.list();active.clear();return ids;}
  };
}
