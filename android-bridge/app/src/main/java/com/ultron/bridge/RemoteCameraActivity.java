package com.ultron.bridge;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class RemoteCameraActivity extends Activity {
    private static final int REQUEST_CAMERA = 3001;

    private TextView statusView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildUi());

        if (getIntent().getBooleanExtra("requestCamera", false)) {
            beginAuthorization();
        } else {
            refreshStatus();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getBooleanExtra("requestCamera", false)) {
            beginAuthorization();
        }
    }

    private LinearLayout buildUi() {
        int pad = (int) (20 * getResources().getDisplayMetrics().density);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("ULTRON // CÂMERA REMOTA");
        title.setTextSize(24);
        root.addView(title, fullWidth());

        TextView explanation = new TextView(this);
        explanation.setText(
                "Autorize a câmera uma única vez neste celular. Depois disso, o Ultron Bridge guarda a autorização localmente e pode disponibilizar a câmera ao Neural Command sem pedir novamente, enquanto a permissão não for revogada nas configurações do Android.\n\n" +
                "O vídeo é transmitido por WebRTC diretamente para a sessão do Ultron. O navegador do computador não precisa de permissão para a webcam local quando este modo estiver ativo."
        );
        explanation.setTextSize(16);
        explanation.setPadding(0, pad / 2, 0, pad);
        root.addView(explanation, fullWidth());

        Button authorize = new Button(this);
        authorize.setText("AUTORIZAR CÂMERA UMA ÚNICA VEZ");
        authorize.setOnClickListener(v -> beginAuthorization());
        root.addView(authorize, fullWidth());

        Button disable = new Button(this);
        disable.setText("DESATIVAR CÂMERA REMOTA");
        disable.setOnClickListener(v -> disableRemoteCamera());
        root.addView(disable, fullWidth());

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

    private boolean hasCameraPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
                checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    private void beginAuthorization() {
        if (!hasCameraPermission()) {
            statusView.setText("O Android solicitará acesso à câmera agora. Esta é a única autorização necessária.");
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQUEST_CAMERA);
            return;
        }

        startPersistentRemoteCamera();
    }

    private void startPersistentRemoteCamera() {
        SecureStore.setRemoteCameraTrusted(this, true);
        Intent service = new Intent(this, RemoteCameraService.class);
        service.setAction(RemoteCameraService.ACTION_START);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(service);
            } else {
                startService(service);
            }
            statusView.setText("AUTORIZADO // CÂMERA REMOTA DISPONÍVEL AO ULTRON");
        } catch (Exception error) {
            statusView.setText("Permissão salva, mas o serviço não iniciou: " + error.getMessage());
        }
    }

    private void disableRemoteCamera() {
        SecureStore.setRemoteCameraTrusted(this, false);
        Intent service = new Intent(this, RemoteCameraService.class);
        service.setAction(RemoteCameraService.ACTION_STOP);

        try {
            startService(service);
        } catch (Exception ignored) {
            stopService(new Intent(this, RemoteCameraService.class));
        }

        statusView.setText("CÂMERA REMOTA DESATIVADA PELO OPERADOR");
    }

    private void refreshStatus() {
        if (!hasCameraPermission()) {
            statusView.setText("Aguardando autorização única da câmera.");
            return;
        }

        if (SecureStore.isRemoteCameraTrusted(this)) {
            statusView.setText("PERMISSÃO SALVA // CÂMERA REMOTA DISPONÍVEL");
        } else {
            statusView.setText("Permissão do Android concedida. Toque para deixar a câmera disponível ao Ultron.");
        }
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQUEST_CAMERA) return;

        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startPersistentRemoteCamera();
        } else {
            SecureStore.setRemoteCameraTrusted(this, false);
            statusView.setText("Permissão de câmera não concedida.");
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStatus();
    }
}
