'use strict';
// ============================================================================
//  STUECKZAHLEN PRUEFEN (28.09. abends)
//  Nutzer: "Daten stimmen nicht, Stueckzahlen stimmen nicht." — mit drei
//  gleichzeitig gezogenen ESL-Exporten (Kabel/Mobile/UM) und dem Dashboard-
//  Report (Filter AL). Unabhaengig nachgerechnet: Gesamt-Stueck, VVL,
//  Kontakte, Ansprachen und die Ligaliste stimmten — vier Stellen nicht:
//   1. classify(): "Hardware KIP- und PTV" enthaelt "PTV" -> jede Homebox
//      zaehlte als PTV-NEUVERTRAG (Alanya BNT 198 statt 175, PTV BNT 63 statt 40).
//   2. rcProduktGruppe(): ohne BNT-/VVL-Praefix wurde pauschal "Hardware"
//      geraten — "UM TV Connect" / "UM Internet&Phone 100" (Mobile-Export ohne
//      Gruppe) landeten als Geraet und ueber 1. als PTV-Neuvertrag. Jetzt:
//      nur Geraete werden Hardware; die zwei UM-Produkte sind VVL (Nutzer-
//      Vorgabe 29.09.: PTV VVL bzw. KIP VVL), alles andere ohne Regel
//      bleibt sichtbar "Ohne Produktgruppe".
//   3. prodGBcr fehlte bei Agenten, die NUR nicht-BCR-relevant verkauften —
//      das Vertriebs-Blatt nahm dann die Gesamtmenge als CR-relevant.
//   4. Blatt "Produkte", Block Einzelprodukte: rcAllSales ist ungefiltert —
//      bei Filter AL standen dort Firmensummen (113 von 144 Produkten).
//  Echte Funktionen per Klammer-Zaehlung geschnitten, mit Gegenprobe je Regel.
//  Ende-zu-Ende gegen echte Exporte: Pruefseite test_abgleich_esl.html
//  (Browser, Server esl-offline) — dort faellt die alte Fassung in 6 von 11
//  Pruefungen durch, genau mit den Zahlen des beanstandeten Reports.
// ============================================================================
const fs = require('fs'), path = require('path');
const V22 = fs.readFileSync(path.join(__dirname, '..', 'esl_live_arena_v22.js'), 'utf8');

let ok = 0, rot = 0;
function pruefe(name, bed, info) { if (bed) ok++; else rot++; console.log((bed ? 'OK   ' : 'ROT  ') + name + (info ? '  (' + info + ')' : '')); }
function schneide(src, kopf) {
  const a = src.indexOf(kopf);
  if (a < 0) throw new Error('nicht gefunden: ' + kopf);
  let i = src.indexOf('{', a), t = 0;
  for (; i < src.length; i++) { if (src[i] === '{') t++; else if (src[i] === '}' && --t === 0) break; }
  return src.slice(a, i + 1);
}
const GERAET = V22.match(/const RC_KEIN_VERTRIEB = [^\n]+/)[0] + '\n' + schneide(V22, 'function rcIstGeraet(');
const KLASS = schneide(V22, 'function classify(');
const GRUPPE = schneide(V22, 'function rcProduktGruppe(');

// ---- 1. classify: Geraete sind kein Abschluss ----
const mkKlass = code => new Function(GERAET + '\n' + code + '\nreturn classify;')();
const cls = mkKlass(KLASS);
pruefe('"Hardware KIP- und PTV" ist kein Abschluss (cat null)', cls('Hardware KIP- und PTV').cat === null && !cls('Hardware KIP- und PTV').isBnt);
const SOLL = { 'KIP BNT':'kip', 'Mobilfunk BNT':'mob', 'ENV BNT':'env', 'PTV BNT':'ptv', 'DSL BNT':'fibDsl', 'Fibre BNT':'fibDsl', 'FIbre BNT':'fibDsl',
  'KIP VVL':'kipVvl', 'Mobilfunk VVL':'mobVvl', 'PTV VVL':'fibVvl', 'DSL VVL':'fibVvl', 'KIP VVL (Stay)':'kipVvl',
  'NBA Tipps KIP- und Mobile':null, 'Hardware KIP- und TV':null, 'Abzug Startguthaben':null, 'Ohne Produktgruppe':null };
