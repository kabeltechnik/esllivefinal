/* ============================================================================
   ESL-DIENST: ESL-ABRUF
   ---------------------------------------------------------------------------
   Faehrt den ESL-Tab (JSF/PrimeFaces) ueber die Fernsteuerung: Anmeldung mit
   echter Geste, Projektwechsel ueber das Menue, Export des heutigen Stands,
   Bereichs-Export fuer Vortage und die Heilung (abgelaufene Ansicht, Fehlerseite
   des Browsers, Seite auf falschem Tag). Der Dienst-Kern ruft eslRunde im Takt.

   Der Export selbst laeuft ueber die ORIGINAL-Funktion rcRahmenExport aus
   esl_live_arena_v22.js (Buendel aus esl_dienst_buendel.js), nicht ueber einen
   Nachbau. Das Buendel lebt im Dokument und ist nach jeder Navigation weg; es
   wird deshalb vor jeder Nutzung geprueft und bei Bedarf neu eingespielt.

   Seitenfunktionen (...InSeite, ...Lage) sind echte Funktionen dieses Moduls
   (node --check erfasst sie) und laufen per s.seite(fn, arg) IM Tab - sie
   duerfen nichts aus dem Modul benutzen. Jedes Warten hat eine Frist.
   Zugangsdaten tauchen nie in einem Rueckgabewert auf (nur Laengen).
   Geprueft von pruefwerkzeuge/dienst_messen.mjs (fall=esl) gegen das Schein-ESL.
============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { echterKlick } = require('./esl_dienst_cdp');
const { eslBuendel } = require('./esl_dienst_buendel');
const { anmeldungErlaubt, fehlerseiteNeuladen, datumIso, isoZuDe } = require('./esl_dienst_regeln');

const ESL_PFADE = { anmeldung: '/Agents/login_esl.xhtml', haupt: '/Agents/secure/main.xhtml' };
// Exakter Eintragstext (kleingeschrieben): ein "enthaelt" traefe ein kuenftiges "Vodafone UM Care" mit.
const MENUE = { kabel: 'vodafone kabel', mobile: 'vodafone mobile', um: 'vodafone um' };
const V22 = path.join(__dirname, 'esl_live_arena_v22.js');
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- Buendel
// Neu geschnitten nur, wenn sich v22 geaendert hat.
let buendel = null;
function buendelHolen() {
  const mtime = fs.statSync(V22).mtimeMs;
  if (!buendel || buendel.mtime !== mtime) {
    const text = eslBuendel(fs.readFileSync(V22, 'utf8'));
    buendel = { mtime, text, version: (/\.version === '([0-9a-f]+)'/.exec(text) || [])[1] };
  }
  return buendel;
}
async function buendelSicher(s) {
  const b = buendelHolen();
  if (!await s.seite((v) => !!(window.__rcDienstEsl && window.__rcDienstEsl.version === v), b.version)) await s.auswerten(b.text);
}

// ---------------------------------------------------------------- Navigation
// Wartet auf ein NEUES, fertig geladenes Dokument: die Marke im alten verschwindet mit ihm.
// Waehrend des Wechsels scheitert Runtime.evaluate (Kontext zerstoert) - das ist kein Fehler.
async function neuesDokument(s, ausloesen, fristMs = 20000) {
  try { await s.seite(() => { window.__rcDienstAltDok = 1; }, null, 3000); } catch (e) { /* Seite wechselt schon */ }
  await ausloesen();
  return geladen(s, fristMs, true);
}
// Ein frisch angelegter Tab steht zuerst auf about:blank (fertig geladen) - das ist noch nicht die Seite.
async function geladen(s, fristMs = 15000, neu = false) {
  for (const bis = Date.now() + fristMs; Date.now() < bis; await warte(250)) {
    try {
      if (await s.seite((n) => document.readyState === 'complete' && location.href !== 'about:blank' && !(n && window.__rcDienstAltDok), neu, 3000)) return true;
    } catch (e) { /* Dokument wechselt */ }
  }
  return false;
}
const gehe = (s, url) => neuesDokument(s, () => s.befehl('Page.navigate', { url }));
const neuLaden = (s) => neuesDokument(s, () => s.befehl('Page.reload', { ignoreCache: true }));
const hauptVon = (href) => new URL(ESL_PFADE.haupt, href).href;

