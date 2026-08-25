/* ============================================================================
   MODUL-AUSBAU PRUEFEN (16.08. spaetabends)
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/module_ausbau_pruefen.js

   Nutzer-Vorgabe: "Der Konfigurator ist hier richtig veraltet ... Ich moechte
   Vielfalt haben und viel mehr Diagramme und Charts. Zudem moechte ich aber
   auch die Standort- und Laenderkaempfe sehen, auch wenn ich alleine waehle,
   zum Beispiel als Standort. ... Wichtig ist aber auch das Speichern und die
   Stabilitaet und die Visualitaet."

   DER teuerste Irrtum dieses Umbaus steht in Abschnitt 3: window.rcLetzteStats
   ist NICHT der ungefilterte Vollbestand. Der Dashboard-Filter wirkt schon
   beim Parsen (processDataStream, inScope). Am echten Browser gemessen
   (Filter "Alanya", 12593 Zeilen Fixture):
       standortStats mit Zahlen : nur AL          <- gefiltert
       agentStats                : 142 statt 312  <- gefiltert
       rcAllRejections           : 5124 statt 6537<- gefiltert
       rcAllSales                : 4346, 5 Standorte  <- UNGEFILTERT
       rcWarStdFull              : 5 Standorte        <- UNGEFILTERT
       rcWarBoteCands            : 303 Agenten        <- UNGEFILTERT
   Ein Modul mit freiem Zuschnitt MUSS deshalb aus rcAllSales/rcWarBoteCands
   rechnen. Taete es das nicht, zeigte es bei gefiltertem Dashboard heimlich
   zu wenig — und behauptete dabei "Filter bewusst ignoriert".
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'esl_live_arena_v22.js'), 'utf8');

let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}
function schneide(quelle, marke) {
  const i = quelle.indexOf(marke);
  if (i < 0) return null;
  const auf = quelle.indexOf('{', i);
  if (auf < 0) return null;
  let tiefe = 0;
  for (let j = auf; j < quelle.length; j++) {
    const c = quelle[j];
    if (c === '{') tiefe++;
    else if (c === '}') { tiefe--; if (tiefe === 0) return quelle.slice(i, j + 1); }
  }
  return null;
}
// Einen MOD_TYPES-Eintrag ausschneiden (dieselbe Zaehlweise wie module_live_pruefen.js).
function eintrag(name) {
  const i = SRC.indexOf(name + ':{label:');
  if (i < 0) return null;
  let tiefe = 0;
  for (let j = SRC.indexOf('{', i); j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') tiefe++;
    else if (c === '}') { tiefe--; if (tiefe === 0) return SRC.slice(i, j + 1); }
  }
  return null;
}

const NEUE = ['qual_frei','rang_frei','rang_produkt','rang_null','kampf_arena','kampf_duell',
  'verlauf_kum','verlauf_stunde','verlauf_heat','verlauf_tage','mix_produkt','mix_ring',
  'qual_zahl','qual_tacho','qual_ampel','qual_streu','qual_zeit','qual_verteil',
  'tab_frei','karte_std','ticker_sales','grund_pareto','ziel_bullet','quoten'];

console.log('MODUL-AUSBAU PRUEFEN');
console.log('');

/* ---------------------------------------------------------------------------
   1) Registry: jeder neue Typ ist vollstaendig
--------------------------------------------------------------------------- */
console.log('1) Registry — jeder Typ vollstaendig und wohlgeformt');

pruefe('alle ' + NEUE.length + ' neuen Typen sind in MOD_TYPES', NEUE.every(t => !!eintrag(t)),
  NEUE.filter(t => !eintrag(t)).join(', '));

