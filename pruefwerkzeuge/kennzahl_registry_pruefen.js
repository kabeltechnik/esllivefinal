/* ============================================================================
   KENNZAHL-REGISTRY PRUEFEN (Excel-Haekchen, Etappe 8, 14.08.)
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/kennzahl_registry_pruefen.js

   Nutzer-Vorgabe: Blaetter per Haekchen UND Kennzahlen (Spalten) per Haekchen.
   Bauart: die volle Zeile wird weiter vom ORIGINAL-Code gebaut (vZeile/qZeile
   unveraendert), ein SIEB entfernt abgewaehlte Spalten aus Header, Zeilen,
   %-Liste und Breiten. Die wichtigste Zusicherung: OHNE Auswahl ist die Mappe
   IDENTISCH zur heutigen — sonst verschoebe ein Off-by-one die Formate in
   allen Blaettern (Risiko Nr. 3 des Plans).
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'esl_live_arena_v22.js'), 'utf8');

let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}

console.log('KENNZAHL-REGISTRY PRUEFEN');
console.log('');

/* ---------------------------------------------------------------------------
   1) Registry-Block laden (Original-Code)
--------------------------------------------------------------------------- */
console.log('1) Registry + Sieb (Original-Code)');

const von = SRC.indexOf('const RC_KENNZAHLEN_V');
const bis = SRC.indexOf('function rcBuildReportingSheets(');
const block = (von >= 0 && bis > von) ? SRC.slice(von, bis) : null;
pruefe('Registry-Block laesst sich ausschneiden', !!block);

let R = null;
if (block) {
  R = new Function(block + '\nreturn { V: RC_KENNZAHLEN_V, Q: RC_KENNZAHLEN_Q, B: RC_BLAETTER, aktiv: rcBlattAktiv, sieb: rcKennzahlSieb };')();
}

