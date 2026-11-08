import { describe, expect, it } from 'vitest';
import { visibleScreenFieldIds as webFields } from '../../config/systemTypeScreenFields';
import {
  loginBusinessProfile,
  visibleScreenFieldIds as mobileFields,
} from '../../../mobile/src/config/systemTypeFields';

const RESTAURANT_OR_WMS = ['table', 'order', 'kitchen', 'bin', 'receiving', 'warehouse', 'scale'];

describe('sistem tipine göre ekran alanları', () => {
  it('güzellik alanları web listesiyle aynıdır ve restoran veya depo alanı içermez', () => {
    const web = webFields('beauty');
    const mobile = mobileFields('beauty');
    expect(mobile).toEqual(web);
    expect(mobile).toEqual(
      expect.arrayContaining([
        'appointment',
        'service',
        'specialist',
        'device',
        'deposit',
        'clinic-reports',
        'finance',
        'invoice',
        'cash',
      ]),
    );
    for (const foreign of RESTAURANT_OR_WMS) {
      expect(mobile).not.toContain(foreign);
    }
  });

  it('klinik tipi de web güzellik alan listesini kullanır', () => {
    expect(mobileFields('clinic')).toEqual(webFields('clinic'));
    expect(mobileFields('clinic')).toEqual(webFields('beauty'));
    expect(mobileFields('clinic')).not.toContain('table');
    expect(mobileFields('clinic')).not.toContain('bin');
  });

  it('restoran klinik randevu alanı açmaz, depo güzellik hizmeti açmaz', () => {
    const restaurant = mobileFields('restaurant');
    expect(restaurant).toEqual(webFields('restaurant'));
    expect(restaurant).toContain('table');
    expect(restaurant).toContain('pos');
    expect(restaurant).not.toContain('appointment');
    expect(restaurant).not.toContain('scale');

    const wms = mobileFields('wms');
    expect(wms).toEqual(webFields('wms'));
    expect(wms).toContain('bin');
    expect(wms).toContain('warehouse');
    expect(wms).not.toContain('service');
    expect(wms).not.toContain('appointment');

    const market = mobileFields('market');
    expect(market).toEqual(webFields('market'));
    expect(market).toContain('pos');
    expect(market).toContain('scale');
    expect(market).not.toContain('appointment');
    expect(market).not.toContain('table');
    expect(market).not.toContain('bin');
  });

  it('firma modülü giriş tipini kilitler, boş firmada kilit yok', () => {
    expect(
      loginBusinessProfile({ enabledModules: ['beauty', 'management'] }),
    ).toEqual({ profile: 'beauty', locked: true });
    expect(
      loginBusinessProfile({
        tenantModule: 'clinic',
        enabledModules: ['beauty', 'management'],
      }).profile,
    ).toBe('clinic');
    expect(loginBusinessProfile({ tenantModule: 'restaurant' })).toEqual({
      profile: 'restaurant',
      locked: true,
    });
    expect(loginBusinessProfile({ enabledModules: ['pos', 'management'] })).toEqual({
      profile: 'market',
      locked: true,
    });
    expect(loginBusinessProfile({ enabledModules: null })).toEqual({
      profile: null,
      locked: false,
    });
  });
});
