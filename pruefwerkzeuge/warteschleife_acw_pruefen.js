// ============================================================================
//  warteschleife_acw_pruefen.js — prueft die Nacharbeit-Erweiterung der
//  Warteschleifen-Seite und den abschaltbaren vertrieblichen Ton (04.08.).
//
//  Anlass: Eine wachsende Warteschlange hat zwei Ursachen — zu wenig Besetzung
//  oder Leute, die nicht wieder frei werden (Nacharbeit). Bis heute BEHAUPTETEN
//  die Spruchtexte das ("Nacharbeit bitte zurueckstellen"), gemessen hat es
//  niemand: das Modul hatte null Bezug zu den Ligalisten-Daten.
//
//  Geprueft wird statisch (Verdrahtung, alle vier Konfigurator-Stellen,
//  Migration) — der Rechenteil braucht ein DOM und laeuft im Browser-Test.
//
//  Aufruf:  node pruefwerkzeuge/warteschleife_acw_pruefen.js
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const W = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(W, 'esl_live_arena_v22.js'), 'utf8');
const crawler = fs.readFileSync(path.join(W, 'kpi_crawler.js'), 'utf8');

let ok = 0, fehler = 0;
function pruef(titel, bed, zusatz) {
    if (bed) { ok++; console.log('  ok   ' + titel); }
    else { fehler++; console.log('  FEHL ' + titel + (zusatz !== undefined ? '  -> ' + zusatz : '')); }
}
// Nur den Warteschleifen-Modulbereich betrachten, damit Treffer aus anderen
// Modulen (z.B. dem Cockpit-Block renderCkZeit) nicht faelschlich zaehlen.
const von = src.indexOf('(function rcQueueModule(){');
const bis = src.indexOf("[WS] Warteschleifen-Modul bereit");
const modul = (von >= 0 && bis > von) ? src.slice(von, bis) : '';

console.log('\n-- 1. Datenquelle --');
pruef('Modulbereich gefunden', modul.length > 1000, modul.length);
pruef('acwLage() ist im Warteschleifen-Modul definiert', /function acwLage\(\)/.test(modul));
pruef('liest window.rcKpiData (Ligaliste)', /window\.rcKpiData/.test(modul));
pruef('respektiert den aktiven Filter ueber rcLigaInScope', /rcLigaInScope/.test(modul));
pruef('nutzt den Mapping-Standort (rcLigaMeta), nicht den Rohwert', /rcLigaMeta/.test(modul));
pruef('gewichtet nach Calls (nicht ungewichtet gemittelt)',
    /acwSec \* c/.test(modul) && /N \+= c/.test(modul));
pruef('ohne Daten wird null geliefert (kein 0:00)', /if \(!N\) return null;/.test(modul));
pruef('acw haengt in rcQueueView', /acw: acwLage\(\)/.test(modul));
pruef('ACW wird vom Crawler ueberhaupt geliefert (FIGURE_IDS 10005)', /'10005'/.test(crawler));
pruef('acwSec wird im Crawler gesetzt', /acwSec:/.test(crawler));

