/* ============================================================================
   DASHBOARD-NACHSTART PRUEFEN
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/dashboard_nachstart_pruefen.js

   Nutzer-Befund 14.08.: "Starter laeuft, Dashboard fehlt trotzdem." Zwei
   Ursachen, zwei Gegenmittel, beide hier geprueft:

   1. esl_autopilot.user.js: startDashboard hatte once('startDash') + 25-s-
      Frist — EIN Fehlversuch (Speicher leer, Seite langsam) und das Dashboard
      blieb fuer immer aus. Jetzt: Wiederhol-Zaehler mit Abstand (30 s),
      Deckel 10, Zustand in window.rcAutoDashVersuche. Der Kern wird per
      Klammer-Zaehlung ausgeschnitten und FUNKTIONAL durchgespielt.

   2. ESL_Start.cmd: der Dauerwaechter spielt das Dashboard DIREKT ein
      (StelleDashboardSicher), wenn die Export-Ansicht steht und
      rcLiveInterval fehlt — derselbe Weg wie das Lesezeichen, ohne Hand.
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const AUTO = fs.readFileSync(path.join(__dirname, '..', 'esl_autopilot.user.js'), 'utf8');
const CMD  = fs.readFileSync(path.join(__dirname, '..', 'ESL_Start.cmd'), 'utf8');
const PS1  = fs.readFileSync(path.join(__dirname, '..', 'ESL_Start.ps1'), 'utf8');

let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}

// Funktion (oder Block) per Klammer-Zaehlung aus dem Quelltext schneiden —
// ein Nachbau bewacht nur seine eigene Kopie, deshalb IMMER das Original.
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

console.log('DASHBOARD-NACHSTART PRUEFEN');
console.log('');

/* ---------------------------------------------------------------------------
   1) Autopilot: Struktur
--------------------------------------------------------------------------- */
console.log('1) Autopilot: Zaehler statt once()');
pruefe('once(\'startDash\') ist RAUS (die alte Einmal-Sperre)',
  AUTO.indexOf("once('startDash')") === -1,
  'once() setzt seine Sperre beim Pruefen — ein Fehlversuch war endgueltig.');
pruefe('Wiederhol-Zustand dashVersuche/dashZuletzt vorhanden',
  /var dashIv = null, dashVersuche = 0, dashZuletzt = 0;/.test(AUTO));
pruefe('Abstand zwischen Versuchen ist 30 s',
  /dashZuletzt < 30000/.test(AUTO));
pruefe('Deckel bei 10 Versuchen',
  /dashVersuche >= 10/.test(AUTO));
pruefe('Zustand nach aussen: window.rcAutoDashVersuche',
  /window\.rcAutoDashVersuche = dashVersuche/.test(AUTO));
pruefe('nach Aufgabe wird auf rcAutoStartJetzt()/Knopf verwiesen',
  /aufgegeben[\s\S]{0,120}rcAutoStartJetzt/.test(schneide(AUTO, 'function startDashboard()') || ''),
  'Der Nutzer muss den Ausweg lesen koennen, nicht raten.');
// Gegenprobe (Regel: eine Pruefung muss den echten Fehler auch erkennen):
pruefe('Gegenprobe: die alte once-Bauart wuerde von Pruefung 1 erkannt',
  "if (!once('startDash')) return;".indexOf("once('startDash')") !== -1);

/* ---------------------------------------------------------------------------
   2) Autopilot: startDashboard FUNKTIONAL durchspielen
--------------------------------------------------------------------------- */
console.log('');
console.log('2) Autopilot: startDashboard funktional (ausgeschnittener Original-Code)');

const kern = schneide(AUTO, 'function startDashboard()');
pruefe('startDashboard laesst sich ausschneiden', !!kern);

