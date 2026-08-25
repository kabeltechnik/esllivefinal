// ===========================================================================
//  export_konsolidierung_pruefen.js  —  Pruefwerkzeug (offline, ohne Portal)
// ===========================================================================
//
//  Bewacht die Aenderungen vom 06.08.2026, alle aus dem Abgleich der drei
//  Dashboard-Mappen gegen den echten ESL-Export und die echte Ligaliste
//  (Ordner "Excels vergleich", Zeitraum 01.-05.08.2026):
//
//   1. "Potential Tracking" (Produkt "Info World") ist KEIN Vertrieb und KEIN
//      Kontakt. Es fiel bei den Produkt-Blaettern schon heraus (keine
//      produktgrupe), lief aber in die ESL-KONTAKTE ein: 8853 statt 8117.
//   2. Das Blatt "Stacks" ordnete Agenten dem falschen Standort zu, weil es
//      ueber die TEAM-Eimer rechnete und ein Team-Objekt nur EINEN Standort
//      haelt. Gemessen: 293 Liga-Calls und 452 ESL-Kontakte lagen bei Berlin
//      statt bei Potsdam (VKD-TECH-52/53 sitzen an beiden Orten).
//   3. "Liga Standorte" und "Liga Teams" zeigten Detailspalten, die NICHT auf
//      ihre eigene Summe aufgingen (PTV BNT bzw. DSL/FIB BNT hatten keine
//      Spalte): Alanya 87+18+33+45 = 183 neben "BNT GES. 318".
//   4. Das Vertriebs-Blatt zaehlte Geraete und NBA-Tipps in "nicht CR-rel."
//      und "Gesamt" mit, waehrend die Fussnote darunter das Gegenteil sagte.
//   5. Der Einzelprodukte-Block zeigte bei einem Zeitraum-Export nur den
//      LETZTEN Tag (711 statt 2702 Stueck), ohne jeden Hinweis.
//   6. Es gibt nur noch EINE Ausgabe: regiocom_ESL_Report.
//
//  Aufruf:  node pruefwerkzeuge/export_konsolidierung_pruefen.js
//  Nichts zu installieren (Citrix ohne Adminrechte).
// ===========================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(WURZEL, 'esl_live_arena_v22.js'), 'utf8');

let ok = 0, fehler = 0;
function pruef(titel, bedingung, zusatz) {
    if (bedingung) { ok++; console.log('  ok   ' + titel); }
    else { fehler++; console.log('  FEHL ' + titel + (zusatz !== undefined ? '  -> ' + zusatz : '')); }
}
function abschnitt(t){ console.log('\n--- ' + t + ' ---'); }

