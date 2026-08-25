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
  const QH = ['', 'CALLS','AHT','CS %','TNPS','FQ %','DDS %','FTF %','AQ %','DETR.'];
  pruefe('Quelltext traegt exakt diesen Vertriebs-Header',
    SRC.indexOf("const VH = ['', 'CALLS','KONT.','ANSPR.','ANSPR. %','ANSPR. % LIGA','KIP','MOB','ENV','PTV','DSL/FIB','VVL','GESAMT','KIP %','MOB %','ENV %','PTV %','DSL/FIB %','VVL %']") !== -1);

  // Jede Registry-Spalte zeigt auf einen existierenden Header-Index; zusammen
  // decken sie ALLE Spalten ausser der Beschriftung (0) ab.
  const abgedecktV = new Set(); R.V.forEach(k => k.idx.forEach(i => abgedecktV.add(i)));
  pruefe('Vertriebs-Registry deckt alle 18 Datenspalten ab, Spalte 0 nie',
    abgedecktV.size === 18 && !abgedecktV.has(0) && Math.max.apply(null, [...abgedecktV]) === 18);
  const abgedecktQ = new Set(); R.Q.forEach(k => k.idx.forEach(i => abgedecktQ.add(i)));
  pruefe('Qualitaets-Registry deckt alle 9 Datenspalten ab',
    abgedecktQ.size === 9 && !abgedecktQ.has(0));
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

  pruefe('ohne Auswahl ist JEDES Blatt aktiv (Stundenmail bleibt voll)',
    R.aktiv(undefined, 'stand') === true && R.aktiv(null, 'agenten') === true && R.aktiv({}, 'teams') === true);
  pruefe('abgewaehltes Blatt faellt, nicht genannte bleiben',
    R.aktiv({ blaetter: { produkte: false } }, 'produkte') === false &&
    R.aktiv({ blaetter: { produkte: false } }, 'stand') === true);
  pruefe('Blatt-Registry kennt alle 14 Blaetter', R.B.length === 14);
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
pruefe('Stundenmail-Aufruf bleibt OHNE wahl (Mail immer voll)',
  /rcBuildAggSheets\(XL, wb, !!XL\.__styled, agg, rcZeitraumText\(data\)\);\n/.test(SRC));
pruefe('Basis-Blaetter haengen an rcBlattAktiv (stand/vertrieb/produkte/analyse)',
  /rcBlattAktiv\(wahl, 'stand'\)/.test(SRC) && /rcBlattAktiv\(wahl, 'vertrieb'\)/.test(SRC) &&
  /rcBlattAktiv\(wahl, 'produkte'\)/.test(SRC) && /rcBlattAktiv\(wahl, 'analyse'\)/.test(SRC));
pruefe('Agg-Blaetter haengen an rcBlattAktiv (struktur/standorte/stacks/teams/agenten/liga/entwicklung)',
  ['struktur','standorte','stacks','teams','agenten','ligaStandorte','ligaTeams','entwicklung']
    .every(k => SRC.indexOf("rcBlattAktiv(wahl, '" + k + "')") !== -1));
pruefe('Dialog: Karte Inhalt mit Haekchen-Gruppen + alle-an/aus',
  /rcExB_/.test(SRC) && /rcExKV_/.test(SRC) && /rcExKQ_/.test(SRC) && /data-alle=/.test(SRC));
pruefe('Auswahl wird projektgetrennt gemerkt (rcKey rcExportWahl_v1)',
  /rcKey\('rcExportWahl_v1'\)/.test(SRC));
pruefe('gespeichert wird nur das ABGEWAEHLTE (neue Kennzahlen sind automatisch an)',
  /if \(el && !el\.checked\) aus\.blaetter\[b\[0\]\] = false/.test(SRC));
pruefe('rcExWahlGo uebergibt die Auswahl an rcExportStandZeitraum',
  /rcExportStandZeitraum\(b\.von, b\.bis, scopeAus\(\), true, sagen, wahlAus\(\)\)/.test(SRC));

/* ------------------------------------------------------------------------ */
console.log('');
if (fehler === 0) console.log('ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN');
else { console.log(fehler + ' von ' + geprueft + ' PRUEFUNGEN FEHLGESCHLAGEN'); process.exitCode = 1; }
