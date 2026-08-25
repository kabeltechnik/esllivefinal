// ============================================================================
//  quellen_waechter_pruefen.js — "nach 2-3 Stunden steht alles still" (07.08.)
//
//  Nutzer-Befund aus dem Livebetrieb: "Das aktuallisieren von ESL und Ligaliste
//  funktioniert nicht richtig! nach 2-3 Stunden bleibt esl so stehen wie es ist
//  und Ligaliste genau! Daher sind die Reportings auch nicht richtig wie z.B
//  Ansprachequote."
//
//  Ursache (am Code belegt, nicht vermutet):
//    * Die CCS-Sitzung laeuft nach 2-3 Stunden ab. Der 3-Minuten-Replay des
//      Crawlers laeuft danach ins Leere — das Portal antwortet mit HTTP 200 und
//      einer Anmeldeseite, die HTTP-Fehlerbehandlung greift also nicht.
//      verwerteAntwort erkannte das, schrieb es aber NUR in die Konsole.
//    * Das Dashboard bekam keine Pakete mehr und zeigte die letzten Zahlen
//      unbegrenzt weiter — ohne jeden Hinweis.
//    * rcSessionLost stoppte den ESL-Takt ENDGUELTIG (clearInterval, kein Retry).
//
//  Die Ansprachequote ist ESL-Ansprachen / Liga-Calls. Friert nur EINE der
//  beiden Quellen ein, wandert die Quote lautlos in die Irre — deshalb war die
//  Beschwerde ueber falsche Reportings dieselbe Ursache.
// ============================================================================
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const dash = fs.readFileSync(path.join(WURZEL, 'esl_live_arena_v22.js'), 'utf8');
const craw = fs.readFileSync(path.join(WURZEL, 'kpi_crawler.js'), 'utf8');

let ok = 0, fehl = 0;
function pruef(name, bed, ist) {
  if (bed) { ok++; console.log('  ok   ' + name); }
  else { fehl++; console.log('  FEHL ' + name + (ist !== undefined ? '  -> ' + ist : '')); }
}
function schneide(src, kopf) {
  const i = src.indexOf(kopf);
  if (i < 0) return '';
  let tiefe = 0, start = src.indexOf('{', i);
  for (let j = start; j < src.length; j++) {
    if (src[j] === '{') tiefe++;
    else if (src[j] === '}') { tiefe--; if (!tiefe) return src.slice(i, j + 1); }
  }
  return '';
}

// ============================================================================
console.log('\n-- 1. Crawler erkennt den Sitzungstod und HANDELT --');
pruef('sitzungTot existiert', /function sitzungTot\(grund\)/.test(craw));
// Seit 14.08. verwirft der tot-Pfad zuerst den gesicherten Klick-Mitschnitt
// (klickVerwerfen) — sonst laedt der Neustart denselben toten Token wieder vor.
// REIHENFOLGE statt Wortlaut (Fallstrick 18): die alte Fassung war ein starrer
// Regex ueber den exakten Text und wurde am 17.08. grundlos rot, als zwischen
// klickVerwerfen und sitzungTot ein autoKlickPlanen dazukam. Gemessen wird, was
// gemeint ist: im tot-Zweig wird ZUERST der Mitschnitt verworfen, DANN der
// Sitzungstod gemeldet.
pruef('  ... wird aus verwerteAntwort gerufen (nach klickVerwerfen)', (() => {
  const m = craw.match(/if \(tot && quelle !== 'Ok-Klick'\)[\s\S]{0,900}?\n      \}/);
  if (!m) return false;
  const z = m[0];
  const iV = z.indexOf('klickVerwerfen'), iT = z.indexOf('sitzungTot');
  return iV > -1 && iT > -1 && iV < iT;
})());
// Beim Ok-Klick sitzt der Nutzer davor — ein Neuladen unter den Haenden waere
// eine Zumutung, und die Konsolenmeldung reicht dort.
pruef('  ... aber NICHT beim Ok-Klick des Nutzers', /quelle !== 'Ok-Klick'/.test(craw));
pruef('die Seite wird neu geladen (der Autopilot meldet dann neu an)',
  /location\.reload\(\)/.test(craw));