if (kern) {
  // Der Ausschnitt referenziert die Zaehler-Variablen davor — mitgeben.
  // Der Tick selbst kommt aus dem setInterval-Stub (u.ticks), kein Rueckgabewert noetig.
  const quell = 'var dashIv = null, dashVersuche = 0, dashZuletzt = 0;\n' + kern + '\nstartDashboard();';

  function baueUmgebung(runStoredErgebnis) {
    const u = {
      jetzt: 1000000,
      ticks: null,
      cleared: 0,
      banners: [],
      bannerActions: 0,
      knopfWegAufrufe: 0,
      runStoredAufrufe: 0,
      pickAufrufe: 0,        // Ansicht-Wache (22.08.): Nachwahl-Versuche zaehlen
      ansichtSteht: true,    // Vorgabe: Ansicht steht — die Wache soll dann schweigen
      fenster: {},           // window-Stub
      filterFormDa: true
    };
    const DateStub = { now: function () { return u.jetzt; } };
    const setIntervalStub = function (fn) { u.ticks = fn; return 7; };
    const clearIntervalStub = function () { u.cleared++; };
    const idStub = function (x) { return (x === 'filterForm' && u.filterFormDa) ? {} : null; };
    const bannerStub = function (t) { u.banners.push(String(t)); };
    const bannerActionStub = function () { u.bannerActions++; };
    const knopfWegStub = function () { u.knopfWegAufrufe++; };
    const runStoredStub = function () { u.runStoredAufrufe++; return runStoredErgebnis(u); };
    // Seit 22.08. haengt in der Schleife die Ansicht-Wache: steht die
    // Statistik-Auswahl nicht, wird pickExportView erneut versucht. Beide
    // Helfer hier stubben — und mitzaehlen, damit Fall D sie messen kann.
    const ansichtStub = function () { return u.ansichtSteht; };
    const pickStub = function () { u.pickAufrufe++; };
    const f = new Function('window', 'Date', 'setInterval', 'clearInterval', 'id',
      'banner', 'bannerAction', 'knopfWeg', 'runStored', 'stop', 'CFG',
      'exportAnsichtSteht', 'pickExportView', quell);
    f(u.fenster, DateStub, setIntervalStub, clearIntervalStub, idStub,
      bannerStub, bannerActionStub, knopfWegStub, runStoredStub, false, {},
      ansichtStub, pickStub);
    return u;
  }

  // Fall A: runStored scheitert dauerhaft -> mehrere Versuche mit Abstand
  const a = baueUmgebung(function () { return false; });
  pruefe('setInterval wurde gestartet', typeof a.ticks === 'function');
  if (typeof a.ticks === 'function') {
    a.ticks();                        // Versuch 1 (dashZuletzt=0, sofort faellig)
    a.ticks();                        // zu frueh — kein 2. Versuch
    pruefe('erster Versuch laeuft, zweiter wartet den Abstand ab',
      a.runStoredAufrufe === 1,
      a.runStoredAufrufe + ' runStored-Aufrufe nach 2 Ticks (erwartet 1)');
    a.jetzt += 31000; a.ticks();      // Abstand vorbei — Versuch 2
    pruefe('nach 31 s kommt der naechste Versuch',
      a.runStoredAufrufe === 2,
      a.runStoredAufrufe + ' Aufrufe (erwartet 2) — genau das fehlte mit once()');
    pruefe('Fehlversuch zeigt den Datei-Dialog-Hinweis', a.bannerActions >= 1);
    // bis zum Deckel durchdrehen
    for (let i = 0; i < 20; i++) { a.jetzt += 31000; a.ticks(); }
    pruefe('Deckel: hoechstens 10 Versuche', a.runStoredAufrufe === 10,
      a.runStoredAufrufe + ' Aufrufe (erwartet 10)');
    pruefe('nach dem Deckel raeumt der Takt sich ab', a.cleared >= 1);
    pruefe('Aufgabe wird gemeldet', a.banners.some(function (b) { return b.indexOf('aufgegeben') !== -1; }));
  }

  // Fall B: Dashboard kommt hoch -> Takt endet, Knopf verschwindet
  const b = baueUmgebung(function (u) { u.fenster.rcLiveInterval = 123; return true; });
  if (typeof b.ticks === 'function') {
    b.ticks();                        // Versuch 1: runStored setzt rcLiveInterval
    b.ticks();                        // naechster Tick sieht rcLiveInterval
    pruefe('bei laufendem Dashboard endet der Takt', b.cleared >= 1);
    pruefe('Startknopf wird abgeraeumt', b.knopfWegAufrufe >= 1);
    pruefe('kein weiterer runStored-Versuch danach', b.runStoredAufrufe === 1,
      b.runStoredAufrufe + ' Aufrufe (erwartet 1)');
  }

  // Fall C: filterForm fehlt -> es wird GEWARTET, kein Versuch verbraucht
  const c = baueUmgebung(function () { return false; });
  if (typeof c.ticks === 'function') {
    c.filterFormDa = false;
    c.ticks(); c.jetzt += 31000; c.ticks();
    pruefe('ohne filterForm wird kein Versuch verbraucht', c.runStoredAufrufe === 0,
      c.runStoredAufrufe + ' Aufrufe (erwartet 0) — Warten ist kein Fehlversuch');
    c.filterFormDa = true; c.jetzt += 31000; c.ticks();
    pruefe('sobald filterForm da ist, geht es los', c.runStoredAufrufe === 1);
  }

  // Fall D (22.08., Nacht-Befund "Bitte Abfrage waehlen!"): steht die
  // Statistik-Auswahl nicht, waehlt die Schleife nach — steht sie, schweigt
  // die Wache. Der Dashboard-Start laeuft davon unabhaengig weiter.
  const d = baueUmgebung(function () { return false; });
  if (typeof d.ticks === 'function') {
    d.ansichtSteht = false;
    d.ticks();
    pruefe('Ansicht fehlt -> pickExportView wird gerufen', d.pickAufrufe === 1,
      d.pickAufrufe + ' Aufrufe (erwartet 1)');
    pruefe('der Dashboard-Start laeuft trotzdem weiter (kein return davor)',
      d.runStoredAufrufe === 1,
      d.runStoredAufrufe + ' runStored-Aufrufe (erwartet 1)');
    d.ansichtSteht = true; d.jetzt += 31000; d.ticks();
    pruefe('Ansicht steht -> keine weitere Nachwahl', d.pickAufrufe === 1,
      d.pickAufrufe + ' Aufrufe (erwartet weiterhin 1)');
  }
}

