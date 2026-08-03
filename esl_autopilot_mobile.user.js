// ==UserScript==
// @name         ESL Live-Arena Autopilot — Vodafone Mobile
// @namespace    regiocom.esl.livearena
// @version      2.0
// @description  Startet die komplette ESL-Live-Arena-Kette automatisch: ESL-Login -> Vodafone Kabel -> Projektergebnisse -> Export -> Dashboard, parallel CCS-Login -> Ligaliste -> KPI-Crawler (+ Croco-Crawler).
// @author       regiocom
// @match        https://esl.regiocom.net/*
// @match        https://ccs.vodafone.de/*
// @match        https://login.microsoftonline.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/* ERZEUGTE DATEI — NICHT VON HAND AENDERN.
   Quelle: esl_autopilot.user.js  ·  Neu erzeugen: node autopilot_varianten_erzeugen.js
   Unterschied zum Master: PROJEKT = "Vodafone Mobile", Seite = "sis_vodafone_mobile.xhtml"
============================================================================ */
/* ============================================================================
   ESL LIVE-ARENA AUTOPILOT v2  —  PROJEKT: VODAFONE MOBILE
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

    // Doppelstart vermeiden (Userscript + versehentlicher Konsolen-Paste)
    if (window.__rcAutoPilotV2) { try { console.log('[Autopilot] laeuft bereits.'); } catch (e) {} return; }
    window.__rcAutoPilotV2 = true;

    var CFG = {
        LIGA_URL:  'https://ccs.vodafone.de/cgi-bin/AGENTEN_KENNZAHLEN_2/LIGA_LISTEN_NEW/dist/liga_listen.rb?script_id=11035',
        CROCO_URL: 'https://ccs.vodafone.de/cgi-bin/CROCO_REPORT/crocorep.rb?script_id=10760',
        // script_id ist PFLICHT — ohne sie antwortet das Portal mit
        // "Sie haben keine Berechtigung" und ORA-00936 (Ausdruck fehlt).
        GM_URL:    'https://ccs.vodafone.de/cgi-bin/GENESYS/MONITOR_2/gm2.rb?script_id=10777',
        CCS_START: 'https://ccs.vodafone.de/cgi-bin/LOGIN/start.rb',
        // CroCo ist vorerst abgeschaltet (Wunsch 28.07.2026). Auf true setzen,
        // um den Croco-Crawler wieder automatisch starten zu lassen.
        CROCO_AN:  false,
        LS_DASH:   'rcDashboardCode',      // vom esl_dashboard_installer.js gesetzt
        LS_KPI:    'rcWcaCrawlerSrc',      // kpi_crawler.js   (optional)
        LS_CROCO:  'rcCrocoCrawlerSrc',    // croco_crawler.js (optional)
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
        PROJEKT:      'Vodafone Mobile',
        PROJEKT_DATEI: 'sis_vodafone_mobile.xhtml'   // woran man erkennt, dass man dort ist
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
    // Wartet, bis test() etwas liefert (oder Timeout) — dann act()
    function until(test, act, timeoutMs, failMsg) {
        var t0 = Date.now();
        var iv = setInterval(function () {
            if (stop) { clearInterval(iv); return; }
            var r = null;
            try { r = test(); } catch (e) { r = null; }
            if (r) { clearInterval(iv); try { act(r); } catch (e) { banner('Fehler: ' + e.message, '#FF6666'); } }
            else if (Date.now() - t0 > (timeoutMs || 30000)) { clearInterval(iv); if (failMsg) banner(failMsg, '#FF6666'); }
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
    var FILEKEY = { rcDashboardCode: 'dash', rcWcaCrawlerSrc: 'kpi', rcCrocoCrawlerSrc: 'croco', rcGmCrawlerSrc: 'gm' };
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
    //   rcAutoSaveCrawler('croco') -> Croco-Crawler (Auftraege)
    //   rcAutoSaveCrawler('gm')    -> Genesys-Monitor-Crawler (Warteschleife)
    var CRAWLER = {
        kpi:   { key: CFG.LS_KPI,   name: 'KPI-Crawler',            datei: 'kpi_crawler.js',            marke: 'kpi',   laeuft: function () { return !!window.kpiCrawlerInterval; } },
        croco: { key: CFG.LS_CROCO, name: 'Croco-Crawler',          datei: 'croco_crawler.js',          marke: 'croco', laeuft: function () { return !!window.crocoCrawlerInterval; } },
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
        var s = { host: H, pfad: P, dashboardHinterlegt: false, kpiCrawlerHinterlegt: false, crocoCrawlerHinterlegt: false, gmCrawlerHinterlegt: false, mail: getMail() ? 'gesetzt' : 'NICHT gesetzt' };
        try { s.dashboardHinterlegt = !!localStorage.getItem(CFG.LS_DASH); } catch (e) {}
        try { s.kpiCrawlerHinterlegt = !!localStorage.getItem(CFG.LS_KPI); } catch (e) {}
        try { s.crocoCrawlerHinterlegt = !!localStorage.getItem(CFG.LS_CROCO); } catch (e) {}
        try { s.gmCrawlerHinterlegt = !!localStorage.getItem(CFG.LS_GM); } catch (e) {}
        try { console.log('[Autopilot] Status:', JSON.stringify(s, null, 2)); } catch (e) {}
        return s;
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

        // --- 1d) EXPORT-ANSICHT DA? -> DASHBOARD STARTEN ---------------------
        // (zuerst pruefen: wenn schon fertig, nicht erneut durchs Menue laufen)
        //
        // ABER NUR, WENN ES DAS RICHTIGE PROJEKT IST. Alle drei Projektseiten
        // haben ein filterForm. Ohne diese Pruefung bliebe der Autopilot auf der
        // erstbesten Seite stehen — landet man nach dem Login auf "Vodafone
        // Kabel", wuerde die Mobile-Fassung dort weiterarbeiten und stillschweigend
        // die falschen Zahlen ins Dashboard schreiben. Das faellt niemandem auf,
        // weil das Dashboard selbst nicht weiss, welches Projekt es gerade sieht.
        if (id('filterForm') && aufRichtigemProjekt()) {
            pickExportView();
            return;
        }
        if (id('filterForm') && !aufRichtigemProjekt()) {
            banner('Falsches Projekt (' + kurzProjektHier() + ') — wechsle zu "' + CFG.PROJEKT + '" ...', '#FFB84D');
        }

        // --- 1b) MENUE: das eingestellte Projekt waehlen ----------------------
        // Der Menuepunkt heisst genau so, wie er auf dem Schirm steht — deshalb
        // EXAKTER Textvergleich. Ein "enthaelt"-Vergleich waere hier gefaehrlich:
        // "Vodafone UM" steckt als Zeichenfolge in keinem der anderen Namen, aber
        // ein kuenftiges "Vodafone UM Care" wuerde ihn faelschlich treffen.
        var ziel = byText('span.ui-menuitem-text, a.ui-menuitem-link, a', CFG.PROJEKT, true);
        if (ziel && once('menuProjekt')) {
            banner('Menue "' + CFG.PROJEKT + '" ...');
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
            until(function () { return byText('span.ui-menuitem-text, a', CFG.PROJEKT, true); },
                  function (el) { click(el.closest('a') || el); setTimeout(gotoProjektergebnisse, 1500); },
                  8000, '"' + CFG.PROJEKT + '" nicht im Menue gefunden — heisst der Eintrag im Portal genau so?');
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
    function aufRichtigemProjekt() {
        var soll = String(CFG.PROJEKT_DATEI || '').toLowerCase();
        if (!soll) return true;                       // nicht festgelegt -> nicht pruefen
        var ist = projektDateiHier();
        if (!ist || ist.indexOf('sis_') === -1) return true;   // keine Projektseite -> nichts zu pruefen
        return ist === soll;
    }
    // Klarname der Seite, auf der wir gerade sind — nur fuer die Meldung.
    function kurzProjektHier() {
        var d = projektDateiHier();
        if (d.indexOf('_mobile') !== -1) return 'Vodafone Mobile';
        if (d.indexOf('_um') !== -1) return 'Vodafone UM';
        if (d.indexOf('sis_vodafone') !== -1) return 'Vodafone Kabel';
        return d || 'unbekannt';
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
    function pickExportView() {
        if (stop) return;
        var ZIEL = 'export projektergebnisse';

        // Steht sie schon richtig? (PrimeFaces zeigt den Text im .ui-selectonemenu-label)
        var lbls = document.querySelectorAll('.ui-selectonemenu-label');
        for (var i = 0; i < lbls.length; i++) {
            if (norm(lbls[i].textContent).indexOf(ZIEL) !== -1) { startDashboard(); return; }
        }

        // Natives <select> mit passender Option suchen
        var sels = document.querySelectorAll('select'), target = null, val = null;
        for (var s = 0; s < sels.length && !target; s++) {
            for (var o = 0; o < sels[s].options.length; o++) {
                if (norm(sels[s].options[o].textContent).indexOf(ZIEL) !== -1) { target = sels[s]; val = sels[s].options[o].value; break; }
            }
        }
        if (target && once('pickExport')) {
            banner('waehle Ansicht "Export Projektergebnisse" ...');
            target.value = val;
            // PrimeFaces-Label mitziehen, damit die Oberflaeche stimmt
            try {
                var box = target.closest('.ui-selectonemenu');
                var lab = box ? box.querySelector('.ui-selectonemenu-label') : null;
                if (lab) lab.textContent = 'Export Projektergebnisse';
            } catch (e) {}
            target.dispatchEvent(new Event('change', { bubbles: true }));
            setTimeout(startDashboard, 2200);
            return;
        }

        // Kein natives select? Dann PrimeFaces-Dropdown aufklappen und Eintrag klicken.
        var trig = document.querySelector('.ui-selectonemenu-trigger');
        if (trig && once('pfDropdown')) {
            banner('oeffne Ansicht-Auswahl ...');
            click(trig);
            until(function () { return byText('li.ui-selectonemenu-item, li[role=option]', ZIEL); },
                  function (el) { click(el); setTimeout(startDashboard, 2200); },
                  8000, 'Eintrag "Export Projektergebnisse" nicht gefunden.');
            return;
        }
        startDashboard();
    }

    function startDashboard() {
        if (stop) return;
        until(
            function () { return id('filterForm'); },
            function () {
                if (!once('startDash')) return;
                banner('Export-Ansicht bereit — starte Dashboard ...');
                var ok = runStored(CFG.LS_DASH, 'Live-Arena-Dashboard', function () { return !!window.rcLiveInterval; });
                if (!ok) bannerAction('Dashboard ist auf diesem PC noch nicht hinterlegt (einmalig).',
                    'esl_live_arena_v22.js waehlen', window.rcAutoSaveDashboard);
            },
            25000,
            'Export-Ansicht (filterForm) nicht gefunden.'
        );
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
    //  ABLAUF 3 — CCS / Ligaliste / Croco (ccs.vodafone.de)
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
                                : (P.indexOf('crocorep') !== -1 ? 'rcCrocoQuelle' : 'rcKpiQuelle');
                        }
                    } catch (e) {}
                    banner('Keine CCS-Sitzung — melde an und komme zurueck ...');
                    setTimeout(function () { location.href = CFG.CCS_START; }, 700);
                }
                return;
            }
        }

        // CroCo Sales Operation Report offen -> Croco-Crawler starten
        // (eigene Anwendung: /cgi-bin/CROCO_REPORT/crocorep.rb, Tabelle
        //  .croco-result-table, Ok-Button #ok-button)
        if (CFG.CROCO_AN && (P.indexOf('crocorep') !== -1 || document.querySelector('table.croco-result-table'))) {
            banner('CroCo-Report erkannt — starte Croco-Crawler ...');
            until(
                function () { return document.querySelector('table.croco-result-table tr') || (document.readyState === 'complete' ? document.body : null); },
                function () {
                    if (!once('crocoPage')) return;
                    var ok = runStored(CFG.LS_CROCO, 'Croco-Crawler', function () { return !!window.crocoCrawlerInterval; });
                    if (!ok) bannerAction('Croco-Crawler ist auf diesem PC noch nicht hinterlegt (einmalig).',
                        'croco_crawler.js waehlen', function () { window.rcAutoSaveCrawler('croco'); });
                },
                40000,
                'CroCo-Report laedt nicht — bitte einmal "Ok" klicken.'
            );
            return;
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
                    // Croco-Crawler nur starten, wenn eine Auftrags-Tabelle da ist
                    if (CFG.CROCO_AN) setTimeout(maybeCroco, 4000);
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
            if (window.name === 'rcQueueQuelle') { ziel = CFG.GM_URL; was = 'Genesys-Monitor'; }
            else if (window.name === 'rcCrocoQuelle' && CFG.CROCO_AN) { ziel = CFG.CROCO_URL; was = 'CroCo-Report'; }
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

    function maybeCroco() {
        if (stop || !CFG.CROCO_AN) return;
        var hasCroco = false;
        try {
            var sel = document.getElementById('description-settings-list') || document.querySelector('.description-settings-list');
            if (sel) Array.prototype.forEach.call(sel.options, function (o) { if (/croco/i.test(o.textContent || '')) hasCroco = true; });
        } catch (e) {}
        if (!hasCroco) return;
        if (!once('croco')) return;
        var ok = runStored(CFG.LS_CROCO, 'Croco-Crawler', function () { return !!window.crocoCrawlerInterval; });
        if (!ok) bannerAction('Croco-Report erkannt — Croco-Crawler noch nicht hinterlegt (optional, einmalig).',
            'croco_crawler.js waehlen', function () { window.rcAutoSaveCrawler('croco'); }, '#9C9C9C');
    }

    // ========================================================================
    //  WEICHE
    // ========================================================================
    function weiche() {
        try {
            if (H === 'esl.regiocom.net')                     eslFlow();
            else if (H.indexOf('microsoftonline') !== -1 ||
                     H === 'login.live.com')                  msFlow();
            else if (H === 'ccs.vodafone.de')                 ccsFlow();
            // about:blank/data:-Huellen (z.B. der zweite Tab, der laut
            // ESL_Start.ps1 bewusst leer bleibt, bis das Dashboard steht) haben
            // keinen Hostnamen — das ist kein Fehler, sondern der gewollte
            // Wartezustand. Nur bei einem ECHTEN, unbekannten Hostnamen warnen.
            else if (H) banner('keine bekannte Portal-Seite (' + H + ').', '#9C9C9C');
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
        console.log('%c[Autopilot v2] aktiv auf ' + H + '  —  rcAutoStatus() · rcAutoReset() · rcAutoMail("...") · rcAutoOff()',
            'color:#E60000;font-weight:bold');
    } catch (e) {}
})();
