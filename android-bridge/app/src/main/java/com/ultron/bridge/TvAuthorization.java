package com.ultron.bridge;

import android.content.Context;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;

/** One-time consent code to authorize the already paired LG webOS TV relay.
 * The native LG pairing prompt still must be approved on the television.
 * Once authorized, the TV client key remains in Android Keystore until revoked.
 */
public final class TvAuthorization {
    private static final String PREFS = "jarvis_tv_access_v090";
    private static final long CODE_TTL = 10L * 60_000L;
    private TvAuthorization() {}

    public static String createCode(Context context) {
        byte[] saltBytes = new byte[16];
        SecureRandom random = new SecureRandom();
        random.nextBytes(saltBytes);
        StringBuilder salt = new StringBuilder(32);
        for (byte item : saltBytes) salt.append(String.format(java.util.Locale.ROOT,"%02x",item & 255));
        String code = String.format(java.util.Locale.ROOT,"%06d",100000 + random.nextInt(900000));
        String hash = sha256(code+":"+salt);
        context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit()
            .putBoolean("authorized",false).putString("hash",hash).putString("salt",salt.toString())
            .putInt("attempts",0).putLong("expires",System.currentTimeMillis()+CODE_TTL)
            .commit();
        return code;
    }

    private static String sha256(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(bytes.length*2);
            for (byte b:bytes) hex.append(String.format(java.util.Locale.ROOT,"%02x",b & 255));
            return hex.toString();
        } catch(Exception e) { throw new IllegalStateException("SHA-256 indisponível",e); }
    }

    public static boolean isAuthorized(Context context) {
        if (!context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getBoolean("authorized",false))
            return false;
        try {
            String key=SecureStore.getLgTvClientKey(context);
            String host=SecureStore.getLgTvHost(context);
            return key!=null&&!key.isEmpty()&&host!=null&&!host.isEmpty();
        } catch(Exception error) { return false; }
    }

    public static JSONObject link(Context context, String code) throws Exception {
        JSONObject result = new JSONObject();
        android.content.SharedPreferences prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        if (isAuthorized(context)) {
            return result.put("ok",true).put("alreadyLinked",true)
                .put("message","TV já vinculada até a revogação pelo proprietário.");
        }
        if (code==null||!code.matches("[0-9]{6}"))
            throw new SecurityException("Informe o código de TV de seis dígitos exibido no Bridge Android.");
        long expires=prefs.getLong("expires",0);
        int attempts=prefs.getInt("attempts",0);
        if (expires<=System.currentTimeMillis()||attempts>=5)
            throw new SecurityException("Código de TV expirado ou bloqueado. Gere outro no Bridge.");
        String expected=prefs.getString("hash","");
        String salt=prefs.getString("salt","");
        prefs.edit().putInt("attempts",attempts+1).commit();
        if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII),
            sha256(code+":"+salt).getBytes(StandardCharsets.US_ASCII)))
            throw new SecurityException("Código da TV inválido.");
        String tvKey=SecureStore.getLgTvClientKey(context);
        if (tvKey==null||tvKey.isEmpty())
            throw new SecurityException("A TV precisa ser pareada e autorizada na própria tela primeiro.");
        prefs.edit().clear().putBoolean("authorized",true).commit();
        return result.put("ok",true).put("permanent",true)
            .put("message","TV vinculada até revogação. O celular e a TV precisam estar acessíveis na rede.");
    }

    public static void revoke(Context context) {
        context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().clear().commit();
        SecureStore.clearLgTv(context);
    }
}