// ---------------------------------------------------------------- Zustand
function zustandInSeite(heuteDe) {
  const sichtbar = (el) => {
    try { return !!el && !!(el.offsetWidth || el.offsetHeight) && getComputedStyle(el).visibility !== 'hidden'; } catch (e) { return false; }
  };
  const fehlerseite = location.protocol === 'chrome-error:' || location.hostname === 'chromewebdata';
  const menue = !!document.getElementById('frmMainMenu');
  const msgs = document.getElementById('loginform:msgs');
  let datei = '';
  try { datei = decodeURIComponent(location.pathname).split('/').pop().toLowerCase(); } catch (e) { /* kaputte Kodierung */ }
  const form = document.getElementById('filterForm');
  const daten = form ? Array.from(form.querySelectorAll('input.hasDatepicker, .ui-calendar input')).slice(0, 2) : [];
  const code = document.querySelector('.error-code');
  return {
    href: location.href,
    geladen: document.readyState === 'complete',
    fehlerseite,
    fehlerCode: fehlerseite && code ? code.textContent.trim() : '',
    // Jede ESL-Seite traegt ein VERSTECKTES Passwortfeld ("Passwort aendern"): nur sichtbar und ohne Hauptmenue zaehlt.
    anmeldung: !menue && Array.from(document.querySelectorAll('input[type="password"]')).some(sichtbar),
    kaputt: !!(msgs && /ui-messages-error/.test(msgs.innerHTML)),
    // Jede ESL-Seite traegt den viewExpiredDialog versteckt: nur sichtbar zaehlt.
    abgelaufen: sichtbar(document.getElementById('viewExpiredDialog')),
    projekt: datei.indexOf('sis_vodafone') !== 0 ? '' : datei.indexOf('_mobile') >= 0 ? 'mobile' : datei.indexOf('_um') >= 0 ? 'um' : 'kabel',
    filterForm: !!form,
    menue,
    datumHeute: daten.length < 2 ? null : daten.every((i) => i.value === heuteDe)
  };
}
function eslZustand(s) { return s.seite(zustandInSeite, isoZuDe(datumIso(new Date()))); }

// ---------------------------------------------------------------- Anmeldung
// Wie EinAnmeldeVersuch/SeitenZustand im alten Starter: alles in EINER Abfrage, Lage der Felder als Mitte.
function anmeldeLage() {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), vlen: (el.value || '').length };
  };
  const pw = document.getElementById('loginform:pw'), m = document.getElementById('loginform:msgs');
  return {
    ready: document.readyState === 'complete', url: location.href, loginDa: !!pw,
    pw: box(pw), user: box(document.getElementById('loginform:user')), btn: box(document.getElementById('loginform:btnLogin')),
    kaputt: !!(m && /ui-messages-error/.test(m.innerHTML))
  };
}
// Eine Stelle ohne Eingabefeld, Knopf oder Link: der Klick dort gibt das Autofill frei, ohne eine Vorschlagsliste zu oeffnen.
function neutraleStelle() {
  for (let y = 4; y < 400; y += 8) {
    for (let x = 4; x < 600; x += 12) {
      const el = document.elementFromPoint(x, y);
      if (el && !el.closest('input,button,a,select,textarea,label')) return { x, y };
    }
  }
  return { x: 5, y: 5 };
}
const voll = (z) => !!(z.user && z.user.vlen > 0 && z.pw && z.pw.vlen > 0);

