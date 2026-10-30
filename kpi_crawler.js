(function() {
  // ============================================================
  //  regiocom KPI-Crawler v6 — Ligaliste -> ESL Live-Arena
  //  PRINZIP SEIT 06.08. ABENDS (Nutzer-Vorgabe): DER NUTZER FUEHRT,
  //  DER CRAWLER FOLGT. Kein eigener Start-Harvest, kein Ok-Klick,
  //  kein Select-Verstellen, kein selbst gebauter Request mehr.
  //  Ablauf im Betrieb:
  //   1. Nutzer laedt seine Vorlage (Baum/Stack), waehlt "Aktuelle
  //      Woche" + Intervall "Tag", klickt Ok  -> der Crawler liest die
  //      ANTWORT dieses Klicks mit, parst sie und schickt sie ans
  //      Dashboard (Tages-Historie der Woche).
  //   2. Nutzer stellt auf "Intraday", klickt Ok -> Antwort wird als
  //      Live-Paket gesendet, der Request wird GEMERKT.
  //   3. Ab da alle 3 Minuten: Replay des gemerkten Requests, nur
  //      daterange=intraday & interval=cumulate umgestellt — Baum,
  //      Standorte, Kennzahlen bleiben EXAKT die des Nutzer-Klicks.
  //  Projekt-Kennung der Pakete kommt aus description_settings_list
  //  im Request (Vodafone_Kabel/Mobile/UM) — nicht mehr geraten.
  //  - parst ALLE Kennzahlen der Ligaliste, Header dynamisch erkannt
  //  - speichert je Tag einen Snapshot in localStorage (rcLigaHistory)
  //  - sendet via BroadcastChannel + window.opener.postMessage
  // ============================================================
  const CHANNEL_NAME = 'regiocom_live_arena';
  const POLL_INTERVAL = 180000;   // 3 Minuten — Intraday-Replay (Nutzer-Vorgabe 06.08. abends)
  const REFRESH_WAIT  = 12000;    // Wartezeit nach "Ok"-Klick bis die Tabelle neu gebaut ist
  const HISTORY_DAYS  = 35;       // so viele Tages-Snapshots behalten (Bereichs-Vergleiche!)
  // Start-Harvest: EIN Lauf ueber den aktuellen Monat auf Tagesbasis.
  // Frueher wurden last_week + current_week + drei user_defined-Datumsformate
  // durchprobiert — viel Last, ueberlappende Tage und im DOM-Weg das falsche
  // Intervall (siehe waitForIntervalDay). "Aktueller Monat" deckt alles ab.
  const HARVEST_RANGE = 'current_month';
  const LS_ALLE_STD   = 'rcCrawlerAlleStd';    // "1"/"0" — ueberlebt den Seitenwechsel

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

  // ---------- Kennzahl-Auswahl (figure_list) — Korrektur 04.08. ----------
  // Bis zum 03.08. hat der Crawler den mitgeschnittenen Request 1:1 nachgestellt
  // und dabei auch dessen figure_list uebernommen. WELCHE Kennzahlen ankamen,
  // hing damit an der Einstellung, die der Nutzer gerade im Portal gesetzt hatte
  // — ohne dass irgendwo sichtbar wurde, dass welche fehlen. Steht dort z. B.
  // kein ACW, liefert findKpi(map,'ACW','Kennzahl') schlicht -1 und das Feld
  // bleibt still leer. Genau das war die Ursache fuer "ich moechte mehr
  // Kennzahlen sehen, ACW etc.".
  //
  // Jetzt wird die Liste EXPLIZIT gesetzt. Die IDs sind belegt aus dem
  // Abfrage-Baukasten (Ligaliste_Crawler.html, Array availableKpis) — das ist
  // dieselbe Quelle, aus der die Ligaliste ihr eigenes Dropdown baut.
  const LS_FIGURES = 'rcCrawlerFigures';   // "1"/"0" — eigene Liste an/aus
  const FIGURE_IDS = [
    '10004', // ACD  — reine Gespraechszeit
    '10005', // ACW  — Nacharbeit
    '10006', // AHT  — Bearbeitungszeit (traegt zugleich den Call-Nenner)
    '10014', // ACHT — Gesamtzeit
    '10089', // OE Focuszeit
    '10097', // OE FZ (geschlossene Konversationen)
    '10090', // OE Liegezeit
    '10092', // OE Zuweisungszeit
    '10091', // Liegezeiten-Quote
    '10094', // manuell geschlossen (Quote)
    '10095', // Onhold-Quote
    '10096', // Weiterl.-Quote (ASM)
    '10098', // Weiterl.-Quote Skill=  (ASM)
    '10099', // Weiterl.-Quote Skill<> (ASM)
    '10357', // Weiterl.-Quote Skill=  (Tel.)
    '10358', // Weiterl.-Quote Skill<> (Tel.)
    '10082', // Auflegerquote
    '10062', // CS
    '10339', // CS Deep Detractor %
    '10063', '10064', '10065', // CS Promotoren / Detraktoren / Neutrale
    '10075', // TNPS
    '10355', // TNPS Antwortquote %
    '10340', // TNPS Deep Detractor %
    '10076', '10077', '10078', // TNPS Promotoren / Detraktoren / Neutrale
    '10080', // First-Time-Fix
    '10081', // Total-Fix
    '10067', // Final Fix 1
    '10060', // Final Fix 7
    '10061'  // Final Fix 30
  ];
  // Abschaltbar, falls das Portal eine ID nicht mag. Die Entscheidung ueberlebt
  // den Seitenwechsel — gleiches Muster wie rcCrawlerAlleStandorte.
  function figuresAn(){
    if (window.__rcFiguresAus) return false;   // in dieser Sitzung abgelehnt
    try {
      const v = localStorage.getItem(LS_FIGURES);
      if (v === '0') return false;
    } catch(e){}
    return true;
  }
  window.rcCrawlerKennzahlen = function(an){
    if (an === undefined) {
      console.log('[KPI Crawler] Eigene Kennzahl-Liste ist ' + (figuresAn() ? 'AN' : 'AUS') +
                  ' (' + FIGURE_IDS.length + ' Kennzahlen). Umschalten: rcCrawlerKennzahlen(false)');
      return figuresAn();
    }
    try { localStorage.setItem(LS_FIGURES, an ? '1' : '0'); } catch(e){}
    console.log('[KPI Crawler] Eigene Kennzahl-Liste jetzt ' + (an ? 'AN' : 'AUS') + '. Wirkt ab dem naechsten Abruf.');
    return !!an;
  };

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

  // ---------- Wachhalter (05.10. spaetabends) ----------
  // Befund aus der Konsole dieser Seite vom 05.10.: "Sperre von Live-Takt ist
  // verfallen (787 s)". 13 Minuten lang feuerte hier KEIN Zeitgeber, und der
  // Abruf, den das Dashboard angestossen hatte, kam nie zurueck — in der
  // Sekunde, in der der Tab angeklickt wurde, lief alles weiter. Edge legt
  // verborgene Tabs schlafen ("Schlafende Tabs"): Zeitgeber und Netzabrufe
  // stehen, Nachrichten kommen noch an. Die Ligaliste ist im Betrieb IMMER
  // der Tab im Hintergrund, das Dashboard liegt vorn.
  // An echtem Edge 154 gemessen (pruefwerkzeuge/schlaf_messen.mjs):
  //   - ohne Schutz friert der verborgene Tab nach der Schlaf-Schwelle ein
  //   - die Hintergrund-Argumente des Starters aendern daran NICHTS
  //   - haelt die Seite einen Web Lock, friert Edge sie nicht ein
  //     (edge://discards: "Is Freezable: nein — holding Web Lock")
  // Der Lock wird nie zurueckgegeben (Promise ohne Ende) und faellt mit der
  // Seite. Ein Re-Inject laesst den vorhandenen stehen (window.__rcWachLock).
  const wach = window.rcCrawlerWach = window.rcCrawlerWach || { lock:null, grund:'', eingefroren:0, seit:0, zuletztSek:0, aufgetautUm:0 };
  function wachhalten(){
    if (window.__rcWachLock) { wach.lock = true; return 'steht schon'; }
    try {
      if (!(navigator.locks && navigator.locks.request)) {
        wach.lock = false; wach.grund = 'Web Locks gibt es in diesem Browser nicht';
        return wach.grund;
      }
      const name = 'rc_wach_liga_' + Date.now() + '_' + Math.round(performance.now() * 1000);
      window.__rcWachLock = { name: name, seit: Date.now() };
      navigator.locks.request(name, function(){
        wach.lock = true; wach.grund = '';
        return new Promise(function(){});      // nie fertig: der Lock gilt, solange die Seite lebt
      }).catch(function(e){
        window.__rcWachLock = null; wach.lock = false; wach.grund = String(e && e.message || e);
        console.warn('[KPI Crawler] Wachhalter: Web Lock nicht bekommen (' + wach.grund +
          ') — Edge kann diesen Tab im Hintergrund einfrieren.');
      });
      return 'angefordert';
    } catch(e){
      window.__rcWachLock = null; wach.lock = false; wach.grund = String(e && e.message || e);
      return wach.grund;
    }
  }
  // Kurze Klartext-Zeile ans Dashboard — sie landet dort im Logbuch. Ohne das
  // steht eine Stoerung der Ligaliste nur in DIESER Konsole, und die liest im
  // Betrieb niemand (der Tab liegt im Hintergrund).
  function meldeHinweis(text){
    const msg = { type:'KPI_HINWEIS', text:String(text || '').slice(0, 300), zeit:Date.now(), projekt:projektAusName() };
    try { channel.postMessage(msg); } catch(e){}
    try { if (window.opener && !window.opener.closed) window.opener.postMessage(msg, '*'); } catch(e){}
    try { if (window.rcDashWin && !window.rcDashWin.closed) window.rcDashWin.postMessage(msg, '*'); } catch(e){}
  }
  // Friert der Browser den Tab trotzdem ein, soll das mit Dauer dastehen statt
  // als Raetsel ("irgendwann kamen keine Zahlen mehr"). Die Horcher haengen am
  // window, damit ein Re-Inject die alten abmeldet statt neue zu stapeln.
  try {
    if (window.__rcCrawlerFreeze) {
      document.removeEventListener('freeze', window.__rcCrawlerFreeze.f);
      document.removeEventListener('resume', window.__rcCrawlerFreeze.r);
    }
  } catch(e){}
  window.__rcCrawlerFreeze = {
    f: function(){ wach.eingefroren++; wach.seit = Date.now(); },
    r: function(){
      const sek = wach.seit ? Math.round((Date.now() - wach.seit) / 1000) : 0;
      wach.seit = 0; wach.zuletztSek = sek; wach.aufgetautUm = Date.now();
      const txt = 'Ligalisten-Tab war ' + (sek >= 120 ? Math.round(sek / 60) + ' Min' : sek + ' s') +
        ' vom Browser eingefroren (Edge "Schlafende Tabs") — in der Zeit lief kein Abruf.';
      console.warn('[KPI Crawler] ' + txt);
      meldeHinweis(txt);
    }
  };
  try {
    document.addEventListener('freeze', window.__rcCrawlerFreeze.f);
    document.addEventListener('resume', window.__rcCrawlerFreeze.r);
  } catch(e){}

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
  // ---------- Klick-Mitschnitt PERSISTIEREN (14.08.) ----------
  // __rcLastGetData lebte nur im window — nach jedem Neuladen (Sitzungstod,
  // F5, Citrix-Neustart des Tabs) war der Klick weg, der Takt meldete "Warte
  // auf deinen ersten Ok-Klick" und die Ligaliste fror bis zum naechsten
  // Hand-Klick ein. Jetzt wird der Mitschnitt zusaetzlich im localStorage
  // gesichert und beim Start vorgeladen. Der Body traegt das Sitzungs-Token
  // script_id_secure: aelter als ~3 h ist er sicher tot (CCS-Sitzung lebt
  // 2-3 h) und wird verworfen, statt vier KPI_QUELLE_TOT-Runden zu drehen.
  // PROJEKTGETRENNT ueber den Fensternamen (drei Liga-Fenster teilen sich
  // denselben localStorage auf ccs.vodafone.de) — Kabel ohne Zusatz, wie rcKey.
  const LS_KLICK = 'rcKlickMitschnitt_v1';
  const KLICK_MAX_ALTER_MS = 3 * 60 * 60 * 1000;
  function klickSchluessel(){
    const p = projektAusName();
    return LS_KLICK + (p === 'mobile' ? '_mob' : p === 'um' ? '_um' : '');
  }
  function klickSichern(cap){
    if (!cap || !cap.body || !cap.url) return;
    try { localStorage.setItem(klickSchluessel(), JSON.stringify({ url: cap.url, body: cap.body, zeit: Date.now() })); } catch(e){}
  }
  function klickLaden(){
    try {
      const roh = localStorage.getItem(klickSchluessel()); if (!roh) return null;
      const o = JSON.parse(roh);
      if (!o || !o.body || !o.url) return null;
      // Altbestand aus der Zeit vor dem 17.08. aussortieren: damals sicherte
      // der Hook JEDEN get_data.rb-Request, auch die Eigen-Requests der Seite
      // (callreftree o.ae.) ohne daterange/figure_list. So ein Rumpf liefert
      // nie eine Tabelle - vorgeladen legte er den Crawler dauerhaft stumm.
      if (window.__rcIstAbfrageBody && !window.__rcIstAbfrageBody(o.body)) {
        localStorage.removeItem(klickSchluessel());
        console.warn('[KPI Crawler] Gesicherter Mitschnitt war kein echter Abfrage-Request ' +
          '(keine daterange/figure_list) — verworfen. Die Auto-Abfrage holt einen neuen.');
        return null;
      }
      if (Date.now() - (o.zeit || 0) > KLICK_MAX_ALTER_MS) { localStorage.removeItem(klickSchluessel()); return null; }
      // Gegenprobe: der gespeicherte Body muss zum Fenster-Projekt passen —
      // ein Hand-Tab ohne Fensternamen darf keinen Fremd-Mitschnitt erben.
      const pB = projektAusPaket(o.body), pF = projektAusName();
      if (pB && pF && pB !== pF) return null;
      return { url: o.url, body: o.body, zeit: o.zeit };
    } catch(e){ return null; }
  }
  function klickVerwerfen(){
    try { localStorage.removeItem(klickSchluessel()); } catch(e){}
    window.__rcLastGetData = null;
  }
  window.__rcKlickSichern = klickSichern;   // am window: der versionierte Hook ruft hierueber,
                                            // ein Re-Inject ERSETZT die Funktion statt sie zu stapeln
  window.rcCrawlerKlickVergessen = function(){
    klickVerwerfen();
    return 'Mitschnitt geloescht — der naechste Ok-Klick zaehlt neu.';
  };

  // ---------- Auto-Abfrage (16.08. abends) ----------
  // Nutzer-Vorgabe: "alles wieder automatisieren — die Ligaliste soll
  // automatisch waehlen. Aber einstellbar: manuell oder automatisch."
  // Das ERSETZT die 06.08.-Regel "der Crawler klickt NIE selbst" — bewusst
  // eng geschnitten: geklickt wird NUR, wenn (a) der Schalter an ist,
  // (b) noch KEIN Klick-Mitschnitt existiert (weder live noch gesichert)
  // und (c) die Seite nicht gerade belegt ist. Sobald ein Mitschnitt da
  // ist, gilt weiter "DU fuehrst": der Takt replayt den letzten Klick.
  // Schalter: Dashboard (Zahnrad -> Anzeige -> Automatik), Konsole
  // rcCrawlerAutoKlick(false), Kommando RC_AUTO_KLICK. Standard: AN.
  const LS_AUTOKLICK = 'rcLigaAutoAbfrage';
  const AUTO_KLICK_MAX = 5;
  const AUTO_KLICK_ABSTAND_MS = 30000;
  let autoKlickVersuche = 0;
  let autoKlickTimer = null;
  function autoKlickAn(){
    try { return localStorage.getItem(LS_AUTOKLICK) !== '0'; } catch(e){ return true; }
  }
  window.rcCrawlerAutoKlick = function(an){
    if (an === undefined) return autoKlickAn()
      ? 'AN — ohne gemerkten Klick klickt der Crawler den Ok-Knopf selbst. rcCrawlerAutoKlick(false) schaltet ab.'
      : 'AUS — du fuehrst: der Crawler wartet auf deinen Ok-Klick.';
    try { localStorage.setItem(LS_AUTOKLICK, an ? '1' : '0'); } catch(e){}
    if (an) { autoKlickVersuche = 0; autoKlickPlanen(500); }
    else if (autoKlickTimer) { clearTimeout(autoKlickTimer); autoKlickTimer = null; }
    return an ? 'Auto-Abfrage AN.' : 'Auto-Abfrage AUS — der naechste Ok-Klick kommt von dir.';
  };
  function autoKlickJetzt(){
    if (window.__rcLastGetData && window.__rcLastGetData.body) return;   // Klick ist inzwischen da
    if (!autoKlickAn()) return;
    const halter = sperreHalter();
    if (halter) { autoKlickPlanen(AUTO_KLICK_ABSTAND_MS); return; }      // Seite belegt — spaeter
    const b = findOkButton();
    if (!b) {
      console.warn('[KPI Crawler] Auto-Abfrage: Ok-Knopf nicht gefunden (Seite noch nicht fertig geladen?) — neuer Versuch folgt.');
      autoKlickPlanen(AUTO_KLICK_ABSTAND_MS);
      return;
    }
    console.log('[KPI Crawler] Auto-Abfrage: Ok-Knopf selbst geklickt (' + autoKlickVersuche + '/' + AUTO_KLICK_MAX +
      ') — kein Klick-Mitschnitt vorhanden. Abschalten: rcCrawlerAutoKlick(false).');
    try { b.click(); } catch(e){ console.warn('[KPI Crawler] Auto-Abfrage: Klick fehlgeschlagen: ' + (e && e.message || e)); }
    // Erfolgskontrolle: der Hook muss den get_data.rb-Request mitschneiden.
    setTimeout(() => {
      if (window.__rcLastGetData && window.__rcLastGetData.body) {
        autoKlickVersuche = 0;
        console.log('[KPI Crawler] Auto-Abfrage hat gegriffen — ab jetzt laeuft der normale Replay-Takt.');
        // Wochen-Historie sofort nachziehen, statt bis zu 3 Minuten auf den
        // naechsten Takt zu warten - der Klick liefert nur den HEUTIGEN Stand.
        try { wochenlaufPruefen(); } catch(e){}
      } else {
        autoKlickPlanen(AUTO_KLICK_ABSTAND_MS);
      }
    }, 8000);
  }
  function autoKlickPlanen(verzoegerungMs){
    if (!autoKlickAn()) return;
    if (window.__rcLastGetData && window.__rcLastGetData.body) return;
    if (autoKlickTimer) return;
    if (autoKlickVersuche >= AUTO_KLICK_MAX) return;   // Meldung kommt aus pollKpis im 3-Min-Takt
    autoKlickVersuche++;
    autoKlickTimer = setTimeout(() => { autoKlickTimer = null; autoKlickJetzt(); }, verzoegerungMs);
  }
  // Der Hook merkt sich nicht nur den REQUEST (Token!), sondern liest seit v6
  // auch die ANTWORT mit und reicht sie an window.__rcKlickHandler weiter —
  // damit ist der Ok-Klick des Nutzers selbst schon die Datenuebertragung ans
  // Dashboard. Der Handler haengt am window (nicht in der Kapsel), damit ein
  // Re-Inject ihn ERSETZT statt einen zweiten Hook zu stapeln; der Hook selbst
  // ist versioniert (__rcReqHooked = 3), weil die v5-Fassung die Antworten
  // noch nicht las und die Fassung bis 14.08. den Mitschnitt nicht sicherte —
  // ueber einem alten Hook wird einmal neu gehookt (das doppelte Mitschneiden
  // des Requests ist harmlos).
  (function hookRequests(){
    if (window.__rcReqHooked >= 3) return;
    window.__rcReqHooked = 3;
    const isGetData = u => typeof u === 'string' && u.indexOf('get_data.rb') !== -1;
    // ECHTE Abfrage von den Eigen-Requests der Seite unterscheiden (17.08.,
    // Live-Befund). Die Ligalisten-App schickt SELBST an get_data.rb — z.B.
    // callreftree (Referenzbaum aufloesen) und Vorlagen-Listen. Die tragen
    // weder daterange noch figure_list und liefern nie eine Tabelle.
    // Bis hierher ueberschrieb JEDER dieser Requests den guten Mitschnitt des
    // Nutzers UND wurde gesichert: der Crawler replayte danach einen Rumpf,
    // der prinzipbedingt nichts liefern kann ("keine-tabelle" im 3-Min-Takt),
    // und der Muell ueberlebte das Neuladen. Im Log des Nutzers steht das als
    // "Ok-Klick (/)" — beide Felder leer, weil es gar keine Abfrage war.
    const istAbfrage = s => !!s &&
      /(^|&)daterange=[^&\s]+/.test(s) &&
      /(^|&)figure_list=[^&\s]+/.test(s);
    window.__rcIstAbfrageBody = istAbfrage;   // fuer Startweiche und Pruefwerkzeug
    // fetch
    const origFetch = window.fetch;
    if (!window.__rcFetchRoh) window.__rcFetchRoh = origFetch ? origFetch.bind(window) : null;
    if (origFetch) window.fetch = function(input, init){
      let mitschnitt = null;
      try {
        const url = (typeof input === 'string') ? input : (input && input.url) || '';
        const s = rcBodyToString(init && init.body);
        if (isGetData(url) && istAbfrage(s)) {
          window.__rcLastGetData = { url, body: s }; mitschnitt = { url, body: s };
          // GESICHERT wird erst, wenn die Antwort wirklich eine Tabelle trug —
          // das erledigt verwerteAntwort. Ein Rumpf mit totem Token sieht hier
          // noch richtig aus und wuerde sonst den letzten guten ueberschreiben.
        }
      } catch(e){}
      const p = origFetch.apply(this, arguments);
      if (mitschnitt) {
        try {
          p.then(res => {
            try {
              res.clone().text().then(text => {
                try { if (window.__rcKlickHandler) window.__rcKlickHandler(mitschnitt.body, text); } catch(e){}
              });
            } catch(e){}
          }).catch(function(){});
        } catch(e){}
      }
      return p;
    };
    // XMLHttpRequest (falls die Seite XHR statt fetch nutzt)
    const oOpen = XMLHttpRequest.prototype.open, oSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(m, u){ this.__rcUrl = u; return oOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function(b){
      try {
        const s = rcBodyToString(b);
        if (isGetData(this.__rcUrl) && istAbfrage(s)) {
          window.__rcLastGetData = { url: this.__rcUrl, body: s };
          this.addEventListener('load', function(){
            try { if (window.__rcKlickHandler) window.__rcKlickHandler(s, this.responseText); } catch(e){}
          });
        }
      } catch(e){}
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
    // Call-Zahl = Nenner von AHT (Rueckfall ACD). Das Portal hat KEINE eigene
    // Mengen-Kennzahl; die Zahl ist ein Nebenprodukt einer Zeit-Kennzahl und
    // haengt damit daran, dass AHT ueberhaupt abgefragt wird. Faellt AHT aus der
    // figure_list, faellt der Nenner JEDER Quote mit — deshalb wird es hier
    // einmal laut gesagt statt still 0 zu liefern.
    // (Gemessen 07.08. an Ligalisten.xlsx, 549 Agenten: der AHT-Nenner ist NICHT
    //  derselbe wie der Auflegerquote-Nenner — 15836 gegen 7313, nur 8 Agenten
    //  stimmen ueberein. Wer "Calls" sagt, muss sagen, welchen Nenner er meint.)
    const iCalls    = findKpi(map, 'AHT', 'Nenner');
    const iCallsAcd = findKpi(map, 'ACD', 'Nenner');
    if (iCalls < 0 && iCallsAcd < 0 && !window.__rcCallsFehltGemeldet) {
        window.__rcCallsFehltGemeldet = true;
        console.warn('[KPI Crawler] Weder AHT- noch ACD-Nenner in der Tabelle — es gibt KEINE Call-Zahl. '
            + 'Das Dashboard zeigt die Quoten dann als "—" statt sie auf ESL-Kontakte umzurechnen. '
            + 'Abhilfe: im Portal die Kennzahl AHT anhaken (oder rcCrawlerKennzahlen(true) fuer die eigene Liste).');
    }
    // Dasselbe fuer Nacharbeit (ACW) und Haltezeit (ACHT). Seit v6 wird die
    // figure_list im Produktivpfad vom Ok-Klick GEERBT — ist die Kennzahl im
    // Portal nicht angehakt, fehlt die Spalte, und das Dashboard zeigt auf der
    // Qualitaets-Seite stumm "—". Ohne diese Zeile sucht man den Fehler im
    // Dashboard statt in der Portal-Auswahl (der Nutzer-Befund vom 16.08.).
    if ((iAcwKz < 0 || iAchtKz < 0) && !window.__rcZeitenFehltGemeldet) {
        window.__rcZeitenFehltGemeldet = true;
        const fehlt = [];
        if (iAcwKz  < 0) fehlt.push('ACW (Nacharbeit)');
        if (iAchtKz < 0) fehlt.push('ACHT (Haltezeit / Call on Hold)');
        console.warn('[KPI Crawler] Diese Zeit-Kennzahlen sind in der Tabelle NICHT enthalten: ' + fehlt.join(', ') + '. '
            + 'Das Dashboard kann sie deshalb nicht anzeigen ("n. geliefert" auf der Qualitaets-Seite). '
            + 'Abhilfe: im Portal links die Kennzahlen anhaken und den Ok-Knopf druecken — der Crawler uebernimmt '
            + 'die Auswahl mit dem Klick und spielt sie ab dann alle 3 Minuten nach.');
    }

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
    // Der Kopftext traegt im Portal je nach Kennzahl einen Zusatz "(ASM)" oder
    // "(Tel.)"; findKpi vergleicht exakt. Deshalb wird hier der Reihe nach
    // gesucht: erst ohne Zusatz (alte Portal-Fassung), dann ASM, dann Telefon.
    // Ohne diesen Rueckfall bliebe wq leer, sobald das Portal den Zusatz zeigt.
    const iWq  = ['Weiterl.-Quote Skill<>', 'Weiterl.-Quote Skill<> (ASM)', 'Weiterl.-Quote Skill<> (Tel.)']
                   .map(g => findKpi(map, g, 'Kennzahl')).find(i => i >= 0);
    const iWqI = (iWq === undefined) ? -1 : iWq;
    const iFf7 = findKpi(map, 'Final Fix 7', 'Kennzahl');

    // ---- Generischer Zusatz: JEDE gelieferte Kennzahl mitnehmen (04.08.) ----
    // Bisher wurde nur gelesen, wofuer es oben ein festes Feld gibt. Kommt eine
    // Kennzahl dazu (Onhold-Quote, Liegezeit, Final Fix 30, Weiterleitungen je
    // Kanal ...), fiel sie lautlos unter den Tisch — und beim naechsten Wunsch
    // muesste der Parser erneut angefasst werden. Jetzt wandert alles, was die
    // Tabelle hergibt, zusaetzlich nach kpi.alle[Kennzahlname] = {k, z, n}.
    // Die festen Felder oben bleiben unveraendert: das Dashboard liest sie an
    // Dutzenden Stellen, und ein Umbau darauf waere ein eigenes Vorhaben.
    const STAMM = ['zeile','dienstleister','standort','team','agentenname','ccs-id','datum','ccsid'];
    const ZTXT = String.fromCharCode(90, 228) + 'hler';   // "Zähler", encoding-sicher
    const extraSpalten = [];
    for (let i = 0; i < map.leafLabels.length; i++) {
      const grp = (map.groupPerLeaf[i] || '').trim();
      const leaf = (map.leafLabels[i] || '').trim();
      if (!grp || STAMM.indexOf(grp.toLowerCase()) >= 0) continue;
      const rolle = leaf.toLowerCase() === ZTXT.toLowerCase() ? 'z'
                  : leaf.toLowerCase() === 'nenner' ? 'n'
                  : leaf.toLowerCase() === 'kennzahl' ? 'k'
                  : leaf ? null : 'k';   // Kennzahlen ohne Unterspalte (Promotoren u. a.)
      if (!rolle) continue;
      extraSpalten.push({ i, grp, rolle });
    }
    // Gleichnamige Gruppen unterscheiden (Promotoren/Detraktoren/Neutrale gibt es
    // zweimal — erst CS-, dann TNPS-basiert). Ohne das ueberschriebe die zweite
    // Gruppe die erste, und man saehe TNPS-Zahlen unter dem Namen der CS-Gruppe.
    const gesehen = {};
    extraSpalten.forEach(s => {
      const key = s.grp + '|' + s.rolle;
      gesehen[key] = (gesehen[key] || 0) + 1;
      s.name = gesehen[key] > 1 ? s.grp + ' (' + gesehen[key] + ')' : s.grp;
    });
    function leseAlle(cells){
      const o = {};
      extraSpalten.forEach(s => {
        const roh = cellText(cells, s.i);
        if (roh === '') return;
        // Zeitspalten kommen als hh:mm:ss und wuerden von parseFloat zu einer
        // sinnlosen Stundenzahl (aus "00:07:12" wuerde 0).
        const wert = /^\d{1,2}:\d{2}:\d{2}$/.test(roh) ? timeToSec(roh) : cellNum(cells, s.i);
        if (wert == null) return;
        (o[s.name] || (o[s.name] = {}))[s.rolle] = wert;
      });
      return o;
    }

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

        // Die Call-Zahl ist der NENNER der Kennzahl AHT (Rueckfall: ACD) — das
        // Portal bietet keine eigene Mengen-Kennzahl an. Nutzer-Entscheidung
        // 07.08.: dabei bleibt es.
        // Aber: fehlt die Spalte GANZ (Kennzahl nicht angehakt, Portal liefert
        // sie nicht), ist das "unbekannt" und NICHT "null Calls". Das frueher
        // hier stehende "|| 0" machte daraus eine harte 0 — und weil das
        // Dashboard bei 0 Liga-Calls auf die ESL-Kontakte zurueckfiel (dort sind
        // nur ~12 % getrackt), sprang die Ansprachequote um Faktor 8. Jetzt:
        // Spalte vorhanden -> Wert oder echte 0; Spalte fehlt -> null.
        // Das Dashboard rechnet mit null keine Quote mehr, sondern zeigt "—".
        const callSpalte = iCalls >= 0 ? iCalls : iCallsAcd;
        const callCount = callSpalte >= 0 ? (cellNum(cells, callSpalte) || 0) : null;
        // FQ (Feedbackquote) liefert die Ligaliste seit 10/2026 nicht mehr (TNPS Antwortquote % bleibt leer).
        // Nutzer-Vorgabe 30.10.: FQ = TNPS-Antworten (Promotoren + Neutrale + Detraktoren) / Calls x 100.
        const pT = cellNum(cells, iPromTnps), dT = cellNum(cells, iDetrTnps), nT = cellNum(cells, iNeutTnps);
        const tnpsAntw = (pT != null || dT != null || nT != null) ? (pT || 0) + (dT || 0) + (nT || 0) : null;
        const fqN = callCount > 0 ? callCount : null;

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
          fq:    fqN && tnpsAntw != null ? tnpsAntw / fqN * 100 : null,   // selbst gerechnet (s. o.)
          tnpsAq: cellNum(cells, iFq),     // TNPS Antwortquote % (Portal)
          dds:   cellNum(cells, iDds),     // TNPS Deep Detractor %
          ftf:      cellNum(cells, iFtf),    // First-Time-Fix
          totalFix: cellNum(cells, iTotFix), // Total-Fix
          ff7:   cellNum(cells, iFf7),
          wq:    cellNum(cells, iWqI),     // Weiterl.-Quote Skill<>
          // Zaehler (fuer die "Zaehler"-Spalten im Stand-Export)
          aqZ:   cellNum(cells, iAqZ),
          csZ:   cellNum(cells, iCsZ),
          tnpsZ: cellNum(cells, iTnZ),
          fqZ:   fqN ? tnpsAntw : null,
          ddsZ:  cellNum(cells, iDdsZ),
          ftfZ:  cellNum(cells, iFtfZ),
          // Nenner = Bezugsmenge. Ist er 0, gibt es keine Basis: dann ist die
          // Kennzahl "keine Angabe" und NICHT "0 %".
          aqN:   cellNum(cells, iAqN),
          csN:   cellNum(cells, iCsN),
          tnpsN: cellNum(cells, iTnN),
          fqN,
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
          // Alles, was die Tabelle sonst noch hergibt — Kennzahlname -> {k,z,n}.
          // Damit sind kuenftige Kennzahlen ohne Parser-Aenderung im Dashboard.
          alle: leseAlle(cells),
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
  // ---------- Projekt/Baum/Vollstaendigkeit aus dem REQUEST-BODY lesen ----------
  // Der Body sagt die Wahrheit ueber den INHALT eines Pakets — der Fenstername
  // sagt nur, wer den Tab geoeffnet hat. Am 06.08. hat genau diese Luecke
  // zugeschlagen: ein unbenannter Hand-Tab mit geladener UM-Vorlage sendete
  // Kabel-Daten unter falschem Projekt weiter. description_settings_list traegt
  // die geladene Vorlage im Klartext (32595;11035;Vodafone_Kabel), belegt im
  // Mitschnitt ligaliste_vorlage_mitschnitt.txt fuer alle drei Projekte.
  // Funktionsdeklarationen (gehoistet): RC_ABFRAGEN steht weiter unten, wird
  // aber erst zur AUFRUFzeit gebraucht — da ist die Konstante laengst da.
  function projektAusPaket(body){
    if (!body) return null;
    try {
      const p = new URLSearchParams(body);
      const desc = p.get('description_settings_list') || '';
      if (/Vodafone_Kabel/i.test(desc))  return 'kabel';
      if (/Vodafone_Mobile/i.test(desc)) return 'mobile';
      if (/Vodafone_UM/i.test(desc))     return 'um';
      // Vorlage unbekannt/umbenannt: Baum gegen die gemessenen Saetze halten.
      const nodes = (p.get('nodeid_inlist') || '').trim();
      if (nodes) {
        for (const k in RC_ABFRAGEN) { if (RC_ABFRAGEN[k].nodes === nodes) return k; }
      }
    } catch(e){}
    return null;
  }
  function baumAusBody(body){
    if (!body) return '';
    try { return (new URLSearchParams(body).get('nodeid_inlist') || '').trim(); } catch(e){ return ''; }
  }
  // "vollstaendig" nur, wenn der Request wirklich ALLE bekannten Standorte
  // abfragt — sonst wuerde ein Teil-Paket den ganzen Dashboard-Bestand ersetzen.
  function lokVollstaendig(body){
    if (!body) return false;
    try {
      const im = String(new URLSearchParams(body).get('loc_inlist') || '').split(',').map(s => s.trim()).filter(Boolean);
      return RC_LOC_ALLE.split(',').every(s => im.indexOf(s) !== -1);
    } catch(e){ return false; }
  }
  // vollstaendig = "dieses Paket ist der GANZE aktuelle Bestand, nicht ein
  // Ausschnitt" (05.08.). Nur dann darf das Dashboard seinen rcKpiData-Bestand
  // ersetzen statt zu mergen. Gesetzt wird es ausschliesslich im Intraday-
  // Replay-Pfad mit allen Standorten — der Monatslauf holt nur Alanya und
  // wuerde als "vollstaendig" alle anderen Standorte wegraeumen.
  // extra (v6, optional): { projekt, baumNodes } aus dem Request-Body des
  // Nutzer-Klicks bzw. Replays — schlaegt Fensternamen und Diagnose-Baum.
  function sendKpis(kpis, liveDr, vollstaendig, extra) {
    // Standort-Auswahl mitschicken: das Dashboard kann sonst nicht erkennen, ob ein
    // Standort echt keine Daten hat oder nur im Portal abgewaehlt ist (siehe
    // fetchDaterangeKpis / loc_inlist).
    const stdInDaten = [...new Set(kpis.map(k => (k.standort || '').trim()).filter(Boolean))].sort();
    const msg = { type: 'KPI_BATCH', payload: kpis, history: loadHistory(),
                  liveDaterange: (liveDr !== undefined) ? liveDr : currentDaterange(),
                  locInlist: window.__rcLocInlist || null,
                  alleStandorte: alleStandorteAn(),
                  vollstaendig: !!vollstaendig,
                  standorteInDaten: stdInDaten,
                  // Projekt-Kennung (05.08.): OHNE sie kann ein Empfaenger nicht
                  // erkennen, aus welchem Referenzbaum die Daten stammen. Da
                  // jedes Dashboard seine Pakete per BroadcastChannel an die
                  // Nachbarn weiterreicht, wuerde ein vollstaendiges Kabel-Paket
                  // den Bestand des Mobile-Dashboards ERSETZEN (rcKpiBestand-
                  // Setzen) — im Takt ein Flip-Flop zwischen den Baeumen.
                  // Seit v6 kommt die Kennung bevorzugt aus dem REQUEST-BODY
                  // (extra.projekt) — der sagt, was wirklich abgefragt wurde.
                  // Der Fenstername ist nur noch Rueckfall; null bei unbenanntem
                  // Tab ohne Vorlage = altes Verhalten (Paket wird angenommen).
                  projekt: (extra && extra.projekt) || projektAusName(),
                  baumNodes: (extra && extra.baumNodes) || baumNodes() || null };
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

  // ---------- Sitzungsverlust: der einzige Fehler, den Wiederholen NICHT behebt ----------
  // Nach 2-3 Stunden laeuft die CCS-Sitzung ab. Ein Wiederholen in 20 Sekunden
  // aendert daran nichts — was hilft, ist ein Neuladen der Seite: der Autopilot
  // erkennt die Anmeldemaske, holt den Login ueber start.rb nach und startet den
  // Crawler wieder. Zusaetzlich wird das Dashboard benachrichtigt, damit die
  // Stoerung auf dem Wandmonitor SICHTBAR wird statt nur in der Konsole zu stehen.
  let letzterReload = 0, reloadZaehler = 0;
  const RELOAD_ABSTAND_MS = 10 * 60 * 1000;   // hoechstens ein Neuladen je 10 Min
  const RELOAD_MAX = 4;                        // danach hilft nur noch Handarbeit
  function meldeQuelleTot(grund){
    const msg = { type:'KPI_QUELLE_TOT', grund:String(grund||'unbekannt'),
                  zeit:Date.now(), projekt:projektAusName() };
    try { channel.postMessage(msg); } catch(e){}
    try { if (window.opener && !window.opener.closed) window.opener.postMessage(msg, '*'); } catch(e){}
    try { if (window.rcDashWin && !window.rcDashWin.closed) window.rcDashWin.postMessage(msg, '*'); } catch(e){}
  }
  function sitzungTot(grund){
    meldeQuelleTot(grund);
    if (reloadZaehler >= RELOAD_MAX) {
      console.warn('[KPI Crawler] Sitzung weiterhin tot — nach ' + RELOAD_MAX +
        ' Neuladeversuchen gebe ich auf. Bitte die Ligaliste von Hand neu anmelden.');
      return;
    }
    const jetzt = Date.now();
    if (jetzt - letzterReload < RELOAD_ABSTAND_MS) return;
    letzterReload = jetzt; reloadZaehler++;
    console.warn('[KPI Crawler] Sitzung abgelaufen — Seite wird neu geladen (' +
      reloadZaehler + '/' + RELOAD_MAX + '). Der Autopilot meldet neu an.');
    setTimeout(function(){ try { location.reload(); } catch(e){} }, 3000);
  }
  window.rcCrawlerSitzungTest = function(){ sitzungTot('von Hand ausgeloest'); };

  // ---------- v6-KERN: Antwort eines Ok-Klicks (oder Replays) verwerten ----------
  // EINE Verwertung fuer beide Wege. quelle nur fuers Log ('Klick' | 'Replay').
  // Rueckgabe { n, dr, grund } — pollKpis reicht sie an RC_LIVE_NOW durch.
  function verwerteAntwort(reqBody, text, quelle){
    const p = new URLSearchParams(reqBody || '');
    const dr = p.get('daterange') || '';
    const iv = p.get('interval') || '';
    const html = extractTableHtml(text);
    if (!html) {
      const ora = (String(text || '').match(/ORA-\d{5}[^<\n"]*/) || [''])[0];
      const tot = /keine Berechtigung|Sitzung|password|login/i.test(String(text || ''));
      const grund = ora ? ('Portal-Fehler: ' + ora)
                  : tot ? 'Sitzung abgelaufen / keine Berechtigung — im Portal neu anmelden und einmal Ok klicken'
                  : 'keine-tabelle';
      console.warn('[KPI Crawler] ' + quelle + ' (' + dr + '/' + iv + '): ' + grund);
      // Nur im automatischen Takt selbst heilen. Beim Ok-Klick sitzt der Nutzer
      // davor und sieht die Seite — ein Neuladen unter den Haenden waere dort
      // eine Zumutung, und die Meldung reicht.
      // Der GESICHERTE Mitschnitt wird bei totem Token mit verworfen: sonst
      // laedt der Neustart nach dem Reload denselben toten Body wieder vor
      // und dreht vier KPI_QUELLE_TOT-Runden, bevor die Alterung greift.
      if (tot && quelle !== 'Ok-Klick') {
        try { klickVerwerfen(); } catch(e){}
        // Ohne das lag hier ein 3-MINUTEN-LOCH (Nutzer-Befund 17.08.: "ich muss
        // zweimal ueber das KPI-Board starten, bis es mal klappt"): der
        // gesicherte Mitschnitt wird beim Start VORGELADEN, dabei ueberspringt
        // die Startweiche autoKlickPlanen. Ist sein Token tot, faellt er hier
        // heraus - und der naechste Anstoss kam erst mit dem 3-Minuten-Takt.
        // sitzungTot laedt zwar meist neu, aber nur bis RELOAD_MAX und nicht
        // innerhalb von RELOAD_ABSTAND_MS; danach stand der Crawler still.
        try { autoKlickPlanen(5000); } catch(e){}
        try { sitzungTot(grund); } catch(e){}
      }
      return { n: 0, dr, grund };
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const table = doc.querySelector('table#result-table') || doc.querySelector('table');
    if (!table) return { n: 0, dr, grund: 'kein-table-element' };
    const kpis = parseKpiTable(table);
    const projekt = projektAusPaket(reqBody);
    const fname = projektAusName();
    if (projekt && fname && projekt !== fname) {
      console.warn('[KPI Crawler] Fenstername sagt "' + fname + '", die geladene Vorlage sagt "' + projekt +
        '" — gesendet wird die VORLAGE (' + projekt + '). Das Dashboard des anderen Projekts verwirft das Paket.');
    }
    if (!kpis.length) {
      console.log('[KPI Crawler] ' + quelle + ' (' + dr + '/' + iv + '): 0 Zeilen — das Portal hat fuer diesen Zeitraum (noch) nichts. Nichts gesendet.');
      return { n: 0, dr, grund: '0-zeilen' };
    }
    // ERST HIER sichern (17.08.): jetzt ist belegt, dass dieser Rumpf eine
    // echte Tabelle liefert. Vorher sicherte der Hook blind jeden Request —
    // damit landete auch ein toter oder fremder Rumpf im Speicher und wurde
    // beim naechsten Start wieder vorgeladen. "Erledigt" heisst geliefert.
    try {
      if (window.__rcKlickSichern && window.__rcLastGetData &&
          window.__rcLastGetData.body === reqBody) {
        window.__rcKlickSichern(window.__rcLastGetData);
      }
    } catch(e){}
    const tage = storeByDate(kpis, dr);
    const voll = (dr === 'intraday') && lokVollstaendig(reqBody);
    sendKpis(kpis, dr, voll, { projekt, baumNodes: baumAusBody(reqBody) });
    console.log('[KPI Crawler] ' + quelle + ' verwertet: ' + kpis.length + ' Zeilen (' + dr + '/' + iv + ')' +
      (tage && tage.length ? ', Historie: ' + tage.join(', ') : '') +
      (projekt ? ', Projekt: ' + projekt : ', Projekt: unbekannt (keine Vorlage im Request)'));
    return { n: kpis.length, dr };
  }
  // Der Hook ruft diesen Handler fuer JEDEN get_data.rb-Request der SEITE auf
  // (= jeden Ok-Klick des Nutzers). Replays laufen NICHT hierher — sie nutzen
  // window.__rcFetchRoh und verwerten ihre Antwort selbst (sonst doppelt).
  // Stand die geklickte Abfrage NICHT auf Intraday (Woche, Monat, Gestern ...),
  // holt der Crawler den Live-Stand gleich selbst nach (05.10.). Vorher blieb
  // das Dashboard bis zum naechsten Takt auf "Ligaliste nicht live" stehen und
  // forderte den Nutzer auf, "Intraday" + Ok zu waehlen — genau den Handgriff,
  // den der Replay ohnehin macht (er stellt daterange/interval selbst um).
  var klickNachholTimer = null;
  const KLICK_NACHHOL_MS = 2500;
  window.__rcKlickHandler = function(reqBody, text){
    try {
      const res = verwerteAntwort(reqBody, text, 'Ok-Klick');
      if (res && res.n > 0 && res.dr && res.dr !== 'intraday' && res.dr !== 'today') {
        if (klickNachholTimer) clearTimeout(klickNachholTimer);
        klickNachholTimer = setTimeout(function(){ klickNachholTimer = null; pollKpis(false); }, KLICK_NACHHOL_MS);
        console.log('[KPI Crawler] Abfrage stand auf "' + res.dr + '" — der Live-Stand (Intraday) wird gleich selbst nachgeholt, du musst nichts umstellen.');
      }
    } catch(e){
      console.warn('[KPI Crawler] Klick-Antwort nicht verwertbar:', e);
    }
  };

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

  // ensureCapture (der Selbst-Klick zum Token-Sichern) ist in v6 ersatzlos
  // entfallen: der Token kommt aus dem Ok-Klick des NUTZERS — der Crawler
  // klickt grundsaetzlich nichts mehr von selbst.

  // Geparste Zeilen dem RICHTIGEN Tag zuordnen und speichern.
  // NIE blind als "heute" ablegen: die Seite kann auf "Gestern"/Woche stehen
  // (daterange-Select) — dann landeten Gestern-Werte als Heute im Dashboard.
  // drHint: der Zeitraum, den der AUFRUFER angefragt hat (Befund 05.08. aus dem
  // Livebetrieb). Ohne ihn beurteilte diese Funktion eine Intraday-REPLAY-Antwort
  // nach dem daterange-SELECT der Seite: steht das Portal auf "Aktuelle Woche"
  // (die bevorzugte Ansicht des Nutzers), kam bei jedem Live-Takt die Warnung
  // >Tabelle zeigt "current_week" ohne Datum-Spalte< und der Heute-Snapshot
  // wurde von den Live-Polls nie aktualisiert — obwohl die Antwort nachweislich
  // intraday war (der Request setzt daterange explizit, Zeile ~1010). Die
  // Live-Sendung ans Dashboard lief dabei durch; kalt blieb nur die Historie.
  function storeByDate(kpis, drHint){
    const withDate = kpis.filter(k => datumKey(k.datum));
    if (withDate.length) {
      const byDay = {};
      withDate.forEach(k => { const key = datumKey(k.datum); (byDay[key] || (byDay[key] = [])).push(k); });
      Object.keys(byDay).forEach(key => storeSnapshot(key, byDay[key]));
      return Object.keys(byDay).sort();
    }
    // Der Hinweis des Aufrufers schlaegt das Seiten-Select: beim Token-Replay
    // hat das Select mit der Antwort schlicht nichts zu tun.
    const dr = drHint || currentDaterange();
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

  // ---------- Abruf mit FRIST (05.10.) ----------
  // Bis hierher warteten Replay und Zeitraum-Abruf OHNE Zeitgrenze auf das
  // Portal. Blieb eine Antwort aus, kam das finally nie: die Seiten-Sperre
  // stand, bis sie verfiel, das Dashboard bekam auf "Jetzt" keine Antwort, und
  // kein Nachfassen wurde angemeldet (Fallstrick 9: ein Rueckruf, der nur im
  // Erfolgsfall feuert). Die Frist deckt Anfrage UND Lesen der Antwort.
  // Immer ueber den ROH-fetch: eigene Abrufe duerfen nicht durch den Hook
  // laufen — er hielte sie fuer einen Ok-Klick des Nutzers.
  const ABRUF_FRIST_MS = 90000;            // Live: gemessen 10-30 s je Antwort
  const ABRUF_FRIST_ZEITRAUM_MS = 150000;  // Woche/Monat auf Tagesbasis dauern laenger
  function abrufMitFrist(url, init, fristMs){
    const F = window.__rcFetchRoh || window.fetch;
    const frist = fristMs || ABRUF_FRIST_MS;
    const ac = (typeof AbortController === 'function') ? new AbortController() : null;
    let t = null;
    const lauf = F(url, ac ? Object.assign({}, init, { signal: ac.signal }) : init)
      .then(function(r){ return r.text().then(function(text){ return { ok: r.ok, status: r.status, text: text }; }); });
    const grenze = new Promise(function(_, nein){
      t = setTimeout(function(){
        try { if (ac) ac.abort(); } catch(e){}
        nein(new Error('keine Antwort in ' + Math.round(frist / 1000) + ' s'));
      }, frist);
    });
    return Promise.race([lauf, grenze]).then(
      function(a){ clearTimeout(t); return a; },
      function(e){ clearTimeout(t); throw e; });
  }

  // Live-Takt. Mit mitgeschnittenem Token laeuft das KOMPLETT an der Seite vorbei:
  // ein direkter intraday-Request, kein Ok-Klick, keine Select-Aenderung. Damit
  // kann der Crawler die Ansicht des Nutzers gar nicht mehr verstellen — genau die
  // Nebenwirkung, die frueher "wie von selbst" den Zeitraum umgeschaltet hat.
  // Ohne Token bleibt der bisherige Weg (Ok-Klick + DOM-Tabelle lesen).
  // ---------- Nachfassen statt 5 Minuten Funkstille (Korrektur 04.08.) ----------
  // Bis zum 03.08. gab es genau zwei Stellen, an denen der Crawler WUSSTE, dass
  // nichts geliefert wurde — die belegte Sperre und "Keine Daten gefunden" — und
  // an beiden tat er nichts. Der naechste Versuch kam erst im 5-Minuten-Takt.
  // Beim Start faellt das doppelt ins Gewicht: waehrend der Wochen-/Monatslauf
  // die Sperre haelt, laeuft der erste Live-Takt ins Leere, und das Dashboard
  // steht die ganze Zeit ohne Liga-Zahlen da. Jetzt wird nach 20 s nachgefasst,
  // gedeckelt auf drei Versuche in Folge. Der Zaehler wird bei jedem geglueckten
  // Sendevorgang zurueckgesetzt, damit ein spaeterer Ausfall wieder drei bekommt.
  var nachfassZaehler = 0;
  var nachfassTimer = null;
  const NACHFASS_MAX = 3;
  const NACHFASS_MS  = 20000;
  // Wie oft der 3-Minuten-Takt in Folge leer ausging. Ab REPLAY_TOT_MAX gilt der
  // gemerkte Rumpf als unbrauchbar - siehe Selbstheilung unten.
  var replayLeerFolge = 0;
  const REPLAY_TOT_MAX = 3;
  function nachfassen(grund){
    if (nachfassZaehler >= NACHFASS_MAX) {
      console.warn('[KPI Crawler] ' + grund + ' — nach ' + NACHFASS_MAX +
        ' Versuchen kein Nachfassen mehr. Der naechste Anlauf kommt im regulaeren ' +
        (POLL_INTERVAL / 60000) + '-Minuten-Takt.');
      // SELBSTHEILUNG (17.08., Live-Befund): vorher endete es genau hier - der
      // Takt drehte stundenlang mit demselben unbrauchbaren Rumpf weiter und
      // meldete jedes Mal dasselbe. Das ist die Fehlerklasse "stiller
      // Stillstand in Wartestellung": es gab eine Meldung, aber keine Folge.
      // Nach REPLAY_TOT_MAX ausgeschoepften Runden wird der Rumpf verworfen und
      // die Auto-Abfrage holt einen frischen Ok-Klick.
      if (++replayLeerFolge >= REPLAY_TOT_MAX) {
        replayLeerFolge = 0;
        console.warn('[KPI Crawler] Der gemerkte Request liefert dauerhaft nichts — ' +
          'er wird verworfen, die Auto-Abfrage holt einen neuen Ok-Klick.');
        try { klickVerwerfen(); } catch(e){}
        try { autoKlickVersuche = 0; autoKlickPlanen(3000); } catch(e){}
      }
      return;
    }
    nachfassZaehler++;
    if (nachfassTimer) clearTimeout(nachfassTimer);
    console.log('[KPI Crawler] ' + grund + ' — neuer Versuch in ' + (NACHFASS_MS / 1000) +
      ' s (' + nachfassZaehler + '/' + NACHFASS_MAX + ').');
    nachfassTimer = setTimeout(() => { nachfassTimer = null; pollKpis(false); }, NACHFASS_MS);
  }

  // Liefert ein Promise auf { ok, n, grund } (05.08.) — der Knopf "Jetzt
  // aktualisieren" im Dashboard liest den Ausgang.
  // v6: KEIN Ok-Klick, KEIN DOM-Lesen, KEIN selbst gebauter Request mehr.
  // Der Takt ist ein reines REPLAY des zuletzt vom Nutzer geklickten Requests,
  // umgestellt werden GENAU die zwei Felder daterange/interval (die einzigen,
  // in denen sich die gemessenen Rumpfe unterscheiden — Mitschnitt 06.08.).
  // Ohne gemerkten Klick passiert NICHTS ausser einem Hinweis: der Nutzer
  // klickt beim Start selbst (Woche/Tag, dann Intraday), das ist der Vertrag.
  function pollKpis(withRefresh) {
    const cap = window.__rcLastGetData;
    if (!cap || !cap.body) {
      if (autoKlickAn()) {
        // Auto-Abfrage (16.08.): der Takt stoesst den Selbstklick an, statt
        // nur zu erklaeren, was der Nutzer klicken soll. Der 3-Min-Takt gibt
        // einer ausgeschoepften Versuchsreihe eine neue Chance.
        autoKlickVersuche = Math.min(autoKlickVersuche, AUTO_KLICK_MAX - 1);
        autoKlickPlanen(1500);
        console.log('[KPI Crawler] Noch kein Ok-Klick gemerkt — Auto-Abfrage versucht es selbst. ' +
          'Abschalten: rcCrawlerAutoKlick(false).');
        return Promise.resolve({ ok:false, n:0, grund:'noch kein Ok-Klick gemerkt — Auto-Abfrage laeuft' });
      }
      console.log('[KPI Crawler] Noch kein Ok-Klick gemerkt — auf der Ligaliste Vorlage laden, ' +
        '"Aktuelle Woche"+"Tag"+Ok, dann "Intraday"+Ok. Danach laeuft der ' + (POLL_INTERVAL/60000) + '-Minuten-Takt von selbst. (Auto-Abfrage ist abgeschaltet: rcCrawlerAutoKlick(true) schaltet sie ein.)');
      return Promise.resolve({ ok:false, n:0, grund:'noch kein Ok-Klick gemerkt — einmal im Portal Ok klicken' });
    }
    if (!sperreNehmen('Live-Takt')) {
      const halter = sperreHalter() || 'unbekannt';
      nachfassen('Live-Takt uebersprungen, die Seite ist gerade belegt (' + halter + ')');
      return Promise.resolve({ ok:false, n:0, grund:'belegt durch ' + halter });
    }

    const doReplay = async () => {
      let geliefert = false, ehrlichLeer = false;
      try {
        const p = new URLSearchParams(cap.body);
        p.set('daterange', 'intraday');
        p.set('interval',  'cumulate');
        p.set('startdate', 'undefined');
        p.set('enddate',   'undefined');
        // Roh-fetch (in abrufMitFrist): der eigene Replay darf nicht durch den
        // Hook laufen — sonst wuerde jede Antwort doppelt verwertet und der
        // gemerkte Nutzer-Klick durch den eigenen Replay ueberschrieben.
        let r;
        try {
          r = await abrufMitFrist(cap.url, { method:'POST', credentials:'include',
            headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8', 'accept':'*/*', 'x-requested-with':'XMLHttpRequest' },
            body: p.toString() }, ABRUF_FRIST_MS);
        } catch(e){ return { ok:false, n:0, grund:'fetch-fehler: ' + (e && e.message || e) }; }
        const text = r.text;
        if (!r.ok) {
          const ora = (text.match(/ORA-\d{5}[^<\n"]*/) || [''])[0];
          return { ok:false, n:0, grund:'HTTP ' + r.status + (ora ? ' — ' + ora : '') };
        }
        const res = verwerteAntwort(p.toString(), text, 'Replay');
        if (res.n > 0) { geliefert = true; return { ok:true, n:res.n }; }
        ehrlichLeer = (res.grund === '0-zeilen');
        return { ok:false, n:0, grund:res.grund || 'keine-daten' };
      } finally {
        sperreGeben('Live-Takt');
        // Erst NACH dem Freigeben nachfassen — sonst liefe der neue Versuch
        // gegen die eigene, noch gehaltene Sperre. Bei einer EHRLICH leeren
        // Antwort (0 Zeilen, z. B. frueher Morgen) wird NICHT nachgefasst:
        // das ist kein Fehler, den ein Wiederholen in 20 s beheben koennte.
        if (geliefert) { nachfassZaehler = 0; replayLeerFolge = 0; }
        else if (ehrlichLeer) replayLeerFolge = 0;   // 0 Zeilen = Rumpf ist in Ordnung
        else nachfassen('Live-Takt hat keine Daten geliefert');
      }
    };
    return doReplay();
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
  // "leer+flag" IST RAUS (belegt 05.08. am echten Portal).
  // Die Variante stammte aus einer Analogie: bei den TEAMS schickt das Portal
  // eine leere Liste plus all_teams_selected=true, also lag nahe, dass es bei
  // den Standorten genauso geht. Tut es NICHT. Gemessen mit liga_diagnose.js
  // gegen get_data.rb, alles andere identisch:
  //     liste+spiegel -> HTTP 200, 187 Zeilen
  //     nur-liste     -> HTTP 200, 187 Zeilen
  //     leer+flag     -> HTTP 500, ORA-00936: Ausdruck fehlt
  // Serverseitig entsteht daraus offenbar ein leeres IN () — genau das meint
  // "Ausdruck fehlt". Das war die Ursache dafuer, dass der Live-Takt stundenlang
  // gar nichts lieferte: eine einmal gemerkte kaputte Variante wurde bei JEDEM
  // Versuch erneut benutzt, und der Rueckfall probierte sie in der Kette wieder
  // mit. Die Analogie zu den Teams bleibt als Warnung stehen, nicht als Code.
  const LOC_VARIANTEN = [
    { id: 'liste+spiegel+flag', text: 'Liste, Spiegel-Liste und "alle"-Flag gesetzt' },
    { id: 'liste',              text: 'nur die Liste (bisheriger Weg)' },
    { id: 'liste+spiegel',      text: 'Liste und Spiegel-Liste, Flag unveraendert' }
  ];
  const LS_LOC_VARIANTE = 'rcCrawlerLocVariante';
  function locVariante(){
    try {
      const v = localStorage.getItem(LS_LOC_VARIANTE);
      // Eine frueher gemerkte, inzwischen entfernte Variante (insbesondere das
      // kaputte "leer+flag") wird hier still verworfen — sonst haette der
      // localStorage den Fehler ueber jedes Update hinweg am Leben gehalten.
      if (v && LOC_VARIANTEN.some(x => x.id === v)) return v;
      if (v) {
        console.warn('[KPI Crawler] Gemerkte Standort-Schreibweise "' + v +
          '" gibt es nicht mehr (sie lieferte ORA-00936). Zurueck auf "' +
          LOC_VARIANTEN[0].id + '".');
        try { localStorage.removeItem(LS_LOC_VARIANTE); } catch(e){}
      }
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
    const setztSpiegel = (variante === 'liste+spiegel' || variante === 'liste+spiegel+flag');
    params.delete('loc_inlist'); params.delete('loc_inlist[]');
    if (setztSpiegel) { params.delete('loc_inlist_c'); params.delete('loc_inlist_c[]'); }
    // EIN Parameter mit KOMMAS — nicht n Einzelparameter (belegt 05.08. abends).
    // Genau dieselbe Regel wie bei nodeSetzen, dort steht sie seit jeher im
    // Kommentar; hier wurde sie verletzt. Der echte Portal-Request schickt
    //     loc_inlist=Alanya,Alexandroupolis,Berlin,...
    // waehrend append() daraus
    //     loc_inlist=Alanya&loc_inlist=Alexandroupolis&...
    // machte. Das Portal antwortet darauf mit einer LEEREN Tabelle (kein
    // Fehler, kein Hinweis) — der Crawler meldete nur "keine-tabelle" und
    // probierte alle Schreibweisen durch, die aus demselben Grund alle
    // scheiterten. Gemessen mit liga_diagnose.js: mit join(',') HTTP 200 und
    // 533 Zeilen, mit append() nichts.
    //
    // Der frueher hier stehende Sonderfall "Listen leer lassen,
    // all_locations_selected=true" ist am selben Tag durchgefallen
    // (HTTP 500, ORA-00936) und wurde entfernt — siehe LOC_VARIANTEN.
    params.set('loc_inlist', standorte.join(','));
    if (variante === 'liste+spiegel' || variante === 'liste+spiegel+flag') {
      params.set('loc_inlist_c', standorte.join(','));
    } else if (setztSpiegel) {
      params.set('loc_inlist_c', spiegelVorher.join(','));   // unveraendert lassen
    }
    if (variante === 'liste+spiegel+flag') {
      params.set('all_locations_selected', alleGewaehlt ? 'true' : 'false');
    }
    window.__rcLocGesetzt = standorte;
    window.__rcLocVariante = variante;
  }

  // ---------- Referenzbaum / Stack (nodeid_inlist) ----------
  // Die Ligaliste filtert ueber einen REFERENZBAUM. Belegt aus dem Abfrage-
  // Baukasten (PIX-Fassung von Ligaliste_Crawler.html): der Request traegt
  // nodeid_inlist UND nodeid_inlist_c (Spiegel-Liste), beide als EIN Parameter
  // mit Kommas — bei VUM_Care sind es zwoelf Knoten in einer Kette.
  //
  // Bis 05.08. hat dieser Crawler die beiden Parameter aus dem mitgeschnittenen
  // Request geerbt. Welchen Baum das Dashboard sieht, hing damit daran, was im
  // Portal gerade angehakt war — dieselbe Fehlerklasse wie bei der Standort- und
  // der Kennzahl-Auswahl ("erben statt setzen", jetzt zum vierten Mal). Es ist
  // ein heisser Kandidat dafuer, dass Dashboard und Ligaliste verschiedene
  // Zahlen zeigen, obwohl beide "aktuell" sind.
  //
  // ABSICHTLICH NOCH KEINE VORGABE: welcher Baum zu welchem ESL-Projekt gehoert,
  // ist nicht belegt (vier Baeume, drei ESL-Projekte). Solange rcCrawlerBaum()
  // leer ist, bleibt alles exakt wie bisher. Gemessen wird mit rcCrawlerBaumTest().
  // Die ersten drei Eintraege sind BELEGT (05.08.): der Nutzer hat an jedem der
  // drei Stacks den Baum von Hand gewaehlt, auf Ok geklickt und den echten
  // get_data.rb-Rumpf mitgeschnitten. nodeid_inlist war:
  //   Kabel  -> 11406         (Tec > Voice > 1st > Non-Konvergent > KA > Credit)
  //   Mobile -> 11233,11248   (1212 Care UND 1212 Tec zusammen - Care+Tec ist
  //                            im Mobile-Stack EIN Monitor, nicht zwei)
  //   UM     -> 12809         (Care > ... > UM > Standard Care > Empowered 1st > Care)
  // Die aelteren Vermutungs-Eintraege darunter bleiben fuer Versuche stehen;
  // fuer die Stack-Trennung der drei Monitore gelten die belegten.
  // KORREKTUR 05.08. abends: Der Nutzer hat im Portal DREI eigene Vorlagen
  // angelegt — "Kabel TEC", "MOB CARE", "VUM CARE". Sein gespeicherter
  // Kabel-Request nutzt nodeid_inlist=11405 (KA), nicht 11406 (Credit): also
  // eine Ebene HOEHER als der fruehe Mitschnitt. Die Vorlage ist die Wahrheit,
  // nicht mein alter Mitschnitt — dieser Eintrag ist deshalb nur noch der
  // Rueckfall, falls die Vorlage im Portal nicht gefunden wird.
  const RC_VORLAGEN = { kabel: 'Kabel TEC', mobile: 'MOB CARE', um: 'VUM CARE' };
  const RC_BAEUME = [
    { key:'Kabel',    name:'Vodafone Kabel',  nodes:'11405',       pfad:'Tec > Voice > 1st > NK > KA (Vorlage "Kabel TEC", belegt 05.08.)' },
    { key:'Mobile',   name:'Vodafone Mobile', nodes:'11233,11248', pfad:'MF > Credit > 1212 Care + 1212 Tec (belegt 05.08.)' },
    { key:'UM',       name:'Vodafone UM',     nodes:'12809',       pfad:'Care > KA > Credit > UM > Standard Care > Empowered 1st > Care (belegt 05.08.)' },
    { key:'VKD_Tech', name:'VKD_Tech', nodes:'11406', pfad:'KA > Credit' },
    { key:'VUM_Care', name:'VUM_Care', nodes:'12133,12255,12595,12699,12787,12809,13328,13344,13345,13348,13389,13391', pfad:'KA > Credit > UM > Care > Standard Care (FCR-Vorlage, breiter als die Nutzer-Auswahl)' },
    { key:'Mob_Tech', name:'Mob_Tech', nodes:'11248', pfad:'MF > Credit > 1212 Tec' },
    { key:'Mob_Care', name:'Mob_Care', nodes:'11233', pfad:'MF > Credit > 1212 Care' }
  ];
  const LS_BAUM = 'rcCrawlerBaum';
  // Welches ESL-Projekt bedient dieser Ligalisten-Tab? Abgeleitet aus dem
  // FENSTERNAMEN, den das oeffnende Dashboard vergibt (rcKey('rcKpiQuelle') ->
  // rcKpiQuelle / rcKpiQuelle_mob / rcKpiQuelle_um). window.name ist tab-eigen,
  // ueberlebt Navigation und Reload und ist cross-origin im eigenen Fenster
  // lesbar — genau deshalb nutzt ihn schon der Autopilot als Ziel-Merker.
  // Ein von Hand geoeffneter Tab hat keinen dieser Namen -> null, und es bleibt
  // beim bisherigen Verhalten (localStorage bzw. Portal-Baum).
  function projektAusName(){
    var n = '';
    try { n = String(window.name || ''); } catch(e){ return null; }
    if (n.indexOf('rcKpiQuelle') !== 0) return null;
    if (n === 'rcKpiQuelle_mob') return 'mobile';
    if (n === 'rcKpiQuelle_um')  return 'um';
    if (n === 'rcKpiQuelle')     return 'kabel';
    return null;
  }
  // Baum je Projekt — die drei belegten Eintraege aus RC_BAEUME (05.08.).
  function baumFuerProjekt(projekt){
    var key = projekt === 'kabel' ? 'Kabel' : projekt === 'mobile' ? 'Mobile' : projekt === 'um' ? 'UM' : null;
    if (!key) return '';
    var b = RC_BAEUME.find(x => x.key === key);
    return b ? b.nodes : '';
  }
  // ---- Baum aus der PORTAL-VORLAGE lesen (05.08. abends) ----------------
  // Der Nutzer pflegt im Referenzbaum-Kasten eigene Vorlagen ("Kabel TEC",
  // "MOB CARE", "VUM CARE"). Jeder Eintrag traegt seine Knoten im Attribut
  // data-node_ids. Das ist der bessere Weg als eine fest verdrahtete ID:
  // aendert der Nutzer seine Vorlage, folgt der Crawler automatisch — er muss
  // nicht jedes Mal im Code nachgezogen werden. Genau daran ist die erste
  // Fassung gescheitert: sie erzwang 11406, waehrend die Vorlage 11405 sagt.
  // Gesucht wird in BEIDEN Listen (globale und persoenliche), Name ohne
  // Beachtung von Gross-/Kleinschreibung und Randleerzeichen.
  function vorlageNodes(projekt){
    var name = RC_VORLAGEN[projekt];
    if (!name) return '';
    var ziel = String(name).trim().toLowerCase();
    try {
      var eintraege = document.querySelectorAll('.crtree-templates-list-entry');
      for (var i = 0; i < eintraege.length; i++) {
        var e = eintraege[i];
        var t = (e.textContent || '').trim().toLowerCase();
        if (t !== ziel) continue;
        var ids = (e.getAttribute('data-node_ids') || '').trim();
        if (ids) return ids;
      }
    } catch(e){}
    return '';
  }
  // Konsole: zeigt, welche Vorlage gefunden wurde und welche Knoten daraus
  // kommen — die erste Frage bei "er nimmt den falschen Baum".
  window.rcCrawlerVorlagen = function(){
    var raus = {};
    ['kabel','mobile','um'].forEach(function(p){
      raus[p] = { vorlage: RC_VORLAGEN[p], nodes: vorlageNodes(p) || '(nicht im Portal gefunden)' };
    });
    var alle = [];
    try { document.querySelectorAll('.crtree-templates-list-entry').forEach(function(e){
      alle.push((e.textContent||'').trim() + '  ->  ' + (e.getAttribute('data-node_ids')||''));
    }); } catch(e){}
    console.log('[KPI Crawler] Projekt dieses Tabs: ' + (projektAusName() || '(unbenannt)'));
    console.table(raus);
    console.log('[KPI Crawler] Alle Vorlagen im Portal (' + alle.length + '):\n  ' + alle.join('\n  '));
    return raus;
  };
  function baumNodes(){
    if (window.__rcNodesAus) return '';               // in dieser Sitzung abgelehnt
    if (window.__rcBaumNodes) return window.__rcBaumNodes;   // per rcCrawlerBaum gesetzt
    // Projekt-Ableitung VOR localStorage (05.08.): rcCrawlerBaum liegt im
    // localStorage von ccs.vodafone.de und wird von ALLEN Ligalisten-Tabs
    // geteilt — drei Tabs mit drei Baeumen wuerden sich dort gegenseitig
    // ueberschreiben, der zuletzt gesetzte gaelte fuer alle. Die Ableitung aus
    // dem Fensternamen ist dagegen tab-eigen.
    var p = projektAusName();
    if (p) {
      // 1. Die VORLAGE des Nutzers im Portal — sie ist die Wahrheit. Aendert er
      //    sie dort, folgt der Crawler ohne Code-Aenderung.
      var v = vorlageNodes(p);
      if (v) return v;
      // 2. Nur wenn die Vorlage fehlt: die hinterlegte Kennung als Notnagel.
      var n = baumFuerProjekt(p);
      if (n) return n;
    }
    try { return localStorage.getItem(LS_BAUM) || ''; } catch(e){ return ''; }
  }
  // ids ist EIN Parameter mit Kommas, nicht n Einzelparameter.
  function nodeSetzen(params, ids){
    if (!ids) return;
    params.delete('nodeid_inlist');   params.delete('nodeid_inlist[]');
    params.delete('nodeid_inlist_c'); params.delete('nodeid_inlist_c[]');
    params.set('nodeid_inlist',   ids);
    params.set('nodeid_inlist_c', ids);
    window.__rcNodeGesetzt = ids;
  }
  window.rcCrawlerBaeume = () => RC_BAEUME.map(b => b.key + '  ' + b.nodes + '   (' + b.pfad + ')').join('\n');
  window.rcCrawlerBaum = function(key){
    if (key === undefined) { const n = baumNodes(); return n ? (RC_BAEUME.find(b => b.nodes === n) || {key:'(eigene IDs)'}).key + ' = ' + n : '(keiner — der Baum kommt aus dem Portal)'; }
    if (key === false || key === null || key === '') { try { localStorage.removeItem(LS_BAUM); } catch(e){} window.__rcBaumNodes = ''; return 'Baum-Vorgabe entfernt — es gilt wieder die Portal-Auswahl.'; }
    const b = RC_BAEUME.find(x => x.key.toLowerCase() === String(key).toLowerCase());
    const ids = b ? b.nodes : String(key);
    try { localStorage.setItem(LS_BAUM, ids); } catch(e){}
    window.__rcBaumNodes = ids;
    return 'Referenzbaum gesetzt: ' + (b ? b.key : 'eigene IDs') + ' = ' + ids + ' (gilt ab der naechsten Abfrage).';
  };

  // Einen Zeitraum direkt anfordern (get_data.rb nachstellen) -> geparste KPI-Zeilen
  // daterangeVal: 'current_month' | 'intraday' | 'user_defined' | ...
  // opts.startdate/enddate: nur fuer user_defined (Format YYYYMMDD, siehe harvestRangeApi)
  // opts.interval: 'day' (Default, liefert die Datum-Spalte) oder 'cumulate'.
  //   WICHTIG: intraday ist ein TAG — dort waere interval=day sinnlos, das Portal
  //   soll die laufende Summe liefern. Deshalb dort immer 'cumulate'.
  // ===========================================================================
  //  RC_ABFRAGEN — die GEMESSENEN Parametersaetze je Projekt (06.08.2026)
  // ===========================================================================
  //  Der Nutzer hat am 06.08. seine drei Portal-Vorlagen geladen und den echten
  //  get_data.rb-Rumpf mitgeschnitten (ligaliste_vorlage_mitschnitt.txt). Damit
  //  ist Schluss mit Raten: der Rumpf ist VOLLSTAENDIG und selbsttragend — Baum,
  //  Standorte, Kennzahlen, Tabellen-Typ, alles steht drin.
  //
  //  Zwei Dinge hat der Mitschnitt widerlegt:
  //    1. script_settings.rb (das "Laden" der Vorlage) gibt nur 3 Zeichen zurueck.
  //       Es liefert die Einstellungen NICHT — wir brauchen es also gar nicht.
  //    2. Zwischen "Aktuelle Woche/Tag" und "Intraday/kumuliert" unterscheiden
  //       sich die Rumpfe in GENAU zwei Feldern: daterange und interval.
  //       Alles andere ist Byte fuer Byte identisch.
  //  Daraus folgt der ganze Aufbau hier: feste Saetze + zwei Stellschrauben.
  //
  //  ACHTUNG — zwei Baeume waren im Code FALSCH dokumentiert (jetzt gemessen):
  //       Mobile   war 11233,11248   ->  richtig 11317,11229
  //       UM       war 12809         ->  richtig 12090
  //  Kabel (11405) stimmte. Mit falschem Baum liefert das Portal die Daten eines
  //  fremden Bereichs oder gar nichts — ohne Fehlermeldung.
  const RC_LOC_ALLE = 'Alanya,Alexandroupolis,Berlin,Essen,Neubrandenburg,Potsdam,regiocom_W_Home,Sakarya,Serres';
  const RC_FIGURES  = '10004,10005,10006,10014,10082,10062,10339,10075,10355,10340,10080,10081,10063,10064,10065,10076,10077,10078,10067,10060,10061,10357,10358';
  const RC_ABFRAGEN = {
    kabel:  { nodes: '11405',       vorlage: 'Vodafone_Kabel'  },
    mobile: { nodes: '11317,11229', vorlage: 'Vodafone_Mobile' },
    um:     { nodes: '12090',       vorlage: 'Vodafone_UM'     }
  };
  // Aus dem mitgeschnittenen Request kommen NUR die sitzungsabhaengigen Werte:
  // das Token und die Benutzerkennung. Alles, was die Abfrage FORMT, wird hier
  // gesetzt — genau der Punkt, an dem "erben statt setzen" (Fallstrick Nr. 2)
  // frueher die Standort- und Kennzahl-Auswahl des Portals mitgeschleppt hat.
  function baueAbfrage(projekt, daterangeVal, intervalVal, opts){
    const cap = window.__rcLastGetData;
    if (!cap || !cap.body) return null;
    const alt = new URLSearchParams(cap.body);
    const uid = alt.get('user_id') || '';
    const a = RC_ABFRAGEN[projekt] || RC_ABFRAGEN.kabel;
    const p = new URLSearchParams();
    p.set('type', 'get-result');
    p.set('script_id', alt.get('script_id') || '11035');
    p.set('script_id_secure', alt.get('script_id_secure') || '');
    p.set('user_id', uid);
    p.set('tree_template', 'null');
    p.set('ffr_template', '');
    // Baum: EIN Parameter mit Kommas, plus die Spiegel-Liste (_c). Dieselbe
    // Regel wie bei loc_inlist — n Einzelparameter ergeben eine LEERE Tabelle
    // ohne jede Fehlermeldung (Befund 05.08.).
    p.set('nodeid_inlist',   a.nodes);
    p.set('nodeid_inlist_c', a.nodes);
    p.set('spid_inlist',   '10026');
    p.set('spid_inlist_c', '10026');
    p.set('cumulate_provider',  '0');
    p.set('cumulate_locations', '0');
    p.set('cumulate_teams',     '0');
    p.set('loc_inlist',   RC_LOC_ALLE);
    p.set('loc_inlist_c', RC_LOC_ALLE);
    p.set('teamid_inlist', '');
    p.set('daterange', daterangeVal);
    p.set('interval',  intervalVal);
    p.set('startdate', (opts && opts.startdate) ? opts.startdate : 'undefined');
    p.set('enddate',   (opts && opts.enddate)   ? opts.enddate   : 'undefined');
    p.set('show_more_settings', '1');
    p.set('figure_list', RC_FIGURES);
    p.set('figure_group_list', '');
    p.set('show_hms', '1');                  // Zeitspalten als hh:mm:ss (timeToSec)
    p.set('show_nodes', '0');
    p.set('show_employeeid', '0');
    p.set('show_ccsid', '1');                // die CCS-ID ist der Join-Schluessel
    p.set('show_notready_durations', '0');
    p.set('show_ffr_templates', '0');
    p.set('show_excel_pivot_header', '0');
    p.set('agent_select', '-1');
    p.set('ccsid', '');
    p.set('table_type', '2');
    p.set('all_provider_selected',  'false');
    p.set('all_locations_selected', 'false');   // Teilauswahl! true + leere Liste = ORA-00936
    p.set('all_teams_selected',     'true');
    p.set('description_settings_list', uid + ';11035;' + a.vorlage);
    p.set('setting_type', 'personal');
    return p;
  }

  async function fetchDaterangeKpis(daterangeVal, opts){
    const cap = window.__rcLastGetData;
    if (!cap || !cap.body) return { kpis:null, reason:'kein-request' };
    const iv0 = (opts && opts.interval) ? opts.interval
              : ((daterangeVal === 'intraday' || daterangeVal === 'today') ? 'cumulate' : 'day');
    // ACHTUNG: projektAusName() liefert null fuer JEDEN Tab, der nicht ueber den
    // Dashboard-Knopf "KPI-Quelle" geoeffnet wurde (window.open setzt dort den
    // Fensternamen). Der Waechter aus ESL_Start.cmd injiziert den Crawler-Code
    // aber bewusst in JEDEN ccs.vodafone.de-Tab — auch von Hand geoeffnete
    // Test-Tabs. Faelschlich als 'kabel' zu raten waere GENAU der Fehler, den
    // dieser Umbau beheben sollte, nur umgekehrt: ein Test-Tab mit geladener
    // UM-Vorlage fragte am 06.08. den KABEL-Baum ab (0 Zeilen, dann bei
    // erfolgreichem Wochenlauf sogar KABEL-Daten unter falschem Namen versendet).
    const projektErkannt = (opts && opts.projekt) || projektAusPaket(cap.body) || projektAusName();
    const projekt = projektErkannt || 'kabel';   // nur fuer figures/loc (die sind bei allen drei Projekten identisch)
    const params = baueAbfrage(projekt, daterangeVal, iv0, opts);
    if (!params) return { kpis:null, reason:'kein-request' };
    // v6: Der Baum kommt IMMER aus der zuletzt im Portal geladenen Anfrage,
    // wenn dort einer steht — das ist exakt die Vorlage, die der Nutzer von
    // Hand gewaehlt hat, und die schlaegt jede Vorgabe. RC_ABFRAGEN bleibt
    // nur der Notnagel fuer den Fall, dass der Mitschnitt keinen Baum traegt.
    {
      const alt = new URLSearchParams(cap.body);
      const ererbterBaum = (alt.get('nodeid_inlist') || alt.get('nodeid_inlist_c') || '').trim();
      if (ererbterBaum) {
        params.set('nodeid_inlist', ererbterBaum);
        params.set('nodeid_inlist_c', ererbterBaum);
        const desc = alt.get('description_settings_list');
        if (desc) params.set('description_settings_list', desc);
      } else {
        console.warn('[KPI Crawler] Kein Baum in der zuletzt geladenen Anfrage gefunden — ' +
          'es wird mit der Vorgabe fuer "' + projekt + '" (' + params.get('nodeid_inlist') + ') abgefragt.');
      }
    }
    window.__rcLocInlist = RC_LOC_ALLE.split(',');
    window.__rcAbfrageProjekt = projektErkannt || ('unbenannt(' + (window.name || '-') + ')');
    /* ---- Der frueher hier stehende Block ist ersatzlos entfallen (06.08.) ----
       Er nahm den mitgeschnittenen Rumpf als Grundlage und schrieb darin
       daterange, interval, loc_inlist (in vier Schreibweisen zum Durchprobieren),
       nodeid_inlist und figure_list um. Jede dieser Groessen war eine mögliche
       Fehlerquelle, und bei Misserfolg meldete das Portal nur "keine-tabelle".
       Seit die drei Rumpfe GEMESSEN vorliegen (RC_ABFRAGEN), wird der ganze
       Request neu gebaut statt geerbt — es gibt nichts mehr zu probieren.
       Was dadurch wegfaellt: LOC_VARIANTEN, locSetzen/locVariante, nodeSetzen,
       die figure_list-Ruecknahme und alle drei Rueckfall-Ketten weiter unten. */
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
    // Ein einziger Versuch. Frueher standen hier drei Rueckfall-Ketten
    // (Kennzahlen -> Baum -> vier Standort-Schreibweisen). Sie waren noetig,
    // solange die richtige Schreibweise unbekannt war; jetzt ist sie gemessen.
    // Ein Rueckfall wuerde ab hier nur noch verschleiern, WAS schiefging —
    // genau die Ambiguitaet, die am 05.08. eine Stunde gekostet hat.
    async function einVersuch(p){
      // ROH-fetch mit Frist (05.10.). Bis dahin lief dieser Abruf ueber das
      // gehookte window.fetch: der Hook hielt den eigenen Wochenlauf fuer einen
      // Ok-Klick des Nutzers, ersetzte dessen gemerkte Abfrage durch den hier
      // GEBAUTEN Rumpf und schickte die Wochenzeilen ein zweites Mal als
      // "current_week" ans Dashboard — das meldete darauf "Ligaliste steht auf
      // current_week ... Intraday + Ok waehlen" (Logbuch 05.10., 17:13:43).
      let r;
      try {
        r = await abrufMitFrist(cap.url, { method:'POST', credentials:'include',
          headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8', 'accept':'*/*', 'x-requested-with':'XMLHttpRequest' },
          body: p.toString() }, ABRUF_FRIST_ZEITRAUM_MS);
      } catch(e){ return { kpis:null, reason:'fetch-fehler:' + (e && e.message || e) }; }
      // Den ORACLE-Fehler MITLESEN, nicht nur den Status. "HTTP 500" allein
      // sagt nichts; "ORA-00936: Ausdruck fehlt" nennt die Ursache (ein leerer
      // Ausdruck in der Abfrage — typisch fuer eine leere Auswahlliste oder
      // eine Knoten-Kennung, die es nicht mehr gibt). Genau diese Zeile hat
      // am 05.08. eine Stunde Suche gekostet.
      if (!r.ok) {
        const ora = (String(r.text || '').match(/ORA-\d{5}[^<\n"]*/) || [''])[0];
        return { kpis:null, reason:'HTTP ' + r.status + (ora ? ' — ' + ora : '') };
      }
      const text = r.text;
      const html = extractTableHtml(text);
      if (!html) {
        const ora = (text.match(/ORA-\d{5}[^<\n"]*/) || [''])[0];
        return { kpis:null, reason: ora ? ('Portal-Fehler: ' + ora) : 'keine-tabelle', sample:text.slice(0,300) };
      }
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const table = doc.querySelector('table#result-table') || doc.querySelector('table');
      if (!table) return { kpis:null, reason:'kein-table-element' };
      return { kpis: parseKpiTable(table) };
    }

    const res = await einVersuch(params);
    if (res.kpis && res.kpis.length) return res;
    // Kein Rueckfall mehr — dafuer ein Befund, mit dem man etwas anfangen kann.
    // Der TATSAECHLICH benutzte Baum steht in params, nicht in RC_ABFRAGEN[projekt] —
    // bei einem unbenannten Tab kann das der geerbte Baum aus der Seite sein.
    console.warn('[KPI Crawler] ' + (projektErkannt || 'unbenannter Tab') + ' / ' + daterangeVal + '/' + iv0 +
      ' brachte keine Zeilen: ' + (res.reason || '0 Zeilen') +
      '\n  Baum ' + params.get('nodeid_inlist') +
      (projektErkannt ? ' (Vorlage "' + (RC_ABFRAGEN[projektErkannt] || {}).vorlage + '")' : ' (geerbt aus der Seite, kein Projekt erkannt)') +
      '\n  Stimmt der Baum noch? Im Portal die Vorlage laden und rc_lupe.js mitschneiden lassen.');
    return res;
  }

  // Jeden der vier Referenzbaeume EINMAL abfragen und zeigen, was zurueckkommt.
  // Beantwortet die Frage, die offline nicht zu klaeren ist: Was liefert das
  // Portal heute (ohne Vorgabe), und was liefert jeder einzelne Baum?
  // Veraendert die Seite nicht, schickt nur Anfragen. Aufruf: rcCrawlerBaumTest()
  window.rcCrawlerBaumTest = async function () {
    const cap = window.__rcLastGetData;
    if (!cap || !cap.body) { console.warn('[KPI Crawler] Keine Original-Anfrage mitgeschnitten — einmal "Ok" auf der Seite klicken.'); return null; }
    const jetzt = new URLSearchParams(cap.body).getAll('nodeid_inlist').filter(Boolean);
    console.log('[KPI Crawler] Im Portal steht gerade: nodeid_inlist = ' + (jetzt.join(',') || '(leer)'));
    const faelle = [{ key:'(Portal, unveraendert)', nodes:null }].concat(RC_BAEUME.map(b => ({ key:b.key, nodes:b.nodes, pfad:b.pfad })));
    const ergebnis = [];
    for (const f of faelle) {
      const p = new URLSearchParams(cap.body);
      p.set('daterange', 'intraday'); p.set('interval', 'cumulate');
      p.set('startdate', 'undefined'); p.set('enddate', 'undefined');
      if (f.nodes) nodeSetzen(p, f.nodes);
      let zeilen = 0, standorte = [], teams = [], grund = '';
      try {
        const r = await fetch(cap.url, { method:'POST', credentials:'include',
          headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8', 'accept':'*/*', 'x-requested-with':'XMLHttpRequest' },
          body: p.toString() });
        const text = await r.text();
        const html = extractTableHtml(text);
        if (!html) grund = 'keine Tabelle (HTTP ' + r.status + ')';
        else {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const tab = doc.querySelector('table#result-table') || doc.querySelector('table');
          const kpis = tab ? parseKpiTable(tab) : [];
          zeilen = kpis.length;
          standorte = [...new Set(kpis.map(k => k.standort).filter(Boolean))];
          teams = [...new Set(kpis.map(k => k.team).filter(Boolean))];
        }
      } catch(e){ grund = String(e && e.message || e); }
      ergebnis.push({ Baum:f.key, Knoten:f.nodes || '(unveraendert)', Agenten:zeilen,
                      Standorte:standorte.join(', '), Teams:teams.length, Hinweis:grund });
      await new Promise(r => setTimeout(r, 400));
    }
    console.table(ergebnis);
    console.log('[KPI Crawler] Setzen mit  rcCrawlerBaum("Mob_Care")  ·  zuruecknehmen mit  rcCrawlerBaum(false)');
    return ergebnis;
  };

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

  // ---------- Wochenlauf automatisch (17.08.) ----------
  // Nutzer-Vorgabe: "direkt einmal die Woche auf Tagintervall und dann taeglich.
  // Aber wichtig ist, dass es auch 24 Stunden laeuft."
  // harvestWeekDaily() war seit v6 GEBAUT, aber von NIEMANDEM mehr aufgerufen
  // (startHarvests/stufeWoche sind damals ersatzlos entfallen) - es gab nur noch
  // das Konsolen-Handle rcCrawlerHarvestWoche(). Genau deshalb kam die
  // Wochen-Historie nur, wenn der Nutzer sie von Hand klickte.
  //
  // KEIN eigener Zeitgeber: der Lauf haengt am vorhandenen 3-Minuten-Takt und
  // entscheidet ueber einen TAGES-SCHLUESSEL, ob er dran ist. Ein setTimeout
  // ueber Stunden waere in einem gedrosselten Hintergrund-Tab unzuverlaessig
  // (gemessen 09.08.: 1 rAF-Frame in 504 s) - dieselbe Begruendung wie bei
  // rcMitternachtPruefen im Dashboard. Der Tagesschluessel wechselt um 00:00
  // von selbst, damit ist "taeglich" ohne Mitternachts-Logik erledigt.
  const LS_WOCHENLAUF = 'rcLigaWochenlauf_v1';
  const WOCHENLAUF_VERSUCHE_MAX = 5;      // je Tag, dann Ruhe bis Mitternacht
  let wochenlaufLaeuft = false;
  let wochenlaufVersucheHeute = 0;
  let wochenlaufVersuchTag = '';
  function wochenlaufSchluessel(){
    const p = projektAusName();
    return LS_WOCHENLAUF + (p === 'mobile' ? '_mob' : p === 'um' ? '_um' : '');
  }
  function heuteKey(){
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function wochenlaufFaellig(){
    try { return localStorage.getItem(wochenlaufSchluessel()) !== heuteKey(); }
    catch(e){ return true; }
  }
  function wochenlaufErledigt(){
    try { localStorage.setItem(wochenlaufSchluessel(), heuteKey()); } catch(e){}
  }
  // Wird nach jedem Live-Takt gefragt. Laeuft NUR mit gemerktem Klick: ohne den
  // gibt es nichts zu replayen, und harvestZeitraum wuerde sonst ueber
  // triggerPageRefresh die Seite anfassen - das gehoert dem Auto-Klick, nicht hier.
  async function wochenlaufPruefen(){
    if (wochenlaufLaeuft) return;
    if (!autoWochenlaufAn()) return;
    if (!(window.__rcLastGetData && window.__rcLastGetData.body)) return;
    if (!wochenlaufFaellig()) return;
    const tag = heuteKey();
    if (wochenlaufVersuchTag !== tag) { wochenlaufVersuchTag = tag; wochenlaufVersucheHeute = 0; }
    if (wochenlaufVersucheHeute >= WOCHENLAUF_VERSUCHE_MAX) return;
    wochenlaufVersucheHeute++;
    wochenlaufLaeuft = true;
    try {
      console.log('[KPI Crawler] Wochenlauf ' + tag + ' (' + wochenlaufVersucheHeute + '/' +
        WOCHENLAUF_VERSUCHE_MAX + '): hole "Aktuelle Woche" auf Tagintervall — ein Replay, ' +
        'die Seite wird nicht angefasst.');
      const tage = await harvestWeekDaily();
      // Schluessel NUR bei Erfolg verbrauchen (Fallstrick 12): war die Seite
      // gerade belegt oder der Token tot, faellt der Wochenlauf sonst fuer den
      // ganzen Tag aus - genau das, was hier repariert werden soll.
      if (tage > 0) {
        wochenlaufErledigt();
        console.log('[KPI Crawler] Wochenlauf ' + tag + ' erledigt: ' + tage +
          ' Tag(e) Historie. Naechster Lauf nach Mitternacht.');
      } else {
        console.warn('[KPI Crawler] Wochenlauf ' + tag + ' ohne Tage — neuer Versuch im naechsten Takt (' +
          wochenlaufVersucheHeute + '/' + WOCHENLAUF_VERSUCHE_MAX + ').');
      }
    } catch(e){
      console.warn('[KPI Crawler] Wochenlauf fehlgeschlagen: ' + (e && e.message || e));
    } finally { wochenlaufLaeuft = false; }
  }
  // Live-Takt, danach Wochenlauf - in DIESER Reihenfolge, weil beide dieselbe
  // Seiten-Sperre nehmen und die Live-Zahlen das sind, worauf der Wandmonitor
  // wartet. Das abschliessende .catch ist Pflicht (Fallstrick 9): ohne es
  // landet jede Stoerung als unhandled rejection im Logbuch des Nutzers, und
  // die Kette bricht dort ab, wo niemand hinsieht.
  // Der Takt merkt selbst, wenn er ausgesetzt hat (05.10.): stand er laenger als
  // zwei Abstaende, war der Tab eingefroren oder gedrosselt. Das geht als
  // Klartext ans Dashboard-Logbuch — ausser das Auftauen hat es eben schon
  // gemeldet (ein Ereignis, eine Zeile).
  var letzterTaktUm = 0;
  function taktUndWoche(){
    const jetzt = Date.now();
    if (letzterTaktUm && jetzt - letzterTaktUm > POLL_INTERVAL * 2 && jetzt - (wach.aufgetautUm || 0) > 60000) {
      const txt = 'Ligalisten-Takt stand ' + Math.round((jetzt - letzterTaktUm) / 60000) +
        ' Min still (Tab im Hintergrund eingefroren oder gedrosselt) — hole jetzt nach.';
      console.warn('[KPI Crawler] ' + txt);
      meldeHinweis(txt);
    }
    letzterTaktUm = jetzt;
    return Promise.resolve()
      .then(() => pollKpis(false))
      .then(wochenlaufPruefen)
      .catch(e => console.warn('[KPI Crawler] Takt: ' + (e && e.message || e)));
  }
  const LS_AUTOWOCHE = 'rcLigaAutoWoche';
  function autoWochenlaufAn(){
    try { return localStorage.getItem(LS_AUTOWOCHE) !== '0'; } catch(e){ return true; }
  }
  window.rcCrawlerAutoWoche = function(an){
    if (an === undefined) return autoWochenlaufAn()
      ? 'AN — einmal je Tag wird "Aktuelle Woche" auf Tagintervall nachgezogen. rcCrawlerAutoWoche(false) schaltet ab.'
      : 'AUS — die Wochen-Historie kommt nur ueber rcCrawlerHarvestWoche() von Hand.';
    try { localStorage.setItem(LS_AUTOWOCHE, an ? '1' : '0'); } catch(e){}
    if (an) { wochenlaufVersucheHeute = 0; wochenlaufPruefen(); }
    return an ? 'Wochenlauf AN.' : 'Wochenlauf AUS.';
  };
  // Von Hand denselben Weg noch einmal erzwingen (Tagesschluessel loeschen).
  window.rcCrawlerWochenlaufJetzt = function(){
    try { localStorage.removeItem(wochenlaufSchluessel()); } catch(e){}
    wochenlaufVersucheHeute = 0;
    wochenlaufPruefen();
    return 'Wochenlauf angestossen.';
  };

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
        // Bis zum 03.08. wurde hier sofort und endgueltig aufgegeben. Da das
        // Kommando vom Dashboard-Knopf kommt, traf es genau dann auf eine
        // belegte Seite, wenn der Live-Takt oder ein Harvest gerade lief — und
        // der Nutzer bekam "bitte gleich noch einmal versuchen" zu lesen, ohne
        // dass irgendetwas passiert waere. Jetzt wird bis zu dreimal im Abstand
        // von 20 s nachgefasst; der Live-Takt gibt die Sperre in seinem finally
        // zuverlaessig frei, laenger als der Sperr-Verfall zu warten waere
        // sinnlos.
        let habeSperre = false;
        for (let v = 0; v < 3; v++) {
          if (sperreNehmen('Bereich (Durchklick)')) { habeSperre = true; break; }
          const halter = sperreHalter();
          console.log('[KPI Crawler] Bereichs-Abruf wartet: die Seite ist belegt von ' + halter +
                      ' — neuer Versuch in 20 s (' + (v + 1) + '/3).');
          await new Promise(r => setTimeout(r, 20000));
        }
        if (!habeSperre) {
          out.error = 'Die Ligalisten-Seite war ueber eine Minute durchgehend belegt von: ' + sperreHalter() +
                      ' — bitte noch einmal versuchen. Steht die Sperre dauerhaft: rcCrawlerSperre() zeigt den Halter.';
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

  // Antwort ueber ALLE drei Kanaele zurueckschicken. Welcher traegt, haengt an
  // der Lage: BroadcastChannel nur same-origin, opener kann verloren sein,
  // replySource traegt auch nach einem Re-Inject des Dashboards.
  function antworte(done, replySource){
    try { channel.postMessage(done); } catch(e){}
    try { if (window.opener && !window.opener.closed) window.opener.postMessage(done, '*'); } catch(e){}
    try { if (replySource && replySource.postMessage && replySource !== window) replySource.postMessage(done, '*'); } catch(e){}
  }

  function handleCommand(d, replySource){
    if (!d) return;

    // "Jetzt aktualisieren" vom Dashboard (05.08.). Bewusst ueber pollKpis und
    // NICHT ueber einen eigenen fetch: pollKpis nimmt die Sperre, verdrahtet
    // daterange='intraday' fest (das liveOk-Gate im Dashboard kann das Paket
    // also nicht verwerfen) und fasst die Seite nicht an — die Ansicht des
    // Nutzers auf der Ligaliste bleibt stehen.
    if (d.type === 'RC_LIVE_NOW') {
      console.log('[KPI Crawler] Sofort-Aktualisierung vom Dashboard angefordert.');
      Promise.resolve(pollKpis(false)).then(res => {
        res = res || { ok:false, n:0, grund:'kein Ergebnis' };
        antworte({ type:'RC_LIVE_NOW_DONE', ok:!!res.ok, agenten:res.n || 0, error:res.ok ? null : (res.grund || 'unbekannt') }, replySource);
        console.log('[KPI Crawler] Sofort-Aktualisierung ' + (res.ok ? 'fertig: ' + res.n + ' Agenten' : 'fehlgeschlagen: ' + res.grund));
      }).catch(e => {
        antworte({ type:'RC_LIVE_NOW_DONE', ok:false, agenten:0, error:String(e && e.message || e) }, replySource);
      });
      return;
    }

    // Automatik-Schalter vom Dashboard (16.08.): Zahnrad -> Anzeige ->
    // Automatik -> "Liga-Abfrage automatisch". Der Wert lebt im localStorage
    // DIESES Origins (ccs.vodafone.de) — das Dashboard kann ihn nur per
    // Kommando setzen, nie direkt (cross-origin).
    if (d.type === 'RC_AUTO_KLICK') {
      console.log('[KPI Crawler] Automatik-Schalter vom Dashboard: Auto-Abfrage ' + (d.an ? 'AN' : 'AUS') + '.');
      window.rcCrawlerAutoKlick(!!d.an);
      return;
    }
    // Stufe 2 der Watchdog-Leiter (17.08.): das Dashboard bekommt seit N
    // Minuten nichts. Der gemerkte Rumpf ist dann verdaechtig - egal warum
    // (toter Token, fremder Request, Portal umgestellt). Er wird verworfen
    // und ein frischer Ok-Klick geholt. Das ist die Selbstheilung, die dem
    // Crawler von aussen befohlen wird, wenn er sie selbst nicht bemerkt.
    if (d.type === 'RC_KLICK_NEU') {
      console.warn('[KPI Crawler] Dashboard meldet Stillstand — gemerkten Ok-Klick verwerfen und neu holen.');
      try { klickVerwerfen(); } catch(e){}
      try { autoKlickVersuche = 0; autoKlickPlanen(1000); } catch(e){}
      return;
    }

    if (d.type !== 'RC_HARVEST_RANGE' || !d.from || !d.to) return;
    console.log('[KPI Crawler] Bereichs-Anforderung vom Dashboard: ' + d.from + ' bis ' + d.to);
    harvestRange(d.from, d.to).then(res => {
      antworte({ type:'RC_HARVEST_RANGE_DONE', from:d.from, to:d.to, days:res.days, error:res.error, history: loadHistory() }, replySource);
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

  // ---------- Start (v6): KEIN eigener Harvest, KEIN Ok-Klick ----------
  // Der Nutzer klickt beim Start selbst (Woche/Tag + Ok, dann Intraday + Ok) —
  // beide Antworten verwertet der Hook (__rcKlickHandler) im Moment des Klicks.
  // Der Crawler selbst wird nur im Takt aktiv, und nur wenn schon ein Klick
  // gemerkt ist (Re-Inject auf laufender Seite: sofort ein Replay).
  // Seit 14.08.: fehlt der Klick im Fenster, wird der GESICHERTE Mitschnitt
  // vorgeladen (ueberlebt Neuladen/F5/Citrix) — der Nutzer spart den Klick.
  // Traegt er einen toten Token, meldet das Replay die Stoerung und verwirft
  // den Mitschnitt (siehe verwerteAntwort). Seit 16.08. gilt "NIE selbst
  // klicken" nur noch bei abgeschalteter Auto-Abfrage: gibt es auch keinen
  // gesicherten Mitschnitt, klickt der Crawler den Ok-Knopf nach 15 s selbst
  // (Nutzer-Vorgabe "alles wieder automatisieren", Schalter im Dashboard).
  // Die 15 s Gnadenfrist lassen dem Starter den Vortritt — sein CDP-Klick
  // (StelleLigaKlickSicher) ist eine vertrauenswuerdige Geste.
  if (!(window.__rcLastGetData && window.__rcLastGetData.body)) {
    const gesichert = klickLaden();
    if (gesichert) {
      window.__rcLastGetData = { url: gesichert.url, body: gesichert.body };
      console.log('[KPI Crawler] Ok-Klick-Mitschnitt aus dem Speicher geladen (' +
        Math.round((Date.now() - (gesichert.zeit || Date.now())) / 60000) + ' Min alt) — Replay startet ohne neuen Klick.');
    } else {
      autoKlickPlanen(15000);
    }
  }
  if (window.__rcLastGetData && window.__rcLastGetData.body) {
    // Wochenlauf ERST nach dem Live-Takt: beide nehmen dieselbe Seiten-Sperre,
    // und die Live-Zahlen sind das, worauf der Wandmonitor wartet.
    taktUndWoche();
  } else if (autoKlickAn()) {
    // Ehrlicher Text (05.10.): seit der Auto-Abfrage (16.08.) stand hier weiter
    // "es wird NICHTS von selbst geklickt" — der Nutzer klickte deshalb jedes
    // Mal von Hand Woche und Intraday durch, obwohl beides von selbst kommt.
    console.log('[KPI Crawler] Noch keine Abfrage gemerkt — du musst nichts tun: in 15 s fragt die Auto-Abfrage selbst ab (Ok-Knopf).');
  } else {
    console.log('[KPI Crawler] Warte auf deinen ersten Ok-Klick — die Auto-Abfrage ist abgeschaltet (rcCrawlerAutoKlick(true) schaltet sie ein).');
  }

  if (window.kpiCrawlerInterval) clearInterval(window.kpiCrawlerInterval);
  window.kpiCrawlerInterval = setInterval(taktUndWoche, POLL_INTERVAL);

  const wachStand = wachhalten();
  console.log('[KPI Crawler] v6.1 gestartet. Nichts zu klicken: alle ' + (POLL_INTERVAL/60000) + ' Minuten kommt der Intraday-Stand von selbst ' +
    '(Replay der letzten Abfrage — gleicher Baum, gleiche Standorte, gleiche Kennzahlen, nur Zeitraum/Intervall umgestellt), ' +
    'einmal je Tag die Woche auf Tagesbasis. Ohne gemerkte Abfrage klickt die Auto-Abfrage den Ok-Knopf selbst ' +
    '(rcCrawlerAutoKlick(false) schaltet das ab). Dein eigener Ok-Klick gilt weiter und bestimmt Vorlage, Standorte und Kennzahlen; ' +
    'steht er nicht auf Intraday, wird der Live-Stand gleich nachgeholt. Das Projekt der Pakete kommt aus der geladenen Vorlage ' +
    '(description_settings_list), nicht aus dem Fensternamen. Bleibt ein Abruf ohne Daten, wird nach 20 s nachgefasst (max. ' + NACHFASS_MAX + 'x); ' +
    'eine ehrlich leere Antwort (0 Zeilen) gilt nicht als Fehler. ' +
    'Wachhalter: ' + (wachStand === 'angefordert' || wachStand === 'steht schon'
      ? 'an — der Tab darf im Hintergrund liegen, Edge legt ihn nicht schlafen.'
      : 'NICHT moeglich (' + wachStand + ') — liegt der Tab im Hintergrund, kann Edge ihn einfrieren.') + ' ' +
    'Konsole: rcCrawlerHarvestWoche() (Woche von Hand nachziehen) · rcCrawlerHarvestRange("2026-07-01","2026-07-13") · rcCrawlerWeekRaw("current_week") · rcCrawlerSperre()');
  if (wachStand !== 'angefordert' && wachStand !== 'steht schon') meldeHinweis('Ligaliste: Wachhalter nicht moeglich (' + wachStand + ') — liegt der Tab im Hintergrund, kann Edge ihn einfrieren.');

  window.addEventListener('beforeunload', () => {
    if (window.kpiCrawlerInterval) clearInterval(window.kpiCrawlerInterval);
  });
})();
