/* ============================================================================
   ESL-DIENST: CDP (Chrome DevTools Protocol)
   ---------------------------------------------------------------------------
   Die Fernsteuerung von Edge fuer alle anderen Dienstmodule: Tab-Liste, eine
   Sitzung mit Fristen, neue Tabs, Cookie, echte Maus-/Tastenereignisse.
   Nur Node-Bordmittel (globales fetch und WebSocket, Node 22+).

   Jede Verbindung, jeder Befehl und jedes Lesen hat eine eigene Frist - ein
   haengender Tab darf den Dienst nie anhalten. Geprueft von
   pruefwerkzeuge/dienst_messen.mjs (fall=edge) am echten Edge.
============================================================================ */
'use strict';

async function cdpGet(port, pfad, fristMs) {
  try {
    const r = await fetch('http://127.0.0.1:' + port + pfad, { signal: AbortSignal.timeout(fristMs) });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

// Liste der Ziele (Tabs, Worker, ...) oder null, wenn Edge nicht antwortet.
function cdpListe(port) { return cdpGet(port, '/json', 2500); }

// WebSocket-Adresse des BROWSERS (nicht eines Tabs): dort laufen Target.* und Storage.*.
async function cdpBrowserWs(port) {
  const v = await cdpGet(port, '/json/version', 2500);
  return (v && v.webSocketDebuggerUrl) || null;
}

// Nur echte Seiten mit Webadresse. Eine leere Adresse (frischer Tab), chrome-extension://,
// devtools:// und about:blank fallen per Bauart heraus (Positivliste statt Sperrliste).
function seitenTabs(liste) {
  return (liste || []).filter((t) => t && t.type === 'page' && /^https?:\/\//i.test(t.url || ''));
}

// Eine Sitzung auf einer WebSocket-Adresse. fn bekommt s mit befehl / auswerten / seite;
// fristMs gilt fuer die ganze Sitzung (inkl. Verbindungsaufbau), jeder Befehl hat zusaetzlich
// seine eigene Frist. Ende der Sitzung schliesst die Verbindung; offene Befehle scheitern.
function mitSitzung(wsUrl, fn, fristMs = 20000) {
  return new Promise((resolve, reject) => {
    if (!wsUrl || typeof WebSocket === 'undefined') return reject(new Error('WebSocket nicht verfuegbar oder keine wsUrl'));
    let ws, fertig = false, nr = 0;
    const offen = new Map();
    const ende = (fehler, wert) => {
      if (fertig) return;
      fertig = true;
      clearTimeout(gesamt);
      for (const p of offen.values()) { clearTimeout(p.timer); p.nein(fehler || new Error('Sitzung beendet')); }
      offen.clear();
      try { ws.close(); } catch (e) { /* war nie offen */ }
      if (fehler) reject(fehler); else resolve(wert);
    };
    const gesamt = setTimeout(() => ende(new Error('CDP-Sitzung: keine Fertigstellung nach ' + fristMs + ' ms')), fristMs);

    const befehl = (method, params = {}, frist = 15000) => new Promise((ja, nein) => {
      if (fertig) return nein(new Error('Sitzung beendet'));
      const id = ++nr;
      const timer = setTimeout(() => { offen.delete(id); nein(new Error('CDP ' + method + ': keine Antwort nach ' + frist + ' ms')); }, frist);
      offen.set(id, { ja, nein, timer });
      try { ws.send(JSON.stringify({ id, method, params })); } catch (e) { clearTimeout(timer); offen.delete(id); nein(e); }
    });

    // returnByValue + awaitPromise; eine Ausnahme in der Seite wird zum Error.
    const auswerten = async (ausdruck, frist = 15000) => {
      const r = await befehl('Runtime.evaluate', { expression: ausdruck, awaitPromise: true, returnByValue: true }, frist);
      if (r && r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error((d.exception && d.exception.description) || d.text || 'JS-Fehler in der Seite');
      }
      return r && r.result ? r.result.value : undefined;
    };
    // Eine Funktion samt Argument in die Seite schicken: sie darf nichts aus dem Node-Umfeld nutzen.
    const seite = (f, arg, frist) => auswerten('(' + f.toString() + ')(' + JSON.stringify(arg) + ')', frist);
    const s = { befehl, auswerten, seite };

    try { ws = new WebSocket(wsUrl); } catch (e) { return ende(e); }
    ws.addEventListener('message', (ev) => {
      let m;
      try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); } catch (e) { return; }
      const p = m.id && offen.get(m.id);
      if (!p) return;
      offen.delete(m.id);
      clearTimeout(p.timer);
      if (m.error) p.nein(new Error(m.error.message || JSON.stringify(m.error))); else p.ja(m.result);
    });
    ws.addEventListener('error', (e) => ende(new Error((e && e.message) || 'WebSocket-Fehler')));
    ws.addEventListener('close', () => ende(new Error('WebSocket vorzeitig geschlossen')));
    ws.addEventListener('open', async () => {
      try { ende(null, await fn(s)); } catch (e) { ende(e); }
    });
  });
}

// Neuer Tab ueber die Browser-Verbindung (kein veraltetes PUT /json/new).
async function neuerTab(port, url) {
  const ws = await cdpBrowserWs(port);
  const r = await mitSitzung(ws, (s) => s.befehl('Target.createTarget', { url }, 10000), 15000);
  return r.targetId;
}

// true nur, wenn Edge das Schliessen bestaetigt; jeder Fehler (auch "Tab gibt es nicht mehr") ist false.
async function tabSchliessen(port, targetId) {
  try {
    const ws = await cdpBrowserWs(port);
    const r = await mitSitzung(ws, (s) => s.befehl('Target.closeTarget', { targetId }, 10000), 15000);
    return !!(r && r.success);
  } catch (e) { return false; }
}

// ECHTE Maus-/Tastenereignisse (vertrauenswuerdige Geste): nur so gibt Edge Autofill-Werte frei,
// ein click() aus JavaScript reicht dafuer nicht.
async function echterKlick(s, x, y) {
  await s.befehl('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await s.befehl('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await s.befehl('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}

// Namen mit eigenem Tastencode; ein einzelnes Zeichen geht als Text durch.
const TASTEN = {
  Enter: { vk: 13, text: '\r' }, Tab: { vk: 9, text: '\t' }, Escape: { vk: 27 },
  ArrowDown: { vk: 40 }, ArrowUp: { vk: 38 }, Backspace: { vk: 8 }
};
async function taste(s, key) {
  const t = TASTEN[key] || { vk: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0, text: key.length === 1 ? key : undefined };
  const roh = { key, code: key, windowsVirtualKeyCode: t.vk, nativeVirtualKeyCode: t.vk };
  await s.befehl('Input.dispatchKeyEvent', Object.assign({ type: t.text ? 'keyDown' : 'rawKeyDown' }, roh, t.text ? { text: t.text } : {}));
  await s.befehl('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, roh));
}

// Cookie ueber den Browser setzen, damit es auch HttpOnly sein kann: der Server sieht es, die
// Seite (document.cookie) nicht. Die Adresse bestimmt Domain und Pfad.
// true nur, wenn Edge das Setzen bestaetigt; jeder Fehler ist false.
async function cookieSetzen(port, { name, value, url }) {
  try {
    const ws = await cdpBrowserWs(port);
    await mitSitzung(ws, (s) => s.befehl('Storage.setCookies', { cookies: [{ name, value, url, httpOnly: true, sameSite: 'Strict' }] }, 10000), 15000);
    return true;
  } catch (e) { return false; }
}

module.exports = { cdpListe, cdpBrowserWs, seitenTabs, mitSitzung, neuerTab, tabSchliessen, echterKlick, taste, cookieSetzen };
