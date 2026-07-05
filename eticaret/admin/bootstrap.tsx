import { createRoot } from 'react-dom/client';
import { EticaretAdminApp } from './EticaretAdminApp';
import './eticaret-admin.css';

document.documentElement.classList.add('rex-eticaret-admin');
document.body.classList.add('rex-eticaret-admin');

const loader = document.getElementById('app-loader');
if (loader) loader.remove();

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<EticaretAdminApp />);
}
