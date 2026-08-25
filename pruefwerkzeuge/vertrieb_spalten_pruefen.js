// ============================================================================
//  vertrieb_spalten_pruefen.js — prueft die Spaltenbildung des Blattes "Vertrieb"
//  gegen ECHTE Produktgruppen aus einem ESL-Tagesexport.
//
//  Anlass (04.08.): Der Nutzer fand im Blatt "keine KIP-BNTs, keine Mobil-BNTs".
//  Die Daten waren da (KIP BNT 190 Stueck, Mobilfunk BNT 250 Stueck am 14.07.),
//  aber rcProdKurz loescht "BNT"/"VVL" aus dem Gruppennamen — und die frueher nur
//  blockinterne Eindeutigmachung haengte deshalb NIE einen Zusatz an. Auf dem
//  Blatt standen viermal "KIP"/"MOBILFUNK" ohne Unterscheidung.
//
//  Das Skript schneidet die ECHTEN Funktionen aus esl_live_arena_v22.js heraus
//  (kein Nachbau — ein Nachbau wuerde die Korrektur nicht bewachen) und laesst
//  sie gegen die echten Gruppennamen laufen.
//
//  Aufruf:  node pruefwerkzeuge/vertrieb_spalten_pruefen.js
//  Sollwert: alle Pruefungen bestanden.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const QUELLE = path.join(WURZEL, 'esl_live_arena_v22.js');
const src = fs.readFileSync(QUELLE, 'utf8');

// --- Funktionen aus dem Master herausschneiden -------------------------------
function schneide(name) {
    const start = src.indexOf('function ' + name + '(');
    if (start < 0) throw new Error('Funktion ' + name + ' nicht in esl_live_arena_v22.js gefunden');
    let tiefe = 0, i = src.indexOf('{', start);
    const von = i;
    for (; i < src.length; i++) {
        const c = src[i];
        if (c === '{') tiefe++;
        else if (c === '}') { tiefe--; if (tiefe === 0) return src.slice(start, i + 1); }
    }
    throw new Error('Funktion ' + name + ' nicht sauber abgeschlossen');
}

const NAMEN = ['rcProdKurz', 'rcIstVvl', 'rcIstBnt', 'rcIstKern', 'rcIstGeraet', 'rcIstTipp', 'rcKeinVertrieb', 'rcSalesSpalten'];
// Konstanten, an denen die Ausschluss-Funktionen haengen
const konst = [];
['RC_KEIN_VERTRIEB', 'RC_KEIN_ABSCHLUSS'].forEach(k => {
    const m = src.match(new RegExp('const\\s+' + k + '\\s*=\\s*[^;]+;'));
    if (!m) throw new Error('Konstante ' + k + ' nicht gefunden');
    konst.push(m[0]);
});

const code = konst.join('\n') + '\nvar rcNurBcr = false;\n' +
    NAMEN.map(schneide).join('\n') +
    '\nreturn { rcSalesSpalten: rcSalesSpalten, rcProdKurz: rcProdKurz, rcIstKern: rcIstKern, rcKeinVertrieb: rcKeinVertrieb };';
const API = new Function(code)();

// --- Echte Datenlage ---------------------------------------------------------
// Gemessen an Test Excels/Export_20260714_205722.xlsx, Blatt dataTable,
// Spalte produktgrupe, nur ergebnis='angenommen', Summe der Spalte anzahl.
const ECHT = {
    'KIP VVL': 1397, 'PTV VVL': 941, 'ENV BNT': 621, 'PTV BNT': 506,
    'NBA Tipps KIP- und Mobile': 363, 'Mobilfunk BNT': 250, 'KIP BNT': 190,
    'Hardware KIP- und PTV': 171, 'Mobilfunk VVL': 147, 'DSL BNT': 67,
    'Fibre BNT': 63, 'KIP VVL (Stay)': 31, 'DSL VVL': 3,
};
// Davon CR-relevant — ebenfalls gemessen (produktmerkmal ungleich "nicht BCR").
// Vier Gruppen sind zu 100 % NICHT CR-relevant, zwei sind gemischt.
// Insgesamt 3144 von 4750 Stueck = 66,2 %; die uebrigen 33,8 % zahlen nicht
// auf die CR ein und standen bis zum 03.08. in denselben Spalten.
const ECHT_CR = {
    'KIP VVL': 1397, 'PTV VVL': 0, 'ENV BNT': 574, 'PTV BNT': 453,
    'NBA Tipps KIP- und Mobile': 0, 'Mobilfunk BNT': 250, 'KIP BNT': 190,
    'Hardware KIP- und PTV': 0, 'Mobilfunk VVL': 147, 'DSL BNT': 67,
    'Fibre BNT': 63, 'KIP VVL (Stay)': 0, 'DSL VVL': 3,
};

