// ============================================================================
//  ziele_pruefen.js — prueft das Vertriebsziel-System (Stueck pro Tag).
//
//  Anlass (04.08.): Ziele sollen auf vier Ebenen vergeben werden koennen —
//  Standort, Team, Stack und bis auf Mitarbeiterbasis. Die Vererbung ist die
//  Stelle, an der so ein System typischerweise schiefgeht:
//    - 0 muss "nicht vorgegeben" heissen, nicht "Ziel = null Stueck"
//    - ein SUMMENziel darf NIE auf einen einzelnen Agenten vererbt werden
//    - Team-Schluessel ist der Mapping-NAME, nicht die Ligalisten-NUMMER
//
//  Aufruf:  node pruefwerkzeuge/ziele_pruefen.js
//  Sollwert: alle Pruefungen bestanden.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(WURZEL, 'esl_live_arena_v22.js'), 'utf8');

function schneide(name) {
    const start = src.indexOf('function ' + name + '(');
    if (start < 0) throw new Error('Funktion ' + name + ' nicht gefunden');
    let tiefe = 0, i = src.indexOf('{', start);
    for (; i < src.length; i++) {
        if (src[i] === '{') tiefe++;
        else if (src[i] === '}') { tiefe--; if (tiefe === 0) return src.slice(start, i + 1); }
    }
    throw new Error('Funktion ' + name + ' nicht sauber abgeschlossen');
}
const konst = ['RC_ZIEL_ARTEN', 'RC_ZIEL_EBENEN'].map(k => {
    const m = src.match(new RegExp('const\\s+' + k + '\\s*=\\s*\\[[\\s\\S]*?\\];'));
    if (!m) throw new Error('Konstante ' + k + ' nicht gefunden');
    return m[0];
});

const code = 'var window = {}; var localStorage = { getItem:function(){return null;}, setItem:function(){} };\n' +
    'var rcLog = { warn:function(){}, log:function(){} };\n' +
    'var console = { log:function(){} };\n' +
    'function rcKey(b){ return b; }\n' +
    konst.join('\n') + '\n' +
    ['rcZieleLaden', 'rcZieleSpeichern', 'rcZielRoh', 'rcZielProAgent', 'rcZielSumme'].map(schneide).join('\n') +
    '\nwindow.rcVZiele = rcZieleLaden();' +
    '\nreturn { window:window, rcZielRoh:rcZielRoh, rcZielProAgent:rcZielProAgent, rcZielSumme:rcZielSumme, ARTEN:RC_ZIEL_ARTEN, EBENEN:RC_ZIEL_EBENEN };';
const API = new Function(code)();

let ok = 0, fehler = 0;
function pruef(titel, bed, zusatz) {
    if (bed) { ok++; console.log('  ok   ' + titel); }
    else { fehler++; console.log('  FEHL ' + titel + (zusatz !== undefined ? '  -> ' + JSON.stringify(zusatz) : '')); }
}

// --- Ausgangslage ohne jedes Ziel -------------------------------------------
console.log('\n-- ohne gesetzte Ziele --');
let r = API.rcZielProAgent('kip', { ccsId: '199362', team: 'VKD-TECH-83', std: 'AL', stack: 'VKD_Tech' });
pruef('kein Ziel gesetzt -> wert 0', r.wert === 0, r);
pruef('kein Ziel gesetzt -> keine Quelle', r.quelle === null, r);

// --- Vererbung Schritt fuer Schritt -----------------------------------------
console.log('\n-- Vererbung, von oben nach unten aufgebaut --');
const Z = API.window.rcVZiele;
const ctx = { ccsId: '199362', team: 'VKD-TECH-83', std: 'AL', stack: 'VKD_Tech' };

Z.global = { proAgent: { kip: 1 } };
r = API.rcZielProAgent('kip', ctx);
pruef('global greift, wenn nichts anderes gesetzt ist', r.wert === 1 && r.ebene === 'global', r);

Z.stack['VKD_Tech'] = { proAgent: { kip: 2 } };
r = API.rcZielProAgent('kip', ctx);
pruef('Stack schlaegt global', r.wert === 2 && r.ebene === 'stack', r);

Z.std['AL'] = { proAgent: { kip: 3 } };
r = API.rcZielProAgent('kip', ctx);
pruef('Standort schlaegt Stack', r.wert === 3 && r.ebene === 'std', r);

