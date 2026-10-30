#!/usr/bin/env node
// ============================================================================
//  export_ansicht_pruefen.js — Waechter fuer die Statistik-Auswahl (22.08.)
// ----------------------------------------------------------------------------
//  Live-Befund aus der Nacht 21./22.08.: nach dem naechtlichen Re-Login stand
//  der Reiter "Projektergebnisse" wieder, aber die Statistik-Auswahl war LEER
//  ("Bitte Abfrage waehlen!") — der Export lieferte stundenlang HTML statt
//  Excel, und niemand stellte die Auswahl nach: pickExportView lief genau
//  einmal je Seitenaufbau (once-Sperren), und das von Hand gesetzte
//  PrimeFaces-Label liess jede "steht sie schon?"-Pruefung luegen.
//
//  Geprueft wird FUNKTIONAL (echte Funktionen per Klammer-Zaehlung aus den
//  Quelldateien geschnitten, mit new Function gegen einen Mini-DOM gewertet),
//  plus Gegenproben, dass die ALTE Bauart erkannt wuerde.
//  Drei Bloecke:
//   A) v22: rcExportAnsichtSicherstellen (Dashboard-Wache, lebt die Nacht)
//   B) Autopilot: pickExportView mit Zaehler + Klickweg + ehrlichem Zeugen
//   C) v22: Konfigurator-Panel-Abraeumer (Re-Inject: "Konfigurator ist leer")
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const V22 = fs.readFileSync(path.join(__dirname, '..', 'esl_live_arena_v22.js'), 'utf8');
const AP  = fs.readFileSync(path.join(__dirname, '..', 'esl_autopilot.user.js'), 'utf8');

let ok = 0, fail = 0;
function pruefe(name, bedingung) {
    if (bedingung) { ok++; }
    else { fail++; console.log('  FEHLGESCHLAGEN: ' + name); }
}

// ---- Klammer-Zaehlung: eine Funktion ab ihrem Kopf herausschneiden ----------
function schneide(src, kopf) {
    const start = src.indexOf(kopf);
    if (start < 0) return null;
    let i = src.indexOf('{', start);
    if (i < 0) return null;
    let tiefe = 0;
    for (; i < src.length; i++) {
        const c = src[i];
        if (c === '{') tiefe++;
        else if (c === '}') { tiefe--; if (tiefe === 0) return src.slice(start, i + 1); }
    }
    return null;
}

// ---- Mini-DOM ---------------------------------------------------------------
// Nur, was die geschnittenen Funktionen wirklich anfassen. Selektoren werden
// bewusst simpel aufgeloest (Tag- bzw. Klassen-/Id-Vergleich).
function El(tag, props) {
    const el = Object.assign({
        tag: tag, id: '', className: '', textContent: '', value: '',
        children: [], parent: null, geklickt: 0, events: [],
        options: undefined, selectedIndex: undefined, removed: false
    }, props || {});
    el.click = function(){ el.geklickt++; };
    el.dispatchEvent = function(ev){ el.events.push(ev && ev.type || '?'); return true; };
    el.remove = function(){ el.removed = true; };
    el.closest = function(selKl){
        const kl = selKl.replace(/^\./,'');
        let p = el;
        while (p) { if ((p.className||'').split(/\s+/).indexOf(kl) >= 0) return p; p = p.parent; }
        return null;
    };
    el.querySelector = function(sel){ const r = el.querySelectorAll(sel); return r.length ? r[0] : null; };
    el.querySelectorAll = function(sel){
        const out = [];
        (function tief(n){ n.children.forEach(function(k){ if (passt(k, sel)) out.push(k); tief(k); }); })(el);
        return out;
    };
    return el;
}
function passt(el, sel) {
    // kommagetrennte Selektoren: einer muss passen
    return sel.split(',').some(function(s){
        s = s.trim();
        const mAttr = s.match(/^(\w+)\[type="?([\w-]+)"?\]$/);
        if (mAttr) return el.tag === mAttr[1] && el.type === mAttr[2];
        const mRole = s.match(/^li\[role="?option"?\]$/);
        if (mRole) return el.tag === 'li' && el.role === 'option';
        if (s.charAt(0) === '#') return el.id === s.slice(1);
        const mTagKl = s.match(/^(\w+)?\.([\w-]+)$/);
        if (mTagKl) {
            const klOk = (el.className||'').split(/\s+/).indexOf(mTagKl[2]) >= 0;
            return klOk && (!mTagKl[1] || el.tag === mTagKl[1]);
        }
        return el.tag === s;
    });
}
function kind(parent, el) { el.parent = parent; parent.children.push(el); return el; }
function docAus(root) {
    return {
        getElementById: function(id){
            let hit = null;
            (function tief(n){ n.children.forEach(function(k){ if (!hit && k.id === id) hit = k; tief(k); }); })(root);
            return hit;
        },
        querySelector: function(sel){ const r = root.querySelectorAll(sel); return r.length ? r[0] : null; },
        querySelectorAll: function(sel){ return root.querySelectorAll(sel); }
    };
}

