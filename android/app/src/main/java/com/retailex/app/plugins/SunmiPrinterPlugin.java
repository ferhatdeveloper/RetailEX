package com.retailex.app.plugins;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.IBinder;
import android.os.RemoteException;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SunmiPrinter")
public class SunmiPrinterPlugin extends Plugin {

    private static final String TAG = "SunmiPrinterPlugin";

    @Override
    public void load() {
        super.load();
        Log.w(TAG, "Sunmi AIDL service is not bundled in this build.");
    }

    @PluginMethod
    public void printerInit(PluginCall call) {
        call.reject("Sunmi printer service is unavailable in this APK.");
    }

    @PluginMethod
    public void printText(PluginCall call) {
        call.reject("Sunmi printer service is unavailable in this APK.");
    }

    @PluginMethod
    public void printTextWithFont(PluginCall call) {
        call.reject("Sunmi printer service is unavailable in this APK.");
    }

    @PluginMethod
    public void printColumnsText(PluginCall call) {
        call.reject("Sunmi printer service is unavailable in this APK.");
    }

    @PluginMethod
    public void lineWrap(PluginCall call) {
        call.reject("Sunmi printer service is unavailable in this APK.");
    }

    @PluginMethod
    public void getPrinterStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("status", -1);
        ret.put("message", "Sunmi printer service is unavailable in this APK.");
        call.resolve(ret);
    }

    @PluginMethod
    public void printQRCode(PluginCall call) {
        call.reject("Sunmi printer service is unavailable in this APK.");
    }
}
