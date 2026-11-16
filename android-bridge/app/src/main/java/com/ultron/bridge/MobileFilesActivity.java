package com.ultron.bridge;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Device-local, user-selected files only. NO remote/cloud file commands.
 * Android ACTION_OPEN_DOCUMENT scopes access to the document the operator
 * actively selects. No all-files permission, no background scanning,
 * no automatic upload and no file deletion.
 */
public final class MobileFilesActivity extends Activity {
    private static final int PICK_DOCUMENT = 492;
    private static final int MAX_BYTES = 512 * 1024;

    private TextView status;
    private EditText editor;
    private Button saveButton;
    private Uri selectedUri;
    private String original = "";
    private String name = "";

    private LinearLayout.LayoutParams fullWidth() {
        return new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (16 * getResources().getDisplayMetrics().density);
        layout.setPadding(pad, pad, pad, pad);
        TextView title = new TextView(this);
        title.setText("J.A.R.V.I.S. // ARQUIVOS AUTORIZADOS");
        title.setTextSize(21);
        layout.addView(title, fullWidth());

        TextView policy = new TextView(this);
        policy.setText(
            "Acesso somente a documentos escolhidos por você. Nunca autoriza o J.A.R.V.I.S. " +
            "a examinar todo o celular. Leitura e edição são LOCAIS neste aparelho; " +
            "o texto não é enviado ao servidor ou à IA. " +
            "Para salvar, confirme cada alteração. Máximo 512 KiB, texto UTF-8."
        );
        layout.addView(policy, fullWidth());

        Button choose = new Button(this);
        choose.setText("ESCOLHER DOCUMENTO DO CELULAR");
        choose.setOnClickListener(view -> openSystemPicker());
        layout.addView(choose, fullWidth());

        editor = new EditText(this);
        editor.setInputType(InputType.TYPE_CLASS_TEXT |
            InputType.TYPE_TEXT_FLAG_MULTI_LINE |
            InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        editor.setMinLines(10);
        editor.setGravity(android.view.Gravity.TOP);
        editor.setSingleLine(false);
        editor.setEnabled(false);
        layout.addView(editor, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        saveButton = new Button(this);
        saveButton.setText("SALVAR ALTERAÇÕES (CONFIRMAR)");
        saveButton.setEnabled(false);
        saveButton.setOnClickListener(view -> askSave());
        layout.addView(saveButton, fullWidth());

        Button disconnect = new Button(this);
        disconnect.setText("FECHAR ARQUIVO AUTORIZADO");
        disconnect.setOnClickListener(view -> reset());
        layout.addView(disconnect, fullWidth());

        status = new TextView(this);
        status.setText("Nenhum documento aberto. O Android solicitará sua escolha.");
        layout.addView(status, fullWidth());

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(layout);
        setContentView(scroll);
    }

    private void openSystemPicker() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION |
                        Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        startActivityForResult(intent, PICK_DOCUMENT);
    }

    private static boolean allowedName(String file) {
        if (file == null || file.isEmpty() || file.length() > 160 ||
                file.startsWith(".") || file.indexOf('/') >= 0 ||
                file.indexOf('\\') >= 0) return false;
        String lower = file.toLowerCase(Locale.ROOT);
        for (String extension : new String[] {
            ".txt", ".md", ".json", ".csv", ".html", ".css",
            ".js", ".mjs", ".xml", ".yaml", ".yml", ".log"
        }) if (lower.endsWith(extension)) return true;
        return false;
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri,
                new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                return cursor.getString(0);
            }
        } catch (Exception ignored) { }
        return null;
    }

    private byte[] readBytes(Uri uri) throws Exception {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("Documento inacessível.");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] block = new byte[8192];
            int count;
            while ((count = in.read(block)) != -1) {
                if (bytes.size() + count > MAX_BYTES) {
                    throw new IllegalArgumentException("Arquivo maior que 512 KiB.");
                }
                bytes.write(block, 0, count);
            }
            return bytes.toByteArray();
        }
    }

    private String readText(Uri uri) throws Exception {
        byte[] bytes = readBytes(uri);
        try {
            String text = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes)).toString();
            if (text.indexOf('\0') >= 0) throw new IllegalArgumentException(
                "O arquivo parece binário.");
            return text;
        } catch (CharacterCodingException error) {
            throw new IllegalArgumentException("O arquivo não é texto UTF-8 válido.");
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != PICK_DOCUMENT || result != RESULT_OK ||
                data == null || data.getData() == null) return;

        reset();
        Uri uri = data.getData();
        String proposedName = displayName(uri);
        if (!allowedName(proposedName)) {
            status.setText("Arquivo não autorizado. Selecione um documento de texto suportado.");
            return;
        }
        try {
            String text = readText(uri);
            selectedUri = uri;
            name = proposedName;
            original = text;
            editor.setText(text);
            editor.setEnabled(true);
            saveButton.setEnabled(true);
            status.setText("Arquivo local: " + name +
                ". Conteúdo não enviado ao J.A.R.V.I.S. Cloud.");
        } catch (Exception error) {
            reset();
            status.setText("Não foi possível abrir: " + error.getMessage());
        }
    }

    private void askSave() {
        if (selectedUri == null) return;
        final Uri target = selectedUri;
        final String proposed = editor.getText().toString();
        if (proposed.equals(original)) {
            status.setText("Não há alterações.");
            return;
        }
        if (proposed.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            status.setText("O texto excede 512 KiB; não foi gravado.");
            return;
        }
        new AlertDialog.Builder(this)
            .setTitle("Confirmar gravação local")
            .setMessage("Substituir " + name + " somente neste celular? " +
                "Faça uma cópia de segurança antes de continuar. " +
                "O arquivo pode não ser recuperável após sobrescrita.")
            .setNegativeButton("CANCELAR", (dialog, which) ->
                status.setText("Gravação cancelada; arquivo original intacto."))
            .setPositiveButton("SALVAR", (dialog, which) ->
                writeConfirmed(target, proposed))
            .show();
    }

    private void writeConfirmed(Uri uri, String proposed) {
        if (selectedUri == null || !selectedUri.equals(uri)) return;
        try {
            // Guard against replacing an external edit done after opening.
            if (!original.equals(readText(uri))) {
                status.setText("Arquivo alterado fora do editor. Reabra antes de salvar.");
                return;
            }
            try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                if (out == null) throw new IllegalStateException("Sem permissão para gravar.");
                out.write(proposed.getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
            original = proposed;
            status.setText("Gravação local concluída: " + name + ". Nada enviado à nuvem.");
        } catch (Exception error) {
            status.setText("Gravação não confirmada: " + error.getMessage() +
                ". Confira o arquivo original antes de tentar novamente.");
        }
    }

    private void reset() {
        selectedUri = null;
        original = "";
        name = "";
        if (editor != null) {
            editor.setText("");
            editor.setEnabled(false);
        }
        if (saveButton != null) saveButton.setEnabled(false);
        if (status != null) status.setText("Nenhum documento selecionado.");
    }

    @Override
    protected void onDestroy() {
        reset();
        super.onDestroy();
    }
}
