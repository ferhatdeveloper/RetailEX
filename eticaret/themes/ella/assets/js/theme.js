(function($) {
    var $body = $('body'),
        $doc = $(document),
        $html = $('html'),
        $win = $(window),
        w = $win.width();

    $doc.ready(() => {
        halo.ready();
    });
    $win.resize(() => {
        halo.resize();
    });

    window.onload = function() {
        halo.init();
    }

    var halo = {
        haloTimeout: null,
        ready: function() {
            halo.setActiveViewModeMediaQuery();
        },
        resize: function() {
            halo.setActiveViewModeMediaQuery();
        },
        init: function() {
            this.initSliderBanner();
            this.initSliderBannerWidthText();
            this.initSliderProduct();
            this.initSliderProductWidthBanner();
            this.initDropdownColumns();
            this.initPopupRecentlyViewed();
            this.initCloseAnnouncementBar();
            this.initHeaderSticky();
            this.initSliderAnnouncementBar();
            this.initDropdown();
            this.initOpenSearchForm();
            this.initDynamicBrowserTabTitle();
            this.initSidebarLogin();
            this.initSidebarLangCurrency();
            this.initSidebarCart();
            this.initSidebarSearch();
            this.initGlobalCheckbox();
            this.initNotifyInStock();
            this.initQuickShop();
            this.initQuickAddToCard();
            this.initEditQuickCart();
            this.initNewsLetterPopup();
            this.initSliderAboutUs();
            this.initSlideShow();
            this.initClickedActiveVideoBanner();
            this.initShowPopupShare();
            this.initShowPopup();
            this.initCountdown();
            this.initCartCountDown();
            this.initProductCustomerViewing();
            this.initProductSizeChart();
            this.initProductQuickView();
            this.initProductAskAnExpert();
            this.initCardSwatch();
            this.initZoomImage();
            this.initProductImageGallery();
            this.initWishlistActive();
            this.initUpdateValueQuantity();
            this.initMenuMobile();
            this.initShowPopupLookBook();
            this.initShowPopupSearch();
            this.initToggleSidebarMobile();
            this.initPriceRangeFilter();
            this.initCollapseSidebarBlock();
            this.initBeforeYouLeave();
            this.initNotification();
            this.initProductVariantChange();
            this.initCloseAcceptCookie();
            this.intiShowItemGallery();
            this.initProductCompareColor();
            this.initShuffleFilter();

            if($body.hasClass('template-product')){
                this.initProductNextPrev();
                this.initProductBUndle();
                this.initShowCustomReview();
                this.initStickyAddToCart();
                this.initOpenTabsProduct();
                this.initSidebarLocalPickUp();
            }

            if($body.hasClass('template-collection')){
                this.initAddEventViewModeLayout();
                this.initToolbar();
            }
        },

        initSliderBanner: function() {
            var bannerBlock = $('[data-banner-carousel]');

            bannerBlock.each(function() {
                var self = $(this),
                    bannerItems = self.find(".row"),
                    itemShow = self.data("item-to-show"),
                    itemDots = self.data("item-dots"),
                    itemDots_mb = self.data("item-dots-mb"),
                    itemRow = self.data("item-arrows"),
                    itemRow_mb = self.data("item-arrows-mb"),
                    iconArrow = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="presentation"><path d="M 7.75 1.34375 L 6.25 2.65625 L 14.65625 12 L 6.25 21.34375 L 7.75 22.65625 L 16.75 12.65625 L 17.34375 12 L 16.75 11.34375 Z"/></svg>';
                if (bannerItems.length > 0) {
                    if (!bannerItems.hasClass('slick-initialized')) {
                        bannerItems.slick({
                            mobileFirst: true,
                            adaptiveHeight: false,
                            infinite: false,
                            vertical: false,
                            slidesToShow: 2,
                            slidesToScroll: 1,
                            dots: itemDots_mb,
                            arrows: itemRow_mb,
                            nextArrow: '<button type="button" class="slick-arrow slick-next" aria-label="Slide Next">' + iconArrow + '</button>',
                            prevArrow: '<button type="button" class="slick-arrow slick-prev" aria-label="Slide Prev">' + iconArrow + '</button>',
                            responsive: [{
                                    breakpoint: 1300,
                                    settings: {
                                        dots: itemDots,
                                        arrows: itemRow,
                                        slidesToShow: itemShow,
                                        slidesToScroll: 1
                                    }
                                },
                                {
                                    breakpoint: 767,
                                    settings: {
                                        dots: itemDots,
                                        arrows: itemRow,
                                        slidesToShow: 3,
                                        slidesToScroll: 1
                                    }
                                }
                            ]
                        });
                    }
                }
            });
        },

        initSliderBannerWidthText: function() {
            var bannerBlock = $('[data-banner-text-carousel]');

            bannerBlock.each(function() {
                var self = $(this),
                    bannerItems = self.find(".row"),
                    itemShow = self.data("item-to-show"),
                    itemDots = self.data("item-dots"),
                    itemDots_mb = self.data("item-dots-mb"),
                    itemRow = self.data("item-arrows"),
                    itemRow_mb = self.data("item-arrows-mb"),
                    iconArrow = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="presentation"><path d="M 7.75 1.34375 L 6.25 2.65625 L 14.65625 12 L 6.25 21.34375 L 7.75 22.65625 L 16.75 12.65625 L 17.34375 12 L 16.75 11.34375 Z"/></svg>';
                if (bannerItems.length > 0) {
                    if (!bannerItems.hasClass('slick-initialized')) {
                        bannerItems.slick({
                            mobileFirst: true,
                            adaptiveHeight: false,
                            infinite: false,
                            vertical: false,
                            slidesToShow: 1,
                            slidesToScroll: 1,
                            dots: itemDots_mb,
                            arrows: itemRow_mb,
                            nextArrow: '<button type="button" class="slick-arrow slick-next" aria-label="Slide Next">' + iconArrow + '</button>',
                            prevArrow: '<button type="button" class="slick-arrow slick-prev" aria-label="Slide Prev">' + iconArrow + '</button>',
                            responsive: [{
                                    breakpoint: 1300,
                                    settings: {
                                        dots: itemDots,
                                        arrows: itemRow,
                                        slidesToShow: itemShow,
                                        slidesToScroll: 1
                                    }
                                },
                                {
                                    breakpoint: 1024,
                                    settings: {
                                        get slidesToShow() {
                                            if (itemShow > 3) {
                                                return this.slidesToShow = itemShow - 1;
                                            } else {
                                                return this.slidesToShow = itemShow;
                                            }
                                        },

                                        dots: itemDots,
                                        arrows: itemRow,
                                        slidesToScroll: 1
                                    }
                                },
                                {
                                    breakpoint: 552,
                                    settings: {
                                        dots: itemDots_mb,
                                        arrows: itemRow_mb,
                                        slidesToShow: 2,
                                        slidesToScroll: 1
                                    }
                                }
                            ]
                        });
                    }
                }

            });
        },

        initSliderProduct: function() {
            var productBlock = $('[data-product-carousel]');

            productBlock.each(function() {
                var self = $(this),
                    productItems = self.find(".row"),
                    itemShow = self.data("item-to-show"),
                    itemDots = self.data("item-dots"),
                    itemDots_mb = self.data("item-dots-mb"),
                    itemRow = self.data("item-arrows"),
                    itemRow_mb = self.data("item-arrows-mb"),
                    iconArrow = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="presentation"><path d="M 7.75 1.34375 L 6.25 2.65625 L 14.65625 12 L 6.25 21.34375 L 7.75 22.65625 L 16.75 12.65625 L 17.34375 12 L 16.75 11.34375 Z"/></svg>';
                if (productItems.length > 0) {
                    if (!productItems.hasClass('slick-initialized')) {
                        if(self.hasClass('custom-product-carousel')) {
                            productItems.slick({
                                mobileFirst: true,
                                adaptiveHeight: false,
                                infinite: false,
                                vertical: false,
                                slidesToShow: 1,
                                slidesToScroll: 1,  
                                dots: itemDots_mb,
                                arrows: itemRow_mb,
                                nextArrow: '<button type="button" class="slick-arrow slick-next" aria-label="Slide Next">' + iconArrow + '</button>',
                                prevArrow: '<button type="button" class="slick-arrow slick-prev" aria-label="Slide Prev">' + iconArrow + '</button>',
                                responsive: [{
                                    breakpoint: 552,
                                        settings: {
                                            dots: itemDots,
                                            arrows: itemRow,
                                        }
                                    },
                                ]
                            });
                        }else {
                            productItems.slick({
                                mobileFirst: true,
                                adaptiveHeight: false,
                                infinite: false,
                                vertical: false,
                                slidesToShow: 2,
                                slidesToScroll: 1,
                                dots: itemDots_mb,
                                arrows: itemRow_mb,
                                nextArrow: '<button type="button" class="slick-arrow slick-next" aria-label="Slide Next">' + iconArrow + '</button>',
                                prevArrow: '<button type="button" class="slick-arrow slick-prev" aria-label="Slide Prev">' + iconArrow + '</button>',
                                responsive: [{
                                    breakpoint: 552,
                                        settings: {
                                            dots: itemDots_mb,
                                            arrows: itemRow_mb,
                                            slidesToShow: 3,
                                            slidesToScroll: 1,
                                        }
                                    },
                                    {
                                        breakpoint: 1100,
                                        settings: {
                                            dots: itemDots,
                                            arrows: itemRow,
                                            slidesToShow: 4,
                                            slidesToScroll: 1,
                                        }
                                    },
                                    {
                                        breakpoint: 1300,
                                        settings: {
                                            dots: itemDots,
                                            arrows: itemRow,
                                            slidesToShow: itemShow,
                                            slidesToScroll: 1,
                                        }
                                    }
                                    
                                ]
                            });
                        }
                    }
                }

            });
        },

        initSliderProductWidthBanner: function(){
            var productBlock = $('[data-product-width-banner-carousel]');

            productBlock.each(function() {
                var self = $(this),
                    productItems = self.find(".row"),
                    itemShow = self.data("item-to-show"),
                    itemDots = self.data("item-dots"),
                    itemDots_mb = self.data("item-dots-mb"),
                    itemRow = self.data("item-arrows"),
                    itemRow_mb = self.data("item-arrows-mb"),
                    iconArrow = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="presentation"><path d="M 7.75 1.34375 L 6.25 2.65625 L 14.65625 12 L 6.25 21.34375 L 7.75 22.65625 L 16.75 12.65625 L 17.34375 12 L 16.75 11.34375 Z"/></svg>';
                if (productItems.length > 0) {
                    if (!productItems.hasClass('slick-initialized')) {
                        productItems.slick({
                            mobileFirst: true,
                            adaptiveHeight: false,
                            infinite: false,
                            vertical: false,
                            slidesToShow: 2,
                            slidesToScroll: 1,
                            dots: itemDots_mb,
                            arrows: itemRow_mb,
                            nextArrow: '<button type="button" class="slick-arrow slick-next" aria-label="Slide Next">' + iconArrow + '</button>',
                            prevArrow: '<button type="button" class="slick-arrow slick-prev" aria-label="Slide Prev">' + iconArrow + '</button>',
                            responsive: [{
                                    breakpoint: 1300,
                                    settings: {
                                        dots: itemDots,
                                        arrows: itemRow,
                                        slidesToShow: itemShow,
                                        slidesToScroll: 1,
                                    }
                                }
                            ]
                        });
                    }
                }

            });
        },

        initDropdownColumns: function() {
            var sectionColumnTitle = document.querySelectorAll('[data-toggle-column]');
            if (sectionColumnTitle.length) {
                for (i = 0; i < sectionColumnTitle.length; i++) {
                    (function(i) {
                        sectionColumnTitle[i].addEventListener('click', (event) => {
                            var $this = event.currentTarget,
                                $content = $this.nextElementSibling;

                            $this.classList.toggle('is-clicked');
                            $content.classList.toggle('is-active');

                            if ($content.style.maxHeight) {
                                $content.style.maxHeight = null;
                            } else {
                                $content.style.maxHeight = $content.scrollHeight + 'px';
                            }
                        });
                    })(i);
                }
            }
        },

        initPopupRecentlyViewed: function() {
            var iconPopup = $(".recently-viewed-icon.open-popup"),
                iconBackToTop = $(".recently-viewed-icon.scroll-to-top"),
                iconPopupNewsletter = $("[data-open-newsletter-popup]");

            iconPopup.on('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                var self = $(event.currentTarget),
                    currPopup = self.data("target");

                if (self.hasClass("is-open")) {
                    $(".recently-viewed-icon").removeClass('is-open');
                    $(".recently-viewed-tab").removeClass('is-visible');
                } else {
                    $(".recently-viewed-icon").removeClass('is-open');
                    $(".recently-viewed-tab").removeClass('is-visible');
                    self.addClass("is-open");
                    document.getElementById(currPopup).classList.add('is-visible');
                }
            });

            iconPopupNewsletter.on('click', (event) => {
                event.preventDefault();
                event.stopPropagation();

                $body.addClass('newsletter-show');
            });

            $doc.on('click', (event) => {
                $(".recently-viewed-icon").removeClass('is-open');
                $(".recently-viewed-tab").removeClass('is-visible');
            });

            iconBackToTop.on('click.scrollTop', (event) => {
                event.preventDefault();
                event.stopPropagation();
                $('html, body').animate({
                    scrollTop: 0
                }, 0);
                return false;
            });

            // iconBackToTop.addEventListener('click', (event) => {
            //     event.preventDefault();
            //     event.stopPropagation();
            //     window.scrollTo({top: 0, behavior: 'smooth'});
            // });
        },

        initCloseAnnouncementBar: function() {
            var announcementBar = $('.announcement-bar__message'),
                closeAnnouncement = announcementBar.find('[data-close-announcement');

            // if ($.cookie('AnnouncementBar') == 'closed') {
            //     announcementBar.remove();
            // } else {
            //     announcementBar.css('opacity', 1);
            // };

            announcementBar.css('opacity', 1);

            closeAnnouncement.off('click.closeHeaderTop').on('click.closeHeaderTop', function(e) {
                e.preventDefault();
                e.stopPropagation();

                announcementBar.remove();
                // $.cookie('AnnouncementBar', 'closed', {
                //     expires: 1,
                //     path: '/'
                // });
            });

        },

        initSliderAnnouncementBar: function(){
            var announcement_bar = $('[data-announcement-bar-carousel]'),
                announcement_item = announcement_bar.find('.message');
                iconArrow = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="presentation"><path d="M 7.75 1.34375 L 6.25 2.65625 L 14.65625 12 L 6.25 21.34375 L 7.75 22.65625 L 16.75 12.65625 L 17.34375 12 L 16.75 11.34375 Z"/></svg>';

            if(announcement_bar.length > 0){
                if(!announcement_item.hasClass('slick-initialized')){
                    console.log("announcement_item",announcement_item)
                    announcement_item.slick({
                        infinite: true,
                        vertical: true,
                        slidesToShow: 1,
                        slidesToScroll: 1,
                        dots: false,
                        arrows: true,
                        autoplay: true,
                        autoplaySpeed: 3000,
                        nextArrow: '<button type="button" class="slick-arrow slick-next" aria-label="Slide Next">' + iconArrow + '</button>',
                        prevArrow: '<button type="button" class="slick-arrow slick-prev" aria-label="Slide Prev">' + iconArrow + '</button>',
                    });
                }
            }
        },

        initHeaderSticky: function() {
            var header_position,
                header_height,
                activeClass = 'has-stickyHeader',
                sticky = $('[data-header-sticky]');

            header_height = sticky.height();
            header_position = sticky.offset().top + sticky.outerHeight(true);

            if (sticky.length > 0) {
                halo.stickyScroll(sticky, header_position, header_height, activeClass);
            }
        },

        stickyScroll: function(sticky, position, delta, activeClass) {
            var lastScrollTop = 0;

            $win.on('scroll load', () => {
                var scroll = $win.scrollTop();

                $('.dropdown-language_currency').removeClass('show');

                if (Math.abs(lastScrollTop - scroll) <= delta) {
                    return;
                }

                if (scroll > lastScrollTop && scroll > position) {
                    sticky.removeClass('sticky-down').addClass('sticky-up ');
                    $body.addClass(activeClass);
                } else {
                    if (scroll + $win.height() < $doc.height()) {
                        sticky.removeClass('sticky-up').addClass('sticky-down');
                        if (scroll > position) {
                            $body.addClass(activeClass);
                        } else {
                            $body.removeClass(activeClass);
                            sticky.removeClass('sticky-up sticky-down');
                        }
                    }
                }

                lastScrollTop = scroll;
            });
        },

        initDropdown: function() {
            $doc.on('click', '[data-dropdown-toggle]', (event) => {
                if ($(event.currentTarget).find(".halo-dropdown").hasClass('show')) {
                    $('.halo-dropdown').removeClass('show');
                } else {
                    $('.halo-dropdown').removeClass('show');
                    $(event.currentTarget).find(".halo-dropdown").toggleClass('show');
                }
            });

            $doc.on('click', (event) => {
                if ($('.halo-dropdown').hasClass('show') && ($(event.target).closest('[data-dropdown-toggle]').length === 0)) {
                    $('.halo-dropdown').removeClass('show');
                }
            });
        },

        initOpenSearchForm: function() {
            var inputSearch = $(".header-search__form .header-search__input"),
                quickSearchResul = inputSearch.parents(".header-search").find(".quickSearchResultsWrap");
                btnClose = $(".background-header-search, .halo-search-close");

            inputSearch.focus(function() {
                quickSearchResul.addClass("show");
                $body.addClass("quickSearchResult-show");
            });

            $doc.on('click', (event) => {
                if ($('.quickSearchResultsWrap').hasClass('show') && ($(event.target).closest('.header-search').length === 0)) {
                    $('.quickSearchResultsWrap').removeClass('show');
                    $body.removeClass('quickSearchResult-show');
                }
            });

            btnClose.on('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if ($body.hasClass('quickSearchResult-show')) {
                    $body.removeClass('quickSearchResult-show');
                    $('.quickSearchResultsWrap').removeClass('show');
                }
            });
        },

        initDynamicBrowserTabTitle: function() {
            var pageTitleContent = document.title,
                newPageTitleContent = 'Come back ⚡';

            window.onblur = function() {
                document.title = newPageTitleContent;
            }

            window.onfocus = function() {
                document.title = pageTitleContent;
            }
        },

        initSidebarLogin: function() {
            var authIcon = $("[data-open-auth-sidebar]"),
                btnClose = $(".background-overlay, .halo-sidebar-close");

            if (authIcon.length) {
                authIcon.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    $body.addClass('auth-sidebar-show');
                });

                btnClose.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if ($body.hasClass('auth-sidebar-show')) {
                        $body.removeClass('auth-sidebar-show');
                    }
                });

            }
        },

        initSidebarLocalPickUp: function() {
            var pickupIcon = $("[data-pickup-open]"),
                btnClose = $(".background-overlay, .halo-sidebar-close");

            if (pickupIcon.length) {
                pickupIcon.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    $body.addClass('pickup-sidebar-show');
                });

                btnClose.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if ($body.hasClass('pickup-sidebar-show')) {
                        $body.removeClass('pickup-sidebar-show');
                    }
                });

            }
        },

        initSidebarLangCurrency: function() {
            var btnLangCurrency = $("[data-show-language_currency]"),
                btnClose = $(".background-overlay, .halo-sidebar-close");

            if (btnLangCurrency.length) {
                btnLangCurrency.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    $body.addClass('lang-currency-sidebar-show');
                });

                btnClose.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if ($body.hasClass('lang-currency-sidebar-show')) {
                        $body.removeClass('lang-currency-sidebar-show');
                    }
                });

            }
        },

        initSidebarCart: function() {
            var authIcon = $("[data-open-cart-sidebar]"),
                btnClose = $(".background-overlay, .halo-sidebar-close");

            if (authIcon.length) {
                authIcon.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    $body.addClass('cart-sidebar-show');
                    $body.removeClass('quickshop-popup-show');
                });

                btnClose.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if ($body.hasClass('cart-sidebar-show')) {
                        $body.removeClass('cart-sidebar-show');
                    }
                });

            }
        },

        initSidebarSearch: function() {
            var searchIcon = $("[data-mobile-search]"),
                btnClose = $(".background-overlay, .halo-sidebar-close");

            if (searchIcon.length) {
                searchIcon.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    $body.addClass('search_sidebar-show');
                });

                btnClose.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if ($body.hasClass('search_sidebar-show')) {
                        $body.removeClass('search_sidebar-show');
                    }
                });

            }
        },

        initGlobalCheckbox: function() {
            $doc.on('change', '.global-checkbox--input', (event) => {
                var $this = $(event.currentTarget)
                    btnCheckout = $this.parents('.previewCartAction').find('.button-checkout');

                if (event.target.checked) {
                    $(btnCheckout).attr('disabled', false);
                } else {
                    $(btnCheckout).attr('disabled', true);
                }
            });
        },

        initNotifyInStock: function() {
            var btnNotify = $('.is-notify-me'),
                btnclose = $(".background-overlay-popup, .halo-popup-close");

            if (btnNotify.length) {
                btnNotify.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    $body.addClass('notify-me-show');
                });

                btnclose.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    if ($body.hasClass('notify-me-show')) {
                        $body.removeClass('notify-me-show');
                    }

                });

            }
        },

        initQuickShop: function() {
            var btnQuickShop = $('[data-quickshop-popup]'),
                btnclose = $(".background-overlay-popup, .halo-popup-close");

            if (btnQuickShop.length) {
                btnQuickShop.on('click', (event) => {
                    // event.preventDefault();
                    event.stopPropagation();

                    $body.addClass('quickshop-popup-show');
                });
                btnclose.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    if ($body.hasClass('quickshop-popup-show')) {
                        $body.removeClass('quickshop-popup-show');
                    }

                });
            }
        },

        initQuickAddToCard: function() {
            var btnAddTocart = $('[data-btn-quickShop-addtocart]'),
                sidebarCart = $('[data-open-cart-sidebar]')

            btnAddTocart.on('click', (event) => {
                $body.removeClass('quickshop-popup-show');
                sidebarCart.trigger('click');
            });
        },

        initEditQuickCart: function() {
            var btnQuickEdit = $('[data-open-edit-cart]');
            btnclose = $(".background-overlay-popup, .halo-popup-close");

            if (btnQuickEdit.length) {
                btnQuickEdit.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    $body.addClass('edit-cart-show');
                });

                btnclose.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    if ($body.hasClass('edit-cart-show')) {
                        $body.removeClass('edit-cart-show');
                    }

                });
            }
        },

        initNewsLetterPopup: function() {
            var newstterPopup = $(".halo-newsletter-popup");

            if (newstterPopup.length > 0) {
                var timeToShow = newstterPopup.data('delay'),
                    expiresDate = newstterPopup.data('expire'),
                    btnClose = $("[data-close-newsletter-popup],.background-overlay-popup");

                // if ($.cookie('newsletter-popup') != 'closed') {
                    setTimeout(function() {
                        $body.addClass('newsletter-show');
                    }, timeToShow);
                // };

                
                btnClose.click(function(e) {
                    // $.cookie('newsletter-popup', 'closed', {
                    //     expires: 1,
                    //     path: '/'
                    // });
                    $body.removeClass('newsletter-show');
                });

                $doc.on('change', '#dismiss', (event) => {
                    var $this = $(event.currentTarget);

                    if (event.target.checked) {
                        btnClose.trigger('click');
                    }
                });
            }
        },

        initSliderAboutUs: function() {
            var bannerBlock = $('[data-banner-about]');

            bannerBlock.each(function() {
                var self = $(this),
                    bannerItems = self.find(".halo-row-slider"),
                    itemShow = self.data("item-to-show"),
                    itemDots = self.data("item-dots"),
                    itemDots_mb = self.data("item-dots-mb"),
                    itemRow = self.data("item-arrows"),
                    itemRow_mb = self.data("item-arrows-mb"),
                    iconArrow = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="presentation"><path d="M 7.75 1.34375 L 6.25 2.65625 L 14.65625 12 L 6.25 21.34375 L 7.75 22.65625 L 16.75 12.65625 L 17.34375 12 L 16.75 11.34375 Z"/></svg>';
                if (bannerItems.length > 0) {
                    if (!bannerItems.hasClass('slick-initialized')) {
                        bannerItems.slick({
                            mobileFirst: true,
                            adaptiveHeight: false,
                            infinite: false,
                            vertical: false,
                            slidesToShow: 1,
                            slidesToScroll: 1,
                            fade: true,
                            dots: itemDots_mb,
                            arrows: itemRow_mb,
                            nextArrow: '<button type="button" class="slick-arrow slick-next" aria-label="Slide Next">' + iconArrow + '</button>',
                            prevArrow: '<button type="button" class="slick-arrow slick-prev" aria-label="Slide Prev">' + iconArrow + '</button>',
                            responsive: [{
                                    breakpoint: 1600,
                                    settings: {
                                        dots: itemDots,
                                        arrows: itemRow,
                                        slidesToShow: itemShow,
                                        slidesToScroll: 1,
                                    }
                                },

                            ]
                        });
                    }
                }

            });
        },

        initSlideShow: function() {
            var bannerBlock = $('[data-slide-show]');

            bannerBlock.each(function() {
                var self = $(this),
                    bannerItems = self.find(".halo-row-carousel"),
                    itemDots = self.data("item-dots"),
                    itemDots_mb = self.data("item-dots-mb"),
                    itemRow = self.data("item-arrows"),
                    itemRow_mb = self.data("item-arrows-mb"),
                    iconArrow = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="presentation"><path d="M 7.75 1.34375 L 6.25 2.65625 L 14.65625 12 L 6.25 21.34375 L 7.75 22.65625 L 16.75 12.65625 L 17.34375 12 L 16.75 11.34375 Z"/></svg>';
                if (bannerItems.length > 0) {
                    if (!bannerItems.hasClass('slick-initialized')) {
                        bannerItems.slick({
                            mobileFirst: true,
                            fade: true,
                            adaptiveHeight: false,
                            infinite: false,
                            vertical: false,
                            slidesToShow: 1,
                            slidesToScroll: 1,
                            dots: itemDots_mb,
                            arrows: itemRow_mb,
                            autoplay: true,
                            autoplaySpeed: 3000,
                            nextArrow: '<button type="button" class="slick-arrow slick-next" aria-label="Slide Next">' + iconArrow + '</button>',
                            prevArrow: '<button type="button" class="slick-arrow slick-prev" aria-label="Slide Prev">' + iconArrow + '</button>',
                            responsive: [{
                                breakpoint: 1200,
                                settings: {
                                    dots: itemDots,
                                    arrows: itemRow,
                                    slidesToShow: 1,
                                    slidesToScroll: 1,
                                }
                            }]
                        });

                    }
                }
            });
        },

        initClickedActiveVideoBanner: function() {
            if ($('[data-video-banner]').length > 0) {
                var videoIcon = $('[data-open-video]');

                videoIcon.each((index, element) => {
                    var self = $(element),
                        banner = self.parents('.halo-block-video'),
                        icon = banner.find('[data-close-video]'),
                        modal = banner.find('.modal-content-video');

                    self.off('click').on('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();

                        var dataVideo = self.data('video');

                        $('.video-banner').find('.modal-video-content').remove();
                        $('.video-banner').removeClass('open_video fixed_video');

                        if (self.hasClass('video_youtube')) {
                            var templateModal = `
                                <div class="modal-video-content">
                                    <div class="video_YT video">
                                        <iframe\
                                            id="player"\
                                            type="text/html"\
                                            width="100%"\
                                            height="100%"\
                                            frameborder="0"\
                                            webkitAllowFullScreen\
                                            mozallowfullscreen\
                                            allowFullScreen\
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" title="YouTube video player"\
                                            src="https://www.youtube.com/embed/${dataVideo}?autoplay=1&mute=0"\
                                            data-video-player>\
                                        </iframe>\
                                    </div>
                                </div>
                            `;
                        } else {
                            var templateModal = `
                                <div class="modal-video-content">
                                    <div class="video">
                                        <video controls autoplay class="video">
                                            <source src="${dataVideo}">
                                        </video>
                                    </div>
                                </div>
                            `;
                        }
                        modal.html(templateModal);
                        banner.find('.video-banner').addClass('open_video');
                    });

                    icon.off('click').on('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();

                        banner.find('.modal-video-content').remove();
                        banner.find('.video-banner').removeClass('open_video fixed_video');
                    });

                    $win.on('scroll', (event) => {
                        var offsetTop = modal.offset().top,
                            height = modal.height();

                        if ($(event.currentTarget).scrollTop() < offsetTop - height) {
                            if (!banner.find('.video-banner').hasClass('fixed_video')) {
                                banner.find('.video-banner').addClass('fixed_video');
                            }
                        } else if ($(event.currentTarget).scrollTop() > offsetTop + height + 20) {
                            if (!banner.find('.video-banner').hasClass('fixed_video')) {
                                banner.find('.video-banner').addClass('fixed_video');
                            }
                        }
                    });
                });
            }
        },

        initShowPopupShare: function() {
            var wrapper = $(".productView-share");

            if (wrapper.length > 0) {
                var btnCopy = wrapper.find(".share-group .button-copy"),
                    btnShare = wrapper.find(".share-button"),
                    $temp = $("<input>"),
                    $url = wrapper.find(".field__input").val();

                btnShare.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    wrapper.find(".share-button__fallback").toggleClass("is-open");
                });

                btnCopy.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    wrapper.append($temp);
                    $temp.val($url).select();
                    document.execCommand("copy");
                    $temp.remove();
                    wrapper.find(".field__input").val("URL copied!");
                });

                $doc.on('click', '.share-button__close', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    $(".share-button__fallback").removeClass("is-open");
                });

                $doc.on('click', (event) => {
                    if ($(event.target).closest('.share-button__fallback').length === 0) {
                        $(".share-button__fallback").removeClass("is-open");
                    }
                });
            }
        },

        initShowPopup: function () {
            $(document).on('click', '[data-open]', (event) => {
                event.preventDefault();
                btnClose = $(".background-overlay");

                var $target = $(event.currentTarget),
                    $popup = $target.siblings('.show-popup');
                if (!$target.hasClass('active')) {
                    $target.addClass('active');
                    $popup.addClass('open');
                } else {
                    $target.removeClass('active');
                    $popup.removeClass('open');
                }
            });
            $(document).on('click', (event) => {
                if (!event.target.closest('[data-open]') && !event.target.closest('[data-popup]')) {
                    $('[data-open]').removeClass('active');
                    $('[data-popup]').removeClass('open');
                }
            });  
        },

        initCountdown: function() {
            var countdownElm = $('[data-countdown]');
            if (countdownElm.length) {
                countdownElm.each(function() {
                    var self = $(this),
                        countDown = self.data('countdown'),
                        countDownDate = new Date(countDown).getTime();

                    var countdownfunction = setInterval(function() {
                        var now = new Date().getTime(),
                            distance = countDownDate - now;

                        if (distance < 0) {
                            clearInterval(countdownfunction);
                            self.remove();
                        } else {
                            var days = Math.floor(distance / (1000 * 60 * 60 * 24)),
                                hours = `0${Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))}`.slice(-2),
                                minutes = `0${Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))}`.slice(-2),
                                seconds = `0${Math.floor((distance % (1000 * 60)) / 1000)}`.slice(-2),
                                strCountDown = '';
                            if (self.hasClass('style-3')) {
                                strCountDown = '<span class="num">' + days + '<span class="text">days</span></span>\
                                <span class="num">' + hours + ' : </span>\
                                <span class="num">' + minutes + ' : </span>\
                                <span class="num">' + seconds + '</span>';
                            } else if (self.hasClass('style-2')) {
                                strCountDown = '<span class="title-countDown">Limited-Time Offers, End in:</span>\
                                <span class="num">' + days + '<span>D : </span></span>\
                                <span class="num">' + hours + '<span>H : </span></span>\
                                <span class="num">' + minutes + '<span>M  : </span></span>\
                                <span class="num">' + seconds + '<span>S</span></span>';
                              
                            } else {
                                strCountDown = '<span class="num">' + days + '<span>Day</span></span>\
                                <span class="num">' + hours + '<span>Hrs</span></span>\
                                <span class="num">' + minutes + '<span>Min</span></span>\
                                <span class="num">' + seconds + '<span>Sec</span></span>';
                            }
                            self.html(strCountDown);
                        }
                    }, 0);
                });
            }
        },

        initCartCountDown: function() {
            if (!$('.cart-countdown').length)
                return;

            var timer,
                elCountDown = $('.cart-countdown .count_down'),
                minute = elCountDown.data('time');

            function startTimer(duration, display) {
                timer = duration;
                var minutes, seconds;
                setInterval(function() {
                    minutes = parseInt(timer / 60, 10)
                    seconds = parseInt(timer % 60, 10);

                    minutes = minutes < 10 ? "0" + minutes : minutes;
                    seconds = seconds < 10 ? "0" + seconds : seconds;

                    display.textContent = minutes + ":" + seconds;

                    if (--timer < 0) {
                        timer = duration;
                    }
                }, 1000);
            }

            $( document ).ready(function() {
                fiveMinutes = 60 * minute,
                display = document.querySelector('#time');
                startTimer(fiveMinutes, display);
            })
        },

        initProductCustomerViewing: function() {
            var wrapper = $(".productView-more").find('[data-customer-view]');

            if (wrapper.length > 0) {
                var numbersViewer = wrapper.data('customer-view'),
                    numbersViewerList = JSON.parse('[' + numbersViewer + ']'),
                    numbersViewerTime = wrapper.data('customer-view-time'),
                    timeViewer = parseInt(numbersViewerTime) * 1000;

                setInterval(function() {
                    var numbersViewerItem = (Math.floor(Math.random() * numbersViewerList.length));

                    wrapper.find('.text').text('[number] customers are viewing this product'.replace('[number]', numbersViewerList[numbersViewerItem]));
                }, timeViewer);
            }
        },

        initProductSizeChart: function() {
            var btnSizeChart = $('[data-open-size-chart-popup]'),
                btnClose = $(".background-overlay, .halo-popup-close");


            if (btnSizeChart.length) {
                btnSizeChart.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    $body.addClass('size-chart-show');
                });

                btnClose.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if ($body.hasClass('size-chart-show')) {
                        $body.removeClass('size-chart-show');
                    }
                });
            }
        },

        initProductCompareColor: function (){
            var btnColorCompare = $('[data-open-compare-color-popup]'),
                btnClose = $(".background-overlay, .halo-popup-close"),
                imageList = $('.halo-compareColors-image .row');

            if(btnColorCompare.length > 0){
                btnColorCompare.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    $body.addClass('compare-color-show');
                });

                $doc.on('change', '.swatch-compare-color-option', (event) => {
                    var $this = $(event.currentTarget)
                        id = $this.val();
                        title = $this.siblings().attr('title'),
                        image = $this.siblings().attr('data-variant-img');
                        item = `<div class="halo-row-item item col-6 col-md-4 col-lg-3 item-${id} item-compare-color"><span class="image"><img src="${image}" alt="${title}"></span><span class="title text-center">${title}</span></div>`;
    
                    if (event.target.checked) {
                        imageList.append(item);
                    } else {
                        imageList.find(`.item-${id}`).remove();
                    }
                });

                btnClose.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if ($body.hasClass('compare-color-show')) {
                        $body.removeClass('compare-color-show');
                    }
                });
            }
        },

        initProductQuickView: function() {
            var btnSizeChart = $('[data-open-quick-view-popup]'),
                btnClose = $(".background-overlay-popup, [data-close-quickView-popup]");


            if (btnSizeChart.length) {
                btnSizeChart.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    $body.addClass('quick-view-show');
                });

                btnClose.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if ($body.hasClass('quick-view-show')) {
                        $body.removeClass('quick-view-show');
                    }
                });
            }
        },

        initProductAskAnExpert: function() {
            var btnNotify = $('[data-open-ask-an-expert]'),
                btnClose = $(".background-overlay, .halo-popup-close");


            if (btnNotify.length) {
                btnNotify.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    $body.addClass('ask-an-expert-show');
                });

                btnClose.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if ($body.hasClass('ask-an-expert-show')) {
                        $body.removeClass('ask-an-expert-show');
                    }
                });
            }
        },

        initCardSwatch: function() {
            var cardSwatch = $('.card-swatch');

            if(cardSwatch.length > 0){
                var swatchItem = cardSwatch.find('.item');
                
                swatchItem.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    var self = $(event.currentTarget),
                        label = self.find('.swatch-label'),
                        value = label.data('value');

                    self.parents('.card-swatch').find('.swatch-label').removeClass('is-active');
                    label.addClass('is-active');
                    if($body.hasClass('skin-9')){
                        self.parents(".product-card-bottom").find('.card-title [data-change-title]').text(value);
                    }else{
                        self.parents(".product-card-bottom").find('.card-title [data-change-title]').text( ' - ' + value);
                    }

                })  
            }
        },

        initZoomImage: function() {

            var productZoom = $(".halo-productView").find('[data-zoom-image]');

            if ($win.width() > 1024) {
                productZoom.each((index, element) => {
                    var $this = $(element);

                    if ($win.width() > 1024) {
                        $this.zoom({ url: $this.attr('data-zoom-image'), touch: false });
                    } else {
                        $this.trigger('zoom.destroy');
                    }
                });
            }
        },

        initProductImageGallery: function() {
            var sliderFor = $(".halo-productView").find('.productView-for'),
                sliderNav = $(".halo-productView").find('.productView-nav'),
                arrow = sliderNav.data('arrow'),
                vertical = sliderFor.data('vertical'),
                iconArrow = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="presentation"><path d="M 7.75 1.34375 L 6.25 2.65625 L 14.65625 12 L 6.25 21.34375 L 7.75 22.65625 L 16.75 12.65625 L 17.34375 12 L 16.75 11.34375 Z"/></svg>';

            if(sliderNav.hasClass('productView-nav-fullwidth')){
                if ($win.width() < 768) {
                    if (!sliderNav.hasClass('slick-initialized')) {
                        sliderNav.slick({
                            dots: false,
                            arrows: true,
                            infinite: true,
                            speed: 300,
                            slidesToShow: 1,
                            slidesToScroll: 1,
                            nextArrow: '<button type="button" class="slick-arrow slick-next" aria-label="Slide Next">' + iconArrow + '</button>',
                            prevArrow: '<button type="button" class="slick-arrow slick-prev" aria-label="Slide Prev">' + iconArrow + '</button>'
                        });
                    }
                }
            }else{
                if (!sliderFor.hasClass('slick-initialized') && !sliderNav.hasClass('slick-initialized')) {
                    if(sliderNav.hasClass('productView-nav-gallery')) {
                        sliderNav.slick({
                            rows: 2,
                            dots: true,
                            arrows: false,
                            infinite: true,
                            speed: 300,
                            slidesToShow: 2,
                            slidesToScroll: 2,
                            nextArrow: '<button type="button" class="slick-arrow slick-next" aria-label="Slide Next">' + iconArrow + '</button>',
                            prevArrow: '<button type="button" class="slick-arrow slick-prev" aria-label="Slide Prev">' + iconArrow + '</button>',
                            responsive: [
                                {
                                    breakpoint: 768,
                                    settings: {
                                        arrows: true
                                    }
                                }
                            ]
                        });
                    }else{
                        sliderFor.slick({
                            slidesToShow: 5,
                            slidesToScroll: 1,
                            asNavFor: sliderNav,
                            arrows: true,
                            dots: false,
                            draggable: false,
                            adaptiveHeight: false,
                            focusOnSelect: true,
                            vertical: vertical,
                            verticalSwiping: false,
                            infinite: false,
                            nextArrow: '<button type="button" class="slick-arrow slick-next" aria-label="Slide Next">' + iconArrow + '</button>',
                            prevArrow: '<button type="button" class="slick-arrow slick-prev" aria-label="Slide Prev">' + iconArrow + '</button>',
                            responsive: [{
                                breakpoint: 1280,
                                settings: {
                                    slidesToShow: 4,
                                    slidesToScroll: 1
                                }
                            },
                            {
                                breakpoint: 1025,
                                settings: {
                                    vertical: false
                                }
                            }]
                        });
                        sliderNav.slick({
                            fade: true,
                            arrows: arrow,
                            dots: false,
                            infinite: false,
                            slidesToShow: 1,
                            slidesToScroll: 1,
                            nextArrow: '<button type="button" class="slick-arrow slick-next" aria-label="Slide Next">' + iconArrow + '</button>',
                            prevArrow: '<button type="button" class="slick-arrow slick-prev" aria-label="Slide Prev">' + iconArrow + '</button>',
                            asNavFor: sliderFor
                        });
                    }

                }
            }
        },

        initWishlistActive: function() {
            $doc.on('click', '[data-wishlist]', (event) => {
                event.preventDefault();
                event.stopPropagation();

                var $target = $(event.currentTarget);

                if (!$target.hasClass('wishlist-added')) {
                    $target
                        .addClass('wishlist-added')
                        .find('.text')
                        .text('Added to wishlist');
                } else {
                    $target
                        .removeClass('wishlist-added')
                        .find('.text')
                        .text("Add to wishlist");
                }
            });
        },

        initUpdateValueQuantity: function() {
            var btnQuantity = $('.previewCartItem-qty .btn-quantity');

            btnQuantity.on('click', (event) => {
                event.preventDefault();
                event.stopPropagation();

                var self = $(event.target);
                var $target = self.siblings('input[name="quantity"]');
                var currentVal = parseInt($target.val());

                if (self.hasClass('minus')) {
                    if (currentVal >= 2) $target.val(currentVal - 1)
                } else {
                    $target.val(currentVal + 1)
                }

            });
        },

        initMenuMobile: function() {
            var iconMenu = $('[data-mobile-menu]'),
                itemDropdown = $('.site-nav-mobile .menu-lv-item.dropdown .menu_mobile_link'),
                btnClose = $(".background-overlay, .halo-sidebar-close"),
                navTitle = $('.nav-title-mobile');

                if (iconMenu.length) {
                    iconMenu.on('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
    
                        $body.addClass('menu-sidebar_show');
                    });
    
                    btnClose.on('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if ($body.hasClass('menu-sidebar_show')) {
                            $body.removeClass('menu-sidebar_show');
                        }
                    });

                    itemDropdown.on('click', (event) => {
                        // event.preventDefault();
                        // event.stopPropagation();
        
                        var $target = $(event.target);
                        $target.parent().siblings().removeClass('is-open').addClass('is-hidden');
                        $target.parent().removeClass('is-hidden').addClass('is-open');
                    });
        
                    navTitle.on('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
        
                        var $target = $(event.target);
                        var $target = $(event.currentTarget),
                            $parentLv1 = $target.parents('.menu-lv-1'),
                            $parentLv2 = $target.parents('.menu-lv-2'),
                            $parentLv3 = $target.parents('.menu-lv-3');
        
                            if ($parentLv3.length > 0) {
                                $parentLv3.siblings().removeClass('is-hidden');
                                $parentLv3.removeClass('is-open');
                            } else if ($parentLv2.length > 0) {
                                $parentLv2.siblings().removeClass('is-hidden');
                                $parentLv2.removeClass('is-open');
                            } else if ($parentLv1.length > 0) {
                                $parentLv1.siblings().removeClass('is-hidden');
                                $parentLv1.removeClass('is-open');
                            }
                    });
                }
        },

        initShowPopupLookBook: function() {
            $doc.on('click', '[data-open-lookbook-popup]', (event) => {
                event.preventDefault();
                var $target = $(event.currentTarget),
                    $popup = $target.siblings('.popup-lookbook');
                if(!$target.hasClass('active')){
                    $target.addClass('active');
                    $popup.addClass('open');
                } else {
                    $target.removeClass('active');
                    $popup.removeClass('open');
                }   
            });
            $doc.on('click', (event) =>{
                if(!event.target.closest('[data-open-lookbook-popup]') && !event.target.closest('[data-lookbook-popup]')){
                    $('[data-open-lookbook-popup]').removeClass('active');
                    $('[data-lookbook-popup]').removeClass('open');
                }
            });
            $doc.on('click', '[data-close-popup]', (event) =>{
                event.preventDefault();
                $('[data-open-lookbook-popup]').removeClass('active');
                $('[data-lookbook-popup]').removeClass('open');
            });
        },

        initShowPopupSearch: function(){
            var btnLangCurrency = $("[data-open-search-popup]"),
                btnClose = $(".background-overlay, [data-close-search-popup]");

            if (btnLangCurrency.length) {
                btnLangCurrency.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    $body.addClass('search-popup-show');
                });

                btnClose.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if ($body.hasClass('search-popup-show')) {
                        $body.removeClass('search-popup-show');
                    }
                });

            }
        },

        initToggleSidebarMobile: function() {
            var btnClose = $(".background-overlay, .halo-page-sidebar-close");

            $doc.on('click', '[data-sidebar]', (event) => {
                event.preventDefault();
                event.stopPropagation();

                $body.addClass('open-mobile-sidebar');
            });

            btnClose.on('click', (event) => {
                event.preventDefault();
                event.stopPropagation();

                if ($body.hasClass('open-mobile-sidebar')) {
                    $body.removeClass('open-mobile-sidebar');
                }
            });

        },

        initPriceRangeFilter: function(){
            var filterPrice = $(".filter-price");
            if(filterPrice.length > 0){
                var lowerSlider = filterPrice.find('#range-lower'),
                    upperSlider = filterPrice.find('#range-upper');

                upperSlider.on('input propertychange', () => {
                    var upperVal = parseInt(upperSlider.val());
                   
                    filterPrice.find('#filter__max').val(upperVal);
                });

                lowerSlider.on('input propertychange', () => {
                    var lowerVal = parseInt(lowerSlider.val());

                    filterPrice.find('#filter__min').val(lowerVal);
                });
            }

        },

        initCollapseSidebarBlock: function (){
            var windowWidth = window.innerWidth;
                headingSidebar = $('.sidebarBlock-headingWrapper .sidebarBlock-heading'),
                blockWrapper = $('.sidebarBlock-content');

            $doc.on('click', '.sidebarBlock-headingWrapper .sidebarBlock-heading', (event) => {
                var $target = $(event.currentTarget),
                    $blockCollapse = $target.parent().siblings();

                if($target.hasClass('is-clicked')){
                    $target.removeClass('is-clicked');
                    $blockCollapse.slideUp('slow'); 
                } else {
                    $target.addClass('is-clicked');
                    $blockCollapse.slideDown('slow');
                }
            });

            if(windowWidth < 1025){
                    headingSidebar.addClass('is-clicked');
                    blockWrapper.css("display","block");
            }else{
                if($('.page-sidebar.page-sidebar--horizontal').length > 0){
                    $body.on('click', (event) => {
                        if(($(event.target).closest('.sidebarBlock-headingWrapper').length === 0) && ($(event.target).closest('.sidebarBlock-content').length === 0)){
                            if(headingSidebar.hasClass('is-clicked')){
                                headingSidebar.removeClass('is-clicked');
                                blockWrapper.slideUp('slow'); 
                            }
                        }
                    });
                }
            }

        },

        initAddEventViewModeLayout: function (){
            halo.setActiveViewModeMediaQuery();
 
             $body.on('click', '.toolbar-viewAs .icon-mode', function (e) {
                 e.preventDefault();
                 var self = $(this),
                     parents = self.closest('[data-view-as]');
 
                 if (!self.hasClass('active')) {
                     parents.find('.icon-mode').removeClass('active');
                     self.addClass('active');

                     halo.viewModeLayout();
                     halo.initMasonry();
                 };
             });
        },
         
        viewModeLayout: function () {
             var viewMode = $('[data-view-as]'),
                 viewModeActive = viewMode.find('.icon-mode.active'),
                 col = viewModeActive.data('col'),
                 products = $('.collection-template .product-collection'),
                 gridItem = products.find('.grid-item'),
                 strClass = 'col-12 col-6 col-md-4 col-lg-3 col5';
 
             switch (col) {
                case 1:
                     products.removeClass('products-grid').addClass('products-list');
                     gridItem.removeClass(strClass).addClass('col-12');
                     break;
                default:
                    switch (col) {
                         case 2:
                             products.removeClass('products-list').addClass('products-grid');
                             gridItem.removeClass(strClass).addClass('col-6');
                             break;
 
                         case 3:
                             products.removeClass('products-list').addClass('products-grid');
                             gridItem.removeClass(strClass).addClass('col-6 col-md-4');
                             break;
 
                         case 4:
                             products.removeClass('products-list').addClass('products-grid');
                             gridItem.removeClass(strClass).addClass('col-6 col-md-4 col-lg-3');
                             break;
 
                         case 5:
                             products.removeClass('products-list').addClass('products-grid');
                             gridItem.removeClass(strClass).addClass('col-6 col-md-4 col-lg-3 col5');
                             break;
                    }
                };
        },
 
        setActiveViewModeMediaQuery: function () {
             var viewMode = $('[data-view-as]'),
                 viewModeActive = viewMode.find('.icon-mode.active'),
                 col = viewModeActive.data('col'),
                 windowWidth = window.innerWidth;
 
             if (windowWidth < 768) {
                 if (col === 3 || col == 4 || col == 5) {
                     viewModeActive.removeClass('active');
                     $('[data-col="2"]').addClass('active');
                 }
             } else if (windowWidth < 992 && windowWidth >= 768) {
                 if (col == 2 || col == 4 || col == 5) {
                     viewModeActive.removeClass('active');
                     $('[data-col="3"]').addClass('active');
                 }
             } else if (windowWidth < 1200 && windowWidth >= 992) {
                 if (col == 2 || col == 2 || col == 3 || col == 5) {
                     viewModeActive.removeClass('active');
                     $('[data-col="4"]').addClass('active');
                 }
             }
             if (viewMode.length) {
                 halo.viewModeLayout();
             }
        },

        initToolbar: function() {
            var wrapper =  $('.toolbar'),
                btnDropdown = wrapper.find('[data-toggle]');
            

            btnDropdown.on('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                var self = $(event.target);

                if($(".dropdown-menu").hasClass("is-open")){
                    $(".dropdown-menu").removeClass("is-open");
                }else{
                    self.siblings(".dropdown-menu").addClass("is-open");
                }

            });

            if($win.innerWidth() < 1025) {
                var top = wrapper.offset().top;
                
                $(window).scroll(function () {
                    var h = $('.sticky-wrapper.is-sticky').outerHeight();
                    var checkHeaderSticky = $('.header.sticky-down');
                    if ($(this).scrollTop() > top) {
                        wrapper.addClass("toolbar-fix");
                        if(checkHeaderSticky.length > 0){
                            wrapper.css('top', '50px');
                        }else{
                            wrapper.css('top', 0);
                        }
                    }else {
                        $('[data-section-type="collection-template"]').css('padding-top', 0);
                        wrapper.removeClass("toolbar-fix");
                        wrapper.css('top', 0);
                    }
                });
            }else{
                wrapper.removeClass("toolbar-fix");
                wrapper.css('top', 0);
            }

            $body.on('click', (event) =>{
                $(".dropdown-menu").removeClass("is-open");
            })
        },

        initMasonry: function() {
            var t = $(".collection-template .product-collection[data-layout]");
            if (t.length) {
                var e = t.data("layout"),
                    i = t.isotope({
                    layoutMode: e,
                    itemSelector: "[data-gridItem]"
                });
                return i
            }
        },

        initBeforeYouLeave: function() {
            var $beforeYouLeave = $('#halo-leave-sidebar'),
                time = $beforeYouLeave.data('time'),
                idleTime = 0,
                btnClose = $(".background-overlay, .halo-sidebar-close");
                
            if (!$beforeYouLeave.length) {
                return;
            } else {
                var slickInterval = setInterval(() => {
                    timerIncrement();
                }, time);

                $body.on('mousemove keydown scroll', () => {
                    resetTimer();
                });
            }
            
            function timerIncrement() {
                idleTime = idleTime + 1;
                if (idleTime >= 1 && !$body.hasClass('before-you-leave-show')) {
                    $body.addClass('before-you-leave-show');
                } 
            }

            function resetTimer() {
                idleTime = -1;
            };

            btnClose.on('click', (event) => {
                if ($body.hasClass('before-you-leave-show')) {
                    $body.removeClass('before-you-leave-show');
                }
            });            
        },

        initNotification: function() {
            var $notification = $('.halo-notification-popup'),
            time = $notification.data('time'),
            idleTime = 0,
            btnClose = $(".halo-popup-close");
            
            if (!$notification.length) {
                return;
            } else {
                var slickInterval = setInterval(() => {
                    timerIncrement();
                }, time);
            }

            function timerIncrement() {
                idleTime = idleTime + 1;

                if (idleTime >= 1 && !$body.hasClass('notification-show')) {
                    $body.addClass('notification-show');
                } else {
                    $body.removeClass('notification-show');
                } 
            }

            btnClose.on('click', (event) => {
                if ($body.hasClass('notification-show')) {
                    $body.removeClass('notification-show');
                }
            });    
        },

        initProductNextPrev: function(){
            var wrapper = $('.product-detail').find('.productView-nextProducts');
            if (wrapper.length > 0 && $win.width() > 1024) {
                
                const prodWrap = wrapper.find('.next-prev-modal'),
                    prodIcons = wrapper.find('.next-prev-icons'),
                    nextWrap = $('#next-product-modal'),
                    prevWrap = $('#prev-product-modal');

                prodIcons.on('mouseover', () => {
                    prodWrap.addClass('is-show');
                })
                .on('mouseleave', () => {
                    prodWrap.removeClass('is-show');
                });

                $('.next-icon', prodIcons).on('mouseover', () => {
                    prevWrap.removeClass('is-active');
                    nextWrap.addClass('is-active');
                });

                $('.prev-icon', prodIcons).on('mouseover', () => {
                    nextWrap.removeClass('is-active');
                    prevWrap.addClass('is-active');
                });

                prodWrap.on('mouseover', () => {
                    prodWrap.addClass('is-show');
                })
                .on('mouseleave', () => {
                    prodWrap.removeClass('is-show');
                });
            }
        },

        initProductBUndle: function() {
            var btnChooseOption = $('.halo-product-bundle .bundle-product-toogle'),
                btnclose = $(".halo-popup-close");

            if (btnChooseOption.length) {
                btnChooseOption.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    var self = $(event.currentTarget),
                    itemProduct = self.parents('.bundlePdItem');

                    $('.halo-product-bundle .bundlePdItem').removeClass('is-open');
                    itemProduct.addClass('is-open');

                });

                btnclose.on('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    $('.halo-product-bundle .bundlePdItem').removeClass('is-open');
                });

                $body.on('click', (event) => {
                    if(($(event.target).closest('.bundle-product-options').length === 0) && ($(event.target).closest('.bundlePdItem-wrapper').length === 0)){
                        $('.halo-product-bundle .bundlePdItem').removeClass('is-open');
                    }
                });

            }
        },

        initProductVariantChange: function() {
            var wrapper =  $('.productView-variants'),
                variantInputItem = wrapper.find('.product-form__radio'),
                variantItemAvailable  = wrapper.find('.product-form__label.available '),
                variantSoldoutItem = wrapper.find('.product-form__label.soldout'),
                productViewNotifyMe = $('.previewCartAction .productView-notifyMe');
            
            variantInputItem.on('change', (event) => {
                var self = $(event.currentTarget),
                    value = self.val();

                self.siblings('.form__label').find('[data-header-option]').text(value);
            })

            variantItemAvailable.on('click', (event) => {
                event.preventDefault;
                event.stopPropagation;

                var btnAction = $(event.currentTarget).parents('.productView-variants').siblings('.previewCartAction'),
                    btnValue = btnAction.find('.button-view-cart');

                btnValue.text('Add To Cart');
                btnValue.removeAttr('disabled',);
                productViewNotifyMe.slideUp('slow');
            });

            variantSoldoutItem.on('click', (event) => {
                event.preventDefault;
                event.stopPropagation;
                var btnAction = $(event.currentTarget).parents('.productView-variants').siblings('.previewCartAction'),
                    btnValue = btnAction.find('.button-view-cart');

                productViewNotifyMe.slideDown('slow');
                btnValue.attr('disabled', 'true');
                btnValue.text('Sold Out');
                

            });
        },

        initStickyAddToCart: function () {
            var offSetTop = $('.productView-information  .productView-action').offset().top;

            $(window).scroll(function () {
                var scrollTop = $(this).scrollTop();
                

                if (scrollTop > offSetTop) {
                    $('.productView-stickyCart').addClass('show-sticky');
                    $('body').addClass('show-sticky-cart');
                }
                else {
                    $('.productView-stickyCart').removeClass('show-sticky');
                    $('body').removeClass('show-sticky-cart')
                }
            });

        },

        initShowCustomReview: function () {
            var btnWriteReview = $('#tab-review  [data-write-review]'),
                btnSubmitreview = $('#tab-review  .spr-form-actions .button')
                formWriteReview = $('#tab-review .spr-form');

            formWriteReview.slideUp('slow');
            btnWriteReview.on('click', (event) => {
                event.stopPropagation();
                event.preventDefault();

                formWriteReview.slideDown('slow');
            });
            btnSubmitreview.on('click', (event) => {
                event.stopPropagation();
                event.preventDefault();
                
                formWriteReview.slideUp('slow');
            });
        },

        initOpenTabsProduct: function (){
            var wrapper = $('.product-layout-full-width'),
                tabItem = wrapper.find('.productView-tabs [data-open-tab]'),
                btnClose = wrapper.find('[data-close-tab]');
            if(wrapper.length > 0){
                tabItem.on('click', (event) =>{
                    var self = $(event.currentTarget);
    
                    self.siblings().addClass('is-active');
                });
    
                btnClose.on('click', (event) =>{
    
                    $('.productView-tab ').removeClass('is-active');
                });
    
                $body.on('click', (event) => {
                    if(($(event.target).closest('.productView-tab').length === 0) && ($(event.target).closest('.productView-tabs [data-open-tab]').length === 0)){
                        $('.productView-tab ').removeClass('is-active');
                    }
                });
            }
        },

        initCloseAcceptCookie: function () {
            var cookieElm =  $('.halo-accept-cookie-popup'),
                btnClose = cookieElm.find('[data-close-accept]');
                
            // if ($.cookie('acceptcookie') == 'closed') {
            //     cookieElm.addClass('is-hidden')
            // }

            btnClose.on('click.closecookie', function (e) {
                e.preventDefault();
                e.stopPropagation();
                
                cookieElm.addClass('is-hidden')
                // cookieElm.remove();
                // $.cookie('acceptcookie', 'closed', {
                //     expires: 1,
                //     path: '/'
                // });
            });
        },

        intiShowItemGallery: function () {
            var elm = $('.block-custom-instagram'),
            btnLoadMore = elm.find('[data-load-item]'),
            itemShow = elm.find('.halo-row-item');

            if(elm.length > 0){
                if ($win.width() < 768) {
                    itemShow.slice(0, 2).show();
                    btnLoadMore.on("click", function(e){
                        e.preventDefault();
                        elm.find('.halo-row-item:hidden').slice(0, 2).slideDown();
                        if(elm.find('.halo-row-item:hidden').length === 0){
                            btnLoadMore.hide();
                        }
                    });
                }else if ($win.width() < 1025) {
                    itemShow.slice(0, 3).show();
                    btnLoadMore.on("click", function(e){
                        e.preventDefault();
                        elm.find('.halo-row-item:hidden').slice(0, 3).slideDown();
                        if(elm.find('.halo-row-item:hidden').length === 0){
                            btnLoadMore.hide();
                        }
                    });
                }else{
                    itemShow.slice(0, 5).show();
                    btnLoadMore.on("click", function(e){
                        e.preventDefault();
                        elm.find('.halo-row-item:hidden').slice(0, 5).slideDown();
                        if(elm.find('.halo-row-item:hidden').length === 0){
                            btnLoadMore.hide();
                        }
                    });
                }
            }
            
        },

        initShuffleFilter: function (){
            var wrapperElm = $('.shuffle-filter');
            if(wrapperElm.length > 0){
                var Shuffle = window.Shuffle;
                element = $('.shuffle-container');
                sizer = $('.sizer-element'),
                tab = $('.shuffle-tabs .tabs .tab');
        
                var shuffleInstance = new Shuffle(element, {
                itemSelector: '.masonry-item',
                sizer: sizer
                });
            
                tab.find('a').on('click', function(event){
                    event.preventDefault();
                
                    var $this = $(event.currentTarget),
                        tabActiver = $this.parents('.tab');
                        filterVal = tabActiver.data("filter");

                        tab.removeClass('is-active');
                        tabActiver.addClass('is-active');

                    if(filterVal == 'all'){
                        shuffleInstance.filter();
                    }else{
                        shuffleInstance.filter(function (element) {
                            if($(element).data('filter-item') != undefined)
                            return $(element).data('filter-item').indexOf(filterVal) != -1;
                        });
                    }
                })
            }
        }
    }
})(jQuery);