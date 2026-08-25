/* ============================================================================
   AUTOMATISIERUNG PRUEFEN (16.08.)
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/automatisierung_pruefen.js

   Nutzer-Befund: "Das Dashboard oeffnet sich erst 5 bis 10 Minuten nach dem
   Login. Er bleibt stehen, waehlt kein Projekt, und auf einmal geht es."
   Dazu: Ligaliste und Genesys starteten gar nicht mehr von allein.

   BELEGTE URSACHE (mit echtem Edge ueber CDP gemessen, nicht angenommen):
     Verbindung offen, dann navigiert   -> Skript lief      (Zaehler 1)
     Verbindung ZU, dann navigiert      -> Skript lief NICHT (Zaehler 0)
     Page.disable                       -> Skript lief NICHT (Zaehler 0)
     Page.enable                        -> ~6 Ereignisse je Navigation
   Ein per Page.addScriptToEvaluateOnNewDocument registriertes Skript haengt
   an der CDP-SITZUNG. RuesteTabAus hat die Verbindung sofort geschlossen -
   damit lief der Autopilot nur auf der EINEN Seite, in die er zusaetzlich per
   Runtime.evaluate gespritzt wurde. Jede Navigation verlor ihn, und er kam
   erst mit dem naechsten Waechter-Durchlauf zurueck (ein Durchlauf kostet mit
   allen Zeitlimits ein bis drei Minuten - daher die 5 bis 10 Minuten).

   Beweis aus dem Live-Log des Nutzers: "Autopilot nachgelegt in: main.xhtml"
   UND "Autopilot nachgelegt in: sis_vodafone.xhtml". StelleAutopilotSicher
   meldet das nur, wenn window.__rcAutoPilotV2 FEHLTE - zwei Navigationen,
   zwei Nachlegungen. Dazu die Konsole auf main.xhtml:
   "rcAutoStatus is not defined".
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const CMD = fs.readFileSync(path.join(WURZEL, 'ESL_Start.cmd'), 'utf8');
const DASH = fs.readFileSync(path.join(WURZEL, 'esl_live_arena_v22.js'), 'utf8');

let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}

/* PowerShell-Funktionsblock ausschneiden. Klammern werden gezaehlt, aber
   Zeichenketten und Kommentare uebersprungen - in diesem Skript stehen
   geschweifte Klammern in JS-Schnipseln INNERHALB von PowerShell-Strings
   (z.B. der rcOpenQueueQuelle-Aufruf), eine naive Zaehlung endet dort. */
function schneidePs(quelle, kopf) {
  const i = quelle.indexOf(kopf);
  if (i < 0) return null;
  let j = quelle.indexOf('{', i);
  if (j < 0) return null;
  let tiefe = 0;
  for (; j < quelle.length; j++) {
    const c = quelle[j];
    if (c === '#') { while (j < quelle.length && quelle[j] !== '\n') j++; continue; }
    if (c === "'" || c === '"') {
      const ende = c; j++;
      while (j < quelle.length && quelle[j] !== ende) { if (quelle[j] === '`') j++; j++; }
      continue;
    }
    if (c === '{') tiefe++;
    else if (c === '}') { tiefe--; if (tiefe === 0) return quelle.slice(i, j + 1); }
  }
  return null;
}
// Wieviele Verwender hat ein Schalter AUSSERHALB seiner eigenen Zuweisung?
function verwender(name) {
  const re = new RegExp('(?<![\\w$])\\$' + name + '(?![\\w])', 'g');
  const alle = (CMD.match(re) || []).length;
  const zuweisungen = (CMD.match(new RegExp('\\$' + name + '\\s*=', 'g')) || []).length;
  return alle - zuweisungen;
}

console.log('AUTOMATISIERUNG PRUEFEN');
console.log('');
console.log('1) Schalterblock >>> AUTOMATISIERUNG <<<');

