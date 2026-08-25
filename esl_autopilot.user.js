// ==UserScript==
// @name         ESL Live-Arena Autopilot
// @namespace    regiocom.esl.livearena
// @version      2.0
// @description  Startet die komplette ESL-Live-Arena-Kette automatisch: ESL-Login -> Vodafone Kabel -> Projektergebnisse -> Export -> Dashboard, parallel CCS-Login -> Ligaliste -> KPI-Crawler.
// @author       regiocom
// @match        https://esl.regiocom.net/*
// @match        https://ccs.vodafone.de/*
// @match        https://login.microsoftonline.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/* ============================================================================
   ESL LIVE-ARENA AUTOPILOT v2
   ----------------------------------------------------------------------------
   ZWEI BETRIEBSARTEN — dieselbe Datei:

   A) ALS USERSCRIPT (Tampermonkey/Violentmonkey)  <-- ECHTER EIN-KLICK-START
      Installieren, fertig. Das Script laeuft danach AUTOMATISCH auf jeder
      Portal-Seite und arbeitet die Kette selbstaendig ab — auch ueber
      Seiten-Neuladen hinweg (genau das kann ein Lesezeichen NICHT).

   B) ALS KONSOLEN-PASTE / BOOKMARKLET (ohne Add-on)
      Dieselbe Logik, aber es lebt nur bis zum naechsten Seitenwechsel —
      also einmal pro Seite ausfuehren. Immer noch besser als von Hand.

   ----------------------------------------------------------------------------
   WARUM DER ALTE AUTOPILOT "NICHTS GEMACHT" HAT (per DOM-Spion belegt)
     1. Bookmarklet stirbt bei jedem Seitenwechsel -> auf der Login-Seite lief
        gar kein Code mehr. Loesung: Userscript (Variante A).
     2. Die Statistik-Auswahl wurde ueber JSF-IDs (filterForm:j_idt463 /
        j_idt511) gesucht. Diese Nummern aendern sich bei Portal-Updates.
        Loesung: Elemente werden ueber ihren SICHTBAREN TEXT gefunden.
     3. Auf der Microsoft-Anmeldung fuellt Edge NICHT automatisch (i0116 war
        leer, es erscheint nur die Kennwort-Auswahlliste). Auf Autofill zu
        warten haengt ewig. Loesung: E-Mail wird eingetragen (einmalig
        abgefragt, nur die Adresse) und "Weiter" geklickt. Das PASSWORT wird
        NIE gespeichert und NIE eingetippt — das bleibt beim Browser/dir.

   ----------------------------------------------------------------------------
   EINMALIGE VORBEREITUNG
     Damit der Autopilot Dashboard und Crawler starten kann, muessen deren
     Quelltexte einmal pro PC im localStorage liegen:
       - esl.regiocom.net : esl_dashboard_installer.js in die F12-Konsole
                            (legt 'rcDashboardCode' ab)
       - ccs.vodafone.de  : rcAutoSaveCrawler()  in die F12-Konsole ausfuehren
                            (siehe Konsolen-Hilfe unten) ODER die Crawler
                            weiterhin per Lesezeichen starten.
     Fehlt etwas, sagt das Status-Banner unten rechts genau, was fehlt.

   KONSOLE
     rcAutoStatus()   — was der Autopilot gerade sieht/vorhat
     rcAutoReset()    — Ablauf-Zustand zuruecksetzen (bei Haenger)
     rcAutoMail(x)    — Anmelde-Mail fuer die MS-Anmeldung setzen/anzeigen
                        (Vorgabe steht in CFG.MAIL_STD — es wird NICHT mehr
                         nachgefragt; ein Passwort wird nie gespeichert)
     rcAutoOff()      — Autopilot fuer diesen Tab stoppen
============================================================================ */

