# HINWEIS: Diese Datei wird aus dem PowerShell-Teil von ESL_Start.cmd erzeugt.
# NICHT von Hand aendern — Aenderungen gehoeren in die .cmd (hinter #PSSTART),
# danach "node ps1_erzeugen.js" ausfuehren.
# Erzeugt am 31.7.2026, 20:32:00 aus ESL_Start.cmd.
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
       croco_crawler.js (optional) * genesys_monitor_crawler.js (optional,
       fuer die Warteschleifen-Seite)

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
$DebugPort   = 9222        # Fernsteuerungs-Port (nur lokal erreichbar)
# -----------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$Basis = Split-Path -Parent $MyInvocation.MyCommand.Path

function Schritt($t) { Write-Host "  $t" -ForegroundColor Cyan }
function Gut($t)     { Write-Host "  $t" -ForegroundColor Green }
function Warn($t)    { Write-Host "  $t" -ForegroundColor Yellow }
function Fehler($t)  { Write-Host "  $t" -ForegroundColor Red }

Write-Host ""
Write-Host "  ESL Live-Arena - Start" -ForegroundColor White
Write-Host "  ----------------------" -ForegroundColor DarkGray

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
function LiesBinaerBase64($name) {
    $p = Join-Path $Basis $name
    try { if (-not (Test-Path -LiteralPath $p)) { Warn "nicht vorhanden (optional): $name"; return '' } }
    catch { return '' }
    try {
        $bytes = [System.IO.File]::ReadAllBytes($p)
        if ($bytes.Length -lt 10240) { Warn ("$name ist nur " + [math]::Round($bytes.Length/1024) + " KB - vermutlich unvollstaendig."); return '' }
        Gut ("gefunden: $name  (" + [math]::Round($bytes.Length/1024) + " KB)")
        return [Convert]::ToBase64String($bytes)
    } catch { Fehler ("$name nicht lesbar: " + $_.Exception.Message); return '' }
}
Schritt "Dateien werden gelesen ..."
$Autopilot    = LiesDatei 'esl_autopilot.user.js' $true  15  'AUTOPILOT'
$Dashboard    = LiesDatei 'esl_live_arena_v22.js' $true  500 'live-arena'
$KpiCrawler   = LiesDatei 'kpi_crawler.js'        $false 20  'KPI-Crawler'
# CroCo ist vorerst abgeschaltet (Wunsch 28.07.2026). Zum Reaktivieren die
# naechste Zeile wieder einkommentieren UND in esl_autopilot.user.js
# CFG.CROCO_AN auf true setzen — beides ist noetig.
# $CrocoCrawler = LiesDatei 'croco_crawler.js'      $false 5   'Croco-Crawler'
$CrocoCrawler = ''
$GmCrawler    = LiesDatei 'genesys_monitor_crawler.js' $false 5 'Warteschleifen-Crawler'
$MappingB64   = LiesBinaerBase64 'Mitarbeiter_IDS_Final_komplett.xlsx'
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
$Profil = Join-Path $Basis 'EdgeProfil'
if (-not (Test-Path $Profil)) { New-Item -ItemType Directory -Path $Profil | Out-Null }

