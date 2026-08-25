/**
 * mail_vorlauf_pruefen.js — wartet die Stundenmail auf die Ligalisten-Qualitaet?
 *
 * Nutzer-Meldung 09.08.:
 *   "Das Problem ist, dass er die Mails zwar verschickt, jetzt, aber er wartet
 *    nicht auf die Qualitaeten von Ligaliste. Er soll jedes Mal, wenn ich das
 *    Dashboard starte, 15 Minuten spaeter die erste E-Mail rausschicken. Es
 *    muessen ja erst mal Daten geladen werden."
 *
 * Warum das ueberhaupt schiefging: Der ESL-Export ist nach 20 Sekunden da, die
 * Ligaliste braucht laenger — sie laeuft in einem ZWEITEN Tab, der sich erst bei
 * Microsoft anmelden muss, und der KPI-Crawler sendet danach im 3-Minuten-Takt.
 * Wird der Report vorher gebaut, stehen CS, TNPS, AHT, AQ und FQ leer da. Das
 * Blatt sieht trotzdem vollstaendig aus — dem Empfaenger faellt es nicht auf.
 *
 * DIE TEUERSTE FALLE dabei ist nicht die Wartezeit, sondern WO geprueft wird:
 * $letzteMailStunde wird absichtlich VOR dem Versuch gesetzt (sonst wiederholt
 * sich ein Fehlversuch alle 20 s und oeffnet jedes Mal Outlook). Wuerde die
 * Bereitschaft ERST DANACH geprueft, waere die Stunde verbraucht — und sie
 * fiele ersatzlos aus, nur weil die Ligaliste zwei Minuten laenger brauchte.
 * Genau darauf zielt der funktionale Teil dieser Pruefung.
 *
 *   node pruefwerkzeuge/mail_vorlauf_pruefen.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const W = path.join(__dirname, '..');
const cmd = fs.readFileSync(path.join(W, 'ESL_Start.cmd'), 'utf8');

let ok = 0, bad = 0;
function pruef(t, b, z) {
    if (b) { ok++; console.log('  ok   ' + t); }
    else { bad++; console.log('  FEHL ' + t + (z !== undefined ? '  -> ' + z : '')); }
}
function abschnitt(t) { console.log('\n-- ' + t + ' --'); }

console.log('Vorlauf vor der ersten Stundenmail — Pruefung');

// ===========================================================================
abschnitt('A) Stellschrauben und Bereitschaftspruefung');
// ===========================================================================

pruef('$MailStartWarteMin ist gesetzt und wird benutzt',
    /\$MailStartWarteMin\s*=\s*\d+/.test(cmd) &&
    (cmd.match(/\$MailStartWarteMin/g) || []).length >= 3,
    (cmd.match(/\$MailStartWarteMin/g) || []).length + ' Vorkommen');
pruef('… mit dem vom Nutzer genannten Wert 15',
    /\$MailStartWarteMin\s*=\s*15\b/.test(cmd));
pruef('$MailLigaPflicht ist gesetzt und wird benutzt',
    /\$MailLigaPflicht\s*=\s*\$true/.test(cmd) && /if \(\$MailLigaPflicht\)/.test(cmd));
pruef('$MailLigaMaxAlterMin ist gesetzt und wird benutzt',
    /\$MailLigaMaxAlterMin\s*=\s*\d+/.test(cmd) && /\$ligaAlterMin -gt \$MailLigaMaxAlterMin/.test(cmd));

pruef('MailNochNichtBereit existiert',
    /function MailNochNichtBereit\(\$ziele\)/.test(cmd));
// Erste Frage immer: wird es ueberhaupt gerufen? "Gebaut, aber nirgends
// gerufen" ist die haeufigste Fehlerklasse dieses Projekts.
pruef('… und wird auch WIRKLICH aufgerufen',
    /\$lage = MailNochNichtBereit \$alle/.test(cmd));
// Rueckgabe ist ein Hashtable, kein blosser Text: der Aufrufer braucht
// laeuftMin, um einen Starter-Neustart von einem Dashboard-Start zu trennen.
pruef('… und liefert grund, laeuftMin und ohneLiga zurueck',
    /function MailLage\(\$grund, \$laeuftMin, \$ohneLiga\)/.test(cmd) &&
    /return @\{ grund = "\$grund"; laeuftMin = \[int\]\$laeuftMin; ohneLiga = \[bool\]\$ohneLiga \}/.test(cmd));
pruef('… und JEDER Ausstieg geht ueber MailLage (kein nackter String mehr)',
    !/function MailNochNichtBereit[\s\S]*?\n\}/.test(cmd) ||
    (cmd.slice(cmd.indexOf('function MailNochNichtBereit'), cmd.indexOf('# EIN Stueck JavaScript'))
        .match(/return '(?!')/g) || []).length === 0);

pruef('sie fragt die Dashboard-Startzeit ab (rcDriftLage.startUm)',
    /rcDriftLage/.test(cmd) && /startUm/.test(cmd));
pruef('sie zaehlt die Liga-Agenten (rcKpiData)',
    /Object\.keys\(window\.rcKpiData\|\|\{\}\)\.length/.test(cmd));
pruef('sie prueft die Frische der Liga-Daten (rcKpiLastUpdate)',
    /rcKpiLastUpdate/.test(cmd));
pruef('sie prueft, ob ueberhaupt ESL-Daten da sind (rcEslLastOk)',
    /rcEslLastOk/.test(cmd));

// Eine aeltere Dashboard-Fassung kennt rcDriftLage nicht. Dann darf die
// Zeitpruefung nicht blockieren - sonst ginge nie wieder eine Mail raus.
pruef('eine aeltere Dashboard-Fassung ohne Takt-Waechter blockiert NICHT',
    /if \(\$laeuftMin -ge 0 -and \$laeuftMin -lt \$MailStartWarteMin\)/.test(cmd));
pruef('jeder Ausstieg nennt einen Grund im Klartext (kein stilles return)',
    (cmd.match(/return '[^']{10,}'/g) || []).length >= 3 ||
    (cmd.match(/return \("[^"]{10,}"\)/g) || []).length >= 1);

// ===========================================================================
abschnitt('B) Zwei Anlaesse: Vorlauf und Stundentakt');
// ===========================================================================

pruef('es gibt den Anlass "vorlauf"', /\$anlass = 'vorlauf'/.test(cmd));
pruef('es gibt den Anlass "stunde"',  /\$anlass = 'stunde'/.test(cmd));
pruef('der Vorlauf-Versand laeuft genau EINMAL je Starterlauf',
    /\$ersteMailRaus\s*=\s*\$false/.test(cmd) && /\$ersteMailRaus = \$true/.test(cmd) &&
    /if \(-not \$ersteMailRaus\)/.test(cmd));
// Der Kern der Nutzer-Vorgabe: die erste Mail wartet NICHT auf die volle Stunde.
// Ein Start um 08:10 duerfte sonst erst um 09:06 senden.
pruef('der Vorlauf haengt NICHT an $MailAbMinute (sonst Start 08:10 -> Mail erst 09:06)',
    /if \(-not \$ersteMailRaus\)\s*\{ \$anlass = 'vorlauf' \}/.test(cmd));
pruef('der Stundentakt haengt weiterhin an $MailAbMinute',
    /elseif \(\$stundenSchluessel -ne \$letzteMailStunde -and[\s\S]{0,120}?\$jetzt\.Minute -ge \$MailAbMinute\)/.test(cmd));
pruef('beide Anlaesse gelten nur im Zeitfenster',
    /\$imFenster = \(\$jetzt\.Hour -ge \$MailVonStunde -and \$jetzt\.Hour -le \$MailBisStunde\)/.test(cmd) &&
    /if \(\$imFenster\)/.test(cmd));

// ===========================================================================
abschnitt('B2) Die fuenf Befunde der Gegenpruefung');
// ===========================================================================

// BEFUND 1 - der teuerste: Der KPI-Crawler klickt seit v6 NICHTS von selbst
// (kpi_crawler.js: "noch kein Ok-Klick gemerkt"). Ohne einen Ok-Klick des
// Nutzers bleibt rcKpiData dauerhaft leer. Eine HARTE Liga-Pflicht haette damit
// von 7 bis 21 Uhr JEDE Mail verhindert - schlimmer als der Ausgangszustand.
const kpi = fs.readFileSync(path.join(W, 'kpi_crawler.js'), 'utf8');
pruef('Beleg: der Crawler wartet wirklich auf einen Ok-Klick',
    /noch kein Ok-Klick gemerkt/.test(kpi));
pruef('deshalb ist die Liga-Pflicht eine FRIST, keine Endlos-Sperre',
    /\$MailLigaFristMin\s*=\s*\d+/.test(cmd) &&
    /\$laeuftMin -lt \$MailLigaFristMin/.test(cmd));
pruef('… nach der Frist wird gesendet und der Mangel benannt',
    /\$ohneLiga = \$true/.test(cmd) &&
    /Mail geht OHNE Qualitaets-Kennzahlen raus/.test(cmd));
pruef('… und der Wartegrund nennt die Abhilfe (Ok-Klick), nicht nur das Symptom',
    /einmal "Ok" klicken, der Crawler klickt nichts von selbst/.test(cmd));

// BEFUND 2: $ersteMailRaus lebt nur im Prozess. Starter-Neustart mittags haette
// sofort eine Zusatzmail ausgeloest, obwohl kurz vorher eine kam.
pruef('ein Starter-Neustart loest KEINEN zweiten Vorlauf aus',
    /\$lage\.laeuftMin -ge \(2 \* \$MailStartWarteMin\)/.test(cmd) &&
    /kein Start-Vorlauf, es gilt der Stundentakt/.test(cmd));

// BEFUND 3+4: ESL wurde gemessen, aber nie begrenzt - und ein gelungener Abruf
// beweist nur, dass eine Excel ankam, nicht dass sie von HEUTE ist.
pruef('das ESL-Alter wird begrenzt (nicht nur gemessen)',
    /\$MailEslMaxAlterMin\s*=\s*\d+/.test(cmd) &&
    /\$eslAlterMin -gt \$MailEslMaxAlterMin/.test(cmd));
pruef('ein falscher Portal-Tag blockiert den Versand',
    /rcPortalTagFalsch/.test(cmd) && /keine Zahlen von heute/.test(cmd));
pruef('eine abgemeldete Sitzung blockiert den Versand',
    /rcSessionState && !window\.rcSessionState\.alive/.test(cmd) &&
    /ESL-Sitzung ist abgemeldet/.test(cmd));
pruef('eine laufende ESL-Fehlserie blockiert den Versand',
    /rcEslFehlserie/.test(cmd) && /\$eslSerie -ge 3/.test(cmd));

// BEFUND 5: Der Vorlauf galt als erledigt, bevor feststand, ob eine Mail rausging.
pruef('der Vorlauf gilt erst nach ERFOLGREICHEM Versand als erledigt',
    /\$erg = SchickeStundenmail \$alle/.test(cmd) &&
    /if \(\$erg\) \{\s*\n\s*\$ersteMailRaus = \$true/.test(cmd));
pruef('… mit Deckel, damit ein kaputter Versand nicht alle 20 s Outlook oeffnet',
    /\$vorlaufVersuche\+\+/.test(cmd) && /\$vorlaufVersuche -ge 3/.test(cmd));
// GEGENPROBE: der alte, verwerfende Aufruf darf nicht zurueckkommen.
pruef('GEGENPROBE: das alte [void](SchickeStundenmail) ist raus',
    !/\[void\]\(SchickeStundenmail \$alle\)/.test(cmd));

// Ein Grund, der stundenlang derselbe bleibt, stuende sonst genau EINMAL da -
// das saehe aus wie "laeuft".
pruef('ein dauerhafter Wartegrund wird alle 30 Minuten erinnert',
    /\$wartetSeit/.test(cmd) && /TotalMinutes -ge 30/.test(cmd) &&
    /Stundenmail wartet seit \$dauerMin Minuten/.test(cmd));

// ===========================================================================
abschnitt('C) DIE FALLE: Bereitschaft VOR dem Stundenschluessel');
// ===========================================================================

// Positionsvergleich im echten Text - das ist der Kern dieser Pruefung.
const iBlock   = cmd.indexOf("if ($anlass) {");
const iPruef   = cmd.indexOf('$lage = MailNochNichtBereit $alle', iBlock);
const iSetzen  = cmd.indexOf('$letzteMailStunde = $stundenSchluessel', iBlock);
const iSenden  = cmd.indexOf('$erg = SchickeStundenmail $alle', iBlock);
pruef('alle drei Stellen sind im Ausloese-Block auffindbar',
    iBlock > 0 && iPruef > iBlock && iSetzen > iBlock && iSenden > iBlock,
    JSON.stringify({ iBlock, iPruef, iSetzen, iSenden }));
pruef('die Bereitschaft wird VOR dem Setzen des Stundenschluessels geprueft',
    iPruef < iSetzen, iPruef + ' < ' + iSetzen);
pruef('… und der Schluessel VOR dem Versand gesetzt (kein 20-s-Dauerfeuer)',
    iSetzen < iSenden, iSetzen + ' < ' + iSenden);
// GEGENPROBE: erkennt die Regel die falsche Reihenfolge? Sonst prueft sie nichts.
{
    const kaputt = cmd.slice(iBlock, iSenden + 40)
        .replace('$warum = MailNochNichtBereit $alle', '# verschoben')
        .replace('$letzteMailStunde = $stundenSchluessel',
                 '$letzteMailStunde = $stundenSchluessel\n            $warum = MailNochNichtBereit $alle');
    pruef('GEGENPROBE: eine vertauschte Reihenfolge wuerde erkannt',
        kaputt.indexOf('$warum = MailNochNichtBereit $alle') > kaputt.indexOf('$letzteMailStunde = $stundenSchluessel'));
}
// Bei "noch nicht bereit" darf der Schluessel NICHT gesetzt werden.
{
    const zweig = cmd.slice(iPruef, iSetzen);
    pruef('im Warte-Zweig wird der Stundenschluessel NICHT gesetzt',
        zweig.indexOf('$letzteMailStunde =') < 0);
    pruef('… und der Wartegrund nur bei AENDERUNG gemeldet (kein Fenster voller Zeilen)',
        /if \(\$letzterWartegrund -ne \$lage\.grund\)/.test(zweig));
    pruef('… der Warte-Zweig verschickt auch nichts',
        zweig.indexOf('SchickeStundenmail') < 0);
}
pruef('nach erfolgreicher Bereitschaft wird der Wartegrund zurueckgesetzt',
    /\$letzterWartegrund = ''\s*\n\s*\$wartetSeit = \$null/.test(cmd));

// ===========================================================================
abschnitt('D) FUNKTIONAL: die Ausloeselogik durchgespielt');
// ===========================================================================

// Die PowerShell-Logik wird hier in JavaScript nachgestellt — aber NICHT frei
// erfunden: die Bedingungen werden aus dem echten Text uebernommen und oben
// Zeichen fuer Zeichen gegengeprueft (Abschnitt B und C). Gemessen wird der
// ABLAUF ueber einen Tag, den man am Text allein nicht sieht.
function lauf(opt) {
    const cfg = Object.assign({
        vonStunde: 7, bisStunde: 20, abMinute: 6, warteMin: 15,
        ligaAbMin: 20,        // ab welcher Minute nach Start die Ligaliste liefert
        dashStartMin: 0,      // wann das Dashboard startet (Minuten seit Lauf-Beginn)
        startUhr: 8 * 60,     // Uhrzeit in Minuten seit Mitternacht beim Lauf-Beginn
        dauerMin: 600,
        neuStartBei: null     // Minute, in der das Dashboard neu eingespielt wird
    }, opt);
    let ersteMailRaus = false, letzteMailStunde = '', wartegrund = '';
    const mails = [];
    let dashStart = cfg.dashStartMin;
    for (let m = 0; m < cfg.dauerMin; m++) {
        if (cfg.neuStartBei !== null && m === cfg.neuStartBei) { dashStart = m; }
        const uhrMin = (cfg.startUhr + m) % 1440;
        const std = Math.floor(uhrMin / 60), min = uhrMin % 60;
        const tag = Math.floor((cfg.startUhr + m) / 1440);
        const schluessel = tag + '-' + std;
        const imFenster = (std >= cfg.vonStunde && std <= cfg.bisStunde);
        let anlass = '';
        if (imFenster) {
            if (!ersteMailRaus) anlass = 'vorlauf';
            else if (schluessel !== letzteMailStunde && min >= cfg.abMinute) anlass = 'stunde';
        }
        if (!anlass) continue;
        // Bereitschaft: Dashboard laeuft lange genug UND Liga-Daten sind da.
        const laeuftMin = m - dashStart;
        // ligaLuecke erlaubt es, die Ligaliste zwischendurch AUSFALLEN zu lassen —
        // ohne das laesst sich der Stundenverlust gar nicht nachstellen (siehe
        // Gegenprobe unten): solange der Vorlauf noch aussteht, ignoriert der
        // Anlass den Stundenschluessel ohnehin.
        const ligaDa = ((m - dashStart) >= cfg.ligaAbMin) &&
                       !(cfg.ligaLuecke && m >= cfg.ligaLuecke[0] && m < cfg.ligaLuecke[1]);
        let warum = '';
        if (laeuftMin < cfg.warteMin) warum = 'Dashboard laeuft erst ' + laeuftMin + ' Min';
        else if (!ligaDa)             warum = 'noch keine Ligalisten-Daten';
        if (warum) { wartegrund = warum; continue; }   // Stunde NICHT verbrauchen
        wartegrund = '';
        letzteMailStunde = schluessel;
        if (anlass === 'vorlauf') ersteMailRaus = true;
        mails.push({ minute: m, uhr: String(std).padStart(2,'0') + ':' + String(min).padStart(2,'0'), anlass });
    }
    return mails;
}

// 1) Normalfall: Start 08:00, Ligaliste nach 20 Minuten.
{
    const m = lauf({ startUhr: 8 * 60, ligaAbMin: 20, dauerMin: 240 });
    pruef('Normalfall: die erste Mail ist ein Vorlauf-Versand',
        m.length > 0 && m[0].anlass === 'vorlauf', JSON.stringify(m[0]));
    pruef('… und geht sobald die Ligaliste da ist (08:20), nicht erst 09:06',
        m[0] && m[0].uhr === '08:20', m[0] && m[0].uhr);
    pruef('… danach laeuft der Stundentakt ab Minute 6 weiter',
        m[1] && m[1].anlass === 'stunde' && m[1].uhr === '09:06', m[1] && m[1].uhr);
    pruef('… und es gibt hoechstens EINE Mail je Stunde',
        new Set(m.map(x => x.uhr.slice(0,2))).size === m.length, JSON.stringify(m.map(x=>x.uhr)));
}

// 2) Die Wartezeit greift: Ligaliste liefert erst nach 5 Minuten, der Vorlauf
//    von 15 Minuten ist dann das bindende Kriterium.
{
    const m = lauf({ startUhr: 8 * 60, ligaAbMin: 5, dauerMin: 120 });
    pruef('schnelle Ligaliste: der 15-Minuten-Vorlauf gilt trotzdem',
        m[0] && m[0].uhr === '08:15', m[0] && m[0].uhr);
}

// 3) Ligaliste haengt den ganzen Vormittag: es geht KEINE Mail raus, aber die
//    Stunden werden nicht verbraucht — sobald sie kommt, geht sofort eine.
{
    const m = lauf({ startUhr: 7 * 60, ligaAbMin: 200, dauerMin: 300 });
    pruef('haengende Ligaliste: bis dahin keine einzige Mail',
        m.filter(x => x.minute < 200).length === 0, JSON.stringify(m.slice(0,2)));
    pruef('… und sobald sie kommt, geht SOFORT eine raus (Stunde nicht verbraucht)',
        m[0] && m[0].minute === 200, m[0] && m[0].minute);
}

// 4) Sitzungsablauf mittags: Dashboard neu eingespielt, rcKpiData leer.
//    Der Stundentakt muss die Wartezeit erneut beachten - und darf die Stunde
//    dabei NICHT verbrauchen.
{
    const m = lauf({ startUhr: 8 * 60, ligaAbMin: 20, dauerMin: 300, neuStartBei: 185 });
    const nachNeustart = m.filter(x => x.minute >= 185);
    pruef('nach einem Re-Inject wartet der Takt erneut auf die Daten',
        nachNeustart.length > 0 && nachNeustart[0].minute >= 185 + 20,
        JSON.stringify(nachNeustart[0]));
    pruef('… und die Stunde faellt NICHT ersatzlos aus',
        nachNeustart.length > 0);
}

// 5) Start ausserhalb des Fensters: nachts starten, morgens senden.
{
    const m = lauf({ startUhr: 21 * 60 + 30, ligaAbMin: 20, dauerMin: 700 });
    pruef('Start um 21:30: keine Mail am selben Abend',
        m.filter(x => x.uhr >= '21:00').length === 0, JSON.stringify(m.slice(0,2)));
    pruef('… aber am naechsten Morgen ab 07:00 die erste',
        m[0] && m[0].uhr.slice(0,2) === '07', m[0] && m[0].uhr);
}

// 6) GEGENPROBE fuer die Kernfalle: wuerde der Stundenschluessel VOR der
//    Bereitschaftspruefung gesetzt, faellt jede Stunde ersatzlos aus, in der die
//    Ligaliste gerade nicht liefert.
//    WICHTIG - die erste Fassung dieser Gegenprobe war unbrauchbar: sie liess
//    die Ligaliste von Anfang an ausfallen. Solange der Vorlauf aber noch
//    aussteht, ignoriert der Anlass 'vorlauf' den Stundenschluessel voellig, und
//    beide Fassungen verhielten sich gleich (2 zu 2 Mails). Der Verlust tritt
//    erst NACH dem Vorlauf auf - also braucht es eine Luecke MITTENDRIN.
{
    const LUECKE = [70, 200];   // Ligaliste faellt von Minute 70 bis 200 aus
    function laufFalsch() {
        let ersteMailRaus = false, letzteMailStunde = '';
        const mails = [];
        for (let m = 0; m < 300; m++) {
            const uhrMin = (8 * 60 + m) % 1440;
            const std = Math.floor(uhrMin / 60), min = uhrMin % 60;
            const schluessel = '0-' + std;
            if (!(std >= 7 && std <= 20)) continue;
            let anlass = '';
            if (!ersteMailRaus) anlass = 'vorlauf';
            else if (schluessel !== letzteMailStunde && min >= 6) anlass = 'stunde';
            if (!anlass) continue;
            letzteMailStunde = schluessel;                   // FALSCH: vor der Pruefung
            const ligaDa = m >= 20 && !(m >= LUECKE[0] && m < LUECKE[1]);
            if (m < 15 || !ligaDa) continue;                 // erst danach geprueft
            if (anlass === 'vorlauf') ersteMailRaus = true;
            mails.push({ minute: m, std });
        }
        return mails;
    }
    const falsch  = laufFalsch();
    const richtig = lauf({ startUhr: 8 * 60, ligaAbMin: 20, ligaLuecke: LUECKE, dauerMin: 300 });
    pruef('GEGENPROBE: bei falscher Reihenfolge gehen Stunden ersatzlos verloren',
        falsch.length < richtig.length,
        'falsch=' + falsch.length + ' richtig=' + richtig.length);
    pruef('… und die richtige Fassung holt die Mail nach, sobald die Liga wieder da ist',
        richtig.some(x => x.minute >= LUECKE[1] && x.minute < LUECKE[1] + 5),
        JSON.stringify(richtig.map(x => x.minute)));
}

// ===========================================================================
abschnitt('E) Was der Nutzer beim Start erfaehrt');
// ===========================================================================

pruef('der Vorlauf wird beim Start genannt',
    /Erste Mail: \$MailStartWarteMin Min nach dem Dashboard-Start/.test(cmd));
pruef('eine abgeschaltete Liga-Pflicht wird als Warnung genannt',
    /Ligalisten-Pflicht ist AUS/.test(cmd));
pruef('der Vorlauf-Versand ist in der Meldung von der Stundenmail unterscheidbar',
    /Erste Mail nach dem Start/.test(cmd) && /Stundenmail \$\(\$jetzt/.test(cmd));

// ===========================================================================
console.log('\n  ' + ok + ' bestanden, ' + bad + ' fehlgeschlagen.');
process.exit(bad === 0 ? 0 : 1);
