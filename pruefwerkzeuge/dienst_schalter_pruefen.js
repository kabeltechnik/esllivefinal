'use strict';
// ============================================================================
//  DIENST-SCHALTER UND WEITERLEITUNG PRUEFEN (27.10.2026)
//  Das Dashboard laeuft kuenftig auch als eigene Seite unter dem Datendienst
//  (http://127.0.0.1:8787). Setzt die Gastseite VOR dem Laden die Marke
//  window.__rcDienst = {basis}, darf esl_live_arena_v22.js das Portal NIE selbst
//  anfassen: kein Abruf bei ESL/CCS, kein Fenster, kein Neuladen, kein Klick,
//  keine Anmeldung. "Jetzt", Projektwechsel, Auffrischen und Zeitraeume gehen
//  stattdessen als Auftrag an den Dienst. OHNE Marke muss jede Zeile wie bisher
//  laufen.
//
//  Was dieses Werkzeug festhaelt:
//   1. Die neuen Bausteine stehen als FUNKTIONSDEKLARATION in v22 (TDZ-Regel).
//   2. Anfrage, Warten und die drei Weiterleitungen (Abruf, Runde, Bereich)
//      funktional — mit gestellter Uhr, damit 10-s-Fristen keine 10 s kosten.
//   3. rcProjektLieferung (aus rcProjektAbruf herausgezogen) mit einem ECHTEN
//      Export (Test Excels/Export_20260928_212922.xlsx, node_modules/xlsx).
//   4. Jede Weiche ZWEIMAL: mit Marke (kein Portal-Effekt, Weiterleitung mit
//      den richtigen Argumenten) und ohne (das bisherige Verhalten tritt ein —
//      Gegenprobe; eine Weiche, die auch ohne Marke greift, faellt hier auf).
//   5. rcRangeLoad und frischDann (Closures in Dialogen) als BLOCK geschnitten
//      (Fallstrick 18) und funktional ausgefuehrt.
//   6. Die Funktionen OHNE eigene Weiche (holeExcelVomServer, rcPortalAufHeute,
//      rcMitternachtPruefen, rcExportAnsichtSicherstellen, rcFrischHolen,
//      rcProjektWechseln, rcProjektAktualisieren, rcProjekteAlleAktualisieren)
//      in EINER Kette mit den echten weitergeleiteten Funktionen: im Dienst-
//      Betrieb landet alles beim Dienst, nichts beim Portal.
//  Echte Funktionen per Klammer-Zaehlung geschnitten (_stack_regel.js), mit
//  new Function in einer Huelle mit Spionen ausgewertet — kein Nachbau.
// ============================================================================
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const V22 = fs.readFileSync(path.join(DIR, 'esl_live_arena_v22.js'), 'utf8');
const BAUSTEIN = require('./_stack_regel.js');

let ok = 0, rot = 0;
function pruefe(name, bed, info) { if (bed) ok++; else rot++; console.log((bed ? 'OK   ' : 'ROT  ') + name + (info ? '  (' + info + ')' : '')); }
function schneide(src, kopf) {
  const t = BAUSTEIN.schneide(src, kopf);
  if (!t) throw new Error('nicht gefunden: ' + kopf);
  return t;
}
const Q = kopf => schneide(V22, kopf);
// Quelltext in einer Huelle auswerten: env = Name -> Wert (Spione, Attrappen).
function lade(quell, env, namen) {
  const k = Object.keys(env);
  return new Function(...k, quell + '\nreturn { ' + namen.join(', ') + ' };')(...k.map(n => env[n]));
}
function spion(impl) {
  const f = function (...a) { f.aufrufe.push(a); return impl ? impl.apply(this, a) : undefined; };
  f.aufrufe = [];
  return f;
}
const MARKE = { basis: 'http://127.0.0.1:8787' };
const naechsterTakt = () => new Promise(r => setImmediate(r));
// Gestellte Uhr: setTimeout springt sofort (setImmediate) und rueckt Date.now vor.
function uhrwerk() {
  const u = { jetzt: 1.7e12, plan: [], verzoegerungen: [] };
  u.Date = { now: () => u.jetzt };
  u.setTimeout = (fn, ms) => { const t = { bei: u.jetzt + (ms || 0), fn }; u.plan.push(t); u.verzoegerungen.push(ms); setImmediate(u.lauf); return t; };
  u.clearTimeout = t => { const i = u.plan.indexOf(t); if (i >= 0) u.plan.splice(i, 1); };
  u.lauf = () => {
    if (!u.plan.length) return;
    u.plan.sort((a, b) => a.bei - b.bei);
    const t = u.plan.shift();
    if (t.bei > u.jetzt) u.jetzt = t.bei;
    t.fn();
  };
  return u;
}
const pad = n => String(n).padStart(2, '0');
const isoTag = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const deTag = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
const HEUTE_D = new Date(), GESTERN_D = new Date(Date.now() - 86400000);
const HEUTE = isoTag(HEUTE_D), GESTERN = isoTag(GESTERN_D);
const REGEL = BAUSTEIN.quelltext(V22);
// Haengt ein await fuer immer (z. B. eine Anfrage ohne Frist), beendet sich Node
// still, sobald nichts mehr geplant ist — das darf nicht wie "durchgelaufen" aussehen.
let fertig = false;
process.on('exit', () => { if (!fertig) { console.log('ABBRUCH: ein Schritt kam nie zurueck (haengt) nach ' + ok + ' bestandenen Pruefungen'); console.log((rot + 1) + ' fehlgeschlagen (haengt), ' + ok + ' bestanden'); process.exitCode = 1; } });

