// ===========================================================================
//  watchdog_pruefen.js  —  Pruefwerkzeug (offline, ohne Portal)
// ===========================================================================
//  Prueft die Eskalationsleiter vom 17.08. (Nutzer-Vorgabe: "Das Dashboard
//  muss alleine 24 Stunden, wochenlang laufen. Egal was passiert, es muss
//  immer ein Plan B da sein.").
//
//  Anlass: rcQuellenWatchTick hat die Stoerung immer schon ERKANNT - am
//  17.08. stand 58 Minuten "Ligaliste liefert seit 58 Minuten nichts mehr"
//  auf dem Schirm, und niemand tat etwas. Diagnose ohne Handlung.
//
//  Die Leiter wird FUNKTIONAL durchgespielt: echter Code per Klammer-
//  Zaehlung ausgeschnitten, Zeit und Quellen gestubbt, Stufen mitgezaehlt.
//  Jede Regel hat eine Gegenprobe.
//
//  Aufruf:  node pruefwerkzeuge/watchdog_pruefen.js
// ===========================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(WURZEL, 'esl_live_arena_v22.js'), 'utf8');
const craw = fs.readFileSync(path.join(WURZEL, 'kpi_crawler.js'), 'utf8');
const cmd = fs.readFileSync(path.join(WURZEL, 'ESL_Start.cmd'), 'utf8');
const mail = fs.readFileSync(path.join(WURZEL, 'esl_mail_report.ps1'), 'utf8');

let ok = 0, fehler = 0;
function pruef(t, b, z) {
    if (b) { ok++; console.log('  ok   ' + t); }
    else { fehler++; console.log('  FEHL ' + t + (z !== undefined ? '  -> ' + z : '')); }
}
function abschnitt(t){ console.log('\n--- ' + t + ' ---'); }
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
// Kommentar-Entferner MIT Regex-Literal-Erkennung (sonst verschluckt ein " in
// einem Regex den halben Block - siehe wochenlauf_pruefen.js).
function ohneKommentare(t){
    let out = '', i = 0, letzt = '';
    const regexMoeglich = () => !/[\w$)\]]$/.test(letzt);
    while (i < t.length) {
        const c = t[i], n = t[i+1];
        if (c === '/' && n === '/') { while (i < t.length && t[i] !== '\n') i++; }
        else if (c === '/' && n === '*') { i += 2; while (i < t.length && !(t[i] === '*' && t[i+1] === '/')) i++; i += 2; }
        else if (c === '/' && regexMoeglich()) {
            i++; let kl = false;
            while (i < t.length) {
                const z = t[i];
                if (z === '\\') { i += 2; continue; }
                if (z === '[') kl = true; else if (z === ']') kl = false;
                else if (z === '/' && !kl) { i++; break; }
                else if (z === '\n') break;
                i++;
            }
            out += ' '; letzt = ' ';
        }
        else if (c === '"' || c === "'" || c === '`') {
            const q = c; out += ' '; i++;
            while (i < t.length && t[i] !== q) { if (t[i] === '\\') i++; i++; }
            i++; letzt = ' ';
        }
        else { out += c; if (!/\s/.test(c)) letzt = c; i++; }
    }
    return out;
}
const nackt = ohneKommentare(src);