async function eslAnmelden(s, merk, jetzt) {
  const z = await s.seite(anmeldeLage);
  if (!z.ready) return 'laedt';
  if (!z.loginDa) return 'keine-maske';
  if (!z.pw) return 'laedt';
  if (z.kaputt) { await gehe(s, z.url); return 'laedt'; }   // Fehlerzustand eines frueheren Versuchs: Neuladen stellt das Autofill wieder her
  merk.zeiten = merk.zeiten || [];
  if (!anmeldungErlaubt(merk.zeiten, jetzt)) return 'gedeckelt';
  const n = await s.seite(neutraleStelle);
  await echterKlick(s, n.x, n.y);
  let lage = z;
  for (const bis = Date.now() + 5000; !voll(lage) && Date.now() < bis;) {
    await warte(250);
    lage = await s.seite(anmeldeLage);
    if (!lage.loginDa) return 'keine-maske';
  }
  // Ohne Kennwort NICHTS abschicken: ein leeres Formular ist ein Fehlversuch, mehrere sperren das Konto.
  if (!voll(lage)) return 'kein-passwort';
  if (!lage.btn) return 'laedt';
  // Vor dem Klick zaehlen: ein abgerissener Klick zaehlt lieber einmal zu viel als zu wenig.
  merk.zeiten.push(jetzt);
  if (merk.zeiten.length > 10) merk.zeiten.splice(0, merk.zeiten.length - 10);
  // Warten, bis die Anmeldeseite weg ist: eine Runde direkt danach saehe sonst noch das alte Formular und schickte doppelt.
  await neuesDokument(s, () => echterKlick(s, lage.btn.x, lage.btn.y), 15000);
  return 'abgeschickt';
}

// ---------------------------------------------------------------- Bereit (Export-Ansicht)
// Schrittmaschine wie navCheck im alten APITool-Server. Diese Funktion stellt nur fest, bereitTun handelt.
function bereitLage(a) {
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (location.protocol === 'chrome-error:' || location.hostname === 'chromewebdata') return { schritt: 'fehlerseite' };
  if (document.readyState !== 'complete') return { schritt: 'laedt' };
  const menue = document.getElementById('frmMainMenu');
  const pwSichtbar = Array.from(document.querySelectorAll('input[type="password"]')).some((el) => !!(el.offsetWidth || el.offsetHeight));
  if (!menue && pwSichtbar) return { schritt: 'anmeldung' };
  let datei = '';
  try { datei = decodeURIComponent(location.pathname).split('/').pop().toLowerCase(); } catch (e) { /* kaputte Kodierung */ }
  const projekt = datei.indexOf('sis_vodafone') !== 0 ? '' : datei.indexOf('_mobile') >= 0 ? 'mobile' : datei.indexOf('_um') >= 0 ? 'um' : 'kabel';
  // Weder Anmeldung noch Menue noch Projektseite (Fehlerseite des Servers, login_esl.xhtml bei stehender Sitzung ...).
  if (!menue && !projekt) return { schritt: 'fremd', haupt: /^https?:$/.test(location.protocol) ? location.origin + a.haupt : '' };
  // Menue-Eintrag nur, wenn die Seite zu einem ANDEREN Projekt gehoert: ein Klick auf dasselbe Projekt bewirkt nichts.
  if (menue && projekt !== a.projekt) return { schritt: 'menue', haupt: location.origin + a.haupt };
  const stat = Array.from(document.querySelectorAll('select')).find((el) => Array.from(el.options || []).some((o) => norm(o.textContent).indexOf('export projektergebnisse') >= 0));
  if (!stat) return { schritt: 'reiter' };
  // Steht die Statistik? Sichtbares Label ODER vom Server markierte Option (defaultSelected + Wert). Die
  // clientseitige .selected zaehlt NICHT: ohne Markierung waehlt der Browser selbst die erste Option.
  const box = stat.closest('.ui-selectonemenu'), lab = box && box.querySelector('.ui-selectonemenu-label');
  const steht = (lab && norm(lab.textContent).indexOf('export projektergebnisse') >= 0) ||
    Array.from(stat.options).some((o) => o.defaultSelected && o.value && norm(o.textContent).indexOf('export projektergebnisse') >= 0);
  if (!steht) return { schritt: 'statistik' };
  return { schritt: document.getElementById('filterForm') ? 'bereit' : 'form' };
}
function bereitTun(a) {
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (a.art === 'menue') {
    if (a.oeffnen) { const b = document.getElementById('frmMainMenu:mainMenu'); if (b) b.click(); }
    const l = Array.from(document.querySelectorAll('a.ui-menuitem-link')).find((x) => norm(x.textContent) === a.eintrag);
    if (l) l.click();
    return !!l;
  }
  if (a.art === 'reiter') {
    const t = document.getElementById('sis_form_01:CTS_tabProjektQueries') ||
      Array.from(document.querySelectorAll('span.ui-menuitem-text, a.ui-tabs-anchor, a')).find((el) => norm(el.textContent).indexOf('projektergebnisse') >= 0);
    if (t) (t.closest('a') || t).click();
    return !!t;
  }
  if (a.art === 'statistik') {
    const stat = Array.from(document.querySelectorAll('select')).find((el) => Array.from(el.options || []).some((o) => norm(o.textContent).indexOf('export projektergebnisse') >= 0));
    const box = stat && stat.closest('.ui-selectonemenu'), tr = box && box.querySelector('.ui-selectonemenu-trigger');
    if (tr) tr.click();
    setTimeout(() => {
      const li = Array.from(document.querySelectorAll('li.ui-selectonemenu-item, li[role="option"]')).find((x) => norm(x.textContent).indexOf('export projektergebnisse') >= 0);
      if (li) li.click();
    }, 400);
    return !!tr;
  }
  return false;
}
const BEREIT_GRUND = {
  laedt: 'Seite laedt', fremd: 'fremde Seite ohne Menue', menue: 'Projektwechsel wirkt nicht',
  reiter: 'Reiter Projektergebnisse fehlt', statistik: 'Statistik "Export Projektergebnisse" steht nicht', form: 'filterForm fehlt'
};

