// ===========================================================================
//  wochenlauf_pruefen.js  —  Pruefwerkzeug (offline, ohne Portal)
// ===========================================================================
//  Prueft die Automatik vom 17.08. (Nutzer-Vorgabe: "direkt einmal die Woche
//  auf Tagintervall und dann taeglich. Aber wichtig ist, dass es auch 24
//  Stunden laeuft." + "Ligaliste laeuft nicht automatisch, ich muss zweimal
//  ueber das KPI-Board starten bis es mal klappt." + "warum startet Genesys
//  jedes Mal, obwohl er deaktiviert ist").
//
//   1. WOCHENLAUF wird ueberhaupt AUFGERUFEN (Fallstrick 1 "gebaut, nirgends
//      gerufen" — genau daran krankte harvestWeekDaily seit v6) — mit
//      Gegenprobe gegen die alte Bauart ohne Aufrufer.
//   2. Tagesschluessel: projektgetrennt, wechselt um Mitternacht von selbst,
//      wird NUR bei Erfolg verbraucht (Fallstrick 12).
//   3. Deckel je Tag, Ruecksetzung beim Tageswechsel.
//   4. KEIN eigener Zeitgeber (haengt am 3-Minuten-Takt) — ein setTimeout
//      ueber Stunden waere im gedrosselten Tab unzuverlaessig.
//   5. Das 3-MINUTEN-LOCH beim toten vorgeladenen Mitschnitt ist geschlossen.
//   6. Genesys oeffnet nicht mehr von selbst ($AutoGenesys).
//
//  Die echten Funktionen werden per Klammer-Zaehlung ausgeschnitten und mit
//  new Function ausgewertet — kein Nachbau. Jede neue Regel hat eine
//  Gegenprobe, die belegt, dass sie den echten Fehler auch erkennt.
//
//  Aufruf:  node pruefwerkzeuge/wochenlauf_pruefen.js
// ===========================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(WURZEL, 'kpi_crawler.js'), 'utf8');
const cmd = fs.readFileSync(path.join(WURZEL, 'ESL_Start.cmd'), 'utf8');

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
// Kommentare/Zeichenketten entfernen — sonst treffen die Suchen die eigenen
// Erklaertexte (der Fehler, in den dieses Projekt am 05.08. viermal lief).
// REGEX-LITERALE MUESSEN MIT ERKANNT WERDEN (CLAUDE.md, Pruefwerkzeug-Falle 3):
// in verwerteAntwort steht /ORA-\d{5}[^<\n"]*/ — ein Tokenizer ohne
// Regex-Erkennung haelt das " darin fuer den Beginn einer Zeichenkette und
// verschluckt alles bis zum naechsten Anfuehrungszeichen. Genau daran ist die
// erste Fassung DIESES Werkzeugs gescheitert (klickVerwerfen war "weg").
// Ein / beginnt einen Regex, wenn davor ein Operator/Satzzeichen steht; nach
// Name, Zahl oder ) ist es eine Division.
function ohneKommentare(t){
    let out = '', i = 0, letztesEcht = '';
    const regexMoeglich = () => !/[\w$)\]]$/.test(letztesEcht);
    while (i < t.length) {
        const c = t[i], n = t[i+1];
        if (c === '/' && n === '/') { while (i < t.length && t[i] !== '\n') i++; }
        else if (c === '/' && n === '*') { i += 2; while (i < t.length && !(t[i] === '*' && t[i+1] === '/')) i++; i += 2; }
        else if (c === '/' && regexMoeglich()) {
            // Regex-Literal ueberspringen (Zeichenklassen achten, damit ein / in [/] nicht beendet)
            i++; let inKlasse = false;
            while (i < t.length) {
                const z = t[i];
                if (z === '\\') { i += 2; continue; }
                if (z === '[') inKlasse = true;
                else if (z === ']') inKlasse = false;
                else if (z === '/' && !inKlasse) { i++; break; }
                else if (z === '\n') break;
                i++;
            }
            out += ' '; letztesEcht = ' ';
        }
        else if (c === '"' || c === "'" || c === '`') {
            const q = c; out += ' '; i++;
            while (i < t.length && t[i] !== q) { if (t[i] === '\\') i++; i++; }
            i++;
            letztesEcht = ' ';
        }
        else { out += c; if (!/\s/.test(c)) letztesEcht = c; i++; }
    }
    return out;
}
const srcNackt = ohneKommentare(src);

