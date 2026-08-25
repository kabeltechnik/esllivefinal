// ============================================================================
//  export_umbau_pruefen.js — prueft den Umbau vom 30.10. (Nutzer-Vorlage):
//    1) AKTUELLER_STAND: 16 Spalten B..Q, ohne AQ und ohne "Gelöst" — und das
//       Mail-Bild buildPng spiegelt dasselbe Blatt (zwei Zeichenwege, EINE Logik)
//    2) Analyse-Blaetter ohne AQ, Score zaehlt vier Ziele (CS, TNPS, FQ, FTF),
//       Analyse Agenten ist getrennt schaltbar
//    3) Qualitaets-Seite zeigt genau die elf Ligalisten-Kennzahlen (Kacheln,
//       Tabelle, Sortier-Knoepfe, Zwei-Listen-Regel), Mittelwerte ohne Zaehler/Nenner
//    4) Stundenmail-Mappe und Direktexport folgen dem Werkszustand der Blatt-Registry
//    5) AQ ueberall raus (Nutzer-Entscheidung 30.10.): in v22 steht ausserhalb von
//       Kommentaren, dem Aussortier-Code und einer Ausschlussliste nichts mehr zur
//       Auflegerquote; gespeicherte Kacheln mit AQ werden beim Laden aussortiert
//
//  Die ECHTEN Funktionen werden per Klammer-Zaehlung aus esl_live_arena_v22.js
//  geschnitten (nichts nachgebaut). Die Excel-Mappe selbst prueft die Browser-
//  Seite test_abgleich_esl.html (Abschnitt "Werkszustand") gegen echte Exporte.
//
//  Aufruf:  node pruefwerkzeuge/export_umbau_pruefen.js
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'esl_live_arena_v22.js'), 'utf8');

let ok = 0, fehler = 0;
function pruef(titel, bedingung, zusatz) {
    if (bedingung) { ok++; console.log('  ok   ' + titel); }
    else { fehler++; console.log('  FEHL ' + titel + (zusatz !== undefined ? '  -> ' + zusatz : '')); }
}
// Text von startMarker bis (ausschliesslich) endMarker; leer, wenn eine Marke fehlt.
function zwischen(start, ende, ab) {
    const a = SRC.indexOf(start, ab || 0); if (a < 0) return '';
    const e = SRC.indexOf(ende, a + start.length); return e < 0 ? '' : SRC.slice(a, e);
}
// Ausdruck ab "marke" bis zur zugehoerigen schliessenden Klammer (Zeichenketten/Regex tauchen in den geschnittenen Teilen nicht auf).
function klammerAb(marke, auf, zu) {
    const a = SRC.indexOf(marke); if (a < 0) return '';
    let i = SRC.indexOf(auf, a), t = 0;
    for (; i < SRC.length; i++) { if (SRC[i] === auf) t++; else if (SRC[i] === zu) { t--; if (!t) return SRC.slice(a, i + 1); } }
    return '';
}
// Farb-Token-Namen als Zeichenkette zurueckgeben (X.TXT -> 'TXT'), damit sich zwei GRP-Listen vergleichen lassen.
const tokens = new Proxy({}, { get: (_, k) => String(k) });
function liste(text, marke, farbName) {
    const a = text.indexOf(marke); if (a < 0) return null;
    const e = text.indexOf('];', a);
    return new Function(farbName, 'return ' + text.slice(text.indexOf('[', a), e + 1))(tokens);
}

const stand = zwischen('function rcBuildStandSheets(', '// ---------- Blatt B: Bewertungslogik');
const png = zwischen('function buildPng(', 'function buildPngVertrieb(');
const analyse = zwischen('function rcBuildAnalyseSheets(', "fertig(st, 'Analyse Teams'");