async function eslBereit(s, projekt, fristMs = 60000) {
  if (!MENUE[projekt]) return { ok: false, grund: 'unbekanntes Projekt ' + projekt };
  const bis = Date.now() + fristMs, zuletzt = { menue: 0, reiter: 0, statistik: 0 };
  let schritt = '', menueKlicks = 0;
  while (Date.now() < bis) {
    let z;
    try { z = await s.seite(bereitLage, { projekt, haupt: ESL_PFADE.haupt }, 5000); } catch (e) { z = { schritt: 'laedt' }; }
    schritt = z.schritt;
    if (schritt === 'bereit') return { ok: true, grund: '' };
    if (schritt === 'fehlerseite') return { ok: false, grund: 'Fehlerseite des Browsers' };
    if (schritt === 'anmeldung') return { ok: false, grund: 'ESL verlangt eine Anmeldung' };
    const jetzt = Date.now(), frei = (k, ms) => jetzt - zuletzt[k] >= ms;
    if (schritt === 'fremd') {
      if (!z.haupt) return { ok: false, grund: 'Seite ohne Webadresse' };
      await gehe(s, z.haupt);
      continue;
    }
    if (schritt === 'menue' && frei('menue', 5000)) {
      zuletzt.menue = jetzt;
      // Zwei Klicks ohne Wirkung: die Sitzung steht vermutlich schon auf dem Ziel (Klick auf dasselbe
      // Projekt bewirkt nichts), main.xhtml leitet auf die Seite des Projekts der Anmeldung.
      if (menueKlicks >= 2) { menueKlicks = 0; await gehe(s, z.haupt); continue; }
      // Bewirkt der Klick nach 5 s nichts, wird das Menue geoeffnet und erneut geklickt.
      await s.seite(bereitTun, { art: 'menue', eintrag: MENUE[projekt], oeffnen: menueKlicks > 0 });
      menueKlicks++;
    }
    if (schritt === 'reiter' && frei('reiter', 4000)) { zuletzt.reiter = jetzt; await s.seite(bereitTun, { art: 'reiter' }); }
    if (schritt === 'statistik' && frei('statistik', 4000)) { zuletzt.statistik = jetzt; await s.seite(bereitTun, { art: 'statistik' }); }
    await warte(1000);
  }
  return { ok: false, grund: 'ESL nicht bereit nach ' + Math.round(fristMs / 1000) + ' s (' + (BEREIT_GRUND[schritt] || schritt) + ')' };
}

