/* ============================================================================
   EINSTELLUNGEN-TRANSFER PRUEFEN (Komplett-Sicherung, 14.08.)
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/einstellungen_transfer_pruefen.js

   Nutzer-Vorgabe: "die Einstellungen speichern und auch wieder laden. Alles,
   was ich mache, als exportieren." Anlass ist Citrix: Edge wirft unter
   Speicherdruck die Website-Daten weg (12.08. passiert) — Ziele, Empfaenger,
   Layout auf einen Schlag verloren.

   Geprueft: Whitelist (Tagesdaten bleiben DRAUSSEN), Roundtrip funktional am
   Original-Code, Fremdformat/Zukunftsversion abgelehnt, Projekt-Mismatch
   fragt nach, rcKey-Uebersetzung fuer Fremd-Projekt-Pakete, kaputte
   JSON-Werte werden uebersprungen.
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'esl_live_arena_v22.js'), 'utf8');

let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}

console.log('EINSTELLUNGEN-TRANSFER PRUEFEN');
console.log('');

/* ---------------------------------------------------------------------------
   1) Whitelist: drin was reingehoert, draussen was Schaden anrichtet
--------------------------------------------------------------------------- */
console.log('1) Whitelist');

const plainM = SRC.match(/var RC_SICHERN_PLAIN = \[([^\]]+)\]/);
const rckeyM = SRC.match(/var RC_SICHERN_RCKEY = \[([^\]]+)\]/);
pruefe('beide Listen vorhanden', !!plainM && !!rckeyM);
const plainListe = plainM ? plainM[1].match(/'[^']+'/g).map(s => s.slice(1, -1)) : [];
const rckeyListe = rckeyM ? rckeyM[1].match(/'[^']+'/g).map(s => s.slice(1, -1)) : [];

for (const muss of ['rcCfgLayout_v1', 'rcWarHud', 'rcZoom', 'rcZoomAuto', 'rcFeierAus', 'rcReportCfg_v1']) {
  pruefe('plain enthaelt ' + muss, plainListe.indexOf(muss) >= 0);
}
for (const muss of ['rcQueueCfg_v1', 'rcVertriebsZiele', 'rcExportWahl_v1']) {
  pruefe('rcKey-Liste enthaelt ' + muss + ' (projektgetrennt)', rckeyListe.indexOf(muss) >= 0);
}
for (const nie of ['rcEslHistory', 'rcLigaHistDash', 'rcDashboardCode', 'rcWcaCrawlerSrc', 'rcGmCrawlerSrc', 'rcLogbuch']) {
  pruefe('Tagesdaten/Blobs bleiben DRAUSSEN: ' + nie,
    plainListe.indexOf(nie) < 0 && rckeyListe.indexOf(nie) < 0,
    'Historien und Code-Blobs gehoeren nicht in die Datei — zu gross und beim Einspielen gefaehrlich.');
}

/* ---------------------------------------------------------------------------
   2) Funktional: Sammeln -> Einspielen Roundtrip am Original-Code
--------------------------------------------------------------------------- */
console.log('');
console.log('2) Roundtrip funktional');

const von = SRC.indexOf('var RC_SICHERN_PLAIN');
const bis = SRC.indexOf("var gear=document.getElementById('rcCfgBtn')");
const block = (von >= 0 && bis > von) ? SRC.slice(von, bis) : null;
pruefe('Sicherungs-Block laesst sich ausschneiden', !!block);

function baueUmgebung(kuerzel, confirmAntwort) {
  const ablage = {};
  const ls = {
    getItem: k => (k in ablage) ? ablage[k] : null,
    setItem: (k, v) => { ablage[k] = String(v); },
    removeItem: k => { delete ablage[k]; }
  };
  const u = { ablage, reloads: 0, alerts: [], confirms: 0 };
  // Seit 17.08. meldet der Code ueber window.rcSagen (Toast) statt alert() -
  // ein alert haelt die ganze Seite an und blockiert die Fernsteuerung mit.
  // Der Stub muss das mitfuehren, sonst wirft der ausgeschnittene Block.
  const fenster = { rcSagen: function (t) { u.alerts.push(String(t)); } };
  const rcKeyStub = b => b + (kuerzel === 'mobile' ? '_mob' : kuerzel === 'um' ? '_um' : '');
  const f = new Function('window', 'localStorage', 'rcKey', 'rcProjektKuerzel', 'confirm', 'alert', 'location', 'Date',
    block + '\nreturn { sammeln: window.rcEinstellungenSammeln, einspielen: window.rcEinstellungenEinspielen };');
  u.api = f(fenster, ls,
    rcKeyStub,
    function () { return kuerzel; },
    function () { u.confirms++; return confirmAntwort; },
    function (t) { u.alerts.push(String(t)); },
    { reload: function () { u.reloads++; } },
    Date);
  return u;
}

