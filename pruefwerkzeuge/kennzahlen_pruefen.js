// ============================================================================
//  kennzahlen_pruefen.js — prueft die Kennzahl-Erfassung des Ligalisten-Crawlers.
//
//  Anlass (04.08.): Der Nutzer wollte mehr Kennzahlen sehen ("ACW etc.").
//  Ursache war NICHT der Parser, sondern dass kpi_crawler.js figure_list nie
//  selbst gesetzt hat — es spielte den mitgeschnittenen Request der Seite nach
//  und erbte damit die Kennzahl-Auswahl, die im Portal gerade angehakt war.
//  Fehlt dort eine Spalte, liefert findKpi(-1) und das Feld bleibt still leer.
//
//  Geprueft wird gegen eine nachgebaute Ligalisten-Kopfstruktur (Gruppenzeile mit
//  colspan + Leaf-Zeile "Zähler|Nenner|Kennzahl"), weil im Projekt kein DOM zur
//  Verfuegung steht und nichts installiert werden soll (Citrix ohne Adminrechte).
//  Der Stub bildet genau die DOM-Aufrufe nach, die parseKpiTable benutzt.
//
//  Aufruf:  node pruefwerkzeuge/kennzahlen_pruefen.js
//  Sollwert: alle Pruefungen bestanden.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(WURZEL, 'kpi_crawler.js'), 'utf8');

// --- Minimaler DOM-Stub -----------------------------------------------------
function Zelle(text, colspan, href) {
    return {
        textContent: text,
        getAttribute: a => (a === 'colspan' && colspan ? String(colspan) : null),
        querySelector: sel => (sel === 'a' && href ? { href, textContent: text } : null),
    };
}
function Zeile(zellen) {
    return {
        _z: zellen,
        querySelectorAll: sel => (sel === 'th' || sel === 'td') ? zellen : [],
    };
}
function Tabelle(kopfZeilen, datenZeilen) {
    return {
        querySelectorAll: sel => {
            if (sel === 'thead tr') return kopfZeilen;
            if (sel === 'tbody tr') return datenZeilen;
            return [];
        },
    };
}

// --- Crawler-Funktionen herausschneiden -------------------------------------
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
    figMatch[0] + '\n' +
    NAMEN.map(schneide).join('\n') +
    '\nreturn { parseKpiTable: parseKpiTable, FIGURE_IDS: FIGURE_IDS, timeToSec: timeToSec };';
const API = new Function(code)();

// --- Ligalisten-Tabelle nachbauen -------------------------------------------
// Aufbau wie im echten Portal: Stammspalten einzeln, danach je Kennzahl eine
// Gruppe mit colspan 3 (Zähler | Nenner | Kennzahl). Zeitkennzahlen haben nur
// eine Spalte mit hh:mm:ss, NPS-Kategorien nur eine mit einer Anzahl.
const Z = String.fromCharCode(90, 228) + 'hler';   // "Zähler"

const STAMM = ['Zeile', 'Dienstleister', 'Standort', 'Team', 'Agentenname', 'CCS-ID'];
// [Gruppenname, Unterspalten, Werte]
const GRUPPEN = [
    ['ACD',                     ['Kennzahl'],           ['00:05:30']],
    ['ACW',                     ['Kennzahl'],           ['00:01:45']],
    ['AHT',                     [Z, 'Nenner', 'Kennzahl'], ['1200', '40', '00:07:15']],
    ['ACHT',                    ['Kennzahl'],           ['00:09:00']],
    ['Liegezeiten-Quote',       [Z, 'Nenner', 'Kennzahl'], ['4', '40', '10.0']],
    ['Onhold-Quote',            [Z, 'Nenner', 'Kennzahl'], ['6', '40', '15.0']],
    ['Auflegerquote',           [Z, 'Nenner', 'Kennzahl'], ['2', '40', '5.0']],
    ['CS',                      [Z, 'Nenner', 'Kennzahl'], ['18', '20', '90.0']],
    ['Promotoren',              ['Kennzahl'],           ['18']],
    ['Detraktoren',             ['Kennzahl'],           ['1']],
    ['Neutrale',                ['Kennzahl'],           ['1']],
    ['TNPS',                    [Z, 'Nenner', 'Kennzahl'], ['14', '20', '70.0']],
    ['Promotoren',              ['Kennzahl'],           ['15']],
    ['Detraktoren',             ['Kennzahl'],           ['2']],
    ['Neutrale',                ['Kennzahl'],           ['3']],
    ['TNPS Antwortquote %',     [Z, 'Nenner', 'Kennzahl'], ['20', '40', '50.0']],
    ['TNPS Deep Detractor %',   [Z, 'Nenner', 'Kennzahl'], ['1', '20', '5.0']],
    ['First-Time-Fix',          [Z, 'Nenner', 'Kennzahl'], ['30', '40', '75.0']],
    ['Total-Fix',               [Z, 'Nenner', 'Kennzahl'], ['36', '40', '90.0']],
    ['Final Fix 7',             [Z, 'Nenner', 'Kennzahl'], ['33', '40', '82.5']],
    ['Final Fix 30',            [Z, 'Nenner', 'Kennzahl'], ['35', '40', '87.5']],
    ['Weiterl.-Quote Skill<> (ASM)', [Z, 'Nenner', 'Kennzahl'], ['5', '40', '12.5']],
];

