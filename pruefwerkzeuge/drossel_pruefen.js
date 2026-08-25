/**
 * drossel_pruefen.js — laeuft das Dashboard weiter, wenn das Fenster minimiert ist?
 *
 * Nutzer-Vorgabe 09.08.:
 *   "es geht darum, dass ich einfach ganz normal weiterarbeite in anderen
 *    Browsern oder in Programmen, und das im Hintergrund einfach laeuft, also
 *    minimiert, dass der auch aktualisiert."
 *
 * Zwei getrennte Baustellen, beide hier festgenagelt:
 *
 *  A) DER BROWSER DARF NICHT DROSSELN. Ein minimiertes Fenster meldet
 *     visibilityState "hidden"; Chromium drosselt die Zeitgeber einer
 *     verborgenen Seite dann auf 1-Sekunden-Raster und spaeter auf EINEN
 *     Weckruf je Minute. Aus dem 20-s-ESL-Takt wuerde ein Minutentakt.
 *     Dagegen helfen nur die Startargumente in ESL_Start.cmd.
 *     FALLE: --disable-features darf nur EINMAL vorkommen — ein zweites
 *     Vorkommen ueberschreibt das erste vollstaendig.
 *
 *  B) DER STILLSTAND MUSS AUFFALLEN. Schlafende Tabs, angehaltene Citrix-
 *     Sitzungen und ein geloeschter rcLiveInterval sind von innen unsichtbar —
 *     genau die Fehlerklasse "stiller Stillstand". rcDriftPruefen misst die
 *     Zeit ZWISCHEN zwei Sekundenschlaegen und holt bei einer echten Luecke
 *     GENAU EINMAL nach.
 *
 * Zwei Verwechslungen, die der Waechter NICHT machen darf (beide aus der
 * Gegenpruefung, beide hier mit eigener Pruefung):
 *   1. Ein blockierter Hauptthread (grosser Excel-Lauf) ist keine Drosselung.
 *   2. Eine reine Drosselung ist kein Ausfall — der ESL-Export ist ein
 *      Vollstand, kein Delta. Es fehlt nichts, es kommt nur spaeter.
 *
 *   node pruefwerkzeuge/drossel_pruefen.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const W = path.join(__dirname, '..');
const lies = n => fs.readFileSync(path.join(W, n), 'utf8');
const dash = lies('esl_live_arena_v22.js');
const cmd  = lies('ESL_Start.cmd');
const ps1  = fs.existsSync(path.join(W, 'ESL_Start.ps1')) ? lies('ESL_Start.ps1') : '';

let ok = 0, bad = 0;
function pruef(t, b, z) {
    if (b) { ok++; console.log('  ok   ' + t); }
    else { bad++; console.log('  FEHL ' + t + (z !== undefined ? '  -> ' + z : '')); }
}
function abschnitt(t) { console.log('\n-- ' + t + ' --'); }

console.log('Hintergrund-Drosselung — Pruefung');

// ===========================================================================
abschnitt('A) Startargumente: der Browser darf nicht drosseln');
// ===========================================================================

// Nur die ARGUMENTLISTE betrachten, nicht die ganze Datei — sonst treffen die
// Regeln die eigenen Kommentare, die Regex der Ist-Pruefung und die
// Warntexte. Genau dieser Messfehler ist im Projekt schon viermal passiert.
function argListe(text) {
    const s = text.indexOf('$edgeArgs = @(');
    if (s < 0) return '';
    const e = text.indexOf(')', text.indexOf('$EslUrl', s));
    return text.slice(s, e > s ? e + 1 : s + 1500);
}
const args = argListe(cmd);
pruef('die Argumentliste $edgeArgs ist auffindbar', args.length > 0, args.length);

[['--disable-background-timer-throttling', 'nimmt Zeitgeber verborgener Seiten aus der Drosselung'],
 ['--disable-renderer-backgrounding',      'haelt den Renderer auf normaler Prioritaet'],
 ['--disable-backgrounding-occluded-windows', 'deckt das vollstaendig verdeckte Fenster ab']
].forEach(([f, zweck]) => {
    pruef('Startargument ' + f + ' (' + zweck + ')', args.indexOf(f) >= 0);
});

// Die Kern-Falle: EIN --disable-features mit ALLEN Namen.
const dfTreffer = args.match(/--disable-features=[^"]*/g) || [];
pruef('--disable-features steht GENAU EINMAL in der Argumentliste',
    dfTreffer.length === 1, dfTreffer.length + 'x: ' + JSON.stringify(dfTreffer));
