package com.ultron.bridge;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.*;
import org.json.JSONObject;
import java.util.ArrayList;

/** Voice/text-only mobile home. The existing Bridge stays behind this UI. */
public final class JarvisMobileActivity extends Activity {
    private TextView feedback;
    private EditText input;
    private NeuralRingView neuralRing;
    private final int VOICE_REQUEST = 4102;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff070c15);
        getWindow().setNavigationBarColor(0xff070c15);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(24,36,24,24);
        root.setBackgroundColor(0xff070c15);
        NeuralRingView ring = new NeuralRingView(this);
        neuralRing = ring;
        root.addView(ring,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,0,1));
        feedback = label("Aguardando seu comando.",15,0xffe2ebf4);
        // Status is retained for accessibility and diagnostics, never shown on the main surface.
        feedback.setVisibility(android.view.View.GONE);
        input = new EditText(this);
        input.setHint("Digite seu comando...");
        input.setHintTextColor(0xff8393a8);
        input.setTextColor(0xffffffff);
        input.setSingleLine(false);
        input.setMaxLines(3);
        input.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_SEND);
        input.setOnEditorActionListener((v,action,event)->{
            if(action==android.view.inputmethod.EditorInfo.IME_ACTION_SEND){submitText();return true;}
            return false;
        });
        LinearLayout commandRow = new LinearLayout(this);
        commandRow.setOrientation(LinearLayout.HORIZONTAL);
        commandRow.setGravity(Gravity.CENTER_VERTICAL);
        commandRow.addView(input,new LinearLayout.LayoutParams(0,-2,1));
        Button send = new Button(this);
        send.setText("➤");
        send.setContentDescription("Enviar comando escrito");
        send.setOnClickListener(v -> submitText());
        commandRow.addView(send,new LinearLayout.LayoutParams(-2,-2));
        Button voice = new Button(this);
        voice.setText("🎙");
        voice.setContentDescription("Falar com J.A.R.V.I.S.");
        voice.setOnClickListener(v -> startVoice());
        commandRow.addView(voice,new LinearLayout.LayoutParams(-2,-2));
        root.addView(commandRow,new LinearLayout.LayoutParams(-1,-2));
        setContentView(root);
        if(SecureStore.getDeviceId(this)==null) showPairing();
        else startBridge();
    }
    private void submitText(){
        String message=input.getText().toString().trim();
        if(message.isEmpty())return;
        input.setText("");
        sendCommand(message);
    }
    private void notifyError(String message){
        android.widget.Toast.makeText(this,message,android.widget.Toast.LENGTH_LONG).show();
        feedback.announceForAccessibility(message);
    }
    private TextView label(String value,int size,int color){
        TextView view=new TextView(this);view.setText(value);view.setTextSize(size);
        view.setTextColor(color);view.setGravity(Gravity.CENTER);
        view.setPadding(0,12,0,12);return view;
    }
    private void startBridge(){
        try {startForegroundService(new Intent(this,BridgeService.class));}
        catch(Exception error){notifyError("Conexão não iniciada: "+error.getMessage());}
    }
    private void showPairing(){
        EditText code=new EditText(this);
        code.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        code.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(6)});
        new AlertDialog.Builder(this).setTitle("Conectar J.A.R.V.I.S.")
            .setMessage("Insira o código de seis dígitos gerado no painel web.")
            .setView(code).setNegativeButton("DEPOIS",(d,w)->{})
            .setPositiveButton("CONECTAR",(d,w)->pair(code.getText().toString())).show();
    }
    private void pair(String code){
        if(!code.matches("[0-9]{6}")){notifyError("Código inválido.");return;}
        feedback.setText("Conectando celular...");
        new Thread(()->{
            try{
                String secret=SecureStore.newPairingSecret();
                JSONObject response=BridgeApi.claimPairing(code,secret,
                    Build.MANUFACTURER+" "+Build.MODEL,"Android "+Build.VERSION.RELEASE);
                RemoteFiles.disable(this);TvAuthorization.revoke(this);
                SecureStore.saveNewPairing(this,response.getString("deviceId"),secret);
                runOnUiThread(()->{feedback.setText("Celular conectado.");startBridge();});
            }catch(Exception e){runOnUiThread(()->notifyError("Falha ao conectar: "+e.getMessage()));}
        }).start();
    }
    private void sendCommand(String message){
        String deviceId=SecureStore.getDeviceId(this);
        if(deviceId==null){showPairing();notifyError("Conecte o celular antes de enviar comandos.");return;}
        feedback.setText("Enviando comando...");
        neuralRing.setActive(true);
        new Thread(()->{
            try{
                JSONObject payload=new JSONObject().put("text",message).put("source","jarvis-mobile");
                BridgeApi.sendEvent(deviceId,SecureStore.getOrCreateDeviceSecret(this),"speech.transcript",payload);
                runOnUiThread(()->{neuralRing.setActive(false);feedback.setText("Comando transmitido ao J.A.R.V.I.S.");});
            }catch(Exception e){runOnUiThread(()->{neuralRing.setActive(false);notifyError("Falha de comunicação: "+e.getMessage());});}
        }).start();
    }
    private void startVoice(){
        try{
            Intent intent=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE,"pt-BR");
            startActivityForResult(intent,VOICE_REQUEST);
        }catch(Exception e){notifyError("Reconhecimento de voz indisponível.");}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==VOICE_REQUEST&&result==RESULT_OK&&data!=null){
            ArrayList<String> words=data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if(words!=null&&!words.isEmpty())sendCommand(words.get(0));
        }
    }
}
