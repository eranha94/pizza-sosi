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
