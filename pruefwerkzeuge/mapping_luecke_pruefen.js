#!/usr/bin/env node
// ============================================================================
//  mapping_luecke_pruefen.js — Agenten ohne Mitarbeiter-Excel-Eintrag (09.09.)
// ----------------------------------------------------------------------------
//  Live-Befund am Export vom 09.09.2026 (Nutzer: "manchmal sind die Mitarbeiter
//  im Vertrieb drin, in der Qualitaet nicht, oder es fehlen Eintraege"):
//  10 Agenten des Liga-Teams 21105086 (= VKD-TECH-86, Alanya) fehlten in ALLEN
//  14 Blaettern des Reports — mit 93 ESL-Zeilen, 76 Kontakten, 25 Ansprachen,
//  32 Stueck und 260 Liga-Calls. Grund: sie stehen nicht in der Mitarbeiter-
//  Excel (die ist vom 04.08.), haben deshalb keinen Stack, und der Stack-Filter
//  des Exports warf sie lautlos weg. Der Report meldete trotzdem "41 Agenten".
//
//  Zwei Reparaturen werden hier festgenagelt:
//   A) rcStandRowHasData zaehlt ESL-Kontakte mit. Ohne das hob das Sieb den
//      19.08.-Fix ("telefoniert und traegt ein, schliesst nichts ab") 118 Zeilen
//      spaeter fuer genau dessen Zielfall wieder auf.
//   B) STACK-ANKER: fehlt der Mapping-Eintrag, wird der Stack aus den GEMAPPTEN
//      Kollegen desselben Teams abgeleitet — aber NUR bei Eindeutigkeit. Das ist
//      ausdruecklich NICHT die 2026 abgeschaffte Team-Nummer-Bruecke (die riet
//      bei mehrdeutigen Teams); an den echten Quellen gemessen ist die Ableitung
//      nie mehrdeutig: 7 ESL-Rohteams eindeutig, 4 ohne jeden Anker, 0 mehrdeutig.
//      Abgeleitet wird ausschliesslich der STACK; das TEAM bleibt der Rohwert
//      (Nutzer-Vorgabe 06.08.: Teamzuordnung nur aus der Excel).
//
//  Geprueft wird FUNKTIONAL: die echten Funktionen werden per Klammer-Zaehlung
//  aus esl_live_arena_v22.js geschnitten und mit new Function ausgewertet.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const V22 = fs.readFileSync(path.join(__dirname, '..', 'esl_live_arena_v22.js'), 'utf8');

let ok = 0, fail = 0;
function pruefe(name, bedingung, zusatz) {
    if (bedingung) { ok++; }
    else { fail++; console.log('  FEHLGESCHLAGEN: ' + name + (zusatz ? '  [' + zusatz + ']' : '')); }
}
function schneide(src, kopf) {
    const start = src.indexOf(kopf);
    if (start < 0) return null;
    let i = src.indexOf('{', start), tiefe = 0;
    if (i < 0) return null;
    for (; i < src.length; i++) {
        const c = src[i];
        if (c === '{') tiefe++;
        else if (c === '}') { tiefe--; if (tiefe === 0) return src.slice(start, i + 1); }
    }
    return null;
}

console.log('=== mapping_luecke_pruefen ===');

