// ===========================================================================
//  reporting_kaskade_pruefen.js  —  Pruefwerkzeug (offline, ohne Portal)
// ===========================================================================
//  Prueft den Export-Umbau vom 06.08. abends (Nutzer-Vorgabe "EINE Excel,
//  Ebenen folgen dem Filter, Vertrieb und Qualitaet getrennt"):
//   1. rcAggAusRows poolt Qualitaet je Einheit (Zaehler/Nenner, NIE Mittel;
//      Nenner-0-Zeilen bleiben draussen; AHT ueber Calls gewichtet).
//   2. rcBuildAggSheets baut die Blaetter als KASKADE: ohne Filter
//      Standorte->Stacks->Teams->MA, mit Standort ab Stacks, mit Standort+
//      Stack ab Teams (dann mit Mitarbeiter-Bloecken im Reporting).
//   3. Tab-Reihenfolge trennt VERTRIEB von QUALITAET; die neuen Blaetter
//      "Vertrieb Reporting" / "Qualitaet Reporting" bestehen aus Bloecken
//      nach dem Nutzer-Mockup, der Produkt-Mix summiert sich auf 100 %.
//  Die ECHTEN Funktionen werden per Klammer-Zaehlung aus esl_live_arena_v22.js
//  geschnitten und mit einem Mini-XL-Stub ausgefuehrt — kein Nachbau.
//
//  Aufruf:  node pruefwerkzeuge/reporting_kaskade_pruefen.js
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

