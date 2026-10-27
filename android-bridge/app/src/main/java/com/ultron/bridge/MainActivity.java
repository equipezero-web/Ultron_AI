package com.ultron.bridge;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private TextView statusView;
    private EditText pairingCode;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestNotificationPermission();
        setContentView(buildUi());
        refreshStatus();
    }

    private ScrollView buildUi() {
        int pad = (int) (20 * getResources().getDisplayMetrics().density);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("ULTRON // MOBILE BRIDGE");
        title.setTextSize(24);
        root.addView(title, fullWidth());

        TextView description = new TextView(this);
        description.setText(
                "Pareie este celular com o Ultron Cloud. Depois o Bridge poderá executar apenas ações autorizadas e atuar como ponte local para a TV."
        );
        description.setTextSize(16);
        description.setPadding(0, pad / 2, 0, pad);
        root.addView(description, fullWidth());

        pairingCode = new EditText(this);
        pairingCode.setHint("Código de 6 dígitos");
        pairingCode.setInputType(InputType.TYPE_CLASS_NUMBER);
        root.addView(pairingCode, fullWidth());

        Button pair = new Button(this);
        pair.setText("PAREAR COM ULTRON");
        pair.setOnClickListener(v -> pairDevice());
        root.addView(pair, fullWidth());

        Button start = new Button(this);
        start.setText("INICIAR BRIDGE");
        start.setOnClickListener(v -> startBridge());
        root.addView(start, fullWidth());

        Button stop = new Button(this);
        stop.setText("PARAR BRIDGE");
        stop.setOnClickListener(v -> stopService(new Intent(this, BridgeService.class)));
        root.addView(stop, fullWidth());

        statusView = new TextView(this);
        statusView.setTextSize(15);
        statusView.setPadding(0, pad, 0, 0);
        root.addView(statusView, fullWidth());

        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);
        return scroll;
    }

    private LinearLayout.LayoutParams fullWidth() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
    }

    private void pairDevice() {
        String code = pairingCode.getText().toString().replaceAll("\\D", "");
        if (code.length() != 6) {
            statusView.setText("Código inválido. Digite os 6 números exibidos no painel do Ultron.");
            return;
        }

        statusView.setText("Pareando...");

        new Thread(() -> {
            try {
                String secret = SecureStore.getOrCreateDeviceSecret(this);
                String name = Build.MANUFACTURER + " " + Build.MODEL;
                String platform = "Android " + Build.VERSION.RELEASE + " / SDK " + Build.VERSION.SDK_INT;

                JSONObject response = BridgeApi.claimPairing(
                        code,
                        secret,
                        name,
                        platform
                );

                String deviceId = response.getString("deviceId");
                SecureStore.saveDeviceId(this, deviceId);

                runOnUiThread(() -> {
                    statusView.setText("Pareado com sucesso. Device ID: " + deviceId);
                    startBridge();
                });
            } catch (Exception error) {
                runOnUiThread(() ->
                        statusView.setText("Falha no pareamento: " + error.getMessage())
                );
            }
        }).start();
    }

    private void startBridge() {
        String deviceId = SecureStore.getDeviceId(this);
        if (deviceId == null || deviceId.isEmpty()) {
            statusView.setText("Este aparelho ainda não foi pareado.");
            return;
        }

        Intent intent = new Intent(this, BridgeService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
        statusView.setText("Bridge iniciado. O Android exibirá uma notificação enquanto estiver ativo.");
    }

    private void refreshStatus() {
        String deviceId = SecureStore.getDeviceId(this);
        statusView.setText(
                deviceId == null
                        ? "Status: NÃO PAREADO"
                        : "Status: PAREADO\nDevice ID: " + deviceId
        );
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
        }
    }
}