// ============================================================================
//  A) rcStandRowHasData zaehlt ESL-Kontakte
// ============================================================================
const hasDataSrc = schneide(V22, 'function rcStandRowHasData(r){');
pruefe('A1: rcStandRowHasData laesst sich ausschneiden', !!hasDataSrc);
if (hasDataSrc) {
    const fn = new Function(hasDataSrc + '\nreturn rcStandRowHasData;')();
    const leer = { calls:0, ansp:0, bnt:0, vvl:0, mob:0, kip:0, ahtSec:null, detr:null, kont:0 };
    pruefe('A2: voellig leere Zeile faellt heraus', fn(leer) === false);
    pruefe('A3: NUR ESL-Kontakte reichen jetzt aus (der 09.09.-Fix)',
        fn(Object.assign({}, leer, { kont: 22 })) === true,
        'Araci Serpil: 22 Kontakte, 0 Ansprachen, 0 Stueck');
    pruefe('A4: 1 Kontakt genuegt (keine Untergrenze eingebaut)',
        fn(Object.assign({}, leer, { kont: 1 })) === true);
    // die bisherigen Wege muessen unveraendert gelten
    pruefe('A5: Liga-Calls zaehlen weiter',   fn(Object.assign({}, leer, { calls: 3 })) === true);
    pruefe('A6: Ansprachen zaehlen weiter',   fn(Object.assign({}, leer, { ansp: 1 })) === true);
    pruefe('A7: BNT zaehlt weiter',           fn(Object.assign({}, leer, { bnt: 1 })) === true);
    pruefe('A8: AHT zaehlt weiter',           fn(Object.assign({}, leer, { ahtSec: 300 })) === true);
    pruefe('A9: eine Quote mit Wert zaehlt weiter',
        fn(Object.assign({}, leer, { cs: { z:1, n:1, v:100 } })) === true);
    pruefe('A10: Quote OHNE Wert zaehlt nicht (Nenner 0 bleibt draussen)',
        fn(Object.assign({}, leer, { cs: { z:1, n:0, v:null } })) === false);

    // GEGENPROBE: die alte Fassung ohne kont-Zeile muss den Fall verlieren
    const altSrc = hasDataSrc.replace(/\n\s*\/\/[^\n]*\n(\s*\/\/[^\n]*\n)*\s*if \(\(r\.kont\|\|0\) > 0\) return true;/, '');
    pruefe('A11: Gegenprobe — alte Fassung ohne kont-Zeile herstellbar', altSrc !== hasDataSrc);
    if (altSrc !== hasDataSrc) {
        const alt = new Function(altSrc + '\nreturn rcStandRowHasData;')();
        pruefe('A12: Gegenprobe — die ALTE Fassung wirft den 22-Kontakte-Agenten weg',
            alt(Object.assign({}, leer, { kont: 22 })) === false,
            'belegt, dass A3 den echten Fehler misst und nicht ins Leere prueft');
    }
}

// ============================================================================
//  B) Stack-Anker: entsteht seit 05.10. VOR dem Parser-Lauf (rcAnkerAusZeilen)
// ============================================================================
//  Bis dahin sammelte der Parser den Anker waehrend des Laufs und veroeffentlichte
//  ihn erst danach — der Filter im Parser selbst rechnete also ohne ihn, und das
//  Live-Dashboard zeigte unter einem Stack-Filter weniger Agenten als der Export
//  (VKD_Tech am 28.09.: 110 gegen 125).
const REGEL_QUELL = require('./_stack_regel.js').quelltext(V22);
pruefe('B1: der Vorlauf rcAnkerAusZeilen steht als Funktionsdeklaration vor dem Parser',
    V22.indexOf('function rcAnkerAusZeilen(sheetData, idx, mapping, eigenProjekt){') > 0 &&
    V22.indexOf('function rcAnkerAusZeilen(') < V22.indexOf('window.processDataStream = function'));
pruefe('B2: der Parser ruft ihn VOR der Zeilenschleife und rechnet danach mit der zentralen Regel',
    (function(){
        const a = V22.indexOf('window.processDataStream = function');
        const i = V22.indexOf('const anker = rcAnkerAusZeilen(sheetData, idx, mapping, eigenProjekt);', a);
        const j = V22.indexOf('const stackOf = rcStackRegel();', a);
        const k = V22.indexOf('for (let i=1;i<sheetData.length;i++){', a);
        return i > a && j > i && k > j;
    })());
pruefe('B3: window.rcRohTeamStack wird aus dem Vorlauf veroeffentlicht',
    /window\.rcRohTeamStack = anker\.rohTeamStack;/.test(V22));
pruefe('B3b: der alte Sammler waehrend des Laufs ist raus (sonst gaebe es zwei Anker-Fassungen)',
    !/const rohTeamStacks = \{\}/.test(V22) && !/const stA = stackOf\(m\.team\)/.test(V22));