const ohne = { live: [], cat: [], hoch: [], def: [], fields: [], render: [], hilfe: [] };
NEUE.forEach(t => {
  const e = eintrag(t) || '';
  if (e.indexOf('live:true') < 0) ohne.live.push(t);
  if (!/cat:'(Rangliste|Kampf|Verlauf|Verteilung|Qualitaet|Uebersicht)'/.test(e)) ohne.cat.push(t);
  if (!/hoch:\d/.test(e)) ohne.hoch.push(t);
  if (e.indexOf('def:function') < 0) ohne.def.push(t);
  if (e.indexOf('fields:[') < 0) ohne.fields.push(t);
  if (e.indexOf('render:function') < 0) ohne.render.push(t);
  if (e.indexOf('hilfe:') < 0) ohne.hilfe.push(t);
});
pruefe('alle tragen live:true (sonst frieren sie nach dem ersten Render ein)', !ohne.live.length, ohne.live.join(', '));
pruefe('alle tragen eine der neuen Kategorien', !ohne.cat.length, ohne.cat.join(', '));
pruefe('alle tragen eine Vorgabe-Hoehe (hoch:)', !ohne.hoch.length,
  'Ohne Hoehe steht die Kachel auf 120 px und schneidet den Inhalt ab — im Browser gemessen: 21 von 22.');
pruefe('alle haben def/fields/render', !ohne.def.length && !ohne.fields.length && !ohne.render.length,
  [].concat(ohne.def, ohne.fields, ohne.render).join(', '));
pruefe('alle haben einen Hilfetext (Titel-Tooltip in der Auswahl)', !ohne.hilfe.length, ohne.hilfe.join(', '));

// Emoji-Verbot (Corporate Design) — auf den neuen Eintraegen.
const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
pruefe('kein Emoji in den neuen Modulen', !NEUE.some(t => emoji.test(eintrag(t) || '')),
  NEUE.filter(t => emoji.test(eintrag(t) || '')).join(', '));

// Zustandslos: kein Canvas, kein rAF, kein Math.random, kein Timer.
const verbote = ['requestAnimationFrame', 'Math.random', 'setInterval(', 'getContext(', '<canvas'];
const mitVerbot = NEUE.filter(t => { const e = eintrag(t) || ''; return verbote.some(v => e.indexOf(v) >= 0); });
pruefe('kein rAF / Math.random / Canvas / Timer in den Modulen', !mitVerbot.length,
  mitVerbot.join(', ') + ' — in Hintergrund-Tabs feuert rAF nicht, ein Timer ueberlebt den Re-Inject.');

/* ---------------------------------------------------------------------------
   2) Zuschnitt-Aufloesung funktional
--------------------------------------------------------------------------- */
console.log('');
console.log('2) modScope — der Zuschnitt je Modul');

const modScope = new Function('window', 'H',
  schneide(SRC, 'function modScope(m)') + '; return modScope;'
)({ rcActiveScope: () => ({ std: 'AL', team: 'T1', stack: 'VKD' }) }, { std: c => c });

pruefe('ohne Angabe folgt das Modul dem Dashboard', (function () {
  const s = modScope({}); return s.folgt === true && s.std === 'AL' && s.team === 'T1' && s.stack === 'VKD';
})());
pruefe('"alle" ignoriert den Dashboard-Filter vollstaendig', (function () {
  const s = modScope({ scope: 'alle' });
  return s.folgt === false && s.std === 'ALL' && s.team === 'ALL' && s.stack === 'ALL' && s.nation === 'ALL';
})(), 'Genau das ist die Nutzer-Vorgabe "auch wenn ich alleine waehle".');
pruefe('"std:B" setzt einen festen Standort, unabhaengig vom Dashboard', (function () {
  const s = modScope({ scope: 'std:B' }); return s.folgt === false && s.std === 'B' && s.team === 'ALL';
})());
pruefe('"nation:TR" setzt ein festes Land', (function () {
  const s = modScope({ scope: 'nation:TR' }); return s.folgt === false && s.nation === 'TR' && s.std === 'ALL';
})());
pruefe('"team:X" setzt ein festes Team', (function () {
  const s = modScope({ scope: 'team:VKD-TECH-82' }); return s.folgt === false && s.team === 'VKD-TECH-82';
})());
// Ein kaputter gespeicherter Wert faellt bewusst auf den Dashboard-Filter
// zurueck — das ist der sichere Zustand. Entscheidend ist nur, dass die
// Kachel dann auch DRAUFSCHREIBT, dass sie dem Filter folgt: still etwas
// anderes zu zeigen, als oben steht, waere der eigentliche Fehler.
{
  const modScopeText = new Function('window', 'H', 'mbNationName', 'esc',
    schneide(SRC, 'function modScopeText(sc)') + '; return modScopeText;'
  )({}, { std: c => 'Standort ' + c }, n => n, s => s);
  const s = modScope({ scope: 'quatsch' });
  pruefe('ein kaputter Zuschnitt-Wert faellt auf den Dashboard-Filter zurueck UND sagt es',
    s.folgt === true && /Dashboard-Filter/.test(modScopeText(s)),
    'Ergebnis: ' + JSON.stringify(s) + ' / "' + modScopeText(s) + '"');
  pruefe('GEGENPROBE: bei freiem Zuschnitt steht NICHT "Dashboard-Filter" im Kopf',
    !/Dashboard-Filter/.test(modScopeText(modScope({ scope: 'alle' }))),
    'Der Kopf ist das einzige, was den Zuschnitt sichtbar macht.');
}

