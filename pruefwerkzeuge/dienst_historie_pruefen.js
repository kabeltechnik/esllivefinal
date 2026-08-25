'use strict';
// ============================================================================
//  HISTORIE JE PROJEKT IM DIENST-BETRIEB PRUEFEN (27.10.2026)
//  Unter dem Datendienst laeuft EIN Dashboard fuer Kabel, Mobile und UM. Die
//  Vortage muessen trotzdem je Projekt GETRENNT im Speicher liegen
//  ('rcEslHistory' / '_mob' / '_um', ebenso 'rcLigaHistDash...') — sonst
//  ueberschreibt ein Projekt das andere, lautlos. Angezeigt wird die
//  VEREINIGUNG: je Tag die Zahlen aller drei zusammen. Ohne Dienst-Marke muss
//  jede Zeile wie bisher laufen (ein Schluessel ueber rcKey).
//
//  Was dieses Werkzeug festhaelt:
//   1. Die neuen Bausteine stehen als FUNKTIONSDEKLARATION in v22 (TDZ-Regel).
//   2. rcProjSfx / rcHistSchluessel mit und ohne Marke.
//   3. rcEslTagVereinen / rcLigaTagVereinen (Summen, gleiche VO/CCS, nurCalls,
//      Eingaben unveraendert).
//   4. rcHistorieVereint / rcLoadEslHistory / Laden der Liga-Historie.
//   5. rcDienstHistorieAblegen: nur Vortage, eigener Projekt-Schluessel,
//      Ersetzungsregel, 40 Tage, Speicher voll — mit GEGENPROBE: ein Ablegen
//      ueber rcKey haette die Kabel-Historie ueberschrieben.
//   6. Selbst-Archivierung (Block aus processDataStream): mit Marke kein
//      setItem, die vereinte Historie bleibt (Ruling R4, mit Gegenprobe).
//   7. rcRepairEslHistory / rcSpeicherHistorieKappen / rcSpeicherWacht Stufe 1
//      je Projekt-Schluessel.
//   8. rcBereichPruefen reicht das Projekt an rcProjektPruefen weiter.
//   9. rcStandRows, Vortag-Zweig: detr null statt 0 bei nurCalls.
//  Echte Funktionen per Klammer-Zaehlung geschnitten (_stack_regel.js), mit
//  new Function in einer Huelle mit Spionen ausgewertet — kein Nachbau.
// ============================================================================
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const V22 = fs.readFileSync(path.join(DIR, 'esl_live_arena_v22.js'), 'utf8');
const BAUSTEIN = require('./_stack_regel.js');

