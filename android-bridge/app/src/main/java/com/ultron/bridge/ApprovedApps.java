package com.ultron.bridge;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.content.pm.PackageManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

/** Only launcher apps explicitly approved on the phone may be opened remotely. */
public final class ApprovedApps {
    private static final String PREFS="jarvis_approved_apps";
    private ApprovedApps() {}
    private static List<ResolveInfo> launcherApps(Context context) {
        Intent query=new Intent(Intent.ACTION_MAIN);
        query.addCategory(Intent.CATEGORY_LAUNCHER);
        return context.getPackageManager().queryIntentActivities(query,0);
    }
    public static boolean allowed(Context context,String packageName) {
        if(packageName==null||!packageName.matches("[a-zA-Z0-9_]+(\\.[a-zA-Z0-9_]+)+"))return false;
        if(!context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getBoolean(packageName,false))return false;
        for(ResolveInfo info:launcherApps(context))
            if(info.activityInfo!=null&&packageName.equals(info.activityInfo.packageName))return true;
        return false;
    }
    public static JSONObject catalog(Context context) throws Exception {
        JSONArray array=new JSONArray();
        PackageManager pm=context.getPackageManager();
        Set<String> seen=new java.util.HashSet<>();
        for(ResolveInfo info:launcherApps(context)){
            if(info.activityInfo==null)continue;
            String pkg=info.activityInfo.packageName;
            if(!seen.add(pkg))continue;
            JSONObject item=new JSONObject();
            item.put("packageName",pkg);
            item.put("label",String.valueOf(info.loadLabel(pm)));
            item.put("approved",allowed(context,pkg));
            if (allowed(context,pkg)) array.put(item);
        }
        return new JSONObject().put("ok",true).put("apps",array).put("scope","approved-launcher-apps-only");
    }
    public static void showPicker(Activity activity){
        PackageManager pm=activity.getPackageManager();
        List<ResolveInfo> all=launcherApps(activity);
        java.util.Map<String,String> map=new java.util.TreeMap<>();
        for(ResolveInfo info:all)if(info.activityInfo!=null)
            map.put(info.activityInfo.packageName,String.valueOf(info.loadLabel(pm)));
        List<String> packages=new ArrayList<>(map.keySet());
        Collections.sort(packages,(a,b)->map.get(a).compareToIgnoreCase(map.get(b)));
        String[] labels=new String[packages.size()];
        boolean[] checked=new boolean[packages.size()];
        for(int i=0;i<packages.size();i++){
            labels[i]=map.get(packages.get(i))+" ("+packages.get(i)+")";
            checked[i]=activity.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getBoolean(packages.get(i),false);
        }
        new AlertDialog.Builder(activity).setTitle("Autorizar abertura remota de aplicativos")
            .setMultiChoiceItems(labels,checked,(dialog,which,isChecked)->checked[which]=isChecked)
            .setPositiveButton("SALVAR",(dialog,which)->{
                android.content.SharedPreferences.Editor edit=activity.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit();
                edit.clear();
                for(int i=0;i<packages.size();i++)if(checked[i])edit.putBoolean(packages.get(i),true);
                edit.apply();
            }).setNegativeButton("CANCELAR",null).show();
    }
}
