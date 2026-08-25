'use strict';
// ============================================================================
//  MITARBEITER-EXCEL IM DIENST-BETRIEB PRUEFEN (27.10.2026, Ruling R14)
//  Die Gastseite (ESL_Live_Arena.html) reicht die Excel des Dienstes bei JEDEM
//  Start als window.__rcFiles.mapping mit. rcAutoMapping stieg aber aus, sobald
//  ein gespeichertes Mapping (localStorage.rcWcaMapping) da war — ab dem zweiten
//  Start kam eine geaenderte Excel nie an. R14: mit Dienst-Marke wird die Excel
//  importiert, wenn sie sich von der gesicherten (rcWcaMappingXlsx, dieselbe
//  Base64-Form wie beim Ziehen auf die Mapping-Flaeche) unterscheidet; gleich ->
//  nichts. Ohne Marke laeuft rcAutoMapping EXAKT wie vorher.
//
//  Echte Funktionen (rcAutoMapping, rcB64ZuBuffer, rcDienstModus) per Klammer-
//  Zaehlung aus v22 geschnitten und mit new Function ausgewertet; nur
//  verarbeiteMappingExcel, localStorage und rcLog sind Attrappen.
//  GEGENPROBE: dieselbe Quelle mit abgeschaltetem R14-Zweig (= alte Bauart)
//  muss im Dienst-Fall durchfallen und ohne Marke dieselben Ergebnisse liefern.
// ============================================================================
const fs = require('fs'), path = require('path');
const V22 = fs.readFileSync(path.join(__dirname, '..', 'esl_live_arena_v22.js'), 'utf8');
const { schneide } = require('./_stack_regel.js');

let ok = 0, rot = 0;
function pruefe(name, bed, info) { if (bed) ok++; else rot++; console.log((bed ? 'OK   ' : 'ROT  ') + name + (info !== undefined && info !== '' ? '  (' + info + ')' : '')); }

const KOEPFE = ['function rcDienstModus(', 'function rcB64ZuBuffer(', 'function rcAutoMapping('];
const R14 = 'if (b64 && rcDienstModus())';

// Inhalt der "Excel": ein Kennwort als Text, Base64 wie Gastseite/Mapping-Flaeche.
const b64 = t => Buffer.from(t, 'latin1').toString('base64');
const NEU = b64('MAPPING-NEU'), ALT = b64('MAPPING-ALT'), KAPUTT = b64('KAPUTT');

function lauf(quelle, f) {
  const ls = new Map(Object.entries(f.speicher || {}));
  const W = { __rcDienst: f.marke ? { basis: 'http://127.0.0.1:8787' } : undefined,
    __rcFiles: f.gast ? { mapping: f.gast } : undefined,
    rcWcaMapping: f.json ? { ccsMap: { '1': { herkunft: f.json } } } : null };
  const log = { warn: [], error: [], log: [] };
  const importe = [];
  // Attrappe wie das echte verarbeiteMappingExcel: Fehler werden INNEN gefangen,
  // bei Erfolg wird window.rcWcaMapping neu gesetzt.
  function verarbeiteMappingExcel(buf) {
    const t = Buffer.from(buf).toString('latin1');
    importe.push(t);
    if (t === 'KAPUTT') { log.error.push('Mapping-Fehler'); return; }
    W.rcWcaMapping = { ccsMap: { '1': { herkunft: t } } };
  }
  const env = {
    window: W, localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) },
    rcLog: { warn: m => log.warn.push(m), error: m => log.error.push(m), log: m => log.log.push(m) },
    verarbeiteMappingExcel, atob: s => Buffer.from(s, 'base64').toString('latin1')
  };
  const k = Object.keys(env);
  const F = new Function(...k, quelle + '\nreturn { rcAutoMapping };')(...k.map(n => env[n]));
  F.rcAutoMapping();
  return { herkunft: W.rcWcaMapping && W.rcWcaMapping.ccsMap['1'].herkunft, importe, xlsx: ls.get('rcWcaMappingXlsx') || null, log };
}

let NEUQ, ALTQ;
try {
  const teile = KOEPFE.map(kopf => { const t = schneide(V22, kopf); if (!t) throw new Error('nicht gefunden: ' + kopf); return t; });
  NEUQ = teile.join('\n');
  pruefe('rcAutoMapping hat den Dienst-Zweig (R14) genau einmal', NEUQ.split(R14).length === 2);
  ALTQ = NEUQ.replace(R14, 'if (false)');           // die Bauart vor R14
} catch (e) {
  console.log('ABBRUCH: ' + e.message); console.log((rot + 1) + ' fehlgeschlagen (Abbruch), ' + ok + ' bestanden'); process.exit(1);
}

