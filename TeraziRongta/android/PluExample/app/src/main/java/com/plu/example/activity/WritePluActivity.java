package com.plu.example.activity;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.os.Bundle;
import android.provider.ContactsContract;
import android.text.InputFilter;
import android.text.TextUtils;
import android.view.View;
import android.widget.EditText;
import android.widget.TextView;

import com.plu.example.R;
import com.plu.example.app.BaseActivity;
import com.plu.example.app.BaseApplication;
import com.plu.example.utils.ToastUtil;
import com.rt.plu.bean.PluInfoBean;
import com.rt.plu.enumrate.LabelIndexEnum;
import com.rt.plu.enumrate.WeightUnitEnum;
import com.rt.plu.utils.PluManage;
import com.rt.plu.utils.SysConfig;

import java.util.ArrayList;

public class WritePluActivity extends BaseActivity implements View.OnClickListener {

    private EditText et_plu_llfcode, et_plu_name, et_plu_itemcode, et_plu_unitprice, et_plu_shelfdays;
    private TextView tv_plu_unitweight;

    private PluManage pluManage;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_write_plu);
        initView();
        addListener();
        init();
    }

    @Override
    public void initView() {
        et_plu_llfcode = findViewById(R.id.et_plu_llfcode);
        et_plu_name = findViewById(R.id.et_plu_name);
        et_plu_itemcode = findViewById(R.id.et_plu_itemcode);
        et_plu_unitprice = findViewById(R.id.et_plu_unitprice);
        et_plu_shelfdays = findViewById(R.id.et_plu_shelfdays);
        tv_plu_unitweight = findViewById(R.id.tv_plu_unitweight);
    }

    @Override
    public void addListener() {
        tv_plu_unitweight.setOnClickListener(this);
    }

    @Override
    public void init() {
        tv_plu_unitweight.setText("kg");
        tv_plu_unitweight.setTag(WeightUnitEnum.UNIT_KG);

        pluManage = BaseApplication.getInstance().getPluManage();
        if (pluManage.getCodeLen()==13){
            et_plu_itemcode.setHint("Up to 13 digits");
            InputFilter[] filters = new InputFilter[1];
            filters[0] = new InputFilter.LengthFilter(13);
            et_plu_itemcode.setFilters(filters);
        }
    }

    /**
     * check Is Empty
     */
    private boolean checkIsEmpty() {
        boolean isEmp = false;
        if (TextUtils.isEmpty(et_plu_itemcode.getText().toString())) {
            isEmp = true;
        }
        if (TextUtils.isEmpty(et_plu_llfcode.getText().toString())) {
            isEmp = true;
        }
        if (TextUtils.isEmpty(et_plu_name.getText().toString())) {
            isEmp = true;
        }
        if (TextUtils.isEmpty(et_plu_shelfdays.getText().toString())) {
            isEmp = true;
        }
        if (TextUtils.isEmpty(et_plu_unitprice.getText().toString())) {
            isEmp = true;
        }
        return isEmp;
    }

    private void savePluToDev() {
        if (checkIsEmpty()) {
            ToastUtil.show(this, "Pls enter correct info");
            return;
        }

        if (pluManage == null) {
            ToastUtil.show(this, "Pls check the connection is ok?");
            finish();
            return;
        }

        String llfcode = et_plu_llfcode.getText().toString();
        String pluName = et_plu_name.getText().toString();
        String itemcode = et_plu_itemcode.getText().toString();
        String unitPrice = et_plu_unitprice.getText().toString();
        WeightUnitEnum weightUnitEnum = (WeightUnitEnum) tv_plu_unitweight.getTag();
        String shelfdays = et_plu_shelfdays.getText().toString();


        final ArrayList<PluInfoBean> pluBeanArrayList = new ArrayList<>();


        final PluInfoBean pluInfoBean = new PluInfoBean();
        pluInfoBean.setpluLfcode(Long.parseLong(llfcode));// if llfcode is exist, it will update it. Otherwise, it will create.
        pluInfoBean.setPluName(pluName);
        pluInfoBean.setPluName2("pluname 2");
        pluInfoBean.setPluItemNum(itemcode);
        pluInfoBean.setPluUnitPrice(Double.parseDouble(unitPrice));
        pluInfoBean.setPluWeightUnit(weightUnitEnum);
        pluInfoBean.setPluShelfDays(Integer.parseInt(shelfdays));
        pluInfoBean.setPluWeightUnit(weightUnitEnum);
        pluInfoBean.setPluBarcodeType(2);
        pluInfoBean.setpluDiscount(0);//折扣
        pluInfoBean.setPluDepartment(3);
        pluInfoBean.setTolerance(0);
        pluInfoBean.setPluLabelIndexEnum(LabelIndexEnum.D0);
        pluInfoBean.setPluMsg1(0);
        pluInfoBean.setPluMsg2(0);
        pluInfoBean.setQtyUnit(0);
        pluInfoBean.setPlupackageWeight(0.0);
        pluInfoBean.setPluTareWeight(0.0);
        pluInfoBean.setSalemode(0);
        pluInfoBean.setPricemode(3);
        pluInfoBean.setManufacturedate("231012");//2023-10-12
        pluBeanArrayList.add(pluInfoBean);

        new Thread(new Runnable() {
            @Override
            public void run() {
                final boolean isok =pluManage.writePluInfo(pluBeanArrayList);//also support list [writePluInfo(ArrayList<PluInfoBean> var1)]

                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if  (isok)
                            ToastUtil.show(WritePluActivity.this, "ok");
                        else
                            ToastUtil.show(WritePluActivity.this, "Fail");

                    }
                });




            }
        }).start();


    }

    /**
     * 选择重量单位
     */
    private void chooseWeightUnit() {
        AlertDialog.Builder dialog = new AlertDialog.Builder(this);
        dialog.setTitle("选择重量单位");
        int len = WeightUnitEnum.values().length;
        final String[] weightUnit = new String[len];
        final byte[] btValues = new byte[len];
        for (int i = 0; i < len; i++) {
            weightUnit[i] = WeightUnitEnum.values()[i].getName();
            btValues[i] = WeightUnitEnum.values()[i].getValue();
        }

        dialog.setItems(weightUnit, new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialogInterface, int pos) {
                tv_plu_unitweight.setText(weightUnit[pos]);
                tv_plu_unitweight.setTag(WeightUnitEnum.getEnumByValue(btValues[pos]));
            }
        });
        dialog.setNegativeButton(R.string.dialog_cancel, null);
        dialog.show();
    }

    @Override
    public void onClick(View v) {
        switch (v.getId()) {
            case R.id.lin_back:
                finish();
                break;
            case R.id.img_add_plu:
                savePluToDev();
                break;
            case R.id.tv_plu_unitweight:
                chooseWeightUnit();
                break;
            default:
                break;
        }
    }

}