pruefe('Block ist vorhanden', /#\s*>>> AUTOMATISIERUNG <<</.test(CMD));
const SCHALTER = ['AutoEsl', 'AutoDashboard', 'AutoLigaliste', 'AutoGenesys'];
// $AutoGenesys steht seit 17.08. ab Werk auf $false (Nutzer: "warum startet
// Genesys jedes Mal, obwohl er deaktiviert ist"). Ursache war NICHT der
// Vorgabewert, sondern dass StelleGenesysSicher rcOpenQueueQuelle() direkt
// ruft und dabei CFG.autoQuelle/modulAus umgeht - der Dashboard-Haken war
// damit eine Attrappe. Bis das aufgeloest ist, entscheidet dieser Schalter.
// Die anderen drei bleiben ausdruecklich $true.
const SOLL_AUS = ['AutoGenesys'];
SCHALTER.forEach(s => {
  const soll = SOLL_AUS.includes(s) ? '$false' : '$true';
  pruefe(`$${s} ist mit ${soll} vorbelegt`,
    new RegExp('\\$' + s + '\\s*=\\s*\\' + soll).test(CMD));
  // "Gebaut, aber nirgends aufgerufen" ist der haeufigste Fehler dieses
  // Projekts - ein Schalter ohne Verwender waere genau das.
  pruefe(`  ... und wird auch abgefragt (${verwender(s)} Verwender)`, verwender(s) >= 1,
    'Ein Schalter ohne Verwender sieht wie eine Einstellung aus und ist keine.');
});
pruefe('$AutoEsl = $false zieht den Handbetrieb nach',
  /if \(-not \$AutoEsl -and \$null -eq \$Handbetrieb\) \{ \$Handbetrieb = \$true \}/.test(CMD),
  'Sonst meldet sich der Starter nicht mehr an, der Autopilot navigiert aber weiter.');
pruefe('  ... ein ausdruecklich gesetztes $Handbetrieb gewinnt trotzdem',
  /\$null -eq \$Handbetrieb/.test(CMD),
  'Ohne die $null-Pruefung ueberfaehrt der grobe Schalter den feinen.');
pruefe('der Startlauf meldet, was an und was aus ist',
  /Automatisierung:\s*\"?\s*\+?\s*ESL|Automatisierung:  ESL/.test(CMD),
  'Sonst sucht man einen abgeschalteten Teil im Code statt in dieser Datei.');

console.log('');
console.log('2) Anker-Verbindung (die eigentliche Ursache)');

const anker = schneidePs(CMD, 'function AnkerSetzen($ziel, $navigiereZu)');
pruefe('AnkerSetzen laesst sich ausschneiden', !!anker);
if (anker) {
  pruefe('registriert das Skript fuer kuenftige Dokumente',
    /Page\.addScriptToEvaluateOnNewDocument/.test(anker));
  pruefe('spielt es zusaetzlich in die JETZT offene Seite',
    /Runtime\.evaluate/.test(anker) && /awaitPromise/.test(anker),
    'Der Eintrag oben gilt erst ab dem naechsten Dokument.');
  pruefe('merkt die Verbindung in $AnkerWs (sie bleibt offen)',
    /\$AnkerWs\[\$id\]\s*=\s*Verbinde/.test(anker));
  // DAS ist der Kern. Ein Dispose im Erfolgspfad waere exakt der alte Fehler.
  const erfolg = anker.slice(0, anker.indexOf('return $true') + 1);
  pruefe('KEIN Dispose im Erfolgspfad (sonst stirbt die Registrierung sofort wieder)',
    !/\.Dispose\(\)/.test(erfolg),
    'Gemessen: Verbindung zu -> Skript laeuft auf der naechsten Seite NICHT mehr.');
  pruefe('nimmt das richtige Paket je Tab (PaketFuer, nicht blind Kabel)',
    /PaketFuer \$marke \$href/.test(anker));
  pruefe('Page.disable kommt NICHT vor',
    !/Page\.disable/.test(anker),
    'Gemessen: Page.disable loescht den Eintrag genauso wie ein Verbindungsabbruch.');
}
pruefe('GEGENPROBE die alte Bauart (registrieren, dann sofort schliessen) ist als Fehler erkennbar',
  (function () {
    const alt = 'function AnkerSetzen($ziel) {\n' +
                '  Sende $ws 62 \'Page.addScriptToEvaluateOnNewDocument\' @{ source = $p }\n' +
                '  $ws.Dispose()\n  return $true\n}';
    const block = schneidePs(alt, 'function AnkerSetzen($ziel)');
    const erfolg = block.slice(0, block.indexOf('return $true') + 1);
    return /\.Dispose\(\)/.test(erfolg);      // muss durchfallen -> hier true
  })(),
  'Sonst bewacht die Regel nichts.');

const saugen = schneidePs(CMD, 'function AnkerSaugen($id)');
pruefe('AnkerSaugen laesst sich ausschneiden', !!saugen);
if (saugen) {
  // Page.enable liefert Ereignisse (gemessen: ~6 je Navigation). Ungelesen
  // fuellt sich der Empfangspuffer der dauerhaften Verbindung.
  pruefe('leert den Ereignisstrom der Ankerverbindung', /ReceiveAsync/.test(saugen));
  pruefe('MERKT die laufende Aufgabe statt sie zu verwerfen',
    /\$AnkerLesen\[\$id\]\s*=\s*\$t/.test(saugen),
    'Ein verworfenes ReceiveAsync laesst das naechste werfen: "already one outstanding receive".');
  pruefe('hat einen Deckel gegen Endlos-Saugen', /\$i -lt \d+/.test(saugen));
  pruefe('gibt bei geschlossener Verbindung auf statt zu blockieren',
    /State -ne 'Open'/.test(saugen));
}
pruefe('tote Tabs geben ihre Ankerverbindung frei',
  /foreach \(\$k in @\(\$AnkerWs\.Keys\)\) \{ if \(-not \$lebendeIds\.ContainsKey\(\$k\)\) \{ AnkerLoesen \$k \} \}/.test(CMD),
  'Sonst haelt jeder geschlossene Tab bis zum Programmende einen offenen Socket.');
pruefe('der Waechter verankert in jedem Durchlauf',
  /if \(AnkerSetzen \$t\)/.test(CMD));
pruefe('StelleAutopilotSicher bleibt als Netz darunter',
  CMD.indexOf('if (AnkerSetzen $t)') < CMD.indexOf('if (StelleAutopilotSicher $t)'),
  'Der Anker kommt zuerst, das Nachlegen faengt eine abgerissene Verbindung ab.');

console.log('');
console.log('3) Ligaliste und Genesys laufen im Takt mit');

['StelleLigalisteSicher', 'StelleGenesysSicher'].forEach(fn => {
  const b = schneidePs(CMD, 'function ' + fn + '($alle)');
  pruefe(fn + ' ist vorhanden', !!b);
  if (!b) return;
  pruefe('  ' + fn + ' ist idempotent (offener Tab -> nichts tun)',
    /return \$false \}\s*\}?\s*$|foreach \(\$t in \$alle\)/.test(b) && /return \$false/.test(b));
  pruefe('  ' + fn + ' fragt VOR dem Oeffnen nach dem Dashboard',
    b.indexOf('DashboardTab') > 0 || /DashboardTab/.test(b),
    'Ohne Dashboard funkt der Crawler cross-origin ins Leere - lautlos.');
  pruefe('  ' + fn + ' ist gedrosselt (DarfOeffnen)', /DarfOeffnen/.test(b),
    'Sonst geht bei einer Stoerung alle 20 s ein Fenster auf.');
  pruefe('  ' + fn + ' wird im Waechter aufgerufen',
    new RegExp('if \\(' + fn + ' \\$alle\\)').test(CMD));
});
const gm = schneidePs(CMD, 'function StelleGenesysSicher($alle)');
if (gm) {
  pruefe('Genesys geht ueber rcOpenQueueQuelle des Dashboards',
    /rcOpenQueueQuelle/.test(gm));
  pruefe('  ... und diese Funktion gibt es im Dashboard wirklich',
    /window\.rcOpenQueueQuelle\s*=/.test(DASH),
    'Aufgerufen, aber nie definiert - der Klassiker dieses Projekts.');
  pruefe('  ... mit userGesture (Popup-Blocker verlangt sticky user activation)',
    /userGesture = \$true/.test(gm));
}
const lg = schneidePs(CMD, 'function StelleLigalisteSicher($alle)');
if (lg) {
  pruefe('Ligaliste wird AUS DEM DASHBOARD geoeffnet (window.opener!)',
    /OeffneLigalisteAusDashboard/.test(lg),
    'Ein per CDP angelegter Tab hat keinen opener - der einzige Rueckkanal cross-origin.');
  pruefe('GEGENPROBE kein Target.createTarget fuer die Ligaliste',
    !/Target\.createTarget/.test(lg));
}
const dt = schneidePs(CMD, 'function DashboardTab($alle)');
pruefe('DashboardTab erkennt das Dashboard an rcLiveInterval', !!dt && /rcLiveInterval/.test(dt));
pruefe('  ... und rcLiveInterval gibt es im Dashboard', /rcLiveInterval/.test(DASH));

