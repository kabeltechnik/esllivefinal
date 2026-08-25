# ============================================================================
#  esl_mail_report.ps1 - Stunden-Report per Outlook verschicken
# ============================================================================
#  WOZU
#    Das Dashboard erzeugt den Report als HTML-Datei im Download-Ordner
#    (ESL-Report-JJJJMMTT-HHMM.html) und schreibt Empfaenger und Betreff als
#    Marker in den Kopf der Datei:
#        <!--ESLMAIL to="..." subject="..."-->
#    Verschicken kann ein Browser-Skript sie nicht - dieses Skript nimmt die
#    neueste Datei, liest den Marker und uebergibt alles an Outlook.
#
#    Bis 29.07.2026 fehlte diese Datei: das Dashboard schrieb den Report brav
#    weg, die Oberflaeche versprach "verschickt ueber Outlook", und niemand
#    verschickte etwas. Genau deshalb kam nie eine Mail an.
#
#  AUFRUF
#    .\esl_mail_report.ps1                  Mail oeffnen, Absenden per Hand
#    .\esl_mail_report.ps1 -Senden          direkt abschicken (fuer Zeitplan)
#    .\esl_mail_report.ps1 -An "a@b.de"     Empfaenger uebersteuern
#    .\esl_mail_report.ps1 -Ordner "C:\..." anderen Ordner durchsuchen
#    .\esl_mail_report.ps1 -Senden -Stumm   fuer den Automatikbetrieb
#
#  Standardmaessig wird die Mail nur GEOEFFNET, nicht verschickt. Automatisch
#  raus geht sie erst mit -Senden - Mailversand ohne Rueckfrage soll eine
#  bewusste Entscheidung bleiben.
#
#  ANHAENGE: NUR DIE BEIDEN BILDER (Nutzer-Vorgabe 04.08.2026 abends)
#    Das Dashboard schreibt je Stunde vier Dateien mit demselben Namensstamm:
#        ESL-Report-JJJJMMTT-HHMM.html           Traeger der Marker (Empfaenger,
#                                                Betreff, Motivationstext)
#        ESL-Report-JJJJMMTT-HHMM.xlsx           Stand + Vertrieb + Analyse
#        ESL-Report-JJJJMMTT-HHMM.png            Bild des Blattes AKTUELLER_STAND
#        ESL-Report-JJJJMMTT-HHMM-vertrieb.png   Bild des Blattes VERTRIEB
#    In die MAIL gehen ausschliesslich die beiden PNG - eingebettet im Text und
#    zusaetzlich als Anhang. HTML und Excel bleiben liegen: der Empfaengerkreis
#    ist die ganze Mannschaft, und die soll den Stand sehen, ohne dass eine
#    vollstaendige Auswertungsmappe herumgereicht wird.
#    Die HTML wird weiter GELESEN (sie traegt die Marker), aber nicht angehaengt.
#    Ohne Bild geht gar keine Mail raus - eine leere Team-Mail ist schlechter
#    als keine.
#
#  AUTOMATIKBETRIEB (-Stumm)
#    Ohne -Stumm wartet JEDER Fehlerpfad auf [Enter]. Bei stuendlichem Aufruf
#    sammelt sich damit pro Fehlerstunde ein haengender PowerShell-Prozess an -
#    dieselbe Fehlerklasse, die im Projekt schon einmal den Starter lahmgelegt
#    hat (ein offener Dialog blockiert die Fernsteuerung). Mit -Stumm wird
#    stattdessen nur der Exitcode gesetzt: 0 = verschickt, 1 = nicht verschickt.
# ============================================================================
param(
    [string]$Ordner = "",
    # An/Cc duerfen MEHRERE Empfaenger enthalten. Trennzeichen ist das Semikolon
    # (so erwartet es Outlook); Kommas werden unten umgesetzt, aber nur dann,
    # wenn es sich eindeutig um E-Mail-Adressen handelt - ein Anzeigename wie
    # "Yarba, Veysel" enthaelt selbst ein Komma und darf nicht zerrissen werden.
    # Statt einer Adresse darf auch der NAME einer Verteilergruppe stehen; er
    # wird vor dem Versand gegen das Adressbuch aufgeloest.
    [string]$An = "",
    [string]$Cc = "",
    # MODUS - EIN Schalter statt mehrerer, damit die Regel "wer bekommt was"
    # an genau einer Stelle steht (05.08.):
    #   team    = die Mannschafts-Mail. NUR die zwei Bilder, keine Mappe.
    #             Das ist die ausdrueckliche Nutzer-Vorgabe vom 04.08. abends
    #             ("haengt auch noch HTML und Excel da drin ... das soll er NICHT")
    #             und bleibt gueltig - eine vollstaendige Auswertungsmappe hat in
    #             einer Mail an die ganze Mannschaft nichts verloren.
    #   leitung = Bilder PLUS die vollstaendige Excel-Mappe.
    #   kanal   = fuer einen Teams-Kanal (eigene Adresse des Kanals).
    [ValidateSet('team','leitung','kanal')]
    [string]$Modus = 'team',
    # Eigener Betreff. Ohne ihn traegt jeder Beitrag denselben Text wie die
    # Mannschafts-Mail - in einem Teams-Kanal ist das unbrauchbar.
    [string]$Betreff = "",
    # STAMM - der Dateisatz, der verschickt werden soll, OHNE Endung
    # ("ESL-Report-20260809-1400"). Ohne diesen Parameter wird wie bisher die
    # NEUESTE ESL-Report-*.html genommen.
    #
    # Gebraucht seit 09.08.: ESL_Start.cmd kann jetzt je Empfaengerkreis einen
    # eigenen Zuschnitt (Standort/Stack/Team) verschicken. Dafuer laeuft der
    # Report je Kreis einmal, und im Download-Ordner liegen innerhalb derselben
    # Minute bis zu drei Saetze nebeneinander. "Die neueste Datei" waere dann
    # Zufall - die Mannschaft bekaeme unter Umstaenden den Zuschnitt der Leitung.
    [string]$Stamm = "",
    # ALARM-BETRIEB (17.08.2026) - reine Textmail, KEINE Report-Dateien noetig.
    # Wird vom Watchdog des Dashboards ueber ESL_Start.cmd ausgeloest, wenn eine
    # Datenquelle trotz aller Selbstheilungs-Stufen still bleibt. Bewusst ein
    # eigener, sehr kurzer Weg: im Stoerungsfall darf der Versand NICHT davon
    # abhaengen, dass es einen frischen Report gibt - der fehlt dann ja gerade.
    [string]$Alarm = "",
    [switch]$Senden,
    [switch]$Stumm,
    [int]$MaxAlterMinuten = 90
)

