// Prueft den FLUGSCHREIBER (27.09.) — den Mitschnitt, der alles festhaelt, was
// das Dashboard tut (Nutzer: "ein Logger, der alles speichert, was das Board
// macht, warum der haengt"). Die echte Funktion rcFlugschreiberStarten wird
// per Klammerzaehlung aus esl_live_arena_v22.js geschnitten und mit new
// Function gegen Attrappen gestartet (Fenster, Dokument, Speicher, Uhr).
// Das Zusammenspiel mit echtem fetch/Rahmen/Excel prueft test_datenfluss.html
// im Browser; hier geht es um Logik, Speicher, Uebernahme und Befund.
// Aufruf: node flugschreiber_pruefen.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const V22 = fs.readFileSync(path.join(DIR, 'esl_live_arena_v22.js'), 'utf8');

let ok = 0, rot = 0;
function pruefe(name, bed, info) {
  if (bed) ok++; else rot++;
  console.log((bed ? 'OK   ' : 'ROT  ') + name + (info !== undefined && !bed ? '  (' + info + ')' : ''));
}
function schneide(src, kopf) {
  const a = src.indexOf(kopf);
  if (a < 0) throw new Error('nicht gefunden: ' + kopf);
  let i = src.indexOf('{', a), t = 0;
  for (; i < src.length; i++) { if (src[i] === '{') t++; else if (src[i] === '}' && --t === 0) break; }
  return src.slice(a, i + 1);
}

// ---- 1. Aufbau ----
const KOPF = 'function rcFlugschreiberStarten(){';
const MODUL = schneide(V22, KOPF);
const START = "try { rcFlugschreiberStarten(); } catch(e){";
pruefe('Flugschreiber steht genau einmal im Dashboard', V22.split(KOPF).length === 2);
const nachEnde = V22.slice(V22.indexOf(MODUL) + MODUL.length, V22.indexOf(MODUL) + MODUL.length + 200);
pruefe('wird direkt nach der Definition gestartet (abgesichert)', /^\s*try \{ rcFlugschreiberStarten\(\); \} catch\(e\)\{/.test(nachEnde));
pruefe('Klammerschnitt endet vor dem Start (Klammern im Modul ausgeglichen)', V22.indexOf(START) === V22.indexOf(MODUL) + MODUL.length + nachEnde.indexOf('try {'));
pruefe('steht HINTER der Aufraeumliste (Clean-State bleibt beim Start-Log)',
  V22.indexOf('// 2. CLEAN-STATE') > 0 && V22.indexOf('// 2. CLEAN-STATE') < V22.indexOf(KOPF));
// Ohne interne Namen des Dashboards: sonst liesse er sich nicht allein pruefen
// (test_datenfluss.html) und braeche bei jeder Umbenennung still.
const ohneKommentar = MODUL.replace(/\/\/[^\n]*/g, '');
pruefe('benutzt rcLog nicht direkt', !/(?<![\w$.])rcLog\./.test(ohneKommentar));
pruefe('benutzt pad2/rcKey nicht direkt (nur window.rcKey)', !/(?<![\w$.])(pad2|rcKey)\(/.test(ohneKommentar));
pruefe('realConsole nur ueber typeof abgesichert', !/realConsole/.test(ohneKommentar.replace(/typeof realConsole !== 'undefined' && realConsole\) \? realConsole/, '')));
const LB = schneide(V22, 'window.rcLogbuch = function(){');
pruefe('Logbuch-Datei nimmt den Flugschreiber mit (ohne Logbuch doppelt)', /window\.rcFluss\.text\(false\)/.test(LB));
pruefe('Speicher-Notbremse wirft nur die aeltere Haelfte ab', /window\.rcFluss\.kappen\(\)/.test(V22) && !/rcFluss\.leeren\(\)/.test(V22.replace(MODUL, '')));
pruefe('Logbuch-Knopf nennt den Flugschreiber', /id="rcBtnLogbuch" title="[^"]*Flugschreiber/.test(V22));

