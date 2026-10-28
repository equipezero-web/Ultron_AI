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
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class RemoteMicActivity extends Activity {
    private static final int REQUEST_RECORD_AUDIO = 2001;

    private TextView statusView;
    private boolean receiverRegistered = false;

    private final BroadcastReceiver statusReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            String detail = intent.getStringExtra(RemoteMicService.EXTRA_DETAIL);
            if (detail != null && !detail.trim().isEmpty() && statusView != null) {
                statusView.setText(detail);
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildUi());
        registerStatusReceiver();

        if (getIntent().getBooleanExtra("requestMic", false)) {
            beginAuthorization();
        } else {
            refreshStatus();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getBooleanExtra("requestMic", false)) {
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
                "Autorize o microfone uma única vez. Depois disso, o Ultron Bridge mantém um serviço visível " +
                "em primeiro plano para que a escuta remota possa ser pausada e retomada sem novo pedido de permissão. " +
                "O Android continuará mostrando uma notificação enquanto o serviço estiver disponível. " +
                "Somente a transcrição reconhecida no aparelho é enviada ao Ultron Cloud; o áudio bruto não é enviado."
        );
        explanation.setTextSize(16);
        explanation.setPadding(0, pad / 2, 0, pad);
        root.addView(explanation, fullWidth());

        Button start = new Button(this);
        start.setText("AUTORIZAR UMA VEZ E DEIXAR DISPONÍVEL");
        start.setOnClickListener(v -> beginAuthorization());
        root.addView(start, fullWidth());

        Button stop = new Button(this);
        stop.setText("DESATIVAR MICROFONE REMOTO");
        stop.setOnClickListener(v -> stopPersistentRemoteMic());
        root.addView(stop, fullWidth());

        statusView = new TextView(this);
        statusView.setTextSize(16);
        statusView.setPadding(0, pad, 0, 0);
        statusView.setText("Verificando autorização...");
        root.addView(statusView, fullWidth());

        return root;
    }

    private LinearLayout.LayoutParams fullWidth() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
    }

    private void registerStatusReceiver() {
        IntentFilter filter = new IntentFilter(RemoteMicService.ACTION_STATUS);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(statusReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(statusReceiver, filter);
        }
        receiverRegistered = true;
    }

    private boolean hasMicrophonePermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
                checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private void beginAuthorization() {
        if (!hasMicrophonePermission()) {
            statusView.setText("O Android vai solicitar acesso ao microfone uma única vez.");
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_RECORD_AUDIO);
            return;
        }

        startPersistentRemoteMic();
    }

    private void startPersistentRemoteMic() {
        SecureStore.setRemoteMicTrusted(this, true);
        Intent service = new Intent(this, RemoteMicService.class);
        service.setAction(RemoteMicService.ACTION_START);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(service);
            } else {
                startService(service);
            }
            statusView.setText("AUTORIZADO // MICROFONE REMOTO DISPONÍVEL");
        } catch (Exception error) {
            statusView.setText("Não foi possível iniciar o serviço de microfone: " + error.getMessage());
        }
    }

    private void stopPersistentRemoteMic() {
        SecureStore.setRemoteMicTrusted(this, false);
        Intent service = new Intent(this, RemoteMicService.class);
        service.setAction(RemoteMicService.ACTION_STOP);

        try {
            startService(service);
        } catch (Exception ignored) {
            stopService(new Intent(this, RemoteMicService.class));
        }

        statusView.setText("MICROFONE REMOTO DESATIVADO PELO OPERADOR");
    }

    private void refreshStatus() {
        if (!hasMicrophonePermission()) {
            statusView.setText("Aguardando autorização do microfone.");
            return;
        }

        if (SecureStore.isRemoteMicTrusted(this)) {
            statusView.setText("PERMISSÃO SALVA // MICROFONE REMOTO DISPONÍVEL");
        } else {
            statusView.setText("Permissão do Android concedida. Toque para deixar o microfone disponível ao Ultron.");
        }
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
            startPersistentRemoteMic();
        } else {
            SecureStore.setRemoteMicTrusted(this, false);
            statusView.setText("Permissão de microfone não concedida.");
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStatus();
    }

    @Override
    protected void onDestroy() {
        if (receiverRegistered) {
            try {
                unregisterReceiver(statusReceiver);
            } catch (Exception ignored) {}
            receiverRegistered = false;
        }
        super.onDestroy();
    }
}
