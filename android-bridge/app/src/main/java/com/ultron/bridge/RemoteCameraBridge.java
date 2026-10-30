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

import org.json.JSONObject;

public final class RemoteCameraBridge {
    private static final String CHANNEL_ID = "ultron_camera_requests";
    private static final int REQUEST_NOTIFICATION_ID = 4302;

    private RemoteCameraBridge() {}

    public static final class Result {
        public final boolean handled;
        public final boolean success;
        public final JSONObject payload;

        private Result(boolean handled, boolean success, JSONObject payload) {
            this.handled = handled;
            this.success = success;
            this.payload = payload == null ? new JSONObject() : payload;
        }

        public static Result ignored() {
            return new Result(false, false, new JSONObject());
        }
    }

    public static boolean hasCameraPermission(Service service) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
                service.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    public static Result handleNotificationAction(
            Service service,
            String action,
            JSONObject payload,
            String deviceId,
            String secret
    ) {
        String normalized = action == null ? "" : action.trim();
        if (!normalized.startsWith("camera.")) return Result.ignored();

        JSONObject result = new JSONObject();
        try {
            result.put("action", normalized);
            boolean trusted = SecureStore.isRemoteCameraTrusted(service);
            boolean permissionGranted = hasCameraPermission(service);
            result.put("permissionRemembered", trusted && permissionGranted);

            if ("camera.request".equals(normalized)) {
                boolean started = false;
                if (trusted && permissionGranted) {
                    started = sendServiceAction(service, RemoteCameraService.ACTION_START, payload);
                }

                if (!started) {
                    started = showAuthorizationNotification(service, trusted && permissionGranted);
                }

                result.put("delivered", started);
                return new Result(true, started, result);
            }

            if (!trusted || !permissionGranted) {
                boolean notified = showAuthorizationNotification(service, false);
                result.put("delivered", notified);
                result.put("error", "camera authorization required");
                return new Result(true, false, result);
            }

            String serviceAction;
            if ("camera.webrtc.offer".equals(normalized)) {
                serviceAction = RemoteCameraService.ACTION_OFFER;
            } else if ("camera.webrtc.ice".equals(normalized)) {
                serviceAction = RemoteCameraService.ACTION_ICE;
            } else if ("camera.stop".equals(normalized)) {
                serviceAction = RemoteCameraService.ACTION_CLOSE_SESSION;
            } else {
                result.put("error", "camera action not supported");
                return new Result(true, false, result);
            }

            boolean sent = sendServiceAction(service, serviceAction, payload);
            result.put("delivered", sent);
            if (!sent) result.put("error", "camera service unavailable");
            return new Result(true, sent, result);
        } catch (Exception error) {
            try { result.put("error", error.getMessage()); } catch (Exception ignored) {}
            return new Result(true, false, result);
        }
    }

    private static boolean sendServiceAction(Service service, String serviceAction, JSONObject payload) {
        Intent intent = new Intent(service, RemoteCameraService.class);
        intent.setAction(serviceAction);

        String sessionId = payload.optString("sessionId", "");
        if (!sessionId.isEmpty()) {
            intent.putExtra(RemoteCameraService.EXTRA_SESSION_ID, sessionId);
        }

        if (RemoteCameraService.ACTION_OFFER.equals(serviceAction)) {
            intent.putExtra(RemoteCameraService.EXTRA_SDP, payload.optString("sdp", ""));
        } else if (RemoteCameraService.ACTION_ICE.equals(serviceAction)) {
            intent.putExtra(RemoteCameraService.EXTRA_CANDIDATE, payload.optString("candidate", ""));
            if (!payload.isNull("sdpMid")) {
                intent.putExtra(RemoteCameraService.EXTRA_SDP_MID, payload.optString("sdpMid", ""));
            }
            intent.putExtra(
                    RemoteCameraService.EXTRA_SDP_MLINE_INDEX,
                    payload.optInt("sdpMLineIndex", 0)
            );
        }

        try {
            if (RemoteCameraService.ACTION_START.equals(serviceAction) &&
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                service.startForegroundService(intent);
            } else {
                service.startService(intent);
            }
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    private static boolean showAuthorizationNotification(Service service, boolean permissionRemembered) {
        NotificationManager manager =
                (NotificationManager) service.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return false;

        if (Build.VERSION.SDK_INT >= 33 &&
                service.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !manager.areNotificationsEnabled()) {
            return false;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = manager.getNotificationChannel(CHANNEL_ID);
            if (channel == null) {
                channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Solicitações de câmera do Ultron",
                        NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Autoriza uma única vez o uso deste celular como câmera remota do Ultron.");
                manager.createNotificationChannel(channel);
            }
            if (channel.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
        }

        Intent openIntent = new Intent(service, RemoteCameraActivity.class);
        openIntent.putExtra("requestCamera", true);
        openIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_CLEAR_TOP |
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        );

        PendingIntent pendingIntent = PendingIntent.getActivity(
                service,
                REQUEST_NOTIFICATION_ID,
                openIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        String text = permissionRemembered
                ? "A permissão continua salva. Toque apenas para reativar o serviço de câmera remota."
                : "Toque para autorizar a câmera uma única vez no Ultron Bridge.";

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(service, CHANNEL_ID)
                : new Notification.Builder(service);

        builder.setContentTitle("Ultron quer usar a câmera deste celular")
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setSmallIcon(android.R.drawable.presence_video_online)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .addAction(
                        android.R.drawable.presence_video_online,
                        permissionRemembered ? "REATIVAR CÂMERA" : "AUTORIZAR UMA VEZ",
                        pendingIntent
                );

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setPriority(Notification.PRIORITY_HIGH);
            builder.setDefaults(Notification.DEFAULT_ALL);
        }

        manager.notify(REQUEST_NOTIFICATION_ID, builder.build());
        return true;
    }
}