// Funktional: die echte Vorlauf-Funktion gegen einen kleinen Datenstrom.
(function(){
    const src = schneide(V22, 'function rcAnkerAusZeilen(sheetData, idx, mapping, eigenProjekt){');
    pruefe('B4: Vorlauf laesst sich ausschneiden', !!src);
    if (!src) return;
    const pt = schneide(V22, 'function rcIstPotentialTracking(merkmalRaw, produktRaw){');
    const fn = new Function(pt + '\n' + src + '\nreturn rcAnkerAusZeilen;')();
    // Spalten: 0 datum 1 standort 2 team 3 vo 4 kunde 5 gruppe 6 merkmal 7 produkt 8 ergebnis 9 anzahl 10 rc_projekt
    const idx = { datum:0, standort:1, team:2, vo:3, kunde:4, prod:5, merkmal:6, produkt:7, erg:8, anz:9, projekt:10 };
    const z = (team, vo, proj, merkmal, produkt) => ['2026-10-05', 'AL', team, vo, 'K', 'KIP BNT', merkmal || 'BCR-Relevant', produkt || 'P', 'angenommen', 1, proj];
    const daten = [['kopf'],
        z('Vodafone AL 06', 'm1', 'kabel'), z('Vodafone AL 06', 'm2', 'kabel'), z('Vodafone AL 06', 'u1', 'kabel'),   // zwei gemappte VKD + ein Ungemappter
        z('Vodafone SE 01', 'm3', 'kabel'),                                                                           // eindeutig OneC
        z('Misch Team', 'm1', 'kabel'), z('Misch Team', 'm4', 'mobile'),                                             // MEHRDEUTIG (VKD + MF)
        z('Leer Team', 'u2', 'um'),                                                                                   // niemand gemappt
        z('Nur PT Team', 'm4', 'mobile', 'Potential Tracking', 'Info World')                                          // Testeintrag zaehlt nicht
    ];
    const mapping = {
        voMap: { m1: { team:'VKD-TECH-86', ccsId:'c1' }, m2: { team:'VKD-TECH-86', ccsId:'c2' }, m3: { team:'ONEC-TECH-01', ccsId:'c3' }, m4: { team:'MF-CARE-06', ccsId:'c4' } },
        ccsMap: {}, stackMap: { 'VKD-TECH-86':'VKD_Tech', 'ONEC-TECH-01':'OneC_Tech', 'MF-CARE-06':'MF_CARE' }
    };
    const erg = fn(daten, idx, mapping, 'kabel');
    pruefe('B5: eindeutiger Anker wird uebernommen', erg.rohTeamStack['Vodafone AL 06'] === 'VKD_Tech');
    pruefe('B6: zweiter eindeutiger Anker ebenfalls', erg.rohTeamStack['Vodafone SE 01'] === 'OneC_Tech');
    pruefe('B7: MEHRDEUTIGES Team bekommt KEINEN Anker (kein Muenzwurf)',
        erg.rohTeamStack['Misch Team'] === undefined,
        'genau der Unterschied zur 2026 abgeschafften Team-Nummer-Bruecke');
    pruefe('B8: Team ohne jeden Beleg bekommt keinen Anker', erg.rohTeamStack['Leer Team'] === undefined);
    pruefe('B9: Potential-Tracking-Zeilen belegen keinen Stack (wie im Parser uebersprungen)',
        erg.rohTeamStack['Nur PT Team'] === undefined);
    pruefe('B10: das Projekt eines Teams kommt aus der LIEFERUNG, auch ohne Mapping-Eintrag',
        erg.teamProjekt['Leer Team'] === 'um' && erg.teamProjekt['VKD-TECH-86'] === 'kabel', JSON.stringify(erg.teamProjekt));
    pruefe('B11: je Agent (VO-Nummer UND CCS-ID) steht das Projekt bereit',
        erg.voProjekt.u1 === 'kabel' && erg.voProjekt.u2 === 'um' && erg.voProjekt.c3 === 'kabel', JSON.stringify(erg.voProjekt));
    // Ohne die Spalte rc_projekt (Einzelprojekt, Pruefseiten) gilt das Projekt der Seite.
    const ohneSpalte = fn(daten.map(r => r.slice(0, 10)), Object.assign({}, idx, { projekt: -1 }), mapping, 'mobile');
    pruefe('B12: ohne Projekt-Spalte gilt das Projekt der Seite', ohneSpalte.voProjekt.u1 === 'mobile' && ohneSpalte.teamProjekt['Leer Team'] === 'mobile');
})();

