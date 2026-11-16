package com.ultron.bridge;
import android.content.Context;
import android.graphics.*;
import android.view.View;

/** Lightweight native neural visualization; no WebView or external service. */
public final class NeuralRingView extends View {
    private final Paint paint=new Paint(3);
    public NeuralRingView(Context context){super(context);}
    @Override protected void onDraw(Canvas canvas){
        super.onDraw(canvas);
        float cx=getWidth()/2f,cy=getHeight()/2f;
        float r=Math.min(getWidth(),getHeight())*.34f;
        paint.setStyle(Paint.Style.STROKE);
        for(int i=0;i<5;i++){
            paint.setStrokeWidth(i==0?5:2);
            paint.setColor(i%2==0?0xff45c4f4:0xffd7b767);
            paint.setAlpha(185-i*22);
            canvas.drawCircle(cx,cy,r-i*19,paint);
        }
        paint.setStyle(Paint.Style.FILL);
        paint.setShader(new RadialGradient(cx,cy,r*.55f,
            new int[]{0xffe6fbff,0xff4fb9e6,0x00246aa0},null,Shader.TileMode.CLAMP));
        canvas.drawCircle(cx,cy,r*.55f,paint);
        paint.setShader(null);
    }
}