$ErrorActionPreference = 'Stop'

function Schritt($t) { Write-Host "  $t" -ForegroundColor Cyan }
function Gut($t)     { Write-Host "  $t" -ForegroundColor Green }
function Warn($t)    { Write-Host "  $t" -ForegroundColor Yellow }
function Fehler($t)  { Write-Host "  $t" -ForegroundColor Red }

# Einzige Stelle, an der das Skript auf eine Eingabe warten darf. Im
# Automatikbetrieb kehrt sie sofort zurueck.
function Ende($code) {
    if (-not $Stumm) { try { Read-Host " [Enter] zum Schliessen" | Out-Null } catch {} }
    exit $code
}

# ---------------------------------------------------------------------------
#  ALARM-BETRIEB: reine Textmail, ohne Report-Dateien, ohne Bilder.
#  Laeuft VOR allem anderen und beendet das Skript - der ganze Rest dieser
#  Datei sucht nach einem frischen Report, und genau der fehlt im Stoerfall.
# ---------------------------------------------------------------------------
if ($Alarm) {
    if (-not $An) {
        Write-Host "  Alarm-Mail: kein Empfaenger (-An) angegeben." -ForegroundColor Red
        Ende 1
    }
    try {
        $ol = New-Object -ComObject Outlook.Application
        $m  = $ol.CreateItem(0)
        $m.To = $An
        if ($Cc) { $m.CC = $Cc }
        $m.Subject = if ($Betreff) { $Betreff } else { "ESL Live-Arena - STOERUNG" }
        $m.Body = $Alarm
        # Empfaenger VOR dem Senden aufloesen - ein unbekannter Name laesst
        # Send() sonst einen blockierenden Dialog oeffnen, und der Prozess
        # haengt bis zum Zeitlimit (dieselbe Lehre wie beim Stunden-Report).
        [void]$m.Recipients.ResolveAll()
        if ($Senden) { $m.Send(); Write-Host "  Alarm-Mail verschickt an $An" -ForegroundColor Yellow }
        else { $m.Display() }
        Ende 0
    } catch {
        Write-Host ("  Alarm-Mail fehlgeschlagen: " + $_.Exception.Message) -ForegroundColor Red
        Ende 1
    }
}

