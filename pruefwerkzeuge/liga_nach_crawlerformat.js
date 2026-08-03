/**
 * Baut aus der ECHTEN ligalisten.xls dieselbe Struktur, die kpi_crawler.js
 * ans Dashboard schickt. Damit laesst sich der Export mit vollen Daten pruefen,
 * ohne das Portal zu brauchen.
 *
 * Aufbau der Datei (aus dem echten Export verifiziert):
 *   Zeile 0: "Ligalisten"
 *   Zeile 1: Gruppenzeile — Kennzahlname steht ueber dem ERSTEN seiner drei Felder
 *   Zeile 2: Leaf-Header — Zaehler | Nenner | Kennzahl je Gruppe
 *   ab Zeile 3: Daten
 */
'use strict';
const XLSX = require('xlsx');
const fs = require('fs');
const DIR = 'C:/Users/v3reg/Downloads/CRAW ESL/LIVE ARENA';

const ws = XLSX.readFile(DIR + '/ligalisten.xls').Sheets['Sheet1'];
const R = XLSX.utils.decode_range(ws['!ref']);
const v = (r, c) => { const z = ws[XLSX.utils.encode_cell({ r, c })]; return z ? z.v : ''; };
const txt = (r, c) => String(v(r, c) || '').trim();

// Die Leaf-Zeile NICHT auf eine feste Nummer festnageln: ligalisten.xls hat sie
// in Zeile 1 (Titelzeile fehlt), andere Exporte in Zeile 2. Suchen statt raten.
let ZLEAF = -1;
for (let r = 0; r <= Math.min(6, R.e.r); r++) {
  for (let c = 0; c <= R.e.c; c++) {
    if (txt(r, c).toLowerCase() === 'agentenname') { ZLEAF = r; break; }
  }
  if (ZLEAF !== -1) break;
}
if (ZLEAF < 1) { console.error('Leaf-Kopfzeile (mit "Agentenname") nicht gefunden.'); process.exit(1); }
const ZGRUPPE = ZLEAF - 1, ZDATEN = ZLEAF + 1;
console.log('Kopfzeilen erkannt: Gruppe=Z' + ZGRUPPE + ', Leaf=Z' + ZLEAF + ', Daten ab Z' + ZDATEN);

// Gruppennamen nach rechts durchreichen (sie stehen nur ueber der ersten Spalte)
const gruppe = [];
let letzte = '';
for (let c = 0; c <= R.e.c; c++) { const g = txt(ZGRUPPE, c); if (g) letzte = g; gruppe[c] = letzte; }
const leaf = [];
for (let c = 0; c <= R.e.c; c++) leaf[c] = txt(ZLEAF, c).toLowerCase();

// Spalte finden: Gruppenname enthaelt <teil>, Leaf ist <art>
function sp(teil, art) {
  const t = teil.toLowerCase();
  for (let c = 0; c <= R.e.c; c++) {
    if (String(gruppe[c] || '').toLowerCase().indexOf(t) !== -1 && leaf[c] === art) return c;
  }
  return -1;
}
// Einfache Spalte nur ueber den Leaf-Namen
function spLeaf(name) {
  const n = name.toLowerCase();
  for (let c = 0; c <= R.e.c; c++) if (leaf[c] === n) return c;
  return -1;
}

const I = {
  std:   spLeaf('standort'),
  team:  spLeaf('team'),
  name:  spLeaf('agentenname'),
  ccs:   spLeaf('ccs-id') !== -1 ? spLeaf('ccs-id') : spLeaf('ccs_id'),
  calls: sp('AHT', 'nenner'),                       // Nenner der AHT = Anzahl Calls
};
// NPS-Kategorien: die Gruppen heissen schlicht "Promotoren"/"Detraktoren"/
// "Neutrale" — und zwar ZWEIMAL. Die erste Dreiergruppe gehoert zu CS, die
// zweite zu TNPS. Genau daher ruehrt die Verwechslung, die im Export lange
// 43 CS-Detraktoren statt 144 TNPS-Detraktoren zeigte: es gibt keinen Namen,
// der die beiden unterscheidet, nur die Reihenfolge.
function npsSpalten(name) {
  const treffer = [];
  for (let c = 0; c <= R.e.c; c++) {
    if (String(gruppe[c] || '').toLowerCase() === name.toLowerCase()) treffer.push(c);
  }
  return treffer;
}
const dets = npsSpalten('Detraktoren'), proms = npsSpalten('Promotoren'), neuts = npsSpalten('Neutrale');
I.detCs   = dets[0]  != null ? dets[0]  : -1;  I.detTnps   = dets[1]  != null ? dets[1]  : -1;
I.promCs  = proms[0] != null ? proms[0] : -1;  I.promTnps  = proms[1] != null ? proms[1] : -1;
I.neutCs  = neuts[0] != null ? neuts[0] : -1;  I.neutTnps  = neuts[1] != null ? neuts[1] : -1;
const KPI = {
  aq:   'Auflegerquote',
  cs:   'CS',
  tnps: 'TNPS',
  fq:   'TNPS Antwortquote',
  dds:  'TNPS Deep Detractor',
  ftf:  'First-Time-Fix',
};
const spalten = {};
Object.keys(KPI).forEach(k => {
  // "Zähler" steht mit Umlaut in der Datei — beide Schreibweisen zulassen
  spalten[k] = { z: sp(KPI[k], 'zähler') !== -1 ? sp(KPI[k], 'zähler') : sp(KPI[k], 'zaehler'),
                 n: sp(KPI[k], 'nenner'), k: sp(KPI[k], 'kennzahl') };
});

