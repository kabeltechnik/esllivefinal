// ===========================================================================
//  tabfilter_pruefen.js  —  Pruefwerkzeug (offline, ohne Portal)
// ===========================================================================
//  Live-Befund 12.08. aus dem Starter-Fenster des Nutzers:
//
//    Tab gesehen: devtools://devtools/bundled/devtools_app.html?remoteBase=...
//    Tab gesehen: chrome-extension://cgjgjfacjflmgphhhepmbhhbgjieaecn/DevToolsPlugin.html
//    Autopilot nachgelegt in: chrome-extension://.../DevToolsPlugin.html
//
//  Der Autopilot wurde also in eine ERWEITERUNGS-Seite eingespielt. Dort richtet
//  er nichts aus (er arbeitet nur auf esl.regiocom.net / ccs.vodafone.de),
//  verbraucht aber Durchlaeufe und macht das Fenster unlesbar - genau dann,
//  wenn man dort nach dem echten Portal-Tab sucht.
//
//  URSACHE, am Code nachgewiesen: es standen zwei SPERRLISTEN im Weg, und die
//  zweite prueft 'chrome:*' MIT Doppelpunkt. 'chrome-extension://' passt darauf
//  nicht. Eine Sperrliste muss jede Variante kennen, die es gibt - das ist die
//  falsche Bauart fuer diese Frage.
//
//  Geprueft wird die neue POSITIVLISTE (nur http/https) FUNKTIONAL: die echten
//  Filterausdruecke werden aus ESL_Start.cmd geschnitten, nach JavaScript
//  uebersetzt und gegen die echten Adressen aus dem Log laufen gelassen.
//  Jede Regel hat eine Gegenprobe.
//
//  Aufruf:  node pruefwerkzeuge/tabfilter_pruefen.js
// ===========================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const cmd = fs.readFileSync(path.join(WURZEL, 'ESL_Start.cmd'), 'utf8');

let ok = 0, fehler = 0;
function pruef(t, b, z) {
    if (b) { ok++; console.log('  ok   ' + t); }
    else { fehler++; console.log('  FEHL ' + t + (z !== undefined ? '  -> ' + z : '')); }
}
function abschnitt(t){ console.log('\n--- ' + t + ' ---'); }

