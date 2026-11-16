package com.ultron.bridge;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
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
    public static final String ACTION_OPEN_REMOTE_MIC = "com.ultron.bridge.OPEN_REMOTE_MIC";
    public static final String EXTRA_REQUEST_MIC = "requestMic";

    private static final String DEFAULT_LG_TV_HOST = "10.0.0.109";

    private TextView statusView;
    private TextView bridgeBadge;
    private EditText pairingCode;
    private EditText lgTvHost;
    private EditText lgTvMac;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildUi());
        requestNotificationPermission();
        refreshStatus();
        handleLaunchIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleLaunchIntent(intent);
    }

    private void handleLaunchIntent(Intent intent) {
        if (intent == null) return;

        boolean remoteMicRequest =
                ACTION_OPEN_REMOTE_MIC.equals(intent.getAction()) ||
                intent.getBooleanExtra(EXTRA_REQUEST_MIC, false);

        if (!remoteMicRequest) return;

        intent.setAction(null);
        intent.removeExtra(EXTRA_REQUEST_MIC);
        openRemoteMicrophone();
    }

    // A compact J.A.R.V.I.S. command interface. All existing native actions
    // are retained; no browser permissions or third-party UI code are loaded.
    private ScrollView buildUi() {
        JarvisUi.statusBar(this);
        LinearLayout root = JarvisUi.column(this);
        root.setBackgroundColor(JarvisUi.BACKGROUND);
        int side = JarvisUi.dp(this, 18);
        root.setPadding(side, JarvisUi.dp(this, 22), side, JarvisUi.dp(this, 30));

        TextView eyebrow = JarvisUi.text(this,
            "STARK SYSTEMS  /  MOBILE OPERATIONS", 11, JarvisUi.GOLD, true);
        root.addView(eyebrow, JarvisUi.width(this, 8));
        TextView title = JarvisUi.text(this, "J.A.R.V.I.S.", 32, JarvisUi.TEXT, true);
        root.addView(title, JarvisUi.width(this, 2));
        root.addView(JarvisUi.text(this, "BRIDGE  //  CENTRAL DO CELULAR",
            12, JarvisUi.MUTED, true), JarvisUi.width(this, 16));

        LinearLayout hero = JarvisUi.card(this);
        hero.addView(JarvisUi.text(this, "◈  NÚCLEO DE CONEXÃO",
            12, JarvisUi.GOLD, true), JarvisUi.width(this, 8));
        bridgeBadge = JarvisUi.text(this, "○  VERIFICANDO ESTADO LOCAL",
            16, JarvisUi.TEXT, true);
        hero.addView(bridgeBadge, JarvisUi.width(this, 7));
        hero.addView(JarvisUi.caption(this,
            "Ponte entre o Android e o J.A.R.V.I.S. O estado online só é mostrado após comunicação recente confirmada."),
            JarvisUi.width(this, 0));
        root.addView(hero, JarvisUi.width(this, 14));

        LinearLayout pairCard = JarvisUi.card(this);
        pairCard.addView(JarvisUi.heading(this, "01  /  PAREAMENTO"),
            JarvisUi.width(this, 8));
        pairCard.addView(JarvisUi.caption(this,
            "No J.A.R.V.I.S. web, toque em PAREAR CELULAR. Insira aqui o código de 6 números exibido no painel."),
            JarvisUi.width(this, 13));
        pairingCode = new EditText(this);
        pairingCode.setInputType(InputType.TYPE_CLASS_NUMBER);
        pairingCode.setFilters(new android.text.InputFilter[]{
            new android.text.InputFilter.LengthFilter(6)});
        JarvisUi.input(this, pairingCode, "Código de 6 dígitos");
        pairCard.addView(pairingCode, JarvisUi.width(this, 10));
        Button pair = JarvisUi.button(this, "VINCULAR ESTE CELULAR", true);
        pair.setOnClickListener(v -> pairDevice());
        pairCard.addView(pair, JarvisUi.width(this, 0));
        root.addView(pairCard, JarvisUi.width(this, 14));

        LinearLayout linkCard = JarvisUi.card(this);
        linkCard.addView(JarvisUi.heading(this, "02  /  COMUNICAÇÃO CLOUD"),
            JarvisUi.width(this, 8));
        linkCard.addView(JarvisUi.caption(this,
            "Inicie o serviço e confirme a resposta autenticada. A conexão não é presumida apenas porque o serviço iniciou."),
            JarvisUi.width(this, 12));
        Button start = JarvisUi.button(this, "INICIAR J.A.R.V.I.S. BRIDGE", true);
        start.setOnClickListener(v -> startBridge());
        linkCard.addView(start, JarvisUi.width(this, 9));
        Button testBridge = JarvisUi.button(this, "VERIFICAR CONEXÃO CLOUD", false);
        testBridge.setOnClickListener(v -> checkCloudConnection());
        linkCard.addView(testBridge, JarvisUi.width(this, 9));
        Button stop = JarvisUi.button(this, "PARAR CONEXÃO DO BRIDGE", false);
        stop.setOnClickListener(v -> {
            stopService(new Intent(this, BridgeService.class));
            BridgeHealthStore.markStopped(this);
            refreshStatus();
        });
        linkCard.addView(stop, JarvisUi.width(this, 0));
        root.addView(linkCard, JarvisUi.width(this, 14));

        LinearLayout devices = JarvisUi.card(this);
        devices.addView(JarvisUi.heading(this, "03  /  CENTRAL DE DISPOSITIVOS"),
            JarvisUi.width(this, 8));
        devices.addView(JarvisUi.caption(this,
            "Acesso autorizado aos recursos deste aparelho; cada operação segue as permissões do Android."),
            JarvisUi.width(this, 13));
        Button scopedFiles = JarvisUi.button(this, "◈  EDITOR DE ARQUIVOS LOCAIS", false);
        scopedFiles.setOnClickListener(v ->
            startActivity(new Intent(this, MobileFilesActivity.class)));
        devices.addView(scopedFiles, JarvisUi.width(this, 9));
        Button remoteMic = JarvisUi.button(this, "◈  MICROFONE PARA J.A.R.V.I.S.", false);
        remoteMic.setOnClickListener(v -> openRemoteMicrophone());
        devices.addView(remoteMic, JarvisUi.width(this, 9));
        Button notifications = JarvisUi.button(this, "◈  CONFIGURAR NOTIFICAÇÕES", false);
        notifications.setOnClickListener(v -> openNotificationSettings());
        devices.addView(notifications, JarvisUi.width(this, 10));
        devices.addView(JarvisUi.caption(this,
            "ARQUIVOS: seleção individual, somente no celular. Não concede leitura remota de todo o armazenamento."),
            JarvisUi.width(this, 0));
        root.addView(devices, JarvisUi.width(this, 14));

        LinearLayout tvCard = JarvisUi.card(this);
        tvCard.addView(JarvisUi.heading(this, "04  /  LG WEBOS"),
            JarvisUi.width(this, 8));
        tvCard.addView(JarvisUi.caption(this,
            "Controle de TV via rede local; o código de pareamento do celular não é utilizado pela LG."),
            JarvisUi.width(this, 10));
        LinearLayout tvDetails = JarvisUi.column(this);
        tvDetails.setVisibility(android.view.View.GONE);
        Button toggleTv = JarvisUi.button(this, "ABRIR CONTROLES DA TV  +", false);
        toggleTv.setOnClickListener(v -> {
            boolean opening = tvDetails.getVisibility() != android.view.View.VISIBLE;
            tvDetails.setVisibility(opening ? android.view.View.VISIBLE : android.view.View.GONE);
            toggleTv.setText(opening ? "FECHAR CONTROLES DA TV  −" : "ABRIR CONTROLES DA TV  +");
        });
        tvCard.addView(toggleTv, JarvisUi.width(this, 7));
        tvDetails.addView(JarvisUi.caption(this,
            "Conecte celular e TV ao mesmo Wi-Fi. Confira o IP e aceite a solicitação de autorização na TV."),
            JarvisUi.width(this, 10));

        lgTvHost = new EditText(this);
        lgTvHost.setInputType(InputType.TYPE_CLASS_TEXT);
        JarvisUi.input(this, lgTvHost, "IP da LG webOS");
        String savedHost = SecureStore.getLgTvHost(this);
        lgTvHost.setText(savedHost == null || savedHost.trim().isEmpty()
            ? DEFAULT_LG_TV_HOST : savedHost);
        tvDetails.addView(lgTvHost, JarvisUi.width(this, 9));

        lgTvMac = new EditText(this);
        lgTvMac.setInputType(InputType.TYPE_CLASS_TEXT);
        JarvisUi.input(this, lgTvMac, "MAC da TV — AA:BB:CC:DD:EE:FF");
        String savedMac = SecureStore.getLgTvMac(this);
        if (savedMac != null && !savedMac.trim().isEmpty()) lgTvMac.setText(savedMac);
        tvDetails.addView(lgTvMac, JarvisUi.width(this, 12));

        Button diagnoseTv = JarvisUi.button(this, "DIAGNOSTICAR REDE LG", false);
        diagnoseTv.setOnClickListener(v -> diagnoseLgNetwork());
        tvDetails.addView(diagnoseTv, JarvisUi.width(this, 9));
        Button saveWol = JarvisUi.button(this, "SALVAR WAKE-ON-LAN", false);
        saveWol.setOnClickListener(v -> saveWakeOnLan());
        tvDetails.addView(saveWol, JarvisUi.width(this, 9));
        Button pairTv = JarvisUi.button(this, "PAREAR LG WEBOS", true);
        pairTv.setOnClickListener(v -> pairLgTv());
        tvDetails.addView(pairTv, JarvisUi.width(this, 9));
        Button testTv = JarvisUi.button(this, "TESTAR CONEXÃO LG", false);
        testTv.setOnClickListener(v -> testLgTv());
        tvDetails.addView(testTv, JarvisUi.width(this, 9));
        Button wakeTv = JarvisUi.button(this, "LIGAR TV  /  WAKE-ON-LAN", false);
        wakeTv.setOnClickListener(v -> wakeLgTv());
        tvDetails.addView(wakeTv, JarvisUi.width(this, 0));
        tvCard.addView(tvDetails, JarvisUi.width(this, 0));
        root.addView(tvCard, JarvisUi.width(this, 14));

        LinearLayout diagCard = JarvisUi.card(this);
        diagCard.addView(JarvisUi.heading(this, "DIAGNÓSTICO DO SISTEMA"),
            JarvisUi.width(this, 10));
        statusView = JarvisUi.text(this, "Aguardando estado local…", 13,
            JarvisUi.MUTED, false);
        statusView.setTextIsSelectable(true);
        statusView.setLineSpacing(JarvisUi.dp(this, 4), 1.0f);
        diagCard.addView(statusView, JarvisUi.width(this, 0));
        root.addView(diagCard, JarvisUi.width(this, 14));

        root.addView(JarvisUi.caption(this,
            "J.A.R.V.I.S. BRIDGE v0.6.0  •  Android  •  Controle local e autorizado"),
            JarvisUi.width(this, 0));
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setBackgroundColor(JarvisUi.BACKGROUND);
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
            statusView.setText("Código inválido. Os 6 números aparecem no painel WEB do J.A.R.V.I.S após tocar em PAREAR CELULAR; eles não aparecem na TV.");
            return;
        }

        statusView.setText("Pareando celular com o J.A.R.V.I.S...");

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

    private void openRemoteMicrophone() {
        String deviceId = SecureStore.getDeviceId(this);
        if (deviceId == null || deviceId.isEmpty()) {
            statusView.setText("Pareie este celular com o J.A.R.V.I.S antes de usar o microfone remoto.");
            return;
        }

        startBridge();

        Intent intent = new Intent(this, RemoteMicActivity.class);
        intent.putExtra(EXTRA_REQUEST_MIC, true);
        startActivity(intent);
    }

    private void openNotificationSettings() {
        if (Build.VERSION.SDK_INT >= 26) {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            startActivity(intent);
        } else {
            requestNotificationPermission();
        }
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
                    statusView.setText("LG webOS pareada com sucesso. O J.A.R.V.I.S já pode enviar comandos de TV pelo Mobile Bridge.\n" + result.payload.toString());
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
            statusView.setText("Este aparelho ainda não foi pareado com o J.A.R.V.I.S Cloud.");
            return;
        }

        try {
            BridgeHealthStore.markStarting(this);
            Intent intent = new Intent(this, BridgeService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
            statusView.setText("Bridge solicitado. Aguardando a primeira resposta autenticada do Cloud. Toque em VERIFICAR CONEXÃO CLOUD para conferir.");
        } catch (RuntimeException error) {
            BridgeHealthStore.markStopped(this);
            statusView.setText("Não foi possível iniciar o serviço Android: " + error.getMessage());
        }
    }

    private volatile boolean cloudCheckRunning = false;

    private void checkCloudConnection() {
        String deviceId = SecureStore.getDeviceId(this);
        if (deviceId == null || deviceId.isEmpty()) {
            statusView.setText("Este celular ainda não foi pareado. Gere um código no painel J.A.R.V.I.S. e digite-o no aplicativo.");
            return;
        }
        if (cloudCheckRunning) return;
        cloudCheckRunning = true;
        statusView.setText("Verificando a conexão autenticada com o Cloud, sem consumir comandos pendentes...");
        new Thread(() -> {
            String report;
            try {
                String secret = SecureStore.getOrCreateDeviceSecret(this);
                JSONObject response = BridgeApi.heartbeat(deviceId, secret);
                if (!response.optBoolean("connected", false)) {
                    throw new IllegalStateException("Servidor respondeu sem confirmar conexão.");
                }
                boolean serviceOnline = response.optBoolean("serviceOnline", false);
                report = serviceOnline
                        ? "CLOUD AUTENTICADO / BRIDGE ATIVO: o servidor registrou uma comunicação recente do serviço. "
                          + "O teste não executou comandos nem alterou o horário de atividade."
                        : "CLOUD AUTENTICADO / BRIDGE NÃO DETECTADO ATIVO: o servidor respondeu, "
                          + "mas não recebeu atividade recente do serviço em segundo plano. "
                          + "Toque em INICIAR BRIDGE e repita a verificação.";
            } catch (Exception error) {
                report = "FALHA DE CONEXÃO CLOUD: " + String.valueOf(error.getMessage())
                        + ". Confira a internet e as credenciais; se o código foi revogado, refaça o pareamento.";
            }
            final String message = report;
            runOnUiThread(() -> {
                cloudCheckRunning = false;
                refreshStatus();
                statusView.append("\n\n" + message);
            });
        }).start();
    }

    private void refreshStatus() {
        String deviceId = SecureStore.getDeviceId(this);
        String tvHost = SecureStore.getLgTvHost(this);
        String tvMac = SecureStore.getLgTvMac(this);
        StringBuilder status = new StringBuilder();
        status.append(deviceId == null ? "Pareamento: NÃO PAREADO" : "Pareamento: REGISTRADO\nDevice ID: " + deviceId);
        status.append("\nConexão Cloud: ").append(BridgeHealthStore.readableStatus(this));

        if (Build.VERSION.SDK_INT >= 33) {
            status.append("\nNotificações: ")
                    .append(checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
                            ? "AUTORIZADAS"
                            : "BLOQUEADAS/NÃO AUTORIZADAS");
        } else {
            status.append("\nNotificações: gerenciadas pelo Android");
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            status.append("\nMicrofone: ")
                    .append(checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                            ? "AUTORIZADO"
                            : "AGUARDANDO AUTORIZAÇÃO");
        }

        status.append("\nLG webOS: ").append(tvHost == null || tvHost.isEmpty() ? DEFAULT_LG_TV_HOST + " (pré-configurado)" : tvHost);
        status.append("\nWake-on-LAN: ").append(tvMac == null || tvMac.isEmpty() ? "MAC NÃO SALVO" : "CONFIGURADO");
        statusView.setText(status.toString());
        if (bridgeBadge != null) {
            String serviceStatus = BridgeHealthStore.readableStatus(this);
            boolean paired = deviceId != null && !deviceId.isEmpty();
            if (!paired) {
                bridgeBadge.setText("○  CELULAR NÃO PAREADO");
                bridgeBadge.setTextColor(JarvisUi.GOLD);
            } else if (serviceStatus.startsWith("ONLINE")) {
                bridgeBadge.setText("●  CLOUD AUTENTICADO / ONLINE");
                bridgeBadge.setTextColor(JarvisUi.SUCCESS);
            } else {
                bridgeBadge.setText("○  " + (serviceStatus.startsWith("PARADO")
                    ? "BRIDGE PARADO" : "VERIFIQUE A CONEXÃO"));
                bridgeBadge.setTextColor(JarvisUi.GOLD);
            }
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 1001) {
            refreshStatus();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (statusView != null) refreshStatus();
    }
}