// ---- Mit Marke (Dienst-Betrieb) -------------------------------------------------
{
  const r = lauf(NEUQ, { marke: 1, gast: NEU, json: 'MAPPING-ALT', speicher: { rcWcaMappingXlsx: ALT } });
  pruefe('Dienst: gespeichertes Mapping ALT, Gast-Excel NEU -> nach dem Start gilt NEU', r.herkunft === 'MAPPING-NEU' && r.importe.join() === 'MAPPING-NEU', JSON.stringify(r.herkunft));
  pruefe('Dienst: NEU wird als rcWcaMappingXlsx gesichert (Vergleich beim naechsten Start)', r.xlsx === NEU);
  const g = lauf(ALTQ, { marke: 1, gast: NEU, json: 'MAPPING-ALT', speicher: { rcWcaMappingXlsx: ALT } });
  pruefe('GEGENPROBE alte Bauart: dort bleibt ALT stehen (die gemeldete Luecke)', g.herkunft === 'MAPPING-ALT' && g.importe.length === 0, JSON.stringify(g.herkunft));
}
{
  const r = lauf(NEUQ, { marke: 1, gast: NEU, json: 'MAPPING-NEU', speicher: { rcWcaMappingXlsx: NEU } });
  pruefe('Dienst: Gast-Excel gleich der gesicherten -> nichts tun (kein Import)', r.importe.length === 0 && r.herkunft === 'MAPPING-NEU' && r.xlsx === NEU);
}
{
  const r = lauf(NEUQ, { marke: 1, gast: NEU, speicher: { rcWcaMappingXlsx: NEU } });
  pruefe('Dienst: gleich, aber kein Mapping geladen -> Import wie bisher', r.importe.join() === 'MAPPING-NEU' && r.herkunft === 'MAPPING-NEU');
}
{
  const r = lauf(NEUQ, { marke: 1, gast: NEU });
  pruefe('Dienst: erster Start (nichts gespeichert) -> Import und gesichert', r.herkunft === 'MAPPING-NEU' && r.xlsx === NEU);
}
{
  const r = lauf(NEUQ, { marke: 1, gast: KAPUTT, json: 'MAPPING-ALT', speicher: { rcWcaMappingXlsx: ALT } });
  pruefe('Dienst: Gast-Excel unlesbar -> ALT bleibt, Sicherung NICHT ueberschrieben (naechster Start versucht erneut)',
    r.herkunft === 'MAPPING-ALT' && r.xlsx === ALT && r.importe.join() === 'KAPUTT', JSON.stringify({ h: r.herkunft, x: r.xlsx === ALT }));
}
{
  const r = lauf(NEUQ, { marke: 1, json: 'MAPPING-ALT', speicher: { rcWcaMappingXlsx: ALT } });
  pruefe('Dienst: keine Gast-Excel (503) -> gespeichertes Mapping bleibt, kein Import', r.herkunft === 'MAPPING-ALT' && r.importe.length === 0 && r.xlsx === ALT);
}

// ---- Ohne Marke: EXAKT wie vorher (neue und alte Bauart liefern dasselbe) ---------
const OHNE = [
  ['gespeichertes Mapping, mitgereichte Excel anders -> gespeichertes gewinnt', { gast: NEU, json: 'MAPPING-ALT', speicher: { rcWcaMappingXlsx: ALT } }, r => r.herkunft === 'MAPPING-ALT' && r.importe.length === 0 && r.xlsx === ALT],
  ['kein Mapping, mitgereichte Excel -> Import, NICHT gesichert', { gast: NEU }, r => r.herkunft === 'MAPPING-NEU' && r.xlsx === null],
  ['kein Mapping, keine mitgereichte, gesicherte Excel -> Import aus dem Speicher', { speicher: { rcWcaMappingXlsx: ALT } }, r => r.herkunft === 'MAPPING-ALT' && r.importe.join() === 'MAPPING-ALT'],
  ['nichts da -> Warnung, kein Import', {}, r => r.importe.length === 0 && r.log.warn.length === 1]
];
OHNE.forEach(([name, f, soll]) => {
  const n = lauf(NEUQ, f), a = lauf(ALTQ, f);
  const gleich = JSON.stringify(n) === JSON.stringify(a);
  pruefe('Ohne Marke: ' + name + ' (wie die alte Bauart)', soll(n) && gleich, gleich ? '' : 'weicht von der alten Bauart ab');
});

console.log(rot ? '\n' + rot + ' fehlgeschlagen, ' + ok + ' bestanden' : '\nALLE ' + ok + ' PRUEFUNGEN BESTANDEN');
process.exitCode = rot ? 1 : 0;
