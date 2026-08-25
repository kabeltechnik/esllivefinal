#!/usr/bin/env node
/**
 * projektwechsel_pruefen.js — prueft den Weg "Anmeldung -> Projekt -> Reiter
 * Projektergebnisse" im Autopiloten und die projektbewusste Versorgung der Tabs
 * durch die beiden Startdateien.
 *
 * ANLASS (05.08.2026, Nutzer-Meldung):
 *   "Er loggt sich ein -> klickt auf Projekte -> Vodafone Kabel und dann statt
 *    auf Projektergebnisse klickt er wieder auf Projekte."
 *
 *   Ursache: eslFlow() laeuft GENAU EINMAL je Seitenaufbau (aus weiche() bei
 *   DOMContentLoaded). Der Klick auf den Menueeintrag ist eine echte Navigation
 *   — das nachgestellte setTimeout(gotoProjektergebnisse, 1500) stirbt mit dem
 *   alten Dokument, und auf der neuen Seite faengt alles von vorn an: kein
 *   filterForm (der Reiter ist noch nicht gewaehlt), Menue zugeklappt (byText
 *   verlangt vis()), also fiel der Autopilot in den Menue-Block und klickte
 *   WIEDER "Projekte". Endlosschleife.
 *
 * ZWEITER ANLASS, gleiche Fehlerklasse wie im ganzen Projekt:
 *   Der erste Fix rief istProjektSeite() auf, ohne die Funktion zu definieren.
 *   `node --check` meldet das NICHT (Syntax ist gueltig) — zur Laufzeit waere es
 *   ein ReferenceError gewesen, der eslFlow komplett stillgelegt haette.
 *   Deshalb prueft Abschnitt 1 GENERELL: wird irgendwo etwas aufgerufen, das
 *   nirgends definiert ist?
 *
 * Laeuft ohne Portal, ohne Installation, ohne Netz.
 *   node pruefwerkzeuge/projektwechsel_pruefen.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..');
const lies = n => fs.readFileSync(path.join(DIR, n), 'utf8');

const auto   = lies('esl_autopilot.user.js');
const mob    = lies('esl_autopilot_mobile.user.js');
const um     = lies('esl_autopilot_um.user.js');
const cmd    = lies('ESL_Start.cmd');
const cmdMU  = lies('ESL_Start_Mobile_UM.cmd');
const dash   = lies('esl_live_arena_v22.js');

let ok = 0, bad = 0;
function pruef(text, bedingung, hinweis) {
    if (bedingung) { ok++; console.log('  OK    ' + text); }
    else { bad++; console.log('  FEHLT ' + text + (hinweis ? '\n          -> ' + hinweis : '')); }
}
function gleich(text, ist, soll) {
    pruef(text + '  (ist: ' + JSON.stringify(ist) + ')', ist === soll,
          'erwartet war ' + JSON.stringify(soll));
}

// ============================================================================
console.log('\n-- 1. Wird etwas aufgerufen, das es gar nicht gibt? --');
// Genau der Fehler, der beim ersten Anlauf drinsteckte. node --check findet ihn
// nicht, weil die Syntax gueltig ist.

// Bekannte Umgebung. Bewusst grosszuegig: ein falscher Treffer hier waere
// laestiger als eine Luecke — die Funktion, um die es geht, steht in der Datei.
const GLOBALS = new Set([
    'window','document','console','location','navigator','localStorage','sessionStorage',
    'setTimeout','setInterval','clearTimeout','clearInterval','fetch','atob','btoa',
    'Array','Object','String','Number','Boolean','Math','Date','JSON','RegExp','Error',
    'Promise','Map','Set','Symbol','Proxy','Reflect','parseInt','parseFloat','isNaN',
    'encodeURIComponent','decodeURIComponent','encodeURI','decodeURI','alert','prompt','confirm',
    'Event','MouseEvent','KeyboardEvent','CustomEvent','Blob','File','FileReader','FormData',
    'URL','URLSearchParams','Uint8Array','ArrayBuffer','DataView','TextDecoder','TextEncoder',
    'BroadcastChannel','MutationObserver','requestAnimationFrame','cancelAnimationFrame',
    'eval','typeof','void','XMLHttpRequest','WebSocket','performance','structuredClone'
]);
// Schluesselwoerter, die vor einer Klammer stehen duerfen, ohne ein Aufruf zu sein.
const KEYWORDS = new Set([
    'if','for','while','switch','catch','function','return','typeof','new','delete',
    'do','else','in','of','instanceof','void','await','yield','case','throw'
]);

// Kommentare und Zeichenketten ausblenden, BEVOR nach Aufrufen gesucht wird.
// Ohne das gilt jedes deutsche Wort vor einer Klammer als Funktionsaufruf —
// "eine echte Geste (Input.dispatchMouseEvent)" haette 60 Fehlalarme ergeben.
// Ersetzt wird durch Leerzeichen, damit die Zeilennummern stimmen bleiben.
function ohneKommentareUndTexte(src) {
    const aus = src.split('');
    const leer = (von, bis) => { for (let i = von; i < bis && i < aus.length; i++) if (aus[i] !== '\n') aus[i] = ' '; };
    let i = 0;
    while (i < src.length) {
        const c = src[i], c2 = src[i + 1];
        if (c === '/' && c2 === '*') { const e = src.indexOf('*/', i + 2); const bis = e < 0 ? src.length : e + 2; leer(i, bis); i = bis; continue; }
        if (c === '/' && c2 === '/') { let e = src.indexOf('\n', i); if (e < 0) e = src.length; leer(i, e); i = e; continue; }
        if (c === "'" || c === '"' || c === '`') {
            let j = i + 1;
            while (j < src.length) {
                if (src[j] === '\\') { j += 2; continue; }
                if (src[j] === c) break;
                if (c !== '`' && src[j] === '\n') break;      // unbeendete Zeichenkette
                j++;
            }
            leer(i, j + 1); i = j + 1; continue;
        }
        i++;
    }
    return aus.join('');
}