const dfWert = dfTreffer.length === 1 ? dfTreffer[0].slice('--disable-features='.length) : '';
['Translate', 'IntensiveWakeUpThrottling', 'CalculateNativeWinOcclusion'].forEach(n => {
    pruef('… und enthaelt ' + n, dfWert.split(',').map(s => s.trim()).indexOf(n) >= 0, dfWert);
});
// GEGENPROBE: erkennt die Regel ein zweites Vorkommen? Sonst prueft sie nichts.
const kaputt = args.replace('"`"$EslUrl`""', '"--disable-features=Translate",\n        "`"$EslUrl`""');
pruef('GEGENPROBE: ein zweites --disable-features wuerde erkannt',
    (kaputt.match(/--disable-features=[^"]*/g) || []).length === 2);
// GEGENPROBE: ein erfundener Name faellt durch.
pruef('GEGENPROBE: ein erfundener Feature-Name faellt durch',
    dfWert.indexOf('GibtEsNicht') < 0);

// Die Ist-Pruefung muss existieren UND aufgerufen werden. "Gebaut, aber nirgends
// gerufen" ist die haeufigste Fehlerklasse dieses Projekts.
pruef('es gibt eine Ist-Pruefung der Flags am laufenden Prozess',
    /Get-CimInstance Win32_Process/.test(cmd) && /\$FlagsPflicht/.test(cmd));
pruef('… sie sucht den Edge-Prozess ueber den Debug-Port dieses Projekts',
    /CommandLine -like "\*--remote-debugging-port=\$DebugPort\*"/.test(cmd));
pruef('… sie prueft den INHALT von --disable-features, nicht nur das Vorkommen',
    /\$DfWert/.test(cmd) && /regex\]::Matches\(\$Kommandozeile/.test(cmd));
pruef('… und meldet ein doppeltes --disable-features als Fehler',
    /steht " \+ \$Treffer\.Count \+ "x in der Zeile/.test(cmd));
// Der dritte Zustand ist Pflicht: "nicht messbar als gruen behandeln" war im
// Projekt schon einmal ein zwei Tage teurer Messfehler.
pruef('"nicht pruefbar" ist ein EIGENER Zustand und geht nicht als gruen durch',
    /NICHT PRUEFBAR/.test(cmd) && /if \(-not \$Kommandozeile\)/.test(cmd));
pruef('… und der Erfolgsfall meldet nur bei WIRKLICH leerer Fehlliste gruen',
    /if \(\$Fehlt\.Count -eq 0\)/.test(cmd));
pruef('bei fehlenden Flags steht eine Anleitung da, nicht nur eine Klage',
    /NUR den Edge dieses Profils schliessen/.test(cmd));

// Die .ps1 wird aus der .cmd erzeugt — sie MUSS dieselben Flags tragen, sonst
// startet der Direktweg einen ungeschuetzten Browser.
if (ps1) {
    const argsPs = argListe(ps1);
    pruef('ESL_Start.ps1 traegt dieselben Startargumente',
        ['--disable-background-timer-throttling', '--disable-renderer-backgrounding',
         '--disable-backgrounding-occluded-windows', 'IntensiveWakeUpThrottling',
         'CalculateNativeWinOcclusion'].every(f => argsPs.indexOf(f) >= 0));
    pruef('… und dort ebenfalls nur EIN --disable-features',
        (argsPs.match(/--disable-features=[^"]*/g) || []).length === 1);
} else {
    pruef('ESL_Start.ps1 vorhanden (node ps1_erzeugen.js)', false, 'Datei fehlt');
}

// ===========================================================================
abschnitt('B) Takt-Waechter — Aufbau');
// ===========================================================================

function schneideAus(text, kopf) {
    const start = text.indexOf(kopf);
    if (start < 0) throw new Error('nicht gefunden: ' + kopf);
    let tiefe = 0, i = text.indexOf('{', start);
    for (; i < text.length; i++) {
        if (text[i] === '{') tiefe++;
        else if (text[i] === '}') { tiefe--; if (tiefe === 0) return text.slice(start, i + 1); }
    }
    throw new Error('nicht sauber abgeschlossen: ' + kopf);
}

pruef('rcDriftPruefen wird aus tickClock heraus aufgerufen (kein eigener Timer)',
    /try \{ rcDriftPruefen\(\); \} catch\(e\)\{\}/.test(schneideAus(dash, 'function tickClock(')));
// Ein zusaetzliches setInterval wuerde exakt genauso gedrosselt und koennte den
// Stillstand gar nicht messen, den es melden soll.
pruef('der Waechter legt KEINEN eigenen Zeitgeber an',
    !/rcDriftInterval/.test(dash));
pruef('… und keinen visibilitychange-Horcher (misst die Wirkung, nicht die Ursache)',
    !/addEventListener\('visibilitychange'/.test(dash));

// TDZ-Regel des Projekts: der Clean-State-Block ruft rcDriftZuruecksetzen rund
// 4000 Zeilen VOR der Definition auf.
['rcDriftJetzt', 'rcDriftLageNeu', 'rcDriftZuruecksetzen', 'rcDriftNachholenAnmelden',
 'rcDriftNachholen', 'rcDriftPruefen', 'rcDrift'].forEach(n => {
    pruef(n + ' ist eine Funktionsdeklaration (TDZ-Regel)',
        new RegExp('function\\s+' + n + '\\s*\\(').test(dash) &&
        !new RegExp('(const|let|var)\\s+' + n + '\\s*=').test(dash));
});
pruef('rcDriftZuruecksetzen wird im Clean-State-Block gerufen',
    dash.indexOf('rcDriftZuruecksetzen()') < dash.indexOf('function rcDriftZuruecksetzen('));
pruef('rcExportBusy steht in der Clean-State-Liste (haengende Flagge waere Blindheit)',
    /window\.rcExportBusy = false;/.test(dash));
pruef('rcExportBusy wird auch WIRKLICH gesetzt (nicht nur geprueft)',
    /window\.rcExportBusy = true;/.test(dash) && /\} finally \{ window\.rcExportBusy = false; \}/.test(dash));
// GEGENPROBE: eine nur gepruefte, nie gesetzte Flagge waere wirkungslos —
// genau die Fehlerklasse "gebaut, aber nirgends benutzt".
pruef('GEGENPROBE: rcExportBusy kommt an mehr als einer Stelle vor',
    (dash.match(/rcExportBusy/g) || []).length >= 4, (dash.match(/rcExportBusy/g) || []).length);

pruef('der Quellen-Streifen meldet eine echte Luecke im Klartext',
    /Takt stand ' \+ \(D\.letzteLueckeSek/.test(dash) && /Fenster minimiert oder Tab eingeschlafen/.test(dash));
pruef('… und sagt dazu, ob nachgeholt wurde',
    /Zahlen nachgeholt, Stand wieder aktuell/.test(dash) && /nicht nachgeholt: /.test(dash));
pruef('lage traegt das Feld takt (gleiche Form fuer jeden Leser)',
    /var lage = \{ liga:null, esl:null, takt:null, texte:\[\] \}/.test(dash));

// ===========================================================================
abschnitt('C) Takt-Waechter — FUNKTIONAL gegen die echte Funktion');
// ===========================================================================

// Den ganzen Block von den Konstanten bis rcDrift ausschneiden und in einer
// Attrappen-Umgebung auswerten. Nachgebaut wird NICHTS — nur die Umgebung.
const blockStart = dash.indexOf('var RC_DRIFT_LUECKE_MS');
const blockEnde  = dash.indexOf('window.rcDrift = rcDrift;') + 'window.rcDrift = rcDrift;'.length;
pruef('der Waechter-Block laesst sich ausschneiden', blockStart > 0 && blockEnde > blockStart);
const block = dash.slice(blockStart, blockEnde);

function bau(opt) {
    opt = opt || {};
    const w = { rcSessionState: { alive: true }, rcLiveInterval: 1 };
    const doc = { hidden: false, visibilityState: 'visible' };
    const log = [];
    const jetztRef = { mono: 0 };
    let jetztAkt = 0;
    const umgebung = new Function(
        'window', 'document', 'rcLog', 'rcQuellenWatchTick', 'holeExcelVomServer',
        'rcJetztAktualisieren', 'setInterval', 'pad2', 'performanceNow',
        block +
        '\n; return { pruefen: rcDriftPruefen, reset: rcDriftZuruecksetzen, bilanz: rcDrift };'
    );
    const api = umgebung(
        w, doc,
        { log: t => log.push('log:' + t), warn: t => log.push('warn:' + t) },
        function(){},                       // rcQuellenWatchTick
        function(){},                       // holeExcelVomServer
        function(){ jetztAkt++; return Promise.resolve({ sekunden: 3, esl:{ok:true}, liga:{ok:true} }); },
        function(){ return 99; },           // setInterval
        n => String(n).padStart(2, '0'),
        null
    );
    // performance.now() der Attrappe: die Testuhr steuert sie.
    w.performance = { now: () => jetztRef.mono };
    api.w = w; api.doc = doc; api.log = log; api.uhr = jetztRef;
    api.nachholLaeufe = () => jetztAkt;
    api.reset();
    // rcDriftZuruecksetzen setzt rcDriftLetzterNachhol auf die aktuelle Zeit.
    // Fuer die Tests soll der Deckel nicht schon vom Start belegt sein.
    w.rcDriftLetzterNachhol = -1e9;
    return api;
}

// --- 1) Erster Schlag: nur Bezugspunkt, keine Luecke -------------------------
{
    const t = bau();
    t.uhr.mono = 1000; t.pruefen();
    pruef('erster Schlag setzt nur den Bezugspunkt', t.w.rcDriftLage.luecken === 0 && t.w.rcDriftMono === 1000);
}

// --- 2) Normaler Sekundentakt: nichts passiert ------------------------------
{
    const t = bau();
    t.uhr.mono = 1000; t.pruefen();
    for (let i = 2; i <= 30; i++) { t.uhr.mono = i * 1000; t.pruefen(); }
    pruef('30 saubere Schlaege ergeben keine Luecke und kein Nachholen',
        t.w.rcDriftLage.luecken === 0 && t.nachholLaeufe() === 0);
    pruef('… und der gemessene Taktabstand ist 1000 ms',
        t.w.rcDriftLage.taktMs === 1000, t.w.rcDriftLage.taktMs);
}

// --- 3) Grosse Luecke bei VERBORGENER Seite: genau EIN Nachholen -------------
{
    const t = bau();
    t.uhr.mono = 1000; t.pruefen();
    t.doc.hidden = true; t.doc.visibilityState = 'hidden';
    t.uhr.mono = 1000 + 600000;            // 10 Minuten Stillstand
    t.pruefen();
    pruef('10 Minuten Stillstand werden als Luecke gezaehlt',
        t.w.rcDriftLage.luecken === 1 && t.w.rcDriftLage.letzteLueckeSek === 600,
        JSON.stringify({ l: t.w.rcDriftLage.luecken, s: t.w.rcDriftLage.letzteLueckeSek }));
    pruef('… und loesen GENAU EIN Nachholen aus', t.nachholLaeufe() === 1, t.nachholLaeufe());
    pruef('… und werden im Klartext gemeldet',
        t.log.some(z => /warn:Takt stand 600 s still/.test(z)));
}

// --- 4) EINE Luecke = EIN Nachholen, obwohl sie MEHRERE Ausloeser hat --------
// Das ist der eigentliche Deckel. Ein Aufwachen loest gleichzeitig aus:
// die Luecke selbst (Punkt 4), das Ende der Drosselphase (Punkt 3) und bei
// angehaltenem Rechner zusaetzlich den Zeitsprung (Punkt 1). Ohne Deckel waeren
// das drei Abrufe hintereinander. Gezaehlt wird nicht der Ausloeser, sondern der
// WUNSCH — und den gibt es nur einmal.
{
    const t = bau();
    t.uhr.mono = 1000; t.pruefen();
    t.doc.hidden = true;
    // Wanduhr springt weiter als die Stoppuhr -> Zeitsprung UND Luecke UND
    // danach das Phasen-Ende: drei Ausloeser, ein Nachholen.
    t.uhr.mono += 600000; t.pruefen();
    t.doc.hidden = false;
    t.uhr.mono += 1000; t.pruefen();            // Takt wieder normal (Phasen-Ende)
    pruef('ein Aufwachen mit mehreren Ausloesern ergibt GENAU EIN Nachholen',
        t.nachholLaeufe() === 1, t.nachholLaeufe());
    pruef('… und die Luecke wird trotzdem GEZAEHLT (ehrliche Diagnose)',
        t.w.rcDriftLage.luecken === 1, t.w.rcDriftLage.luecken);
}

// Der Mindestabstand: zwei getrennte Ausloeser innerhalb einer Minute ergeben
// trotzdem nur EIN Nachholen.
{
    const t = bau();
    t.uhr.mono = 1000; t.pruefen();
    t.doc.hidden = true;
    t.uhr.mono += 600000; t.pruefen();          // Luecke -> Nachholen
    const nach1 = t.nachholLaeufe();
    t.w.rcDriftLaeuft = false;                  // Lauf gilt als beendet
    t.w.rcDriftLage.taktNeu = 0;
    t.w.rcLiveInterval = null;                  // zweiter Ausloeser: Notnetz
    t.uhr.mono += 1000; t.pruefen();            // nur 1 s spaeter -> im Deckel
    pruef('ein zweiter Ausloeser innerhalb der Deckel-Minute holt NICHT erneut nach',
        t.nachholLaeufe() === nach1, nach1 + ' -> ' + t.nachholLaeufe());
}

// GEGENPROBE: ohne Deckel wuerde derselbe zweite Ausloeser sofort nachholen.
// Belegt, dass die Regel oben wirklich den Deckel misst und nicht das Nichts.
{
    const t = bau();
    t.uhr.mono = 1000; t.pruefen();
    t.doc.hidden = true;
    t.uhr.mono += 600000; t.pruefen();
    t.w.rcDriftLaeuft = false;
    t.w.rcLiveInterval = null;
    t.w.rcDriftLetzterNachhol = -1e9;           // Deckel von Hand entfernen
    t.uhr.mono += 1000; t.pruefen();
    pruef('GEGENPROBE: ohne Deckel wuerde ein zweites Mal nachgeholt',
        t.nachholLaeufe() === 2, t.nachholLaeufe());
}

// --- 5) Blockierter Hauptthread bei SICHTBARER Seite ist keine Drosselung ----
// Ein Monatsbericht haelt den Thread sekundenlang fest. Der naechste Schlag
// maesse eine Luecke — es gab aber keinen Stillstand der Datenquellen.
{
    const t = bau();
    t.uhr.mono = 1000; t.pruefen();
    t.doc.hidden = false; t.doc.visibilityState = 'visible';
    t.uhr.mono += 600000; t.pruefen();
    pruef('eine Luecke bei SICHTBARER Seite zaehlt NICHT als Stillstand',
        t.w.rcDriftLage.luecken === 0, t.w.rcDriftLage.luecken);
    pruef('… und loest KEIN Nachholen aus', t.nachholLaeufe() === 0, t.nachholLaeufe());
    pruef('… wird aber als blockierter Hauptthread benannt',
        /Hauptthread war 600 s blockiert/.test(t.w.rcDriftLage.letzteBilanz), t.w.rcDriftLage.letzteBilanz);
}

// --- 6) Waehrend eines bekannten Exports wird gar nicht gemessen -------------
{
    const t = bau();
    t.uhr.mono = 1000; t.pruefen();
    t.doc.hidden = true;
    t.w.rcExportBusy = true;
    t.uhr.mono += 600000; t.pruefen();
    pruef('waehrend rcExportBusy wird nicht gemessen',
        t.w.rcDriftLage.luecken === 0 && t.nachholLaeufe() === 0);
    pruef('… aber der Bezugspunkt wird neu gesetzt (sonst kaeme die Luecke danach)',
        t.w.rcDriftMono === t.uhr.mono, t.w.rcDriftMono + ' / ' + t.uhr.mono);
    t.w.rcExportBusy = false;
    t.uhr.mono += 1000; t.pruefen();
    pruef('… und danach laeuft die Messung normal weiter',
        t.w.rcDriftLage.luecken === 0 && t.w.rcDriftLage.taktMs === 1000, t.w.rcDriftLage.taktMs);
}
// Dieselbe Probe fuer die beiden aelteren Sperren.
['rcHarvestBusy', 'rcRangeBusy'].forEach(flag => {
    const t = bau();
    t.uhr.mono = 1000; t.pruefen();
    t.doc.hidden = true;
    t.w[flag] = true;
    t.uhr.mono += 600000; t.pruefen();
    pruef('waehrend ' + flag + ' wird ebenfalls nicht gemessen',
        t.w.rcDriftLage.luecken === 0 && t.nachholLaeufe() === 0);
});

// --- 7) Kurzer Fensterwechsel loest nichts aus ------------------------------
{
    const t = bau();
    t.uhr.mono = 1000; t.pruefen();
    t.doc.hidden = true;
    t.uhr.mono += 10000; t.pruefen();      // 10 s gedrosselt
    t.doc.hidden = false;
    t.uhr.mono += 1000;  t.pruefen();      // wieder normal
    pruef('ein kurzer Fensterwechsel (10 s) holt NICHT nach',
        t.nachholLaeufe() === 0, t.nachholLaeufe());
}

// --- 8) Laengere Drosselung: beim Zurueckkommen wird nachgeholt --------------
{
    const t = bau();
    t.uhr.mono = 1000; t.pruefen();
    t.doc.hidden = true;
    t.uhr.mono += 45000; t.pruefen();      // 45 s gedrosselt, unter der Luecken-Schwelle
    pruef('45 s Drosselung sind noch KEINE Luecke (nur langsamer, kein Ausfall)',
        t.w.rcDriftLage.luecken === 0, t.w.rcDriftLage.luecken);
    t.doc.hidden = false;
    t.uhr.mono += 1000; t.pruefen();       // Takt wieder normal -> Phasen-Ende
    pruef('… aber beim Zurueckkommen wird EINMAL nachgeholt',
        t.nachholLaeufe() === 1, t.nachholLaeufe());
}

// --- 9) Tote Sitzung wird NICHT nachgeholt ----------------------------------
{
    const t = bau();
    t.uhr.mono = 1000; t.pruefen();
    t.w.rcSessionState.alive = false;
    t.doc.hidden = true;
    t.uhr.mono += 600000; t.pruefen();
    pruef('bei toter Sitzung wird nicht nachgeholt (rcSessionRetryInterval uebernimmt)',
        t.nachholLaeufe() === 0, t.nachholLaeufe());
    pruef('… und der Grund steht in der Bilanz',
        /Sitzung gilt als abgelaufen/.test(t.w.rcDriftLage.letzteBilanz), t.w.rcDriftLage.letzteBilanz);
}

// --- 10) Notnetz: fehlender Live-Takt wird neu angelegt ---------------------
{
    const t = bau();
    // Der ERSTE Schlag setzt nur den Bezugspunkt und kehrt zurueck — Punkt 5
    // laeuft dort noch gar nicht. Deshalb zwei Schlaege, bevor geprueft wird.
    t.uhr.mono = 1000; t.pruefen();
    t.uhr.mono += 1000; t.pruefen();              // rcLiveInterval ist da -> gesehen
    pruef('ein vorhandener Live-Takt wird als gesehen vermerkt', t.w.rcDriftLiveGesehen === true);
    t.w.rcLiveInterval = null;
    t.uhr.mono += 1000; t.pruefen();
    pruef('ein verschwundener Live-Takt wird neu angelegt',
        !!t.w.rcLiveInterval && t.w.rcDriftLage.taktNeu === 1, t.w.rcDriftLage.taktNeu);
    pruef('… und das Nachholen dazu laeuft genau einmal', t.nachholLaeufe() === 1, t.nachholLaeufe());
}
// GEGENPROBE: VOR dem ersten Erscheinen darf das Notnetz NIE greifen — sonst
// legt es waehrend des Bootens einen ZWEITEN 20-s-Takt an.
{
    const t = bau();
    t.w.rcLiveInterval = null;                    // hat es noch nie gegeben
    t.uhr.mono = 1000; t.pruefen();
    t.uhr.mono += 1000; t.pruefen();
    t.uhr.mono += 1000; t.pruefen();
    pruef('GEGENPROBE: vor dem ersten Erscheinen legt das Notnetz KEINEN Takt an',
        !t.w.rcLiveInterval && t.w.rcDriftLage.taktNeu === 0, t.w.rcDriftLage.taktNeu);
}

// --- 11) Re-Inject: der Bezugspunkt darf nicht ueberleben -------------------
// Bliebe rcDriftMono der ALTEN Ausfuehrung stehen, maesse der erste Schlag die
// Zeit seit deren letztem Schlag — eine frei erfundene Luecke samt Nachholen.
{
    const t = bau();
    t.uhr.mono = 1000; t.pruefen();
    t.uhr.mono += 600000;
    t.reset();                                    // entspricht dem Clean-State-Block
    t.pruefen();
    pruef('nach dem Zuruecksetzen erfindet der erste Schlag KEINE Luecke',
        t.w.rcDriftLage.luecken === 0 && t.nachholLaeufe() === 0);
    pruef('… und alle Flaggen sind sauber',
        t.w.rcDriftLaeuft === false && t.w.rcDriftOffen === null &&
        t.w.rcDriftLiveGesehen === false && t.w.rcDriftLangSeit === 0);
}

// --- 12) rcDrift() liefert eine Bilanz, ohne zu werfen ----------------------
{
    const t = bau();
    t.uhr.mono = 1000; t.pruefen();
    let geworfen = null;
    try { t.bilanz(); } catch(e){ geworfen = e.message; }
    pruef('rcDrift() laeuft ohne Wurf', geworfen === null, geworfen);
    pruef('… und nennt den Taktabstand als Messwert',
        t.log.some(z => /Taktabstand jetzt/.test(z)));
}

// ===========================================================================
console.log('\n  ' + ok + ' bestanden, ' + bad + ' fehlgeschlagen.');
process.exit(bad === 0 ? 0 : 1);
