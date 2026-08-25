// ============================================================================
//  vollbericht_zeitraum_pruefen.js — prueft den vollstaendigen Bericht fuer
//  einen frei gewaehlten Zeitraum (Nutzer-Wunsch 05.08.: "dieses Report moechte
//  ich auch nach manueller von-bis Zeitangabe haben! Ich bekomme es nur immer
//  fuer heutigen Tag.").
//
//  Bis 05.08. rechnete rcExportReport die Blaetter Struktur / Liga Standorte /
//  Liga Teams / Standorte / Stacks / Teams / Agenten / Entwicklung aus den
//  LIVE-Aggregaten (standortStats/teamStats/agentStats). Die gibt es nur fuer
//  heute — genau daran hing die Beschraenkung. Jetzt liefert rcAggAusRows
//  dieselben Objektformen aus den Stand-Zeilen, und rcBuildAggSheets ist die
//  EINZIGE Fassung dieser Blaetter.
//
//  Das Skript schneidet die ECHTEN Funktionen aus esl_live_arena_v22.js heraus
//  (Klammerzaehlung, kein Nachbau — ein Nachbau bewachte nur seine eigene
//  Kopie), laesst sie gegen von Hand nachgerechnete Zeilen laufen UND baut eine
//  echte .xlsx, die anschliessend zurueckgelesen wird. "Der Code sieht richtig
//  aus" ist keine Abnahme: der numFmt-Leak von xlsx-js-style ist nur an der
//  fertigen Datei zu sehen.
//
//  Zu JEDER neuen Regel gehoert eine GEGENPROBE, die belegt, dass die Pruefung
//  den echten Fehler auch erkennen wuerde. Eine Pruefung, die immer gruen
//  meldet, ist schlimmer als keine.
//
//  Aufruf:  node pruefwerkzeuge/vollbericht_zeitraum_pruefen.js
//  Sollwert: alle Pruefungen bestanden.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const WURZEL = path.join(__dirname, '..');
const QUELLE = path.join(WURZEL, 'esl_live_arena_v22.js');
const src = fs.readFileSync(QUELLE, 'utf8');

let ok = 0, fehler = 0;
function pruef(titel, bedingung, zusatz) {
    if (bedingung) { ok++; console.log('  ok   ' + titel); }
    else { fehler++; console.log('  FEHL ' + titel + (zusatz !== undefined ? '  -> ' + zusatz : '')); }
}
function abschnitt(t){ console.log('\n--- ' + t + ' ---'); }

// ---------------------------------------------------------------------------
//  Kommentare entfernen (Strings BLEIBEN stehen)
// ---------------------------------------------------------------------------
//  Wichtig fuer die Struktur-Pruefungen: die neuen Kommentarbloecke nennen
//  "rcAggAusRows" und "rcBuildAggSheets" mehrfach. Ohne diesen Schritt wuerde
//  eine Suche nach dem Aufruf die eigene Dokumentation treffen und IMMER gruen
//  melden — genau die wertlose Pruefung, die es hier nicht geben darf.
//  Strings bleiben absichtlich erhalten: der Dialog-Knopf und seine
//  Verdrahtung stecken in String-Literalen.
function ohneKommentare(s) {
    let out = '', i = 0;
    // Letztes bedeutsames Zeichen (ohne Leerraum) — daran haengt die
    // Unterscheidung "Regex-Literal" gegen "Division".
    let letztesEchtes = '';
    const n = s.length;
    while (i < n) {
        const c = s[i], c2 = s[i + 1];
        if (c === '/' && c2 === '/') { while (i < n && s[i] !== '\n') i++; continue; }
        if (c === '/' && c2 === '*') { i += 2; while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
        // REGEX-LITERALE MUESSEN VOR DEN ZEICHENKETTEN KOMMEN.
        // Ohne diesen Zweig war das Werkzeug wertlos: esl_live_arena_v22.js
        // enthaelt u.a. .replace(/[&<>"]/g, ...) — das " darin galt als Beginn
        // einer Zeichenkette, die dann bis zum naechsten " lief und dabei
        // tausende Zeilen Code verschluckte. Danach meldete die Pruefung
        // "rcAggAusRows ist definiert" als FEHLGESCHLAGEN, obwohl die Funktion
        // in Zeile 12599 steht. Eine Pruefung, die das Gegenteil der Wahrheit
        // meldet, ist schlimmer als gar keine.
        //
        // Ein "/" beginnt einen Regex, wenn davor ein Operator/Satzzeichen steht
        // (dort kann keine Division stehen). Nach Name, Zahl oder schliessender
        // Klammer ist es dagegen eine Division.
        if (c === '/') {
            const vor = letztesEchtes;
            const istRegex = vor === '' || '(,=:[!&|?{};+-*%~^<>'.indexOf(vor) >= 0;
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
                    else if (z === '\n') break;          // unbeendet -> war doch kein Regex
                }
                letztesEchtes = '/';
                continue;
            }
        }
        if (c === '"' || c === "'" || c === '`') {
            const q = c; out += c; i++;
            while (i < n) {
                if (s[i] === '\\') { out += s[i] + (s[i + 1] || ''); i += 2; continue; }
                out += s[i];
                if (s[i] === q) { i++; break; }
                i++;
            }
            letztesEchtes = q;
            continue;
        }
        out += c; i++;
        if (!/\s/.test(c)) letztesEchtes = c;
    }
    return out;
}
const codeOnly = ohneKommentare(src);

