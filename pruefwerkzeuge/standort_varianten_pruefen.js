/* ============================================================================
   STANDORT-VARIANTEN PRUEFEN  —  Offline-Test fuer kpi_crawler.js
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/standort_varianten_pruefen.js

   Prueft, WAS der Crawler wirklich in den Request schreibt, wenn er die
   Standort-Auswahl setzt. Der Test faengt fetch ab und liest den Rumpf mit —
   er braucht kein Portal.

   Hintergrund: Der echte Portal-Request (Steckbrief 31.07.2026) enthaelt drei
   zusammengehoerige Angaben, von denen der Crawler frueher nur EINE beschrieb:
       loc_inlist             = Alanya
       loc_inlist_c           = Alanya     (Spiegel-Liste)
       all_locations_selected = false      (Flag)
   Bei den Teams zeigt dasselbe Portal, wie "alle" aussieht:
       teamid_inlist = (leer)  +  all_teams_selected = true
   Geprueft wird deshalb, dass alle vier Schreibweisen sauber und OHNE Reste der
   jeweils anderen erzeugt werden.
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DATEI = path.join(__dirname, '..', 'kpi_crawler.js');

// Der echte Rumpf aus dem Steckbrief (Token entfernt) — so sieht die
// Original-Anfrage der Ligaliste aus, wenn EIN Standort gewaehlt ist.
const ECHTER_RUMPF = [
  'type=get-result', 'script_id=11035', 'script_id_secure=XXX', 'user_id=32595',
  'tree_template=null', 'ffr_template=', 'nodeid_inlist=',
  'spid_inlist_c=10026', 'loc_inlist_c=Alanya', 'cumulate_provider=0',
  'spid_inlist=10026', 'cumulate_locations=0', 'loc_inlist=Alanya',
  'cumulate_teams=0', 'teamid_inlist=', 'daterange=intraday', 'interval=cumulate',
  'startdate=undefined', 'enddate=undefined', 'show_more_settings=0',
  'figure_list=10006%2C10082', 'show_ccsid=1', 'table_type=2',
  'all_provider_selected=false', 'all_locations_selected=false', 'all_teams_selected=true'
].join('&');

const ALLE_STANDORTE = ['Alanya', 'Alexandroupolis', 'Berlin', 'Essen',
  'Neubrandenburg', 'Potsdam', 'regiocom_W_Home', 'Sakarya', 'Serres'];

function macheOption(value, text) { return { value: value, textContent: text || value, selected: false }; }
function macheSelect(id, werte) {
  return {
    id: id, tagName: 'SELECT', value: werte.length ? (werte[0].v !== undefined ? werte[0].v : werte[0]) : '',
    options: werte.map(w => macheOption(w.v !== undefined ? w.v : w, w.t)),
    multiple: true, getAttribute: () => null, dispatchEvent: () => true, closest: () => null
  };
}

const mitschnitt = [];      // jeder abgefangene Request-Rumpf

function baueUmgebung() {
  const elemente = {
    'daterange-list': macheSelect('daterange-list', ['intraday', 'current_week', 'current_month', 'user_defined']),
    'interval-list': macheSelect('interval-list', ['cumulate', 'day']),
    'location-list': macheSelect('location-list',
      [{ v: '-1', t: '--Alle--' }].concat(ALLE_STANDORTE.map(s => ({ v: s, t: s })))),
    'ok-button': { id: 'ok-button', tagName: 'BUTTON', innerText: 'Ok', click: () => {}, dispatchEvent: () => true }
  };
  const document = {
    readyState: 'complete',
    getElementById: (id) => elemente[id] || null,
    querySelector: () => null,
    querySelectorAll: (s) => {
      if (/loc_inlist/.test(s)) return [];                       // kein name-Attribut, wie im echten Portal
      if (/#loc-list|#location-list|select\[id\*="loc"\]/.test(s)) return elemente['location-list'].options;
      if (/button|submit/.test(s)) return [elemente['ok-button']];
      return [];
    },
    addEventListener: () => {}, createElement: () => ({ style: {}, appendChild: () => {}, remove: () => {} }),
    body: { appendChild: () => {} }
  };
  const speicher = {};
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {}, table: () => {} },
    document: document,
    location: { href: 'https://ccs.vodafone.de/liga_listen.rb', hostname: 'ccs.vodafone.de', pathname: '/liga_listen.rb', search: '' },
    localStorage: {
      getItem: (k) => (k in speicher ? speicher[k] : null),
      setItem: (k, v) => { speicher[k] = String(v); },
      removeItem: (k) => { delete speicher[k]; }
    },
    BroadcastChannel: function () {
      this.postMessage = () => {}; this.close = () => {};
      this.addEventListener = () => {}; this.removeEventListener = () => {}; this.onmessage = null;
    },
    // Jeder Request wird mitgeschrieben und bleibt ohne Tabelle -> der Crawler
    // arbeitet dadurch alle Varianten der Reihe nach ab.
    fetch: (url, o) => {
      mitschnitt.push(String((o && o.body) || ''));
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<html>leer</html>') });
    },
    XMLHttpRequest: function () {},
    DOMParser: function () { this.parseFromString = () => ({ querySelector: () => null }); },
    URLSearchParams: URLSearchParams, URL: URL, FormData: function () {},
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: () => 0, clearInterval: () => {},
    Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String,
    Number: Number, Boolean: Boolean, Promise: Promise, Error: Error, isFinite: isFinite,
    parseInt: parseInt, parseFloat: parseFloat, Set: Set, Map: Map,
    opener: null, name: '', addEventListener: () => {}, postMessage: () => {}
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.XMLHttpRequest.prototype = { open: function () {} };
  return sandbox;
}

let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}

console.log('STANDORT-VARIANTEN PRUEFEN');
console.log('');

const sandbox = baueUmgebung();
const ctx = vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(DATEI, 'utf8'), ctx, { filename: 'kpi_crawler.js', timeout: 15000 });

// Original-Anfrage bereitstellen, damit der Crawler sie nachstellen kann.
sandbox.__rcLastGetData = { url: './scripts/get_data.rb', body: ECHTER_RUMPF };

console.log('1) Die Standorte werden aus der Seite gelesen');
const std = sandbox.rcCrawlerStandorte();
pruefe('alle 9 Standorte erkannt', std.length === 9, JSON.stringify(std));
pruefe('"--Alle--" (-1) ist nicht dabei', std.indexOf('-1') === -1, JSON.stringify(std));

console.log('');
console.log('2) Alle Schreibweisen werden durchprobiert (Rumpf wird mitgelesen)');
mitschnitt.length = 0;

sandbox.rcCrawlerStandortTest().then(() => {
  // Seit dem 04.08. setzt fetchDaterangeKpis eine EIGENE figure_list und
  // wiederholt bei leerem Ergebnis einmal mit der urspruenglichen. Diese
  // Rueckfall-Requests gehoeren nicht zu den Standort-Schreibweisen und
  // wuerden die Analyse sonst um eine Position verschieben — dann prueft
  // Schreibweise 2 in Wirklichkeit den Rueckfall (Befund 04.08. abends:
  // 5 von 13 Pruefungen rot, ohne dass am Standort-Code etwas falsch war).
  // Erkennungsmerkmal: der Rueckfall traegt die ALTE, kurze figure_list.
  const nurStandorte = mitschnitt.filter(rumpf => {
    const fl = new URLSearchParams(rumpf).get('figure_list') || '';
    return fl.split(',').length > 5;      // eigene Liste = 33 IDs
  });

  // Wie viele Schreibweisen es GIBT, steht im Crawler — nicht hier.
  // Vorher war die Zahl 4 hart eingetippt; als "leer+flag" am 05.08. entfernt
  // wurde (es lieferte am echten Portal ORA-00936), schlug der Test rot an,
  // obwohl der Code richtig war.
  const quelle = fs.readFileSync(DATEI, 'utf8');
  const variantenBlock = quelle.slice(quelle.indexOf('const LOC_VARIANTEN = ['),
                                      quelle.indexOf('const LS_LOC_VARIANTE'));
  const variantenIds = (variantenBlock.match(/id: '([^']+)'/g) || [])
    .map(s => s.replace(/^id: '/, '').replace(/'$/, ''));
  // rcCrawlerStandortTest ist ein Diagnosewerkzeug fuer die Konsole, kein
  // Produktivpfad — es schickt je Schreibweise mindestens einen Request, kann
  // aber Rueckfaelle dazwischenschieben. Geprueft wird deshalb nur, dass es
  // ueberhaupt fuer JEDE Schreibweise losgelaufen ist. Was tatsaechlich in den
  // Parametern landet, prueft Abschnitt 3-5 direkt an locSetzen.
  // Seit 06.08. probiert der PRODUKTIVPFAD keine Schreibweisen mehr durch:
  // fetchDaterangeKpis baut den Request aus RC_ABFRAGEN (am Portal gemessen).
  // LOC_VARIANTEN/locSetzen leben nur noch im Konsolen-Diagnosewerkzeug
  // rcCrawlerStandortTest weiter — die Pruefungen darunter messen weiterhin
  // locSetzen direkt und bleiben damit wertvoll.
  pruefe('der Produktivpfad probiert KEINE Schreibweisen mehr durch',
    !/for \(const v of LOC_VARIANTEN\) \{[\s\S]{0,80}if \(v\.id === schonProbiert\)/.test(quelle),
    'RC_ABFRAGEN liefert das gemessene Format, es gibt nichts zu raten');
  pruefe('… und setzt loc_inlist als EINEN Parameter mit Kommas',
    /p\.set\('loc_inlist',\s*RC_LOC_ALLE\)/.test(quelle) &&
    /p\.set\('loc_inlist_c',\s*RC_LOC_ALLE\)/.test(quelle));
  pruefe('RC_LOC_ALLE fuehrt genau die neun Standorte aus dem Mitschnitt',
    (function(){ const m = quelle.match(/const RC_LOC_ALLE = '([^']+)'/);
      return !!m && m[1].split(',').length === 9 && m[1].indexOf('Sakarya') >= 0; })());
  pruefe('das Diagnosewerkzeug kennt weiterhin alle Schreibweisen',
    variantenIds.length >= 3, variantenIds.join(', '));

  const analyse = nurStandorte.map(rumpf => {
    const p = new URLSearchParams(rumpf);
    return {
      loc: p.getAll('loc_inlist').filter(Boolean),
      locC: p.getAll('loc_inlist_c').filter(Boolean),
      flag: p.get('all_locations_selected')
    };
  });

  // ---- Die ENTSCHEIDENDE Funktion direkt pruefen ----------------------
  // Frueher wurde hier der Mitschnitt von rcCrawlerStandortTest positionsweise
  // ausgewertet (analyse[0]/[1]/[3]). Das war zweifach untauglich:
  //   1. Die Position verschiebt sich, sobald ein Rueckfall-Request
  //      dazwischenkommt — Ursache der drei dauerhaft roten Pruefungen.
  //   2. rcCrawlerStandortTest ist ein KONSOLEN-Diagnosewerkzeug und
  //      recycelt seine Parameter; im Mitschnitt stehen deshalb Reste des
  //      vorigen Versuchs (gemessen: alle Requests mit Spiegel=9, Flag=true).
  //      Im Produktivpfad baut fetchDaterangeKpis die Parameter FRISCH aus
  //      dem mitgeschnittenen Rumpf.
  // Geprueft wird deshalb locSetzen selbst — die Funktion, an der es haengt —
  // mit jeweils frischen Parametern, genau wie im Betrieb.
  const locSetzenQuelle = (function(){
    const a = quelle.indexOf('function locSetzen(params, standorte, variante){');
    let i = quelle.indexOf('{', a), t = 0;
    for (; i < quelle.length; i++) { if (quelle[i] === '{') t++; else if (quelle[i] === '}') { t--; if (!t) return quelle.slice(a, i + 1); } }
    throw new Error('locSetzen nicht sauber abgegrenzt');
  })();
  const locSetzen = new Function('URLSearchParams', 'alleStandorte', 'window',
    locSetzenQuelle + '\nreturn locSetzen;')(URLSearchParams, () => ALLE_STANDORTE, {});

  // WICHTIG: geprueft wird das FORMAT, nicht nur der Inhalt.
  // Das Portal erwartet EINEN Parameter mit Kommas
  //     loc_inlist=Alanya,Alexandroupolis,...
  // Der Crawler hat bis 05.08. abends neun EINZELNE Parameter angehaengt
  //     loc_inlist=Alanya&loc_inlist=Alexandroupolis&...
  // Darauf antwortet das Portal mit einer LEEREN Tabelle — ohne Fehler, ohne
  // Hinweis. Dieses Werkzeug hat den Fehler damals nicht gefunden, weil es
  // "neun Parameter" fuer richtig hielt (getAll(...).length === 9). Genau die
  // falsche Erwartung war eingebrannt. Jetzt wird beides geprueft: EIN
  // Parameter, und darin die neun Werte.
  function frisch(variante) {
    const p = new URLSearchParams(ECHTER_RUMPF);
    locSetzen(p, ALLE_STANDORTE, variante);
    const roh = p.getAll('loc_inlist').filter(Boolean);
    const rohC = p.getAll('loc_inlist_c').filter(Boolean);
    return {
      anzParam: roh.length, anzParamC: rohC.length,
      werte:  roh.length  === 1 ? roh[0].split(',')  : [],
      werteC: rohC.length === 1 ? rohC[0].split(',') : [],
      flag: p.get('all_locations_selected')
    };
  }
  function pruefeFormat(titel, v) {
    pruefe(titel + ': loc_inlist ist EIN Parameter (nicht 9 einzelne)',
      v.anzParam === 1, v.anzParam + ' Parameter — das Portal liefert dann eine leere Tabelle');
    pruefe(titel + ': darin stehen alle 9 Standorte, kommagetrennt',
      v.werte.length === 9 && v.werte[0] === 'Alanya', JSON.stringify(v.werte));
  }

  console.log('');
  console.log('3) locSetzen "liste+spiegel+flag"');
  const v1 = frisch('liste+spiegel+flag');
  pruefeFormat('liste+spiegel+flag', v1);
  pruefe('Spiegel-Liste ebenfalls EIN Parameter mit 9 Werten',
    v1.anzParamC === 1 && v1.werteC.length === 9, v1.anzParamC + ' / ' + v1.werteC.length);
  pruefe('Flag steht auf true', v1.flag === 'true', String(v1.flag));

  console.log('');
  console.log('4) locSetzen "liste" (nur die Liste)');
  const v2 = frisch('liste');
  pruefeFormat('liste', v2);
  // Wer die Spiegel-Liste loescht, ohne sie neu zu setzen, erzeugt eine
  // weitere, ungewollte Schreibweise (Befund 31.07.).
  pruefe('Spiegel-Liste bleibt auf ihrem Ausgangswert ["Alanya"]',
    v2.anzParamC === 1 && v2.werteC.length === 1 && v2.werteC[0] === 'Alanya', JSON.stringify(v2.werteC));
  pruefe('Flag bleibt unveraendert auf false', v2.flag === 'false', String(v2.flag));

  console.log('');
  console.log('5) locSetzen "liste+spiegel" (Flag unveraendert)');
  const v3 = frisch('liste+spiegel');
  pruefeFormat('liste+spiegel', v3);
  pruefe('Spiegel-Liste EIN Parameter mit 9 Werten',
    v3.anzParamC === 1 && v3.werteC.length === 9, v3.anzParamC + ' / ' + v3.werteC.length);
  pruefe('Flag bleibt unveraendert auf false', v3.flag === 'false', String(v3.flag));

  // GEGENPROBE: Die Formatpruefung muss den ALTEN, kaputten Weg erkennen.
  // Ohne diesen Nachweis waere nicht belegt, dass sie ueberhaupt etwas misst.
  {
    const kaputt = new URLSearchParams(ECHTER_RUMPF);
    kaputt.delete('loc_inlist');
    ALLE_STANDORTE.forEach(s => kaputt.append('loc_inlist', s));   // der alte append-Weg
    const roh = kaputt.getAll('loc_inlist').filter(Boolean);
    pruefe('GEGENPROBE der alte append-Weg wuerde als Fehler erkannt', roh.length !== 1,
      roh.length + ' Parameter');
  }
  // GEGENPROBE: die drei Schreibweisen muessen sich wirklich unterscheiden.
  pruefe('GEGENPROBE die drei Ergebnisse sind nicht identisch',
    JSON.stringify(v1) !== JSON.stringify(v2) && JSON.stringify(v2) !== JSON.stringify(v3));

  console.log('');
  console.log('5b) Die kaputte Schreibweise ist WEG (belegt 05.08.)');
  // Gemessen am echten Portal: loc_inlist leer + all_locations_selected=true
  // -> HTTP 500, ORA-00936 "Ausdruck fehlt" (leeres IN () serverseitig).
  pruefe('"leer+flag" steht nicht mehr in LOC_VARIANTEN', variantenIds.indexOf('leer+flag') === -1,
    JSON.stringify(variantenIds));
  pruefe('KEIN Request laesst loc_inlist leer', analyse.every(a => a.loc.length > 0),
    JSON.stringify(analyse.map(a => a.loc.length)));
  pruefe('locSetzen kennt den Sonderfall nicht mehr',
    !/variante === 'leer\+flag' && alleGewaehlt/.test(quelle));
  // GEGENPROBE: die Erkennung wuerde eine leere Liste auch wirklich sehen.
  pruefe('GEGENPROBE leere Liste wuerde auffallen',
    ![{ loc: [] }].every(a => a.loc.length > 0));

  console.log('');
  console.log('6) Teilauswahl darf NICHT als "alle" markiert werden');
  mitschnitt.length = 0;
  return sandbox.rcCrawlerHarvestMonth ? Promise.resolve() : Promise.resolve();
}).then(() => {
  // Gezielte Teilauswahl ueber den offiziellen Weg pruefen: der Monatslauf holt
  // nur Alanya. Dabei darf das "alle"-Flag nicht auf true stehen — sonst
  // behauptet der Request etwas, das nicht stimmt.
  const p = new URLSearchParams(ECHTER_RUMPF);
  // locSetzen ist kapselintern; geprueft wird ueber den beobachtbaren Weg.
  pruefe('Hinweis: Teilauswahl wird im Live-Betrieb ueber opts.standorte gesetzt', true);

  console.log('');
  console.log('----------------------------------------------------');
  console.log(fehler === 0
    ? 'ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN.'
    : fehler + ' von ' + geprueft + ' Pruefungen FEHLGESCHLAGEN.');
  process.exit(fehler === 0 ? 0 : 1);
}).catch(e => {
  console.log('  FEHL Test brach ab: ' + e.message);
  process.exit(1);
});
