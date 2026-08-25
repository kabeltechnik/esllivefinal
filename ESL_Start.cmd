@echo off
setlocal
title ESL Live-Arena - Start
REM ==========================================================
REM  ESL Live-Arena - Start
REM  SELBST-ENTHALTEND: der PowerShell-Code steckt in dieser
REM  Datei. Es wird KEINE .ps1 daneben gebraucht.
REM  Funktioniert auch auf Netzlaufwerken (UNC-Pfade) —
REM  es wird bewusst KEIN "cd" gemacht.
REM  Einfach doppelklicken. Das Fenster bleibt offen.
REM ==========================================================
set "ESLDIR=%~dp0"
set "ESLSELF=%~f0"
REM Projekt dieses PCs: kabel (leer = kabel), mobile oder um.
REM   ESL_Start.cmd            -> Vodafone Kabel
REM   ESL_Start.cmd mobile     -> Vodafone Mobile
REM   ESL_Start.cmd um         -> Vodafone UM
REM Jeder PC faehrt EIN Projekt - der Autopilot haelt es fest und wechselt
REM zurueck, wenn das Portal nach einem Re-Login woanders landet.
set "ESLPROJEKT=%~1"
echo.
echo  Ordner: %ESLDIR%
if not "%ESLPROJEKT%"=="" echo  Projekt: %ESLPROJEKT%
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$s=Get-Content -Raw -LiteralPath $env:ESLSELF; $i=$s.IndexOf([char]35+'PSSTART'); if($i -lt 0){Write-Host 'FEHLER: Marker nicht gefunden - Datei unvollstaendig?' -ForegroundColor Red}else{Invoke-Expression $s.Substring($i)}"
if errorlevel 1 (
  echo.
  echo ==========================================================
  echo  Fehler - bitte zuerst ESL_Test.cmd ausfuehren.
  echo ==========================================================
)
echo.
pause
endlocal
exit /b

#PSSTART
<#
================================================================================
 ESL Live-Arena - EIN-KLICK-START (PowerShell + Edge-Fernsteuerung)
================================================================================
 WAS DAS HIER LOEST
   Ein Lesezeichen wird bei jedem Seitenwechsel beendet, und Citrix leert den
   Browser-Speicher. Beides faellt hier weg: PowerShell startet Edge mit der
   eingebauten Fernsteuerung (DevTools-Protokoll) und meldet dort EINMAL an:
   "fuehre dieses Script auf JEDER Seite aus, die geladen wird".
   Das ist derselbe Mechanismus, den eine Browser-Erweiterung nutzt - nur ohne
   Erweiterung, ohne Admin-Rechte und ohne Installation.

   Ergebnis: EIN Doppelklick.
     - Edge oeffnet ESL, meldet an, navigiert bis zur Export-Ansicht,
       startet das Dashboard
     - zweiter Tab: CCS -> Microsoft-Anmeldung -> Ligaliste -> KPI-Crawler
     - der Code wird DIREKT von diesem Ordner gelesen (kein Browser-Speicher,
       keine Datei-Dialoge, keine Lesezeichen-Groessenlimits)

 VORAUSSETZUNGEN
   - Windows mit Microsoft Edge (Standard) - keine Admin-Rechte noetig
   - Diese .ps1 liegt im selben Ordner wie:
       esl_autopilot.user.js * esl_live_arena_v22.js * kpi_crawler.js
       genesys_monitor_crawler.js (optional, fuer die Warteschleifen-Seite)

 START
   Rechtsklick auf ESL_Start.ps1 -> "Mit PowerShell ausfuehren"
   ODER die mitgelieferte ESL_Start.cmd doppelklicken (empfohlen, macht dasselbe
   und umgeht die Ausfuehrungsrichtlinie sauber ueber -ExecutionPolicy Bypass).

 PASSWOERTER
   Dieses Script speichert und tippt KEINE Passwoerter. Es nutzt ein eigenes
   Edge-Profil (Ordner "EdgeProfil" neben dieser Datei). Dort meldest du dich
   EINMAL von Hand an und laesst Edge das Passwort speichern - weil das Profil
   auf deinem Laufwerk liegt, ueberlebt es Citrix-Neustarts. Danach fuellt Edge
   selbst aus, und der Autopilot klickt nur noch.

 ABSCHALTEN / ANPASSEN - siehe Block "EINSTELLUNGEN" unten.
================================================================================
#>

# ------------------------------- EINSTELLUNGEN -------------------------------
$EslUrl      = 'https://esl.regiocom.net/Agents/login_esl.xhtml'
# Direkt die Ligaliste ansteuern statt der CCS-Startseite: ist man noch nicht
# angemeldet, leitet CCS selbst zur Microsoft-Anmeldung und danach HIERHER
# zurueck. Spart den Zwischenschritt ueber start.rb.
$CcsUrl      = 'https://ccs.vodafone.de/cgi-bin/AGENTEN_KENNZAHLEN_2/LIGA_LISTEN_NEW/dist/liga_listen.rb?script_id=11035'
$AnmeldeMail = ''          # z.B. 'vorname.nachname@vodafone.com' - NUR die Adresse, nie ein Passwort
$CcsOeffnen  = $true       # zweiten Tab fuer Ligaliste/CCS oeffnen

# ---------------------------------------------------------------------------
#  >>> AUTOMATISIERUNG <<<   (16.08.)
#  Jeder Teil einzeln abschaltbar. $true = laeuft von allein, $false = nur
#  von Hand. Anders als die DASHBOARD-EINSTELLUNGEN weiter unten gibt es hier
#  KEIN $null: das sind keine Dashboard-Werte, die man dort umstellen koennte,
#  sondern was DIESER Starter tut.
# ---------------------------------------------------------------------------
# ESL: Anmeldung abschicken und den Autopiloten navigieren lassen (Projekt-
# Menue, Ansicht "Projektergebnisse"). $false heisst zugleich Handbetrieb -
# der Autopilot zeigt dann nur noch seinen roten Startknopf.
$AutoEsl        = $true
# Dashboard einspielen, sobald die Export-Ansicht steht.
$AutoDashboard  = $true
# Ligalisten-Fenster oeffnen (aus dem Dashboard heraus, damit der opener sitzt)
# und den fehlenden Ok-Klick nachholen.
$AutoLigaliste  = $true
# Genesys-Monitor oeffnen und versorgen (Seite "Warteschleife").
# AB WERK AUS (17.08., Nutzer-Befund "warum startet Genesys jedes Mal, obwohl er
# deaktiviert ist"): StelleGenesysSicher ruft rcOpenQueueQuelle() DIREKT auf und
# umgeht dabei bewusst CFG.autoQuelle - und rcOpenQueueQuelle selbst prueft weder
# autoQuelle noch modulAus. Damit war jeder Aus-Schalter im Dashboard eine
# Attrappe: der Waechter machte das Fenster alle 2 Minuten wieder auf. Wer
# Genesys will, setzt hier $true; der Dashboard-Haken allein reicht nicht.
$AutoGenesys    = $false
# Fernsteuerungs-Port und Edge-Profil stehen NICHT hier, sondern in Abschnitt 0b:
# beide haengen am gewaehlten Projekt (kabel 9222 / mobile 9223 / um 9224).
# Ein zweiter Wert an dieser Stelle waere wirkungslos und damit irrefuehrend.
# -----------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$Basis = $env:ESLDIR

# ---------- 0) PROJEKT DIESES PCs (06.08. spaetabends, Nutzer-Vorgabe) --------
# "Koennte man nicht einfach eine Startdatei machen, wo nur ein Stack macht?
#  Die werden eh alle auf verschiedenen PCs laufen."
# Hintergrund (Live-Befund): alle ESL-Tabs EINES Edge-Profils teilen sich EINE
# Server-Sitzung, und das Portal merkt sich serverseitig das zuletzt gewaehlte
# Projekt. Liefen Kabel+Mobile im selben Profil, kippte nach einem Re-Login ein
# Tab still auf das Projekt des anderen ("Kabel auf null, Mobilfunk normal,
# dann andersrum"). Deshalb: EIN Projekt je PC, hier festgenagelt.
$ProjektWahl = ('' + $env:ESLPROJEKT).Trim().ToLower()
if ($ProjektWahl -eq '' -or $ProjektWahl -eq 'kabel') { $ProjektWahl = 'kabel' }
elseif ($ProjektWahl -eq 'mobile' -or $ProjektWahl -eq 'mob' -or $ProjektWahl -eq 'mobilfunk') { $ProjektWahl = 'mobile' }
elseif ($ProjektWahl -eq 'um') { $ProjektWahl = 'um' }
else {
    Write-Host "  Unbekanntes Projekt '$($env:ESLPROJEKT)' - erlaubt: kabel, mobile, um." -ForegroundColor Red
    Write-Host "  Aufruf:  ESL_Start.cmd mobile" -ForegroundColor Yellow
    exit 1
}
$ProjektName = @{ kabel='Vodafone Kabel'; mobile='Vodafone Mobile'; um='Vodafone UM' }[$ProjektWahl]

# ---------- 0b) EIGENER BROWSER JE PROJEKT (Nutzer-Vorgabe 07.08.) ------------
# "wenn ich ESL_Start um oder mobile oder kabel starte, soll jedes Stack einen
#  eigenen Browser haben mit Ligaliste und Genesys."
# Das loest zugleich die Ursache des Sitzungs-Kippens vom 06.08.: geteilt wurde
# nie "der Rechner", sondern das EDGE-PROFIL. Ein Profil hat EINEN Cookie-Jar,
# also EINE ESL-Server-Sitzung — deshalb kippten zwei Projekte im selben Profil
# gegeneinander. Getrennte Profile haben getrennte Cookies und damit getrennte
# Sitzungen; drei Projekte koennen dann gefahrlos auf EINEM Rechner laufen.
# Zwei Dinge muessen dafuer je Projekt verschieden sein:
#   - das Profil  (sonst teilen sie sich die Sitzung; Edge laesst ein Profil
#                  ohnehin nur EINMAL mit --remote-debugging-port oeffnen)
#   - der Port    (sonst redet der zweite Starter mit dem ERSTEN Browser und
#                  legt sein Autopilot-Paket in fremde Tabs)
# Kabel behaelt bewusst Profil und Port OHNE Zusatz — sonst waeren die dort
# gespeicherten Zugangsdaten nach dem Update auf einen Schlag weg (gleiche
# Ueberlegung wie bei rcKey(), wo Kabel den Schluessel ohne Zusatz behaelt).
$ProfilName = @{ kabel='EdgeProfil'; mobile='EdgeProfil_mobile'; um='EdgeProfil_um' }[$ProjektWahl]
$DebugPort  = @{ kabel=9222;         mobile=9223;                um=9224           }[$ProjektWahl]

function Schritt($t) { Write-Host "  $t" -ForegroundColor Cyan }
function Gut($t)     { Write-Host "  $t" -ForegroundColor Green }
function Warn($t)    { Write-Host "  $t" -ForegroundColor Yellow }
function Fehler($t)  { Write-Host "  $t" -ForegroundColor Red }

Write-Host ""
Write-Host "  ESL Live-Arena - Start  [$ProjektName]" -ForegroundColor White
Write-Host "  ----------------------" -ForegroundColor DarkGray
# Standmarke. Ohne sie war nach jedem Update unklar, ob die neue Datei
# ueberhaupt gestartet wurde - die Ausgabe sah bis zur Anmeldung identisch aus.
# Beim Aendern dieser Datei MITZIEHEN.
$StarterStand = '2026-10-05 Liga-verbunden'
Write-Host "  Stand: $StarterStand" -ForegroundColor DarkGray

# ---------- 1) Dateien einlesen ----------
# Liest eine Datei UND prueft, ob sie plausibel ist. Grund: auf dem Netzlaufwerk
# entstanden schon 0-KB-Huellen, und es lag Code unter falschem Namen im Ordner.
# Eine leere/falsche Datei wuerde sonst stillschweigend injiziert.
function LiesDatei($name, $pflicht, $minKB, $marker) {
    $p = Join-Path $Basis $name
    $da = $false
    try { $da = Test-Path -LiteralPath $p } catch { $da = $false }
    if (-not $da) {
        if ($pflicht) { Fehler "FEHLT: $name  (muss neben dieser Datei liegen)"; return $null }
        Warn "nicht vorhanden (optional): $name"
        return ''
    }
    $inhalt = ''
    try { $inhalt = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8) }
    catch { Fehler ("$name nicht lesbar: " + $_.Exception.Message); if ($pflicht) { return $null } else { return '' } }
    $kb = [math]::Round($inhalt.Length / 1024)
    if ($minKB -and $kb -lt $minKB) {
        Fehler ("$name ist nur $kb KB (erwartet >= $minKB KB) - LEER oder unvollstaendig kopiert!")
        if ($pflicht) { return $null } else { return '' }
    }
    if ($marker -and ($inhalt.Substring(0, [Math]::Min(4000, $inhalt.Length)) -notmatch [regex]::Escape($marker))) {
        Fehler ("$name enthaelt nicht '$marker' - vermutlich die FALSCHE Datei unter diesem Namen.")
        if ($pflicht) { return $null } else { return '' }
    }
    Gut ("gefunden: $name  ($kb KB)")
    return $inhalt
}
# Binaerdatei (die Mitarbeiter-Excel) als Base64 einlesen. Sie reist genau so
# mit wie der Dashboard-Code - damit muss im Dashboard NICHTS mehr von Hand
# gewaehlt werden. Vorher lag das Mapping nur im Browser-Speicher, und den
# leert Citrix regelmaessig: dann stand das Dashboard ohne Mapping da.
function LiesBinaerBase64($name, $minBytes) {
    # $minBytes: Mindestgroesse. Die Mitarbeiter-Excel muss gross sein (10 KB),
    # ein PNG-Logo darf klein sein - mit der festen 10-KB-Schwelle waere es
    # stillschweigend abgelehnt worden und der Export haette weiter die selbst
    # gezeichnete Notnagel-Fassung benutzt.
    if (-not $minBytes) { $minBytes = 10240 }
    $p = Join-Path $Basis $name
    try { if (-not (Test-Path -LiteralPath $p)) { Warn "nicht vorhanden (optional): $name"; return '' } }
    catch { return '' }
    try {
        $bytes = [System.IO.File]::ReadAllBytes($p)
        if ($bytes.Length -lt $minBytes) { Warn ("$name ist nur " + [math]::Round($bytes.Length/1024) + " KB - vermutlich unvollstaendig."); return '' }
        Gut ("gefunden: $name  (" + [math]::Round($bytes.Length/1024) + " KB)")
        return [Convert]::ToBase64String($bytes)
    } catch { Fehler ("$name nicht lesbar: " + $_.Exception.Message); return '' }
}
Schritt "Dateien werden gelesen ..."
$Autopilot    = LiesDatei 'esl_autopilot.user.js' $true  15  'AUTOPILOT'
# Die beiden anderen ESL-Projekte. Seit 06.08. spaetabends faehrt jeder PC EIN
# Projekt ($ProjektWahl) - die Variante des gewaehlten Projekts ist dann
# PFLICHT, die uebrigen bleiben optional (der Waechter legt in einem fremden
# Tab weiterhin das passende Paket nach, falls doch mal eins auftaucht).
$AutopilotMob = LiesDatei 'esl_autopilot_mobile.user.js' ($ProjektWahl -eq 'mobile') 15 'AUTOPILOT'
$AutopilotUm  = LiesDatei 'esl_autopilot_um.user.js'     ($ProjektWahl -eq 'um')     15 'AUTOPILOT'
# Der Autopilot DIESES PCs: die Variante des gewaehlten Projekts.
$AutopilotAktiv = $Autopilot
if ($ProjektWahl -eq 'mobile') { $AutopilotAktiv = $AutopilotMob }
if ($ProjektWahl -eq 'um')     { $AutopilotAktiv = $AutopilotUm }
if (-not $AutopilotAktiv) {
    Fehler "Die Autopilot-Datei fuer '$ProjektName' fehlt oder ist unbrauchbar - Abbruch."
    Fehler "Sie entsteht mit:  node autopilot_varianten_erzeugen.js"
    exit 1
}
$Dashboard    = LiesDatei 'esl_live_arena_v22.js' $true  500 'live-arena'
$KpiCrawler   = LiesDatei 'kpi_crawler.js'        $false 20  'KPI-Crawler'
$GmCrawler    = LiesDatei 'genesys_monitor_crawler.js' $false 5 'Warteschleifen-Crawler'
$MappingB64   = LiesBinaerBase64 'Mitarbeiter_IDS_Final_komplett.xlsx' 10240
# Das ECHTE regiocom-Logo fuer den Excel-Kopf und die beiden Report-Bilder.
# Ohne diese Datei malt das Dashboard eine Annaeherung (rcLogoZeichnen) - die ist
# als Notnagel gedacht, nicht als Dauerzustand. 300 Byte Mindestgroesse: ein
# echtes PNG ist immer groesser, eine 0-KB-Huelle faellt damit auf.
$LogoB64      = LiesBinaerBase64 'regiocom.png' 300
if (-not $Autopilot -or -not $Dashboard) {
    Fehler "Abbruch: Pflichtdateien fehlen oder sind unbrauchbar."
    Warn   "Bitte ESL_Test.cmd ausfuehren - es sagt genau, welche Datei nicht stimmt."
    exit 1
}

# ---------- 2) Edge finden ----------
$EdgePfade = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)
$Edge = $EdgePfade | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Edge) { Fehler "Microsoft Edge nicht gefunden."; Read-Host "  [Enter]"; exit 1 }

# ---------- 3) Edge mit Fernsteuerung starten ----------
# Eigenes Profil: Edge erlaubt die Fernsteuerung im Standardprofil nicht.
# Das Profil liegt neben dieser Datei -> gespeicherte Passwoerter ueberleben Citrix.
# Profilname kommt aus Abschnitt 0b (je Projekt getrennt, Kabel ohne Zusatz).
$Profil = Join-Path $Basis $ProfilName
if (-not (Test-Path $Profil)) { New-Item -ItemType Directory -Path $Profil | Out-Null }