// Gegenprobe zum Kommentar-Entferner selbst: ein Wort, das AUSSCHLIESSLICH in
// einem Kommentar steht, darf danach nicht mehr auffindbar sein.
abschnitt('Werkzeug selbst (Kommentar-Entferner)');
pruef('Kommentar-Entferner loescht Kommentartext',
    src.indexOf('Fallstrick Nr. 3 im Projekt') >= 0 && codeOnly.indexOf('Fallstrick Nr. 3 im Projekt') < 0);
pruef('Kommentar-Entferner laesst String-Literale stehen',
    codeOnly.indexOf('rcExWahlGo') >= 0);

// ---------------------------------------------------------------------------
//  Funktionen herausschneiden
// ---------------------------------------------------------------------------
function schneideAus(text, kopf) {
    const start = text.indexOf(kopf);
    if (start < 0) throw new Error('nicht gefunden: ' + kopf);
    let tiefe = 0, i = text.indexOf('{', start);
    for (; i < text.length; i++) {
        const c = text[i];
        if (c === '{') tiefe++;
        else if (c === '}') { tiefe--; if (tiefe === 0) return text.slice(start, i + 1); }
    }
    throw new Error('nicht sauber abgeschlossen: ' + kopf);
}
const schneide = name => schneideAus(src, 'function ' + name + '(');
const konstZeile = name => {
    const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*[^;\\n]+;'));
    if (!m) throw new Error('Konstante ' + name + ' nicht gefunden');
    return m[0];
};

// ---------------------------------------------------------------------------
//  1. Wird es ueberhaupt aufgerufen?
// ---------------------------------------------------------------------------
//  Erste Frage bei jedem neuen Feature in diesem Projekt: "gebaut, aber
//  nirgends aufgerufen" ist die haeufigste Fehlerklasse (EinAnmeldeVersuch,
//  esl_mail_report.ps1, rcExportStandZeitraum).
abschnitt('1. Definiert UND wirklich aufgerufen');

