/* ============================================================================
   ACW / ACHT PRUEFEN (16.08.)
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/acw_acht_pruefen.js

   Nutzer-Befund 16.08.: "Ich sehe in der Qualitaet immer noch nicht den
   durchschnittlichen ACW von den Agents oder Teams. ACW ist eine Nacharbeit,
   und ich brauche den Wert der Kennzahl. ... oder ACHT ist Call on Hold. Das
   brauche ich auch."

   Ausgangslage (am Code gemessen): der Crawler LIEFERT acwSec/achtSec seit
   jeher (kpi_crawler.js, findKpi(map,'ACW','Kennzahl')), aber die
   Qualitaets-Seite hatte weder Kachel noch Spalte dafuer. Sichtbar waren die
   Werte nur im Agenten-Detail und in der Warteschleife.

   ZWEITE, unabhaengige Ursache: seit Crawler v6 wird die figure_list im
   Produktivpfad vom Ok-Klick GEERBT. Ist ACW/ACHT im Portal nicht angehakt,
   fehlt die Spalte ganz — und "Spalte fehlt" darf NICHT als "0 Sekunden"
   durchgehen. Genau dieselbe Falle wie beim AHT-Nenner (dort sprang die
   Ansprachequote um Faktor 8, weil ein "|| 0" aus "nicht geliefert" eine
   harte Null machte).
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'esl_live_arena_v22.js'), 'utf8');
const CRAWLER = fs.readFileSync(path.join(__dirname, '..', 'kpi_crawler.js'), 'utf8');

let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}
function schneide(quelle, startMarke) {
  const i = quelle.indexOf(startMarke);
  if (i < 0) return null;
  const auf = quelle.indexOf('{', i);
  if (auf < 0) return null;
  let tiefe = 0;
  for (let j = auf; j < quelle.length; j++) {
    const c = quelle[j];
    if (c === '{') tiefe++;
    else if (c === '}') { tiefe--; if (tiefe === 0) return quelle.slice(i, j + 1); }
  }
  return null;
}

console.log('ACW / ACHT PRUEFEN');
console.log('');

/* ---------------------------------------------------------------------------
   1) Liefert der Crawler die Werte ueberhaupt?
--------------------------------------------------------------------------- */
console.log('1) Crawler: Spalten lesen und Fehlen MELDEN');

pruefe('ACW wird aus der Kennzahl-Spalte gelesen',
  /const iAcwKz\s*=\s*findKpi\(map, 'ACW', 'Kennzahl'\)/.test(CRAWLER));
pruefe('ACHT wird aus der Kennzahl-Spalte gelesen',
  /const iAchtKz\s*=\s*findKpi\(map, 'ACHT', 'Kennzahl'\)/.test(CRAWLER));
pruefe('beide gehen als Sekunden ins Paket (acwSec / achtSec)',
  /acwSec:\s*iAcwKz\s*>=\s*0/.test(CRAWLER) && /achtSec:\s*iAchtKz\s*>=\s*0/.test(CRAWLER));
pruefe('fehlende Spalte liefert null, NICHT 0',
  /acwSec:\s*iAcwKz\s*>=\s*0\s*\?\s*timeToSec\(cellText\(cells, iAcwKz\)\)\s*:\s*null/.test(CRAWLER),
  'Ein "|| 0" machte beim AHT-Nenner aus "nicht geliefert" eine harte Null — '
  + 'dieselbe Falle wuerde hier eine Nacharbeit von 0 Sekunden vortaeuschen.');
