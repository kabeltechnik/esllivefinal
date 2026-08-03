/* ============================================================================
   NEUANMELDUNG PRUEFEN
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/neuanmeldung_pruefen.js

   Prueft die automatische Neuanmeldung im Starter (ESL_Start.cmd) — vor allem
   den Teil, bei dem ein Fehler richtig teuer waere: MEHRERE FEHLANMELDUNGEN
   HINTEREINANDER KOENNEN EIN KONTO SPERREN.

   Geprueft wird die Struktur des Codes, nicht das Portal. Der eigentliche
   Ablauf laesst sich nur am echten System messen; hier geht es darum, dass die
   Schutzmechanismen ueberhaupt vorhanden und richtig verdrahtet sind.
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const CMD = path.join(__dirname, '..', 'ESL_Start.cmd');
let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}

console.log('NEUANMELDUNG PRUEFEN');
console.log('');

const s = fs.readFileSync(CMD, 'utf8');

console.log('1) Der Baustein existiert UND wird aufgerufen');
pruefe('EinAnmeldeVersuch ist definiert', /function EinAnmeldeVersuch\(\$ziel\)/.test(s));
// Genau hier lag der Fehler: die Funktion war da, wurde aber nirgends benutzt.
const aufrufe = (s.match(/EinAnmeldeVersuch \$t/g) || []).length;
pruefe('EinAnmeldeVersuch wird in der Dauerschleife aufgerufen', aufrufe >= 1,
  aufrufe + ' Aufrufe gefunden — ohne Aufruf passiert gar nichts (genau das war der Fehler)');

console.log('');
console.log('2) Die Dauerschleife laeuft wirklich dauerhaft');
pruefe('while ($true) statt fester Frist', /while \(\$true\) \{/.test(s),
  'Mit fester Frist waere der Waechter nach ein paar Minuten weg — die Sitzung faellt aber erst nach 2-3 h aus.');
pruefe('Takt ist gesetzt', /\$DauerTaktSek\s*=\s*\d+/.test(s));
pruefe('beendet sich, wenn Edge zu ist', /Keine Portal-Tabs mehr offen/.test(s),
  'Sonst laeuft das Fenster ewig ins Leere.');

console.log('');
console.log('3) Schutz gegen Kontosperre');
pruefe('Obergrenze je Zeitfenster vorhanden', /\$AnmeldungenMax\s*=\s*\d+/.test(s) && /\$AnmeldeFensterMin\s*=\s*\d+/.test(s));
pruefe('gezaehlt werden ABGESCHICKTE Anmeldungen', /\$tat -eq 'abgeschickt'[\s\S]{0,200}\$anmeldungen \+= \(Get-Date\)/.test(s),
  'Wuerde man Schleifendurchlaeufe zaehlen, waere das Kontingent verbraucht, ohne dass je etwas abgeschickt wurde.');
pruefe('altes Zeitfenster wird ausgesiebt', /Where-Object \{ \$_ -gt \$grenze \}/.test(s));
pruefe('nach Erreichen der Grenze wird aufgegeben', /\$aufgegeben = \$true/.test(s));
pruefe('bei neuer Sitzung wird der Schutz wieder scharf', /\$aufgegeben = \$false/.test(s),
  'Sonst bliebe der Waechter nach einer einmaligen Stoerung fuer immer stumm.');

console.log('');
console.log('4) Kein leeres Formular abschicken');
// Ein leerer Absendeversuch ist ein echter Fehlversuch und zaehlt auf das
// Sperr-Konto ein — ohne die geringste Aussicht auf Erfolg.
pruefe('ohne lesbares Passwort wird NICHTS gesendet', /return 'kein-passwort'/.test(s));
pruefe('gesendet wird nur bei user>0 UND pw>0', /\$st\.user -gt 0 -and \$st\.pw -gt 0/.test(s));

console.log('');
console.log('5) Kein Doppel-Absender');
pruefe('Besitzmarke wird vor dem Absenden gesetzt', /__rcLoginOwner=\{wer:"starter"/.test(s),
  'Sonst schickt der Autopilot in derselben Seite gleichzeitig ab — das war die Ursache der Mehrfach-Anlaeufe.');
const owner = (s.match(/__rcLoginOwner/g) || []).length;
pruefe('Marke wird an beiden Absendestellen gesetzt', owner >= 2, owner + ' Stellen');

console.log('');
console.log('6) Das Dashboard macht den Ausfall sichtbar');
const dash = fs.readFileSync(path.join(__dirname, '..', 'esl_live_arena_v22.js'), 'utf8');
pruefe('rcSessionBanner existiert', /function rcSessionBanner\(an\)/.test(dash));
pruefe('wird bei Sitzungsverlust gezogen', /rcSessionBanner\(true\)/.test(dash));
pruefe('haengt am Overlay (also ueber ALLEN Seiten)', /__rcOverlayEl \|\| document\.body/.test(dash),
  'showWarn allein zeichnet nur auf Cockpit/Management — die Rotation laeuft aber ueber Arena/Radar/Warteschleife.');
pruefe('wird beim Re-Inject abgeraeumt', /'rcQSay','rcSessionBanner'/.test(dash),
  'Sonst bliebe der Streifen nach erfolgreicher Neuanmeldung stehen.');

console.log('');
console.log('----------------------------------------------------');
console.log(fehler === 0
  ? 'ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN.'
  : fehler + ' von ' + geprueft + ' Pruefungen FEHLGESCHLAGEN.');
process.exit(fehler === 0 ? 0 : 1);
