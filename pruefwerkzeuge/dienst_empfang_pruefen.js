'use strict';
// ============================================================================
//  EMPFANG UND START IM DIENST-BETRIEB PRUEFEN (27.10.2026)
//  Unter dem Datendienst (http://127.0.0.1:8787) holt das Dashboard nichts
//  selbst: es liest alle 2 s /api/stand und speist NEUE Lieferungen ueber die
//  vorhandenen Eingaenge ein — ESL ueber rcProjektLieferung, Ligaliste ueber
//  handleKpiMessage, Vortage ueber rcDienstHistorieAblegen, Ereignisse ins
//  Logbuch. rcDienstGesehen/rcDienstErgebnis sind die Bruecke zu den Knoepfen
//  (rcDienstAbruf/-Runde/-Bereich aus Task 9 warten darauf).
//
//  Was dieses Werkzeug festhaelt:
//   1. Die neuen Bausteine stehen als FUNKTIONSDEKLARATION in v22 (TDZ-Regel).
//   2. Empfang funktional gegen einen Schein-Dienst (fetch aus einem Objekt,
//      Spione auf alle Eingaenge): erster Tick, Wiederholung, Fehl-Lieferung,
//      Liga ok/teil/fehler, Vortage, Ereignisse, Ausfall mit 20-s-Drossel,
//      403, Sperre, verwaiste Sperre, Fehler im Einspeisen.
//   3. Start: /api/projekt GENAU einmal, auch nach 5 Ticks; Takt 2 s.
//   4. Zusammenspiel mit den ECHTEN rcDienstAbruf/rcDienstRunde (Task 9).
//   5. rcMergeLigaHistory schreibt im Dienst-Betrieb NICHT in den Kabel-
//      Schluessel (sonst doppelte Zaehlung in der Vereinigung).
//   6. Start-Block (Promise.all ... then/catch) als BLOCK geschnitten und
//      ausgefuehrt: mit Marke Empfang statt Portal, ohne Marke wie bisher.
//   7. Warteschleifen-Boot ebenso; Clean-State raeumt Takt und Zustand ab.
//  Zu jeder Regel eine GEGENPROBE: die Quelle wird gezielt verdorben (Regel
//  entfernt) und die Pruefung muss dann durchfallen.
//  Echte Funktionen per Klammer-Zaehlung geschnitten (_stack_regel.js), mit
//  new Function in einer Huelle ausgewertet — kein Nachbau.
// ============================================================================
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const V22 = fs.readFileSync(path.join(DIR, 'esl_live_arena_v22.js'), 'utf8');
const BAUSTEIN = require('./_stack_regel.js');