pruef('  ... gedeckelt auf einen Versuch je 10 Minuten',
  /RELOAD_ABSTAND_MS = 10 \* 60 \* 1000/.test(craw));
pruef('  ... und auf insgesamt 4 Versuche', /RELOAD_MAX = 4/.test(craw));
pruef('das Dashboard wird benachrichtigt', /type:'KPI_QUELLE_TOT'/.test(craw));
pruef('  ... ueber alle drei Kanaele',
  /channel\.postMessage\(msg\)/.test(schneide(craw, 'function meldeQuelleTot')) &&
  /window\.opener/.test(schneide(craw, 'function meldeQuelleTot')) &&
  /rcDashWin/.test(schneide(craw, 'function meldeQuelleTot')));
pruef('Konsolen-Weg zum Testen vorhanden', /rcCrawlerSitzungTest/.test(craw));

// GEGENPROBE: Der alte Zustand — erkannt, aber nur geloggt — waere erkennbar.
pruef('GEGENPROBE blosses Loggen wuerde auffallen',
  !/sitzungTot/.test("console.warn('[KPI Crawler] Sitzung abgelaufen'); return { n:0 };"));

// ============================================================================
console.log('\n-- 2. Dashboard nimmt die Meldung an --');
pruef('KPI_QUELLE_TOT wird behandelt', /d\.type === 'KPI_QUELLE_TOT'/.test(dash));
pruef('  ... und in rcLigaStoerung festgehalten', /window\.rcLigaStoerung = \{ grund/.test(dash));
pruef('  ... loest sofort eine Pruefung aus', /try \{ rcQuellenWatchTick\(\); \} catch\(e\)\{\}/.test(dash));
pruef('ein neues Paket hebt die Stoerung wieder auf',
  /window\.rcLigaStoerung = null;\s+\/\/ Daten sind da/.test(dash));
// Die Projekt-Pruefung steht VOR der Typ-Verzweigung — eine Stoerung aus einem
// fremden Projekt darf den eigenen Monitor nicht rot faerben.
pruef('fremde Projekte werden weiterhin vorher verworfen',
  dash.indexOf("if (d.projekt && d.projekt !== rcEigenesProjekt()) return false;") <
  dash.indexOf("d.type === 'KPI_QUELLE_TOT'"));

// ============================================================================
console.log('\n-- 3. Der Waechter laeuft und ist sichtbar --');
pruef('rcQuellenWatchTick existiert', /function rcQuellenWatchTick\(\)/.test(dash));
pruef('  ... laeuft im 60-Sekunden-Takt', /rcQuellenWatchInterval = setInterval\(rcQuellenWatchTick, 60000\)/.test(dash));
pruef('  ... und einmal sofort beim Start', /rcQuellenWatchTick\(\);\s*$/m.test(dash));
pruef('Timer stehen in der Clean-State-Liste (Re-Inject)',
  /'rcQuellenWatchInterval'/.test(dash) && /'rcSessionRetryInterval'/.test(dash));
// Der Streifen muss im FLUSS liegen, nicht darueber: absolut positioniert
// verdeckte der Sitzungs-Streifen am 05.08. die komplette Kopfleiste.
pruef('der Streifen liegt im Fluss, nicht ueber der Kopfleiste',
  /ov\.insertBefore\(b, ov\.firstChild\)/.test(schneide(dash, 'function rcQuellenBanner')));
pruef('  ... und ueber ALLEN Seiten (am Overlay, nicht am Seiten-Container)',
  /var ov = window\.__rcOverlayEl/.test(schneide(dash, 'function rcQuellenBanner')));
pruef('er wird nur bei Aenderung neu geschrieben (kein Flackern)',
  /if \(b\.innerHTML !== neu\)/.test(dash));

// ============================================================================
console.log('\n-- 4. Der ESL-Takt gibt nicht mehr endgueltig auf --');
pruef('nach Sitzungsverlust laeuft ein Wiederbelebungs-Versuch',
  /window\.rcSessionRetryInterval = setInterval/.test(dash));
pruef('  ... im 60-Sekunden-Takt', /\}, 60000\);\s*\n\s*\}/.test(schneide(dash, 'function rcSessionLost')));
pruef('  ... und beendet sich selbst, sobald die Sitzung wieder steht',
  /clearInterval\(window\.rcSessionRetryInterval\)/.test(dash));
