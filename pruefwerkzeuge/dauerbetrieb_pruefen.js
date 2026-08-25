// ===========================================================================
//  dauerbetrieb_pruefen.js  —  Pruefwerkzeug (offline, ohne Portal)
// ===========================================================================
//  Prueft den Umbau vom 17.08. fuer den unbeaufsichtigten Dauerbetrieb.
//  Nutzer-Befund: "Wenn im Browser was passiert - ein Download, oder ein
//  Fenster bleibt offen - dann aktualisiert er nicht mehr. Das Dashboard muss
//  sich auch im Hintergrund immer wieder aktualisieren."
//
//   1. DIALOG-WAECHTER: ein offener alert/confirm haelt JS komplett an UND
//      blockiert jedes Runtime.evaluate - der Starter kaeme selbst nicht mehr
//      heran. Er muss ihn also gerade dann schliessen, wenn er auf eine
//      Antwort wartet, die deswegen nicht kommen kann.
//   2. DOWNLOADS ohne Rueckfrage (vier Dateien je Stunde).
//   3. HERZSCHLAG von aussen - unabhaengig von jeder Browser-Drosselung.
//   4. SPEICHER-WAECHTER: stufenweise aufraeumen, BEVOR Citrix pauschal
//      alles verwirft (Befund 12.08.).
//
//  Aufruf:  node pruefwerkzeuge/dauerbetrieb_pruefen.js
// ===========================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(WURZEL, 'esl_live_arena_v22.js'), 'utf8');
const cmd = fs.readFileSync(path.join(WURZEL, 'ESL_Start.cmd'), 'utf8');
const lese = fs.readFileSync(path.join(WURZEL, 'Dashboard_Lesezeichen.html'), 'utf8');

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
// PowerShell-Funktion ausschneiden (Klammer-Zaehlung wie oben, aber ab "function X(").
function psFunktion(name){
    const start = cmd.indexOf('function ' + name + '(');
    if (start < 0) return '';
    let tiefe = 0, i = cmd.indexOf('{', start);
    for (; i < cmd.length; i++) {
        if (cmd[i] === '{') tiefe++;
        else if (cmd[i] === '}') { tiefe--; if (tiefe === 0) return cmd.slice(start, i + 1); }
    }
    return '';
}

// ===========================================================================
abschnitt('1. Dialog-Waechter (das "offene Fenster")');
{
    const f = psFunktion('AnkerDialogPruefen');
    pruef('AnkerDialogPruefen existiert', !!f);
    pruef('...reagiert auf Page.javascriptDialogOpening', /javascriptDialogOpening/.test(f));
    pruef('...schliesst mit Page.handleJavaScriptDialog', /handleJavaScriptDialog/.test(f));
    // accept=false: bei confirm "Abbrechen", bei beforeunload "auf der Seite
    // bleiben". Zustimmen koennte ungewollt eine Seite verwerfen.
    pruef('...mit accept = $false (keine ungewollte Aktion, kein Seitenverlust)',
        /accept\s*=\s*\$false/.test(f));
    pruef('...und meldet es sichtbar (sonst verschwindet die Ursache spurlos)',
        /Warn\s/.test(f));

    // Er muss an BEIDEN Lesestellen haengen.
    const saugen = psFunktion('AnkerSaugen');
    const antwort = psFunktion('AnkerAntwort');
    pruef('AnkerSaugen prueft die Ereignisse', /AnkerDialogPruefen/.test(saugen));
    pruef('AnkerSaugen dekodiert sie ueberhaupt erst (vorher wurden sie verworfen)',
        /GetString/.test(saugen));
    pruef('AnkerAntwort prueft sie AUCH — dort ist es am wichtigsten',
        /AnkerDialogPruefen/.test(antwort),
        'Bei offenem Dialog laeuft jedes evaluate in sein Zeitlimit; wird die Meldung ' +
        'nur uebersprungen, bleibt der Dialog fuer immer stehen.');
    // GEGENPROBE: die alte Fassung (Strom nur leeren) muss durchfallen.
    const alt = 'if (-not $t.Wait(1)) { return }\n$AnkerLesen[$id] = $null';
    pruef('GEGENPROBE: blosses Leeren des Ereignisstroms faellt durch',
        !/AnkerDialogPruefen/.test(alt));
}