const falsch = Object.keys(SOLL).filter(g => cls(g).cat !== SOLL[g]);
pruefe('alle echten Gruppen vom 28.09. behalten ihre Kategorie', falsch.length === 0, falsch.map(g => g + '=' + cls(g).cat).join(', '));
pruefe('Geraete-Pruefung steht VOR allen Stichwort-Regeln', KLASS.indexOf('rcIstGeraet(pg)') !== -1 && KLASS.indexOf('rcIstGeraet(pg)') < KLASS.indexOf("pg.includes('VVL')"));
const klassAlt = KLASS.replace(/if \(rcIstGeraet\(pg\)\) return \{cat:null, isBnt:false, isVvl:false\};/, '');
pruefe('Gegenprobe: ohne die Zeile zaehlt Hardware als PTV-Neuvertrag (der Fehler im Report)', klassAlt !== KLASS && mkKlass(klassAlt)('Hardware KIP- und PTV').cat === 'ptv');
pruefe('RC_KEIN_VERTRIEB steht VOR classify (der Parser braucht es — keine temporale Todeszone)',
  V22.indexOf('const RC_KEIN_VERTRIEB') !== -1 && V22.indexOf('const RC_KEIN_VERTRIEB') < V22.indexOf('function classify(') &&
  (V22.match(/const RC_KEIN_VERTRIEB\s*=/g) || []).length === 1);

// ---- 2. rcProduktGruppe: nur Geraete werden Hardware, der Rest bleibt sichtbar ungruppiert ----
const mkGruppe = code => { const W = {}; return { W, fn: new Function('window', GERAET + '\n' + code + '\nreturn rcProduktGruppe;')(W) }; };
const G = mkGruppe(GRUPPE);
const GERAETE = ['HomeBox Option', 'Super WLAN Verstärker (Basic)', 'Super WLAN Verst&#228;rker (Basic)', 'SuperWLAN 7 Verstärker', 'CI+ Modul', 'Ultra Hub 7', 'Homebox/- Fritzbox'];
const gFalsch = GERAETE.filter(p => G.fn('', p) !== 'Hardware KIP- und PTV');
pruefe('Geraete ohne Praefix -> "Hardware KIP- und PTV" (auch Entity-Umlaut, Super WLAN mit Leerzeichen, CI+ Modul)', gFalsch.length === 0, gFalsch.join(', '));
// Nutzer-Vorgabe 29.09.: "UM TV Connect" und "UM Internet&Phone 100" sind VVL. TV Connect fuehrt
// das Portal als VVL unter PTV, Internet&Phone ist ein KIP-Tarif (Gruppe wie im Kabel-Export).
const GU = mkGruppe(GRUPPE);
pruefe('"UM TV Connect" -> "PTV VVL", "UM Internet&Phone 100" -> "KIP VVL" (Nutzer-Vorgabe: VVL)',
  GU.fn('', 'UM TV Connect') === 'PTV VVL' && GU.fn('', 'UM Internet&Phone 100') === 'KIP VVL');
pruefe('... beide zaehlen ueber classify als VVL (fibVvl / kipVvl), nicht als BNT',
  cls('PTV VVL').cat === 'fibVvl' && cls('KIP VVL').cat === 'kipVvl' && cls('PTV VVL').isVvl && cls('KIP VVL').isVvl && !cls('PTV VVL').isBnt && !cls('KIP VVL').isBnt);
const UMV = ['um tv connect', 'UM TV  Connect', 'UM Internet & Phone 250', 'UM Internet&amp;Phone 100', 'UM Internet&#38;Phone 50', 'UM Internet Phone 100'];
const umFalsch = UMV.filter(p => !/VVL$/.test(GU.fn('', p)));
pruefe('Schreibvarianten (Gross/Klein, Leerzeichen, Tempo, Entity) treffen dieselbe Regel', umFalsch.length === 0, umFalsch.join(', '));
pruefe('... und landen NICHT in rcProduktOhneGruppe (sind ja eingeordnet)', !GU.W.rcProduktOhneGruppe);
pruefe('Gegenprobe: andere gruppenlose "UM"-Namen werden NICHT geraten ("UM Netflix Premium", "UM Internet Flat")',
  GU.fn('', 'UM Netflix Premium') === 'Ohne Produktgruppe' && GU.fn('', 'UM Internet Flat') === 'Ohne Produktgruppe' && GU.W.rcProduktOhneGruppe['UM Netflix Premium'] === 1);
pruefe('"Ohne Produktgruppe" ist weder BNT noch VVL', cls('Ohne Produktgruppe').cat === null);
pruefe('vorhandene Gruppe bleibt unangetastet, Praefix-Regeln unveraendert',
  G.fn('KIP VVL', 'UM TV Connect') === 'KIP VVL' && G.fn('', 'BNT TV Connect Standard') === 'ENV BNT' && G.fn('', 'VVL GigaMobil M') === 'Mobilfunk VVL');
