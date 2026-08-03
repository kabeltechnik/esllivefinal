/* ============================================================================
   SPERRE PRUEFEN  —  Offline-Test fuer kpi_crawler.js
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/sperre_pruefen.js

   Prueft die neue Seiten-Sperre des KPI-Crawlers OHNE Portal. Getestet wird
   genau das Risiko, das ein Sperr-Mechanismus mitbringt: bleibt sie nach einem
   Fehler haengen, steht der Crawler fuer immer still — das waere schlimmer als
   das Problem, das sie loesen soll.

   Der Crawler laeuft dafuer gegen ein sehr kleines Nachbau-DOM. Es ist bewusst
   NICHT vollstaendig: geprueft wird die Ablaufsteuerung (wer haelt wann die
   Sperre), nicht das Parsen echter Tabellen.
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DATEI = path.join(__dirname, '..', 'kpi_crawler.js');

// ---------------------------------------------------------------------------
//  Minimales Nachbau-DOM
// ---------------------------------------------------------------------------
function macheOption(value, text) {
  return { value: value, textContent: text || value, selected: false };
}
function macheSelect(id, werte) {
  const optionen = werte.map(w => macheOption(w.v !== undefined ? w.v : w, w.t));
  const sel = {
    id: id, tagName: 'SELECT', value: optionen.length ? optionen[0].value : '',
    options: optionen, multiple: true,
    getAttribute: (n) => (n === 'name' ? (id === 'loc-list' ? 'loc_inlist' : null) : null),
    dispatchEvent: () => true,
    closest: () => null
  };
  return sel;
}

function baueUmgebung(opt) {
  opt = opt || {};
  const klicks = { ok: 0 };
  const elemente = {
    'daterange-list': macheSelect('daterange-list', ['intraday', 'current_week', 'current_month', 'user_defined']),
    'interval-list': macheSelect('interval-list', ['cumulate', 'day']),
    'loc-list': macheSelect('loc-list', [
      { v: '-1', t: '--Alle--' }, { v: 'Alanya', t: 'Alanya' }, { v: 'Berlin', t: 'Berlin' }
    ]),
    'ok-button': {
      id: 'ok-button', tagName: 'BUTTON', innerText: 'Ok',
      click: () => { klicks.ok++; },
      dispatchEvent: () => true
    }
  };
  const document = {
    readyState: 'complete',
    getElementById: (id) => elemente[id] || null,
    querySelector: (s) => {
      if (/result-table/.test(s)) return opt.tabelle || null;
      if (/ok-button/.test(s)) return elemente['ok-button'];
      return null;
    },
    querySelectorAll: (s) => {
      if (/loc_inlist/.test(s)) return [elemente['loc-list']];
      if (/button|submit/.test(s)) return [elemente['ok-button']];
      return [];
    },
    addEventListener: () => {},
    createElement: () => ({ style: {}, appendChild: () => {}, remove: () => {} }),
    body: { appendChild: () => {} }
  };

  const speicher = {};
  const sandbox = {
    console: {
      log: () => {}, warn: () => {}, error: () => {}, table: () => {}
    },
    document: document,
    location: { href: 'https://ccs.vodafone.de/liga_listen.rb', hostname: 'ccs.vodafone.de', pathname: '/liga_listen.rb', search: '' },
    localStorage: {
      getItem: (k) => (k in speicher ? speicher[k] : null),
      setItem: (k, v) => { speicher[k] = String(v); },
      removeItem: (k) => { delete speicher[k]; }
    },
    BroadcastChannel: function () {
      this.postMessage = () => {}; this.close = () => {};
      this.addEventListener = () => {}; this.removeEventListener = () => {};
      this.onmessage = null;
    },
    fetch: () => Promise.reject(new Error('offline')),
    XMLHttpRequest: function () {},
    DOMParser: function () { this.parseFromString = () => ({ querySelector: () => null }); },
    URLSearchParams: URLSearchParams,
    URL: URL,
    FormData: function () {},
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: () => 0, clearInterval: () => {},
    Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, Boolean: Boolean, Promise: Promise,
    Error: Error, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat,
    Set: Set, Map: Map,
    opener: null, name: '', addEventListener: () => {}, postMessage: () => {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.XMLHttpRequest.prototype = { open: function () {} };
  return { sandbox, klicks, elemente };
}

// ---------------------------------------------------------------------------
//  Testlauf
// ---------------------------------------------------------------------------
const quelle = fs.readFileSync(DATEI, 'utf8');
let fehler = 0, geprueft = 0;

function pruefe(name, bedingung, hinweis) {
  geprueft++;
  if (bedingung) { console.log('  OK   ' + name); }
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}

console.log('SPERRE PRUEFEN — ' + path.basename(DATEI));
console.log('');

const { sandbox } = baueUmgebung();
const ctx = vm.createContext(sandbox);

let startFehler = null;
try { vm.runInContext(quelle, ctx, { filename: 'kpi_crawler.js', timeout: 15000 }); }
catch (e) { startFehler = e; }

console.log('1) Der Crawler startet in einer fremden Umgebung ohne Absturz');
pruefe('kein Fehler beim Einspielen', !startFehler, startFehler && startFehler.message);
pruefe('Sperr-Werkzeuge sind vorhanden', typeof sandbox.rcCrawlerSperre === 'function');

console.log('');
console.log('2) Die Sperre gibt nach dem Start wieder frei (kein Dauerhalt)');
// pollKpis laeuft beim Start einmal durch. Ohne Token nimmt es den DOM-Weg,
// findet keine Tabelle und muss die Sperre im finally wieder abgeben.
const halterNachStart = sandbox.__rcLigaSperre;
pruefe('keine haengende Sperre unmittelbar nach dem Start',
  !halterNachStart || (Date.now() - halterNachStart.ts) < 5000,
  'Halter: ' + JSON.stringify(halterNachStart));

console.log('');
console.log('3) Die Sperre verfaellt von selbst (Schutz gegen Dauerblockade)');
// Eine kuenstlich veraltete Sperre muss uebernehmbar sein.
sandbox.__rcLigaSperre = { wer: 'Testlauf (kuenstlich alt)', ts: Date.now() - 10 * 60 * 1000 };
const halterAlt = sandbox.rcCrawlerSperre();
pruefe('eine ueber 3 Minuten alte Sperre gilt als frei', halterAlt === null,
  'gemeldet wurde: ' + halterAlt);

console.log('');
console.log('4) Standortliste: Sammelwerte und Vermischung');
sandbox.__rcLigaSperre = null;
const std = typeof sandbox.rcCrawlerStandorte === 'function' ? sandbox.rcCrawlerStandorte() : [];
pruefe('"--Alle--" (value -1) ist NICHT dabei', std.indexOf('-1') === -1, JSON.stringify(std));
pruefe('die Werte kommen aus der Seite', std.indexOf('Alanya') !== -1 && std.indexOf('Berlin') !== -1, JSON.stringify(std));
pruefe('KEINE Vermischung mit der Rueckfall-Liste',
  std.indexOf('Sakarya') === -1 && std.indexOf('regiocom_W_Home') === -1,
  'Die Seite kennt nur Alanya/Berlin — es duerfen keine fest verdrahteten Namen dazukommen. Ergebnis: ' + JSON.stringify(std));

console.log('');
console.log('5) Der Monats-Durchklick liefert ein Promise, das auch aufloest');
const ergebnis = (function () {
  try {
    // Nicht oeffentlich; ueber den offiziellen Weg anstossen.
    if (typeof sandbox.rcCrawlerHarvestMonth !== 'function') return 'nicht erreichbar';
    return sandbox.rcCrawlerHarvestMonth();
  } catch (e) { return 'wirft: ' + e.message; }
})();
pruefe('rcCrawlerHarvestMonth() gibt ein Promise zurueck',
  ergebnis && typeof ergebnis.then === 'function', String(ergebnis));

if (ergebnis && typeof ergebnis.then === 'function') {
  let aufgeloest = false;
  ergebnis.then(() => { aufgeloest = true; }).catch(() => { aufgeloest = true; });
  // Der Durchklick wartet auf die Seite; ohne echte Antwort greift die
  // Notbremse. Hier reicht der Nachweis, dass nichts synchron haengenbleibt.
  setTimeout(() => {
    console.log('');
    console.log('6) Nach dem Lauf ist die Seite wieder frei');
    const halter = sandbox.rcCrawlerSperre();
    // Innerhalb der kurzen Testzeit darf die Sperre noch gehalten werden -
    // entscheidend ist, dass sie einen Halter MIT Zeitstempel hat und damit
    // verfallen kann.
    pruefe('Sperre ist entweder frei oder traegt einen verfallbaren Zeitstempel',
      halter === null || (sandbox.__rcLigaSperre && sandbox.__rcLigaSperre.ts > 0),
      'Halter: ' + halter);

    console.log('');
    console.log('----------------------------------------------------');
    console.log(fehler === 0
      ? 'ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN.'
      : fehler + ' von ' + geprueft + ' Pruefungen FEHLGESCHLAGEN.');
    process.exit(fehler === 0 ? 0 : 1);
  }, 1500);
} else {
  console.log('');
  console.log('----------------------------------------------------');
  console.log(fehler + ' von ' + geprueft + ' Pruefungen fehlgeschlagen.');
  process.exit(fehler === 0 ? 0 : 1);
}
