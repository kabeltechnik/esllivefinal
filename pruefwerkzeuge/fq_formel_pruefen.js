// ============================================================================
//  fq_formel_pruefen.js — prueft die FQ-Formel und die Qualitaets-Felder des
//  Ligalisten-Crawlers (kpi_crawler.js, parseKpiTable).
//
//  Nutzer-Vorgabe 30.10.: Die Ligaliste liefert "TNPS Antwortquote %" seit 10/2026
//  leer. FQ (Feedbackquote) = TNPS-Antworten (Promotoren + Neutrale + Detraktoren
//  der TNPS-Gruppe) / Calls x 100, Calls = AHT-Nenner. Ohne Calls bleibt FQ null
//  ("Keine"/"—"), NIE 0. fqZ = Antworten, fqN = Calls.
//  Dazu: csDds (CS Deep Detractor %), tnpsAq (TNPS Antwortquote %, Portal), dds
//  (TNPS Deep Detractor %) und ftf kommen unveraendert an — die Qualitaets-Seite
//  zeigt sie ohne weitere Umwandlung.
//
//  Muster wie kennzahlen_pruefen.js: die ECHTE Funktion parseKpiTable per
//  Klammer-Zaehlung aus kpi_crawler.js schneiden, kleine Mini-Tabelle als Eingabe.
//
//  Aufruf:  node pruefwerkzeuge/fq_formel_pruefen.js
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'kpi_crawler.js'), 'utf8');

// --- Minimaler DOM-Stub (wie kennzahlen_pruefen.js) ---------------------------
function Zelle(text, colspan, href) {
    return {
        textContent: text,
        getAttribute: a => (a === 'colspan' && colspan ? String(colspan) : null),
        querySelector: sel => (sel === 'a' && href ? { href, textContent: text } : null),
    };
}
function Zeile(zellen) { return { _z: zellen, querySelectorAll: sel => (sel === 'th' || sel === 'td') ? zellen : [] }; }
function Tabelle(kopf, daten) {
    return { querySelectorAll: sel => sel === 'thead tr' ? kopf : (sel === 'tbody tr' ? daten : []) };
}

function schneide(name) {
    const start = src.indexOf('function ' + name + '(');
    if (start < 0) throw new Error('Funktion ' + name + ' nicht in kpi_crawler.js gefunden');
    let tiefe = 0, i = src.indexOf('{', start);
    for (; i < src.length; i++) {
        if (src[i] === '{') tiefe++;
        else if (src[i] === '}') { tiefe--; if (tiefe === 0) return src.slice(start, i + 1); }
    }
    throw new Error('Funktion ' + name + ' nicht sauber abgeschlossen');
}
const NAMEN = ['pad2', 'cleanText', 'datumKey', 'timeToSec', 'buildColumnMap', 'findLeaf', 'findKpi', 'cellNum', 'cellText', 'parseKpiTable'];
const figMatch = src.match(/const\s+FIGURE_IDS\s*=\s*\[[\s\S]*?\];/);
if (!figMatch) throw new Error('FIGURE_IDS nicht gefunden');
const code = 'var document = { querySelector: function(){ return null; } };\n' +
    'var window = {};\n' +
    'var console = { warn: function(){}, error: function(){}, log: function(){} };\n' +
    figMatch[0] + '\n' + NAMEN.map(schneide).join('\n') + '\nreturn { parseKpiTable: parseKpiTable };';
const API = new Function(code)();

const Z = String.fromCharCode(90, 228) + 'hler';   // "Zähler"
const STAMM = ['Zeile', 'Dienstleister', 'Standort', 'Team', 'Agentenname', 'CCS-ID'];
const STAMMWERTE = ['1', 'regiocom', 'Alanya', '21105083', 'Muster, Max', '199362'];
const DREI = [Z, 'Nenner', 'Kennzahl'];

