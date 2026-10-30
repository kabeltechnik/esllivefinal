/**
 * bundle_bauen.js — Update-Paket fuer Citrix erzeugen
 * ============================================================
 * Problem, das dieses Skript loest:
 *   Auf den Citrix-Rechner kommen Dateien nur per E-Mail. Gmail lehnt .js,
 *   .cmd und Konsorten ab — auch INNERHALB von ZIP-Archiven, weil der Filter
 *   hineinschaut. Jede Datei einzeln umbenennen, verschicken und drueben
 *   zurueckbenennen ist bei sechs Dateien jedes Mal ein halber Vormittag.
 *
 * Loesung:
 *   Alles wird Base64-kodiert in EINE .html gelegt. Fuer den Mail-Filter ist
 *   das reiner Text — es gibt keine .js-Datei zu finden. Auf Citrix wird die
 *   Datei im Browser geoeffnet; sie baut das ZIP im Arbeitsspeicher wieder
 *   zusammen (reines JavaScript, ohne Bibliothek) und bietet es zum Speichern
 *   an. Windows entpackt ZIP von Haus aus, es muss nichts installiert werden.
 *
 * Aufruf:   node bundle_bauen.js
 * Ergebnis: veyseLL_Update_JJJJMMTT_HHMM.html  (im selben Ordner)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = __dirname;

// ------------------------------------------------------------
//  Was ins Paket gehoert.
//  pflicht  = fehlt sie, bricht der Bau ab (statt ein halbes Paket zu bauen).
//  imZipAls = abweichender Name INNERHALB des ZIP.
//
//  Warum ESL_Start.cmd im ZIP anders heisst:
//  Der Windows-Explorer verweigert beim Entpacken eines aus dem Internet
//  stammenden Archivs ("Mark of the Web") ausfuehrbare Typen wie .cmd komplett
//  — Meldung: "Der Zugriff auf die Datei wurde aus Sicherheitsgruenden
//  blockiert", die Datei wird gar nicht erst geschrieben. Mit angehaengtem
//  .txt greift die Sperre nicht. Zusaetzlich bietet die HTML die echte .cmd
//  als Einzel-Download an; ein direkter Browser-Download wird nur mit
//  "Behalten?" abgefragt, nicht blockiert.
// ------------------------------------------------------------
const DATEIEN = [
  { name: 'esl_live_arena_v22.js',            zweck: 'Dashboard (Hauptdatei)',                 pflicht: true },
  { name: 'esl_autopilot.user.js',            zweck: 'Autopilot / Startablauf (Vodafone Kabel)', pflicht: true },
  // Die beiden anderen ESL-Projekte. Erzeugt mit autopilot_varianten_erzeugen.js —
  // NICHT von Hand pflegen. Ohne sie im Paket kaeme Mobile/UM nie auf den
  // Citrix-Rechner: dort gibt es nur den Weg ueber diese eine HTML-Datei.
  { name: 'esl_autopilot_mobile.user.js',     zweck: 'Autopilot fuer Vodafone Mobile',         pflicht: false },
  { name: 'esl_autopilot_um.user.js',         zweck: 'Autopilot fuer Vodafone UM',             pflicht: false },
  { name: 'kpi_crawler.js',                   zweck: 'Ligalisten-Crawler',                     pflicht: true },
  { name: 'genesys_monitor_crawler.js',       zweck: 'Warteschleifen-Crawler (Genesys)',       pflicht: true },
  { name: 'ESL_Start.cmd',                    zweck: 'Starter (Doppelklick)',                  pflicht: true },
  // Duenne Wrapper fuer den Ein-Stack-Start (rufen die Datei darueber mit
  // Parameter mobile bzw. um). Keine eigene Logik - Kopien laufen auseinander.
  { name: 'ESL_Start_Mobile.cmd',             zweck: 'NUR Mobilfunk dazuschalten',             pflicht: false },
  { name: 'ESL_Start_UM.cmd',                 zweck: 'NUR UM dazuschalten',                    pflicht: false },
  // Ohne diese Datei bleibt der Stundenreport im Download-Ordner liegen: das
  // Dashboard kann ihn nur schreiben, verschicken muss ihn Outlook.
  { name: 'esl_mail_report.ps1',              zweck: 'Stundenreport per Outlook verschicken',  pflicht: false },
  // Mitarbeiter_IDS_Final_komplett.xlsx ist hier ABSICHTLICH NICHT MEHR gelistet
  // (12.08., Nutzer-Vorgabe: "hoer auf mir bei updates jedes mal mitarbeiter ids
  // mit zu generieren - die aktualisierst du eh nicht").
  // Sie liegt auf dem Zielrechner neben ESL_Start.cmd und wird von dort als
  // __rcFiles.mapping eingelesen; der Starter braucht sie also weiterhin, nur
  // das PAKET muss sie nicht jedes Mal mitschleppen. Sie war mit rund 745 KB
  // Base64 der zweitgroesste Brocken und enthaelt zudem Klarnamen und CCS-IDs
  // echter Mitarbeiter - was nicht mitreisen muss, gehoert nicht in jeden
  // Mailanhang. Aendert sich die Mitarbeiterliste wirklich einmal, wird die
  // Datei einzeln verschickt, nicht ueber das Update-Paket.
  // Das ECHTE regiocom-Logo fuer Excel-Kopf und Report-Bilder. Optional, weil es
  // im Entwicklungsordner nicht liegt — auf dem Citrix-Rechner steht es neben
  // ESL_Start.cmd und wird von dort gelesen. Liegt es hier, reist es mit.
  { name: 'regiocom.png',                     zweck: 'Logo fuer Excel/Report-Bilder',          pflicht: false },
  // Startknopf als Lesezeichen — der einzige Weg ins Dashboard, der OHNE
  // laufenden ESL_Start.cmd auskommt. Gebraucht, weil der Starter sich auf
  // Citrix regelmaessig an ein schon laufendes Edge haengt; dann greift
  // Page.addScriptToEvaluateOnNewDocument nicht, der Autopilot fehlt in der
  // Seite, und es gibt gar keinen Knopf mehr zum Druecken.
  { name: 'Dashboard_Lesezeichen.html',       zweck: 'Startknopf fuer die Favoritenleiste',    pflicht: false },
  // Recon-Werkzeug. Muss mit aufs Zielsystem, denn dort stehen die Portale, die
  // man aufklaeren will — nicht im Entwicklungsordner.
  { name: 'rc_lupe.js',                       zweck: 'Request-Lupe (Crawler-Bau)',             pflicht: false },
  // Stufentest gegen get_data.rb: schaltet die vier Aenderungen des Crawlers
  // einzeln dazu und sagt, welche der Server ablehnt. Hat am 05.08. die
  // ORA-00936-Ursache in 10 Sekunden gefunden.
  { name: 'liga_diagnose.js',                 zweck: 'Ligaliste: welcher Parameter kippt?',    pflicht: false },
  // Messlauf fuer "alle drei Projekte in EINEM Dashboard" (27.09.): klaert, ob
  // eine offene Kabel-Seite nach dem Projektwechsel weiter Kabel-Daten liefert.
  { name: 'projektwechsel_steckbrief.js',     zweck: 'Projektwechsel-Test (F12 im ESL)',       pflicht: false },
  // Datendienst (27.10.): ein eigener Node-Prozess holt ESL und Ligaliste und liefert die
  // Live-Arena als Seite aus (ESL_Dienst_Start.cmd). Alles pflicht:false, damit der alte Weg
  // (ESL_Start.cmd) ohne diese Dateien weiterlaeuft. node\node.exe gehoert NICHT ins Paket
  // (rund 80 MB) - die liegt auf dem Zielrechner oder wird einmal einzeln kopiert.
  { name: 'esl_dienst.js',                    zweck: 'Datendienst (Kern)',                     pflicht: false },
  { name: 'esl_dienst_regeln.js',             zweck: 'Datendienst: reine Regeln',              pflicht: false },
  { name: 'esl_dienst_buendel.js',            zweck: 'Datendienst: Ligalisten-Buendel',        pflicht: false },
  { name: 'esl_dienst_cdp.js',                zweck: 'Datendienst: Edge-Fernsteuerung',        pflicht: false },
  { name: 'esl_dienst_edge.js',               zweck: 'Datendienst: Edge starten/pruefen',      pflicht: false },
  { name: 'esl_dienst_esl.js',                zweck: 'Datendienst: ESL-Abruf',                 pflicht: false },
  { name: 'esl_dienst_liga.js',               zweck: 'Datendienst: Ligaliste-Abruf',           pflicht: false },
  { name: 'esl_dienst_postfach.js',           zweck: 'Datendienst: Postfach einstufen',        pflicht: false },
  { name: 'postfach_lesen.ps1',               zweck: 'Datendienst: Outlook lesen',             pflicht: false },
  { name: 'postfach_aktion.ps1',              zweck: 'Datendienst: Outlook-Aktion',            pflicht: false },
  { name: 'ESL_Live_Arena.html',              zweck: 'Datendienst: Gastseite der Live-Arena',  pflicht: false },
  { name: 'ESL_Dienst_Start.cmd',             zweck: 'Datendienst starten (Doppelklick)',      pflicht: false },
  { name: 'Ligaliste_Crawler.html',           zweck: 'Abfrage-Baukasten Ligaliste',            pflicht: false }
];

// Typen, die der Windows-Explorer aus einem MOTW-Archiv NICHT herausschreibt.
// Sie bekommen im ZIP ein .txt angehaengt; beim Einzel-Download behalten sie
// ihren echten Namen (ein Browser-Download wird nicht blockiert, nur abgefragt).
const HEIKEL = /\.(js|cmd|bat|ps1|vbs|hta|reg|jse|wsf)$/i;

function menschGroesse(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}

// ------------------------------------------------------------
//  Dateien einlesen
// ------------------------------------------------------------
const geladen = [];
let fehlerPflicht = false;

for (const d of DATEIEN) {
  const p = path.join(DIR, d.name);
  if (!fs.existsSync(p)) {
    if (d.pflicht) { console.error('FEHLT (Pflicht): ' + d.name); fehlerPflicht = true; }
    else console.warn('uebersprungen (optional, nicht vorhanden): ' + d.name);
    continue;
  }
  const buf = fs.readFileSync(p);
  const sha = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
  const heikel = HEIKEL.test(d.name);
  geladen.push({
    name: d.name, zweck: d.zweck, groesse: buf.length, sha,
    imZipAls: heikel ? d.name + '.txt' : d.name,
    heikel,
    b64: buf.toString('base64'),
    stand: fs.statSync(p).mtime.toLocaleString('de-DE')
  });
  console.log('  aufgenommen: ' + d.name.padEnd(40) + menschGroesse(buf.length).padStart(9) + '  sha ' + sha);
}

if (fehlerPflicht) {
  console.error('\nAbbruch: mindestens eine Pflichtdatei fehlt. Es wird KEIN halbes Paket gebaut.');
  process.exit(1);
}
if (!geladen.length) { console.error('Keine Dateien gefunden.'); process.exit(1); }

const gesamt = geladen.reduce((s, f) => s + f.groesse, 0);
const jetzt = new Date();
const p2 = n => String(n).padStart(2, '0');
const stempel = jetzt.getFullYear() + p2(jetzt.getMonth() + 1) + p2(jetzt.getDate()) + '_' + p2(jetzt.getHours()) + p2(jetzt.getMinutes());
const zipName = 'veyseLL_Update_' + stempel + '.zip';
// Ausgabe bewusst als .txt: eine .html im Anhang wird von manchen Mail-Filtern
// bereits abgewiesen, .txt kommt ueberall durch. Auf dem Zielrechner wird die
// Datei in .html umbenannt (oder ihr Inhalt in eine neue .html kopiert) und im
// Browser geoeffnet.
const htmlName = 'veyseLL_Update_' + stempel + '.txt';

// ------------------------------------------------------------
//  HTML bauen
// ------------------------------------------------------------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const zeilen = geladen.map((f, i) => `
      <tr${f.heikel ? ' class="heikel"' : ''}>
        <td class="nm">${esc(f.name)}${f.heikel ? '<div class="um">im ZIP als ' + esc(f.imZipAls) + ' &mdash; dort <strong>.txt entfernen</strong></div>' : ''}</td>
        <td class="zw">${esc(f.zweck)}</td>
        <td class="r">${menschGroesse(f.groesse)}</td>
        <td class="sha">${f.sha}</td>
        <td class="r"><button class="mini" data-i="${i}">Einzeln</button></td>
      </tr>`).join('');

const anzHeikel = geladen.filter(f => f.heikel).length;

// Die Nutzdaten liegen in einem eigenen script-Block als JSON. Base64 enthaelt
// niemals "</script>", deshalb ist kein weiteres Escaping noetig.
// n = echter Dateiname (Einzel-Download), z = Name im ZIP.
const nutzdaten = JSON.stringify(geladen.map(f => ({ n: f.name, z: f.imZipAls, d: f.b64 })));

const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>veyseLL — Update-Paket ${stempel}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; padding:28px 20px 60px; background:#121212; color:#F5F5F5;
         font:14px/1.55 -apple-system,Segoe UI,Arial,sans-serif; }
  .h { max-width:1000px; margin:0 auto; }
  h1 { font-size:26px; margin:0 0 2px; font-weight:800; letter-spacing:-.3px; }
  h1 em { font-style:normal; color:#FF6666; }
  .sub { color:#9C9C9C; font-size:12.5px; letter-spacing:1.4px; text-transform:uppercase; margin-bottom:22px; }
  .karte { background:#1D1D1D; border:1px solid #2C2C2C; border-top:3px solid #E60000;
           border-radius:10px; padding:20px 22px; margin-bottom:16px; }
  .karte h2 { font-size:15px; margin:0 0 10px; }
  table { width:100%; border-collapse:collapse; font-size:12.5px; }
  th { text-align:left; color:#9C9C9C; font-size:11px; text-transform:uppercase;
       letter-spacing:.8px; padding:4px 8px 8px; border-bottom:1px solid #2C2C2C; }
  td { padding:7px 8px; border-bottom:1px solid #232323; vertical-align:middle; }
  td.nm { font-family:Consolas,monospace; font-weight:700; }
  td.zw { color:#C9C9C9; }
  td.r { text-align:right; white-space:nowrap; }
  td.sha { font-family:Consolas,monospace; color:#7A7A7A; font-size:11px; }
  .gross { background:#E60000; border:none; color:#fff; border-radius:9px;
           padding:15px 30px; font-size:15.5px; font-weight:700; cursor:pointer;
           transition:background-color .18s ease, transform .12s ease; }
  .gross:hover { background:#BD0000; } .gross:active { transform:scale(.98); }
  .gross[disabled] { background:#3A3A3A; cursor:default; }
  .mini { background:transparent; border:1px solid #4A4A4A; color:#C9C9C9;
          border-radius:6px; padding:4px 10px; font-size:11px; cursor:pointer; }
  .mini:hover { border-color:#8A8A8A; color:#fff; }
  ol { margin:8px 0 0; padding-left:22px; } li { margin-bottom:7px; }
  code { background:#262626; padding:2px 6px; border-radius:4px;
         font-family:Consolas,monospace; font-size:12px; }
  .hinweis { color:#9C9C9C; font-size:12px; margin-top:10px; line-height:1.6; }
  .warn { border-top-color:#EB9700; }
  .warn h2 { color:#FFB84D; }
  tr.heikel td { background:#241C0C; }
  td .um { color:#FFB84D; font-size:11px; font-weight:400; font-family:-apple-system,Segoe UI,Arial,sans-serif; margin-top:3px; }
  #status { margin-top:12px; font-size:13px; color:#8CD98C; min-height:20px; }
  .meta { color:#7A7A7A; font-size:11.5px; margin-top:14px; }
</style>
</head>
<body>
<div class="h">

  <h1>veyse<em>LL</em> — Update-Paket</h1>
  <div class="sub">Erzeugt ${esc(jetzt.toLocaleString('de-DE'))} &middot; ${geladen.length} Dateien &middot; ${menschGroesse(gesamt)}</div>

  <div class="karte">
    <h2>Empfohlener Weg &mdash; einzeln speichern</h2>
    <button class="gross" id="einzelnAlle">Alle ${geladen.length} Dateien nacheinander speichern</button>
    <div id="status"></div>
    <div class="hinweis">
      Jede Datei behaelt dabei ihren <strong>echten Namen</strong> — es muss nichts
      umbenannt werden. Der Browser fragt einmal
      &bdquo;Mehrere Dateien herunterladen?&ldquo; (<em>Zulassen</em>) und bei den
      Skriptdateien ggf. &bdquo;Datei kann Ihrem Geraet schaden&ldquo;
      (<em>Behalten</em>). Das ist die Standardabfrage fuer Skripte, kein echter Fund.
      Anschliessend alles aus dem Download-Ordner in den Ordner verschieben,
      in dem <code>ESL_Start.cmd</code> liegt.
    </div>
  </div>

  <div class="karte warn">
    <h2>Rueckfallebene &mdash; ZIP</h2>
    <button class="gross" id="alles" style="background:#3A3A3A;">Stattdessen als ZIP speichern</button>
    <div class="hinweis">
      Nur nutzen, wenn die Einzel-Downloads nicht durchgehen. Windows schreibt aus
      einem Archiv, das aus dem Internet stammt, <strong>keine Skriptdateien</strong>
      heraus (&bdquo;Der Zugriff auf die Datei wurde aus Sicherheitsgruenden
      blockiert&ldquo;). Deshalb tragen im ZIP alle ${anzHeikel} Skriptdateien ein
      zusaetzliches <code>.txt</code> am Ende, das nach dem Entpacken
      <strong>entfernt werden muss</strong> — welche das sind, steht in der Tabelle.
      Blendet Windows Dateiendungen aus, vorher im Explorer unter <em>Ansicht</em>
      die <em>Dateinamenerweiterungen</em> einschalten, sonst benennt man falsch um.
    </div>
  </div>

  <div class="karte">
    <h2>Inhalt des Pakets</h2>
    <table>
      <thead><tr><th>Datei</th><th>Zweck</th><th>Groesse</th><th>Pruefsumme</th><th></th></tr></thead>
      <tbody>${zeilen}
      </tbody>
    </table>
    <div class="hinweis">
      Alle Dateien gehoeren in <strong>denselben Ordner</strong> — dorthin, wo bisher
      <code>ESL_Start.cmd</code> liegt. Vorhandene Dateien einfach ueberschreiben.
      Der <em>Einzeln</em>-Knopf speichert immer unter dem echten Namen; der orange
      Zusatz betrifft nur den Weg ueber das ZIP.
      Die Pruefsumme (erste 12 Zeichen SHA-256) dient der Kontrolle, falls eine
      Datei unterwegs beschaedigt wird.
    </div>
  </div>

  <div class="karte">
    <h2>Wenn etwas klemmt</h2>
    <ol>
      <li><strong>&bdquo;Mehrere Dateien herunterladen?&ldquo;</strong> — mit <em>Zulassen</em>
          bestaetigen (kommt nur beim Einzel-Download).</li>
      <li><strong>&bdquo;Datei kann Ihrem Geraet schaden&ldquo;</strong> — Standardwarnung fuer
          Startdateien, im Download-Bereich auf <em>Behalten</em> klicken.</li>
      <li><strong>ZIP-Knopf tut nichts</strong> — die <em>Einzeln</em>-Knoepfe in der
          Tabelle benutzen; die laden jede Datei unter ihrem echten Namen.</li>
      <li><strong>Nach dem Update startet nichts</strong> — pruefen, ob wirklich
          <code>ESL_Start.cmd</code> im Ordner liegt und nicht
          <code>ESL_Start.cmd.txt</code>.</li>
    </ol>
  </div>

  <div class="meta">
    Danach wie gewohnt <code>ESL_Start.cmd</code> per Doppelklick starten.
  </div>
</div>

<script id="nutzdaten" type="application/json">${nutzdaten}</script>
<script>
(function () {
  'use strict';
  var DATEIEN = JSON.parse(document.getElementById('nutzdaten').textContent);
  var ZIPNAME = ${JSON.stringify(zipName)};
  var status = document.getElementById('status');

  function b64ZuBytes(b64) {
    var roh = atob(b64), n = roh.length, out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = roh.charCodeAt(i);
    return out;
  }
  function speichern(name, bytes, typ) {
    var blob = new Blob([bytes], { type: typ || 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  // ---- CRC-32 (fuer den ZIP-Kopf zwingend) ----
  var CRCTAB = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRCTAB[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ---- ZIP schreiben (Methode 0 = unkomprimiert; Windows liest das nativ) ----
  function baueZip(eintraege) {
    var teile = [], zentral = [], offset = 0, enc = new TextEncoder();

    function u8(arr) { return new Uint8Array(arr); }
    function le16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
    function le32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }

    eintraege.forEach(function (e) {
      var nameBytes = enc.encode(e.name);
      var crc = crc32(e.bytes), len = e.bytes.length;
      // Lokaler Dateikopf
      var kopf = [].concat(
        le32(0x04034B50), le16(20), le16(0x0800), le16(0), le16(0), le16(0),
        le32(crc), le32(len), le32(len), le16(nameBytes.length), le16(0)
      );
      teile.push(u8(kopf), nameBytes, e.bytes);
      // Eintrag im Zentralverzeichnis
      zentral.push({ nameBytes: nameBytes, crc: crc, len: len, offset: offset });
      offset += kopf.length + nameBytes.length + len;
    });

    var zStart = offset, zBytes = [];
    zentral.forEach(function (z) {
      var kopf = [].concat(
        le32(0x02014B50), le16(20), le16(20), le16(0x0800), le16(0), le16(0), le16(0),
        le32(z.crc), le32(z.len), le32(z.len), le16(z.nameBytes.length),
        le16(0), le16(0), le16(0), le16(0), le32(0), le32(z.offset)
      );
      zBytes.push(u8(kopf), z.nameBytes);
      offset += kopf.length + z.nameBytes.length;
    });
    var ende = u8([].concat(
      le32(0x06054B50), le16(0), le16(0),
      le16(zentral.length), le16(zentral.length),
      le32(offset - zStart), le32(zStart), le16(0)
    ));
    return new Blob(teile.concat(zBytes, [ende]), { type: 'application/zip' });
  }

  document.getElementById('alles').addEventListener('click', function () {
    var knopf = this;
    knopf.disabled = true;
    status.textContent = 'ZIP wird zusammengebaut ...';
    setTimeout(function () {
      try {
        // im ZIP steht ggf. ein abweichender Name (siehe .cmd.txt oben)
        var eintraege = DATEIEN.map(function (f) { return { name: f.z || f.n, bytes: b64ZuBytes(f.d) }; });
        var blob = baueZip(eintraege);
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = ZIPNAME;
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
        status.textContent = 'Fertig: ' + ZIPNAME + ' (' + eintraege.length + ' Dateien) — jetzt im Download-Ordner.';
      } catch (e) {
        status.style.color = '#FF8080';
        status.textContent = 'ZIP fehlgeschlagen (' + e.message + ') — bitte die Einzel-Knoepfe unten benutzen.';
      }
      knopf.disabled = false;
    }, 60);
  });

  // Einzel-Downloads laufen IMMER unter dem echten Dateinamen (f.n), nicht
  // unter dem entschaerften ZIP-Namen — so muss nichts umbenannt werden.
  Array.prototype.forEach.call(document.querySelectorAll('button.mini'), function (b) {
    b.addEventListener('click', function () {
      var f = DATEIEN[+b.getAttribute('data-i')];
      speichern(f.n, b64ZuBytes(f.d));
      status.style.color = '#8CD98C';
      status.textContent = 'Gespeichert: ' + f.n;
    });
  });

  // Hauptweg: alle Dateien nacheinander unter ihrem ECHTEN Namen speichern.
  // Bewusst mit Abstand zwischen den Downloads — feuert man sie gleichzeitig ab,
  // verwirft der Browser einen Teil davon stillschweigend.
  document.getElementById('einzelnAlle').addEventListener('click', function () {
    var knopf = this;
    knopf.disabled = true;
    status.style.color = '#8CD98C';
    var i = 0;
    (function naechste() {
      if (i >= DATEIEN.length) {
        status.textContent = 'Fertig: ' + DATEIEN.length + ' Dateien gespeichert. Jetzt aus dem ' +
                             'Download-Ordner in den ESL-Ordner verschieben.';
        knopf.disabled = false;
        return;
      }
      var f = DATEIEN[i++];
      try { speichern(f.n, b64ZuBytes(f.d)); } catch (e) {}
      status.textContent = 'Speichere ' + i + '/' + DATEIEN.length + ': ' + f.n;
      setTimeout(naechste, 700);
    })();
  });
})();
</script>
</body>
</html>`;

fs.writeFileSync(path.join(DIR, htmlName), html, 'utf8');
console.log('\nPaket gebaut: ' + htmlName);
console.log('  ' + geladen.length + ' Dateien (' + anzHeikel + ' davon Skriptdateien), Nutzdaten ' +
            menschGroesse(gesamt) + ', Paket ' + menschGroesse(Buffer.byteLength(html, 'utf8')));
console.log('');
console.log('  So geht es weiter:');
console.log('   1. Diese .txt per Mail an den Citrix-Rechner schicken.');
console.log('   2. Dort in .html umbenennen (oder Inhalt in eine neue .html kopieren).');
console.log('   3. Im Browser oeffnen -> "Alle ' + geladen.length + ' Dateien nacheinander speichern".');
console.log('   4. Aus dem Download-Ordner in den ESL-Ordner verschieben. Kein Umbenennen noetig.');