let ok = 0, rot = 0;
function pruefe(name, bed, info) { if (bed) ok++; else rot++; console.log((bed ? 'OK   ' : 'ROT  ') + name + (info !== undefined && info !== '' ? '  (' + info + ')' : '')); }
function Q(kopf, src) {
  const t = BAUSTEIN.schneide(src || V22, kopf);
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
// Ersetzt GENAU eine Stelle (Gegenproben) — fehlt sie, ist die Gegenprobe wertlos.
function verdirb(src, alt, neu) {
  if (src.indexOf(alt) === -1) throw new Error('Gegenprobe: Stelle nicht gefunden: ' + alt);
  return src.replace(alt, neu);
}
const BASIS = 'http://127.0.0.1:8787';
const naechsterTakt = () => new Promise(r => setImmediate(r));
let fertig = false;
process.on('exit', () => { if (!fertig) { console.log('ABBRUCH: ein Schritt kam nie zurueck (haengt) nach ' + ok + ' bestandenen Pruefungen'); console.log((rot + 1) + ' fehlgeschlagen (haengt), ' + ok + ' bestanden'); process.exitCode = 1; } });

// ---- Schein-Dienst: Stand + Dateien aus einem Objekt --------------------------
function scheinDienst(stand, dateien) {
  const d = { stand, dateien: dateien || {}, aus: false, status: 0, haengt: null, urls: [], opts: [] };
  d.fetch = async (url, opt) => {
    d.urls.push(url); d.opts.push(opt || {});
    if (d.aus) throw new TypeError('Failed to fetch');
    const pfad = url.indexOf(BASIS) === 0 ? url.slice(BASIS.length) : url;
    const nein = st => ({ ok: false, status: st, json: async () => { throw new Error('kein JSON'); }, arrayBuffer: async () => { throw new Error('kein Inhalt'); } });
    if (pfad === '/api/stand') {
      if (d.haengt) await d.haengt;
      if (d.status) return nein(d.status);
      const s = JSON.parse(JSON.stringify(d.stand));
      return { ok: true, status: 200, json: async () => s };
    }
    if (!(pfad in d.dateien)) return nein(404);
    const v = d.dateien[pfad];
    return { ok: true, status: 200, json: async () => v, arrayBuffer: async () => v };
  };
  d.pfade = () => d.urls.map(u => u.slice(BASIS.length));
  return d;
}
const T0 = 1.7e12, T1 = T0 + 1000, T2 = T0 + 2000, T3 = T0 + 3000, T4 = T0 + 4000, T5 = T0 + 5000;
const BUF_K = new ArrayBuffer(8), BUF_U = new ArrayBuffer(9), BUF_V = new ArrayBuffer(10);
const leerProjekt = () => ({ nr: 0, zeit: 0, art: '', status: null, grund: '', bytes: 0 });
function grundStand() {
  return {
    nr: 4, aktiv: 'kabel', dienst: { start: T0, edge: 'eigen', flags: { zustand: '', fehlt: [] } },
    esl: { kabel: { nr: 1, zeit: T1, art: 'excel', status: null, grund: '', bytes: 8 }, mobile: leerProjekt(), um: leerProjekt() },
    liga: { nr: 1, zeit: T2, versuch: T2, art: 'ok', grund: '', vollstaendig: true, jeBaum: {} },
    vortage: {
      kabel: { nr: 1, zeit: T2, von: '2026-10-20', bis: '2026-10-26', esl: { art: 'excel', grund: '' }, liga: { art: 'ok', tage: 1, grund: '' } },
      mobile: { nr: 0, zeit: 0, von: '', bis: '', esl: { art: '', grund: '' }, liga: { art: '', tage: 0, grund: '' } },
      um: { nr: 0, zeit: 0, von: '', bis: '', esl: { art: '', grund: '' }, liga: { art: '', tage: 0, grund: '' } }
    },
    ereignisse: [{ nr: 1, zeit: T0, art: 'E', text: 'Dienst gestartet' }, { nr: 2, zeit: T0, art: 'W', text: 'Edge neu gestartet' }]
  };
}
const LIGA_TAGE = { '2026-10-25': { byAgent: { 4711: { c: 12 } }, nurCalls: true } };
function grundDateien() {
  return {
    '/api/esl/kabel.xlsx': BUF_K,
    '/api/liga.json': { zeit: T2, vollstaendig: true, payload: [{ ccsId: '4711', callCount: 12 }, { ccsId: '4712', callCount: 3 }] },
    '/api/vortage/kabel.xlsx': BUF_V,
    '/api/vortage/kabel.liga.json': LIGA_TAGE
  };
}

// ---- Clean-State-Block (Startzustand des Empfangs kommt aus v22) -------------
const iClean = V22.indexOf('// 2. CLEAN-STATE'), iCleanEnde = V22.indexOf('WACHHALTER (05.10.');
const CLEAN = iClean > 0 && iCleanEnde > iClean ? V22.slice(iClean, iCleanEnde) : '';
function cleanZuweisung(name) {
  const m = new RegExp('window\\.' + name + '\\s*=\\s*[^;]+;').exec(CLEAN);
  return m ? m[0] : '';
}
function frischGesehen() {
  const w = {};
  new Function('window', cleanZuweisung('rcDienstGesehen'))(w);
  return w.rcDienstGesehen;
}

// ---- Huelle um den echten Empfang ------------------------------------------
const EMPFANG = () => Q('async function rcDienstHole(') + '\n' + Q('async function rcDienstEmpfangTick(') + '\n' + Q('function rcDienstEmpfangStarten(');
function huelle(dn, opts) {
  opts = opts || {};
  const uhr = { jetzt: T0 + 60000 };
  const D = opts.Date || (function () { const F = function (...a) { return a.length ? new Date(...a) : new Date(uhr.jetzt); }; F.now = () => uhr.jetzt; return F; })();
  const W = Object.assign({ __rcDienst: { basis: BASIS }, rcAktivProjekt: 'kabel', rcDienstGesehen: frischGesehen(), rcDienstErgebnis: {}, rcKpiLastUpdate: null, rcLigaStoerung: null }, opts.W || {});
  const ord = [];
  const s = {
    ord,
    lieferung: spion(opts.lieferung || ((p) => { ord.push('esl:' + p); return { ok: true, zeilen: 5, text: 'r-' + p }; })),
    // Wie das echte handleKpiMessage: ein Paket setzt die Empfangszeit (jetzt) und raeumt die Stoerung.
    kpi: spion(d => {
      ord.push('kpi:' + d.type);
      if (d.type === 'KPI_BATCH') { W.rcKpiLastUpdate = new Date(uhr.jetzt); W.rcLigaStoerung = null; }
      if (d.type === 'KPI_QUELLE_TOT') W.rcLigaStoerung = { grund: d.grund, zeit: d.zeit };
      return true;
    }),
    ablegen: spion(() => { ord.push('vortage'); return { esl: { ok: true, tage: 2, grund: '' }, liga: { ok: true, tage: 1 } }; }),
    fehl: spion(), warn: spion(m => ord.push('warn')), log: spion(), ereignis: spion(m => ord.push('ereignis')),
    anfrage: spion(opts.anfrage || (async () => ({ ok: true }))), setInterval: spion(() => 77), clearInterval: spion()
  };
  W.rcLogEreignis = s.ereignis;
  const env = Object.assign({
    window: W, fetch: dn.fetch, Date: D, rcProjektLieferung: s.lieferung, handleKpiMessage: s.kpi, rcDienstHistorieAblegen: s.ablegen,
    rcEslFehlschlag: s.fehl, rcLog: { warn: s.warn, log: s.log, error: s.warn }, rcDienstAnfrage: s.anfrage,
    setInterval: s.setInterval, clearInterval: s.clearInterval
  }, opts.env || {});
  const F = lade((opts.quell || EMPFANG()) + (opts.zusatz || ''), env, ['rcDienstEmpfangTick', 'rcDienstEmpfangStarten', 'rcDienstHole'].concat(opts.namen || []));
  return { F, W, s, uhr, D };
}
const nurTyp = (s, typ) => s.kpi.aufrufe.map(a => a[0]).filter(d => d.type === typ);

(async () => {
  // ==========================================================================
  console.log('\n-- 1. Die neuen Bausteine stehen als Funktionsdeklaration in v22 --');
  // ==========================================================================
  const NEU = ['async function rcDienstHole(', 'async function rcDienstEmpfangTick(', 'function rcDienstEmpfangStarten('];
  NEU.forEach(k => pruefe('steht als Deklaration: ' + k.replace(/^async /, '').replace(/\($/, ''), V22.indexOf(k) !== -1));
  const fehlt = NEU.filter(k => V22.indexOf(k) === -1);
  pruefe('kein const/let-Gegenstueck (TDZ)', !/(const|let)\s+(rcDienstHole|rcDienstEmpfangTick|rcDienstEmpfangStarten)\s*=/.test(V22));
  pruefe('Clean-State setzt rcDienstGesehen / rcDienstErgebnis / rcDienstEmpfangLaeuft zurueck',
    !!cleanZuweisung('rcDienstGesehen') && !!cleanZuweisung('rcDienstErgebnis') && !!cleanZuweisung('rcDienstEmpfangLaeuft'));
  if (fehlt.length || !cleanZuweisung('rcDienstGesehen')) throw new Error('Bausteine fehlen: ' + fehlt.join(', '));

  // ==========================================================================
  console.log('\n-- 2. Empfang gegen einen Schein-Dienst --');
  // ==========================================================================
  {
    const dn = scheinDienst(grundStand(), grundDateien());
    const H = huelle(dn), { F, W, s } = H;
    await F.rcDienstEmpfangTick();
    pruefe('Startzustand aus dem Clean-State: esl/liga/vortage/ereignis/postfach bei 0',
      JSON.stringify(frischGesehen()) === JSON.stringify({ esl: { kabel: 0, mobile: 0, um: 0 }, liga: 0, ligaZeit: 0, vortage: { kabel: 0, mobile: 0, um: 0 }, ereignis: 0, postfach: 0 }), JSON.stringify(frischGesehen()));
    pruefe('erster Abruf: GET basis + /api/stand, gleiche Herkunft, ohne Cache, mit Abbruch-Signal',
      dn.urls[0] === BASIS + '/api/stand' && dn.opts[0].credentials === 'same-origin' && dn.opts[0].cache === 'no-store' && !!dn.opts[0].signal && !dn.opts[0].method, dn.urls[0]);
    const lf = s.lieferung.aufrufe;
    pruefe('erster Tick: Kabel eingespeist — rcProjektLieferung(kabel, {art:excel, buf, zeit aus dem Stand})',
      lf.length === 1 && lf[0][0] === 'kabel' && lf[0][1].art === 'excel' && lf[0][1].buf === BUF_K && lf[0][1].zeit === T1, JSON.stringify(lf.map(a => [a[0], a[1].art, a[1].zeit])));
    pruefe('...Mobile/UM mit nr 0 nicht angefasst (keine Datei geholt)', !dn.pfade().some(p => /esl\/(mobile|um)/.test(p)), dn.pfade().join(' '));
    pruefe('rcDienstErgebnis.kabel = {nr, r} (r = Rueckgabe von rcProjektLieferung)',
      W.rcDienstErgebnis.kabel && W.rcDienstErgebnis.kabel.nr === 1 && W.rcDienstErgebnis.kabel.r && W.rcDienstErgebnis.kabel.r.text === 'r-kabel', JSON.stringify(W.rcDienstErgebnis));
    pruefe('rcDienstGesehen.esl = {kabel:1, mobile:0, um:0}', JSON.stringify(W.rcDienstGesehen.esl) === JSON.stringify({ kabel: 1, mobile: 0, um: 0 }));
    const b = nurTyp(s, 'KPI_BATCH');
    pruefe('Liga als KPI_BATCH: Nutzlast der Datei, vollstaendig, liveDaterange intraday',
      b.length === 1 && b[0].payload.length === 2 && b[0].payload[0].ccsId === '4711' && b[0].vollstaendig === true && b[0].liveDaterange === 'intraday', JSON.stringify(b));
    pruefe('...ohne history (rcMergeLigaHistory wird ueber den Empfang nicht erreicht) und ohne Projekt-Kennung',
      b.length === 1 && !('history' in b[0]) && !('projekt' in b[0]));
    pruefe('rcKpiLastUpdate = stand.liga.zeit (Lieferzeit, nicht Empfangszeit)', W.rcKpiLastUpdate instanceof Date && W.rcKpiLastUpdate.getTime() === T2, W.rcKpiLastUpdate && W.rcKpiLastUpdate.getTime());
    pruefe('rcDienstGesehen.liga = 1', W.rcDienstGesehen.liga === 1);
    const ab = s.ablegen.aufrufe;
    pruefe('Vortage Kabel: rcDienstHistorieAblegen(kabel, buf, ligaTage, von, bis)',
      ab.length === 1 && ab[0][0] === 'kabel' && ab[0][1] === BUF_V && ab[0][2] === LIGA_TAGE && ab[0][3] === '2026-10-20' && ab[0][4] === '2026-10-26', JSON.stringify(ab.map(a => [a[0], !!a[1], a[3], a[4]])));
    pruefe('rcDienstGesehen.vortage.kabel = 1', W.rcDienstGesehen.vortage.kabel === 1);
    pruefe('Ereignis W -> rcLog.warn mit [Dienst]', s.warn.aufrufe.some(a => a[0] === '[Dienst] Edge neu gestartet'), JSON.stringify(s.warn.aufrufe));
    pruefe('Ereignis E -> rcLogEreignis mit [Dienst]', s.ereignis.aufrufe.length === 1 && s.ereignis.aufrufe[0][0] === '[Dienst] Dienst gestartet', JSON.stringify(s.ereignis.aufrufe));
    pruefe('rcDienstGesehen.ereignis = 2', W.rcDienstGesehen.ereignis === 2);
    pruefe('Reihenfolge: ESL -> Liga -> Vortage -> Ereignisse', s.ord.join(',') === 'esl:kabel,kpi:KPI_BATCH,vortage,ereignis,warn', s.ord.join(','));
    pruefe('rcDienstLage: zuletztOk gesetzt, kein Fehler; kein rcEslFehlschlag', W.rcDienstLage && W.rcDienstLage.zuletztOk > 0 && W.rcDienstLage.fehler === '' && s.fehl.aufrufe.length === 0, JSON.stringify(W.rcDienstLage));
    pruefe('Sperre nach dem Tick wieder frei', !W.rcDienstEmpfangLaeuft);

    // ---- zweiter Tick, derselbe Stand ----
    const n0 = dn.urls.length;
    await F.rcDienstEmpfangTick();
    pruefe('zweiter Tick mit demselben Stand: nichts eingespeist, nichts geloggt, nur /api/stand gelesen',
      s.lieferung.aufrufe.length === 1 && s.kpi.aufrufe.length === 1 && s.ablegen.aufrufe.length === 1 && s.warn.aufrufe.length === 1 &&
      s.ereignis.aufrufe.length === 1 && dn.urls.length === n0 + 1 && dn.urls[n0] === BASIS + '/api/stand', dn.pfade().slice(n0).join(' '));

    // ---- Mobile: neue nr, Fehlschlag ----
    dn.stand.esl.mobile = { nr: 1, zeit: T3, art: 'fehler', status: null, grund: 'kein Export-Knopf (Seite nicht bereit)', bytes: 0 };
    await F.rcDienstEmpfangTick();
    const m = s.lieferung.aufrufe[1] || [];
    pruefe('esl.mobile.nr + 1, art fehler -> rcProjektLieferung(mobile, {art:fehler, grund, zeit})',
      m[0] === 'mobile' && m[1] && m[1].art === 'fehler' && m[1].grund === 'kein Export-Knopf (Seite nicht bereit)' && m[1].zeit === T3 && !('buf' in m[1]), JSON.stringify(m));
    pruefe('...keine Datei geholt, Ergebnis {nr:1} und Gesehen.esl.mobile = 1',
      !dn.pfade().some(p => p === '/api/esl/mobile.xlsx') && W.rcDienstErgebnis.mobile && W.rcDienstErgebnis.mobile.nr === 1 && W.rcDienstGesehen.esl.mobile === 1);

    // ---- UM: Stand meldet excel, die Datei fehlt (404) ----
    dn.stand.esl.um = { nr: 3, zeit: T3, art: 'excel', status: null, grund: '', bytes: 9 };
    await F.rcDienstEmpfangTick();
    const u = s.lieferung.aufrufe[2] || [];
    pruefe('UM excel, Datei fehlt: Fehlschlag ueber rcProjektLieferung (kein Haenger), Gesehen rueckt vor',
      u[0] === 'um' && u[1] && u[1].art === 'fehler' && /nicht lesbar/.test(u[1].grund) && /404/.test(u[1].grund) && W.rcDienstGesehen.esl.um === 3 && W.rcDienstErgebnis.um.nr === 3, JSON.stringify(u));

    // ---- Liga teil ----
    dn.stand.liga = { nr: 2, zeit: T4, versuch: T4, art: 'teil', grund: 'UM: ORA-00936', vollstaendig: false, jeBaum: {} };
    dn.dateien['/api/liga.json'] = { zeit: T4, vollstaendig: false, payload: [{ ccsId: '4711', callCount: 13 }] };
    s.ord.length = 0;
    await F.rcDienstEmpfangTick();
    const b2 = nurTyp(s, 'KPI_BATCH'), h2 = nurTyp(s, 'KPI_HINWEIS');
    pruefe('Liga teil: KPI_BATCH (vollstaendig false), danach KPI_HINWEIS mit dem Grund',
      b2.length === 2 && b2[1].vollstaendig === false && b2[1].payload.length === 1 && h2.length === 1 && /ORA-00936/.test(h2[0].text) && h2[0].zeit === T4 &&
      s.ord.join(',') === 'kpi:KPI_BATCH,kpi:KPI_HINWEIS', s.ord.join(',') + ' ' + JSON.stringify(h2));
    pruefe('...rcKpiLastUpdate = neue liga.zeit, Gesehen.liga = 2', W.rcKpiLastUpdate.getTime() === T4 && W.rcDienstGesehen.liga === 2);

    // ---- Liga fehler (zeit bleibt: letzte ERFOLGREICHE Lieferung) ----
    const n1 = dn.urls.length;
    dn.stand.liga = { nr: 3, zeit: T4, versuch: T5, art: 'fehler', grund: 'Sitzung abgelaufen', vollstaendig: false, jeBaum: {} };
    await F.rcDienstEmpfangTick();
    const t3 = nurTyp(s, 'KPI_QUELLE_TOT');
    pruefe('Liga fehler -> KPI_QUELLE_TOT {grund, zeit = versuch}; keine Datei, kein KPI_BATCH',
      t3.length === 1 && t3[0].grund === 'Sitzung abgelaufen' && t3[0].zeit === T5 && nurTyp(s, 'KPI_BATCH').length === 2 && !dn.pfade().slice(n1).includes('/api/liga.json'), JSON.stringify(t3));
    pruefe('...Gesehen.liga = 3, rcKpiLastUpdate bleibt bei der letzten Lieferung', W.rcDienstGesehen.liga === 3 && W.rcKpiLastUpdate.getTime() === T4);
    dn.stand.liga = { nr: 4, zeit: T4, versuch: T5 + 60000, art: 'fehler', grund: 'Sitzung abgelaufen', vollstaendig: false, jeBaum: {} };
    await F.rcDienstEmpfangTick();
    pruefe('dieselbe Stoerung beim naechsten Versuch: nicht noch einmal gemeldet (Logbuch laeuft nicht voll)', nurTyp(s, 'KPI_QUELLE_TOT').length === 1 && W.rcDienstGesehen.liga === 4);
    dn.stand.liga = { nr: 5, zeit: T4, versuch: T5 + 120000, art: 'fehler', grund: 'ORA-01017', vollstaendig: false, jeBaum: {} };
    await F.rcDienstEmpfangTick();
    pruefe('...ein ANDERER Grund wird gemeldet', nurTyp(s, 'KPI_QUELLE_TOT').length === 2 && nurTyp(s, 'KPI_QUELLE_TOT')[1].grund === 'ORA-01017');

    // ---- Vortage: leer/fehler ohne Dateien, Liga-Datei als {art, tage, grund} ----
    dn.stand.vortage.mobile = { nr: 2, zeit: T5, von: '2026-10-20', bis: '2026-10-26', esl: { art: 'leer', grund: '' }, liga: { art: 'fehler', tage: 0, grund: 'ORA' } };
    dn.stand.vortage.um = { nr: 6, zeit: T5, von: '2026-10-24', bis: '2026-10-26', esl: { art: 'excel', grund: '' }, liga: { art: 'ok', tage: 1, grund: '' } };
    dn.dateien['/api/vortage/um.xlsx'] = BUF_U;
    dn.dateien['/api/vortage/um.liga.json'] = { art: 'ok', tage: LIGA_TAGE, grund: '' };
    const n2 = dn.urls.length;
    await F.rcDienstEmpfangTick();
    const am = s.ablegen.aufrufe.find(a => a[0] === 'mobile'), au = s.ablegen.aufrufe.find(a => a[0] === 'um');
    pruefe('Vortage Mobile (ESL leer, Liga fehler): Ablegen mit (null, null) — keine Datei geholt',
      am && am[1] === null && am[2] === null && am[3] === '2026-10-20' && !dn.pfade().slice(n2).some(p => /vortage\/mobile/.test(p)), JSON.stringify(am && am.map(x => x && typeof x === 'object' ? typeof x : x)));
    pruefe('Vortage UM: xlsx + Liga-Tage (aus {art, tage, grund} ausgepackt), von/bis aus dem Stand',
      au && au[1] === BUF_U && au[2] === LIGA_TAGE && au[3] === '2026-10-24' && au[4] === '2026-10-26' && W.rcDienstGesehen.vortage.um === 6 && W.rcDienstGesehen.vortage.mobile === 2);
  }

  // ---- Start nach Liga-Ausfall: die letzte ECHTE Lieferung kommt trotzdem ----
  {
    const st = grundStand(); st.liga = { nr: 7, zeit: T2, versuch: T5, art: 'fehler', grund: 'Sitzung abgelaufen', vollstaendig: true, jeBaum: {} };
    const dn = scheinDienst(st, grundDateien());
    const { F, W, s } = huelle(dn);
    await F.rcDienstEmpfangTick();
    pruefe('Start waehrend Liga-Ausfall: letzte Lieferung (KPI_BATCH, Alter = liga.zeit), DANACH KPI_QUELLE_TOT',
      s.ord.filter(x => x.indexOf('kpi:') === 0).join(',') === 'kpi:KPI_BATCH,kpi:KPI_QUELLE_TOT' && W.rcKpiLastUpdate.getTime() === T2 && W.rcLigaStoerung && W.rcDienstGesehen.liga === 7,
      s.ord.join(','));
  }

  // ---- Ausfall des Dienstes, 20-s-Drossel, 403 ----
  async function ausfall(quell) {
    const dn = scheinDienst(grundStand(), grundDateien());
    const H = huelle(dn, { quell });
    await H.F.rcDienstEmpfangTick();                 // einmal ok
    const okZeit = H.W.rcDienstLage.zuletztOk;
    dn.aus = true;
    for (let t = 0; t <= 24000; t += 2000) { H.uhr.jetzt += 2000; await H.F.rcDienstEmpfangTick(); }
    return { H, dn, okZeit };
  }
  {
    const { H, dn, okZeit } = await ausfall();
    const f = H.s.fehl.aufrufe;
    pruefe('fetch scheitert 25 s lang (13 Ticks): rcEslFehlschlag genau zweimal', f.length === 2, f.length);
    pruefe('...Grund "Datendienst antwortet nicht (...)"', f.length && /^Datendienst antwortet nicht \(.+\)$/.test(f[0][0]), f[0] && f[0][0]);
    pruefe('...rcDienstLage: Fehler benannt, zuletztOk bleibt beim letzten Erfolg', H.W.rcDienstLage.fehler !== '' && H.W.rcDienstLage.zuletztOk === okZeit, JSON.stringify(H.W.rcDienstLage));
    pruefe('...nichts eingespeist, Gesehen unveraendert', H.s.lieferung.aufrufe.length === 1 && H.W.rcDienstGesehen.esl.kabel === 1);
    dn.aus = false; dn.status = 403; H.uhr.jetzt += 20000;
    await H.F.rcDienstEmpfangTick();
    pruefe('HTTP 403: Grund "Zugang abgelehnt - Seite ueber ESL_Dienst_Start.cmd oeffnen"',
      f.length === 3 && f[2][0] === 'Datendienst antwortet nicht (Zugang abgelehnt - Seite ueber ESL_Dienst_Start.cmd oeffnen)', f[2] && f[2][0]);
    dn.status = 0; H.uhr.jetzt += 2000;
    await H.F.rcDienstEmpfangTick();
    pruefe('Dienst wieder da: rcDienstLage ohne Fehler', H.W.rcDienstLage.fehler === '' && H.W.rcDienstLage.zuletztOk === H.uhr.jetzt);
    dn.aus = true; H.uhr.jetzt += 2000;
    await H.F.rcDienstEmpfangTick();
    pruefe('...ein neuer Ausfall wird sofort gemeldet (Drossel beginnt neu)', f.length === 4, f.length);
    const g = await ausfall(verdirb(EMPFANG(), '>= 20000', '>= 0'));
    pruefe('GEGENPROBE ohne 20-s-Drossel: die Pruefung "genau zweimal" faellt durch', g.H.s.fehl.aufrufe.length !== 2, g.H.s.fehl.aufrufe.length);
  }

  // ---- Wiederholung: Gegenprobe ohne Gesehen-Fortschreibung ----
  {
    const dn = scheinDienst(grundStand(), grundDateien());
    const { F, s } = huelle(dn, { quell: verdirb(EMPFANG(), 'G.esl[p] = s.nr;', '') });
    await F.rcDienstEmpfangTick(); await F.rcDienstEmpfangTick();
    pruefe('GEGENPROBE ohne Gesehen.esl-Fortschreibung: der zweite Tick speist erneut ein (die Pruefung oben faellt durch)', s.lieferung.aufrufe.length === 2);
  }
  {
    const dn = scheinDienst(grundStand(), grundDateien());
    const { F, W } = huelle(dn, { quell: verdirb(EMPFANG(), 'window.rcKpiLastUpdate = new Date(L.zeit);', '') });
    await F.rcDienstEmpfangTick();
    pruefe('GEGENPROBE ohne rcKpiLastUpdate = liga.zeit: die Empfangszeit bleibt stehen (Pruefung faellt durch)', W.rcKpiLastUpdate.getTime() !== T2);
  }

  // ---- Sperre ----
  async function zweiGleichzeitig(quell) {
    const dn = scheinDienst(grundStand(), grundDateien());
    let los; dn.haengt = new Promise(r => { los = r; });
    const H = huelle(dn, { quell });
    const a = H.F.rcDienstEmpfangTick();
    await naechsterTakt();
    const b = H.F.rcDienstEmpfangTick();
    await Promise.race([b, new Promise(r => setTimeout(r, 200))]);
    const standNach = dn.pfade().filter(p => p === '/api/stand').length;
    dn.haengt = null; los();
    await a; await b;
    return { H, dn, standNach };
  }
  {
    const { H, dn, standNach } = await zweiGleichzeitig();
    pruefe('zwei Ticks gleichzeitig: nur einer fragt den Stand ab', standNach === 1, standNach);
    pruefe('...und nur einer speist ein', H.s.lieferung.aufrufe.length === 1, H.s.lieferung.aufrufe.length);
    await H.F.rcDienstEmpfangTick();
    pruefe('...danach ist die Sperre frei (naechster Tick liest wieder)', dn.pfade().filter(p => p === '/api/stand').length === 2);
    const g = await zweiGleichzeitig(verdirb(EMPFANG(), 'if (l && Date.now() - l.seit < 180000) return;', ''));
    pruefe('GEGENPROBE ohne Sperre: beide Ticks fragen ab und speisen doppelt ein', g.standNach === 2 && g.H.s.lieferung.aufrufe.length === 2, g.standNach + '/' + g.H.s.lieferung.aufrufe.length);
  }
  {
    const dn = scheinDienst(grundStand(), grundDateien());
    const H = huelle(dn);
    H.W.rcDienstEmpfangLaeuft = { seit: H.uhr.jetzt - 200000 };
    await H.F.rcDienstEmpfangTick();
    pruefe('verwaiste Sperre (aelter als 3 Min) haelt den Empfang nicht auf', H.s.lieferung.aufrufe.length === 1 && !H.W.rcDienstEmpfangLaeuft);
    H.W.rcDienstEmpfangLaeuft = { seit: H.uhr.jetzt - 5000 };
    dn.stand.esl.kabel.nr = 2;
    await H.F.rcDienstEmpfangTick();
    pruefe('...eine frische Sperre (5 s) schon', H.s.lieferung.aufrufe.length === 1);
  }

  // ---- Fehler im Einspeisen ----
  {
    const dn = scheinDienst(grundStand(), grundDateien());
    const H = huelle(dn, { lieferung: () => { throw new Error('XLSX kaputt'); } });
    await H.F.rcDienstEmpfangTick();
    pruefe('rcProjektLieferung wirft: Ergebnis {ok:false}, Gesehen rueckt vor, Warnung mit [Dienst], Sperre frei, Rest laeuft weiter',
      H.W.rcDienstErgebnis.kabel && H.W.rcDienstErgebnis.kabel.r.ok === false && /XLSX kaputt/.test(H.W.rcDienstErgebnis.kabel.r.grund) &&
      H.W.rcDienstGesehen.esl.kabel === 1 && H.s.warn.aufrufe.some(a => /^\[Dienst\].*XLSX kaputt/.test(a[0])) && !H.W.rcDienstEmpfangLaeuft && H.W.rcDienstGesehen.liga === 1,
      JSON.stringify(H.W.rcDienstErgebnis));
  }

  // ==========================================================================
  console.log('\n-- 3. Start: Takt 2 s, /api/projekt genau einmal --');
  // ==========================================================================
  async function startUndFuenf(quell) {
    const dn = scheinDienst(grundStand(), grundDateien());
    const H = huelle(dn, { quell, W: { rcAktivProjekt: 'mobile' } });
    H.F.rcDienstEmpfangStarten();
    for (let i = 0; i < 5; i++) await naechsterTakt();
    const sofort = dn.pfade().filter(p => p === '/api/stand').length;
    const takt = H.s.setInterval.aufrufe[0] || [];
    for (let i = 0; i < 5; i++) { H.uhr.jetzt += 2000; await takt[0](); }
    return { H, dn, sofort, takt };
  }
  {
    const { H, sofort, takt } = await startUndFuenf();
    pruefe('Start: setInterval(rcDienstEmpfangTick, 2000) -> window.rcDienstInterval', H.s.setInterval.aufrufe.length === 1 && takt[0] === H.F.rcDienstEmpfangTick && takt[1] === 2000 && H.W.rcDienstInterval === 77);
    pruefe('...sofort ein Tick (Stand gelesen, Kabel eingespeist)', sofort === 1 && H.s.lieferung.aufrufe.length === 1, sofort);
    const pj = H.s.anfrage.aufrufe.filter(a => a[0] === '/api/projekt');
    pruefe('/api/projekt genau einmal nach Start UND nach 5 Ticks, mit dem aktiven Projekt',
      pj.length === 1 && H.s.anfrage.aufrufe.length === 1 && JSON.stringify(pj[0][1]) === '{"projekt":"mobile"}', JSON.stringify(H.s.anfrage.aufrufe));
    H.F.rcDienstEmpfangStarten();
    pruefe('ein zweiter Start raeumt den alten Takt ab (kein zweiter Takt)', H.s.clearInterval.aufrufe.length === 1 && H.s.clearInterval.aufrufe[0][0] === 77);
    const g = await startUndFuenf(verdirb(EMPFANG(), 'const l = window.rcDienstEmpfangLaeuft;', "rcDienstAnfrage('/api/projekt', { projekt: window.rcAktivProjekt }, 10000); const l = window.rcDienstEmpfangLaeuft;"));
    pruefe('GEGENPROBE /api/projekt in jedem Tick: die Zaehlung (genau einmal) faellt durch', g.H.s.anfrage.aufrufe.length > 1, g.H.s.anfrage.aufrufe.length);
  }
  {
    const dn = scheinDienst(grundStand(), grundDateien());
    const H = huelle(dn, { anfrage: async () => ({ ok: false, grund: 'Datendienst nicht erreichbar (x)' }) });
    H.F.rcDienstEmpfangStarten();
    for (let i = 0; i < 5; i++) await naechsterTakt();
    pruefe('/api/projekt scheitert: Warnung statt Wurf', H.s.warn.aufrufe.some(a => /aktives Projekt nicht gemeldet/.test(a[0])), JSON.stringify(H.s.warn.aufrufe));
  }

  // ==========================================================================
  console.log('\n-- 4. Zusammenspiel mit den ECHTEN rcDienstAbruf / rcDienstRunde (Task 9) --');
  // ==========================================================================
  {
    const KERN = '\n' + Q('function rcDienstWarteAuf(') + '\n' + Q('function rcDienstGesehenNr(') + '\n' + Q('function rcDienstEslArtOk(') + '\n' +
      Q('async function rcDienstAbruf(') + '\n' + Q('async function rcDienstRunde(');
    const dn = scheinDienst(grundStand(), grundDateien());
    let H;
    const anfrage = async (pfad, daten) => {
      if (pfad === '/api/abruf') {   // der Dienst liefert eine neue UM-Lieferung, der Takt des Empfangs speist sie ein
        dn.stand.esl.um = { nr: 4, zeit: T5, art: 'excel', status: null, grund: '', bytes: 9 };
        dn.dateien['/api/esl/um.xlsx'] = BUF_U;
        setTimeout(() => H.F.rcDienstEmpfangTick(), 300);
        return { ok: true, nr: 4, art: 'excel', grund: '' };
      }
      if (pfad === '/api/runde') {
        dn.stand.esl.kabel = { nr: 2, zeit: T5, art: 'excel', status: null, grund: '', bytes: 8 };
        dn.stand.liga = { nr: 2, zeit: T5, versuch: T5, art: 'ok', grund: '', vollstaendig: true, jeBaum: {} };
        setTimeout(() => H.F.rcDienstEmpfangTick(), 300);
        return { ok: true, nr: 9, esl: { nr: 2, art: 'excel', grund: '' }, liga: { nr: 2, art: 'ok', grund: '', agenten: 2 } };
      }
      return { ok: true };
    };
    H = huelle(dn, { Date, anfrage, zusatz: KERN, namen: ['rcDienstAbruf', 'rcDienstRunde'], env: { rcProjEintrag: p => ({ name: p }) } });
    await H.F.rcDienstEmpfangTick();
    const r = await H.F.rcDienstAbruf('um');
    pruefe('rcDienstAbruf(um) wartet auf den Empfang und liefert GENAU das Ergebnis von rcProjektLieferung', r && r.ok === true && r.text === 'r-um', JSON.stringify(r));
    const ru = await H.F.rcDienstRunde();
    pruefe('rcDienstRunde: ESL und Liga eingespeist -> esl.ok, liga.ok mit agenten', ru && ru.esl.ok === true && ru.liga.ok === true && ru.liga.agenten === 2, JSON.stringify(ru));
  }

  // ==========================================================================
  console.log('\n-- 5. rcMergeLigaHistory: im Dienst-Betrieb kein Kabel-Schluessel --');
  // ==========================================================================
  {
    const MERGE = Q('function rcDienstModus(') + '\n' + Q('function rcMergeLigaHistory(');
    const lauf = (quell, marke) => {
      const gesetzt = [];
      const W = marke ? { __rcDienst: { basis: BASIS } } : {};
      const F = lade(quell, { window: W, localStorage: { setItem: (k, v) => gesetzt.push(k), getItem: () => null }, rcKey: k => k }, ['rcMergeLigaHistory']);
      F.rcMergeLigaHistory({ '2026-10-25': { byAgent: { 1: {} } } });
      return { gesetzt, W };
    };
    const mit = lauf(MERGE, true), ohne = lauf(MERGE, false);
    pruefe('mit Marke: im Speicher der Seite gemischt, aber KEIN setItem auf rcLigaHistDash', mit.W.rcLigaHistory && mit.W.rcLigaHistory['2026-10-25'] && mit.gesetzt.length === 0, JSON.stringify(mit.gesetzt));
    pruefe('ohne Marke: wie bisher in rcKey(rcLigaHistDash) gesichert', ohne.gesetzt.length === 1 && ohne.gesetzt[0] === 'rcLigaHistDash', JSON.stringify(ohne.gesetzt));
    const g = lauf(verdirb(MERGE, 'if (!rcDienstModus()) localStorage.setItem(', 'localStorage.setItem('), true);
    pruefe('GEGENPROBE ohne Wache: mit Marke landet die Vereinigung im Kabel-Schluessel', g.gesetzt.length === 1);
  }

  // ==========================================================================
  console.log('\n-- 6. Start-Block (Promise.all ... then / catch) --');
  // ==========================================================================
  const iBoot = V22.indexOf("rcLog.log('Lade externe Bibliotheken...');");
  const iPa = V22.indexOf('Promise.all([', iBoot);
  const iCatch = V22.indexOf('}).catch(err => {', iPa);
  let START = '';
  if (iBoot > 0 && iPa > 0 && iCatch > iPa) {
    let i = V22.indexOf('{', iCatch + 2), t = 0;
    for (; i < V22.length; i++) { if (V22[i] === '{') t++; else if (V22[i] === '}' && --t === 0) break; }
    START = V22.slice(iPa, i + 2);          // bis einschliesslich ')' des catch
  }
  pruefe('Start-Block gefunden (Promise.all ... catch)', START.length > 200 && /\)$/.test(START), START.length);
  const tThen = START.slice(0, START.indexOf('}).catch(')), tCatch = START.slice(START.indexOf('}).catch('));
  const nachStart = tx => tx.slice(tx.indexOf('rcDienstEmpfangStarten();'));
  pruefe('then: rcDienstEmpfangStarten steht nach rcAutoMapping und rcLiveInterval, vor holeExcelVomServer und vor dem return',
    tThen.indexOf('rcAutoMapping();') < tThen.indexOf('rcDienstEmpfangStarten();') && tThen.indexOf('window.rcLiveInterval = setInterval(rcLiveTick, 20000);') < tThen.indexOf('rcDienstEmpfangStarten();') &&
    tThen.indexOf('rcDienstEmpfangStarten();') > 0 && tThen.indexOf('rcDienstEmpfangStarten();') < tThen.indexOf('holeExcelVomServer();') &&
    /^rcDienstEmpfangStarten\(\);\s*return;/.test(nachStart(tThen)));
  pruefe('catch: ebenso', tCatch.indexOf('rcDienstEmpfangStarten();') > 0 && tCatch.indexOf('rcDienstEmpfangStarten();') < tCatch.indexOf('holeExcelVomServer();') && /^rcDienstEmpfangStarten\(\);\s*return;/.test(nachStart(tCatch)));
  async function startLauf(quell, marke, scheitert) {
    const W = marke ? { __rcDienst: { basis: BASIS } } : {};
    const s = {};
    ['rcAutoMapping', 'holeExcelVomServer', 'rcAlleProjekteStart', 'rcAutoKpiQuelle', 'rcDienstEmpfangStarten', 'rcHarvestEslHistory', 'rcLiveTick'].forEach(n => { s[n] = spion(); });
    s.setInterval = spion(() => 5); s.setTimeout = spion(() => 6);
    const env = Object.assign({ window: W, rcLog: { log() {}, error() {}, warn() {} }, ladeBibliothek: () => scheitert ? Promise.reject(new Error('CDN weg')) : Promise.resolve(),
      rcDienstModus: () => !!(W.__rcDienst && W.__rcDienst.basis) }, s);
    const k = Object.keys(env);
    await new Function(...k, 'return ' + quell + ';')(...k.map(n => env[n]));
    return { W, s };
  }
  const zahl = (r, n) => r.s[n].aufrufe.length;
  {
    const mit = await startLauf(START, true, false);
    pruefe('mit Marke: Mapping, rcLiveInterval, Empfang gestartet', zahl(mit, 'rcAutoMapping') === 1 && mit.W.rcLiveInterval === 5 && zahl(mit, 'rcDienstEmpfangStarten') === 1);
    pruefe('...kein holeExcelVomServer, kein rcAlleProjekteStart, kein Harvest, kein rcAutoKpiQuelle',
      zahl(mit, 'holeExcelVomServer') === 0 && zahl(mit, 'rcAlleProjekteStart') === 0 && mit.s.setTimeout.aufrufe.length === 0 && !mit.W.rcHistInterval && zahl(mit, 'rcAutoKpiQuelle') === 0,
      ['holeExcelVomServer', 'rcAlleProjekteStart', 'rcAutoKpiQuelle'].map(n => zahl(mit, n)).join(','));
    const ohne = await startLauf(START, false, false);
    pruefe('ohne Marke: wie bisher (holeExcelVomServer, rcAlleProjekteStart, Harvest in 20 s + alle 4 h, rcAutoKpiQuelle), kein Empfang',
      zahl(ohne, 'holeExcelVomServer') === 1 && zahl(ohne, 'rcAlleProjekteStart') === 1 && ohne.s.setTimeout.aufrufe.length === 1 && ohne.s.setTimeout.aufrufe[0][1] === 20000 &&
      ohne.W.rcHistInterval === 5 && zahl(ohne, 'rcAutoKpiQuelle') === 1 && zahl(ohne, 'rcDienstEmpfangStarten') === 0 && ohne.W.rcLiveInterval === 5);
    const mitC = await startLauf(START, true, true), ohneC = await startLauf(START, false, true);
    pruefe('Bibliothek scheitert, mit Marke: Empfang statt Portal', zahl(mitC, 'rcDienstEmpfangStarten') === 1 && zahl(mitC, 'holeExcelVomServer') === 0 && mitC.W.rcLiveInterval === 5);
    pruefe('Bibliothek scheitert, ohne Marke: wie bisher holeExcelVomServer', zahl(ohneC, 'holeExcelVomServer') === 1 && zahl(ohneC, 'rcDienstEmpfangStarten') === 0 && ohneC.W.rcLiveInterval === 5);
    const ALT = START.replace(/[ \t]*if \(rcDienstModus\(\)\) \{ rcDienstEmpfangStarten\(\); return; \}[^\n]*\n/g, '');
    const g = await startLauf(ALT, true, false);
    pruefe('GEGENPROBE alter Block: mit Marke ginge es ans Portal (die Pruefung oben faellt durch)', ALT !== START && zahl(g, 'holeExcelVomServer') === 1);
  }

  // ==========================================================================
  console.log('\n-- 7. Warteschleifen-Boot und Clean-State --');
  // ==========================================================================
  {
    const iB = V22.indexOf('// ---- Boot ----', V22.indexOf('(function rcQueueModule('));
    const iE = V22.indexOf("rcLog.log('[WS] Warteschleifen-Modul bereit", iB);
    const BOOT = iB > 0 && iE > iB ? V22.slice(iB, V22.indexOf('\n', iE)) : '';
    pruefe('Warteschleifen-Boot gefunden', BOOT.length > 50 && BOOT.length < 2000, BOOT.length);
    const boot = (quell, marke, modulAus) => {
      const s = {}, logs = [];
      ['queueAbraeumen', 'ensureQueuePage', 'buildShell', 'setRotation', 'paint', 'autoQuelle', 'tick'].forEach(n => { s[n] = spion(); });
      s.setInterval = spion(() => 3);
      const W = marke ? { __rcDienst: { basis: BASIS } } : {};
      const env = Object.assign({ window: W, CFG: { modulAus: !!modulAus, inRotation: true }, rcLog: { log: m => logs.push(m), warn: m => logs.push(m) },
        rcDienstModus: () => !!(W.__rcDienst && W.__rcDienst.basis) }, s);
      const k = Object.keys(env);
      new Function(...k, quell)(...k.map(n => env[n]));
      return { s, logs, W };
    };
    const mit = boot(BOOT, true, false), ohne = boot(BOOT, false, false), aus = boot(BOOT, false, true);
    pruefe('mit Marke: abgeraeumt, nichts aufgebaut, kein 3-s-Takt', mit.s.queueAbraeumen.aufrufe.length === 1 && mit.s.ensureQueuePage.aufrufe.length === 0 && mit.s.autoQuelle.aufrufe.length === 0 && mit.s.setInterval.aufrufe.length === 0 && !mit.W.rcQueueInterval);
    pruefe('...Log "Warteschleife im Dienst-Betrieb aus (kommt mit Vorhaben 4)."', mit.logs.some(m => /Warteschleife im Dienst-Betrieb aus \(kommt mit Vorhaben 4\)\./.test(m)), JSON.stringify(mit.logs));
    pruefe('ohne Marke: aufgebaut wie bisher (Seite, Huelle, Auto-Quelle, 3-s-Takt)', ohne.s.queueAbraeumen.aufrufe.length === 0 && ohne.s.ensureQueuePage.aufrufe.length === 1 && ohne.s.autoQuelle.aufrufe.length === 1 && ohne.W.rcQueueInterval === 3);
    pruefe('modulAus ohne Marke: abgeraeumt mit dem bisherigen Hinweis', aus.s.queueAbraeumen.aufrufe.length === 1 && aus.s.ensureQueuePage.aufrufe.length === 0 && aus.logs.some(m => /abgeschaltet/.test(m)));
    const ALT = BOOT.replace(/[ \t]*if\(rcDienstModus\(\)\)\{[^\n]*\n/, '');
    const g = boot(ALT, true, false);
    pruefe('GEGENPROBE alter Boot: mit Marke wuerde die Warteschleife aufgebaut', ALT !== BOOT && g.s.ensureQueuePage.aufrufe.length === 1);
  }
  {
    const iL = CLEAN.indexOf("['rcLiveInterval'");
    const LISTE = iL >= 0 ? CLEAN.slice(iL, CLEAN.indexOf('});', iL) + 3) : '';
    pruefe('Clean-State-Liste enthaelt rcDienstInterval', /'rcDienstInterval'/.test(LISTE));
    const W = { rcDienstInterval: 42, rcLiveInterval: 7 }, ci = spion();
    new Function('window', 'clearInterval', LISTE)(W, ci);
    pruefe('...funktional: der Empfangs-Takt wird gestoppt', W.rcDienstInterval === null && ci.aufrufe.some(a => a[0] === 42));
    const Z = { rcDienstEmpfangLaeuft: { seit: 1 }, rcDienstGesehen: { esl: { kabel: 9 }, liga: 9 }, rcDienstErgebnis: { kabel: { nr: 9 } } };
    new Function('window', cleanZuweisung('rcDienstEmpfangLaeuft') + cleanZuweisung('rcDienstGesehen') + cleanZuweisung('rcDienstErgebnis'))(Z);
    pruefe('...Sperre frei, Gesehen auf 0, Ergebnis leer (nach Re-Inject wird alles neu eingespeist)',
      !Z.rcDienstEmpfangLaeuft && Z.rcDienstGesehen.esl.kabel === 0 && Z.rcDienstGesehen.liga === 0 && Z.rcDienstGesehen.ereignis === 0 && JSON.stringify(Z.rcDienstErgebnis) === '{}');
  }

  console.log('');
  console.log(rot ? rot + ' fehlgeschlagen, ' + ok + ' bestanden' : 'ALLE ' + ok + ' PRUEFUNGEN BESTANDEN');
  fertig = true;
})().catch(e => { fertig = true; throw e; }).catch(e => { console.log('ABBRUCH: ' + (e && e.stack || e)); console.log((rot + 1) + ' fehlgeschlagen (Abbruch), ' + ok + ' bestanden'); process.exitCode = 1; });
