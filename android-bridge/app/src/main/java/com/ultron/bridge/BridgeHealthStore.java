package com.ultron.bridge;

import android.content.Context;
import android.content.SharedPreferences;

// Local-only diagnostics: no device secret, token, operator ID or camera frame
// is ever written here. A started foreground service is not evidence that
// the Cloud gateway accepted its device credentials.
public final class BridgeHealthStore {
    private static final String PREFS = "ultron_bridge_heartbeat_v1";
    private static final String RUNNING = "service_requested";
    private static final String LAST_OK = "last_success_ms";
    private static final String LAST_FAILURE = "last_failure_ms";
    private static final String ERROR = "last_error";
    private static final long FRESH_MS = 45_000L;

    private BridgeHealthStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void markStarting(Context context) {
        prefs(context).edit().putBoolean(RUNNING, true)
                .putLong(LAST_OK, 0L)
                .putLong(LAST_FAILURE, 0L)
                .remove(ERROR).apply();
    }

    public static void recordSuccess(Context context) {
        prefs(context).edit().putBoolean(RUNNING, true)
                .putLong(LAST_OK, System.currentTimeMillis())
                .putLong(LAST_FAILURE, 0L).remove(ERROR).apply();
    }

    public static void recordFailure(Context context, String message) {
        String safe = String.valueOf(message == null ? "Falha de rede" : message)
                .replace('\n', ' ').replace('\r', ' ');
        if (safe.length() > 160) safe = safe.substring(0, 160);
        prefs(context).edit().putBoolean(RUNNING, true)
                .putLong(LAST_FAILURE, System.currentTimeMillis())
                .putString(ERROR, safe).apply();
    }

    public static void markStopped(Context context) {
        prefs(context).edit().putBoolean(RUNNING, false).apply();
    }

    public static String readableStatus(Context context) {
        SharedPreferences state = prefs(context);
        if (!state.getBoolean(RUNNING, false)) return "PARADO";
        long now = System.currentTimeMillis();
        long success = state.getLong(LAST_OK, 0L);
        long failure = state.getLong(LAST_FAILURE, 0L);
        boolean fresh = success > 0L && now >= success && now - success <= FRESH_MS;
        if (failure > success && failure > 0L) {
            String detail = state.getString(ERROR, "Falha de comunicação");
            return (fresh ? "INSTÁVEL" : "SEM CONEXÃO") + " — " + detail;
        }
        if (fresh) return "ONLINE / comunicação confirmada pelo Cloud";
        if (success > 0L) return "OFFLINE / último contato expirou";
        return "INICIANDO / aguardando primeira resposta do Cloud";
    }
}
