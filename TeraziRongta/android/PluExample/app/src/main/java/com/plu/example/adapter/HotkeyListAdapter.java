package com.plu.example.adapter;


import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.TextView;

import com.plu.example.R;
import com.rt.plu.bean.HotKeybean;

import java.util.List;

public class HotkeyListAdapter extends BaseAdapter {
    private Context mContext;
    private List<HotKeybean> mList;

    public HotkeyListAdapter(Context context, List<HotKeybean> list) {
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
        TextView plu_llfcode;
        TextView HotKeyid;

    }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
        HotkeyListAdapter.ViewHolder holder = null;
        if (convertView == null) {//TODO 后面有时间请改为 RecycleView 实现
            convertView = LayoutInflater.from(mContext).inflate(R.layout.item_plu_hotkey, null);
            holder = new HotkeyListAdapter.ViewHolder();
            holder.HotKeyid = convertView.findViewById(R.id.plu_hotKey);
            holder.plu_llfcode = convertView.findViewById(R.id.plu_llfcode);
            convertView.setTag(holder);
        } else {
            holder = (HotkeyListAdapter.ViewHolder) convertView.getTag();
        }
        HotKeybean infoBean = mList.get(position);
        String hotkeyid = String.valueOf(infoBean.getHotkeyid());
        holder.HotKeyid.setText(hotkeyid);
        Long llfcode = infoBean.getLfcode();
        holder.plu_llfcode.setText(String.valueOf(llfcode));

        return convertView;
    }
}
