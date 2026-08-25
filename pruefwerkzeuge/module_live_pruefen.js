/* ============================================================================
   LIVE-MODULE PRUEFEN (Etappe 9, 14.08.)
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/module_live_pruefen.js

   Nutzer-Vorgabe: "Ich brauche Module, wo ich Ansprache-Quote besser sehen
   kann" + mehr Diagramme. Drei neue Modultypen (live_ansprache, live_trend,
   live_funnel), dazu rcLigaAggScope (parametrisierter Kern von rcLigaAgg)
   und die rcKey-Trennung von rcDayTrend.

   Die eiserne Regel haengt am Nenner: OHNE Liga-Calls KEINE Quote — der
   ESL-Rueckfall hat die Ansprachequote frueher um Faktor ~8 verfaelscht.
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
// Einen MOD_TYPES-Eintrag ausschneiden (beginnt bei 'name:{', endet am Paar).
function schneideEintrag(name) {
  const i = SRC.indexOf(name + ':{label:');
  if (i < 0) return null;
  let tiefe = 0;
  for (let j = SRC.indexOf('{', i); j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') tiefe++;
    else if (c === '}') { tiefe--; if (tiefe === 0) return SRC.slice(i, j + 1); }
  }
  return null;
}

console.log('LIVE-MODULE PRUEFEN');
console.log('');

/* ---------------------------------------------------------------------------
   1) Registry-Mechanik
--------------------------------------------------------------------------- */
console.log('1) Registry-Mechanik');