Z.team['VKD-TECH-83'] = { proAgent: { kip: 4 } };
r = API.rcZielProAgent('kip', ctx);
pruef('Team schlaegt Standort', r.wert === 4 && r.ebene === 'team', r);

Z.agent['199362'] = { proAgent: { kip: 5 } };
r = API.rcZielProAgent('kip', ctx);
pruef('Agent schlaegt alles', r.wert === 5 && r.ebene === 'agent', r);
pruef('Quelle wird benannt', r.quelle === 'persoenlich', r);

// --- Die 0-Falle -------------------------------------------------------------
console.log('\n-- 0 heisst "nicht vorgegeben", nicht "Ziel null" --');
Z.agent['199362'].proAgent.kip = 0;
r = API.rcZielProAgent('kip', ctx);
pruef('0 auf Agentenebene faellt durch auf das Team', r.wert === 4 && r.ebene === 'team', r);
Z.team['VKD-TECH-83'].proAgent.kip = 0;
Z.std['AL'].proAgent.kip = 0;
Z.stack['VKD_Tech'].proAgent.kip = 0;
r = API.rcZielProAgent('kip', ctx);
pruef('alle 0 -> faellt bis auf global durch', r.wert === 1 && r.ebene === 'global', r);
Z.global.proAgent.kip = 0;
r = API.rcZielProAgent('kip', ctx);
pruef('ueberall 0 -> gar kein Ziel', r.wert === 0 && r.quelle === null, r);

// --- Fehlender Kontext -------------------------------------------------------
console.log('\n-- unvollstaendiger Kontext --');
Z.std['AL'] = { proAgent: { mob: 7 } };
r = API.rcZielProAgent('mob', { std: 'AL' });
pruef('nur Standort bekannt -> Standortziel greift', r.wert === 7, r);
r = API.rcZielProAgent('mob', {});
pruef('gar kein Kontext -> kein Absturz, Wert 0', r.wert === 0, r);
r = API.rcZielProAgent('mob', { ccsId: '', team: null, std: undefined });
pruef('leere Kennungen werden uebersprungen', r.wert === 0, r);
r = API.rcZielProAgent('mob', { team: 'GIBT-ES-NICHT', std: 'AL' });
pruef('unbekanntes Team faellt auf den Standort durch', r.wert === 7, r);

// --- Summenziel: die wichtigste Trennung ------------------------------------
console.log('\n-- Summenziel darf NIE zum Einzelziel werden --');
API.window.rcVZiele.std['B'] = { summe: { kip: 100 } };
r = API.rcZielProAgent('kip', { std: 'B' });
pruef('Summenziel des Standorts wird NICHT je Agent vererbt', r.wert === 0, r);
let s = API.rcZielSumme('kip', 'std', 'B', 12, { std: 'B' });
pruef('gesetztes Summenziel wird direkt genommen', s.wert === 100 && !s.hochgerechnet, s);

API.window.rcVZiele.std['C'] = { proAgent: { kip: 3 } };
s = API.rcZielSumme('kip', 'std', 'C', 12, { std: 'C' });
pruef('ohne Summenziel wird aus proAgent hochgerechnet (3 x 12)', s.wert === 36 && s.hochgerechnet, s);
s = API.rcZielSumme('kip', 'std', 'C', 0, { std: 'C' });
pruef('ohne Agenten keine Hochrechnung', s.wert === 0, s);
s = API.rcZielSumme('kip', 'std', 'UNBEKANNT', 5, {});
pruef('ohne jedes Ziel auch keine Summe', s.wert === 0 && s.quelle === null, s);

// --- Trennung der Kennzahlen -------------------------------------------------
console.log('\n-- Kennzahlen bleiben getrennt --');
API.window.rcVZiele.std['D'] = { proAgent: { kip: 2 } };
pruef('KIP gesetzt', API.rcZielProAgent('kip', { std: 'D' }).wert === 2);
pruef('MOB davon unberuehrt', API.rcZielProAgent('mob', { std: 'D' }).wert === 0);
pruef('BNT davon unberuehrt', API.rcZielProAgent('bnt', { std: 'D' }).wert === 0);
pruef('VVL davon unberuehrt', API.rcZielProAgent('vvl', { std: 'D' }).wert === 0);

