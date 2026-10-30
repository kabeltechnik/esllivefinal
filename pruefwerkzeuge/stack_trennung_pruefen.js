#!/usr/bin/env node
/**
 * stack_trennung_pruefen.js — prueft die Drei-Monitore-Stack-Trennung (05.08.):
 * jedes Projekt (Kabel/Mobile/UM) bekommt seine EIGENE Ligaliste (eigener
 * Referenzbaum) und seinen EIGENEN Genesys-Monitor (eigene Qualitaeten).
 *
 * Die Trennung haengt an EINEM Mechanismus: dem projektspezifischen
 * FENSTERNAMEN (rcKey('rcKpiQuelle') / rcKey('rcQueueQuelle')). Aus ihm leiten
 * beide Crawler ihr Projekt ab — tab-eigen, reload-fest, ohne neuen Kanal.
 * Belegte Grundlagen (Nutzer-Mitschnitte 05.08.):
 *   Ligaliste: Kabel=11406 · Mobile=11233,11248 · UM=12809
 *   Genesys:   Kabel=KA_TEC_TV · Mobile=MF_01+MF_02 · UM=UM_SONST_007
 *
 * Funktional wird gegen die ECHTEN Funktionen geprueft (Klammerzaehlung +
 * new Function), nicht gegen Nachbauten — ein Nachbau bewacht nur seine Kopie.
 *
 *   node pruefwerkzeuge/stack_trennung_pruefen.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const W = path.join(__dirname, '..');
const lies = n => fs.readFileSync(path.join(W, n), 'utf8');
const dash = lies('esl_live_arena_v22.js');
const kpi  = lies('kpi_crawler.js');
const gm   = lies('genesys_monitor_crawler.js');
const auto = lies('esl_autopilot.user.js');
const cmd  = lies('ESL_Start.cmd');

let ok = 0, bad = 0;
function pruef(t, b, z) {
    if (b) { ok++; console.log('  ok   ' + t); }
    else { bad++; console.log('  FEHL ' + t + (z !== undefined ? '  -> ' + z : '')); }
}
function gleich(t, ist, soll) { pruef(t + '  (ist: ' + JSON.stringify(ist) + ')', ist === soll, 'erwartet ' + JSON.stringify(soll)); }
function schneide(src, kopf) {
    const a = src.indexOf(kopf);
    if (a < 0) throw new Error('nicht gefunden: ' + kopf);
    let i = src.indexOf('{', a), t = 0;
    for (; i < src.length; i++) { if (src[i] === '{') t++; else if (src[i] === '}') { t--; if (!t) return src.slice(a, i + 1); } }
    throw new Error('Klammern gehen nicht auf: ' + kopf);
}
function blockBis(src, vonMarke, bisZeichen) {
    const a = src.indexOf(vonMarke);
    if (a < 0) throw new Error('nicht gefunden: ' + vonMarke);
    const e = src.indexOf(bisZeichen, a);
    return src.slice(a, e + bisZeichen.length);
}

// ============================================================================
console.log('\n-- 1. Fensternamen sind projektspezifisch (der Schluessel-Eingriff) --');
// Seit 28.09. steht der Name in kpiName (erst window.open('', kpiName) — ein
// laufendes Fenster wird wiedergefunden statt neu geladen).
pruef('Ligaliste wird mit rcKey(\'rcKpiQuelle\') geoeffnet',
    /window\.open\([^\n]*rcKey\('rcKpiQuelle'\)\)/.test(dash) ||
    (/const kpiName = rcKey\('rcKpiQuelle'\);/.test(dash) && /window\.open\('', kpiName\)/.test(dash) && /window\.open\(kpiUrl, kpiName\)/.test(dash)));
pruef('Genesys-Monitor mit rcKey(\'rcQueueQuelle\')',
    /window\.rcKey\('rcQueueQuelle'\)/.test(dash));
pruef('auch der Starter-Notweg (OeffneLigalisteAusDashboard) nutzt rcKey',
    /rcKey\("rcKpiQuelle"\)/.test(cmd) || /rcKey\('rcKpiQuelle'\)/.test(cmd));
pruef('kein window.open mehr mit dem nackten Namen im Dashboard',
    !/window\.open\([^\n]*,\s*'rcKpiQuelle'\)/.test(dash) &&
    !/window\.open\([^\n]*,\s*'rcQueueQuelle'\)/.test(dash));

// ============================================================================
console.log('\n-- 2. Projekt-Erkennung: sessionStorage-Rueckfall --');
const erkennen = schneide(dash, '(function rcProjektErkennen(){');
pruef('liest die Starter-Marke rcEslProjekt', /sessionStorage\.getItem\('rcEslProjekt'\)/.test(erkennen));
pruef('nur als RUECKFALL, wenn der Dateiname kein Projekt traegt',
    /if \(!window\.rcProjektKuerzel && datei\.indexOf\('sis_'\) === -1\)/.test(erkennen),
    'auf einer sis_-Seite muss der Dateiname gewinnen (direkte Beobachtung schlaegt Erinnerung)');
{
    // Funktional: den RUMPF der echten IIFE ausfuehren, Stubs als Parameter.
    const f = new Function('location', 'sessionStorage', 'window',
        erkennen.slice(erkennen.indexOf('{') + 1, erkennen.lastIndexOf('}')) + '; return window.rcProjektKuerzel;');
    const ss = v => ({ getItem: () => v });
    gleich('sis_vodafone_mobile.xhtml -> mob (Dateiname)',
        f({ pathname: '/Agents/secure/sis_vodafone_mobile.xhtml' }, ss('um'), {}), 'mob');
    gleich('login_esl.xhtml + Marke mobile -> mob (Rueckfall)',
        f({ pathname: '/Agents/login_esl.xhtml' }, ss('mobile'), {}), 'mob');
    gleich('login_esl.xhtml + Marke um -> um',
        f({ pathname: '/Agents/login_esl.xhtml' }, ss('um'), {}), 'um');
    gleich('login_esl.xhtml ohne Marke -> Kabel (leer)',
        f({ pathname: '/Agents/login_esl.xhtml' }, ss(null), {}), '');
    gleich('sis_vodafone.xhtml + fremde Marke -> Kabel (Dateiname gewinnt)',
        f({ pathname: '/Agents/secure/sis_vodafone.xhtml' }, ss('mobile'), {}), '');
}

// ============================================================================
console.log('\n-- 3. Ligalisten-Crawler: Baum aus dem Fensternamen --');
const kSrc = blockBis(kpi, 'const RC_VORLAGEN = {', '};') + '\n' +
    blockBis(kpi, 'const RC_BAEUME = [', '];') + '\n' +
    (kpi.match(/const LS_BAUM = '[^']+';/) || [''])[0] + '\n' +
    schneide(kpi, 'function projektAusName(){') + '\n' +
    schneide(kpi, 'function baumFuerProjekt(projekt){') + '\n' +
    schneide(kpi, 'function vorlageNodes(projekt){') + '\n' +
    schneide(kpi, 'function baumNodes(){');
const kBauen = new Function('window', 'localStorage', 'document',
    kSrc + '\nreturn { projektAusName, baumFuerProjekt, vorlageNodes, baumNodes };');
const lsStub = v => ({ getItem: () => v, setItem: () => {}, removeItem: () => {} });
// DOM-Stub fuer die Vorlagen-Liste des Portals. Kein jsdom im Projekt
// (Citrix ohne Adminrechte) — es reicht, was vorlageNodes wirklich anfasst:
// querySelectorAll('.crtree-templates-list-entry'), textContent, getAttribute.
const domStub = (eintraege) => ({
    querySelectorAll: () => (eintraege || []).map(e => ({
        textContent: e.name,
        getAttribute: a => (a === 'data-node_ids' ? e.nodes : null)
    }))
});
{
    const F = (name, nodesAus, baumVar, lsWert, vorlagen) =>
        kBauen({ name: name, __rcNodesAus: nodesAus, __rcBaumNodes: baumVar },
               lsStub(lsWert), domStub(vorlagen));
    // ---- Ohne Vorlagen im Portal: der hinterlegte Notnagel greift ----
    gleich('rcKpiQuelle -> 11405 (Kabel; die Vorlage des Nutzers, nicht 11406)',
        F('rcKpiQuelle').baumNodes(), '11405');
    gleich('rcKpiQuelle_mob -> 11233,11248 (Mobile, Care+Tec)', F('rcKpiQuelle_mob').baumNodes(), '11233,11248');
    gleich('rcKpiQuelle_um -> 12809 (UM)', F('rcKpiQuelle_um').baumNodes(), '12809');
    gleich('fremder Fenstername -> localStorage-Wert (altes Verhalten)',
        F('irgendwas', null, null, '99999').baumNodes(), '99999');
    gleich('unbenannter Tab ohne localStorage -> leer (Portal-Baum gilt)',
        F('', null, null, null).baumNodes(), '');
    gleich('__rcBaumNodes schlaegt den Fensternamen (Konsole gewinnt)',
        F('rcKpiQuelle_mob', null, '11406').baumNodes(), '11406');
    gleich('__rcNodesAus schlaegt ALLES (Portal-Ablehnung)',
        F('rcKpiQuelle_mob', true, '11406').baumNodes(), '');
    // GEGENPROBE: falscher Erwartungswert muss auffallen.
    pruef('GEGENPROBE Ableitung liefert nicht immer dasselbe',
        F('rcKpiQuelle').baumNodes() !== F('rcKpiQuelle_um').baumNodes());

    // ---- MIT Vorlagen im Portal: die Vorlage des Nutzers gewinnt ----
    // Das ist der Kern der Korrektur vom 05.08. abends: der Nutzer pflegt
    // "Kabel TEC" / "MOB CARE" / "VUM CARE" selbst. Aendert er sie, muss der
    // Crawler folgen, ohne dass jemand eine Kennung im Code nachzieht.
    const portal = [
        { name: 'Kabel TEC', nodes: '11405' },
        { name: 'MOB CARE',  nodes: '11233,11248' },
        { name: 'VUM CARE',  nodes: '12809' },
        { name: 'ASM VKD Care', nodes: '11499' }
    ];
    gleich('Vorlage "Kabel TEC" wird gelesen', F('rcKpiQuelle', null, null, null, portal).baumNodes(), '11405');
    gleich('Vorlage "MOB CARE" wird gelesen', F('rcKpiQuelle_mob', null, null, null, portal).baumNodes(), '11233,11248');
    gleich('Vorlage "VUM CARE" wird gelesen', F('rcKpiQuelle_um', null, null, null, portal).baumNodes(), '12809');
    // ENTSCHEIDEND: eine GEAENDERTE Vorlage schlaegt die hinterlegte Kennung.
    gleich('geaenderte Vorlage gewinnt gegen RC_BAEUME',
        F('rcKpiQuelle', null, null, null, [{ name: 'Kabel TEC', nodes: '99999' }]).baumNodes(), '99999');
    gleich('Vorlagen-Name unabhaengig von Gross-/Kleinschreibung',
        F('rcKpiQuelle', null, null, null, [{ name: '  kabel tec ', nodes: '4711' }]).baumNodes(), '4711');
    gleich('fehlt die Vorlage, greift der Notnagel',
        F('rcKpiQuelle', null, null, null, [{ name: 'Ganz was anderes', nodes: '1' }]).baumNodes(), '11405');
    gleich('leeres data-node_ids zaehlt als nicht vorhanden',
        F('rcKpiQuelle', null, null, null, [{ name: 'Kabel TEC', nodes: '' }]).baumNodes(), '11405');
    pruef('GEGENPROBE Vorlagen-Erkennung greift wirklich (sonst waere alles 11405)',
        F('rcKpiQuelle', null, null, null, [{ name: 'Kabel TEC', nodes: '12345' }]).baumNodes() === '12345');
}
pruef('die drei Vorlagen-Namen stehen im Crawler',
    /RC_VORLAGEN = \{ kabel: 'Kabel TEC', mobile: 'MOB CARE', um: 'VUM CARE' \}/.test(kpi));
pruef('rcCrawlerVorlagen() als Konsolen-Diagnose vorhanden',
    /window\.rcCrawlerVorlagen = function/.test(kpi));
pruef('Portal-Fehler (ORA) wird im Klartext gemeldet, nicht nur als HTTP-Status',
    /ORA-\\d\{5\}/.test(kpi) && /Portal-Fehler: /.test(kpi));
// v6: Kennung kommt bevorzugt aus dem REQUEST-BODY (extra.projekt aus der
// geladenen Vorlage); der Fenstername ist nur noch Rueckfall.
pruef('das KPI_BATCH-Paket traegt die Projekt-Kennung (Body vor Fenstername)',
    /projekt: \(extra && extra\.projekt\) \|\| projektAusName\(\),/.test(kpi) &&
    /baumNodes: \(extra && extra\.baumNodes\) \|\| baumNodes\(\) \|\| null/.test(kpi));

// ============================================================================
console.log('\n-- 4. Dashboard verwirft fremde Liga-Pakete --');
pruef('rcEigenesProjekt ist definiert', /function rcEigenesProjekt\(\)/.test(dash));
// 27.09.: einzige erlaubte Ausnahme ist der Alle-Projekte-Betrieb (EIN Dashboard,
// EINE Ligaliste fuer alle drei Projekte). Im Einzelprojekt gilt der Filter unveraendert.
pruef('handleKpiMessage verwirft fremde Kennungen (Ausnahme nur Alle-Projekte-Betrieb)',
    /if \(d\.projekt && d\.projekt !== rcEigenesProjekt\(\)(?: && !window\.rcAlleProjekteModus)?\) return false;/.test(dash));
{
    const f = new Function('window', schneide(dash, 'function rcEigenesProjekt(){') + '\nreturn rcEigenesProjekt();');
    gleich('Kuerzel "" -> kabel', f({ rcProjektKuerzel: '' }), 'kabel');
    gleich('Kuerzel mob -> mobile', f({ rcProjektKuerzel: 'mob' }), 'mobile');
    gleich('Kuerzel um -> um', f({ rcProjektKuerzel: 'um' }), 'um');
}
// Der Filter muss VOR der Verarbeitung stehen — insbesondere vor dem
// Bestand-ERSETZEN (rcKpiBestandSetzen), das ist der eigentliche Schaden.
pruef('Filter steht vor dem KPI_BATCH-Zweig',
    dash.indexOf("d.projekt && d.projekt !== rcEigenesProjekt()") <
    dash.indexOf("d.type === 'KPI_BATCH' && Array.isArray(d.payload)"));
pruef('Pakete OHNE Kennung werden weiter angenommen (nur d.projekt truthy filtert)',
    /if \(d\.projekt &&/.test(dash));

// ============================================================================
console.log('\n-- 5. Warteschleife: Konfiguration und Vorgaben je Projekt --');
pruef('rcQueueCfg_v1 laeuft jetzt durch rcKey', /var CFGK = rcKey\('rcQueueCfg_v1'\);/.test(dash));
pruef('kein roher rcQueueCfg_v1-Schluessel mehr', !/CFGK = 'rcQueueCfg_v1'/.test(dash));
pruef('rcQueueStdAbfrage ist eine Funktionsdeklaration (stdCfg ruft sie vor der Definition)',
    /function rcQueueStdAbfrage\(\)/.test(dash));
{
    const f = new Function('window', schneide(dash, 'function rcQueueStdAbfrage(){') + '\nreturn rcQueueStdAbfrage();');
    gleich('Kabel-Vorgabe', JSON.stringify(f({ rcProjektKuerzel: '' })), JSON.stringify(['CCS_Category_KA_TEC_TV']));
    gleich('Mobile-Vorgabe (Care+Tec)', JSON.stringify(f({ rcProjektKuerzel: 'mob' })), JSON.stringify(['CCS_Category_MF_01', 'CCS_Category_MF_02']));
    gleich('UM-Vorgabe', JSON.stringify(f({ rcProjektKuerzel: 'um' })), JSON.stringify(['CCS_Category_UM_SONST_007']));
}
pruef('stdCfg nutzt die Projekt-Vorgabe', /abfrage: rcQueueStdAbfrage\(\)\.slice\(\)/.test(dash));
pruef('STD_QUALITAET kommt aus derselben Quelle', /var STD_QUALITAET = rcQueueStdAbfrage\(\)\[0\];/.test(dash));
pruef('rcQueueIngest verwirft fremde gm_daten',
    /payload\.projekt && payload\.projekt !== rcEigenesProjekt\(\)/.test(dash));

// ============================================================================
console.log('\n-- 6. Genesys-Crawler: Auswahl tab-eigen, Vorgabe je Projekt --');
const gmSrc = (gm.match(/var LS_AUSWAHL\s*=\s*'[^']+';/) || [''])[0] + '\n' +
    (gm.match(/var SS_AUSWAHL = '[^']+';/) || [''])[0] + '\n' +
    schneide(gm, 'function projektAusName() {') + '\n' +
    schneide(gm, 'function stdAbfrage() {') + '\n' +
    'var STD_QUALITAET = stdAbfrage()[0];\n' +
    schneide(gm, 'function auswahlLesen() {') + '\n' +
    schneide(gm, 'function auswahlSchreiben(liste) {');
function gmBauen(name, ssWert, lsWert) {
    const schreib = { ss: null, ls: null };
    const f = new Function('window', 'sessionStorage', 'localStorage',
        gmSrc + '\nreturn { lesen: auswahlLesen, schreiben: auswahlSchreiben, std: stdAbfrage };');
    const api = f({ name: name },
        { getItem: () => ssWert, setItem: (k, v) => { schreib.ss = v; } },
        { getItem: () => lsWert, setItem: (k, v) => { schreib.ls = v; } });
    return { api, schreib };
}
{
    gleich('Monitor rcQueueQuelle_mob ohne Gespeichertes -> MF_01+MF_02',
        JSON.stringify(gmBauen('rcQueueQuelle_mob', null, null).api.lesen()),
        JSON.stringify(['CCS_Category_MF_01', 'CCS_Category_MF_02']));
    gleich('Monitor rcQueueQuelle_um -> UM_SONST_007',
        JSON.stringify(gmBauen('rcQueueQuelle_um', null, null).api.lesen()),
        JSON.stringify(['CCS_Category_UM_SONST_007']));
    // DIE Kollision, um die es geht: im geteilten localStorage liegt die
    // KABEL-Auswahl — ein benannter Mobile-Tab darf sie NICHT lesen.
    gleich('Mobile-Tab liest NICHT die Kabel-Auswahl aus localStorage',
        JSON.stringify(gmBauen('rcQueueQuelle_mob', null, JSON.stringify(['CCS_Category_KA_TEC_TV'])).api.lesen()),
        JSON.stringify(['CCS_Category_MF_01', 'CCS_Category_MF_02']));
    gleich('sessionStorage (eigener Tab) schlaegt alles',
        JSON.stringify(gmBauen('rcQueueQuelle_mob', JSON.stringify(['X']), null).api.lesen()),
        JSON.stringify(['X']));
    gleich('unbenannter Hand-Tab liest weiter localStorage (altes Verhalten)',
        JSON.stringify(gmBauen('', null, JSON.stringify(['Y'])).api.lesen()),
        JSON.stringify(['Y']));
    const b1 = gmBauen('rcQueueQuelle_mob', null, null); b1.api.schreiben(['A']);
    pruef('benannter Tab schreibt NUR sessionStorage', b1.schreib.ss !== null && b1.schreib.ls === null,
        JSON.stringify(b1.schreib));
    const b2 = gmBauen('', null, null); b2.api.schreiben(['A']);
    pruef('unbenannter Tab schreibt beide (Kompatibilitaet)', b2.schreib.ss !== null && b2.schreib.ls !== null);
}
pruef('gm_daten traegt die Projekt-Kennung', /projekt: projektAusName\(\) \};/.test(gm));
pruef('fehlende Qualitaeten werden beim START nachgelernt (nicht nur bei leerem Katalog)',
    /var fehlend = auswahlLesen\(\)\.filter\(function \(k\) \{ return !RC_GM\.katalog\[k\]; \}\);/.test(gm) &&
    /lerneAlle\(LERN_GRENZE_STD, fehlend\)/.test(gm),
    'sonst zeigt ein Mobile-Monitor still Kabel-Zahlen (aktiveFilter-Rueckfall)');
pruef('auch das gm_auswahl-Kommando lernt fehlende nach',
    /var fehlend = d\.keys\.filter\(function \(k\) \{ return !RC_GM\.katalog\[k\]; \}\);/.test(gm));

// ============================================================================
console.log('\n-- 7. Autopilot: Ziel-Erkennung nach Login vertraegt Suffixe --');
pruef('Praefix-Vergleich statt exakt',
    /wname\.indexOf\('rcQueueQuelle'\) === 0/.test(auto) && !/window\.name === 'rcQueueQuelle'/.test(auto));

// ============================================================================
console.log('\n-- 8. Starter: ein Start je Stack --');
// ESL_Start_Mobile_UM.cmd (der alte Dazuschalt-Weg, hing fest auf Port 9222
// und haette Mobile-/UM-Tabs in den KABEL-Browser gelegt) ist am 11.10.
// entfernt worden - seit 07.08. brach sie nur noch ab. Ihre Innereien zu
// pruefen ergibt keinen Sinn mehr; geprueft wird, dass sie weg bleibt.
pruef('ESL_Start_Mobile_UM.cmd ist entfernt',
    !fs.existsSync(path.join(W, 'ESL_Start_Mobile_UM.cmd')));
pruef('... und steht nicht mehr im Update-Paket',
    !/name:\s*'ESL_Start_Mobile_UM\.cmd'/.test(lies('bundle_bauen.js')));
// Seit 06.08. spaetabends rufen die Wrapper ESL_Start.cmd direkt (ein PC =
// ein Projekt, eigener Edge) — nicht mehr das Dazuschalten von Tabs im
// laufenden Kabel-Edge (geteilte Server-Sitzung kippte die Projekte).
for (const [datei, marke] of [['ESL_Start_Mobile.cmd', 'mobile'], ['ESL_Start_UM.cmd', 'um']]) {
    let w = '';
    try { w = lies(datei); } catch (e) {}
    pruef(datei + ' existiert und startet ESL_Start.cmd mit "' + marke + '"',
        new RegExp('call "%~dp0ESL_Start\\.cmd" ' + marke).test(w));
    pruef(datei + ' enthaelt KEINE eigene Logik (Wrapper unter 20 Zeilen)',
        w && w.split('\n').length < 20, w ? w.split('\n').length : 'fehlt');
    pruef(datei + ' ruft NICHT mehr den Tab-Dazuschalt-Weg',
        !/ESL_Start_Mobile_UM\.cmd/.test(w.replace(/REM[^\n]*/g, '')));
}
// Der Starter selbst kennt den Projekt-Parameter und nagelt ihn fest.
{
    const st = lies('ESL_Start.cmd');
    pruef('ESL_Start.cmd liest den Projekt-Parameter (ESLPROJEKT)',
        /set "ESLPROJEKT=%~1"/.test(st) && /\$ProjektWahl = \(''\s*\+\s*\$env:ESLPROJEKT\)/.test(st));
    pruef('unbekannter Parameter bricht ab (kabel/mobile/um)',
        /Unbekanntes Projekt/.test(st));
    pruef('das Grundpaket ist das des GEWAEHLTEN Projekts, nicht fest Kabel',
        /\$Paket\s*=\s*BauPaket \$AutopilotAktiv \$ProjektWahl/.test(st));
    pruef('die Variante des gewaehlten Projekts ist PFLICHT',
        /LiesDatei 'esl_autopilot_mobile\.user\.js' \(\$ProjektWahl -eq 'mobile'\)/.test(st));
}

