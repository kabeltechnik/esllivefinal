@echo off
setlocal
title ESL Live-Arena - Mobilfunk + UM
REM ==========================================================
REM  ESL Live-Arena - Mobilfunk + UM dazuschalten
REM  SELBST-ENTHALTEND: der PowerShell-Code steckt in dieser
REM  Datei. Es wird KEINE .ps1 daneben gebraucht.
REM  VORHER MUSS ESL_Start.cmd LAUFEN - siehe Erklaerung unten.
REM  Einfach doppelklicken. Das Fenster bleibt offen.
REM ==========================================================
set "ESLDIR=%~dp0"
set "ESLSELF=%~f0"
REM Optionaler Parameter: mobile | um | (leer = beide).
REM So gibt es je Stack einen eigenen Start, ohne eine dritte Kopie dieser
REM Datei zu pflegen — die Wrapper ESL_Start_Mobile.cmd / ESL_Start_UM.cmd
REM rufen genau hiermit auf.
set "ESLPROJEKT=%~1"
echo.
echo  Ordner: %ESLDIR%
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$s=Get-Content -Raw -LiteralPath $env:ESLSELF; $i=$s.IndexOf([char]35+'PSSTART'); if($i -lt 0){Write-Host 'FEHLER: Marker nicht gefunden - Datei unvollstaendig?' -ForegroundColor Red}else{Invoke-Expression $s.Substring($i)}"
echo.
pause
endlocal
exit /b

#PSSTART
<#
================================================================================
 ESL Live-Arena - MOBILFUNK + UM DAZUSCHALTEN
================================================================================
 WAS DAS HIER MACHT
   Es oeffnet zwei weitere Tabs im BEREITS LAUFENDEN Edge - einen fuer
   "Vodafone Mobile", einen fuer "Vodafone UM" - und spielt dort jeweils die
   passende Autopilot-Fassung ein. Danach beendet es sich wieder.

 WARUM ESL_Start.cmd VORHER LAUFEN MUSS - das ist kein Schoenheitsfehler:
   1. Edge laeuft mit einem EIGENEN Profil und der Fernsteuerung auf Port 9222.
      Ein zweiter Edge-Start auf dasselbe Profil ist nicht moeglich; dieses
      Script startet Edge deshalb bewusst NICHT, sondern haengt sich an.
   2. Eine per Page.addScriptToEvaluateOnNewDocument registrierte Einspielung
      ueberlebt das Trennen der Verbindung NICHT. Sobald dieses Fenster zu ist,
      waeren die beiden neuen Tabs also wieder ohne Autopilot.
      Genau das faengt ESL_Start.cmd ab: sein Waechter laeuft dauerhaft, sieht
      jeden Portal-Tab in jedem Takt an und legt den Autopiloten nach - seit
      dieser Fassung mit dem RICHTIGEN Paket je Projekt (er liest dazu die Marke
      sessionStorage.rcEslProjekt, die hier gesetzt wird).
   Ohne den laufenden Waechter bekaemen die neuen Tabs beim naechsten
   Seitenwechsel das Kabel-Paket untergeschoben und wuerden sich selbst nach
   Kabel umlenken - lautlos und mit falschen Zahlen.

 WAS JEDES PROJEKT FUER SICH HOLT
   Jedes der drei Dashboards oeffnet seine EIGENE Ligaliste und seinen eigenen
   Genesys-Monitor. Das ist eine bewusste Entscheidung: die Ligaliste filtert
   ueber einen Referenzbaum (nodeid_inlist), und der ist je Projekt ein anderer -
   eine geteilte Ligaliste koennte die anderen beiden gar nicht bedienen.
   Preis dafuer ist die dreifache Last auf dem Portal. Faellt das auf, ist die
   Stellschraube der Abrufweg im Crawler, nicht dieses Script.

 START
   ZUERST ESL_Start.cmd doppelklicken und warten, bis das Kabel-Dashboard steht.
   DANN diese Datei doppelklicken.
================================================================================
#>

# ------------------------------- EINSTELLUNGEN -------------------------------
# Angesteuert wird die ANMELDESEITE, nicht die Projektseite direkt. Zwei Gruende:
# die UM-Adresse enthaelt ein kodiertes Leerzeichen ("/Agents/secure%20/"), das je
# nach Aufrufweg anders ankommt, und die Projektwahl ueber den Menueeintrag ist
# der im Projekt erprobte Weg. Steht die Sitzung schon (ESL_Start.cmd war ja
# vorher dran), leitet das Portal sofort weiter und der Autopilot waehlt im Menue.
$EslUrl    = 'https://esl.regiocom.net/Agents/login_esl.xhtml'
$DebugPort = 9222          # derselbe Port wie in ESL_Start.cmd
$WarteSek  = 40            # so lange wird geschaut, ob die Tabs wirklich anlaufen
# -----------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$Basis = $env:ESLDIR

