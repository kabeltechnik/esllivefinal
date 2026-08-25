/* ============================================================================
   CDP-ANKER MESSEN (16.08.)  --  KEIN Offline-Pruefwerkzeug!
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/cdp_anker_messen.js
   Startet ein EIGENES, headless Edge mit Wegwerf-Profil auf Port 9335 und
   misst am echten Browser, worauf die ganze Start-Automatik beruht.
   Heisst bewusst NICHT *_pruefen.js - der Sammel-Einzeiler soll es nicht mit
   aufrufen (es braucht Edge und ein paar Sekunden).

   GEMESSEN am 16.08.2026:
     Verbindung offen, dann navigiert       -> Skript lief
     Verbindung ZU, dann navigiert          -> Skript lief NICHT
     Page.disable                           -> Skript lief NICHT
     Page.enable                            -> ~6 Ereignisse je Navigation
     Anker offen + kurzlebige Verbindungen  -> Skript lief (Anker haelt)

   WARUM DAS ZAEHLT: Page.addScriptToEvaluateOnNewDocument haengt an der
   CDP-SITZUNG. RuesteTabAus hat die Verbindung sofort geschlossen - der
   Autopilot lief danach nur auf der einen Seite, in die er zusaetzlich per
   Runtime.evaluate gespritzt wurde, und war nach jeder Navigation weg. Genau
   das war die Ursache dafuer, dass das Dashboard erst 5 bis 10 Minuten nach
   dem Login kam: es ging immer nur einen Schritt je Waechter-Durchlauf.

   FALLE BEIM MESSEN SELBST: jede Navigation ist ein FRISCHES Dokument, der
   Zaehler faengt dort wieder bei 0 an. 1 heisst "lief", 0 heisst "lief nicht".
   Die erste Fassung summierte auf und erwartete >=4 - sie meldete deshalb
   einen Fehler, obwohl der Code richtig war.
============================================================================ */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');

const PORT = 9335;
const PROFIL = path.join(os.tmpdir(), 'cdp_probe_profil3');
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => require('fs').existsSync(p));

const kind = spawn(EDGE, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFIL,
  '--no-first-run', '--no-default-browser-check', '--headless=new', 'about:blank'], { stdio: 'ignore' });

const schlaf = ms => new Promise(r => setTimeout(r, ms));
const holen = url => new Promise((ok, err) => {
  http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => ok(JSON.parse(d))); }).on('error', err);
});
function verbinde(wsUrl) {
  return new Promise((ok, err) => {
    const ws = new WebSocket(wsUrl);
    ws.warteschlange = new Map(); ws.ereignisse = 0;
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && ws.warteschlange.has(m.id)) { ws.warteschlange.get(m.id)(m); ws.warteschlange.delete(m.id); }
      else if (!m.id) ws.ereignisse++;
    };
    ws.onopen = () => ok(ws); ws.onerror = err;
  });
}
let nid = 0;
const sende = (ws, method, params) => new Promise(ok => {
  const id = ++nid; ws.warteschlange.set(id, ok);
  ws.send(JSON.stringify({ id, method, params: params || {} }));
});
const probe = async ws => (await sende(ws, 'Runtime.evaluate',
  { expression: 'window.__probe||0', returnByValue: true })).result.result.value;

(async function () {
  try {
    let ziele = [];
    for (let i = 0; i < 40 && !ziele.length; i++) {
      await schlaf(300);
      try { ziele = (await holen('http://127.0.0.1:' + PORT + '/json')).filter(t => t.type === 'page'); } catch (e) {}
    }
    const wsUrl = ziele[0].webSocketDebuggerUrl;

    // Anker aufbauen und OFFEN lassen
    const anker = await verbinde(wsUrl);
    await sende(anker, 'Page.enable');
    await sende(anker, 'Page.addScriptToEvaluateOnNewDocument', { source: 'window.__probe=(window.__probe||0)+1;' });

    // Jede Navigation ist ein FRISCHES Dokument - der Zaehler faengt dort wieder
    // bei 0 an. 1 heisst also "Skript lief", 0 heisst "Skript lief nicht".
    // Aufsummieren waere falsch (erste Fassung dieser Pruefung erwartete >=4 und
    // meldete deshalb faelschlich einen Fehler).
    let gelaufen = 0, runden = 0;
    // Drei Runden Waechter nachstellen: kurzlebige Verbindung auf, Abfrage, zu.
    for (let runde = 1; runde <= 3; runde++) {
      const kurz = await verbinde(wsUrl);
      await sende(kurz, 'Runtime.evaluate', { expression: '1+1', returnByValue: true });
      await sende(kurz, 'Page.enable');                       // wie StelleAutopilotSicher
      await sende(kurz, 'Page.addScriptToEvaluateOnNewDocument', { source: 'window.__egal=1;' });
      kurz.close();
      await schlaf(400);
      await sende(anker, 'Page.navigate', { url: 'about:blank?r=' + runde });
      await schlaf(900);
      const v = await probe(anker); runden++; if (v >= 1) gelaufen++;
      console.log('Runde ' + runde + ': kurzlebige Verbindung auf+zu, dann navigiert -> Skript lief: '
                  + (v >= 1 ? 'JA' : 'NEIN'));
    }

    // Gegenprobe im selben Lauf: Anker schliessen, dann navigieren. Muss NEIN
    // ergeben - sonst misst die Pruefung gar nichts.
    const wsUrl2 = wsUrl;
    anker.close();
    await schlaf(700);
    const nach = await verbinde(wsUrl2);
    await sende(nach, 'Page.enable');
    await sende(nach, 'Page.navigate', { url: 'about:blank?gegen=1' });
    await schlaf(900);
    const g = await probe(nach);
    console.log('GEGENPROBE: Anker geschlossen, dann navigiert -> Skript lief: ' + (g >= 1 ? 'JA' : 'NEIN'));
    console.log('');
    console.log((gelaufen === runden && g === 0)
      ? 'ERGEBNIS: Anker haelt. Kurzlebige Verbindungen stoeren ihn NICHT.'
      : 'ERGEBNIS: nicht tragfaehig (' + gelaufen + '/' + runden + ' Runden, Gegenprobe=' + g + ')');
    nach.close();
    anker.close();
  } catch (e) { console.log('FEHLER: ' + e.message); }
  finally { try { kind.kill(); } catch (e) {} process.exit(0); }
})();