// ============================================================================
console.log('\n-- EIGENER BROWSER JE PROJEKT (07.08.) --');
// Nutzer-Vorgabe: "jedes Stack soll einen eigenen Browser haben mit Ligaliste
// und Genesys". Zwei Dinge muessen dafuer je Projekt verschieden sein, sonst
// ist die Trennung nur scheinbar da:
//   Profil -> eigener Cookie-Jar -> eigene ESL-Server-Sitzung
//   Port   -> der Starter redet mit SEINEM Browser, nicht mit dem ersten
{
    const st = lies('ESL_Start.cmd');
    const profilZeile = (st.match(/\$ProfilName\s*=\s*@\{[^}]*\}/) || [''])[0];
    const portZeile   = (st.match(/\$DebugPort\s*=\s*@\{[^}]*\}/) || [''])[0];

    pruef('ESL_Start.cmd waehlt den Profilordner je Projekt', !!profilZeile, profilZeile || 'keine Zuordnung gefunden');
    pruef('ESL_Start.cmd waehlt den Debug-Port je Projekt',   !!portZeile,   portZeile || 'keine Zuordnung gefunden');

    // Kabel MUSS ohne Zusatz bleiben — sonst waeren die gespeicherten
    // Zugangsdaten nach dem Update weg (gleiche Regel wie bei rcKey()).
    pruef('Kabel behaelt den Profilordner OHNE Zusatz (sonst sind die Passwoerter weg)',
        /kabel\s*=\s*'EdgeProfil'\s*;/.test(profilZeile), profilZeile);
    pruef('Kabel behaelt Port 9222 (der Wert stand vorher fest im Skript)',
        /kabel\s*=\s*9222/.test(portZeile), portZeile);

    // Alle drei Werte muessen VERSCHIEDEN sein — genau das ist die Trennung.
    const profile = (profilZeile.match(/'EdgeProfil[^']*'/g) || []).map(s => s.slice(1, -1));
    const ports   = (portZeile.match(/\b\d{4}\b/g) || []);
    pruef('drei verschiedene Profilordner (keine zwei teilen sich einen Cookie-Jar)',
        profile.length === 3 && new Set(profile).size === 3, JSON.stringify(profile));
    pruef('drei verschiedene Debug-Ports (kein Starter redet mit fremdem Browser)',
        ports.length === 3 && new Set(ports).size === 3, JSON.stringify(ports));

    // Der Profilordner darf danach nicht doch wieder hart gesetzt werden.
    pruef('der Edge-Start benutzt $ProfilName und nicht mehr den festen Ordner',
        /\$Profil = Join-Path \$Basis \$ProfilName/.test(st) &&
        !/\$Profil = Join-Path \$Basis 'EdgeProfil'/.test(st));
    // GEGENPROBE: haette die Pruefung den alten Zustand erkannt?
    pruef('Gegenprobe: der alte feste Port steht nicht mehr als Zuweisung im Skript',
        !/^\s*\$DebugPort\s*=\s*9222\s*$/m.test(st.replace(/#[^\n]*/g, '')));

    // Stundenmail: drei gleichzeitige Starter duerfen nicht drei Mails schicken.
    pruef('Stundenmail laeuft nur im Kabel-Starter',
        /\$MailAktiv -and \$ProjektWahl -ne 'kabel'/.test(st));
}

// ============================================================================
console.log('\n' + '='.repeat(64));
if (bad === 0) console.log('ALLE ' + ok + ' PRUEFUNGEN BESTANDEN.');
else console.log(bad + ' von ' + (ok + bad) + ' Pruefungen FEHLGESCHLAGEN.');
console.log('='.repeat(64) + '\n');
process.exit(bad ? 1 : 0);
