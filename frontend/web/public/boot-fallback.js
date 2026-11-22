/*
 * Safety net for old TV browsers (e.g. Android 9 WebView inside Fully Kiosk): they claim to support
 * modern "module" scripts, but loading them fails. If that happens – or the app hasn't started after
 * a while – load the classic build that the page already lists (nomodule tags) instead.
 * Plain ES5 on purpose. Runs before the module scripts (classic scripts in <head> run first).
 */
(function () {
  var tried = false;
  function booted() {
    return !!window.__pizzaBooted;
  }
  function loadClassic(reason) {
    if (tried || booted()) return;
    var poly = document.getElementById('vite-legacy-polyfill');
    var entry = document.getElementById('vite-legacy-entry');
    if (!poly || !entry) return;
    tried = true;
    window.__pizzaBootFallback = reason;
    var s = document.createElement('script');
    s.src = poly.getAttribute('src');
    s.onload = function () {
      if (!booted() && window.System) window.System.import(entry.getAttribute('data-src'));
    };
    document.head.appendChild(s);
  }
  window.addEventListener(
    'error',
    function (e) {
      var t = e && e.target;
      if (t && t.tagName === 'SCRIPT' && t.type === 'module') loadClassic('module-error');
    },
    true
  );
  setTimeout(function () {
    loadClassic('timeout');
  }, 8000);
})();
