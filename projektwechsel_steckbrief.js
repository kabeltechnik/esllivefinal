/* ===========================================================================
   Projektwechsel-Steckbrief - F12-Skript fuer das ESL-Portal (KEIN Node-Werkzeug)
   ---------------------------------------------------------------------------
   Frage: Kann EIN Login alle drei Projekte (Kabel/Mobile/UM) fuer EIN
   Dashboard liefern? Entscheidend: liefert eine schon offene Kabel-Seite nach
   dem Wechsel auf Mobile weiter KABEL-Daten (seitengebunden) oder die Daten
   des zuletzt gewaehlten Projekts (sitzungsgebunden)?
   Ablauf: zwei unsichtbare Rahmen (iframes) im selben Login. A waehlt Kabel,
   B waehlt Mobile, danach UM. Nach jedem Wechsel in B exportiert A erneut.
   Die Spalten des Exports verraten das Projekt (Kabel "produktgrupe",
   Mobile "produktgruppe"/"osf_id", UM "Winback"/"Postleitzahl").
   Klickwege wie im Autopiloten (Menue-Eintrag, Reiter "Projektergebnisse",
   Ansicht "Export Projektergebnisse"), Export wie holeExcelVomServer.
   Benutzung: ESL_Start.cmd NICHT laufen lassen (der Autopilot liefe in den
   Rahmen mit), Edge normal oeffnen, im ESL anmelden, keine weiteren
   ESL-Tabs. F12 -> Konsole -> Skript einfuegen -> Enter. Dauer 1-2 Min.
   Der Bericht landet in der Zwischenablage (sonst: copy(__rcProjektwechsel)).
   Liest nur: Projektwahl + je ein Excel-Export, wie das Dashboard es tut.
   Keine Namen, keine Tokens im Bericht. Danach die Seite mit F5 neu laden.
   =========================================================================== */
