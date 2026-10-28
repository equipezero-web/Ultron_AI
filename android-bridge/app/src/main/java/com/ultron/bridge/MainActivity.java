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

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.Collections;

public class MainActivity extends Activity {
    private static final String DEFAULT_LG_TV_HOST = "10.0.0.109";

    private TextView statusView;
    private EditText pairingCode;
    private EditText lgTvHost;
    private EditText lgTvMac;

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
                "PASSO 1 — No painel web do Ultron, toque em PAREAR CELULAR. O código de 6 dígitos aparece no terminal do Ultron, NÃO na TV. Digite esse código abaixo.\n\nPASSO 2 — Depois de parear o celular, configure sua LG webOS mais abaixo. A TV mostrará apenas uma solicitação de autorização para aceitar com o controle remoto."
        );
        description.setTextSize(16);
        description.setPadding(0, pad / 2, 0, pad);
        root.addView(description, fullWidth());

        pairingCode = new EditText(this);
        pairingCode.setHint("Código de 6 dígitos exibido no PAINEL WEB do Ultron");
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
                "A LG NÃO usa o código de 6 dígitos. Confira o IP atual da TV antes de parear. Celular e TV devem estar na mesma rede Wi-Fi. Use DIAGNOSTICAR REDE LG para verificar IP e portas 3001/3000. Depois toque em PAREAR LG WEBOS e aceite a autorização na tela da TV."
        );
        tvHelp.setPadding(0, pad / 3, 0, pad / 3);
        root.addView(tvHelp, fullWidth());

        lgTvHost = new EditText(this);
        lgTvHost.setHint("IP da LG webOS TV");
        lgTvHost.setInputType(InputType.TYPE_CLASS_TEXT);
        String savedHost = SecureStore.getLgTvHost(this);
        lgTvHost.setText(savedHost == null || savedHost.trim().isEmpty() ? DEFAULT_LG_TV_HOST : savedHost);
        root.addView(lgTvHost, fullWidth());

        lgTvMac = new EditText(this);
        lgTvMac.setHint("MAC da LG (AA:BB:CC:DD:EE:FF)");
        lgTvMac.setInputType(InputType.TYPE_CLASS_TEXT);
        String savedMac = SecureStore.getLgTvMac(this);
        if (savedMac != null && !savedMac.trim().isEmpty()) lgTvMac.setText(savedMac);
        root.addView(lgTvMac, fullWidth());

        Button diagnoseTv = new Button(this);
        diagnoseTv.setText("DIAGNOSTICAR REDE LG");
        diagnoseTv.setOnClickListener(v -> diagnoseLgNetwork());
        root.addView(diagnoseTv, fullWidth());

        Button saveWol = new Button(this);
        saveWol.setText("SALVAR WAKE-ON-LAN");
        saveWol.setOnClickListener(v -> saveWakeOnLan());
        root.addView(saveWol, fullWidth());

        Button pairTv = new Button(this);
        pairTv.setText("PAREAR LG WEBOS");
        pairTv.setOnClickListener(v -> pairLgTv());
        root.addView(pairTv, fullWidth());

        Button testTv = new Button(this);
        testTv.setText("TESTAR CONEXÃO LG");
        testTv.setOnClickListener(v -> testLgTv());
        root.addView(testTv, fullWidth());

        Button wakeTv = new Button(this);
        wakeTv.setText("LIGAR TV // WAKE-ON-LAN");
        wakeTv.setOnClickListener(v -> wakeLgTv());
        root.addView(wakeTv, fullWidth());

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

    private boolean isValidMac(String value) {
        String normalized = value == null ? "" : value.trim();
        return normalized.matches("(?i)^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$");
    }

    private String getLocalIpv4() {
        try {
            for (NetworkInterface networkInterface : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!networkInterface.isUp() || networkInterface.isLoopback()) continue;
                for (InetAddress address : Collections.list(networkInterface.getInetAddresses())) {
                    if (address instanceof Inet4Address && !address.isLoopbackAddress() && address.isSiteLocalAddress()) {
                        return address.getHostAddress();
                    }
                }
            }
        } catch (Exception ignored) {}
        return "indisponível";
    }

    private boolean same24Subnet(String a, String b) {
        if (a == null || b == null) return false;
        String[] aa = a.split("\\.");
        String[] bb = b.split("\\.");
        return aa.length == 4 && bb.length == 4 &&
                aa[0].equals(bb[0]) && aa[1].equals(bb[1]) && aa[2].equals(bb[2]);
    }

    private boolean canOpenTcp(String host, int port, int timeoutMs) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), timeoutMs);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void diagnoseLgNetwork() {
        String host = lgTvHost.getText().toString().trim();
        if (host.isEmpty()) {
            statusView.setText("Informe o IP atual da LG antes do diagnóstico.");
            return;
        }

        statusView.setText("Diagnosticando rede local da LG...");
        new Thread(() -> {
            String phoneIp = getLocalIpv4();
            boolean sameSubnet = same24Subnet(phoneIp, host);
            boolean port3001 = canOpenTcp(host, 3001, 2500);
            boolean port3000 = canOpenTcp(host, 3000, 2500);

            StringBuilder report = new StringBuilder();
            report.append("DIAGNÓSTICO LG\n");
            report.append("Celular: ").append(phoneIp).append("\n");
            report.append("TV informada: ").append(host).append("\n");
            report.append("Mesma sub-rede: ").append(sameSubnet ? "SIM" : "NÃO").append("\n");
            report.append("WSS/3001 (TCP): ").append(port3001 ? "ABERTA" : "SEM RESPOSTA").append("\n");
            report.append("WS/3000 (TCP): ").append(port3000 ? "ABERTA" : "SEM RESPOSTA").append("\n");

            if (!sameSubnet) {
                report.append("\nAÇÃO: celular e TV parecem estar em redes diferentes. Conecte ambos ao mesmo Wi-Fi e confira o IP da TV.");
            } else if (!port3001 && !port3000) {
                report.append("\nAÇÃO: confira o IP atual na TV e ative TV On with Mobile / Ligar via Wi-Fi. Se o IP estiver certo, o roteador pode estar isolando dispositivos Wi-Fi.");
            } else {
                report.append("\nREDE OK: existe uma porta LG acessível. Tente PAREAR LG WEBOS.");
            }

            runOnUiThread(() -> statusView.setText(report.toString()));
        }).start();
    }

    private void saveWakeOnLan() {
        String host = lgTvHost.getText().toString().trim();
        String mac = lgTvMac.getText().toString().trim();
        if (host.isEmpty()) {
            statusView.setText("Informe o IP local da LG.");
            return;
        }
        if (!isValidMac(mac)) {
            statusView.setText("MAC inválido. Use o formato AA:BB:CC:DD:EE:FF.");
            return;
        }

        SecureStore.saveLgTvHost(this, host);
        SecureStore.saveLgTvMac(this, mac);
        statusView.setText("Wake-on-LAN configurado localmente neste celular.");
    }

    private void pairDevice() {
        String code = pairingCode.getText().toString().replaceAll("\\D", "");
        if (code.length() != 6) {
            statusView.setText("Código inválido. Os 6 números aparecem no painel WEB do Ultron após tocar em PAREAR CELULAR; eles não aparecem na TV.");
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
        SecureStore.saveLgTvHost(this, host);

        String mac = lgTvMac.getText().toString().trim();
        if (!mac.isEmpty() && isValidMac(mac)) SecureStore.saveLgTvMac(this, mac);

        statusView.setText("Conectando à LG... não procure código. Aceite a autorização que aparecer na tela da TV.");
        new Thread(() -> {
            TvController.Result result = TvController.pairLg(this, host);
            runOnUiThread(() -> {
                if (result.success) {
                    statusView.setText("LG webOS pareada com sucesso. O Ultron já pode enviar comandos de TV pelo Mobile Bridge.\n" + result.payload.toString());
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

    private void wakeLgTv() {
        saveWakeOnLan();
        if (!isValidMac(lgTvMac.getText().toString())) return;

        statusView.setText("Enviando Wake-on-LAN para a LG...");
        new Thread(() -> {
            TvController.Result result = TvController.execute(this, "tv.power.on", new JSONObject());
            runOnUiThread(() -> statusView.setText(
                    result.success
                            ? "Wake-on-LAN enviado. A LG deve iniciar se a opção de ligar pela rede estiver habilitada."
                            : "Falha no Wake-on-LAN: " + result.payload.toString()
            ));
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
        String tvMac = SecureStore.getLgTvMac(this);
        StringBuilder status = new StringBuilder();
        status.append(deviceId == null ? "Status Cloud: NÃO PAREADO" : "Status Cloud: PAREADO\nDevice ID: " + deviceId);
        status.append("\nLG webOS: ").append(tvHost == null || tvHost.isEmpty() ? DEFAULT_LG_TV_HOST + " (pré-configurado)" : tvHost);
        status.append("\nWake-on-LAN: ").append(tvMac == null || tvMac.isEmpty() ? "MAC NÃO SALVO" : "CONFIGURADO");
        statusView.setText(status.toString());
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
        }
    }
}
