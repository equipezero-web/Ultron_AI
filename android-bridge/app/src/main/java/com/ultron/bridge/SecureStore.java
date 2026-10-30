package com.ultron.bridge;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public final class SecureStore {
    private static final String PREFS = "ultron_bridge_secure";
    private static final String KEY_ALIAS = "ultron_bridge_master_key_v1";
    private static final String SECRET_VALUE = "device_secret_cipher";
    private static final String SECRET_IV = "device_secret_iv";
    private static final String DEVICE_ID = "device_id";
    private static final String LG_TV_HOST = "lg_tv_host";
    private static final String LG_TV_MAC = "lg_tv_mac";
    private static final String LG_TV_KEY_VALUE = "lg_tv_client_key_cipher";
    private static final String LG_TV_KEY_IV = "lg_tv_client_key_iv";
    private static final String REMOTE_MIC_TRUSTED = "remote_mic_trusted";
    private static final String REMOTE_CAMERA_TRUSTED = "remote_camera_trusted";

    private SecureStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);

        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        }

        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                "AndroidKeyStore"
        );
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }

    private static String decrypt(Context context, String valueKey, String ivKey) throws Exception {
        SharedPreferences preferences = prefs(context);
        String encrypted = preferences.getString(valueKey, null);
        String ivValue = preferences.getString(ivKey, null);
        if (encrypted == null || ivValue == null) return null;

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        byte[] iv = Base64.decode(ivValue, Base64.NO_WRAP);
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
        byte[] clear = cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP));
        return new String(clear, StandardCharsets.UTF_8);
    }

    private static void encrypt(Context context, String valueKey, String ivKey, String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] cipherText = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));

        prefs(context).edit()
                .putString(valueKey, Base64.encodeToString(cipherText, Base64.NO_WRAP))
                .putString(ivKey, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .apply();
    }

    public static synchronized String getOrCreateDeviceSecret(Context context) throws Exception {
        String existing = decrypt(context, SECRET_VALUE, SECRET_IV);
        if (existing != null && !existing.isEmpty()) return existing;

        byte[] random = new byte[32];
        new SecureRandom().nextBytes(random);
        String secret = Base64.encodeToString(random, Base64.NO_WRAP | Base64.URL_SAFE);
        encrypt(context, SECRET_VALUE, SECRET_IV, secret);
        return secret;
    }

    public static void saveDeviceId(Context context, String deviceId) {
        prefs(context).edit().putString(DEVICE_ID, deviceId).apply();
    }

    public static String getDeviceId(Context context) {
        return prefs(context).getString(DEVICE_ID, null);
    }

    public static void setRemoteMicTrusted(Context context, boolean trusted) {
        prefs(context).edit().putBoolean(REMOTE_MIC_TRUSTED, trusted).apply();
    }

    public static boolean isRemoteMicTrusted(Context context) {
        return prefs(context).getBoolean(REMOTE_MIC_TRUSTED, false);
    }

    public static void setRemoteCameraTrusted(Context context, boolean trusted) {
        prefs(context).edit().putBoolean(REMOTE_CAMERA_TRUSTED, trusted).apply();
    }

    public static boolean isRemoteCameraTrusted(Context context) {
        return prefs(context).getBoolean(REMOTE_CAMERA_TRUSTED, false);
    }

    public static void saveLgTvHost(Context context, String host) {
        prefs(context).edit().putString(LG_TV_HOST, host == null ? "" : host.trim()).apply();
    }

    public static String getLgTvHost(Context context) {
        return prefs(context).getString(LG_TV_HOST, null);
    }

    public static void saveLgTvMac(Context context, String mac) {
        prefs(context).edit().putString(LG_TV_MAC, mac == null ? "" : mac.trim().toUpperCase()).apply();
    }

    public static String getLgTvMac(Context context) {
        return prefs(context).getString(LG_TV_MAC, null);
    }

    public static synchronized void saveLgTvClientKey(Context context, String key) throws Exception {
        if (key == null || key.trim().isEmpty()) return;
        encrypt(context, LG_TV_KEY_VALUE, LG_TV_KEY_IV, key.trim());
    }

    public static synchronized String getLgTvClientKey(Context context) throws Exception {
        return decrypt(context, LG_TV_KEY_VALUE, LG_TV_KEY_IV);
    }

    public static void clearLgTv(Context context) {
        prefs(context).edit()
                .remove(LG_TV_HOST)
                .remove(LG_TV_MAC)
                .remove(LG_TV_KEY_VALUE)
                .remove(LG_TV_KEY_IV)
                .apply();
    }

    public static void clearPairing(Context context) {
        prefs(context).edit()
                .remove(DEVICE_ID)
                .remove(REMOTE_MIC_TRUSTED)
                .remove(REMOTE_CAMERA_TRUSTED)
                .apply();
    }
}