(async function () {
    'use strict';
    if (window.__rcPwLaeuft) { console.log('[Projektwechsel] laeuft schon.'); return; }
    window.__rcPwLaeuft = true;
    var T0 = performance.now(), ZEILEN = [], erg = {}, beendet = false;
    var ZIEL = 'export projektergebnisse';

    function log(s) {
        ZEILEN.push(((performance.now() - T0) / 1000).toFixed(1) + 's  ' + s);
        console.log('[Projektwechsel] ' + s);
    }
    function sek(t) { return ((performance.now() - t) / 1000).toFixed(1) + ' s'; }
    function schlaf(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function norm(s) { return (s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
    function pfad(u) { try { return decodeURIComponent(new URL(u, location.href).pathname); } catch (e) { return String(u); } }
    function vis(el) { try { return !!(el && (el.offsetParent || el.offsetWidth || el.offsetHeight)); } catch (e) { return false; } }
    function byText(d, sel, txt) {
        var t = norm(txt), l = d.querySelectorAll(sel);
        for (var i = 0; i < l.length; i++) {
            var et = norm(l[i].innerText || l[i].textContent || l[i].value || '');
            if (et && vis(l[i]) && et.indexOf(t) !== -1) return l[i];
        }
        return null;
    }
    async function warteAuf(fn, ms) {
        var ende = Date.now() + ms;
        while (Date.now() < ende) {
            var v = null;
            try { v = fn(); } catch (e) {}
            if (v) return v;
            await schlaf(300);
        }
        return null;
    }
    function doc(f) { try { return f.contentDocument; } catch (e) { return null; } }

    function fertig() {
        if (beendet) return;
        beendet = true;
        window.__rcPwLaeuft = false;
        if (erg.kabel1) {
            var K = erg.kabel1.ids, M = erg.mobile && erg.mobile.ids, U = erg.um && erg.um.ids,
                K2 = erg.kabel2 && erg.kabel2.ids, K3 = erg.kabel3 && erg.kabel3.ids, s;
            log('Datensaetze: Kabel in Mobile ' + pz(anteil(K, M)) + ', UM in Kabel ' + pz(anteil(U, K)) +
                ' | Kabel-Seite A nach Mobile-Wechsel: alte Kabel ' + pz(anteil(K, K2)) + ', Mobile ' + pz(anteil(M, K2)) +
                ' | nach UM-Wechsel: alte Kabel ' + pz(anteil(K, K3)) + ', UM ' + pz(anteil(U, K3)));
            if (!K || !K.size || !M || !M.size)
                s = 'ZU WENIG DATEN (Kabel ' + (K ? K.size : 0) + ', Mobile ' + (M ? M.size : 0) + ' Datensaetze) - an einem Arbeitstag im laufenden Betrieb wiederholen.';
            else if (anteil(K, M) > 0.1)
                s = 'UNKLAR - Kabel und Mobile teilen Datensaetze (' + pz(anteil(K, M)) + ').';
            else if (!K2)
                s = 'ALTE SEITE LIEFERT NACH DEM WECHSEL NICHTS (' + (erg.kabel2 ? erg.kabel2.art : '-') + ') - vor jedem Abruf Projekt neu waehlen.';
            else if (anteil(K, K2) >= 0.9 && anteil(M, K2) <= 0.1)
                s = 'SEITENGEBUNDEN - die offene Kabel-Seite liefert nach dem Wechsel weiter Kabel-Daten. Alle drei Projekte koennen parallel offen bleiben.';
            else if (anteil(M, K2) >= 0.9)
                s = 'SITZUNGSGEBUNDEN - die Kabel-Seite liefert nach dem Wechsel MOBILE-Daten (in Kabel-Spalten). Vor jedem Abruf muss umgeschaltet werden.';
            else
                s = 'UNKLAR - Mischbild.';
            log('SCHLUSS: ' + s);
            if (U && U.size && K && K.size)
                log('UM: ' + (anteil(U, K) >= 0.9 ? 'dieselben Datensaetze wie Kabel (' + pz(anteil(U, K)) + '), nur andere Spalten - wie am 09.08.'
                    : 'eigene Datensaetze (' + pz(anteil(U, K)) + ' Ueberschneidung mit Kabel).'));
        }
        var bericht = 'PROJEKTWECHSEL-STECKBRIEF ' + new Date().toLocaleString('de-DE') + '\n' + ZEILEN.join('\n');
        window.__rcProjektwechsel = bericht;
        var kopiert = false;
        try { copy(bericht); kopiert = true; } catch (e) {}
        console.log('\n' + bericht + '\n\n' + (kopiert ? 'FERTIG - Bericht ist in der Zwischenablage.'
            : 'FERTIG - Bericht kopieren mit: copy(__rcProjektwechsel)'));
    }

    // ---- Rahmen ----
    function rahmen(name) {
        var f = document.createElement('iframe');
        f.name = name;
        // ohne allow-top-navigation/allow-popups/allow-modals: keine Fremdnavigation, keine blockierenden Dialoge
        f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
        // gelayoutet (sonst findet die Sichtbarkeitspruefung nichts), aber unsichtbar
        f.style.cssText = 'position:fixed;right:0;bottom:0;width:1400px;height:900px;opacity:0;pointer-events:none;z-index:-1;border:0';
        f.src = '/Agents/secure/main.xhtml';
        document.body.appendChild(f);
        return f;
    }
    async function bereit(f, wer) {
        var t = performance.now();
        var d = await warteAuf(function () {
            var x = doc(f);
            return x && x.readyState === 'complete' && x.getElementById('frmMainMenu') ? x : null;
        }, 40000);
        if (!d) { log(wer + ': Rahmen laedt nicht (' + sek(t) + ')'); return false; }
        if (f.contentWindow.__rcAutoPilotV2) { log('ABBRUCH: Autopilot laeuft im Rahmen mit. Edge ohne ESL_Start.cmd oeffnen.'); return false; }
        log(wer + ': Rahmen bereit auf ' + pfad(d.location.href) + ' (' + sek(t) + ')');
        return true;
    }

    // ---- Projekt ueber den Menue-Eintrag waehlen (Text exakt, wie Autopilot) ----
    async function projekt(f, name, wer) {
        var t = performance.now(), alt = doc(f);
        var links = alt ? Array.prototype.slice.call(alt.querySelectorAll('a.ui-menuitem-link')) : [];
        var a = null;
        for (var i = 0; i < links.length; i++) if (norm(links[i].textContent) === norm(name)) { a = links[i]; break; }
        if (!a) {
            log(wer + ': Menueeintrag "' + name + '" fehlt. Da: ' +
                links.map(function (x) { return x.textContent.trim(); }).filter(Boolean).join(' | '));
            return false;
        }
        a.click();
        var neu = await warteAuf(function () {
            var d = doc(f);
            return d && d !== alt && d.readyState === 'complete' && /\/Agents\//.test(d.location.pathname) ? d : null;
        }, 25000);
        var d2 = doc(f);
        log(wer + ': "' + name + '" gewaehlt -> ' + (neu ? 'neue Seite ' : 'KEIN Seitenwechsel, steht auf ') +
            (d2 ? pfad(d2.location.href) : '?') + ' (' + sek(t) + ')');
        await schlaf(1000);
        return true;
    }

    // ---- Reiter "Projektergebnisse" + Ansicht "Export Projektergebnisse" ----
    function statistik(d) {
        var s = d ? d.querySelectorAll('select') : [];
        for (var i = 0; i < s.length; i++)
            for (var o = 0; o < s[i].options.length; o++)
                if (norm(s[i].options[o].textContent).indexOf(ZIEL) !== -1) return s[i];
        return null;
    }
    function listen(d) {
        var s = d ? d.querySelectorAll('select') : [], out = [];
        for (var i = 0; i < s.length && out.length < 4; i++) {
            var t = Array.prototype.map.call(s[i].options, function (o) { return o.textContent.trim(); }).filter(Boolean);
            if (t.length > 1) out.push('[' + t.slice(0, 10).join(' | ') + ']');
        }
        return out.join(' ') || 'keine';
    }
    function ansichtSteht(d) {
        var l = d ? d.querySelectorAll('.ui-selectonemenu-label') : [];
        for (var i = 0; i < l.length; i++) if (norm(l[i].textContent).indexOf(ZIEL) !== -1) return true;
        var s = statistik(d);
        return !l.length && !!s && s.selectedIndex >= 0 && norm(s.options[s.selectedIndex].textContent).indexOf(ZIEL) !== -1;
    }
    async function ergebnisse(f, wer) {
        var t = performance.now();
        if (!statistik(doc(f))) {
            var tab = await warteAuf(function () {
                var d = doc(f);
                return d && (d.getElementById('sis_form_01:CTS_tabProjektQueries') ||
                    byText(d, 'span.ui-menuitem-text, a.ui-tabs-anchor, a, .ui-tabs-anchor', 'projektergebnisse'));
            }, 20000);
            if (!tab) { log(wer + ': Reiter "Projektergebnisse" nicht gefunden'); return false; }
            (tab.closest('a') || tab).click();
            if (!(await warteAuf(function () { return statistik(doc(f)); }, 25000))) {
                log(wer + ': Statistik-Auswahl fehlt. Auswahllisten: ' + listen(doc(f)));
                return false;
            }
            log(wer + ': Projektergebnisse offen (' + sek(t) + ')');
        } else {
            log(wer + ': Projektergebnisse stand schon offen');
        }
        var t2 = performance.now();
        if (ansichtSteht(doc(f))) {
            log(wer + ': Ansicht "Export Projektergebnisse" stand schon (Server merkt sie sich)');
        } else {
            var s = statistik(doc(f));
            if (!s) { log(wer + ': Statistik-Auswahl verschwunden'); return false; }
            var box = s.closest('.ui-selectonemenu'), trig = box && box.querySelector('.ui-selectonemenu-trigger');
            if (trig) {
                trig.click();
                var li = await warteAuf(function () { return byText(doc(f), 'li.ui-selectonemenu-item, li[role=option]', ZIEL); }, 8000);
                if (li) li.click();
            } else {
                for (var o = 0; o < s.options.length; o++) if (norm(s.options[o].textContent).indexOf(ZIEL) !== -1) s.value = s.options[o].value;
                s.dispatchEvent(new f.contentWindow.Event('change', { bubbles: true }));
            }
            var ok = await warteAuf(function () { return ansichtSteht(doc(f)); }, 10000);
            log(wer + ': Ansicht "Export Projektergebnisse" gewaehlt: ' + (ok ? 'ja' : 'NEIN') + ' (' + sek(t2) + ')');
        }
        if (!(await warteAuf(function () { var d = doc(f); return d && d.getElementById('filterForm'); }, 15000))) {
            log(wer + ': filterForm fehlt');
            return false;
        }
        await schlaf(1500);
        return true;
    }

    // ---- xlsx ohne Bibliothek lesen: Kopfzeile, Zeilen, Tage ----
    async function zipTexte(buf) {
        var dv = new DataView(buf), dec = new TextDecoder(), e = buf.byteLength - 22, out = {};
        while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
        if (e < 0) throw new Error('kein ZIP-Verzeichnis');
        var n = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true);
        for (var i = 0; i < n; i++) {
            if (dv.getUint32(p, true) !== 0x02014b50) break;
            var meth = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true),
                el = dv.getUint16(p + 30, true), kl = dv.getUint16(p + 32, true), lh = dv.getUint32(p + 42, true);
            var name = dec.decode(new Uint8Array(buf, p + 46, nl));
            if (/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(name)) {
                var st = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true), roh = new Uint8Array(buf, st, cs);
                out[name] = meth === 0 ? dec.decode(roh)
                    : dec.decode(await new Response(new Blob([roh]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
            }
            p += 46 + nl + el + kl;
        }
        return out;
    }
    function tabelle(texte) {
        var namen = Object.keys(texte).filter(function (n) { return n.indexOf('worksheets/') !== -1; }).sort();
        var sx = namen.length ? texte[namen[0]] : '', strs = [], T = [];
        (texte['xl/sharedStrings.xml'] || '').replace(/<si>([\s\S]*?)<\/si>/g, function (_, x) { strs.push(x.replace(/<[^>]+>/g, '')); return ''; });
        function spaltenNr(ref) { var s = ref.replace(/\d+/g, ''), n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64; return n - 1; }
        (sx.match(/<row[\s>][\s\S]*?<\/row>/g) || []).forEach(function (row) {
            var z = [];
            row.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, function (_, a, inner) {
                inner = inner || '';
                var ref = (/r="([A-Z]+\d+)"/.exec(a) || [])[1], v = (/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1],
                    it = (/<t[^>]*>([\s\S]*?)<\/t>/.exec(inner) || [])[1];
                z[ref ? spaltenNr(ref) : z.length] = /t="s"/.test(a) ? (strs[+v] || '') : (it != null ? it : (v != null ? v : ''));
                return '';
            });
            T.push(z);
        });
        return T;
    }
    // Spalten sagen nur, WELCHE SEITE exportiert hat. WESSEN Daten drinstecken,
    // sagen erst die Datensatz-IDs: am 09.08. trugen UM.xlsx und Kabel.xlsx
    // dieselben 3596 IDs in verschiedenen Spalten, Mobile teilte keine einzige.
    function auswerten(texte) {
        var T = tabelle(texte), kz = (T[0] || []).map(function (x) { return x == null ? '' : String(x); });
        var h = kz.map(norm), iId = h.indexOf('id'), iDat = h.indexOf('datum'), ids = new Set(), tage = {};
        for (var r = 1; r < T.length; r++) {
            if (iId >= 0 && T[r][iId] != null && T[r][iId] !== '') ids.add(String(T[r][iId]));
            if (iDat >= 0 && T[r][iDat]) tage[String(T[r][iDat]).slice(0, 10)] = 1;
        }
        var tl = Object.keys(tage).sort();
        return {
            kopf: kz, ids: ids,
            zeilen: Math.max(0, T.length - 1),
            tage: tl.length ? tl[0] + (tl.length > 1 ? ' bis ' + tl[tl.length - 1] + ' (' + tl.length + ' verschiedene)' : '') : 'keine'
        };
    }
    // Anteil der Datensaetze aus `alt`, die in `neu` wieder auftauchen (Datensaetze
    // verschwinden nicht, neue kommen im Tagesverlauf hinzu -> alt gegen neu messen).
    function anteil(alt, neu) {
        if (!alt || !neu || !alt.size) return null;
        var n = 0;
        alt.forEach(function (x) { if (neu.has(x)) n++; });
        return n / alt.size;
    }
    function pz(x) { return x == null ? 'n/a' : Math.round(x * 100) + ' %'; }
    function projektAusKopf(kz) {
        var h = kz.map(norm);
        if (h.indexOf('produktgrupe') !== -1) return 'Kabel';
        if (h.indexOf('produktgruppe') !== -1 || h.indexOf('osf_id') !== -1) return 'Mobile';
        if (h.indexOf('winback') !== -1 || h.indexOf('postleitzahl') !== -1) return 'UM';
        return 'unbekannt';
    }

    // ---- Export wie holeExcelVomServer, aber aus dem Rahmen ----
    async function exportiere(f, wer) {
        var t = performance.now(), W = f.contentWindow, d = doc(f), form = d && d.getElementById('filterForm');
        if (!form) { log(wer + ': kein filterForm'); return { art: 'fehlt' }; }
        try {
            var knoepfe = Array.prototype.slice.call(form.querySelectorAll('button[type="submit"], input[type="submit"]'));
            var such = knoepfe.filter(function (b) { return /suchen|aktualisieren|filtern|anzeigen/.test(norm(b.innerText || b.value)); })[0];
            var suche = 'Suchknopf nicht gefunden (wie im Dashboard)';
            if (such && (such.id || such.name)) {
                var sid = such.id || such.name, sd = new W.FormData(form);
                sd.append(sid, sid);
                sd.append('javax.faces.partial.ajax', 'true');
                sd.append('javax.faces.source', sid);
                sd.append('javax.faces.partial.execute', 'filterForm data');
                sd.append('javax.faces.partial.render', 'filterForm data');
                var rs = await W.fetch(form.action || d.location.href, { method: 'POST', body: sd,
                    headers: { 'Faces-Request': 'partial/ajax', 'X-Requested-With': 'XMLHttpRequest' } });
                var txt = await rs.text();
                if (/ViewExpiredException|viewExpiredDialog/.test(txt)) { log(wer + ': Suche -> ViewExpired (' + sek(t) + ')'); return { art: 'kein Excel' }; }
                var vs = txt.match(/<update id="[^"]*javax\.faces\.ViewState[^"]*"><!\[CDATA\[(.*?)\]\]><\/update>/) ||
                         txt.match(/name="javax\.faces\.ViewState".*?value="([^"]+)"/);
                if (vs && vs[1]) Array.prototype.forEach.call(d.querySelectorAll('input[name="javax.faces.ViewState"]'), function (i) { i.value = vs[1]; });
                suche = 'Suche HTTP ' + rs.status;
            }
            var fd = new W.FormData(form);
            var exp = knoepfe.filter(function (b) {
                var x = norm(b.innerText || b.value);
                return x.indexOf('excel') !== -1 || x.indexOf('export') !== -1 || (b.innerHTML || '').toLowerCase().indexOf('excel') !== -1;
            })[0];
            var bid = exp ? (exp.id || exp.name) : 'filterForm:j_idt517';
            if (bid) fd.append(bid, bid);
            var r = await W.fetch(form.action || d.location.href, { method: 'POST', body: fd });
            var buf = await r.arrayBuffer(), ct = (r.headers.get('content-type') || '').toLowerCase();
            var b0 = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
            var basis = wer + ': ' + suche + ', Exportknopf ' + (exp ? 'gefunden' : 'NICHT gefunden (Rueckfall-ID)') + ' -> ';
            if (!(b0[0] === 0x50 && b0[1] === 0x4b)) {
                var h = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(buf.byteLength, 30000)));
                var grund = (/type="password"/i.test(h) && !/frmMainMenu/.test(h)) ? 'Anmeldemaske'
                    : /ViewExpiredException/.test(h) ? 'ViewExpired'
                    : 'HTML-Seite "' + ((/<title>([^<]*)/i.exec(h) || [])[1] || '').trim() + '"';
                log(basis + 'KEIN Excel: HTTP ' + r.status + ', ' + (ct || 'ohne Typ') + ', ' + buf.byteLength + ' Byte, ' + grund + ' (' + sek(t) + ')');
                return { art: 'kein Excel' };
            }
            var k;
            try { k = auswerten(await zipTexte(buf)); }
            catch (e) { log(basis + 'Excel ' + Math.round(buf.byteLength / 1024) + ' KB, nicht entpackbar: ' + e.message); return { art: 'Excel?' }; }
            var art = projektAusKopf(k.kopf);
            log(basis + 'Excel ' + Math.round(buf.byteLength / 1024) + ' KB, ' + k.kopf.length + ' Spalten (Seite: ' + art + '), ' +
                k.zeilen + ' Zeilen, ' + k.ids.size + ' Datensatz-IDs, Tage ' + k.tage + ' (' + sek(t) + ')');
            if (art === 'unbekannt') log('   Spalten: ' + k.kopf.join(' | '));
            return { art: art, ids: k.ids };
        } catch (e) {
            log(wer + ': Fehler ' + (e && e.message));
            return { art: 'Fehler' };
        }
    }

    // ---- Ablauf ----
    log('Start auf ' + pfad(location.href) + ', ' + ((/Edg\/[\d.]+/.exec(navigator.userAgent) || ['Browser ?'])[0]));
    if (window.rcLiveInterval) { log('ABBRUCH: in diesem Tab laeuft das Dashboard. Ohne Dashboard/Starter testen.'); return fertig(); }
    if (window.__rcAutoPilotV2) { log('ABBRUCH: Autopilot aktiv. Edge ohne ESL_Start.cmd oeffnen und von Hand anmelden.'); return fertig(); }
    var r0, h0 = '';
    try {
        r0 = await fetch('/Agents/secure/main.xhtml', { credentials: 'same-origin', cache: 'no-store' });
        h0 = await r0.text();
    } catch (e) { log('ABBRUCH: Startseite nicht abrufbar (' + e.message + ')'); return fertig(); }
    var xfo = r0.headers.get('x-frame-options') || 'keiner';
    var fa = (/frame-ancestors[^;]*/i.exec(r0.headers.get('content-security-policy') || '') || ['keiner'])[0];
    log('Startseite HTTP ' + r0.status + ' ' + pfad(r0.url) + ', X-Frame-Options: ' + xfo + ', CSP: ' + fa);
    if (!/frmMainMenu/.test(h0)) { log('ABBRUCH: kein Projekt-Menue in der Antwort - nicht angemeldet?'); return fertig(); }
    if (/deny/i.test(xfo) || /'none'/.test(fa)) { log('ERGEBNIS: Portal verbietet Rahmen - dieser Weg geht nicht.'); return fertig(); }

    var A = rahmen('rcPwA'), B = null;
    try {
        if (!(await bereit(A, 'Rahmen A'))) return fertig();
        if (!(await projekt(A, 'Vodafone Kabel', 'A')) || !(await ergebnisse(A, 'A Kabel'))) return fertig();
        erg.kabel1 = await exportiere(A, 'Export A (Kabel)');
        B = rahmen('rcPwB');
        if (!(await bereit(B, 'Rahmen B'))) return fertig();
        if (!(await projekt(B, 'Vodafone Mobile', 'B')) || !(await ergebnisse(B, 'B Mobile'))) return fertig();
        erg.mobile = await exportiere(B, 'Export B (Mobile)');
        erg.kabel2 = await exportiere(A, 'Export A erneut, B steht auf Mobile');
        if ((await projekt(B, 'Vodafone UM', 'B')) && (await ergebnisse(B, 'B UM'))) {
            erg.um = await exportiere(B, 'Export B (UM)');
            erg.kabel3 = await exportiere(A, 'Export A erneut, B steht auf UM');
        }
    } catch (e) {
        log('FEHLER: ' + (e && e.message));
    } finally {
        try { A.remove(); } catch (e) {}
        try { if (B) B.remove(); } catch (e) {}
    }
    fertig();
})();
