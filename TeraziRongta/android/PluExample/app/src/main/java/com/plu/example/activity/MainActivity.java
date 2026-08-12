package com.plu.example.activity;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.RadioButton;
import android.widget.Spinner;
import android.widget.TextView;

import com.plu.example.R;
import com.plu.example.app.BaseActivity;
import com.plu.example.app.BaseApplication;
import com.plu.example.utils.AppConfig;
import com.plu.example.utils.ToastUtil;
import com.rt.plu.enumrate.ProtTypeEnum;
import com.rt.plu.utils.PluManage;
import com.rt.plu.utils.TonyUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

public class MainActivity extends BaseActivity implements View.OnClickListener {

    private TextView tv_ver;
    private EditText et_dst_ip, et_dst_port;
    private Button btn_read_pluinfo, btn_read_saledetails, btn_write_plu,btn_get_hotKey,btn_clearplu,
            btn_clearSaleDate;

    private PluManage mPlumanage;
    private RadioButton rtProt1,rtProt2;
    private boolean isConOK = false;
    private Spinner spinner_Charsetlist;
    //权限申请
    private String[] VIDEO_PERMISSION = {
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.WRITE_EXTERNAL_STORAGE
    };
    private List<String> NO_VIDEO_PERMISSION = new ArrayList<String>();
    private static final int REQUEST_CAMERA = 0;

