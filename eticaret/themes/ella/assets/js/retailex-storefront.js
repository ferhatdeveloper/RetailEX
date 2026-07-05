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
    if (window.__rexRouteTenant && window.__rexStoreConfig) {
      renderSideCart(tenant, window.__rexRouteTenant, window.__rexStoreConfig);
    }
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
    document.querySelectorAll('.rex-cart-count, [data-cart-count]').forEach(function (el) {
      el.textContent = String(count);
      el.style.display = count > 0 ? 'inline' : 'none';
    });
  }

  var DEFAULT_FEATURES = {
    megaMenu: true,
    quickShop: true,
    instantSearch: true,
    sideCart: true,
    mobileToolbar: true,
    gdprCookie: true,
    askExpert: false,
    recentSalesPopup: false,
    newsletterPopup: false,
    beforeYouLeave: false,
    lookbook: true,
    shippingThreshold: true,
    quickView: true,
    stickyHeader: true,
  };

  function getFeatures(config) {
    return Object.assign({}, DEFAULT_FEATURES, (config && config.storefrontFeatures) || {});
  }

  function linkHref(link, routeTenant) {
    if (link.type === 'external') return link.url || '#';
    if (link.type === 'page') return tenantBase(routeTenant) + '/sayfa/' + encodeURIComponent(link.pageSlug || '');
    var path = link.path || '';
    return tenantBase(routeTenant) + (path ? '/' + path.replace(/^\/+/, '') : '');
  }

  function badgeHtml(item) {
    if (!item.badge) return '';
    var cls = item.badgeStyle === 'hot' ? 'hot-label' : item.badgeStyle === 'sale' ? 'sale-label' : 'new-label';
    return '<span class="label ' + cls + '">' + item.badge + '</span>';
  }

  function renderMenuLinkList(links, routeTenant, linkClass) {
    return sortEnabledContent(links || [])
      .map(function (link) {
        var href = linkHref(link, routeTenant);
        return (
          '<li><a href="#" class="' +
          (linkClass || 'site-nav-link link link-underline rex-nav-link') +
          '" data-href="' +
          href +
          '"><span class="text">' +
          link.label +
          '</span></a></li>'
        );
      })
      .join('');
  }

  function renderMenuItemHtml(item, routeTenant) {
    var style = item.menuStyle || (item.megaColumns && item.megaColumns.length ? 'mega' : item.children && item.children.length ? 'dropdown' : 'simple');
    var badge = badgeHtml(item);
    if (style === 'mega' && item.megaColumns && item.megaColumns.length) {
      var cols = sortEnabledContent(item.megaColumns)
        .map(function (col) {
          return (
            '<div class="halo-row-item site-nav dropdown col-12 col-lg-3"><div class="site-nav-list">' +
            '<span class="site-nav-title uppercase"><span class="text">' +
            col.title +
            '</span></span>' +
            '<ul class="list-unstyled">' +
            renderMenuLinkList(col.links, routeTenant) +
            '</ul></div></div>'
          );
        })
        .join('');
      return (
        '<li class="menu-lv-item menu-lv-1 text-left has-megamenu dropdown block_layout--custom_width">' +
        '<a href="#" class="menu-lv-1__action header__menu-item list-menu__item link focus-inset menu_mobile_link rex-nav-parent">' +
        '<span class="text">' +
        item.label +
        '</span>' +
        badge +
        '</a>' +
        '<div class="menu-dropdown custom-scrollbar megamenu_' +
        (item.megaLayout || 'style_2') +
        '"><div class="container container-1170">' +
        '<div class="menu-dropdown__wrapper"><div class="row">' +
        cols +
        '</div></div></div></div></li>'
      );
    }
    if (style === 'dropdown' && item.children && item.children.length) {
      return (
        '<li class="menu-lv-item menu-lv-1 text-left no-megamenu dropdown">' +
        '<a href="#" class="menu-lv-1__action header__menu-item list-menu__item link link-underline rex-nav-parent">' +
        '<span class="text">' +
        item.label +
        '</span>' +
        badge +
        '</a>' +
        '<ul class="menu-dropdown list-menu list-menu--disclosure">' +
        renderMenuLinkList(item.children, routeTenant, 'menu-lv-2__action header__menu-item list-menu__item link link-underline rex-nav-link') +
        '</ul></li>'
      );
    }
    var href = menuItemHref(item, routeTenant);
    return (
      '<li class="menu-lv-item menu-lv-1 text-left">' +
      '<a href="#" class="menu-lv-1__action rex-nav-link" data-href="' +
      href +
      '"><span class="text">' +
      item.label +
      '</span>' +
      badge +
      '</a></li>'
    );
  }

  function bindNavLinks(root) {
    (root || document).querySelectorAll('.rex-nav-link').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var path = a.getAttribute('data-href');
        if (path) parentNav(path);
      });
    });
  }

  function renderSideCart(tenant, routeTenant, config) {
    var features = getFeatures(config);
    if (!features.sideCart) return;
    var list = document.querySelector('#halo-cart-sidebar .previewCartList');
    if (!list) return;
    var cart = readCart(tenant);
    if (!cart.length) {
      list.innerHTML = '<li class="previewCartItem clearfix"><p class="text-muted px-3">Sepetiniz boş.</p></li>';
      updateShippingThreshold(tenant, config);
      return;
    }
    var currency = cart[0].currency || 'TRY';
    list.innerHTML = cart
      .map(function (i, idx) {
        return (
          '<li class="previewCartItem clearfix" data-rex-line="' +
          idx +
          '">' +
          '<div class="previewCartItem-content" style="width:100%">' +
          '<a href="#" class="previewCartItem-name link-underline rex-product-link" data-href="' +
          tenantBase(routeTenant) +
          '/urun/' +
          encodeURIComponent(i.code) +
          '"><span class="text">' +
          i.name +
          '</span></a>' +
          '<div class="previewCartItem-change">' +
          '<div class="previewCartItem-price"><span class="price"><span class="money">' +
          formatPrice(i.price, currency) +
          '</span></span></div>' +
          '<div class="previewCartItem-qty">' +
          '<a href="#" class="minus btn-quantity rex-cart-minus" data-idx="' +
          idx +
          '"></a>' +
          '<input class="form-input quantity" value="' +
          i.quantity +
          '" readonly>' +
          '<a href="#" class="plus btn-quantity rex-cart-plus" data-idx="' +
          idx +
          '"></a>' +
          '</div></div></div>' +
          '<a href="#" class="previewCartItem-remove rex-cart-remove" data-idx="' +
          idx +
          '">×</a></li>'
        );
      })
      .join('');
    bindProductLinks();
    wireSideCartControls(tenant, routeTenant, config);
    updateShippingThreshold(tenant, config);
  }

  function updateShippingThreshold(tenant, config) {
    var features = getFeatures(config);
    var block = document.querySelector('#halo-cart-sidebar .haloCalculatorShipping');
    if (!block) return;
    if (!features.shippingThreshold) {
      block.style.display = 'none';
      return;
    }
    block.style.display = '';
    var threshold = Number((config && config.freeShippingThreshold) || 500);
    var total = cartTotal(readCart(tenant));
    var pct = threshold > 0 ? Math.min(100, Math.round((total / threshold) * 100)) : 100;
    var remaining = Math.max(0, threshold - total);
    var meter = block.querySelector('.progress-meter');
    if (meter) {
      meter.style.width = pct + '%';
      meter.textContent = pct + '%';
    }
    var msg = block.querySelector('[data-shipping-message]');
    if (msg) {
      if (remaining <= 0) {
        msg.innerHTML = '<span class="text">Ücretsiz kargo kazandınız!</span>';
      } else {
        msg.innerHTML =
          '<span>Ücretsiz kargo için </span><span class="money">' +
          formatPrice(remaining, 'TRY') +
          '</span><span> kaldı</span>';
      }
    }
  }

  function wireSideCartControls(tenant, routeTenant, config) {
    document.querySelectorAll('.rex-cart-minus').forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        var idx = Number(btn.getAttribute('data-idx'));
        var cart = readCart(tenant);
        if (cart[idx]) {
          cart[idx].quantity = Math.max(1, cart[idx].quantity - 1);
          cart[idx].line_total = cart[idx].quantity * cart[idx].price;
          writeCart(tenant, cart);
          renderSideCart(tenant, routeTenant, config);
        }
      };
    });
    document.querySelectorAll('.rex-cart-plus').forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        var idx = Number(btn.getAttribute('data-idx'));
        var cart = readCart(tenant);
        if (cart[idx]) {
          cart[idx].quantity += 1;
          cart[idx].line_total = cart[idx].quantity * cart[idx].price;
          writeCart(tenant, cart);
          renderSideCart(tenant, routeTenant, config);
        }
      };
    });
    document.querySelectorAll('.rex-cart-remove').forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        var idx = Number(btn.getAttribute('data-idx'));
        var cart = readCart(tenant).filter(function (_, i) {
          return i !== idx;
        });
        writeCart(tenant, cart);
        renderSideCart(tenant, routeTenant, config);
      };
    });
  }

  function wireSideCartOpen(tenant, routeTenant, config) {
    var features = getFeatures(config);
    if (!features.sideCart) return;
    document.querySelectorAll('[data-open-cart-sidebar]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTimeout(function () {
          renderSideCart(tenant, routeTenant, config);
        }, 50);
      });
    });
    renderSideCart(tenant, routeTenant, config);
  }

  function openQuickShop(product, tenant) {
    var popup = document.getElementById('data-quickshop-popup');
    if (!popup) return;
    var img = popup.querySelector('.halo-productView-left img');
    if (img) img.src = product.imageUrl || PLACEHOLDER_IMG;
    var title = popup.querySelector('.product-title .text');
    if (title) title.textContent = product.name;
    var priceEl = popup.querySelector('.card-price .money, .price-item--regular .money');
    if (priceEl) priceEl.textContent = formatPrice(product.price, product.currency || 'TRY');
    var variants = popup.querySelector('.productView-variants');
    if (variants) variants.style.display = 'none';
    var btn = popup.querySelector('[data-btn-quickShop-addtocart]');
    if (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        addToCart(tenant, product, 1);
        document.body.classList.remove('quickshop-popup-show');
        if (document.body.classList.contains('cart-sidebar-show')) {
          renderSideCart(tenant, qs('rex_tenant'), window.__rexStoreConfig);
        }
      };
    }
    document.body.classList.add('quickshop-popup-show');
  }

  function wireQuickShop(tenant, catalogTenant, config) {
    var features = getFeatures(config);
    if (!features.quickShop) return;
    document.addEventListener(
      'click',
      function (e) {
        var btn = e.target.closest('.rex-quickshop');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        openQuickShop(
          {
            code: btn.getAttribute('data-code'),
            name: btn.getAttribute('data-name'),
            price: Number(btn.getAttribute('data-price') || 0),
            currency: btn.getAttribute('data-currency') || 'TRY',
            id: btn.getAttribute('data-id') || '',
            imageUrl: btn.getAttribute('data-image') || PLACEHOLDER_IMG,
          },
          tenant,
        );
      },
      true,
    );
  }

  var searchTimer = null;
  function wireInstantSearch(catalogTenant, routeTenant, config) {
    var features = getFeatures(config);
    if (!features.instantSearch) return;
    var suggestions = (config && config.searchSuggestions) || [];
    document.querySelectorAll('.search-block.header-search__trending .list-item').forEach(function (ul) {
      if (!suggestions.length) return;
      ul.innerHTML = suggestions
        .map(function (term) {
          return (
            '<li class="item"><a href="#" class="link rex-search-term" data-term="' +
            term +
            '"><span class="text">' +
            term +
            '</span></a></li>'
          );
        })
        .join('');
    });
    document.querySelectorAll('.rex-search-term').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var term = a.getAttribute('data-term');
        var input = document.querySelector('.header-search__input');
        if (input && term) {
          input.value = term;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });

    function renderSearchProducts(products, container) {
      if (!container) return;
      var row = container.querySelector('.row') || container;
      if (!products.length) {
        row.innerHTML = '<div class="col-12"><p class="text-muted">Sonuç bulunamadı.</p></div>';
        return;
      }
      row.innerHTML = products
        .slice(0, 6)
        .map(function (p) {
          return (
            '<div class="halo-row-item product-item col-6 col-sm-4"><div class="product-card">' +
            '<a href="#" class="rex-product-link" data-href="' +
            tenantBase(routeTenant) +
            '/urun/' +
            encodeURIComponent(p.code) +
            '"><img src="' +
            (p.imageUrl || PLACEHOLDER_IMG) +
            '" alt="' +
            p.name +
            '" style="width:100%;border-radius:4px;"></a>' +
            '<p class="mt-2 mb-0"><a href="#" class="rex-product-link" data-href="' +
            tenantBase(routeTenant) +
            '/urun/' +
            encodeURIComponent(p.code) +
            '">' +
            p.name +
            '</a></p>' +
            '<span>' +
            formatPrice(p.price, p.currency || 'TRY') +
            '</span></div></div>'
          );
        })
        .join('');
      bindProductLinks();
    }

    async function runSearch(term, resultWrap) {
      if (!term || term.length < 2) return;
      try {
        var res = await fetch(
          bridgeApiUrl('/api/eticaret/catalog?tenant=' + encodeURIComponent(catalogTenant) + '&search=' + encodeURIComponent(term) + '&limit=8'),
          { headers: { Accept: 'application/json' } },
        );
        if (!res.ok) return;
        var data = await res.json();
        renderSearchProducts(data.products || [], resultWrap);
      } catch (e) {}
    }

    document.querySelectorAll('.header-search__input').forEach(function (input) {
      input.addEventListener('input', function () {
        var term = input.value.trim();
        var wrap = input.closest('.header-search') && input.closest('.header-search').querySelector('.quickSearchProduct');
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          runSearch(term, wrap);
        }, 300);
      });
    });
  }

  function applyFeatureToggles(config) {
    var f = getFeatures(config);
    function hide(sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        el.style.display = 'none';
      });
    }
    if (!f.gdprCookie) hide('.halo-accept-cookie-popup');
    if (!f.recentSalesPopup) hide('.halo-notification-popup');
    if (!f.askExpert) hide('[data-open-ask-an-expert], .halo-ask-an-expert-popup');
    if (!f.newsletterPopup) hide('.halo-newsletter-popup');
    if (!f.beforeYouLeave) hide('[data-open-before-you-leave], .halo-before-you-leave');
    if (!f.mobileToolbar) hide('#halo-toolbar-bottom-mobile, .halo-toolbar-bottom-mobile');
    if (!f.quickView) hide('[data-open-quick-view-popup], .halo-quick-view-popup');
    if (!f.lookbook) {
      document.querySelectorAll('a[href*="lookbook"]').forEach(function (a) {
        a.style.display = 'none';
      });
    }
    if (!f.stickyHeader) {
      document.querySelectorAll('[data-header-sticky]').forEach(function (el) {
        el.removeAttribute('data-header-sticky');
      });
    }
    if (!f.sideCart) {
      hide('#halo-cart-sidebar, [data-open-cart-sidebar]');
    }
  }

  function applyMobileNavigation(config, routeTenant) {
    if (!config || !config.menuItems || !config.menuItems.length) return;
    var items = sortEnabledContent(config.menuItems);
    var mobileRoot = document.querySelector('#menu-mobile .site-nav-mobile, .site-nav-mobile');
    if (!mobileRoot) return;
    mobileRoot.innerHTML = items
      .map(function (item) {
        return (
          '<li class="menu-lv-item menu-lv-1"><a href="#" class="menu-lv-1__action menu_mobile_link rex-nav-link" data-href="' +
          menuItemHref(item, routeTenant) +
          '"><span class="text">' +
          item.label +
          '</span></a></li>'
        );
      })
      .join('');
    bindNavLinks(mobileRoot);
  }

  function pruneEllaDemoBlocks() {
    var demoSelectors = [
      '.halo-block-spotlight',
      '.halo-block-brands',
      '.halo-block-instagram',
      '.halo-block-custom-image-banner:not(.halo-block-fullwidth-banner):not(.halo-block-sub-banner)',
    ];
    demoSelectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        el.style.display = 'none';
      });
    });
    document.querySelectorAll('.halo-product-block').forEach(function (el, idx) {
      if (el.id === 'retailex-products-grid') return;
      if (idx > 0 && !el.id) el.style.display = 'none';
    });
  }

  function gridColClass(cols) {
    if (cols === 2) return 'col-6 col-md-6 col-lg-6';
    if (cols === 3) return 'col-6 col-md-4 col-lg-4';
    return 'col-6 col-md-4 col-lg-3';
  }

  function applyThemeBranding(config) {
    if (!config || !config.themeBranding) return;
    var b = config.themeBranding;
    var style = document.getElementById('rex-theme-branding');
    if (!style) {
      style = document.createElement('style');
      style.id = 'rex-theme-branding';
      document.head.appendChild(style);
    }
    var css = ':root{';
    if (b.primaryColor) css += '--rex-primary:' + b.primaryColor + ';';
    if (b.accentColor) css += '--rex-accent:' + b.accentColor + ';';
    css += '}';
    if (b.primaryColor) {
      css += '.btn-primary,.button-1{background-color:' + b.primaryColor + '!important;border-color:' + b.primaryColor + '!important;}';
    }
    if (b.accentColor) {
      css += '.badge-sale,.sale-label{background-color:' + b.accentColor + '!important;}';
    }
    if (b.customCss) css += b.customCss;
    style.textContent = css;
  }

  function applySeoMeta(config) {
    if (!config) return;
    if (config.seoDescription) {
      var meta = document.querySelector('meta[name="description"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'description');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', config.seoDescription);
    }
    if (config.faviconUrl) {
      var link = document.querySelector('link[rel="icon"]') || document.createElement('link');
      link.setAttribute('rel', 'icon');
      link.setAttribute('href', config.faviconUrl);
      if (!link.parentNode) document.head.appendChild(link);
    }
  }

  function applyContactAndSocial(config, routeTenant) {
    if (!config) return;
    var contact = config.contactInfo || {};
    if (contact.phone || contact.email || contact.address) {
      document.querySelectorAll('.list-social-2 .list-social__info .text').forEach(function (el, idx) {
        var vals = [contact.phone, contact.email, contact.address, contact.hours];
        if (vals[idx]) el.textContent = vals[idx];
      });
      var svc = document.querySelector('.customer-service-text');
      if (svc && contact.phone) {
        svc.innerHTML = (contact.phone || '') + (contact.email ? ' · ' + contact.email : '');
      }
    }
    var links = sortEnabledContent(config.socialLinks || []);
    if (links.length) {
      document.querySelectorAll('.list-social.clearfix, .footer-block__list-social ul').forEach(function (ul) {
        ul.innerHTML = links
          .map(function (l) {
            return (
              '<li class="list-social__item"><a href="' +
              l.url +
              '" class="link link--text list-social__link" target="_blank" rel="noopener"><span class="text">' +
              (l.label || l.platform) +
              '</span></a></li>'
            );
          })
          .join('');
      });
    }
    var nl = config.newsletter || {};
    if (nl.footerTitle) {
      var ft = document.querySelector('.footer-block__newsletter .footer-block__heading, .footer-newsletter-title');
      if (ft) ft.textContent = nl.footerTitle;
    }
    if (nl.footerSubtitle) {
      var fs = document.querySelector('.footer-block__newsletter .footer-block__text, .footer-newsletter-desc');
      if (fs) fs.textContent = nl.footerSubtitle;
    }
  }

  function applyPopupContent(config) {
    if (!config) return;
    var nl = config.newsletter || {};
    var popup = document.querySelector('.halo-newsletter-popup');
    if (popup && nl.title) {
      var h = popup.querySelector('.newsletter-popup-title, .popup-title');
      if (h) h.textContent = nl.title;
      var sub = popup.querySelector('.newsletter-popup-desc, .popup-desc');
      if (sub && nl.subtitle) sub.textContent = nl.subtitle;
      var img = popup.querySelector('.newsletter-popup-image img, .img-newsletter img');
      if (img && nl.imageUrl) img.src = nl.imageUrl;
      if (nl.delayMs) popup.setAttribute('data-delay', String(nl.delayMs));
      var btn = popup.querySelector('[type="submit"], .newsletter-button');
      if (btn && nl.buttonText) btn.textContent = nl.buttonText;
    }
    var byl = config.beforeYouLeave || {};
    var leave = document.querySelector('.halo-before-you-leave');
    if (leave) {
      if (byl.title) {
        var lt = leave.querySelector('.before-you-leave__title, h2');
        if (lt) lt.textContent = byl.title;
      }
      if (byl.body) {
        var lb = leave.querySelector('.before-you-leave__text, .desc');
        if (lb) lb.textContent = byl.body;
      }
      if (byl.couponCode) {
        var lc = leave.querySelector('.coupon-code, .before-you-leave__coupon');
        if (lc) lc.textContent = byl.couponCode;
      }
      if (byl.imageUrl) {
        var li = leave.querySelector('img');
        if (li) li.src = byl.imageUrl;
      }
    }
  }

  function applyHomepageSectionVisibility(config) {
    var sections = config && config.homepageSections ? config.homepageSections : [];
    if (!sections.length) return;
    var enabled = {};
    sections.forEach(function (s) {
      if (s.enabled !== false) enabled[s.type] = true;
    });
    var map = {
      slider: '.slideshow, #retailex-slider, .halo-block-slideshow',
      hero_banner: '.halo-block-fullwidth-banner',
      strip_banners: '.halo-block-sub-banner',
      campaign_promo: '#retailex-campaign-promo',
      products: '.halo-product-block, #retailex-products-grid',
      lookbook_teaser: '#retailex-lookbook-teaser',
      custom_html: '#retailex-custom-html',
    };
    Object.keys(map).forEach(function (type) {
      if (enabled[type]) return;
      document.querySelectorAll(map[type]).forEach(function (el) {
        el.style.display = 'none';
      });
    });
    var custom = sections.find(function (s) {
      return s.type === 'custom_html' && s.enabled !== false && s.customHtml;
    });
    if (custom) {
      var block = document.getElementById('retailex-custom-html');
      if (!block) {
        block = document.createElement('section');
        block.id = 'retailex-custom-html';
        block.className = 'container container-1170 py-4';
        var main = document.querySelector('main') || document.querySelector('.page-wrapper');
        if (main) main.appendChild(block);
      }
      block.innerHTML = custom.customHtml || '';
    }
  }

  function applyCampaignPromos(campaigns, routeTenant) {
    var active = sortEnabledContent(campaigns || []).filter(function (c) {
      return c.bannerImageUrl;
    });
    if (!active.length) return;
    var c = active[0];
    var section = document.getElementById('retailex-campaign-promo');
    if (!section) {
      section = document.createElement('section');
      section.id = 'retailex-campaign-promo';
      section.className = 'halo-block container container-1170 py-3';
      var anchor = document.querySelector('#retailex-products-grid, .halo-product-block');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(section, anchor);
      else {
        var main = document.querySelector('main') || document.querySelector('.page-wrapper');
        if (main) main.appendChild(section);
      }
    }
    var link = c.linkUrl || tenantBase(routeTenant);
    section.innerHTML =
      '<div class="text-center">' +
      '<a href="#" class="rex-banner-link d-block" data-href="' +
      link +
      '"><img src="' +
      c.bannerImageUrl +
      '" alt="' +
      (c.name || '') +
      '" style="width:100%;max-height:320px;object-fit:cover;border-radius:8px;"></a>' +
      (c.description ? '<p class="mt-2">' + c.description + '</p>' : '') +
      '</div>';
    section.querySelectorAll('.rex-banner-link').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var path = a.getAttribute('data-href');
        if (path) parentNav(path);
      });
    });
  }

  async function fetchProductByCode(catalogTenant, code) {
    try {
      var res = await fetch(
        bridgeApiUrl(
          '/api/eticaret/product?tenant=' + encodeURIComponent(catalogTenant) + '&code=' + encodeURIComponent(code),
        ),
        { headers: { Accept: 'application/json' } },
      );
      if (!res.ok) return null;
      var data = await res.json();
      return data.product || null;
    } catch (e) {
      return null;
    }
  }

  function fillQuickViewPopup(product, tenant) {
    var popup = document.getElementById('halo-quick-view-popup');
    if (!popup || !product) return;
    var imgWrap = popup.querySelector('.productView-nav');
    if (imgWrap) {
      imgWrap.innerHTML =
        '<div class="productView-image"><div class="media image-zoom">' +
        '<img src="' +
        (product.imageUrl || PLACEHOLDER_IMG) +
        '" alt="' +
        product.name +
        '" style="width:100%;max-height:420px;object-fit:contain;"></div></div>';
    }
    var thumbWrap = popup.querySelector('.productView-for');
    if (thumbWrap) thumbWrap.innerHTML = '';
    var title = popup.querySelector('.productView-title a, .productView-title');
    if (title) {
      title.textContent = product.name;
      if (title.tagName === 'A') {
        title.setAttribute('href', '#');
        title.classList.add('rex-product-link');
        title.setAttribute('data-href', tenantBase(tenant) + '/urun/' + encodeURIComponent(product.code));
      }
    }
    var sku = popup.querySelector('[data-sku] .productView-info-value');
    if (sku) sku.textContent = product.code;
    var brand = popup.querySelector('.productView-info-item .productView-info-value a');
    if (brand && product.vendor) brand.textContent = product.vendor;
    var priceEl = popup.querySelector('.productView-price .money, .price-item--regular .money');
    if (priceEl) priceEl.textContent = formatPrice(product.price, product.currency || 'TRY');
    var variants = popup.querySelector('.productView-variants, .halo-productOptions');
    if (variants) variants.style.display = 'none';
    var sold = popup.querySelector('.productView-soldProduct');
    if (sold) sold.style.display = 'none';
    var countdown = popup.querySelector('.productView-countDown');
    if (countdown) countdown.style.display = 'none';
    var btn = popup.querySelector('[data-btn-addtocart]');
    if (btn) {
      btn.textContent = 'Sepete Ekle';
      btn.onclick = function (e) {
        e.preventDefault();
        addToCart(tenant, product, 1);
        document.body.classList.remove('quick-view-show');
      };
    }
    document.body.classList.add('quick-view-show');
    bindProductLinks();
  }

  async function openQuickViewByCode(code, tenant, catalogTenant) {
    var product = await fetchProductByCode(catalogTenant, code);
    if (!product) return;
    fillQuickViewPopup(
      {
        id: product.id,
        code: product.code,
        name: product.name,
        price: product.price,
        currency: product.currency || 'TRY',
        imageUrl: product.imageUrl || PLACEHOLDER_IMG,
        vendor: product.vendor || '',
      },
      tenant,
    );
  }

  function wireQuickView(tenant, catalogTenant, config) {
    var features = getFeatures(config);
    if (!features.quickView) return;
    document.addEventListener(
      'click',
      function (e) {
        var btn = e.target.closest('.rex-quickview');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        var code = btn.getAttribute('data-code');
        if (code) void openQuickViewByCode(code, tenant, catalogTenant);
      },
      true,
    );
    document.querySelectorAll('[data-close-quickView-popup], .halo-quick-view-popup .halo-popup-close').forEach(function (el) {
      el.addEventListener('click', function () {
        document.body.classList.remove('quick-view-show');
      });
    });
  }

  function applyGdprText(config) {
    if (!config || !config.gdprCookieText) return;
    var desc = document.querySelector('.halo-accept-cookie-popup .desc');
    if (desc) desc.textContent = config.gdprCookieText;
  }

  function wireAskExpert(routeTenant, catalogTenant, config) {
    var features = getFeatures(config);
    if (!features.askExpert) return;
    var form = document.querySelector('.halo-ask-an-expert-form');
    var btn = document.getElementById('halo-ask-an-expert-button');
    if (!form || !btn) return;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var payload = {
        tenant_code: catalogTenant,
        name: String(fd.get('contact[name]') || fd.get('name') || ''),
        email: String(fd.get('contact[email]') || fd.get('email') || ''),
        phone: String(fd.get('contact[phone]') || fd.get('phone') || ''),
        message: String(fd.get('contact[body]') || fd.get('message') || ''),
      };
      fetch(bridgeApiUrl('/api/eticaret/inquiry'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          return res.json();
        })
        .then(function (data) {
          if (data.ok) {
            document.body.classList.remove('ask-an-expert-show');
            alert('Mesajınız alındı: ' + (data.order_no || ''));
          } else {
            alert(data.error || 'Gönderilemedi');
          }
        })
        .catch(function () {
          alert('Bağlantı hatası');
        });
    });
  }

  function wireRecentSales(catalogTenant, config) {
    var features = getFeatures(config);
    if (!features.recentSalesPopup) return;
    var popup = document.querySelector('.halo-notification-popup');
    if (!popup) return;
    fetch(bridgeApiUrl('/api/eticaret/orders?tenant=' + encodeURIComponent(catalogTenant)), {
      headers: { Accept: 'application/json' },
    })
      .then(function (res) {
        return res.ok ? res.json() : { orders: [] };
      })
      .then(function (data) {
        var orders = (data.orders || []).filter(function (o) {
          return o.status !== 'inquiry' && o.demo_mode !== true;
        });
        if (!orders.length) return;
        var order = orders[0];
        var items = Array.isArray(order.items) ? order.items : [];
        var item = items[0] || {};
        var img = popup.querySelector('.product-image img');
        var nameEl = popup.querySelector('.product-name');
        var timeEl = popup.querySelector('.time-text');
        if (img) img.src = PLACEHOLDER_IMG;
        if (nameEl) nameEl.textContent = item.name || order.customer_name || 'Ürün';
        if (timeEl) {
          var tpl = (config.recentSales && config.recentSales.messageTemplate) || '{customer} az önce satın aldı';
          timeEl.textContent = tpl
            .replace('{customer}', order.customer_name || 'Bir müşteri')
            .replace('{city}', '')
            .replace('{product}', item.name || 'ürün');
        }
        var delay = Number((config.recentSales && config.recentSales.delayMs) || popup.getAttribute('data-time') || 5000);
        setTimeout(function () {
          document.body.classList.add('notification-show');
        }, delay);
      })
      .catch(function () {});
  }

  async function renderLookbookPage(config, routeTenant, catalogTenant) {
    var features = getFeatures(config);
    if (!features.lookbook) return;
    var scenes = sortEnabledContent((config && config.lookbookScenes) || []);
    var row = document.querySelector('.lookbook-page .halo-row-carousel, .lookbook-page .row');
    if (!row) return;
    if (!scenes.length) return;

    row.innerHTML = '';
    for (var si = 0; si < scenes.length; si++) {
      var scene = scenes[si];
      var item = document.createElement('div');
      item.className = 'item-lookbook';
      var mobile = scene.mobileImageUrl || scene.imageUrl;
      item.innerHTML =
        '<div class="img-box img-box--mobile">' +
        '<div class="image image-desktop image-adapt" style="padding-top:67%;position:relative;">' +
        '<img src="' +
        scene.imageUrl +
        '" alt="' +
        (scene.title || '') +
        '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">' +
        '</div>' +
        '<div class="image image-mobile image-adapt" style="padding-top:136%;position:relative;">' +
        '<img src="' +
        mobile +
        '" alt="' +
        (scene.title || '') +
        '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">' +
        '</div></div>';
      row.appendChild(item);

      var hotspots = (scene.hotspots || []).filter(function (h) {
        return h.enabled !== false;
      });
      for (var hi = 0; hi < hotspots.length; hi++) {
        var hs = hotspots[hi];
        var product = await fetchProductByCode(catalogTenant, hs.productCode);
        var point = document.createElement('a');
        point.href = 'javascript:void(0)';
        point.className = 'point-icon';
        point.style.top = (hs.topPercent || 50) + '%';
        point.style.left = (hs.leftPercent || 50) + '%';
        point.setAttribute('data-open-lookbook-popup', '');
        point.innerHTML = '<span class="glyphicon"></span>';
        item.appendChild(point);

        var popTop = hs.popupTopPercent != null ? hs.popupTopPercent : Math.max(5, (hs.topPercent || 50) - 15);
        var popLeft = hs.popupLeftPercent != null ? hs.popupLeftPercent : (hs.leftPercent || 50) + 2;
        var popup = document.createElement('div');
        popup.className = 'popup-lookbook';
        popup.setAttribute('data-lookbook-popup', '');
        popup.style.top = popTop + '%';
        popup.style.left = popLeft + '%';
        var pName = product ? product.name : hs.productCode;
        var pPrice = product ? formatPrice(product.price, product.currency || 'TRY') : '';
        var pImg = product && product.imageUrl ? product.imageUrl : PLACEHOLDER_IMG;
        var pHref = tenantBase(routeTenant) + '/urun/' + encodeURIComponent(hs.productCode);
        popup.innerHTML =
          '<div class="popup-header"><a href="javascript:void(0)" class="icon-close-popup" data-close-popup>×</a></div>' +
          '<div class="pupop-top"><img src="' +
          pImg +
          '" alt="" style="width:100%;border-radius:4px;"></div>' +
          '<div class="popup-button"><div class="wrapper-popup-content"><div class="content-popup">' +
          '<a href="#" class="card-title link-underline rex-product-link" data-href="' +
          pHref +
          '"><span class="text">' +
          pName +
          '</span></a>' +
          (pPrice ? '<div class="card-price"><span class="money">' + pPrice + '</span></div>' : '') +
          '<a href="#" class="button button-2 rex-product-link" data-href="' +
          pHref +
          '">Detay</a>' +
          '<button type="button" class="button button-1 rex-add-cart mt-2" data-code="' +
          hs.productCode +
          '" data-name="' +
          pName.replace(/"/g, '&quot;') +
          '" data-price="' +
          (product ? product.price : 0) +
          '" data-currency="' +
          (product ? product.currency || 'TRY' : 'TRY') +
          '" data-id="' +
          (product ? product.id || '' : '') +
          '">Sepete Ekle</button>' +
          '</div></div></div>';
        item.appendChild(popup);
      }
    }
    bindProductLinks();
    document.querySelectorAll('[data-close-popup]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelectorAll('[data-open-lookbook-popup]').forEach(function (p) {
          p.classList.remove('active');
        });
        document.querySelectorAll('[data-lookbook-popup]').forEach(function (p) {
          p.classList.remove('open');
        });
      });
    });
    document.querySelectorAll('[data-open-lookbook-popup]').forEach(function (point) {
      point.addEventListener('click', function (e) {
        e.preventDefault();
        var popup = point.nextElementSibling;
        if (popup && popup.getAttribute('data-lookbook-popup') !== null) {
          document.querySelectorAll('[data-lookbook-popup]').forEach(function (p) {
            p.classList.remove('open');
          });
          document.querySelectorAll('[data-open-lookbook-popup]').forEach(function (p) {
            p.classList.remove('active');
          });
          point.classList.add('active');
          popup.classList.add('open');
        }
      });
    });
    var titleEl = document.querySelector('.lookbook-page .page-title');
    if (titleEl && config.storeTitle) titleEl.textContent = config.storeTitle + ' Lookbook';
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

  async function submitWebOrder(catalogTenant, demoMode, customer, items, paymentProvider, catalogFirmNr) {
    var payload = {
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
      };
    if (catalogFirmNr) payload.firm_nr = catalogFirmNr;
    var res = await fetch(bridgeApiUrl('/api/eticaret/submit-order'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
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

  function resolveCatalogTenant(routeTenant, storeConfig) {
    if (storeConfig && storeConfig.catalogTenantCode) {
      return String(storeConfig.catalogTenantCode).trim().toLowerCase();
    }
    if (storeConfig && storeConfig.demoMode && storeConfig.demoTenantCode) {
      return String(storeConfig.demoTenantCode).trim().toLowerCase();
    }
    if (qs('rex_demo') === '1' && qs('rex_demo_tenant')) {
      return qs('rex_demo_tenant').trim().toLowerCase();
    }
    return routeTenant;
  }

  function resolveFooterHref(link, routeTenant) {
    var url = String(link.url || '#').trim();
    if (!url || url === '#') return '#';
    if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) return url;
    if (url.indexOf('/sayfa/') === 0) {
      return tenantBase(routeTenant) + url;
    }
    if (url.charAt(0) === '/') return tenantBase(routeTenant) + url;
    return tenantBase(routeTenant) + '/' + url.replace(/^\/+/, '');
  }

  function applyFooter(config, routeTenant) {
    if (!config) return;
    var links = sortEnabledContent(config.footerLinks || []);
    if (links.length) {
      var groups = { shop: [], info: [], legal: [] };
      links.forEach(function (l) {
        var col = l.column || 'info';
        if (groups[col]) groups[col].push(l);
      });
      var columnOrder = ['shop', 'info', 'legal'];
      var cols = document.querySelectorAll('.footer-col-left .col-footer');
      cols.forEach(function (colEl, idx) {
        var key = columnOrder[idx];
        if (!key || !groups[key].length) return;
        var ul = colEl.querySelector('ul');
        if (!ul) return;
        ul.innerHTML = groups[key]
          .map(function (link) {
            var href = resolveFooterHref(link, routeTenant);
            return (
              '<li><a href="#" class="link link-underline footer-link rex-footer-link" data-href="' +
              href +
              '"><span class="text">' +
              link.label +
              '</span></a></li>'
            );
          })
          .join('');
      });
      document.querySelectorAll('.rex-footer-link').forEach(function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          var path = a.getAttribute('data-href');
          if (path) parentNav(path);
        });
      });
    }
    if (config.footerCopyright) {
      var cr =
        document.querySelector('.footer-copyright .content') ||
        document.querySelector('.footer-copyright p');
      if (cr) cr.innerHTML = config.footerCopyright;
    }
  }

  function menuItemHref(item, routeTenant) {
    if (item.type === 'external') return item.url || '#';
    if (item.type === 'page') return tenantBase(routeTenant) + '/sayfa/' + encodeURIComponent(item.pageSlug || '');
    var path = item.path || '';
    return tenantBase(routeTenant) + (path ? '/' + path.replace(/^\/+/, '') : '');
  }

  function applyNavigation(config, routeTenant) {
    if (!config || !config.menuItems || !config.menuItems.length) return;
    var items = sortEnabledContent(config.menuItems);
    if (!items.length) return;
    var features = getFeatures(config);
    var nav =
      document.querySelector('.header__inline-menu .list-menu') ||
      document.querySelector('.header-bottom--wrapper .list-menu');
    if (!nav) return;
    nav.innerHTML = items
      .map(function (item) {
        if (features.megaMenu) return renderMenuItemHtml(item, routeTenant);
        var href = menuItemHref(item, routeTenant);
        return (
          '<li class="menu-lv-item"><a href="#" class="menu-lv-1__action rex-nav-link" data-href="' +
          href +
          '"><span class="text">' +
          item.label +
          '</span></a></li>'
        );
      })
      .join('');
    bindNavLinks(nav);
    applyMobileNavigation(config, routeTenant);
  }

  function applyLogo(config) {
    if (!config || !config.logoUrl) return;
    document.querySelectorAll('.header__heading-link img').forEach(function (img) {
      img.src = config.logoUrl;
    });
  }

  function renderStaticPage(config, routeTenant) {
    var slug = qs('rex_static') || '';
    var pages = (config && config.staticPages) || [];
    var page = pages.find(function (p) {
      return p.enabled !== false && p.slug === slug;
    });
    var panel = ensureRexPanel('retailex-cms-page', (page && page.title) || 'Sayfa');
    var body = panel.querySelector('.rex-panel-body');
    if (!page) {
      body.innerHTML = '<p class="text-muted">Sayfa bulunamadı.</p>';
      return;
    }
    body.innerHTML = page.bodyHtml || '<p>İçerik yok.</p>';
  }

  async function renderProductPage(routeTenant, catalogTenant, storeConfig) {
    var code = qs('rex_product') || '';
    var panel = ensureRexPanel('retailex-product-page', 'Ürün');
    var body = panel.querySelector('.rex-panel-body');
    if (!code) {
      body.innerHTML = '<p>Ürün kodu yok.</p>';
      return;
    }
    body.innerHTML = '<p class="text-muted">Yükleniyor…</p>';
    try {
      var res = await fetch(
        bridgeApiUrl(
          '/api/eticaret/product?tenant=' + encodeURIComponent(catalogTenant) + '&code=' + encodeURIComponent(code),
        ),
        { headers: { Accept: 'application/json' } },
      );
      var data = await res.json();
      var p = data.product;
      if (!p) {
        body.innerHTML = '<p>Ürün bulunamadı.</p>';
        return;
      }
      var price = formatPrice(p.price, p.currency || 'TRY');
      body.innerHTML =
        '<div class="row"><div class="col-md-6"><img src="' +
        (p.imageUrl || PLACEHOLDER_IMG) +
        '" alt="' +
        p.name +
        '" style="width:100%;border-radius:8px;"></div><div class="col-md-6">' +
        '<h1>' +
        p.name +
        '</h1><p class="h4">' +
        price +
        '</p><p>' +
        (p.vendor || '') +
        '</p>' +
        '<button type="button" class="btn btn-primary rex-add-cart" data-code="' +
        p.code +
        '" data-name="' +
        p.name +
        '" data-price="' +
        p.price +
        '" data-currency="' +
        (p.currency || 'TRY') +
        '" data-id="' +
        (p.id || '') +
        '">Sepete Ekle</button></div></div>';
      bindProductLinks();
    } catch (e) {
      body.innerHTML = '<p>Ürün yüklenemedi.</p>';
    }
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

  function productCardHtml(p, tenant, config) {
    var href = tenantBase(tenant) + '/urun/' + encodeURIComponent(p.code);
    var price = formatPrice(p.price, p.currency);
    var priceHtml =
      p.compareAtPrice && Number(p.compareAtPrice) > Number(p.price)
        ? '<span class="price price--sale">' +
          price +
          '</span><span class="price price--compare" style="text-decoration:line-through;margin-left:8px;opacity:.65;font-size:.9em;">' +
          formatPrice(p.compareAtPrice, p.currency) +
          '</span>'
        : '<span class="price">' + price + '</span>';
    var colClass = gridColClass((config && config.layout && config.layout.productGridColumns) || 4);
    var features = getFeatures(config);
    var badge = p.badge
      ? '<span class="badge badge-sale" style="position:absolute;top:8px;left:8px;z-index:2;">' + p.badge + '</span>'
      : '';
    var quickShopBtn = features.quickShop
      ? '<button type="button" class="btn btn-outline-primary btn-sm rex-quickshop mt-1" data-code="' +
        p.code +
        '" data-name="' +
        p.name.replace(/"/g, '&quot;') +
        '" data-price="' +
        p.price +
        '" data-currency="' +
        (p.currency || 'TRY') +
        '" data-id="' +
        (p.id || '') +
        '" data-image="' +
        (p.imageUrl || PLACEHOLDER_IMG) +
        '">Hızlı Al</button>'
      : '';
    var quickViewIcon = features.quickView
      ? '<a class="card-icon quickview-icon rex-quickview" href="javascript:void(0)" data-code="' +
        p.code +
        '" title="Hızlı önizleme" style="position:absolute;top:8px;right:8px;z-index:3;background:#fff;border-radius:50%;padding:6px;">👁</a>'
      : '';
    return (
      '<div class="halo-row-item product-item ' +
      colClass +
      '">' +
      '<div class="product-card">' +
      '<div class="product-card-top">' +
      '<div class="product-card-media">' +
      '<a href="#" class="animate-scale image image-adapt rex-product-link" data-href="' +
      href +
      '" style="padding-bottom:133.33%;display:block;position:relative;overflow:hidden;">' +
      badge +
      quickViewIcon +
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
      '<div class="card-price">' +
      priceHtml +
      '</div>' +
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
      quickShopBtn +
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

  function renderProducts(products, tenant, sectionTitle, config) {
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
        '<div class="halo-block-header text-center"><h3 class="title uppercase"><span class="text">' +
        (sectionTitle || 'Ürünler') +
        '</span></h3></div>' +
        '<div class="halo-block-content"><div class="row"></div></div></div>';
      var main = document.querySelector('main') || document.querySelector('.page-wrapper');
      if (main) main.prepend(section);
      grid = section.querySelector('.row');
    } else {
      var titleEl = document.querySelector('.halo-product-block .halo-block-header .text');
      if (titleEl && sectionTitle) titleEl.textContent = sectionTitle;
    }

    if (!grid) return;

    if (!products.length) {
      grid.innerHTML =
        '<div class="col-12 text-center py-5"><p>Henüz ürün bulunmuyor.</p></div>';
      return;
    }

    grid.innerHTML = products
      .map(function (p) {
        return productCardHtml(p, tenant, config);
      })
      .join('');
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
    var catalogFirmNr = (storeConfig && storeConfig.catalogFirmNr) || '';
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
      submitWebOrder(catalogTenant, demoMode, customer, cart, paymentProvider, catalogFirmNr)
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
    var discountMap = {};
    var now = new Date();

    campaigns.forEach(function (c) {
      var startOk = !c.startDate || new Date(c.startDate) <= now;
      var endOk = !c.endDate || new Date(c.endDate) >= now;
      if (!startOk || !endOk) return;
      var badge = c.badge || (c.discountPercent ? '%' + c.discountPercent : '');
      var pct = Number(c.discountPercent || 0);
      var applyDiscount = function (code) {
        if (badge) badgeMap[code] = badge;
        if (pct > 0) discountMap[code] = Math.max(discountMap[code] || 0, pct);
      };
      if (!c.productCodes || !c.productCodes.length) {
        products.forEach(function (p) {
          applyDiscount(p.code);
        });
      } else {
        c.productCodes.forEach(applyDiscount);
      }
    });

    featured.forEach(function (f) {
      if (f.badge) badgeMap[f.productCode] = f.badge;
    });

    products = products.map(function (p) {
      var copy = Object.assign({}, p);
      if (discountMap[p.code]) {
        var orig = Number(p.price || 0);
        copy.compareAtPrice = orig;
        copy.price = Math.round(orig * (100 - discountMap[p.code]) / 100 * 100) / 100;
      }
      if (badgeMap[p.code]) copy.badge = badgeMap[p.code];
      return copy;
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
    applyHomepageSectionVisibility(config);
    applySlider(config.sliders || [], routeTenant);
    applyBanners(config.banners || [], routeTenant);
    applyCampaignPromos(config.campaigns || [], routeTenant);
  }

  async function fetchCatalog(catalogTenant, demoMode, config) {
    var limit = (config && config.layout && config.layout.catalogLimit) || 24;
    try {
      var res = await fetch(
        bridgeApiUrl('/api/eticaret/catalog?tenant=' + encodeURIComponent(catalogTenant) + '&limit=' + limit),
        { headers: { Accept: 'application/json' } },
      );
      if (res.ok) {
        var data = await res.json();
        if (data.products && data.products.length) {
          return data.products.map(function (p) {
            return {
              id: p.id,
              code: p.code,
              name: p.name,
              price: p.price,
              currency: p.currency || data.currency || 'TRY',
              imageUrl: p.imageUrl || PLACEHOLDER_IMG,
              hoverImageUrl: PLACEHOLDER_HOVER,
              vendor: p.vendor || '',
              badge: p.badge || null,
            };
          });
        }
        if (!demoMode && !data.demo) return [];
      }
    } catch (e) {}

    if (!demoMode) return [];

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

    var storeConfig = await loadStorefrontConfig(routeTenant);
    window.__rexStoreConfig = storeConfig;
    window.__rexRouteTenant = routeTenant;
    var catalogTenant = resolveCatalogTenant(routeTenant, storeConfig);
    var demoMode = Boolean(storeConfig && storeConfig.demoMode);
    var variantId =
      (storeConfig && storeConfig.activeVariantId) || qs('rex_variant') || 'ella-classic';
    var title =
      (storeConfig && storeConfig.storeTitle) || qs('rex_title') || 'Online Mağaza';
    var announce = (storeConfig && storeConfig.announcementText) || qs('rex_announce') || '';

    if (storeConfig && storeConfig.seoTitle) {
      document.title = storeConfig.seoTitle;
    }
    applySeoMeta(storeConfig);
    applyThemeBranding(storeConfig);

    injectVariantCss(variantId);
    patchAnnouncement(announce);
    patchHeaderTitle(title, routeTenant);
    applyLogo(storeConfig);
    applyFeatureToggles(storeConfig);
    applyNavigation(storeConfig, routeTenant);
    applyFooter(storeConfig, routeTenant);
    applyContactAndSocial(storeConfig, routeTenant);
    applyPopupContent(storeConfig);
    wireSideCartOpen(routeTenant, routeTenant, storeConfig);
    wireQuickShop(routeTenant, catalogTenant, storeConfig);
    wireQuickView(routeTenant, catalogTenant, storeConfig);
    wireInstantSearch(catalogTenant, routeTenant, storeConfig);
    applyGdprText(storeConfig);
    wireAskExpert(routeTenant, catalogTenant, storeConfig);
    wireRecentSales(catalogTenant, storeConfig);
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
    if (qs('rex_static') === 'lookbook') {
      await renderLookbookPage(storeConfig, routeTenant, catalogTenant);
      return;
    }
    if (qs('rex_static') && qs('rex_static') !== 'sepet' && qs('rex_static') !== 'odeme') {
      renderStaticPage(storeConfig, routeTenant);
      return;
    }
    if (kind === 'product' || qs('rex_product')) {
      await renderProductPage(routeTenant, catalogTenant, storeConfig);
      return;
    }

    if (kind === 'home' || kind === 'category' || !kind) {
      applyStorefrontContent(storeConfig, routeTenant);
      var products = await fetchCatalog(catalogTenant, demoMode, storeConfig);
      products = mergeFeaturedAndCampaigns(products, storeConfig);
      renderProducts(products, routeTenant, (storeConfig && storeConfig.productSectionTitle) || 'Ürünler', storeConfig);
      pruneEllaDemoBlocks();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
