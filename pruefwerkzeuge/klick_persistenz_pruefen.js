/* ============================================================================
   KLICK-PERSISTENZ PRUEFEN
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/klick_persistenz_pruefen.js

   Nutzer-Befund 14.08.: "Die Ligaliste muesste sich problemlos immer wieder
   updaten." Ursache: der Ok-Klick-Mitschnitt (__rcLastGetData) lebte nur im
   window — nach jedem Neuladen war er weg, der 3-Min-Takt stand.

   Geprueft werden die drei Bausteine der Loesung:
   1. kpi_crawler.js sichert den Mitschnitt im localStorage und laedt ihn beim
      Start vor (FUNKTIONAL, mit ausgeschnittenem Original-Code).
   2. Ein toter Token verwirft den Mitschnitt — sonst dreht der Neustart vier
      KPI_QUELLE_TOT-Runden mit demselben toten Body.
   3. ESL_Start.cmd holt den EINEN fehlenden Ok-Klick als vertrauenswuerdige
      CDP-Geste nach — der Crawler selbst klickt weiterhin NIE
      (klick_replay_pruefen.js bewacht das zusaetzlich).
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const CRAWLER = fs.readFileSync(path.join(__dirname, '..', 'kpi_crawler.js'), 'utf8');
const CMD     = fs.readFileSync(path.join(__dirname, '..', 'ESL_Start.cmd'), 'utf8');
const PS1     = fs.readFileSync(path.join(__dirname, '..', 'ESL_Start.ps1'), 'utf8');

let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}
function schneide(quelle, startMarke) {
  const i = quelle.indexOf(startMarke);
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

console.log('KLICK-PERSISTENZ PRUEFEN');
console.log('');

/* ---------------------------------------------------------------------------
   1) Crawler: Struktur der Persistenz
--------------------------------------------------------------------------- */
console.log('1) Crawler: Bausteine vorhanden und verdrahtet');

pruefe('Speicher-Schluessel rcKlickMitschnitt_v1 definiert',
  /const LS_KLICK = 'rcKlickMitschnitt_v1'/.test(CRAWLER));
pruefe('Alterung ~3 h (Token stirbt mit der CCS-Sitzung)',
  /KLICK_MAX_ALTER_MS = 3 \* 60 \* 60 \* 1000/.test(CRAWLER));
pruefe('Hook ist auf Version 3 (alte Live-Seiten hooken einmal neu)',
  /__rcReqHooked >= 3/.test(CRAWLER) && /__rcReqHooked = 3/.test(CRAWLER),
  'Bleibt die Version bei 2, laeuft auf einer schon offenen Seite der ALTE Hook ohne Sicherung weiter.');
pruefe('Sicherung haengt am window (__rcKlickSichern) — Re-Inject ERSETZT statt stapelt',
  /window\.__rcKlickSichern = klickSichern/.test(CRAWLER));

// Beide Mitschnitt-Stellen (fetch UND XHR) muessen sichern — sonst haengt es
// davon ab, wie die Seite gerade sendet.
const fetchZweig = schneide(CRAWLER, 'if (origFetch) window.fetch = function');
const xhrZweig   = schneide(CRAWLER, 'XMLHttpRequest.prototype.send = function');
// 17.08.: Gesichert wird NICHT mehr aus dem Hook heraus, sondern erst in
// verwerteAntwort - wenn belegt ist, dass dieser Rumpf eine echte Tabelle
// liefert. Grund (Live-Befund): die Ligalisten-App schickt selbst an
// get_data.rb (callreftree, Vorlagen); der Hook sicherte diese Eigen-Requests
// mit, der Muell ueberlebte das Neuladen und legte den Crawler dauerhaft still.
// Die ABSICHT von 14.08. bleibt gemessen - der Mitschnitt muss Neuladen
// ueberleben -, nur die Stelle hat sich verschoben.
pruefe('fetch-Zweig merkt den Mitschnitt am window',
  !!fetchZweig && fetchZweig.indexOf('__rcLastGetData') !== -1);
pruefe('XHR-Zweig merkt den Mitschnitt am window',
  !!xhrZweig && xhrZweig.indexOf('__rcLastGetData') !== -1);
pruefe('  ... aber KEINER der beiden sichert blind in den Speicher',
  !!fetchZweig && fetchZweig.indexOf('__rcKlickSichern') === -1 &&
  !!xhrZweig   && xhrZweig.indexOf('__rcKlickSichern') === -1,
  'Sonst landet jeder Eigen-Request der Seite im localStorage.');
pruefe('gesichert wird in verwerteAntwort, nach bestaetigten Zeilen', (() => {
  const va = schneide(CRAWLER, 'function verwerteAntwort(reqBody, text, quelle)');
  if (!va) return false;
  const iZeilen = va.indexOf('kpis.length'), iSichern = va.indexOf('__rcKlickSichern');
  return iSichern > -1 && iZeilen > -1 && iSichern > iZeilen;
})());