pruef('der Live-Takt wird weiterhin gestoppt (kein Haemmern gegen die Login-Seite)',
  /clearInterval\(window\.rcLiveInterval\)/.test(dash));
pruef('rcEslLastOk wird beim ERFOLGREICHEN Abruf gesetzt',
  /window\.rcEslLastOk = Date\.now\(\);/.test(dash));
// Bewusst NICHT in processDataStream: das wird auch bei jedem Filterwechsel
// mit dem ALTEN Datenstrom gerufen und wuerde eine tote Quelle als frisch
// ausweisen — genau der Fehler, den der Waechter finden soll.
pruef('  ... und NICHT in processDataStream (Filterwechsel ist kein Abruf)',
  dash.indexOf('window.rcEslLastOk = Date.now();') > dash.indexOf('window.processDataStream = function'),
  'Position');

// ============================================================================
console.log('\n-- 4b. Der STILLE Stillstand (Live-Befund 08.08.) --');
// Nutzer-Angabe, die es entschieden hat: Starter laeuft, Zahlen stehen still,
// KEINE Meldung im Dashboard. Kein Streifen heisst: rcSessionLost wurde nie
// gerufen — der Abruf lief also weiter und scheiterte still. Zwei Ausstiege
// in holeExcelVomServer kehrten ohne sichtbare Meldung zurueck.
pruef('Fehlserie wird gezaehlt', /window\.rcEslFehlserie\+\+/.test(dash));
pruef('  ... mit Grund', /window\.rcEslFehlgrund = grund/.test(dash));
pruef('  ... und meldet sich sofort beim Waechter', /try \{ rcQuellenWatchTick\(\); \} catch\(e\)\{\}/.test(schneide(dash, 'function rcEslFehlschlag')));
pruef('Erfolg setzt die Serie zurueck', /window\.rcEslFehlserie = 0; window\.rcEslFehlgrund = ''/.test(dash));
// Die Anmeldemaske hat kein filterForm — der haeufigste Fall nach Sitzungsablauf.
pruef('fehlendes filterForm + Passwortfeld = Sitzungstod',
  /rcSessionLost\('Anmeldemaske statt Projektergebnisse \(kein filterForm\)'\)/.test(dash));