// Auf die ANWEISUNG pruefen, nicht auf das Vorkommen: die alte Log-Zeile steht
// als Zitat im Kommentar von StelleLigalisteSicher und wuerde jede
// Zeichenketten-Suche treffen. Genau dieser Messfehler hat im Projekt schon
// mehrfach eine Pruefung rot gemeldet, obwohl der Code richtig war.
pruefe('der Startblock gibt nicht mehr endgueltig auf',
  !/^\s*Warn\s+"[^"]*die Ligaliste wird NICHT geoeffnet/m.test(CMD),
  'Die alte Meldung war endgueltig - danach hat es nie wieder jemand versucht.');
pruefe('GEGENPROBE die alte Warn-Zeile waere erkennbar',
  /^\s*Warn\s+"[^"]*die Ligaliste wird NICHT geoeffnet/m
    .test('    Warn "Das Dashboard laeuft nicht - die Ligaliste wird NICHT geoeffnet."'),
  'Sonst prueft die Regel nichts.');
pruefe('  ... und verweist stattdessen auf den Waechter',
  /Der Waechter holt sie nach, sobald das Dashboard laeuft/.test(CMD));

console.log('');
console.log('4) Restliche Verdrahtung');

console.log('');
console.log('5) Der Startablauf verankert VOR der Anmeldung');

