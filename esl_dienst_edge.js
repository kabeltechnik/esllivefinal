/* ============================================================================
   ESL-DIENST: EDGE
   ---------------------------------------------------------------------------
   Alles, was der Dienst am Rechner um Edge herum tut: Programm finden, Cache-
   Ordner anlegen, Edge starten, Prozesse und Port-Besitzer lesen, Profilsperre
   pruefen. Die ENTSCHEIDUNG darueber (Argumente, eigen/fremd, Flags) steckt in
   esl_dienst_regeln.js. Nur Node-Bordmittel plus PowerShell fuer die Systemabfragen.

   Eine Systemabfrage, die scheitert, liefert null bzw. PORT_UNBEKANNT - nie einen
   Wert, den ein Aufrufer als "in Ordnung" lesen koennte. Geprueft von
   pruefwerkzeuge/dienst_messen.mjs (fall=edge, fall=edge-hilfen) am echten Edge.
============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

// Die drei Orte wie im APITool-Server (findEdgeBinary).
function edgeFinden() {
  const kandidaten = [
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
    process.env['LOCALAPPDATA'] && path.join(process.env['LOCALAPPDATA'], 'Microsoft\\Edge\\Application\\msedge.exe')
  ];
  return kandidaten.find((p) => p && fs.existsSync(p)) || null;
}

// Der Cache gehoert NICHT ins Profil: das liegt auf dem Citrix-Heimatlaufwerk mit Kontingent, ein
// voller Cache kostet dort Cookies und Anmeldung. Lokal unter %LOCALAPPDATA%, je Profil ein Ordner.
// Beschreibbar wird mit einer echten Schreibprobe geprueft (Test-Path sagt dazu nichts); sonst '' -
// dann bleibt es beim Standard, ein leeres --disk-cache-dir waere schlimmer als keine Umleitung.
function cacheOrdner(profilName) {
  try {
    const basis = process.env['LOCALAPPDATA'];
    if (!basis) return '';
    const dir = path.join(basis, 'regiocom_ESL_Cache', profilName);
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.schreibprobe');
    fs.writeFileSync(probe, 'x');
    fs.unlinkSync(probe);
    return dir;
  } catch (e) { return ''; }
}

// Edge losgeloest starten (ueberlebt den Dienst). Rueckgabe: pid des gestarteten Prozesses.
function edgeStarten(exe, args) {
  const kind = spawn(exe, args, { detached: true, stdio: 'ignore' });
  kind.on('error', () => { /* ein nicht startbares Edge zeigt sich als fehlende Antwort auf /json */ });
  kind.unref();
  return kind.pid;
}

// PowerShell mit UTF-8-Ausgabe (Pfade mit Umlauten). null = gescheitert; '' = lief, nichts ausgegeben.
function powershell(befehl) {
  const kopf = '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); ';
  return new Promise((ja) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', kopf + befehl],
      { timeout: 20000, windowsHide: true, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' },
      (fehler, aus) => ja(fehler ? null : String(aus).replace(/^\uFEFF/, '').trim()));
  });
}

// Die Ausgabe von ConvertTo-Json zur Prozessliste. Der Filter enthaelt node.exe, also diesen Prozess
// selbst: eine WAHRE Liste ist nie leer. Leere Ausgabe heisst "Abfrage lieferte nichts" = null (nicht
// messbar), nie []. prozessKonflikt([]) meldet sonst "kein Konflikt".
function prozesseAusText(text) {
  if (!text) return null;
  try {
    const j = JSON.parse(text);                              // ein einzelner Treffer kommt als Objekt, nicht als Liste
    return (Array.isArray(j) ? j : [j]).filter(Boolean).map((p) => ({ ProcessId: Number(p.ProcessId), Name: p.Name, CommandLine: p.CommandLine || null }));
  } catch (e) { return null; }
}

// Die Prozesse, die fuer Konflikte und Port-Besitz zaehlen. null = Liste nicht lesbar.
async function prozesseLesen() {
  return prozesseAusText(await powershell("Get-CimInstance Win32_Process -Filter 'Name=''msedge.exe'' OR Name=''node.exe'' OR Name=''cmd.exe'' OR Name=''powershell.exe''' | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress"));
}

// Passt zu keinem echten Prozess: portZustand macht daraus 'nicht-pruefbar' statt 'frei'.
const PORT_UNBEKANNT = -1;

// Wer hoert auf dem Port? pid, null = niemand, PORT_UNBEKANNT = Abfrage gescheitert. "Keine
// Verbindung gefunden" ist fuer Get-NetTCPConnection ein Fehler (Exitcode 1) und muss vom echten
// Fehler getrennt werden - sonst sieht "PowerShell kaputt" aus wie "Port frei".
async function portBesitzer(port) {
  const text = await powershell(
    "try { $c = @(Get-NetTCPConnection -LocalPort " + Number(port) + " -State Listen -ErrorAction Stop) } " +
    "catch { if ($_.FullyQualifiedErrorId -notlike 'CmdletizationQuery_NotFound*') { exit 3 }; $c = @() }; " +
    "if ($c.Count) { $c[0].OwningProcess }");
  if (text === null) return PORT_UNBEKANNT;
  const n = parseInt(text, 10);
  return Number.isInteger(n) ? n : null;
}

// Edge haelt <profil>\lockfile exklusiv, solange es mit dem Profil laeuft: Oeffnen schlaegt dann mit
// EBUSY/EPERM fehl. Fehlt die Datei, laeuft nichts. Jeder andere Fehler zaehlt vorsichtshalber als belegt.
function profilBelegt(profil) {
  let fd;
  try {
    fd = fs.openSync(path.join(profil, 'lockfile'), 'r+');
    return false;
  } catch (e) {
    return !(e && e.code === 'ENOENT');
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch (e) { /* nichts zu schliessen */ }
  }
}

module.exports = { edgeFinden, cacheOrdner, edgeStarten, prozesseAusText, prozesseLesen, PORT_UNBEKANNT, portBesitzer, profilBelegt };