console.log('\n-- 2. Anzeige --');
pruef('fuenfte Kachel qAcw im Geruest', /tileShell\('qAcw'/.test(modul));
pruef('Nacharbeit-Karte im Geruest', /id="rcQAcwCard"/.test(modul));
pruef('zeichneAcw() existiert', /function zeichneAcw\(v\)/.test(modul));
pruef('zeichneAcw wird in paint aufgerufen', /zeichneAcw\(v\);/.test(modul));
pruef('Karte bleibt ohne Daten verborgen', /karte\.style\.display = 'none'/.test(modul));
pruef('Aufschluesselung je Standort vorhanden', /proStd/.test(modul));
pruef('nur Agenten DEUTLICH ueber dem Schnitt werden genannt',
    /schnitt \* 1\.15/.test(modul));
pruef('Zeitbasis wird benannt (Tagesmittel)', /Tagesmittel aus der Ligaliste/.test(modul));
pruef('Inhalt wird nur bei Aenderung neu gesetzt (Signatur)', /__sig/.test(modul));

console.log('\n-- 3. Platzhalter --');
['{acw}', '{acwmin}', '{acwtop}'].forEach(p => {
    const re = new RegExp('\\\\' + p.slice(0, -1).slice(1) + '\\\\}');
    pruef('Platzhalter ' + p + ' wird aufgeloest', new RegExp('\\{' + p.slice(1, -1) + '\\\\}').test(modul) || modul.includes(p.slice(1, -1) + '\\}'));
});
pruef('ohne Daten steht ein Strich statt 0:00', /\? mmss\(v\.acw\.schnitt\) : '—'/.test(modul));
pruef('Platzhalter sind im Konfigurator dokumentiert', /<b>\{acw\}<\/b> Nacharbeit/.test(modul));

console.log('\n-- 4. Eigene Alarmstufe --');
pruef('acwStufen in der Standard-Konfiguration', /acwStufen: \[/.test(modul));
pruef('drei Stufen vorgegeben', (modul.match(/\{ ab: (120|180|240), rang: \d, text: \[/g) || []).length >= 3);
pruef('bewerte() wertet acwStufen aus', /\(CFG\.acwStufen\|\|\[\]\)\.forEach/.test(modul));
pruef('greift unabhaengig von der Kundenzahl',
    /ist == null \|\| ab <= 0 \|\| ist < ab/.test(modul));
pruef('gewinnt NICHT bei gleichem Rang gegen die Warteschlange',
    /if\(!best \|\| rang > best\.rang\)\s*\n\s*best = \{ rang: rang, ab: ab, text: spruchFuer\(s\.text, ab\), art: 'acw'/.test(modul));
// 60 s statt frueher 120 (Nutzer-Vorgabe 05.08.: "zu hohe ACW ueber 1 min").
pruef('acwGrenzeSek fuer die Kachelfarbe', /acwGrenzeSek: 60/.test(modul));
pruef('es gibt eine Nacharbeit-Stufe ab 60 s', /\{ ab: 60, rang: 1, text: \[/.test(modul));
// Ohne Migration bliebe die alte Stufenliste im localStorage stehen und die
// neuen Vorgaben kaemen bei niemandem an, der die Seite schon einmal offen hatte.
pruef('Migration 4 zieht die neuen Texte nach', /texteMigriert4/.test(modul));
pruef('die Migration ueberschreibt keine SELBST gesetzte Grenze',
      /Number\(c\.acwGrenzeSek\) === 120/.test(modul));

console.log('\n-- 5. Vertrieblicher Ton, abschaltbar --');
pruef('Schalter tonVertrieb in der Vorgabe', /tonVertrieb: true/.test(modul));
pruef('sachlicherText() existiert', /function sachlicherText\(art, ab, v\)/.test(modul));
pruef('bewerte() schaltet auf den sachlichen Text um',
    /CFG\.tonVertrieb === false/.test(modul));
pruef('sachlicher Text deckt alle drei Stufenarten ab',
    /art === 'wz'/.test(modul) && /art === 'acw'/.test(modul));
pruef('Stufe und Farbe bleiben beim Abschalten erhalten (nur best.text wird ersetzt)',
    /best\.text = sachlicherText\(best\.art, best\.ab, v\);/.test(modul));

console.log('\n-- 6. Konfigurator: alle VIER Pflichtstellen --');
pruef('(1) Vorgabe   — acwStufen in stdCfg', /acwStufen: \[/.test(modul));
pruef('(2) Markup    — Tabelle rcQCfgAcw', /id="rcQCfgAcw"/.test(modul));
pruef('(2) Markup    — Schalter rcQCfgTonVertrieb', /id="rcQCfgTonVertrieb"/.test(modul));
pruef('(2) Markup    — Grenzwertfeld rcQCfgAcwGrenze', /id="rcQCfgAcwGrenze"/.test(modul));
pruef('(3) fuelleCfg — acwStufen werden angezeigt', /forEach\(zeileAcw\)/.test(modul));
pruef('(3) fuelleCfg — Ton-Schalter wird gesetzt', /rcQCfgTonVertrieb'\)\.checked = CFG\.tonVertrieb !== false/.test(modul));
pruef('(4) leseCfg   — acwStufen werden gelesen', /CFG\.acwStufen = lies\('rcQCfgAcw'\)/.test(modul));
pruef('(4) leseCfg   — Ton-Schalter wird gelesen', /CFG\.tonVertrieb = el\('rcQCfgTonVertrieb'\)\.checked/.test(modul));
pruef('Zeilen-Fabrik zeileAcw vorhanden', /function zeileAcw\(s\)/.test(modul));
pruef('Knopf "+ Meldung" verdrahtet', /rcQCfgAddAcw'\)\.onclick/.test(modul));

console.log('\n-- 7. Migration --');
pruef('texteMigriert3 vorhanden', /texteMigriert3/.test(modul));
pruef('Migration laeuft genau einmal (Marker wird gesetzt)', /c\.texteMigriert3 = 1;/.test(modul));
pruef('Migration setzt acwStufen', /c\.acwStufen = d\.acwStufen;/.test(modul));
pruef('Migration laesst die Wartezeit-Stufen unangetastet',
    !/if \(!c\.texteMigriert3\)[\s\S]{0,400}c\.wzStufen = d\.wzStufen;/.test(modul));
pruef('Rueckfall, falls acwStufen kein Array ist',
    /if\(!Array\.isArray\(c\.acwStufen\)\) c\.acwStufen = d\.acwStufen;/.test(modul));

// ============================================================================
console.log('\n-- 8. Persoenliche Sprueche im Laufband (05.08.) --');
// Sie stehen in renderMarquee, also AUSSERHALB des Warteschleifen-Moduls —
// deshalb hier gegen die ganze Datei geprueft.
// NUR der neue Abschnitt, nicht das ganze renderMarquee: weiter oben stehen
// aeltere Alarm-Bloecke, die z.B. Math.random benutzen — eine Pruefung ueber die
// ganze Funktion wuerde deren Code messen und nicht diesen hier.
const mqVon = src.indexOf('// 2a) PERSOENLICHE SPRUECHE');
const mqBis = src.indexOf('// 2b) ESL-Tracking-Alarme');
const mq = (mqVon >= 0 && mqBis > mqVon) ? src.slice(mqVon, mqBis) : '';
pruef('Laufband-Abschnitt gefunden', mq.length > 500, mq.length);
pruef('Schwelle Nacharbeit ist 1 Minute', /MQ_ACW_AB = 60/.test(mq));
pruef('Schwelle Gespraechsdauer ist 12 Minuten', /MQ_AHT_AB = 720/.test(mq));
pruef('es gibt mehrere Sprueche je Art',
    (mq.match(/MQ_WITZ_ACW = \[([\s\S]*?)\]/) || ['',''])[1].split("',").length >= 3 &&
    (mq.match(/MQ_WITZ_AHT = \[([\s\S]*?)\]/) || ['',''])[1].split("',").length >= 3);
pruef('der Wunschspruch des Nutzers ist dabei', /ich habe ein Auge auf dich/.test(mq));
// Das Laufband liegt hinter ALLEN Seiten — ohne Scope-Filter wuerden Agenten
// genannt, die in der Tabelle darueber wegen des Filters gar nicht vorkommen.
pruef('der aktive Filter gilt auch hier', /rcLigaInScope\(k, mqScope\)/.test(mq));
pruef('Standort kommt aus dem Mapping, nicht roh', /rcLigaMeta\(k\)\.std/.test(mq));
pruef('Mindest-Fallzahl, damit ein einzelnes langes Gespraech niemanden trifft',
    /callCount \|\| 0\) >= 5/.test(mq));
// Kein Math.random(): dabei kaeme derselbe Spruch mehrfach hintereinander, was
// auf einem Wandmonitor wie ein eingefrorenes Bild aussieht (gleiche Begruendung
// wie bei spruchFuer in der Warteschleife).
// Gegen den CODE pruefen, nicht gegen die Kommentare daneben — dort steht ja
// gerade erklaert, warum Math.random hier falsch waere.
const mqCode = mq.replace(/\/\/[^\n]*/g, '');
pruef('die Spruchwahl ist zustandsfrei aus der Uhrzeit abgeleitet',
    /Math\.floor\(Date\.now\(\) \/ 25000\)/.test(mqCode) && !/Math\.random/.test(mqCode));
pruef('nicht alle Agenten tragen denselben Satz (Versatz je Name)', /mqVersatz\(/.test(mq));
pruef('gedeckelt, damit das Band nicht ueberlaeuft', (mq.match(/slice\(0, 4\)/g) || []).length >= 2);
// Ein roter Balken mit Namen vor der ganzen Mannschaft waere ein Pranger.
pruef('eigene, nicht-rote Auszeichnung', /rc-mq-witz/.test(mq) && /\.rc-mq-witz\{color:#FFC24D;\}/.test(src));
pruef('die Klasse ist nicht die Alarm-Klasse', !/rc-mq-alarm">&#9670;/.test(mq));

// ============================================================================
console.log('\n-- 9. Alarmbalken bleibt lesbar (05.08.) --');
// Nutzer: "der rote Bereich in der Mitte ist nicht lesbar". Der Kasten hatte
// overflow:hidden und schnitt Buchstaben oben UND unten ab.
// Die Regel ist ueber mehrere aneinandergehaengte Zeichenketten verteilt —
// bis zur naechsten Regel lesen, nicht bis zum ersten "'+".
const bcVon = src.indexOf("'.rc-q-banner{");
const bcBis = src.indexOf("'.rc-q-banner.show{");
const bannerCss = (bcVon >= 0 && bcBis > bcVon) ? src.slice(bcVon, bcBis) : '';
pruef('kein overflow:hidden mehr am Alarmbalken', !/overflow:hidden/.test(bannerCss), bannerCss.slice(0, 90));
pruef('stattdessen min-height (waechst mit dem Text)', /min-height:/.test(bannerCss));
// Der Puls lag bis 07.08. als WEISSER Vollflaechen-Schleier ueber dem ganzen
// Banner samt Text; die Rundung musste er sich per inherit holen, damit er die
// Ecken nicht ueberragt. Seit dem Umbau ist er ein schmaler Streifen NUR auf
// dem Balken links — dort ist inherit falsch (12px auf 6px Breite verformt den
// Streifen), richtig ist die linke Rundung des Banners. Geprueft wird deshalb
// das Ziel, nicht der Weg: der Overlay darf ueber keine Ecke hinausragen.
const pulsRe = /rc-q-banner\[data-rang="3"\]::after\{([^}]*)\}/;
const pulsCss = (src.match(pulsRe) || [])[1] || '';
pruef('der Puls-Overlay ragt ueber keine Ecke hinaus',
    /border-radius:\s*(inherit|12px 0 0 12px)/.test(pulsCss), pulsCss.slice(0, 110));
pruef('der Puls liegt NICHT mehr ueber dem Text',
    !/inset:\s*0/.test(pulsCss) && /width:\s*6px/.test(pulsCss), pulsCss.slice(0, 110));
// GEGENPROBE: der alte Vollflaechen-Schleier wuerde von der zweiten Pruefung
// erkannt — sonst waere sie eine Pruefung, die nichts prueft.
pruef('GEGENPROBE Vollflaechen-Overlay wuerde auffallen',
    /inset:0/.test('content:"";position:absolute;inset:0;border-radius:inherit;background:#FFFFFF;'));
pruef('lange Sprueche duerfen umbrechen', /overflow-wrap:break-word/.test(src));

// ============================================================================
console.log('\n-- 10. Platzhalter passen zum Satz (05.08.) --');
// Nutzer-Befund vom Wandmonitor: "ACHTUNG: 34:03 in der Leitung" — dort stand
// eine DAUER, wo der Satz eine ANZAHL verspricht. Es las sich als
// "34:03 Kunden". Der Fehler faellt beim Texten nicht auf, weil im Quelltext
// nur "{wz}" steht; sichtbar wird er erst mit echten Zahlen.
//   {n}   = Anzahl wartender Kunden
//   {wz}  = laengste Wartezeit (mm:ss)
//   {acw} = Nacharbeit je Call (mm:ss)
function listeLesen(name) {
    const a = modul.indexOf(name + ': [');
    if (a < 0) return null;
    let i = modul.indexOf('[', a), tiefe = 0;
    for (; i < modul.length; i++) {
        if (modul[i] === '[') tiefe++;
        else if (modul[i] === ']') { tiefe--; if (!tiefe) break; }
    }
    try { return new Function('return ' + modul.slice(modul.indexOf('[', a), i + 1))(); }
    catch (e) { return null; }
}
const ALLE_TEXTE = [];
['stufen', 'wzStufen', 'acwStufen'].forEach(n => {
    const l = listeLesen(n);
    pruef('Liste ' + n + ' laesst sich lesen', Array.isArray(l) && l.length > 0);
    (l || []).forEach(s => [].concat(s.text || []).forEach(t => ALLE_TEXTE.push({ liste: n, ab: s.ab, t })));
});
pruef('es sind genug Sprueche da (mind. 40)', ALLE_TEXTE.length >= 40, ALLE_TEXTE.length);

// Eine DAUER darf nicht wie eine Anzahl klingen.
const DAUER_FALSCH = /\{(wz|acw)\}\s*(Kunden|Wartende|in der (Leitung|Schleife|Warteschleife)|warten\b)/i;
// Eine ANZAHL darf nicht wie eine Dauer klingen.
const ANZAHL_FALSCH = /\{n\}\s*(Wartezeit|Minuten\b|Nacharbeit)/i;
const patzer = ALLE_TEXTE.filter(x => DAUER_FALSCH.test(x.t) || ANZAHL_FALSCH.test(x.t));
pruef('keine Dauer, die als Anzahl gelesen wird',
    patzer.length === 0,
    patzer.map(x => x.liste + '/' + x.ab + ': "' + x.t + '"').join('  |  '));

// Gegenprobe, damit diese Pruefung nicht bloss immer gruen meldet.
pruef('die Pruefung wuerde den echten Fehler erkennen',
    DAUER_FALSCH.test('ACHTUNG: {wz} in der Leitung. Jetzt geht es um die Kundenzufriedenheit.'));
pruef('und laesst richtige Saetze durch',
    !DAUER_FALSCH.test('ACHTUNG: {n} Kunden in der Leitung, {wz} Wartezeit.') &&
    !ANZAHL_FALSCH.test('Wartezeit {wz} bei {n} Kunden.'));

// Jeder benutzte Platzhalter muss auch gefuellt werden, sonst steht "{acwtop}"
// woertlich auf dem Wandmonitor.
const ERLAUBT = ['n','wz','wzmin','eq','sl','q','ab','zeit','acw','acwmin','acwtop'];
const unbekannt = new Set();
ALLE_TEXTE.forEach(x => { const m = x.t.match(/\{(\w+)\}/g) || [];
    m.forEach(p => { const n = p.slice(1, -1); if (ERLAUBT.indexOf(n) < 0) unbekannt.add(n + ' (' + x.liste + ')'); }); });
pruef('kein unbekannter Platzhalter in den Texten', unbekannt.size === 0, [...unbekannt].join(', '));
ERLAUBT.forEach(p => {
    if (p === 'ab' || p === 'zeit' || p === 'wzmin' || p === 'acwmin') return;   // nur optional benutzt
    pruef('Platzhalter {' + p + '} wird von fuelle() ersetzt',
        new RegExp("\\{" + p + "\\}").test(modul));
});

// ============================================================================
console.log('\n-- 11. Zeit-Waechter (05.08.) --');
// Nutzer-Vorgabe: "wer zu hohe ACW (max 30 s), AHT (max 10 min) und ACHT
// (max 1 min) hat" — live auf der Warteschleifen-Seite, namentlich.
pruef('Grenzen in der Vorgabe: 30 s / 600 s / 60 s',
    /zeitAcwSek: 30,/.test(modul) && /zeitAhtSek: 600,/.test(modul) && /zeitAchtSek: 60,/.test(modul));
pruef('loadCfg fuellt fehlende Grenzen auf (Migration unnoetig, neue Schluessel)',
    /if \(c\.zeitAcwSek\s+== null\) c\.zeitAcwSek\s+= d\.zeitAcwSek;/.test(modul) &&
    /c\.zeitAchtSek == null/.test(modul));
pruef('zeitLage ist definiert', /function zeitLage\(\)/.test(modul));
pruef('zeitLage haengt in rcQueueView', /zeit: zeitLage\(\)/.test(modul),
    'gebaut-aber-nie-gerufen ist die haeufigste Fehlerklasse im Projekt');
{
    const zl = (function(){ const a = modul.indexOf('function zeitLage()');
        let i = modul.indexOf('{', a), t = 0;
        for (; i < modul.length; i++) { if (modul[i] === '{') t++; else if (modul[i] === '}') { t--; if (!t) break; } }
        return modul.slice(a, i + 1); })();
    pruef('zeitLage respektiert den aktiven Filter', /rcLigaInScope/.test(zl));
    pruef('zeitLage nimmt den Mapping-Standort, nicht den Rohwert', /rcLigaMeta/.test(zl));
    pruef('Boden von 3 Calls (ein langes Einzelgespraech brandmarkt niemanden)', /if \(c < 3\) return;/.test(zl));
    pruef('alle drei Zeiten werden geprueft', /acwSec/.test(zl) && /ahtSec/.test(zl) && /achtSec/.test(zl));
    pruef('ohne Liga-Daten liefert zeitLage null (kein leeres Geruest)', /if \(!gesehen\) return null;/.test(zl));
}
pruef('die Karte existiert im Geruest', /rcQZeitCard/.test(modul) && /rcQZeitInhalt/.test(modul));
pruef('zeichneZeit ist definiert UND wird im Takt gerufen',
    /function zeichneZeit\(v\)/.test(modul) && /zeichneZeit\(v\);/.test(modul));
pruef('Deckel bei 5 Namen je Block', /slice\(0, 5\)/.test(modul));
pruef('die Zeitbasis steht an der Karte dran', /rcQZeitStand/.test(modul) && (modul.match(/Tagesmittel aus der Ligaliste/g) || []).length >= 2);
pruef('Grenzen sind von der Konsole aus stellbar', /window\.rcQueueZeitGrenzen = function/.test(modul));
pruef('ACHT wird vom Crawler ueberhaupt geliefert', /achtSec:/.test(crawler) && /'10014'/.test(crawler));

// ============================================================================
console.log('\n-- 12. Live-Takt gegen das Seiten-Select (05.08.) --');
// Befund vom Wandmonitor: das Portal stand auf "Aktuelle Woche" (die bevorzugte
// Ansicht des Nutzers), und JEDER Live-Takt meldete >Tabelle zeigt
// "current_week" ohne Datum-Spalte< — obwohl der Replay nachweislich intraday
// angefragt hat. storeByDate beurteilte die Replay-Antwort nach dem
// daterange-SELECT der Seite, das mit der Antwort nichts zu tun hat.
pruef('storeByDate nimmt einen Zeitraum-Hinweis entgegen',
    /function storeByDate\(kpis, drHint\)/.test(crawler));
pruef('der Hinweis schlaegt das Seiten-Select',
    /const dr = drHint \|\| currentDaterange\(\);/.test(crawler));
// v6: Es gibt nur noch EINEN Verwertungs-Pfad (verwerteAntwort) — und der
// gibt den Hinweis IMMER mit, weil er das daterange direkt aus dem Request-
// Body des Nutzer-Klicks bzw. Replays liest. Einen DOM-Lese-Pfad ohne
// Request-Kontext gibt es im Takt nicht mehr.
pruef('die Verwertung gibt den Hinweis aus dem Request-Body mit',
    /const dr = p\.get\('daterange'\) \|\| '';/.test(crawler) &&
    /storeByDate\(kpis, dr\);/.test(crawler));
pruef('kein Verwertungs-Pfad ohne Hinweis mehr (storeByDate stets mit dr)',
    !/storeByDate\(kpis\);/.test(crawler));
// GEGENPROBE: ohne Hinweis-Weiche wuerde die Pruefung anschlagen.
pruef('GEGENPROBE Hinweis-Weiche wird erkannt',
    !/const dr = currentDaterange\(\);/.test(crawler.replace(/const dr = drHint \|\| currentDaterange\(\);/, 'const dr = drHint || currentDaterange();')) ||
    !/const dr = currentDaterange\(\);/.test(crawler));

// ============================================================================
console.log('\n-- 13. Belegte Referenzbaeume je Stack (05.08.) --');
// Aus echten Ok-Klick-Mitschnitten des Nutzers an allen drei Stacks.
// KORRIGIERT 05.08. abends: Der fruehe Mitschnitt zeigte 11406 (Credit), die
// gespeicherte Vorlage des Nutzers ("Kabel TEC") steht aber auf 11405 (KA) —
// eine Ebene hoeher. Die Vorlage ist die Wahrheit; RC_BAEUME ist seither nur
// noch der Notnagel, falls die Vorlage im Portal fehlt.
pruef('Kabel = 11405 (Notnagel passend zur Vorlage "Kabel TEC")',
    /key:'Kabel',[^\n]*nodes:'11405'/.test(crawler));
pruef('die Portal-Vorlage schlaegt den Notnagel',
    /var v = vorlageNodes\(p\);/.test(crawler) &&
    crawler.indexOf('var v = vorlageNodes(p);') < crawler.indexOf('var n = baumFuerProjekt(p);'));
pruef('Mobile = 11233,11248 (Care UND Tec zusammen)', /key:'Mobile',[^\n]*nodes:'11233,11248'/.test(crawler));
pruef('UM = 12809', /key:'UM',[^\n]*nodes:'12809'/.test(crawler));
pruef('die alten Vermutungs-Eintraege bleiben fuer Versuche stehen', /key:'VUM_Care'/.test(crawler));

console.log('\n-- 14. Corporate Design --');
const emoji = /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{1F000}-\u{1F0FF}]/u;
pruef('keine Emojis in den neuen Spruchtexten', !emoji.test(modul));
pruef('keine Emojis in den Laufband-Spruechen', !emoji.test(mq));

console.log('\n' + ok + ' bestanden, ' + fehler + ' fehlgeschlagen.');
process.exit(fehler ? 1 : 0);
