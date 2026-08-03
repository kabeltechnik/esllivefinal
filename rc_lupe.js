(function () {
  // ============================================================
  //  rc_lupe v1 — Request-Lupe für den Crawler-Bau
  //  ------------------------------------------------------------
  //  Nachfolger von rc_recon.js. Leichter, weniger Schalter, und
  //  vor allem: der ausgegebene Code läuft wirklich.
  //
  //  BEDIENUNG (drei Schritte, alles im Panel unten rechts):
  //    1. Skript einfügen, dann die Seite EINMAL normal bedienen
  //       (Filter setzen, "Ok"/"Aktualisieren" klicken).
  //    2. In der Liste steht der Request, der die Daten bringt.
  //       Auf "Test" drücken — die Lupe stellt ihn selbst nach und
  //       sagt sofort, ob dieselben Daten zurückkommen.
  //    3. "Crawler" drückt eine fertige, lauffähige .js-Datei aus.
  //
  //  Warum kein Code-Kopieren mehr: rc_recon gab Snippets mit
  //  "const antwort = await fetch(...)" auf oberster Ebene aus. Das
  //  läuft NUR in der Chrome-Konsole und dort nur EINMAL — beim
  //  zweiten Einfügen bricht es mit "Identifier 'antwort' has
  //  already been declared" ab, in einer Datei sofort mit "await is
  //  only valid in async functions". Ein SyntaxError bricht vor der
  //  ersten Zeile ab, darum wirkte jeder kopierte Code kaputt.
  //  Alles, was diese Lupe ausgibt, steckt daher in einer IIFE:
  //  beliebig oft einfügbar, auch als Datei und im Autopiloten.
  // ============================================================
  'use strict';

  var VERSION = '1.0';
  var MAX = 80;            // Ringpuffer
  var CLIP = 8000;         // Zeichen je Antwort im Speicher (Form erkennen reicht)
  var KLICK_FENSTER = 4000;
  var MERK_KEY = 'rcLupe';

  // ---------- Re-Inject: alten Stand abräumen ----------
  if (window.rcLupe) {
    try { window.rcLupe.stop(true); } catch (e) {}
  }

  // ============================================================
  //  Zustand — bewusst klein
  // ============================================================
  var S = { seit: Date.now(), reqs: [], nr: 0, pause: false, letzterKlick: null, offen: null };

  // Nur die Kurzfassung überlebt einen Seitenwechsel (ohne Antwort-Body).
  // rc_recon legte die vollen Bodies in den sessionStorage: 80 Requests mit
  // je 20.000 Zeichen sprengen das 5-MB-Limit, und der Notfall-Pfad hat dann
  // genau die Antworten weggeworfen, um die es ging.
  try {
    var alt = JSON.parse(sessionStorage.getItem(MERK_KEY) || 'null');
    if (alt && alt.reqs) { S.reqs = alt.reqs.slice(-MAX); S.nr = alt.nr || S.reqs.length; S.seit = alt.seit || S.seit; }
  } catch (e) {}

  function schreibeMerk() {
    try {
      sessionStorage.setItem(MERK_KEY, JSON.stringify({
        seit: S.seit, nr: S.nr,
        reqs: S.reqs.slice(-MAX).map(function (r) {
          return { n: r.n, ts: r.ts, via: r.via, method: r.method, url: r.url, kopf: r.kopf, body: r.body, status: r.status, ms: r.ms, typ: r.typ, len: r.len, klick: r.klick };
        })
      }));
    } catch (e) {}
  }
  var merkTimer = null;
  function merken(sofort) {
    // sofort = synchron schreiben. Bei pagehide läuft kein setTimeout mehr,
    // da ist die Seite bereits weg.
    if (sofort) { if (merkTimer) { clearTimeout(merkTimer); merkTimer = null; } return schreibeMerk(); }
    // Sonst 600 ms gebündelt — nicht länger: Portale navigieren nach dem
    // Datenabruf gern gleich weiter (Login-Umleitung), und mit einem langen
    // Timer ist genau der Request weg, um den es ging.
    if (merkTimer) return;
    merkTimer = setTimeout(function () { merkTimer = null; schreibeMerk(); }, 600);
  }
  function beimVerlassen() { merken(true); }
  window.addEventListener('pagehide', beimVerlassen);

  // ============================================================
  //  Helfer
  // ============================================================
  function zeit(ts) {
    var d = new Date(ts), p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function kurz(s, n) {
    s = (s == null) ? '' : String(s);
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  var GEHEIM = /(pass|pwd|passwort|secret|kennwort|cvv|iban)/i;

  // Body lesbar machen — egal ob String, URLSearchParams, FormData, Blob, Objekt
  function bodyText(b) {
    try {
      if (b == null) return null;
      if (typeof b === 'string') return b;
      if (typeof URLSearchParams !== 'undefined' && b instanceof URLSearchParams) return b.toString();
      if (typeof FormData !== 'undefined' && b instanceof FormData) {
        var t = [];
        b.forEach(function (v, k) { t.push(encodeURIComponent(k) + '=' + encodeURIComponent(v && v.name ? '[Datei:' + v.name + ']' : String(v))); });
        return t.join('&');
      }
      if (typeof Blob !== 'undefined' && b instanceof Blob) return '[Blob ' + b.size + ' Byte]';
      if (typeof b === 'object') return JSON.stringify(b);
      return String(b);
    } catch (e) { return null; }
  }

  function kopfObj(h) {
    var o = {};
    try {
      if (!h) return o;
      if (typeof Headers !== 'undefined' && h instanceof Headers) { h.forEach(function (v, k) { o[k.toLowerCase()] = v; }); return o; }
      if (Array.isArray(h)) { h.forEach(function (p) { o[String(p[0]).toLowerCase()] = p[1]; }); return o; }
      Object.keys(h).forEach(function (k) { o[k.toLowerCase()] = h[k]; });
    } catch (e) {}
    return o;
  }

  // Nur Header, die für das Nachstellen zählen. Content-Length/Cookie gehören
  // NICHT dazu: die setzt der Browser selbst, ein eigener Wert bricht den Request.
  function wichtigeKopfzeilen(k) {
    var o = {};
    Object.keys(k || {}).forEach(function (n) {
      if (/^(content-type|x-requested-with|x-|accept|faces-request|soapaction|authorization)/i.test(n)
          && !/^(x-frame|x-content-type|x-xss)/i.test(n)) o[n] = k[n];
    });
    return o;
  }

  function istRauschen(u) {
    return /\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|css|map)(\?|$)/i.test(u)
      || /google-analytics|googletagmanager|doubleclick|piwik|matomo|hotjar|sentry|telemetry|\/beacon/i.test(u);
  }

  // Wie wahrscheinlich liefert dieser Request die Nutzdaten?
  function punkte(r) {
    if (istRauschen(r.url)) return -100;
    var p = 0;
    if (r.method === 'POST') p += 30;
    if (r.body && r.body.length > 20) p += 20;
    if (/json|xml|csv|html|text|excel|sheet/i.test(r.typ || '')) p += 10;
    p += Math.min(35, Math.round((r.len || 0) / 900));
    if (r.klick) p += 15;
    if (typeof r.status === 'number' && r.status >= 400) p -= 60;
    if (/ping|heartbeat|keepalive|poll\b/i.test(r.url)) p -= 25;
    if ((r.len || 0) < 40) p -= 20;
    // Fehlerseite: sichtbar lassen (der Nutzer soll sie finden), aber nie oben
    if (fehlerseite(r.antwort)) p -= 45;
    return p;
  }
  // Je Endpunkt nur der beste Aufruf. Ohne das Zusammenfassen verdrängen
  // Polling-Takte (Ligaliste, PrimeFaces) mit 40 identischen Aufrufen den
  // einen Request, um den es geht — die Liste wäre voller Duplikate.
  function kandidaten() {
    var beste = {};
    S.reqs.forEach(function (r) {
      var p = punkte(r);
      if (p <= 0) return;
      var schl;
      try { var u = new URL(r.url); schl = r.method + ' ' + u.origin + u.pathname; } catch (e) { schl = r.method + ' ' + r.url; }
      if (!beste[schl]) beste[schl] = { r: r, p: p, mal: 1 };
      else {
        beste[schl].mal++;
        if (p > beste[schl].p) { beste[schl].r = r; beste[schl].p = p; }
      }
    });
    return Object.keys(beste).map(function (k) { return beste[k]; })
      .sort(function (a, b) { return b.p - a.p; })
      .map(function (x) { x.r.__mal = x.mal; return x.r; });
  }

  function eintragen(r) {
    if (S.pause) return r;
    r.n = ++S.nr;
    r.klick = (S.letzterKlick && (r.ts - S.letzterKlick.ts) < KLICK_FENSTER) ? S.letzterKlick.text : null;
    S.reqs.push(r);
    if (S.reqs.length > MAX) S.reqs.shift();
    merken(); malen();
    return r;
  }

  // ============================================================
  //  Hooks
  // ============================================================
  var O = window.__rcLupeOrig || (window.__rcLupeOrig = {
    fetch: window.fetch,
    open: XMLHttpRequest.prototype.open,
    send: XMLHttpRequest.prototype.send,
    setH: XMLHttpRequest.prototype.setRequestHeader,
    WS: window.WebSocket
  });

  window.fetch = function (eingabe, init) {
    var t0 = Date.now(), url = '', method = 'GET', kopf = {}, body = null;
    try {
      if (typeof eingabe === 'string') url = eingabe;
      else if (eingabe && eingabe.url) { url = eingabe.url; method = eingabe.method || 'GET'; kopf = kopfObj(eingabe.headers); }
      if (init) {
        if (init.method) method = init.method;
        if (init.headers) kopf = Object.assign(kopf, kopfObj(init.headers));
        body = bodyText(init.body);
      }
    } catch (e) {}
    var r = eintragen({
      ts: t0, via: 'fetch', method: String(method).toUpperCase(), url: absolut(url),
      kopf: kopf, body: body, status: null, ms: null, typ: '', antwort: '', len: 0
    });
    return O.fetch.apply(this, arguments).then(function (res) {
      r.status = res.status; r.ms = Date.now() - t0;
      try {
        r.typ = res.headers.get('content-type') || '';
        // Antwort nur klonen, wenn sie klein genug ist — ein Klon von
        // Megabytes (Excel-Export!) kostet doppelt Speicher.
        var lang = parseInt(res.headers.get('content-length') || '0', 10);
        if (lang > 4000000) { r.antwort = '[' + lang + ' Byte, nicht mitgelesen]'; r.len = lang; malen(); return res; }
        res.clone().text().then(function (t) {
          r.len = t.length; r.antwort = kurz(t, CLIP); merken(); malen();
        }).catch(function () {});
      } catch (e) {}
      malen();
      return res;
    }).catch(function (e) {
      r.status = 'Fehler'; r.ms = Date.now() - t0; r.antwort = String(e); malen();
      throw e;
    });
  };

  XMLHttpRequest.prototype.open = function (m, u) {
    this.__l = { method: String(m || 'GET').toUpperCase(), url: u, kopf: {}, t0: Date.now() };
    return O.open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { if (this.__l) this.__l.kopf[String(k).toLowerCase()] = v; } catch (e) {}
    return O.setH.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (b) {
    var x = this, i = x.__l || { method: 'GET', url: '', kopf: {}, t0: Date.now() };
    var r = eintragen({
      ts: i.t0, via: 'xhr', method: i.method, url: absolut(i.url),
      kopf: i.kopf, body: bodyText(b), status: null, ms: null, typ: '', antwort: '', len: 0
    });
    x.addEventListener('loadend', function () {
      try {
        r.status = x.status; r.ms = Date.now() - i.t0;
        r.typ = (x.getResponseHeader && x.getResponseHeader('content-type')) || '';
        var t = (x.responseType === '' || x.responseType === 'text') ? x.responseText
              : (x.responseType === 'json' ? JSON.stringify(x.response) : '[' + x.responseType + ']');
        r.len = (t || '').length; r.antwort = kurz(t, CLIP);
        merken(); malen();
      } catch (e) {}
    });
    return O.send.apply(this, arguments);
  };

  // WebSocket über echte Vererbung — so bleiben CONNECTING/OPEN/CLOSING/CLOSED
  // und der prototype automatisch erhalten. rc_recon setzte nur OPEN und
  // CLOSED von Hand; Code, der readyState gegen CONNECTING prüft, verglich
  // dort gegen undefined.
  try {
    window.WebSocket = class extends O.WS {
      constructor() {
        super(...arguments);
        var r = eintragen({
          ts: Date.now(), via: 'ws', method: 'WS', url: absolut(arguments[0]),
          kopf: {}, body: null, status: 'offen', ms: null, typ: 'websocket', antwort: '', len: 0, frames: []
        });
        this.__l = r;
        this.addEventListener('message', function (ev) {
          if (r.frames.length < 30) r.frames.push({ ri: 'ein', data: kurz(typeof ev.data === 'string' ? ev.data : '[binär]', 1200) });
          r.len = r.frames.length; r.antwort = r.frames.length + ' Frames'; malen();
        });
        this.addEventListener('close', function () { r.status = 'zu'; malen(); });
      }
      send(d) {
        try { if (this.__l && this.__l.frames.length < 30) this.__l.frames.push({ ri: 'aus', data: kurz(bodyText(d), 1200) }); } catch (e) {}
        return super.send(d);
      }
    };
  } catch (e) { /* alter Browser: WebSocket bleibt unangetastet */ }

  function absolut(u) { try { return new URL(u, location.href).href; } catch (e) { return String(u); } }

  // Klick -> Request zuordnen
  function klickText(el) {
    if (!el || el.nodeType !== 1) return '';
    var t = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30) || el.value || el.getAttribute('aria-label') || '';
    return (el.id ? '#' + el.id : el.tagName.toLowerCase()) + (t ? ' "' + t + '"' : '');
  }
  function aufAktion(ev) {
    if (S.pause || (panel && panel.contains(ev.target))) return;
    S.letzterKlick = { ts: Date.now(), text: klickText(ev.target) };
  }
  ['click', 'change', 'submit'].forEach(function (t) { document.addEventListener(t, aufAktion, true); });

  // ============================================================
  //  Parameter zerlegen
  // ============================================================
  function paare(s) {
    if (!s) return null;
    var t = String(s).trim();
    if (t.charAt(0) === '{' || t.charAt(0) === '[') {
      try { return { art: 'json', obj: JSON.parse(t) }; } catch (e) { return null; }
    }
    if (t.indexOf('=') === -1) return null;
    var o = [];
    t.split('&').forEach(function (p) {
      var i = p.indexOf('=');
      var k = i === -1 ? p : p.slice(0, i), v = i === -1 ? '' : p.slice(i + 1);
      try { k = decodeURIComponent(k.replace(/\+/g, ' ')); } catch (e) {}
      try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) {}
      o.push([k, GEHEIM.test(k) ? '***' : v]);
    });
    return { art: 'form', liste: o };
  }

  // Sieht der Wert wie ein Token aus? (nicht hart eintragen, sondern frisch holen)
  function tokenhaft(v) {
    v = String(v || '');
    return v.length >= 16 && v.length < 3000 && !/\s/.test(v) && /\d/.test(v) && /[A-Za-z]/.test(v) && /^[A-Za-z0-9_\-+=/.:%]+$/.test(v);
  }

  // Ist die Antwort inhaltlich eine Fehler-/Loginseite? Der reine Größen-
  // vergleich reicht nicht: Die CCS-Fachanwendungen antworten mit HTTP 200 und
  // liefern trotzdem nur "Sie haben keine Berechtigung" oder einen ORA-Fehler.
  // Ohne diese Prüfung meldet ein Test "klappt", obwohl keine Daten kommen —
  // und das ist hier der Normalfall, denn ohne CCS-Login scheitert jeder
  // Direktaufruf (script_id fehlt oder Sitzung abgelaufen).
  function fehlerseite(text) {
    var t = String(text || '').slice(0, 4000);
    if (/keine Berechtigung|nicht berechtigt|not authoriz|access denied|forbidden/i.test(t)) return 'Keine Berechtigung — fehlt script_id, oder die Sitzung ist abgelaufen.';
    var ora = t.match(/ORA-\d{4,5}/);
    if (ora) return 'Datenbankfehler ' + ora[0] + ' — meist ein fehlender oder falsch benannter Parameter.';
    if (/<input[^>]+type=["']?password/i.test(t) || /(Anmeldung|Kennwort|Passwort|Sign in|Log ?in)\b/i.test(t) && /<form/i.test(t)) return 'Das ist die Anmeldeseite — die Sitzung besteht nicht mehr.';
    if (/session (expired|abgelaufen|timeout)|Sitzung.{0,20}(abgelaufen|beendet)/i.test(t)) return 'Sitzung abgelaufen.';
    return null;
  }

  function form(r) {
    var b = (r.antwort || '').trim();
    if (!b) {
      // Nach einem Seitenwechsel ist nur die Kurzfassung da (Body wird bewusst
      // nicht gesichert). Dann die Form aus dem Content-Type ableiten, statt
      // "leer" zu behaupten — das läse sich wie eine leere Antwort.
      if (r.len > 0) {
        var t = String(r.typ || '');
        var art = /json/i.test(t) ? 'JSON' : /html|xml/i.test(t) ? 'HTML' : /csv/i.test(t) ? 'CSV' : /sheet|excel/i.test(t) ? 'Excel' : 'Daten';
        return art + ' (' + r.len + ' Zeichen, vor dem Seitenwechsel)';
      }
      return 'leer';
    }
    if (b.charAt(0) === '{' || b.charAt(0) === '[') return 'JSON';
    if (/^\s*</.test(b)) {
      var m = b.match(/<table/gi);
      return 'HTML' + (m ? ' (' + m.length + ' Tabelle' + (m.length > 1 ? 'n' : '') + ')' : '');
    }
    var z1 = b.split(/\r?\n/)[0] || '';
    if (/[;,\t]/.test(z1) && b.split(/\r?\n/).length > 2) return 'CSV/TSV';
    return 'Text';
  }

  // ============================================================
  //  Nachstellen — die Kernfunktion
  // ============================================================
  function nachstellen(r, ueberschreiben) {
    if (typeof r === 'number') r = S.reqs.filter(function (x) { return x.n === r; })[0];
    if (!r) return Promise.reject(new Error('Request nicht gefunden'));
    if (r.via === 'ws') return Promise.reject(new Error('WebSockets kann man nicht einzeln nachstellen'));

    var u = new URL(r.url), opt = { method: r.method, credentials: 'include', headers: wichtigeKopfzeilen(r.kopf) };
    var ue = ueberschreiben || {};

    if (r.method === 'GET' || r.body == null) {
      Object.keys(ue).forEach(function (k) { u.searchParams.set(k, ue[k]); });
      if (u.searchParams.has('_')) u.searchParams.set('_', Date.now());  // jQuery-Cache-Buster frisch
    } else {
      var p = new URLSearchParams(r.body);
      Object.keys(ue).forEach(function (k) { p.set(k, ue[k]); });
      if (!opt.headers['content-type']) opt.headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      opt.body = p;
    }
    var t0 = Date.now();
    return O.fetch.call(window, u.href, opt).then(function (res) {
      return res.text().then(function (t) {
        return { status: res.status, ms: Date.now() - t0, len: t.length, typ: res.headers.get('content-type') || '', text: t };
      });
    });
  }

  // ============================================================
  //  Codeausgabe — IIFE, damit sie überall und mehrfach läuft
  // ============================================================
  function codeFuer(r) {
    if (typeof r === 'number') r = S.reqs.filter(function (x) { return x.n === r; })[0];
    if (!r) return '// Request nicht gefunden';
    var u = new URL(r.url), p = paare(r.body), L = [];

    L.push('// ' + r.method + ' ' + u.pathname + '   (Antwort: ' + r.status + ', ' + form(r) + ', ' + r.len + ' Zeichen)');
    if (r.klick) L.push('// ausgelöst durch: ' + r.klick);
    L.push('// Beliebig oft einfügbar: alles steckt in einer IIFE, kein globales const,');
    L.push('// kein await auf oberster Ebene. Läuft auch in einer Datei.');
    L.push('(async function () {');

    var kz = wichtigeKopfzeilen(r.kopf);
    if (r.method === 'GET' || r.body == null) {
      L.push('  const u = new URL(' + JSON.stringify(u.origin + u.pathname) + ');');
      u.searchParams.forEach(function (v, k) {
        L.push('  u.searchParams.set(' + JSON.stringify(k) + ', ' + JSON.stringify(k === '_' ? '' : v) + ');' + (k === '_' ? '  // Cache-Buster' : ''));
      });
      if (u.searchParams.has('_')) L.push('  u.searchParams.set("_", Date.now());');
      L.push('  const res = await fetch(u.href, {');
      L.push('    method: ' + JSON.stringify(r.method) + ', credentials: "include",');
      L.push('    headers: ' + JSON.stringify(kz));
      L.push('  });');
    } else if (p && p.art === 'form') {
      L.push('  const p = new URLSearchParams();');
      p.liste.forEach(function (kv) {
        L.push('  p.append(' + JSON.stringify(kv[0]) + ', ' + JSON.stringify(kv[1]) + ');'
          + (tokenhaft(kv[1]) ? '   // Token — läuft ab, besser frisch mitschneiden' : ''));
      });
      if (!kz['content-type']) kz['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      L.push('  const res = await fetch(' + JSON.stringify(u.origin + u.pathname + (u.search || '')) + ', {');
      L.push('    method: ' + JSON.stringify(r.method) + ', credentials: "include",');
      L.push('    headers: ' + JSON.stringify(kz) + ', body: p');
      L.push('  });');
    } else {
      L.push('  const res = await fetch(' + JSON.stringify(u.href) + ', {');
      L.push('    method: ' + JSON.stringify(r.method) + ', credentials: "include",');
      L.push('    headers: ' + JSON.stringify(kz) + ',');
      L.push('    body: ' + JSON.stringify(kurz(r.body || '', 2000)));
      L.push('  });');
    }
    L.push('  const text = await res.text();');
    L.push('  console.log("Status", res.status, "|", text.length, "Zeichen");');
    L.push('  console.log(text.slice(0, 1500));');
    L.push('  window.rcLetzteAntwort = text;   // zum Weiterarbeiten');
    L.push('})();');
    return L.join('\n');
  }

  // Fertiger Crawler nach Projektmuster
  function crawlerFuer(r) {
    if (typeof r === 'number') r = S.reqs.filter(function (x) { return x.n === r; })[0];
    if (!r) r = kandidaten()[0];
    if (!r) return '// Noch kein Datenrequest erfasst — Seite einmal bedienen.';
    var u = new URL(r.url), ziel = u.pathname.split('/').pop() || u.pathname;
    var p = paare(r.body), istGet = (r.method === 'GET' || r.body == null);
    var tokens = p && p.art === 'form' ? p.liste.filter(function (kv) { return tokenhaft(kv[1]); }).map(function (kv) { return kv[0]; }) : [];

    var L = [];
    L.push('(function () {');
    L.push('  // ============================================================');
    L.push('  //  KPI-Crawler (Gerüst) — erzeugt von rc_lupe v' + VERSION);
    L.push('  //  Quelle: ' + u.origin + u.pathname);
    L.push('  //  ------------------------------------------------------------');
    L.push('  //  WICHTIG: Die Zeichenfolge "KPI-Crawler" oben muss stehen bleiben.');
    L.push('  //  ESL_Start.cmd prüft die ersten 4000 Zeichen auf diesen Marker und');
    L.push('  //  lehnt die Datei sonst als "vermutlich die FALSCHE Datei" ab.');
    L.push('  //  Für die Warteschleife heißt der Marker "Warteschleifen-Crawler".');
    L.push('  // ============================================================');
    L.push("  'use strict';");
    L.push('  var TAKT_MS = 600000;            // 10 Minuten');
    L.push('  var ZIEL    = ' + JSON.stringify(ziel) + ';');
    L.push('');
    if (tokens.length) {
      L.push('  // Die Seite schickt ' + (tokens.length === 1 ? 'einen Wert' : tokens.length + ' Werte') + ' mit, der wie ein Token aussieht');
      L.push('  //   ' + tokens.join(', '));
      L.push('  // Solche Werte laufen ab und dürfen NICHT hart eingetragen werden.');
      L.push('  // Deshalb wird die Original-Anfrage der Seite mitgeschnitten und');
      L.push('  // nur das ersetzt, was wir steuern wollen.');
    } else {
      L.push('  // Die Original-Anfrage der Seite wird mitgeschnitten, damit alle');
      L.push('  // Pflichtfelder echt sind (und ein später ergänztes Token mitkommt).');
    }
    L.push('  window.__rcOrig = window.__rcOrig || null;');
    L.push('  (function haken() {');
    L.push('    if (window.__rcHaken) return; window.__rcHaken = true;');
    L.push('    var of = window.fetch;');
    L.push('    window.fetch = function (i, init) {');
    L.push('      try {');
    L.push('        var u = (typeof i === "string") ? i : (i && i.url) || "";');
    L.push('        if (u.indexOf(ZIEL) !== -1) window.__rcOrig = {');
    L.push('          url: u, method: ((init && init.method) || (i && i.method) || "GET").toUpperCase(),');
    L.push('          body: (init && init.body != null) ? String(init.body) : null');
    L.push('        };');
    L.push('      } catch (e) {}');
    L.push('      return of.apply(this, arguments);');
    L.push('    };');
    L.push('    var oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;');
    L.push('    XMLHttpRequest.prototype.open = function (m, u) { this.__m = String(m || "GET").toUpperCase(); this.__u = u; return oo.apply(this, arguments); };');
    L.push('    XMLHttpRequest.prototype.send = function (b) {');
    L.push('      try {');
    L.push('        if (String(this.__u || "").indexOf(ZIEL) !== -1) window.__rcOrig = {');
    L.push('          url: this.__u, method: this.__m, body: (b != null) ? String(b) : null');
    L.push('        };');
    L.push('      } catch (e) {}');
    L.push('      return os.apply(this, arguments);');
    L.push('    };');
    L.push('  })();');
    L.push('');
    L.push('  // Anfrage nachstellen. Session-Cookie geht über credentials automatisch mit,');
    L.push('  // ein eigener Cookie-Header wäre wirkungslos.');
    L.push('  function hole(ueberschreiben) {');
    L.push('    var o = window.__rcOrig;');
    L.push('    if (!o) { console.warn("[Crawler] Noch keine Original-Anfrage — Seite einmal bedienen."); return Promise.resolve(null); }');
    L.push('    var u = new URL(o.url, location.href);');
    L.push('    var opt = { method: o.method, credentials: "include", headers: ' + JSON.stringify(wichtigeKopfzeilen(r.kopf)) + ' };');
    L.push('    var ue = ueberschreiben || {};');
    L.push('    if (o.method === "GET" || o.body == null) {');
    L.push('      Object.keys(ue).forEach(function (k) { u.searchParams.set(k, ue[k]); });');
    L.push('      if (u.searchParams.has("_")) u.searchParams.set("_", Date.now());');
    L.push('    } else {');
    L.push('      var p = new URLSearchParams(o.body);');
    L.push('      Object.keys(ue).forEach(function (k) { p.set(k, ue[k]); });');
    L.push('      opt.headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";');
    L.push('      opt.body = p;');
    L.push('    }');
    L.push('    return fetch(u.href, opt).then(function (res) {');
    L.push('      if (!res.ok) console.warn("[Crawler] HTTP", res.status, u.pathname);');
    L.push('      return res.text();');
    L.push('    });');
    L.push('  }');
    L.push('');
    L.push('  // HIER anpassen: Antwort in Datensätze umwandeln.');
    L.push('  // Erkannte Antwortform: ' + form(r));
    L.push('  function auswerten(text) {');
    L.push('    var t = (text || "").trim();');
    L.push('    if (!t) return [];');
    L.push('    if (t.charAt(0) === "{" || t.charAt(0) === "[") return JSON.parse(t);');
    L.push('    var doc = new DOMParser().parseFromString(t, "text/html");');
    L.push('    var tab = doc.querySelector("table");');
    L.push('    if (!tab) return [];');
    L.push('    var kopf = Array.prototype.map.call(tab.querySelectorAll("tr th"), function (th) { return th.textContent.trim(); });');
    L.push('    return Array.prototype.map.call(tab.querySelectorAll("tbody tr"), function (tr) {');
    L.push('      var z = Array.prototype.map.call(tr.children, function (td) { return td.textContent.trim(); });');
    L.push('      var o = {}; kopf.forEach(function (k, i) { o[k] = z[i]; }); return o;');
    L.push('    });');
    L.push('  }');
    L.push('');
    L.push('  // Weitergabe ans Dashboard. Cross-Origin ist window.opener der EINZIGE');
    L.push('  // Rückkanal — BroadcastChannel wirkt nur innerhalb eines Origins und');
    L.push('  // meldet Erfolg auch dann, wenn niemand zuhört. Taugt nicht als Nachweis.');
    L.push('  function senden(daten) {');
    L.push('    var ziele = [];');
    L.push('    var last = { typ: "crawler_daten", ts: Date.now(), daten: daten };');
    L.push('    try { if (window.opener && !window.opener.closed) { window.opener.postMessage(last, "*"); ziele.push("opener"); } } catch (e) {}');
    L.push('    try { if (window.rcDashWin && !window.rcDashWin.closed) { window.rcDashWin.postMessage(last, "*"); ziele.push("rcDashWin"); } } catch (e) {}');
    L.push('    if (!ziele.length) console.warn("[Crawler] Kein Empfänger! Diese Seite muss AUS dem Dashboard geöffnet werden (window.open), sonst ist opener null.");');
    L.push('    return ziele;');
    L.push('  }');
    L.push('');
    L.push('  function lauf() {');
    L.push('    return hole({}).then(function (text) {');
    L.push('      if (text == null) return;');
    L.push('      var daten = auswerten(text);');
    L.push('      var n = (daten && daten.length) || 0;');
    L.push('      console.log("[Crawler]", n, "Datensätze ->", senden(daten).join(", ") || "niemand");');
    L.push('      return daten;');
    L.push('    }).catch(function (e) { console.error("[Crawler] Fehler:", e); });');
    L.push('  }');
    L.push('');
    L.push('  if (window.__rcCrawlerTakt) clearInterval(window.__rcCrawlerTakt);');
    L.push('  setTimeout(lauf, 5000);');
    L.push('  window.__rcCrawlerTakt = setInterval(lauf, TAKT_MS);');
    L.push('  window.rcCrawlerLauf = lauf; window.rcCrawlerHole = hole;');
    L.push('  console.log("[Crawler] bereit — rcCrawlerLauf() für einen Sofort-Lauf");');
    L.push('})();');
    return L.join('\n');
  }

  function speichern(name, inhalt) {
    var b = new Blob([inhalt], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  // ============================================================
  //  Panel
  // ============================================================
  var panel = null, liste = null, kopfZeile = null, detail = null, eingeklappt = false;
  var F = { rot: '#E60000', gruen: '#008A00', amber: '#EB9700', flaeche: '#1D1D1D', rand: '#3A3A3A', ink: '#F5F5F5', grau: '#9A9A9A' };

  function bauen() {
    panel = document.createElement('div');
    panel.id = 'rcLupePanel';
    panel.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;width:400px;max-height:70vh;'
      + 'background:' + F.flaeche + ';color:' + F.ink + ';border:1px solid ' + F.rot + ';border-radius:8px;'
      + 'font:12px/1.5 Consolas,monospace;box-shadow:0 8px 30px rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden';
    panel.innerHTML =
      '<div id="rcLupeKopf" style="padding:8px 10px;background:#161616;border-bottom:1px solid ' + F.rand + ';cursor:move;display:flex;align-items:center;gap:8px">'
      + '<b style="color:' + F.rot + ';letter-spacing:.5px">RC LUPE</b>'
      + '<span id="rcLupeZahl" style="color:' + F.grau + ';font-size:11px;flex:1"></span>'
      + '<span data-a="klapp" style="cursor:pointer;padding:0 6px;color:' + F.grau + '" title="Ein-/Ausklappen">–</span>'
      + '<span data-a="zu" style="cursor:pointer;padding:0 4px;color:' + F.grau + '" title="Beenden">×</span>'
      + '</div>'
      + '<div id="rcLupeKoerper" style="overflow:auto;flex:1">'
      + '<div id="rcLupeHinweis" style="padding:10px;color:' + F.grau + ';border-bottom:1px solid ' + F.rand + '">'
      + 'Seite jetzt einmal normal bedienen — Filter setzen, „Ok" oder „Aktualisieren" klicken.</div>'
      + '<div id="rcLupeListe"></div>'
      + '<div id="rcLupeDetail"></div>'
      + '</div>'
      + '<div style="padding:7px 10px;border-top:1px solid ' + F.rand + ';display:flex;gap:5px;flex-wrap:wrap;background:#161616">'
      + knopf('alle', 'Alle Requests') + knopf('crawler', 'Crawler-Datei') + knopf('leer', 'Leeren') + '</div>';
    document.documentElement.appendChild(panel);

    liste = panel.querySelector('#rcLupeListe');
    detail = panel.querySelector('#rcLupeDetail');
    kopfZeile = panel.querySelector('#rcLupeZahl');

    panel.addEventListener('click', function (ev) {
      var el = ev.target.closest('[data-a]');
      if (!el) return;
      ev.stopPropagation(); ev.preventDefault();
      var a = el.getAttribute('data-a'), n = parseInt(el.getAttribute('data-n'), 10);
      if (a === 'zu') stop();
      else if (a === 'klapp') klappen();
      else if (a === 'leer') leeren();
      else if (a === 'alle') alleZeigen();
      else if (a === 'crawler') crawlerDatei(n);
      else if (a === 'zeig') { S.offen = (S.offen === n ? null : n); malen(); }
      else if (a === 'test') testen(n, el);
      else if (a === 'code') codeZeigen(n);
    }, true);

    ziehbar(panel.querySelector('#rcLupeKopf'));
  }

  function knopf(a, text, n) {
    return '<button data-a="' + a + '"' + (n != null ? ' data-n="' + n + '"' : '') + ' style="background:#2C2C2C;color:' + F.ink
      + ';border:1px solid #4A4A4A;border-radius:4px;padding:4px 9px;cursor:pointer;font:11px Consolas,monospace">' + text + '</button>';
  }

  function ziehbar(griff) {
    var akt = false, dx = 0, dy = 0;
    griff.addEventListener('mousedown', function (e) {
      if (e.target.closest('[data-a]')) return;
      akt = true;
      var r = panel.getBoundingClientRect();
      dx = e.clientX - r.left; dy = e.clientY - r.top;
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!akt) return;
      panel.style.left = Math.max(0, Math.min(window.innerWidth - 120, e.clientX - dx)) + 'px';
      panel.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dy)) + 'px';
    });
    document.addEventListener('mouseup', function () { akt = false; });
  }

  function klappen() {
    eingeklappt = !eingeklappt;
    panel.querySelector('#rcLupeKoerper').style.display = eingeklappt ? 'none' : '';
    panel.querySelector('[data-a="klapp"]').textContent = eingeklappt ? '+' : '–';
  }

  var malTimer = null;
  function malen() {
    if (malTimer) return;
    malTimer = setTimeout(function () { malTimer = null; malenJetzt(); }, 150);
  }

  function malenJetzt() {
    if (!liste) return;
    var k = kandidaten();
    kopfZeile.textContent = k.length + ' Endpunkt' + (k.length === 1 ? '' : 'e')
      + ' · ' + S.reqs.length + ' Requests' + (S.pause ? ' · PAUSE' : '');
    panel.querySelector('#rcLupeHinweis').style.display = k.length ? 'none' : '';

    liste.innerHTML = k.slice(0, 12).map(function (r, i) {
      var u = new URL(r.url), auf = S.offen === r.n;
      var ampel = (typeof r.status === 'number' && r.status < 400) ? F.gruen : (r.status === 'Fehler' ? F.rot : F.amber);
      var kopfHtml = '<div data-a="zeig" data-n="' + r.n + '" style="padding:7px 10px;cursor:pointer;border-bottom:1px solid #262626;'
        + (auf ? 'background:#242424;' : '') + (i === 0 && !auf ? 'border-left:3px solid ' + F.rot + ';' : 'border-left:3px solid transparent;') + '">'
        + '<div style="display:flex;gap:6px;align-items:baseline">'
        + '<span style="color:' + ampel + '">●</span>'
        + '<b style="color:' + F.ink + '">' + esc(r.method) + '</b>'
        + '<span style="flex:1;color:' + F.ink + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(u.pathname.split('/').pop() || u.pathname) + '</span>'
        + (r.__mal > 1 ? '<span style="color:' + F.grau + ';font-size:11px">' + r.__mal + '×</span>' : '')
        + '<span style="color:' + F.grau + ';font-size:11px">' + (r.len > 999 ? Math.round(r.len / 1024) + ' KB' : r.len + ' Z') + '</span>'
        + '</div>'
        + '<div style="color:' + F.grau + ';font-size:11px;margin-left:14px">' + esc(form(r)) + ' · ' + esc(String(r.status))
        + (r.klick ? ' · nach Klick ' + esc(kurz(r.klick, 22)) : ' · automatisch') + '</div>'
        + (fehlerseite(r.antwort) ? '<div style="color:' + F.amber + ';font-size:11px;margin-left:14px">keine Daten — Fehler- oder Anmeldeseite</div>' : '')
        + '</div>';
      return kopfHtml + (auf ? detailHtml(r) : '');
    }).join('') || '';

    if (S.offen && !k.some(function (r) { return r.n === S.offen; })) S.offen = null;
  }

  function detailHtml(r) {
    var u = new URL(r.url), p = paare(r.body), z = [];
    z.push('<div style="padding:9px 10px 10px 24px;background:#151515;border-bottom:1px solid #262626">');
    z.push('<div style="color:' + F.grau + ';margin-bottom:6px;word-break:break-all">' + esc(u.origin + u.pathname)
      + (u.origin !== location.origin ? ' <span style="color:' + F.amber + '">(fremder Origin)</span>' : '') + '</div>');

    var pr = [];
    u.searchParams.forEach(function (v, kk) { pr.push([kk, v, 'Query']); });
    if (p && p.art === 'form') p.liste.forEach(function (kv) { pr.push([kv[0], kv[1], 'Body']); });
    if (p && p.art === 'json') pr.push(['(JSON-Body)', kurz(JSON.stringify(p.obj), 90), 'Body']);

    if (pr.length) {
      z.push('<table style="width:100%;border-collapse:collapse;font-size:11px">');
      pr.slice(0, 18).forEach(function (x) {
        var tk = tokenhaft(x[1]);
        z.push('<tr><td style="color:' + F.grau + ';padding:1px 6px 1px 0;vertical-align:top">' + esc(x[0]) + '</td>'
          + '<td style="color:' + F.ink + ';word-break:break-all">' + esc(kurz(x[1], 46))
          + (tk ? ' <span style="color:' + F.amber + '" title="Läuft ab — nicht hart eintragen">TOKEN</span>' : '') + '</td></tr>');
      });
      if (pr.length > 18) z.push('<tr><td colspan="2" style="color:' + F.grau + '">… ' + (pr.length - 18) + ' weitere</td></tr>');
      z.push('</table>');
    } else {
      z.push('<div style="color:' + F.grau + ';font-size:11px">keine Parameter</div>');
    }

    z.push('<div id="rcLupeErgebnis' + r.n + '" style="margin-top:8px"></div>');
    z.push('<div style="margin-top:8px;display:flex;gap:5px;flex-wrap:wrap">'
      + knopf('test', 'Test: nachstellen', r.n) + knopf('code', 'Code', r.n) + knopf('crawler', 'Crawler', r.n) + '</div>');
    z.push('</div>');
    return z.join('');
  }

  function testen(n, btn) {
    var r = S.reqs.filter(function (x) { return x.n === n; })[0];
    var ziel = panel.querySelector('#rcLupeErgebnis' + n);
    if (!r || !ziel) return;
    var alt = btn.textContent;
    btn.textContent = 'läuft…'; btn.disabled = true;
    nachstellen(r).then(function (e) {
      var farbe, text, zusatz = 'Antwort liegt in window.rcLetzteAntwort';
      var fehler = fehlerseite(e.text);
      // Reihenfolge zählt: erst der Inhalt, dann die Größe. Ein HTTP 200 mit
      // Berechtigungsseite sieht sonst wie ein Erfolg aus.
      if (e.status >= 400) {
        farbe = F.rot;
        text = 'HTTP ' + e.status + ' — so nicht nachstellbar. Fehlt ein Pflichtfeld, oder die Sitzung ist abgelaufen.';
      } else if (fehler) {
        farbe = F.rot;
        text = 'Keine Daten, sondern eine Fehlerseite (trotz HTTP ' + e.status + '). ' + fehler;
        zusatz = 'Die Seite erst im Browser anmelden, dann erneut testen.';
      } else if (e.len === 0) {
        farbe = F.amber;
        text = 'Antwort ist leer (' + e.status + ').';
      } else if (r.len > 0 && e.len < r.len * 0.4) {
        farbe = F.amber;
        text = 'Antwort kommt (' + e.status + '), ist mit ' + e.len + ' statt ~' + r.len + ' Zeichen aber deutlich kürzer. Bitte den Inhalt ansehen.';
      } else {
        farbe = F.gruen;
        text = 'Klappt. ' + e.status + ', ' + e.len + ' Zeichen in ' + e.ms + ' ms — Crawler ist machbar.';
      }
      ziel.innerHTML = '<div style="border-left:3px solid ' + farbe + ';padding:5px 8px;background:#1A1A1A;color:' + F.ink + '">'
        + esc(text) + '<div style="color:' + F.grau + ';font-size:11px;margin-top:3px">' + esc(zusatz) + '</div></div>';
      window.rcLetzteAntwort = e.text;
      console.log('[rc_lupe] Test #' + n + ':', e.status, e.len + ' Zeichen\n' + e.text.slice(0, 800));
    }).catch(function (err) {
      ziel.innerHTML = '<div style="border-left:3px solid ' + F.rot + ';padding:5px 8px;background:#1A1A1A">' + esc(String(err.message || err)) + '</div>';
    }).then(function () { btn.textContent = alt; btn.disabled = false; });
  }

  function codeZeigen(n) {
    var c = codeFuer(n);
    var ziel = panel.querySelector('#rcLupeErgebnis' + n);
    if (ziel) {
      ziel.innerHTML = '<textarea readonly style="width:100%;height:150px;background:#0E0E0E;color:#D8D8D8;border:1px solid ' + F.rand
        + ';border-radius:4px;padding:6px;font:11px/1.45 Consolas,monospace;resize:vertical"></textarea>'
        + '<div style="color:' + F.grau + ';font-size:11px;margin-top:3px">Markiert — Strg+C, dann in die Konsole. Beliebig oft einfügbar.</div>';
      var ta = ziel.querySelector('textarea');
      ta.value = c; ta.focus(); ta.select();
    }
    console.log('%c[rc_lupe] Code für #' + n, 'color:#E60000;font-weight:bold');
    console.log(c);
  }

  function crawlerDatei(n) {
    var c = crawlerFuer(isNaN(n) ? undefined : n);
    var t = new Date(), p = function (x) { return String(x).padStart(2, '0'); };
    speichern('crawler_' + location.hostname.replace(/[^a-z0-9]+/gi, '_') + '_'
      + t.getFullYear() + p(t.getMonth() + 1) + p(t.getDate()) + '_' + p(t.getHours()) + p(t.getMinutes()) + '.js', c);
    console.log('%c[rc_lupe] Crawler-Datei gespeichert.', 'color:#008A00;font-weight:bold');
    console.log(c);
  }

  function alleZeigen() {
    console.table(S.reqs.filter(function (r) { return !istRauschen(r.url); }).map(function (r) {
      var u; try { u = new URL(r.url).pathname; } catch (e) { u = r.url; }
      return { '#': r.n, Zeit: zeit(r.ts), Methode: r.method, Pfad: u, Status: r.status, ms: r.ms, Zeichen: r.len, Klick: r.klick || '' };
    }));
    console.log('rcLupe.test(#) stellt nach · rcLupe.code(#) zeigt den Code · rcLupe.crawler(#) baut den Crawler');
  }

  function leeren() {
    S.reqs = []; S.nr = 0; S.offen = null; S.letzterKlick = null;
    try { sessionStorage.removeItem(MERK_KEY); } catch (e) {}
    malenJetzt();
  }

  function stop(still) {
    S.pause = true;
    window.fetch = O.fetch;
    XMLHttpRequest.prototype.open = O.open;
    XMLHttpRequest.prototype.send = O.send;
    XMLHttpRequest.prototype.setRequestHeader = O.setH;
    if (O.WS) window.WebSocket = O.WS;
    ['click', 'change', 'submit'].forEach(function (t) { document.removeEventListener(t, aufAktion, true); });
    window.removeEventListener('pagehide', beimVerlassen);
    if (panel) { try { panel.remove(); } catch (e) {} panel = null; }
    if (!still) console.log('[rc_lupe] beendet, Hooks entfernt. Daten noch in rcLupe.daten.');
  }

  try { bauen(); malenJetzt(); } catch (e) { console.error('[rc_lupe] Panel-Fehler:', e); }

  // ============================================================
  //  Schnittstelle
  // ============================================================
  window.rcLupe = {
    version: VERSION,
    daten: S,
    liste: alleZeigen,
    test: function (n, ueberschreiben) {
      return nachstellen(n, ueberschreiben).then(function (e) {
        console.log('[rc_lupe]', e.status, '|', e.len, 'Zeichen |', e.ms, 'ms');
        console.log(e.text.slice(0, 1500));
        window.rcLetzteAntwort = e.text;
        return e;
      });
    },
    // Gibt bewusst nichts zurück: sonst zeigt die Konsole den Rückgabewert
    // zusätzlich an und beim Kopieren landet ein führendes Komma im Code.
    code: function (n) { console.log(codeFuer(n)); },
    crawler: function (n) { crawlerDatei(n); },
    speichern: crawlerDatei,
    leeren: leeren,
    stop: stop
  };

  console.log('%c[rc_lupe v' + VERSION + '] läuft.', 'color:#E60000;font-weight:bold;font-size:13px');
  console.log(
    'Seite jetzt einmal normal bedienen. Der Rest geht über das Panel unten rechts.\n\n'
    + 'Falls du die Konsole lieber magst:\n'
    + '  rcLupe.liste()      Tabelle aller Requests\n'
    + '  rcLupe.test(3)      Request 3 nachstellen — kommen dieselben Daten?\n'
    + '  rcLupe.test(3, { daterange: "current_month" })   mit geänderten Parametern\n'
    + '  rcLupe.code(3)      lauffähiger Code dafür\n'
    + '  rcLupe.crawler(3)   fertige Crawler-Datei\n'
    + '  rcLupe.stop()       Hooks entfernen'
  );
})();
