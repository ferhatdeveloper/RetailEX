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

  function bridgeApiUrl(path) {
    var p = path.charAt(0) === '/' ? path : '/' + path;
    return window.location.origin + p;
  }

  function cartStorageKey(tenant) {
    return 'retailex_cart_' + tenant;
  }

  function readCart(tenant) {
    try {
      var raw = localStorage.getItem(cartStorageKey(tenant));
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function writeCart(tenant, items) {
    localStorage.setItem(cartStorageKey(tenant), JSON.stringify(items));
    updateCartBadge(tenant);
  }

  function addToCart(tenant, product, qty) {
    var cart = readCart(tenant);
    var amount = qty || 1;
    var existing = cart.find(function (i) {
      return i.code === product.code;
    });
    if (existing) {
      existing.quantity += amount;
      existing.line_total = existing.quantity * existing.price;
    } else {
      cart.push({
        code: product.code,
        name: product.name,
        price: product.price,
        currency: product.currency || 'TRY',
        quantity: amount,
        line_total: amount * product.price,
        product_id: product.id || '',
      });
    }
    writeCart(tenant, cart);
  }

  function cartTotal(cart) {
    return cart.reduce(function (s, i) {
      return s + Number(i.quantity || 0) * Number(i.price || 0);
    }, 0);
  }

  function updateCartBadge(tenant) {
    var count = readCart(tenant).reduce(function (s, i) {
      return s + Number(i.quantity || 0);
    }, 0);
    document.querySelectorAll('.rex-cart-count').forEach(function (el) {
      el.textContent = String(count);
      el.style.display = count > 0 ? 'inline' : 'none';
    });
  }

  function pageKind() {
    var staticSlug = qs('rex_static');
    if (staticSlug === 'sepet') return 'cart';
    if (staticSlug === 'odeme') return 'checkout';
    var path = window.location.pathname || '';
    if (path.indexOf('page-cart') >= 0) return 'cart';
    if (path.indexOf('checkout') >= 0) return 'checkout';
    return qs('rex_page') || 'home';
  }

  async function loadStorefrontConfig(catalogTenant) {
    try {
      var res = await fetch(
        bridgeApiUrl('/api/eticaret/storefront-config?tenant=' + encodeURIComponent(catalogTenant)),
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  async function submitWebOrder(catalogTenant, demoMode, customer, items, paymentProvider) {
    var res = await fetch(bridgeApiUrl('/api/eticaret/submit-order'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        tenant_code: catalogTenant,
        demo_mode: demoMode,
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone,
        shipping_address: customer.address,
        payment_provider: paymentProvider,
        payment_status: 'pending',
        currency: items[0] && items[0].currency ? items[0].currency : 'TRY',
        items: items.map(function (i) {
          return {
            code: i.code,
            name: i.name,
            quantity: i.quantity,
            price: i.price,
            line_total: i.line_total || i.quantity * i.price,
            product_id: i.product_id || '',
          };
        }),
      }),
    });
    var data = await res.json();
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || data.message || 'Sipariş gönderilemedi');
    }
    return data;
  }

  async function initPaymentSession(catalogTenant, order, provider, amount, currency, customer) {
    var res = await fetch(bridgeApiUrl('/api/eticaret/payment/init'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        tenant_code: catalogTenant,
        provider: provider,
        orderId: order.order_id,
        orderNo: order.order_no,
        amount: amount,
        currency: currency,
        customerEmail: customer.email,
        customerName: customer.name,
        returnUrl: tenantBase(qs('rex_tenant')) + '/odeme?success=1',
        cancelUrl: tenantBase(qs('rex_tenant')) + '/odeme?cancel=1',
      }),
    });
    var data = await res.json();
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || data.message || 'Ödeme başlatılamadı');
    }
    return data;
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
      '<button type="button" class="btn btn-primary btn-sm rex-add-cart mt-2" data-code="' +
      p.code +
      '" data-name="' +
      p.name.replace(/"/g, '&quot;') +
      '" data-price="' +
      p.price +
      '" data-currency="' +
      (p.currency || 'TRY') +
      '" data-id="' +
      (p.id || '') +
      '">Sepete Ekle</button>' +
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
    document.querySelectorAll('.rex-add-cart').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var tenant = qs('rex_tenant').trim().toLowerCase();
        addToCart(tenant, {
          code: btn.getAttribute('data-code'),
          name: btn.getAttribute('data-name'),
          price: Number(btn.getAttribute('data-price') || 0),
          currency: btn.getAttribute('data-currency') || 'TRY',
          id: btn.getAttribute('data-id') || '',
        }, 1);
        btn.textContent = 'Eklendi ✓';
        setTimeout(function () {
          btn.textContent = 'Sepete Ekle';
        }, 1200);
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

  function ensureRexPanel(id, title) {
    var existing = document.getElementById(id);
    if (existing) return existing;
    var main = document.querySelector('main') || document.querySelector('.page-wrapper') || document.body;
    var panel = document.createElement('section');
    panel.id = id;
    panel.className = 'container container-1170 py-4';
    panel.innerHTML =
      '<div class="card border rounded p-4" style="max-width:720px;margin:0 auto;">' +
      '<h2 class="h4 mb-3">' +
      title +
      '</h2><div class="rex-panel-body"></div></div>';
    main.prepend(panel);
    return panel;
  }

  function renderCartPage(routeTenant, catalogTenant) {
    var panel = ensureRexPanel('retailex-cart-panel', 'Sepetim');
    var body = panel.querySelector('.rex-panel-body');
    var cart = readCart(routeTenant);
    if (!cart.length) {
      body.innerHTML =
        '<p class="text-muted">Sepetiniz boş.</p>' +
        '<a href="#" class="btn btn-outline-primary rex-back-shop">Alışverişe dön</a>';
      panel.querySelector('.rex-back-shop').addEventListener('click', function (e) {
        e.preventDefault();
        parentNav(tenantBase(routeTenant));
      });
      return;
    }
    var currency = cart[0].currency || 'TRY';
    var rows = cart
      .map(function (i) {
        return (
          '<tr><td>' +
          i.name +
          '</td><td>' +
          i.quantity +
          '</td><td>' +
          formatPrice(i.price, currency) +
          '</td><td>' +
          formatPrice(i.quantity * i.price, currency) +
          '</td></tr>'
        );
      })
      .join('');
    body.innerHTML =
      '<table class="table table-sm"><thead><tr><th>Ürün</th><th>Adet</th><th>Birim</th><th>Toplam</th></tr></thead><tbody>' +
      rows +
      '</tbody></table>' +
      '<p class="fw-bold">Genel toplam: ' +
      formatPrice(cartTotal(cart), currency) +
      '</p>' +
      '<div class="d-flex gap-2 flex-wrap">' +
      '<a href="#" class="btn btn-outline-secondary rex-back-shop">Alışverişe dön</a>' +
      '<a href="#" class="btn btn-primary rex-go-checkout">Ödemeye geç</a>' +
      '<button type="button" class="btn btn-link text-danger rex-clear-cart">Sepeti temizle</button>' +
      '</div>';
    panel.querySelector('.rex-back-shop').addEventListener('click', function (e) {
      e.preventDefault();
      parentNav(tenantBase(routeTenant));
    });
    panel.querySelector('.rex-go-checkout').addEventListener('click', function (e) {
      e.preventDefault();
      parentNav(tenantBase(routeTenant) + '/odeme');
    });
    panel.querySelector('.rex-clear-cart').addEventListener('click', function () {
      writeCart(routeTenant, []);
      renderCartPage(routeTenant, catalogTenant);
    });
  }

  function renderCheckoutPage(routeTenant, catalogTenant, storeConfig) {
    var panel = ensureRexPanel('retailex-checkout-panel', 'Ödeme');
    var body = panel.querySelector('.rex-panel-body');
    var cart = readCart(routeTenant);
    if (!cart.length) {
      body.innerHTML = '<p class="text-muted">Sepet boş — önce ürün ekleyin.</p>';
      return;
    }
    var currency = cart[0].currency || 'TRY';
    var demoMode = Boolean(storeConfig && storeConfig.demoMode);
    var providers = (storeConfig && storeConfig.providers) || [];
    var defaultProvider = (storeConfig && storeConfig.defaultPaymentProvider) || (providers[0] && providers[0].id) || 'swift';
    var providerOptions = providers.length
      ? providers
          .map(function (p) {
            return '<option value="' + p.id + '"' + (p.id === defaultProvider ? ' selected' : '') + '>' + (p.label || p.id) + '</option>';
          })
          .join('')
      : '<option value="swift">SWIFT / Havale</option><option value="iyzico">iyzico</option><option value="stripe">Stripe</option>';

    body.innerHTML =
      (demoMode ? '<div class="alert alert-warning">Demo modu açık — sipariş fişi oluşturulmaz.</div>' : '') +
      '<p>Toplam: <strong>' +
      formatPrice(cartTotal(cart), currency) +
      '</strong></p>' +
      '<form id="rex-checkout-form" class="row g-3">' +
      '<div class="col-12"><label class="form-label">Ad Soyad</label><input class="form-control" name="name" required></div>' +
      '<div class="col-md-6"><label class="form-label">E-posta</label><input type="email" class="form-control" name="email"></div>' +
      '<div class="col-md-6"><label class="form-label">Telefon</label><input class="form-control" name="phone"></div>' +
      '<div class="col-12"><label class="form-label">Teslimat adresi</label><textarea class="form-control" name="address" rows="2"></textarea></div>' +
      '<div class="col-12"><label class="form-label">Ödeme yöntemi</label><select class="form-select" name="payment">' +
      providerOptions +
      '</select></div>' +
      '<div class="col-12"><button type="submit" class="btn btn-primary">Siparişi tamamla</button></div>' +
      '</form><div id="rex-checkout-result" class="mt-3"></div>';

    var form = document.getElementById('rex-checkout-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var customer = {
        name: String(fd.get('name') || ''),
        email: String(fd.get('email') || ''),
        phone: String(fd.get('phone') || ''),
        address: String(fd.get('address') || ''),
      };
      var paymentProvider = String(fd.get('payment') || defaultProvider);
      var resultEl = document.getElementById('rex-checkout-result');
      resultEl.innerHTML = '<span class="text-muted">İşleniyor…</span>';
      submitWebOrder(catalogTenant, demoMode, customer, cart, paymentProvider)
        .then(function (order) {
          if (demoMode) {
            writeCart(routeTenant, []);
            resultEl.innerHTML =
              '<div class="alert alert-success">Demo sipariş alındı: <strong>' +
              order.order_no +
              '</strong></div>';
            return null;
          }
          return initPaymentSession(catalogTenant, order, paymentProvider, cartTotal(cart), currency, customer).then(
            function (pay) {
              writeCart(routeTenant, []);
              if (pay.mode === 'redirect' && pay.redirectUrl) {
                resultEl.innerHTML = '<div class="alert alert-info">Ödeme sayfasına yönlendiriliyorsunuz…</div>';
                window.top.location.href = pay.redirectUrl;
                return;
              }
              resultEl.innerHTML =
                '<div class="alert alert-success">Sipariş oluşturuldu: <strong>' +
                order.order_no +
                '</strong><br>' +
                (pay.message || 'Ödeme talimatı hazır.') +
                (order.sales_fiche_no ? '<br>Sipariş fişi: ' + order.sales_fiche_no : '') +
                '</div>';
            }
          );
        })
        .catch(function (err) {
          resultEl.innerHTML = '<div class="alert alert-danger">' + (err.message || String(err)) + '</div>';
        });
    });
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

  function sortEnabledContent(items) {
    return (items || [])
      .filter(function (i) {
        return i.enabled !== false;
      })
      .sort(function (a, b) {
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      });
  }

  function applyHeroBanner(hero, routeTenant) {
    if (!hero || !hero.imageUrl) return;
    var section = document.querySelector('.halo-block-fullwidth-banner');
    if (!section) return;
    var link = hero.linkUrl || tenantBase(routeTenant);
    var mobile = hero.mobileImageUrl || hero.imageUrl;
    var btn = hero.buttonText || 'İncele';
    section.innerHTML =
      '<div class="container container-full"><div class="halo-block-content"><div class="banner-item">' +
      '<div class="img-box img-box--mobile">' +
      '<a href="#" class="image image-adapt rex-banner-link" data-href="' +
      link +
      '" style="padding-top:38%;display:block;position:relative;overflow:hidden;">' +
      '<img src="' +
      hero.imageUrl +
      '" alt="' +
      (hero.title || '') +
      '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">' +
      '</a>' +
      '<a href="#" class="image image-mobile image-adapt rex-banner-link" data-href="' +
      link +
      '" style="padding-top:136%;display:block;position:relative;overflow:hidden;">' +
      '<img src="' +
      mobile +
      '" alt="' +
      (hero.title || '') +
      '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">' +
      '</a></div>' +
      '<div class="content-box content-box--left content-box--absolute text-center">' +
      (hero.title
        ? '<h3 class="banner-title uppercase"><span class="line"></span><span>' + hero.title + '</span></h3>'
        : '') +
      (hero.subtitle ? '<p class="banner-text desc">' + hero.subtitle + '</p>' : '') +
      '<a href="#" class="banner-button button button-1 rex-banner-link" data-href="' +
      link +
      '"><span class="text text-uppercase">' +
      btn +
      '</span></a></div></div></div></div>';
    section.querySelectorAll('.rex-banner-link').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var path = a.getAttribute('data-href');
        if (path) parentNav(path);
      });
    });
  }

  function applyStripBanners(strips, routeTenant) {
    if (!strips || !strips.length) return;
    var row = document.querySelector('.halo-block-sub-banner .row');
    if (!row) return;
    row.innerHTML = strips
      .slice(0, 3)
      .map(function (b) {
        var link = b.linkUrl || tenantBase(routeTenant);
        return (
          '<div class="halo-row-item col-12 col-sm-4"><div class="sub-banner banner-item animate-scale">' +
          '<div class="img-box"><a href="#" class="image image-adapt rex-banner-link" data-href="' +
          link +
          '" style="padding-top:54%;display:block;position:relative;overflow:hidden;">' +
          '<img src="' +
          b.imageUrl +
          '" alt="' +
          (b.title || '') +
          '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">' +
          '</a></div>' +
          (b.title
            ? '<div class="content-box content-box--absolute text-center"><h3 class="banner-title" style="color:' +
              (b.textColor || '#fff') +
              '"><a href="#" class="link_title rex-banner-link" data-href="' +
              link +
              '"><span class="text">' +
              b.title +
              '</span></a></h3></div>'
            : '') +
          '</div></div>'
        );
      })
      .join('');
    row.querySelectorAll('.rex-banner-link').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var path = a.getAttribute('data-href');
        if (path) parentNav(path);
      });
    });
  }

  function applySlider(slides, routeTenant) {
    var enabled = sortEnabledContent(slides);
    if (!enabled.length) return;
    var main = document.querySelector('main');
    if (!main) return;
    var existing = document.getElementById('retailex-slider');
    if (existing) existing.remove();
    var html =
      '<section id="retailex-slider" class="halo-block" style="margin-bottom:0"><div class="retailex-slick">';
    enabled.forEach(function (s) {
      var link = s.linkUrl || tenantBase(routeTenant);
      html +=
        '<div class="rex-slide" style="position:relative;min-height:320px;background:#111;">' +
        '<img src="' +
        s.imageUrl +
        '" alt="' +
        (s.title || '') +
        '" style="width:100%;max-height:480px;object-fit:cover;display:block;">' +
        '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.25);color:#fff;text-align:center;padding:24px;">' +
        (s.title ? '<h2 style="color:#fff;margin:0 0 8px">' + s.title + '</h2>' : '') +
        (s.subtitle ? '<p style="max-width:520px">' + s.subtitle + '</p>' : '') +
        (s.buttonText
          ? '<a href="#" class="button button-1 rex-banner-link" data-href="' +
            link +
            '" style="margin-top:12px"><span class="text">' +
            s.buttonText +
            '</span></a>'
          : '') +
        '</div></div>';
    });
    html += '</div></section>';
    main.insertAdjacentHTML('afterbegin', html);
    document.querySelectorAll('#retailex-slider .rex-banner-link').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var path = a.getAttribute('data-href');
        if (path) parentNav(path);
      });
    });
    if (window.jQuery && window.jQuery.fn.slick && enabled.length > 1) {
      window.jQuery('#retailex-slider .retailex-slick').slick({
        dots: true,
        arrows: true,
        autoplay: true,
        autoplaySpeed: 5000,
        fade: true,
      });
    }
  }

  function applyBanners(banners, routeTenant) {
    var enabled = sortEnabledContent(banners);
    var hero = enabled.filter(function (b) {
      return b.placement === 'hero';
    })[0];
    var strips = enabled.filter(function (b) {
      return b.placement === 'strip';
    });
    applyHeroBanner(hero, routeTenant);
    applyStripBanners(strips, routeTenant);
  }

  function mergeFeaturedAndCampaigns(products, config) {
    if (!config) return products;
    var featured = sortEnabledContent(config.featuredProducts || []);
    var campaigns = sortEnabledContent(config.campaigns || []);
    var badgeMap = {};
    var now = new Date();

    campaigns.forEach(function (c) {
      var startOk = !c.startDate || new Date(c.startDate) <= now;
      var endOk = !c.endDate || new Date(c.endDate) >= now;
      if (!startOk || !endOk) return;
      var badge = c.badge || (c.discountPercent ? '%' + c.discountPercent : '');
      if (!badge) return;
      if (!c.productCodes || !c.productCodes.length) {
        products.forEach(function (p) {
          badgeMap[p.code] = badge;
        });
      } else {
        c.productCodes.forEach(function (code) {
          badgeMap[code] = badge;
        });
      }
    });

    featured.forEach(function (f) {
      if (f.badge) badgeMap[f.productCode] = f.badge;
    });

    products = products.map(function (p) {
      if (badgeMap[p.code]) p.badge = badgeMap[p.code];
      return p;
    });

    var featuredCodes = featured.map(function (f) {
      return f.productCode;
    });
    if (!featuredCodes.length) return products;

    var featuredList = [];
    var rest = [];
    products.forEach(function (p) {
      if (featuredCodes.indexOf(p.code) >= 0) featuredList.push(p);
      else rest.push(p);
    });
    featuredList.sort(function (a, b) {
      return featuredCodes.indexOf(a.code) - featuredCodes.indexOf(b.code);
    });
    return featuredList.concat(rest);
  }

  function applyStorefrontContent(config, routeTenant) {
    if (!config) return;
    applySlider(config.sliders || [], routeTenant);
    applyBanners(config.banners || [], routeTenant);
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
    var storeConfig = await loadStorefrontConfig(catalogTenant);
    var title = (storeConfig && storeConfig.storeTitle) || qs('rex_title') || readSettings().storeTitle || 'Online Mağaza';
    var announce =
      (storeConfig && storeConfig.announcementText) || qs('rex_announce') || readSettings().announcementText || '';

    injectVariantCss(variantId);
    patchAnnouncement(announce);
    patchHeaderTitle(title, routeTenant);
    updateCartBadge(routeTenant);

    document.documentElement.classList.add('rex-eticaret-vitrin');
    document.body.style.background = '#fff';

    var kind = pageKind();
    if (kind === 'cart') {
      renderCartPage(routeTenant, catalogTenant);
      return;
    }
    if (kind === 'checkout') {
      renderCheckoutPage(routeTenant, catalogTenant, storeConfig);
      return;
    }

    if (kind === 'home' || kind === 'category' || !kind) {
      applyStorefrontContent(storeConfig, routeTenant);
      var products = await fetchCatalog(catalogTenant);
      products = mergeFeaturedAndCampaigns(products, storeConfig);
      renderProducts(products, routeTenant);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