// ============================================================================
//  C) Die zentrale Regel rcStackRegel (Mapping, sonst eindeutiger Anker)
// ============================================================================
//  Bis 05.10. stand sie als stackVonTeam/nurAnker NUR in rcStandRows. Jetzt ist
//  es EINE Funktion fuer Parser, Export, Module und Liga-Filter — geprueft wird
//  die echte, mit denselben Faellen wie zuvor.
(function(){
    pruefe('C1: rcStandRows hat keine eigene Anker-Fassung mehr',
        V22.indexOf('const ligaTeamStack = {};') === -1 && !/const stackVonTeam = function/.test(V22));
    const sr = schneide(V22, 'function rcStandRows(dayKey, scope){');
    pruefe('C2: rcStandRows holt die zentrale Regel (und den Vollbestand DAVOR, der den ESL-Anker frisch anlegt)',
        /const stackRegel = rcStackRegel\(\);/.test(sr) && sr.indexOf('rcAgentenVollbestand()') < sr.indexOf('const stackRegel = rcStackRegel();'));

    const win = {
        rcWcaMapping: {
            ccsMap: { '111': { team:'VKD-TECH-86' }, '222': { team:'VKD-TECH-86' }, '333': { team:'MF-CARE-06' } },
            stackMap: { 'VKD-TECH-86':'VKD_Tech', 'MF-CARE-06':'MF_CARE' }
        },
        rcKpiData: {
            a: { ccsId:'111', team:'21105086' },   // gemappt -> belegt 86 = VKD_Tech
            b: { ccsId:'222', team:'21105086' },
            c: { ccsId:'999', team:'21105086' },   // ungemappt, soll erben
            d: { ccsId:'888', team:'21105006' },   // ungemappt, KEIN Beleg im Team
            e: { ccsId:'333', team:'21105099' }    // gemappt -> belegt 99 = MF_CARE
        },
        rcRohTeamStack: { 'Vodafone AL 06': 'VKD_Tech' },
        rcKpiStand: 1
    };
    const H = new Function('window', REGEL_QUELL + '\nreturn { regel: rcStackRegel(), liga: rcLigaTeamStack(), von: rcStackVonTeam, passt: rcStackFilterPasst, text: rcStackFilterText };')(win);
    pruefe('C3: Liga-Anker aus den gemappten Kollegen gebildet', H.liga['21105086'] === 'VKD_Tech');
    pruefe('C4: Liga-Team ohne Beleg bekommt keinen Anker', H.liga['21105006'] === undefined);
    pruefe('C5: Mapping gewinnt vor jedem Anker', H.regel('VKD-TECH-86') === 'VKD_Tech');
    pruefe('C6: Liga-Team-NUMMER erbt ueber den Anker', H.regel('21105086') === 'VKD_Tech');
    pruefe('C7: ESL-ROHTEAM erbt ueber den Anker', H.regel('Vodafone AL 06') === 'VKD_Tech');
    pruefe('C8: ohne jeden Anker bleibt es leer (Ausschluss statt Raten)',
        H.regel('21105006') === '');
    pruefe('C9: leerer Team-Name liefert leer', H.regel('') === '' && H.regel(null) === '');
    pruefe('C10: nurAnker erkennt die Ableitung', H.regel.nurAnker('21105086') === true && H.regel.nurAnker('Vodafone AL 06') === true);
    pruefe('C11: nurAnker ist FALSE fuer echte Mapping-Teams',
        H.regel.nurAnker('VKD-TECH-86') === false,
        'sonst bekaeme jede gemappte Zeile die Warnmarkierung');
    pruefe('C12: nurAnker ist FALSE ohne jeden Anker', H.regel.nurAnker('21105006') === false);
    // Der Vergleich, den alle Filterstellen benutzen
    pruefe('C13: Stack-Filter trifft Mapping-Team UND Anker-Team', H.passt('VKD-TECH-86', 'VKD_Tech') && H.passt('Vodafone AL 06', 'VKD_Tech') && H.passt('21105086', 'VKD_Tech'));
    pruefe('C14: ohne Stack trifft KEIN einzelner Stack-Filter (auch nicht mit bekanntem Projekt)',
        H.passt('21105006', 'VKD_Tech') === false && H.passt('21105006', 'MF_CARE', 'mobile') === false && H.passt('', 'VKD_Tech') === false);
    pruefe('C15: "Alle Stacks" trifft jeden', H.passt('21105006', 'ALL') && H.passt('', 'ALL') && H.passt('x', ''));
    pruefe('C16: Projekt-Filter nimmt den Agenten ohne Stack ueber das Projekt seiner Lieferung',
        H.passt('21105006', 'P:mobile', 'mobile') === true && H.passt('21105006', 'P:kabel', 'mobile') === false);
    pruefe('C17: die Lieferung schlaegt das Mapping (MF-Team, aber im Kabel-ESL gebucht -> zaehlt zu Kabel)',
        H.passt('MF-CARE-06', 'P:kabel', 'kabel') === true && H.passt('MF-CARE-06', 'P:mobile', 'kabel') === false);
    pruefe('C18: ohne Lieferungs-Projekt entscheidet der Stack ueber das Projekt',
        H.passt('VKD-TECH-86', 'P:kabel') === true && H.passt('MF-CARE-06', 'P:kabel') === false && H.passt('21105006', 'P:kabel') === false);
    pruefe('C19: der Filtername ist lesbar ("Kabel gesamt"), der Stack-Name bleibt', H.text('P:kabel') === 'Kabel gesamt' && H.text('VKD_Tech') === 'VKD_Tech' && H.text('ALL') === '');
    // GEGENPROBE: die Regel vor dem 05.10. im Live-Dashboard (nur stackMap[team]) verliert den Anker-Agenten.
    const alt = t => win.rcWcaMapping.stackMap[t] || '';
    pruefe('C20: GEGENPROBE — die alte Live-Regel (nur Mapping) kennt den Anker-Agenten nicht',
        alt('Vodafone AL 06') === '' && alt('21105086') === '' && H.regel('Vodafone AL 06') === 'VKD_Tech');
    // Der Liga-Anker wird gemerkt, bis sich der Bestand aendert (rcKpiStand).
    const gemerkt = new Function('window', REGEL_QUELL + '\nconst a = rcLigaTeamStack(); window.rcKpiData.g = { ccsId:"333", team:"21105086" }; const b = rcLigaTeamStack(); window.rcKpiStand++; return { gleich: a === b, alt: a["21105086"], neu: rcLigaTeamStack() };')(win);
    pruefe('C21: der Liga-Anker wird gemerkt und nach einer Aenderung des Bestands neu gerechnet (jetzt mehrdeutig -> kein Anker)',
        gemerkt.gleich === true && gemerkt.alt === 'VKD_Tech' && gemerkt.neu['21105086'] === undefined, JSON.stringify(gemerkt.neu));
})();

