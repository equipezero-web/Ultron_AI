package com.ultron.bridge;

import android.content.Context;

import org.json.JSONObject;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;

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
            result.put("transport", client.getActiveTransport());
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

    private static String normalizeCommand(String command) {
        if (command == null) return "";
        switch (command) {
            case "tv.power_on": return "tv.power.on";
            case "tv.power_off": return "tv.power.off";
            case "tv.volume_get": return "tv.volume.get";
            case "tv.volume_up": return "tv.volume.up";
            case "tv.volume_down": return "tv.volume.down";
            case "tv.volume_set": return "tv.volume.set";
            case "tv.channel_up": return "tv.channel.up";
            case "tv.channel_down": return "tv.channel.down";
            case "tv.list_inputs": return "tv.inputs.list";
            case "tv.app_open": return "tv.launch";
            case "tv.list_apps": return "tv.apps.list";
            case "tv.play": return "tv.media.play";
            case "tv.pause": return "tv.media.pause";
            case "tv.stop": return "tv.media.stop";
            default: return command;
        }
    }

    private static byte[] parseMac(String mac) {
        String normalized = String.valueOf(mac == null ? "" : mac)
                .replace(":", "")
                .replace("-", "")
                .trim();
        if (!normalized.matches("(?i)^[0-9a-f]{12}$")) {
            throw new IllegalArgumentException("MAC da TV inválido.");
        }

        byte[] bytes = new byte[6];
        for (int i = 0; i < 6; i++) {
            bytes[i] = (byte) Integer.parseInt(normalized.substring(i * 2, i * 2 + 2), 16);
        }
        return bytes;
    }

    private static String subnetBroadcast(String host) {
        String[] parts = String.valueOf(host == null ? "" : host).trim().split("\\.");
        if (parts.length != 4) return "255.255.255.255";
        return parts[0] + "." + parts[1] + "." + parts[2] + ".255";
    }

    private static void sendWakeOnLan(String host, String mac) throws Exception {
        byte[] macBytes = parseMac(mac);
        byte[] packet = new byte[6 + 16 * macBytes.length];

        for (int i = 0; i < 6; i++) packet[i] = (byte) 0xFF;
        for (int i = 6; i < packet.length; i += macBytes.length) {
            System.arraycopy(macBytes, 0, packet, i, macBytes.length);
        }

        String[] targets = new String[]{"255.255.255.255", subnetBroadcast(host)};
        int[] ports = new int[]{9, 7};

        try (DatagramSocket socket = new DatagramSocket()) {
            socket.setBroadcast(true);
            for (int round = 0; round < 3; round++) {
                for (String target : targets) {
                    InetAddress address = InetAddress.getByName(target);
                    for (int port : ports) {
                        DatagramPacket datagram = new DatagramPacket(packet, packet.length, address, port);
                        socket.send(datagram);
                    }
                }
                Thread.sleep(120);
            }
        }
    }

    private static Result wake(Context context, String command) {
        JSONObject result = new JSONObject();
        try {
            String host = SecureStore.getLgTvHost(context);
            String mac = SecureStore.getLgTvMac(context);
            if (host == null || host.isEmpty()) {
                result.put("error", "IP da LG ainda não configurado.");
                return new Result(false, result);
            }
            if (mac == null || mac.isEmpty()) {
                result.put("error", "MAC da LG ainda não configurado no celular.");
                return new Result(false, result);
            }

            sendWakeOnLan(host, mac);
            result.put("command", command);
            result.put("adapter", "lg_webos_wol");
            result.put("host", host);
            result.put("sent", true);
            result.put("message", "Magic packet Wake-on-LAN enviado para a LG.");
            return new Result(true, result);
        } catch (Exception error) {
            try {
                result.put("adapter", "lg_webos_wol");
                result.put("sent", false);
                result.put("error", error.getMessage());
            } catch (Exception ignored) {}
            return new Result(false, result);
        }
    }

    public static Result execute(Context context, String rawCommand, JSONObject payload) {
        String command = normalizeCommand(rawCommand);
        JSONObject result = new JSONObject();
        LgWebOsClient client = null;

        if ("tv.power.on".equals(command)) {
            return wake(context, command);
        }

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

            if ("tv.power.toggle".equals(command)) {
                try {
                    client = new LgWebOsClient(host, key);
                    client.connectAndRegister();
                    result.put("transport", client.getActiveTransport());
                    JSONObject response = client.request("ssap://system/turnOff", null);
                    result.put("response", response);
                    result.put("success", true);
                    return new Result(true, result);
                } catch (Exception offline) {
                    if (client != null) client.shutdown();
                    client = null;
                    return wake(context, "tv.power.on");
                }
            }

            client = new LgWebOsClient(host, key);
            String refreshedKey = client.connectAndRegister();
            result.put("transport", client.getActiveTransport());
            if (!refreshedKey.equals(key)) SecureStore.saveLgTvClientKey(context, refreshedKey);

            String uri;
            JSONObject requestPayload = null;

            switch (command) {
                case "tv.status":
                    uri = "ssap://system/getSystemInfo";
                    break;
                case "tv.volume.get":
                    uri = "ssap://audio/getVolume";
                    break;
                case "tv.volume.up":
                    uri = "ssap://audio/volumeUp";
                    break;
                case "tv.volume.down":
                    uri = "ssap://audio/volumeDown";
                    break;
                case "tv.volume.set":
                    uri = "ssap://audio/setVolume";
                    requestPayload = new JSONObject();
                    requestPayload.put("volume", Math.max(0, Math.min(100, payload.optInt("volume", 10))));
                    break;
                case "tv.mute.toggle":
                case "tv.mute":
                    uri = "ssap://audio/setMute";
                    requestPayload = new JSONObject();
                    requestPayload.put("mute", payload.optBoolean("mute", true));
                    break;
                case "tv.media.play":
                    uri = "ssap://media.controls/play";
                    break;
                case "tv.media.pause":
                    uri = "ssap://media.controls/pause";
                    break;
                case "tv.media.stop":
                    uri = "ssap://media.controls/stop";
                    break;
                case "tv.channel.up":
                    uri = "ssap://tv/channelUp";
                    break;
                case "tv.channel.down":
                    uri = "ssap://tv/channelDown";
                    break;
                case "tv.input":
                    uri = "ssap://tv/switchInput";
                    requestPayload = new JSONObject();
                    requestPayload.put("inputId", payload.optString("inputId", "HDMI_1"));
                    break;
                case "tv.inputs.list":
                    uri = "ssap://tv/getExternalInputList";
                    break;
                case "tv.launch":
                    uri = "ssap://system.launcher/launch";
                    requestPayload = new JSONObject();
                    requestPayload.put("id", payload.optString("appId", payload.optString("id", "youtube.leanback.v4")));
                    break;
                case "tv.apps.list":
                    uri = "ssap://com.webos.applicationManager/listLaunchPoints";
                    break;
                case "tv.toast":
                    uri = "ssap://system.notifications/createToast";
                    requestPayload = new JSONObject();
                    requestPayload.put("message", payload.optString("message", "Ultron conectado."));
                    break;
                case "tv.power.off":
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