// ---------------------------------------------------------------------------
//  Kommentare entfernen (Strings bleiben stehen). Ohne diesen Schritt traefen
//  die Suchen die eigenen Erklaertexte oben und meldeten IMMER gruen — genau
//  die wertlose Pruefung, die es hier nicht geben darf. Regex-Literale muessen
//  VOR den Zeichenketten erkannt werden: v22.js enthaelt .replace(/[&<>"]/g,…),
//  dessen " sonst eine Zeichenkette ueber tausende Zeilen oeffnet.
// ---------------------------------------------------------------------------
function ohneKommentare(s) {
    let out = '', i = 0, letztesEchtes = '';
    const n = s.length;
    while (i < n) {
        const c = s[i], c2 = s[i + 1];
        if (c === '/' && c2 === '/') { while (i < n && s[i] !== '\n') i++; continue; }
        if (c === '/' && c2 === '*') { i += 2; while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
        if (c === '/') {
            const istRegex = letztesEchtes === '' || '(,=:[!&|?{};+-*%~^<>'.indexOf(letztesEchtes) >= 0;
            if (istRegex) {
                out += c; i++;
                let inKlasse = false;
                while (i < n) {
                    const z = s[i];
                    if (z === '\\') { out += z + (s[i + 1] || ''); i += 2; continue; }
                    out += z; i++;
                    if (z === '[') inKlasse = true;
                    else if (z === ']') inKlasse = false;
                    else if (z === '/' && !inKlasse) break;
                }
                letztesEchtes = '/'; continue;
            }
        }
        if (c === '"' || c === "'" || c === '`') {
            const q = c; out += c; i++;
            while (i < n) {
                const z = s[i];
                if (z === '\\') { out += z + (s[i + 1] || ''); i += 2; continue; }
                out += z; i++;
                if (z === q) break;
            }
            letztesEchtes = q; continue;
        }
        out += c;
        if (!/\s/.test(c)) letztesEchtes = c;
        i++;
    }
    return out;
}
const code = ohneKommentare(src);

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
const schneide = name => schneideAus(code, 'function ' + name + '(');

// ===========================================================================
abschnitt('1. Potential Tracking — definiert, hoistbar, wirklich aufgerufen');
// ===========================================================================

pruef('rcIstPotentialTracking ist definiert',
    /function\s+rcIstPotentialTracking\s*\(/.test(code));

// Muss eine Funktionsdeklaration sein: processDataStream ruft sie rund 200
// Zeilen oberhalb der Definition auf. Ein const laege dort in der temporalen
// Todeszone und legte beim Re-Inject das halbe Dashboard still.
pruef('… als Funktionsdeklaration, nicht als const (TDZ-Regel)',
    !/(const|let|var)\s+rcIstPotentialTracking\s*=/.test(code));

const koerperParse = schneideAus(code, 'window.processDataStream = function(');
const koerperAccum = schneide('rcAccumRow');

pruef('processDataStream ruft rcIstPotentialTracking auf',
    /rcIstPotentialTracking\s*\(/.test(koerperParse));
pruef('… und ueberspringt die Zeile per continue',
    /if\s*\(\s*rcIstPotentialTracking\([^)]*\)\s*\)\s*continue\s*;/.test(koerperParse));
pruef('rcAccumRow ruft rcIstPotentialTracking auf',
    /rcIstPotentialTracking\s*\(/.test(koerperAccum));
pruef('… und steigt per return aus',
    /if\s*\(\s*rcIstPotentialTracking\([^)]*\)\s*\)\s*return\s*;/.test(koerperAccum));

// Beide Pfade MUESSEN dieselbe Regel haben. Fehlte sie in rcAccumRow, zeigten
// Live-Stand und Tages-Historie fuer denselben Tag verschiedene Kontaktzahlen.
pruef('GEGENPROBE Aufruf-Erkennung schlaegt an, wenn der Aufruf fehlt',
    !/rcIstPotentialTracking\s*\(/.test(koerperAccum.replace(/rcIstPotentialTracking\s*\(/g, 'nixDa(')));

// --- funktional ---
const fnPT = new Function('return ' + schneide('rcIstPotentialTracking'))();
pruef('trifft "Potential Tracking"', fnPT('Potential Tracking') === true);
pruef('trifft auch kleingeschrieben (der Parser reicht toLowerCase durch)',
    fnPT('potential tracking') === true);
pruef('trifft NICHT "BCR-relevant"', fnPT('BCR-relevant') === false);
pruef('trifft NICHT "nicht BCR-relevant"', fnPT('nicht BCR-relevant') === false);
pruef('trifft NICHT den Leerwert', fnPT('') === false && fnPT(null) === false);

// ===========================================================================
abschnitt('2. Stacks — (Standort x Stack) aus den AGENTEN, nicht ueber Teams');
// ===========================================================================

const koerperAgg = schneide('rcAggAusRows');
pruef('rcAggAusRows liefert ein Feld "stacks"', /\bstacks:\s*Object\.values\(stackBuckets\)/.test(koerperAgg));
pruef('die Stack-Eimer werden je Standort UND Stack geschluesselt',
    /std\s*\+\s*'\|'\s*\+\s*\(ag\.stack/.test(koerperAgg));
pruef('Liga-Calls werden je Stack-Eimer direkt aus dem Agenten summiert',
    /b\.ligaCalls\s*=\s*\(b\.ligaCalls\s*\|\|\s*0\)\s*\+\s*lc/.test(koerperAgg));

const koerperAggSheets = schneideAus(code, 'function rcBuildAggSheets(');
const stacksBlock = (function(){
    const i = koerperAggSheets.indexOf("flatSheet('Stacks'");
    const von = koerperAggSheets.lastIndexOf('(function(){', i);
    return koerperAggSheets.slice(von, koerperAggSheets.indexOf('})();', i) + 5);
})();
pruef('das Stacks-Blatt liest agg.stacks', /agg\s*&&\s*agg\.stacks/.test(stacksBlock));
pruef('das Stacks-Blatt rechnet NICHT mehr ueber teamsAlle',
    !/teamsAlle/.test(stacksBlock));

// --- funktional: ein Team an ZWEI Standorten ---
// Genau der gemessene Fall: VKD-TECH-52 hat Agenten in Berlin UND Potsdam.
const umgebung = {
    window: { rcWcaMapping: { stackMap: { 'VKD-TECH-52': 'VKD_Tech', 'VKD-TECH-51': 'VKD_Tech' } } }
};
// rcAggAusRows holt den Stack seit 05.10. ueber die zentrale Regel (Mapping, sonst
// Anker) — die echten Funktionen dafuer muessen mit in den ausgewerteten Quelltext.
const aggFn = new Function('window', 'classify',
    require('./_stack_regel.js').quelltext(code) + '\n' + schneide('rcAggAusRows') + '; return rcAggAusRows;')(umgebung.window,
    // classify nutzt seit 28.09. die Geraete-Regel (RC_KEIN_VERTRIEB + rcIstGeraet)
    new Function(code.match(/const RC_KEIN_VERTRIEB = [^\n]+/)[0] + '\n' + schneide('rcIstGeraet') + '\nreturn ' + schneide('classify'))());

const rows = [
    // Berlin, Team 52 — 100 Calls, 10 Kontakte, 1 KIP BNT
    { standort:'B', team:'VKD-TECH-52', name:'A Eins', ccs:'1', calls:100, kont:10, ansp:5,
      hasEsl:true, prodG:{ 'KIP BNT':1 }, prodGBcr:{ 'KIP BNT':1 } },
    // Potsdam, DASSELBE Team — 300 Calls, 40 Kontakte, 3 KIP BNT
    { standort:'P', team:'VKD-TECH-52', name:'B Zwei', ccs:'2', calls:300, kont:40, ansp:20,
      hasEsl:true, prodG:{ 'KIP BNT':3 }, prodGBcr:{ 'KIP BNT':3 } },
    // Potsdam, eigenes Team
    { standort:'P', team:'VKD-TECH-51', name:'C Drei', ccs:'3', calls:50, kont:5, ansp:2,
      hasEsl:true, prodG:{ 'KIP BNT':2 }, prodGBcr:{ 'KIP BNT':2 } }
];
const agg = aggFn({ rows });
const hol = (std, stack) => (agg.stacks || []).find(o => o.standort === std && o.stack === stack) || {};
const bSt = hol('B', 'VKD_Tech'), pSt = hol('P', 'VKD_Tech');

pruef('Berlin/VKD_Tech bekommt NUR seinen eigenen Agenten (100 Liga-Calls)',
    bSt.ligaCalls === 100, 'ist ' + bSt.ligaCalls);
pruef('Potsdam/VKD_Tech bekommt BEIDE Potsdam-Agenten (350 Liga-Calls)',
    pSt.ligaCalls === 350, 'ist ' + pSt.ligaCalls);
pruef('ESL-Kontakte folgen dem Agenten-Standort (Berlin 10, Potsdam 45)',
    bSt.calls === 10 && pSt.calls === 45, 'B=' + bSt.calls + ' P=' + pSt.calls);
pruef('Stueckzahlen folgen dem Agenten-Standort (Berlin 1, Potsdam 5)',
    bSt.kip === 1 && pSt.kip === 5, 'B=' + bSt.kip + ' P=' + pSt.kip);
pruef('die Summe ueber die Stacks bleibt die Gesamtsumme (450 Calls)',
    (agg.stacks || []).reduce((s,o) => s + (o.ligaCalls||0), 0) === 450);

// GEGENPROBE: ueber die TEAM-Eimer gerechnet — also der alte Weg — landet das
// ganze Team an EINEM Standort. Faellt diese Pruefung, dann teilt auch der alte
// Weg korrekt auf und der Test misst nichts.
const teamEimer = (agg.teams || []).find(t => t.code === 'VKD-TECH-52') || {};
pruef('GEGENPROBE der Team-Eimer haelt weiterhin nur EINEN Standort',
    teamEimer.standort === 'B' && (teamEimer.calls === 50),
    'standort=' + teamEimer.standort + ' kontakte=' + teamEimer.calls);
pruef('GEGENPROBE ueber die Teams gerechnet laege Potsdam zu niedrig',
    (agg.teams || []).filter(t => t.standort === 'P')
        .reduce((s,t) => s + (t.calls||0), 0) === 5);

// Der Standort-Eimer war schon immer richtig — er ist die Gegenrechnung.
const stdP = (agg.stds || []).find(s => s.code === 'P') || {};
pruef('Standort-Eimer Potsdam stimmt mit dem Stack-Eimer ueberein (45 Kontakte)',
    stdP.calls === 45 && stdP.calls === pSt.calls);

// ===========================================================================
abschnitt('3. Liga-Blaetter — Detailspalten gehen auf ihre Summe auf');
// ===========================================================================

const ligaStdBlock = koerperAggSheets.slice(
    koerperAggSheets.indexOf("const grp = ['Standort','Liga-Calls'"),
    koerperAggSheets.indexOf("book_append_sheet(wb, ws, 'Liga Standorte')"));
['ENV BNT','DSL / FIB BNT','KIP BNT','MOB BNT','PTV BNT'].forEach(sp =>
    pruef('Liga Standorte fuehrt die Spalte "' + sp + '"', ligaStdBlock.indexOf("'" + sp + "'") >= 0));
pruef('Liga Standorte fuehrt "PTV / DSL VVL" (fibVvl)',
    ligaStdBlock.indexOf("'PTV / DSL VVL'") >= 0 && /s\.fibVvl/.test(ligaStdBlock));
pruef('sonstBnt laeuft in der PTV-Spalte mit (sonst fehlte es in der Summe)',
    /\(s\.ptv \|\| 0\) \+ \(s\.sonstBnt \|\| 0\)/.test(ligaStdBlock));

const ligaTeamBlock = koerperAggSheets.slice(
    koerperAggSheets.indexOf("const grp = ['Standort / Team'"),
    koerperAggSheets.indexOf("book_append_sheet(wb, ws, 'Liga Teams')"));
['ENV BNT','PTV BNT','KIP BNT','Mobilfunk BNT','DSL / FIB BNT'].forEach(sp =>
    pruef('Liga Teams fuehrt die Spalte "' + sp + '"', ligaTeamBlock.indexOf("'" + sp + "'") >= 0));
pruef('Liga Teams fuehrt "PTV / DSL VVL" (fibVvl)',
    ligaTeamBlock.indexOf("'PTV / DSL VVL'") >= 0 && /o\.fibVvl/.test(ligaTeamBlock));

// Rechnerisch: die genannten Spalten muessen genau bntOf()/vvlOf() abdecken.
const bntTeile = ['env','fibDsl','kip','mob','ptv','sonstBnt'];
const vvlTeile = ['kipVvl','mobVvl','fibVvl'];
pruef('Liga Standorte deckt alle sechs BNT-Bestandteile ab',
    bntTeile.every(t => new RegExp('s\\.' + t + '\\b').test(ligaStdBlock)));
pruef('Liga Standorte deckt alle drei VVL-Bestandteile ab',
    vvlTeile.every(t => new RegExp('s\\.' + t + '\\b').test(ligaStdBlock)));
pruef('Liga Teams deckt alle sechs BNT-Bestandteile ab',
    bntTeile.every(t => new RegExp('o\\.' + t + '\\b').test(ligaTeamBlock)));
pruef('Liga Teams deckt alle drei VVL-Bestandteile ab',
    vvlTeile.every(t => new RegExp('o\\.' + t + '\\b').test(ligaTeamBlock)));

// ===========================================================================
abschnitt('4. Vertrieb — Geraete und NBA-Tipps sind in KEINER Spalte');
// ===========================================================================

const koerperSales = schneide('rcBuildSalesSheet');
pruef('allesAgent schliesst Geraete/NBA aus (rcKeinVertrieb)',
    /allesAgent\s*=\s*r\s*=>[\s\S]{0,180}rcKeinVertrieb\(g\)/.test(koerperSales));
pruef('GEGENPROBE ohne rcKeinVertrieb waere die Pruefung rot',
    !/allesAgent\s*=\s*r\s*=>[\s\S]{0,180}rcKeinVertrieb\(g\)/
        .test(koerperSales.replace(/rcKeinVertrieb\(g\)/g, 'false')));
pruef('die Fussnote behauptet nicht mehr nur "Geraete nicht enthalten"',
    /in KEINER Spalte enthalten/.test(koerperSales));

// Dasselbe im Vertriebs-PNG der Stundenmail: zwei Zeichenwege, EINE Logik.
// Laufen sie auseinander, zeigen Mail-Bild und Mappe verschiedene Summen.
pruef('das Vertriebs-PNG nutzt dieselbe Regel',
    /allesOf\s*=\s*function\(r\)\s*\{[\s\S]{0,200}rcKeinVertrieb\(g\)/.test(code));

// ===========================================================================
abschnitt('5. Einzelprodukte — nur fuer EINEN Tag, nie fuer einen Zeitraum');
// ===========================================================================

const koerperProd = schneide('rcBuildProdukteSheet');
pruef('es gibt eine Ein-Tag-Pruefung',
    /const einTag = !\(data\.von && data\.bis && data\.von !== data\.bis\)/.test(koerperProd));
pruef('rcAllSales wird nur bei einem einzelnen Tag benutzt',
    /data\.today && einTag && Array\.isArray\(window\.rcAllSales\)/.test(koerperProd));
pruef('bei einem Zeitraum steht ein erklaerender Satz statt einer Tabelle',
    /Einzelprodukte gibt es nur fuer EINEN Tag/.test(koerperProd));
pruef('GEGENPROBE ohne einTag-Gate waere die Pruefung rot',
    !/data\.today && einTag && Array\.isArray/
        .test(koerperProd.replace(/data\.today && einTag &&/g, 'data.today &&')));

// rcStandRowsZeitraum MUSS von/bis mitgeben, sonst greift das Gate nie.
const koerperZR = schneide('rcStandRowsZeitraum');
pruef('rcStandRowsZeitraum liefert von und bis mit',
    /von:\s*vonKey/.test(koerperZR) && /bis:\s*bisKey/.test(koerperZR));

// ===========================================================================
abschnitt('6. Genau EINE Ausgabe: regiocom_ESL_Report');
// ===========================================================================

const koerperZeitraum = schneideAus(code, 'window.rcExportStandZeitraum = function(');
pruef('voll ist der Vorgabewert', /if \(voll === undefined\) voll = true;/.test(koerperZeitraum));

const koerperDialog = schneideAus(code, 'window.rcOpenExportWahl = function(');
// 06.08. abends: EIN Knopf, vier Zeitbezuege als Radios (heute/gestern/woche/frei),
// alle ueber rcExportStandZeitraum. Die alten Einzel-Knoepfe sind raus.
pruef('der Export-Dialog hat GENAU EINEN Erstellen-Knopf',
    /id="rcExWahlGo"/.test(koerperDialog)
    && !/id="rcExWahlKum"/.test(koerperDialog) && !/id="rcExWahlJeTag"/.test(koerperDialog)
    && !/id="rcExWahlVoll"/.test(koerperDialog) && !/id="rcExWahlHeute"/.test(koerperDialog)
    && !/id="rcExWahlTagGo"/.test(koerperDialog));
pruef('… und keine verwaisten Handler dazu',
    !/an\('rcExWahlKum'/.test(koerperDialog) && !/an\('rcExWahlJeTag'/.test(koerperDialog)
    && !/an\('rcExWahlHeute'/.test(koerperDialog) && !/an\('rcExWahlTagGo'/.test(koerperDialog));
pruef('die vier Zeitbezuege stehen als Radios im Dialog',
    /radio\('heute'/.test(koerperDialog) && /radio\('gestern'/.test(koerperDialog)
    && /radio\('woche'/.test(koerperDialog) && /radio\('frei'/.test(koerperDialog));
// Seit 09.08. reicht der Dialog zusaetzlich seine Statuszeile herein
// (…, voll, melden) — der PFAD bleibt derselbe, nur die Argumentliste ist
// laenger. Deshalb hier auf den Funktionsnamen mit scopeAus() pruefen und
// nicht mehr auf die exakte Klammer.
pruef('alle Zeitbezuege laufen ueber DENSELBEN Pfad (rcExportStandZeitraum)',
    /rcExportStandZeitraum\(b\.von, b\.bis, scopeAus\(\)/.test(koerperDialog)
    && !/rcExportReport\(true\)/.test(koerperDialog));
pruef('der Filter bietet Standort, Stack UND Team an',
    /id="rcExWahlStd"/.test(koerperDialog) && /id="rcExWahlStack"/.test(koerperDialog)
    && /id="rcExWahlTeam"/.test(koerperDialog));

const koerperRange = schneideAus(code, 'window.rcOpenRange = function(');
pruef('der Zeitraum-Dialog hat nur noch EINEN Bericht-Knopf',
    /id="rcRgKumuliert"/.test(koerperRange) && !/id="rcRgStand"/.test(koerperRange));
pruef('… und ruft rcExportStandRange dort nicht mehr auf',
    !/rcExportStandRange/.test(koerperRange));

// rcExportStandRange selbst bleibt bestehen (Konsolen-Rueckfall) — es zu
// loeschen waere eine Aenderung, die niemand verlangt hat.
pruef('rcExportStandRange existiert weiterhin fuer die Konsole',
    /window\.rcExportStandRange = function\(/.test(code));

// ===========================================================================
abschnitt('7. Team-Zuordnung kommt AUSSCHLIESSLICH aus der Mitarbeiter-Excel');
// ===========================================================================
//  Nutzer-Vorgabe 06.08.: "die Teamzuordnung der Mitarbeiter entnehmen wir aus
//  der Mitarbeiter-Excel-Datei. In ESL sind naemlich Mitarbeiter in falschen
//  Teams." Belegt am Export 01.-05.08.2026: 17 von 35 ESL-Teams mischen mehrere
//  echte Teams (ESL "Vodafone AL 06" enthaelt VKD-TECH-82/83/84/86).

pruef('die Team-Nummer-Bruecke ist restlos entfernt',
    !/teamNrBridge/.test(code));
pruef('das Team kommt aus dem Mapping, sonst bleibt der ESL-Rohname',
    /team = m\.team \|\| teamRaw;/.test(koerperParse));
pruef('GEGENPROBE die Regel-Pruefung schlaegt an, wenn wieder geraten wird',
    !/team = m\.team \|\| teamRaw;/.test(
        koerperParse.replace(/team = m\.team \|\| teamRaw;/g, 'team = m.team || bridge[teamRaw] || teamRaw;')));
pruef('der Standort kommt ebenfalls aus dem Mapping',
    /if \(m\.standort\) code = normalizeStandort\(m\.standort\);/.test(koerperParse));

// Ungemappte Agenten muessen abrufbar sein — sonst faellt eine wachsende
// Mapping-Luecke erst auf, wenn jemand die Team-Zahlen anzweifelt.
pruef('ungemappte Agenten werden gesammelt', /const ohneMapping = \[\]/.test(koerperParse));
pruef('… mit VO-Nummer, ESL-Team und Standort',
    /ohneMapping\.push\(\{ vo: voRaw, eslTeam: teamRaw, standort: code \}\)/.test(koerperParse));
pruef('… und auf window gelegt', /window\.rcOhneMapping = ohneMapping\.slice\(\)/.test(koerperParse));
// Seit 05.10. entprellt (der Parser laeuft alle 20 s — vorher stand dieselbe Zeile
// bei jedem Lauf im Logbuch) und zusaetzlich SICHTBAR: Zaehler in der Kopfleiste.
pruef('… und gemeldet, wenn welche fehlen',
    /if \(ohneMapping\.length && window\.rcLueckenGemeldet !== lueckenSig\)[\s\S]{0,260}rcLog\.warn/.test(koerperParse));
pruef('… und in der Kopfleiste sichtbar gemacht (Zaehler "ohne Stack")',
    /window\.rcOhneStack = window\.rcZuordnungLuecken\.filter\(/.test(koerperParse) && /rcOhneStackChip\(\)/.test(koerperParse));

// rcStandRows: BEIDE Mapping-Wege schlagen den Live-Agenten. Stuende la.team
// davor, erbte ein ungemappter Agent dort wieder seinen ESL-Rohnamen, obwohl
// ueber die CCS-ID ein Mapping-Eintrag existiert.
const koerperStandRows = schneide('rcStandRows');
pruef('rcStandRows: Mapping (VO) und Mapping (CCS) vor dem Live-Agenten',
    /m\.team \|\| \(cm && cm\.team\) \|\| la\.team/.test(koerperStandRows));
pruef('rcStandRows: dieselbe Reihenfolge beim Standort',
    /m\.standort \|\| \(cm && cm\.standort\) \|\| la\.standort/.test(koerperStandRows));
pruef('GEGENPROBE die Reihenfolge-Pruefung schlaegt bei der alten Fassung an',
    !/m\.team \|\| \(cm && cm\.team\) \|\| la\.team/.test(
        koerperStandRows.replace(/m\.team \|\| \(cm && cm\.team\) \|\| la\.team/g,
                                 'm.team || la.team || (cm && cm.team)')));

// ===========================================================================
console.log('\n' + '='.repeat(60));
console.log('  ' + ok + ' bestanden, ' + fehler + ' fehlgeschlagen.');
console.log('='.repeat(60));
process.exit(fehler ? 1 : 0);
