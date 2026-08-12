package com.plu.example.activity;

import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.ListView;

import com.plu.example.R;
import com.plu.example.adapter.PluSaleListAdapter;
import com.plu.example.app.BaseActivity;
import com.plu.example.app.BaseApplication;
import com.plu.example.utils.ToastUtil;
import com.rt.plu.CallbackListener;
import com.rt.plu.bean.PluSaleBean;
import com.rt.plu.utils.DateTimeUtils;
import com.rt.plu.utils.PluManage;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

public class SaleDetailsActivity extends BaseActivity implements View.OnClickListener {
    private static final String TAG = SaleDetailsActivity.class.getSimpleName();
    private ListView lv_plu_sales;

    private PluManage pluManage;
    private List<PluSaleBean> list = new ArrayList<>();
    private PluSaleListAdapter adapter;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_sale_details);
        initView();
        addListener();
        init();
    }

    @Override
    public void initView() {
        lv_plu_sales = findViewById(R.id.lv_plu_sales);
    }

    @Override
    public void addListener() {

    }

    @Override
    public void init() {
        pluManage = BaseApplication.getInstance().getPluManage();

        adapter = new PluSaleListAdapter(this, list);
        lv_plu_sales.setAdapter(adapter);
    }

    /**
     * Get the Sold Details
     */
    private void refreshSaleDetails() {
        if (pluManage == null) {
            ToastUtil.show(this, "Pls check the connection is ok?");
            finish();
            return;
        }

        new Thread(new Runnable() {
            @Override
            public void run() {
                List<PluSaleBean> tempList = new ArrayList<PluSaleBean>();

               boolean isok =  pluManage.getPluSales(new CallbackListener() {
                    @Override
                    public void onSaleDataOut(PluSaleBean pluSaleBean) {
                        CallbackListener.super.onSaleDataOut(pluSaleBean);
                        tempList.add(pluSaleBean);

                    }
                });

                list.clear();
                list.addAll(tempList);
                Collections.sort(list, new Comparator<PluSaleBean>() {
                    @Override
                    public int compare(PluSaleBean o1, PluSaleBean o2) {
                        return o2.getSaleDate().compareTo(o1.getSaleDate());
                          // return DateTimeUtils.timeFormatForSort(o2.getSaleDate()).compareTo(DateTimeUtils.timeFormatForSort(o1.getSaleDate()));
                    }
                });

                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        adapter.notifyDataSetChanged();
                    }
                });
            }
        }).start();


    }

    @Override
    public void onClick(View v) {
        switch (v.getId()) {
            case R.id.btn_refresh:
                refreshSaleDetails();
                break;
            default:
                break;
        }
    }

}