/* ---------------------------------------------------------------------------
   3) Starter: StelleDashboardSicher
--------------------------------------------------------------------------- */
console.log('');
console.log('3) Starter: Direkteinspielung durch den Dauerwaechter');

pruefe('StelleDashboardSicher ist definiert',
  /function StelleDashboardSicher\(\$ziel\)/.test(CMD));

// Auf den BLOCK eingrenzen (Regel 18), nicht global suchen: der Aufruf muss im
// keine-maske-Zweig stehen — nur dort ist die Seite angemeldet.
const maskeI = CMD.indexOf("$tat -eq 'keine-maske'");
const maskeEnde = CMD.indexOf('elseif', maskeI);
const maskeBlock = (maskeI >= 0 && maskeEnde > maskeI) ? CMD.slice(maskeI, maskeEnde) : '';
pruefe('Aufruf steht im keine-maske-Zweig (Seite ist angemeldet)',
  /StelleDashboardSicher \$t/.test(maskeBlock),
  'Ausserhalb davon steht eine Anmeldemaske — dort gibt es kein filterForm.');

const sds = schneide(CMD, 'function StelleDashboardSicher($ziel)');
pruefe('Funktion laesst sich ausschneiden', !!sds);
if (sds) {
  pruefe('EINE Abfrage fuer filterForm UND rcLiveInterval',
    sds.indexOf('filterForm') !== -1 && sds.indexOf('rcLiveInterval') !== -1);
  pruefe('eingespielt wird NUR bei Ansicht-da + Dashboard-fehlt (\'10\')',
    /-ne '10'/.test(sds),
    'Ohne die Weiche wuerde jeder 20-s-Takt neu einspielen — Dauer-Re-Inject.');
  pruefe('je Tab hoechstens 1x/Minute (Deckel)',
    /TotalSeconds -lt 60/.test(sds) && /\$dashDirektZuletzt/.test(sds));
  pruefe('eingespielt wird der Dashboard-Quelltext selbst ($Dashboard)',
    /expression = \$Dashboard/.test(sds));
  pruefe('ohne Dashboard-Quelltext steigt die Funktion aus',
    /if \(-not \$Dashboard\) \{ return \$false \}/.test(sds));
  pruefe('WebSocket wird in JEDEM Pfad geschlossen',
    (sds.match(/\$w\.Dispose\(\)/g) || []).length >= 3,
    'Ein offener Socket je 20-s-Takt frisst sich sonst durch die Handles.');
}

pruefe('Meldung ins Starterfenster bei Direktstart',
  /Dashboard direkt eingespielt in:/.test(CMD));

/* ---------------------------------------------------------------------------
   4) Erzeugte Dateien sind nachgezogen
--------------------------------------------------------------------------- */
console.log('');
console.log('4) Erzeugte Dateien nachgezogen (Varianten + ps1)');

pruefe('ESL_Start.ps1 traegt StelleDashboardSicher (node ps1_erzeugen.js gelaufen)',
  /function StelleDashboardSicher\(\$ziel\)/.test(PS1));

for (const name of ['esl_autopilot_mobile.user.js', 'esl_autopilot_um.user.js']) {
  let v = '';
  try { v = fs.readFileSync(path.join(__dirname, '..', name), 'utf8'); } catch (e) {}
  pruefe(name + ' traegt den Wiederhol-Zaehler (Varianten erzeugt)',
    /dashVersuche/.test(v),
    'node autopilot_varianten_erzeugen.js laufen lassen.');
}

/* ------------------------------------------------------------------------ */
console.log('');
if (fehler === 0) console.log('ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN');
else { console.log(fehler + ' von ' + geprueft + ' PRUEFUNGEN FEHLGESCHLAGEN'); process.exitCode = 1; }
