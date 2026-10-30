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

import org.json.JSONObject;
import org.webrtc.Camera1Enumerator;
import org.webrtc.Camera2Enumerator;
import org.webrtc.CameraEnumerator;
import org.webrtc.DataChannel;
import org.webrtc.DefaultVideoDecoderFactory;
import org.webrtc.DefaultVideoEncoderFactory;
import org.webrtc.EglBase;
import org.webrtc.IceCandidate;
import org.webrtc.MediaConstraints;
import org.webrtc.MediaStream;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.RtpReceiver;
import org.webrtc.SdpObserver;
import org.webrtc.SessionDescription;
import org.webrtc.SurfaceTextureHelper;
import org.webrtc.VideoCapturer;
import org.webrtc.VideoSource;
import org.webrtc.VideoTrack;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class RemoteCameraService extends Service {
    public static final String ACTION_START = "com.ultron.bridge.camera.START";
    public static final String ACTION_OFFER = "com.ultron.bridge.camera.OFFER";
    public static final String ACTION_ICE = "com.ultron.bridge.camera.ICE";
    public static final String ACTION_CLOSE_SESSION = "com.ultron.bridge.camera.CLOSE_SESSION";
    public static final String ACTION_STOP = "com.ultron.bridge.camera.STOP";

    public static final String EXTRA_SDP = "sdp";
    public static final String EXTRA_SESSION_ID = "sessionId";
    public static final String EXTRA_CANDIDATE = "candidate";
    public static final String EXTRA_SDP_MID = "sdpMid";
    public static final String EXTRA_SDP_MLINE_INDEX = "sdpMLineIndex";

    private static final String CHANNEL_ID = "ultron_remote_camera";
    private static final int FOREGROUND_ID = 4301;
    private static final int WIDTH = 960;
    private static final int HEIGHT = 540;
    private static final int FPS = 24;

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final List<IceCandidate> pendingRemoteIce = new ArrayList<>();

    private EglBase eglBase;
    private PeerConnectionFactory factory;
    private PeerConnection peerConnection;
    private VideoCapturer videoCapturer;
    private SurfaceTextureHelper surfaceTextureHelper;
    private VideoSource videoSource;
    private VideoTrack videoTrack;
    private String sessionId = "";
    private boolean remoteDescriptionSet = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForeground(FOREGROUND_ID, buildNotification("Câmera remota disponível"));
        worker.execute(() -> publishStatus("ready", "Permissão salva. Câmera remota disponível ao Ultron."));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : String.valueOf(intent.getAction());

        if (ACTION_STOP.equals(action)) {
            worker.execute(() -> {
                publishStatus("stopped", "Câmera remota desativada pelo operador.");
                releaseAll();
                stopForeground(STOP_FOREGROUND_REMOVE);
                stopSelf();
            });
            return START_NOT_STICKY;
        }

        if (!hasCameraPermission() || !SecureStore.isRemoteCameraTrusted(this)) {
            worker.execute(() -> {
                publishStatus("blocked", "A câmera precisa ser autorizada no Ultron Bridge.");
                releaseAll();
                stopForeground(STOP_FOREGROUND_REMOVE);
                stopSelf();
            });
            return START_NOT_STICKY;
        }

        if (ACTION_OFFER.equals(action)) {
            final String sdp = intent.getStringExtra(EXTRA_SDP);
            final String nextSessionId = intent.getStringExtra(EXTRA_SESSION_ID);
            worker.execute(() -> handleOffer(sdp, nextSessionId));
            return START_STICKY;
        }

        if (ACTION_ICE.equals(action)) {
            final String candidate = intent.getStringExtra(EXTRA_CANDIDATE);
            final String mid = intent.getStringExtra(EXTRA_SDP_MID);
            final int lineIndex = intent.getIntExtra(EXTRA_SDP_MLINE_INDEX, 0);
            final String incomingSessionId = intent.getStringExtra(EXTRA_SESSION_ID);
            worker.execute(() -> addRemoteIce(candidate, mid, lineIndex, incomingSessionId));
            return START_STICKY;
        }

        if (ACTION_CLOSE_SESSION.equals(action)) {
            worker.execute(() -> {
                closePeerSession();
                publishStatus("ready", "Sessão encerrada. Permissão de câmera continua salva.");
            });
            return START_STICKY;
        }

        worker.execute(() -> publishStatus("ready", "Permissão salva. Câmera remota disponível ao Ultron."));
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private boolean hasCameraPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
                checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    private void ensureWebRtc() throws Exception {
        if (factory != null && videoTrack != null && videoCapturer != null) return;

        PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions.builder(getApplicationContext())
                        .setEnableInternalTracer(false)
                        .createInitializationOptions()
        );

        eglBase = EglBase.create();
        DefaultVideoEncoderFactory encoderFactory = new DefaultVideoEncoderFactory(
                eglBase.getEglBaseContext(),
                true,
                true
        );
        DefaultVideoDecoderFactory decoderFactory = new DefaultVideoDecoderFactory(
                eglBase.getEglBaseContext()
        );

        factory = PeerConnectionFactory.builder()
                .setVideoEncoderFactory(encoderFactory)
                .setVideoDecoderFactory(decoderFactory)
                .createPeerConnectionFactory();

        videoCapturer = createCameraCapturer();
        if (videoCapturer == null) {
            throw new IllegalStateException("Nenhuma câmera Android disponível para WebRTC.");
        }

        surfaceTextureHelper = SurfaceTextureHelper.create(
                "UltronRemoteCamera",
                eglBase.getEglBaseContext()
        );
        videoSource = factory.createVideoSource(false);
        videoCapturer.initialize(
                surfaceTextureHelper,
                getApplicationContext(),
                videoSource.getCapturerObserver()
        );
        videoCapturer.startCapture(WIDTH, HEIGHT, FPS);
        videoTrack = factory.createVideoTrack("ULTRON_REMOTE_CAMERA", videoSource);
        videoTrack.setEnabled(true);
    }

    private VideoCapturer createCameraCapturer() {
        CameraEnumerator enumerator;
        try {
            enumerator = Camera2Enumerator.isSupported(this)
                    ? new Camera2Enumerator(this)
                    : new Camera1Enumerator(false);
        } catch (Exception error) {
            enumerator = new Camera1Enumerator(false);
        }

        String[] names = enumerator.getDeviceNames();
        if (names == null || names.length == 0) return null;

        for (String name : names) {
            if (!enumerator.isFrontFacing(name)) {
                VideoCapturer capturer = enumerator.createCapturer(name, null);
                if (capturer != null) return capturer;
            }
        }

        for (String name : names) {
            VideoCapturer capturer = enumerator.createCapturer(name, null);
            if (capturer != null) return capturer;
        }

        return null;
    }

    private void handleOffer(String sdp, String nextSessionId) {
        if (sdp == null || sdp.trim().isEmpty()) {
            publishStatus("error", "Oferta WebRTC vazia recebida.");
            return;
        }

        try {
            closePeerSession();
            ensureWebRtc();
            sessionId = nextSessionId == null ? "" : nextSessionId.trim();
            remoteDescriptionSet = false;
            pendingRemoteIce.clear();

            List<PeerConnection.IceServer> servers = Collections.singletonList(
                    PeerConnection.IceServer.builder("stun:stun.l.google.com:19302")
                            .createIceServer()
            );

            PeerConnection.RTCConfiguration config = new PeerConnection.RTCConfiguration(servers);
            config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN;
            config.continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY;

            peerConnection = factory.createPeerConnection(config, createPeerObserver());
            if (peerConnection == null) {
                throw new IllegalStateException("Não foi possível criar PeerConnection.");
            }

            peerConnection.addTrack(videoTrack, Collections.singletonList("ultron-camera"));

            SessionDescription offer = new SessionDescription(SessionDescription.Type.OFFER, sdp);
            peerConnection.setRemoteDescription(new SimpleSdpObserver() {
                @Override
                public void onSetSuccess() {
                    worker.execute(() -> {
                        remoteDescriptionSet = true;
                        flushPendingRemoteIce();
                        createAnswer();
                    });
                }

                @Override
                public void onSetFailure(String error) {
                    publishStatus("error", "Falha ao aplicar oferta WebRTC: " + error);
                }
            }, offer);

            publishStatus("negotiating", "Negociando stream WebRTC com o Neural Command.");
        } catch (Exception error) {
            publishStatus("error", "Falha ao iniciar câmera WebRTC: " + error.getMessage());
        }
    }

    private PeerConnection.Observer createPeerObserver() {
        return new PeerConnection.Observer() {
            @Override public void onSignalingChange(PeerConnection.SignalingState newState) {}
            @Override public void onIceConnectionChange(PeerConnection.IceConnectionState newState) {
                String value = newState == null ? "unknown" : newState.name().toLowerCase();
                if (newState == PeerConnection.IceConnectionState.CONNECTED ||
                        newState == PeerConnection.IceConnectionState.COMPLETED) {
                    publishStatus("active", "Câmera do celular conectada ao Ultron por WebRTC.");
                } else if (newState == PeerConnection.IceConnectionState.FAILED) {
                    publishStatus("error", "A conexão WebRTC da câmera falhou.");
                } else if (newState == PeerConnection.IceConnectionState.DISCONNECTED) {
                    publishStatus("disconnected", "A câmera WebRTC foi desconectada temporariamente.");
                } else if (newState == PeerConnection.IceConnectionState.CHECKING) {
                    publishStatus("connecting", "Conectando câmera WebRTC...");
                }
            }
            @Override public void onIceConnectionReceivingChange(boolean receiving) {}
            @Override public void onIceGatheringChange(PeerConnection.IceGatheringState newState) {}
            @Override public void onIceCandidate(IceCandidate candidate) {
                if (candidate == null) return;
                sendIceCandidate(candidate);
            }
            @Override public void onIceCandidatesRemoved(IceCandidate[] candidates) {}
            @Override public void onAddStream(MediaStream stream) {}
            @Override public void onRemoveStream(MediaStream stream) {}
            @Override public void onDataChannel(DataChannel dataChannel) {}
            @Override public void onRenegotiationNeeded() {}
            @Override public void onAddTrack(RtpReceiver receiver, MediaStream[] mediaStreams) {}
        };
    }

    private void createAnswer() {
        PeerConnection peer = peerConnection;
        if (peer == null) return;

        MediaConstraints constraints = new MediaConstraints();
        peer.createAnswer(new SimpleSdpObserver() {
            @Override
            public void onCreateSuccess(SessionDescription description) {
                if (description == null) {
                    publishStatus("error", "Resposta WebRTC vazia.");
                    return;
                }
                peer.setLocalDescription(new SimpleSdpObserver() {
                    @Override
                    public void onSetSuccess() {
                        sendAnswer(description.description);
                    }

                    @Override
                    public void onSetFailure(String error) {
                        publishStatus("error", "Falha ao ativar resposta WebRTC: " + error);
                    }
                }, description);
            }

            @Override
            public void onCreateFailure(String error) {
                publishStatus("error", "Falha ao criar resposta WebRTC: " + error);
            }
        }, constraints);
    }

    private void addRemoteIce(String candidate, String mid, int lineIndex, String incomingSessionId) {
        if (candidate == null || candidate.trim().isEmpty()) return;
        if (incomingSessionId != null && !incomingSessionId.isEmpty() &&
                !sessionId.isEmpty() && !incomingSessionId.equals(sessionId)) {
            return;
        }

        IceCandidate ice = new IceCandidate(mid, lineIndex, candidate);
        if (peerConnection == null || !remoteDescriptionSet) {
            pendingRemoteIce.add(ice);
            return;
        }

        peerConnection.addIceCandidate(ice);
    }

    private void flushPendingRemoteIce() {
        PeerConnection peer = peerConnection;
        if (peer == null || !remoteDescriptionSet || pendingRemoteIce.isEmpty()) return;
        for (IceCandidate candidate : new ArrayList<>(pendingRemoteIce)) {
            peer.addIceCandidate(candidate);
        }
        pendingRemoteIce.clear();
    }

    private void sendAnswer(String sdp) {
        network.execute(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put("type", "answer");
                payload.put("sdp", sdp == null ? "" : sdp);
                payload.put("sessionId", sessionId);
                sendEvent("camera.webrtc.answer", payload);
            } catch (Exception ignored) {}
        });
    }

    private void sendIceCandidate(IceCandidate candidate) {
        network.execute(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put("candidate", candidate.sdp);
                payload.put("sdpMid", candidate.sdpMid);
                payload.put("sdpMLineIndex", candidate.sdpMLineIndex);
                payload.put("sessionId", sessionId);
                sendEvent("camera.webrtc.ice", payload);
            } catch (Exception ignored) {}
        });
    }

    private void publishStatus(String state, String detail) {
        network.execute(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put("state", state);
                payload.put("detail", detail);
                payload.put("sessionId", sessionId);
                sendEvent("camera.status", payload);
            } catch (Exception ignored) {}
        });
    }

    private void sendEvent(String type, JSONObject payload) throws Exception {
        String deviceId = SecureStore.getDeviceId(this);
        if (deviceId == null || deviceId.isEmpty()) return;
        String secret = SecureStore.getOrCreateDeviceSecret(this);
        BridgeApi.sendEvent(deviceId, secret, type, payload);
    }

    private void closePeerSession() {
        remoteDescriptionSet = false;
        pendingRemoteIce.clear();
        sessionId = "";
        if (peerConnection != null) {
            try { peerConnection.close(); } catch (Exception ignored) {}
            try { peerConnection.dispose(); } catch (Exception ignored) {}
            peerConnection = null;
        }
    }

    private void releaseAll() {
        closePeerSession();

        if (videoTrack != null) {
            try { videoTrack.setEnabled(false); } catch (Exception ignored) {}
            try { videoTrack.dispose(); } catch (Exception ignored) {}
            videoTrack = null;
        }

        if (videoCapturer != null) {
            try { videoCapturer.stopCapture(); } catch (Exception ignored) {}
            try { videoCapturer.dispose(); } catch (Exception ignored) {}
            videoCapturer = null;
        }

        if (surfaceTextureHelper != null) {
            try { surfaceTextureHelper.dispose(); } catch (Exception ignored) {}
            surfaceTextureHelper = null;
        }

        if (videoSource != null) {
            try { videoSource.dispose(); } catch (Exception ignored) {}
            videoSource = null;
        }

        if (factory != null) {
            try { factory.dispose(); } catch (Exception ignored) {}
            factory = null;
        }

        if (eglBase != null) {
            try { eglBase.release(); } catch (Exception ignored) {}
            eglBase = null;
        }
    }

    @Override
    public void onDestroy() {
        releaseAll();
        worker.shutdownNow();
        network.shutdownNow();
        super.onDestroy();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Câmera remota do Ultron",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Mantém a autorização única da câmera disponível para sessões WebRTC do Ultron.");
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(String text) {
        Intent openIntent = new Intent(this, RemoteCameraActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                4301,
                openIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        return builder
                .setContentTitle("Ultron // câmera remota")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.presence_video_online)
                .setOngoing(true)
                .setContentIntent(pendingIntent)
                .build();
    }

    private abstract static class SimpleSdpObserver implements SdpObserver {
        @Override public void onCreateSuccess(SessionDescription sessionDescription) {}
        @Override public void onSetSuccess() {}
        @Override public void onCreateFailure(String error) {}
        @Override public void onSetFailure(String error) {}
    }
}
