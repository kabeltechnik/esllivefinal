/* ============================================================================
   AUTOPILOT-VARIANTEN ERZEUGEN
   ---------------------------------------------------------------------------
   Aufruf:  node autopilot_varianten_erzeugen.js

   Erzeugt aus esl_autopilot.user.js (Master, Projekt "Vodafone Kabel") die
   beiden anderen Projekt-Fassungen:
       esl_autopilot_mobile.user.js   -> Vodafone Mobile
       esl_autopilot_um.user.js       -> Vodafone UM

   WARUM EIN GENERATOR UND NICHT DREI GEPFLEGTE DATEIEN
   Die Dateien unterscheiden sich in genau ZWEI Zeilen. Von Hand gepflegt laufen
   sie unweigerlich auseinander — im Projekt ist das schon einmal passiert
   (ESL_Start.ps1 war die aeltere Fassung der .cmd und schleppte einen laengst
   behobenen Fehler mit). Deshalb: nach JEDER Aenderung am Master hier neu
   erzeugen.

   Der Marker 'AUTOPILOT' im Kopfkommentar bleibt erhalten — ESL_Start.cmd
   prueft ihn in den ersten 4000 Zeichen und lehnt Dateien ohne ihn ab.
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ORDNER = __dirname;
const MASTER = path.join(ORDNER, 'esl_autopilot.user.js');

const VARIANTEN = [
  {
    datei: 'esl_autopilot_mobile.user.js',
    projekt: 'Vodafone Mobile',
    seite: 'sis_vodafone_mobile.xhtml',
    kurz: 'MOBILE'
  },
  {
    datei: 'esl_autopilot_um.user.js',
    projekt: 'Vodafone UM',
    // Die Adresse enthaelt im Portal ein kodiertes Leerzeichen
    // (/Agents/secure%20/sis_vodafone_um.xhtml). Verglichen wird nur der
    // DATEINAME, deshalb spielt das hier keine Rolle.
    seite: 'sis_vodafone_um.xhtml',
    kurz: 'UM'
  }
];

if (!fs.existsSync(MASTER)) {
  console.error('Master nicht gefunden: ' + MASTER);
  process.exit(1);
}
const master = fs.readFileSync(MASTER, 'utf8');

// Die beiden Stellen, die getauscht werden. Beide MUESSEN gefunden werden —
// sonst entstuende eine Fassung, die stillschweigend das falsche Projekt oeffnet.
const RE_PROJEKT = /(PROJEKT:\s*')([^']*)(')/;
const RE_DATEI   = /(PROJEKT_DATEI:\s*')([^']*)(')/;

if (!RE_PROJEKT.test(master) || !RE_DATEI.test(master)) {
  console.error('Im Master fehlen PROJEKT / PROJEKT_DATEI — Struktur geaendert?');
  process.exit(1);
}

let fehler = 0;
VARIANTEN.forEach(v => {
  let s = master;
  s = s.replace(RE_PROJEKT, '$1' + v.projekt + '$3');
  s = s.replace(RE_DATEI,   '$1' + v.seite   + '$3');

  // Kopfzeile eindeutig machen, damit man beim Einspielen nicht die falsche
  // Datei erwischt. @name und @match bleiben sonst identisch.
  s = s.replace('// @name         ESL Live-Arena Autopilot',
                '// @name         ESL Live-Arena Autopilot — ' + v.projekt);
  s = s.replace('   ESL LIVE-ARENA AUTOPILOT v2',
                '   ESL LIVE-ARENA AUTOPILOT v2  —  PROJEKT: ' + v.projekt.toUpperCase());

  // Ein deutlicher Hinweis ganz oben: diese Datei wird ERZEUGT.
  s = s.replace('/* ============================================================================\n   ESL LIVE-ARENA AUTOPILOT',
    '/* ERZEUGTE DATEI — NICHT VON HAND AENDERN.\n' +
    '   Quelle: esl_autopilot.user.js  ·  Neu erzeugen: node autopilot_varianten_erzeugen.js\n' +
    '   Unterschied zum Master: PROJEKT = "' + v.projekt + '", Seite = "' + v.seite + '"\n' +
    '============================================================================ */\n' +
    '/* ============================================================================\n   ESL LIVE-ARENA AUTOPILOT');

  const ziel = path.join(ORDNER, v.datei);
  fs.writeFileSync(ziel, s, 'utf8');

  // Gegenprobe: steht wirklich das richtige Projekt drin, und ist der Marker da?
  const zurueck = fs.readFileSync(ziel, 'utf8');
  const pOk = new RegExp("PROJEKT:\\s*'" + v.projekt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'").test(zurueck);
  const dOk = new RegExp("PROJEKT_DATEI:\\s*'" + v.seite.replace(/\./g, '\\.') + "'").test(zurueck);
  const mOk = zurueck.slice(0, 4000).indexOf('AUTOPILOT') !== -1;
  const kabelWeg = !/PROJEKT:\s*'Vodafone Kabel'/.test(zurueck);

  const zeilen = zurueck.split('\n').length;
  console.log('  ' + v.datei);
  console.log('    Projekt   : ' + v.projekt + (pOk ? '  OK' : '  FEHLT!'));
  console.log('    Seite     : ' + v.seite + (dOk ? '  OK' : '  FEHLT!'));
  console.log('    Marker    : ' + (mOk ? "'AUTOPILOT' in den ersten 4000 Zeichen  OK" : 'FEHLT — ESL_Start.cmd lehnt die Datei ab!'));
  console.log('    Kabel raus: ' + (kabelWeg ? 'OK' : 'FEHLER — Master-Projekt steht noch drin!'));
  console.log('    Umfang    : ' + zeilen + ' Zeilen, ' + Math.round(zurueck.length / 1024) + ' KB');
  if (!pOk || !dOk || !mOk || !kabelWeg) fehler++;
});

console.log('');
if (fehler) {
  console.error(fehler + ' Variante(n) fehlerhaft.');
  process.exit(1);
}
console.log('Fertig. Beide Varianten erzeugt.');
console.log('');
console.log('WICHTIG — jedes Projekt braucht ein EIGENES Edge-Fenster:');
console.log('  Die drei Projekte liegen auf derselben Domain (esl.regiocom.net) und');
console.log('  teilen sich damit den Browser-Speicher. Das Dashboard trennt seine');
console.log('  Daten seit 31.07. selbst nach Projekt (siehe rcProjektKuerzel in');
console.log('  esl_live_arena_v22.js) — ohne diese Trennung wuerden sich die drei');
console.log('  Historien gegenseitig ueberschreiben.');
