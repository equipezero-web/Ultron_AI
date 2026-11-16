package com.ultron.bridge;

import android.content.Context;
import android.graphics.*;
import android.view.View;

/** Animated native neural visualization, visible only while the app is on screen. */
public final class NeuralRingView extends View {
    private final Paint paint=new Paint(3);
    private long started=android.os.SystemClock.uptimeMillis();
    private boolean active;
    public NeuralRingView(Context context){super(context);}
    public void setActive(boolean value){active=value;invalidate();}
    @Override protected void onDraw(Canvas canvas){
        super.onDraw(canvas);
        float cx=getWidth()/2f,cy=getHeight()/2f;
        float r=Math.min(getWidth(),getHeight())*.34f;
        float time=(android.os.SystemClock.uptimeMillis()-started)/1000f;
        paint.setShader(null);
        paint.setStyle(Paint.Style.STROKE);
        for(int i=0;i<5;i++){
            paint.setStrokeWidth(i==0?5:2);
            paint.setColor(i%2==0?0xff45c4f4:0xffd7b767);
            paint.setAlpha(185-i*22);
            canvas.drawCircle(cx,cy,r-i*19,paint);
        }
        paint.setColor(0xff55d6f8);
        paint.setStrokeWidth(active?7:4);
        paint.setAlpha(active?230:155);
        canvas.drawArc(cx-r,cy-r,cx+r,cy+r,time*38f,active?115:65,false,paint);
        canvas.drawArc(cx-r*.75f,cy-r*.75f,cx+r*.75f,cy+r*.75f,-time*52f,80,false,paint);
        paint.setStyle(Paint.Style.FILL);
        float pulse=1f+.08f*(float)Math.sin(time*(active?5:2));
        paint.setShader(new RadialGradient(cx,cy,r*.55f*pulse,
            new int[]{0xffe6fbff,0xff4fb9e6,0x00246aa0},null,Shader.TileMode.CLAMP));
        canvas.drawCircle(cx,cy,r*.55f*pulse,paint);
        paint.setShader(null);
        if(getWindowVisibility()==VISIBLE && isShown())postInvalidateDelayed(33);
    }
}