// Eine Agentenzeile aus Gruppen bauen: [Gruppenname, Unterspalten, Werte]
function parse(gruppen) {
    const gk = [], lk = [], w = [];
    STAMM.forEach(s => { gk.push(Zelle(s, 1)); lk.push(Zelle(s)); });
    STAMMWERTE.forEach(v => w.push(Zelle(v)));
    gruppen.forEach(([name, subs, vals]) => {
        gk.push(Zelle(name, subs.length)); subs.forEach(s => lk.push(Zelle(s))); vals.forEach(v => w.push(Zelle(v)));
    });
    return API.parseKpiTable(Tabelle([Zeile(gk), Zeile(lk)], [Zeile(w)]))[0] || null;
}

let ok = 0, fehler = 0;
function pruef(titel, bedingung, zusatz) {
    if (bedingung) { ok++; console.log('  ok   ' + titel); }
    else { fehler++; console.log('  FEHL ' + titel + (zusatz !== undefined ? '  -> ' + zusatz : '')); }
}

// Bausteine
const AHT = n => ['AHT', DREI, ['1200', String(n), '00:07:15']];
const CS_NPS = [['CS', DREI, ['18', '20', '90.0']], ['Promotoren', ['Kennzahl'], ['18']], ['Detraktoren', ['Kennzahl'], ['1']], ['Neutrale', ['Kennzahl'], ['1']]];
const TNPS_NPS = (p, d, n) => [['TNPS', DREI, ['14', '20', '70.0']], ['Promotoren', ['Kennzahl'], [String(p)]], ['Detraktoren', ['Kennzahl'], [String(d)]], ['Neutrale', ['Kennzahl'], [String(n)]]];

console.log('FQ-FORMEL');
{
    // Portal-Antwortquote bewusst ABWEICHEND (99.9), damit klar ist, dass die eigene Rechnung gilt.
    const k = parse([AHT(40), ...CS_NPS, ...TNPS_NPS(10, 2, 2), ['TNPS Antwortquote %', DREI, ['20', '40', '99.9']]]);
    pruef('Tabelle wird gelesen', !!k);
    pruef('FQ = (10+2+2 TNPS-Antworten) / 40 Calls x 100 = 35 (CS-Antworten: 20, zaehlen nicht)', k && Math.abs(k.fq - 35) < 1e-9, k && k.fq);
    pruef('fqZ = TNPS-Antworten (14), fqN = Calls (40)', k && k.fqZ === 14 && k.fqN === 40, k && (k.fqZ + '/' + k.fqN));
    pruef('die CS-Gruppe (erste Promotoren/Detraktoren/Neutrale) wird nicht als TNPS gezaehlt',
        k && k.promTnps === 10 && k.promCs === 18 && k.fqZ !== 20, k && (k.promTnps + '/' + k.promCs + ', fqZ ' + k.fqZ));
    pruef('FQ ignoriert die Portal-Antwortquote (99.9), tnpsAq traegt sie unveraendert', k && k.fq !== 99.9 && k.tnpsAq === 99.9, k && (k.fq + ' / ' + k.tnpsAq));
}
{
    // Gegenprobe 1: ohne Calls (keine AHT-Gruppe) -> null, nie 0
    const k = parse([...CS_NPS, ...TNPS_NPS(15, 2, 3)]);
    pruef('ohne Calls (keine AHT-Spalte): fq, fqZ, fqN sind null — nicht 0', k && k.fq === null && k.fqZ === null && k.fqN === null && k.callCount === null,
        k && JSON.stringify([k.fq, k.fqZ, k.fqN, k.callCount]));
}
{
    // Gegenprobe 2: Calls = 0 -> keine Division durch 0
    const k = parse([AHT(0), ...CS_NPS, ...TNPS_NPS(15, 2, 3)]);
    pruef('Calls = 0: fq ist null (keine Division durch 0, kein Infinity/NaN)', k && k.fq === null && k.fqZ === null && k.fqN === null, k && JSON.stringify([k.fq, k.fqZ, k.fqN]));
}
{
    // Gegenprobe 3: TNPS-Gruppe fehlt (nur die CS-Kategorien da) -> null
    const k = parse([AHT(40), ...CS_NPS]);
    pruef('ohne TNPS-Kategorien: fq ist null ("unbekannt"), nicht 0', k && k.fq === null && k.fqZ === null, k && JSON.stringify([k.fq, k.fqZ]));
}
{
    // Echte Null: Calls da, TNPS-Kategorien da, aber alle 0 -> 0 %, mit Zaehler 0
    const k = parse([AHT(40), ...CS_NPS, ...TNPS_NPS(0, 0, 0)]);
    pruef('echte Null: 0 Antworten bei 40 Calls ergibt 0 % (fqZ 0, fqN 40)', k && k.fq === 0 && k.fqZ === 0 && k.fqN === 40, k && JSON.stringify([k.fq, k.fqZ, k.fqN]));
}
{
    // Gegenprobe: die ALTE Lesart (Portal-Antwortquote als FQ) waere hier null, die neue liefert einen Wert
    const k = parse([AHT(40), ...CS_NPS, ...TNPS_NPS(15, 2, 3)]);   // keine Antwortquote-Spalte im Portal
    pruef('GEGENPROBE: ohne Portal-Antwortquote bleibt tnpsAq null, FQ hat trotzdem einen Wert', k && k.tnpsAq === null && k.fq === 50, k && JSON.stringify([k.tnpsAq, k.fq]));
}