    private void checkAllPermission() {
        NO_VIDEO_PERMISSION.clear();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            for (int i = 0; i < VIDEO_PERMISSION.length; i++) {
                if (checkSelfPermission(VIDEO_PERMISSION[i]) != PackageManager.PERMISSION_GRANTED) {
                    NO_VIDEO_PERMISSION.add(VIDEO_PERMISSION[i]);
                }
            }
            if (NO_VIDEO_PERMISSION.size() == 0) {
                recordVideo();
            } else {
                requestPermissions(NO_VIDEO_PERMISSION.toArray(new String[NO_VIDEO_PERMISSION.size()]), REQUEST_CAMERA);
            }
        } else {
            recordVideo();
        }

    }

    private void recordVideo() {
        Log.d("MainActivity", "granted permission success");
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        checkAllPermission();
        AppConfig.LoadConfig();
        initView();
        addListener();
        init();
    }

    @Override
    public void initView() {
        tv_ver = findViewById(R.id.tv_ver);
        et_dst_ip = findViewById(R.id.et_dst_ip);
        et_dst_port = findViewById(R.id.et_dst_port);
        btn_read_pluinfo = findViewById(R.id.btn_read_pluinfo);
        btn_read_saledetails = findViewById(R.id.btn_read_saledetails);
        btn_write_plu = findViewById(R.id.btn_write_plu);
        btn_get_hotKey = findViewById(R.id.btn_get_hotKey);
        btn_clearplu = findViewById(R.id.btn_clearplu);
        btn_clearSaleDate = findViewById(R.id.btn_clearSaleDate);
        rtProt1 = findViewById(R.id.rtProt1);
        rtProt2 = findViewById(R.id.rtProt2);
        spinner_Charsetlist = findViewById(R.id.spinner_Charsetlist);
        SpinnerCharsetinit();

    }
    private void SpinnerCharsetinit() {
        // 创建下拉列表数据数组
        String[] charsetlist = {"GB2312", "GBK", "UTF-8", "ISO-8859-1", "US-ASCII", "UTF-16", "UTF-32"};
        // 为下拉列表创建适配器
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, charsetlist);
        // 获取 Spinner 控件实例并设置适配器
        spinner_Charsetlist.setAdapter(adapter);
        String charset = AppConfig.getCharset();
        int index=0;
        for (int i=0; i<charsetlist.length; i++) {
            if (charset.equals(charsetlist[i])){
                index = i;
                break;
            }
        }
        spinner_Charsetlist.setSelection(index);

    }
    @Override
    public void addListener() {

    }


    @Override
    public void init() {
        tv_ver.setText("PLU Example Ver: v" + TonyUtils.getVersionName(this));
        et_dst_ip.setText(AppConfig.getHostip());
        if (AppConfig.getProtocol()==1)
          rtProt1.setChecked(true);
        else
          rtProt2.setChecked(true);

        if (mPlumanage == null) {
            mPlumanage = new PluManage();
            initPlumanage();
            BaseApplication.getInstance().setPluManage(mPlumanage);
        }
        isBtnEnable(false);

    }
    private void initPlumanage(){
        mPlumanage.setCodeLen(10);//Set the product code length to 10 digits,   Posiflex：13
        mPlumanage.setLfcodeLen(6);//Set the lfcode length to 6 digits
        mPlumanage.setCharsetName("GB2312");
        mPlumanage.setDecimalDigits(2);//Set the decimal precision
        mPlumanage.setIsShowCmd(true);
    }
    /**
     * Check if the connection is correct
     */
    private void checkConnection() {
        isConOK = false;
        if (mPlumanage == null) {
           mPlumanage = new PluManage();
            initPlumanage();
            BaseApplication.getInstance().setPluManage(mPlumanage);
        }
       ProtTypeEnum prottype=ProtTypeEnum.Prot_Rongta2;
       if (rtProt1.isChecked())
          prottype=ProtTypeEnum.Prot_Rongta1;
        mPlumanage.setRTProtocol(prottype);
        String charset = (String)spinner_Charsetlist.getSelectedItem();
        mPlumanage.setCharsetName(charset);
        final String ip = et_dst_ip.getText().toString();
        final String port = et_dst_port.getText().toString();
        AppConfig.setCharset(charset);
        AppConfig.setHostip(ip);
        AppConfig.setProtocol(prottype.getValue());

        boolean isIPCorrect = checkIpAddress(ip);

        if (isIPCorrect) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    isConOK = mPlumanage.connect(ip, Integer.parseInt(port));//[All PluManage methods must be called on the child thread]
                    if (isConOK) {
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                ToastUtil.show(MainActivity.this, "Connection is OK.");
                                isBtnEnable(true);
                            }
                        });
                    } else {
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                ToastUtil.show(MainActivity.this, "Connect failed.");
                                isBtnEnable(false);
                            }
                        });
                    }
                }
            }).start();


        } else {
            ToastUtil.show(this, "Pls enter a correct ip address.");
        }
    }

    public static boolean checkIpAddress(String ipAddress) {
        String regex1 = "^(1\\d{2}|2[0-4]\\d|25[0-5]|[1-9]\\d|[1-9])\\."
                + "(1\\d{2}|2[0-4]\\d|25[0-5]|[1-9]\\d|\\d)\\."
                + "(1\\d{2}|2[0-4]\\d|25[0-5]|[1-9]\\d|\\d)\\."
                + "(1\\d{2}|2[0-4]\\d|25[0-5]|[1-9]\\d|\\d)$";
        return Pattern.matches(regex1, ipAddress);
    }

    /**
     * The information can only be obtained after checking that the connection is normal.
     *
     * @param isEnable
     */
    private void isBtnEnable(boolean isEnable) {
        btn_read_pluinfo.setEnabled(isEnable);
        btn_read_saledetails.setEnabled(isEnable);
        btn_write_plu.setEnabled(isEnable);
        btn_get_hotKey.setEnabled(isEnable);
        btn_clearplu.setEnabled(isEnable);
        btn_clearSaleDate.setEnabled(isEnable);
    }

    @Override
    public void onClick(View v) {
        switch (v.getId()) {
            case R.id.btn_check_connection:
                checkConnection();
                break;
            case R.id.btn_read_pluinfo:
                BaseApplication.getInstance().setPluManage(mPlumanage);
                turn2Activity(PluInfoActivity.class);
                break;
            case R.id.btn_read_saledetails:
                BaseApplication.getInstance().setPluManage(mPlumanage);
                turn2Activity(SaleDetailsActivity.class);
                break;
            case R.id.btn_write_plu:
                BaseApplication.getInstance().setPluManage(mPlumanage);
                turn2Activity(WritePluActivity.class);
                break;

            case R.id.btn_get_hotKey:
                BaseApplication.getInstance().setPluManage(mPlumanage);
                turn2Activity(PluHotKeyActivity.class);
                break;
            case R.id.btn_clearplu:
               // BaseApplication.getInstance().setPluManage(mPlumanage);
                ClearPluData();
                break;
            case R.id.btn_clearSaleDate:
                // BaseApplication.getInstance().setPluManage(mPlumanage);
                ClearSaleData();
                break;
            default:
                break;
        }
    }

    public void ClearPluData(){
        new Thread(new Runnable() {
            @Override
            public void run() {
                final Boolean isok= mPlumanage.clearPludata();
                   runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                     if (isok)
                        ToastUtil.show(MainActivity.this, "Clear pludata ok");
                     else
                        ToastUtil.show(MainActivity.this, "Clear pludata Fail");

                    }
                });
            }
        }).start();

    }
    public void ClearSaleData(){
        new Thread(new Runnable() {
            @Override
            public void run() {
                final Boolean isok= mPlumanage.clearSaledata();
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (isok)
                            ToastUtil.show(MainActivity.this, "Clear Sale data ok");
                        else
                            ToastUtil.show(MainActivity.this, "Clear Sale data Fail");

                    }
                });
            }
        }).start();

    }


}