const rows = [{ prodG: ECHT, prodGBcr: ECHT_CR }];
const spalten = API.rcSalesSpalten(rows);

// --- Pruefungen --------------------------------------------------------------
let ok = 0, fehler = 0;
function pruef(titel, bedingung, zusatz) {
    if (bedingung) { ok++; console.log('  ok   ' + titel); }
    else { fehler++; console.log('  FEHL ' + titel + (zusatz ? '  -> ' + zusatz : '')); }
}

console.log('\nSpalten, die das Blatt "Vertrieb" an echten Daten erzeugt:');
spalten.forEach((s, i) => console.log('  ' + String(i + 1).padStart(2) + '. [' + s.art + '] "' + s.kurz + '"  (' + s.key + ', ' + s.summe + ' Stueck)'));
console.log('');

const finde = kurz => spalten.filter(s => s.kurz === kurz);
const nachKey = key => spalten.find(s => s.key === key);

pruef('KIP BNT hat eine eigene Spalte', !!nachKey('KIP BNT'));
pruef('Mobilfunk BNT hat eine eigene Spalte', !!nachKey('Mobilfunk BNT'));

// Nutzer-Vorgabe 04.08. Nachmittag (mit Screenshot, ersetzt die Vormittags-
// Regel "blattweit eindeutig"): der Spaltenkopf ist KURZ ("KIP", "MOB"), der
// Gruppenkopf BNT/VVL direkt darueber unterscheidet die Bloecke. Auffindbar
// bleiben die Kernspalten, weil sie IMMER vorn im Block stehen (auch bei 0).
const kipB = nachKey('KIP BNT'), kipV = nachKey('KIP VVL');
pruef('KIP-BNT heisst schlicht "KIP" (Gruppenkopf sagt BNT)', kipB && kipB.kurz === 'KIP', kipB && kipB.kurz);
pruef('KIP-VVL heisst ebenfalls "KIP" (anderer Block)', kipV && kipV.kurz === 'KIP', kipV && kipV.kurz);

const mobB = nachKey('Mobilfunk BNT'), mobV = nachKey('Mobilfunk VVL');
pruef('Mobilfunk wird zu "MOB" gekuerzt', mobB && mobB.kurz === 'MOB', mobB && mobB.kurz);
pruef('auch im VVL-Block "MOB"', mobV && mobV.kurz === 'MOB', mobV && mobV.kurz);

// Die Vorgabe vom 31.07. gilt weiter: eindeutige Namen bleiben OHNE Zusatz.
const env = nachKey('ENV BNT'), fib = nachKey('Fibre BNT');
pruef('ENV bleibt ohne Zusatz', env && env.kurz === 'ENV', env && env.kurz);
pruef('Fibre bleibt ohne Zusatz', fib && fib.kurz === 'Fibre', fib && fib.kurz);

// Eindeutigkeit gilt je BLOCK: innerhalb von BNT bzw. VVL darf kein Kopf
// doppelt sein — zwischen den Bloecken trennt der Gruppenkopf.
const blockDoppelt = Object.entries(spalten.reduce((a, s) => { const k = s.art + '|' + s.kurz; a[k] = (a[k] || 0) + 1; return a; }, {}))
    .filter(([, n]) => n > 1).map(([k]) => k);
