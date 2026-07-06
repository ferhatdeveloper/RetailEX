package com.plu.example.adapter;

import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.TextView;

import com.plu.example.R;
import com.rt.plu.bean.PluSaleBean;
import com.rt.plu.utils.DateTimeUtils;
import com.rt.plu.utils.FuncUtils;

import java.util.List;


/**
 * Created by Administrator on 2015/6/9.
 */
public class PluSaleListAdapter extends BaseAdapter {

    private Context mContext;
    private List<PluSaleBean> mList;

    public PluSaleListAdapter(Context context, List<PluSaleBean> list) {
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
        TextView sale_name;
        TextView sale_weight;
        TextView sale_sum_price;
        TextView sale_unit_price;
        TextView sale_time;

    }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
        ViewHolder holder = null;
        if (convertView == null) {//TODO 后面有时间请改为 RecycleView 实现
            convertView = LayoutInflater.from(mContext).inflate(R.layout.item_plu_sale, null);
            holder = new ViewHolder();
            holder.sale_name = convertView.findViewById(R.id.sale_name);
            holder.sale_sum_price = convertView.findViewById(R.id.sale_sum_price);
            holder.sale_unit_price = convertView.findViewById(R.id.sale_unit_price);
            holder.sale_weight = convertView.findViewById(R.id.sale_weight);
            holder.sale_time = convertView.findViewById(R.id.sale_time);
            convertView.setTag(holder);
        }else{
            holder = (ViewHolder) convertView.getTag();
        }
        PluSaleBean pluSaleBean = mList.get(position);

        holder.sale_name.setText(pluSaleBean.getPluName());

        double sumPrice = pluSaleBean.getSumPrice();
        holder.sale_sum_price.setText(sumPrice +"");

        holder.sale_unit_price.setText(pluSaleBean.getPluUnitPrice() + "");


        holder.sale_weight.setText(pluSaleBean.getWeight() + "");
       holder.sale_time.setText(DateTimeUtils.dateToString(pluSaleBean.getSaleDate(),"MM-dd-yyyy HH:mm:ss"));

        return convertView;
    }
}
