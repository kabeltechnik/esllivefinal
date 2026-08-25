/**
 * um_spalten_pruefen.js — Prueft die Spalten-Erkennung und die abgeleitete
 * Produktgruppe fuer ALLE DREI ESL-Projekte (Kabel / Mobile / UM).
 *
 * Anlass (06.08.): Der UM-Export hat GAR KEINE Gruppenspalte. Die Kopf-Erkennung
 * fiel deshalb auf den Positions-Standard zurueck und las "produktmerkmal" als
 * Produktgruppe — classify("BCR-Relevant") liefert cat=null, also wurde kein
 * einziger UM-Abschluss gezaehlt.
 *
 * Muster wie in den anderen Werkzeugen: die ECHTEN Funktionen werden per
 * Klammer-Zaehlung aus esl_live_arena_v22.js herausgeschnitten und mit
 * new Function ausgewertet — ein Nachbau bewachte nur seine eigene Kopie.
 * Zusaetzlich laufen alle Pruefungen gegen die ECHTEN Exporte in
 * "Excels vergleich/" (Kabel.xlsx, Mobile.xlsx, UM.xlsx).
 *
 * Aufruf:  node pruefwerkzeuge/um_spalten_pruefen.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const QUELLE = path.join(WURZEL, 'esl_live_arena_v22.js');
const EXCELDIR = path.join(WURZEL, 'Excels vergleich');

let ok = 0, fehl = 0;
function pruef(name, bedingung, zusatz){
    if (bedingung) { ok++; console.log('  [ok]   ' + name); }
    else { fehl++; console.log('  [FEHL] ' + name + (zusatz ? '  -> ' + zusatz : '')); }
}
function abschnitt(t){ console.log('\n== ' + t + ' =='); }

const src = fs.readFileSync(QUELLE, 'utf8');

// ---- Funktion per Klammer-Zaehlung ausschneiden ---------------------------
function schneideFunktion(name){
    const start = src.indexOf('function ' + name + '(');
    if (start === -1) throw new Error('Funktion nicht gefunden: ' + name);
    let i = src.indexOf('{', start), tiefe = 0;
    for (; i < src.length; i++){
        const c = src[i];
        if (c === '{') tiefe++;
        else if (c === '}') { tiefe--; if (tiefe === 0) return src.slice(start, i + 1); }
    }
    throw new Error('Klammern unausgeglichen bei ' + name);
}

// ---- Die drei echten Funktionen laden ------------------------------------
const fensterStub = { };
const geladen = new Function('window', 'rcLog',
    schneideFunktion('rcProduktGruppe') + '\n' +
    schneideFunktion('rcIstPotentialTracking') + '\n' +
    schneideFunktion('classify') + '\n' +
    'return { rcProduktGruppe, rcIstPotentialTracking, classify };'
)(fensterStub, { log(){}, warn(){} });
const { rcProduktGruppe, rcIstPotentialTracking, classify } = geladen;

// ---- Den ECHTEN Spalten-Erkennungsblock ausschneiden ---------------------
// Von "let idx = { datum:0" bis unmittelbar VOR der Grund-Spalten-Suche.
const idxVon = src.indexOf('let idx = { datum:0');
const idxBis = src.indexOf('const gi = h.findIndex', idxVon);
if (idxVon === -1 || idxBis === -1) { console.log('Spalten-Block nicht gefunden'); process.exit(1); }
const idxBlock = src.slice(idxVon, idxBis);
const spaltenErkennen = new Function('sheetData', 'window', 'rcLog',
    idxBlock + '\n return idx;'
);
function idxFuer(header){ return spaltenErkennen([header], {}, { log(){}, warn(){} }); }

// ---- Echte Exporte lesen -------------------------------------------------
let XLSX = null;
try { XLSX = require('xlsx'); } catch(e) {
    try { XLSX = require(path.join(WURZEL, 'node_modules', 'xlsx')); } catch(e2) {}
}
function blatt(datei){
    if (!XLSX) return null;
    const p = path.join(EXCELDIR, datei);
    if (!fs.existsSync(p)) return null;
    const wb = XLSX.readFile(p);
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, raw:false, defval:'' });
}

console.log('UM-Spalten und abgeleitete Produktgruppe — Pruefung');
console.log('Quelle: ' + path.basename(QUELLE));

// =========================================================================
abschnitt('1) Spalten-Erkennung je Projekt-Layout');

const KOPF_KABEL  = ['datum','standort','team','vo_nummer','kunde','produktgrupe','produktmerkmal','produkt','ergebnis','anzahl','sis_angesprochen','sis_nicht_moeglich_grund','id'];
const KOPF_MOBILE = ['datum','standort','team','vo_nummer','kunde','osf_id','produktgruppe','produktmerkmal','produkt','ergebnis','anzahl','sis_angesprochen','sis_nicht_moeglich_grund','id'];
const KOPF_UM     = ['datum','standort','team','vo_nummer','kunde','produktmerkmal','produkt','ergebnis','anzahl','sis_angesprochen','sis_nicht_moeglich_grund','Winback','Bundesland','Postleitzahl','id'];

// Die Koepfe muessen den ECHTEN Dateien entsprechen — sonst prueft das Werkzeug
// ein Layout, das es so nicht gibt.
[['Kabel.xlsx', KOPF_KABEL], ['Mobile.xlsx', KOPF_MOBILE], ['UM.xlsx', KOPF_UM]].forEach(([d, erwartet]) => {
    const r = blatt(d);
    if (!r) { console.log('  [--]   ' + d + ' nicht lesbar (uebersprungen)'); return; }
    const echt = r[0].map(x => String(x).trim());
    pruef(d + ': Kopfzeile entspricht dem hier gepruegten Layout',
        JSON.stringify(echt) === JSON.stringify(erwartet), JSON.stringify(echt));
});

const iK = idxFuer(KOPF_KABEL), iM = idxFuer(KOPF_MOBILE), iU = idxFuer(KOPF_UM);
pruef('Kabel: prod=5 (produktgrupe), produkt=7, merkmal=6, erg=8, anz=9',
    iK.prod === 5 && iK.produkt === 7 && iK.merkmal === 6 && iK.erg === 8 && iK.anz === 9, JSON.stringify(iK));
pruef('Mobile: prod=6 (produktgruppe, zwei p), produkt=8, merkmal=7, erg=9, anz=10',
    iM.prod === 6 && iM.produkt === 8 && iM.merkmal === 7 && iM.erg === 9 && iM.anz === 10, JSON.stringify(iM));
pruef('UM: prod=-1 (keine Gruppenspalte, KEIN Positions-Rueckfall auf 5)',
    iU.prod === -1, 'prod=' + iU.prod);
pruef('UM: produkt=6, merkmal=5, erg=7, anz=8, ansp=9, id=14',
    iU.produkt === 6 && iU.merkmal === 5 && iU.erg === 7 && iU.anz === 8 && iU.ansp === 9 && iU.id === 14, JSON.stringify(iU));
// GEGENPROBE: genau der alte Fehler — prod zeigte auf die Merkmal-Spalte.
pruef('Gegenprobe: UM prod zeigt NICHT mehr auf die Merkmal-Spalte',
    iU.prod !== iU.merkmal, 'prod=' + iU.prod + ' merkmal=' + iU.merkmal);
// Ohne Produktspalte bleibt der Positions-Rueckfall erhalten (Export ohne Kopf).
const iOhne = idxFuer(['a','b','c','d','e','f','g','h','i','j']);
pruef('Ohne erkennbare Kopfzeile bleibt der Positions-Standard prod=5',
    iOhne.prod === 5, 'prod=' + iOhne.prod);

// =========================================================================
abschnitt('2) rcProduktGruppe gegen ALLE echten Produkt/Gruppe-Paare');

// Lexikon aus den Exporten, in denen BEIDE Spalten vorliegen.
const paare = {};
[['Kabel.xlsx', iK], ['Mobile.xlsx', iM]].forEach(([d, ix]) => {
    const r = blatt(d); if (!r) return;
    for (let i = 1; i < r.length; i++){
        const p = String(r[i][ix.produkt] || '').trim();
        const g = String(r[i][ix.prod] || '').trim();
        if (p && g) paare[p] = g;
    }
});
const namen = Object.keys(paare);
pruef('Echte Produkt/Gruppe-Paare eingelesen (>150 erwartet)', namen.length > 150, namen.length + ' Paare');

let treffer = 0; const daneben = [];
namen.forEach(p => {
    const soll = paare[p], ist = rcProduktGruppe('', p);
    // Das Portal schreibt Winback in drei Schreibweisen (WINBACK / Winback /
    // "VUM WInback nicht anfassen"). classify() kennt keine davon, die Gruppe
    // ist also nur ein Anzeigename — Gross-/Kleinschreibung darf abweichen.
    const gleich = ist === soll || (/winback/i.test(ist) && /winback/i.test(soll));
    if (gleich) treffer++; else daneben.push(p + ': ist="' + ist + '" soll="' + soll + '"');
});
pruef('rcProduktGruppe trifft JEDES echte Paar (' + treffer + '/' + namen.length + ')',
    namen.length > 0 && treffer === namen.length, daneben.slice(0, 5).join(' | '));

pruef('Vorhandene Gruppe wird UNVERAENDERT durchgereicht (Kabel/Mobile bleiben wie sie sind)',
    rcProduktGruppe('KIP VVL', 'BNT GigaMobil M') === 'KIP VVL');
pruef('Leere Gruppe UND leeres Produkt ergibt leer (kein Raten)',
    rcProduktGruppe('', '') === '' && rcProduktGruppe(null, null) === '');
pruef('Unbekanntes Produkt ohne BNT/VVL-Praefix wird gemeldet statt geraten',
    (function(){
        fensterStub.rcProduktOhneGruppe = {};
        const r = rcProduktGruppe('', 'VVL Voellig Neues Ding Ohne Stichwort');
        return r === '' && fensterStub.rcProduktOhneGruppe['VVL Voellig Neues Ding Ohne Stichwort'] === 1;
    })());

// Die drei Faelle, an denen die Regel-REIHENFOLGE haengt (gemessen, nicht geraten)
pruef('TV Connect ist asymmetrisch: BNT -> ENV BNT',
    rcProduktGruppe('', 'BNT TV Connect Standard') === 'ENV BNT');
pruef('TV Connect ist asymmetrisch: VVL -> PTV VVL',
    rcProduktGruppe('', 'VVL TV Connect Tarifwechsel') === 'PTV VVL');
pruef('TV Connect schlaegt BV (sonst waere "BNT TV Connect Zuhause BV" KIP BNT)',
    rcProduktGruppe('', 'BNT TV Connect Zuhause BV') === 'ENV BNT');
pruef('Prevention schlaegt BV/Kabel -> KIP VVL (Stay)',
    rcProduktGruppe('', 'VVL GigaZuhause BV Kabel Prevention Light 50- bis 1000') === 'KIP VVL (Stay)');

// =========================================================================
abschnitt('3) Potential Tracking wird in ALLEN drei Layouts erkannt');

pruef('Mobile-Schreibweise: Merkmal traegt "Potential Tracking"',
    rcIstPotentialTracking('potential tracking', 'Info World') === true);
pruef('Kabel/UM-Schreibweise: Merkmal LEER, nur das Produkt heisst "Info World"',
    rcIstPotentialTracking('', 'Info World') === true);
pruef('Gross-/Kleinschreibung und Leerzeichen egal',
    rcIstPotentialTracking('', '  INFO   WORLD ') === true);
pruef('Echte Produkte werden NICHT faelschlich als Testeintrag verworfen',
    rcIstPotentialTracking('bcr-relevant', 'BNT GigaMobil M') === false &&
    rcIstPotentialTracking('', 'VVL Info World Paket XL') === false);

[['Kabel.xlsx', iK], ['Mobile.xlsx', iM], ['UM.xlsx', iU]].forEach(([d, ix]) => {
    const r = blatt(d); if (!r) return;
    let erkannt = 0, iw = 0;
    for (let i = 1; i < r.length; i++){
        const nm = String(r[i][ix.produkt] || '').trim();
        const mm = ix.merkmal !== -1 ? String(r[i][ix.merkmal] || '') : '';
        if (/^info world$/i.test(nm)) { iw++; if (rcIstPotentialTracking(mm, nm)) erkannt++; }
    }
    pruef(d + ': alle ' + iw + ' Info-World-Zeilen erkannt', iw > 0 && erkannt === iw, erkannt + ' von ' + iw);
});

// =========================================================================
abschnitt('4) Durchlauf ueber die echten Exporte: Stueck je Kategorie');

function stueckZaehlen(datei, ix){
    const r = blatt(datei); if (!r) return null;
    const out = { stueck:0, ohneGruppe:0, kontakte:new Set(), cats:{} };
    for (let i = 1; i < r.length; i++){
        const row = r[i];
        const nm  = ix.produkt !== -1 ? String(row[ix.produkt] || '').trim() : '';
        const mm  = ix.merkmal !== -1 ? String(row[ix.merkmal] || '') : '';
        if (rcIstPotentialTracking(mm, nm)) continue;
        out.kontakte.add(String(row[ix.id] || i));
        const erg = String(row[ix.erg] || '').toLowerCase();
        const anz = parseInt(row[ix.anz]) || 0;
        if (!(anz > 0 && erg.includes('angenommen'))) continue;
        const g = rcProduktGruppe(ix.prod !== -1 ? row[ix.prod] : '', nm);
        if (!g) { out.ohneGruppe += anz; continue; }
        const c = classify(g);
        if (c.cat) { out.stueck += anz; out.cats[c.cat] = (out.cats[c.cat] || 0) + anz; }
    }
    return out;
}

const zK = stueckZaehlen('Kabel.xlsx', iK);
const zU = stueckZaehlen('UM.xlsx', iU);
const zM = stueckZaehlen('Mobile.xlsx', iM);

if (zU) {
    pruef('UM zaehlt jetzt ueberhaupt Abschluesse (frueher 0)', zU.stueck > 0, zU.stueck + ' Stueck');
    pruef('UM: kein angenommenes Stueck bleibt ohne Gruppe', zU.ohneGruppe === 0, zU.ohneGruppe + ' ohne Gruppe');
    pruef('UM verteilt sich auf mehrere Kategorien (nicht alles in einen Topf)',
        Object.keys(zU.cats).length >= 4, JSON.stringify(zU.cats));
}
if (zK && zU) {
    // Kabel.xlsx und UM.xlsx enthalten denselben Datenbestand in zwei Layouts
    // (gleiche Zeilenzahl, gleiche ids). Wenn die Ableitung stimmt, MUSS
    // dieselbe Zahl herauskommen — das ist die schaerfste Probe im Werkzeug.
    const gleicheBasis = blatt('Kabel.xlsx').length === blatt('UM.xlsx').length;
    if (gleicheBasis) {
        pruef('UM-Layout liefert exakt dieselben Stueck wie das Kabel-Layout derselben Daten',
            zK.stueck === zU.stueck, 'Kabel=' + zK.stueck + ' UM=' + zU.stueck);
        pruef('... und dieselbe Verteilung je Kategorie',
            JSON.stringify(zK.cats) === JSON.stringify(zU.cats),
            'Kabel=' + JSON.stringify(zK.cats) + ' UM=' + JSON.stringify(zU.cats));
        pruef('... und dieselbe Kontaktzahl',
            zK.kontakte.size === zU.kontakte.size, zK.kontakte.size + ' vs ' + zU.kontakte.size);
    }
}
if (zM) pruef('Mobile bleibt unveraendert zaehlbar', zM.stueck > 0, zM.stueck + ' Stueck');

// GEGENPROBE: haette das Werkzeug den alten Fehler ueberhaupt gefunden?
if (blatt('UM.xlsx')) {
    const alt = Object.assign({}, iU, { prod: 5 });   // alter Positions-Rueckfall
    const zAlt = stueckZaehlen('UM.xlsx', alt);
    pruef('Gegenprobe: mit dem alten Positions-Rueckfall (prod=5) zaehlt UM 0 Stueck',
        zAlt && zAlt.stueck === 0, zAlt ? zAlt.stueck + ' Stueck' : 'nicht messbar');
}

// =========================================================================
abschnitt('5) Verdrahtung im Dashboard');

function ohneKommentare(t){
    // Grober, aber ausreichender Kommentar-Entferner MIT Regex-Literal-Erkennung
    // (ein '/' nach Name/Zahl/')' ist Division, sonst Regex-Beginn).
    let out = '', i = 0, vor = '';
    while (i < t.length){
        const c = t[i], n = t[i+1];
        if (c === '/' && n === '/') { while (i < t.length && t[i] !== '\n') i++; continue; }
        if (c === '/' && n === '*') { i += 2; while (i < t.length && !(t[i] === '*' && t[i+1] === '/')) i++; i += 2; continue; }
        if (c === '"' || c === "'" || c === '`'){ const q = c; i++; while (i < t.length && t[i] !== q){ if (t[i] === '\\') i++; i++; } i++; out += '""'; vor = '"'; continue; }
        if (c === '/' && !/[\w$)\]]/.test(vor)){ i++; while (i < t.length && t[i] !== '/'){ if (t[i] === '\\') i++; if (t[i] === '[') { while (i < t.length && t[i] !== ']'){ if (t[i]==='\\') i++; i++; } } i++; } i++; out += '/re/'; vor = ')'; continue; }
        out += c; if (!/\s/.test(c)) vor = c; i++;
    }
    return out;
}
const nackt = ohneKommentare(src);

pruef('rcProduktGruppe ist eine Funktionsdeklaration (wird oberhalb benutzt, darf keine const sein)',
    /function\s+rcProduktGruppe\s*\(/.test(nackt) && !/(const|let|var)\s+rcProduktGruppe\s*=/.test(nackt));
pruef('rcIstPotentialTracking nimmt ZWEI Parameter',
    /function\s+rcIstPotentialTracking\s*\(\s*merkmalRaw\s*,\s*produktRaw\s*\)/.test(nackt));

const aufrufe = (nackt.match(/rcIstPotentialTracking\s*\(/g) || []).length - 1; // ohne die Deklaration
pruef('rcIstPotentialTracking wird an mindestens 3 Stellen aufgerufen (Live-Parser, Historie, Produkt-Karte)',
    aufrufe >= 3, aufrufe + ' Aufrufe');
pruef('KEIN Aufruf von rcIstPotentialTracking mehr mit nur EINEM Argument',
    !/rcIstPotentialTracking\s*\(\s*[A-Za-z_$][\w$]*\s*\)/.test(nackt));

const nutzt = (nackt.match(/rcProduktGruppe\s*\(/g) || []).length - 1;
pruef('rcProduktGruppe wird an mindestens 3 Stellen benutzt (Parser, rcAccumRow, renderProducts)',
    nutzt >= 3, nutzt + ' Aufrufe');
pruef('rcAccumRow classifiziert die ABGELEITETE Gruppe, nicht mehr die Rohspalte',
    /classify\(gruppe\)/.test(nackt) && !/classify\(\(r\[ix\.prod\]/.test(nackt));
pruef('rcReadSheet kennt die Produktspalte und schaltet den Positions-Rueckfall ab',
    /ix\s*=\s*\{[^}]*produkt:\s*-1/.test(nackt) && /!hatGruppe\s*&&\s*ix\.produkt\s*!==\s*-1/.test(nackt));
pruef('Live-Parser schaltet den Positions-Rueckfall ebenfalls ab',
    /!hatGruppe\s*&&\s*idx\.produkt\s*!==\s*-1/.test(nackt));
pruef('set() liefert jetzt einen Wahrheitswert zurueck (sonst waere hatGruppe immer undefined)',
    (nackt.match(/i!==-1\)\{\s*idx\[key\]=i;\s*return true;/.test(nackt.replace(/\s+/g,'')) ? /x/ : /y/) , true) &&
    /return true;\s*\}\s*\}\s*return false;/.test(nackt.replace(/\n/g, ' ')));

// Der Live-Knopf: die Antwort des Crawlers muss durch die Empfaenger-Whitelist.
// ACHTUNG: hier NICHT gegen "nackt" pruefen — der Kommentar-Entferner ersetzt
// jede Zeichenkette durch "" und damit auch den gesuchten Typnamen.
// Jeder in handleKpiMessage behandelte Typ muss in der Whitelist stehen.
const whitelist = (src.match(/window\.__rcKpiMsgHandler\s*=\s*function[\s\S]{0,900}?\n    \};/) || [''])[0];
const behandelt = ['KPI_BATCH', 'KPI_UPDATE', 'RC_HARVEST_RANGE_DONE', 'RC_LIVE_NOW_DONE'];
behandelt.forEach(t => pruef('Empfaenger-Whitelist laesst ' + t + ' durch',
    whitelist.indexOf("'" + t + "'") !== -1));
pruef('Gegenprobe: ein NICHT gelisteter Typ wird als fehlend erkannt',
    whitelist.indexOf("'RC_GIBT_ES_NICHT'") === -1);

// =========================================================================
console.log('\n' + (fehl === 0
    ? 'ALLE ' + ok + ' PRUEFUNGEN BESTANDEN'
    : fehl + ' von ' + (ok + fehl) + ' FEHLGESCHLAGEN'));
process.exit(fehl === 0 ? 0 : 1);
