package com.ultron.bridge;

import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Environment;
import android.os.StatFs;
import android.provider.CalendarContract;
import android.net.Uri;

import org.json.JSONObject;

import java.time.Instant;
import java.util.List;

/**
 * Built-in J.A.R.V.I.S. plugins. Only dispatches a small, reviewed command set.
 * No app cookies/accounts can be read. Calendar saves always require the
 * Android calendar app and an explicit user Save action.
 */
public final class AccountPluginActions {
    private static final String CHANNEL = "ultron_bridge";
    private AccountPluginActions() {}

    public static JSONObject execute(Context context, String command, JSONObject payload) throws Exception {
        final JSONObject reply = new JSONObject();
        if ("storage.diagnostics".equals(command)) {
            final StatFs stats = new StatFs(Environment.getDataDirectory().getAbsolutePath());
            final long total = Math.max(0L,stats.getTotalBytes());
            final long free = Math.max(0L,stats.getAvailableBytes());
            return reply.put("ok",true)
                .put("scope","device-local-storage")
                .put("totalBytes",total).put("freeBytes",free)
                .put("usedBytes",Math.max(0L,total-free))
                .put("readPersonalFiles",false).put("readCloudAccountStorage",false);
        }
        final Intent intent;
        if ("youtube.open".equals(command)) {
            intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/"));
            intent.setPackage("com.google.android.youtube");
            if (intent.resolveActivity(context.getPackageManager()) == null) {
                intent.setPackage(null);
            }
        } else if ("calendar.open".equals(command)) {
            intent = new Intent(Intent.ACTION_MAIN);
            intent.addCategory(Intent.CATEGORY_APP_CALENDAR);
        } else if ("calendar.create".equals(command)) {
            if (!payload.optBoolean("confirm",false))
                return reply.put("ok",false).put("error","É necessária confirmação para criar um evento.");
            final String title=payload.optString("title","").trim();
            final long start=Instant.parse(payload.optString("startsAt","")).toEpochMilli();
            final long end=Instant.parse(payload.optString("endsAt","")).toEpochMilli();
            if (title.isEmpty()||title.length()>100||end<=start||end-start>86400000L)
                return reply.put("ok",false).put("error","Evento ou intervalo inválido.");
            intent=new Intent(Intent.ACTION_INSERT);
            intent.setData(CalendarContract.Events.CONTENT_URI);
            intent.putExtra(CalendarContract.Events.TITLE,title);
            intent.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME,start);
            intent.putExtra(CalendarContract.EXTRA_EVENT_END_TIME,end);
        } else {
            return reply.put("ok",false).put("error","Plugin não reconhecido.");
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        final boolean creating="calendar.create".equals(command);
        if (isForeground(context)) {
            try {
                context.startActivity(intent);
                return reply.put("ok",true).put("launchRequested",true)
                    .put("eventSaved",false).put("requiresCalendarSave",creating)
                    .put("message",creating?"Revise e salve o evento na agenda do Android.":"Abertura do aplicativo solicitada.");
            } catch (Exception error) {
                return reply.put("ok",false).put("error","Nenhum aplicativo compatível disponível.");
            }
        }
        // Never use Accessibility to bypass Android background launch protections.
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if(manager==null)return reply.put("ok",false).put("error","Notificações indisponíveis.");
        if(android.os.Build.VERSION.SDK_INT>=33 &&
            context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=
               android.content.pm.PackageManager.PERMISSION_GRANTED)
            return reply.put("ok",false).put("error","Ative notificações para abrir agenda pelo Bridge.");
        PendingIntent pending=PendingIntent.getActivity(context,
            creating?4501:("youtube.open".equals(command)?4502:4503),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification note=new Notification.Builder(context,CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_my_calendar)
            .setContentTitle(creating?"J.A.R.V.I.S. • Confirmar compromisso":("youtube.open".equals(command)?"J.A.R.V.I.S. • Abrir YouTube":"J.A.R.V.I.S. • Abrir agenda"))
            .setContentText(creating?"Toque para revisar o evento e salvar na sua agenda.":"Toque para abrir o aplicativo neste Android.")
            .setContentIntent(pending).setAutoCancel(true).build();
        manager.notify(creating?4501:("youtube.open".equals(command)?4502:4503),note);
        return reply.put("ok",true).put("delivery","notification").put("requiresUserTap",true)
            .put("eventSaved",false).put("requiresCalendarSave",creating)
            .put("message","O Android exige um toque na notificação.");
    }
    private static boolean isForeground(Context context) {
        ActivityManager am=(ActivityManager)context.getSystemService(Context.ACTIVITY_SERVICE);
        if(am==null)return false;
        List<ActivityManager.RunningAppProcessInfo> list=am.getRunningAppProcesses();
        if(list==null)return false;
        for(ActivityManager.RunningAppProcessInfo p:list)
            if(p.pid==android.os.Process.myPid() &&
               p.importance==ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND)
                return true;
        return false;
    }
}
