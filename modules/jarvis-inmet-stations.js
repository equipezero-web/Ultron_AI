// Official INMET catalog contains station LOCATION/operational status only.
// Never label these metadata points as measured rainfall or radar imagery.
export const INMET_STATIONS_URL="https://apitempo.inmet.gov.br/estacoes/T";
export function normalizeInmetStations(raw){
 if(!Array.isArray(raw))return null;
 const stations=[];
 const seen=new Set();
 for(const row of raw.slice(0,1100)){
   const lat=Number(row?.VL_LATITUDE),lng=Number(row?.VL_LONGITUDE);
   const id=String(row?.CD_ESTACAO||"").trim().slice(0,16);
   const name=String(row?.DC_NOME||"").replace(/[<>]/g,"").trim().slice(0,100);
   const state=String(row?.SG_ESTADO||"").trim().toUpperCase();
   const operational=String(row?.CD_SITUACAO||"").toLowerCase().includes("operante");
   if(!id||!name||seen.has(id)||!Number.isFinite(lat)||!Number.isFinite(lng)||
      lat>7||lat< -35||lng< -75||lng> -32||!/^[A-Z]{2}$/.test(state))continue;
   seen.add(id);stations.push({id,name,state,lat,lng,operational});
 }
 if(!stations.length)return null;
 return {ok:true,count:stations.length,operational:stations.filter(s=>s.operational).length,
    stations,source:INMET_STATIONS_URL,
    disclaimer:"Cadastro e situação operacional de estações INMET; NÃO são dados de chuva, imagem de radar ou alerta."};
}
export async function loadInmetStations({fetchImpl=fetch}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8500);
 try{
  const response=await fetchImpl(INMET_STATIONS_URL,{
   signal:controller.signal,headers:{Accept:"application/json"},cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  const model=normalizeInmetStations(await response.json());
  return model||{ok:false,error:"Não há estações INMET válidas disponíveis."};
 }catch(e){return {ok:false,error:"INMET: catálogo indisponível no navegador ("+
   String(e?.message||e).slice(0,100)+")."};}
 finally{clearTimeout(timer);}
}
