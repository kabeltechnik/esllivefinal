'use strict';
// ============================================================================
//  STACK-ZUORDNUNG UND AUFFRISCHEN PRUEFEN (05.10.2026)
//  Nutzer: "Die Daten werden immer noch nicht richtig gelesen und auch nicht
//  herausgegeben ... Viele werden nicht angezeigt. Liegt es an der Visualitaet?"
//  Gemessen an den drei gleichzeitigen ESL-Exporten vom 28.09.: es lag NICHT an
//  der Anzeige. Ohne Filter standen 457 von 457 Agenten im Bestand; ueber die
//  sechs Stack-Filter zusammen aber nur 360 im Live-Dashboard und 390 in der
//  Excel — der Stack kam live allein aus der Mitarbeiter-Excel (Stand 04.08.),
//  nur der Export kannte zusaetzlich den Anker. Dazu "zum richtigen Zeitpunkt":
//  nur das aktive Projekt lief im Takt mit, Export und Stundenmail lasen fuer
//  die anderen den Stand ihres letzten Abrufs.
//
//  Was dieses Werkzeug festhaelt:
//   1. Auffrischen vor jeder Ausgabe (rcFrischHolen): welche Projekte, in
//      welcher Reihenfolge, was als frisch gilt, was bei einem Fehlschlag
//      passiert (FRIST, keine Sperre) — funktional, mit Gegenproben.
//   2. Report (Stundenmail im Dashboard) und Export-Dialog frischen VOR dem Bau auf.
//   3. Die Liste "ohne Stack-Zuordnung" (Kopfleiste, Dialog, Blatt, Luecken-Excel).
//   4. Die Zahlen an den ECHTEN Exporten: jeder Agent steht unter genau einem
//      Stack oder in "ohne Stack", und die Projekt-Filter teilen den Bestand
//      vollstaendig auf — gegen eine unabhaengige Sollrechnung.
//   5. Verdrahtung in Dashboard und Starter (FrischeAuf vor dem Zuschnitt).
//  Die zentrale Regel selbst (Mapping, sonst eindeutiger Anker) prueft
//  mapping_luecke_pruefen.js (Abschnitte B bis D). Echte Funktionen per
//  Klammer-Zaehlung geschnitten, kein Nachbau.
//  Ende-zu-Ende im Browser: test_abgleich_esl.html (echte Exporte, Server
//  esl-offline) und das Schein-ESL (esl-schein) fuer das Umschalten der Projekte.
// ============================================================================
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const V22 = fs.readFileSync(path.join(DIR, 'esl_live_arena_v22.js'), 'utf8');
const CMD = fs.readFileSync(path.join(DIR, 'ESL_Start.cmd'), 'utf8');
const BAUSTEIN = require('./_stack_regel.js');

let ok = 0, rot = 0, aus = 0;
function pruefe(name, bed, info) { if (bed) ok++; else rot++; console.log((bed ? 'OK   ' : 'ROT  ') + name + (info ? '  (' + info + ')' : '')); }
function uebersprungen(name, grund) { aus++; console.log('[--] ' + name + ' — uebersprungen: ' + grund); }
function schneide(src, kopf) {
  const t = BAUSTEIN.schneide(src, kopf);
  if (!t) throw new Error('nicht gefunden: ' + kopf);
  return t;
}
const pause = ms => new Promise(r => setTimeout(r, ms));
const REGEL = BAUSTEIN.quelltext(V22);