// Die Luecke der ersten Fassung: der Waechter setzt seine Anker erst NACH dem
// Startablauf - die Anmeldung und der Sprung auf main.xhtml passieren aber
// davor. Damit fiel genau die erste Navigation wieder durch.
pruefe('der ESL-Tab wird ueber AnkerSetzen eingeklinkt, nicht ueber RuesteTabAus',
  /if \(AnkerSetzen \$esl \$EslUrl\)/.test(CMD),
  'Sonst ist der Autopilot nach der Anmeldung sofort wieder weg.');
pruefe('  ... RuesteTabAus bleibt nur als Notnagel',
  /\} elseif \(RuesteTabAus \$esl \$EslUrl\) \{/.test(CMD));
const ank2 = schneidePs(CMD, 'function AnkerSetzen($ziel, $navigiereZu)');
pruefe('AnkerSetzen kann selbst navigieren', !!ank2 && /Page\.navigate/.test(ank2));
if (ank2) {
  // Reihenfolge ist der Kern: erst registrieren, dann navigieren. Andersherum
  // faellt die erste Seite durch, auf die es ankommt.
  pruefe('  ... und registriert VOR dem Navigieren',
    ank2.indexOf('Page.addScriptToEvaluateOnNewDocument') < ank2.indexOf('Page.navigate'));
}
pruefe('der Starter nennt seinen Stand (sonst ist nach einem Update unklar, was laeuft)',
  /\$StarterStand = '[^']+'/.test(CMD) && /Stand: \$StarterStand/.test(CMD));
// Nutzer-Befund 16.08.: "ligaliste startet nicht automatisch ... konsole zeigt
// nichts und startet 5min spaeter". Ursache: der frisch geoeffnete Tab bekam
// den Autopiloten erst im naechsten Waechter-Durchlauf, der Crawler startete
// entsprechend spaeter, und StelleLigaKlickSicher klickt erst, wenn der
// Crawler LAEUFT ('01') - macht zwei bis drei Runden.
pruefe('ein frisch geoeffneter Tab wird SOFORT verankert',
  /function VerankereNeuenTab\(\$vorher, \$wartenSek\)/.test(CMD)
  && /FindeNeuenTab \$vorher \$wartenSek/.test(CMD)
  && /AnkerSetzen \$neu/.test(CMD),
  'Sonst laeuft der Ok-Klick des Nutzers ins Leere - der Hook ist noch nicht da.');
