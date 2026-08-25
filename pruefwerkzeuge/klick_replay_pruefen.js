// ===========================================================================
//  klick_replay_pruefen.js  —  Pruefwerkzeug (offline, ohne Portal)
// ===========================================================================
//  Prueft den v6-Kern von kpi_crawler.js (06.08. abends, Nutzer-Vorgabe
//  "der Crawler folgt meinen Klicks"):
//   1. Der Request-Hook liest auch die ANTWORT mit und reicht sie an
//      window.__rcKlickHandler weiter (der Ok-Klick des Nutzers ist die
//      Datenuebertragung).
//   2. projektAusPaket() liest das Projekt aus description_settings_list —
//      funktional gegen die ECHTEN Bodies aus ligaliste_vorlage_mitschnitt.txt.
//   3. Der 3-Minuten-Takt ist ein REPLAY des Nutzer-Requests: Feld fuer Feld
//      identisch bis auf GENAU daterange/interval/startdate/enddate.
//   4. Selbst-Klick NUR ueber die geschaltete Auto-Abfrage (16.08., ersetzt
//      die 06.08.-Regel "nie selbst"): geklickt wird ausschliesslich, wenn
//      der Schalter an ist UND kein Mitschnitt existiert UND die Seite frei
//      ist. Kein ensureCapture, kein Auto-Harvest, kein Refresh im Takt.
//  Die echten Funktionen werden per Klammer-Zaehlung ausgeschnitten und mit
//  new Function ausgewertet — kein Nachbau (ein Nachbau bewacht nur seine
//  eigene Kopie). Jede Regel hat eine Gegenprobe.
//
//  Aufruf:  node pruefwerkzeuge/klick_replay_pruefen.js
// ===========================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(WURZEL, 'kpi_crawler.js'), 'utf8');

let ok = 0, fehler = 0;
function pruef(t, b, z) {
    if (b) { ok++; console.log('  ok   ' + t); }
    else { fehler++; console.log('  FEHL ' + t + (z !== undefined ? '  -> ' + z : '')); }
}
function abschnitt(t){ console.log('\n--- ' + t + ' ---'); }
function schneideAus(text, kopf) {
    const start = text.indexOf(kopf);
    if (start < 0) throw new Error('nicht gefunden: ' + kopf);
    let tiefe = 0, i = text.indexOf('{', start);
    for (; i < text.length; i++) {
        if (text[i] === '{') tiefe++;
        else if (text[i] === '}') { tiefe--; if (tiefe === 0) return text.slice(start, i + 1); }
    }
    throw new Error('nicht sauber abgeschlossen: ' + kopf);
}
function konst(name) {
    const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*[\\s\\S]*?;\\n'));
    if (!m) throw new Error('Konstante ' + name + ' nicht gefunden');
    return m[0];
}

// ---- Die ECHTEN Bodies aus dem Mitschnitt (Token als Platzhalter) ---------
const LOC9 = 'Alanya%2CAlexandroupolis%2CBerlin%2CEssen%2CNeubrandenburg%2CPotsdam%2Cregiocom_W_Home%2CSakarya%2CSerres';
function echterBody(nodes, vorlage, dr, iv){
  return 'type=get-result&script_id=11035&script_id_secure=TOKEN&user_id=32595&tree_template=null&ffr_template=' +
    '&nodeid_inlist=' + encodeURIComponent(nodes) + '&spid_inlist_c=10026&loc_inlist_c=' + LOC9 +
    '&cumulate_provider=0&spid_inlist=10026&cumulate_locations=0&loc_inlist=' + LOC9 +
    '&cumulate_teams=0&teamid_inlist=&daterange=' + dr + '&interval=' + iv +
    '&startdate=undefined&enddate=undefined&show_more_settings=1' +
    '&figure_list=10004%2C10005%2C10006%2C10014%2C10082%2C10062%2C10339%2C10075%2C10355%2C10340%2C10080%2C10081%2C10063%2C10064%2C10065%2C10076%2C10077%2C10078%2C10067%2C10060%2C10061%2C10357%2C10358' +
    '&figure_group_list=&show_hms=1&show_nodes=0&show_employeeid=0&show_ccsid=1&show_notready_durations=0' +
    '&show_ffr_templates=0&show_excel_pivot_header=0&agent_select=-1&ccsid=&table_type=2' +
    '&all_provider_selected=false&all_locations_selected=false&all_teams_selected=true' +
    '&description_settings_list=' + encodeURIComponent('32595;11035;' + vorlage) +
    '&nodeid_inlist_c=' + encodeURIComponent(nodes) + '&setting_type=personal';
}
const KABEL_WOCHE  = echterBody('11405',       'Vodafone_Kabel',  'current_week', 'day');
const MOBILE_WOCHE = echterBody('11317,11229', 'Vodafone_Mobile', 'current_week', 'day');
const UM_INTRA     = echterBody('12090',       'Vodafone_UM',     'intraday',     'cumulate');