// ===========================================================================
abschnitt('1. Wird der Watchdog ueberhaupt gerufen? (Fallstrick 1)');
{
    pruef('rcWdTick ist definiert', /function\s+rcWdTick\s*\(/.test(nackt));
    const aufrufe = (nackt.match(/(?<![\w$.])rcWdTick\s*\(/g) || []).length;
    pruef('rcWdTick hat einen echten Aufrufer', aufrufe >= 2, aufrufe + ' Vorkommen (Definition + Aufruf)');
    // Er muss am 60-s-Takt haengen, nicht an einem eigenen Timer.
    const qw = ohneKommentare(schneideAus(src, 'function rcQuellenWatchTick()'));
    pruef('rcQuellenWatchTick ruft ihn', /rcWdTick\(\)/.test(qw));
    pruef('...in einem EIGENEN try (Diagnose und Handlung reissen sich nicht mit)',
        /try\s*\{\s*rcWdTick\(\)\s*;?\s*\}\s*catch/.test(qw));
    const wd = ohneKommentare(schneideAus(src, 'function rcWdTick()'));
    pruef('rcWdTick legt keinen eigenen Zeitgeber an',
        !/setInterval/.test(wd) && !/setTimeout/.test(wd));
}

// ===========================================================================
abschnitt('2. Die Leiter, funktional durchgespielt');
{
    // Echte Stufen-Tabelle + echte Tick-Funktion ausschneiden und ausfuehren.
    const quelle = [
        schneideAus(src, 'var RC_WD_STUFEN = {').replace(/^var /, 'var '),
        'var RC_WD = { liga:{seit:null,stufe:0,letzteAktion:0}, esl:{seit:null,stufe:0,letzteAktion:0}, alarm:null };',
        'var RC_WD_ABSTAND_MS = 4 * 60000;',
        schneideAus(src, 'function rcWdStilleMin(quelle)'),
        schneideAus(src, 'function rcWdTick()'),
        schneideAus(src, 'function rcWdAlarm(quelle, stillMin)'),
        schneideAus(src, 'function rcDienstModus()'),   // Dienst-Schalter (27.10.): ohne Marke wie bisher
        'return { RC_WD, rcWdTick, rcWdStilleMin };',
    ].join('\n');

    const bauen = () => {
        const getan = [];
        const win = {};
        // Zeit steuerbar machen: der echte Code nutzt Date.now().
        let jetzt = 1000000000000;
        const echtNow = Date.now;
        const env = {
            window: win,
            rcLog: { warn: m => getan.push('LOG:' + m) },
            pad2: n => String(n).padStart(2, '0'),
            rcKey: s => s,
            localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
            rcWdAnKpi: msg => { getan.push('kpi:' + msg.type); return true; },
            rcWdSelbstNeuladen: () => { getan.push('reload'); return true; },
            rcWdAlarmAnzeigen: () => {},
            rcWdReloadStand: () => ({ tag: 'x', n: 0 }),
            RC_LIGA_URL: 'https://liga',
            setTimeout: () => {},
        };
        win.rcLogEreignis = m => getan.push('EREIGNIS:' + m);
        win.rcJetztAktualisieren = () => { getan.push('esl:jetzt'); return true; };
        win.rcPortalAufHeute = () => { getan.push('esl:heute'); return true; };
        win.rcOpenKpiQuelle = () => { getan.push('kpi:neu-oeffnen'); return true; };
        win.rcKpiWin = { closed: false, close(){ getan.push('kpi:schliessen'); }, location: {} };

        const f = new Function(...Object.keys(env), 'Date',
            '"use strict";' + quelle);
        const fakeDate = { now: () => jetzt };
        const api = f(...Object.values(env), fakeDate);
        return {
            api, getan, win,
            vor: min => { jetzt += min * 60000; },
            // Liga meldet sich zuletzt vor X Minuten
            ligaAlt: min => { win.rcKpiLastUpdate = { getTime: () => jetzt - min * 60000 }; },
            eslAlt: min => { win.rcEslLastOk = jetzt - min * 60000; },
        };
    };

    // (a) Alles frisch -> keine Stufe
    let t = bauen();
    t.ligaAlt(1); t.eslAlt(1);
    t.api.rcWdTick();
    pruef('frische Daten loesen KEINE Stufe aus', t.getan.length === 0, JSON.stringify(t.getan));

    // (b) Liga 6 Min still -> Stufe 1 (Replay)
    t = bauen(); t.ligaAlt(6); t.eslAlt(1);
    t.api.rcWdTick();
    pruef('Liga 6 Min still -> Stufe 1 stoesst Replay an',
        t.getan.some(x => x === 'kpi:RC_LIVE_NOW'), JSON.stringify(t.getan));

    // (c) Abstand: sofort nochmal ticken darf NICHTS tun
    const vorher = t.getan.length;
    t.api.rcWdTick();
    pruef('zweiter Tick binnen 4 Min macht keine weitere Stufe', t.getan.length === vorher);

    // (d) Nach dem Abstand und mehr Stille -> naechste Stufe
    t.vor(5); t.ligaAlt(13);
    t.api.rcWdTick();
    pruef('13 Min still -> Stufe 2 verwirft den Ok-Klick',
        t.getan.some(x => x === 'kpi:RC_KLICK_NEU'), JSON.stringify(t.getan));

    // (e) Grosser Rueckstand ueberspringt Stufen (nicht bei 1 anfangen)
    t = bauen(); t.ligaAlt(40); t.eslAlt(1);
    t.api.rcWdTick();
    pruef('40 Min Rueckstand springt direkt zur hohen Stufe (kein Replay mehr)',
        !t.getan.includes('kpi:RC_LIVE_NOW'), JSON.stringify(t.getan));

    // (f) Erholung setzt die Leiter zurueck
    t = bauen(); t.ligaAlt(13); t.eslAlt(1);
    t.api.rcWdTick();
    const stufeNach = t.api.RC_WD.liga.stufe;
    t.ligaAlt(0);
    t.api.rcWdTick();
    pruef('Daten fliessen wieder -> Leiter zurueck auf 0',
        stufeNach > 0 && t.api.RC_WD.liga.stufe === 0, 'war ' + stufeNach);
    pruef('...und es steht im Logbuch', t.getan.some(x => /EREIGNIS:.*liefert wieder/.test(x)));

    // (g) ESL hat eine eigene Leiter
    t = bauen(); t.ligaAlt(1); t.eslAlt(4);
    t.api.rcWdTick();
    pruef('ESL 4 Min still -> eigener Sofort-Abruf', t.getan.includes('esl:jetzt'), JSON.stringify(t.getan));

    // (h) Leiter durch -> Alarm. ESL bewusst bei JEDEM Schritt frisch halten:
    // sonst altert es mit, laeuft in seine eigene Leiter und ueberschreibt den
    // Liga-Alarm - dann pruefte dieser Test etwas anderes als er behauptet.
    t = bauen(); t.ligaAlt(200); t.eslAlt(1);
    for (let i = 0; i < 8; i++) { t.api.rcWdTick(); t.vor(5); t.ligaAlt(200 + i * 5); t.eslAlt(1); }
    pruef('nach der letzten Stufe wird Alarm gesetzt', !!t.api.RC_WD.alarm, JSON.stringify(t.api.RC_WD.alarm));
    pruef('Alarm nennt die Quelle', t.api.RC_WD.alarm && t.api.RC_WD.alarm.quelle === 'liga');
    pruef('Alarm wird am window sichtbar (der Starter liest ihn)', !!t.win.rcWdAlarm);
}

// ===========================================================================
abschnitt('3. Kaltstart und Selbst-Reload (die zwei Selbstmord-Fallen)');
{
    const f = ohneKommentare(schneideAus(src, 'function rcWdStilleMin(quelle)'));
    // Ohne Rueckfall auf den Aufbau-Zeitpunkt liefe die Leiter nach dem
    // eigenen Neuladen nie wieder an - rcKpiLastUpdate ist dann weg.
    pruef('rcWdStilleMin faellt auf den Dashboard-Start zurueck (Kaltstart + nach Reload)',
        /RC_WD_START/.test(f));
    pruef('...aber erst nach einer Karenz (Start braucht Zeit)', /RC_WD_KALT_MIN/.test(f));
    // GEGENPROBE: die naive Fassung (null wenn nie Daten) muss durchfallen
    pruef('GEGENPROBE: "kein Zeitstempel -> null" allein reicht nicht',
        !/if\s*\(!ts\)\s*return null;\s*\}/.test(f));

    // Der Reload-Deckel MUSS persistent sein - sonst Reload-Schleife.
    const r = ohneKommentare(schneideAus(src, 'function rcWdSelbstNeuladen()'));
    pruef('Selbst-Reload zaehlt gegen einen Deckel', /RC_WD_RELOAD_MAX/.test(r));
    const st = ohneKommentare(schneideAus(src, 'function rcWdReloadStand()'));
    pruef('...und der Deckel liegt im localStorage (ueberlebt das Neuladen)',
        /localStorage\.getItem/.test(st));
    pruef('...projektgetrennt ueber rcKey',
        /rcKey\(/.test(ohneKommentare(schneideAus(src, 'function rcWdReloadKey()'))));
    pruef('...mit Tagesbezug (morgen wieder frei)', /tag/.test(st));
    // Funktional: Deckel erreicht -> kein Reload mehr
    {
        const store = {};
        const env = {
            localStorage: {
                getItem: k => (k in store ? store[k] : null),
                setItem: (k, v) => { store[k] = String(v); },
            },
            rcKey: s => s, pad2: n => String(n).padStart(2,'0'),
            rcLog: { warn(){} }, setTimeout: () => {},
            location: { reload(){} },
        };
        const quelle = [
            'var RC_WD_RELOAD_MAX = 4;',
            schneideAus(src, 'function rcWdReloadKey()'),
            schneideAus(src, 'function rcWdHeute()'),
            schneideAus(src, 'function rcWdReloadStand()'),
            schneideAus(src, 'function rcWdSelbstNeuladen()'),
            'return { rcWdSelbstNeuladen, rcWdReloadStand };',
        ].join('\n');
        const api = new Function(...Object.keys(env), '"use strict";' + quelle)(...Object.values(env));
        let n = 0;
        for (let i = 0; i < 9; i++) if (api.rcWdSelbstNeuladen()) n++;
        pruef('Deckel greift funktional: hoechstens 4 Selbst-Reloads je Tag', n === 4, n + ' Reloads');
        pruef('...und der Stand ueberlebt im Speicher', api.rcWdReloadStand().n === 4);
    }
}

// ===========================================================================
abschnitt('4. Das Kommando im Crawler');
{
    pruef('RC_KLICK_NEU wird im Crawler behandelt', /d\.type === 'RC_KLICK_NEU'/.test(craw));
    const blk = craw.slice(craw.indexOf("d.type === 'RC_KLICK_NEU'"), craw.indexOf("d.type === 'RC_KLICK_NEU'") + 600);
    pruef('...verwirft den gemerkten Klick', /klickVerwerfen/.test(blk));
    pruef('...setzt den Versuchszaehler zurueck (sonst greift der Deckel sofort)',
        /autoKlickVersuche\s*=\s*0/.test(blk));
    pruef('...und stoesst den Auto-Klick an', /autoKlickPlanen/.test(blk));
}

// ===========================================================================
abschnitt('5. Ernstfall-Mail (der letzte Plan B)');
{
    pruef('esl_mail_report.ps1 kennt den Alarm-Betrieb', /\[string\]\$Alarm/.test(mail));
    pruef('...laeuft VOR der Report-Suche (im Stoerfall gibt es keinen Report)', (() => {
        // Auf ECHTEN Code pruefen, nicht auf "ESL-Report-*" - das steht auch im
        // Kommentar des Parameterblocks weit oben (Fallstrick 18: die eigene
        // Erklaerung wird zum Messobjekt).
        const iAlarm = mail.indexOf('if ($Alarm) {');
        const iSuche = mail.indexOf('Get-ChildItem');
        return iAlarm > -1 && iSuche > -1 && iAlarm < iSuche;
    })());
    pruef('...loest Empfaenger vor dem Senden auf (sonst blockierender Dialog)',
        /if \(\$Alarm\)[\s\S]{0,1200}ResolveAll/.test(mail));
    pruef('Starter hat PruefeWatchdogAlarm', /function PruefeWatchdogAlarm/.test(cmd));
    pruef('...wird im Dauertakt gerufen', /PruefeWatchdogAlarm \$alle/.test(cmd));
    const pw = cmd.slice(cmd.indexOf('function PruefeWatchdogAlarm'), cmd.indexOf('function SchickeStundenmail'));
    pruef('...liest window.rcWdAlarm am Dashboard', /rcWdAlarm/.test(pw));
    pruef('...meldet EINE Mail je Stoerung, nicht je Takt', /letzterAlarm/.test(pw));
    pruef('...mit Deckel je Starterlauf', /AlarmMailsMax/.test(pw));
    pruef('...und gibt die Kennung frei, wenn die Stoerung behoben ist',
        /letzterAlarm = ''/.test(pw));
    pruef('...laeuft im EIGENEN Prozess mit Zeitlimit (Outlook kann blockieren)',
        /Start-Process[\s\S]{0,400}WaitForExit/.test(pw));
    // Der Alarm haengt NICHT am Mailfenster 7-20 Uhr: eine Stoerung um 03:00
    // muss um 03:00 melden.
    pruef('Alarm ist unabhaengig vom Stunden-Mailfenster',
        !/MailVonStunde/.test(pw) && !/MailAbMinute/.test(pw));
}

// ===========================================================================
abschnitt('6. Konsolen-Wege (Fallstrick 17)');
{
    pruef('rcWatchdog() zeigt den Zustand', /window\.rcWatchdog\s*=/.test(nackt));
    pruef('rcWatchdogReset() setzt zurueck', /window\.rcWatchdogReset\s*=/.test(nackt));
    // ROHTEXT: 'rcWdAlarmBar' ist ein Element-ID in einer ZEICHENKETTE, und
    // ohneKommentare loescht Zeichenketten per Bauart. Faustregel: nach Code
    // (Aufrufe, Reihenfolge) im kommentarfreien Text suchen, nach Namen in
    // Zeichenketten (IDs, Speicherschluessel, Klassennamen) im Rohtext.
    const r = schneideAus(src, 'window.rcWatchdogReset = function()');
    pruef('...inklusive Reload-Deckel und Alarm-Streifen',
        /removeItem/.test(r) && /rcWdAlarmBar/.test(r));
}

// ===========================================================================
abschnitt('7. Der Alarm-Streifen darf nichts verdecken');
{
    const a = ohneKommentare(schneideAus(src, 'function rcWdAlarmAnzeigen()'));
    // Lehre vom 05.08.: absolut positionierte Banner verdeckten die Kopfleiste.
    pruef('Streifen liegt im Fluss (insertBefore), nicht absolut',
        /insertBefore/.test(a) && !/position:\s*absolute/.test(a));
    pruef('...und verschwindet, wenn kein Alarm mehr ansteht', /remove\(\)/.test(a));
}

console.log('\n===========================================');
console.log('  ' + ok + ' bestanden, ' + fehler + ' FEHLGESCHLAGEN');
console.log('===========================================');
process.exit(fehler ? 1 : 0);
