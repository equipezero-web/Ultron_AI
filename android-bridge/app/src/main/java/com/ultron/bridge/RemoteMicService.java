package com.ultron.bridge;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import org.json.JSONObject;

import java.util.ArrayList;

public class RemoteMicService extends Service {
    public static final String ACTION_START = "com.ultron.bridge.REMOTE_MIC_START";
    public static final String ACTION_PAUSE = "com.ultron.bridge.REMOTE_MIC_PAUSE";
    public static final String ACTION_RESUME = "com.ultron.bridge.REMOTE_MIC_RESUME";
    public static final String ACTION_STOP = "com.ultron.bridge.REMOTE_MIC_STOP";
    public static final String ACTION_STATUS = "com.ultron.bridge.REMOTE_MIC_STATUS";
    public static final String EXTRA_STATUS = "status";
    public static final String EXTRA_DETAIL = "detail";

    private static final String CHANNEL_ID = "ultron_remote_mic_service";
    private static final int FOREGROUND_ID = 4201;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private Intent recognizerIntent;
    private boolean listeningEnabled = true;
    private boolean systemPaused = false;
    private boolean restarting = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        Notification notification = buildNotification("Microfone remoto disponível");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                    FOREGROUND_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            );
        } else {
            startForeground(FOREGROUND_ID, notification);
        }

        prepareRecognizer();
        publishStatus("active", "Microfone remoto autorizado e disponível para o Ultron.");
        startListeningNow();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();

        if (ACTION_STOP.equals(action)) {
            stopRemoteMicrophone(true);
            return START_NOT_STICKY;
        }

        if (ACTION_PAUSE.equals(action)) {
            pauseForUltronSpeech();
            return START_STICKY;
        }

        if (ACTION_RESUME.equals(action) || ACTION_START.equals(action) || action == null) {
            resumeAfterUltronSpeech();
            return START_STICKY;
        }

        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Microfone remoto do Ultron",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription(
                "Mantém o microfone remoto disponível após sua autorização explícita."
        );
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(String text) {
        Intent openIntent = new Intent(this, RemoteMicActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent openPending = PendingIntent.getActivity(
                this,
                4201,
                openIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Intent stopIntent = new Intent(this, RemoteMicService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(
                this,
                4202,
                stopIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        return builder
                .setContentTitle("Ultron // Microfone remoto")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentIntent(openPending)
                .setOngoing(true)
                .addAction(android.R.drawable.ic_delete, "PARAR", stopPending)
                .build();
    }

    private void updateNotification(String text) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(FOREGROUND_ID, buildNotification(text));
        }
    }

    private void prepareRecognizer() {
        if (recognizer != null) return;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            publishStatus("blocked", "Reconhecimento de voz não está disponível neste aparelho.");
            return;
        }

        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                if (!systemPaused) {
                    broadcastUiStatus("active", "MICROFONE ATIVO // fale normalmente");
                }
            }

            @Override
            public void onBeginningOfSpeech() {
                if (!systemPaused) {
                    broadcastUiStatus("active", "OUVINDO...");
                }
            }

            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}

            @Override
            public void onEndOfSpeech() {
                if (!systemPaused) {
                    broadcastUiStatus("active", "PROCESSANDO VOZ...");
                }
            }

            @Override
            public void onError(int error) {
                if (!listeningEnabled || systemPaused) return;

                if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                    listeningEnabled = false;
                    SecureStore.setRemoteMicTrusted(RemoteMicService.this, false);
                    publishStatus("blocked", "Permissão de microfone não está disponível no Android.");
                    broadcastUiStatus("blocked", "Permissão de microfone indisponível.");
                    return;
                }

                scheduleRestart(error == SpeechRecognizer.ERROR_NETWORK ? 1200 : 500);
            }

            @Override
            public void onResults(Bundle results) {
                if (!listeningEnabled || systemPaused) return;

                ArrayList<String> matches =
                        results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);

                if (matches != null && !matches.isEmpty()) {
                    String text = matches.get(0) == null ? "" : matches.get(0).trim();
                    if (!text.isEmpty()) {
                        broadcastUiStatus("active", "ENVIANDO AO ULTRON: " + text);
                        publishTranscript(text, confidenceFrom(results));
                    }
                }

                scheduleRestart(350);
            }

            @Override public void onPartialResults(Bundle partialResults) {}
            @Override public void onEvent(int eventType, Bundle params) {}
        });

        recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        recognizerIntent.putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
        );
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR");
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
    }

    private float confidenceFrom(Bundle results) {
        float[] confidence = results.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES);
        if (confidence == null || confidence.length == 0) return -1f;
        return confidence[0];
    }

    private void startListeningNow() {
        if (!listeningEnabled || systemPaused || recognizer == null || recognizerIntent == null) {
            return;
        }

        try {
            recognizer.cancel();
        } catch (Exception ignored) {}

        handler.postDelayed(() -> {
            if (!listeningEnabled || systemPaused || recognizer == null) return;
            try {
                recognizer.startListening(recognizerIntent);
                updateNotification("Microfone remoto ativo");
            } catch (Exception error) {
                broadcastUiStatus("error", "Falha ao iniciar reconhecimento: " + error.getMessage());
                scheduleRestart(1000);
            }
        }, 180);
    }

    private void scheduleRestart(long delayMs) {
        if (!listeningEnabled || systemPaused || restarting) return;
        restarting = true;
        handler.postDelayed(() -> {
            restarting = false;
            if (listeningEnabled && !systemPaused) startListeningNow();
        }, delayMs);
    }

    private void pauseForUltronSpeech() {
        if (!listeningEnabled || systemPaused) return;
        systemPaused = true;
        restarting = false;
        handler.removeCallbacksAndMessages(null);

        if (recognizer != null) {
            try {
                recognizer.cancel();
            } catch (Exception ignored) {}
        }

        updateNotification("Ultron falando // escuta pausada");
        broadcastUiStatus("paused", "ULTRON FALANDO // MICROFONE PAUSADO");
    }

    private void resumeAfterUltronSpeech() {
        if (!listeningEnabled) listeningEnabled = true;
        if (!systemPaused && recognizer != null) {
            startListeningNow();
            return;
        }

        systemPaused = false;
        updateNotification("Microfone remoto ativo");
        broadcastUiStatus("active", "RETOMANDO MICROFONE...");
        startListeningNow();
    }

    private void stopRemoteMicrophone(boolean publish) {
        listeningEnabled = false;
        systemPaused = false;
        restarting = false;
        handler.removeCallbacksAndMessages(null);
        SecureStore.setRemoteMicTrusted(this, false);

        if (recognizer != null) {
            try {
                recognizer.cancel();
            } catch (Exception ignored) {}
        }

        broadcastUiStatus("stopped", "MICROFONE REMOTO PARADO");
        if (publish) {
            publishStatus("stopped", "Microfone remoto interrompido pelo operador no celular.");
        }

        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void publishTranscript(String text, float confidence) {
        new Thread(() -> {
            try {
                String deviceId = SecureStore.getDeviceId(this);
                String secret = SecureStore.getOrCreateDeviceSecret(this);
                if (deviceId == null || deviceId.isEmpty()) return;

                JSONObject payload = new JSONObject();
                payload.put("text", text);
                payload.put("source", "android");
                if (confidence >= 0f) payload.put("confidence", confidence);

                BridgeApi.sendEvent(
                        deviceId,
                        secret,
                        "speech.transcript",
                        payload
                );
            } catch (Exception ignored) {}
        }).start();
    }

    private void publishStatus(String state, String detail) {
        new Thread(() -> {
            try {
                String deviceId = SecureStore.getDeviceId(this);
                if (deviceId == null || deviceId.isEmpty()) return;

                String secret = SecureStore.getOrCreateDeviceSecret(this);
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
        }).start();
    }

    private void broadcastUiStatus(String state, String detail) {
        Intent intent = new Intent(ACTION_STATUS);
        intent.setPackage(getPackageName());
        intent.putExtra(EXTRA_STATUS, state);
        intent.putExtra(EXTRA_DETAIL, detail);
        sendBroadcast(intent);
    }

    @Override
    public void onDestroy() {
        listeningEnabled = false;
        handler.removeCallbacksAndMessages(null);

        if (recognizer != null) {
            try {
                recognizer.destroy();
            } catch (Exception ignored) {}
            recognizer = null;
        }

        super.onDestroy();
    }
}