console.log('\nQUALITAETS-FELDER fuer die Qualitaets-Seite');
{
    const k = parse([AHT(40), ['ACW', ['Kennzahl'], ['00:01:45']], ['ACHT', ['Kennzahl'], ['00:00:50']],
        ...CS_NPS, ['CS Deep Detractor %', ['Kennzahl'], ['4.5']], ...TNPS_NPS(15, 2, 3),
        ['TNPS Antwortquote %', DREI, ['20', '40', '50.0']], ['TNPS Deep Detractor %', DREI, ['1', '20', '5.0']],
        ['First-Time-Fix', DREI, ['30', '40', '75.0']]]);
    pruef('csDds = CS Deep Detractor %', k && k.csDds === 4.5, k && k.csDds);
    pruef('tnpsAq = TNPS Antwortquote % (Portal)', k && k.tnpsAq === 50, k && k.tnpsAq);
    pruef('dds = TNPS Deep Detractor %, ddsZ/ddsN fuer das Poolen', k && k.dds === 5 && k.ddsZ === 1 && k.ddsN === 20, k && JSON.stringify([k.dds, k.ddsZ, k.ddsN]));
    pruef('ftf = First-Time-Fix, ftfZ/ftfN fuer das Poolen', k && k.ftf === 75 && k.ftfZ === 30 && k.ftfN === 40, k && JSON.stringify([k.ftf, k.ftfZ, k.ftfN]));
    pruef('ACW/ACHT in Sekunden (105 / 50)', k && k.acwSec === 105 && k.achtSec === 50, k && JSON.stringify([k.acwSec, k.achtSec]));
    pruef('csN (CS-Antworten) steht fuer die Gewichtung von csDds bereit', k && k.csN === 20, k && k.csN);
}
{
    const k = parse([AHT(40), ...CS_NPS, ...TNPS_NPS(15, 2, 3)]);
    pruef('fehlende Spalten (CS DDS, Antwortquote, DDS, FTF, ACW) bleiben null — nie 0',
        k && k.csDds === null && k.tnpsAq === null && k.dds === null && k.ftf === null && k.acwSec === null,
        k && JSON.stringify([k.csDds, k.tnpsAq, k.dds, k.ftf, k.acwSec]));
}

console.log('');
if (fehler === 0) console.log('ALLE ' + (ok + fehler) + ' PRUEFUNGEN BESTANDEN');
else { console.log(fehler + ' von ' + (ok + fehler) + ' PRUEFUNGEN FEHLGESCHLAGEN'); process.exitCode = 1; }
