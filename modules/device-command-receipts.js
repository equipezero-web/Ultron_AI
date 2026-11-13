// A transport receipt ("pending"/"claimed") is not evidence of physical success.
// The bridge's authenticated completion ACK is the only success signal.
export function interpretDeviceReceipt(remote, {aborted=false}={}) {
  const status = String(remote?.status || "pending");
  if (aborted) return {ok:false,verified:false,cancelled:true,submitted:false,commandStatus:status};
  if (status === "completed") return {ok:true,verified:true,submitted:false,commandStatus:status};
  if (["failed","expired","cancelled"].includes(status)) return {ok:false,verified:false,submitted:false,commandStatus:status};
  return {ok:false,verified:false,submitted:true,commandStatus:status};
}