const gruppeAlt = GRUPPE.replace(/if \(!istVvl && !istBnt\) \{[\s\S]*?return 'Ohne Produktgruppe';\s*\}/, "if (!istVvl && !istBnt) return 'Hardware KIP- und PTV';");
pruefe('Gegenprobe: mit der alten Pauschal-Regel wird ein gruppenloser Name ("UM Netflix Premium") zu Hardware', gruppeAlt !== GRUPPE && mkGruppe(gruppeAlt).fn('', 'UM Netflix Premium') === 'Hardware KIP- und PTV');
const gruppeOhneUm = GRUPPE.split('\n').filter(z => !/^\s*if \(\/\^UM/.test(z)).join('\n');
pruefe('Gegenprobe: ohne die zwei UM-Zeilen bleiben beide Produkte "Ohne Produktgruppe" (Zustand davor)',
  gruppeOhneUm !== GRUPPE && mkGruppe(gruppeOhneUm).fn('', 'UM TV Connect') === 'Ohne Produktgruppe' && mkGruppe(gruppeOhneUm).fn('', 'UM Internet&Phone 100') === 'Ohne Produktgruppe');

// ---- 3. BCR-Aufschluesselung existiert IMMER neben der Gesamtmenge ----
const PDS = schneide(V22, 'window.processDataStream = function');
const iPg = PDS.indexOf('(agP.prodG || (agP.prodG = {}))[prodRaw]'), iInit = PDS.indexOf('if (!agP.prodGBcr) agP.prodGBcr = {};'), iBcr = PDS.indexOf('if (isBcr) {', iPg);
pruefe('Parser: prodGBcr wird mit prodG angelegt, VOR dem BCR-Zweig', iPg !== -1 && iInit > iPg && iInit < iBcr);
pruefe('Parser: Tages-Historie sichert pgB auch LEER, sobald pg da ist',
  /pgB: \(a\.prodG && Object\.keys\(a\.prodG\)\.length\) \? \(a\.prodGBcr \|\| \{\}\) : undefined/.test(PDS));
const ACC = schneide(V22, 'function rcAccumRow(');
const mkAcc = code => new Function('window', 'normalizeStandort', GERAET + '\n' + KLASS + '\n' + GRUPPE + '\n' +
  schneide(V22, 'function rcIstPotentialTracking(') + '\n' + code + '\nreturn rcAccumRow;')({}, s => s);
const lauf = fn => {
  const agg = { rows:0, byStd:{}, byAgent:{}, bcr:0, nonBcr:0, bnt:0, vvl:0, _k:new Set(), _kSt:{}, _kAg:{}, _a:new Set(), _aSt:{}, _aAg:{} };
  const ix = { standort:1, vo:3, prod:5, merkmal:6, produkt:7, erg:8, anz:9, ansp:10, id:12 };
  [ ['', 'AL', '', '111', '', 'PTV VVL', 'nicht BCR-relevant', 'VVL GigaTV Tarifwechsel', 'angenommen', '2', 'nein', '', 'a1'],
    ['', 'AL', '', '222', '', 'KIP BNT', 'BCR-relevant', 'BNT GigaZuhause BV 1000 Kabel', 'angenommen', '1', 'ja', '', 'b1'] ]
    .forEach((r, i) => fn(agg, r, ix, i));
  return agg;
};
let acc = null, accFehler = '';
try { acc = lauf(mkAcc(ACC)); } catch (x) { accFehler = x.message; }
const a111 = acc && acc.byAgent['111'], a222 = acc && acc.byAgent['222'];
pruefe('Historie (rcAccumRow): nur nicht-BCR verkauft -> pgB ist {} (nicht "keine Trennung")',
  !!a111 && JSON.stringify(a111.pgB) === '{}' && a111.pg['PTV VVL'] === 2, accFehler || JSON.stringify(a111));
pruefe('Historie: BCR-relevanter Verkauf steht in pgB', !!(a222 && a222.pgB && a222.pgB['KIP BNT'] === 1), accFehler);
const accAlt = ACC.replace(/if \(!agE\.pgB\) agE\.pgB = \{\};[^\n]*\n\s*if \(bcrRel\) agE\.pgB\[gruppe\]/, 'if (bcrRel) (agE.pgB || (agE.pgB = {}))[gruppe]');
let altRes = null; try { altRes = lauf(mkAcc(accAlt)); } catch (x) {}
pruefe('Gegenprobe: alte Bauart laesst pgB weg -> das Vertriebs-Blatt faellt auf die Gesamtmenge zurueck',
  accAlt !== ACC && !!altRes && altRes.byAgent['111'].pgB === undefined);
// Wirkung im Vertriebs-Blatt: prodOf nimmt prodGBcr, faellt nur OHNE Trennung auf prodG zurueck.
const prodOfZeile = (schneide(V22, 'function rcBuildSalesSheet(').match(/const prodOf = r => [^;]+;/) || [''])[0];
const prodOf = new Function('return ' + prodOfZeile.replace(/^const prodOf = /, '').replace(/;$/, ''))();
pruefe('Vertriebs-Blatt: {} zaehlt als 0 CR-relevant, nicht als Gesamtmenge',
  !!prodOfZeile && JSON.stringify(prodOf({ prodG:{ 'PTV VVL':2 }, prodGBcr:{} })) === '{}');

// ---- 4. Blatt "Produkte", Einzelprodukte: nur die Agenten der Mappe ----
const PROD = schneide(V22, 'function rcBuildProdukteSheet(');
const mkProd = code => new Function('window', 'XL', 'rcZelleFabrik', 'RC_XP', 'rcZeitraumText', 'rcIstKern', 'rcIstBnt', 'rcIstVvl', 'RC_PCT1', 'RC_ALARM', 'RC_PROD_HIST_TAGE',
  code + '\nreturn rcBuildProdukteSheet;');
const einzel = code => {
  const W = {
    rcAllSales: [
      { vo:'111', name:'Anna Alpha', produkt:'BNT X', prod:'KIP BNT', isBcr:true, anzahl:1, standort:'AL' },
      { vo:'222', name:'Bert Beta',  produkt:'BNT X', prod:'KIP BNT', isBcr:true, anzahl:5, standort:'B' },
      { vo:'333', name:'333',        produkt:'BNT X', prod:'KIP BNT', isBcr:true, anzahl:2, standort:'AL' },
      { vo:'VO9', name:'Cora Gamma', produkt:'VVL Y', prod:'KIP VVL', isBcr:true, anzahl:1, standort:'AL' } ],
    rcWcaMapping: { voMap:{ VO9:{ ccsId:'999' } }, ccsMap:{ '111':{ ccsId:'111' } } },
    rcNormName: n => String(n || '').toLowerCase().split(/\s+/).filter(Boolean).sort().join(' ')
  };
  const XL = { utils:{ aoa_to_sheet: z => ({ z }), book_append_sheet: () => {} } };
  const X = new Proxy({}, { get: () => 'X' });
  const fn = mkProd(code)(W, XL, () => (v, o) => ({ v, o }), X, () => 'Zeitraum', () => false,
    g => /\bBNT\b/i.test(g || ''), g => /\bVVL\b/i.test(g || ''), '0', 'R', 21);
  const ws = fn(XL, {}, false, { today:true, label:'heute', rows: [
    { ccs:'111', name:'Alpha Anna', prodG:{ 'KIP BNT':1 }, prodGBcr:{ 'KIP BNT':1 } },
    { ccs:'', name:'333', prodG:{ 'KIP BNT':2 }, prodGBcr:{ 'KIP BNT':2 } },
    { ccs:'999', name:'Gamma Cora', prodG:{ 'KIP VVL':1 }, prodGBcr:{ 'KIP VVL':1 } } ] });
  const z = ws.z, ab = z.findIndex(r => r[1] && /^EINZELPRODUKTE/.test(String(r[1].v)));
  const m = {}; z.slice(ab + 2).forEach(r => { if (r[1] && r[1].v) m[r[1].v] = r[5] && r[5].v; });
  return m;
};
const e = einzel(PROD);
pruefe('Einzelprodukte: nur Agenten der Mappe (Berlin-Agent 222 bleibt draussen)', e['BNT X'] === 3, JSON.stringify(e));
pruefe('... Zuordnung ueber CCS, VO->Mapping und Name (ungemappt: Name = VO-Nummer)', e['VVL Y'] === 1);
const prodAlt = PROD.replace('? window.rcAllSales.filter(gehoertDazu) : null;', '? window.rcAllSales : null;');
pruefe('Gegenprobe: ohne Filter stehen Firmensummen im Block (der Fehler im Report)', prodAlt !== PROD && einzel(prodAlt)['BNT X'] === 8);

console.log(rot ? '\n' + rot + ' fehlgeschlagen, ' + ok + ' bestanden' : '\nALLE ' + ok + ' PRUEFUNGEN BESTANDEN');
process.exitCode = rot ? 1 : 0;
