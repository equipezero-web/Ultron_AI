package com.ultron.bridge;

import android.content.Context;
import android.os.Build;
import android.os.Environment;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.RandomAccessFile;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Remote file explorer for USER-GRANTED shared storage, not private app data.
 *
 * Explicit Android "All files access" permission + a short phone-generated
 * access PIN are both required. This bridge exposes only list/read; it never
 * deletes, edits, uploads, or executes files.
 *
 * Files are relayed in bounded chunks through the authenticated Bridge command
 * channel, not to a model or external AI provider.
 */
public final class RemoteFiles {
    private static final String PREFS = "jarvis_remote_files_v070";
    private static final String KEY_CODE = "code";
    private static final String KEY_EXPIRES = "expires";
    public static final long SESSION_MS = 10 * 60_000L;
    public static final int CHUNK_BYTES = 48 * 1024;
    private static final int PAGE_LIMIT = 100;
    private static final long MAX_REMOTE_TRANSFER_BYTES = 16L * 1024L * 1024L;

    private RemoteFiles() {}

    public static boolean storageGranted(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Environment.isExternalStorageManager();
        }
        return context.checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE)
            == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    public static String enable(Context context) {
        if (!storageGranted(context)) {
            throw new IllegalStateException("Autorize 'Gerenciar todos os arquivos' nas configurações do Android.");
        }
        byte[] bytes = new byte[4];
        new SecureRandom().nextBytes(bytes);
        long value = ((bytes[0] & 255L) << 24) | ((bytes[1] & 255L) << 16)
                | ((bytes[2] & 255L) << 8) | (bytes[3] & 255L);
        String pin = String.format(java.util.Locale.ROOT, "%08d", value % 100_000_000L);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_CODE, pin).putLong(KEY_EXPIRES, System.currentTimeMillis() + SESSION_MS)
            .apply();
        return pin;
    }

    public static void disable(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }

    public static long remainingSeconds(Context context) {
        if (!storageGranted(context)) return 0;
        long expiry = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getLong(KEY_EXPIRES, 0);
        return Math.max(0, (expiry - System.currentTimeMillis()) / 1000L);
    }

    private static void authorize(Context context, JSONObject payload) {
        if (!storageGranted(context)) {
            throw new SecurityException("Permissão de armazenamento compartilhado não concedida no Android.");
        }
        if (remainingSeconds(context) == 0) {
            throw new SecurityException("Sessão remota expirada. Reative pelo aplicativo do celular.");
        }
        String expected = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_CODE, "");
        String provided = payload.optString("accessCode", "");
        if (!provided.matches("[0-9]{8}") || expected.length() != 8 ||
            !MessageDigest.isEqual(expected.getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                provided.getBytes(java.nio.charset.StandardCharsets.US_ASCII))) {
            throw new SecurityException("Código temporário do acesso remoto inválido.");
        }
    }

    private static Map<String, File> volumes(Context context) throws Exception {
        Map<String, File> result = new LinkedHashMap<>();
        File primary = Environment.getExternalStorageDirectory().getCanonicalFile();
        result.put("internal", primary);

        File[] external = context.getExternalFilesDirs(null);
        if (external != null) {
            int count = 0;
            for (File dir : external) {
                if (dir == null) continue;
                String p = dir.getCanonicalPath();
                int marker = p.indexOf("/Android/data/");
                if (marker < 0) continue;
                File root = new File(p.substring(0, marker)).getCanonicalFile();
                if (root.equals(primary) || !root.isDirectory()) continue;
                if (result.containsValue(root)) continue;
                result.put("sd" + (++count), root);
            }
        }
        return result;
    }

    private static File resolve(Map<String, File> roots, String remotePath) throws Exception {
        if (remotePath == null || remotePath.length() > 700 || remotePath.indexOf('\0') >= 0)
            throw new SecurityException("Caminho inválido.");
        int index = remotePath.indexOf(':');
        if (index < 1) throw new SecurityException("Selecione uma pasta válida.");
        String id = remotePath.substring(0, index);
        String relative = remotePath.substring(index + 1);
        File root = roots.get(id);
        if (root == null || relative.startsWith("/") || relative.startsWith("\\") ||
            relative.contains("\\") || relative.contains(":"))
            throw new SecurityException("Volume não autorizado.");
        for (String segment : relative.split("/", -1)) {
            if ("..".equals(segment) || ".".equals(segment))
                throw new SecurityException("Travessia de pastas bloqueada.");
        }
        String protectedPath = "/" + relative.toLowerCase(java.util.Locale.ROOT) + "/";
        if (protectedPath.startsWith("/android/data/") ||
            protectedPath.startsWith("/android/obb/")) {
            throw new SecurityException("Pastas privadas de aplicativos são protegidas pelo Android.");
        }
        File target = relative.isEmpty() ? root : new File(root, relative);
        String absolute = target.getCanonicalPath();
        String base = root.getCanonicalPath();
        if (!(absolute.equals(base) || absolute.startsWith(base + File.separator)))
            throw new SecurityException("Caminho fora do armazenamento autorizado.");
        return target.getCanonicalFile();
    }

    private static String childPath(String base, String name) {
        return base.endsWith(":") ? base + name : base + "/" + name;
    }

    private static JSONObject entry(String name, String path, File file) throws Exception {
        JSONObject obj = new JSONObject();
        obj.put("name", name);
        obj.put("path", path);
        obj.put("directory", file.isDirectory());
        obj.put("size", file.isFile() ? file.length() : 0);
        obj.put("modifiedAt", file.lastModified());
        obj.put("readable", file.canRead());
        return obj;
    }

    public static JSONObject execute(Context context, String command, JSONObject payload) {
        JSONObject response = new JSONObject();
        try {
            authorize(context, payload);
            Map<String, File> roots = volumes(context);
            if ("files.list".equals(command)) {
                String path = payload.optString("path", "");
                JSONArray entries = new JSONArray();
                if (path.isEmpty()) {
                    for (Map.Entry<String, File> root : roots.entrySet()) {
                        String label = "internal".equals(root.getKey())
                            ? "Armazenamento interno" : "Cartão SD / " + root.getKey();
                        entries.put(entry(label, root.getKey() + ":", root.getValue()));
                    }
                    response.put("path", "");
                    response.put("entries", entries);
                    response.put("hasMore", false);
                } else {
                    File folder = resolve(roots, path);
                    if (!folder.isDirectory() || !folder.canRead())
                        throw new IllegalArgumentException("Pasta inexistente ou inacessível.");
                    File[] children = folder.listFiles();
                    if (children == null) throw new SecurityException("Não foi possível listar esta pasta.");
                    Arrays.sort(children, Comparator.comparing(File::isDirectory).reversed()
                        .thenComparing(File::getName, String.CASE_INSENSITIVE_ORDER));
                    int requested = payload.optInt("offset", 0);
                    if (requested < 0 || requested > 100_000) throw new IllegalArgumentException("Página inválida.");
                    int end = Math.min(children.length, requested + PAGE_LIMIT);
                    for (int i = requested; i < end; i++) {
                        File child = children[i];
                        String nextPath = childPath(path, child.getName());
                        if (path.equalsIgnoreCase("internal:Android") &&
                            (child.getName().equalsIgnoreCase("data") ||
                             child.getName().equalsIgnoreCase("obb"))) continue;
                        // Avoid exposing symbolic links that leave shared storage.
                        try {
                            File verified = resolve(roots, nextPath);
                            entries.put(entry(child.getName(), nextPath, verified));
                        } catch (SecurityException ignored) {}
                    }
                    response.put("path", path);
                    response.put("offset", requested);
                    response.put("nextOffset", end);
                    response.put("hasMore", end < children.length);
                    response.put("entries", entries);
                }
                response.put("ok", true);
                return response;
            }
            if ("files.read".equals(command)) {
                String path = payload.optString("path", "");
                File file = resolve(roots, path);
                if (!file.isFile() || !file.canRead())
                    throw new IllegalArgumentException("Arquivo inexistente ou inacessível.");
                long size = file.length();
                if (size > MAX_REMOTE_TRANSFER_BYTES)
                    throw new IllegalArgumentException("Transferência acima de 16 MiB; use conexão local para arquivos grandes.");
                long offset = payload.optLong("offset", -1);
                if (offset < 0 || offset > size)
                    throw new IllegalArgumentException("Deslocamento inválido.");
                int amount = (int) Math.min(CHUNK_BYTES, size - offset);
                byte[] buffer = new byte[amount];
                try (RandomAccessFile raf = new RandomAccessFile(file, "r")) {
                    raf.seek(offset);
                    raf.readFully(buffer);
                }
                response.put("ok", true);
                response.put("path", path);
                response.put("size", size);
                response.put("offset", offset);
                response.put("nextOffset", offset + amount);
                response.put("done", offset + amount >= size);
                response.put("base64", Base64.encodeToString(buffer, Base64.NO_WRAP));
                response.put("name", file.getName());
                String extension = MimeTypeMap.getFileExtensionFromUrl(file.getName());
                String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(
                    extension.toLowerCase(java.util.Locale.ROOT));
                response.put("mime", mime == null ? "application/octet-stream" : mime);
                return response;
            }
            throw new SecurityException("Operação remota não permitida.");
        } catch (Exception e) {
            try {
                response.put("ok", false);
                response.put("error", String.valueOf(e.getMessage()).substring(
                    0, Math.min(180, String.valueOf(e.getMessage()).length())));
            } catch (Exception ignored) {}
            return response;
        }
    }
}
