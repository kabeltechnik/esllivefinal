// ============================================================================
//  autopilot_menue_pruefen.js — "Nach dem ESL Login bleibt er beim Projekte
//                                stehen" (Nutzer-Befund 13.08./14.08.2026)
//
//  Der Autopilot oeffnete das Projekt-Menue und stand dann. Ursache war NICHT
//  in erster Linie, wie der Menueeintrag heisst, sondern die Bauart drumherum:
//
//    * eslFlow() laeuft GENAU EINMAL je Seitenaufbau (aus weiche()).
//    * Der Menue-Block ist mit once('openMenu') gegen Doppelklicks gesperrt.
//    * Findet until() den Eintrag in 8 s nicht, setzte es NUR einen Banner
//      und kehrte zurueck. Kein Wiederholversuch, keine Spur, kein Zaehler.
//
//  Damit war jeder Timeout endgueltig — die Fehlerklasse "stiller Stillstand
//  in Wartestellung" aus CLAUDE.md, hier im Autopiloten. Von aussen sah es aus
//  wie "die Datei schafft es nicht, sich durchzuklicken".
//
//  Dazu kam: der Banner unten rechts ist der EINZIGE Ort, an dem die Meldung
//  stand. Er wird von der naechsten Meldung ueberschrieben und verschwindet mit
//  der Seite. Wer spaeter nachsah, fand nichts.
//
//  Geprueft wird hier funktional an den ECHTEN Funktionen (per Klammer-Zaehlung
//  aus esl_autopilot.user.js geschnitten), gegen ein nachgestelltes PrimeFaces-
//  Menue. Mit Gegenprobe, dass die alte Bauart im selben Aufbau durchfaellt.
// ============================================================================
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const DATEIEN = {
  master: 'esl_autopilot.user.js',
  mobile: 'esl_autopilot_mobile.user.js',
  um:     'esl_autopilot_um.user.js'
};
const src = fs.readFileSync(path.join(WURZEL, DATEIEN.master), 'utf8');

let ok = 0, fehl = 0;
function pruef(name, bed, ist) {
  if (bed) { ok++; console.log('  ok   ' + name); }
  else { fehl++; console.log('  FEHL ' + name + (ist !== undefined ? '  -> ' + ist : '')); }
}
function schneide(s, kopf) {
  const i = s.indexOf(kopf);
  if (i < 0) return '';
  let tiefe = 0, start = s.indexOf('{', i);
  for (let j = start; j < s.length; j++) {
    if (s[j] === '{') tiefe++;
    else if (s[j] === '}') { tiefe--; if (!tiefe) return s.slice(i, j + 1); }
  }
  return '';
}

// ============================================================================
//  Nachgestelltes PrimeFaces-Menue. Sichtbarkeit wird ueber offsetParent/
//  offsetWidth/offsetHeight abgebildet — genau die Felder, die vis() liest.
// ============================================================================
function el(text, sichtbar, tag) {
  return {
    innerText: text, textContent: text, value: '',
    tagName: (tag || 'SPAN'),
    offsetParent: sichtbar ? {} : null,
    offsetWidth: sichtbar ? 140 : 0,
    offsetHeight: sichtbar ? 22 : 0
  };
}