function definierteNamen(src) {
    const namen = new Set();
    let m;
    // function name(...)
    const reFn = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
    while ((m = reFn.exec(src))) namen.add(m[1]);
    // var/let/const name =
    const reVar = /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/g;
    while ((m = reVar.exec(src))) namen.add(m[1]);
    // var a, b, c;  (Mehrfachdeklaration ohne Zuweisung)
    const reVarListe = /\b(?:var|let)\s+([A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)+)\s*[;=]/g;
    while ((m = reVarListe.exec(src))) m[1].split(',').forEach(s => namen.add(s.trim()));
    // Parameter JEDER Funktion — sonst gilt z.B. act(r) in until() als undefiniert
    const rePar = /\bfunction\s*[A-Za-z_$]*\s*\(([^)]*)\)/g;
    while ((m = rePar.exec(src))) {
        m[1].split(',').forEach(p => {
            const n = p.trim().replace(/=.*$/, '').trim();
            if (/^[A-Za-z_$][\w$]*$/.test(n)) namen.add(n);
        });
    }
    // Pfeilfunktions-Parameter:  (a, b) => ... und  a => ...
    const reArrow = /\(([^()]*)\)\s*=>/g;
    while ((m = reArrow.exec(src))) {
        m[1].split(',').forEach(p => {
            const n = p.trim().replace(/=.*$/, '').trim();
            if (/^[A-Za-z_$][\w$]*$/.test(n)) namen.add(n);
        });
    }
    const reArrow1 = /\b([A-Za-z_$][\w$]*)\s*=>/g;
    while ((m = reArrow1.exec(src))) namen.add(m[1]);
    // catch (e)
    const reCatch = /\bcatch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g;
    while ((m = reCatch.exec(src))) namen.add(m[1]);
    // window.name = function ...  — so haengt der Autopilot seine Konsolen-
    // Befehle an (rcAutoStatus, rcAutoReset, rcAutoMail, rcAutoSaveCrawler ...)
    const reWin = /\bwindow\.([A-Za-z_$][\w$]*)\s*=/g;
    while ((m = reWin.exec(src))) namen.add(m[1]);
    return namen;
}

