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

import woyou.aidl.ITaskCallback;
import woyou.aidl.IWoyouService;

@CapacitorPlugin(name = "SunmiPrinter")
public class SunmiPrinterPlugin extends Plugin {

    private static final String TAG = "SunmiPrinterPlugin";
    private IWoyouService woyouService;

    private ServiceConnection connService = new ServiceConnection() {
        @Override
        public void onServiceDisconnected(ComponentName name) {
            woyouService = null;
            Log.d(TAG, "Service disconnected");
        }

        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            woyouService = IWoyouService.Stub.asInterface(service);
            Log.d(TAG, "Service connected");
        }
    };

    @Override
    public void load() {
        super.load();
        bindService();
    }

    private void bindService() {
        Intent intent = new Intent();
        intent.setPackage("woyou.aidl.printer1");
        intent.setAction("woyou.aidl.printer1.PrinterService");
        getContext().bindService(intent, connService, Context.BIND_AUTO_CREATE);
    }

    @PluginMethod
    public void printerInit(PluginCall call) {
        if (woyouService == null) {
            call.reject("Service not connected");
            return;
        }
        try {
            woyouService.printerInit(new ITaskCallback.Stub() {
                @Override
                public void onRunResult(boolean isSuccess, int code, String msg) throws RemoteException {
                    if (isSuccess) {
                        call.resolve();
                    } else {
                        call.reject(msg, String.valueOf(code));
                    }
                }
            });
        } catch (RemoteException e) {
            call.reject(e.getLocalizedMessage());
        }
    }

    @PluginMethod
    public void printText(PluginCall call) {
        String text = call.getString("text");
        if (woyouService == null) {
            call.reject("Service not connected");
            return;
        }
        try {
            woyouService.printText(text, new ITaskCallback.Stub() {
                @Override
                public void onRunResult(boolean isSuccess, int code, String msg) throws RemoteException {
                    if (isSuccess) {
                        call.resolve();
                    } else {
                        call.reject(msg, String.valueOf(code));
                    }
                }
            });
        } catch (RemoteException e) {
            call.reject(e.getLocalizedMessage());
        }
    }

    @PluginMethod
    public void printTextWithFont(PluginCall call) {
        String text = call.getString("text");
        float fontSize = call.getFloat("fontSize", 24f);
        if (woyouService == null) {
            call.reject("Service not connected");
            return;
        }
        try {
            woyouService.printTextWithFont(text, null, fontSize, new ITaskCallback.Stub() {
                @Override
                public void onRunResult(boolean isSuccess, int code, String msg) throws RemoteException {
                    if (isSuccess) {
                        call.resolve();
                    } else {
                        call.reject(msg, String.valueOf(code));
                    }
                }
            });
        } catch (RemoteException e) {
            call.reject(e.getLocalizedMessage());
        }
    }

    @PluginMethod
    public void printColumnsText(PluginCall call) {
        String[] texts = call.getArray("texts").toArray(new String[0]);
        int[] widths = call.getIntArray("widths");
        int[] aligns = call.getIntArray("aligns");
        
        if (woyouService == null) {
            call.reject("Service not connected");
            return;
        }
        try {
            woyouService.printColumnsText(texts, widths, aligns, new ITaskCallback.Stub() {
                @Override
                public void onRunResult(boolean isSuccess, int code, String msg) throws RemoteException {
                    if (isSuccess) {
                        call.resolve();
                    } else {
                        call.reject(msg, String.valueOf(code));
                    }
                }
            });
        } catch (RemoteException e) {
            call.reject(e.getLocalizedMessage());
        }
    }

    @PluginMethod
    public void lineWrap(PluginCall call) {
        int lines = call.getInt("lines", 1);
        if (woyouService == null) {
            call.reject("Service not connected");
            return;
        }
        try {
            woyouService.lineWrap(lines, new ITaskCallback.Stub() {
                @Override
                public void onRunResult(boolean isSuccess, int code, String msg) throws RemoteException {
                    if (isSuccess) {
                        call.resolve();
                    } else {
                        call.reject(msg, String.valueOf(code));
                    }
                }
            });
        } catch (RemoteException e) {
            call.reject(e.getLocalizedMessage());
        }
    }

    @PluginMethod
    public void getPrinterStatus(PluginCall call) {
        if (woyouService == null) {
            call.reject("Service not connected");
            return;
        }
        try {
            int status = woyouService.getPrinterStatus();
            JSObject ret = new JSObject();
            ret.put("status", status);
            call.resolve(ret);
        } catch (RemoteException e) {
            call.reject(e.getLocalizedMessage());
        }
    }

    @PluginMethod
    public void printQRCode(PluginCall call) {
        String data = call.getString("data");
        int moduleSize = call.getInt("moduleSize", 6);
        int errorLevel = call.getInt("errorLevel", 0);
        
        if (woyouService == null) {
            call.reject("Service not connected");
            return;
        }
        try {
            woyouService.printQRCode(data, moduleSize, errorLevel, new ITaskCallback.Stub() {
                @Override
                public void onRunResult(boolean isSuccess, int code, String msg) throws RemoteException {
                    if (isSuccess) {
                        call.resolve();
                    } else {
                        call.reject(msg, String.valueOf(code));
                    }
                }
            });
        } catch (RemoteException e) {
            call.reject(e.getLocalizedMessage());
        }
    }
}
