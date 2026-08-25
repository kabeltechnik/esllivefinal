/* quoten_modul_pruefen.js — 19.08.
 *
 * Prueft das neue Modul "Ansprache- & Tracking-Quote" (MOD_TYPES.quoten) sowie die
 * zwei Datenfehler, die genau dessen Zahlen verfaelscht haben:
 *   1. rcStandRows liess ESL-Agenten fallen, die NUR Kontakte haben (keine
 *      Abschluesse, keine Ansprache) — der Nenner der Tracking-Quote war zu klein.
 *   2. Ein Agent ohne Mapping-Eintrag fand seinen Liga-Zwilling nicht, weil im ESL
 *      die CCS-ID in der Spalte vo_nummer steht. Dieselbe Person stand zweimal drin.
 *
 * FUNKTIONAL: die echte render-Funktion wird per Klammer-Zaehlung aus
 * esl_live_arena_v22.js geschnitten und mit new Function ausgewertet — kein Nachbau.
 * Sollwerte sind unabhaengig nachgerechnet (Stand 18.08., echte Exporte).
 *
 * Ohne Portal und ohne Installation lauffaehig:  node quoten_modul_pruefen.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const QUELLE = path.join(__dirname, '..', 'esl_live_arena_v22.js');
const src = fs.readFileSync(QUELLE, 'utf8');

let ok = 0, bad = 0;
function pruef(name, bedingung, zusatz) {
    if (bedingung) { ok++; console.log('  OK   ' + name); }
    else { bad++; console.log('  FEHL ' + name + (zusatz ? '   -> ' + zusatz : '')); }
}
function gleich(name, ist, soll) {
    pruef(name, ist === soll, 'ist ' + JSON.stringify(ist) + ', soll ' + JSON.stringify(soll));
}

/* ------------------------------------------------------------------ *
 * Einen Wert (Objekt-Literal oder Funktion) ab einer Fundstelle per
 * Klammer-Zaehlung herausschneiden. Zeichenketten und Regex-Literale
 * werden uebersprungen, sonst zaehlt eine Klammer im Text mit.
 * ------------------------------------------------------------------ */
function schneide(text, start, auf, zu) {
    let i = text.indexOf(auf, start);
    if (i < 0) return null;
    let tiefe = 0, j = i;
    let inStr = null, inRe = false, inZeile = false, inBlock = false;
    for (; j < text.length; j++) {
        const c = text[j], p = text[j - 1], n = text[j + 1];
        if (inZeile) { if (c === '\n') inZeile = false; continue; }
        if (inBlock) { if (c === '*' && n === '/') { inBlock = false; j++; } continue; }
        if (inStr) { if (c === '\\') { j++; continue; } if (c === inStr) inStr = null; continue; }
        if (inRe) { if (c === '\\') { j++; continue; } if (c === '/') inRe = false; continue; }
        if (c === '/' && n === '/') { inZeile = true; j++; continue; }
        if (c === '/' && n === '*') { inBlock = true; j++; continue; }
        if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
        if (c === '/') {
            let k = j - 1; while (k >= 0 && /\s/.test(text[k])) k--;
            if (k < 0 || !/[\w$)\]]/.test(text[k])) { inRe = true; continue; }
            continue;
        }
        if (c === auf) tiefe++;
        else if (c === zu) { tiefe--; if (!tiefe) return text.slice(i, j + 1); }
    }
    return null;
}

console.log('QUOTEN-MODUL PRUEFEN');
console.log('');

/* =================================================================== *
 * 1. Registry-Eintrag: die Pflichtfelder, ohne die eine Kachel
 *    stillschweigend einfriert oder abgeschnitten dasteht.
 * =================================================================== */
console.log('1) Registry-Eintrag');

const iQ = src.indexOf('\n            quoten:{');
pruef('Modultyp "quoten" ist in MOD_TYPES angelegt', iQ > 0);
const eintrag = iQ > 0 ? schneide(src, iQ, '{', '}') : '';