(async () => {
  // ==========================================================================
  console.log('\n-- 1. Auffrischen vor der Ausgabe (rcFrischHolen) --');
  // ==========================================================================
  const FRISCH_QUELL = REGEL + '\n' + schneide(V22, 'function rcProjekteFuerScope(scope){') + '\n' +
    schneide(V22, 'async function rcFrischLaufen(scope, sag, maxAlter){') + '\n' +
    schneide(V22, 'async function rcFrischHolen(scope, melden, opts){') + '\n' +
    schneide(V22, 'window.rcFrischStart = function(scope){') + ';\n' +
    schneide(V22, 'window.rcFrischStand = function(){') + ';\n';
  pruefe('ein Stand gilt 45 s als frisch (RC_FRISCH_MAX_MS)', /const RC_FRISCH_MAX_MS = 45000;/.test(V22));

  // Umgebung: rcProjektAbruf und der "Jetzt"-Weg als Attrappen, die protokollieren.
  function umgebung(opt, quell) {
    opt = opt || {};
    const prot = [];
    const W = { rcAlleProjekteModus: opt.multi !== false, rcAktivProjekt: opt.aktiv || 'kabel', rcProjektDaten: opt.daten || {},
                rcKpiLastUpdate: opt.liga ? new Date(opt.liga) : null, rcEslLastOk: opt.eslOk || 0, rcJetztBusy: false,
                rcFrischLauf: null, rcFrischLetzter: null, rcFrischLigaVersuch: 0, rcHarvestBusy: !!opt.harvest };
    const abruf = async (key, anlass) => {
      prot.push('abruf:' + key + ':' + anlass); await pause(opt.dauer || 2);
      if (opt.fehl && opt.fehl[key]) return { ok: false, grund: opt.fehl[key] };
      W.rcProjektDaten[key] = { data: [[], [], []], zeit: Date.now(), pruefung: 'ok' };
      return { ok: true, zeilen: 2 };
    };
    const jetzt = async () => {
      prot.push('jetzt'); await pause(opt.dauer || 2);
      if (opt.jetztNull) return null;                       // "Jetzt" lief nicht (Historie/Zeitraum belegt die Seite)
      if (opt.standBleibt) { /* Abruf ging leer aus: kein neuer Stand */ }
      else if (W.rcAlleProjekteModus) W.rcProjektDaten[W.rcAktivProjekt] = { data: [[], []], zeit: Date.now() }; else W.rcEslLastOk = Date.now();
      if (opt.ligaOk) W.rcKpiLastUpdate = new Date();
      return { liga: opt.ligaOk ? { ok: true, agenten: 154 } : { ok: false, error: 'Ligalisten-Fenster nicht verbunden' },
               esl: opt.eslFehl ? { ok: false, error: opt.eslFehl } : { ok: true }, sekunden: 0 };
    };
    const F = new Function('window', 'rcProjektAbruf', 'rcJetztAktualisieren', 'rcLog', 'LIVE_NOW_TIMEOUT', 'RC_FRISCH_MAX_MS',
      (quell || FRISCH_QUELL) + '\nreturn { rcProjekteFuerScope, rcFrischHolen };')(W, abruf, jetzt, { warn: t => prot.push('warn:' + t), log() {} }, 200, 45000);
    return { W, prot, F };
  }
  const SC = (stack) => ({ std: 'ALL', stack: stack, team: 'ALL' });
  const frischJetzt = () => ({ data: [[], []], zeit: Date.now() });

  { // Welche Projekte braucht ein Zuschnitt?
    const u = umgebung({ aktiv: 'mobile' });
    pruefe('ohne Stack-Filter: alle drei Projekte, das AKTIVE zuletzt', u.F.rcProjekteFuerScope(SC('ALL')).join(',') === 'kabel,um,mobile', u.F.rcProjekteFuerScope(SC('ALL')).join(','));
    pruefe('Stack-Filter: nur das Projekt dieses Stacks', u.F.rcProjekteFuerScope(SC('VKD_Tech')).join(',') === 'kabel' && u.F.rcProjekteFuerScope(SC('VUM_Care')).join(',') === 'um');
    pruefe('Projekt-Filter ("UM gesamt"): nur dieses Projekt', u.F.rcProjekteFuerScope(SC('P:um')).join(',') === 'um');
    pruefe('unbekannter Stack: lieber alle drei als keines', u.F.rcProjekteFuerScope(SC('Neuer_Stack')).length === 3);
  }
  { // DER Fall des Nutzers: Zuschnitt auf ein NICHT aktives Projekt, das nie geladen wurde
    const u = umgebung({ aktiv: 'kabel', ligaOk: true });
    const m = [];
    const e = await u.F.rcFrischHolen(SC('MF_CARE'), t => m.push(t));
    pruefe('Zuschnitt MF_CARE bei aktivem Kabel: Mobile wird VOR der Ausgabe geholt', u.prot[0] === 'abruf:mobile:knopf', u.prot.join(' > '));
    pruefe('...danach die Ligaliste ueber den "Jetzt"-Weg (kein zweiter Abrufweg)', u.prot.join(' > ') === 'abruf:mobile:knopf > jetzt', u.prot.join(' > '));
    pruefe('...Ergebnis: ok, Mobile mit Zeilenzahl, Kabel gar nicht erst gefragt', e.ok === true && e.projekte.mobile.ok && e.projekte.kabel === undefined && /Mobile: 2 Zeilen/.test(e.text), e.text);
    pruefe('...der Aufrufer bekommt Zwischenmeldungen ("Hole Mobile ...")', m.some(t => /Hole Mobile/.test(t)), m.join(' | '));
    // GEGENPROBE: die Lage vor dem 05.10. — niemand holt das nicht aktive Projekt.
    const ALT = FRISCH_QUELL.replace('if (key === aktiv) continue;', 'continue;');
    const uA = umgebung({ aktiv: 'kabel', ligaOk: true }, ALT);
    await uA.F.rcFrischHolen(SC('MF_CARE'));
    pruefe('GEGENPROBE: ohne die Schleife ueber die nicht aktiven Projekte bleibt Mobile ungeholt', ALT !== FRISCH_QUELL && uA.prot.indexOf('abruf:mobile:knopf') === -1 && !uA.W.rcProjektDaten.mobile, uA.prot.join(' > '));
  }
  { // ohne Stack-Filter: alle drei, das aktive zuletzt
    const u = umgebung({ aktiv: 'kabel', ligaOk: true });
    const e = await u.F.rcFrischHolen(SC('ALL'));
    pruefe('ohne Stack-Filter: erst Mobile und UM, zuletzt das aktive Kabel mit der Ligaliste', u.prot.join(' > ') === 'abruf:mobile:knopf > abruf:um:knopf > jetzt', u.prot.join(' > '));
    pruefe('...alle drei stehen im Ergebnis, dazu die Ligaliste', e.ok && e.projekte.mobile.ok && e.projekte.um.ok && e.projekte.kabel.ok && e.liga && e.liga.agenten === 154, e.text);
  }
  { // frisch heisst: nichts holen
    const u = umgebung({ aktiv: 'kabel', liga: Date.now(), daten: { kabel: frischJetzt(), mobile: frischJetzt(), um: frischJetzt() } });
    const e = await u.F.rcFrischHolen(SC('ALL'));
    pruefe('alles juenger als 45 s: KEIN Abruf (drei Mail-Kreise hintereinander holen nicht dreimal)', u.prot.length === 0 && e.ok && /Kabel: frisch/.test(e.text) && /Mobile: frisch/.test(e.text), u.prot.join(' > ') + ' / ' + e.text);
    const alt = { data: [[], []], zeit: Date.now() - 60000 };
    const u2 = umgebung({ aktiv: 'kabel', liga: Date.now(), daten: { kabel: frischJetzt(), mobile: alt, um: frischJetzt() } });
    await u2.F.rcFrischHolen(SC('ALL'));
    pruefe('ein Stand aelter als 45 s wird neu geholt — nur dieser', u2.prot.join(' > ') === 'abruf:mobile:knopf', u2.prot.join(' > '));
  }
  { // FRIST, keine Sperre
    const u = umgebung({ aktiv: 'kabel', ligaOk: true, fehl: { um: 'HTTP 500' } });
    let e = null, geworfen = false;
    try { e = await u.F.rcFrischHolen(SC('ALL')); } catch (x) { geworfen = true; }
    pruefe('scheitert EIN Projekt, wirft rcFrischHolen NICHT (die Ausgabe geht weiter)', geworfen === false && !!e);
    if (!e) e = { fehler: [], text: '' };
    pruefe('...und die anderen laufen trotzdem durch', u.prot.filter(t => !/^warn:/.test(t)).join(' > ') === 'abruf:mobile:knopf > abruf:um:knopf > jetzt', u.prot.join(' > '));
    pruefe('...das Ergebnis sagt es: ok=false, "NUR TEILWEISE", Projekt und Grund', e.ok === false && /^NUR TEILWEISE aktualisiert/.test(e.text) && e.fehler.join('|') === 'UM: HTTP 500' && /UM: HTTP 500/.test(e.text), e.text);
    pruefe('...und es steht im Log (ein stiller Fehlschlag waere ein stiller Stillstand)', u.prot.some(t => /^warn:Auffrischen vor der Ausgabe: NUR TEILWEISE/.test(t)));
    // Auch ein WURF im Abruf (nicht nur ok:false) darf die Ausgabe nicht mitreissen.
    const uW = umgebung({ aktiv: 'kabel', ligaOk: true });
    const FW = new Function('window', 'rcProjektAbruf', 'rcJetztAktualisieren', 'rcLog', 'LIVE_NOW_TIMEOUT', 'RC_FRISCH_MAX_MS', FRISCH_QUELL + '\nreturn rcFrischHolen;')(
      uW.W, async () => { throw new Error('Rahmen weg'); }, async () => ({ liga: { ok: true, agenten: 1 }, esl: { ok: true } }), { warn() {}, log() {} }, 200, 45000);
    let eW = null, wurfW = false;
    try { eW = await FW(SC('MF_CARE')); } catch (x) { wurfW = true; }
    pruefe('...ein Wurf im Projekt-Abruf wird zum Grund im Ergebnis, nicht zum Abbruch', wurfW === false && eW && eW.ok === false && /Mobile: Rahmen weg/.test(eW.text), eW && eW.text);
  }
  { // aktives Projekt allein
    const u = umgebung({ aktiv: 'kabel', ligaOk: true });
    const e = await u.F.rcFrischHolen(SC('VKD_Tech'));
    pruefe('Zuschnitt auf das aktive Projekt: nur der "Jetzt"-Weg, kein Umschalten', u.prot.join(' > ') === 'jetzt' && e.projekte.kabel.ok, u.prot.join(' > '));
    const uF = umgebung({ aktiv: 'kabel', ligaOk: true, eslFehl: 'Export liefert HTML statt Excel' });
    const eF = await uF.F.rcFrischHolen(SC('VKD_Tech'));
    pruefe('...scheitert dort der ESL-Abruf, steht der Grund im Ergebnis', eF.ok === false && /Kabel: Export liefert HTML statt Excel/.test(eF.text), eF.text);
  }
  { // "Jetzt" lief nicht (Historie belegt die Seite)
    const u = umgebung({ aktiv: 'kabel', jetztNull: true, harvest: true });
    const e = await u.F.rcFrischHolen(SC('VKD_Tech'));
    pruefe('Historie/Zeitraum belegt die Seite: Fehlschlag mit genau diesem Grund statt Erfolgsmeldung', e.ok === false && /Kabel: Historien-\/Zeitraum-Abruf läuft/.test(e.text), e.text);
  }
  { // Ligaliste antwortet nicht: nicht jeder Kreis wartet erneut
    const u = umgebung({ aktiv: 'kabel', ligaOk: false });
    await u.F.rcFrischHolen(SC('VKD_Tech'));
    await u.F.rcFrischHolen(SC('VKD_Tech'));
    pruefe('ohne Antwort der Ligaliste fragt der zweite Lauf sie NICHT sofort wieder (sonst je Mail-Kreis 45 s)', u.prot.join(' > ') === 'jetzt', u.prot.join(' > '));
    const e = await u.F.rcFrischHolen(SC('VKD_Tech'));
    pruefe('...und die ESL-Seite bleibt trotzdem "frisch" und ok', e.ok === true && /Kabel: frisch/.test(e.text), e.text);
  }
  { // zwei Aufrufe gleichzeitig
    const u = umgebung({ aktiv: 'kabel', ligaOk: true, dauer: 15 });
    const [a, b] = await Promise.all([u.F.rcFrischHolen(SC('MF_TECH')), u.F.rcFrischHolen(SC('MF_TECH'))]);
    pruefe('zwei Aufrufe gleichzeitig: Mobile wird EINMAL geholt, der zweite wartet und findet es frisch',
      u.prot.filter(t => t === 'abruf:mobile:knopf').length === 1 && a.ok && b.ok && (a.projekte.mobile.frisch || b.projekte.mobile.frisch), u.prot.join(' > '));
    pruefe('...danach ist der Lauf-Merker wieder frei (sonst wartete jeder spaetere Export)', u.W.rcFrischLauf === null);
  }
  { // Einzelprojekt (eigener Starter fuer Mobile/UM, Pruefseiten)
    const u = umgebung({ multi: false, ligaOk: true });
    const e = await u.F.rcFrischHolen(SC('ALL'));
    pruefe('Einzelprojekt: ein "Jetzt" holt die eigene Seite und die Ligaliste, kein Projekt-Umschalten', u.prot.join(' > ') === 'jetzt' && e.ok && e.projekte.esl.ok && /ESL: neu geladen/.test(e.text), u.prot.join(' > ') + ' / ' + e.text);
    const u2 = umgebung({ multi: false, eslOk: Date.now(), liga: Date.now() });
    await u2.F.rcFrischHolen(SC('ALL'));
    pruefe('Einzelprojekt: frischer Stand -> nichts holen', u2.prot.length === 0);
    // Im Einzelprojekt liefert der ESL-Abruf keinen Status — "Jetzt" meldet auch dann
    // Erfolg, wenn nichts ankam. Deshalb entscheidet der STAND, nicht die Rueckmeldung.
    const u3 = umgebung({ multi: false, ligaOk: true, standBleibt: true });
    u3.W.rcEslFehlgrund = 'Export liefert HTML statt Excel';
    const e3 = await u3.F.rcFrischHolen(SC('ALL'));
    pruefe('Einzelprojekt: "Jetzt" meldet Erfolg, aber es kam kein neuer Stand -> Fehlschlag mit dem Grund',
      e3.ok === false && /ESL: Export liefert HTML statt Excel/.test(e3.text), e3.text);
  }
  { // Fernsteuerung aus ESL_Start.cmd
    const u = umgebung({ aktiv: 'kabel', ligaOk: true, dauer: 10 });
    pruefe('rcFrischStand vor dem ersten Lauf: "kein-stand"', u.W.rcFrischStand() === 'kein-stand');
    const s = u.W.rcFrischStart(SC('MF_CARE'));
    const waehrend = u.W.rcFrischStand();
    for (let i = 0; i < 200 && !/^fertig:/.test(u.W.rcFrischStand()); i++) await pause(5);
    pruefe('rcFrischStart liefert sofort "gestartet", rcFrischStand meldet erst "laeuft:" und dann "fertig:ok:" mit Text',
      s === 'gestartet' && /^laeuft:/.test(waehrend) && /^fertig:ok:Aktualisiert nach \d+ s — Mobile: 2 Zeilen/.test(u.W.rcFrischStand()), waehrend + ' -> ' + u.W.rcFrischStand());
    const uF = umgebung({ aktiv: 'kabel', ligaOk: true, fehl: { mobile: 'Umstellen gescheitert' } });
    uF.W.rcFrischStart(SC('MF_CARE'));
    for (let i = 0; i < 200 && !/^fertig:/.test(uF.W.rcFrischStand()); i++) await pause(5);
    pruefe('...bei einem Fehlschlag "fertig:teil:" mit dem Grund (der Starter schreibt ihn ins Fenster)', /^fertig:teil:NUR TEILWEISE[^\n]*Mobile: Umstellen gescheitert/.test(uF.W.rcFrischStand()), uF.W.rcFrischStand());
  }

  // ==========================================================================
  console.log('\n-- 2. Report und Export-Dialog frischen VOR dem Bau auf --');
  // ==========================================================================
  {
    const quell = schneide(V22, 'function reportHatHeute(){') + '\n' + schneide(V22, 'function downloadFrisch(){') + '\nreturn { reportHatHeute, downloadFrisch };';
    const lauf = (cfg, frisch) => {
      const prot = [];
      const st = { base: 'ESL-Report-X', zeilen: 5 };
      const log = { warn: t => prot.push('warn') };
      const F = new Function('CFG', 'pad', 'download', 'rcFrischHolen', 'window', 'rcLog', quell)(cfg, n => String(n).padStart(2, '0'),
        () => { prot.push('download'); return st; },
        frisch === undefined ? undefined : (scope => { prot.push('frisch:' + scope.std + '/' + scope.stack + '/' + scope.team); return frisch(); }),
        { rcLog: log }, log);
      return { prot, F, st };
    };
    const heute = (d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))(new Date());
    const a = lauf({ datumModus: 'heute', std: 'AL', stack: 'MF_CARE', team: 'ALL' }, () => Promise.resolve({ ok: true, text: 'ok' }));
    const sa = await a.F.downloadFrisch();
    pruefe('Report von heute: erst rcFrischHolen mit dem Zuschnitt des Reports, DANN download()', a.prot.join(' > ') === 'frisch:AL/MF_CARE/ALL > download' && sa === a.st, a.prot.join(' > '));
    const b = lauf({ datumModus: 'tag', von: '2026-01-02', std: 'ALL', stack: 'ALL', team: 'ALL' }, () => Promise.resolve({ ok: true }));
    await b.F.downloadFrisch();
    pruefe('Report ueber einen VORTAG: kein Auffrischen (der kommt aus der Historie)', b.prot.join(' > ') === 'download', b.prot.join(' > '));
    const c = lauf({ datumModus: 'zeitraum', von: '2026-01-02', bis: heute }, () => Promise.resolve({ ok: true }));
    await c.F.downloadFrisch();
    pruefe('Zeitraum, der heute einschliesst: Auffrischen', c.prot[0] === 'frisch:ALL/ALL/ALL', c.prot.join(' > '));
    const d = lauf({ datumModus: 'heute' }, () => Promise.resolve({ ok: false, text: 'NUR TEILWEISE aktualisiert — UM: HTTP 500' }));
    const sd = await d.F.downloadFrisch();
    pruefe('nicht alles frisch: der Report geht TROTZDEM raus, der Grund steht im Zustand (frischHinweis)', d.prot.join(' > ') === 'frisch:ALL/ALL/ALL > download' && /UM: HTTP 500/.test(sd.frischHinweis || ''), JSON.stringify(sd));
    const e = lauf({ datumModus: 'heute' }, () => Promise.reject(new Error('kaputt')));
    const se = await e.F.downloadFrisch();
    pruefe('Auffrischen wirft: Report geht trotzdem raus, Warnung im Log', e.prot.join(' > ') === 'frisch:ALL/ALL/ALL > warn > download' && se === e.st, e.prot.join(' > '));
    // GEGENPROBE: die Bauart vor dem 05.10. (download ohne Auffrischen) muss an der ersten Pruefung durchfallen.
    {
      const altQ = quell.replace("if(!reportHatHeute() || typeof rcFrischHolen!=='function') return Promise.resolve(download());", 'return Promise.resolve(download());');
      const prot = [];
      const FA = new Function('CFG', 'pad', 'download', 'rcFrischHolen', 'window', 'rcLog', altQ)({ datumModus: 'heute', std: 'AL', stack: 'MF_CARE', team: 'ALL' },
        n => String(n).padStart(2, '0'), () => { prot.push('download'); return {}; }, scope => { prot.push('frisch'); return Promise.resolve({ ok: true }); }, {}, { warn() {} });
      await FA.downloadFrisch();
      pruefe('GEGENPROBE: die alte Bauart baut den Report, OHNE vorher aufzufrischen', altQ !== quell && prot.join(' > ') === 'download', prot.join(' > '));
    }
    pruefe('der Stundentakt im Dashboard geht durch downloadFrisch (nicht mehr direkt durch download)',
      /CFG\.lastHourKey=hk; save\(\); downloadFrisch\(\)\.catch\(gescheitert\);/.test(V22) && !/CFG\.lastHourKey=hk; save\(\); download\(\);/.test(V22));
    pruefe('der Knopf "Report jetzt" geht durch frischUndNow', /window\.rcReport\.frischUndNow\(\)\.then\(zeig,/.test(V22) && /frischUndNow:downloadFrisch/.test(V22));
    pruefe('rcReportNow bleibt SYNCHRON (ESL_Start.cmd liest st.base sofort)', /window\.rcReportNow=function\(\)\{ return download\(\); \};/.test(V22));
  }
  {
    // Export-Dialog: die echte Funktion frischDann
    // Dazu der echte Dienst-Schalter (27.10.): ohne Marke laeuft frischDann wie bisher
    // (der Dienst-Zweig ist in dienst_schalter_pruefen.js geprueft).
    const quell = 'const frischDann = ' + schneide(V22, 'async (b, bauen) => {') + ';\n' + schneide(V22, 'function rcDienstModus(') + '\nreturn frischDann;';
    const heute = '2026-10-05';
    const lauf = async (bereich, frischErg, wirf) => {
      const prot = [], knopf = { disabled: false }, status = [];
      const F = new Function('window', 'document', 'sagen', 'rcFrischHolen', 'scopeAus', 'projListe', 'heute', quell)({},
        { getElementById: id => (id === 'rcExWahlGo' || id === 'rcExWahlRep') ? knopf : null },
        (t, schlecht) => status.push((schlecht ? '!' : '') + t),
        async (scope, sag) => { prot.push('frisch:' + scope.stack + ':knopfGesperrt=' + knopf.disabled); if (sag) sag('Hole UM ...'); if (wirf) throw new Error('kaputt'); return frischErg; },
        () => ({ std: 'ALL', stack: 'VUM_Care', team: 'ALL' }), () => prot.push('liste'), heute);
      await F(bereich, sag => { prot.push('bauen:knopfGesperrt=' + knopf.disabled); sag('Fertig — datei.xlsx'); });
      return { prot, status };
    };
    const a = await lauf({ von: heute, bis: heute }, { ok: true, fehler: [] });
    pruefe('Dialog, heute im Bereich: erst auffrischen (Knoepfe gesperrt), dann bauen (Knoepfe wieder frei)',
      a.prot.join(' > ') === 'frisch:VUM_Care:knopfGesperrt=true > liste > bauen:knopfGesperrt=false', a.prot.join(' > '));
    pruefe('...die Statuszeile zeigt den Fortschritt und am Ende "Fertig"', a.status[0] === 'Aktualisiere die Daten vor dem Export ...' && a.status[a.status.length - 1] === 'Fertig — datei.xlsx', a.status.join(' | '));
    const b = await lauf({ von: '2026-10-04', bis: '2026-10-04' }, { ok: true, fehler: [] });
    pruefe('Dialog, nur gestern: KEIN Auffrischen', b.prot.join(' > ') === 'bauen:knopfGesperrt=false', b.prot.join(' > '));
    const c = await lauf({ von: '2026-09-29', bis: heute }, { ok: false, fehler: ['UM: HTTP 500'] });
    pruefe('Dialog, Auffrischen unvollstaendig: gebaut wird trotzdem, der Grund bleibt HINTER dem "Fertig" stehen (rot)',
      c.prot.some(p => /^bauen/.test(p)) && c.status[c.status.length - 1] === '!Fertig — datei.xlsx — ACHTUNG: nicht alles frisch (UM: HTTP 500)', c.status[c.status.length - 1]);
    const d = await lauf({ von: heute, bis: heute }, null, true);
    pruefe('Dialog, Auffrischen wirft: gebaut wird trotzdem, mit Hinweis', d.prot.some(p => /^bauen/.test(p)) && /ACHTUNG: Auffrischen fehlgeschlagen \(kaputt\)/.test(d.status[d.status.length - 1]), d.status.join(' | '));
    pruefe('beide Dialog-Knoepfe (Bericht, Nur Reporting) gehen durch frischDann',
      (V22.match(/frischDann\(b, sag => \{/g) || []).length === 2);
  }

  // ==========================================================================
  console.log('\n-- 3. Die Liste "ohne Stack-Zuordnung" --');
  // ==========================================================================
  {
    const quell = BAUSTEIN.quelltextBlatt(V22) + '\nreturn { rcOhneStackListe, rcLueckeGrund, rcLueckeName };';
    const OHNE = [
      { vo: 'k1', name: 'k1', team: 'Kabel Neu 99', teamRoh: 'Kabel Neu 99', standort: 'SER', projekt: 'kabel', imMapping: false, stack: '', kontakte: 9, ansprachen: 2, stueck: 3 },
      { vo: 'k2', name: 'Kabel Zwei', team: '21101052', teamRoh: 'Essen VKD', standort: 'E', projekt: 'kabel', imMapping: true, stack: '', kontakte: 4, ansprachen: 0, stueck: 0 },
      { vo: 'm1', name: 'm1', team: 'VF Mobilfunk AL 07', teamRoh: 'VF Mobilfunk AL 07', standort: 'AL', projekt: 'mobile', imMapping: false, stack: '', kontakte: 5, ansprachen: 1, stueck: 2 }
    ];
    const W = { rcOhneStack: OHNE, rcKpiData: { m1: { agentName: 'Liga Name' } }, rcActiveScope: () => ({ std: 'ALL', team: 'ALL', stack: 'MF_CARE' }),
                rcWcaMapping: { stackMap: { 'VKD-TECH-83': 'VKD_Tech', 'MF-CARE-01': 'MF_CARE' } } };
    const F = new Function('window', quell)(W);
    const vos = sc => F.rcOhneStackListe(sc).map(l => l.vo).join(',');
    pruefe('"Alle Stacks": alle Agenten ohne Stack', vos({ std: 'ALL', team: 'ALL', stack: 'ALL' }) === 'k1,k2,m1');
    // Ohne geladene Mitarbeiter-Excel hat niemand einen Stack — das ist ein fehlendes
    // Mapping, keine Zuordnungsluecke (sonst stuende beim Start "457 ohne Stack" im Kopf).
    pruefe('ohne geladene Mitarbeiter-Excel bleibt die Liste LEER',
      new Function('window', quell)(Object.assign({}, W, { rcWcaMapping: null })).rcOhneStackListe({ std: 'ALL', team: 'ALL', stack: 'ALL' }).length === 0 &&
      new Function('window', quell)(Object.assign({}, W, { rcWcaMapping: { stackMap: {} } })).rcOhneStackListe({ std: 'ALL', team: 'ALL', stack: 'ALL' }).length === 0);
    pruefe('Stack-Filter: nur die des PROJEKTS dieses Stacks (sie koennten zu jedem seiner Stacks gehoeren)',
      vos({ std: 'ALL', team: 'ALL', stack: 'VKD_Tech' }) === 'k1,k2' && vos({ std: 'ALL', team: 'ALL', stack: 'OneC_Tech' }) === 'k1,k2' && vos({ std: 'ALL', team: 'ALL', stack: 'MF_TECH' }) === 'm1');
    pruefe('Projekt-Filter ("Kabel gesamt"): dieselben', vos({ std: 'ALL', team: 'ALL', stack: 'P:kabel' }) === 'k1,k2');
    pruefe('Standort- und Team-Filter gelten', vos({ std: 'SER', team: 'ALL', stack: 'ALL' }) === 'k1' && vos({ std: 'ALL', team: '21101052', stack: 'ALL' }) === 'k2');
    pruefe('ohne Angabe gilt der Dashboard-Filter (rcActiveScope)', F.rcOhneStackListe().map(l => l.vo).join(',') === 'm1');
    // GEGENPROBE: ohne den Projekt-Bezug stuenden Mobile-Agenten in der Liste eines Kabel-Stacks.
    {
      const altQ = quell.replace('if (proj && l.projekt !== proj) return false;', '');
      const FA = new Function('window', altQ)(W);
      pruefe('GEGENPROBE: ohne Projekt-Bezug stuende der Mobile-Agent unter einem Kabel-Stack',
        altQ !== quell && FA.rcOhneStackListe({ std: 'ALL', team: 'ALL', stack: 'VKD_Tech' }).map(l => l.vo).join(',') === 'k1,k2,m1' &&
        vos({ std: 'ALL', team: 'ALL', stack: 'VKD_Tech' }).indexOf('m1') === -1);
    }
    pruefe('der Grund unterscheidet "fehlt in der Excel" von "Team ohne Stack-Eintrag"',
      /fehlt in der Mitarbeiter-Excel/.test(F.rcLueckeGrund(OHNE[0])) && /hat in der Mitarbeiter-Excel keinen Stack/.test(F.rcLueckeGrund(OHNE[1])) && /21101052/.test(F.rcLueckeGrund(OHNE[1])));
    pruefe('...und nennt bei einem Anker, dass der Stack ueber die Kollegen kam',
      /über die Kollegen im ESL-Team/.test(F.rcLueckeGrund({ imMapping: false, stack: 'VKD_Tech' })));
    pruefe('Name: ohne Mapping-Eintrag aus der Ligaliste, sonst aus dem Mapping, sonst die Nummer',
      F.rcLueckeName(OHNE[2]) === 'Liga Name' && F.rcLueckeName(OHNE[1]) === 'Kabel Zwei' && F.rcLueckeName(OHNE[0]) === 'k1');
  }

  // ==========================================================================
  console.log('\n-- 4. Die Zahlen an den echten Exporten (unabhaengige Sollrechnung) --');
  // ==========================================================================
  await (async function echteDaten() {
    const EX = { kabel: 'Export_20260928_212911.xlsx', mobile: 'Export_20260928_212922.xlsx', um: 'Export_20260928_212931.xlsx' };
    const ordner = path.join(DIR, 'Test Excels');
    const fehlt = Object.keys(EX).filter(k => !fs.existsSync(path.join(ordner, EX[k])));
    let XLSX = null;
    try { XLSX = require(path.join(DIR, 'node_modules', 'xlsx')); } catch (e) { XLSX = null; }
    if (!XLSX || fehlt.length || !fs.existsSync(path.join(DIR, 'Mitarbeiter_IDS_Final_komplett.xlsx'))) {
      uebersprungen('Abschnitt 4 (echte Exporte vom 28.09.)', !XLSX ? 'node_modules/xlsx fehlt' : fehlt.length ? 'in "Test Excels/" fehlen: ' + fehlt.map(k => EX[k]).join(', ') : 'Mitarbeiter-Excel fehlt');
      return;
    }
    const lies = (p, blatt) => { const wb = XLSX.readFile(p); return XLSX.utils.sheet_to_json(wb.Sheets[blatt || wb.SheetNames[0]], { header: 1, defval: '' }); };
    const P = {}; Object.keys(EX).forEach(k => { P[k] = lies(path.join(ordner, EX[k])); });
    // Mapping wie der Import im Dashboard: CCS und alle VO-Spalten -> { team, ccsId }, Team -> Stack
    const MT = lies(path.join(DIR, 'Mitarbeiter_IDS_Final_komplett.xlsx'), 'Daten');
    const mi = MT.findIndex(r => r && r.some(c => /ccs_user/i.test(String(c))));
    const mh = MT[mi].map(c => String(c).toLowerCase().trim());
    const iC = mh.indexOf('ccs_user'), iT = mh.indexOf('team'), iS = mh.indexOf('stack'), voSp = mh.map((x, i) => /^vo_id/.test(x) ? i : -1).filter(i => i >= 0);
    const MAP = { voMap: {}, ccsMap: {}, stackMap: {} };
    MT.slice(mi + 1).forEach(r => {
      const ccs = String(r[iC] || '').trim(); if (!ccs) return;
      const e = { ccsId: ccs, team: String(r[iT] || '').trim() };
      MAP.ccsMap[ccs] = e; const st = String(r[iS] || '').trim(); if (e.team && st) MAP.stackMap[e.team] = st;
      voSp.forEach(i => { const v = String(r[i] || '').trim(); if (v) MAP.voMap[v] = e; });
    });
    // Zusammenfuehren mit der ECHTEN rcVerarbeiteAlle (haengt rc_projekt an)
    const tag = String(P.kabel[1][P.kabel[0].map(x => String(x).toLowerCase().trim()).indexOf('datum')]).slice(0, 10);
    const W = { rcProjektDaten: {}, rcWcaMapping: MAP, rcKpiData: {}, rcIsInitialized: true };
    Object.keys(P).forEach(k => { W.rcProjektDaten[k] = { data: P[k], zeit: Date.now() }; });
    let strom = null; W.processDataStream = d => { strom = d; };
    new Function('window', 'rcRahmenHeute', schneide(V22, 'function pad2(') + '\n' + schneide(V22, 'function rcRowDayKey(') + '\n' +
      schneide(V22, 'function rcProjRahmenListe(') + '\n' + schneide(V22, 'function rcVerarbeiteAlle(') + '\nrcVerarbeiteAlle(false);')(W, () => tag);
    pruefe('echte Exporte: der zusammengefuehrte Strom traegt die Projekt-Spalte', !!strom && strom[0][strom[0].length - 1] === 'rc_projekt' && strom.length > 1000, strom && strom.length + ' Zeilen');
    if (!strom) return;
    const h = strom[0].map(x => String(x).toLowerCase().trim());
    const idx = { datum: h.indexOf('datum'), standort: h.indexOf('standort'), team: h.indexOf('team'), vo: h.indexOf('vo_nummer'), prod: h.indexOf('produktgrupe'),
                  produkt: h.indexOf('produkt'), merkmal: h.indexOf('produktmerkmal'), erg: h.indexOf('ergebnis'), anz: h.indexOf('anzahl'), projekt: h.indexOf('rc_projekt') };
    const anker = new Function(schneide(V22, 'function rcIstPotentialTracking(') + '\n' + schneide(V22, 'function rcAnkerAusZeilen(') + '\nreturn rcAnkerAusZeilen;')()(strom, idx, MAP, 'kabel');
    W.rcRohTeamStack = anker.rohTeamStack; W.rcTeamProjekt = anker.teamProjekt; W.rcVoProjekt = anker.voProjekt;
    const R = new Function('window', REGEL + '\nreturn { passt: rcStackFilterPasst, von: rcStackVonTeam };')(W);

    // Agenten des Tages (ohne Potential Tracking), je Agent Team und Projekt
    const ag = {};
    strom.slice(1).forEach(z => {
      if (/potential\s*tracking/i.test(String(z[idx.merkmal])) || /^\s*info\s*world\s*$/i.test(String(z[idx.produkt]))) return;
      const vo = String(z[idx.vo] || '').trim(); if (!vo) return;
      const m = MAP.voMap[vo] || MAP.ccsMap[vo];
      if (!ag[vo]) ag[vo] = { vo, team: (m && m.team) || String(z[idx.team] || '').trim(), roh: String(z[idx.team] || '').trim(), projekt: z[idx.projekt], mapped: !!m };
    });
    const alle = Object.keys(ag).map(k => ag[k]);

    // UNABHAENGIGE Sollrechnung (eigene Logik, nicht die Funktionen oben): Stack aus dem
    // Mapping, sonst der Stack der gemappten Kollegen desselben Rohteams, wenn alle gleich.
    const rohSoll = {};
    alle.forEach(a => { if (a.mapped && MAP.stackMap[a.team] && a.roh) (rohSoll[a.roh] || (rohSoll[a.roh] = {}))[MAP.stackMap[a.team]] = 1; });
    const stackSoll = a => a.mapped ? (MAP.stackMap[a.team] || '') : (rohSoll[a.roh] && Object.keys(rohSoll[a.roh]).length === 1 ? Object.keys(rohSoll[a.roh])[0] : '');
    const sollJe = {}, istJe = {};
    const STACKS = [...new Set(Object.keys(MAP.stackMap).map(t => MAP.stackMap[t]))].sort();
    STACKS.forEach(s => { sollJe[s] = alle.filter(a => stackSoll(a) === s).length; istJe[s] = alle.filter(a => R.passt(a.team, s, a.projekt)).length; });
    const ohneSoll = alle.filter(a => !stackSoll(a)).length, ohneIst = alle.filter(a => !R.von(a.team)).length;
    pruefe('je Stack: die zentrale Regel zaehlt dieselben Agenten wie die unabhaengige Sollrechnung',
      STACKS.every(s => sollJe[s] === istJe[s]), STACKS.map(s => s + ' ' + istJe[s] + '/' + sollJe[s]).join(', '));
    pruefe('ohne Stack: gleich viele wie in der Sollrechnung', ohneIst === ohneSoll, ohneIst + '/' + ohneSoll);
    const summe = STACKS.reduce((s, k) => s + istJe[k], 0);
    pruefe('JEDER Agent steht unter genau einem Stack oder in "ohne Stack" (Summe = alle)', summe + ohneIst === alle.length, summe + ' + ' + ohneIst + ' = ' + alle.length);
    const projIst = {}; ['kabel', 'mobile', 'um'].forEach(p => { projIst[p] = alle.filter(a => R.passt(a.team, 'P:' + p, a.projekt)).length; });
    const projSoll = {}; ['kabel', 'mobile', 'um'].forEach(p => { projSoll[p] = alle.filter(a => a.projekt === p).length; });
    pruefe('"<Projekt> gesamt" nimmt genau die Agenten der Lieferung — vollstaendig, auch ohne Mapping',
      ['kabel', 'mobile', 'um'].every(p => projIst[p] === projSoll[p]) && projIst.kabel + projIst.mobile + projIst.um === alle.length,
      ['kabel', 'mobile', 'um'].map(p => p + ' ' + projIst[p]).join(', '));
    // GEGENPROBE: die Live-Regel vor dem 05.10. (nur stackMap[team]) verliert die Anker-Agenten.
    const altSumme = STACKS.reduce((s, k) => s + alle.filter(a => (MAP.stackMap[a.team] || '') === k).length, 0);
    pruefe('GEGENPROBE: die alte Live-Regel (nur Mapping) zeigt ueber alle Stack-Filter WENIGER Agenten', altSumme < summe, altSumme + ' < ' + summe);
    // Die am 05.10. im Browser gemessenen Zahlen (test_abgleich_esl.html), solange genau diese Exporte da liegen.
    pruefe('Zahlen vom 28.09.: 457 Agenten, 390 unter den sechs Stacks, 67 ohne Stack', alle.length === 457 && summe === 390 && ohneIst === 67, alle.length + ' / ' + summe + ' / ' + ohneIst);
    pruefe('Zahlen vom 28.09.: VKD_Tech 125, OneC_Tech 89, MF_TECH 40, MF_CARE 61, VUM_Tech 23, VUM_Care 52',
      istJe.VKD_Tech === 125 && istJe.OneC_Tech === 89 && istJe.MF_TECH === 40 && istJe.MF_CARE === 61 && istJe.VUM_Tech === 23 && istJe.VUM_Care === 52, JSON.stringify(istJe));
    pruefe('Zahlen vom 28.09.: Kabel gesamt 247, Mobile gesamt 118, UM gesamt 92', projIst.kabel === 247 && projIst.mobile === 118 && projIst.um === 92);
    pruefe('Zahlen vom 28.09.: die alte Live-Regel kam ueber die sechs Filter nur auf 360 (der Befund)', altSumme === 360, String(altSumme));
  })();

  // ==========================================================================
  console.log('\n-- 5. Verdrahtung im Dashboard --');
  // ==========================================================================
  const pds = schneide(V22, 'window.processDataStream = function(sheetData) {');
  pruefe('Parser: der Stack-Filter kennt den Projekt-Wert ("P:<projekt>")', /const fProj = rcIstProjektFilter\(filterStack\) \? filterStack\.slice\(2\) : '';/.test(pds));
  pruefe('Parser: der Filter rechnet mit Stack (Regel) und Projekt (Lieferung) der ZEILE',
    /&& \(filterStack === 'ALL' \|\| \(fProj \? projEff === fProj : \(!!stRow && stRow === filterStack\)\)\);/.test(pds) &&
    /const stRow = stackOf\(team\);/.test(pds) && /const projEff = projRow \|\| \(stRow \? rcProjektVonStack\(stRow\) : ''\);/.test(pds));
  pruefe('Parser: die Lieferung schlaegt das Mapping (Projekt-Spalte, sonst das Projekt der Seite)',
    /const projRow = \(idx\.projekt !== -1 \? \(row\[idx\.projekt\]\|\|''\)\.toString\(\)\.trim\(\) : ''\) \|\| eigenProjekt;/.test(pds));
  pruefe('Parser: der Agent traegt Stack, Projekt, ESL-Rohteam und "fehlt in der Excel"',
    /if \(!ag\.stack\) ag\.stack = stRow;/.test(pds) && /if \(!ag\.projekt\) ag\.projekt = projEff;/.test(pds) && /if \(teamRaw && !ag\.teamRoh\) ag\.teamRoh = teamRaw;/.test(pds) && /if \(!imMapping\) ag\.ohneMap = true;/.test(pds));
  pruefe('Parser: das Luecken-Verzeichnis entsteht UNGEFILTERT (vor "if (inScope)")',
    pds.indexOf('const lz = (voRaw && (!imMapping || !stRow))') > 0 && pds.indexOf('const lz = (voRaw && (!imMapping || !stRow))') < pds.indexOf('if (inScope) {\n                gCallIds.add(rowId);'));
  pruefe('Parser: Stueck im Verzeichnis = anzahl der angenommenen Zeilen (dieselbe Regel wie ueberall)',
    /if \(accepted\) \{\n\s+if \(lz\) lz\.stueck \+= anzahl;/.test(pds));
  pruefe('Parser: jeder Verkauf traegt sein Projekt (die freien Module filtern darueber)', /produkt:prodNameRaw, projekt:projEff,/.test(pds));
  // Seit 05.10. abends steht er als ERSTES Element der Bedienung, nicht mehr im Filterblock
  // (dort schob er das Werkzeug-Menue aus dem Bild) — die Lage prueft kopfleiste_pruefen.js.
  pruefe('Kopfleiste: der Zaehler ist ein Knopf der Leiste und oeffnet die Liste',
    /<button class="rc-flt-ohne" id="rcOhneStackChip" style="display:none;"><\/button>/.test(V22) &&
    /document\.getElementById\('rcOhneStackChip'\)\.addEventListener\('click', function\(\)\{ window\.rcOpenOhneStack\(\); \}\);/.test(V22) && /\.rc-flt-ohne\{/.test(V22));
  {
    const chip = schneide(V22, 'function rcOhneStackChip(){');
    pruefe('Zaehler: verschwindet bei 0 und sagt, ob die Agenten in der Ansicht mitzaehlen',
      /if \(!l\.length\) \{ el\.style\.display = 'none'; return; \}/.test(chip) && /const zaehltMit = sc\.stack === 'ALL' \|\| rcIstProjektFilter\(sc\.stack\);/.test(chip));
  }
  pruefe('Stack-Auswahl: je Projekt eine Zeile "<Projekt> gesamt" mit dem Wert P:<projekt>',
    /<option value="P:\$\{key\}">\$\{titel\} gesamt<\/option>/.test(V22));
  pruefe('Stack-Auswahl: ein gewaehltes "<Projekt> gesamt" ueberlebt den Neuaufbau der Liste',
    /sel\.value = \(stacks\.includes\(cur\) \|\| \(multi && rcIstProjektFilter\(cur\) && rcProjektVonStack\(cur\)\)\) \? cur : 'ALL';/.test(V22));
  {
    const vs = new Function(schneide(V22, 'function rcProjektVonStack(stack){') + '\nreturn rcProjektVonStack;')();
    pruefe('ein Projekt-Wert nennt sein Projekt selbst (der Stack-Wechsel stellt das ESL darueber um)',
      vs('P:kabel') === 'kabel' && vs('P:mobile') === 'mobile' && vs('P:um') === 'um' && vs('P:quatsch') === '' && vs('VKD_Tech') === 'kabel');
  }
  pruefe('Export-Dialog und Report-Konfigurator bieten "<Projekt> gesamt" an',
    /const projekte = window\.rcAlleProjekteModus \? rcProjRahmenListe\(\)\.map\(p => 'P:' \+ p\.key\) : \[\];/.test(V22) &&
    /var proj=window\.rcAlleProjekteModus \? rcProjRahmenListe\(\)\.map\(function\(p\)\{ return 'P:'\+p\.key; \}\) : \[\];/.test(V22));
  pruefe('Dateinamen: der Projekt-Wert geht lesbar hinein (kein Doppelpunkt im Namen)',
    (V22.match(/rcStackFilterText\(g\('rcStackFilter','stack'\)\)/g) || []).length === 3);
  pruefe('ein Projekt-Filter nagelt KEINEN Stack fest (die Stack-Ebene bleibt im Bericht)',
    (V22.match(/const stackFix = !!\(scF\.stack && scF\.stack !== 'ALL' && !rcIstProjektFilter\(scF\.stack\)\);/g) || []).length === 2);
  {
    const ml = schneide(V22, 'window.rcMappingLuecken = async function(melden){');
    pruefe('Mapping-Luecken: ERST auffrischen (alle Projekte), DANN die Liste bauen',
      ml.indexOf("await rcFrischHolen({ std:'ALL', stack:'ALL', team:'ALL' }, sag);") > 0 && ml.indexOf('await rcFrischHolen(') < ml.indexOf('const alle = window.rcZuordnungLuecken'));
    pruefe('Mapping-Luecken: zwei Blaetter — Agenten ohne Mapping, Teams ohne Stack', /'Agenten ohne Mapping'/.test(ml) && /'Teams ohne Stack'/.test(ml));
    pruefe('Mapping-Luecken: die Datei nennt, welche Projekte geladen waren', /Enthaltene Projekte — /.test(ml) && /KEINE Daten geladen/.test(ml));
  }
  pruefe('Clean-State: ein haengender Auffrisch-Lauf ueberlebt das Neueinspielen nicht',
    /window\.rcFrischLauf = null;\n\s+window\.rcFrischLetzter = null;\n\s+window\.rcFrischLigaVersuch = 0;/.test(V22));
  pruefe('Blatt "Ohne Stack" steht in der Blatt-Auswahl des Export-Dialogs', /\['ohneStack','Ohne Stack \(nicht zuordenbare Agenten\)'\]/.test(V22));
  // Klick auf eine Verkaufs-Kachel (05.10. im Browser gemessen): die Liste dahinter las rcAllSales
  // UNGEFILTERT — unter Filter VKD_Tech standen dort die 514 Abschluesse aller Standorte.
  {
    const kd = schneide(V22, 'window.rcOpenKpiDetail = function(kind){');
    pruefe('Kachel-Liste: die Verkaeufe werden auf den aktiven Filter zugeschnitten (Standort, Team, Stack ueber den zentralen Vergleich)',
      /const scD = window\.rcActiveScope\(\);/.test(kd) &&
      /const sales = \(window\.rcAllSales \|\| \[\]\)\.filter\(s => \(scD\.std === 'ALL' \|\| s\.standort === scD\.std\)/.test(kd) &&
      /\(scD\.stack === 'ALL' \|\| rcStackFilterPasst\(s\.team, scD\.stack, s\.projekt\)\)/.test(kd) && !/const sales = window\.rcAllSales \|\| \[\];/.test(kd));
    // Funktional: derselbe Ausdruck gegen drei Verkaeufe.
    const zuschnitt = new Function('window', REGEL + '\nreturn function(scD){ return (window.rcAllSales || []).filter(s => (scD.std === "ALL" || s.standort === scD.std)' +
      ' && (scD.team === "ALL" || s.team === scD.team) && (scD.stack === "ALL" || rcStackFilterPasst(s.team, scD.stack, s.projekt))).map(s => s.vo).join(","); };')(
      { rcWcaMapping: { stackMap: { 'VKD-TECH-83': 'VKD_Tech', 'MF-CARE-01': 'MF_CARE' } }, rcRohTeamStack: { 'Vodafone AL 06': 'VKD_Tech' }, rcKpiData: {},
        rcAllSales: [{ vo: 'a', team: 'VKD-TECH-83', standort: 'AL', projekt: 'kabel' }, { vo: 'b', team: 'Vodafone AL 06', standort: 'B', projekt: 'kabel' }, { vo: 'c', team: 'MF-CARE-01', standort: 'AL', projekt: 'mobile' }] });
    pruefe('...ohne Filter alle, mit Stack-Filter nur dessen Verkaeufe (auch die ueber den Anker), mit Standort nur dieser',
      zuschnitt({ std: 'ALL', team: 'ALL', stack: 'ALL' }) === 'a,b,c' && zuschnitt({ std: 'ALL', team: 'ALL', stack: 'VKD_Tech' }) === 'a,b' &&
      zuschnitt({ std: 'AL', team: 'ALL', stack: 'ALL' }) === 'a,c' && zuschnitt({ std: 'ALL', team: 'ALL', stack: 'P:mobile' }) === 'c');
  }
  // TAGESSTAND TROTZ FILTER (05.10., im Browser gemessen): die Selbst-Archivierung lief nur
  // ohne Dashboard-Filter. Seit der Stack-Filter das Projekt waehlt, steht fast immer einer —
  // nach drei gefilterten Laeufen gab es keinen Historien-Eintrag fuer heute.
  {
    const iArchiv = pds.indexOf("window.rcHistorieSpeicherFehler('Selbst-Archivierung heute', e); }");
    const iSonst = pds.indexOf('} else if (!ohneFilter && Date.now() - (window.rcArchivOhneFilterUm || 0) > RC_ARCHIV_TAKT_MS) {');
    const iMarke = pds.indexOf('window.rcArchivOhneFilterUm = Date.now();', iSonst);
    const iLauf = pds.indexOf('try { rcAgentenVollbestand(); }', iSonst);
    pruefe('Parser: bei gesetztem Filter sichert ein ungefilterter Durchlauf den Tagesstand (direkt am Archiv-Block)',
      iArchiv > 0 && iSonst > iArchiv && iSonst - iArchiv < 120 && iLauf > iSonst);
    pruefe('...der Zeitstempel steht VOR dem Durchlauf (der gefilterte Lauf darin kaeme sonst wieder dort an)', iMarke > iSonst && iMarke < iLauf);
    pruefe('...im Takt von 5 Minuten, und je Einspielen neu', /const RC_ARCHIV_TAKT_MS = 300000;/.test(V22) && /window\.rcArchivOhneFilterUm = 0;/.test(V22));
    pruefe('...der Durchlauf selbst loest KEINEN weiteren aus (Schalter ohneFilter)', /else if \(!ohneFilter && /.test(pds));
    // GEGENPROBE: steht der Zeitstempel hinter dem Durchlauf, muss die Reihenfolge-Pruefung anschlagen.
    const verdreht = pds.replace('window.rcArchivOhneFilterUm = Date.now();\n', '').replace('try { rcAgentenVollbestand(); }', 'try { rcAgentenVollbestand(); window.rcArchivOhneFilterUm = Date.now(); }');
    pruefe('GEGENPROBE: die Reihenfolge-Pruefung erkennt einen Zeitstempel NACH dem Durchlauf',
      verdreht !== pds && !(verdreht.indexOf('window.rcArchivOhneFilterUm = Date.now();', verdreht.indexOf('} else if (!ohneFilter && Date.now()')) < verdreht.indexOf('try { rcAgentenVollbestand();')));
  }

  // ==========================================================================
  console.log('\n-- 6. Starter: erst auffrischen, dann Zuschnitt und Report --');
  // ==========================================================================
  {
    const fa = schneide(CMD, 'function FrischeAuf($dash, $std, $stack, $team, $text) {');
    const sm = schneide(CMD, 'function SchickeStundenmail($ziele) {');
    pruefe('FrischeAuf stoesst rcFrischStart mit dem Zuschnitt an und fragt rcFrischStand ab',
      /window\.rcFrischStart\(\{std:/.test(fa) && /window\.rcFrischStand\(\)/.test(fa));
    pruefe('FrischeAuf vertraegt ein aelteres Dashboard im Tab (kennt die Funktion nicht)', /typeof window\.rcFrischStart!=="function"\) return "alt"/.test(fa) && /if \("\$a" -eq 'alt'\) \{ return 'alt' \}/.test(fa));
    pruefe('FrischeAuf hat eine FRIST ($MailFrischFristSek) und gibt danach weiter', /\$MailFrischFristSek = 120/.test(CMD) && /\(Get-Date\)\.AddSeconds\(\$MailFrischFristSek\)/.test(fa) && /return 'frist'/.test(fa));
    pruefe('FrischeAuf sagt bei unvollstaendigem Auffrischen, dass die Mail trotzdem rausgeht', /Die Mail geht trotzdem raus/.test(fa));
    const iFrisch = sm.indexOf('[void](FrischeAuf $dash $std $stack $team $k.Text)');
    const iScope = sm.indexOf("' var s=r.setScope({std:'");
    const iNow = sm.indexOf('window.rcReportNow()');
    pruefe('Stundenmail: FrischeAuf laeuft je Kreis VOR dem Zuschnitt (setScope misst die Zeilen am frischen Stand) und VOR dem Report',
      iFrisch > 0 && iScope > iFrisch && iNow > iScope, iFrisch + ' < ' + iScope + ' < ' + iNow);
    // GEGENPROBE: steht der Aufruf hinter dem Report, muss die Reihenfolge-Pruefung anschlagen.
    const verdreht = sm.replace('[void](FrischeAuf $dash $std $stack $team $k.Text)', '') + '[void](FrischeAuf $dash $std $stack $team $k.Text)';
    pruefe('GEGENPROBE: die Reihenfolge-Pruefung erkennt ein Auffrischen NACH dem Report',
      !(verdreht.indexOf('[void](FrischeAuf $dash $std $stack $team $k.Text)') < verdreht.indexOf('window.rcReportNow()')));
    pruefe('Stundenmail: gleiche Zuschnitte hintereinander frischen nur einmal auf', /if \("\$std\|\$stack\|\$team" -ne \$frischFuer\)/.test(sm) && /\$frischFuer = "\$std\|\$stack\|\$team"/.test(sm));
    pruefe('die Standmarke nennt den Umbau', /\$StarterStand = '2026-10-05 /.test(CMD));
    const ps1 = fs.existsSync(path.join(DIR, 'ESL_Start.ps1')) ? fs.readFileSync(path.join(DIR, 'ESL_Start.ps1'), 'utf8') : '';
    pruefe('ESL_Start.ps1 ist nachgezogen (node ps1_erzeugen.js)', ps1.indexOf('function FrischeAuf($dash, $std, $stack, $team, $text) {') > 0 && ps1.indexOf('[void](FrischeAuf $dash $std $stack $team $k.Text)') > 0);
  }

  console.log('');
  if (aus) console.log(aus + ' Abschnitt(e) uebersprungen (siehe [--]).');
  console.log(rot ? rot + ' fehlgeschlagen, ' + ok + ' bestanden' : 'ALLE ' + ok + ' PRUEFUNGEN BESTANDEN');
})().catch(e => { console.log('ABBRUCH: ' + (e && e.stack || e)); console.log('1 fehlgeschlagen (Abbruch)'); process.exitCode = 1; });