function unbekannteAufrufe(rohsrc) {
    const src = ohneKommentareUndTexte(rohsrc);
    const bekannt = definierteNamen(src);
    const fehlt = new Map();     // name -> Zeilennummer des ersten Vorkommens
    // Aufrufe: name(   — aber NICHT .name(  und nicht schluesselwort(
    // ZWINGEND mit Lookbehind statt einer verbrauchenden Gruppe: ein
    // "(^|[^\w$.])" frisst das Zeichen davor mit, und der naechste Suchlauf
    // beginnt dann MITTEN im folgenden Namen. Genau daran ging der erste
    // Entwurf vorbei — "if (istProjektSeite()" wurde nicht erkannt, weil das
    // "(" von "if (" schon verbraucht war. Der Scanner meldete gruen, obwohl
    // die Definition fehlte: ein Test, der nichts prueft, ist schlimmer als
    // keiner.
    const re = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
        const n = m[1];
        if (KEYWORDS.has(n) || GLOBALS.has(n) || bekannt.has(n)) continue;
        if (fehlt.has(n)) continue;
        fehlt.set(n, src.slice(0, m.index).split('\n').length);
    }
    return fehlt;
}

for (const [datei, src] of [['esl_autopilot.user.js', auto],
                            ['esl_autopilot_mobile.user.js', mob],
                            ['esl_autopilot_um.user.js', um]]) {
    const fehlt = unbekannteAufrufe(src);
    const liste = [...fehlt.entries()].map(([n, z]) => n + ' (Z. ' + z + ')');
    pruef(datei + ': jeder Aufruf hat eine Definition', fehlt.size === 0,
          'nicht gefunden: ' + liste.join(', '));
}

