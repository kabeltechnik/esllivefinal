# Mail-Zentrum (Datendienst): eine Outlook-Aktion je Aufruf. Oeffnet nur Fenster, sendet NIE.
#   -Art oeffnen   -EntryId <hex>    Mail anzeigen
#   -Art antworten -EntryId <hex>    Antwortfenster anzeigen
#   -Art entwurf   -Daten <base64>   neuer Entwurf aus {betreff, text}, Empfaenger traegt der Nutzer ein
# Vorlage: TL_Command_Center/TL_Starter.cmd, OeffneOutlookElement.
param([string]$Art = '', [string]$EntryId = '', [string]$Daten = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

function Aus($obj) { [Console]::Out.Write(($obj | ConvertTo-Json -Compress)) }
function Vorn($titel) { try { $w = New-Object -ComObject WScript.Shell; [void]$w.AppActivate([string]$titel) } catch {} }

try {
    $ol = $null
    try { $ol = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application') }
    catch {
        try { $ol = New-Object -ComObject Outlook.Application }
        catch { Aus @{ ok = $false; grund = ('Outlook (klassisch) nicht erreichbar: ' + $_.Exception.Message) }; exit 0 }
    }
    if ($Art -eq 'entwurf') {
        $d = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Daten)) | ConvertFrom-Json
        $m = $ol.CreateItem(0)
        $m.Subject = [string]$d.betreff
        $m.Body = [string]$d.text
        $m.Display($false)
        Vorn $m.Subject
    } elseif ($Art -eq 'oeffnen' -or $Art -eq 'antworten') {
        $item = $ol.GetNamespace('MAPI').GetItemFromID($EntryId)
        if ($Art -eq 'antworten') { $r = $item.Reply(); $r.Display($false); Vorn $r.Subject }
        else { $item.Display($false); Vorn $item.Subject }
    } else { Aus @{ ok = $false; grund = 'unbekannte Aktion' }; exit 0 }
    Aus @{ ok = $true }
} catch {
    Aus @{ ok = $false; grund = ('Outlook-Aktion gescheitert: ' + $_.Exception.Message) }
}
exit 0