Write-Host ""
Write-Host "  ESL-Report per Outlook verschicken" -ForegroundColor White
Write-Host "  ----------------------------------" -ForegroundColor DarkGray

# ---------- 1. Report-Datei finden ----------
if (-not $Ordner -or $Ordner -eq "") {
    $Ordner = Join-Path $env:USERPROFILE 'Downloads'
}
if (-not (Test-Path -LiteralPath $Ordner)) {
    Fehler "Ordner nicht gefunden: $Ordner"
    Ende 1
}
Schritt "Suche in: $Ordner"

if ($Stamm -and $Stamm -ne "") {
    # Ein fest benannter Dateisatz. Bewusst KEIN Rueckfall auf "die neueste
    # Datei": wer einen Stamm nennt, will genau diesen Zuschnitt: still auf einen
    # anderen auszuweichen hiesse, den falschen Empfaengern die falschen Zahlen
    # zu schicken - und das faellt niemandem auf.
    $sPfad = Join-Path $Ordner ($Stamm + '.html')
    if (-not (Test-Path -LiteralPath $sPfad)) {
        Fehler "Der angeforderte Report-Satz fehlt: $($Stamm).html"
        Warn  "Er wird vom Dashboard erzeugt (rcReportNow). Ohne -Stamm nimmt dieses Skript die neueste Datei."
        Ende 1
    }
    $datei = Get-Item -LiteralPath $sPfad
    Schritt "Fest angeforderter Satz: $Stamm"
} else {
    $datei = Get-ChildItem -LiteralPath $Ordner -Filter 'ESL-Report-*.html' -File -ErrorAction SilentlyContinue |
             Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

if (-not $datei) {
    Fehler "Keine Datei ESL-Report-*.html gefunden."
    Warn  "Im Dashboard zuerst einen Report erzeugen (Konfiguration -> Report -> Jetzt erzeugen)."
    Ende 1
}
Gut "gefunden: $($datei.Name)  ($([math]::Round($datei.Length/1KB)) KB)"

$alterMin = [math]::Round(((Get-Date) - $datei.LastWriteTime).TotalMinutes)
if ($alterMin -gt $MaxAlterMinuten) {
    # Lieber nichts verschicken als veraltete Zahlen: eine Stunden-Mail mit dem
    # Stand von gestern richtet mehr Schaden an als eine ausgefallene Mail.
    Fehler "Der Report ist $alterMin Minuten alt (Grenze: $MaxAlterMinuten)."
    Warn  "Es wird NICHTS verschickt. Erst einen frischen Report erzeugen,"
    Warn  "oder die Grenze anheben:  -MaxAlterMinuten $([math]::Max(120,$alterMin+10))"
    Ende 1
}
Gut "Stand: $($datei.LastWriteTime.ToString('dd.MM.yyyy HH:mm'))  ($alterMin Min. alt)"

# ---------- 2. Marker auslesen ----------
$html = Get-Content -LiteralPath $datei.FullName -Raw -Encoding UTF8

$empfaenger = $An
$kopie      = $Cc
$betreff = ""
# cc ist OPTIONAL im Muster: Reports, die vor dem 05.08. erzeugt wurden, haben
# den Abschnitt nicht. Ohne das "?" wuerde der Marker dort gar nicht mehr
# gefunden und der Betreff faelschlich aus dem Titel abgeleitet.
$m = [regex]::Match($html, '<!--ESLMAIL\s+to="([^"]*)"(?:\s+cc="([^"]*)")?\s+subject="([^"]*)"-->')
if ($m.Success) {
    if (-not $empfaenger -or $empfaenger -eq "") { $empfaenger = $m.Groups[1].Value }
    # DIE KOPIE WIRD NUR IM TEAM-MODUS AUS DEM MARKER GEERBT.
    # Der Marker traegt die Kopie der MANNSCHAFTS-Mail. Wuerde sie auch im
    # Leitungs- oder Kanal-Modus greifen, bekaeme dieser Verteiler stillschweigend
    # die vollstaendige Auswertungsmappe mit - also genau das, was die Vorgabe
    # vom 04.08. verhindern soll. Der Fehler waere unsichtbar: die Mail geht raus,
    # niemand sieht das CC-Feld im Nachhinein an.
    if ((-not $kopie -or $kopie -eq "") -and $Modus -eq 'team') { $kopie = $m.Groups[2].Value }
    $betreff = $m.Groups[3].Value
} else {
    Warn "Kein ESLMAIL-Marker in der Datei - Betreff wird aus dem Titel abgeleitet."
    $t = [regex]::Match($html, '<title>([^<]*)</title>')
    if ($t.Success) { $betreff = $t.Groups[1].Value }
}

# HTML-Entities im Marker zurueckwandeln (der Browser hat sie beim Schreiben maskiert)
function Entschluesseln($s) {
    if (-not $s) { return "" }
    # Ersatzzeichen in Anfuehrungszeichen: ein nacktes & ist in PowerShell ein
    # reservierter Operator und bricht das Skript beim Einlesen ab.
    $t = $s
    $t = $t -replace '&lt;', '<'
    $t = $t -replace '&gt;', '>'
    $t = $t -replace '&quot;', '"'
    $t = $t -replace '&#39;', "'"
    $t = $t -replace '&amp;', [char]38 # zuletzt, sonst entstehen neue Entities
                                       # ([char]38 = kaufmaennisches Und; als
                                       #  Literal ist es ein reservierter Operator)
    return $t
}
$empfaenger = Entschluesseln $empfaenger
$kopie      = Entschluesseln $kopie
$betreff    = Entschluesseln $betreff

# Trennzeichen vereinheitlichen. Outlook erwartet Semikolon; getippt wird oft
# mit Komma. Umgesetzt wird NUR, wenn kein Semikolon da ist UND mindestens zwei
# @-Zeichen vorkommen - dann sind es sicher Adressen. Ein Anzeigename oder ein
# Gruppenname ("Team Alanya, Schicht 2") bleibt damit unangetastet; ihn zu
# zerreissen wuerde zwei Empfaenger erzeugen, die es beide nicht gibt.
function TrennerNormalisieren($s) {
    if (-not $s) { return "" }
    if ($s.Contains(';')) { return $s }
    if (([regex]::Matches($s, '@')).Count -ge 2) { return ($s -replace '\s*,\s*', '; ') }
    return $s
}
$empfaenger = TrennerNormalisieren $empfaenger
$kopie      = TrennerNormalisieren $kopie
# Eigener Betreff schlaegt den aus dem Marker.
if ($Betreff -and $Betreff -ne "") { $betreff = $Betreff }
Schritt "Modus: $Modus"
if (-not $betreff -or $betreff -eq "") { $betreff = "ESL Live-Arena - Report" }

if (-not $empfaenger -or $empfaenger.Trim() -eq "") {
    Fehler "Kein Empfaenger hinterlegt."
    Warn  "Im Dashboard unter Konfiguration -> Report eintragen,"
    Warn  "oder hier uebergeben:  .\esl_mail_report.ps1 -An ""name@firma.de"""
    Ende 1
}
Gut "An:      $empfaenger"
Gut "Betreff: $betreff"

# ---------- 3. Outlook ----------
Schritt "Verbinde mit Outlook ..."
$ol = $null
try {
    # Laufende Instanz bevorzugen; sonst startet COM eine neue.
    $ol = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
    Gut "an laufendes Outlook angedockt"
} catch {
    try {
        $ol = New-Object -ComObject Outlook.Application
        Gut "Outlook gestartet"
    } catch {
        Fehler "Outlook nicht erreichbar: $($_.Exception.Message)"
        Warn  "Ist Outlook auf diesem Rechner installiert und eingerichtet?"
        Warn  "Hinweis: Das reine 'neue Outlook' (olk.exe) hat kein COM-Objektmodell -"
        Warn  "damit ist ein automatischer Versand nicht moeglich, dort hilft nur das"
        Warn  "klassische Outlook."
        Ende 1
    }
}

# ---------- 3b. Die beiden Bilder suchen ----------
# Das Dashboard schreibt alle Dateien mit demselben Namensstamm
# (v22.js: var base='ESL-Report-'+stamp(), danach base+'.html'/'.xlsx'/'.png').
# Ueber den BaseName sind sie damit eindeutig zuzuordnen - eine Suche nach dem
# "neuesten .png" waere falsch, das koennte aus einer anderen Stunde stammen.
$stamm  = $datei.BaseName
$png    = Join-Path $Ordner ($stamm + '.png')
$pngV   = Join-Path $Ordner ($stamm + '-vertrieb.png')
$hatPng  = Test-Path -LiteralPath $png
$hatPngV = Test-Path -LiteralPath $pngV
if ($hatPng)  { Gut "Bild 1 (Stand):    $($stamm).png" }
else          { Warn "Kein Stand-Bild gefunden ($($stamm).png)." }
if ($hatPngV) { Gut "Bild 2 (Vertrieb): $($stamm)-vertrieb.png" }
else          { Warn "Kein Vertriebs-Bild gefunden - aeltere Dashboard-Fassung? Die Mail geht mit einem Bild." }

# Die vollstaendige Excel-Mappe - gleicher Namensstamm wie die Bilder.
# Sie enthaelt seit 05.08. auch die Aggregat-Blaetter (Struktur, Liga Standorte,
# Liga Teams, Standorte, Stacks, Teams, Agenten, Entwicklung), ist also DIESELBE
# Mappe wie der Bericht auf Knopfdruck - nur mit dem Zuschnitt aus der
# Report-Konfiguration statt dem der Dashboard-Filter.
$xlsx    = Join-Path $Ordner ($stamm + '.xlsx')
$hatXlsx = Test-Path -LiteralPath $xlsx
$willXlsx = ($Modus -ne 'team')
if ($willXlsx) {
    if ($hatXlsx) {
        $kb = [math]::Round((Get-Item -LiteralPath $xlsx).Length / 1024)
        Gut "Mappe:             $($stamm).xlsx  ($kb KB)"
    } else {
        Warn "Keine Excel-Mappe gefunden ($($stamm).xlsx) - die Mail geht ohne sie."
        Warn "Das Dashboard schreibt sie im selben Takt wie die Bilder (rcReport)."
    }
}

# SCHLANKE REPORTING-MAPPE (Nutzer-Vorgabe 06.08. spaetabends): eine Excel mit
# NUR der Block-Ansicht (Standort -> Stacks -> Teams), Vertrieb und Qualitaet
# getrennt. Das Dashboard schreibt sie nur, wenn im Konfigurator unter Report
# "Reporting-Mappe" eingeschaltet ist - fehlt sie, ist das also kein Fehler.
# Sie geht in JEDEN Modus mit, auch an die Mannschaft: sie enthaelt keine
# Einzel-Bewertung, sondern die Uebersicht, die der Nutzer verschicken will.
# (Die grosse Auswertungsmappe bleibt der Leitung vorbehalten, siehe oben.)
$rep    = Join-Path $Ordner ($stamm + '-reporting.xlsx')
$hatRep = Test-Path -LiteralPath $rep
if ($hatRep) {
    $kbR = [math]::Round((Get-Item -LiteralPath $rep).Length / 1024)
    Gut "Reporting-Mappe:   $($stamm)-reporting.xlsx  ($kbR KB)"
}

# ABBRUCHREGEL, je nach Modus verschieden.
# team:    ohne Bild bliebe nur der Begruessungstext uebrig - das ist keine Mail,
#          die man an die Mannschaft schickt. Lieber gar keine, dann faellt es auf.
# leitung: dort ist die MAPPE die Nutzlast. Ein fehlendes Bild darf den Versand
#          nicht verhindern - wohl aber "weder Bild noch Mappe".
if ($Modus -eq 'team') {
    if (-not $hatPng -and -not $hatPngV) {
        Fehler "Kein einziges Bild zum Report gefunden - es geht keine Mail raus."
        Warn   "Erzeugt werden sie vom Dashboard (rcReport). Laeuft dort der Stundentakt?"
        Ende 1
    }
} else {
    if (-not $hatPng -and -not $hatPngV -and -not $hatXlsx) {
        Fehler "Weder Bild noch Excel-Mappe gefunden - es geht keine Mail raus."
        Warn   "Erzeugt werden sie vom Dashboard (rcReport). Laeuft dort der Stundentakt?"
        Ende 1
    }
}

# Motivationstext aus der HTML (Marker ESLMOTI, seit 04.08. vom Dashboard
# geschrieben). Er kennt die echten Zahlen ("X von Y haben schon KIP/MOB").
# Fehlt der Marker (aeltere Report-Datei), gibt es einen neutralen Gruss.
$moti = 'Hallo Team, hier unser aktueller Stand in Qualitaet und Vertrieb.'
$mm2 = [regex]::Match($html, '<!--ESLMOTI\s+text="([^"]*)"-->')
if ($mm2.Success) { $moti = Entschluesseln $mm2.Groups[1].Value }

try {
    $mail = $ol.CreateItem(0)          # 0 = olMailItem
    $mail.To = $empfaenger
    if ($kopie) { $mail.CC = $kopie }
    $mail.Subject = $betreff
    # Der Mailtext ist ein KOMPAKTER Team-Text mit den beiden Bildern
    # (Nutzer-Vorgabe: "genau so zwei Screenshots per E-Mail und ein kleiner
    # Text dazu"). HTML-Report und Excel haengen seit 04.08. abends NICHT mehr an
    # (Nutzer-Vorgabe: "Das braucht er nicht") - die Bilder sind die Mail.
    # Reihenfolge beachten: HTMLBody MUSS vor den Anhaengen gesetzt sein, sonst
    # verwirft Outlook die spaeter gesetzten cid-Verknuepfungen der Bilder.
    $st = 'font-family:Segoe UI,Arial,sans-serif;'
    $body = '<div style="' + $st + ' font-size:13.5px; color:#222; line-height:1.5; max-width:1200px;">' +
            '<p style="margin:0 0 14px 0;">' + $moti + '</p>'
    # Im Leitungs-Modus vorab EIN Satz, was die Mappe enthaelt - sonst sieht man
    # nur einen Anhang und weiss nicht, ob er den ganzen Zeitraum abdeckt.
    if ($Modus -eq 'leitung' -and $hatXlsx) {
        $body += '<p style="margin:0 0 14px 0; color:#444;">Die vollstaendige Auswertung haengt als Excel-Mappe an ' +
                 '(Stand, Vertrieb, Produkte, Analyse, Struktur, Standorte, Stacks, Teams, Agenten, Entwicklung).</p>'
    }
    if ($hatPng)  { $body += '<div style="font:600 13px Segoe UI,Arial,sans-serif; color:#333; margin:0 0 6px 0;">Aktueller Stand</div>' +
                             '<img src="cid:eslstand" style="max-width:100%; border:1px solid #ccc; margin-bottom:18px;"><br>' }
    if ($hatPngV) { $body += '<div style="font:600 13px Segoe UI,Arial,sans-serif; color:#333; margin:0 0 6px 0;">Vertrieb - Stueck je Produktgruppe</div>' +
                             '<img src="cid:eslvertrieb" style="max-width:100%; border:1px solid #ccc; margin-bottom:18px;">' }
    $body += '</div>'
    $mail.HTMLBody = $body

    # Bilder EINBETTEN, nicht nur anhaengen: als reiner Anhang muesste der
    # Empfaenger sie erst oeffnen - im Mailtext stehen sie sofort da und lassen
    # sich an die Mannschaft weiterleiten, ohne die Excel herauszugeben.
    function BildEinbetten($pfad, $cid) {
        $att = $mail.Attachments.Add($pfad)
        try {
            # PR_ATTACH_CONTENT_ID - macht den Anhang ueber cid: referenzierbar.
            $att.PropertyAccessor.SetProperty(
                'http://schemas.microsoft.com/mapi/proptag/0x3712001F', $cid)
        } catch {
            # Setzt der Server die Eigenschaft nicht, bleibt das Bild ein
            # normaler Anhang. Kein Grund, die Mail nicht zu verschicken.
            Warn "Bild $cid konnte nicht eingebettet werden ($($_.Exception.Message)) - es haengt trotzdem an."
        }
    }
    if ($hatPng)  { BildEinbetten $png  'eslstand' }
    if ($hatPngV) { BildEinbetten $pngV 'eslvertrieb' }

    # Die vollstaendige Mappe anhaengen - NUR ausserhalb des Team-Modus.
    # Sie kommt NACH $mail.HTMLBody (Zeile oben), sonst verwirft Outlook die
    # cid-Verknuepfungen der Bilder.
    if ($willXlsx -and $hatXlsx) {
        try { [void]$mail.Attachments.Add($xlsx); Gut "Mappe angehaengt." }
        catch { Warn "Mappe konnte nicht angehaengt werden ($($_.Exception.Message)) - die Mail geht ohne sie." }
    }
    # Die schlanke Reporting-Mappe geht in JEDEN Modus mit, sofern das Dashboard
    # sie geschrieben hat. Ebenfalls NACH dem HTMLBody, gleicher Grund.
    if ($hatRep) {
        try { [void]$mail.Attachments.Add($rep); Gut "Reporting-Mappe angehaengt." }
        catch { Warn "Reporting-Mappe konnte nicht angehaengt werden ($($_.Exception.Message))." }
    }

    # EMPFAENGER AUFLOESEN, BEVOR gesendet wird.
    # Ohne das ist ein Tippfehler oder ein Verteilergruppen-Name, den Outlook
    # nicht kennt, erst beim Send() ein Problem - dort aber als unklarer
    # COM-Fehler oder, schlimmer, als Dialog, der diesen Prozess bis zum
    # Zeitlimit blockiert. ResolveAll() macht daraus eine klare Meldung mit dem
    # Namen, der nicht gefunden wurde.
    $offen = @()
    try {
        [void]$mail.Recipients.ResolveAll()
        foreach ($r in $mail.Recipients) { if (-not $r.Resolved) { $offen += "$($r.Name)" } }
    } catch {
        Warn "Empfaenger konnten nicht geprueft werden ($($_.Exception.Message)) - es wird trotzdem versucht."
    }
    if ($offen.Count -gt 0) {
        Fehler ("Unbekannte Empfaenger: " + ($offen -join ', '))
        Warn   "Bitte im Adressbuch pruefen. Bei einer Verteilergruppe muss der"
        Warn   "Anzeigename genau stimmen; mehrere Adressen mit Semikolon trennen."
        if ($Senden) {
            # Bewusst NICHT abschicken: eine Mail an einen Teil der Mannschaft
            # sieht aus wie ein Erfolg und faellt niemandem auf.
            Warn "Es wird NICHTS verschickt."
            Ende 1
        }
    } else {
        $namen = @(); foreach ($r in $mail.Recipients) { $namen += "$($r.Name)" }
        Gut ("Empfaenger geprueft: " + ($namen -join ', '))
    }

    if ($Senden) {
        $mail.Send()
        Gut "Mail verschickt."
    } else {
        $mail.Display()
        Gut "Mail geoeffnet - zum Abschicken auf Senden klicken."
        Write-Host "  (Fuer vollautomatischen Versand:  .\esl_mail_report.ps1 -Senden)" -ForegroundColor DarkGray
    }
} catch {
    Fehler "Mail konnte nicht erstellt werden: $($_.Exception.Message)"
    Ende 1
}

Write-Host ""
if (-not $Senden) { Ende 0 }
exit 0
