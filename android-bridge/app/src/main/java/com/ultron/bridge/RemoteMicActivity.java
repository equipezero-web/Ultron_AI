package com.ultron.bridge;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.ArrayList;

public class RemoteMicActivity extends Activity {
    public static final String ACTION_CONTROL = "com.ultron.bridge.REMOTE_MIC_CONTROL";
    public static final String EXTRA_STATE = "state";

    private static final int REQUEST_RECORD_AUDIO = 2001;

    private final Handler handler = new Handler(Looper.getMainLooper());

    private TextView statusView;
    private SpeechRecognizer recognizer;
    private Intent recognizerIntent;
    private boolean micActive = false;
    private boolean restarting = false;
    private boolean systemPaused = false;
    private boolean receiverRegistered = false;

    private final BroadcastReceiver controlReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            String state = intent.getStringExtra(EXTRA_STATE);

            if ("pause".equals(state)) {
                pauseForUltronSpeech();
            } else if ("resume".equals(state)) {
                resumeAfterUltronSpeech();
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildUi());
        registerControlReceiver();

        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            statusView.setText("Reconhecimento de voz não está disponível neste aparelho.");
            return;
        }

        prepareRecognizer();

        if (getIntent().getBooleanExtra("requestMic", false)) {
            beginAuthorization();
        }
    }

    private LinearLayout buildUi() {
        int pad = (int) (20 * getResources().getDisplayMetrics().density);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("ULTRON // MICROFONE REMOTO");
        title.setTextSize(24);
        root.addView(title, fullWidth());

        TextView explanation = new TextView(this);
        explanation.setText(
                "Este celular pode funcionar como o microfone do Ultron no notebook. " +
                "O áudio é reconhecido no Android e somente a transcrição de voz é enviada ao Ultron Cloud. " +
                "A escuta só começa depois da sua autorização e pode ser interrompida a qualquer momento. " +
                "Quando o Ultron fala, a escuta do celular é pausada automaticamente para evitar eco."
        );
        explanation.setTextSize(16);
        explanation.setPadding(0, pad / 2, 0, pad);
        root.addView(explanation, fullWidth());

        Button start = new Button(this);
        start.setText("AUTORIZAR E USAR MICROFONE");
        start.setOnClickListener(v -> beginAuthorization());
        root.addView(start, fullWidth());

        Button stop = new Button(this);
        stop.setText("PARAR MICROFONE REMOTO");
        stop.setOnClickListener(v -> stopRemoteMicrophone(true));
        root.addView(stop, fullWidth());

        statusView = new TextView(this);
        statusView.setTextSize(16);
        statusView.setPadding(0, pad, 0, 0);
        statusView.setText("Aguardando autorização do operador.");
        root.addView(statusView, fullWidth());

        return root;
    }

    private LinearLayout.LayoutParams fullWidth() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
    }

    private void registerControlReceiver() {
        IntentFilter filter = new IntentFilter(ACTION_CONTROL);

        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(controlReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(controlReceiver, filter);
        }

        receiverRegistered = true;
    }

    private void beginAuthorization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            statusView.setText("O Android vai solicitar acesso ao microfone.");
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_RECORD_AUDIO);
            return;
        }

        startRemoteMicrophone();
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode != REQUEST_RECORD_AUDIO) return;

        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startRemoteMicrophone();
        } else {
            statusView.setText("Permissão de microfone não concedida.");
            publishStatus("blocked", "Permissão de microfone negada no Android.");
        }
    }

    private void prepareRecognizer() {
        if (recognizer != null) return;

        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                if (!systemPaused) {
                    statusView.setText("MICROFONE ATIVO // fale normalmente");
                }
            }

            @Override
            public void onBeginningOfSpeech() {
                if (!systemPaused) {
                    statusView.setText("OUVINDO...");
                }
            }

            @Override
            public void onRmsChanged(float rmsdB) {}

            @Override
            public void onBufferReceived(byte[] buffer) {}

            @Override
            public void onEndOfSpeech() {
                if (!systemPaused) {
                    statusView.setText("PROCESSANDO VOZ...");
                }
            }

            @Override
            public void onError(int error) {
                if (!micActive || systemPaused) return;

                if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                    micActive = false;
                    statusView.setText("O Android retirou a permissão do microfone.");
                    publishStatus("blocked", "Permissão insuficiente para reconhecimento de voz.");
                    return;
                }

                scheduleRestart(error == SpeechRecognizer.ERROR_NETWORK ? 1200 : 500);
            }

            @Override
            public void onResults(Bundle results) {
                if (!micActive || systemPaused) return;

                ArrayList<String> matches =
                        results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);

                if (matches != null && !matches.isEmpty()) {
                    String text = matches.get(0) == null ? "" : matches.get(0).trim();
                    if (!text.isEmpty()) {
                        statusView.setText("ENVIANDO AO ULTRON: " + text);
                        publishTranscript(text, confidenceFrom(results));
                    }
                }

                scheduleRestart(350);
            }

            @Override
            public void onPartialResults(Bundle partialResults) {}

            @Override
            public void onEvent(int eventType, Bundle params) {}
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

    private void startRemoteMicrophone() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            statusView.setText("Reconhecimento de voz indisponível.");
            return;
        }

        prepareRecognizer();
        micActive = true;
        systemPaused = false;
        publishStatus("active", "Microfone do celular autorizado e pronto.");
        startListeningNow();
    }

    private void startListeningNow() {
        if (
                !micActive ||
                systemPaused ||
                recognizer == null ||
                recognizerIntent == null
        ) return;

        try {
            recognizer.cancel();
        } catch (Exception ignored) {}

        handler.postDelayed(() -> {
            if (!micActive || systemPaused) return;
            try {
                recognizer.startListening(recognizerIntent);
            } catch (Exception error) {
                statusView.setText("Falha ao iniciar reconhecimento: " + error.getMessage());
                scheduleRestart(1000);
            }
        }, 180);
    }

    private void scheduleRestart(long delayMs) {
        if (!micActive || systemPaused || restarting) return;
        restarting = true;

        handler.postDelayed(() -> {
            restarting = false;
            if (micActive && !systemPaused) startListeningNow();
        }, delayMs);
    }

    private void pauseForUltronSpeech() {
        if (!micActive) return;

        systemPaused = true;
        restarting = false;
        handler.removeCallbacksAndMessages(null);

        if (recognizer != null) {
            try {
                recognizer.cancel();
            } catch (Exception ignored) {}
        }

        statusView.setText("ULTRON FALANDO // MICROFONE PAUSADO");
    }

    private void resumeAfterUltronSpeech() {
        if (!micActive) return;

        systemPaused = false;
        statusView.setText("RETOMANDO MICROFONE...");
        startListeningNow();
    }

    private void stopRemoteMicrophone(boolean publish) {
        micActive = false;
        systemPaused = false;
        restarting = false;
        handler.removeCallbacksAndMessages(null);

        if (recognizer != null) {
            try {
                recognizer.cancel();
            } catch (Exception ignored) {}
        }

        statusView.setText("MICROFONE REMOTO PARADO");

        if (publish) {
            publishStatus("stopped", "Microfone remoto interrompido pelo operador no celular.");
        }
    }

    private void publishTranscript(String text, float confidence) {
        new Thread(() -> {
            try {
                String deviceId = SecureStore.getDeviceId(this);
                String secret = SecureStore.getOrCreateDeviceSecret(this);

                if (deviceId == null || deviceId.isEmpty()) {
                    runOnUiThread(() -> statusView.setText(
                            "Este celular ainda não está pareado com o Ultron."
                    ));
                    return;
                }

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
            } catch (Exception error) {
                runOnUiThread(() -> statusView.setText(
                        "Falha ao enviar voz ao Ultron: " + error.getMessage()
                ));
            }
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

    @Override
    protected void onStop() {
        super.onStop();
        if (micActive) {
            stopRemoteMicrophone(true);
        }
    }

    @Override
    protected void onDestroy() {
        micActive = false;
        handler.removeCallbacksAndMessages(null);

        if (receiverRegistered) {
            try {
                unregisterReceiver(controlReceiver);
            } catch (Exception ignored) {}
            receiverRegistered = false;
        }

        if (recognizer != null) {
            try {
                recognizer.destroy();
            } catch (Exception ignored) {}
            recognizer = null;
        }

        super.onDestroy();
    }
}
