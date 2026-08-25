// ============================================================================
//  aktualisieren_pruefen.js — Sofort-Aktualisierung, Bestands-Erneuerung,
//  Referenzbaum (05.08.2026)
// ============================================================================
//  Prueft ohne Portal und ohne Installation:
//    1. "Jetzt aktualisieren" (RC_LIVE_NOW) — Dashboard und Crawler
//    2. rcKpiData wird bei einem vollstaendigen Paket ERSETZT statt gemerged
//    3. Referenzbaum (nodeid_inlist) — Setzen, Rueckfall, Reihenfolge
//
//  Die ERSTE Pruefung je Block ist immer "wird es ueberhaupt aufgerufen?".
//  Das ist die haeufigste Fehlerklasse in diesem Projekt: EinAnmeldeVersuch,
//  esl_mail_report.ps1 und rcExportStandZeitraum waren alle fertig gebaut und
//  von nirgendwo erreichbar.
//
//  Aufruf:  node pruefwerkzeuge/aktualisieren_pruefen.js
// ============================================================================
const fs = require('fs');
const path = require('path');

const ORD = path.join(__dirname, '..');
const dash = fs.readFileSync(path.join(ORD, 'esl_live_arena_v22.js'), 'utf8');
const craw = fs.readFileSync(path.join(ORD, 'kpi_crawler.js'), 'utf8');

let ok = 0, fehl = 0;
function pruef(name, bedingung, hinweis){
    if (bedingung) { console.log('  ok   ' + name); ok++; }
    else { console.log('  FEHL ' + name + (hinweis ? '  — ' + hinweis : '')); fehl++; }
}
// Schneidet eine Funktion per Klammer-Zaehlung aus dem Quelltext. Damit wird die
// ECHTE Funktion geprueft und nicht eine Kopie, die nur sich selbst bewacht.
function funktion(src, anfang){
    const i = src.indexOf(anfang);
    if (i < 0) return '';
    let tiefe = 0, start = src.indexOf('{', i);
    if (start < 0) return '';
    for (let j = start; j < src.length; j++) {
        if (src[j] === '{') tiefe++;
        else if (src[j] === '}') { tiefe--; if (!tiefe) return src.slice(i, j + 1); }
    }
    return '';
}

console.log('\n-- 1. RC_LIVE_NOW: wird es ueberhaupt aufgerufen? --');
const handleCmd = funktion(craw, 'function handleCommand(');
pruef('Crawler: handleCommand kennt RC_LIVE_NOW',
    /d\.type === 'RC_LIVE_NOW'/.test(handleCmd));
pruef('Crawler: RC_LIVE_NOW ruft pollKpis, kein zweites fetch',
    /RC_LIVE_NOW[\s\S]{0,400}pollKpis\(false\)/.test(handleCmd),
    'pollKpis nimmt die Sperre und verdrahtet intraday fest');
pruef('Crawler: die Antwort RC_LIVE_NOW_DONE geht raus',
    /RC_LIVE_NOW_DONE/.test(handleCmd));