pruefe('isLiveType prueft das live-Flag (Praefix nur Fallback)',
  /function isLiveType\(t\)\{ var T=MOD_TYPES\[t\]; if\(T&&T\.live===true\) return true;/.test(SRC),
  'Ohne Flag friert ein kuenftiger Live-Typ ohne live_-Praefix nach dem ersten Render ein.');
pruefe('alle drei neuen Typen tragen live:true',
  ['live_ansprache', 'live_trend', 'live_funnel'].every(n => {
    const e = schneideEintrag(n); return e && e.indexOf('live:true') !== -1;
  }));
pruefe('neuer Feldtyp std (Standort-Auswahl aus Live-Daten)',
  /type==='std'/.test(SRC) && /'std','Standort','std'/.test(SRC.replace(/\[/g, "'").replace(/\]/g, "'")) || /\['std','Standort','std'\]/.test(SRC));
pruefe('std-Feld kennzeichnet nicht gefundene Werte (Fallstrick 10)',
  /nicht in den aktuellen Daten/.test(schneide(SRC, 'function customFields(m,i)') || ''));
pruefe('D() liefert pitches je Standort (Zaehler der Ansprachequote)',
  /pitches:\(s\.pitches\|\|0\),total:\(s\.total\|\|0\)/.test(SRC));

/* ---------------------------------------------------------------------------
   2) rcLigaAggScope: EIN Rechenweg
--------------------------------------------------------------------------- */
console.log('');
console.log('2) rcLigaAggScope');

pruefe('rcLigaAggScope existiert und rcLigaAgg ist nur noch der Wrapper',
  /window\.rcLigaAggScope = function\(sc\)/.test(SRC) &&
  /window\.rcLigaAgg = function\(\)\{\s*return window\.rcLigaAggScope\(window\.rcActiveScope\(\)\);/.test(SRC),
  'Zwei getrennte Aggregationen waeren Fallstrick 8 (zwei Rechenwege fuer dieselbe Groesse).');
const aggFn = schneide(SRC, 'window.rcLigaAggScope = function(sc)');
pruefe('Scope-Pfad bleibt rcLigaInScope/rcLigaMeta (nie selbst filtern)',
  !!aggFn && aggFn.indexOf('rcLigaInScope(k, sc)') !== -1 && aggFn.indexOf('rcLigaMeta(k)') !== -1);

// FUNKTIONAL: mit gestubbtem window rechnen.
if (aggFn) {
  const w = {
    rcKpiData: {
      a1: { callCount: 100, standort: 'AL' },
      a2: { callCount: 50, standort: 'B' },
      a3: { callCount: 0, standort: 'AL' }
    },
    rcLigaInScope: (k, sc) => sc.std === 'ALL' || k.standort === sc.std,
    rcLigaMeta: k => ({ std: k.standort, team: 'T1' })
  };
  const f = new Function('window', aggFn.replace('window.rcLigaAggScope = ', 'return ') + ';')(w);
  const alle = f({ std: 'ALL' });
  pruefe('ALL-Scope summiert alle Calls (0-Call-Agenten fallen raus)',
    alle.total === 150 && alle.byStd.AL === 100 && alle.byStd.B === 50);
  const nurAl = f({ std: 'AL' });
  pruefe('Standort-Scope filtert ueber rcLigaInScope', nurAl.total === 100 && !nurAl.byStd.B);
}

/* ---------------------------------------------------------------------------
   3) live_ansprache: Quote NUR mit Liga-Nenner
--------------------------------------------------------------------------- */
console.log('');
console.log('3) live_ansprache funktional (Original-render)');

const anspE = schneideEintrag('live_ansprache');
pruefe('Eintrag laesst sich ausschneiden', !!anspE);
if (anspE) {
  const renderFn = schneide(anspE, 'render:function(m,d)');
  const H = { empty: t => 'LEER:' + t, rows: (l, f) => l.map(f).join(''), num: n => String(Math.round(n * 10) / 10).replace('.', ','), flag: c => c, std: c => c };
  const w = { rcLigaAggScope: sc => ({ byStd: { AL: 200 }, byTeam: {}, total: 200 }), rcChartFarbe: () => '#0068A0' };
  const render = new Function('window', 'H', 'esc', renderFn.replace('render:function', 'return function') + ';')(w, H, s => s);
  const d = { standorte: [ { code: 'AL', pitches: 50, calls: 300 }, { code: 'B', pitches: 20, calls: 100 } ] };
  const html = render({ std: 'ALL', ziel: 40 }, d);
  pruefe('AL mit Liga-Nenner 200 zeigt 25 %', html.indexOf('25 %') !== -1);
  pruefe('B OHNE Liga-Nenner zeigt Strich, KEINE Quote',
    html.indexOf('&mdash;') !== -1,
    'Der ESL-Rueckfall wuerde die Quote um Faktor ~8 verfaelschen (Nutzer-Entscheidung 07.08.).');
  pruefe('Zielmarke steht als eigener Balkenstrich drin', html.indexOf('left:40%') !== -1);
  pruefe('kein Math.random/Date.now im Render (zustandslos)',
    renderFn.indexOf('Math.random') === -1 && renderFn.indexOf('Date.now') === -1);
}

/* ---------------------------------------------------------------------------
   4) live_trend + live_funnel: zustandsloses SVG/HTML
--------------------------------------------------------------------------- */
console.log('');
console.log('4) live_trend + live_funnel');

const trendE = schneideEintrag('live_trend');
pruefe('live_trend rendert SVG-Polyline OHNE Canvas/rAF',
  !!trendE && trendE.indexOf('<svg') !== -1 && trendE.indexOf('polyline') !== -1 &&
  trendE.indexOf('canvas') === -1 && trendE.indexOf('requestAnimationFrame') === -1,
  'Canvas braucht Instanz-Lifecycle im 2-s-Takt; SVG ist zustandslos und hintergrund-sicher.');
pruefe('live_trend liest rcHourStats + rcDayTrend (Gestern gestrichelt)',
  !!trendE && trendE.indexOf('rcHourStats') !== -1 && trendE.indexOf('rcDayTrend') !== -1 && trendE.indexOf('stroke-dasharray') !== -1);
if (trendE) {
  const renderFn = schneide(trendE, 'render:function(m)');
  const H = { empty: t => 'LEER:' + t };
  const w = { rcHourStats: { labels: ['08','09','10'], totals: [2, 3, 1] }, rcDayTrend: { '2026-08-13': { b0: 1, b1: 4, b2: 5 }, '2026-08-14': { b0: 2 } } };
  const render = new Function('window', 'H', 'esc', renderFn.replace('render:function', 'return function') + ';')(w, H, s => s);
  const html = render({ gestern: 'ja' });
  pruefe('Trend kumuliert heute (2+3+1 = 6 BNT)', html.indexOf('6 BNT kumuliert') !== -1);
  pruefe('Gestern-Linie kommt aus dem VORLETZTEN Tag', html.indexOf('gestrichelt: gestern') !== -1);
  const ohneDaten = new Function('window', 'H', 'esc', renderFn.replace('render:function', 'return function') + ';')({}, H, s => s)({});
  pruefe('ohne Stundenverlauf ehrliche Leermeldung', ohneDaten.indexOf('LEER:') === 0);
}

const funnelE = schneideEintrag('live_funnel');
pruefe('live_funnel: drei Stufen Kontakte -> Ansprachen -> Abschluesse',
  !!funnelE && funnelE.indexOf('ESL-Kontakte') !== -1 && funnelE.indexOf('Ansprachen') !== -1 && funnelE.indexOf('Abschluesse') !== -1);
pruefe('live_funnel sagt ehrlich, dass Kontakte die ESL-Sicht sind',
  !!funnelE && funnelE.indexOf('nicht Liga-Calls') !== -1);

/* ---------------------------------------------------------------------------
   5) rcDayTrend projektgetrennt (Nebenbefund-Fix)
--------------------------------------------------------------------------- */
console.log('');
console.log('5) rcDayTrend auf rcKey (drei Projekte mischten ihre Kurven)');

pruefe('geschrieben wird unter rcKey',
  /localStorage\.setItem\(rcKey\('rcDayTrend'\), JSON\.stringify\(store\)\)/.test(SRC));
const leser = (SRC.match(/localStorage\.getItem\(rcKey\('rcDayTrend'\)\) \|\| localStorage\.getItem\('rcDayTrend'\)/g) || []).length;
pruefe('ALLE Lesestellen haben den Fallback auf den alten Schluessel (4 Stellen)',
  leser === 4, leser + ' gefunden — ohne Fallback verliert der Gestern-Vergleich einen Tag.');
pruefe('kein nacktes Schreiben auf den alten Schluessel mehr',
  !/localStorage\.setItem\('rcDayTrend'/.test(SRC));

/* ------------------------------------------------------------------------ */
console.log('');
if (fehler === 0) console.log('ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN');
else { console.log(fehler + ' von ' + geprueft + ' PRUEFUNGEN FEHLGESCHLAGEN'); process.exitCode = 1; }