const gruppenKopf = [];
const leafKopf = [];
const werte = [];
STAMM.forEach(s => { gruppenKopf.push(Zelle(s, 1)); leafKopf.push(Zelle(s)); });
const STAMMWERTE = ['1', 'regiocom', 'Alanya', '21105083', 'Muster, Max', '199362'];
STAMMWERTE.forEach(w => werte.push(Zelle(w)));
GRUPPEN.forEach(([name, subs, vals]) => {
    gruppenKopf.push(Zelle(name, subs.length));
    subs.forEach(s => leafKopf.push(Zelle(s)));
    vals.forEach(v => werte.push(Zelle(v)));
});

const tab = Tabelle([Zeile(gruppenKopf), Zeile(leafKopf)], [Zeile(werte)]);
const kpis = API.parseKpiTable(tab);

// --- Pruefungen --------------------------------------------------------------
let ok = 0, fehler = 0;
function pruef(titel, bedingung, zusatz) {
    if (bedingung) { ok++; console.log('  ok   ' + titel); }
    else { fehler++; console.log('  FEHL ' + titel + (zusatz !== undefined ? '  -> ' + zusatz : '')); }
}

pruef('genau eine Agentenzeile geparst', kpis.length === 1, kpis.length);
const k = kpis[0] || {};

console.log('\n-- feste Felder --');
pruef('ccsId gelesen', k.ccsId === '199362', k.ccsId);
pruef('callCount aus dem AHT-Nenner', k.callCount === 40, k.callCount);
pruef('ACW als Sekunden (00:01:45 = 105)', k.acwSec === 105, k.acwSec);
pruef('ACD als Sekunden (00:05:30 = 330)', k.acdSec === 330, k.acdSec);
pruef('AHT als Sekunden (00:07:15 = 435)', k.ahtSec === 435, k.ahtSec);
pruef('ACHT als Sekunden (00:09:00 = 540)', k.achtSec === 540, k.achtSec);
pruef('CS gelesen', k.cs === 90, k.cs);
pruef('TNPS gelesen', k.tnps === 70, k.tnps);
pruef('Total-Fix gelesen', k.totalFix === 90, k.totalFix);
pruef('Final Fix 7 gelesen', k.ff7 === 82.5, k.ff7);
pruef('CS-Detraktoren = 1. Gruppe (nicht TNPS)', k.detCs === 1, k.detCs);
pruef('TNPS-Detraktoren = 2. Gruppe', k.detTnps === 2, k.detTnps);
pruef('Weiterl.-Quote wird trotz Zusatz "(ASM)" gefunden', k.wq === 12.5, k.wq);

console.log('\n-- generischer Zusatz kpi.alle --');
const a = k.alle || {};
pruef('kpi.alle existiert', !!k.alle);
pruef('Onhold-Quote enthalten (neu, kein festes Feld)', a['Onhold-Quote'] && a['Onhold-Quote'].k === 15, JSON.stringify(a['Onhold-Quote']));
pruef('Liegezeiten-Quote enthalten (neu)', a['Liegezeiten-Quote'] && a['Liegezeiten-Quote'].k === 10, JSON.stringify(a['Liegezeiten-Quote']));
pruef('Final Fix 30 enthalten (neu)', a['Final Fix 30'] && a['Final Fix 30'].k === 87.5, JSON.stringify(a['Final Fix 30']));
pruef('ACW auch im Zusatz, als Sekunden', a['ACW'] && a['ACW'].k === 105, JSON.stringify(a['ACW']));
pruef('AHT traegt Zaehler, Nenner und Kennzahl',
    a['AHT'] && a['AHT'].z === 1200 && a['AHT'].n === 40 && a['AHT'].k === 435, JSON.stringify(a['AHT']));