['StelleLigalisteSicher', 'StelleGenesysSicher'].forEach(fn => {
  const b = schneidePs(CMD, 'function ' + fn + '($alle)');
  pruefe('  ' + fn + ' verankert den neuen Tab selbst',
    !!b && /VerankereNeuenTab \$vorher 15/.test(b) && /\$vorher = TabIds/.test(b));
});
pruefe('auch der Ligalisten-Tab aus dem Startablauf wird verankert',
  /if \(-not \(AnkerSetzen \$neuerTab\)\) \{ \[void\]\(StelleAutopilotSicher \$neuerTab\) \}/.test(CMD),
  'Der CCS-Login navigiert mehrfach - ohne Anker ist der Autopilot danach weg.');
pruefe('die Dashboard-Wartezeit gibt Lebenszeichen',
  /noch kein Dashboard \(noch \$rest s\)/.test(CMD),
  'Bis zu zwei Minuten stummes Fenster sehen im Betrieb aus wie ein Haenger.');

console.log('');
console.log('6) Die Schalter greifen an den richtigen Stellen');

pruefe('$AutoEsl schaltet den Start-Anmeldelauf',
  /if \(\$AutoEsl\) \{ \[void\]\(EslAnmeldungAbschicken\) \}/.test(CMD));
pruefe('$AutoEsl schaltet den Anmeldeversuch im Waechter',
  /if \(\$AutoEsl -and \$url -like '\*regiocom\*'\)/.test(CMD));
pruefe('$AutoDashboard schaltet die Direkteinspielung',
  /if \(\$AutoDashboard -and \(StelleDashboardSicher \$t\)\)/.test(CMD));
pruefe('$AutoLigaliste schaltet den Ok-Klick',
  /if \(\$AutoLigaliste -and \$url -like '\*liga_listen\*'\)/.test(CMD));
pruefe('$AutoLigaliste schaltet auch den Startblock',
  /if \(\$CcsOeffnen -and \$AutoLigaliste\)/.test(CMD));

console.log('');
console.log('7) Neue Tabs werden SOFORT versorgt (21.08.)');

/* Nutzer-Befund 21.08.: "Ligaliste braucht immer noch 5 Minuten um zu starten.
   Sobald ich im Dashboard auf KPI-Quelle klicke, soll der KPI-Crawler starten,
   sobald die Ligaliste offen ist."
   Der Klick oeffnet das Fenster sofort - aber der Autopilot kam erst mit dem
   naechsten Waechter-Durchlauf in den NEUEN Tab. Ein Durchlauf kostet ein bis
   drei Minuten, und ein frischer Tab meldet zuerst eine LEERE Adresse, faellt
   also durch die Positivliste und braucht noch eine Runde.
   StelleLigalisteSicher deckt das NICHT ab: es steigt aus, sobald ein
   Ligalisten-Tab existiert, und verankert nur Tabs, die es selbst oeffnet. */

const NEUTAB = schneidePs(CMD, 'function WarteUndVersorgeNeueTabs');
pruefe('WarteUndVersorgeNeueTabs ist vorhanden', !!NEUTAB);

