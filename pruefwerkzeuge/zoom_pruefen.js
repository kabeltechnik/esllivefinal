/* ============================================================================
   ZOOM PRUEFEN
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/zoom_pruefen.js

   Nutzer-Befund 14.08.: "Das Zoomen funktioniert nicht richtig." Vier belegte
   Ursachen, vier Gegenmittel — hier festgenagelt:
   1. Konfigurator-Regler rief rcApplyZoom OHNE die Automatik abzuschalten;
      der 400-ms-Resize-Horcher ueberschrieb den Handwert. Jetzt: rcZoomBy.
   2. Zwei Rundungsraster (Automatik 1/20, Hand 1/100) -> Dauer-Neusetzen.
      Jetzt: EIN Raster (1/20) in rcApplyZoom, funktional geprueft.
   3. Konfigurator-Panel/Toast/Badge skalierten nicht mit.
   4. .rc-radar>.rc-col{zoom:1.3} MULTIPLIZIERTE sich mit dem Fernsicht-Zoom.
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

console.log('ZOOM PRUEFEN');
console.log('');

/* ---------------------------------------------------------------------------
   1) Handregler schaltet die Automatik ab — an BEIDEN Bedienstellen
--------------------------------------------------------------------------- */
console.log('1) Handregler vs. Automatik');

pruefe('rcZoomBy ist am window exportiert (fuer den Konfigurator)',
  /window\.rcZoomBy = rcZoomBy/.test(SRC));