// ===========================================================================
abschnitt('1. Grundsatz: kein Selbst-Klick, kein Auto-Harvest mehr');
// ===========================================================================
pruef('ensureCapture (Selbst-Klick zum Token-Sichern) ist entfernt',
    !/async function ensureCapture\(/.test(src));
pruef('GEGENPROBE: die Entfernungs-Pruefung schlaegt an, wenn es zurueckkaeme',
    /async function ensureCapture\(/.test(src + 'async function ensureCapture(x){'));
pruef('kein automatischer startHarvests/stufeWoche mehr',
    !/function startHarvests\(/.test(src) && !/function stufeWoche\(/.test(src));
// Seit 17.08. haengt am Takt ausser pollKpis auch der taegliche Wochenlauf —
// der Aufruf sitzt deshalb in taktUndWoche statt direkt im setInterval.
// Gemessen wird weiter dasselbe: der Takt fasst die Seite NICHT mit einem
// Refresh-Klick an (pollKpis(true) waere genau das).
pruef('der Takt ruft pollKpis(false) — nie pollKpis(true) mit Refresh-Klick',
    /setInterval\(taktUndWoche, POLL_INTERVAL\)/.test(src) &&
    /pollKpis\(false\)/.test(src) &&
    !/pollKpis\(true\)/.test(src));
pruef('Takt = 3 Minuten (Nutzer-Vorgabe 06.08. abends)',
    /const POLL_INTERVAL = 180000/.test(src));
pruef('der Marker "KPI-Crawler" steht in den ersten 4000 Zeichen (ESL_Start.cmd-Erkennung)',
    src.slice(0, 4000).indexOf('KPI-Crawler') >= 0);
pruef('beim Start ohne Klick UND ohne Mitschnitt wird die Auto-Abfrage geplant (15 s Vortritt fuer den Starter)',
    /autoKlickPlanen\(15000\)/.test(src));

// ===========================================================================
abschnitt('2. Der Hook liest die Antwort mit und ruft den Klick-Handler');
// ===========================================================================
// Version 3 seit 14.08. (Mitschnitt-Sicherung im Hook) — die Pruefung haelt
// fest, DASS versioniert wird und Schwelle wie Zuweisung dieselbe Zahl tragen.
pruef('Hook ist versioniert (__rcReqHooked = 3) — aeltere Hooks werden ueberhookt',
    /if \(window\.__rcReqHooked >= 3\) return;/.test(src) && /window\.__rcReqHooked = 3;/.test(src));
pruef('die rohe fetch-Referenz wird gesichert (__rcFetchRoh) — Replays laufen am Hook vorbei',
    /window\.__rcFetchRoh = origFetch/.test(src));
pruef('fetch-Antwort wird geklont und an __rcKlickHandler gereicht',
    /res\.clone\(\)\.text\(\)/.test(src) && /__rcKlickHandler\(mitschnitt\.body, text\)/.test(src));
pruef('XHR-Antwort wird ueber das load-Event an __rcKlickHandler gereicht',
    /addEventListener\('load'/.test(src) && /__rcKlickHandler\(s, this\.responseText\)/.test(src));
pruef('der Handler haengt am window (Re-Inject ERSETZT ihn, statt zu stapeln)',
    /window\.__rcKlickHandler = function\(reqBody, text\)/.test(src));

// ===========================================================================
abschnitt('3. projektAusPaket — funktional gegen die echten Bodies');
// ===========================================================================
const projektAusPaket = new Function('URLSearchParams',
    konst('RC_ABFRAGEN') + schneideAus(src, 'function projektAusPaket(') + '; return projektAusPaket;'
)(URLSearchParams);
pruef('Kabel-Vorlage  -> "kabel"',  projektAusPaket(KABEL_WOCHE)  === 'kabel',  projektAusPaket(KABEL_WOCHE));
pruef('Mobile-Vorlage -> "mobile"', projektAusPaket(MOBILE_WOCHE) === 'mobile', projektAusPaket(MOBILE_WOCHE));
pruef('UM-Vorlage     -> "um"',     projektAusPaket(UM_INTRA)     === 'um',     projektAusPaket(UM_INTRA));
pruef('ohne Vorlage, aber gemessener Baum 12090 -> "um" (Baum-Rueckfall)',
    projektAusPaket('nodeid_inlist=12090&x=1') === 'um');
pruef('unbekannter Hand-Baum -> null (es wird NICHT geraten)',
    projektAusPaket('nodeid_inlist=99999') === null);
pruef('leerer/fehlender Body -> null', projektAusPaket('') === null && projektAusPaket(null) === null);

// ===========================================================================
abschnitt('4. Replay = der Request des Nutzers, Feld fuer Feld');
// ===========================================================================
// pollKpis WIRKLICH laufen lassen: Sperre + nachfassen + verwerteAntwort echt
// ausgeschnitten; fetch faengt den Body ab und liefert eine leere Antwort.
async function replayBody(capBody){
  let gesendet = null;
  const w = {
    __rcLastGetData: { url: 'https://ccs.vodafone.de/x', body: capBody },
    __rcLigaSperre: null,
    __rcFetchRoh: (url, o) => { gesendet = o.body; return Promise.resolve({ ok: true, text: () => Promise.resolve('') }); }
  };
  const body =
    // Zahlen-Konstanten als Stub: sie tragen im Quell-Code Zeilen-Kommentare,
    // an denen konst() scheitert; ihre WERTE prueft Abschnitt 1 ohnehin am Text.
    'var POLL_INTERVAL = 180000, SPERRE_VERFALL_MS = 180000, NACHFASS_MAX = 3, NACHFASS_MS = 1;' +
    'var AUTO_KLICK_MAX = 5; var autoKlickVersuche = 0; var autoKlickTimer = null;' +
    'function autoKlickAn(){ return false; } function autoKlickPlanen(){}' +
    konst('RC_LOC_ALLE') + konst('RC_ABFRAGEN') +
    'var nachfassZaehler = 0; var nachfassTimer = null;' +
    'function nachfassen(){}' +
    schneideAus(src, 'function sperreNehmen(') +
    schneideAus(src, 'function sperreGeben(') +
    schneideAus(src, 'function sperreHalter(') +
    // verwerteAntwort echt, aber seine Ausgabe-Abhaengigkeiten gestubbt:
    'function extractTableHtml(){ return null; }' +
    'function parseKpiTable(){ return []; }' +
    'function storeByDate(){ return []; }' +
    'function sendKpis(){}' +
    'function projektAusName(){ return null; }' +
    schneideAus(src, 'function projektAusPaket(') +
    schneideAus(src, 'function baumAusBody(') +
    schneideAus(src, 'function lokVollstaendig(') +
    schneideAus(src, 'function verwerteAntwort(') +
    schneideAus(src, 'function pollKpis(') +
    '; return pollKpis(false);';
  const p = new Function('window', 'URLSearchParams', 'console', 'setTimeout', 'clearTimeout', body)(
    w, URLSearchParams, { log(){}, warn(){} }, setTimeout, clearTimeout);
  await p;
  return gesendet;
}

(async () => {
  const gesendet = await replayBody(KABEL_WOCHE);
  pruef('das Replay sendet ueberhaupt (ueber __rcFetchRoh)', !!gesendet);
  if (gesendet) {
    const soll = {}; new URLSearchParams(KABEL_WOCHE).forEach((v,k)=>{ soll[k]=v; });
    const ist  = {}; new URLSearchParams(gesendet).forEach((v,k)=>{ ist[k]=v; });
    const erlaubt = ['daterange','interval','startdate','enddate'];
    const abw = Object.keys(soll).filter(k => soll[k] !== ist[k] && erlaubt.indexOf(k) < 0);
    pruef('ALLE Felder identisch mit dem Nutzer-Klick (ausser daterange/interval/startdate/enddate)',
        abw.length === 0, abw.map(k => k + ': "' + soll[k] + '" -> "' + ist[k] + '"').join(', '));
    pruef('daterange wurde auf intraday umgestellt', ist.daterange === 'intraday', ist.daterange);
    pruef('interval wurde auf cumulate umgestellt', ist.interval === 'cumulate', ist.interval);
    pruef('der Baum bleibt der des Nutzer-Klicks (11405)', ist.nodeid_inlist === '11405' && ist.nodeid_inlist_c === '11405');
    pruef('die Vorlage bleibt die des Nutzer-Klicks (Vodafone_Kabel)',
        /Vodafone_Kabel$/.test(ist.description_settings_list || ''), ist.description_settings_list);
    pruef('kein Feld kommt dazu, keines faellt weg',
        Object.keys(soll).length === Object.keys(ist).length,
        'Klick ' + Object.keys(soll).length + ' / Replay ' + Object.keys(ist).length);
  }
  // Mobile-Gegenprobe: der Replay folgt dem KLICK, nicht einer Kabel-Vorgabe.
  const g2 = await replayBody(MOBILE_WOCHE);
  pruef('GEGENPROBE Mobile-Klick -> Replay traegt 11317,11229 (nicht 11405)',
      !!g2 && new URLSearchParams(g2).get('nodeid_inlist') === '11317,11229',
      g2 ? new URLSearchParams(g2).get('nodeid_inlist') : '(nichts gesendet)');
  // Ohne gemerkten Klick + Auto-Abfrage AUS: nichts senden, ehrlicher Grund.
  let g3sent = null;
  {
    const w = { __rcLastGetData: null, __rcFetchRoh: () => { g3sent = 'GESENDET'; return Promise.reject(new Error('x')); } };
    const body = 'var POLL_INTERVAL=180000;var AUTO_KLICK_MAX=5;var autoKlickVersuche=0;function autoKlickAn(){return false;}function autoKlickPlanen(){}var nachfassZaehler=0;function nachfassen(){}function sperreNehmen(){return true;}function sperreGeben(){}function sperreHalter(){return null;}function verwerteAntwort(){return {n:0};}' +
      schneideAus(src, 'function pollKpis(') + '; return pollKpis(false);';
    const res = await new Function('window', 'URLSearchParams', 'console', body)(w, URLSearchParams, { log(){}, warn(){} });
    pruef('ohne Klick + Auto AUS: kein Request, Grund nennt den Ok-Klick',
        g3sent === null && res && /Ok-Klick/.test(res.grund || ''), JSON.stringify(res));
  }
  // Ohne gemerkten Klick + Auto-Abfrage AN: kein fetch (der Klick laeuft ueber
  // den Ok-Knopf der Seite, nicht ueber einen eigenen Request), aber die
  // Auto-Abfrage wird angestossen und der Grund benennt sie.
  {
    let g4sent = null, geplant = 0;
    const w = { __rcLastGetData: null, __rcFetchRoh: () => { g4sent = 'GESENDET'; return Promise.reject(new Error('x')); } };
    const body = 'var POLL_INTERVAL=180000;var AUTO_KLICK_MAX=5;var autoKlickVersuche=4;function autoKlickAn(){return true;}function autoKlickPlanen(){__plan.n++;}var nachfassZaehler=0;function nachfassen(){}function sperreNehmen(){return true;}function sperreGeben(){}function sperreHalter(){return null;}function verwerteAntwort(){return {n:0};}' +
      schneideAus(src, 'function pollKpis(') + '; return { res: pollKpis(false), versuche: autoKlickVersuche };';
    const plan = { n: 0 };
    const out = new Function('window', 'URLSearchParams', 'console', '__plan', body)(w, URLSearchParams, { log(){}, warn(){} }, plan);
    const res4 = await out.res;
    pruef('ohne Klick + Auto AN: kein eigener Request, Auto-Abfrage angestossen',
        g4sent === null && plan.n === 1 && res4 && /Auto-Abfrage/.test(res4.grund || ''), JSON.stringify(res4) + ' geplant=' + plan.n);
    pruef('der 3-Min-Takt oeffnet eine ausgeschoepfte Versuchsreihe wieder (Zaehler < Deckel)',
        out.versuche < 5, 'versuche=' + out.versuche);
  }

  // =========================================================================
  abschnitt('4b. Auto-Abfrage (16.08.) — geklickt wird NUR eng geschnitten');
  // =========================================================================
  // Die echten Funktionen ausschneiden und funktional treiben. setTimeout wird
  // gespeichert statt ausgefuehrt — die Erfolgskontrolle interessiert hier nicht.
  function baueAutoKlick(opts){
    const zustand = { klicks: 0, timeouts: [], ls: Object.assign({}, opts.ls || {}) };
    const w = Object.assign({}, opts.win || {});
    const body =
      konst('LS_AUTOKLICK') + konst('AUTO_KLICK_MAX') + konst('AUTO_KLICK_ABSTAND_MS') +
      'let autoKlickVersuche = ' + (opts.versuche || 0) + '; let autoKlickTimer = null;' +
      'function sperreHalter(){ return ' + JSON.stringify(opts.halter || null) + '; }' +
      'function findOkButton(){ return ' + (opts.keinKnopf ? 'null' : '({ click: function(){ __z.klicks++; } })') + '; }' +
      schneideAus(src, 'function autoKlickAn(') +
      schneideAus(src, 'function autoKlickJetzt(') +
      schneideAus(src, 'function autoKlickPlanen(') +
      '; autoKlickPlanen(1); return { jetzt: autoKlickJetzt, planen: autoKlickPlanen, an: autoKlickAn, versuche: function(){ return autoKlickVersuche; }, timerDa: function(){ return !!autoKlickTimer; } };';
    const fakeTimeout = function(fn, ms){ zustand.timeouts.push({ fn: fn, ms: ms }); return zustand.timeouts.length; };
    const localStorageStub = { getItem: k => (k in zustand.ls ? zustand.ls[k] : null), setItem: (k,v) => { zustand.ls[k]=String(v); }, removeItem: k => { delete zustand.ls[k]; } };
    const api = new Function('window','localStorage','console','setTimeout','clearTimeout','__z', body)(
      w, localStorageStub, { log(){}, warn(){} }, fakeTimeout, function(){}, zustand);
    return { api, zustand, w };
  }
  {
    // Standard (kein gespeicherter Wert) = AN; '0' = AUS; '1' = AN.
    const a1 = baueAutoKlick({});
    pruef('Auto-Abfrage ist ab Werk AN (kein localStorage-Wert)', a1.api.an() === true);
    const a2 = baueAutoKlick({ ls: { rcLigaAutoAbfrage: '0' } });
    pruef('rcLigaAutoAbfrage="0" schaltet sie AUS', a2.api.an() === false);
    pruef('AUS: es wird nichts geplant (kein Timer)', a2.zustand.timeouts.length === 0);
  }
  {
    // AN + kein Mitschnitt + Knopf da + Sperre frei -> genau EIN Klick.
    const a = baueAutoKlick({});
    pruef('AN ohne Mitschnitt: Versuch wird geplant', a.zustand.timeouts.length === 1);
    a.zustand.timeouts[0].fn();                     // den geplanten Versuch ausfuehren
    pruef('der Versuch klickt den Ok-Knopf genau einmal', a.zustand.klicks === 1, 'klicks=' + a.zustand.klicks);
    pruef('danach laeuft eine Erfolgskontrolle (weiterer Timer)', a.zustand.timeouts.length >= 2);
  }
  {
    // GEGENPROBE: Mitschnitt vorhanden -> kein Klick, nichts geplant.
    const a = baueAutoKlick({ win: { __rcLastGetData: { url: 'x', body: 'y' } } });
    pruef('GEGENPROBE Mitschnitt vorhanden: nichts geplant, kein Klick',
        a.zustand.timeouts.length === 0 && a.zustand.klicks === 0);
  }
  {
    // Sperre belegt -> kein Klick, aber neuer Versuch geplant.
    const a = baueAutoKlick({ halter: 'Zeitraum-Abruf' });
    a.zustand.timeouts[0].fn();
    pruef('Seite belegt: kein Klick, neuer Versuch geplant',
        a.zustand.klicks === 0 && a.zustand.timeouts.length >= 2);
  }
  {
    // Knopf (noch) nicht da -> kein Absturz, neuer Versuch geplant.
    const a = baueAutoKlick({ keinKnopf: true });
    a.zustand.timeouts[0].fn();
    pruef('Ok-Knopf fehlt: kein Absturz, neuer Versuch geplant',
        a.zustand.klicks === 0 && a.zustand.timeouts.length >= 2);
  }
  {
    // Deckel: nach AUTO_KLICK_MAX Versuchen wird nicht weiter geplant.
    const a = baueAutoKlick({ versuche: 5 });
    pruef('Versuchs-Deckel (5) verhindert weiteres Planen', a.zustand.timeouts.length === 0);
  }
  pruef('Kommando RC_AUTO_KLICK wird angenommen und schaltet den Schalter',
      /d\.type === 'RC_AUTO_KLICK'/.test(src) && /window\.rcCrawlerAutoKlick\(!!d\.an\)/.test(src));
  pruef('GEGENPROBE: eine Fassung ohne pollKpis-Anstoss der Auto-Abfrage fiele auf',
      /autoKlickPlanen\(1500\)/.test(schneideAus(src, 'function pollKpis(')));

  // =========================================================================
  abschnitt('5. verwerteAntwort — Logik der Verwertung');
  // =========================================================================
  // Echte Funktion, Ausgabewege als Spione.
  function baueVerwerter(tabelleKpis, htmlDaFn){
    const spione = { store: [], send: [] };
    const body =
      konst('RC_LOC_ALLE') + konst('RC_ABFRAGEN') +
      'function extractTableHtml(t){ return (' + htmlDaFn + ')(t); }' +
      'function parseKpiTable(){ return ' + JSON.stringify(tabelleKpis) + '; }' +
      'function storeByDate(k, dr){ __sp.store.push({ n: k.length, dr: dr }); return ["2026-08-06"]; }' +
      'function sendKpis(k, dr, voll, extra){ __sp.send.push({ n: k.length, dr: dr, voll: !!voll, extra: extra }); }' +
      'function projektAusName(){ return null; }' +
      schneideAus(src, 'function projektAusPaket(') +
      schneideAus(src, 'function baumAusBody(') +
      schneideAus(src, 'function lokVollstaendig(') +
      schneideAus(src, 'function verwerteAntwort(') +
      '; return verwerteAntwort;';
    const DOMParserStub = function(){ this.parseFromString = function(){ return { querySelector: function(){ return {}; } }; }; };
    const fn = new Function('__sp', 'URLSearchParams', 'DOMParser', 'console', body)(
      spione, URLSearchParams, DOMParserStub, { log(){}, warn(){} });
    return { fn, spione };
  }
  {
    // Intraday-Klick mit allen Standorten: vollstaendig, Projekt aus dem Body.
    const { fn, spione } = baueVerwerter([{ ccsId: '1' }, { ccsId: '2' }], 'function(t){ return "<table></table>"; }');
    const r = fn(UM_INTRA, 'egal', 'Ok-Klick');
    pruef('Intraday-Klick: 2 Zeilen verwertet', r.n === 2, JSON.stringify(r));
    pruef('Intraday-Klick: Snapshot mit drHint "intraday"',
        spione.store.length === 1 && spione.store[0].dr === 'intraday', JSON.stringify(spione.store));
    pruef('Intraday-Klick mit allen Standorten: Paket ist VOLLSTAENDIG',
        spione.send.length === 1 && spione.send[0].voll === true, JSON.stringify(spione.send));
    pruef('das Paket traegt Projekt "um" und den Baum 12090 aus dem Body',
        spione.send[0].extra && spione.send[0].extra.projekt === 'um' && spione.send[0].extra.baumNodes === '12090',
        JSON.stringify(spione.send[0].extra));
  }
  {
    // Wochen-Klick: NICHT vollstaendig (kein intraday), dr wandert als Hint mit.
    const { fn, spione } = baueVerwerter([{ ccsId: '1' }], 'function(t){ return "<table></table>"; }');
    fn(KABEL_WOCHE, 'egal', 'Ok-Klick');
    pruef('Wochen-Klick: Paket ist NICHT vollstaendig (nur intraday ersetzt den Bestand)',
        spione.send.length === 1 && spione.send[0].voll === false && spione.send[0].dr === 'current_week',
        JSON.stringify(spione.send));
  }
  {
    // Intraday, aber nur EIN Standort im Request: NICHT vollstaendig.
    const einStd = UM_INTRA.replace(new RegExp(LOC9.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), 'Alanya');
    const { fn, spione } = baueVerwerter([{ ccsId: '1' }], 'function(t){ return "<table></table>"; }');
    fn(einStd, 'egal', 'Ok-Klick');
    pruef('GEGENPROBE Intraday mit NUR Alanya: NICHT vollstaendig (Teil-Paket ersetzt nie)',
        spione.send.length === 1 && spione.send[0].voll === false, JSON.stringify(spione.send));
  }
  {
    // 0 Zeilen: ehrlich leer — nichts speichern, nichts senden.
    const { fn, spione } = baueVerwerter([], 'function(t){ return "<table></table>"; }');
    const r = fn(UM_INTRA, 'egal', 'Replay');
    pruef('0 Zeilen: Grund "0-zeilen", nichts gespeichert, nichts gesendet',
        r.grund === '0-zeilen' && spione.store.length === 0 && spione.send.length === 0, JSON.stringify(r));
  }
  {
    // ORA-Fehler im Text: Grund nennt den Oracle-Code im Klartext.
    const { fn, spione } = baueVerwerter([], 'function(t){ return null; }');
    const r = fn(UM_INTRA, 'ORA-00936: Ausdruck fehlt', 'Replay');
    pruef('Portal-Fehler: ORA-Code steht im Grund (Lehre vom 05.08.)',
        /ORA-00936/.test(r.grund || ''), JSON.stringify(r));
    pruef('bei Fehler wird nichts gesendet', spione.send.length === 0);
  }

  console.log('\n' + '='.repeat(60));
  console.log('  ' + ok + ' bestanden, ' + fehler + ' fehlgeschlagen.');
  console.log('='.repeat(60));
  process.exit(fehler ? 1 : 0);
})();
