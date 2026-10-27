package com.ultron.bridge;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URI;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public final class LgWebOsClient extends WebSocketClient {
    private static final long CONNECT_TIMEOUT_SECONDS = 10;
    private static final long PAIR_TIMEOUT_SECONDS = 60;
    private static final long REQUEST_TIMEOUT_SECONDS = 12;

    private final String clientKey;
    private final CountDownLatch registeredLatch = new CountDownLatch(1);
    private final AtomicReference<String> registrationKey = new AtomicReference<>();
    private final AtomicReference<Exception> registrationError = new AtomicReference<>();

    private volatile String pendingRequestId;
    private volatile CountDownLatch requestLatch;
    private final AtomicReference<JSONObject> requestResponse = new AtomicReference<>();
    private final AtomicReference<Exception> requestError = new AtomicReference<>();

    public LgWebOsClient(String host, String clientKey) throws Exception {
        super(new URI("ws://" + normalizeHost(host) + ":3000"));
        this.clientKey = clientKey == null ? "" : clientKey.trim();
        setConnectionLostTimeout(15);
    }

    private static String normalizeHost(String host) {
        String value = host == null ? "" : host.trim();
        value = value.replaceFirst("^wss?://", "");
        value = value.replaceAll(":30(00|01)$", "");
        if (value.isEmpty() || !value.matches("[a-zA-Z0-9._:-]+")) {
            throw new IllegalArgumentException("IP/host da TV inválido.");
        }
        return value;
    }

    public String connectAndRegister() throws Exception {
        if (!connectBlocking(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            throw new Exception("Não foi possível conectar à LG webOS na porta 3000.");
        }

        send(buildRegistration().toString());

        if (!registeredLatch.await(PAIR_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            throw new Exception("Tempo esgotado aguardando autorização na TV.");
        }

        Exception error = registrationError.get();
        if (error != null) throw error;

        String key = registrationKey.get();
        if (key == null || key.isEmpty()) {
            throw new Exception("A TV não retornou a chave de pareamento.");
        }
        return key;
    }

    public JSONObject request(String uri, JSONObject payload) throws Exception {
        if (!isOpen()) throw new Exception("Conexão com a TV não está aberta.");

        String id = "ultron_" + System.nanoTime();
        pendingRequestId = id;
        requestResponse.set(null);
        requestError.set(null);
        requestLatch = new CountDownLatch(1);

        JSONObject message = new JSONObject();
        message.put("type", "request");
        message.put("id", id);
        message.put("uri", uri);
        if (payload != null) message.put("payload", payload);
        send(message.toString());

        if (!requestLatch.await(REQUEST_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            throw new Exception("A LG webOS não respondeu ao comando a tempo.");
        }

        Exception error = requestError.get();
        if (error != null) throw error;

        JSONObject response = requestResponse.get();
        if (response == null) throw new Exception("Resposta vazia da LG webOS.");
        return response;
    }

    private JSONObject buildRegistration() throws Exception {
        JSONArray permissions = new JSONArray();
        String[] requested = new String[]{
                "LAUNCH", "LAUNCH_WEBAPP", "APP_TO_APP", "CLOSE",
                "CONTROL_AUDIO", "CONTROL_DISPLAY", "CONTROL_INPUT_JOYSTICK",
                "CONTROL_INPUT_MEDIA_PLAYBACK", "CONTROL_INPUT_TV", "CONTROL_POWER",
                "CONTROL_TV_SCREEN", "READ_APP_STATUS", "READ_CURRENT_CHANNEL",
                "READ_INPUT_DEVICE_LIST", "READ_NETWORK_STATE", "READ_RUNNING_APPS",
                "READ_TV_CHANNEL_LIST", "WRITE_NOTIFICATION_TOAST", "READ_POWER_STATE",
                "READ_COUNTRY_INFO", "READ_SETTINGS", "CONTROL_INPUT_TEXT",
                "CONTROL_MOUSE_AND_KEYBOARD", "WRITE_SETTINGS", "READ_INSTALLED_APPS",
                "READ_UPDATE_INFO"
        };
        for (String permission : requested) permissions.put(permission);

        JSONObject manifest = new JSONObject();
        manifest.put("manifestVersion", 1);
        manifest.put("appVersion", "1.0");
        manifest.put("permissions", permissions);

        JSONObject payload = new JSONObject();
        payload.put("forcePairing", false);
        payload.put("pairingType", "PROMPT");
        payload.put("manifest", manifest);
        if (!clientKey.isEmpty()) payload.put("client-key", clientKey);

        JSONObject register = new JSONObject();
        register.put("type", "register");
        register.put("id", "register_0");
        register.put("payload", payload);
        return register;
    }

    @Override
    public void onOpen(ServerHandshake handshake) {
        // Registration is sent synchronously after connectBlocking returns.
    }

    @Override
    public void onMessage(String message) {
        try {
            JSONObject json = new JSONObject(message);
            String type = json.optString("type");
            String id = json.optString("id");

            if ("registered".equals(type) || "register_0".equals(id)) {
                if ("error".equals(type)) {
                    registrationError.set(new Exception(json.optString("error", "Pareamento rejeitado pela TV.")));
                } else {
                    JSONObject payload = json.optJSONObject("payload");
                    String key = payload == null ? "" : payload.optString("client-key");
                    if (!key.isEmpty()) registrationKey.set(key);
                }
                if (registrationKey.get() != null || registrationError.get() != null) {
                    registeredLatch.countDown();
                }
                return;
            }

            if (pendingRequestId != null && pendingRequestId.equals(id)) {
                if ("error".equals(type)) {
                    requestError.set(new Exception(json.optString("error", "Comando rejeitado pela TV.")));
                } else {
                    JSONObject payload = json.optJSONObject("payload");
                    if (payload != null && !payload.optBoolean("returnValue", true)) {
                        requestError.set(new Exception(payload.optString("errorText", "Comando não aceito pela TV.")));
                    } else {
                        requestResponse.set(payload == null ? new JSONObject() : payload);
                    }
                }
                CountDownLatch latch = requestLatch;
                if (latch != null) latch.countDown();
            }
        } catch (Exception error) {
            if (pendingRequestId != null) {
                requestError.set(error);
                CountDownLatch latch = requestLatch;
                if (latch != null) latch.countDown();
            }
        }
    }

    @Override
    public void onClose(int code, String reason, boolean remote) {
        if (registrationKey.get() == null && registrationError.get() == null) {
            registrationError.set(new Exception("Conexão com a TV encerrada: " + reason));
            registeredLatch.countDown();
        }
        CountDownLatch latch = requestLatch;
        if (latch != null && latch.getCount() > 0) {
            requestError.set(new Exception("Conexão com a TV foi encerrada."));
            latch.countDown();
        }
    }

    @Override
    public void onError(Exception ex) {
        if (registrationKey.get() == null) {
            registrationError.compareAndSet(null, ex);
            registeredLatch.countDown();
        }
        CountDownLatch latch = requestLatch;
        if (latch != null && latch.getCount() > 0) {
            requestError.compareAndSet(null, ex);
            latch.countDown();
        }
    }

    public void shutdown() {
        try {
            if (isOpen()) closeBlocking();
            else close();
        } catch (Exception ignored) {}
    }
}
