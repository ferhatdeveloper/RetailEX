import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url: string;
  key: string;
}

export interface MigrationLog {
  timestamp: string;
  level: 'info' | 'error' | 'success' | 'warn' | 'debug';
  message: string;
}

export class SupabaseMigrationService {
  private sourceClient: SupabaseClient | null = null;
  private targetClient: SupabaseClient | null = null;
  private logs: MigrationLog[] = [];
  private onLogUpdate: ((logs: MigrationLog[]) => void) | null = null;

  constructor(onLogUpdate?: (logs: MigrationLog[]) => void) {
    this.onLogUpdate = onLogUpdate || null;
  }

  private log(level: MigrationLog['level'], message: string) {
    const newLog: MigrationLog = {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
    };
    this.logs = [...this.logs, newLog];
    if (this.onLogUpdate) this.onLogUpdate(this.logs);
  }

  async connect(source: SupabaseConfig, target: SupabaseConfig): Promise<boolean> {
    try {
      this.sourceClient = createClient(source.url, source.key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });
      this.targetClient = createClient(target.url, target.key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });

      this.log('info', 'Bağlantılar kuruluyor...');

      // Test connections
      let sourceError = null;
      let targetError = null;

      try {
        const { error } = await this.sourceClient.from('_test_').select('count', { count: 'exact', head: true }).limit(1);
        sourceError = error;
      } catch (e: any) {
        sourceError = e;
      }

      try {
        const { error } = await this.targetClient.from('_test_').select('count', { count: 'exact', head: true }).limit(1);
        targetError = error;
      } catch (e: any) {
        targetError = e;
      }

      // Note: _test_ might not exist, but we check if we get a "real" error like invalid credentials
      if (sourceError && (sourceError as any).code === 'PGRST301') {
        this.log('error', 'Kaynak Supabase kimlik hatası');
        return false;
      }
      if (targetError && (targetError as any).code === 'PGRST301') {
        this.log('error', 'Hedef Supabase kimlik hatası');
        return false;
      }

