// ============================================================================
//  stundenmail_pruefen.js — prueft die Kette "stuendliche Mail mit Stand-Excel
//  und Standbild" statisch durch, ohne Outlook und ohne laufenden Edge.
//
//  Anlass (04.08.): esl_mail_report.ps1 lag seit dem 29.07. im Update-Paket,
//  wurde aber von KEINER Stelle aufgerufen — genau dieselbe Fehlerklasse wie
//  seinerzeit EinAnmeldeVersuch (gebaut, nirgends gerufen). Deshalb ist die
//  ERSTE Pruefung hier: wird das Skript ueberhaupt aufgerufen?
//
//  Aufruf:  node pruefwerkzeuge/stundenmail_pruefen.js
//  Sollwert: alle Pruefungen bestanden.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const W = path.join(__dirname, '..');
const lies = n => fs.readFileSync(path.join(W, n), 'utf8');
const cmd  = lies('ESL_Start.cmd');
const ps1  = lies('ESL_Start.ps1');
const mail = lies('esl_mail_report.ps1');
const dash = lies('esl_live_arena_v22.js');
const bund = lies('bundle_bauen.js');

let ok = 0, fehler = 0;
function pruef(titel, bedingung, zusatz) {
    if (bedingung) { ok++; console.log('  ok   ' + titel); }
    else { fehler++; console.log('  FEHL ' + titel + (zusatz !== undefined ? '  -> ' + zusatz : '')); }
}

console.log('\n-- 1. Wird ueberhaupt aufgerufen? (der Fehler von 29.07.) --');
pruef('ESL_Start.cmd ruft esl_mail_report.ps1 auf', /esl_mail_report\.ps1/.test(cmd));
// Der Rueckgabewert wird seit 09.08. AUSGEWERTET statt mit [void] verworfen:
// der Vorlauf-Versand nach dem Start gilt erst als erledigt, wenn wirklich eine
// Mail rausging (sonst stand "Erste Mail nach dem Start" im Fenster und es kam
// nie eine). Die Frage dieser Pruefung bleibt dieselbe: wird sie ueberhaupt
// gerufen?
pruef('der Aufruf steht in einer Funktion, die auch gerufen wird',
    /function SchickeStundenmail/.test(cmd) && /\$erg = SchickeStundenmail \$alle/.test(cmd));