// ---- Sandkasten: echter Code, gefaelschte Umgebung ----
function speicher() {
  const m = new Map();
  return { get length(){ return m.size; }, key(i){ return Array.from(m.keys())[i]; }, getItem(k){ return m.has(k) ? m.get(k) : null; },
           setItem(k, v){ m.set(k, String(v)); }, removeItem(k){ m.delete(k); }, _m: m };
}
function sandkasten(opt) {
  opt = opt || {};
  const uhr = { jetzt: opt.jetzt || Date.parse('2026-09-27T10:00:00') };
  class FakeDate extends Date {
    constructor(...a){ if (a.length) super(...a); else super(uhr.jetzt); }
    static now(){ return uhr.jetzt; }
  }
  const ls = opt.ls || speicher();
  const timer = [];
  const doc = opt.doc || {
    visibilityState: 'visible', readyState: 'complete', body: { appendChild(){} }, location: { href: 'https://esl.test/Agents/secure/sis_vodafone.xhtml' },
    hasFocus(){ return true; }, querySelectorAll(){ return []; }, querySelector(){ return null; }, getElementById(){ return null; },
    getElementsByTagName(){ return { length: 1234 }; }, addEventListener(){}, removeEventListener(){},
    createElement(){ return { style:{}, click(){}, remove(){} }; }
  };
  const win = opt.win || {};
  if (!opt.win) {
    const fetchRoh = function(){ return Promise.resolve({}); };
    const XHR = function(){}; XHR.prototype = { open(){}, send(){} };
    Object.assign(win, { rcProjektKuerzel: '', rcKey: b => b, fetch: fetchRoh, XMLHttpRequest: XHR, document: doc,
      console: { log(){} }, addEventListener(){}, removeEventListener(){}, processDataStream: function(d){ win.__pdsAufrufe = (win.__pdsAufrufe || 0) + 1; } });
    win.__fetchRoh = fetchRoh; win.__pdsRoh = win.processDataStream;
  }
  const perf = { now: () => uhr.jetzt - Date.parse('2026-09-27T09:00:00'), getEntriesByType: () => [{ type: 'navigate' }] };
  const code = opt.code || MODUL;
  const f = new Function('window', 'document', 'localStorage', 'performance', 'location', 'navigator', 'setInterval', 'clearInterval',
    'setTimeout', 'Blob', 'PerformanceObserver', 'Date',
    code + '\nrcFlugschreiberStarten(); return window.rcFluss;');
  const api = f(win, doc, ls, perf, doc.location, { userAgent: 'Edg/153.0.0.0' },
    (fn) => { timer.push(fn); return timer.length; }, () => {}, () => 0, function(){}, undefined, FakeDate);
  const takt = () => timer[timer.length - 1]();
  return { win, doc, ls, api, uhr, takt, FakeDate };
}
const heute = '2026-09-27';

// ---- 2. Start, Anklemmen, Zusammenfassen ----
{
  const s = sandkasten();
  pruefe('startet und meldet sich als rcFluss (Fassung 2)', s.api && s.api.aktiv === true && /^2 /.test(s.api.version));
  pruefe('fetch der Seite angeklemmt', s.win.fetch.__rcFluss === true && s.win.fetch.__roh === s.win.__fetchRoh);
  pruefe('processDataStream angeklemmt', s.win.processDataStream.__rcFluss === true);
  pruefe('XHR-Prototyp angeklemmt', !!s.win.XMLHttpRequest.prototype.__rcFluss);
  for (let i = 0; i < 3; i++) s.win.processDataStream([['datum', 'id'], [heute + ' 08:0' + i + ':00', String(10 + i)], [heute + ' 08:10:00', '99']]);
  pruefe('Dashboard-Funktion laeuft durch die Klammer weiter', s.win.__pdsAufrufe === 3);
  const E = s.api.eintraege();
  const pds = E.filter(e => e.k === 'pds'), da = E.filter(e => e.k === 'daten');
  pruefe('drei gleichartige Auswertungen = EIN Eintrag x3', pds.length === 1 && pds[0].n === 3, JSON.stringify(pds.map(e => e.n)));
  pruefe('Inhalt: Zeilen von heute gezaehlt', da.length === 1 && da[0].h === 2 && da[0].z === 2, JSON.stringify(da));
  pruefe('Inhalt: Datenstand-Wechsel gezaehlt (2x neu)', da[0] && da[0].idhW === 2, da[0] && da[0].idhW);
  pruefe('Inhalt: juengster Zeitstempel', da[0] && da[0].max === '08:10:00', da[0] && da[0].max);
  const gleich = [['datum', 'id'], [heute + ' 08:00:00', '1']];
  s.win.processDataStream(gleich); s.win.processDataStream(gleich);
  pruefe('Filterwechsel (dieselbe Tabelle) zaehlt nicht als neuer Export', s.api.eintraege().filter(e => e.k === 'daten').reduce((n, e) => n + (e.n || 1), 0) === 4);
  s.api.stop(true);
  pruefe('Stop gibt fetch zurueck', s.win.fetch === s.win.__fetchRoh);
  pruefe('Stop gibt processDataStream zurueck', s.win.processDataStream === s.win.__pdsRoh);
  pruefe('Stop gibt den XHR-Prototyp zurueck', !s.win.XMLHttpRequest.prototype.__rcFluss);
}

