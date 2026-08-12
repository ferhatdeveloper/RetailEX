/**
 * GİB gönderim taşıyıcıları — test için mock, üretim için ileride SOAP/entegratör.
 */

import { v4 as uuidv4 } from 'uuid';
import type { EInvoiceResolvedConfig, GibClientMode } from '../../config/eInvoice.config';
import type { GIBResponse } from './gibTypes';

export interface IGIBTransport {
  sendEInvoice(xml: string): Promise<GIBResponse>;
  checkStatus(uuid: string): Promise<GIBResponse>;
  cancelDocument(uuid: string, reason: string): Promise<GIBResponse>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Test: ağ yok, GİB yok; deterministik başarılı yanıt.
 */
export class MockGIBTransport implements IGIBTransport {
  constructor(private readonly label: string) {}

  async sendEInvoice(_xml: string): Promise<GIBResponse> {
    await delay(600);
    return {
      success: true,
      message: `E-Fatura mock gönderim başarılı (${this.label})`,
      documentId: uuidv4(),
      timestamp: new Date().toISOString(),
      envelope: `MOCK_ENV_${uuidv4().slice(0, 8)}`,
    };
  }

  async checkStatus(uuid: string): Promise<GIBResponse> {
    await delay(400);
    const statuses = ['Onaylandı', 'Beklemede', 'Reddedildi'] as const;
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    return {
      success: randomStatus !== 'Reddedildi',
      message: randomStatus,
      documentId: uuid,
      timestamp: new Date().toISOString(),
    };
  }

  async cancelDocument(uuid: string, _reason: string): Promise<GIBResponse> {
    await delay(500);
    return {
      success: true,
      message: 'Belge mock iptal',
      documentId: uuid,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Gerçek entegrasyon yazılıncaya kadar: açık hata mesajı (sessiz başarısızlık yok).
 */
export class UnconfiguredHttpGIBTransport implements IGIBTransport {
  async sendEInvoice(_xml: string): Promise<GIBResponse> {
    return {
      success: false,
      message:
        'GİB doğrudan/entegratör istemcisi henüz yapılandırılmadı. Test için .env içinde VITE_GIB_MOCK_TRANSPORT=true kullanın.',
      timestamp: new Date().toISOString(),
    };
  }

  async checkStatus(_uuid: string): Promise<GIBResponse> {
    return {
      success: false,
      message: 'Durum sorgusu: GİB istemcisi yapılandırılmadı.',
      timestamp: new Date().toISOString(),
    };
  }

  async cancelDocument(_uuid: string, _reason: string): Promise<GIBResponse> {
    return {
      success: false,
      message: 'İptal: GİB istemcisi yapılandırılmadı.',
      timestamp: new Date().toISOString(),
    };
  }
}

export function createGibTransport(resolved: EInvoiceResolvedConfig): IGIBTransport {
  const mode: GibClientMode = resolved.gibClientMode;
  if (mode === 'mock') {
    return new MockGIBTransport(resolved.environmentLabel);
  }
  return new UnconfiguredHttpGIBTransport();
}