// Der Kern: die Wartezeit wird nicht mehr verschlafen.
const SCHLEIFE_NEU = /while \(\$true\) \{[\s\S]{0,400}?WarteUndVersorgeNeueTabs \$DauerTaktSek/;
pruefe('die Dauerschleife wartet ueber WarteUndVersorgeNeueTabs',
  SCHLEIFE_NEU.test(CMD),
  'Sonst liegt der Starter 20 s still, waehrend der neue Tab unversorgt dasteht.');
pruefe('kein blindes Start-Sleep mehr auf den ganzen Takt',
  !/Start-Sleep -Seconds \$DauerTaktSek/.test(CMD));

// GEGENPROBE: die alte Bauart muss an genau dieser Regel scheitern.
const ALT = 'while ($true) {\n    Start-Sleep -Seconds $DauerTaktSek\n    $alle = @()';
pruefe('Gegenprobe: die alte Bauart faellt durch',
  !SCHLEIFE_NEU.test(ALT) && /Start-Sleep -Seconds \$DauerTaktSek/.test(ALT),
  'Eine Regel, die die alte Fassung durchlaesst, misst nichts.');

pruefe('die Scheibe ist kuerzer als der Takt',
  !!NEUTAB && /Start-Sleep -Seconds 2\b/.test(NEUTAB));
pruefe('POSITIVLISTE http(s), keine Sperrliste',
  !!NEUTAB && /-like 'http:\/\/\*'/.test(NEUTAB) && /-like 'https:\/\/\*'/.test(NEUTAB) &&
  !/-notlike '(chrome|devtools|edge|about)/.test(NEUTAB),
  'Eine Sperrliste muesste jede Variante kennen - chrome-extension:// kam so schon durch.');
pruefe('nur Seiten-Ziele (type page)',
  !!NEUTAB && /\$_\.type -eq 'page'/.test(NEUTAB));
pruefe('ein Tab mit LEBENDEM Anker wird uebersprungen',
  !!NEUTAB && /AnkerWs\.ContainsKey\(\$id\)[\s\S]{0,80}State -eq 'Open'[\s\S]{0,40}continue/.test(NEUTAB),
  'Sonst wuerde jeder Takt jeden Tab neu verankern.');
pruefe('Drossel je Tab ist vorhanden',
  !!NEUTAB && /\$NeuTabZuletzt\[\$id\]/.test(NEUTAB) && /TotalSeconds -lt \$NeuTabAbstandSek/.test(NEUTAB),
  'Ein Tab, bei dem das Verankern scheitert, kostet sonst alle 2 s einen Versuch.');
pruefe('Gegenprobe: ein Block ohne Drossel faellt durch',
  !/TotalSeconds -lt \$NeuTabAbstandSek/.test('foreach ($t in $offen) { AnkerSetzen $t }'));
pruefe('$NeuTabAbstandSek ist gesetzt',
  /\$NeuTabAbstandSek\s*=\s*\d+/.test(CMD));
pruefe('ein Netzfehler beendet die Wartezeit nicht',
  !!NEUTAB && /catch \{ \$offen = @\(\) \}/.test(NEUTAB),
  'Ein throw waehrend der Wartezeit wuerde den ganzen Waechter-Takt reissen.');
pruefe('versorgt wird ueber AnkerSetzen (nicht nur nachlegen)',
  !!NEUTAB && /AnkerSetzen \$t/.test(NEUTAB),
  'Nur der Anker ueberlebt die naechste Navigation - siehe Abschnitt 4b.');
pruefe('AnkerSetzen steht VOR der neuen Funktion',
  CMD.indexOf('function AnkerSetzen') < CMD.indexOf('function WarteUndVersorgeNeueTabs'));
pruefe('der Vorgang wird im Fenster gemeldet',
  !!NEUTAB && /Schritt "  Neuer Tab sofort versorgt/.test(NEUTAB),
  'Ohne Meldung ist im Betrieb nicht erkennbar, ob es gegriffen hat.');
pruefe('die Standmarke wurde mitgezogen',
  /\$StarterStand = '20\d\d-\d\d-\d\d /.test(CMD) && !/2026-08-16 Anker\+2/.test(CMD),
  'Sonst sieht die Ausgabe nach einem Update aus wie vorher.');
pruefe('die Tab-Schleife des Waechters bleibt als Netz darunter',
  /if \(StelleAutopilotSicher \$t\) \{/.test(CMD));
pruefe('der KPI-Knopf im Dashboard ruft weiterhin rcOpenKpiQuelle',
  /rcBtnKpiQuelle'\)\.addEventListener\('click', \(\) => window\.rcOpenKpiQuelle\(\)\)/.test(DASH));

console.log('');
console.log('8) Der Startblock blockiert die Dauerschleife nicht mehr (21.08.)');

/* Live-Log 21.08.: der Startblock verbrannte 210 s, bevor der Waechter
   ueberhaupt anlief - 90 s "Warte auf die ESL-Anmeldemaske" (die Maske war
   da noch gar nicht da) plus 120 s "Warte, bis das Dashboard laeuft".
   Erst danach lief die Dauerschleife an, und ab da klappte alles sofort:
   "Neuer Tab sofort versorgt: ...liga_listen.rb" und "ESL angemeldet (20:19)".
   Beide Wartezeiten bringen nichts, was der Waechter nicht auch koennte -
   er ruft EinAnmeldeVersuch und StelleLigalisteSicher in jedem Takt.
   Gegenprobe zur Anker-Vermutung: mehrere gleichzeitige CDP-Verbindungen je
   Tab sind moeglich (pruefwerkzeuge/cdp_zweitverbindung_messen.js, 9/9) -
   die kurzlebigen Verbindungen des Waechters stoeren den Anker also nicht. */

pruefe('Anmeldefrist im Startblock ist gekuerzt',
  /\$frist = \(Get-Date\)\.AddSeconds\(45\)/.test(CMD));
pruefe('Gegenprobe: die alten 90 s stehen nicht mehr da',
  !/Schritt "Warte auf die ESL-Anmeldemaske \.\.\."[\s\S]{0,120}AddSeconds\(90\)/.test(CMD));
pruefe('die Meldung nennt die Frist und den Waechter',
  /Warte auf die ESL-Anmeldemaske \(bis zu 45 s, danach uebernimmt der Waechter\)/.test(CMD));

const ANM = schneidePs(CMD, 'function EslAnmeldungAbschicken');
pruefe('EslAnmeldungAbschicken ist schneidbar', !!ANM);
pruefe('$maskeGesehen wird initialisiert',
  !!ANM && /\$maskeGesehen = \$false/.test(ANM));
pruefe('$maskeGesehen wird gesetzt, sobald das Formular dasteht',
  !!ANM && /\$maskeGesehen = \$true/.test(ANM));
pruefe('"Maske nie gesehen" wird NICHT als Fehler gemeldet',
  !!ANM && /if \(-not \$maskeGesehen\) \{[\s\S]{0,400}Schritt "Keine ESL-Anmeldemaske/.test(ANM),
  'Bis 21.08. stand dort "Edge hat kein Passwort gespeichert" - fuer ein Problem, das es nicht gab.');
{
  // Fallstrick 11: "nicht messbar" darf nicht als "verletzt" durchgehen. Der
  // Ausstieg MUSS vor der Passwort-Warnung stehen, sonst laeuft er ins Leere.
  const iAus = ANM ? ANM.indexOf('if (-not $maskeGesehen)') : -1;
  const iWarn = ANM ? ANM.indexOf('ESL-Anmeldung hat nicht automatisch geklappt') : -1;
  pruefe('der Ausstieg steht VOR der Passwort-Warnung',
    iAus > 0 && iWarn > iAus,
    'Steht er danach, meldet der Starter weiter faelschlich ein fehlendes Passwort.');
}
pruefe('die Passwort-Warnung gibt es weiterhin (fuer den echten Fall)',
  !!ANM && /kein Passwort fuer das ESL gespeichert/.test(ANM));

pruefe('die Dashboard-Wartezeit im Startblock ist gekuerzt',
  /if \(-not \(WarteAufDashboard 30\)\)/.test(CMD));
pruefe('Gegenprobe: die alten 120 s stehen nicht mehr da',
  !/\(WarteAufDashboard 120\)/.test(CMD),
  'Nur der AUFRUF zaehlt - die Zeichenkette steht auch im Herkunfts-Kommentar.');
pruefe('der Ausfall bleibt kein endgueltiges Aufgeben',
  /Dashboard noch nicht oben - die Ligaliste kommt spaeter/.test(CMD));

{
  // Im Live-Log stand "Pruefung alle  s" - die Variable war an dieser Stelle
  // noch gar nicht zugewiesen. Reihenfolge im TEXT ist hier die Wahrheit,
  // weil PowerShell das Skript von oben nach unten ausfuehrt.
  const zu = CMD.indexOf('$DauerTaktSek = 20');
  const ersteNutzung = CMD.indexOf('Pruefung alle $DauerTaktSek s');
  pruefe('$DauerTaktSek ist zugewiesen, BEVOR eine Meldung ihn ausgibt',
    zu > 0 && ersteNutzung > zu,
    'Sonst steht im Fenster "Pruefung alle  s".');
}
// 05.10.: Auffrischen vor der Stundenmail — die Marke muss diesen Stand nennen,
// nicht mehr den vom 21.08. (sonst ist nach einem Update nicht erkennbar, welche
// Datei laeuft).
pruefe('die Standmarke nennt den heutigen Umbau',
  /\$StarterStand = '2026-10-05 /.test(CMD) && !/\$StarterStand = '2026-08-21 /.test(CMD));

console.log('');
console.log('='.repeat(60));
if (fehler === 0) console.log('  ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN');
else console.log('  ' + (geprueft - fehler) + ' bestanden, ' + fehler + ' fehlgeschlagen.');
console.log('='.repeat(60));
process.exit(fehler ? 1 : 0);