pruef('live:true gesetzt (sonst friert die Kachel nach dem ersten Render ein)', /\blive:true\b/.test(eintrag));
pruef('hoch: gesetzt (sonst 120 px und abgeschnittener Inhalt)', /\bhoch:\s*\d/.test(eintrag));
pruef('cat aus KAT_ORDNUNG', /cat:'(Kampf|Rangliste|Verlauf|Verteilung|Qualitaet|Uebersicht|Inhalt|Klassiker)'/.test(eintrag));
pruef('hilfe-Text vorhanden', /\bhilfe:/.test(eintrag));
pruef('def() und fields[] und render() vorhanden', /\bdef:function/.test(eintrag) && /\bfields:\[/.test(eintrag) && /\brender:function/.test(eintrag));
pruef('Zuschnitt-Feld scope vorhanden', /\['scope','Zuschnitt','scope'\]/.test(eintrag));
pruef('Mindest-Nenner einstellbar (minCalls)', /'minCalls'/.test(eintrag));

// Verbote aus der Projektdoku — hier gegen den GECODETEN Eintrag, nicht gegen
// Kommentare der Datei (Fallstrick: Pruefungen treffen die eigenen Erklaertexte).
const codeNurs = eintrag.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
pruef('kein requestAnimationFrame', !/requestAnimationFrame/.test(codeNurs));
pruef('kein Math.random', !/Math\.random/.test(codeNurs));
pruef('kein Canvas / getContext', !/getContext/.test(codeNurs));
pruef('kein eigener Timer', !/set(Interval|Timeout)\s*\(/.test(codeNurs));
pruef('kein <text> im SVG (Text ist HTML)', !/<text/.test(codeNurs));
pruef('keine Emojis', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(eintrag));
pruef('Kopfzeile mit Zuschnitt (mbKopf) wird gesetzt', /mbKopf\(/.test(codeNurs));
pruef('Standortfarbe nur ueber mbStdFarbe', /mbStdFarbe\(/.test(codeNurs) && !/#[0-9A-Fa-f]{6}['"]\s*;\s*\/\/\s*Standort/.test(codeNurs));
pruef('Ampel nur ueber zielColor', /zielColor\(/.test(codeNurs));
pruef('ESL-Kontakte werden NICHT aus d.standorte gelesen (versteckter pitches-Rueckfall)',
    /rcLetzteStats/.test(codeNurs) && !/d\.standorte/.test(codeNurs));

/* =================================================================== *
 * 2. render() funktional gegen echte Zahlen vom 18.08.
 * =================================================================== */
console.log('');
console.log('2) render() funktional — echte Zahlen vom 18.08.2026');

const iR = eintrag.indexOf('render:function');
const renderQuelle = schneide(eintrag, iR, '{', '}');
pruef('render-Rumpf liess sich herausschneiden', !!renderQuelle && renderQuelle.length > 400);

// --- Umgebung stubben. Alles, was der Renderer anfasst, und nichts sonst.
const AMPEL_OK = '#3DD68C', AMPEL_WARN = '#EB9700', AMPEL_ROT = '#E60000', AMPEL_LEER = '#8C8C8C';
const STD_NAME = { AL:'Alanya', SER:'Serres', ADP:'Alexandroupolis', B:'Berlin', P:'Potsdam', ZWT:'Zeitwert', E:'Essen', SKA:'Sakarya', NBB:'Neubrandenburg' };

function baueUmgebung(sc, liga) {
    const env = {};
    env.modScope = () => sc;
    env.mbLigaCalls = () => liga;
    env.mbStdIn = (code) => (sc.std === 'ALL' || code === sc.std);
    env.mbKopf = (s, z) => '<KOPF>' + (z || '') + '</KOPF>';
    env.mbLeer = (t) => '<LEER>' + t + '</LEER>';
    env.mbKenn = (id) => ({ label: id, quelle: 'esl' });
    env.mbFehltGrund = () => 'GRUND-KONTAKTE';
    env.mbStdFarbe = (c) => '#0068A0';
    env.zielColor = (v, z) => (v == null || !z) ? AMPEL_LEER
        : (v >= z.min ? AMPEL_OK : (v >= z.min * 0.9 ? AMPEL_WARN : AMPEL_ROT));
    env.esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    env.H = {
        num: (v) => (Math.round(v * 10) / 10).toString().replace('.', ','),
        std: (c) => STD_NAME[c] || c,
        flag: () => '<FLAG>',
        empty: (t) => '<LEER>' + t + '</LEER>'
    };
    env.mbTabelle = (kopf, zeilen) => JSON.stringify({ kopf, zeilen });
    return env;
}

// Echte Zahlen: ESL-Export 20260818 + Ligalisten.xlsx, unabhaengig nachgerechnet.
const ECHT = {
    //          Kontakte  Ansprachen  Liga-Calls
    AL:  { kont: 900, ansp: 332, lc: 3737 },
    SER: { kont:1008, ansp: 347, lc: 1475 },
    ADP: { kont: 678, ansp: 245, lc:  827 },
    B:   { kont: 581, ansp: 308, lc:  611 },
    P:   { kont: 350, ansp: 168, lc:  455 },
    ZWT: { kont:  94, ansp:  64, lc:  140 },
    E:   { kont: 160, ansp:  44, lc:    5 },   // 5 Liga-Calls gegen 160 Kontakte
    SKA: { kont:   0, ansp:   0, lc: 1599 },   // telefoniert, NICHTS eingetragen
    NBB: { kont:   0, ansp:   0, lc: 1417 }
};

function laufen(m, sc, opt) {
    opt = opt || {};
    const byStd = {}, standortStats = {};
    Object.keys(ECHT).forEach(c => {
        const e = ECHT[c];
        if (e.lc > 0) byStd[c] = e.lc;
        // Sakarya/Neubrandenburg haben KEINE ESL-Zeilen -> kein standortStats-Eintrag.
        if (e.kont > 0 || e.ansp > 0) standortStats[c] = { code: c, calls: e.kont, pitches: e.ansp };
    });
    const liga = { byStd, byTeam: opt.byTeam || {}, total: Object.values(byStd).reduce((a, b) => a + b, 0) };
    const env = baueUmgebung(sc, liga);
    const g = {
        rcLetzteStats: { standortStats, teamStats: opt.teamStats || {} },
        rcWarStdFull: opt.warStdFull || null
    };
    const fn = new Function('modScope','mbLigaCalls','mbStdIn','mbKopf','mbLeer','mbKenn','mbFehltGrund',
        'mbStdFarbe','zielColor','esc','H','mbTabelle','window',
        'return (function(m,d)' + renderQuelle + ')');
    const render = fn(env.modScope, env.mbLigaCalls, env.mbStdIn, env.mbKopf, env.mbLeer, env.mbKenn,
        env.mbFehltGrund, env.mbStdFarbe, env.zielColor, env.esc, env.H, env.mbTabelle, g);
    return render(m, {});
}

function tabelleAus(html) {
    const i = html.indexOf('{"kopf"');
    if (i < 0) return null;
    const roh = schneide(html, i, '{', '}');
    return roh ? JSON.parse(roh) : null;
}
function zeileVon(tab, name) {
    return (tab.zeilen || []).find(z => String(z.zellen[0]).indexOf(name) >= 0) || null;
}
function textVon(zelle) { return typeof zelle === 'string' ? zelle : (zelle && zelle.text) || ''; }
function prozentAus(zelle) {
    const m = textVon(zelle).match(/([\d,]+)\s*%/);
    return m ? Number(m[1].replace(',', '.')) : null;
}

const SC_DASH = { std:'ALL', team:'ALL', stack:'ALL', nation:'ALL', quelle:'dash', folgt:true };
const M_STD = { scope:'dash', ebene:'Standort', minCalls:20, zielAnsp:40, zielTrack:80 };

const h1 = laufen(M_STD, SC_DASH, {});
const t1 = tabelleAus(h1);
pruef('Tabelle wird gebaut', !!t1 && Array.isArray(t1.zeilen));
gleich('Spaltenkopf 1 ist der Standort', t1.kopf[0], 'Standort');
gleich('Spaltenkopf 2 ist die Tracking-Quote', t1.kopf[1], 'Tracking %');
gleich('Spaltenkopf 3 ist die Ansprache-Quote', t1.kopf[2], 'Ansprache %');

// --- die beiden Quoten, unabhaengig nachgerechnet
const R1 = (x) => Math.round(x * 10) / 10;
[['Alanya','AL'],['Serres','SER'],['Alexandroupolis','ADP'],['Berlin','B'],['Potsdam','P'],['Zeitwert','ZWT']].forEach(([nm, code]) => {
    const e = ECHT[code], z = zeileVon(t1, nm);
    if (!z) { pruef('Zeile ' + nm + ' vorhanden', false); return; }
    gleich('Tracking ' + nm.padEnd(16) + ' = Kontakte/Liga-Calls', prozentAus(z.zellen[1]), R1(100 * e.kont / e.lc));
    gleich('Ansprache ' + nm.padEnd(15) + ' = Ansprachen/Liga-Calls', prozentAus(z.zellen[2]), R1(100 * e.ansp / e.lc));
});

// --- DER Kernfall: telefoniert, aber nichts eingetragen. Genau dafuer ist die
//     Kachel da; live_ansprache verliert diese Standorte, weil es nur ueber die
//     ESL-Seite iteriert.
const zSka = zeileVon(t1, 'Sakarya'), zNbb = zeileVon(t1, 'Neubrandenburg');
pruef('Standort ganz ohne ESL-Eintraege steht trotzdem in der Liste (Sakarya)', !!zSka);
pruef('dito Neubrandenburg', !!zNbb);
if (zSka) gleich('Sakarya zeigt 0 % Tracking, nicht "—"', prozentAus(zSka.zellen[1]), 0);
if (zSka) pruef('Sakarya nennt seine 1599 Liga-Calls als Nenner', /1599/.test(textVon(zSka.zellen[0])));

// --- Mindest-Nenner: Essen hat 5 Liga-Calls gegen 160 Kontakte (3200 %).
const zE = zeileVon(t1, 'Essen');
pruef('Essen steht in der Liste', !!zE);
if (zE) {
    pruef('Essen liefert bei 5 Calls KEINEN Prozentwert (Mindest-Nenner 20)', prozentAus(zE.zellen[1]) === null);
    pruef('Essen sagt "zu wenig Calls" statt "—"', /zu wenig Calls/.test(textVon(zE.zellen[1])));
    pruef('Essen zeigt die Rohzahlen trotzdem (160 / 44 / 5)', /160/.test(textVon(zE.zellen[0])) && /44/.test(textVon(zE.zellen[0])) && /\b5\b/.test(textVon(zE.zellen[0])));
}

// --- ohne Mindest-Nenner darf der Wert NICHT gefaelscht werden
const h2 = laufen(Object.assign({}, M_STD, { minCalls: 0 }), SC_DASH, {});
const t2 = tabelleAus(h2), zE2 = zeileVon(t2, 'Essen');
gleich('ohne Mindest-Nenner steht bei Essen der echte Wert 3200 %', prozentAus(zE2.zellen[1]), 3200);
pruef('Wert ueber 100 % wird in Amber markiert', textVon(zE2.zellen[1]).indexOf(AMPEL_WARN) >= 0 || zE2.zellen[1].farbe === AMPEL_WARN);
pruef('und die Kachel erklaert, warum ueber 100 % kein Fehler ist', /Ueber 100 %/.test(h2));

// --- Ampel
const zB = zeileVon(t1, 'Berlin');
gleich('Berlin 95,1 % Tracking bei Ziel 80 -> gruen', zB.zellen[1].farbe, AMPEL_OK);
const zAl = zeileVon(t1, 'Alanya');
gleich('Alanya 24,1 % Tracking bei Ziel 80 -> rot', zAl.zellen[1].farbe, AMPEL_ROT);
gleich('Alanya 8,9 % Ansprache bei Ziel 40 -> rot', zAl.zellen[2].farbe, AMPEL_ROT);

// --- Sortierung: schlechtestes Tracking soll auffallen, bestes oben
pruef('nach Tracking-Quote absteigend sortiert',
    (() => { const w = t2.zeilen.map(z => prozentAus(z.zellen[1])).filter(v => v != null);
             return w.every((v, i) => i === 0 || w[i-1] >= v); })());

/* =================================================================== *
 * 3. Die dokumentierte Ehrlichkeits-Regel: ohne Liga-Nenner keine Quote.
 * =================================================================== */
console.log('');
console.log('3) Ohne Liga-Nenner KEINE Quote (kein ESL-Ersatznenner)');

const hLeer = (() => {
    const env = baueUmgebung(SC_DASH, { byStd: {}, byTeam: {}, total: 0 });
    const g = { rcLetzteStats: { standortStats: { AL: { code:'AL', calls: 900, pitches: 332 } }, teamStats: {} }, rcWarStdFull: null };
    const fn = new Function('modScope','mbLigaCalls','mbStdIn','mbKopf','mbLeer','mbKenn','mbFehltGrund',
        'mbStdFarbe','zielColor','esc','H','mbTabelle','window',
        'return (function(m,d)' + renderQuelle + ')');
    return fn(env.modScope, env.mbLigaCalls, env.mbStdIn, env.mbKopf, env.mbLeer, env.mbKenn,
        env.mbFehltGrund, env.mbStdFarbe, env.zielColor, env.esc, env.H, env.mbTabelle, g)(M_STD, {});
})();
const tLeer = tabelleAus(hLeer);
const zAlLeer = tLeer ? zeileVon(tLeer, 'Alanya') : null;
pruef('Alanya steht mit ESL-Zahlen trotzdem in der Liste', !!zAlLeer);
if (zAlLeer) {
    pruef('ohne Liga-Calls steht "—" statt einer Quote', prozentAus(zAlLeer.zellen[1]) === null && /&mdash;/.test(textVon(zAlLeer.zellen[1])));
    pruef('KEIN Rueckfall auf ESL-Kontakte als Ersatznenner (waere 100 %)', prozentAus(zAlLeer.zellen[1]) !== 100);
    pruef('die 900 Kontakte werden als Zahl trotzdem gezeigt', /900/.test(textVon(zAlLeer.zellen[0])));
}

/* =================================================================== *
 * 4. Freier Zuschnitt: ESL-Kontakte gibt es ungefiltert NICHT.
 *    Gegenprobe zu Fallstrick 24 — eine stille 0 waere hier die
 *    gefaehrlichere Luege, weil sie echt aussieht.
 * =================================================================== */
console.log('');
console.log('4) Freier Zuschnitt — Tracking-Quote verweigert sich ehrlich');

const SC_FREI = { std:'ALL', team:'ALL', stack:'ALL', nation:'ALL', quelle:'alle', folgt:false };
const hFrei = laufen(Object.assign({}, M_STD, { scope:'alle' }), SC_FREI, {
    warStdFull: { AL:{ code:'AL', pitches:332 }, SER:{ code:'SER', pitches:347 } }
});
const tFrei = tabelleAus(hFrei);
const zAlF = tFrei ? zeileVon(tFrei, 'Alanya') : null;
pruef('freier Zuschnitt liefert weiterhin eine Tabelle', !!tFrei);
if (zAlF) {
    pruef('Tracking-Quote ist "—", NICHT 0 %', prozentAus(zAlF.zellen[1]) === null);
    gleich('Ansprache-Quote rechnet ungefiltert weiter (332/3737)', prozentAus(zAlF.zellen[2]), R1(100 * 332 / 3737));
    pruef('Kontakt-Spalte zeigt "—" statt einer stillen 0', /&mdash;/.test(textVon(zAlF.zellen[0])));
}
pruef('die Kachel nennt den Grund fuer die fehlende Tracking-Quote', /GRUND-KONTAKTE/.test(hFrei));

// Gegenprobe: wuerde der Renderer bei freiem Zuschnitt aus rcLetzteStats rechnen,
// zeigte er heimlich die Zahlen des GEFILTERTEN Dashboards.
pruef('Gegenprobe — bei freiem Zuschnitt wird rcLetzteStats.standortStats nicht angezapft',
    /kontDa\s*=\s*\(sc\.folgt\s*===\s*true\)/.test(renderQuelle));

/* =================================================================== *
 * 5. Team-Ebene
 * =================================================================== */
console.log('');
console.log('5) Team-Ebene');

const hTeam = laufen(Object.assign({}, M_STD, { ebene:'Team', minCalls:0 }), SC_DASH, {
    byTeam: { 'VKD-TECH-53': 400, 'VKD-TECH-57': 120 },
    teamStats: { 'VKD-TECH-53': { name:'VKD-TECH-53', standort:'P', calls:300, pitches:150 },
                 'VKD-TECH-57': { name:'VKD-TECH-57', standort:'P', calls: 60, pitches: 30 } }
});
const tTeam = tabelleAus(hTeam);
gleich('Spaltenkopf wechselt auf Team', tTeam.kopf[0], 'Team');
const zT53 = zeileVon(tTeam, 'VKD-TECH-53');
pruef('Team-Zeile vorhanden', !!zT53);
if (zT53) {
    gleich('Tracking Team 53 = 300/400', prozentAus(zT53.zellen[1]), 75);
    gleich('Ansprache Team 53 = 150/400', prozentAus(zT53.zellen[2]), R1(100 * 150 / 400));
}
pruef('Team-Schluessel sind MAPPING-Namen, keine Liga-Nummern', !/\b2110\d{4}\b/.test(JSON.stringify(tTeam.zeilen)));

const hTeamFrei = laufen(Object.assign({}, M_STD, { ebene:'Team', scope:'alle' }), SC_FREI, {
    byTeam: { 'VKD-TECH-53': 400 }, teamStats: {}
});
pruef('Team-Ebene mit freiem Zuschnitt sagt, dass es dort keine Zahlen gibt', /Ebene auf Standort/.test(hTeamFrei));

/* =================================================================== *
 * 6. Fix 1 — ESL-Agenten, die NUR Kontakte haben, duerfen nicht
 *    verschwinden. Funktional gegen die echte Bedingung.
 * =================================================================== */
console.log('');
console.log('6) Fix 1 — Agent mit Kontakten, ohne Abschluss und ohne Ansprache');

// Die ganze Zeile holen und daraus den Ausdruck zwischen "if (" und ") return;"
// schneiden — ein Regex ueber den Ausdruck selbst scheitert an den inneren
// Klammern von (a.kontakte||0).
pruef('die Bedingung steht noch genau einmal in der Datei',
    (src.match(/nur wer etwas getrackt hat/g) || []).length === 1);
const zeileBed = (src.match(/^.*nur wer etwas getrackt hat.*$/m) || [''])[0];
const mBed = zeileBed.match(/if \((.+)\) return;/);
const bedQuelle = mBed ? mBed[1] : null;
pruef('Bedingung liess sich herausschneiden', !!bedQuelle);
if (bedQuelle) {
    const faellt = new Function('a', 'return (' + bedQuelle + ');');
    // Die sechs echten Faelle vom 18.08.: nur Kontakte, sonst nichts.
    pruef('Agent mit 26 Kontakten, 0 Abschluessen, 0 Ansprachen faellt NICHT mehr heraus',
        faellt({ bnt:0, vvl:0, ansprachen:0, kontakte:26 }) === false);
    pruef('Agent mit 1 Kontakt faellt nicht heraus', faellt({ bnt:0, vvl:0, ansprachen:0, kontakte:1 }) === false);
    pruef('Agent voellig ohne Daten faellt weiterhin heraus',
        faellt({ bnt:0, vvl:0, ansprachen:0, kontakte:0 }) === true);
    pruef('Agent mit Abschluss bleibt drin (unveraendert)', faellt({ bnt:2, vvl:0, ansprachen:0, kontakte:0 }) === false);
    pruef('Agent mit Ansprache bleibt drin (unveraendert)', faellt({ bnt:0, vvl:0, ansprachen:3, kontakte:0 }) === false);
    // GEGENPROBE: die alte Bedingung muss bei genau diesem Fall durchfallen.
    const alt = new Function('a', 'return ((a.bnt||0)+(a.vvl||0)+(a.ansprachen||0) === 0);');
    pruef('Gegenprobe — die ALTE Bedingung haette den 26-Kontakte-Agenten geworfen',
        alt({ bnt:0, vvl:0, ansprachen:0, kontakte:26 }) === true);
}

/* =================================================================== *
 * 7. Fix 2 — vo_nummer IST die CCS-ID, wenn das Mapping nichts hat.
 * =================================================================== */
console.log('');
console.log('7) Fix 2 — Liga-Zeile findet ihren ESL-Zwilling ohne Mapping');

// ACHTUNG: "const eslByCcs" steht DREIMAL in der Datei (ckAgenten, rcStandRows-live,
// rcStandRows-Historie). Ein globales indexOf trifft die falsche Stelle und meldet
// gruen, weil das viel zu grosse Fenster den Treffer irgendwo einfaengt — genau der
// Messfehler aus Fallstrick 18. Deshalb je Block ANKERN und die Reihenfolge pruefen.
function joinFenster(anker) {
    const iA = src.indexOf(anker);
    if (iA < 0) return null;
    const iStart = src.lastIndexOf('const eslByCcs = {}, eslByName = {};', iA);
    if (iStart < 0) return null;
    return src.slice(iStart, iA + 400);
}
[['rcStandRows (Live-Zweig)', 'let ligaList = Object.values(window.rcKpiData || {});'],
 ['ckAgenten (Cockpit)',      'function ckAgenten(){']].forEach(function (p) {
    const iAnk = src.indexOf(p[1]);
    const iStart = src.indexOf('const eslByCcs = {}, eslByName = {};', iAnk);
    const iEnde  = src.indexOf('eslByCcs[a.vo] = a;', iStart);
    const block  = (iStart >= 0 && iEnde > iStart) ? src.slice(iStart, iEnde + 40) : '';
    pruef(p[0] + ': Block gefunden', iStart > 0 && iEnde > iStart && (iEnde - iStart) < 1800,
        'Abstand ' + (iEnde - iStart));
    pruef(p[0] + ': vo-Rueckfall ist eingebaut', /a\.vo && !eslByCcs\[a\.vo\]/.test(block));
    pruef(p[0] + ': echter ccsId-Treffer gewinnt (Rueckfall fuellt nur Luecken)',
        block.indexOf('eslByCcs[a.ccsId] = a') >= 0 &&
        block.indexOf('eslByCcs[a.ccsId] = a') < block.indexOf('!eslByCcs[a.vo]'));
});
pruef('Gegenprobe — der Rueckfall steht genau zweimal, nicht versehentlich ueberall',
    (src.match(/!eslByCcs\[a\.vo\]/g) || []).length === 2);

// funktional nachgestellt: genau die Lage vom 18.08.
(function () {
    const rcNormName = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).sort().join(' ');
    // Nikou Nelia steht NICHT in der Mitarbeiter-Excel: ccsId leer, Name = die Nummer.
    const agentsAll2 = [
        { vo:'234974', name:'234974', ccsId:'', kontakte:10, ansprachen:0 },
        { vo:'209089', name:'Kadam Emre', ccsId:'209089', kontakte:10, ansprachen:7 }
    ];
    const eslByCcs = {}, eslByName = {};
    agentsAll2.forEach(a => { if (a.ccsId) eslByCcs[a.ccsId] = a; eslByName[rcNormName(a.name)] = a; });
    const vorher = (k => (k.ccsId && eslByCcs[k.ccsId]) || eslByName[rcNormName(k.agentName)] || null);
    const kNikou = { ccsId:'234974', agentName:'Nikou Nelia', callCount:46 };
    pruef('Gegenprobe — OHNE den Rueckfall findet die Liga-Zeile ihren ESL-Zwilling nicht', vorher(kNikou) === null);

    agentsAll2.forEach(a => { if (a.vo && !eslByCcs[a.vo]) eslByCcs[a.vo] = a; });
    const nachher = (k => (k.ccsId && eslByCcs[k.ccsId]) || eslByName[rcNormName(k.agentName)] || null);
    const tr = nachher(kNikou);
    pruef('MIT dem Rueckfall wird der ESL-Zwilling gefunden', !!tr);
    gleich('und die Liga-Zeile traegt jetzt 10 ESL-Kontakte statt 0', tr ? tr.kontakte : null, 10);

    // Deckungspruefung: dieselbe Person darf nicht ZUSAETZLICH als ESL-Zeile kommen.
    const coveredCcs = new Set(['234974', '209089']);
    const doppelt = a => !(a.vo && coveredCcs.has(String(a.vo)));
    pruef('die ESL-Zeile derselben Person wird nicht mehr zusaetzlich angehaengt',
        doppelt(agentsAll2[0]) === false);
    pruef('ein Agent ohne Liga-Zwilling wird weiterhin angehaengt',
        doppelt({ vo:'999999', name:'999999', ccsId:'' }) === true);
})();

/* =================================================================== */
console.log('');
console.log('============================================================');
if (bad === 0) console.log('  ALLE ' + ok + ' PRUEFUNGEN BESTANDEN');
else console.log('  ' + bad + ' VON ' + (ok + bad) + ' FEHLGESCHLAGEN');
console.log('============================================================');
process.exit(bad ? 1 : 0);