// PowerShell -like mit '*' als einzigem Platzhalter, case-insensitive.
function psLike(wert, muster) {
    const re = new RegExp('^' + muster.split('*').map(s =>
        s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
    return re.test(wert || '');
}

// Die echten Adressen aus dem Starter-Fenster des Nutzers (12.08.).
const AUS_DEM_LOG = [
    'devtools://devtools/bundled/devtools_app.html?remoteBase=https://msedgedevtools.microsoft.com/serve_file/@400e/&targetType=tab',
    'chrome-extension://cgjgjfacjflmgphhhepmbhhbgjieaecn/DevToolsPlugin.html',
    'chrome-extension://bplkihdnjcccjobckoegomfljihhjean/CitrixBcrServiceWorker.js',
    'chrome-extension://ogjmklkhajdbaannfffilmkpneihckoh/background.js'
];
const ECHTE_PORTALE = [
    'https://ccs.vodafone.de/cgi-bin/GENESYS/MONITOR_2/gm2.rb?script_id=10777',
    'https://esl.regiocom.net/Agents/secure/sis_vodafone.xhtml',
    'https://esl.regiocom.net/Agents/secure%20/sis_vodafone_um.xhtml',
    'http://esl.regiocom.net/login_esl.xhtml'
];
const SONSTIGE_INTERNE = [
    'edge://downloads-hub/', 'about:blank', 'view-source:https://x.de',
    'blob:https://esl.regiocom.net/abc', 'file:///C:/tmp/x.html', ''
];

// ===========================================================================
abschnitt('1. Die alte Sperrliste war nachweislich luecken­haft');
// ===========================================================================
// Gegenprobe zur Bauart-Entscheidung: haette die alte Fassung den echten
// Live-Befund verhindert? Nein - und genau das belegt diese Pruefung.
{
    const altDurchgelassen = AUS_DEM_LOG.filter(u =>
        !(psLike(u, 'edge:*') || psLike(u, 'chrome:*') || psLike(u, 'devtools:*') ||
          psLike(u, 'about:*') || psLike(u, 'view-source:*')));
    pruef('Alte Sperrliste liess chrome-extension:// durch (der Live-Fehler)',
          altDurchgelassen.some(u => u.indexOf('chrome-extension://') === 0),
          JSON.stringify(altDurchgelassen.map(u => u.slice(0, 40))));
    pruef('Alte Sperrliste fing devtools:// dagegen ab',
          !altDurchgelassen.some(u => u.indexOf('devtools://') === 0));
}

// ===========================================================================
abschnitt('2. Positivliste steht wirklich im Starter (beide Stellen)');
// ===========================================================================
pruef('Filter beim Holen der Tab-Liste ist eine Positivliste',
      /\$_\.url -like 'http:\/\/\*' -or \$_\.url -like 'https:\/\/\*'/.test(cmd));
pruef('Filter in der Schleife ist eine Positivliste',
      /\$url -notlike 'http:\/\/\*' -and \$url -notlike 'https:\/\/\*'/.test(cmd));
// Beide Stellen sind noetig: die Adresse kann sich zwischen Holen und
// Verarbeiten aendern (Befund 04.08., leere Adresse beim Holen).
pruef('Es gibt weiterhin ZWEI Filterstellen, nicht nur eine',
      (cmd.match(/-like 'https:\/\/\*'/g) || []).length >= 2,
      (cmd.match(/-like 'https:\/\/\*'/g) || []).length);
// Gegenprobe: die alten Sperrlisten-Zeilen duerfen nicht mehr dastehen.
pruef('Die alte Sperrliste ist raus (kein $_.url -notlike \'chrome*\')',
      !/\$_\.url -notlike 'chrome\*'/.test(cmd));
pruef('Die alte Doppelpunkt-Pruefung ist raus ($url -like \'chrome:*\')',
      !/\$url -like 'chrome:\*'/.test(cmd));

// ===========================================================================
abschnitt('3. Die neue Positivliste FUNKTIONAL an den echten Adressen');
// ===========================================================================
function neuErlaubt(u) { return psLike(u, 'http://*') || psLike(u, 'https://*'); }
{
    AUS_DEM_LOG.forEach(u => {
        pruef('abgewiesen: ' + u.slice(0, 52), !neuErlaubt(u));
    });
    ECHTE_PORTALE.forEach(u => {
        pruef('durchgelassen: ' + u.slice(0, 52), neuErlaubt(u));
    });
    SONSTIGE_INTERNE.forEach(u => {
        pruef('abgewiesen: ' + (u === '' ? '(leere Adresse)' : u.slice(0, 52)), !neuErlaubt(u));
    });
}
{
    // Die leere Adresse ist der Sonderfall, wegen dem es die zweite Filterstelle
    // ueberhaupt gibt: Edge meldet einen frischen Tab zuerst ohne Adresse.
    pruef('Leere Adresse wird abgewiesen (kein Nachlegen ins Nichts)', !neuErlaubt(''));
    pruef('Und auch null/undefined kippt nicht um', !neuErlaubt(null) && !neuErlaubt(undefined));
}
{
    // Gegenprobe zur Positivliste selbst: sie darf nicht ALLES abweisen,
    // sonst waere sie "gruen" ohne etwas zu leisten.
    pruef('Gegenprobe: die Regel laesst echte Portale ueberhaupt durch',
          ECHTE_PORTALE.every(neuErlaubt));
    // Und eine Adresse, die nur http ENTHAELT, darf nicht reichen.
    pruef('Gegenprobe: "chrome-extension://x/http://y" wird abgewiesen',
          !neuErlaubt('chrome-extension://x/http://y'));
}

// ===========================================================================
abschnitt('4. Waechter steigt nicht bei einer einzelnen leeren Runde aus');
// ===========================================================================
// Mit der Positivliste faellt ein Tab ohne Adresse heraus. Waehrend einer
// Navigation kann das kurz fuer ALLE Tabs gelten - ein sofortiger Ausstieg
// wuerde den Waechter dann mitten im Betrieb beenden, und danach meldet
// niemand mehr die abgelaufene ESL-Sitzung neu an.
pruef('$leereRunden ist initialisiert (sonst zaehlt ++ von $null)',
      /\$leereRunden = 0/.test(cmd));
pruef('Erst nach mehreren leeren Runden wird abgebrochen',
      /if \(\$leereRunden -ge 3\)/.test(cmd));
pruef('Eine leere Runde fuehrt zu continue, nicht zu break',
      /\$leereRunden\+\+[\s\S]{0,240}continue/.test(cmd));
pruef('Zaehler wird bei einem gefundenen Tab zurueckgesetzt',
      /\$leereRunden = 0\s*\r?\n/.test(cmd.slice(cmd.indexOf('$leereRunden++'))));
{
    // Der continue MUSS hinter einer WARTESTELLE landen, sonst dreht die
    // Schleife ohne Pause und frisst eine CPU.
    // Seit 21.08. ist die Wartestelle kein blindes Start-Sleep mehr, sondern
    // WarteUndVersorgeNeueTabs: sie wartet dieselbe Zeit ab und verankert
    // dabei neu aufgetauchte Tabs sofort (sonst wartet ein frisch geoeffneter
    // Ligalisten-Tab bis zum naechsten Durchlauf auf den Autopiloten).
    // Geprueft wird deshalb die WIRKUNG - es wird gewartet -, nicht der Name
    // des Cmdlets. Beide Bauarten sind zugelassen.
    const wl = cmd.indexOf('while ($true) {', cmd.indexOf('$leereRunden = 0'));
    const sleep = cmd.indexOf('Start-Sleep -Seconds $DauerTaktSek', wl);
    const wache = cmd.indexOf('WarteUndVersorgeNeueTabs $DauerTaktSek', wl);
    const warte = (sleep > wl) ? sleep : wache;
    const cont = cmd.indexOf('continue', warte);
    pruef('Eine Wartestelle steht am Schleifenanfang, vor dem continue-Ziel',
          wl > 0 && warte > wl && cont > warte, 'while=' + wl + ' warte=' + warte + ' continue=' + cont);
    // Und sie muss wirklich warten: eine Funktion, die sofort zurueckkehrt,
    // waere dieselbe heisse Schleife unter neuem Namen.
    const block = cmd.slice(cmd.indexOf('function WarteUndVersorgeNeueTabs'));
    pruef('die Wartestelle wartet auch wirklich',
          sleep > wl || /Start-Sleep -Seconds \d+/.test(block.slice(0, 1600)),
          'WarteUndVersorgeNeueTabs ohne eigenes Start-Sleep waere eine heisse Schleife.');
}

// ===========================================================================
console.log('\n===========================================================');
console.log('  ' + ok + ' bestanden, ' + fehler + ' fehlgeschlagen.');
console.log('===========================================================');
process.exit(fehler ? 1 : 0);
