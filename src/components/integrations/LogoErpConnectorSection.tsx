import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Button,
  Card,
  Col,
  Collapse,
  Divider,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { SaveOutlined, ApiOutlined, LinkOutlined } from '@ant-design/icons';
import { toast } from 'sonner';
import { IS_TAURI } from '../../utils/env';
import {
  LOGO_API_URL_EXAMPLE,
  LOGO_DEFAULT_CLIENT_ID,
  loadLogoRestConfig,
  loadLogoRestSession,
  saveLogoRestConfig,
  logoTestConnection,
  getLogoMappingForErp,
  resolveLogoContext,
  setLogoRestBaseUrl,
  logoListFirmCatalog,
  logoListDatabases,
  saveLogoDatabaseList,
  saveLogoFirmMappingForErp,
  saveLogoFirmCatalog,
  periodsForFirm,
  type LogoRestConfig,
  type LogoFirmOption,
  type LogoPeriodOption,
} from '../../services/logoRestApi';
import {
  resolveLogoErpModeFromConfig,
  saveLogoErpMode,
  type LogoErpMode,
} from '../../services/logoErpMode';
import {
  loadLogoRestSyncSettings,
  saveLogoRestSyncSettings,
  startLogoRestAutoSync,
  stopLogoRestAutoSync,
} from '../../services/logoRestSyncService';
import {
  loadLogoMssqlSyncSettings,
  saveLogoMssqlSyncSettings,
  startLogoMssqlAutoSync,
  stopLogoMssqlAutoSync,
  listLogoMssqlDatabases,
  setLogoMssqlDatabase,
} from '../../services/logoMssqlSyncService';
import {
  loadLogoErpIntegrationParams,
  saveLogoErpIntegrationParams,
  type LogoErpIntegrationParams,
} from '../../services/logoErpIntegrationParams';
import {
  loadLogoLobjectConfig,
  saveLogoLobjectConfig,
  type LogoLobjectConfig,
} from '../../services/logoErpLobjectConfig';
import {
  loadLogoErpSyncFlowSettings,
  saveLogoErpSyncFlowSettings,
  SYNC_DIRECTION_OPTIONS,
  DATA_TOPOLOGY_OPTIONS,
  type LogoDataTopology,
  type LogoSyncDirection,
} from '../../services/logoErpSyncFlow';
import { LogoErpSyncCollapse } from './LogoErpSyncCollapse';

const { Title, Text } = Typography;

type ServiceType = 'rest' | 'lobject';

type FormValues = {
  erpType: string;
  serviceType: ServiceType;
  lobject: LogoLobjectConfig;
  rest: Pick<LogoRestConfig, 'baseUrl' | 'username' | 'password' | 'clientId' | 'clientSecret'>;
  params: LogoErpIntegrationParams;
  restAutoEnabled: boolean;
  restAutoInterval: number;
  mssqlAutoEnabled: boolean;
  mssqlAutoInterval: number;
  syncDirection: LogoSyncDirection;
  dataTopology: LogoDataTopology;
  autoHybridAfterPull: boolean;
};

const yesNoOptions = [
  { value: false, label: 'Hayır' },
  { value: true, label: 'Evet' },
];

const serviceBoxStyle: CSSProperties = {
  border: '1px solid #e8e8e8',
  borderRadius: 8,
  padding: '20px 20px 8px',
  background: '#fafafa',
};

const sectionHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 16,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#262626',
  letterSpacing: '0.02em',
};

const subsectionTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#8c8c8c',
  marginBottom: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

function modeToServiceType(mode: LogoErpMode): ServiceType {
  return mode === 'mssql' ? 'lobject' : 'rest';
}

function serviceTypeToMode(type: ServiceType): LogoErpMode {
  return type === 'lobject' ? 'mssql' : 'rest';
}