function Schritt($t) { Write-Host "  $t" -ForegroundColor Cyan }
function Gut($t)     { Write-Host "  $t" -ForegroundColor Green }
function Warn($t)    { Write-Host "  $t" -ForegroundColor Yellow }
function Fehler($t)  { Write-Host "  $t" -ForegroundColor Red }

Write-Host ""
Write-Host "  ESL Live-Arena - Mobilfunk + UM" -ForegroundColor White
Write-Host "  -------------------------------" -ForegroundColor DarkGray

# ---------- 0) ABGELOEST (07.08.) --------------------------------------------
# Diese Datei legt Mobile-/UM-Tabs in den Browser auf Port 9222 - das ist seit
# dem 07.08. der KABEL-Browser. Genau das war die Ursache des Sitzungs-Kippens:
# alle Tabs eines Edge-PROFILS teilen sich EINEN Cookie-Jar und damit EINE
# ESL-Server-Sitzung; das Portal merkt sich das zuletzt gewaehlte Projekt
# serverseitig, und nach einem Re-Login wurde aus dem Mobile-Tab still ein
# zweiter Kabel-Tab ("Kabel auf null, Mobilfunk normal, dann andersrum").
# Der Ersatz ist ESL_Start.cmd mobile / ESL_Start.cmd um: eigenes Profil,
# eigener Port, eigener Browser - drei Projekte gleichzeitig auf einem Rechner,
# ohne dass sie sich die Sitzung teilen.
# Bewusst ein harter Abbruch und keine Warnung: ein Lauf von hier sieht aus wie
# ein Erfolg (die Tabs entstehen ja) und faellt erst Stunden spaeter durch
# falsche Zahlen auf.
Fehler "Diese Startdatei ist abgeloest und wuerde falsche Zahlen erzeugen."
Warn   "Sie haengt Mobile-/UM-Tabs in den KABEL-Browser (Port 9222) - dort"
Warn   "teilen sich alle Tabs EINE ESL-Sitzung und kippen sich gegenseitig um."
Write-Host ""
Schritt "Stattdessen je Projekt einen eigenen Browser starten:"
Schritt "    ESL_Start.cmd            (Kabel,  Profil EdgeProfil,        Port 9222)"
Schritt "    ESL_Start_Mobile.cmd     (Mobile, Profil EdgeProfil_mobile, Port 9223)"
Schritt "    ESL_Start_UM.cmd         (UM,     Profil EdgeProfil_um,     Port 9224)"
Schritt "Die drei duerfen gleichzeitig laufen. Jeder bringt seine eigene"
Schritt "Ligaliste und seinen eigenen Genesys-Monitor mit."
Write-Host ""
Read-Host "  [Enter]"
exit 1

