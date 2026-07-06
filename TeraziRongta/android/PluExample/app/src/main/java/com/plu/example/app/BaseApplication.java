package com.plu.example.app;

import android.app.Application;

import com.rt.plu.utils.PluManage;

/**
 * Project: PluExample<br/>
 * Created by Tony on 2018/10/12.<br/>
 * Description:
 */

public class BaseApplication extends Application {

    public static BaseApplication instance = null;
    public PluManage pluManage;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
    }

    public PluManage getPluManage() {
        return pluManage;
    }

    public void setPluManage(PluManage pluManage) {
        this.pluManage = pluManage;
    }

    public static BaseApplication getInstance() {
        return instance;
    }

}