// ===========================================================================
abschnitt('2. Downloads ohne Rueckfrage');
{
    const f = psFunktion('AnkerSetzen');
    pruef('setDownloadBehavior wird gesetzt', /setDownloadBehavior/.test(f));
    pruef('...auf "allow"', /behavior\s*=\s*'allow'/.test(f));
    pruef('...mit festem Zielordner', /downloadPath/.test(f));
    // Ein aelteres Edge kennt den Befehl nicht - das darf den Anker nicht kosten.
    pruef('...in einem eigenen try (aelteres Edge darf den Anker nicht kosten)',
        /try\s*\{[\s\S]{0,500}setDownloadBehavior/.test(f));
    // Den TRY-BLOCK isolieren statt ein Zeichenfenster zu raten: das naechste
    // AnkerLoesen gehoert zum darauffolgenden, unabhaengigen Kommando
    // (addScriptToEvaluateOnNewDocument) und darf hier nicht mitgemessen werden.
    pruef('...ohne AnkerLoesen im Fehlerfall', (() => {
        const iD = f.indexOf('setDownloadBehavior');
        const iTry = f.lastIndexOf('try {', iD);
        const iEnd = f.indexOf('} catch', iD);
        if (iTry < 0 || iEnd < 0) return false;
        return f.slice(iTry, iEnd).indexOf('AnkerLoesen') === -1;
    })());
}

// ===========================================================================
abschnitt('3. Herzschlag von aussen');
{
    const f = psFunktion('Herzschlag');
    pruef('Herzschlag existiert', !!f);
    pruef('...wird im Dauertakt gerufen', /Herzschlag \$alle/.test(cmd));
    pruef('...hat einen eigenen Abstand (nicht bei jedem 20-s-Takt)',
        /HerzschlagAlleSek/.test(f) && /HerzschlagAlleSek/.test(cmd));
    pruef('...fragt das Alter BEIDER Quellen ab',
        /rcEslLastOk/.test(f) && /rcKpiLastUpdate/.test(f));
    // Ein laufender Excel-Export blockiert den Hauptthread ABSICHTLICH.
    pruef('...laesst einen laufenden Excel-Lauf in Ruhe (rcExportBusy)',
        /rcExportBusy/.test(f));
    pruef('...stoesst NUR an, statt selbst abzurufen (eine Wahrheit)',
        /rcJetztAktualisieren/.test(f) && !/holeExcelVomServer/.test(f) && !/get_data\.rb/.test(f));
    pruef('...tut in der Startphase nichts (noch nie Daten ist kein Stillstand)',
        /-lt 0 -and/.test(f));
    pruef('...ueberlaesst ein fehlendes Dashboard dem zustaendigen Waechter',
        /kein-dashboard/.test(f));
}

// ===========================================================================
abschnitt('4. Speicher-Waechter — stufenweise statt alles-oder-nichts');
{
    const f = schneideAus(src, 'function rcSpeicherWacht(erzwingen)');
    pruef('rcSpeicherWacht existiert', !!f);
    pruef('...wird im Takt gerufen', /rcSpeicherWacht\(false\)/.test(src));
    pruef('...misst mit einer ECHTEN Probe, nicht mit einer Schaetzung',
        /rcSpeicherFrei/.test(f));
    pruef('...tut nichts, solange Platz ist', /if \(rcSpeicherFrei\(\)\) return null/.test(f));
    // Reihenfolge: erst das Billigste opfern.
    const iProd = f.indexOf('rcKappeProdHistorie');
    const iHist = f.indexOf('rcSpeicherHistorieKappen');
    const iLog  = f.indexOf('rcLogbuchLeeren');
    const iBlob = f.indexOf('rcSpeicherBlobsWeg');
    pruef('Reihenfolge: Produktdetails -> Historie -> Logbuch -> Blobs',
        iProd > -1 && iProd < iHist && iHist < iLog && iLog < iBlob,
        [iProd, iHist, iLog, iBlob].join(' / '));
    pruef('...und hoert auf, sobald wieder Platz ist (nicht alles wegwerfen)',
        (f.match(/if \(rcSpeicherFrei\(\)\) return rcSpeicherFertig/g) || []).length >= 3);

    // DIE heikle Stelle: die Code-Blobs sind der Rueckfall des Lesezeichens.
    pruef('Lesezeichen nutzt die Blobs wirklich als Rueckfall (Beleg)',
        /localStorage\.getItem\('rcDashboardCode'\)/.test(lese));
    const b = schneideAus(src, 'function rcSpeicherBlobsWeg()');
    pruef('Blobs werden NUR bei vorhandenem __rcFiles geopfert',
        /rcSpeicherBlobsEntbehrlich/.test(b));
    const e = schneideAus(src, 'function rcSpeicherBlobsEntbehrlich()');
    pruef('...und "entbehrlich" heisst: der Starter liefert sie', /__rcFiles/.test(e));
    pruef('...sonst wird ausdruecklich gesagt, dass sie BEHALTEN wurden',
        /BEHALTEN/.test(f));

    // Funktional: Stufen und Abbruch.
    {
        const store = {};
        let vollAb = 0;      // ab dieser Belegung "voll"
        const env = {
            localStorage: {
                length: 0,
                key: i => Object.keys(store)[i],
                getItem: k => (k in store ? store[k] : null),
                setItem: (k, v) => {
                    const gesamt = Object.keys(store).reduce((s, x) => s + store[x].length, 0);
                    if (k === '__rcPlatzProbe' && gesamt > vollAb) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
                    store[k] = String(v);
                },
                removeItem: k => { delete store[k]; },
            },
            rcKey: s => s,
            pad2: n => String(n).padStart(2, '0'),
            rcLog: { warn(){} },
            rcKappeProdHistorie: h => { let n = 0; Object.keys(h).forEach(t => { if (h[t].byAgent) { Object.keys(h[t].byAgent).forEach(v => { if (h[t].byAgent[v].pg) { delete h[t].byAgent[v].pg; n++; } }); } }); return n; },
            window: {},
        };
        Object.defineProperty(env.localStorage, 'length', { get: () => Object.keys(store).length });
        env.window.rcLogEreignis = () => {};
        env.window.rcLogbuchLeeren = () => { delete store['rcLogbuch']; };

        const quelle = [
            'var RC_SP_TAGE = 60, RC_SP_PROBE = 51, RC_SP_LETZTE = 0, RC_SP_ABSTAND_MS = 600000;',
            schneideAus(src, 'function rcSpeicherFrei()'),
            schneideAus(src, 'function rcSpeicherBelegtKB()'),
            schneideAus(src, 'function rcSpeicherHistorieKappen(tage)'),
            schneideAus(src, 'function rcSpeicherBlobsEntbehrlich()'),
            schneideAus(src, 'function rcSpeicherBlobsWeg()'),
            schneideAus(src, 'function rcSpeicherWacht(erzwingen)'),
            schneideAus(src, 'function rcSpeicherFertig(getan, vorher)'),
            'return { rcSpeicherWacht, rcSpeicherHistorieKappen, rcSpeicherBlobsWeg, store: null };',
        ].join('\n');
        const api = new Function(...Object.keys(env), '"use strict";' + quelle)(...Object.values(env));

        // Historie mit alten und neuen Tagen
        const alt = '2020-01-01', neu = (() => { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })();
        store['rcEslHistory'] = JSON.stringify({ [alt]: { byAgent: { a: { pg: {x:1}, kip: 3 } } }, [neu]: { byAgent: { b: { kip: 5 } } } });
        const wegAlt = api.rcSpeicherHistorieKappen(60);
        pruef('alte Historien-Tage werden entfernt', wegAlt === 1, wegAlt + ' Tage');
        pruef('...der heutige Tag bleibt', JSON.parse(store['rcEslHistory'])[neu] !== undefined);

        // Blobs: ohne __rcFiles bleiben sie
        store['rcDashboardCode'] = 'x'.repeat(100);
        env.window.__rcFiles = null;
        pruef('ohne laufenden Starter bleiben die Code-Blobs liegen',
            api.rcSpeicherBlobsWeg() === 0 && store['rcDashboardCode'] !== undefined);
        env.window.__rcFiles = { dash: 'da' };
        pruef('mit __rcFiles duerfen sie weg', api.rcSpeicherBlobsWeg() === 1);
    }
}

// ===========================================================================
abschnitt('5. Konsolen-Wege');
{
    pruef('rcSpeicher() zeigt den Stand', /window\.rcSpeicher\s*=/.test(src));
    pruef('rcSpeicherAufraeumen() raeumt von Hand', /window\.rcSpeicherAufraeumen\s*=/.test(src));
}

console.log('\n===========================================');
console.log('  ' + ok + ' bestanden, ' + fehler + ' FEHLGESCHLAGEN');
console.log('===========================================');
process.exit(fehler ? 1 : 0);
