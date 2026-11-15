// Runs before the page paints: apply the saved look, or follow the phone's dark mode.
(function () {
  var t = null;
  try { t = localStorage.getItem('pizza-sosi-theme'); } catch { /* storage blocked */ }
  if (t !== 'light' && t !== 'dark' && t !== 'premium') {
    t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', t);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', { light: '#FEB800', dark: '#1a1513', premium: '#0b0907' }[t]);
})();
