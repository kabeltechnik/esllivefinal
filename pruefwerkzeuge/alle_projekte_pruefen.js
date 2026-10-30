// Prueft den Alle-Projekte-Betrieb: Kabel + Mobile + UM in EINEM Dashboard.
// Seit 28.09. "ein Projekt nach Wahl": nur das AKTIVE Projekt laeuft im Takt,
// EIN Arbeitsrahmen faehrt fuer ein anderes Projekt ueber das Menue dorthin,
// jede Lieferung wird ueber das Mapping geprueft (Agent -> Team -> Stack -> Projekt).
// Die echten Funktionen werden per Klammerzaehlung aus esl_live_arena_v22.js
// geschnitten und mit new Function gegen Attrappen ausgewertet. Das ESL wird
// dabei so nachgebaut, wie es am 27.09. gemessen wurde: EIN aktuelles Projekt je
// Anmeldung; ein Neuaufbau der Liste (echter Klick, 5-Min-Auto-Refresh) nimmt
// das Projekt der ANMELDUNG. Zusammenfuehrung und Pruefung laufen gegen die echten
// Exporte aus "Excels vergleich" und die echte Mitarbeiter-Excel.
// ACHTUNG Dateinamen: am Mapping gemessen traegt "Kabel.xlsx" UM-Agenten (VUM_*),
// "Mobile.xlsx" Kabel-Agenten (VKD_Tech/OneC_Tech), "UM.xlsx" UM-Agenten — die
// Referenzexporte vom 09.08. sind selbst mit vertauschter Anmeldung entstanden.
// Aufruf: node alle_projekte_pruefen.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const V22 = fs.readFileSync(path.join(DIR, 'esl_live_arena_v22.js'), 'utf8');
const STECK = fs.readFileSync(path.join(DIR, 'projektwechsel_steckbrief.js'), 'utf8');

let ok = 0, rot = 0;
function pruefe(name, bed, info) {
  if (bed) ok++; else rot++;
  console.log((bed ? 'OK   ' : 'ROT  ') + name + (info ? '  (' + info + ')' : ''));
}
function schneide(src, kopf) {
  const a = src.indexOf(kopf);
  if (a < 0) throw new Error('nicht gefunden: ' + kopf);
  let i = src.indexOf('{', a), t = 0;
  for (; i < src.length; i++) { if (src[i] === '{') t++; else if (src[i] === '}' && --t === 0) break; }
  return src.slice(a, i + 1);
}
// Block einer Funktion (fuer Aussagen UEBER den Block, nicht ueber die Datei — Falle 18)
const block = kopf => schneide(V22, kopf);

// ---- Umgebung mit Attrappen bauen ----
// Seit 28.09. brauchen rcProduktGruppe/classify die Geraete-Regel (RC_KEIN_VERTRIEB + rcIstGeraet).
const GERAET_QUELL = V22.match(/const RC_KEIN_VERTRIEB = [^\n]+/)[0] + '\n' + schneide(V22, 'function rcIstGeraet(');
const QUELL = GERAET_QUELL + '\n' + ['function pad2(', 'function rcRowDayKey(', 'function rcProduktGruppe(', 'function rcAlleProjekteAn(',
  'function rcProjRahmenListe(', 'function rcProjEintrag(', 'function rcVerarbeiteAlle(', 'function rcLiveTick(', 'function rcAlleProjekteLage(',
  'function rcDienstModus(']   // Dienst-Schalter (27.10.): ohne Marke wie bisher — geprueft in dienst_schalter_pruefen.js
  .map(k => schneide(V22, k)).join('\n');
function umgebung(opt) {
  const env = {
    window: { rcProjektKuerzel: opt.kuerzel || '', rcProjektDaten: {}, rcRahmen: {}, rcIsInitialized: true, rcAktivProjekt: opt.aktiv || 'kabel' },
    location: { pathname: opt.pfad || '/Agents/secure/sis_vodafone.xhtml' },
    localStorage: { getItem: k => (opt.ls || {})[k] || null },
    aufrufe: [], stroeme: []
  };
  env.window.processDataStream = d => { env.stroeme.push({ daten: d, initVorher: env.window.rcIsInitialized }); env.window.rcIsInitialized = true; };
  const f = new Function('window', 'location', 'localStorage', 'holeExcelVomServer', 'rcProjektAbruf', 'rcRahmenHeute', 'RC_ESL_TOT_MIN',
    (opt.quell || QUELL) + '\nreturn { rcAlleProjekteAn, rcVerarbeiteAlle, rcLiveTick, rcAlleProjekteLage, rcProduktGruppe, rcRowDayKey };');
  env.fn = f(env.window, env.location, env.localStorage,
    () => env.aufrufe.push('haupt'), (key, anlass) => env.aufrufe.push(key + ':' + anlass), () => opt.heute || '2026-08-05', 5);
  return env;
}

// ---- 1. Wann ist der Betrieb an? ----
pruefe('Kabel-Seite im Portal: an', umgebung({}).fn.rcAlleProjekteAn() === true);
pruefe('Mobile-Seite (eigener Starter): aus', umgebung({ kuerzel: 'mob' }).fn.rcAlleProjekteAn() === false);
pruefe('UM-Seite: aus', umgebung({ kuerzel: 'um' }).fn.rcAlleProjekteAn() === false);
pruefe('Pruefseite ausserhalb /Agents/: aus', umgebung({ pfad: '/test_reportbilder.html' }).fn.rcAlleProjekteAn() === false);
pruefe('rcAlleProjekte(false) gespeichert: aus', umgebung({ ls: { rcAlleProjekteAus: '1' } }).fn.rcAlleProjekteAn() === false);

