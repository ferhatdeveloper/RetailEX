package com.plu.example.utils;


import com.blankj.utilcode.util.SPUtils;

public class AppConfig {
    private static String hostip; //秤的连接类型 Scale connection type
    private static String charset;
    private static int protocol=2;



    public static void LoadConfig(){
        hostip =  SPUtils.getInstance().getString("hostip","192.168.2.87");
        charset = SPUtils.getInstance().getString("charset","GB2312");
        protocol = SPUtils.getInstance().getInt("protocol",2);
    }



    public static String getCharset() {
        return charset;
    }

    public static void setCharset(String charset) {
        AppConfig.charset = charset;
        SPUtils.getInstance().put("charset",charset);
    }




    public static String getHostip() {
        return hostip;
    }

    public static void setHostip(String hostip) {
        AppConfig.hostip = hostip;
        SPUtils.getInstance().put("hostip",hostip);
    }

    public static int getProtocol() {
        return protocol;
    }

    public static void setProtocol(int protocol) {
        AppConfig.protocol = protocol;
        SPUtils.getInstance().put("protocol",protocol);
    }


}