# ---------- 1) Laeuft ESL_Start.cmd ueberhaupt? ----------
function FernsteuerungBereit($port) {
    try { $r = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/version" -TimeoutSec 2; return $null -ne $r } catch { return $false }
}
if (-not (FernsteuerungBereit $DebugPort)) {
    Fehler "Edge mit Fernsteuerung laeuft nicht (Port $DebugPort)."
    Warn   "Bitte ZUERST ESL_Start.cmd doppelklicken und warten, bis das"
    Warn   "Kabel-Dashboard steht. Danach diese Datei noch einmal starten."
    Warn   "Grund steht oben im Kopf dieser Datei - der Waechter aus ESL_Start.cmd"
    Warn   "haelt die beiden neuen Tabs am Leben, dieses Fenster kann das nicht."
    exit 1
}
Gut "Edge mit Fernsteuerung gefunden (Port $DebugPort)."

# ---------- 2) Dateien einlesen ----------
# Gleiche Pruefungen wie in ESL_Start.cmd: auf dem Netzlaufwerk entstanden schon
# 0-KB-Huellen, und es lag Code unter falschem Namen im Ordner.
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
function LiesBinaerBase64($name, $minBytes) {
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
# Die Varianten werden mit "node autopilot_varianten_erzeugen.js" aus dem Master
# erzeugt - NICHT von Hand pflegen, sonst laufen sie auseinander.
$AutopilotMob = LiesDatei 'esl_autopilot_mobile.user.js' $false 15  'AUTOPILOT'
$AutopilotUm  = LiesDatei 'esl_autopilot_um.user.js'     $false 15  'AUTOPILOT'
$Dashboard    = LiesDatei 'esl_live_arena_v22.js'        $true  500 'live-arena'
$KpiCrawler   = LiesDatei 'kpi_crawler.js'               $false 20  'KPI-Crawler'
$GmCrawler    = LiesDatei 'genesys_monitor_crawler.js'   $false 5   'Warteschleifen-Crawler'
$MappingB64   = LiesBinaerBase64 'Mitarbeiter_IDS_Final_komplett.xlsx' 10240
$LogoB64      = LiesBinaerBase64 'regiocom.png' 300

if (-not $Dashboard) { Fehler "Abbruch: esl_live_arena_v22.js fehlt oder ist unbrauchbar."; exit 1 }
if (-not $AutopilotMob -and -not $AutopilotUm) {
    Fehler "Abbruch: weder esl_autopilot_mobile.user.js noch esl_autopilot_um.user.js gefunden."
    Warn   "Beide werden erzeugt mit:  node autopilot_varianten_erzeugen.js"
    exit 1
}

# ---------- 3) WebSocket-Hilfen (identisch zu ESL_Start.cmd) ----------
# KEIN Add-Type! In Windows PowerShell 5.1 gibt es die Assembly
# "System.Net.WebSockets.Client" nicht - die Klasse steckt direkt in System.dll.
function Verbinde($wsUrl) {
    # IMMER eine einzelne Adresse. Kam hier versehentlich eine Liste an, lautete
    # die Meldung nur "System.Object[] kann nicht in System.Uri konvertiert
    # werden" - was NICHT sagt, welcher Tab gemeint war (Befund 05.08.).
    $u = [string](@($wsUrl)[0])
    if (-not $u) { throw "Leere WebSocket-Adresse uebergeben." }
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ws.ConnectAsync([Uri]$u, [Threading.CancellationToken]::None).Wait(5000) | Out-Null
    if ($ws.State -ne 'Open') { throw "WebSocket nicht verbunden: $u" }
    return $ws
}
function Sende($ws, $id, $methode, $parameter) {
    $obj = @{ id = $id; method = $methode; params = $parameter }
    $json = $obj | ConvertTo-Json -Depth 12 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $seg = New-Object 'System.ArraySegment[byte]' -ArgumentList @(,$bytes)
    # Die Wartezeit MUSS zur Groesse passen. Das Autopilot-Paket ist rund 2 MB
    # (Dashboard 1,4 MB + Crawler + Mapping); auf einem ausgelasteten Citrix-Host
    # reichen 5 s dafuer nicht sicher. Schlimmer als das Warten war die Folge:
    # .Wait() lieferte still $false, der Sendevorgang lief WEITER, und der
    # naechste Sende-Aufruf auf derselben Verbindung warf
    # "There is already one outstanding 'SendAsync' call" - eine Meldung, die
    # mit der Ursache nichts zu tun hat. Deshalb: grosszuegig warten UND bei
    # Ablauf abbrechen, statt auf einer halb belegten Verbindung weiterzumachen.
    $frist = 15000 + [int]($bytes.Length / 50)   # 2 MB -> rund 55 s
    if (-not $ws.SendAsync($seg, [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait($frist)) {
        throw ("Senden von '$methode' hat laenger als " + [math]::Round($frist/1000) + " s gedauert (" +
               [math]::Round($bytes.Length/1024) + " KB) - abgebrochen.")
    }
}
# Auf die Antwort mit GENAU dieser id warten und einen Protokoll-Fehler im
# Klartext melden. Vorher wurden alle Antworten mit [void](Empfange ...)
# verworfen: lehnte Edge einen Befehl ab, stand das nirgends, und der Tab blieb
# ohne erkennbaren Grund leer. Dieselbe Lehre wie beim ORA-Code der Ligaliste -
# Fehlermeldungen der Gegenseite immer MITLESEN.
function Antwort($ws, $id, $timeoutMs) {
    $ende = (Get-Date).AddMilliseconds($timeoutMs)
    while ((Get-Date) -lt $ende) {
        $rest = [int]((New-TimeSpan -Start (Get-Date) -End $ende).TotalMilliseconds)
        if ($rest -le 0) { break }
        $a = Empfange $ws $rest
        if (-not $a) { break }
        $o = $null
        try { $o = $a | ConvertFrom-Json } catch { continue }
        foreach ($m in @($o)) {
            if ($m.id -ne $id) { continue }          # Ereignisse und fremde Antworten ueberspringen
            if ($m.error) { throw ("Edge lehnt '" + $m.error.message + "' ab (Code " + $m.error.code + ")") }
            return $m
        }
    }
    throw "Keine Antwort auf Befehl $id innerhalb von $([math]::Round($timeoutMs/1000)) s."
}
# Auf ein EREIGNIS warten (Ereignisse haben keine id, nur "method").
# Gebraucht fuer Page.loadEventFired: Page.navigate kehrt bereits zurueck, wenn
# die Navigation BEGINNT. Wer die Verbindung direkt danach trennt, nimmt die per
# Page.addScriptToEvaluateOnNewDocument registrierte Einspielung mit ins Grab -
# sie ist an die CDP-Sitzung gebunden. Traf dann noch eine Weiterleitung ein
# (die ESL-Anmeldeseite leitet bei stehender Sitzung sofort weiter), bekam das
# neue Dokument den Autopiloten nicht mehr: der Tab stand da und tat nichts.
function WarteAufEreignis($ws, $name, $timeoutMs) {
    $ende = (Get-Date).AddMilliseconds($timeoutMs)
    while ((Get-Date) -lt $ende) {
        $rest = [int]((New-TimeSpan -Start (Get-Date) -End $ende).TotalMilliseconds)
        if ($rest -le 0) { break }
        $a = Empfange $ws $rest
        if (-not $a) { break }
        $o = $null
        try { $o = $a | ConvertFrom-Json } catch { continue }
        foreach ($m in @($o)) { if ($m.method -eq $name) { return $true } }
    }
    return $false
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

# ---------- 4) Die Pakete bauen ----------
function AlsJsText($s) { return ($s | ConvertTo-Json -Compress) }

# Der Kopf ist fuer beide Projekte gleich und wird nur EINMAL gebaut - AlsJsText
# laeuft ueber den 1,4-MB-Dashboardcode.
$PaketKopf = @"
window.__rcFiles = {
  dash:  $(AlsJsText $Dashboard),
  kpi:   $(AlsJsText $KpiCrawler),
  croco: "",
  gm:    $(AlsJsText $GmCrawler),
  mapping: $(AlsJsText $MappingB64),
  logo:  $(AlsJsText $LogoB64)
};
"@
# Die Marke sagt dem Waechter aus ESL_Start.cmd, welches Paket in diesen Tab
# gehoert. sessionStorage, weil das die einzige Ablage ist, die PRO TAB gilt
# (localStorage teilen sich alle Tabs derselben Adresse) UND eine Navigation
# ueberlebt. Sie wird bei JEDEM Seitenaufbau neu gesetzt und traegt sich damit
# selbst weiter, auch nachdem dieses Fenster laengst zu ist.
function BauPaket($autopilotCode, $marke) {
    return $PaketKopf + "`ntry { sessionStorage.setItem('rcEslProjekt','$marke'); } catch(e) {}`n" + $autopilotCode
}

$Projekte = @()
if ($AutopilotMob) { $Projekte += @{ marke = 'mobile'; name = 'Vodafone Mobile'; paket = (BauPaket $AutopilotMob 'mobile') } }
if ($AutopilotUm)  { $Projekte += @{ marke = 'um';     name = 'Vodafone UM';     paket = (BauPaket $AutopilotUm  'um') } }

# Auf EIN Projekt eingrenzen, wenn der Aufrufer eines genannt hat (Wrapper
# ESL_Start_Mobile.cmd / ESL_Start_UM.cmd). Ein unbekannter Wert bricht ab,
# statt still beide zu starten — sonst stuenden ploetzlich zwei Fenster da und
# niemand wuesste warum.
$NurProjekt = ("$env:ESLPROJEKT").Trim().ToLower()
if ($NurProjekt) {
    if ($NurProjekt -ne 'mobile' -and $NurProjekt -ne 'um') {
        Fehler "Unbekanntes Projekt '$NurProjekt' - erlaubt sind: mobile, um (oder nichts fuer beide)."
        exit 1
    }
    $Projekte = @($Projekte | Where-Object { $_.marke -eq $NurProjekt })
    if (-not $Projekte -or $Projekte.Count -eq 0) {
        Fehler "Fuer '$NurProjekt' fehlt die Autopilot-Variante (esl_autopilot_$($NurProjekt -replace 'mobile','mobile').user.js)."
        Warn   "Erzeugen mit:  node autopilot_varianten_erzeugen.js"
        exit 1
    }
    Schritt "Nur ein Projekt angefordert: $NurProjekt"
}

# ---------- 5) Welche Projekte laufen schon? ----------
# Zweimal doppelklicken darf nicht zwei Mobile-Tabs ergeben: das waeren zwei
# Dashboards, zwei Ligalisten-Fenster und zwei Crawler auf derselben Sperre.
# Gefragt wird nach der MARKE, nicht nach der Adresse - bei abgelaufener Sitzung
# steht in einem Mobile-Tab die Anmeldemaske, dort ist an der Adresse nichts
# mehr zu erkennen.
function OffeneMarken() {
    $gefunden = @()
    $alle = @()
    try {
        $alle = @(Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json" -TimeoutSec 5) |
                Where-Object { $_.type -eq 'page' -and $_.url -like '*regiocom*' }
    } catch { return $gefunden }
    foreach ($t in $alle) {
        if (-not $t.webSocketDebuggerUrl) { continue }
        $w = $null
        try {
            $w = Verbinde $t.webSocketDebuggerUrl
            Sende $w 10 'Runtime.evaluate' @{
                expression = '(function(){try{return sessionStorage.getItem("rcEslProjekt")||"";}catch(e){return "";}})()'
                returnByValue = $true }
            $a = Empfange $w 5000
            if ($a) { $m = "$(($a | ConvertFrom-Json).result.result.value)"; if ($m) { $gefunden += $m } }
            $w.Dispose(); $w = $null
        } catch { if ($w) { try { $w.Dispose() } catch { } } }
    }
    return $gefunden
}

Schritt "Sehe nach, welche Projekte schon offen sind ..."
$schonDa = @(OffeneMarken)
if ($schonDa.Count -gt 0) { Schritt ("  bereits offen: " + (($schonDa | Sort-Object -Unique) -join ', ')) }

# ---------- 6) Tabs anlegen und ausruesten ----------
# Der Tab wird ueber das Browser-Ziel angelegt (Target.createTarget), nicht ueber
# den alten PUT /json/new - der ist in neueren Edge-Fassungen abgekuendigt.
function AlleZiele() {
    try { return @(Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json" -TimeoutSec 5) }
    catch { return @() }
}
function NeuerTab() {
    # Die Tab-Liste VOR dem Anlegen merken. Damit gibt es einen zweiten Weg zum
    # neuen Tab, der an keinem ID-Format haengt (Befund 06.08. aus dem
    # Livebetrieb: "der neue Tab war ueber die Fernsteuerung nicht auffindbar" -
    # der Tab war sichtbar da, nur der Abgleich targetId gegen /json traf nicht).
    $vorher = @{}
    foreach ($z in (AlleZiele)) { if ($z.id) { $vorher[[string]$z.id] = $true } }

    $ver = Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json/version" -TimeoutSec 5
    if (-not $ver.webSocketDebuggerUrl) { throw "Kein Browser-Endpunkt - Edge zu alt?" }
    $b = Verbinde ([string]$ver.webSocketDebuggerUrl)
    $tid = ''
    try {
        Sende $b 1 'Target.createTarget' @{ url = 'about:blank' }
        # AUF DIE ANTWORT MIT DER RICHTIGEN ID WARTEN (Befund 05.08. aus dem
        # Livebetrieb). Das DevTools-Protokoll schickt auf demselben Kanal auch
        # EREIGNISSE - Target.createTarget loest u.a. Target.targetCreated aus.
        # Empfange() liest schlicht die naechste Nachricht; war das ein Ereignis,
        # stand in .result nichts, und der Wert lief als leeres/mehrdeutiges
        # Objekt weiter. Genau daraus wurde spaeter der Fehler
        # "System.Object[] kann nicht in System.Uri konvertiert werden".
        # Antwort() ueberspringt Ereignisse, wartet auf genau id=1 und meldet eine
        # Ablehnung im Klartext statt sie zu verschlucken.
        $m = Antwort $b 1 20000
        $tid = [string](@($m.result.targetId)[0])
    } finally { try { $b.Dispose() } catch { } }
    if (-not $tid) { throw "Target.createTarget kam ohne targetId zurueck." }

    # Warten, bis der Tab in /json auftaucht. ZWEI Wege:
    #   1. ueber die targetId - der direkte Abgleich
    #   2. sonst: der Eintrag, der VORHER nicht in der Liste stand
    # Weg 2 traegt auch dann, wenn Edge die Kennung in /json anders schreibt als
    # Target.createTarget sie meldet. Er greift nur, wenn GENAU EIN Tab neu
    # dazugekommen ist - sonst waere die Zuordnung geraten, und ein falscher Tab
    # bekaeme das Autopilot-Paket untergeschoben.
    for ($i = 0; $i -lt 25; $i++) {
        $jetzt = AlleZiele
        $z = @($jetzt | Where-Object { [string]$_.id -eq $tid } | Select-Object -First 1)[0]
        if (-not ($z -and $z.webSocketDebuggerUrl)) {
            $neu = @($jetzt | Where-Object {
                $_.type -eq 'page' -and $_.webSocketDebuggerUrl -and -not $vorher[[string]$_.id] })
            if ($neu.Count -eq 1) {
                $z = $neu[0]
                Warn ("  Tab ueber die targetId nicht gefunden - genommen wird der neu hinzugekommene Tab (id=" + $z.id + ").")
            }
        }
        if ($z -and $z.webSocketDebuggerUrl) { return $z }
        Start-Sleep -Milliseconds 300
    }

    # Nichts gefunden - dann zeigen, was WIRKLICH in der Liste steht. Ohne diese
    # Ausgabe bleibt "nicht auffindbar" eine Sackgasse: man sieht den Tab im
    # Browser, aber nicht, warum die Fernsteuerung ihn nicht kennt.
    Fehler ("  Der neue Tab taucht nicht in der Tab-Liste auf. targetId war: " + $tid)
    Warn   "  Das steht gerade in der Liste:"
    foreach ($z in (AlleZiele)) {
        Warn ("    id=" + $z.id + "  type=" + $z.type + "  ws=" + [bool]$z.webSocketDebuggerUrl + "  url=" + $z.url)
    }
    throw ("Tab nicht auffindbar (targetId " + $tid + ")")
}
function ZielZuId($tid) {
    # $tid IMMER als einzelnen String behandeln. Kaeme hier ein Array an,
    # vergliche PowerShell Skalar gegen Liste, der Filter traefe mehrere Tabs,
    # und $ziel.webSocketDebuggerUrl waere anschliessend selbst eine Liste.
    $id = [string](@($tid)[0])
    if (-not $id) { return $null }
    for ($i = 0; $i -lt 20; $i++) {
        try {
            $z = @(Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json" -TimeoutSec 5) |
                 Where-Object { [string]$_.id -eq $id } | Select-Object -First 1
            # @(...)[0] erzwingt EIN Objekt, auch wenn die Pipeline wider
            # Erwarten mehrere liefert.
            $z = @($z)[0]
            if ($z -and $z.webSocketDebuggerUrl) { return $z }
        } catch { }
        Start-Sleep -Milliseconds 300
    }
    return $null
}
# Reihenfolge ist wichtig: erst REGISTRIEREN, dann navigieren. Andersherum waere
# die Seite unter Umstaenden schon aufgebaut, bevor der Autopilot da ist - er
# liefe dann erst beim naechsten Seitenwechsel an.
function RuesteAusUndFahrHin($ziel, $paket, $url) {
    $w = $null
    try {
        # Defensiv EIN Ziel und EINE Adresse. Hier ist am 05.08. der Fehler
        # "System.Object[] kann nicht in System.Uri konvertiert werden"
        # aufgeschlagen - die Ursache lag weiter oben, aber die Meldung nannte
        # nur die Folge. Mit dieser Normalisierung kann die Klasse hier nicht
        # mehr entstehen, und die Meldung darunter nennt den echten Wert.
        $z = @($ziel)[0]
        $wsUrl = [string](@($z.webSocketDebuggerUrl)[0])
        if (-not $wsUrl) { throw "Kein WebSocket-Zugang fuer diesen Tab (id=" + $z.id + ")" }
        $w = Verbinde $wsUrl
        Sende $w 1 'Page.enable' @{}
        [void](Antwort $w 1 10000)
        # Das Paket ist rund 2 MB. Grosszuegige Frist, und die Antwort wird
        # WIRKLICH ausgewertet: ohne sie war ein abgelehntes Einspielen nicht von
        # einem geglueckten zu unterscheiden - die Seite lud danach trotzdem, nur
        # eben ohne Autopilot, und genau so sah der Fehler beim Nutzer aus
        # ("es oeffnet sich nur ein neuer Tab").
        Sende $w 2 'Page.addScriptToEvaluateOnNewDocument' @{ source = $paket }
        [void](Antwort $w 2 60000)
        Sende $w 3 'Page.navigate' @{ url = $url }
        $nav = Antwort $w 3 20000
        # Page.navigate meldet einen Ladefehler NICHT als error, sondern als
        # result.errorText (z.B. bei Namensaufloesung oder Zertifikat).
        if ($nav.result -and $nav.result.errorText) {
            throw ("Seite '" + $url + "' liess sich nicht laden: " + $nav.result.errorText)
        }
        # ERST trennen, wenn die Seite wirklich steht. Sonst stirbt die
        # Einspielung mitten in der Navigation (siehe WarteAufEreignis).
        if (-not (WarteAufEreignis $w 'Page.loadEventFired' 45000)) {
            Warn "  Seite hat sich in 45 s nicht als geladen gemeldet - es wird trotzdem versucht."
        }
        # UND JETZT DAS ENTSCHEIDENDE: das Paket zusaetzlich auf der GERADE
        # geladenen Seite ausfuehren. Genau das macht StelleAutopilotSicher in
        # ESL_Start.cmd - und genau das fehlte hier. Eine per
        # Page.addScriptToEvaluateOnNewDocument registrierte Einspielung ist an
        # die CDP-Sitzung gebunden und ist weg, sobald dieses Fenster die
        # Verbindung trennt. Sie deckt also nur die eine Navigation ab, die
        # waehrend der Verbindung stattfindet - und wenn die Anmeldeseite noch
        # weiterleitet, nicht einmal die. Der Tab stand dann offen und leer.
        # Runtime.evaluate wirkt dagegen SOFORT im laufenden Dokument und
        # ueberlebt das Trennen, weil der Code dann schon laeuft.
        Sende $w 4 'Runtime.evaluate' @{
            expression = '(function(){try{return (!!window.__rcAutoPilotV2)?"1":"0";}catch(e){return "0";}})()'
            returnByValue = $true }
        $st = Antwort $w 4 10000
        $laeuft = $false
        try { $laeuft = ("$($st.result.result.value)" -eq '1') } catch { $laeuft = $false }
        if (-not $laeuft) {
            Sende $w 5 'Runtime.evaluate' @{ expression = $paket; awaitPromise = $false }
            $ev = Antwort $w 5 60000
            # Ein Laufzeitfehler im eingespielten Code steht in exceptionDetails,
            # NICHT in error - ohne diese Pruefung sieht ein Absturz beim
            # Einspielen wie ein Erfolg aus.
            if ($ev.result -and $ev.result.exceptionDetails) {
                $txt = "$($ev.result.exceptionDetails.text)"
                if ($ev.result.exceptionDetails.exception -and $ev.result.exceptionDetails.exception.description) {
                    $txt = "$($ev.result.exceptionDetails.exception.description)"
                }
                throw ("Autopilot brach beim Einspielen ab: " + $txt)
            }
        }
        $w.Dispose(); $w = $null
        return $true
    } catch {
        if ($w) { try { $w.Dispose() } catch { } }
        Warn ("Tab konnte nicht vorbereitet werden: " + $_.Exception.Message)
        return $false
    }
}

$angelegt = @()
foreach ($pr in $Projekte) {
    if ($schonDa -contains $pr.marke) {
        Gut ("$($pr.name): laeuft bereits - wird nicht noch einmal geoeffnet.")
        continue
    }
    Schritt "$($pr.name): neuer Tab ..."
    # NeuerTab liefert seit 06.08. das ZIEL-Objekt, nicht nur die targetId: das
    # Auffinden in /json gehoert dorthin, wo die Vorher-Liste bekannt ist. Der
    # frueher hier stehende Aufruf "ZielZuId $tid" konnte nur ueber die
    # targetId suchen - und genau der Abgleich schlug im Livebetrieb fehl.
    $ziel = $null
    try { $ziel = NeuerTab } catch { Fehler ("$($pr.name): Tab liess sich nicht anlegen - " + $_.Exception.Message); continue }
    $ziel = @($ziel)[0]
    if (-not ($ziel -and $ziel.webSocketDebuggerUrl)) { Fehler "$($pr.name): der neue Tab war ueber die Fernsteuerung nicht auffindbar."; continue }
    if (RuesteAusUndFahrHin $ziel $pr.paket $EslUrl) {
        Gut "$($pr.name): Autopilot eingeklinkt, Seite laedt."
        $angelegt += @{ id = [string]$ziel.id; name = $pr.name; marke = $pr.marke }
    }
}

if ($angelegt.Count -eq 0) {
    Write-Host ""
    # UNTERSCHEIDEN: lief schon alles, oder ist der Versuch GESCHEITERT?
    # Beides mit "Nichts zu tun - es laeuft bereits alles" zu quittieren war
    # irrefuehrend (Befund 05.08.): der Tab liess sich nicht vorbereiten, und
    # die Meldung behauptete Erfolg.
    if ($Projekte.Count -eq 0) {
        Gut "Nichts zu tun - die gewuenschten Projekte laufen bereits."
    } else {
        Fehler "Es wurde KEIN Tab eingerichtet - siehe Meldung(en) oben."
        Warn   "Laeuft ESL_Start.cmd noch (Fenster offen)? Ohne den Waechter dort"
        Warn   "bleiben neue Tabs ohne Autopilot."
    }
    Start-Sleep -Seconds 3
    return
}

# ---------- 7) Nachsehen, ob es wirklich anlaeuft ----------
# "Gebaut, aber nie geprueft" ist im Projekt schon mehrfach teuer geworden.
# Deshalb hier nicht einfach beenden, sondern messen: laeuft der Autopilot, und
# wo steht der Tab.
Write-Host ""
Schritt "Ich schaue bis zu $WarteSek s zu, ob die Tabs anlaufen ..."
$frist = (Get-Date).AddSeconds($WarteSek)
$fertig = @{}
while ((Get-Date) -lt $frist -and $fertig.Count -lt $angelegt.Count) {
    Start-Sleep -Seconds 4
    foreach ($t in $angelegt) {
        if ($fertig[$t.marke]) { continue }
        $ziel = ZielZuId $t.id
        if (-not $ziel) { continue }
        $w = $null
        try {
            $w = Verbinde $ziel.webSocketDebuggerUrl
            Sende $w 20 'Runtime.evaluate' @{
                expression = '(function(){var m="";try{m=sessionStorage.getItem("rcEslProjekt")||"";}catch(e){}return ((!!window.__rcAutoPilotV2)?"1":"0")+"|"+m+"|"+location.href;})()'
                returnByValue = $true }
            $a = Empfange $w 5000
            $w.Dispose(); $w = $null
            if (-not $a) { continue }
            $wert = "$(($a | ConvertFrom-Json).result.result.value)"
            $teile = $wert.Split('|')
            if ($teile.Count -ge 2 -and $teile[0] -eq '1' -and $teile[1] -eq $t.marke) {
                $wo = ''
                if ($teile.Count -ge 3) { $wo = ($teile[2..($teile.Count - 1)] -join '|') }
                Gut ("$($t.name): Autopilot laeuft, Marke gesetzt.  $wo")
                $fertig[$t.marke] = $true
            }
        } catch { if ($w) { try { $w.Dispose() } catch { } } }
    }
}
foreach ($t in $angelegt) {
    if (-not $fertig[$t.marke]) {
        Warn "$($t.name): der Autopilot hat sich in $WarteSek s nicht gemeldet."
        Warn "  Das kann am langsamen Portal liegen - der Waechter aus ESL_Start.cmd"
        Warn "  legt ihn beim naechsten Takt (20 s) nach. Bleibt der Tab leer, im Tab"
        Warn "  F12 druecken und dort nach roten Meldungen sehen."
    }
}

Write-Host ""
Gut "Fertig. ESL_Start.cmd haelt die Tabs ab jetzt am Leben - das Fenster dort"
Gut "bitte offen lassen."
Write-Host "  Jedes Projekt oeffnet seine eigene Ligaliste und seinen eigenen" -ForegroundColor DarkGray
Write-Host "  Genesys-Monitor. Werden es zu viele Fenster, im jeweiligen Dashboard" -ForegroundColor DarkGray
Write-Host "  rcAutoKpiOff = true setzen - dann holt dieses Projekt keine" -ForegroundColor DarkGray
Write-Host "  Ligalisten-Daten mehr selbst." -ForegroundColor DarkGray
Write-Host ""
Start-Sleep -Seconds 3
