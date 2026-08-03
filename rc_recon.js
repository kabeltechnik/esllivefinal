(function () {
  // ============================================================
  //  rc_recon v1 — Seiten-Aufklaerung fuer den Crawler-Bau
  //  ------------------------------------------------------------
  //  In die Konsole (F12) der Zielseite einfuegen, danach die Seite
  //  einmal NORMAL bedienen (Filter setzen, "Ok"/"Aktualisieren"
  //  klicken, Tabelle laden, exportieren). Das Script schneidet
  //  dabei alles mit, was man braucht, um denselben Datenabruf
  //  spaeter ohne die Oberflaeche nachzustellen:
  //
  //    - jeden fetch/XHR/WebSocket/sendBeacon-Request samt Body,
  //      Headern, Antwort und Dauer
  //    - WELCHER Klick welchen Request ausgeloest hat (Kausalkette)
  //    - welche Parameter konstant sind und welche sich aendern
  //    - Token-/Session-Kandidaten und wo sie herkommen
  //      (hidden input, Cookie, JS-Variable, Meta-Tag)
  //    - die Form der Antwort (JSON-Schluessel bzw. Tabellen-Header)
  //    - DOM-Inventar: Formulare, Selects mit allen Optionen,
  //      Buttons mit ID, Tabellen
  //    - Framework-Erkennung (PrimeFaces/JSF, jQuery, React, ...)
  //
  //  Ausgabe: rcRecon.report()  -> Markdown in der Konsole
  //           rcRecon.save()    -> Report.md + Rohdaten.json + crawler_stub.js
  //           rcRecon.code(n)   -> fertiges fetch()-Snippet fuer Request n
  //
  //  Der Mitschnitt ueberlebt Seitenwechsel (sessionStorage).
  //  Passwort-/Secret-Felder werden maskiert.
  // ============================================================
  'use strict';

  var VERSION = '1.0';
  var STORE_KEY = 'rcReconLog';
  var MAX_REQ = 400;          // Ringpuffer
  var MAX_BODY = 20000;       // Zeichen je Body/Antwort im Speicher
  var TRIGGER_WINDOW = 4000;  // ms: Request gilt als Folge des letzten Klicks
  var SAVE_THROTTLE = 1500;

  // ---------- Re-Inject aufraeumen ----------
  if (window.rcRecon && window.rcRecon.__panel) {
    try { window.rcRecon.__panel.remove(); } catch (e) {}
  }

  // ============================================================
  //  Hilfsfunktionen
  // ============================================================
  function now() { return Date.now(); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function stamp(ts) {
    var d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  }
  function clip(s, n) {
    s = (s == null) ? '' : String(s);
    n = n || MAX_BODY;
    return s.length > n ? s.slice(0, n) + '\n...[' + (s.length - n) + ' Zeichen gekuerzt]' : s;
  }
  function txt(el) { return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim(); }

  var SECRET_RE = /(pass|pwd|passwort|secret|kennwort|creditcard|kreditkarte|cvv|iban)/i;
  function maskIfSecret(key, val) {
    if (SECRET_RE.test(String(key || ''))) return '***maskiert(' + String(val || '').length + ' Zeichen)***';
    return val;
  }

  // Request-Body in einen lesbaren String normalisieren — egal ob String,
  // URLSearchParams, FormData, Blob oder JSON-Objekt. (Genau hier ging beim
  // KPI-Crawler frueher der Token verloren: es wurden nur Strings erfasst.)
  function bodyToString(b) {
    try {
      if (b == null) return null;
      if (typeof b === 'string') return b;
      if (typeof URLSearchParams !== 'undefined' && b instanceof URLSearchParams) return b.toString();
      if (typeof FormData !== 'undefined' && b instanceof FormData) {
        var p = [];
        var it = b.entries();
        for (var e = it.next(); !e.done; e = it.next()) {
          var k = e.value[0], v = e.value[1];
          p.push(encodeURIComponent(k) + '=' + encodeURIComponent(
            (v && v.name) ? '[Datei:' + v.name + ']' : String(v)
          ));
        }
        return p.join('&');
      }
      if (typeof Blob !== 'undefined' && b instanceof Blob) return '[Blob ' + b.size + ' Byte, ' + b.type + ']';
      if (typeof ArrayBuffer !== 'undefined' && b instanceof ArrayBuffer) return '[ArrayBuffer ' + b.byteLength + ' Byte]';
      if (typeof b === 'object') return JSON.stringify(b);
      return String(b);
    } catch (e) { return '[Body nicht lesbar: ' + e.message + ']'; }
  }

  // Body/Query in Key-Value-Paare zerlegen (url-encoded ODER JSON)
  function parseParams(s) {
    if (!s) return null;
    s = String(s);
    var t = s.trim();
    if (t.charAt(0) === '{' || t.charAt(0) === '[') {
      try {
        var j = JSON.parse(t);
        var flat = {};
        (function walk(o, prefix) {
          if (o === null || typeof o !== 'object') { flat[prefix || 'wert'] = o; return; }
          Object.keys(o).forEach(function (k) {
            var p = prefix ? prefix + '.' + k : k;
            if (o[k] !== null && typeof o[k] === 'object') walk(o[k], p);
            else flat[p] = o[k];
          });
        })(j, '');
        return { kind: 'json', pairs: flat };
      } catch (e) { /* faellt durch */ }
    }
    if (t.indexOf('=') === -1) return null;
    var out = {};
    t.split('&').forEach(function (part) {
      var i = part.indexOf('=');
      var k = i === -1 ? part : part.slice(0, i);
      var v = i === -1 ? '' : part.slice(i + 1);
      try { k = decodeURIComponent(k.replace(/\+/g, ' ')); } catch (e) {}
      try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) {}
      if (out[k] === undefined) out[k] = maskIfSecret(k, v);
      else out[k] = [].concat(out[k], maskIfSecret(k, v)); // Mehrfach-Keys (loc_inlist[] etc.)
    });
    return { kind: 'form', pairs: out };
  }

  // Header-Objekt vereinheitlichen (Headers-Instanz, Array, Objekt)
  function headersToObj(h) {
    var o = {};
    try {
      if (!h) return o;
      if (typeof Headers !== 'undefined' && h instanceof Headers) {
        h.forEach(function (v, k) { o[k] = maskIfSecret(k, v); });
        return o;
      }
      if (Array.isArray(h)) { h.forEach(function (p) { o[p[0]] = maskIfSecret(p[0], p[1]); }); return o; }
      Object.keys(h).forEach(function (k) { o[k] = maskIfSecret(k, h[k]); });
    } catch (e) {}
    return o;
  }

  // Token-Verdacht: lang genug und "zufaellig" aussehend
  function looksLikeToken(v) {
    if (typeof v !== 'string') return false;
    var s = v.trim();
    if (s.length < 16 || s.length > 4096) return false;
    if (/\s/.test(s)) return false;
    return /^[A-Za-z0-9_\-+=/.:%]+$/.test(s) && /\d/.test(s) && /[A-Za-z]/.test(s);
  }

  // Robusten CSS-Selektor fuer ein Element bauen
  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    var parts = [], node = el, depth = 0;
    while (node && node.nodeType === 1 && depth < 5) {
      var seg = node.tagName.toLowerCase();
      if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
      if (node.getAttribute && node.getAttribute('name')) {
        seg += '[name="' + node.getAttribute('name') + '"]';
      } else if (node.className && typeof node.className === 'string') {
        var cls = node.className.trim().split(/\s+/).filter(function (c) { return c && !/^ng-|^is-|^css-/.test(c); }).slice(0, 2);
        if (cls.length) seg += '.' + cls.map(function (c) { return CSS.escape(c); }).join('.');
      }
      var par = node.parentElement;
      if (par) {
        var same = Array.prototype.filter.call(par.children, function (c) { return c.tagName === node.tagName; });
        if (same.length > 1) seg += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
      }
      parts.unshift(seg);
      node = node.parentElement; depth++;
    }
    return parts.join(' > ');
  }

  // ============================================================
  //  Zustand
  // ============================================================
  var S = {
    version: VERSION,
    startedAt: now(),
    origin: location.origin,
    href: location.href,
    paused: false,
    requests: [],     // erfasste Netzwerkaufrufe
    triggers: [],     // Benutzeraktionen
    early: [],        // Ressourcen aus der Zeit VOR dem Hook (PerformanceObserver)
    navigations: [],
    lastTrigger: null,
    seq: 0
  };

  // Frueheren Mitschnitt derselben Sitzung wieder aufnehmen
  try {
    var prev = sessionStorage.getItem(STORE_KEY);
    if (prev) {
      var p = JSON.parse(prev);
      if (p && p.requests) {
        S.requests = p.requests.slice(-MAX_REQ);
        S.triggers = (p.triggers || []).slice(-300);
        S.navigations = p.navigations || [];
        S.startedAt = p.startedAt || S.startedAt;
        S.seq = p.seq || S.requests.length;
      }
    }
  } catch (e) {}
  S.navigations.push({ ts: now(), href: location.href });

  var saveTimer = null;
  function persist() {
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      try {
        sessionStorage.setItem(STORE_KEY, JSON.stringify({
          startedAt: S.startedAt, seq: S.seq,
          requests: S.requests.slice(-MAX_REQ),
          triggers: S.triggers.slice(-300),
          navigations: S.navigations
        }));
      } catch (e) {
        // Speicher voll: Antworten der aeltesten Haelfte wegwerfen und erneut versuchen
        try {
          var half = Math.floor(S.requests.length / 2);
          for (var i = 0; i < half; i++) { S.requests[i].resBody = '[verworfen: Speicherplatz]'; S.requests[i].reqBody = clip(S.requests[i].reqBody, 500); }
          sessionStorage.setItem(STORE_KEY, JSON.stringify({ startedAt: S.startedAt, seq: S.seq, requests: S.requests.slice(-MAX_REQ), triggers: S.triggers.slice(-300), navigations: S.navigations }));
        } catch (e2) {}
      }
    }, SAVE_THROTTLE);
  }

  function pushReq(rec) {
    if (S.paused) return rec;
    rec.n = ++S.seq;
    rec.trigger = (S.lastTrigger && (rec.ts - S.lastTrigger.ts) < TRIGGER_WINDOW) ? S.lastTrigger.label : null;
    S.requests.push(rec);
    if (S.requests.length > MAX_REQ) S.requests.shift();
    persist();
    updatePanel();
    return rec;
  }

  // ============================================================
  //  Netzwerk-Hooks
  // ============================================================
  var ORIG = window.__rcReconOrig || (window.__rcReconOrig = {
    fetch: window.fetch,
    xhrOpen: XMLHttpRequest.prototype.open,
    xhrSend: XMLHttpRequest.prototype.send,
    xhrSetHeader: XMLHttpRequest.prototype.setRequestHeader,
    beacon: navigator.sendBeacon && navigator.sendBeacon.bind(navigator),
    WS: window.WebSocket
  });

  // --- fetch ---
  if (ORIG.fetch) {
    window.fetch = function (input, init) {
      var t0 = now();
      var url, method = 'GET', reqHeaders = {}, reqBody = null;
      try {
        if (typeof input === 'string') url = input;
        else if (input && input.url) { url = input.url; method = input.method || 'GET'; reqHeaders = headersToObj(input.headers); }
        if (init) {
          if (init.method) method = init.method;
          if (init.headers) reqHeaders = Object.assign(reqHeaders, headersToObj(init.headers));
          reqBody = bodyToString(init.body);
        }
      } catch (e) {}
      var rec = pushReq({
        ts: t0, via: 'fetch', method: String(method).toUpperCase(),
        url: (function () { try { return new URL(url, location.href).href; } catch (e) { return String(url); } })(),
        reqHeaders: reqHeaders, reqBody: clip(reqBody), status: null, ms: null,
        resHeaders: {}, resType: '', resBody: '', pending: true
      });
      return ORIG.fetch.apply(this, arguments).then(function (res) {
        try {
          rec.status = res.status; rec.ms = now() - t0; rec.pending = false;
          rec.resHeaders = headersToObj(res.headers);
          rec.resType = rec.resHeaders['content-type'] || '';
          res.clone().text().then(function (t) { rec.resBody = clip(t); persist(); updatePanel(); }).catch(function () {});
        } catch (e) {}
        return res;
      }).catch(function (err) {
        rec.status = 'FEHLER'; rec.ms = now() - t0; rec.pending = false; rec.resBody = String(err);
        throw err;
      });
    };
  }

  // --- XMLHttpRequest ---
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__rc = { method: String(m || 'GET').toUpperCase(), url: u, headers: {}, t0: now() };
    return ORIG.xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { if (this.__rc) this.__rc.headers[k] = maskIfSecret(k, v); } catch (e) {}
    return ORIG.xhrSetHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (b) {
    var self = this, info = self.__rc || { method: 'GET', url: '', headers: {}, t0: now() };
    var rec = pushReq({
      ts: info.t0, via: 'xhr', method: info.method,
      url: (function () { try { return new URL(info.url, location.href).href; } catch (e) { return String(info.url); } })(),
      reqHeaders: info.headers, reqBody: clip(bodyToString(b)), status: null, ms: null,
      resHeaders: {}, resType: '', resBody: '', pending: true
    });
    self.addEventListener('loadend', function () {
      try {
        rec.status = self.status; rec.ms = now() - info.t0; rec.pending = false;
        var raw = self.getAllResponseHeaders ? self.getAllResponseHeaders() : '';
        String(raw).split(/\r?\n/).forEach(function (line) {
          var i = line.indexOf(':'); if (i > 0) rec.resHeaders[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
        });
        rec.resType = rec.resHeaders['content-type'] || '';
        if (self.responseType === '' || self.responseType === 'text') rec.resBody = clip(self.responseText);
        else if (self.responseType === 'json') rec.resBody = clip(JSON.stringify(self.response));
        else rec.resBody = '[responseType=' + self.responseType + ']';
        persist(); updatePanel();
      } catch (e) {}
    });
    return ORIG.xhrSend.apply(this, arguments);
  };

  // --- sendBeacon (Telemetrie, oft uebersehen) ---
  if (ORIG.beacon) {
    navigator.sendBeacon = function (url, data) {
      pushReq({
        ts: now(), via: 'beacon', method: 'POST',
        url: (function () { try { return new URL(url, location.href).href; } catch (e) { return String(url); } })(),
        reqHeaders: {}, reqBody: clip(bodyToString(data)), status: 'beacon', ms: 0,
        resHeaders: {}, resType: '', resBody: '', pending: false
      });
      return ORIG.beacon(url, data);
    };
  }

  // --- WebSocket ---
  if (ORIG.WS) {
    window.WebSocket = function (url, protocols) {
      var ws = protocols === undefined ? new ORIG.WS(url) : new ORIG.WS(url, protocols);
      var rec = pushReq({
        ts: now(), via: 'websocket', method: 'WS', url: String(url),
        reqHeaders: { protocols: String(protocols || '') }, reqBody: '', status: 'offen', ms: null,
        resHeaders: {}, resType: 'websocket', resBody: '', pending: true, frames: []
      });
      ws.addEventListener('message', function (ev) {
        if (rec.frames.length < 40) rec.frames.push({ dir: 'in', ts: now(), data: clip(typeof ev.data === 'string' ? ev.data : '[binaer]', 2000) });
        rec.resBody = '[' + rec.frames.length + ' Frames empfangen]'; persist();
      });
      var origSend = ws.send.bind(ws);
      ws.send = function (d) {
        if (rec.frames.length < 40) rec.frames.push({ dir: 'out', ts: now(), data: clip(bodyToString(d), 2000) });
        return origSend(d);
      };
      ws.addEventListener('close', function () { rec.status = 'geschlossen'; rec.pending = false; persist(); });
      return ws;
    };
    window.WebSocket.prototype = ORIG.WS.prototype;
    window.WebSocket.OPEN = ORIG.WS.OPEN;
    window.WebSocket.CLOSED = ORIG.WS.CLOSED;
  }

  // --- Ressourcen VOR dem Hook (nur URL/Timing, kein Body) ---
  try {
    var seenEarly = {};
    (performance.getEntriesByType('resource') || []).forEach(function (e) {
      if (/xmlhttprequest|fetch/.test(e.initiatorType) && !seenEarly[e.name]) { seenEarly[e.name] = 1; S.early.push({ url: e.name, type: e.initiatorType, ms: Math.round(e.duration) }); }
    });
    var po = new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (e) {
        if (/xmlhttprequest|fetch/.test(e.initiatorType) && !seenEarly[e.name]) { seenEarly[e.name] = 1; S.early.push({ url: e.name, type: e.initiatorType, ms: Math.round(e.duration) }); }
      });
    });
    po.observe({ entryTypes: ['resource'] });
  } catch (e) {}

  // ============================================================
  //  Benutzeraktionen mitschneiden (Kausalkette Klick -> Request)
  // ============================================================
  function labelFor(el, evType) {
    if (!el || el.nodeType !== 1) return evType;
    var t = el.tagName.toLowerCase();
    var name = txt(el).slice(0, 40) || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '';
    var id = el.id ? '#' + el.id : '';
    return evType + ' auf <' + t + '>' + id + (name ? ' "' + name + '"' : '');
  }
  function onUserEvent(ev) {
    if (S.paused) return;
    var el = ev.target;
    var rec = {
      ts: now(), type: ev.type, label: labelFor(el, ev.type),
      selector: selectorFor(el),
      id: el && el.id || '', tag: el && el.tagName ? el.tagName.toLowerCase() : '',
      value: (el && el.tagName === 'SELECT') ? el.value : undefined,
      text: txt(el).slice(0, 80)
    };
    S.lastTrigger = rec;
    S.triggers.push(rec);
    if (S.triggers.length > 300) S.triggers.shift();
    persist();
  }
  ['click', 'change', 'submit'].forEach(function (t) { document.addEventListener(t, onUserEvent, true); });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') onUserEvent(ev); }, true);

  // ============================================================
  //  Analyse
  // ============================================================
  // Requests nach Endpoint (Origin+Pfad) gruppieren
  function groupEndpoints() {
    var map = {};
    S.requests.forEach(function (r) {
      var u; try { u = new URL(r.url); } catch (e) { return; }
      var key = r.method + ' ' + u.origin + u.pathname;
      if (!map[key]) map[key] = { key: key, method: r.method, origin: u.origin, path: u.pathname, calls: [], sameOrigin: u.origin === location.origin };
      map[key].calls.push(r);
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.calls.length - a.calls.length; });
  }

  // Parameter eines Endpoints: konstant vs. variabel
  function analyseParams(ep) {
    var all = {};
    ep.calls.forEach(function (r) {
      var sets = [];
      try { var u = new URL(r.url); u.searchParams.forEach(function (v, k) { sets.push(['query:' + k, v]); }); } catch (e) {}
      var pp = parseParams(r.reqBody);
      if (pp) Object.keys(pp.pairs).forEach(function (k) { sets.push(['body:' + k, pp.pairs[k]]); });
      sets.forEach(function (p) {
        var k = p[0], v = String(p[1]);
        if (!all[k]) all[k] = { key: k, values: [], distinct: {} };
        all[k].values.push(v);
        if (Object.keys(all[k].distinct).length < 12) all[k].distinct[v] = 1;
      });
    });
    return Object.keys(all).map(function (k) {
      var a = all[k], d = Object.keys(a.distinct);
      return {
        key: k,
        konstant: d.length === 1,
        beispiele: d.slice(0, 6),
        anzahlWerte: d.length,
        tokenVerdacht: d.some(looksLikeToken)
      };
    });
  }

  // Form der Antwort beschreiben
  function describeResponse(r) {
    var b = (r.resBody || '').trim();
    if (!b) return { art: 'leer', info: '' };
    if (b.charAt(0) === '{' || b.charAt(0) === '[') {
      try {
        var j = JSON.parse(b.replace(/\n\.\.\.\[\d+ Zeichen gekuerzt\]$/, ''));
        var keys = [];
        (function walk(o, prefix, depth) {
          if (depth > 3 || keys.length > 60) return;
          if (Array.isArray(o)) { if (o.length) walk(o[0], prefix + '[]', depth + 1); return; }
          if (o && typeof o === 'object') {
            Object.keys(o).forEach(function (k) {
              var p = prefix ? prefix + '.' + k : k;
              var v = o[k];
              if (v && typeof v === 'object') walk(v, p, depth + 1);
              else keys.push(p + ' : ' + (v === null ? 'null' : typeof v));
            });
          }
        })(j, '', 0);
        return { art: 'JSON', info: keys.slice(0, 40).join('\n') };
      } catch (e) { return { art: 'JSON (unvollstaendig/gekuerzt)', info: b.slice(0, 400) }; }
    }
    if (/^\s*</.test(b)) {
      // HTML/XML: Tabellen-Header und IDs herausziehen
      try {
        var doc = new DOMParser().parseFromString(b, 'text/html');
        var tabs = doc.querySelectorAll('table');
        var out = [];
        Array.prototype.slice.call(tabs, 0, 3).forEach(function (t, i) {
          var ths = Array.prototype.map.call(t.querySelectorAll('tr th'), function (th) { return txt(th); }).filter(Boolean);
          var rows = t.querySelectorAll('tbody tr').length || t.querySelectorAll('tr').length;
          out.push('Tabelle ' + (i + 1) + ' (' + rows + ' Zeilen): ' + ths.slice(0, 25).join(' | '));
        });
        if (!out.length) out.push('HTML ohne Tabelle, ' + b.length + ' Zeichen');
        return { art: 'HTML/XML', info: out.join('\n') };
      } catch (e) { return { art: 'HTML/XML', info: b.slice(0, 300) }; }
    }
    // CSV / getrennte Werte?
    var line1 = b.split(/\r?\n/)[0] || '';
    if (/[;,\t]/.test(line1) && b.split(/\r?\n/).length > 2) {
      return { art: 'Tabellentext (CSV/TSV)', info: 'Kopfzeile: ' + line1.slice(0, 300) };
    }
    return { art: 'Text', info: b.slice(0, 300) };
  }

  // Wo kommt ein Token-Wert her?
  function traceValue(val) {
    var hits = [];
    if (!val || String(val).length < 8) return hits;
    var v = String(val);
    try {
      document.querySelectorAll('input[type=hidden], input[name]').forEach(function (i) {
        if (i.value === v) hits.push('hidden input [name="' + (i.name || i.id) + '"]');
      });
    } catch (e) {}
    try {
      document.querySelectorAll('meta[content]').forEach(function (m) {
        if (m.content === v) hits.push('meta[name="' + (m.getAttribute('name') || m.getAttribute('property')) + '"]');
      });
    } catch (e) {}
    try {
      (document.cookie || '').split(';').forEach(function (c) {
        var i = c.indexOf('='); if (i > 0 && c.slice(i + 1).trim() === v) hits.push('Cookie "' + c.slice(0, i).trim() + '"');
      });
    } catch (e) {}
    ['localStorage', 'sessionStorage'].forEach(function (st) {
      try {
        var s = window[st];
        for (var i = 0; i < s.length; i++) { if (s.getItem(s.key(i)) === v) hits.push(st + '["' + s.key(i) + '"]'); }
      } catch (e) {}
    });
    try {
      customGlobals().forEach(function (g) {
        try { if (window[g] === v) hits.push('window.' + g); } catch (e) {}
      });
    } catch (e) {}
    try {
      // im HTML-Quelltext (z. B. inline-Script) gefunden?
      if (document.documentElement.innerHTML.indexOf(v) !== -1 && !hits.length) hits.push('irgendwo im Seiten-HTML (inline-Script?)');
    } catch (e) {}
    return hits;
  }

  // Globale Variablen, die NICHT vom Browser stammen (Baseline via leerem iframe)
  var _globalsCache = null;
  function customGlobals() {
    if (_globalsCache) return _globalsCache;
    var base = {};
    try {
      var f = document.createElement('iframe');
      f.style.display = 'none';
      document.documentElement.appendChild(f);
      Object.getOwnPropertyNames(f.contentWindow).forEach(function (k) { base[k] = 1; });
      f.remove();
    } catch (e) {}
    _globalsCache = Object.getOwnPropertyNames(window).filter(function (k) {
      return !base[k] && !/^rcRecon$|^__rcRecon/.test(k);
    });
    return _globalsCache;
  }

  function detectFrameworks() {
    var f = [];
    if (window.PrimeFaces) f.push('PrimeFaces ' + (window.PrimeFaces.VERSION || ''));
    if (document.querySelector('input[name="javax.faces.ViewState"], input[name="jakarta.faces.ViewState"]')) f.push('JSF (ViewState vorhanden)');
    if (window.jQuery) f.push('jQuery ' + window.jQuery.fn.jquery);
    if (window.React || document.querySelector('[data-reactroot], #root ._reactRootContainer')) f.push('React');
    if (window.Vue || document.querySelector('[data-v-app], #app[data-v-]')) f.push('Vue');
    if (window.ng || document.querySelector('[ng-version]')) f.push('Angular ' + (document.querySelector('[ng-version]') ? document.querySelector('[ng-version]').getAttribute('ng-version') : ''));
    if (window.Chart) f.push('Chart.js');
    if (window.XLSX) f.push('SheetJS/XLSX');
    if (document.querySelector('script[src*="dojo"]')) f.push('Dojo');
    if (window.__NEXT_DATA__) f.push('Next.js');
    if (window.Sortable) f.push('Sortable');
    return f;
  }

  function domInventar() {
    var inv = { forms: [], selects: [], buttons: [], tables: [], hidden: [], iframes: [] };
    try {
      document.querySelectorAll('form').forEach(function (fo) {
        inv.forms.push({
          id: fo.id, name: fo.getAttribute('name') || '', action: fo.getAttribute('action') || '', method: (fo.getAttribute('method') || 'GET').toUpperCase(),
          felder: Array.prototype.map.call(fo.querySelectorAll('input,select,textarea'), function (i) {
            return (i.tagName.toLowerCase()) + ' name="' + (i.name || i.id || '') + '" type="' + (i.type || '') + '"';
          }).slice(0, 60)
        });
      });
      document.querySelectorAll('select').forEach(function (s) {
        inv.selects.push({
          id: s.id, name: s.name || '', wert: s.value,
          optionen: Array.prototype.map.call(s.options, function (o) { return o.value + ' = ' + txt(o); }).slice(0, 40),
          anzahl: s.options.length
        });
      });
      document.querySelectorAll('button, input[type=submit], input[type=button], a[onclick], [role=button]').forEach(function (b) {
        var label = txt(b) || b.value || b.getAttribute('aria-label') || '';
        if (!label && !b.id) return;
        inv.buttons.push({ id: b.id || '', text: label.slice(0, 50), selector: selectorFor(b), onclick: (b.getAttribute('onclick') || '').slice(0, 160) });
      });
      document.querySelectorAll('table').forEach(function (t, i) {
        var ths = Array.prototype.map.call(t.querySelectorAll('tr th'), function (th) { return txt(th); }).filter(Boolean);
        if (!ths.length) return;
        inv.tables.push({ id: t.id || ('Tabelle ' + (i + 1)), selector: selectorFor(t), zeilen: t.querySelectorAll('tbody tr').length, header: ths.slice(0, 30) });
      });
      document.querySelectorAll('input[type=hidden]').forEach(function (h) {
        inv.hidden.push({ name: h.name || h.id, wert: maskIfSecret(h.name, clip(h.value, 120)), tokenVerdacht: looksLikeToken(h.value) });
      });
      document.querySelectorAll('iframe').forEach(function (f) { inv.iframes.push({ id: f.id || '', src: f.getAttribute('src') || '' }); });
    } catch (e) {}
    inv.buttons = inv.buttons.slice(0, 80);
    inv.selects = inv.selects.slice(0, 40);
    return inv;
  }

  function umgebung() {
    var out = { cookies: [], localStorage: [], sessionStorage: [], meta: [], globals: [] };
    try {
      (document.cookie || '').split(';').filter(Boolean).forEach(function (c) {
        var i = c.indexOf('='), k = i > 0 ? c.slice(0, i).trim() : c.trim(), v = i > 0 ? c.slice(i + 1).trim() : '';
        out.cookies.push({ name: k, laenge: v.length, tokenVerdacht: looksLikeToken(v), wert: SECRET_RE.test(k) ? '***' : clip(v, 60) });
      });
    } catch (e) {}
    ['localStorage', 'sessionStorage'].forEach(function (st) {
      try {
        var s = window[st];
        for (var i = 0; i < s.length && i < 60; i++) {
          var k = s.key(i), v = s.getItem(k) || '';
          out[st].push({ key: k, laenge: v.length, wert: SECRET_RE.test(k) ? '***' : clip(v, 80) });
        }
      } catch (e) {}
    });
    try {
      document.querySelectorAll('meta[name], meta[property]').forEach(function (m) {
        out.meta.push((m.getAttribute('name') || m.getAttribute('property')) + ' = ' + clip(m.content, 100));
      });
    } catch (e) {}
    out.globals = customGlobals().slice(0, 120);
    return out;
  }

  // Der interessanteste Request: POST mit Body, gute Antwort, moeglichst gross
  function bestCandidates(limit) {
    return S.requests.filter(function (r) {
      return r.status === 200 || r.status === 'beacon' || (typeof r.status === 'number' && r.status < 400);
    }).map(function (r) {
      var score = 0;
      if (r.method === 'POST') score += 30;
      if (r.reqBody && r.reqBody.length > 20) score += 20;
      if (/json|xml|text|html/.test(r.resType)) score += 10;
      score += Math.min(30, Math.round((r.resBody || '').length / 400));
      if (r.trigger) score += 15;
      if (/\.(png|jpe?g|gif|svg|woff2?|css|ico)(\?|$)/i.test(r.url)) score -= 60;
      if (/analytics|telemetry|beacon|piwik|matomo|gtm|doubleclick/i.test(r.url)) score -= 40;
      if (/ping|heartbeat|keepalive/i.test(r.url)) score -= 20;
      return { r: r, score: score };
    }).sort(function (a, b) { return b.score - a.score; }).slice(0, limit || 8).map(function (x) { return x.r; });
  }

  // ============================================================
  //  Codegen — Request als lauffaehiges Snippet
  // ============================================================
  function codeFor(rec) {
    if (typeof rec === 'number') rec = S.requests.filter(function (r) { return r.n === rec; })[0];
    if (!rec) return '// Request nicht gefunden. Nummern siehe rcRecon.list()';
    var u; try { u = new URL(rec.url); } catch (e) { u = null; }
    var lines = [];
    lines.push('// ' + rec.method + ' ' + (u ? u.origin + u.pathname : rec.url));
    if (rec.trigger) lines.push('// ausgeloest durch: ' + rec.trigger);
    lines.push('// Antwort: ' + rec.status + ', ' + (rec.resType || 'unbekannt') + ', ' + (rec.resBody || '').length + ' Zeichen');
    lines.push('');
    var pp = parseParams(rec.reqBody);
    var interessanteHeader = {};
    Object.keys(rec.reqHeaders || {}).forEach(function (k) {
      if (/^(content-type|x-|authorization|accept|faces-request|soapaction)/i.test(k)) interessanteHeader[k] = rec.reqHeaders[k];
    });

    if (pp && pp.kind === 'form') {
      lines.push('const params = new URLSearchParams();');
      Object.keys(pp.pairs).forEach(function (k) {
        var v = pp.pairs[k];
        if (Array.isArray(v)) v.forEach(function (x) { lines.push('params.append(' + JSON.stringify(k) + ', ' + JSON.stringify(String(x)) + ');'); });
        else lines.push('params.append(' + JSON.stringify(k) + ', ' + JSON.stringify(String(v)) + ');');
      });
      lines.push('');
    } else if (pp && pp.kind === 'json') {
      lines.push('const nutzlast = ' + JSON.stringify(JSON.parse(rec.reqBody), null, 2) + ';');
      lines.push('');
    }

    lines.push('const antwort = await fetch(' + JSON.stringify(u ? u.origin + u.pathname + (u.search || '') : rec.url) + ', {');
    lines.push('  method: ' + JSON.stringify(rec.method) + ',');
    lines.push('  credentials: "include",           // Session-Cookies mitschicken');
    if (Object.keys(interessanteHeader).length) {
      lines.push('  headers: ' + JSON.stringify(interessanteHeader, null, 2).split('\n').join('\n  ') + ',');
    }
    if (pp && pp.kind === 'form') lines.push('  body: params');
    else if (pp && pp.kind === 'json') lines.push('  body: JSON.stringify(nutzlast)');
    else if (rec.reqBody) lines.push('  body: ' + JSON.stringify(clip(rec.reqBody, 2000)));
    lines.push('});');
    lines.push('const text = await antwort.text();');
    lines.push('console.log(antwort.status, text.slice(0, 2000));');
    return lines.join('\n');
  }

  // Grundgeruest fuer den eigentlichen Crawler
  function crawlerStub() {
    var cand = bestCandidates(1)[0];
    var head = [
      '(function(){',
      '  // ============================================================',
      '  //  Crawler-Grundgeruest — erzeugt von rc_recon v' + VERSION,
      '  //  Seite: ' + location.href,
      '  //  Erzeugt: ' + new Date().toISOString(),
      '  // ============================================================',
      '  const CHANNEL = "rc_crawler";',
      '  const TAKT_MS = 600000; // 10 Minuten',
      '',
      '  // 1) Original-Anfrage der Seite mitschneiden (liefert frische Tokens)',
      '  //    Auch GET OHNE Body wird erfasst — bei GET stecken die Parameter in der URL.',
      '  window.__rcLastReq = window.__rcLastReq || null;',
      '  const ZIEL = ' + JSON.stringify(cand ? (function () { try { return new URL(cand.url).pathname.split('/').pop(); } catch (e) { return cand.url; } })() : 'ENDPUNKT_HIER') + ';',
      '  (function hook(){',
      '    if (window.__rcHooked) return; window.__rcHooked = true;',
      '    const of = window.fetch;',
      '    window.fetch = function(i, init){',
      '      try {',
      '        const u = (typeof i === "string") ? i : (i && i.url) || "";',
      '        if (u.indexOf(ZIEL) !== -1) window.__rcLastReq = {',
      '          url: u, method: ((init && init.method) || (i && i.method) || "GET").toUpperCase(),',
      '          body: (init && init.body != null) ? String(init.body) : null',
      '        };',
      '      } catch(e){}',
      '      return of.apply(this, arguments);',
      '    };',
      '    const oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;',
      '    XMLHttpRequest.prototype.open = function(m,u){ this.__m = (m||"GET").toUpperCase(); this.__u = u; return oo.apply(this, arguments); };',
      '    XMLHttpRequest.prototype.send = function(b){',
      '      try {',
      '        if (String(this.__u||"").indexOf(ZIEL) !== -1) window.__rcLastReq = {',
      '          url: this.__u, method: this.__m, body: (b != null) ? String(b) : null',
      '        };',
      '      } catch(e){}',
      '      return os.apply(this, arguments);',
      '    };',
      '  })();',
      '',
      '  // 2) Anfrage mit eigenen Parametern nachstellen.',
      '  //    GET -> Parameter in die Query, POST -> in den Body. Das Session-Cookie',
      '  //    geht ueber credentials:"include" automatisch mit.',
      '  async function hole(ueberschreiben){',
      '    const orig = window.__rcLastReq;',
      '    if (!orig) { console.warn("Noch keine Original-Anfrage mitgeschnitten — Seite einmal bedienen."); return null; }',
      '    const u = new URL(orig.url, location.href);',
      '    const opt = {',
      '      method: orig.method, credentials: "include",',
      '      headers: { "X-Requested-With": "XMLHttpRequest", "Accept": "application/json, text/javascript, */*; q=0.01" }',
      '    };',
      '    if (orig.method === "GET" || orig.body == null) {',
      '      Object.keys(ueberschreiben || {}).forEach(k => u.searchParams.set(k, ueberschreiben[k]));',
      '      if (u.searchParams.has("_")) u.searchParams.set("_", Date.now());   // jQuery-Cache-Buster frisch halten',
      '    } else {',
      '      const p = new URLSearchParams(orig.body);',
      '      Object.keys(ueberschreiben || {}).forEach(k => p.set(k, ueberschreiben[k]));',
      '      opt.headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";',
      '      opt.body = p;',
      '    }',
      '    const res = await fetch(u.href, opt);',
      '    if (!res.ok) console.warn("[Crawler] HTTP", res.status, u.href);',
      '    return res.text();',
      '  }',
      '',
      '  // 3) Antwort in Datensaetze umwandeln — HIER anpassen',
      '  function parse(text){',
      '    const t = (text || "").trim();',
      '    if (t.charAt(0) === "{" || t.charAt(0) === "[") return JSON.parse(t);',
      '    const doc = new DOMParser().parseFromString(t, "text/html");',
      '    const tab = doc.querySelector("table");',
      '    if (!tab) return [];',
      '    const kopf = Array.from(tab.querySelectorAll("tr th")).map(th => th.textContent.trim());',
      '    return Array.from(tab.querySelectorAll("tbody tr")).map(tr => {',
      '      const z = Array.from(tr.children).map(td => td.textContent.trim());',
      '      const o = {}; kopf.forEach((k,i) => o[k] = z[i]); return o;',
      '    });',
      '  }',
      '',
      '  // 4) Takt + Weitergabe',
      '  async function lauf(){',
      '    try {',
      '      const daten = parse(await hole({}));',
      '      console.log("[Crawler]", (daten && daten.length) || 0, "Datensaetze");',
      '      try { new BroadcastChannel(CHANNEL).postMessage({ typ: "daten", ts: Date.now(), daten }); } catch(e){}',
      '      if (window.opener) window.opener.postMessage({ typ: "daten", ts: Date.now(), daten }, "*");',
      '    } catch(e){ console.error("[Crawler] Fehler:", e); }',
      '  }',
      '  setTimeout(lauf, 5000);',
      '  setInterval(lauf, TAKT_MS);',
      '  window.rcCrawlerLauf = lauf; window.rcCrawlerHole = hole;',
      '  console.log("[Crawler] bereit — rcCrawlerLauf() fuer einen Sofort-Lauf");',
      '})();'
    ];
    return head.join('\n');
  }

  // ============================================================
  //  Report
  // ============================================================
  function report(opt) {
    opt = opt || {};
    var L = [];
    var eps = groupEndpoints();
    var cands = bestCandidates(6);
    var inv = domInventar();
    var env = umgebung();

    L.push('# Aufklaerungs-Report — ' + location.hostname);
    L.push('');
    L.push('- Seite: ' + location.href);
    L.push('- Mitschnitt seit: ' + new Date(S.startedAt).toLocaleString('de-DE') + ' (' + Math.round((now() - S.startedAt) / 1000) + ' s)');
    L.push('- Erfasste Requests: ' + S.requests.length + ' | Benutzeraktionen: ' + S.triggers.length + ' | Seitenwechsel: ' + S.navigations.length);
    L.push('- Frameworks: ' + (detectFrameworks().join(', ') || 'keine bekannten erkannt'));
    L.push('');

    L.push('## 1. Die wahrscheinlichen Daten-Endpunkte');
    L.push('');
    if (!cands.length) L.push('_Noch nichts erfasst. Seite bedienen (Filter setzen, Aktualisieren klicken) und Report erneut aufrufen._');
    cands.forEach(function (r, i) {
      var u; try { u = new URL(r.url); } catch (e) { u = null; }
      var d = describeResponse(r);
      L.push('### ' + (i + 1) + ') [#' + r.n + '] ' + r.method + ' ' + (u ? u.pathname : r.url));
      L.push('');
      L.push('- Host: `' + (u ? u.origin : '?') + '`' + (u && u.origin !== location.origin ? '  **(fremder Origin — CORS/Cookies beachten)**' : ''));
      L.push('- Status: ' + r.status + ' in ' + r.ms + ' ms, Typ `' + (r.resType || 'unbekannt') + '`, Antwort ' + (r.resBody || '').length + ' Zeichen');
      L.push('- Ausgeloest durch: ' + (r.trigger || '_kein Klick unmittelbar davor (automatisch/Timer)_'));
      L.push('- Antwortform: **' + d.art + '**');
      if (d.info) { L.push(''); L.push('```'); L.push(clip(d.info, 1500)); L.push('```'); }
      var ps = analyseParams({ calls: [r] });
      if (ps.length) {
        L.push('');
        L.push('| Parameter | Beispielwert | Hinweis |');
        L.push('|---|---|---|');
        ps.slice(0, 50).forEach(function (p) {
          var hinweis = p.tokenVerdacht ? 'TOKEN-VERDACHT' : '';
          if (p.tokenVerdacht) {
            var quelle = traceValue(p.beispiele[0]);
            if (quelle.length) hinweis += ' — Quelle: ' + quelle.slice(0, 2).join(', ');
          }
          L.push('| `' + p.key + '` | `' + clip(String(p.beispiele[0]), 60).replace(/\|/g, '\\|') + '` | ' + hinweis + ' |');
        });
      }
      L.push('');
      L.push('Nachstellen:');
      L.push('');
      L.push('```js');
      L.push(codeFor(r));
      L.push('```');
      L.push('');
    });

    L.push('## 2. Alle Endpunkte im Ueberblick');
    L.push('');
    L.push('| Aufrufe | Methode | Pfad | Host | veraenderliche Parameter |');
    L.push('|---|---|---|---|---|');
    eps.slice(0, 40).forEach(function (ep) {
      var ps = analyseParams(ep).filter(function (p) { return !p.konstant; }).map(function (p) { return p.key; });
      var sp = ep.calls.length < 2 ? '_(nur 1 Aufruf — noch nicht vergleichbar)_' : (ps.slice(0, 8).join(', ') || '— alles konstant');
      L.push('| ' + ep.calls.length + ' | ' + ep.method + ' | `' + ep.path + '` | ' + (ep.sameOrigin ? 'gleich' : ep.origin) + ' | ' + sp + ' |');
    });
    L.push('');

    L.push('## 3. Was ist konstant, was aendert sich?');
    L.push('');
    L.push('_Konstante Parameter kann man hart in den Crawler schreiben. Veraenderliche sind die Stellschrauben (Zeitraum, Filter, Seite). Token-Verdacht bedeutet: nicht hart schreiben, sondern bei jedem Lauf frisch mitschneiden._');
    L.push('');
    if (!eps.some(function (e) { return e.calls.length > 1; })) {
      L.push('_Noch kein Endpunkt zweimal aufgerufen. Lade dieselbe Ansicht ein zweites Mal mit ANDEREN Filterwerten (z. B. anderer Zeitraum) — erst der Vergleich zeigt, welcher Parameter die Stellschraube ist._');
      L.push('');
    }
    eps.slice(0, 8).forEach(function (ep) {
      if (ep.calls.length < 2) return;
      L.push('### ' + ep.method + ' ' + ep.path + ' (' + ep.calls.length + ' Aufrufe)');
      L.push('');
      L.push('| Parameter | Art | beobachtete Werte |');
      L.push('|---|---|---|');
      analyseParams(ep).forEach(function (p) {
        L.push('| `' + p.key + '` | ' + (p.tokenVerdacht ? 'TOKEN' : (p.konstant ? 'konstant' : 'STELLSCHRAUBE (' + p.anzahlWerte + ' Werte)')) + ' | `' + clip(p.beispiele.join(' , '), 120).replace(/\|/g, '\\|') + '` |');
      });
      L.push('');
    });

    L.push('## 4. Kausalkette: welcher Klick loest was aus');
    L.push('');
    var withTrigger = S.requests.filter(function (r) { return r.trigger; }).slice(-40);
    if (!withTrigger.length) L.push('_Noch keine Zuordnung. Bediene die Seite bei laufendem Mitschnitt._');
    else {
      L.push('| Zeit | Aktion | Folge-Request | Selektor zum Nachklicken |');
      L.push('|---|---|---|---|');
      withTrigger.forEach(function (r) {
        var trg = S.triggers.filter(function (t) { return t.label === r.trigger; }).slice(-1)[0];
        var u; try { u = new URL(r.url).pathname; } catch (e) { u = r.url; }
        L.push('| ' + stamp(r.ts) + ' | ' + r.trigger.replace(/\|/g, '\\|') + ' | ' + r.method + ' `' + u + '` | `' + ((trg && trg.selector) || '') + '` |');
      });
    }
    L.push('');

    L.push('## 5. Sitzung und Tokens');
    L.push('');
    L.push('| Art | Name | Laenge | Token-Verdacht |');
    L.push('|---|---|---|---|');
    env.cookies.forEach(function (c) { L.push('| Cookie | `' + c.name + '` | ' + c.laenge + ' | ' + (c.tokenVerdacht ? 'ja' : '') + ' |'); });
    inv.hidden.filter(function (h) { return h.tokenVerdacht; }).forEach(function (h) { L.push('| hidden input | `' + h.name + '` | ' + String(h.wert).length + ' | ja |'); });
    env.localStorage.forEach(function (k) { L.push('| localStorage | `' + k.key + '` | ' + k.laenge + ' | ' + (looksLikeToken(k.wert) ? 'ja' : '') + ' |'); });
    L.push('');
    L.push('_Regel: Cookies gehen bei `credentials: "include"` automatisch mit. Alles, was als Feld im Body steht (ViewState, script_id_secure, CSRF), muss aus dem mitgeschnittenen Original-Request uebernommen werden — niemals hart eintragen, das laeuft nach Minuten ab._');
    L.push('');

    L.push('## 6. Bedienelemente (zum Fernsteuern der Oberflaeche)');
    L.push('');
    L.push('### Auswahlfelder');
    inv.selects.slice(0, 20).forEach(function (s) {
      L.push('- `#' + (s.id || s.name) + '` (aktuell `' + s.wert + '`, ' + s.anzahl + ' Optionen): ' + s.optionen.slice(0, 12).join(' | '));
    });
    L.push('');
    L.push('### Schaltflaechen mit ID');
    inv.buttons.filter(function (b) { return b.id; }).slice(0, 40).forEach(function (b) {
      L.push('- `#' + b.id + '` — "' + b.text + '"' + (b.onclick ? '  onclick: `' + clip(b.onclick, 90) + '`' : ''));
    });
    L.push('');
    L.push('### Tabellen im DOM');
    inv.tables.slice(0, 10).forEach(function (t) {
      L.push('- `' + t.selector + '` (' + t.zeilen + ' Zeilen): ' + t.header.slice(0, 15).join(' | '));
    });
    L.push('');

    L.push('## 7. Formulare');
    L.push('');
    inv.forms.slice(0, 10).forEach(function (f) {
      L.push('- **' + (f.id || f.name || 'unbenannt') + '** ' + f.method + ' -> `' + f.action + '`');
      f.felder.slice(0, 25).forEach(function (fe) { L.push('  - ' + fe); });
    });
    L.push('');

    L.push('## 8. Umgebung');
    L.push('');
    L.push('- Eigene globale Variablen: `' + env.globals.slice(0, 60).join('`, `') + '`');
    L.push('- Meta: ' + env.meta.slice(0, 10).join(' | '));
    // nur die, die NICHT ohnehin schon vollstaendig erfasst sind
    var erfasst = {};
    S.requests.forEach(function (r) { erfasst[r.url] = 1; });
    var verpasst = S.early.filter(function (e) { return !erfasst[e.url]; });
    if (verpasst.length) {
      L.push('- Datenaufrufe, die VOR dem Mitschnitt liefen (nur URL, kein Inhalt — Seite mit laufendem Script neu laden, um sie voll zu erfassen):');
      verpasst.slice(0, 20).forEach(function (e) { L.push('  - ' + e.url); });
    }
    L.push('');

    L.push('## 9. Naechster Schritt');
    L.push('');
    L.push('1. Endpunkt aus Abschnitt 1 waehlen, das Snippet in der Konsole ausfuehren — kommen dieselben Daten zurueck, ist der Crawler machbar.');
    L.push('2. Stellschraube aus Abschnitt 3 aendern (z. B. Zeitraum) und pruefen, ob der Server folgt.');
    L.push('3. `rcRecon.stub()` liefert ein lauffaehiges Crawler-Geruest mit Token-Mitschnitt, Takt und Weitergabe.');
    L.push('');

    var md = L.join('\n');
    if (!opt.silent) console.log('%c[rc_recon] Report', 'color:#E60000;font-weight:bold', '\n\n' + md);
    return md;
  }

  // ============================================================
  //  Ausgabe / Download
  // ============================================================
  function download(name, inhalt, typ) {
    var blob = new Blob([inhalt], { type: (typ || 'text/plain') + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function save() {
    var t = new Date(), tag = t.getFullYear() + pad2(t.getMonth() + 1) + pad2(t.getDate()) + '_' + pad2(t.getHours()) + pad2(t.getMinutes());
    var basis = 'recon_' + location.hostname.replace(/[^a-z0-9]+/gi, '_') + '_' + tag;
    download(basis + '.md', report({ silent: true }), 'text/markdown');
    download(basis + '.json', JSON.stringify({
      meta: { version: VERSION, href: location.href, startedAt: S.startedAt, exportedAt: now() },
      frameworks: detectFrameworks(), umgebung: umgebung(), dom: domInventar(),
      requests: S.requests, triggers: S.triggers, navigations: S.navigations, frueh: S.early
    }, null, 2), 'application/json');
    download(basis + '_crawler_stub.js', crawlerStub(), 'text/javascript');
    console.log('%c[rc_recon] 3 Dateien gespeichert: Report (.md), Rohdaten (.json), Crawler-Geruest (.js)', 'color:#008A00;font-weight:bold');
  }

  function list(filter) {
    var rows = S.requests.filter(function (r) {
      if (!filter) return !/\.(png|jpe?g|gif|svg|woff2?|css|ico)(\?|$)/i.test(r.url);
      return r.url.indexOf(filter) !== -1 || (r.reqBody || '').indexOf(filter) !== -1 || (r.resBody || '').indexOf(filter) !== -1;
    }).map(function (r) {
      var u; try { u = new URL(r.url); } catch (e) { u = null; }
      return {
        '#': r.n, Zeit: stamp(r.ts), Methode: r.method,
        Pfad: u ? u.pathname : r.url, Status: r.status, ms: r.ms,
        Antwort: (r.resBody || '').length, Ausloeser: r.trigger || ''
      };
    });
    console.table(rows);
    return rows.length + ' Eintraege (rcRecon.code(#) zeigt das Snippet)';
  }

  function find(text) {
    var hits = S.requests.filter(function (r) {
      return (r.resBody || '').indexOf(text) !== -1 || (r.reqBody || '').indexOf(text) !== -1 || r.url.indexOf(text) !== -1;
    });
    console.log('[rc_recon] "' + text + '" gefunden in ' + hits.length + ' Requests:', hits.map(function (r) { return '#' + r.n + ' ' + r.method + ' ' + r.url; }));
    return hits;
  }

  function reset() {
    S.requests = []; S.triggers = []; S.navigations = [{ ts: now(), href: location.href }];
    S.startedAt = now(); S.seq = 0; S.lastTrigger = null;
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) {}
    updatePanel();
    console.log('[rc_recon] Mitschnitt geleert.');
  }

  function stop() {
    S.paused = true;
    if (ORIG.fetch) window.fetch = ORIG.fetch;
    XMLHttpRequest.prototype.open = ORIG.xhrOpen;
    XMLHttpRequest.prototype.send = ORIG.xhrSend;
    XMLHttpRequest.prototype.setRequestHeader = ORIG.xhrSetHeader;
    if (ORIG.WS) window.WebSocket = ORIG.WS;
    if (panel) panel.remove();
    console.log('[rc_recon] gestoppt, Hooks entfernt. Daten bleiben in rcRecon.data.');
  }

  // ============================================================
  //  Panel
  // ============================================================
  var panel = null, panelZahl = null;
  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'rcReconPanel';
    panel.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
      'background:#1D1D1D', 'color:#F5F5F5', 'border:1px solid #E60000',
      'border-radius:6px', 'padding:10px 12px', 'width:250px',
      'font:12px/1.45 Consolas,monospace', 'box-shadow:0 6px 24px rgba(0,0,0,.45)'
    ].join(';');
    panel.innerHTML =
      '<div style="font-weight:bold;color:#E60000;letter-spacing:.5px">RC RECON v' + VERSION + '</div>' +
      '<div id="rcReconZahl" style="margin:6px 0 8px;color:#CCC">0 Requests</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:4px">' +
      '<button data-a="report">Report</button>' +
      '<button data-a="save">Speichern</button>' +
      '<button data-a="list">Liste</button>' +
      '<button data-a="pause">Pause</button>' +
      '<button data-a="reset">Leeren</button>' +
      '<button data-a="stop">Stop</button>' +
      '</div>' +
      '<div style="margin-top:7px;color:#888;font-size:11px">Seite jetzt normal bedienen.</div>';
    Array.prototype.forEach.call(panel.querySelectorAll('button'), function (b) {
      b.style.cssText = 'background:#2A2A2A;color:#F5F5F5;border:1px solid #444;border-radius:3px;padding:3px 7px;cursor:pointer;font:11px Consolas,monospace';
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var a = b.getAttribute('data-a');
        if (a === 'report') report();
        else if (a === 'save') save();
        else if (a === 'list') list();
        else if (a === 'reset') reset();
        else if (a === 'stop') stop();
        else if (a === 'pause') { S.paused = !S.paused; b.textContent = S.paused ? 'Weiter' : 'Pause'; updatePanel(); }
      }, true);
    });
    // Panel-eigene Klicks nicht als Benutzeraktion werten
    panel.addEventListener('click', function (ev) { ev.stopPropagation(); }, true);
    document.documentElement.appendChild(panel);
    panelZahl = panel.querySelector('#rcReconZahl');
  }
  function updatePanel() {
    if (!panelZahl) return;
    var echte = S.requests.filter(function (r) { return !/\.(png|jpe?g|gif|svg|woff2?|css|ico)(\?|$)/i.test(r.url); }).length;
    panelZahl.textContent = echte + ' Requests | ' + S.triggers.length + ' Aktionen' + (S.paused ? ' | PAUSE' : '');
  }
  try { buildPanel(); updatePanel(); } catch (e) {}

  // ============================================================
  //  Oeffentliche Schnittstelle
  // ============================================================
  window.rcRecon = {
    version: VERSION,
    data: S,
    report: report,
    save: save,
    list: list,
    find: find,
    code: codeFor,
    // ACHTUNG: gibt bewusst NICHTS zurueck. Sonst zeigt die Konsole den
    // Rueckgabewert zusaetzlich an und beim Kopieren landet ein fuehrendes
    // Komma im Code -> "Uncaught SyntaxError: Unexpected token ','".
    // Zum Weiterverwenden rcRecon.save() nehmen (schreibt eine .js-Datei).
    stub: function () { console.log(crawlerStub()); },
    endpoints: function () { console.table(groupEndpoints().map(function (e) { return { Methode: e.method, Pfad: e.path, Host: e.origin, Aufrufe: e.calls.length }; })); },
    params: function (pfadTeil) {
      var ep = groupEndpoints().filter(function (e) { return e.path.indexOf(pfadTeil) !== -1; })[0];
      if (!ep) return 'Kein Endpunkt mit "' + pfadTeil + '"';
      console.table(analyseParams(ep));
      return ep.key;
    },
    trace: traceValue,
    dom: domInventar,
    env: umgebung,
    reset: reset,
    stop: stop,
    __panel: panel
  };

  console.log(
    '%c[rc_recon v' + VERSION + '] Mitschnitt laeuft.',
    'color:#E60000;font-weight:bold;font-size:13px'
  );
  console.log(
    'Jetzt die Seite NORMAL bedienen (Filter setzen, Aktualisieren/Ok klicken, Tabelle laden).\n' +
    'Danach:\n' +
    '  rcRecon.report()      Report in der Konsole\n' +
    '  rcRecon.save()        Report + Rohdaten + Crawler-Geruest als Dateien\n' +
    '  rcRecon.list()        Tabelle aller Requests\n' +
    '  rcRecon.code(12)      Snippet zum Nachstellen von Request 12\n' +
    '  rcRecon.find("Text")  in welchen Antworten steht dieser Text?\n' +
    '  rcRecon.stub()        Crawler-Grundgeruest\n' +
    '  rcRecon.stop()        Hooks entfernen'
  );
})();
