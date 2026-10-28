package com.ultron.bridge;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class BridgeService extends Service {
    private static final String CHANNEL_ID = "ultron_bridge";
    private static final String MIC_CHANNEL_ID = "ultron_remote_mic";
    private static final int FOREGROUND_ID = 4001;

    private ScheduledExecutorService executor;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels();
        startForeground(FOREGROUND_ID, buildForegroundNotification());

        executor = Executors.newSingleThreadScheduledExecutor();
        executor.scheduleWithFixedDelay(this::pollOnce, 0, 3, TimeUnit.SECONDS);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (executor != null) {
            executor.shutdownNow();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void pollOnce() {
        try {
            String deviceId = SecureStore.getDeviceId(this);
            if (deviceId == null || deviceId.isEmpty()) return;

            String secret = SecureStore.getOrCreateDeviceSecret(this);
            JSONObject response = BridgeApi.poll(deviceId, secret);
            JSONArray commands = response.optJSONArray("commands");
            if (commands == null) return;

            for (int index = 0; index < commands.length(); index++) {
                JSONObject item = commands.optJSONObject(index);
                if (item == null) continue;
                executeCommand(deviceId, secret, item);
            }
        } catch (Exception ignored) {
            // Mantém o serviço resiliente a falhas temporárias de rede.
        }
    }

    private void executeCommand(String deviceId, String secret, JSONObject item) {
        String commandId = item.optString("id");
        String command = item.optString("command");
        JSONObject payload = item.optJSONObject("payload");
        if (payload == null) payload = new JSONObject();

        boolean success = false;
        JSONObject result = new JSONObject();

        try {
            switch (command) {
                case "device.status":
                    result.put("manufacturer", Build.MANUFACTURER);
                    result.put("model", Build.MODEL);
                    result.put("androidRelease", Build.VERSION.RELEASE);
                    result.put("sdk", Build.VERSION.SDK_INT);
                    result.put("bridge", "online");
                    success = true;
                    break;

                case "notification.push":
                    success = showRemoteNotification(payload);
                    result.put("delivered", success);
                    result.put("action", payload.optString("action", "generic"));
                    break;

                case "app.open":
                    success = openApp(payload.optString("packageName"));
                    result.put("opened", success);
                    break;

                default:
                    if (command.startsWith("tv.")) {
                        TvController.Result tvResult = TvController.execute(this, command, payload);
                        success = tvResult.success;
                        result = tvResult.payload;
                    } else {
                        result.put("message", "Comando não suportado pelo Mobile Bridge.");
                    }
                    break;
            }
        } catch (Exception error) {
            try {
                result.put("error", error.getMessage());
            } catch (Exception ignored) {}
            success = false;
        }

        try {
            BridgeApi.complete(
                    deviceId,
                    secret,
                    commandId,
                    success,
                    result
            );
        } catch (Exception ignored) {}
    }

    private boolean showRemoteNotification(JSONObject payload) {
        String action = payload.optString("action", "generic");

        if ("microphone.pause".equals(action) || "microphone.resume".equals(action)) {
            Intent control = new Intent(RemoteMicActivity.ACTION_CONTROL);
            control.setPackage(getPackageName());
            control.putExtra(
                    RemoteMicActivity.EXTRA_STATE,
                    "microphone.pause".equals(action) ? "pause" : "resume"
            );
            sendBroadcast(control);
            return true;
        }

        NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return false;

        boolean microphoneRequest = "microphone.request".equals(action);

        String title = microphoneRequest
                ? "Ultron quer usar o microfone deste celular"
                : payload.optString("title", "Ultron");

        String text = microphoneRequest
                ? "Toque para revisar e autorizar o microfone remoto. O Android pedirá sua permissão."
                : payload.optString("text", "Nova mensagem do Ultron.");

        Intent openIntent = microphoneRequest
                ? new Intent(this, RemoteMicActivity.class)
                : new Intent(this, MainActivity.class);

        if (microphoneRequest) {
            openIntent.putExtra("requestMic", true);
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                microphoneRequest ? 4102 : 4101,
                openIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        String channelId = microphoneRequest ? MIC_CHANNEL_ID : CHANNEL_ID;

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, channelId)
                : new Notification.Builder(this);

        builder.setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setSmallIcon(
                        microphoneRequest
                                ? android.R.drawable.ic_btn_speak_now
                                : android.R.drawable.stat_notify_more
                )
                .setContentIntent(pendingIntent)
                .setAutoCancel(true);

        if (microphoneRequest && Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setPriority(Notification.PRIORITY_HIGH);
        }

        manager.notify(
                microphoneRequest ? 4102 : (int) (System.currentTimeMillis() % 100000),
                builder.build()
        );
        return true;
    }

    private boolean openApp(String packageName) {
        if (packageName == null || packageName.trim().isEmpty()) return false;
        Intent launch = getPackageManager().getLaunchIntentForPackage(packageName.trim());
        if (launch == null) return false;
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(launch);
        return true;
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel bridgeChannel = new NotificationChannel(
                CHANNEL_ID,
                "Ultron Bridge",
                NotificationManager.IMPORTANCE_LOW
        );
        bridgeChannel.setDescription("Conexão ativa entre este dispositivo e o Ultron Cloud.");
        manager.createNotificationChannel(bridgeChannel);

        NotificationChannel micChannel = new NotificationChannel(
                MIC_CHANNEL_ID,
                "Solicitações de microfone do Ultron",
                NotificationManager.IMPORTANCE_HIGH
        );
        micChannel.setDescription(
                "Solicitações explícitas para usar este celular como microfone remoto do Ultron."
        );
        manager.createNotificationChannel(micChannel);
    }

    private Notification buildForegroundNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                openIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        return builder
                .setContentTitle("Ultron Bridge ativo")
                .setContentText("Conectado ao Ultron Cloud para comandos autorizados.")
                .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
                .setOngoing(true)
                .setContentIntent(pendingIntent)
                .build();
    }
}
