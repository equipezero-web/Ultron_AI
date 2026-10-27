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

    public static Result execute(Context context, String command, JSONObject payload) {
        JSONObject result = new JSONObject();
        try {
            result.put("command", command);
            result.put("adapter", "not_configured");
            result.put("message",
                    "A camada de TV está pronta, mas precisa do adaptador específico da sua TV: Google Cast/Android TV, Samsung/Tizen ou LG/webOS.");
        } catch (Exception ignored) {}
        return new Result(false, result);
    }
}
