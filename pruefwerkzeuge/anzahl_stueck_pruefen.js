// ===========================================================================
//  anzahl_stueck_pruefen.js  —  Pruefwerkzeug (offline, ohne Portal)
// ===========================================================================
//  Nutzer-Vorgabe 06.08. spaetabends: "anzahl = Stueck". Steht in der
//  ESL-Spalte `anzahl` eine 2, sind das ZWEI verkaufte Produkte und damit
//  zwei Abschluesse — nicht einer.
//
//  An den echten Exporten gemessen (Excels vergleich, 01.-05.08.2026):
//    Kabel  798 angenommene Zeilen -> 808 Stueck  (+10, +1,3 %)
//    Mobile 3525 angenommene Zeilen -> 3555 Stueck (+30, +0,9 %)
//    Kein einziger Fall "angenommen mit anzahl 0/leer" — Summieren kann
//    also nichts verschlucken. "nicht moeglich" hat immer anzahl 0.
//
//  Geprueft wird:
//   1. rcAccumRow FUNKTIONAL (echte Funktion, ausgeschnitten) — der Pfad,
//      der die Tages-Historie und damit jeden Vortags-/Zeitraum-Export speist.
//   2. Die Entfaltung der Replay-Listen (Radar + League) — echte Code-Zeilen
//      aus der Datei, ausgefuehrt.
//   3. Dass KEIN Zaehlpfad wieder auf "je Zeile" zurueckfaellt.
//  Jede Regel hat eine Gegenprobe.
//
//  Aufruf:  node pruefwerkzeuge/anzahl_stueck_pruefen.js
// ===========================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(WURZEL, 'esl_live_arena_v22.js'), 'utf8');

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

// ===========================================================================
abschnitt('1. rcAccumRow FUNKTIONAL — der Pfad in die Tages-Historie');
// ===========================================================================
// Echte Funktion ausschneiden und mit minimalen Stubs laufen lassen.
// rcProduktGruppe und rcIstPotentialTracking werden ECHT mit ausgeschnitten:
// rcAccumRow ruft beide auf, seit der UM-Export ohne Gruppenspalte kommt.
// Ein Stub statt der echten Funktion wuerde hier nur die eigene Kopie bewachen.
const echteHelfer = new Function('window',
    schneideAus(src, 'function rcProduktGruppe(') + '\n' +
    schneideAus(src, 'function rcIstPotentialTracking(') + '\n' +
    'return { rcProduktGruppe, rcIstPotentialTracking };'
)({});
const rcAccumRow = new Function('normalizeStandort', 'rcIstPotentialTracking', 'classify', 'rcProduktGruppe',
    schneideAus(src, 'function rcAccumRow(') + '; return rcAccumRow;'
)(
    s => String(s || '').trim().toUpperCase() || 'ALL',
    echteHelfer.rcIstPotentialTracking,
    g => ({ 'KIP BNT': { cat:'kip', isBnt:true,  isVvl:false },
            'Mobilfunk BNT': { cat:'mob', isBnt:true, isVvl:false },
            'KIP VVL': { cat:'kipVvl', isBnt:false, isVvl:true } }[String(g).trim()]
          || { cat:null, isBnt:false, isVvl:false }),
    echteHelfer.rcProduktGruppe
);

// Spaltenindex wie im echten Export
const ix = { standort:0, vo:1, erg:2, anz:3, merkmal:4, ansp:5, id:6, prod:7 };
const reihe = (anz, gruppe, erg, id) => ['AL', '12345', erg || 'angenommen', anz, 'BCR-Relevant', 'ja', id || ('id' + anz), gruppe];
function frischesAgg(){
    return { rows:0, bcr:0, nonBcr:0, bnt:0, vvl:0, byStd:{}, byAgent:{},
             _k:new Set(), _a:new Set(), _kSt:{}, _aSt:{}, _kAg:{}, _aAg:{} };
}
{
    const agg = frischesAgg();
    rcAccumRow(agg, reihe(2, 'KIP BNT'), ix, 0);
    pruef('anzahl=2 ergibt 2 Stueck BNT (nicht 1)', agg.bnt === 2, agg.bnt);
    pruef('… und 2 BCR-relevante', agg.bcr === 2, agg.bcr);
    pruef('… auch je Agent (kip=2)', agg.byAgent['12345'].kip === 2, agg.byAgent['12345'].kip);
    pruef('… und in der Produktgruppen-Aufschluesselung (pg)',
        agg.byAgent['12345'].pg['KIP BNT'] === 2, agg.byAgent['12345'].pg['KIP BNT']);
}
{
    const agg = frischesAgg();
    rcAccumRow(agg, reihe(1, 'KIP BNT'), ix, 0);
    pruef('GEGENPROBE anzahl=1 ergibt 1 Stueck (der Test unterscheidet wirklich)',
        agg.bnt === 1, agg.bnt);
}
{
    // Der gemessene Extremfall aus dem echten Export: anzahl=3 und =4.
    const agg = frischesAgg();
    rcAccumRow(agg, reihe(3, 'Mobilfunk BNT'), ix, 0);
    rcAccumRow(agg, reihe(4, 'KIP VVL', 'angenommen', 'id-b'), ix, 1);
    pruef('anzahl=3 und =4 werden voll gezaehlt (3 BNT, 4 VVL)',
        agg.bnt === 3 && agg.vvl === 4, agg.bnt + '/' + agg.vvl);
}
{
    // "nicht moeglich" hat im echten Export IMMER anzahl 0 -> kein Abschluss.
    const agg = frischesAgg();
    rcAccumRow(agg, reihe(0, 'KIP BNT', 'nicht möglich'), ix, 0);
    pruef('anzahl=0 / "nicht moeglich" zaehlt KEINEN Abschluss',
        agg.bnt === 0 && agg.bcr === 0, agg.bnt + '/' + agg.bcr);
    pruef('… wird aber als Kontakt gezaehlt (Zeile existiert)', agg.rows === 1, agg.rows);
}
{
    // "Angebot"/"abgelehnt" tragen im Export anzahl>=1, sind aber KEIN Abschluss.
    const agg = frischesAgg();
    rcAccumRow(agg, reihe(2, 'KIP BNT', 'abgelehnt'), ix, 0);
    pruef('abgelehnt mit anzahl=2 zaehlt trotzdem 0 Stueck',
        agg.bnt === 0, agg.bnt);
}
{
    // Potential Tracking bleibt komplett draussen (Vorgabe 06.08. frueh).
    const agg = frischesAgg();
    const r = reihe(2, 'KIP BNT'); r[ix.merkmal] = 'Potential Tracking';
    rcAccumRow(agg, r, ix, 0);
    pruef('Potential Tracking wird weiterhin ganz uebersprungen',
        agg.rows === 0 && agg.bnt === 0, agg.rows + '/' + agg.bnt);
}