pruefe('Startweiche laedt den gesicherten Mitschnitt vor',
  /const gesichert = klickLaden\(\);/.test(CRAWLER) &&
  /Mitschnitt aus dem Speicher geladen/.test(CRAWLER));
pruefe('toter Token verwirft den Mitschnitt (tot-Pfad ruft klickVerwerfen)',
  /if \(tot && quelle !== 'Ok-Klick'\) \{\s*try \{ klickVerwerfen\(\); \} catch\(e\)\{\}/.test(CRAWLER),
  'Sonst laedt der Neustart denselben toten Body wieder vor.');
pruefe('Konsolen-Schalter rcCrawlerKlickVergessen vorhanden',
  /window\.rcCrawlerKlickVergessen = function/.test(CRAWLER));

/* ---------------------------------------------------------------------------
   2) Crawler: FUNKTIONAL (ausgeschnittener Original-Code)
--------------------------------------------------------------------------- */
console.log('');
console.log('2) Crawler: sichern/laden/altern/verwerfen funktional');

// Block von der Konstanten bis VOR die window-Zuweisung ausschneiden.
const von = CRAWLER.indexOf('const LS_KLICK');
const bis = CRAWLER.indexOf('window.__rcKlickSichern');
const block = (von >= 0 && bis > von) ? CRAWLER.slice(von, bis) : null;
pruefe('Persistenz-Block laesst sich ausschneiden', !!block);

if (block) {
  function baueUmgebung(fensterName) {
    const ablage = {};
    const ls = {
      getItem: k => (k in ablage) ? ablage[k] : null,
      setItem: (k, v) => { ablage[k] = String(v); },
      removeItem: k => { delete ablage[k]; }
    };
    const u = { ablage, ls, jetzt: 5000000, fenster: {} };
    const DateStub = { now: () => u.jetzt };
    // projektAusName haengt am Fensternamen, projektAusPaket am Body — hier
    // als schlanke Stubs mit demselben Vertrag.
    const pName = () => fensterName;
    const pPaket = body => {
      if (/PROJEKT_MOBILE/.test(body || '')) return 'mobile';
      if (/PROJEKT_UM/.test(body || '')) return 'um';
      if (/PROJEKT_KABEL/.test(body || '')) return 'kabel';
      return null;
    };
    const f = new Function('localStorage', 'Date', 'projektAusName', 'projektAusPaket', 'window',
      block + '\nreturn { sichern: klickSichern, laden: klickLaden, verwerfen: klickVerwerfen, schluessel: klickSchluessel };');
    u.api = f(ls, DateStub, pName, pPaket, u.fenster);
    return u;
  }

  // Roundtrip: sichern -> laden liefert denselben Body
  const a = baueUmgebung('kabel');
  a.api.sichern({ url: 'get_data.rb', body: 'x=1&PROJEKT_KABEL=1' });
  const geladenA = a.api.laden();
  pruefe('sichern -> laden liefert den Body zurueck',
    !!geladenA && geladenA.body === 'x=1&PROJEKT_KABEL=1');
  pruefe('Kabel speichert OHNE Zusatz (rcKey-Konvention)',
    a.api.schluessel() === 'rcKlickMitschnitt_v1');

  // Projektgetrennte Schluessel
  const m = baueUmgebung('mobile');
  pruefe('Mobile speichert unter _mob', m.api.schluessel() === 'rcKlickMitschnitt_v1_mob');
  const um = baueUmgebung('um');
  pruefe('UM speichert unter _um', um.api.schluessel() === 'rcKlickMitschnitt_v1_um');

  // Alterung: nach 3 h + 1 Min ist der Mitschnitt weg (auch aus dem Speicher)
  const b = baueUmgebung('kabel');
  b.api.sichern({ url: 'get_data.rb', body: 'x=1' });
  b.jetzt += 3 * 60 * 60 * 1000 + 60000;
  pruefe('aelter als 3 h -> laden liefert null', b.api.laden() === null);
  pruefe('der abgelaufene Eintrag wird auch GELOESCHT',
    !('rcKlickMitschnitt_v1' in b.ablage),
    'Sonst wird derselbe tote Eintrag bei jedem Start erneut geprueft.');

  // Fremd-Projekt: Kabel-Fenster darf keinen Mobile-Body erben
  const c = baueUmgebung('kabel');
  c.ablage['rcKlickMitschnitt_v1'] = JSON.stringify({ url: 'u', body: 'x=1&PROJEKT_MOBILE=1', zeit: c.jetzt });
  pruefe('Fremd-Projekt-Mitschnitt wird NICHT geladen', c.api.laden() === null,
    'Ein Hand-Tab ohne Fensternamen darf keinen fremden Baum replizieren (Fallstrick 06.08.).');

  // verwerfen: Speicher + window leer
  const d = baueUmgebung('kabel');
  d.api.sichern({ url: 'u', body: 'x=1' });
  d.fenster.__rcLastGetData = { url: 'u', body: 'x=1' };
  d.api.verwerfen();
  pruefe('verwerfen leert Speicher UND window',
    !('rcKlickMitschnitt_v1' in d.ablage) && d.fenster.__rcLastGetData === null);

  // Kaputter Speicherinhalt darf nicht werfen
  const e = baueUmgebung('kabel');
  e.ablage['rcKlickMitschnitt_v1'] = '{kaputt';
  let warf = false, erg;
  try { erg = e.api.laden(); } catch (ex) { warf = true; }
  pruefe('kaputter Speicherinhalt wirft nicht und liefert null', !warf && erg === null);
}

/* ---------------------------------------------------------------------------
   3) Der Crawler klickt weiterhin NIE selbst
--------------------------------------------------------------------------- */
console.log('');
console.log('3) Crawler bleibt passiv (Nutzer-Vorgabe 06.08.)');

const ladenFn = schneide(CRAWLER, 'function klickLaden()');
pruefe('klickLaden ruft kein click()/findOkButton/triggerPageRefresh',
  !!ladenFn && !/\.click\(\)|findOkButton|triggerPageRefresh/.test(ladenFn));
const startBlock = CRAWLER.slice(CRAWLER.indexOf('---------- Start (v6)'), CRAWLER.indexOf('kpiCrawlerInterval = setInterval'));
pruefe('Startweiche klickt nichts (nur laden + pollKpis)',
  startBlock.length > 0 && !/\.click\(\)|findOkButton|triggerPageRefresh/.test(startBlock));

/* ---------------------------------------------------------------------------
   4) Starter: der EINE nachgeholte Ok-Klick
--------------------------------------------------------------------------- */
console.log('');
console.log('4) Starter: StelleLigaKlickSicher');

pruefe('Funktion ist definiert', /function StelleLigaKlickSicher\(\$ziel\)/.test(CMD));

const sls = schneide(CMD, 'function StelleLigaKlickSicher($ziel)');
pruefe('Funktion laesst sich ausschneiden', !!sls);
if (sls) {
  pruefe("geklickt wird NUR bei Mitschnitt-fehlt UND Crawler-laeuft ('01')",
    /-ne '01'/.test(sls),
    'Ohne die Weiche klickte der Starter auch in eine Seite, die der Nutzer gerade bedient.');
  pruefe('Deckel 1x/5 Min je Tab',
    /TotalMinutes -lt 5/.test(sls) && /\$ligaKlickZuletzt/.test(sls));
  pruefe('Klick als vertrauenswuerdige Geste ueber KlickAuf (CDP)',
    /KlickAuf \$w/.test(sls),
    'Ein click() aus JavaScript waere untrusted — und der Punkt ist gerade die echte Geste.');
  pruefe('Knopfsuche wie im Crawler (ok-button + Textliste)',
    sls.indexOf('ok-button') !== -1 && /aktualisieren\|anzeigen/.test(sls));
  pruefe('Knopf muss SICHTBAR sein (Rechteck > 2px)',
    /r\.width>2&&r\.height>2/.test(sls));
  pruefe('WebSocket wird in jedem Pfad geschlossen',
    (sls.match(/\$w\.Dispose\(\)/g) || []).length >= 3);
}

// Aufruf auf den BLOCK eingrenzen (Regel 18): nur im liga_listen-Zweig.
const ligaI = CMD.indexOf("$url -like '*liga_listen*'");
const ligaBlock = ligaI >= 0 ? CMD.slice(ligaI, ligaI + 400) : '';
pruefe('Aufruf steht im liga_listen-Zweig der Tab-Schleife',
  /StelleLigaKlickSicher \$t/.test(ligaBlock));
pruefe('Meldung NACH der Wirkung, und nur als "Klick abgesetzt" formuliert',
  /Ok-Klick abgesetzt/.test(CMD),
  'Regel 15: nur behaupten, was belegt ist — der Klick, nicht der Erfolg.');

pruefe('ESL_Start.ps1 traegt die Funktion (node ps1_erzeugen.js gelaufen)',
  /function StelleLigaKlickSicher\(\$ziel\)/.test(PS1));

/* ------------------------------------------------------------------------ */
console.log('');
if (fehler === 0) console.log('ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN');
else { console.log(fehler + ' von ' + geprueft + ' PRUEFUNGEN FEHLGESCHLAGEN'); process.exitCode = 1; }