if (R) {
  // Der volle Vertriebs-Header aus dem Quelltext — gegen ihn wird gerechnet.
  const VH = ['', 'CALLS','KONT.','ANSPR.','ANSPR. %','ANSPR. % LIGA','KIP','MOB','ENV','PTV','DSL/FIB','VVL','GESAMT','KIP %','MOB %','ENV %','PTV %','DSL/FIB %','VVL %'];
  // Ohne AQ seit 30.10. (Nutzer-Entscheidung: die Auflegerquote steht nirgends mehr).
  const QH = ['', 'CALLS','AHT','CS %','TNPS','FQ %','DDS %','FTF %','DETR.'];
  pruefe('Quelltext traegt exakt diesen Vertriebs-Header',
    SRC.indexOf("const VH = ['', 'CALLS','KONT.','ANSPR.','ANSPR. %','ANSPR. % LIGA','KIP','MOB','ENV','PTV','DSL/FIB','VVL','GESAMT','KIP %','MOB %','ENV %','PTV %','DSL/FIB %','VVL %']") !== -1);

  // Jede Registry-Spalte zeigt auf einen existierenden Header-Index; zusammen
  // decken sie ALLE Spalten ausser der Beschriftung (0) ab.
  const abgedecktV = new Set(); R.V.forEach(k => k.idx.forEach(i => abgedecktV.add(i)));
  pruefe('Vertriebs-Registry deckt alle 18 Datenspalten ab, Spalte 0 nie',
    abgedecktV.size === 18 && !abgedecktV.has(0) && Math.max.apply(null, [...abgedecktV]) === 18);
  const abgedecktQ = new Set(); R.Q.forEach(k => k.idx.forEach(i => abgedecktQ.add(i)));
  pruefe('Qualitaets-Registry deckt alle 8 Datenspalten ab (ohne AQ)',
    abgedecktQ.size === 8 && !abgedecktQ.has(0) && Math.max.apply(null, [...abgedecktQ]) === QH.length - 1);
  pruefe('Qualitaets-Registry hat keine AQ-Spalte; der Quelltext fuehrt genau diesen Qualitaets-Header',
    !R.Q.some(k => k.key === 'aq') &&
    SRC.indexOf("const QH = ['', 'CALLS','AHT','CS %','TNPS','FQ %','DDS %','FTF %','DETR.'];") !== -1);
  pruefe('AHT ist waehlbar (Nutzer-Vorgabe "inkl. AHT")',
    R.Q.some(k => k.key === 'aht'));
  pruefe('ACW ist bewusst NICHT in der Registry (Genesys hat keine Historie)',
    !R.Q.some(k => k.key === 'acw'),
    'ACW steht im Dialog als ausgegraute Option mit Hinweis auf die Warteschleife.');
  pruefe('Produktspalte und ihr Mix-% fallen GEMEINSAM (idx-Paare)',
    R.V.filter(k => ['kip','mob','env','ptv','fibDsl','vvl'].indexOf(k.key) >= 0).every(k => k.idx.length === 2));

  /* -----------------------------------------------------------------------
     2) Sieb funktional
  ----------------------------------------------------------------------- */
  console.log('');
  console.log('2) Sieb funktional');

  const vPct = [4, 5, 13, 14, 15, 16, 17, 18];
  const vW = VH.map((_, i) => ({ wch: 5 + i }));

  pruefe('DEFAULT (nichts abgewaehlt) -> Sieb liefert null, Original bleibt unangetastet',
    R.sieb(R.V, undefined, VH, vPct, vW) === null && R.sieb(R.V, {}, VH, vPct, vW) === null,
    'Das ist die Byte-Identitaets-Garantie: ohne Auswahl laeuft exakt der alte Pfad.');

  // KIP abwaehlen: Spalten 6 und 13 verschwinden, %-Liste und Breiten rutschen nach.
  const ohneKip = R.sieb(R.V, { kip: false }, VH, vPct, vW);
  pruefe('KIP abgewaehlt -> Stueck- UND Mix-Spalte weg',
    !!ohneKip && ohneKip.header.indexOf('KIP') === -1 && ohneKip.header.indexOf('KIP %') === -1 &&
    ohneKip.header.length === VH.length - 2);
  pruefe('%-Spalten-Indizes werden auf die NEUEN Positionen gemappt',
    !!ohneKip && ohneKip.pct.every(i => String(ohneKip.header[i]).indexOf('%') !== -1),
    'Ein nicht gemappter Index formatiert die falsche Spalte als Prozent — der Excel-Klassiker.');
  pruefe('Breiten wandern mit ihren Spalten',
    !!ohneKip && ohneKip.widths.length === ohneKip.header.length);
  // Zeilen-Wrapper: volle Zeile bauen, Sieb schneidet dieselben Indizes.
  const vollZeile = VH.map((_, i) => 'w' + i);
  const gesiebt = ohneKip.zeile(function(){ return vollZeile; })();
  pruefe('Zeilen-Sieb schneidet exakt dieselben Spalten wie der Header',
    gesiebt.length === ohneKip.header.length && gesiebt.indexOf('w6') === -1 && gesiebt.indexOf('w13') === -1 && gesiebt[0] === 'w0');

  // Beschriftungsspalte ist unantastbar, selbst wenn alles abgewaehlt wird.
  const alleWeg = {}; R.V.forEach(k => { alleWeg[k.key] = false; });
  const nurLabel = R.sieb(R.V, alleWeg, VH, vPct, vW);
  pruefe('alles abgewaehlt -> Beschriftungsspalte bleibt (Blatt bleibt lesbar)',
    !!nurLabel && nurLabel.header.length === 1 && nurLabel.header[0] === '');

  /* -----------------------------------------------------------------------
     3) Blatt-Schalter
  ----------------------------------------------------------------------- */
  console.log('');
  console.log('3) Blatt-Schalter (rcBlattAktiv)');

  // Seit 30.10. gilt OHNE Auswahl der Werkszustand: genau die acht Blaetter der Nutzer-Vorlage
  // (auch Stundenmail/Direktexport). Alle anderen sind im Dialog zuschaltbar.
  const ACHT = ['stand','vertrieb','analyse','reportingV','struktur','teams','agenten','ohneStack'];
  const anOhneWahl = [undefined, null, {}, { blaetter: {} }].map(w => R.B.filter(b => R.aktiv(w, b[0])).map(b => b[0]).sort().join(','));
  pruefe('ohne Auswahl sind genau die acht Standard-Blaetter aktiv (auch Stundenmail)',
    anOhneWahl.every(x => x === ACHT.slice().sort().join(',')), anOhneWahl[0]);
  pruefe('Werk-AUS-Blaetter: Bewertungslogik, Abdeckung, Produkte, Analyse Agenten, Qualitaet Reporting, Standorte, Stacks, Liga Standorte/Teams, Entwicklung',
    ['bewertung','abdeckung','produkte','analyseAgenten','reportingQ','standorte','stacks','ligaStandorte','ligaTeams','entwicklung'].every(k => R.aktiv(undefined, k) === false));
  pruefe('ausdrueckliches true schaltet ein Werk-AUS-Blatt zu, ausdrueckliches false ein Werk-AN-Blatt ab',
    R.aktiv({ blaetter: { produkte: true } }, 'produkte') === true &&
    R.aktiv({ blaetter: { stand: false } }, 'stand') === false &&
    R.aktiv({ blaetter: { produkte: true } }, 'stand') === true &&
    R.aktiv({ blaetter: { produkte: false } }, 'stand') === true);
  // Gegenprobe: die ALTE Regel (ohne Auswahl alles an) haette Produkte durchgelassen.
  pruefe('Gegenprobe: die alte "ohne Auswahl alles"-Regel wuerde Produkte durchlassen',
    (function(w, k){ return !w || !w.blaetter ? true : w.blaetter[k] !== false; })(undefined, 'produkte') === true &&
    R.aktiv(undefined, 'produkte') === false);
  // 18 seit 30.10.: Analyse Teams und Analyse Agenten sind getrennt schaltbar, die Bewertungslogik
  // und Abdeckung (beide fehlen in der Vorlage des Nutzers) sind eigene Blaetter.
  pruefe('Blatt-Registry kennt alle 18 Blaetter', R.B.length === 18 && R.B.some(b => b[0] === 'ohneStack') &&
    R.B.some(b => b[0] === 'analyseAgenten') && R.B.some(b => b[0] === 'analyse') && R.B.some(b => b[0] === 'bewertung'));
}