// ---------------------------------------------------------------- Export
async function exportInSeite() {
  try {
    const r = await window.__rcDienstEsl.rcRahmenExport({ contentWindow: window, contentDocument: document });
    if (r.art !== 'excel') return r;
    const b = new Uint8Array(r.buf);
    let t = '';
    for (let i = 0; i < b.length; i += 0x8000) t += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    window.__rcDienstExport = btoa(t);
    return { art: 'excel', laenge: window.__rcDienstExport.length };
  } catch (e) {
    return { art: 'fehler', grund: 'Export: ' + ((e && e.message) || e) };
  }
}
const EXPORT_GRUND = {
  leer: 'noch keine Datensaetze heute', abgelaufen: 'Ansicht abgelaufen', anmeldung: 'Export lieferte die Anmeldeseite',
  html: 'Export lieferte HTML statt Excel', 'kein-form': 'filterForm fehlt', 'kein-export': 'kein Export-Knopf und kein Hinweis auf leere Statistik'
};
// Der eingebaute WebSocket von Node handelt mit Edge permessage-deflate aus und bricht jede Nachricht ab,
// die entpackt groesser als 4 MiB ist (undici kDefaultMaxDecompressedSize, am Messgeraet: 4 MB ok, 6 MB
// Verbindungsabbruch). Der Base64-Text bleibt deshalb in der Seite und kommt in 1-MiB-Stuecken.
const STUECK = 1 << 20;
async function eslExport(s) {
  await buendelSicher(s);
  const r = await s.seite(exportInSeite, null, 90000);
  if (r.art === 'excel') {
    const teile = [];
    for (let i = 0; i < r.laenge; i += STUECK) teile.push(await s.seite((a) => window.__rcDienstExport.slice(a.von, a.bis), { von: i, bis: i + STUECK }));
    await s.seite(() => { delete window.__rcDienstExport; });
    return { art: 'excel', b64: teile.join('') };
  }
  if (!r.grund) r.grund = r.art === 'http' ? 'HTTP ' + r.status + ' beim Export' : (EXPORT_GRUND[r.art] || r.art);
  return r;
}

// ---------------------------------------------------------------- Bereich
function bereichStellen(a) {
  const form = document.getElementById('filterForm'), d = window.__rcDienstEsl;
  const felder = form ? Array.from(form.querySelectorAll('input.hasDatepicker, .ui-calendar input')).slice(0, 2) : [];
  const knopf = form && d && d.rcFilterKnopf(form);
  if (felder.length < 2 || !knopf) return null;
  [a.von, a.bis].forEach((w, i) => {
    felder[i].value = w;
    felder[i].dispatchEvent(new Event('input', { bubbles: true }));
    felder[i].dispatchEvent(new Event('change', { bubbles: true }));
  });
  window.__rcDienstAltForm = form;
  knopf.scrollIntoView({ block: 'center' });
  const r = knopf.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
}

// Der JSF-Export liefert den serverseitig zuletzt BESTAETIGTEN Zeitraum: erst ein echter Klick auf
// "Liste aktualisieren", dann der Export. Danach zurueck auf eine frische Seite (steht auf heute).
async function eslBereichExport(s, projekt, von, bis) {
  try {
    const b = await eslBereit(s, projekt);
    if (!b.ok) return { art: 'fehler', grund: b.grund };
    await buendelSicher(s);
    const k = await s.seite(bereichStellen, { von: isoZuDe(von), bis: isoZuDe(bis) });
    let r;
    if (!k) r = { art: 'fehler', grund: 'Datumsfelder oder Knopf "Liste aktualisieren" fehlen' };
    else {
      await echterKlick(s, k.x, k.y);
      // Neu gerendertes filterForm = der Server hat den Zeitraum bestaetigt (alte Knoten sind danach tot).
      let neu = false;
      for (const ende = Date.now() + 15000; !neu && Date.now() < ende;) {
        await warte(250);
        try { neu = await s.seite(() => !(window.__rcDienstAltForm && window.__rcDienstAltForm.isConnected)); } catch (e) { /* Dokument wechselt */ }
      }
      if (!neu) r = { art: 'fehler', grund: 'Suche fuer ' + von + ' bis ' + bis + ' kam nicht zurueck (15 s)' };
      else {
        await warte(1000);   // PrimeFaces schickt nach der Suche noch den Tabellen-Filter (Neubau der Liste) hinterher
        r = await eslExport(s);
      }
    }
    await gehe(s, hauptVon(await s.seite(() => location.href)));
    await eslBereit(s, projekt);
    return r;
  } catch (e) {
    return { art: 'fehler', grund: 'Bereichs-Export abgebrochen: ' + ((e && e.message) || e) };
  }
}

