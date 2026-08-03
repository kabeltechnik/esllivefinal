(function () {
  // ============================================================
  //  CroCo-Tuner & Export v2 — ccs.vodafone.de/CROCO_REPORT
  //  ------------------------------------------------------------
  //  In die Konsole (F12) von crocorep.rb einfuegen. Blendet ein Panel ein:
  //
  //   1. ABFRAGE  — jeder Parameter von get_result.rb schaltbar,
  //                 jeder Lauf gestoppt (Dauer/Zeilen/Spalten/Groesse).
  //                 Beantwortet die Frage "wird es ohne Spalten schneller?"
  //                 durch Messung statt Vermutung.
  //   2. EXPORT   — nach dem Abruf: Spalten einzeln an-/abwaehlen,
  //                 Zeilen filtern, und auf DREI Wegen als Excel holen:
  //                   a) Server-Excel ueber /cgi-bin/LOGIN/table2excel.pl
  //                      (derselbe Weg wie der "Excel"-Knopf des Portals)
  //                   b) CSV lokal (Semikolon + BOM, deutsches Excel)
  //                   c) XLSX lokal ueber SheetJS
  //
  //  Warum im Portal-Tab und nicht als lokale HTML-Datei: get_result.rb
  //  braucht das CCS_User-Cookie und erlaubt keinen Cross-Origin-Zugriff.
  //  Eine Datei von der Festplatte bekaeme weder das eine noch das andere.
  //  Die Ergebnisse werden dagegen als eigenstaendige Dateien gespeichert.
  //
  //  Die cumulate_*-Flags steuern die SERVERSEITIGE Abfrage:
  //    cumulate_x = 0  ->  x wird als eigene Spalte ausgewiesen
  //                        (zusaetzliche GROUP-BY-Dimension, mehr Zeilen)
  //    cumulate_x = 1  ->  x wird zusammengefasst
  //  report_details / report_take_details / product_details steuern die
  //  Detailtiefe — vermutlich der groesste Hebel.
  //
  //  ACHTUNG: Jede Messung ist eine echte, schwere Datenbankabfrage
  //  (~35 s im Mitschnitt). Der Vergleichslauf fuehrt sie NACHEINANDER
  //  aus, mit Pause. Nicht unnoetig oft laufen lassen.
  //
  //  Konsole: rcTunerMessen() · rcTunerVergleich() · rcTunerReport()
  //           rcTunerExport('csv'|'xlsx'|'server')
  // ============================================================
  'use strict';

  var VERSION = '2.0';
  var ERG_URL = window.RC_CROCO_ERG || '/cgi-bin/CROCO_REPORT/get_result.rb';
  var EXCEL_URL = window.RC_CROCO_EXCEL || '/cgi-bin/LOGIN/table2excel.pl';
  var SHEETJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var TIMEOUT_MS = 180000;
  var PAUSE_MS = 3000;
  var MESS_KEY = 'rcTunerMessungen';
  var SPALTEN_KEY = 'rcTunerSpaltenwahl';

  if (window.rcTuner && window.rcTuner.__panel) { try { window.rcTuner.__panel.remove(); } catch (e) {} }

  // ============================================================
  //  Hilfen
  // ============================================================
  function pad2(n) { return String(n).padStart(2, '0'); }
  function isoTag(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function zeitStempel() { var d = new Date(); return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '_' + pad2(d.getHours()) + pad2(d.getMinutes()); }
  function txt(el) { return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim(); }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function datumKey(s) {
    var t = String(s || '').trim();
    if (!t) return '';
    var m = t.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
    m = t.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]);
    return '';
  }
  // Spaltennamen tolerant suchen ("Dat: Brutto" / "Dat Brutto" / "brutto")
  function findeSpalte(header, kandidaten) {
    var norm = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); };
    for (var i = 0; i < kandidaten.length; i++) {
      var k = norm(kandidaten[i]);
      for (var j = 0; j < header.length; j++) if (norm(header[j]) === k) return header[j];
    }
    for (var a = 0; a < kandidaten.length; a++) {
      var ka = norm(kandidaten[a]);
      for (var b = 0; b < header.length; b++) if (norm(header[b]).indexOf(ka) !== -1) return header[b];
    }
    return null;
  }
  function speicherLade(key, fallback) {
    try { var s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; }
  }
  function speicherSetze(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }
  function dateiDownload(name, inhalt, typ) {
    var blob = (inhalt instanceof Blob) ? inhalt : new Blob([inhalt], { type: (typ || 'text/plain') + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  // ============================================================
  //  Parameter-Modell
  // ============================================================
  var DETAIL_FLAGS = [
    { key: 'report_details', label: 'report_details', hinweis: 'Detailzeilen statt Aggregat' },
    { key: 'report_take_details', label: 'report_take_details', hinweis: 'Take-Einzelsaetze' },
    { key: 'product_details', label: 'product_details', hinweis: 'Produkt-Einzelsaetze' },
    { key: 'nba_tipp', label: 'nba_tipp', hinweis: 'zusaetzlicher Join?' }
  ];
  var CUM_FLAGS = [
    { key: 'cumulate_locations', label: 'Standorte' },
    { key: 'cumulate_teams', label: 'Teams' },
    { key: 'cumulate_producttypes', label: 'Produkt-Typen' },
    { key: 'cumulate_salestypes', label: 'Verkaufsarten' },
    { key: 'cumulate_sales_employees', label: 'Agenten' },
    { key: 'cumulate_divisions', label: 'Divisions' },
    { key: 'cumulate_serviceunits', label: 'Serviceunits' },
    { key: 'cumulate_provider', label: 'Provider' }
  ];

  var basis = {
    user_id: '', report_type: 'takes',
    report_details: '1', report_take_details: '1', product_details: '0', nba_tipp: '1',
    sql_output: '0',
    daterange: 'current_month', userdef_startdate: isoTag(), userdef_enddate: isoTag(),
    serviceunits: '-1', sp_ids: '10026', locations: '-1', team_ids: '-1',
    product_types: '-1', divisions: '-1', sales_employees: '-1', sales_types: '',
    cumulate_serviceunits: '1', cumulate_provider: '1', cumulate_locations: '1',
    cumulate_teams: '1', cumulate_producttypes: '1', cumulate_salestypes: '0',
    cumulate_sales_employees: '1', cumulate_divisions: '1', timegroup: '0'
  };

  try { var mm0 = (document.cookie || '').match(/user_id&(\d+)/); if (mm0) basis.user_id = mm0[1]; } catch (e) {}

  (function ausDerSeite() {
    var sel = function (id) { var e = document.getElementById(id); return e ? e.value : null; };
    var d = sel('daterange-list'); if (d) basis.daterange = d;
    var r = sel('report-list'); if (r) basis.report_type = r;
    var t = sel('timegroup-list'); if (t) basis.timegroup = t;
    var l = document.getElementById('location-list');
    if (l) {
      var gewaehlt = Array.prototype.filter.call(l.options, function (o) { return o.selected; }).map(function (o) { return o.value; });
      if (gewaehlt.length) basis.locations = gewaehlt.join(',');
    }
  })();

  (function hook() {
    if (window.__rcTunerHooked) return;
    window.__rcTunerHooked = true;
    var ziel = String(ERG_URL).split('?')[0].split('/').pop();
    var uebernimm = function (u) {
      try {
        if (String(u).indexOf(ziel) === -1) return;
        var url = new URL(u, location.href);
        url.searchParams.forEach(function (v, k) { if (k in basis) basis[k] = v; });
        felderAusBasis();
      } catch (e) {}
    };
    var of = window.fetch;
    if (of) window.fetch = function (i) { try { uebernimm(typeof i === 'string' ? i : (i && i.url) || ''); } catch (e) {} return of.apply(this, arguments); };
    var oo = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (mth, u) { try { uebernimm(u); } catch (e) {} return oo.apply(this, arguments); };
  })();

  var messungen = [];
  try { messungen = JSON.parse(sessionStorage.getItem(MESS_KEY) || '[]'); } catch (e) {}

  // Die Nutzdaten des letzten Laufs. BEWUSST nicht persistiert —
  // 10.000+ Zeilen sprengen jeden Web-Speicher.
  var letzteDaten = null;   // {header, zeilen, summen, params, ts}
  var spaltenWahl = {};     // Spaltenname -> true/false

  // ============================================================
  //  Abruf und Messung
  // ============================================================
  function baueUrl(params) {
    var u = new URL(ERG_URL, location.origin);
    Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); });
    return u.href;
  }

  function parseTabelle(html) {
    var doc = new DOMParser().parseFromString(html || '', 'text/html');
    var tab = doc.querySelector('table.croco-result-table') || doc.querySelector('table');
    if (!tab) return { header: [], zeilen: [], summen: [] };

    var kopfZeilen = tab.querySelectorAll('thead tr');
    var header = kopfZeilen.length
      ? Array.prototype.map.call(kopfZeilen[kopfZeilen.length - 1].querySelectorAll('th'), txt)
      : [];
    if (!header.length) {
      var erste = tab.querySelector('tr');
      if (erste) header = Array.prototype.map.call(erste.querySelectorAll('th,td'), txt);
    }

    var zeilen = [], summen = [];
    var koerper = tab.querySelectorAll('tbody tr');
    if (!koerper.length) koerper = tab.querySelectorAll('tr');
    Array.prototype.forEach.call(koerper, function (tr) {
      if (tr.querySelector('th') && !tr.querySelector('td')) return;
      var zellen = Array.prototype.map.call(tr.querySelectorAll('td'), txt);
      if (!zellen.length) return;
      var o = {};
      header.forEach(function (k, i) { o[k || ('Spalte' + i)] = zellen[i] !== undefined ? zellen[i] : ''; });
      var klasse = (tr.className || '').toLowerCase();
      if (/sum|total|gesamt|footer/.test(klasse)) summen.push(o); else zeilen.push(o);
    });
    Array.prototype.forEach.call(tab.querySelectorAll('tfoot tr'), function (tr) {
      var zellen = Array.prototype.map.call(tr.querySelectorAll('td,th'), txt);
      var o = {};
      header.forEach(function (k, i) { o[k || ('Spalte' + i)] = zellen[i] !== undefined ? zellen[i] : ''; });
      summen.push(o);
    });
    return { header: header, zeilen: zeilen, summen: summen };
  }

  async function messen(params, name) {
    params = params || aktuelleParams();
    var ctrl = new AbortController();
    var to = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    var t0 = performance.now();
    var erg = { name: name || 'Einzelmessung', ts: Date.now(), params: JSON.parse(JSON.stringify(params)) };
    setStatus('laeuft: ' + erg.name + ' ... (30-40 s sind normal)');
    try {
      var res = await fetch(baueUrl(params), {
        method: 'GET', credentials: 'include', signal: ctrl.signal,
        headers: { 'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' }
      });
      var roh = await res.text();
      clearTimeout(to);
      erg.ms = Math.round(performance.now() - t0);
      erg.status = res.status;
      erg.bytes = roh.length;
      var json = null;
      try { json = JSON.parse(roh); } catch (e) {}
      if (json && json.html) {
        var t = parseTabelle(json.html);
        erg.zeilen = t.zeilen.length; erg.spalten = t.header.length;
        letzteDaten = { header: t.header, zeilen: t.zeilen, summen: t.summen, params: params, ts: Date.now() };
        uebernimmSpaltenWahl(t.header);
        zeichneSpalten();
      } else if (json && json.sql) {
        erg.sql = String(json.sql).slice(0, 4000);
        erg.zeilen = 0; erg.spalten = 0;
        console.log('[Tuner] SQL-Ausgabe:\n' + erg.sql);
      } else {
        erg.zeilen = 0; erg.spalten = 0;
        erg.hinweis = 'Antwort ohne html-Feld';
      }
    } catch (e) {
      clearTimeout(to);
      erg.ms = Math.round(performance.now() - t0);
      erg.status = (e.name === 'AbortError') ? 'Timeout' : 'Fehler';
      erg.hinweis = String(e.message || e);
    }
    messungen.push(erg);
    try { sessionStorage.setItem(MESS_KEY, JSON.stringify(messungen.slice(-40))); } catch (e) {}
    zeichneMessungen();
    setStatus('fertig: ' + erg.name + ' — ' + (erg.ms / 1000).toFixed(1) + ' s, ' + erg.zeilen + ' Zeilen');
    console.log('[Tuner]', erg.name, (erg.ms / 1000).toFixed(1) + ' s,', erg.zeilen, 'Zeilen,', erg.spalten, 'Spalten,', Math.round(erg.bytes / 1024) + ' KB');
    return erg;
  }

  async function vergleich() {
    var stufen = [
      { name: 'A: wie eingestellt', aend: {} },
      { name: 'B: ohne nba_tipp', aend: { nba_tipp: '0' } },
      { name: 'C: alles kumuliert', aend: {
          cumulate_locations: '1', cumulate_teams: '1', cumulate_producttypes: '1',
          cumulate_salestypes: '1', cumulate_sales_employees: '1', cumulate_divisions: '1',
          cumulate_serviceunits: '1', cumulate_provider: '1'
        } },
      { name: 'D: ohne Detailzeilen', aend: { report_details: '0', report_take_details: '0', product_details: '0' } },
      { name: 'E: Aggregat pur (B+C+D)', aend: {
          nba_tipp: '0', report_details: '0', report_take_details: '0', product_details: '0',
          cumulate_locations: '1', cumulate_teams: '1', cumulate_producttypes: '1',
          cumulate_salestypes: '1', cumulate_sales_employees: '1', cumulate_divisions: '1',
          cumulate_serviceunits: '1', cumulate_provider: '1'
        } }
    ];
    if (!confirm('Der Vergleich fuehrt ' + stufen.length + ' echte Abfragen nacheinander aus.\n' +
      'Bei ~35 s pro Abfrage dauert das rund ' + Math.ceil(stufen.length * 38 / 60) + ' Minuten und belastet den Server.\n\nStarten?')) return;
    var basisParams = aktuelleParams();
    for (var i = 0; i < stufen.length; i++) {
      setStatus('Vergleich ' + (i + 1) + '/' + stufen.length + ': ' + stufen[i].name);
      await messen(Object.assign({}, basisParams, stufen[i].aend), stufen[i].name);
      if (i < stufen.length - 1) await new Promise(function (f) { setTimeout(f, PAUSE_MS); });
    }
    var rel = messungen.slice(-stufen.length).filter(function (m) { return typeof m.ms === 'number' && m.status === 200; });
    if (rel.length > 1) {
      var s = rel.slice().sort(function (a, b) { return a.ms - b.ms; })[0];
      var l = rel.slice().sort(function (a, b) { return b.ms - a.ms; })[0];
      console.log('%c[Tuner] Schnellste: ' + s.name + ' (' + (s.ms / 1000).toFixed(1) + ' s) gegenueber ' +
        l.name + ' (' + (l.ms / 1000).toFixed(1) + ' s) — Faktor ' + (l.ms / Math.max(1, s.ms)).toFixed(1) + '.',
        'color:#008A00;font-weight:bold');
    }
    setStatus('Vergleich fertig. "Report als HTML" speichert die Auswertung.');
  }

  // ============================================================
  //  EXPORT
  // ============================================================
  function uebernimmSpaltenWahl(header) {
    var gemerkt = speicherLade(SPALTEN_KEY, null);
    var neu = {};
    header.forEach(function (h) {
      neu[h] = (gemerkt && gemerkt[h] !== undefined) ? !!gemerkt[h] : true;
    });
    spaltenWahl = neu;
  }

  function gewaehlteSpalten() {
    if (!letzteDaten) return [];
    return letzteDaten.header.filter(function (h) { return spaltenWahl[h]; });
  }

  // Zeilenfilter aus dem Panel
  function gefilterteZeilen() {
    if (!letzteDaten) return [];
    var z = letzteDaten.zeilen;
    var h = letzteDaten.header;
    var nurBrutto = panelAn('f_brutto');
    var ohneStorno = panelAn('f_storno');
    var bruttoSp = findeSpalte(h, ['Dat: Brutto', 'Brutto']);
    var stornoSp = findeSpalte(h, ['Dat: Storno', 'Storno']);
    if (nurBrutto && bruttoSp) z = z.filter(function (r) { return !!datumKey(r[bruttoSp]); });
    if (ohneStorno && stornoSp) z = z.filter(function (r) { return !datumKey(r[stornoSp]); });
    return z;
  }

  // Aggregat statt Rohzeilen
  function aggregiere(zeilen, nachSpalte) {
    var h = letzteDaten.header;
    var bruttoSp = findeSpalte(h, ['Dat: Brutto', 'Brutto']);
    var stornoSp = findeSpalte(h, ['Dat: Storno', 'Storno']);
    var aktivSp = findeSpalte(h, ['Dat: Aktivierung', 'Aktivierung']);
    var map = {};
    zeilen.forEach(function (r) {
      var k = r[nachSpalte] || '(leer)';
      if (!map[k]) map[k] = { Anzahl: 0, Brutto: 0, Storno: 0, Aktiviert: 0 };
      map[k].Anzahl++;
      if (bruttoSp && datumKey(r[bruttoSp])) map[k].Brutto++;
      if (stornoSp && datumKey(r[stornoSp])) map[k].Storno++;
      if (aktivSp && datumKey(r[aktivSp])) map[k].Aktiviert++;
    });
    return Object.keys(map).sort().map(function (k) {
      var e = map[k], o = {};
      o[nachSpalte] = k;
      o.Anzahl = e.Anzahl; o.Brutto = e.Brutto; o.Storno = e.Storno;
      o.Netto = e.Brutto - e.Storno;             // ANNAHME: Netto = Brutto minus Storno
      o.Aktiviert = e.Aktiviert;
      return o;
    });
  }

  // Baut den Datensatz, den ein Export bekommt
  function exportDaten() {
    if (!letzteDaten) { setStatus('Erst "Einmal messen" — es liegen noch keine Daten vor.'); return null; }
    var zeilen = gefilterteZeilen();
    var aggSp = panelWert('agg_spalte');
    if (aggSp && aggSp !== '') {
      var agg = aggregiere(zeilen, aggSp);
      return { header: agg.length ? Object.keys(agg[0]) : [aggSp], zeilen: agg, aggregiert: aggSp };
    }
    var spalten = gewaehlteSpalten();
    if (!spalten.length) { setStatus('Keine Spalte ausgewaehlt.'); return null; }
    return {
      header: spalten,
      zeilen: zeilen.map(function (r) {
        var o = {};
        spalten.forEach(function (s) { o[s] = r[s]; });
        return o;
      }),
      aggregiert: null
    };
  }

  function dateiName(endung) {
    var p = (letzteDaten && letzteDaten.params) || basis;
    var zeitraum = (p.daterange === 'user_defined')
      ? (p.userdef_startdate + '_bis_' + p.userdef_enddate)
      : p.daterange;
    return 'CroCo_' + (p.report_type || 'takes') + '_' + zeitraum + '_' + zeitStempel() + '.' + endung;
  }

  // --- a) Server-Excel: derselbe Weg wie der "Excel"-Knopf des Portals ---
  function exportServer() {
    var d = exportDaten();
    if (!d) return;
    var html = '<table border="1"><thead><tr>' +
      d.header.map(function (h) { return '<th>' + escapeHtml(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      d.zeilen.map(function (r) {
        return '<tr>' + d.header.map(function (h) { return '<td>' + escapeHtml(r[h]) + '</td>'; }).join('') + '</tr>';
      }).join('') +
      '</tbody></table>';

    var mb = html.length / 1048576;
    if (mb > 2 && !confirm('Die Tabelle ist ' + mb.toFixed(1) + ' MB gross.\n' +
      'Server-Uploads dieser Groesse werden oft abgewiesen (POST-Limit).\n' +
      'Der CSV- oder XLSX-Export laeuft rein lokal und hat das Problem nicht.\n\nTrotzdem an den Server schicken?')) return;

    // Echtes Formular statt fetch: so uebernimmt der Browser den Download
    // samt Content-Disposition, genau wie beim Portal-Knopf.
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = EXCEL_URL;
    form.target = '_blank';
    form.style.display = 'none';
    var f1 = document.createElement('input');
    f1.type = 'hidden'; f1.name = 'table'; f1.value = html;
    var f2 = document.createElement('input');
    f2.type = 'hidden'; f2.name = 'filename'; f2.value = dateiName('xls');
    form.appendChild(f1); form.appendChild(f2);
    document.body.appendChild(form);
    form.submit();
    setTimeout(function () { form.remove(); }, 3000);
    setStatus('An table2excel.pl geschickt — ' + d.zeilen.length + ' Zeilen, ' + d.header.length + ' Spalten.');
  }

  // --- b) CSV lokal ---
  function exportCsv() {
    var d = exportDaten();
    if (!d) return;
    var tr = panelWert('csv_trenner') || ';';
    var zelle = function (v) {
      var s = String(v == null ? '' : v);
      return (s.indexOf(tr) !== -1 || s.indexOf('"') !== -1 || /[\r\n]/.test(s))
        ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    // BOM als Escape, NICHT als literales Zeichen — sonst geht es beim
    // Speichern/Kopieren der Datei verloren und Excel zeigt Umlaute falsch.
    var text = '\ufeff' +
      d.header.map(zelle).join(tr) + '\r\n' +
      d.zeilen.map(function (r) { return d.header.map(function (h) { return zelle(r[h]); }).join(tr); }).join('\r\n');
    dateiDownload(dateiName('csv'), text, 'text/csv');
    setStatus('CSV gespeichert — ' + d.zeilen.length + ' Zeilen, ' + d.header.length + ' Spalten.');
  }

  // --- c) XLSX lokal via SheetJS ---
  function ladeSheetJs() {
    return new Promise(function (ok, fehler) {
      if (window.XLSX) return ok(window.XLSX);
      var s = document.createElement('script');
      s.src = SHEETJS_CDN;
      s.onload = function () { window.XLSX ? ok(window.XLSX) : fehler(new Error('SheetJS geladen, aber XLSX fehlt')); };
      s.onerror = function () { fehler(new Error('SheetJS nicht erreichbar (CDN im Firmennetz blockiert?)')); };
      document.head.appendChild(s);
    });
  }

  async function exportXlsx() {
    var d = exportDaten();
    if (!d) return;
    setStatus('SheetJS wird geladen...');
    var XLSX;
    try { XLSX = await ladeSheetJs(); }
    catch (e) {
      console.warn('[Tuner]', e.message);
      setStatus(e.message + ' — weiche auf CSV aus.');
      exportCsv();
      return;
    }
    var aoa = [d.header].concat(d.zeilen.map(function (r) { return d.header.map(function (h) { return r[h]; }); }));
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    // Spaltenbreiten aus dem laengsten Inhalt (gedeckelt)
    ws['!cols'] = d.header.map(function (h, i) {
      var max = String(h).length;
      for (var z = 0; z < Math.min(d.zeilen.length, 400); z++) {
        var l = String(d.zeilen[z][h] == null ? '' : d.zeilen[z][h]).length;
        if (l > max) max = l;
      }
      return { wch: Math.min(40, Math.max(8, max + 2)) };
    });
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: Math.max(0, d.header.length - 1), r: aoa.length - 1 } }) };
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, d.aggregiert ? 'Aggregat' : 'Daten');
    // Parameterblatt: damit spaeter nachvollziehbar ist, woher die Zahlen stammen
    var p = (letzteDaten && letzteDaten.params) || basis;
    var pAoa = [['Parameter', 'Wert']].concat(Object.keys(p).map(function (k) { return [k, String(p[k])]; }));
    pAoa.push([], ['Abgerufen', new Date(letzteDaten.ts).toLocaleString('de-DE')]);
    pAoa.push(['Zeilen roh', letzteDaten.zeilen.length], ['Zeilen exportiert', d.zeilen.length]);
    var wsP = XLSX.utils.aoa_to_sheet(pAoa);
    wsP['!cols'] = [{ wch: 28 }, { wch: 46 }];
    XLSX.utils.book_append_sheet(wb, wsP, 'Abfrage');
    XLSX.writeFile(wb, dateiName('xlsx'));
    setStatus('XLSX gespeichert — ' + d.zeilen.length + ' Zeilen, ' + d.header.length + ' Spalten.');
  }

  // ============================================================
  //  Report der Messreihe als eigenstaendige HTML-Datei
  // ============================================================
  function report() {
    if (!messungen.length) { setStatus('Noch keine Messungen.'); return; }
    var gueltig = messungen.filter(function (m) { return typeof m.ms === 'number'; });
    var schnellste = gueltig.slice().sort(function (a, b) { return a.ms - b.ms; })[0];
    var langsamste = gueltig.slice().sort(function (a, b) { return b.ms - a.ms; })[0];
    var maxMs = langsamste ? langsamste.ms : 1;

    var alleKeys = {};
    messungen.forEach(function (m) { Object.keys(m.params || {}).forEach(function (k) { alleKeys[k] = 1; }); });
    var wechselnd = Object.keys(alleKeys).filter(function (k) {
      var erste = messungen[0].params[k];
      return messungen.some(function (m) { return m.params[k] !== erste; });
    });

    var zeilen = messungen.map(function (m, i) {
      var breite = Math.max(2, Math.round((m.ms / maxMs) * 100));
      var farbe = (m === schnellste) ? '#008A00' : (m === langsamste ? '#E60000' : '#0068A0');
      return '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(m.name) + '</td>' +
        '<td class="num"><strong>' + (m.ms / 1000).toFixed(1) + ' s</strong>' +
        '<div class="balken"><span style="width:' + breite + '%;background:' + farbe + '"></span></div></td>' +
        '<td class="num">' + (m.zeilen != null ? m.zeilen : '') + '</td>' +
        '<td class="num">' + (m.spalten != null ? m.spalten : '') + '</td>' +
        '<td class="num">' + (m.bytes ? Math.round(m.bytes / 1024) + ' KB' : '') + '</td>' +
        '<td>' + escapeHtml(String(m.status)) + (m.hinweis ? ' <span class="warn">' + escapeHtml(m.hinweis) + '</span>' : '') + '</td>' +
        wechselnd.map(function (k) { return '<td class="p">' + escapeHtml(String((m.params || {})[k] === undefined ? '' : m.params[k])) + '</td>'; }).join('') +
        '</tr>';
    }).join('\n');

    var fazit = '';
    if (schnellste && langsamste && schnellste !== langsamste) {
      var faktor = (langsamste.ms / Math.max(1, schnellste.ms));
      fazit = '<p class="fazit"><strong>' + escapeHtml(schnellste.name) + '</strong> war mit ' +
        (schnellste.ms / 1000).toFixed(1) + ' s am schnellsten, <strong>' + escapeHtml(langsamste.name) + '</strong> mit ' +
        (langsamste.ms / 1000).toFixed(1) + ' s am langsamsten — Faktor ' + faktor.toFixed(1) + '. ' +
        (faktor < 1.3
          ? 'Der Unterschied ist gering: die Spaltenwahl ist hier NICHT der Engpass. Wirksamer waere ein kleinerer Zeitraum oder eine Einschraenkung auf Standort/Team.'
          : 'Die Spalten- bzw. Detailwahl wirkt deutlich. Fuer den Crawler die schnellste Variante nehmen und fehlende Felder, wenn noetig, aus einer zweiten, engeren Abfrage nachladen.') +
        '</p>';
    }

    var html = '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">' +
      '<title>CroCo-Tuner Messreihe</title><style>' +
      'body{font:14px/1.5 Segoe UI,system-ui,sans-serif;margin:28px;background:#F4F4F4;color:#0D0D0D}' +
      'h1{color:#E60000;font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:26px 0 8px}' +
      '.meta{color:#666;font-size:12px;margin-bottom:20px}' +
      'table{border-collapse:collapse;background:#fff;font-size:12px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,.1)}' +
      'th,td{border:1px solid #EBEBEB;padding:6px 9px;text-align:left;vertical-align:top}' +
      'th{background:#F4F4F4;font-weight:600;white-space:nowrap}' +
      'td.num{text-align:right;white-space:nowrap}td.p{color:#333;font-family:Consolas,monospace;font-size:11px}' +
      '.balken{height:5px;background:#EBEBEB;border-radius:3px;margin-top:3px;min-width:60px}' +
      '.balken span{display:block;height:100%;border-radius:3px}' +
      '.fazit{background:#fff;border-left:3px solid #E60000;padding:12px 16px;margin:18px 0}' +
      '.warn{color:#8F5C00}.huelle{overflow-x:auto}' +
      'code{background:#EBEBEB;padding:1px 4px;border-radius:2px;font-size:11px}' +
      '@media (prefers-color-scheme:dark){body{background:#121212;color:#F5F5F5}' +
      'table,.fazit{background:#1D1D1D}th{background:#2A2A2A}th,td{border-color:#333}' +
      'td.p{color:#CCC}.balken{background:#333}.meta{color:#999}code{background:#2A2A2A}}' +
      '</style></head><body>' +
      '<h1>CroCo-Tuner — Messreihe</h1>' +
      '<div class="meta">' + escapeHtml(location.href) + '<br>' + new Date().toLocaleString('de-DE') +
      ' · ' + messungen.length + ' Messungen</div>' + fazit +
      '<h2>Messungen</h2><div class="huelle"><table><thead><tr>' +
      '<th>Nr</th><th>Konfiguration</th><th>Dauer</th><th>Zeilen</th><th>Spalten</th><th>Groesse</th><th>Status</th>' +
      wechselnd.map(function (k) { return '<th>' + escapeHtml(k) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + zeilen + '</tbody></table></div>' +
      '<h2>Konstante Parameter</h2><p>' +
      Object.keys(alleKeys).filter(function (k) { return wechselnd.indexOf(k) === -1; })
        .map(function (k) { return '<code>' + escapeHtml(k) + '=' + escapeHtml(String(messungen[0].params[k])) + '</code>'; }).join(' ') +
      '</p><h2>So liest man das</h2><ul>' +
      '<li><code>cumulate_x=0</code> weist die Dimension x als eigene Spalte aus (mehr Zeilen), <code>=1</code> fasst sie zusammen.</li>' +
      '<li><code>report_details</code> / <code>report_take_details</code> / <code>product_details</code> steuern, ob Einzelsaetze oder nur Aggregate kommen.</li>' +
      '<li>Bleibt die Dauer trotz weniger Spalten gleich, liegt der Engpass in der WHERE-Menge — dann Zeitraum, Standort oder Team einschraenken.</li>' +
      '</ul></body></html>';

    dateiDownload('croco_tuner_' + zeitStempel() + '.html', html, 'text/html');
    setStatus('Report gespeichert.');
  }

  // ============================================================
  //  Panel
  // ============================================================
  var panel, statusEl, messEl, spaltenEl, aggSelEl;

  function panelAn(feld) {
    var e = panel && panel.querySelector('[data-feld="' + feld + '"]');
    return !!(e && e.checked);
  }
  function panelWert(feld) {
    var e = panel && panel.querySelector('[data-feld="' + feld + '"]');
    return e ? e.value : null;
  }

  function aktuelleParams() {
    var p = Object.assign({}, basis);
    DETAIL_FLAGS.forEach(function (f) {
      var el = panel.querySelector('[data-detail="' + f.key + '"]');
      if (el) p[f.key] = el.checked ? '1' : '0';
    });
    CUM_FLAGS.forEach(function (f) {
      var el = panel.querySelector('[data-cum="' + f.key + '"]');
      if (el) p[f.key] = el.checked ? '0' : '1';
    });
    var g = function (n) { var e = panel.querySelector('[data-feld="' + n + '"]'); return e ? String(e.value).trim() : null; };
    var dr = g('daterange'); if (dr) p.daterange = dr;
    var von = g('von'), bis = g('bis');
    if (von) p.userdef_startdate = von;
    if (bis) p.userdef_enddate = bis;
    var loc = g('locations'); if (loc) p.locations = loc;
    var team = g('team_ids'); if (team) p.team_ids = team;
    var tg = g('timegroup'); if (tg) p.timegroup = tg;
    var rt = g('report_type'); if (rt) p.report_type = rt;
    return p;
  }

  function felderAusBasis() {
    if (!panel) return;
    DETAIL_FLAGS.forEach(function (f) {
      var el = panel.querySelector('[data-detail="' + f.key + '"]');
      if (el) el.checked = (basis[f.key] === '1');
    });
    CUM_FLAGS.forEach(function (f) {
      var el = panel.querySelector('[data-cum="' + f.key + '"]');
      if (el) el.checked = (basis[f.key] === '0');
    });
    var s = function (n, v) { var e = panel.querySelector('[data-feld="' + n + '"]'); if (e && v != null) e.value = v; };
    s('daterange', basis.daterange); s('von', basis.userdef_startdate); s('bis', basis.userdef_enddate);
    s('locations', basis.locations); s('team_ids', basis.team_ids);
    s('timegroup', basis.timegroup); s('report_type', basis.report_type);
  }

  function setStatus(t) { if (statusEl) statusEl.textContent = t; }

  function zeichneMessungen() {
    if (!messEl) return;
    if (!messungen.length) { messEl.innerHTML = '<div class="leer">Noch keine Messung.</div>'; return; }
    var maxMs = Math.max.apply(null, messungen.map(function (m) { return m.ms || 1; }));
    var schnellste = messungen.slice().filter(function (m) { return m.status === 200; }).sort(function (a, b) { return a.ms - b.ms; })[0];
    messEl.innerHTML = messungen.slice(-12).map(function (m) {
      var breite = Math.max(3, Math.round(((m.ms || 0) / maxMs) * 100));
      var farbe = (m === schnellste) ? '#4CD964' : (m.status !== 200 ? '#E60000' : '#6BB3FF');
      return '<div class="mz"><div class="mz-kopf"><span>' + escapeHtml(m.name) + '</span><b>' +
        ((m.ms || 0) / 1000).toFixed(1) + ' s</b></div>' +
        '<div class="mz-bal"><span style="width:' + breite + '%;background:' + farbe + '"></span></div>' +
        '<div class="mz-det">' + (m.zeilen || 0) + ' Zeilen · ' + (m.spalten || 0) + ' Spalten · ' +
        Math.round((m.bytes || 0) / 1024) + ' KB' +
        (m.status !== 200 ? ' · <span style="color:#FF8080">' + escapeHtml(String(m.status)) + '</span>' : '') +
        '</div></div>';
    }).reverse().join('');
  }

  function zeichneSpalten() {
    if (!spaltenEl) return;
    if (!letzteDaten || !letzteDaten.header.length) {
      spaltenEl.innerHTML = '<div class="leer">Erst "Einmal messen" — danach erscheinen hier alle Spalten.</div>';
      if (aggSelEl) aggSelEl.innerHTML = '<option value="">— keine Gruppierung (Rohzeilen) —</option>';
      return;
    }
    spaltenEl.innerHTML = letzteDaten.header.map(function (h) {
      return '<label><input type="checkbox" data-spalte="' + escapeHtml(h) + '"' +
        (spaltenWahl[h] ? ' checked' : '') + '> ' + escapeHtml(h) + '</label>';
    }).join('');
    if (aggSelEl) {
      aggSelEl.innerHTML = '<option value="">— keine Gruppierung (Rohzeilen) —</option>' +
        letzteDaten.header.map(function (h) { return '<option value="' + escapeHtml(h) + '">' + escapeHtml(h) + '</option>'; }).join('');
    }
    aktualisiereExportInfo();
  }

  function aktualisiereExportInfo() {
    var el = panel && panel.querySelector('#rcTunerExpInfo');
    if (!el) return;
    if (!letzteDaten) { el.textContent = ''; return; }
    var z = gefilterteZeilen().length;
    var s = gewaehlteSpalten().length;
    var agg = panelWert('agg_spalte');
    el.textContent = agg
      ? ('Gruppiert nach "' + agg + '" — aus ' + z + ' gefilterten Zeilen.')
      : (z + ' von ' + letzteDaten.zeilen.length + ' Zeilen · ' + s + ' von ' + letzteDaten.header.length + ' Spalten');
  }

  function bauePanel() {
    panel = document.createElement('div');
    panel.id = 'rcTunerPanel';
    panel.innerHTML =
      '<style>' +
      '#rcTunerPanel{position:fixed;right:16px;top:16px;z-index:2147483647;width:330px;max-height:94vh;overflow:auto;' +
      'background:#1D1D1D;color:#F5F5F5;border:1px solid #E60000;border-radius:6px;' +
      'font:12px/1.45 Consolas,monospace;box-shadow:0 8px 30px rgba(0,0,0,.5)}' +
      '#rcTunerPanel .kopf{background:#E60000;color:#fff;padding:7px 10px;font-weight:bold;letter-spacing:.5px;' +
      'cursor:move;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2}' +
      '#rcTunerPanel .kopf button{background:transparent;border:0;color:#fff;font-size:15px;cursor:pointer;line-height:1;padding:0 4px}' +
      '#rcTunerPanel .inhalt{padding:10px}' +
      '#rcTunerPanel h4{margin:14px 0 5px;font-size:11px;color:#FF8080;text-transform:uppercase;letter-spacing:.6px;' +
      'border-top:1px solid #2E2E2E;padding-top:9px}' +
      '#rcTunerPanel h4:first-child{margin-top:0;border-top:0;padding-top:0}' +
      '#rcTunerPanel label{display:flex;align-items:center;gap:5px;padding:2px 0;cursor:pointer}' +
      '#rcTunerPanel label span.h{color:#888;font-size:10px}' +
      '#rcTunerPanel .zeile{display:flex;gap:5px;align-items:center;margin:4px 0}' +
      '#rcTunerPanel .zeile label{flex:0 0 62px;color:#AAA;display:block}' +
      '#rcTunerPanel input[type=text],#rcTunerPanel select{flex:1;background:#2A2A2A;border:1px solid #444;color:#F5F5F5;' +
      'border-radius:3px;padding:3px 5px;font:11px Consolas,monospace;min-width:0}' +
      '#rcTunerPanel .knopf{background:#2A2A2A;border:1px solid #555;color:#F5F5F5;border-radius:3px;' +
      'padding:5px 9px;cursor:pointer;font:11px Consolas,monospace;margin:3px 3px 0 0}' +
      '#rcTunerPanel .knopf.pri{background:#E60000;border-color:#E60000;font-weight:bold}' +
      '#rcTunerPanel .knopf.gruen{background:#006B00;border-color:#008A00}' +
      '#rcTunerPanel .status{margin-top:8px;padding:5px 7px;background:#2A2A2A;border-radius:3px;color:#CCC;font-size:11px;min-height:16px}' +
      '#rcTunerPanel .mz{margin:7px 0;padding-bottom:6px;border-bottom:1px solid #2E2E2E}' +
      '#rcTunerPanel .mz-kopf{display:flex;justify-content:space-between;gap:6px}' +
      '#rcTunerPanel .mz-kopf span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#rcTunerPanel .mz-bal{height:5px;background:#333;border-radius:3px;margin:3px 0}' +
      '#rcTunerPanel .mz-bal span{display:block;height:100%;border-radius:3px}' +
      '#rcTunerPanel .mz-det{color:#999;font-size:10px}' +
      '#rcTunerPanel .leer{color:#777;padding:6px 0}' +
      '#rcTunerPanel .hinw{color:#999;font-size:10px;margin-top:4px;line-height:1.4}' +
      '#rcTunerPanel .spalten{max-height:190px;overflow:auto;background:#161616;border:1px solid #333;' +
      'border-radius:3px;padding:5px 7px;margin-top:4px}' +
      '#rcTunerPanel .info{color:#6BB3FF;font-size:10px;margin-top:5px}' +
      '</style>' +
      '<div class="kopf"><span>CROCO TUNER v' + VERSION + '</span><button data-a="zu" title="schliessen">X</button></div>' +
      '<div class="inhalt">' +

      '<h4>1. Zeitraum</h4>' +
      '<div class="zeile"><label>Bereich</label><select data-feld="daterange">' +
      ['user_defined', 'yesterday', 'current_week', 'current_month', 'current_quarter', 'last_week', 'last_month', 'last_quarter']
        .map(function (v) { return '<option value="' + v + '">' + v + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="zeile"><label>von</label><input type="text" data-feld="von" placeholder="YYYY-MM-DD"></div>' +
      '<div class="zeile"><label>bis</label><input type="text" data-feld="bis" placeholder="YYYY-MM-DD"></div>' +
      '<div class="hinw">Es gibt kein "heute" — dafuer user_defined mit von=bis=heute.</div>' +

      '<h4>2. Detailtiefe (der grosse Hebel)</h4>' +
      DETAIL_FLAGS.map(function (f) {
        return '<label><input type="checkbox" data-detail="' + f.key + '"> ' + f.label +
          ' <span class="h">' + f.hinweis + '</span></label>';
      }).join('') +

      '<h4>3. Als Spalte ausweisen</h4>' +
      CUM_FLAGS.map(function (f) {
        return '<label><input type="checkbox" data-cum="' + f.key + '"> ' + f.label + '</label>';
      }).join('') +
      '<div class="hinw">Haken an = eigene Spalte (cumulate=0) = mehr Zeilen. Haken aus = zusammengefasst.</div>' +

      '<h4>4. Einschraenkung</h4>' +
      '<div class="zeile"><label>Standorte</label><input type="text" data-feld="locations" placeholder="-1 oder Alanya,Berlin"></div>' +
      '<div class="zeile"><label>Team-IDs</label><input type="text" data-feld="team_ids" placeholder="-1"></div>' +
      '<div class="zeile"><label>Report</label><select data-feld="report_type">' +
      ['takes', 'products', 'conversion'].map(function (v) { return '<option value="' + v + '">' + v + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="zeile"><label>Zeitgrp.</label><select data-feld="timegroup">' +
      [['0', 'Kumuliert'], ['1', 'Tag'], ['2', 'Kalenderwoche'], ['3', 'Monat']]
        .map(function (v) { return '<option value="' + v[0] + '">' + v[1] + '</option>'; }).join('') +
      '</select></div>' +

      '<h4>5. Abrufen</h4>' +
      '<button class="knopf pri" data-a="messen">Einmal messen</button>' +
      '<button class="knopf" data-a="vergleich">Vergleich (5 Laeufe)</button>' +
      '<button class="knopf" data-a="url">URL zeigen</button>' +
      '<div class="hinw">Jede Messung ist eine echte Abfrage (~35 s). Nicht unnoetig oft laufen lassen.</div>' +
      '<div class="status" id="rcTunerStatus">bereit</div>' +

      '<h4>6. Excel — Spalten waehlen</h4>' +
      '<button class="knopf" data-a="alle">Alle</button>' +
      '<button class="knopf" data-a="keine">Keine</button>' +
      '<button class="knopf" data-a="kern">Nur Kernspalten</button>' +
      '<div class="spalten" id="rcTunerSpalten"><div class="leer">Erst "Einmal messen".</div></div>' +

      '<h4>7. Excel — Zeilen und Form</h4>' +
      '<label><input type="checkbox" data-feld="f_brutto"> nur Zeilen mit "Dat: Brutto"</label>' +
      '<label><input type="checkbox" data-feld="f_storno"> Stornos ausschliessen</label>' +
      '<div class="zeile"><label>Gruppe</label><select data-feld="agg_spalte" id="rcTunerAgg">' +
      '<option value="">— keine Gruppierung (Rohzeilen) —</option></select></div>' +
      '<div class="zeile"><label>CSV-Trenner</label><select data-feld="csv_trenner">' +
      '<option value=";">Semikolon (deutsches Excel)</option><option value=",">Komma</option>' +
      '<option value="\t">Tabulator</option></select></div>' +
      '<div class="info" id="rcTunerExpInfo"></div>' +

      '<h4>8. Excel holen</h4>' +
      '<button class="knopf gruen" data-a="xlsx">XLSX (lokal)</button>' +
      '<button class="knopf" data-a="csv">CSV (lokal)</button>' +
      '<button class="knopf" data-a="server">Server-Excel</button>' +
      '<div class="hinw">XLSX/CSV entstehen im Browser — schnell und ohne Serverlast. "Server-Excel" schickt die Tabelle an table2excel.pl, genau wie der Excel-Knopf des Portals; bei sehr grossen Tabellen kann der Server das ablehnen.</div>' +
      '<button class="knopf" data-a="report">Messreihe als HTML</button>' +
      '<button class="knopf" data-a="leeren">Messungen leeren</button>' +

      '<h4>Ergebnisse</h4><div id="rcTunerMess"></div>' +
      '</div>';

    document.documentElement.appendChild(panel);
    statusEl = panel.querySelector('#rcTunerStatus');
    messEl = panel.querySelector('#rcTunerMess');
    spaltenEl = panel.querySelector('#rcTunerSpalten');
    aggSelEl = panel.querySelector('#rcTunerAgg');

    panel.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-a]');
      if (!b) return;
      ev.stopPropagation();
      var a = b.getAttribute('data-a');
      if (a === 'zu') panel.remove();
      else if (a === 'messen') messen(aktuelleParams(), 'manuell ' + new Date().toLocaleTimeString('de-DE'));
      else if (a === 'vergleich') vergleich();
      else if (a === 'url') { console.log(baueUrl(aktuelleParams())); setStatus('URL in der Konsole'); }
      else if (a === 'report') report();
      else if (a === 'leeren') { messungen = []; try { sessionStorage.removeItem(MESS_KEY); } catch (e) {} zeichneMessungen(); setStatus('geleert'); }
      else if (a === 'xlsx') exportXlsx();
      else if (a === 'csv') exportCsv();
      else if (a === 'server') exportServer();
      else if (a === 'alle' || a === 'keine' || a === 'kern') {
        if (!letzteDaten) { setStatus('Erst "Einmal messen".'); return; }
        var kern = ['CCS: User', 'VOID', 'MAV: User', 'Produkt', 'Produkt Typ', 'Verkaufsart',
                    'Dat: Auftrag', 'Dat: Brutto', 'Dat: Aktivierung', 'Dat: Storno', 'Order ID'];
        letzteDaten.header.forEach(function (h) {
          if (a === 'alle') spaltenWahl[h] = true;
          else if (a === 'keine') spaltenWahl[h] = false;
          else spaltenWahl[h] = !!findeSpalte([h], kern);
        });
        speicherSetze(SPALTEN_KEY, spaltenWahl);
        zeichneSpalten();
      }
    }, true);

    panel.addEventListener('change', function (ev) {
      var sp = ev.target.getAttribute && ev.target.getAttribute('data-spalte');
      if (sp) { spaltenWahl[sp] = ev.target.checked; speicherSetze(SPALTEN_KEY, spaltenWahl); }
      aktualisiereExportInfo();
      ev.stopPropagation();
    }, true);
    ['input', 'keydown'].forEach(function (t) {
      panel.addEventListener(t, function (ev) { ev.stopPropagation(); }, true);
    });

    (function ziehbar() {
      var kopf = panel.querySelector('.kopf'), aktiv = false, dx = 0, dy = 0;
      kopf.addEventListener('mousedown', function (e) {
        if (e.target.tagName === 'BUTTON') return;
        aktiv = true;
        var r = panel.getBoundingClientRect();
        dx = e.clientX - r.left; dy = e.clientY - r.top;
        e.preventDefault();
      });
      document.addEventListener('mousemove', function (e) {
        if (!aktiv) return;
        panel.style.left = (e.clientX - dx) + 'px';
        panel.style.top = (e.clientY - dy) + 'px';
        panel.style.right = 'auto';
      });
      document.addEventListener('mouseup', function () { aktiv = false; });
    })();

    felderAusBasis();
    zeichneMessungen();
    zeichneSpalten();
  }

  bauePanel();

  window.rcTuner = {
    version: VERSION,
    messen: function (p, n) { return messen(p || aktuelleParams(), n); },
    vergleich: vergleich,
    report: report,
    params: aktuelleParams,
    daten: function () { return letzteDaten; },
    spalten: function () { return { alle: letzteDaten ? letzteDaten.header : [], gewaehlt: gewaehlteSpalten() }; },
    export: function (art) {
      if (art === 'csv') return exportCsv();
      if (art === 'server') return exportServer();
      return exportXlsx();
    },
    messungen: function () {
      console.table(messungen.map(function (m) {
        return { Name: m.name, Sekunden: (m.ms / 1000).toFixed(1), Zeilen: m.zeilen, Spalten: m.spalten, KB: Math.round((m.bytes || 0) / 1024), Status: m.status };
      }));
      return messungen;
    },
    __panel: panel
  };
  window.rcTunerMessen = window.rcTuner.messen;
  window.rcTunerVergleich = vergleich;
  window.rcTunerReport = report;
  window.rcTunerExport = window.rcTuner.export;

  console.log('%c[CroCo-Tuner & Export v' + VERSION + '] Panel oben rechts.', 'color:#E60000;font-weight:bold;font-size:13px');
  console.log('Ablauf: 1-4 einstellen, "Einmal messen" (dauert ~35 s), dann unter 6-8 die Spalten\n' +
    'waehlen und das Excel holen. "Vergleich" misst 5 Konfigurationen und zeigt,\n' +
    'ob weniger Spalten wirklich schneller sind — oder ob der Engpass woanders liegt.');
})();