// ---- 3. Re-Inject: die neue Fassung uebernimmt, nichts doppelt ----
{
  const s = sandkasten();
  const erste = s.api;
  const s2 = sandkasten({ win: s.win, doc: s.doc, ls: s.ls });
  pruefe('Re-Inject: alte Fassung abgeklemmt, neue laeuft', erste.aktiv === false && s2.api.aktiv === true && s.win.rcFluss === s2.api);
  pruefe('Re-Inject: fetch genau EINMAL umwickelt', s.win.fetch.__rcFluss && s.win.fetch.__roh === s.win.__fetchRoh);
  pruefe('Re-Inject: processDataStream genau EINMAL umwickelt', s.win.processDataStream.__roh === s.win.__pdsRoh);
  pruefe('Re-Inject: Mitschnitt laeuft weiter (Start als Re-Inject markiert)', s2.api.eintraege().some(e => e.k === 'start' && /Re-Inject/.test(e.nav)));
  pruefe('Re-Inject meldet KEINEN Absturz', !s2.api.eintraege().some(e => /war weg/.test(e.art || '')));
  // Selbst mit ALTEM Lebenszeichen ist ein Re-Inject kein Absturz. Die erste
  // Fassung fragte erst NACH dem Abklemmen, ob eine lief (stop setzt aktiv=false),
  // und haette hier "Seite war weg" gemeldet.
  s.ls.setItem('rcFlussPuls_v1', String(s2.uhr.jetzt - 600000));
  const s3 = sandkasten({ win: s.win, doc: s.doc, ls: s.ls });
  pruefe('Re-Inject bei altem Lebenszeichen: trotzdem KEIN Absturz', !s3.api.eintraege().some(e => /war weg/.test(e.art || '')));
}

// ---- 4. Lebenszeichen: Absturz/Einfrieren zwischen zwei Starts ----
function mitAltbestand(letzter, pulsVorMs) {
  const ls = speicher(), jetzt = Date.parse('2026-09-27T10:00:00');
  ls.setItem('rcFlussMitschnitt_v1', JSON.stringify([{ k: 'start', t: jetzt - 900000 }, letzter]));
  ls.setItem('rcFlussPuls_v1', String(jetzt - pulsVorMs));
  return sandkasten({ ls, jetzt });
}
{
  const weg = mitAltbestand({ k: 'pds', t: Date.parse('2026-09-27T09:55:00') }, 300000);
  const e = weg.api.eintraege().find(x => x.k === 'haenger' && /war weg/.test(x.art));
  pruefe('Absturz erkannt: kein "Seite wird verlassen", Puls 5 Min alt', !!e && e.ms === 300000, JSON.stringify(e));
  pruefe('Absturz-Befund steht im Bericht', /Seite war zwischendurch WEG/.test(weg.api.text(false)));
  const normal = mitAltbestand({ k: 'ende', t: Date.parse('2026-09-27T09:55:00') }, 300000);
  pruefe('Gegenprobe: nach "Seite wird verlassen" KEIN Absturz', !normal.api.eintraege().some(x => /war weg/.test(x.art || '')));
  const frisch = mitAltbestand({ k: 'pds', t: Date.parse('2026-09-27T09:59:50') }, 10000);
  pruefe('Gegenprobe: frischer Puls (10 s) ist kein Absturz', !frisch.api.eintraege().some(x => /war weg/.test(x.art || '')));
}

