package com.ultron.bridge;

import android.content.Context;
import android.content.Intent;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Comparator;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Read-only remote explorer for a SINGLE user-selected SAF folder.
 * Android's document provider enforces subtree boundaries; no all-files
 * permission, no private app data, no write/delete operations.
 * Each remote access session requires a fresh, short-lived HMAC PIN.
 */
public final class RemoteFiles {
    private static final String PREFS="jarvis_remote_files_v091";
    private static final String TREE="tree_uri";
    private static final String PIN="pin";
    private static final String EXPIRES="expires";
    public static final long SESSION_MS=10*60_000L;
    public static final int CHUNK_BYTES=80*1024;
    private static final int PAGE_LIMIT=100;
    private static final int MAX_DOCUMENTS_PER_FOLDER=3000;
    private static final long MAX_REMOTE_TRANSFER_BYTES=16L*1024L*1024L;
    private static final String[] PROJECTION={
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        DocumentsContract.Document.COLUMN_MIME_TYPE,
        DocumentsContract.Document.COLUMN_SIZE,
        DocumentsContract.Document.COLUMN_LAST_MODIFIED
    };

    private RemoteFiles() {}
    private static android.content.SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
    }
    private static Uri storedTree(Context context) {
        String raw=prefs(context).getString(TREE,"");
        try { return raw.isEmpty()?null:Uri.parse(raw); } catch(Exception ex){ return null; }
    }
    private static Uri activeTree(Context context) {
        Uri tree=storedTree(context);
        if(tree==null)return null;
        for(UriPermission grant:context.getContentResolver().getPersistedUriPermissions()) {
            if(tree.equals(grant.getUri()) && grant.isReadPermission()) return tree;
        }
        return null;
    }
    public static boolean storageGranted(Context context) { return activeTree(context)!=null; }

    /** Called only by the visible Android folder picker result. */
    public static void selectTree(Context context,Uri selected) {
        if(selected==null || !"content".equals(selected.getScheme()) ||
            !DocumentsContract.isTreeUri(selected))
            throw new SecurityException("Selecione uma pasta válida pelo Android.");
        Uri previous=storedTree(context);
        context.getContentResolver().takePersistableUriPermission(
            selected, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if(previous!=null && !previous.equals(selected)) {
            try { context.getContentResolver().releasePersistableUriPermission(
                previous,Intent.FLAG_GRANT_READ_URI_PERMISSION); }catch(Exception ignored){}
        }
        prefs(context).edit().putString(TREE,selected.toString())
            .remove(PIN).remove(EXPIRES).commit();
        SecureStore.clearRemoteFilesKey(context);
    }
    public static String enable(Context context) {
        if(!storageGranted(context))
            throw new SecurityException("Escolha primeiro uma pasta no seletor seguro do Android.");
        byte[] random=new byte[4];
        new SecureRandom().nextBytes(random);
        long n=((random[0]&255L)<<24)|((random[1]&255L)<<16)|
            ((random[2]&255L)<<8)|(random[3]&255L);
        String pin=String.format(java.util.Locale.ROOT,"%08d",n%100_000_000L);
        prefs(context).edit().putString(PIN,pin)
            .putLong(EXPIRES,System.currentTimeMillis()+SESSION_MS).commit();
        return pin;
    }
    public static String enablePermanent(Context context) {
        throw new SecurityException("Acesso permanente desativado. Use sessão de 10 minutos.");
    }
    public static boolean isPermanent(Context context) { return false; }
    public static long remainingSeconds(Context context) {
        if(!storageGranted(context))return 0;
        return Math.max(0,(prefs(context).getLong(EXPIRES,0)-System.currentTimeMillis())/1000);
    }
    /** Revokes both PIN and the Android persisted SAF read grant. */
    public static void disable(Context context) {
        Uri uri=storedTree(context);
        prefs(context).edit().clear().commit();
        SecureStore.clearRemoteFilesKey(context);
        if(uri!=null)try {
            context.getContentResolver().releasePersistableUriPermission(
                uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }catch(Exception ignored){}
    }
    private static void authorize(Context context,String command,JSONObject payload)throws Exception {
        if(!storageGranted(context))throw new SecurityException("Pasta remota não autorizada no Android.");
        if(remainingSeconds(context)==0)
            throw new SecurityException("Sessão expirada; autorize novamente no celular.");
        String nonce=payload.optString("nonce","").trim();
        String proof=payload.optString("accessProof","").trim();
        String key=prefs(context).getString(PIN,"");
        if(!nonce.matches("[a-fA-F0-9]{32}") || !proof.matches("[a-fA-F0-9]{64}") ||
           !key.matches("[0-9]{8}"))
            throw new SecurityException("Autorização criptográfica ausente.");
        String path=payload.optString("path","");
        long offset=payload.optLong("offset",0);
        String message="jarvis-files-v1\n"+command+"\n"+
            nonce.toLowerCase(java.util.Locale.ROOT)+"\n"+path+"\n"+offset;
        Mac mac=Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key.getBytes(java.nio.charset.StandardCharsets.US_ASCII),"HmacSHA256"));
        byte[] expected=mac.doFinal(message.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        byte[] actual=new byte[32];
        for(int i=0;i<32;i++) actual[i]=(byte)((Character.digit(proof.charAt(i*2),16)<<4)|
                Character.digit(proof.charAt(i*2+1),16));
        if(!MessageDigest.isEqual(expected,actual))
            throw new SecurityException("Prova criptográfica inválida.");
    }
    private static final class Doc {
        String id,name,mime;long size,modified;
        Doc(String i,String n,String m,long s,long t){id=i;name=n;mime=m;size=s;modified=t;}
        boolean dir(){return DocumentsContract.Document.MIME_TYPE_DIR.equals(mime);}
    }
    private static String column(Cursor c,String name){
        int i=c.getColumnIndex(name);return i<0||c.isNull(i)?"":c.getString(i);
    }
    private static long number(Cursor c,String name){
        int i=c.getColumnIndex(name);return i<0||c.isNull(i)?-1:c.getLong(i);
    }
    private static Doc doc(Cursor c) {
        return new Doc(column(c,DocumentsContract.Document.COLUMN_DOCUMENT_ID),
            column(c,DocumentsContract.Document.COLUMN_DISPLAY_NAME),
            column(c,DocumentsContract.Document.COLUMN_MIME_TYPE),
            number(c,DocumentsContract.Document.COLUMN_SIZE),
            number(c,DocumentsContract.Document.COLUMN_LAST_MODIFIED));
    }
    private static ArrayList<Doc> children(Context ctx,Uri tree,String parent)throws Exception {
        Uri uri=DocumentsContract.buildChildDocumentsUriUsingTree(tree,parent);
        ArrayList<Doc> result=new ArrayList<>();
        try(Cursor cursor=ctx.getContentResolver().query(uri,PROJECTION,null,null,null)) {
            if(cursor==null)throw new SecurityException("Provedor de documentos indisponível.");
            while(cursor.moveToNext()){
                if(result.size()>=MAX_DOCUMENTS_PER_FOLDER)
                    throw new SecurityException("Pasta com muitos documentos; selecione uma subpasta menor.");
                Doc child=doc(cursor);
                if(!child.id.isEmpty()&&!child.name.isEmpty() &&
                    child.name.indexOf('/')<0 && child.name.indexOf('\\')<0 &&
                    child.name.indexOf(':')<0 && !child.name.equals(".") &&
                    !child.name.equals(".."))result.add(child);
            }
        }
        result.sort(Comparator.comparing((Doc a)->!a.dir())
            .thenComparing(a->a.name,String.CASE_INSENSITIVE_ORDER));
        return result;
    }
    private static Doc resolve(Context ctx,Uri tree,String path)throws Exception {
        if(path==null||path.length()>700||!path.startsWith("internal:"))
            throw new SecurityException("Caminho remoto inválido.");
        String relative=path.substring("internal:".length());
        String rootId=DocumentsContract.getTreeDocumentId(tree);
        Doc current=new Doc(rootId,"Pasta autorizada",DocumentsContract.Document.MIME_TYPE_DIR,0,0);
        if(relative.isEmpty())return current;
        // Commands referring to Downloads should also resolve when the user
        // selected Downloads itself (rather than its parent) in the SAF picker.
        String selectedName=rootId.substring(Math.max(rootId.lastIndexOf('/'),rootId.lastIndexOf(':'))+1);
        if(!selectedName.isEmpty() && relative.equalsIgnoreCase(selectedName))return current;
        if(!selectedName.isEmpty() && relative.regionMatches(true,0,selectedName+"/",0,selectedName.length()+1))
            relative=relative.substring(selectedName.length()+1);
        if(relative.startsWith("/")||relative.endsWith("/")||relative.contains("//") ||
            relative.indexOf('\\')>=0||relative.indexOf(':')>=0||relative.indexOf('\0')>=0)
            throw new SecurityException("Caminho inválido.");
        for(String segment:relative.split("/")){
            if(segment.isEmpty()||segment.equals(".")||segment.equals("..")||
                !current.dir())throw new SecurityException("Caminho não autorizado.");
            Doc next=null;
            for(Doc candidate:children(ctx,tree,current.id))
                if(candidate.name.equals(segment)){ next=candidate;break; }
            if(next==null)throw new SecurityException("Documento não encontrado na pasta autorizada.");
            current=next;
        }
        return current;
    }
    private static JSONObject entry(Doc d,String path)throws Exception{
        return new JSONObject().put("name",d.name).put("path",path)
            .put("directory",d.dir()).put("size",Math.max(0,d.size))
            .put("modifiedAt",Math.max(0,d.modified)).put("readable",true);
    }
    public static JSONObject execute(Context ctx,String command,JSONObject payload) {
        JSONObject response=new JSONObject();
        try {
            authorize(ctx,command,payload);
            Uri tree=activeTree(ctx);
            if(tree==null)throw new SecurityException("Permissão de pasta revogada.");
            if("files.list".equals(command)){
                String path=payload.optString("path","");
                JSONArray result=new JSONArray();
                if(path.isEmpty()){
                    result.put(entry(resolve(ctx,tree,"internal:"),"internal:"));
                    response.put("path","").put("hasMore",false);
                }else{
                    Doc folder=resolve(ctx,tree,path);
                    if(!folder.dir())throw new SecurityException("Selecione uma pasta válida.");
                    ArrayList<Doc> docs=children(ctx,tree,folder.id);
                    int offset=payload.optInt("offset",0);
                    if(offset<0||offset>docs.size())
                        throw new SecurityException("Deslocamento inválido.");
                    int end=Math.min(docs.size(),offset+PAGE_LIMIT);
                    for(int i=offset;i<end;i++){
                        Doc d=docs.get(i);
                        String next=path+d.name;
                        if(!path.endsWith(":"))next=path+"/"+d.name;
                        result.put(entry(d,next));
                    }
                    response.put("path",path).put("offset",offset)
                        .put("nextOffset",end).put("hasMore",end<docs.size());
                }
                return response.put("ok",true).put("scope","user-selected-folder")
                    .put("entries",result);
            }
            if("files.read".equals(command)){
                String path=payload.optString("path","");
                Doc d=resolve(ctx,tree,path);
                if(d.dir()||d.size<0||d.size>MAX_REMOTE_TRANSFER_BYTES)
                    throw new SecurityException("Arquivo indisponível ou maior que 16 MiB.");
                long offset=payload.optLong("offset",-1);
                if(offset<0||offset>d.size)
                    throw new SecurityException("Deslocamento inválido.");
                int count=(int)Math.min(CHUNK_BYTES,d.size-offset);
                byte[] buf=new byte[count];
                Uri fileUri=DocumentsContract.buildDocumentUriUsingTree(tree,d.id);
                try(InputStream input=ctx.getContentResolver().openInputStream(fileUri)){
                    if(input==null)throw new SecurityException("Arquivo indisponível.");
                    byte[] discard=new byte[4096];
                    long skipped=0;
                    while(skipped<offset){
                        int n=input.read(discard,0,(int)Math.min(discard.length,offset-skipped));
                        if(n<0)throw new SecurityException("Arquivo alterado durante a leitura.");
                        skipped+=n;
                    }
                    int read=0;
                    while(read<count){
                        int n=input.read(buf,read,count-read);
                        if(n<0)throw new SecurityException("Arquivo alterado durante a leitura.");
                        read+=n;
                    }
                }
                return response.put("ok",true).put("path",path)
                    .put("scope","user-selected-folder").put("size",d.size)
                    .put("offset",offset).put("nextOffset",offset+count)
                    .put("done",offset+count>=d.size)
                    .put("base64",Base64.encodeToString(buf,Base64.NO_WRAP))
                    .put("name",d.name).put("mime",d.mime.isEmpty()?"application/octet-stream":d.mime);
            }
            throw new SecurityException("Operação não permitida.");
        }catch(Exception error){
            try {
                String msg=String.valueOf(error.getMessage());
                return response.put("ok",false).put("error",msg.substring(0,Math.min(180,msg.length())));
            }catch(Exception ignored){return new JSONObject();}
        }
    }
}