pruef('  ... erkannt am Passwortfeld ODER an der Adresse',
  /const pw = document\.querySelector\('input\[type="password"\]'\)/.test(dash) &&
  /\/login\|anmeld\/i\.test\(location\.pathname/.test(dash));
pruef('fehlendes filterForm auf ANDERER Seite zaehlt als Fehlschlag',
  /rcEslFehlschlag\('kein filterForm auf der Seite'\)/.test(dash));
pruef('Export liefert HTML -> Fehlschlag statt stiller Wiederholung',
  /rcEslFehlschlag\('Export liefert HTML statt Excel'\)/.test(dash));
// GEGENPROBE: der alte Zustand — return ohne jede Zaehlung — waere erkennbar.
pruef('GEGENPROBE stilles return waere aufgefallen',
  !/rcEslFehlschlag/.test("const s = document.getElementById('rcFetchStatus'); return;"));

// ============================================================================
console.log('\n-- 4c. Datumswechsel um Mitternacht (Nutzer-Hypothese 08.08.) --');
// Das Portal behaelt den Zeitraum, der beim Start eingestellt war — weder
// Autopilot noch Dashboard setzen ihn im Normalbetrieb. Nach Mitternacht steht
// dort GESTERN. Der Export liefert dann eine voellig gueltige Excel: kein HTML,
// kein Fehler, HTTP 200. Der Abruf GELINGT also, rcEslLastOk wird gesetzt, und
// weder Sitzungs- noch Quellen-Waechter schlagen an — waehrend jede Zeile vom
// Mehrtages-Schutz als Fremdtag aussortiert wird und live 0 uebrigbleibt.
pruef('leeres heuteRows + Fremdtage = falscher Portal-Tag',
  /if \(!heuteRows\.length\) \{/.test(dash) && /window\.rcPortalTagFalsch = \{/.test(dash));
pruef('  ... merkt sich Ist-Tag und Soll-Tag', /tage: fremd\.sort\(\)\.join\(', '\), erwartet: tdK/.test(dash));
pruef('Heute-Zeilen heben den Zustand wieder auf',
  /if \(heuteRows\.length\) window\.rcPortalTagFalsch = null;/.test(dash));
// Bewusst OHNE die Parameterliste festzunageln: geprueft wird, dass es die
// Funktion gibt, nicht wie ihre Signatur gerade aussieht. Die frueher hier
// stehende Fassung verlangte woertlich "rcPortalAufHeute()" und wurde rot,
// als am 12.08. der Parameter `erzwingen` dazukam - obwohl der Code richtig
// war. Sproede Pruefungen dieser Art melden Aerger ohne Erkenntnis.
pruef('das Portal wird selbst auf heute gestellt', /async function rcPortalAufHeute\s*\(/.test(dash));
// Gegenprobe zur Regel: ein umbenanntes/fehlendes rcPortalAufHeute MUSS
// auffallen - sonst prueft die Zeile oben nichts mehr.
pruef('  ... Gegenprobe: die Regel erkennt eine fehlende Funktion',
  !/async function rcPortalAufHeuteXX\s*\(/.test(dash));
// Der Datumswechsel um 00:00 ruft sie mit erzwingen=true, damit der EINE
// Versuch nicht der 5-Minuten-Sperre zum Opfer faellt (12.08.).
pruef('  ... und wird beim Datumswechsel erzwungen aufgerufen',
  /rcPortalAufHeute\(true\)/.test(dash));
// Ohne echten Klick uebernimmt JSF den Wert nicht — das Backend exportiert den
// zuletzt BESTAETIGTEN Zustand. Dieselbe Lehre wie beim Bereichs-Harvest.
pruef('  ... per ECHTEM Klick auf "Liste aktualisieren"',
  /btn\.click\(\);/.test(schneide(dash, 'async function rcPortalAufHeute')));
pruef('  ... gedeckelt auf einen Versuch je 5 Minuten',
  /jetzt - rcTagFixZuletzt < 5 \* 60 \* 1000/.test(dash));
pruef('  ... im deutschen Datumsformat des Portals',
  /pad2\(d\.getDate\(\)\) \+ '\.' \+ pad2\(d\.getMonth\(\)\+1\) \+ '\.' \+ d\.getFullYear\(\)/.test(dash));
pruef('der Waechter meldet den falschen Tag sichtbar',
  /lage\.esl = 'falscher-tag'/.test(dash));
// Datenverlust-Schutz: eine so entstandene 0 loeschte bisher den echten
// Tagesstand in der Historie. Ein Tag kann nur WACHSEN.
pruef('die Historie wird nicht mit einer 0 ueberschrieben',
  /const wenigerAlsVorher = alt && \(alt\.kontakte \|\| 0\) > 0 && gCalls === 0;/.test(dash));
pruef('  ... und der Fall wird benannt',
  /Heute-Stand NICHT ueberschrieben/.test(dash));
pruef('GEGENPROBE bedingungsloses Ueberschreiben waere erkennbar',
  !/wenigerAlsVorher/.test('histS[hKey] = { rows: n, kontakte: gCalls };'));

console.log('\n-- 4d. Aktualisierungs-Zeiten sind SICHTBAR (Nutzer-Wunsch 08.08.) --');
pruef('Anzeige fuer beide Quellen im Kopf', /id="rcZeitEsl"/.test(dash) && /id="rcZeitLiga"/.test(dash));
pruef('  ... wird im Waechter-Takt gefuellt', /rcQuellenZeitAnzeige\(\);/.test(dash));
pruef('  ... zeigt Uhrzeit UND Alter', /' · vor ' \+ \(min < 90 \? min \+ ' Min' : Math\.floor\(min\/60\) \+ ' Std'\)/.test(dash));
pruef('  ... faerbt sich bei alten Daten', /e\.className = totGrund \? 'tot' : \(min >= 11 \? 'warn' : ''\)/.test(dash));
pruef('  ... kennt den Zustand "tot" fuer beide Quellen',
  /window\.rcPortalTagFalsch \|\| \(window\.rcEslFehlserie \|\| 0\) >= 3/.test(dash) &&
  /!!window\.rcLigaStoerung/.test(dash));
pruef('CSS fuer die Anzeige vorhanden', /\.rc-quellen\{/.test(dash));

// ============================================================================
console.log('\n-- 4e. FUNKTIONAL: Mehrtages-Schutz gegen Mitternacht --');
// Der echte Block aus processDataStream, gegen drei Datenlagen.
const mtVon = dash.indexOf('        window.rcMultiDayWarn = \'\';');
const mtBis = dash.indexOf('        const agentStats = {}, standortStats = {}, teamStats = {};');
const mtBlock = (mtVon > 0 && mtBis > mtVon) ? dash.slice(mtVon, mtBis) : '';
pruef('Mehrtages-Block liess sich ausschneiden', mtBlock.length > 400, mtBlock.length);

function laufeMehrtage(zeilenDaten) {
  const umg = {
    window: {}, localStorage: { getItem: () => '{}', setItem: () => {} },
    rcLog: { warn: () => {}, log: () => {} },
    rcRowDayKey: (r) => r[0],
    rcNewAgg: () => ({ kontakte: 0 }), rcAccumRow: () => {}, rcFinalizeAgg: () => {},
    rcKey: k => k, rcKappeProdHistorie: () => {},
    portalGestellt: false,
  };
  const f = new Function('umg', 'sheetData', 'idx', `
    const window = umg.window, localStorage = umg.localStorage, rcLog = umg.rcLog;
    const rcRowDayKey = umg.rcRowDayKey, rcNewAgg = umg.rcNewAgg, rcAccumRow = umg.rcAccumRow;
    const rcFinalizeAgg = umg.rcFinalizeAgg, rcKey = umg.rcKey;
    const rcKappeProdHistorie = umg.rcKappeProdHistorie, JSON = globalThis.JSON;
    const pad2 = n => String(n).padStart(2,'0');
    function rcPortalAufHeute(){ umg.portalGestellt = true; }
    ${mtBlock}
    return sheetData;
  `);
  const rest = f(umg, zeilenDaten, { datum: 0 });
  return { umg, rest };
}
const heuteK = (d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'))(new Date());
const gesternK = (d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'))(new Date(Date.now()-86400000));

// Lage 1: alles von heute -> kein Alarm
let r1 = laufeMehrtage([['datum'], [heuteK], [heuteK]]);
pruef('nur Heute-Zeilen -> kein falscher Tag', !r1.umg.window.rcPortalTagFalsch);
pruef('  ... und die Zeilen bleiben erhalten', r1.rest.length === 3, r1.rest.length);

// Lage 2: DER Mitternachtsfall — nur Zeilen von gestern
let r2 = laufeMehrtage([['datum'], [gesternK], [gesternK]]);
pruef('nur Gestern-Zeilen -> falscher Portal-Tag erkannt', !!r2.umg.window.rcPortalTagFalsch,
  JSON.stringify(r2.umg.window.rcPortalTagFalsch));
pruef('  ... nennt den Tag, auf dem das Portal steht',
  r2.umg.window.rcPortalTagFalsch && r2.umg.window.rcPortalTagFalsch.tage === gesternK);
pruef('  ... und den erwarteten Tag',
  r2.umg.window.rcPortalTagFalsch && r2.umg.window.rcPortalTagFalsch.erwartet === heuteK);
pruef('  ... und stellt das Portal selbst zurueck', r2.umg.portalGestellt === true);

// Lage 3: gemischt (Zeitraum ueber mehrere Tage) -> KEIN falscher Tag,
// denn Zahlen von heute sind ja da. Nur die bekannte Mehrtages-Warnung.
let r3 = laufeMehrtage([['datum'], [gesternK], [heuteK]]);
pruef('gemischter Zeitraum -> KEIN falscher Tag (heute ist dabei)',
  !r3.umg.window.rcPortalTagFalsch);
pruef('  ... aber die Mehrtages-Warnung steht', !!r3.umg.window.rcMultiDayWarn);
pruef('  ... und das Portal wird NICHT verstellt', r3.umg.portalGestellt === false);

// ============================================================================
console.log('\n-- 5. FUNKTIONAL: der Waechter gegen echte Lagen --');
// rcQuellenWatchTick und rcQuellenBanner echt ausschneiden und laufen lassen.
const fnTick = schneide(dash, 'function rcQuellenWatchTick()');
const fnAlter = schneide(dash, 'function rcQuellenAlterMin(t)');
pruef('rcQuellenWatchTick liess sich ausschneiden', fnTick.length > 200, fnTick.length);

let gemeldet = null, anzeigeLief = false;
const umgebung = {
  window: {},
  rcQuellenBanner: t => { gemeldet = t; },
  rcQuellenZeitAnzeige: () => { anzeigeLief = true; },
  RC_LIGA_TOT_MIN: 20,
  RC_ESL_TOT_MIN: 5,
};
const bauer = new Function('umg', `
  const window = umg.window;
  const rcQuellenBanner = umg.rcQuellenBanner;
  const rcQuellenZeitAnzeige = umg.rcQuellenZeitAnzeige;
  const RC_LIGA_TOT_MIN = umg.RC_LIGA_TOT_MIN, RC_ESL_TOT_MIN = umg.RC_ESL_TOT_MIN;
  ${fnAlter}
  ${fnTick}
  return rcQuellenWatchTick;
`);
const tick = bauer(umgebung);

// Die Zeitanzeige liegt in einem EIGENEN try. Wirft sie, darf der Streifen
// trotzdem erscheinen — sonst verschluckt ein Fehler im Beiwerk die Warnung,
// also genau der stille Ausfall, den dieser Waechter melden soll.
umgebung.rcQuellenZeitAnzeige = () => { throw new Error('Anzeige kaputt'); };
umgebung.window.rcKpiLastUpdate = new Date(Date.now() - 30 * 60000);
umgebung.window.rcSessionState = { alive: true };
gemeldet = null;
tick();
pruef('kaputte Zeitanzeige verschluckt den Alarm NICHT', !!gemeldet, gemeldet);
umgebung.rcQuellenZeitAnzeige = () => { anzeigeLief = true; };
const MIN = 60000;

// Lage A: alles frisch -> kein Streifen
gemeldet = 'vorher';
umgebung.window.rcKpiLastUpdate = new Date(Date.now() - 2 * MIN);
umgebung.window.rcEslLastOk = Date.now() - 1 * MIN;
umgebung.window.rcSessionState = { alive: true };
umgebung.window.rcLigaStoerung = null;
tick();
pruef('frische Quellen -> kein Streifen', gemeldet === null, JSON.stringify(gemeldet));

// Lage B: Ligaliste seit 25 Minuten still -> Streifen nennt sie
umgebung.window.rcKpiLastUpdate = new Date(Date.now() - 25 * MIN);
tick();
pruef('Ligaliste 25 Min still -> Streifen', !!gemeldet && /Ligaliste/.test(gemeldet), gemeldet);
pruef('  ... nennt die Dauer', /25 Minuten/.test(gemeldet || ''), gemeldet);
pruef('  ... sagt, was das bedeutet', /Quoten stehen still/.test(gemeldet || ''), gemeldet);

// Lage C: Crawler hat den Sitzungstod gemeldet -> sofort, ohne 20-Minuten-Wartezeit
umgebung.window.rcKpiLastUpdate = new Date(Date.now() - 1 * MIN);
umgebung.window.rcLigaStoerung = { grund: 'Sitzung abgelaufen', zeit: Date.now() };
tick();
pruef('gemeldete Stoerung wirkt SOFORT (nicht erst nach 20 Min)',
  !!gemeldet && /Sitzung abgelaufen/.test(gemeldet), gemeldet);

// Lage D: ESL still, Sitzung gilt aber als lebendig -> eigener Hinweis
umgebung.window.rcLigaStoerung = null;
umgebung.window.rcKpiLastUpdate = new Date();
umgebung.window.rcEslLastOk = Date.now() - 9 * MIN;
tick();
pruef('ESL 9 Min still -> Streifen nennt den ESL', !!gemeldet && /ESL/.test(gemeldet), gemeldet);

// Lage D2: DER gemeldete Fall — Abruf laeuft, scheitert aber seit 3 Zyklen.
// Das ist erst 1 Minute her, die Dauer-Schwelle greift also noch nicht. Genau
// hier stand bisher gar nichts, und das war die Beschwerde.
umgebung.window.rcEslLastOk = Date.now() - 1 * MIN;
umgebung.window.rcEslFehlserie = 3;
umgebung.window.rcEslFehlgrund = 'Export liefert HTML statt Excel';
tick();
pruef('3 Fehlschlaege in Folge -> Streifen, auch ohne Zeitablauf',
  !!gemeldet && /ESL liefert nicht mehr/.test(gemeldet), gemeldet);
pruef('  ... und nennt den GRUND, nicht nur die Dauer',
  /Export liefert HTML statt Excel/.test(gemeldet || ''), gemeldet);
// Ein einzelner Fehlschlag ist normal (PrimeFaces re-rendert) und darf nicht
// sofort einen Streifen erzeugen — sonst flackert er im Betrieb.
umgebung.window.rcEslFehlserie = 1;
tick();
pruef('ein EINZELNER Fehlschlag loest keinen Streifen aus', gemeldet === null, gemeldet);
umgebung.window.rcEslFehlserie = 0; umgebung.window.rcEslFehlgrund = '';

// Lage E: Sitzung ist bereits als verloren gemeldet -> KEIN zweiter Streifen
// (rcSessionBanner sagt dasselbe schon, zwei Streifen mit gleicher Aussage
//  waeren nur Laerm).
umgebung.window.rcSessionState = { alive: false };
tick();
pruef('bei gemeldetem Sitzungsverlust kein doppelter ESL-Hinweis',
  !gemeldet || !/ESL liefert seit/.test(gemeldet), gemeldet);

// Lage F: gar keine Daten bisher -> kein Fehlalarm beim Start
umgebung.window.rcSessionState = { alive: true };
umgebung.window.rcKpiLastUpdate = null;
umgebung.window.rcEslLastOk = null;
tick();
pruef('vor dem ersten Paket kein Fehlalarm', gemeldet === null, JSON.stringify(gemeldet));

// GEGENPROBE: Ohne den Waechter waere Lage B unsichtbar geblieben — genau der
// gemeldete Zustand.
pruef('GEGENPROBE die alte Lage (still, aber kein Streifen) waere erkannt worden',
  (function(){ umgebung.window.rcKpiLastUpdate = new Date(Date.now() - 200 * MIN); tick(); return !!gemeldet; })(),
  gemeldet);

// ============================================================================
console.log('\n' + '='.repeat(60));
console.log('  ' + ok + ' bestanden, ' + fehl + ' fehlgeschlagen.');
console.log('='.repeat(60));
process.exit(fehl ? 1 : 0);