/* ---------------------------------------------------------------------------
   4) Verdrahtung im Quelltext
--------------------------------------------------------------------------- */
console.log('');
console.log('4) Verdrahtung');

pruefe('rcBuildAggSheets nimmt wahl und reicht ihn an BEIDE Reporting-Aufrufe',
  /function rcBuildAggSheets\(XL, wb, styled, agg, titel, wahl\)/.test(SRC) &&
  /'vertrieb', undefined, wahl\)/.test(SRC) && /'qualitaet', undefined, wahl\)/.test(SRC));
pruefe('kein VIERTER rcBuildAggSheets-Aufrufer entstanden',
  (SRC.match(/(?<![\w$.])rcBuildAggSheets\(XL/g) || []).length - (SRC.match(/function rcBuildAggSheets\(XL/g) || []).length === 3,
  'Die Regel "genau DREI Aufrufer" ist der teuerste Fallstrick des Projekts (Definition zaehlt nicht mit).');
pruefe('Stundenmail-Aufruf bleibt OHNE wahl (Mail folgt dem Werkszustand der Blatt-Registry)',
  /rcBuildAggSheets\(XL, wb, !!XL\.__styled, agg, rcZeitraumText\(data\)\);\n/.test(SRC));
pruefe('Basis-Blaetter haengen an rcBlattAktiv (stand/vertrieb/produkte/analyse/analyseAgenten)',
  /rcBlattAktiv\(wahl, 'stand'\)/.test(SRC) && /rcBlattAktiv\(wahl, 'vertrieb'\)/.test(SRC) &&
  /rcBlattAktiv\(wahl, 'produkte'\)/.test(SRC) && /rcBlattAktiv\(wahl, 'analyse'\)/.test(SRC) &&
  /rcBlattAktiv\(wahl, 'analyseAgenten'\)/.test(SRC));
pruefe('die Bewertungslogik haengt am Registry-Schluessel "bewertung" (nicht mehr fest am Stand-Blatt)',
  /opts\.skipBewertung \|\| !rcBlattAktiv\(opts\.wahl, 'bewertung'\)/.test(SRC) &&
  /rcBuildStandSheets\(XL, wb, !!XL\.__styled, data, \{ wahl: wahl \}\)/.test(SRC));
pruefe('Stundenmail-Mappe und Direktexport schalten Produkte ueber die Registry (nicht mehr fest)',
  (SRC.match(/rcBlattAktiv\(null, 'produkte'\)/g) || []).length === 2);
pruefe('Agg-Blaetter haengen an rcBlattAktiv (struktur/standorte/stacks/teams/agenten/liga/entwicklung)',
  ['struktur','standorte','stacks','teams','agenten','ligaStandorte','ligaTeams','entwicklung']
    .every(k => SRC.indexOf("rcBlattAktiv(wahl, '" + k + "')") !== -1));
pruefe('Dialog: Karte Inhalt mit Haekchen-Gruppen + alle-an/aus',
  /rcExB_/.test(SRC) && /rcExKV_/.test(SRC) && /rcExKQ_/.test(SRC) && /data-alle=/.test(SRC));
pruefe('Auswahl wird projektgetrennt gemerkt (rcKey rcExportWahl_v1)',
  /rcKey\('rcExportWahl_v1'\)/.test(SRC));
pruefe('gespeichert wird nur die ABWEICHUNG vom Werkszustand (Blaetter true/false, Kennzahlen nur false)',
  /if \(el && el\.checked !== \(b\[2\] !== false\)\) aus\.blaetter\[b\[0\]\] = el\.checked/.test(SRC) &&
  /if \(el && !el\.checked\) aus\.kv\[k\.key\] = false/.test(SRC));
pruefe('rcExWahlGo uebergibt die Auswahl an rcExportStandZeitraum',
  // "sag" seit 05.10.: der Dialog frischt erst auf (frischDann) und reicht dann
  // seinen Melde-Kanal herein — die Auswahl geht unveraendert als letzter Parameter mit.
  /rcExportStandZeitraum\(b\.von, b\.bis, scopeAus\(\), true, sag, wahlAus\(\)\)/.test(SRC));

/* ------------------------------------------------------------------------ */
console.log('');
if (fehler === 0) console.log('ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN');
else { console.log(fehler + ' von ' + geprueft + ' PRUEFUNGEN FEHLGESCHLAGEN'); process.exitCode = 1; }
