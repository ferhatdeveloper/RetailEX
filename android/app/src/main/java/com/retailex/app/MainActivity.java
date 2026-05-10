package com.retailex.app;

import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private void applySystemBarInsetsFit() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        /*
         * Edge-to-edge: WebView ile durum çubuğu çakışmasın. Bridge yüklendikten sonra bir kez daha
         * uygula (bazı cihazlarda ilk çağrı yetersiz kalabiliyor).
         */
        applySystemBarInsetsFit();
        getWindow().getDecorView().post(this::applySystemBarInsetsFit);
    }

    @Override
    public void onResume() {
        super.onResume();
        applySystemBarInsetsFit();
    }
}