// ============================================================================
//  D) Alle Filterstellen benutzen den EINEN Vergleich
// ============================================================================
(function(){
    const roh = (V22.match(/\(stackMapE\[[a-zA-Z]+\] \|\| ''\) !== fsE/g) || []).length;
    pruefe('D1: keine rohe stackMapE-Pruefung mehr in den Scope-Filtern', roh === 0,
        roh + ' Reste gefunden');
    const sr = schneide(V22, 'function rcStandRows(dayKey, scope){');
    // GENAU vier Stellen in rcStandRows: Liga-Zweig, ESL-Zweig, zwei Historien-Zweige.
    const mit = (sr.match(/rcStackFilterPasst\(/g) || []).length;
    pruefe('D2: rcStackFilterPasst an GENAU den vier Filterstellen von rcStandRows',
        mit === 4, mit + ' Vorkommen');
    pruefe('D3: Liga-Zweig nutzt den zentralen Vergleich',
        /ligaList = ligaList\.filter\(k => rcStackFilterPasst\(teamOfK\(k\), fsE, rcProjektVonAgent\(k\.ccsId\)\)\)/.test(sr));
    pruefe('D4: ESL-Zweig nutzt ihn mit dem Projekt des Agenten',
        /if \(fsE !== 'ALL' && !rcStackFilterPasst\(a\.team, fsE, a\.projekt\)\) return;/.test(sr));
    pruefe('D5: beide Historien-Zweige nutzen ihn',
        (sr.match(/if \(fsE !== 'ALL' && !rcStackFilterPasst\(team, fsE, /g) || []).length === 2);
    // Ueber die ganze Datei: kein Stack-Filter vergleicht mehr selbst gegen stackMap.
    const ALT_BAUART = /(stackMap|stackMapK|stackVon|sm)\[[^\]]+\]\s*(\|\|\s*''\s*\)?\s*)?(!==|===)\s*(sc\.stack|fStack|filterStack|f\.stack)/;
    const selbst = V22.split('\n').filter(z => ALT_BAUART.test(z));
    pruefe('D6: nirgends in der Datei vergleicht ein Stack-Filter noch selbst gegen stackMap',
        selbst.length === 0, selbst.map(z => z.trim().slice(0, 80)).join(' | '));
    pruefe('D6b: GEGENPROBE — die Regel erkennt beide alten Bauarten',
        ALT_BAUART.test("if(sc.stack!=='ALL' && sm[t.name]!==sc.stack) return false;") &&
        ALT_BAUART.test("&& (fStack === 'ALL' || (meta.team && (stackMap[meta.team] || '') === fStack));"));
    pruefe('D7: der Liga-Filter (rcLigaInScope) und rcLigaMeta rechnen ueber die zentrale Regel',
        /stack: rcStackVonTeam\(team\) \};/.test(V22) &&
        /if \(sc\.stack !== 'ALL' && !rcStackFilterPasst\(meta\.team, sc\.stack, rcProjektVonAgent\(k\.ccsId\)\)\) return false;/.test(V22));
    pruefe('D8: die Aggregat-Blaetter (rcAggAusRows) holen den Stack ueber die zentrale Regel',
        // Nur ZUWEISUNGEN zaehlen — der Kommentar im Block nennt die alte Bauart beim Namen.
        (function(){ const a = schneide(V22, 'function rcAggAusRows(data){'); return /const stackVon = rcStackRegel\(\);/.test(a) && (a.match(/stack: stackVon\(team\)/g) || []).length === 2 && !/stack: [^\n]*stackMap\[team\]/.test(a); })());
})();

