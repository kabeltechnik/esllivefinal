/* ============================================================================
   CDP-ZWEITVERBINDUNG MESSEN (21.08.)  --  KEIN Offline-Pruefwerkzeug!
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/cdp_zweitverbindung_messen.js
   Startet ein EIGENES, headless Edge mit Wegwerf-Profil auf Port 9336.

   DIE FRAGE: Seit 16.08. haelt AnkerSetzen eine DAUERHAFT offene
   CDP-Verbindung je Tab. Alle uebrigen Starter-Funktionen
   (EslAnmeldungAbschicken, WarteAufDashboard, DashboardTab,
   StelleAutopilotSicher, StelleLigaKlickSicher, StelleDashboardSicher)
   oeffnen dagegen jedes Mal eine EIGENE, kurzlebige Verbindung zum SELBEN
   Tab. Laesst Edge das zu - und kommt die Antwort dort sauber an?

   Warum das zaehlt: faellt die zweite Verbindung durch, meldet der Starter
   "ESL-Anmeldung hat nicht automatisch geklappt / kein Passwort gespeichert"
   und "noch kein Dashboard", obwohl beides laeuft. Und DashboardTab findet
   nie ein Dashboard, also wird die Ligaliste NIE geoeffnet.

   FALLE BEIM MESSEN (aus cdp_anker_messen.js): jede Navigation ist ein
   frisches Dokument, Zaehler beginnen dort wieder bei 0.
============================================================================ */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

const PORT = 9336;
const PROFIL = path.join(os.tmpdir(), 'cdp_probe_profil_zweit');
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => fs.existsSync(p));
if (!EDGE) { console.log('Edge nicht gefunden - Messung nicht moeglich.'); process.exit(2); }

const kind = spawn(EDGE, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFIL,
  '--no-first-run', '--no-default-browser-check', '--headless=new', 'about:blank'], { stdio: 'ignore' });

const schlaf = ms => new Promise(r => setTimeout(r, ms));
const holen = url => new Promise((ok, err) => {
  http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => ok(JSON.parse(d))); }).on('error', err);
});

function verbinde(wsUrl) {
  return new Promise((ok, err) => {
    const ws = new WebSocket(wsUrl);
    ws.warteschlange = new Map(); ws.ereignisse = 0; ws.tot = false;
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && ws.warteschlange.has(m.id)) { ws.warteschlange.get(m.id)(m); ws.warteschlange.delete(m.id); }
      else if (!m.id) ws.ereignisse++;
    };
    ws.onclose = () => { ws.tot = true; };
    ws.onopen = () => ok(ws);
    ws.onerror = () => err(new Error('WebSocket abgelehnt'));
  });
}
let lfd = 1;
function sende(ws, methode, params, timeoutMs) {
  return new Promise(ok => {
    const id = lfd++;
    let fertig = false;
    ws.warteschlange.set(id, m => { fertig = true; ok(m); });
    try { ws.send(JSON.stringify({ id, method: methode, params: params || {} })); }
    catch (e) { return ok(null); }
    setTimeout(() => { if (!fertig) { ws.warteschlange.delete(id); ok(null); } }, timeoutMs || 5000);
  });
}

let fehler = 0;
function melde(name, wert, erwartet) {
  const ok = (wert === erwartet);
  if (!ok) fehler++;
  console.log('  ' + (ok ? 'OK  ' : 'ROT ') + name + '  -> ' + wert + (ok ? '' : '  (erwartet: ' + erwartet + ')'));
}

(async () => {
  try {
    let ziele = [];
    for (let i = 0; i < 40 && !ziele.length; i++) {
      await schlaf(250);
      try { ziele = (await holen('http://127.0.0.1:' + PORT + '/json')).filter(z => z.type === 'page'); } catch (e) {}
    }
    if (!ziele.length) throw new Error('kein Tab gefunden');
    const tab = ziele[0];

    console.log('CDP-ZWEITVERBINDUNG MESSEN');
    console.log('');
    console.log('1) Anker offen halten (wie AnkerSetzen)');
    const anker = await verbinde(tab.webSocketDebuggerUrl);
    await sende(anker, 'Page.enable');
    await sende(anker, 'Page.addScriptToEvaluateOnNewDocument', { source: 'window.__anker=1;' });
    await sende(anker, 'Runtime.evaluate', { expression: 'window.__dash=1;"ok"', returnByValue: true });
    melde('Ankerverbindung steht', anker.tot === false, true);

    console.log('');
    console.log('2) Zweite, kurzlebige Verbindung zum SELBEN Tab');
    let zweit = null, angenommen = false;
    try { zweit = await verbinde(tab.webSocketDebuggerUrl); angenommen = true; } catch (e) { angenommen = false; }
    melde('Edge nimmt eine zweite Verbindung an', angenommen, true);

    if (angenommen) {
      const a = await sende(zweit, 'Runtime.evaluate',
        { expression: '(!!window.__dash).toString()', returnByValue: true }, 5000);
      melde('Runtime.evaluate auf der zweiten Verbindung antwortet', !!a, true);
      melde('und liefert den richtigen Wert', a && a.result && a.result.result && a.result.result.value, 'true');
      melde('Anker lebt danach immer noch', anker.tot === false, true);
      try { zweit.close(); } catch (e) {}
    }

    console.log('');
    console.log('3) Dritte Verbindung, waehrend der Anker Ereignisse bekommt');
    // Das ist die Lage im Betrieb: der Anker hat Page.enable, die Seite
    // navigiert, und GENAU DANN fragt der Waechter ueber eine eigene
    // Verbindung nach dem Dashboard.
    const dritt = await verbinde(tab.webSocketDebuggerUrl).catch(() => null);
    melde('dritte Verbindung wird angenommen', !!dritt, true);
    if (dritt) {
      await sende(anker, 'Page.navigate', { url: 'data:text/html,<h1>zwei</h1>' });
      await schlaf(800);
      const b = await sende(dritt, 'Runtime.evaluate',
        { expression: '(!!window.__anker).toString()', returnByValue: true }, 5000);
      melde('Antwort kommt trotz laufender Ereignisse an', !!b, true);
      melde('das verankerte Skript lief im neuen Dokument',
        b && b.result && b.result.result && b.result.result.value, 'true');
      melde('Ereignisse landeten NUR beim Anker', anker.ereignisse > 0 && dritt.ereignisse === 0, true);
      try { dritt.close(); } catch (e) {}
    }

    try { anker.close(); } catch (e) {}
    console.log('');
    console.log(fehler === 0
      ? 'BEFUND: mehrere gleichzeitige CDP-Verbindungen je Tab sind moeglich.'
      : 'BEFUND: ' + fehler + ' Abweichung(en) - siehe ROT oben.');
  } catch (e) {
    console.log('MESSUNG FEHLGESCHLAGEN: ' + e.message);
    fehler = 1;
  } finally {
    try { kind.kill(); } catch (e) {}
    setTimeout(() => process.exit(fehler ? 1 : 0), 300);
  }
})();