pruefe('fehlende Kennzahl wird EINMAL im Klartext gemeldet',
  /__rcZeitenFehltGemeldet/.test(CRAWLER) && /ACW \(Nacharbeit\)/.test(CRAWLER) && /ACHT \(Haltezeit/.test(CRAWLER),
  'Ohne Meldung sieht der Nutzer nur ein stummes "—" und sucht im Dashboard '
  + 'statt in der Portal-Auswahl.');
pruefe('die Meldung nennt die ABHILFE, nicht nur das Symptom',
  /im Portal links die Kennzahlen anhaken/.test(CRAWLER));
pruefe('einmal je Sitzung, nicht bei jedem 3-Minuten-Takt',
  /if \(\(iAcwKz < 0 \|\| iAchtKz < 0\) && !window\.__rcZeitenFehltGemeldet\)/.test(CRAWLER));

/* ---------------------------------------------------------------------------
   2) Ziele — in SEKUNDEN, nicht in Minuten
--------------------------------------------------------------------------- */
console.log('');
console.log('2) Ziele');

const zieleBlock = schneide(SRC, 'const RC_ZIELE =');
pruefe('RC_ZIELE laesst sich ausschneiden', !!zieleBlock);
if (zieleBlock) {
  const Z = new Function('return ' + zieleBlock.replace(/^const RC_ZIELE\s*=\s*/, '').replace(/;$/, ''))();
  pruefe('acwSek und achtSek sind Hoechstwerte (max), nicht Mindestwerte',
    Z.acwSek && Z.acwSek.max === 60 && Z.achtSek && Z.achtSek.max === 60,
    'Bei ACW/ACHT ist KLEINER besser — ein min-Ziel faerbte jede kurze '
    + 'Nacharbeit rot.');
  pruefe('die Grenzen decken sich mit dem Warteschleifen-Zeitwaechter',
    /zeitAchtSek[^\d]{0,12}60/.test(SRC),
    'CFG.zeitAchtSek ist 60 — zwei verschiedene Grenzen fuer dieselbe Groesse '
    + 'waeren der Fallstrick "dieselbe Kennzahl, zwei Rechenwege".');
}

/* ---------------------------------------------------------------------------
   3) Der Rechenkern — FUNKTIONAL gegen die echte Funktion
--------------------------------------------------------------------------- */
console.log('');
console.log('3) rcZeitMittel: ueber die Calls gewichtet, mit EIGENEM Nenner');

const mittelFn = schneide(SRC, 'function rcZeitMittel(liste, feld)');
pruefe('rcZeitMittel laesst sich ausschneiden', !!mittelFn);
if (mittelFn) {
  const f = new Function(mittelFn + '; return rcZeitMittel;')();

  // Gewichtung: 10 Calls a 600 s und 30 Calls a 300 s ergeben 375 s,
  // NICHT 450 s (das waere der ungewichtete Mittelwert).
  const gew = f([{ acwSec: 600, callCount: 10 }, { acwSec: 300, callCount: 30 }], 'acwSec');
  pruefe('gewichtet je Call (10x600 + 30x300 -> 375 s, nicht 450 s)',
    gew.sek === 375, 'Gemessen: ' + gew.sek);

  // Eigener Nenner: wer den Wert nicht meldet, darf den Nenner nicht aufblaehen.
  const eigen = f([{ acwSec: 60, callCount: 10 }, { acwSec: null, callCount: 990 }], 'acwSec');
  pruefe('ein Agent OHNE Meldung blaeht den Nenner nicht auf (bleibt 60 s)',
    eigen.sek === 60,
    'Mit gemeinsamem Nenner kaemen 0,6 s heraus. Gemessen: ' + eigen.sek);

  // Der entscheidende Unterschied: Spalte fehlt vs. Wert ist 0.
  const fehlt = f([{ acwSec: null, callCount: 10 }], 'acwSec');
  pruefe('alle Werte null -> geliefert:false ("die Spalte kam gar nicht")',
    fehlt.geliefert === false && fehlt.sek === null);
  const null0 = f([{ acwSec: 0, callCount: 10 }], 'acwSec');
  pruefe('echte 0 -> geliefert:true (das ist eine Aussage, kein Loch)',
    null0.geliefert === true,
    'Wer beides gleich behandelt, kann "keine Nacharbeit" nicht von '
    + '"Kennzahl nicht abgefragt" unterscheiden.');

  // Ohne Call-Zahl darf der Wert nicht verschwinden.
  const ohneCalls = f([{ acwSec: 90 }], 'acwSec');
  pruefe('ohne callCount zaehlt der Agent mit Gewicht 1 (Wert geht nicht verloren)',
    ohneCalls.sek === 90);

  const leer = f([], 'acwSec');
  pruefe('leere Liste stuerzt nicht ab',
    leer.sek === null && leer.geliefert === false && leer.n === 0);
}

const fmtFn = schneide(SRC, 'function fmtSekKurz(sec)');
pruefe('fmtSekKurz laesst sich ausschneiden', !!fmtFn);
if (fmtFn) {
  const ahtFn = schneide(SRC, 'function fmtAht(sec)');
  const g = new Function(ahtFn + '\n' + fmtFn + '; return fmtSekKurz;')();
  pruefe('unter 60 s in Sekunden ("45 s" statt "0:45")', g(45) === '45 s');
  pruefe('ab 60 s in m:ss ("1:20")', g(80) === '1:20');
  pruefe('null bleibt "—"', g(null) === '—');
}

/* ---------------------------------------------------------------------------
   4) Qualitaets-Seite: Kacheln, Spalten, Sortierung
--------------------------------------------------------------------------- */
console.log('');
console.log('4) Qualitaets-Seite (das, was der Nutzer vermisst hat)');

pruefe('KPI-Kachel "Ø ACW" im Streifen',
  /Ø ACW · Ziel ≤ 60 s/.test(SRC) && /id="qKpiAcw"/.test(SRC));
pruefe('KPI-Kachel "Ø ACHT" im Streifen',
  /Ø ACHT · Ziel ≤ 60 s/.test(SRC) && /id="qKpiAcht"/.test(SRC));
pruefe('Tabellenspalte ACW mit erklaerendem Titel',
  /title="Nacharbeit je Call \(After Call Work\)">ACW</.test(SRC));
pruefe('Tabellenspalte ACHT mit erklaerendem Titel',
  /title="Haltezeit je Call \(Call on Hold\)">ACHT</.test(SRC));

// Die Spaltenzahl ist die klassische stille Falle: eine vergessene colspan
// laesst die Leermeldung verrutschen.
const kopfZeile = SRC.slice(SRC.indexOf('<tbody id="rcQualiBody">') - 1400, SRC.indexOf('<tbody id="rcQualiBody">'));
const thZahl = (kopfZeile.match(/<th[ >]/g) || []).length;
pruefe('Kopfzeile hat 13 Spalten', thZahl === 13, 'Gezaehlt: ' + thZahl);
pruefe('ALLE colspan der Leermeldungen stehen auf 13',
  (SRC.match(/colspan="11"[^>]*>\s*(Warte auf KPI-Quelle|\$\{leerTxt\})/g) || []).length === 0 &&
  /<tbody id="rcQualiBody"><tr><td colspan="13"/.test(SRC) &&
  /body\.innerHTML = `<tr><td colspan="13"/.test(SRC),
  'Eine vergessene colspan schiebt die Leermeldung aus der Tabelle.');

pruefe('Sortier-Knoepfe ACW und ACHT vorhanden (Aufbau)',
  /id="qSortAcw"/.test(SRC) && /id="qSortAcht"/.test(SRC));
pruefe('... UND in der Handler-Liste (Zwei-Listen-Regel)',
  /\['qSortAcw','acwSec'\]/.test(SRC) && /\['qSortAcht','achtSec'\]/.test(SRC),
  'Fehlt der zweite Eintrag, laesst sich der Knopf druecken und bewirkt nichts.');

const renderFn = schneide(SRC, 'window.renderQualitaet = function()');
pruefe('renderQualitaet laesst sich ausschneiden', !!renderFn);
if (renderFn) {
  pruefe('die Kacheln rechnen ueber rcZeitMittel (EINE Rechenstelle)',
    /const mAcw\s*=\s*rcZeitMittel\(list, 'acwSec'\)/.test(renderFn) &&
    /mAcht\s*=\s*rcZeitMittel\(list, 'achtSec'\)/.test(renderFn));
  pruefe('"nicht geliefert" wird ausgeschrieben statt als "—" getarnt',
    renderFn.indexOf("e.textContent = 'n. geliefert'") !== -1 &&
    renderFn.indexOf('RC_ZEIT_FEHLT') !== -1);
  pruefe('bei ACW/ACHT-Sortierung entfaellt das Siegertreppchen',
    /const zeitSort = \(sk === 'acwSec' \|\| sk === 'achtSec'\);/.test(renderFn) &&
    /zeitSort \? '' : \(i===0\?'rc-table-row-1'/.test(renderFn) &&
    /\$\{zeitSort\?'':rankClass\(i\)\}/.test(renderFn),
    'Sortiert wird nach der laengsten Nacharbeit — eine Goldmedaille fuer den '
    + 'schlechtesten Wert waere ein falsches Signal.');
  pruefe('Team-Karte gruppiert ueber rcLigaMeta (teamOf), nicht ueber k.team',
    /const t = teamOf\(k\) \|\| '\(ohne Team\)';/.test(renderFn),
    'k.team ist die Ligalisten-NUMMER und passt zu keinem Dropdown-Wert.');
  pruefe('Team-Karte sortiert die laengste Nacharbeit nach oben',
    /\.sort\(\(x,y\) => \(y\.acw\|\|0\) - \(x\.acw\|\|0\)\)/.test(renderFn));
  pruefe('Team-Zeilen sind anklickbar (data-rc-team -> Team-Detail)',
    /data-rc-team="\$\{rcAttr\(r\.team\)\}"/.test(renderFn));
  pruefe('leere Team-Karte nennt den Grund, wenn gar nichts geliefert wurde',
    /const garNichts = !mAcw\.geliefert && !mAcht\.geliefert;/.test(renderFn));
}
pruefe('Karte "Nacharbeit & Haltezeit je Team" hat eine stabile Titel-id',
  /id="rcCardQualiZeiten"/.test(SRC),
  'Ohne Titel-id haengt der Layout-Schluessel am Titeltext — ein Umbenennen '
  + 'verloere alle Einstellungen dieser Karte.');

/* ---------------------------------------------------------------------------
   5) Team-Detail rechnet mit DERSELBEN Funktion
--------------------------------------------------------------------------- */
console.log('');
console.log('5) Team-Detail (Klick auf ein Team)');

const aggFn = schneide(SRC, 'function rcTeamQualiAgg(teamId)');
pruefe('rcTeamQualiAgg laesst sich ausschneiden', !!aggFn);
if (aggFn) {
  pruefe('nutzt rcZeitMittel statt einer zweiten Rechnung',
    /const mAcw = rcZeitMittel\(kpis, 'acwSec'\), mAcht = rcZeitMittel\(kpis, 'achtSec'\);/.test(aggFn),
    'Fallstrick Nr. 8: dieselbe Kennzahl auf zwei Wegen gerechnet sieht aus '
    + 'wie ein Rechenfehler.');
  pruefe('gibt acw/acht UND die geliefert-Marke zurueck',
    /acw: mAcw\.sek, acwDa: mAcw\.geliefert, acht: mAcht\.sek, achtDa: mAcht\.geliefert/.test(aggFn));
}
pruefe('Team-Modal zeigt beide Kacheln',
  /kpiTile\('ACW Ø \(Nacharbeit\)'/.test(SRC) && /kpiTile\('ACHT Ø \(Haltezeit\)'/.test(SRC));
pruefe('Agenten-Modal zeigt ACW und ACHT weiterhin',
  /kpiTile\('ACW', fmtAht\(kpi\.acwSec\)/.test(SRC) && /kpiTile\('ACHT', fmtAht\(kpi\.achtSec\)/.test(SRC));

/* ------------------------------------------------------------------------ */
console.log('');
if (fehler === 0) console.log('ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN');
else { console.log(fehler + ' von ' + geprueft + ' PRUEFUNGEN FEHLGESCHLAGEN'); process.exitCode = 1; }