export function LogoErpConnectorSection() {
  const [form] = Form.useForm<FormValues>();
  const [ready, setReady] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbOptions, setDbOptions] = useState<string[]>([]);
  const [restDbLoading, setRestDbLoading] = useState(false);
  const [restDbOptions, setRestDbOptions] = useState<string[]>([]);
  const [restFirms, setRestFirms] = useState<LogoFirmOption[]>([]);
  const [restPeriods, setRestPeriods] = useState<LogoPeriodOption[]>([]);
  const [restFirmsLoading, setRestFirmsLoading] = useState(false);
  const [restConnected, setRestConnected] = useState(false);
  const [restLogoFirmNr, setRestLogoFirmNr] = useState<number | undefined>();
  const [restLogoPeriodNr, setRestLogoPeriodNr] = useState<number | undefined>();
  const [restLogoDb, setRestLogoDb] = useState<string | undefined>();
  const [activePanels, setActivePanels] = useState<string[]>(['genel', 'parametreler', 'senkron']);

  const serviceType = Form.useWatch('serviceType', form) ?? 'rest';

  const applyModeSideEffects = useCallback((mode: LogoErpMode) => {
    if (mode === 'mssql') {
      stopLogoRestAutoSync();
      if (IS_TAURI) startLogoMssqlAutoSync();
    } else {
      stopLogoMssqlAutoSync();
      startLogoRestAutoSync();
    }
  }, []);

  const loadAll = useCallback(async () => {
    const mode = await resolveLogoErpModeFromConfig();
    const restCfg = loadLogoRestConfig();
    const lobject = await loadLogoLobjectConfig();
    const params = loadLogoErpIntegrationParams();
    const restSync = loadLogoRestSyncSettings();
    const mssqlSync = loadLogoMssqlSyncSettings();
    const syncFlow = loadLogoErpSyncFlowSettings();
    const mapping = getLogoMappingForErp(restCfg);
    const ctx = resolveLogoContext(restCfg);

    form.setFieldsValue({
      erpType: 'LOGO',
      serviceType: modeToServiceType(mode),
      lobject,
      rest: {
        baseUrl: restCfg.baseUrl,
        username: restCfg.username,
        password: restCfg.password,
        clientId: restCfg.clientId,
        clientSecret: restCfg.clientSecret,
      },
      params: {
        autoSendProducts: restSync.modules.masterData,
        autoSendServices: params.autoSendServices,
        autoSendCari: restSync.modules.customers,
        documentTransferDays: params.documentTransferDays,
        fillAccountingCodes: params.fillAccountingCodes,
        bankAccountCodeSpaces: params.bankAccountCodeSpaces,
      },
      restAutoEnabled: restSync.enabled,
      restAutoInterval: restSync.intervalMinutes,
      mssqlAutoEnabled: mssqlSync.enabled,
      mssqlAutoInterval: mssqlSync.intervalMinutes,
      syncDirection: syncFlow.syncDirection,
      dataTopology: syncFlow.dataTopology,
      autoHybridAfterPull: syncFlow.autoHybridAfterPull,
    });

    applyModeSideEffects(mode);
    setRestFirms(restCfg.firmCatalog ?? []);
    setRestDbOptions(
      Array.from(new Set([...(restCfg.logoDbs || []), restCfg.logoDb].filter(Boolean))) as string[]
    );
    setRestLogoFirmNr(mapping?.logoFirmNr ?? ctx.firmNr);
    setRestLogoPeriodNr(mapping?.logoPeriodNr ?? ctx.periodNr);
    setRestLogoDb(restCfg.logoDb || undefined);
    const session = loadLogoRestSession();
    setRestConnected(Boolean(session && Date.now() < session.expiresAt));
    if (mapping) {
      setRestPeriods(periodsForFirm(restCfg.firmCatalog ?? [], mapping.logoFirmNr));
    }
    setReady(true);
  }, [applyModeSideEffects, form]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const refreshDatabases = useCallback(async () => {
    const lobject = form.getFieldValue('lobject') as LogoLobjectConfig | undefined;
    if (!IS_TAURI || !lobject?.erp_host?.trim() || !lobject?.erp_user?.trim()) {
      setDbOptions([]);
      return;
    }
    setDbLoading(true);
    try {
      const list = await listLogoMssqlDatabases({
        erp_host: lobject.erp_host,
        erp_user: lobject.erp_user,
        erp_pass: lobject.erp_pass,
      });
      setDbOptions(list);
    } catch {
      setDbOptions([]);
    } finally {
      setDbLoading(false);
    }
  }, [form]);

  useEffect(() => {
    if (ready && serviceType === 'lobject') void refreshDatabases();
  }, [ready, serviceType, refreshDatabases]);

  const refreshRestDatabases = useCallback(async () => {
    setRestDbLoading(true);
    try {
      const cfg = loadLogoRestConfig();
      const list = await logoListDatabases(cfg);
      const next = saveLogoDatabaseList(cfg, list);
      setRestDbOptions(
        Array.from(new Set([...(next.logoDbs || []), next.logoDb].filter(Boolean))) as string[]
      );
    } catch {
      /* opsiyonel */
    } finally {
      setRestDbLoading(false);
    }
  }, []);

  const refreshRestFirms = useCallback(async () => {
    setRestFirmsLoading(true);
    try {
      const cfg = loadLogoRestConfig();
      const list = await logoListFirmCatalog(cfg);
      const next = saveLogoFirmCatalog(cfg, list);
      setRestFirms(list);
      const mapping = getLogoMappingForErp(next);
      if (mapping) {
        setRestPeriods(periodsForFirm(list, mapping.logoFirmNr));
        setRestLogoFirmNr(mapping.logoFirmNr);
        setRestLogoPeriodNr(mapping.logoPeriodNr);
        setRestLogoDb(mapping.logoDb || next.logoDb || undefined);
      }
    } catch {
      /* bağlantı testinden sonra tekrar denenecek */
    } finally {
      setRestFirmsLoading(false);
    }
  }, []);

  const handleRestFirmSelect = (firmNr: number | undefined) => {
    if (firmNr == null) {
      setRestLogoFirmNr(undefined);
      setRestLogoPeriodNr(undefined);
      setRestPeriods([]);
      return;
    }
    const cfg = loadLogoRestConfig();
    const firm = restFirms.find((f) => f.firmNr === firmNr);
    const pList = periodsForFirm(restFirms, firmNr);
    setRestPeriods(pList);
    const periodNr = firm?.defaultPeriod ?? pList.find((p) => p.active)?.number ?? pList[0]?.number ?? 1;
    saveLogoFirmMappingForErp(cfg, {
      logoFirmNr: firmNr,
      logoPeriodNr: periodNr,
      logoDb: cfg.logoDb,
      logoFirmName: firm?.name,
      logoFirmTitle: firm?.title || firm?.name,
    });
    setRestLogoFirmNr(firmNr);
    setRestLogoPeriodNr(periodNr);
  };

  const handleRestPeriodSelect = (periodNr: number) => {
    const cfg = loadLogoRestConfig();
    const mapping = getLogoMappingForErp(cfg);
    const firmNr = mapping?.logoFirmNr ?? resolveLogoContext(cfg).firmNr;
    saveLogoFirmMappingForErp(cfg, {
      logoFirmNr: firmNr,
      logoPeriodNr: periodNr,
      logoDb: cfg.logoDb,
      logoFirmName: mapping?.logoFirmName,
      logoFirmTitle: mapping?.logoFirmTitle,
    });
    setRestLogoPeriodNr(periodNr);
  };

  const handleRestDbSelect = (logoDb: string | undefined) => {
    if (!logoDb) {
      setRestLogoDb(undefined);
      return;
    }
    const cfg = loadLogoRestConfig();
    const mapping = getLogoMappingForErp(cfg);
    if (mapping) {
      saveLogoFirmMappingForErp(cfg, { ...mapping, logoDb });
    } else {
      saveLogoRestConfig({ ...cfg, logoDb });
    }
    setRestLogoDb(logoDb);
  };

  const restContextReady = restFirms.length > 0 || restDbOptions.length > 0;

  const handleServiceTypeChange = useCallback(
    (next: ServiceType) => {
      const mode = serviceTypeToMode(next);
      void saveLogoErpMode(mode);
      applyModeSideEffects(mode);
    },
    [applyModeSideEffects],
  );

  const persistForm = useCallback(async (values: FormValues) => {
    const prevRest = loadLogoRestConfig();
    const nextRest: LogoRestConfig = {
      ...prevRest,
      baseUrl: values.rest.baseUrl.trim(),
      username: values.rest.username,
      password: values.rest.password,
      clientId: values.rest.clientId || LOGO_DEFAULT_CLIENT_ID,
      clientSecret: values.rest.clientSecret,
    };
    setLogoRestBaseUrl(nextRest.baseUrl, { manual: true });
    saveLogoRestConfig(nextRest);

    await saveLogoLobjectConfig(values.lobject);
    if (values.lobject.erp_db?.trim()) {
      await setLogoMssqlDatabase(values.lobject.erp_db.trim());
    }

    saveLogoErpIntegrationParams({
      autoSendServices: values.params.autoSendServices,
      documentTransferDays: values.params.documentTransferDays,
      fillAccountingCodes: values.params.fillAccountingCodes,
      bankAccountCodeSpaces: values.params.bankAccountCodeSpaces,
    });

    saveLogoRestSyncSettings({
      enabled: values.restAutoEnabled,
      intervalMinutes: values.restAutoInterval,
      modules: {
        ...loadLogoRestSyncSettings().modules,
        masterData: values.params.autoSendProducts,
        customers: values.params.autoSendCari,
      },
    });

    saveLogoMssqlSyncSettings({
      enabled: values.mssqlAutoEnabled,
      intervalMinutes: values.mssqlAutoInterval,
    });

    saveLogoErpSyncFlowSettings({
      syncDirection: values.syncDirection,
      dataTopology: values.dataTopology,
      autoHybridAfterPull: values.autoHybridAfterPull,
    });

    void saveLogoErpMode(serviceTypeToMode(values.serviceType));
    applyModeSideEffects(serviceTypeToMode(values.serviceType));
  }, [applyModeSideEffects]);

  const handleConnectionTest = useCallback(async () => {
    setTesting(true);
    try {
      const type = form.getFieldValue('serviceType') ?? 'rest';
      if (type === 'lobject') {
        await form.validateFields([
          ['lobject', 'erp_user'],
          ['lobject', 'erp_pass'],
          ['lobject', 'erp_host'],
          ['lobject', 'erp_db'],
        ]);
      } else {
        await form.validateFields([
          ['rest', 'baseUrl'],
          ['rest', 'username'],
          ['rest', 'password'],
        ]);
      }
      const values = form.getFieldsValue(true) as FormValues;
      await persistForm(values);

      if (type === 'lobject') {
        if (!IS_TAURI) {
          toast.info('LOBJECT bağlantısı yalnızca masaüstü uygulamasında test edilir.');
          return;
        }
        const list = await listLogoMssqlDatabases({
          erp_host: values.lobject?.erp_host,
          erp_user: values.lobject?.erp_user,
          erp_pass: values.lobject?.erp_pass,
        });
        if (list.length > 0) {
          setDbOptions(list);
          toast.success(`MSSQL bağlantısı başarılı (${list.length} veritabanı)`);
        } else {
          toast.warning('Bağlantı kuruldu ancak veritabanı listesi boş.');
        }
        return;
      }

      const cfg = loadLogoRestConfig();
      const result = await logoTestConnection(cfg);
      if (result.ok) {
        toast.success('Logo REST bağlantısı başarılı');
        setRestConnected(true);
        window.dispatchEvent(new CustomEvent('retailex:logo-rest-connected'));
        if (result.databases?.length) {
          saveLogoDatabaseList(cfg, result.databases);
          setRestDbOptions(result.databases);
        }
        await refreshRestFirms();
        await refreshRestDatabases();
        return;
      } else {
        toast.error(result.error || 'Bağlantı hatası');
      }
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  }, [form, persistForm]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = await form.validateFields();
      await persistForm(values);
      toast.success('Entegrasyon ayarları kaydedildi');
      window.dispatchEvent(new CustomEvent('retailex:logo-settings-saved'));
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const collapseItems = useMemo(
    () => [
      {
        key: 'genel',
        label: <Text strong>Genel</Text>,
        children: (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Row gutter={[16, 16]} align="bottom">
              <Col xs={24} md={8}>
                <Form.Item name="erpType" label="ERP Türü" style={{ marginBottom: 0 }}>
                  <Select disabled options={[{ value: 'LOGO', label: 'LOGO' }]} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="serviceType" label="ERP Servis Tipi" style={{ marginBottom: 0 }}>
                  <Select
                    options={[
                      { value: 'rest', label: 'REST API' },
                      {
                        value: 'lobject',
                        label: 'LOBJECT (MSSQL)',
                        disabled: !IS_TAURI,
                      },
                    ]}
                    onChange={handleServiceTypeChange}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label=" " colon={false} style={{ marginBottom: 0 }}>
                  <Button
                    block
                    type="default"
                    icon={<LinkOutlined />}
                    onClick={() => void handleConnectionTest()}
                    loading={testing}
                  >
                    Bağlantı testi
                  </Button>
                </Form.Item>
              </Col>
            </Row>

            {serviceType === 'lobject' ? (
              <div style={serviceBoxStyle}>
                <div style={sectionHeaderStyle}>
                  <span style={sectionTitleStyle}>LOBJECT — SQL Server bağlantısı</span>
                  {!IS_TAURI ? <Tag>Masaüstü gerekli</Tag> : null}
                </div>
                <Row gutter={[16, 0]}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name={['lobject', 'erp_host']}
                      label="Sunucu adı"
                      rules={[{ required: IS_TAURI, message: 'Zorunlu' }]}
                    >
                      <Input disabled={!IS_TAURI} placeholder="192.168.1.10" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name={['lobject', 'erp_port']} label="Port">
                      <Input disabled={!IS_TAURI} placeholder="1433" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item
                      name={['lobject', 'erp_db']}
                      label="Veritabanı"
                      rules={[{ required: IS_TAURI, message: 'Zorunlu' }]}
                    >
                      {IS_TAURI ? (
                        <Select
                          showSearch
                          loading={dbLoading}
                          options={dbOptions.map((db) => ({ value: db, label: db }))}
                          notFoundContent={dbLoading ? <Spin size="small" /> : 'Önce bağlantı testi yapın'}
                          dropdownRender={(menu) => (
                            <>
                              {menu}
                              <div style={{ padding: 8, borderTop: '1px solid #f0f0f0' }}>
                                <Button size="small" block onClick={() => void refreshDatabases()}>
                                  Veritabanlarını yenile
                                </Button>
                              </div>
                            </>
                          )}
                        />
                      ) : (
                        <Input disabled placeholder="Masaüstü uygulamasında kullanılabilir" />
                      )}
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item
                      name={['lobject', 'erp_user']}
                      label="Kullanıcı adı"
                      rules={[{ required: IS_TAURI, message: 'Zorunlu' }]}
                    >
                      <Input disabled={!IS_TAURI} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item
                      name={['lobject', 'erp_pass']}
                      label="Şifre"
                      rules={[{ required: IS_TAURI, message: 'Zorunlu' }]}
                    >
                      <Input.Password disabled={!IS_TAURI} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name={['lobject', 'erp_integrator_api']} label="Entegratör API (isteğe bağlı)">
                      <Input disabled={!IS_TAURI} />
                    </Form.Item>
                  </Col>
                </Row>
              </div>
            ) : (
              <div style={serviceBoxStyle}>
                <div style={sectionHeaderStyle}>
                  <span style={sectionTitleStyle}>REST API bağlantısı</span>
                  {restConnected ? (
                    <Tag color="success">Oturum açık</Tag>
                  ) : (
                    <Tag color="warning">Bağlantı testi gerekli</Tag>
                  )}
                </div>

                <div style={subsectionTitleStyle}>Sunucu</div>
                <Form.Item
                  name={['rest', 'baseUrl']}
                  label="Logo REST adresi"
                  rules={[{ required: true, message: 'Sunucu adresi zorunlu' }]}
                  extra={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Yalnızca sunucu ve port yeterli — örnek: {LOGO_API_URL_EXAMPLE}
                    </Text>
                  }
                  style={{ marginBottom: 20 }}
                >
                  <Input placeholder={LOGO_API_URL_EXAMPLE} />
                </Form.Item>

                <div style={subsectionTitleStyle}>Kimlik bilgileri</div>
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name={['rest', 'username']}
                      label="Logo kullanıcı adı"
                      rules={[{ required: true, message: 'Zorunlu' }]}
                    >
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name={['rest', 'password']}
                      label="Logo şifre"
                      rules={[{ required: true, message: 'Zorunlu' }]}
                    >
                      <Input.Password />
                    </Form.Item>
                  </Col>
                </Row>

                <Collapse
                  ghost
                  size="small"
                  style={{ marginBottom: 8 }}
                  items={[
                    {
                      key: 'oauth',
                      label: <Text type="secondary">OAuth istemci bilgileri (isteğe bağlı)</Text>,
                      children: (
                        <Row gutter={16}>
                          <Col xs={24} md={12}>
                            <Form.Item name={['rest', 'clientId']} label="Client ID">
                              <Input placeholder={LOGO_DEFAULT_CLIENT_ID} />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={12}>
                            <Form.Item name={['rest', 'clientSecret']} label="Client Secret">
                              <Input.Password />
                            </Form.Item>
                          </Col>
                        </Row>
                      ),
                    },
                  ]}
                />

                <Divider style={{ margin: '12px 0 16px' }} />

                <div style={sectionHeaderStyle}>
                  <span style={subsectionTitleStyle}>Logo firma, dönem ve veritabanı</span>
                  {!restContextReady ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Listeler bağlantı testinden sonra dolar
                    </Text>
                  ) : null}
                </div>

                <Row gutter={16}>
                  <Col xs={24} md={8}>
                    <Form.Item label="Firma" required>
                      <Select
                        showSearch
                        allowClear
                        loading={restFirmsLoading}
                        placeholder={restFirms.length ? 'Firma seçin' : 'Önce bağlantı testi'}
                        value={restLogoFirmNr}
                        onChange={handleRestFirmSelect}
                        disabled={!restFirms.length && !restFirmsLoading}
                        options={restFirms.map((f) => ({
                          value: f.firmNr,
                          label: `${f.firmNr} — ${f.title || f.name}`,
                        }))}
                        notFoundContent={restFirmsLoading ? <Spin size="small" /> : 'Firma bulunamadı'}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="Dönem" required>
                      <Select
                        placeholder="Dönem seçin"
                        value={restLogoPeriodNr}
                        onChange={handleRestPeriodSelect}
                        disabled={!restPeriods.length}
                        options={restPeriods.map((p) => ({
                          value: p.number,
                          label: `${p.number}${p.active ? ' (aktif)' : ''}`,
                        }))}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="Veritabanı">
                      <Select
                        showSearch
                        allowClear
                        loading={restDbLoading}
                        placeholder={restDbOptions.length ? 'DB seçin' : 'Önce bağlantı testi'}
                        value={restLogoDb}
                        onChange={handleRestDbSelect}
                        disabled={!restDbOptions.length && !restDbLoading}
                        options={restDbOptions.map((db) => ({ value: db, label: db }))}
                        dropdownRender={(menu) => (
                          <>
                            {menu}
                            <div style={{ padding: 8, borderTop: '1px solid #f0f0f0' }}>
                              <Button size="small" block onClick={() => void refreshRestDatabases()}>
                                Veritabanlarını yenile
                              </Button>
                            </div>
                          </>
                        )}
                      />
                    </Form.Item>
                  </Col>
                </Row>

                {restLogoFirmNr != null && restLogoPeriodNr != null ? (
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                    Seçili bağlam: firma {restLogoFirmNr} · dönem {restLogoPeriodNr}
                    {restLogoDb ? ` · ${restLogoDb}` : ''}
                  </Text>
                ) : null}
              </div>
            )}
          </Space>
        ),
      },
      {
        key: 'parametreler',
        label: <Text strong>Parametreler</Text>,
        children: (
          <Row gutter={[24, 8]}>
            <Col xs={24}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                Logo REST veya MSSQL ile veri alışverişi. Ayrı RetailEX-Logo-Connector Windows servisi
                gerekmez — web&apos;de pg_bridge, masaüstünde Tauri içi senkron kullanılır.
              </Text>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item name="syncDirection" label="Senkron yönü">
                <Select options={SYNC_DIRECTION_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item name="dataTopology" label="Veri akışı">
                <Select
                  options={DATA_TOPOLOGY_OPTIONS.filter(
                    (o) => IS_TAURI || o.value === 'logo_merkez',
                  )}
                />
              </Form.Item>
            </Col>
            {IS_TAURI ? (
              <Col xs={24} md={12} lg={8}>
                <Form.Item name="autoHybridAfterPull" label="Çekimden sonra hibrit aktarım">
                  <Select options={yesNoOptions} />
                </Form.Item>
              </Col>
            ) : null}
            <Col xs={24} md={12} lg={8}>
              <Form.Item
                name={['params', 'autoSendProducts']}
                label="Ürün kartları Logo'dan otomatik çekilsin"
              >
                <Select options={yesNoOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item
                name={['params', 'autoSendServices']}
                label="Hizmet kartları Logo'dan otomatik çekilsin"
              >
                <Select options={yesNoOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item
                name={['params', 'autoSendCari']}
                label="Cari hesaplar Logo'dan otomatik çekilsin"
              >
                <Select options={yesNoOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item name={['params', 'documentTransferDays']} label="Belge Aktarım Gün Sayısı">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item name={['params', 'fillAccountingCodes']} label="Muhasebe Kodları Doldurulsun">
                <Select options={yesNoOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item
                name={['params', 'bankAccountCodeSpaces']}
                label="Banka - Hesap Kodu Boşluk Sayısı"
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>

            {serviceType === 'rest' ? (
              <>
                <Col xs={24} md={12} lg={8}>
                  <Form.Item name="restAutoEnabled" label="Periyodik otomatik çekim">
                    <Select options={yesNoOptions} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12} lg={8}>
                  <Form.Item name="restAutoInterval" label="Çekim aralığı (dk)">
                    <InputNumber min={5} max={1440} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </>
            ) : (
              <>
                <Col xs={24} md={12} lg={8}>
                  <Form.Item name="mssqlAutoEnabled" label="Periyodik otomatik senkron">
                    <Select options={yesNoOptions} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12} lg={8}>
                  <Form.Item name="mssqlAutoInterval" label="Senkron aralığı (dk)">
                    <InputNumber min={5} max={1440} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </>
            )}
          </Row>
        ),
      },
      {
        key: 'senkron',
        label: <Text strong>Senkron</Text>,
        children: <LogoErpSyncCollapse serviceType={serviceType} />,
      },
    ],
    [dbLoading, dbOptions, handleConnectionTest, handleServiceTypeChange, refreshDatabases, refreshRestDatabases, restConnected, restContextReady, restDbLoading, restDbOptions, restFirms, restFirmsLoading, restLogoDb, restLogoFirmNr, restLogoPeriodNr, restPeriods, serviceType, testing],
  );

  if (!ready) {
    return (
      <Card bordered style={{ borderColor: '#d9d9d9' }}>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
          <div style={{ marginTop: 12 }}>
            <Text type="secondary">Entegrasyon ayarları yükleniyor…</Text>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      bordered
      style={{ borderColor: '#d9d9d9', background: '#fff' }}
      styles={{ body: { padding: 20 } }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>
          Güncelle
        </Button>
      </div>

      <Title level={4} style={{ margin: '0 0 16px', color: '#1677ff', fontWeight: 600 }}>
        <ApiOutlined style={{ marginRight: 8 }} />
        ERP Entegrasyon Ayarları
      </Title>

      <Form form={form} layout="vertical" requiredMark="optional">
        <Collapse
          bordered
          activeKey={activePanels}
          onChange={(keys) => setActivePanels(Array.isArray(keys) ? keys : [keys])}
          items={collapseItems}
          style={{ background: '#fff', borderColor: '#d9d9d9' }}
        />
      </Form>
    </Card>
  );
}