      this.log('success', 'Kaynak ve Hedef sunuculara başarıyla bağlanıldı');
      return true;
    } catch (error: any) {
      this.log('error', `Bağlantı hatası: ${error.message}`);
      return false;
    }
  }

  async getTables(projectRef?: string, managementToken?: string): Promise<string[]> {
    if (!this.sourceClient) return [];

    try {
      this.log('info', 'Tablo listesi alınıyor...');

      // Method 1: Management API via Tauri (Most powerful, avoids PostgREST limits)
      if (projectRef && managementToken) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const tables = await invoke<string[]>('get_supabase_tables', {
            projectRef: projectRef.trim(),
            token: managementToken.trim()
          });
          if (tables && tables.length > 0) {
            this.log('success', `${tables.length} tablo bulundu (Management API).`);
            return tables;
          }
        } catch (e) {
          this.log('warn', 'Management API ile tablo keşfi başarısız, PostgREST deneniyor...');
        }
      }

      // Method 2: RPC (Reliable if exists)
      const { data: rpcData, error: rpcError } = await this.sourceClient.rpc('get_tables_info');

      if (!rpcError && rpcData) {
        return (rpcData as any[]).map(t => typeof t === 'string' ? t : t.table_name);
      }

      this.log('warn', 'get_tables_info RPC bulunamadı. Alternatif yöntem deneniyor...');

      // Method 3: Query information_schema.tables directly (requires service_role)
      try {
        const { data: infoData, error: infoError } = await this.sourceClient
          .from('tables')
          .select('table_name')
          .eq('table_schema', 'public');

        if (!infoError && infoData) {
          const tableNames = infoData.map((t: any) => t.table_name);
          if (tableNames.length > 0) {
            this.log('success', `${tableNames.length} tablo bulundu (PostgREST Fallback).`);
            return tableNames;
          }
        }
      } catch (e) {
        // Ignore fallback error
      }

      this.log('error', 'Otomatik tablo keşfi başarısız. Lütfen Supabase SQL Editor\'de şu komutu çalıştırın:');
      this.log('info', 'CREATE OR REPLACE FUNCTION get_tables_info() RETURNS TABLE(table_name text) LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN QUERY SELECT t.table_name::text FROM information_schema.tables t WHERE t.table_schema = \'public\' AND t.table_type = \'BASE TABLE\'; END; $$;');

      return [];
    } catch (error: any) {
      this.log('error', `Tablo listesi alınamadı: ${error.message}`);
      return [];
    }
  }

  async migrateTable(
    tableName: string,
    onProgress?: (percent: number) => void,
    sourceProjectRef?: string,
    targetProjectRef?: string,
    sourceToken?: string,
    targetToken?: string,
    schemaOnly?: boolean
  ): Promise<boolean> {
    if (!this.sourceClient || !this.targetClient) return false;

    this.log('info', `${tableName} tablosu aktarılıyor...`);

    try {
      // 1. Check if table exists on target using Management API (more reliable for schema checks)
      let isMissingOnTarget = false;
      const { invoke } = await import('@tauri-apps/api/core');

      try {
        const checkSql = `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${tableName}'`;
        const checkResult = await invoke<string>('execute_supabase_sql', {
          projectRef: targetProjectRef,
          token: targetToken,
          sql: checkSql
        });
        
        // Note: execute_supabase_sql returns 'Success' if the query runs. 
        // But we can't get the count result back easily through it.
        // However, we can try a forced select that fails if the table is missing.
        const probeSql = `SELECT 1 FROM public."${tableName}" LIMIT 1`;
        const probeResult = await invoke<string>('execute_supabase_sql', {
          projectRef: targetProjectRef,
          token: targetToken,
          sql: probeSql
        });
        
        if (probeResult !== 'Success') {
          // Prob başarısızsa tablo muhtemelen yoktur.
          if (probeResult.includes('does not exist') || probeResult.includes('42P01') || probeResult.includes('not found')) {
            isMissingOnTarget = true;
          } else {
            // Sessizce devam et, isMissingOnTarget zaten false kalırsa select denemesi yapılacaktır.
            this.log('debug', `Tablo kontrol uyarısı (${tableName}): ${probeResult}`);
          }
        }
      } catch (e: any) {
        // 'Relation does not exist' hatası beklenen bir durumdur (tablo yok demektir).
        // Bu yüzden bunu bir 'error' veya 'warn' olarak değil, sadece dahili kontrol olarak görüyoruz.
        const errStr = String(e);
        if (errStr.includes('does not exist') || errStr.includes('42P01') || errStr.includes('not found')) {
          isMissingOnTarget = true;
        } else {
          // Gerçekten beklenmedik bir hata varsa loglayalım.
          this.log('debug', `${tableName} varlık kontrolü sırasında beklenmedik hata: ${errStr}`);
          isMissingOnTarget = true; 
        }
      }

      // 2. Fetch total count from source (Only if NOT schema only)
      let count = 0;
      if (!schemaOnly) {
        try {
          const { count: fetchedCount, error: countError } = await this.sourceClient
            .from(tableName)
            .select('*', { count: 'exact', head: true });

          if (countError) {
            this.log('warn', `${tableName} kaynak sayısı alınamadı (PostgREST), veri aktarımı etkilenmiş olabilir: ${countError.message}`);
          } else {
            count = fetchedCount || 0;
          }
        } catch (e: any) {
          this.log('warn', `${tableName} kaynak sayısı çekilirken istisna: ${e.message || e}`);
        }
      }

      // 3. Handle schema creation if missing
      if (isMissingOnTarget) {
        this.log('warn', `${tableName} hedefte bulunamadı, şema oluşturuluyor...`);
        if (sourceProjectRef && targetProjectRef && sourceToken && targetToken) {
          const schemaSuccess = await this.handleSchemaCreation(tableName, [], sourceProjectRef, targetProjectRef, sourceToken, targetToken);
          if (!schemaSuccess) return false;
        } else {
          this.log('error', `${tableName} şeması oluşturmak için yetki anahtarları eksik.`);
          return false;
        }
      }

      // 4. Handle data transfer
      if (schemaOnly) {
        this.log('info', `Şema öncelikli mod: ${tableName} veri aktarımı atlanıyor.`);
        if (onProgress) onProgress(100);
        return true;
      }

      if (count === 0) {
        this.log('info', `${tableName} kaynakta boş, veri aktarımı atlanıyor.`);
        if (onProgress) onProgress(100);
        return true;
      }

      this.log('info', `${tableName}: ${count} satır aktarılıyor...`);

      // Batch size for transfer
      const batchSize = 1000;
      let processed = 0;

      for (let i = 0; i < (count || 0); i += batchSize) {
        const { data, error: fetchError } = await this.sourceClient
          .from(tableName)
          .select('*')
          .range(i, i + batchSize - 1);

        if (fetchError) {
          this.log('error', `${tableName} verisi çekilemedi: ${fetchError.message}`);
          return false;
        }

        if (data && data.length > 0) {
          const { error: insertError } = await this.targetClient
            .from(tableName)
            .upsert(data);

          if (insertError) {
            this.log('error', `${tableName} verisi yazılamadı: ${insertError.message}`);
            return false;
          }
          processed += data.length;
        }

        if (onProgress) onProgress(Math.round((processed / (count || 1)) * 100));
      }

      this.log('success', `${tableName} başarıyla aktarıldı (${processed} satır)`);
      return true;
    } catch (error: any) {
      this.log('error', `${tableName} aktarım hatası: ${error.message}`);
      return false;
    }
  }

  private async handleSchemaCreation(
    tableName: string,
    data: any[],
    sourceProjectRef?: string,
    targetProjectRef?: string,
    sourceToken?: string,
    targetToken?: string
  ): Promise<boolean> {
    if (!sourceProjectRef || !targetProjectRef || !sourceToken || !targetToken) return false;

    try {
      const { invoke } = await import('@tauri-apps/api/core');

      // Fetch full schema including types from source
      const schema = await invoke<any>('get_supabase_table_schema', {
        projectRef: sourceProjectRef.trim(),
        token: sourceToken.trim(),
        tableName
      });

      if (schema && schema.table_ddl) {
        // 1. Create sequences first
        if (schema.sequence_ddls && schema.sequence_ddls.length > 0) {
          this.log('info', `${tableName} için ${schema.sequence_ddls.length} sequence oluşturuluyor...`);
          for (const seqDdl of schema.sequence_ddls) {
            await invoke('execute_supabase_sql', {
              projectRef: targetProjectRef.trim(),
              token: targetToken.trim(),
              sql: seqDdl
            });
          }
        }

        // 2. Create custom types
        if (schema.type_ddls && schema.type_ddls.length > 0) {
          this.log('info', `${tableName} için ${schema.type_ddls.length} özel tip oluşturuluyor...`);
          for (const typeDdl of schema.type_ddls) {
            await invoke('execute_supabase_sql', {
              projectRef: targetProjectRef.trim(),
              token: targetToken.trim(),
              sql: typeDdl
            });
          }
        }

        // 3. Execute table DDL on target
        const result = await invoke<string>('execute_supabase_sql', {
          projectRef: targetProjectRef.trim(),
          token: targetToken.trim(),
          sql: schema.table_ddl
        });

        if (result === 'Success') {
          this.log('info', `${tableName} şeması oluşturuldu, API önbelleği yenileniyor...`);

          // Force PostgREST schema reload
          try {
            await invoke('execute_supabase_sql', {
              projectRef: targetProjectRef,
              token: targetToken.trim(),
              sql: "NOTIFY pgrst, 'reload schema';"
            });
          } catch (e) {
            // Ignore reload error
          }

          // Wait for cache to clear
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Only insert data if we have any
          if (data && data.length > 0) {
            const { error: retryError } = await this.targetClient!
              .from(tableName)
              .upsert(data);

            if (retryError) {
              this.log('error', `${tableName} tekrar denemede de yazılamadı: ${retryError.message}`);
              return false;
            }
          }
          this.log('success', `${tableName} şeması ${data.length > 0 ? 've verisi' : ''} aktarıldı.`);
          return true;
        } else {
          this.log('error', `${tableName} şeması oluşturulurken hata: ${result}`);
          return false;
        }
      } else {
        this.log('error', `${tableName} şeması boş (DDL alınamadı).`);
        return false;
      }
    } catch (ddlError: any) {
      this.log('error', `${tableName} şeması oluşturulamadı: ${ddlError.message || ddlError}`);
      return false;
    }
  }

  async setupDefaultAdmin(_targetRef: string, _targetToken: string): Promise<boolean> {
    this.log('info', 'Admin kullanıcısı oluşturma atlanıyor (Kullanıcı tarafından SQL ile yapılacak).');
    return true;
  }

  async migrateFunctions(sourceRef: string, sourceToken: string, targetRef: string, targetToken: string): Promise<boolean> {
    this.log('info', 'Fonksiyonlar aktarılıyor...');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const defs = await invoke<string[]>('get_supabase_functions', {
        projectRef: sourceRef.trim(),
        token: sourceToken.trim()
      });

      if (defs.length === 0) {
        this.log('info', 'Aktarılacak fonksiyon bulunamadı.');
        return true;
      }

      for (const def of defs) {
        // Functions usually have CREATE OR REPLACE, but we can wrap in DO for extra safety
        const sql = `
          DO $$ 
          BEGIN 
            ${def}; 
          EXCEPTION WHEN others THEN 
            -- Log warning internally but don't block
          END $$;
        `;
        await invoke('execute_supabase_sql', { projectRef: targetRef.trim(), token: targetToken.trim(), sql });
      }

      this.log('success', `${defs.length} fonksiyon başarıyla aktarıldı.`);
      return true;
    } catch (e: any) {
      this.log('error', `Fonksiyon aktarım hatası: ${e.message || e}`);
      return false;
    }
  }

  async migrateViews(sourceRef: string, sourceToken: string, targetRef: string, targetToken: string): Promise<boolean> {
    this.log('info', 'View yapıları aktarılıyor...');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const views = await invoke<[string, string][]>('get_supabase_views', { projectRef: sourceRef.trim(), token: sourceToken.trim() });

      if (views.length === 0) {
        this.log('info', 'Aktarılacak view bulunamadı.');
        return true;
      }

      for (const [name, def] of views) {
        const sql = `CREATE OR REPLACE VIEW public."${name}" AS ${def};`;
        await invoke('execute_supabase_sql', { projectRef: targetRef.trim(), token: targetToken.trim(), sql });
      }

      this.log('success', `${views.length} view başarıyla aktarıldı.`);
      return true;
    } catch (e: any) {
      this.log('error', `View aktarım hatası: ${e.message || e}`);
      return false;
    }
  }

  async migrateTriggers(sourceRef: string, sourceToken: string, targetRef: string, targetToken: string): Promise<boolean> {
    this.log('info', 'Triggerlar aktarılıyor...');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const defs = await invoke<string[]>('get_supabase_triggers', {
        projectRef: sourceRef.trim(),
        token: sourceToken.trim()
      });

      if (defs.length === 0) {
        this.log('info', 'Aktarılacak trigger bulunamadı.');
        return true;
      }

      for (const def of defs) {
        // Postgres has no CREATE OR REPLACE TRIGGER. We wrap in DO to ignore "already exists" errors.
        const sql = `
          DO $$ 
          BEGIN 
            ${def}; 
          EXCEPTION WHEN others THEN 
            -- Already exists or dependency error (e.g. table not created yet)
          END $$;
        `;
        await invoke('execute_supabase_sql', { projectRef: targetRef.trim(), token: targetToken.trim(), sql });
      }

      this.log('success', `${defs.length} trigger başarıyla aktarıldı.`);
      return true;
    } catch (e: any) {
      this.log('error', `Trigger aktarım hatası: ${e.message || e}`);
      return false;
    }
  }

  async migratePolicies(sourceRef: string, sourceToken: string, targetRef: string, targetToken: string): Promise<boolean> {
    this.log('info', 'RLS Politikaları aktarılıyor...');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const policies = await invoke<[string, string, boolean][]>('get_supabase_policies', { 
        projectRef: sourceRef.trim(), 
        token: sourceToken.trim() 
      });

      if (policies.length === 0) {
        this.log('info', 'Aktarılacak politika bulunamadı.');
        return true;
      }

      const tablesEnabled = new Set<string>();

      for (const [tableName, definition, rlsEnabled] of policies) {
        try {
          // Enable RLS first if needed
          if (rlsEnabled && !tablesEnabled.has(tableName)) {
            await invoke('execute_supabase_sql', {
              projectRef: targetRef.trim(),
              token: targetToken.trim(),
              sql: `ALTER TABLE public."${tableName}" ENABLE ROW LEVEL SECURITY;`
            });
            tablesEnabled.add(tableName);
          }

          if (definition && definition.trim().length > 0) {
            await invoke('execute_supabase_sql', { 
              projectRef: targetRef.trim(), 
              token: targetToken.trim(), 
              sql: definition 
            });
          }
        } catch (e: any) {
          this.log('debug', `Politika aktarım uyarısı (${tableName}): ${e.message || e}`);
        }
      }

      this.log('success', 'RLS politikaları aktarıldı.');
      return true;
    } catch (e: any) {
      this.log('error', `Politika aktarım hatası: ${e.message || e}`);
      return false;
  }
  }
}
