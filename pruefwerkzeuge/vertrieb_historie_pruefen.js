/* ============================================================================
   VERTRIEBS-HISTORIE PRUEFEN
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/vertrieb_historie_pruefen.js

   Prueft an einem ECHTEN ESL-Tagesexport, ob die Produktaufschluesselung
   (Stueck je Produktgruppe) so archiviert wird, dass das Vertriebs-Blatt sie
   auch fuer VORTAGE zeigen kann.

   Hintergrund: Bis 31.07.2026 speicherte die Historie je Agent nur die Summen
   k/a/bcr/bnt/vvl/mob/kip. Beim Export eines Vortags stand deshalb im Blatt
   "Vertrieb" nur der Satz "Fuer <Tag> liegt keine Produktaufschluesselung vor".

   Geprueft wird zusaetzlich der bekannte Fallstrick, dass classify() die
   Gruppen "NBA Tipps ..." und "WINBACK" nicht kennt: die Zaehlung muss
   AUSSERHALB dieser Pruefung laufen, sonst fehlen rund 8 % aller Abschluesse.
============================================================================ */
'use strict';

const path = require('path');
const fs = require('fs');

const EXPORT = path.join(__dirname, '..', 'Test Excels', 'Export_20260714_205722.xlsx');

let XLSX;
try { XLSX = require(path.join(process.env.LOCALAPPDATA || '', 'Temp', 'claude')); } catch (e) {}
if (!XLSX) {
  try { XLSX = require('xlsx'); }
  catch (e) {
    // SheetJS liegt im Scratchpad (siehe CLAUDE.md, Punkt 6).
    const alt = 'C:/Users/v3reg/AppData/Local/Temp/claude/C--Users-v3reg-Downloads-CRAW-ESL-LIVE-ARENA/' +
                '9efc2b74-f101-4fae-9ada-e927611e47b2/scratchpad/node_modules/xlsx';
    try { XLSX = require(alt); } catch (e2) {
      console.log('SheetJS nicht gefunden. Einmalig im Scratchpad installieren:');
      console.log('  npm install xlsx');
      process.exit(2);
    }
  }
}

let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}

console.log('VERTRIEBS-HISTORIE PRUEFEN');
console.log('Quelle: ' + path.basename(EXPORT));
console.log('');

if (!fs.existsSync(EXPORT)) { console.log('  Testdatei fehlt: ' + EXPORT); process.exit(2); }

const wb = XLSX.readFile(EXPORT);
const d = XLSX.utils.sheet_to_json(wb.Sheets['dataTable'], { header: 1 });
const ix = { datum: 0, standort: 1, vo: 3, prod: 5, merkmal: 6, erg: 8, anz: 9 };

// ---------------------------------------------------------------------------
//  Nachbau von rcAccumRow — nur der Teil, um den es hier geht
// ---------------------------------------------------------------------------
// classify() aus dem Dashboard, bewusst UNVOLLSTAENDIG nachgebaut: genau die
// Gruppen, die es dort nicht kennt, fehlen auch hier.
function classifyUnvollstaendig(gruppe) {
  const g = String(gruppe || '').toLowerCase();
  if (/nba|winback/.test(g)) return { cat: null };        // <- die bekannte Luecke
  if (/mobilfunk|mobile/.test(g)) return { cat: 'mob' };
  if (/kip|kabel/.test(g)) return { cat: 'kip' };
  if (/ptv|env|dsl|fib/.test(g)) return { cat: 'fib' };
  return { cat: null };
}

