package com.ultron.bridge;
import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.view.accessibility.AccessibilityEvent;
public final class JarvisAssistantService extends AccessibilityService {
    private static volatile JarvisAssistantService active;
    @Override public void onServiceConnected() { super.onServiceConnected(); active=this; }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) { /* No screen inspection. */ }
    @Override public void onInterrupt() {}
    @Override public void onDestroy() { if(active==this) active=null; super.onDestroy(); }
    public static boolean launch(Intent intent) {
        JarvisAssistantService service=active;
        if(service==null||intent==null)return false;
        try { intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); service.startActivity(intent); return true; }
        catch(RuntimeException blocked) { return false; }
    }
}
