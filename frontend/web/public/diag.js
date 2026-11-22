// Plain old JavaScript on purpose, so it runs on any browser.
  document.getElementById('ua').textContent = navigator.userAgent;
  var m = navigator.userAgent.match(/Chrome\/(\d+)/);
  var checks = [
    ['גרסת Chrome', m ? m[1] : 'לא ידוע', m ? +m[1] >= 64 : false],
    ['מודולים (module)', 'noModule' in document.createElement('script') ? 'כן' : 'לא', 'noModule' in document.createElement('script')],
    ['BigInt', typeof BigInt !== 'undefined' ? 'כן' : 'לא', typeof BigInt !== 'undefined'],
    ['fetch', typeof fetch !== 'undefined' ? 'כן' : 'לא', typeof fetch !== 'undefined'],
    ['IndexedDB', typeof indexedDB !== 'undefined' ? 'כן' : 'לא', typeof indexedDB !== 'undefined'],
    ['גודל מסך', window.innerWidth + '×' + window.innerHeight, true]
  ];
  var ul = document.getElementById('list');
  for (var i = 0; i < checks.length; i++) {
    var li = document.createElement('li');
    li.className = checks[i][2] ? 'ok' : 'bad';
    li.textContent = (checks[i][2] ? '✓ ' : '✗ ') + checks[i][0] + ': ' + checks[i][1];
    ul.appendChild(li);
  }
  var t0 = Date.now();
  var x = new XMLHttpRequest();
  x.open('GET', '/__/firebase/init.json');
  x.onload = function () { add(x.status === 200, 'חיבור לשרת: ' + x.status + ' (' + (Date.now() - t0) + 'ms)'); };
  x.onerror = function () { add(false, 'חיבור לשרת נכשל'); };
  x.send();
  function add(ok, text) { var li = document.createElement('li'); li.className = ok ? 'ok' : 'bad'; li.textContent = (ok ? '✓ ' : '✗ ') + text; ul.appendChild(li); }

// Step 2: load the real site's code here and show any error it hits.
window.addEventListener('error', function (e) {
  var where = e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno + ':' + e.colno : '';
  add(false, 'שגיאה: ' + (e.message || 'לא ידועה') + where);
}, true);
window.addEventListener('unhandledrejection', function (e) {
  add(false, 'שגיאה (promise): ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
});
var root = document.createElement('div');
root.id = 'root';
root.style.display = 'none';
document.body.appendChild(root);
var xh = new XMLHttpRequest();
xh.open('GET', '/screen');
xh.onload = function () {
  // Run the app as if this were the screen page (the address bar changes, the page stays).
  try { history.replaceState(null, '', '/screen?diag=1'); } catch (err) { add(false, 'history: ' + err.message); }
  var re = /<script type="module" crossorigin src="([^"]+)"/g, m, n = 0;
  while ((m = re.exec(xh.responseText))) {
    var s = document.createElement('script');
    s.type = 'module';
    s.src = m[1];
    s.onerror = (function (src) { return function () { add(false, 'לא נטען: ' + src); }; })(m[1]);
    document.body.appendChild(s);
    n++;
  }
  add(n > 0, 'קבצי קוד שנמצאו: ' + n);
  setTimeout(function () {
    add(root.children.length > 0, root.children.length > 0 ? 'האתר רץ בהצלחה' : 'האתר לא הצליח לרוץ');
  }, 8000);
};
xh.send();