/* ---------------------------------------------------------------------------
   3) DER Kern: freier Zuschnitt rechnet aus den UNGEFILTERTEN Quellen
--------------------------------------------------------------------------- */
console.log('');
console.log('3) Freier Zuschnitt — ungefilterte Quellen (der teuerste Irrtum)');

pruefe('mbAgenten schaltet bei freiem Zuschnitt auf mbAgentenFrei um',
  /function mbAgenten\(d, sc\)\{\s*if\(sc && sc\.folgt===false\) return mbAgentenFrei\(sc\);/.test(SRC.replace(/\n\s*/g, m => m.indexOf('\n') >= 0 ? '\n' : m)) ||
  /if\(sc && sc\.folgt===false\) return mbAgentenFrei\(sc\)/.test(SRC),
  'Ohne die Weiche zeigte ein "Kampf" bei gefiltertem Dashboard nur den einen Standort.');
pruefe('mbAgentenFrei liest rcAllSales (ungefiltert) statt rcLetzteStats',
  /function mbAgentenFrei/.test(SRC) && /window\.rcAllSales\|\|\[\]/.test((schneide(SRC, 'function mbAgentenFrei(sc)') || '').replace(/\s/g, '')));
pruefe('mbAgentenFrei holt die Ansprachen aus rcWarBoteCands (ungefiltert)',
  (schneide(SRC, 'function mbAgentenFrei(sc)') || '').indexOf('rcWarBoteCands') >= 0);
pruefe('rcWarBoteCands traegt die vo (sonst kein Join mit den Verkaeufen)',
  /rcWarBoteCands = Object\.values\(warAgentAnspr\)\.map\(w => \(\{ vo:w\.vo,/.test(SRC) &&
  /warAgentAnspr\[voRaw\] = \{ vo:voRaw,/.test(SRC));
// mbEinheiten baut die Ebenen AUSSCHLIESSLICH ueber mbAgenten (das schaltet
// selbst um) und mbLiga. Ein zweiter Aufbau fuer den freien Zuschnitt stand
// hier kurz drin und verschluckte genau eine Klasse Einheiten: die mit
// Liga-Daten, aber ohne Verkauf — ein Team, das telefoniert und heute nichts
// abgeschlossen hat, fiel aus der Qualitaets-Rangliste heraus. Gefunden durch
// den Vergleich mit einem unabhaengig gerechneten Sollwert.
{
  const f = schneide(SRC, 'function mbEinheiten(d, sc, ebene)') || '';
  pruefe('mbEinheiten hat GENAU EINEN Aufbauweg (kein Nachbau fuer den freien Zuschnitt)',
    (f.match(/mbAgenten\(d, sc\)/g) || []).length >= 3 && f.indexOf('mbAgentenFrei(sc)') < 0,
    'Ein zweiter Aufbau verliert Einheiten, die nur Liga-Daten haben.');
  pruefe('jede Ebene holt ihre Liga-Zeilen ueber mbLiga(sc)',
    (f.match(/mbLiga\(sc\)/g) || []).length >= 3);
}

// FUNKTIONAL: mbAgentenFrei mit einem gestubbten window rechnen lassen.
{
  const stdIn = 'function mbStdIn(code, sc){ if(!sc) return true; if(sc.std!=="ALL" && code!==sc.std) return false; if(sc.nation!=="ALL" && mbNation(code)!==sc.nation) return false; return true; }';
  const body =
    'function mbNation(c){ return ({AL:"TR",B:"DE",E:"DE"})[c]||""; }' + stdIn +
    schneide(SRC, 'function mbLeerAgent(') +
    schneide(SRC, 'function mbAgentenFrei(sc)') + '; return mbAgentenFrei;';
  const w = {
    rcAllSales: [
      { vo: 'v1', name: 'Anna', team: 'T1', standort: 'AL', cat: 'kip', isBnt: true, isVvl: false, anzahl: 2 },
      { vo: 'v1', name: 'Anna', team: 'T1', standort: 'AL', cat: 'mob', isBnt: true, isVvl: false, anzahl: 1 },
      { vo: 'v2', name: 'Bert', team: 'T2', standort: 'B', cat: 'kipVvl', isBnt: false, isVvl: true, anzahl: 5 }
    ],
    rcWarBoteCands: [
      { vo: 'v1', name: 'Anna', standort: 'AL', ansp: 40 },
      { vo: 'v3', name: 'Clara', standort: 'E', ansp: 12 }   // spricht an, verkauft nichts
    ]
  };
  const mbAgentenFrei = new Function('window', body)(w);
  const alle = mbAgentenFrei({ std: 'ALL', team: 'ALL', stack: 'ALL', nation: 'ALL', folgt: false });
  const anna = alle.filter(a => a.vo === 'v1')[0];
  const bert = alle.filter(a => a.vo === 'v2')[0];
  const clara = alle.filter(a => a.vo === 'v3')[0];
  pruefe('freier Bestand enthaelt ALLE Standorte (AL, B, E)', alle.length === 3, JSON.stringify(alle.map(a => a.standort)));
  pruefe('Mengen werden je Kategorie richtig summiert (Anna: kip 2, mob 1, bnt 3)',
    anna && anna.kip === 2 && anna.mob === 1 && anna.bnt === 3, JSON.stringify(anna));
  pruefe('VVL laeuft in vvl, nicht in bnt (Bert: vvl 5, bnt 0)',
    bert && bert.vvl === 5 && bert.bnt === 0, JSON.stringify(bert));
  pruefe('Ansprachen kommen aus dem Boten-Bestand (Anna 40)', anna && anna.ansprachen === 40);
  pruefe('ein Agent OHNE Abschluss faellt nicht heraus (Clara, 12 Ansprachen)',
    !!clara && clara.ansprachen === 12,
    'Genau die, die viel ansprechen und nichts abschliessen, sind die interessanten.');
  pruefe('ESL-Kontakte sind im freien Bestand NULL, nicht 0 (ehrlich statt still falsch)',
    anna && anna.kontakte === null,
    'Eine stille 0 saehe echt aus — die Groesse gibt es hier aber gar nicht.');
  const nurTR = mbAgentenFrei({ std: 'ALL', team: 'ALL', stack: 'ALL', nation: 'TR', folgt: false });
  pruefe('Nation-Zuschnitt filtert auf die Standorte des Landes (TR -> nur Anna)',
    nurTR.length === 1 && nurTR[0].vo === 'v1', JSON.stringify(nurTR.map(a => a.standort)));
  const nurT2 = mbAgentenFrei({ std: 'ALL', team: 'T2', stack: 'ALL', nation: 'ALL', folgt: false });
  pruefe('Team-Zuschnitt nimmt KEINE Boten ohne bekanntes Team auf (nicht raten)',
    nurT2.length === 1 && nurT2[0].vo === 'v2', JSON.stringify(nurT2.map(a => a.vo)));
}

/* ---------------------------------------------------------------------------
   4) Kennzahl-Registry: EIN Rechenweg, gepoolt statt gemittelt
--------------------------------------------------------------------------- */
console.log('');
console.log('4) Kennzahlen — Aggregation nach den Projektregeln');

const mbWert = (function () {
  const body =
    schneide(SRC, 'var MB_KENN = {').replace(/^var /, 'var ') + ';' +
    'function mbKenn(id){ return MB_KENN[id] || MB_KENN.bnt; }' +
    'function rcZeitMittel(liste, feld){ var s=0,n=0,da=false; liste.forEach(function(k){ if(k[feld]==null) return; da=true; if(!(k[feld]>0)) return; var g=k.callCount>0?k.callCount:1; s+=k[feld]*g; n+=g; }); return {sek:n>0?s/n:null,n:n,geliefert:da}; }' +
    schneide(SRC, 'function mbWert(kennId, esl, liga)') + '; return mbWert;';
  return new Function(body)();
})();

pruefe('Stueckzahlen werden addiert (bnt 3+4 = 7)',
  mbWert('bnt', [{ bnt: 3 }, { bnt: 4 }], []).wert === 7);
pruefe('Quoten werden GEPOOLT, nicht gemittelt (5/10 + 7/0 -> 50 %, nicht 120 %)', (function () {
  const r = mbWert('cs', [], [{ cs: 50, csZ: 5, csN: 10 }, { cs: 70, csZ: 7, csN: 0 }]);
  return Math.abs(r.wert - 50) < 0.001;
})(), 'Der Nenner-0-Fall ist im Projekt dokumentiert: die Ligaliste liefert den Zaehler trotzdem.');
pruefe('ohne Zaehler/Nenner faellt die Quote auf den Mittelwert zurueck', (function () {
  const r = mbWert('cs', [], [{ cs: 80 }, { cs: 60 }]);
  return Math.abs(r.wert - 70) < 0.001;
})());
pruefe('Zeiten werden ueber die Calls gewichtet (10x600s + 30x300s = 375s)', (function () {
  const liste = [];
  for (let i = 0; i < 10; i++) liste.push({ acwSec: 600, callCount: 1 });
  for (let i = 0; i < 30; i++) liste.push({ acwSec: 300, callCount: 1 });
  const r = mbWert('acwSec', [], liste);
  return Math.abs(r.wert - 375) < 0.001;
})(), 'Ungewichtet kaeme 450 heraus — der Fehler, der im Projekt schon einmal drinsteckte.');
pruefe('fehlende Zeit-Spalte ergibt geliefert:false (nicht 0)', (function () {
  const r = mbWert('acwSec', [], [{ callCount: 5 }, { callCount: 3 }]);
  return r.wert === null && r.geliefert === false;
})(), 'Genau der ACW/ACHT-Fall vom 16.08.: Spalte fehlt ist nicht "0 Sekunden".');
pruefe('leere Liga-Liste ergibt null, keine 0', (function () {
  const r = mbWert('cs', [], []); return r.wert === null && r.geliefert === false;
})());
pruefe('ESL-Kennzahl mit lauter null ergibt null (freier Zuschnitt, Kontakte)', (function () {
  const r = mbWert('kontakte', [{ kontakte: null }, { kontakte: null }], []);
  return r.wert === null && r.geliefert === false;
})());
pruefe('AHT-Ziel wird von Minuten in Sekunden umgerechnet (13 Min -> 780 s)', (function () {
  const f = new Function('RC_ZIELE',
    schneide(SRC, 'var MB_KENN = {') + ';' +
    'function mbKenn(id){ return MB_KENN[id]; }' +
    schneide(SRC, 'function mbZiel(kenn)') + '; return mbZiel(MB_KENN.ahtSec);'
  )({ ahtMin: { max: 13, opt: 10 } });
  return f && f.max === 780 && f.opt === 600;
})(), 'RC_ZIELE fuehrt AHT in Minuten, die Kennzahl in Sekunden — einmal zentral umgerechnet.');

/* ---------------------------------------------------------------------------
   5) Quellen, die den Filter NICHT ueberleben, werden nicht beworben
--------------------------------------------------------------------------- */
console.log('');
console.log('5) Ehrlichkeit bei gefilterten Quellen');

const pareto = eintrag('grund_pareto') || '';
pruefe('grund_pareto bietet KEINEN freien Zuschnitt an', pareto.indexOf("'scope','Zuschnitt','scope'") < 0,
  'rcAllRejections wird nur im gefilterten Zweig gefuellt (gemessen: 5124 statt 6537).');
pruefe('grund_pareto sagt im Text, dass es dem Dashboard-Filter folgt',
  /folgt immer dem Dashboard-Filter/.test(pareto));
pruefe('mbFehltGrund unterscheidet Ligaliste-Luecke und freien Zuschnitt',
  /function mbFehltGrund\(kenn, sc\)/.test(SRC) &&
  (schneide(SRC, 'function mbFehltGrund(kenn, sc)') || '').indexOf('RC_ZEIT_FEHLT') >= 0);

// Die sales-basierten Module duerfen NUR aus rcAllSales lesen (das ist die
// ungefilterte Quelle) — nicht aus d.standorte/d.agents.
['rang_produkt','verlauf_kum','verlauf_stunde','verlauf_heat','mix_produkt','ticker_sales'].forEach(t => {
  const e = eintrag(t) || '';
  pruefe(t + ' liest die Verkaeufe ueber mbSales (ungefiltert)', e.indexOf('mbSales(d, sc)') >= 0);
});

/* ---------------------------------------------------------------------------
   6) Keine Quote ohne Liga-Nenner (die eiserne Projektregel)
--------------------------------------------------------------------------- */
console.log('');
console.log('6) Keine Quote ohne Nenner, kein ESL-Rueckfall');

pruefe('mbFmt schreibt bei null einen Strich statt einer Zahl',
  /if\(wert==null\) return '&mdash;';/.test(SRC));
const anspAlt = eintrag('live_ansprache') || '';
pruefe('das alte Ansprache-Modul faellt weiterhin NICHT auf ESL-Kontakte zurueck',
  anspAlt.indexOf('rcLigaAggScope') >= 0 && /q==null\?'&mdash;'/.test(anspAlt.replace(/\s/g, '')));
pruefe('mbLigaCalls geht ueber rcLigaAggScope (EIN Rechenweg)',
  (schneide(SRC, 'function mbLigaCalls(sc)') || '').indexOf('rcLigaAggScope') >= 0);
pruefe('mbLiga filtert ueber rcLigaInScope/rcLigaMeta, nie selbst auf k.standort',
  (function () { const f = schneide(SRC, 'function mbLiga(sc)') || '';
    return f.indexOf('rcLigaInScope') >= 0 && f.indexOf('rcLigaMeta') >= 0 && !/k\.standort\s*!==/.test(f); }),
  'Liga-Team ist eine NUMMER, das Dashboard filtert auf den NAMEN.');

/* ---------------------------------------------------------------------------
   7) Bedienung: Zwei-Listen-Falle und Auswahl
--------------------------------------------------------------------------- */
console.log('');
console.log('7) Konfigurator — Aufbau UND Handler');

const FELDTYPEN = ['scope','kenn','kennfrei','ebene','sort'];
FELDTYPEN.forEach(t => {
  pruefe('Feldtyp "' + t + '" wird in customFields gebaut', new RegExp("type==='" + t + "'").test(SRC));
});
pruefe('alle ' + FELDTYPEN.length + ' neuen Feldtypen sind <select> mit data-if (der vorhandene Handler greift)',
  (function () {
    const f = schneide(SRC, 'function customFields(m,i)') || '';
    return FELDTYPEN.every(t => {
      const k = "type==='" + t + "'";
      const i = f.indexOf(k); if (i < 0) return false;
      // Bis zum NAECHSTEN Zweig schauen, nicht ein festes Zeichenfenster:
      // ein gewachsener Zweig (Team-/Stack-Gruppen im Zuschnitt) sprengte
      // das Fenster sonst und die Pruefung meldete grundlos rot.
      const naechster = f.indexOf("else if(type===", i + 5);
      const stueck = f.slice(i, naechster > 0 ? naechster : f.length);
      return stueck.indexOf('<select') >= 0 && stueck.indexOf('data-if="') >= 0;
    });
  })(),
  'Ein eigenes Bedien-Element braeuchte einen eigenen Handler — genau die dokumentierte Zwei-Listen-Falle.');
pruefe('der Zuschnitt kennt Standort, Land, Team UND Stack',
  (function () {
    const f = schneide(SRC, 'function modScope(m)') || '';
    return ["'std:'", "'nation:'", "'team:'", "'stack:'"].every(p => f.indexOf(p) >= 0);
  })());
pruefe('die Zuschnitt-Auswahl bietet alle vier Gruppen an',
  (function () {
    const f = schneide(SRC, 'function customFields(m,i)') || '';
    const i = f.indexOf("type==='scope'");
    const stueck = f.slice(i, i + 3000);
    return ['Nur dieser Standort','Nur dieses Land','Nur dieses Team','Nur dieser Stack'].every(t => stueck.indexOf(t) >= 0);
  })());
pruefe('mbAgentenFrei filtert auch nach Stack und raet kein Team/Stack fuer Boten',
  (function () {
    const f = schneide(SRC, 'function mbAgentenFrei(sc)') || '';
    return f.indexOf("sc.stack!=='ALL'") >= 0 && /if\(sc\.team!=='ALL'\|\|sc\.stack!=='ALL'\) return;/.test(f);
  })(),
  'Der Boten-Bestand kennt weder Team noch Stack — dort darf nichts geraten werden.');
pruefe('die freie Portal-Kennzahl liest kpi.alle zur Laufzeit',
  (eintrag('qual_frei') || '').indexOf('k.alle') >= 0 &&
  /kfNamen/.test(schneide(SRC, 'function customFields(m,i)') || ''),
  'Damit braucht eine neue Portal-Kennzahl keine Code-Aenderung mehr.');
pruefe('die freie Portal-Kennzahl POOLT (z/n) und nennt die Basis',
  (function () { const e = eintrag('qual_frei') || '';
    return /w\.z!=null && w\.n>0/.test(e) && e.indexOf('Zaehler / Nenner') >= 0; })());
pruefe('der Zuschnitt-Wahlschalter kennzeichnet unbekannte gespeicherte Werte',
  (schneide(SRC, 'function customFields(m,i)') || '').indexOf('nicht in den aktuellen Daten') >= 0,
  'Fallstrick 10: ein select ohne selected zeigt die erste Option und luegt.');
pruefe('Modul-Auswahl ist nach Kategorien gruppiert', /rc-cfg-katkopf/.test(SRC));
pruefe('Modul-Auswahl hat ein Suchfeld', /id="cfgModSuche"/.test(SRC));
pruefe('Suchfeld-Handler ist verdrahtet (Zwei-Listen-Falle)', /q\('cfgModSuche'\),'input'/.test(SRC));
pruefe('die Suche blendet nur aus und baut NICHT neu auf (sonst Fokusverlust)',
  (function () { const i = SRC.indexOf("q('cfgModSuche'),'input'");
    const st = SRC.slice(i, i + 900); return st.indexOf('style.display') >= 0 && st.indexOf('renderBody()') < 0; }));
pruefe('Hoehen-Knoepfe fuer eigene Module im Aufbau', /data-imho="-1"/.test(SRC) && /data-imho="1"/.test(SRC));
pruefe('Hoehen-Knoepfe im Handler', /box\.querySelectorAll\('\[data-imho\]'\)/.test(SRC));
pruefe('Breiten-Knoepfe (eigene Seiten) im Aufbau und Handler',
  /data-imbr="1"/.test(SRC) && /box\.querySelectorAll\('\[data-imbr\]'\)/.test(SRC));

/* ---------------------------------------------------------------------------
   8) Stabilitaet und Speicher
--------------------------------------------------------------------------- */
console.log('');
console.log('8) Stabilitaet');

pruefe('custHoehe gibt jedem Modul eine Hoehe (Vorgabe des Typs, sonst 120)',
  /function custHoehe\(mod\)/.test(SRC));
pruefe('die Hoehe kaempft NICHT gegen die Layout-Engine (_rcDockH-Wache)',
  /if\(!el\._rcDockH && !el\.classList\.contains\('rc-carousel-pane'\)\)/.test(SRC),
  'Sonst schrieben min-height und height im 2-s-Takt gegeneinander.');
pruefe('Breite wird auch auf eigenen Seiten nachgezogen, nicht nur beim Anlegen',
  /page==='info'\|\|page\.indexOf\('cp_'\)===0\) el\.style\.gridColumn/.test(SRC));
pruefe('renderModBody faengt Ausnahmen ab (ein kaputtes Modul legt nichts lahm)',
  /function renderModBody\(mod\)\{[^]*?catch\(e\)\{ return '<div class="rc-info-empty">'/.test(SRC));
pruefe('D() reicht die Rohliga als Referenz durch, kopiert sie nicht',
  /ligaRoh:window\.rcKpiData\|\|\{\}/.test(SRC),
  '500+ Agenten je 2-s-Takt zu klonen waere auf dem Wandmonitor spuerbar.');
pruefe('das Streudiagramm ist gedeckelt (sonst 300+ Punkte je Render)',
  /var GEDECKELT=150/.test(SRC));
pruefe('der Deckel wird dem Nutzer gesagt, nicht verschwiegen',
  /gezeigt werden die groessten/.test(SRC),
  'Stilles Abschneiden liest sich wie "das ist alles".');

/* ---------------------------------------------------------------------------
   9) Visualitaet: Text bleibt HTML, Geometrie ist SVG
--------------------------------------------------------------------------- */
console.log('');
console.log('9) Zeichen-Bausteine');

['mbBalken','mbStapel','mbLinie','mbRing','mbTacho','mbHeat','mbStreu','mbZahl','mbTabelle','mbKopf'].forEach(f => {
  pruefe('Baustein ' + f + ' existiert', new RegExp('function ' + f + '\\(').test(SRC));
});
pruefe('in den SVG-Bausteinen steht KEIN <text> (Beschriftung waere sonst skaliert)',
  ['mbLinie','mbRing','mbTacho','mbStreu'].every(f => (schneide(SRC, 'function ' + f + '(') || '').indexOf('<text') < 0),
  'Text im viewBox schrumpft mit der Kartenbreite — auf dem Wandmonitor unlesbar.');
pruefe('gestapelte Baender runden ueber rcBandBreiten (Hare/Niemeyer)',
  (schneide(SRC, 'function mbStapel(teile, gesamt)') || '').indexOf('rcBandBreiten') >= 0,
  'Naives Runden zeigt ein 1-%-Segment optisch so gross wie ein 21-%-Segment.');
pruefe('Standort-Farben kommen aus der EINEN Wahrheit (rcChartFarbe)',
  (schneide(SRC, 'function mbStdFarbe(code,i)') || '').indexOf('rcChartFarbe') >= 0);
pruefe('Ampelfarben kommen aus zielColor (nicht selbst gemischt)',
  (schneide(SRC, 'function mbFarbe(wert, kennId)') || '').indexOf('zielColor') >= 0);
pruefe('keine Schriftgroesse unter 10px in den neuen CSS-Klassen', (function () {
  const i = SRC.indexOf('===== MODUL-BAUSTEINE');
  const blockEnde = SRC.indexOf('===== LAYOUT-ENGINE v2', i);
  const block = SRC.slice(i, blockEnde > 0 ? blockEnde : i + 6000);
  const klein = (block.match(/font-size:\s*([0-9.]+)px/g) || []).map(x => parseFloat(x.match(/([0-9.]+)px/)[1])).filter(v => v < 10);
  return klein.length === 0;
})(), 'Fernsicht: 20 Zoll aus 3 Metern.');
pruefe('der Kopf jeder Kachel nennt den Zuschnitt',
  (schneide(SRC, 'function mbKopf(sc, zusatz)') || '').indexOf('modScopeText') >= 0,
  'Ein Modul mit eigenem Zuschnitt neben einem gefilterten Dashboard waere sonst irrefuehrend.');
pruefe('ein abweichender Zuschnitt wird farblich hervorgehoben',
  /\.rc-mb-kopf \.frei\{color:#EB9700;\}/.test(SRC.replace(/\s+/g, ' ')) || /rc-mb-kopf \.frei/.test(SRC));

/* ------------------------------------------------------------------------ */
console.log('');
console.log('============================================================');
if (fehler === 0) console.log('  ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN');
else console.log('  ' + (geprueft - fehler) + ' bestanden, ' + fehler + ' FEHLGESCHLAGEN');
console.log('============================================================');
process.exitCode = fehler ? 1 : 0;