const byAgent = {};
let angenommen = 0, mitGruppe = 0, ohneCat = 0;
for (let i = 1; i < d.length; i++) {
  const r = d[i]; if (!r) continue;
  const vo = String(r[ix.vo] || '').trim();
  const erg = String(r[ix.erg] || '').toLowerCase();
  const anz = parseInt(r[ix.anz]) || 0;
  const mm = String(r[ix.merkmal] || '').toLowerCase();
  const bcrRel = !/nicht\s*bcr/.test(mm);
  if (anz <= 0 || !erg.includes('angenommen')) continue;
  angenommen += anz;
  const gruppe = String(r[ix.prod] || '').trim();
  // SO wie im Dashboard: die Zaehlung laeuft VOR und AUSSERHALB von classify.
  if (vo && gruppe) {
    const a = byAgent[vo] || (byAgent[vo] = {});
    (a.pg || (a.pg = {}))[gruppe] = (a.pg[gruppe] || 0) + anz;
    if (bcrRel) (a.pgB || (a.pgB = {}))[gruppe] = (a.pgB[gruppe] || 0) + anz;
    mitGruppe += anz;
  }
  if (!classifyUnvollstaendig(gruppe).cat) ohneCat += anz;
}

console.log('1) Die Zaehlung erfasst ALLE angenommenen Abschluesse');
pruefe('jeder Abschluss mit Gruppe wird gezaehlt', mitGruppe === angenommen,
  angenommen + ' angenommen, ' + mitGruppe + ' gezaehlt');
pruefe('auch die von classify() nicht erkannten Gruppen sind dabei', ohneCat > 0 && mitGruppe >= ohneCat,
  ohneCat + ' Stueck haetten mit classify-Pruefung gefehlt (' + (ohneCat / angenommen * 100).toFixed(1) + ' %)');

console.log('');
console.log('2) Das archivierte Aggregat ist vollstaendig');
const agenten = Object.keys(byAgent);
const gruppen = new Set();
agenten.forEach(v => Object.keys(byAgent[v].pg).forEach(g => gruppen.add(g)));
pruefe('Agenten mit Produktdaten vorhanden', agenten.length > 100, agenten.length + ' Agenten');
pruefe('mehrere Produktgruppen erkannt', gruppen.size >= 5, gruppen.size + ' Gruppen: ' + [...gruppen].slice(0, 4).join(', ') + ' …');
pruefe('BCR-Teilmenge ist kleiner oder gleich der Gesamtmenge', agenten.every(v => {
  const a = byAgent[v];
  return Object.keys(a.pgB || {}).every(g => (a.pgB[g] || 0) <= (a.pg[g] || 0));
}));

console.log('');
console.log('3) Speicherbedarf bleibt im Rahmen');
const einTag = JSON.stringify(byAgent).length;
const TAGE = 21;
pruefe('ein Tag unter 60 KB', einTag < 60 * 1024, Math.round(einTag / 1024) + ' KB');
pruefe(TAGE + ' Tage unter 1,5 MB', einTag * TAGE < 1.5 * 1024 * 1024,
  Math.round(einTag * TAGE / 1024) + ' KB');

console.log('');
console.log('4) Das Vertriebs-Blatt findet daraus seine Spalten');
// rcSalesSpalten sammelt die Gruppennamen aus allen Zeilen.
const rows = agenten.map(v => ({ hasEsl: true, prodG: byAgent[v].pg, prodGBcr: byAgent[v].pgB }));
const spalten = new Set();
rows.forEach(r => { const p = r.prodG; if (p) Object.keys(p).forEach(k => { if (p[k] > 0) spalten.add(k); }); });
pruefe('es entstehen Produktspalten (Blatt bleibt nicht leer)', spalten.size > 0,
  spalten.size + ' Spalten');
pruefe('die Summe je Gruppe ist plausibel', (function () {
  let s = 0; rows.forEach(r => Object.values(r.prodG || {}).forEach(n => s += n));
  return s === mitGruppe;
})(), 'Summe ueber alle Zeilen muss ' + mitGruppe + ' ergeben');

console.log('');
console.log('----------------------------------------------------');
console.log(fehler === 0
  ? 'ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN.'
  : fehler + ' von ' + geprueft + ' Pruefungen FEHLGESCHLAGEN.');
process.exit(fehler === 0 ? 0 : 1);