// Baut eine lauffaehige Insel aus den ECHTEN Funktionen der Autopilot-Datei.
function sandkasten(eintraege) {
  const teile = [
    schneide(src, 'function norm(s)'),
    schneide(src, 'function vis(el)'),
    schneide(src, 'function menueEintraege()'),
    schneide(src, 'function menueFehlgeschlagen(soll)'),
    schneide(src, 'function until(test, act, timeoutMs, failMsg, onFail)')
  ];
  teile.forEach((t, i) => { if (!t) throw new Error('Funktion ' + i + ' nicht gefunden'); });

  const mSel = (src.match(/var MENUE_SEL = ('[^']+')/) || [])[1];
  const mMax = (src.match(/var MENUE_VERSUCHE_MAX = (\d+)/) || [])[1];
  if (!mSel || !mMax) throw new Error('MENUE_SEL / MENUE_VERSUCHE_MAX nicht gefunden');

  const spur = { banner: [], warn: [], timer: [], eslFlowGerufen: 0 };
  const fensterStub = {};
  const rumpf = `
    var MENUE_SEL = ${mSel};
    var MENUE_VERSUCHE_MAX = ${mMax};
    var menueVersuche = 0;
    var stop = false;
    var done = {};
    function banner(msg, col) { spur.banner.push({ msg: msg, col: col || '' }); }
    function eslFlow() { spur.eslFlowGerufen++; }
    ${teile.join('\n')}
    return {
      menueEintraege: menueEintraege,
      menueFehlgeschlagen: menueFehlgeschlagen,
      until: until,
      done: done,
      versuche: function(){ return menueVersuche; },
      max: MENUE_VERSUCHE_MAX
    };
  `;
  const doc = { querySelectorAll: () => eintraege };
  const konsole = {
    log(){}, warn(...a){ spur.warn.push(a.join(' ')); }, table(){}
  };
  const setT = (f, ms) => { spur.timer.push({ f: f, ms: ms }); return spur.timer.length; };
  const api = new Function('document', 'window', 'console', 'setTimeout', 'setInterval', 'clearInterval', 'spur', rumpf)
    (doc, fensterStub, konsole, setT, setInterval, clearInterval, spur);
  return { api, spur, fenster: fensterStub };
}

const SOLL = { name: 'Vodafone Kabel', datei: 'sis_vodafone.xhtml' };

// ============================================================================
console.log('\n-- 1. menueEintraege sieht das Menue so, wie byText es sieht --');
{
  const { api } = sandkasten([
    el('Vodafone Kabel', true), el('Vodafone Mobile', true), el('Vodafone UM', true),
    el('Verstecktes Projekt', false),
    el('  Vodafone   Kabel  ', true),                       // Leerraum-Variante -> gleiche Normalform
    el('X'.repeat(80), true)                                // Rumpftext eines ganzen Bereichs
  ]);
  const liste = api.menueEintraege();
  const sicht = liste.filter(e => e.sichtbar);
  pruef('sichtbare und unsichtbare Eintraege kommen beide in die Liste',
    liste.length === 4, JSON.stringify(liste.map(e => e.normalisiert)));
  pruef('  ... aber die Sichtbarkeit steht dran', sicht.length === 3, String(sicht.length));
  pruef('Leerraum wird zusammengezogen (Doppel faellt weg)',
    liste.filter(e => e.normalisiert === 'vodafone kabel').length === 1);
  pruef('  ... und der Rohtext bleibt lesbar erhalten',
    liste.some(e => e.text === 'Vodafone Kabel'));
  pruef('ueberlange Rumpftexte fallen heraus (>60 Zeichen)',
    !liste.some(e => e.normalisiert.length > 60));
  pruef('das versteckte Projekt ist dabei, aber als unsichtbar markiert',
    liste.some(e => e.normalisiert === 'verstecktes projekt' && !e.sichtbar));
}

// ============================================================================
console.log('\n-- 2. until() ruft onFail beim Timeout (vorher gab es das nicht) --');
{
  const { api } = sandkasten([]);
  let gefeuert = 0, actGelaufen = 0;
  api.until(function(){ return null; }, function(){ actGelaufen++; }, 30, null, function(){ gefeuert++; });
  const { api: api2 } = sandkasten([]);
  let gefeuert2 = 0, act2 = 0;
  api2.until(function(){ return 'da'; }, function(){ act2++; }, 30, null, function(){ gefeuert2++; });
  setTimeout(function(){
    pruef('bei Timeout laeuft onFail', gefeuert === 1, String(gefeuert));
    pruef('  ... und act() NICHT', actGelaufen === 0, String(actGelaufen));
    pruef('bei Erfolg laeuft act()', act2 === 1, String(act2));
    pruef('  ... und onFail NICHT', gefeuert2 === 0, String(gefeuert2));
    weiterMitTeil3();
  }, 900);
}

// ============================================================================
function weiterMitTeil3() {
  console.log('\n-- 3. Der Timeout im Menue ist nicht mehr das Ende --');
  // Fall A: Menue OFFEN, Eintrag heisst anders als erwartet.
  {
    const { api, spur, fenster } = sandkasten([
      el('Vodafone Kabel (VKD)', true), el('Vodafone Mobile', true)
    ]);
    api.menueFehlgeschlagen(SOLL);
    pruef('der Befund wird festgehalten (rcAutoMenueBefund)', !!fenster.rcAutoMenueBefund);
    pruef('  ... mit dem GESUCHTEN Text', fenster.rcAutoMenueBefund.gesucht === 'vodafone kabel',
      fenster.rcAutoMenueBefund.gesucht);
    pruef('  ... und dem, was wirklich dasteht',
      fenster.rcAutoMenueBefund.sichtbar.some(e => e.text === 'Vodafone Kabel (VKD)'));
    pruef('die Konsole nennt den Unterschied laut (warn, nicht log)',
      spur.warn.some(z => z.indexOf('NICHT im Menue gefunden') !== -1));
    pruef('ein Wiederholversuch wird eingeplant', spur.timer.length === 1, String(spur.timer.length));
    pruef('  ... und der Banner ist gelb (Zwischenstand), nicht rot',
      spur.banner.length && spur.banner[spur.banner.length - 1].col === '#FFB84D');
    // Das offene Menue darf nicht wieder zugeklickt werden.
    pruef('bei OFFENEM Menue bleibt openMenu gesperrt (kein zweiter Knopfdruck)',
      api.done.openMenu === 1, String(api.done.openMenu));
    pruef('  ... aber die Eintrags-Sperre wird geloest', api.done.menuProjekt === 0);
    // Der eingeplante Lauf ruft wirklich eslFlow.
    spur.timer[0].f();
    pruef('der eingeplante Versuch ruft eslFlow erneut', spur.eslFlowGerufen === 1, String(spur.eslFlowGerufen));
  }
  // Fall B: Menue ZU (nichts sichtbar) -> Knopf darf wieder geklickt werden.
  {
    const { api } = sandkasten([el('Vodafone Kabel', false), el('Vodafone Mobile', false)]);
    api.menueFehlgeschlagen(SOLL);
    pruef('bei GESCHLOSSENEM Menue wird openMenu freigegeben',
      api.done.openMenu === 0, String(api.done.openMenu));
  }
  // Fall C: Nach MENUE_VERSUCHE_MAX ist Schluss — aber laut und mit Anleitung.
  {
    const { api, spur } = sandkasten([el('Vodafone Kabel (VKD)', true)]);
    for (let i = 0; i < api.max; i++) api.menueFehlgeschlagen(SOLL);
    const letzter = spur.banner[spur.banner.length - 1];
    pruef('nach ' + api.max + ' Versuchen wird aufgegeben', api.versuche() === api.max, String(api.versuche()));
    pruef('  ... mit rotem Banner', letzter.col === '#FF6666', letzter.col);
    pruef('  ... der auf rcAutoWarum() verweist', letzter.msg.indexOf('rcAutoWarum()') !== -1, letzter.msg);
    pruef('  ... und die Zahl der sichtbaren Eintraege nennt', /1 sichtbare Eintr/.test(letzter.msg), letzter.msg);
    pruef('es wird KEIN weiterer Lauf mehr eingeplant (kein Dauerklicken)',
      spur.timer.length === api.max - 1, String(spur.timer.length));
  }

  // ==========================================================================
  console.log('\n-- 4. GEGENPROBE: die alte Bauart stirbt im selben Aufbau --');
  // Nachstellung des alten until() OHNE onFail — genau so stand es da.
  {
    let banner = 0, folge = 0;
    (function altesUntil(test, act, timeoutMs, failMsg) {
      const t0 = Date.now();
      const iv = setInterval(function () {
        let r = null; try { r = test(); } catch (e) { r = null; }
        if (r) { clearInterval(iv); act(r); }
        else if (Date.now() - t0 > timeoutMs) { clearInterval(iv); if (failMsg) banner++; }
      }, 20);
    })(function(){ return null; }, function(){ folge++; }, 60, 'nicht gefunden');
    setTimeout(function(){
      pruef('GEGENPROBE alte Fassung setzt nur einen Banner', banner === 1, String(banner));
      pruef('GEGENPROBE danach passiert NICHTS mehr (der Haenger)', folge === 0, String(folge));
      teil5();
    }, 400);
  }
}

// ============================================================================
function teil5() {
  console.log('\n-- 5. Verdrahtung am Code, in allen drei Fassungen --');
  const menueBlock = schneide(src, 'function eslFlow()');
  pruef('menueFehlgeschlagen haengt am Menue-until', /8000, null,\s*\n\s*function \(\) \{ menueFehlgeschlagen\(sollP\); \}/.test(menueBlock)
    || /menueFehlgeschlagen\(sollP\)/.test(menueBlock));
  // Zwei Suchen in eslFlow (Direkttreffer + Nachfassen im geoeffneten Menue),
  // die dritte steht in rcAutoWarum und MUSS denselben Selektor nehmen —
  // sonst misst das Diagnosewerkzeug etwas anderes als der Ablauf.
  pruef('beide Menue-Suchen in eslFlow benutzen denselben Selektor',
    (menueBlock.match(/byText\(MENUE_SEL,/g) || []).length === 2,
    String((menueBlock.match(/byText\(MENUE_SEL,/g) || []).length));
  pruef('  ... und rcAutoWarum misst mit genau demselben',
    /byText\(MENUE_SEL, soll\.name, true\)/.test(schneide(src, 'window.rcAutoWarum = function')));
  pruef('  ... der alte zweite Selektor ist weg',
    !src.includes("byText('span.ui-menuitem-text, a', sollP.name"));
  pruef('rote/gelbe Banner werden festgehalten', /window\.rcAutoLetzterFehler = \{ zeit/.test(src));
  pruef('  ... und als console.warn ausgegeben', /console\.warn\('\[Autopilot\] ' \+ msg\)/.test(src));

  Object.keys(DATEIEN).forEach(k => {
    const t = fs.readFileSync(path.join(WURZEL, DATEIEN[k]), 'utf8');
    pruef(k + ': rcAutoWarum vorhanden', /window\.rcAutoWarum = function/.test(t));
    pruef(k + ': menueFehlgeschlagen vorhanden', /function menueFehlgeschlagen\(soll\)/.test(t));
    pruef(k + ': until nimmt onFail', /function until\(test, act, timeoutMs, failMsg, onFail\)/.test(t));
    pruef(k + ': Startzeile nennt rcAutoWarum()', /rcAutoWarum\(\) . rcAutoStatus\(\)/.test(t));
  });
  // Die Varianten muessen ihr eigenes Projekt behalten — der Generator prueft
  // das zwar selbst, aber ein vergessener Lauf faellt sonst erst am Portal auf.
  const mob = fs.readFileSync(path.join(WURZEL, DATEIEN.mobile), 'utf8');
  const um = fs.readFileSync(path.join(WURZEL, DATEIEN.um), 'utf8');
  pruef('mobile-Variante zeigt weiterhin auf Vodafone Mobile', /sis_vodafone_mobile\.xhtml/.test(mob));
  pruef('um-Variante zeigt weiterhin auf Vodafone UM', /sis_vodafone_um\.xhtml/.test(um));

  console.log('\n  ' + ok + ' bestanden, ' + (fehl ? fehl + ' FEHLGESCHLAGEN.' : '0 fehlgeschlagen.') + '\n');
  process.exit(fehl ? 1 : 0);
}
