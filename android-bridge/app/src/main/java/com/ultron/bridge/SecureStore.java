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

    public static synchronized String getOrCreateDeviceSecret(Context context) throws Exception {
        SharedPreferences preferences = prefs(context);
        String encrypted = preferences.getString(SECRET_VALUE, null);
        String ivValue = preferences.getString(SECRET_IV, null);

        if (encrypted != null && ivValue != null) {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            byte[] iv = Base64.decode(ivValue, Base64.NO_WRAP);
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            byte[] clear = cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP));
            return new String(clear, StandardCharsets.UTF_8);
        }

        byte[] random = new byte[32];
        new SecureRandom().nextBytes(random);
        String secret = Base64.encodeToString(random, Base64.NO_WRAP | Base64.URL_SAFE);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] cipherText = cipher.doFinal(secret.getBytes(StandardCharsets.UTF_8));

        preferences.edit()
                .putString(SECRET_VALUE, Base64.encodeToString(cipherText, Base64.NO_WRAP))
                .putString(SECRET_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .apply();

        return secret;
    }

    public static void saveDeviceId(Context context, String deviceId) {
        prefs(context).edit().putString(DEVICE_ID, deviceId).apply();
    }

    public static String getDeviceId(Context context) {
        return prefs(context).getString(DEVICE_ID, null);
    }

    public static void clearPairing(Context context) {
        prefs(context).edit().remove(DEVICE_ID).apply();
    }
}
