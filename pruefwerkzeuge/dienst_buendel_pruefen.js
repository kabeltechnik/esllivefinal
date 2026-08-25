/* ============================================================================
   DIENST-BUENDEL PRUEFEN
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/dienst_buendel_pruefen.js

   Prueft esl_dienst_buendel.js: die zwei Seiten-Buendel, die der Datendienst per
   CDP in den ESL- und den Ligalisten-Tab einspielt. Sie bestehen aus den
   ECHTEN Funktionen von esl_live_arena_v22.js und kpi_crawler.js (per
   Klammer-Zaehlung herausgeschnitten, kein Nachbau) und muessen allein
   lauffaehig sein - dafuer laufen sie hier in einem leeren vm-Kontext, der nur
   `window`, `console` und die paar Browser-Bausteine kennt, die der Tab ohnehin
   mitbringt.

   Zu den kritischen Regeln gehoert je eine GEGENPROBE: die falsche Bauart wird
   nachgebaut und muss durchfallen (Buendel ohne rcJq, fehlender Kopf, kaputte
   Syntax). Sonst weiss man nicht, ob die Pruefung den echten Fehler erkennt.
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}
function wirft(fn, muster) {
  try { fn(); } catch (e) { return muster.test(String(e && e.message)); }
  return false;
}

const WURZEL = path.join(__dirname, '..');
const V22 = path.join(WURZEL, 'esl_live_arena_v22.js');
const KPI = path.join(WURZEL, 'kpi_crawler.js');

console.log('DIENST-BUENDEL PRUEFEN');
console.log('');

// Der Kontext kennt nur, was ein Browser-Tab ohnehin hat. Alles andere (document,
// jQuery ...) fehlt absichtlich: ein Buendel, das mehr braucht, faellt hier auf.
function ctx(w) {
  w.window = w;
  return vm.createContext({
    window: w, console: { log() {}, warn() {}, error() {} },
    URLSearchParams, TextDecoder
  });
}

(async function () {
  console.log('1) Modul');
  const B = require('../esl_dienst_buendel.js');
  const quelle = fs.readFileSync(path.join(WURZEL, 'esl_dienst_buendel.js'), 'utf8');
  pruefe('haengt nicht an pruefwerkzeuge/ (die gehen nicht mit auf den Rechner)', !/require\([^)]*pruefwerkzeuge/.test(quelle));
  pruefe('nur Node-Bausteine (kein require ausser crypto)', (quelle.match(/require\(['"][^'"]+['"]\)/g) || []).every(function (r) { return /'crypto'|"crypto"/.test(r); }));
  pruefe('reines LF', !/\r/.test(quelle));
  pruefe('ESL_FUNKTIONEN: die zehn Koepfe aus dem Plan', JSON.stringify(B.ESL_FUNKTIONEN) === JSON.stringify([
    'function rcJq(', 'function rcLeerlaufZurueck(', 'function rcPasswortSichtbar(', 'function rcFilterKnopf(',
    'function rcProjektVonPfad(', 'function rcExportKnopfFinden(', 'function rcSuchAntwort(',
    'function rcViewAbgelaufen(', 'function rcAnmeldeSeite(', 'async function rcRahmenExport(']));

  console.log('');
  console.log('2) Schneiden');
  const probe = 'function t(a){ var s = "}"; var r = /}{/; var k = \'{\'; /* } */ // }\n return s + k; }\nfunction zweite(){ return 2; }';
  const t = B.schneideFunktion(probe, 'function t(');
  pruefe('Klammern in Zeichenketten, Regex und Kommentaren zaehlen nicht', t === probe.slice(0, probe.indexOf('\nfunction zweite')) , JSON.stringify(t));
  pruefe('Regex nach return wird erkannt, Division nicht', (function () {
    const z = 'function d(a){ var x = a / 2; return /}/.test(String(x)); }\nfunction e(){}';
    return B.schneideFunktion(z, 'function d(') === z.slice(0, z.indexOf('\nfunction e'));
  })());
  pruefe('async-Kopf: Stueck beginnt bei "async"', B.schneideFunktion('x; async function q(){ return 1; } y;', 'async function q(').indexOf('async function q(') === 0);
  pruefe('fehlender Kopf wirft mit dem Kopf im Text', wirft(function () { B.schneideFunktion('function a(){}', 'function fehlt('); }, /function fehlt\(/));
  pruefe('kaputte Syntax wirft mit dem Namen', wirft(function () { B.schneideFunktion('function kaputt(){ var = ; }', 'function kaputt('); }, /function kaputt\(/));
  pruefe('nie geschlossene Funktion wirft mit dem Namen', wirft(function () { B.schneideFunktion('function offen(){ if (1) {', 'function offen('); }, /function offen\(/));
  pruefe('Abschnitt: von bis bis (ohne das Ende)', B.schneideAbschnitt('A; const x = 1; // ENDE\nB;', 'const x', '// ENDE') === 'const x = 1; ');
  pruefe('Abschnitt: fehlender Anfang wirft', wirft(function () { B.schneideAbschnitt('abc', 'nix', 'c'); }, /nix/));
  pruefe('Abschnitt: fehlendes Ende wirft', wirft(function () { B.schneideAbschnitt('abc', 'a', 'nix'); }, /nix/));
  pruefe('Abschnitt: Syntaxfehler wirft', wirft(function () { B.schneideAbschnitt('const = ;', 'const', ';'); }, /Syntax/i));

  console.log('');
  console.log('3) offeneNamen');
  pruefe('benutzter, nirgends definierter Name', JSON.stringify(B.offeneNamen('function a(){ return rcFoo() + pad2(1); }', [])) === '["pad2","rcFoo"]');
  pruefe('selbst definiert (function / const) zaehlt', B.offeneNamen('function rcA(){} const rcB = 1; rcA(); rcB; let rcC = 2; rcC;', []).length === 0);
  pruefe('von aussen als vorhanden gemeldet zaehlt', B.offeneNamen('rcFoo();', ['rcFoo']).length === 0);
  pruefe('Kommentare, Zeichenketten und Regex zaehlen nicht', B.offeneNamen('// rcA()\n var s = "rcB()"; var r = /rcC\\(/; /* rcD() */', []).length === 0);
  pruefe('Eigenschaft (window.rcX, o.rcX) ist kein freier Name', B.offeneNamen('window.rcX(); o.rcY;', []).length === 0);
  pruefe('Objekt mit Mitgliedszugriff (rcLog.warn) wird als benutzt erkannt', B.offeneNamen('rcLog.warn(1);', []).join() === 'rcLog');
  pruefe('async function zaehlt als Definition', B.offeneNamen('async function rcE(){} rcE();', []).length === 0);

  console.log('');
  console.log('4) ESL-Buendel');
  const v22 = fs.readFileSync(V22, 'utf8');
  const esl = B.eslBuendel(v22);
  const w = {};
  vm.runInContext(esl, ctx(w));
  const E = w.__rcDienstEsl;
  pruefe('ESL: Export-Funktion da', typeof E.rcRahmenExport === 'function');
  pruefe('ESL: UM-Pfad mit %20', E.rcProjektVonPfad('/Agents/secure%20/sis_vodafone_um.xhtml') === 'um');
  pruefe('ESL: Kabel und Mobile', E.rcProjektVonPfad('/Agents/secure/sis_vodafone.xhtml') === 'kabel' && E.rcProjektVonPfad('/Agents/secure/sis_vodafone_mobile.xhtml') === 'mobile');
  pruefe('ESL: fremde Seite ist kein Projekt', E.rcProjektVonPfad('/Agents/secure/main.xhtml') === '');
  pruefe('ESL: Anmeldeseite', E.rcAnmeldeSeite('<input type=password>') === true);
  pruefe('ESL: Passwortfeld MIT Hauptmenue ist keine Anmeldeseite', E.rcAnmeldeSeite('<input type=password> frmMainMenu') === false);
  pruefe('ESL: geschlossen (kein freier rc-Name, kein pad2)', B.offeneNamen(esl, []).length === 0, B.offeneNamen(esl, []).join());
  pruefe('ESL: alle sechs Exporte da', ['rcRahmenExport', 'rcFilterKnopf', 'rcProjektVonPfad', 'rcLeerlaufZurueck', 'rcPasswortSichtbar', 'rcAnmeldeSeite']
    .every(function (n) { return typeof E[n] === 'function'; }));
  pruefe('ESL: version = 8 Hex-Zeichen, im Text genau so eingebettet', /^[0-9a-f]{8}$/.test(E.version) && esl.indexOf("'" + E.version + "'") >= 0);
  pruefe('ESL: gleicher Quelltext gibt gleiche version', B.eslBuendel(v22) === esl);

  // Zweimal in derselben Seite: kein const-Fehler, zweites Mal ist ein Nichts.
  {
    const w1 = {}, c1 = ctx(w1);
    vm.runInContext(esl, c1);
    w1.__rcDienstEsl.marke = 'bleibt';
    let ok = true;
    try { vm.runInContext(esl, c1); } catch (e) { ok = false; }
    pruefe('ESL: zweites Einspielen in dieselbe Seite wirft nicht', ok);
    pruefe('ESL: gleiche version -> zweites Einspielen tut nichts', w1.__rcDienstEsl.marke === 'bleibt');
    const neuer = esl.replace(/'[0-9a-f]{8}'/g, "'abcd0000'");
    vm.runInContext(neuer, c1);
    pruefe('ESL: andere version -> wird ersetzt', w1.__rcDienstEsl.marke === undefined && w1.__rcDienstEsl.version === 'abcd0000');
  }
  // Gegenprobe: Quelltext aendert sich -> version aendert sich
  pruefe('ESL: Gegenprobe - geaenderter Quelltext gibt andere version', (function () {
    const geaendert = v22.replace('function rcProjektVonPfad(pfad){', 'function rcProjektVonPfad(pfad){ /* x */');
    return geaendert !== v22 && B.eslBuendel(geaendert).indexOf(E.version) < 0;
  })());
  // Gegenprobe: Buendel ohne rcJq
  {
    const ohne = esl.replace(B.schneideFunktion(v22, 'function rcJq('), '');
    pruefe('ESL: Gegenprobe - Buendel ohne rcJq meldet rcJq als offen', ohne !== esl && B.offeneNamen(ohne, []).indexOf('rcJq') >= 0);
    pruefe('ESL: Gegenprobe - ohne rcJq faellt rcLeerlaufZurueck(window) wirklich', (function () {
      try { const wx = {}; vm.runInContext(ohne, ctx(wx)); wx.__rcDienstEsl.rcLeerlaufZurueck(wx); return false; } catch (e) { return /rcJq/.test(String(e.message)); }
    })());
  }

  // Funktionsproben: die echten Funktionen laufen im geschlossenen Buendel.
  {
    const knopf = function (o) { return Object.assign({ id: '', name: '', title: '', innerText: '', value: '', innerHTML: '' }, o); };
    const form = { querySelectorAll: function () { return [knopf({ title: 'Liste exportieren' }), knopf({ title: 'Liste aktualisieren', id: 'filterForm:akt' })]; } };
    pruefe('ESL: rcFilterKnopf findet "Liste aktualisieren"', E.rcFilterKnopf(form).id === 'filterForm:akt');
    pruefe('ESL: rcFilterKnopf ohne Formular -> null', E.rcFilterKnopf(null) === null);

    const feld = function (breit, sichtbar) {
      return { offsetWidth: breit, offsetHeight: breit, ownerDocument: { defaultView: { getComputedStyle: function () { return { visibility: sichtbar }; } } } };
    };
    pruefe('ESL: rcPasswortSichtbar - verborgenes Feld zaehlt nicht', E.rcPasswortSichtbar({ querySelectorAll: function () { return [feld(0, 'visible'), feld(20, 'hidden')]; } }) === false);
    pruefe('ESL: rcPasswortSichtbar - sichtbares Feld zaehlt', E.rcPasswortSichtbar({ querySelectorAll: function () { return [feld(20, 'visible')]; } }) === true);

    // rcLeerlaufZurueck mit einem fremden Fenster (Rahmen): jQuery-idleTimer wird zurueckgesetzt
    const gerufen = [];
    const jq = function (el) { return { idleTimer: function (a) { gerufen.push(a); } }; };
    jq.fn = { idleTimer: function () {} };
    const rahmen = { jQuery: jq, document: { body: {}, createEvent: function () { return { initEvent() {} }; }, dispatchEvent() {} }, Event: function () {} };
    pruefe('ESL: rcLeerlaufZurueck(Rahmen) setzt den idleTimer zurueck', E.rcLeerlaufZurueck(rahmen) === true && gerufen.length === 3 && gerufen[0] === 'reset');
  }

  // rcRahmenExport: das Herz. Fester Ablauf mit nachgebautem ESL-Verhalten.
  {
    const PK = new Uint8Array([0x50, 0x4b, 3, 4]).buffer;
    const html = function (s) { return new Uint8Array(Buffer.from(s)).buffer; };
    function bau(opt) {
      const log = { appends: [], fetches: 0 };
      const such = knopf2({ id: 'filterForm:suche', innerText: 'Liste aktualisieren' });
      const knoepfe = [such].concat(opt.exportAufSeite ? [knopf2({ id: 'filterForm:alt', title: 'Liste exportieren' })] : []);
      const form = { action: 'http://x/f', querySelectorAll: function () { return knoepfe; } };
      const d = {
        getElementById: function (id) { return id === 'filterForm' ? form : id === 'data' ? { textContent: opt.datenText || '' } : null; },
        querySelectorAll: function () { return []; }, location: { href: 'http://x/' }
      };
      const W = {
        FormData: function () { this.append = function (k) { log.appends.push(k); }; },
        DOMParser: function () { this.parseFromString = function (h) {
          const k = h.indexOf('Liste exportieren') >= 0 ? [{ id: 'filterForm:neu', title: 'Liste exportieren' }] : [];
          return { getElementById: function () { return { querySelectorAll: function () { return k; } }; }, querySelectorAll: function () { return k; } };
        }; },
        fetch: function () {
          log.fetches++;
          if (log.fetches === 1) return Promise.resolve({ ok: true, text: function () { return Promise.resolve(opt.suchAntwort); } });
          return Promise.resolve({ ok: opt.status === undefined, status: opt.status, arrayBuffer: function () { return Promise.resolve(opt.export); } });
        }
      };
      return { f: { contentWindow: W, contentDocument: d }, log: log };
    }
    function knopf2(o) { return Object.assign({ id: '', name: '', title: '', innerText: '', value: '', innerHTML: '' }, o); }
    const NEU = '<partial-response><changes><update id="filterForm"><![CDATA[<form id="filterForm"><button title="Liste exportieren"></button></form>]]></update></changes></partial-response>';

    let r = await E.rcRahmenExport({ contentWindow: {}, contentDocument: { getElementById: function () { return null; } } });
    pruefe('Export: ohne filterForm -> kein-form', r.art === 'kein-form');

    let b = bau({ suchAntwort: NEU, export: PK });
    r = await E.rcRahmenExport(b.f);
    pruefe('Export: Knopf aus der FRISCHEN Such-Antwort, Excel kommt zurueck', r.art === 'excel' && b.log.appends.indexOf('filterForm:neu') >= 0 && b.log.appends.indexOf('filterForm:alt') < 0, JSON.stringify(b.log.appends));

    b = bau({ suchAntwort: '<partial-response>Statistik liefert kein Ergebnis.</partial-response>', export: PK });
    r = await E.rcRahmenExport(b.f);
    pruefe('Export: ohne Datensaetze und ohne Knopf -> leer (kein geratener Ersatzknopf)', r.art === 'leer' && b.log.fetches === 1, JSON.stringify(r));

    b = bau({ suchAntwort: '<partial-response></partial-response>', export: PK });
    r = await E.rcRahmenExport(b.f);
    pruefe('Export: ohne Knopf und ohne "kein Ergebnis" -> kein-export', r.art === 'kein-export');

    b = bau({ suchAntwort: '<partial-response></partial-response>', exportAufSeite: true, export: PK });
    r = await E.rcRahmenExport(b.f);
    pruefe('Export: Knopf vom Seitenaufbau, wenn die Antwort das Formular nicht neu schickt', r.art === 'excel' && b.log.appends.indexOf('filterForm:alt') >= 0);

    b = bau({ suchAntwort: '<partial-response><error>ViewExpiredException</error></partial-response>', export: PK });
    r = await E.rcRahmenExport(b.f);
    pruefe('Export: ViewExpired in der Such-Antwort -> abgelaufen', r.art === 'abgelaufen');

    b = bau({ suchAntwort: NEU, export: html('<html><form id="loginForm">j_username</form></html>') });
    r = await E.rcRahmenExport(b.f);
    pruefe('Export: HTML mit Anmeldeformular -> anmeldung', r.art === 'anmeldung');

    b = bau({ suchAntwort: NEU, export: html('<html>irgendeine Seite</html>') });
    r = await E.rcRahmenExport(b.f);
    pruefe('Export: sonstiges HTML -> html (nicht als Excel gelesen)', r.art === 'html');

    b = bau({ suchAntwort: NEU, export: PK, status: 500 });
    r = await E.rcRahmenExport(b.f);
    pruefe('Export: HTTP-Fehler -> http mit Status', r.art === 'http' && r.status === 500);
  }

  console.log('');
  console.log('5) Liga-Buendel');
  const kpi = fs.readFileSync(KPI, 'utf8');
  const liga = B.ligaBuendel(kpi);
  const w2 = {};
  vm.runInContext(liga, ctx(w2)); vm.runInContext(liga, ctx(w2));   // zweimal: IIFE, kein const-Fehler
  const L = w2.__rcDienstLiga;
  pruefe('Liga: Mobile-Baum', L.RC_ABFRAGEN.mobile.nodes === '11317,11229');
  pruefe('Liga: Kabel- und UM-Baum', L.RC_ABFRAGEN.kabel.nodes === '11405' && L.RC_ABFRAGEN.um.nodes === '12090');
  pruefe('Liga: datumKey braucht pad2', L.datumKey('2026/10/7') === '2026-10-07');
  pruefe('Liga: datumKey deutsche Schreibweise', L.datumKey('7.10.2026') === '2026-10-07');
  w2.__rcLastGetData = { body: 'user_id=u1&script_id=11035&script_id_secure=S' };
  const q = L.baueAbfrage('um', 'user_defined', 'day', { startdate: '20261001', enddate: '20261026' });
  pruefe('Liga: Abfrage UM', q.get('nodeid_inlist') === '12090' && q.get('startdate') === '20261001' && q.get('loc_inlist') === L.RC_LOC_ALLE);
  pruefe('Liga: Abfrage traegt Token und Benutzer aus dem Mitschnitt', q.get('script_id_secure') === 'S' && q.get('user_id') === 'u1');
  pruefe('Liga: Abfrage ohne Mitschnitt -> null (nichts geraten)', (function () { const wx = {}; vm.runInContext(liga, ctx(wx)); return wx.__rcDienstLiga.baueAbfrage('um', 'intraday', 'cumulate') === null; })());
  pruefe('Liga: snapshotOf', L.snapshotOf([{ ccsId: '7', standort: 'Alanya', callCount: 12 }]).byAgent['7'].c === 12);
  pruefe('Liga: extractTableHtml - Tabelle im JSON', /<table/.test(L.extractTableHtml('{"h":"<table><tr></tr></table>"}')) && L.extractTableHtml('nur Text') === null);
  pruefe('Liga: parseKpiTable laeuft im Buendel (Zeitspalte, Call-Zahl = AHT-Nenner)', (function () {
    const el = function (t, extra) { return Object.assign({ textContent: t, getAttribute: function () { return null; }, querySelector: function () { return null; } }, extra); };
    const reihe = function (zellen) { return { querySelectorAll: function () { return zellen; } }; };
    const kopf0 = reihe([el('Agentenname'), el('CCS-ID'), el('Standort'), el('Team'), el('AHT', { getAttribute: function () { return '2'; } })]);
    const kopf1 = reihe([el('Agentenname'), el('CCS-ID'), el('Standort'), el('Team'), el('Kennzahl'), el('Nenner')]);
    const zeile = reihe([el('Max Muster'), el('4711'), el('Alanya'), el('T1'), el('00:07:12'), el('25')]);
    const tabelle = { querySelectorAll: function (s) { return s === 'thead tr' ? [kopf0, kopf1] : s === 'tbody tr' ? [zeile] : []; } };
    const k = L.parseKpiTable(tabelle);
    return k.length === 1 && k[0].ccsId === '4711' && k[0].callCount === 25 && k[0].ahtSec === 432 && k[0].standort === 'Alanya';
  })());
  // Gegenprobe zur naiven Klammer-Zaehlung: im Rumpf steht die Zeichenkette '{'.
  pruefe('Liga: extractTableHtml endet an der eigenen Klammer (nicht an der naechsten Funktion)', (function () {
    const s = B.schneideFunktion(kpi, 'function extractTableHtml(');
    return !/kpiCrawlerInterval/.test(s) && /test\(t\) \? t : null;\s*\}$/.test(s);
  })());
  pruefe('Liga: geschlossen (kein freier rc-Name, kein pad2)', B.offeneNamen(liga, []).length === 0, B.offeneNamen(liga, []).join());
  pruefe('Liga: acht Exporte', ['parseKpiTable', 'extractTableHtml', 'snapshotOf', 'datumKey', 'baueAbfrage', 'RC_ABFRAGEN', 'RC_FIGURES', 'RC_LOC_ALLE'].every(function (n) { return L[n] != null; }));
  pruefe('Liga: version = 8 Hex-Zeichen', /^[0-9a-f]{8}$/.test(L.version));
  {
    const w3 = {}, c3 = ctx(w3);
    vm.runInContext(liga, c3); w3.__rcDienstLiga.marke = 'bleibt';
    let ok = true;
    try { vm.runInContext(liga, c3); } catch (e) { ok = false; }
    pruefe('Liga: dieselbe Seite zweimal: kein Fehler, zweites Mal ist ein Nichts', ok && w3.__rcDienstLiga.marke === 'bleibt');
  }
  // Gegenprobe: ohne pad2 ist datumKey offen
  {
    const ohne = liga.replace("function pad2(n){ return String(n).padStart(2, '0'); }", '');
    pruefe('Liga: Gegenprobe - Buendel ohne pad2 meldet pad2 als offen', ohne !== liga && B.offeneNamen(ohne, []).indexOf('pad2') >= 0);
  }
  pruefe('Liga: ohne Tages-Historie (kein localStorage-Zugriff im Buendel)', !/localStorage/.test(liga.replace(/\/\/.*$/gm, '')));

  console.log('');
  console.log('----------------------------------------------------');
  console.log(fehler === 0
    ? 'ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN.'
    : fehler + ' von ' + geprueft + ' Pruefungen FEHLGESCHLAGEN.');
  process.exit(fehler === 0 ? 0 : 1);
})().catch(function (e) {
  console.log('  FEHL Abbruch: ' + (e && e.stack || e));
  console.log('');
  console.log((fehler + 1) + ' von ' + (geprueft + 1) + ' Pruefungen FEHLGESCHLAGEN.');
  process.exit(1);
});
