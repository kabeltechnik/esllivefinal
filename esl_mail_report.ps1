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
#
#  Standardmaessig wird die Mail nur GEOEFFNET, nicht verschickt. Automatisch
#  raus geht sie erst mit -Senden - Mailversand ohne Rueckfrage soll eine
#  bewusste Entscheidung bleiben.
# ============================================================================
param(
    [string]$Ordner = "",
    [string]$An = "",
    [switch]$Senden,
    [int]$MaxAlterMinuten = 90
)

$ErrorActionPreference = 'Stop'

function Schritt($t) { Write-Host "  $t" -ForegroundColor Cyan }
function Gut($t)     { Write-Host "  $t" -ForegroundColor Green }
function Warn($t)    { Write-Host "  $t" -ForegroundColor Yellow }
function Fehler($t)  { Write-Host "  $t" -ForegroundColor Red }

Write-Host ""
Write-Host "  ESL-Report per Outlook verschicken" -ForegroundColor White
Write-Host "  ----------------------------------" -ForegroundColor DarkGray

# ---------- 1. Report-Datei finden ----------
if (-not $Ordner -or $Ordner -eq "") {
    $Ordner = Join-Path $env:USERPROFILE 'Downloads'
}
if (-not (Test-Path -LiteralPath $Ordner)) {
    Fehler "Ordner nicht gefunden: $Ordner"
    try { Read-Host " [Enter] zum Schliessen" | Out-Null } catch {}
    exit 1
}
Schritt "Suche in: $Ordner"

$datei = Get-ChildItem -LiteralPath $Ordner -Filter 'ESL-Report-*.html' -File -ErrorAction SilentlyContinue |
         Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $datei) {
    Fehler "Keine Datei ESL-Report-*.html gefunden."
    Warn  "Im Dashboard zuerst einen Report erzeugen (Konfiguration -> Report -> Jetzt erzeugen)."
    try { Read-Host " [Enter] zum Schliessen" | Out-Null } catch {}
    exit 1
}
Gut "gefunden: $($datei.Name)  ($([math]::Round($datei.Length/1KB)) KB)"

$alterMin = [math]::Round(((Get-Date) - $datei.LastWriteTime).TotalMinutes)
if ($alterMin -gt $MaxAlterMinuten) {
    # Lieber nichts verschicken als veraltete Zahlen: eine Stunden-Mail mit dem
    # Stand von gestern richtet mehr Schaden an als eine ausgefallene Mail.
    Fehler "Der Report ist $alterMin Minuten alt (Grenze: $MaxAlterMinuten)."
    Warn  "Es wird NICHTS verschickt. Erst einen frischen Report erzeugen,"
    Warn  "oder die Grenze anheben:  -MaxAlterMinuten $([math]::Max(120,$alterMin+10))"
    try { Read-Host " [Enter] zum Schliessen" | Out-Null } catch {}
    exit 1
}
Gut "Stand: $($datei.LastWriteTime.ToString('dd.MM.yyyy HH:mm'))  ($alterMin Min. alt)"

# ---------- 2. Marker auslesen ----------
$html = Get-Content -LiteralPath $datei.FullName -Raw -Encoding UTF8

$empfaenger = $An
$betreff = ""
$m = [regex]::Match($html, '<!--ESLMAIL\s+to="([^"]*)"\s+subject="([^"]*)"-->')
if ($m.Success) {
    if (-not $empfaenger -or $empfaenger -eq "") { $empfaenger = $m.Groups[1].Value }
    $betreff = $m.Groups[2].Value
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
$betreff    = Entschluesseln $betreff
if (-not $betreff -or $betreff -eq "") { $betreff = "ESL Live-Arena - Report" }

if (-not $empfaenger -or $empfaenger.Trim() -eq "") {
    Fehler "Kein Empfaenger hinterlegt."
    Warn  "Im Dashboard unter Konfiguration -> Report eintragen,"
    Warn  "oder hier uebergeben:  .\esl_mail_report.ps1 -An ""name@firma.de"""
    try { Read-Host " [Enter] zum Schliessen" | Out-Null } catch {}
    exit 1
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
        try { Read-Host " [Enter] zum Schliessen" | Out-Null } catch {}
        exit 1
    }
}

try {
    $mail = $ol.CreateItem(0)          # 0 = olMailItem
    $mail.To = $empfaenger
    $mail.Subject = $betreff
    $mail.HTMLBody = $html
    # Die Datei zusaetzlich anhaengen: manche Postfaecher strippen eingebettetes
    # HTML-Styling, der Anhang bleibt in jedem Fall lesbar.
    $mail.Attachments.Add($datei.FullName) | Out-Null

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
    try { Read-Host " [Enter] zum Schliessen" | Out-Null } catch {}
    exit 1
}

Write-Host ""
if (-not $Senden) {
    try { Read-Host " [Enter] zum Schliessen" | Out-Null } catch {}
}
