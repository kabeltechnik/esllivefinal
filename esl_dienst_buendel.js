/* ============================================================================
   ESL-DIENST: SEITEN-BUENDEL
   ---------------------------------------------------------------------------
   Der Datendienst spielt per CDP zwei Skripte in die Portal-Tabs ein: eines in
   den ESL-Tab (Export aus dem Arbeitsrahmen), eines in die Ligaliste (Abfrage
   bauen, Tabelle lesen). Damit dort die ORIGINAL-Funktionen laufen und nicht
   eine zweite Fassung, werden sie hier zur Laufzeit aus esl_live_arena_v22.js
   und kpi_crawler.js herausgeschnitten (Klammer-Zaehlung, kein Nachbau).

   Jedes Buendel ist ein IIFE (ein zweites Einspielen wirft kein "const schon
   deklariert") und tut nichts, wenn dieselbe `version` schon in der Seite steht.
   `version` = erste 8 Zeichen SHA-1 des herausgeschnittenen Codes: aendert sich
   die Quelle, aendert sich die Version und die Seite bekommt das neue Buendel.

   Das Modul haengt NICHT an pruefwerkzeuge/ (der Ordner wird nicht ausgeliefert).
   Geprueft von pruefwerkzeuge/dienst_buendel_pruefen.js.
============================================================================ */
'use strict';

const crypto = require('crypto');

const ESL_FUNKTIONEN = [
  'function rcJq(', 'function rcLeerlaufZurueck(', 'function rcPasswortSichtbar(', 'function rcFilterKnopf(',
  'function rcProjektVonPfad(', 'function rcExportKnopfFinden(', 'function rcSuchAntwort(',
  'function rcViewAbgelaufen(', 'function rcAnmeldeSeite(', 'async function rcRahmenExport('
];
const ESL_EXPORTE = ['rcRahmenExport', 'rcFilterKnopf', 'rcProjektVonPfad', 'rcLeerlaufZurueck', 'rcPasswortSichtbar', 'rcAnmeldeSeite'];
const LIGA_EXPORTE = ['parseKpiTable', 'extractTableHtml', 'snapshotOf', 'datumKey', 'baueAbfrage', 'RC_ABFRAGEN', 'RC_FIGURES', 'RC_LOC_ALLE'];

const leer = (s) => s.replace(/[^\n]/g, ' ');

// Liest Quelltext ab `start` und maskiert Kommentare, Zeichenketten und Regex-
// Literale (gleiche Laenge, Zeilenumbrueche bleiben). Mit bisKlammerZu endet der
// Lauf an der schliessenden Klammer der ersten geoeffneten. Ein Regex beginnt
// nach Operator/Satzzeichen oder nach return/typeof/..., sonst ist `/` eine
// Division - ohne diese Unterscheidung verschluckt ein `"` im Regex tausende
// Zeilen (so schon einmal in einem Pruefwerkzeug passiert).
// shortcut: Template-Literale zaehlen als Zeichenkette (${...} bleibt unsichtbar);
// in den geschnittenen Stuecken gibt es keine - erst aendern, wenn eins dazukommt.
function abtasten(code, start, bisKlammerZu) {
  const REGEX_NACH = '(,=:[!&|?{};+-*%<>~^';
  const SCHLUESSEL = /^(return|typeof|case|in|of|void|delete|throw|new|else|do)$/;
  let m = '', i = start, tiefe = 0, offen = false, letztes = '', wort = '', imWort = false;
  while (i < code.length) {
    const c = code[i], n = code[i + 1];
    if (c === '/' && n === '/') {
      let j = code.indexOf('\n', i); if (j < 0) j = code.length;
      m += leer(code.slice(i, j)); i = j; continue;
    }
    if (c === '/' && n === '*') {
      let j = code.indexOf('*/', i + 2); j = j < 0 ? code.length : j + 2;
      m += leer(code.slice(i, j)); i = j; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < code.length && code[j] !== c) { if (code[j] === '\\') j++; j++; }
      j = Math.min(j + 1, code.length);
      m += c + leer(code.slice(i + 1, j - 1)) + c;
      i = j; letztes = c; wort = ''; imWort = false; continue;
    }
    if (c === '/' && (letztes === '' || REGEX_NACH.indexOf(letztes) >= 0 || (/[\w$]/.test(letztes) && SCHLUESSEL.test(wort)))) {
      let j = i + 1, klasse = false;
      for (; j < code.length; j++) {
        const d = code[j];
        if (d === '\\') j++;
        else if (d === '\n') break;
        else if (d === '[') klasse = true;
        else if (d === ']') klasse = false;
        else if (d === '/' && !klasse) break;
      }
      j++;                                                        // schliessendes /
      while (j < code.length && /[a-z]/i.test(code[j])) j++;      // Flags
      m += leer(code.slice(i, j)); i = j; letztes = '0'; wort = ''; imWort = false; continue;
    }
    if (c === '{') { tiefe++; offen = true; }
    else if (c === '}') {
      tiefe--;
      if (bisKlammerZu && offen && tiefe === 0) return { ende: i + 1, maske: m + c };
    }
    if (/[\w$]/.test(c)) { wort = imWort ? wort + c : c; imWort = true; letztes = c; }
    else { imWort = false; if (!/\s/.test(c)) { wort = ''; letztes = c; } }
    m += c; i++;
  }
  return { ende: code.length, maske: m };
}

