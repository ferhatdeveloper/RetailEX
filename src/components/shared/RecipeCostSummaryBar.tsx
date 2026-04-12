import React from 'react';
import { Card, Col, InputNumber, Row, Space, Statistic, Typography } from 'antd';
import {
    RETAILEX_BORDER_SUBTLE,
    RETAILEX_PAGE_BG,
    RETAILEX_RADIUS,
} from '../../theme/retailexAntdTheme';

export type RecipeCostSummaryBarProps = {
    totalCost: number;
    realCost: number;
    wastagePercent: number;
    onWastageChange: (value: number) => void;
    profitMargin: number;
    /** Seçili hizmet / menü kalemi adı */
    entityName: string;
};

const cardFlat = {
    className: '!shadow-none',
    styles: {
        body: { padding: '12px 14px' as const },
    },
    style: {
        borderColor: RETAILEX_BORDER_SUBTLE,
        background: '#fff',
        borderRadius: RETAILEX_RADIUS,
    },
} as const;

function fmtTr(n: number) {
    return n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

/**
 * Reçete ekranı alt özet şeridi — Ant Design + flat UI (gölgesiz kartlar).
 */
export function RecipeCostSummaryBar({
    totalCost,
    realCost,
    wastagePercent,
    onWastageChange,
    profitMargin,
    entityName,
}: RecipeCostSummaryBarProps) {
    const fireExtra = Math.max(0, realCost - totalCost);
    const marginColor =
        profitMargin > 20 ? '#52c41a' : profitMargin > 0 ? '#fa8c16' : '#ff4d4f';

    return (
        <div
            className="shrink-0 border-t px-3 py-3"
            style={{ borderColor: RETAILEX_BORDER_SUBTLE, background: RETAILEX_PAGE_BG }}
        >
            <Row gutter={[12, 12]}>
                <Col xs={24} sm={12} xl={6}>
                    <Card {...cardFlat} bordered size="small">
                        <Statistic
                            title={
                                <span className="text-[11px] font-medium uppercase tracking-wide text-[#8c8c8c]">
                                    Temel Maliyet
                                </span>
                            }
                            value={totalCost}
                            formatter={val => fmtTr(Number(val))}
                            valueStyle={{ color: '#1677ff', fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}
                        />
                        <Typography.Text type="secondary" className="!mt-1 !block !text-[11px]" ellipsis={{ tooltip: entityName }}>
                            {entityName}
                        </Typography.Text>
                    </Card>
                </Col>
                <Col xs={24} sm={12} xl={6}>
                    <Card {...cardFlat} bordered size="small">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-[#8c8c8c]">Fire Oranı</div>
                        <Space align="center" className="mt-1" size={6} wrap>
                            <InputNumber
                                size="small"
                                min={0}
                                max={999}
                                step={0.1}
                                value={wastagePercent}
                                onChange={v => onWastageChange(typeof v === 'number' ? v : 0)}
                                className="!w-[72px]"
                            />
                            <span className="text-xs text-[#595959]">%</span>
                        </Space>
                        <div className="mt-1.5 text-xs font-medium text-[#ff7875]">+ {fmtTr(fireExtra)}</div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} xl={6}>
                    <Card {...cardFlat} bordered size="small">
                        <Statistic
                            title={
                                <span className="text-[11px] font-medium uppercase tracking-wide text-[#8c8c8c]">
                                    Net Maliyet
                                </span>
                            }
                            value={realCost}
                            formatter={val => fmtTr(Number(val))}
                            valueStyle={{ color: '#389e0d', fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} xl={6}>
                    <Card {...cardFlat} bordered size="small">
                        <Statistic
                            title={
                                <span className="text-[11px] font-medium uppercase tracking-wide text-[#8c8c8c]">
                                    Brüt Kar Marjı
                                </span>
                            }
                            value={profitMargin}
                            precision={1}
                            suffix="%"
                            valueStyle={{
                                color: marginColor,
                                fontSize: 22,
                                fontWeight: 600,
                                lineHeight: 1.2,
                            }}
                        />
                    </Card>
                </Col>
            </Row>
        </div>
    );
}