// ---- Ansprache-Regel (Nutzer-Vorgabe 06.08. abends) -----------------------
// "sis_angesprochen 'ja' UND produktmerkmal 'BCR-Relevant' - nichts anderes."
// Kein ergebnis-Rueckfall, leere Merkmale zaehlen nicht. Gemessen: Kabel -1,3 %,
// Mobile -9,6 % gegenueber der alten Nur-ja-Regel.
{
    const agg = frischesAgg();
    rcAccumRow(agg, reihe(1, 'KIP BNT'), ix, 0);            // ja + BCR-Relevant
    pruef('ja + BCR-Relevant zaehlt als Ansprache', agg._a.size === 1, agg._a.size);
}
{
    // Mobile schreibt das Merkmal klein ("BCR-relevant") - muss ebenso zaehlen.
    const agg = frischesAgg();
    const r = reihe(1, 'KIP BNT'); r[ix.merkmal] = 'BCR-relevant';
    rcAccumRow(agg, r, ix, 0);
    pruef('ja + "BCR-relevant" (Mobile-Schreibweise) zaehlt ebenfalls', agg._a.size === 1, agg._a.size);
}
{
    const agg = frischesAgg();
    const r = reihe(1, 'KIP BNT'); r[ix.merkmal] = 'nicht BCR-relevant';
    rcAccumRow(agg, r, ix, 0);
    pruef('ja + "nicht BCR-relevant" zaehlt NICHT als Ansprache (Mobile: 338 solcher ids)',
        agg._a.size === 0, agg._a.size);
    pruef('… die Zeile bleibt aber ein Kontakt', agg._k.size === 1, agg._k.size);
}
{
    const agg = frischesAgg();
    const r = reihe(1, 'KIP BNT'); r[ix.merkmal] = '';
    rcAccumRow(agg, r, ix, 0);
    pruef('ja + LEERES Merkmal zaehlt NICHT (Kabel: 17 solcher ids)', agg._a.size === 0, agg._a.size);
}
{
    // GEGENPROBE zur alten Regel: "nein"/leer mit ergebnis=angenommen war frueher
    // eine Ansprache (Rueckfall) - jetzt nicht mehr.
    const agg = frischesAgg();
    const r = reihe(1, 'KIP BNT'); r[ix.ansp] = '';
    rcAccumRow(agg, r, ix, 0);
    pruef('GEGENPROBE: leeres sis_angesprochen zaehlt NICHT mehr (alter ergebnis-Rueckfall ist raus)',
        agg._a.size === 0, agg._a.size);
}
{
    const agg = frischesAgg();
    const r = reihe(1, 'KIP BNT'); r[ix.ansp] = 'nein';
    rcAccumRow(agg, r, ix, 0);
    pruef('nein zaehlt nicht (unveraendert)', agg._a.size === 0, agg._a.size);
}
// Und der LIVE-Parser traegt exakt dieselbe Regel (Textmuster mit Gegenprobe).
pruef('Live-Parser: istAnsprache = ja UND BCR-Merkmal',
    /const istAnsprache = \(angesprochen === 'ja'\) && \/\^bcr\[-\\s\]\?relevant\$\/\.test\(merkmalL\.trim\(\)\);/.test(src));