let ok = 0, rot = 0;
function pruefe(name, bed, info) { if (bed) ok++; else rot++; console.log((bed ? 'OK   ' : 'ROT  ') + name + (info !== undefined && info !== '' ? '  (' + info + ')' : '')); }
function Q(kopf) {
  const t = BAUSTEIN.schneide(V22, kopf);
  if (!t) throw new Error('nicht gefunden: ' + kopf);
  return t;
}
function lade(quell, env, namen) {
  const k = Object.keys(env);
  return new Function(...k, quell + '\nreturn { ' + namen.join(', ') + ' };')(...k.map(n => env[n]));
}
function spion(impl) {
  const f = function (...a) { f.aufrufe.push(a); return impl ? impl.apply(this, a) : undefined; };
  f.aufrufe = [];
  return f;
}
// localStorage-Attrappe ueber eine Map; voll = setItem wirft wie ein voller Speicher.
function speicher(start) {
  const m = new Map(Object.entries(start || {}).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  const ls = {
    gesetzt: [], voll: false, map: m,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { ls.gesetzt.push(k); if (ls.voll) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    key: i => [...m.keys()][i],
    lies: k => (m.has(k) ? JSON.parse(m.get(k)) : undefined),
  };
  Object.defineProperty(ls, 'length', { get: () => m.size });
  return ls;
}
const MARKE = { basis: 'http://127.0.0.1:8787' };
// Ein Wurf mitten im Werkzeug (z. B. ein fehlender Schluessel nach einer Aenderung)
// muss als ROT zaehlen, nicht als stiller Absturz.
process.on('uncaughtException', e => { console.log('ABBRUCH: ' + (e && e.stack || e)); console.log((rot + 1) + ' fehlgeschlagen (Abbruch), ' + ok + ' bestanden'); process.exit(1); });
const pad = n => String(n).padStart(2, '0');
const isoTag = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const tagVor = n => isoTag(new Date(Date.now() - n * 86400000));
const HEUTE = isoTag(new Date()), GESTERN = tagVor(1), VORGESTERN = tagVor(2), TAG3 = tagVor(3), TAG10 = tagVor(10);
const kopie = x => JSON.parse(JSON.stringify(x));

console.log('== 1. Bausteine als Funktionsdeklaration ==');
const KOEPFE = ['function rcProjSfx(', 'function rcHistSchluessel(', 'function rcEslTagVereinen(', 'function rcLigaTagVereinen(',
  'function rcHistorieVereint(', 'function rcDienstHistorieAblegen('];
const fehlt = KOEPFE.filter(k => !new RegExp('^ {4}' + k.replace(/[()]/g, '\\$&'), 'm').test(V22));
if (fehlt.length) {
  console.log('ABBRUCH: Bausteine fehlen (oder nicht auf IIFE-Ebene): ' + fehlt.join(' '));
  console.log(fehlt.length + ' fehlgeschlagen (Abbruch), 0 bestanden');
  process.exit(1);
}
pruefe('alle sechs Bausteine stehen als Funktionsdeklaration auf IIFE-Ebene', true);

// Die Historien-Bausteine EINMAL geschnitten. rcBereichPruefen / rcAggregateMultiDayBuffer
// / rcKappeProdHistorie / rcTodayKey kommen je Fall als Attrappe aus env.
const HELFER = ['function rcZahlenAddieren('].filter(k => V22.indexOf(k) >= 0);
const HIST = ['function rcDienstModus(', 'function rcProjSfx(', 'function rcHistSchluessel(', ...HELFER, 'function rcEslTagVereinen(',
  'function rcLigaTagVereinen(', 'function rcHistorieVereint(', 'function rcLoadEslHistory(', 'function rcDienstHistorieAblegen('].map(Q).join('\n');
const NAMEN = ['rcDienstModus', 'rcProjSfx', 'rcHistSchluessel', 'rcEslTagVereinen', 'rcLigaTagVereinen', 'rcHistorieVereint', 'rcLoadEslHistory', 'rcDienstHistorieAblegen'];
function umgebung(o) {
  o = o || {};
  const env = {
    window: o.window || {},
    localStorage: o.ls || speicher(),
    rcKey: o.rcKey || (b => b),
    rcTodayKey: () => HEUTE,
    rcBereichPruefen: o.bereich || spion(b => b),
    rcAggregateMultiDayBuffer: o.agg || spion(() => ({})),
    rcKappeProdHistorie: o.kappe || spion(() => 0),
  };
  env.F = lade(o.quell || HIST, env, NAMEN);
  return env;
}

console.log('\n== 2. rcProjSfx / rcHistSchluessel ==');
{
  const e = umgebung({ rcKey: b => b + '_um' });
  pruefe('rcProjSfx: kabel "" / mobile "_mob" / um "_um"', e.F.rcProjSfx('kabel') === '' && e.F.rcProjSfx('mobile') === '_mob' && e.F.rcProjSfx('um') === '_um');
  pruefe('ohne Marke: EIN Schluessel ueber rcKey (wie bisher)', JSON.stringify(e.F.rcHistSchluessel('rcEslHistory')) === '["rcEslHistory_um"]', JSON.stringify(e.F.rcHistSchluessel('rcEslHistory')));
  e.window.__rcDienst = MARKE;
  pruefe('mit Marke: alle drei Projekt-Schluessel, unabhaengig von rcKey', JSON.stringify(e.F.rcHistSchluessel('rcLigaHistDash')) === '["rcLigaHistDash","rcLigaHistDash_mob","rcLigaHistDash_um"]', JSON.stringify(e.F.rcHistSchluessel('rcLigaHistDash')));
}

console.log('\n== 3. Tage vereinen ==');
{
  const F = umgebung().F;
  const a = { rows: 3, kontakte: 10, ansp: 4, bcr: 2, nonBcr: 1, bnt: 2, vvl: 1, srcDay: 'A',
    byStd: { AL: { kontakte: 10, ansp: 4, bcr: 2, nonBcr: 1, bnt: 2, vvl: 1 } },
    byAgent: { '100': { k: 6, a: 2, bcr: 1, bnt: 1, vvl: 0, mob: 1, kip: 0, ccs: '5001', nm: 'Agent A', pg: { 'KIP BNT': 1 }, pgB: { 'KIP BNT': 1 } },
               '101': { k: 4, a: 2, bcr: 1, bnt: 1, vvl: 1, mob: 0, kip: 1 } } };
  const b = { rows: 2, kontakte: 5, ansp: 1, bcr: 1, nonBcr: 0, bnt: 1, vvl: 0, srcDay: 'B',
    byStd: { AL: { kontakte: 3, ansp: 1, bcr: 1, nonBcr: 0, bnt: 1, vvl: 0 }, B: { kontakte: 2, ansp: 0, bcr: 0, nonBcr: 0, bnt: 0, vvl: 0 } },
    byAgent: { '100': { k: 3, a: 1, bcr: 1, bnt: 1, vvl: 0, mob: 0, kip: 1, ccs: '5001', nm: 'Agent A', pg: { 'KIP BNT': 1, 'Mobilfunk BNT': 2 }, pgB: { 'Mobilfunk BNT': 2 } },
               '200': { k: 2, a: 0, bcr: 0, bnt: 0, vvl: 0, mob: 0, kip: 0, pg: { 'PTV VVL': 1 }, pgB: {} } } };
  const aV = kopie(a), bV = kopie(b);
  const r = F.rcEslTagVereinen(a, b);
  pruefe('ESL: kontakte 10 + 5 = 15', r.kontakte === 15, r.kontakte);
  pruefe('ESL: rows/ansp/bcr/nonBcr/bnt/vvl summiert', r.rows === 5 && r.ansp === 5 && r.bcr === 3 && r.nonBcr === 1 && r.bnt === 3 && r.vvl === 1,
    [r.rows, r.ansp, r.bcr, r.nonBcr, r.bnt, r.vvl].join('/'));
  pruefe('ESL: byStd je Code summiert (AL 13, B 2)', r.byStd.AL.kontakte === 13 && r.byStd.AL.bnt === 3 && r.byStd.B.kontakte === 2, JSON.stringify(r.byStd));
  const g = r.byAgent['100'] || {};
  pruefe('ESL: gleiche VO -> k addiert (6 + 3 = 9), a/kip/mob addiert', g.k === 9 && g.a === 3 && g.kip === 1 && g.mob === 1, JSON.stringify(g));
  pruefe('ESL: gleiche VO -> pg/pgB addiert', JSON.stringify(g.pg) === JSON.stringify({ 'KIP BNT': 2, 'Mobilfunk BNT': 2 }) && JSON.stringify(g.pgB) === JSON.stringify({ 'KIP BNT': 1, 'Mobilfunk BNT': 2 }),
    JSON.stringify(g.pg) + ' ' + JSON.stringify(g.pgB));
  pruefe('ESL: ccs/nm bleiben Text (nicht verkettet)', g.ccs === '5001' && g.nm === 'Agent A', g.ccs + '/' + g.nm);
  pruefe('ESL: byAgent vereinigt (100, 101, 200)', Object.keys(r.byAgent).sort().join(',') === '100,101,200');
  pruefe('ESL: Eingabe-Objekte unveraendert', JSON.stringify(a) === JSON.stringify(aV) && JSON.stringify(b) === JSON.stringify(bV));
  r.byAgent['200'].pg['PTV VVL'] = 99; r.byStd.B.kontakte = 99; r.byAgent['101'].k = 99;
  pruefe('ESL: Ergebnis teilt keine Objekte mit den Eingaben (Projekt-Speicher bleibt heil)', JSON.stringify(a) === JSON.stringify(aV) && JSON.stringify(b) === JSON.stringify(bV));

  const la = { byStd: { AL: { calls: 9, csSum: 80, csN: 1, agents: 1 } }, tot: { calls: 12, agents: 2, det: 1 }, byAgent: { '5001': { c: 9, cs: 80 }, '5002': { c: 3 } } };
  const lb = { nurCalls: true, byStd: { AL: { calls: 5, agents: 1 }, B: { calls: 4, agents: 1 } }, tot: { calls: 9, agents: 2 }, byAgent: { '5001': { c: 5 }, '5003': { c: 4 } } };
  const laV = kopie(la), lbV = kopie(lb);
  const l1 = F.rcLigaTagVereinen(la, lb), l2 = F.rcLigaTagVereinen(lb, la);
  pruefe('Liga: gleiche CCS behaelt den Eintrag mit groesserem c (9 vor 5), in beiden Reihenfolgen',
    l1.byAgent['5001'].c === 9 && l1.byAgent['5001'].cs === 80 && l2.byAgent['5001'].c === 9, l1.byAgent['5001'].c + '/' + l2.byAgent['5001'].c);
  pruefe('Liga: nurCalls uebernommen, wenn EINES es traegt (beide Reihenfolgen)', l1.nurCalls === true && l2.nurCalls === true);
  pruefe('Liga: ohne nurCalls in beiden kein nurCalls', !F.rcLigaTagVereinen(la, { byAgent: { '9': { c: 1 } }, tot: {}, byStd: {} }).nurCalls);
  pruefe('Liga: byAgent vereinigt (5001, 5002, 5003)', Object.keys(l1.byAgent).sort().join(',') === '5001,5002,5003');
  pruefe('Liga: byStd/tot summiert (AL 14, B 4, tot 21)', l1.byStd.AL.calls === 14 && l1.byStd.B.calls === 4 && l1.tot.calls === 21 && l1.tot.agents === 4 && l1.tot.det === 1,
    JSON.stringify(l1.byStd) + ' ' + JSON.stringify(l1.tot));
  pruefe('Liga: Eingaben unveraendert', JSON.stringify(la) === JSON.stringify(laV) && JSON.stringify(lb) === JSON.stringify(lbV));
}

console.log('\n== 4. Vereinte Historie laden ==');
const aggK = { rows: 1, kontakte: 10, ansp: 1, bcr: 1, nonBcr: 0, bnt: 1, vvl: 0, byStd: { AL: { kontakte: 10 } }, byAgent: { '100': { k: 10 } } };
const aggM = { rows: 1, kontakte: 5, ansp: 0, bcr: 0, nonBcr: 0, bnt: 0, vvl: 0, byStd: { B: { kontakte: 5 } }, byAgent: { '200': { k: 5 } } };
{
  const ls = speicher({ rcEslHistory: { [VORGESTERN]: aggK }, rcEslHistory_mob: { [VORGESTERN]: aggM, [TAG3]: aggM }, rcEslHistory_um: '{kaputt',
    rcLigaHistDash: { [VORGESTERN]: { byAgent: { '5001': { c: 9 } }, tot: { calls: 9 }, byStd: {} } },
    rcLigaHistDash_mob: { [VORGESTERN]: { nurCalls: true, byAgent: { '5001': { c: 5 }, '5003': { c: 4 } }, tot: { calls: 9 }, byStd: {} }, [TAG3]: { byAgent: {}, tot: {}, byStd: {} } } });
  const e = umgebung({ ls, window: { __rcDienst: MARKE } });
  const h = e.F.rcHistorieVereint('rcEslHistory');
  pruefe('rcHistorieVereint(ESL): Tage aller Projekte, gleicher Tag summiert (10 + 5), kaputter UM-Schluessel stoert nicht',
    Object.keys(h).sort().join(',') === [TAG3, VORGESTERN].sort().join(',') && h[VORGESTERN].kontakte === 15 && h[TAG3].kontakte === 5, JSON.stringify(Object.keys(h)));
  const l = e.F.rcHistorieVereint('rcLigaHistDash');
  pruefe('rcHistorieVereint(Liga): nach Liga-Regel (CCS 5001 c 9, nicht 14; nurCalls)', l[VORGESTERN].byAgent['5001'].c === 9 && l[VORGESTERN].nurCalls === true && l[VORGESTERN].tot.calls === 18 && !!l[TAG3]);
  pruefe('rcLoadEslHistory mit Marke = die Vereinigung', JSON.stringify(e.F.rcLoadEslHistory()) === JSON.stringify(h));
  pruefe('Projekt-Speicher beim Vereinen unveraendert', ls.lies('rcEslHistory')[VORGESTERN].kontakte === 10 && ls.lies('rcEslHistory_mob')[VORGESTERN].kontakte === 5);
  const e2 = umgebung({ ls, rcKey: b => b + '_mob' });
  pruefe('rcLoadEslHistory OHNE Marke: genau der rcKey-Schluessel (wie bisher)', JSON.stringify(e2.F.rcLoadEslHistory()) === JSON.stringify(ls.lies('rcEslHistory_mob')));
  const e3 = umgebung({ ls, rcKey: b => b + '_um' });
  pruefe('rcLoadEslHistory OHNE Marke, kaputter Speicher -> {} (wie bisher)', JSON.stringify(e3.F.rcLoadEslHistory()) === '{}');

  // Laden der Liga-Historie beim Aufbau (eine Zeile auf IIFE-Ebene)
  const ZEILEN = V22.split('\n').filter(z => /window\.rcLigaHistory = .*localStorage\.getItem\(rcKey\('rcLigaHistDash'\)\)/.test(z));
  const ZEILE = ZEILEN[0] || '';
  pruefe('Liga-Laden steht genau EINMAL in v22', ZEILEN.length === 1, ZEILEN.length);
  const ligaLaden = (w, rk) => { const env = umgebung({ ls, window: w, rcKey: rk }); new Function('window', 'localStorage', 'rcKey', 'rcDienstModus', 'rcHistorieVereint', ZEILE)(env.window, ls, env.rcKey, env.F.rcDienstModus, env.F.rcHistorieVereint); return env.window.rcLigaHistory; };
  const wl = ligaLaden({ __rcDienst: MARKE });
  pruefe('Liga-Laden mit Marke: vereinte Liga-Historie aller Projekte', wl && wl[VORGESTERN] && wl[VORGESTERN].byAgent['5003'] && wl[TAG3] && wl[VORGESTERN].tot.calls === 18, wl ? Object.keys(wl).join(',') : 'leer');
  const wo = ligaLaden({ rcLigaHistory: { 'X': 1 } }, b => b);
  pruefe('Liga-Laden OHNE Marke: nur rcKey-Schluessel + Speicher der Seite (wie bisher)', wo && wo[VORGESTERN] && wo[VORGESTERN].byAgent['5001'].c === 9 && !wo[VORGESTERN].byAgent['5003'] && !wo[TAG3] && wo.X === 1, wo ? Object.keys(wo).join(',') : 'leer');
}

console.log('\n== 5. rcDienstHistorieAblegen ==');
const BUF = { puffer: 1 }, GEPRUEFT = { gepruefter: 1 };
const aggA = { rows: 2, kontakte: 10, ansp: 1, bcr: 1, nonBcr: 0, bnt: 1, vvl: 0, byStd: { B: { kontakte: 10 } }, byAgent: { '200': { k: 10 } }, srcDay: GESTERN };
const aggX = { rows: 9, kontakte: 999, ansp: 0, bcr: 0, nonBcr: 0, bnt: 0, vvl: 0, byStd: {}, byAgent: {}, srcDay: HEUTE };
function ablegenFall(o) {
  o = o || {};
  const kabelVorher = JSON.stringify({ [TAG3]: aggK });
  const ls = speicher(Object.assign({ rcEslHistory: kabelVorher }, o.start || {}));
  const heuteLive = { kontakte: 77, live: true, byStd: {}, byAgent: {} };
  const env = umgebung({ ls, quell: o.quell, window: { __rcDienst: MARKE, rcEslHistory: { [HEUTE]: heuteLive }, rcHistorieSpeicherFehler: spion() },
    bereich: spion(b => (o.verwerfen ? null : (b === BUF ? GEPRUEFT : b))), agg: spion(() => kopie(o.tage || { [GESTERN]: aggA, [HEUTE]: aggX })) });
  if (o.voll) ls.voll = true;
  const r = env.F.rcDienstHistorieAblegen(o.projekt || 'mobile', o.buf === undefined ? BUF : o.buf, o.liga === undefined ? { [GESTERN]: { nurCalls: true, byAgent: { '7': { c: 3 } }, tot: { calls: 3 }, byStd: {} }, [HEUTE]: { byAgent: {} } } : o.liga, o.von || TAG10, o.bis || HEUTE);
  return { env, ls, r, kabelVorher, heuteLive };
}
{
  const f = ablegenFall();
  pruefe('rcBereichPruefen bekommt Puffer, von, bis UND das Projekt', JSON.stringify(f.env.rcBereichPruefen.aufrufe) === JSON.stringify([[BUF, TAG10, HEUTE, 'mobile']]), JSON.stringify(f.env.rcBereichPruefen.aufrufe));
  pruefe('rcAggregateMultiDayBuffer liest den GEPRUEFTEN Puffer', f.env.rcAggregateMultiDayBuffer.aufrufe.length === 1 && f.env.rcAggregateMultiDayBuffer.aufrufe[0][0] === GEPRUEFT);
  const mob = f.ls.lies('rcEslHistory_mob') || {};
  pruefe('rcEslHistory_mob traegt NUR gestern (heute bleibt aussen vor)', JSON.stringify(Object.keys(mob)) === JSON.stringify([GESTERN]) && mob[GESTERN].kontakte === 10, JSON.stringify(Object.keys(mob)));
  pruefe('rcEslHistory (Kabel) unveraendert', f.ls.map.get('rcEslHistory') === f.kabelVorher);
  const w = f.env.window.rcEslHistory || {};
  pruefe('window.rcEslHistory: Kabel-Tag + Mobile-Tag + der vorher gesetzte Heute-Eintrag', w[TAG3] && w[TAG3].kontakte === 10 && w[GESTERN] && w[GESTERN].kontakte === 10 && w[HEUTE] === f.heuteLive,
    Object.keys(w).sort().join(','));
  const lm = f.ls.lies('rcLigaHistDash_mob') || {};
  pruefe('rcLigaHistDash_mob traegt NUR gestern', JSON.stringify(Object.keys(lm)) === JSON.stringify([GESTERN]) && lm[GESTERN].nurCalls === true, JSON.stringify(Object.keys(lm)));
  pruefe('window.rcLigaHistory = vereinte Liga-Historie', f.env.window.rcLigaHistory && f.env.window.rcLigaHistory[GESTERN] && f.env.window.rcLigaHistory[GESTERN].byAgent['7'].c === 3);
  pruefe('kein Liga-Schreiben in Kabel', f.ls.map.get('rcLigaHistDash') === undefined);
  pruefe('Rueckgabe {esl:{ok, tage:1}, liga:{ok, tage:1}}', f.r && f.r.esl && f.r.esl.ok === true && f.r.esl.tage === 1 && f.r.liga && f.r.liga.ok === true && f.r.liga.tage === 1, JSON.stringify(f.r));
  pruefe('alte Produktdetails werden auch hier gekappt (rcKappeProdHistorie)', f.env.rcKappeProdHistorie.aufrufe.length >= 1);

  // GEGENPROBE: dieselbe Funktion, aber ueber rcKey abgelegt (die Seite ist Kabel) —
  // das haette die Kabel-Historie ueberschrieben, und die Pruefung oben muss das sehen.
  const abl = Q('function rcDienstHistorieAblegen(');
  const altAbl = abl.split("'rcEslHistory' + rcProjSfx(projekt)").join("rcKey('rcEslHistory')");
  if (altAbl === abl) pruefe('Gegenprobe: Schluessel-Ausdruck \'rcEslHistory\' + rcProjSfx(projekt) im Ablegen gefunden', false);
  else {
    const g = ablegenFall({ quell: HIST.replace(abl, altAbl) });
    pruefe('GEGENPROBE: ein Ablegen ueber rcKey haette Kabel ueberschrieben (die Pruefung schlaegt dann an)', g.ls.map.get('rcEslHistory') !== g.kabelVorher && !!(g.ls.lies('rcEslHistory') || {})[GESTERN]);
  }

  const kab = ablegenFall({ projekt: 'kabel', liga: null });
  pruefe('Projekt kabel -> Schluessel rcEslHistory (ohne Zusatz), Liga null -> liga.ok false', !!(kab.ls.lies('rcEslHistory') || {})[GESTERN] && !!(kab.ls.lies('rcEslHistory') || {})[TAG3] && kab.r.liga.ok === false && kab.r.liga.tage === 0);
  const um = ablegenFall({ projekt: 'um' });
  pruefe('Projekt um -> Schluessel rcEslHistory_um', !!(um.ls.lies('rcEslHistory_um') || {})[GESTERN] && um.ls.map.get('rcEslHistory_mob') === undefined);

  const r1 = ablegenFall({ start: { rcEslHistory_mob: { [GESTERN]: Object.assign({}, aggA, { kontakte: 50 }) } }, tage: { [GESTERN]: Object.assign({}, aggA, { kontakte: 40 }) } });
  pruefe('Ersetzungsregel: alter Tag mit 50 Kontakten bleibt gegen neuen mit 40', ((r1.ls.lies('rcEslHistory_mob') || {})[GESTERN] || {}).kontakte === 50 && r1.r.esl.tage === 0, ((r1.ls.lies('rcEslHistory_mob') || {})[GESTERN] || {}).kontakte);
  const r2 = ablegenFall({ start: { rcEslHistory_mob: { [GESTERN]: Object.assign({}, aggA, { kontakte: 50 }) } }, tage: { [GESTERN]: Object.assign({}, aggA, { kontakte: 50, rows: 7 }) } });
  pruefe('...gleich viele Kontakte: der neue ersetzt (<=, wie rcRangeLoad)', ((r2.ls.lies('rcEslHistory_mob') || {})[GESTERN] || {}).rows === 7);
  const r3 = ablegenFall({ start: { rcEslHistory_mob: { [GESTERN]: Object.assign({}, aggA, { kontakte: 50 }) } }, tage: { [GESTERN]: Object.assign({}, aggA, { kontakte: 60 }) } });
  pruefe('...mehr Kontakte: der neue ersetzt', ((r3.ls.lies('rcEslHistory_mob') || {})[GESTERN] || {}).kontakte === 60);

  const alt40 = {};   // 40 alte Tage ab 2025-01-01, dazu kommt gestern = 41
  for (let i = 0; i < 40; i++) alt40['2025-' + pad(Math.floor(i / 28) + 1) + '-' + pad(i % 28 + 1)] = { kontakte: 1 };
  const r4 = ablegenFall({ start: { rcEslHistory_mob: alt40, rcLigaHistDash_mob: alt40 } });
  const k4 = Object.keys(r4.ls.lies('rcEslHistory_mob') || {}).sort(), l4 = Object.keys(r4.ls.lies('rcLigaHistDash_mob') || {}).sort();
  pruefe('41 Tage -> 40 bleiben (der aelteste faellt, gestern bleibt) — ESL', k4.length === 40 && k4.indexOf('2025-01-01') < 0 && k4.indexOf(GESTERN) >= 0, k4.length + ' / ' + k4[0]);
  pruefe('41 Tage -> 40 bleiben — Liga', l4.length === 40 && l4.indexOf('2025-01-01') < 0 && l4.indexOf(GESTERN) >= 0, l4.length);

  const r5 = ablegenFall({ von: VORGESTERN, bis: VORGESTERN, tage: { [TAG3]: aggA, [VORGESTERN]: aggA, [GESTERN]: aggA } });
  pruefe('nur Tage in [von, bis]', JSON.stringify(Object.keys(r5.ls.lies('rcEslHistory_mob') || {})) === JSON.stringify([VORGESTERN]));

  const r6 = ablegenFall({ verwerfen: true });
  pruefe('verworfener Puffer (fremdes Projekt / Seite statt Excel): esl.ok false mit Grund, nichts abgelegt, Liga trotzdem',
    r6.r.esl.ok === false && !!r6.r.esl.grund && r6.ls.map.get('rcEslHistory_mob') === undefined && r6.r.liga.ok === true && r6.env.rcAggregateMultiDayBuffer.aufrufe.length === 0, JSON.stringify(r6.r.esl));
  const r7 = ablegenFall({ buf: null });
  pruefe('ohne ESL-Datei: esl.ok false, nichts geprueft, Liga trotzdem', r7.r.esl.ok === false && r7.env.rcBereichPruefen.aufrufe.length === 0 && r7.r.liga.ok === true);
  const r8 = ablegenFall({ voll: true });
  pruefe('Speicher voll: rcHistorieSpeicherFehler (ESL + Liga), ok false, kein Wurf',
    r8.r.esl.ok === false && r8.r.liga.ok === false && r8.r.esl.tage === 0 && r8.r.liga.tage === 0 && r8.env.window.rcHistorieSpeicherFehler.aufrufe.length === 2, JSON.stringify(r8.r) + ' / ' + r8.env.window.rcHistorieSpeicherFehler.aufrufe.length);
  pruefe('...der Heute-Eintrag der Seite bleibt auch dann', r8.env.window.rcEslHistory[HEUTE] === r8.heuteLive);
}

console.log('\n== 6. Selbst-Archivierung (processDataStream) ==');
{
  const ENDE = "window.rcHistorieSpeicherFehler('Selbst-Archivierung heute', e); }";
  const iH = V22.indexOf('const hKey = now.getFullYear()');
  const iTry = V22.lastIndexOf('try {', iH);
  const iEnde = V22.indexOf(ENDE, iH);
  const ARCHIV = V22.slice(iTry, iEnde + ENDE.length);
  pruefe('Archiv-Block gefunden (try ... catch, mit histS[hKey])', iH > 0 && iTry > 0 && iEnde > iH && ARCHIV.length < 4000 && /histS\[hKey\] =/.test(ARCHIV), ARCHIV.length);
  const archiv = (o, quell) => {
    const ls = o.ls || speicher();
    const w = Object.assign({ rcHistorieSpeicherFehler: spion() }, o.window || {});
    const load = spion(() => kopie(o.vereint || {}));
    const kopf = 'function rcDienstModus(){ return !!(window.__rcDienst && window.__rcDienst.basis); }\n';
    new Function('window', 'localStorage', 'rcKey', 'rcLoadEslHistory', 'rcKappeProdHistorie', 'rcLog', 'now', 'pad2', 'sheetData',
      'gCalls', 'gPitches', 'gBcr', 'gNonBcr', 'gBnt', 'gVvl', 'byStdT', 'byAgentT', kopf + (quell || ARCHIV))(
      w, ls, b => b, load, () => 0, { warn: () => {} }, new Date(), pad, [['kopf'], [1], [2]],
      o.gCalls === undefined ? 30 : o.gCalls, 3, 2, 1, 1, 1, {}, {});
    return { ls, w, load };
  };
  const vereint = { [VORGESTERN]: { kontakte: 15 }, [TAG3]: { kontakte: 5 } };
  const a1 = archiv({ window: { __rcDienst: MARKE, rcEslHistory: kopie(vereint) } });
  pruefe('mit Marke: kein setItem', a1.ls.gesetzt.length === 0, JSON.stringify(a1.ls.gesetzt));
  pruefe('mit Marke: vereinte Historie bleibt, heute kommt dazu', a1.w.rcEslHistory[VORGESTERN] && a1.w.rcEslHistory[TAG3] && a1.w.rcEslHistory[HEUTE] && a1.w.rcEslHistory[HEUTE].kontakte === 30 && a1.w.rcEslHistory[HEUTE].live === true);
  const a2 = archiv({ window: { __rcDienst: MARKE }, vereint });
  pruefe('mit Marke beim Start (noch keine Historie in der Seite): rcLoadEslHistory liefert die Vereinigung (R4)',
    a2.load.aufrufe.length === 1 && a2.w.rcEslHistory[VORGESTERN] && a2.w.rcEslHistory[TAG3] && a2.w.rcEslHistory[HEUTE] && a2.ls.gesetzt.length === 0, Object.keys(a2.w.rcEslHistory || {}).join(','));
  const a3 = archiv({ window: { __rcDienst: MARKE, rcEslHistory: { [HEUTE]: { kontakte: 40 } } }, gCalls: 0 });
  pruefe('mit Marke: ein Rueckfall auf 0 ueberschreibt den Heute-Stand weiterhin nicht', a3.w.rcEslHistory[HEUTE].kontakte === 40);
  // GEGENPROBE R4: "window.rcEslHistory || {}" haette beim Start die ganze vereinte Historie verloren.
  const altR4 = ARCHIV.split('window.rcEslHistory || rcLoadEslHistory()').join('window.rcEslHistory || {}');
  if (altR4 === ARCHIV) pruefe('Gegenprobe R4: Ausdruck window.rcEslHistory || rcLoadEslHistory() im Block gefunden', false);
  else {
    const g = archiv({ window: { __rcDienst: MARKE }, vereint }, altR4);
    pruefe('GEGENPROBE R4: mit "|| {}" ginge beim Start die vereinte Historie verloren', !g.w.rcEslHistory[VORGESTERN] && !!g.w.rcEslHistory[HEUTE]);
  }
  const a4 = archiv({ ls: speicher({ rcEslHistory: { [VORGESTERN]: { kontakte: 3 } } }), window: { rcEslHistory: { 'nicht-gelesen': 1 } } });
  pruefe('OHNE Marke: liest und schreibt rcKey-Schluessel wie bisher', JSON.stringify(a4.ls.gesetzt) === '["rcEslHistory"]' && a4.ls.lies('rcEslHistory')[VORGESTERN].kontakte === 3 && a4.ls.lies('rcEslHistory')[HEUTE].kontakte === 30 && !a4.w.rcEslHistory['nicht-gelesen'] && a4.load.aufrufe.length === 0,
    JSON.stringify(a4.ls.gesetzt));
}

console.log('\n== 7. Reparatur und Speicher-Waechter je Projekt-Schluessel ==');
{
  const REP = Q('window.rcRepairEslHistory = function(');
  const rep = (w, ls, rk) => {
    const env = umgebung({ ls, window: w, rcKey: rk });
    new Function('window', 'localStorage', 'rcKey', 'rcTodayKey', 'rcLog', 'rcDienstModus', 'rcHistSchluessel', 'rcLoadEslHistory', REP + ';')(
      env.window, ls, env.rcKey, env.rcTodayKey, { log: () => {} }, env.F.rcDienstModus, env.F.rcHistSchluessel, env.F.rcLoadEslHistory);
    return env.window.rcRepairEslHistory();
  };
  const mapping = { voMap: { '100': { ccsId: 5001, name: 'Agent A' } }, ccsMap: {} };
  const heuteLive = { kontakte: 77, live: true, byAgent: {} };
  const ls = speicher({ rcEslHistory: { [VORGESTERN]: { kontakte: 1, byAgent: { '300': { k: 1 } } } }, rcEslHistory_mob: { [VORGESTERN]: { kontakte: 2, byAgent: { '100': { k: 2 } } } } });
  const kabelVorher = ls.map.get('rcEslHistory');
  const w = { __rcDienst: MARKE, rcWcaMapping: mapping, rcEslHistory: { [HEUTE]: heuteLive }, rcHistorieSpeicherFehler: spion() };
  const n = rep(w, ls);
  pruefe('Reparatur mit Marke: Mobile-Schluessel bekommt die CCS-ID', n === 1 && ls.lies('rcEslHistory_mob')[VORGESTERN].byAgent['100'].ccs === '5001', n);
  pruefe('...Kabel-Schluessel bleibt unberuehrt (keine vereinte Historie hineingeschrieben)', ls.map.get('rcEslHistory') === kabelVorher && ls.map.get('rcEslHistory_um') === undefined);
  pruefe('...window.rcEslHistory = vereinte Historie (beide Agenten) + Heute der Seite',
    w.rcEslHistory[VORGESTERN] && w.rcEslHistory[VORGESTERN].byAgent['100'] && w.rcEslHistory[VORGESTERN].byAgent['300'] && w.rcEslHistory[HEUTE] === heuteLive, Object.keys(w.rcEslHistory).join(','));
  const ls2 = speicher({ rcEslHistory: { [VORGESTERN]: { byAgent: { '100': { k: 2 } } } }, rcEslHistory_mob: { [VORGESTERN]: { byAgent: { '100': { k: 2 } } } } });
  const w2 = { rcWcaMapping: mapping };
  const n2 = rep(w2, ls2, b => b);
  pruefe('Reparatur OHNE Marke: nur der rcKey-Schluessel', n2 === 1 && ls2.lies('rcEslHistory')[VORGESTERN].byAgent['100'].ccs === '5001' && !ls2.lies('rcEslHistory_mob')[VORGESTERN].byAgent['100'].ccs && JSON.stringify(ls2.gesetzt) === '["rcEslHistory"]');
  pruefe('...window.rcEslHistory danach = der Speicher', w2.rcEslHistory && w2.rcEslHistory[VORGESTERN].byAgent['100'].ccs === '5001');
  // Review Fix-Runde 1 (Ruling R7): OHNE Marke repariert die Funktion wie vor Task 10 den
  // SPEICHER DER SEITE und schreibt ihn dann. Liegt die Seite vor dem Speicher (Harvester/
  // rcRangeLoad setzen window.rcEslHistory auch, wenn ihr setItem scheiterte: Speicher voll),
  // darf kein Tag der Seite verloren gehen, und alle muessen repariert sein.
  const ls7 = speicher({ rcEslHistory: { [VORGESTERN]: { byAgent: { '100': { k: 2 } } } } });
  ls7.voll = true;
  const w7 = { rcWcaMapping: mapping, rcHistorieSpeicherFehler: spion(),
    rcEslHistory: { [TAG3]: { byAgent: { '100': { k: 1 } } }, [VORGESTERN]: { byAgent: { '100': { k: 2 } } }, [HEUTE]: heuteLive } };
  const n7 = rep(w7, ls7, b => b);
  const h7 = w7.rcEslHistory || {};
  pruefe('Reparatur OHNE Marke, Seite vor dem Speicher + Speicher voll: alle Tage der Seite bleiben',
    [TAG3, VORGESTERN, HEUTE].every(t => !!h7[t]) && h7[HEUTE] === heuteLive, Object.keys(h7).sort().join(','));
  pruefe('...und sind repariert (CCS-ID an beiden Vortagen)', n7 === 2 && ((h7[TAG3] || {}).byAgent || {})['100'] && h7[TAG3].byAgent['100'].ccs === '5001' && ((h7[VORGESTERN] || {}).byAgent || {})['100'] && h7[VORGESTERN].byAgent['100'].ccs === '5001',
    n7 + ' / ' + JSON.stringify(h7[VORGESTERN]));
  pruefe('...der Schreibfehler wird gemeldet (Harvester), wie vorher', w7.rcHistorieSpeicherFehler.aufrufe.length === 1 && w7.rcHistorieSpeicherFehler.aufrufe[0][0] === 'Harvester');

  const KAPPEN = Q('function rcSpeicherHistorieKappen(');
  const kappen = (w, ls, rk) => {
    const env = umgebung({ ls, window: w, rcKey: rk });
    return new Function('localStorage', 'rcKey', 'pad2', 'rcHistSchluessel', KAPPEN + '\nreturn rcSpeicherHistorieKappen;')(ls, env.rcKey, pad, env.F.rcHistSchluessel)(60);
  };
  const altTag = { '2020-01-01': { kontakte: 1 }, [HEUTE]: { kontakte: 2 } };
  const ls3 = speicher({ rcEslHistory: altTag, rcEslHistory_mob: altTag, rcEslHistory_um: altTag, rcLigaHistDash: altTag, rcLigaHistDash_mob: altTag, rcLigaHistDash_um: altTag });
  const k3 = kappen({ __rcDienst: MARKE }, ls3);
  pruefe('Historie kappen mit Marke: alle sechs Projekt-Schluessel', k3 === 6 && ['rcEslHistory', 'rcEslHistory_mob', 'rcEslHistory_um', 'rcLigaHistDash', 'rcLigaHistDash_mob', 'rcLigaHistDash_um'].every(k => !ls3.lies(k)['2020-01-01'] && ls3.lies(k)[HEUTE]), k3);
  const ls4 = speicher({ rcEslHistory: altTag, rcEslHistory_mob: altTag, rcLigaHistDash_mob: altTag });
  const k4 = kappen({}, ls4, b => b + '_mob');
  pruefe('Historie kappen OHNE Marke: nur die rcKey-Schluessel', k4 === 2 && ls4.lies('rcEslHistory')['2020-01-01'] && !ls4.lies('rcEslHistory_mob')['2020-01-01'], k4);

  const WACHT = Q('function rcSpeicherWacht(');
  const wacht = (w, ls, rk) => {
    const env = umgebung({ ls, window: w, rcKey: rk });
    let frei = 0;
    const kappe = spion(h => { let n = 0; Object.keys(h).forEach(t => Object.keys(h[t].byAgent || {}).forEach(v => { if (h[t].byAgent[v].pg) { delete h[t].byAgent[v].pg; n++; } })); return n; });
    const r = new Function('localStorage', 'rcKey', 'rcHistSchluessel', 'rcKappeProdHistorie', 'rcSpeicherFrei', 'rcSpeicherBelegtKB', 'rcSpeicherFertig', 'rcLog', 'rcSpeicherHistorieKappen', 'window',
      'var RC_SP_LETZTE = 0, RC_SP_ABSTAND_MS = 600000, RC_SP_TAGE = 60;\n' + WACHT + '\nreturn rcSpeicherWacht;')(
      ls, env.rcKey, env.F.rcHistSchluessel, kappe, () => frei++ >= 1, () => 1, g => g, { warn: () => {} }, () => 0, env.window)(true);
    return r;
  };
  const mitPg = { [TAG10]: { byAgent: { '1': { pg: { x: 1 } } } } };
  const ls5 = speicher({ rcEslHistory: mitPg, rcEslHistory_mob: mitPg, rcEslHistory_um: mitPg });
  const g5 = wacht({ __rcDienst: MARKE }, ls5);
  pruefe('Speicher-Waechter Stufe 1 mit Marke: Produktdetails in allen drei ESL-Schluesseln', ['rcEslHistory', 'rcEslHistory_mob', 'rcEslHistory_um'].every(k => !ls5.lies(k)[TAG10].byAgent['1'].pg) && Array.isArray(g5) && /3 Produktdetails/.test(g5.join(' ')), JSON.stringify(g5));
  const ls6 = speicher({ rcEslHistory: mitPg, rcEslHistory_mob: mitPg });
  wacht({}, ls6, b => b + '_mob');
  pruefe('Speicher-Waechter Stufe 1 OHNE Marke: nur der rcKey-Schluessel', !ls6.lies('rcEslHistory_mob')[TAG10].byAgent['1'].pg && ls6.lies('rcEslHistory')[TAG10].byAgent['1'].pg && JSON.stringify(ls6.gesetzt) === '["rcEslHistory_mob"]', JSON.stringify(ls6.gesetzt));
}

console.log('\n== 8. rcBereichPruefen reicht das Projekt weiter ==');
{
  const BP = Q('function rcBereichPruefen(');
  const pruefer = spion(() => ({ urteil: 'ok', text: 't' }));
  const bp = new Function('rcReadSheet', 'rcProjektPruefen', 'rcEigenesProjektKey', 'rcLog', BP + '\nreturn rcBereichPruefen;')(
    () => ({ data: [['x']] }), pruefer, () => 'kabel', { warn: () => {} });
  const buf = new Uint8Array([0x50, 0x4b, 3, 4]).buffer;
  const r1 = bp(buf, 'a', 'b', 'mobile');
  const r2 = bp(buf, 'a', 'b');
  pruefe('mit Projekt: rcProjektPruefen("mobile", ...)', r1 === buf && pruefer.aufrufe[0][0] === 'mobile', pruefer.aufrufe[0] && pruefer.aufrufe[0][0]);
  pruefe('ohne Projekt: das eigene (rcEigenesProjektKey) wie bisher', r2 === buf && pruefer.aufrufe[1][0] === 'kabel', pruefer.aufrufe[1] && pruefer.aufrufe[1][0]);
}

console.log('\n== 9. rcStandRows, Vortag-Zweig: Detraktoren bei nurCalls ==');
{
  const iLig = V22.indexOf('const lig = (window.rcLigaHistory || {})[dayKey];');
  const iDetr = V22.indexOf('detr:', iLig);
  const zeile = V22.slice(iDetr, V22.indexOf('\n', iDetr));
  const ausdruck = zeile.replace(/^detr:\s*/, '').replace(/\/\/.*$/, '').trim().replace(/,$/, '');
  pruefe('Vortag-Zweig gefunden, detr liest v.dt/v.det', iLig > 0 && iDetr > iLig && iDetr - iLig < 8000 && /v\.dt/.test(ausdruck), ausdruck);
  let f = null; try { f = new Function('v', 'lig', 'return ' + ausdruck); } catch (e) { f = null; }
  pruefe('nurCalls und keine Detraktoren -> null (nicht 0)', !!f && f({ c: 3 }, { nurCalls: true }) === null);
  pruefe('ohne nurCalls -> 0 wie bisher', !!f && f({ c: 3 }, {}) === 0);
  pruefe('gelieferte Detraktoren bleiben (dt 2, det 1)', !!f && f({ dt: 2 }, { nurCalls: true }) === 2 && f({ det: 1 }, {}) === 1);
  const alt = new Function('v', 'lig', 'return (v.dt != null ? v.dt : (v.det != null ? v.det : 0))');
  pruefe('Gegenprobe: die alte Bauart liefert bei nurCalls eine falsche 0', alt({ c: 3 }, { nurCalls: true }) === 0);
}

console.log('');
console.log(rot ? rot + ' fehlgeschlagen, ' + ok + ' bestanden' : 'ALLE ' + ok + ' PRUEFUNGEN BESTANDEN');
process.exitCode = rot ? 1 : 0;