// Baut die Projektergebnisse-Seite: filterForm + PrimeFaces-Widget.
// leerGewaehlt=true -> Platzhalter-Option (value '') gewaehlt, Label leer.
function bauSeite(opts) {
    opts = opts || {};
    const root = El('root');
    const form = kind(root, El('form', { id: 'filterForm' }));
    // passwort: sichtbare Anmeldemaske. pwVerborgen: das verborgene Feld, das
    // JEDE ESL-Seite traegt (27.09. gemessen) — es darf die Wache nicht sperren.
    if (opts.passwort) kind(root, El('input', { type: 'password', offsetWidth: 180, offsetHeight: 24 }));
    if (opts.pwVerborgen) kind(root, El('input', { type: 'password', offsetWidth: 0, offsetHeight: 0 }));
    const box = opts.ohneWidget ? form : kind(form, El('div', { className: 'ui-selectonemenu' }));
    const sel = kind(box, El('select'));
    const o0 = { textContent: '', value: '' };
    const o1 = { textContent: 'Export Projektergebnisse', value: '4711' };
    const o2 = { textContent: 'Teamstatistik', value: '4712' };
    sel.options = [o0, o1, o2];
    sel.selectedIndex = opts.andereGewaehlt ? 2 : 0;
    if (opts.andereGewaehlt) sel.value = '4712';
    let lab = null, trig = null, panel = null;
    if (!opts.ohneWidget) {
        lab  = kind(box, El('label', { className: 'ui-selectonemenu-label', textContent: opts.andereGewaehlt ? 'Teamstatistik' : (opts.labelText || '') }));
        trig = kind(box, El('div', { className: 'ui-selectonemenu-trigger' }));
        panel = kind(root, El('div', { className: 'ui-selectonemenu-panel' }));
        kind(panel, El('li', { className: 'ui-selectonemenu-item', textContent: 'Export Projektergebnisse' }));
        kind(panel, El('li', { className: 'ui-selectonemenu-item', textContent: 'Teamstatistik' }));
    }
    return { root: root, form: form, sel: sel, lab: lab, trig: trig, panel: panel };
}

console.log('=== export_ansicht_pruefen ===');

// ============================================================================
//  BLOCK A — v22: rcExportAnsichtSicherstellen
// ============================================================================
const wacheSrc = schneide(V22, 'function rcExportAnsichtSicherstellen(){');
// Seit 28.09. fragt die Wache rcPasswortSichtbar (nur eine SICHTBARE Maske zaehlt:
// jede ESL-Seite traegt ein verborgenes Passwortfeld, die Wache griff dadurch nie).
const pwSrc = schneide(V22, 'function rcPasswortSichtbar(d){');
const wacheLaufSrc = (pwSrc || '') + '\n' + wacheSrc;
pruefe('A1: rcExportAnsichtSicherstellen ist als Funktionsdeklaration in v22', !!wacheSrc);
pruefe('A2: window-Export vorhanden', V22.indexOf('window.rcExportAnsichtSicherstellen = rcExportAnsichtSicherstellen') >= 0);

