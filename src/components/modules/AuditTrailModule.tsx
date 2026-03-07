import React, { useState, useEffect } from 'react';
import { Table, Card, Badge, Tag, Space, Typography, DatePicker, Select, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    HistoryOutlined,
    UserOutlined,
    DatabaseOutlined,
    ThunderboltOutlined,
    EyeOutlined,
    ArrowsAltOutlined
} from '@ant-design/icons';
import { auditService, AuditLog } from '../../services/AuditService';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const AuditTrailModule: React.FC = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const [tables, setTables] = useState<string[]>([]);
    const [filters, setFilters] = useState({
        limit: 50,
        offset: 0,
        table_name: undefined as string | undefined,
        action: undefined as string | undefined,
    });

    useEffect(() => {
        loadData();
        loadTables();
    }, [filters]);

    const loadData = async () => {
        setLoading(true);
        const { logs, total } = await auditService.getLogs(filters);
        setLogs(logs);
        setTotalCount(total);
        setLoading(false);
    };

    const loadTables = async () => {
        const tableList = await auditService.getAuditedTables();
        setTables(tableList);
    };

    const getActionColor = (action: string) => {
        switch (action) {
            case 'INSERT': return 'green';
            case 'UPDATE': return 'blue';
            case 'DELETE': return 'red';
            default: return 'default';
        }
    };

    const columns: ColumnsType<AuditLog> = [
        {
            title: 'Tarih',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 180,
            render: (value: string) => (
                <Text type="secondary">{format(new Date(value), 'dd MMM yyyy HH:mm:ss', { locale: tr })}</Text>
            ),
            sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            defaultSortOrder: 'descend',
        },
        {
            title: 'Kullanıcı',
            dataIndex: 'user_name',
            key: 'user_name',
            width: 150,
            render: (value: string) => (
                <Space>
                    <UserOutlined style={{ fontSize: '12px' }} />
                    <Text strong>{value || 'Sistem'}</Text>
                </Space>
            ),
        },
        {
            title: 'Tablo / Modül',
            dataIndex: 'table_name',
            key: 'table_name',
            width: 200,
            render: (value: string) => (
                <Badge status="processing" text={value} />
            ),
        },
        {
            title: 'İşlem',
            dataIndex: 'action',
            key: 'action',
            width: 120,
            render: (value: string) => (
                <Tag color={getActionColor(value)}>{value}</Tag>
            ),
        },
        {
            title: 'Kayıt ID',
            dataIndex: 'record_id',
            key: 'record_id',
            width: 280,
            render: (value: string) => <Text code style={{ fontSize: '10px' }}>{value}</Text>,
        },
    ];

    const expandableProps = {
        expandedRowRender: (record: AuditLog) => (
            <div className="p-4 bg-gray-50 rounded-lg">
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <div className="flex gap-8">
                        <div className="flex-1">
                            <Title level={5}><Text type="secondary">Eski Veri</Text></Title>
                            <pre className="text-xs bg-white p-3 border rounded h-64 overflow-auto">
                                {JSON.stringify(record.old_data, null, 2)}
                            </pre>
                        </div>
                        <div className="flex-1">
                            <Title level={5}><Text type="success">Yeni Veri</Text></Title>
                            <pre className="text-xs bg-white p-3 border rounded h-64 overflow-auto">
                                {JSON.stringify(record.new_data, null, 2)}
                            </pre>
                        </div>
                    </div>
                    <div className="mt-2">
                        <Text strong>İstemci Bilgisi:</Text>
                        <pre className="text-xs mt-1">
                            {JSON.stringify(record.client_info, null, 2)}
                        </pre>
                    </div>
                </Space>
            </div>
        ),
    };

    return (
        <div className="audit-trail-container p-6">
            <Card
                title={
                    <Space>
                        <HistoryOutlined style={{ color: '#1890ff' }} />
                        <span>Güvenlik ve İşlem Günlüğü (Audit Trail)</span>
                    </Space>
                }
                extra={
                    <Space>
                        <Select
                            placeholder="Tablo Filtrele"
                            style={{ width: 200 }}
                            allowClear
                            onChange={(v: string | undefined) => setFilters((f) => ({ ...f, table_name: v, offset: 0 }))}
                        >
                            {tables.map((t: string) => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                        </Select>
                        <Select
                            placeholder="İşlem Tipi"
                            style={{ width: 120 }}
                            allowClear
                            onChange={(v: string | undefined) => setFilters((f) => ({ ...f, action: v, offset: 0 }))}
                        >
                            <Select.Option value="INSERT">EKLEME</Select.Option>
                            <Select.Option value="UPDATE">GÜNCELLEME</Select.Option>
                            <Select.Option value="DELETE">SİLME</Select.Option>
                        </Select>
                        <Button icon={<ArrowsAltOutlined />} onClick={loadData}>Yenile</Button>
                    </Space>
                }
            >
                <Table
                    columns={columns}
                    dataSource={logs}
                    loading={loading}
                    rowKey="id"
                    pagination={{
                        pageSize: filters.limit,
                        total: totalCount,
                        showSizeChanger: true,
                        pageSizeOptions: ['50', '100', '200'],
                        onChange: (page, pageSize) => {
                            setFilters((f) => ({ ...f, offset: (page - 1) * pageSize, limit: pageSize }));
                        }
                    }}
                    expandable={expandableProps}
                    scroll={{ y: 600 }}
                    size="middle"
                    bordered
                />
            </Card>

            <div className="mt-4 flex gap-4">
                <Card size="small" className="flex-1 shadow-sm border-l-4 border-l-blue-500">
                    <Space>
                        <ThunderboltOutlined style={{ color: '#1890ff' }} />
                        <Text type="secondary">Bugünkü İşlem:</Text>
                        <Text strong>{totalCount}</Text>
                    </Space>
                </Card>
                <Card size="small" className="flex-1 shadow-sm border-l-4 border-l-green-500">
                    <Space>
                        <EyeOutlined style={{ color: '#52c41a' }} />
                        <Text type="secondary">Kritik İzleme Aktif</Text>
                        <Badge status="success" />
                    </Space>
                </Card>
                <Card size="small" className="flex-1 shadow-sm border-l-4 border-l-orange-500">
                    <Space>
                        <DatabaseOutlined style={{ color: '#fa8c16' }} />
                        <Text type="secondary">Arşiv Kapasitesi:</Text>
                        <Text strong>90 Gün</Text>
                    </Space>
                </Card>
            </div>
        </div>
    );
};

export default AuditTrailModule;


