/* ============================================================================
   PORTAL-STECKBRIEF  v1
   ---------------------------------------------------------------------------
   Zweck: EINMAL in die F12-Konsole einer Portal-Seite einfuegen. Das Skript
   liest aus, was die Automatisierung wissen muss, und laedt eine Textdatei
   herunter (zusaetzlich liegt alles in window.rcSteckbrief).

   Es aendert NICHTS an der Seite: es klickt nichts, waehlt nichts aus und
   verschickt nichts. Es liest nur.

   Wo einfuegen:
     - Ligaliste   ccs.vodafone.de/.../liga_listen.rb
     - Genesys     ccs.vodafone.de/.../MONITOR_2/gm2.rb
     - ESL-Login   esl.regiocom.net (Anmeldemaske)
   Die Seite wird selbst erkannt.

   WARUM DAS GEBRAUCHT WIRD
     Der KPI-Crawler schickt Standort-NAMEN ("Alanya", "regiocom_W_Home") als
     loc_inlist mit. Ob das Portal Namen oder IDs erwartet, steht nirgends im
     Code — es steht nur in den <option value="...">. Passt es nicht, kommt eine
     leere Tabelle zurueck ("keine-tabelle"), und der Crawler faellt still auf
     die Portal-Auswahl zurueck. Genau dieses Verhalten ist in der Konsole zu
     sehen. Der Steckbrief macht die echten Werte sichtbar.

   ALLES LAEUFT IN EINER async-Huelle: kein top-level const/await, damit sich
   das Skript beliebig oft einfuegen laesst (siehe CLAUDE.md, Befund 29.07.).
============================================================================ */
(async function () {
  'use strict';

  var Z = [];                                  // Zeilen des Steckbriefs
  function schreib(s) { Z.push(s == null ? '' : String(s)); }
  function titel(s) { schreib(''); schreib('=== ' + s + ' ==='); }
  function kurz(s, max) { s = String(s == null ? '' : s); max = max || 120; return s.length > max ? s.slice(0, max) + '…' : s; }
  function txt(el) { return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim(); }

  // Wert UND Beschriftung jeder Option — genau hier entscheidet sich, ob der
  // Crawler Namen oder IDs schicken muss.
  function optionen(sel, maxAnzahl) {
    if (!sel) return ['  (nicht gefunden)'];
    var raus = [], liste = Array.prototype.slice.call(sel.options || []);
    var n = Math.min(liste.length, maxAnzahl || 200);
    for (var i = 0; i < n; i++) {
      var o = liste[i];
      raus.push('  ' + (o.selected ? '[x] ' : '[ ] ') +
        'value=' + JSON.stringify(o.value) + '   text=' + JSON.stringify(txt(o)));
    }
    if (liste.length > n) raus.push('  … ' + (liste.length - n) + ' weitere');
    return raus;
  }

  // Ein Auswahlfeld ueber mehrere Wege suchen: erst per Name (so heisst es im
  // Request), dann per Id, zuletzt ueber die Ueberschrift daneben.
  function findeSelect(namen, ids, ueberschrift) {
    var el = null, weg = '';
    (namen || []).forEach(function (n) {
      if (el) return;
      el = document.querySelector('select[name="' + n + '"], select[name="' + n + '[]"]');
      if (el) weg = 'name="' + n + '"';
    });
    (ids || []).forEach(function (i) {
      if (el) return;
      el = document.getElementById(i);
      if (el && el.tagName !== 'SELECT') el = el.querySelector ? el.querySelector('select') : null;
      if (el) weg = 'id="' + i + '"';
    });
    if (!el && ueberschrift) {
      // Ueber die sichtbare Ueberschrift: das naechste <select> danach.
      var alle = document.querySelectorAll('h1,h2,h3,h4,label,legend,div,span,td,th');
      for (var k = 0; k < alle.length && !el; k++) {
        if (txt(alle[k]).toLowerCase() !== ueberschrift.toLowerCase()) continue;
        var s = alle[k].parentElement ? alle[k].parentElement.querySelector('select') : null;
        if (!s && alle[k].nextElementSibling) {
          s = alle[k].nextElementSibling.tagName === 'SELECT'
            ? alle[k].nextElementSibling
            : alle[k].nextElementSibling.querySelector && alle[k].nextElementSibling.querySelector('select');
        }
        if (s) { el = s; weg = 'ueber die Ueberschrift "' + ueberschrift + '"'; }
      }
    }
    return { el: el, weg: weg };
  }

  function feld(bezeichnung, treffer, maxOpt) {
    titel(bezeichnung);
    if (!treffer.el) { schreib('  NICHT GEFUNDEN'); return; }
    schreib('  gefunden ueber: ' + treffer.weg);
    schreib('  id=' + JSON.stringify(treffer.el.id || '') +
      '  name=' + JSON.stringify(treffer.el.getAttribute('name') || '') +
      '  mehrfachauswahl=' + (treffer.el.multiple ? 'ja' : 'nein') +
      '  optionen=' + (treffer.el.options ? treffer.el.options.length : 0));
    optionen(treffer.el, maxOpt).forEach(schreib);
  }

  // --------------------------------------------------------------------
  //  Allgemeines
  // --------------------------------------------------------------------
  var P = location.pathname + location.search;
  schreib('PORTAL-STECKBRIEF  ' + new Date().toLocaleString('de-DE'));
  schreib('Adresse:      ' + location.href);
  schreib('Seitentitel:  ' + document.title);
  schreib('Fenstername:  ' + JSON.stringify(window.name || ''));
  schreib('opener da:    ' + (function () { try { return !!window.opener; } catch (e) { return 'nicht lesbar'; } })());
  schreib('Autopilot:    ' + (window.__rcAutoPilotV2 ? 'laeuft' : 'laeuft NICHT'));
  schreib('KPI-Crawler:  ' + (window.kpiCrawlerInterval ? 'laeuft' : 'laeuft nicht'));
  schreib('GM-Crawler:   ' + (window.RC_GM ? 'laeuft' : 'laeuft nicht'));
  schreib('Speicher:     ' + (function () {
    try {
      var w = [];
      ['rcWcaCrawlerSrc', 'rcGmCrawlerSrc', 'rcCrocoCrawlerSrc', 'rcGmKatalog', 'rcGmAuswahl',
       'rcLigaMonatsHarvest', 'rcLigaWochenHarvest', 'rcCrawlerAlleStd'].forEach(function (k) {
        var v = localStorage.getItem(k);
        w.push('    ' + k + ' = ' + (v == null ? '(fehlt)' : (v.length > 60 ? v.length + ' Zeichen' : v)));
      });
      return '\n' + w.join('\n');
    } catch (e) { return '(nicht lesbar)'; }
  })());

  // --------------------------------------------------------------------
  //  LIGALISTE
  // --------------------------------------------------------------------
  if (P.indexOf('liga_listen') !== -1 || document.getElementById('daterange-list')) {
    titel('SEITE ERKANNT: LIGALISTE');

    feld('Standort-Auswahl  (das ist der wichtigste Punkt)',
      findeSelect(['loc_inlist', 'loc_inlist[]'], ['loc-list', 'location-list', 'standort-list'], 'Standort'), 60);
    feld('Dienstleister-Auswahl',
      findeSelect(['provider_inlist', 'provider', 'dl_inlist'], ['provider-list', 'dienstleister-list'], 'Dienstleister'), 30);
    feld('Team-Auswahl',
      findeSelect(['team_inlist', 'team'], ['team-list'], 'Team'), 15);
    feld('Zeitraum', findeSelect(['daterange'], ['daterange-list'], 'Zeitraum'), 30);
    feld('Intervall', findeSelect(['interval'], ['interval-list'], 'Intervall'), 30);

    titel('Alle <select> der Seite (zur Sicherheit, falls oben etwas fehlt)');
    Array.prototype.forEach.call(document.querySelectorAll('select'), function (s, i) {
      schreib('  [' + i + '] id=' + JSON.stringify(s.id || '') +
        ' name=' + JSON.stringify(s.getAttribute('name') || '') +
        ' mehrfach=' + (s.multiple ? 'ja' : 'nein') +
        ' optionen=' + s.options.length +
        ' erste=' + JSON.stringify(s.options[0] ? s.options[0].value : ''));
    });

    titel('Ok-Knopf');
    (function () {
      var kandidaten = document.querySelectorAll('button, input[type=submit], input[type=button], a.button');
      var gefunden = 0;
      Array.prototype.forEach.call(kandidaten, function (b) {
        var t = (txt(b) || b.value || '').toLowerCase();
        if (t.indexOf('ok') === -1 && t.indexOf('anzeig') === -1) return;
        gefunden++;
        schreib('  <' + b.tagName.toLowerCase() + '> id=' + JSON.stringify(b.id || '') +
          ' text=' + JSON.stringify(txt(b) || b.value || ''));
      });
      if (!gefunden) schreib('  (kein Knopf mit "Ok" gefunden)');
    })();

    titel('Mitgeschnittene Original-Anfrage (get_data.rb)');
    (function () {
      var cap = window.__rcLastGetData;
      if (!cap || !cap.body) {
        schreib('  KEINE mitgeschnitten. (Der Crawler braucht sie. Einmal "Ok" auf der Seite');
        schreib('   klicken und den Steckbrief danach erneut einfuegen.)');
        return;
      }
      schreib('  Adresse: ' + cap.url);
      var p = new URLSearchParams(cap.body);
      // Der Token gehoert NICHT in eine Datei, die weitergegeben wird.
      var geheim = /token|secure|session|pass|cookie|auth/i;
      var keys = [];
      p.forEach(function (v, k) { if (keys.indexOf(k) === -1) keys.push(k); });
      keys.forEach(function (k) {
        var werte = p.getAll(k);
        if (geheim.test(k)) { schreib('  ' + k + ' = (' + werte.length + ' Wert(e), unterdrueckt)'); return; }
        schreib('  ' + k + ' = ' + kurz(werte.length > 1 ? JSON.stringify(werte) : werte[0], 300));
      });
      schreib('');
      schreib('  >> ENTSCHEIDEND: stimmen die loc_inlist-Werte oben mit den');
      schreib('     <option value="..."> der Standort-Auswahl ueberein?');
    })();

    titel('Aktuell angezeigte Tabelle');
    (function () {
      var t = document.querySelector('table#result-table') || document.querySelector('table');
      if (!t) { schreib('  keine Tabelle im DOM'); return; }
      schreib('  id=' + JSON.stringify(t.id || '') + '  Zeilen=' + t.rows.length);
      for (var r = 0; r < Math.min(3, t.rows.length); r++) {
        var zellen = Array.prototype.map.call(t.rows[r].cells, function (c) { return txt(c); });
        schreib('  Zeile ' + r + ': ' + kurz(zellen.join(' | '), 400));
      }
      // Genau die Frage des Nutzers: "mal sind keine Agentennamen zu sehen"
      var kopf = -1;
      for (var k = 0; k < Math.min(6, t.rows.length); k++) {
        var s = Array.prototype.map.call(t.rows[k].cells, function (c) { return txt(c).toLowerCase(); }).join('|');
        if (s.indexOf('agentenname') !== -1) { kopf = k; break; }
      }
      schreib('  Kopfzeile mit "Agentenname": ' + (kopf === -1 ? 'NICHT VORHANDEN (dann fehlt die Agenten-Ebene!)' : 'Zeile ' + kopf));
    })();
  }

  // --------------------------------------------------------------------
  //  GENESYS-MONITOR
  // --------------------------------------------------------------------
  if (P.indexOf('gm2.rb') !== -1 || P.indexOf('MONITOR_2') !== -1 || document.getElementById('quality-list')) {
    titel('SEITE ERKANNT: GENESYS-MONITOR');

    schreib('Der Crawler waehlt bisher NUR Qualitaeten aus und klickt "Ok".');
    schreib('Den Dienstleister fasst er nicht an — deshalb hier beides im Detail.');

    feld('Dienstleister-Auswahl  (fehlt dem Crawler bisher)',
      findeSelect(['provider', 'provider_inlist', 'dl'], ['provider-list', 'dienstleister-list', 'provider_list'], 'Dienstleister'), 30);
    feld('Qualitaeten-Auswahl',
      findeSelect(['quality', 'quality_inlist', 'filter'], ['quality-list'], 'Qualitäten'), 100);

    titel('Alle <select> der Seite');
    Array.prototype.forEach.call(document.querySelectorAll('select'), function (s, i) {
      var gewaehlt = Array.prototype.filter.call(s.options, function (o) { return o.selected; })
        .map(function (o) { return o.value; });
      schreib('  [' + i + '] id=' + JSON.stringify(s.id || '') +
        ' name=' + JSON.stringify(s.getAttribute('name') || '') +
        ' mehrfach=' + (s.multiple ? 'ja' : 'nein') +
        ' optionen=' + s.options.length +
        ' AKTUELL GEWAEHLT=' + JSON.stringify(gewaehlt));
    });

    titel('Ok-Knopf und Einstellungen');
    schreib('  #ok-button: ' + (document.getElementById('ok-button') ? 'vorhanden' : 'FEHLT'));
    Array.prototype.forEach.call(document.querySelectorAll('input[type=radio], input[type=checkbox]'), function (i) {
      schreib('  <input ' + i.type + '> id=' + JSON.stringify(i.id || '') +
        ' name=' + JSON.stringify(i.name || '') +
        ' value=' + JSON.stringify(i.value || '') +
        ' gesetzt=' + (i.checked ? 'ja' : 'nein'));
    });

    titel('Gelernter Katalog des Crawlers');
    (function () {
      var k = null;
      try { k = JSON.parse(localStorage.getItem('rcGmKatalog') || '{}'); } catch (e) {}
      var n = k ? Object.keys(k).length : 0;
      schreib('  Eintraege: ' + n + (n ? '' : '   <-- LEER: ohne Katalog fragt der Crawler nichts ab'));
      if (n) {
        Object.keys(k).slice(0, 8).forEach(function (s) {
          schreib('    ' + s + '  =  ' + (k[s] && k[s].name) + '   provider=' + (k[s] && k[s].provider));
        });
      }
      schreib('  Provider im laufenden Crawler: ' +
        (window.RC_GM ? JSON.stringify(window.RC_GM.provider) : '(Crawler laeuft nicht)') +
        '   <-- muss zum Dienstleister der Seite passen (Vorgabewert im Code ist "SNT")');
    })();

    // Live-Probe: laeuft ueberhaupt ein get_data.rb-Request, wenn die Seite
    // arbeitet? Dafuer wird 20 s lang mitgehoert - ohne selbst etwas auszuloesen.
    titel('Mithoeren: kommt ein get_data.rb-Request?');
    schreib('  Ich hoere jetzt 20 Sekunden mit.');
    schreib('  BITTE JETZT: Dienstleister "regiocom" anklicken, eine Qualitaet');
    schreib('  anklicken und "Ok" druecken. Danach laedt die Datei automatisch.');
    await (function () {
      return new Promise(function (fertig) {
        var gesehen = [];
        var of = window.fetch, oo = XMLHttpRequest.prototype.open;
        function merke(u) {
          try {
            var s = String(u);
            if (s.indexOf('get_data') === -1 && s.indexOf('values.json') === -1) return;
            gesehen.push(s);
          } catch (e) {}
        }
        if (of) window.fetch = function (i) { merke(typeof i === 'string' ? i : (i && i.url) || ''); return of.apply(this, arguments); };
        XMLHttpRequest.prototype.open = function (m, u) { merke(u); return oo.apply(this, arguments); };
        setTimeout(function () {
          if (of) window.fetch = of;
          XMLHttpRequest.prototype.open = oo;
          if (!gesehen.length) {
            schreib('  ERGEBNIS: KEIN Request beobachtet.');
            schreib('  Das heisst: der Ok-Klick loest nichts aus (z.B. weil kein');
            schreib('  Dienstleister gewaehlt ist) — und genau deshalb kann der');
            schreib('  Crawler seinen Katalog nicht lernen.');
          } else {
            schreib('  ERGEBNIS: ' + gesehen.length + ' Request(s):');
            gesehen.slice(0, 6).forEach(function (u) {
              schreib('    ' + kurz(u, 500));
              try {
                var url = new URL(u, location.href);
                url.searchParams.getAll('filter').forEach(function (f) { schreib('      filter = ' + f); });
                var pv = url.searchParams.get('provider');
                if (pv) schreib('      provider = ' + JSON.stringify(pv) + '   <-- diesen Wert braucht der Crawler');
              } catch (e) {}
            });
          }
          fertig();
        }, 20000);
      });
    })();
  }

  // --------------------------------------------------------------------
  //  ESL-ANMELDUNG
  // --------------------------------------------------------------------
  if (location.hostname === 'esl.regiocom.net') {
    titel('SEITE ERKANNT: ESL');
    var pw = document.getElementById('loginform:pw');
    var us = document.getElementById('loginform:user');
    var bt = document.getElementById('loginform:btnLogin');
    schreib('  Anmeldemaske: ' + (pw ? 'ja' : 'nein'));
    if (pw) {
      schreib('  Benutzerfeld lesbar: ' + (us ? (us.value || '').length : '-') + ' Zeichen');
      schreib('  Passwortfeld lesbar: ' + (pw.value || '').length + ' Zeichen');
      schreib('   (0 Zeichen bei sichtbar gefuelltem Feld = Edge haelt den Wert');
      schreib('    zurueck, bis eine echte Maus-/Tastengeste kommt.)');
      schreib('  Anmelde-Knopf: ' + (bt ? 'gefunden' : 'FEHLT'));
    }
    schreib('  Export-Ansicht (filterForm): ' + (document.getElementById('filterForm') ? 'ja' : 'nein'));
    schreib('  Dashboard laeuft: ' + (window.rcLiveInterval ? 'ja' : 'nein'));
  }

  // --------------------------------------------------------------------
  //  Ausgabe
  // --------------------------------------------------------------------
  var text = Z.join('\n');
  window.rcSteckbrief = text;
  console.log('%c[Steckbrief] fertig — ' + Z.length + ' Zeilen. Auch in window.rcSteckbrief.',
    'color:#E60000;font-weight:bold');
  console.log(text);

  try {
    var name = 'Steckbrief_' +
      (location.pathname.indexOf('gm2') !== -1 ? 'GenesysMonitor'
        : location.pathname.indexOf('liga') !== -1 ? 'Ligaliste'
          : location.hostname.split('.')[0]) +
      '_' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.txt';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 4000);
    console.log('[Steckbrief] Datei "' + name + '" liegt im Download-Ordner.');
  } catch (e) {
    console.warn('[Steckbrief] Herunterladen ging nicht (' + e.message + ') — Text oben aus der Konsole kopieren.');
  }
})();