if (block) {
  // Roundtrip Kabel -> Kabel
  const a = baueUmgebung('kabel', true);
  a.ablage.rcZoom = '1.5';
  a.ablage.rcVertriebsZiele = '{"std":{"AL":{"proAgent":{"kip":2}}}}';
  a.ablage.rcEslHistory = '{"riesig":true}';
  const paket = a.api.sammeln(false);
  pruefe('Paket traegt format/version/projekt/stand',
    paket.format === 'esl-arena-einstellungen' && paket.version === 1 && paket.projekt === 'kabel' && !!paket.stand);
  pruefe('gesammelt wird nur die Whitelist (rcEslHistory NICHT dabei)',
    paket.werte.rcZoom === '1.5' && paket.werte.rcVertriebsZiele && !paket.werte.rcEslHistory);
  const b = baueUmgebung('kabel', true);
  const erg = b.api.einspielen(paket);
  pruefe('Einspielen schreibt die Werte und laedt neu',
    b.ablage.rcZoom === '1.5' && b.ablage.rcVertriebsZiele === a.ablage.rcVertriebsZiele && b.reloads === 1 && erg && erg.ok);

  // Fremdformat / Zukunftsversion
  const c = baueUmgebung('kabel', true);
  pruefe('Fremdformat wird abgelehnt', !!(c.api.einspielen({ irgendwas: 1 }) || {}).fehler);
  pruefe('neuere Paket-Version wird abgelehnt',
    !!(c.api.einspielen({ format: 'esl-arena-einstellungen', version: 2, werte: {} }) || {}).fehler);
  pruefe('altes esl-konfig.json (ohne format) faellt NICHT hierher durch',
    !!(c.api.einspielen({ hidden: {}, order: {} }) || {}).fehler,
    'Der kleine Import daneben bleibt dafuer zustaendig — der Fehlertext sagt das.');

  // Projekt-Mismatch: confirm=false bricht ab, nichts geschrieben
  const d = baueUmgebung('kabel', false);
  const mobilPaket = { format: 'esl-arena-einstellungen', version: 1, projekt: 'mobile',
    werte: { rcZoom: '2', 'rcVertriebsZiele_mob': '{"x":1}' } };
  const dErg = d.api.einspielen(mobilPaket);
  pruefe('Projekt-Unterschied fragt nach; Nein bricht ab ohne zu schreiben',
    d.confirms === 1 && !!dErg.fehler && !('rcZoom' in d.ablage));

  // Projekt-Mismatch: confirm=true uebersetzt rcKey-Schluessel aufs hiesige Projekt
  const e = baueUmgebung('kabel', true);
  e.api.einspielen(mobilPaket);
  pruefe('Ja uebersetzt _mob-Schluessel auf den HIESIGEN Projekt-Schluessel',
    e.ablage.rcVertriebsZiele === '{"x":1}' && !('rcVertriebsZiele_mob' in e.ablage),
    'Sonst laegen Mobile-Ziele unerreichbar unter dem falschen Schluessel.');

  // Kaputtes JSON-Feld wird uebersprungen, Rest kommt an
  const g = baueUmgebung('kabel', true);
  g.api.einspielen({ format: 'esl-arena-einstellungen', version: 1, projekt: 'kabel',
    werte: { rcZoom: '1.3', rcWarHud: '{kaputt', boeserFremdSchluessel: 'x' } });
  pruefe('kaputter JSON-Wert wird uebersprungen, gueltige kommen an',
    g.ablage.rcZoom === '1.3' && !('rcWarHud' in g.ablage));
  pruefe('Nicht-Whitelist-Schluessel wird NIE geschrieben',
    !('boeserFremdSchluessel' in g.ablage),
    'Ein Paket darf keine beliebigen localStorage-Schluessel setzen koennen.');
}

/* ---------------------------------------------------------------------------
   3) UI verdrahtet (Zwei-Listen-Regel)
--------------------------------------------------------------------------- */
console.log('');
console.log('3) UI im Sichern-Reiter');

pruefe('Knoepfe im Aufbau (cfgVollExport/cfgVollImport/cfgVollLogo)',
  /id="cfgVollExport"/.test(SRC) && /id="cfgVollImport"/.test(SRC) && /swc\('cfgVollLogo', false\)/.test(SRC));
pruefe('Knoepfe im Handler verdrahtet',
  /on\(q\('cfgVollExport'\),'click'/.test(SRC) && /on\(q\('cfgVollImport'\),'click'/.test(SRC));
pruefe('Dateiname traegt Projekt + Zeitstempel',
  /esl-einstellungen_'\+\(paket\.projekt\|\|'kabel'\)/.test(SRC));

/* ------------------------------------------------------------------------ */
console.log('');
if (fehler === 0) console.log('ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN');
else { console.log(fehler + ' von ' + geprueft + ' PRUEFUNGEN FEHLGESCHLAGEN'); process.exitCode = 1; }
