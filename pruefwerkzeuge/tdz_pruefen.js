/**
 * Sucht die ganze Fehlerklasse, die den pad2-Absturz beim Re-Inject verursacht hat:
 * Helfer, die auf IIFE-Ebene per const/let deklariert sind, aber WEITER OBEN im
 * Skript schon aufgerufen werden. Solange der aufrufende Code erst spaeter feuert,
 * faellt das nie auf — sobald er beim Aufbau laeuft (z.B. tickClock() direkt nach
 * seiner Definition), gibt es einen ReferenceError und das Skript bricht ab.
 */
'use strict';
const fs = require('fs');
const DATEI = process.argv[2] || 'C:/Users/v3reg/Downloads/CRAW ESL/LIVE ARENA/esl_live_arena_v22.js';
const zeilen = fs.readFileSync(DATEI, 'utf8').split(/\r?\n/);

// Deklarationen auf IIFE-Ebene (genau 4 Leerzeichen), deren Wert eine Funktion ist
const dekl = new Map();
zeilen.forEach((z, i) => {
  const m = z.match(/^ {4}(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|[A-Za-z_$][\w$]*\s*=>|function\b)/);
  if (m && !dekl.has(m[1])) dekl.set(m[1], i + 1);
});

const treffer = [];
dekl.forEach((deklZeile, name) => {
  const re = new RegExp('\\b' + name.replace(/\$/g, '\\$') + '\\s*\\(');
  for (let i = 0; i < deklZeile - 1; i++) {
    const z = zeilen[i];
    if (/^\s*(\/\/|\*|\/\*)/.test(z)) continue;   // Kommentare ueberspringen
    if (re.test(z)) { treffer.push({ name, deklZeile, benutzt: i + 1, code: z.trim().slice(0, 90) }); break; }
  }
});

console.log('Helfer auf IIFE-Ebene mit Funktions-Wert: ' + dekl.size);
console.log('davon VOR der Deklaration aufgerufen:    ' + treffer.length);
treffer.forEach(t => {
  console.log('  ' + t.name + '  benutzt Z.' + t.benutzt + ', deklariert erst Z.' + t.deklZeile);
  console.log('      ' + t.code);
});
if (!treffer.length) console.log('  (keine — alle Helfer stehen vor ihrer ersten Verwendung)');