// ---- 2. Takt: NUR das aktive Projekt (Nutzer 28.09.) ----
{
  const e = umgebung({ aktiv: 'mobile' }); e.window.rcAlleProjekteModus = true;
  for (let i = 0; i < 3; i++) e.fn.rcLiveTick();
  pruefe('jeder Takt holt nur das aktive Projekt (Mobile)', e.aufrufe.join(',') === 'mobile:takt,mobile:takt,mobile:takt', e.aufrufe.join(','));
  e.window.rcAktivProjekt = 'um'; e.fn.rcLiveTick();
  pruefe('nach dem Umschalten nur noch UM', e.aufrufe[3] === 'um:takt', e.aufrufe[3]);
  const e2 = umgebung({}); e2.window.rcAlleProjekteModus = false;
  for (let i = 0; i < 3; i++) e2.fn.rcLiveTick();
  pruefe('Einzelprojekt: jeder Takt die eigene Seite (wie bisher)', e2.aufrufe.join(',') === 'haupt,haupt,haupt');
}
pruefe('kein setInterval(holeExcelVomServer ...) mehr', !/setInterval\(\s*holeExcelVomServer/.test(V22));
pruefe('drei Stellen setInterval(rcLiveTick, 20000)', (V22.match(/setInterval\(rcLiveTick, 20000\)/g) || []).length === 3);
{
  const liste = new Function(schneide(V22, 'function rcProjRahmenListe(') + '\nreturn rcProjRahmenListe();')();
  pruefe('drei Projekte mit exaktem Menuetext', liste.map(p => p.menue).join('|') === 'Vodafone Kabel|Vodafone Mobile|Vodafone UM');
  pruefe('ID-Praefix nur fuer Mobile/UM', liste.map(p => p.praefix).join('|') === '|M-|U-');
  const vs = new Function(schneide(V22, 'function rcProjektVonStack(') + '\nreturn rcProjektVonStack;')();
  pruefe('Stack -> Projekt: VKD_Tech/OneC_Tech Kabel, MF_* Mobile, VUM_* UM, Unbekanntes leer',
    vs('VKD_Tech') === 'kabel' && vs('OneC_Tech') === 'kabel' && vs('MF_CARE') === 'mobile' && vs('MF_TECH') === 'mobile' &&
    vs('VUM_Care') === 'um' && vs('VUM_Tech') === 'um' && vs('') === '' && vs('XYZ') === '');
}

// ---- 3.-10. brauchen die echten Exporte ----
(async () => {
  const Z = new Function(schneide(STECK, 'async function zipTexte(') + '\n' + schneide(STECK, 'function tabelle(') +
    '\nreturn { zipTexte, tabelle };')();
  async function lies(f, ordner) {
    const b = fs.readFileSync(path.join(DIR, ordner || 'Excels vergleich', f));
    return Z.tabelle(await Z.zipTexte(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
  }
  const K = await lies('Kabel.xlsx'), M = await lies('Mobile.xlsx'), U = await lies('UM.xlsx');
  const kopf = T => T[0].map(x => String(x || '').toLowerCase().trim());
  const hK = kopf(K), hM = kopf(M), hU = kopf(U), HEUTE = '2026-08-05';
  const heuteZeilen = T => { const i = kopf(T).indexOf('datum'); return T.slice(1).filter(r => r && String(r[i] || '').slice(0, 10) === HEUTE); };

  // ---- 3. Zusammenfuehren ----
  const e = umgebung({ heute: HEUTE }); e.window.rcAlleProjekteModus = true;
  e.window.rcProjektDaten = { mobile: { data: M, zeit: Date.now() } };
  e.fn.rcVerarbeiteAlle(true);
  const S0 = e.stroeme[0] && e.stroeme[0].daten;
  // Seit 28.09. kann Mobile aktiv sein, ohne dass es je einen Kabel-Stand gab.
  pruefe('ohne Kabel-Stand: Mobile laeuft trotzdem, auf dem Kabel-Spaltensatz',
    !!S0 && S0[0].join('|') === hK.concat(['rc_projekt']).join('|') && S0.length === 1 + heuteZeilen(M).length, S0 && (S0.length + ' Zeilen'));
  e.stroeme.length = 0;
  e.window.rcProjektDaten.kabel = { data: K, zeit: Date.now() };
  e.window.rcProjektDaten.um = { data: U, zeit: Date.now() };
  e.fn.rcVerarbeiteAlle(true);
  const S = e.stroeme[0] && e.stroeme[0].daten;
  pruefe('Datenstrom erzeugt', !!S);
  const kH = heuteZeilen(K), mH = heuteZeilen(M), uH = heuteZeilen(U);
  pruefe('Zeilen = Kabel heute + Mobile heute + UM heute', S.length === 1 + kH.length + mH.length + uH.length,
    S.length + ' = 1 + ' + kH.length + ' + ' + mH.length + ' + ' + uH.length);
  pruefe('Kabel-Teil: die Kabel-Zeilen von heute, unveraendert', kH.every((r, i) => S[1 + i].slice(0, hK.length).join('|') === r.slice(0, hK.length).map(x => x === undefined ? '' : x).join('|')));
  // Seit 05.10. haengt rcVerarbeiteAlle das PROJEKT der Lieferung als letzte Spalte an.
  pruefe('Kopfzeile ist die Kabel-Kopfzeile plus rc_projekt', S[0].join('|') === K[0].concat(['rc_projekt']).join('|'));
  const neu = S.slice(1 + kH.length);
  pruefe('jede zugefuehrte Zeile hat genau Kabel-Breite plus die Projekt-Spalte', neu.every(r => r.length === hK.length + 1), (hK.length + 1) + ' Spalten');
  // Jede Zeile traegt ihr Projekt (05.10.): daran haengt, dass ein Agent ohne
  // Mapping-Eintrag trotzdem seinem Projekt zugerechnet wird ("Kabel gesamt").
  {
    const iP = S[0].length - 1;
    const teilOk = (von, n, key) => S.slice(1 + von, 1 + von + n).every(r => r[iP] === key);
    pruefe('jede Zeile traegt das Projekt ihrer Lieferung (kabel / mobile / um)',
      kH.length > 0 && mH.length > 0 && uH.length > 0 && teilOk(0, kH.length, 'kabel') && teilOk(kH.length, mH.length, 'mobile') && teilOk(kH.length + mH.length, uH.length, 'um'));
    // Gegenprobe: die Bauart vor dem 05.10. (ohne die Spalte) muss durchfallen.
    const QALT = QUELL.replace("z.push(p.key);", '').replace("kopf.concat(['rc_projekt'])", 'kopf');
    const eA = QALT !== QUELL ? umgebung({ heute: HEUTE, quell: QALT }) : null;
    let altOhne = null;
    if (eA && eA.fn && eA.fn.rcVerarbeiteAlle) {
      eA.window.rcAlleProjekteModus = true;
      eA.window.rcProjektDaten = { kabel: { data: K, zeit: Date.now() }, mobile: { data: M, zeit: Date.now() } };
      eA.fn.rcVerarbeiteAlle(true);
      const SA = eA.stroeme[0] && eA.stroeme[0].daten;
      altOhne = !!SA && SA[0].indexOf('rc_projekt') === -1 && SA.slice(1).every(r => r.length === hK.length);
    }
    pruefe('Gegenprobe: die alte Bauart liefert KEINE Projekt-Spalte', altOhne === true, String(altOhne));
  }
  const iGr = hK.indexOf('produktgrupe'), iMk = hK.indexOf('produktmerkmal'), iPr = hK.indexOf('produkt'), iId = hK.indexOf('id');
  const mTeil = neu.slice(0, mH.length), uTeil = neu.slice(mH.length);
  pruefe('Mobile: "produktgruppe" landet in der Kabel-Gruppenspalte',
    mTeil.every((r, j) => r[iGr] === mH[j][hM.indexOf('produktgruppe')]) && mTeil.some(r => r[iGr]));
  pruefe('Mobile: osf_id faellt weg', !mTeil.some(r => r.includes(mH[0][hM.indexOf('osf_id')]) && mH[0][hM.indexOf('osf_id')]));
  pruefe('UM: Gruppenspalte leer (UM liefert keine)', uTeil.every(r => r[iGr] === ''));
  // Gegenprobe zur Positions-Falle: nach Position stuende bei UM das produktmerkmal in Spalte 5
  pruefe('UM: produktmerkmal steht in der Merkmal-Spalte, nicht in der Gruppe',
    uTeil.every((r, j) => r[iMk] === uH[j][hU.indexOf('produktmerkmal')]) && uH.length > 0 && uH[0][5] === uH[0][hU.indexOf('produktmerkmal')]);
  // Etwa die Haelfte aller Zeilen hat KEINEN Produktnamen (Kontakt ohne Angebot) —
  // gemessen wird nur, wo ein Name steht.
  const mitName = uTeil.filter(r => String(r[iPr] || '').trim());
  const abgeleitet = mitName.filter(r => e.fn.rcProduktGruppe(r[iGr], r[iPr])).length;
  pruefe('UM: jede Zeile MIT Produktnamen bekommt eine Gruppe', mitName.length > 0 && abgeleitet === mitName.length,
    abgeleitet + '/' + mitName.length);
  // Natuerliches Experiment: UM.xlsx und Kabel.xlsx vom 09.08. tragen DIESELBEN Datensaetze
  // (beides UM-Daten, die Kabel-Seite exportierte sie in Kabel-Spalten) — die abgeleitete
  // Gruppe laesst sich also gegen die ECHTE Gruppenspalte derselben Datensaetze halten.
  // Ausgenommen "Info World" (Potential Tracking, faellt im Parser heraus).
  const echt = {};
  K.slice(1).forEach(r => { echt[r[iId] + '|' + r[iPr]] = String(r[iGr] || ''); });
  let gleich = 0, verglichen = 0, erstAbw = '';
  uH.forEach(r => {
    const p = String(r[hU.indexOf('produkt')] || '').trim(), g = e.fn.rcProduktGruppe('', p), k = echt[r[hU.indexOf('id')] + '|' + p];
    if (!p || p === 'Info World' || k == null) return;
    verglichen++; if (g.toLowerCase() === k.toLowerCase()) gleich++; else if (!erstAbw) erstAbw = p + ' -> ' + g + ', echt ' + k;
  });
  pruefe('UM: abgeleitete Gruppe = echte Gruppe derselben Datensaetze', verglichen > 100 && gleich === verglichen, gleich + '/' + verglichen + (erstAbw ? ' · ' + erstAbw : ''));
  pruefe('IDs: Mobile mit "M-", UM mit "U-", Kabel unveraendert',
    mTeil.every(r => !r[iId] || String(r[iId]).startsWith('M-')) && uTeil.every(r => !r[iId] || String(r[iId]).startsWith('U-')) &&
    S[1][iId] === kH[0][iId]);
  // Gegenprobe: ohne Praefix gaebe es mit diesen Dateien Kollisionen (dieselben Datensaetze)
  const kIds = new Set(K.slice(1).map(r => String(r[iId])));
  const ohnePraefix = uH.filter(r => kIds.has(String(r[hU.indexOf('id')]))).length;
  const mitPraefix = uTeil.filter(r => kIds.has(String(r[iId]))).length;
  pruefe('Praefix verhindert ID-Kollisionen (Gegenprobe ohne Praefix > 0)', ohnePraefix > 0 && mitPraefix === 0,
    'ohne ' + ohnePraefix + ', mit ' + mitPraefix);
  pruefe('Zeilen anderer Tage bleiben draussen (auch bei Kabel)', mH.length < M.length - 1 && kH.length < K.length - 1,
    kH.length + ' von ' + (K.length - 1) + ' Kabel-Zeilen sind vom ' + HEUTE);
  pruefe('frische Lieferung: rcIsInitialized vor der Verarbeitung auf false', e.stroeme[0].initVorher === false);
  e.fn.rcVerarbeiteAlle(false);
  pruefe('Takt-Lieferung: kein erneuter Erststart', e.stroeme[1].initVorher === true);

  // ---- 4. Warnstreifen: nur das AKTIVE Projekt ----
  const w = umgebung({ aktiv: 'mobile' }); w.window.rcAlleProjekteModus = true;
  w.window.rcProjektStartZeit = Date.now() - 10 * 60000;
  w.window.rcRahmen = { mobile: { grund: 'Reiter "Projektergebnisse" fehlt' } };
  w.window.rcProjektDaten = { um: { data: [[]], zeit: Date.now() - 60 * 60000 } };
  const lage = w.fn.rcAlleProjekteLage();
  pruefe('Streifen: aktives Mobile ohne Zahlen seit 10 Min wird gemeldet, mit Grund',
    lage.length === 1 && /Mobile: noch keine Zahlen/.test(lage[0]) && /Projektergebnisse/.test(lage[0]), lage[0]);
  pruefe('Streifen: ein NICHT aktives, altes UM wird nicht gemeldet (steht gewollt)', !lage.some(t => /UM/.test(t)));
  w.window.rcRahmen.mobile = { grund: 'ESL lieferte fremde Daten — Daten gehoeren zu UM', falschSeit: Date.now() };
  w.window.rcProjektDaten.mobile = { data: [[]], zeit: Date.now() };
  const lage2 = w.fn.rcAlleProjekteLage();
  pruefe('Streifen: verworfene fremde Daten stehen SOFORT drin', lage2.length === 1 && /fremde Daten/.test(lage2[0]), lage2[0]);
  const w2 = umgebung({}); w2.window.rcAlleProjekteModus = false;
  pruefe('Streifen: im Einzelprojekt nichts', w2.fn.rcAlleProjekteLage().length === 0);
  pruefe('rcQuellenWatchTick liest rcAlleProjekteLage', block('function rcQuellenWatchTick(').includes('rcAlleProjekteLage()'));

  // ---- 5. Verdrahtung ----
  const hk = block('function handleKpiMessage(');
  pruefe('Ligaliste: fremdes Projekt wird im Alle-Projekte-Betrieb angenommen',
    /d\.projekt !== rcEigenesProjekt\(\) && !window\.rcAlleProjekteModus\) return false/.test(hk));
  pruefe('Warteschleife: Projektfilter unveraendert (nur Liga geoeffnet)',
    /payload\.projekt && payload\.projekt !== rcEigenesProjekt\(\)\) return;/.test(V22));
  const start = V22.slice(V22.lastIndexOf("rcLog.log('Bibliotheken bereit."), V22.lastIndexOf("rcLog.log('Bibliotheken bereit.") + 600);
  pruefe('Start: erster Abruf (aktives Projekt) vor rcAlleProjekteStart', start.indexOf('holeExcelVomServer();') < start.indexOf('rcAlleProjekteStart();') &&
    start.indexOf('rcAlleProjekteStart();') !== -1);
  const ab = block('async function rcRahmenAufbau(');
  // Die ZUWEISUNG pruefen, nicht das Vorkommen — der Kommentar darueber nennt die
  // verbotenen Werte selbst (Falle 1 in CLAUDE.md).
  const sb = (/setAttribute\('sandbox', '([^']*)'\)/.exec(ab) || [])[1];
  pruefe('Rahmen-Sandbox genau: Skripte, eigene Herkunft, Formulare', sb === 'allow-scripts allow-same-origin allow-forms', sb);
  const css = (/f\.style\.cssText = '([^']*)'/.exec(ab) || [])[1] || '';
  pruefe('Rahmen gelayoutet (1400x900, unsichtbar), nicht display:none',
    /width:1400px/.test(css) && /opacity:0/.test(css) && /pointer-events:none/.test(css) && !/display:\s*none/.test(css), css);
  pruefe('EIN Rahmen: jeder Aufbau raeumt ALLE Rahmen ab (Selektor ohne Projekt)',
    /document\.querySelectorAll\('iframe\[data-rc-projekt\]'\)\.forEach\(function\(x\)\{ x\.remove\(\); \}\)/.test(ab));
  pruefe('Aufbau merkt sich, worauf die Anmeldung steht (erst NACH dem Erfolg)',
    ab.indexOf("window.rcSitzungProjekt = '';") !== -1 && ab.indexOf("window.rcSitzungProjekt = '';") < ab.indexOf('link.click()') &&
    ab.indexOf('window.rcSitzungProjekt = p.key;') > ab.indexOf("st.bereit = true"));
  const hx = block('async function holeExcelVomServer(');
  pruefe('holeExcelVomServer leitet im Alle-Projekte-Betrieb an das aktive Projekt um (vor jedem eigenen Abruf)',
    /if \(window\.rcAlleProjekteModus\) return rcProjektAbruf\(window\.rcAktivProjekt, 'haupt'\);/.test(hx) &&
    hx.indexOf('rcProjektAbruf(window.rcAktivProjekt') < hx.indexOf("getElementById('filterForm')"));
  pruefe('verarbeiteExcelBuffer schreibt keinen Kabel-Stand mehr am Rahmen vorbei', !/rcProjektDaten/.test(block('function verarbeiteExcelBuffer(')));
  const fr = block('async function rcFetchRangeViaUI(');
  pruefe('Bereichs-Export: erst Anmeldung auf Kabel, dann der echte Klick',
    fr.indexOf("rcProjektAbruf('kabel', 'historie')") !== -1 && fr.indexOf("rcProjektAbruf('kabel', 'historie')") < fr.indexOf('rcFetchRangeViaUIIntern('));
  // Beide Bereichs-Wege laufen ueber EINE Pruefstelle (28.09.): der fetch-Rueckfall
  // rcFetchRangeBuffer lief bis dahin ungeprueft — genau dann, wenn der UI-Weg nichts
  // brachte, weil sich die Anmeldung nicht auf Kabel stellen liess.
  const bp = block('function rcBereichPruefen(');
  pruefe('Bereichs-Export: Pruefstelle prueft ueber das Mapping und verwirft fremde Daten',
    // 27.10.: optional ein Projekt (Datendienst), sonst wie bisher das der Seite.
    /rcProjektPruefen\(projekt \|\| rcEigenesProjektKey\(\), sh\.data, true\)/.test(bp) && /pr\.urteil === 'falsch'/.test(bp) && bp.indexOf('return null;', bp.indexOf("pr.urteil === 'falsch'")) !== -1);
  pruefe('Bereichs-Export UI-Weg endet in der Pruefstelle', /return rcBereichPruefen\(buf, fromStr, toStr\);\s*\}\s*$/.test(fr));
  const fb = block('async function rcFetchRangeBuffer(');
  pruefe('Bereichs-Export fetch-Rueckfall endet in der Pruefstelle (nicht mehr roh)',
    /return rcBereichPruefen\(await response\.arrayBuffer\(\), fromStr, toStr\);/.test(fb) && !/return await response\.arrayBuffer\(\);/.test(fb));
  {
    // Funktional: echte Pruefstelle, echtes rcProjektPruefen waere Abschnitt 8 — hier
    // genuegt ein Urteil-Stub, gemessen wird die Weiche selbst.
    let warn = 0, gelesen = 0;
    const mach = (urteil, code) => new Function('rcReadSheet', 'rcProjektPruefen', 'rcEigenesProjektKey', 'rcLog',
      (code || bp) + '\nreturn rcBereichPruefen;')(() => { gelesen++; return { data: [['x']] }; }, () => ({ urteil: urteil, text: 't' }), () => 'kabel', { warn: () => warn++ });
    const buf = new Uint8Array([0x50, 0x4b, 3, 4]).buffer;                   // xlsx = ZIP, beginnt mit "PK"
    pruefe('Pruefstelle: fremde Daten -> null + Warnung', mach('falsch')(buf, 'a', 'b') === null && warn === 1, warn);
    pruefe('Pruefstelle: eigene/unklare Daten gehen durch', mach('ok')(buf, 'a', 'b') === buf && mach('unklar')(buf, 'a', 'b') === buf);
    pruefe('Pruefstelle: kein Puffer bleibt kein Puffer', mach('falsch')(null, 'a', 'b') === null && warn === 1);
    // 28.09. am Schein-ESL: ein Export mit falschem Knopf lieferte die SEITE; das
    // Einlesen warf "could not find <table>" und riss den Monatslauf samt Rueckfaellen mit.
    const seite = new TextEncoder().encode('<!DOCTYPE html><html><body>ESL</body></html>').buffer;
    const vorher = gelesen;
    pruefe('Pruefstelle: Seite statt Excel -> null + Warnung, ohne Einlesen', mach('ok')(seite, 'a', 'b') === null && warn === 2 && gelesen === vorher, warn + '/' + (gelesen - vorher));
    const ohnePk = bp.replace(/const pk = [\s\S]*?return null;\s*\}\n/, '');
    pruefe('Gegenprobe: ohne die PK-Pruefung ginge die Seite ins Einlesen und als Ergebnis durch',
      ohnePk !== bp && mach('ok', ohnePk)(seite, 'a', 'b') === seite && gelesen === vorher + 1);
  }
  pruefe('rcPortalAufHeute fasst die Kabel-Seite im Alle-Projekte-Betrieb nicht an',
    /if \(window\.rcAlleProjekteModus\) return false;/.test(block('async function rcPortalAufHeute(')));
  const sf = V22.slice(V22.indexOf("document.getElementById('rcStackFilter').addEventListener('change'"));
  const sfBlock = sf.slice(0, sf.indexOf('});') + 3);
  pruefe('Stack-Filter: ein Stack eines anderen Projekts macht dieses aktiv',
    /rcProjektVonStack\(v\)/.test(sfBlock) && /key !== window\.rcAktivProjekt\) window\.rcProjektWechseln\(key/.test(sfBlock));
  const ok1 = block('window.rcOpenKpiQuelle = function(');
  pruefe('Ligaliste: laufendes Fenster wird wiedergefunden, nicht neu geladen',
    ok1.indexOf("window.open('', kpiName)") !== -1 && ok1.indexOf("window.open('', kpiName)") < ok1.indexOf('w.location.href = kpiUrl'));

  // ---- 6. Autopilot laeuft nie in Rahmen (alle drei Fassungen) ----
  ['esl_autopilot.user.js', 'esl_autopilot_mobile.user.js', 'esl_autopilot_um.user.js'].forEach(n => {
    const s = fs.readFileSync(path.join(DIR, n), 'utf8');
    const w1 = s.indexOf('window.top !== window.self'), w2 = s.indexOf('window.__rcAutoPilotV2 = true');
    pruefe(n + ': Rahmen-Sperre vor dem Start', w1 !== -1 && w2 !== -1 && w1 < w2);
  });

  // ---- 7. Leerlauf-Zaehler auch im Rahmen (27.09. abends) ----
  // Das Portal hat einen 4-h-IdleMonitor. Das Dashboard setzte ihn nur auf der
  // Kabel-Seite zurueck; in einem Rahmen bewegt sich nie eine Maus -> nach 4 h
  // springt er auf die Login-Seite. FUNKTIONAL mit Attrappen gemessen.
  {
    const KA = schneide(V22, 'function rcLeerlaufZurueck(') + '\n' + schneide(V22, 'function rcKeepAliveTick(') + '\n' + schneide(V22, 'function rcDienstModus(');
    const fenster = (name, prot) => {
      const doc = { body: { n: name + '.body' }, n: name + '.document', dispatchEvent: ev => prot.push(name + ':event:' + ev.type) };
      const W = { n: name, document: doc };
      W.Event = function (t) { this.type = t; };
      const jq = el => ({ idleTimer: cmd => prot.push(name + ':idleTimer:' + cmd + ':' + (el && el.n)) });
      jq.fn = { idleTimer: function () {} };
      W.jQuery = jq;
      W.PrimeFaces = { widgets: {
        leer: { cfg: { timeout: 14400000 }, pause() {}, resume() {}, reset() { prot.push(name + ':IdleMonitor:reset'); } },
        poll: { cfg: { frequency: 60 }, start() { prot.push(name + ':POLL-angefasst'); }, stop() { prot.push(name + ':POLL-angefasst'); } } } };
      return W;
    };
    const lauf = (code, lebt) => {
      const prot = [], W0 = fenster('oben', prot), R1 = fenster('mobile', prot), R2 = fenster('um', prot);
      W0.rcSessionState = { alive: lebt };
      W0.document.querySelectorAll = sel => sel === 'iframe[data-rc-projekt]'
        ? [{ contentWindow: R1 }, { contentWindow: R2 }, { contentWindow: null }] : [];
      new Function('window', 'document', 'rcJq', 'rcNowStamp', code + '\nreturn rcKeepAliveTick;')(W0, W0.document, () => W0.jQuery, () => '12:00:00')();
      return { prot, W0 };
    };
    const r = lauf(KA, true);
    pruefe('Leerlauf: Kabel-Seite wird weiter zurueckgesetzt', r.prot.includes('oben:idleTimer:reset:oben.document') && r.prot.includes('oben:IdleMonitor:reset'));
    pruefe('Leerlauf: Rahmen Mobile wird zurueckgesetzt', r.prot.includes('mobile:idleTimer:reset:mobile.document') && r.prot.includes('mobile:IdleMonitor:reset'));
    pruefe('Leerlauf: Rahmen UM wird zurueckgesetzt', r.prot.includes('um:idleTimer:reset:um.document') && r.prot.includes('um:IdleMonitor:reset'));
    pruefe('Leerlauf: Aktivitaet im Rahmen-Dokument (mousemove)', r.prot.includes('um:event:mousemove'));
    pruefe('Leerlauf: Poll-Widgets bleiben unangetastet', !r.prot.some(x => /POLL-angefasst/.test(x)));
    pruefe('Leerlauf: Rahmen ohne Fenster bricht nichts ab', r.W0.rcSessionState.lastReset === true && r.W0.rcSessionState.lastAlive === '12:00:00');
    pruefe('Leerlauf: tote Sitzung -> nichts wird angefasst', lauf(KA, false).prot.length === 0);
    // Gegenprobe: ohne die Rahmen-Schleife (Stand vor dem 27.09. abends) bleibt
    // der Rahmen-Zaehler stehen - genau das muessen die Pruefungen oben erkennen.
    const ohne = KA.replace(/document\.querySelectorAll\('iframe\[data-rc-projekt\]'\)\.forEach\([\s\S]*?\n {12}\}\);/, '');
    const g = lauf(ohne, true);
    pruefe('Gegenprobe: ohne Rahmen-Schleife wird der Rahmen NICHT zurueckgesetzt',
      ohne !== KA && g.prot.includes('oben:IdleMonitor:reset') && !g.prot.some(x => /^(mobile|um):/.test(x)));
  }

  // ---- 8. Pruefung jeder Lieferung gegen das echte Mapping ----
  // Mapping wie im Dashboard: Agent (VO- oder CCS-Nummer) -> Team -> Stack.
  const MT = await lies('Mitarbeiter_IDS_Final_komplett.xlsx', '.');
  const mi = MT.findIndex(r => r && r.some(c => /ccs_user/i.test(String(c || ''))));
  const mh = MT[mi].map(c => String(c || '').toLowerCase().trim());
  const MAP = { voMap: {}, ccsMap: {}, stackMap: {} };
  const iT = mh.indexOf('team'), iC = mh.indexOf('ccs_user'), iS = mh.indexOf('stack'), voSp = mh.map((x, i) => /^vo_id/.test(x) ? i : -1).filter(i => i >= 0);
  MT.slice(mi + 1).forEach(r => {
    if (!r) return;
    const team = String(r[iT] || '').trim(), stack = String(r[iS] || '').trim();
    if (!team) return;
    if (stack) MAP.stackMap[team] = stack;
    const ein = { team: team };
    if (r[iC]) MAP.ccsMap[String(r[iC]).trim()] = ein;
    voSp.forEach(i => { if (r[i] != null && String(r[i]).trim()) MAP.voMap[String(r[i]).trim()] = ein; });
  });
  const PRUEF = ['function pad2(', 'function rcRowDayKey(', 'function rcProjRahmenListe(', 'function rcProjEintrag(', 'function rcProjektVonStack(',
    'function rcProjektVonVo(', 'function rcProjektPruefen(', 'function rcProjektIds(', 'function rcProjektGleichMit(', 'function rcHistorieFremdeTage(']
    .map(k => schneide(V22, k)).join('\n');
  const pf = (map, heute) => new Function('window', 'rcRahmenHeute', PRUEF + '\nreturn { rcProjektPruefen, rcHistorieFremdeTage };')(
    { rcWcaMapping: map, rcProjektDaten: {} }, () => heute || HEUTE);
  const P = pf(MAP);
  const pK = P.rcProjektPruefen('kabel', M, true), pU = P.rcProjektPruefen('um', U, true), pF = P.rcProjektPruefen('kabel', K, true), pM = P.rcProjektPruefen('mobile', M, true);
  pruefe('echte Kabel-Daten ("Mobile.xlsx", VKD/OneC) als Kabel: ok', pK.urteil === 'ok', pK.text);
  pruefe('echte UM-Daten ("UM.xlsx") als UM: ok', pU.urteil === 'ok', pU.text);
  pruefe('"Kabel.xlsx" (Kabel-Spalten, UM-Agenten) als Kabel: FALSCH, gehoert zu UM', pF.urteil === 'falsch' && /gehoeren zu UM/.test(pF.text), pF.text);
  pruefe('Kabel-Daten als Mobile ausgegeben: FALSCH, gehoert zu Kabel', pM.urteil === 'falsch' && /gehoeren zu Kabel/.test(pM.text), pM.text);
  const pOhne = pf({}).rcProjektPruefen('kabel', M, true);
  pruefe('ohne Mapping: unklar (nicht pruefbar), nie "falsch"', pOhne.urteil === 'unklar', pOhne.text);
  const pWenig = P.rcProjektPruefen('kabel', [K[0]].concat(K.slice(1, 6)), true);
  pruefe('unter 10 zuordenbaren Zeilen: unklar', pWenig.urteil === 'unklar', pWenig.text);
  // Echte Mobile-Daten (MF_*) liegen nicht vor — aus Kabel-Zeilen gebaut: gleiche
  // Zeilen, Agenten aus MF-Teams des echten Mappings, eigene Datensatz-IDs.
  const mfVos = Object.keys(MAP.voMap).filter(v => /^MF/i.test(MAP.stackMap[MAP.voMap[v].team] || ''));
  const iVoM = hM.indexOf('vo_nummer'), iIdM = hM.indexOf('id');
  const MOB = [M[0]].concat(M.slice(1).map((r, j) => { const z = r.slice(); z[iVoM] = mfVos[j % mfVos.length]; z[iIdM] = 'X' + r[iIdM]; return z; }));
  const pMob = P.rcProjektPruefen('mobile', MOB, true);
  pruefe('Mobile-Daten (MF-Agenten) als Mobile: ok', mfVos.length > 5 && pMob.urteil === 'ok', mfVos.length + ' MF-Agenten, ' + pMob.text);

  // ---- 9. Abruf funktional: ESL mit EINEM Projekt je Anmeldung nachgebaut ----
  // Server-Modell (27.09. gemessen): esl.sitzung = Projekt der Anmeldung (Menue-Klick);
  // esl.rahmen = Projekt, an das die Liste der Rahmen-Seite gebunden ist (beim
  // Hinfahren = Anmeldung; ein Auto-Refresh baut sie mit esl.sitzung neu). Der Export
  // liefert die Daten von esl.rahmen.
  const DATEN = { kabel: M, mobile: MOB, um: U };
  const ABRUF = ['function pad2(', 'function rcRowDayKey(', 'function rcProjRahmenListe(', 'function rcProjEintrag(', 'function rcProjektVonStack(',
    'function rcProjektVonVo(', 'function rcProjektPruefen(', 'function rcProjektIds(', 'function rcProjektGleichMit(', 'async function rcProjektAbruf(',
    'function rcProjektFehlschlag(', 'function rcVerarbeiteAlle(', 'function rcProjektLieferung(', 'function rcDienstModus('].map(k => schneide(V22, k)).join('\n');
  function abrufUmgebung(code, exportArt) {
    const esl = { sitzung: '', rahmen: null, fahrten: [] };
    const W = { rcRahmen: {}, rcProjektDaten: {}, rcRahmenGen: 1, rcProjektAbrufLaeuft: null, rcSitzungProjekt: '', rcAktivProjekt: 'kabel',
                rcWcaMapping: MAP, rcIsInitialized: true, rcHarvestBusy: false };
    const prot = { erfolg: [], fehlschlag: [], sitzungWeg: [], warn: [], stroeme: 0 };
    W.processDataStream = () => { prot.stroeme++; };
    let lieferung = null;
    const aufbau = async p => {
      Object.keys(W.rcRahmen).forEach(k => { if (k !== p.key) { W.rcRahmen[k].bereit = false; W.rcRahmen[k].f = null; } });
      const st = W.rcRahmen[p.key];
      esl.sitzung = p.key; esl.rahmen = p.key; esl.fahrten.push(p.key);
      st.bereit = true; st.f = { isConnected: true }; st.tag = HEUTE; st.anmeldung = false;
      W.rcSitzungProjekt = p.key;
    };
    const exp = async () => { if (exportArt && exportArt()) return { art: exportArt() }; lieferung = DATEN[esl.rahmen]; return { art: 'excel', buf: new ArrayBuffer(2) }; };
    const XLSX = { read: () => ({ SheetNames: ['s'], Sheets: { s: lieferung } }), utils: { sheet_to_json: ws => ws } };
    const f = new Function('window', 'rcRahmenAufbau', 'rcRahmenExport', 'XLSX', 'rcRahmenHeute', 'rcEslErfolg', 'rcEslFehlschlag',
      'rcSessionLost', 'rcProjektKnoepfe', 'rcLog', code + '\nreturn rcProjektAbruf;');
    const abruf = f(W, aufbau, exp, XLSX, () => HEUTE, () => prot.erfolg.push(W.rcAktivProjekt), g => prot.fehlschlag.push(g),
      g => prot.sitzungWeg.push(g), () => {}, { log() {}, warn: t => prot.warn.push(t) });
    return { esl, W, prot, abruf };
  }
  {
    const A = abrufUmgebung(ABRUF);
    for (let i = 0; i < 3; i++) await A.abruf('kabel', 'takt');
    pruefe('aktiv Kabel: drei Takte, EIN Hinfahren', A.esl.fahrten.join(',') === 'kabel', A.esl.fahrten.join(','));
    pruefe('...drei gepruefte Lieferungen, Erfolg dreimal gemeldet', A.W.rcProjektDaten.kabel.pruefung === 'ok' && A.prot.erfolg.length === 3);
    A.W.rcAktivProjekt = 'mobile';
    const r1 = await A.abruf('mobile', 'haupt');
    pruefe('Umschalten auf Mobile: faehrt ueber das Menue hin, Lieferung geprueft', r1.ok && A.esl.fahrten.join(',') === 'kabel,mobile' && A.W.rcProjektDaten.mobile.pruefung === 'ok', JSON.stringify(r1));
    pruefe('...der Kabel-Stand bleibt stehen (wird nur beim Umschalten neu geholt)', A.W.rcProjektDaten.kabel.data === M);
    const erfolgVor = A.prot.erfolg.length;
    const r2 = await A.abruf('um', 'knopf');
    pruefe('Einmal UM holen (Export-Dialog): hin, geprueft, zaehlt NICHT als Erfolg des aktiven Mobile', r2.ok && A.esl.sitzung === 'um' && A.prot.erfolg.length === erfolgVor);
    await A.abruf('mobile', 'takt');
    pruefe('...der naechste Takt faehrt von selbst zum aktiven Mobile zurueck', A.esl.fahrten.join(',') === 'kabel,mobile,um,mobile', A.esl.fahrten.join(','));
    // Anmeldung wird von aussen umgestellt (zweiter Tab) und der Auto-Refresh baut die
    // Rahmen-Liste mit UM neu — der Rahmen "steht" auf Mobile, liefert aber UM.
    A.esl.sitzung = 'um'; A.esl.rahmen = 'um';
    const altMob = A.W.rcProjektDaten.mobile;
    const r3 = await A.abruf('mobile', 'takt');
    pruefe('fremde Daten (UM statt Mobile) werden VERWORFEN, der Mobile-Stand bleibt', !r3.ok && /fremde Daten/.test(r3.grund) && A.W.rcProjektDaten.mobile === altMob, r3.grund);
    pruefe('...und sichtbar: Fehlschlag des aktiven Projekts gemeldet, Warnung im Log', A.prot.fehlschlag.length === 1 && A.prot.warn.some(t => /fremde Daten/.test(t)));
    const r4 = await A.abruf('mobile', 'takt');
    pruefe('...der naechste Takt faehrt neu hin und liefert wieder Mobile', r4.ok && A.esl.fahrten[A.esl.fahrten.length - 1] === 'mobile' && A.W.rcProjektDaten.mobile.data === MOB);
    // Sperre: EIN Abruf zur Zeit
    A.W.rcProjektAbrufLaeuft = { key: 'kabel', anlass: 'haupt', seit: Date.now() };
    const r5 = await A.abruf('mobile', 'takt');
    pruefe('laeuft schon ein Abruf, verzichtet der Takt', !r5.ok && r5.grund === 'belegt');
    A.W.rcProjektAbrufLaeuft = { key: 'kabel', anlass: 'haupt', seit: Date.now() - 200000 };
    const r6 = await A.abruf('mobile', 'takt');
    pruefe('eine verwaiste Sperre (> 3 Min) haelt nichts auf', r6.ok);
    A.W.rcHarvestBusy = true;
    const r7 = await A.abruf('mobile', 'takt'), r8 = await A.abruf('kabel', 'historie');
    pruefe('waehrend der Historie: kein Takt-Abruf, aber der Historien-Vorlauf auf Kabel darf', !r7.ok && r8.ok && A.esl.sitzung === 'kabel');
  }
  {
    // Gegenprobe: OHNE die Pruefung haette derselbe Ablauf UM-Daten als Mobile uebernommen.
    const ohne = ABRUF.replace("if (pr.urteil === 'falsch' || gleich) {", 'if (false) {');
    const B = abrufUmgebung(ohne);
    B.W.rcAktivProjekt = 'mobile';
    await B.abruf('mobile', 'takt');
    B.esl.sitzung = 'um'; B.esl.rahmen = 'um';
    await B.abruf('mobile', 'takt');
    pruefe('Gegenprobe: ohne Pruefung stuenden UM-Daten unter Mobile', ohne !== ABRUF && B.W.rcProjektDaten.mobile.data === U);
  }
  {
    // Eine gepruefte Lieferung entlarvt einen falschen Stand eines ANDEREN Projekts:
    // Kabel haelt dieselben Datensaetze wie das gepruefte UM -> Kabel-Stand verworfen.
    const C = abrufUmgebung(ABRUF);
    C.W.rcProjektDaten.kabel = { data: U, zeit: Date.now(), pruefung: 'unklar' };
    C.W.rcAktivProjekt = 'um';
    const r = await C.abruf('um', 'takt');
    pruefe('gepruefte UM-Lieferung verwirft einen Kabel-Stand mit denselben Datensaetzen', r.ok && !C.W.rcProjektDaten.kabel && /verworfen/.test((C.W.rcRahmen.kabel || {}).grund || ''));
    // Anmeldeseite statt Excel -> Sitzung abgemeldet melden (die Neuanmeldung macht der Starter)
    const D = abrufUmgebung(ABRUF, () => 'anmeldung');
    const rd = await D.abruf('kabel', 'takt');
    pruefe('Anmeldeseite im Rahmen -> rcSessionLost', !rd.ok && D.prot.sitzungWeg.length === 1);
  }

  // ---- 10. Historie: vertauscht geholte Tage werden erkannt ----
  {
    const vosAus = T => { const i = kopf(T).indexOf('vo_nummer'), s = new Set(); T.slice(1).forEach(r => { if (r && r[i]) s.add(String(r[i]).trim()); }); return [...s]; };
    const tag = vos => { const b = {}; vos.forEach(v => { b[v] = { k: 1 }; }); return { kontakte: vos.length, byAgent: b }; };
    const umVos = vosAus(U), kabVos = vosAus(M);
    const hist = { '2026-08-01': tag(umVos), '2026-08-02': tag(kabVos), '2026-08-03': tag(umVos.slice(0, 5)), '2026-08-05': tag(umVos) };
    const P2 = pf(MAP, '2026-08-05');
    const fremd = P2.rcHistorieFremdeTage(hist, 'kabel');
    pruefe('Kabel-Historie: Tag mit UM-Agenten wird erkannt, Kabel-Tag nicht', fremd.join(',') === '2026-08-01', fremd.join(','));
    pruefe('...zu wenige Agenten (5) und HEUTE bleiben unangetastet', fremd.indexOf('2026-08-03') === -1 && fremd.indexOf('2026-08-05') === -1);
    pruefe('...derselbe UM-Tag ist in einer UM-Historie richtig', P2.rcHistorieFremdeTage(hist, 'um').indexOf('2026-08-01') === -1);
    const hv = block('async function rcHarvestEslHistory(');
    pruefe('Harvest: verwirft erkannte Tage und stoesst den Monatslauf neu an',
      /rcHistorieFremdeTage\(hist, rcEigenesProjektKey\(\)\)/.test(hv) && /removeItem\(rcKey\('rcEslMonatsHarvest'\)\)/.test(hv) &&
      hv.indexOf('rcHistorieFremdeTage(') < hv.indexOf('const missing = []'));
  }

  // ---- 11. Export/Report: ESL-Agenten von HEUTE ohne Dashboard-Filter (28.09.) ----
  // rcLetzteStats ist beim Parsen auf den Dashboard-Filter geschnitten. Im Browser
  // gemessen (Schein-ESL): Filter VUM_Care, Export "Alle Stacks" -> 53 statt 614.
  {
    const pds = block('window.processDataStream = function');
    pruefe('Parser: Schalter __rcParseOhneFilter stellt Standort UND Stack auf ALL',
      /const ohneFilter = window\.__rcParseOhneFilter === true;/.test(pds) &&
      /const filterVal = ohneFilter \? 'ALL' : /.test(pds) && /const filterStack = \(!ohneFilter && stackSel\) \? stackSel\.value : 'ALL';/.test(pds));
    pruefe('Parser: Team-Auswahl wird im ungefilterten Durchlauf NICHT neu gebaut', /if \(!ohneFilter\) updateTeamFilter\(filterVal, teamInfo\);/.test(pds));
    const sr = block('function rcStandRows(');
    pruefe('rcStandRows (heute) holt die ESL-Agenten aus dem Vollbestand',
      /const agentsVoll = live \? rcAgentenVollbestand\(\) : \[\];/.test(sr) && /const agentsAll2 = agentsVoll;/.test(sr) &&
      !/const agentsAll2 = window\.rcLetzteStats/.test(sr) && (sr.match(/rcAgentenVollbestand\(\)/g) || []).length === 1);
    const vb = block('function rcAgentenVollbestand(');
    // Mini-Parser: liefert je nach Schalter den vollen oder den gefilterten Bestand.
    const lauf = (filter, wirf) => {
      const prot = [];
      const W = { __rcParseOhneFilter: false, rcLetzterDatenstrom: [['kopf']], rcLetzteStats: { agentStats: { a: {} } } };
      W.processDataStream = () => {
        prot.push(W.__rcParseOhneFilter);
        if (wirf && W.__rcParseOhneFilter) throw new Error('Parser kaputt');
        W.rcLetzteStats = { agentStats: W.__rcParseOhneFilter ? { a: {}, b: {}, c: {} } : { a: {} } };
      };
      const D = { getElementById: id => ({ rcStandortFilter: { value: 'ALL' }, rcStackFilter: { value: filter } })[id] || null };
      const f = new Function('window', 'document', vb + '\nreturn rcAgentenVollbestand;')(W, D);
      let erg = null, fehler = null;
      try { erg = f(); } catch (e) { fehler = e.message; }
      return { erg, fehler, prot, W };
    };
    const g = lauf('VUM_Care');
    pruefe('Vollbestand bei gesetztem Filter: alle Agenten (3 statt 1)', g.erg && g.erg.length === 3, g.erg && g.erg.length);
    pruefe('...zwei Durchlaeufe: erst ohne Filter, dann wieder mit', g.prot.join(',') === 'true,false', g.prot.join(','));
    pruefe('...danach steht die gefilterte Ansicht wieder, Schalter aus',
      Object.keys(g.W.rcLetzteStats.agentStats).length === 1 && g.W.__rcParseOhneFilter === false);
    const u = lauf('ALL');
    pruefe('ohne Filter: kein Zusatz-Durchlauf', u.prot.length === 0 && u.erg.length === 1);
    const x = lauf('MF_CARE', true);
    pruefe('Parser wirft: Fehler kommt an, Schalter aus, gefilterte Ansicht wiederhergestellt',
      x.fehler === 'Parser kaputt' && x.W.__rcParseOhneFilter === false && x.prot.join(',') === 'true,false' &&
      Object.keys(x.W.rcLetzteStats.agentStats).length === 1);
    // Gegenprobe: die alte Quelle haette bei demselben Filter nur den gefilterten Bestand.
    const alt = new Function('window', 'return window.rcLetzteStats ? Object.values(window.rcLetzteStats.agentStats) : [];')(lauf('VUM_Care').W);
    pruefe('Gegenprobe: die alte Quelle (rcLetzteStats direkt) liefert nur 1', alt.length === 1);
  }

  // ---- 12. Portal-Verhalten vom 28.09. morgens (Logbuch + DevTools-Mitschnitte) ----
  // "er wechselt einfach nicht": (a) der Menue-Klick auf das Projekt, auf dem die
  // Anmeldung schon steht, leitet NICHT um — der Rahmen wartete 25 s und gab auf;
  // (b) ohne Datensaetze heute rendert das ESL KEINEN Export-Knopf ("Statistik
  // liefert kein Ergebnis"); der Ersatz-Knopf lieferte die Seite, und die galt wegen
  // des versteckten viewExpiredDialog als "Ansicht abgelaufen". Nachbildungen im
  // Aufbau der echten Antworten (Knopf-Markup, Update-Ids), ohne deren Inhalte.
  {
    const H = new Function(['function rcProjektVonPfad(', 'function rcExportKnopfFinden(', 'function rcSuchAntwort(',
      'function rcViewAbgelaufen(', 'function rcAnmeldeSeite('].map(block).join('\n') +
      '\nreturn { rcProjektVonPfad, rcExportKnopfFinden, rcSuchAntwort, rcViewAbgelaufen, rcAnmeldeSeite };')();
    pruefe('Pfad -> Projekt: Kabel / Mobile / UM (secure%20) / main.xhtml offen',
      H.rcProjektVonPfad('/Agents/secure/sis_vodafone.xhtml') === 'kabel' && H.rcProjektVonPfad('/Agents/secure/sis_vodafone_mobile.xhtml') === 'mobile' &&
      H.rcProjektVonPfad('/Agents/secure%20/sis_vodafone_um.xhtml') === 'um' && H.rcProjektVonPfad('/Agents/secure/main.xhtml') === '');

    // Mini-DOMParser: Knoepfe (button/input) eines HTML-Stuecks; getElementById nur fuer Formulare.
    function knoepfe(html) {
      const l = [], re = /<button\b([^>]*)>([\s\S]*?)<\/button>|<input\b([^>]*)>/gi;
      let m;
      while ((m = re.exec(html))) {
        const a = m[1] || m[3] || '', at = n => ((a.match(new RegExp('\\b' + n + '="([^"]*)"')) || [])[1] || '');
        l.push({ id: at('id'), name: at('name'), type: at('type'), title: at('title'), value: at('value'), tag: m[1] != null ? 'button' : 'input',
                 innerHTML: m[2] || '', innerText: (m[2] || '').replace(/<[^>]*>/g, ''), textContent: (m[2] || '').replace(/<[^>]*>/g, '') });
      }
      return l;
    }
    function knoten(html) {
      return {
        getElementById: id => { const m = html.match(new RegExp('<form[^>]*\\bid="' + id + '"[\\s\\S]*?<\\/form>')); return m ? knoten(m[0]) : null; },
        querySelectorAll: sel => knoepfe(html).filter(k => /\[type="submit"\]/.test(sel) ? k.type === 'submit' : true)
      };
    }
    const W = { DOMParser: function(){ this.parseFromString = h => knoten(h); } };
    const knopf = (id, titel, symbol) => '<button id="filterForm:' + id + '" name="filterForm:' + id + '" class="ui-button ui-widget ui-state-default ui-corner-all ui-button-icon-only esl-icon-style" onclick="PrimeFaces.ab({s:this});return false;" title="' + titel + '" type="submit"><span class="ui-button-icon-left ui-icon ui-c fa ' + symbol + ' fa-lg"></span><span class="ui-button-text ui-c">' + titel + '</span></button>';
    const SUCH_K = knopf('j_idt639', 'Liste aktualisieren', 'fa-refresh'), EXP_M = knopf('j_idt501', 'Liste exportieren', 'fa-file-excel-o');
    const teil = (form, data) => "<?xml version='1.0' encoding='UTF-8'?>\n<partial-response><changes><update id=\"filterForm\"><![CDATA[<form id=\"filterForm\" name=\"filterForm\" method=\"post\">" + form +
      '</form>]]></update><update id="data"><![CDATA[<form id="data">' + data + '</form>]]></update><update id="growl"><![CDATA[<span id="growl"></span>]]></update>' +
      '<update id="j_id1:javax.faces.ViewState:0"><![CDATA[-1234:5678]]></update></changes></partial-response>';
    const LEER = teil(SUCH_K + '<label id="filterForm:j_idt641" class="ui-outputlabel ui-widget"></label>',
      '<div class="ui-messages-warn"><span class="ui-messages-warn-summary">Statistik liefert kein Ergebnis.</span></div>');
    const VOLL = teil(knopf('j_idt500', 'Liste aktualisieren', 'fa-refresh') + EXP_M, '<span class="ui-paginator-current">Ergebnisse [1 - 15] von 1433</span>');
    // Volle ESL-Seite: versteckter Dialog, Passwort-aendern-Feld, ein Excel-Knopf AUSSERHALB des filterForm.
    const SEITE = '<!DOCTYPE html><html><head><title>snt ESL - Vodafone Mobile</title></head><body>' +
      '<div id="viewExpiredDialog" class="ui-dialog" aria-hidden="true" style="display:none">Ansicht abgelaufen</div>' +
      '<form id="frmMainMenu" name="frmMainMenu"><button id="frmMainMenu:mainMenu" type="button">Projekte</button></form>' +
      '<form id="anderes"><button id="anderes:x" type="submit" title="Excel-Vorlage">Excel</button></form>' +
      '<form id="filterForm" name="filterForm" method="post">' + knopf('j_idt500', 'Liste aktualisieren', 'fa-refresh') + EXP_M + '</form>' +
      '<form id="f_PwdChange" style="display:none"><input id="f_PwdChange:pw" name="f_PwdChange:pw" type="password"></form></body></html>';
    const sL = H.rcSuchAntwort(LEER, W), sV = H.rcSuchAntwort(VOLL, W), sS = H.rcSuchAntwort(SEITE, W), sN = H.rcSuchAntwort('<html><body>x</body></html>', W);
    pruefe('Such-Antwort ohne Datensaetze: leer, Formular neu, KEIN Export-Knopf', sL.leer && sL.formNeu && sL.knopf === null, JSON.stringify(sL));
    pruefe('Such-Antwort mit Daten: Export-Knopf aus der Antwort (Mobile j_idt501)', !sV.leer && sV.formNeu && sV.knopf === 'filterForm:j_idt501', JSON.stringify(sV));
    pruefe('volle Seite (Submit ohne Ajax): Knopf NUR aus dem filterForm, nicht der fremde Excel-Knopf', sS.formNeu && sS.knopf === 'filterForm:j_idt501', JSON.stringify(sS));
    pruefe('Antwort ohne filterForm: nichts behauptet (formNeu false)', !sN.formNeu && sN.knopf === null);
    pruefe('Export-Knopf-Sucher: Such-Knopf ist kein Export-Knopf', H.rcExportKnopfFinden(knoepfe(SUCH_K)) === null);

    const ABL_FEHLER = "<?xml version='1.0' encoding='UTF-8'?>\n<partial-response><error><error-name>class javax.faces.application.ViewExpiredException</error-name><error-message><![CDATA[viewId abgelaufen]]></error-message></error></partial-response>";
    const ABL_DIALOG = "<?xml version='1.0' encoding='UTF-8'?>\n<partial-response><changes><eval><![CDATA[PF('viewExpiredDialog').show();]]></eval></changes></partial-response>";
    const ANMELDUNG = '<!DOCTYPE html><html><body><form id="loginForm"><input name="j_username" type="text"><input name="j_password" type="password"><button type="submit">Anmelden</button></form></body></html>';
    pruefe('abgelaufen: Ausnahme in der Teil-Antwort / Dialog per Ajax geoeffnet', H.rcViewAbgelaufen(ABL_FEHLER) && H.rcViewAbgelaufen(ABL_DIALOG));
    pruefe('NICHT abgelaufen: volle Seite mit verstecktem Dialog, Teil-Antwort "kein Ergebnis"', !H.rcViewAbgelaufen(SEITE) && !H.rcViewAbgelaufen(LEER) && !H.rcViewAbgelaufen(VOLL));
    pruefe('Anmeldeseite erkannt; ESL-Seite mit Passwort-aendern-Feld und Menue NICHT', H.rcAnmeldeSeite(ANMELDUNG) && !H.rcAnmeldeSeite(SEITE) && !H.rcAnmeldeSeite(LEER));
    // Gegenproben: die Merkmale bis 28.09. hielten dieselbe Seite fuer abgelaufen bzw. abgemeldet.
    pruefe('Gegenprobe: alte Merkmale (viewExpiredDialog / type=password) schlagen bei der Seite an',
      /viewExpiredDialog|ViewExpired/.test(SEITE) && /type="password"/.test(SEITE));

    // Rahmen: kein Menue-Klick, wenn die Seite schon zum Ziel gehoert; danach Gegenprobe des Pfads.
    const ra = block('async function rcRahmenAufbau(');
    const wenn = schneide(ra, 'if (rcProjektVonPfad(d.location.pathname) !== p.key) {');
    pruefe('Rahmen: Menue-Klick und 25-s-Warten nur, wenn die Seite NICHT schon das Ziel ist',
      /link\.click\(\)/.test(wenn) && /throw new Error\('Projektseite laedt nicht'\)/.test(wenn) &&
      (ra.match(/link\.click\(\)/g) || []).length === 1 && ra.indexOf('link.click()') > ra.indexOf(wenn.slice(0, 40)));
    pruefe('Rahmen: danach Gegenprobe, dass die Seite zum Ziel gehoert',
      ra.indexOf('const istJetzt = rcProjektVonPfad(d.location.pathname);') > ra.indexOf(wenn) + wenn.length - 5 && /if \(istJetzt !== p\.key\) throw/.test(ra));
    // Ansicht steht: leeres Label + vom Server markierte Option (28.09.: "Statistik (LEER)").
    const AS = ['function rcRahmenNorm(', 'function rcRahmenStatistik(', 'function rcRahmenAnsichtSteht('].map(block).join('\n');
    const ansicht = code => new Function(code + '\nreturn rcRahmenAnsichtSteht;')();
    const dok = (label, op) => ({ querySelectorAll: s => s === '.ui-selectonemenu-label' ? [{ textContent: label }] : s === 'select' ? [{ options: [op] }] : [] });
    const opt = (sel, wert) => ({ textContent: 'Export Projektergebnisse', value: wert == null ? '36' : wert, defaultSelected: sel });
    const neu = ansicht(AS);
    pruefe('Ansicht steht: Label gefuellt', neu(dok('Export Projektergebnisse', opt(false))));
    pruefe('Ansicht steht: Label leer, Option vom Server markiert', neu(dok(' ', opt(true))));
    pruefe('Ansicht steht NICHT: Label leer, Option nur clientseitig gewaehlt / ohne Wert', !neu(dok(' ', opt(false))) && !neu(dok(' ', opt(true, ''))));
    const altAS = AS.replace(/\/\/ Das Label fuellt erst[\s\S]*?return false;\s*\}$/, 'return false;\n    }');
    pruefe('Gegenprobe: nur nach dem Label geurteilt, galt der Rahmen als "LEER"', altAS !== AS && !ansicht(altAS)(dok(' ', opt(true))));

    // Export: kein geratener Knopf mehr — nirgends in der Datei.
    const hart = /'filterForm:j_idt\d+'/;
    pruefe('keine hart verdrahtete Export-Kennung (j_idt640 ist nur auf Kabel der Export-Knopf)', !hart.test(V22));
    pruefe('Gegenprobe: die alte Zeile wuerde erkannt', hart.test("const btnId = exportBtn ? (exportBtn.id || exportBtn.name) : 'filterForm:j_idt640';"));
    const re = block('async function rcRahmenExport(');
    pruefe('Rahmen-Export: Knopf aus der frischen Such-Antwort; ohne Knopf "leer" bzw. "kein-export"',
      /such = rcSuchAntwort\(txt, W\);/.test(re) && /such && such\.formNeu \? such\.knopf/.test(re) && /return \{ art: leer \? 'leer' : 'kein-export' \};/.test(re));
    pruefe('Rahmen-Export: abgelaufen/abgemeldet nur ueber die Helfer', (re.match(/rcViewAbgelaufen\(txt\)/g) || []).length === 2 && /rcAnmeldeSeite\(txt\)/.test(re) && !/viewExpiredDialog/.test(re));
    const hx = block('async function holeExcelVomServer(');
    pruefe('Einzelprojekt: leer ohne heutige Zeilen = Erfolg, sonst Fehlschlag (ein Tag kann nur wachsen)',
      /if \(leer && rcStromHeuteZeilen\(\) === 0\) \{[\s\S]*?rcEslErfolg\(\);[\s\S]*?\} else \{[\s\S]*?rcEslFehlschlag\(leer \? 'ESL meldet ploetzlich keine Datensaetze'/.test(hx));
    pruefe('Einzelprojekt: Abmeldung nur bei echten Merkmalen', /const echterLogout = urlHint \|\| rcViewAbgelaufen\(body\) \|\| rcAnmeldeSeite\(body\);/.test(hx));
    const fb2 = block('async function rcFetchRangeBuffer('), fu = block('async function rcFetchRangeViaUIIntern(');
    pruefe('Bereichs-Export (fetch): Knopf aus der Such-Antwort, ohne Knopf abbrechen', /such = rcSuchAntwort\(txt\);/.test(fb2) && /if \(!btnId\) \{[\s\S]*?return null;/.test(fb2));
    pruefe('Bereichs-Export (Klick): Knopf aus dem FRISCHEN Formular nach dem Klick (Fallstrick 16)',
      /const formE = document\.getElementById\('filterForm'\) \|\| form;/.test(fu) && fu.indexOf('const formE') > fu.indexOf('updBtn.click()') &&
      /rcExportKnopfFinden\(formE\.querySelectorAll\(/.test(fu) && !/const buttons = /.test(fu));

    // Abruf funktional: leer / Daten / ploetzlich leer / kein Knopf.
    let art = 'leer';
    const E = abrufUmgebung(ABRUF, () => art);
    const r1 = await E.abruf('kabel', 'takt');
    pruefe('Abruf morgens ohne Datensaetze: gueltig leer, Erfolg, kein Fehlschlag',
      r1.ok && r1.pruefung === 'leer' && E.W.rcProjektDaten.kabel.pruefung === 'leer' && E.prot.erfolg.length === 1 && E.prot.fehlschlag.length === 0, JSON.stringify(r1));
    art = null;
    const r2 = await E.abruf('kabel', 'takt');
    pruefe('...sobald Datensaetze da sind: Export und Pruefung wie gewohnt', r2.ok && E.W.rcProjektDaten.kabel.pruefung === 'ok' && E.W.rcProjektDaten.kabel.data === M);
    art = 'leer';
    const r3 = await E.abruf('kabel', 'takt');
    pruefe('...danach ploetzlich leer: verworfen, Stand bleibt, Rahmen wird neu aufgebaut',
      !r3.ok && /ploetzlich keine Datensaetze/.test(r3.grund) && E.W.rcProjektDaten.kabel.data === M && E.prot.fehlschlag.length === 1 && E.W.rcRahmen.kabel.bereit === false, r3.grund);
    art = 'kein-export';
    const r4 = await E.abruf('kabel', 'takt');
    pruefe('kein Export-Knopf ohne "kein Ergebnis": Fehlschlag im Klartext', !r4.ok && /kein Export-Knopf/.test(r4.grund), r4.grund);
  }

  console.log(rot ? '\n' + rot + ' fehlgeschlagen, ' + ok + ' bestanden' : '\nALLE ' + ok + ' PRUEFUNGEN BESTANDEN');
  process.exitCode = rot ? 1 : 0;
})().catch(e => { console.log('ROT  Abbruch: ' + e.message); console.log('1 fehlgeschlagen'); process.exitCode = 1; });
