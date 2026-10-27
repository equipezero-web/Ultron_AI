package com.ultron.bridge;

import android.content.Context;

import org.json.JSONObject;

public final class TvController {
    public static final class Result {
        public final boolean success;
        public final JSONObject payload;

        Result(boolean success, JSONObject payload) {
            this.success = success;
            this.payload = payload;
        }
    }

    private TvController() {}

    public static Result pairLg(Context context, String host) {
        JSONObject result = new JSONObject();
        LgWebOsClient client = null;
        try {
            SecureStore.saveLgTvHost(context, host);
            String previousKey = SecureStore.getLgTvClientKey(context);

            try {
                client = new LgWebOsClient(host, previousKey);
                String key = client.connectAndRegister();
                SecureStore.saveLgTvClientKey(context, key);
            } catch (Exception firstError) {
                if (client != null) client.shutdown();
                client = new LgWebOsClient(host, null);
                String key = client.connectAndRegister();
                SecureStore.saveLgTvClientKey(context, key);
            }

            JSONObject info = client.request("ssap://system/getSystemInfo", null);
            result.put("adapter", "lg_webos_ssap");
            result.put("host", host);
            result.put("model", "LG webOS TV UR8750PSA");
            result.put("paired", true);
            result.put("system", info);
            return new Result(true, result);
        } catch (Exception error) {
            try {
                result.put("adapter", "lg_webos_ssap");
                result.put("paired", false);
                result.put("error", error.getMessage());
            } catch (Exception ignored) {}
            return new Result(false, result);
        } finally {
            if (client != null) client.shutdown();
        }
    }

    public static Result execute(Context context, String command, JSONObject payload) {
        JSONObject result = new JSONObject();
        LgWebOsClient client = null;
        try {
            String host = SecureStore.getLgTvHost(context);
            String key = SecureStore.getLgTvClientKey(context);
            if (host == null || host.isEmpty() || key == null || key.isEmpty()) {
                result.put("adapter", "lg_webos_ssap");
                result.put("message", "LG webOS ainda não pareada no Mobile Bridge.");
                return new Result(false, result);
            }

            result.put("command", command);
            result.put("adapter", "lg_webos_ssap");
            result.put("host", host);

            if ("tv.power_on".equals(command)) {
                result.put("message", "Para ligar a TV desligada, o próximo passo é cadastrar o MAC para Wake-on-LAN.");
                return new Result(false, result);
            }

            client = new LgWebOsClient(host, key);
            String refreshedKey = client.connectAndRegister();
            if (!refreshedKey.equals(key)) SecureStore.saveLgTvClientKey(context, refreshedKey);

            String uri;
            JSONObject requestPayload = null;

            switch (command) {
                case "tv.status":
                    uri = "ssap://system/getSystemInfo";
                    break;
                case "tv.volume_get":
                    uri = "ssap://audio/getVolume";
                    break;
                case "tv.volume_up":
                    uri = "ssap://audio/volumeUp";
                    break;
                case "tv.volume_down":
                    uri = "ssap://audio/volumeDown";
                    break;
                case "tv.volume_set":
                    uri = "ssap://audio/setVolume";
                    requestPayload = new JSONObject();
                    requestPayload.put("volume", Math.max(0, Math.min(100, payload.optInt("volume", 10))));
                    break;
                case "tv.mute":
                    uri = "ssap://audio/setMute";
                    requestPayload = new JSONObject();
                    requestPayload.put("mute", payload.optBoolean("mute", true));
                    break;
                case "tv.play":
                    uri = "ssap://media.controls/play";
                    break;
                case "tv.pause":
                    uri = "ssap://media.controls/pause";
                    break;
                case "tv.stop":
                    uri = "ssap://media.controls/stop";
                    break;
                case "tv.channel_up":
                    uri = "ssap://tv/channelUp";
                    break;
                case "tv.channel_down":
                    uri = "ssap://tv/channelDown";
                    break;
                case "tv.input":
                    uri = "ssap://tv/switchInput";
                    requestPayload = new JSONObject();
                    requestPayload.put("inputId", payload.optString("inputId", "HDMI_1"));
                    break;
                case "tv.list_inputs":
                    uri = "ssap://tv/getExternalInputList";
                    break;
                case "tv.app_open":
                    uri = "ssap://system.launcher/launch";
                    requestPayload = new JSONObject();
                    requestPayload.put("id", payload.optString("appId", payload.optString("id", "youtube.leanback.v4")));
                    break;
                case "tv.list_apps":
                    uri = "ssap://com.webos.applicationManager/listLaunchPoints";
                    break;
                case "tv.toast":
                    uri = "ssap://system.notifications/createToast";
                    requestPayload = new JSONObject();
                    requestPayload.put("message", payload.optString("message", "Ultron conectado."));
                    break;
                case "tv.power_off":
                    uri = "ssap://system/turnOff";
                    break;
                default:
                    result.put("message", "Comando de TV não permitido pelo adaptador LG webOS.");
                    return new Result(false, result);
            }

            JSONObject response = client.request(uri, requestPayload);
            result.put("response", response);
            result.put("success", true);
            return new Result(true, result);
        } catch (Exception error) {
            try {
                result.put("success", false);
                result.put("error", error.getMessage());
            } catch (Exception ignored) {}
            return new Result(false, result);
        } finally {
            if (client != null) client.shutdown();
        }
    }
}
