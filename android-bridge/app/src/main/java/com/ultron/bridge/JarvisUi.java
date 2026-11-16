package com.ultron.bridge;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Native J.A.R.V.I.S. visual system. No WebView, remote HTML or permissions.
 * Physical dimensions are density-independent; text uses user font scaling.
 */
public final class JarvisUi {
    public static final int BACKGROUND = Color.rgb(6, 10, 17);
    public static final int CARD = Color.rgb(16, 23, 34);
    public static final int GOLD = Color.rgb(221, 184, 93);
    public static final int TEXT = Color.rgb(245, 244, 236);
    public static final int MUTED = Color.rgb(170, 186, 202);
    public static final int OUTLINE = Color.rgb(60, 70, 82);
    public static final int SUCCESS = Color.rgb(111, 209, 184);

    private JarvisUi() {}

    public static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    public static GradientDrawable panel(Context context, int color, int stroke, int radius) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(dp(context, radius));
        shape.setStroke(dp(context, 1), stroke);
        return shape;
    }

    public static LinearLayout column(Context context) {
        LinearLayout layout = new LinearLayout(context);
        layout.setOrientation(LinearLayout.VERTICAL);
        return layout;
    }

    public static LinearLayout card(Activity activity) {
        LinearLayout card = column(activity);
        int padding = dp(activity, 18);
        card.setPadding(padding, padding, padding, padding);
        card.setBackground(panel(activity, CARD, OUTLINE, 18));
        return card;
    }

    public static LinearLayout.LayoutParams width(Context context, int bottomDp) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(context, bottomDp);
        return params;
    }

    public static TextView text(Context context, String content, float sp, int color, boolean bold) {
        TextView view = new TextView(context);
        view.setText(content);
        view.setTextColor(color);
        view.setTextSize(sp);
        view.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        view.setIncludeFontPadding(true);
        return view;
    }

    public static TextView heading(Context context, String content) {
        return text(context, content, 18, TEXT, true);
    }

    public static TextView caption(Context context, String content) {
        TextView label = text(context, content, 13, MUTED, false);
        label.setLineSpacing(dp(context, 2), 1.0f);
        return label;
    }

    public static Button button(Context context, String label, boolean primary) {
        Button button = new Button(context);
        button.setText(label);
        button.setTextColor(primary ? BACKGROUND : TEXT);
        button.setTextSize(14);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setAllCaps(false);
        button.setMinHeight(dp(context, 52));
        button.setPadding(dp(context, 12), dp(context, 9), dp(context, 12), dp(context, 9));
        button.setBackground(panel(context, primary ? GOLD : Color.rgb(28, 39, 54),
            primary ? GOLD : OUTLINE, 12));
        return button;
    }

    public static void input(Context context, EditText field, String hint) {
        field.setHint(hint);
        field.setTextColor(TEXT);
        field.setHintTextColor(MUTED);
        field.setTextSize(15);
        field.setSingleLine(true);
        field.setSelectAllOnFocus(false);
        field.setPadding(dp(context, 14), dp(context, 12), dp(context, 14), dp(context, 12));
        field.setMinHeight(dp(context, 52));
        field.setBackground(panel(context, Color.rgb(9, 15, 25), OUTLINE, 12));
    }

    public static void space(LinearLayout parent, Context context, int amount) {
        View gap = new View(context);
        parent.addView(gap, new LinearLayout.LayoutParams(1, dp(context, amount)));
    }

    public static void statusBar(Activity activity) {
        activity.getWindow().setStatusBarColor(BACKGROUND);
        activity.getWindow().setNavigationBarColor(BACKGROUND);
        activity.getWindow().getDecorView().setSystemUiVisibility(0);
    }
}