pruef('Crawler: Antwort ueber ALLE drei Kanaele (channel, opener, replySource)',
    /function antworte\([\s\S]{0,600}channel\.postMessage[\s\S]{0,300}window\.opener[\s\S]{0,300}replySource/.test(craw),
    'BroadcastChannel wirkt cross-origin nicht, opener kann fehlen');
pruef('Dashboard: sendet RC_LIVE_NOW',
    /type:\s*'RC_LIVE_NOW'/.test(dash));
pruef('Dashboard: verarbeitet RC_LIVE_NOW_DONE',
    /d\.type === 'RC_LIVE_NOW_DONE'/.test(dash));
pruef('Dashboard: der Knopf rcBtnJetzt existiert im Markup',
    /id="rcBtnJetzt"/.test(dash));
pruef('Dashboard: der Knopf ist verdrahtet (echter Aufrufer)',
    /getElementById\('rcBtnJetzt'\)[\s\S]{0,400}rcJetztAktualisieren/.test(dash),
    'Fehlerklasse Nr. 1: gebaut, aber nirgends aufgerufen');

console.log('\n-- 2. Sofort-Aktualisierung: Absicherung --');
const jetzt = funktion(dash, 'async function rcJetztAktualisieren(');
pruef('rcJetztAktualisieren existiert', !!jetzt);
pruef('prueft rcHarvestBusy (4-Stunden-Harvester und rcFetchRangeViaUI)',
    /rcHarvestBusy/.test(jetzt));
pruef('prueft rcRangeBusy (Zeitraum-Dialog)',
    /rcRangeBusy/.test(jetzt));
pruef('prueft die eigene Flagge rcJetztBusy',
    /window\.rcJetztBusy/.test(jetzt));
pruef('benutzt holeExcelVomServer, baut keinen zweiten ESL-Abruf',
    /holeExcelVomServer\(\)/.test(jetzt) && !/filterForm/.test(jetzt));
pruef('hat einen Pflicht-Timeout fuer die Liga-Antwort',
    /LIVE_NOW_TIMEOUT/.test(jetzt) && /LIVE_NOW_TIMEOUT\s*=\s*\d+/.test(dash));
pruef('gibt die Flagge im finally frei',
    /finally\s*{[\s\S]{0,200}rcJetztBusy\s*=\s*false/.test(jetzt),
    'sonst meldet der Knopf nach einem Fehler fuer immer "laeuft bereits"');
pruef('rcJetztBusy steht in der Clean-State-Liste',
    /window\.rcJetztBusy\s*=\s*false;/.test(dash.slice(0, dash.indexOf('rcLog.log("esl live-arena') + 4000)),
    'ohne das ueberlebt die Flagge einen Re-Inject');
pruef('rcLiveNowDone wird beim Clean-State geleert',
    /window\.rcLiveNowDone\s*=\s*null;/.test(dash));
pruef('rcJetztBtnInterval haengt in der Aufraeumliste',
    /'rcJetztBtnInterval'/.test(dash));
pruef('meldet dem Nutzer, wenn die Ligaliste nicht verbunden ist',
    /nicht verbunden/.test(jetzt));

console.log('\n-- 3. Bestand ersetzen statt endlos mergen --');
pruef('Crawler: sendKpis hat die Parameter vollstaendig und extra (v6)',
    /function sendKpis\(kpis, liveDr, vollstaendig, extra\)/.test(craw));
pruef('Crawler: vollstaendig steht im gesendeten Paket',
    /vollstaendig:\s*!!vollstaendig/.test(craw));
// v6: Der einzige Pfad, der vollstaendig melden KANN, ist verwerteAntwort —
// und dort nur bei intraday UND wenn der Request wirklich alle Standorte trug.
pruef('Crawler: vollstaendig nur bei intraday UND allen Standorten (verwerteAntwort)',
    /const voll = \(dr === 'intraday'\) && lokVollstaendig\(reqBody\);/.test(craw));
pruef('Crawler: verwerteAntwort reicht voll + Projekt/Baum aus dem BODY durch',
    /sendKpis\(kpis, dr, voll, \{ projekt, baumNodes: baumAusBody\(reqBody\) \}\)/.test(craw));
(function(){
    // lokVollstaendig FUNKTIONAL pruefen (kein Textmuster): Teil-Listen duerfen
    // nie als vollstaendig gelten — sonst ersetzt ein Teil-Paket den Bestand.
    const konstLoc = (craw.match(/const\s+RC_LOC_ALLE\s*=\s*[^;]+;/) || [''])[0];
    const fn = new Function('URLSearchParams', konstLoc + funktion(craw, 'function lokVollstaendig(') + '; return lokVollstaendig;')(URLSearchParams);
    const alle = 'loc_inlist=' + encodeURIComponent('Alanya,Alexandroupolis,Berlin,Essen,Neubrandenburg,Potsdam,regiocom_W_Home,Sakarya,Serres');
    pruef('lokVollstaendig: alle neun Standorte -> true', fn(alle) === true);
    pruef('lokVollstaendig: nur Alanya -> false (Teil-Paket ersetzt NICHT)', fn('loc_inlist=Alanya') === false);
    pruef('lokVollstaendig: leerer Body -> false', fn('') === false);
})();
(function(){
    // Die Harvest-Pfade duerfen NIE vollstaendig melden — sie holen Ausschnitte.
    const treffer = (craw.match(/sendKpis\([^;]*?\);/g) || []).filter(t => !/^sendKpis\(kpis, liveDr, vollstaendig, extra\)/.test(t));
    const mitDrittem = treffer.filter(t => /sendKpis\(kpis, dr, voll/.test(t));
    pruef('nur genau EIN sendKpis-AUFRUF reicht vollstaendig durch (verwerteAntwort)',
        mitDrittem.length === 1, 'gefunden: ' + mitDrittem.join(' | '));
    pruef('die Harvest-Pfade melden gar nichts (also nicht vollstaendig)',
        treffer.length - mitDrittem.length === 2,
        'uebrige Aufrufe: ' + treffer.filter(t => !/sendKpis\(kpis, dr, voll/.test(t)).join(' | '));
})();
pruef('Dashboard: rcKpiBestandSetzen existiert',
    /function rcKpiBestandSetzen\(/.test(dash));
pruef('Dashboard: es wird nur bei vollstaendig UND nicht-leer ersetzt',
    /d\.vollstaendig && d\.payload\.length\) rcKpiBestandSetzen/.test(dash),
    'ein leeres Paket wuerde sonst den ganzen Bestand loeschen');
pruef('Dashboard: sonst weiterhin mergen (ingestKpi)',
    /else d\.payload\.forEach\(ingestKpi\)/.test(dash));
(function(){
    const f = funktion(dash, 'function rcKpiBestandSetzen(');
    pruef('rcKpiBestandSetzen leert BEIDE Verzeichnisse (ccsId und Name)',
        /rcKpiData = \{\}/.test(f) && /rcKpiByName = \{\}/.test(f),
        'sonst bleibt der Name-Fallback auf altem Stand');
    pruef('rcKpiBestandSetzen meldet, wie viele Agenten weggefallen sind',
        /alt - neu/.test(f));
})();

console.log('\n-- 4. Datenstand sichtbar --');
pruef('rcLigaStandText existiert und ist global',
    /function rcLigaStandText\(/.test(dash) && /window\.rcLigaStandText = rcLigaStandText/.test(dash));
pruef('rcLigaNichtLive wird bei jedem Paket gesetzt ODER geleert',
    /window\.rcLigaNichtLive = liveOk \? null : drL/.test(dash),
    'sonst bleibt der Hinweis stehen, nachdem die Ligaliste wieder auf Intraday steht');
pruef('der Knopf zieht den Stand nach (echter Leser von rcLigaStandText)',
    /rcLigaStandText\(\)[\s\S]{0,300}\.title/.test(dash));
pruef('zu alte Daten werden amber markiert, nicht rot',
    /rc-btn-warn/.test(dash) && /\.rc-btn-warn\{[^}]*EB9700/.test(dash),
    'Rot ist im Design fuer Zielverfehlung reserviert');

console.log('\n-- 5. Referenzbaum (nodeid_inlist) --');
pruef('Crawler: nodeSetzen existiert',
    /function nodeSetzen\(params, ids\)/.test(craw));
(function(){
    const f = funktion(craw, 'function nodeSetzen(');
    pruef('nodeSetzen schreibt BEIDE Parameter (Liste und Spiegel-Liste)',
        /params\.set\('nodeid_inlist',\s*ids\)/.test(f) && /params\.set\('nodeid_inlist_c',\s*ids\)/.test(f),
        'dasselbe Spiegel-Muster wie bei loc_inlist');
    pruef('nodeSetzen raeumt vorher auf (auch die []-Schreibweise)',
        /delete\('nodeid_inlist\[\]'\)/.test(f) && /delete\('nodeid_inlist_c\[\]'\)/.test(f));
    pruef('nodeSetzen setzt EINEN Parameter mit Kommas, nicht n einzelne',
        !/forEach/.test(f), 'bei VUM_Care sind es zwoelf Knoten in einer Kette');
})();
pruef('alle vier Baeume sind hinterlegt',
    /VKD_Tech/.test(craw) && /VUM_Care/.test(craw) && /Mob_Tech/.test(craw) && /Mob_Care/.test(craw));
pruef('die Knoten-IDs stimmen mit dem Abfrage-Baukasten ueberein',
    /nodes:'11406'/.test(craw) && /nodes:'11248'/.test(craw) && /nodes:'11233'/.test(craw) &&
    /nodes:'12133,12255,12595,12699,12787,12809,13328,13344,13345,13348,13389,13391'/.test(craw));
// ---- Seit 06.08.: gemessene Parametersaetze statt Raten ----------------------
// Der Nutzer hat seine drei Portal-Vorlagen geladen und den echten
// get_data.rb-Rumpf mitgeschnitten. Damit sind Baum, Standorte und Kennzahlen
// BELEGT — die drei Rueckfall-Ketten (figure_list -> nodeid -> vier
// Standort-Schreibweisen) sind ersatzlos entfallen. Sie waren noetig, solange
// die richtige Schreibweise unbekannt war; jetzt wuerden sie nur noch
// verschleiern, WAS schiefging.
pruef('fetchDaterangeKpis baut den Request neu, statt ihn zu erben',
    /const params = baueAbfrage\(projekt, daterangeVal, iv0, opts\);/.test(craw));
pruef('die drei Rueckfall-Ketten sind entfernt',
    !/window\.__rcFiguresAus = true;/.test(craw) &&
    !/window\.__rcNodesAus = true;/.test(craw) &&
    !/for \(const v of LOC_VARIANTEN\) \{\s*\n\s*if \(v\.id === schonProbiert\)/.test(craw));
pruef('GEGENPROBE die Entfernungs-Pruefung schlaegt an, wenn eine Kette zurueckkaeme',
    !(!/window\.__rcFiguresAus = true;/.test(craw + 'window.__rcFiguresAus = true;')));
pruef('bei 0 Zeilen wird der Grund samt Baum genannt, statt still zurueckzufallen',
    /Stimmt der Baum noch\?/.test(craw) && /params\.get\('nodeid_inlist'\)/.test(craw));
// ---- Nachtrag 06.08. abends: unbenannter Tab darf NICHT stumm Kabel raten ----
// Der Waechter aus ESL_Start.cmd injiziert den Crawler in JEDEN ccs.vodafone.de-
// Tab, auch von Hand geoeffnete Test-Tabs ohne den Fensternamen "rcKpiQuelle_*".
// projektAusName() liefert dort null. Ein Live-Fund am 06.08.: ein Test-Tab mit
// geladener UM-Vorlage fragte den KABEL-Baum ab und sendete dessen Daten sogar
// erfolgreich unter dem falschen Projekt weiter — "raten statt erben" ist hier
// GEFAEHRLICHER als der alte Fehler, den der Umbau beheben sollte.
// v6: Die geladene VORLAGE (projektAusPaket aus cap.body) schlaegt den
// Fensternamen — und der Baum wird IMMER aus cap geerbt, wenn dort einer steht.
pruef('projektErkannt bevorzugt die geladene Vorlage vor dem Fensternamen',
    /const projektErkannt = \(opts && opts\.projekt\) \|\| projektAusPaket\(cap\.body\) \|\| projektAusName\(\);/.test(craw));
pruef('der Baum wird IMMER aus der zuletzt geladenen Anfrage geerbt',
    /const ererbterBaum = \(alt\.get\('nodeid_inlist'\) \|\| alt\.get\('nodeid_inlist_c'\) \|\| ''\)\.trim\(\);/.test(craw) &&
    !/if \(!projektErkannt\) \{[\s\S]{0,80}const alt = new URLSearchParams/.test(craw));
pruef('… und ohne Baum im Mitschnitt wird die Vorgabe laut genannt',
    /Kein Baum in der zuletzt geladenen Anfrage gefunden/.test(craw));
pruef('GEGENPROBE ohne die Vorlagen-Prioritaet waere die Pruefung rot',
    !/projektAusPaket\(cap\.body\) \|\| projektAusName\(\);/.test(
        craw.replace(/projektAusPaket\(cap\.body\) \|\| projektAusName\(\);/g, 'nixDa();')));
pruef('baumNodes beachtet die Sitzungs-Abschaltung',
    /if \(window\.__rcNodesAus\) return '';/.test(craw));
pruef('rcCrawlerBaumTest existiert (die einzige Messmoeglichkeit)',
    /window\.rcCrawlerBaumTest = async function/.test(craw));
(function(){
    const f = funktion(craw, 'window.rcCrawlerBaumTest = async function');
    pruef('rcCrawlerBaumTest misst auch den unveraenderten Portal-Zustand',
        /\(Portal, unveraendert\)/.test(f),
        'ohne Vergleichswert ist das Ergebnis nicht einzuordnen');
    pruef('rcCrawlerBaumTest veraendert die Seite nicht',
        !/\.click\(\)/.test(f) && !/setSelect/.test(f));
    pruef('rcCrawlerBaumTest laesst Zeit zwischen den Anfragen',
        /setTimeout\(r, \d+\)/.test(f), 'sonst laufen vier Requests gleichzeitig gegen Oracle');
})();
pruef('rcCrawlerBaum kann gesetzt UND zurueckgenommen werden',
    /window\.rcCrawlerBaum = function/.test(craw) && /removeItem\(LS_BAUM\)/.test(craw));

console.log('\n-- 6. pollKpis liefert jetzt ein Ergebnis --');
const poll = funktion(craw, 'function pollKpis(withRefresh)');
pruef('pollKpis meldet bei belegter Sperre "belegt" statt Erfolg',
    /grund:'belegt durch '/.test(poll),
    'sonst behauptet der Knopf Erfolg, waehrend nichts passiert ist');
// v6: pollKpis ist ein reines Replay des Nutzer-Klicks. Ohne gemerkten Klick
// passiert NICHTS (kein Ok-Klick, kein DOM-Lesen) — nur eine ehrliche Meldung.
pruef('pollKpis meldet ohne gemerkten Klick "noch kein Ok-Klick" statt zu klicken',
    /grund:'noch kein Ok-Klick gemerkt/.test(poll));
pruef('pollKpis klickt und liest NIE selbst (kein triggerPageRefresh, kein parseKpiTable)',
    !/triggerPageRefresh/.test(poll) && !/parseKpiTable/.test(poll));
pruef('das Replay stellt GENAU daterange/interval um und laeuft am Hook vorbei',
    /p\.set\('daterange', 'intraday'\)/.test(poll) && /p\.set\('interval',\s*'cumulate'\)/.test(poll) &&
    // Seit 05.10. laeuft der Abruf ueber abrufMitFrist (Frist + Roh-fetch an EINER Stelle).
    /abrufMitFrist\(cap\.url/.test(poll) &&
    /window\.__rcFetchRoh \|\| window\.fetch/.test(funktion(craw, 'function abrufMitFrist(')));
pruef('pollKpis gibt im Normalfall doReplay zurueck',
    /return doReplay\(\);/.test(poll));
// Seit 17.08. setzt der ehrlich-leer-Zweig zusaetzlich replayLeerFolge zurueck
// (Selbstheilung darf von "0 Zeilen am fruehen Morgen" nicht ausgeloest werden).
// Gemessen wird deshalb das VERHALTEN, nicht mehr der Wortlaut: ehrlichLeer
// wird vor nachfassen behandelt, und nachfassen steht im uebrigbleibenden Zweig.
pruef('eine ehrlich leere Antwort (0 Zeilen) loest KEIN Nachfassen aus', (() => {
    if (!/ehrlichLeer = \(res\.grund === '0-zeilen'\)/.test(poll)) return false;
    // VOLLER Text, nicht "nachfassen('Live-Takt" — das traefe zuerst die
    // fruehere Stelle "Live-Takt uebersprungen, die Seite ist belegt".
    const iLeer = poll.indexOf('else if (ehrlichLeer)');
    const iNach = poll.indexOf("nachfassen('Live-Takt hat keine Daten geliefert')");
    if (iLeer < 0 || iNach < iLeer) return false;
    // Den ehrlichLeer-ZWEIG isolieren (bis zum naechsten else) statt ein
    // Zeichenfenster zu raten: darin darf kein nachfassen stehen.
    const zweig = poll.slice(iLeer, poll.indexOf('else', iLeer + 20));
    return zweig.indexOf('nachfassen') === -1;
})());
pruef('die Sperre wird weiterhin im finally freigegeben',
    /finally\s*{[\s\S]{0,200}sperreGeben\('Live-Takt'\)/.test(poll));
(function(){
    // Im FINALLY-Block messen. Ein blosses indexOf('nachfassen(') traefe den
    // Aufruf ganz oben im Sperre-belegt-Zweig und vergliche die falschen Stellen.
    const i = poll.indexOf('} finally {');
    const block = i > 0 ? poll.slice(i) : '';
    pruef('das Nachfassen steht weiterhin NACH dem Freigeben',
        block.indexOf("sperreGeben('Live-Takt')") >= 0 &&
        block.indexOf("sperreGeben('Live-Takt')") < block.indexOf('nachfassen('),
        'davor liefe der neue Versuch gegen die eigene Sperre');
})();

console.log('\n' + ok + ' bestanden, ' + fehl + ' fehlgeschlagen.\n');
process.exit(fehl ? 1 : 0);