(async () => {
  // ==========================================================================
  console.log('\n-- 1. Die neuen Bausteine stehen als Funktionsdeklaration in v22 --');
  // ==========================================================================
  const NEU = ['function rcDienstModus(', 'async function rcDienstAnfrage(', 'function rcDienstWarteAuf(', 'function rcDienstGesehenNr(', 'function rcDienstEslArtOk(',
    'async function rcDienstAbruf(', 'async function rcDienstRunde(', 'async function rcDienstBereich(', 'function rcProjektLieferung('];
  const fehlt = NEU.filter(k => V22.indexOf(k) === -1);
  NEU.forEach(k => pruefe('steht als Deklaration: ' + k.replace(/^async /, '').replace(/\($/, ''), V22.indexOf(k) !== -1));
  if (fehlt.length) throw new Error('Bausteine fehlen: ' + fehlt.join(', '));
  pruefe('rcDienstModus fragt NUR die Marke (kein Raten am Hostnamen)',
    /return !!\(window\.__rcDienst && window\.__rcDienst\.basis\);/.test(Q('function rcDienstModus(')) && !/location|hostname/.test(Q('function rcDienstModus(')));
  pruefe('rcDienstModus steht nahe rcProjektErkennen (vor allem, was ihn beim Aufbau fragt)',
    V22.indexOf('function rcDienstModus(') > V22.indexOf('(function rcProjektErkennen(') && V22.indexOf('function rcDienstModus(') < V22.indexOf('function rcAlleProjekteAn('));
  pruefe('rcEslErfolg(zeit) uebernimmt die Lieferzeit', /function rcEslErfolg\(zeit\)\{[\s\S]*?window\.rcEslLastOk = zeit \|\| Date\.now\(\);/.test(Q('function rcEslErfolg(')));
  {
    const W = { rcEslFehlserie: 2, rcEslFehlgrund: 'x' };
    const F = lade(Q('function rcEslErfolg('), { window: W, rcLog: { log() {} } }, ['rcEslErfolg']);
    F.rcEslErfolg(1234);
    const a = W.rcEslLastOk; F.rcEslErfolg();
    pruefe('...funktional: rcEslErfolg(1234) -> 1234, ohne Zeit -> jetzt, Fehlserie raeumt', a === 1234 && Math.abs(W.rcEslLastOk - Date.now()) < 5000 && W.rcEslFehlserie === 0);
  }

  // ==========================================================================
  console.log('\n-- 2. Anfrage, Warten, Weiterleitung (Abruf / Runde / Bereich) --');
  // ==========================================================================
  { // rcDienstModus
    const F = W => lade(Q('function rcDienstModus('), { window: W }, ['rcDienstModus']).rcDienstModus();
    pruefe('rcDienstModus: ohne Marke false, mit {basis} true, Marke ohne basis false',
      F({}) === false && F({ __rcDienst: MARKE }) === true && F({ __rcDienst: {} }) === false);
  }
  { // rcDienstAnfrage
    const quell = Q('async function rcDienstAnfrage(');
    const mit = (fetchImpl) => {
      const fetch = spion(fetchImpl);
      const F = lade(quell, { window: { __rcDienst: MARKE }, fetch }, ['rcDienstAnfrage']);
      return { F, fetch };
    };
    const a = mit(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, nr: 3 }) }));
    const r = await a.F.rcDienstAnfrage('/api/abruf', { projekt: 'um' }, 5000);
    const [url, opt] = a.fetch.aufrufe[0] || [];
    pruefe('rcDienstAnfrage: POST an basis + pfad, JSON-Rumpf, gleiche Herkunft, mit Abbruch-Signal',
      url === 'http://127.0.0.1:8787/api/abruf' && opt && opt.method === 'POST' && opt.credentials === 'same-origin' &&
      opt.body === '{"projekt":"um"}' && /json/i.test((opt.headers || {})['Content-Type'] || '') && !!opt.signal, url + ' ' + JSON.stringify(opt && { ...opt, signal: !!opt.signal }));
    pruefe('...liefert die Antwort des Dienstes', r && r.ok === true && r.nr === 3, JSON.stringify(r));
    let signal = null;
    const nie = mit((u, o) => { signal = o.signal; return new Promise(() => {}); });
    const t0 = Date.now();
    const rn = await nie.F.rcDienstAnfrage('/api/runde', {}, 300);
    const dt = Date.now() - t0;
    pruefe('nie antwortendes fetch, Frist 300 ms: {ok:false} in unter 1 s', rn && rn.ok === false && !!rn.grund && dt < 1000, dt + ' ms, ' + JSON.stringify(rn));
    pruefe('...und die Anfrage wird abgebrochen (AbortController)', !!signal && signal.aborted === true);
    const wurf = await mit(async () => { throw new Error('ECONNREFUSED'); }).F.rcDienstAnfrage('/api/abruf', {}, 5000);
    pruefe('fetch wirft: kein Wurf nach aussen, {ok:false} mit Grund', wurf && wurf.ok === false && /ECONNREFUSED/.test(wurf.grund), JSON.stringify(wurf));
    const h403 = await mit(async () => ({ ok: false, status: 403, json: async () => { throw new Error('kein JSON'); } })).F.rcDienstAnfrage('/api/abruf', {}, 5000);
    pruefe('HTTP 403 (Seite nicht ueber den Starter geoeffnet): {ok:false, grund:"HTTP 403"}', h403 && h403.ok === false && /403/.test(h403.grund), JSON.stringify(h403));
    const ohne = await lade(quell, { window: {}, fetch: spion() }, ['rcDienstAnfrage']).rcDienstAnfrage('/api/abruf', {}, 5000);
    pruefe('ohne Marke: kein Wurf, {ok:false}', ohne && ohne.ok === false, JSON.stringify(ohne));
  }
  { // rcDienstWarteAuf
    const u = uhrwerk();
    const F = lade(Q('function rcDienstWarteAuf('), { Date: u.Date, setTimeout: u.setTimeout }, ['rcDienstWarteAuf']);
    let n = 0;
    const ja = await F.rcDienstWarteAuf(() => ++n >= 4, 10000);
    pruefe('rcDienstWarteAuf: wird die Bedingung wahr -> true, Abstand 250 ms', ja === true && n === 4 && u.verzoegerungen.every(ms => ms === 250), n + ' Blicke, ' + u.verzoegerungen.join(','));
    const t0 = u.jetzt;
    const nein = await F.rcDienstWarteAuf(() => false, 10000);
    pruefe('...bleibt sie falsch -> false nach der Frist (10 s gestellte Uhr)', nein === false && u.jetzt - t0 >= 10000 && u.jetzt - t0 < 10500, (u.jetzt - t0) + ' ms');
  }
  const DIENST_KERN = Q('function rcDienstWarteAuf(') + '\n' + Q('function rcDienstGesehenNr(') + '\n' + Q('function rcDienstEslArtOk(') + '\n' +
    Q('async function rcDienstAbruf(') + '\n' + Q('async function rcDienstRunde(') + '\n' + Q('async function rcDienstBereich(') + '\n' +
    Q('function rcProjRahmenListe(') + '\n' + Q('function rcProjEintrag(');
  function dienstKern(antwort, W) {
    const u = uhrwerk();
    W = Object.assign({ __rcDienst: MARKE, rcAktivProjekt: 'kabel', rcDienstGesehen: { esl: { kabel: 0, mobile: 0, um: 0 }, liga: 0, vortage: { kabel: 0, mobile: 0, um: 0 }, ereignis: 0 }, rcDienstErgebnis: {} }, W || {});
    const anfrage = spion(async (pfad, daten, frist) => (typeof antwort === 'function' ? antwort(pfad, daten, frist, u, W) : antwort));
    const F = lade(DIENST_KERN, { window: W, rcDienstAnfrage: anfrage, Date: u.Date, setTimeout: u.setTimeout }, ['rcDienstAbruf', 'rcDienstRunde', 'rcDienstBereich']);
    return { u, W, anfrage, F };
  }
  // Antwort-Formen des Dienstes (Ruling R5, verbindlich fuer Task 7):
  //   /api/abruf   -> {ok, nr, art, grund}
  //   /api/runde   -> {ok, nr, esl:{nr, art, grund}, liga:{nr, art, grund, agenten}|null}
  //   /api/bereich -> {ok, projekte:{p:{nr, esl:{art, grund}, liga:{art, tage, grund}}}}
  //   Frist        -> {ok:false, grund:'Frist abgelaufen', nr:<aktuell>}
  { // rcDienstAbruf
    const k = dienstKern((pfad, d, f, u, W) => {
      u.setTimeout(() => { W.rcDienstGesehen.esl.um = 7; W.rcDienstErgebnis.um = { nr: 7, r: { ok: true, zeilen: 42, pruefung: 'ok', text: '100 % UM' } }; }, 2000);
      return { ok: true, nr: 7, art: 'excel', grund: '' };
    }, { rcDienstGesehen: { esl: { kabel: 0, mobile: 0, um: 6 }, liga: 0, vortage: {} } });
    const r = await k.F.rcDienstAbruf('um');
    pruefe('rcDienstAbruf: /api/abruf mit {projekt}, Frist 160 s', JSON.stringify(k.anfrage.aufrufe[0]) === JSON.stringify(['/api/abruf', { projekt: 'um' }, 160000]), JSON.stringify(k.anfrage.aufrufe[0]));
    pruefe('...Gesehen.esl.um wird 7 -> Ergebnis aus rcDienstErgebnis (Pruefung von rcProjektLieferung)', r && r.ok === true && r.zeilen === 42 && r.text === '100 % UM', JSON.stringify(r));
    const k2 = dienstKern({ ok: true, nr: 7, art: 'excel', grund: '' }, { rcDienstGesehen: { esl: { kabel: 0, mobile: 0, um: 6 }, liga: 0, vortage: {} } });
    const t0 = k2.u.jetzt;
    const r2 = await k2.F.rcDienstAbruf('um');
    pruefe('...bleibt 6 -> nach der Frist (10 s) ok:false, Grund "nicht eingespeist"', r2 && r2.ok === false && /nicht eingespeist/.test(r2.grund) && k2.u.jetzt - t0 >= 10000 && k2.u.jetzt - t0 < 11000, (k2.u.jetzt - t0) + ' ms, ' + JSON.stringify(r2));
    const k3 = dienstKern((pfad, d, f, u, W) => {
      u.setTimeout(() => { W.rcDienstGesehen.esl.mobile = 3; W.rcDienstErgebnis.mobile = { nr: 3, r: { ok: false, grund: 'ESL lieferte fremde Daten — verworfen' } }; }, 500);
      return { ok: true, nr: 3, art: 'excel', grund: '' };
    });
    const r3 = await k3.F.rcDienstAbruf('mobile');
    pruefe('...verwirft die Lieferung die Pruefung im Dashboard, kommt genau das zurueck', r3 && r3.ok === false && /fremde Daten/.test(r3.grund), JSON.stringify(r3));
    const k3b = dienstKern((pfad, d, f, u, W) => {
      u.setTimeout(() => { W.rcDienstGesehen.esl.kabel = 8; W.rcDienstErgebnis.kabel = { nr: 8, r: { ok: false, grund: 'kein Export-Knopf (Seite nicht bereit)' } }; }, 300);
      return { ok: false, nr: 8, art: 'kein-export', grund: 'kein Export-Knopf' };
    });
    const r3b = await k3b.F.rcDienstAbruf('kabel');
    pruefe('...Dienst meldet art "kein-export" mit neuer Nummer: Ergebnis der Pruefung im Dashboard (ok:false)', r3b && r3b.ok === false && /kein Export-Knopf/.test(r3b.grund), JSON.stringify(r3b));
    const k4 = dienstKern({ ok: false, grund: 'HTTP 403' });
    const t4 = k4.u.jetzt;
    const r4 = await k4.F.rcDienstAbruf('kabel');
    pruefe('...Anfrage scheitert (ohne Nummer): ok:false mit Grund, KEIN Warten', r4 && r4.ok === false && /403/.test(r4.grund) && k4.u.jetzt === t4, JSON.stringify(r4));
    const k5 = dienstKern({ ok: false, grund: 'Frist abgelaufen', nr: 5 },
      { rcDienstGesehen: { esl: { kabel: 5, mobile: 0, um: 0 }, liga: 0, vortage: {} }, rcDienstErgebnis: { kabel: { nr: 5, r: { ok: true, zeilen: 99 } } } });
    const r5 = await k5.F.rcDienstAbruf('kabel');
    pruefe('...Frist des Dienstes (nr = aktuelle): der Erfolg der frueheren Lieferung geht NICHT durch, Grund "Frist abgelaufen"', r5 && r5.ok === false && /Frist abgelaufen/.test(r5.grund), JSON.stringify(r5));
  }
  { // rcDienstRunde
    const k = dienstKern((pfad, d, f, u, W) => {
      u.setTimeout(() => { W.rcDienstGesehen.esl.mobile = 4; W.rcDienstErgebnis.mobile = { nr: 4, r: { ok: true, zeilen: 10 } }; }, 800);
      u.setTimeout(() => { W.rcDienstGesehen.liga = 6; }, 1500);
      return { ok: true, nr: 12, esl: { nr: 4, art: 'excel', grund: '' }, liga: { nr: 6, art: 'ok', grund: '', agenten: 154 } };
    }, { rcAktivProjekt: 'mobile', rcDienstGesehen: { esl: { kabel: 0, mobile: 3, um: 0 }, liga: 5, vortage: {} } });
    const r = await k.F.rcDienstRunde();
    pruefe('rcDienstRunde: /api/runde mit dem AKTIVEN Projekt, Frist 160 s', JSON.stringify(k.anfrage.aufrufe[0]) === JSON.stringify(['/api/runde', { projekt: 'mobile' }, 160000]), JSON.stringify(k.anfrage.aufrufe[0]));
    pruefe('...wartet, bis esl.nr 4 UND liga.nr 6 eingespeist sind, liefert {liga:{ok,agenten}, esl:{ok}}',
      r && r.liga && r.liga.ok === true && r.liga.agenten === 154 && r.esl && r.esl.ok === true && k.u.jetzt - 1.7e12 >= 1500, JSON.stringify(r));
    const kx = dienstKern((pfad, d, f, u, W) => {
      u.setTimeout(() => { W.rcDienstGesehen.esl.kabel = 2; W.rcDienstErgebnis.kabel = { nr: 2, r: { ok: true } }; W.rcDienstGesehen.liga = 5; }, 300);
      return { ok: true, nr: 3, esl: { nr: 2, art: 'excel', grund: '' }, liga: { nr: 6, art: 'ok', grund: '', agenten: 9 } };
    }, { rcDienstGesehen: { esl: { kabel: 1, mobile: 0, um: 0 }, liga: 4, vortage: {} } });
    const rx = await kx.F.rcDienstRunde();
    pruefe('...wartet auf GENAU die gemeldete Nummer: Liga 5 statt 6 eingespeist -> Liga "noch nicht eingespeist", ESL ok',
      rx.esl.ok === true && rx.liga.ok === false && /noch nicht eingespeist/.test(rx.liga.error) && rx.liga.agenten === 9, JSON.stringify(rx));
    const k2 = dienstKern((pfad, d, f, u, W) => {
      u.setTimeout(() => { W.rcDienstGesehen.esl.kabel = 1; W.rcDienstErgebnis.kabel = { nr: 1, r: { ok: false, grund: 'ESL meldet ploetzlich keine Datensaetze (vorher 12) — Stand bleibt' } }; W.rcDienstGesehen.liga = 1; }, 300);
      return { ok: false, nr: 2, esl: { nr: 1, art: 'leer', grund: '' }, liga: { nr: 1, art: 'fehler', grund: 'ORA-01013', agenten: 0 } };
    });
    const r2 = await k2.F.rcDienstRunde();
    pruefe('...esl.ok aus der Pruefung im Dashboard (art "leer", aber "ploetzlich"), Liga art "fehler" -> Grund als error',
      r2.esl.ok === false && /ploetzlich/.test(r2.esl.error) && r2.liga.ok === false && r2.liga.error === 'ORA-01013', JSON.stringify(r2));
    const k2b = dienstKern((pfad, d, f, u, W) => {
      u.setTimeout(() => { W.rcDienstGesehen.esl.kabel = 1; W.rcDienstGesehen.liga = 1; }, 300);
      return { ok: false, nr: 2, esl: { nr: 1, art: 'http', grund: 'HTTP 500' }, liga: { nr: 1, art: 'teil', grund: 'UM: ORA-01013', agenten: 300 } };
    });
    const r2b = await k2b.F.rcDienstRunde();
    pruefe('...ohne Ergebnis im Dashboard: ok aus art (http -> false mit Grund), Liga "teil" zaehlt als ok mit Agenten',
      r2b.esl.ok === false && /HTTP 500/.test(r2b.esl.error) && r2b.liga.ok === true && r2b.liga.agenten === 300, JSON.stringify(r2b));
    const k2c = dienstKern((pfad, d, f, u, W) => {
      u.setTimeout(() => { W.rcDienstGesehen.esl.kabel = 1; }, 300);    // eingespeist, aber (noch) ohne Ergebnis im Dashboard
      return { ok: true, nr: 2, esl: { nr: 1, art: 'leer', grund: '' }, liga: null };
    });
    const r2c = await k2c.F.rcDienstRunde();
    pruefe('...liga null (keine Liga in dieser Runde): ESL "leer" zaehlt als geliefert, Liga ok:false mit Erklaerung', r2c.esl.ok === true && r2c.liga.ok === false && /nicht/.test(r2c.liga.error), JSON.stringify(r2c));
    const k2d = dienstKern((pfad, d, f, u, W) => {
      // ein NEUERES Ergebnis (nr 3) steht schon da — es gehoert nicht zu dieser Runde (nr 2)
      u.setTimeout(() => { W.rcDienstGesehen.esl.kabel = 3; W.rcDienstErgebnis.kabel = { nr: 3, r: { ok: false, grund: 'fremd' } }; W.rcDienstGesehen.liga = 1; }, 300);
      return { ok: true, nr: 4, esl: { nr: 2, art: 'excel', grund: '' }, liga: { nr: 1, art: 'ok', grund: '', agenten: 5 } };
    });
    const r2d = await k2d.F.rcDienstRunde();
    pruefe('...das Ergebnis einer ANDEREN Lieferungs-Nummer zaehlt nicht: ok aus art', r2d.esl.ok === true && r2d.liga.ok === true, JSON.stringify(r2d));
    const k3 = dienstKern({ ok: true, nr: 3, esl: { nr: 1, art: 'excel', grund: '' }, liga: { nr: 1, art: 'ok', grund: '', agenten: 9 } });
    const t3 = k3.u.jetzt;
    const r3 = await k3.F.rcDienstRunde();
    pruefe('...nichts eingespeist: nach der Frist (10 s) beide mit "noch nicht eingespeist"',
      r3.esl.ok === false && /noch nicht eingespeist/.test(r3.esl.error) && r3.liga.ok === false && /noch nicht eingespeist/.test(r3.liga.error) && k3.u.jetzt - t3 >= 10000, JSON.stringify(r3));
    const k5 = dienstKern({ ok: false, grund: 'Frist abgelaufen', nr: 4 },
      { rcDienstGesehen: { esl: { kabel: 3, mobile: 0, um: 0 }, liga: 2, vortage: {} }, rcDienstErgebnis: { kabel: { nr: 3, r: { ok: true, zeilen: 50 } } } });
    const t5 = k5.u.jetzt;
    const r5 = await k5.F.rcDienstRunde();
    pruefe('...Frist des Dienstes: kein Warten, beide ok:false mit "Frist abgelaufen", kein alter Erfolg',
      k5.u.jetzt === t5 && r5.esl.ok === false && /Frist abgelaufen/.test(r5.esl.error) && r5.liga.ok === false && /Frist abgelaufen/.test(r5.liga.error), JSON.stringify(r5));
    const r4 = await dienstKern({ ok: false, grund: 'Datendienst antwortet nicht (160 s)' }).F.rcDienstRunde();
    pruefe('...Anfrage scheitert: beide ok:false mit dem Grund', r4.esl.ok === false && r4.liga.ok === false && /antwortet nicht/.test(r4.esl.error) && /antwortet nicht/.test(r4.liga.error), JSON.stringify(r4));
  }
  { // rcDienstBereich
    const k = dienstKern((pfad, d, f, u, W) => {
      u.setTimeout(() => { W.rcDienstGesehen.vortage.kabel = 2; }, 400);
      u.setTimeout(() => { W.rcDienstGesehen.vortage.um = 5; }, 900);
      return { ok: true, projekte: { kabel: { nr: 2, esl: { art: 'excel', grund: '' }, liga: { art: 'ok', tage: 7, grund: '' } },
                                     um: { nr: 5, esl: { art: 'leer', grund: '' }, liga: { art: 'ok', tage: 7, grund: '' } } } };
    });
    const b = await k.F.rcDienstBereich('2026-10-20', '2026-10-26', ['kabel', 'um']);
    pruefe('rcDienstBereich: /api/bereich mit {von, bis, projekte}, Frist 910 s',
      JSON.stringify(k.anfrage.aufrufe[0]) === JSON.stringify(['/api/bereich', { von: '2026-10-20', bis: '2026-10-26', projekte: ['kabel', 'um'] }, 910000]), JSON.stringify(k.anfrage.aufrufe[0]));
    pruefe('...wartet, bis JEDE gemeldete vortage-Nummer eingespeist ist, Bilanz je Projekt',
      b && b.ok === true && k.u.jetzt - 1.7e12 >= 900 && /Kabel/.test(b.text) && /UM/.test(b.text) && /7 Tag/.test(b.text) && !!b.projekte.kabel, JSON.stringify(b));
    const k2 = dienstKern((pfad, d, f, u, W) => {
      u.setTimeout(() => { W.rcDienstGesehen.vortage.kabel = 2; }, 400);
      return { ok: true, projekte: { kabel: { nr: 2, esl: { art: 'excel', grund: '' }, liga: { art: 'ok', tage: 3, grund: '' } },
                                     um: { nr: 5, esl: { art: 'excel', grund: '' }, liga: { art: 'ok', tage: 3, grund: '' } } } };
    });
    const b2 = await k2.F.rcDienstBereich('2026-10-20', '2026-10-22', ['kabel', 'um']);
    pruefe('...UM nicht eingespeist: ok:false, die Bilanz nennt es', b2.ok === false && /UM[^·]*nicht eingespeist/.test(b2.text) && !/Kabel[^·]*nicht eingespeist/.test(b2.text), b2.text);
    const k2b = dienstKern((pfad, d, f, u, W) => {
      u.setTimeout(() => { W.rcDienstGesehen.vortage.um = 5; }, 400);
      return { ok: false, projekte: { um: { nr: 5, esl: { art: 'http', grund: 'HTTP 500' }, liga: { art: 'fehler', tage: 0, grund: 'ORA-01013' } } } };
    });
    const b2b = await k2b.F.rcDienstBereich('2026-10-20', '2026-10-22', ['um']);
    pruefe('...Dienst meldet Fehlschlag je Projekt: ok:false, die Gruende stehen in der Bilanz', b2b.ok === false && /HTTP 500/.test(b2b.text) && /ORA-01013/.test(b2b.text), b2b.text);
    const b3 = await dienstKern({ ok: false, grund: 'Frist abgelaufen', nr: 0 }).F.rcDienstBereich('2026-10-20', '2026-10-22', ['kabel']);
    pruefe('...Frist des Dienstes: ok:false, "Frist abgelaufen" in der Bilanz', b3.ok === false && /Frist abgelaufen/.test(b3.text), JSON.stringify(b3));
  }

  // ==========================================================================
  console.log('\n-- 3. rcProjektLieferung — der aus rcProjektAbruf gezogene Block --');
  // ==========================================================================
  {
    const abruf = Q('async function rcProjektAbruf(key, anlass){'), lief = Q('function rcProjektLieferung(');
    pruefe('rcProjektAbruf liest KEINE Lieferung mehr selbst (Block verschoben, nicht kopiert)', abruf.indexOf('XLSX.read') === -1 && lief.indexOf('XLSX.read') !== -1);
    const iLief = abruf.indexOf('return rcProjektLieferung(key, e);'), iGen = abruf.lastIndexOf("if (gen !== window.rcRahmenGen) return { ok:false, grund:'neu eingespielt' };");
    pruefe('...der Export-Teil gibt an rcProjektLieferung(key, e) weiter, NACH der Generations-Pruefung', iGen > 0 && iLief > iGen, iGen + ' < ' + iLief);
    pruefe('...Lieferzeit an beiden Stellen (excel, leer) und im Erfolg', (lief.match(/zeit: e\.zeit \|\| Date\.now\(\)/g) || []).length === 2 && (lief.match(/rcEslErfolg\(e\.zeit\)/g) || []).length === 2);
    pruefe('...in v22 steht der Lieferungs-Block genau EINMAL', (V22.match(/XLSX\.read\(new Uint8Array\(e\.buf\), \{ type:'array' \}\)/g) || []).length === 1);
  }
  {
    const XLSX = require(path.join(DIR, 'node_modules', 'xlsx'));
    const buf = fs.readFileSync(path.join(DIR, 'Test Excels', 'Export_20260928_212922.xlsx'));
    const QUELL = ['function pad2(', 'function rcRowDayKey(', 'function rcRahmenHeute(', 'function rcProjRahmenListe(', 'function rcProjEintrag(',
      'function rcProjektIds(', 'function rcProjektGleichMit(', 'function rcProjektLieferung(', 'function rcProjektFehlschlag(', 'function rcEslErfolg('].map(Q).join('\n');
    const umgebung = (aktiv) => {
      const W = { rcRahmen: {}, rcProjektDaten: {}, rcAktivProjekt: aktiv || 'mobile', rcEslLastOk: 0, rcEslFehlserie: 0, rcEslFehlgrund: '' };
      const s = { pruefen: spion((k, d) => ({ urteil: 'ok', text: '100 % ' + k })), verarbeite: spion(), sitzung: spion(), fehl: spion(), warn: spion() };
      const F = lade(QUELL, { window: W, XLSX, rcProjektPruefen: s.pruefen, rcVerarbeiteAlle: s.verarbeite, rcSessionLost: s.sitzung,
        rcEslFehlschlag: s.fehl, rcLog: { log() {}, warn: s.warn }, parseDateTime: () => null }, ['rcProjektLieferung']);
      return { W, s, F };
    };
    const u = umgebung('mobile');
    const r = u.F.rcProjektLieferung('mobile', { art: 'excel', buf, zeit: 1234 });
    const daten = u.s.pruefen.aufrufe[0] && u.s.pruefen.aufrufe[0][1];
    pruefe('echter Mobile-Export: rcProjektDaten.mobile.zeit === 1234 (Lieferzeit des Dienstes)', u.W.rcProjektDaten.mobile && u.W.rcProjektDaten.mobile.zeit === 1234, JSON.stringify(u.W.rcProjektDaten.mobile && u.W.rcProjektDaten.mobile.zeit));
    pruefe('...gelesen ueber XLSX, geprueft mit (mobile, Tabelle), uebernommen, rcVerarbeiteAlle gerufen',
      Array.isArray(daten) && daten[0].indexOf('vo_nummer') !== -1 && u.s.pruefen.aufrufe[0][0] === 'mobile' && u.W.rcProjektDaten.mobile.data === daten && u.s.verarbeite.aufrufe.length === 1 && u.s.verarbeite.aufrufe[0][0] === true,
      daten ? daten.length + ' Zeilen' : 'keine Daten');
    pruefe('...Ergebnis ok mit Zeilenzahl, Pruefung und Text', r && r.ok === true && r.zeilen === daten.length - 1 && r.pruefung === 'ok' && r.text === '100 % mobile', JSON.stringify(r));
    pruefe('...aktives Projekt: rcEslLastOk = Lieferzeit (nicht "jetzt")', u.W.rcEslLastOk === 1234, u.W.rcEslLastOk);
    // leer: Vorstand nur von gestern / von heute
    const vorstand = tag => ({ data: [['datum', 'id']].concat([1, 2, 3, 4, 5, 6].map(i => [deTag(tag), 'A' + i])), zeit: 5, pruefung: 'ok' });
    const u2 = umgebung('kabel');
    u2.W.rcProjektDaten.kabel = vorstand(GESTERN_D);
    const r2 = u2.F.rcProjektLieferung('kabel', { art: 'leer', zeit: 2000 });
    pruefe('leer, Vorstand nur von gestern: ok:true, Stand "leer" mit Lieferzeit', r2 && r2.ok === true && u2.W.rcProjektDaten.kabel.pruefung === 'leer' && u2.W.rcProjektDaten.kabel.zeit === 2000 && u2.W.rcEslLastOk === 2000, JSON.stringify(r2));
    const u3 = umgebung('kabel');
    const alt = vorstand(HEUTE_D);
    u3.W.rcProjektDaten.kabel = alt;
    const r3 = u3.F.rcProjektLieferung('kabel', { art: 'leer', zeit: 2000 });
    pruefe('leer, Vorstand von heute: ok:false, Grund "ploetzlich", Stand bleibt', r3 && r3.ok === false && /ploetzlich/.test(r3.grund) && u3.W.rcProjektDaten.kabel === alt, JSON.stringify(r3));
    const u4 = umgebung('mobile');
    const r4 = u4.F.rcProjektLieferung('um', { art: 'fehler', grund: 'ESL-Anmeldung abgeschickt' });
    pruefe('fehler: rcProjektFehlschlag mit GENAU diesem Grund', r4 && r4.ok === false && r4.grund === 'ESL-Anmeldung abgeschickt' && u4.W.rcRahmen.um.grund === 'ESL-Anmeldung abgeschickt' && u4.s.fehl.aufrufe.length === 0, JSON.stringify(r4));
    u4.W.rcAktivProjekt = 'um';
    u4.F.rcProjektLieferung('um', { art: 'fehler', grund: 'ESL-Anmeldung abgeschickt' });
    pruefe('...beim AKTIVEN Projekt zaehlt es als ESL-Fehlschlag (Quellen-Streifen)', u4.s.fehl.aufrufe.length === 1 && u4.s.fehl.aufrufe[0][0] === 'ESL-Anmeldung abgeschickt (UM)', JSON.stringify(u4.s.fehl.aufrufe));
    const r5 = umgebung('kabel').F.rcProjektLieferung('kabel', { art: 'http', status: 500 });
    pruefe('http 500: Grund "HTTP 500"', r5 && r5.ok === false && r5.grund === 'HTTP 500', JSON.stringify(r5));
    const u6 = umgebung('kabel');
    const r6 = u6.F.rcProjektLieferung('kabel', { art: 'anmeldung' });
    pruefe('anmeldung: rcSessionLost gerufen, ok:false "ESL-Sitzung abgemeldet"', r6 && r6.ok === false && r6.grund === 'ESL-Sitzung abgemeldet' && u6.s.sitzung.aufrufe.length === 1, JSON.stringify(r6));
    const u7 = umgebung('kabel');
    u7.F.rcProjektLieferung('kabel', { art: 'leer' });
    pruefe('ohne e.zeit (Portal-Weg): zeit = jetzt', Math.abs(u7.W.rcProjektDaten.kabel.zeit - Date.now()) < 5000);
    const r8 = umgebung('kabel').F.rcProjektLieferung('xyz', { art: 'leer' });
    pruefe('unbekanntes Projekt: ok:false statt Wurf', r8 && r8.ok === false, JSON.stringify(r8));
  }

  // ==========================================================================
  console.log('\n-- 4. Jede Weiche mit Marke (Weiterleitung) und ohne (Gegenprobe) --');
  // ==========================================================================
  const MODUS = Q('function rcDienstModus(');
  { // rcAlleProjekteAn
    const F = (W, pfad) => lade(MODUS + '\n' + Q('function rcAlleProjekteAn('), { window: W, location: { pathname: pfad }, localStorage: { getItem: () => null } }, ['rcAlleProjekteAn']).rcAlleProjekteAn();
    pruefe('rcAlleProjekteAn mit Marke: true (auch ausserhalb /Agents/ und mit Projekt-Kuerzel)', F({ __rcDienst: MARKE }, '/') === true && F({ __rcDienst: MARKE, rcProjektKuerzel: 'mob' }, '/') === true);
    pruefe('...GEGENPROBE ohne Marke: Seite ausserhalb /Agents/ bleibt Einzelprojekt (false), Kabel-Seite true', F({}, '/') === false && F({}, '/Agents/secure/sis_vodafone.xhtml') === true);
  }
  { // rcProjektAbruf
    const QUELL = MODUS + '\n' + ['function pad2(', 'function rcRahmenHeute(', 'function rcProjRahmenListe(', 'function rcProjEintrag(', 'async function rcProjektAbruf(key, anlass){'].map(Q).join('\n');
    const umgebung = (marke) => {
      const W = { rcRahmen: {}, rcRahmenGen: 1, rcSitzungProjekt: '', rcProjektAbrufLaeuft: null, rcHarvestBusy: false };
      if (marke) W.__rcDienst = MARKE;
      const e = { art: 'fehler', grund: 'Testexport' };
      const s = {
        dienstAbruf: spion(async () => ({ ok: true, zeilen: 5 })),
        aufbau: spion(async p => { const st = W.rcRahmen[p.key]; st.bereit = true; st.f = { isConnected: true }; st.tag = isoTag(new Date()); W.rcSitzungProjekt = p.key; }),
        exp: spion(async () => e), lieferung: spion(() => ({ ok: false, grund: 'geliefert' })), fehlschlag: spion(() => ({ ok: false })), sitzung: spion()
      };
      const F = lade(QUELL, { window: W, rcDienstAbruf: s.dienstAbruf, rcRahmenAufbau: s.aufbau, rcRahmenExport: s.exp, rcProjektLieferung: s.lieferung,
        rcProjektFehlschlag: s.fehlschlag, rcSessionLost: s.sitzung, rcProjektKnoepfe() {} }, ['rcProjektAbruf']);
      return { W, s, F, e };
    };
    const m = umgebung(true);
    const rt = await m.F.rcProjektAbruf('kabel', 'takt');
    pruefe('rcProjektAbruf mit Marke, Takt: {ok:true, grund:"Datendienst"}, nichts geholt', rt && rt.ok === true && rt.grund === 'Datendienst' && m.s.dienstAbruf.aufrufe.length === 0 && m.s.aufbau.aufrufe.length === 0, JSON.stringify(rt));
    const rk = await m.F.rcProjektAbruf('um', 'knopf');
    await m.F.rcProjektAbruf('kabel', 'haupt');
    pruefe('...Knopf/Start: rcDienstAbruf(key), dessen Ergebnis kommt zurueck', rk && rk.zeilen === 5 && JSON.stringify(m.s.dienstAbruf.aufrufe) === JSON.stringify([['um'], ['kabel']]), JSON.stringify(m.s.dienstAbruf.aufrufe));
    pruefe('...kein Rahmen, kein Export, keine Sperre', m.s.aufbau.aufrufe.length === 0 && m.s.exp.aufrufe.length === 0 && m.W.rcProjektAbrufLaeuft === null && !Object.keys(m.W.rcRahmen).length);
    pruefe('...unbekanntes Projekt wird weiter vorher abgewiesen', !(await m.F.rcProjektAbruf('xyz', 'knopf')).ok && m.s.dienstAbruf.aufrufe.length === 2);
    const o = umgebung(false);
    const ro = await o.F.rcProjektAbruf('um', 'knopf');
    pruefe('GEGENPROBE ohne Marke: Rahmen aufgebaut, exportiert, Lieferung an rcProjektLieferung(key, e)',
      o.s.aufbau.aufrufe.length === 1 && o.s.exp.aufrufe.length === 1 && o.s.lieferung.aufrufe.length === 1 && o.s.lieferung.aufrufe[0][0] === 'um' && o.s.lieferung.aufrufe[0][1] === o.e && ro.grund === 'geliefert' && o.s.dienstAbruf.aufrufe.length === 0, JSON.stringify(ro));
    pruefe('...die Sperre ist danach wieder frei', o.W.rcProjektAbrufLaeuft === null);
    const g = umgebung(false);
    const G = lade(QUELL, { window: g.W, rcDienstAbruf: g.s.dienstAbruf, rcRahmenAufbau: g.s.aufbau, rcRahmenExport: async () => { g.W.rcRahmenGen++; return g.e; },
      rcProjektLieferung: g.s.lieferung, rcProjektFehlschlag: g.s.fehlschlag, rcSessionLost: g.s.sitzung, rcProjektKnoepfe() {} }, ['rcProjektAbruf']);
    const rg = await G.rcProjektAbruf('kabel', 'knopf');
    pruefe('...Re-Inject waehrend des Exports: "neu eingespielt", die Lieferung wird NICHT uebernommen', rg && rg.grund === 'neu eingespielt' && g.s.lieferung.aufrufe.length === 0, JSON.stringify(rg));
  }
  { // rcLiveTick
    const F = (W) => { const s = { haupt: spion(), abruf: spion() }; const f = lade(MODUS + '\n' + Q('function rcLiveTick('), { window: W, holeExcelVomServer: s.haupt, rcProjektAbruf: s.abruf }, ['rcLiveTick']); f.rcLiveTick(); return s; };
    const m = F({ __rcDienst: MARKE, rcAlleProjekteModus: true, rcAktivProjekt: 'kabel' });
    pruefe('rcLiveTick mit Marke: sofort zurueck (kein Export, kein Projekt-Abruf)', m.haupt.aufrufe.length === 0 && m.abruf.aufrufe.length === 0);
    const o1 = F({ rcAlleProjekteModus: false }), o2 = F({ rcAlleProjekteModus: true, rcAktivProjekt: 'um' });
    pruefe('...GEGENPROBE ohne Marke: Einzelprojekt holeExcelVomServer, Alle-Projekte rcProjektAbruf(aktiv, takt)',
      o1.haupt.aufrufe.length === 1 && JSON.stringify(o2.abruf.aufrufe) === JSON.stringify([['um', 'takt']]));
  }
  { // rcSessionLost
    const umgebung = (marke) => {
      const W = { rcSessionState: { alive: true }, rcLiveInterval: 99, rcSessionRetryInterval: null };
      if (marke) W.__rcDienst = MARKE;
      const s = { warn: spion(), error: spion(), showWarn: spion(), banner: spion(), clearInterval: spion(), setInterval: spion(() => 7), haupt: spion() };
      const F = lade(MODUS + '\n' + Q('function rcSessionLost('), { window: W, rcLog: { warn: s.warn, error: s.error, log() {} }, showWarn: s.showWarn, rcSessionBanner: s.banner,
        rcNowStamp: () => '12:00:00', clearInterval: s.clearInterval, setInterval: s.setInterval, holeExcelVomServer: s.haupt }, ['rcSessionLost']);
      return { W, s, F };
    };
    const m = umgebung(true);
    m.F.rcSessionLost('Export im Arbeitsrahmen lieferte die Anmeldeseite (Kabel)');
    pruefe('rcSessionLost mit Marke: rcLog.warn mit dem Grund', m.s.warn.aufrufe.length === 1 && /Anmeldeseite \(Kabel\)/.test(m.s.warn.aufrufe[0].join(' ')), JSON.stringify(m.s.warn.aufrufe));
    pruefe('...kein clearInterval, kein Banner, kein Retry, Takt und Sitzung bleiben stehen',
      m.s.clearInterval.aufrufe.length === 0 && m.s.banner.aufrufe.length === 0 && m.s.showWarn.aufrufe.length === 0 && m.s.setInterval.aufrufe.length === 0 &&
      m.W.rcLiveInterval === 99 && m.W.rcSessionState.alive === true && m.s.error.aufrufe.length === 0);
    m.F.rcSessionLost('noch einmal');
    pruefe('...ein Dauerzustand fuellt das Logbuch nicht (hoechstens alle 5 Min)', m.s.warn.aufrufe.length === 1);
    const o = umgebung(false);
    o.F.rcSessionLost('viewExpiredDialog sichtbar');
    pruefe('...GEGENPROBE ohne Marke: Sitzung tot, Banner, Takt angehalten, Retry alle 60 s',
      o.W.rcSessionState.alive === false && o.s.banner.aufrufe.length === 1 && o.s.clearInterval.aufrufe.length === 1 && o.W.rcLiveInterval === null &&
      o.s.setInterval.aufrufe.length === 1 && o.s.setInterval.aufrufe[0][1] === 60000);
  }
  { // rcKeepAliveTick
    const F = (W) => { const s = { leer: spion(() => true), qsa: spion(() => []) }; lade(MODUS + '\n' + Q('function rcKeepAliveTick('), { window: W, rcLeerlaufZurueck: s.leer, document: { querySelectorAll: s.qsa }, rcNowStamp: () => '12:00:00' }, ['rcKeepAliveTick']).rcKeepAliveTick(); return s; };
    const m = F({ __rcDienst: MARKE, rcSessionState: { alive: true } });
    pruefe('rcKeepAliveTick mit Marke: kein Leerlauf-Reset (kein Portal in der Seite)', m.leer.aufrufe.length === 0 && m.qsa.aufrufe.length === 0);
    const W = { rcSessionState: { alive: true } }, o = F(W);
    pruefe('...GEGENPROBE ohne Marke: rcLeerlaufZurueck(window) und die Rahmen', o.leer.aufrufe.length === 1 && o.leer.aufrufe[0][0] === W && o.qsa.aufrufe.length === 1);
  }
  { // rcSessionWatchTick
    const F = (W) => { const s = { dlg: spion(() => true), lost: spion(), PF: spion(() => ({ hide() {} })) }; lade(MODUS + '\n' + Q('function rcSessionWatchTick('), { window: W, rcDlgVisible: s.dlg, rcSessionLost: s.lost, PF: s.PF, rcLog: { warn() {} }, rcNowStamp: () => '12:00:00' }, ['rcSessionWatchTick']).rcSessionWatchTick(); return s; };
    const m = F({ __rcDienst: MARKE });
    pruefe('rcSessionWatchTick mit Marke: keine Dialog-Suche, kein Wegklicken, kein Sitzungstod', m.dlg.aufrufe.length === 0 && m.lost.aufrufe.length === 0 && m.PF.aufrufe.length === 0);
    const o = F({});
    pruefe('...GEGENPROBE ohne Marke: Dialog weggeklickt, viewExpiredDialog -> rcSessionLost', o.PF.aufrufe.length === 1 && o.lost.aufrufe.length === 1);
  }
  { // rcWdTick
    const F = (W) => {
      const tun = spion(() => true);
      const RC_WD = { liga: { seit: null, stufe: 0, letzteAktion: 0 }, esl: { seit: null, stufe: 0, letzteAktion: 0 }, alarm: null };
      const STUFEN = { liga: [{ min: 5, name: 'Liga-Fenster neu', tun }], esl: [{ min: 5, name: 'Seite neu laden', tun }] };
      lade(MODUS + '\n' + Q('function rcWdTick('), { window: W, RC_WD, RC_WD_STUFEN: STUFEN, rcWdStilleMin: () => 100, RC_WD_ABSTAND_MS: 0,
        rcWdAlarm: spion(), rcWdAlarmAnzeigen: spion(), rcLog: { warn() {} } }, ['rcWdTick']).rcWdTick();
      return { tun, RC_WD };
    };
    const m = F({ __rcDienst: MARKE, rcLogEreignis() {} });
    pruefe('rcWdTick mit Marke: keine Stufe (kein Fenster, kein Neuladen)', m.tun.aufrufe.length === 0 && m.RC_WD.liga.stufe === 0 && m.RC_WD.esl.stufe === 0);
    const o = F({ rcLogEreignis() {} });
    pruefe('...GEGENPROBE ohne Marke: 100 Min still -> beide Leitern feuern ihre Stufe', o.tun.aufrufe.length === 2 && o.RC_WD.liga.stufe === 1 && o.RC_WD.esl.stufe === 1);
  }
  { // rcHarvestEslHistory / rcFetchRangeViaUI / rcFetchRangeBuffer
    const lauf = async (kopf, name, W, args) => {
      const s = { get: spion(() => null), abruf: spion(async () => ({ ok: false, grund: 'x' })), fetch: spion() };
      const f = lade(MODUS + '\n' + Q(kopf), { window: W, document: { getElementById: s.get }, rcProjektAbruf: s.abruf, fetch: s.fetch, rcLog: { warn() {}, log() {} } }, [name]);
      s.erg = await f[name](...(args || []));
      return s;
    };
    for (const [kopf, name, args] of [['async function rcHarvestEslHistory(', 'rcHarvestEslHistory'], ['async function rcFetchRangeViaUI(', 'rcFetchRangeViaUI', ['01.10.2026', '26.10.2026']], ['async function rcFetchRangeBuffer(', 'rcFetchRangeBuffer', ['01.10.2026', '26.10.2026']]]) {
      const m = await lauf(kopf, name, { __rcDienst: MARKE, XLSX: {}, rcAlleProjekteModus: true }, args);
      const o = await lauf(kopf, name, { XLSX: {}, rcAlleProjekteModus: true }, args);
      pruefe(name + ' mit Marke: ' + (name === 'rcHarvestEslHistory' ? 'sofort zurueck' : 'null') + ', das Portal-Formular wird nicht einmal gesucht',
        m.get.aufrufe.length === 0 && m.fetch.aufrufe.length === 0 && m.abruf.aufrufe.length === 0 && (name === 'rcHarvestEslHistory' ? m.erg === undefined : m.erg === null));
      pruefe('...GEGENPROBE ohne Marke: sucht das filterForm des Portals', o.get.aufrufe.some(a => a[0] === 'filterForm'));
    }
  }
  { // rcAutoKpiQuelle
    const F = (W) => { const s = { st: spion() }; lade(MODUS + '\n' + Q('function rcAutoKpiQuelle('), { window: W, setTimeout: s.st, rcLog: { log() {} } }, ['rcAutoKpiQuelle']).rcAutoKpiQuelle(); return s; };
    const m = F({ __rcDienst: MARKE, rcOpenKpiQuelle: spion() });
    pruefe('rcAutoKpiQuelle mit Marke: es wird nichts geplant', m.st.aufrufe.length === 0);
    const W = { rcAutoKpiOff: false, rcKpiData: {}, rcKpiWin: null, rcOpenKpiQuelle: spion() }, o = F(W);
    if (o.st.aufrufe[0]) o.st.aufrufe[0][0]();
    pruefe('...GEGENPROBE ohne Marke: nach 12 s oeffnet es die Ligaliste selbst', o.st.aufrufe.length === 1 && o.st.aufrufe[0][1] === 12000 && W.rcOpenKpiQuelle.aufrufe.length === 1);
  }
  { // rcDriftNachholen
    const F = (W) => { const s = { jetzt: spion(async () => ({ sekunden: 1, esl: { ok: true }, liga: { ok: true } })) };
      lade(MODUS + '\n' + Q('function rcDriftNachholen('), { window: W, RC_DRIFT_ABSTAND_MS: 60000, RC_DRIFT_VERSUCHE: 3, rcJetztAktualisieren: s.jetzt, rcLog: { log() {}, warn() {} }, rcQuellenWatchTick() {} }, ['rcDriftNachholen']).rcDriftNachholen(1e6);
      return s; };
    const neuW = () => ({ rcDriftOffen: { grund: 'Luecke 120 s', versuche: 0, letzterVersuch: 0 }, rcDriftLage: { nachgeholt: 0 }, rcSessionState: { alive: true } });
    const Wm = Object.assign(neuW(), { __rcDienst: MARKE }), m = F(Wm);
    pruefe('rcDriftNachholen mit Marke: kein Nachholen, der Wunsch wird verworfen', m.jetzt.aufrufe.length === 0 && Wm.rcDriftOffen === null && !Wm.rcDriftLaeuft);
    const Wo = neuW(), o = F(Wo);
    pruefe('...GEGENPROBE ohne Marke: holt EINMAL ueber rcJetztAktualisieren nach', o.jetzt.aufrufe.length === 1 && Wo.rcDriftLaeuft === true);
  }
  { // rcOpenKpiQuelle / rcOpenQueueQuelle
    const lauf = (kopf, name, W, extra) => {
      const s = { toast: spion(), open: spion(() => null), retry: spion() };
      W.rcToast = s.toast; W.open = s.open;
      lade(MODUS + '\n' + Q(kopf) + ';', Object.assign({ window: W, rcKey: k => k, rcLog: { log() {}, warn() {} }, rcKpiRetryBeiGeste: s.retry, queueRetryBeiGeste: s.retry, CFG: { quelle: 'https://ccs.example/gm2.rb' } }, extra || {}), []);
      s.erg = W[name]();
      return s;
    };
    for (const [kopf, name, text] of [['window.rcOpenKpiQuelle = function(){', 'rcOpenKpiQuelle', 'Die Ligaliste holt der Datendienst.'], ['window.rcOpenQueueQuelle = function(){', 'rcOpenQueueQuelle', 'Warteschleife im Dienst-Betrieb aus.']]) {
      const m = lauf(kopf, name, { __rcDienst: MARKE, RC_LIGA_URL: 'https://ccs.example/liga' });
      pruefe(name + ' mit Marke: false, kein Fenster, Toast "' + text + '"', m.erg === false && m.open.aufrufe.length === 0 && m.toast.aufrufe.length === 1 && m.toast.aufrufe[0][0] === text, JSON.stringify(m.toast.aufrufe));
      const o = lauf(kopf, name, { RC_LIGA_URL: 'https://ccs.example/liga' });
      pruefe('...GEGENPROBE ohne Marke: window.open wird versucht, kein Dienst-Toast', o.open.aufrufe.length >= 1 && o.toast.aufrufe.length === 0);
    }
  }
  { // rcJetztAktualisieren
    const QUELL = MODUS + '\n' + Q('function rcProjRahmenListe(') + '\n' + Q('function rcProjEintrag(') + '\n' + Q('async function rcJetztAktualisieren(melden){');
    const umgebung = (W) => {
      const s = { runde: spion(async () => ({ liga: { ok: true, agenten: 154 }, esl: { ok: true } })), haupt: spion(async () => ({ ok: true })),
        kanal: spion(), fenster: spion(), sag: spion() };
      W = Object.assign({ rcJetztBusy: false, rcHarvestBusy: false, rcRangeBusy: false, rcAlleProjekteModus: true, rcAktivProjekt: 'kabel' }, W);
      W.rcKpiWin = { closed: false, postMessage: (...a) => { s.fenster(...a); setImmediate(() => W.rcLiveNowDone && W.rcLiveNowDone({ ok: true, agenten: 3 })); } };
      const F = lade(QUELL, { window: W, document: { getElementById: () => null }, rcKpiChannel: { postMessage: s.kanal }, holeExcelVomServer: s.haupt, rcDienstRunde: s.runde,
        LIVE_NOW_TIMEOUT: 2000, JETZT_ESL_FRIST: 3000, rcLog: { log() {} } }, ['rcJetztAktualisieren']);
      return { W, s, F };
    };
    const m = umgebung({ __rcDienst: MARKE });
    const r = await m.F.rcJetztAktualisieren(m.s.sag);
    pruefe('rcJetztAktualisieren mit Marke: rcDienstRunde gerufen, holeExcelVomServer NICHT, kein Kommando an die Ligaliste',
      m.s.runde.aufrufe.length === 1 && m.s.haupt.aufrufe.length === 0 && m.s.kanal.aufrufe.length === 0 && m.s.fenster.aufrufe.length === 0);
    pruefe('...Rueckgabe {liga, esl, sekunden}, Text wie bisher, Sperre wieder frei',
      r && r.liga && r.liga.agenten === 154 && r.esl && r.esl.ok === true && typeof r.sekunden === 'number' && m.W.rcJetztBusy === false &&
      /Ligaliste: 154 Agenten/.test((m.s.sag.aufrufe[0] || [''])[0]) && /neu geladen/.test((m.s.sag.aufrufe[0] || [''])[0]), (m.s.sag.aufrufe[0] || [''])[0]);
    const b = umgebung({ __rcDienst: MARKE, rcHarvestBusy: true });
    const rb = await b.F.rcJetztAktualisieren(b.s.sag);
    pruefe('...die Busy-Pruefungen stehen VOR der Weiterleitung (Harvest belegt -> null, keine Runde)', rb === null && b.s.runde.aufrufe.length === 0);
    const o = umgebung({});
    const ro = await o.F.rcJetztAktualisieren(o.s.sag);
    pruefe('...GEGENPROBE ohne Marke: RC_LIVE_NOW an Fenster und Kanal, holeExcelVomServer, keine Dienst-Runde',
      o.s.fenster.aufrufe.length === 1 && o.s.fenster.aufrufe[0][0].type === 'RC_LIVE_NOW' && o.s.kanal.aufrufe.length === 1 && o.s.haupt.aufrufe.length === 1 &&
      o.s.runde.aufrufe.length === 0 && ro && ro.liga.agenten === 3 && ro.esl.ok === true, JSON.stringify(ro));
  }
  { // rcProjektWechseln (Ruling R6): der Wechsel erreicht den Dienst auch, wenn "Jetzt" abgewiesen wird
    const QUELL = REGEL + '\n' + MODUS + '\nconst LIVE_NOW_TIMEOUT = 2000, JETZT_ESL_FRIST = 3000;\n' + Q('async function rcJetztAktualisieren(melden){') + '\n' +
      Q('window.rcProjektWechseln = function(key, anlass){') + ';\nwindow.rcJetztAktualisieren = rcJetztAktualisieren;';
    const umgebung = (W, anfrageImpl) => {
      const reihe = [];
      const s = { reihe, anfrage: spion(async (...a) => { reihe.push('projekt:' + a[1].projekt); return anfrageImpl ? anfrageImpl(...a) : { ok: true }; }),
        runde: spion(() => { reihe.push('runde'); return new Promise(() => {}); }),   // haengt: "Jetzt" bleibt belegt
        haupt: spion(async () => ({ ok: true })), warn: spion() };
      W = Object.assign({ rcAlleProjekteModus: true, rcAktivProjekt: 'kabel', rcJetztBusy: false, rcHarvestBusy: false, rcRangeBusy: false, rcLogEreignis() {} }, W);
      lade(QUELL, { window: W, document: { getElementById: () => null }, localStorage: { setItem() {} }, rcProjektKnoepfe() {}, rcDienstAnfrage: s.anfrage,
        rcDienstRunde: s.runde, holeExcelVomServer: s.haupt, rcKpiChannel: { postMessage() {} }, rcLog: { log() {}, warn: s.warn } }, []);
      return { W, s };
    };
    const projektAufrufe = s => s.anfrage.aufrufe.filter(a => a[0] === '/api/projekt');
    const b = umgebung({ __rcDienst: MARKE, rcJetztBusy: true });
    const okB = b.W.rcProjektWechseln('mobile', 'Kopfleiste');
    await naechsterTakt();
    pruefe('rcProjektWechseln mit Marke, "Jetzt" belegt (rcJetztBusy): /api/projekt {projekt:mobile} geht trotzdem raus (Frist 10 s)',
      okB === true && b.W.rcAktivProjekt === 'mobile' && JSON.stringify(projektAufrufe(b.s)) === JSON.stringify([['/api/projekt', { projekt: 'mobile' }, 10000]]) && b.s.runde.aufrufe.length === 0,
      JSON.stringify(b.s.anfrage.aufrufe));
    const g = umgebung({ __rcDienst: MARKE, rcRangeBusy: true });
    g.W.rcProjektWechseln('um', 'Stack-Filter');
    await naechsterTakt();
    pruefe('...Zeitraum laeuft (rcRangeBusy): /api/projekt {projekt:um}, keine Runde', JSON.stringify(projektAufrufe(g.s)) === JSON.stringify([['/api/projekt', { projekt: 'um' }, 10000]]) && g.s.runde.aufrufe.length === 0,
      JSON.stringify(g.s.anfrage.aufrufe));
    const q = umgebung({ __rcDienst: MARKE });
    q.W.rcProjektWechseln('mobile'); q.W.rcProjektWechseln('um');   // Kabel -> Mobile -> UM schnell; die erste Runde haengt noch
    await naechsterTakt();
    const letzte = projektAufrufe(q.s).pop();
    pruefe('...Kabel -> Mobile -> UM schnell: der Dienst steht am Ende auf UM (das zweite "Jetzt" wird abgewiesen, der Wechsel nicht)',
      q.W.rcAktivProjekt === 'um' && !!letzte && letzte[1].projekt === 'um' && q.s.runde.aufrufe.length === 1, q.s.reihe.join(' > '));
    pruefe('...der Wechsel geht VOR dem "Jetzt" raus', q.s.reihe.slice(0, 2).join(' > ') === 'projekt:mobile > runde', q.s.reihe.join(' > '));
    const f = umgebung({ __rcDienst: MARKE }, async () => ({ ok: false, grund: 'HTTP 403' }));
    let wurf = false;
    try { f.W.rcProjektWechseln('mobile'); } catch (e) { wurf = true; }
    for (let i = 0; i < 3; i++) await naechsterTakt();
    pruefe('...scheitert die Meldung: kein Wurf, Warnung im Logbuch', !wurf && f.s.warn.aufrufe.some(a => /Projektwechsel/.test(a[0]) && /403/.test(a[0])), JSON.stringify(f.s.warn.aufrufe));
    const o = umgebung({ rcJetztBusy: true });
    o.W.rcProjektWechseln('mobile');
    await naechsterTakt();
    pruefe('...GEGENPROBE ohne Marke: kein /api/projekt (Wechsel wie bisher)', o.s.anfrage.aufrufe.length === 0 && o.W.rcAktivProjekt === 'mobile');
  }

  // ==========================================================================
  console.log('\n-- 5. Closures in Dialogen: rcRangeLoad und frischDann (als Block geschnitten) --');
  // ==========================================================================
  { // rcRangeLoad
    const blk = Q('async function rcRangeLoad(){');
    const iModus = blk.indexOf('rcDienstModus()'), iBer = blk.indexOf("rcDienstBereich(from, to, ['kabel','mobile','um'])");
    pruefe('rcRangeLoad (Block): rcDienstBereich unter rcDienstModus() VOR dem alten Weg (RC_HARVEST_RANGE, rcFetchRangeViaUI)',
      iModus > 0 && iBer > iModus && iBer < blk.indexOf('RC_HARVEST_RANGE') && iBer < blk.indexOf('rcFetchRangeViaUI(') && iModus > blk.indexOf('window.rcRangeBusy = true;'), iModus + ' / ' + iBer);
    const umgebung = (W) => {
      const el = { rcRgFrom: { value: '2026-10-20' }, rcRgTo: { value: '2026-10-26' }, rcRgLoad: { disabled: false } };
      const s = { status: spion(), tabelle: spion(), bereich: spion(async () => ({ ok: true, projekte: {}, text: 'Kabel: ESL geholt, Ligaliste 7 Tag(e)' })), viaUI: spion(async () => null), kanal: spion() };
      W = Object.assign({ rcRangeBusy: false, rcHarvestBusy: false, rcKpiWin: null }, W);
      const F = lade(MODUS + '\n' + blk, { window: W, document: { getElementById: id => el[id] || null }, setStatus: s.status, renderRangeTable: s.tabelle,
        rcDienstBereich: s.bereich, rcFetchRangeViaUI: s.viaUI, rcKpiChannel: { postMessage: s.kanal }, RANGE_LIGA_TIMEOUT: 1000, rcAggregateMultiDayBuffer: () => ({}),
        rcTodayKey: () => HEUTE, rcKey: k => k, localStorage: { getItem: () => null, setItem() {} } }, ['rcRangeLoad']);
      return { W, s, F, el };
    };
    const m = umgebung({ __rcDienst: MARKE });
    await m.F.rcRangeLoad();
    const letzte = (m.s.status.aufrufe[m.s.status.aufrufe.length - 1] || [''])[0];
    pruefe('...funktional mit Marke: rcDienstBereich(von, bis, alle drei), kein Kommando an die Ligaliste, kein Bereichs-Export',
      JSON.stringify(m.s.bereich.aufrufe) === JSON.stringify([['2026-10-20', '2026-10-26', ['kabel', 'mobile', 'um']]]) && m.s.kanal.aufrufe.length === 0 && m.s.viaUI.aufrufe.length === 0, JSON.stringify(m.s.bereich.aufrufe));
    pruefe('...Bilanz in dieselbe Statuszeile, Sperre frei, Knopf frei, Tabelle neu gezeichnet',
      /^Fertig nach \d+ s — Kabel: ESL geholt/.test(letzte) && m.W.rcRangeBusy === false && m.el.rcRgLoad.disabled === false && m.s.tabelle.aufrufe.length === 1, letzte);
    const o = umgebung({});
    await o.F.rcRangeLoad();
    pruefe('...GEGENPROBE ohne Marke: RC_HARVEST_RANGE an die Ligaliste, kein Dienst-Auftrag',
      o.s.kanal.aufrufe.length === 1 && o.s.kanal.aufrufe[0][0].type === 'RC_HARVEST_RANGE' && o.s.bereich.aufrufe.length === 0);
  }
  { // frischDann
    const blk = Q('const frischDann = async (b, bauen) => {');
    const iModus = blk.indexOf('rcDienstModus()'), iBer = blk.indexOf('rcDienstBereich('), iFrisch = blk.indexOf('rcFrischHolen(');
    pruefe('frischDann (Block): rcDienstBereich unter rcDienstModus() VOR dem Auffrischen von heute', iModus > 0 && iBer > iModus && iBer < iFrisch, iModus + ' / ' + iBer + ' / ' + iFrisch);
    const lauf = async (W, b, bereichImpl) => {
      const reihe = [];
      const s = { reihe, sagen: spion(), frisch: spion(async () => { reihe.push('frisch'); return { ok: true, fehler: [] }; }),
        bereich: spion(async (...a) => { reihe.push('bereich'); return (bereichImpl || (async () => ({ ok: true, projekte: {}, text: 'ok' })))(...a); }),
        bauen: spion(sag => { reihe.push('bauen'); sag('Fertig'); }) };
      const QUELL = REGEL + '\n' + MODUS + '\n' + Q('function rcProjekteFuerScope(') + '\n' + blk + ';';
      const F = lade(QUELL, { window: Object.assign({ rcAktivProjekt: 'kabel' }, W), document: { getElementById: () => null }, heute: HEUTE, gestern: GESTERN, sagen: s.sagen,
        scopeAus: () => ({ std: 'ALL', stack: 'VUM_Care', team: 'ALL' }), rcFrischHolen: s.frisch, rcDienstBereich: s.bereich, projListe() {} }, ['frischDann']);
      await F.frischDann(b, s.bauen);
      return s;
    };
    const m = await lauf({ __rcDienst: MARKE }, { von: '2026-10-01', bis: HEUTE });
    pruefe('...funktional mit Marke, Bereich bis heute: Vortage beim Dienst (bis gestern, Projekt des Zuschnitts), danach das Auffrischen von heute, dann der Bau',
      JSON.stringify(m.bereich.aufrufe) === JSON.stringify([['2026-10-01', GESTERN, ['um']]]) && m.reihe.join(' > ') === 'bereich > frisch > bauen', JSON.stringify(m.bereich.aufrufe) + ' / ' + m.reihe.join(' > '));
    const m2 = await lauf({ __rcDienst: MARKE }, { von: '2026-10-01', bis: '2026-10-03' });
    pruefe('...nur Vortage: bis bleibt bis, kein Auffrischen von heute', JSON.stringify(m2.bereich.aufrufe) === JSON.stringify([['2026-10-01', '2026-10-03', ['um']]]) && m2.frisch.aufrufe.length === 0 && m2.bauen.aufrufe.length === 1);
    const m3 = await lauf({ __rcDienst: MARKE }, { von: '2026-10-01', bis: '2026-10-03' }, async () => ({ ok: false, projekte: {}, text: 'UM: ESL HTTP 500' }));
    const meld3 = m3.sagen.aufrufe.map(a => a[0]).join(' | ');
    pruefe('...Fehlschlag: FRIST, keine Sperre — gebaut wird trotzdem, der Grund steht hinter dem "Fertig"', m3.bauen.aufrufe.length === 1 && /Fertig — ACHTUNG: .*UM: ESL HTTP 500/.test(meld3), meld3);
    const m4 = await lauf({ __rcDienst: MARKE }, { von: '2026-10-01', bis: '2026-10-03' }, async () => { throw new Error('weg'); });
    pruefe('...ein Wurf im Dienst-Auftrag reisst den Bau nicht mit', m4.bauen.aufrufe.length === 1 && /ACHTUNG: .*weg/.test(m4.sagen.aufrufe.map(a => a[0]).join(' | ')));
    const m5 = await lauf({ __rcDienst: MARKE }, { von: HEUTE, bis: HEUTE });
    pruefe('...nur heute: kein Dienst-Bereich, nur das Auffrischen', m5.bereich.aufrufe.length === 0 && m5.frisch.aufrufe.length === 1);
    const o = await lauf({}, { von: '2026-10-01', bis: HEUTE });
    pruefe('...GEGENPROBE ohne Marke: kein Dienst-Bereich, Auffrischen und Bau wie bisher', o.bereich.aufrufe.length === 0 && o.frisch.aufrufe.length === 1 && o.bauen.aufrufe.length === 1);
  }

  // ==========================================================================
  console.log('\n-- 6. Ohne eigene Weiche: alles landet ueber die weitergeleiteten Funktionen beim Dienst --');
  // ==========================================================================
  {
    const QUELL = 'let rcTagFixZuletzt = 0; let rcTagKeyZuletzt = null;\nconst LIVE_NOW_TIMEOUT = 2000, JETZT_ESL_FRIST = 3000, RC_FRISCH_MAX_MS = 45000;\n' + REGEL + '\n' +
      ['function rcDienstModus(', 'function rcAlleProjekteAn(', 'function pad2(', 'function rcRahmenHeute(', 'async function rcProjektAbruf(key, anlass){',
        'async function holeExcelVomServer(', 'async function rcPortalAufHeute(', 'function rcMitternachtPruefen(', 'function rcExportAnsichtSicherstellen(',
        'function rcLiveTick(', 'async function rcJetztAktualisieren(melden){', 'function rcProjekteFuerScope(', 'async function rcFrischLaufen(',
        'async function rcFrischHolen('].map(Q).join('\n') + '\n' +
      ['window.rcProjektAktualisieren = function(key){', 'window.rcProjekteAlleAktualisieren = async function(melden){', 'window.rcProjektWechseln = function(key, anlass){']
        .map(k => Q(k) + ';').join('\n') + '\nwindow.rcJetztAktualisieren = rcJetztAktualisieren;';
    const klick = spion();
    const formular = { querySelectorAll: spion(() => []), querySelector: spion(() => null) };
    const s = { fetch: spion(), open: spion(), reload: spion(), aufbau: spion(), exp: spion(), fenster: spion(), kanal: spion(), klick,
      dienstAbruf: spion(async k => ({ ok: true, zeilen: 1, text: k })), runde: spion(async () => ({ liga: { ok: true, agenten: 3 }, esl: { ok: true } })),
      ereignis: spion(), getById: spion(id => id === 'filterForm' ? formular : null), anfrage: spion(async () => ({ ok: true })) };
    const W = { __rcDienst: MARKE, rcProjektKuerzel: '', rcRahmen: {}, rcRahmenGen: 1, rcProjektDaten: {}, rcAktivProjekt: 'kabel', rcHarvestBusy: false,
      rcRangeBusy: false, rcJetztBusy: false, rcSitzungProjekt: '', rcProjektAbrufLaeuft: null, open: s.open, rcLogEreignis: s.ereignis,
      rcKpiWin: { closed: false, postMessage: s.fenster } };
    const env = { window: W, document: { getElementById: s.getById, querySelectorAll: spion(() => []) }, location: { pathname: '/', reload: s.reload },
      localStorage: { getItem: () => null, setItem() {} }, fetch: s.fetch, rcRahmenAufbau: s.aufbau, rcRahmenExport: s.exp, rcDienstAbruf: s.dienstAbruf,
      rcDienstRunde: s.runde, rcDienstAnfrage: s.anfrage, rcKpiChannel: { postMessage: s.kanal }, rcLog: { log() {}, warn() {}, error() {} }, rcProjektKnoepfe() {}, rcSessionLost: spion(),
      rcProjektFehlschlag: spion(), rcProjektLieferung: spion(), rcPasswortSichtbar: () => false, rcFilterKnopf: () => ({ click: klick }),
      showWarn: spion(), rcEslFehlschlag: spion() };
    const F = lade(QUELL, env, ['rcAlleProjekteAn', 'holeExcelVomServer', 'rcPortalAufHeute', 'rcMitternachtPruefen', 'rcExportAnsichtSicherstellen', 'rcLiveTick', 'rcFrischHolen']);
    W.rcAlleProjekteModus = F.rcAlleProjekteAn();
    pruefe('Kette: mit Marke steht der Alle-Projekte-Betrieb (auch ausserhalb /Agents/)', W.rcAlleProjekteModus === true);
    await F.holeExcelVomServer();
    pruefe('holeExcelVomServer -> rcProjektAbruf(aktiv, haupt) -> rcDienstAbruf(kabel)', JSON.stringify(s.dienstAbruf.aufrufe) === JSON.stringify([['kabel']]), JSON.stringify(s.dienstAbruf.aufrufe));
    F.rcLiveTick();
    const vorPortal = s.getById.aufrufe.length;
    const tag = await F.rcPortalAufHeute(true);
    F.rcMitternachtPruefen(new Date(2026, 9, 26, 23, 59)); F.rcMitternachtPruefen(new Date(2026, 9, 27, 0, 0));
    await naechsterTakt();
    pruefe('rcPortalAufHeute / rcMitternachtPruefen: false, das Portal-Formular wird nicht angefasst', tag === false && s.getById.aufrufe.length === vorPortal && s.ereignis.aufrufe.length === 1);
    const ans = F.rcExportAnsichtSicherstellen();
    pruefe('rcExportAnsichtSicherstellen: false, kein Klick (Alle-Projekte-Zweig)', ans === false && klick.aufrufe.length === 0);
    s.dienstAbruf.aufrufe.length = 0;
    await W.rcProjektAktualisieren('um');
    pruefe('rcProjektAktualisieren(um) -> rcDienstAbruf(um)', JSON.stringify(s.dienstAbruf.aufrufe) === JSON.stringify([['um']]));
    s.dienstAbruf.aufrufe.length = 0;
    await W.rcProjekteAlleAktualisieren();
    pruefe('rcProjekteAlleAktualisieren -> rcDienstAbruf je Projekt, das aktive zuletzt', JSON.stringify(s.dienstAbruf.aufrufe) === JSON.stringify([['mobile'], ['um'], ['kabel']]), JSON.stringify(s.dienstAbruf.aufrufe));
    s.dienstAbruf.aufrufe.length = 0;
    const fr = await F.rcFrischHolen({ std: 'ALL', stack: 'ALL', team: 'ALL' });
    pruefe('rcFrischHolen -> die nicht aktiven ueber rcDienstAbruf, das aktive + Ligaliste ueber EINE Dienst-Runde',
      JSON.stringify(s.dienstAbruf.aufrufe) === JSON.stringify([['mobile'], ['um']]) && s.runde.aufrufe.length === 1 && fr && fr.liga && fr.liga.agenten === 3, JSON.stringify(s.dienstAbruf.aufrufe) + ' / ' + s.runde.aufrufe.length);
    W.rcJetztBusy = false;
    const ok2 = W.rcProjektWechseln('mobile', 'Test');
    for (let i = 0; i < 5; i++) await naechsterTakt();
    pruefe('rcProjektWechseln(mobile) -> aktiv umgestellt, /api/projekt gemeldet, "Jetzt" -> Dienst-Runde',
      ok2 === true && W.rcAktivProjekt === 'mobile' && s.runde.aufrufe.length === 2 && JSON.stringify(s.anfrage.aufrufe) === JSON.stringify([['/api/projekt', { projekt: 'mobile' }, 10000]]), JSON.stringify(s.anfrage.aufrufe));
    pruefe('in der ganzen Kette: kein fetch, kein Fenster, kein Neuladen, kein Rahmen, kein Export, kein Kommando an die Ligaliste',
      s.fetch.aufrufe.length === 0 && s.open.aufrufe.length === 0 && s.reload.aufrufe.length === 0 && s.aufbau.aufrufe.length === 0 && s.exp.aufrufe.length === 0 &&
      s.fenster.aufrufe.length === 0 && s.kanal.aufrufe.length === 0,
      [s.fetch, s.open, s.reload, s.aufbau, s.exp, s.fenster, s.kanal].map(x => x.aufrufe.length).join(','));
  }

  console.log('');
  console.log(rot ? rot + ' fehlgeschlagen, ' + ok + ' bestanden' : 'ALLE ' + ok + ' PRUEFUNGEN BESTANDEN');
  fertig = true;
})().catch(e => { fertig = true; throw e; }).catch(e => { console.log('ABBRUCH: ' + (e && e.stack || e)); console.log((rot + 1) + ' fehlgeschlagen (Abbruch), ' + ok + ' bestanden'); process.exitCode = 1; });