// ---------------------------------------------------------------- Pflege
// Web Lock: Edge friert eine Seite mit gehaltenem Lock nicht ein. Nie zurueckgegeben, faellt mit der Seite.
function pflegeInSeite(name) {
  if (!window.__rcWachLock && navigator.locks && navigator.locks.request) {
    window.__rcWachLock = { name, seit: Date.now() };
    navigator.locks.request(name, () => new Promise(() => {})).catch(() => { window.__rcWachLock = null; });
  }
  let leerlauf = false;
  try { leerlauf = window.__rcDienstEsl.rcLeerlaufZurueck(window); } catch (e) { /* ohne PrimeFaces kein Zaehler */ }
  return { lock: !!window.__rcWachLock, leerlauf };
}
async function eslPflege(s, name = 'rc_wach_dienst_esl') {
  await buendelSicher(s);
  return s.seite(pflegeInSeite, name);
}

// ---------------------------------------------------------------- Runde
const ANMELDE_GRUND = {
  abgeschickt: 'ESL-Anmeldung abgeschickt', 'kein-passwort': 'Kennwort im Edge-Profil nicht hinterlegt',
  gedeckelt: 'Anmeldung gedeckelt (3 in 30 Min)', laedt: 'ESL-Anmeldeseite laedt noch', 'keine-maske': 'ESL-Anmeldemaske nicht erkannt'
};

// merk: { zeiten: [Anmeldungen], fehlerSeit: wann die Fehlerseite zuerst gesehen wurde } - gehoert dem Aufrufer.
async function eslRunde(s, projekt, merk) {
  const fehler = (grund) => ({ art: 'fehler', grund, zeit: Date.now() });
  try {
    await geladen(s);
    let z = await eslZustand(s);
    if (z.fehlerseite) {
      const jetzt = Date.now(), code = z.fehlerCode || 'ohne Code';
      if (merk.fehlerSeit == null) merk.fehlerSeit = jetzt;
      if (!fehlerseiteNeuladen(merk.fehlerSeit, jetzt)) return fehler('Fehlerseite des Browsers (' + code + '), Neuladen nach 20 s');
      await neuLaden(s);
      z = await eslZustand(s);
      if (z.fehlerseite) { merk.fehlerSeit = Date.now(); return fehler('Fehlerseite des Browsers (' + code + '), neu geladen, Portal weiter nicht erreichbar'); }
    }
    merk.fehlerSeit = null;
    if (z.abgelaufen) { await gehe(s, hauptVon(z.href)); z = await eslZustand(s); }
    if (z.anmeldung) return fehler(ANMELDE_GRUND[await eslAnmelden(s, merk, Date.now())]);
    if (z.datumHeute === false) await gehe(s, hauptVon(z.href));   // eine frische Seite steht auf heute
    const b = await eslBereit(s, projekt);
    if (!b.ok) return fehler(b.grund);
    const r = await eslExport(s);
    try { await eslPflege(s); } catch (e) { /* Pflege darf den Export nicht verderben */ }
    // Abgelaufene Ansicht, Anmeldeseite, HTML: die Seite traegt einen toten Stand - neu aufbauen fuer die naechste Runde.
    if (r.art !== 'excel' && r.art !== 'leer') {
      try {
        await gehe(s, hauptVon(z.href));
        // Sitzung weg (Export lieferte die Anmeldeseite): gleich in DIESER Runde anmelden, nicht erst in der naechsten - Excel dann spaetestens in der zweiten.
        if (r.art === 'anmeldung' && (await eslZustand(s)).anmeldung) return fehler(ANMELDE_GRUND[await eslAnmelden(s, merk, Date.now())]);
      } catch (e) { /* naechste Runde sieht es */ }
    }
    return Object.assign(r, { zeit: Date.now() });
  } catch (e) {
    return fehler('ESL-Runde abgebrochen: ' + ((e && e.message) || e));
  }
}

module.exports = { ESL_PFADE, MENUE, eslZustand, eslAnmelden, eslBereit, eslExport, eslBereichExport, eslPflege, eslRunde };
