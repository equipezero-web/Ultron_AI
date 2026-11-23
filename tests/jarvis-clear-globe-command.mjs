import assert from "node:assert/strict";
import {parseLocalCommand} from "../modules/jarvis-local-commands.js";
for(const command of ["limpar globo","limpe o globo","fechar o globo","J.A.R.V.I.S., limpar globo","ocultar globo 3D","feche o mapa 3d"]){
 assert.equal(parseLocalCommand(command)?.type,"globe-close",command);
}
for(const command of ["como limpar globo?","não limpar globo","limpar memória","limpar meus arquivos","mostre o globo 3d"])
 assert.notEqual(parseLocalCommand(command)?.type,"globe-close",command);
console.log("CLEAR GLOBE: local command routing PASS");