pruef('GEGENPROBE: der alte ergebnis-Rueckfall ist im Live-Parser raus',
    !/angesprochen === '' && \(ergL\.includes\('angenommen'\)/.test(src));

// ===========================================================================
abschnitt('2. Replay-Listen entfalten (echte Code-Zeilen ausgefuehrt)');
// ===========================================================================
// Die Entfaltung steckt in grossen Zeichenfunktionen. Statt sie nachzubauen
// (ein Nachbau bewacht nur seine eigene Kopie), wird die ECHTE Zeile aus der
// Datei geschnitten und ausgefuehrt.
function entfaltungAus(muster, name){
    const m = src.match(muster);
    if (!m) throw new Error('Entfaltung nicht gefunden: ' + name);
    return m[0];
}
{
    const zeile = entfaltungAus(
        /src\.slice\(\)\.sort\([^\n]*\)\s*\n\s*\.forEach\(s => \{ const n = Number\(s\.anzahl\) \|\| 1; for \(let k = 0; k < n; k\+\+\) RC_WAR\.rList\.push\(s\); \}\);/,
        'RC_WAR');
    const RC_WAR = { rList: [] };
    const src2 = [ { timeStr:'09:00', anzahl:2, name:'A' }, { timeStr:'08:00', anzahl:1, name:'B' },
                   { timeStr:'10:00', anzahl:3, name:'C' } ];
    new Function('src', 'RC_WAR', zeile)(src2, RC_WAR);
    pruef('Radar-Replay: 2+1+3 ergibt 6 Einheiten', RC_WAR.rList.length === 6, RC_WAR.rList.length);
    pruef('… chronologisch sortiert (B, A, A, C, C, C)',
        RC_WAR.rList.map(s => s.name).join('') === 'BAACCC', RC_WAR.rList.map(s => s.name).join(''));
    pruef('GEGENPROBE: ohne Entfaltung waeren es nur 3', RC_WAR.rList.length !== 3);
}
{
    const zeile = entfaltungAus(
        /src\.forEach\(v => \{ const n = Number\(v\.anzahl\) \|\| 1; for \(let k = 0; k < n; k\+\+\) auf\.push\(v\); \}\);/,
        'RC_LG');
    const auf = [];
    new Function('src', 'auf', zeile)([{ anzahl:2 }, { anzahl:1 }], auf);
    pruef('League-Replay: 2+1 ergibt 3 Tore', auf.length === 3, auf.length);
    const auf2 = [];
    new Function('src', 'auf', zeile)([{ anzahl:null }, { }], auf2);
    pruef('fehlende/leere anzahl zaehlt als 1 (kein Verschlucken)', auf2.length === 2, auf2.length);
}
// Der Rueckfall darf NIE eine leere Liste stehen lassen — ein `return` an
// dieser Stelle uebersprang frueher Szenen-Tick und Konfetti.
pruef('League: leere Entfaltung faellt auf die Rohliste zurueck',
    /RC_LG\.rList = auf\.length \? auf : src;/.test(src));
pruef('League: KEIN return im Replay-Zweig (wuerde den Szenen-Tick ueberspringen)',
    !/RC_LG\.rSrc !== src\)[\s\S]{0,400}?return;/.test(src));

// ===========================================================================
abschnitt('3. Kein Zaehlpfad faellt auf "je Zeile" zurueck');
// ===========================================================================
pruef('processDataStream liest die Spalte anzahl',
    /const anzahl = parseInt\(row\[idx\.anz\]\) \|\| 0;/.test(src));
pruef('processDataStream zaehlt Stueck mit anzahl (nicht ++)',
    /agS\[cat\] \+= anzahl;/.test(src) && /std\[cat\] \+= anzahl;/.test(src));
pruef('rcAccumRow liest anzahl', /const anz = parseInt\(r\[ix\.anz\]\) \|\| 0;/.test(src));
pruef('renderProducts zaehlt mit anzahl', /counts\[nm\]=\(counts\[nm\]\|\|0\)\+anz;/.test(src));
pruef('Blatt "Produkte" zaehlt mit anzahl',
    /const n = Number\(s\.anzahl\) \|\| 1;\s*\n\s*e\.alles \+= n;/.test(src));
pruef('ON-FIRE-Laufband zaehlt mit anzahl (war je Zeile)',
    /fire\[s\.name\] = \(fire\[s\.name\]\|\|0\) \+ \(Number\(s\.anzahl\) \|\| 1\);/.test(src));
pruef('GEGENPROBE: die alte Zeilen-Zaehlung des Laufbands ist raus',
    !/fire\[s\.name\] = \(fire\[s\.name\]\|\|0\) \+ 1;/.test(src));
pruef('Kriegs-Chronik nennt die Menge im Text (2x ...)',
    /\(n > 1 \? n \+ 'x ' : ''\)/.test(src));
pruef('rcAllSales traegt anzahl mit (sonst koennte niemand entfalten)',
    /timeStr, datum:\(rcRowDayKey\(row, idx\) \|\| ''\), isBcr, anzahl \}\);/.test(src));

console.log('\n' + '='.repeat(60));
console.log('  ' + ok + ' bestanden, ' + fehler + ' fehlgeschlagen.');
console.log('='.repeat(60));
process.exit(fehler ? 1 : 0);