const fehlschlagSrc = schneide(V22, 'function rcEslFehlschlag(grund){');
pruefe('A3: rcEslFehlschlag ruft die Wache auf', !!fehlschlagSrc && fehlschlagSrc.indexOf('rcExportAnsichtSicherstellen()') >= 0);
pruefe('A4: Anstoss erst ab Fehlserie >= 2', !!fehlschlagSrc && /rcEslFehlserie\s*>=\s*2/.test(fehlschlagSrc));
pruefe('A5: Anstoss in try/catch (Wache darf den Fehlerpfad nie killen)',
    !!fehlschlagSrc && /try\s*\{\s*rcExportAnsichtSicherstellen\(\)/.test(fehlschlagSrc.replace(/\n/g,' ')));

// Aufrufstellen: nur rcEslFehlschlag + window-Zuweisung, KEIN Boot-Aufruf.
// BLOCKBASIERT statt global (Falle 18: eine rohe Zaehlung ueber die ganze
// Datei faerbt beim naechsten harmlosen Kommentar rot, der die Funktion
// nennt — im Review per Mutationstest belegt). Ausserhalb der zwei
// geschnittenen Bloecke und der window-Export-Zeile darf es keinen AUFRUF
// (Name mit oeffnender Klammer) mehr geben.
(function(){
    let rest = V22;
    if (wacheSrc) rest = rest.replace(wacheSrc, '');
    if (fehlschlagSrc) rest = rest.replace(fehlschlagSrc, '');
    rest = rest.replace('window.rcExportAnsichtSicherstellen = rcExportAnsichtSicherstellen;', '');
    pruefe('A6: kein Aufruf ausserhalb von rcEslFehlschlag (blockbasiert, kommentarfest)',
        !/rcExportAnsichtSicherstellen\s*\(/.test(rest));
})();

// Funktional: die echte Wache gegen den Mini-DOM.
function wacheLauf(seite, extra) {
    const timeouts = [];
    const fakeWin = Object.assign({ rcEslFehlserie: 3, rcLogEreignis: function(t){ fakeWin._log = t; } }, extra || {});
    const fn = new Function('document', 'window', 'setTimeout', 'Date',
        wacheLaufSrc + '\nreturn rcExportAnsichtSicherstellen();');
    const jetztRef = { t: 1000000 };
    const fakeDate = { now: function(){ return jetztRef.t; } };
    const st = function(f, ms){ timeouts.push({ f: f, ms: ms }); };
    const ergebnis = fn(docAus(seite.root), fakeWin, st, fakeDate);
    // geplante Timeouts sofort ausfuehren (der Item-Klick haengt daran)
    timeouts.forEach(function(t){ t.f(); });
    return { ergebnis: ergebnis, win: fakeWin, timeouts: timeouts };
}

// A7: leere Auswahl -> Trigger geklickt, dann Ziel-Eintrag geklickt
(function(){
    const s = bauSeite({});
    const r = wacheLauf(s);
    pruefe('A7a: leere Auswahl -> Wache handelt (true)', r.ergebnis === true);
    pruefe('A7b: Trigger wurde geklickt (PrimeFaces-Klickweg zuerst)', s.trig.geklickt === 1);
    const zielLi = s.panel.children[0];
    pruefe('A7c: der Eintrag "Export Projektergebnisse" wurde geklickt', zielLi.geklickt === 1);
    pruefe('A7d: der FALSCHE Eintrag (Teamstatistik) blieb unangeklickt', s.panel.children[1].geklickt === 0);
    pruefe('A7e: Logbuch-Ereignis geschrieben', typeof r.win._log === 'string' && r.win._log.indexOf('leer') >= 0);
    pruefe('A7f: select.value wurde NICHT parallel verstellt (Klickweg genuegt)', s.sel.events.indexOf('change') < 0);
})();

// A8: echte (andere) Auswahl -> Wache fasst NICHTS an
(function(){
    const s = bauSeite({ andereGewaehlt: true });
    const r = wacheLauf(s);
    pruefe('A8a: bewusst andere Statistik gewaehlt -> Wache tut nichts (false)', r.ergebnis === false);
    pruefe('A8b: dabei wurde nichts geklickt', s.trig.geklickt === 0 && s.panel.children[0].geklickt === 0);
})();

// A9: Anmeldemaske -> Sache von rcSessionLost, Wache steigt aus
(function(){
    const s = bauSeite({ passwort: true });
    const r = wacheLauf(s);
    pruefe('A9: SICHTBARE Anmeldemaske -> Wache steigt aus', r.ergebnis === false && s.trig.geklickt === 0);
})();
// A9b: das verborgene Passwortfeld jeder ESL-Seite sperrt die Wache NICHT (28.09.)
(function(){
    const s = bauSeite({ pwVerborgen: true });
    const r = wacheLauf(s);
    pruefe('A9b: nur verborgenes Passwortfeld -> Wache handelt trotzdem', r.ergebnis === true && s.trig.geklickt === 1);
    // Gegenprobe: die alte Bedingung (jedes Passwortfeld) haette hier ausgestiegen
    const altSrc = wacheLaufSrc.replace('if (rcPasswortSichtbar(document)) return false;', "if (document.querySelector('input[type=\"password\"]')) return false;");
    const fnAlt = new Function('document', 'window', 'setTimeout', 'Date', altSrc + '\nreturn rcExportAnsichtSicherstellen();');
    const s2 = bauSeite({ pwVerborgen: true });
    const eAlt = fnAlt(docAus(s2.root), { rcEslFehlserie: 3, rcLogEreignis: function(){} }, function(){}, { now: function(){ return 1000000; } });
    pruefe('A9c: Gegenprobe — die ALTE Bedingung blieb am verborgenen Feld haengen', altSrc !== wacheLaufSrc && eAlt === false && s2.trig.geklickt === 0);
})();
// A9d: Alle-Projekte-Betrieb — exportiert wird im Arbeitsrahmen, die Kabel-Seite bleibt unangetastet
(function(){
    const s = bauSeite({});
    const r = wacheLauf(s, { rcAlleProjekteModus: true });
    pruefe('A9d: Alle-Projekte-Betrieb -> Wache fasst die Kabel-Seite nicht an', r.ergebnis === false && s.trig.geklickt === 0);
})();

// A10: kein filterForm -> aus
(function(){
    const root = El('root');
    const r = wacheLauf({ root: root });
    pruefe('A10: ohne filterForm keine Aktion', r.ergebnis === false);
})();

// A11: Deckel — zweiter Aufruf innerhalb 5 Minuten tut nichts
(function(){
    const timeouts = [];
    const fakeWin = { rcEslFehlserie: 3, rcLogEreignis: function(){} };
    const fn = new Function('document', 'window', 'setTimeout', 'Date',
        wacheLaufSrc + '\nreturn rcExportAnsichtSicherstellen;');
    const jetztRef = { t: 1000000 };
    const fakeDate = { now: function(){ return jetztRef.t; } };
    const s1 = bauSeite({});
    const wache = fn(docAus(s1.root), fakeWin, function(f){ timeouts.push(f); }, fakeDate);
    const e1 = wache();
    jetztRef.t += 60 * 1000; // nur 1 Minute spaeter
    const e2 = wache();
    jetztRef.t += 5 * 60 * 1000; // jetzt ist die Sperre abgelaufen
    const e3 = wache();
    pruefe('A11a: erster Versuch handelt', e1 === true);
    pruefe('A11b: zweiter Versuch nach 1 Min wird gedrosselt', e2 === false);
    pruefe('A11c: nach Ablauf der 5 Minuten darf sie wieder', e3 === true);
})();

// A12: ohne PrimeFaces-Widget -> Notnagel natives select + change
(function(){
    const s = bauSeite({ ohneWidget: true });
    const r = wacheLauf(s);
    pruefe('A12a: ohne Widget handelt die Wache trotzdem', r.ergebnis === true);
    pruefe('A12b: natives select bekam Wert + change', s.sel.value === '4711' && s.sel.events.indexOf('change') >= 0);
})();

// A13: Panel taucht nach Trigger-Klick NICHT auf -> Notnagel im Timeout
(function(){
    const s = bauSeite({});
    // Panel-Eintraege entfernen: der Timeout-Zweig muss auf das select fallen
    s.panel.children.length = 0;
    const r = wacheLauf(s);
    pruefe('A13: Eintrag fehlt nach Klick -> Notnagel setzt select + change', s.sel.value === '4711' && s.sel.events.indexOf('change') >= 0);
})();

// A14: Platzhaltertext im Label ("Bitte Abfrage waehlen!") zaehlt als LEER —
//      der Nacht-Zustand zeigte genau diese Variante (Review-Befund: die
//      erste Fassung hielt jeden nicht-leeren Text fuer eine echte Auswahl).
(function(){
    const s = bauSeite({ labelText: 'Bitte Abfrage waehlen!' });
    const r = wacheLauf(s);
    pruefe('A14: Platzhaltertext im Label -> Wache handelt trotzdem', r.ergebnis === true && s.trig.geklickt === 1);
})();

// A15: der EIGENE Notnagel darf den Sensor nicht entwaffnen (Review-Befund:
//      nativSetzen schreibt select.value clientseitig; verpufft der change
//      serverseitig, bleibt das Label leer — die Wache muss beim naechsten
//      Lauf WIEDER handeln, nicht auf den eigenen Client-Wert hereinfallen).
(function(){
    const timeouts = [];
    const fakeWin = { rcEslFehlserie: 4, rcLogEreignis: function(){} };
    const fn = new Function('document', 'window', 'setTimeout', 'Date',
        wacheLaufSrc + '\nreturn rcExportAnsichtSicherstellen;');
    const jetztRef = { t: 1000000 };
    const fakeDate = { now: function(){ return jetztRef.t; } };
    const s = bauSeite({});
    s.panel.children.length = 0;                    // Eintraege fehlen -> Notnagel greift
    const wache = fn(docAus(s.root), fakeWin, function(f){ timeouts.push(f); }, fakeDate);
    const e1 = wache(); timeouts.splice(0).forEach(function(f){ f(); });
    pruefe('A15a: erster Lauf endet im Notnagel (select clientseitig gesetzt)', e1 === true && s.sel.value === '4711');
    // change ist serverseitig verpufft: Label bleibt leer. Naechster Lauf nach Ablauf der Sperre:
    jetztRef.t += 5 * 60 * 1000 + 1000;
    const e2 = wache(); timeouts.splice(0).forEach(function(f){ f(); });
    pruefe('A15b: die Wache handelt WIEDER — der eigene Client-Wert entwaffnet sie nicht', e2 === true);
})();

// ============================================================================
//  BLOCK B — Autopilot: pickExportView + exportAnsichtSteht + Schleifen-Wache
// ============================================================================
const stehtSrc = schneide(AP, 'function exportAnsichtSteht() {');
const pickSrc  = schneide(AP, 'function pickExportView() {');
pruefe('B1: exportAnsichtSteht existiert im Autopiloten', !!stehtSrc);
pruefe('B2: pickExportView existiert', !!pickSrc);
pruefe('B3: KEIN once(\'pickExport\') mehr (Zaehler statt Einmal-Sperre)', AP.indexOf("once('pickExport')") < 0);
pruefe('B4: KEIN once(\'pfDropdown\') mehr', AP.indexOf("once('pfDropdown')") < 0);
pruefe('B5: Label wird NICHT mehr von Hand gesetzt (ehrlicher Zeuge)',
    !!pickSrc && !/lab\.textContent\s*=/.test(pickSrc));
pruefe('B6: Zaehler pickVersuche mit Abstand vorhanden',
    AP.indexOf('pickVersuche') >= 0 && !!pickSrc && pickSrc.indexOf('25000') >= 0);
// B7 POSITIONSBASIERT (Review-Mutationstest: ein blosses Vorkommen irgendwo
// im Block liess "void exportAnsichtSteht();" als Fruehausstieg durchgehen):
// der Zeugen-Aufruf muss VOR dem ersten Zugriff auf die Zaehler liegen, und
// er muss als Ausstieg formuliert sein (if + return im selben Zug).
(function(){
    if (!pickSrc) { pruefe('B7: Fruehausstieg mit ehrlichem Zeugen VOR der Zaehler-Logik', false); return; }
    const iZeuge = pickSrc.indexOf('if (exportAnsichtSteht())');
    const iZaehler = pickSrc.search(/pickZuletzt|pickVersuche/);
    pruefe('B7a: Fruehausstieg "if (exportAnsichtSteht())" vorhanden', iZeuge >= 0);
    pruefe('B7b: er steht VOR der Zaehler-Logik', iZeuge >= 0 && iZaehler > iZeuge);
})();

// B8: Reihenfolge im Block — Klickweg (offener Eintrag, dann Trigger) VOR dem
//     nativen Notnagel (dispatchEvent change).
(function(){
    if (!pickSrc) { pruefe('B8: Reihenfolge Klickweg vor Notnagel', false); return; }
    const iOffen = pickSrc.indexOf('ui-selectonemenu-item');
    const iTrig  = pickSrc.indexOf('ui-selectonemenu-trigger');
    const iNativ = pickSrc.indexOf("dispatchEvent(new Event('change'");
    pruefe('B8a: offener-Eintrag-Suche vor Trigger-Klick (Panel nicht zuklappen)', iOffen >= 0 && iTrig > iOffen);
    pruefe('B8b: PrimeFaces-Klickweg vor dem nativen Notnagel', iNativ > iTrig && iTrig >= 0);
})();

// B9: startDashboard-Schleife waehlt nach
const dashSrc = schneide(AP, 'function startDashboard() {');
pruefe('B9: startDashboard-Schleife ruft pickExportView bei fehlender Ansicht',
    !!dashSrc && /!exportAnsichtSteht\(\)[\s\S]{0,120}pickExportView\(\)/.test(dashSrc));

// B10: funktional — exportAnsichtSteht als ehrlicher Zeuge
(function(){
    const fn = new Function('document', 'norm', stehtSrc + '\nreturn exportAnsichtSteht();');
    const norm = function(s){ return (s || '').replace(/\s+/g, ' ').trim().toLowerCase(); };
    // Fall 1: Label traegt den Zieltext -> true
    const r1 = El('root');
    kind(r1, El('label', { className: 'ui-selectonemenu-label', textContent: 'Export Projektergebnisse' }));
    pruefe('B10a: Label mit Zieltext -> steht', fn(docAus(r1), norm) === true);
    // Fall 2: Label LEER -> steht NICHT (das Hand-Label der alten Fassung haette hier gelogen)
    const r2 = El('root');
    kind(r2, El('label', { className: 'ui-selectonemenu-label', textContent: '' }));
    const s2 = kind(r2, El('select'));
    s2.options = [{ textContent: 'Export Projektergebnisse', value: '1' }];
    s2.selectedIndex = 0; // select steht clientseitig "richtig" — zaehlt bei vorhandenem Widget NICHT
    pruefe('B10b: leeres Label -> steht nicht (select-Stand allein zaehlt nicht, solange ein Widget da ist)', fn(docAus(r2), norm) === false);
    // Fall 3: KEIN Widget, natives select auf Ziel -> true
    const r3 = El('root');
    const s3 = kind(r3, El('select'));
    s3.options = [{ textContent: 'Export Projektergebnisse', value: '1' }];
    s3.selectedIndex = 0;
    pruefe('B10c: ohne Widget zaehlt das native select', fn(docAus(r3), norm) === true);
    // Fall 4: gar nichts -> false
    pruefe('B10d: leere Seite -> steht nicht', fn(docAus(El('root')), norm) === false);
})();

// B11: GEGENPROBE — die ALTE Bauart muss von diesen Pruefungen erkannt werden.
(function(){
    const alt = "if (target && once('pickExport')) { lab.textContent = 'Export Projektergebnisse'; }";
    pruefe('B11a: Gegenprobe — altes once(\'pickExport\') wuerde B3 rot faerben', alt.indexOf("once('pickExport')") >= 0);
    pruefe('B11b: Gegenprobe — altes Label-Handsetzen wuerde B5 rot faerben', /lab\.textContent\s*=/.test(alt));
})();

// B13: pickExportView FUNKTIONAL (Review-Befund: eine reine Namens-Regex wie
// B5 laesst ein Label-Handsetzen unter ANDEREM Variablennamen durch — deshalb
// hier die echte Funktion gegen den Mini-DOM, und danach wird gemessen, dass
// das Label UNVERAENDERT ist).
(function(){
    const verbrauchSrc = schneide(AP, 'function pickVerbrauch()');
    pruefe('B13a: pickVerbrauch laesst sich ausschneiden', !!verbrauchSrc);
    if (!pickSrc || !stehtSrc || !verbrauchSrc) { pruefe('B13: funktionale Ausfuehrung moeglich', false); return; }

    function bauAutopilotSeite(opts) {
        opts = opts || {};
        const root = El('root');
        if (!opts.ohneSelect) {
            const box = kind(root, El('div', { className: 'ui-selectonemenu' }));
            const sel = kind(box, El('select'));
            sel.options = [{ textContent: '', value: '' }, { textContent: 'Export Projektergebnisse', value: '9' }];
            sel.selectedIndex = 0;
            const lab = kind(box, El('label', { className: 'ui-selectonemenu-label', textContent: opts.labelText || '' }));
            const trig = kind(box, El('div', { className: 'ui-selectonemenu-trigger' }));
            const panel = kind(root, El('div', { className: 'ui-selectonemenu-panel' }));
            // Wie im echten PrimeFaces: die Eintraege stehen schon im DOM,
            // sind aber UNSICHTBAR, bis der Trigger das Panel oeffnet — der
            // echte byText() verlangt vis(), der Stub bildet das nach.
            if (!opts.panelLeer) kind(panel, El('li', { className: 'ui-selectonemenu-item', textContent: 'Export Projektergebnisse', sichtbar: false }));
            trig.click = function(){ trig.geklickt++; panel.children.forEach(function(li){ li.sichtbar = true; }); };
            return { root: root, sel: sel, lab: lab, trig: trig, panel: panel };
        }
        return { root: root };
    }

    function pickLauf(seite, opts) {
        opts = opts || {};
        const doc = docAus(seite.root);
        const normFn = function(s){ return (s || '').replace(/\s+/g, ' ').trim().toLowerCase(); };
        const u = { banners: [], dashStarts: 0, untilFails: 0 };
        const byTextFn = function(selk, txt){
            const t = normFn(txt), list = doc.querySelectorAll(selk);
            for (let i = 0; i < list.length; i++) {
                if (list[i].sichtbar === false) continue;   // vis()-Nachbildung
                const et = normFn(list[i].textContent || '');
                if (et && et.indexOf(t) !== -1) return list[i];
            }
            return null;
        };
        // until synchron: test truthy -> act, sonst onFail (der Timeout-Ast).
        const untilFn = function(test, act, t, msg, onFail){
            let r = null; try { r = test(); } catch(e){}
            if (r) act(r); else { u.untilFails++; if (onFail) onFail(); }
        };
        const quell = 'var pickVersuche = 0, pickZuletzt = 0;\n' + verbrauchSrc + '\n' + stehtSrc + '\n' + pickSrc +
            '\nreturn function(){ pickExportView(); };';
        const fn = new Function('document','norm','byText','until','click','banner','startDashboard','setTimeout','manuell','stop','Date','Event', quell);
        const laufFn = fn(doc, normFn, byTextFn, untilFn,
            function(el){ if (el && el.click) el.click(); return true; },
            function(t){ u.banners.push(String(t)); },
            function(){ u.dashStarts++; },
            function(f){ f(); },
            function(){ return !!opts.manuell; },
            false, Date,
            function(type){ return { type: type }; });
        laufFn();
        u.nochmal = laufFn;
        return u;
    }

    // Szenario 1: leere Auswahl, Widget + Panel-Eintrag da -> Klickfolge, Label bleibt unangetastet
    const s1 = bauAutopilotSeite({});
    const u1 = pickLauf(s1);
    pruefe('B13b: Trigger geklickt', s1.trig.geklickt === 1);
    pruefe('B13c: Ziel-Eintrag geklickt', s1.panel.children[0].geklickt === 1);
    pruefe('B13d: startDashboard geplant', u1.dashStarts >= 1);
    pruefe('B13e: das Label wurde NICHT von Hand gesetzt (der Mutations-Faenger)', s1.lab.textContent === '');
    // Szenario 2: Panel liefert keinen Eintrag -> onFail MUSS startDashboard starten (Sackgassen-Wache)
    const s2 = bauAutopilotSeite({ panelLeer: true });
    const u2 = pickLauf(s2);
    pruefe('B13f: Timeout-Ast erreicht (Eintrag fehlt)', u2.untilFails === 1);
    pruefe('B13g: onFail startet startDashboard — die once()-Sackgasse ist zu', u2.dashStarts >= 1);
    // Szenario 3: Handbetrieb -> pickExportView fasst NICHTS an
    const s3 = bauAutopilotSeite({});
    const u3 = pickLauf(s3, { manuell: true });
    pruefe('B13h: Handbetrieb — kein Klick, kein Dashboard-Start aus pickExportView',
        s3.trig.geklickt === 0 && u3.dashStarts === 0);
    // Szenario 4: Statistik-select (noch) nicht da -> kein Fremd-Klick, Versuch NICHT verbrannt
    const s4 = bauAutopilotSeite({ ohneSelect: true });
    // ein fremdes Widget OHNE Ziel-Option steht schon auf der Seite:
    const fremdBox = kind(s4.root, El('div', { className: 'ui-selectonemenu' }));
    const fremdSel = kind(fremdBox, El('select')); fremdSel.options = [{ textContent: 'Irgendwas', value: '1' }]; fremdSel.selectedIndex = 0;
    const fremdTrig = kind(fremdBox, El('div', { className: 'ui-selectonemenu-trigger' }));
    const u4 = pickLauf(s4);
    pruefe('B13i: FREMDES Dropdown wird nicht mehr aufgeklappt (kein Seiten-Fallback)', fremdTrig.geklickt === 0);
    pruefe('B13j: startDashboard trotzdem geplant (Wache uebernimmt)', u4.dashStarts >= 1);
    // Versuch nicht verbrannt: ein SOFORTIGER zweiter Lauf derselben Instanz darf
    // handeln, sobald das select da ist (keine 25-s-Drossel aktiv).
    const boxSpaet = kind(s4.root, El('div', { className: 'ui-selectonemenu' }));
    const selSpaet = kind(boxSpaet, El('select'));
    selSpaet.options = [{ textContent: 'Export Projektergebnisse', value: '9' }]; selSpaet.selectedIndex = -1;
    const trigSpaet = kind(boxSpaet, El('div', { className: 'ui-selectonemenu-trigger' }));
    const panelSpaet = kind(s4.root, El('div', { className: 'ui-selectonemenu-panel' }));
    const liSpaet = kind(panelSpaet, El('li', { className: 'ui-selectonemenu-item', textContent: 'Export Projektergebnisse', sichtbar: false }));
    trigSpaet.click = function(){ trigSpaet.geklickt++; liSpaet.sichtbar = true; };
    u4.nochmal();
    pruefe('B13k: leer ausgegangener Lauf verbrennt keinen Versuch — der naechste handelt sofort',
        trigSpaet.geklickt === 1 && liSpaet.geklickt === 1);
    // Szenario 5: Ansicht steht (Label traegt Ziel) -> nur startDashboard, kein Klick
    const s5 = bauAutopilotSeite({ labelText: 'Export Projektergebnisse' });
    const u5 = pickLauf(s5);
    pruefe('B13l: steht die Ansicht, wird nur das Dashboard gestartet', u5.dashStarts >= 1 && s5.trig.geklickt === 0);
})();

// B12: die erzeugten Varianten tragen den Umbau mit
(function(){
    let mob = '', um = '';
    try { mob = fs.readFileSync(path.join(__dirname, '..', 'esl_autopilot_mobile.user.js'), 'utf8'); } catch(e){}
    try { um  = fs.readFileSync(path.join(__dirname, '..', 'esl_autopilot_um.user.js'), 'utf8'); } catch(e){}
    pruefe('B12a: Mobile-Variante enthaelt exportAnsichtSteht', mob.indexOf('function exportAnsichtSteht') >= 0);
    pruefe('B12b: UM-Variante enthaelt exportAnsichtSteht', um.indexOf('function exportAnsichtSteht') >= 0);
})();

// ============================================================================
//  BLOCK C — Konfigurator-Panel-Abraeumer (Re-Inject: "Konfigurator ist leer")
// ============================================================================
(function(){
    const anker = '// ---------- Panel ----------';
    const iAnker = V22.indexOf(anker);
    const block = iAnker >= 0 ? V22.slice(iAnker, iAnker + 1600) : '';
    const iRaeum = block.indexOf("querySelectorAll('#rcCfgPanel, #rcCfgBackdrop')");
    const iAnlage = block.indexOf("panel.id='rcCfgPanel'");
    pruefe('C1: Abraeumer fuer #rcCfgPanel + #rcCfgBackdrop vorhanden', iRaeum >= 0);
    pruefe('C2: Abraeumer laeuft VOR dem Anlegen des neuen Panels', iRaeum >= 0 && iAnlage > iRaeum);

    // C3 funktional: zwei Alt-Panels + Backdrop im Mini-DOM, Abraeumer-Zeile ausfuehren
    const zeile = (block.match(/Array\.prototype\.forEach\.call\(document\.querySelectorAll\('#rcCfgPanel, #rcCfgBackdrop'\)[^\n]*\);/) || [null])[0];
    pruefe('C3a: Abraeumer-Zeile herausschneidbar', !!zeile);
    if (zeile) {
        const root = El('root');
        const p1 = kind(root, El('div', { id: 'rcCfgPanel' }));
        const p2 = kind(root, El('div', { id: 'rcCfgPanel' }));
        const b1 = kind(root, El('div', { id: 'rcCfgBackdrop' }));
        new Function('document', zeile)(docAus(root));
        pruefe('C3b: ALLE Alt-Panels und der Backdrop werden entfernt', p1.removed && p2.removed && b1.removed);
    } else { pruefe('C3b: ALLE Alt-Panels und der Backdrop werden entfernt', false); }

    // C4 GEGENPROBE: Der Fehler war real — bei zwei Panels liefert getElementById
    // das ERSTE (alte); renderTabs haette dorthin geschrieben, das sichtbare
    // neue Panel bliebe leer. Der Mini-DOM bildet genau diese Semantik ab.
    const root2 = El('root');
    const altP = kind(root2, El('div', { id: 'rcCfgPanel' }));
    kind(altP, El('div', { id: 'rcCfgTabs', textContent: '' }));
    const neuP = kind(root2, El('div', { id: 'rcCfgPanel' }));
    kind(neuP, El('div', { id: 'rcCfgTabs', textContent: '' }));
    const doc2 = docAus(root2);
    const getroffen = doc2.getElementById('rcCfgTabs');
    pruefe('C4: Gegenprobe — ohne Abraeumer traefe getElementById das ALTE Panel (der gemeldete Blanco-Fehler)', getroffen === altP.children[0] && getroffen !== neuP.children[0]);
})();

// ============================================================================
console.log('');
if (fail === 0) console.log('ALLE ' + ok + ' PRUEFUNGEN BESTANDEN');
else console.log(ok + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
