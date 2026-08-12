import { Link } from 'react-router-dom';
import { loadEticaretSettings } from '../../core/settings';
import { buildStorefrontBasePath } from '../../core/tenantResolver';
import type { EticaretSettings } from '../../core/types';

type Props = {
  tenantCode: string;
  displayName?: string;
  settings?: EticaretSettings;
};

export function EllaHeader({ tenantCode, displayName, settings: settingsProp }: Props) {
  const settings = settingsProp ?? loadEticaretSettings();
  const base = buildStorefrontBasePath(tenantCode);
  const label = displayName?.trim() || tenantCode;

  return (
    <>
      <div className="announcement-bar">
        <div className="container container-1170">
          <div className="announcement-bar__message text-center uppercase">
            <div className="message">{settings.announcementText}</div>
          </div>
        </div>
      </div>

      <header className="header header-default animate">
        <div className="header-top">
          <div className="container container-1170">
            <div className="header-top--wrapper">
              <div className="header-top--left header__logo text-left clearfix">
                <h1 className="header__heading">
                  <Link to={base} className="header__heading-link focus-inset">
                    <img
                      src="/eticaret-static/ella/assets/images/ella-logo-black.png"
                      alt={settings.storeTitle}
                    />
                  </Link>
                </h1>
              </div>
              <div className="header-top--right header__icons text-right clearfix">
                <div className="header-top-right-group">
                  <div className="customer-service-text">
                    {settings.storeTitle} · <span>{label}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="header-bottom">
          <div className="container container-1170">
            <nav className="header__inline-menu">
              <ul className="list-menu list-menu--inline">
                <li className="list-menu__item">
                  <Link to={base} className="header__menu-item list-menu__item--link">
                    Ana Sayfa
                  </Link>
                </li>
                <li className="list-menu__item">
                  <Link to={`${base}/kategori`} className="header__menu-item list-menu__item--link">
                    Ürünler
                  </Link>
                </li>
                <li className="list-menu__item">
                  <Link to={`${base}/sepet`} className="header__menu-item list-menu__item--link">
                    Sepet
                  </Link>
                </li>
                <li className="list-menu__item">
                  <Link to={`${base}/sayfa/iletisim`} className="header__menu-item list-menu__item--link">
                    İletişim
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </header>
    </>
  );
}
