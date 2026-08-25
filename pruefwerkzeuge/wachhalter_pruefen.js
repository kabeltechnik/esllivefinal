/* ============================================================================
   WACHHALTER PRUEFEN  (Ligaliste liefert nicht immer — 05.10. spaetabends)
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/wachhalter_pruefen.js

   Nutzer-Befund 05.10.: "Die Ligaliste updatet sich auch nicht immer ...
   Warum ist es so schwierig? Einfach mal alle 3 Minuten auf Intraday klicken."

   Aus Logbuch und Ligalisten-Konsole gelesen, an echtem Edge nachgemessen
   (pruefwerkzeuge/schlaf_messen.mjs):
   1. Edge friert verborgene Tabs ein ("Schlafende Tabs"): Zeitgeber und
      Netzabrufe stehen, bis der Tab wieder vorn liegt. Die Ligaliste ist im
      Betrieb IMMER der Tab im Hintergrund. Abhilfe: die Seite haelt einen
      Web Lock (Dashboard, KPI-Crawler, Genesys-Crawler).
   2. Der "Jetzt"-Knopf hing zwei Stunden auf "laeuft": der 45-s-Zeitgeber
      eines frueheren Laufs raeumte den Antwort-Handle des naechsten ab.
   3. Abrufe des Crawlers hatten keine Frist; der eigene Wochenlauf lief durch
      den Hook und galt als Ok-Klick des Nutzers ("Ligaliste steht auf
      current_week ... Intraday + Ok waehlen").
   4. KPI_QUELLE_TOT kam seit 08.08. nie am Dashboard an (fehlte im Tor).
   5. 29.09.: drei Stunden ohne Liga-Daten, weil ein Ligalisten-Tab offen war,
      der nicht am Dashboard hing — der Starter hielt die Arbeit fuer erledigt.

   Ob Edge eine Seite mit Web Lock wirklich nicht einfriert, misst dieses
   Werkzeug NICHT — das ist die Messung in schlaf_messen.mjs (echtes Edge,
   mit Gegenprobe an der aelteren Fassung). Hier wird die Logik funktional
   geprueft und die Verdrahtung bewacht; zu jeder Regel gehoert eine
   Gegenprobe an der alten Bauart.
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const W = path.join(__dirname, '..');
const lies = n => fs.readFileSync(path.join(W, n), 'utf8');
const DASH = lies('esl_live_arena_v22.js');
const CRAW = lies('kpi_crawler.js');
const GM = lies('genesys_monitor_crawler.js');
const AUTO = ['esl_autopilot.user.js', 'esl_autopilot_mobile.user.js', 'esl_autopilot_um.user.js'].map(n => ({ n, t: lies(n) }));
const CMD = lies('ESL_Start.cmd');

let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}
function schneide(quelle, startMarke) {
  const i = quelle.indexOf(startMarke);
  if (i < 0) return null;
  const auf = quelle.indexOf('{', i);
  if (auf < 0) return null;
  let tiefe = 0;
  for (let j = auf; j < quelle.length; j++) {
    const c = quelle[j];
    if (c === '{') tiefe++;
    else if (c === '}') { tiefe--; if (tiefe === 0) return quelle.slice(i, j + 1); }
  }
  return null;
}
function schneidePs(quelle, kopf) {
  const i = quelle.indexOf(kopf);
  if (i < 0) return null;
  let j = quelle.indexOf('{', i);
  if (j < 0) return null;
  let tiefe = 0;
  for (; j < quelle.length; j++) {
    const c = quelle[j];
    if (c === '#') { while (j < quelle.length && quelle[j] !== '\n') j++; continue; }
    if (c === "'" || c === '"') { const ende = c; j++; while (j < quelle.length && quelle[j] !== ende) { if (quelle[j] === '`') j++; j++; } continue; }
    if (c === '{') tiefe++;
    else if (c === '}') { tiefe--; if (tiefe === 0) return quelle.slice(i, j + 1); }
  }
  return null;
}
const ruhe = () => new Promise(r => setImmediate(r));          // Mikroaufgaben abarbeiten
async function ruhig(n) { for (let i = 0; i < (n || 4); i++) await ruhe(); }
// Zeitgeber-Attrappe mit eigener Uhr: nichts wartet wirklich.
function uhrBauen(start) {
  let jetzt = start || 5000000, nr = 0; const liste = [];
  return {
    Date: { now: () => jetzt },
    setTimeout: (fn, ms) => { const id = ++nr; liste.push({ id, um: jetzt + (ms || 0), fn }); return id; },
    clearTimeout: id => { const i = liste.findIndex(x => x.id === id); if (i >= 0) liste.splice(i, 1); },
    vor: async ms => {
      const ziel = jetzt + ms;
      for (;;) { liste.sort((a, b) => a.um - b.um); const n = liste[0]; if (!n || n.um > ziel) break; liste.shift(); jetzt = n.um; n.fn(); await ruhig(); }
      jetzt = ziel; await ruhig();
    },
    offen: () => liste.length, jetzt: () => jetzt
  };
}
// Web-Locks-Attrappe: ruft den Rueckruf wie der Browser asynchron und haelt, bis dessen Promise endet.
function locksBauen(opts) {
  const anfragen = [];
  const nav = (opts && opts.ohne) ? {} : { locks: { request: (name, cb) => {
    const a = { name, erg: undefined }; anfragen.push(a);
    if (opts && opts.ablehnen) return Promise.reject(new Error('NotAllowedError'));
    return Promise.resolve().then(() => { a.erg = cb({ name }); return a.erg; });
  } } };
  return { nav, anfragen };
}
async function haengt(p) { let fertig = false; Promise.resolve(p).then(() => { fertig = true; }, () => { fertig = true; }); await ruhig(6); return !fertig; }

console.log('WACHHALTER PRUEFEN');

(async () => {
  /* -------------------------------------------------------------------------
     1) Dashboard: Wachhalter
  ------------------------------------------------------------------------- */
  console.log('\n1) Dashboard haelt einen Web Lock');
  const fnWach = schneide(DASH, 'function rcWachhalten(){');
  pruefe('rcWachhalten ist vorhanden', !!fnWach);
  if (fnWach) {
    const baue = (text, win, nav, log) => new Function('window', 'navigator', 'performance', 'Date', 'rcLog', text + '; return rcWachhalten;')(
      win, nav, { now: () => 123.456 }, { now: () => 1000 }, log);
    let L = locksBauen(), win = {}, log = { warns: [], warn(t) { this.warns.push(t); } };
    let f = baue(fnWach, win, L.nav, log);
    const r1 = f();
    await ruhig();
    pruefe('der Lock wird angefordert, mit eigenem Namen', r1 === 'angefordert' && L.anfragen.length === 1 && /^rc_wach_dashboard_/.test(L.anfragen[0].name), JSON.stringify(L.anfragen.map(a => a.name)));
    pruefe('nach der Zuteilung meldet rcWachLage "gehalten"', win.rcWachLage && win.rcWachLage.lock === true && win.__rcWachLock && win.__rcWachLock.name === L.anfragen[0].name);
    pruefe('der Lock wird NIE zurueckgegeben (das Promise des Rueckrufs endet nicht)', L.anfragen[0].erg instanceof Promise && await haengt(L.anfragen[0].erg));
    const r2 = f(); await ruhig();
    pruefe('Re-Inject: ein vorhandener Lock bleibt stehen, es wird kein zweiter angefordert', r2 === 'steht schon' && L.anfragen.length === 1);
    // Gegenprobe: eine Bauart, die den Lock sofort wieder hergibt, muss auffallen.
    L = locksBauen(); win = {};
    baue(fnWach.replace('return new Promise(function(){});', 'return Promise.resolve();'), win, L.nav, log)(); await ruhig();
    pruefe('GEGENPROBE: gaebe der Rueckruf den Lock sofort zurueck, faellt es auf', L.anfragen.length === 1 && !(await haengt(L.anfragen[0].erg)));
    // Browser ohne Web Locks
    L = locksBauen({ ohne: true }); win = {};
    let r3 = null, geworfen = false;
    try { r3 = baue(fnWach, win, L.nav, log)(); } catch (e) { geworfen = true; }
    pruefe('ohne Web Locks: kein Absturz, der Grund steht in rcWachLage', !geworfen && /Web Locks/.test(String(r3)) && win.rcWachLage.lock === false && !win.__rcWachLock);
    // Anforderung scheitert
    L = locksBauen({ ablehnen: true }); win = {}; log = { warns: [], warn(t) { this.warns.push(t); } };
    baue(fnWach, win, L.nav, log)(); await ruhig();
    pruefe('abgelehnter Lock: Marke zurueckgenommen, einmal gemeldet', win.__rcWachLock === null && win.rcWachLage.lock === false && log.warns.length === 1 && /Wachhalter/.test(log.warns[0]));
    // Verdrahtung
    const iClean = DASH.indexOf('// 2. CLEAN-STATE'), iWach = DASH.indexOf('WACHHALTER (05.10.'), iFlug = DASH.indexOf('FLUGSCHREIBER (27.09.)');
    pruefe('der Block steht HINTER dem Clean-State und vor dem Flugschreiber', iClean > 0 && iWach > iClean && iFlug > iWach);
    pruefe('der Clean-State gibt den Lock nicht her (er soll den Re-Inject ueberleben)', iClean > 0 && iWach > iClean && !/__rcWachLock\s*=|rcWachLage\s*=/.test(DASH.slice(iClean, iWach)));
    pruefe('rcWachhalten wird beim Start AUFGERUFEN (nicht nur definiert)', /const stand = rcWachhalten\(\);/.test(DASH));
  }

  console.log('\n1b) Einfrieren steht mit Dauer im Logbuch');
  const fnDauer = schneide(DASH, 'function rcWachDauer(sek){');
  const iife = schneide(DASH, '(function(){\n        const stand = rcWachhalten();');
  pruefe('Horcher-Block und rcWachDauer gefunden', !!fnDauer && !!iife);
  if (fnDauer && iife) {
    const dokBauen = () => { const h = { freeze: [], resume: [] }; return { h,
      addEventListener: (t, fn) => { (h[t] = h[t] || []).push(fn); },
      removeEventListener: (t, fn) => { const i = (h[t] || []).indexOf(fn); if (i >= 0) h[t].splice(i, 1); } }; };
    const lauf = (text, win, dok, log, uhr) => new Function('window', 'document', 'rcLog', 'Date', 'rcWachhalten',
      fnDauer + ';' + text + ')();')(win, dok, log, uhr.Date,
      () => { win.rcWachLage = win.rcWachLage || { lock: true, grund: '', eingefroren: 0, seit: 0, zuletztSek: 0, gesamtSek: 0 }; return 'angefordert'; });
    const uhr = uhrBauen(), dok = dokBauen(), ereignisse = [];
    const win = { rcLogEreignis: t => ereignisse.push(t) }, log = { warns: [], warn(t) { this.warns.push(t); } };
    lauf(iife, win, dok, log, uhr);
    pruefe('genau ein Horcher je Ereignis (freeze, resume)', dok.h.freeze.length === 1 && dok.h.resume.length === 1);
    dok.h.freeze[0]();
    pruefe('Einfrieren wird sofort als Ereignis geschrieben (danach laeuft nichts mehr)', ereignisse.length === 1 && /friert diesen Tab ein/.test(ereignisse[0]) && win.rcWachLage.eingefroren === 1);
    await uhr.vor(787000);
    dok.h.resume[0]();
    const w0 = log.warns[0] || '';
    pruefe('Auftauen nennt die Dauer (787 s -> 13 Min), die Ursache und die Abhilfe in Edge',
      log.warns.length === 1 && /13 Min/.test(w0) && /Schlafende Tabs/.test(w0) && /nie in den Ruhezustand/.test(w0) && win.rcWachLage.zuletztSek === 787 && win.rcWachLage.gesamtSek === 787, w0);
    pruefe('  ... und sagt dazu, dass es TROTZ Wachhalter geschah (Lock war gehalten)', /trotz Wachhalter/.test(w0));
    dok.h.freeze[0](); await uhr.vor(45000); dok.h.resume[0]();
    pruefe('kurze Pause in Sekunden (45 s), Summe laeuft mit', /45 s/.test(log.warns[1] || '') && win.rcWachLage.gesamtSek === 832 && win.rcWachLage.eingefroren === 2);
    lauf(iife, win, dok, log, uhr);
    pruefe('Re-Inject: die alten Horcher werden abgemeldet (weiter genau einer je Ereignis)', dok.h.freeze.length === 1 && dok.h.resume.length === 1);
    const dok2 = dokBauen(), win2 = { rcLogEreignis() {} };
    const ohneAbmelden = iife.split('document.removeEventListener(').join('void (');
    lauf(ohneAbmelden, win2, dok2, log, uhr); lauf(ohneAbmelden, win2, dok2, log, uhr);
    pruefe('GEGENPROBE: ohne das Abmelden staende jedes Einfrieren doppelt im Logbuch', dok2.h.freeze.length === 2);
  }
  const fnKopf = schneide(DASH, 'function rcLogbuchKopf(){');
  if (fnKopf) {
    const kopf = lage => new Function('window', 'localStorage', 'location', 'Date',
      'var rcLogSpeicherAus = 0;' + fnKopf + '; return rcLogbuchKopf();')(
      { rcWachLage: lage, rcLigaHinweis: { text: 'Ligalisten-Tab war 13 Min vom Browser eingefroren', zeit: Date.now() - 120000 } },
      { setItem() {}, removeItem() {}, getItem() { return ''; }, key() { return ''; }, length: 0 }, { pathname: '/x', href: 'https://x' }, Date);
    const k1 = kopf({ lock: true, grund: '', eingefroren: 2, zuletztSek: 787, gesamtSek: 832 });
    const z1 = (k1.split('\n').find(z => /Wachhalter/.test(z)) || '');
    pruefe('Logbuch-Kopf nennt Lock und Einfrier-Zaehler', /Web Lock gehalten/.test(z1) && /2x/.test(z1) && /787/.test(z1) && /832/.test(z1), z1);
    const z2 = (kopf({ lock: false, grund: 'Web Locks gibt es in diesem Browser nicht', eingefroren: 0 }).split('\n').find(z => /Wachhalter/.test(z)) || '');
    pruefe('  ... und sagt deutlich, wenn der Lock FEHLT', /FEHLT/.test(z2) && /Web Locks gibt es/.test(z2), z2);
    pruefe('  ... dazu die letzte Meldung der Ligaliste', /Ligaliste meldet/.test(k1) && /13 Min/.test(k1));
  } else pruefe('rcLogbuchKopf gefunden', false);

  /* -------------------------------------------------------------------------
     2) KPI-Crawler: Wachhalter, Meldung ans Dashboard, Takt-Luecke
  ------------------------------------------------------------------------- */
  console.log('\n2) KPI-Crawler haelt einen Web Lock und meldet Stillstand');
  const cWach = schneide(CRAW, 'function wachhalten(){');
  pruefe('wachhalten ist vorhanden', !!cWach);
  if (cWach) {
    const baue = (win, nav, kon, wach) => new Function('window', 'navigator', 'performance', 'Date', 'console', 'wach', cWach + '; return wachhalten;')(
      win, nav, { now: () => 77.5 }, { now: () => 2000 }, kon, wach);
    let L = locksBauen(), win = {}, wach = { lock: null, grund: '' }, kon = { warns: [], warn(t) { this.warns.push(t); }, log() {} };
    const f = baue(win, L.nav, kon, wach); const r1 = f(); await ruhig();
    pruefe('Lock angefordert, eigener Name, nie zurueckgegeben', r1 === 'angefordert' && L.anfragen.length === 1 && /^rc_wach_liga_/.test(L.anfragen[0].name) && wach.lock === true && await haengt(L.anfragen[0].erg));
    pruefe('zweiter Aufruf (Re-Inject): kein zweiter Lock', f() === 'steht schon' && L.anfragen.length === 1);
    L = locksBauen({ ohne: true }); win = {}; wach = { lock: null, grund: '' };
    let r2 = null, geworfen = false; try { r2 = baue(win, L.nav, kon, wach)(); } catch (e) { geworfen = true; }
    pruefe('ohne Web Locks: kein Absturz, Grund abrufbar', !geworfen && /Web Locks/.test(String(r2)) && wach.lock === false);
    L = locksBauen({ ablehnen: true }); win = {}; wach = { lock: null, grund: '' }; kon = { warns: [], warn(t) { this.warns.push(t); }, log() {} };
    baue(win, L.nav, kon, wach)(); await ruhig();
    pruefe('abgelehnter Lock: Marke zurueckgenommen und in der Konsole gemeldet', win.__rcWachLock === null && wach.lock === false && kon.warns.length === 1);
    pruefe('wachhalten wird beim Start AUFGERUFEN', /const wachStand = wachhalten\(\);/.test(CRAW));
  }
  const fnHinweis = schneide(CRAW, 'function meldeHinweis(text){');
  pruefe('meldeHinweis ist vorhanden', !!fnHinweis);
  if (fnHinweis) {
    const kanal = [], anOpener = [];
    const win = { opener: { closed: false, postMessage: m => anOpener.push(m) } };
    const f = new Function('window', 'channel', 'projektAusName', 'Date', fnHinweis + '; return meldeHinweis;')(win, { postMessage: m => kanal.push(m) }, () => 'kabel', Date);
    f(new Array(401).join('x'));
    pruefe('die Meldung geht als KPI_HINWEIS an Kanal und opener, auf 300 Zeichen gekuerzt, mit Projekt',
      kanal.length === 1 && anOpener.length === 1 && anOpener[0].type === 'KPI_HINWEIS' && anOpener[0].text.length === 300 && anOpener[0].projekt === 'kabel' && anOpener[0].zeit > 0);
    win.opener = { closed: true, postMessage() { throw new Error('zu'); } }; let geworfen = false;
    try { f('x'); } catch (e) { geworfen = true; }
    pruefe('geschlossenes Dashboard-Fenster: kein Absturz', !geworfen && anOpener.length === 1 && kanal.length === 2);
  }
  const frz = schneide(CRAW, 'window.__rcCrawlerFreeze = {');
  pruefe('Horcher fuer freeze/resume im Crawler gefunden', !!frz && /addEventListener\('freeze', window\.__rcCrawlerFreeze\.f\)/.test(CRAW) && /removeEventListener\('freeze', window\.__rcCrawlerFreeze\.f\)/.test(CRAW));
  if (frz) {
    const uhr = uhrBauen(), hinweise = [], win = {}, wach = { eingefroren: 0, seit: 0, zuletztSek: 0, aufgetautUm: 0 };
    new Function('window', 'wach', 'meldeHinweis', 'console', 'Date', frz + ';')(win, wach, t => hinweise.push(t), { warn() {} }, uhr.Date);
    win.__rcCrawlerFreeze.f(); await uhr.vor(787000); win.__rcCrawlerFreeze.r();
    pruefe('Auftauen meldet die Dauer ans Dashboard ("13 Min ... eingefroren")', hinweise.length === 1 && /13 Min/.test(hinweise[0]) && /eingefroren/.test(hinweise[0]) && wach.zuletztSek === 787 && wach.aufgetautUm === uhr.jetzt());
  }
  const fnTakt = schneide(CRAW, 'function taktUndWoche(){');
  pruefe('taktUndWoche ist vorhanden', !!fnTakt);
  if (fnTakt) {
    const baue = (text, uhr, hinweise, wach, zaehler) => new Function('Date', 'console', 'meldeHinweis', 'wach', 'pollKpis', 'wochenlaufPruefen',
      'var letzterTaktUm = 0; var POLL_INTERVAL = 180000;' + text + '; return taktUndWoche;')(
      uhr.Date, { warn() {}, log() {} }, t => hinweise.push(t), wach, () => { zaehler.n++; return Promise.resolve({ ok: true }); }, () => {});
    let uhr = uhrBauen(), hinweise = [], wach = { aufgetautUm: 0 }, z = { n: 0 };
    let f = baue(fnTakt, uhr, hinweise, wach, z);
    f(); await ruhig(); await uhr.vor(180000); f(); await ruhig();
    pruefe('im normalen 3-Minuten-Abstand: keine Meldung', hinweise.length === 0 && z.n === 2);
    await uhr.vor(787000); f(); await ruhig();
    pruefe('nach 13 Minuten Pause: EINE Meldung "Takt stand 13 Min still" — und es wird nachgeholt', hinweise.length === 1 && /stand 13 Min still/.test(hinweise[0]) && z.n === 3, hinweise[0]);
    uhr = uhrBauen(); hinweise = []; z = { n: 0 }; wach = { aufgetautUm: 0 };
    f = baue(fnTakt, uhr, hinweise, wach, z); f(); await ruhig(); await uhr.vor(787000); wach.aufgetautUm = uhr.jetzt() - 3000; f(); await ruhig();
    pruefe('hat das Auftauen es eben schon gemeldet, kommt keine zweite Zeile', hinweise.length === 0 && z.n === 2);
    uhr = uhrBauen(); hinweise = []; z = { n: 0 };
    const alt = 'function taktUndWoche(){ return Promise.resolve().then(() => pollKpis(false)).then(wochenlaufPruefen).catch(e => console.warn(e)); }';
    f = baue(alt, uhr, hinweise, { aufgetautUm: 0 }, z); f(); await ruhig(); await uhr.vor(787000); f(); await ruhig();
    pruefe('GEGENPROBE: die alte Bauart schwieg zu 13 Minuten Stillstand', hinweise.length === 0 && z.n === 2);
  }
  pruefe('der Starttext behauptet nicht mehr "es wird NICHTS von selbst geklickt"',
    !/console\.log\([^\n]*NICHTS von selbst/.test(CRAW) && /Nichts zu klicken/.test(CRAW));
  pruefe('GEGENPROBE: die alte Startzeile waere erkennbar',
    /console\.log\([^\n]*NICHTS von selbst/.test("    console.log('[KPI Crawler] Warte auf deinen ersten Ok-Klick — es wird NICHTS von selbst geklickt oder verstellt.');"));

  /* -------------------------------------------------------------------------
     3) Abruf mit Frist, immer am Hook vorbei
  ------------------------------------------------------------------------- */
  console.log('\n3) Abrufe des Crawlers haben eine Frist und laufen am Hook vorbei');
  const fnAbruf = schneide(CRAW, 'function abrufMitFrist(url, init, fristMs){');
  pruefe('abrufMitFrist ist vorhanden', !!fnAbruf);
  const FRIST = +((CRAW.match(/const ABRUF_FRIST_MS = (\d+);/) || [])[1] || 0), FRIST_Z = +((CRAW.match(/const ABRUF_FRIST_ZEITRAUM_MS = (\d+);/) || [])[1] || 0);
  const SPERRE = +((CRAW.match(/const SPERRE_VERFALL_MS = (\d+);/) || [])[1] || 0);
  pruefe('die Fristen liegen unter dem Verfall der Seiten-Sperre', FRIST > 0 && FRIST_Z > 0 && FRIST < SPERRE && FRIST_Z < SPERRE, FRIST + ' / ' + FRIST_Z + ' / Sperre ' + SPERRE);
  if (fnAbruf) {
    const baue = (uhr, win) => new Function('window', 'setTimeout', 'clearTimeout',
      'var ABRUF_FRIST_MS = ' + FRIST + ', ABRUF_FRIST_ZEITRAUM_MS = ' + FRIST_Z + ';' + fnAbruf + '; return abrufMitFrist;')(win, uhr.setTimeout, uhr.clearTimeout);
    let uhr = uhrBauen(), roh = 0, hook = 0, sig = null;
    let win = { __rcFetchRoh: (u, i) => { roh++; sig = i.signal; return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('T') }); }, fetch: () => { hook++; return Promise.reject(new Error('Hook')); } };
    const a = await baue(uhr, win)('u', { method: 'POST' });
    pruefe('Antwort kommt als { ok, status, text } — ueber den ROH-fetch, nicht ueber den Hook', a.ok === true && a.status === 200 && a.text === 'T' && roh === 1 && hook === 0);
    pruefe('  ... mit Abbruch-Signal, und der Zeitgeber ist danach abgeraeumt', !!sig && sig.aborted === false && uhr.offen() === 0);
    uhr = uhrBauen(); sig = null;
    win = { __rcFetchRoh: (u, i) => { sig = i.signal; return new Promise(() => {}); } };
    let erg = null; baue(uhr, win)('u', {}).then(x => { erg = { ok: x }; }, e => { erg = { fehler: String(e && e.message) }; });
    await uhr.vor(FRIST - 1);
    pruefe('haengender Abruf: bis zur Frist wird gewartet', erg === null);
    await uhr.vor(2);
    pruefe('  ... danach endet er mit "keine Antwort in ' + Math.round(FRIST / 1000) + ' s" und bricht die Anfrage ab', !!erg && new RegExp('keine Antwort in ' + Math.round(FRIST / 1000) + ' s').test(erg.fehler || '') && sig.aborted === true, JSON.stringify(erg));
    uhr = uhrBauen(); erg = null;
    win = { __rcFetchRoh: () => Promise.resolve({ ok: true, status: 200, text: () => new Promise(() => {}) }) };
    baue(uhr, win)('u', {}, FRIST_Z).then(x => { erg = { ok: x }; }, e => { erg = { fehler: String(e && e.message) }; });
    await uhr.vor(FRIST_Z + 1);
    pruefe('auch das LESEN der Antwort steht unter der Frist (eigene Frist des Zeitraum-Abrufs)', !!erg && new RegExp('keine Antwort in ' + Math.round(FRIST_Z / 1000) + ' s').test(erg.fehler || ''));
    uhr = uhrBauen(); erg = null;
    win = { __rcFetchRoh: () => Promise.reject(new Error('Netz weg')) };
    baue(uhr, win)('u', {}).then(x => { erg = { ok: x }; }, e => { erg = { fehler: String(e && e.message) }; }); await ruhig();
    pruefe('Netzfehler kommt sofort durch, kein Zeitgeber bleibt haengen', !!erg && erg.fehler === 'Netz weg' && uhr.offen() === 0);
  }
  // pollKpis mit haengendem Abruf: Sperre muss frei werden, Nachfassen muss angemeldet werden.
  const fnPoll = schneide(CRAW, 'function pollKpis(withRefresh) {');
  const teile = ['function sperreNehmen(wer) {', 'function sperreGeben(wer) {', 'function sperreHalter() {'].map(k => schneide(CRAW, k));
  pruefe('pollKpis und die Sperre gefunden', !!fnPoll && teile.every(Boolean));
  if (fnPoll && fnAbruf && teile.every(Boolean)) {
    const lauf = async (pollText, vorMs) => {
      const uhr = uhrBauen(); let nachgefasst = 0;
      const win = { __rcLastGetData: { url: 'u', body: 'daterange=current_week&interval=day&figure_list=1' }, __rcLigaSperre: null, __rcFetchRoh: () => new Promise(() => {}) };
      const text = 'var POLL_INTERVAL = 180000, SPERRE_VERFALL_MS = ' + SPERRE + ', ABRUF_FRIST_MS = ' + FRIST + ', ABRUF_FRIST_ZEITRAUM_MS = ' + FRIST_Z + ';' +
        'var nachfassZaehler = 0, replayLeerFolge = 0; function autoKlickAn(){ return false; } function autoKlickPlanen(){}' +
        'function verwerteAntwort(){ return { n: 0, grund: "keine-tabelle" }; }' +
        'function ohneFrist(url, init){ return window.__rcFetchRoh(url, init).then(function(r){ return r.text().then(function(t){ return { ok: r.ok, status: r.status, text: t }; }); }); }' +
        teile.join(';') + ';' + fnAbruf + ';' + pollText + '; return pollKpis(false);';
      let erg = null;
      new Function('window', 'URLSearchParams', 'console', 'setTimeout', 'clearTimeout', 'Date', 'nachfassen', text)(
        win, URLSearchParams, { log() {}, warn() {} }, uhr.setTimeout, uhr.clearTimeout, uhr.Date, () => { nachgefasst++; }).then(x => { erg = x; });
      await ruhig();
      const gehalten = !!(win.__rcLigaSperre && win.__rcLigaSperre.wer === 'Live-Takt');
      await uhr.vor(vorMs);
      return { erg, gehalten, sperre: win.__rcLigaSperre, nachgefasst };
    };
    const neu = await lauf(fnPoll, FRIST + 5);
    pruefe('Replay ohne Antwort: nach der Frist kommt ein Ergebnis mit Grund', neu.gehalten && !!neu.erg && neu.erg.ok === false && /keine Antwort/.test(neu.erg.grund || ''), JSON.stringify(neu.erg));
    pruefe('  ... die Seiten-Sperre ist wieder frei und das Nachfassen angemeldet', neu.sperre === null && neu.nachgefasst === 1);
    const alt = await lauf(fnPoll.replace('await abrufMitFrist(cap.url,', 'await ohneFrist(cap.url,'), 600000);
    pruefe('GEGENPROBE: ohne Frist bleibt der Lauf haengen — kein Ergebnis, Sperre steht, kein Nachfassen (so stand es am 05.10.)',
      fnPoll.indexOf('await abrufMitFrist(cap.url,') !== -1 && alt.erg === null && !!alt.sperre && alt.nachgefasst === 0);
  }
  const fnZeitraum = schneide(CRAW, 'async function fetchDaterangeKpis(daterangeVal, opts){');
  pruefe('der Zeitraum-/Wochenabruf geht ueber abrufMitFrist und ruft fetch nicht mehr direkt (kein Lauf durch den Hook)',
    !!fnZeitraum && /await abrufMitFrist\(cap\.url,/.test(fnZeitraum) && !/await fetch\(/.test(fnZeitraum));
  pruefe('GEGENPROBE: der alte direkte Aufruf waere erkennbar', /await fetch\(/.test("        r = await fetch(cap.url, { method:'POST' });"));

  /* -------------------------------------------------------------------------
     4) Nach einem Ok-Klick mit anderem Zeitraum kommt Intraday von selbst
  ------------------------------------------------------------------------- */
  console.log('\n4) Ok-Klick auf Woche/Monat: der Live-Stand wird selbst nachgeholt');
  const iK = CRAW.indexOf('var klickNachholTimer = null;');
  const hK = iK > 0 ? schneide(CRAW.slice(iK), 'window.__rcKlickHandler = function(reqBody, text){') : null;
  pruefe('Klick-Handler gefunden', !!hK);
  if (hK) {
    const vorspann = CRAW.slice(iK, iK + CRAW.slice(iK).indexOf('window.__rcKlickHandler = function(reqBody, text){'));
    const baue = (text, uhr, antworten, z) => { const win = {};
      new Function('window', 'setTimeout', 'clearTimeout', 'console', 'verwerteAntwort', 'pollKpis', text + ';')(
        win, uhr.setTimeout, uhr.clearTimeout, { log() {}, warn() {} }, () => { const a = antworten.shift(); if (a instanceof Error) throw a; return a; }, () => { z.n++; });
      return win.__rcKlickHandler; };
    const NACH = +((vorspann.match(/const KLICK_NACHHOL_MS = (\d+);/) || [])[1] || 0);
    let uhr = uhrBauen(), z = { n: 0 };
    let h = baue(vorspann + hK, uhr, [{ n: 422, dr: 'current_week' }], z);
    h('b', 't'); await uhr.vor(NACH - 1);
    pruefe('Wochen-Klick: kurz warten (' + NACH + ' ms) ...', NACH > 0 && z.n === 0 && uhr.offen() === 1);
    await uhr.vor(2);
    pruefe('  ... dann genau EIN Intraday-Abruf', z.n === 1 && uhr.offen() === 0);
    uhr = uhrBauen(); z = { n: 0 };
    h = baue(vorspann + hK, uhr, [{ n: 422, dr: 'intraday' }, { n: 0, dr: 'current_week', grund: '0-zeilen' }, new Error('kaputt')], z);
    let geworfen = false;
    try { h('b', 't'); h('b', 't'); h('b', 't'); } catch (e) { geworfen = true; }
    await uhr.vor(60000);
    pruefe('Intraday-Klick, leere Antwort und Fehler loesen NICHTS aus (und werfen nicht)', !geworfen && z.n === 0);
    uhr = uhrBauen(); z = { n: 0 };
    h = baue(vorspann + hK, uhr, [{ n: 5, dr: 'current_week' }, { n: 5, dr: 'current_month' }], z);
    h('b', 't'); await uhr.vor(1000); h('b', 't'); await uhr.vor(60000);
    pruefe('zwei Klicks kurz hintereinander: ein Abruf, nicht zwei', z.n === 1);
    uhr = uhrBauen(); z = { n: 0 };
    h = baue("window.__rcKlickHandler = function(reqBody, text){ try { verwerteAntwort(reqBody, text, 'Ok-Klick'); } catch(e){} }", uhr, [{ n: 422, dr: 'current_week' }], z);
    h('b', 't'); await uhr.vor(60000);
    pruefe('GEGENPROBE: die alte Bauart liess den Nutzer selbst auf Intraday zurueckstellen', z.n === 0);
  }
  pruefe('das Dashboard fordert dazu nicht mehr auf ("Intraday" + Ok waehlen)', !/rcLog\.warn\([^\n]*"Intraday" \+ Ok waehlen/.test(DASH) && /holt den Intraday-Stand gleich selbst nach/.test(DASH));

  /* -------------------------------------------------------------------------
     5) "Jetzt"-Knopf haengt nicht mehr
  ------------------------------------------------------------------------- */
  console.log('\n5) "Jetzt" haengt nicht mehr (Logbuch 05.10.: 17:12 bis 19:19 auf "laeuft")');
  const fnJetzt = schneide(DASH, 'async function rcJetztAktualisieren(melden){');
  const LNT = +((DASH.match(/const LIVE_NOW_TIMEOUT = (\d+);/) || [])[1] || 0), JEF = +((DASH.match(/const JETZT_ESL_FRIST\s*=\s*(\d+);/) || [])[1] || 0);
  pruefe('rcJetztAktualisieren und beide Fristen gefunden', !!fnJetzt && LNT > 0 && JEF > 0, LNT + ' / ' + JEF);
  if (fnJetzt && LNT && JEF) {
    const altLiga = 'const ligaP = ligaSent ? new Promise(res => {\n' +
      '                window.rcLiveNowDone = d => { window.rcLiveNowDone = null; res(d || {}); };\n' +
      '                setTimeout(() => {\n' +
      '                    if (!window.rcLiveNowDone) return;\n' +
      '                    window.rcLiveNowDone = null;\n' +
      "                    res({ ok:false, error:'keine Antwort' });\n" +
      '                }, LIVE_NOW_TIMEOUT);\n' +
      '            })';
    const a0 = fnJetzt.indexOf('const ligaP = ligaSent ? new Promise(res => {'), a1 = fnJetzt.indexOf("}) : Promise.resolve({ ok:false, error:'Ligalisten-Fenster nicht verbunden");
    const fnAltLiga = (a0 > 0 && a1 > a0) ? fnJetzt.slice(0, a0) + altLiga + fnJetzt.slice(a1 + 2) : null;
    pruefe('alte Bauart fuer die Gegenprobe laesst sich einsetzen', !!fnAltLiga);
    const umgebung = (text, esl, eslFrist) => {
      const uhr = uhrBauen(), gesendet = [];
      const win = { rcKpiWin: { closed: false, postMessage: m => gesendet.push(m) }, rcJetztBusy: false, rcAlleProjekteModus: false, rcLiveNowDone: null };
      const f = new Function('window', 'document', 'rcKpiChannel', 'holeExcelVomServer', 'rcLog', 'rcProjEintrag', 'setTimeout', 'clearTimeout', 'Date',
        'var LIVE_NOW_TIMEOUT = ' + LNT + ', JETZT_ESL_FRIST = ' + (eslFrist || JEF) + ';' + text + ';\n' +
        schneide(DASH, 'function rcDienstModus(') + '\nreturn rcJetztAktualisieren;')(   // Dienst-Schalter (27.10.): ohne Marke wie bisher
        win, { getElementById: () => null }, { postMessage() {} }, esl || (() => Promise.resolve({ ok: true })), { log() {} }, () => ({ name: 'Kabel' }),
        uhr.setTimeout, uhr.clearTimeout, uhr.Date);
      return { uhr, win, f, gesendet };
    };
    // Der Ablauf vom 05.10.: Lauf B beantwortet, 24 s spaeter Lauf C, dessen Antwort erst nach dem 45-s-Punkt von B kommt.
    const ablauf = async text => {
      const U = umgebung(text); let rB = null, rC = null;
      U.f(() => {}).then(x => { rB = x; }); await ruhig();
      await U.uhr.vor(10000); U.win.rcLiveNowDone({ ok: true, agenten: 422 }); await ruhig();
      const bFertig = !!rB && U.win.rcJetztBusy === false;
      await U.uhr.vor(14000);                                   // t = 24 s
      U.f(() => {}).then(x => { rC = x; }); await ruhig();
      await U.uhr.vor(21000);                                   // t = 45 s: hier feuerte der alte Zeitgeber von Lauf B
      const handleDa = typeof U.win.rcLiveNowDone === 'function';
      await U.uhr.vor(8000);                                    // t = 53 s: Antwort fuer Lauf C
      if (U.win.rcLiveNowDone) U.win.rcLiveNowDone({ ok: true, agenten: 426 });
      await ruhig(); await U.uhr.vor(300000);
      return { bFertig, handleDa, rC, busy: U.win.rcJetztBusy, gesendet: U.gesendet.length };
    };
    const neu = await ablauf(fnJetzt);
    pruefe('Lauf B endet sauber, Lauf C behaelt seinen Antwort-Handle ueber den 45-s-Punkt von B hinweg', neu.bFertig && neu.handleDa && neu.gesendet === 2);
    pruefe('  ... die Antwort kommt an (426 Agenten) und der Knopf ist wieder frei', !!neu.rC && neu.rC.liga.ok === true && neu.rC.liga.agenten === 426 && neu.busy === false, JSON.stringify(neu.rC));
    if (fnAltLiga) {
      const alt = await ablauf(fnAltLiga);
      pruefe('GEGENPROBE: die alte Bauart verliert den Handle und haengt fuer immer (genau der Befund)', alt.bFertig && !alt.handleDa && alt.rC === null && alt.busy === true);
    }
    // Keine Antwort der Ligaliste
    let U = umgebung(fnJetzt), r = null;
    U.f(() => {}).then(x => { r = x; }); await ruhig(); await U.uhr.vor(LNT - 1);
    const vorher = r === null && U.win.rcJetztBusy === true;
    await U.uhr.vor(2);
    pruefe('antwortet die Ligaliste nicht: nach ' + (LNT / 1000) + ' s Ergebnis mit Grund, Handle abgeraeumt, Knopf frei', vorher && !!r && r.liga.ok === false && /nicht geantwortet/.test(r.liga.error) && U.win.rcLiveNowDone === null && U.win.rcJetztBusy === false);
    // ESL haengt
    U = umgebung(fnJetzt, () => new Promise(() => {})); r = null;
    U.f(() => {}).then(x => { r = x; }); await ruhig();
    await U.uhr.vor(5000); U.win.rcLiveNowDone({ ok: true, agenten: 400 }); await ruhig();
    await U.uhr.vor(JEF - 5001);
    const wartet = r === null && U.win.rcJetztBusy === true;
    await U.uhr.vor(5);
    pruefe('haengt der ESL-Abruf: nach ' + (JEF / 1000) + ' s Ergebnis mit Grund, Knopf frei', wartet && !!r && r.esl.ok === false && /ESL hat in/.test(r.esl.error) && r.liga.agenten === 400 && U.win.rcJetztBusy === false, JSON.stringify(r));
    U = umgebung(fnJetzt, () => new Promise(() => {}), 1e13); r = null;
    U.f(() => {}).then(x => { r = x; }); await ruhig(); U.win.rcLiveNowDone({ ok: true, agenten: 400 }); await ruhig(); await U.uhr.vor(3600000);
    pruefe('GEGENPROBE: ohne ESL-Frist stuende der Knopf nach einer Stunde noch auf "laeuft"', r === null && U.win.rcJetztBusy === true);
    // Kein Ligalisten-Fenster
    U = umgebung(fnJetzt); U.win.rcKpiWin = null; r = null;
    U.f(() => {}).then(x => { r = x; }); await ruhig(8);
    pruefe('ohne Ligalisten-Fenster: sofort "nicht verbunden", kein Warten', !!r && r.liga.ok === false && /nicht verbunden/.test(r.liga.error) && U.win.rcJetztBusy === false);
  }

  /* -------------------------------------------------------------------------
     6) Empfangstor des Dashboards
  ------------------------------------------------------------------------- */
  console.log('\n6) Was der Crawler meldet, kommt im Dashboard an');
  const fnTor = schneide(DASH, 'window.__rcKpiMsgHandler = function(event){');
  pruefe('Empfangstor gefunden', !!fnTor);
  if (fnTor) {
    const baue = win => { const behandelt = [], weiter = [];
      new Function('window', 'handleKpiMessage', 'rcKpiChannel', fnTor + ';')(win, d => behandelt.push(d.type), { postMessage: d => weiter.push(d.type) });
      return { h: win.__rcKpiMsgHandler, behandelt, weiter }; };
    const typen = ['KPI_BATCH', 'KPI_UPDATE', 'RC_HARVEST_RANGE_DONE', 'RC_LIVE_NOW_DONE', 'KPI_HINWEIS', 'KPI_QUELLE_TOT'];
    let win = { rcKpiWin: { closed: false } }, T = baue(win);
    typen.forEach(t => T.h({ data: { type: t }, source: null }));
    pruefe('alle sechs Typen kommen durch und werden an die Nachbarn weitergereicht (auch KPI_QUELLE_TOT und KPI_HINWEIS)', T.behandelt.join() === typen.join() && T.weiter.join() === typen.join(), T.behandelt.join());
    T.h({ data: { type: 'RC_GIBT_ES_NICHT' }, source: null }); T.h({ data: null, source: null });
    pruefe('Unbekanntes und Leeres bleibt draussen', T.behandelt.length === typen.length);
    const quelle = { closed: false, name: 'liga' };
    win = { rcKpiWin: null }; T = baue(win); T.h({ data: { type: 'KPI_BATCH' }, source: quelle });
    pruefe('fehlt die Verbindung, wird der Absender eines Datenpakets als Ligalisten-Fenster uebernommen', win.rcKpiWin === quelle);
    win = { rcKpiWin: { closed: true } }; T = baue(win); T.h({ data: { type: 'KPI_BATCH' }, source: quelle });
    pruefe('  ... auch wenn das gemerkte Fenster geschlossen ist', win.rcKpiWin === quelle);
    const steht = { closed: false, name: 'steht' };
    win = { rcKpiWin: steht }; T = baue(win); T.h({ data: { type: 'KPI_BATCH' }, source: quelle });
    pruefe('eine stehende Verbindung wird NICHT ersetzt', win.rcKpiWin === steht);
    win = { rcKpiWin: null }; T = baue(win); T.h({ data: { type: 'KPI_HINWEIS' }, source: quelle }); T.h({ data: { type: 'KPI_BATCH' }, source: win });
    pruefe('nur DATENpakete eines fremden Fensters zaehlen (kein Hinweis, nicht das eigene Fenster)', win.rcKpiWin === null);
  }
  const zweig = schneide(DASH, "if (d.type === 'KPI_HINWEIS') {");
  pruefe('Zweig fuer KPI_HINWEIS gefunden', !!zweig);
  if (zweig) {
    const warns = [], win = {};
    const f = new Function('window', 'rcLog', 'Date', 'return function(d){ ' + zweig + ' return "weiter"; };')(win, { warn: t => warns.push(t) }, Date);
    const txt = 'Ligalisten-Tab war 13 Min vom Browser eingefroren (Edge "Schlafende Tabs") — in der Zeit lief kein Abruf.';
    const e1 = f({ type: 'KPI_HINWEIS', text: txt, zeit: 1000 });
    pruefe('die Zeile des Crawlers steht als Warnung im Logbuch', e1 === true && warns.length === 1 && warns[0] === txt && win.rcLigaHinweis.text === txt);
    f({ type: 'KPI_HINWEIS', text: txt, zeit: 1000 });
    pruefe('dieselbe Zeile ueber den zweiten Kanal zaehlt nur einmal', warns.length === 1);
    // Der Autopilot meldet die Fehlerseite bei JEDEM Neuversuch (alle 20 s) mit demselben Text.
    for (let s = 20; s <= 280; s += 20) f({ type: 'KPI_HINWEIS', text: txt, zeit: 1000 + s * 1000 });
    pruefe('derselbe Text alle 20 s (Fehlerseite, jeder Neuversuch) fuellt das Logbuch NICHT', warns.length === 1);
    f({ type: 'KPI_HINWEIS', text: txt, zeit: 1000 + 600000 });
    pruefe('derselbe Text zehn Minuten spaeter ist ein NEUES Ereignis', warns.length === 2);
    {
      const w2 = [], f2 = new Function('window', 'rcLog', 'Date', 'return function(d){ ' + zweig.replace('< 300000', '< 3000') + ' return "weiter"; };')({}, { warn: t => w2.push(t) }, Date);
      for (let s = 0; s <= 280; s += 20) f2({ type: 'KPI_HINWEIS', text: txt, zeit: 1000 + s * 1000 });
      pruefe('GEGENPROBE: mit dem alten 3-s-Fenster stuende dieselbe Zeile 15-mal im Logbuch', /< 300000/.test(zweig) && w2.length === 15, w2.length + ' Zeilen');
    }
    f({ type: 'KPI_HINWEIS', text: new Array(402).join('y'), zeit: 5 }); f({ type: 'KPI_HINWEIS', text: '', zeit: 6 }); f({ type: 'KPI_HINWEIS', zeit: 7 });
    pruefe('ueberlange Zeilen werden gekuerzt, leere verworfen', warns.length === 3 && warns[2].length === 300);
  }

  /* -------------------------------------------------------------------------
     7) Genesys-Crawler
  ------------------------------------------------------------------------- */
  console.log('\n7) Genesys-Crawler haelt einen Web Lock');
  const gmW = schneide(GM, '(function wachhalten() {');
  pruefe('Wachhalter im Genesys-Crawler gefunden', !!gmW);
  if (gmW) {
    const lauf = (win, nav) => new Function('window', 'navigator', 'performance', 'Date', 'console', gmW + ')();')(win, nav, { now: () => 1.5 }, { now: () => 3000 }, { warn() {} });
    let L = locksBauen(), win = {};
    lauf(win, L.nav); await ruhig();
    pruefe('Lock angefordert, eigener Name, nie zurueckgegeben', L.anfragen.length === 1 && /^rc_wach_gm_/.test(L.anfragen[0].name) && !!win.__rcWachLock && await haengt(L.anfragen[0].erg));
    lauf(win, L.nav); await ruhig();
    pruefe('Re-Inject: kein zweiter Lock', L.anfragen.length === 1);
    let geworfen = false; try { lauf({}, {}); } catch (e) { geworfen = true; }
    pruefe('ohne Web Locks: kein Absturz', !geworfen);
  }

  /* -------------------------------------------------------------------------
     8) Autopilot: fremde Seite
  ------------------------------------------------------------------------- */
  console.log('\n8) Autopilot auf fremden Seiten: ein Satz, der von selbst verschwindet');
  for (const a of AUTO) {
    const block = schneide(a.t, 'else if (H) {');
    pruefe(a.n + ': keine Dauermeldung "keine bekannte Portal-Seite" mehr',
      !/banner\('keine bekannte Portal-Seite/.test(a.t) && !!block && /gehoert nicht zu ESL oder Ligaliste/.test(block));
    if (!block) continue;
    const banner = []; let entfernt = 0; const uhr = uhrBauen();
    new Function('H', 'banner', 'setTimeout', 'document', 'if (false) {} ' + block)(
      'claude.ai', (t, f) => banner.push([t, f]), uhr.setTimeout, { getElementById: () => ({ parentNode: { removeChild() { entfernt++; } } }) });
    pruefe('  ... nennt die Adresse in Grau (kein Alarm) und bleibt zunaechst stehen',
      banner.length === 1 && /claude\.ai/.test(banner[0][0]) && banner[0][1] === '#9C9C9C' && entfernt === 0 && uhr.offen() === 1);
    await uhr.vor(7999); const nochDa = entfernt === 0;
    await uhr.vor(2);
    pruefe('  ... und verschwindet nach 8 s von selbst', nochDa && entfernt === 1);
  }
  pruefe('GEGENPROBE: die alte Zeile waere erkennbar', /banner\('keine bekannte Portal-Seite/.test("else if (H) banner('keine bekannte Portal-Seite (' + H + ').', '#9C9C9C');"));

  /* -------------------------------------------------------------------------
     8b) Autopilot auf Edges FEHLERSEITE
     An echtem Edge gemessen (fehlerseite_messen.mjs): laedt eine Portal-Seite
     nicht, laeuft der Autopilot auf der Fehlerseite mit hostname
     "chromewebdata". Die alte Weiche schrieb dort "keine bekannte Portal-Seite
     (chromewebdata)" und tat nichts mehr — die Ligaliste blieb tot.
  ------------------------------------------------------------------------- */
  console.log('\n8b) Autopilot auf Edges Fehlerseite: laedt unsere Seiten von selbst neu');
  // Umgebung: alles, was die ausgeschnittenen Funktionen frei benutzen, haengt an EINEM Objekt (with),
  // damit sich Titel, Fenstername und "stop" waehrend des Laufs aendern lassen.
  const fehlUmgebung = (ueber) => {
    const uhr = uhrBauen(), U = { uhr, banner: [], post: [], reloads: 0, entfernt: 0, fluss: [], titelBlicke: 0 };
    const titel = (ueber && ueber.titel !== undefined) ? ueber.titel : 'ccs.vodafone.de';
    U.ctx = Object.assign({
      H: 'chromewebdata', stop: false,
      location: { protocol: 'chrome-error:', reload() { U.reloads++; } },
      document: { get title() { U.titelBlicke++; return typeof titel === 'function' ? titel(U.titelBlicke) : titel; },
        querySelector: sel => (/error-code/.test(sel) && ueber && ueber.code !== undefined ? (ueber.code === null ? null : { textContent: ueber.code }) : (/error-code/.test(sel) ? { textContent: '  ERR_CONNECTION_RESET \n' } : null)),
        getElementById: () => ({ parentNode: { removeChild() { U.entfernt++; } } }) },
      window: { name: 'rcKpiQuelle', opener: { postMessage: (m, ziel) => U.post.push({ m, ziel }) } },
      banner: (t, f) => U.banner.push([t, f]), setTimeout: uhr.setTimeout,
      eslFlow: () => U.fluss.push('esl'), msFlow: () => U.fluss.push('ms'), ccsFlow: () => U.fluss.push('ccs')
    }, (ueber && ueber.ctx) || {});
    if (ueber && ueber.fenster) U.ctx.window = ueber.fenster(U);
    return U;
  };
  for (const a of AUTO) {
    const teile = ['function seitenArt(h) {', 'function istFehlerseite() {', 'function fehlerseiteHost() {', 'function fehlerseiteCode() {', 'function fehlerseiteFlow() {', 'function weiche() {'].map(k => schneide(a.t, k));
    const wSek = +((a.t.match(/var FEHLERSEITE_WARTE_SEK = (\d+);/) || [])[1] || 0);
    pruefe(a.n + ': Fehlerseiten-Zweig vorhanden (sechs Bausteine, Wartezeit ' + wSek + ' s)', teile.every(Boolean) && wSek >= 10 && wSek <= 60);
    if (!teile.every(Boolean)) continue;
    const bau = U => new Function('ctx', 'with (ctx) { var FEHLERSEITE_WARTE_SEK = ' + wSek + ';\n' + teile.join('\n') + '\nreturn { weiche: weiche, seitenArt: seitenArt, fehlerseiteHost: fehlerseiteHost }; }')(U.ctx);

    // F1: Ligaliste auf der Fehlerseite
    let U = fehlUmgebung(); let A = bau(U); A.weiche(); await ruhig();
    pruefe('  Ligaliste auf der Fehlerseite: keiner der normalen Ablaeufe startet, KEIN "fremde Seite"',
      U.fluss.length === 0 && U.banner.length === 1 && !/gehoert nicht zu|keine bekannte/.test(U.banner[0][0]));
    pruefe('  ... gelber Hinweis mit Adresse und Fehlercode, kuendigt das Neuladen an',
      U.banner[0][1] === '#FFB84D' && /ccs\.vodafone\.de ist nicht erreichbar \(ERR_CONNECTION_RESET\)/.test(U.banner[0][0]) && new RegExp('lade in ' + wSek + ' s von selbst neu').test(U.banner[0][0]), U.banner[0][0]);
    pruefe('  ... das Dashboard bekommt EINE Zeile fuers Logbuch (KPI_HINWEIS, mit Fehlercode)',
      U.post.length === 1 && U.post[0].m.type === 'KPI_HINWEIS' && U.post[0].ziel === '*' && /Ligalisten-Tab steht auf der Fehlerseite des Browsers \(ccs\.vodafone\.de, ERR_CONNECTION_RESET\)/.test(U.post[0].m.text) && U.post[0].m.text.length <= 300, U.post[0] && U.post[0].m.text);
    await U.uhr.vor(wSek * 1000 - 1); const vorher = U.reloads;
    await U.uhr.vor(2);
    pruefe('  ... kein Neuladen vor Ablauf, danach GENAU eines', vorher === 0 && U.reloads === 1);
    await U.uhr.vor(600000);
    pruefe('  ... und kein zweites aus demselben Dokument (der naechste Versuch gehoert dem naechsten Dokument)', U.reloads === 1 && U.uhr.offen() === 0);
    const text1 = U.post[0].m.text;
    U = fehlUmgebung(); A = bau(U); await U.uhr.vor(987654); A.weiche(); await ruhig();
    pruefe('  ... der Logbuch-Text ist bei jedem Versuch GLEICH (sonst fasst das Dashboard nicht zusammen)', U.post.length === 1 && U.post[0].m.text === text1);

    // F2: Titel steht erst nach einem Augenblick
    U = fehlUmgebung({ titel: n => (n <= 2 ? '' : 'esl.regiocom.net') }); A = bau(U); A.weiche(); await ruhig();
    const nochNichts = U.banner.length === 0;
    await U.uhr.vor(700); await U.uhr.vor(wSek * 1000 + 5);
    pruefe('  Titel kommt verspaetet: erst nachsehen, dann als ESL erkannt und neu geladen', nochNichts && U.banner.length === 1 && /esl\.regiocom\.net ist nicht erreichbar/.test(U.banner[0][0]) && U.reloads === 1);

    // F3: fremder Tab
    U = fehlUmgebung({ titel: 'www.beispiel.de', fenster: X => ({ name: '', opener: { postMessage: m => X.post.push({ m }) } }) }); A = bau(U); A.weiche(); await ruhig();
    pruefe('  fremder Tab auf einer Fehlerseite: grauer Satz mit der Adresse, keine Meldung ans Dashboard',
      U.banner.length === 1 && U.banner[0][1] === '#9C9C9C' && /Seite nicht erreichbar \(www\.beispiel\.de\) — gehoert nicht zu ESL oder Ligaliste/.test(U.banner[0][0]) && U.post.length === 0);
    await U.uhr.vor(7999); const steht = U.entfernt === 0; await U.uhr.vor(600000);
    pruefe('  ... wird NIE neu geladen, der Satz verschwindet nach 8 s', steht && U.entfernt === 1 && U.reloads === 0);

    // F4: kein Titel, aber der Fenstername sagt, wessen Tab das ist
    U = fehlUmgebung({ titel: '', code: 'HTTP ERROR 500', fenster: X => ({ name: 'rcQueueQuelle_um', opener: { postMessage: m => X.post.push({ m }) } }) }); A = bau(U); A.weiche(); await ruhig();
    await U.uhr.vor(3100 + wSek * 1000);
    pruefe('  ohne lesbaren Titel entscheidet der Fenstername (Genesys-Tab): Hinweis, Meldung, Neuladen',
      U.reloads === 1 && U.post.length === 1 && /^Genesys-Tab steht auf der Fehlerseite des Browsers \(Adresse unbekannt, HTTP ERROR 500\)/.test(U.post[0].m.text), U.post[0] && U.post[0].m.text);

    // F5: weder Titel noch Fenstername — "unbekannt" ist nicht "unser"
    U = fehlUmgebung({ titel: '', fenster: () => ({ name: '', opener: null }) }); A = bau(U); A.weiche(); await ruhig();
    await U.uhr.vor(600000);
    pruefe('  weder Titel noch Fenstername: nicht raten — kein Neuladen', U.reloads === 0 && U.banner.length === 1 && U.banner[0][1] === '#9C9C9C');

    // F6: rcAutoOff
    U = fehlUmgebung(); A = bau(U); A.weiche(); await ruhig(); U.ctx.stop = true; await U.uhr.vor(600000);
    pruefe('  rcAutoOff() vor Ablauf: kein Neuladen', U.reloads === 0);

    // F7: ohne opener (ESL-Tab) und ohne Fehlercode
    U = fehlUmgebung({ titel: 'esl.regiocom.net', code: null, fenster: () => ({ name: '', opener: null }) }); A = bau(U); let geworfen = false;
    try { A.weiche(); await ruhig(); await U.uhr.vor(wSek * 1000 + 5); } catch (e) { geworfen = true; }
    pruefe('  ESL-Tab (kein opener, kein Fehlercode lesbar): kein Absturz, Hinweis ohne Code, Neuladen',
      !geworfen && U.reloads === 1 && /esl\.regiocom\.net ist nicht erreichbar \(Netz oder Portal antwortet nicht\)/.test(U.banner[0][0]));

    // F8: normale Seiten laufen wie bisher
    const normal = h => { const X = fehlUmgebung({ ctx: { H: h, location: { protocol: 'https:', reload() { X.reloads++; } } } }); bau(X).weiche(); return X; };
    const n1 = normal('esl.regiocom.net'), n2 = normal('login.microsoftonline.com'), n3 = normal('login.live.com'), n4 = normal('ccs.vodafone.de'), n5 = normal(''), n6 = normal('claude.ai');
    pruefe('  normale Seiten unveraendert: ESL, Microsoft-Anmeldung (beide Adressen), CCS, leere Huelle, fremde Seite',
      n1.fluss.join() === 'esl' && n2.fluss.join() === 'ms' && n3.fluss.join() === 'ms' && n4.fluss.join() === 'ccs' && n5.fluss.length === 0 && n5.banner.length === 0 &&
      n6.fluss.length === 0 && /diese Seite \(claude\.ai\) gehoert nicht/.test(n6.banner[0][0]) && [n1, n2, n3, n4, n5, n6].every(x => x.reloads === 0));

    // F9: Titel-Schreibweisen
    const hostAus = t => { const X = fehlUmgebung({ titel: t }); return bau(X).fehlerseiteHost(); };
    pruefe('  Adresse aus dem Titel: Gross/klein, Leerraum, Protokoll, Port und Pfad stoeren nicht',
      hostAus('ccs.vodafone.de') === 'ccs.vodafone.de' && hostAus('  CCS.Vodafone.DE ') === 'ccs.vodafone.de' && hostAus('https://ccs.vodafone.de/cgi-bin/x.rb?a=1') === 'ccs.vodafone.de' && hostAus('ccs.vodafone.de:8442') === 'ccs.vodafone.de' && hostAus('') === '');

    // F10: EINE Liste der bekannten Seiten
    const ohneArt = a.t.replace(teile[0], '');
    pruefe('  EINE Liste: die Adressen stehen nur in seitenArt, Weiche und Fehlerseite fragen sie',
      !/=== 'ccs\.vodafone\.de'/.test(ohneArt) && !/=== 'esl\.regiocom\.net'/.test(ohneArt) && /=== 'ccs\.vodafone\.de'/.test(teile[0]) && /=== 'esl\.regiocom\.net'/.test(teile[0]) && /seitenArt\(H\)/.test(teile[5]) && /seitenArt\(host\)/.test(teile[4]));
    pruefe('  die Fehlerseite wird in der Weiche ZUERST geprueft', teile[5].indexOf('istFehlerseite()') > 0 && teile[5].indexOf('istFehlerseite()') < teile[5].indexOf('eslFlow()'));
  }
  {
    // GEGENPROBE: die Weiche vom Nachmittag auf derselben Fehlerseite
    const alteWeiche = "function weiche() { try { if (H === 'esl.regiocom.net') eslFlow(); else if (H.indexOf('microsoftonline') !== -1 || H === 'login.live.com') msFlow(); else if (H === 'ccs.vodafone.de') ccsFlow(); else if (H) banner('keine bekannte Portal-Seite (' + H + ').', '#9C9C9C'); } catch (e) { banner('Fehler: ' + e.message, '#FF6666'); } }";
    const U = fehlUmgebung();
    new Function('ctx', 'with (ctx) { ' + alteWeiche + '\nreturn weiche; }')(U.ctx)(); await ruhig(); await U.uhr.vor(3600000);
    pruefe('GEGENPROBE: die alte Weiche schreibt dort "keine bekannte Portal-Seite (chromewebdata)" und laedt nie neu',
      U.banner.length === 1 && U.banner[0][0] === 'keine bekannte Portal-Seite (chromewebdata).' && U.reloads === 0 && U.post.length === 0);
  }

  /* -------------------------------------------------------------------------
     9) Starter: Ligalisten-Tab da, aber nicht am Dashboard
  ------------------------------------------------------------------------- */
  console.log('\n9) Starter verbindet eine Ligaliste, die nicht am Dashboard haengt (Logbuch 29.09.)');
  const lv = schneidePs(CMD, 'function StelleLigalisteVerbunden($alle)');
  pruefe('StelleLigalisteVerbunden ist vorhanden', !!lv);
  if (lv) {
    pruefe('eigene Drossel, Dashboard-Abfrage vor dem Eingriff, Nutzer-Geste, neuer Tab wird verankert',
      /DarfOeffnen 'ligaVerbinden'/.test(lv) && /DashboardTab \$alle/.test(lv) && /userGesture = \$true/.test(lv) && /VerankereNeuenTab/.test(lv));
    pruefe('kein Tab per Fernsteuerung angelegt (ein solcher haette keinen opener)', !/Target\.createTarget/.test(lv));
    const iAufruf = CMD.indexOf('if (StelleLigalisteVerbunden $alle)'), iSicher = CMD.indexOf('if (StelleLigalisteSicher $alle)');
    const iSchalter = CMD.lastIndexOf('if ($AutoLigaliste) {', iAufruf);
    pruefe('wird im Waechter AUFGERUFEN — nach StelleLigalisteSicher, unter demselben Schalter', iAufruf > iSicher && iSicher > iSchalter && iSchalter > 0 && iAufruf - iSchalter < 700);
    // Der JS-Text entsteht durch PowerShell-Verkettung: zusammensetzen und WIRKLICH ausfuehren.
    const jsA = lv.indexOf("$js = '"), jsE = lv.indexOf('$vorher = TabIds');
    const stuecke = (jsA > 0 && jsE > jsA) ? Array.from(lv.slice(jsA, jsE).matchAll(/'((?:[^']|'')*)'/g)).map(m => m[1].replace(/''/g, "'")) : [];
    const ausdruck = stuecke.join('');
    let fn = null;
    try { fn = new Function('window', 'return ' + ausdruck + ';'); } catch (e) { fn = null; }
    pruefe('der erzeugte JS-Ausdruck ist gueltig', !!fn && /rcOpenKpiQuelle/.test(ausdruck), ausdruck.slice(0, 120));
    if (fn) {
      const jetzt = Date.now(), min = m => m * 60000;
      const fall = (ueber) => { const w = Object.assign({ rcKpiWin: null, rcKpiLastUpdate: null, rcDriftLage: { startUm: jetzt - min(30) }, aufrufe: 0 }, ueber);
        if (!('rcOpenKpiQuelle' in ueber)) w.rcOpenKpiQuelle = function () { w.aufrufe++; return true; };
        return { erg: fn(w), w }; };
      let x = fall({ rcKpiWin: { closed: false } });
      pruefe('Dashboard ist verbunden: nichts tun', x.erg === 'ok' && x.w.aufrufe === 0);
      x = fall({ rcKpiLastUpdate: new Date(jetzt - min(2)) });
      pruefe('frische Liga-Daten (2 Min): nichts tun', x.erg === 'ok' && x.w.aufrufe === 0);
      x = fall({ rcDriftLage: { startUm: jetzt - 60000 } });
      pruefe('Dashboard laeuft erst eine Minute: abwarten (es verbindet sich nach 12 s selbst)', x.erg === 'ok' && x.w.aufrufe === 0);
      x = fall({});
      pruefe('nicht verbunden, nie Daten, Dashboard laeuft seit 30 Min: rcOpenKpiQuelle wird gerufen', x.erg === 'verbunden' && x.w.aufrufe === 1);
      x = fall({ rcKpiWin: { closed: true }, rcKpiLastUpdate: new Date(jetzt - min(9)) });
      pruefe('gemerktes Fenster geschlossen, Daten 9 Min alt: ebenfalls', x.erg === 'verbunden' && x.w.aufrufe === 1);
      x = fall({ rcKpiWin: { get closed() { throw new Error('fremd'); } } });
      pruefe('unlesbares Fenster gilt als nicht verbunden (kein "fehler")', x.erg === 'verbunden');
      x = fall({ rcOpenKpiQuelle: function () { return false; } });
      pruefe('blockiert der Browser trotzdem: ehrlich "blockiert"', x.erg === 'blockiert');
      x = fall({ rcOpenKpiQuelle: undefined });
      pruefe('aeltere Dashboard-Fassung ohne die Funktion: "fehlt" statt Absturz', x.erg === 'fehlt');
    }
    const oeffner = schneide(DASH, 'window.rcOpenKpiQuelle = function(){');
    pruefe('rcOpenKpiQuelle gibt es im Dashboard, ohne alert() (ein Dialog liesse die Fernsteuerung haengen)', !!oeffner && !/alert\(/.test(oeffner) && /return true;/.test(oeffner) && /return false;/.test(oeffner));
    pruefe('Standmarke des Starters ist mitgezogen', /\$StarterStand = '2026-10-05 Liga-verbunden'/.test(CMD));
    let ps1 = ''; try { ps1 = lies('ESL_Start.ps1'); } catch (e) {}
    pruefe('ESL_Start.ps1 ist neu erzeugt (traegt die Funktion)', /function StelleLigalisteVerbunden\(\$alle\)/.test(ps1));
  }

  /* -------------------------------------------------------------------------
     10) Messgeraet
  ------------------------------------------------------------------------- */
  console.log('\n10) Messgeraet');
  const mess = path.join(__dirname, 'schlaf_messen.mjs');
  pruefe('schlaf_messen.mjs liegt bei und heisst nicht *_pruefen.js (laeuft nicht im Sammellauf mit)', fs.existsSync(mess) && !/_pruefen\.js$/.test(mess));
  pruefe('fehlerseite_messen.mjs liegt bei (echtes Edge: Fehlerseite, Neuversuch, Gegenprobe)', fs.existsSync(path.join(__dirname, 'fehlerseite_messen.mjs')));
  // Wegwerf-Profile ohne --disable-sync holen auf dem Entwicklungsrechner die Konto-Einstellungen
  // (gemessen: "alle Cookies blockieren" nach rund 12 s) — danach lehnt Edge jeden Web Lock ab.
  const ohneSync = ['schlaf_messen.mjs', 'fehlerseite_messen.mjs', 'kopfleiste_messen.mjs'].filter(n => { try { return !/'--disable-sync'/.test(fs.readFileSync(path.join(__dirname, n), 'utf8')); } catch (e) { return true; } });
  pruefe('die Messgeraete starten Edge mit --disable-sync (sonst misst man die Konto-Einstellungen mit)', ohneSync.length === 0, ohneSync.join(', '));

  await ruhig();
  console.log('\n' + (fehler === 0 ? 'ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN' : fehler + ' von ' + geprueft + ' FEHLGESCHLAGEN'));
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH: ' + (e && e.stack || e)); console.log('1 von 1 FEHLGESCHLAGEN'); process.exit(1); });
