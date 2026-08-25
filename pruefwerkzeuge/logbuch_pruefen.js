// ===========================================================================
//  logbuch_pruefen.js  —  Pruefwerkzeug (offline, ohne Portal)
// ===========================================================================
//  Zwei Neuerungen vom 12.08., beide aus demselben Nutzer-Anliegen:
//  "wenn was passiert, muss ich dir eine Datei geben koennen, wo du den
//   Fehler entdecken kannst" — und "Genesys moechte ich abschalten koennen".
//
//  1) LOGBUCH. rcLog schrieb bisher NUR in die Konsole; Tab zu = Spur weg.
//     Jetzt Ringpuffer + Sicherung im Browser-Speicher + rcLogbuch() als
//     Textdatei. Der heikle Teil ist NICHT das Schreiben, sondern das
//     Verhalten bei VOLLEM Speicher — genau die Lage auf dem Citrix-Rechner,
//     wegen der es das Logbuch ueberhaupt gibt. Ein Logbuch, das bei vollem
//     Speicher eine Ausnahme wirft, legt jede rcLog.warn-Stelle im ganzen
//     Dashboard lahm. Deshalb wird das hier FUNKTIONAL durchgespielt.
//
//  2) Die sechs Schreibstellen der Tages-Historie hatten leere catch-Bloecke.
//     Lief der Speicher voll, wuchs die Historie still nicht mehr weiter und
//     Wochen-/Monatswerte wurden lautlos falsch. Genau die Fehlerklasse
//     "stiller Stillstand". Jede der sechs muss jetzt melden.
//
//  3) Warteschleife/Genesys ganz abschaltbar (CFG.modulAus). Der Schluessel
//     darf NICHT "aus" heissen — den gibt es dort bereits fuer etwas anderes
//     (Qualitaets-Schluessel ausblenden). Eine solche Kollision waere still.
//
//  Aufruf:  node pruefwerkzeuge/logbuch_pruefen.js
// ===========================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(WURZEL, 'esl_live_arena_v22.js'), 'utf8');

let ok = 0, fehler = 0;
function pruef(t, b, z) {
    if (b) { ok++; console.log('  ok   ' + t); }
    else { fehler++; console.log('  FEHL ' + t + (z !== undefined ? '  -> ' + z : '')); }
}
function abschnitt(t){ console.log('\n--- ' + t + ' ---'); }

// Ab `von` die naechste oeffnende Klammer suchen und den Block klammerweise
// abzaehlen. Liefert den Index HINTER der schliessenden Klammer.
function blockEnde(text, von) {
    let tiefe = 0, i = text.indexOf('{', von);
    if (i < 0) return -1;
    for (; i < text.length; i++) {
        if (text[i] === '{') tiefe++;
        else if (text[i] === '}') { tiefe--; if (tiefe === 0) return i + 1; }
    }
    return -1;
}