console.log('Spaltenzuordnung:');
console.log('  Stammdaten: ' + JSON.stringify(I));
Object.keys(spalten).forEach(k => console.log('  ' + k.padEnd(5) + ' ' + JSON.stringify(spalten[k])));

const num = (r, c) => { if (c < 0) return null; const x = v(r, c); const n = Number(x); return (x === '' || isNaN(n)) ? null : n; };

const kpis = [];
for (let r = ZDATEN; r <= R.e.r; r++) {
  const ccs = txt(r, I.ccs), name = txt(r, I.name);
  if (!ccs || !name) continue;
  const e = {
    ccsId: ccs, agentName: name,
    standort: txt(r, I.std), team: txt(r, I.team), datum: '',
    callCount: num(r, I.calls) || 0,
    timestamp: new Date().toISOString(),
  };
  // Kennzahlen kommen in Promille (1000 = 100 %) -> /10 ergibt Prozent
  const feld = { aq:'auflegerquote', cs:'cs', tnps:'tnps', fq:'fq', dds:'dds', ftf:'ftf' };
  Object.keys(spalten).forEach(k => {
    const s = spalten[k];
    const kz = num(r, s.k);
    e[feld[k]] = kz == null ? null : kz / 10;
    e[k + 'Z'] = num(r, s.z);
    e[k + 'N'] = num(r, s.n);
  });
  // NPS-Kategorien: eigene Spaltengruppen, kein Zaehler/Nenner/Kennzahl-Tripel.
  // Ohne sie bleibt die Detraktoren-Spalte im Export leer — das sah beim ersten
  // Durchlauf wie ein Export-Fehler aus, war aber eine Luecke in den Testdaten.
  e.promCs   = num(r, I.promCs);   e.detCs   = num(r, I.detCs);   e.neutCs   = num(r, I.neutCs);
  e.promTnps = num(r, I.promTnps); e.detTnps = num(r, I.detTnps); e.neutTnps = num(r, I.neutTnps);
  e.det = e.detCs;                 // Kompatibilitaet wie im Crawler
  kpis.push(e);
}

const ohneFtfBasis = kpis.filter(k => !(k.ftfN > 0)).length;
const sumZ = kpis.reduce((s, k) => s + (k.ftfZ || 0), 0);
const sumN = kpis.reduce((s, k) => s + (k.ftfN || 0), 0);

console.log('');
console.log('Agenten: ' + kpis.length);
console.log('  ohne FTF-Basis (Nenner 0/leer): ' + ohneFtfBasis);
console.log('  FTF gepoolt: ' + (sumZ / sumN * 100).toFixed(1) + ' %  (' + sumZ + '/' + sumN + ')');
const mitBasis = kpis.filter(k => k.ftfN > 0).map(k => k.ftf);
const mittelAlle = kpis.map(k => k.ftf || 0).reduce((s, x) => s + x, 0) / kpis.length;
console.log('  FTF Mittel NUR mit Basis: ' + (mitBasis.reduce((s,x)=>s+x,0)/mitBasis.length).toFixed(1) + ' %');
console.log('  FTF Mittel MIT falschen Nullen (alte Logik): ' + mittelAlle.toFixed(1) + ' %');

fs.writeFileSync('liga_echt.json', JSON.stringify(kpis));
console.log('');
console.log('geschrieben: liga_echt.json (' + Math.round(fs.statSync('liga_echt.json').size / 1024) + ' KB)');
