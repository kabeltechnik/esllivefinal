# Mail-Zentrum (Datendienst): liest Outlook (klassisch) und gibt EIN JSON auf stdout aus.
# Aufruf durch esl_dienst_postfach.js alle 3 Min. Kein Mailtext (nur Vorschau), nichts auf Platte.
# Vorlage: TL_Command_Center/TL_Starter.cmd, HoleOutlookDaten.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

function Aus($obj) { [Console]::Out.Write(($obj | ConvertTo-Json -Depth 5 -Compress)) }
function Zeit($t) { return ([datetime]$t).ToString('yyyy-MM-ddTHH:mm') }
function Smtp($m) {
    $a = [string]$m.SenderEmailAddress
    if ($a -match '^/o=' -or -not ($a -match '@')) {
        try { $x = $m.Sender.GetExchangeUser(); if ($x -and $x.PrimarySmtpAddress) { $a = [string]$x.PrimarySmtpAddress } } catch {}
    }
    return $a
}

try {
    $ol = $null
    try { $ol = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application') }
    catch {
        try { $ol = New-Object -ComObject Outlook.Application }
        catch { Aus @{ ok = $false; grund = ('Outlook (klassisch) nicht erreichbar: ' + $_.Exception.Message) }; exit 0 }
    }
    $ns = $ol.GetNamespace('MAPI')
    $inbox = $ns.GetDefaultFolder(6)
    $items = $inbox.Items
    $items.Sort('[ReceivedTime]', $true)

    # Posteingang: die neuesten 60
    $mails = @()
    $max = [Math]::Min(60, $items.Count)
    for ($i = 1; $i -le $max; $i++) {
        try {
            $m = $items.Item($i)
            $smtp = Smtp $m
            $name = [string]$m.SenderName
            if (-not $name) { $name = $smtp }
            $vorschau = ''
            try {
                $t = (([string]$m.Body) -replace '\s+', ' ').Trim()
                if ($t.Length -gt 180) { $vorschau = $t.Substring(0, 180) + '...' } else { $vorschau = $t }
            } catch {}
            $mails += @{ entryId = [string]$m.EntryID; zeit = (Zeit $m.ReceivedTime); absender = $name; email = $smtp
                         betreff = [string]$m.Subject; ungelesen = [bool]$m.UnRead; vorschau = $vorschau }
        } catch {}
    }

    # Dispo und Kalender je mit eigenem Fehlerzweig: ein Fehler dort (z. B. Datumsformat im Filter)
    # nimmt die Mails nicht mit und erscheint als Hinweis auf der Seite statt still zu fehlen.
    $hinweise = @()

    # Dispo: alle "MA:"-Betreffe der letzten 7 Tage (eingestuft wird in Node)
    $dispo = @()
    try {
        $ab = (Get-Date).Date.AddDays(-7).ToString('g')
        foreach ($m in $items.Restrict("[ReceivedTime] >= '" + $ab + "'")) {
            if ($dispo.Count -ge 300) { break }
            try {
                $s = [string]$m.Subject
                if ($s -match 'MA:') { $dispo += @{ entryId = [string]$m.EntryID; zeit = (Zeit $m.ReceivedTime); betreff = $s } }
            } catch {}
        }
    } catch { $hinweise += ('Dispo nicht gelesen: ' + $_.Exception.Message) }

    # Kalender: nur heute, abgesagte raus
    $termine = @()
    try {
        $heute = (Get-Date).Date
        $morgen = $heute.AddDays(1)
        $cItems = $ns.GetDefaultFolder(9).Items
        $cItems.IncludeRecurrences = $true
        $cItems.Sort('[Start]')
        foreach ($ci in $cItems.Restrict("[Start] < '" + $morgen.ToString('g') + "' AND [End] > '" + $heute.ToString('g') + "'")) {
            if ($termine.Count -ge 25) { break }
            try {
                $st = [datetime]$ci.Start
                $en = [datetime]$ci.End
                if ($en -le $heute -or $st -ge $morgen) { continue }
                $titel = [string]$ci.Subject
                $status = 0
                try { $status = [int]$ci.MeetingStatus } catch {}
                if ($status -eq 5 -or $status -eq 7 -or $titel -match '^(Abgesagt|Canceled|Cancelled|Entfällt|Entfaellt)\s*:') { continue }
                $ganz = [bool]$ci.AllDayEvent -or ($st.ToString('HH:mm') -eq '00:00' -and ($en - $st).TotalMinutes -ge 1440)
                if (-not $ganz -and $st.Date -ne $heute) { continue }
                $termine += @{ entryId = [string]$ci.EntryID; titel = $titel; ganztaegig = $ganz
                               start = $(if ($ganz) { '' } else { $st.ToString('HH:mm') }); ende = $(if ($ganz) { '' } else { $en.ToString('HH:mm') }) }
            } catch {}
        }
    } catch { $hinweise += ('Kalender nicht gelesen: ' + $_.Exception.Message) }

    Aus @{ ok = $true; ungelesen = [int]$inbox.UnReadItemCount; mails = $mails; dispo = $dispo; termine = $termine; hinweise = $hinweise }
} catch {
    Aus @{ ok = $false; grund = ('Outlook lesen gescheitert: ' + $_.Exception.Message) }
}
exit 0