function FernsteuerungBereit($port) {
    try { $r = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/version" -TimeoutSec 2; return $null -ne $r } catch { return $false }
}

if (FernsteuerungBereit $DebugPort) {
    Gut "Edge mit Fernsteuerung laeuft bereits (Port $DebugPort)."
} else {
    Schritt "Edge wird gestartet ..."
    # ACHTUNG: $args ist in PowerShell eine automatische Variable -> eigener Name
    $edgeArgs = @(
        "--remote-debugging-port=$DebugPort",
        "--user-data-dir=`"$Profil`"",
        "--no-first-run", "--no-default-browser-check",
        "--disable-features=Translate",
        "`"$EslUrl`""
    )
    Start-Process -FilePath $Edge -ArgumentList $edgeArgs | Out-Null
    $wartete = 0
    while (-not (FernsteuerungBereit $DebugPort) -and $wartete -lt 30) { Start-Sleep -Milliseconds 500; $wartete++ }
    if (-not (FernsteuerungBereit $DebugPort)) {
        Fehler "Edge-Fernsteuerung nicht erreichbar (Port $DebugPort)."
        Warn  "Moeglich: die IT sperrt den Debug-Port. Dann bitte den Lesezeichen-Weg nutzen (esl_start.html)."
        Read-Host "  [Enter]"; exit 1
    }
    Gut "Edge laeuft (eigenes Profil: $Profil)"
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

# ---------- 5) Das Auto-Injektions-Paket bauen ----------
# Wichtig: Page.addScriptToEvaluateOnNewDocument sorgt dafuer, dass dieses
# Script bei JEDEM Seitenaufbau automatisch laeuft - genau wie eine Erweiterung.
# Der Dashboard-/Crawler-Code reist als window.__rcFiles direkt mit.
function AlsJsText($s) { return ($s | ConvertTo-Json -Compress) }   # sicher escapen

$Paket = @"
window.__rcFiles = {
  dash:  $(AlsJsText $Dashboard),
  kpi:   $(AlsJsText $KpiCrawler),
  croco: $(AlsJsText $CrocoCrawler),
  gm:    $(AlsJsText $GmCrawler),
  mapping: $(AlsJsText $MappingB64)
};
window.__rcMail = $(AlsJsText $AnmeldeMail);
try { if (window.__rcMail) localStorage.setItem('rcAutoMail', window.__rcMail); } catch(e) {}
$Autopilot
"@
Gut ("Injektions-Paket: " + [math]::Round($Paket.Length / 1024) + " KB")
if (-not $MappingB64) {
    Warn "Mitarbeiter_IDS_Final_komplett.xlsx liegt nicht im Ordner -"
    Warn "das Mapping muss dann im Dashboard einmal von Hand gewaehlt werden."
}

# ---------- 6) In alle Tabs einklinken ----------
function HoleZiele() {
    try { return Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json" -TimeoutSec 5 } catch { return @() }
}
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
    if (RuesteTabAus $esl $EslUrl) { Gut "ESL-Tab bereit - Anmeldung und Dashboard laufen automatisch." }
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
    Schritt "Warte auf die ESL-Anmeldemaske ..."
    $frist = (Get-Date).AddSeconds(90)
    $versuch = 0
    $passwortNieGesehen = $true
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
[void](EslAnmeldungAbschicken)

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
        Sende $w 40 'Runtime.evaluate' @{ expression = '(!!window.__rcAutoPilotV2).toString()'; returnByValue = $true }
        $a = Empfange $w 5000
        $laeuft = ($a -and ($a | ConvertFrom-Json).result.result.value -eq 'true')
        if (-not $laeuft) {
            # Fuer kuenftige Seiten dieser Verbindung ...
            Sende $w 41 'Page.enable' @{}
            [void](Empfange $w 3000)
            Sende $w 42 'Page.addScriptToEvaluateOnNewDocument' @{ source = $Paket }
            [void](Empfange $w 5000)
            # ... und sofort fuer die Seite, die gerade offen ist.
            Sende $w 43 'Runtime.evaluate' @{ expression = $Paket; awaitPromise = $false }
            [void](Empfange $w 15000)
        }
        $w.Dispose(); $w = $null
        return (-not $laeuft)
    } catch {
        if ($w) { try { $w.Dispose() } catch { } }
        return $false
    }
}
function WarteAufDashboard($maxSekunden) {
    Schritt "Warte, bis das Dashboard laeuft ..."
    $frist = (Get-Date).AddSeconds($maxSekunden)
    $nachgelegt = 0
    while ((Get-Date) -lt $frist) {
        Start-Sleep -Seconds 2
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
function OeffneLigalisteAusDashboard() {
    $z = $null
    try {
        $z = @(Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json" -TimeoutSec 5) |
             Where-Object { $_.type -eq 'page' -and $_.url -like '*regiocom*' } | Select-Object -First 1
    } catch { }
    if (-not $z -or -not $z.webSocketDebuggerUrl) { return $false }
    try {
        $w = Verbinde $z.webSocketDebuggerUrl
        $js = '(function(){try{' +
              'window.rcKpiWin = window.open(' + ($CcsUrl | ConvertTo-Json -Compress) + ",'rcKpiQuelle');" +
              'return String(!!window.rcKpiWin);' +
              "}catch(e){return 'fehler';}})()"
        Sende $w 61 'Runtime.evaluate' @{ expression = $js; returnByValue = $true; userGesture = $true }
        $a = Empfange $w 8000
        $w.Dispose()
        return ($a -and ($a | ConvertFrom-Json).result.result.value -eq 'true')
    } catch { return $false }
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
            $tabs = @(Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json" -TimeoutSec 5) |
                    Where-Object { $_.type -eq 'page' -and
                                   $_.url -notlike '*regiocom*' -and
                                   $_.url -notlike 'about:*' -and
                                   $_.url -notlike 'chrome*' -and
                                   $_.url -notlike 'edge*' -and
                                   $_.url -notlike 'devtools*' }
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

if ($CcsOeffnen) {
    # Ohne laufendes Dashboard hat die Ligaliste keinen Empfaenger: der Crawler
    # wuerde ins Leere funken. Dann lieber gar nicht oeffnen und sagen, warum.
    if (-not (WarteAufDashboard 120)) {
        Warn "Das Dashboard laeuft nicht - die Ligaliste wird NICHT geoeffnet."
        Warn "Sonst sammelt der KPI-Crawler Daten, die niemand entgegennimmt."
        Warn "Sobald das Dashboard oben ist: im Kopf auf 'KPI-Quelle' klicken."
    } else {
        Schritt "Ligaliste wird aus dem Dashboard heraus geoeffnet ..."
        # Vorher merken, welche Tabs es schon gibt - der neue faellt danach auf.
        $vorher = TabIds
        if (OeffneLigalisteAusDashboard) {
            $neuerTab = FindeNeuenTab $vorher 30
            if ($neuerTab) {
                [void](StelleAutopilotSicher $neuerTab)
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
$DauerTaktSek = 20          # so oft wird nachgesehen (die Sitzung faellt alle 2-3 h aus)
$AnmeldungenMax = 3         # je Zeitfenster - MEHRERE FEHLANMELDUNGEN KOENNEN EIN KONTO SPERREN
$AnmeldeFensterMin = 30     # Laenge des Zeitfensters in Minuten
Write-Host ""
Gut "Ich bleibe ab jetzt offen und melde nach einem Sitzungsablauf automatisch neu an."
Schritt "  Pruefung alle $DauerTaktSek s. Zum Beenden dieses Fenster schliessen."
Write-Host ""
$gesehen = @{}          # Tab-Id -> zuletzt gemeldete Adresse
$nachgelegt = 0
$gmGefunden = $false
$anmeldungen = @()      # Zeitstempel der abgeschickten Anmeldungen (Sperr-Schutz)
$letzterZustand = ''    # damit das Fenster nicht mit derselben Zeile volllaeuft
$aufgegeben = $false
while ($true) {
    Start-Sleep -Seconds $DauerTaktSek
    $alle = @()
    # StelleAutopilotSicher braucht das ganze Tab-Objekt (webSocketDebuggerUrl),
    # nicht nur die Id - deshalb hier die volle Liste holen, nicht TabIds.
    try {
        $alle = @(Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json" -TimeoutSec 5) |
                Where-Object { $_.type -eq 'page' -and
                               $_.url -notlike 'devtools*' -and
                               $_.url -notlike 'chrome*' -and
                               $_.url -notlike 'edge*' }
    } catch { }
    # Ist Edge zu? Dann hat dieses Fenster keine Aufgabe mehr.
    if (-not $alle -or $alle.Count -eq 0) {
        Schritt "Keine Portal-Tabs mehr offen - der Waechter beendet sich."
        break
    }
    foreach ($t in $alle) {
        $url = "$($t.url)"
        # Adresswechsel melden - so ist im Fenster nachvollziehbar, wohin ein Tab
        # gewandert ist (z.B. about:blank -> start.rb -> gm2.rb).
        if ($gesehen[$t.id] -ne $url) {
            if ($gesehen.ContainsKey($t.id)) { Schritt "  Tab wechselt nach: $url" }
            else { Schritt "  Tab gesehen: $url" }
            $gesehen[$t.id] = $url
        }
        # Wirkung PRUEFEN statt nur ausloesen: der Rueckgabewert sagt, ob wirklich
        # nachgelegt werden musste. Frueher wurde er mit [void] verworfen.
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

        # ---- ESL: steht da eine Anmeldemaske? ----
        if ($url -like '*regiocom*') {
            $tat = EinAnmeldeVersuch $t
            if ($tat -eq 'keine-maske') {
                if ($letzterZustand -ne 'ok') { Gut ("  ESL angemeldet (" + (Get-Date -Format 'HH:mm') + ")."); $letzterZustand = 'ok' }
                $aufgegeben = $false          # neue Sitzung -> Sperr-Schutz wieder scharf
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

# Fenster offen halten (nur beim Direktstart der .ps1 noetig — die .cmd hat ihr eigenes pause).
try { Read-Host " [Enter] zum Schliessen" | Out-Null } catch { Start-Sleep -Seconds 20 }
