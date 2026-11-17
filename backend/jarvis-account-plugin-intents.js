// Pure parser for explicit, safe J.A.R.V.I.S. account-plugin commands.
// Descriptive sentences and negatives are never interpreted as authorization.
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/\s+/g," ").trim()
  .replace(/^(?:(?:ei|ola|hey)\s+)?(?:jarvis|j\.a\.r\.v\.i\.s\.?|ultron)[,:!?\s]+/,"");
const names={youtube:"youtube",agenda:"agenda",calendario:"agenda",
 armazenamento:"armazenamento",memoria:"armazenamento"};
export function parseAccountPluginCommand(input){
 const value=norm(input);
 if(!value||/^(?:nao|nunca|se |e se |como |por que|porque|seria possivel|quais sao)/.test(value))return null;
 let m=value.match(/^(?:instale|instalar|ative|ativar|habilite|habilitar)\s+(?:o\s+)?(?:plugin\s+)?(youtube|agenda|calendario|armazenamento)(?:\s+(?:na|minha)\s+conta)?[.!?]?$/);
 if(m)return {kind:"install",pluginId:names[m[1]]};
 m=value.match(/^(?:desinstale|desinstalar|remova|remover|desative|desativar)\s+(?:o\s+)?(?:plugin\s+)?(youtube|agenda|calendario|armazenamento)[.!?]?$/);
 if(m)return {kind:"uninstall",pluginId:names[m[1]]};
 if(/^(?:liste|listar|mostre|mostrar|ver|exiba|exibir)\s+(?:os?\s+)?(?:meus?\s+)?plugins(?:\s+(?:da|minha)\s+conta)?[.!?]?$/.test(value))
   return {kind:"list"};
 if(/^(?:pareie|parear|conecte|conectar|adicione|adicionar|vincule|vincular)\s+(?:(?:o|meu)\s+)?(?:celular|android)(?:\s+(?:na|a|minha|ao)\s+(?:conta|jarvis))?[.!?]?$/.test(value))
   return {kind:"pair"};
 if(/^(?:adicionar|adicione|cadastrar|cadastre)\s+(?:nova\s+)?conta(?:\s+ao\s+jarvis)?[.!?]?$/.test(value))
   return {kind:"account-help"};
 const select=value.match(/^(?:selecione|selecionar|use|usar)\s+(?:o\s+)?(?:dispositivo|celular|android|computador|notebook)\s+(.{2,70})[.!?]?$/);
 if(select)return {kind:"select-device",name:select[1].trim()};
 const yt=value.match(/^(?:abra|abrir|abre|inicie|iniciar)\s+(?:o\s+)?youtube\s+(?:no|do|pelo)\s+(?:meu\s+)?(celular|android|computador|notebook|pc)[.!?]?$/);
 if(yt)return {kind:"execute",pluginId:"youtube",actionId:"youtube.open",preferredType:/celular|android/.test(yt[1])?"mobile":"desktop"};
 const cal=value.match(/^(?:abra|abrir|abre|mostre|mostrar)\s+(?:a\s+)?(?:agenda|calendario)\s+(?:no|do|pelo)\s+(?:meu\s+)?(celular|android|computador|notebook|pc)[.!?]?$/);
 if(cal)return {kind:"execute",pluginId:"agenda",actionId:"calendar.open",preferredType:/celular|android/.test(cal[1])?"mobile":"desktop"};
 if(/^(?:faca|fazer|mostre|mostrar|exiba|exibir|verifique|verificar|execute|executar)\s+(?:um\s+|o\s+)?diagnostico\s+(?:completo\s+)?(?:do\s+)?(?:meu\s+)?(?:celular|android)(?:\s+(?:no|pelo)\s+(?:painel\s+)?neural(?:\s+ring)?)?[.!?]?$/.test(value))
   return {kind:"execute",pluginId:"armazenamento",actionId:"storage.diagnostics"};
 if(/^(?:faca|fazer|mostre|mostrar|verifique|verificar|execute|executar)\s+(?:um\s+|o\s+)?(?:diagnostico|diagnosticar|estado)\s+(?:do\s+)?armazenamento\s+(?:no|do|pelo)\s+(?:meu\s+)?(?:celular|android)[.!?]?$/.test(value))
   return {kind:"execute",pluginId:"armazenamento",actionId:"storage.diagnostics"};
 // Read-only local Android storage information. This is NOT RAM,
 // a remote file read or authorization to access private documents.
 if(/^(?:(?:qual|quanto) (?:e |eh |tenho )?(?:o |de )?(?:meu |de )?(?:armazenamento|espaco (?:livre|disponivel)|memoria)(?: (?:interna|do meu celular|do celular|no meu celular|no celular|do android|no android))?|(?:consulte|consultar|verifique|verificar|veja|ver|mostre|mostrar) (?:o |a )?(?:meu |minha )?(?:armazenamento|memoria|espaco livre)(?: (?:interno|interna|do meu celular|do celular|no meu celular|no celular|do android|no android))?(?: (?:motorola|moto) [a-z0-9 ]{2,30})?)[.!?]?$/.test(value))
   return {kind:"execute",pluginId:"armazenamento",actionId:"storage.diagnostics"};
 // Event creation is a high-impact write: require title, offset-aware times,
 // and an explicit "confirmo". The Android calendar still requires Save.
 const raw=String(input||"").trim().replace(/^(?:jarvis|j\.a\.r\.v\.i\.s\.?|ultron)[,:!?\s]+/i,"");
 const match=raw.match(/^crie (?:evento|compromisso) na agenda do celular:\s*(.{1,100}?)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*confirmo[.!]?\s*$/i);
 if(match)return {kind:"execute",pluginId:"agenda",actionId:"calendar.create",payload:{
   title:match[1].trim(),startsAt:match[2],endsAt:match[3],confirm:true}};
 return null;
}
