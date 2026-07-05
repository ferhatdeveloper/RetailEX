import { createRoot } from 'react-dom/client';
import { EticaretIsolatedApp } from './EticaretIsolatedApp';
import './eticaret-isolated.css';

document.documentElement.classList.add('rex-eticaret-isolated');
document.body.classList.add('rex-eticaret-isolated');

const loader = document.getElementById('app-loader');
if (loader) loader.remove();

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<EticaretIsolatedApp />);
}
