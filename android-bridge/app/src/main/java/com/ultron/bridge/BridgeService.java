package com.ultron.bridge;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
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
        BridgeHealthStore.markStarting(this);
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
        BridgeHealthStore.markStopped(this);
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
            BridgeHealthStore.recordSuccess(this);
            JSONArray commands = response.optJSONArray("commands");
            if (commands == null) return;

            for (int index = 0; index < commands.length(); index++) {
                JSONObject item = commands.optJSONObject(index);
                if (item == null) continue;
                executeCommand(deviceId, secret, item);
            }
        } catch (Exception error) {
            // Retry without crashing; expose bounded, non-sensitive diagnostics
            // so "Bridge iniciado" is never confused with Cloud online.
            BridgeHealthStore.recordFailure(this, error.getMessage());
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
                    result.put("remoteMicTrusted", SecureStore.isRemoteMicTrusted(this));
                    result.put("recordAudioGranted", hasRecordAudioPermission());
                    result.put("remoteCameraTrusted", SecureStore.isRemoteCameraTrusted(this));
                    result.put("cameraGranted", RemoteCameraBridge.hasCameraPermission(this));
                    success = true;
                    break;

                case "notification.push":
                    String action = payload.optString("action", "generic");

                    RemoteCameraBridge.Result cameraResult = RemoteCameraBridge.handleNotificationAction(
                            this,
                            action,
                            payload,
                            deviceId,
                            secret
                    );
                    if (cameraResult.handled) {
                        success = cameraResult.success;
                        result = cameraResult.payload;
                        break;
                    }

                    if ("microphone.request".equals(action)) {
                        boolean trusted = SecureStore.isRemoteMicTrusted(this);
                        boolean permissionGranted = hasRecordAudioPermission();

                        if (trusted && permissionGranted) {
                            success = controlPersistentRemoteMic(RemoteMicService.ACTION_RESUME, true);
                            if (success) {
                                publishMicrophoneStatus(
                                        deviceId,
                                        secret,
                                        "active",
                                        "Permissão já salva. Microfone remoto retomado automaticamente."
                                );
                            }
                        }

                        if (!success) {
                            success = showRemoteNotification(payload);
                        }

                        result.put("delivered", success);
                        result.put("action", action);
                        result.put("permissionRemembered", trusted && permissionGranted);

                        if (!success) {
                            publishMicrophoneStatus(
                                    deviceId,
                                    secret,
                                    "blocked",
                                    "A solicitação chegou ao celular, mas o Android não permitiu ativar o microfone em segundo plano. Abra o Ultron Bridge para reativar o serviço; a permissão continua salva."
                            );
                        }
                        break;
                    }

                    if ("microphone.pause".equals(action)) {
                        success = controlPersistentRemoteMic(RemoteMicService.ACTION_PAUSE, false);
                        result.put("delivered", success);
                        result.put("action", action);
                        break;
                    }

                    if ("microphone.resume".equals(action)) {
                        success = controlPersistentRemoteMic(RemoteMicService.ACTION_RESUME, true);
                        result.put("delivered", success);
                        result.put("action", action);
                        break;
                    }

                    success = showRemoteNotification(payload);
                    result.put("delivered", success);
                    result.put("action", action);
                    break;

                case "files.list":
                case "files.read":
                    result = RemoteFiles.execute(this, command, payload);
                    success = result.optBoolean("ok", false);
                    break;

                case "tv.link":
                    result = TvAuthorization.link(this,payload.optString("code",""));
                    success = result.optBoolean("ok",false);
                    break;

                case "tv.unlink":
                    if (!payload.optBoolean("confirm",false))
                        throw new SecurityException("Revogação da TV exige confirmação explícita.");
                    TvAuthorization.revoke(this);
                    result.put("revoked",true);
                    success = true;
                    break;

                case "calendar.open":
                case "calendar.create":
                case "storage.diagnostics":
                    result = AccountPluginActions.execute(this, command, payload);
                    success = result.optBoolean("ok", false);
                    break;

                case "app.open":
                    result = openApp(payload.optString("packageName"));
                    success = result.optBoolean("ok", false);
                    break;

                default:
                    if (command.startsWith("tv.")) {
                        if (!TvAuthorization.isAuthorized(this))
                            throw new SecurityException("TV ainda não autorizada para o J.A.R.V.I.S. Pareie no Bridge Android e vincule o código de seis dígitos.");
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

    private boolean hasRecordAudioPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
                checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean controlPersistentRemoteMic(String action, boolean mayStartForeground) {
        if (!hasRecordAudioPermission() || !SecureStore.isRemoteMicTrusted(this)) {
            return false;
        }

        Intent service = new Intent(this, RemoteMicService.class);
        service.setAction(action);

        try {
            if (mayStartForeground && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(service);
            } else {
                startService(service);
            }
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    private void publishMicrophoneStatus(
            String deviceId,
            String secret,
            String state,
            String detail
    ) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("state", state);
            payload.put("detail", detail);
            BridgeApi.sendEvent(
                    deviceId,
                    secret,
                    "microphone.status",
                    payload
            );
        } catch (Exception ignored) {}
    }

    private boolean notificationsAllowed(NotificationManager manager, String channelId) {
        if (manager == null) return false;

        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !manager.areNotificationsEnabled()) {
            return false;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = manager.getNotificationChannel(channelId);
            if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) {
                return false;
            }
        }

        return true;
    }

    private boolean showRemoteNotification(JSONObject payload) {
        String action = payload.optString("action", "generic");
        NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return false;

        boolean microphoneRequest = "microphone.request".equals(action);
        String channelId = microphoneRequest ? MIC_CHANNEL_ID : CHANNEL_ID;

        if (!notificationsAllowed(manager, channelId)) {
            return false;
        }

        boolean permissionRemembered =
                microphoneRequest &&
                SecureStore.isRemoteMicTrusted(this) &&
                hasRecordAudioPermission();

        String title = microphoneRequest
                ? "Ultron quer ativar o microfone deste celular"
                : payload.optString("title", "Ultron");

        String text = microphoneRequest
                ? (permissionRemembered
                    ? "Permissão já salva. Toque apenas para reativar o serviço de microfone remoto."
                    : "Toque para abrir o Ultron Bridge e autorizar o microfone remoto uma única vez.")
                : payload.optString("text", "Nova mensagem do Ultron.");

        Intent openIntent = new Intent(this, MainActivity.class);

        if (microphoneRequest) {
            openIntent.setAction(MainActivity.ACTION_OPEN_REMOTE_MIC);
            openIntent.putExtra(MainActivity.EXTRA_REQUEST_MIC, true);
            openIntent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK |
                    Intent.FLAG_ACTIVITY_CLEAR_TOP |
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            );
        } else {
            openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                microphoneRequest ? 4102 : 4101,
                openIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

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

        if (microphoneRequest) {
            builder.addAction(
                    android.R.drawable.ic_btn_speak_now,
                    permissionRemembered ? "REATIVAR" : "AUTORIZAR MICROFONE",
                    pendingIntent
            );
        }

        if (microphoneRequest && Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setPriority(Notification.PRIORITY_HIGH);
            builder.setDefaults(Notification.DEFAULT_ALL);
        }

        manager.notify(
                microphoneRequest ? 4102 : (int) (System.currentTimeMillis() % 100000),
                builder.build()
        );
        return true;
    }

    private JSONObject openApp(String packageName) throws Exception {
        JSONObject response = new JSONObject();
        final String target = packageName == null ? "" : packageName.trim();
        if (!("com.google.android.youtube".equals(target) ||
              "com.android.chrome".equals(target) ||
              "com.whatsapp".equals(target))) {
            return response.put("ok",false).put("error","Aplicativo não autorizado para execução remota.");
        }
        Intent launch = getPackageManager().getLaunchIntentForPackage(target);
        if (launch == null)
            return response.put("ok",false).put("error","Aplicativo não encontrado ou indisponível neste Android.");
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        // Android 10+ restricts launching activities from a background service.
        // Do not claim to have opened YouTube when the OS would block the
        // activity. Foreground app: request launch. Background: notify user.
        boolean foreground = false;
        android.app.ActivityManager activityManager =
            (android.app.ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (activityManager != null) {
            java.util.List<android.app.ActivityManager.RunningAppProcessInfo> processes =
                activityManager.getRunningAppProcesses();
            if (processes != null) for (android.app.ActivityManager.RunningAppProcessInfo p : processes) {
                if (p.pid == android.os.Process.myPid() &&
                    p.importance == android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND)
                    foreground = true;
            }
        }
        if (foreground) {
            startActivity(launch);
            return response.put("ok",true).put("launchRequested",true)
                .put("message","Abertura solicitada ao Android. Confirme na tela se o aplicativo apareceu.");
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED)
            return response.put("ok",false).put("error",
                "O Android bloqueia a abertura em segundo plano e as notificações não estão autorizadas.");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null)return response.put("ok",false).put("error","Notificações Android indisponíveis.");
        PendingIntent pending = PendingIntent.getActivity(this,
            target.hashCode(),launch,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("J.A.R.V.I.S. • Abrir aplicativo")
            .setContentText("Toque para abrir " + (target.equals("com.google.android.youtube") ? "YouTube" :
                target.equals("com.whatsapp") ? "WhatsApp" : "Chrome") + " neste celular.")
            .setContentIntent(pending).setAutoCancel(true).build();
        manager.notify(4301,notification);
        return response.put("ok",false).put("requiresUserTap",true)
            .put("error","O Android impede a abertura automática em segundo plano. Toque na notificação do J.A.R.V.I.S. para abrir o aplicativo.");
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
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

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
                .setContentText("Verificando conexão com o J.A.R.V.I.S Cloud. Abra o app para diagnóstico.")
                .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
                .setOngoing(true)
                .setContentIntent(pendingIntent)
                .build();
    }
}
