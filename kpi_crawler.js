(function() {
  // ============================================================
  //  regiocom KPI-Crawler v5 — Ligaliste -> ESL Live-Arena
  //  - parst ALLE Kennzahlen der Ligaliste (ACD, ACW, AHT, ACHT,
  //    Auflegerquote, CS, CS-DDS, TNPS, FQ, TNPS-DDS, First-Time-Fix,
  //    Total-Fix, Promotoren/Detraktoren/Neutrale je CS+TNPS,
  //    Weiterleitungsquote Skill<>) — Header wird dynamisch erkannt
  //  - START: EINMAL "Aktueller Monat" + Intervall "Tag" -> ein einziger
  //    get_data.rb-Request liefert die ganze Monatshistorie auf Tagesbasis
  //  - DANACH: nur noch LIVE (Intraday) alle 10 Minuten
  //  - mit mitgeschnittenem Token laeuft der Live-Takt komplett an der Seite
  //    vorbei: kein Ok-Klick, keine Select-Aenderung, keine Nebenwirkung auf
  //    die Ansicht des Nutzers. Ohne Token: Ok-Klick + DOM-Tabelle lesen.
  //  - speichert je Tag einen Snapshot in localStorage (rcLigaHistory,
  //    max. HISTORY_DAYS Tage) und sendet die Historie mit
  //  - sendet via BroadcastChannel + window.opener.postMessage
  // ============================================================
  const CHANNEL_NAME = 'regiocom_live_arena';
  const POLL_INTERVAL = 300000;   // 5 Minuten — Live-Takt (Nutzer-Vorgabe 30.07.)
  const REFRESH_WAIT  = 12000;    // Wartezeit nach "Ok"-Klick bis die Tabelle neu gebaut ist
  const HISTORY_DAYS  = 35;       // so viele Tages-Snapshots behalten (Bereichs-Vergleiche!)
  // Start-Harvest: EIN Lauf ueber den aktuellen Monat auf Tagesbasis.
  // Frueher wurden last_week + current_week + drei user_defined-Datumsformate
  // durchprobiert — viel Last, ueberlappende Tage und im DOM-Weg das falsche
  // Intervall (siehe waitForIntervalDay). "Aktueller Monat" deckt alles ab.
  const HARVEST_RANGE = 'current_month';
  const LS_ALLE_STD   = 'rcCrawlerAlleStd';    // "1"/"0" — ueberlebt den Seitenwechsel
  const LS_MONAT      = 'rcLigaMonatsHarvest'; // "YYYY-MM" des zuletzt geholten Monats
  const LS_WOCHE      = 'rcLigaWochenHarvest'; // "YYYY-MM-DD" des letzten Wochenlaufs

  // ---------- Drei Stufen statt einer (Nutzer-Vorgabe 30.07.) ----------
  // "Aktueller Monat" x Intervall "Tag" x ALLE Standorte hat die Ligalisten-Seite
  // haengen lassen — das sind rund 31 Tage x 9 Standorte x ~500 Agenten in EINER
  // Antwort. Aufgeteilt:
  //   1. MONAT  — einmal je Monat, Tagesbasis, aber NUR Alanya (der Standort mit
  //               den ESL-Verkaufsteams; dort wird die Historie gebraucht)
  //   2. WOCHE  — einmal je Tag, Tagesbasis, ALLE Standorte (deutlich kleiner)
  //   3. LIVE   — alle 5 Minuten, intraday/kumuliert, ALLE Standorte
  const MONATS_STANDORTE = ['Alanya'];
  const WOCHEN_RANGE     = 'current_week';

  // Standorte, die es in der Ligaliste gibt. Reihenfolge wie im Dropdown.
  // Dient als Rueckfall, falls sich die Auswahl nicht aus der Seite lesen laesst.
  const STANDORTE_FALLBACK = [
    'Alanya', 'Alexandroupolis', 'Berlin', 'Essen', 'Neubrandenburg',
    'Potsdam', 'regiocom_W_Home', 'Sakarya', 'Serres'
  ];
  // Alle waehlbaren Standorte aus der Seite lesen. Bevorzugt, weil die Liste
  // damit automatisch mitwaechst, wenn das Portal einen Standort ergaenzt.
  // Sammelwerte wie "--Alle--" duerfen NIE in die Liste: das Portal wuerde sie
  // als unbekannten Standort behandeln und eine leere Tabelle liefern.
  function istSammelwert(v) {
    const t = String(v == null ? '' : v).trim();
    if (!t) return true;
    if (t === '-1' || t === '0') return true;
    return /^-*\s*(alle|all)\s*-*$/i.test(t);
  }
  // ACHTUNG — HIER LAG EIN STILLER FEHLER (Befund 31.07.):
  // Frueher wurden die echten Werte aus der Seite UND die neun fest verdrahteten
  // Namen aus STANDORTE_FALLBACK in DIESELBE Liste geworfen. Das ist nur dann
  // richtig, wenn das Portal Standort-NAMEN erwartet. Erwartet es Kennungen
  // (Zahlen/Kuerzel), enthaelt die Liste neun ungueltige Eintraege — und die
  // Antwort war leer ("keine-tabelle"), worauf der Crawler still auf die
  // Portal-Auswahl zurueckfiel. Genau diese beiden Meldungen standen in der
  // Konsole: "Mit expliziter Standortliste kam nichts zurueck" gefolgt von
  // "Portal-Auswahl liefert Daten, die volle Standortliste nicht".
  // Regel jetzt: Was aus der Seite kommt, ist massgeblich und wird NICHT
  // vermischt. Die Rueckfall-Liste greift nur, wenn die Seite gar nichts hergibt.
  function alleStandorte() {
    const ausSeite = new Set();
    try {
      document.querySelectorAll('[name="loc_inlist"], [name="loc_inlist[]"]').forEach(el => {
        if (el.tagName === 'SELECT') Array.from(el.options).forEach(o => { if (!istSammelwert(o.value)) ausSeite.add(o.value); });
        else if (!istSammelwert(el.value)) ausSeite.add(el.value);
      });
      if (!ausSeite.size) {
        document.querySelectorAll('#loc-list option, #location-list option, select[id*="loc"] option')
          .forEach(o => { if (!istSammelwert(o.value)) ausSeite.add(o.value); });
      }
    } catch (e) {}
    if (ausSeite.size) {
      // Was im mitgeschnittenen Request steht, stammt aus derselben Quelle und
      // ist damit garantiert im richtigen Format — das darf dazu.
      try { (window.__rcLocInlist || []).forEach(s => { if (!istSammelwert(s)) ausSeite.add(s); }); } catch (e) {}
      return [...ausSeite];
    }
    // Die Seite gibt nichts her (Auswahlfeld umbenannt, noch nicht geladen).
    // Dann bleibt nur das, was im Request stand, sonst die Rueckfall-Liste.
    const ersatz = new Set();
    try { (window.__rcLocInlist || []).forEach(s => { if (!istSammelwert(s)) ersatz.add(s); }); } catch (e) {}
    if (ersatz.size) return [...ersatz];
    console.warn('[KPI Crawler] Standorte konnten weder aus der Seite noch aus dem Mitschnitt gelesen werden — ' +
      'benutze die fest hinterlegte Namensliste. Passt sie nicht zum Portal, kommt eine leere Tabelle zurueck ' +
      '(dann rcCrawlerAlleStandorte(false) setzen).');
    return [...STANDORTE_FALLBACK];
  }
  function alleStandorteAn() {
    try {
      const v = localStorage.getItem(LS_ALLE_STD);
      if (v === '0') return false;      // nur eine ausdrueckliche Abwahl zaehlt
    } catch (e) {}
    return true;                         // Vorgabe seit 30.07.: immer alle
  }

  const channel = new BroadcastChannel(CHANNEL_NAME);

  // ---------- Original-Datenanfrage der Seite mitschneiden ----------
  // Die Ligaliste laedt ihre Tabelle ueber POST an get_data.rb (siehe DevTools).
  // Wir merken uns die letzte solche Anfrage (mit gueltigem Sicherheits-Token,
  // user_id, figure_list, Standorten) und koennen sie mit anderem Zeitraum/
  // Intervall nachstellen — ohne die Live-Ansicht der Seite zu veraendern.
  window.__rcLastGetData = window.__rcLastGetData || null;
  // Body eines Requests in einen url-encoded STRING normalisieren — egal ob die Seite
  // ihn als String, URLSearchParams oder FormData sendet. (Frueher wurden NUR Strings
  // erfasst -> bei URLSearchParams/FormData blieb der Token unsichtbar = Hauptursache
  // fuer "Keine get_data.rb-Anfrage mitgeschnitten".)
  function rcBodyToString(b){
    try {
      if (b == null) return null;
      if (typeof b === 'string') return b;
      if (typeof URLSearchParams !== 'undefined' && b instanceof URLSearchParams) return b.toString();
      if (typeof FormData !== 'undefined' && b instanceof FormData) {
        const p = new URLSearchParams();
        for (const pair of b.entries()) p.append(pair[0], pair[1]);
        return p.toString();
      }
    } catch(e){}
    return null;
  }
  (function hookRequests(){
    if (window.__rcReqHooked) return;
    window.__rcReqHooked = true;
    const isGetData = u => typeof u === 'string' && u.indexOf('get_data.rb') !== -1;
    // fetch
    const origFetch = window.fetch;
    if (origFetch) window.fetch = function(input, init){
      try {
        const url = (typeof input === 'string') ? input : (input && input.url) || '';
        const s = rcBodyToString(init && init.body);
        if (isGetData(url) && s) window.__rcLastGetData = { url, body: s };
      } catch(e){}
      return origFetch.apply(this, arguments);
    };
    // XMLHttpRequest (falls die Seite XHR statt fetch nutzt)
    const oOpen = XMLHttpRequest.prototype.open, oSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(m, u){ this.__rcUrl = u; return oOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function(b){
      try { const s = rcBodyToString(b); if (isGetData(this.__rcUrl) && s) window.__rcLastGetData = { url: this.__rcUrl, body: s }; } catch(e){}
      return oSend.apply(this, arguments);
    };
  })();

  function cleanText(s){ return (s || '').replace(/\s+/g, ' ').trim(); }
  function pad2(n){ return String(n).padStart(2, '0'); }
  function dayKey(d){ return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }
  // Datum-Zelle -> 'YYYY-MM-DD' (Portal liefert z.B. "2026/07/13" oder "13.07.2026")
  function datumKey(s){
    const t = cleanText(s); if (!t) return '';
    let m = t.match(/(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);      // YYYY/MM/DD
    if (m) return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
    m = t.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);          // DD.MM.YYYY
    if (m) return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]);
    return '';
  }

  // "hh:mm:ss" -> Sekunden
  function timeToSec(s){
    const m = cleanText(s).match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (!m) return null;
    return (+m[1])*3600 + (+m[2])*60 + (+m[3]);
  }

  // ---------- Dynamischer Header-Parser ----------
  function buildColumnMap(table) {
    const headRows = table.querySelectorAll('thead tr');
    if (headRows.length < 2) return null;
    const leafCells = headRows[headRows.length - 1].querySelectorAll('th');
    const leafLabels = Array.from(leafCells).map(th => cleanText(th.textContent));
    const groupCells = headRows[0].querySelectorAll('th');
    const groupPerLeaf = [];
    groupCells.forEach(th => {
      const span = parseInt(th.getAttribute('colspan')) || 1;
      const name = cleanText(th.textContent);
      for (let i = 0; i < span; i++) groupPerLeaf.push(name);
    });
    return { leafLabels, groupPerLeaf };
  }
  function findLeaf(map, label) {
    return map.leafLabels.findIndex(l => l.toLowerCase() === label.toLowerCase());
  }
  // nth = das wievielte passende Vorkommen (Promotoren/Detraktoren/Neutrale
  // gibt es zweimal: erst CS-basiert, dann TNPS-basiert)
  function findKpi(map, group, sub, nth) {
    let seen = 0;
    for (let i = 0; i < map.leafLabels.length; i++) {
      if ((map.groupPerLeaf[i] || '').toLowerCase() === group.toLowerCase() &&
          map.leafLabels[i].toLowerCase() === sub.toLowerCase()) {
        seen++;
        if (seen === (nth || 1)) return i;
      }
    }
    return -1;
  }
  function cellNum(cells, idx) {
    if (idx < 0 || !cells[idx]) return null;
    const t = cleanText(cells[idx].textContent);
    if (t === '') return null;
    const v = parseFloat(t.replace(',', '.'));
    return isNaN(v) ? null : v;
  }
  function cellText(cells, idx) {
    if (idx < 0 || !cells[idx]) return '';
    return cleanText(cells[idx].textContent);
  }

  // ---------- Tabelle parsen (ALLE Kennzahlen) ----------
  // tableEl optional: erlaubt das Parsen einer Tabelle aus einer nachgestellten
  // get_data.rb-Antwort (Wochen-Historie) statt der Live-Tabelle im DOM.
  function parseKpiTable(tableEl) {
    const table = tableEl || document.querySelector('table#result-table');
    if (!table) { console.warn('[KPI Crawler] Tabelle nicht gefunden'); return []; }
    const map = buildColumnMap(table);
    if (!map) { console.warn('[KPI Crawler] Header nicht lesbar'); return []; }

    // Identitaet
    const iName = findLeaf(map, 'Agentenname');
    const iCcs  = findLeaf(map, 'CCS-ID');
    const iStd  = findLeaf(map, 'Standort');
    const iTeam = findLeaf(map, 'Team');
    const iDatum = findLeaf(map, 'Datum'); // nur bei Intervall "Tag" vorhanden

    // Agentenzeiten
    const iAcdKz  = findKpi(map, 'ACD', 'Kennzahl');
    const iAcwKz  = findKpi(map, 'ACW', 'Kennzahl');
    const iAhtKz  = findKpi(map, 'AHT', 'Kennzahl');
    const iAchtKz = findKpi(map, 'ACHT', 'Kennzahl');
    const iCalls    = findKpi(map, 'AHT', 'Nenner');
    const iCallsAcd = findKpi(map, 'ACD', 'Nenner');

    // CAB-Block
    const iAq     = findKpi(map, 'Auflegerquote', 'Kennzahl');
    const iCs     = findKpi(map, 'CS', 'Kennzahl');
    const iCsDds  = findKpi(map, 'CS Deep Detractor %', 'Kennzahl');
    const iTnps   = findKpi(map, 'TNPS', 'Kennzahl');
    const iFq     = findKpi(map, 'TNPS Antwortquote %', 'Kennzahl');
    const iDds    = findKpi(map, 'TNPS Deep Detractor %', 'Kennzahl');
    const iFtf    = findKpi(map, 'First-Time-Fix', 'Kennzahl');
    const iTotFix = findKpi(map, 'Total-Fix', 'Kennzahl');
    // ZAEHLER der Kern-KPIs (fuer den "Aktueller Stand"-Export; Header-Text "Zähler")
    const Z = String.fromCharCode(90, 228) + 'hler'; // "Zähler" — encoding-sicher beim Konsolen-Inject
    const iAqZ  = findKpi(map, 'Auflegerquote', Z);
    const iCsZ  = findKpi(map, 'CS', Z);
    const iTnZ  = findKpi(map, 'TNPS', Z);
    const iFqZ  = findKpi(map, 'TNPS Antwortquote %', Z);
    const iDdsZ = findKpi(map, 'TNPS Deep Detractor %', Z);
    const iFtfZ = findKpi(map, 'First-Time-Fix', Z);
    // NENNER der Kern-KPIs — bis 29.07. fuer KEINE Kennzahl geholt. Zwei Folgen:
    //  1) Ohne Nenner kann das Dashboard "0 % bei 5 Tickets" (echt schlecht) nicht
    //     von "gar keine Tickets" (keine Basis) unterscheiden und schreibt eine
    //     harte 0. Bei First-Time-Fix betraf das 189 von 520 Agenten.
    //  2) Die GESAMT-Zeile musste die Agenten-Prozente arithmetisch mitteln,
    //     statt korrekt Summe(Zaehler)/Summe(Nenner) zu rechnen.
    const iAqN  = findKpi(map, 'Auflegerquote', 'Nenner');
    const iCsN  = findKpi(map, 'CS', 'Nenner');
    const iTnN  = findKpi(map, 'TNPS', 'Nenner');
    const iFqN  = findKpi(map, 'TNPS Antwortquote %', 'Nenner');
    const iDdsN = findKpi(map, 'TNPS Deep Detractor %', 'Nenner');
    const iFtfN = findKpi(map, 'First-Time-Fix', 'Nenner');
    const iTotFixN = findKpi(map, 'Total-Fix', 'Nenner');
    const iFf7N = findKpi(map, 'Final Fix 7', 'Nenner');

    // NPS-Kategorien: 1. Vorkommen = CS-Basis, 2. Vorkommen = TNPS-Basis
    const iPromCs   = findKpi(map, 'Promotoren', 'Kennzahl', 1);
    const iDetrCs   = findKpi(map, 'Detraktoren', 'Kennzahl', 1);
    const iNeutCs   = findKpi(map, 'Neutrale', 'Kennzahl', 1);
    const iPromTnps = findKpi(map, 'Promotoren', 'Kennzahl', 2);
    const iDetrTnps = findKpi(map, 'Detraktoren', 'Kennzahl', 2);
    const iNeutTnps = findKpi(map, 'Neutrale', 'Kennzahl', 2);

    // Weiterleitungen + Final Fix (falls eingeblendet)
    const iWq  = findKpi(map, 'Weiterl.-Quote Skill<>', 'Kennzahl');
    const iFf7 = findKpi(map, 'Final Fix 7', 'Kennzahl');

    const rows = table.querySelectorAll('tbody tr');
    const kpis = [];

    rows.forEach(row => {
      try {
        const cells = row.querySelectorAll('td');
        if (!cells.length) return;

        let ccsId = iCcs >= 0 ? cellText(cells, iCcs) : '';
        const nameCell = iName >= 0 ? cells[iName] : null;
        const nameLink = nameCell ? nameCell.querySelector('a') : null;
        if (!ccsId && nameLink) {
          const m = nameLink.href.match(/user_id=(\d+)/);
          if (m) ccsId = m[1];
        }
        const agentName = nameLink ? cleanText(nameLink.textContent)
                                   : (nameCell ? cleanText(nameCell.textContent) : '');
        if (!ccsId || !agentName) return;

        const callCount = (iCalls >= 0 ? cellNum(cells, iCalls) : cellNum(cells, iCallsAcd)) || 0;

        kpis.push({
          ccsId, agentName,
          standort: cellText(cells, iStd),
          team:     cellText(cells, iTeam),
          datum:    iDatum >= 0 ? cellText(cells, iDatum) : '',
          callCount,
          // Zeiten (Sekunden)
          acdSec:  iAcdKz  >= 0 ? timeToSec(cellText(cells, iAcdKz))  : null,
          acwSec:  iAcwKz  >= 0 ? timeToSec(cellText(cells, iAcwKz))  : null,
          ahtSec:  iAhtKz  >= 0 ? timeToSec(cellText(cells, iAhtKz))  : null,
          achtSec: iAchtKz >= 0 ? timeToSec(cellText(cells, iAchtKz)) : null,
          // Quoten
          auflegerquote: cellNum(cells, iAq),
          cs:    cellNum(cells, iCs),
          csDds: cellNum(cells, iCsDds),   // CS Deep Detractor %
          tnps:  cellNum(cells, iTnps),
          fq:    cellNum(cells, iFq),      // TNPS Antwortquote %
          dds:   cellNum(cells, iDds),     // TNPS Deep Detractor %
          ftf:      cellNum(cells, iFtf),    // First-Time-Fix
          totalFix: cellNum(cells, iTotFix), // Total-Fix
          ff7:   cellNum(cells, iFf7),
          wq:    cellNum(cells, iWq),      // Weiterl.-Quote Skill<>
          // Zaehler (fuer die "Zaehler"-Spalten im Stand-Export)
          aqZ:   cellNum(cells, iAqZ),
          csZ:   cellNum(cells, iCsZ),
          tnpsZ: cellNum(cells, iTnZ),
          fqZ:   cellNum(cells, iFqZ),
          ddsZ:  cellNum(cells, iDdsZ),
          ftfZ:  cellNum(cells, iFtfZ),
          // Nenner = Bezugsmenge. Ist er 0, gibt es keine Basis: dann ist die
          // Kennzahl "keine Angabe" und NICHT "0 %".
          aqN:   cellNum(cells, iAqN),
          csN:   cellNum(cells, iCsN),
          tnpsN: cellNum(cells, iTnN),
          fqN:   cellNum(cells, iFqN),
          ddsN:  cellNum(cells, iDdsN),
          ftfN:  cellNum(cells, iFtfN),
          totalFixN: cellNum(cells, iTotFixN),
          ff7N:  cellNum(cells, iFf7N),
          // NPS-Kategorien (Anzahlen)
          promCs:   cellNum(cells, iPromCs),
          detCs:    cellNum(cells, iDetrCs),
          neutCs:   cellNum(cells, iNeutCs),
          promTnps: cellNum(cells, iPromTnps),
          detTnps:  cellNum(cells, iDetrTnps),
          neutTnps: cellNum(cells, iNeutTnps),
          // Kompatibilitaet: "det" = CS-Detraktoren (wie Crawler v2, 1. Gruppe)
          det: cellNum(cells, iDetrCs),
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        console.error('[KPI Crawler] Fehler beim Parsen einer Zeile:', err);
      }
    });
    return kpis;
  }

  // ---------- Tages-Historie (localStorage am Liga-Origin) ----------
  function loadHistory(){
    try { return JSON.parse(localStorage.getItem('rcLigaHistory') || '{}'); } catch(e){ return {}; }
  }
  function saveHistory(h){
    try {
      Object.keys(h).sort().slice(0, -HISTORY_DAYS).forEach(k => delete h[k]);
      localStorage.setItem('rcLigaHistory', JSON.stringify(h));
    } catch(e){
      // localStorage voll (Quota): aelteste Tage abwerfen und erneut versuchen
      try {
        const keys = Object.keys(h).sort();
        keys.slice(0, Math.max(1, keys.length - 10)).forEach(k => delete h[k]);
        localStorage.setItem('rcLigaHistory', JSON.stringify(h));
        console.warn('[KPI Crawler] localStorage-Quota: Historie auf die letzten 10 Tage gekuerzt.');
      } catch(e2){ console.warn('[KPI Crawler] Historie konnte nicht gespeichert werden:', e2); }
    }
  }
  // Kompakter Tages-Snapshot: Summen je Standort + gesamt (Mittel spaeter daraus)
  // + byAgent: kompakte Tageswerte je CCS-ID — Datenbasis fuer die
  //   Agenten-Wochentrends im Dashboard (Detail-Modal)
  function snapshotOf(kpis){
    const byStd = {}, byAgent = {}, tot = { calls:0, csSum:0, csN:0, tnpsSum:0, tnpsN:0, ahtSum:0, ahtN:0, det:0, agents:0 };
    kpis.forEach(k => {
      const s = byStd[k.standort] || (byStd[k.standort] = { calls:0, csSum:0, csN:0, tnpsSum:0, tnpsN:0, ahtSum:0, ahtN:0, det:0, agents:0 });
      [s, tot].forEach(o => {
        o.calls += k.callCount || 0; o.agents++;
        if (k.cs   != null) { o.csSum   += k.cs;     o.csN++; }
        if (k.tnps != null) { o.tnpsSum += k.tnps;   o.tnpsN++; }
        if (k.ahtSec != null && k.ahtSec > 0) { o.ahtSum += k.ahtSec; o.ahtN++; }
        o.det += k.det || 0;
      });
      // kompakt (kurze Schluessel, null-Werte weggelassen) — localStorage-schonend
      const a = { c: k.callCount || 0 };
      if (k.cs   != null) a.cs  = k.cs;
      if (k.tnps != null) a.tn  = k.tnps;
      if (k.ahtSec != null) a.aht = k.ahtSec;
      if (k.fq   != null) a.fq  = k.fq;
      if (k.dds  != null) a.dds = k.dds;
      if (k.auflegerquote != null) a.aq = k.auflegerquote;
      if (k.det) a.det = k.det;
      // fuer den Vortags-"Stand"-Export: FTF + Zaehler der Kern-KPIs
      if (k.ftf  != null) a.ftf = k.ftf;
      if (k.aqZ  != null) a.za = k.aqZ;
      if (k.csZ  != null) a.zc = k.csZ;
      if (k.tnpsZ != null) a.zt = k.tnpsZ;
      if (k.fqZ  != null) a.zf = k.fqZ;
      if (k.ddsZ != null) a.zd = k.ddsZ;
      if (k.ftfZ != null) a.zx = k.ftfZ;
      // Nenner mitspeichern (kurze Schluessel n*): ohne sie kann der Vortags-Export
      // "keine Basis" nicht von "0 %" unterscheiden — derselbe Fehler wie live.
      if (k.aqN  != null) a.na = k.aqN;
      if (k.csN  != null) a.nc = k.csN;
      if (k.tnpsN != null) a.nt = k.tnpsN;
      if (k.fqN  != null) a.nf = k.fqN;
      if (k.ddsN != null) a.nd = k.ddsN;
      if (k.ftfN != null) a.nx = k.ftfN;
      if (k.detTnps != null) a.dt = k.detTnps;   // TNPS-Detraktoren (siehe unten)
      byAgent[k.ccsId] = a;
    });
    return { byStd, tot, byAgent };
  }
  function storeSnapshot(dateStr, kpis){
    if (!kpis.length) return;
    const h = loadHistory();
    h[dateStr] = snapshotOf(kpis);
    saveHistory(h);
    console.log('[KPI Crawler] Tages-Snapshot gespeichert fuer ' + dateStr + ' (' + kpis.length + ' Agenten)');
  }
  // Wie storeSnapshot, aber es bleibt stehen, was NICHT in den neuen Daten steckt.
  // Gebraucht fuer den Monatslauf, der nur EINEN Standort holt: er darf die Tage
  // des Wochenlaufs (alle Standorte) nicht plattmachen. Nur die Standorte, die in
  // kpis vorkommen, werden ersetzt — nicht addiert, sonst zaehlt ein zweiter Lauf
  // desselben Tages doppelt.
  function mergeSnapshot(dateStr, kpis){
    if (!kpis.length) return;
    const h = loadHistory();
    const alt = h[dateStr];
    if (!alt || !alt.byStd || !alt.byAgent) { h[dateStr] = snapshotOf(kpis); saveHistory(h);
      console.log('[KPI Crawler] Tages-Snapshot angelegt fuer ' + dateStr + ' (' + kpis.length + ' Agenten)');
      return; }
    const neu = snapshotOf(kpis);
    const byStd = Object.assign({}, alt.byStd, neu.byStd);
    const byAgent = Object.assign({}, alt.byAgent, neu.byAgent);
    const tot = { calls:0, csSum:0, csN:0, tnpsSum:0, tnpsN:0, ahtSum:0, ahtN:0, det:0, agents:0 };
    Object.keys(byStd).forEach(s => { const o = byStd[s];
      Object.keys(tot).forEach(f => { tot[f] += (o[f] || 0); }); });
    h[dateStr] = { byStd, tot, byAgent };
    saveHistory(h);
    console.log('[KPI Crawler] Tages-Snapshot ergaenzt fuer ' + dateStr + ' (' + kpis.length +
      ' Agenten aus ' + Object.keys(neu.byStd).join('/') + ', gesamt ' + Object.keys(byAgent).length + ')');
  }

  // ---------- Senden (3 Kanaele) ----------
  // liveDaterange sagt dem Dashboard, WAS die payload ist (intraday = echte Live-
  // Daten; yesterday/last_week/... = die Seite steht auf einem anderen Zeitraum).
  function currentDaterange(){
    const dSel = document.getElementById('daterange-list');
    return dSel ? (dSel.value || '') : '';
  }
  function sendKpis(kpis, liveDr) {
    // Standort-Auswahl mitschicken: das Dashboard kann sonst nicht erkennen, ob ein
    // Standort echt keine Daten hat oder nur im Portal abgewaehlt ist (siehe
    // fetchDaterangeKpis / loc_inlist).
    const stdInDaten = [...new Set(kpis.map(k => (k.standort || '').trim()).filter(Boolean))].sort();
    const msg = { type: 'KPI_BATCH', payload: kpis, history: loadHistory(),
                  liveDaterange: (liveDr !== undefined) ? liveDr : currentDaterange(),
                  locInlist: window.__rcLocInlist || null,
                  alleStandorte: alleStandorteAn(),
                  standorteInDaten: stdInDaten };
    let ziele = [];
    try { channel.postMessage(msg); ziele.push('BroadcastChannel'); } catch(e){}
    try {
      if (window.opener && !window.opener.closed) { window.opener.postMessage(msg, '*'); ziele.push('opener'); }
    } catch(e){}
    try {
      if (window.rcDashWin && !window.rcDashWin.closed) { window.rcDashWin.postMessage(msg, '*'); ziele.push('dashWin'); }
    } catch(e){}
    console.log(`[KPI Crawler] ${kpis.length} Datensaetze gesendet via: ${ziele.join(', ') || 'KEIN ZIEL'}`);
    if (!ziele.includes('opener') && !ziele.includes('dashWin')) {
      console.warn('[KPI Crawler] Kein Dashboard-Fenster erreichbar. Ligaliste bitte ueber den "KPI-Quelle"-Button IM DASHBOARD oeffnen.');
    }
    // Eingeschraenkte Standort-Auswahl laut melden — sie faellt sonst NIE auf.
    // Geprueft wird der GESPEICHERTE Schalter (alleStandorteAn), nicht eine
    // window-Variable: die frueher hier abgefragte window.rcCrawlerAlleStd wurde
    // nirgends gesetzt, die Warnung kam also bei JEDEM Sendevorgang — auch wenn
    // laengst alle Standorte geholt wurden.
    const li = window.__rcLocInlist;
    if (li && li.length && !alleStandorteAn()) {
      console.warn('[KPI Crawler] ACHTUNG: Die Ligaliste ist im Portal auf ' + li.length +
        ' Standort(e) eingeschraenkt: ' + li.join(', ') +
        '\n  Alle anderen Standorte fehlen im Dashboard, ohne dass es dort auffaellt.' +
        '\n  Abhilfe: im Portal ALLE Standorte markieren, oder rcCrawlerAlleStandorte(true) ausfuehren.');
    }
  }

  // ---------- Seite selbst aktualisieren ----------
  function findOkButton(){
    const direct = document.getElementById('ok-button');
    if (direct) return direct;
    const btns = document.querySelectorAll('button, input[type="submit"]');
    for (const b of btns) {
      const t = cleanText(b.innerText || b.value || '');
      if (/^ok$/i.test(t) || (/\bok\b/i.test(t) && t.length <= 6)) return b;
    }
    return null;
  }
  function triggerPageRefresh() {
    const b = findOkButton();
    if (b) { try { b.click(); console.log('[KPI Crawler] Seiten-Refresh ausgeloest'); return true; } catch(e){} }
    console.warn('[KPI Crawler] Kein Ok-Button gefunden — Daten koennten veraltet sein');
    return false;
  }

  // Sorgt dafuer, dass die Original-get_data.rb-Anfrage (mit Sicherheits-Token)
  // MITGESCHNITTEN ist. Ohne diesen Token lehnt der Server jede Anfrage ab, und der
  // Token laesst sich nicht nachbauen — nur abfangen, wenn die SEITE selbst laedt.
  // Deshalb loesen wir bis zu `tries` mal einen echten "Ok"-Klick aus und pollen je
  // Versuch, bis window.__rcLastGetData.body vorliegt. Der Klick laedt nur die
  // aktuelle (Intraday-)Ansicht neu -> keine Stoerung der Live-Sicht.
  async function ensureCapture(tries){
    if (window.__rcLastGetData && window.__rcLastGetData.body) return true;
    tries = tries || 3;
    for (let i = 0; i < tries; i++) {
      // NICHT dazwischenklicken, waehrend ein anderer Lauf die Seite umgestellt
      // hat. Frueher fehlte diese Ruecksicht ganz: ensureCapture laeuft direkt
      // beim Start und klickt bis zu dreimal "Ok", waehrend sechs Sekunden
      // spaeter schon der Monatslauf beginnt, die Auswahlfelder zu verstellen.
      // Ein Ok-Klick in diesem Moment laedt die MONATS-Ansicht neu — und der
      // Live-Takt liest sie danach als Tagesstand.
      let wartete = 0;
      while (sperreHalter() && wartete < 60000) {
        await new Promise(r => setTimeout(r, 1000));
        wartete += 1000;
        // Zwischendurch kann der andere Lauf den Token laengst gesichert haben.
        if (window.__rcLastGetData && window.__rcLastGetData.body) return true;
      }
      triggerPageRefresh();
      for (let w = 0; w < 20; w++) { // bis ~12 s je Versuch, in 600ms-Schritten
        await new Promise(r => setTimeout(r, 600));
        if (window.__rcLastGetData && window.__rcLastGetData.body) {
          console.log('[KPI Crawler] Original-Anfrage (Token) nach ' + (i+1) + '. Ok-Klick gesichert.');
          return true;
        }
      }
    }
    return !!(window.__rcLastGetData && window.__rcLastGetData.body);
  }

  // Geparste Zeilen dem RICHTIGEN Tag zuordnen und speichern.
  // NIE blind als "heute" ablegen: die Seite kann auf "Gestern"/Woche stehen
  // (daterange-Select) — dann landeten Gestern-Werte als Heute im Dashboard.
  function storeByDate(kpis){
    const withDate = kpis.filter(k => datumKey(k.datum));
    if (withDate.length) {
      const byDay = {};
      withDate.forEach(k => { const key = datumKey(k.datum); (byDay[key] || (byDay[key] = [])).push(k); });
      Object.keys(byDay).forEach(key => storeSnapshot(key, byDay[key]));
      return Object.keys(byDay).sort();
    }
    const dr = currentDaterange();
    if (dr === '' || dr === 'intraday' || dr === 'today') { storeSnapshot(dayKey(new Date()), kpis); return [dayKey(new Date())]; }
    if (dr === 'yesterday') { const g = dayKey(new Date(Date.now() - 86400000)); storeSnapshot(g, kpis); return [g]; }
    console.warn('[KPI Crawler] Tabelle zeigt "' + dr + '" ohne Datum-Spalte — Snapshot uebersprungen (kein Tag zuordenbar).');
    return [];
  }

  // ---------- EINE Sperre fuer ALLE Pfade, die die Seite anfassen ----------
  // Vorher gab es nur `busy` — eine Variable INNERHALB dieser Kapsel, die
  // AUSSCHLIESSLICH pollKpis gelesen hat. Der Monats- und der Wochenlauf, der
  // Bereichs-Harvest, das Dashboard-Kommando und die Token-Sicherung haben sie
  // nie beachtet. Sie konnten also jederzeit gleichzeitig die Auswahlfelder
  // umstellen und "Ok" klicken, waehrend ein anderer Lauf noch arbeitete.
  // Genau daher ruehrt das Bild, dass sich die Ligaliste "jedes Mal anders
  // abklickt": mal blieb sie auf Monat/kumuliert stehen, mal auf Woche/Tag, und
  // der Live-Poll las zwischendurch eine Tabelle, die zu einem ganz anderen
  // Zeitraum gehoerte.
  // Zweiter Fehler derselben Bauart: `busy` lag in der Kapsel. Ein zweites
  // Einspielen in dieselbe Seite brachte eine zweite, voellig unabhaengige
  // Sperre mit — dedupliziert wurde nur der Takt-Zeitgeber.
  // Deshalb jetzt: EINE Sperre am Fenster, die JEDER Pfad halten muss, der die
  // Seite verstellt ODER die DOM-Tabelle liest. Mit Zeitstempel, damit eine
  // nach einem Ausnahmefall vergessene Sperre von selbst verfaellt und der
  // Crawler nicht fuer immer stillsteht.
  const SPERRE_VERFALL_MS = 180000;   // 3 Minuten: laenger dauert kein Lauf
  function sperreNehmen(wer) {
    const s = window.__rcLigaSperre;
    if (s && (Date.now() - s.ts) < SPERRE_VERFALL_MS) return false;
    if (s) console.warn('[KPI Crawler] Sperre von "' + s.wer + '" ist verfallen (' +
      Math.round((Date.now() - s.ts) / 1000) + ' s) — "' + wer + '" uebernimmt.');
    window.__rcLigaSperre = { wer: wer, ts: Date.now() };
    return true;
  }
  function sperreGeben(wer) {
    const s = window.__rcLigaSperre;
    if (s && s.wer !== wer) return;    // fremde Sperre nie anfassen
    window.__rcLigaSperre = null;
  }
  function sperreHalter() {
    const s = window.__rcLigaSperre;
    return (s && (Date.now() - s.ts) < SPERRE_VERFALL_MS) ? s.wer : null;
  }
  window.rcCrawlerSperre = function () {
    const h = sperreHalter();
    console.log(h ? '[KPI Crawler] Die Seite ist gerade belegt von: ' + h
                  : '[KPI Crawler] Seite frei.');
    return h;
  };

  // Live-Takt. Mit mitgeschnittenem Token laeuft das KOMPLETT an der Seite vorbei:
  // ein direkter intraday-Request, kein Ok-Klick, keine Select-Aenderung. Damit
  // kann der Crawler die Ansicht des Nutzers gar nicht mehr verstellen — genau die
  // Nebenwirkung, die frueher "wie von selbst" den Zeitraum umgeschaltet hat.
  // Ohne Token bleibt der bisherige Weg (Ok-Klick + DOM-Tabelle lesen).
  function pollKpis(withRefresh) {
    if (!sperreNehmen('Live-Takt')) return;
    const hatToken = !!(window.__rcLastGetData && window.__rcLastGetData.body);

    const viaReplay = async () => {
      const res = await fetchDaterangeKpis('intraday');   // interval=cumulate (ein Tag)
      if (!res.kpis || !res.kpis.length) return false;
      storeByDate(res.kpis);
      sendKpis(res.kpis, 'intraday');
      return true;
    };

    const doParse = async () => {
      try {
        // Bevorzugt: Live-Zahlen direkt anfordern, ohne die Seite anzufassen.
        if (hatToken) {
          try { if (await viaReplay()) return; }
          catch(e){ console.warn('[KPI Crawler] Intraday-Replay fehlgeschlagen, lese DOM-Tabelle:', e); }
        }
        let kpis = parseKpiTable();
        if (!kpis.length) { console.warn('[KPI Crawler] Keine Daten gefunden'); return; }
        storeByDate(kpis);
        const liveDr = currentDaterange();
        sendKpis(kpis, liveDr);
      } finally { sperreGeben('Live-Takt'); }
    };

    // Der Ok-Klick ist nur noetig, wenn wir wirklich die DOM-Tabelle brauchen.
    if (withRefresh && !hatToken && triggerPageRefresh()) setTimeout(doParse, REFRESH_WAIT);
    else doParse();
  }

  // Ein Select robust setzen (nativ ODER via Wert; feuert change-Event)
  // Ein Select robust setzen: erst per value, sonst per Label-Regex (falls die
  // Ligaliste-Version andere Werte/Beschriftungen nutzt, z.B. "Tag" vs "taeglich").
  function setSelect(sel, val, labelRe){
    if (!sel) return false;
    let opt = [...sel.options].find(o => o.value === val);
    if (!opt && labelRe) opt = [...sel.options].find(o => labelRe.test((o.textContent || '').trim()));
    if (!opt) { console.warn('[KPI Crawler] Select-Option nicht gefunden: ' + val + (labelRe ? ' / ' + labelRe : '')); return false; }
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    // manche Widgets hoeren zusaetzlich auf input/click der Option
    try { sel.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){}
    return true;
  }

  // Intervall "Tag" setzen — DER kritische Punkt im UI-Weg.
  // Solange der Zeitraum auf "Intraday" steht, hat #interval-list NUR die Option
  // "kumuliert"; "Tag"/"Kalenderwoche"/"Monat" haengt die Ligaliste erst nach,
  // NACHDEM ein mehrtaegiger Zeitraum gewaehlt wurde. Wer (wie bisher) erst das
  // Intervall und dann den Zeitraum setzt, waehlt ins Leere: es bleibt bei
  // "kumuliert", die Antwort hat keine Datum-Spalte und der ganze Tages-Harvest
  // laeuft ins Nichts. Also: Zeitraum zuerst, dann hier auf "Tag" WARTEN.
  async function waitForIntervalDay(iSel, maxMs){
    if (!iSel) return false;
    const bis = maxMs || 6000;
    for (let t = 0; t < bis; t += 250) {
      if ([...iSel.options].some(o => o.value === 'day')) {
        const ok = setSelect(iSel, 'day', /^tag$/i);
        if (ok) return true;
      }
      await new Promise(r => setTimeout(r, 250));
    }
    console.warn('[KPI Crawler] Intervall "Tag" erschien nicht in der Auswahl — Zeitraum zuerst setzen. Tages-Aufschluesselung nicht moeglich.');
    return false;
  }

  // ---------- Tabelle aus einer Text-/JSON-Antwort ziehen ----------
  // get_data.rb liefert je nach Modus HTML (Tabelle) oder JSON mit HTML-Feld.
  function extractTableHtml(text){
    const t = (text || '').trim();
    if (!t) return null;
    if (t[0] === '{' || t[0] === '[') {
      try {
        const j = JSON.parse(t);
        const findHtml = (o, d) => {
          if (d > 5 || o == null) return null;
          if (typeof o === 'string') return /<t(able|body|r)\b/i.test(o) ? o : null;
          if (Array.isArray(o)) { for (const v of o){ const r = findHtml(v, d+1); if (r) return r; } return null; }
          if (typeof o === 'object') { for (const k in o){ const r = findHtml(o[k], d+1); if (r) return r; } return null; }
          return null;
        };
        return findHtml(j, 0);
      } catch(e){ return null; }
    }
    return /<t(able|body|r)\b/i.test(t) ? t : null;
  }

  // ---------- Standort-Auswahl: WIE genau schreibt man "alle" in den Request? ----------
  // Gemessen am echten Portal (Steckbrief 31.07.2026) sieht die Original-Anfrage
  // bei EINEM gewaehlten Standort so aus:
  //     loc_inlist        = Alanya
  //     loc_inlist_c      = Alanya          <- Spiegel-Liste, wurde bisher NIE angefasst
  //     cumulate_locations= 0
  //     all_locations_selected = false      <- Flag, wurde bisher NIE angefasst
  // Und fuer die Teams, wo tatsaechlich "alle" gewaehlt war:
  //     teamid_inlist     = (leer)
  //     all_teams_selected = true           <- leer + Flag true = ALLE
  //
  // Der Crawler hat bisher NUR loc_inlist beschrieben und die Spiegel-Liste samt
  // Flag stehen lassen. Ob das Portal das vertraegt, ist nicht belegt — und die
  // Meldung "Mit expliziter Standortliste kam nichts zurueck (keine-tabelle)"
  // spricht dagegen. Statt eine Variante zu RATEN, werden sie der Reihe nach
  // ausprobiert; die erste, die Zeilen liefert, wird gemerkt und danach direkt
  // benutzt. Das kostet einmalig ein paar Anfragen und ist danach kostenlos.
  const LOC_VARIANTEN = [
    { id: 'liste+spiegel+flag', text: 'Liste, Spiegel-Liste und "alle"-Flag gesetzt' },
    { id: 'liste',              text: 'nur die Liste (bisheriger Weg)' },
    { id: 'liste+spiegel',      text: 'Liste und Spiegel-Liste, Flag unveraendert' },
    { id: 'leer+flag',          text: 'Listen leer, "alle"-Flag true (so macht es das Portal bei den Teams)' }
  ];
  const LS_LOC_VARIANTE = 'rcCrawlerLocVariante';
  function locVariante(){
    try {
      const v = localStorage.getItem(LS_LOC_VARIANTE);
      if (v && LOC_VARIANTEN.some(x => x.id === v)) return v;
    } catch (e) {}
    return LOC_VARIANTEN[0].id;
  }
  function locVarianteMerken(id){
    try { localStorage.setItem(LS_LOC_VARIANTE, id); } catch (e) {}
  }
  // Schreibt die Standort-Auswahl nach der gewaehlten Variante in die Parameter.
  // `alleGewaehlt` stimmt nur, wenn wirklich die komplette Liste der Seite gemeint
  // ist — bei einer gezielten Teilauswahl (Monatslauf: nur Alanya) waere das Flag
  // schlicht gelogen.
  function locSetzen(params, standorte, variante){
    const alleDaSind = alleStandorte();
    const alleGewaehlt = standorte.length >= alleDaSind.length &&
                         alleDaSind.every(s => standorte.indexOf(s) !== -1);
    // Die Spiegel-Liste NUR anfassen, wenn die Variante das auch vorsieht.
    // Sie einfach zu loeschen waere eine eigene, ungewollte Schreibweise —
    // gemessen im Offline-Test: bei "nur die Liste" kam loc_inlist_c leer heraus
    // statt auf seinem Ausgangswert zu bleiben.
    const spiegelVorher = params.getAll('loc_inlist_c').filter(Boolean);
    const setztSpiegel = (variante === 'liste+spiegel' || variante === 'liste+spiegel+flag' || variante === 'leer+flag');
    params.delete('loc_inlist'); params.delete('loc_inlist[]');
    if (setztSpiegel) { params.delete('loc_inlist_c'); params.delete('loc_inlist_c[]'); }
    if (variante === 'leer+flag' && alleGewaehlt) {
      // Listen bleiben leer — das Flag sagt "alle". Genau so macht es das Portal
      // selbst bei den Teams (teamid_inlist leer + all_teams_selected=true).
      params.set('all_locations_selected', 'true');
    } else {
      standorte.forEach(s => params.append('loc_inlist', s));
      if (variante === 'liste+spiegel' || variante === 'liste+spiegel+flag') {
        standorte.forEach(s => params.append('loc_inlist_c', s));
      } else if (setztSpiegel) {
        spiegelVorher.forEach(s => params.append('loc_inlist_c', s));   // unveraendert lassen
      }
      if (variante === 'liste+spiegel+flag') {
        params.set('all_locations_selected', alleGewaehlt ? 'true' : 'false');
      }
    }
    window.__rcLocGesetzt = standorte;
    window.__rcLocVariante = variante;
  }

  // Einen Zeitraum direkt anfordern (get_data.rb nachstellen) -> geparste KPI-Zeilen
  // daterangeVal: 'current_month' | 'intraday' | 'user_defined' | ...
  // opts.startdate/enddate: nur fuer user_defined (Format YYYYMMDD, siehe harvestRangeApi)
  // opts.interval: 'day' (Default, liefert die Datum-Spalte) oder 'cumulate'.
  //   WICHTIG: intraday ist ein TAG — dort waere interval=day sinnlos, das Portal
  //   soll die laufende Summe liefern. Deshalb dort immer 'cumulate'.
  async function fetchDaterangeKpis(daterangeVal, opts){
    const cap = window.__rcLastGetData;
    if (!cap || !cap.body) return { kpis:null, reason:'kein-request' };
    const params = new URLSearchParams(cap.body);
    const iv = (opts && opts.interval) ? opts.interval
             : ((daterangeVal === 'intraday' || daterangeVal === 'today') ? 'cumulate' : 'day');
    params.set('daterange', daterangeVal);
    params.set('interval', iv);
    params.set('startdate', (opts && opts.startdate) ? opts.startdate : 'undefined');
    params.set('enddate',   (opts && opts.enddate)   ? opts.enddate   : 'undefined');
    // ---- Standort-Auswahl (loc_inlist) ----
    // Der Body wuerde sonst 1:1 uebernommen — inklusive der Standort-Auswahl, die
    // im Portal gerade gesetzt ist. Sind dort nicht alle Standorte markiert,
    // fehlen sie DAUERHAFT und ohne Warnung im Dashboard (Befund 28.07.2026:
    // Neubrandenburg 1985 Calls, Sakarya 876, regiocom_W_Home 78 fehlten still).
    //
    // Seit 30.07. ist "alle Standorte" der VORGABEWERT (Nutzer-Wunsch). Gesetzt
    // wird die Liste EXPLIZIT — nicht per delete. Ein leeres loc_inlist als
    // "keine Filterung" zu deuten war nur eine Annahme; belegt ist im Projekt der
    // umgekehrte Weg (Ligaliste_Crawler.html haengt jeden Standort einzeln an).
    // Mit rcCrawlerAlleStandorte(false) laesst sich wieder die Portal-Auswahl
    // uebernehmen; die Entscheidung ueberlebt einen Seitenwechsel.
    // opts.standorte begrenzt die Abfrage gezielt auf einzelne Standorte. Genutzt
    // vom Monatslauf: aktueller Monat x Tagesbasis x ALLE Standorte ist so viel
    // Last, dass die Ligalisten-Seite haengen bleibt (Nutzer-Befund 30.07.).
    window.__rcLocInlist = params.getAll('loc_inlist').filter(Boolean);
    const originalLoc = params.getAll('loc_inlist').filter(Boolean);
    const originalLocC = params.getAll('loc_inlist_c').filter(Boolean);
    const originalAlleFlag = params.get('all_locations_selected');
    const nurDiese = (opts && Array.isArray(opts.standorte) && opts.standorte.length) ? opts.standorte : null;
    const zielStandorte = nurDiese ? nurDiese : (alleStandorteAn() ? alleStandorte() : null);
    if (zielStandorte) locSetzen(params, zielStandorte, locVariante());

    // Ein Versuch; bei leerem Ergebnis wird EINMAL mit der urspruenglichen
    // Standort-Auswahl wiederholt. Grund: die Standort-Namen sind geraten, sobald
    // sie nicht aus der Seite kommen (Rueckfall-Liste). Passt einer nicht, liefert
    // das Portal eine leere Tabelle — und ohne diesen Rueckweg staende das
    // Dashboard komplett ohne Liga-Daten da, schlechter als vorher.
    async function einVersuch(p){
      let r;
      try {
        r = await fetch(cap.url, { method:'POST', credentials:'include',
          headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8', 'accept':'*/*', 'x-requested-with':'XMLHttpRequest' },
          body: p.toString() });
      } catch(e){ return { kpis:null, reason:'fetch-fehler:'+e }; }
      if (!r.ok) return { kpis:null, reason:'HTTP '+r.status };
      const text = await r.text();
      const html = extractTableHtml(text);
      if (!html) return { kpis:null, reason:'keine-tabelle', sample:text.slice(0,300) };
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const table = doc.querySelector('table#result-table') || doc.querySelector('table');
      if (!table) return { kpis:null, reason:'kein-table-element' };
      return { kpis: parseKpiTable(table) };
    }

    let res = await einVersuch(params);
    if (res.kpis && res.kpis.length) {
      // Hat geklappt — die benutzte Schreibweise ist also die richtige.
      if (zielStandorte) locVarianteMerken(window.__rcLocVariante);
      return res;
    }

    // Nichts zurueckgekommen. Vorher wurde hier EINMAL auf die Portal-Auswahl
    // zurueckgefallen — damit lief das Dashboard zwar weiter, aber dauerhaft mit
    // nur EINEM Standort, und niemand erfuhr, woran es lag. Jetzt werden die
    // uebrigen Schreibweisen der Standort-Auswahl der Reihe nach probiert. Die
    // erste, die Zeilen liefert, wird gemerkt und ab dann sofort benutzt.
    if (zielStandorte) {
      const schonProbiert = window.__rcLocVariante;
      for (const v of LOC_VARIANTEN) {
        if (v.id === schonProbiert) continue;
        const p2 = new URLSearchParams(params.toString());
        // Ausgangszustand der Standort-Parameter wiederherstellen, sonst mischen
        // sich die Schreibweisen.
        p2.delete('loc_inlist'); p2.delete('loc_inlist[]');
        p2.delete('loc_inlist_c'); p2.delete('loc_inlist_c[]');
        originalLocC.forEach(s => p2.append('loc_inlist_c', s));
        if (originalAlleFlag != null) p2.set('all_locations_selected', originalAlleFlag);
        else p2.delete('all_locations_selected');
        locSetzen(p2, zielStandorte, v.id);
        const r2 = await einVersuch(p2);
        if (r2.kpis && r2.kpis.length) {
          locVarianteMerken(v.id);
          console.log('[KPI Crawler] Standort-Auswahl: die Schreibweise "' + v.text + '" liefert Daten (' +
            r2.kpis.length + ' Zeilen) — sie wird ab jetzt benutzt.');
          return r2;
        }
      }
      // Keine Schreibweise hat funktioniert -> zurueck auf die Portal-Auswahl,
      // damit wenigstens Daten fliessen.
      console.warn('[KPI Crawler] Keine der ' + LOC_VARIANTEN.length + ' Schreibweisen fuer die Standort-Auswahl ' +
        'lieferte Daten (' + (res.reason || '0 Zeilen') + ') — zurueck auf die Auswahl, die im Portal eingestellt ist.');
      const zurueck = new URLSearchParams(params.toString());
      zurueck.delete('loc_inlist'); zurueck.delete('loc_inlist[]');
      zurueck.delete('loc_inlist_c'); zurueck.delete('loc_inlist_c[]');
      originalLoc.forEach(s => zurueck.append('loc_inlist', s));
      originalLocC.forEach(s => zurueck.append('loc_inlist_c', s));
      if (originalAlleFlag != null) zurueck.set('all_locations_selected', originalAlleFlag);
      const res2 = await einVersuch(zurueck);
      if (res2.kpis && res2.kpis.length) {
        console.warn('[KPI Crawler] ACHTUNG: Es kommen nur die im Portal markierten Standorte (' +
          (originalLoc.join(', ') || 'keine Einschraenkung erkennbar') + '). ' +
          'Andere Standorte fehlen im Dashboard. Pruefen: rcCrawlerStandortTest()');
        return res2;
      }
    }
    return res;
  }

  // Alle Schreibweisen EINMAL durchprobieren und das Ergebnis zeigen. Fuer die
  // Fehlersuche gedacht — veraendert die Seite nicht, schickt nur Anfragen.
  window.rcCrawlerStandortTest = async function () {
    const cap = window.__rcLastGetData;
    if (!cap || !cap.body) { console.warn('[KPI Crawler] Keine Original-Anfrage mitgeschnitten — einmal "Ok" auf der Seite klicken.'); return null; }
    const alle = alleStandorte();
    console.log('[KPI Crawler] Teste ' + LOC_VARIANTEN.length + ' Schreibweisen fuer ' + alle.length + ' Standorte: ' + alle.join(', '));
    const ergebnis = [];
    for (const v of LOC_VARIANTEN) {
      const p = new URLSearchParams(cap.body);
      p.set('daterange', 'intraday'); p.set('interval', 'cumulate');
      p.set('startdate', 'undefined'); p.set('enddate', 'undefined');
      locSetzen(p, alle, v.id);
      let zeilen = 0, standorte = [], grund = '';
      try {
        const r = await fetch(cap.url, { method:'POST', credentials:'include',
          headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8', 'accept':'*/*', 'x-requested-with':'XMLHttpRequest' },
          body: p.toString() });
        const text = await r.text();
        const html = extractTableHtml(text);
        if (!html) { grund = 'keine Tabelle (HTTP ' + r.status + ')'; }
        else {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const tab = doc.querySelector('table#result-table') || doc.querySelector('table');
          const kpis = tab ? parseKpiTable(tab) : [];
          zeilen = kpis.length;
          standorte = [...new Set(kpis.map(k => k.standort).filter(Boolean))];
        }
      } catch (e) { grund = String(e); }
      ergebnis.push({ Schreibweise: v.text, Zeilen: zeilen, Standorte: standorte.length, Welche: standorte.join(', ') || grund });
      await new Promise(r => setTimeout(r, 800));
    }
    console.table(ergebnis);
    const beste = ergebnis.map((e, i) => ({ e, v: LOC_VARIANTEN[i] })).filter(x => x.e.Zeilen > 0)
      .sort((a, b) => b.e.Standorte - a.e.Standorte)[0];
    if (beste) {
      locVarianteMerken(beste.v.id);
      console.log('[KPI Crawler] Beste Schreibweise: "' + beste.v.text + '" (' + beste.e.Standorte +
        ' Standorte) — gemerkt, wird ab jetzt benutzt.');
    } else {
      console.warn('[KPI Crawler] KEINE Schreibweise lieferte Daten. Dann liegt es nicht an der Standort-Auswahl.');
    }
    return ergebnis;
  };

  // ---------- START-HISTORIE: EINMAL der aktuelle Monat auf Tagesbasis ----------
  // Ein einziger get_data.rb-Request mit daterange=current_month & interval=day.
  // Die Antwort hat eine Datum-Spalte und je Agent eine Zeile PRO TAG — damit ist
  // der ganze Monat in einem Rutsch abgedeckt. Vorher wurden fuenf Zeitraeume
  // durchprobiert (last_week, current_week, 3x user_defined), die sich ueberlappten
  // und teils nur Oracle-500er lieferten. Die Live-Ansicht der Seite bleibt dabei
  // voellig unberuehrt — es wird nichts umgestellt und nichts geklickt.
  async function harvestMonthDaily(){
    return harvestZeitraum(HARVEST_RANGE, MONATS_STANDORTE, 'Monat', true);
  }
  // Wochenlauf: derselbe Weg, aber current_week und ALLE Standorte. Die Woche ist
  // klein genug, dass die Seite das taeglich vertraegt.
  // KEIN DOM-Fallback: der klickt die Seite auf "Aktueller Monat" durch — also
  // genau die Abfrage, die haengen bleibt. Ohne Token wird der Wochenlauf lieber
  // uebersprungen und beim naechsten Mal erneut versucht.
  async function harvestWeekDaily(){
    return harvestZeitraum(WOCHEN_RANGE, null, 'Woche', false);
  }

  // Gemeinsamer Kern. standorte = null bedeutet "wie eingestellt" (i.d.R. alle).
  async function harvestZeitraum(range, standorte, titel, domFallback){
    const wo = standorte ? ' (nur ' + standorte.join(', ') + ')' : ' (alle Standorte)';
    const ich = titel + '-Harvest';
    // Der Ersatzweg hat seine EIGENE Sperre. Deshalb muss diese hier vorher
    // freigegeben werden — sonst blockiert sich der Crawler selbst.
    const ersatzweg = (grund) => {
      sperreGeben(ich);
      if (domFallback) return harvestMonthDailyDom();
      console.warn('[KPI Crawler] ' + titel + '-Harvest uebersprungen (' + grund + ') — kein DOM-Durchklick, das waere der teure Monatslauf.');
      return 0;
    };
    // Dieser Weg laeuft ueberwiegend an der Seite vorbei (reiner Request), fasst
    // sie aber an zwei Stellen doch an: der Ok-Klick zum Sichern des Tokens und
    // das Lesen der sichtbaren Tabelle am Ende. Beides darf nicht mit einem
    // laufenden Durchklick zusammenfallen.
    if (!sperreNehmen(ich)) {
      console.warn('[KPI Crawler] ' + titel + '-Harvest verschoben — die Seite ist gerade belegt von: ' + sperreHalter());
      return 0;
    }
    try {
      if (!window.__rcLastGetData) {
        console.log('[KPI Crawler] Warte auf Original-Datenanfrage der Seite (loese Refresh aus)...');
        triggerPageRefresh();
        await new Promise(r => setTimeout(r, REFRESH_WAIT));
      }
      if (!window.__rcLastGetData || !window.__rcLastGetData.body) {
        console.warn('[KPI Crawler] Keine get_data.rb-Anfrage mitgeschnitten.');
        return ersatzweg('kein Token');
      }

      const opts = { interval:'day' };
      if (standorte) opts.standorte = standorte;
      const res = await fetchDaterangeKpis(range, opts);
      if (!res.kpis) {
        console.warn('[KPI Crawler] ' + titel + wo + ': ' + res.reason + (res.sample ? '\n' + res.sample : ''));
        return ersatzweg(res.reason);
      }
      const byDay = {};
      res.kpis.forEach(k => { const key = datumKey(k.datum); if (key) (byDay[key] || (byDay[key] = [])).push(k); });
      if (!Object.keys(byDay).length) {
        console.warn('[KPI Crawler] ' + titel + wo + ': ' + res.kpis.length + ' Zeilen OHNE Datum-Spalte (interval=day hat nicht gegriffen).');
        return ersatzweg('keine Datum-Spalte');
      }

      const days = Object.keys(byDay).sort();
      // Beim Monatslauf NUR Alanya: die Tage duerfen die schon vorhandenen
      // Snapshots anderer Standorte nicht ueberschreiben, sondern muessen sich
      // dazumischen — sonst waere der Wochenlauf danach wirkungslos.
      days.forEach(key => standorte ? mergeSnapshot(key, byDay[key]) : storeSnapshot(key, byDay[key]));
      console.log('[KPI Crawler] ' + titel + '-Historie gespeichert' + wo + ': ' + days.length + ' Tag(e) aus EINEM Request (' +
        res.kpis.length + ' Zeilen) — ' + days.map(d => d + ' (' + byDay[d].length + ')').join(', '));
      // Live-Ansicht (intraday) unveraendert weitersenden — inkl. neuer Historie
      const live = parseKpiTable();
      sendKpis(live.length ? live : (byDay[days[days.length-1]] || []));
      sperreGeben(ich);
      return days.length;
    } catch(e){
      console.error('[KPI Crawler] ' + titel + '-Nachladung fehlgeschlagen:', e);
      try { return ersatzweg('Fehler'); } catch(e2){}
    } finally {
      // Doppelt freizugeben ist unschaedlich (sperreGeben prueft den Halter);
      // hier steht es als Sicherheitsnetz fuer jeden Ausstieg, den die Zweige
      // oben nicht selbst abdecken.
      sperreGeben(ich);
    }
  }
  // ---------- BEREICHS-HARVEST auf Kommando (Dashboard: "Zeitraum"-Button) ----------
  // Zwei Wege: (A) direkter get_data.rb-Replay (schnell, nur mit Token), (B) sich in
  // der echten UI "durchklicken" und die DOM-Tabelle ablesen (immer moeglich, ohne
  // Token). Der Wrapper waehlt automatisch — B greift, wenn A nicht kann/leer ist.
  async function harvestRange(fromIso, toIso){
    if (window.__rcLastGetData && window.__rcLastGetData.body) {
      const api = await harvestRangeApi(fromIso, toIso);
      if (api.days.length) return api;
      console.warn('[KPI Crawler] get_data.rb lieferte keine Tage — wechsle auf UI-Durchklick.');
    } else {
      console.log('[KPI Crawler] Kein mitgeschnittener Token — hole den Bereich per UI-Durchklick (ohne get_data.rb).');
    }
    return await harvestRangeDom(fromIso, toIso);
  }

  // ---------- Weg B: BEREICH ueber die UI "durchklicken" (ohne get_data.rb) ----------
  // Stellt Zeitraum (user_defined + flatpickr) und Intervall (Tag) in der echten
  // Ligaliste-UI ein, klickt "Ok", wartet auf den Neuaufbau und PARST DIE DOM-TABELLE.
  // Unabhaengig davon, WIE die Seite die Daten holt (kein Token noetig). Danach wird
  // der urspruengliche Zustand (Live/Intraday) wiederhergestellt.
  function harvestRangeDom(fromIso, toIso){
    return new Promise(resolve => {
      const out = { days: [], error: null };
      (async () => {
      try {
        const dSel = document.getElementById('daterange-list');
        const iSel = document.getElementById('interval-list');
        const dateInput = document.getElementById('userdef-date');
        const ok = findOkButton();
        if (!dSel || !ok) { out.error = 'Ligaliste-Bedienelemente (Zeitraum/Ok) nicht gefunden — bist du auf dem Ligalisten-Tab?'; return resolve(out); }
        const origD = dSel.value || 'intraday';
        const origI = iSel ? (iSel.value || 'cumulate') : null;
        const hasUserDef = [...dSel.options].some(o => o.value === 'user_defined');
        // Auch dieser Weg verstellt die Auswahlfelder und klickt "Ok" — er muss
        // sich also mit Live-Takt, Monats- und Wochenlauf abwechseln, nicht
        // ueberlappen.
        if (!sperreNehmen('Bereich (Durchklick)')) {
          out.error = 'Die Ligalisten-Seite ist gerade belegt von: ' + sperreHalter() + ' — bitte gleich noch einmal versuchen.';
          return resolve(out);
        }
        // 1) ZUERST der Zeitraum — erst dadurch haengt die Ligaliste "Tag" in die
        //    Intervall-Auswahl. Umgekehrt (wie frueher) griff setSelect(iSel,'day')
        //    ins Leere und es blieb bei "kumuliert" -> keine Datum-Spalte.
        if (hasUserDef) setSelect(dSel, 'user_defined');
        // 2) Datum auf den Bereich setzen — bevorzugt ueber die flatpickr-Instanz
        //    (der zuverlaessige Weg; .value zu setzen reicht flatpickr NICHT).
        const from = new Date(fromIso + 'T00:00:00'), to = new Date(toIso + 'T00:00:00');
        let dateSet = false;
        try {
          const fp = dateInput && dateInput._flatpickr;
          if (fp && typeof fp.setDate === 'function') { fp.setDate([from, to], true); dateSet = true; }
        } catch(e){}
        if (!dateSet && dateInput) { // Fallback: Textwert + Events
          const ger = d => pad2(d.getDate())+'.'+pad2(d.getMonth()+1)+'.'+d.getFullYear();
          dateInput.value = ger(from) + ' bis ' + ger(to);
          dateInput.dispatchEvent(new Event('input', { bubbles:true }));
          dateInput.dispatchEvent(new Event('change', { bubbles:true }));
        }
        // 3) JETZT das Intervall auf "Tag" — mit Warten, bis die Option da ist
        const ivOk = await waitForIntervalDay(iSel);
        console.log('[KPI Crawler] Durchklicken: Zeitraum ' + fromIso + ' bis ' + toIso + ', Intervall=' + (ivOk ? 'Tag' : 'NICHT umstellbar') + (dateSet ? '' : ' [flatpickr nicht gefunden, Text-Fallback]') + ' — klicke Ok...');
        // 4) Ok klicken -> die Seite baut die Tabelle neu (egal ueber welchen Kanal)
        ok.click();
        // 5) auf Neuaufbau warten, dann die sichtbare Tabelle parsen
        setTimeout(() => {
          try {
            const kpis = parseKpiTable();
            const byDay = {};
            let ohneDatum = 0;
            kpis.forEach(k => {
              const key = datumKey(k.datum);
              if (!key) { ohneDatum++; return; }
              if (key >= fromIso && key <= toIso) (byDay[key] || (byDay[key] = [])).push(k);
            });
            Object.keys(byDay).sort().forEach(key => { storeSnapshot(key, byDay[key]); out.days.push(key); });
            if (!out.days.length) {
              out.error = 'Die Ligaliste zeigte fuer ' + fromIso + '..' + toIso + ' keine Tageszeilen (' +
                kpis.length + ' Zeilen' + (ohneDatum ? ', ' + ohneDatum + ' ohne Datum' : '') +
                '). Bitte auf der Ligaliste Intervall = "Tag" und den Zeitraum pruefen.';
            } else {
              console.log('[KPI Crawler] Durchklicken erfolgreich: ' + out.days.length + ' Tag(e) [' + out.days.join(', ') + '] aus der DOM-Tabelle gelesen.');
            }
          } catch(e){ out.error = 'DOM-Parse fehlgeschlagen: ' + e; }
          finally {
            // 6) Original-Zustand wiederherstellen (zurueck auf Live/Intraday).
            //    Zuerst das Intervall, DANN den Zeitraum: sonst wirft die Ligaliste
            //    beim Wechsel auf Intraday die "Tag"-Option raus und der
            //    Intervall-Reset laeuft ins Leere.
            try { setSelect(iSel, origI || 'cumulate'); setSelect(dSel, origD); ok.click(); } catch(e){}
            setTimeout(() => { sperreGeben('Bereich (Durchklick)'); pollKpis(false); resolve(out); }, REFRESH_WAIT);
          }
        }, REFRESH_WAIT + 3000); // Bereich laedt etwas laenger
      } catch(e){ sperreGeben('Bereich (Durchklick)'); out.error = String(e); resolve(out); }
      })();
    });
  }

  // ---------- Weg A: BEREICH via direktem get_data.rb-Replay (nur mit Token) ----------
  // Holt einen frei waehlbaren Bereich via user_defined (ISO + DE-Format probiert,
  // dazu last_week/current_week als Fallback), speichert jeden Tag als Snapshot.
  async function harvestRangeApi(fromIso, toIso){
    const out = { days: [], error: null };
    try {
      const toYmd = iso => iso.replace(/-/g, '');            // 2026-07-01 -> 20260701 (ECHTES Portal-Format!)
      const toGer = iso => iso.split('-').reverse().join('.');
      const attempts = [
        { dr:'user_defined', startdate:toYmd(fromIso), enddate:toYmd(toIso), label:'user_defined YYYYMMDD' },
        { dr:'user_defined', startdate:fromIso,        enddate:toIso,        label:'user_defined ISO' },
        { dr:'user_defined', startdate:toGer(fromIso), enddate:toGer(toIso), label:'user_defined DE'  },
        { dr:'last_week',    label:'last_week (Fallback)' },
        { dr:'current_week', label:'current_week (Fallback)' }
      ];
      const byDay = {};
      for (const a of attempts) {
        const res = await fetchDaterangeKpis(a.dr, a);
        if (!res.kpis || !res.kpis.length) { console.warn('[KPI Crawler] Bereich ' + a.label + ': ' + (res.reason || 'leer')); continue; }
        const perDay = {};
        res.kpis.forEach(k => { const key = datumKey(k.datum); if (key) (perDay[key] || (perDay[key] = [])).push(k); });
        Object.keys(perDay).forEach(key => {
          if (key >= fromIso && key <= toIso && (!byDay[key] || perDay[key].length > byDay[key].length)) byDay[key] = perDay[key];
        });
        console.log('[KPI Crawler] Bereich ' + a.label + ': ' + Object.keys(perDay).length + ' Tag(e) [' + Object.keys(perDay).sort().join(', ') + ']');
        // user_defined hat den Bereich geliefert -> restliche Formate/Fallbacks
        // ueberspringen (ISO/DE wuerden nur Oracle-500-Fehler erzeugen).
        if (a.dr === 'user_defined' && Object.keys(perDay).length >= 1) break;
        await new Promise(r => setTimeout(r, 300));
      }
      Object.keys(byDay).sort().forEach(key => { storeSnapshot(key, byDay[key]); out.days.push(key); });
      if (!out.days.length) out.error = 'Portal lieferte keine Tage fuer ' + fromIso + ' bis ' + toIso + ' (rcCrawlerWeekRaw("user_defined") pruefen).';
    } catch(e){ out.error = String(e); }
    return out;
  }
  window.rcCrawlerHarvestRange = harvestRange; // manuell: rcCrawlerHarvestRange('2026-07-01','2026-07-13')

  function handleCommand(d, replySource){
    if (!d || d.type !== 'RC_HARVEST_RANGE' || !d.from || !d.to) return;
    console.log('[KPI Crawler] Bereichs-Anforderung vom Dashboard: ' + d.from + ' bis ' + d.to);
    harvestRange(d.from, d.to).then(res => {
      const done = { type:'RC_HARVEST_RANGE_DONE', from:d.from, to:d.to, days:res.days, error:res.error, history: loadHistory() };
      try { channel.postMessage(done); } catch(e){}
      try { if (window.opener && !window.opener.closed) window.opener.postMessage(done, '*'); } catch(e){}
      try { if (replySource && replySource.postMessage && replySource !== window) replySource.postMessage(done, '*'); } catch(e){}
      console.log('[KPI Crawler] Bereich fertig: ' + (res.days.join(', ') || 'KEINE Tage') + (res.error ? ' — ' + res.error : ''));
    });
  }
  window.addEventListener('message', ev => { try { handleCommand(ev.data, ev.source); } catch(e){} });
  channel.addEventListener('message', ev => { try { handleCommand(ev.data, null); } catch(e){} });

  // Debug: Rohantwort eines Zeitraums ansehen — rcCrawlerWeekRaw('last_week')
  window.rcCrawlerWeekRaw = async function(daterange){
    const cap = window.__rcLastGetData; if (!cap) { console.warn('Noch keine Anfrage mitgeschnitten'); return; }
    const p = new URLSearchParams(cap.body); p.set('daterange', daterange || 'last_week'); p.set('interval','day');
    const r = await fetch(cap.url, { method:'POST', credentials:'include', headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'}, body:p.toString() });
    const t = await r.text(); console.log('HTTP', r.status, 'Laenge', t.length, '\n', t.slice(0, 1500)); return t;
  };

  // ---------- Fallback: AKTUELLER MONAT ueber die UI (Select + Ok) ----------
  // Nur noetig, wenn kein get_data.rb-Token mitgeschnitten werden konnte.
  // WICHTIG — DIESE FUNKTION MUSS EIN ECHTES PROMISE LIEFERN.
  // Frueher war sie zwar als async deklariert, legte die eigentliche Arbeit aber
  // in ein setTimeout und kehrte SOFORT zurueck. Der Aufrufer (stufeMonat) misst
  // den Erfolg daran, wie viele Tage danach in der Historie liegen — und mass
  // damit einen Zeitpunkt, zu dem noch gar nicht geklickt worden war. Ergebnis:
  // "keine neuen Tage", der Monats-Marker wurde nie gesetzt, und beim NAECHSTEN
  // Aufruf der Ligaliste klickte sich der ganze Monatslauf erneut durch die
  // Seite. Genau das erklaert, warum die Ansicht immer wieder anders aussah.
  // Jetzt loest das Promise erst auf, wenn geparst UND der Ausgangszustand
  // wiederhergestellt ist.
  function harvestMonthDailyDom(){
    return new Promise(resolve => {
      let fertig = false;
      const abschluss = (was) => { if (fertig) return; fertig = true; sperreGeben('Monat (Durchklick)'); resolve(was); };
      (async () => {
      try {
        const dSel = document.getElementById('daterange-list');
        const iSel = document.getElementById('interval-list');
        const ok = findOkButton();
        if (!dSel || !ok) { console.warn('[KPI Crawler] Zeitraum-Auswahl nicht gefunden — Historie uebersprungen'); return abschluss(0); }
        if (![...dSel.options].some(o => o.value === HARVEST_RANGE)) { console.warn('[KPI Crawler] "' + HARVEST_RANGE + '" nicht verfuegbar'); return abschluss(0); }
        // Die Seite darf nur EIN Lauf gleichzeitig verstellen.
        if (!sperreNehmen('Monat (Durchklick)')) {
          console.warn('[KPI Crawler] Monats-Durchklick uebersprungen — die Seite ist gerade belegt von: ' + sperreHalter());
          return resolve(0);
        }
        const origD = dSel.value || 'intraday';
        const origI = iSel ? (iSel.value || 'cumulate') : null;
        console.log('[KPI Crawler] Lade AKTUELLEN MONAT auf Tagesbasis nach (UI-Weg)...');
        // Notbremse: bleibt die Seite haengen oder laedt sie neu, darf die
        // Sperre nicht ewig stehen bleiben.
        const notbremse = setTimeout(() => {
          if (!fertig) console.warn('[KPI Crawler] Monats-Durchklick ohne Rueckmeldung abgebrochen — Sperre freigegeben.');
          abschluss(0);
        }, 90000);
        // Zeitraum ZUERST — erst danach bietet die Ligaliste ueberhaupt "Tag" an.
        setSelect(dSel, HARVEST_RANGE);
        const ivOk = await waitForIntervalDay(iSel);
        if (!ivOk) console.warn('[KPI Crawler] Ohne Intervall "Tag" liefert der Monat nur EINE kumulierte Zeile je Agent.');
        ok.click();
        setTimeout(() => {
          let tage = 0;
          try {
            const kpis = parseKpiTable();
            if (!kpis.length) { console.warn('[KPI Crawler] Monat: keine Daten erhalten'); }
            else {
              // nach Datum gruppieren — Zeilen OHNE Datum sind kumulierte Monatswerte
              // und duerfen NIEMALS als "heute" abgelegt werden (sonst stehen
              // Monatssummen als Tageswert im Dashboard).
              const byDay = {};
              let ohneDatum = 0;
              kpis.forEach(k => {
                const key = datumKey(k.datum);
                if (!key) { ohneDatum++; return; }
                (byDay[key] || (byDay[key] = [])).push(k);
              });
              const days = Object.keys(byDay).sort();
              if (!days.length) {
                console.warn('[KPI Crawler] Monat: ' + kpis.length + ' Zeilen ohne Datum-Spalte — als kumulierte Monatswerte VERWORFEN (kein Tag zuordenbar).');
              } else {
                days.forEach(key => storeSnapshot(key, byDay[key]));
                tage = days.length;
                console.log('[KPI Crawler] Monats-Historie gespeichert: ' + days.length + ' Tag(e) — ' + days.join(', ') +
                  (ohneDatum ? ' (' + ohneDatum + ' Zeilen ohne Datum verworfen)' : ''));
                // aktualisierte Historie sofort ans Dashboard funken
                sendKpis(byDay[days[days.length-1]] || []);
              }
            }
          } catch(e){ console.error('[KPI Crawler] Monats-Parse fehlgeschlagen:', e); }
          finally {
            // Zustand zuruecksetzen und wieder live gehen (Intraday, urspruengliches Intervall)
            try {
              setSelect(iSel, origI || 'cumulate');
              setSelect(dSel, origD);
              ok.click();
            } catch(e){ console.warn('[KPI Crawler] Wiederherstellen der Ansicht fehlgeschlagen:', e); }
            setTimeout(() => {
              clearTimeout(notbremse);
              abschluss(tage);          // Sperre erst HIER frei — der Poll darf nicht dazwischen
              pollKpis(false);
            }, REFRESH_WAIT);
          }
        }, REFRESH_WAIT + 3000); // Monat laedt etwas laenger
      } catch(e){
        console.error('[KPI Crawler] Monats-Nachladung fehlgeschlagen:', e);
        abschluss(0);
      }
      })();
    });
  }
  window.rcCrawlerHarvestMonth = harvestMonthDaily; // manueller Aufruf in der Konsole
  window.rcCrawlerHarvestWeek  = harvestWeekDaily;
  window.rcCrawlerHarvestWoche = harvestWeekDaily;

  // ---------- Standort-Auswahl (loc_inlist) ----------
  // Ohne Argument: zeigt, welche Standorte gerade geholt werden.
  // rcCrawlerAlleStandorte(false): wieder die Portal-Auswahl uebernehmen.
  // Die Entscheidung liegt in localStorage und ueberlebt den Seitenwechsel —
  // vorher war der Schalter eine reine Tab-Variable und nach jedem Reload weg,
  // im Wandmonitor-Betrieb also praktisch nie gesetzt.
  window.rcCrawlerAlleStandorte = function (an) {
    if (an === undefined) {
      const li = window.__rcLocInlist;
      console.log('[KPI Crawler] Standort-Auswahl im Portal: ' +
        (li && li.length ? li.join(', ') : '(keine Einschraenkung erkannt)') +
        '\n  Abgefragt werden: ' + (alleStandorteAn()
            ? 'ALLE (' + alleStandorte().join(', ') + ')'
            : 'nur die Portal-Auswahl'));
      return alleStandorteAn() ? alleStandorte() : (li || []);
    }
    try { localStorage.setItem(LS_ALLE_STD, an ? '1' : '0'); } catch (e) {}
    console.log('[KPI Crawler] ' + (an
      ? 'Es werden ab dem naechsten Lauf ALLE Standorte geholt.'
      : 'Portal-Auswahl wird wieder uebernommen.'));
    return !!an;
  };
  window.rcCrawlerStandorte = alleStandorte;

  // Sofort einmal parsen (ohne Refresh), danach im POLL_INTERVAL-Takt live
  pollKpis(false);
  // Token proaktiv sichern: falls der Crawler NACH dem Tabellen-Load injiziert wurde,
  // hat er die Original-Anfrage noch nicht gesehen. Ein/mehrere Ok-Klicke holen sie
  // nach -> Zeitraum-Abrufe funktionieren danach OHNE manuelles Nachklicken.
  ensureCapture(1).then(ok => {
    console.log(ok
      ? '[KPI Crawler] Bereit: Original-Anfrage gesichert (schneller get_data.rb-Weg verfuegbar).'
      : '[KPI Crawler] Kein get_data.rb-Token — Zeitraum-Abrufe laufen automatisch ueber den UI-Durchklick (funktioniert trotzdem).');
  });
  // ---------- Start-Harvest in DREI Stufen (Nutzer-Vorgabe 30.07.) ----------
  // "Aktueller Monat" x Intervall "Tag" x ALLE Standorte liess die Ligalisten-Seite
  // haengen — rund 31 Tage x 9 Standorte x ~500 Agenten in EINER Antwort. Jetzt:
  //   1. MONAT (einmal je Monat) — Tagesbasis, NUR Alanya
  //   2. WOCHE (einmal je Tag)   — Tagesbasis, ALLE Standorte
  //   3. LIVE  (alle 5 Minuten)  — Intraday, ALLE Standorte
  // Die beiden Harvests laufen NACHEINANDER, nie gleichzeitig: beide schicken einen
  // get_data.rb-Request, und der DOM-Fallback klickt sogar in der Seite herum.
  // Marker werden NUR nach einem nachweislich erfolgreichen Lauf gesetzt — ein
  // Fehlversuch darf den Rest des Monats bzw. den Rest des Tages nicht sperren.
  const heuteKey   = dayKey(new Date());
  const monatJetzt = heuteKey.slice(0, 7);

  // Gezaehlt wird am ERGEBNIS, nicht am Rueckgabewert: die Harvests koennen still
  // auf den DOM-Weg fallen. Massstab ist, wie viele Tage danach in der Historie liegen.
  function histTage(vonKey, bisKey){
    try {
      const h = JSON.parse(localStorage.getItem('rcLigaHistory') || '{}');
      return Object.keys(h).filter(k => k >= vonKey && k <= bisKey).length;
    } catch (e) { return 0; }
  }
  function wochenStart(){
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Mo = 0
    return dayKey(d);
  }

  function stufeMonat(){
    let geholt = null;
    try { geholt = localStorage.getItem(LS_MONAT); } catch (e) {}
    if (geholt === monatJetzt && !window.rcCrawlerMonatErzwingen) {
      console.log('[KPI Crawler] Monats-Harvest fuer ' + monatJetzt + ' ist schon gelaufen — uebersprungen.'
        + ' (Erneut holen: rcCrawlerHarvestMonth())');
      return Promise.resolve();
    }
    const von = monatJetzt + '-01', bis = monatJetzt + '-31';
    const vorher = histTage(von, bis);
    return Promise.resolve(harvestMonthDaily()).then(function () {
      const nachher = histTage(von, bis);
      // Genug ist es, wenn neue Tage dazukamen oder ohnehin schon Tage vorliegen.
      const erwartet = Math.min(3, new Date().getDate());
      if (nachher > vorher || nachher >= erwartet) {
        try { localStorage.setItem(LS_MONAT, monatJetzt); } catch (e) {}
        console.log('[KPI Crawler] Monats-Harvest ' + monatJetzt + ' erledigt (' + nachher +
          ' Tag(e) in der Historie, Standorte: ' + MONATS_STANDORTE.join(', ') + ') — laeuft diesen Monat nicht noch einmal.');
      } else {
        console.warn('[KPI Crawler] Monats-Harvest brachte keine neuen Tage (' + nachher + ') — Marker bleibt frei, der naechste Aufruf versucht es erneut.');
      }
    }).catch(function (e) {
      console.warn('[KPI Crawler] Monats-Harvest abgebrochen: ' + (e && e.message ? e.message : e));
    });
  }

  function stufeWoche(){
    let geholt = null;
    try { geholt = localStorage.getItem(LS_WOCHE); } catch (e) {}
    if (geholt === heuteKey && !window.rcCrawlerWocheErzwingen) {
      console.log('[KPI Crawler] Wochen-Harvest lief heute schon — uebersprungen.'
        + ' (Erneut holen: rcCrawlerHarvestWoche())');
      return Promise.resolve();
    }
    const von = wochenStart();
    const vorher = histTage(von, heuteKey);
    const tageBisher = ((new Date().getDay() + 6) % 7) + 1; // Mo=1 ... So=7
    return Promise.resolve(harvestWeekDaily()).then(function () {
      const nachher = histTage(von, heuteKey);
      if (nachher > vorher || nachher >= tageBisher) {
        try { localStorage.setItem(LS_WOCHE, heuteKey); } catch (e) {}
        console.log('[KPI Crawler] Wochen-Harvest erledigt (' + nachher + '/' + tageBisher +
          ' Tag(e) der laufenden Woche, alle Standorte) — laeuft heute nicht noch einmal.');
      } else {
        console.warn('[KPI Crawler] Wochen-Harvest brachte keine neuen Tage (' + nachher + ') — Marker bleibt frei, der naechste Aufruf versucht es erneut.');
      }
    }).catch(function (e) {
      console.warn('[KPI Crawler] Wochen-Harvest abgebrochen: ' + (e && e.message ? e.message : e));
    });
  }

  setTimeout(function () { stufeMonat().then(stufeWoche); }, 6000);
  if (window.kpiCrawlerInterval) clearInterval(window.kpiCrawlerInterval);
  window.kpiCrawlerInterval = setInterval(() => pollKpis(true), POLL_INTERVAL);

  console.log('[KPI Crawler] v5.1 gestartet — Drei Stufen: (1) MONAT einmal je Monat, Intervall "Tag", nur ' + MONATS_STANDORTE.join('/') + ' · (2) WOCHE einmal je Tag, Intervall "Tag", ALLE Standorte · (3) LIVE alle ' + (POLL_INTERVAL/60000) + ' Minuten auf Intraday, ALLE Standorte. Grund der Aufteilung: Monat x Tag x alle Standorte liess die Ligalisten-Seite haengen. Mit mitgeschnittenem Token ohne jeden Eingriff in die Seite (kein Ok-Klick, keine Select-Aenderung), sonst per Ok-Klick — beim Wochenlauf entfaellt der DOM-Durchklick bewusst. Snapshots werden nach ECHTEM Datum abgelegt (nie blind als heute); kumulierte Zeilen ohne Datum werden verworfen. Konsole: rcCrawlerHarvestMonth() · rcCrawlerHarvestWoche() · rcCrawlerAlleStandorte() · Bereich: rcCrawlerHarvestRange("2026-07-01","2026-07-13") · Rohantwort: rcCrawlerWeekRaw("current_month")');

  window.addEventListener('beforeunload', () => {
    if (window.kpiCrawlerInterval) clearInterval(window.kpiCrawlerInterval);
  });
})();