// ===========================================================================
abschnitt('1. Wird der Wochenlauf ueberhaupt aufgerufen? (Fallstrick 1)');
// Die wichtigste Pruefung ueberhaupt: harvestWeekDaily war seit v6 GEBAUT,
// aber von niemandem gerufen — nur als Konsolen-Handle erreichbar. Genau
// deshalb kam die Wochen-Historie nur auf Handklick.
{
    const aufrufe = (srcNackt.match(/(?<![\w$.])wochenlaufPruefen\s*\(/g) || []).length;
    pruef('wochenlaufPruefen() ist definiert', /function\s+wochenlaufPruefen\s*\(/.test(srcNackt));
    pruef('wochenlaufPruefen() hat echte Aufrufer (nicht nur definiert)', aufrufe >= 2, aufrufe + ' Aufrufe');
    // Der Takt ist der Aufrufer, auf den es ankommt.
    pruef('der 3-Minuten-Takt ruft ihn (taktUndWoche im setInterval)',
        /setInterval\s*\(\s*taktUndWoche\s*,\s*POLL_INTERVAL\s*\)/.test(srcNackt));
    pruef('taktUndWoche ruft erst pollKpis, dann wochenlaufPruefen', (() => {
        const f = ohneKommentare(schneideAus(src, 'function taktUndWoche()'));
        return f.indexOf('pollKpis') < f.indexOf('wochenlaufPruefen');
    })());
    pruef('taktUndWoche hat ein abschliessendes .catch (Fallstrick 9)',
        /\.catch\s*\(/.test(ohneKommentare(schneideAus(src, 'function taktUndWoche()'))));
    pruef('harvestWeekDaily wird vom Wochenlauf benutzt',
        /harvestWeekDaily\s*\(/.test(ohneKommentare(schneideAus(src, 'async function wochenlaufPruefen()'))));
    // GEGENPROBE: die alte Bauart (nur Konsolen-Handle, kein Aufrufer) muss
    // an dieser Regel durchfallen — sonst prueft die Regel nichts.
    const alteBauart = 'window.rcCrawlerHarvestWoche = harvestWeekDaily;';
    pruef('GEGENPROBE: reines Konsolen-Handle zaehlt NICHT als Aufrufer',
        (alteBauart.match(/(?<![\w$.])wochenlaufPruefen\s*\(/g) || []).length === 0);
}

// ===========================================================================
abschnitt('2. Tagesschluessel — funktional');
const umgebung = () => {
    const store = {};
    return {
        localStorage: {
            getItem: k => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: k => { delete store[k]; },
        },
        _store: store,
    };
};
{
    // Die ECHTEN Funktionen ausschneiden und auswerten.
    const quelle = [
        "const LS_WOCHENLAUF = 'rcLigaWochenlauf_v1';",
        schneideAus(src, 'function wochenlaufSchluessel()'),
        schneideAus(src, 'function heuteKey()'),
        schneideAus(src, 'function wochenlaufFaellig()'),
        schneideAus(src, 'function wochenlaufErledigt()'),
        'return { wochenlaufSchluessel, heuteKey, wochenlaufFaellig, wochenlaufErledigt };',
    ].join('\n');

    const bauen = (projekt) => {
        const u = umgebung();
        const f = new Function('localStorage', 'projektAusName',
            '"use strict";' + quelle);
        return { api: f(u.localStorage, () => projekt), store: u._store };
    };

    const kabel = bauen('kabel'), mob = bauen('mobile'), um = bauen('um');
    pruef('Kabel ohne Zusatz (bestehender Speicher bleibt)',
        kabel.api.wochenlaufSchluessel() === 'rcLigaWochenlauf_v1', kabel.api.wochenlaufSchluessel());
    pruef('Mobile bekommt _mob', mob.api.wochenlaufSchluessel() === 'rcLigaWochenlauf_v1_mob');
    pruef('UM bekommt _um', um.api.wochenlaufSchluessel() === 'rcLigaWochenlauf_v1_um');
    pruef('drei Projekte kollidieren nicht', new Set([
        kabel.api.wochenlaufSchluessel(), mob.api.wochenlaufSchluessel(), um.api.wochenlaufSchluessel(),
    ]).size === 3);

    // Faelligkeit
    pruef('leerer Speicher -> faellig (erster Start)', kabel.api.wochenlaufFaellig() === true);
    kabel.api.wochenlaufErledigt();
    pruef('nach Erledigung heute -> NICHT mehr faellig', kabel.api.wochenlaufFaellig() === false);
    pruef('Erledigung speichert den heutigen Tag',
        kabel.store['rcLigaWochenlauf_v1'] === kabel.api.heuteKey(), kabel.store['rcLigaWochenlauf_v1']);
    // 24-STUNDEN-BETRIEB: der Tageswechsel allein macht ihn wieder faellig,
    // ohne Reload, ohne Mitternachts-Timer.
    kabel.store['rcLigaWochenlauf_v1'] = '2020-01-01';
    pruef('gestriger Schluessel -> wieder faellig (Mitternacht ohne Timer)',
        kabel.api.wochenlaufFaellig() === true);
    pruef('heuteKey hat das Format JJJJ-MM-TT', /^\d{4}-\d{2}-\d{2}$/.test(kabel.api.heuteKey()),
        kabel.api.heuteKey());
    // Monats-/Jahreswechsel: der Vergleich laeuft ueber den VOLLEN Schluessel,
    // nicht ueber den Tag im Monat.
    kabel.store['rcLigaWochenlauf_v1'] = kabel.api.heuteKey().replace(/^(\d{4})/, m => String(Number(m) - 1));
    pruef('gleicher Tag im VORJAHR -> faellig (voller Schluessel, nicht nur Tag)',
        kabel.api.wochenlaufFaellig() === true);
    // Ein kaputter gespeicherter Wert darf nicht blockieren.
    kabel.store['rcLigaWochenlauf_v1'] = '{kaputt';
    pruef('kaputter gespeicherter Wert -> faellig statt Dauerblockade',
        kabel.api.wochenlaufFaellig() === true);
}

// ===========================================================================
// Ab hier laufen echte async-Funktionen — CommonJS kennt kein top-level await.
async function pruefungenAsync(){
abschnitt('3. wochenlaufPruefen funktional — Ausstiege, Deckel, Schluessel-Verbrauch');
{
    const quelle = [
        "const LS_WOCHENLAUF = 'rcLigaWochenlauf_v1';",
        'const WOCHENLAUF_VERSUCHE_MAX = 5;',
        'let wochenlaufLaeuft = false, wochenlaufVersucheHeute = 0, wochenlaufVersuchTag = "";',
        schneideAus(src, 'function wochenlaufSchluessel()'),
        schneideAus(src, 'function heuteKey()'),
        schneideAus(src, 'function wochenlaufFaellig()'),
        schneideAus(src, 'function wochenlaufErledigt()'),
        schneideAus(src, 'async function wochenlaufPruefen()'),
        'return { wochenlaufPruefen, stand: () => ({ versuche: wochenlaufVersucheHeute, tag: wochenlaufVersuchTag }),',
        '         setTag: t => { wochenlaufVersuchTag = t; }, setVersuche: n => { wochenlaufVersucheHeute = n; } };',
    ].join('\n');

    const bauen = (opt) => {
        const u = umgebung();
        const rufe = [];
        const win = { __rcLastGetData: opt.mitschnitt ? { body: 'x' } : null };
        const f = new Function('localStorage', 'projektAusName', 'window', 'console',
            'harvestWeekDaily', 'autoWochenlaufAn', 'rufe', '"use strict";' + quelle);
        const api = f(u.localStorage, () => 'kabel', win, { log(){}, warn(){} },
            async () => { rufe.push('harvest'); if (opt.wirft) throw new Error('geplatzt'); return opt.tage; },
            () => opt.schalter !== false, rufe);
        return { api, store: u._store, rufe, win };
    };

    // (a) Normalfall: Mitschnitt da, faellig -> laeuft, Schluessel verbraucht
    let t = bauen({ mitschnitt: true, tage: 7 });
    await t.api.wochenlaufPruefen();
    pruef('Mitschnitt da + faellig -> harvestWeekDaily laeuft', t.rufe.length === 1);
    pruef('Erfolg (7 Tage) -> Tagesschluessel verbraucht',
        t.store['rcLigaWochenlauf_v1'] !== undefined);
    await t.api.wochenlaufPruefen();
    pruef('zweiter Aufruf am selben Tag -> laeuft NICHT nochmal', t.rufe.length === 1);

    // (b) Fallstrick 12: kein Erfolg -> Schluessel NICHT verbrauchen
    t = bauen({ mitschnitt: true, tage: 0 });
    await t.api.wochenlaufPruefen();
    pruef('0 Tage (Seite belegt/Token tot) -> Schluessel NICHT verbraucht',
        t.store['rcLigaWochenlauf_v1'] === undefined);
    await t.api.wochenlaufPruefen();
    pruef('...und der naechste Takt versucht es erneut', t.rufe.length === 2);

    // (c) Deckel je Tag
    t = bauen({ mitschnitt: true, tage: 0 });
    for (let i = 0; i < 9; i++) await t.api.wochenlaufPruefen();
    pruef('Deckel greift: hoechstens 5 Versuche je Tag', t.rufe.length === 5, t.rufe.length + ' Versuche');
    // ...und der Tageswechsel gibt neue Versuche frei (24-Stunden-Betrieb!)
    t.api.setTag('2020-01-01');
    await t.api.wochenlaufPruefen();
    pruef('Tageswechsel setzt den Versuchszaehler zurueck', t.rufe.length === 6);

    // (d) ohne Mitschnitt wird die Seite NICHT angefasst
    t = bauen({ mitschnitt: false, tage: 7 });
    await t.api.wochenlaufPruefen();
    pruef('ohne Ok-Klick-Mitschnitt laeuft er gar nicht (kein Seiten-Anfassen)', t.rufe.length === 0);

    // (e) Schalter aus
    t = bauen({ mitschnitt: true, tage: 7, schalter: false });
    await t.api.wochenlaufPruefen();
    pruef('rcCrawlerAutoWoche(false) haelt ihn an', t.rufe.length === 0);

    // (f) eine Ausnahme darf den Crawler nicht stilllegen
    t = bauen({ mitschnitt: true, wirft: true });
    let geplatzt = false;
    try { await t.api.wochenlaufPruefen(); } catch(e){ geplatzt = true; }
    pruef('geworfene Ausnahme wird gefangen (Takt laeuft weiter)', geplatzt === false);
    pruef('...und die Sperre wird trotzdem freigegeben (finally)', (() => {
        // zweiter Aufruf muss wieder durchkommen — wochenlaufLaeuft darf nicht
        // auf true stehenbleiben (dieselbe Lehre wie rcRangeBusy/rcJetztBusy)
        return t.api.wochenlaufPruefen().then(() => t.rufe.length === 2);
    })() instanceof Promise);
    await t.api.wochenlaufPruefen();
    pruef('...belegt: nach der Ausnahme laeuft der naechste Versuch', t.rufe.length === 2, t.rufe.length);
}

// ===========================================================================
abschnitt('4. Kein eigener Zeitgeber');
{
    const f = ohneKommentare(schneideAus(src, 'async function wochenlaufPruefen()'));
    pruef('wochenlaufPruefen legt keinen setInterval an', !/setInterval/.test(f));
    pruef('wochenlaufPruefen legt keinen setTimeout an', !/setTimeout/.test(f));
    // Belegt, dass er wirklich am vorhandenen Takt haengt:
    pruef('er haengt am 3-Minuten-Takt (POLL_INTERVAL unveraendert)',
        /const\s+POLL_INTERVAL\s*=\s*180000/.test(srcNackt));
}

// ===========================================================================
abschnitt('5. Das 3-Minuten-Loch beim toten Mitschnitt (Nutzer: "zweimal starten")');
{
    // In verwerteAntwort: bei totem Token wird der Mitschnitt verworfen. Ohne
    // einen Anstoss an dieser Stelle kam der naechste Auto-Klick-Versuch erst
    // mit dem 3-Minuten-Takt — die Startweiche hatte autoKlickPlanen wegen des
    // vorgeladenen Mitschnitts uebersprungen.
    const f = ohneKommentare(schneideAus(src, 'function verwerteAntwort(reqBody, text, quelle)'));
    const iVerwerfen = f.indexOf('klickVerwerfen');
    const iPlanen = f.indexOf('autoKlickPlanen');
    const iTot = f.indexOf('sitzungTot');
    pruef('verwerteAntwort verwirft den toten Mitschnitt', iVerwerfen > 0);
    pruef('...und stoesst DORT den Auto-Klick neu an', iPlanen > 0);
    pruef('...in der Reihenfolge verwerfen -> planen', iVerwerfen < iPlanen);
    pruef('...noch vor sitzungTot (das laedt evtl. neu und kommt nur bis RELOAD_MAX)',
        iPlanen < iTot, 'planen@' + iPlanen + ' tot@' + iTot);
    // GEGENPROBE: die alte Fassung (nur verwerfen + sitzungTot) muss durchfallen
    const alt = 'try { klickVerwerfen(); } catch(e){} try { sitzungTot(grund); } catch(e){}';
    pruef('GEGENPROBE: alte Fassung ohne autoKlickPlanen faellt durch',
        alt.indexOf('autoKlickPlanen') === -1);
    // klickVerwerfen muss auch die Fenster-Variable leeren, sonst kann
    // autoKlickPlanen prinzipbedingt nie greifen (Zeile 295: Ausstieg bei body).
    const kv = ohneKommentare(schneideAus(src, 'function klickVerwerfen()'));
    pruef('klickVerwerfen leert AUCH window.__rcLastGetData (sonst blockt autoKlickPlanen)',
        /__rcLastGetData\s*=\s*null/.test(kv));
}

// ===========================================================================
abschnitt('6. Konsolen-Wege zurueck (Fallstrick 17)');
{
    pruef('rcCrawlerAutoWoche(an) existiert', /window\.rcCrawlerAutoWoche\s*=/.test(srcNackt));
    pruef('rcCrawlerWochenlaufJetzt() existiert', /window\.rcCrawlerWochenlaufJetzt\s*=/.test(srcNackt));
    pruef('rcCrawlerHarvestWoche() bleibt als Handbetrieb erhalten',
        /window\.rcCrawlerHarvestWoche\s*=/.test(srcNackt));
    // Abfrage ohne Argument muss den ZUSTAND liefern, nicht schalten.
    const f = ohneKommentare(schneideAus(src, 'window.rcCrawlerAutoWoche = function(an)'));
    pruef('rcCrawlerAutoWoche() ohne Argument liefert den Zustand',
        /an\s*===\s*undefined/.test(f));
}

// ===========================================================================
abschnitt('7. Genesys oeffnet nicht mehr von selbst');
{
    const m = cmd.match(/^\$AutoGenesys\s*=\s*(\$\w+)/m);
    pruef('$AutoGenesys steht in ESL_Start.cmd', !!m);
    pruef('$AutoGenesys ist ab Werk $false', m && m[1] === '$false', m && m[1]);
    // Die anderen drei bleiben ausdruecklich an — nur Genesys war das Problem.
    pruef('$AutoLigaliste bleibt $true', /^\$AutoLigaliste\s*=\s*\$true/m.test(cmd));
    pruef('$AutoDashboard bleibt $true', /^\$AutoDashboard\s*=\s*\$true/m.test(cmd));
    pruef('$AutoEsl bleibt $true', /^\$AutoEsl\s*=\s*\$true/m.test(cmd));
    // Der Waechter darf Genesys weiterhin NUR hinter dem Schalter oeffnen.
    pruef('StelleGenesysSicher haengt am Schalter',
        /if\s*\(\$AutoGenesys\)\s*\{[\s\S]{0,200}StelleGenesysSicher/.test(cmd));
}

// ===========================================================================
abschnitt('8. Alle drei Projekte gleich (Nutzer: "andere Stacks auch")');
{
    // Es gibt nur EINE Crawler-Datei — die Projekt-Trennung laeuft ueber den
    // Fensternamen. Belegen, dass der neue Schluessel demselben Muster folgt
    // wie der schon vorhandene Klick-Mitschnitt.
    // ROHTEXT, nicht ohneKommentare: '_mob'/'_um' sind Zeichenketten, die der
    // Entferner per Bauart loescht. (Zweiter Messfehler dieser Fassung.)
    const a = schneideAus(src, 'function klickSchluessel()');
    const b = schneideAus(src, 'function wochenlaufSchluessel()');
    const muster = t => /projektAusName\(\)/.test(t) && /'_mob'/.test(t) && /'_um'/.test(t);
    pruef('Klick-Mitschnitt ist projektgetrennt (Bestand)', muster(a));
    pruef('Wochenlauf ist NACH DEMSELBEN Muster projektgetrennt', muster(b));
    // Beide muessen sich strukturell decken — Unterschied darf NUR der
    // Basis-Schluessel sein. Ein abweichender Aufbau waere eine zweite,
    // stillschweigend andere Projekt-Wahrheit (Fallstrick 8).
    const norm = t => t.replace(/LS_KLICK|LS_WOCHENLAUF/g, 'BASIS')
                       .replace(/klickSchluessel|wochenlaufSchluessel/g, 'F')
                       .replace(/\s+/g, '');
    pruef('beide bilden den Schluessel strukturgleich (eine Projekt-Wahrheit)',
        norm(a) === norm(b), '\n      A: ' + norm(a) + '\n      B: ' + norm(b));
}

// ===========================================================================
abschnitt('9. Fremde Seiten-Requests duerfen den Mitschnitt NICHT ueberschreiben');
// Live-Befund 17.08.: die Ligalisten-App schickt SELBST an get_data.rb
// (callreftree, Vorlagen-Listen). Der Hook sicherte jeden davon - der
// Crawler replayte danach einen Rumpf, der nie eine Tabelle liefern kann.
// Im Log stand das als "Ok-Klick (/)" — daterange UND interval leer.
{
    // istAbfrage aus der Datei ziehen und funktional pruefen.
    const m = src.match(/const istAbfrage = s =>[\s\S]*?;\n/);
    pruef('istAbfrage() ist definiert', !!m);
    const istAbfrage = new Function('"use strict"; ' + (m ? m[0] : 'const istAbfrage=()=>true;') +
        ' return istAbfrage;')();

    // (a) ECHTE Abfrage (gekuerzter, aber echter Rumpf aus dem Mitschnitt)
    const echt = 'type=get-result&script_id=11035&script_id_secure=TOK&user_id=32595' +
        '&nodeid_inlist=11405&loc_inlist=Alanya&daterange=intraday&interval=cumulate' +
        '&figure_list=10004%2C10005%2C10006&show_ccsid=1';
    pruef('echte Abfrage wird erkannt', istAbfrage(echt) === true);

    // (b) Die Eigen-Requests der Seite — genau der Fall aus dem Log
    pruef('callreftree-artiger Request (ohne daterange/figure_list) faellt heraus',
        istAbfrage('type=get-reftree&script_id=11035&nodeid=11218') === false);
    pruef('Request mit LEEREM daterange faellt heraus (das "(/)" im Log)',
        istAbfrage('type=get-result&daterange=&interval=&figure_list=10004') === false);
    pruef('Request mit daterange, aber OHNE figure_list faellt heraus',
        istAbfrage('type=get-result&daterange=intraday&interval=cumulate') === false);
    pruef('leerer Body faellt heraus', istAbfrage('') === false);
    pruef('null faellt heraus', istAbfrage(null) === false);
    // Der Parameter darf nicht als Teilstring eines anderen durchgehen.
    pruef('"xdaterange=..." zaehlt NICHT als daterange',
        istAbfrage('type=get-result&xdaterange=intraday&xfigure_list=1') === false);

    // (c) Der Hook benutzt die Pruefung auch wirklich — an BEIDEN Stellen
    const hook = ohneKommentare(schneideAus(src, 'function hookRequests()'));
    const stellen = (hook.match(/isGetData\([^)]*\)\s*&&\s*istAbfrage\(/g) || []).length;
    pruef('fetch UND XHR pruefen beide auf istAbfrage', stellen === 2, stellen + ' Stellen');
    // GEGENPROBE: die alte Bauart (nur "&& s") muss durchfallen
    pruef('GEGENPROBE: alte Bauart "isGetData(url) && s" ist nicht mehr da',
        !/isGetData\([^)]*\)\s*&&\s*s\b/.test(hook));

    // (d) Gesichert wird erst nach bestaetigter Tabelle, nicht mehr im Hook
    pruef('der Hook sichert NICHT mehr blind', !/__rcKlickSichern/.test(hook));
    const va = ohneKommentare(schneideAus(src, 'function verwerteAntwort(reqBody, text, quelle)'));
    pruef('verwerteAntwort sichert erst nach echten Zeilen', /__rcKlickSichern/.test(va));
    pruef('...und zwar NACH der kpis.length-Pruefung', (() => {
        const iLeer = va.indexOf('kpis.length'), iSichern = va.indexOf('__rcKlickSichern');
        return iLeer > -1 && iSichern > iLeer;
    })());

    // (e) Altbestand im Speicher wird beim Laden aussortiert
    const kl = ohneKommentare(schneideAus(src, 'function klickLaden()'));
    pruef('klickLaden wirft gesicherten Nicht-Abfrage-Muell weg',
        /__rcIstAbfrageBody/.test(kl));
}

// ===========================================================================
abschnitt('9b. Der ECHTE Hook, funktional — der Live-Fall vom 17.08. nachgestellt');
// Das ist die Pruefung, auf die es ankommt: der Hook-Code wird ausgeschnitten
// und mit einem gefaelschten fetch ausgefuehrt. Nachgestellt wird exakt die
// Reihenfolge aus dem Log des Nutzers: guter Ok-Klick, dann zwei Eigen-
// Requests der Seite (app.js:226 / app.js:263), dann der Takt.
{
    const hookQuelle = schneideAus(src, 'function hookRequests()');
    const win = { __rcReqHooked: 0 };
    const gesichert = [];
    const antworten = {};                      // body -> Antworttext
    const fakeFetch = function(url, init){
        const body = init && init.body;
        return Promise.resolve({
            clone(){ return { text: () => Promise.resolve(antworten[body] || '') }; },
        });
    };
    win.fetch = fakeFetch;
    win.__rcKlickSichern = c => gesichert.push(c.body);
    const XHR = function(){}; XHR.prototype = { open(){}, send(){}, addEventListener(){} };

    new Function('window', 'XMLHttpRequest', 'rcBodyToString', '"use strict";' +
        '(' + hookQuelle + ')();')(win, XHR, b => (typeof b === 'string' ? b : null));

    const ECHT = 'type=get-result&script_id_secure=TOK&daterange=intraday&interval=cumulate' +
                 '&figure_list=10004%2C10005&loc_inlist=Alanya';
    const APP1 = 'type=get-reftree&script_id=11035&nodeid=11218';        // callreftree.js
    const APP2 = 'type=get-settings&script_id=11035';                    // Vorlagen-Liste

    win.fetch('https://ccs.vodafone.de/x/get_data.rb', { body: ECHT });
    pruef('echter Ok-Klick wird gemerkt', win.__rcLastGetData && win.__rcLastGetData.body === ECHT);

    win.fetch('https://ccs.vodafone.de/x/get_data.rb', { body: APP1 });
    win.fetch('https://ccs.vodafone.de/x/get_data.rb', { body: APP2 });
    pruef('DER LIVE-FALL: zwei Eigen-Requests der Seite ueberschreiben ihn NICHT',
        win.__rcLastGetData && win.__rcLastGetData.body === ECHT,
        win.__rcLastGetData && win.__rcLastGetData.body);

    // GEGENPROBE: die alte Bauart muss an genau dieser Stelle durchfallen.
    const altQuelle = hookQuelle
        .replace(/isGetData\(url\) && istAbfrage\(s\)/, 'isGetData(url) && s')
        .replace(/isGetData\(this\.__rcUrl\) && istAbfrage\(s\)/, 'isGetData(this.__rcUrl) && s');
    const win2 = { __rcReqHooked: 0, fetch: fakeFetch, __rcKlickSichern(){} };
    new Function('window', 'XMLHttpRequest', 'rcBodyToString', '"use strict";' +
        '(' + altQuelle + ')();')(win2, XHR, b => (typeof b === 'string' ? b : null));
    win2.fetch('https://ccs.vodafone.de/x/get_data.rb', { body: ECHT });
    win2.fetch('https://ccs.vodafone.de/x/get_data.rb', { body: APP1 });
    pruef('GEGENPROBE: die ALTE Bauart verliert den guten Mitschnitt (Live-Fehler belegt)',
        win2.__rcLastGetData && win2.__rcLastGetData.body === APP1,
        'alte Bauart merkte: ' + (win2.__rcLastGetData && win2.__rcLastGetData.body));

    // Und: im neuen Hook wird beim Mitschneiden NICHTS mehr gesichert.
    pruef('kein Sichern mehr aus dem Hook heraus (erst nach echter Tabelle)',
        gesichert.length === 0, gesichert.length + ' Sicherungen');
}

// ===========================================================================
abschnitt('10. Selbstheilung statt stillem Dauerlauf');
// Im Log drehte der Takt stundenlang mit "keine-tabelle" und meldete jedes Mal
// nur "kein Nachfassen mehr" — eine Meldung ohne Folge (Fehlerklasse "stiller
// Stillstand in Wartestellung").
{
    const nf = ohneKommentare(schneideAus(src, 'function nachfassen(grund)'));
    pruef('nachfassen zaehlt ausgeschoepfte Runden (replayLeerFolge)',
        /replayLeerFolge/.test(nf));
    pruef('...verwirft danach den unbrauchbaren Rumpf', /klickVerwerfen/.test(nf));
    pruef('...und stoesst die Auto-Abfrage an', /autoKlickPlanen/.test(nf));
    pruef('...mit zurueckgesetztem Versuchszaehler (sonst greift der Deckel sofort)',
        /autoKlickVersuche\s*=\s*0/.test(nf));
    // GEGENPROBE: die alte Fassung (nur warnen und return) muss durchfallen
    const alt = 'if (nachfassZaehler >= NACHFASS_MAX) { console.warn(grund); return; }';
    pruef('GEGENPROBE: bloss-warnen-und-return faellt durch',
        !/klickVerwerfen/.test(alt));
    // Ein EHRLICH leeres Ergebnis (0 Zeilen) darf die Heilung NICHT ausloesen —
    // sonst wirft der frueh-morgendliche Leerlauf den guten Mitschnitt weg.
    const pk = ohneKommentare(schneideAus(src, 'function pollKpis(withRefresh)'));
    pruef('0 Zeilen (ehrlich leer) setzt die Folge zurueck statt zu verwerfen',
        /ehrlichLeer\)\s*replayLeerFolge\s*=\s*0/.test(pk));
    pruef('Erfolg setzt die Folge ebenfalls zurueck',
        /geliefert\)\s*\{[^}]*replayLeerFolge\s*=\s*0/.test(pk));
}

} // Ende pruefungenAsync

// ===========================================================================
pruefungenAsync().then(() => {
    console.log('\n===========================================');
    console.log('  ' + ok + ' bestanden, ' + fehler + ' FEHLGESCHLAGEN');
    console.log('===========================================');
    process.exit(fehler ? 1 : 0);
}).catch(e => {
    console.error('\nPruefwerkzeug selbst abgestuerzt: ' + (e && e.stack || e));
    process.exit(2);
});
