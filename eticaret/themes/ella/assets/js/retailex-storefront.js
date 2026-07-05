/**
 * RetailEX — Ella vitrin köprüsü (ERP CSS'sinden bağımsız, saf HTML içinde çalışır).
 * URL: ?rex_tenant=lovan&rex_variant=ella-classic&rex_page=home
 */
(function () {
  'use strict';

  var PLACEHOLDER_IMG = './assets/images/card-product/img-14.jpg';
  var PLACEHOLDER_HOVER = './assets/images/card-product/img-13.jpg';
  var API_ORIGIN = 'https://api.retailex.app';

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name) || '';
  }

  function readSettings() {
    try {
      var raw = localStorage.getItem('retailex_eticaret_settings');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function rewriteApiUrl(url) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      try {
        var u = new URL(url);
        if (u.hostname === 'api.retailex.app') {
          return window.location.origin + '/__retailex-api' + u.pathname + u.search;
        }
      } catch (e) {}
    }
    return url;
  }

  function formatPrice(amount, currency) {
    try {
      return Number(amount).toLocaleString('tr-TR', { style: 'currency', currency: currency || 'TRY' });
    } catch (e) {
      return String(amount) + ' ' + (currency || 'TRY');
    }
  }

  function parentNav(path) {
    if (window.parent && window.parent !== window) {
      window.parent.location.href = path;
    } else {
      window.location.href = path;
    }
  }

  function tenantBase(tenant) {
    return '/magaza/' + encodeURIComponent(tenant);
  }

  function resolveCatalogTenant(routeTenant) {
    var settings = readSettings();
    if (qs('rex_demo') === '1' && qs('rex_demo_tenant')) {
      return qs('rex_demo_tenant').trim().toLowerCase();
    }
    if (settings.demoMode && settings.demoTenantCode) {
      return String(settings.demoTenantCode).trim().toLowerCase();
    }
    return routeTenant;
  }

  function injectVariantCss(variantId) {
    var map = {
      'ella-classic': ['./assets/sass/demos/demo-1/demo-1.css'],
      'ella-fashion': [
        './assets/sass/skins/skin-2/skin-2.css',
        './assets/sass/demos/demo-2/demo-2.css',
        './assets/sass/base/header/header-2/header-2.css',
        './assets/sass/base/footer/footer-2/footer-2.css',
      ],
      'ella-trendy': ['./assets/sass/skins/skin-3/skin-3.css', './assets/sass/demos/demo-3/demo-3.css'],
      'ella-beauty': ['./assets/sass/skins/skin-4/skin-4.css', './assets/sass/demos/demo-4/demo-4.css'],
      'ella-jewelry': ['./assets/sass/skins/skin-5/skin-5.css', './assets/sass/demos/demo-5/demo-5.css'],
      'ella-shoes': ['./assets/sass/skins/skin-6/skin-6.css', './assets/sass/demos/demo-6/demo-6.css'],
      'ella-auto': ['./assets/sass/skins/skin-7/skin-7.css', './assets/sass/demos/demo-7/demo-7.css'],
      'ella-pet': ['./assets/sass/skins/skin-8/skin-8.css', './assets/sass/demos/demo-8/demo-8.css'],
      'ella-surf': ['./assets/sass/skins/skin-9/skin-9.css', './assets/sass/demos/demo-9/demo-9.css'],
      'ella-electronic': ['./assets/sass/skins/skin-10/skin-10.css', './assets/sass/demos/demo-10/demo-10.css'],
    };
    var skinMap = {
      'ella-classic': 'skin-1',
      'ella-fashion': 'skin-2',
      'ella-trendy': 'skin-3',
      'ella-beauty': 'skin-4',
      'ella-jewelry': 'skin-5',
      'ella-shoes': 'skin-6',
      'ella-auto': 'skin-7',
      'ella-pet': 'skin-8',
      'ella-surf': 'skin-9',
      'ella-electronic': 'skin-10',
    };
    var skin = skinMap[variantId] || 'skin-1';
    document.body.className = document.body.className.replace(/\bskin-\d+\b/g, '').trim();
    document.body.classList.add('template-index', skin);

    (map[variantId] || map['ella-classic']).forEach(function (href) {
      if (document.querySelector('link[data-rex-variant="' + href + '"]')) return;
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.setAttribute('data-rex-variant', href);
      document.head.appendChild(link);
    });
  }

  function patchAnnouncement(text) {
    if (!text) return;
    var el = document.querySelector('.announcement-bar .message');
    if (el) el.textContent = text;
  }

  function patchHeaderTitle(title, tenant) {
    var logo = document.querySelector('.header__heading-link img');
    if (logo && title) logo.alt = title;
    var svc = document.querySelector('.customer-service-text');
    if (svc && title) svc.innerHTML = title + ' · <span>' + tenant + '</span>';
  }

  function productCardHtml(p, tenant) {
    var href = tenantBase(tenant) + '/urun/' + encodeURIComponent(p.code);
    var price = formatPrice(p.price, p.currency);
    var badge = p.badge
      ? '<span class="badge badge-sale" style="position:absolute;top:8px;left:8px;z-index:2;">' + p.badge + '</span>'
      : '';
    return (
      '<div class="halo-row-item product-item col-6 col-md-4 col-lg-3">' +
      '<div class="product-card">' +
      '<div class="product-card-top">' +
      '<div class="product-card-media">' +
      '<a href="#" class="animate-scale image image-adapt rex-product-link" data-href="' +
      href +
      '" style="padding-bottom:133.33%;display:block;position:relative;overflow:hidden;">' +
      badge +
      '<img src="' +
      (p.imageUrl || PLACEHOLDER_IMG) +
      '" alt="' +
      p.name +
      '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">' +
      '<img src="' +
      (p.hoverImageUrl || PLACEHOLDER_HOVER) +
      '" alt="' +
      p.name +
      '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .3s;">' +
      '</a></div></div>' +
      '<div class="product-card-bottom"><div class="product-card-information text-center">' +
      '<div class="card-vendor">' +
      (p.vendor || '') +
      '</div>' +
      '<a href="#" class="card-title link-underline rex-product-link" data-href="' +
      href +
      '"><span class="text">' +
      p.name +
      '</span></a>' +
      '<div class="card-price"><span class="price">' +
      price +
      '</span></div>' +
      '</div></div></div></div>'
    );
  }

  function bindProductLinks() {
    document.querySelectorAll('.rex-product-link').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var path = a.getAttribute('data-href');
        if (path) parentNav(path);
      });
    });
  }

  function renderProducts(products, tenant) {
    var grid =
      document.querySelector('#retailex-products-grid .row') ||
      document.querySelector('.halo-product-block .halo-block-content .row') ||
      document.querySelector('.halo-product-block .row');

    if (!grid) {
      var section = document.createElement('section');
      section.className = 'halo-block halo-product-block';
      section.id = 'retailex-products-grid';
      section.innerHTML =
        '<div class="container container-1170">' +
        '<div class="halo-block-header text-center"><h3 class="title uppercase"><span class="text">Ürünler</span></h3></div>' +
        '<div class="halo-block-content"><div class="row"></div></div></div>';
      var main = document.querySelector('main') || document.querySelector('.page-wrapper');
      if (main) main.prepend(section);
      grid = section.querySelector('.row');
    }

    if (!grid) return;

    grid.innerHTML = products.map(function (p) {
      return productCardHtml(p, tenant);
    }).join('');
    bindProductLinks();
  }

  function mapRow(row, currency) {
    if (row.is_active === false) return null;
    var id = String(row.id || row.code || '').trim();
    var name = String(row.name || '').trim();
    if (!id || !name) return null;
    var price = Number(row.price || 0) || 0;
    return {
      id: id,
      code: String(row.code || row.barcode || id),
      name: name,
      price: price,
      currency: String(row.currency || currency || 'TRY'),
      imageUrl: String(row.image_url_cdn || row.image_url || '').trim() || PLACEHOLDER_IMG,
      hoverImageUrl: PLACEHOLDER_HOVER,
      vendor: String(row.brand || 'RetailEX').trim(),
      badge: null,
    };
  }

  async function fetchJson(url) {
    var res = await fetch(rewriteApiUrl(url), { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    var data = await res.json();
    return Array.isArray(data) ? data : null;
  }

  async function fetchCatalog(catalogTenant) {
    var restBase = API_ORIGIN + '/' + encodeURIComponent(catalogTenant);
    var currency = 'TRY';
    var firmCandidates = ['001', '1', '01'];

    try {
      var sysRows = await fetchJson(restBase + '/system_settings?id=eq.1&select=primary_firm_nr,default_currency&limit=1');
      if (sysRows && sysRows[0]) {
        if (sysRows[0].primary_firm_nr) {
          var f = String(sysRows[0].primary_firm_nr).trim();
          firmCandidates = [f.padStart(3, '0'), f, '001', '1'];
        }
        if (sysRows[0].default_currency) currency = String(sysRows[0].default_currency);
      }
    } catch (e) {}

    for (var i = 0; i < firmCandidates.length; i++) {
      var firm = firmCandidates[i].padStart(3, '0').slice(0, 10);
      var table = 'rex_' + firm + '_products';
      var url =
        restBase +
        '/' +
        table +
        '?is_active=eq.true&select=id,code,name,price,image_url,image_url_cdn,stock,brand,currency&order=code.asc&limit=24';
      var rows = await fetchJson(url);
      if (rows && rows.length) {
        var products = rows.map(function (r) {
          return mapRow(r, currency);
        }).filter(Boolean);
        if (products.length) return products;
      }
    }

    var label = catalogTenant.toUpperCase();
    return Array.from({ length: 8 }, function (_, idx) {
      return {
        id: 'demo-' + idx,
        code: label + '-' + String(idx + 1).padStart(3, '0'),
        name: label + ' Ürün ' + (idx + 1),
        price: 199 + idx * 50,
        currency: 'TRY',
        imageUrl: PLACEHOLDER_IMG,
        hoverImageUrl: PLACEHOLDER_HOVER,
        vendor: label,
        badge: idx === 0 ? 'Yeni' : null,
      };
    });
  }

  async function init() {
    var routeTenant = qs('rex_tenant').trim().toLowerCase();
    if (!routeTenant) return;

    var variantId = qs('rex_variant') || 'ella-classic';
    var catalogTenant = resolveCatalogTenant(routeTenant);
    var title = qs('rex_title') || readSettings().storeTitle || 'Online Mağaza';
    var announce = qs('rex_announce') || readSettings().announcementText || '';

    injectVariantCss(variantId);
    patchAnnouncement(announce);
    patchHeaderTitle(title, routeTenant);

    document.documentElement.classList.add('rex-eticaret-vitrin');
    document.body.style.background = '#fff';

    if (qs('rex_page') === 'home' || qs('rex_page') === 'category' || !qs('rex_page')) {
      var products = await fetchCatalog(catalogTenant);
      renderProducts(products, routeTenant);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