console.log('1) AKTUELLER_STAND (Excel) und Mail-Bild');
pruef('Blattbauer, Mail-Bild und Analyse lassen sich ausschneiden', !!stand && !!png && !!analyse, [stand.length, png.length, analyse.length].join('/'));
{
    const sub2 = (stand.match(/const sub2 = (\[[^\]]*\]);/) || [])[1];
    const unterkopf = sub2 ? new Function('return ' + sub2)() : [];
    pruef('Unterkopf hat die 16 Spalten der Vorlage B..Q', unterkopf.join('|') ===
        'Team|Agent|Calls|Ø Min.|IST|IST %|IST|IST %|IST|IST %|Anzahl|IST %|MOB|KIP|BNT GES.|VVL GES.', unterkopf.join('|'));
    const cols = (png.match(/var cols=\[([\s\S]*?)\];/) || [])[1] || '';
    const bildKopf = (cols.match(/k:'([^']*)'/g) || []).map(s => s.slice(3, -1));
    pruef('Mail-Bild: dieselben 16 Spalten in derselben Reihenfolge (zwei Zeichenwege, eine Logik)',
        bildKopf.join('|') === unterkopf.join('|'), bildKopf.join('|'));
    const gX = liste(stand, 'const GRP = [', 'X'), gP = liste(png, 'var GRP=[', 'RC_XP');
    pruef('Gruppenkoepfe: CS, TNPS, FQ, Detra, BNT, VVL — ohne AQ und ohne "Gelöst"',
        !!gX && gX.map(g => g[2].replace(/\s+/g, ' ')).join('|') === 'DATEN & AHT / VOLUMEN|CS | > 90 %|TNPS | > 70 %|FQ | > 30 %|Detra|BNT|VVL',
        gX && gX.map(g => g[2]).join('|'));
    pruef('Mail-Bild-Gruppen = Excel-Gruppen (Excel-Index = Bild-Index + 1, gleiche Texte und Farben)',
        !!gX && !!gP && gX.length === gP.length && gX.every((g, i) => g[0] === gP[i][0] + 1 && g[1] === gP[i][1] + 1 && g[2] === gP[i][2] && g[3] === gP[i][3]),
        JSON.stringify([gX, gP]));
    pruef('LETZTE = 16 (Q), NC = 18 (A..R)', /const NC = 18;/.test(stand) && /const LETZTE = 16;/.test(stand));
    const breiten = (stand.match(/wsA\['!cols'\] = w\(([^)]*)\);/) || [])[1];
    pruef('Spaltenbreiten: 18 Eintraege, wie in der Vorlage (M = 10,5, Raender A und R)',
        !!breiten && breiten.split(',').length === 18 && breiten.split(',').map(s => +s)[12] === 10.5 && +breiten.split(',')[17] === 2.23, breiten);
    const hoechster = Math.max.apply(null, (stand.match(/\b(?:r|gr2)\[(\d+)\]/g) || []).map(s => +s.match(/\[(\d+)\]/)[1]));
    pruef('keine Zelle rechts von Spalte Q (Index <= 16)', hoechster === 16, 'hoechster Index ' + hoechster);
    const merges = (stand.match(/M\(\d+,\d+,\d+,(?:\d+|LETZTE)\)/g) || []);
    pruef('Kopf-Merges liegen innerhalb B..Q (Spaltenindex <= 16)',
        merges.every(m => { const c = m.slice(2, -1).split(','); return +c[1] <= 16 && (c[3] === 'LETZTE' || +c[3] <= 16); }), merges.join(' '));
    pruef('Logo-Anker N..Q (Spalte 13) an BEIDEN Stellen',
        (SRC.match(/rcLogoAnkerBauen\(blattName, 13, \[7\.00, 7\.00, 8\.50, 8\.50\]\)/g) || []).length === 2 && !/rcLogoAnkerBauen\(blattName, 17,/.test(SRC));
    // Kommentare ausblenden: Pruefungen treffen sonst die eigenen Erklaertexte.
    const ohneKomm = t => t.replace(/\/\/[^\n]*/g, '');
    pruef('AQ und "Gelöst" sind aus Excel-Blatt und Mail-Bild verschwunden (ohne Kommentare gelesen)',
        !/row\.aq|row\.ftf|'AQ|Gelöst|gZ\('aq'\)|gZ\('ftf'\)/.test(ohneKomm(stand)) && !/'aq'|Gelöst|AQ  \|/.test(ohneKomm(png)), '');
    pruef('Verteilungsband zaehlt nur noch CS/TNPS/FQ', /\['cs','tnps','fq'\]\.forEach\(s2 => \{\s*const g = row\[s2\]/.test(stand));
    // Gegenprobe: das Pruefwerkzeug erkennt die ALTE Bauart
    const alt = "const sub2 = ['Team','Agent','Calls','Ø Min.','IST','IST %','IST','IST %','IST','IST %','IST','IST %','IST','IST %','Anzahl','IST %','MOB','KIP','BNT GES.','VVL GES.'];";
    pruef('GEGENPROBE: der alte 20-Spalten-Unterkopf wuerde durchfallen',
        new Function('return ' + alt.match(/const sub2 = (\[[^\]]*\]);/)[1])().length === 20);
}

console.log('\n2) Analyse-Blaetter');
{
    pruef('Analyse-Blaetter fuehren keine AQ-Spalte, -Zeile oder -Verteilung mehr',
        !/'aq'|'AQ'|AQ  ·|Ziele: AQ|r\.aq\.|v\.aq/.test(analyse), (analyse.match(/.{20}(?:'aq'|'AQ'|AQ  ·|Ziele: AQ|r\.aq\.|v\.aq).{10}/) || [''])[0]);
    pruef('Analyse Agenten und Analyse Teams haengen an EIGENEN Registry-Schluesseln',
        /if \(rcBlattAktiv\(wahl, 'analyseAgenten'\)\) \(function\(\)\{/.test(analyse) && /if \(rcBlattAktiv\(wahl, 'analyse'\)\) \(function\(\)\{/.test(analyse));
    pruef('Balken skalieren auf vier Ziele (5 ist weg)', !/rcBalken\([^)]*, 5\)/.test(analyse.replace(/rcBalken\(t\.anteil|rcBalken\(a\.vq/g, '')), '');
    // rcZielScore funktional
    const scoreFn = klammerAb('function rcZielScore(', '{', '}');
    const grad = (SRC.match(/const rcGrad = [^\n]*;/) || [])[0];
    const skala = klammerAb('const RC_SKALA = ', '{', '}') + ';';
    const S = new Function(grad + '\n' + skala + '\n' + scoreFn + '\nreturn rcZielScore;')();
    const r1 = S({ aq: 10, cs: 95, tnps: 80, fq: 40, ftf: 90 });
    pruef('Score: AQ zaehlt nicht mehr (AQ 10 % ist kein verfehltes Ziel) — 4 von 4 erreicht', r1 && r1.erf === 4 && r1.bew === 4, JSON.stringify(r1));
    const r2 = S({ cs: 95, tnps: 50, fq: null, ftf: 70 });
    pruef('Score zaehlt nur bewertbare Ziele (FQ "Keine" faellt heraus): 1 von 3', r2 && r2.erf === 1 && r2.bew === 3, JSON.stringify(r2));
    pruef('Score ohne jede Kennzahl ist null (nicht 0/0)', S({}) === null && S({ aq: 90 }) === null);
    // Gegenprobe: die alte Fassung mit AQ zaehlte fuenf Ziele
    const alt = new Function(grad + '\n' + skala + '\nRC_SKALA.aq = v => rcGrad(v, 85, 80);\n' + scoreFn.replace("['cs','tnps','fq','ftf']", "['aq','cs','tnps','fq','ftf']") + '\nreturn rcZielScore;')();
    pruef('GEGENPROBE: mit AQ in der Liste waeren es fuenf Ziele', alt({ aq: 10, cs: 95, tnps: 80, fq: 40, ftf: 90 }).bew === 5);
}

console.log('\n3) Qualitaets-Seite');
{
    const strip = zwischen('<div class="rc-quali-strip">', '</div>\n            <div class="rc-quali-grid">');
    const ids = (strip.match(/id="(qKpi[A-Za-z]+)"/g) || []).map(s => s.slice(4, -1));
    pruef('genau diese elf Kacheln in dieser Reihenfolge: Calls, ACW, AHT, ACHT, CS, CS DDS, TNPS, TNPS Antwortquote, TNPS DDS, FTF, FQ',
        ids.join(',') === 'qKpiCalls,qKpiAcw,qKpiAht,qKpiAcht,qKpiCs,qKpiCsDds,qKpiTnps,qKpiTnpsAq,qKpiDds,qKpiFtf,qKpiFq', ids.join(','));
    pruef('keine Kachel mehr fuer AQ, Detraktoren, FF7-Risiko, Nicht-Tracker',
        !/qKpiAufleger|qKpiDet\b|qKpiKurz|qKpiNonTrack/.test(SRC.replace(/const kurzArr[^;]*;/, '')), '');
    const kopf = zwischen('<thead><tr>', '</tr></thead>', SRC.indexOf('id="rcCardQualiAgenten"'));
    const ths = (kopf.match(/<th(?:\s[^>]*)?>([^<]*)</g) || []).map(s => s.replace(/<th(?:\s[^>]*)?>/, '').replace(/<$/, ''));
    pruef('Tabellenkopf: #, Agent, Calls, AHT, ACW, ACHT, CS, CS DDS, TNPS, TNPS Antw., TNPS DDS, FTF, FQ (13)',
        ths.join('|') === '#|Agent|Calls|AHT|ACW|ACHT|CS %|CS DDS %|TNPS %|TNPS Antw. %|TNPS DDS %|FTF %|FQ %', ths.join('|'));
    const zeile = zwischen('html += `<tr class=', '</tr>`;', SRC.indexOf('window.renderQualitaet = function'));
    const nTd = (zeile.match(/<td/g) || []).length + (zeile.match(/\$\{cell\(/g) || []).length + (zeile.match(/\$\{zeitZelle\(/g) || []).length;
    pruef('Datenzeile hat genauso viele Zellen wie der Kopf (13)', nTd === ths.length && ths.length === 13, nTd + ' Zellen, ' + ths.length + ' Koepfe');
    pruef('Datenzeile: keine AQ-, Det- oder Anspr.-Spalte; neue Felder csDds/tnpsAq/dds/ftf/fq',
        !/auflegerquote|k\.det\b/.test(zeile) && ['k.csDds', 'k.tnpsAq', 'k.dds', 'k.ftf', 'k.fq'].every(f => zeile.indexOf(f) !== -1), '');
    const knoepfe = (zwischen('id="rcCardQualiAgenten"', '</div>\n                    </div>').match(/id="(qSort[A-Za-z]+)"/g) || []).map(s => s.slice(4, -1));
    const liste = (SRC.match(/const Q_SORT_TABS = \[([\s\S]*?)\];/) || [])[1] || '';
    const handler = (liste.match(/\['(qSort[A-Za-z]+)'/g) || []).map(s => s.slice(2, -1));
    pruef('Sortier-Knoepfe: Aufbau UND Handler-Liste fuehren dieselben sechs (Calls, CS, TNPS, FQ, ACW, ACHT), kein AQ (Zwei-Listen-Regel)',
        knoepfe.join(',') === handler.join(',') && handler.join(',') === 'qSortCalls,qSortCs,qSortTnps,qSortFq,qSortAcw,qSortAcht', knoepfe.join(',') + ' / ' + handler.join(','));
    // Mittelwert ohne Zaehler/Nenner: echte Funktion aus renderQualitaet, funktional
    const wm = klammerAb('const wMittel = ', '{', '}');
    const W = (list) => new Function('list', wm + '\nreturn wMittel;')(list);
    const L = [{ csDds: 10, csN: 30 }, { csDds: 2, csN: 10 }, { csDds: null, csN: 50 }];
    pruef('CS Deep Detractor %: gewichtet ueber die CS-Antworten ((10*30+2*10)/40 = 8), Agent ohne Wert zaehlt nicht',
        Math.abs(W(L)('csDds', 'csN') - 8) < 1e-9, W(L)('csDds', 'csN'));
    pruef('ohne Gewichte arithmetisch ((10+2)/2 = 6)', Math.abs(W([{ csDds: 10 }, { csDds: 2 }])('csDds', 'csN') - 6) < 1e-9);
    pruef('Spalte fehlt ganz: null ("—"), nicht 0', W([{ callCount: 5 }, { callCount: 9 }])('tnpsAq', 'callCount') === null);
    pruef('echte 0 bleibt 0 (kein Verschlucken durch "|| null")', W([{ tnpsAq: 0, callCount: 10 }])('tnpsAq', 'callCount') === 0);
    pruef('Kacheln rechnen FQ, DDS, FTF ueber pool() (Zaehler/Nenner), Calls als Summe ohne 0-Faelschung',
        /pool\('ddsZ',\s*'ddsN',\s*'dds'\)/.test(SRC) && /pool\('ftfZ',\s*'ftfN',\s*'ftf'\)/.test(SRC) && /list\.some\(k => k\.callCount != null\) \? list\.reduce/.test(SRC), '');
}

console.log('\n4) Stundenmail-Mappe und Direktexport folgen dem Werkszustand');
{
    pruef('Produkte werden ueber die Registry geschaltet (Stundenmail, rcExportReport) — nicht fest',
        (SRC.match(/rcBlattAktiv\(null, 'produkte'\)/g) || []).length === 2);
    pruef('Abdeckung und Bewertungslogik haengen an der Registry', /rcBlattAktiv\(wahl, 'abdeckung'\)/.test(SRC) && /rcBlattAktiv\(opts\.wahl, 'bewertung'\)/.test(SRC));
    pruef('Die schlanke Reporting-Mappe baut weiter beide Bloecke (weder nur noch wahl)',
        /const blattAn = k => \(!nur && !wahl\) \|\| rcBlattAktiv\(wahl, k\);/.test(SRC));
    pruef('rcBuildAggSheets hat weiter genau DREI Aufrufer (kein vierter)',
        (SRC.match(/(?<![\w$.])rcBuildAggSheets\(XL/g) || []).length - (SRC.match(/function rcBuildAggSheets\(XL/g) || []).length === 3);
}

console.log('\n5) AQ ueberall raus');
{
    // Kommentarfest und blockweise: Kommentare, Base64-Schrift, der Aussortier-Code, die Ausschlussliste
    // der Zusatzkacheln und der Portal-Namensfilter zaehlen nicht; alles andere darf KEIN AQ mehr tragen.
    const ohneKommentare = t => t.replace(/base64,[A-Za-z0-9+\/=]+/g, 'base64,').replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/\/\*[^\n]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
    // Block-Kommentare nur am Zeilenanfang (mehrzeilig) oder einzeilig: ein "/*" steckt auch in Regex-Literalen
    // (z. B. /[*?:[\]]/) und schluckte mit der naiven Fassung 250 000 Zeichen Code — die Regel haette nichts mehr gesehen.
    const MUSTER = [/auflegerquote/i, /\bAQ\b/, /\baq[ZNS]\b/, /['"]aq['"]/, /\.aq\b/, /\baq\s*:/, /AUFLEGER/, /RC_ZIELE\.aq/];
    const aqTreffer = text => {
        let t = ohneKommentare(text);
        const erlaubt = [klammerAbIn(t, 'function aqAussortieren(', '{', '}'),
            (t.match(/function mbPortalName\([^\n]*\n?/) || [''])[0], (t.match(/const schon = \[[^\]]*\];/) || [''])[0]];
        erlaubt.forEach(b => { if (b) t = t.replace(b, ''); });
        const treffer = [];
        t.split('\n').forEach(z => MUSTER.forEach(m => { if (m.test(z)) treffer.push(z.trim().slice(0, 90)); }));
        return { treffer, erlaubt: erlaubt.map(b => b.length) };
    };
    function klammerAbIn(text, marke, auf, zu) {
        const a = text.indexOf(marke); if (a < 0) return '';
        let i = text.indexOf(auf, a), t = 0;
        for (; i < text.length; i++) { if (text[i] === auf) t++; else if (text[i] === zu) { t--; if (!t) return text.slice(a, i + 1); } }
        return '';
    }
    const ist = aqTreffer(SRC);
    pruef('v22 traegt ausserhalb von Kommentaren, Aussortier-Code und Ausschlussliste KEIN AQ mehr (Anzeige, Export, Registry, Insights, Steuerung)',
        ist.treffer.length === 0, ist.treffer.slice(0, 3).join(' | '));
    pruef('die drei erlaubten Bloecke wurden gefunden (sonst prueft die Regel ins Leere)', ist.erlaubt.every(n => n > 20), ist.erlaubt.join('/'));
    // Gegenproben: der Scanner muss einen eingeschleppten Treffer erkennen, einen Kommentar aber nicht
    pruef('GEGENPROBE: ein neuer Zugriff auf k.auflegerquote wird erkannt', aqTreffer(SRC + '\nconst x = k.auflegerquote;\n').treffer.length === 1);
    pruef('GEGENPROBE: ein Ziel RC_ZIELE.aq wird erkannt', aqTreffer(SRC + '\nconst z = RC_ZIELE.aq;\n').treffer.length >= 1);
    pruef("GEGENPROBE: qv(o,'aq') in einem Blattbauer wird erkannt", aqTreffer(SRC + "\nconst r = qv(o,'aq');\n").treffer.length === 1);
    pruef('GEGENPROBE: nur ein Kommentar mit "Auflegerquote" zaehlt NICHT', aqTreffer(SRC + '\n// Auflegerquote, AQ, aqZ\n/* RC_ZIELE.aq */\n').treffer.length === 0);
    pruef('MB_KENN hat keinen Eintrag "aq" mehr; mbKenn faellt bei Unbekanntem auf BNT (deshalb das Aussortieren beim Laden)',
        !/\baq:\s*\{label:/.test(klammerAb('var MB_KENN = ', '{', '}')) && /function mbKenn\(id\)\{ return MB_KENN\[id\] \|\| MB_KENN\.bnt; \}/.test(SRC));
    const filter = new Function((SRC.match(/function mbPortalName\([^\n]*/) || [''])[0] + '\nreturn mbPortalName;')();
    pruef('freie Portal-Kennzahl: Auflegerquote steht nicht in der Auswahl (auch nicht als erste), CS Deep Detractor schon',
        filter('Auflegerquote') === false && filter('auflegerquote %') === false && filter('CS Deep Detractor %') === true && filter('ACW') === true);

    pruef('der Namensfilter haengt an BEIDEN Stellen (Render der freien Portal-Kennzahl und Auswahlliste im Konfigurator)',
        (SRC.match(/Object\.keys\(a\)\.filter\(mbPortalName\)/g) || []).length === 2);

    // gespeicherte Kacheln: der ECHTE Aussortier-Code
    const fn = klammerAb('function aqAussortieren(', '{', '}');
    const lauf = c => {
        const log = { gespeichert: 0, warn: [] };
        const f = new Function('CFG_KEY', 'localStorage', 'window', fn + '\nreturn aqAussortieren;')('K',
            { setItem: () => { log.gespeichert++; } }, { rcLog: { warn: m => log.warn.push(m) } });
        f(c); return log;
    };
    const cfg = () => ({ custom: { arena: [
        { id: '1', type: 'kennzahl', kenn: 'aq' }, { id: '2', type: 'kennzahl', kenn: 'cs' },
        { id: '3', type: 'tab_frei', k1: 'bnt', k2: 'aq', k3: 'cs' }, { id: '4', type: 'qual_frei', feld: 'Auflegerquote' },
        { id: '5', type: 'qual_frei', feld: 'CS Deep Detractor %' }, { id: '6', type: 'aq' },
        { id: '7', type: 'qual_streu', kx: 'cs', ky: 'aq' }, { id: '9', type: 'qual_streu', kx: 'aq', ky: 'cs' }, null ],
        quali: [], cp_x: [{ id: '8', type: 'kennzahl', kenn: 'aq' }] } });
    const c1 = cfg(), l1 = lauf(c1);
    pruef('gespeichertes Modul "aq", Kennzahl-Kacheln mit aq/Auflegerquote (kenn, kx/ky, freie Portal-Kennzahl) entfallen — auch auf eigenen Seiten',
        c1.custom.arena.filter(Boolean).map(m => m.id).join(',') === '2,3,5' && c1.custom.cp_x.length === 0, JSON.stringify(c1.custom.arena.map(m => m && m.id)));
    pruef('Tabelle mit vier Spalten verliert nur die AQ-Spalte (k2), k1/k3 bleiben', c1.custom.arena[1].k1 === 'bnt' && !('k2' in c1.custom.arena[1]) && c1.custom.arena[1].k3 === 'cs');
    pruef('das Ergebnis wird festgeschrieben und im Logbuch gemeldet (je einmal, mit Anzahl 7)', l1.gespeichert === 1 && l1.warn.length === 1 && /7 gespeicherte/.test(l1.warn[0]), JSON.stringify(l1));
    const l2 = lauf(c1);
    pruef('idempotent: ein zweiter Lauf aendert, speichert und meldet nichts', l2.gespeichert === 0 && l2.warn.length === 0 && c1.custom.arena.filter(Boolean).length === 3);
    const c3 = { custom: { arena: [{ id: 'a', type: 'kennzahl', kenn: 'cs' }], quali: [] } }, l3 = lauf(c3);
    pruef('Konfiguration ohne AQ bleibt unangetastet (kein Schreiben, keine Meldung)', c3.custom.arena.length === 1 && l3.gespeichert === 0 && l3.warn.length === 0);
    pruef('der Aufruf haengt in load() (vor c.info) — sonst laeuft das Aussortieren nie', /aqAussortieren\(c\);\n\s*c\.info=c\.info\|\|\{\};/.test(SRC));
}

console.log('');
if (fehler === 0) console.log('ALLE ' + (ok + fehler) + ' PRUEFUNGEN BESTANDEN');
else { console.log(fehler + ' von ' + (ok + fehler) + ' PRUEFUNGEN FEHLGESCHLAGEN'); process.exitCode = 1; }