# ---------- 3a) Cache-Ordner auf der LOKALEN Platte ----------
# Siehe Begruendung an --disk-cache-dir weiter unten. Hier nur die Wahl des
# Ortes: %LOCALAPPDATA% liegt auf der lokalen Platte des Citrix-Rechners und
# unterliegt keinem Heimatlaufwerk-Kontingent.
# WARUM MIT PRUEFUNG: Faellt der Ordner weg (gesperrtes Profil, roamendes
# LOCALAPPDATA, volle lokale Platte), waere ein Edge-Start mit unbeschreibbarem
# --disk-cache-dir schlimmer als gar keine Umleitung. Laesst er sich nicht
# anlegen ODER nicht beschreiben, bleibt es beim Standard im Profil - dann ist
# der Speicherdruck zwar wieder da, aber der Start funktioniert.
# Je Projekt getrennt, damit drei gleichzeitig laufende Browser sich nicht
# denselben Cache teilen (Chromium sperrt ihn exklusiv).
$CacheDir = ''
try {
    $lokal = $env:LOCALAPPDATA
    if ($lokal -and (Test-Path $lokal)) {
        $kandidat = Join-Path $lokal ("regiocom_ESL_Cache\" + $ProfilName)
        if (-not (Test-Path $kandidat)) { New-Item -ItemType Directory -Path $kandidat -Force | Out-Null }
        # Wirklich beschreibbar? Test-Path allein beweist das nicht.
        $probe = Join-Path $kandidat '.schreibprobe'
        Set-Content -LiteralPath $probe -Value 'x' -Encoding ascii -ErrorAction Stop
        Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
        $CacheDir = $kandidat
    }
} catch { $CacheDir = '' }
if ($CacheDir) {
    Gut ("Browser-Cache liegt lokal: " + $CacheDir)
    Schritt "  (nicht im Profil auf dem Netzlaufwerk - das schont das Kontingent)"
} else {
    Warn "Lokaler Cache-Ordner nicht nutzbar - Edge cached wieder ins Profil."
    Warn "Auf einem quotierten Heimatlaufwerk kann das zu 'Speicherplatz freigeben' fuehren."
}

function FernsteuerungBereit($port) {
    try { $r = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/version" -TimeoutSec 2; return $null -ne $r } catch { return $false }
}

if (FernsteuerungBereit $DebugPort) {
    Gut "Edge mit Fernsteuerung laeuft bereits (Port $DebugPort)."
} else {
    Schritt "Edge wird gestartet ..."
    # ACHTUNG: $args ist in PowerShell eine automatische Variable -> eigener Name
    #
    # HINTERGRUND-ARGUMENTE (09.08., Nutzer-Vorgabe: "ich arbeite ganz normal
    # weiter in anderen Programmen, und das laeuft im Hintergrund minimiert -
    # dass der auch aktualisiert").
    # Ein minimiertes Fenster meldet visibilityState "hidden". Chromium drosselt
    # die Zeitgeber einer verborgenen Seite dann in zwei Stufen: sofort auf ein
    # 1-Sekunden-Raster, und nach einiger Zeit im Hintergrund auf EINEN Weckruf
    # je Minute. Aus dem 20-s-ESL-Takt (esl_live_arena_v22.js, rcLiveInterval)
    # wuerde damit ein 60-s-Takt, aus dem 3-s-Warteschleifen-Takt ebenfalls 60 s.
    # Verpasste Intervalle holt Chromium NICHT nach.
    #
    # WICHTIG, sonst geht die Haelfte verloren: --disable-features darf nur EIN
    # EINZIGES Mal vorkommen. Ein zweites Vorkommen ueberschreibt das erste
    # vollstaendig. Translate steht deshalb IN dieser Liste und nicht mehr in
    # einem eigenen Parameter.
    #
    # UNGEMESSEN: Dass diese Schalter auch den MINIMIERTEN Fall abdecken (und
    # nicht nur Hintergrund-Tabs und verdeckte Fenster), ist nicht belegt. Der
    # Nachweis laeuft ueber rcDrift() im Dashboard - siehe Abschnitt 3b.
    $edgeArgs = @(
        "--remote-debugging-port=$DebugPort",
        "--user-data-dir=`"$Profil`"",
        "--no-first-run", "--no-default-browser-check",
        # ---- CACHE VOM NETZLAUFWERK WEG (12.08.) ----------------------------
        # GEMESSEN auf dem Zielrechner: das Profil liegt unter
        #   \\srv643.r.regiocom.net\home1$\ve1802\My Documents\live\EdgeProfil
        # also auf dem quotierten Citrix-Heimatlaufwerk. Edge legt seinen Cache
        # standardmaessig IM Profil ab und zaehlt damit voll gegen das
        # Kontingent. Ist es erschoepft, meldet Edge "Speicherplatz freigeben,
        # um fortzufahren" und wirft Website-Daten weg - mitsamt dem
        # ESL-Sitzungs-Cookie und dem localStorage des Dashboards (Ziele,
        # Layout, Report-Empfaenger, Tages-Historie). Beim Nutzer am 12.08.
        # genau so passiert.
        # Der Cache ist reine Wegwerfware und wandert deshalb auf die lokale
        # Platte. Passwoerter, Cookies und localStorage bleiben ausdruecklich im
        # Profil auf dem Netzlaufwerk - nur DAS ueberlebt den Citrix-Reset, und
        # genau dafuer liegt das Profil ueberhaupt dort.
        # (das eigentliche --disk-cache-dir wird unten bedingt angehaengt:
        #  ein leerer Wert waere schlimmer als gar keine Umleitung)
        # Nimmt die Zeitgeber verborgener Seiten aus der Drosselung.
        "--disable-background-timer-throttling",
        # Haelt den Renderer-Prozess auf normaler Prioritaet. Auf dem geteilten
        # Citrix-Host, wo viele Prozesse um CPU konkurrieren, ist das spuerbar.
        "--disable-renderer-backgrounding",
        # Fenster offen, aber von Word/Teams vollstaendig ueberdeckt: gilt sonst
        # als unsichtbar. Deckt den Fall ab, dass der Nutzer NICHT minimiert.
        "--disable-backgrounding-occluded-windows",
        # Translate = unveraendert aus dem Bestand (Uebersetzungsleiste aus).
        # IntensiveWakeUpThrottling = die zweite Drosselstufe (1 Weckruf/Minute).
        # CalculateNativeWinOcclusion = Windows-Verdeckungsberechnung.
        "--disable-features=Translate,IntensiveWakeUpThrottling,CalculateNativeWinOcclusion"
    )
    # Cache-Umleitung nur, wenn der Ordner oben wirklich beschreibbar war.
    # Deckel dazu, damit der Cache auch lokal nicht unbegrenzt waechst (300 MB).
    if ($CacheDir) {
        $edgeArgs += "--disk-cache-dir=`"$CacheDir`""
        $edgeArgs += "--disk-cache-size=314572800"
    }
    # Die Adresse MUSS das letzte Argument bleiben.
    $edgeArgs += "`"$EslUrl`""
    Start-Process -FilePath $Edge -ArgumentList $edgeArgs | Out-Null
    $wartete = 0
    while (-not (FernsteuerungBereit $DebugPort) -and $wartete -lt 30) { Start-Sleep -Milliseconds 500; $wartete++ }
    if (-not (FernsteuerungBereit $DebugPort)) {
        Fehler "Edge-Fernsteuerung nicht erreichbar (Port $DebugPort)."
        Warn  "Moeglich: die IT sperrt den Debug-Port. Dann bitte den Lesezeichen-Weg nutzen (esl_start.html)."
        Read-Host "  [Enter]"; exit 1
    }
    Gut "Edge laeuft (Profil: $ProfilName, Port $DebugPort, Projekt $ProjektName)"
}

# ---------- 3b) Kamen die Hintergrund-Argumente am laufenden Edge an? ----------
# Der Zweig oben ("laeuft bereits") haengt sich an einen SCHON LAUFENDEN Edge an.
# Dann greift die Argumentliste aus Abschnitt 3 gar nicht - der Browser laeuft mit
# den Flags, mit denen er irgendwann einmal gestartet wurde. Ohne diese Pruefung
# meldet der Starter Gruen, waehrend die Zeitgeber im minimierten Fenster
# gedrosselt werden. Auf dem Citrix-Rechner ist genau das der haeufige Fall, weil
# der Browser dort oft schon offen ist.
$FlagsPflicht  = @(
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows"
)
$FlagsFeatures = @("IntensiveWakeUpThrottling", "CalculateNativeWinOcclusion")

$Kommandozeile = $null
try {
    $ProzesseEdge = Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction Stop
    foreach ($p in $ProzesseEdge) {
        if ($p.CommandLine -and $p.CommandLine -like "*--remote-debugging-port=$DebugPort*") {
            $Kommandozeile = $p.CommandLine
            break
        }
    }
} catch {
    $Kommandozeile = $null
}

if (-not $Kommandozeile) {
    # "Nicht pruefbar" darf NIEMALS als gruen durchgehen. Genau dieser Messfehler
    # hat im Projekt schon einmal zwei Tage gekostet (standort_varianten_pruefen).
    Warn "Hintergrund-Argumente NICHT PRUEFBAR - die Kommandozeile des Edge-Prozesses ist nicht lesbar."
    Warn "  Meist: WMI gesperrt, oder der Browser-Prozess gehoert einem anderen Konto."
    Warn "  Selbst nachsehen: im Browser edge://version oeffnen, Zeile 'Befehlszeile'."
    Warn "  Ob wirklich gedrosselt wird, sagt im Dashboard die Konsole: rcDrift()"
} else {
    $Fehlt = @()
    foreach ($f in $FlagsPflicht) {
        if ($Kommandozeile -notlike "*$f*") { $Fehlt += $f }
    }
    # --disable-features ist EIN Parameter mit Kommaliste. Geprueft wird sein
    # INHALT, nicht das blosse Vorkommen: steht der Parameter zweimal da, gilt nur
    # das letzte - der gesuchte Text stuende aber trotzdem irgendwo in der Zeile.
    # Deshalb wird das LETZTE Vorkommen ausgewertet, und mehr als eines ist selbst
    # schon ein Fehler.
    $DfWert = ""
    $Treffer = [regex]::Matches($Kommandozeile, '--disable-features=("?)([^"\s]+)')
    if ($Treffer.Count -gt 0) { $DfWert = $Treffer[$Treffer.Count - 1].Groups[2].Value }
    if ($Treffer.Count -gt 1) {
        $Fehlt += ("--disable-features steht " + $Treffer.Count + "x in der Zeile - nur das letzte gilt")
    }
    foreach ($f in $FlagsFeatures) {
        if ($DfWert -notlike "*$f*") { $Fehlt += ("--disable-features=...," + $f) }
    }
    if ($Fehlt.Count -eq 0) {
        Gut "Hintergrund-Argumente sind gesetzt - der Monitor darf minimiert weiterlaufen."
    } else {
        Warn "Hintergrund-Argumente FEHLEN an diesem Edge-Prozess:"
        foreach ($f in $Fehlt) { Warn "    $f" }
        Warn "  Folge: bei minimiertem Fenster drosselt der Browser die Zeitgeber,"
        Warn "  der 20-Sekunden-Takt wird zu einem Minutentakt oder steht ganz."
        Warn "  Abhilfe: NUR den Edge dieses Profils schliessen ($ProfilName) und diesen"
        Warn "  Starter erneut ausfuehren - dann greift die Argumentliste."
    }
}

# ---------- 3c) Liegt der Cache wirklich ausserhalb des Profils? ----------
# Getrennt von 3b, weil es eine andere Frage ist: 3b fragt nach Drosselung,
# hier geht es um das Kontingent des Heimatlaufwerks. Gemeinsam ist beiden die
# Falle - haengt sich der Starter an einen SCHON LAUFENDEN Edge, greift keine
# der beiden Argumentlisten, und ohne Pruefung meldet niemand etwas.
# Auch hier gilt: "nicht pruefbar" ist NICHT gruen.
if (-not $Kommandozeile) {
    Warn "Cache-Ort NICHT PRUEFBAR (Kommandozeile nicht lesbar) - siehe Hinweis oben."
} elseif ($Kommandozeile -like "*--disk-cache-dir=*") {
    Gut "Browser-Cache liegt ausserhalb des Profils - das Heimatlaufwerk-Kontingent bleibt frei."
} else {
    Warn "Dieser Edge cached INS PROFIL auf dem Netzlaufwerk."
    Warn "  Folge: das Kontingent laeuft mit der Zeit voll, Edge meldet dann"
    Warn "  'Speicherplatz freigeben' und wirft Website-Daten weg - mitsamt der"
    Warn "  ESL-Anmeldung und den Dashboard-Einstellungen (Ziele, Layout, Historie)."
    Warn "  Abhilfe: NUR den Edge dieses Profils schliessen ($ProfilName) und diesen"
    Warn "  Starter erneut ausfuehren."
}

# ---------- 4) WebSocket-Hilfen fuer das DevTools-Protokoll ----------
# KEIN Add-Type! In Windows PowerShell 5.1 gibt es die Assembly
# "System.Net.WebSockets.Client" nicht - die Klasse steckt direkt in System.dll.
# Der Aufruf schlug live fehl ("Mindestens eine erforderliche Assembly fehlt")
# und brach wegen $ErrorActionPreference='Stop' den ganzen Start ab.
# Der Selbsttest belegt: New-Object ...ClientWebSocket klappt OHNE Add-Type.

function Verbinde($wsUrl) {
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ws.ConnectAsync([Uri]$wsUrl, [Threading.CancellationToken]::None).Wait(5000) | Out-Null
    if ($ws.State -ne 'Open') { throw "WebSocket nicht verbunden: $wsUrl" }
    return $ws
}
function Sende($ws, $id, $methode, $parameter) {
    $obj = @{ id = $id; method = $methode; params = $parameter }
    $json = $obj | ConvertTo-Json -Depth 12 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $seg = New-Object 'System.ArraySegment[byte]' -ArgumentList @(,$bytes)
    $ws.SendAsync($seg, [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait(5000) | Out-Null
}
function Empfange($ws, $timeoutMs) {
    $puffer = New-Object byte[] 65536
    $seg = New-Object 'System.ArraySegment[byte]' -ArgumentList @(,$puffer)
    $sb = New-Object Text.StringBuilder
    $t = $ws.ReceiveAsync($seg, [Threading.CancellationToken]::None)
    if (-not $t.Wait($timeoutMs)) { return $null }
    [void]$sb.Append([Text.Encoding]::UTF8.GetString($puffer, 0, $t.Result.Count))
    while (-not $t.Result.EndOfMessage) {
        $t = $ws.ReceiveAsync($seg, [Threading.CancellationToken]::None)
        if (-not $t.Wait($timeoutMs)) { break }
        [void]$sb.Append([Text.Encoding]::UTF8.GetString($puffer, 0, $t.Result.Count))
    }
    return $sb.ToString()
}

# ---------- 4b) ANKER-VERBINDUNGEN (16.08.) ----------------------------------
#  DER Grund, warum die Automatik jahrelang "haengt": ein per
#  Page.addScriptToEvaluateOnNewDocument registriertes Skript ist an die
#  CDP-SITZUNG gebunden. Sobald die Verbindung geschlossen wird, ist die
#  Registrierung weg. RuesteTabAus hat genau das getan ($ws.Dispose()) -
#  der Autopilot lief danach NUR auf der einen Seite, in die er zusaetzlich
#  per Runtime.evaluate gespritzt wurde. Jede Navigation (Anmeldung ->
#  main.xhtml -> sis_vodafone.xhtml -> Export-Ansicht) hat ihn verloren, und
#  er kam erst wieder, wenn der 20-s-Waechter ihn neu einspielte. Ein
#  Waechter-Durchlauf kostet mit allen Zeitlimits ein bis drei Minuten -
#  daraus wurden die beobachteten 5 bis 10 Minuten bis zum Dashboard.
#
#  GEMESSEN (nicht angenommen), mit echtem Edge und CDP:
#    Verbindung offen, navigiert  -> Skript lief          (Zaehler 1)
#    Verbindung zu, dann navigiert-> Skript lief NICHT    (Zaehler 0)
#    Page.disable                 -> Skript lief NICHT    (Zaehler 0)
#    Page.enable                  -> ~6 Ereignisse je Navigation
#
#  Daraus folgt die Bauart: je Tab EINE Verbindung, die OFFEN bleibt und
#  Page aktiv laesst. Weil damit Ereignisse hereinlaufen, muss sie in jedem
#  Durchlauf leergesaugt werden - ungelesen fuellt sich der Empfangspuffer.
#
#  FALLE, die das Leersaugen bewacht: Empfange() startet ein ReceiveAsync und
#  VERWIRFT es beim Zeitlimit. Auf einer kurzlebigen Verbindung ist das egal,
#  auf einer dauerhaften nicht: der naechste ReceiveAsync wirft dann
#  "already one outstanding receive". Die laufende Aufgabe wird deshalb
#  gemerkt und beim naechsten Mal weiterverwendet.
# -----------------------------------------------------------------------------
$AnkerWs     = @{}    # Tab-Id -> ClientWebSocket (bleibt offen)
$AnkerLesen  = @{}    # Tab-Id -> laufende ReceiveAsync-Aufgabe
$AnkerPuffer = @{}    # Tab-Id -> Empfangspuffer (muss die Aufgabe ueberleben)

function AnkerLoesen($id) {
    if ($AnkerWs.ContainsKey($id)) {
        try { $AnkerWs[$id].Dispose() } catch { }
        $AnkerWs.Remove($id)
    }
    $AnkerLesen.Remove($id)
    $AnkerPuffer.Remove($id)
}
        # DIALOG-WAECHTER (17.08.) - Nutzer-Befund: "wenn ein Fenster offen
        # bleibt, dann tut er nicht mehr updaten."
        #
        # Ein offener alert/confirm haelt den GESAMTEN JavaScript-Ablauf der
        # Seite an: Live-Takt, Watchdog, Uhr, alles. Und er blockiert obendrein
        # jedes Runtime.evaluate - der Starter kaeme also selbst nicht mehr an
        # das Dashboard heran, um zu helfen. Das Dashboard hat 33 solche
        # Stellen (Konfigurator-Rueckfragen, Import-Meldungen); eine davon
        # versehentlich geoeffnet und stehengelassen legt den Wandmonitor still.
        #
        # Behandelt wird mit accept=false: bei confirm heisst das "Abbrechen"
        # (keine ungewollte Aktion ausloesen), bei alert schliesst es einfach,
        # und bei einem beforeunload-Dialog bedeutet es "auf der Seite bleiben".
        # Zustimmen waere hier gefaehrlich - es koennte eine Seite verwerfen.
$DialogeGeschlossen = 0
function AnkerDialogPruefen($id, $text) {
    if ("$text" -notlike '*javascriptDialogOpening*') { return }
    $art = ''; $frage = ''
    try {
        $o = $text | ConvertFrom-Json
        if ($o.method -ne 'Page.javascriptDialogOpening') { return }
        $art = "$($o.params.type)"; $frage = "$($o.params.message)"
    } catch { return }
    $ws = $AnkerWs[$id]
    if (-not $ws -or $ws.State -ne 'Open') { return }
    try {
        # Eigene Kommando-Nummer, damit die Antwort nicht mit einer laufenden
        # Abfrage verwechselt wird.
        Sende $ws 68 'Page.handleJavaScriptDialog' @{ accept = $false }
        $script:DialogeGeschlossen++
        $kurz = $frage; if ($kurz.Length -gt 90) { $kurz = $kurz.Substring(0, 90) + '...' }
        Warn "  Dialog automatisch geschlossen ($art): $kurz"
        Warn "  Ohne das haette die Seite ab hier gestanden - das Dashboard laeuft weiter."
    } catch { }
}
function AnkerSaugen($id) {
    $ws = $AnkerWs[$id]
    if (-not $ws -or $ws.State -ne 'Open') { return }
    if (-not $AnkerPuffer.ContainsKey($id)) { $AnkerPuffer[$id] = New-Object byte[] 65536 }
    $seg = New-Object 'System.ArraySegment[byte]' -ArgumentList @(,$AnkerPuffer[$id])
    # Deckel: eine wildgewordene Ereignisquelle darf den Waechter nicht anhalten.
    for ($i = 0; $i -lt 300; $i++) {
        $t = $AnkerLesen[$id]
        if (-not $t) {
            try { $t = $ws.ReceiveAsync($seg, [Threading.CancellationToken]::None) } catch { AnkerLoesen $id; return }
            $AnkerLesen[$id] = $t
        }
        if (-not $t.Wait(1)) { return }        # nichts da - Aufgabe bleibt gemerkt
        $AnkerLesen[$id] = $null
        if ($t.IsFaulted -or $ws.State -ne 'Open') { AnkerLoesen $id; return }
        # Die Ereignisse wurden bisher ungelesen verworfen - der Strom wurde nur
        # geleert. Genau hier steht aber die Dialog-Meldung drin.
        try {
            $roh = [Text.Encoding]::UTF8.GetString($AnkerPuffer[$id], 0, $t.Result.Count)
            AnkerDialogPruefen $id $roh
        } catch { }
    }
}
# Antwort auf ein Kommando der Ankerverbindung lesen. Ereignisse (ohne "id")
# werden dabei uebersprungen - sie kommen im selben Strom.
function AnkerAntwort($id, $erwarteteId, $timeoutMs) {
    $ws = $AnkerWs[$id]
    if (-not $ws) { return $null }
    if (-not $AnkerPuffer.ContainsKey($id)) { $AnkerPuffer[$id] = New-Object byte[] 65536 }
    $seg = New-Object 'System.ArraySegment[byte]' -ArgumentList @(,$AnkerPuffer[$id])
    $bis = (Get-Date).AddMilliseconds($timeoutMs)
    while ((Get-Date) -lt $bis) {
        $t = $AnkerLesen[$id]
        if (-not $t) {
            try { $t = $ws.ReceiveAsync($seg, [Threading.CancellationToken]::None) } catch { return $null }
            $AnkerLesen[$id] = $t
        }
        if (-not $t.Wait(250)) { continue }
        $AnkerLesen[$id] = $null
        if ($t.IsFaulted) { return $null }
        $text = [Text.Encoding]::UTF8.GetString($AnkerPuffer[$id], 0, $t.Result.Count)
        # Grosse Antworten kommen in mehreren Stuecken - Rest nachlesen.
        while (-not $t.Result.EndOfMessage) {
            try { $t = $ws.ReceiveAsync($seg, [Threading.CancellationToken]::None) } catch { return $null }
            if (-not $t.Wait($timeoutMs)) { $AnkerLesen[$id] = $t; return $null }
            $text += [Text.Encoding]::UTF8.GetString($AnkerPuffer[$id], 0, $t.Result.Count)
        }
        if ($text -match '"id"\s*:\s*' + $erwarteteId + '\b') { return $text }
        # Uebersprungene Ereignisse trotzdem auf einen Dialog pruefen (17.08.):
        # Ein offener alert/confirm blockiert JEDES Runtime.evaluate. Wuerde die
        # Meldung hier nur verworfen, liefe genau dieser Aufruf in sein Zeitlimit
        # UND der Dialog bliebe stehen - der Starter kaeme nie wieder an die
        # Seite heran. Er muss also gerade dann geschlossen werden, wenn wir auf
        # eine Antwort warten, die wegen ihm nicht kommen kann.
        try { AnkerDialogPruefen $id $text } catch { }
    }
    return $null
}
# Verankert den Autopiloten dauerhaft in einem Tab. Rueckgabe $true nur, wenn
# in DIESEM Durchlauf neu verankert wurde (fuer die Meldung im Fenster).
function AnkerSetzen($ziel, $navigiereZu) {
    if (-not $ziel -or -not $ziel.webSocketDebuggerUrl) { return $false }
    $id = "$($ziel.id)"
    if ($AnkerWs.ContainsKey($id)) {
        if ($AnkerWs[$id].State -eq 'Open') { AnkerSaugen $id; return $false }
        AnkerLoesen $id
    }
    try {
        $AnkerWs[$id] = Verbinde $ziel.webSocketDebuggerUrl
    } catch { $AnkerWs.Remove($id); return $false }
    try {
        # Marke und Adresse ueber DIESELBE Verbindung holen - das richtige Paket
        # fuer diesen Tab, nicht blind das Kabel-Paket (wie StelleAutopilotSicher).
        $abfrage = '(function(){var m="";try{m=sessionStorage.getItem("rcEslProjekt")||"";}catch(e){}return m+"|"+location.href;})()'
        Sende $AnkerWs[$id] 60 'Runtime.evaluate' @{ expression = $abfrage; returnByValue = $true }
        $a = AnkerAntwort $id 60 5000
        $marke = ''; $href = "$($ziel.url)"
        if ($a) {
            try {
                $wert = "$(($a | ConvertFrom-Json).result.result.value)"
                $teile = $wert.Split('|')
                if ($teile.Count -ge 1) { $marke = $teile[0] }
                if ($teile.Count -ge 2) { $href = ($teile[1..($teile.Count - 1)] -join '|') }
            } catch { }
        }
        $p = PaketFuer $marke $href
        if (-not $p) { AnkerLoesen $id; return $false }
        Sende $AnkerWs[$id] 61 'Page.enable' @{}
        if (-not (AnkerAntwort $id 61 5000)) { AnkerLoesen $id; return $false }
        # DOWNLOADS OHNE RUECKFRAGE (17.08.) - Nutzer-Befund "wenn ein Download
        # gibt, dann tut er nicht mehr updaten". Das Dashboard legt je Stunde
        # VIER Dateien ab (HTML, Excel, zwei PNG). Fragt Edge dabei nach dem
        # Speicherort oder meldet einen blockierten Download, staut sich das
        # ueber einen Wochenlauf zu hunderten Fenstern auf. Mit "allow" wandert
        # alles stumm in den Download-Ordner - dort sucht auch das Mailskript.
        # Kein Abbruch, wenn es nicht geht: aeltere Edge-Fassungen kennen den
        # Befehl nicht, und das ist kein Grund, den Anker fallenzulassen.
        try {
            $dl = Join-Path $env:USERPROFILE 'Downloads'
            Sende $AnkerWs[$id] 63 'Browser.setDownloadBehavior' @{ behavior = 'allow'; downloadPath = $dl }
            [void](AnkerAntwort $id 63 4000)
        } catch { }
        Sende $AnkerWs[$id] 62 'Page.addScriptToEvaluateOnNewDocument' @{ source = $p }
        if (-not (AnkerAntwort $id 62 10000)) { AnkerLoesen $id; return $false }
        # Und einmal fuer die Seite, die JETZT offen ist - der Eintrag oben gilt
        # erst ab dem naechsten Dokument.
        Sende $AnkerWs[$id] 63 'Runtime.evaluate' @{ expression = $p; awaitPromise = $false }
        [void](AnkerAntwort $id 63 15000)
        # Navigieren erst JETZT, ueber dieselbe (offene) Verbindung. Reihenfolge
        # ist wichtig: der Eintrag muss stehen, BEVOR das neue Dokument kommt -
        # sonst faellt genau die erste Seite durch, auf die es ankommt.
        if ($navigiereZu) {
            Sende $AnkerWs[$id] 64 'Page.navigate' @{ url = $navigiereZu }
            [void](AnkerAntwort $id 64 10000)
        }
        return $true
    } catch { AnkerLoesen $id; return $false }
}

# ---------- 5) Das Auto-Injektions-Paket bauen ----------
# Wichtig: Page.addScriptToEvaluateOnNewDocument sorgt dafuer, dass dieses
# Script bei JEDEM Seitenaufbau automatisch laeuft - genau wie eine Erweiterung.
# Der Dashboard-/Crawler-Code reist als window.__rcFiles direkt mit.
function AlsJsText($s) { return ($s | ConvertTo-Json -Compress) }   # sicher escapen

# Der Kopf ist fuer alle drei Projekte gleich und wird deshalb nur EINMAL
# gebaut: AlsJsText laeuft ueber den 1,4-MB-Dashboardcode, das dreimal zu tun
# waere reine Wartezeit beim Start.
$PaketKopf = @"
window.__rcFiles = {
  dash:  $(AlsJsText $Dashboard),
  kpi:   $(AlsJsText $KpiCrawler),
  gm:    $(AlsJsText $GmCrawler),
  mapping: $(AlsJsText $MappingB64),
  logo:  $(AlsJsText $LogoB64)
};
window.__rcMail = $(AlsJsText $AnmeldeMail);
try { if (window.__rcMail) localStorage.setItem('rcAutoMail', window.__rcMail); } catch(e) {}
"@

# PROJEKT-MARKE: welches der drei ESL-Projekte dieser Tab bedient.
# Sie liegt in sessionStorage, weil das die einzige Ablage ist, die alle drei
# Anforderungen erfuellt: sie gilt PRO TAB (localStorage teilen sich alle Tabs
# derselben Adresse), sie ueberlebt eine Navigation (window.__rcProjekt waere bei
# jedem Seitenwechsel weg) und sie ist von der Fernsteuerung lesbar. window.name
# scheidet aus - das Dashboard belegt ihn selbst mit 'rcDashboard' (v22.js).
#
# Gebraucht wird sie fuer genau EINEN Fall, der sonst still schiefgeht: faellt die
# ESL-Sitzung aus, zeigt AUCH ein Mobile-Tab die Anmeldemaske unter
# login_esl.xhtml. An der Adresse ist das Projekt dann nicht mehr zu erkennen,
# der Waechter wuerde das Kabel-Paket einspielen, und der Tab liefe nach der
# Neuanmeldung auf Kabel weiter - zwei Kabel-Tabs, kein Mobile, keine Meldung.
function BauPaket($autopilotCode, $marke) {
    return $PaketKopf + "`ntry { sessionStorage.setItem('rcEslProjekt','$marke'); } catch(e) {}`n" + $autopilotCode
}
# Das Grundpaket ist seit 06.08. spaetabends das des GEWAEHLTEN Projekts —
# nicht mehr fest Kabel. Die Marke im Paket ist damit auf jedem PC die richtige,
# und der Autopilot haelt genau dieses Projekt fest (sollProjekt liest die Marke).
$Paket       = BauPaket $AutopilotAktiv $ProjektWahl
$PaketMobile = ''
$PaketUm     = ''
if ($AutopilotMob) { $PaketMobile = BauPaket $AutopilotMob 'mobile' }
if ($AutopilotUm)  { $PaketUm     = BauPaket $AutopilotUm  'um' }
Gut "Projekt dieses PCs: $ProjektName (festgenagelt - der Autopilot wechselt dorthin zurueck)"

# Welches Paket gehoert in diesen Tab? Die Marke schlaegt die Adresse (sie ist
# auch dann noch da, wenn die Adresse gerade die Anmeldemaske zeigt).
function PaketFuer($marke, $url) {
    $m = "$marke".ToLower()
    $u = "$url".ToLower()
    if ($m -eq 'mobile' -or $u -like '*sis_vodafone_mobile*') {
        if ($PaketMobile) { return $PaketMobile }
        Warn "  Mobile-Tab, aber esl_autopilot_mobile.user.js fehlt - es wird NICHTS eingespielt."
        return $null
    }
    if ($m -eq 'um' -or $u -like '*sis_vodafone_um*') {
        if ($PaketUm) { return $PaketUm }
        Warn "  UM-Tab, aber esl_autopilot_um.user.js fehlt - es wird NICHTS eingespielt."
        return $null
    }
    return $Paket
}

Gut ("Injektions-Paket: " + [math]::Round($Paket.Length / 1024) + " KB")
if ($PaketMobile -or $PaketUm) {
    $auch = @(); if ($PaketMobile) { $auch += 'Mobile' }; if ($PaketUm) { $auch += 'UM' }
    Gut ("Weitere Projekte versorgt: " + ($auch -join ' + ') + "  (Start ueber ESL_Start_Mobile.cmd bzw. ESL_Start_UM.cmd)")
}
if (-not $MappingB64) {
    Warn "Mitarbeiter_IDS_Final_komplett.xlsx liegt nicht im Ordner -"
    Warn "das Mapping muss dann im Dashboard einmal von Hand gewaehlt werden."
}
if (-not $LogoB64) {
    Warn "regiocom.png liegt nicht im Ordner - Excel und Report-Bilder benutzen"
    Warn "dann die selbst gezeichnete Notnagel-Fassung des Logos."
}

# ---------- 6) In alle Tabs einklinken ----------
function HoleZiele() {
    try { return Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json" -TimeoutSec 5 } catch { return @() }
}
# ACHTUNG: diese Fassung SCHLIESST die Verbindung und verliert damit den
# addScriptToEvaluateOnNewDocument-Eintrag (Abschnitt 4b, am echten Edge
# gemessen). Sie wird deshalb NICHT mehr fuer den ESL-Tab benutzt - dort
# verankert AnkerSetzen dauerhaft. Sie bleibt als Notnagel stehen, falls die
# Ankerverbindung gar nicht zustande kommt.
function RuesteTabAus($ziel, $navigiereZu) {
    if (-not $ziel.webSocketDebuggerUrl) { return $false }
    try {
        $ws = Verbinde $ziel.webSocketDebuggerUrl
        Sende $ws 1 'Page.enable' @{}
        [void](Empfange $ws 3000)
        # Auf JEDER kuenftigen Seite automatisch ausfuehren (wie eine Erweiterung)
        Sende $ws 2 'Page.addScriptToEvaluateOnNewDocument' @{ source = $Paket }
        [void](Empfange $ws 5000)
        # Und einmal sofort fuer die bereits offene Seite
        Sende $ws 3 'Runtime.evaluate' @{ expression = $Paket; awaitPromise = $false }
        [void](Empfange $ws 5000)
        if ($navigiereZu) {
            Sende $ws 4 'Page.navigate' @{ url = $navigiereZu }
            [void](Empfange $ws 5000)
        }
        $ws.Dispose()
        return $true
    } catch { Warn ("Tab konnte nicht vorbereitet werden: " + $_.Exception.Message); return $false }
}

Schritt "Autopilot wird in Edge eingeklinkt ..."
$ziele = @(HoleZiele) | Where-Object { $_.type -eq 'page' }
if (-not $ziele -or $ziele.Count -eq 0) { Warn "Kein offener Tab gefunden - Edge oeffnet ggf. noch." ; Start-Sleep 2; $ziele = @(HoleZiele) | Where-Object { $_.type -eq 'page' } }

$esl = $ziele | Where-Object { $_.url -like '*regiocom*' } | Select-Object -First 1
if (-not $esl) { $esl = $ziele | Select-Object -First 1 }
if ($esl) {
    # DAUERHAFT verankern statt nur einmal einklinken (16.08.). Der Anker
    # registriert ZUERST und navigiert DANACH ueber dieselbe offene Verbindung -
    # so traegt schon die Anmeldeseite den Autopiloten, und jede Seite danach
    # auch. Genau hier lag die Luecke: der Waechter setzt seine Anker erst nach
    # dem Startablauf, die Anmeldung passiert aber davor.
    if (AnkerSetzen $esl $EslUrl) {
        Gut "ESL-Tab bereit und dauerhaft verankert - Anmeldung und Dashboard laufen automatisch."
    } elseif (RuesteTabAus $esl $EslUrl) {
        Warn "ESL-Tab nur einmalig eingeklinkt (Ankerverbindung kam nicht zustande)."
        Warn "  Der Autopilot geht dann bei jeder Navigation verloren, bis der Waechter ihn nachlegt."
    }
} else { Warn "Kein ESL-Tab gefunden." }

# ---------- 7) Die Ligaliste kommt SPAETER - und zwar aus dem Dashboard ----------
# REIHENFOLGE IST WICHTIG: Der KPI-Crawler auf der Ligaliste funkt seine Daten
# an ein LAUFENDES Dashboard. Waere die Ligaliste zuerst da, ginge die erste
# Sendung ins Leere. Deshalb passiert hier noch nichts - Schritt 9 uebernimmt.
#
# UND NOCH WICHTIGER (das war der eigentliche Konstruktionsfehler): Der zweite
# Tab darf NICHT per DevTools angelegt werden. Ein so erzeugter Tab hat
# window.opener === null, und genau ueber diesen opener funkt der KPI-Crawler
# zurueck (kpi_crawler.js). Der zweite Weg, der BroadcastChannel, hilft dort
# nicht: Dashboard (esl.regiocom.net) und Ligaliste (ccs.vodafone.de) sind
# verschiedene Origins, und ein BroadcastChannel wirkt nur INNERHALB eines
# Origins. Der dritte Weg, window.rcDashWin, wird nirgends gesetzt.
# Ergebnis waere: die Ligaliste laedt sichtbar, der Crawler laeuft - und KEINE
# einzige Kennzahl erreicht das Dashboard (Ansprache-Quote und CR bleiben leer,
# ohne jede Fehlermeldung). Deshalb oeffnet in Schritt 9 das DASHBOARD selbst
# die Ligaliste per window.open - nur so ist der opener gesetzt.

# ESL-Tab wieder nach vorne holen, damit die Anmeldung sichtbar ablaeuft
if ($esl -and $esl.webSocketDebuggerUrl) {
    try {
        $wf = Verbinde $esl.webSocketDebuggerUrl
        Sende $wf 80 'Page.bringToFront' @{}
        [void](Empfange $wf 3000)
        $wf.Dispose()
    } catch { }
}

# ---------- 8) ESL-Anmeldung abschicken ----------
# WARUM DAS UEBERHAUPT NOETIG IST:
#   Chromium/Edge fuellt gespeicherte Zugangsdaten sichtbar aus, gibt die Werte
#   an JavaScript aber ERST nach einer echten Nutzer-Geste frei
#   (Chromium-Bauteil "PasswordValueGatekeeper"). Der Login-Knopf des Portals
#   ruft PrimeFaces.vb() auf, und das liest die Felder per JavaScript. Ohne
#   Geste sieht die Pruefung LEERE Felder -> "Passwort erforderlich !".
#   Ein .click() oder form.submit() aus dem Script zaehlt NICHT als Geste.
#   Ueber die Fernsteuerung koennen wir eine echte Geste senden.
#
# NACHGEMESSEN (echtes Chromium, echtes gespeichertes Passwort, echtes
# ESL-Formular aus ESL_DOM_Referenz_2026-07-27.txt):
#   - Vor einer Geste sind BEIDE Felder fuer JavaScript leer (Laenge 0).
#   - EIN echter Mausklick - egal wo auf der Seite - gibt BEIDE Werte frei.
#   - Danach laeuft PrimeFaces.vb() sauber durch und die Anmeldung geht raus.
#
# DER FEHLER DER VORVERSION (und der Grund, warum es live haengen blieb):
#   Sie hat nach der Geste BLIND Enter geschickt, ohne zu pruefen, ob die Werte
#   wirklich freigegeben sind. War das Passwort in DIESEM Edge-Profil gar nicht
#   gespeichert (haeufigster Fall - das Profil neben dieser Datei ist ein
#   eigenes, leeres Profil!), dann schickte dieses Enter ein LEERES Passwort ab.
#   Das Portal antwortete mit "Passwort erforderlich !" und rief den Fehler-
#   zustand hervor, der in ESL_DOM_Referenz_2026-07-27.txt eingefangen ist:
#   aria-invalid="true" NUR beim Passwortfeld, Benutzername sauber validiert.
#   Genau dieses Muster ist der Beweis - waeren beide Felder nur gesperrt
#   gewesen, haette das Portal AUCH "Benutzername erforderlich !" gemeldet.
#
# ABLAUF JETZT (nie blind abschicken):
#   1. Fehlerzustand im Formular? -> Seite neu laden (stellt das Autofill wieder her)
#   2. Neutrale Stelle anklicken (kein Eingabefeld -> keine Vorschlagsliste)
#   3. WARTEN, bis Benutzername UND Passwort per JavaScript lesbar sind
#   4. Immer noch kein Passwort? -> Edges eigene Vorschlagsliste holen
#      (in das Feld klicken, Pfeil runter, ggf. Enter zum Uebernehmen)
#   5. NUR wenn beide Felder lesbar sind: Login-Knopf echt anklicken
#   6. Sonst: NICHT abschicken, sondern klar sagen, was fehlt

function SendeEnter($ws, $startId) {
    $i = $startId
    Sende $ws $i 'Input.dispatchKeyEvent' @{ type='rawKeyDown'; windowsVirtualKeyCode=13; nativeVirtualKeyCode=13; key='Enter'; code='Enter'; text="`r" }
    [void](Empfange $ws 3000); $i++
    Sende $ws $i 'Input.dispatchKeyEvent' @{ type='char'; key='Enter'; text="`r"; unmodifiedText="`r" }
    [void](Empfange $ws 3000); $i++
    Sende $ws $i 'Input.dispatchKeyEvent' @{ type='keyUp'; windowsVirtualKeyCode=13; nativeVirtualKeyCode=13; key='Enter'; code='Enter' }
    [void](Empfange $ws 3000)
    return $i + 1
}
# Einzelne Taste (roh) - hier fuer "Pfeil runter", um Edges eigene
# Passwort-Vorschlagsliste zu oeffnen bzw. den ersten Eintrag zu markieren.
function SendeTaste($ws, $startId, $vk, $key) {
    $i = $startId
    Sende $ws $i 'Input.dispatchKeyEvent' @{ type='rawKeyDown'; windowsVirtualKeyCode=$vk; nativeVirtualKeyCode=$vk; key=$key; code=$key }
    [void](Empfange $ws 3000); $i++
    Sende $ws $i 'Input.dispatchKeyEvent' @{ type='keyUp'; windowsVirtualKeyCode=$vk; nativeVirtualKeyCode=$vk; key=$key; code=$key }
    [void](Empfange $ws 3000)
    return $i + 1
}
# ECHTER Mausklick (das ist die Nutzer-Geste, die Edge sehen will).
function KlickAuf($ws, $startId, $x, $y) {
    $i = $startId
    Sende $ws $i 'Input.dispatchMouseEvent' @{ type='mousePressed';  x=$x; y=$y; button='left'; buttons=1; clickCount=1 }
    [void](Empfange $ws 3000); $i++
    Sende $ws $i 'Input.dispatchMouseEvent' @{ type='mouseReleased'; x=$x; y=$y; button='left'; buttons=0; clickCount=1 }
    [void](Empfange $ws 3000)
    return $i + 1
}
# Der KOMPLETTE Zustand der Anmeldeseite in EINER Abfrage. Absichtlich alles auf
# einmal: so kann sich der Zustand zwischen zwei Teilabfragen nicht aendern und
# wir koennen "Seite laedt noch" sauber von "Feld ist weg" unterscheiden.
#   ready   - Seite ist fertig geladen (readyState complete)
#   loginDa - das Passwortfeld existiert ueberhaupt
#   kaputt  - PrimeFaces zeigt eine Fehlermeldung ("Passwort erforderlich !")
#   pw/user/btn - Mittelpunkt + JS-Lesbarkeit (vlen) der Felder bzw. des Knopfes
function SeitenZustand($ws, $reqId) {
    $js = '(function(){' +
          'function box(el){if(!el)return null;var r=el.getBoundingClientRect();' +
          'if(r.width<2||r.height<2)return null;' +
          'return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),vlen:(el.value||"").length};}' +
          "var e=document.getElementById('loginform:pw');" +
          "var u=document.getElementById('loginform:user');" +
          "var b=document.getElementById('loginform:btnLogin');" +
          "var m=document.getElementById('loginform:msgs');" +
          'return JSON.stringify({' +
          "ready:document.readyState==='complete'," +
          'url:location.href,' +
          'loginDa:!!e,' +
          'pw:box(e),user:box(u),btn:box(b),' +
          "kaputt:!!(m&&/ui-messages-error/.test(m.innerHTML))" +
          '});})()'
    Sende $ws $reqId 'Runtime.evaluate' @{ expression = $js; returnByValue = $true }
    $antw = Empfange $ws 5000
    if (-not $antw) { return $null }
    try {
        $roh = ($antw | ConvertFrom-Json).result.result.value
        if (-not $roh) { return $null }
        return ($roh | ConvertFrom-Json)
    } catch { return $null }
}
# Eine Stelle suchen, an der man gefahrlos klicken kann: KEIN Eingabefeld,
# kein Knopf, kein Link - dann oeffnet der Klick auch keine Vorschlagsliste.
# (Nachgemessen: ein Klick auf eine solche Stelle gibt beide Werte frei.)
function NeutralePosition($ws, $reqId) {
    $js = '(function(){for(var y=4;y<400;y+=8){for(var x=4;x<600;x+=12){' +
          'var el=document.elementFromPoint(x,y);if(!el)continue;var t=el.tagName;' +
          "if(t==='INPUT'||t==='BUTTON'||t==='A'||t==='SELECT'||t==='TEXTAREA'||t==='LABEL')continue;" +
          "if(el.closest&&el.closest('input,button,a,select,textarea,label'))continue;" +
          'return JSON.stringify({x:x,y:y});}}return JSON.stringify({x:5,y:5});})()'
    Sende $ws $reqId 'Runtime.evaluate' @{ expression = $js; returnByValue = $true }
    $antw = Empfange $ws 5000
    if (-not $antw) { return @{ x = 5; y = 5 } }
    try { return (($antw | ConvertFrom-Json).result.result.value | ConvertFrom-Json) } catch { return @{ x = 5; y = 5 } }
}
# Warten, bis Benutzername UND Passwort fuer JavaScript lesbar sind.
# Gibt @{ user=<laenge>; pw=<laenge>; id=<naechste RequestId>; z=<letzter Zustand> } zurueck.
function WarteAufFreigabe($ws, $startId, $maxMs) {
    $i = $startId
    $frist = (Get-Date).AddMilliseconds($maxMs)
    $u = 0; $p = 0; $letzter = $null
    while ((Get-Date) -lt $frist) {
        Start-Sleep -Milliseconds 250
        $z = SeitenZustand $ws $i; $i++
        if (-not $z) { continue }
        $letzter = $z
        if (-not $z.loginDa) { break }          # Formular weg = vermutlich schon angemeldet
        if ($z.user) { $u = [int]$z.user.vlen }
        if ($z.pw)   { $p = [int]$z.pw.vlen }
        if ($u -gt 0 -and $p -gt 0) { break }
    }
    return @{ user = $u; pw = $p; id = $i; z = $letzter }
}

function EslAnmeldungAbschicken() {
    # FRIST 45 s statt 90 s (21.08.). Der Startblock ist der einzige Teil des
    # Starters, der BLOCKIERT - solange er laeuft, gibt es keinen Waechter,
    # keine Ligaliste und keine Neu-Tab-Wache. Und er bringt nichts, was der
    # Waechter nicht auch koennte: der ruft ab Beginn der Dauerschleife alle
    # $DauerTaktSek Sekunden EinAnmeldeVersuch mit genau derselben
    # CDP-Geste. Im Live-Log vom 21.08. lief die Anmeldung denn auch ueber den
    # Waechter ("ESL angemeldet (20:19)"), NACHDEM dieser Block 90 s lang
    # vergeblich auf eine Maske gewartet hatte, die noch gar nicht da war.
    Schritt "Warte auf die ESL-Anmeldemaske (bis zu 45 s, danach uebernimmt der Waechter) ..."
    $frist = (Get-Date).AddSeconds(45)
    $versuch = 0
    $passwortNieGesehen = $true
    # "Maske nie gesehen" ist etwas ANDERES als "Passwort nicht lesbar" - und
    # wurde bis 21.08. in denselben Topf geworfen. Der Starter meldete dann
    # "Edge hat in DIESEM Profil kein Passwort gespeichert", obwohl schlicht
    # noch keine Anmeldeseite dastand. Der Nutzer sollte sich daraufhin von
    # Hand anmelden - fuer ein Problem, das es nicht gab.
    $maskeGesehen = $false
    # Edges Vorschlagsliste wird hoechstens EINMAL pro Start bemueht: der Enter,
    # der einen Vorschlag uebernimmt, wirkt bei geschlossener Liste als Absenden.
    # Mehrere Fehlanmeldungen hintereinander koennen ein Konto sperren.
    $vorschlagVersucht = $false
    while ((Get-Date) -lt $frist) {
        Start-Sleep -Milliseconds 1200
        $ziel = $null
        try {
            $ziel = @(Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json" -TimeoutSec 5) |
                    Where-Object { $_.type -eq 'page' -and $_.url -like '*regiocom*' } | Select-Object -First 1
        } catch { }
        if (-not $ziel -or -not $ziel.webSocketDebuggerUrl) { continue }

        $ws = $null
        try {
            $ws = Verbinde $ziel.webSocketDebuggerUrl
            $i = 90
            $z = SeitenZustand $ws $i; $i++

            # WICHTIG: "Feld nicht lesbar" heisst NICHT "angemeldet". Direkt nach
            # einem Neuladen ist die Seite kurz leer - das frueher als Erfolg zu
            # werten, war ein Fehlalarm ("Anmeldung hat geklappt", obwohl die
            # Maske noch stand). Deshalb wird Erfolg nur bei FERTIG geladener
            # Seite OHNE Anmeldeformular gemeldet.
            if (-not $z) { $ws.Dispose(); $ws = $null; continue }
            if (-not $z.ready) { $ws.Dispose(); $ws = $null; continue }
            if (-not $z.loginDa) {
                $ws.Dispose(); $ws = $null
                if ($versuch -gt 0) { Gut "ESL: Anmeldeseite ist weg - Anmeldung hat geklappt." }
                else                { Gut "ESL: keine Anmeldung noetig (Sitzung laeuft bereits)." }
                return $true
            }
            $maskeGesehen = $true
            if (-not $z.pw) { $ws.Dispose(); $ws = $null; continue }   # noch nicht sichtbar

            $versuch++
            Schritt ("ESL-Anmeldung (Versuch " + $versuch + " von 4) ...")

            # BESITZMARKE SETZEN - gegen zwei gleichzeitige Absender.
            # Der Autopilot laeuft in derselben Seite und schickt das Formular
            # ab, sobald er Benutzername und Passwort lesen kann. Der Starter
            # wartet auf genau dasselbe Ereignis (die Autofill-Freigabe) und
            # klickt danach den Knopf. Beide feuerten also im Abstand von
            # Sekundenbruchteilen - und eine zweite Absendung waehrend die erste
            # noch unterwegs ist, laesst PrimeFaces die Maske mit Fehler stehen.
            # Der Starter meldet hier an, dass er die Anmeldung uebernimmt; der
            # Autopilot haelt sich dann zurueck. Die Marke traegt einen
            # Zeitstempel und wird bei jedem Durchlauf erneuert: bleibt der
            # Starter weg (Absturz, oder eine Sitzung laeuft Stunden spaeter ab),
            # verfaellt sie und der Autopilot uebernimmt wieder selbst.
            Sende $ws $i 'Runtime.evaluate' @{ expression = 'window.__rcLoginOwner={wer:"starter",ts:Date.now()};"ok"'; returnByValue = $true }
            [void](Empfange $ws 3000); $i++

            # 1) Steht noch der Fehlerzustand eines frueheren Versuchs? Neu laden.
            #    (Nachgemessen: ein Neuladen stellt das Autofill wieder her.)
            if ($z.kaputt) {
                Schritt "  Formular meldet einen Fehler - Seite wird neu geladen."
                Sende $ws $i 'Page.navigate' @{ url = $z.url }
                [void](Empfange $ws 5000); $i++
                # warten, bis die Seite WIRKLICH wieder steht
                $bereit = $false
                for ($k = 0; $k -lt 20; $k++) {
                    Start-Sleep -Milliseconds 500
                    $z = SeitenZustand $ws $i; $i++
                    if ($z -and $z.ready -and $z.pw) { $bereit = $true; break }
                }
                if (-not $bereit) { $ws.Dispose(); $ws = $null; continue }
            }

            # 2) Neutrale Stelle anklicken = die Geste, die Edge braucht.
            #    Bewusst NICHT ins Feld: dort wuerde Edges eigene Vorschlagsliste
            #    aufgehen und Tastendruecke abfangen.
            $n = NeutralePosition $ws $i; $i++
            $i = KlickAuf $ws $i ([int]$n.x) ([int]$n.y)

            # 3) Auf die Freigabe warten (nachgemessen: kommt binnen ~250 ms).
            $st = WarteAufFreigabe $ws $i 5000
            $i = [int]$st.id
            Schritt ("  Nach der Geste lesbar: Benutzername " + $st.user + " Zeichen, Passwort " + $st.pw + " Zeichen")

            # 4) Passwort immer noch leer? Dann ist in diesem Profil keines
            #    gespeichert ODER Edge will, dass man es aus seiner eigenen
            #    Vorschlagsliste auswaehlt. Diese Liste holen wir jetzt.
            # Nur sinnvoll, wenn der Benutzername ankommt: dann arbeitet Edges
            # Autofill grundsaetzlich und es fehlt wirklich nur die Auswahl.
            # Ist AUCH der Benutzername leer, ist schlicht nichts gespeichert -
            # dann wird gar nichts abgeschickt (sonst nur Fehlanmeldungen).
            if ($st.pw -eq 0 -and $st.user -gt 0 -and -not $vorschlagVersucht) {
                $vorschlagVersucht = $true
                Schritt "  Kein Passwort freigegeben - Edges Vorschlagsliste wird einmalig geoeffnet."
                $z2 = SeitenZustand $ws $i; $i++
                if ($z2 -and $z2.pw) {
                    $i = KlickAuf $ws $i ([int]$z2.pw.x) ([int]$z2.pw.y)
                    Start-Sleep -Milliseconds 400
                    $i = SendeTaste $ws $i 40 'ArrowDown'
                    $st = WarteAufFreigabe $ws $i 2500
                    $i = [int]$st.id
                    if ($st.pw -eq 0) {
                        # Eintrag uebernehmen. Ist gar keine Liste offen, wirkt
                        # dieses Enter als Absenden - den Fehlerzustand faengt
                        # Punkt 1 beim naechsten Durchlauf per Neuladen wieder ab.
                        $i = SendeEnter $ws $i
                        $st = WarteAufFreigabe $ws $i 2500
                        $i = [int]$st.id
                    }
                    Schritt ("  Nach der Vorschlagsliste lesbar: Benutzername " + $st.user + " Zeichen, Passwort " + $st.pw + " Zeichen")
                }
            }

            # 5) NUR abschicken, wenn wirklich beide Werte da sind.
            if ($st.user -gt 0 -and $st.pw -gt 0) {
                $passwortNieGesehen = $false
                $zb = SeitenZustand $ws $i; $i++
                if ($zb -and $zb.btn) { $i = KlickAuf $ws $i ([int]$zb.btn.x) ([int]$zb.btn.y) }
                else                  { $i = SendeEnter $ws $i }
                $ws.Dispose(); $ws = $null
                Start-Sleep -Seconds 3
                if (PruefeEingeloggt) { Gut "ESL-Anmeldung erfolgreich - Autopilot uebernimmt (Menue, Export, Dashboard)."; return $true }
                Warn "  Abgeschickt, die Maske steht aber noch (falsche Zugangsdaten?)."
            } else {
                # Bewusst NICHT abschicken - ein leeres Passwort loest nur den
                # Fehlerzustand aus und bringt uns keinen Schritt weiter.
                Schritt "  Es wird nichts abgeschickt (leeres Passwort waere nur ein Fehlversuch)."
                if ($ws) { $ws.Dispose(); $ws = $null }
                Start-Sleep -Seconds 2
            }
            if ($versuch -ge 4) { break }
        } catch {
            if ($ws) { try { $ws.Dispose() } catch { } }
        }
    }
    if (-not $maskeGesehen) {
        # NICHT als Fehler melden: in dieser Frist ist einfach keine Maske
        # aufgetaucht. Das ist der Normalfall, wenn die Seite noch laedt oder
        # die Sitzung ohnehin steht.
        Schritt "Keine ESL-Anmeldemaske in der Frist gesehen - der Waechter meldet ab jetzt selbst an."
        return $false
    }
    Warn "ESL-Anmeldung hat nicht automatisch geklappt."
    if ($passwortNieGesehen) {
        Warn "GRUND: Edge hat in DIESEM Profil kein Passwort fuer das ESL gespeichert."
        Warn "Das ist ein eigenes, vom normalen Edge getrenntes Profil:"
        Warn ("  " + $Profil)
        Warn "Deshalb einmalig noetig: im gerade geoeffneten Edge-Fenster von Hand"
        Warn "anmelden und Edge das Passwort speichern lassen ('Passwort speichern?' -> Ja)."
        Warn "Ab dem naechsten Start laeuft die Anmeldung dann von allein."
    } else {
        Warn "Die Zugangsdaten wurden abgeschickt, das Portal hat die Maske aber stehen lassen."
        Warn "Bitte pruefen, ob das im Edge-Profil gespeicherte Passwort noch stimmt."
    }
    return $false
}
# true = Seite ist FERTIG geladen und hat keine Anmeldemaske mehr.
# Beides zusammen - sonst gilt eine noch ladende Seite faelschlich als angemeldet.
function PruefeEingeloggt() {
    try {
        $z = @(Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json" -TimeoutSec 5) |
             Where-Object { $_.type -eq 'page' -and $_.url -like '*regiocom*' } | Select-Object -First 1
        if (-not $z -or -not $z.webSocketDebuggerUrl) { return $false }
        $w = Verbinde $z.webSocketDebuggerUrl
        $js = "(function(){return (document.readyState==='complete' && " +
              "!document.getElementById('loginform:pw')).toString();})()"
        Sende $w 100 'Runtime.evaluate' @{ expression = $js; returnByValue = $true }
        $a = Empfange $w 5000
        $w.Dispose()
        return ($a -and ($a | ConvertFrom-Json).result.result.value -eq 'true')
    } catch { return $false }
}
if ($AutoEsl) { [void](EslAnmeldungAbschicken) }
else { Schritt "ESL-Automatik ist aus (`$AutoEsl = `$false) - bitte von Hand anmelden." }

# ---------- 8b) EIN einzelner Anmeldeversuch (fuer den Dauerbetrieb) ----------
# EslAnmeldungAbschicken oben ist auf den START zugeschnitten: eigene Schleife,
# eigene Frist, bis zu vier Versuche. Fuer den Dauerbetrieb wird ein einzelner,
# in sich abgeschlossener Versuch gebraucht, den der Waechter im Takt aufrufen
# kann. Deshalb hier eine eigene, schlanke Fassung auf denselben Bausteinen
# (SeitenZustand / KlickAuf / WarteAufFreigabe) - der Startpfad bleibt unberuehrt.
#
# Rueckgabe:
#   'keine-maske'   - es steht gar keine Anmeldemaske (alles in Ordnung)
#   'laedt'         - Seite noch nicht fertig, spaeter erneut hinsehen
#   'kein-passwort' - Edge gibt nichts frei; es wurde NICHTS abgeschickt
#   'abgeschickt'   - Zugangsdaten sind raus
#   'fehler'        - Verbindungsproblem
function EinAnmeldeVersuch($ziel) {
    if (-not $ziel -or -not $ziel.webSocketDebuggerUrl) { return 'fehler' }
    $ws = $null
    try {
        $ws = Verbinde $ziel.webSocketDebuggerUrl
        $i = 300
        $z = SeitenZustand $ws $i; $i++
        if (-not $z)          { $ws.Dispose(); return 'fehler' }
        if (-not $z.ready)    { $ws.Dispose(); return 'laedt' }
        if (-not $z.loginDa)  { $ws.Dispose(); return 'keine-maske' }
        if (-not $z.pw)       { $ws.Dispose(); return 'laedt' }

        # Steht noch der Fehlerzustand eines frueheren Versuchs? Neu laden -
        # das stellt das Autofill wieder her (im Projekt gemessen).
        if ($z.kaputt) {
            Sende $ws $i 'Page.navigate' @{ url = $z.url }
            [void](Empfange $ws 5000); $i++
            $ws.Dispose()
            return 'laedt'
        }

        # Besitzmarke setzen, damit der Autopilot in derselben Seite nicht
        # gleichzeitig absendet (sonst zwei Absendungen auf einem Formular).
        Sende $ws $i 'Runtime.evaluate' @{ expression = 'window.__rcLoginOwner={wer:"starter",ts:Date.now()};"ok"'; returnByValue = $true }
        [void](Empfange $ws 3000); $i++

        # Die Geste, die Edge sehen will - bewusst auf eine neutrale Stelle,
        # damit keine Vorschlagsliste aufgeht, die Tastendruecke abfaengt.
        $n = NeutralePosition $ws $i; $i++
        $i = KlickAuf $ws $i ([int]$n.x) ([int]$n.y)
        $st = WarteAufFreigabe $ws $i 5000
        $i = [int]$st.id

        if ($st.user -gt 0 -and $st.pw -gt 0) {
            $zb = SeitenZustand $ws $i; $i++
            if ($zb -and $zb.btn) { $i = KlickAuf $ws $i ([int]$zb.btn.x) ([int]$zb.btn.y) }
            else                  { $i = SendeEnter $ws $i }
            $ws.Dispose()
            return 'abgeschickt'
        }
        # NICHTS abschicken, wenn kein Passwort da ist. Ein leeres Formular
        # abzuschicken erzeugt nur einen Fehlversuch - und mehrere davon koennen
        # ein Konto sperren.
        $ws.Dispose()
        return 'kein-passwort'
    } catch {
        if ($ws) { try { $ws.Dispose() } catch { } }
        return 'fehler'
    }
}

# ---------- 9) ERST wenn das Dashboard laeuft: Ligaliste starten ----------
# Der KPI-Crawler schickt seine Kennzahlen an das Dashboard. Laeuft das noch
# nicht, gehen die ersten Sendungen ins Leere. Deshalb wird hier gewartet.

# WICHTIG - hier lag der Grund, warum nach dem Login nichts mehr passierte:
# Page.addScriptToEvaluateOnNewDocument gilt nur so lange, wie die
# DevTools-Verbindung offen ist, die es registriert hat. RuesteTabAus schliesst
# die Verbindung aber sofort wieder ($ws.Dispose()).
# NACHGEMESSEN (echtes Chromium): die Navigation, die noch AUS DERSELBEN
# Verbindung ausgeloest wird, bekommt das Script - jede SPAETERE Navigation
# nicht mehr (Marker war danach 'undefined').
# Uebersetzt auf den Ablauf: die Anmeldeseite bekam den Autopiloten noch, aber
# nach dem Login navigiert das Portal auf main.xhtml - und dort lief er nicht
# mehr. Kein Menue, keine Export-Ansicht, kein Dashboard, keine Ligaliste.
# Deshalb wird der Autopilot jetzt NACHGEHALTEN statt einmalig registriert:
# fehlt er auf der aktuell angezeigten Seite, wird er neu eingespielt.
# Der Autopilot selbst ist dagegen abgesichert (window.__rcAutoPilotV2) und
# laeuft nicht doppelt.
function StelleAutopilotSicher($ziel) {
    if (-not $ziel -or -not $ziel.webSocketDebuggerUrl) { return $false }
    $w = $null
    try {
        $w = Verbinde $ziel.webSocketDebuggerUrl
        # EINE Abfrage fuer drei Angaben: laeuft der Autopilot, welches Projekt
        # bedient dieser Tab (Marke), und wo steht er gerade. Drei einzelne
        # Runtime.evaluate waeren drei Runden ueber die Leitung - je Tab, je 20 s.
        $abfrage = '(function(){var m="";try{m=sessionStorage.getItem("rcEslProjekt")||"";}catch(e){}return ((!!window.__rcAutoPilotV2)?"1":"0")+"|"+m+"|"+location.href;})()'
        Sende $w 40 'Runtime.evaluate' @{ expression = $abfrage; returnByValue = $true }
        $a = Empfange $w 5000
        $wert = ''
        if ($a) { try { $wert = "$(($a | ConvertFrom-Json).result.result.value)" } catch { $wert = '' } }
        $teile  = $wert.Split('|')
        $laeuft = ($teile.Count -ge 1 -and $teile[0] -eq '1')
        $marke  = ''
        if ($teile.Count -ge 2) { $marke = $teile[1] }
        $href   = "$($ziel.url)"
        if ($teile.Count -ge 3) { $href = ($teile[2..($teile.Count - 1)] -join '|') }
        if (-not $laeuft) {
            # Das RICHTIGE Paket fuer diesen Tab - nicht blind das Kabel-Paket.
            $p = PaketFuer $marke $href
            if (-not $p) { $w.Dispose(); $w = $null; return $false }
            # Fuer kuenftige Seiten dieser Verbindung ...
            Sende $w 41 'Page.enable' @{}
            [void](Empfange $w 3000)
            Sende $w 42 'Page.addScriptToEvaluateOnNewDocument' @{ source = $p }
            [void](Empfange $w 5000)
            # ... und sofort fuer die Seite, die gerade offen ist.
            Sende $w 43 'Runtime.evaluate' @{ expression = $p; awaitPromise = $false }
            [void](Empfange $w 15000)
        }
        $w.Dispose(); $w = $null
        return (-not $laeuft)
    } catch {
        if ($w) { try { $w.Dispose() } catch { } }
        return $false
    }
}
# ---------- Ligaliste: fehlenden Ok-Klick nachholen (14.08. abends) ----------
# Der KPI-Crawler klickt seit v6 NIE selbst — der Ok-Klick des Nutzers ist die
# Datenuebertragung, und sein Mitschnitt wird seit heute im Browser-Speicher
# gesichert. Die verbleibende Luecke: nach einem Sitzungstod ist der Token im
# Mitschnitt wertlos, der Crawler verwirft ihn und wartet wieder auf einen
# Klick ("Ligaliste muesste sich problemlos immer wieder updaten" - Nutzer
# 14.08.). Diese eine Geste setzt jetzt der STARTER ab: ein vertrauens-
# wuerdiger CDP-Klick auf den Ok-Knopf, nur wenn der Crawler laeuft UND kein
# Mitschnitt da ist, gedeckelt auf 1x/5 Min je Tab. Der Crawler selbst bleibt
# passiv (klick_replay_pruefen.js wacht darueber).
$ligaKlickZuletzt = @{}    # Tab-Id -> Zeitpunkt des letzten Ok-Klicks
function StelleLigaKlickSicher($ziel) {
    if (-not $ziel -or -not $ziel.webSocketDebuggerUrl) { return $false }
    $seit = $ligaKlickZuletzt[$ziel.id]
    if ($seit -and ((Get-Date) - $seit).TotalMinutes -lt 5) { return $false }
    $w = $null
    try {
        $w = Verbinde $ziel.webSocketDebuggerUrl
        # EINE Abfrage: Mitschnitt da? Crawler da? Wo liegt der Ok-Knopf?
        # Knopfsuche wie findOkButton im Crawler (id ok-button, sonst Textmatch).
        $abfrage = '(function(){' +
            'var m=!!(window.__rcLastGetData&&window.__rcLastGetData.body);' +
            'var c=!!window.kpiCrawlerInterval;' +
            "var el=document.getElementById('ok-button');" +
            'if(!el){var bs=document.querySelectorAll("button,input[type=button],input[type=submit]");' +
            'for(var i=0;i<bs.length;i++){var t=((bs[i].innerText||bs[i].value)||"").trim().toLowerCase();' +
            'if(/^(ok|okay|aktualisieren|anzeigen|los|start|absenden)$/.test(t)){el=bs[i];break;}}}' +
            'var b=null;if(el){var r=el.getBoundingClientRect();' +
            'if(r.width>2&&r.height>2){b=Math.round(r.left+r.width/2)+","+Math.round(r.top+r.height/2);}}' +
            'return (m?"1":"0")+(c?"1":"0")+"|"+(b||"");' +
            '})()'
        Sende $w 70 'Runtime.evaluate' @{ expression = $abfrage; returnByValue = $true }
        $a = Empfange $w 5000
        $wert = ''
        if ($a) { try { $wert = "$(($a | ConvertFrom-Json).result.result.value)" } catch { $wert = '' } }
        $teile = $wert.Split('|')
        # Nur klicken, wenn: Mitschnitt FEHLT ('0'), Crawler LAEUFT ('1'), Knopf sichtbar.
        if ($teile.Count -lt 2 -or $teile[0] -ne '01' -or -not $teile[1]) {
            $w.Dispose(); $w = $null; return $false
        }
        $xy = $teile[1].Split(',')
        if ($xy.Count -ne 2) { $w.Dispose(); $w = $null; return $false }
        $ligaKlickZuletzt[$ziel.id] = Get-Date
        [void](KlickAuf $w 71 ([int]$xy[0]) ([int]$xy[1]))
        $w.Dispose(); $w = $null
        return $true
    } catch {
        if ($w) { try { $w.Dispose() } catch { } }
        return $false
    }
}
# ---------- Dashboard-Direktstart (14.08. abends) ----------
# Nutzer-Befund: "Starter laeuft, Dashboard fehlt trotzdem." Der Autopilot
# versucht den Start inzwischen mehrfach (Zaehler statt once), aber wenn sein
# Code gar nicht in der Seite gelandet ist (Debug-Verbindung war beim Laden zu)
# oder sein Deckel von 10 Versuchen verbraucht ist, blieb wieder nur F12+Paste.
# Deshalb prueft der Waechter jetzt SELBST: steht die Export-Ansicht
# (filterForm) und laeuft kein Dashboard (rcLiveInterval), spielt er den
# Dashboard-Quelltext DIREKT ein - derselbe Weg wie das Lesezeichen, nur ohne
# Hand. Idempotent ueber die rcLiveInterval-Abfrage; je Tab hoechstens 1x/Minute,
# damit ein kaputter Dashboard-Code nicht alle 20 s erneut evaluiert wird.
$dashDirektZuletzt = @{}    # Tab-Id -> Zeitpunkt des letzten Direktstarts
function StelleDashboardSicher($ziel) {
    if (-not $ziel -or -not $ziel.webSocketDebuggerUrl) { return $false }
    if (-not $Dashboard) { return $false }
    $seit = $dashDirektZuletzt[$ziel.id]
    if ($seit -and ((Get-Date) - $seit).TotalSeconds -lt 60) { return $false }
    $w = $null
    try {
        $w = Verbinde $ziel.webSocketDebuggerUrl
        # EINE Abfrage fuer beide Angaben: Export-Ansicht da? Dashboard schon da?
        $abfrage = '(function(){return ((!!document.getElementById("filterForm"))?"1":"0")+((!!window.rcLiveInterval)?"1":"0");})()'
        Sende $w 60 'Runtime.evaluate' @{ expression = $abfrage; returnByValue = $true }
        $a = Empfange $w 5000
        $wert = ''
        if ($a) { try { $wert = "$(($a | ConvertFrom-Json).result.result.value)" } catch { $wert = '' } }
        # '10' = Ansicht steht UND Dashboard fehlt - nur dann wird eingespielt.
        if ($wert -ne '10') { $w.Dispose(); $w = $null; return $false }
        $dashDirektZuletzt[$ziel.id] = Get-Date
        Sende $w 61 'Runtime.evaluate' @{ expression = $Dashboard; awaitPromise = $false }
        [void](Empfange $w 20000)
        $w.Dispose(); $w = $null
        return $true
    } catch {
        if ($w) { try { $w.Dispose() } catch { } }
        return $false
    }
}
function WarteAufDashboard($maxSekunden) {
    Schritt "Warte, bis das Dashboard laeuft (bis zu $maxSekunden s) ..."
    $frist = (Get-Date).AddSeconds($maxSekunden)
    $nachgelegt = 0
    # Alle 20 s ein Lebenszeichen. Ohne das stand das Fenster hier bis zu zwei
    # Minuten stumm - im Livebetrieb sah das aus, als haenge der Starter, und
    # genau daran war nicht zu erkennen, ob ueberhaupt etwas passiert.
    $naechsteMeldung = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $frist) {
        Start-Sleep -Seconds 2
        if ((Get-Date) -gt $naechsteMeldung) {
            $naechsteMeldung = (Get-Date).AddSeconds(20)
            $rest = [int]($frist - (Get-Date)).TotalSeconds
            Schritt "  ... noch kein Dashboard (noch $rest s). Steht die Anmeldung? Kam die Export-Ansicht?"
        }
        try {
            $z = @(Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json" -TimeoutSec 5) |
                 Where-Object { $_.type -eq 'page' -and $_.url -like '*regiocom*' } | Select-Object -First 1
            if (-not $z -or -not $z.webSocketDebuggerUrl) { continue }

            # Erst pruefen, ob das Dashboard schon da ist ...
            $w = Verbinde $z.webSocketDebuggerUrl
            $frage = '(!!window.rcLiveInterval || !!document.getElementById("rcLiveDashboard")).toString()'
            Sende $w 70 'Runtime.evaluate' @{ expression = $frage; returnByValue = $true }
            $a = Empfange $w 5000
            $w.Dispose()
            if ($a -and ($a | ConvertFrom-Json).result.result.value -eq 'true') {
                Gut "Dashboard laeuft."
                return $true
            }
            # ... sonst dafuer sorgen, dass der Autopilot auf DIESER Seite laeuft.
            if (StelleAutopilotSicher $z) {
                $nachgelegt++
                Schritt ("  Autopilot auf der aktuellen Seite neu gestartet (" + $nachgelegt + "x)")
            }
        } catch { }
    }
    Warn "Dashboard war nach $maxSekunden s noch nicht oben."
    return $false
}

# Die Ligaliste AUS DEM DASHBOARD heraus oeffnen (window.open), damit im neuen
# Tab window.opener gesetzt ist - das ist der einzige Rueckkanal, den der
# KPI-Crawler cross-origin hat (siehe ausfuehrliche Begruendung bei Schritt 7).
# userGesture=true ist zwingend: ohne echte Nutzer-Geste blockt der Popup-
# Blocker window.open, und die Funktion liefert null.
# Absichtlich NICHT window.rcOpenKpiQuelle() aufrufen: die Funktion zeigt bei
# blockiertem Popup ein alert(), und ein offener Dialog laesst Runtime.evaluate
# haengen. window.open direkt macht dasselbe, ohne diese Falle.
# ---------------------------------------------------------------------------
#  Stundenmail: Report erzeugen lassen und per Outlook verschicken
# ---------------------------------------------------------------------------
#  Ablauf, und warum in dieser Reihenfolge:
#   1. Dashboard-Tab suchen. Bei drei Projekten (Kabel/Mobile/UM) wird der
#      KABEL-Tab genommen - sonst gingen bis zu drei Mails je Stunde raus, weil
#      rcReportCfg_v1 NICHT projektgetrennt ist (v22.js nutzt dort kein rcKey()).
#   2. Empfaenger und Stundentakt im Dashboard setzen. Damit bleibt die
#      Dashboard-Konfiguration die einzige Wahrheit; das Mailskript liest sie
#      spaeter aus dem Marker in der HTML-Datei. Ein hart uebergebenes -An
#      wuerde eine im Dashboard eingetragene Adresse ueberstimmen.
#   3. Nur wenn keine frische Datei da ist, den Report ausloesen. Das Dashboard
#      macht das ohnehin selbst in den ersten fuenf Minuten einer Stunde; ein
#      zweiter Lauf kostete nur Zeit und erzeugte doppelte Downloads.
#   4. Warten. Der Excel-Bau laedt beim ersten Mal eine CDN-Bibliothek nach und
#      haengt danach noch eine ZIP-Nachbearbeitung an - die Datei ist NICHT
#      sofort da.
#   5. esl_mail_report.ps1 -Senden -Stumm aufrufen.
# ---------------------------------------------------------------------------
#  IST DAS DASHBOARD UEBERHAUPT SCHON SO WEIT? (Nutzer-Vorgabe 09.08.)
# ---------------------------------------------------------------------------
#  "Er wartet nicht auf die Qualitaeten von Ligaliste. Er soll jedes Mal, wenn
#   ich das Dashboard starte, 15 Minuten spaeter die erste E-Mail rausschicken.
#   Es muessen ja erst mal Daten geladen werden."
#
#  Der Grund dahinter ist wichtiger als die Wartezeit: Der ESL-Export ist nach
#  20 Sekunden da, die Ligaliste braucht laenger. Sie kommt ueber einen ZWEITEN
#  Tab, der sich erst bei Microsoft anmelden muss, und der KPI-Crawler schickt
#  seine Kennzahlen danach im 3-Minuten-Takt. Wird der Report vorher gebaut,
#  steht in den Qualitaets-Spalten (CS, TNPS, AHT, AQ, FQ) NICHTS - und weil das
#  Blatt trotzdem vollstaendig aussieht, faellt es dem Empfaenger nicht auf.
#
#  Geprueft wird deshalb BEIDES:
#    1. Zeit  - das Dashboard laeuft mindestens $MailStartWarteMin Minuten.
#    2. Daten - es sind wirklich Liga-Agenten da, und ihr Stand ist frisch.
#  Die Zeit allein genuegt nicht (die Ligaliste kann auch nach 15 Minuten noch
#  haengen), die Daten allein auch nicht (die ersten Pakete sind unvollstaendig).
#
#  Bezugspunkt fuer "wie lange laeuft das Dashboard" ist rcDriftLage.startUm -
#  der Zeitpunkt, an dem das Skript zuletzt eingespielt wurde. Nach einer
#  automatischen Neuanmeldung wird es neu eingespielt, rcKpiData ist dann
#  ebenfalls wieder leer - beide Bedingungen greifen also erneut, und genau das
#  ist richtig.
#
#  Rueckgabe ist ein Hashtable, KEIN blosser Text:
#    grund     - '' = bereit, sonst der Grund im Klartext
#    laeuftMin - wie lange das Dashboard laeuft (-1 = nicht ermittelbar)
#    ohneLiga  - $true, wenn trotz fehlender Ligalisten-Daten gesendet wird
#  Bewusst ein Rueckgabewert statt einer Skript-Variablen: der Aufrufer braucht
#  laeuftMin, um einen Starter-Neustart von einem echten Dashboard-Start zu
#  unterscheiden, und ein ueber den Scope geschmuggelter Wert waere die naechste
#  Stelle, an der man beim Lesen nicht sieht, woher er kommt.
function MailLage($grund, $laeuftMin, $ohneLiga) {
    return @{ grund = "$grund"; laeuftMin = [int]$laeuftMin; ohneLiga = [bool]$ohneLiga }
}
function MailNochNichtBereit($ziele) {
    $dash = $ziele | Where-Object { $_.url -like '*regiocom*' -and
                                    $_.url -notlike '*_mobile*' -and
                                    $_.url -notlike '*_um*' } | Select-Object -First 1
    if (-not $dash) { $dash = $ziele | Where-Object { $_.url -like '*regiocom*' } | Select-Object -First 1 }
    if (-not $dash -or -not $dash.webSocketDebuggerUrl) { return (MailLage 'kein Dashboard-Tab' -1 $false) }

    $js = 'try{' +
          ' var L = window.rcDriftLage;' +
          ' var startUm = (L && L.startUm) ? L.startUm : 0;' +
          ' var laeuftMin = startUm ? Math.floor((Date.now()-startUm)/60000) : -1;' +
          ' var n = 0; try { n = Object.keys(window.rcKpiData||{}).length; } catch(e){}' +
          ' var lu = window.rcKpiLastUpdate ? (+new Date(window.rcKpiLastUpdate)) : 0;' +
          ' var ligaAlterMin = lu ? Math.floor((Date.now()-lu)/60000) : -1;' +
          ' var eslAlterMin = window.rcEslLastOk ? Math.floor((Date.now()-window.rcEslLastOk)/60000) : -1;' +
          # Ein gelungener Abruf beweist NUR, dass eine Excel ankam. Steht das
          # Portal auf einem fremden Tag, ist sie gueltig und trotzdem leer -
          # rcEslLastOk waere dann taufrisch und die Mail ginge mit lauter Nullen
          # raus. Deshalb wird der Zustand mitgelesen, den processDataStream dafuer
          # setzt, ebenso die Sitzung und die Fehlserie.
          ' var tf = window.rcPortalTagFalsch ? (window.rcPortalTagFalsch.tage||"?") : "";' +
          ' var tot = (window.rcSessionState && !window.rcSessionState.alive) ? 1 : 0;' +
          ' var serie = window.rcEslFehlserie || 0;' +
          ' return laeuftMin+"|"+n+"|"+ligaAlterMin+"|"+eslAlterMin+"|"+tot+"|"+serie+"|"+tf;' +
          '}catch(e){ return "fehler:"+e.message; }'
    $antwort = AmDashboard $dash 290 $js 8000
    if (-not $antwort) { return (MailLage 'Dashboard antwortet nicht' -1 $false) }
    if ("$antwort" -like 'fehler:*') { return (MailLage "Dashboard meldet $antwort" -1 $false) }

    $t = "$antwort".Split('|')
    if ($t.Count -lt 4) { return (MailLage "unerwartete Antwort ($antwort)" -1 $false) }
    $laeuftMin    = [int]($t[0])
    $ligaAgenten  = [int]($t[1])
    $ligaAlterMin = [int]($t[2])
    $eslAlterMin  = [int]($t[3])
    $sitzungTot   = ($t.Count -ge 5 -and $t[4] -eq '1')
    $eslSerie     = 0; if ($t.Count -ge 6) { $eslSerie = [int]($t[5]) }
    $tagFalsch    = ''; if ($t.Count -ge 7) { $tagFalsch = $t[6] }

    # laeuftMin = -1 bedeutet: aeltere Dashboard-Fassung ohne Takt-Waechter.
    # Dann faellt die Zeitpruefung weg - die Datenpruefung traegt sie ohnehin.
    if ($laeuftMin -ge 0 -and $laeuftMin -lt $MailStartWarteMin) {
        return (MailLage "Dashboard laeuft erst $laeuftMin von $MailStartWarteMin Minuten" $laeuftMin $false)
    }

    # ---- ESL: nicht nur "kam etwas an", sondern "ist es brauchbar" ----
    # Die Ligaliste hatte eine Altersgrenze, das ESL gar keine - dabei ist es die
    # Quelle der Verkaufszahlen. Der Report saehe vollstaendig aus und zeigte den
    # eingefrorenen Stand von vor Stunden.
    if ($eslAlterMin -lt 0) { return (MailLage 'noch keine ESL-Daten' $laeuftMin $false) }
    if ($tagFalsch)   { return (MailLage "ESL-Portal steht auf $tagFalsch - keine Zahlen von heute" $laeuftMin $false) }
    if ($sitzungTot)  { return (MailLage 'ESL-Sitzung ist abgemeldet' $laeuftMin $false) }
    if ($eslSerie -ge 3) { return (MailLage "ESL-Abruf scheitert seit $eslSerie Runden" $laeuftMin $false) }
    if ($eslAlterMin -gt $MailEslMaxAlterMin) {
        return (MailLage "ESL-Daten sind $eslAlterMin Minuten alt (Grenze $MailEslMaxAlterMin)" $laeuftMin $false)
    }

    # ---- Ligaliste: FRIST statt Pflicht ----
    # WICHTIG (Befund 09.08. aus der Gegenpruefung, sonst waere dieser Umbau eine
    # Verschlechterung gewesen): Der KPI-Crawler seit v6 klickt NICHTS von selbst.
    # pollKpis kehrt ohne gemerkten Ok-Klick mit "noch kein Ok-Klick gemerkt"
    # zurueck (kpi_crawler.js), und der Autopilot startet dort nur den Crawler.
    # Ohne EINEN Ok-Klick des Nutzers auf der Ligaliste bleibt rcKpiData also
    # dauerhaft leer. Eine harte Pflicht haette damit von 7 bis 21 Uhr JEDE Mail
    # verhindert - schlimmer als der Zustand, der behoben werden sollte.
    # Deshalb: warten, aber nicht ewig. Nach $MailLigaFristMin geht die Mail
    # trotzdem raus, und der Starter sagt deutlich, was fehlt und warum.
    $ohneLiga = $false
    if ($MailLigaPflicht) {
        $ligaFehlt = ''
        if ($ligaAgenten -le 0) {
            $ligaFehlt = 'noch keine Ligalisten-Daten (Qualitaet waere leer) - auf der Ligaliste einmal "Ok" klicken, der Crawler klickt nichts von selbst'
        } elseif ($ligaAlterMin -ge 0 -and $ligaAlterMin -gt $MailLigaMaxAlterMin) {
            # Ein alter Bestand ist so schlecht wie keiner: die Zahlen saehen
            # vollstaendig aus, waeren aber von vor Stunden.
            $ligaFehlt = "Ligalisten-Daten sind $ligaAlterMin Minuten alt (Grenze $MailLigaMaxAlterMin)"
        }
        if ($ligaFehlt) {
            if ($laeuftMin -lt 0 -or $laeuftMin -lt $MailLigaFristMin) {
                return (MailLage $ligaFehlt $laeuftMin $false)
            }
            # Frist um: senden, aber den Mangel benennen.
            $ohneLiga = $true
        }
    }
    return (MailLage '' $laeuftMin $ohneLiga)
}

# EIN Stueck JavaScript am Dashboard-Tab auswerten und den Rueckgabewert holen.
# Jeder Aufruf nimmt eine EIGENE Verbindung ohne Page.enable - Empfange()
# filtert nicht nach der Request-Id und wuerde auf einer Verbindung mit
# eingeschalteten Ereignissen ein Ereignis statt der Antwort liefern.
function AmDashboard($dash, $id, $js, $timeoutMs) {
    if (-not $timeoutMs) { $timeoutMs = 8000 }
    try {
        $w = Verbinde $dash.webSocketDebuggerUrl
        Sende $w $id 'Runtime.evaluate' @{ expression = "(function(){ $js })()"; returnByValue = $true }
        $a = Empfange $w $timeoutMs
        $w.Dispose()
        if (-not $a) { return $null }
        return ($a | ConvertFrom-Json).result.result.value
    } catch {
        return $null
    }
}

# ---------------------------------------------------------------------------
#  Dashboard-Einstellungen aus DIESER Datei ins Dashboard schreiben
# ---------------------------------------------------------------------------
#  Nutzer-Vorgabe 14.08.: "Alle Einstellungen, die ich einstellen kann, moechte
#  ich in der Starter-Datei entscheiden koennen auch." Die Werte stehen im Block
#  ">>> DASHBOARD-EINSTELLUNGEN <<<" weiter unten.
#
#  DREI REGELN, die das Verhalten bestimmen:
#   1. $null heisst NICHT ANFASSEN. Ohne diese dritte Moeglichkeit waere jeder
#      Starterlauf ein Zuruecksetzen: wer im Dashboard etwas umstellt, faende es
#      beim naechsten Start ueberschrieben.
#   2. Angewandt wird EINMAL je Dashboard-Aufbau, erkennbar an der Marke
#      window.__rcStarterCfg. Ohne Marke schriebe der 20-Sekunden-Takt die Werte
#      staendig zurueck und eine Umstellung von Hand haette keine Chance -
#      dieselbe Falle wie eine Migration ohne Marker.
#   3. JEDER Schalter wird VOR dem Setzen auf Existenz geprueft. Die Namen hier
#      sind Zeichenketten, die auf Funktionen im Dashboard zeigen; wird dort eine
#      umbenannt, passierte sonst stillschweigend nichts. Was nicht gefunden
#      wird, landet in der Liste "unbekannt" und wird im Fenster gemeldet.
function WendeEinstellungenAn($ziele) {
    $dash = $ziele | Where-Object { $_.url -like '*regiocom*' } | Select-Object -First 1
    if (-not $dash -or -not $dash.webSocketDebuggerUrl) { return }

    # rcLiveInterval steht erst, wenn das Dashboard wirklich laeuft - vorher
    # gaebe es die Schalter noch gar nicht und alles landete in "unbekannt".
    $lage = AmDashboard $dash 340 'try{ if(!window.rcLiveInterval) return "kein-dashboard"; return window.__rcStarterCfg ? "schon" : "offen"; }catch(e){ return "fehler:"+e.message; }' 6000
    if ($lage -ne 'offen') { return }

    $B = { param($v) if ($v) { 'true' } else { 'false' } }
    $js = 'var g=[],u=[];' +
          'function s(n,f){ try{ if(f()===false){ u.push(n); } else { g.push(n); } }catch(e){ u.push(n+" ("+e.message+")"); } }'

    if ($null -ne $Genesys) {
        $js += ' s("Genesys-Selbstoeffnen",function(){ if(typeof window.rcQueueAutoQuelle!=="function") return false;' +
               ' window.rcQueueAutoQuelle(' + (& $B $Genesys) + '); });'
    }
    # rcQueueAus ist INVERTIERT: rcQueueAus(true) schaltet das Modul AUS.
    if ($null -ne $Warteschleife) {
        $js += ' s("Warteschleifen-Seite",function(){ if(typeof window.rcQueueAus!=="function") return false;' +
               ' window.rcQueueAus(' + (& $B (-not $Warteschleife)) + '); });'
    }
    if ($null -ne $RadarSeite) {
        $js += ' s("Radar-Seite",function(){ if(typeof window.rcRadarSeite!=="function") return false;' +
               ' window.rcRadarSeite(' + (& $B $RadarSeite) + '); });'
    }
    if ($null -ne $AbschlussPopups) {
        $js += ' s("Abschluss-Buehne",function(){ if(typeof window.rcFeier!=="function") return false;' +
               ' window.rcFeier(' + (& $B $AbschlussPopups) + '); });'
    }
    # Kein Schalter, sondern eine Flagge, die das Dashboard nur LIEST - deshalb
    # hier direkt gesetzt und invertiert (rcZielErinnerungAus).
    if ($null -ne $Zielerinnerungen) {
        $js += ' s("Ziel-Erinnerungen",function(){ window.rcZielErinnerungAus = ' + (& $B (-not $Zielerinnerungen)) + '; });'
    }
    if ($null -ne $LigaSelbstOeffnen) {
        $js += ' s("Ligaliste selbst oeffnen",function(){ window.rcAutoKpiOff = ' + (& $B (-not $LigaSelbstOeffnen)) + '; });'
    }
    if ($null -ne $NurBcrImVertrieb) {
        $js += ' s("Vertrieb nur BCR",function(){ if(typeof window.rcVertriebNurBcr!=="function") return false;' +
               ' window.rcVertriebNurBcr(' + (& $B $NurBcrImVertrieb) + '); });'
    }
    if ($null -ne $WarnstreifenAbRang) {
        $js += ' s("Warnstreifen ab Rang",function(){ if(typeof window.rcQueueGlobalAb!=="function") return false;' +
               ' window.rcQueueGlobalAb(' + ([int]$WarnstreifenAbRang) + '); });'
    }
    if ($null -ne $FuehrungTopN) {
        $js += ' s("Fuehrung Top-N",function(){ if(typeof window.rcMgmtTopN!=="function") return false;' +
               ' window.rcMgmtTopN(' + ([int]$FuehrungTopN) + '); });'
    }
    # Reihenfolge zwingend: erst Seitenliste und Takt, dann ein/aus. Sonst
    # laeuft die Rotation noch mit der alten Liste weiter.
    if ($null -ne $AutoWechselSeiten -and $AutoWechselSeiten.Count -gt 0) {
        $liste = '[' + (($AutoWechselSeiten | ForEach-Object { AlsJsText $_ }) -join ',') + ']'
        $js += ' s("Wechsel-Seiten",function(){ window.rcAutoRotPages = ' + $liste + '; });'
    }
    # Ein geaenderter Takt greift NICHT von allein - das Intervall laeuft weiter
    # mit dem alten Wert. Deshalb dieselbe Neustart-Folge wie im Konfigurator.
    if ($null -ne $AutoWechselSek) {
        $js += ' s("Wechsel-Takt",function(){ window.rcAutoRotSec = Math.max(10, ' + ([int]$AutoWechselSek) + ');' +
               ' if(window.rcAutoRot && typeof window.rcSetAutoRot==="function"){ window.rcSetAutoRot(false); window.rcSetAutoRot(true); } });'
    }
    if ($null -ne $AutoWechsel) {
        $js += ' s("Auto-Seitenwechsel",function(){ if(typeof window.rcSetAutoRot!=="function") return false;' +
               ' window.rcSetAutoRot(' + (& $B $AutoWechsel) + '); });'
    }
    # Liest der AUTOPILOT beim naechsten Seitenaufbau, nicht das Dashboard.
    if ($null -ne $Handbetrieb) {
        $js += ' s("Handbetrieb (ab naechstem Seitenaufbau)",function(){' +
               ' localStorage.setItem("rcAutoManuell", ' + $(if ($Handbetrieb) { '"1"' } else { '"0"' }) + '); });'
    }

    $js += ' window.__rcStarterCfg = { gesetzt:g, unbekannt:u };' +
           ' return JSON.stringify({ gesetzt:g, unbekannt:u });'

    $antwort = AmDashboard $dash 341 $js 10000
    if (-not $antwort) { Warn "Dashboard-Einstellungen: keine Antwort - beim naechsten Durchlauf erneut."; return }
    try { $e = $antwort | ConvertFrom-Json } catch { Warn "Dashboard-Einstellungen: Antwort unlesbar ($antwort)."; return }
    if ($e.gesetzt -and $e.gesetzt.Count -gt 0) {
        Gut "Dashboard-Einstellungen aus dieser Datei uebernommen: $($e.gesetzt -join ', ')"
    } else {
        Schritt "Dashboard-Einstellungen: nichts vorgegeben (alle Schalter stehen auf `$null)."
    }
    # Ein unbekannter Name heisst: im Dashboard umbenannt oder aeltere Fassung im
    # Tab. Das MUSS auffallen, sonst stellt man hier etwas ein und nichts tut sich.
    if ($e.unbekannt -and $e.unbekannt.Count -gt 0) {
        Warn "Dashboard-Einstellungen NICHT anwendbar: $($e.unbekannt -join ', ')"
        Warn "  (Schalter im Dashboard umbenannt, oder es laeuft eine aeltere Fassung im Tab.)"
    }
}

# ---------------------------------------------------------------------------
#  Stundenmail: je Empfaengerkreis ein eigener Zuschnitt
# ---------------------------------------------------------------------------
#  Warum das so gebaut ist (Nutzer-Meldung 09.08.: "Da ich die Reporting fuer
#  E-Mail-Versand in der .cmd einstelle, kann ich nicht Standort/Stack/Team
#  filtern"): Diese Datei konnte dem Dashboard bisher nur setTo/setCc sagen.
#  Standort, Stack und Team liessen sich AUSSCHLIESSLICH im Konfigurator
#  einstellen - wer die Mail ueber den Starter fuehrt, hatte gar keinen Filter.
#  Und alle drei Kreise (Mannschaft / Leitung / Teams-Kanal) bekamen zwangslaeufig
#  denselben Zuschnitt, obwohl gerade die Leitung oft einen anderen braucht.
#
#  Ablauf jetzt, je Kreis:
#    0. (05.10.) Erst aktualisieren: FrischeAuf laesst das Dashboard holen, was
#       der Zuschnitt braucht (rcFrischStart/rcFrischStand) - siehe dort.
#    1. Empfaenger + Zuschnitt im Dashboard setzen (rcReport.setTo/setCc/setScope).
#    2. NACHFRAGEN, wie viele Zeilen dieser Zuschnitt trifft. Sind es 0, wird
#       dieser Kreis mit Begruendung uebersprungen - frueher entstand daraus ein
#       halber Dateisatz und der Versand fiel wortlos aus.
#    3. Report erzeugen (rcReportNow) und auf DIESEN Dateisatz warten
#       (rcReport.status().fertig). Nicht mehr "die neueste Datei im Ordner":
#       bei drei Zuschnitten je Stunde waere das Zufall.
#    4. esl_mail_report.ps1 mit -Stamm aufrufen, damit genau dieser Satz geht.
#
#  Zwei Kreise mit GLEICHEM Zuschnitt teilen sich einen Lauf - sonst kostete die
#  Vorgabe (alle Filter leer) dreimal denselben Excel-Bau.
# ---------------------------------------------------------------------------
#  HERZSCHLAG VON AUSSEN (17.08.)
# ---------------------------------------------------------------------------
#  Nutzer-Vorgabe: "Auch wenn ich in einem anderen Browser oder Programm bin,
#  muss sich das Dashboard im Hintergrund immer wieder aktualisieren."
#
#  Warum das NICHT im Dashboard geloest werden kann: jeder Timer im Browser
#  haengt am Wohlwollen von Chromium (Drosselung bei verborgenen/minimierten
#  Fenstern) und steht sofort still, wenn ein modaler Dialog offen ist oder der
#  Hauptthread durch einen grossen Excel-Lauf blockiert wird. Die vier
#  Startargumente (Abschnitt 3b) daempfen das, aber sie sind eine Bitte an den
#  Browser, keine Garantie.
#
#  Dieser Herzschlag kommt von AUSSEN und ist davon unabhaengig: der Starter
#  laeuft ohnehin dauerhaft und hat die Fernsteuerung. Er fragt das Dashboard,
#  wie alt seine Zahlen sind, und stoesst bei Stillstand selbst an.
#
#  Bewusst NUR anstossen, nicht selbst rechnen: rcJetztAktualisieren ist der
#  vorhandene, erprobte Weg (Ligaliste + ESL, mit eigener Sperre). Ein zweiter
#  Abrufweg von hier waere eine zweite Wahrheit - der teuerste Fallstrick
#  dieses Projekts.
$HerzschlagAlleSek = 60
$letzterHerzschlag = [datetime]::MinValue
$HerzschlagStillMin = 3        # ab wann als "steht" gilt
function Herzschlag($ziele) {
    if (((Get-Date) - $letzterHerzschlag).TotalSeconds -lt $HerzschlagAlleSek) { return }
    $script:letzterHerzschlag = Get-Date
    $dash = $ziele | Where-Object { $_.url -like '*regiocom*' } | Select-Object -First 1
    if (-not $dash -or -not $dash.webSocketDebuggerUrl) { return }
    # Eine Abfrage, die alles Noetige in einem Zug liefert und NICHTS anfasst.
    $js = '(function(){try{' +
          'if(!window.rcLiveInterval) return "kein-dashboard";' +
          'var e=window.rcEslLastOk||0, l=window.rcKpiLastUpdate?window.rcKpiLastUpdate.getTime():0;' +
          'var em=e?Math.floor((Date.now()-e)/60000):-1;' +
          'var lm=l?Math.floor((Date.now()-l)/60000):-1;' +
          'return em+"|"+lm+"|"+(window.rcExportBusy?1:0);' +
          '}catch(x){return "fehler";}})()'
    $a = AmDashboard $dash 340 $js 8000
    if (-not $a -or "$a" -eq 'fehler') { return }
    if ("$a" -eq 'kein-dashboard') { return }      # darum kuemmert sich StelleDashboardSicher
    $teile = "$a".Split('|')
    if ($teile.Count -lt 3) { return }
    $eslMin = [int]$teile[0]; $ligaMin = [int]$teile[1]; $busy = ($teile[2] -eq '1')
    # Ein laufender Excel-Export blockiert den Hauptthread absichtlich - das ist
    # kein Stillstand und darf keinen Anstoss ausloesen (dieselbe Unterscheidung
    # trifft rcDriftPruefen im Dashboard).
    if ($busy) { return }
    if ($eslMin -lt 0 -and $ligaMin -lt 0) { return }   # noch nie Daten: Startphase
    if ($eslMin -lt $HerzschlagStillMin -and ($ligaMin -lt 0 -or $ligaMin -lt 6)) { return }
    Schritt "  Herzschlag: ESL $eslMin Min / Liga $ligaMin Min alt - stosse Aktualisierung an."
    [void](AmDashboard $dash 341 'try{ if(window.rcJetztAktualisieren) window.rcJetztAktualisieren(); return "ok"; }catch(e){ return "fehler"; }' 8000)
}

# ---------------------------------------------------------------------------
#  WATCHDOG-ALARM (17.08.) - der letzte Plan B
# ---------------------------------------------------------------------------
#  Das Dashboard heilt sich in Stufen selbst (rcWdTick). Bleibt eine Quelle
#  trotz aller Stufen still, setzt es window.rcWdAlarm. Ein Browser kann keine
#  Mail schicken - dieser Starter laeuft ohnehin dauerhaft und liest die Marke
#  im 20-s-Takt.
#
#  EINE Mail je Stoerung, nicht je Takt: sonst kommen ueber Nacht 180 Stueck.
#  Gemerkt wird die Kennung der Stoerung (Quelle + Startzeit); erst wenn sich
#  die aendert - also eine NEUE Stoerung beginnt - darf wieder gemailt werden.
$letzterAlarm = ''
$alarmMails   = 0
$AlarmMailsMax = 6      # je Starterlauf, damit ein Dauerdefekt nicht mailt ohne Ende
function PruefeWatchdogAlarm($ziele) {
    if (-not $MailAktiv -or -not $MailAn) { return }
    if ($alarmMails -ge $AlarmMailsMax) { return }
    $dash = $ziele | Where-Object { $_.url -like '*regiocom*' -and $_.url -notlike '*_mobile*' -and $_.url -notlike '*_um*' } | Select-Object -First 1
    if (-not $dash -or -not $dash.webSocketDebuggerUrl) { return }
    $roh = AmDashboard $dash 320 'try{ var a=window.rcWdAlarm; if(!a) return ""; return a.quelle+"|"+a.zeit+"|"+a.text; }catch(e){ return ""; }' 6000
    if (-not $roh) {
        # Keine Stoerung mehr: Kennung freigeben, damit dieselbe Quelle spaeter
        # erneut melden darf. Ohne das bliebe es bei EINER Mail pro Starterlauf.
        if ($letzterAlarm) { Schritt "  Watchdog: Stoerung behoben." }
        $script:letzterAlarm = ''
        return
    }
    $teile = "$roh".Split('|')
    $kennung = $teile[0] + '|' + $teile[1]
    if ($kennung -eq $letzterAlarm) { return }      # schon gemeldet
    $script:letzterAlarm = $kennung
    $script:alarmMails++
    $text = $teile[2]
    Warn "  WATCHDOG-ALARM: $text"
    $skript = Join-Path $Basis 'esl_mail_report.ps1'
    if (-not (Test-Path -LiteralPath $skript)) { Warn "  Alarm-Mail: esl_mail_report.ps1 fehlt."; return }
    $body = "ESL Live-Arena meldet eine Stoerung.`r`n`r`n" + $text + "`r`n`r`n" +
            "Das Dashboard hat alle Selbstheilungs-Stufen durchlaufen (Replay anstossen, " +
            "Ok-Klick erneuern, Fenster neu laden, Fenster neu oeffnen, Seite neu laden) " +
            "und bekommt trotzdem keine Daten.`r`n`r`n" +
            "Naechster Schritt: am Dashboard rcLogbuch() aufrufen und die Datei sichern.`r`n" +
            "Zeit: " + (Get-Date).ToString('dd.MM.yyyy HH:mm') + "  Rechner: $env:COMPUTERNAME"
    # Eigener Prozess mit Zeitlimit - Outlook kann beim Senden nachfragen und
    # wuerde den Waechter sonst blockieren (dieselbe Vorsichtsmassnahme wie
    # bei der Stundenmail).
    try {
        $p = Start-Process -FilePath 'powershell.exe' -PassThru -WindowStyle Hidden -ArgumentList @(
            '-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$skript`"",
            '-Alarm',"`"$body`"", '-An',"`"$MailAn`"",
            '-Betreff','"ESL Live-Arena - STOERUNG: keine Daten"', '-Senden','-Stumm')
        if (-not $p.WaitForExit(120000)) { try { $p.Kill() } catch {}; Warn "  Alarm-Mail: Zeitlimit." }
        else { Schritt "  Alarm-Mail verschickt an $MailAn ($alarmMails/$AlarmMailsMax)." }
    } catch { Warn ("  Alarm-Mail fehlgeschlagen: " + $_.Exception.Message) }
}

# ---------------------------------------------------------------------------
#  ERST AKTUALISIEREN, DANN REPORT (05.10.)
# ---------------------------------------------------------------------------
#  Nutzer-Vorgabe: "Dieser automatische E-Mail-Versand. Da muss das ja auch
#  alles in Stacks erst mal sich aktualisieren und danach Daten exportieren."
#
#  Im Alle-Projekte-Betrieb holt das Dashboard nur das AKTIVE Projekt im
#  20-s-Takt. Kabel, Mobile und UM stehen sonst auf dem Stand ihres letzten
#  Abrufs - nach einem Neuladen der Seite auf gar keinem. Die Stundenmail las
#  genau diesen Stand: ein Zuschnitt auf MF_CARE traf 0 Zeilen (und fiel aus),
#  solange niemand im Dashboard auf Mobile geklickt hatte, und "ohne Filter"
#  enthielt nur das Projekt, das gerade lief.
#
#  Jetzt stoesst der Starter VOR dem Zuschnitt rcFrischStart an: das Dashboard
#  holt, was der Zuschnitt braucht (Stack -> dessen Projekt, ohne Stack alle
#  drei, dazu die Ligaliste) und meldet ueber rcFrischStand, wann es fertig ist.
#  Erst danach wird die Zeilenzahl gemessen und der Report gebaut.
#
#  Das ist eine FRIST, keine Sperre: wird das Auffrischen nicht fertig oder
#  scheitert ein Projekt, geht die Mail trotzdem raus - mit dem Stand, der da
#  ist, und mit dem Grund in diesem Fenster. Eine Pflicht haette bei einer
#  haengenden Quelle jede Mail des Tages verhindert.
$MailFrischFristSek = 120
function FrischeAuf($dash, $std, $stack, $team, $text) {
    $js = 'try{ if(typeof window.rcFrischStart!=="function") return "alt";' +
          ' return window.rcFrischStart({std:' + (AlsJsText $std) + ', stack:' + (AlsJsText $stack) + ', team:' + (AlsJsText $team) + '}); }' +
          'catch(e){ return "fehler:"+e.message; }'
    $a = AmDashboard $dash 305 $js 8000
    if ("$a" -eq 'alt') { return 'alt' }      # aelteres Dashboard im Tab: kennt das Auffrischen noch nicht
    if ("$a" -ne 'gestartet') {
        Warn "  ${text}: Auffrischen liess sich nicht anstossen ($a) - es gilt der vorhandene Stand."
        return 'fehler'
    }
    $frist = (Get-Date).AddSeconds($MailFrischFristSek)
    $stand = ''
    while ((Get-Date) -lt $frist) {
        Start-Sleep -Seconds 2
        $stand = AmDashboard $dash 306 'try{ return window.rcFrischStand(); }catch(e){ return "fehler:"+e.message; }' 8000
        if ("$stand" -like 'fertig:*') { break }
    }
    if ("$stand" -like 'fertig:ok:*') {
        Schritt ("  ${text}: " + "$stand".Substring(10))
        return 'ok'
    }
    if ("$stand" -like 'fertig:teil:*') {
        Warn ("  ${text}: " + "$stand".Substring(12))
        Warn "    Die Mail geht trotzdem raus - mit dem Stand, der da ist."
        return 'teil'
    }
    Warn "  ${text}: Auffrischen wurde in $MailFrischFristSek s nicht fertig ($stand) - die Mail geht mit dem vorhandenen Stand raus."
    return 'frist'
}

function SchickeStundenmail($ziele) {
    $dash = $ziele | Where-Object { $_.url -like '*regiocom*' -and
                                    $_.url -notlike '*_mobile*' -and
                                    $_.url -notlike '*_um*' } | Select-Object -First 1
    if (-not $dash) { $dash = $ziele | Where-Object { $_.url -like '*regiocom*' } | Select-Object -First 1 }
    if (-not $dash -or -not $dash.webSocketDebuggerUrl) {
        Warn "  Stundenmail: kein Dashboard-Tab gefunden - uebersprungen."
        return $false
    }

    $skript = Join-Path $Basis 'esl_mail_report.ps1'
    if (-not (Test-Path -LiteralPath $skript)) {
        Warn "  Stundenmail: esl_mail_report.ps1 liegt nicht im Ordner - nicht verschickt."
        return $false
    }

    # Ist das Report-Modul ueberhaupt da, und kennt es die Scope-Setter? Ein
    # aelteres Dashboard im Tab (Citrix startet nicht immer neu) hat sie noch
    # nicht - dann wird ohne Filter verschickt und einmal deutlich gesagt, warum.
    $koennen = AmDashboard $dash 300 'try{ if(!window.rcReport) return "kein-report-modul"; return (typeof window.rcReport.setScope==="function") ? "neu" : "alt"; }catch(e){ return "fehler:"+e.message; }' 8000
    if (-not $koennen) { Warn "  Stundenmail: Dashboard nicht erreichbar - uebersprungen."; return $false }
    if ($koennen -like 'fehler:*' -or $koennen -eq 'kein-report-modul') {
        Warn "  Stundenmail: Report-Modul im Dashboard nicht ansprechbar ($koennen)."
        return $false
    }
    $kannFiltern = ($koennen -eq 'neu')
    if (-not $kannFiltern) {
        Warn "  Stundenmail: das Dashboard im Tab ist eine aeltere Fassung ohne Filter-Setter."
        Warn "  Es wird OHNE Standort/Stack/Team-Zuschnitt verschickt. Abhilfe: Tab neu laden."
    }

    # ---- Die Empfaengerkreise, jeder mit eigenem Zuschnitt ----
    $wohin = $MailAn; if ($MailCc) { $wohin += "  (Kopie: $MailCc)" }
    $kreise = @()
    # Mannschaft: An/Cc werden dem Mailskript NICHT als Argument uebergeben - es
    # liest beides aus dem ESLMAIL-Marker der HTML, den das Dashboard schreibt.
    $kreise += @{ Modus = 'team'; An = $MailAn; Cc = $MailCc; Arg = ''; Betreff = '';
                  Std = $MailStandort; Stack = $MailStack; Team = $MailTeam;
                  Mappe = $MailReportingMappe; Text = "Stundenmail an $wohin" }
    if ($MailAnLeitung) {
        $kreise += @{ Modus = 'leitung'; An = $MailAnLeitung; Cc = ''; Arg = $MailAnLeitung;
                      Betreff = 'ESL Live-Arena - vollstaendiger Bericht';
                      Std = $MailStandortLeitung; Stack = $MailStackLeitung; Team = $MailTeamLeitung;
                      Mappe = $MailReportingMappeLeitung; Text = "Leitungs-Mail an $MailAnLeitung" }
    }
    if ($MailAnTeams) {
        $kreise += @{ Modus = 'kanal'; An = $MailAnTeams; Cc = ''; Arg = $MailAnTeams;
                      Betreff = 'ESL Live-Arena - Stundenstand';
                      Std = $MailStandortTeams; Stack = $MailStackTeams; Team = $MailTeamTeams;
                      Mappe = $MailReportingMappeTeams; Text = "Teams-Kanal $MailAnTeams" }
    }

    $okTeam = $false
    $letzteKennung = ''     # Zuschnitt des zuletzt gebauten Satzes
    $letzterStamm  = ''     # und dessen Dateistamm
    $frischFuer    = ''     # Zuschnitt, fuer den zuletzt aufgefrischt wurde
    $id = 310

    foreach ($k in $kreise) {
        $std   = if ($k.Std)   { $k.Std }   else { 'ALL' }
        $stack = if ($k.Stack) { $k.Stack } else { 'ALL' }
        $team  = if ($k.Team)  { $k.Team }  else { 'ALL' }
        $mappe = [bool]$k.Mappe
        $kennung = "$std|$stack|$team|$mappe"
        $zuschnitt = if ($kennung -eq 'ALL|ALL|ALL|False') { 'ohne Filter' } else { "$std / $stack / $team" }

        # ---- 0. Erst aktualisieren (05.10.) ----
        # VOR dem Zuschnitt: die Zeilenzahl in Schritt 2 soll den frischen Stand
        # messen, nicht den des letzten Abrufs. Gleiche Zuschnitte hintereinander
        # frischen nur einmal auf (das Dashboard haelt einen Stand 45 s fuer frisch).
        if ("$std|$stack|$team" -ne $frischFuer) {
            [void](FrischeAuf $dash $std $stack $team $k.Text)
            $frischFuer = "$std|$stack|$team"
        }

        # ---- 1. Empfaenger und Zuschnitt setzen ----
        $id++
        $setz = 'try{ var r=window.rcReport; if(!r) return "kein-report-modul";' +
                ' r.setTo(' + (AlsJsText $k.An) + ');' +
                ' if(typeof r.setCc==="function") r.setCc(' + (AlsJsText $k.Cc) + ');'
        if ($kannFiltern) {
            $setz += ' if(typeof r.setReportingMappe==="function") r.setReportingMappe(' + $(if ($mappe) { 'true' } else { 'false' }) + ');' +
                     ' var s=r.setScope({std:' + (AlsJsText $std) + ', stack:' + (AlsJsText $stack) + ', team:' + (AlsJsText $team) + '});' +
                     ' return "ok:"+s.zeilen+":"+s.label;'
        } else {
            $setz += ' return "ok:-1:(ohne Filter)";'
        }
        $setz += ' }catch(e){ return "fehler:"+e.message; }'
        $antwort = AmDashboard $dash $id $setz 8000
        if (-not $antwort -or $antwort -notlike 'ok:*') {
            Warn "  $($k.Text): Zuschnitt konnte nicht gesetzt werden ($antwort) - uebersprungen."
            continue
        }
        $teile  = $antwort.Split(':')
        $zeilen = [int]($teile[1])
        # 2. Ein Zuschnitt ohne Zeilen ergibt keinen Report und damit keine Mail.
        #    Das gehoert GESAGT - genau hier fiel der Versand bisher wortlos aus.
        if ($zeilen -eq 0) {
            Warn "  $($k.Text): der Zuschnitt ($zuschnitt) trifft 0 Zeilen - kein Report, keine Mail."
            Warn "    Filter in dieser Datei pruefen (`$MailStandort/`$MailStack/`$MailTeam) oder weiter oeffnen."
            continue
        }

        # ---- 3. Report erzeugen, sofern dieser Zuschnitt noch nicht gebaut ist ----
        if ($kennung -eq $letzteKennung -and $letzterStamm) {
            Schritt "  $($k.Text): gleicher Zuschnitt wie eben - Satz $letzterStamm wird mitbenutzt."
            $stamm = $letzterStamm
        } else {
            $zeilenText = if ($zeilen -ge 0) { "$zeilen Zeilen" } else { 'ungefiltert' }
            Schritt "  $($k.Text): Report wird erzeugt ($zuschnitt, $zeilenText) ..."
            $id++
            $start = AmDashboard $dash $id 'try{ var st=window.rcReportNow(); if(st && st.base) return "base:"+st.base; if(typeof st==="string") return "alt:"+st; return "kein-ergebnis"; }catch(e){ return "fehler:"+e.message; }' 15000
            if (-not $start -or $start -like 'fehler:*' -or $start -eq 'kein-ergebnis') {
                Warn "  $($k.Text): Report konnte nicht ausgeloest werden ($start) - uebersprungen."
                continue
            }
            if ($start -like 'alt:*') {
                # Aelteres Dashboard: rcReportNow gab nur den Dateinamen zurueck.
                $stamm = [IO.Path]::GetFileNameWithoutExtension($start.Substring(4))
            } else {
                $stamm = $start.Substring(5)
            }
            # Auf DIESEN Satz warten. Das Dashboard meldet selbst, wann alle
            # erwarteten Dateien geschrieben sind (rcReport.status().fertig) -
            # das ist verlaesslicher als im Download-Ordner zu suchen, weil dort
            # bei mehreren Zuschnitten je Stunde mehrere Saetze liegen.
            $frist = (Get-Date).AddSeconds(60)
            $fertig = $false
            while ((Get-Date) -lt $frist) {
                Start-Sleep -Seconds 3
                $id++
                $stand = AmDashboard $dash $id 'try{ var s=window.rcReport.status(); if(!s) return "kein-stand"; return (s.fertig?"fertig:":"laeuft:")+(s.dateien||[]).length+"/"+(s.erwartet||[]).length; }catch(e){ return "fehler:"+e.message; }' 8000
                if ($stand -like 'fertig:*') { $fertig = $true; break }
            }
            if (-not $fertig) {
                Warn "  $($k.Text): der Report wurde nicht in 60 s fertig - es wird verschickt, was da ist."
            }
            $letzteKennung = $kennung
            $letzterStamm  = $stamm
        }

        # ---- 4. Versenden ----
        # In einem EIGENEN Prozess, damit ein haengendes Outlook diesen Waechter
        # nicht mitreisst. -Stumm sorgt dafuer, dass keine Read-Host-Abfrage
        # stehen bleibt; ohne das sammelte sich je Fehlerstunde ein Prozess an.
        # Der Pfad MUSS in Anfuehrungszeichen (Befund 04.08. aus dem Livebetrieb).
        # Das Benutzerprofil liegt auf einem Netzlaufwerk mit Leerzeichen im Pfad
        # ("...\My Documents\live\"). -ArgumentList fuegt die Elemente schlicht mit
        # Leerzeichen zusammen und quotet NICHTS. PowerShell las damit nur bis zum
        # ersten Leerzeichen ("...\My") und brach mit einem Parser-Fehler ab -
        # Exit-Code -196608 (0xFFFD0000).
        #
        # JEDER Lauf ist ein eigener Prozess mit eigenem Zeitlimit. Haengt Outlook
        # beim ersten, laeuft der zweite trotzdem. Der Rueckgabewert eines Kreises
        # ist bewusst KEINE Bedingung fuer den naechsten: sonst bliebe die Leitung
        # ohne Bericht, nur weil bei der Mannschaft ein Bild fehlte.
        $ok = EinMailLauf $skript $k.Modus $k.Arg $k.Betreff $k.Text $stamm
        if ($k.Modus -eq 'team') { $okTeam = $ok }
    }

    return $okTeam
}

# EIN Versandlauf in einem eigenen Prozess.
# Herausgezogen, weil es seit 05.08. bis zu DREI Empfaengerkreise gibt
# (Mannschaft / Leitung / Teams-Kanal). Ohne eigene Funktion staende der
# Start-Process-Block dreimal da - und die Anfuehrungszeichen um den Pfad
# (Befund 04.08., Exit -196608 auf dem Netzlaufwerk) waeren dreimal zu pflegen.
function EinMailLauf($skript, $modus, $an, $betreff, $klartext, $stamm) {
    $argumente = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $skript + '"'),
                   '-Senden', '-Stumm', '-Modus', $modus)
    # Auch diese beiden gehoeren in Anfuehrungszeichen: eine Verteilergruppe
    # heisst oft "ESL Team Alanya" und ein Betreff enthaelt fast immer Leerzeichen.
    if ($an)      { $argumente += @('-An',      ('"' + $an + '"')) }
    if ($betreff) { $argumente += @('-Betreff', ('"' + $betreff + '"')) }
    # -Stamm pinnt den Dateisatz. Seit 09.08. kann je Empfaengerkreis ein eigener
    # Zuschnitt verschickt werden; dann liegen mehrere Saetze derselben Minute im
    # Download-Ordner und "die neueste Datei" waere Zufall.
    if ($stamm)   { $argumente += @('-Stamm',   ('"' + $stamm + '"')) }
    try {
        $pr = Start-Process -FilePath 'powershell.exe' -PassThru -WindowStyle Hidden -ArgumentList $argumente
        if (-not $pr.WaitForExit(120000)) {
            try { $pr.Kill() } catch {}
            Warn "  $klartext : Outlook hat nach 2 Minuten nicht geantwortet - abgebrochen."
            Warn "  Moegliche Ursache: Outlook fragt beim programmgesteuerten Senden nach."
            return $false
        }
        if ($pr.ExitCode -eq 0) { Gut "  $klartext verschickt."; return $true }
        Warn "  $klartext NICHT verschickt (Code $($pr.ExitCode)). Zum Nachsehen von Hand:"
        Warn "    powershell -ExecutionPolicy Bypass -File ""$skript"" -Modus $modus"
        return $false
    } catch {
        Warn "  $klartext fehlgeschlagen ($($_.Exception.Message))."
        return $false
    }
}

function OeffneLigalisteAusDashboard() {
    $z = $null
    try {
        $z = @(Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json" -TimeoutSec 5) |
             Where-Object { $_.type -eq 'page' -and $_.url -like '*regiocom*' } | Select-Object -First 1
    } catch { }
    if (-not $z -or -not $z.webSocketDebuggerUrl) { return $false }
    try {
        $w = Verbinde $z.webSocketDebuggerUrl
        # Fenstername ueber rcKey des Dashboards (05.08.): sonst bekaeme ein
        # Mobile-/UM-Dashboard hier ein Fenster mit dem KABEL-Namen — und der
        # Crawler leitete daraus den falschen Baum ab.
        $js = '(function(){try{' +
              'var n = window.rcKey ? window.rcKey("rcKpiQuelle") : "rcKpiQuelle";' +
              'window.rcKpiWin = window.open(' + ($CcsUrl | ConvertTo-Json -Compress) + ', n);' +
              'return String(!!window.rcKpiWin);' +
              "}catch(e){return 'fehler';}})()"
        Sende $w 61 'Runtime.evaluate' @{ expression = $js; returnByValue = $true; userGesture = $true }
        $a = Empfange $w 8000
        $w.Dispose()
        return ($a -and ($a | ConvertFrom-Json).result.result.value -eq 'true')
    } catch { return $false }
}
# ---------- Ligaliste + Genesys im DAUERBETRIEB sicherstellen (16.08.) --------
#  Vorher: die Ligaliste wurde GENAU EINMAL geoeffnet, im Startblock hinter
#  "WarteAufDashboard 120". War das Dashboard nach zwei Minuten noch nicht da
#  (langsame Anmeldung, MFA am Handy, traeges Portal), gab der Block auf - und
#  danach hat es NIE wieder jemand versucht. Genau so stand es im Live-Log:
#      "Dashboard war nach 120 s noch nicht oben."
#      "Das Dashboard laeuft nicht - die Ligaliste wird NICHT geoeffnet."
#  waehrend die Anmeldung erst Minuten spaeter durchlief. Der Genesys-Monitor
#  hatte im Starter ueberhaupt keinen Oeffner - er hing allein an der
#  Dashboard-Vorgabe CFG.autoQuelle, und die steht seit 14.08. ab Werk auf aus.
#  Beides laeuft jetzt im Waechter-Takt mit: idempotent (oeffnet nichts, was
#  schon offen ist) und gedeckelt, damit bei einer Stoerung nicht alle 20 s ein
#  Fenster aufgeht.
$LetzterOeffnenVersuch = @{}
$OeffnenAbstandMin     = 2

function DarfOeffnen($was) {
    if ($LetzterOeffnenVersuch.ContainsKey($was) -and
        ((Get-Date) - $LetzterOeffnenVersuch[$was]).TotalMinutes -lt $OeffnenAbstandMin) { return $false }
    $LetzterOeffnenVersuch[$was] = Get-Date
    return $true
}
# Laeuft irgendwo ein Dashboard? Ohne das hat weder Ligaliste noch Genesys einen
# Empfaenger, und der Crawler funkt ins Leere - cross-origin also voellig
# lautlos. Deshalb wird zuerst gefragt und dann geoeffnet, nie umgekehrt.
function DashboardTab($alle) {
    foreach ($t in $alle) {
        if ("$($t.url)" -notlike '*regiocom*') { continue }
        $w = $null
        try {
            $w = Verbinde $t.webSocketDebuggerUrl
            Sende $w 70 'Runtime.evaluate' @{ expression = '!!window.rcLiveInterval'; returnByValue = $true }
            $a = Empfange $w 5000
            $w.Dispose(); $w = $null
            if ($a -and ($a | ConvertFrom-Json).result.result.value -eq $true) { return $t }
        } catch { if ($w) { try { $w.Dispose() } catch { } } }
    }
    return $null
}
# Einen frisch geoeffneten Tab SOFORT verankern, statt bis zum naechsten
# Waechter-Durchlauf zu warten. Warum das zaehlt: ohne Autopilot startet dort
# kein Crawler, und ein Ok-Klick des Nutzers laeuft ins Leere - der fetch-Hook,
# der ihn mitschneiden soll, ist noch gar nicht da. StelleLigaKlickSicher
# klickt ausserdem erst, wenn der Crawler LAEUFT ('01'), braucht also noch eine
# weitere Runde. Aus diesen zwei bis drei Runden wurden im Betrieb die
# beobachteten "ca. 5 Minuten, dann geht es auf einmal".
function VerankereNeuenTab($vorher, $wartenSek) {
    $neu = FindeNeuenTab $vorher $wartenSek
    if (-not $neu) { return $false }
    return (AnkerSetzen $neu)
}
function StelleLigalisteSicher($alle) {
    foreach ($t in $alle) { if ("$($t.url)" -like '*liga_listen*') { return $false } }
    if (-not (DarfOeffnen 'liga')) { return $false }
    if (-not (DashboardTab $alle)) { return $false }
    $vorher = TabIds
    if (-not (OeffneLigalisteAusDashboard)) { return $false }
    [void](VerankereNeuenTab $vorher 15)
    return $true
}
# ---------- Ligaliste da, aber NICHT am Dashboard (05.10.) --------------------
#  Befund aus dem Logbuch vom 29.09.: von 11:45 bis 14:51 kam kein einziges
#  Liga-Paket an ("Liga: 0 Agenten, letztes Paket nie"), obwohl dieser Waechter
#  lief. StelleLigalisteSicher steigt aus, sobald IRGENDEIN Tab mit liga_listen
#  in der Adresse offen ist - ob der am Dashboard haengt, fragte niemand. Ein
#  von Hand geoeffneter oder von Edge wiederhergestellter Ligalisten-Tab hat
#  keinen opener: sein Crawler funkt ins Leere, und das Dashboard selbst darf
#  ohne Nutzer-Geste kein Fenster oeffnen ("Popup wurde blockiert").
#  Massgeblich ist deshalb das LEBENSZEICHEN im Dashboard, nicht der Tab:
#  hat es keine Verbindung zum Ligalisten-Fenster UND seit fuenf Minuten kein
#  Paket, ruft der Waechter rcOpenKpiQuelle() MIT Nutzer-Geste auf. Die Funktion
#  verbindet zuerst ein bestehendes Fenster neu (ohne es neu zu laden) und
#  oeffnet nur sonst ein neues - ein alert() gibt es dort nicht mehr.
#  In den ersten zwei Minuten nach dem Dashboard-Start bleibt es still: das
#  Dashboard verbindet sich nach 12 s selbst neu.
function StelleLigalisteVerbunden($alle) {
    $hatTab = $false
    foreach ($t in $alle) { if ("$($t.url)" -like '*liga_listen*') { $hatTab = $true } }
    if (-not $hatTab) { return $false }          # kein Tab: dafuer ist StelleLigalisteSicher da
    if (-not (DarfOeffnen 'ligaVerbinden')) { return $false }
    $dash = DashboardTab $alle
    if (-not $dash) { return $false }
    $js = '(function(){try{' +
          ' var w = window.rcKpiWin, verbunden = false; try { verbunden = !!(w && !w.closed); } catch(e){}' +
          ' var lu = window.rcKpiLastUpdate ? (+new Date(window.rcKpiLastUpdate)) : 0;' +
          ' var alterMin = lu ? (Date.now()-lu)/60000 : 9999;' +
          ' var L = window.rcDriftLage, startUm = (L && L.startUm) ? L.startUm : 0;' +
          ' var laeuftMin = startUm ? (Date.now()-startUm)/60000 : 9999;' +
          ' if (verbunden || alterMin < 5 || laeuftMin < 2) return "ok";' +
          ' if (typeof window.rcOpenKpiQuelle !== "function") return "fehlt";' +
          ' return window.rcOpenKpiQuelle() ? "verbunden" : "blockiert";' +
          '}catch(e){ return "fehler"; }})()'
    $vorher = TabIds
    $w = $null
    try {
        $w = Verbinde $dash.webSocketDebuggerUrl
        # userGesture ist zwingend - ohne sie blockt der Popup-Blocker window.open.
        Sende $w 72 'Runtime.evaluate' @{ expression = $js; returnByValue = $true; userGesture = $true }
        $a = Empfange $w 8000
        $w.Dispose(); $w = $null
        if (-not $a) { return $false }
        if (($a | ConvertFrom-Json).result.result.value -ne 'verbunden') { return $false }
        # Ging dabei ein neuer Tab auf, sofort verankern (sonst startet der Crawler
        # dort erst im naechsten Durchlauf). Kein neuer Tab = bestehender verbunden.
        [void](VerankereNeuenTab $vorher 6)
        return $true
    } catch {
        if ($w) { try { $w.Dispose() } catch { } }
        return $false
    }
}
function StelleGenesysSicher($alle) {
    foreach ($t in $alle) {
        $u = "$($t.url)"
        if ($u -like '*gm2.rb*' -or $u -like '*MONITOR_2*') { return $false }
    }
    if (-not (DarfOeffnen 'gm')) { return $false }
    $dash = DashboardTab $alle
    if (-not $dash) { return $false }
    $vorher = TabIds
    $w = $null
    try {
        $w = Verbinde $dash.webSocketDebuggerUrl
        # Direkt rcOpenQueueQuelle, NICHT ueber CFG.autoQuelle: dieser
        # Dashboard-Schalter steht seit 14.08. ab Werk auf aus. Hier entscheidet
        # $AutoGenesys aus dieser Datei - EIN Oeffner, nicht zwei, die sich
        # gegenseitig Fenster aufmachen.
        $js = '(function(){try{ if(typeof window.rcOpenQueueQuelle!=="function") return "fehlt";' +
              ' window.rcOpenQueueQuelle(); return "ok"; }catch(e){ return "fehler"; }})()'
        Sende $w 71 'Runtime.evaluate' @{ expression = $js; returnByValue = $true; userGesture = $true }
        $a = Empfange $w 8000
        $w.Dispose(); $w = $null
        if (-not ($a -and ($a | ConvertFrom-Json).result.result.value -eq 'ok')) { return $false }
        # Auch hier sofort verankern - der Genesys-Crawler haengt genauso am
        # Autopiloten wie der KPI-Crawler.
        [void](VerankereNeuenTab $vorher 15)
        return $true
    } catch { if ($w) { try { $w.Dispose() } catch { } }; return $false }
}
# Alle offenen Seiten-Tabs (nur die IDs) - dient als "vorher"-Aufnahme.
function TabIds() {
    try {
        return @(Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json" -TimeoutSec 5) |
               Where-Object { $_.type -eq 'page' } | ForEach-Object { $_.id }
    } catch { return @() }
}
# Den neu entstandenen Tab suchen und dort Dashboard-Code + Autopilot nachreichen.
# Ein per window.open geoeffneter Tab ist ein NEUES Target, das unsere
# Auto-Injektion noch nicht kennt - ohne diesen Schritt laeuft der KPI-Crawler
# dort gar nicht erst an.
# Erkannt wird der Tab daran, dass seine ID vorher noch nicht da war - NICHT an
# seiner Adresse. Grund: verlangt die Ligaliste zwischendurch die
# Microsoft-Anmeldung, steht dort voruebergehend eine ganz andere Adresse. Wer
# auf "ccs.vodafone.de" wartet, ruestet den Tab dann nie aus, und der Autopilot
# kann die Anmeldung nicht uebernehmen.
function FindeNeuenTab($vorherIds, $maxSekunden) {
    $frist = (Get-Date).AddSeconds($maxSekunden)
    while ((Get-Date) -lt $frist) {
        Start-Sleep -Milliseconds 700
        try {
            $neu = @(Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json" -TimeoutSec 5) |
                   Where-Object { $_.type -eq 'page' -and ($vorherIds -notcontains $_.id) } |
                   Select-Object -First 1
            if ($neu -and $neu.webSocketDebuggerUrl) { return $neu }
        } catch { }
    }
    return $null
}
# ---------- Neue Tabs SOFORT versorgen (21.08.) ----------
#  Nutzer-Befund: "Ligaliste braucht immer noch 5 Minuten um zu starten. Sobald
#  ich im Dashboard auf KPI-Quelle klicke, soll der KPI-Crawler starten, sobald
#  die Ligaliste offen ist."
#  Belegte Ursache: der Klick oeffnet das Fenster sofort - aber der Autopilot
#  kommt erst mit dem naechsten Waechter-Durchlauf in den NEUEN Tab, und ein
#  Durchlauf kostet mit der Wartezeit und allen CDP-Zeitlimits ein bis drei
#  Minuten. Ein frisch geoeffneter Tab meldet ausserdem zuerst eine LEERE
#  Adresse und faellt damit durch die Positivliste - also noch eine Runde.
#  Ohne Autopilot laeuft dort kein Crawler, und selbst ein Ok-Klick des Nutzers
#  geht ins Leere: der fetch-Hook, der ihn mitschneiden soll, ist noch nicht da.
#  StelleLigalisteSicher hilft hier NICHT - es steigt aus, sobald ein
#  Ligalisten-Tab existiert, und verankert nur Tabs, die es SELBST geoeffnet hat.
#  Deshalb wird die Wartezeit zwischen zwei Durchlaeufen nicht mehr verschlafen:
#  alle 2 s ein billiger HTTP-Blick auf /json (kein CDP), und jeder Tab ohne
#  lebenden Anker wird sofort verankert. AnkerSetzen spielt den Autopiloten
#  dabei direkt in die offene Seite ein - aus Minuten werden Sekunden.
$NeuTabZuletzt = @{}        # Tab-Id -> letzter Versorgungsversuch (Drossel)
$NeuTabAbstandSek = 30
function WarteUndVersorgeNeueTabs($sek) {
    $bis = (Get-Date).AddSeconds($sek)
    while ((Get-Date) -lt $bis) {
        Start-Sleep -Seconds 2
        $offen = @()
        try {
            # POSITIVLISTE wie im Waechter (12.08.): alles, was nicht http(s)
            # ist, faellt per Bauart heraus. Ein Tab mit noch leerer Adresse
            # wird in der naechsten Scheibe erneut angesehen.
            $offen = @(Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json" -TimeoutSec 5) |
                     Where-Object { $_.type -eq 'page' -and
                                    ($_.url -like 'http://*' -or $_.url -like 'https://*') }
        } catch { $offen = @() }
        foreach ($t in $offen) {
            $id = "$($t.id)"
            # Lebender Anker = versorgt. Ein abgerissener Anker kommt hier
            # wieder dran, das ist gewollt.
            if ($AnkerWs.ContainsKey($id) -and $AnkerWs[$id].State -eq 'Open') { continue }
            # Drossel: ein Tab, bei dem das Verankern scheitert, darf nicht alle
            # 2 s einen Versuch kosten - sonst kommt der Rest nicht mehr dran.
            $seit = $NeuTabZuletzt[$id]
            if ($seit -and ((Get-Date) - $seit).TotalSeconds -lt $NeuTabAbstandSek) { continue }
            $NeuTabZuletzt[$id] = Get-Date
            if (AnkerSetzen $t) { Schritt "  Neuer Tab sofort versorgt: $($t.url)" }
        }
    }
}
# Auf dem zweiten Tab (Microsoft-Anmeldung vor der Ligaliste) gilt DIESELBE
# Autofill-Sperre wie beim ESL-Login: Edge zeigt das gespeicherte Passwort an,
# gibt es an JavaScript aber erst nach einer echten Nutzer-Geste frei.
# Der Autopilot klickt "Anmelden" aber nur, wenn er das Passwort LESEN kann
# (msFlow: "if (pass && usable(pass) && pass.value ...)"). Ohne Geste bleibt er
# ewig bei "Bitte Passwort eingeben/auswaehlen" stehen - obwohl das Passwort
# sichtbar im Feld steht. Genau das war hier zu sehen.
# Ein Klick auf eine neutrale Stelle genuegt (nachgemessen). Es wird nichts
# getippt und kein Passwort gespeichert.
#
# ACHTUNG - die Sichtbarkeitspruefung muss GENAU sein: In der E-MAIL-Maske von
# Microsoft existiert das Passwortfeld i0118 BEREITS, es liegt nur per
# CSS-Klasse "moveOffScreen" weit ausserhalb des Bildes. Es meldet trotzdem
# Breite und Hoehe. Wer nur auf width/height prueft, haelt die E-Mail-Maske
# faelschlich fuer die Passwort-Maske - und klickt dann auf eine neutrale
# Stelle, was Edges gerade geoeffnete Vorschlagsliste wieder ZUKLAPPT.
# Deshalb hier dieselbe Logik wie usable() im Autopiloten.
function MsZustand($ws, $reqId) {
    $js = '(function(){' +
          'function brauchbar(el){if(!el)return false;' +
          "if(/moveoffscreen/i.test((el.className||'').toString()))return false;" +
          'var r=el.getBoundingClientRect();' +
          'if(!r||r.width<=1||r.height<=1)return false;' +
          'if(r.right<=0||r.bottom<=0)return false;' +
          'if(r.left>(window.innerWidth||4000))return false;' +
          'if(r.top>(window.innerHeight||4000))return false;' +
          'try{var s=window.getComputedStyle(el);' +
          "if(s&&(s.visibility==='hidden'||s.display==='none'))return false;}catch(e){}" +
          'return true;}' +
          'function mitte(el){var r=el.getBoundingClientRect();' +
          'return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};}' +
          # ECHTE Tastatureingabe des Anwenders mitschreiben. Das ist der einzige
          # verlaessliche Hinweis darauf, dass gerade JEMAND SELBST tippt. Der
          # blosse Fokus in einem Feld war es NICHT: die Microsoft-Kennwortmaske
          # setzt den Fokus selbst ins Kennwortfeld: damit galt der Anwender als
          # "tippt gerade" und die Anmeldehilfe stieg auf genau der Maske aus, fuer
          # die sie gebaut wurde. isTrusted trennt echte Tasten von unseren eigenen.
          "if(!window.__rcTastenHorcher){window.__rcTastenHorcher=1;" +
          "document.addEventListener('keydown',function(e){if(e&&e.isTrusted)window.__rcLetzteTaste=Date.now();},true);}" +
          "var mail=document.getElementById('i0116')||" +
          "document.querySelector('input[type=email],input[name=loginfmt]');" +
          "var a=document.querySelectorAll('input[type=password]'),pw=null;" +
          'for(var i=0;i<a.length;i++){if(brauchbar(a[i])){pw=a[i];break;}}' +
          'var af=document.activeElement;' +
          "var o={imFeld:!!(af&&(af.tagName==='INPUT'||af.tagName==='TEXTAREA'))," +
          # aktivId/zielFokus: unterscheidet "Fokus steht im ZIELFELD" (Normalfall,
          # kein Grund auszusteigen) von "Fokus steht woanders" (dann besser nichts
          # anfassen). tippt: nur wahr, wenn in den letzten 5 s echt getippt wurde.
          "aktivId:(af&&af.id)||''," +
          'zielFokus:!!(af&&pw&&af===pw),' +
          'tippt:!!(window.__rcLetzteTaste&&(Date.now()-window.__rcLetzteTaste)<5000),' +
          'mailDa:false,mailLeer:false,pwDa:!!pw,pwLen:pw?(pw.value||"").length:-1,' +
          # Diagnose: laeuft der Autopilot hier ueberhaupt, kennt er die Adresse,
          # laeuft der Crawler schon - und welche Maske steht gerade?
          # adresse: der Autopilot haelt eine fest hinterlegte Vorgabe (CFG.MAIL_STD)
          # und schreibt den benutzten Wert nach localStorage zurueck. Nur auf
          # window.__rcMail zu schauen meldete deshalb dauerhaft "fehlt", obwohl
          # eine Adresse da war.
          'pilot:!!window.__rcAutoPilotV2,' +
          "adresse:!!(window.__rcMail||(function(){try{return localStorage.getItem('rcAutoMail');}catch(e){return null;}})())," +
          'crawler:!!window.kpiCrawlerInterval};' +
          'if(mail&&brauchbar(mail)){o.mailDa=true;o.mailLeer=!((mail.value||"").length);o.mailPos=mitte(mail);}' +
          'if(pw){o.pwPos=mitte(pw);}' +
          "var mfa=document.getElementById('idRichContext_DisplaySign')||document.getElementById('idRemoteNGC_DisplaySign');" +
          "var kmsi=document.getElementById('idBtn_Back');" +
          "var weiter=document.getElementById('idSIButton9');" +
          # Der Knopf "Weiter"/"Anmelden"/"Ja" ist auf allen Masken derselbe
          # (idSIButton9). Seine Position wird gebraucht, damit der Starter ihn
          # ECHT anklicken kann - ein el.click() aus JavaScript ist untrusted, und
          # die Anmeldeseite verwirft dann den vom Browser eingefuellten Wert
          # ("Geben Sie Ihr Kennwort ein.", obwohl das Feld sichtbar gefuellt ist).
          'if(weiter&&brauchbar(weiter)){o.btnPos=mitte(weiter);o.btnAus=!!weiter.disabled;}' +
          "o.maske = mfa ? 'Authenticator-Bestaetigung' : (kmsi ? 'Angemeldet bleiben?' :" +
          "         (o.pwDa ? 'Passwort' : (o.mailDa ? 'E-Mail' : 'keine Anmeldemaske')));" +
          'return JSON.stringify(o);})()'
    Sende $ws $reqId 'Runtime.evaluate' @{ expression = $js; returnByValue = $true }
    $antw = Empfange $ws 5000
    if (-not $antw) { return $null }
    try { return (($antw | ConvertFrom-Json).result.result.value | ConvertFrom-Json) } catch { return $null }
}
# Hilft der Microsoft-Anmeldung im zweiten Tab auf die Spruenge.
# Rueckgabe: '' (nichts noetig) | 'kmsi' | 'freigabe' | 'absenden' | 'vorschlag'
#
# WARUM DIESE FUNKTION FRUEHER AUF DER KENNWORTMASKE NICHTS TAT
#   Sie stieg bei $z.imFeld sofort aus ("tippt der Anwender gerade selbst?").
#   Die Microsoft-Kennwortmaske setzt den Fokus aber SELBST ins Kennwortfeld -
#   ohne dass jemand tippt. Damit war imFeld dauerhaft wahr und die Hilfe lief
#   auf genau der Maske nie an, fuer die sie gebaut wurde. Genau das war zu
#   sehen: gefuelltes Kennwortfeld, "Geben Sie Ihr Kennwort ein.", und erst ein
#   Mausklick von Hand brachte die Anmeldung weiter.
#   Jetzt zaehlt nur noch ECHTES Tippen (isTrusted-Tastendruck der letzten 5 s)
#   oder ein Fokus in einem ANDEREN Feld als dem Ziel als "bitte nicht stoeren".
function HilfMsAnmeldung($ziel, $vorschlagSchonVersucht, $absendungen) {
    if (-not $ziel -or -not $ziel.webSocketDebuggerUrl) { return '' }
    $w = $null
    try {
        $w = Verbinde $ziel.webSocketDebuggerUrl
        $z = MsZustand $w 50
        if (-not $z) { $w.Dispose(); return '' }
        # Der Anwender arbeitet gerade selbst -> nichts anfassen.
        if ($z.tippt) { $w.Dispose(); return '' }
        # Fokus in einem anderen Eingabefeld als dem Kennwortfeld -> ebenfalls
        # Finger weg (dort koennte er z.B. gerade die Adresse eintragen).
        if ($z.imFeld -and -not $z.zielFokus) { $w.Dispose(); return '' }

        # Fall 0: "Angemeldet bleiben?" - der Starter kannte diese Maske bisher
        # nur zum Melden, hatte aber keinen Handgriff dafuer. Der Autopilot
        # versucht sie genau EINMAL (once('kmsi')); misslingt der Klick, bleibt
        # die Maske fuer immer stehen. Ein echter Klick vom Starter aus wirkt
        # auch dort, wo ein el.click() aus JavaScript verworfen wird - und weil
        # der Starter im 3-s-Takt wiederkommt, ist es automatisch ein
        # Wiederholversuch.
        if ($z.maske -eq 'Angemeldet bleiben?' -and $z.btnPos) {
            [void](KlickAuf $w 54 ([int]$z.btnPos.x) ([int]$z.btnPos.y))
            $w.Dispose(); $w = $null
            return 'kmsi'
        }

        # Fall 1: echte Passwort-Maske, Wert fuer JS gesperrt -> Geste nachreichen.
        # INS FELD klicken, nicht auf eine neutrale Stelle. Der neutrale Klick war
        # der bisherige Weg und reichte auf dieser Seite nachweislich nicht (der
        # Anwender musste von Hand ins Kennwortfeld klicken). Das Feld hat hier
        # ohnehin schon den Fokus, es geht also keine Vorschlagsliste zu.
        if ($z.pwDa -and ([int]$z.pwLen) -eq 0) {
            if ($z.pwPos) { [void](KlickAuf $w 51 ([int]$z.pwPos.x) ([int]$z.pwPos.y)) }
            else {
                $n = NeutralePosition $w 51
                [void](KlickAuf $w 52 ([int]$n.x) ([int]$n.y))
            }
            $w.Dispose(); $w = $null
            return 'freigabe'
        }

        # Fall 1b: Kennwort ist da, die Maske steht aber immer noch.
        # Dann hat der Autopilot entweder gar nicht abgeschickt oder sein
        # JavaScript-Klick wurde verworfen. Der Starter klickt den Knopf jetzt
        # ECHT an - das ist eine vertrauenswuerdige Geste, bei der der Browser
        # seine eingefuellten Werte selbst mitsendet.
        # STRENG GEDECKELT: hoechstens 2 Absendungen je Tab und Start. Mehrere
        # Fehlanmeldungen hintereinander koennen ein Konto sperren.
        if ($z.pwDa -and ([int]$z.pwLen) -gt 0 -and $z.btnPos -and -not $z.btnAus -and
            ([int]$absendungen) -lt 2) {
            [void](KlickAuf $w 56 ([int]$z.btnPos.x) ([int]$z.btnPos.y))
            $w.Dispose(); $w = $null
            return 'absenden'
        }
        # Fall 2: E-Mail-Maske, Feld leer und keine Adresse hinterlegt.
        # Edge bietet den gespeicherten Zugang in einer EIGENEN Liste an
        # (Browser-UI, nicht im DOM). Die laesst sich nur mit der Tastatur
        # bedienen: ins Feld klicken -> Pfeil runter -> Enter uebernimmt den
        # Eintrag und fuellt Adresse UND Passwort.
        # Hoechstens EINMAL pro Start - bei geschlossener Liste wirkt das Enter
        # als Absenden, und das soll sich nicht wiederholen.
        if ($z.mailDa -and $z.mailLeer -and -not $AnmeldeMail -and -not $vorschlagSchonVersucht) {
            [void](KlickAuf $w 53 ([int]$z.mailPos.x) ([int]$z.mailPos.y))
            Start-Sleep -Milliseconds 500
            $i = SendeTaste $w 55 40 'ArrowDown'
            Start-Sleep -Milliseconds 300
            [void](SendeEnter $w $i)
            $w.Dispose(); $w = $null
            return 'vorschlag'
        }
        $w.Dispose(); $w = $null
        return ''
    } catch {
        if ($w) { try { $w.Dispose() } catch { } }
        return ''
    }
}
function LaeuftKpiCrawler($ziel) {
    if (-not $ziel -or -not $ziel.webSocketDebuggerUrl) { return $false }
    try {
        $w = Verbinde $ziel.webSocketDebuggerUrl
        Sende $w 55 'Runtime.evaluate' @{ expression = '(!!window.kpiCrawlerInterval).toString()'; returnByValue = $true }
        $a = Empfange $w 5000
        $w.Dispose()
        return ($a -and ($a | ConvertFrom-Json).result.result.value -eq 'true')
    } catch { return $false }
}
# Den Ligaliste-Tab eine Weile BEGLEITEN. Drei Dinge muessen dort laufend
# nachgehalten werden:
#   1. die Auto-Injektion (nach jeder Weiterleitung wieder weg, siehe
#      Messung bei StelleAutopilotSicher),
#   2. die Autofill-Freigabe fuer die Microsoft-Anmeldung,
#   3. die Frage, ob der KPI-Crawler inzwischen laeuft.
# Kurze Zustandszeile eines Tabs (nur fuer die Diagnose im Fenster).
function TabZustand($ziel) {
    if (-not $ziel -or -not $ziel.webSocketDebuggerUrl) { return $null }
    $w = $null
    try {
        $w = Verbinde $ziel.webSocketDebuggerUrl
        $z = MsZustand $w 60
        $w.Dispose(); $w = $null
        return $z
    } catch {
        if ($w) { try { $w.Dispose() } catch { } }
        return $null
    }
}
# JEDEN Tab betreuen, der nicht das Dashboard ist.
# Frueher wurde EIN Tab ueber seine Target-ID verfolgt. Das ist zu fragil:
# trifft die ID nicht (weitere Tabs, Zwischenseiten), wird still der falsche
# Tab versorgt und auf dem richtigen passiert nie etwas - genau so sah es aus.
# Der zweite Tab wandert ausserdem von login.microsoftonline.com nach
# ccs.vodafone.de. Deshalb wird hier jeder Tab versorgt, der nicht das
# Dashboard ist; das ist idempotent und selbstheilend.
function BegleiteZweitenTab($maxSekunden) {
    $frist = (Get-Date).AddSeconds($maxSekunden)
    $freigaben = 0
    $vorschlagVersucht = $false
    # Gedaechtnis PRO TAB. Vorher war das EINE Variable fuer ALLE Tabs: sobald
    # zwei Tabs mit unterschiedlichem Zustand offen waren (z.B. Ligaliste
    # "keine Anmeldemaske" und Microsoft "Angemeldet bleiben?"), war jede
    # Meldung ungleich der zuletzt gemerkten - beide druckten in JEDEM
    # 3-s-Durchlauf. Bei 300 s Frist ergab das rund 200 abwechselnde Zeilen.
    $letzteMeldung = @{}
    # Absendungen je Tab zaehlen - Schutz gegen Kontosperre durch wiederholte
    # Fehlanmeldungen. Die Deckelung wertet HilfMsAnmeldung aus.
    $absendungen = @{}
    while ((Get-Date) -lt $frist) {
        $tabs = @()
        try {
            # POSITIVLISTE (12.08.), gleiche Begruendung wie beim Dauer-Waechter
            # weiter unten: die frueheren Sperrlisten liessen 'chrome-extension://'
            # durch, und der Autopilot landete im Livebetrieb nachweislich in
            # DevToolsPlugin.html und CitrixBcrServiceWorker.js. Nur http(s) ist
            # ueberhaupt ein Ziel - alles andere per Bauart raus, statt jede neue
            # Schema-Variante einzeln nachzupflegen.
            # Der regiocom-Ausschluss bleibt: um ESL-Tabs kuemmert sich
            # EslAnmeldungAbschicken, nicht dieser Nachruest-Lauf.
            $tabs = @(Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json" -TimeoutSec 5) |
                    Where-Object { $_.type -eq 'page' -and
                                   $_.url -notlike '*regiocom*' -and
                                   ($_.url -like 'http://*' -or $_.url -like 'https://*') }
        } catch { }
        foreach ($t in $tabs) {
            [void](StelleAutopilotSicher $t)
            # Kurzname des Tabs, damit sich Ligaliste, Microsoft-Anmeldung und
            # Genesys-Monitor in den Meldungen auseinanderhalten lassen.
            $wer = 'Tab'
            if ($t.url -like '*gm2.rb*' -or $t.url -like '*MONITOR_2*') { $wer = 'Genesys-Monitor' }
            elseif ($t.url -like '*liga_listen*') { $wer = 'Ligaliste' }
            elseif ($t.url -like '*microsoftonline*' -or $t.url -like '*login.live*') { $wer = 'Microsoft-Anmeldung' }
            elseif ($t.url -like '*ccs.vodafone*') { $wer = 'CCS' }
            $z = TabZustand $t
            if ($z) {
                if ($z.crawler) { Schritt ("  " + $wer + ": KPI-Crawler laeuft.") ; return $true }
                # Zustand nur melden, wenn er sich GEAENDERT hat - sonst waere
                # das Fenster alle 3 s voll mit derselben Zeile.
                $meldung = "  " + $wer + ": " + $z.maske +
                           " | Autopilot: " + $(if ($z.pilot) { 'laeuft' } else { 'LAEUFT NICHT' }) +
                           " | Adresse: " + $(if ($z.adresse) { 'hinterlegt' } else { 'fehlt' })
                if ($meldung -ne $letzteMeldung[$t.id]) { Schritt $meldung; $letzteMeldung[$t.id] = $meldung }
            }
            if (-not $absendungen.ContainsKey($t.id)) { $absendungen[$t.id] = 0 }
            $tat = HilfMsAnmeldung $t $vorschlagVersucht $absendungen[$t.id]
            if ($tat -eq 'freigabe') {
                $freigaben++
                Schritt ("  " + $wer + ": ins Kennwortfeld geklickt, damit Edge das Passwort freigibt (" + $freigaben + "x)")
            } elseif ($tat -eq 'kmsi') {
                Schritt ("  " + $wer + ": ""Angemeldet bleiben?"" bestaetigt.")
            } elseif ($tat -eq 'absenden') {
                $absendungen[$t.id] = $absendungen[$t.id] + 1
                Schritt ("  " + $wer + ": Anmeldung echt abgeschickt (" + $absendungen[$t.id] + " von hoechstens 2).")
            } elseif ($tat -eq 'vorschlag') {
                $vorschlagVersucht = $true
                Schritt ("  " + $wer + ": Edges gespeicherten Zugang uebernommen.")
            }
        }
        Start-Sleep -Seconds 3
    }
    return $false
}

# Steht bewusst HIER oben (21.08.): die Meldung im Ligalisten-Block unten
# nennt den Takt, und bis dahin war die Variable noch leer - im Fenster
# stand "Pruefung alle  s".
$DauerTaktSek = 20          # so oft wird nachgesehen (die Sitzung faellt alle 2-3 h aus)

if ($CcsOeffnen -and $AutoLigaliste) {
    # Ohne laufendes Dashboard hat die Ligaliste keinen Empfaenger: der Crawler
    # wuerde ins Leere funken. Dann lieber gar nicht oeffnen und sagen, warum.
    # 30 s statt 120 s (21.08.): auch das ist blockierende Zeit vor dem
    # Waechter. Faellt es durch, holt StelleLigalisteSicher die Ligaliste im
    # Takt nach, und die Neu-Tab-Wache verankert sie binnen Sekunden - im
    # Live-Log vom 21.08. genau so passiert ("Neuer Tab sofort versorgt:
    # ...liga_listen.rb"). Die 120 s waren also reine Verzoegerung.
    if (-not (WarteAufDashboard 30)) {
        # Seit 16.08. ist das KEIN endgueltiges Aufgeben mehr: der Dauerwaechter
        # holt die Ligaliste nach, sobald das Dashboard steht
        # (StelleLigalisteSicher). Frueher endete es hier - und wenn die
        # Anmeldung laenger als zwei Minuten brauchte, kam nie wieder jemand.
        Warn "Dashboard noch nicht oben - die Ligaliste kommt spaeter."
        Schritt "  Der Waechter holt sie nach, sobald das Dashboard laeuft (Pruefung alle $DauerTaktSek s)."
    } else {
        Schritt "Ligaliste wird aus dem Dashboard heraus geoeffnet ..."
        # Vorher merken, welche Tabs es schon gibt - der neue faellt danach auf.
        $vorher = TabIds
        if (OeffneLigalisteAusDashboard) {
            $neuerTab = FindeNeuenTab $vorher 30
            if ($neuerTab) {
                # Verankern statt nur einspielen: der Ligalisten-Tab navigiert
                # bei der CCS-Anmeldung mehrfach, und ohne Anker waere der
                # Autopilot nach jedem Sprung wieder weg.
                if (-not (AnkerSetzen $neuerTab)) { [void](StelleAutopilotSicher $neuerTab) }
                Schritt "Ligaliste ist offen - Anmeldung und Crawler werden begleitet ..."
                Schritt "  (Verlangt die Microsoft-Anmeldung die Authenticator-App,"
                Schritt "   bitte am Handy bestaetigen - danach laeuft es weiter.)"
                if (BegleiteZweitenTab 300) {
                    Gut "KPI-Crawler laeuft - Kennzahlen gehen ans Dashboard."
                } else {
                    Warn "Der KPI-Crawler ist im zweiten Tab noch nicht angelaufen."
                    Warn "Haengt dort die Microsoft-Anmeldung? Einmal von Hand anmelden -"
                    Warn "der Autopilot startet den Crawler danach selbst."
                    if (-not $AnmeldeMail) {
                        Warn ""
                        Warn "TIPP: Traegt man die Anmelde-Adresse einmal ein, fuellt der"
                        Warn "Autopilot den E-Mail-Schritt selbst aus. Dazu in dieser Datei"
                        Warn "die Zeile   `$AnmeldeMail = ''   ausfuellen, z.B."
                        Warn "  `$AnmeldeMail = 'vorname.nachname@vodafone.com'"
                        Warn "Nur die Adresse - ein Passwort wird nie gespeichert."
                    }
                }
            } else {
                Warn "Der neue Tab wurde nicht gefunden - KPI-Crawler laeuft dort nicht."
                Warn "Tipp: die Seite im zweiten Tab einmal neu laden."
            }
        } else {
            Warn "Die Ligaliste liess sich nicht aus dem Dashboard oeffnen (Popup-Blocker?)."
            Warn "Bitte im Dashboard oben auf den Knopf 'KPI-Quelle' klicken - dann"
            Warn "stimmt der Rueckkanal ebenfalls. Einen zweiten Tab von Hand zu"
            Warn "oeffnen hilft NICHT: dann fehlt der opener und es kommen keine Daten an."
        }
    }
}

# ---------------------------------------------------------------------------
#  WAECHTER fuer spaeter geoeffnete Tabs (Genesys-Monitor)
#
#  Das Problem: Page.addScriptToEvaluateOnNewDocument gilt nur fuer den Tab, fuer
#  den es registriert wurde. Der Monitor-Tab entsteht aber erst rund 25 Sekunden
#  nach dem Dashboard-Start, wenn dieses ihn selbst per window.open oeffnet
#  (nur so ist der opener gesetzt - der einzige Rueckkanal ueber die Origins).
#  Bis dahin war dieses Skript laengst beendet, der Tab blieb ohne Autopilot,
#  und der Genesys-Crawler musste jedes Mal von Hand eingespielt werden.
#
#  Deshalb laeuft der Starter jetzt noch eine Weile weiter und ruestet JEDEN neu
#  auftauchenden Tab aus. Das kostet nichts, wenn keiner kommt.
#  ZWEI FEHLER, DIE HIER FRUEHER STECKTEN (Befund 31.07.):
#   1. Der Waechter nahm zu Beginn eine Momentaufnahme ($bekannt) und fasste
#      danach NUR noch Tabs an, deren Id neu dazukam - und jeden davon genau
#      EINMAL. Das passt aber nicht zur Lebensdauer der Einspielung: laut der
#      eigenen Messnotiz weiter oben (siehe StelleAutopilotSicher) ueberlebt eine
#      per Page.addScriptToEvaluateOnNewDocument registrierte Einspielung das
#      Trennen der Verbindung NICHT. Ein frisch geoeffneter Tab ist beim ersten
#      Sehen meist noch "about:blank" und navigiert unmittelbar danach - womit
#      der Autopilot sofort wieder weg war und nie wiederkam.
#   2. Aus demselben Grund griff die Erkennung per Adresse nicht: zum Zeitpunkt
#      des einzigen Blicks stand dort noch gar kein "gm2.rb". Im Starterfenster
#      war deshalb "neuer Tab:" mit LEERER Adresse zu sehen und am Ende die
#      Meldung "Der Genesys-Monitor war nicht dabei", obwohl er offen war.
#
#  JETZT: JEDER Portal-Tab wird in JEDEM Durchlauf betreut, nicht nur neue und
#  nicht nur einmal. StelleAutopilotSicher ist idempotent (es fragt erst
#  window.__rcAutoPilotV2 ab) und kostet bei laufendem Autopiloten nur eine
#  kurze Abfrage. Kein vorzeitiger Abbruch mehr - der Monitor kann jederzeit
#  navigieren und wird beim naechsten Takt wieder versorgt.
#  DAUERBETRIEB (31.07.): Das ESL meldet nach 2-3 Stunden ab. Danach steht die
#  ESL-Anmeldemaske im Tab - mit den vom Browser bereits ausgefuellten
#  Zugangsdaten. Es ist also GENAU DIE Lage wie beim Start, nur dass die Seite
#  schon offen ist. Zu tun ist deshalb auch genau dasselbe: eine echte
#  Maus-Geste erzeugen (dann gibt Edge die Werte frei) und abschicken.
#
#  Warum das NUR hier geht: Eine vertrauenswuerdige Geste kann ausschliesslich
#  die Fernsteuerung erzeugen (Input.dispatchMouseEvent). Ein Klick aus
#  JavaScript gilt als untrusted, und der Browser haelt seine gespeicherten
#  Werte dann zurueck. Der Autopilot in der Seite kann sich also NICHT selbst
#  neu anmelden - deshalb bleibt dieses Fenster offen.
$AnmeldungenMax = 3         # je Zeitfenster - MEHRERE FEHLANMELDUNGEN KOENNEN EIN KONTO SPERREN
$AnmeldeFensterMin = 30     # Laenge des Zeitfensters in Minuten

# ===========================================================================
#  >>> DASHBOARD-EINSTELLUNGEN <<<  (Nutzer-Vorgabe 14.08.2026)
# ===========================================================================
#  "Alle Einstellungen, die ich einstellen kann, moechte ich in der
#   Starter-Datei entscheiden koennen auch."
#
#  Bisher liessen sich diese Schalter NUR im Dashboard setzen (Konfigurator
#  oder F12-Konsole). Auf dem Wandmonitor ist beides unpraktisch, und nach
#  einem Citrix-Reset ist der Browser-Speicher weg - dann standen sie wieder
#  auf Vorgabe. Was hier steht, gewinnt.
#
#  DREI WERTE SIND MOEGLICH, und der dritte ist der wichtige:
#     $true   -> einschalten
#     $false  -> ausschalten
#     $null   -> NICHT ANFASSEN (im Dashboard eingestellt lassen)
#  Ohne das dritte waere jeder Starterlauf ein Zuruecksetzen: wer im Dashboard
#  etwas umstellt, faende es nach dem naechsten Start wieder ueberschrieben.
#
#  WANN ES WIRKT: einmal je Dashboard-Aufbau, sobald das Dashboard laeuft.
#  Danach nicht mehr - Umstellungen von Hand bleiben also den Tag ueber stehen.
#  Der Starter meldet im Fenster, was gesetzt wurde.
# ---------------------------------------------------------------------------
# Genesys-Monitor: Fenster bei fehlenden Daten SELBST oeffnen.
$Genesys              = $false
# Die Seite "Warteschleife" ueberhaupt anzeigen. $false nimmt Seite, Reiter,
# Takt und Datenannahme komplett heraus (Konsole: rcQueueAus).
$Warteschleife        = $null
# Die Seite "Radar" (Burgeroberung) anzeigen.
$RadarSeite           = $null
# Die grosse Abschluss-Buehne bei einem BNT-Verkauf. Ab Werk aus.
$AbschlussPopups      = $false
# Laufband-/Toast-Erinnerungen zu erreichten Vertriebszielen.
$Zielerinnerungen     = $null
# Ligalisten-Fenster nach 12 s ohne Daten selbst oeffnen.
$LigaSelbstOeffnen    = $null
# Automatischer Seitenwechsel (Wandmonitor).
$AutoWechsel          = $null
# Takt des Seitenwechsels in Sekunden (mind. 10).
$AutoWechselSek       = $null
# Welche Seiten der Wechsel durchlaeuft. Gueltig: arena quali radar cockpit
# queue info - und eigene Seiten als 'cp_<id>'. Beispiel:
#   $AutoWechselSeiten = @('arena','radar','queue')
$AutoWechselSeiten    = $null
# Vertriebsblatt nur mit BCR-relevanten Stueck.
$NurBcrImVertrieb     = $null
# Warteschleifen-Alarmstreifen auf ALLEN Seiten ab dieser Stufe (0 = nie, 1-3).
$WarnstreifenAbRang   = $null
# Wie viele Zeilen die Fuehrungs-Bloecke zeigen (3-25).
$FuehrungTopN         = $null
# HANDBETRIEB des Autopiloten: er navigiert dann NICHT mehr selbst (kein
# Projekt-Menue, keine Ansichts-Auswahl) und zeigt nur den Knopf
# "Dashboard starten". Wirkt erst beim NAECHSTEN Seitenaufbau - der Autopilot
# liest den Wert beim Start der Seite, nicht waehrenddessen.
$Handbetrieb          = $null

# ESL-Automatik aus heisst auch: der Autopilot navigiert nicht mehr selbst.
# Sonst waere "$AutoEsl = $false" nur halb aus - der Starter meldet sich nicht
# mehr an, der Autopilot klickt sich aber weiter durchs Projekt-Menue. Ein
# ausdruecklich gesetztes $Handbetrieb gewinnt, damit die feinere Einstellung
# nicht ueberfahren wird.
if (-not $AutoEsl -and $null -eq $Handbetrieb) { $Handbetrieb = $true }

# ---------------------------------------------------------------------------
#  Stundenmail (04.08.2026)
# ---------------------------------------------------------------------------
#  Das Dashboard schreibt je voller Stunde drei Dateien in den Download-Ordner
#  (ESL-Report-*.html / .xlsx / .png). Verschickt hat sie bis zum 03.08. NIEMAND:
#  esl_mail_report.ps1 lag im Paket, wurde aber von keiner Stelle aufgerufen -
#  dieselbe Fehlerklasse wie seinerzeit EinAnmeldeVersuch.
#  Dieses Fenster laeuft ohnehin dauerhaft, es ist also die naheliegende Stelle.
# Empfaenger der Stundenmail. Erlaubt sind (seit 05.08.):
#   - eine Adresse            'veysel.yarba@regiocom.com'
#   - MEHRERE, mit Semikolon  'a@regiocom.com; b@regiocom.com'
#   - der NAME einer Verteilergruppe, so wie er im Adressbuch steht:
#                             'ESL Team Alanya'
# Outlook loest den Namen gegen das Adressbuch auf. Wird er dort NICHT gefunden,
# bricht esl_mail_report.ps1 ab und nennt ihn - es geht dann bewusst gar keine
# Mail raus, statt nur an einen Teil der Mannschaft.
$MailAn         = 'veysel.yarba@regiocom.com'
# Kopie (CC), gleiche Schreibweisen. Leer lassen = keine Kopie.
$MailCc         = ''
# ---------------------------------------------------------------------------
#  ZUSCHNITT DER MANNSCHAFTS-MAIL (neu 09.08.)
# ---------------------------------------------------------------------------
#  Bis hierhin konnte diese Datei dem Dashboard nur sagen, WER die Mail bekommt -
#  nicht, WELCHE Zahlen drinstehen. Standort, Stack und Team liessen sich
#  ausschliesslich im Konfigurator (Zahnrad -> Report) einstellen. Wer die
#  Stundenmail ueber den Starter fuehrt, hatte damit gar keinen Filter.
#
#  Leer lassen oder 'ALL' = kein Filter (alles).
#  Standort: das KUERZEL, nicht der Name -> AL ADP B E P SER ZWT NBB SKA
#  Stack:    wie im Mapping, z.B. 'VKD_Tech', 'MF_CARE', 'VUM'
#            Ein GANZES Projekt (05.10.): 'P:kabel', 'P:mobile' oder 'P:um' -
#            nimmt alle Mitarbeiter dieses ESL-Projekts, auch die ohne
#            Stack-Zuordnung in der Mitarbeiter-Excel.
#  Team:     der Team-NAME aus der Mitarbeiter-Excel, z.B. 'VKD-TECH-83'
#            (NICHT die Nummer aus der Ligaliste - danach wird nicht gefiltert)
#
#  Ein Zuschnitt, der 0 Zeilen trifft, wird uebersprungen und im Starterfenster
#  gemeldet. Frueher entstand daraus ein halber Dateisatz und der Versand fiel
#  wortlos aus - genau der Fehler, der zu diesem Umbau gefuehrt hat.
$MailStandort   = ''
$MailStack      = ''
$MailTeam       = ''
# Haengt zusaetzlich die schlanke Mappe regiocom_ESL_Reporting an (nur die
# Block-Ansicht Standort -> Stacks -> Teams, Vertrieb und Qualitaet getrennt).
# Ab Werk aus - es kommt nichts ungefragt dazu.
$MailReportingMappe = $false
# ZWEITE Mail an die LEITUNG - mit der vollstaendigen Excel-Mappe im Anhang.
# Bewusst getrennt von $MailAn: die Mannschafts-Mail bleibt bei den zwei Bildern
# (Nutzer-Vorgabe 04.08.). Leer lassen = keine Leitungs-Mail.
$MailAnLeitung  = ''
# Eigener Zuschnitt fuer die Leitung. Sinn der Trennung: die Mannschaft sieht
# ihren eigenen Standort, die Leitung meist alles - oder umgekehrt einen anderen
# Ausschnitt. Leer = kein Filter.
$MailStandortLeitung = ''
$MailStackLeitung    = ''
$MailTeamLeitung     = ''
$MailReportingMappeLeitung = $false
# DRITTE Mail an einen TEAMS-KANAL. Die Adresse steht im Kanal unter
# "..." -> "E-Mail-Adresse abrufen" und sieht etwa so aus:
#   1a2b3c4d.firma.onmicrosoft.com@emea.teams.ms
# Eigener Aufruf und NICHT einfach als Kopie der Mannschafts-Mail - Grund:
# esl_mail_report.ps1 loest seit 05.08. alle Empfaenger vor dem Senden auf und
# verschickt bei EINEM unbekannten Empfaenger GAR NICHTS. Stuende die
# Kanaladresse im Cc und Outlook kennt sie nicht, fiele die Mannschafts-Mail
# gleich mit aus. Leer lassen = kein Kanal-Beitrag.
$MailAnTeams    = ''
# Eigener Zuschnitt fuer den Teams-Kanal. Leer = kein Filter.
$MailStandortTeams = ''
$MailStackTeams    = ''
$MailTeamTeams     = ''
$MailReportingMappeTeams = $false
# ===========================================================================
#  >>> HAUPTSCHALTER DER STUNDENMAIL <<<
#  Alles oben Eingestellte (Empfaenger, Standort, Stack, Team, Reporting-Mappe)
#  wirkt NUR, wenn diese eine Zeile auf $true steht. Steht sie auf $false, wird
#  nichts davon gelesen und es geht keine Mail raus.
# ===========================================================================
# AB WERK AUS (Nutzer-Vorgabe 06.08. spaetabends: "automatisch mail versand oder
# download regt mich auf! ich will nicht dass er automatisch aktiv ist jedes
# mal!"). Zum Einschalten hier auf $true setzen - dann laeuft sie zwischen
# $MailVonStunde und $MailBisStunde einmal je Stunde.
# Unabhaengig davon geht eine Mail jederzeit von Hand: esl_mail_report.ps1
# doppelklicken (oeffnet die Mail nur) bzw. mit -Senden aufrufen.
$MailAktiv      = $false                         # <<< HIER auf $true setzen, sonst geht KEINE Mail raus
# Seit 07.08. faehrt jedes Projekt seinen EIGENEN Browser (Abschnitt 0b). Damit
# koennen drei Starter gleichzeitig auf einem Rechner laufen - und jeder haette
# seine eigene Stundenmail verschickt. Der Empfaengerkreis ist aber die ganze
# Mannschaft und bekaeme dieselbe Stunde dreimal. Die Mail bleibt deshalb beim
# KABEL-Starter; die anderen beiden sagen es einmal deutlich, statt still nichts
# zu tun (ihr Tab-Filter faende ohnehin kein Kabel-Dashboard in ihrem Browser).
if ($MailAktiv -and $ProjektWahl -ne 'kabel') {
    $MailAktiv = $false
    Warn "Stundenmail laeuft nur im Kabel-Starter - in diesem ($ProjektName) abgeschaltet."
}
$MailVonStunde  = 7                              # erst ab dieser Stunde verschicken
$MailBisStunde  = 20                             # nach dieser Stunde nicht mehr
$MailAbMinute   = 6                              # Das Dashboard erzeugt den Report nur in den
                                                 # ersten 5 Minuten einer Stunde (v22.js: getMinutes()<5).
                                                 # Frueher zu suchen faende nur den Stand der Vorstunde.
# ---- VORLAUF NACH DEM START (Nutzer-Vorgabe 09.08.) ----
# "Er soll jedes Mal, wenn ich das Dashboard starte, 15 Minuten spaeter die
#  erste E-Mail rausschicken. Es muessen ja erst mal Daten geladen werden."
# Die ERSTE Mail geht deshalb nicht zur naechsten vollen Stunde raus, sondern
# sobald der Vorlauf um ist UND die Daten wirklich da sind - danach laeuft der
# gewohnte Stundentakt weiter.
$MailStartWarteMin   = 15
# Ohne Ligalisten-Daten waeren CS, TNPS, AHT, AQ und FQ im Report leer, das
# Blatt saehe aber vollstaendig aus. Deshalb wird dann gar nicht verschickt.
# Auf $false setzen, wenn eine Mail auch ohne Qualitaets-Kennzahlen soll.
$MailLigaPflicht     = $true
# Ein alter Bestand ist so schlecht wie keiner - die Zahlen saehen vollstaendig
# aus, waeren aber von vor Stunden.
$MailLigaMaxAlterMin = 30
# ABER NICHT EWIG WARTEN: Der KPI-Crawler klickt seit v6 NICHTS von selbst - er
# wartet auf einen Ok-Klick auf der Ligaliste. Bleibt der aus, kaeme ohne diese
# Frist von 7 bis 21 Uhr keine einzige Mail. Nach so vielen Minuten geht sie
# deshalb trotzdem raus, und der Starter sagt deutlich, was fehlt.
$MailLigaFristMin    = 45
# Das ESL ist die Quelle der VERKAUFSZAHLEN und hatte bisher gar keine
# Altersgrenze - der Report saehe vollstaendig aus und zeigte den eingefrorenen
# Stand von vor Stunden.
$MailEslMaxAlterMin  = 15
$letzteMailStunde = ''
$ersteMailRaus    = $false   # der Vorlauf-Versand ist genau EINMAL je Starterlauf
$vorlaufVersuche  = 0        # Deckel, falls der Vorlauf-Versand dauerhaft scheitert
$letzterWartegrund = ''      # damit dieselbe Zeile nicht alle 20 s im Fenster steht
$wartetSeit       = $null    # seit wann derselbe Grund gilt (fuer die 30-Min-Erinnerung)
Write-Host ""
# Einmal beim Start sagen, woran man ist. Eine stumm abgeschaltete Automatik
# ist genauso aergerlich wie eine ungewollt laufende - dann sucht man spaeter,
# warum keine Mail kommt.
if ($MailAktiv) {
    Gut "Stundenmail: EIN (${MailVonStunde}-${MailBisStunde} Uhr, ab Minute $MailAbMinute)."
    Schritt "  Erste Mail: $MailStartWarteMin Min nach dem Dashboard-Start, sobald Ligalisten-Daten da sind."
    if (-not $MailLigaPflicht) {
        Warn "  Ligalisten-Pflicht ist AUS - es kann eine Mail ohne Qualitaets-Kennzahlen rausgehen."
    }
    # Den Zuschnitt beim Start NENNEN. Ein falsch getippter Standort oder ein
    # Teamname, den es nicht mehr gibt, trifft 0 Zeilen - dann kommt keine Mail,
    # und ohne diese Zeile sucht man den Fehler ueberall, nur nicht hier.
    $zNennen = {
        param($s, $k, $t)
        $p = @(); if ($s) { $p += "Standort $s" }; if ($k) { $p += "Stack $k" }; if ($t) { $p += "Team $t" }
        if ($p.Count) { return ($p -join ', ') } else { return 'ohne Filter (alles)' }
    }
    Schritt "  Mannschaft ($MailAn): $(& $zNennen $MailStandort $MailStack $MailTeam)"
    if ($MailAnLeitung) { Schritt "  Leitung ($MailAnLeitung): $(& $zNennen $MailStandortLeitung $MailStackLeitung $MailTeamLeitung)" }
    if ($MailAnTeams)   { Schritt "  Teams-Kanal: $(& $zNennen $MailStandortTeams $MailStackTeams $MailTeamTeams)" }
} else {
    Schritt "Stundenmail: AUS. Nichts wird von selbst verschickt oder heruntergeladen."
    Schritt "  Einschalten: in dieser Datei `$MailAktiv = `$true setzen."
    Schritt "  Einzelne Mail von Hand: esl_mail_report.ps1 (ohne -Senden nur oeffnen)."
    # DER STILLE WIDERSPRUCH (Nutzer-Befund 09.08.: "Obwohl ich das alles
    # ausgefuellt habe, sendet es trotzdem keine E-Mail").
    # Wer Empfaenger, Standort, Stack, Team und die Reporting-Mappe eintraegt,
    # WILL offensichtlich Mail. Der Schalter steht aber ab Werk auf $false und
    # geht zwischen den langen Kommentarbloecken unter. Ohne diesen Hinweis
    # sucht man den Fehler in den Filtern, im Dashboard oder in Outlook - also
    # ueberall, nur nicht an der einen Zeile, die es wirklich ist.
    $konfiguriert = @()
    if ($MailStandort)          { $konfiguriert += "Standort $MailStandort" }
    if ($MailStack)             { $konfiguriert += "Stack $MailStack" }
    if ($MailTeam)              { $konfiguriert += "Team $MailTeam" }
    if ($MailReportingMappe)    { $konfiguriert += 'Reporting-Mappe' }
    if ($MailAnLeitung)         { $konfiguriert += 'Leitungs-Mail' }
    if ($MailAnTeams)           { $konfiguriert += 'Teams-Kanal' }
    if ($konfiguriert.Count -gt 0) {
        Write-Host ""
        Warn "ACHTUNG: Es ist etwas eingestellt, was NUR bei eingeschalteter Stundenmail wirkt:"
        Warn ("    " + ($konfiguriert -join ', '))
        Warn "  Diese Einstellungen werden gerade NICHT benutzt - es geht keine Mail raus."
        Warn "  Zum Einschalten in dieser Datei:   `$MailAktiv = `$true"
        Write-Host ""
    }
}
# Was laeuft automatisch, was nicht - einmal im Klartext. Ohne diese Zeile
# sucht man einen abgeschalteten Teil im Code statt in dieser Datei.
$anAus = { param($b) if ($b) { 'AN ' } else { 'AUS' } }
Schritt ("Automatisierung:  ESL " + (& $anAus $AutoEsl) +
         " | Dashboard " + (& $anAus $AutoDashboard) +
         " | Ligaliste " + (& $anAus $AutoLigaliste) +
         " | Genesys " + (& $anAus $AutoGenesys))
if (-not ($AutoEsl -and $AutoDashboard -and $AutoLigaliste -and $AutoGenesys)) {
    Schritt "  Umstellen im Block >>> AUTOMATISIERUNG <<< am Anfang dieser Datei."
}
Gut "Ich bleibe ab jetzt offen und melde nach einem Sitzungsablauf automatisch neu an."
Schritt "  Pruefung alle $DauerTaktSek s. Zum Beenden dieses Fenster schliessen."
Write-Host ""
$gesehen = @{}          # Tab-Id -> zuletzt gemeldete Adresse
$nachgelegt = 0
$gmGefunden = $false
$anmeldungen = @()      # Zeitstempel der abgeschickten Anmeldungen (Sperr-Schutz)
$letzterZustand = ''    # damit das Fenster nicht mit derselben Zeile volllaeuft
$aufgegeben = $false
$leereRunden = 0        # aufeinanderfolgende Durchlaeufe ohne einen einzigen http(s)-Tab
while ($true) {
    # Wartezeit NICHT verschlafen: neue Tabs werden dabei sofort verankert,
    # damit der KPI-Crawler direkt nach dem Klick auf "KPI-Quelle" anlaeuft.
    WarteUndVersorgeNeueTabs $DauerTaktSek
    $alle = @()
    # StelleAutopilotSicher braucht das ganze Tab-Objekt (webSocketDebuggerUrl),
    # nicht nur die Id - deshalb hier die volle Liste holen, nicht TabIds.
    try {
        # POSITIVLISTE statt Sperrliste (12.08.). Vorher stand hier eine Liste
        # unerwuenschter Schemata (devtools*, chrome*, edge*) - und im Livebetrieb
        # kam trotzdem an:
        #     Autopilot nachgelegt in: chrome-extension://.../DevToolsPlugin.html
        # Eine Sperrliste ist hier grundsaetzlich falsch: sie muss JEDE Variante
        # kennen, die es gibt oder kuenftig geben wird (chrome-extension:,
        # devtools:, edge:, about:, blob:, view-source:, file: ...), und der
        # zweite Filter weiter unten prueft ausserdem 'chrome:*' MIT Doppelpunkt,
        # worauf 'chrome-extension://' gar nicht passt.
        # Der Autopilot arbeitet ausschliesslich auf esl.regiocom.net und
        # ccs.vodafone.de, also auf http(s). Alles andere ist per Bauart raus.
        $alle = @(Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json" -TimeoutSec 5) |
                Where-Object { $_.type -eq 'page' -and
                               ($_.url -like 'http://*' -or $_.url -like 'https://*') }
    } catch { }
    # Ist Edge zu? Dann hat dieses Fenster keine Aufgabe mehr.
    # ABER: nicht beim ersten leeren Durchlauf aussteigen. Edge meldet einen
    # frisch geoeffneten Tab zuerst mit LEERER Adresse - der faellt durch die
    # Positivliste, und waehrend einer Navigation kann das kurzzeitig fuer ALLE
    # Tabs gelten. Ein sofortiger Ausstieg wuerde den Waechter dann mitten im
    # Betrieb beenden, und niemand meldet die Sitzung mehr neu an.
    if (-not $alle -or $alle.Count -eq 0) {
        $leereRunden++
        if ($leereRunden -ge 3) {
            Schritt "Keine Portal-Tabs mehr offen - der Waechter beendet sich."
            break
        }
        continue
    }
    $leereRunden = 0
    # Einstellungen aus dieser Datei ins Dashboard schreiben. Steht bewusst VOR
    # der Tab-Schleife und laeuft in JEDEM Durchlauf: das Dashboard ist beim
    # ersten Durchlauf noch gar nicht da, und nach einem Neuladen der Seite ist
    # die Marke __rcStarterCfg wieder weg. Die Funktion steigt von selbst aus,
    # sobald sie einmal gegriffen hat - sie kostet dann einen kurzen Aufruf.
    try { WendeEinstellungenAn $alle } catch { }
    # Anker-Verbindungen aufraeumen: Tabs, die es nicht mehr gibt, halten sonst
    # bis zum Programmende einen offenen Socket.
    $lebendeIds = @{}
    foreach ($t in $alle) { $lebendeIds["$($t.id)"] = $true }
    foreach ($k in @($AnkerWs.Keys)) { if (-not $lebendeIds.ContainsKey($k)) { AnkerLoesen $k } }
    # Ligaliste und Genesys-Monitor: fehlen sie, werden sie nachgeholt. Das lief
    # frueher nur EINMAL beim Start bzw. gar nicht - siehe StelleLigalisteSicher.
    if ($AutoLigaliste) {
        try { if (StelleLigalisteSicher $alle) { Schritt "  Ligaliste fehlte - aus dem Dashboard heraus geoeffnet." } } catch { }
        # Tab da, aber das Dashboard bekommt nichts (05.10.): neu verbinden.
        try { if (StelleLigalisteVerbunden $alle) { Schritt "  Ligaliste hing nicht am Dashboard - neu verbunden." } } catch { }
    }
    if ($AutoGenesys) {
        try { if (StelleGenesysSicher $alle) { Schritt "  Genesys-Monitor fehlte - aus dem Dashboard heraus geoeffnet." } } catch { }
    }
    # Watchdog-Alarm in JEDEM Takt pruefen (17.08.) - unabhaengig von Stunde,
    # Mailfenster und Vorlauf. Eine Stoerung um 03:00 muss um 03:00 melden,
    # nicht erst zur naechsten vollen Stunde im Mailfenster 7-20 Uhr.
    try { PruefeWatchdogAlarm $alle } catch { }
    # Herzschlag von aussen (17.08.): treibt das Dashboard an, wenn der Browser
    # seine eigenen Timer gedrosselt oder ein Dialog sie angehalten hat.
    try { Herzschlag $alle } catch { }
    foreach ($t in $alle) {
        $url = "$($t.url)"
        # Adresswechsel melden - so ist im Fenster nachvollziehbar, wohin ein Tab
        # gewandert ist (z.B. about:blank -> start.rb -> gm2.rb).
        if ($gesehen[$t.id] -ne $url) {
            if ($gesehen.ContainsKey($t.id)) { Schritt "  Tab wechselt nach: $url" }
            else { Schritt "  Tab gesehen: $url" }
            $gesehen[$t.id] = $url
        }
        # Browser-eigene Seiten hier ERNEUT aussortieren (Befund 04.08. aus dem
        # Livebetrieb). Der Filter beim Holen der Tab-Liste greift nicht immer:
        # Edge meldet einen frisch geoeffneten Tab zuerst mit LEERER Adresse, der
        # kommt damit durch, und erst danach steht dort edge://downloads-hub/ oder
        # devtools://... Im Fenster stand deshalb wiederholt "Autopilot nachgelegt
        # in: edge://downloads-hub/" — dort hat er nichts zu suchen und richtet
        # nichts aus. Hier ist die Adresse aktuell, also wird hier geprueft.
        # Auch hier POSITIVLISTE (12.08.), aus demselben Grund wie oben: die
        # frueher hier stehende Sperrliste prueste 'chrome:*' mit Doppelpunkt und
        # liess 'chrome-extension://...' durch. Diese Pruefung bleibt trotzdem
        # noetig - die Adresse kann sich zwischen dem Holen der Liste und diesem
        # Moment geaendert haben (Befund 04.08.: leere Adresse beim Holen, danach
        # edge://downloads-hub/).
        if ($url -notlike 'http://*' -and $url -notlike 'https://*') {
            continue
        }
        # Wirkung PRUEFEN statt nur ausloesen: der Rueckgabewert sagt, ob wirklich
        # nachgelegt werden musste. Frueher wurde er mit [void] verworfen.
        # DAUERHAFT verankern (16.08.): eine offene CDP-Verbindung je Tab haelt
        # den Page.addScriptToEvaluateOnNewDocument-Eintrag am Leben, damit der
        # Autopilot in JEDEM neuen Dokument sofort laeuft statt erst beim
        # naechsten Waechter-Durchlauf. Details am Abschnitt 4b.
        if (AnkerSetzen $t) { Schritt "  Autopilot dauerhaft verankert in: $url" }
        # Netz darunter: greift, wenn die Ankerverbindung abgerissen ist.
        if (StelleAutopilotSicher $t) {
            $nachgelegt++
            Schritt "  Autopilot nachgelegt in: $url"
        }
        if ($url -like '*gm2.rb*' -or $url -like '*MONITOR_2*') {
            if (-not $gmGefunden) {
                $gmGefunden = $true
                Gut "  Genesys-Monitor gefunden und versorgt - der Warteschleifen-Crawler startet dort selbst."
            }
        }

        # ---- Ligaliste: Crawler wartet auf einen Ok-Klick? Dann klickt der
        # Starter EINMAL (vertrauenswuerdige CDP-Geste, 1x/5 Min je Tab). ----
        if ($AutoLigaliste -and $url -like '*liga_listen*') {
            if (StelleLigaKlickSicher $t) { Schritt "  Ligaliste: Ok-Klick abgesetzt (Mitschnitt fehlte)." }
        }

        # ---- ESL: steht da eine Anmeldemaske? ----
        if ($AutoEsl -and $url -like '*regiocom*') {
            $tat = EinAnmeldeVersuch $t
            if ($tat -eq 'keine-maske') {
                if ($letzterZustand -ne 'ok') { Gut ("  ESL angemeldet (" + (Get-Date -Format 'HH:mm') + ")."); $letzterZustand = 'ok' }
                $aufgegeben = $false          # neue Sitzung -> Sperr-Schutz wieder scharf
                # Angemeldet, Export-Ansicht offen, aber kein Dashboard? Dann
                # spielt der Waechter es direkt ein (Befund "Starter laeuft,
                # Dashboard fehlt trotzdem" - Details an der Funktion selbst).
                if ($AutoDashboard -and (StelleDashboardSicher $t)) { Schritt "  Dashboard direkt eingespielt in: $url" }
            }
            elseif ($tat -eq 'laedt') { }     # nichts melden, das ist ein Zwischenzustand
            elseif ($aufgegeben) { }          # schon aufgegeben, nicht weiter versuchen
            else {
                # Anmeldemaske steht. Erst den Sperr-Schutz pruefen: nur
                # $AnmeldungenMax Absendungen je $AnmeldeFensterMin Minuten.
                # Gezaehlt werden ABGESCHICKTE Anmeldungen, nicht Durchlaeufe -
                # sonst verbraucht sich das Kontingent, ohne dass etwas passiert.
                $grenze = (Get-Date).AddMinutes(-$AnmeldeFensterMin)
                $anmeldungen = @($anmeldungen | Where-Object { $_ -gt $grenze })
                if ($anmeldungen.Count -ge $AnmeldungenMax) {
                    Warn "  ESL-Anmeldung: $AnmeldungenMax Versuche in $AnmeldeFensterMin Minuten - ich hoere auf."
                    Warn "  Stimmt das in Edge gespeicherte Passwort noch? Einmal von Hand anmelden."
                    $aufgegeben = $true
                    $letzterZustand = 'aufgegeben'
                }
                elseif ($tat -eq 'abgeschickt') {
                    $anmeldungen += (Get-Date)
                    Schritt ("  ESL war abgemeldet - Zugangsdaten abgeschickt (" + $anmeldungen.Count + "/" + $AnmeldungenMax + ").")
                    $letzterZustand = 'gesendet'
                    Start-Sleep -Seconds 4
                    if (PruefeEingeloggt) {
                        Gut "  Wieder angemeldet - der Autopilot uebernimmt (Menue, Export, Dashboard)."
                        $letzterZustand = 'ok'
                    }
                }
                elseif ($tat -eq 'kein-passwort') {
                    if ($letzterZustand -ne 'kein-pw') {
                        Warn "  ESL-Anmeldemaske steht, aber Edge gibt kein Passwort frei."
                        Warn "  Es wird NICHTS abgeschickt (das waere nur ein Fehlversuch)."
                        Warn "  Bitte einmal von Hand anmelden und speichern lassen."
                        $letzterZustand = 'kein-pw'
                    }
                }
            }
        }
    }

    # ---- Stundenmail (einmal je voller Stunde) ----
    # Hier, NACH der Tab-Schleife: die Tab-Liste ist frisch und der Autopilot in
    # diesem Durchlauf bereits nachgelegt. Der 20-s-Takt trifft jede Minute
    # zuverlaessig, es geht also keine Stunde verloren.
    if ($MailAktiv) {
        $jetzt = Get-Date
        $stundenSchluessel = $jetzt.ToString('yyyy-MM-dd-HH')
        $imFenster = ($jetzt.Hour -ge $MailVonStunde -and $jetzt.Hour -le $MailBisStunde)
        # ZWEI Anlaesse, in dieser Reihenfolge:
        #  1. der VORLAUF-Versand nach dem Start - genau einmal je Starterlauf,
        #     unabhaengig von der vollen Stunde (Nutzer-Vorgabe: "15 Minuten
        #     spaeter die erste E-Mail"). Auf die naechste Stunde zu warten
        #     hiesse bei einem Start um 08:10 erst um 09:06 zu senden.
        #  2. der gewohnte Stundentakt.
        $anlass = ''
        if ($imFenster) {
            if (-not $ersteMailRaus)                        { $anlass = 'vorlauf' }
            elseif ($stundenSchluessel -ne $letzteMailStunde -and
                    $jetzt.Minute -ge $MailAbMinute)        { $anlass = 'stunde' }
        }
        if ($anlass) {
            # BEREITSCHAFT ZUERST - und zwar BEVOR der Stundenschluessel gesetzt
            # wird. "Noch nicht so weit" ist kein Fehlversuch, sondern ein
            # spaeter-nochmal: wuerde die Stunde hier verbraucht, fiele sie
            # ersatzlos aus, nur weil die Ligaliste zwei Minuten laenger brauchte.
            $lage = MailNochNichtBereit $alle
            if ($lage.grund) {
                # Nur bei AENDERUNG melden, sonst steht dieselbe Zeile alle 20 s
                # im Fenster (derselbe Grund wie beim Tab-Zustand weiter oben).
                # ABER: bleibt der Grund stundenlang derselbe (haengende
                # Ligaliste), stuende er genau EINMAL da und danach nie wieder -
                # das saehe aus wie "laeuft". Deshalb alle 30 Min erneut, mit
                # Gesamtdauer.
                $jetztWarten = (Get-Date)
                if ($letzterWartegrund -ne $lage.grund) {
                    Schritt "  Stundenmail wartet: $($lage.grund)"
                    $letzterWartegrund = $lage.grund
                    $wartetSeit = $jetztWarten
                } elseif ($wartetSeit -and ($jetztWarten - $wartetSeit).TotalMinutes -ge 30) {
                    $dauerMin = [int]($jetztWarten - $wartetSeit).TotalMinutes
                    Warn "  Stundenmail wartet seit $dauerMin Minuten: $($lage.grund)"
                    $wartetSeit = $jetztWarten
                }
            } else {
                $letzterWartegrund = ''
                $wartetSeit = $null
                # STARTER-NEUSTART ist kein Dashboard-Start (Befund 09.08.).
                # $ersteMailRaus lebt nur im Prozess. Wird der Starter mittags
                # neu gestartet, waehrend Edge weiterlaeuft, waere der Anlass
                # wieder 'vorlauf' - und weil der $MailAbMinute nicht prueft,
                # ginge um 10:22 eine zweite Mail raus, obwohl um 10:06 schon
                # eine kam. Massgeblich ist deshalb das ALTER DES DASHBOARDS,
                # nicht das Alter des Starters.
                if ($anlass -eq 'vorlauf' -and $lage.laeuftMin -ge 0 -and
                    $lage.laeuftMin -ge (2 * $MailStartWarteMin)) {
                    $ersteMailRaus = $true
                    Schritt "  Dashboard laeuft schon $($lage.laeuftMin) Min - kein Start-Vorlauf, es gilt der Stundentakt."
                    $anlass = ''
                }
            }
            if (-not $lage.grund -and $anlass) {
                if ($lage.ohneLiga) {
                    Warn "  Die Ligalisten-Daten fehlen weiterhin - die Mail geht OHNE Qualitaets-Kennzahlen raus."
                    Warn "  Abhilfe: auf der Ligaliste einmal ""Ok"" klicken, der Crawler klickt nichts von selbst."
                }
                if ($anlass -eq 'vorlauf') {
                    Schritt "Erste Mail nach dem Start ($($jetzt.ToString('HH:mm')), Vorlauf $MailStartWarteMin Min) ..."
                } else {
                    # Schluessel VOR dem Versuch setzen: sonst wiederholt sich ein
                    # fehlgeschlagener Versuch alle 20 Sekunden bis zum Stundenwechsel -
                    # und jeder davon oeffnet Outlook erneut.
                    $letzteMailStunde = $stundenSchluessel
                    Schritt "Stundenmail $($jetzt.ToString('HH:mm')) ..."
                }
                $erg = SchickeStundenmail $alle
                # (Der Watchdog-Alarm wird unabhaengig davon in JEDEM Takt
                #  geprueft - siehe weiter unten. Er haengt nicht an der
                #  Stundenlogik: eine Stoerung um 03:00 muss um 03:00 melden.)
                # Der VORLAUF gilt erst als erledigt, wenn wirklich eine Mail
                # rausging. Vorher wurde $ersteMailRaus vor dem Aufruf gesetzt und
                # der Rueckgabewert mit [void] verworfen - scheiterte der Versand
                # (Zuschnitt trifft 0 Zeilen, rcReportNow schlaegt fehl, Outlook
                # antwortet nicht), stand "Erste Mail nach dem Start" im Fenster,
                # es kam aber nie eine. Mit Deckel, damit ein dauerhaft kaputter
                # Versand nicht alle 20 s Outlook oeffnet - dasselbe Muster wie
                # der Sperrschutz bei der Anmeldung.
                if ($anlass -eq 'vorlauf') {
                    if ($erg) {
                        $ersteMailRaus = $true
                        $letzteMailStunde = $stundenSchluessel
                    } else {
                        $vorlaufVersuche++
                        Warn "  Vorlauf-Mail nicht rausgegangen ($vorlaufVersuche. Versuch von 3)."
                        if ($vorlaufVersuche -ge 3) {
                            $ersteMailRaus = $true
                            $letzteMailStunde = $stundenSchluessel
                            Warn "  Vorlauf nach 3 Versuchen aufgegeben - ab jetzt nur noch der Stundentakt."
                        }
                    }
                }
            }
        }
    }
}
if ($nachgelegt -gt 0) { Gut "$nachgelegt mal Autopilot nachgelegt." }
if (-not $gmGefunden) {
    Write-Host "  Der Genesys-Monitor war nicht dabei. Das Dashboard oeffnet ihn nur," -ForegroundColor DarkGray
    Write-Host "  wenn die Warteschleifen-Seite Daten braucht - und nur EINMAL, rund 25 s" -ForegroundColor DarkGray
    Write-Host "  nach dem Start. Wurde das Fenster vom Popup-Blocker abgewiesen, hilft" -ForegroundColor DarkGray
    Write-Host "  im Dashboard ein Klick auf 'Quelle oeffnen' (Seite Warteschleife)" -ForegroundColor DarkGray
    Write-Host "  oder rcOpenQueueQuelle() in der Konsole." -ForegroundColor DarkGray
}

Write-Host ""
Gut "Fertig. Edge arbeitet jetzt selbstaendig weiter."
Write-Host "  Beim ERSTEN Mal: im neuen Edge-Profil einmal von Hand anmelden und" -ForegroundColor DarkGray
Write-Host "  das Passwort speichern lassen - danach geht die Anmeldung von allein." -ForegroundColor DarkGray
Write-Host ""
Start-Sleep -Seconds 3
