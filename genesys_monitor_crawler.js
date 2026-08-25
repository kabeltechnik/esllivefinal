(function () {
  // ============================================================
  //  Warteschleifen-Crawler (Genesys-Monitor-Crawler) v1.1
  //  ccs.vodafone.de/GENESYS/MONITOR_2
  //  ------------------------------------------------------------
  //  Hinweis: Die Zeichenfolge "Warteschleifen-Crawler" oben MUSS stehen
  //  bleiben — ESL_Start.cmd prueft sie als Marker, um zu erkennen, dass
  //  unter diesem Dateinamen wirklich dieser Crawler liegt.
  //
  //  In die Konsole (F12) der Seite gm2.rb einfuegen.
  //
  //  Die Seite baut ihre Zahlen aus DREI Quellen zusammen — deshalb
  //  reicht ein einzelner Request NICHT:
  //
  //   1. get_data.rb (GET)  liefert Forecast (FC/FC-P je 30-Min-Bucket)
  //      und ein HTML-Geruest. Im HTML stehen nur STAT-IDS, keine Werte:
  //        <td title='72080'><div id='v72080'>   -> WA
  //        <td title='72081'><div class='time'>  -> WZ (Sekunden)
  //        <td class='eq-col' data-answered-id data-abandoned-id
  //                           data-short-abandoned-id>   -> EQ
  //        <td class='quot-col' data-numerator-id data-denominator-id> -> SL
  //        <div class='provider-quality' data-reference-id='49782'>    -> IST
  //
  //   2. values.json (GET)  liefert ALLE Ist-Werte auf einmal als
  //      flaches Objekt {"72080":1,"72081":213,...}. EIN Request
  //      genuegt fuer beliebig viele Qualitaeten.
  //
  //   3. wss://.../ws-statserverstreamer/  schiebt Aenderungen live
  //      nach ("72081:5" bzw. "72092:2|72093:8"). Optional.
  //
  //  Authentifizierung: NUR das CCS_User-Cookie. Es geht bei
  //  credentials:"include" automatisch mit — niemals hart eintragen.
  //
  //  Konsole:
  //    rcGmLauf()         einmal alles holen und senden
  //    rcGmStatus()       Katalog, letzter Stand, Takt
  //    rcGmTabelle()      aktuelle Werte als Tabelle
  //    rcGmLerneAlle()    alle Qualitaeten einmal durchklicken (Katalog)
  //    rcGmLive(true)     WebSocket-Push statt Polling
  //    rcGmHistorie()     gespeicherte 30-Minuten-Snapshots
  //    rcGmStop()
  // ============================================================
  'use strict';

  var VERSION = '1.0';
  // Endpunkte ueberschreibbar — erlaubt Offline-Test mit Fixtures
  // (window.RC_GM_BASIS / RC_GM_WERTE vor dem Einfuegen setzen).
  var BASIS = window.RC_GM_BASIS || '/cgi-bin/GENESYS/MONITOR_2/get_data.rb';
  var WERTE_URL = window.RC_GM_WERTE || '/cgi-bin/STATSERVER_STREAMER/DATA/values.json';
  var WS_URL = window.RC_GM_WS || ('wss://' + location.host + '/ws-statserverstreamer/');
  var KANAL = 'regiocom_genesys_monitor';
  var TAKT_WERTE = 20000;    // values.json — Ist-Werte
  var TAKT_STRUKTUR = 300000; // get_data.rb — Forecast/Struktur aendert sich selten
  var KATALOG_KEY = 'rcGmKatalog';
  var HIST_KEY = 'rcGmHistorie';
  var HIST_TAGE = 14;

  // Alten Lauf sauber beenden (Re-Inject)
  if (window.RC_GM && window.RC_GM.stop) { try { window.RC_GM.stop(); } catch (e) {} }

  // ============================================================
  //  Hilfen
  // ============================================================
  function pad2(n) { return String(n).padStart(2, '0'); }
  function tagKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  // 30-Minuten-Bucket im Format des Portals: YYYYMMDDHHMM (MM = 00 oder 30)
  function bucketKey(d) {
    d = d || new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      pad2(d.getHours()) + (d.getMinutes() < 30 ? '00' : '30');
  }
  function sekToZeit(s) {
    s = parseInt(s, 10);
    if (!isFinite(s) || s < 0) return '';
    var m = Math.floor(s / 60), r = s % 60;
    return m + ':' + pad2(r);
  }
  function zahl(v) { var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; }
  function txt(el) { return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim(); }
  function jetzt() { return Date.now(); }

  function lade(key, fallback) {
    try { var s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; }
  }
  function speichere(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { console.warn('[GM] Speichern fehlgeschlagen:', e.message); }
  }

  // ============================================================
  //  Zustand
  // ============================================================
  var RC_GM = {
    version: VERSION,
    provider: 'SNT',
    katalog: lade(KATALOG_KEY, {}),   // kategorieKey -> {name, nodeId, statIds, filter, providerKey}
    struktur: null,                   // zuletzt geparste Qualitaets-Definitionen
    forecast: {}, forecastOffered: {}, fc105: {},
    werte: {},                        // statId -> Wert
    letzterStand: [],
    letzteStruktur: 0,
    ws: null, wsAktiv: false,
    timerWerte: null, timerStruktur: null,
    stop: null
  };

  // ============================================================
  //  1. Original-Request der Seite mitschneiden -> Katalog lernen
  //     Damit kennt der Crawler die filter-Strings (Kategorie, node_id,
  //     Stat-IDs) auch fuer Qualitaeten, die er nie selbst geoeffnet hat.
  // ============================================================
  function katalogAusFilter(filterStr, provider) {
    // Format: CCS_Category_KA_TEC_TV|C VOICE TECH VKD STANDARD|13359|72080,72081,...|1
    var t = String(filterStr || '').split('|');
    if (t.length < 4) return null;
    var eintrag = {
      kategorie: t[0], name: t[1], nodeId: t[2],
      statIds: t[3].split(',').filter(Boolean),
      rest: t.slice(4).join('|'),
      filter: filterStr,
      provider: provider || RC_GM.provider,
      gelernt: jetzt()
    };
    RC_GM.katalog[eintrag.kategorie] = eintrag;
    speichere(KATALOG_KEY, RC_GM.katalog);
    return eintrag;
  }

  var letzterMitschnitt = 0;
  // Dateiname des Struktur-Endpunkts — nicht hart "get_data.rb", sonst
  // greift der Hook nicht mehr, sobald RC_GM_BASIS umgebogen wurde.
  var ZIEL_DATEI = (String(BASIS).split('?')[0].split('/').pop()) || 'get_data.rb';
  function verarbeiteUrl(u) {
    try {
      if (String(u).indexOf(ZIEL_DATEI) === -1) return;
      var url = new URL(u, location.href);
      if (url.searchParams.get('type') !== 'get_monitor_data') return;
      var prov = url.searchParams.get('provider');
      if (prov) RC_GM.provider = prov;
      url.searchParams.getAll('filter').forEach(function (f) { katalogAusFilter(f, prov); });
      letzterMitschnitt = jetzt();
    } catch (e) {}
  }

  (function hook() {
    if (window.__rcGmHooked) return;
    window.__rcGmHooked = true;
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
  //  2. get_data.rb — Struktur + Forecast
  // ============================================================
  function baueUrl(filterListe) {
    var u = new URL(BASIS, location.origin);
    u.searchParams.set('type', 'get_monitor_data');
    u.searchParams.set('provider', RC_GM.provider);
    filterListe.forEach(function (f) { u.searchParams.append('filter', f); });
    u.searchParams.set('show_queuestatus', '1');
    u.searchParams.set('_', String(jetzt()));
    return u.href;
  }

  async function holeStruktur(filterListe) {
    filterListe = filterListe || aktiveFilter();
    if (!filterListe.length) {
      console.warn('[GM] Kein filter bekannt. Einmal im Portal eine Qualitaet waehlen und "Ok" klicken, oder rcGmLerneAlle() ausfuehren.');
      return null;
    }
    var res = await fetch(baueUrl(filterListe), {
      method: 'GET', credentials: 'include',
      headers: { 'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (!res.ok) { console.warn('[GM] get_data.rb HTTP', res.status); return null; }
    var json = await res.json();
    if (!json || json.success !== true) console.warn('[GM] get_data.rb meldet success != true');
    RC_GM.forecast = json.forecast || {};
    RC_GM.forecastOffered = json.forecast_offered || {};
    RC_GM.fc105 = json.fc_105 || {};
    RC_GM.struktur = parseStruktur(json.html || '');
    RC_GM.letzteStruktur = jetzt();
    return RC_GM.struktur;
  }

  // Aus dem HTML-Geruest die Stat-ID-Zuordnung je Qualitaet ziehen.
  function parseStruktur(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var zeilen = [];

    doc.querySelectorAll('tr.qs-row').forEach(function (tr) {
      var name = txt(tr.querySelector('.qs-quality'));
      var q = { name: name, wa: null, wz: null, eq15: null, eqTag: null, sl15: null, slTag: null };
      var eqGesehen = 0, quotGesehen = 0;

      Array.prototype.forEach.call(tr.querySelectorAll('td'), function (td) {
        if (td.classList.contains('eq-col')) {
          var eq = {
            answered: td.getAttribute('data-answered-id'),
            abandoned: td.getAttribute('data-abandoned-id'),
            shortAbandoned: td.getAttribute('data-short-abandoned-id') || null
          };
          if (eqGesehen === 0) q.eq15 = eq; else q.eqTag = eq;
          eqGesehen++;
          return;
        }
        if (td.classList.contains('quot-col')) {
          var qt = {
            zaehler: td.getAttribute('data-numerator-id'),
            nenner: td.getAttribute('data-denominator-id')
          };
          if (quotGesehen === 0) q.sl15 = qt; else q.slTag = qt;
          quotGesehen++;
          return;
        }
        // einfache Wertzellen: die ID steht im title, die Formatierung
        // verraet, ob es eine Zeitspanne ist (class 'time' -> WZ)
        var id = td.getAttribute('title');
        if (!id || !/^\d+$/.test(id)) return;
        var istZeit = !!td.querySelector('.time');
        if (istZeit) q.wz = id;
        else if (q.wa === null) q.wa = id;
      });
      zeilen.push(q);
    });

    // Provider-Boxen: IST-Wert-ID, node_id, serverseitig gerechnete Abweichung
    doc.querySelectorAll('.provider-quality').forEach(function (pq) {
      var prefix = pq.getAttribute('data-id-prefix') || pq.id;   // "SNT-13359"
      var refId = pq.getAttribute('data-reference-id');          // IST-Stat-ID
      var titelEl = pq.querySelector('.quality-box-title');
      var name = '';
      if (titelEl) {
        // den fc-105-Span abziehen, sonst klebt er am Namen
        var klon = titelEl.cloneNode(true);
        Array.prototype.forEach.call(klon.querySelectorAll('span'), function (s) { s.remove(); });
        name = txt(klon);
      }
      var ziel = zeilen.filter(function (z) { return z.name === name; })[0];
      if (!ziel) { ziel = { name: name }; zeilen.push(ziel); }
      ziel.providerKey = prefix;
      ziel.nodeId = (prefix.split('-')[1]) || null;
      ziel.istId = refId;
      var dr = doc.getElementById(prefix + '-diff-rel');
      var da = doc.getElementById(prefix + '-diff-abs');
      ziel.diffRelText = dr ? txt(dr) : '';
      ziel.diffAbsText = da ? txt(da) : '';
    });

    return zeilen;
  }

  // ============================================================
  //  3. values.json — alle Ist-Werte in einem Request
  // ============================================================
  async function holeWerte() {
    var u = new URL(WERTE_URL, location.origin);
    u.searchParams.set('_', String(jetzt()));
    var res = await fetch(u.href, {
      method: 'GET', credentials: 'include',
      headers: { 'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (!res.ok) { console.warn('[GM] values.json HTTP', res.status); return RC_GM.werte; }
    var json = await res.json();
    // Schluessel koennen mit oder ohne "v"-Praefix kommen — beides normalisieren
    var flach = {};
    Object.keys(json || {}).forEach(function (k) {
      flach[String(k).replace(/^v/, '')] = json[k];
    });
    RC_GM.werte = flach;
    return flach;
  }

  function wert(id) {
    if (id == null) return null;
    var v = RC_GM.werte[String(id).replace(/^v/, '')];
    return (v === undefined || v === '') ? null : zahl(v);
  }

  // ============================================================
  //  4. Zusammenrechnen — genau wie die Seite es im Browser tut
  // ============================================================
  function rechneEq(def) {
    if (!def) return null;
    var ans = wert(def.answered), ab = wert(def.abandoned), kurz = wert(def.shortAbandoned);
    if (ans == null) return null;
    // Kurzabbrecher zaehlen nicht als Abbruch (deshalb abgezogen)
    var nenner = (ans || 0) + (ab || 0) - (kurz || 0);
    if (!nenner) return null;
    return Math.round((ans / nenner) * 1000) / 10;
  }
  function rechneQuote(def) {
    if (!def) return null;
    var z = wert(def.zaehler), n = wert(def.nenner);
    if (z == null || !n) return null;
    return Math.round((z / n) * 1000) / 10;
  }

  function fcFuer(providerKey, bucket) {
    var f = RC_GM.forecast[providerKey];
    return (f && f[bucket]) ? f[bucket] : null;
  }

  function baueStand() {
    if (!RC_GM.struktur) return [];
    var b = bucketKey();
    return RC_GM.struktur.map(function (q) {
      var fc = fcFuer(q.providerKey, b) || {};
      var wzSek = wert(q.wz);
      var offered = (RC_GM.forecastOffered[q.nodeId] || {})[b];
      return {
        name: q.name,
        nodeId: q.nodeId,
        providerKey: q.providerKey,
        bucket: b,
        wa: wert(q.wa),                  // wartende Anrufe
        wzSek: wzSek,                    // Wartezeit in Sekunden
        wz: sekToZeit(wzSek),            // "3:33"
        eq15: rechneEq(q.eq15),
        eqTag: rechneEq(q.eqTag),
        sl15: rechneQuote(q.sl15),
        slTag: rechneQuote(q.slTag),
        ist: wert(q.istId),
        fc: (fc.fc != null) ? fc.fc : null,
        fcp: (fc.fcp != null) ? fc.fcp : null,
        forecastOffered: (offered != null) ? offered : null,
        diffRel: q.diffRelText || '',    // vom Server geliefert, nicht selbst gerechnet
        diffAbs: q.diffAbsText || '',
        fcUeberschreitungErlaubt: !((RC_GM.fc105[q.nodeId] || {})[b] === true),
        ts: jetzt()
      };
    });
  }

  // ============================================================
  //  5. Historie — je 30-Minuten-Bucket der letzte Stand
  // ============================================================
  function archiviere(stand) {
    var hist = lade(HIST_KEY, {});
    var tag = tagKey(new Date());
    hist[tag] = hist[tag] || {};
    stand.forEach(function (s) {
      hist[tag][s.bucket] = hist[tag][s.bucket] || {};
      hist[tag][s.bucket][s.nodeId || s.name] = {
        wa: s.wa, wzSek: s.wzSek, eq15: s.eq15, eqTag: s.eqTag,
        sl15: s.sl15, slTag: s.slTag, ist: s.ist, fc: s.fc, fcp: s.fcp
      };
    });
    var tage = Object.keys(hist).sort();
    while (tage.length > HIST_TAGE) { delete hist[tage.shift()]; }
    speichere(HIST_KEY, hist);
  }

  // ============================================================
  //  6. Weitergabe
  // ============================================================
  // Das Dashboard laeuft auf esl.regiocom.net, dieser Monitor auf ccs.vodafone.de.
  // BroadcastChannel wirkt NUR innerhalb eines Origins — cross-origin bleibt allein
  // postMessage an ein bekanntes Fenster. Deshalb drei Wege, wie beim KPI-Crawler:
  //   1. BroadcastChannel  (falls Dashboard zufaellig gleicher Origin)
  //   2. window.opener     (gesetzt, wenn das Dashboard diesen Tab geoeffnet hat)
  //   3. window.rcDashWin  (manuell gesetzter Fenster-Verweis)
  // Wird die Seite von Hand aufgerufen, ist opener NULL und es gibt keinen Rueckweg
  // — dann muss das laut gesagt werden, statt still ins Leere zu senden.
  function sende(stand) {
    // Den ganzen KATALOG mitschicken, nicht nur die gerade abgefragten Zeilen:
    // sonst kennt das Dashboard immer nur die eine Standard-Qualitaet und man
    // koennte dort gar nichts anderes auswaehlen.
    var katalog = {};
    try { Object.keys(RC_GM.katalog).forEach(function (k) { katalog[k] = RC_GM.katalog[k].name || k; }); } catch (e) {}
    var nutzlast = { typ: 'gm_daten', quelle: 'genesys_monitor', ts: jetzt(), provider: RC_GM.provider, daten: stand,
                     katalog: katalog, auswahl: auswahlLesen(),
                     // Projekt-Kennung (05.08.): das Dashboard verwirft fremde
                     // Pakete — sonst spraenge die Warteschleifen-Anzeige bei
                     // drei Monitoren zwischen den Qualitaets-Saetzen hin und her.
                     projekt: projektAusName() };
    var ziele = [];
    try { new BroadcastChannel(KANAL).postMessage(nutzlast); ziele.push('BroadcastChannel'); } catch (e) {}
    try { if (window.opener && !window.opener.closed) { window.opener.postMessage(nutzlast, '*'); ziele.push('opener'); } } catch (e) {}
    try { if (window.rcDashWin && !window.rcDashWin.closed) { window.rcDashWin.postMessage(nutzlast, '*'); ziele.push('rcDashWin'); } } catch (e) {}
    RC_GM.letzteZiele = ziele;
    // BroadcastChannel zaehlt NICHT als Nachweis: postMessage darauf gelingt immer,
    // auch wenn niemand zuhoert — und ueber Domaingrenzen hinweg hoert hier nie
    // jemand zu (Dashboard: esl.regiocom.net, Monitor: ccs.vodafone.de). Ein echter
    // Rueckkanal ist nur opener oder rcDashWin.
    var echterKanal = ziele.indexOf('opener') !== -1 || ziele.indexOf('rcDashWin') !== -1;
    if (!echterKanal) {
      if (!RC_GM.warnKanal) {
        RC_GM.warnKanal = true;
        console.warn('[GM] Die Zahlen stimmen, erreichen aber KEIN Dashboard.\n' +
          '  Grund: window.opener ist leer. Dieser Tab wurde nicht vom Dashboard geoeffnet,\n' +
          '  und ohne opener gibt es ueber Domaingrenzen hinweg keinen Rueckweg —\n' +
          '  BroadcastChannel wirkt nur innerhalb EINER Domain (Dashboard esl.regiocom.net,\n' +
          '  Monitor ccs.vodafone.de). Auch ueber den Fensternamen ist das Dashboard von\n' +
          '  hier aus nicht auffindbar, solange die Tabs nicht voneinander geoeffnet wurden.\n' +
          '\n' +
          '  So wird es richtig (30 Sekunden):\n' +
          '   1. DIESEN Tab schliessen.\n' +
          '   2. Im Dashboard auf die Seite "Warteschleife" gehen.\n' +
          '   3. Dort unten auf "Genesys-Monitor oeffnen" klicken.\n' +
          '  Der so geoeffnete Tab hat den opener, und der Autopilot startet den Crawler\n' +
          '  dort von selbst — es muss nichts mehr in die Konsole eingefuegt werden.');
      }
    } else if (RC_GM.warnKanal) {
      RC_GM.warnKanal = false;
      console.log('[GM] Verbindung zum Dashboard steht (' + ziele.join(', ') + ').');
    }
  }

  // ============================================================
  //  7. Takt
  // ============================================================
  // ---------- Welche Qualitaeten werden abgefragt? ----------
  // NICHT mehr alle: get_data.rb nimmt die Filter als GET-Parameter, und 69
  // Qualitaeten ergeben eine URL von rund 25.000 Zeichen — der Server antwortet
  // dann mit HTTP 414 (Request-URI Too Long) und es kommt GAR NICHTS an.
  // Vorgabe ist deshalb genau die eine Qualitaet, auf die es hier ankommt;
  // weitere lassen sich zuschalten (rcGmQualitaeten oder aus dem Dashboard).
  var LS_AUSWAHL    = 'rcGmAuswahl';
  var MAX_FILTER    = 12;                               // Sicherheitsnetz gegen 414

  // Welches ESL-Projekt bedient dieser Monitor-Tab? Aus dem FENSTERNAMEN, den
  // das oeffnende Dashboard vergibt (rcKey('rcQueueQuelle') -> rcQueueQuelle /
  // rcQueueQuelle_mob / rcQueueQuelle_um). Tab-eigen, reload-fest — dieselbe
  // Mechanik wie beim Ligalisten-Crawler (05.08.).
  function projektAusName() {
    var n = '';
    try { n = String(window.name || ''); } catch (e) { return null; }
    if (n.indexOf('rcQueueQuelle') !== 0) return null;
    if (n === 'rcQueueQuelle_mob') return 'mobile';
    if (n === 'rcQueueQuelle_um')  return 'um';
    if (n === 'rcQueueQuelle')     return 'kabel';
    return null;
  }
  // Standard-Qualitaet(en) je Projekt. Namen aus dem Portal-Katalog (Nutzer-
  // Mitschnitt 05.08.), Schnittfuehrung wie die belegten Ligaliste-Baeume:
  // Kabel=Tech, Mobile=Care+Tec, UM=Care.
  function stdAbfrage() {
    var p = projektAusName();
    if (p === 'mobile') return ['CCS_Category_MF_01', 'CCS_Category_MF_02'];
    if (p === 'um')     return ['CCS_Category_UM_SONST_007'];
    return ['CCS_Category_KA_TEC_TV'];   // Kabel und unbenannte Tabs
  }
  var STD_QUALITAET = stdAbfrage()[0];

  // AUSWAHL-ABLAGE (umgebaut 05.08.): sessionStorage ZUERST, dann die Projekt-
  // Vorgabe, dann erst localStorage. Grund: rcGmAuswahl liegt im localStorage
  // von ccs.vodafone.de und wird von ALLEN Monitor-Tabs geteilt — bei drei
  // Monitoren (Kabel/Mobile/UM) gaelte die zuletzt geschriebene Auswahl fuer
  // alle drei. sessionStorage ist tab-eigen und ueberlebt den Reload; nach
  // einem Browser-Neustart greift die Projekt-Vorgabe aus dem Fensternamen.
  // localStorage bleibt NUR als Rueckfall fuer unbenannte Hand-Tabs — ein
  // benannter Projekt-Tab darf ihn nie lesen, dort koennte die Auswahl eines
  // ANDEREN Projekts liegen.
  var SS_AUSWAHL = 'rcGmAuswahlTab';
  function auswahlLesen() {
    try {
      var rohS = sessionStorage.getItem(SS_AUSWAHL);
      if (rohS) { var aS = JSON.parse(rohS); if (Array.isArray(aS) && aS.length) return aS; }
    } catch (e) {}
    if (projektAusName()) return stdAbfrage().slice();
    try {
      var roh = localStorage.getItem(LS_AUSWAHL);
      if (roh) { var a = JSON.parse(roh); if (Array.isArray(a) && a.length) return a; }
    } catch (e) {}
    return [STD_QUALITAET];
  }
  function auswahlSchreiben(liste) {
    try { sessionStorage.setItem(SS_AUSWAHL, JSON.stringify(liste)); } catch (e) {}
    // In den geteilten Origin-Speicher nur schreiben, wenn dieser Tab KEIN
    // benannter Projekt-Tab ist — sonst ueberschriebe der Mobile-Monitor die
    // Auswahl des Kabel-Monitors (und umgekehrt), genau die Kollision, die
    // der Umbau beseitigt.
    if (!projektAusName()) {
      try { localStorage.setItem(LS_AUSWAHL, JSON.stringify(liste)); } catch (e) {}
    }
  }
  // Liefert die filter-Strings der gewaehlten Qualitaeten. Unbekannte (noch nicht
  // angelernte) werden uebersprungen; ist am Ende nichts uebrig, wird auf die
  // Standard-Qualitaet und dann auf den ersten Katalogeintrag zurueckgefallen —
  // eine leere Liste wuerde den Lauf sonst komplett verhindern.
  function aktiveFilter() {
    var gewaehlt = auswahlLesen();
    var raus = [];
    gewaehlt.forEach(function (k) { if (RC_GM.katalog[k]) raus.push(RC_GM.katalog[k].filter); });
    if (!raus.length && RC_GM.katalog[STD_QUALITAET]) raus.push(RC_GM.katalog[STD_QUALITAET].filter);
    if (!raus.length) {
      var erste = Object.keys(RC_GM.katalog)[0];
      if (erste) raus.push(RC_GM.katalog[erste].filter);
    }
    if (raus.length > MAX_FILTER) {
      console.warn('[GM] ' + raus.length + ' Qualitaeten gewaehlt — es werden die ersten ' + MAX_FILTER +
        ' abgefragt. Mehr passt nicht in die URL (HTTP 414).');
      raus = raus.slice(0, MAX_FILTER);
    }
    return raus;
  }
  // Konsole: rcGmQualitaeten() zeigt die Auswahl, rcGmQualitaeten(['key1','key2'])
  // setzt sie, rcGmQualitaeten('alle') nimmt alle (bis MAX_FILTER).
  window.rcGmQualitaeten = function (wunsch) {
    if (wunsch === undefined) {
      var akt = auswahlLesen();
      console.log('[GM] Abgefragt werden:\n' + akt.map(function (k) {
        return '  ' + k + (RC_GM.katalog[k] ? '  (' + RC_GM.katalog[k].name + ')' : '  — noch nicht angelernt');
      }).join('\n'));
      console.log('[GM] Verfuegbar im Katalog: ' + Object.keys(RC_GM.katalog).length +
        ' — Liste mit rcGmKatalog()');
      return akt;
    }
    if (wunsch === 'alle') wunsch = Object.keys(RC_GM.katalog).slice(0, MAX_FILTER);
    if (typeof wunsch === 'string') wunsch = [wunsch];
    if (!Array.isArray(wunsch) || !wunsch.length) { console.warn('[GM] Bitte eine Liste von Katalog-Schluesseln uebergeben.'); return null; }
    auswahlSchreiben(wunsch);
    console.log('[GM] Auswahl gespeichert (' + wunsch.length + '). Hole sofort neu ...');
    lauf(false).then(function () { tabelle(); });
    return wunsch;
  };
  window.rcGmKatalog = function () {
    var k = RC_GM.katalog;
    console.table(Object.keys(k).sort(function (a, b) { return (k[a].name || '').localeCompare(k[b].name || ''); })
      .map(function (s) { return { Schluessel: s, Name: k[s].name }; }));
    return Object.keys(k);
  };
  // Vom Dashboard aus setzbar (cross-origin ueber postMessage an dieses Fenster).
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.typ !== 'gm_auswahl' || !Array.isArray(d.keys)) return;
    auswahlSchreiben(d.keys.slice(0, MAX_FILTER));
    console.log('[GM] Auswahl vom Dashboard uebernommen (' + d.keys.length + ').');
    // Fehlt eine der gewuenschten Qualitaeten im Katalog, wird sie NACHGELERNT
    // statt still uebersprungen (05.08.) — sonst fragt aktiveFilter weiter die
    // Standard-Qualitaet ab, waehrend payload.auswahl die neuen Keys meldet.
    var fehlend = d.keys.filter(function (k) { return !RC_GM.katalog[k]; });
    if (fehlend.length) {
      console.log('[GM] Davon noch nicht angelernt: ' + fehlend.join(', ') + ' — lerne nach.');
      lerneAlle(LERN_GRENZE_STD, fehlend).then(function () { lauf(false).then(function () { tabelle(); }); });
      return;
    }
    lauf(false).then(function () { tabelle(); });
  });

  async function lauf(nurWerte) {
    try {
      if (!nurWerte || !RC_GM.struktur || (jetzt() - RC_GM.letzteStruktur) > TAKT_STRUKTUR) {
        await holeStruktur();
      }
      await holeWerte();
      var stand = baueStand();
      RC_GM.letzterStand = stand;
      archiviere(stand);
      sende(stand);
      console.log('[GM]', stand.length, 'Qualitaeten aktualisiert —', new Date().toLocaleTimeString('de-DE'));
      return stand;
    } catch (e) {
      console.error('[GM] Fehler im Lauf:', e);
      return null;
    }
  }

  function starteTakt() {
    stoppeTakt();
    RC_GM.timerWerte = setInterval(function () { lauf(true); }, TAKT_WERTE);
    RC_GM.timerStruktur = setInterval(function () { holeStruktur().catch(function () {}); }, TAKT_STRUKTUR);
  }
  function stoppeTakt() {
    if (RC_GM.timerWerte) clearInterval(RC_GM.timerWerte);
    if (RC_GM.timerStruktur) clearInterval(RC_GM.timerStruktur);
    RC_GM.timerWerte = RC_GM.timerStruktur = null;
  }

  // ============================================================
  //  8. WebSocket-Modus (Push statt Polling)
  //     Protokoll aus dem Mitschnitt:
  //       senden:    register:v72080,v72081,v49782
  //       empfangen: 72081:5           bzw.  72092:2|72093:8|72083:2
  // ============================================================
  function alleStatIds() {
    var ids = {};
    (RC_GM.struktur || []).forEach(function (q) {
      [q.wa, q.wz, q.istId].forEach(function (i) { if (i) ids[i] = 1; });
      [q.eq15, q.eqTag].forEach(function (e) {
        if (e) [e.answered, e.abandoned, e.shortAbandoned].forEach(function (i) { if (i) ids[i] = 1; });
      });
      [q.sl15, q.slTag].forEach(function (s) {
        if (s) [s.zaehler, s.nenner].forEach(function (i) { if (i) ids[i] = 1; });
      });
    });
    return Object.keys(ids);
  }

  function live(an) {
    if (an === false) {
      if (RC_GM.ws) { try { RC_GM.ws.close(); } catch (e) {} RC_GM.ws = null; }
      RC_GM.wsAktiv = false;
      starteTakt();
      console.log('[GM] Live-Modus aus, Polling laeuft wieder.');
      return;
    }
    if (!RC_GM.struktur) { console.warn('[GM] Erst rcGmLauf() ausfuehren, damit die Stat-IDs bekannt sind.'); return; }
    var ids = alleStatIds();
    if (!ids.length) { console.warn('[GM] Keine Stat-IDs gefunden.'); return; }
    var ws = new WebSocket(WS_URL);
    RC_GM.ws = ws;
    ws.addEventListener('open', function () {
      RC_GM.wsAktiv = true;
      ws.send('register:' + ids.map(function (i) { return 'v' + i; }).join(','));
      console.log('[GM] Live-Modus an —', ids.length, 'Stat-IDs registriert.');
      stoppeTakt();
      // Struktur/Forecast trotzdem gelegentlich auffrischen
      RC_GM.timerStruktur = setInterval(function () { holeStruktur().catch(function () {}); }, TAKT_STRUKTUR);
    });
    ws.addEventListener('message', function (ev) {
      var roh = String(ev.data || '');
      if (roh.indexOf(':') === -1) return;
      roh.split('|').forEach(function (paar) {
        var i = paar.indexOf(':');
        if (i <= 0) return;
        var id = paar.slice(0, i).replace(/^v/, '');
        RC_GM.werte[id] = paar.slice(i + 1);
      });
      var stand = baueStand();
      RC_GM.letzterStand = stand;
      archiviere(stand);
      sende(stand);
    });
    ws.addEventListener('close', function () {
      RC_GM.wsAktiv = false;
      console.warn('[GM] WebSocket geschlossen — zurueck auf Polling.');
      starteTakt();
    });
    ws.addEventListener('error', function (e) { console.warn('[GM] WebSocket-Fehler:', e); });
  }

  // ============================================================
  //  9. Katalog lernen — die Oberflaeche einmal durchsteuern
  //     Danach kennt der Crawler filter/node_id/Stat-IDs jeder
  //     Qualitaet und braucht die Oberflaeche nie wieder.
  //     Der urspruengliche Zustand wird am Ende wiederhergestellt.
  // ============================================================
  function warteBis(pruef, msMax) {
    return new Promise(function (fertig) {
      var start = jetzt();
      (function tick() {
        if (pruef()) return fertig(true);
        if (jetzt() - start > (msMax || 15000)) return fertig(false);
        setTimeout(tick, 250);
      })();
    });
  }

  // Der Dienstleister ("regiocom") steht in einer EIGENEN Liste neben den
  // Qualitaeten. Der Crawler hat sie bisher nie angefasst — er hat nur
  // Qualitaeten markiert und "Ok" geklickt. Ob das Portal ohne gewaehlten
  // Dienstleister ueberhaupt eine Anfrage abschickt, ist nicht gemessen; sicher
  // ist nur, dass es nichts kostet, ihn vorher mit auszuwaehlen. Belegt aus dem
  // DOM-Mitschnitt (GenesysMonitor.txt): <select id="provider-list" multiple>
  // mit genau einer Option <option value="SNT">regiocom</option> — der Anzeigename
  // ist also "regiocom", der Wert "SNT". Genau deshalb ist RC_GM.provider = 'SNT'
  // richtig und darf NICHT auf "regiocom" geaendert werden.
  function waehleDienstleister() {
    var p = document.getElementById('provider-list');
    if (!p || !p.options || !p.options.length) return null;
    var schon = Array.prototype.filter.call(p.options, function (o) { return o.selected; });
    if (schon.length) return schon.map(function (o) { return o.value; });
    // Nichts gewaehlt -> alles waehlen (in der Praxis genau ein Eintrag).
    Array.prototype.forEach.call(p.options, function (o) { o.selected = true; });
    p.dispatchEvent(new Event('change', { bubbles: true }));
    var gesetzt = Array.prototype.map.call(p.options, function (o) { return o.value; });
    console.log('[GM] Dienstleister mitgewaehlt: ' + gesetzt.join(', ') +
      ' (Anzeigename: ' + Array.prototype.map.call(p.options, txt).join(', ') + ')');
    return gesetzt;
  }

  // WIE VIELE QUALITAETEN WERDEN ANGELERNT?
  //   Frueher: ALLE. Die Liste hat rund 70 Eintraege, je Eintrag wird bis zu
  //   15 s auf eine Antwort gewartet (plus 700 ms Pause). Kommt keine Antwort,
  //   sind das ueber 18 Minuten, in denen die Seite sichtbar durch die
  //   Qualitaeten klickt und der Crawler noch keine einzige Zahl liefert. Genau
  //   dieses Bild ("er waehlt Qualitaeten", nichts kommt an) war zu sehen.
  //   Jetzt: standardmaessig nur das, was tatsaechlich abgefragt werden soll —
  //   das ist ab Werk EINE Qualitaet. Alles andere kann jederzeit von Hand
  //   nachgeholt werden (rcGmLerneAlle()).
  var LERN_GRENZE_STD = 6;      // Obergrenze fuer den automatischen Lauf
  var LERN_FEHLVERSUCHE_MAX = 3; // danach abbrechen statt minutenlang weiterklicken

  async function lerneAlle(maxAnzahl, nurDiese) {
    var sel = document.getElementById('quality-list');
    var ok = document.getElementById('ok-button');
    if (!sel || !ok) { console.warn('[GM] #quality-list oder #ok-button nicht gefunden — laeuft dieses Script auf gm2.rb?'); return; }

    var vorherQual = Array.prototype.filter.call(sel.options, function (o) { return o.selected; }).map(function (o) { return o.value; });
    var p = document.getElementById('provider-list');
    var vorherProv = p ? Array.prototype.filter.call(p.options, function (o) { return o.selected; }).map(function (o) { return o.value; }) : [];
    waehleDienstleister();

    var optionen = Array.prototype.map.call(sel.options, function (o) { return { wert: o.value, name: txt(o) }; });
    // Gezielt: nur die Qualitaeten, die wirklich gebraucht werden.
    if (nurDiese && nurDiese.length) {
      optionen = optionen.filter(function (o) { return nurDiese.indexOf(o.wert) !== -1; });
      // Gewuenschte, die es in der Liste gar nicht gibt, klar benennen — sonst
      // sucht man den Fehler spaeter im Netzwerk statt in der Auswahl.
      nurDiese.forEach(function (k) {
        if (!optionen.some(function (o) { return o.wert === k; }))
          console.warn('[GM] Gewuenschte Qualitaet steht nicht in der Liste des Portals: ' + k);
      });
    }
    var offen = optionen.filter(function (o) { return !RC_GM.katalog[o.wert]; });
    if (maxAnzahl && offen.length > maxAnzahl) {
      console.log('[GM] ' + offen.length + ' unbekannte Qualitaeten — es werden die ersten ' + maxAnzahl +
        ' angelernt. Rest bei Bedarf mit rcGmLerneAlle(' + offen.length + ').');
      offen = offen.slice(0, maxAnzahl);
    }
    if (!offen.length) {
      console.log('[GM] Alle benoetigten Qualitaeten sind schon bekannt — nichts anzulernen.');
      return;
    }

    console.log('[GM] Lerne ' + offen.length + ' Qualitaet(en) an (etwa ' +
      Math.ceil(offen.length * 2.5) + ' s). Bitte die Seite waehrenddessen nicht bedienen.');
    var neu = 0, fehl = 0;
    for (var i = 0; i < offen.length; i++) {
      var o = offen[i];
      if (RC_GM.katalog[o.wert]) continue;   // zwischenzeitlich gelernt
      Array.prototype.forEach.call(sel.options, function (opt) { opt.selected = (opt.value === o.wert); });
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      var marke = letzterMitschnitt;
      ok.click();
      // 8 s statt 15: eine Antwort, die so lange braucht, kommt meist gar nicht.
      var erfolg = await warteBis(function () { return letzterMitschnitt > marke; }, 8000);
      if (erfolg && RC_GM.katalog[o.wert]) { neu++; fehl = 0; } else { fehl++; }
      console.log('[GM] ' + (i + 1) + '/' + offen.length + ' ' + o.name + (erfolg ? ' — gelernt' : ' — keine Antwort'));
      // NICHT minutenlang gegen eine Wand klicken. Bleiben die ersten Versuche
      // ohne jede Antwort, stimmt etwas Grundsaetzliches (keine Sitzung, kein
      // Dienstleister, Seite umgebaut) — das sagt man einmal deutlich und hoert auf.
      if (fehl >= LERN_FEHLVERSUCHE_MAX) {
        console.warn('[GM] ' + fehl + ' Versuche ohne jede Antwort — Anlernen abgebrochen.\n' +
          '  Der "Ok"-Klick loest offenbar keine Datenanfrage aus. Bitte einmal von Hand pruefen:\n' +
          '  Dienstleister "regiocom" markieren, eine Qualitaet markieren, "Ok" druecken.\n' +
          '  Kommt dann eine Tabelle, danach rcGmLerneAlle() erneut aufrufen.');
        break;
      }
      await new Promise(function (r) { setTimeout(r, 700); });   // Server schonen
    }

    // Ursprungszustand wiederherstellen (sonst steht der Monitor des Nutzers
    // hinterher auf einer fremden Qualitaet — dieselbe Falle wie beim
    // ESL-Export, der auf "heute" zurueckgestellt werden muss)
    if (p && vorherProv.length) {
      Array.prototype.forEach.call(p.options, function (opt) { opt.selected = vorherProv.indexOf(opt.value) !== -1; });
      p.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (vorherQual.length) {
      Array.prototype.forEach.call(sel.options, function (opt) { opt.selected = vorherQual.indexOf(opt.value) !== -1; });
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      ok.click();
    }
    console.log('[GM] Fertig.', neu, 'neu gelernt, Katalog umfasst jetzt', Object.keys(RC_GM.katalog).length, 'Qualitaeten.');
  }

  // ============================================================
  //  10. Ausgabe
  // ============================================================
  function tabelle() {
    if (!RC_GM.letzterStand.length) { console.warn('[GM] Noch kein Stand — rcGmLauf() ausfuehren.'); return; }
    console.table(RC_GM.letzterStand.map(function (s) {
      return {
        Qualitaet: s.name, WA: s.wa, WZ: s.wz,
        'EQ15': s.eq15, 'EQTag': s.eqTag, 'SL15': s.sl15, 'SLTag': s.slTag,
        IST: s.ist, FC: s.fc, 'FC-P': s.fcp, Abweichung: s.diffAbs + ' / ' + s.diffRel
      };
    }));
  }

  function status() {
    console.log('[GM] v' + VERSION +
      '\n  Provider:        ' + RC_GM.provider +
      '\n  Katalog:         ' + Object.keys(RC_GM.katalog).length + ' Qualitaeten' +
      '\n  Struktur:        ' + (RC_GM.struktur ? RC_GM.struktur.length + ' Zeilen, geholt ' + new Date(RC_GM.letzteStruktur).toLocaleTimeString('de-DE') : 'noch keine') +
      '\n  Ist-Werte:       ' + Object.keys(RC_GM.werte).length + ' Stat-IDs' +
      '\n  Modus:           ' + (RC_GM.wsAktiv ? 'WebSocket (Push)' : 'Polling alle ' + (TAKT_WERTE / 1000) + ' s') +
      '\n  Historie:        ' + Object.keys(lade(HIST_KEY, {})).length + ' Tage');
    if (Object.keys(RC_GM.katalog).length) {
      console.table(Object.keys(RC_GM.katalog).map(function (k) {
        var e = RC_GM.katalog[k];
        return { Kategorie: k, Name: e.name, NodeId: e.nodeId, StatIds: e.statIds.length };
      }));
    }
    return RC_GM;
  }

  function stop() {
    stoppeTakt();
    if (RC_GM.ws) { try { RC_GM.ws.close(); } catch (e) {} RC_GM.ws = null; }
    console.log('[GM] gestoppt.');
  }
  RC_GM.stop = stop;

  // ============================================================
  //  Start
  // ============================================================
  window.RC_GM = RC_GM;
  window.rcGmLauf = function () { return lauf(false); };
  window.rcGmStatus = status;
  window.rcGmTabelle = tabelle;
  window.rcGmLerneAlle = lerneAlle;
  window.rcGmLive = live;
  window.rcGmHistorie = function () { return lade(HIST_KEY, {}); };
  window.rcGmStop = stop;
  // Rettungsanker — mit begrenzter Reichweite, das ist keine Nachlaessigkeit,
  // sondern eine Browser-Grenze: window.open('', name) findet ein Fenster NUR,
  // wenn beide Tabs zur selben "browsing context group" gehoeren, also
  // auseinander hervorgegangen sind. Zwei unabhaengig geoeffnete Tabs finden
  // sich NIE, egal wie sie heissen. Diese Funktion hilft daher nur, wenn der
  // opener unterwegs verloren ging (z.B. Navigation mit rel="noopener") —
  // nicht, wenn der Tab von Hand aufgemacht wurde. Dann bleibt nur der Weg
  // ueber "Genesys-Monitor oeffnen" im Dashboard.
  window.rcGmVerbinde = function (fensterName) {
    var n = fensterName || 'rcDashboard';
    var w = null;
    try { w = window.open('', n); } catch (e) {}
    if (!w) {
      console.warn('[GM] Der Browser hat das Fenster-Nachschlagen blockiert (Popup-Blocker).\n' +
        '  Einmal irgendwo in diese Seite klicken und rcGmVerbinde() erneut aufrufen.');
      return false;
    }
    // Gibt es KEIN Fenster mit diesem Namen, macht window.open ein neues leeres auf.
    // Unterscheidung: beim Dashboard (fremde Domain) ist location.href nicht lesbar
    // und wirft — genau daran erkennt man das echte Fenster. Ein frisch erzeugtes
    // about:blank ist lesbar und wird sofort wieder geschlossen.
    var istDashboard = false;
    try {
      var href = w.location.href;
      istDashboard = !(href === 'about:blank' || href === '');
    } catch (e) {
      istDashboard = true;   // nicht lesbar => andere Domain => das Dashboard
    }
    if (!istDashboard) {
      try { w.close(); } catch (e) {}
      console.warn('[GM] Kein offenes Dashboard-Fenster mit dem Namen "' + n + '" gefunden.\n' +
        '  Laeuft das Dashboard wirklich in einem Tab dieses Browsers?\n' +
        '  Falls ja, es aber aelter ist als dieses Update: dort einmal die Seite neu laden,\n' +
        '  damit es seinen Fensternamen setzt. Sonst: im Dashboard auf der Seite\n' +
        '  Warteschleife den Link "Genesys-Monitor oeffnen" benutzen.');
      return false;
    }
    window.rcDashWin = w;
    RC_GM.warnKanal = false;
    console.log('[GM] Dashboard-Fenster gefunden und verbunden. Daten gehen ab sofort dorthin.');
    if (RC_GM.letzterStand && RC_GM.letzterStand.length) sende(RC_GM.letzterStand);
    return true;
  };
  window.rcGmHoleStruktur = holeStruktur;
  window.rcGmHoleWerte = holeWerte;

  // ---------- Wachhalter (05.10.) ----------
  // Der Monitor-Tab liegt im Betrieb im Hintergrund. Edge legt verborgene Tabs
  // schlafen ("Schlafende Tabs"): Zeitgeber und Netzabrufe stehen dann, bis der
  // Tab wieder vorn liegt. Haelt die Seite einen Web Lock, friert Edge sie
  // nicht ein — an echtem Edge 154 gemessen (pruefwerkzeuge/schlaf_messen.mjs).
  // Der Lock wird nie zurueckgegeben und faellt mit der Seite; ein Re-Inject
  // laesst den vorhandenen stehen.
  (function wachhalten() {
    if (window.__rcWachLock) return;
    try {
      if (!(navigator.locks && navigator.locks.request)) {
        console.warn('[GM] Wachhalter nicht moeglich (keine Web Locks) — liegt der Tab im Hintergrund, kann Edge ihn einfrieren.');
        return;
      }
      var name = 'rc_wach_gm_' + Date.now() + '_' + Math.round(performance.now() * 1000);
      window.__rcWachLock = { name: name, seit: Date.now() };
      navigator.locks.request(name, function () { return new Promise(function () {}); })
        .catch(function (e) {
          window.__rcWachLock = null;
          console.warn('[GM] Wachhalter: Web Lock nicht bekommen (' + (e && e.message ? e.message : e) + ').');
        });
    } catch (e) { window.__rcWachLock = null; }
  })();

  console.log('%c[Genesys-Monitor-Crawler v' + VERSION + '] bereit', 'color:#E60000;font-weight:bold;font-size:13px');
  if (!Object.keys(RC_GM.katalog).length) {
    console.log('Noch kein Katalog — ich lerne die Qualitaeten jetzt selbst an.\n' +
      '  (Von Hand ginge auch: im Portal eine Qualitaet waehlen und "Ok" klicken,\n' +
      '   oder rcGmLerneAlle(5) fuer die ersten 5.)');
  } else {
    console.log('Katalog mit ' + Object.keys(RC_GM.katalog).length + ' Qualitaeten geladen. Starte in 3 s.');
  }
  setTimeout(function () {
    if (Object.keys(RC_GM.katalog).length) {
      // ANLERN-LUECKE geschlossen (05.08.): Vorher wurde NUR bei komplett leerem
      // Katalog gelernt. Ein Mobile-/UM-Monitor traf aber auf den geteilten
      // Katalog des Kabel-Monitors (localStorage rcGmKatalog, Origin-weit) —
      // seine eigenen Qualitaeten (MF_01/MF_02 bzw. UM_SONST_007) fehlten darin,
      // aktiveFilter uebersprang sie STILL und fiel auf die Kabel-Standard-
      // Qualitaet zurueck. Der Monitor zeigte dann Kabel-Zahlen unter Mobile-
      // Ueberschrift, und payload.auswahl meldete trotzdem die MF-Keys — fuer
      // das Dashboard sah alles richtig aus. Jetzt: fehlen gewuenschte
      // Qualitaeten im Katalog, werden GENAU DIESE nachgelernt, dann Start.
      var fehlend = auswahlLesen().filter(function (k) { return !RC_GM.katalog[k]; });
      if (fehlend.length) {
        console.log('[GM] ' + fehlend.length + ' gewaehlte Qualitaet(en) noch nicht angelernt: ' +
          fehlend.join(', ') + ' — lerne sie jetzt nach.');
        lerneAlle(LERN_GRENZE_STD, fehlend).then(function () {
          var immerNoch = fehlend.filter(function (k) { return !RC_GM.katalog[k]; });
          if (immerNoch.length) console.warn('[GM] Nicht anlernbar: ' + immerNoch.join(', ') +
            ' — heissen die Schluessel in DIESEM Portal so? rcGmKatalog() zeigt, was da ist.');
          lauf(false).then(function () { starteTakt(); tabelle(); });
        });
        return;
      }
      lauf(false).then(function () { starteTakt(); tabelle(); }); return;
    }
    // OHNE Katalog lief der Crawler bisher gar nicht an — er hat nur einen Hinweis
    // ausgegeben und gewartet. Auf einem Wandmonitor liest den niemand, und der
    // Katalog liegt in localStorage, den Citrix regelmaessig leert. Deshalb wird
    // er hier einmal selbst angelernt (das klickt die Qualitaeten durch und stellt
    // den Ursprungszustand danach wieder her) und dann normal gestartet.
    // GEZIELT anlernen, nicht die ganze Liste. Gebraucht wird nur, was auch
    // abgefragt wird — ab Werk EINE Qualitaet. Frueher lief hier lerneAlle()
    // ohne Grenze ueber rund 70 Eintraege; das klickte die Seite minutenlang
    // durch und lieferte in der ganzen Zeit keine einzige Zahl.
    var gewuenscht = auswahlLesen();
    console.log('[GM] Lerne gezielt an: ' + gewuenscht.join(', '));
    Promise.resolve()
      .then(function () { return lerneAlle(LERN_GRENZE_STD, gewuenscht); })
      .then(function () {
        // Hat die gezielte Runde nichts gebracht, EINMAL breiter versuchen —
        // die gewuenschten Schluessel koennten in diesem Portal anders heissen.
        if (Object.keys(RC_GM.katalog).length) return null;
        console.warn('[GM] Die gewuenschten Qualitaeten waren nicht zu lernen — versuche die ersten ' +
          LERN_GRENZE_STD + ' aus der Liste.');
        return lerneAlle(LERN_GRENZE_STD);
      })
      .then(function () {
        var n = Object.keys(RC_GM.katalog).length;
        if (!n) {
          console.warn('[GM] Anlernen brachte keine Qualitaeten.\n' +
            '  So kommt der Crawler nicht in Gang. Bitte einmal von Hand:\n' +
            '    1. Dienstleister "regiocom" anklicken\n' +
            '    2. eine Qualitaet anklicken\n' +
            '    3. "Ok" druecken\n' +
            '  Erscheint danach eine Tabelle, laeuft der Crawler von allein weiter.\n' +
            '  Erscheint KEINE, fehlt die CCS-Anmeldung (Seite neu laden).');
          return;
        }
        console.log('[GM] ' + n + ' Qualitaet(en) angelernt. Crawler startet.');
        return lauf(false).then(function () { starteTakt(); tabelle(); });
      })
      .catch(function (e) { console.warn('[GM] Anlernen fehlgeschlagen: ' + (e && e.message ? e.message : e)); });
  }, 3000);
})();