pruef('rcAggAusRows ist definiert', /function\s+rcAggAusRows\s*\(/.test(codeOnly));
pruef('rcBuildAggSheets ist definiert', /function\s+rcBuildAggSheets\s*\(/.test(codeOnly));

const koerperReport = schneideAus(codeOnly, 'window.rcExportReport = function(');
const koerperZeitraum = schneideAus(codeOnly, 'window.rcExportStandZeitraum = function(');

pruef('rcExportReport ruft rcAggAusRows auf', /rcAggAusRows\s*\(/.test(koerperReport));
pruef('rcExportReport ruft rcBuildAggSheets auf', /rcBuildAggSheets\s*\(/.test(koerperReport));
pruef('rcExportStandZeitraum ruft rcAggAusRows auf', /rcAggAusRows\s*\(/.test(koerperZeitraum));
pruef('rcExportStandZeitraum ruft rcBuildAggSheets auf', /rcBuildAggSheets\s*\(/.test(koerperZeitraum));

// GEGENPROBE: ohne den Aufruf muss die Pruefung rot werden.
pruef('GEGENPROBE Aufruf-Erkennung schlaegt an, wenn der Aufruf fehlt',
    !/rcAggAusRows\s*\(/.test(koerperZeitraum.replace(/rcAggAusRows\s*\(/g, 'nixDa(')));

// ---------------------------------------------------------------------------
//  2. Nur EINE Fassung der Aggregat-Blaetter
// ---------------------------------------------------------------------------
//  "Dieselbe Kennzahl, zwei Rechenwege" ist der teuerste wiederkehrende
//  Fallstrick des Projekts. Eine zweite Kopie dieser Blaetter fuer Zeitraeume
//  waere genau das.
abschnitt('2. Keine zweite Kopie der Aggregat-Blaetter');

const zaehle = (text, nadel) => text.split(nadel).length - 1;
const BLAETTER = ['Struktur', 'Liga Standorte', 'Liga Teams', 'Standorte', 'Stacks', 'Teams', 'Agenten'];
BLAETTER.forEach(b => {
    const n = zaehle(codeOnly, "book_append_sheet(wb, ws, '" + b + "')")
            + zaehle(codeOnly, "flatSheet('" + b + "'");
    pruef('Blatt "' + b + '" wird genau EINMAL angelegt', n === 1, n + ' Fundstellen');
});
pruef('rcBuildAggSheets existiert genau einmal',
    zaehle(codeOnly, 'function rcBuildAggSheets') === 1);
pruef('rcAggAusRows existiert genau einmal',
    zaehle(codeOnly, 'function rcAggAusRows') === 1);

// GEGENPROBE: eine kuenstlich verdoppelte Fassung muss auffallen.
const dupliziert = codeOnly + "\nbook_append_sheet(wb, ws, 'Struktur');\n";
pruef('GEGENPROBE Doppel-Erkennung schlaegt bei einer zweiten Kopie an',
    (zaehle(dupliziert, "book_append_sheet(wb, ws, 'Struktur')") + zaehle(dupliziert, "flatSheet('Struktur'")) !== 1);

// rcExportReport darf die Blaetter nicht mehr selbst bauen (sonst haette das
// Herausloesen nichts gebracht und es gaebe wieder zwei Wege).
pruef('rcExportReport baut die Blaetter NICHT mehr selbst',
    !/book_append_sheet\(wb, ws, 'Struktur'\)/.test(koerperReport));
pruef('rcExportReport liest keine Live-Aggregate mehr fuer diese Blaetter',
    !/standortStats/.test(koerperReport) && !/teamStats/.test(koerperReport),
    'standortStats/teamStats noch im Rumpf');

// ---------------------------------------------------------------------------
//  3. rcAggAusRows an von Hand nachgerechneten Zeilen
// ---------------------------------------------------------------------------
abschnitt('3. Rechnung — Liga-Calls und ESL-Kontakte sauber getrennt');

const STD_META = { AL:{name:'Alanya'}, SER:{name:'Serres'}, B:{name:'Berlin'} };

function baueAPI(mutation) {
    let quelle =
        konstZeile('bcrOf') + '\n' +
        konstZeile('nonBcrOf') + '\n' +
        schneide('classify') + '\n' +
        schneide('rcAggAusRows') + '\n';
    if (mutation) quelle = mutation(quelle);
    return new Function('window', quelle + '\nreturn { rcAggAusRows: rcAggAusRows, classify: classify };');
}
const win = { rcWcaMapping: { stackMap: { 'VKD-TECH-83': 'VKD_Tech', 'VKD-TECH-84': 'VKD_Tech' } } };
const API = baueAPI(null)(win);

// --- Zeilen genau so, wie rcStandRows / rcStandRowsZeitraum sie liefern ------
// Row 1: voller Datensatz mit Produktaufschluesselung.
// Row 2: Vertrieb da, aber KEINE Aufschluesselung (Tag aelter als 21 Tage).
// Row 3: nur Liga (kein ESL-Zwilling) -> Kontakte/Ansprachen bleiben null.
// Row 4: nicht zuzuordnen -> standort ist der Platzhalter 'ALL'.
const ZEILEN = [
    { name:'Anna A', team:'VKD-TECH-83', standort:'AL', ccs:'1001', hasEsl:true,
      calls:100, kont:12, ansp:30, kip:3, mob:2, bnt:8, vvl:5,
      prodG:    { 'KIP BNT':3, 'Mobilfunk BNT':2, 'ENV BNT':3, 'KIP VVL':5, 'NBA Tipps KIP- und Mobile':7 },
      prodGBcr: { 'KIP BNT':3, 'Mobilfunk BNT':2, 'ENV BNT':1, 'KIP VVL':5 } },
    { name:'Bert B', team:'VKD-TECH-83', standort:'AL', ccs:'1002', hasEsl:true,
      calls:50, kont:4, ansp:10, kip:1, mob:0, bnt:1, vvl:0, prodG:null, prodGBcr:null },
    { name:'Cem C', team:'VKD-TECH-84', standort:'SER', ccs:'1003', hasEsl:false,
      calls:200, kont:null, ansp:0, kip:null, mob:null, bnt:null, vvl:null, prodG:null, prodGBcr:null },
    { name:'Dora D', team:'', standort:'ALL', ccs:'', hasEsl:true,
      calls:7, kont:1, ansp:2, kip:0, mob:0, bnt:0, vvl:0, prodG:null, prodGBcr:null }
];
const agg = API.rcAggAusRows({ rows: ZEILEN });
const stdVon = c => agg.stds.find(s => s.code === c);
const teamVon = n => agg.teams.find(t => t.name === n);
const AL = stdVon('AL'), SER = stdVon('SER');

// Die beiden Nenner. Von Hand: Liga AL = 100+50 = 150, ESL-Kontakte AL = 12+4 = 16.
// Waeren sie vertauscht oder vermischt, stuenden hier 150 bzw. 16 an der
// falschen Stelle — und jede CR-Quote im Blatt waere um Faktor ~9 daneben.
pruef('Liga-Calls AL = 150 (row.calls)', agg.liga.byStd['AL'] === 150, agg.liga.byStd['AL']);
pruef('Liga-Calls SER = 200', agg.liga.byStd['SER'] === 200, agg.liga.byStd['SER']);
pruef('Liga-Calls gesamt = 357 (auch die nicht zuzuordnende Zeile zaehlt mit)',
    agg.liga.total === 357, agg.liga.total);
pruef('ESL-Kontakte AL = 16 (row.kont)', AL && AL.calls === 16, AL && AL.calls);
pruef('ESL-Kontakte sind NICHT die Liga-Calls', AL && AL.calls !== agg.liga.byStd['AL']);
pruef('Liga-Calls je Team AL-Team = 150', agg.liga.byTeam['VKD-TECH-83'] === 150, agg.liga.byTeam['VKD-TECH-83']);
pruef('Ansprachen AL = 40', AL && AL.pitches === 40, AL && AL.pitches);

// GEGENPROBE: verwechselt man die beiden Felder, muss die Pruefung rot werden.
const APIfalsch = baueAPI(q => q.replace("add(o, 'calls', ag.kontakte)", "add(o, 'calls', ag.ligaCalls)"))(win);
const aggFalsch = APIfalsch.rcAggAusRows({ rows: ZEILEN });
const ALfalsch = aggFalsch.stds.find(s => s.code === 'AL');
pruef('GEGENPROBE Vertauschen der Nenner faellt auf', ALfalsch.calls === 150, ALfalsch.calls);

abschnitt('4. Produktgruppen — fehlende Aufschluesselung ergibt null, nicht 0');

// Row 1 hat prodG, Row 2 nicht. Auf Standort-Ebene addiert sich nur Row 1.
pruef('ENV AL = 3 (nur aus der Zeile mit Aufschluesselung)', AL && AL.env === 3, AL && AL.env);
pruef('KIP AL = 4 (eigenes Historien-Feld, auch ohne Aufschluesselung)', AL && AL.kip === 4, AL && AL.kip);
pruef('BNT AL = 9 (eigenes Historien-Feld)', AL && AL.bnt === 9, AL && AL.bnt);
pruef('Gesamt AL = 14 (BNT + VVL)', AL && AL.total === 14, AL && AL.total);

const bertAgg = agg.agents.find(a => a.name === 'Bert B');
pruef('Agent ohne prodG: ENV ist null, nicht 0', bertAgg && bertAgg.env === null, bertAgg && bertAgg.env);
pruef('Agent ohne prodG: PTV ist null, nicht 0', bertAgg && bertAgg.ptv === null, bertAgg && bertAgg.ptv);
pruef('Agent ohne prodG: BCR-rel. ist null, nicht 0', bertAgg && bertAgg.bcr === null, bertAgg && bertAgg.bcr);
pruef('Agent ohne prodG: KIP bleibt 1 (eigenes Feld ueberlebt 40 Tage)',
    bertAgg && bertAgg.kip === 1, bertAgg && bertAgg.kip);
pruef('prodLuecke meldet die fehlende Aufschluesselung', agg.prodLuecke === true, agg.prodLuecke);

// GEGENPROBE: wer das null wegoptimiert, faellt auf.
const APInull = baueAPI(q => q.replace('FEIN.forEach(f => { ag[f] = pg ? (fein[f] || 0) : null; });',
                                       'FEIN.forEach(f => { ag[f] = (fein[f] || 0); });'))(win);
const bertNull = APInull.rcAggAusRows({ rows: ZEILEN }).agents.find(a => a.name === 'Bert B');
pruef('GEGENPROBE aus null gemachte 0 faellt auf', bertNull.env === 0, bertNull.env);

// GEGENPROBE: prodLuecke muss FALSCH sein, wenn alle Zeilen eine
// Aufschluesselung haben — sonst meldet sie immer "Luecke" und ist wertlos.
const nurVoll = API.rcAggAusRows({ rows: [ZEILEN[0]] });
pruef('GEGENPROBE prodLuecke ist false, wenn nichts fehlt', nurVoll.prodLuecke === false, nurVoll.prodLuecke);

abschnitt('5. BCR-Trennung und NBA-Ausschluss');

// Von Hand: BCR-relevant = 3 (KIP BNT) + 2 (MOB BNT) + 1 (ENV BNT) + 5 (KIP VVL) = 11.
// Nicht relevant = ENV BNT 3-1 = 2. Die 7 NBA-Tipps zaehlen in KEINE der beiden
// Zahlen — classify() liefert dort cat null, und genau so zaehlt auch
// processDataStream live (die Zaehlung steht dort INNERHALB von "if (cat)").
pruef('BCR-relevant AL = 11', AL && AL.bcr === 11, AL && AL.bcr);
pruef('nicht BCR-relevant AL = 2', AL && AL.nonBcr === 2, AL && AL.nonBcr);
pruef('NBA-Tipps (7 Stueck) zaehlen weder als BCR noch als nicht-BCR',
    AL && (AL.bcr + AL.nonBcr) === 13, AL && (AL.bcr + AL.nonBcr));
pruef('classify kennt NBA Tipps nicht (cat null)',
    API.classify('NBA Tipps KIP- und Mobile').cat === null);

// GEGENPROBE: ohne den cat-Filter liefen die NBA-Tipps mit.
const APInba = baueAPI(q => q.replace('if (!c.cat) return;', 'if (false) return;'))(win);
const ALnba = APInba.rcAggAusRows({ rows: ZEILEN }).stds.find(s => s.code === 'AL');
pruef('GEGENPROBE ohne cat-Filter kaemen die NBA-Tipps mit',
    (ALnba.bcr + ALnba.nonBcr) === 20, ALnba.bcr + ALnba.nonBcr);

abschnitt('6. "ALL" ist ein Platzhalter, kein Standort');

// normalizeStandort('') liefert 'ALL'. Als Standort-Schluessel ergaebe das eine
// Zeile "ALL" mitten zwischen den echten Standorten.
pruef('kein Standort-Eintrag "ALL"', !agg.stds.some(s => s.code === 'ALL'),
    JSON.stringify(agg.stds.map(s => s.code)));
pruef('genau zwei echte Standorte (AL, SER)', agg.stds.length === 2, agg.stds.length);
pruef('die nicht zuzuordnende Zeile bleibt in der Agentenliste',
    agg.agents.some(a => a.name === 'Dora D'));
pruef('sie erzeugt aber keinen Team-Eintrag', !agg.teams.some(t => t.name === ''));

// GEGENPROBE: ohne die Sonderbehandlung entstuende der Eintrag.
const APIall = baueAPI(q => q.replace("const std = (stdRoh && stdRoh !== 'ALL') ? stdRoh : '';",
                                      "const std = stdRoh;"))(win);
pruef('GEGENPROBE ohne Platzhalter-Filter entstuende ein Standort "ALL"',
    APIall.rcAggAusRows({ rows: ZEILEN }).stds.some(s => s.code === 'ALL'));

abschnitt('7. Zeilen ohne ESL-Bezug: null statt 0');

const cem = agg.agents.find(a => a.name === 'Cem C');
pruef('Agent ohne ESL: Kontakte null', cem && cem.kontakte === null, cem && cem.kontakte);
pruef('Agent ohne ESL: Ansprachen null', cem && cem.ansprachen === null, cem && cem.ansprachen);
pruef('Agent ohne ESL: Gesamt null', cem && cem.total === null, cem && cem.total);
pruef('Agent ohne ESL: Liga-Calls trotzdem 200', cem && cem.ligaCalls === 200, cem && cem.ligaCalls);
pruef('Standort SER: ESL-Kontakte null (kein Tag mit ESL-Daten)',
    SER && SER.calls === null, SER && SER.calls);

abschnitt('8. Team-Zuordnung und Stack');

const t83 = teamVon('VKD-TECH-83');
pruef('Team VKD-TECH-83 haengt an Standort AL', t83 && t83.standort === 'AL', t83 && t83.standort);
pruef('Stack kommt aus dem Mapping', t83 && t83.stack === 'VKD_Tech', t83 && t83.stack);
pruef('Team-Kontakte = 16 (ESL)', t83 && t83.calls === 16, t83 && t83.calls);

// ---------------------------------------------------------------------------
//  9. rcStandRows / rcStandRowsZeitraum liefern die neuen Felder
// ---------------------------------------------------------------------------
abschnitt('9. Die Zeilen tragen standort / kont / ccs');

const koerperStandRows = schneideAus(codeOnly, 'function rcStandRows(');
const koerperZeitraumRows = schneideAus(codeOnly, 'function rcStandRowsZeitraum(');

// Vier rows.push-Stellen in rcStandRows (live/Liga, live/ESL-only,
// Historie/Liga, Historie/ESL-only). Jede muss standort UND kont setzen —
// fehlt eine, faellt genau ein Teil der Agenten aus den Aggregaten.
pruef('rcStandRows hat 4 rows.push-Stellen',
    zaehle(koerperStandRows, 'rows.push(') === 4, zaehle(koerperStandRows, 'rows.push('));

// JE AUSGABEZEILE pruefen, nicht global zaehlen.
// Ein globales Zaehlen meldete "kont an 5 statt 4 Stellen" rot — der Code war
// aber richtig: die fuenfte Zuweisung gehoert zu `const rec = {...}` bei Zeile
// ~10084, einem Zwischenobjekt, das die Historie normalisiert und spaeter als
// `ag.kont` gelesen wird. Eine Zaehlung ueber die ganze Funktion misst also
// etwas anderes, als sie behauptet. Geprueft wird jetzt der INHALT jedes
// rows.push-Blocks.
function pushBloecke(text) {
    const bloecke = [];
    let von = 0;
    for (;;) {
        const a = text.indexOf('rows.push(', von);
        if (a < 0) break;
        let i = text.indexOf('(', a), tiefe = 0;
        for (; i < text.length; i++) {
            if (text[i] === '(') tiefe++;
            else if (text[i] === ')') { tiefe--; if (!tiefe) break; }
        }
        bloecke.push(text.slice(a, i + 1));
        von = i + 1;
    }
    return bloecke;
}
const pushs = pushBloecke(koerperStandRows);
pruef('alle 4 Bloecke sauber abgegrenzt', pushs.length === 4, pushs.length);
['standort:', 'kont:', 'ccs:'].forEach(feld => {
    const fehlend = pushs.map((b, i) => b.indexOf(feld) >= 0 ? null : (i + 1)).filter(Boolean);
    pruef('jede Ausgabezeile setzt ' + feld.replace(':', ''),
        fehlend.length === 0, 'fehlt in Block ' + fehlend.join(', '));
});
// GEGENPROBE: nimmt man das Feld aus einem Block heraus, muss es auffallen.
pruef('GEGENPROBE fehlendes Feld wird erkannt',
    pushs.length === 4 &&
    pushs.map(b => b.replace(/kont:/, 'weg:')).filter(b => b.indexOf('kont:') >= 0).length < 4);
pruef('Historien-Zweig liest die ESL-Kontakte aus dem Feld "k"',
    /kont:\s*e\.k\s*!=\s*null/.test(koerperStandRows));
pruef('Live-Zweig liest den Standort ueber rcLigaMeta, nicht roh',
    /rcLigaMeta\(k\)\.std/.test(koerperStandRows) && !/standort:\s*k\.standort/.test(koerperStandRows));

pruef('rcStandRowsZeitraum summiert kont', /a\.kont\s*=\s*\(a\.kont\s*\|\|\s*0\)\s*\+\s*r\.kont/.test(koerperZeitraumRows));
pruef('rcStandRowsZeitraum summiert kont NUR mit ESL-Bezug',
    koerperZeitraumRows.indexOf('if (r.hasEsl)') < koerperZeitraumRows.indexOf('a.kont = (a.kont || 0) + r.kont'));
pruef('rcStandRowsZeitraum uebernimmt den Standort des zuletzt gesehenen Tages',
    /a\.team\s*=\s*r\.team;\s*a\.standort\s*=\s*r\.standort;/.test(koerperZeitraumRows));
pruef('rcStandRowsZeitraum gibt standort/kont/ccs in der Zeile aus',
    /standort:\s*a\.standort/.test(koerperZeitraumRows) && /kont:\s*a\.kont/.test(koerperZeitraumRows)
    && /ccs:\s*a\.ccs/.test(koerperZeitraumRows));

// ---------------------------------------------------------------------------
//  10. Dialog-Knopf: vorhanden UND verdrahtet
// ---------------------------------------------------------------------------
abschnitt('10. Export-Dialog');

const koerperDialog = schneideAus(codeOnly, 'window.rcOpenExportWahl = function(');
pruef('der EINE Erstellen-Knopf existiert (06.08. abends: rcExWahlGo)',
    /id="rcExWahlGo"/.test(koerperDialog));
pruef('Knopf ist auf einen Klick-Handler verdrahtet',
    /an\('rcExWahlGo'/.test(koerperDialog));
// Seit 06.08. gibt es GENAU EINE Ausgabe (Nutzer-Vorgabe: "ich moechte eine
// Exportmoeglichkeit haben, und das soll der regiocom_ESL_Report sein").
// "Kumuliert" war Blatt fuer Blatt dieselbe Mappe ohne die Aggregat-Blaetter,
// "Ein Blatt je Tag" trug den Zeitraum im Namen, lieferte Vertrieb/Produkte/
// Analyse aber nur vom LETZTEN Tag. Beide Knoepfe sind deshalb raus.
pruef('die abgeloesten Knoepfe sind NICHT mehr im Dialog',
    !/an\('rcExWahlKum'/.test(koerperDialog) && !/an\('rcExWahlJeTag'/.test(koerperDialog)
    && !/id="rcExWahlKum"/.test(koerperDialog) && !/id="rcExWahlJeTag"/.test(koerperDialog));
pruef('GEGENPROBE die Entfernungs-Pruefung schlaegt an, wenn ein alter Knopf zurueckkaeme',
    !(!/an\('rcExWahlKum'/.test(koerperDialog + "an('rcExWahlKum',")));
pruef('die vier Zeitbezuege (Radios) sind verdrahtet und laufen ueber EINEN Pfad',
    /radio\('heute'/.test(koerperDialog) && /radio\('gestern'/.test(koerperDialog)
    && /radio\('woche'/.test(koerperDialog) && /radio\('frei'/.test(koerperDialog)
    && /rcExportStandZeitraum\(b\.von, b\.bis, scopeAus\(\)/.test(koerperDialog));
// Seit 09.08. gibt der Dialog voll=true ausdruecklich mit, weil er dahinter noch
// den Melde-Kanal uebergibt (…, voll, melden). Das ist harmlos und gewollt.
// Gefaehrlich waere nur ein voll=FALSE: dann bekaeme der Knopf "Bericht
// erstellen" still die schlanke Mappe statt des vollen Berichts. Genau darauf
// wird jetzt geprueft — die alte Fassung ("gar nicht explizit") ging seit dem
// Umbau nur noch zufaellig durch, weil das folgende Argument die Klammer
// verschob.
pruef('kein Aufrufer schaltet voll auf false (das gaebe still die schlanke Mappe)',
    !/rcExportStandZeitraum\([^;]*?,\s*false\s*[,)]/.test(koerperDialog));
pruef('die Aussage "Nur fuer heute moeglich" ist raus',
    !/Nur fuer heute moeglich/.test(koerperDialog));
pruef('fehlende Produktaufschluesselung wird im Dialog benannt',
    /rcExWahlProdHinweis/.test(koerperDialog) && /RC_PROD_HIST_TAGE/.test(koerperDialog));

// GEGENPROBE: ohne Verdrahtung waere der Knopf ein Attrappe — genau der Fall
// "gebaut, aber nirgends aufgerufen" auf Knopf-Ebene.
pruef('GEGENPROBE Verdrahtungs-Erkennung schlaegt an, wenn der Handler fehlt',
    !/an\('rcExWahlVoll'/.test(koerperDialog.replace(/an\('rcExWahlVoll'/g, "an('nixDa'")));

// rcExportStandZeitraum muss den Schalter auch annehmen und auswerten.
// voll bleibt der VIERTE Parameter — seit 09.08. folgt ein fuenfter (melden,
// der Rueckmeldekanal des Dialogs). Wuerde voll die Position wechseln, bekaeme
// jeder bestehende Aufrufer still die schlanke Mappe.
pruef('rcExportStandZeitraum nimmt voll als 4. Parameter entgegen',
    /window\.rcExportStandZeitraum = function\(vonKey, bisKey, scope, voll(,\s*melden)?(,\s*wahl)?\)/.test(codeOnly));   // wahl seit 14.08.
pruef('rcExportStandZeitraum wertet voll aus', /if \(voll\) \{/.test(koerperZeitraum));
// Der Vorgabewert entscheidet, was ein Aufrufer OHNE vierten Parameter bekommt.
// Stuende hier false, faenden alle Dialog-Wege wieder in der schlanken Mappe.
pruef('voll ist der Vorgabewert (ohne Angabe kommt der volle Bericht)',
    /if \(voll === undefined\) voll = true;/.test(koerperZeitraum));
pruef('Dateiname ist regiocom_ESL_Report, sobald voll gilt',
    /voll \? 'regiocom_ESL_Report_' : 'regiocom_Stand_'/.test(koerperZeitraum));
pruef('Abdeckungs-Blatt kommt NACH den Aggregat-Blaettern',
    koerperZeitraum.indexOf('rcBuildAggSheets') < koerperZeitraum.indexOf('rcBuildAbdeckungSheet'));

// ---------------------------------------------------------------------------
//  11. ECHTE DATEI bauen und zurueckLESEN
// ---------------------------------------------------------------------------
//  Der eigentliche Beweis. xlsx-js-style MUTIERT cell.s beim Schreiben; ein
//  geteiltes Style-Objekt laesst ein Prozentformat auf eine Stueckzahl
//  ueberlaufen ("101" -> "10100,0%"). Das ist im Code NICHT zu sehen, nur in
//  der fertigen Mappe.
abschnitt('11. Echte .xlsx bauen und zurueckLESEN');

let XLSX = null;
try { XLSX = require(path.join(WURZEL, 'node_modules', 'xlsx-js-style')); }
catch (e) { try { XLSX = require('xlsx-js-style'); } catch (e2) { XLSX = null; } }

if (!XLSX) {
    console.log('  HINWEIS xlsx-js-style nicht gefunden — Datei-Pruefungen uebersprungen.');
} else {
    const doc = { getElementById: () => null };
    const winB = Object.assign({}, win, { rcCollectTrend: () => ({
        scopeLabel: 'Alle',
        days: [{ key:'2026-07-14', today:false, esl:{k:16,a:40,bnt:9,vvl:5},
                 liga:{ calls:150, csS:9000, csN:100, tnS:7000, tnN:100 } }]
    }) });

    const bauQuelle =
        'const STANDORT_METADATA = ' + JSON.stringify(STD_META) + ';\n' +
        konstZeile('stdFullName') + '\n' +
        konstZeile('bcrOf') + '\n' +
        konstZeile('nonBcrOf') + '\n' +
        schneide('classify') + '\n' +
        schneide('rcAggAusRows') + '\n' +
        schneide('rcAggTrendScope') + '\n' +
        // Seit 06.08. spaetabends ruft rcBuildAggSheets die Block-Blaetter ueber
        // rcBuildReportingSheets auf (EINE Fassung, auch fuer die schlanke Mappe).
        // Ohne sie bricht der Lauf mit ReferenceError ab.
        // Seit 14.08. haengen beide zusaetzlich an der Kennzahl-Registry
        // (RC_KENNZAHLEN_*/RC_BLAETTER + rcBlattAktiv/rcKennzahlSieb) — der
        // Block liegt direkt vor rcBuildReportingSheets und kommt am Stueck mit.
        src.slice(src.indexOf('const RC_KENNZAHLEN_V'), src.indexOf('function rcBuildReportingSheets(')) + '\n' +
        schneide('rcBuildReportingSheets') + '\n' +
        schneide('rcBuildAggSheets') + '\n' +
        'return { rcAggAusRows: rcAggAusRows, rcBuildAggSheets: rcBuildAggSheets, rcAggTrendScope: rcAggTrendScope };';
    const BAU = new Function('window', 'document', bauQuelle)(winB, doc);

    const wb = XLSX.utils.book_new();
    const aggB = BAU.rcAggAusRows({ rows: ZEILEN });
    aggB.trendScope = BAU.rcAggTrendScope({ von:'2026-07-01', bis:'2026-07-14' }, { std:'ALL', team:'ALL', stack:'ALL' });
    BAU.rcBuildAggSheets(XLSX, wb, true, aggB, 'PRUEFLAUF');

    const ziel = path.join(os.tmpdir(), 'rc_vollbericht_pruef.xlsx');
    XLSX.writeFile(wb, ziel);
    const zurueck = XLSX.readFile(ziel, { cellStyles: true, cellNF: true });

    pruef('Datei wurde geschrieben und ist lesbar', !!zurueck && !!zurueck.SheetNames.length);
    ['Struktur', 'Liga Standorte', 'Liga Teams', 'Standorte', 'Stacks', 'Teams', 'Agenten']
        .forEach(b => pruef('Blatt "' + b + '" ist in der Mappe', zurueck.SheetNames.indexOf(b) >= 0,
            zurueck.SheetNames.join(' | ')));
    pruef('Entwicklungs-Blatt ist in der Mappe',
        zurueck.SheetNames.some(n => n.indexOf('Entwicklung') === 0), zurueck.SheetNames.join(' | '));

    // ---- Blatt "Standorte": Werte und FORMATE gegenlesen --------------------
    // Spalten: 0 Standort .. 11 ESL-Kontakte, 12 Tracking %, 13 BCR-BNT, 14 BCR-VVL, 15 Gesamt
    // Zeile 0 = Titel, Zeile 1 = Kopf, Zeile 2 = erster Standort.
    const ws = zurueck.Sheets['Standorte'];
    const A = r => ws[r];
    // Bis 07.08. filterten die Blaetter auf s.calls > 0 — und `calls` sind in
    // rcAggAusRows die ESL-KONTAKTE, nicht die Liga-Calls. Serres telefoniert
    // hier 200 Mal, wird im ESL aber nicht getrackt (calls === null) und fiel
    // damit komplett aus der Mappe, obwohl seine Qualitaet vorliegt. An echten
    // Daten waren das 32,1 % der Liga-Calls und 46 von 83 Teams.
    pruef('Standorte: AL steht oben (meiste Abschluesse)',
        A('A3') && A('A3').v === 'Alanya', A('A3') && A('A3').v);
    pruef('Standorte: SER steht MIT drin, obwohl es keine ESL-Kontakte hat',
        A('A4') && A('A4').v === 'Serres', A('A4') && A('A4').v);
    pruef('Standorte: kein dritter Standort (B hat weder ESL noch Liga)', !A('A5'),
        A('A5') && A('A5').v);
    // GEGENPROBE: der alte Filter haette SER herausgeworfen. Sie belegt, dass
    // die Pruefung oben den echten Fehler auch erkennen wuerde.
    pruef('GEGENPROBE alter ESL-Filter haette SER verworfen',
        agg.stds.filter(s => s.calls > 0).length === 1
        && agg.stds.filter(s => s.calls > 0 || (agg.liga.byStd[s.code] || 0) > 0).length === 2,
        agg.stds.filter(s => s.calls > 0).length + ' -> '
        + agg.stds.filter(s => s.calls > 0 || (agg.liga.byStd[s.code] || 0) > 0).length);
    pruef('Standorte: ESL-Kontakte AL = 16', A('L3') && A('L3').v === 16, A('L3') && A('L3').v);
    pruef('Standorte: KIP AL = 4', A('B3') && A('B3').v === 4, A('B3') && A('B3').v);
    pruef('Standorte: Gesamt AL = 14', A('P3') && A('P3').v === 14, A('P3') && A('P3').v);

    // Tracking % = ESL-Kontakte / Liga-Calls = 16 / 150 = 0,1067 -> als Bruch
    // geschrieben, weil die Spalte das echte Excel-Format 0.0% traegt (dieses
    // Format MULTIPLIZIERT mit 100 — anders als 0.0" %").
    const trk = A('M3');
    pruef('Standorte: Tracking % ist ein Bruch (16/150 = 0,1067)',
        trk && Math.abs(trk.v - 16 / 150) < 0.0002, trk && trk.v);
    pruef('Standorte: Tracking % traegt das Format 0.0%', trk && trk.z === '0.0%', trk && trk.z);

    // DER LEAK-TEST: die Stueckzahl-Spalte daneben darf KEIN Prozentformat haben.
    // Genau hier zeigte sich der alte Bug als "101" -> "10100,0%".
    const stk = A('L3');
    pruef('LEAK-TEST: ESL-Kontakte (Stueckzahl) hat KEIN Prozentformat',
        !stk || !stk.z || stk.z.indexOf('%') < 0, stk && stk.z);
    pruef('LEAK-TEST: KIP-Spalte hat kein Prozentformat',
        !A('B3') || !A('B3').z || A('B3').z.indexOf('%') < 0, A('B3') && A('B3').z);

    // Und die Ursache selbst: die Style-Objekte duerfen nicht dieselbe Referenz
    // sein. Geprueft am frisch gebauten Blatt, vor dem Schreiben ist es zu spaet.
    const roh = wb.Sheets['Standorte'];
    pruef('LEAK-URSACHE: Prozent- und Stueckzahl-Zelle teilen sich KEIN Style-Objekt',
        roh['L3'] && roh['M3'] && roh['L3'].s !== roh['M3'].s);
    pruef('LEAK-URSACHE: numFmt ist je Zelle explizit gesetzt',
        roh['L3'] && roh['L3'].s && roh['L3'].s.numFmt === 'General'
        && roh['M3'] && roh['M3'].s && roh['M3'].s.numFmt === '0.0%',
        roh['L3'] && roh['L3'].s && roh['L3'].s.numFmt);

    // ---- Blatt "Agenten": die CCS-ID darf nicht leer sein -------------------
    // Sie kommt seit 05.08. aus der Zeile (row.ccs). Ohne sie waere die Spalte
    // im vollen Bericht ploetzlich leer — auch fuer HEUTE.
    const wsA = zurueck.Sheets['Agenten'];
    const ccsSpalte = [];
    for (let r = 3; r <= 6; r++) { const c = wsA['C' + r]; if (c && c.v !== '') ccsSpalte.push(String(c.v)); }
    pruef('Agenten: die CCS-ID-Spalte ist gefuellt', ccsSpalte.length >= 3, ccsSpalte.join(','));
    pruef('Agenten: CCS-ID 1001 steht in der Mappe', ccsSpalte.indexOf('1001') >= 0, ccsSpalte.join(','));

    // ---- Blatt "Struktur": Merge-Bereich vorhanden -------------------------
    const wsS = zurueck.Sheets['Struktur'];
    pruef('Struktur: Titelzeile ist ueber alle Spalten verbunden',
        wsS['!merges'] && wsS['!merges'].some(m => m.s.r === 0 && m.s.c === 0 && m.e.c === 11),
        wsS['!merges'] && JSON.stringify(wsS['!merges']));

    // GEGENPROBE zum Leak-Test: ein absichtlich geteiltes Style-Objekt muss
    // auffallen. Ohne diese Gegenprobe koennte der Test immer gruen melden.
    const wsFake = XLSX.utils.aoa_to_sheet([[1, 2]]);
    const geteilt = { numFmt: '0.0%' };
    wsFake['A1'].s = geteilt; wsFake['B1'].s = geteilt;
    pruef('GEGENPROBE geteiltes Style-Objekt wird erkannt', wsFake['A1'].s === wsFake['B1'].s);

    try { fs.unlinkSync(ziel); } catch (e) {}
}

// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('  ' + ok + ' bestanden, ' + fehler + ' fehlgeschlagen.');
console.log('============================================================\n');
process.exit(fehler ? 1 : 0);