// ---- Mini-XL-Stub (nur was decorate/flatSheet wirklich anfassen) ----------
function colName(c){ let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
function enc(r, c){ return colName(c) + (r + 1); }
function baueXLStub(){
    const blaetter = [];
    const XL = {
        utils: {
            aoa_to_sheet(aoa){
                const ws = {}; let maxC = 0;
                aoa.forEach((row, R) => {
                    maxC = Math.max(maxC, row.length);
                    row.forEach((v, C) => {
                        if (v === undefined) return;
                        ws[enc(R, C)] = { t: (typeof v === 'number') ? 'n' : 's', v: v };
                    });
                });
                ws['!ref'] = 'A1:' + enc(Math.max(0, aoa.length - 1), Math.max(0, maxC - 1));
                ws.__aoa = aoa;
                return ws;
            },
            encode_cell(a){ return enc(a.r, a.c); },
            decode_range(ref){
                const m = String(ref).split(':');
                const dec = s => { const mm = s.match(/^([A-Z]+)(\d+)$/); let c = 0;
                    for (const ch of mm[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
                    return { c: c - 1, r: parseInt(mm[2], 10) - 1 }; };
                return { s: dec(m[0]), e: dec(m[1] || m[0]) };
            },
            book_new(){ return { SheetNames: [], Sheets: {} }; },
            book_append_sheet(wb, ws, name){
                // SheetJS wirft bei doppelten Blattnamen — der Alle-Projekte-
                // Export haengt sechs Blaetter in EINE Mappe, das muss der Stub
                // genauso ahnden, sonst bewacht der Test eine Kollision nicht.
                if (wb && wb.SheetNames) {
                    if (wb.SheetNames.indexOf(name) !== -1) throw new Error('Blattname doppelt: ' + name);
                    wb.SheetNames.push(name); wb.Sheets[name] = ws;
                }
                blaetter.push({ name, ws });
            }
        }
    };
    return { XL, blaetter };
}

// ---- Echte Funktionen laden ----------------------------------------------
// Seit 14.08. haengen die Bauer an der Kennzahl-Registry (RC_KENNZAHLEN_*/
// RC_BLAETTER + rcBlattAktiv/rcKennzahlSieb) — der Block liegt im Quelltext
// direkt VOR rcBuildReportingSheets und wird am Stueck mitgenommen.
const registryBlock = src.slice(src.indexOf('const RC_KENNZAHLEN_V'), src.indexOf('function rcBuildReportingSheets('));
if (registryBlock.length < 100 || registryBlock.length > 20000) { console.log('FEHLGESCHLAGEN: Registry-Block nicht sauber schneidbar (' + registryBlock.length + ' Zeichen)'); process.exit(1); }
// Seit 05.10. rechnen rcAggAusRows und rcBuildAggSheets ueber die zentrale
// Stack-Regel und das Blatt "Ohne Stack" — die echten Funktionen dazu kommen
// aus dem gemeinsamen Baustein (_stack_regel.js), nicht aus einem Nachbau.
const quelltext =
    require('./_stack_regel.js').quelltextBlatt(src) + '\n' +
    registryBlock + '\n' +
    schneideAus(src, 'function rcAggAusRows(') + '\n' +
    schneideAus(src, 'function rcBuildReportingSheets(') + '\n' +
    schneideAus(src, 'function rcBuildAggSheets(') + '\n' +
    'return { rcAggAusRows, rcBuildAggSheets, rcBuildReportingSheets };';
function baueUmgebung(){
    // Stubs fuer die freien Bezuege der beiden Funktionen. classify nur mit den
    // Test-Produktgruppen; stdFullName/bcrOf/nonBcrOf/fmtAht minimal.
    const classify = g => ({
        'KIP BNT': { cat: 'kip' }, 'Mobilfunk BNT': { cat: 'mob' }, 'ENV BNT': { cat: 'env' },
        'PTV BNT': { cat: 'ptv' }, 'DSL Glasfaser BNT': { cat: 'fibDsl' }, 'KIP VVL': { cat: 'kipVvl' }
    }[g] || { cat: null });
    const w = { rcWcaMapping: { stackMap: { 'VKD-TECH-83': 'VKD_Tech', 'MF-CARE-01': 'MF_CARE', 'VKD-TECH-52': 'VKD_Tech' } } };
    const fn = new Function('window', 'classify', 'stdFullName', 'bcrOf', 'nonBcrOf', 'fmtAht', quelltext);
    return fn(w, classify,
        code => code,                                    // stdFullName
        o => (o.bcr == null ? '' : o.bcr),               // bcrOf
        o => (o.nonBcr == null ? '' : o.nonBcr),         // nonBcrOf
        sek => Math.floor(sek / 60) + ':' + String(Math.round(sek % 60)).padStart(2, '0'));
}

// ---- Testdaten: 2 Standorte, 2 Stacks in AL, Nenner-0-Falle --------------
const zeile = (o) => Object.assign({
    team: '', name: '', calls: 0, standort: '', ccs: '', ahtSec: null, hasEsl: true,
    ansp: 0, kont: 0, mob: 0, kip: 0, bnt: 0, vvl: 0, detr: null, prodG: null, prodGBcr: null,
    cs: null, tnps: null, fq: null, dds: null, ftf: null
}, o);
const ROWS = [
    zeile({ name: 'A Eins', ccs: '1', team: 'VKD-TECH-83', standort: 'AL', calls: 100, ahtSec: 600,
        ansp: 40, kont: 50, kip: 4, mob: 10, bnt: 20, vvl: 5,
        prodG: { 'KIP BNT': 4, 'Mobilfunk BNT': 10, 'ENV BNT': 3, 'PTV BNT': 2, 'DSL Glasfaser BNT': 1, 'KIP VVL': 5 },
        prodGBcr: { 'KIP BNT': 4, 'Mobilfunk BNT': 8 },
        cs: { z: 45, n: 50 }, tnps: { z: 10, n: 40 }, fq: { z: 5, n: 0 },   // fq: Nenner 0 -> NICHT poolen!
        dds: { z: 2, n: 40 }, ftf: { z: 30, n: 40 }, aq: { z: 1, n: 100 }, detr: 3 }),   // aq wird ignoriert (30.10.): steht bewusst als Gegenprobe da
    zeile({ name: 'B Zwei', ccs: '2', team: 'VKD-TECH-83', standort: 'AL', calls: 50, ahtSec: 300,
        ansp: 10, kont: 20, kip: 1, mob: 2, bnt: 4, vvl: 1,
        prodG: { 'KIP BNT': 1, 'Mobilfunk BNT': 2, 'ENV BNT': 1, 'KIP VVL': 1 },
        cs: { z: 20, n: 25 }, tnps: { z: -5, n: 20 }, fq: { z: 8, n: 10 }, detr: 1 }),
    zeile({ name: 'C Drei', ccs: '3', team: 'MF-CARE-01', standort: 'AL', calls: 80, ahtSec: 450,
        ansp: 20, kont: 30, kip: 2, mob: 6, bnt: 10, vvl: 2,
        prodG: { 'KIP BNT': 2, 'Mobilfunk BNT': 6, 'ENV BNT': 1, 'PTV BNT': 1, 'KIP VVL': 2 },
        cs: { z: 70, n: 80 }, tnps: { z: 30, n: 60 }, fq: { z: 4, n: 8 } }),
    zeile({ name: 'D Vier', ccs: '4', team: 'VKD-TECH-52', standort: 'B', calls: 60, ahtSec: 500,
        ansp: 15, kont: 25, kip: 3, mob: 4, bnt: 8, vvl: 2,
        prodG: { 'KIP BNT': 3, 'Mobilfunk BNT': 4, 'ENV BNT': 1, 'KIP VVL': 2 },
        cs: { z: 40, n: 50 }, tnps: { z: 12, n: 30 }, fq: { z: 3, n: 6 } })
];
const DATA = { rows: ROWS };

// ===========================================================================
abschnitt('1. rcAggAusRows poolt die Qualitaet je Einheit');
// ===========================================================================
const U = baueUmgebung();
const agg = U.rcAggAusRows(DATA);
const al = agg.stds.find(s => s.code === 'AL');
pruef('Standort-Eimer traegt gepoolte CS-Summen (csZ/csN)',
    al && al.csZ === 45 + 20 + 70 && al.csN === 50 + 25 + 80, al && (al.csZ + '/' + al.csN));
pruef('Nenner-0-Zeile poolt NICHT (fq: 5/0 bleibt draussen)',
    al && al.fqZ === 8 + 4 && al.fqN === 10 + 8, al && (al.fqZ + '/' + al.fqN));
pruef('GEGENPROBE: naive Summe MIT der Nenner-0-Zeile waere 17/18 — genau das steht NICHT da',
    !(al && al.fqZ === 17));
pruef('AHT ueber Calls gewichtet mit eigenem Nenner',
    al && al.ahtN === 230 && Math.abs(al.ahtW - (600*100 + 300*50 + 450*80)) < 0.01,
    al && (al.ahtW + '/' + al.ahtN));
pruef('Detraktoren werden addiert (Anzahl), fehlende bleiben draussen',
    al && al.detr === 4, al && al.detr);
const vkdAl = agg.stacks.find(o => o.standort === 'AL' && o.stack === 'VKD_Tech');
pruef('Stack-Eimer (AL|VKD_Tech) poolt nur seine beiden Agenten',
    vkdAl && vkdAl.csZ === 65 && vkdAl.csN === 75 && vkdAl.ligaCalls === 150,
    vkdAl && (vkdAl.csZ + '/' + vkdAl.csN + ' lc=' + vkdAl.ligaCalls));
const t83 = agg.teams.find(t => t.name === 'VKD-TECH-83');
pruef('Team-Eimer poolt Qualitaet ebenso', t83 && t83.tnpsZ === 5 && t83.tnpsN === 60,
    t83 && (t83.tnpsZ + '/' + t83.tnpsN));
pruef('Agenten tragen ihre {z,n}-Paare unveraendert (fuer MA-Bloecke)',
    agg.agents[0].cs && agg.agents[0].cs.z === 45 && agg.agents[0].cs.n === 50 && agg.agents[0].ahtSec === 600);

// ===========================================================================
abschnitt('2. Kaskade: welche Blaetter je Filter');
// ===========================================================================
// Seit 30.10. sind ab Werk nur acht Blaetter an. Die Kaskade-Pruefungen brauchen ALLE Ebenen,
// also wird der Dialog-Zustand "alles zugeschaltet" uebergeben; mit werk=true laeuft der Werkszustand.
const ALLE = { blaetter: { produkte:true, analyseAgenten:true, reportingQ:true, standorte:true, stacks:true,
    ligaStandorte:true, ligaTeams:true, entwicklung:true } };
function baue(scope, werk){
    const { XL, blaetter } = baueXLStub();
    const a2 = U.rcAggAusRows(DATA);
    a2.trendScope = scope;
    U.rcBuildAggSheets(XL, {}, false, a2, 'TESTTITEL', werk ? undefined : ALLE);
    return blaetter;
}
const namen = bl => bl.map(b => b.name);

const ohneFilter = baue({ std: 'ALL', stack: 'ALL', team: 'ALL' });
{
    const n = namen(baue({ std: 'ALL', stack: 'ALL', team: 'ALL' }, true));
    pruef('Werkszustand (ohne Auswahl): Qualitaet Reporting, Standorte, Stacks, Liga-Blaetter, Entwicklung fehlen',
        !['Qualitaet Reporting','Standorte','Stacks','Liga Standorte','Liga Teams','Entwicklung'].some(x => n.includes(x)), n.join(','));
    pruef('Werkszustand: Vertrieb Reporting, Struktur, Teams, Agenten bleiben',
        ['Vertrieb Reporting','Struktur','Teams','Agenten'].every(x => n.includes(x)), n.join(','));
}
{
    const n = namen(ohneFilter);
    pruef('ohne Filter: alle Ebenen da (Standorte, Stacks, Teams, Agenten)',
        n.includes('Standorte') && n.includes('Stacks') && n.includes('Teams') && n.includes('Agenten'), n.join(','));
    pruef('neue Blaetter existieren: Vertrieb Reporting + Qualitaet Reporting',
        n.includes('Vertrieb Reporting') && n.includes('Qualitaet Reporting'));
    pruef('Tab-Reihenfolge trennt V von Q (Agenten VOR Qualitaet Reporting, Liga-Blaetter DANACH)',
        n.indexOf('Vertrieb Reporting') === 0 &&
        n.indexOf('Agenten') < n.indexOf('Qualitaet Reporting') &&
        n.indexOf('Qualitaet Reporting') < n.indexOf('Liga Standorte') &&
        n.indexOf('Liga Standorte') < n.indexOf('Liga Teams'), n.join(' | '));
    const vr = ohneFilter.find(b => b.name === 'Vertrieb Reporting').ws.__aoa;
    const titelZellen = vr.filter(r => r.length === 1).map(r => r[0]);
    // Zeile 0 ist die Kopfzeile mit Zeitraum/Scope — ohne sie weiss der
    // Empfaenger der schlanken Mappe nicht, worauf sich die Zahlen beziehen.
    pruef('Blatt beginnt mit der Kopfzeile (Zeitraum/Scope)',
        titelZellen[0] === 'TESTTITEL', titelZellen[0]);
    pruef('… danach folgt der Block ALLE STANDORTE',
        titelZellen[1] === 'ALLE STANDORTE', titelZellen[1]);
    pruef('je Standort ein Block (STANDORT - AL / STANDORT - B)',
        titelZellen.some(t => /^STANDORT - AL$/.test(t)) && titelZellen.some(t => /^STANDORT - B$/.test(t)));
    pruef('je Stack ein Block mit Teams (STACK - VKD_TECH (AL))',
        titelZellen.some(t => /^STACK - VKD_TECH\s+\(AL\)$/.test(t)));
    pruef('ohne Filter KEINE Mitarbeiter-Bloecke (500 Agenten wuerden das Blatt sprengen)',
        !titelZellen.some(t => /MITARBEITER/.test(t)));
}
{
    const n = namen(baue({ std: 'AL', stack: 'ALL', team: 'ALL' }));
    pruef('Standort-Filter: Blaetter "Standorte" und "Liga Standorte" ENTFALLEN',
        !n.includes('Standorte') && !n.includes('Liga Standorte'), n.join(','));
    pruef('… Stacks/Teams/Agenten bleiben', n.includes('Stacks') && n.includes('Teams') && n.includes('Agenten'));
}
{
    const bl = baue({ std: 'AL', stack: 'VKD_Tech', team: 'ALL' });
    const n = namen(bl);
    pruef('Standort+Stack-Filter: auch Blatt "Stacks" ENTFAELLT',
        !n.includes('Stacks') && !n.includes('Standorte'), n.join(','));
    const vr = bl.find(b => b.name === 'Vertrieb Reporting').ws.__aoa;
    const titelZellen = vr.filter(r => r.length === 1).map(r => r[0]);
    pruef('… jetzt MIT Mitarbeiter-Bloecken je Team',
        titelZellen.some(t => /^TEAM - VKD-TECH-83/.test(t) && /MITARBEITER/.test(t)), titelZellen.join(' | '));
    pruef('… und NUR der gefilterte Stack als Block (kein MF_CARE)',
        titelZellen.some(t => /VKD_TECH/.test(t)) && !titelZellen.some(t => /MF_CARE/.test(t)));
}
pruef('GEGENPROBE: ohne Filter waere "Standorte" da — der Test unterscheidet wirklich',
    namen(ohneFilter).includes('Standorte'));

// ===========================================================================
abschnitt('3. Inhalt der Reporting-Blaetter');
// ===========================================================================
{
    const vr = ohneFilter.find(b => b.name === 'Vertrieb Reporting').ws.__aoa;
    // Zeile "AL" im Block ALLE STANDORTE: [label, CALLS, ANSPR, ANSPR%, KIP, MOB, ENV, PTV, DSL/FIB, VVL, GESAMT, ...mix]
    // Spalten seit 06.08. nachts: 1 CALLS (Liga), 2 KONT. (ESL), 3 ANSPR.,
    // 4 ANSPR. % (auf KONT., wie im ESL-Original), 5 ANSPR. % LIGA,
    // 6..11 Stueck, 12 GESAMT, 13..18 Mix.
    const alZ = vr.find(r => r[0] === 'AL' && r.length > 12);
    pruef('AL-Zeile: CALLS = Liga-Summe (230), KONT. = ESL-Summe (100), ANSPR. = 70',
        alZ && alZ[1] === 230 && alZ[2] === 100 && alZ[3] === 70,
        alZ && (alZ[1] + '/' + alZ[2] + '/' + alZ[3]));
    pruef('ANSPR. % = 70/100 auf ESL-Kontakte (deckt sich mit dem ESL-Original)',
        alZ && Math.abs(alZ[4] - 70 / 100) < 0.001, alZ && alZ[4]);
    pruef('ANSPR. % LIGA = 70/230 daneben (die Steuerungsgroesse)',
        alZ && Math.abs(alZ[5] - 70 / 230) < 0.001, alZ && alZ[5]);
    pruef('GEGENPROBE: die beiden Quoten sind verschieden (zwei Nenner-Welten)',
        alZ && alZ[4] !== alZ[5]);
    pruef('GESAMT = BNT+VVL (34+8=42)', alZ && alZ[12] === 42, alZ && alZ[12]);
    const mixSumme = alZ ? (alZ[13] + alZ[14] + alZ[15] + alZ[16] + alZ[17] + alZ[18]) : 0;
    pruef('Produkt-Mix (KIP/MOB/ENV/PTV/DSL-FIB/VVL) summiert sich auf ~100 %',
        alZ && Math.abs(mixSumme - ((7 + 18 + 5 + 3 + 1 + 8) / 42)) < 0.005, mixSumme);
    const kopf = vr.find(r => r[1] === 'CALLS');
    pruef('VERTRIEB-Blatt traegt KEINE Qualitaets-Spalten (CS/TNPS/AHT)',
        kopf && !kopf.some(c => /CS|TNPS|AHT|DDS|FTF/.test(String(c))), kopf && kopf.join(','));
    pruef('… und beide Quoten-Spalten stehen beschriftet im Kopf',
        kopf && kopf[2] === 'KONT.' && kopf[4] === 'ANSPR. %' && kopf[5] === 'ANSPR. % LIGA', kopf && kopf.join(','));
}
{
    const qr = ohneFilter.find(b => b.name === 'Qualitaet Reporting').ws.__aoa;
    const alZ = qr.find(r => r[0] === 'AL' && r.length > 5);
    pruef('Qualitaet AL: CS = 135/155 gepoolt (Bruch)', alZ && Math.abs(alZ[3] - 135 / 155) < 0.001, alZ && alZ[3]);
    pruef('TNPS als PUNKTWERT (35/120*100 = 29.2), nicht als Bruch',
        alZ && Math.abs(alZ[4] - 29.2) < 0.1, alZ && alZ[4]);
    // Nachgerechnet: (600*100 + 300*50 + 450*80) / 230 = 482.6 s = 8:03.
    pruef('AHT als lesbare Dauer (gewichtet 482.6s -> "8:03")', alZ && String(alZ[2]) === '8:03', alZ && alZ[2]);
    const kopf = qr.find(r => r[1] === 'CALLS');
    pruef('QUALITAET-Blatt traegt KEINE Vertriebs-Spalten (KIP/MOB/VVL/ANSPR)',
        kopf && !kopf.some(c => /KIP|MOB|VVL|ANSPR|GESAMT/.test(String(c))), kopf && kopf.join(','));
    // AQ ist raus (Nutzer-Entscheidung 30.10.). Die Testzeile A Eins traegt weiter aq {z:1,n:100} als Gegenprobe:
    // die Eingabe darf ankommen, im Blatt steht sie nicht — Kopf endet auf FTF %, DETR.
    pruef('QUALITAET-Blatt: Kopf ohne AQ (…, DDS %, FTF %, DETR.), trotz aq-Daten in der Eingabe',
        kopf && kopf.join('|') === '|CALLS|AHT|CS %|TNPS|FQ %|DDS %|FTF %|DETR.' && alZ && alZ.length === kopf.length && alZ[8] === 4,   // Detraktoren AL: 3 + 1
        kopf && kopf.join('|') + ' / AL-Detra ' + (alZ && alZ[8]));
}

// ===========================================================================
abschnitt('4. Schlanke Reporting-Mappe (nur die Block-Blaetter)');
// ===========================================================================
// Nutzer-Vorgabe 06.08. spaetabends: "eine Excel, wo nur das drin ist".
// rcBuildReportingSheets ist DIESELBE Funktion, die auch der volle Bericht
// benutzt — eine zweite Fassung der Blaetter waere der teuerste Fallstrick.
{
    const { XL, blaetter } = baueXLStub();
    const a = U.rcAggAusRows(DATA);
    a.trendScope = { std:'ALL', stack:'ALL', team:'ALL' };
    U.rcBuildReportingSheets(XL, {}, false, a, 'TESTTITEL');
    const n = blaetter.map(b => b.name);
    pruef('die Mappe enthaelt GENAU die beiden Block-Blaetter',
        n.length === 2 && n[0] === 'Vertrieb Reporting' && n[1] === 'Qualitaet Reporting', n.join(','));
    pruef('… also KEIN Stand-/Analyse-/Liga-/Struktur-Blatt',
        !n.some(x => /Stand|Analyse|Liga|Struktur|Agenten|Abdeckung|Produkte/.test(x)), n.join(','));
    const aoa = blaetter[0].ws.__aoa;
    pruef('Blatt traegt oben die Kopfzeile mit Zeitraum/Scope', aoa[0][0] === 'TESTTITEL', aoa[0][0]);
}
{
    // Die Trennung im vollen Bericht laeuft ueber denselben Bauer, nur
    // zweigeteilt — sonst waere die Tab-Reihenfolge nicht V vor Q.
    const { XL, blaetter } = baueXLStub();
    const a = U.rcAggAusRows(DATA);
    a.trendScope = { std:'ALL', stack:'ALL', team:'ALL' };
    U.rcBuildReportingSheets(XL, {}, false, a, 'T', 'vertrieb');
    pruef("nur='vertrieb' baut ausschliesslich das Vertriebs-Blatt",
        blaetter.length === 1 && blaetter[0].name === 'Vertrieb Reporting', blaetter.map(b=>b.name).join(','));
}
{
    const { XL, blaetter } = baueXLStub();
    const a = U.rcAggAusRows(DATA);
    a.trendScope = { std:'ALL', stack:'ALL', team:'ALL' };
    U.rcBuildReportingSheets(XL, {}, false, a, 'T', 'qualitaet', undefined, ALLE);
    pruef("nur='qualitaet' baut ausschliesslich das Qualitaets-Blatt (Blatt zugeschaltet)",
        blaetter.length === 1 && blaetter[0].name === 'Qualitaet Reporting', blaetter.map(b=>b.name).join(','));
}
{
    // Im vollen Bericht ist Qualitaet Reporting ab Werk AUS (30.10.) — nur die schlanke Mappe
    // (weder nur noch wahl) baut beide Bloecke, siehe weiter oben.
    const { XL, blaetter } = baueXLStub();
    const a = U.rcAggAusRows(DATA);
    a.trendScope = { std:'ALL', stack:'ALL', team:'ALL' };
    U.rcBuildReportingSheets(XL, {}, false, a, 'T', 'qualitaet');
    pruef("nur='qualitaet' ohne Auswahl baut im Werkszustand NICHTS", blaetter.length === 0, blaetter.map(b=>b.name).join(','));
}
{
    // Leere Datenlage darf keine kaputte Mappe erzeugen: SheetJS wirft beim
    // Schreiben einer Mappe ohne Blatt.
    const { XL, blaetter } = baueXLStub();
    const leer = U.rcAggAusRows({ rows: [] });
    leer.trendScope = { std:'ALL', stack:'ALL', team:'ALL' };
    U.rcBuildReportingSheets(XL, {}, false, leer, 'T');
    pruef('ohne Daten wird KEIN leeres Blatt angelegt', blaetter.length === 0, blaetter.length);
}
// Verdrahtung im Dashboard und im Mailskript
const fsx = require('fs');
const dash = src;
const mail = fsx.readFileSync(path.join(WURZEL, 'esl_mail_report.ps1'), 'utf8');
// Seit 09.08. folgt ein vierter Parameter (melden) - der Rueckmeldekanal des
// Dialogs, damit ein Abbruch nicht mehr per alert() die Fernsteuerung blockiert.
// Die ersten drei Parameter muessen ihre Position behalten.
pruef('rcExportReporting existiert und ist global',
    /window\.rcExportReporting = function\(vonKey, bisKey, scope(,\s*melden)?\)/.test(dash));
pruef('… und benutzt DENSELBEN Blatt-Bauer (keine zweite Fassung)',
    /rcBuildReportingSheets\(XL, wb, !!XL\.__styled, agg, rcZeitraumText\(data\)\);/.test(dash));
pruef('Export-Dialog hat den Knopf "Nur Reporting"',
    /id="rcExWahlRep"/.test(dash) && /an\('rcExWahlRep'/.test(dash));
pruef('Report-Modul kennt den Schalter reportingMappe',
    /c\.reportingMappe=!!c\.reportingMappe;/.test(dash));
pruef('… ist ab Werk AUS (nichts kommt ungefragt dazu)',
    !/reportingMappe\s*=\s*true/.test(dash));
// Seit 09.08. bekommt buildReportingXlsx zusaetzlich einen Rueckruf, damit
// ESL_Start.cmd weiss, wann der Dateisatz vollstaendig ist. Die BEDINGUNG davor
// ist das, was hier geprueft wird.
pruef('download() schreibt die Mappe nur bei eingeschaltetem Schalter',
    /if\(CFG\.reportingMappe\) buildReportingXlsx\(base, data/.test(dash));
pruef('GEGENPROBE: ohne die Bedingung waere die Pruefung rot',
    !/if\(CFG\.reportingMappe\) buildReportingXlsx/.test(
        dash.replace(/if\(CFG\.reportingMappe\) buildReportingXlsx/g, 'buildReportingXlsx')));
pruef('sie traegt den Namensstamm der Stunde (-reporting.xlsx)',
    /base\+'-reporting\.xlsx'/.test(dash),
    'das Mailskript findet sie ueber BaseName, nicht ueber "neueste xlsx"');
pruef('Konfigurator: Schalter steht in BEIDEN Listen (Aufbau + change)',
    /swc\('cfgRepRepMappe'/.test(dash) && /q\('cfgRepRepMappe'\),'change'/.test(dash));
pruef('Mailskript sucht die Reporting-Mappe am selben Stamm',
    /\$stamm \+ '-reporting\.xlsx'/.test(mail));
pruef('Mailskript haengt sie an (in jedem Modus)',
    /if \(\$hatRep\) \{[\s\S]{0,200}Attachments\.Add\(\$rep\)/.test(mail));
pruef('… und ihr Fehlen ist KEIN Abbruchgrund',
    !/hatRep[\s\S]{0,120}Ende 1/.test(mail));

// ===========================================================================
abschnitt('5. Reporting ueber ALLE drei Projekte (rcExportReportingAlle)');
// ===========================================================================
// Nutzer-Vorgabe 06.08. spaetabends: "einmal bei esl auf kabel, mobilfunk und
// um umschalten, die reportings holen und mir dann geben." Der Export liest
// die projekt-getrennten Historien-Schluessel und baut EINE Mappe. Geprueft
// werden hier die Textmuster der kritischen Regeln — die Blatt-Logik selbst
// laeuft oben funktional (derselbe Bauer rcBuildReportingSheets).
pruef('rcExportReportingAlle existiert und ist global',
    /window\.rcExportReportingAlle = function\(vonKey, bisKey(,\s*melden)?\)/.test(src));
pruef('liest die PROJEKT-GETRENNTEN Schluessel direkt (Suffixe _mob/_um, Kabel ohne)',
    /localStorage\.getItem\('rcEslHistory'\s*\+ p\.sfx/.test(src) &&
    /localStorage\.getItem\('rcLigaHistDash' \+ p\.sfx/.test(src) &&
    /sfx:'_mob'/.test(src) && /sfx:'_um'/.test(src) && /sfx:''/.test(src));
pruef('haengt die window-Historien um und stellt sie im finally EXAKT zurueck',
    /sicher = \{[\s\S]{0,120}esl:\s*window\.rcEslHistory/.test(src) &&
    /finally \{[\s\S]{0,220}window\.rcEslHistory\s*=\s*sicher\.esl;[\s\S]{0,120}window\.__rcHistorieErzwingen = sicher\.zwang;/.test(src));
pruef('FREMDE Projekte werden in den Historien-Zweig gezwungen (__rcHistorieErzwingen)',
    /window\.__rcHistorieErzwingen = \(p\.sfx !== eigenesSfx\);/.test(src));
pruef('… und rcStandRows beachtet das Flag im live-Schalter',
    /const live = !window\.__rcHistorieErzwingen && \(!dayKey \|\| dayKey === tKey\);/.test(src));
pruef('GEGENPROBE: ohne das Flag laese ein fremdes Projekt die Live-Daten des aktiven',
    !/const live = \(!dayKey \|\| dayKey === tKey\);/.test(src));
pruef('Blattnamen je Projekt (Vertrieb KABEL / Qualitaet MOBILE / ...) ueber namen-Override',
    /\{ v: 'Vertrieb ' \+ e\.p\.name, q: 'Qualitaet ' \+ e\.p\.name \}/.test(src) &&
    /function rcBuildReportingSheets\(XL, wb, styled, agg, titel, nur, namen, wahl\)/.test(src));   // wahl seit 14.08. (Kennzahl-Haekchen)
pruef('Deckblatt "Projekte im Vergleich" mit getrennten Tabellen VERTRIEB/QUALITAET',
    /'Projekte im Vergleich'/.test(src) && /aoa\.push\(\['VERTRIEB'\]\)/.test(src) && /aoa\.push\(\['QUALITAET'\]\)/.test(src));
pruef('ein Projekt ohne Daten wird als Luecke GENANNT, nicht verschwiegen',
    /KEINE DATEN auf diesem PC/.test(src));
pruef('gar keine Daten -> Abbruch mit Anleitung statt leerer Mappe',
    /Keines der drei Projekte hat Daten auf diesem PC/.test(src));
pruef('der Datenstand steht dran (live vs. Archiv des letzten Laufs)',
    /'Archiv \(letzter Lauf dieses Projekts\)'/.test(src) && /DATENSTAND/.test(src));
pruef('Dialog-Knopf ALLE Projekte existiert und ist verdrahtet',
    /id="rcExWahlRepAlle"/.test(src) && /an\('rcExWahlRepAlle'/.test(src) &&
    /rcExportReportingAlle\(b\.von, b\.bis/.test(src));
pruef('KEINE Automatik-Navigation durch die ESL-Projekte (Ein-Projekt-je-PC-Modell)',
    !/gotoProjekt|Page\.navigate|location\.href\s*=/.test(schneideAus(src, 'window.rcExportReportingAlle = function')));
// namen-Override FUNKTIONAL: dreimal in EINE Mappe ohne Namenskollision.
{
    const { XL, blaetter } = baueXLStub();
    const a = U.rcAggAusRows(DATA);
    a.trendScope = { std:'ALL', stack:'ALL', team:'ALL' };
    const wb = {};
    U.rcBuildReportingSheets(XL, wb, false, a, 'T', undefined, { v:'Vertrieb KABEL', q:'Qualitaet KABEL' });
    U.rcBuildReportingSheets(XL, wb, false, a, 'T', undefined, { v:'Vertrieb MOBILE', q:'Qualitaet MOBILE' });
    U.rcBuildReportingSheets(XL, wb, false, a, 'T', undefined, { v:'Vertrieb UM', q:'Qualitaet UM' });
    const n = blaetter.map(b => b.name);
    pruef('namen-Override: drei Projekte ergeben sechs eindeutige Blaetter',
        n.length === 6 && new Set(n).size === 6 &&
        n.includes('Vertrieb KABEL') && n.includes('Qualitaet UM'), n.join(','));
    pruef('… alle Blattnamen unter Excels 31-Zeichen-Grenze',
        n.every(x => x.length <= 31));
}

// ===========================================================================
abschnitt('6. rcExportReportingAlle FUNKTIONAL (echte Funktion, Stubs drumherum)');
// ===========================================================================
// Der Textcheck oben sagt nur, DASS die Regeln dastehen. Hier laeuft die echte
// Funktion: drei Projekte mit UNTERSCHIEDLICHEN Zahlen im localStorage, und
// geprueft wird, ob jedes Projekt SEINE Zahlen bekommt (die Umhaeng-Mechanik
// ist der riskante Teil) und ob der window-Zustand exakt zurueckgestellt wird.
{
    const { XL, blaetter } = baueXLStub();
    // Je Projekt eine eigene, eindeutig erkennbare Liga-Call-Zahl.
    const CALLS = { '': 111, '_mob': 222, '_um': 333 };
    const store = {};
    Object.keys(CALLS).forEach(sfx => {
        store['rcEslHistory' + sfx]  = JSON.stringify({ '2026-08-06': { byAgent:{} } });
        store['rcLigaHistDash' + sfx] = JSON.stringify({ '2026-08-06': { byAgent:{} } });
    });
    const gesehen = [];          // welche Historie hing beim jeweiligen Aufruf am window?
    let wbGebaut = null;
    const w = { rcSagen: function(t){ (w.__sagen = w.__sagen || []).push(String(t)); },
        rcProjektKuerzel: 'mob',                    // dieser PC faehrt MOBILE
        rcEslHistory: { EIGEN:1 }, rcLigaHistory: { EIGEN:1 },
        __rcHistorieErzwingen: undefined,
        rcLetzteStats: null, rcKpiData: {}
    };
    // rcStandRowsZeitraum protokolliert, WAS gerade am window haengt, und
    // liefert je Projekt eine Zeile mit der passenden Call-Zahl.
    // Der Ausschnitt ist eine ZUWEISUNG an window — danach die Funktion selbst
    // zurueckgeben, sonst kaeme undefined heraus.
    const src6 =
        schneideAus(src, 'window.rcExportReportingAlle = function') +
        '; return window.rcExportReportingAlle;';
    // rcLogoAnkerLeeren (09.08.): die Reporting-Mappe baut die Stand-Blaetter
    // nicht und erbte deshalb deren Logo-Anker aus dem vorigen Lauf. Hier nur
    // ein Stub - geprueft wird der Anker-Leak in report_filter_pruefen.js.
    const bauen6 = new Function(
        'window','localStorage','rcTodayKey','rcStandRowsZeitraum','rcAggAusRows','rcLoadStyledXlsx',
        'rcBuildReportingSheets','rcXlsxSpeichern','rcZeitraumText','rcDatumKurz','fmtAht','rcLog','alert','console',
        'rcLogoAnkerLeeren',
        src6);
    bauen6(
        w,
        { getItem: k => (k in store ? store[k] : null) },
        () => '2026-08-06',
        function(von, bis, scope){
            // Welcher Schluessel haengt gerade? Am Marker EIGEN erkennbar.
            const eigen = w.rcEslHistory && w.rcEslHistory.EIGEN === 1;
            gesehen.push({ eigen: !!eigen, zwang: w.__rcHistorieErzwingen,
                           hatHist: !!(w.rcEslHistory && w.rcEslHistory['2026-08-06']) });
            // Reihenfolge der Projekte: kabel, mobile, um
            const idx = gesehen.length - 1;
            const calls = [111, 222, 333][idx];
            return { rows: [ { team:'T', name:'A', calls, standort:'AL', ccs:'1', hasEsl:true, ansp:5,
                               kont:10, kip:1, mob:1, bnt:2, vvl:0, ahtSec:300,
                               cs:{z:1,n:2}, tnps:null, fq:null, dds:null, ftf:null, detr:null } ],
                     label:'Test', von, bis, tageListe:['2026-08-06'], tageMitDaten:1, tageGesamt:1 };
        },
        U.rcAggAusRows,
        function(cb){ cb(XL); },                    // rcLoadStyledXlsx
        U.rcBuildReportingSheets,
        // Muss ein Promise liefern: seit 09.08. haengt der Aufrufer ein .then
        // an, das erst nach dem echten Speichern "Fertig" meldet.
        function(XLa, wb, fn){ wbGebaut = { wb, fn }; return Promise.resolve(); },
        () => 'ZEITRAUMTEXT',
        k => k,
        s => Math.floor(s/60) + ':' + String(Math.round(s%60)).padStart(2,'0'),
        { log(){}, warn(){} },
        function(){},                               // alert
        { log(){}, warn(){} },
        function(){}                                // rcLogoAnkerLeeren
    )('2026-08-06','2026-08-06');

    pruef('alle DREI Projekte wurden abgefragt', gesehen.length === 3, gesehen.length);
    pruef('fremde Projekte werden in den Historien-Zweig gezwungen (kabel/um)',
        gesehen[0].zwang === true && gesehen[2].zwang === true,
        JSON.stringify(gesehen.map(g => g.zwang)));
    pruef('das EIGENE Projekt (mobile) darf live rechnen',
        gesehen[1].zwang === false, gesehen[1].zwang);
    pruef('je Projekt hing dessen EIGENE Historie am window (nicht die des PCs)',
        gesehen.every(g => !g.eigen && g.hatHist), JSON.stringify(gesehen));
    pruef('window-Zustand ist danach EXAKT zurueckgestellt',
        w.rcEslHistory && w.rcEslHistory.EIGEN === 1 &&
        w.rcLigaHistory && w.rcLigaHistory.EIGEN === 1 &&
        w.__rcHistorieErzwingen === undefined,
        JSON.stringify({ esl:w.rcEslHistory, zwang:w.__rcHistorieErzwingen }));

    const namen = blaetter.map(b => b.name);
    pruef('Mappe: Deckblatt + 2 Blaetter je Projekt = 7',
        namen.length === 7 && namen[0] === 'Projekte im Vergleich', namen.join(','));
    pruef('… mit projekt-eigenen, eindeutigen Blattnamen',
        new Set(namen).size === 7 && namen.includes('Vertrieb KABEL') &&
        namen.includes('Qualitaet MOBILE') && namen.includes('Vertrieb UM'), namen.join(','));
    pruef('Dateiname nennt ALLE', wbGebaut && /regiocom_ESL_Reporting_ALLE_/.test(wbGebaut.fn), wbGebaut && wbGebaut.fn);

    // Das Deckblatt muss je Projekt DESSEN Liga-Calls zeigen — der Beweis, dass
    // nicht dreimal dieselben (die des aktiven Projekts) exportiert wurden.
    const deck = blaetter[0].ws.__aoa;
    const zeileVon = n => deck.find(r => r[0] === n && r.length > 3);
    pruef('Deckblatt KABEL zeigt 111 Calls', zeileVon('KABEL') && zeileVon('KABEL')[1] === 111, zeileVon('KABEL') && zeileVon('KABEL')[1]);
    pruef('Deckblatt MOBILE zeigt 222 Calls', zeileVon('MOBILE') && zeileVon('MOBILE')[1] === 222, zeileVon('MOBILE') && zeileVon('MOBILE')[1]);
    pruef('Deckblatt UM zeigt 333 Calls', zeileVon('UM') && zeileVon('UM')[1] === 333, zeileVon('UM') && zeileVon('UM')[1]);
    pruef('GEGENPROBE: die drei Zahlen sind VERSCHIEDEN (kein Projekt dreimal)',
        new Set([zeileVon('KABEL')[1], zeileVon('MOBILE')[1], zeileVon('UM')[1]]).size === 3);
    pruef('Deckblatt trennt VERTRIEB und QUALITAET als eigene Tabellen',
        deck.some(r => r[0] === 'VERTRIEB') && deck.some(r => r[0] === 'QUALITAET'));
    // Vertriebs-Kopf darf keine Qualitaets-Spalte tragen und umgekehrt.
    const kopfV = deck.find(r => r[0] === 'PROJEKT' && r[2] === 'KONT.');
    const kopfQ = deck.find(r => r[0] === 'PROJEKT' && r[2] === 'AHT');
    pruef('Vertriebs-Tabelle ohne Qualitaets-Spalten',
        kopfV && !kopfV.some(c => /CS|TNPS|AHT|DDS|FTF/.test(String(c))), kopfV && kopfV.join(','));
    pruef('Qualitaets-Tabelle ohne Vertriebs-Spalten',
        kopfQ && !kopfQ.some(c => /KIP|MOB|VVL|ANSPR|GESAMT/.test(String(c))), kopfQ && kopfQ.join(','));
    pruef('Qualitaets-Tabelle nennt den DATENSTAND je Projekt',
        kopfQ && kopfQ[12] === 'DATENSTAND');
}
// Ein Projekt ohne Daten: als Luecke ausgewiesen, Rest trotzdem exportiert.
{
    const { XL, blaetter } = baueXLStub();
    const store = { 'rcEslHistory': '{}', 'rcLigaHistDash': '{}' };   // nur Kabel, leer
    const w = { rcSagen: function(t){ alarm = t; }, rcProjektKuerzel: '', rcEslHistory:{}, rcLigaHistory:{} };
    let alarm = '';
    const bauen6 = new Function(
        'window','localStorage','rcTodayKey','rcStandRowsZeitraum','rcAggAusRows','rcLoadStyledXlsx',
        'rcBuildReportingSheets','rcXlsxSpeichern','rcZeitraumText','rcDatumKurz','fmtAht','rcLog','alert','console',
        'rcLogoAnkerLeeren',
        schneideAus(src, 'window.rcExportReportingAlle = function') + '; return window.rcExportReportingAlle;');
    const r = bauen6(w, { getItem: k => (k in store ? store[k] : null) }, () => '2026-08-06',
        () => ({ rows: [] }),                       // KEIN Projekt hat Zeilen
        U.rcAggAusRows, function(cb){ cb(XL); }, U.rcBuildReportingSheets,
        function(){ return Promise.resolve(); }, () => 'T', k => k, s => '0:00', { log(){}, warn(){} },
        function(t){ alarm = t; }, { log(){}, warn(){} }, function(){})('2026-08-06','2026-08-06');
    pruef('gar keine Daten: null zurueck, KEINE Mappe, Meldung mit Anleitung',
        r === null && blaetter.length === 0 && /Keines der drei Projekte/.test(alarm), alarm.slice(0,40));
}

console.log('\n' + '='.repeat(60));
console.log('  ' + ok + ' bestanden, ' + fehler + ' fehlgeschlagen.');
console.log('='.repeat(60));
process.exit(fehler ? 1 : 0);
