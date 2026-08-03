(function () {
  // ============================================================
  //  CroCo-Report-Crawler v1 — ccs.vodafone.de/CROCO_REPORT
  //  ------------------------------------------------------------
  //  In die Konsole (F12) von crocorep.rb einfuegen.
  //
  //  Datenendpunkt (aus dem Recon-Mitschnitt):
  //    GET /cgi-bin/CROCO_REPORT/get_result.rb?<27 Query-Parameter>
  //    -> {"success":true,"html":"<table class='croco-result-table'>..."}
  //  Die Nutzdaten stecken also als HTML-STRING im JSON. Spalten sind
  //  NICHT fest: sie haengen von den cumulate_*-Flags ab (cumulate_x=0
  //  blendet die Spalte x EIN, =1 fasst sie zusammen). Der Parser liest
  //  den Header deshalb dynamisch.
  //
  //  Stammdaten (Dropdown-Inhalte):
  //    GET get_data.rb?type=get-provider|get-ebene1|get-ebene2
  //                        |get-locations|get-teams
  //
  //  ACHTUNG TEMPO: get_result.rb brauchte im Mitschnitt 32-35 SEKUNDEN.
  //  Das ist eine schwere Datenbankabfrage. Default-Takt daher 15 Minuten;
  //  kuerzer nur mit gutem Grund. Parallele Laeufe sind gesperrt.
  //
  //  Authentifizierung: nur das CCS_User-Cookie (credentials:"include").
  //  Kein Token im Body, nichts laeuft ab.
  //
  //  Konsole:
  //    rcCrocoProbe()             erste Zeilen roh zeigen (zum Verdrahten)
  //    rcCrocoHole()              ein Lauf mit den aktuellen Parametern
  //    rcCrocoHeute()             Lauf fuer heute (user_defined)
  //    rcCrocoZeitraum(von,bis)   'YYYY-MM-DD'
  //    rcCrocoTabelle()           letzter Stand als Tabelle
  //    rcCrocoAggregat(spalte)    Gruppierung, z.B. 'CCS: User'
  //    rcCrocoStammdaten()        Standorte/Teams/Ebenen holen
  //    rcCrocoParams()            aktuelle Parameter zeigen/setzen
  //    rcCrocoStart() / rcCrocoStop()
  //    rcCrocoHistorie()
  // ============================================================
  'use strict';

  var VERSION = '1.0';
  var ERG_URL = window.RC_CROCO_ERG || '/cgi-bin/CROCO_REPORT/get_result.rb';
  var STAMM_URL = window.RC_CROCO_STAMM || '/cgi-bin/CROCO_REPORT/get_data.rb';
  var KANAL = 'regiocom_croco';
  var TAKT_MS = 900000;      // 15 Minuten — der Request dauert ~35 s
  var TIMEOUT_MS = 180000;   // 3 Minuten, grosszuegig wegen der langen Abfrage
  var HIST_KEY = 'rcCrocoHistorie';
  var PARAM_KEY = 'rcCrocoParams';
  var HIST_TAGE = 35;

  if (window.RC_CROCO && window.RC_CROCO.stop) { try { window.RC_CROCO.stop(); } catch (e) {} }

  // ============================================================
  //  Hilfen
  // ============================================================
  function pad2(n) { return String(n).padStart(2, '0'); }
  function isoTag(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function txt(el) { return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim(); }
  function jetzt() { return Date.now(); }
  // Datum-Zelle -> 'YYYY-MM-DD'. Das Portal liefert je nach Spalte
  // unterschiedliche Schreibweisen, deshalb beide Richtungen pruefen.
  function datumKey(s) {
    var t = String(s || '').trim();
    if (!t) return '';
    var m = t.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
    m = t.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]);
    return '';
  }
  function lade(key, fallback) {
    try { var s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; }
  }
  function speichere(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { console.warn('[CroCo] Speichern fehlgeschlagen:', e.message); }
  }

  // ============================================================
  //  Parameter — Standard aus dem Recon-Mitschnitt
  //  cumulate_x = 1 -> zusammengefasst,  = 0 -> Spalte wird ausgewiesen
  // ============================================================
  var STANDARD = {
    user_id: '',                    // wird aus dem Cookie/Mitschnitt gefuellt
    report_type: 'takes',           // takes | products | conversion
    report_details: '1',
    report_take_details: '1',
    product_details: '0',
    nba_tipp: '1',
    sql_output: '0',
    daterange: 'current_month',     // user_defined | yesterday | current_week |
                                    // current_month | current_quarter |
                                    // last_week | last_month | last_quarter
                                    // ACHTUNG: es gibt KEIN "heute" — dafuer
                                    // user_defined mit start=end=heute (rcCrocoHeute)
    userdef_startdate: isoTag(),    // Format YYYY-MM-DD (NICHT YYYYMMDD wie die Ligaliste)
    userdef_enddate: isoTag(),
    serviceunits: '-1',
    sp_ids: '10026',                // 10026 = regiocom
    locations: '-1',                // Komma-Liste oder -1
    team_ids: '-1',                 // interne Team-IDs (nicht die Teamnummer!)
    product_types: '-1',            // B=DSL F=Fiber Y=Kabel R=Mobilfunk L=Unity
    divisions: '-1',
    sales_employees: '-1',          // 'BNT,D2C' | 'VVL,TW'
    sales_types: '',
    cumulate_serviceunits: '1',
    cumulate_provider: '1',
    cumulate_locations: '0',        // Standort ausweisen — brauchen wir fuer das Dashboard
    cumulate_teams: '0',            // Team ausweisen
    cumulate_producttypes: '0',     // Produkt-Typ ausweisen
    cumulate_salestypes: '0',
    cumulate_sales_employees: '0',  // Agent ausweisen
    cumulate_divisions: '1',
    timegroup: '0'                  // 0=Kumuliert 1=Tag 2=KW 3=Monat
  };

  var RC_CROCO = {
    version: VERSION,
    params: Object.assign({}, STANDARD, lade(PARAM_KEY, {})),
    stammdaten: null,
    letzterStand: null,     // {header, zeilen, ts, dauerMs}
    laeuftGerade: false,
    timer: null,
    stop: null
  };

  // user_id aus dem CCS_User-Cookie ziehen, falls noch nicht gesetzt
  (function userIdAusCookie() {
    if (RC_CROCO.params.user_id) return;
    try {
      var m = (document.cookie || '').match(/user_id&(\d+)/);
      if (m) RC_CROCO.params.user_id = m[1];
    } catch (e) {}
  })();

  // ============================================================
  //  Original-Request mitschneiden — damit der Crawler die Filter
  //  erbt, die der Nutzer im Portal gesetzt hat.
  // ============================================================
  var ZIEL_DATEI = (String(ERG_URL).split('?')[0].split('/').pop()) || 'get_result.rb';
  var letzterMitschnitt = 0;
  function verarbeiteUrl(u) {
    try {
      if (String(u).indexOf(ZIEL_DATEI) === -1) return;
      var url = new URL(u, location.href);
      var uebernommen = 0;
      url.searchParams.forEach(function (v, k) {
        if (k in STANDARD) { RC_CROCO.params[k] = v; uebernommen++; }
      });
      if (uebernommen) {
        speichere(PARAM_KEY, RC_CROCO.params);
        letzterMitschnitt = jetzt();
        console.log('[CroCo] Filter aus dem Portal uebernommen (' + uebernommen + ' Parameter).');
      }
    } catch (e) {}
  }
  (function hook() {
    if (window.__rcCrocoHooked) return;
    window.__rcCrocoHooked = true;
    var of = window.fetch;
    if (of) window.fetch = function (i) {
      try { verarbeiteUrl(typeof i === 'string' ? i : (i && i.url) || ''); } catch (e) {}
      return of.apply(this, arguments);
    };
    var oo = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u) {
      try { verarbeiteUrl(u); } catch (e) {}
      return oo.apply(this, arguments);
    };
  })();

  // ============================================================
  //  Abruf
  // ============================================================
  function baueUrl(basis, params) {
    var u = new URL(basis, location.origin);
    Object.keys(params).forEach(function (k) {
      if (params[k] !== undefined && params[k] !== null) u.searchParams.set(k, params[k]);
    });
    return u.href;
  }

  async function hole(basis, params, wasIstDas) {
    var ctrl = new AbortController();
    var timeout = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    var t0 = jetzt();
    try {
      var res = await fetch(baueUrl(basis, params), {
        method: 'GET', credentials: 'include', signal: ctrl.signal,
        headers: { 'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' }
      });
      clearTimeout(timeout);
      if (!res.ok) { console.warn('[CroCo] ' + wasIstDas + ' HTTP ' + res.status); return null; }
      var json = await res.json();
      json.__dauerMs = jetzt() - t0;
      return json;
    } catch (e) {
      clearTimeout(timeout);
      if (e.name === 'AbortError') console.error('[CroCo] ' + wasIstDas + ' nach ' + (TIMEOUT_MS / 1000) + ' s abgebrochen. Zeitraum verkleinern oder Filter enger setzen.');
      else console.error('[CroCo] ' + wasIstDas + ' fehlgeschlagen:', e);
      return null;
    }
  }

  // ============================================================
  //  Tabelle aus dem HTML-String im JSON parsen
  //  Header ist NICHT fest — er haengt von den cumulate_*-Flags ab.
  // ============================================================
  function parseTabelle(html) {
    var doc = new DOMParser().parseFromString(html || '', 'text/html');
    var tab = doc.querySelector('table.croco-result-table') || doc.querySelector('table');
    if (!tab) return { header: [], zeilen: [], summen: [] };

    // Header: letzte Kopfzeile enthaelt die Blatt-Spalten
    var kopfZeilen = tab.querySelectorAll('thead tr');
    var kopf = [];
    if (kopfZeilen.length) {
      kopf = Array.prototype.map.call(kopfZeilen[kopfZeilen.length - 1].querySelectorAll('th'), txt);
    }
    if (!kopf.length) {
      var ersteZeile = tab.querySelector('tr');
      if (ersteZeile) kopf = Array.prototype.map.call(ersteZeile.querySelectorAll('th,td'), txt);
    }

    var zeilen = [], summen = [];
    var koerper = tab.querySelectorAll('tbody tr');
    if (!koerper.length) koerper = tab.querySelectorAll('tr');

    Array.prototype.forEach.call(koerper, function (tr) {
      if (tr.querySelector('th') && !tr.querySelector('td')) return;   // Kopfzeile
      var zellen = Array.prototype.map.call(tr.querySelectorAll('td'), txt);
      if (!zellen.length) return;
      var o = {};
      kopf.forEach(function (k, i) { o[k || ('Spalte' + i)] = zellen[i] !== undefined ? zellen[i] : ''; });
      // Summen-/Zwischenzeilen erkennen (das Portal markiert sie per Klasse
      // oder laesst die ID-Spalten leer)
      var klasse = (tr.className || '').toLowerCase();
      if (/sum|total|gesamt|footer/.test(klasse)) summen.push(o);
      else zeilen.push(o);
    });

    // tfoot ist immer Summe
    Array.prototype.forEach.call(tab.querySelectorAll('tfoot tr'), function (tr) {
      var zellen = Array.prototype.map.call(tr.querySelectorAll('td,th'), txt);
      var o = {};
      kopf.forEach(function (k, i) { o[k || ('Spalte' + i)] = zellen[i] !== undefined ? zellen[i] : ''; });
      summen.push(o);
    });

    return { header: kopf, zeilen: zeilen, summen: summen };
  }

  // Spaltennamen tolerant suchen ("CCS: User", "CCS User", "ccs_user")
  function spalte(header, kandidaten) {
    var norm = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); };
    for (var i = 0; i < kandidaten.length; i++) {
      var k = norm(kandidaten[i]);
      for (var j = 0; j < header.length; j++) {
        if (norm(header[j]) === k) return header[j];
      }
    }
    // Teiltreffer als zweite Chance
    for (var a = 0; a < kandidaten.length; a++) {
      var ka = norm(kandidaten[a]);
      for (var b = 0; b < header.length; b++) {
        if (norm(header[b]).indexOf(ka) !== -1) return header[b];
      }
    }
    return null;
  }

  // ============================================================
  //  Hauptlauf
  // ============================================================
  async function lauf(ueberschreiben) {
    if (RC_CROCO.laeuftGerade) {
      console.warn('[CroCo] Ein Lauf laeuft bereits (die Abfrage dauert ~35 s) — uebersprungen.');
      return null;
    }
    RC_CROCO.laeuftGerade = true;
    var params = Object.assign({}, RC_CROCO.params, ueberschreiben || {});
    console.log('[CroCo] Abfrage laeuft (dauert typischerweise 30-40 s)...', params.daterange,
      params.daterange === 'user_defined' ? (params.userdef_startdate + ' bis ' + params.userdef_enddate) : '');
    try {
      var json = await hole(ERG_URL, params, 'get_result.rb');
      if (!json) return null;
      if (json.success !== true) console.warn('[CroCo] Antwort meldet success != true');
      var t = parseTabelle(json.html || '');
      RC_CROCO.letzterStand = {
        header: t.header, zeilen: t.zeilen, summen: t.summen,
        params: params, ts: jetzt(), dauerMs: json.__dauerMs
      };
      console.log('[CroCo] ' + t.zeilen.length + ' Datenzeilen, ' + t.header.length + ' Spalten, ' +
        Math.round(json.__dauerMs / 1000) + ' s.');
      archiviere(RC_CROCO.letzterStand);
      sende(RC_CROCO.letzterStand);
      return RC_CROCO.letzterStand;
    } finally {
      RC_CROCO.laeuftGerade = false;
    }
  }

  // ============================================================
  //  Stammdaten (fuellen im Portal die Dropdowns)
  // ============================================================
  async function stammdaten() {
    var sp = RC_CROCO.params.sp_ids || '10026';
    var abfragen = [
      { schluessel: 'provider', p: { type: 'get-provider', user_id: RC_CROCO.params.user_id } },
      { schluessel: 'ebene1', p: { type: 'get-ebene1' } },
      { schluessel: 'ebene2', p: { type: 'get-ebene2', new_01: '-1' } },
      { schluessel: 'locations', p: { type: 'get-locations', sp_ids: sp } },
      { schluessel: 'teams', p: { type: 'get-teams', sp_ids: sp, locations: '-1' } }
    ];
    var out = {};
    for (var i = 0; i < abfragen.length; i++) {
      var a = abfragen[i];
      var r = await hole(STAMM_URL, a.p, 'get_data.rb/' + a.schluessel);
      out[a.schluessel] = r;
      await new Promise(function (f) { setTimeout(f, 300); });
    }
    RC_CROCO.stammdaten = out;
    console.log('[CroCo] Stammdaten geholt:', Object.keys(out).join(', '));
    return out;
  }

  // ============================================================
  //  Auswertung
  // ============================================================
  function aggregat(nachSpalte) {
    var st = RC_CROCO.letzterStand;
    if (!st) { console.warn('[CroCo] Noch kein Stand — rcCrocoHole() ausfuehren.'); return null; }
    var sp = nachSpalte || spalte(st.header, ['CCS: User', 'CCS User', 'ccs_user']) || st.header[1];
    if (!sp) { console.warn('[CroCo] Spalte nicht gefunden. Verfuegbar:', st.header); return null; }

    var stornoSp = spalte(st.header, ['Dat: Storno', 'Storno']);
    var bruttoSp = spalte(st.header, ['Dat: Brutto', 'Brutto']);
    var aktivSp = spalte(st.header, ['Dat: Aktivierung', 'Aktivierung']);

    var map = {};
    st.zeilen.forEach(function (z) {
      var k = z[sp] || '(leer)';
      if (!map[k]) map[k] = { schluessel: k, zeilen: 0, brutto: 0, storniert: 0, aktiviert: 0 };
      map[k].zeilen++;
      if (bruttoSp && datumKey(z[bruttoSp])) map[k].brutto++;
      if (stornoSp && datumKey(z[stornoSp])) map[k].storniert++;
      if (aktivSp && datumKey(z[aktivSp])) map[k].aktiviert++;
    });
    var liste = Object.keys(map).map(function (k) {
      var e = map[k];
      // Netto = Brutto ohne Storno. ANNAHME — nach dem ersten echten Lauf
      // gegen die Portal-Summen pruefen (rcCrocoProbe zeigt die Rohzeilen).
      e.netto = e.brutto - e.storniert;
      return e;
    }).sort(function (a, b) { return b.zeilen - a.zeilen; });
    console.table(liste.slice(0, 50));
    return liste;
  }

  function probe(anzahl) {
    var st = RC_CROCO.letzterStand;
    if (!st) { console.warn('[CroCo] Noch kein Stand — rcCrocoHole() ausfuehren.'); return null; }
    console.log('[CroCo] Spalten (' + st.header.length + '):\n  ' + st.header.join('\n  '));
    var n = anzahl || 3;
    console.log('[CroCo] Erste ' + n + ' Zeilen roh:');
    st.zeilen.slice(0, n).forEach(function (z, i) { console.log('--- Zeile ' + (i + 1) + ' ---'); console.log(JSON.stringify(z, null, 2)); });
    if (st.summen.length) { console.log('[CroCo] Summenzeilen:'); console.log(JSON.stringify(st.summen.slice(0, 3), null, 2)); }
    return { header: st.header, beispiele: st.zeilen.slice(0, n), summen: st.summen.slice(0, 3) };
  }

  function tabelle(max) {
    var st = RC_CROCO.letzterStand;
    if (!st) { console.warn('[CroCo] Noch kein Stand.'); return; }
    console.table(st.zeilen.slice(0, max || 100));
    console.log('[CroCo] ' + st.zeilen.length + ' Zeilen insgesamt (angezeigt: ' + Math.min(st.zeilen.length, max || 100) + ')');
  }

  // ============================================================
  //  Historie — Tages-Aggregat je CCS-User, damit die Datei klein bleibt
  //  (die Rohtabelle hat leicht ueber 10.000 Zeilen)
  // ============================================================
  function archiviere(stand) {
    try {
      var agg = {};
      var ccsSp = spalte(stand.header, ['CCS: User', 'CCS User', 'ccs_user']);
      var voidSp = spalte(stand.header, ['VOID', 'VO-ID', 'VO ID']);
      var bruttoSp = spalte(stand.header, ['Dat: Brutto', 'Brutto']);
      var stornoSp = spalte(stand.header, ['Dat: Storno', 'Storno']);
      if (!ccsSp) return;
      stand.zeilen.forEach(function (z) {
        var k = z[ccsSp] || '(leer)';
        if (!agg[k]) agg[k] = { zeilen: 0, brutto: 0, storniert: 0, voId: voidSp ? z[voidSp] : '' };
        agg[k].zeilen++;
        if (bruttoSp && datumKey(z[bruttoSp])) agg[k].brutto++;
        if (stornoSp && datumKey(z[stornoSp])) agg[k].storniert++;
      });
      var hist = lade(HIST_KEY, {});
      hist[isoTag()] = { ts: stand.ts, params: { daterange: stand.params.daterange, von: stand.params.userdef_startdate, bis: stand.params.userdef_enddate }, byCcs: agg };
      var tage = Object.keys(hist).sort();
      while (tage.length > HIST_TAGE) { delete hist[tage.shift()]; }
      speichere(HIST_KEY, hist);
    } catch (e) { console.warn('[CroCo] Archivierung fehlgeschlagen:', e.message); }
  }

  // ============================================================
  //  Weitergabe ans Dashboard
  // ============================================================
  function sende(stand) {
    var nutzlast = {
      typ: 'croco_daten', quelle: 'croco_report', ts: stand.ts,
      header: stand.header, zeilen: stand.zeilen, summen: stand.summen,
      params: stand.params
    };
    try { new BroadcastChannel(KANAL).postMessage(nutzlast); } catch (e) {}
    try { if (window.opener) window.opener.postMessage(nutzlast, '*'); } catch (e) {}
  }

  // ============================================================
  //  Takt
  // ============================================================
  function start(taktMs) {
    stopp();
    var t = taktMs || TAKT_MS;
    if (t < 300000) console.warn('[CroCo] Takt unter 5 Minuten bei einer 35-Sekunden-Abfrage — das belastet den Server unnoetig.');
    lauf();
    RC_CROCO.timer = setInterval(function () { lauf(); }, t);
    console.log('[CroCo] Takt gestartet: alle ' + Math.round(t / 60000) + ' Minuten.');
  }
  function stopp() {
    if (RC_CROCO.timer) clearInterval(RC_CROCO.timer);
    RC_CROCO.timer = null;
  }
  RC_CROCO.stop = function () { stopp(); console.log('[CroCo] gestoppt.'); };

  // ============================================================
  //  Schnittstelle
  // ============================================================
  window.RC_CROCO = RC_CROCO;
  window.rcCrocoHole = function (ueberschreiben) { return lauf(ueberschreiben); };
  window.rcCrocoHeute = function () {
    var h = isoTag();
    return lauf({ daterange: 'user_defined', userdef_startdate: h, userdef_enddate: h });
  };
  window.rcCrocoZeitraum = function (von, bis) {
    return lauf({ daterange: 'user_defined', userdef_startdate: von, userdef_enddate: bis || von });
  };
  window.rcCrocoProbe = probe;
  window.rcCrocoTabelle = tabelle;
  window.rcCrocoAggregat = aggregat;
  window.rcCrocoStammdaten = stammdaten;
  window.rcCrocoHistorie = function () { return lade(HIST_KEY, {}); };
  window.rcCrocoStart = start;
  window.rcCrocoStop = RC_CROCO.stop;
  window.rcCrocoParams = function (neu) {
    if (neu) { Object.assign(RC_CROCO.params, neu); speichere(PARAM_KEY, RC_CROCO.params); }
    console.table(Object.keys(RC_CROCO.params).map(function (k) { return { Parameter: k, Wert: RC_CROCO.params[k] }; }));
    return RC_CROCO.params;
  };

  console.log('%c[CroCo-Report-Crawler v' + VERSION + '] bereit', 'color:#E60000;font-weight:bold;font-size:13px');
  console.log(
    'Die Abfrage dauert 30-40 s — Geduld, das ist normal.\n' +
    'Erster Schritt:\n' +
    '  rcCrocoHole()    einmal mit den aktuellen Filtern laufen\n' +
    '  rcCrocoProbe()   danach: Spalten + erste Zeilen roh ansehen\n' +
    'Weiter:\n' +
    '  rcCrocoHeute()                  nur heute (user_defined)\n' +
    '  rcCrocoZeitraum("2026-07-01","2026-07-28")\n' +
    '  rcCrocoAggregat("CCS: User")    Gruppierung\n' +
    '  rcCrocoStart()                  Takt alle 15 Minuten\n' +
    'Hinweis: Klickst du im Portal auf "Ok", uebernimmt der Crawler deine Filter automatisch.'
  );
  if (!RC_CROCO.params.user_id) console.warn('[CroCo] user_id unbekannt — einmal im Portal "Ok" klicken, dann ist sie da.');
})();
