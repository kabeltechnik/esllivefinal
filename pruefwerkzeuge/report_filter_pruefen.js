/**
 * report_filter_pruefen.js — Standort/Stack/Team-Filter der Stundenmail.
 *
 * Nutzer-Meldung 09.08.:
 *   "Da ich die Reporting fuer E-Mail-Versand in der .cmd datei einstelle kann
 *    ich nicht Standort/Stack/Team filtern. Das Reporting System auf Dashboard
 *    funktioniert nicht."
 *   Praezisiert: "Kein Download, kein Versand. Wenn ich auf Herunterladen klicke
 *    geht es, aber automatisches Herunterladen und Versenden bei Standort/Stack/
 *    Team-Filter geht nicht."
 *
 * Vier Ursachen, alle hier festgenagelt:
 *
 *  A) Der HTML-Report rechnete mit collect() aus rcLetzteStats, Excel und Bilder
 *     mit reportDaten(). Zwei Rechenwege — der TEAM-Filter und der Zeitbezug
 *     wirkten nur auf einen davon.
 *  B) Lieferte der Filter 0 Zeilen, stiegen die Bauer einzeln und WORTLOS aus.
 *     Im Download-Ordner lag dann nur die HTML; esl_mail_report.ps1 fand kein
 *     Bild und brach ab. Kein Download, kein Versand, keine Meldung.
 *  C) Der Konfigurator zeigte "Alle Teams", wenn der gespeicherte Teamname in
 *     der aktuellen Liste fehlte — gefiltert wurde trotzdem. Die Anzeige log.
 *  D) ESL_Start.cmd konnte nur setTo/setCc. Es gab keinen Weg, aus der .cmd
 *     einen Zuschnitt zu setzen, und alle drei Empfaengerkreise teilten sich
 *     zwangslaeufig denselben.
 *
 * Gemessen wird gegen die ECHTEN Funktionen (per Klammerzaehlung ausgeschnitten
 * und mit new Function ausgewertet), nicht gegen Nachbauten.
 *
 *   node pruefwerkzeuge/report_filter_pruefen.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const W = path.join(__dirname, '..');
const lies = n => fs.readFileSync(path.join(W, n), 'utf8');
const dash = lies('esl_live_arena_v22.js');
const cmd  = lies('ESL_Start.cmd');
const mail = lies('esl_mail_report.ps1');

let ok = 0, bad = 0;
function pruef(t, b, z) {
    if (b) { ok++; console.log('  ok   ' + t); }
    else { bad++; console.log('  FEHL ' + t + (z !== undefined ? '  -> ' + z : '')); }
}
function abschnitt(t) { console.log('\n-- ' + t + ' --'); }

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
const schneide = name => schneideAus(dash, 'function ' + name + '(');

console.log('Report-Filter (Standort/Stack/Team) — Pruefung');

// ===========================================================================
abschnitt('A) EINE Datenquelle: HTML, Excel und Bilder rechnen gleich');
// ===========================================================================

const collectSrc  = schneide('collect');
const buildHtmlSrc = schneide('buildHtml');
const downloadSrc = schneide('download');

pruef('collect() nimmt data entgegen (statt sich rcLetzteStats selbst zu holen)',
    /^function collect\(data\)/.test(collectSrc));
pruef('collect() liest data.rows',
    /data\s*&&\s*data\.rows/.test(collectSrc));
// GEGENPROBE: haette diese Regel den alten Zustand erkannt? Der alte collect()
// las agentStats und filterte selbst auf Standort/Stack — ohne Team.
pruef('Gegenprobe: collect() liest KEINE agentStats mehr',
    !/rcLetzteStats/.test(collectSrc) && !/agentStats/.test(collectSrc));
pruef('Gegenprobe: collect() filtert nicht mehr selbst (kein selStd/selStack)',
    !/selStd/.test(collectSrc) && !/selStack/.test(collectSrc));

pruef('buildHtml() nimmt dieselbe data entgegen und reicht sie an collect weiter',
    /^function buildHtml\(dataVor\)/.test(buildHtmlSrc) && /collect\(dataVor\)/.test(buildHtmlSrc));
pruef('download() reicht EINE data an HTML, Excel und beide Bilder',
    /buildHtml\(data\)/.test(downloadSrc) &&
    /buildXlsx\(base,[\s\S]{0,80}?,\s*data\)/.test(downloadSrc) &&
    /buildPng\(base,[\s\S]{0,80}?,\s*data\)/.test(downloadSrc));

// --- funktional: collect() gegen echte Zeilen ---------------------------------
// reportDaten() liefert rows mit z/n-Objekten je Kennzahl. Der HTML-Report muss
// daraus dieselben Summen bilden wie das Excel.
const collectFn = new Function('window', 'reportDaten',
    'return (' + collectSrc.replace(/^function collect/, 'function') + ')');
const zeile = (o) => Object.assign({
    team: 'T1', name: 'A', calls: 0, ahtSec: null,
    aq: { z: null, n: null, v: null }, cs: { z: null, n: null, v: null },
    tnps: { z: null, n: null, v: null }, fq: { z: null, n: null, v: null },
    hasEsl: true, ansp: 0, standort: 'AL', kip: 0, mob: 0, bnt: 0, vvl: 0
}, o);

const testDaten = { rows: [
    zeile({ name: 'Anna', team: 'T1', standort: 'AL', calls: 100, ansp: 40, kip: 2, mob: 1, bnt: 3, vvl: 1,
            cs: { z: 90, n: 100, v: 90 }, tnps: { z: 50, n: 100, v: 50 } }),
    zeile({ name: 'Bert', team: 'T2', standort: 'B',  calls:  50, ansp: 10, kip: 1, mob: 0, bnt: 1, vvl: 0,
            cs: { z: 30, n: 50, v: 60 },  tnps: { z: 10, n: 50, v: 20 } })
] };
const c1 = collectFn({}, () => testDaten)(testDaten);

pruef('Mengen werden schlicht summiert (Calls 100+50)', c1.g.calls === 150, c1.g.calls);
pruef('Ansprachen summiert (40+10)', c1.g.ansp === 50, c1.g.ansp);
pruef('KIP summiert (2+1)', c1.g.kip === 3, c1.g.kip);
// CS wird GEPOOLT, nicht ueber die Calls gemittelt: (90+30)/(100+50) = 80 %.
// Der calls-gewichtete Mittelwert waere (90*100+60*50)/150 = 80 — hier zufaellig
// gleich, deshalb ein zweiter Fall weiter unten, der die beiden trennt.
pruef('CS wird gepoolt: (90+30)/(100+50) = 80 %', Math.round(c1.g.cs) === 80, c1.g.cs);
pruef('TNPS wird gepoolt: (50+10)/150 = 40', Math.round(c1.g.tnps) === 40, c1.g.tnps);

// Trennfall: ein Agent MELDET keine CS (n=0), hat aber viele Calls. Gepoolt
// bleibt CS bei 100 %; calls-gewichtet faellt sie, weil der Nenner aufgeblaeht
// wird. Genau der Fehler, den die alte Fassung machte.
const testNenner = { rows: [
    zeile({ name: 'Cem', calls: 10,  cs: { z: 10, n: 10, v: 100 } }),
    zeile({ name: 'Dana', calls: 990, cs: { z: null, n: 0, v: null } })
] };
const c2 = collectFn({}, () => testNenner)(testNenner);
pruef('Agent ohne CS-Meldung blaeht den CS-Nenner NICHT auf (100 %, nicht 1 %)',
    Math.round(c2.g.cs) === 100, c2.g.cs);

// Ohne Liga-Calls gibt es keine Quote — null, nicht 0 %.
const testOhneCalls = { rows: [ zeile({ name: 'Eda', calls: 0, ansp: 5, bnt: 2 }) ] };
const c3 = collectFn({}, () => testOhneCalls)(testOhneCalls);
pruef('ohne Liga-Calls ist die Ansprachequote null (kein Nenner = keine Quote)',
    c3.g.anspQuote === null, c3.g.anspQuote);
pruef('ohne Liga-Calls ist die BNT-Rate null', c3.g.bntRate === null, c3.g.bntRate);
pruef('die Ansprachen-ZAHL bleibt trotzdem stehen (sie ist echt)', c3.g.ansp === 5, c3.g.ansp);

// Leere Zeilenliste: hasData muss false sein, sonst meldet der Report Erfolg.
const c4 = collectFn({}, () => ({ rows: [] }))({ rows: [] });
pruef('leere Zeilenliste ergibt hasData=false', c4.hasData === false);
pruef('… und keine Standort-Zeilen', c4.standorte.length === 0);

// ===========================================================================
abschnitt('B) 0 Zeilen: sichtbare Meldung statt halbem Dateisatz');
// ===========================================================================

pruef('download() prueft die Zeilenzahl VOR dem Schreiben',
    /var zeilen\s*=\s*\(data && data\.rows\)\s*\?\s*data\.rows\.length\s*:\s*0/.test(downloadSrc));
// Lange [\s\S]{0,N}-Fenster sind sproede und werden beim naechsten Umformulieren
// grundlos rot. Deshalb den Block herausschneiden und SEINEN Inhalt pruefen.
const nullZweig = (() => {
    const s = downloadSrc.indexOf('if(!zeilen){');
    if (s < 0) return '';
    let tiefe = 0, i = downloadSrc.indexOf('{', s);
    for (; i < downloadSrc.length; i++) {
        if (downloadSrc[i] === '{') tiefe++;
        else if (downloadSrc[i] === '}') { tiefe--; if (tiefe === 0) return downloadSrc.slice(s, i + 1); }
    }
    return '';
})();
pruef('… und steigt bei 0 aus, bevor eine Datei entsteht',
    /return st;/.test(nullZweig) && nullZweig.length > 0);
pruef('… ohne im 0-Zweig eine Datei zu schreiben',
    !/\bdl\(/.test(nullZweig) && !/buildXlsx\(/.test(nullZweig) && !/buildPng/.test(nullZweig));
// rcLog.warn zaehlt in diesem Projekt AUSDRUECKLICH nicht als sichtbar.
pruef('… mit SICHTBARER Folge (Toast), nicht nur einem Log',
    /rcToast\(/.test(nullZweig));
// GEGENPROBE: erkennt die Regel den Fall "nur geloggt"? Ja — ohne rcToast im
// Block waere die Zeile darueber rot. Zur Sicherheit gegengemessen:
pruef('Gegenprobe: die Toast-Regel misst wirklich den 0-Zweig, nicht die ganze Datei',
    nullZweig.length < 1500 && nullZweig.indexOf('buildHtml') < 0, nullZweig.length);
pruef('… und der Grund nennt Zuschnitt und Zeitbezug',
    /scopeLabel\(\)\+' · '\+datumLabel\(\)/.test(downloadSrc));

pruef('download() liefert ein Ergebnis-Objekt (nicht nur einen Dateinamen)',
    /window\.rcReportLetzter\s*=\s*st/.test(downloadSrc) && /return st;\s*\}\s*$/.test(downloadSrc.trim()));
// GEGENPROBE: der alte Rueckgabewert war ein blosser String.
pruef('Gegenprobe: das alte "return base+\'.html\';" ist raus',
    !/return base\+'\.html';/.test(downloadSrc));

pruef('erwartet/dateien machen den Fortschritt abfragbar',
    /st\.erwartet\s*=/.test(downloadSrc) && /st\.fertig\s*=/.test(downloadSrc));
// "Erledigt" muss "hat sich entschieden" heissen, nicht "hat geliefert" —
// sonst wartet ESL_Start.cmd bei einer Teilstoerung bis zum Zeitlimit.
pruef('ein Bauer, der NICHTS liefert, gilt trotzdem als erledigt',
    /var erledigt\s*=\s*function\(endung,\s*fn\)\{[\s\S]{0,200}?delete offen\[endung\]/.test(downloadSrc));
pruef('das Vertriebsbild wird nur erwartet, wenn es ESL-Zeilen dafuer gibt',
    /hatVertrieb\s*\?\s*\['-vertrieb\.png'\]\s*:\s*\[\]/.test(downloadSrc));

// --- die Rueckrufe muessen IMMER feuern -------------------------------------
const pngRahmenSrc = schneide('pngRahmen');
pruef('pngRahmen: Rueckruf feuert genau einmal (Riegel gegen Doppelaufruf)',
    /var raus=false;/.test(pngRahmenSrc) && /if\(raus\) return; raus=true;/.test(pngRahmenSrc));
// Der Zeichenteil laeuft asynchron aus holeLogo und liegt damit AUSSERHALB des
// try von buildPng — ohne eigenes catch feuerte cb bei einem Fehler nie.
pruef('pngRahmen: der asynchrone Zeichenteil hat ein eigenes catch',
    /holeLogo\(function\(logo\)\{\s*try\{/.test(pngRahmenSrc) &&
    /\}catch\(e\)\{[\s\S]{0,200}?fertig\(null\);/.test(pngRahmenSrc));
pruef('Gegenprobe: kein nackter cb-Aufruf mehr im toBlob-Zweig',
    !/cb&&cb\(blob\?dateiName:null\)/.test(pngRahmenSrc));

const buildXlsxSrc = schneide('buildXlsx');
pruef('buildXlsx: die Promise-Kette endet mit catch (sonst feuert cb nie)',
    /\.then\(function\(fertig\)\{[\s\S]{0,400}?\}\)\s*\n?[\s\S]{0,400}?\.catch\(function\(e\)\{[\s\S]{0,200}?cb&&cb\(null\)/.test(buildXlsxSrc));

const buildRepSrc = schneide('buildReportingXlsx');
pruef('buildReportingXlsx nimmt einen Rueckruf entgegen',
    /^function buildReportingXlsx\(base, data, cb\)/.test(buildRepSrc));
pruef('… und feuert ihn auch beim Aufgeben (kein wortloses return mehr)',
    (buildRepSrc.match(/fertig\(null\)/g) || []).length >= 3);
pruef('… und meldet den fachlichen Grund im Klartext',
    /keine Liga-Calls im Filter/.test(buildRepSrc));

// Der Stundentakt darf eine Stunde nicht spurlos verbrauchen.
pruef('Stundentakt: ein Wurf hinterlaesst einen sichtbaren Zustand',
    /rcReportInterval=setInterval\([\s\S]{0,1200}?catch\(e\)\{[\s\S]{0,400}?rcReportLetzter/.test(dash));
pruef('Gegenprobe: das leere catch im Stundentakt ist raus',
    !/CFG\.lastHourKey=hk; save\(\); download\(\); \} \}catch\(e\)\{\}/.test(dash));

// ===========================================================================
abschnitt('C) Konfigurator: die Anzeige darf den Filter nicht verschweigen');
// ===========================================================================

pruef('ein gespeicherter Wert, den die Liste nicht kennt, wird als Option eingehaengt',
    /_fehlOpt\s*=\s*function\(wert, vorhanden\)/.test(dash) &&
    /nicht in den aktuellen Daten/.test(dash));
pruef('… fuer Standort, Stack UND Team',
    /_fehlOpt\(rc\.std,/.test(dash) && /_fehlOpt\(rc\.stack,/.test(dash) && /_fehlOpt\(rc\.team,/.test(dash));

// Zwei-Listen-Falle: JEDES Feld braucht einen Eintrag beim Aufbau UND im
// change-Handler. Fehlt der zweite, laesst es sich umlegen, aber nicht speichern.
const felder = ['cfgRepStd','cfgRepStack','cfgRepTeam','cfgRepDatum','cfgRepVon','cfgRepBis',
                'cfgRepAuto','cfgRepRepMappe','cfgRepTo','cfgRepCc','cfgRepSubj','cfgRepNow'];
felder.forEach(f => {
    // Zwei Bauarten im Aufbau: Eingabefelder tragen id="...", Schalter entstehen
    // ueber den Helfer swc('...'). Nur auf id="..." zu pruefen meldete die beiden
    // Schalter faelschlich als fehlend — das war ein Messfehler des Werkzeugs,
    // nicht ein Fehler im Dashboard.
    const imAufbau  = new RegExp('id="' + f + '"').test(dash) ||
                      new RegExp("swc\\('" + f + "'").test(dash);
    const imHandler = new RegExp("q\\('" + f + "'\\)").test(dash);
    pruef('Zwei-Listen-Falle: ' + f + ' steht in Aufbau UND Handler',
        imAufbau && imHandler, 'Aufbau=' + imAufbau + ' Handler=' + imHandler);
});
// GEGENPROBE: erkennt die Regel ein Feld, das nur im Handler haengt? Ein Name,
// den es nirgends gibt, muss durchfallen — sonst prueft sie nichts.
pruef('Gegenprobe: ein erfundener Feldname faellt durch',
    !(/id="cfgRepGibtEsNicht"/.test(dash) || /swc\('cfgRepGibtEsNicht'/.test(dash)));
pruef('das CC-Feld schreibt wirklich in CFG.cc (nicht nur ins Formular)',
    /cfgRepCc'\),'input',function\(e\)\{[\s\S]{0,120}?cfg\.cc=e\.target\.value/.test(dash));
pruef('CFG.cc landet im ESLMAIL-Marker, den das Mailskript liest',
    /ESLMAIL to="'\+esc\(CFG\.to\|\|''\)\+'" cc="'\+esc\(CFG\.cc\|\|''\)/.test(dash));

pruef('die Trefferzahl des Zuschnitts wird angezeigt',
    /id="cfgRepZeilen"/.test(dash) && /repZeilenZeigen/.test(dash));
pruef('… und nach jeder Filteraenderung neu gerechnet',
    (dash.match(/save\(\); repZeilenZeigen\(\);/g) || []).length >= 6);

// ===========================================================================
abschnitt('D) Export-Dialog: Team-Filter und ehrliche Rueckmeldung');
// ===========================================================================

pruef('der Dialog hat ein Team-Dropdown',
    /id="rcExWahlTeam"/.test(dash) && /const teamSel = \(function\(\)/.test(dash));
pruef('scopeAus() reicht das Team durch',
    /team:\s*\(document\.getElementById\('rcExWahlTeam'\)\s*\|\|\s*\{\}\)\.value\s*\|\|\s*'ALL'/.test(dash));
// GEGENPROBE: vorher stand dort ein hartes 'ALL'.
pruef("Gegenprobe: das harte \"team: 'ALL'\" ist raus",
    !/stack:\s*\(document\.getElementById\('rcExWahlStack'\)[^\n]*\n\s*team:\s*'ALL'/.test(dash));

// alert() blockiert jedes Runtime.evaluate der Fernsteuerung — der Starter
// fragt im 20-s-Takt ab und stuende bis zum Wegklicken still.
['rcExportReporting','rcExportStandZeitraum','rcExportReportingAlle'].forEach(fn => {
    const src = schneideAus(dash, 'window.' + fn + ' = function(');
    // Seit 17.08. ist der Rueckfall rcSagen (Toast) statt alert: ein alert()
    // haelt die ganze Seite an und blockiert obendrein jedes Runtime.evaluate
    // der Fernsteuerung. Geprueft wird weiter dasselbe - dass es einen
    // Melde-Kanal GIBT und der Rueckfall nicht blockiert.
    pruef(fn + ' nimmt einen Melde-Kanal entgegen (nicht blockierend)',
        /const sag = melden \|\| function\(t\)\{ window\.rcSagen\(t\); \};/.test(src) &&
        !/const sag = melden \|\| function\(t\)\{ alert\(t\); \};/.test(src));
    pruef(fn + ' benutzt sag() fuer die Abbruchgruende',
        /sag\([^\n]*true\)/.test(src));
});
pruef('der Dialog reicht seine Statuszeile herein',
    /rcExportReporting\(b\.von, b\.bis, scopeAus\(\), sagen\)/.test(dash) &&
    /rcExportStandZeitraum\(b\.von, b\.bis, scopeAus\(\), true, sagen, wahlAus\(\)\)/.test(dash) &&   // wahl seit 14.08. (Excel-Haekchen)
    /rcExportReportingAlle\(b\.von, b\.bis, sagen\)/.test(dash));
pruef('"Fertig" wird erst nach dem tatsaechlichen Speichern gemeldet',
    /rcXlsxSpeichern\(XL, wb, fn, 'Vertrieb Reporting'\)\s*\n\s*\.then\(\(\) => sag\('Fertig/.test(dash));
// GEGENPROBE: vorher meldete der Dialog "Fertig" unbedingt.
pruef('Gegenprobe: das unbedingte "Fertig" im Bericht-Knopf ist raus',
    !/rcExportStandZeitraum\(b\.von, b\.bis, scopeAus\(\)\);\s*\n\s*sagen\('Fertig/.test(dash));

// Die Reporting-Mappe baut die Stand-Blaetter nicht und erbte deshalb deren
// Logo-Anker aus dem vorigen Lauf — das Logo landete auf einem Blatt, das es
// in dieser Mappe gar nicht gibt.
pruef('rcLogoAnkerLeeren existiert als Funktionsdeklaration (TDZ-Regel)',
    /function rcLogoAnkerLeeren\(\)\{ rcLogoAnker = \[\]; \}/.test(dash) &&
    !/(const|let|var)\s+rcLogoAnkerLeeren\s*=/.test(dash));
pruef('… und wird in allen DREI Reporting-Mappen-Bauern gerufen',
    (dash.match(/rcLogoAnkerLeeren\(\)/g) || []).length >= 3);

// ===========================================================================
abschnitt('E) Dashboard-Setter fuer die Fernsteuerung');
// ===========================================================================

pruef('rcReport.setScope ist vorhanden',
    /setScope:setScope/.test(dash) && /function setScope\(o\)\{/.test(dash));
pruef('rcReport.setDatum ist vorhanden', /setDatum:function\(modus, von, bis\)/.test(dash));
pruef('rcReport.setReportingMappe ist vorhanden', /setReportingMappe:function\(v\)/.test(dash));
pruef('rcReport.zeilen ist vorhanden', /zeilen:zeilenImFilter/.test(dash));
pruef('rcReport.status liefert den letzten Lauf', /status:function\(\)\{ return window\.rcReportLetzter\|\|null; \}/.test(dash));

// --- funktional: setScope gegen die echte Funktion --------------------------
const setScopeSrc = schneide('setScope');
let gespeichert = 0;
const CFG = { std: 'ALL', stack: 'ALL', team: 'ALL' };
const setScopeFn = new Function('CFG', 'save', 'zeilenImFilter', 'scopeLabel',
    'return (' + setScopeSrc.replace(/^function setScope/, 'function') + ')')(
    CFG, () => { gespeichert++; }, () => 7, () => 'label');

let r = setScopeFn({ std: 'AL' });
pruef('setScope setzt den Standort', CFG.std === 'AL', CFG.std);
pruef('… und laesst Stack/Team unberuehrt', CFG.stack === 'ALL' && CFG.team === 'ALL');
pruef('… speichert', gespeichert === 1, gespeichert);
pruef('… und meldet die Trefferzahl zurueck', r.zeilen === 7, r.zeilen);

setScopeFn({ stack: '' });
pruef('leerer String bedeutet "kein Filter" (ALL), nicht "Stack mit leerem Namen"',
    CFG.stack === 'ALL', CFG.stack);
setScopeFn({ team: '  VKD-TECH-83  ' });
pruef('Leerzeichen werden abgeschnitten (sonst trifft der Vergleich nie)',
    CFG.team === 'VKD-TECH-83', CFG.team);
setScopeFn({});
pruef('ein leeres Objekt aendert nichts', CFG.std === 'AL' && CFG.team === 'VKD-TECH-83');
setScopeFn({ std: null, stack: undefined });
pruef('null/undefined lassen den Wert stehen (nicht "auf ALL zuruecksetzen")',
    CFG.std === 'AL' && CFG.stack === 'ALL', CFG.std + '/' + CFG.stack);

pruef('rcReportLetzter steht in der Clean-State-Liste (Re-Inject)',
    /window\.rcReportLetzter = null;/.test(dash));

// ===========================================================================
abschnitt('F) ESL_Start.cmd: eigener Zuschnitt je Empfaengerkreis');
// ===========================================================================

// Erste Frage immer: wird es ueberhaupt aufgerufen? (Fehlerklasse "gebaut,
// aber nirgends gerufen" — genau so lag esl_mail_report.ps1 tagelang brach.)
pruef('SchickeStundenmail wird aus der Dauerschleife aufgerufen',
    /SchickeStundenmail \$alle/.test(cmd));

['$MailStandort','$MailStack','$MailTeam','$MailReportingMappe',
 '$MailStandortLeitung','$MailStackLeitung','$MailTeamLeitung','$MailReportingMappeLeitung',
 '$MailStandortTeams','$MailStackTeams','$MailTeamTeams','$MailReportingMappeTeams'].forEach(v => {
    const def  = new RegExp('\\' + v + '\\s*=', 'm').test(cmd);
    // Benutzt heisst: kommt AUSSERHALB der eigenen Zuweisungszeile noch einmal vor.
    const anzahl = (cmd.match(new RegExp('\\' + v + '\\b', 'g')) || []).length;
    pruef('Stellschraube ' + v + ' ist gesetzt UND wird benutzt',
        def && anzahl >= 2, 'def=' + def + ' vorkommen=' + anzahl);
});

const schickeSrc = (() => {
    const s = cmd.indexOf('function SchickeStundenmail(');
    const e = cmd.indexOf('\n# EIN Stueck JavaScript', s);
    return cmd.slice(s, e > s ? e : s + 12000);
})();

pruef('die Kreise werden als Liste gebaut (Mannschaft/Leitung/Kanal)',
    /\$kreise \+= @\{ Modus = 'team'/.test(cmd) &&
    /\$kreise \+= @\{ Modus = 'leitung'/.test(cmd) &&
    /\$kreise \+= @\{ Modus = 'kanal'/.test(cmd));
pruef('je Kreis wird setScope am Dashboard gerufen',
    /r\.setScope\(\{std:/.test(cmd));
pruef('… und setReportingMappe',
    /r\.setReportingMappe\(/.test(cmd));
pruef('die Trefferzahl kommt aus dem Dashboard zurueck ("ok:<zeilen>:<label>")',
    /return "ok:"\+s\.zeilen\+":"\+s\.label;/.test(cmd));
pruef('ein Zuschnitt mit 0 Zeilen wird GEMELDET und uebersprungen',
    /if \(\$zeilen -eq 0\)/.test(cmd) && /trifft 0 Zeilen - kein Report, keine Mail/.test(cmd));
// GEGENPROBE: frueher lief der Versand hier einfach weiter.
pruef('Gegenprobe: der alte "frischer Report liegt bereits vor"-Kurzschluss ist raus',
    !/frischer Report liegt bereits vor/.test(cmd));
pruef('gleiche Zuschnitte teilen sich EINEN Report-Lauf',
    /\$kennung -eq \$letzteKennung/.test(cmd));
pruef('gewartet wird auf rcReport.status().fertig, nicht auf "neueste Datei"',
    /window\.rcReport\.status\(\)/.test(cmd) && /s\.fertig\?"fertig:":"laeuft:"/.test(cmd));
pruef('der Dateisatz wird als -Stamm an das Mailskript uebergeben',
    /EinMailLauf \$skript \$k\.Modus \$k\.Arg \$k\.Betreff \$k\.Text \$stamm/.test(cmd) &&
    /if \(\$stamm\)\s*\{ \$argumente \+= @\('-Stamm',/.test(cmd));
pruef('ein aelteres Dashboard ohne setScope wird erkannt und benannt',
    /aeltere Fassung ohne Filter-Setter/.test(cmd));
pruef('der Zuschnitt wird beim Start genannt (falsch getippt faellt sonst nicht auf)',
    /Mannschaft \(\$MailAn\):/.test(cmd));

// ===========================================================================
abschnitt('G) esl_mail_report.ps1: -Stamm pinnt den Dateisatz');
// ===========================================================================

pruef('-Stamm ist ein Parameter', /\[string\]\$Stamm = ""/.test(mail));
pruef('mit -Stamm wird genau dieser Satz genommen',
    /\$sPfad = Join-Path \$Ordner \(\$Stamm \+ '\.html'\)/.test(mail));
// Ein stiller Rueckfall auf "die neueste Datei" hiesse: falscher Zuschnitt an
// die falschen Empfaenger, ohne dass es jemandem auffaellt.
pruef('fehlt der angeforderte Satz, wird abgebrochen statt auszuweichen',
    /Der angeforderte Report-Satz fehlt/.test(mail) &&
    /if \(-not \(Test-Path -LiteralPath \$sPfad\)\) \{[\s\S]{0,300}?Ende 1/.test(mail));
pruef('ohne -Stamm bleibt das alte Verhalten (neueste Datei)',
    /\} else \{\s*\n\s*\$datei = Get-ChildItem -LiteralPath \$Ordner -Filter 'ESL-Report-\*\.html'/.test(mail));
pruef('alle Anhaenge haengen weiterhin am BaseName dieses Satzes',
    /\$stamm\s*=\s*\$datei\.BaseName/.test(mail));

// ===========================================================================
console.log('\n' + (bad === 0 ? '  ' : '  ') + ok + ' bestanden, ' + bad + ' fehlgeschlagen.');
process.exit(bad === 0 ? 0 : 1);