function pruefeSyntax(text, name) {
  try { new Function(text); } catch (e) { throw new Error('Syntaxfehler in "' + name + '": ' + e.message); }
  return text;
}

// Eine Funktion samt Rumpf, ab dem Kopf (z. B. 'function rcJq(').
function schneideFunktion(src, kopf) {
  const a = src.indexOf(kopf);
  if (a < 0) throw new Error('Funktion fehlt: ' + kopf);
  return pruefeSyntax(src.slice(a, abtasten(src, a, true).ende), kopf);
}

// Von `von` bis VOR `bis`.
function schneideAbschnitt(src, von, bis) {
  const a = src.indexOf(von);
  if (a < 0) throw new Error('Abschnitt fehlt: ' + von);
  const b = src.indexOf(bis, a);
  if (b < 0) throw new Error('Abschnittsende fehlt: ' + bis);
  return pruefeSyntax(src.slice(a, b), von + ' ... ' + bis);
}

function huelle(global, stuecke, exporte) {
  const koerper = stuecke.join('\n');
  const version = crypto.createHash('sha1').update(koerper + '\n' + exporte.join(',')).digest('hex').slice(0, 8);
  const g = 'window.' + global;
  return '(function () {\n' +
    'if (' + g + ' && ' + g + ".version === '" + version + "') return;\n" +
    koerper + '\n' +
    g + ' = { ' + exporte.join(', ') + ", version: '" + version + "' };\n" +
    '})();\n';
}

function eslBuendel(v22Src) {
  return huelle('__rcDienstEsl', ESL_FUNKTIONEN.map((k) => schneideFunktion(v22Src, k)), ESL_EXPORTE);
}

function ligaBuendel(kpiSrc) {
  return huelle('__rcDienstLiga', [
    schneideAbschnitt(kpiSrc, 'function cleanText(', '// ---------- Tages-Historie'),   // inkl. pad2, datumKey, parseKpiTable
    schneideFunktion(kpiSrc, 'function snapshotOf('),
    schneideFunktion(kpiSrc, 'function extractTableHtml('),
    schneideAbschnitt(kpiSrc, 'const RC_LOC_ALLE', 'function baueAbfrage('),
    schneideFunktion(kpiSrc, 'function baueAbfrage(')
  ], LIGA_EXPORTE);
}

// Namen im Code, die benutzt, aber weder darin definiert noch in `definiert`
// genannt sind: rc[A-Z]\w* und pad2. Der Beweis, dass ein Buendel geschlossen
// ist; ein vergessener Helfer faellt hier auf, nicht erst im Tab.
// Benutzt heisst jede freie Nennung (auch rcLog.warn), nicht nur ein Aufruf mit
// Klammer; Eigenschaften (x.rcFoo) sind keine freien Namen.
function offeneNamen(code, definiert) {
  const maske = abtasten(code, 0, false).maske;
  const da = new Set(definiert || []);
  let m;
  const reDef = /\b(?:function\s+|const\s+|let\s+|var\s+)([A-Za-z_$][\w$]*)/g;
  while ((m = reDef.exec(maske))) da.add(m[1]);
  const offen = new Set();
  const reNutz = /(?<![\w$.])(rc[A-Z][\w$]*|pad2)(?![\w$])/g;
  while ((m = reNutz.exec(maske))) if (!da.has(m[1])) offen.add(m[1]);
  return Array.from(offen).sort();
}

module.exports = { schneideFunktion, schneideAbschnitt, ESL_FUNKTIONEN, eslBuendel, ligaBuendel, offeneNamen };