// --- Robustheit gegen kaputte Daten -----------------------------------------
console.log('\n-- kaputte gespeicherte Werte --');
API.window.rcVZiele.std['E'] = { proAgent: { kip: 'viel' } };
pruef('Text statt Zahl -> kein Ziel', API.rcZielProAgent('kip', { std: 'E' }).wert === 0);
API.window.rcVZiele.std['F'] = { proAgent: { kip: -5 } };
pruef('negative Zahl -> kein Ziel', API.rcZielProAgent('kip', { std: 'F' }).wert === 0);
API.window.rcVZiele.std['G'] = { proAgent: { kip: Infinity } };
pruef('Infinity -> kein Ziel', API.rcZielProAgent('kip', { std: 'G' }).wert === 0);
API.window.rcVZiele.std['H'] = null;
pruef('null-Eintrag -> kein Absturz', API.rcZielProAgent('kip', { std: 'H' }).wert === 0);
pruef('Nachkommastelle bleibt erhalten', (function(){
    API.window.rcVZiele.std['I'] = { proAgent: { kip: 1.5 } };
    return API.rcZielProAgent('kip', { std: 'I' }).wert === 1.5;
})());

// --- Struktur ----------------------------------------------------------------
console.log('\n-- Struktur und Verdrahtung --');
// Nutzer-Vorgabe 04.08.: die BNT-Produktgruppen einzeln, dazu die Summen.
pruef('acht Zielkennzahlen definiert', API.ARTEN.length === 8, API.ARTEN.map(a => a.key));
pruef('die sechs BNT-Produktgruppen sind dabei',
    ['kip','mob','env','ptv','dsl','fibre'].every(k => API.ARTEN.some(a => a.key === k)),
    API.ARTEN.map(a => a.key));
pruef('BNT gesamt und VVL sind weiterhin dabei',
    ['bnt','vvl'].every(k => API.ARTEN.some(a => a.key === k)));
// Woher die Ist-Leistung kommt, entscheidet ueber die Reichweite: eigene
// Historien-Felder gehen 40 Tage zurueck, die Produktaufschluesselung nur 21.
pruef('jede Kennzahl nennt ihre Datenquelle (feld oder gruppe)',
    API.ARTEN.every(a => a.feld || a.gruppe),
    API.ARTEN.filter(a => !a.feld && !a.gruppe).map(a => a.key));
pruef('KIP und MOB nutzen die verlaesslichen Historien-Felder',
    API.ARTEN.find(a => a.key === 'kip').feld === 'kip' &&
    API.ARTEN.find(a => a.key === 'mob').feld === 'mob');
pruef('ENV/PTV/DSL/Fibre laufen ueber die Produktgruppen',
    ['env','ptv','dsl','fibre'].every(k => !!API.ARTEN.find(a => a.key === k).gruppe));
pruef('die Gruppennamen sind die ECHTEN aus dem Export',
    ['ENV BNT','PTV BNT','DSL BNT','Fibre BNT'].every(g => API.ARTEN.some(a => a.gruppe === g)),
    API.ARTEN.filter(a => a.gruppe).map(a => a.gruppe).join(' | '));
