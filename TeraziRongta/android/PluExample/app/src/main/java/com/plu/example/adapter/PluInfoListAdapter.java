package com.plu.example.adapter;

import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.TextView;

import com.plu.example.R;
import com.rt.plu.bean.PluInfoBean;
import com.rt.plu.utils.DateTimeUtils;

import java.util.List;


/**
 * Created by Administrator on 2015/6/9.
 */
public class PluInfoListAdapter extends BaseAdapter {

    private Context mContext;
    private List<PluInfoBean> mList;

    public PluInfoListAdapter(Context context, List<PluInfoBean> list) {
        this.mContext = context;
        this.mList = list;
    }

    @Override
    public int getCount() {
        return mList.size();
    }

    @Override
    public Object getItem(int position) {
        return mList.get(position);
    }

    @Override
    public long getItemId(int position) {
        return position;
    }

    private class ViewHolder {
        TextView plu_name;
        TextView plu_llfcode;
        TextView plu_hotkey;
        TextView plu_unit_price;
        TextView plu_WeightUnit;
        TextView plu_ShelfDays;


    }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
        ViewHolder holder = null;
        if (convertView == null) {//TODO 后面有时间请改为 RecycleView 实现
            convertView = LayoutInflater.from(mContext).inflate(R.layout.item_plu_info, null);
            holder = new ViewHolder();
            holder.plu_name = convertView.findViewById(R.id.plu_name);
            holder.plu_unit_price = convertView.findViewById(R.id.plu_unit_price);
            holder.plu_llfcode = convertView.findViewById(R.id.plu_llfcode);
            holder.plu_hotkey =  convertView.findViewById(R.id.plu_hotkey);
            holder.plu_ShelfDays =  convertView.findViewById(R.id.plu_ShelfDays);
            holder.plu_WeightUnit =  convertView.findViewById(R.id.plu_WeightUnit);
            convertView.setTag(holder);
        } else {
            holder = (ViewHolder) convertView.getTag();
        }
        PluInfoBean infoBean = mList.get(position);
        if (infoBean.isError){
            return  convertView;
        }

        holder.plu_name.setText(infoBean.getPluName());

        double unitPrice = infoBean.getPluUnitPrice();
        holder.plu_unit_price.setText(unitPrice + "");

        long llfcode = infoBean.getpluLfcode();
        holder.plu_llfcode.setText(String.valueOf(llfcode));

        int hotkey = infoBean.getHotKey();
        holder.plu_hotkey.setText(String.valueOf(hotkey));

        holder.plu_WeightUnit.setText(infoBean.getPluWeightUnit().getName());

        holder.plu_ShelfDays.setText(String.valueOf(infoBean.getPluShelfDays()));


        return convertView;
    }
}