// ============================================================================
console.log('\n-- 2. Der Ausstieg VOR dem Menue-Block --');
// Die Reihenfolge ist der ganze Fix. Steht der Zweig hinter dem Menue-Block,
// aendert sich gar nichts: der Autopilot klickt vorher schon "Projekte".
pruef('istProjektSeite ist definiert', /function\s+istProjektSeite\s*\(/.test(auto));
pruef('istProjektSeite wird auch benutzt', /istProjektSeite\s*\(\s*\)/.test(auto));

// FESTGENAGELT (06.08. spaetabends): jeder PC faehrt EIN Projekt. Der Ausstieg
// verlangt istProjektSeite() UND aufSollProjekt(); eine falsche Projektseite
// geht ins Menue ZURUECK zum Soll (Live-Befund: geteilte Server-Sitzung warf
// Tabs auf das Projekt des Nachbar-PCs — "Kabel auf null, Mobilfunk normal").
// Gemessen wird NUR innerhalb von eslFlow. Global gesucht traf indexOf ab dem
// 14.08. die Erwaehnung von 'frmMainMenu:mainMenu' in rcAutoWarum(), das weiter
// OBEN in der Datei steht — die Reihenfolge im Ablauf war unveraendert richtig,
// die Pruefung sah nur an der falschen Fundstelle nach. Der Selektor selbst ist
// bewusst nicht mehr Teil des Ankers (er heisst jetzt MENUE_SEL).
const flow = auto.slice(auto.indexOf('function eslFlow()'));
const posAusstieg = flow.indexOf('else if (istProjektSeite() && aufSollProjekt())');
const posMenue    = flow.indexOf('var ziel = byText(');
const posMainMenu = flow.indexOf("id('frmMainMenu:mainMenu')");
pruef('der Ausstieg steht im Code', posAusstieg > 0);
pruef('er steht VOR der Menueeintrag-Suche',
      posAusstieg > 0 && posMenue > 0 && posAusstieg < posMenue,
      'sonst wird der Projekteintrag erneut geklickt');
pruef('er steht VOR dem Aufklappen von "Projekte"',
      posAusstieg > 0 && posMainMenu > 0 && posAusstieg < posMainMenu,
      'genau dieser Klick war die gemeldete Endlosschleife');
pruef('der Ausstieg ruft gotoProjektergebnisse und kehrt zurueck',
      /else if \(istProjektSeite\(\) && aufSollProjekt\(\)\) \{[\s\S]{0,200}?gotoProjektergebnisse\(\);[\s\S]{0,40}?return;/.test(auto));
pruef('eine FALSCHE Projektseite wird gemeldet und geht ins Menue zurueck',
      /if \(id\('filterForm'\) && !aufSollProjekt\(\)\)/.test(auto) &&
      /wechsle zurueck zu "/.test(auto));
pruef('der Dashboard-Start verlangt die RICHTIGE Seite',
      /if \(id\('filterForm'\) && aufSollProjekt\(\)\) \{[\s\S]{0,80}?pickExportView\(\);/.test(auto));
// Die Zwischenloesung "Marke folgt der beobachteten Seite" ist bewusst raus —
// sie machte aus dem Mobile-Tab nach einem Re-Login still einen Kabel-Tab.
pruef('merkeProjektMarke ist entfernt (Marke kommt NUR vom Starter)',
      !/merkeProjektMarke/.test(auto) && !/aufRichtigemProjekt/.test(auto));
// Die Menuewahl folgt der Marke (Starter-Parameter), CFG ist nur Fallback.
pruef('die Menuewahl nutzt sollProjekt() statt fest CFG.PROJEKT',
      /var sollP = sollProjekt\(\);/.test(auto) &&
      /var ziel = byText\([^)]*sollP\.name, true\)/.test(auto));

// ============================================================================
console.log('\n-- 3. Verhalten der echten Funktionen (kein Nachbau) --');
// Die drei Funktionen werden per Klammerzaehlung aus der ECHTEN Datei
// geschnitten und ausgefuehrt. Ein Nachbau wuerde nur seine eigene Kopie
// bewachen.
function schneide(src, name) {
    const start = src.indexOf('function ' + name + '(');
    if (start < 0) throw new Error('Funktion nicht gefunden: ' + name);
    let i = src.indexOf('{', start), tiefe = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') tiefe++;
        else if (src[i] === '}') { tiefe--; if (tiefe === 0) return src.slice(start, i + 1); }
    }
    throw new Error('Klammern gehen nicht auf: ' + name);
}
const quelle = ['projektDateiHier', 'istProjektSeite', 'sollProjekt', 'aufSollProjekt']
    .map(n => schneide(auto, n)).join('\n');
const bauen = new Function('location', 'CFG', 'sessionStorage', 'console',
    quelle + '\nreturn { projektDateiHier, istProjektSeite, sollProjekt, aufSollProjekt };');
function speicherStub(anfang){
    const s = { d: Object.assign({}, anfang) };
    s.getItem = k => (k in s.d ? s.d[k] : null);
    s.setItem = (k, v) => { s.d[k] = String(v); };
    return s;
}
const CFG_KABEL = { PROJEKT: 'Vodafone Kabel', PROJEKT_DATEI: 'sis_vodafone.xhtml' };

// pfad, Starter-Marke, erwartet istProjektSeite, erwartet aufSollProjekt
const FAELLE = [
    // Nicht-Projektseiten: nichts zu pruefen -> aufSollProjekt true, aber der
    // Ausstieg greift trotzdem nicht (istProjektSeite false) -> Menue bleibt.
    ['/Agents/login_esl.xhtml',                 'mobile', false, true ],
    ['/Agents/secure/main.xhtml',               'mobile', false, true ],
    // Der Festgenagelt-Kern: Mobile-PC, Portal zeigt Kabel -> ZURUECK.
    ['/Agents/secure/sis_vodafone.xhtml',       'mobile', true,  false],
    ['/Agents/secure/sis_vodafone_mobile.xhtml','mobile', true,  true ],
    ['/Agents/secure/sis_vodafone.xhtml',       'kabel',  true,  true ],
    // Der UM-Pfad traegt ein kodiertes Leerzeichen. projektDateiHier dekodiert
    // bewusst, weil es je nach Aufrufweg mal so und mal als echtes Leerzeichen
    // ankommt — der DATEINAME bleibt in beiden Faellen derselbe.
    ['/Agents/secure%20/sis_vodafone_um.xhtml', 'um',     true,  true ],
    ['/Agents/secure /sis_vodafone_um.xhtml',   'um',     true,  true ],
    ['/Agents/secure%20/sis_vodafone_um.xhtml', 'kabel',  true,  false]
];
for (const [pfad, marke, eIst, eSoll] of FAELLE) {
    const st = speicherStub(marke ? { rcEslProjekt: marke } : {});
    const f = bauen({ pathname: pfad }, CFG_KABEL, st, { log(){} });
    gleich('istProjektSeite ' + pfad.padEnd(44) + ' Marke=' + marke, f.istProjektSeite(), eIst);
    gleich('aufSollProjekt  ' + pfad.padEnd(44) + ' Marke=' + marke, f.aufSollProjekt(), eSoll);
    // Das ist die Bedingung, die im Code wirklich entscheidet.
    gleich('  -> Ausstieg ohne Menue', f.istProjektSeite() && f.aufSollProjekt(), eIst && eSoll);
}
// sollProjekt: Marke (Starter-Parameter) schlaegt die einkompilierte CFG.
{
    const f = bauen({ pathname: '/Agents/login_esl.xhtml' }, CFG_KABEL, speicherStub({ rcEslProjekt: 'mobile' }), { log(){} });
    pruef('sollProjekt folgt der Starter-Marke (mobile schlaegt CFG-Kabel)',
          f.sollProjekt().name === 'Vodafone Mobile', f.sollProjekt().name);
}
// GEGENPROBE: ohne Marke gilt die einkompilierte CFG-Vorgabe (Handstart F12).
{
    const f = bauen({ pathname: '/Agents/login_esl.xhtml' }, CFG_KABEL, speicherStub({}), { log(){} });
    pruef('ohne Marke waehlt sollProjekt die CFG-Vorgabe (Kabel)',
          f.sollProjekt().name === 'Vodafone Kabel' && f.sollProjekt().datei === 'sis_vodafone.xhtml');
    pruef('auf der Anmeldeseite greift der Ausstieg NICHT (Menue bleibt erreichbar)',
          !f.istProjektSeite());
}

// ============================================================================
console.log('\n-- 4. Beide Varianten tragen den Fix --');
// Sie werden erzeugt (node autopilot_varianten_erzeugen.js). Laufen sie
// auseinander, faellt es sonst erst im Betrieb auf.
for (const [name, src] of [['mobile', mob], ['um', um]]) {
    pruef(name + ': istProjektSeite definiert', /function\s+istProjektSeite\s*\(/.test(src));
    // Ebenfalls nur in eslFlow messen — siehe Begruendung oben bei posMainMenu.
    const f = src.slice(src.indexOf('function eslFlow()'));
    pruef(name + ': Ausstieg vor dem Menue',
          f.indexOf('else if (istProjektSeite() && aufSollProjekt())') > 0 &&
          f.indexOf('else if (istProjektSeite() && aufSollProjekt())') <
          f.indexOf("id('frmMainMenu:mainMenu')"));
    pruef(name + ': Projekt festgenagelt (aufSollProjekt vorhanden, merkeProjektMarke raus)',
          /function aufSollProjekt\(/.test(src) && !/merkeProjektMarke/.test(src));
}
pruef('mobile zielt auf sis_vodafone_mobile.xhtml', /PROJEKT_DATEI:\s*'sis_vodafone_mobile\.xhtml'/.test(mob));
pruef('um zielt auf sis_vodafone_um.xhtml',         /PROJEKT_DATEI:\s*'sis_vodafone_um\.xhtml'/.test(um));

// ============================================================================
console.log('\n-- 5. ESL_Start.cmd versorgt die Tabs projektbewusst --');
// Ohne das bekaeme ein Mobile-Tab beim Nachlegen das KABEL-Paket untergeschoben.
pruef('die beiden Varianten werden eingelesen',
      /LiesDatei 'esl_autopilot_mobile\.user\.js'/.test(cmd) &&
      /LiesDatei 'esl_autopilot_um\.user\.js'/.test(cmd));
pruef('es gibt getrennte Pakete', /\$PaketMobile\s*=/.test(cmd) && /\$PaketUm\s*=/.test(cmd));
pruef('PaketFuer ist definiert', /function PaketFuer\(/.test(cmd));
pruef('PaketFuer wird auch AUFGERUFEN', /=\s*PaketFuer\s+\$marke/.test(cmd),
      'gebaut-aber-nie-gerufen ist im Projekt die haeufigste Fehlerklasse');
pruef('der Waechter spielt das gewaehlte Paket ein, nicht mehr blind $Paket',
      /addScriptToEvaluateOnNewDocument' @\{ source = \$p \}/.test(cmd) &&
      /expression = \$p;/.test(cmd));
pruef('die Marke wird bei JEDEM Seitenaufbau gesetzt',
      /sessionStorage\.setItem\('rcEslProjekt','\$marke'\)/.test(cmd));
pruef('der Waechter LIEST die Marke',
      /sessionStorage\.getItem\("rcEslProjekt"\)/.test(cmd));
pruef('die Marke schlaegt die Adresse (Anmeldemaske zeigt kein Projekt)',
      cmd.indexOf("if ($m -eq 'mobile' -or $u -like '*sis_vodafone_mobile*')") > 0);
pruef('fehlt eine Variante, wird NICHTS eingespielt statt Kabel',
      /if \(\$PaketMobile\) \{ return \$PaketMobile \}[\s\S]{0,200}?return \$null/.test(cmd),
      'sonst laeuft der Mobile-Tab still auf Kabel weiter');

// ============================================================================
console.log('\n-- 6. ESL_Start_Mobile_UM.cmd --');
pruef('Datei ist selbst-enthaltend (Marker #PSSTART)', cmdMU.indexOf('#PSSTART') > 0);
pruef('sie startet Edge NICHT selbst', !/Start-Process\s+-FilePath\s+\$Edge/.test(cmdMU),
      'ein zweiter Edge auf dasselbe Profil ist nicht moeglich');
pruef('sie verlangt einen laufenden ESL_Start.cmd',
      /FernsteuerungBereit \$DebugPort/.test(cmdMU) && /ZUERST ESL_Start\.cmd/.test(cmdMU));
pruef('sie setzt die Projekt-Marke', /sessionStorage\.setItem\('rcEslProjekt','\$marke'\)/.test(cmdMU));
pruef('sie legt Tabs ueber Target.createTarget an (nicht ueber PUT /json/new)',
      /Target\.createTarget/.test(cmdMU) && !/Invoke-RestMethod[^\n]*json\/new/.test(cmdMU),
      'PUT /json/new ist in neueren Edge-Fassungen abgekuendigt');
pruef('erst registrieren, dann navigieren',
      cmdMU.indexOf("addScriptToEvaluateOnNewDocument") < cmdMU.indexOf("'Page.navigate'"),
      'andersherum waere die Seite ggf. schon aufgebaut, bevor der Autopilot da ist');
pruef('doppelter Start legt keinen zweiten Tab an', /function OffeneMarken\(/.test(cmdMU) &&
      /\$schonDa -contains \$pr\.marke/.test(cmdMU));
pruef('es wird nachgemessen, ob die Tabs anlaufen', /__rcAutoPilotV2/.test(cmdMU));
// Geprueft wird die ZUWEISUNG, nicht das Vorkommen der Zeichenkette irgendwo —
// im Kopf der Datei steht "secure%20" als Erklaerung, warum genau dieser Weg
// NICHT genommen wird.
pruef('sie faehrt die Anmeldeseite an, nicht die UM-Adresse mit %20',
      /\$EslUrl\s*=\s*'https:\/\/esl\.regiocom\.net\/Agents\/login_esl\.xhtml'/.test(cmdMU) &&
      !/url\s*=\s*'[^']*secure%20/.test(cmdMU));

// ============================================================================
console.log('\n-- 7. Logo und Empfaenger --');
pruef('ESL_Start.cmd liest regiocom.png', /LiesBinaerBase64 'regiocom\.png'/.test(cmd));
pruef('das Logo reist in __rcFiles mit', /logo:\s*\$\(AlsJsText \$LogoB64\)/.test(cmd));
pruef('die Mindestgroesse ist fuer ein PNG passend (nicht 10 KB)',
      /LiesBinaerBase64 'regiocom\.png' 300/.test(cmd),
      'mit der festen 10-KB-Schwelle waere ein kleines Logo still abgelehnt worden');
pruef('ESL_Start_Mobile_UM.cmd reicht das Logo ebenfalls mit',
      /LiesBinaerBase64 'regiocom\.png' 300/.test(cmdMU) && /logo:\s*\$\(AlsJsText \$LogoB64\)/.test(cmdMU));
pruef('das Dashboard sucht auch nach "regiocom.png"', /'regiocom\.png'/.test(dash));
// Nur INNERHALB von rcLogoPngBytes vergleichen: rcLogoZeichnen() wird auch von
// den Report-Bildern gerufen, rund 7000 Zeilen weiter oben — ein Vergleich ueber
// die ganze Datei misst etwas anderes, als er behauptet.
{
    const a = dash.indexOf('async function rcLogoPngBytes()');
    const e = dash.indexOf('window.rcLogoSetzen');
    const block = (a > 0 && e > a) ? dash.slice(a, e) : '';
    pruef('__rcFiles.logo hat weiterhin Vorrang vor der Zeichnung',
          block && block.indexOf('f && f.logo') < block.indexOf('rcLogoZeichnen()'));
    pruef('beide Dateinamen werden versucht',
          /'regiocom\.png',\s*'regiocom_logo\.png'/.test(block));
}
pruef('Empfaenger der Stundenmail stimmt',
      /\$MailAn\s*=\s*'veysel\.yarba@regiocom\.com'/.test(cmd));
pruef('kein alter Empfaenger mehr in der Datei', !/veysel\.yarbs@/.test(cmd));

// ============================================================================
console.log('\n-- 8. Sitzungs-Banner verdeckt die Kopfleiste nicht --');
// Er lag als position:absolute;top:0 ueber dem Overlay — Reiter, Filter und das
// Werkzeug-Menue waren damit unerreichbar, ausgerechnet waehrend einer Stoerung.
const bannerBlock = dash.slice(dash.indexOf('function rcSessionBanner('),
                               dash.indexOf('window.rcSessionBanner = rcSessionBanner'));
// Geprueft wird der TATSAECHLICHE Stil, nicht das Wort im Kommentar daneben —
// dort steht ja gerade erklaert, warum position:absolute hier falsch war.
const bannerStil = (bannerBlock.match(/b\.style\.cssText\s*=([\s\S]*?);/) || ['', ''])[1];
pruef('der Streifen liegt nicht mehr absolut ueber dem Overlay',
      bannerStil && !/position:absolute/.test(bannerStil));
pruef('er haengt als ERSTES Kind im Fluss', /insertBefore\(b, ov\.firstChild\)/.test(bannerBlock));
pruef('er schrumpft nicht in der Flex-Spalte', /flex:0 0 auto/.test(bannerBlock));
pruef('er wird beim Re-Inject weiterhin abgeraeumt', /'rcSessionBanner'\]/.test(dash) || /rcSessionBanner'/.test(dash.slice(0, 4000)));

// ============================================================================
console.log('\n' + '='.repeat(64));
if (bad === 0) console.log('ALLE ' + ok + ' PRUEFUNGEN BESTANDEN.');
else console.log(bad + ' von ' + (ok + bad) + ' Pruefungen FEHLGESCHLAGEN.');
console.log('='.repeat(64) + '\n');
process.exit(bad === 0 ? 0 : 1);
