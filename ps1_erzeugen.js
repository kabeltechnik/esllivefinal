/**
 * ps1_erzeugen.js — ESL_Start.ps1 aus ESL_Start.cmd erzeugen
 * ============================================================
 * Warum es dieses Skript gibt:
 *   Der PowerShell-Teil steckt hinter dem Marker #PSSTART in ESL_Start.cmd.
 *   Die .ps1 daneben ist eine ABLEITUNG davon — und lief in der Praxis
 *   auseinander: Stand 28.07.2026 war sie zwoelf Stunden aelter als die .cmd,
 *   ihr fehlte die komplette Zeile fuer den Genesys-Crawler, und sie endete
 *   ohne pause (Fenster schloss sich nach drei Sekunden). Wer sie startete,
 *   bekam ein halbes System, ohne dass etwas darauf hinwies.
 *
 *   Ab jetzt wird sie nicht mehr von Hand gepflegt, sondern hiermit erzeugt.
 *
 * Aufruf:   node ps1_erzeugen.js
 *
 * Zwei Unterschiede zum .cmd-Block sind gewollt und werden hier gesetzt:
 *   1. $Basis: in der .cmd kommt der Ordner ueber $env:ESLDIR (vom Batch
 *      gesetzt), in der .ps1 muss er aus dem eigenen Skriptpfad kommen.
 *   2. Am Ende ein Read-Host, damit das Fenster bei Direktstart offen bleibt.
 *      Die .cmd braucht das nicht, sie hat ihr eigenes pause.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const CMD = path.join(DIR, 'ESL_Start.cmd');
const PS1 = path.join(DIR, 'ESL_Start.ps1');

if (!fs.existsSync(CMD)) { console.error('ESL_Start.cmd nicht gefunden.'); process.exit(1); }

const roh = fs.readFileSync(CMD, 'utf8');
const i = roh.indexOf('#PSSTART');
if (i < 0) { console.error('Marker #PSSTART fehlt in ESL_Start.cmd.'); process.exit(1); }

// Alles ab dem Marker, den Marker selbst weglassen
let block = roh.slice(i + '#PSSTART'.length).replace(/^\r?\n/, '');

// (1) Ordner-Ermittlung auf den Direktstart umstellen
const vorher = '$Basis = $env:ESLDIR';
const nachher = '$Basis = Split-Path -Parent $MyInvocation.MyCommand.Path';
if (block.indexOf(vorher) === -1) {
  console.error('Zeile "' + vorher + '" nicht gefunden — Aufbau der .cmd hat sich geaendert.');
  process.exit(1);
}
block = block.replace(vorher, nachher);

// (2) Fenster offen halten. Ohne das beendet sich die Konsole mit dem Skript,
//     und im Fehlerfall sieht niemand, woran es lag.
const schluss = [
  '',
  '# Fenster offen halten (nur beim Direktstart der .ps1 noetig — die .cmd hat ihr eigenes pause).',
  'try { Read-Host " [Enter] zum Schliessen" | Out-Null } catch { Start-Sleep -Seconds 20 }',
  ''
].join('\r\n');

const kopf = [
  '# HINWEIS: Diese Datei wird aus dem PowerShell-Teil von ESL_Start.cmd erzeugt.',
  '# NICHT von Hand aendern — Aenderungen gehoeren in die .cmd (hinter #PSSTART),',
  '# danach "node ps1_erzeugen.js" ausfuehren.',
  '# Erzeugt am ' + new Date().toLocaleString('de-DE') + ' aus ESL_Start.cmd.',
  ''
].join('\r\n');

// UTF-8 mit BOM: die alte .ps1 hatte eines, und Windows PowerShell 5.1 liest
// Umlaute in Konsolenausgaben sonst falsch.
fs.writeFileSync(PS1, '﻿' + kopf + block + schluss, 'utf8');

const zeilen = (kopf + block + schluss).split(/\r?\n/).length;
console.log('ESL_Start.ps1 neu erzeugt:');
console.log('  ' + zeilen + ' Zeilen, ' + Math.round(fs.statSync(PS1).size / 1024) + ' KB');
console.log('  Ordner-Ermittlung auf Direktstart umgestellt');
console.log('  Read-Host am Ende ergaenzt (Fenster bleibt offen)');

// Gegenprobe: die Pflichtdateien muessen alle vorkommen
['esl_autopilot.user.js','esl_live_arena_v22.js','kpi_crawler.js','genesys_monitor_crawler.js','Mitarbeiter_IDS_Final_komplett.xlsx']
  .forEach(d => {
    const drin = fs.readFileSync(PS1, 'utf8').indexOf(d) !== -1;
    console.log('  ' + (drin ? 'enthalten:' : 'FEHLT:    ') + ' ' + d);
  });