pruef('innerhalb eines Blocks kommt kein Kopf doppelt vor', blockDoppelt.length === 0, blockDoppelt.join(', '));

// Kernspalten erscheinen auch OHNE Verkaeufe (Nutzer-Vorgabe 04.08.: Nullen
// motivieren — eine fehlende Spalte liest sich als "gibt es nicht").
const ohneKern = API.rcSalesSpalten([{ prodG: { 'ENV BNT': 5 }, prodGBcr: { 'ENV BNT': 5 } }]);
pruef('KIP-Spalte erscheint auch bei 0 verkauften KIP',
    ohneKern.some(s => s.key === 'KIP BNT' && s.summe === 0), ohneKern.map(s => s.key).join(', '));
pruef('MOB-Spalte erscheint auch bei 0 verkauften Mobilfunk',
    ohneKern.some(s => s.key === 'Mobilfunk BNT' && s.summe === 0));
pruef('Kernspalten stehen dabei VOR dem verkauften ENV',
    ohneKern.findIndex(s => s.key === 'KIP BNT') < ohneKern.findIndex(s => s.key === 'ENV BNT'));

// Kernprodukte stehen im BNT-Block vorn.
const bnt = spalten.filter(s => s.art === 'BNT');
const ersteKern = bnt.findIndex(s => API.rcIstKern(s.key));
const letzteKern = bnt.map((s, i) => API.rcIstKern(s.key) ? i : -1).filter(i => i >= 0).pop();
const erstesNichtKern = bnt.findIndex(s => !API.rcIstKern(s.key));
pruef('BNT-Block beginnt mit den Kernprodukten', ersteKern === 0, 'erste Kernspalte an Position ' + (ersteKern + 1));
pruef('Kernprodukte stehen zusammenhaengend vor dem Rest',
    letzteKern != null && erstesNichtKern > letzteKern,
    'letzte Kernspalte ' + letzteKern + ', erste andere ' + erstesNichtKern);
pruef('MOBILFUNK-BNT steht vor ENV (Kern vor Menge)',
    bnt.indexOf(mobB) >= 0 && bnt.indexOf(env) >= 0 && bnt.indexOf(mobB) < bnt.indexOf(env));

// Ausschluesse duerfen die Kern-Gruppen NICHT treffen.
pruef('KIP BNT wird nicht ausgefiltert', !API.rcKeinVertrieb('KIP BNT'));
pruef('Mobilfunk BNT wird nicht ausgefiltert', !API.rcKeinVertrieb('Mobilfunk BNT'));
pruef('Hardware wird weiterhin ausgefiltert', API.rcKeinVertrieb('Hardware KIP- und PTV'));
pruef('NBA Tipps werden weiterhin ausgefiltert', API.rcKeinVertrieb('NBA Tipps KIP- und Mobile'));
pruef('Hardware taucht nicht als Spalte auf', !nachKey('Hardware KIP- und PTV'));

// Hervorhebung: rcIstKern bekommt den ROHEN Namen, nicht den Kurznamen.
pruef('rcIstKern erkennt "KIP BNT"', API.rcIstKern('KIP BNT'));
pruef('rcIstKern erkennt "Mobilfunk BNT"', API.rcIstKern('Mobilfunk BNT'));
pruef('rcIstKern erkennt "ENV BNT" NICHT', !API.rcIstKern('ENV BNT'));

// Reihenfolge der Bloecke bleibt BNT vor VVL vor Sonstigem.
const arten = spalten.map(s => s.art);
pruef('Bloecke bleiben in der Reihenfolge BNT, VVL, Sonstiges',
    arten.join(',') === arten.slice().sort((a, b) => ({ BNT: 0, VVL: 1, SONST: 2 })[a] - ({ BNT: 0, VVL: 1, SONST: 2 })[b]).join(','),
    arten.join(','));