pruefe('rcZoomBy schaltet die Automatik ab',
  /const rcZoomBy = d => \{ try \{ localStorage\.setItem\('rcZoomAuto', '0'\);/.test(SRC));

// Auf die Handler-Zeilen eingrenzen (Regel 18: Block, nicht Datei).
const zoomM = SRC.match(/on\(q\('cfgZoomM'\),'click',function\(\)\{[^\n]*/);
const zoomP = SRC.match(/on\(q\('cfgZoomP'\),'click',function\(\)\{[^\n]*/);
pruefe('cfgZoomM ruft rcZoomBy (NICHT rcApplyZoom direkt)',
  !!zoomM && zoomM[0].indexOf('rcZoomBy') !== -1 && zoomM[0].indexOf('rcApplyZoom') === -1,
  'rcApplyZoom laesst die Automatik an — der Resize-Horcher ueberschreibt den Handwert.');
pruefe('cfgZoomP ruft rcZoomBy (NICHT rcApplyZoom direkt)',
  !!zoomP && zoomP[0].indexOf('rcZoomBy') !== -1 && zoomP[0].indexOf('rcApplyZoom') === -1);
pruefe('Konfigurator-Haken cfgZoomAuto wird beim Handgriff mit ausgeschaltet',
  !!zoomM && /za\.checked=false/.test(zoomM[0]) && !!zoomP && /za\.checked=false/.test(zoomP[0]),
  'Sonst zeigt der Haken AN, waehrend die Automatik laengst aus ist — das Anzeige-luegt-Muster (Fallstrick 10).');

/* ---------------------------------------------------------------------------
   2) EIN Rundungsraster — funktional
--------------------------------------------------------------------------- */
console.log('');
console.log('2) EIN Rundungsraster (1/20) — funktional am Original-Code');

const applyFn = schneide(SRC, 'window.rcApplyZoom = function(z, persist)');
pruefe('rcApplyZoom laesst sich ausschneiden', !!applyFn);
pruefe('rcApplyZoom rundet auf 1/20', !!applyFn && applyFn.indexOf('* 20) / 20') !== -1);
pruefe('das alte 1/100-Raster ist RAUS', !!applyFn && applyFn.indexOf('* 100) / 100') === -1);
pruefe('rcZoomAutoWert rundet ebenfalls auf 1/20',
  (schneide(SRC, 'function rcZoomAutoWert()') || '').indexOf('* 20) / 20') !== -1);

if (applyFn) {
  // Ausschnitt braucht: RC_ZOOM_MIN/MAX, window, document, localStorage, rAF.
  const quell = 'const RC_ZOOM_MIN = 1, RC_ZOOM_MAX = 3.0;\n' +
    applyFn.replace('window.rcApplyZoom = function', 'var apply = function') +
    ';\nreturn apply;';
  const props = {};
  // Die Beschriftung wird mitgeprueft: sie ist seit 14.08. abends die EINZIGE
  // Stelle, an der man sieht, ob die Automatik laeuft.
  const lblStub = { textContent: '', title: '', classList: { toggle: () => {} } };
  const docStub = { documentElement: { style: { setProperty: (k, v) => { props[k] = v; } } },
                    getElementById: id => (id === 'rcZoomLabel' ? lblStub : null) };
  const lsStub = { setItem: () => {}, getItem: () => null };
  let autoAn = true;
  const winStub = { rcZoomAutoAn: () => autoAn };
  const apply = new Function('window', 'document', 'localStorage', 'requestAnimationFrame', quell)(
    winStub, docStub, lsStub, function () {});
  apply(2.07, false);
  pruefe('2,07 wird auf 2,05 gerastert', winStub.rcZoom === 2.05, 'ist: ' + winStub.rcZoom);
  pruefe('bei laufender Automatik steht "Auto" in der Beschriftung',
    lblStub.textContent === 'Auto 205%', 'ist: ' + lblStub.textContent);
  autoAn = false;
  apply(1, false);
  pruefe('ohne Automatik steht NUR der Prozentwert da',
    lblStub.textContent === '100%', 'ist: ' + lblStub.textContent);
  pruefe('der Tooltip nennt den Weg zurueck zur Automatik',
    /Automatik wieder anschalten/.test(lblStub.title), 'ist: ' + lblStub.title);
  autoAn = true;
  apply(3.4, false);
  pruefe('3,4 wird auf die Obergrenze 3,0 geklemmt', winStub.rcZoom === 3);
  apply(0.5, false);
  pruefe('0,5 wird auf die Untergrenze 1 geklemmt', winStub.rcZoom === 1);
  pruefe('--rc-zoom wird am documentElement gesetzt', props['--rc-zoom'] === 1);
}
// Der Klick auf die Beschriftung war frueher ein hartes rcApplyZoom(1) — er
// liess die Automatik AN, die aber nur bei einem resize nachrechnet. Auf einem
// Wandmonitor aendert sich die Fenstergroesse nie: "100 %" war damit ein
// Zustand ohne Rueckweg, und genau so kam der Live-Befund "Einstellung steht
// auf 100 und trotzdem ist alles winzig" zustande.
pruefe('Klick auf die Beschriftung schaltet die Automatik um (kein hartes 100 %)',
  /rcZl\.addEventListener\('click', \(\) => \{\s*if \(window\.rcZoomAutoAn\(\)\)/.test(SRC)
  && /else window\.rcZoomAuto\(true\);/.test(SRC),
  'Sonst gibt es keinen sichtbaren Weg zurueck zur Automatik.');
pruefe('GEGENPROBE das alte rcApplyZoom(1) am Beschriftungs-Klick ist RAUS',
  !/rcZl\.addEventListener\('click', \(\) => window\.rcApplyZoom\(1\)\)/.test(SRC));
pruefe('Strg 0 schaltet die Automatik mit ab (sonst haelt die 100 % nicht)',
  /e\.key === '0'\).*rcZoomAuto','0'.*rcApplyZoom\(1\)/.test(SRC));
pruefe('rcZoomAuto zeichnet auch beim ABschalten neu (Beschriftung ehrlich)',
  /window\.rcApplyZoom\(an \? rcZoomAutoWert\(\) : \(window\.rcZoom \|\| 1\), false\)/.test(SRC));

/* ---------------------------------------------------------------------------
   2b) Vorgabe 100 % — Nutzer-Vorgabe 05.10.: "immer auf 100 % Zoom und nicht 150"
   Die Automatik ergab bei 1920 px 150 %; der Kopfleiste blieben 1280 px und das
   Werkzeug-Menue lag ausserhalb des Bildes (kopfleiste_pruefen.js).
--------------------------------------------------------------------------- */
console.log('');
console.log('2b) Vorgabe 100 %: Automatik ab Werk AUS, einmalige Umstellung');
{
  const anFn = schneide(SRC, 'window.rcZoomAutoAn = function()');
  const migFn = schneide(SRC, 'function rcZoomAufHundertMigrieren()');
  pruefe('rcZoomAutoAn und die Umstellung lassen sich ausschneiden', !!anFn && !!migFn);
  const speicher = init => { const o = Object.assign({}, init); return { o, getItem: k => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v); } }; };
  const autoAn = (ls, quell) => new Function('window', 'localStorage', (quell || anFn) + ';\nreturn window.rcZoomAutoAn();')({}, ls);
  if (anFn && migFn) {
    pruefe('nichts gespeichert: Automatik AUS', autoAn(speicher({})) === false);
    pruefe('ausdruecklich eingeschaltet ("1"): Automatik an', autoAn(speicher({ rcZoomAuto: '1' })) === true);
    pruefe('ausgeschaltet ("0"): aus', autoAn(speicher({ rcZoomAuto: '0' })) === false);
    pruefe('gesperrter Speicher (wirft): aus, kein Absturz', autoAn({ getItem: () => { throw new Error('gesperrt'); } }) === false);
    // GEGENPROBE: die Vorgabe bis 05.10. — alles ausser "0" galt als AN.
    const alt = anFn.replace("=== '1'; } catch(e){ return false; }", "!== '0'; } catch(e){ return true; }");
    pruefe('GEGENPROBE die alte Vorgabe laesst sich bauen und liefert ohne gespeicherten Wert AN',
      alt !== anFn && autoAn(speicher({}), alt) === true);

    const mig = ls => new Function('localStorage', migFn + '\nreturn rcZoomAufHundertMigrieren();')(ls);
    let ls = speicher({ rcZoomAuto: '1', rcZoom: '1.5' });
    pruefe('Umstellung: gespeicherte Automatik + 150 % werden auf "aus, 100 %" gestellt',
      mig(ls) === true && ls.o.rcZoomAuto === '0' && ls.o.rcZoom === '1' && ls.o.rcZoom100Migriert === '1', JSON.stringify(ls.o));
    ls.o.rcZoomAuto = '1'; ls.o.rcZoom = '1.25';      // der Nutzer stellt spaeter selbst um
    pruefe('  ... genau EINMAL: eine spaetere Einstellung des Nutzers bleibt stehen (Marke)',
      mig(ls) === false && ls.o.rcZoomAuto === '1' && ls.o.rcZoom === '1.25', JSON.stringify(ls.o));
    ls = speicher({});
    pruefe('  ... auch ohne gespeicherte Werte wird die Marke gesetzt', mig(ls) === true && ls.o.rcZoom100Migriert === '1');
    pruefe('  ... gesperrter Speicher: kein Absturz', mig({ getItem: () => { throw new Error('x'); }, setItem: () => {} }) === false);
    const iMig = SRC.indexOf('\n    rcZoomAufHundertMigrieren();');
    pruefe('die Umstellung laeuft VOR der ersten Abfrage der Automatik',
      iMig > 0 && iMig < SRC.indexOf('window.rcZoomAutoAn = function()'));
    pruefe('die Marke gehoert zur Komplett-Sicherung (sonst setzt ein Einspielen die Wahl des Nutzers zurueck)',
      /RC_SICHERN_PLAIN = \[[^\]]*'rcZoom100Migriert'/.test(SRC));
  }
  // Start-Block: der Horcher haengt IMMER, und auch 100 % wird gesetzt.
  const a = SRC.indexOf("window.addEventListener('resize', window.__rcZoomResize);");
  const b = SRC.indexOf('if (window.rcZoomAutoAn()) { window.rcApplyZoom(rcZoomAutoWert(), false); return; }');
  pruefe('der Resize-Horcher haengt IMMER (vor der Abfrage der Automatik)', a > 0 && b > a,
    'Sonst folgt eine spaeter eingeschaltete Automatik dem Fenster erst nach dem naechsten Neuladen.');
  const start = b > 0 ? SRC.slice(b, b + 700) : '';
  pruefe('auch 100 % wird GESETZT (--rc-zoom haengt am Dokument und ueberlebt einen Re-Inject)',
    /let z = 1; try \{ z = parseFloat\(localStorage\.getItem\('rcZoom'\)\) \|\| 1; \} catch\(e\)\{\}\s*\n\s*window\.rcApplyZoom\(z, false\);/.test(start));
  pruefe('GEGENPROBE die alte Abkuerzung "nur wenn ungleich 1" ist RAUS',
    !/if \(z && z !== 1\) window\.rcApplyZoom\(z, false\);/.test(SRC));
}

/* ---------------------------------------------------------------------------
   3) CSS: alles skaliert mit, nichts skaliert doppelt
--------------------------------------------------------------------------- */
console.log('');
console.log('3) CSS-Selektoren');

pruefe('Konfigurator-Panel skaliert mit UND ist hoehen-kompensiert',
  /#rcCfgPanel\{zoom: var\(--rc-zoom, 1\); height: calc\(100vh \/ var\(--rc-zoom, 1\)\) !important;\}/.test(SRC),
  'Ohne Kompensation laeuft das 100vh-Panel unten aus dem Bild.');
pruefe('Toast + Badge skalieren mit',
  /#rcToastContainer, #rcLiveBadge\{zoom: var\(--rc-zoom, 1\);\}/.test(SRC));
pruefe('der verschachtelte Radar-Zoom (zoom:1.3) ist RAUS',
  !/\.rc-radar > \.rc-col\{zoom:/.test(SRC),
  'zoom multipliziert sich: --rc-zoom 2.0 ergab effektiv 2.6 und die Spalten liefen ueber.');
pruefe('Radar-Panels haben stattdessen eine eigene Typo-Stufe',
  /\.rc-radar > \.rc-col\{font-size:/.test(SRC));
// Gegenprobe: kein weiteres NUMERISCHES zoom im Stylesheet (nur var(--rc-zoom)).
const numZoom = (SRC.match(/\{[^}]*zoom:\s*[0-9][^}]*\}/g) || [])
  .filter(r => r.indexOf('--rc-zoom') === -1);
pruefe('kein weiteres numerisches CSS-zoom (Multiplikations-Falle)',
  numZoom.length === 0, numZoom.slice(0, 3).join(' | '));

/* ---------------------------------------------------------------------------
   4) Token-Basis + Diagramm-Palette
--------------------------------------------------------------------------- */
console.log('');
console.log('4) Token-Basis + Diagramm-Palette (Politur-Fundament)');

// 16.08.: Flaechen-Leiter auf VIER Stufen erweitert und die Typo-Skala eine
// Stufe angehoben (Nutzer-Befund "sieht aus wie ein Atari-Spiel" — Karte und
// Leinwand lagen bei Kontrast ~1,2 und waren als Flaechen nicht zu trennen).
// Geprueft wird deshalb die EXISTENZ und die Ordnung der Stufen, nicht mehr
// ein einzelner Hexwert — der aendert sich mit jeder Politur.
pruefe('Flaechen-Leiter: canvas < surface < surface-2 < surface-3, alle definiert',
  ['--vf-canvas','--vf-surface','--vf-surface-2','--vf-surface-3']
    .every(t => new RegExp(t.replace(/-/g,'\\-') + ':#[0-9A-Fa-f]{6}').test(SRC)));
pruefe('Karte hebt sich sichtbar von der Leinwand ab (nicht mehr 1D1D1D auf 121212)',
  !/--vf-surface:#1D1D1D/.test(SRC) && !/--vf-canvas:#121212/.test(SRC));
pruefe('Typo-Skala --fs-* vorhanden und mindestens auf Fernsicht-Mass',
  /--fs-caption:1[1-9]px/.test(SRC) && /--fs-hero:[3-9][0-9]px/.test(SRC));
// VODAFONE_DESIGN.md §2: die Zustands-Semantik ist ausdruecklich NICHT
// monochrom. Bis 16.08. lieferte zielColor Weiss fuer "Ziel erreicht".
pruefe('Zustands-Semantik ist dreifarbig (ok/warn/breach unterscheidbar)',
  /--vf-ok:#3FBF57/.test(SRC) && /--vf-warn:#E9A33A/.test(SRC) && /--vf-breach:#FF5252/.test(SRC));
pruefe('Gegenprobe: ok ist nicht mehr Weiss (sonst traegt die Farbe keine Information)',
  !/--vf-ok:#F5F5F5/.test(SRC) && !/return '#F5F5F5'; if \(val >= ziel\.min\*0\.9\)/.test(SRC));
pruefe('RC_CHART_FARBEN = validierte 6er-Palette',
  /RC_CHART_FARBEN = \['#0068A0', '#647500', '#7D3572', '#0090B0', '#997A00', '#A32EA8'\]/.test(SRC));
pruefe('Standort-Slot-Bindung vorhanden (gleicher Standort = gleiche Farbe ueberall)',
  /RC_CHART_SLOTS = \{ AL: 0, B: 1, SER: 2, ADP: 3, E: 4, ZWT: 5 \}/.test(SRC));

const farbeFn = schneide(SRC, 'function rcChartFarbe(code, i)');
pruefe('rcChartFarbe laesst sich ausschneiden', !!farbeFn);
if (farbeFn) {
  const f = new Function(
    "const RC_CHART_FARBEN = ['#0068A0', '#647500', '#7D3572', '#0090B0', '#997A00', '#A32EA8'];" +
    "const RC_CHART_SLOTS = { AL: 0, B: 1, SER: 2, ADP: 3, E: 4, ZWT: 5 };" +
    "const RC_CHART_GRAU = '#9C9C9C';" + farbeFn + '; return rcChartFarbe;')();
  pruefe('AL bekommt immer Slot-Farbe #0068A0', f('AL') === '#0068A0' && f('AL', 4) === '#0068A0');
  pruefe('unbekannter Standort ohne Index faellt auf Grau', f('XX') === '#9C9C9C');
  pruefe('Index-Rotation fuer Nicht-Standort-Serien (7 % 6 = Slot 1)', f(null, 7) === '#647500');
}

/* ------------------------------------------------------------------------ */
console.log('');
if (fehler === 0) console.log('ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN');
else { console.log(fehler + ' von ' + geprueft + ' PRUEFUNGEN FEHLGESCHLAGEN'); process.exitCode = 1; }
