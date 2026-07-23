/** html/body üzerinde RetailEX tema sınıfı ve arka plan rengi */
export function applyDocumentTheme(dark: boolean): void {
  if (typeof document === 'undefined') return;

  const html = document.documentElement;
  html.classList.toggle('dark', dark);
  html.style.colorScheme = dark ? 'dark' : 'light';

  const bgColor = dark ? '#0C141C' : '#F3F5F7';
  html.style.backgroundColor = bgColor;
  document.body.style.backgroundColor = bgColor;
}