// ============================================================================
//  E) ohneMap reist bis ins Blatt
// ============================================================================
(function(){
    pruefe('E1: Liga-Zweig setzt ohneMap', /ohneMap: nurAnker\(teamOfK\(k\)\)/.test(V22));
    pruefe('E2: ESL-Zweig setzt ohneMap',  /ohneMap: nurAnker\(a\.team\)/.test(V22));
    pruefe('E3: Zeitraum-Akkumulator kennt das Feld', /ohneMap: false,\s*\/\/ 09\.09\./.test(V22));
    pruefe('E4: Zeitraum uebernimmt es je Tag', /if \(r\.ohneMap\) a\.ohneMap = true;/.test(V22));
    pruefe('E5: Zeitraum reicht es in die fertige Zeile',
        /ohneMap: !!a\.ohneMap/.test(V22),
        'ohne diese Zeile blieb die Hinweiszeile im Zeitraum-Export leer — am 09.09. gemessen');
    pruefe('E6: Stand-Blatt wertet ohneMap aus',
        /const ohneMapR = \(data\.rows \|\| \[\]\)\.filter/.test(V22));
    pruefe('E7: Hinweiszeile nennt Zahl UND Namen',
        /Agent\(en\) stehen NICHT in der Mitarbeiter-Excel/.test(V22) && /Bitte Mapping pflegen/.test(V22));
    // Der Merge ist Pflicht: ohne ihn steht der Satz in einer 7 Zeichen breiten Zelle.
    pruefe('E8: die Hinweiszeile wird ueber die volle Breite gemerged',
        /mapR >= 0 \? \[ M\(mapR,1,mapR,LETZTE\) \] : \[\]/.test(V22));
})();

// ============================================================================
//  F) Die Warnung nennt beide Lagen
// ============================================================================
pruefe('F1: Logbuch-Warnung trennt "mit Anker" von "ohne Anker"',
    /mit eindeutigem Stack-Anker/.test(V22) && /ohne Anker/.test(V22));
pruefe('F2: sie ist entprellt (der Parser laeuft alle 20 s) und nennt die Zahl ohne Stack',
    /window\.rcLueckenGemeldet !== lueckenSig/.test(V22) && /Ohne Stack insgesamt: ' \+ window\.rcOhneStack\.length/.test(V22));

console.log('');
if (fail === 0) console.log('ALLE ' + ok + ' PRUEFUNGEN BESTANDEN');
else console.log(ok + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
