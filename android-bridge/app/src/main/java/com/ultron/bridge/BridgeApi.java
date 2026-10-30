package com.ultron.bridge;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class BridgeApi {
    public static final String BASE_URL = "https://ultron-backend.lucaalves17-20.workers.dev";
    private static final int SIGNALING_EVENT_ATTEMPTS = 3;

    private BridgeApi() {}

    private static JSONObject post(String path, JSONObject body) throws Exception {
        URL url = new URL(BASE_URL + path);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(20000);
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setDoOutput(true);

        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(payload);
        }

        int status = connection.getResponseCode();
        InputStream input = status >= 200 && status < 300
                ? connection.getInputStream()
                : connection.getErrorStream();

        StringBuilder text = new StringBuilder();
        if (input != null) {
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(input, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    text.append(line);
                }
            }
        }

        connection.disconnect();

        JSONObject response = text.length() > 0
                ? new JSONObject(text.toString())
                : new JSONObject();

        if (status < 200 || status >= 300 || response.optBoolean("ok", true) == false) {
            throw new IllegalStateException(
                    response.optString("error", "HTTP " + status)
            );
        }

        return response;
    }

    public static JSONObject claimPairing(
            String code,
            String deviceSecret,
            String deviceName,
            String platform
    ) throws Exception {
        JSONArray capabilities = new JSONArray();
        capabilities.put("device.status");
        capabilities.put("notification.push");
        capabilities.put("app.open");
        capabilities.put("microphone.remote");
        capabilities.put("speech.transcript");
        capabilities.put("camera.remote");
        capabilities.put("camera.webrtc");
        capabilities.put("tv.status");
        capabilities.put("tv.power.toggle");
        capabilities.put("tv.volume.set");
        capabilities.put("tv.volume.up");
        capabilities.put("tv.volume.down");
        capabilities.put("tv.mute.toggle");
        capabilities.put("tv.media.play");
        capabilities.put("tv.media.pause");
        capabilities.put("tv.media.stop");
        capabilities.put("tv.media.seek");
        capabilities.put("tv.input");
        capabilities.put("tv.launch");
        capabilities.put("tv.cast");

        JSONObject body = new JSONObject();
        body.put("code", code);
        body.put("deviceSecret", deviceSecret);
        body.put("deviceType", "mobile");
        body.put("deviceName", deviceName);
        body.put("platform", platform);
        body.put("capabilities", capabilities);

        return post("/api/devices/pair/claim", body);
    }

    public static JSONObject poll(String deviceId, String deviceSecret) throws Exception {
        JSONObject body = new JSONObject();
        body.put("deviceId", deviceId);
        body.put("deviceSecret", deviceSecret);
        return post("/api/bridge/poll", body);
    }

    public static JSONObject complete(
            String deviceId,
            String deviceSecret,
            String commandId,
            boolean success,
            JSONObject result
    ) throws Exception {
        JSONObject body = new JSONObject();
        body.put("deviceId", deviceId);
        body.put("deviceSecret", deviceSecret);
        body.put("commandId", commandId);
        body.put("status", success ? "completed" : "failed");
        body.put("result", result == null ? new JSONObject() : result);
        return post("/api/bridge/result", body);
    }

    public static JSONObject sendEvent(
            String deviceId,
            String deviceSecret,
            String eventType,
            JSONObject payload
    ) throws Exception {
        JSONObject body = new JSONObject();
        body.put("deviceId", deviceId);
        body.put("deviceSecret", deviceSecret);
        body.put("eventType", eventType);
        body.put("payload", payload == null ? new JSONObject() : payload);

        Exception lastError = null;
        for (int attempt = 1; attempt <= SIGNALING_EVENT_ATTEMPTS; attempt += 1) {
            try {
                return post("/api/bridge/event", body);
            } catch (Exception error) {
                lastError = error;
                if (attempt < SIGNALING_EVENT_ATTEMPTS) {
                    try {
                        Thread.sleep(180L * attempt);
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        throw interrupted;
                    }
                }
            }
        }

        throw lastError != null
                ? lastError
                : new IllegalStateException("Falha ao enviar evento do Ultron Bridge.");
    }
}