pruef('fuenf Ebenen definiert', API.EBENEN.length === 5, API.EBENEN);
pruef('Speicher laeuft ueber rcKey (projektgetrennt)', /rcKey\('rcVertriebsZiele'\)/.test(src));
pruef('Agenten-Schluessel ist die CCS-ID (nicht die VO-Nummer)',
    /\['agent', ctx\.ccsId/.test(src));
pruef('rcZielProAgent ist global erreichbar', /window\.rcZielProAgent\s*=/.test(src));
pruef('rcZielSumme ist global erreichbar', /window\.rcZielSumme\s*=/.test(src));
pruef('Konsolen-Hilfe rcZiele vorhanden', /window\.rcZiele\s*=\s*function/.test(src));

// --- Verteilung einer Zielsumme auf Koepfe ----------------------------------
// Nutzer-Vorgabe 04.08.: "Wenn ich auf Teambasis was gebe, soll es automatisch
// auf die Mitarbeiter verteilen, je nach Performance" — mit Mindestanteil.
console.log('\n-- Teamziel auf Mitarbeiter verteilen --');
const V = schneide('rcZielVerteilen');
const B = schneide('rcBandBreiten');
const mind = (src.match(/const RC_ZIEL_MINDEST = ([\d.]+);/) || [])[1];
const verteilAPI = new Function(B + '\n' + 'const RC_ZIEL_MINDEST = ' + mind + ';\n' + V +
    '\nreturn rcZielVerteilen;')();

let r2 = verteilAPI(100, [50, 30, 20]);
pruef('Summe stimmt exakt (100)', r2.reduce((a, b) => a + b, 0) === 100, r2);
pruef('staerkster Verkaeufer bekommt am meisten', r2[0] > r2[1] && r2[1] > r2[2], r2);

r2 = verteilAPI(100, [50, 30, 0]);
pruef('wer nichts verkauft hat, bekommt trotzdem ein Ziel', r2[2] > 0, r2);
pruef('Summe stimmt auch mit einer Null (100)', r2.reduce((a, b) => a + b, 0) === 100, r2);

r2 = verteilAPI(10, [0, 0, 0]);
pruef('hat NIEMAND verkauft, wird gleich verteilt',
    r2.reduce((a, b) => a + b, 0) === 10 && Math.max.apply(null, r2) - Math.min.apply(null, r2) <= 1, r2);

r2 = verteilAPI(7, [10, 10, 10]);
pruef('unteilbare Summe wird trotzdem exakt verteilt (7 auf 3)',
    r2.reduce((a, b) => a + b, 0) === 7, r2);

// Extremfall: einer macht praktisch alles. Der Mindestanteil (halber Schnitt)
// wirkt hier bewusst daempfend — der Ausreisser bekommt weiterhin die klare
// Mehrheit, die beiden Schwachen aber ein erreichbares Ziel statt fast null.
// Ohne den Boden waere es 100/0/0 gewesen, und zwei von drei Leuten haetten
// offiziell kein Ziel. Genau das war die Entscheidung des Nutzers.
r2 = verteilAPI(100, [1000, 1, 1]);
pruef('Ausreisser behaelt die klare Mehrheit', r2[0] >= 70, r2);
pruef('die Schwachen bekommen ein erreichbares Ziel statt null', r2[1] > 0 && r2[2] > 0, r2);
pruef('Summe stimmt auch im Extremfall (100)', r2.reduce((a, b) => a + b, 0) === 100, r2);
// Gegenprobe zur Daempfung: bei gleicher Leistung darf sie NICHTS veraendern.
r2 = verteilAPI(90, [10, 10, 10]);
pruef('bei gleicher Leistung wird gleich verteilt', r2.join(',') === '30,30,30', r2);

pruef('leere Liste bricht nicht ab', verteilAPI(50, []).length === 0);
pruef('Zielsumme 0 ergibt lauter Nullen',
    verteilAPI(0, [5, 3]).every(x => x === 0), verteilAPI(0, [5, 3]));

// --- Zeitraum-Aufloesung -----------------------------------------------------
console.log('\n-- Referenzzeitraum --');
const ZR = new Function('function pad2(n){return (n<10?"0":"")+n;}\n' + schneide('rcZielZeitraum') + '\nreturn rcZielZeitraum;')();
const w = ZR('woche'), m = ZR('monat');
const tageZwischen = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
pruef('Woche umfasst 7 Tage', tageZwischen(w.von, w.bis) === 7, w);
pruef('Monat umfasst 30 Tage', tageZwischen(m.von, m.bis) === 30, m);
const heuteKey = (d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'))(new Date());
pruef('der laufende Tag zaehlt NICHT mit (er ist unvollstaendig)',
    w.bis < heuteKey && m.bis < heuteKey, 'bis=' + w.bis + ', heute=' + heuteKey);

// --- Einheiten: Zeitraum-Summe vs. Tagesziel --------------------------------
// Befund 04.08. abends: rcZielLeistung SUMMIERT ueber den Referenzzeitraum, das
// Ziel ist aber ein TAGESziel. Ohne Umrechnung bekaeme jemand mit 4 MOB/Tag bei
// Wochenbasis (28 Stueck) und Faktor 2 ein Tagesziel von 56 statt 8 — bei
// Monatsbasis waere es dreissigfach zu hoch.
console.log('\n-- Tagesziel wird aus dem TAGESSCHNITT gerechnet, nicht aus der Summe --');
pruef('rcZielLeistung summiert ueber den Zeitraum (das ist so gewollt)',
    /e\[art\.key\] = \(e\[art\.key\] \|\| 0\) \+ v/.test(src));
pruef('der Dialog teilt durch die Tage MIT DATEN',
    /const tage = Math\.max\(1, leist\.tageMitDaten \|\| 1\);/.test(src));
pruef('ist ist der Schnitt je Tag, summe bleibt die Zeitraum-Summe',
    /summe: summe, ist: summe \/ tage/.test(src));
pruef('nicht durch Kalendertage teilen (Wochenenden wuerden den Schnitt druecken)',
    !/leist\.tage \|\| 1\);/.test(src));
pruef('Vorschau und Uebernehmen nutzen DIESELBE Rechnung (zielFuer)',
    (src.match(/zielFuer\(z, i\)|zielFuer\(zeile, i\)/g) || []).length >= 3);
pruef('das abgeleitete Ziel ist mindestens 1 (kein 0-Ziel aus Rundung)',
    /Math\.max\(1, Math\.ceil\(z\.ist \* faktor\)\)/.test(src));
pruef('die Tabelle zeigt beide Groessen (Ist gesamt und je Tag)',
    /Ist gesamt<\/th>/.test(src) && /je Tag<\/th>/.test(src));
// Nachgerechnet: 28 Stueck in 7 Tagen = 4/Tag, x2 = 8 (nicht 56).
(function(){
    const tage = 7, summe = 28, faktor = 2;
    const ist = summe / tage;
    const ziel = Math.max(1, Math.ceil(ist * faktor));
    pruef('nachgerechnet: 28 Stueck in 7 Tagen, Faktor 2 -> Tagesziel 8', ziel === 8, ziel);
    const zielAlt = Math.ceil(summe * faktor);
    pruef('der alte Rechenweg haette 56 ergeben (Beleg fuer den Fehler)', zielAlt === 56, zielAlt);
})();

// --- Verdrahtung -------------------------------------------------------------
console.log('\n-- Verdrahtung der Ableitung --');
// "Gebaut, aber nirgends aufgerufen" ist das haeufigste Muster im Projekt —
// rcZielSumme war bis 04.08. abends genau so ein Fall. Geprueft wird der
// ECHTE Aufruf, nicht die blosse Zahl der Vorkommen: Definition und
// window-Export zaehlen nicht als Verwendung.
pruef('rcZielSumme wird in der Fuehrungssicht wirklich aufgerufen',
    /rcZielSumme\(art\.key, 'std', code, n/.test(src));
pruef('der Aufruf steht im Management-Modul (zeichneZiele)',
    src.indexOf("rcZielSumme(art.key, 'std', code, n") > src.indexOf('function zeichneZiele(d)'));
// Seit 07.08. gibt es KEINE eigene Fuehrungs-Seite mehr — die vier Bloecke
// liegen auf der Steuerungs-Seite und rotieren mit ihr. Ein eigener
// Rotations-Schalter waere jetzt ein Schalter fuer eine Seite, die es nicht
// gibt. Geprueft wird deshalb die Gegenrichtung: der Seitenschluessel 'mgmt'
// darf nirgends mehr auftauchen, sonst blieben Reiter oder Rotation auf einer
// Seite stehen, die nie sichtbar wird.
pruef('kein Seitenschluessel "mgmt" mehr im Dashboard', !/'mgmt'/.test(src),
    (src.match(/.{0,40}'mgmt'.{0,40}/) || [''])[0]);
pruef('die Bloecke haengen in der Steuerungs-Seite', /id = 'rcMgmtBlocks'/.test(src));
pruef('zeichneZiele wird weiterhin aus fuelle() aufgerufen',
    src.indexOf('zeichneZiele(d);') > src.indexOf('function fuelle(d)'));
pruef('rcZielLeistung ist global', /window\.rcZielLeistung\s*=/.test(src));
pruef('rcZielVerteilen ist global', /window\.rcZielVerteilen\s*=/.test(src));
pruef('rcZielZeitraum ist global', /window\.rcZielZeitraum\s*=/.test(src));
pruef('der Dialog hat einen Reiter "Aus Leistung"', /\['leistung','Aus Leistung'\]/.test(src));
pruef('zeichneLeistung wird aufgerufen', /if \(ebene === 'leistung'\) \{ zeichneLeistung/.test(src));
pruef('beide Vorgehen sind vorhanden (Faktor und Verteilen)',
    /data-zl-modus="faktor"/.test(src) && /data-zl-modus="verteilen"/.test(src));
pruef('Uebernehmen fragt vorher nach', /confirm\('Fuer ' \+ gefiltert\.length/.test(src));
pruef('Leistung kommt aus der Tageshistorie, nicht vom Live-Stand',
    /const hist = window\.rcEslHistory \|\| \{\};/.test(src));
pruef('Luecke in der Produktaufschluesselung wird angezeigt',
    /RC_PROD_HIST_TAGE/.test(src) && /eher zu niedrig/.test(src));

console.log('\n' + ok + ' bestanden, ' + fehler + ' fehlgeschlagen.');
process.exit(fehler ? 1 : 0);
