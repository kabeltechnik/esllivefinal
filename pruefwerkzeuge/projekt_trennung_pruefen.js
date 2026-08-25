/* ============================================================================
   PROJEKT-TRENNUNG PRUEFEN
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/projekt_trennung_pruefen.js

   Das ESL fuehrt drei Projekte auf DERSELBEN Domain (esl.regiocom.net):
       /Agents/secure/sis_vodafone.xhtml         Vodafone Kabel
       /Agents/secure/sis_vodafone_mobile.xhtml  Vodafone Mobile
       /Agents/secure%20/sis_vodafone_um.xhtml   Vodafone UM
   Der Browser-Speicher haengt am Origin, nicht an der Seite. Ohne Trennung
   wuerden drei parallel laufende Dashboards ihre Tages-Historien gegenseitig
   ueberschreiben — lautlos, mit plausibel aussehenden, aber gemischten Zahlen.

   Geprueft wird die Schluessel-Bildung (rcKey) fuer alle drei Projekte, dass
   Kabel seinen Schluessel OHNE Zusatz behaelt (sonst waere die vorhandene
   Historie nach dem Update weg), und dass die Autopilot-Varianten wirklich das
   jeweils richtige Projekt ansteuern.
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ORDNER = path.join(__dirname, '..');
let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}

console.log('PROJEKT-TRENNUNG PRUEFEN');
console.log('');

// ---------------------------------------------------------------------------
//  1. Schluessel-Bildung — der Code aus dem Dashboard, isoliert nachgestellt
// ---------------------------------------------------------------------------
function kuerzelFuer(pfad) {
  let datei = '';
  try { datei = decodeURIComponent(pfad || '').split('/').pop().toLowerCase(); }
  catch (e) { datei = String(pfad || '').split('/').pop().toLowerCase(); }
  return datei.indexOf('_mobile') !== -1 ? 'mob'
       : datei.indexOf('_um')     !== -1 ? 'um'
       : '';
}
function keyFuer(pfad, basis) {
  const k = kuerzelFuer(pfad);
  return k ? basis + '_' + k : basis;
}

const KABEL  = '/Agents/secure/sis_vodafone.xhtml';
const MOBILE = '/Agents/secure/sis_vodafone_mobile.xhtml';
const UM_ROH = '/Agents/secure%20/sis_vodafone_um.xhtml';   // wie im Portal
const UM_DEK = '/Agents/secure /sis_vodafone_um.xhtml';     // schon dekodiert

console.log('1) Jedes Projekt bekommt seinen eigenen Schluessel');
pruefe('Kabel behaelt den Schluessel OHNE Zusatz (Bestandsdaten bleiben)',
  keyFuer(KABEL, 'rcEslHistory') === 'rcEslHistory', keyFuer(KABEL, 'rcEslHistory'));
pruefe('Mobile bekommt _mob', keyFuer(MOBILE, 'rcEslHistory') === 'rcEslHistory_mob',
  keyFuer(MOBILE, 'rcEslHistory'));
pruefe('UM bekommt _um (Adresse MIT %20)', keyFuer(UM_ROH, 'rcEslHistory') === 'rcEslHistory_um',
  keyFuer(UM_ROH, 'rcEslHistory'));
pruefe('UM bekommt _um (Adresse schon dekodiert)', keyFuer(UM_DEK, 'rcEslHistory') === 'rcEslHistory_um',
  keyFuer(UM_DEK, 'rcEslHistory'));

console.log('');
console.log('2) Die drei Schluessel kollidieren nicht');
const alle = [KABEL, MOBILE, UM_ROH].map(p => keyFuer(p, 'rcEslHistory'));
pruefe('drei verschiedene Schluessel', new Set(alle).size === 3, alle.join(', '));

console.log('');
console.log('3) Kabel wird nicht faelschlich als Mobile/UM erkannt');
// "sis_vodafone.xhtml" enthaelt weder _mobile noch _um — der haeufigste
// Fehler waere hier ein zu grosszuegiger Vergleich (z.B. auf "vodafone").
pruefe('Kabel -> kein Kuerzel', kuerzelFuer(KABEL) === '', '"' + kuerzelFuer(KABEL) + '"');
pruefe('Anmeldeseite -> kein Kuerzel', kuerzelFuer('/Agents/login_esl.xhtml') === '');

// ---------------------------------------------------------------------------
//  4. Im Dashboard wirklich verdrahtet?
// ---------------------------------------------------------------------------
console.log('');
console.log('4) Das Dashboard benutzt die Schluessel-Funktion');
const dash = fs.readFileSync(path.join(ORDNER, 'esl_live_arena_v22.js'), 'utf8');
pruefe('rcKey ist definiert', /function rcKey\(basis\)/.test(dash));
pruefe('rcProjektKuerzel wird gesetzt', /window\.rcProjektKuerzel\s*=/.test(dash));
// EINE bewusste Ausnahme (06.08. spaetabends): rcExportReportingAlle MUSS die
// fremden Projekt-Schluessel lesen — rcKey liefert immer nur das eigene. Sie
// ist daran erkennbar, dass das Suffix der Projekt-Schleife angehaengt wird
// ('rcEslHistory' + p.sfx). Jeder ANDERE feste Zugriff bleibt verboten: genau
// so entstand die Vermischung der drei Projekte im Juli.
const alleRoh  = (dash.match(/\.(get|set|remove)Item\('rcEslHist[^)]*\)/g) || []);
const erlaubt  = alleRoh.filter(t => /\+\s*p\.sfx/.test(t));
const verboten = alleRoh.filter(t => !/\+\s*p\.sfx/.test(t));
pruefe('KEIN Speicherzugriff mehr am rcKey vorbei (ausser der Projekt-Schleife)',
  verboten.length === 0, verboten.join(' | '));
pruefe('die Ausnahme ist genau EINE Stelle (der Alle-Projekte-Export)',
  erlaubt.length === 1, erlaubt.join(' | '));
pruefe('GEGENPROBE: ein fester Zugriff OHNE Suffix wuerde auffliegen',
  (("x.getItem('rcEslHistory')").match(/\.(get|set|remove)Item\('rcEslHist[^)]*\)/g) || [])
    .filter(t => !/\+\s*p\.sfx/.test(t)).length === 1);
const ueber = (dash.match(/rcKey\('rcEslHistory'\)/g) || []).length;
pruefe('rcEslHistory laeuft ueber rcKey', ueber >= 8, ueber + ' Stellen');

// ---------------------------------------------------------------------------
//  5. Die Autopilot-Varianten
// ---------------------------------------------------------------------------
console.log('');
console.log('5) Die Autopilot-Varianten steuern das richtige Projekt an');
const VAR = [
  { d: 'esl_autopilot.user.js',        p: 'Vodafone Kabel',  s: 'sis_vodafone.xhtml' },
  { d: 'esl_autopilot_mobile.user.js', p: 'Vodafone Mobile', s: 'sis_vodafone_mobile.xhtml' },
  { d: 'esl_autopilot_um.user.js',     p: 'Vodafone UM',     s: 'sis_vodafone_um.xhtml' }
];
VAR.forEach(v => {
  const p = path.join(ORDNER, v.d);
  if (!fs.existsSync(p)) { pruefe(v.d + ' vorhanden', false, 'Datei fehlt — node autopilot_varianten_erzeugen.js'); return; }
  const s = fs.readFileSync(p, 'utf8');
  const pOk = new RegExp("PROJEKT:\\s*'" + v.p + "'").test(s);
  const sOk = new RegExp("PROJEKT_DATEI:\\s*'" + v.s.replace(/\./g, '\\.') + "'").test(s);
  const mOk = s.slice(0, 4000).indexOf('AUTOPILOT') !== -1;
  pruefe(v.d + ' -> ' + v.p, pOk && sOk && mOk,
    'Projekt=' + pOk + ' Seite=' + sOk + ' Marker=' + mOk);
});

console.log('');
console.log('6) Der Autopilot bleibt nicht auf dem falschen Projekt stehen');
const ap = fs.readFileSync(path.join(ORDNER, 'esl_autopilot.user.js'), 'utf8');
// v6 (06.08. abends): Die Handwahl des Nutzers entscheidet — der Autopilot
// FESTGENAGELT (06.08. spaetabends): jeder PC faehrt EIN Projekt, das Soll
// kommt aus der Starter-Marke. Der Dashboard-Start verlangt die RICHTIGE
// Seite; eine falsche geht ins Menue zurueck (geteilte Server-Sitzung warf
// Tabs sonst still auf das Projekt des Nachbar-PCs).
pruefe('Dashboard-Start nur auf der Soll-Projektseite (aufSollProjekt)',
  /if \(id\('filterForm'\) && aufSollProjekt\(\)\) \{[\s\S]{0,80}?pickExportView\(\);/.test(ap),
  'Sonst arbeitete das Dashboard auf dem Projekt des Nachbar-PCs weiter.');
pruefe('Menue-Eintrag wird EXAKT verglichen (Ziel aus sollProjekt)', /byText\([^)]*sollP\.name,\s*true\)/.test(ap),
  'Ein "enthaelt"-Vergleich koennte ein kuenftiges "Vodafone UM Care" faelschlich treffen.');
pruefe('Menue-Knopf hat einen Textfallback', /byText\('button, \.ui-button', 'projekte'\)/.test(ap));

console.log('');
console.log('----------------------------------------------------');
console.log(fehler === 0
  ? 'ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN.'
  : fehler + ' von ' + geprueft + ' Pruefungen FEHLGESCHLAGEN.');
process.exit(fehler === 0 ? 0 : 1);