(function () {
    'use strict';

    // In RAHMEN (iframes) nie laufen (27.09.). Der Starter spielt den Autopiloten
    // per Page.addScriptToEvaluateOnNewDocument in JEDEN Rahmen des Tabs ein. Das
    // Dashboard haelt Mobile und UM in zwei unsichtbaren Rahmen offen (Alle-
    // Projekte-Betrieb) — ein Autopilot dort saehe ein "fremdes Projekt", stellte
    // den Rahmen auf die Starter-Marke (Kabel) zurueck und startete ein zweites
    // Dashboard. Die Rahmen steuert ausschliesslich das Dashboard.
    try { if (window.top !== window.self) return; } catch (e) { return; }

    // Doppelstart vermeiden (Userscript + versehentlicher Konsolen-Paste)
    if (window.__rcAutoPilotV2) { try { console.log('[Autopilot] laeuft bereits.'); } catch (e) {} return; }
    window.__rcAutoPilotV2 = true;

    var CFG = {
        LIGA_URL:  'https://ccs.vodafone.de/cgi-bin/AGENTEN_KENNZAHLEN_2/LIGA_LISTEN_NEW/dist/liga_listen.rb?script_id=11035',
        // script_id ist PFLICHT — ohne sie antwortet das Portal mit
        // "Sie haben keine Berechtigung" und ORA-00936 (Ausdruck fehlt).
        GM_URL:    'https://ccs.vodafone.de/cgi-bin/GENESYS/MONITOR_2/gm2.rb?script_id=10777',
        CCS_START: 'https://ccs.vodafone.de/cgi-bin/LOGIN/start.rb',
        LS_DASH:   'rcDashboardCode',      // vom esl_dashboard_installer.js gesetzt
        LS_KPI:    'rcWcaCrawlerSrc',      // kpi_crawler.js   (optional)
        LS_GM:     'rcGmCrawlerSrc',       // genesys_monitor_crawler.js (Warteschleife, optional)
        LS_MAIL:   'rcAutoMail',           // NUR die Anmelde-Adresse, NIE ein Passwort
        // Fest hinterlegte Anmelde-Adresse (NUR die Adresse — ein Passwort steht
        // hier NIE). Grund: der localStorage haengt am Origin, die MS-Anmeldung
        // laeuft aber auf login.microsoftonline.com — und Citrix leert den
        // Browser-Speicher regelmaessig. Beides zusammen fuehrte dazu, dass die
        // Adresse gefuehlt bei jeder Anmeldung neu eingetippt werden musste.
        // Zum Aendern (anderer Rechner/Nutzer): diese Zeile oder einmalig
        // rcAutoMail("vorname.nachname@vodafone.com") in der Konsole.
        MAIL_STD:  'veysel.yarba@vodafone.com',
        KMSI_JA:   true,                   // "Angemeldet bleiben?" mit Ja beantworten
        // ---- WELCHES PROJEKT im ESL-Menue "Projekte" ----------------------
        // Das ESL fuehrt drei getrennte Projekte, jedes mit eigener Seite und
        // eigenen Zahlen:
        //     Vodafone Kabel  -> /Agents/secure/sis_vodafone.xhtml
        //     Vodafone Mobile -> /Agents/secure/sis_vodafone_mobile.xhtml
        //     Vodafone UM     -> /Agents/secure/sis_vodafone_um.xhtml
        // Gewaehlt wird ueber den MENUEEINTRAG, nicht ueber die Adresse: die
        // UM-Adresse enthaelt ein kodiertes Leerzeichen ("secure%20/"), und die
        // Menue-IDs (frmMainMenu:j_idt40) aendern sich bei Portal-Updates. Der
        // sichtbare Text ist das einzig Stabile.
        // Fuer die anderen Projekte gibt es fertige Fassungen dieser Datei
        // (esl_autopilot_mobile.user.js / esl_autopilot_um.user.js), erzeugt mit
        // "node autopilot_varianten_erzeugen.js".
        PROJEKT:      'Vodafone Kabel',
        PROJEKT_DATEI: 'sis_vodafone.xhtml'   // woran man erkennt, dass man dort ist
    };

    var H = location.hostname, P = location.pathname + location.search;
    var stop = false;

    // ---------- Status-Banner ----------
    function bannerEl() {
        var b = document.getElementById('rcAutoBanner');
        if (!b) {
            b = document.createElement('div');
            b.id = 'rcAutoBanner';
            b.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:2147483647;background:#161616;' +
                'color:#F5F5F5;font:700 12.5px/1.45 Arial,sans-serif;padding:10px 16px;border-radius:8px;' +
                'border-left:4px solid #E60000;box-shadow:0 4px 18px rgba(0,0,0,.55);max-width:380px;';
            (document.body || document.documentElement).appendChild(b);
        }
        return b;
    }
    function banner(msg, col) {
        try {
            var b = bannerEl();
            b.style.borderLeftColor = col || '#E60000';
            b.textContent = 'Autopilot: ' + msg;
        } catch (e) {}
        // Rote und gelbe Meldungen zusaetzlich FESTHALTEN. Der Banner wird von
        // der naechsten Meldung ueberschrieben und verschwindet mit der Seite —
        // ausgerechnet die Meldung, auf die es beim Haenger ankommt ("... nicht
        // im Menue gefunden"), war deshalb nicht mehr auffindbar, wenn jemand
        // nachsah. console.warn hebt sie ausserdem aus dem Normalbetrieb heraus.
        try {
            if (col === '#FF6666' || col === '#FFB84D') {
                window.rcAutoLetzterFehler = { zeit: new Date().toLocaleTimeString('de-DE'), text: msg };
                console.warn('[Autopilot] ' + msg);
                return;
            }
        } catch (e) {}
        try { console.log('[Autopilot] ' + msg); } catch (e) {}
    }
    // Banner MIT Knopf — fuer alles, was einen echten Mausklick braucht
    // (ein Datei-Dialog darf nur aus einer Nutzer-Geste heraus oeffnen).
    function bannerAction(msg, label, fn, col) {
        try {
            var b = bannerEl();
            b.style.borderLeftColor = col || '#FFB84D';
            b.textContent = '';
            var t = document.createElement('div');
            t.textContent = 'Autopilot: ' + msg;
            t.style.marginBottom = '8px';
            var btn = document.createElement('button');
            btn.textContent = label;
            btn.style.cssText = 'background:#E60000;color:#fff;border:none;padding:8px 14px;border-radius:6px;' +
                'font:700 12.5px Arial,sans-serif;cursor:pointer;';
            btn.onclick = function (e) { e.preventDefault(); try { fn(); } catch (err) { banner('Fehler: ' + err.message, '#FF6666'); } };
            b.appendChild(t); b.appendChild(btn);
        } catch (e) {}
        try { console.log('[Autopilot] ' + msg + '  -> ' + label); } catch (e) {}
    }
    window.rcAutoOff = function () { stop = true; banner('gestoppt (nur dieser Tab).', '#9C9C9C'); };

    // ---------- Hilfen ----------
    function id(x) { return document.getElementById(x); }          // vertraegt IDs mit ":"
    function vis(el) { try { return !!(el && (el.offsetParent || el.offsetWidth || el.offsetHeight)); } catch (e) { return false; } }
    // ECHT bedienbar? Microsoft parkt das Passwortfeld mit class="moveOffScreen"
    // weit ausserhalb des Bildschirms — es meldet trotzdem Breite/Hoehe und galt
    // damit faelschlich als "sichtbar". Dadurch hielt der Autopilot die E-Mail-
    // Maske fuer die Passwort-Maske und tat nichts. Deshalb zusaetzlich pruefen,
    // ob das Element tatsaechlich IM sichtbaren Bereich liegt.
    function usable(el) {
        if (!el || !vis(el)) return false;
        if (/moveoffscreen/i.test((el.className || '').toString())) return false;
        try {
            var r = el.getBoundingClientRect();
            if (!r || r.width <= 1 || r.height <= 1) return false;
            if (r.right <= 0 || r.bottom <= 0) return false;                       // links/oben rausgeschoben
            if (r.left > (window.innerWidth || 4000) || r.top > (window.innerHeight || 4000) * 3) return false;
        } catch (e) { return false; }
        return true;
    }
    function norm(s) { return (s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

    // Erstes SICHTBARES Element, dessen Text `txt` enthaelt — der versionsfeste Weg
    // (statt IDs wie filterForm:j_idt511, die sich bei Updates aendern).
    function byText(sel, txt, exact) {
        var t = norm(txt), list = document.querySelectorAll(sel);
        for (var i = 0; i < list.length; i++) {
            var e = list[i], et = norm(e.innerText || e.textContent || e.value || '');
            if (!et || !vis(e)) continue;
            if (exact ? et === t : et.indexOf(t) !== -1) return e;
        }
        return null;
    }
    // ---------- Projekt-Menue: sehen, was wirklich dasteht ----------
    // EIN Selektor fuer beide Suchen. Vorher suchte der erste Anlauf mit
    // 'span.ui-menuitem-text, a.ui-menuitem-link, a' und der zweite mit
    // 'span.ui-menuitem-text, a' — zwei verschiedene Sichten auf dieselbe Frage.
    var MENUE_SEL = 'span.ui-menuitem-text, a.ui-menuitem-link, a';
    // Alles, was byText() beim Menue ueberhaupt zu sehen bekommt. Das ist die
    // eine Auskunft, die den Haenger entscheidet: steht der Eintrag da, heisst
    // er anders, oder ist er schlicht nicht sichtbar?
    function menueEintraege() {
        var out = [], seen = {};
        var list = document.querySelectorAll(MENUE_SEL);
        for (var i = 0; i < list.length; i++) {
            var e = list[i];
            var roh = (e.innerText || e.textContent || e.value || '').replace(/\s+/g, ' ').trim();
            var n = norm(roh);
            if (!n || n.length > 60) continue;              // Rumpftexte ganzer Bereiche raus
            var key = n + '|' + vis(e);
            if (seen[key]) continue;
            seen[key] = 1;
            out.push({ text: roh, normalisiert: n, sichtbar: vis(e), tag: e.tagName.toLowerCase() });
        }
        return out;
    }
    var menueVersuche = 0;                                  // je Seitenaufbau frisch
    var MENUE_VERSUCHE_MAX = 3;
    // Timeout im Projekt-Menue. Frueher endete der Autopilot hier lautlos:
    // Banner setzen, fertig. Jetzt wird aufgeschrieben, was im Menue steht,
    // und begrenzt oft neu nachgesehen.
    function menueFehlgeschlagen(soll) {
        var alle = menueEintraege();
        var sichtbar = alle.filter(function (e) { return e.sichtbar; });
        var nah = alle.filter(function (e) { return e.normalisiert.indexOf('vodafone') !== -1; });
        window.rcAutoMenueBefund = { gesucht: norm(soll.name), sichtbar: sichtbar, alle: alle };
        try {
            console.warn('[Autopilot] "' + soll.name + '" NICHT im Menue gefunden. Gesucht wird EXAKT: "' + norm(soll.name) + '"');
            console.warn('[Autopilot] ' + sichtbar.length + ' von ' + alle.length + ' Eintraegen sichtbar. Kandidaten:');
            var zeig = nah.length ? nah : sichtbar.slice(0, 25);
            if (console.table) console.table(zeig); else console.warn(JSON.stringify(zeig, null, 2));
        } catch (e) {}

        menueVersuche++;
        if (menueVersuche < MENUE_VERSUCHE_MAX) {
            banner('"' + soll.name + '" noch nicht im Menue — Versuch ' + menueVersuche +
                   ' von ' + MENUE_VERSUCHE_MAX + ', ich sehe gleich noch einmal nach.', '#FFB84D');
            // Steht das Menue noch offen, den Knopf NICHT erneut klicken — das
            // klappt es zu, und der naechste Versuch suchte im geschlossenen Menue.
            done.openMenu = sichtbar.length ? 1 : 0;
            done.menuProjekt = 0;
            setTimeout(function () { if (!stop) eslFlow(); }, 4000);
            return;
        }
        banner('"' + soll.name + '" nicht im Menue gefunden (' + sichtbar.length +
               ' sichtbare Eintraege). In der Konsole: rcAutoWarum() — dort steht, wie die Eintraege wirklich heissen.', '#FF6666');
    }

    // Wartet, bis test() etwas liefert (oder Timeout) — dann act()
    // onFail (optional) laeuft beim Timeout. Ohne den war JEDER Timeout hier
    // endgueltig: eslFlow() laeuft genau EINMAL je Seitenaufbau, die once()-
    // Sperre ist verbraucht, und es gab nichts, was es noch einmal versucht
    // haette. Beim Projekt-Menue sah das aus wie "steht einfach da".
    function until(test, act, timeoutMs, failMsg, onFail) {
        var t0 = Date.now();
        var iv = setInterval(function () {
            if (stop) { clearInterval(iv); return; }
            var r = null;
            try { r = test(); } catch (e) { r = null; }
            if (r) { clearInterval(iv); try { act(r); } catch (e) { banner('Fehler: ' + e.message, '#FF6666'); } }
            else if (Date.now() - t0 > (timeoutMs || 30000)) {
                clearInterval(iv);
                if (failMsg) banner(failMsg, '#FF6666');
                if (onFail) { try { onFail(); } catch (e) { banner('Fehler: ' + e.message, '#FF6666'); } }
            }
        }, 400);
        return iv;
    }
    // Klick, der auch bei PrimeFaces zuverlaessig ankommt
    function click(el) {
        if (!el) return false;
        try { el.click(); return true; } catch (e) {}
        try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); return true; } catch (e) {}
        return false;
    }
    // "einmal pro Seitenaufbau"-Sperre, damit nichts doppelt geklickt wird
    var done = {};
    function once(key) { if (done[key]) return false; done[key] = 1; return true; }

    // ---------- Gespeicherten Quelltext ausfuehren (Dashboard/Crawler) ----------
    // Quelltext holen: ZUERST direkt mitgelieferter Code (window.__rcFiles),
    // sonst der Browser-Speicher.
    // __rcFiles setzt der PowerShell-Starter (ESL_Start.ps1) ueber die Edge-
    // Fernsteuerung — der Code kommt dann DIREKT von der Festplatte/U:, ganz
    // ohne Browser-Speicher. Damit ist Citrix' Aufraeumen voellig egal.
    var FILEKEY = { rcDashboardCode: 'dash', rcWcaCrawlerSrc: 'kpi', rcGmCrawlerSrc: 'gm' };
    // Quellen aus __rcFiles EINMAL in den Browser-Speicher spiegeln.
    // Vorher wurde localStorage nur im manuellen Datei-Dialog beschrieben
    // (pickAndStore) — die vom Starter mitgereichten Dateien landeten NIE dort.
    // Folge: In jedem Tab, den der Starter nicht ausgeruestet hat (z.B. der
    // Genesys-Monitor, den das Dashboard erst 25 s spaeter selbst oeffnet), stand
    // kein Quelltext bereit und die .js musste von Hand gewaehlt werden.
    // Gespiegelt wird nur, was fehlt oder sich geaendert hat, und nur auf der
    // Domain, auf der es gebraucht wird (localStorage ist pro Domain).
    function spiegleDateien() {
        var f;
        try { f = window.__rcFiles; } catch (e) { return; }
        if (!f) return;
        Object.keys(FILEKEY).forEach(function (key) {
            var src = f[FILEKEY[key]];
            if (!src || typeof src !== 'string' || src.length < 500) return;
            try {
                if (localStorage.getItem(key) === src) return;
                localStorage.setItem(key, src);
                try { console.log('[Autopilot] ' + key + ' im Browser-Speicher gesichert (' + Math.round(src.length / 1024) + ' KB)'); } catch (e2) {}
            } catch (e) { /* Speicher voll / privat: dann bleibt __rcFiles der Weg */ }
        });
    }
    function storedSrc(key) {
        try {
            var f = window.__rcFiles, k = FILEKEY[key];
            if (f && k && f[k]) return f[k];
        } catch (e) {}
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function runStored(key, name, alreadyRunning) {
        try { if (alreadyRunning && alreadyRunning()) { banner(name + ' laeuft bereits.', '#3DD68C'); return true; } } catch (e) {}
        var src = storedSrc(key);
        if (!src) return false;
        banner(name + ' wird gestartet ...');
        try { (0, eval)(src); banner(name + ' laeuft.', '#3DD68C'); return true; }
        catch (e) { banner(name + '-Fehler: ' + e.message, '#FF6666'); return false; }
    }
    // ---------- Quelltext EINMALIG hinterlegen (Datei-Dialog statt 950-KB-Paste) ----------
    // localStorage ist PRO DOMAIN: das Dashboard muss auf esl.regiocom.net
    // hinterlegt werden, die Crawler auf ccs.vodafone.de. Der Autopilot bietet
    // deshalb auf jeder Seite genau die Datei an, die dort gebraucht wird.
    function pickAndStore(key, name, dateiname, after) {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.js'; inp.style.display = 'none';
        (document.body || document.documentElement).appendChild(inp);
        inp.onchange = function (e) {
            var f = e.target.files[0];
            if (!f) { inp.remove(); return; }
            var r = new FileReader();
            r.onload = function (ev) {
                var src = ev.target.result || '';
                try { localStorage.setItem(key, src); }
                catch (err) {
                    banner(name + ' konnte nicht gespeichert werden (' + err.message + '). Speicher voll?', '#FF6666');
                    inp.remove(); return;
                }
                banner(name + ' hinterlegt (' + Math.round(src.length / 1024) + ' KB) — startet ...', '#3DD68C');
                inp.remove();
                if (after) setTimeout(after, 300);
            };
            r.readAsText(f);
        };
        inp.click();
        return 'Bitte ' + dateiname + ' auswaehlen.';
    }
    // Dashboard hinterlegen (auf esl.regiocom.net auszufuehren)
    window.rcAutoSaveDashboard = function () {
        return pickAndStore(CFG.LS_DASH, 'Dashboard', 'esl_live_arena_v22.js', function () {
            done.startDash = 0;                       // erneuten Startversuch erlauben
            runStored(CFG.LS_DASH, 'Live-Arena-Dashboard', function () { return !!window.rcLiveInterval; });
        });
    };
    // Crawler hinterlegen (auf ccs.vodafone.de auszufuehren)
    //   rcAutoSaveCrawler()        -> KPI-Crawler (Ligaliste)
    //   rcAutoSaveCrawler('gm')    -> Genesys-Monitor-Crawler (Warteschleife)
    var CRAWLER = {
        kpi:   { key: CFG.LS_KPI,   name: 'KPI-Crawler',            datei: 'kpi_crawler.js',            marke: 'kpi',   laeuft: function () { return !!window.kpiCrawlerInterval; } },
        gm:    { key: CFG.LS_GM,    name: 'Genesys-Monitor-Crawler', datei: 'genesys_monitor_crawler.js', marke: 'gm',    laeuft: function () { return !!window.RC_GM; } }
    };
    window.rcAutoSaveCrawler = function (which) {
        var c = CRAWLER[which] || CRAWLER.kpi;
        return pickAndStore(c.key, c.name, c.datei, function () {
            done[c.marke] = 0;
            runStored(c.key, c.name, c.laeuft);
        });
    };

    // ---------- Anmelde-Adresse (NUR die Adresse, nie ein Passwort) ----------
    window.rcAutoMail = function (v) {
        // Abfrage ueber getMail(), nicht roh aus dem localStorage: sonst meldet
        // die Konsole "(nicht gesetzt)", obwohl die hinterlegte Vorgabe greift.
        if (v === undefined) { return getMail() || '(nicht gesetzt)'; }
        try { localStorage.setItem(CFG.LS_MAIL, v); } catch (e) {}
        return 'Anmelde-Adresse gespeichert: ' + v;
    };
    // Reihenfolge: was der Nutzer selbst gesetzt hat -> was der Starter mitgibt
    // -> die fest hinterlegte Adresse. Der gefundene Wert wird zurueckgeschrieben,
    // damit rcAutoStatus()/rcAutoMail() ihn anzeigen und ein spaeterer Wechsel
    // per rcAutoMail(...) die Vorgabe dauerhaft ueberstimmt.
    function getMail() {
        var m = '';
        try { m = localStorage.getItem(CFG.LS_MAIL) || ''; } catch (e) {}
        if (!m && typeof window.__rcMail === 'string') m = window.__rcMail;
        if (!m) m = CFG.MAIL_STD || '';
        m = (m || '').trim();
        if (m) { try { if (localStorage.getItem(CFG.LS_MAIL) !== m) localStorage.setItem(CFG.LS_MAIL, m); } catch (e) {} }
        return m;
    }

    window.rcAutoReset = function () {
        try { ['rcAutoNavStep'].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
        done = {}; banner('Zustand zurueckgesetzt.', '#3DD68C'); return 'ok';
    };
    window.rcAutoStatus = function () {
        var s = { host: H, pfad: P, dashboardHinterlegt: false, kpiCrawlerHinterlegt: false, gmCrawlerHinterlegt: false, mail: getMail() ? 'gesetzt' : 'NICHT gesetzt' };
        try { s.dashboardHinterlegt = !!localStorage.getItem(CFG.LS_DASH); } catch (e) {}
        try { s.kpiCrawlerHinterlegt = !!localStorage.getItem(CFG.LS_KPI); } catch (e) {}
        try { s.gmCrawlerHinterlegt = !!localStorage.getItem(CFG.LS_GM); } catch (e) {}
        try { console.log('[Autopilot] Status:', JSON.stringify(s, null, 2)); } catch (e) {}
        return s;
    };
    // ---- WARUM STEHT ER? ----------------------------------------------------
    // Der Autopilot meldete Fehler bisher nur im Banner unten rechts — der wird
    // von der naechsten Meldung ueberschrieben und ist nach einem Seitenwechsel
    // weg. Genau die Auskunft, auf die es beim Haenger im Projekt-Menue ankommt
    // (wie heissen die Eintraege WIRKLICH, sind sie sichtbar, auf welches
    // Projekt ist dieser PC festgelegt), stand nirgends abrufbar.
    window.rcAutoWarum = function () {
        var soll = sollProjekt();
        var alle = menueEintraege();
        var sichtbar = alle.filter(function (e) { return e.sichtbar; });
        var treffer = byText(MENUE_SEL, soll.name, true);
        var lage = {
            seite: location.href,
            dateiname: projektDateiHier(),
            istProjektSeite: istProjektSeite(),
            aufSollProjekt: aufSollProjekt(),
            markeRcEslProjekt: (function () { try { return sessionStorage.getItem('rcEslProjekt') || '(nicht gesetzt)'; } catch (e) { return '(nicht lesbar)'; } })(),
            sollName: soll.name,
            sollDatei: soll.datei,
            cfgVorgabe: CFG.PROJEKT,
            gesuchtNormalisiert: norm(soll.name),
            eintragGefunden: !!treffer,
            loginMaskeDa: !!id('loginform'),
            filterFormDa: !!id('filterForm'),
            menueKnopfPerId: !!id('frmMainMenu:mainMenu'),
            menueKnopfSichtbar: vis(id('frmMainMenu:mainMenu')),
            menueOffen: sichtbar.length > 0,
            eintraegeGesamt: alle.length,
            eintraegeSichtbar: sichtbar.length,
            verbrauchteSperren: Object.keys(done),
            menueVersuche: menueVersuche,
            letzterFehler: window.rcAutoLetzterFehler || '(keiner)'
        };
        try {
            console.log('%c[Autopilot] WARUM steht er?', 'color:#E60000;font-weight:bold');
            console.log(JSON.stringify(lage, null, 2));
            console.log('--- Menue-Eintraege (die entscheidende Liste) ---');
            var zeig = sichtbar.length ? sichtbar : alle.slice(0, 30);
            if (console.table) console.table(zeig); else console.log(JSON.stringify(zeig, null, 2));
            if (!treffer) {
                console.warn('Kein Eintrag hat EXAKT den Text "' + norm(soll.name) + '". Drei moegliche Gruende:\n' +
                  '  1. Der Eintrag heisst im Portal anders — dann steht der echte Name oben in der Liste.\n' +
                  '  2. menueOffen=false: das Menue ist zu, byText() verlangt Sichtbarkeit.\n' +
                  '  3. markeRcEslProjekt zeigt auf ein anderes Projekt, als dieser PC fahren soll.');
            }
        } catch (e) {}
        return lage;
    };

    // ---- HANDBETRIEB + Startknopf (14.08., Nutzer-Vorgabe) ------------------
    // "ich moechte manuell gehen, aber ich brauche einen Button wo ich das
    // Dashboard starten kann! ich werde bis projekte -> stack waehlen etc."
    // Im Handbetrieb navigiert der Autopilot NICHT mehr selbst: kein Projekt-
    // Menue, keine Ansicht-Auswahl. Die ANMELDEHILFE bleibt bewusst an — sie ist
    // von Hand laestig (Edge gibt das Passwort erst nach einer echten Geste frei)
    // und war nicht gemeint.
    function manuell() {
        try { return localStorage.getItem('rcAutoManuell') === '1'; } catch (e) { return false; }
    }
    window.rcAutoManuell = function (an) {
        if (an === undefined) return manuell() ? 'Handbetrieb ist AN' : 'Handbetrieb ist AUS';
        try { localStorage.setItem('rcAutoManuell', an ? '1' : '0'); } catch (e) {}
        if (an) { startKnopf(); banner('Handbetrieb AN — ich navigiere nicht mehr selbst. Unten links: "Dashboard starten".', '#9C9C9C'); }
        else banner('Handbetrieb AUS — ich navigiere wieder selbst (nach dem naechsten Seitenaufbau).', '#9C9C9C');
        return an ? 'Handbetrieb AN' : 'Handbetrieb AUS';
    };

    // Fester Knopf unten LINKS — der Statusbanner sitzt rechts, sie stoeren sich
    // also nicht. Er ist IMMER da, auch im Automatikbetrieb: dann als Nachstarter,
    // falls der Ablauf irgendwo haengt. Sobald das Dashboard laeuft, verschwindet er.
    function startKnopf() {
        try {
            if (document.getElementById('rcAutoStartBtn')) return;
            if (window.rcLiveInterval) return;
            var b = document.createElement('button');
            b.id = 'rcAutoStartBtn';
            b.type = 'button';
            b.textContent = 'Dashboard starten';
            b.style.cssText = 'position:fixed;bottom:14px;left:14px;z-index:2147483647;background:#E60000;' +
                'color:#FFFFFF;border:none;padding:11px 18px;border-radius:8px;cursor:pointer;' +
                'font:700 13px Arial,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.55);';
            b.onclick = function (e) { e.preventDefault(); window.rcAutoStartJetzt(); };
            (document.body || document.documentElement).appendChild(b);
        } catch (e) {}
    }
    function knopfWeg() {
        try { var b = document.getElementById('rcAutoStartBtn'); if (b && b.parentNode) b.parentNode.removeChild(b); } catch (e) {}
    }
    // Startet das Dashboard SOFORT — ohne once()-Sperre und ohne Wartefenster.
    // Genau das braucht der Handbetrieb: der Nutzer weiss selbst, wann die Seite
    // so weit ist, und ein Fehlversuch darf ihn nicht dauerhaft aussperren
    // (once() setzt seine Sperre schon beim Pruefen, nicht beim Erfolg).
    window.rcAutoStartJetzt = function () {
        if (window.rcLiveInterval) { banner('Dashboard laeuft bereits.', '#9C9C9C'); knopfWeg(); return true; }
        if (!id('filterForm')) {
            banner('Noch keine Export-Ansicht auf dieser Seite. Bitte oben die Ansicht "Export Projektergebnisse" waehlen, dann noch einmal auf den Knopf.', '#FFB84D');
            return false;
        }
        banner('starte Dashboard ...');
        var ok = runStored(CFG.LS_DASH, 'Live-Arena-Dashboard', function () { return !!window.rcLiveInterval; });
        if (!ok) {
            bannerAction('Dashboard ist auf diesem PC noch nicht hinterlegt (einmalig).',
                'esl_live_arena_v22.js waehlen', window.rcAutoSaveDashboard);
            return false;
        }
        knopfWeg();
        return true;
    };

    // ========================================================================
    //  ABLAUF 1 — ESL (esl.regiocom.net)
    // ========================================================================
    function eslFlow() {
        // --- 1a) LOGIN-SEITE -------------------------------------------------
        // DOM-Spion bestaetigt: loginform:user / loginform:pw / loginform:btnLogin
        //
        // WICHTIG: NICHT einfach das erste input[type=password] der Seite nehmen!
        // Die Hauptanwendung (sis_vodafone.xhtml) enthaelt ein PASSWORT-AENDERN-
        // Formular (f_PwdChange:pw / :pw1 / :pw2). Wird das faelschlich fuer den
        // Login gehalten, wartet der Autopilot 45 s auf "Zugangsdaten" und
        // klickt am Ende womoeglich im falschen Dialog. Deshalb streng nur:
        // das Feld im #loginform ODER auf einer echten Login-URL.
        var loginForm = id('loginform');
        var pw = id('loginform:pw')
              || (loginForm ? loginForm.querySelector('input[type=password]') : null)
              || (/login/i.test(location.pathname) ? document.querySelector('input[type=password]:not([id*="PwdChange"]):not([id*="pwdchange"])') : null);
        if (pw && usable(pw) && !/pwdchange/i.test(pw.id || '')) {
            var user = id('loginform:user') || document.querySelector('#loginform input[type=text]');
            // WARUM HIER EIN KLICK NOETIG IST: Edge/Chromium fuellt gespeicherte
            // Zugangsdaten sichtbar aus, gibt die Werte an JavaScript aber erst
            // nach einer ECHTEN Nutzer-Geste frei. Vorher liefert pw.value einen
            // leeren String - aus dem Script heraus laesst sich das NICHT
            // ausloesen (ein .click() gilt nicht als echte Geste).
            // Auf dem PowerShell-Weg erledigt das der Starter per Fernsteuerung;
            // dann wird der Wert waehrend dieses Wartens von allein lesbar.
            // Auf dem Lesezeichen-Weg muss der Anwender einmal klicken - deshalb
            // steht das jetzt auch so im Banner (vorher hiess es nur "warte ...",
            // was 45 s lang so aussah, als haenge das Script).
            banner('ESL-Login: bitte EINMAL irgendwo ins Fenster klicken — Edge gibt das gespeicherte Passwort erst danach frei.');
            until(
                function () { return (pw.value && (!user || user.value)) ? true : null; },
                function () {
                    if (!once('eslLogin')) return;
                    // ZWEI ABSENDER SIND EINER ZU VIEL.
                    // Wird der Autopilot vom Starter (ESL_Start.cmd) eingespielt,
                    // arbeitet dieser am SELBEN Formular: er erzeugt die echte
                    // Maus-Geste und klickt anschliessend den Anmelde-Knopf. Beide
                    // haengen am selben Ausloeser — dem Moment, in dem Edge die
                    // gespeicherten Werte fuer JavaScript freigibt — und feuerten
                    // deshalb Sekundenbruchteile auseinander. Eine zweite Absendung
                    // waehrend die erste noch laeuft, laesst PrimeFaces die Maske
                    // mit Fehlermeldung stehen; der Starter raeumt sie dann per
                    // Neuladen ab. Genau das kostete die zusaetzlichen Anlaeufe.
                    // Der Starter meldet seinen Anspruch in window.__rcLoginOwner
                    // an. Die Marke VERFAELLT nach 25 s — laeuft kein Starter (oder
                    // ist er langst beendet und die Sitzung erst jetzt abgelaufen),
                    // schickt der Autopilot wie bisher selbst ab.
                    var owner = null;
                    try { owner = window.__rcLoginOwner; } catch (e) {}
                    if (owner && owner.wer === 'starter' && (Date.now() - (owner.ts || 0)) < 25000) {
                        banner('Anmeldung uebernimmt der Starter — ich halte mich zurueck.', '#9C9C9C');
                        // Sperre wieder loesen und spaeter erneut hinsehen: bleibt
                        // die Maske trotz Starter stehen, springt der Autopilot ein.
                        done.eslLogin = 0;
                        setTimeout(function () { if (!stop && id('loginform:pw')) eslFlow(); }, 12000);
                        return;
                    }
                    // Exakte ID (DOM-Spion), sonst Text-Fallback -> versionsfest
                    var btn = id('loginform:btnLogin') ||
                              byText('#loginform button, #loginform .ui-button, button, input[type=submit]', 'login', true) ||
                              byText('button, .ui-button, input[type=submit]', 'anmelden', true);
                    banner('Login wird abgeschickt ...');
                    setTimeout(function () { submitLogin(pw, user, btn); }, 350);
                },
                45000,
                'Passwort wurde nicht freigegeben. Entweder einmal ins Fenster klicken, oder es ist in DIESEM Edge-Profil keines gespeichert — dann einmal von Hand anmelden und speichern lassen.'
            );
            return;
        }

        // Der Startknopf ist ab hier IMMER da (nicht auf der Anmeldemaske —
        // die steigt oben schon aus). Auch im Automatikbetrieb: er ist dann der
        // Nachstarter, wenn der Ablauf irgendwo haengen bleibt.
        startKnopf();

        // --- HANDBETRIEB: ab hier navigiert der Nutzer selbst ----------------
        // Steht VOR allen Navigationszweigen. Der Autopilot fasst die Seite
        // nicht mehr an — sonst klickt er dem Nutzer die Auswahl weg, waehrend
        // der gerade Projekt und Stack waehlt.
        if (manuell()) {
            banner('Handbetrieb: bitte selbst bis "Export Projektergebnisse" gehen, dann unten links auf "Dashboard starten".', '#9C9C9C');
            return;
        }

        // --- 1d) EXPORT-ANSICHT DA? -> DASHBOARD STARTEN ---------------------
        // (zuerst pruefen: wenn schon fertig, nicht erneut durchs Menue laufen)
        //
        // FESTGENAGELT seit 06.08. spaetabends (Nutzer-Vorgabe "eine Startdatei,
        // die nur EINEN Stack macht - die laufen eh auf verschiedenen PCs").
        // Das Soll-Projekt kommt aus der Starter-Marke (sessionStorage
        // rcEslProjekt, vom Paket bei JEDEM Seitenaufbau gesetzt), Fallback CFG.
        // Die Zwischenloesung vom 06.08. abends ("Marke folgt der beobachteten
        // Seite") ist damit BEWUSST zurueckgenommen — Live-Befund: alle ESL-Tabs
        // eines Edge-Profils teilen sich EINE Server-Sitzung, und das Portal
        // wirft einen Tab nach dem Re-Login auf das zuletzt serverseitig aktive
        // Projekt. Mit "Marke folgt Seite" wurde aus dem Mobile-Tab dadurch
        // still ein zweiter Kabel-Tab (Kabel doppelt, Mobile auf null — und
        // andersrum). Jetzt gilt: dieser PC hat GENAU EIN Projekt, und wenn das
        // Portal woanders landet, wird dorthin ZURUECKGEWECHSELT.
        if (id('filterForm') && aufSollProjekt()) {
            pickExportView();
            return;
        }
        if (id('filterForm') && !aufSollProjekt()) {
            banner('Portal steht auf einem anderen Projekt — wechsle zurueck zu "' + sollProjekt().name + '" (dieser PC ist darauf festgelegt) ...', '#FFB84D');
        }
        // --- 1c) SCHON AUF DER RICHTIGEN PROJEKTSEITE, aber der Reiter fehlt --
        // Der Klick auf den Menueeintrag ist eine ECHTE Navigation: das Dokument
        // wird ersetzt, das nachgestellte setTimeout(gotoProjektergebnisse) stirbt
        // mit ihm, und eslFlow() laeuft auf der neuen Seite von vorn (es wird
        // genau EINMAL je Seitenaufbau aus weiche() gerufen, die once()-Sperren
        // sind also wieder leer).
        // Dort steht dann: kein filterForm (der Reiter "Projektergebnisse" ist
        // noch nicht gewaehlt) und ein zugeklapptes Menue, in dem byText() den
        // Projekteintrag nicht findet (es verlangt vis()). Ohne diesen Zweig
        // fiel der Autopilot damit in den Menue-Block darunter und klickte
        // WIEDER "Projekte" an - Seite laedt, alles von vorn, endlos.
        // Die Pruefung ist bewusst zweiteilig: eine FALSCHE Projektseite ohne
        // filterForm muss weiterhin ins Menue (zurueck zum Soll-Projekt).
        else if (istProjektSeite() && aufSollProjekt()) {
            gotoProjektergebnisse();
            return;
        }

        // --- 1b) MENUE: das Projekt der MARKE waehlen (Fallback: CFG) --------
        // Hierher kommt man nur auf Nicht-Projektseiten (Startseite, nach dem
        // Re-Login). Ziel ist das Projekt, das der Nutzer zuletzt offen hatte
        // (Marke) — erst ganz ohne Marke gilt die einkompilierte CFG-Vorgabe.
        // Der Menuepunkt heisst genau so, wie er auf dem Schirm steht — deshalb
        // EXAKTER Textvergleich. Ein "enthaelt"-Vergleich waere hier gefaehrlich:
        // "Vodafone UM" steckt als Zeichenfolge in keinem der anderen Namen, aber
        // ein kuenftiges "Vodafone UM Care" wuerde ihn faelschlich treffen.
        var sollP = sollProjekt();
        var ziel = byText(MENUE_SEL, sollP.name, true);
        if (ziel && once('menuProjekt')) {
            banner('Menue "' + sollP.name + '" ...');
            click(ziel.closest('a') || ziel);
            setTimeout(gotoProjektergebnisse, 1500);
            return;
        }
        // Menue ggf. erst aufklappen. Der Knopf traegt eine feste Id und heisst
        // sichtbar "Projekte"; die Id des aufklappenden Menues (frmMainMenu:j_idt40)
        // ist dagegen eine JSF-Laufnummer und aendert sich bei Portal-Updates —
        // deshalb wird sie nirgends benutzt.
        var mainMenu = id('frmMainMenu:mainMenu') ||
                       byText('button, .ui-button', 'projekte');
        if (mainMenu && once('openMenu')) {
            banner('oeffne Projekt-Menue ...');
            click(mainMenu);
            // Der Timeout ist NICHT mehr das Ende: menueFehlgeschlagen schreibt
            // auf, was im Menue wirklich steht, und sieht begrenzt oft neu nach.
            until(function () { return byText(MENUE_SEL, sollP.name, true); },
                  function (el) { click(el.closest('a') || el); setTimeout(gotoProjektergebnisse, 1500); },
                  8000, null,
                  function () { menueFehlgeschlagen(sollP); });
            return;
        }
        gotoProjektergebnisse();
    }

    // Steht die aktuelle Seite auf dem gewuenschten Projekt?
    // Verglichen wird der DATEINAME der Seite, nicht die ganze Adresse: der
    // UM-Pfad enthaelt ein kodiertes Leerzeichen ("/Agents/secure%20/"), das je
    // nach Aufrufweg mal so und mal als echtes Leerzeichen ankommt.
    function projektDateiHier() {
        var p = '';
        try { p = decodeURIComponent(location.pathname); } catch (e) { p = location.pathname || ''; }
        var m = p.split('/').pop() || '';
        return m.toLowerCase();
    }
    // Stehen wir ueberhaupt auf EINER der drei Projektseiten? Nur dann darf der
    // Ausstieg vor dem Menue-Block greifen — auf der ESL-Startseite muss der
    // Autopilot weiterhin ins Menue, um das Projekt (Marke bzw. CFG) zu waehlen.
    function istProjektSeite() {
        return projektDateiHier().indexOf('sis_') !== -1;
    }
    // ---- Projekt FESTGENAGELT je PC (06.08. spaetabends, Nutzer-Vorgabe) -----
    // Das Soll kommt aus der Starter-Marke sessionStorage.rcEslProjekt
    // ('kabel'/'mobile'/'um', exakt das BauPaket-Format aus ESL_Start.cmd —
    // seit heute traegt sie das per Parameter gewaehlte Projekt dieses PCs und
    // wird vom Paket bei JEDEM Seitenaufbau neu gesetzt). Fallback ist die
    // einkompilierte CFG-Vorgabe (Handstart per F12 ohne Starter: dann gilt
    // die Projekt-Variante der Datei, wie vor dem 06.08.).
    function sollProjekt() {
        var m = '';
        try { m = sessionStorage.getItem('rcEslProjekt') || ''; } catch (e) {}
        if (m === 'mobile') return { name: 'Vodafone Mobile', datei: 'sis_vodafone_mobile.xhtml' };
        if (m === 'um')     return { name: 'Vodafone UM',     datei: 'sis_vodafone_um.xhtml' };
        if (m === 'kabel')  return { name: 'Vodafone Kabel',  datei: 'sis_vodafone.xhtml' };
        return { name: CFG.PROJEKT, datei: CFG.PROJEKT_DATEI };
    }
    // Steht die aktuelle Seite auf dem Soll-Projekt? Auf Nicht-Projektseiten
    // (Anmeldemaske, Startseite) gibt es nichts zu pruefen -> true; als
    // alleinige Ausstiegsbedingung waere das falsch, deshalb steht im Ablauf
    // immer istProjektSeite() daneben.
    function aufSollProjekt() {
        var d = projektDateiHier();
        if (!d || d.indexOf('sis_') === -1) return true;
        return d === String(sollProjekt().datei || '').toLowerCase();
    }
    // Login absenden — WIE EIN ENTER-DRUCK, nicht per Knopf-Klick.
    // ----------------------------------------------------------------------
    // Befund aus dem Live-Betrieb: Ein .click() auf den PrimeFaces-Login-Knopf
    // endete mit "Passwort erforderlich !" (Feld auf aria-invalid), obwohl das
    // Passwort sichtbar ausgefuellt war. Grund: der Klick loest die PrimeFaces-
    // eigene AJAX-/Client-Validierung aus, die den vom Browser automatisch
    // eingefuellten Wert nicht mitbekommt. Ein ENTER dagegen loest eine ECHTE
    // Formular-Absendung des Browsers aus — dabei sendet der Browser die
    // Autofill-Werte selbst mit, und genau das funktionierte beim Nutzer.
    // Deshalb: erst Felder "anfassen" (input/change), dann requestSubmit()
    // (= exakt die native Absendung, die auch Enter ausloest), Klick nur als
    // letzter Notnagel.
    function submitLogin(pw, user, btn) {
        var form = (pw && pw.form) || id('loginform') || (btn && btn.form) || document.forms[0];
        // 1) Werte bekanntmachen (manche Widgets lesen erst nach input/change)
        [user, pw].forEach(function (el) {
            if (!el) return;
            try {
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (e) {}
        });
        // 2) Native Absendung — dasselbe, was Enter im Passwortfeld tut
        if (form && typeof form.requestSubmit === 'function') {
            try { form.requestSubmit(btn && btn.form === form && /submit/i.test(btn.type || 'submit') ? btn : undefined);
                  banner('Login abgeschickt (wie Enter).'); return 'requestSubmit'; } catch (e) {}
            try { form.requestSubmit(); banner('Login abgeschickt (wie Enter).'); return 'requestSubmit'; } catch (e) {}
        }
        // 3) Notnagel: Knopf klicken bzw. Formular hart absenden
        if (btn && click(btn)) { banner('Login abgeschickt (Knopf).'); return 'click'; }
        if (form) { try { form.submit(); banner('Login abgeschickt (Formular).'); return 'submit'; } catch (e) {} }
        banner('Login konnte nicht abgeschickt werden.', '#FF6666');
        return 'nichts';
    }

    function gotoProjektergebnisse() {
        if (stop) return;
        banner('oeffne "Projektergebnisse" ...');
        until(
            function () {
                return id('sis_form_01:CTS_tabProjektQueries') ||
                       byText('span.ui-menuitem-text, a.ui-tabs-anchor, a, .ui-tabs-anchor', 'projektergebnisse');
            },
            function (el) {
                if (!once('tabErgebnisse')) return;
                click(el.closest('a') || el);
                setTimeout(pickExportView, 1800);
            },
            20000,
            '"Projektergebnisse" nicht gefunden — bitte einmal manuell dorthin navigieren.'
        );
    }

    // Statistik-Auswahl auf "Export Projektergebnisse" stellen.
    // WICHTIG: KEINE j_idt-IDs mehr — die Liste wird daran erkannt, dass sie
    // eine Option mit diesem TEXT enthaelt. Das ueberlebt Portal-Updates.
    // UMGEBAUT 22.08. (Live-Befund aus der Nacht 21./22.08.: nach dem Re-Login
    // war die Auswahl leer, der EINE once()-Versuch verpuffte, und die Seite
    // stand bis zum Morgen auf "Bitte Abfrage waehlen!"):
    //  1. Zaehler mit Abstand statt once() — ein verpuffter Versuch ist nicht
    //     mehr endgueltig; die startDashboard-Schleife waehlt nach.
    //  2. Der PrimeFaces-KLICKWEG (Trigger auf, Eintrag klicken) kommt ZUERST:
    //     das ist exakt der Nutzerpfad, den das Widget sicher versteht. Ein
    //     select.value + change kann serverseitig verpuffen und bleibt Notnagel.
    //  3. Das Label wird NICHT mehr von Hand gesetzt: bei echtem Erfolg
    //     schreibt es PrimeFaces selbst — nur so bleibt exportAnsichtSteht()
    //     ein ehrlicher Zeuge (das Hand-Label meldete frueher einen Erfolg,
    //     den es nie gab, und jede Wiederholung stieg sofort aus).
    var pickVersuche = 0, pickZuletzt = 0;
    // Zaehler erst verbrauchen, wenn wirklich GEHANDELT wird (Klick oder
    // Notnagel) — ein Lauf, der das Statistik-select noch gar nicht vorfindet
    // (Export-Ansicht laedt noch per Ajax), darf keinen Versuch kosten.
    function pickVerbrauch() { pickZuletzt = Date.now(); pickVersuche++; }
    function exportAnsichtSteht() {
        var ZIEL = 'export projektergebnisse';
        var lbls = document.querySelectorAll('.ui-selectonemenu-label');
        for (var i = 0; i < lbls.length; i++) {
            if (norm(lbls[i].textContent).indexOf(ZIEL) !== -1) return true;
        }
        if (!lbls.length) {
            // Kein PrimeFaces-Widget auf der Seite? Dann zaehlt das native select.
            var sels = document.querySelectorAll('select');
            for (var s = 0; s < sels.length; s++) {
                var o = sels[s].selectedIndex >= 0 ? sels[s].options[sels[s].selectedIndex] : null;
                if (o && norm(o.textContent).indexOf(ZIEL) !== -1) return true;
            }
        }
        return false;
    }
    function pickExportView() {
        if (stop) return;
        // Handbetrieb gilt auch HIER, nicht nur in eslFlow: der Nutzer schaltet
        // ihn typischerweise ein, waehrend die startDashboard-Schleife schon
        // laeuft — ohne diesen Ausstieg klickte sie ihm weiter alle 25 s ins
        // Statistik-Dropdown, genau das, was der Handbetrieb verhindern soll.
        if (manuell()) return;
        var ZIEL = 'export projektergebnisse';
        if (exportAnsichtSteht()) { startDashboard(); return; }
        if (Date.now() - pickZuletzt < 25000 || pickVersuche >= 12) { startDashboard(); return; }

        // Das Statistik-select finden — es dient BEIDEN Wegen: sein Widget
        // liefert den richtigen Trigger, und es selbst ist der Notnagel.
        var sels = document.querySelectorAll('select'), target = null, val = null;
        for (var s = 0; s < sels.length && !target; s++) {
            for (var o = 0; o < sels[s].options.length; o++) {
                if (norm(sels[s].options[o].textContent).indexOf(ZIEL) !== -1) { target = sels[s]; val = sels[s].options[o].value; break; }
            }
        }

        // 1) PrimeFaces-Klickweg. Steht das Panel schon offen (halber Versuch
        //    davor), NICHT erneut den Trigger klicken — das klappte es nur zu
        //    (dieselbe Falle wie beim Projekt-Menue); direkt den Eintrag nehmen.
        var offenerEintrag = byText('li.ui-selectonemenu-item, li[role=option]', ZIEL);
        if (offenerEintrag) {
            pickVerbrauch();
            banner('waehle Ansicht "Export Projektergebnisse" ...');
            click(offenerEintrag);
            setTimeout(startDashboard, 2200);
            return;
        }
        // NUR der Trigger des eigenen Widgets — der fruehere Rueckfall auf das
        // erste .ui-selectonemenu-trigger der SEITE klappte ein beliebiges
        // fremdes Dropdown auf, sobald das Statistik-select (noch) fehlte.
        var box = target ? target.closest('.ui-selectonemenu') : null;
        var trig = box ? box.querySelector('.ui-selectonemenu-trigger') : null;
        if (trig) {
            pickVerbrauch();
            banner('waehle Ansicht "Export Projektergebnisse"' + (pickVersuche > 1 ? ' (Versuch ' + pickVersuche + ')' : '') + ' ...');
            click(trig);
            // onFail ist PFLICHT: ohne ihn startete nach einem 8-s-Timeout im
            // ERSTEN Aufruf je Seitenaufbau nie die startDashboard-Schleife —
            // und damit auch nie die Wache, die den naechsten Versuch traegt.
            // Exakt die once()-Sackgasse in neuer Verkleidung.
            until(function () { return byText('li.ui-selectonemenu-item, li[role=option]', ZIEL); },
                  function (el) { click(el); setTimeout(startDashboard, 2200); },
                  8000, 'Eintrag "Export Projektergebnisse" nicht gefunden — naechster Versuch folgt.',
                  function () { startDashboard(); });
            return;
        }

        // 2) Notnagel ohne Widget: natives <select> setzen + change ausloesen.
        if (target) {
            pickVerbrauch();
            banner('waehle Ansicht "Export Projektergebnisse" (natives Feld) ...');
            target.value = val;
            target.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // Kein select gefunden (Ansicht laedt noch): Versuch NICHT verbrennen —
        // die startDashboard-Wache ruft in Kuerze erneut an.
        setTimeout(startDashboard, 2200);
    }

    // Zaehler statt once() — dieselbe Lehre wie bei msFlow: once() setzt seine
    // Sperre schon beim PRUEFEN. Ein einziger Fehlversuch (Speicher leer, Seite
    // noch nicht fertig, eval-Fehler) liess das Dashboard frueher fuer immer
    // aus; der Starter musste per Hand nachhelfen ("Starter laeuft, Dashboard
    // fehlt trotzdem"). Jetzt: solange filterForm da ist und das Dashboard
    // nicht laeuft, alle 30 s ein neuer Versuch, gedeckelt auf 10.
    var dashIv = null, dashVersuche = 0, dashZuletzt = 0;
    function startDashboard() {
        if (stop) return;
        if (dashIv) return;                                       // laeuft schon (zweiter Aufrufer)
        var t0 = Date.now(), gewarnt = false;
        dashIv = setInterval(function () {
            if (stop) { clearInterval(dashIv); dashIv = null; return; }
            if (window.rcLiveInterval) {                          // Ziel erreicht
                clearInterval(dashIv); dashIv = null;
                knopfWeg();
                return;
            }
            if (!id('filterForm')) {                              // Ansicht (noch) nicht da
                if (!gewarnt && Date.now() - t0 > 25000) {
                    gewarnt = true;
                    banner('Export-Ansicht (filterForm) nicht gefunden — ich versuche es weiter.', '#FFB84D');
                }
                return;
            }
            // Ansicht-Wache (22.08.): steht die Statistik-Auswahl nicht (mehr),
            // erneut waehlen — Nacht-Befund: der Re-Login liess sie leer zurueck,
            // und ohne Auswahl liefert der Export nur HTML statt Excel.
            // pickExportView drosselt sich selbst (25 s Abstand, Deckel 12);
            // das Dashboard wird davon unabhaengig weiter gestartet, denn auch
            // ohne Auswahl zeigt es wenigstens den Stoerungs-Streifen.
            if (!exportAnsichtSteht()) { try { pickExportView(); } catch (e) {} }
            if (Date.now() - dashZuletzt < 30000) return;         // Abstand zwischen Versuchen
            if (dashVersuche >= 10) {
                clearInterval(dashIv); dashIv = null;
                banner('Dashboard-Start nach 10 Versuchen aufgegeben — unten links "Dashboard starten" oder rcAutoStartJetzt().', '#FF6666');
                return;
            }
            dashZuletzt = Date.now();
            dashVersuche++;
            window.rcAutoDashVersuche = dashVersuche;             // fuer rcAutoWarum()/Diagnose
            banner('Export-Ansicht bereit — starte Dashboard (Versuch ' + dashVersuche + ') ...');
            var ok = runStored(CFG.LS_DASH, 'Live-Arena-Dashboard', function () { return !!window.rcLiveInterval; });
            if (!ok) bannerAction('Dashboard ist auf diesem PC noch nicht hinterlegt (einmalig).',
                'esl_live_arena_v22.js waehlen', window.rcAutoSaveDashboard);
        }, 2000);
    }

    // ========================================================================
    //  ABLAUF 2 — Microsoft-Anmeldung (CCS-Tab)
    // ========================================================================
    // DOM-Spion: i0116 = E-Mail (war LEER!), i0118 = Passwort, idSIButton9 = Weiter.
    // Edge fuellt hier NICHT automatisch -> wir tragen die ADRESSE ein und klicken
    // "Weiter". Das PASSWORT tippt der Autopilot NIE ein.
    function msFlow() {
        banner('Microsoft-Anmeldung: Autopilot aktiv ...');
        // Zaehler statt once(): once() setzt seine Sperre schon beim PRUEFEN,
        // also bevor irgendetwas ueber den Erfolg bekannt ist. Ein click(), das
        // die Seite verwirft (weil es aus JavaScript kommt und nicht als echte
        // Geste gilt), blieb damit fuer immer der einzige Versuch — der
        // Autopilot lief weiter, tat aber nichts mehr. Die echte
        // Erfolgsbedingung ist, dass die jeweilige Maske aus dem DOM
        // verschwindet; deshalb wird mit Abstand wiederholt, bis das eintritt.
        // Absendungen bleiben streng gedeckelt: mehrere Fehlanmeldungen
        // hintereinander koennen ein Konto sperren.
        var kmsiVersuche = 0, kmsiZuletzt = 0;
        var pwVersuche = 0, pwZuletzt = 0;
        var iv = setInterval(function () {
            if (stop) { clearInterval(iv); return; }
            try {
                var btn  = id('idSIButton9');
                var mail = id('i0116') || document.querySelector('input[type=email],input[name=loginfmt]');
                var pass = id('i0118') || document.querySelector('input[type=password],input[name=passwd]');
                var kmsi = id('idBtn_Back');                         // "Angemeldet bleiben?" -> Nein
                var mfa  = id('idRichContext_DisplaySign') || id('idRemoteNGC_DisplaySign');

                if (mfa) { banner('Bitte im Authenticator auf dem Handy bestaetigen ...', '#FFCE00'); return; }

                // "Angemeldet bleiben?" — bis zu 5x mit 2 s Abstand. Der Zweig
                // faellt von allein weg, sobald idBtn_Back aus dem DOM ist; das
                // ist die einzig verlaessliche Erfolgsmeldung. Mehrfaches "Ja"
                // ist hier unschaedlich (es wird nichts angemeldet, nur bestaetigt).
                if (kmsi && btn && usable(btn) && !btn.disabled &&
                    kmsiVersuche < 5 && (Date.now() - kmsiZuletzt) > 2000) {
                    kmsiVersuche++; kmsiZuletzt = Date.now();
                    banner('"Angemeldet bleiben?" -> ' + (CFG.KMSI_JA ? 'Ja' : 'Nein') +
                        (kmsiVersuche > 1 ? ' (Versuch ' + kmsiVersuche + ')' : ''));
                    click(CFG.KMSI_JA ? btn : kmsi); return;
                }
                // Passwort-Schritt: NUR klicken, wenn der Browser es gefuellt hat.
                // usable() statt vis(): das off-screen geparkte Feld der E-Mail-Maske
                // zaehlt hier NICHT als Passwort-Schritt.
                // Hoechstens 2 Absendungen, mit 6 s Abstand — das ist eine echte
                // Anmeldung, hier waeren Wiederholungen nicht harmlos.
                if (pass && usable(pass) && pass.value && btn && !btn.disabled &&
                    pwVersuche < 2 && (Date.now() - pwZuletzt) > 6000) {
                    pwVersuche++; pwZuletzt = Date.now();
                    banner('Passwort erkannt -> Anmelden.' + (pwVersuche > 1 ? ' (Versuch ' + pwVersuche + ')' : ''));
                    click(btn); return;
                }
                // E-Mail-Schritt (solange die Passwort-Maske nicht wirklich da ist)
                if (mail && usable(mail) && (!pass || !usable(pass))) {
                    if (!mail.value) {
                        // Bewusst KEIN window.prompt mehr: die Adresse steht in
                        // CFG.MAIL_STD bzw. im localStorage, und ein offener
                        // Browser-Dialog laesst ausserdem jedes Runtime.evaluate
                        // der Fernsteuerung haengen — der Starter bleibt dann
                        // stehen, bis jemand von Hand auf OK klickt.
                        var m = getMail();
                        if (!m) {
                            if (once('askMail'))
                                banner('Keine Anmelde-Adresse hinterlegt — einmalig rcAutoMail("...") in der Konsole setzen.', '#FFB84D');
                            return;
                        }
                        mail.value = m;
                        mail.dispatchEvent(new Event('input',  { bubbles: true }));
                        mail.dispatchEvent(new Event('change', { bubbles: true }));
                        banner('Adresse eingetragen -> Weiter.');
                    }
                    if (mail.value && btn && once('msMail')) { click(btn); return; }
                }
                if (pass && usable(pass) && !pass.value) banner('Bitte Passwort eingeben/auswaehlen (Autopilot macht danach weiter).', '#FFB84D');
            } catch (e) {}
        }, 800);
    }

    // ========================================================================
    //  ABLAUF 3 — CCS / Ligaliste / Genesys-Monitor (ccs.vodafone.de)
    // ========================================================================
    function ccsFlow() {
        // ---- Selbstheilung: Fachanwendung ohne stehende CCS-Sitzung ----
        // Ein Direktaufruf von gm2.rb / liga_listen.rb ohne Login liefert eine
        // Seite mit "Sie haben keine Berechtigung, diese Anwendung auszufuehren"
        // (+ ORA-00936). Frueher blieb der Tab genau so stehen. Jetzt merkt sich
        // der Autopilot das Ziel im Fensternamen, holt den Login ueber start.rb
        // nach und kommt von dort automatisch zurueck (siehe "gotoZiel" unten).
        // Der Fensternamen ueberlebt die Navigation — anders als jede Variable.
        if (P.indexOf('start.rb') === -1) {
            var seitenText = '';
            try { seitenText = (document.body && document.body.innerText || '').slice(0, 3000); } catch (e) {}
            if (/keine\s+Berechtigung|ORA-\d{5}/i.test(seitenText)) {
                if (once('holeLogin')) {
                    try {
                        if (!window.name || window.name === 'about:blank') {
                            window.name = (P.indexOf('MONITOR_2') !== -1 || P.indexOf('gm2.rb') !== -1)
                                ? 'rcQueueQuelle'
                                : 'rcKpiQuelle';
                        }
                    } catch (e) {}
                    banner('Keine CCS-Sitzung — melde an und komme zurueck ...');
                    setTimeout(function () { location.href = CFG.CCS_START; }, 700);
                }
                return;
            }
        }

        // Genesys-Monitor offen -> Warteschleifen-Crawler starten
        // (/cgi-bin/GENESYS/MONITOR_2/gm2.rb — Qualitaets-Auswahl #quality-list)
        if (P.indexOf('MONITOR_2') !== -1 || P.indexOf('gm2.rb') !== -1) {
            banner('Genesys-Monitor erkannt — starte Warteschleifen-Crawler ...');
            until(
                function () { return document.getElementById('quality-list') || (document.readyState === 'complete' ? document.body : null); },
                function () {
                    if (!once('gmPage')) return;
                    var ok = runStored(CFG.LS_GM, 'Genesys-Monitor-Crawler', CRAWLER.gm.laeuft);
                    if (!ok) bannerAction('Warteschleifen-Crawler ist auf diesem PC noch nicht hinterlegt (einmalig).',
                        'genesys_monitor_crawler.js waehlen', function () { window.rcAutoSaveCrawler('gm'); });
                },
                40000,
                'Genesys-Monitor laedt nicht — bitte einmal eine Qualitaet waehlen und "Ok" klicken.'
            );
            return;
        }
        // Ligaliste offen -> KPI-Crawler starten
        if (P.indexOf('liga_listen') !== -1) {
            banner('Ligaliste erkannt — starte KPI-Crawler ...');
            until(
                function () { return document.querySelector('table#result-table') || (document.readyState === 'complete' ? document.body : null); },
                function () {
                    if (!once('kpi')) return;
                    var ok = runStored(CFG.LS_KPI, 'KPI-Crawler', function () { return !!window.kpiCrawlerInterval; });
                    if (!ok) bannerAction('KPI-Crawler ist auf diesem PC noch nicht hinterlegt (einmalig).',
                        'kpi_crawler.js waehlen', function () { window.rcAutoSaveCrawler(); });
                },
                30000,
                'Ligaliste laedt nicht — Seite pruefen.'
            );
            return;
        }
        // Sonst: eingeloggt in CCS (z.B. auf LOGIN/start.rb) -> weiter zum Ziel.
        // WELCHES Ziel, sagt der Fenstername: das Dashboard oeffnet die Quelle
        // bewusst ueber start.rb (sonst "keine Berechtigung") und benennt das
        // Fenster nach dem gewuenschten Werkzeug. window.name ueberlebt die
        // Navigation und ist im eigenen Fenster auch cross-origin lesbar.
        if (once('gotoZiel')) {
            var ziel = CFG.LIGA_URL, was = 'Ligaliste';
            // PRAEFIX-Vergleich statt exakt (05.08.): die Fensternamen sind seit
            // der Stack-Trennung projektspezifisch (rcQueueQuelle_mob,
            // rcKpiQuelle_um, ...). Ein exakter Vergleich liesse jeden Mobile-/
            // UM-Monitor-Tab in den Ligaliste-Zweig fallen — nach dem Login
            // stuende dann die Ligaliste im Monitor-Fenster.
            var wname = String(window.name || '');
            if (wname.indexOf('rcQueueQuelle') === 0) { ziel = CFG.GM_URL; was = 'Genesys-Monitor'; }
            // Erst weiter, wenn die Anmeldung wirklich durch ist. Steht noch ein
            // Passwortfeld auf der Seite, wuerde ein sofortiges Weiterspringen die
            // Anmeldung abbrechen und man landete wieder bei "keine Berechtigung".
            banner('Warte auf die CCS-Anmeldung ...');
            until(
                function () {
                    var pw = document.querySelector('input[type=password]');
                    return (!pw || !vis(pw)) ? (document.body || true) : null;
                },
                function () {
                    banner('CCS bereit — oeffne ' + was + ' ...');
                    setTimeout(function () { location.href = ziel; }, 800);
                },
                120000,
                'CCS-Anmeldung steht noch aus — bitte anmelden, danach geht es automatisch weiter.'
            );
        }
    }

    // ========================================================================
    //  FEHLERSEITE DES BROWSERS  (05.10. spaetabends)
    // ========================================================================
    // Laedt eine Portal-Seite nicht (Netz kurz weg, Portal antwortet nicht), zeigt
    // Edge seine eigene Fehlerseite ("Diese Seite ist nicht erreichbar"). Der
    // Autopilot laeuft auch dort — an echtem Edge gemessen: location.protocol ist
    // "chrome-error:", location.hostname "chromewebdata". Bis 05.10. fiel das in
    // den Zweig "keine bekannte Portal-Seite (chromewebdata)", und danach geschah
    // NICHTS mehr: die Ligaliste lieferte nicht, bis jemand den Tab von Hand neu
    // lud (Nutzer 05.10.: "updatet sich nicht immer und gibt immer die Meldung
    // 'Keine bekannte Portal-Seite'"). So kommt ein Tab dorthin: Crawler und
    // Dashboard laden nach einem Sitzungsverlust selbst neu — faellt das in einen
    // Netz-Aussetzer, steht die Fehlerseite. Edges eigener Neuversuch hilft im
    // Betrieb nicht verlaesslich, die Ligaliste liegt immer im Hintergrund.
    //   - Der TITEL der Fehlerseite ist der Hostname der Adresse, die nicht lud
    //     (gemessen). Daran und am Fensternamen wird erkannt, ob es eine UNSERER
    //     Seiten ist; ein fremder Tab wird nicht angefasst.
    //   - location.reload() holt von dort die urspruengliche Adresse zurueck
    //     (gemessen); Fenstername und Verbindung zum Dashboard bleiben.
    //   - Speicher gibt es dort nicht (sessionStorage wirft SecurityError), also
    //     auch keinen Zaehler: jeder Fehlversuch landet wieder hier und wartet
    //     erneut. Bei einem langen Ausfall ist das ein Versuch alle 20 s — so oft
    //     fragt das Dashboard das ESL ohnehin ab.
    var FEHLERSEITE_WARTE_SEK = 20;
    function istFehlerseite() {
        try { return location.protocol === 'chrome-error:' || H === 'chromewebdata'; } catch (e) { return false; }
    }
    // Hostname aus dem Titel der Fehlerseite ("ccs.vodafone.de", notfalls mit
    // Protokoll, Port oder Pfad drumherum).
    function fehlerseiteHost() {
        var t = '';
        try { t = String(document.title || ''); } catch (e) {}
        return t.toLowerCase().replace(/^\s+|\s+$/g, '').replace(/^[a-z]+:\/\//, '').split('/')[0].split(':')[0];
    }
    // Fehlercode der Fehlerseite ("ERR_CONNECTION_RESET", "HTTP ERROR 500") — an
    // echtem Edge gemessen: er steht im Element .error-code.
    function fehlerseiteCode() {
        try {
            var e = document.querySelector('.error-code, #error-code');
            return e ? String(e.textContent || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').slice(0, 60) : '';
        } catch (x) { return ''; }
    }
    function fehlerseiteFlow() {
        var blicke = 0;
        (function entscheide() {
            var host = fehlerseiteHost(), wname = '';
            try { wname = String(window.name || ''); } catch (e) {}
            // Der Titel steht nicht in der ersten Millisekunde — kurz nachsehen,
            // bevor "fremd" entschieden wird.
            if (!host && ++blicke <= 10) { setTimeout(entscheide, 300); return; }
            var unser = seitenArt(host) !== '' || wname.indexOf('rcKpiQuelle') === 0 || wname.indexOf('rcQueueQuelle') === 0;
            if (!unser) {
                banner('Seite nicht erreichbar' + (host ? ' (' + host + ')' : '') + ' — gehoert nicht zu ESL oder Ligaliste, hier passiert nichts.', '#9C9C9C');
                setTimeout(function () {
                    try { var b = document.getElementById('rcAutoBanner'); if (b && b.parentNode) b.parentNode.removeChild(b); } catch (e) {}
                }, 8000);
                return;
            }
            var code = fehlerseiteCode();
            banner((host || 'Das Portal') + ' ist nicht erreichbar (' + (code || 'Netz oder Portal antwortet nicht') + ') — lade in ' +
                FEHLERSEITE_WARTE_SEK + ' s von selbst neu.', '#FFB84D');
            // Dem Dashboard Bescheid geben: die Verbindung dorthin (opener) steht auch
            // auf der Fehlerseite (gemessen). Dort wird daraus eine Zeile im Logbuch —
            // sonst saehe man spaeter nur "Ligaliste still" und nicht, warum. Der Text
            // bleibt bei jedem Versuch GLEICH, damit das Dashboard ihn zusammenfasst.
            try {
                if (window.opener) window.opener.postMessage({ type: 'KPI_HINWEIS', zeit: Date.now(),
                    text: (wname.indexOf('rcQueueQuelle') === 0 ? 'Genesys-Tab' : wname.indexOf('rcKpiQuelle') === 0 ? 'Ligalisten-Tab' : 'Tab') +
                        ' steht auf der Fehlerseite des Browsers (' + (host || 'Adresse unbekannt') + (code ? ', ' + code : '') +
                        ') — der Autopilot laedt alle ' + FEHLERSEITE_WARTE_SEK + ' s neu, bis die Seite wieder da ist.' }, '*');
            } catch (e) {}
            setTimeout(function () {
                if (stop) return;
                try { location.reload(); } catch (e) {}
            }, FEHLERSEITE_WARTE_SEK * 1000);
        })();
    }

    // ========================================================================
    //  WEICHE
    // ========================================================================
    // EINE Liste der Seiten, die der Autopilot kennt — die Weiche UND die
    // Fehlerseite fragen sie (zwei Listen liefen auseinander).
    function seitenArt(h) {
        h = String(h || '').toLowerCase();
        if (h === 'esl.regiocom.net') return 'esl';
        if (h.indexOf('microsoftonline') !== -1 || h === 'login.live.com') return 'ms';
        if (h === 'ccs.vodafone.de') return 'ccs';
        return '';
    }
    function weiche() {
        try {
            var art = seitenArt(H);
            // Die Fehlerseite ZUERST: ihr Hostname ("chromewebdata") ist kein
            // fremder Tab, sondern eine unserer Seiten, die nicht lud.
            if (istFehlerseite())                             fehlerseiteFlow();
            else if (art === 'esl')                           eslFlow();
            else if (art === 'ms')                            msFlow();
            else if (art === 'ccs')                           ccsFlow();
            // about:blank/data:-Huellen (z.B. der zweite Tab, der laut
            // ESL_Start.ps1 bewusst leer bleibt, bis das Dashboard steht) haben
            // keinen Hostnamen — das ist kein Fehler, sondern der gewollte
            // Wartezustand. Nur bei einem ECHTEN, unbekannten Hostnamen warnen.
            else if (H) {
                // Fremde Seite: der Starter ruestet JEDEN Tab dieses Browsers aus,
                // also auch Postfach, Suchmaschine oder eine Anmelde-Zwischenseite.
                // Das ist kein Fehler und es gibt nichts zu tun. Vorher blieb hier
                // "keine bekannte Portal-Seite" dauerhaft stehen und las sich wie
                // eine Stoerung der Ligaliste (Nutzer 05.10.). Jetzt ein Satz, der
                // sagt, was er meint, und nach 8 s von selbst verschwindet.
                banner('diese Seite (' + H + ') gehoert nicht zu ESL oder Ligaliste — hier passiert nichts.', '#9C9C9C');
                setTimeout(function () {
                    try { var b = document.getElementById('rcAutoBanner'); if (b && b.parentNode) b.parentNode.removeChild(b); } catch (e) {}
                }, 8000);
            }
        } catch (e) {
            banner('Fehler: ' + e.message, '#FF6666');
        }
    }
    // ERST STARTEN, WENN DIE SEITE STEHT.
    // Wird der Autopilot ueber die Edge-Fernsteuerung eingeklinkt
    // (Page.addScriptToEvaluateOnNewDocument, siehe ESL_Start.ps1), laeuft er
    // schon VOR dem Seitenaufbau — dann existieren Login-Feld, Menue und
    // filterForm noch gar nicht und er findet nichts. Beim Konsolen-Paste /
    // Lesezeichen ist die Seite dagegen laengst fertig; deshalb hier beides
    // sauber abfangen.
    // Mitgereichte Quelltexte sofort sichern — noch VOR der Seitenweiche, damit
    // sie auch dann im Speicher liegen, wenn diese Seite selbst gar keinen
    // Crawler startet. Der Genesys-Monitor profitiert genau davon: er wird spaeter
    // in einem Tab geoeffnet, den der Starter nicht mehr ausruesten kann.
    try { spiegleDateien(); } catch (e) {}

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(weiche, 60); }, { once: true });
    } else {
        weiche();
    }

    try {
        console.log('%c[Autopilot v2] aktiv auf ' + H + '  —  rcAutoManuell(true) · rcAutoStartJetzt() · rcAutoWarum() · rcAutoStatus() · rcAutoReset() · rcAutoOff()',
            'color:#E60000;font-weight:bold');
    } catch (e) {}
})();