pruef('Stammspalten stehen NICHT im Zusatz',
    !a['Standort'] && !a['Team'] && !a['Agentenname'] && !a['CCS-ID'] && !a['Zeile'],
    Object.keys(a).filter(x => STAMM.indexOf(x) >= 0).join(','));
pruef('Promotoren zweimal vorhanden und unterscheidbar',
    a['Promotoren'] && a['Promotoren (2)'] && a['Promotoren'].k === 18 && a['Promotoren (2)'].k === 15,
    JSON.stringify([a['Promotoren'], a['Promotoren (2)']]));
pruef('Detraktoren: 1. = CS (1), 2. = TNPS (2)',
    a['Detraktoren'] && a['Detraktoren'].k === 1 && a['Detraktoren (2)'] && a['Detraktoren (2)'].k === 2,
    JSON.stringify([a['Detraktoren'], a['Detraktoren (2)']]));
pruef('Zusatz deckt alle ' + GRUPPEN.length + ' Kennzahlgruppen ab',
    Object.keys(a).length === GRUPPEN.length, Object.keys(a).length + ': ' + Object.keys(a).join(', '));

console.log('\n-- figure_list --');
const F = API.FIGURE_IDS;
pruef('FIGURE_IDS ist gesetzt und nicht leer', Array.isArray(F) && F.length > 0, F && F.length);
pruef('alle IDs sind reine Ziffernfolgen', F.every(x => /^\d+$/.test(x)));
pruef('keine ID doppelt', new Set(F).size === F.length, F.length - new Set(F).size + ' doppelt');
// Die vom Nutzer ausdruecklich genannten und die bisher fehlenden Kennzahlen
const PFLICHT = { '10005': 'ACW', '10004': 'ACD', '10014': 'ACHT', '10006': 'AHT',
                  '10095': 'Onhold-Quote', '10091': 'Liegezeiten-Quote', '10090': 'Liegezeit',
                  '10082': 'Auflegerquote', '10062': 'CS', '10075': 'TNPS',
                  '10080': 'First-Time-Fix', '10081': 'Total-Fix',
                  '10060': 'Final Fix 7', '10067': 'Final Fix 1', '10061': 'Final Fix 30' };
Object.keys(PFLICHT).forEach(id => pruef('figure_list enthaelt ' + id + ' (' + PFLICHT[id] + ')', F.indexOf(id) >= 0));
// Unter-Kennzahlen: ohne sie fehlen im Stand-Export die Detraktoren-Anzahlen
['10063', '10064', '10065', '10076', '10077', '10078'].forEach(id =>
    pruef('figure_list enthaelt Unter-Kennzahl ' + id, F.indexOf(id) >= 0));

// Gegenprobe gegen den Baukasten, falls er erreichbar ist.
const BAUKASTEN = 'C:/Users/v3reg/Downloads/PIX CRAW/Ligaliste/Ligaliste_Crawler.html';
if (fs.existsSync(BAUKASTEN)) {
    const h = fs.readFileSync(BAUKASTEN, 'utf8');
    const m = h.match(/const\s+availableKpis\s*=\s*(\[[\s\S]*?\n\];)/);
    if (m) {
        const portal = JSON.parse(m[1].replace(/;$/, ''));
        const ids = portal.map(x => String(x.id));
        const fehlend = ids.filter(id => F.indexOf(id) < 0);
        pruef('alle ' + ids.length + ' Portal-Kennzahlen sind in FIGURE_IDS',
            fehlend.length === 0,
            fehlend.map(id => id + ' (' + (portal.find(p => String(p.id) === id) || {}).name + ')').join(', '));
        const fremd = F.filter(id => ids.indexOf(id) < 0);
        pruef('keine erfundene ID in FIGURE_IDS', fremd.length === 0, fremd.join(', '));
    }
} else {
    console.log('  --   Baukasten nicht gefunden, Gegenprobe uebersprungen');
}

console.log('\n' + ok + ' bestanden, ' + fehler + ' fehlgeschlagen.');
process.exit(fehler ? 1 : 0);
