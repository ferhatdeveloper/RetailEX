package com.plu.example.activity;

import android.os.Bundle;
import android.util.Log;
import android.view.View;

import com.plu.example.R;
import com.plu.example.app.BaseActivity;
import com.rt.plu.CallbackListener;
import com.rt.plu.bean.PluInfoBean;
import com.rt.plu.bean.PluSaleBean;
import com.rt.plu.enumrate.WeightUnitEnum;
import com.rt.plu.utils.PluManage;

import java.util.ArrayList;

public class MainTestActivity extends BaseActivity implements View.OnClickListener {

    private boolean isCon = false;
    private PluManage pluManager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_maintest);
        initView();
        addListener();
        init();
    }

    @Override
    public void initView() {

    }

    @Override
    public void addListener() {

    }

    @Override
    public void init() {

    }


    private void read() {
        if (!isCon) {
            pluManager = new PluManage();
            isCon = pluManager.connect("192.168.2.87", 5001);
        }
        Log.e("rtDebug", "read-Connected " + isCon);
        if (isCon) {
            //Get plu infos.[This method must be called on the sub-thread]
            ArrayList<PluInfoBean> list = pluManager.getPluInfoList();
        }
    }

    private void write() {
        if (!isCon) {
            pluManager = new PluManage();
            isCon = pluManager.connect("192.168.2.87", 5001);
        }
        Log.e("rtDebug", "write-Connected " + isCon);
        if (isCon) {
            PluInfoBean pluInfoBean = new PluInfoBean();
            pluInfoBean.setpluLfcode(2L);

            pluInfoBean.setPluName("coffee beans");
            pluInfoBean.setPluUnitPrice(10.50);
            pluInfoBean.setPluWeightUnit(WeightUnitEnum.UNIT_KG);
            pluManager.writePluInfo(pluInfoBean);
        }
    }

    /**
     * Get sales report
     */
    private void getSalesReport() {
        if (!isCon) {
            pluManager = new PluManage();
            isCon = pluManager.connect("192.168.2.87", 5001);
        }
        Log.e("rtDebug", "getSalesReport-Connected " + isCon);
        if (isCon) {
           pluManager.getPluSales(new CallbackListener() {
               @Override
               public void onSaleDataOut(PluSaleBean pluSaleBean) {
                   Log.e("rtDebug", pluSaleBean.toString());
                   
               }
           });
     
        }
    }

    @Override
    public void onClick(View v) {
        switch (v.getId()) {
            case R.id.btn_read_plu:
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        read();
                    }
                }).start();
                break;
            case R.id.btn_connect:
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        if (!isCon) {
                            pluManager = new PluManage();
                            isCon = pluManager.connect("192.168.2.87", 5001);
                        }
                    }
                }).start();
                break;
            case R.id.btn_write:
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        write();
                    }
                }).start();
                break;
            case R.id.btn_read_sales:
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        getSalesReport();
                    }
                }).start();
                break;
            default:
                break;
        }
    }


}
