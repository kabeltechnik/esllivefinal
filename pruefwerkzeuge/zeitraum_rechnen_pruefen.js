/* ============================================================================
   ZEITRAUM-AGGREGATION PRUEFEN
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/zeitraum_rechnen_pruefen.js

   Prueft die Rechenregeln des Zeitraum-Exports gegen VON HAND nachgerechnete
   Werte. Kein Portal noetig — die Tageszeilen werden hier erzeugt, damit jedes
   Ergebnis vorher bekannt ist.

   Geprueft werden die vier Regeln, die im Projekt jeweils schon einmal eine
   Falle waren:
     1. Mengen summieren.
     2. AHT ueber die Calls gewichten, mit EIGENEM Nenner.
     3. Quoten aus summierten Zaehlern/Nennern - und nur bei Nenner > 0.
        (Die Ligaliste liefert Zaehler bei Nenner 0, nicht null. An 520 echten
         Agenten kam sonst FQ = 191,3 % heraus.)
     4. Detraktoren addieren, CS/TNPS poolen.
============================================================================ */
'use strict';

let fehler = 0, geprueft = 0;
function pruefe(name, ist, soll, hinweis) {
  geprueft++;
  const gleich = (typeof soll === 'number' && typeof ist === 'number')
    ? Math.abs(ist - soll) < 0.05
    : ist === soll;
  if (gleich) console.log('  OK   ' + name + '  = ' + ist);
  else { console.log('  FEHL ' + name + '\n         erwartet: ' + soll + '\n         bekommen: ' + ist +
    (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}

console.log('ZEITRAUM-AGGREGATION PRUEFEN');
console.log('');

// ---------------------------------------------------------------------------
//  Die Aggregation aus esl_live_arena_v22.js, hier isoliert nachgebaut.
//  Bewusst KEIN Import: die Funktion ist kapselintern. Aendert sich die Regel
//  dort, muss sie auch hier nachgezogen werden - dieser Test ist die
//  Beschreibung des SOLL-Verhaltens.
// ---------------------------------------------------------------------------
const KENN = ['aq', 'cs', 'tnps', 'fq', 'dds', 'ftf'];

function aggregiere(tageszeilen) {
  const a = { calls: 0, ahtW: 0, ahtN: 0, ansp: 0, anspCalls: 0, hasEsl: false,
              mob: null, kip: null, bnt: null, vvl: null, detr: null,
              tageLiga: 0, tageEsl: 0 };
  KENN.forEach(s => { a[s] = { z: null, n: null, zAll: null }; });

  tageszeilen.forEach(r => {
    const calls = r.calls || 0;
    a.calls += calls;
    if (calls > 0) a.tageLiga++;
    if (r.ahtSec != null && calls > 0) { a.ahtW += r.ahtSec * calls; a.ahtN += calls; }
    if (r.hasEsl) {
      a.hasEsl = true; a.tageEsl++;
      a.ansp += r.ansp || 0;
      a.anspCalls += calls;
      ['mob', 'kip', 'bnt', 'vvl'].forEach(f => { if (r[f] != null) a[f] = (a[f] || 0) + r[f]; });
    }
    if (r.detr != null) a.detr = (a.detr || 0) + r.detr;
    KENN.forEach(s => {
      const kv = r[s]; if (!kv) return;
      if (kv.z != null) a[s].zAll = (a[s].zAll || 0) + kv.z;
      if (kv.z != null && kv.n > 0) {
        a[s].z = (a[s].z || 0) + kv.z;
        a[s].n = (a[s].n || 0) + kv.n;
      }
    });
  });

  const raus = { calls: a.calls, ahtSec: a.ahtN > 0 ? a.ahtW / a.ahtN : null,
                 hasEsl: a.hasEsl, ansp: a.ansp, mob: a.mob, kip: a.kip,
                 bnt: a.bnt, vvl: a.vvl, detr: a.detr,
                 tageLiga: a.tageLiga, tageEsl: a.tageEsl, ahtCalls: a.ahtN };
  KENN.forEach(s => {
    const q = a[s];
    raus[s] = { z: q.z, n: q.n, v: (q.n > 0) ? (q.z / q.n * 100) : null };
  });
  return raus;
}

// ---------------------------------------------------------------------------
//  1) Mengen summieren
// ---------------------------------------------------------------------------
console.log('1) Mengen werden summiert');
{
  const tage = [
    { calls: 10, hasEsl: true, ansp: 4, mob: 1, kip: 2, bnt: 3, vvl: 1, detr: 2 },
    { calls: 20, hasEsl: true, ansp: 6, mob: 2, kip: 0, bnt: 2, vvl: 3, detr: 1 },
    { calls: 5,  hasEsl: true, ansp: 1, mob: 0, kip: 1, bnt: 1, vvl: 0, detr: 0 }
  ];
  const r = aggregiere(tage);
  pruefe('Calls', r.calls, 35);
  pruefe('Ansprachen', r.ansp, 11);
  pruefe('Mobilfunk', r.mob, 3);
  pruefe('KIP', r.kip, 3);
  pruefe('Detraktoren (Anzahl, wird addiert)', r.detr, 3);
  pruefe('Tage mit Calls', r.tageLiga, 3);
}

// ---------------------------------------------------------------------------
//  2) AHT ueber die Calls gewichten - mit EIGENEM Nenner
// ---------------------------------------------------------------------------
console.log('');
console.log('2) AHT wird ueber die Calls gewichtet');
{
  // Tag A: 10 Calls a 600 s, Tag B: 30 Calls a 300 s
  // Gewichtet: (10*600 + 30*300) / 40 = (6000 + 9000) / 40 = 375 s
  // Ein einfacher Mittelwert waere (600+300)/2 = 450 s - deutlich zu hoch.
  const r = aggregiere([
    { calls: 10, ahtSec: 600 },
    { calls: 30, ahtSec: 300 }
  ]);
  pruefe('gewichtete AHT', Math.round(r.ahtSec), 375, 'ungewichtet waeren es faelschlich 450');

  // Ein Tag OHNE AHT-Meldung darf den Nenner nicht aufblaehen.
  // Nur Tag A liefert AHT: 600 s bei 10 Calls -> 600 s, NICHT 6000/40 = 150 s.
  const r2 = aggregiere([
    { calls: 10, ahtSec: 600 },
    { calls: 30, ahtSec: null }
  ]);
  pruefe('AHT mit eigenem Nenner', Math.round(r2.ahtSec), 600,
    'durch die Gesamt-Calls geteilt kaeme faelschlich 150 heraus');
  pruefe('AHT-Bezug wird mitgefuehrt', r2.ahtCalls, 10);
  pruefe('keine AHT-Meldung -> null', aggregiere([{ calls: 5, ahtSec: null }]).ahtSec, null);
}

// ---------------------------------------------------------------------------
//  3) Quoten poolen - und der Nenner-0-Fallstrick
// ---------------------------------------------------------------------------
console.log('');
console.log('3) Quoten werden gepoolt, nicht gemittelt');
{
  // Tag A: 9 von 10 = 90 %, Tag B: 1 von 40 = 2,5 %
  // Gepoolt: 10 / 50 = 20 %. Der Mittelwert waere (90+2,5)/2 = 46,25 % - falsch.
  const r = aggregiere([
    { calls: 10, cs: { z: 9, n: 10, v: 90 } },
    { calls: 40, cs: { z: 1, n: 40, v: 2.5 } }
  ]);
  pruefe('gepoolte Quote', +r.cs.v.toFixed(1), 20, 'gemittelt waeren es faelschlich 46,3');
  pruefe('Zaehler-Summe', r.cs.z, 10);
  pruefe('Nenner-Summe', r.cs.n, 50);
}
{
  // DER FALLSTRICK: Zaehler auf Nenner NULL. Die Ligaliste liefert das real.
  // Tag A: 5 von 10 = 50 %. Tag B: Zaehler 7, Nenner 0 -> darf NICHT eingehen.
  // Richtig: 5/10 = 50 %. Falsch waere (5+7)/10 = 120 %.
  const r = aggregiere([
    { calls: 10, fq: { z: 5, n: 10, v: 50 } },
    { calls: 10, fq: { z: 7, n: 0,  v: null } }
  ]);
  pruefe('Nenner 0 wird uebersprungen', +r.fq.v.toFixed(1), 50,
    'ohne die Pruefung n>0 kaemen 120 % heraus - genau der gemessene 191,3-%-Fehler');
  pruefe('Zaehler ohne Nenner NICHT in der Quotenbasis', r.fq.z, 5);
}
{
  // Nie eine Bezugsmenge -> "Keine", nicht 0 %.
  const r = aggregiere([
    { calls: 10, ftf: { z: 3, n: 0, v: null } },
    { calls: 10, ftf: { z: 2, n: 0, v: null } }
  ]);
  pruefe('nie ein Nenner -> Quote bleibt null', r.ftf.v, null,
    'eine 0 % wuerde hier eine Aussage behaupten, die es nicht gibt');
}
{
  // Echte 0 %: Nenner vorhanden, Zaehler 0. Muss 0 sein, NICHT null.
  const r = aggregiere([
    { calls: 10, aq: { z: 0, n: 10, v: 0 } },
    { calls: 10, aq: { z: 0, n: 15, v: 0 } }
  ]);
  pruefe('Zaehler 0 bei echtem Nenner -> 0 %', r.aq.v, 0);
}

// ---------------------------------------------------------------------------
//  4) NPS-artige Werte: negativ ist gueltig
// ---------------------------------------------------------------------------
console.log('');
console.log('4) CS/TNPS duerfen negativ sein');
{
  // 2 Promotoren, 8 Detraktoren auf 10 -> der Zaehler ist negativ.
  const r = aggregiere([
    { calls: 10, tnps: { z: -6, n: 10, v: -60 } },
    { calls: 10, tnps: { z: 2,  n: 10, v: 20 } }
  ]);
  pruefe('negativer NPS bleibt erhalten', +r.tnps.v.toFixed(1), -20,
    'gekappt oder als "fehlend" behandelt waere es falsch');
}

// ---------------------------------------------------------------------------
//  5) Luecken: Tage ohne ESL duerfen den Vertrieb nicht auf 0 setzen
// ---------------------------------------------------------------------------
console.log('');
console.log('5) Tage ohne Daten sind keine Nullen');
{
  const r = aggregiere([
    { calls: 10, hasEsl: true, ansp: 3, bnt: 2 },
    { calls: 12, hasEsl: false },              // Liga da, ESL fehlt
    { calls: 8,  hasEsl: true, ansp: 1, bnt: 1 }
  ]);
  pruefe('Calls zaehlen alle Tage', r.calls, 30);
  pruefe('Vertrieb nur aus Tagen MIT ESL', r.bnt, 3);
  pruefe('Tage mit Vertriebsdaten', r.tageEsl, 2);
  pruefe('Tage mit Calls', r.tageLiga, 3);
}
{
  // Nie ESL-Daten -> Vertrieb bleibt null (nicht 0). Eine 0 laese sich als
  // "nichts verkauft" lesen, gemeint ist "nicht getrackt".
  const r = aggregiere([{ calls: 10, hasEsl: false }, { calls: 5, hasEsl: false }]);
  pruefe('nie ESL -> bnt bleibt null', r.bnt, null);
  pruefe('nie ESL -> hasEsl false', r.hasEsl, false);
}

console.log('');
console.log('----------------------------------------------------');
console.log(fehler === 0
  ? 'ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN.'
  : fehler + ' von ' + geprueft + ' Pruefungen FEHLGESCHLAGEN.');
process.exit(fehler === 0 ? 0 : 1);