// Randfall: nur EINE Verkaufsart vorhanden -> kein Zusatz noetig.
const nurBnt = API.rcSalesSpalten([{ prodG: { 'KIP BNT': 10, 'ENV BNT': 5 }, prodGBcr: { 'KIP BNT': 10, 'ENV BNT': 5 } }]);
pruef('bei nur einer Verkaufsart bleibt "KIP" ohne Zusatz',
    nurBnt.some(s => s.kurz === 'KIP'), nurBnt.map(s => s.kurz).join(', '));

// --- CR-Relevanz: die Trennung vom 04.08. ----------------------------------
// Nutzer-Befund: "er zeigt immer wieder die nicht-CR-relevanten Produkte und
// macht sie mit den CR-relevanten zusammen. Das darf nicht passieren."
console.log('\n-- CR-relevant und nicht CR-relevant sind getrennt --');
const spKeys = spalten.map(s => s.key);
pruef('Gruppen OHNE jeden CR-Anteil bekommen keine Produktspalte mehr',
    !spKeys.includes('PTV VVL') && !spKeys.includes('NBA Tipps KIP- und Mobile') &&
    !spKeys.includes('Hardware KIP- und PTV') && !spKeys.includes('KIP VVL (Stay)'),
    spKeys.filter(k => ECHT_CR[k] === 0).join(', ') || 'keine');
pruef('gemischte Gruppen bleiben (ENV BNT, PTV BNT)',
    spKeys.includes('ENV BNT') && spKeys.includes('PTV BNT'));
pruef('voll CR-relevante Gruppen bleiben (KIP BNT, Mobilfunk BNT, KIP VVL)',
    spKeys.includes('KIP BNT') && spKeys.includes('Mobilfunk BNT') && spKeys.includes('KIP VVL'));
// Die Spaltensumme MUSS die CR-Menge sein, nicht die Gesamtmenge.
const summeSpalten = spalten.reduce((s, sp) => s + (ECHT_CR[sp.key] || 0), 0);
const summeCrGesamt = Object.values(ECHT_CR).reduce((a, b) => a + b, 0);
const summeAlles = Object.values(ECHT).reduce((a, b) => a + b, 0);
pruef('die Produktspalten summieren sich auf die CR-Menge (3144)',
    summeSpalten === summeCrGesamt && summeCrGesamt === 3144, summeSpalten);
pruef('das ist NICHT die Gesamtmenge (4750)', summeSpalten !== summeAlles, summeAlles);
pruef('die Differenz sind genau die nicht CR-relevanten (1606)',
    summeAlles - summeCrGesamt === 1606, summeAlles - summeCrGesamt);
// Hardware und NBA bleiben zusaetzlich ueber rcKeinVertrieb aussen vor —
// doppelt abgesichert, aber aus verschiedenen Gruenden.
pruef('Hardware faellt weiterhin auch ueber rcKeinVertrieb heraus', API.rcKeinVertrieb('Hardware KIP- und PTV'));
pruef('PTV VVL faellt NUR ueber die CR-Relevanz heraus, nicht ueber rcKeinVertrieb',
    !API.rcKeinVertrieb('PTV VVL'));

// Die drei Summenspalten im Blatt
pruef('Blatt hat eine Spalte "CR-relevant"', /cell\('CR-relevant'/.test(src));
pruef('Blatt hat eine Spalte "nicht CR-rel."', /cell\('nicht CR-rel\.'/.test(src));
pruef('Blatt hat weiterhin "Gesamt"', /r8\[cGesamt\]\s*=\s*cell\('Gesamt'/.test(src));
pruef('Summenzeile zeigt jetzt die NICHT CR-relevanten je Gruppe',
    /bz\('davon nicht CR-relevant'/.test(src));
pruef('die alte Zeile "davon BCR-relevant" ist ersetzt', !/bz\('davon BCR-relevant'/.test(src));

console.log('\n' + ok + ' bestanden, ' + fehler + ' fehlgeschlagen.');
process.exit(fehler ? 1 : 0);