// ---- 5. Zustandswechsel: Zahlen im Text sind kein Wechsel ----
function zustandsLauf(code) {
  const s = sandkasten({ code });
  s.win.rcQuellenLage = { texte: ['Vodafone Mobile: noch keine Zahlen (seit 5 Minuten)'] };
  s.uhr.jetzt += 16000; s.takt();
  s.win.rcQuellenLage = { texte: ['Vodafone Mobile: noch keine Zahlen (seit 6 Minuten)'] };
  s.uhr.jetzt += 1000; s.takt();
  s.win.rcQuellenLage = { texte: ['Vodafone UM: Zahlen stehen seit 5 Minuten still'] };
  s.uhr.jetzt += 1000; s.takt();
  return s.api.eintraege().filter(e => e.k === 'zustand' && /Quellen-Streifen/.test(e.name)).length;
}
pruefe('Streifen: Minutenzaehler loest keinen neuen Eintrag aus (2 statt 3)', zustandsLauf(MODUL) === 2, zustandsLauf(MODUL));
{
  const ohneNorm = MODUL.replace("var sig = String(wert).replace(/\\d+/g, '#');", 'var sig = String(wert);');
  pruefe('Gegenprobe: ohne Zahlen-Normierung waeren es 3', ohneNorm !== MODUL && zustandsLauf(ohneNorm) === 3, zustandsLauf(ohneNorm));
}
{
  const s = sandkasten();
  s.uhr.jetzt += 16000; s.takt();
  const vorher = s.api.eintraege().filter(e => e.k === 'zustand').length;
  s.win.rcSessionState = { alive: false, lostAt: '10:00:17', lostReason: 'ViewExpiredException in Such-Antwort' };
  s.uhr.jetzt += 1000; s.takt();
  const neu = s.api.eintraege().filter(e => e.k === 'zustand').slice(vorher);
  pruefe('Sitzungsverlust wird als Wechsel geschrieben', neu.some(e => e.name === 'ESL-Sitzung' && /^TOT \(ViewExpired/.test(e.wert)), JSON.stringify(neu));
  pruefe('in den ersten 15 s keine Zustandsmeldungen (Anlauf)', sandkasten().api.eintraege().every(e => e.k !== 'zustand'));
}

// ---- 6. Befund-Regeln an gezielt gebauten Verlaeufen ----
function befundMit(eintraege, alleProjekte) {
  const s = sandkasten();
  if (alleProjekte) s.win.rcAlleProjekteModus = true;
  const E = s.api.eintraege();
  E.length = 0;
  let t = Date.parse('2026-09-27T09:00:00');
  eintraege.forEach(e => { e.t = (t += 60000); E.push(e); });
  return s.api.text(false);
}
{
  const B = befundMit([
    { k: 'daten', q: 'Kabel', z: 23, h: 23, tage: heute + ':23', kopf: 'Kabel' },
    { k: 'daten', q: 'Kabel', z: 0, h: 0, tage: 'keine', kopf: 'Kabel' }
  ], true);
  pruefe('Befund: "Zeilen von HEUTE fallen auf 0" mit Zeitpunkt', /Kabel: .*Zeilen von HEUTE fallen ab 09:02:00 auf 0 \(vorher 23 um 09:01:00\)/.test(B), B.split('\n').filter(x => /^- Kabel/.test(x))[0]);
  const B2 = befundMit([{ k: 'daten', q: 'Mobile', z: 30, h: 30, tage: heute + ':30', kopf: 'Kabel', gleichKabel: 100 }], true);
  pruefe('Befund: Rahmen liefert Spalten eines fremden Projekts', /Mobile: .*liefert Spalten von Kabel/.test(B2));
  pruefe('Befund: Rahmen liefert dieselben Datensaetze wie Kabel', /Mobile: .*100% dieselben Datensaetze wie Kabel/.test(B2));
  const B3 = befundMit([{ k: 'daten', q: 'Mobile', z: 30, h: 30, tage: heute + ':30', kopf: 'Mobile', gleichKabel: 0 }], true);
  pruefe('Gegenprobe: eigene Mobile-Daten loesen keinen Alarm aus', !/Mobile: .*(ACHTUNG|dieselben Datensaetze)/.test(B3));
  const B4 = befundMit([
    { k: 'pds', ein: 500, heute: 500, kabel: 500, mobile: 0, um: 0, kont: 0, verk: 0, ag: 0, ms: 90, filter: 'Standort AL / Team ALL / Stack VUM_Care' }
  ], false);
  pruefe('Befund: Zeilen von heute, aber 0 Kontakte -> Filter benannt', /0 Kontakte \(1x\) - Filter: Standort AL \/ Team ALL \/ Stack VUM_Care/.test(B4));
  const B5 = befundMit([
    { k: 'req', q: 'Kabel', a: 'Export', erg: 'Excel', dat: 'von=27.09.2026 bis=27.09.2026', stat: 'Export Projektergebnisse' },
    { k: 'req', q: 'Kabel', a: 'Export', erg: 'Excel', dat: 'von=01.09.2026 bis=27.09.2026', stat: 'Export Projektergebnisse' }
  ], false);
  pruefe('Befund: gesendeter Zeitraum wechselt (Harvest verstellt das Portal)', /gesendeter Zeitraum WECHSELT: von=27\.09\.2026 bis=27\.09\.2026  ->  von=01\.09\.2026/.test(B5));
  const B6 = befundMit([
    { k: 'haenger', art: 'SEITE HING (Takt blockiert)', ms: 42000 },
    { k: 'messung', heap: 150, knoten: 9000, langN: 1, langMs: 100, langMax: 100, pdsN: 45, pdsMs: 300, pdsMax: 900 },
    { k: 'messung', heap: 900, knoten: 30000, langN: 1, langMs: 100, langMax: 100, pdsN: 45, pdsMs: 300, pdsMax: 900 }
  ], false);
  pruefe('Befund: Haenger mit Dauer', /HAENGER: 09:01:00 SEITE HING \(Takt blockiert\) 42 s/.test(B6));
  pruefe('Befund: wachsender Speicher als moegliches Leck', /Speicher 150 MB -> 900 MB, DOM 9000 -> 30000 Knoten .* WAECHST deutlich/.test(B6));
  const B7 = befundMit([{ k: 'liga', q: 'kabel', agenten: 312, voll: true, dr: 'intraday', std: 5 }], false);
  pruefe('Befund: Liga-Paket mit Agentenzahl', /Liga: 1 Pakete, zuletzt 09:01:00 mit 312 Agenten \(vollstaendig, intraday\)/.test(B7));
  const B8 = befundMit([], false);
  pruefe('Befund: kein Liga-Paket wird ausdruecklich gesagt', /Liga: kein einziges Paket gesehen/.test(B8));
  // 28.09.: der Vergleich sagt nicht, WELCHE Seite fremde Daten liefert (27.09. war es
  // Kabel mit UM-Daten, der Befund beschuldigte aber den Rahmen).
  pruefe('Befund: gleiche Datensaetze beschuldigen nicht pauschal den Rahmen',
    !/Rahmen liefert Kabel-Daten/.test(B2) && /eine der beiden Seiten liefert fremde Daten/.test(B2));
  // 28.09.: zusammengefasste Eintraege (x18) tragen nur Anfang und Ende — ein
  // sauberer 20-s-Takt stand als "16 Min kein Abruf" im Befund.
  const b0 = Date.parse('2026-09-27T09:00:00');
  const B9 = befundMit([
    { k: 'req', q: 'Kabel', a: 'Export', erg: 'Excel', n: 18, bis: b0 + 17 * 60000 },
    { k: 'req', q: 'Kabel', a: 'Export', erg: 'Excel' }
  ], false);
  pruefe('Befund: dichter Takt in einem x18-Eintrag ist KEINE Luecke', !/Kein einziger ESL-Abruf/.test(B9));
  const B10 = befundMit([{ k: 'req', q: 'Kabel', a: 'Export', erg: 'Excel', n: 2, bis: b0 + 11 * 60000 }], false);
  pruefe('Gegenprobe: zwei Abrufe 10 Min auseinander bleiben eine Luecke', /Kein einziger ESL-Abruf zwischen: 09:01:00-09:11:00 \(10 Min\)/.test(B10),
    (B10.split('\n').filter(x => /Kein einziger/.test(x))[0] || '(keine Zeile)'));
}
{
  // Anmeldemaske: nur ein SICHTBARES Passwortfeld zaehlt (jede ESL-Seite traegt ein
  // verborgenes; 27.09. stand "Anmeldemaske JA" auf allen Seiten, die Excel lieferten).
  const mod = V22.slice(V22.indexOf('    function rcFlugschreiberStarten(){'), V22.indexOf('    try { rcFlugschreiberStarten(); }'));
  pruefe('Flugschreiber: Anmeldemaske und Rahmen-Seite fragen pwSichtbar, nicht jedes Passwortfeld',
    /o\.anmeldemaske = pwSichtbar\(d\)/.test(mod) && /o\.pw = pwSichtbar\(d\)/.test(mod) && /function pwSichtbar\(d\)\{/.test(mod) && /offsetWidth \|\| el\.offsetHeight/.test(mod));
}

// ---- 7. Speicher: Deckel und Notbremse ----
{
  const s = sandkasten();
  const E = s.api.eintraege();
  for (let i = 0; i < 1400; i++) E.push({ k: 'info', t: Date.now(), text: 'x'.repeat(400) });
  s.api.stop(true);                                    // sichert sofort
  const roh = s.ls.getItem('rcFlussMitschnitt_v1') || '';
  pruefe('Mitschnitt bleibt unter dem Deckel (250 KB)', roh.length > 0 && roh.length <= 250000, roh.length);
  pruefe('gespeichert OHNE interne Zusammenfass-Kennung', roh.indexOf('"sig"') === -1);
  const s2 = sandkasten();
  const E2 = s2.api.eintraege();
  for (let i = 0; i < 100; i++) E2.push({ k: 'info', t: Date.now(), text: 'y' });
  const vorher = E2.length, weg = s2.api.kappen();
  pruefe('Notbremse wirft die aeltere Haelfte ab, das Juengste bleibt', weg === Math.floor(vorher / 2) && s2.api.eintraege()[s2.api.eintraege().length - 1].text === 'y');
}

// ---- 8. Reine Helfer (ViewState nie roh, Datumsformate) ----
{
  const vs = new Function(schneide(MODUL, 'function hash(') + schneide(MODUL, 'function vsKurz(') + '\nreturn vsKurz;')();
  const a = vs('-4418795389470289633:7418079542343838264');
  pruefe('ViewState "logisch:aktuell" nur als Pruefsumme', /^L\w{4}\/A\w{4}$/.test(a) && a.indexOf('4418') === -1, a);
  pruefe('langer ViewState nur als Laenge + Pruefsumme', /^lang\d+#\w{4}$/.test(vs('H4sIAAAAAAAAA' + 'A'.repeat(200))));
  pruefe('gleiche logische Ansicht -> gleiches L', vs('-11:22').slice(0, 5) === vs('-11:33').slice(0, 5) && vs('-11:22') !== vs('-11:33'));
  const tag = new Function(schneide(MODUL, 'function p2(') + schneide(MODUL, 'function tagVon(') + '\nreturn tagVon;')();
  pruefe('Datum ISO mit Uhrzeit', tag('2026-09-27 08:12:33') === '2026-09-27');
  pruefe('Datum deutsch', tag('27.09.2026 08:12') === '2026-09-27');
  pruefe('Datum als Excel-Zahl', tag(46292) === '2026-09-27', tag(46292));
  pruefe('kein Datum -> null (nicht heute)', tag('') === null && tag('abc') === null);
}

console.log(rot ? '\n' + rot + ' fehlgeschlagen, ' + ok + ' bestanden' : '\nALLE ' + ok + ' PRUEFUNGEN BESTANDEN');
process.exitCode = rot ? 1 : 0;