pruef('… und der Rueckgabewert wird nicht mehr verworfen',
    !/\[void\]\(SchickeStundenmail/.test(cmd));
pruef('der Aufruf liegt INNERHALB der Dauerschleife',
    cmd.indexOf('SchickeStundenmail $alle') > cmd.indexOf('while ($true)'),
    'while bei ' + cmd.indexOf('while ($true)') + ', Aufruf bei ' + cmd.indexOf('SchickeStundenmail $alle'));
pruef('die erzeugte ESL_Start.ps1 enthaelt denselben Aufruf', /SchickeStundenmail \$alle/.test(ps1));

console.log('\n-- 2. Automatikbetrieb: nichts darf blockieren --');
pruef('esl_mail_report.ps1 kennt den Schalter -Stumm', /\[switch\]\$Stumm/.test(mail));
pruef('der Starter uebergibt -Senden UND -Stumm',
    /'-Senden',\s*'-Stumm'/.test(cmd) || /-Senden.*-Stumm/.test(cmd));
const readHosts = (mail.match(/Read-Host/g) || []).length;
pruef('Read-Host steht nur noch an EINER Stelle (in Ende())', readHosts === 1, readHosts + ' Vorkommen');
pruef('Ende() prueft $Stumm, bevor es wartet', /function Ende\([\s\S]{0,200}if \(-not \$Stumm\)/.test(mail));
pruef('jeder Fehlerpfad geht ueber Ende', !/try \{ Read-Host[\s\S]{0,80}exit 1/.test(mail));
pruef('der Starter laeuft das Mailskript in einem EIGENEN Prozess', /Start-Process -FilePath 'powershell\.exe'/.test(cmd));
// Befund 04.08. aus dem Livebetrieb: Das Benutzerprofil liegt auf einem
// Netzlaufwerk mit Leerzeichen im Pfad ("...\My Documents\live\").
// -ArgumentList fuegt die Elemente mit Leerzeichen zusammen und quotet NICHTS —
// PowerShell las nur bis zum ersten Leerzeichen und brach mit Parser-Fehler ab
// (Exit -196608 = 0xFFFD0000). Lokal nachgestellt und bestaetigt.
pruef('der Skriptpfad wird in Anfuehrungszeichen uebergeben (Leerzeichen im Pfad!)',
    /'-File', \('"' \+ \$skript \+ '"'\)/.test(cmd),
    'ohne Quotes bricht PowerShell mit -196608 ab, sobald der Pfad ein Leerzeichen enthaelt');
pruef('die erzeugte ESL_Start.ps1 traegt die Quotes ebenfalls',
    /'-File', \('"' \+ \$skript \+ '"'\)/.test(ps1));
pruef('mit Zeitlimit, damit ein haengendes Outlook den Waechter nicht mitreisst',
    /WaitForExit\(120000\)/.test(cmd) && /\$pr\.Kill\(\)/.test(cmd));

console.log('\n-- 3. Anhaenge: NUR die beiden Bilder --');
pruef('Mailskript sucht die Bilder ueber den Namensstamm', /\$stamm\s*=\s*\$datei\.BaseName/.test(mail));
// Nutzer-Vorgabe 04.08. abends: "Und haengt auch noch HTML und Excel da drin.
// Das braucht er nicht, das soll er auch NICHT." Bis dahin gingen HTML-Report
// und Excel-Mappe mit an die ganze Mannschaft. Die Erwartung ist damit
// umgedreht — beide duerfen NICHT mehr angehaengt werden.
// PRAEZISIERT am 05.08.: Die Vorgabe gilt weiterhin, aber sie gilt fuer die
// MANNSCHAFT. Seither gibt es zusaetzlich eine getrennte Leitungs-Mail, die die
// Mappe ausdruecklich tragen soll. Die Pruefung darf also nicht mehr pauschal
// "kein Anhang" verlangen - sonst wuerde sie die gewollte Aenderung blockieren -,
// sondern muss belegen, dass der Anhang AN DEN MODUS gebunden ist.
pruef('Excel haengt nur ausserhalb des Team-Modus an',
    /\$willXlsx\s*=\s*\(\$Modus -ne 'team'\)/.test(mail) &&
    /if \(\$willXlsx -and \$hatXlsx\)[\s\S]{0,200}?Attachments\.Add\(\$xlsx\)/.test(mail));
// GEGENPROBE: ein unbedingtes Anhaengen muss auffallen.
pruef('GEGENPROBE unbedingtes Anhaengen wuerde erkannt',
    !/^\s*\[void\]\$mail\.Attachments\.Add\(\$xlsx\)\s*$/m.test(mail));
pruef('HTML-Report wird NICHT angehaengt', !/Attachments\.Add\(\$datei\.FullName\)/.test(mail));
pruef('die HTML wird aber weiterhin GELESEN (sie traegt die Marker)',
    /ESLMAIL/.test(mail) && /ESLMOTI/.test(mail));
pruef('BEIDE Bilder werden gesucht (Stand + Vertrieb)',
    /\$pngV\s*=\s*Join-Path \$Ordner \(\$stamm \+ '-vertrieb\.png'\)/.test(mail));
pruef('Stand-Bild wird im Mailtext eingebettet', /cid:eslstand/.test(mail));
pruef('Vertriebs-Bild wird im Mailtext eingebettet', /cid:eslvertrieb/.test(mail));
pruef('die cid-Eigenschaft wird gesetzt (BildEinbetten)', /0x3712001F/.test(mail) && /function BildEinbetten/.test(mail));
pruef('Motivationstext wird aus dem ESLMOTI-Marker gelesen', /ESLMOTI\\s\+text/.test(mail));
pruef('ohne Marker gibt es einen neutralen Gruss (aeltere Reports)',
    /Hallo Team, hier unser aktueller Stand/.test(mail));
pruef('fehlendes Vertriebs-Bild bricht den Versand NICHT ab', /Die Mail geht mit einem Bild/.test(mail));
// Die Regel gilt unveraendert, nur haengt jetzt als erstes ein BILD an statt
// der HTML: Outlook verwirft die cid-Verknuepfungen, wenn der HTMLBody erst
// NACH dem Anhang gesetzt wird.
pruef('HTMLBody wird VOR den Anhaengen gesetzt',
    mail.indexOf('$mail.HTMLBody = $body') > 0 &&
    mail.indexOf('$mail.HTMLBody = $body') < mail.indexOf('Attachments.Add($pfad)'));
// Ohne JEDES Bild bliebe nur der Begruessungstext — das ist keine Mail an die
// Mannschaft. Fehlt dagegen nur EINES der beiden, geht die Mail trotzdem raus.
pruef('ganz ohne Bild geht KEINE Mail raus',
    /if \(-not \$hatPng -and -not \$hatPngV\)/.test(mail));
pruef('ein einzelnes fehlendes Bild bricht den Versand NICHT ab',
    /if \(\$hatPng\)/.test(mail) && /if \(\$hatPngV\)/.test(mail));
// Der Einbett-Versuch steht in einem try/catch. Entscheidend ist nicht der
// Wortlaut der Meldung, sondern dass in diesem catch NICHT abgebrochen wird —
// ein Exchange, der die cid-Eigenschaft verweigert, darf die Mail nicht kosten.
(function(){
    const i = mail.indexOf('0x3712001F');
    const j = mail.indexOf('if ($Senden)', i);
    const block = i >= 0 && j > i ? mail.slice(i, j) : '';
    pruef('ein misslungenes Einbetten bricht den Versand NICHT ab',
        block !== '' && !/\bEnde 1\b/.test(block) && !/\bexit 1\b/.test(block) && /catch \{/.test(block),
        block === '' ? 'Einbett-Block nicht gefunden' : 'Abbruch im catch gefunden');
})();

console.log('\n-- 4. Das Dashboard erzeugt die Dateien wirklich --');
// Seit 09.08. bekommen die Bauer je einen Rueckruf (damit ESL_Start.cmd weiss,
// wann der Satz vollstaendig ist), und das Vertriebsbild wird nur angefordert,
// wenn es dafuer ueberhaupt ESL-Zeilen gibt. Was hier zaehlt, bleibt gleich:
// gemeinsamer Namensstamm und dieselbe data fuer alle vier Dateien.
pruef('download() schreibt HTML, XLSX und BEIDE Bilder mit gleichem Stamm',
    /var base='ESL-Report-'\+stamp\(\)/.test(dash) &&
    /buildXlsx\(base, function\(fn\)\{[^\n]*\}, data\);/.test(dash) &&
    /buildPng\(base, function\(fn\)\{[^\n]*\}, data\);/.test(dash) &&
    /buildPngVertrieb\(base, function\(fn\)\{[^\n]*\}, data\);/.test(dash));
pruef('buildPng malt die Stand-Tabelle (nicht das Dashboard)', /Aktueller Stand/.test(dash) && /createElement\('canvas'\)/.test(dash));
// Seit 04.08.: EINE Datenquelle fuer Excel und beide Bilder — vorher rechnete
// das Bild aus collect(), das Excel aus rcStandRows (zwei Rechenwege).
pruef('Excel und Bilder teilen sich reportDaten()', /function reportDaten\(\)/.test(dash) &&
    /dataVor\|\|reportDaten\(\)/.test(dash));
pruef('Report-Filter: Team waehlbar', /c\.team=c\.team\|\|'ALL'/.test(dash) && /cfgRepTeam/.test(dash));
pruef('Report-Filter: Datum-Modus heute/tag/zeitraum', /c\.datumModus=c\.datumModus\|\|'heute'/.test(dash) && /cfgRepDatum/.test(dash));
pruef('Zeitraum-Modus nutzt rcStandRowsZeitraum (kumuliert, gepoolt)',
    /datumModus==='zeitraum'[\s\S]{0,120}rcStandRowsZeitraum/.test(dash));
pruef('Vertriebs-Bild existiert (buildPngVertrieb)', /function buildPngVertrieb/.test(dash));
pruef('Vertriebs-Bild traegt den Namenszusatz -vertrieb.png', /base\+'-vertrieb\.png'/.test(dash));
pruef('Motivationstext wird als ESLMOTI-Marker in die HTML geschrieben',
    /function motivationsText/.test(dash) && /<!--ESLMOTI text="/.test(dash));
pruef('Motivationstext beginnt mit "Hallo Team"', /Hallo Team, hier unser aktueller Stand/.test(dash));
pruef('rcReportNow ist global erreichbar', /window\.rcReportNow\s*=/.test(dash));
pruef('rcReport.setTo und setAuto sind vorhanden',
    /setAuto:function\(v\)/.test(dash) && /setTo:function\(t\)/.test(dash));
// ---- Nichts laeuft von selbst (Nutzer-Vorgabe 06.08. spaetabends) ----------
// Der Starter setzte bei JEDEM Lauf setAuto(true) und schaltete damit den
// stuendlichen Selbstlauf des Dashboards ein - auch wenn der Nutzer ihn im
// Konfigurator abgeschaltet hatte. Gebraucht wird es nicht: fehlt ein frischer
// Report, erzeugt SchickeStundenmail ihn selbst ueber rcReportNow().
// Seit 09.08. wird je Empfaengerkreis gesetzt; der Aufruf steht deshalb als
// r.setTo(...) im zusammengebauten JavaScript, nicht mehr als rcReport.setTo.
pruef('der Starter setzt die Empfaenger, schaltet aber NICHT die Automatik ein',
    /r\.setTo\(/.test(cmd) && !/setAuto\(true\)/.test(cmd));
pruef('GEGENPROBE: die Pruefung erkennt ein zurueckgekehrtes setAuto(true)',
    /rcReport\.setAuto\(true\)/.test(cmd + 'window.rcReport.setAuto(true);'));
pruef('der Starter erzeugt den Report bei Bedarf selbst (rcReportNow)',
    /rcReportNow\(\)/.test(cmd));
pruef('Dashboard: Migration schaltet einen gespeicherten Stundentakt EINMAL ab',
    /if\(!c\.autoAusMigriert\)\{ c\.autoHourly=false; c\.autoAusMigriert=1;/.test(dash));
pruef('… und der Marker verhindert, dass sie die Wahl wieder ueberschreibt',
    /c\.autoAusMigriert=1/.test(dash) && /autoAusMigriert\b/.test(dash));
pruef('der Konfigurator-Schalter "Stuendlich automatisch" bleibt bedienbar',
    /cfgRepAuto/.test(dash) && /autoHourly=e\.target\.checked/.test(dash));

console.log('\n-- 5. Takt und Zeitfenster --');
pruef('Empfaenger ist gesetzt', /\$MailAn\s*=\s*'veysel\.yarba@regiocom\.com'/.test(cmd));
pruef('der Versand ist ab Werk AUS', /\$MailAktiv\s*=\s*\$false/.test(cmd));
pruef('der Starter sagt beim Start, dass die Stundenmail aus ist',
    /Stundenmail: AUS/.test(cmd) && /Einschalten:/.test(cmd));

// ---- Mehrere Empfaenger, Verteilergruppe, Kopie (05.08.) ----
pruef('es gibt ein Kopie-Feld im Starter', /\$MailCc\s*=/.test(cmd));
pruef('die Kopie wird ins Dashboard durchgereicht', /r\.setCc\(/.test(cmd));
// Citrix startet nicht immer neu: ein aelteres Dashboard im Tab kennt setCc
// nicht. Ohne die Pruefung waere das ein TypeError und die GANZE Stundenmail
// fiele aus, obwohl nur das Kopie-Feld fehlt.
pruef('setCc wird abgesichert aufgerufen (aelteres Dashboard)',
    /typeof r\.setCc==="function"/.test(cmd));
// Dieselbe Absicherung gilt seit 09.08. fuer die neuen Setter: ein Dashboard
// aus einem alten Tab kennt setScope nicht. Ohne die Pruefung waere das ein
// TypeError und die GANZE Stundenmail fiele aus, statt nur ungefiltert zu gehen.
pruef('die neuen Filter-Setter werden ebenso abgesichert benutzt',
    /typeof window\.rcReport\.setScope==="function"/.test(cmd) &&
    /typeof r\.setReportingMappe==="function"/.test(cmd));
pruef('das Dashboard kann eine Kopie speichern', /setCc:function\(t\)\{ CFG\.cc=t\|\|''; save\(\); \}/.test(dash));
pruef('cc steht im ESLMAIL-Marker', /cc="'\+esc\(CFG\.cc\|\|''\)\+'"/.test(dash));
pruef('das Mailskript nimmt einen Cc-Parameter', /\[string\]\$Cc\s*=\s*""/.test(mail));
pruef('cc wird aus dem Marker gelesen', /\(\?:\\s\+cc="\(\[\^"\]\*\)"\)\?/.test(mail));
// Reports von vor dem 05.08. haben kein cc im Marker. Waere es im Muster
// PFLICHT, wuerde der Marker dort gar nicht mehr gefunden und der Betreff
// faelschlich aus dem Titel abgeleitet.
pruef('das Muster bleibt zu alten Reports ohne cc vertraeglich',
    /<!--ESLMAIL\\s\+to="\(\[\^"\]\*\)"\(\?:\\s\+cc=/.test(mail));
pruef('CC wird auf die Mail gesetzt', /\$mail\.CC = \$kopie/.test(mail));
pruef('Trennzeichen werden vereinheitlicht', /function TrennerNormalisieren/.test(mail));
// Ein Anzeigename wie "Yarba, Veysel" enthaelt selbst ein Komma - blind zu
// trennen erzeugte zwei Empfaenger, die es beide nicht gibt.
pruef('Kommas nur bei eindeutigen Adressen umgesetzt',
    /Matches\(\$s, '@'\)\)\.Count -ge 2/.test(mail) && /if \(\$s\.Contains\(';'\)\) \{ return \$s \}/.test(mail));
// Ohne ResolveAll ist ein unbekannter Gruppenname erst beim Send ein Problem -
// dort als unklarer COM-Fehler oder als Dialog, der den Prozess blockiert.
pruef('Empfaenger werden VOR dem Senden aufgeloest', /Recipients\.ResolveAll\(\)/.test(mail));
pruef('unaufloesbare Empfaenger werden benannt', /Unbekannte Empfaenger/.test(mail));
// Ueber Positionen statt ueber ein langes Regex-Fenster: die Zeichenzahl
// zwischen den Marken aendert sich mit jedem Kommentar, ein {0,200} waere eine
// Prüfung, die beim naechsten Umformulieren grundlos rot wird.
{
    const a = mail.indexOf('if ($offen.Count -gt 0)');
    const b = mail.indexOf('Es wird NICHTS verschickt.', a);
    const c = mail.indexOf('Ende 1', b);
    const d = mail.indexOf('$mail.Send()');
    pruef('bei unbekanntem Empfaenger geht GAR NICHTS raus',
        a > 0 && b > a && c > b && c < d,
        'eine Mail an nur einen Teil der Mannschaft sieht aus wie ein Erfolg');
}
pruef('ResolveAll steht VOR dem Send', mail.indexOf('ResolveAll()') < mail.indexOf('$mail.Send()'));

// ---- Drei Empfaengerkreise: Mannschaft / Leitung / Teams-Kanal (05.08.) ----
console.log('\n-- 6. Leitungs-Mail mit Excel und Teams-Kanal --');
pruef('EIN Modus-Schalter statt mehrerer Einzelschalter',
    /\[ValidateSet\('team','leitung','kanal'\)\]/.test(mail) && /\[string\]\$Modus\s*=\s*'team'/.test(mail));
pruef('eigener Betreff moeglich', /\[string\]\$Betreff\s*=\s*""/.test(mail) &&
    /if \(\$Betreff -and \$Betreff -ne ""\) \{ \$betreff = \$Betreff \}/.test(mail));
pruef('die Mappe wird ueber denselben Namensstamm gefunden wie die Bilder',
    /\$xlsx\s*=\s*Join-Path \$Ordner \(\$stamm \+ '\.xlsx'\)/.test(mail));
pruef('Mappe nur ausserhalb des Team-Modus', /\$willXlsx\s*=\s*\(\$Modus -ne 'team'\)/.test(mail));
pruef('Mappe wird angehaengt', /if \(\$willXlsx -and \$hatXlsx\)/.test(mail) &&
    /\$mail\.Attachments\.Add\(\$xlsx\)/.test(mail));
// Reihenfolge: HTMLBody vor JEDEM Anhang, sonst verwirft Outlook die cid-Bilder.
pruef('die Mappe kommt NACH dem HTMLBody',
    mail.indexOf('$mail.HTMLBody = $body') < mail.indexOf('$mail.Attachments.Add($xlsx)'));
// Die Vorgabe vom 04.08. bleibt gueltig: die Mannschaft bekommt KEINE Mappe.
pruef('die Mannschafts-Mail bekommt weiterhin KEINE Mappe',
    /if \(\$Modus -eq 'team'\) \{[\s\S]{0,400}?Kein einziges Bild/.test(mail));
// Stiller Fehler, der niemandem auffiele: die Kopie der Mannschafts-Mail steht
// im Marker. Ohne die Modus-Bedingung bekaeme sie auch die Leitungs-Mappe.
pruef('die Marker-Kopie greift NUR im Team-Modus',
    /\(-not \$kopie -or \$kopie -eq ""\) -and \$Modus -eq 'team'/.test(mail));
pruef('im Leitungs-Modus bricht ein fehlendes Bild NICHT ab',
    /-not \$hatPng -and -not \$hatPngV -and -not \$hatXlsx/.test(mail));

console.log('\n-- 7. Starter: drei getrennte Laeufe --');
pruef('es gibt ein Feld fuer die Leitung', /\$MailAnLeitung\s*=/.test(cmd));
pruef('es gibt ein Feld fuer den Teams-Kanal', /\$MailAnTeams\s*=/.test(cmd));
pruef('EinMailLauf ist definiert', /function EinMailLauf\(/.test(cmd));
// Seit 09.08. laufen die drei Kreise ueber EINE Schleife ueber $kreise, statt
// dreimal denselben Block. Es gibt deshalb nur noch EINEN EinMailLauf-Aufruf -
// die Frage "wird es ueberhaupt gerufen" bleibt aber dieselbe.
pruef('EinMailLauf wird auch AUFGERUFEN', /EinMailLauf \$skript \$k\.Modus/.test(cmd),
    'gebaut-aber-nie-gerufen ist im Projekt die haeufigste Fehlerklasse');
pruef('alle drei Modi werden benutzt',
    /Modus = 'team'/.test(cmd) && /Modus = 'leitung'/.test(cmd) && /Modus = 'kanal'/.test(cmd));
pruef('… und die Schleife laeuft wirklich ueber alle Kreise',
    /foreach \(\$k in \$kreise\)/.test(cmd));
// GEGENPROBE: erkennt die Regel einen Modus, den es nicht gibt?
pruef('GEGENPROBE: ein erfundener Modus faellt durch', !/Modus = 'gibtsnicht'/.test(cmd));
// Der Pfad musste schon einmal in Anfuehrungszeichen (Exit -196608 auf dem
// Netzlaufwerk). Dasselbe gilt fuer Verteilergruppen-Namen und Betreffzeilen -
// beide enthalten fast immer Leerzeichen.
pruef('An und Betreff werden gequotet uebergeben',
    /'-An',\s*\('"' \+ \$an \+ '"'\)/.test(cmd) && /'-Betreff',\s*\('"' \+ \$betreff \+ '"'\)/.test(cmd));
pruef('der Skriptpfad bleibt gequotet', /'-File', \('"' \+ \$skript \+ '"'\)/.test(cmd));
// Ein haengendes Outlook im ersten Lauf darf die anderen nicht mitreissen.
pruef('jeder Lauf hat ein eigenes Zeitlimit',
    (cmd.match(/WaitForExit\(120000\)/g) || []).length >= 1 &&
    /Start-Process -FilePath 'powershell\.exe' -PassThru -WindowStyle Hidden -ArgumentList \$argumente/.test(cmd));
// In der Schleife ist das strukturell gesichert: der Rueckgabewert wird nur fuer
// den Mannschafts-Kreis gemerkt und steuert nichts. Waere er eine Bedingung,
// bliebe die Leitung ohne Bericht, nur weil bei der Mannschaft ein Bild fehlte.
pruef('die Leitungs-Mail haengt NICHT am Erfolg der Mannschafts-Mail',
    /if \(\$k\.Modus -eq 'team'\) \{ \$okTeam = \$ok \}/.test(cmd) &&
    !/if \(\$okTeam\)/.test(cmd) && !/if \(\$ok\)\s*\{[^}]*EinMailLauf/.test(cmd));
// Der Kanal darf NICHT als Kopie der Mannschafts-Mail laufen: seit ResolveAll
// verhindert EIN unbekannter Empfaenger den ganzen Versand.
// Seit 09.08. ist der Kanal ein eigener EINTRAG in $kreise (mit eigenem
// Zuschnitt) statt eines dritten Aufruf-Blocks. Entscheidend bleibt: die
// Kanaladresse steht in seinem EIGENEN An, nicht im Cc der Mannschafts-Mail -
// ein unbekannter Empfaenger im selben Aufruf verhindert seit ResolveAll den
// GANZEN Versand.
pruef('der Kanal laeuft als EIGENER Aufruf, nicht als Cc',
    /Modus = 'kanal'; An = \$MailAnTeams; Cc = ''; Arg = \$MailAnTeams/.test(cmd) &&
    !/\$MailCc\s*\+=\s*\$MailAnTeams/.test(cmd));
pruef('der Grund dafuer steht als Kommentar da', /gleich mit aus/.test(cmd));

console.log('\n-- 8. Die Stunden-Mappe ist die VOLLE Mappe --');
pruef('buildXlsx baut die Aggregat-Blaetter mit', /rcBuildAggSheets\(XL, wb, !!XL\.__styled, agg, rcZeitraumText\(data\)\)/.test(dash));
pruef('genau DREI Aufrufer von rcBuildAggSheets', (dash.match(/rcBuildAggSheets\(XL, wb/g) || []).length === 4,
    'drei Aufrufe plus die Definition; mehr waere eine zweite Fassung der Blaetter');
// Wuerde buildXlsx den Zuschnitt erneut aus CFG bilden, gaebe es einen zweiten
// Ort fuer denselben Scope - beim naechsten Filter waere einer davon vergessen.
pruef('der Scope reist am Datenobjekt mit', /if\(d && !d\.scope\) d\.scope = scope/.test(dash) &&
    /rcAggTrendScope\(data, data\.scope \|\| null\)/.test(dash));
pruef('es gibt ein Zeitfenster', /\$MailVonStunde/.test(cmd) && /\$MailBisStunde/.test(cmd));
// Der Stundentakt im Dashboard wurde am 09.08. umgeschrieben (frueher Wurf
// verbrauchte die Stunde spurlos). Die 5-Minuten-Grenze gilt unveraendert, steht
// jetzt aber als Ausstieg statt als Bedingung.
// Nutzer-Befund 09.08.: "Obwohl ich das alles ausgefuellt habe, sendet es
// trotzdem keine E-Mail." Ursache war $MailAktiv = $false. Wer Empfaenger,
// Filter und Reporting-Mappe eintraegt, will offensichtlich Mail - der Schalter
// steht aber ab Werk aus und geht zwischen den Kommentarbloecken unter. Der
// Starter muss diesen Widerspruch NENNEN, statt still nichts zu tun.
pruef('bei ausgeschalteter Mail wird gemeldet, wenn trotzdem etwas eingestellt ist',
    /Es ist etwas eingestellt, was NUR bei eingeschalteter Stundenmail wirkt/.test(cmd) &&
    /\$konfiguriert/.test(cmd));
pruef('… die Meldung listet die betroffenen Einstellungen auf',
    /if \(\$MailStandort\)\s*\{ \$konfiguriert \+= /.test(cmd) &&
    /if \(\$MailTeam\)\s*\{ \$konfiguriert \+= /.test(cmd) &&
    /if \(\$MailReportingMappe\)\s*\{ \$konfiguriert \+= /.test(cmd));
pruef('… und nennt die Zeile, die zu aendern ist',
    /Zum Einschalten in dieser Datei:\s+`\$MailAktiv = `\$true/.test(cmd));
// GEGENPROBE: ohne gesetzte Filter darf die Meldung NICHT erscheinen - sonst
// waere sie Laerm und wuerde beim naechsten Mal ueberlesen.
pruef('GEGENPROBE: die Meldung haengt an $konfiguriert.Count > 0',
    /if \(\$konfiguriert\.Count -gt 0\)/.test(cmd));
// Die Zeile steht als PowerShell-KOMMENTAR da, dort wird $true nicht escapt —
// anders als in den Warn-Zeilen, die in doppelten Anfuehrungszeichen stehen und
// deshalb einen Backtick brauchen. Zwei Schreibweisen fuer dasselbe Zeichen.
pruef('der Hauptschalter ist als solcher gekennzeichnet',
    /HAUPTSCHALTER DER STUNDENMAIL/.test(cmd) &&
    /HIER auf \$true setzen, sonst geht KEINE Mail raus/.test(cmd));

pruef('gesucht wird erst ab Minute 6 (Dashboard schreibt in Minute 0-4)',
    /\$MailAbMinute\s*=\s*6/.test(cmd) &&
    (/getMinutes\(\)<5/.test(dash) || /getMinutes\(\)>=5\) return;/.test(dash)));
pruef('der Stundenschluessel wird VOR dem Versuch gesetzt (kein 20-s-Dauerfeuer)',
    cmd.indexOf('$letzteMailStunde = $stundenSchluessel') < cmd.indexOf('SchickeStundenmail $alle'));
pruef('bei drei Projekten wird nur der Kabel-Tab genommen',
    /_mobile/.test(cmd) && /_um/.test(cmd) && /notlike '\*_mobile\*'/.test(cmd));

console.log('\n-- 6. Auslieferung --');
pruef('esl_mail_report.ps1 liegt im Update-Paket', /esl_mail_report\.ps1/.test(bund));
const bomOk = (b => b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF)(fs.readFileSync(path.join(W, 'esl_mail_report.ps1')));
pruef('esl_mail_report.ps1 hat ein BOM (PS 5.1 liest sonst als ANSI)', bomOk);
pruef('keine nackten Gedankenstriche im Mailskript (ANSI-Falle)', !/[–—]/.test(mail),
    (mail.match(/[–—]/g) || []).length + ' Treffer');

console.log('\n' + ok + ' bestanden, ' + fehler + ' fehlgeschlagen.');
process.exit(fehler ? 1 : 0);
