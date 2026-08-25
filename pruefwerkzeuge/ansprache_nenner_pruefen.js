/**
 * ansprache_nenner_pruefen.js — nagelt den NENNER der Ansprachequote fest.
 *
 * Nutzer-Befund 07.08.: "das mit ansprache ist auch falsch, weil die call
 * anzahl falsch ist meistens."
 *
 * Zwei getrennte Sachverhalte, beide gemessen:
 *
 * 1) WOHER die Call-Zahl kommt. Das Portal bietet KEINE eigene Mengen-Kennzahl
 *    an; callCount ist der NENNER der Kennzahl AHT (Rueckfall ACD). Die Zahl
 *    ist damit ein Nebenprodukt einer Zeit-Kennzahl. Nutzer-Entscheidung
 *    07.08.: dabei bleibt es (AHT-Nenner).
 *    Gemessen an Test Excels/Ligalisten.xlsx (549 Agenten): der AHT-Nenner ist
 *    NICHT derselbe wie der Auflegerquote-Nenner — 15836 gegen 7313, und nur
 *    8 Agenten haben denselben Wert. Die Wahl ist also folgenreich.
 *
 * 2) WAS PASSIERT, wenn sie fehlt. Bis 07.08. machte "|| 0" aus "Spalte nicht
 *    geliefert" eine harte 0, und das Dashboard fiel bei 0 Liga-Calls still auf
 *    die ESL-Kontakte zurueck. Dort sind nur ~12 % der Gespraeche getrackt —
 *    die Quote sprang also um Faktor ~8, und nur die Beschriftung aenderte sich.
 *    Nutzer-Entscheidung 07.08.: Quote verweigern statt Nenner tauschen.
 *
 *   node pruefwerkzeuge/ansprache_nenner_pruefen.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const W = path.join(__dirname, '..');
const lies = n => fs.readFileSync(path.join(W, n), 'utf8');
const dash = lies('esl_live_arena_v22.js');
const kpi  = lies('kpi_crawler.js');

let ok = 0, bad = 0;
function pruef(t, b, z) {
    if (b) { ok++; console.log('  ok   ' + t); }
    else { bad++; console.log('  FEHL ' + t + (z !== undefined ? '  -> ' + z : '')); }
}
function abschnitt(t) { console.log('\n-- ' + t + ' --'); }

console.log('Nenner der Ansprachequote — Pruefung');

// ===========================================================================
abschnitt('1) Crawler: Call-Zahl kommt aus dem AHT-Nenner');

pruef('callCount kommt aus dem AHT-Nenner, Rueckfall ACD-Nenner',
    /iCalls\s*=\s*findKpi\(map,\s*'AHT',\s*'Nenner'\)/.test(kpi) &&
    /iCallsAcd\s*=\s*findKpi\(map,\s*'ACD',\s*'Nenner'\)/.test(kpi));
pruef('NICHT der Auflegerquote-Nenner (waere weniger als die Haelfte)',
    !/iCalls\w*\s*=\s*findKpi\(map,\s*'Auflegerquote',\s*'Nenner'\)/.test(kpi));

// Fehlt die Spalte GANZ, muss null herauskommen — nicht 0.
pruef('fehlende Spalte ergibt null (unbekannt), vorhandene Spalte 0 oder Wert',
    /callSpalte\s*=\s*iCalls\s*>=\s*0\s*\?\s*iCalls\s*:\s*iCallsAcd/.test(kpi) &&
    /callCount\s*=\s*callSpalte\s*>=\s*0\s*\?\s*\(cellNum\(cells,\s*callSpalte\)\s*\|\|\s*0\)\s*:\s*null/.test(kpi));
// GEGENPROBE: haette die Pruefung den alten Zustand erkannt?
pruef('Gegenprobe: der alte bedingungslose "|| 0"-Weg ist raus',
    !/const callCount = \(iCalls >= 0 \? cellNum\(cells, iCalls\) : cellNum\(cells, iCallsAcd\)\) \|\| 0;/.test(kpi));
pruef('fehlt der Nenner ganz, wird es EINMAL laut gemeldet statt still 0 zu liefern',
    /iCalls < 0 && iCallsAcd < 0/.test(kpi) && /__rcCallsFehltGemeldet/.test(kpi));

// ===========================================================================
abschnitt('2) Dashboard: kein stiller Nenner-Tausch mehr');

pruef('KPI-Streifen: Quote haengt am Liga-Nenner, nicht an "irgendein Nenner > 0"',
    /stripHatLiga\s*=\s*!!\(stripLiga && stripLiga\.total > 0\)/.test(dash) &&
    /stripQuote\s*=\s*z\s*=>\s*stripHatLiga\s*\?/.test(dash));
pruef('Gegenprobe: der alte Rueckfall "stripCalls > 0" als Quoten-Bedingung ist raus',
    !/stripQuote\s*=\s*z\s*=>\s*stripCalls\s*>\s*0\s*\?/.test(dash));
pruef('Trichter: kein Rueckfall auf eslKontakte mehr',
    !/baseCalls\s*=\s*ligaCalls\s*>\s*0\s*\?\s*ligaCalls\s*:\s*eslKontakte/.test(dash));
pruef('Trichter sagt, WORAUF gewartet wird (nicht nur "Warte auf Daten")',
    /Warte auf die Ligaliste/.test(dash));
pruef('die Kachel zeigt weiterhin die echte ESL-Kontaktzahl (die Zahl ist echt, nur kein Nenner)',
    /stripCalls\s*=\s*stripHatLiga\s*\?\s*stripLiga\.total\s*:\s*gCalls/.test(dash));

// FUNKTIONAL: den echten Block ausschneiden und beide Lagen durchspielen.
// Ein Nachbau bewachte nur seine eigene Kopie — deshalb der echte Quelltext.
{
    const von = dash.indexOf('const stripLiga = window.rcLigaAgg');
    const bis = dash.indexOf(';', dash.indexOf('const stripQuote'));
    pruef('Streifen-Block im Quelltext gefunden', von > -1 && bis > von);
    if (von > -1 && bis > von) {
        const block = dash.slice(von, bis + 1);
        const bau = (total, eslKontakte) => new Function('window', 'rcLigaAgg', 'gCalls',
            block + ' return { stripCalls, stripBasis, q: stripQuote(50) };'
        )({ rcLigaAgg: () => ({ total }) }, () => ({ total }), eslKontakte);

        const mitLiga = bau(200, 25);
        pruef('mit Liga-Daten: Nenner sind die Liga-Calls, Quote wird gerechnet',
            mitLiga.stripCalls === 200 && mitLiga.stripBasis === 'Liga-Calls' && mitLiga.q === '25%',
            JSON.stringify(mitLiga));

        const ohneLiga = bau(0, 25);
        pruef('ohne Liga-Daten: Quote ist "—" und NICHT gegen die ESL-Kontakte gerechnet',
            ohneLiga.q === '—', JSON.stringify(ohneLiga));
        pruef('ohne Liga-Daten waere der alte Weg 200 % gewesen (Beleg fuer den Faktor-Sprung)',
            Math.round(50 / 25 * 100) === 200 && ohneLiga.q !== '200%');
        pruef('die Kachel zeigt dabei trotzdem die 25 echten ESL-Kontakte',
            ohneLiga.stripCalls === 25 && ohneLiga.stripBasis === 'ESL-Kontakte',
            JSON.stringify(ohneLiga));
    }
}

// ===========================================================================
abschnitt('3) Die Nenner sind an echten Daten wirklich verschieden');

let XLSX = null;
try { XLSX = require('xlsx'); } catch (e) {
    try { XLSX = require(path.join(W, 'node_modules', 'xlsx')); } catch (e2) {}
}
const liga = path.join(W, 'Test Excels', 'Ligalisten.xlsx');
if (XLSX && fs.existsSync(liga)) {
    const r = XLSX.utils.sheet_to_json(XLSX.readFile(liga).Sheets[XLSX.readFile(liga).SheetNames[0]],
        { header: 1, raw: false, defval: '' });
    // Leaf-Kopfzeile ueber "Agentenname" suchen — die Zeilennummer ist NICHT
    // verlaesslich (steht so schon in CLAUDE.md).
    let leaf = -1;
    for (let i = 0; i < 6; i++) if (r[i] && r[i].some(c => /agentenname/i.test(String(c)))) { leaf = i; break; }
    pruef('Leaf-Kopfzeile ueber "Agentenname" gefunden (nicht ueber eine feste Nummer)', leaf > -1, 'leaf=' + leaf);

    if (leaf > -1) {
        const gr = r[leaf - 1] || [], lf = r[leaf];
        let akt = ''; const sp = [];
        for (let c = 0; c < lf.length; c++) {
            const g = String(gr[c] || '').trim(); if (g) akt = g;
            sp.push({ c, gruppe: akt, leaf: String(lf[c] || '').trim() });
        }
        const nenner = name => (sp.find(s => s.gruppe === name && /nenner/i.test(s.leaf)) || {}).c;
        const iAht = nenner('AHT'), iAuf = nenner('Auflegerquote');
        pruef('AHT- und Auflegerquote-Nenner in der Excel gefunden',
            iAht !== undefined && iAuf !== undefined, 'AHT@' + iAht + ' Auf@' + iAuf);

        if (iAht !== undefined && iAuf !== undefined) {
            const N = v => { const x = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(x) ? 0 : x; };
            let sAht = 0, sAuf = 0, n = 0, gleich = 0;
            for (let i = leaf + 1; i < r.length; i++) {
                const row = r[i]; if (!row || !String(row[4] || '').trim()) continue;
                const a = N(row[iAht]), f = N(row[iAuf]);
                if (!a && !f) continue;
                n++; sAht += a; sAuf += f; if (a === f) gleich++;
            }
            pruef('genug Agenten fuer eine belastbare Messung', n > 100, n + ' Agenten');
            pruef('AHT-Nenner und Auflegerquote-Nenner sind NICHT dasselbe',
                sAht !== sAuf, 'AHT=' + sAht + ' Auflege=' + sAuf);
            pruef('sie stimmen nur bei einer kleinen Minderheit ueberein (<10 %)',
                gleich / n < 0.10, gleich + ' von ' + n + ' = ' + (100 * gleich / n).toFixed(1) + ' %');
            pruef('der Unterschied ist gross genug, um Quoten zu verdoppeln (>50 %)',
                Math.abs(sAht - sAuf) / Math.max(sAht, sAuf) > 0.5,
                'Abweichung ' + (100 * Math.abs(sAht - sAuf) / Math.max(sAht, sAuf)).toFixed(1) + ' %');
            console.log('       gemessen: AHT-Nenner ' + sAht + ' · Auflegerquote-Nenner ' + sAuf
                + ' · gleich bei ' + gleich + ' von ' + n + ' Agenten');
        }
    }
} else {
    console.log('  [--]  Test Excels/Ligalisten.xlsx nicht lesbar — Abschnitt 3 uebersprungen');
}

// ===========================================================================
console.log('\n' + '='.repeat(64));
if (bad === 0) console.log('ALLE ' + ok + ' PRUEFUNGEN BESTANDEN.');
else console.log(bad + ' von ' + (ok + bad) + ' Pruefungen FEHLGESCHLAGEN.');
console.log('='.repeat(64) + '\n');
process.exit(bad ? 1 : 0);
