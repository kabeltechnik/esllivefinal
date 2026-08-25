/* ============================================================================
   DIENST-KERN PRUEFEN
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/dienst_kern_pruefen.js

   Prueft die Ablage-Funktionen des Datendienstes (esl_dienst.js): eslAblegen
   und ligaAblegen sind die Stellen, an denen JEDE Lieferung ihre Nummer
   bekommt (Ruling R5: auch ein Fehlschlag zaehlt nr hoch). Die echten
   Funktionen werden per Klammer-Zaehlung aus der Quelldatei geschnitten und
   mit Stubs ausgewertet (esl_dienst.js startet beim Laden den Dienst und kann
   nicht einfach require't werden).

   GEGENPROBE: dieselben Funktionen OHNE die Absicherung gegen ein Ergebnis,
   das kein Objekt ist, muessen werfen - sonst bewiese die Pruefung nichts.
============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}

const QUELLE = fs.readFileSync(path.join(__dirname, '..', 'esl_dienst.js'), 'utf8');
const R = require('../esl_dienst_regeln.js');

// Funktion samt Rumpf; Klammern in Zeichenketten zaehlen nicht.
function schneide(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' fehlt in esl_dienst.js');
  let tiefe = 0, q = '';
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    const c = src[k];
    if (q) { if (c === '\\') k++; else if (c === q) q = ''; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '{') tiefe++;
    else if (c === '}' && --tiefe === 0) return src.slice(i, k + 1);
  }
  throw new Error(name + ' ohne Ende');
}
const ESL = schneide(QUELLE, 'eslAblegen'), LIGA = schneide(QUELLE, 'ligaAblegen'), TEXT = schneide(QUELLE, 'eslText');
const ohneSchutz = (s) => s.split('\n').filter((z) => !/typeof r !== 'object'/.test(z)).join('\n');

// Frische Umgebung: Stand wie standLeer, Datei-Schreiben protokolliert (oder scheitert auf Wunsch).
function bauen(esl, liga) {
  const U = { geschrieben: [], schreibFehler: false,
    stand: { esl: { kabel: { nr: 0 }, mobile: { nr: 0 }, um: { nr: 0 } }, liga: { nr: 0, zeit: 0, versuch: 0, art: '', grund: '', vollstaendig: false, agenten: 0, jeBaum: {} } } };
  const f = new Function('R', 'PROJ', 'ESL_GUT', 'LIGA_GUT', 'DATEN', 'path', 'U',
    'const stand = U.stand;\n' +
    'function sauber(t) { return String(t == null ? "" : t); }\n' +
    'function wechsel() {}\n' +
    'function schreibeAtomar(d, inhalt) { if (U.schreibFehler) { const e = new Error("voll"); e.code = "ENOSPC"; throw e; } U.geschrieben.push(path.basename(d)); }\n' +
    TEXT + '\n' + esl + '\n' + liga + '\nreturn { eslAblegen, ligaAblegen };');
  return Object.assign(U, f(R, R.PROJEKTE, ['excel', 'leer'], ['ok', 'teil'], 'D', path, U));
}

console.log('DIENST-KERN PRUEFEN');
console.log('');
console.log('1) eslAblegen: jede Lieferung zaehlt nr hoch (R5)');
{
  const U = bauen(ESL, LIGA), nrs = [];
  let wurf = '';
  for (const r of [undefined, null, 'quatsch', 42]) {
    try { const e = U.eslAblegen('kabel', r); nrs.push(e.nr + ':' + e.art + ':' + e.grund); } catch (e) { wurf = e.message; }
  }
  pruefe('kein Objekt (undefined, null, Text, Zahl): kein Wurf, nr 1..4, art fehler mit Grund',
    !wurf && nrs.join('|') === [1, 2, 3, 4].map((n) => n + ':fehler:ESL-Runde ohne Ergebnis').join('|') && U.stand.esl.kabel.nr === 4, wurf || nrs.join(' | '));
  const x = U.eslAblegen('kabel', { art: 'excel', b64: 'UEsDBA==', zeit: 5 });
  pruefe('Excel: nr 5, art excel, 4 Bytes, esl_kabel.xlsx geschrieben', x.nr === 5 && x.art === 'excel' && x.bytes === 4 && x.zeit === 5 && U.geschrieben.join() === 'esl_kabel.xlsx', JSON.stringify(x) + ' ' + U.geschrieben.join());
  const y = U.eslAblegen('kabel', { art: 'excel' });
  pruefe('Excel ohne Daten: nr 6, art fehler, Grund nennt die Datei', y.nr === 6 && y.art === 'fehler' && /ESL-Datei nicht geschrieben/.test(y.grund), JSON.stringify(y));
  U.schreibFehler = true;
  const z = U.eslAblegen('kabel', { art: 'excel', b64: 'UEsDBA==' });
  pruefe('Datei nicht schreibbar: nr 7, art fehler mit Code', z.nr === 7 && z.art === 'fehler' && /ENOSPC/.test(z.grund), JSON.stringify(z));
  const w = U.eslAblegen('mobile', { art: 'leer', grund: 'noch keine Datensaetze heute' });
  pruefe('anderes Projekt zaehlt eigen: mobile nr 1, kabel bleibt 7', w.nr === 1 && U.stand.esl.kabel.nr === 7, JSON.stringify(w));
}

console.log('');
console.log('2) ligaAblegen: jeder Versuch zaehlt nr hoch');
{
  const U = bauen(ESL, LIGA);
  let wurf = '', t1 = '';
  try { t1 = U.ligaAblegen(undefined); } catch (e) { wurf = e.message; }
  pruefe('kein Objekt: kein Wurf, nr 1, art fehler mit Grund', !wurf && U.stand.liga.nr === 1 && U.stand.liga.art === 'fehler' && U.stand.liga.grund === 'Liga-Runde ohne Ergebnis', wurf || t1);
  U.ligaAblegen({ jeBaum: null, grund: 'Fehlerseite des Browsers' });
  pruefe('jeBaum null: nr 2, fehler, keine liga.json', U.stand.liga.nr === 2 && U.stand.liga.art === 'fehler' && !U.geschrieben.length, JSON.stringify(U.stand.liga));
  U.ligaAblegen({ jeBaum: { kabel: { art: 'ok', rows: [{ ccsId: 'a', callCount: 3 }] }, mobile: { art: 'ora', rows: null }, um: { art: 'ok', rows: [] } }, grund: 'mobile: ORA' });
  pruefe('ein Baum fehlt: nr 3, teil, liga.json geschrieben, 1 Agent', U.stand.liga.nr === 3 && U.stand.liga.art === 'teil' && U.geschrieben.join() === 'liga.json' && U.stand.liga.agenten === 1, JSON.stringify(U.stand.liga));
}

console.log('');
console.log('3) Gegenprobe: ohne die Absicherung wirft die Ablage (die alte Fassung haette nr nicht gezaehlt)');
{
  const U = bauen(ohneSchutz(ESL), ohneSchutz(LIGA));
  let e1 = '', e2 = '';
  try { U.eslAblegen('kabel', undefined); } catch (e) { e1 = e.message; }
  try { U.ligaAblegen(undefined); } catch (e) { e2 = e.message; }
  pruefe('Absicherung steht wirklich in der Quelle (je eine Zeile entfernt)', ohneSchutz(ESL) !== ESL && ohneSchutz(LIGA) !== LIGA);
  pruefe('eslAblegen ohne Absicherung wirft, nr bleibt 0', !!e1 && U.stand.esl.kabel.nr === 0, e1 || 'kein Wurf');
  pruefe('ligaAblegen ohne Absicherung wirft', !!e2, e2 || 'kein Wurf');
}

console.log('');
console.log('4) Edge-Startdrossel (R16): hoechstens 2 tote Starts in Folge sofort, dann 120 s; Antwort setzt zurueck');
{
  // Die echten Funktionen; das Geruest liefert nur ihren Zustand und laesst Runden im 20-s-Takt laufen.
  const ABSTAND = Number((/EDGE_ABSTAND_MS = (\d+)/.exec(QUELLE) || [])[1]);
  const D = new Function('EDGE_ABSTAND_MS',
    'let edgeStartUm = 0, toteStarts = 0;\n' + schneide(QUELLE, 'startFrei') + '\n' + schneide(QUELLE, 'startVerbuchen') +
    '\nreturn { startFrei, startVerbuchen };')(ABSTAND);
  const versuche = [];
  // Eine Runde: ist ein Start frei, wird gestartet und nach dem Warten verbucht (antwortete / lebt).
  const runde = (t, antwortete, lebt) => { if (!D.startFrei(t)) return; versuche.push(t); D.startVerbuchen(t, antwortete, lebt); };
  const T0 = 1e9;
  for (let t = T0; versuche.length < 3 && t < T0 + 600000; t += 20000) runde(t, false, false);
  const s = (i) => (versuche[i] - T0) / 1000;
  pruefe('Drossel-Abstand aus der Quelle gelesen (120 s)', ABSTAND === 120000, String(ABSTAND));
  pruefe('drei tote Starts: zweiter sofort (naechste Runde), dritter erst >= 120 s nach dem zweiten',
    versuche.length === 3 && versuche[1] - versuche[0] === 20000 && versuche[2] - versuche[1] >= 120000, 'Versuche bei ' + [0, 1, 2].map(s).join(' / ') + ' s');
  // Der naechste freie Start antwortet; Edge stirbt erst nach Ablauf seiner Drossel - dann zaehlt ein toter Start neu.
  for (let t = versuche[2] + 20000; versuche.length < 4 && t < versuche[2] + 600000; t += 20000) runde(t, true, false);
  const ta = versuche[3];
  for (let t = ta + 140000; versuche.length < 6 && t < ta + 800000; t += 20000) runde(t, false, false);
  pruefe('nach einer Antwort von /json: der naechste tote Start wird sofort (naechste Runde) wiederholt',
    versuche.length === 6 && versuche[5] - versuche[4] === 20000, 'Antwort bei ' + s(3) + ' s, danach tote Starts bei ' + [4, 5].map((i) => (versuche[i] - ta) / 1000).join(' / ') + ' s nach der Antwort');
  // Ein Start, der nicht antwortet, aber laeuft (bootet/haengt), macht die Drossel sofort scharf.
  const tl = versuche[5] + 300000, vorher = versuche.length;
  runde(tl, false, true);
  runde(tl + 20000, false, false);
  pruefe('ein Start, der laeuft ohne zu antworten: naechster Versuch erst nach 120 s', versuche.length === vorher + 1 && !D.startFrei(tl + 100000) && D.startFrei(tl + 120000));
}

console.log('');
console.log('----------------------------------------------------');
console.log(fehler === 0
  ? 'ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN.'
  : fehler + ' von ' + geprueft + ' Pruefungen FEHLGESCHLAGEN.');
process.exit(fehler === 0 ? 0 : 1);
