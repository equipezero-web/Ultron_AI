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
        JarvisUi.statusBar(this);
        LinearLayout root = JarvisUi.column(this);
        root.setBackgroundColor(JarvisUi.BACKGROUND);
        int pad = JarvisUi.dp(this, 18);
        root.setPadding(pad, JarvisUi.dp(this, 24), pad, JarvisUi.dp(this, 26));
        root.addView(JarvisUi.text(this, "◈  J.A.R.V.I.S.  /  FILESPACE",
            12, JarvisUi.GOLD, true), JarvisUi.width(this, 8));
        root.addView(JarvisUi.text(this, "Arquivos autorizados",
            25, JarvisUi.TEXT, true), JarvisUi.width(this, 10));
        root.addView(JarvisUi.caption(this,
            "Editor de texto local. O J.A.R.V.I.S. só pode acessar o documento escolhido neste Android. Nada é enviado à nuvem ou à IA."),
            JarvisUi.width(this, 16));

        LinearLayout pickerCard = JarvisUi.card(this);
        pickerCard.addView(JarvisUi.heading(this, "01  /  SELECIONAR"),
            JarvisUi.width(this, 8));
        pickerCard.addView(JarvisUi.caption(this,
            "Formatos textuais UTF-8 até 512 KiB. O Android solicita a seleção individual; nunca há varredura do armazenamento."),
            JarvisUi.width(this, 12));
        Button choose = JarvisUi.button(this, "ESCOLHER DOCUMENTO", true);
        choose.setOnClickListener(view -> openSystemPicker());
        pickerCard.addView(choose, JarvisUi.width(this, 0));
        root.addView(pickerCard, JarvisUi.width(this, 14));

        LinearLayout editorCard = JarvisUi.card(this);
        editorCard.addView(JarvisUi.heading(this, "02  /  EDIÇÃO LOCAL"),
            JarvisUi.width(this, 10));
        editor = new EditText(this);
        editor.setInputType(InputType.TYPE_CLASS_TEXT |
            InputType.TYPE_TEXT_FLAG_MULTI_LINE |
            InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        editor.setGravity(android.view.Gravity.TOP);
        editor.setSingleLine(false);
        editor.setTextSize(14);
        editor.setTextColor(JarvisUi.TEXT);
        editor.setHintTextColor(JarvisUi.MUTED);
        editor.setHint("Selecione um documento para editar.");
        editor.setPadding(JarvisUi.dp(this, 12), JarvisUi.dp(this, 12),
            JarvisUi.dp(this, 12), JarvisUi.dp(this, 12));
        editor.setBackground(JarvisUi.panel(this, JarvisUi.BACKGROUND,
            JarvisUi.OUTLINE, 12));
        editor.setEnabled(false);
        LinearLayout.LayoutParams editorBox = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, JarvisUi.dp(this, 270));
        editorBox.bottomMargin = JarvisUi.dp(this, 11);
        editorCard.addView(editor, editorBox);

        saveButton = JarvisUi.button(this, "SALVAR COM CONFIRMAÇÃO", true);
        saveButton.setEnabled(false);
        saveButton.setOnClickListener(view -> askSave());
        editorCard.addView(saveButton, JarvisUi.width(this, 9));
        Button disconnect = JarvisUi.button(this, "FECHAR ARQUIVO", false);
        disconnect.setOnClickListener(view -> reset());
        editorCard.addView(disconnect, JarvisUi.width(this, 10));
        editorCard.addView(JarvisUi.caption(this,
            "Cada gravação exige confirmação. Faça uma cópia de segurança antes de substituir o original."),
            JarvisUi.width(this, 0));
        root.addView(editorCard, JarvisUi.width(this, 14));

        LinearLayout diagnostics = JarvisUi.card(this);
        diagnostics.addView(JarvisUi.heading(this, "STATUS DO DOCUMENTO"),
            JarvisUi.width(this, 9));
        status = JarvisUi.caption(this,
            "Nenhum documento aberto. O Android solicitará sua escolha.");
        status.setTextIsSelectable(true);
        diagnostics.addView(status, JarvisUi.width(this, 0));
        root.addView(diagnostics, JarvisUi.width(this, 12));
        root.addView(JarvisUi.caption(this,
            "FILES / ISOLADO POR DOCUMENTO  •  J.A.R.V.I.S. BRIDGE v0.7.0"),
            JarvisUi.width(this, 0));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setBackgroundColor(JarvisUi.BACKGROUND);
        scroll.addView(root);
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