// ===========================================================================
abschnitt('1. Der Logbuch-Block laesst sich ueberhaupt herausloesen');
// ===========================================================================
const logStart = src.indexOf('const RC_LOG_MAX');
const logLetzte = src.indexOf('window.rcHistorieSpeicherFehler = function');
pruef('RC_LOG_MAX ist deklariert', logStart > 0, logStart);
pruef('rcHistorieSpeicherFehler ist deklariert', logLetzte > logStart, logLetzte);
const logEnde = blockEnde(src, logLetzte);
pruef('Logbuch-Block sauber abgeschlossen', logEnde > logLetzte, logEnde);
const BEREICH = src.slice(logStart, logEnde + 2);
pruef('Block enthaelt rcLog selbst', /const rcLog = \{/.test(BEREICH));
pruef('Block enthaelt rcLogbuch (Download)', BEREICH.indexOf('window.rcLogbuch = function') !== -1);

// ---- Sandkasten: echter Code, gefaelschter Browser -------------------------
// Ein Speicher mit echtem Deckel. Nur so laesst sich pruefen, was bei
// QuotaExceededError wirklich passiert — ein nachgebauter Puffer wuerde nur
// die eigene Kopie bewachen.
function macheSpeicher(deckel) {
    const m = new Map();
    return {
        _m: m,
        _deckel: deckel,
        get length(){ return m.size; },
        key(i){ return Array.from(m.keys())[i]; },
        getItem(k){ return m.has(k) ? m.get(k) : null; },
        setItem(k, v){
            v = String(v);
            let summe = v.length;
            m.forEach((vv, kk) => { if (kk !== k) summe += vv.length; });
            if (summe > this._deckel) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
            m.set(k, v);
        },
        removeItem(k){ m.delete(k); }
    };
}
function baueLogbuch(deckel, projekt) {
    const win = {};
    if (projekt) { win.rcProjektKuerzel = projekt; win.rcKey = b => b + '_' + projekt; }
    const speicher = macheSpeicher(deckel);
    const konsole = { log(){}, warn(){}, error(){} };
    const geladen = [];
    const dokument = { body: { appendChild(){}, removeChild(){} },
                       createElement(){ return { click(){}, set href(v){ geladen.push(v); }, get href(){ return 'x'; } }; } };
    const f = new Function('window', 'localStorage', 'realConsole', 'document', 'Blob', 'URL', 'setTimeout',
        BEREICH + '\nreturn { rcLog, laden: rcLogbuchLaden, sichern: rcLogbuchSichern, key: rcLogbuchKey, kopf: rcLogbuchKopf };');
    const api = f(win, speicher, konsole,
        dokument,
        function Blob(){ return {}; },
        { createObjectURL(){ return 'blob:x'; }, revokeObjectURL(){} },
        function(){ });
    return { win, speicher, api };
}

// ===========================================================================
abschnitt('2. Logbuch FUNKTIONAL — schreiben, sichern, ueberdauern');
// ===========================================================================
{
    const u = baueLogbuch(500000);
    u.api.rcLog.warn('erste Warnung');
    const b = u.win.rcLogBuf;
    pruef('Warnung landet im Puffer', Array.isArray(b) && b.length === 1, JSON.stringify(b));
    pruef('Eintrag traegt Uhrzeit hh:mm:ss', /^\d\d:\d\d:\d\d W erste Warnung$/.test(b[0]), b[0]);
    pruef('Warnung wird SOFORT gesichert', u.speicher.getItem('rcLogbuch') !== null);
    // Sparbetrieb bei Info-Zeilen. ACHTUNG, hier lag zuerst die Pruefung falsch
    // und nicht der Code: die ERSTE Info-Zeile wird sehr wohl gesichert
    // (rcLogLetzteSicherung startet bei 0), und das ist richtig so — sonst
    // ginge eine einzelne Zeile vor der ersten Warnung verloren. Gespart wird
    // ab der ZWEITEN Zeile innerhalb des Sparfensters.
    const u2 = baueLogbuch(500000);
    let schreib = 0;
    const echt = u2.speicher.setItem.bind(u2.speicher);
    u2.speicher.setItem = function(k, v){ schreib++; return echt(k, v); };
    for (let i = 0; i < 5; i++) u2.api.rcLog.log('info ' + i);
    pruef('5 Info-Zeilen ergeben EINEN Schreibvorgang (Sparbetrieb)', schreib === 1, schreib);
    pruef('Alle 5 Info-Zeilen stehen im Puffer', u2.win.rcLogBuf.length === 5, u2.win.rcLogBuf.length);
    pruef('Info-Zeile ist als i gekennzeichnet', / i info 0$/.test(u2.win.rcLogBuf[0]), u2.win.rcLogBuf[0]);
    // Gegenprobe: eine Warnung dazwischen sichert SOFORT, unabhaengig vom Fenster
    const u3 = baueLogbuch(500000);
    let schreib3 = 0;
    const echt3 = u3.speicher.setItem.bind(u3.speicher);
    u3.api.rcLog.log('erste');                       // verbraucht das Sparfenster
    u3.speicher.setItem = function(k, v){ schreib3++; return echt3(k, v); };
    u3.api.rcLog.log('zweite');
    pruef('Zweite Info-Zeile schreibt nicht', schreib3 === 0, schreib3);
    u3.api.rcLog.warn('aber die Warnung schon');
    pruef('Eine Warnung durchbricht das Sparfenster', schreib3 === 1, schreib3);
}
{
    // Ueberdauern: was gesichert wurde, muss ein NEUER Lauf wiederfinden.
    // Das ist der ganze Sinn — nach Neuladen/Re-Inject soll die Spur da sein.
    const u = baueLogbuch(500000);
    u.api.rcLog.warn('vor dem Neustart');
    const gesichert = u.speicher.getItem('rcLogbuch');
    const u2 = baueLogbuch(500000);
    u2.speicher.setItem('rcLogbuch', gesichert);
    const wieder = u2.api.laden();
    pruef('Puffer ueberdauert einen Neustart', wieder.length === 1 && /vor dem Neustart/.test(wieder[0]), JSON.stringify(wieder));
}
{
    // Deckel: der Ringpuffer darf NICHT unbegrenzt wachsen — auf dem Citrix-
    // Profil ist genau das der Grund, warum es das Logbuch schwer hat.
    const u = baueLogbuch(5000000);
    for (let i = 0; i < 600; i++) u.api.rcLog.warn('zeile ' + i);
    const b = u.win.rcLogBuf;
    pruef('Ringpuffer haelt den Deckel (400)', b.length === 400, b.length);
    pruef('Aelteste Zeilen fallen raus, nicht die neuen', /zeile 599$/.test(b[b.length - 1]), b[b.length - 1]);
    pruef('Zeile 199 ist verdraengt', !b.some(z => / W zeile 199$/.test(z)));
}
{
    // Lange Meldungen werden gekappt — eine einzige Ausnahme mit Stacktrace
    // duerfte sonst den halben Ringpuffer belegen.
    const u = baueLogbuch(5000000);
    u.api.rcLog.warn('x'.repeat(5000));
    pruef('Ueberlange Meldung wird gekappt', u.win.rcLogBuf[0].length < 500, u.win.rcLogBuf[0].length);
}
{
    // Fehler-Objekte lesbar machen: String(Error) waere "Error: ..." — brauchbar,
    // aber ein blankes Objekt wuerde als [object Object] verpuffen.
    const u = baueLogbuch(5000000);
    const e = new Error('kaputt'); e.name = 'QuotaExceededError';
    u.api.rcLog.error('beim Sichern:', e);
    pruef('Fehler-Objekt wird ausgeschrieben', /QuotaExceededError: kaputt/.test(u.win.rcLogBuf[0]), u.win.rcLogBuf[0]);
    u.api.rcLog.warn('zustand:', { a: 1 });
    pruef('Objekt wird als JSON geschrieben', /\{"a":1\}/.test(u.win.rcLogBuf[1]), u.win.rcLogBuf[1]);
}

// ===========================================================================
abschnitt('3. Logbuch bei VOLLEM Speicher — der eigentliche Ernstfall');
// ===========================================================================
{
    // Deckel so klein, dass die Sicherung scheitern MUSS.
    const u = baueLogbuch(50);
    let geworfen = null;
    try { u.api.rcLog.warn('Speicher ist voll'); } catch(e) { geworfen = e; }
    pruef('rcLog.warn wirft NICHT, wenn der Speicher voll ist', geworfen === null,
          geworfen && geworfen.name);
    pruef('Der Eintrag steht trotzdem im Arbeitsspeicher', u.win.rcLogBuf.length === 1);
}
{
    // Notbremse: erst halbieren und erneut versuchen. Ein halber Puffer ist
    // besser als gar kein Logbuch.
    const u = baueLogbuch(5000000);
    for (let i = 0; i < 300; i++) u.api.rcLog.warn('zeile ' + i);
    pruef('300 Zeilen sind gesichert', u.speicher.getItem('rcLogbuch') !== null);
    const vorher = u.win.rcLogBuf.length;
    u.speicher._deckel = 2000;                 // Speicher schrumpft unter uns weg
    u.api.rcLog.warn('jetzt wird es eng');
    pruef('Puffer wurde halbiert statt aufzugeben', u.win.rcLogBuf.length <= Math.ceil(vorher / 2) + 1,
          vorher + ' -> ' + u.win.rcLogBuf.length);
}
{
    // Ist auch der halbierte Puffer zu gross, wird fuenf Minuten nicht mehr
    // geschrieben. Ohne diese Sperre kostet JEDE Log-Zeile einen scheiternden
    // Schreibversuch — bei 20-s-Takt den ganzen Tag lang.
    const u = baueLogbuch(1);
    for (let i = 0; i < 5; i++) u.api.rcLog.warn('zeile ' + i);
    let versuche = 0;
    const echtesSetItem = u.speicher.setItem.bind(u.speicher);
    u.speicher.setItem = function(k, v){ versuche++; return echtesSetItem(k, v); };
    u.api.rcLog.warn('noch eine');
    pruef('Nach dem Aufgeben wird nicht weiter geschrieben', versuche === 0, versuche);
    pruef('Der Puffer sammelt trotzdem weiter', u.win.rcLogBuf.length === 6, u.win.rcLogBuf.length);
}

// ===========================================================================
abschnitt('4. Projekt-Trennung des Logbuchs');
// ===========================================================================
{
    const u = baueLogbuch(500000, 'mob');
    u.api.rcLog.warn('Mobile-Meldung');
    pruef('Mobile schreibt unter rcLogbuch_mob', u.speicher.getItem('rcLogbuch_mob') !== null);
    pruef('Mobile schreibt NICHT unter rcLogbuch', u.speicher.getItem('rcLogbuch') === null);
    const k = baueLogbuch(500000);              // Kabel: ohne Kuerzel
    k.api.rcLog.warn('Kabel-Meldung');
    pruef('Kabel behaelt den Schluessel ohne Zusatz', k.speicher.getItem('rcLogbuch') !== null);
}

// ===========================================================================
abschnitt('5. Der Kopf der Datei — beantwortet "warum steht es?"');
// ===========================================================================
{
    const u = baueLogbuch(500000);
    // Absichtlich eine Lage bauen, wie sie bei "haengt seit Stunden" aussieht
    u.win.rcEslLastOk = Date.now() - 3 * 3600 * 1000;
    u.win.rcKpiLastUpdate = new Date(Date.now() - 90 * 60 * 1000);
    u.win.rcKpiData = { a: 1, b: 2, c: 3 };
    u.win.rcLiveInterval = null;
    u.win.rcEslHistory = { '2026-08-10': {}, '2026-08-11': {} };
    let kopf = null, geworfen = null;
    try { kopf = u.api.kopf(); } catch(e){ geworfen = e; }
    pruef('Kopf laesst sich bauen', geworfen === null, geworfen && geworfen.message);
    pruef('ESL-Alter steht drin', /ESL letzter Erfolg\s+180 Min her/.test(kopf), (kopf||'').split('\n').find(z=>/ESL letzter/.test(z)));
    pruef('Liga-Alter steht drin', /Liga letztes Paket\s+90 Min her/.test(kopf));
    pruef('Liga-Agentenzahl steht drin', /Liga Agenten\s+3/.test(kopf));
    pruef('Stehender Live-Takt wird als NEIN gemeldet', /Live-Takt laeuft\s+NEIN/.test(kopf));
    pruef('Historien-Umfang steht drin', /ESL-Tage gespeichert\s+2/.test(kopf));
    pruef('Speicher-Probe steht drin', /200-KB-Probe/.test(kopf));
    pruef('Belegung steht drin', /Belegt gesamt/.test(kopf));
}
{
    // Gegenprobe: der Kopf darf NICHT scheitern, nur weil ein Waechter fehlt.
    // Genau dann braucht man ihn ja — wenn etwas nicht da ist.
    const u = baueLogbuch(500000);
    let geworfen = null, kopf = null;
    try { kopf = u.api.kopf(); } catch(e){ geworfen = e; }
    pruef('Kopf ueberlebt komplett fehlende Waechter', geworfen === null, geworfen && geworfen.message);
    pruef('Fehlende Quelle wird als "nie" gemeldet', /ESL letzter Erfolg\s+nie/.test(kopf));
}
{
    // Und bei vollem Speicher muss der Kopf das SAGEN, nicht daran scheitern.
    const u = baueLogbuch(10);
    let kopf = null, geworfen = null;
    try { kopf = u.api.kopf(); } catch(e){ geworfen = e; }
    pruef('Kopf ueberlebt vollen Speicher', geworfen === null, geworfen && geworfen.message);
    pruef('Voller Speicher wird im Kopf benannt', /200-KB-Probe\s+FEHLGESCHLAGEN/.test(kopf),
          (kopf||'').split('\n').find(z=>/200-KB/.test(z)));
}

// ===========================================================================
abschnitt('6. Die sechs stummen catch-Bloecke der Historie');
// ===========================================================================
{
    // Jede Schreibstelle einzeln: der naechste catch dahinter MUSS melden.
    // Bewusst ueber die Klammer-Zaehlung statt ueber ein Regex-Fenster —
    // ein Fenster wird beim naechsten Umformulieren grundlos rot.
    const marke = "setItem(rcKey('rcEslHistory')";
    const stellen = [];
    let p = -1;
    while ((p = src.indexOf(marke, p + 1)) !== -1) stellen.push(p);
    pruef('Es gibt genau 6 Schreibstellen der Historie', stellen.length === 6, stellen.length);
    stellen.forEach((s, i) => {
        const c = src.indexOf('catch', s);
        const koerper = c > 0 ? src.slice(c, blockEnde(src, c)) : '';
        pruef('Schreibstelle ' + (i + 1) + ' meldet ihren Fehler',
              koerper.indexOf('rcHistorieSpeicherFehler') !== -1,
              koerper.slice(0, 60).replace(/\s+/g, ' '));
    });
    // Nur die AUFRUFE zaehlen: die Definition heisst
    // "rcHistorieSpeicherFehler = function" und traegt keine Klammer direkt
    // hinter dem Namen, faellt hier also nicht mit hinein.
    const rufe = (src.match(/rcHistorieSpeicherFehler\(/g) || []).length;
    pruef('rcHistorieSpeicherFehler wird genau 6x gerufen', rufe === 6, rufe);
    pruef('...und genau einmal definiert',
          (src.match(/rcHistorieSpeicherFehler = function/g) || []).length === 1);
}
{
    // Die Meldung selbst FUNKTIONAL: sie muss entprellen (der Live-Parser
    // laeuft alle 20 s) und trotzdem den Zustand sofort abrufbar hinterlegen.
    const u = baueLogbuch(5000000);
    const f = new Function('window', 'rcLog',
        src.slice(src.indexOf('let rcHistFehlerZuletzt'), blockEnde(src, src.indexOf('window.rcHistorieSpeicherFehler = function')) + 2) +
        '\nreturn window.rcHistorieSpeicherFehler;');
    const win = {};
    const melden = f(win, u.api.rcLog);
    const e = new Error('voll'); e.name = 'QuotaExceededError';
    for (let i = 0; i < 10; i++) melden('Test', e);
    const warnungen = u.win.rcLogBuf.filter(z => /Historie NICHT gespeichert/.test(z)).length;
    pruef('10 Fehlschlaege ergeben EINE Meldung (entprellt)', warnungen === 1, warnungen);
    pruef('Der Zustand ist sofort abrufbar', win.rcHistorieSpeicherDefekt &&
          win.rcHistorieSpeicherDefekt.grund === 'QuotaExceededError',
          JSON.stringify(win.rcHistorieSpeicherDefekt));
    pruef('Die Meldung nennt die Folge im Klartext',
          /Wochen-\/Monatswerte wachsen ab jetzt nicht weiter/.test(u.win.rcLogBuf.find(z => /Historie NICHT/.test(z)) || ''));
}

// ===========================================================================
abschnitt('7. Knopf und Konsolen-Handles');
// ===========================================================================
pruef('Knopf "Logbuch" steht im Werkzeug-Menue', src.indexOf('id="rcBtnLogbuch"') !== -1);
pruef('Knopf ist auch VERDRAHTET', src.indexOf("getElementById('rcBtnLogbuch')") !== -1);
pruef('rcLogbuch() ist auf window', src.indexOf('window.rcLogbuch = function') !== -1);
pruef('rcLogbuchZeigen() ist auf window', src.indexOf('window.rcLogbuchZeigen = function') !== -1);
pruef('rcLogbuchLeeren() ist auf window', src.indexOf('window.rcLogbuchLeeren = function') !== -1);
pruef('rcLogEreignis() ist auf window', src.indexOf('window.rcLogEreignis = function') !== -1);
pruef('Der Start schreibt ein Ereignis (Re-Injects sichtbar)',
      /rcLogEreignis\('START Dashboard/.test(src));
{
    const u = baueLogbuch(500000);
    const name = u.win.rcLogbuch();
    pruef('rcLogbuch() liefert den Dateinamen zurueck',
          /^ESL-Logbuch-kabel-\d{8}-\d{4}\.txt$/.test(name), name);
    const m = baueLogbuch(500000, 'um');
    pruef('Dateiname traegt das Projekt', /^ESL-Logbuch-um-/.test(m.win.rcLogbuch()), m.win.rcLogbuch());
}
{
    // Gegenprobe zur Puffer-Bereinigung
    const u = baueLogbuch(500000);
    u.api.rcLog.warn('etwas');
    u.win.rcLogbuchLeeren();
    pruef('rcLogbuchLeeren() raeumt Puffer und Speicher', u.win.rcLogBuf.length === 0 &&
          u.speicher.getItem('rcLogbuch') === null);
}

// ===========================================================================
abschnitt('8. Warteschleife/Genesys ganz abschaltbar');
// ===========================================================================
pruef('CFG.modulAus ist angelegt', /modulAus: false/.test(src));
pruef('Der Schluessel heisst NICHT "aus" (der ist vergeben)',
      src.indexOf("aus: {},") !== -1 && src.indexOf('modulAus') !== -1);
pruef('rcQueueAus() ist auf window', src.indexOf('window.rcQueueAus = function') !== -1);
pruef('queueAbraeumen() existiert', src.indexOf('function queueAbraeumen(') !== -1);
{
    const a = src.indexOf('function queueAbraeumen(');
    const koerper = src.slice(a, blockEnde(src, a));
    pruef('Abraeumen stoppt den 3-s-Takt', koerper.indexOf('rcQueueInterval') !== -1);
    pruef('Abraeumen stoppt den Auto-Quelle-Takt', koerper.indexOf('rcQueueAutoInterval') !== -1);
    pruef('Abraeumen entfernt die Seite', koerper.indexOf('rcPageQueueContent') !== -1);
    pruef('Abraeumen entfernt den Reiter', koerper.indexOf("el('rcPageQueue')") !== -1);
    pruef('Abraeumen nimmt die Seite aus __rcPagesRef', koerper.indexOf('__rcPagesRef') !== -1);
    // Ohne diesen Punkt springt der Auto-Wechsel auf eine Seite, die es nicht
    // mehr gibt — der Fehler faellt erst auf dem Wandmonitor auf.
    pruef('Abraeumen nimmt die Seite aus der Auto-Rotation', koerper.indexOf('rcAutoRotPages') !== -1);
    pruef('Abraeumen schliesst das Monitor-Fenster', koerper.indexOf('rcQueueWin') !== -1);
}
{
    // Der Boot muss VOR dem Aufbau aussteigen — sonst baut er alles auf und
    // raeumt es hinterher wieder ab (Flackern auf dem Wandmonitor).
    const boot = src.indexOf('// ---- Boot ----');
    const aufbau = src.indexOf('ensureQueuePage(); buildShell()', boot);
    const ausstieg = src.indexOf('if(CFG.modulAus)', boot);
    pruef('Boot-Ausstieg steht VOR dem Aufbau', ausstieg > 0 && ausstieg < aufbau,
          'ausstieg=' + ausstieg + ' aufbau=' + aufbau);
    pruef('Boot-Ausstieg raeumt vorher ab (Re-Inject-Rest)',
          src.slice(ausstieg, aufbau).indexOf('queueAbraeumen()') !== -1);
}
{
    // Der Kanal-Horcher wird VOR dem Boot angelegt und laeuft also weiter.
    // Ohne Sperre in rcQueueIngest kaeme trotz "aus" weiter Last herein.
    const i = src.indexOf('window.rcQueueIngest = function');
    const kopf = src.slice(i, i + 1600);
    pruef('rcQueueIngest weist Daten bei modulAus ab', /if\(CFG\.modulAus\) return;/.test(kopf));
    const sperre = kopf.indexOf('if(CFG.modulAus) return;');
    const projektfilter = kopf.indexOf('rcEigenesProjekt');
    pruef('Der Projektfilter ist im Suchfenster (sonst misst der Vergleich nichts)',
          projektfilter > 0, projektfilter);
    pruef('Die Sperre steht ganz vorn in rcQueueIngest', sperre > 0 && sperre < projektfilter,
          'sperre=' + sperre + ' projekt=' + projektfilter);
}
{
    // Zwei-Listen-Falle: ein Schalter im Konfigurator steht im Aufbau UND im
    // Speichern. Hier sind es sogar drei Stellen (Aufbau, Fuellen, Speichern) —
    // fehlt eine, laesst er sich einstellen, aber nicht behalten.
    pruef('Schalter im Dialog gebaut', src.indexOf('id="rcQCfgModulAus"') !== -1);
    pruef('Schalter wird beim Oeffnen gefuellt', src.indexOf("el('rcQCfgModulAus').checked =") !== -1);
    pruef('Schalter wird beim Speichern gelesen', src.indexOf("el('rcQCfgModulAus').checked;") !== -1);
    // Und er darf nicht nur gespeichert, sondern muss auch WIRKEN.
    const sp = src.indexOf("var ausNeu = el('rcQCfgModulAus').checked;");
    pruef('Speichern ruft rcQueueAus (wirkt sofort)',
          sp > 0 && src.slice(sp, sp + 400).indexOf('window.rcQueueAus(ausNeu)') !== -1);
    // Der Weg zurueck muss benannt sein: mit der Seite verschwindet der Dialog.
    pruef('Der Weg zurueck steht im Hinweistext', /rcQueueAus\(false\)/.test(src));
}

// ===========================================================================
abschnitt('9. Quellen-Waechter schreibt WECHSEL ins Logbuch (12.08.)');
// ===========================================================================
// Nutzer-Anliegen: "wenn er irgendwann nicht laedt, will ich wissen warum" —
// der Waechter kannte den Grund laengst (Banner), aber er stand nirgends
// nachlesbar. FUNKTIONAL pruefen: echten rcQuellenWatchTick + echten
// Logbuch-Block zusammen ausfuehren, DOM/localStorage faelschen.
{
    const wStart = src.indexOf('var RC_LIGA_TOT_MIN = 20;');
    const wEnde = src.indexOf('function rcQuellenZeitAnzeige(');
    pruef('rcQuellenWatchTick-Block laesst sich ausschneiden', wStart > 0 && wEnde > wStart);
    const WBEREICH = src.slice(wStart, wEnde);
    pruef('Ausgeschnittener Block ruft rcLog.warn beim Auftreten', /rcLog\.warn\('Quellen-Stoerung: '/.test(WBEREICH));
    pruef('Ausgeschnittener Block meldet die Behebung', /Quellen-Stoerung behoben: /.test(WBEREICH));

    function baueWaechter(deckel) {
        const win = { rcQuellenBanner: () => {}, rcQuellenZeitAnzeige: () => {} };
        const speicher = macheSpeicher(deckel);
        const konsole = { log(){}, warn(){}, error(){} };
        const dokument = { body: { appendChild(){}, removeChild(){} },
                           createElement(){ return { click(){}, set href(v){}, get href(){ return 'x'; } }; },
                           getElementById(){ return null; } };
        // Logbuch-Block + Waechter-Block in EINER Funktion: der Waechter
        // braucht rcLog/window.rcLogEreignis aus genau demselben Lauf.
        // rcQuellenZeitAnzeige/rcQuellenBanner sind ECHTE Nachbar-Funktionen
        // (im selben IIFE deklariert), hier aber bewusst NICHT mit ausgeschnitten
        // — sie sind reine Anzeige und nicht Teil dessen, was diese Pruefung
        // misst. Stubs stehen an derselben Stelle im Scope (hoisted
        // Funktionsdeklaration), damit die bare-Aufrufe im echten Code
        // aufgeloest werden koennen, genau wie im Original.
        const f = new Function('window', 'localStorage', 'realConsole', 'document', 'Blob', 'URL', 'setTimeout',
            'function rcQuellenZeitAnzeige(){} function rcQuellenBanner(){}\n' +
            BEREICH + '\n' + WBEREICH +
            '\nreturn { tick: rcQuellenWatchTick, laden: rcLogbuchLaden };');
        const api = f(win, speicher, konsole, dokument,
            function Blob(){ return {}; },
            { createObjectURL(){ return 'blob:x'; }, revokeObjectURL(){} },
            function(){ });
        return { win, speicher, api };
    }

    // ---- a) Stoerung faengt an: EIN Eintrag, nicht bei jedem Takt ----------
    {
        const u = baueWaechter(5000000);
        u.win.rcEslLastOk = Date.now() - 10 * 60 * 1000;   // 10 Min alt, Grenze ist 5
        u.win.rcSessionState = { alive: true };
        u.win.rcEslFehlserie = 0;
        for (let i = 0; i < 5; i++) u.api.tick();          // fuenf Takte in Folge, unveraendert
        const b = u.api.laden();
        const treffer = b.filter(z => /Quellen-Stoerung: /.test(z));
        pruef('5 gleiche Takte ergeben GENAU EINEN Logbuch-Eintrag', treffer.length === 1, treffer.length);
        pruef('Der Eintrag nennt ESL als Grund', /ESL liefert nicht mehr/.test(treffer[0] || ''), treffer[0]);
    }

    // ---- b) Stoerung behoben: EIGENER Eintrag, andere Kennzeichnung --------
    {
        const u = baueWaechter(5000000);
        u.win.rcEslLastOk = Date.now() - 10 * 60 * 1000;
        u.win.rcSessionState = { alive: true };
        u.api.tick();                                       // Stoerung beginnt
        u.win.rcEslLastOk = Date.now();                      // jetzt wieder frisch
        u.api.tick();                                        // Stoerung endet
        const b = u.api.laden();
        // NACH INHALT suchen, nicht nach Position (Lehre vom 05.08.: eine
        // positionsweise Auswertung misst nach der naechsten Erweiterung etwas
        // anderes). Seit 17.08. schreibt der Watchdog seine Stufen in denselben
        // Puffer - Beginn und Ende der Stoerung stehen dann nicht mehr auf
        // Platz 0 und 1.
        const beginn = b.filter(x => / W Quellen-Stoerung: /.test(x));
        const ende   = b.filter(x => / E Quellen-Stoerung behoben: /.test(x));
        pruef('Beginn und Ende sind ZWEI verschiedene Eintraege',
              beginn.length === 1 && ende.length === 1, JSON.stringify(b));
        pruef('Beginn ist als Warnung (W) markiert', beginn.length === 1, JSON.stringify(beginn));
        pruef('Ende ist als Ereignis (E) markiert, nicht als Warnung',
              ende.length === 1 && !/ W .*behoben/.test(b.join('\n')), JSON.stringify(ende));
    }

    // ---- c) Nie eine Stoerung: gar kein Eintrag -----------------------------
    {
        const u = baueWaechter(5000000);
        u.win.rcSessionState = { alive: true };              // alles frisch, alles ruhig
        for (let i = 0; i < 3; i++) u.api.tick();
        pruef('Ohne jede Stoerung bleibt das Logbuch leer', u.api.laden().length === 0, u.api.laden().length);
    }

    // ---- d) Zwei VERSCHIEDENE Gruende hintereinander: zwei Eintraege --------
    {
        const u = baueWaechter(5000000);
        u.win.rcSessionState = { alive: true };
        u.win.rcEslLastOk = Date.now() - 10 * 60 * 1000;
        u.api.tick();                                        // ESL-Stoerung
        u.win.rcEslLastOk = Date.now();
        u.win.rcLigaStoerung = { grund: 'ORA-01017' };
        u.api.tick();                                        // ESL vorbei, Liga faengt an
        const b = u.api.laden();
        const warnungen = b.filter(z => / W Quellen-Stoerung: /.test(z));
        pruef('Wechsel von ESL- zu Liga-Stoerung ergibt eine NEUE Warnung',
              warnungen.length === 2 && /ORA-01017/.test(warnungen[1]), JSON.stringify(warnungen));
    }

    // ---- e) Voller Speicher: der Waechter darf nicht werfen -----------------
    {
        const u = baueWaechter(30);
        u.win.rcSessionState = { alive: true };
        u.win.rcEslLastOk = Date.now() - 10 * 60 * 1000;
        let geworfen = null;
        try { u.api.tick(); } catch(e){ geworfen = e; }
        pruef('Quellen-Waechter uebersteht vollen Speicher', geworfen === null, geworfen && geworfen.message);
    }
}

// ===========================================================================
abschnitt('10. Datumswechsel um Mitternacht (12.08.)');
// ===========================================================================
// Nutzer-Vorgabe: "soll nicht um Mitternacht aufhoeren zu arbeiten".
// Bisher wurde nur REAKTIV gegengesteuert und nur dann, wenn der Export Zeilen
// eines Fremdtages lieferte — in einer ruhigen Nacht fehlt dieser Ausloeser.
{
    const mStart = src.indexOf('let rcTagKeyZuletzt = null;');
    const mEnde = blockEnde(src, src.indexOf('function rcMitternachtPruefen('));
    pruef('rcMitternachtPruefen ist vorhanden', mStart > 0 && mEnde > mStart);
    const MBEREICH = src.slice(mStart, mEnde);

    // Der Waechter haengt an tickClock, NICHT an einem eigenen Zeitgeber —
    // ein eigener Timer wuerde im minimierten Fenster gedrosselt und muesste
    // zusaetzlich in die Clean-State-Liste.
    const tStart = src.indexOf('function tickClock(){');
    const tKoerper = src.slice(tStart, blockEnde(src, tStart));
    pruef('Wird aus tickClock gerufen (kein eigener Zeitgeber)',
          /rcMitternachtPruefen\(n\)/.test(tKoerper));
    pruef('Aufruf steht in eigenem try (Uhr darf nicht ausfallen)',
          /try \{ rcMitternachtPruefen\(n\); \} catch/.test(tKoerper));
    pruef('Es wird KEIN zusaetzliches setInterval angelegt',
          MBEREICH.indexOf('setInterval') === -1);

    function baueMitternacht() {
        const win = {};
        const rufe = [];
        const f = new Function('window', 'pad2', 'rcPortalAufHeute',
            MBEREICH + '\nreturn rcMitternachtPruefen;');
        const fn = f(win,
            x => ('0' + x).slice(-2),
            function(erzwingen){ rufe.push({ erzwingen: erzwingen }); });
        win.rcLogEreignis = t => (win._log = win._log || []).push(t);
        return { win, fn, rufe };
    }

    // ---- a) Erster Aufruf darf NICHTS tun -------------------------------
    // Das ist nicht Kosmetik: tickClock() wird einmal SOFORT beim Aufbau
    // gerufen, und rcPortalAufHeute liest dann rcTagFixZuletzt, das als `let`
    // weiter unten steht und in diesem Moment in seiner temporal dead zone
    // liegt. Ohne diesen Ausstieg stuerzt der Dashboard-Aufbau ab.
    {
        const u = baueMitternacht();
        u.fn(new Date(2026, 7, 12, 14, 30));
        pruef('Erster Aufruf stellt das Portal NICHT um', u.rufe.length === 0, u.rufe.length);
    }

    // ---- b) Gleicher Tag: nichts tun ------------------------------------
    {
        const u = baueMitternacht();
        u.fn(new Date(2026, 7, 12, 14, 30));
        for (let i = 0; i < 50; i++) u.fn(new Date(2026, 7, 12, 14, 30 + i));
        pruef('50 Takte am selben Tag loesen nichts aus', u.rufe.length === 0, u.rufe.length);
    }

    // ---- c) Tageswechsel: GENAU EINMAL umstellen ------------------------
    {
        const u = baueMitternacht();
        u.fn(new Date(2026, 7, 12, 23, 59, 58));
        u.fn(new Date(2026, 7, 12, 23, 59, 59));
        u.fn(new Date(2026, 7, 13, 0, 0, 0));      // Mitternacht
        u.fn(new Date(2026, 7, 13, 0, 0, 1));
        u.fn(new Date(2026, 7, 13, 0, 0, 2));
        pruef('Tageswechsel stellt das Portal GENAU EINMAL um', u.rufe.length === 1, u.rufe.length);
        // Ohne erzwingen=true faellt genau dieser eine Versuch der
        // 5-Minuten-Sperre zum Opfer, wenn kurz vorher schon einer lief.
        pruef('Und zwar mit erzwingen=true (umgeht die 5-Minuten-Sperre)',
              u.rufe[0] && u.rufe[0].erzwingen === true, JSON.stringify(u.rufe[0]));
        pruef('Der Wechsel steht im Logbuch', (u.win._log || []).some(t => /Datumswechsel/.test(t)),
              JSON.stringify(u.win._log));
        pruef('Das Logbuch nennt beide Tage', /2026-08-12 -> 2026-08-13/.test((u.win._log || [])[0] || ''),
              (u.win._log || [])[0]);
    }

    // ---- d) Monats- und Jahreswechsel ------------------------------------
    // Gegenprobe gegen einen Vergleich, der nur den Tag im Monat ansieht:
    // 31.08. -> 01.09. und 31.12. -> 01.01. muessen genauso greifen.
    {
        const u = baueMitternacht();
        u.fn(new Date(2026, 7, 31, 23, 59));
        u.fn(new Date(2026, 8, 1, 0, 0));
        pruef('Monatswechsel wird erkannt', u.rufe.length === 1, u.rufe.length);
        const j = baueMitternacht();
        j.fn(new Date(2026, 11, 31, 23, 59));
        j.fn(new Date(2027, 0, 1, 0, 0));
        pruef('Jahreswechsel wird erkannt', j.rufe.length === 1, j.rufe.length);
        pruef('Jahreswechsel im Logbuch korrekt', /2026-12-31 -> 2027-01-01/.test((j.win._log || [])[0] || ''),
              (j.win._log || [])[0]);
    }

    // ---- e) rcPortalAufHeute nimmt den Parameter ueberhaupt an ------------
    // Sonst liefe der Aufruf oben zwar, aber die Sperre bliebe wirksam —
    // "gebaut, aber wirkungslos", der haeufigste Fallstrick dieses Projekts.
    {
        const p = src.indexOf('async function rcPortalAufHeute(');
        const kopf = src.slice(p, p + 260);
        pruef('rcPortalAufHeute hat den Parameter erzwingen', /rcPortalAufHeute\(erzwingen\)/.test(kopf), kopf.slice(0, 60));
        pruef('...und wertet ihn in der Sperre aus', /if \(!erzwingen && jetzt - rcTagFixZuletzt/.test(kopf));
    }
}

// ===========================================================================
abschnitt('11. Cache-Umleitung im Starter (12.08.)');
// ===========================================================================
{
    const cmd = fs.readFileSync(path.join(WURZEL, 'ESL_Start.cmd'), 'utf8');
    pruef('$CacheDir wird ermittelt', /\$CacheDir = ''/.test(cmd));
    pruef('Cache landet unter LOCALAPPDATA (lokal, nicht quotiert)',
          /\$env:LOCALAPPDATA/.test(cmd) && /regiocom_ESL_Cache/.test(cmd));
    pruef('Je Projekt eigener Cache (Chromium sperrt ihn exklusiv)',
          /regiocom_ESL_Cache\\\\" \+ \$ProfilName/.test(cmd) || /regiocom_ESL_Cache\\\\"\s*\+\s*\$ProfilName/.test(cmd) ||
          cmd.indexOf('"regiocom_ESL_Cache\\" + $ProfilName') !== -1);
    // Test-Path allein beweist nicht, dass geschrieben werden darf.
    pruef('Beschreibbarkeit wird wirklich getestet, nicht nur Test-Path',
          /schreibprobe/.test(cmd) && /Set-Content/.test(cmd));
    // Der gefaehrlichste Fall: leerer Wert wuerde als --disk-cache-dir="" an
    // Edge gehen. Deshalb wird das Argument BEDINGT angehaengt.
    pruef('--disk-cache-dir wird nur bei nutzbarem Ordner gesetzt',
          /if \(\$CacheDir\) \{[\s\S]{0,200}--disk-cache-dir/.test(cmd));
    pruef('Cache-Groesse ist gedeckelt', /--disk-cache-size=314572800/.test(cmd));
    // Die Adresse muss letztes Argument bleiben, sonst startet Edge sie nicht.
    const idxCache = cmd.indexOf('$edgeArgs += "--disk-cache-dir');
    const idxUrl = cmd.indexOf('$edgeArgs += "`"$EslUrl`""');
    pruef('Die Adresse wird NACH den Cache-Argumenten angehaengt',
          idxCache > 0 && idxUrl > idxCache, 'cache=' + idxCache + ' url=' + idxUrl);
    // "Nicht pruefbar" darf nicht als gruen durchgehen (Lehre 3b).
    pruef('Abschnitt 3c prueft den Cache am laufenden Edge',
          cmd.indexOf('Cache-Ort NICHT PRUEFBAR') !== -1);
    pruef('3c kennt alle drei Zustaende (ok / ins Profil / nicht pruefbar)',
          cmd.indexOf('Browser-Cache liegt ausserhalb des Profils') !== -1 &&
          cmd.indexOf('cached INS PROFIL auf dem Netzlaufwerk') !== -1);
    // Der Zweck der Umleitung ist, dass NUR der Cache umzieht.
    pruef('Passwoerter/Cookies bleiben im Profil (kein --user-data-dir auf lokal)',
          /--user-data-dir=`"\$Profil`"/.test(cmd));
}

// ===========================================================================
console.log('\n===========================================================');
console.log('  ' + ok + ' bestanden, ' + fehler + ' fehlgeschlagen.');
console.log('===========================================================');
process.exit(fehler ? 1 : 0);
