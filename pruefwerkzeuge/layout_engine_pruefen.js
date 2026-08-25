/* ============================================================================
   LAYOUT PRUEFEN (v3 "Docking", 16.08. abends)
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/layout_engine_pruefen.js

   Nutzer-Befund (16.08. abends, mit Screenshots): "Das mit dem DragAndDrop
   funktioniert irgendwie nicht. Da ist alles durcheinander. Alles! Alle
   Seiten sind durcheinander. Wenn ich da ein Modul nach oben verschieben
   will, dann verschieben sich alle anderen gleich mit."

   Belegte Ursache der v2: moveNative/breiteNative/hoeheNative schrieben
   CFG.lay[page].order/items, layEingerichtet() wurde dadurch wahr, und die
   GANZE Seite kippte vom gewachsenen Spalten-Layout ins flache 12er-Raster —
   das zeilenweise reiht und die Spalten-Optik prinzipbedingt nicht abbilden
   kann (Fallstrick 21). Ein einziger Pfeil-Klick ordnete also ALLE Karten
   neu. Dasselbe passierte, sobald EIN eigenes Modul auf der Seite lag.

   v3: Das Raster ist RAUS aus dem Betrieb. Verschieben = DOM-Verschieben im
   gewachsenen Layout (insertBefore), gespeichert wird je Karte Container-
   Index + Position (CFG.lay[page].dock). Die Werkzeuge hier schneiden die
   ECHTEN Funktionen aus und treiben sie in einem Mini-DOM — kein Nachbau.
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

console.log('LAYOUT v3 (DOCKING) PRUEFEN');
console.log('');

/* ---------------------------------------------------------------------------
   1) Das Raster ist wirklich raus (Gegenproben zur v2-Bauart)
--------------------------------------------------------------------------- */
console.log('1) Raster raus — die Kipp-Falle ist zu');

