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
    private EditText lgTvHost;

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
                "Pareie este celular com o Ultron Cloud. Depois o Bridge poderá executar apenas ações autorizadas e atuar como ponte local para sua LG webOS TV."
        );
        description.setTextSize(16);
        description.setPadding(0, pad / 2, 0, pad);
        root.addView(description, fullWidth());

        pairingCode = new EditText(this);
        pairingCode.setHint("Código de 6 dígitos do Ultron");
        pairingCode.setInputType(InputType.TYPE_CLASS_NUMBER);
        root.addView(pairingCode, fullWidth());

        Button pair = new Button(this);
        pair.setText("PAREAR CELULAR COM ULTRON");
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

        TextView tvTitle = new TextView(this);
        tvTitle.setText("\nLG webOS TV // UR8750PSA");
        tvTitle.setTextSize(20);
        root.addView(tvTitle, fullWidth());

        TextView tvHelp = new TextView(this);
        tvHelp.setText(
                "Digite o IP local da TV (ex.: 192.168.0.120). Celular e TV devem estar na mesma rede Wi-Fi. Na primeira conexão, aceite a autorização exibida na TV."
        );
        tvHelp.setPadding(0, pad / 3, 0, pad / 3);
        root.addView(tvHelp, fullWidth());

        lgTvHost = new EditText(this);
        lgTvHost.setHint("IP da LG webOS TV");
        lgTvHost.setInputType(InputType.TYPE_CLASS_TEXT);
        String savedHost = SecureStore.getLgTvHost(this);
        if (savedHost != null) lgTvHost.setText(savedHost);
        root.addView(lgTvHost, fullWidth());

        Button pairTv = new Button(this);
        pairTv.setText("PAREAR LG WEBOS");
        pairTv.setOnClickListener(v -> pairLgTv());
        root.addView(pairTv, fullWidth());

        Button testTv = new Button(this);
        testTv.setText("TESTAR CONEXÃO LG");
        testTv.setOnClickListener(v -> testLgTv());
        root.addView(testTv, fullWidth());

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

        statusView.setText("Pareando celular com o Ultron...");

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
                    statusView.setText("Celular pareado com sucesso. Device ID: " + deviceId);
                    startBridge();
                });
            } catch (Exception error) {
                runOnUiThread(() ->
                        statusView.setText("Falha no pareamento do celular: " + error.getMessage())
                );
            }
        }).start();
    }

    private void pairLgTv() {
        String host = lgTvHost.getText().toString().trim();
        if (host.isEmpty()) {
            statusView.setText("Informe o IP local da sua LG UR8750PSA.");
            return;
        }

        statusView.setText("Conectando à LG... aceite a autorização que aparecer na tela da TV.");
        new Thread(() -> {
            TvController.Result result = TvController.pairLg(this, host);
            runOnUiThread(() -> {
                if (result.success) {
                    statusView.setText("LG webOS pareada com sucesso. O Ultron já pode enviar comandos de TV pelo Mobile Bridge.");
                } else {
                    statusView.setText("Falha ao parear LG: " + result.payload.optString("error", "erro desconhecido"));
                }
            });
        }).start();
    }

    private void testLgTv() {
        statusView.setText("Testando LG webOS...");
        new Thread(() -> {
            TvController.Result result = TvController.execute(this, "tv.status", new JSONObject());
            runOnUiThread(() -> {
                if (result.success) {
                    statusView.setText("LG ONLINE // " + result.payload.toString());
                } else {
                    statusView.setText("LG OFFLINE/ERRO // " + result.payload.toString());
                }
            });
        }).start();
    }

    private void startBridge() {
        String deviceId = SecureStore.getDeviceId(this);
        if (deviceId == null || deviceId.isEmpty()) {
            statusView.setText("Este aparelho ainda não foi pareado com o Ultron Cloud.");
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
        String tvHost = SecureStore.getLgTvHost(this);
        StringBuilder status = new StringBuilder();
        status.append(deviceId == null ? "Status Cloud: NÃO PAREADO" : "Status Cloud: PAREADO\nDevice ID: " + deviceId);
        status.append("\nLG webOS: ").append(tvHost == null || tvHost.isEmpty() ? "NÃO CONFIGURADA" : tvHost);
        statusView.setText(status.toString());
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
        }
    }
}
