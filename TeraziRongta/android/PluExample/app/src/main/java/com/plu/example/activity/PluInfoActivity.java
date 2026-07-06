package com.plu.example.activity;

import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.ListView;
import android.widget.ProgressBar;

import com.plu.example.R;
import com.plu.example.adapter.PluInfoListAdapter;
import com.plu.example.app.BaseActivity;
import com.plu.example.app.BaseApplication;
import com.plu.example.utils.ToastUtil;
import com.rt.plu.bean.PluInfoBean;
import com.rt.plu.utils.PluManage;

import java.util.ArrayList;
import java.util.List;

public class PluInfoActivity extends BaseActivity implements View.OnClickListener {

    private Button btn_refresh;
    private ListView lv_plu;
    private ProgressBar pb_loading;

    private List<PluInfoBean> list = new ArrayList<>();
    private PluInfoListAdapter adapter;
    private PluManage pluManage;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_plu_info);
        initView();
        addListener();
        init();
    }

    @Override
    public void initView() {
        lv_plu = findViewById(R.id.lv_plu);
        btn_refresh = findViewById(R.id.btn_refresh);
        pb_loading = findViewById(R.id.pb_loading);
    }

    @Override
    public void addListener() {

    }

    @Override
    public void init() {
        adapter = new PluInfoListAdapter(this, list);
        lv_plu.setAdapter(adapter);

        pluManage = BaseApplication.getInstance().getPluManage();
    }

    /**
     * Get Plu infos and show
     */
    private void refreshData() {
        if (pluManage == null) {
            ToastUtil.show(this, "Pls check the connection is ok.");
            finish();
            return;
        }

        new Thread(new Runnable() {
            @Override
            public void run() {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        btn_refresh.setEnabled(false);
                        pb_loading.setVisibility(View.VISIBLE);
                    }
                });
                List<PluInfoBean> tempList = pluManage.getPluInfoList();
//                Log.e("rtDebug", "退出getPluInfoList");
                list.clear();
                list.addAll(tempList);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        adapter.notifyDataSetChanged();
                        btn_refresh.setEnabled(true);
                        pb_loading.setVisibility(View.GONE);
                    }
                });
            }
        }).start();

    }

    @Override
    public void onClick(View v) {
        switch (v.getId()) {
            case R.id.btn_refresh:
                refreshData();
                break;
            default:
                break;
        }
    }

}