pruefe('KEIN .rc-lay-Raster mehr im CSS (display:grid; repeat(12,...))',
  !/\.rc-lay\{display:grid/.test(SRC));
pruefe('KEINE display:contents-Aufloesung der Spalten mehr',
  !/\{display:contents;\}/.test(SRC));
pruefe('rcLayAnwenden setzt die Klasse rc-lay NIE mehr (nur defensives remove)',
  !/classList\.toggle\('rc-lay'/.test(SRC) && /classList\.remove\('rc-lay'\)/.test(SRC));
pruefe('layEingerichtet (der Kipp-Schalter) ist ersatzlos entfernt',
  !/function layEingerichtet\(/.test(SRC));
pruefe('GEGENPROBE: die Entfernungs-Pruefung schluege an, kaeme er zurueck',
  /function layEingerichtet\(/.test(SRC + 'function layEingerichtet(p){'));
pruefe('layEinpassen/hskala-Stauchung ist raus (rcLayEinpassen nur noch Erklaer-Stub)',
  !/function layEinpassen\(/.test(SRC) && /rcLayEinpassen=function\(\)\{/.test(SRC.replace(/\s+/g,'')));
pruefe('Bearbeiten-Optik ist auf die drei Dock-Seiten gescoped (nicht mehr an .rc-lay gebunden)',
  /\.rc-lay-edit #rcPageArenaContent \.rc-card-header/.test(SRC) &&
  !/\.rc-lay-edit \.rc-lay \.rc-card-header/.test(SRC));
pruefe('Drag-Einstieg verlangt die Seiten-Hosts, nicht mehr .rc-lay',
  /card\.closest\(LAY_HOST_SEL\)/.test(SRC.replace(/\s+/g,' ').replace(/ : /g,':')) ||
  /closest ? card\.closest\(LAY_HOST_SEL\)/.test(SRC) || /card\.closest\(LAY_HOST_SEL\)/.test(SRC),
  'LAY_HOST_SEL-Einstieg fehlt');
pruefe('GEGENPROBE: die alte Einstiegs-Bedingung (card.closest(".rc-lay")) ist weg',
  !/card\.closest\('\.rc-lay'\)/.test(SRC));

/* ---------------------------------------------------------------------------
   2) Mini-DOM fuer die funktionalen Pruefungen
--------------------------------------------------------------------------- */
function El(tag, klassen, id) {
  this.tagName = (tag || 'div').toUpperCase();
  this.id = id || '';
  this._klassen = (klassen || []).slice();
  this.children = [];
  this.parentElement = null;
  this.style = {};
  this.dataset = {};
  this._attr = {};
  this._cs = { display: 'block', flexDirection: 'column', gridTemplateColumns: '' };
  const self = this;
  this.classList = {
    contains: c => self._klassen.indexOf(c) >= 0,
    add: c => { if (self._klassen.indexOf(c) < 0) self._klassen.push(c); },
    remove: c => { const i = self._klassen.indexOf(c); if (i >= 0) self._klassen.splice(i, 1); },
    toggle: (c, an) => { if (an === undefined) an = self._klassen.indexOf(c) < 0; if (an) self.classList.add(c); else self.classList.remove(c); return an; }
  };
}
El.prototype.appendChild = function (el) {
  if (el.parentElement) { const a = el.parentElement.children; const i = a.indexOf(el); if (i >= 0) a.splice(i, 1); }
  el.parentElement = this; this.children.push(el); return el;
};
El.prototype.insertBefore = function (el, ref) {
  if (!ref) return this.appendChild(el);
  if (el.parentElement) { const a = el.parentElement.children; const i = a.indexOf(el); if (i >= 0) a.splice(i, 1); }
  const j = this.children.indexOf(ref);
  if (j < 0) { this.children.push(el); } else { this.children.splice(j, 0, el); }
  el.parentElement = this; return el;
};
El.prototype.contains = function (el) { for (let e = el; e; e = e.parentElement) if (e === this) return true; return false; };
El.prototype.hasAttribute = function (n) { return n in this._attr; };
El.prototype.getAttribute = function (n) { return (n in this._attr) ? this._attr[n] : null; };
El.prototype.setAttribute = function (n, v) { this._attr[n] = String(v); };
El.prototype.getBoundingClientRect = function () { return this._rect || { left: 0, top: 0, width: 300, height: 200 }; };
El.prototype.querySelector = function (sel) { const r = this.querySelectorAll(sel); return r.length ? r[0] : null; };
El.prototype.querySelectorAll = function (sel) {
  // bewusst kleiner Matcher: '.klasse', '#id', kommagetrennt; ':not(...)' wird ignoriert
  const teile = String(sel).split(',').map(s => s.trim().replace(/:not\([^)]*\)/g, ''));
  const out = [];
  (function lauf(el) {
    el.children.forEach(k => {
      const trifft = teile.some(t =>
        (t[0] === '.' && k.classList.contains(t.slice(1))) ||
        (t[0] === '#' && k.id === t.slice(1)) ||
        (t[0] === '[' && k.hasAttribute(t.slice(1, t.indexOf(']')).split('=')[0])));
      if (trifft) out.push(k);
      lauf(k);
    });
  })(this);
  return out;
};
El.prototype.closest = function (sel) {
  const teile = String(sel).split(',').map(s => s.trim());
  for (let e = this; e; e = e.parentElement) {
    if (teile.some(t => (t[0] === '.' && e.classList.contains(t.slice(1))) || (t[0] === '#' && e.id === t.slice(1)))) return e;
  }
  return null;
};

function karte(key) {
  const k = new El('div', ['rc-card']);
  k.dataset.rcCfgkey = key;
  return k;
}

// Arena-artige Buehne: host mit 3 Spalten, Mitte traegt eine Zwischenreihe.
// Links steht ZUSAETZLICH ein Nicht-Karten-Band (wie das Motto-Band im Host).
function baueBuehne() {
  const doc = { _byId: {} };
  const host = new El('div', [], 'rcPageArenaContent');
  const colL = new El('div', ['rc-col']); host.appendChild(colL);
  const colM = new El('div', ['rc-col']); host.appendChild(colM);
  const colR = new El('div', ['rc-col']); host.appendChild(colR);
  const durch = new El('div', ['rc-lay-durch']); durch._cs = { display: 'flex', flexDirection: 'row', gridTemplateColumns: '' };
  const A = karte('arena:A'), B = karte('arena:B'), C = karte('arena:C');
  const D = karte('arena:D'), E = karte('arena:E'), F = karte('arena:F');
  const band = new El('div', ['rc-moti']);              // KEINE Karte
  colL.appendChild(A); colL.appendChild(band); colL.appendChild(B);
  colM.appendChild(durch); durch.appendChild(C); durch.appendChild(D);
  colM.appendChild(E);
  colR.appendChild(F);
  doc._byId.rcPageArenaContent = host;
  doc.getElementById = id => doc._byId[id] || null;
  doc.querySelector = () => null;                        // keine eigenen Module im Test
  doc.querySelectorAll = () => [];
  return { doc, host, colL, colM, colR, durch, A, B, C, D, E, F, band };
}

// Die ECHTEN Funktionen in einer Kapsel auswerten.
function baueEngine(b, cfgLay) {
  const CFG = { lay: cfgLay || {}, hidden: {}, titles: {}, custom: { arena: [] }, zone: {} };
  const gespeichert = { n: 0 };
  const body =
    'var PAGES=[["arena","Arena","rcPageArenaContent"]];' +
    'var CFG=__cfg; var editAn=false;' +
    'function save(){ __sp.n++; }' +
    'function renderBody(){}' +
    'function applyLayout(){}' +
    'function flipTausch(karten, tue){ tue(); }' +
    'function layZoom(){ return 1; }' +
    'function discover(page, contentId){ var root=document.getElementById(contentId); if(!root) return []; return root.querySelectorAll(".rc-card").filter(function(c){ var p=c.parentElement; return !(p&&p.closest&&p.closest(".rc-card")); }).map(function(c,i){ return { key:c.dataset.rcCfgkey, el:c, label:c.dataset.rcCfgkey }; }); }' +
    'var RC_LAY_HOEHE = [0, 130, 200, 290, 400, 560, 720];' +
    schneide(SRC, 'function layHost(') +
    schneide(SRC, 'function layKarten(') +
    'var DOCK_CONT_SEL=".rc-col, .rc-lay-durch, .rc-quali-grid, .rc-ck-2col, .rc-ck-3col, #rcMgmtBlocks";' +
    schneide(SRC, 'function dockContainers(') +
    schneide(SRC, 'function dockDaten(') +
    schneide(SRC, 'function dockEintrag(') +
    schneide(SRC, 'function dockErfassen(') +
    schneide(SRC, 'function dockAnwenden(') +
    'var LAY_MIN_H = 110;' +
    schneide(SRC, 'function laySetzeHoehe(') +
    schneide(SRC, 'function dockGroessen(') +
    schneide(SRC, 'function moveNative(') +
    'function zoneContainer(page,zone){ return __zc[zone]||null; }' +
    schneide(SRC, 'function zonesFor(') +
    schneide(SRC, 'function zoneVon(') +
    schneide(SRC, 'function zoneNative(') +
    schneide(SRC, 'function breiteNative(') +
    schneide(SRC, 'function hoeheNative(') +
    '; return { dockErfassen:dockErfassen, dockAnwenden:dockAnwenden, dockGroessen:dockGroessen, moveNative:moveNative, zoneNative:zoneNative, zoneVon:zoneVon, breiteNative:breiteNative, hoeheNative:hoeheNative, layKarten:layKarten, CFG:CFG };';
  const gcs = el => el._cs || { display: 'block', flexDirection: 'column', gridTemplateColumns: '' };
  const zc = { links: b.colL, mitte: b.colM, rechts: b.colR };
  return {
    api: new Function('document', 'getComputedStyle', '__cfg', '__sp', '__zc', 'window', body)(
      b.doc, gcs, CFG, gespeichert, zc, {}),
    CFG, gespeichert
  };
}

/* ---------------------------------------------------------------------------
   3) moveNative: EIN Pfeil bewegt EINE Karte — sonst nichts
--------------------------------------------------------------------------- */
console.log('');
console.log('3) moveNative — ein Modul wandert, der Rest bleibt stehen');
{
  const b = baueBuehne();
  const { api, CFG } = baueEngine(b);
  const vorherM = b.colM.children.slice(), vorherR = b.colR.children.slice();
  api.moveNative('arena', 'arena:B', 'up');
  pruefe('B wandert in seiner Spalte ueber das Band vor A',
    b.colL.children.indexOf(b.B) === 0 && b.colL.children.indexOf(b.A) === 1,
    'Reihenfolge links: ' + b.colL.children.map(c => c.dataset.rcCfgkey || '(band)').join(','));
  pruefe('das Nicht-Karten-Band bleibt in der Spalte erhalten',
    b.colL.children.indexOf(b.band) >= 0);
  pruefe('ANDERE Container bleiben unberuehrt (nichts "verschiebt sich mit")',
    b.colM.children.every((c, i) => c === vorherM[i]) && b.colR.children.every((c, i) => c === vorherR[i]));
  pruefe('CFG.lay.arena.order bleibt LEER (die v2-Kipp-Falle: order fuellte das Raster)',
    !(CFG.lay.arena && CFG.lay.arena.order && CFG.lay.arena.order.length),
    JSON.stringify(CFG.lay.arena && CFG.lay.arena.order));
  pruefe('stattdessen ist die Belegung als dock erfasst (alle 6 Karten)',
    CFG.lay.arena && CFG.lay.arena.dock && Object.keys(CFG.lay.arena.dock).length === 6,
    JSON.stringify(Object.keys((CFG.lay.arena || {}).dock || {})));
  api.moveNative('arena', 'arena:B', 'up');
  pruefe('am oberen Rand passiert nichts (kein Ueberlauf)',
    b.colL.children.indexOf(b.B) === 0);
  api.moveNative('arena', 'arena:C', 'down');
  pruefe('in einer REIHE wandert die Karte nach rechts (C hinter D)',
    b.durch.children.indexOf(b.C) === 1 && b.durch.children.indexOf(b.D) === 0);
}

/* ---------------------------------------------------------------------------
   4) dockErfassen/dockAnwenden: Reload stellt die Anordnung wieder her
--------------------------------------------------------------------------- */
console.log('');
console.log('4) dock — die verschobene Anordnung ueberlebt das Neuladen');
{
  const b = baueBuehne();
  const { api, CFG } = baueEngine(b);
  // Nutzer verschiebt: F aus rechter Spalte in die linke, E an den Anfang der Mitte.
  b.colL.insertBefore(b.F, b.A);
  b.colM.insertBefore(b.E, b.durch);
  api.dockErfassen('arena');
  const dock = CFG.lay.arena.dock;
  pruefe('Erfassen speichert Container + Position je Karte',
    dock['arena:F'] && dock['arena:F'].c >= 0 && dock['arena:E'] && dock['arena:E'].p === 0,
    JSON.stringify(dock));
  // "Neuladen": frische Buehne (Geruest-Reihenfolge), gespeicherte Daten anwenden.
  const b2 = baueBuehne();
  const eng2 = baueEngine(b2, JSON.parse(JSON.stringify(CFG.lay)));
  eng2.api.dockAnwenden('arena');
  pruefe('nach dem Anwenden steht F wieder VOR A in der linken Spalte',
    b2.colL.children.indexOf(b2.F) === 0 && b2.colL.children.indexOf(b2.A) === 1,
    'links: ' + b2.colL.children.map(c => c.dataset.rcCfgkey || '(band)').join(','));
  pruefe('E steht wieder VOR der Zwischenreihe in der Mitte',
    b2.colM.children.indexOf(b2.E) === 0,
    'mitte: ' + b2.colM.children.map(c => c.dataset.rcCfgkey || '(reihe)').join(','));
  pruefe('das Band behaelt seinen Platz zwischen den Karten (Index-Zaehlung ueber ALLE Kinder)',
    b2.colL.children.indexOf(b2.band) === 2,
    'links: ' + b2.colL.children.map(c => c.dataset.rcCfgkey || '(band)').join(','));
  // Idempotenz: ein zweiter Takt darf NICHTS mehr bewegen (kein Flackern).
  const lage = () => ['colL', 'colM', 'colR', 'durch'].map(n => b2[n].children.map(c => c.dataset.rcCfgkey || 'x').join(',')).join('|');
  const vor = lage();
  eng2.api.dockAnwenden('arena');
  pruefe('zweiter Durchlauf ist ein No-op (eingeschwungen, kein DOM-Geschiebe im 2-s-Takt)',
    lage() === vor);
  // Robustheit: Karte aus dem dock existiert nicht mehr (Code-Update) -> kein Wurf.
  eng2.CFG.lay.arena.dock['arena:WEG'] = { c: 1, p: 0, w: 0, h: -1 };
  let warf = false;
  try { eng2.api.dockAnwenden('arena'); } catch (e) { warf = true; }
  pruefe('ein dock-Eintrag ohne Karte (Code-Update) wirft nicht', !warf);
}

/* ---------------------------------------------------------------------------
   5) Groessen: Hoehe ueberall, Breite nur wo sie wirkt
--------------------------------------------------------------------------- */
console.log('');
console.log('5) Groessen — Hoehe als feste Stufe, Breite nur in Reihe/Raster');
{
  const b = baueBuehne();
  const { api, CFG } = baueEngine(b);
  api.hoeheNative('arena', 'arena:A', 1);
  const hA = CFG.lay.arena.dock['arena:A'].h;
  pruefe('hoeheNative schreibt eine Stufe in den dock-Eintrag', hA >= 1 && hA <= 6, 'h=' + hA);
  api.dockGroessen('arena');
  pruefe('die Karte bekommt eine feste Hoehe + flex "0 0 auto" (Spalte drueckt sie nicht platt)',
    /px$/.test(b.A.style.height || '') && b.A.style.flex === '0 0 auto',
    JSON.stringify(b.A.style));
  // Hoehe wieder auf "auto" (Stufe 0): die Inline-Werte muessen verschwinden.
  CFG.lay.arena.dock['arena:A'].h = 0;
  api.dockGroessen('arena');
  pruefe('Stufe 0 raeumt die Inline-Hoehe wieder ab',
    b.A.style.height === '' && b.A.style.flex === '');
  // Breite: in der SPALTE wirkungslos (v1-Falle "hoeher statt breiter"),
  // in der REIHE als Gewicht, im GRID als Span.
  api.breiteNative('arena', 'arena:B', 1);
  api.dockGroessen('arena');
  pruefe('Breite in einer SPALTE setzt KEIN flex-Gewicht (v1-Falle bleibt zu)',
    !b.B.style.flex || b.B.style.flex === '' || b.B.style.flex === '0 0 auto',
    'flex=' + b.B.style.flex);
  CFG.lay.arena.dock['arena:C'] = { c: -1, p: -1, w: 4, h: -1 };
  api.dockGroessen('arena');
  pruefe('Breite in einer REIHE (.rc-lay-durch) wird ein Flex-Gewicht',
    b.C.style.flex === '4 1 0px', 'flex=' + b.C.style.flex);
  b.durch._cs = { display: 'grid', flexDirection: 'row', gridTemplateColumns: '1fr 1fr 1fr' };
  CFG.lay.arena.dock['arena:C'].w = 9;
  api.dockGroessen('arena');
  pruefe('Breite im GRID wird ein Span und auf die Spurenzahl GEKAPPT (9 -> 3)',
    b.C.style.gridColumn === 'span 3', 'gridColumn=' + b.C.style.gridColumn);
}

/* ---------------------------------------------------------------------------
   6) Zonen: der "Platz"-Select wechselt die Spalte wirklich
--------------------------------------------------------------------------- */
console.log('');
console.log('6) Zonen — Platz-Wechsel ohne Drag');
{
  const b = baueBuehne();
  const { api, CFG } = baueEngine(b);
  pruefe('zoneVon erkennt links/mitte/rechts (kleinster Container gewinnt)',
    api.zoneVon('arena', b.A) === 'links' && api.zoneVon('arena', b.E) === 'mitte' && api.zoneVon('arena', b.F) === 'rechts',
    [api.zoneVon('arena', b.A), api.zoneVon('arena', b.E), api.zoneVon('arena', b.F)].join('/'));
  api.zoneNative('arena', 'arena:A', 'rechts');
  pruefe('zoneNative haengt die Karte in die Ziel-Spalte um',
    b.colR.children.indexOf(b.A) >= 0 && b.colL.children.indexOf(b.A) < 0);
  pruefe('der Wechsel ist im dock festgeschrieben',
    CFG.lay.arena.dock['arena:A'] && CFG.lay.arena.dock['arena:A'].c >= 0);
  const vorher = b.colR.children.slice();
  api.zoneNative('arena', 'arena:A', 'rechts');
  pruefe('gleiche Zone erneut waehlen ist ein No-op (kein Ans-Ende-Springen)',
    b.colR.children.every((c, i) => c === vorher[i]));
}

/* ---------------------------------------------------------------------------
   7) Migration: der Chaos-Bestand wird geraeumt, hidden/titles bleiben
--------------------------------------------------------------------------- */
console.log('');
console.log('7) Migration v3 — raeumt das ungewollte Raster, behaelt Ausblenden/Titel');
{
  const migrieren = new Function('c',
    schneide(SRC, 'var LAY_SLUG2ID = {').replace(/^var /, 'var ') + ';' +
    schneide(SRC, 'function layMigrieren(') + '; layMigrieren(c); return c;');
  // v2-Bestand: Raster-Daten gefuellt (genau der gemeldete Chaos-Zustand).
  const c1 = migrieren({
    layMigriert: 'v1',
    hidden: { 'arena:rcBattleTitle': true }, titles: { 'arena:rcBattleTitle': 'Mein Team' },
    order: {}, wh: {}, size: {}, zone: {},
    lay: { arena: { order: ['arena:x', 'arena:y'], items: { 'arena:x': { w: 2, h: 6 } } } }
  });
  pruefe('v1->v3: lay.order und lay.items werden GELEERT (das war "alles durcheinander")',
    c1.lay.arena.order.length === 0 && Object.keys(c1.lay.arena.items).length === 0);
  pruefe('hidden/titles ueberleben die Migration',
    c1.hidden['arena:rcBattleTitle'] === true && c1.titles['arena:rcBattleTitle'] === 'Mein Team');
  pruefe('Marker steht danach auf v3', c1.layMigriert === 'v3');
  const c1b = JSON.parse(JSON.stringify(c1));
  migrieren(c1b);
  pruefe('idempotent: ein zweiter Lauf aendert nichts', JSON.stringify(c1b) === JSON.stringify(c1));
  // Ur-Bestand (nie migriert): Slug-Schluessel muessen weiter uebersetzt werden.
  const c2 = migrieren({
    hidden: { 'arena:standort-battle': true }, titles: {}, order: { arena: ['arena:standort-battle'] },
    wh: {}, size: {}, zone: {}, lay: {}
  });
  pruefe('Ur-Bestand: Slug-Schluessel werden weiter auf Titel-ids uebersetzt',
    c2.hidden['arena:rcBattleTitle'] === true, JSON.stringify(Object.keys(c2.hidden)));
  pruefe('GEGENPROBE: ohne Uebersetzung stuende der Slug noch da',
    !c2.hidden['arena:standort-battle']);
}

/* ---------------------------------------------------------------------------
   8) Drag & Konfigurator: Verdrahtung (Text, mit Gegenproben)
--------------------------------------------------------------------------- */
console.log('');
console.log('8) Drag/Konfigurator — Verdrahtung');

const dragBlock = schneide(SRC, 'function dragMove(');
pruefe('Drag-Commit erfasst die sichtbare Lage (dockErfassen), statt eine order zu schreiben',
  /dockErfassen\(page\)/.test(dragBlock) && !/L\.order=reihenfolge/.test(dragBlock));
pruefe('Drag-Abbruch steckt die Karte physisch zurueck (startPar.insertBefore)',
  /startPar\.insertBefore\(card, startNext\)/.test(dragBlock));
pruefe('Einfuege-Haelfte folgt der Flussrichtung des Containers (Reihe: links/rechts, Spalte: oben/unten)',
  /flexDirection\.indexOf\('row'\)===0/.test(dragBlock) && /ev\.clientY < zr\.top\+zr\.height\/2/.test(dragBlock));
pruefe('Zoom-Teilung bleibt im Zug (Fallstrick 22a bewacht)',
  /\/z\)\+'px,'/.test(dragBlock.replace(/\s+/g, '')) || /var z=layZoom\(\);/.test(dragBlock));
pruefe('Ausnahme im Zug beendet die Geste (rcLayDragAktiv bleibt nicht haengen)',
  /catch\(err\)\{/.test(dragBlock) && /ende\(false\)/.test(dragBlock));
const groesseBlock = schneide(SRC, 'function dragGroesse(');
pruefe('Hoehen-Zug teilt weiter durch den Zoom (22a) und rastet auf Stufen',
  /\(startRect\.height\+\(ev\.clientY-startY\)\)\/zg/.test(groesseBlock) && /RC_LAY_HOEHE\[i\]-ziel/.test(groesseBlock));
pruefe('Breiten-Zug nimmt die Spurbreite aus dem ECHTEN Parent (nicht 12er-Annahme)',
  /gridTemplateColumns/.test(groesseBlock) && !/host\.getBoundingClientRect\(\)\.width\/12/.test(groesseBlock));
pruefe('Groessen-Commit schreibt in den dock-Eintrag',
  /dockEintrag\(page, meins\.key\)/.test(groesseBlock));
pruefe('Ost-Griff wird nur in Grid-Containern angebaut (griffeSetzen prueft display:grid)',
  /display==='grid'/.test(schneide(SRC, 'function griffeSetzen(')));

pruefe('Reset-Knopf im AUFBAU des Modul-Reiters', /id="cfgLayReset"/.test(SRC));
pruefe('Reset-Knopf im HANDLER (Zwei-Listen-Falle)', /q\('cfgLayReset'\),'click'/.test(SRC));
pruefe('rcLayReset (Konsole) existiert und raeumt CFG.lay je Seite',
  /window\.rcLayReset=function\(page\)/.test(SRC) && /CFG\.lay\[pg\]=\{\}/.test(SRC.replace(/\s+/g, '').replace(/CFG\.lay\[pg\]\)CFG/, 'CFG.lay[pg])CFG')) || /CFG\.lay\[pg\]\) CFG\.lay\[pg\]=\{\}/.test(SRC));
pruefe('eigene Module: ein verdocktes Modul wird nicht mehr in seine Zone zurueckgezwungen',
  /verdockt\(mod\) && el\.parentElement!==cont/.test(SRC.replace(/!verdockt/, 'verdockt')) || /!verdockt\(mod\) && el\.parentElement!==cont/.test(SRC));
pruefe('  ... und enforceOrder laesst verdockte Module in Ruhe',
  /enforceOrder\(page,list\.filter\(function\(mod\)\{ return !verdockt\(mod\); \}\)\)/.test(SRC));

/* ---------------------------------------------------------------------------
   9) Automatik-Block (16.08.): Aufbau UND Handler
--------------------------------------------------------------------------- */
console.log('');
console.log('9) Automatik-Schalter im Konfigurator');

[['cfgAutoLiga', 'Ligaliste selbst oeffnen'],
 ['cfgAutoLigaKlick', 'Liga-Abfrage automatisch'],
 ['cfgAutoPilot', 'Autopilot navigiert selbst'],
 ['cfgAutoGm', 'Genesys-Monitor selbst oeffnen']].forEach(function (p) {
  pruefe('Schalter "' + p[1] + '" im AUFBAU', new RegExp("swc\\('" + p[0] + "'").test(SRC));
  pruefe('Schalter "' + p[1] + '" im HANDLER', new RegExp("q\\('" + p[0] + "'\\),'change'").test(SRC));
});
pruefe('rcAutoKpiOff wird beim Start aus localStorage gelesen (persistent, nicht mehr nur Laufzeit)',
  /rcAutoKpiOff = \(function\(\)\{ try\{ return localStorage\.getItem\('rcLigaOeffnenAus'\)==='1'/.test(SRC));
pruefe('Liga-Klick-Schalter schickt RC_AUTO_KLICK ans Liga-Fenster',
  /postMessage\(\{ type:'RC_AUTO_KLICK', an:an \}/.test(SRC));
pruefe('Einmal-Sendung je Sitzung nach dem ersten Liga-Paket (nur die Abweichung vom Standard)',
  /__rcAutoKlickGesendet/.test(SRC) && /getItem\('rcLigaAutoAbfrage'\) === '0'/.test(SRC));
pruefe('Genesys-Ist-Wert fuer die Checkbox (rcQueueAutoQuelleIst)',
  /window\.rcQueueAutoQuelleIst = function\(\)\{ return !!CFG\.autoQuelle; \}/.test(SRC));
pruefe('Autopilot-Schalter schreibt denselben Schluessel, den der Autopilot liest (rcAutoManuell)',
  /localStorage\.setItem\('rcAutoManuell', e\.target\.checked\?'0':'1'\)/.test(SRC));

/* ------------------------------------------------------------------------ */
console.log('');
console.log('============================================================');
if (fehler === 0) console.log('  ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN');
else console.log('  ' + (geprueft - fehler) + ' bestanden, ' + fehler + ' FEHLGESCHLAGEN');
console.log('============================================================');
process.exitCode = fehler ? 1 : 0;
