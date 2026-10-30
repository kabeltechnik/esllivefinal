'use strict';
// Schein-ESL fuer den Browser-Test des Alle-Projekte-Betriebs (28.09.).
// KEIN Pruefwerkzeug (heisst bewusst nicht *_pruefen.js, der Sammel-Einzeiler
// zieht es nicht mit). Start: .claude/launch.json -> "esl-schein" (Port 8413), dann:
//   http://127.0.0.1:8413/Agents/secure/sis_vodafone.xhtml?fertig=1&dashboard=1
// Nachgebaut ist das am Portal GEMESSENE Verhalten (Flugschreiber 27./28.09. +
// DevTools-Mitschnitte der drei Projektseiten vom 28.09.):
//  - EINE Anmeldung, EIN aktuelles Projekt: das zuletzt im Menue gewaehlte.
//  - main.xhtml leitet auf die Seite des Projekts der ANMELDUNG um.
//  - Menue = Ajax (frmMainMenu:j_idt40). Anderes Projekt -> <redirect>; DASSELBE
//    Projekt -> Ajax ok, KEINE Umleitung (daran hing der Rahmen 25 s je Versuch).
//  - Nach einer Umleitung fehlt das filterForm; Reiter "Projektergebnisse", dann
//    Statistik waehlen. Kommt die Seite ueber main.xhtml mit gewaehlter Statistik,
//    bleibt im Rahmen das Label leer (&nbsp;, "Statistik (LEER)") — die Option ist
//    serverseitig markiert.
//  - Ohne Datensaetze ("Statistik liefert kein Ergebnis") rendert das Formular
//    KEINEN Export-Knopf. Ein Export mit fremder Knopf-Id liefert die ganze Seite.
//  - JEDE Seite traegt versteckt den viewExpiredDialog und ein Passwortfeld.
//  - Die Liste einer Seite wird mit dem Projekt der ANMELDUNG neu gebaut beim
//    Tabellen-Filter (folgt auf den echten Klick) und beim Auto-Refresh; der
//    Such-Postback allein uebernimmt nur die Daten.
// Daten: die Referenzexporte vom 09.08. sind vertauscht (am Mapping gemessen):
// "Mobile.xlsx" traegt Kabel-Agenten, "UM.xlsx" UM-Agenten. Mobile entsteht aus
// den Kabel-Zeilen mit MF_*-Agenten aus dem Mapping. Heute + gestern.
// Steuerung (JSON): /esl/steuer?aktion=zustand · aktion=sitzung&p=um ·
// aktion=autorefresh · aktion=leer&p=kabel&an=1|0 (keine Datensaetze heute) ·
// aktion=ablauf (alle Ansichten abgelaufen)
// Erweiterung 27.10. (Datendienst-Messungen), alles AUS, solange nichts davon gesetzt ist:
//  - Umgebungsvariable TAGE (Vorgabe 1): Daten fuer heute und TAGE Vortage; ab dem
//    zweiten Vortag nur die ersten 80 Zeilen je Projekt (haelt die Mappen klein).
//  - GET /Agents/login_esl.xhtml: Anmeldeformular (loginform:user/pw/btnLogin/msgs).
//    Die Felder sind leer; das Seitenskript fuellt sie erst beim ersten pointerdown mit
//    event.isTrusted (bildet die Autofill-Freigabe von Edge nach). POST mit beiden
//    Werten -> angemeldet, 302 auf main.xhtml.
//  - Steuerung: aktion=abmelden (alle /Agents/secure/* -> 302 Anmeldung) ·
//    aktion=ohneautofill&an=1|0 (Felder bleiben leer) · aktion=gestern&an=1|0
//    (EINMAL-Schalter: nur die naechste neu angelegte Seite steht auf gestern, danach
//    wieder heute — eine frische Seite steht im echten ESL immer auf heute).
//    aktion=zustand liefert zusaetzlich angemeldet und anmeldungen (= abgeschickte
//    Anmeldungen, ob gelungen oder nicht).
const http = require('http'), fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const XLSX = require(path.join(DIR, 'node_modules', 'xlsx'));
const PORT = +process.env.PORT || 8413;
const TAGE = Math.max(1, Math.floor(+process.env.TAGE) || 1);

const p2 = n => String(n).padStart(2, '0');
const isoTag = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const HEUTE = isoTag(new Date()), GESTERN = isoTag(new Date(Date.now() - 86400000));
const deZuIso = s => { const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(s || '').trim()); return m ? m[3] + '-' + p2(m[2]) + '-' + p2(m[1]) : HEUTE; };
const isoZuDe = s => s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4);
const norm = s => String(s == null ? '' : s).toLowerCase().trim();

const blatt = (datei, name) => { const wb = XLSX.readFile(path.join(DIR, datei)); return XLSX.utils.sheet_to_json(wb.Sheets[name || wb.SheetNames[0]], { header: 1, defval: '' }); };
const K = blatt('Excels vergleich/Kabel.xlsx'), M = blatt('Excels vergleich/Mobile.xlsx'), U = blatt('Excels vergleich/UM.xlsx');
const KOPF = { kabel: K[0], mobile: M[0], um: U[0] };
const alsObj = rows => rows.slice(1).filter(r => r && r.some(x => x !== '')).map(r => { const o = {}; rows[0].forEach((h, i) => { o[norm(h)] = r[i]; }); return o; });

const MA = blatt('Mitarbeiter_IDS_Final_komplett.xlsx', 'Daten');
const MH = MA[0].map(norm), iC = MH.indexOf('ccs_user'), iT = MH.indexOf('team'), iSt = MH.indexOf('stack');
const stackVon = {};
MA.slice(1).forEach(r => { const t = String(r[iT] || '').trim(); if (t && r[iSt]) stackVon[t] = String(r[iSt]).trim(); });
const MF = MA.slice(1).filter(r => /^MF/i.test(String(r[iSt] || '')) && /^MF/i.test(stackVon[String(r[iT] || '').trim()] || ''))
    .map(r => String(r[iC] || '').trim()).filter(Boolean);

const kab = alsObj(M), umd = alsObj(U);
const mob = kab.map((o, i) => Object.assign({}, o, { vo_nummer: MF[i % MF.length], id: 'M' + o.id }));
const datiere = (recs, tag, vor) => recs.map((o, i) => Object.assign({}, o, { datum: tag + ' ' + p2(7 + i % 10) + ':' + p2(i % 60) + ':00', id: vor + o.id }));
const DATEN = {};
// Vortag 1 wie bisher (Praefix 'G'); ab dem zweiten Vortag gekappt, Ids bleiben eindeutig.
const vortag = n => isoTag(new Date(Date.now() - n * 86400000));
[['kabel', kab], ['mobile', mob], ['um', umd]].forEach(([k, r]) => {
    DATEN[k] = datiere(r, HEUTE, '');
    for (let n = 1; n <= TAGE; n++) DATEN[k] = DATEN[k].concat(datiere(n >= 2 ? r.slice(0, 80) : r, vortag(n), n === 1 ? 'G' : 'G' + n + '-'));
});

const SEITEN = { kabel: '/Agents/secure/sis_vodafone.xhtml', mobile: '/Agents/secure/sis_vodafone_mobile.xhtml', um: '/Agents/secure%20/sis_vodafone_um.xhtml' };
const NAME = { kabel: 'Vodafone Kabel', mobile: 'Vodafone Mobile', um: 'Vodafone UM' };
// Feld-Kennungen wie am Portal gemessen (28.09.): Kabel und Mobile/UM haben
// verschiedene JSF-Laufnummern — ein hart verdrahteter Knopf faellt damit auf.
const IDS = { kabel:  { stat: 'j_idt634', von: 'j_idt637', bis: 'j_idt638', such: 'j_idt639', exp: 'j_idt640', leer: 'j_idt641', wert: '36' },
              mobile: { stat: 'j_idt495', von: 'j_idt498', bis: 'j_idt499', such: 'j_idt500', exp: 'j_idt501', leer: 'j_idt502', wert: '63' },
              um:     { stat: 'j_idt495', von: 'j_idt498', bis: 'j_idt499', such: 'j_idt500', exp: 'j_idt501', leer: 'j_idt502', wert: '64' } };
const seiteVonPfad = p => Object.keys(SEITEN).find(k => decodeURIComponent(SEITEN[k]) === decodeURIComponent(p)) || null;

// tab: Reiter + Statistik sind in der Sitzung fuer dieses Projekt schon gewaehlt.
const Z = { sitzung: 'kabel', views: {}, n: 0, log: [], leer: { kabel: false, mobile: false, um: false }, tab: { kabel: true, mobile: false, um: false },
    angemeldet: true, anmeldungen: 0, ohneautofill: false, gestern: false };
const log = (was, info) => { Z.log.push(Object.assign({ t: new Date().toTimeString().slice(0, 8), was }, info)); if (Z.log.length > 400) Z.log.shift(); };
function neueSicht(seite) {
    const id = 'V' + (++Z.n), tag = Z.gestern ? GESTERN : HEUTE;
    Z.gestern = false;   // Einmal-Schalter: nur diese eine Seite steht auf gestern
    Z.views[id] = { seite, liste: Z.sitzung, von: tag, bis: tag, tab: Z.tab[seite], stat: Z.tab[seite], ab: false };
    log('seite', { vs: id, seite, liste: Z.sitzung, stat: Z.tab[seite] });
    return id;
}
const zeilen = v => Z.leer[v.liste] && v.von <= HEUTE && v.bis >= HEUTE && v.von === v.bis ? [] :
    DATEN[v.liste].filter(o => { const t = String(o.datum).slice(0, 10); return t >= v.von && t <= v.bis && !(Z.leer[v.liste] && t === HEUTE); });

function exportXlsx(v) {
    const kopf = KOPF[v.seite], rows = [kopf];
    zeilen(v).forEach(o => rows.push(kopf.map(h => { const k = norm(h); return k in o ? o[k] : k === 'produktgrupe' ? (o.produktgruppe || '') : k === 'produktgruppe' ? (o.produktgrupe || '') : ''; })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'dataTable');
    return { buf: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), zeilen: rows.length - 1 };
}
function felder(req, body) {
    const ct = req.headers['content-type'] || '', f = {};
    const b = /boundary=(.+)$/.exec(ct);
    if (b) body.toString('utf8').split('--' + b[1]).forEach(teil => {
        const n = /name="([^"]*)"/.exec(teil), i = teil.indexOf('\r\n\r\n');
        if (n && i !== -1) f[n[1]] = teil.slice(i + 4).replace(/\r\n$/, '');
    });
    else new URLSearchParams(body.toString('utf8')).forEach((w, k) => { f[k] = w; });
    return f;
}

// ---- Seitenbausteine (Aufbau wie die echten PrimeFaces-Seiten) ----
// Das Label schickt der Server immer leer (&nbsp;, so steht es in der echten
// Teil-Antwort); gefuellt wird es vom Seitenskript — im Rahmen blieb es leer.
function statistikHtml(v) {
    const I = IDS[v.seite];
    return '<div id="filterForm:' + I.stat + '" class="ui-selectonemenu"><div class="ui-helper-hidden-accessible"><select id="filterForm:' + I.stat + '_input" name="filterForm:' + I.stat + '_input">' +
        '<option value="' + I.wert + '"' + (v.stat ? ' selected="selected"' : '') + '>Export Projektergebnisse</option><option value="67">Mitarbeiterleistung Intraday</option><option value="" disabled="disabled"></option></select></div>' +
        '<label id="filterForm:' + I.stat + '_label" class="ui-selectonemenu-label">&nbsp;</label>' +
        '<div class="ui-selectonemenu-trigger">v</div></div>' +
        '<ul id="statPanel" style="display:none"><li class="ui-selectonemenu-item">Export Projektergebnisse</li><li class="ui-selectonemenu-item">Mitarbeiterleistung Intraday</li></ul>';
}
function formHtml(vs, v) {
    const pfad = SEITEN[v.seite], n = v.stat ? zeilen(v).length : 0, I = IDS[v.seite];
    return '<form id="filterForm" name="filterForm" method="post" action="' + pfad + '" class="poll-update"><input type="hidden" name="filterForm" value="filterForm">' +
        statistikHtml(v) +
        '<input class="hasDatepicker" name="filterForm:' + I.von + '_input" value="' + isoZuDe(v.von) + '"> <input class="hasDatepicker" name="filterForm:' + I.bis + '_input" value="' + isoZuDe(v.bis) + '">' +
        '<button id="filterForm:' + I.such + '" name="filterForm:' + I.such + '" type="submit" title="Liste aktualisieren" class="ui-button-icon-only"><span class="ui-icon fa fa-refresh"></span><span class="ui-button-text">Liste aktualisieren</span></button>' +
        (n ? '<button id="filterForm:' + I.exp + '" name="filterForm:' + I.exp + '" type="submit" title="Liste exportieren" class="ui-button-icon-only"><span class="ui-icon fa fa-file-excel-o"></span><span class="ui-button-text">Liste exportieren</span></button>'
           : '<label id="filterForm:' + I.leer + '"></label>') +
        '<input type="hidden" name="javax.faces.ViewState" value="' + vs + '"></form>';
}
function dataHtml(vs, v) {
    const n = v.stat ? zeilen(v).length : 0;
    return '<form id="data" name="data" method="post" class="poll-update"><div id="data:j_idt656" class="ui-messages">' +
        (v.stat && !n ? '<div class="ui-messages-warn"><span class="ui-messages-warn-summary">Statistik liefert kein Ergebnis.</span></div>' : '') + '</div>' +
        (n ? '<div id="data:dataTable"><span class="ui-paginator-current">Ergebnisse [1 - 15] von ' + n + '</span></div>' : '') +
        '<input type="hidden" name="javax.faces.ViewState" value="' + vs + '"></form>';
}
const bereichHtml = (vs, v) => '<div id="bereich">' + (v.tab ? formHtml(vs, v) + dataHtml(vs, v) : '') + '</div>';
const partial = updates => '<?xml version="1.0" encoding="UTF-8"?><partial-response><changes>' +
    updates.map(u => '<update id="' + u[0] + '"><![CDATA[' + u[1] + ']]></update>').join('') + '</changes></partial-response>';
const ABLAUF_TEIL = '<?xml version="1.0" encoding="UTF-8"?><partial-response><error><error-name>class javax.faces.application.ViewExpiredException</error-name><error-message><![CDATA[viewId ist abgelaufen]]></error-message></error></partial-response>';
const ABLAUF_SEITE = '<!doctype html><html><head><title>Fehler</title></head><body><h1>javax.faces.application.ViewExpiredException</h1></body></html>';

function seiteHtml(seite, vs, fertig, dashboard) {
    const v = Z.views[vs], pfad = SEITEN[seite];
    return '<!doctype html><html><head><meta charset="utf-8"><title>snt ESL - ' + NAME[seite] + '</title></head><body>' +
        '<div id="viewExpiredDialog" aria-hidden="true" style="display:none">Session abgelaufen <button type="button">zu Anmeldung</button></div>' +
        '<form id="frmMainMenu" name="frmMainMenu"><button type="button" id="frmMainMenu:mainMenu">Projekte</button><input type="hidden" name="javax.faces.ViewState" value="' + vs + '"></form>' +
        '<form id="sis_form_01"><a id="sis_form_01:CTS_tabProjektQueries" class="ui-menuitem-link" href="#"><span class="ui-menuitem-text">Projektergebnisse</span></a></form>' +
        bereichHtml(vs, v) +
        '<form id="f_PwdChange" style="display:none"><input id="f_PwdChange:pw" name="f_PwdChange:pw" type="password"></form>' +
        '<div id="frmMainMenu:j_idt40" class="ui-menu-overlay" style="display:none"><ul>' +
        Object.keys(SEITEN).map(k => '<li><a class="ui-menuitem-link" href="#" data-p="' + k + '"><span class="ui-menuitem-text">' + NAME[k] + '</span></a></li>').join('') + '</ul></div>' +
        '<script>(function(){\n' +
        'var VS=' + JSON.stringify(vs) + ', PFAD=' + JSON.stringify(pfad) + ', I=' + JSON.stringify(IDS[seite]) + ', FERTIG=' + (fertig ? 'true' : 'false') + ';\n' +
        // Label fuellen wie das PrimeFaces-Skript — nur auf der obersten Seite (im Rahmen blieb es leer)
        'function fuelle(){ if(!FERTIG) return; document.querySelectorAll(".ui-selectonemenu").forEach(function(w){ var o=w.querySelector("option[selected]"), l=w.querySelector(".ui-selectonemenu-label"); if(o&&l) l.textContent=o.textContent; }); }\nfuelle();\n' +
        'function ajax(p, cb){ p.set("javax.faces.partial.ajax","true"); p.set("javax.faces.ViewState",VS); var x=new XMLHttpRequest(); x.open("POST",PFAD);' +
        ' x.setRequestHeader("Faces-Request","partial/ajax"); x.setRequestHeader("Content-Type","application/x-www-form-urlencoded"); x.onload=function(){ anwenden(x.responseText); if(cb) cb(); }; x.send(p.toString()); }\n' +
        // wie PrimeFaces: <redirect> -> navigieren, <update> -> Knoten ersetzen (alte Referenzen sind danach tot)
        'function anwenden(t){ var r=/<redirect url="([^"]+)"/.exec(t); if(r){ location.href=r[1]; return; }' +
        ' var re=/<update id="([^"]+)"><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/update>/g, m; while((m=re.exec(t))){ var el=document.getElementById(m[1]); if(el) el.outerHTML=m[2]; } fuelle(); }\n' +
        'document.addEventListener("click", function(e){ var t=e.target;\n' +
        ' var a=t.closest("a.ui-menuitem-link[data-p]"); if(a){ e.preventDefault(); ajax(new URLSearchParams({"javax.faces.source":"frmMainMenu:j_idt40","menue":a.getAttribute("data-p")})); return; }\n' +
        ' if(t.closest("#sis_form_01\\\\:CTS_tabProjektQueries")){ e.preventDefault(); ajax(new URLSearchParams({"javax.faces.source":"sis_form_01:CTS_tabProjektQueries"})); return; }\n' +
        ' if(t.closest(".ui-selectonemenu-trigger")){ document.getElementById("statPanel").style.display=""; return; }\n' +
        ' var li=t.closest("li.ui-selectonemenu-item"); if(li){ document.getElementById("statPanel").style.display="none";' +
        '  if(/export/i.test(li.textContent) && !document.querySelector(".ui-selectonemenu option[selected]")) ajax(new URLSearchParams({"javax.faces.source":"filterForm:"+I.stat})); return; }\n' +
        ' var b=t.closest("button"); if(b && b.id==="filterForm:"+I.such){ e.preventDefault(); var p=new URLSearchParams(new FormData(document.getElementById("filterForm")));' +
        '  p.set("javax.faces.source",b.id); p.set(b.id,b.id); ajax(p, function(){ ajax(new URLSearchParams({"javax.faces.source":"data:dataTable","data:dataTable_filtering":"true"})); }); }\n' +
        '});\n' +
        (dashboard ? 'try{localStorage.setItem("rcLigaOeffnenAus","1");}catch(e){}\n' +
            'var s=document.createElement("script");s.src="/node_modules/xlsx/dist/xlsx.full.min.js";s.onload=async function(){\n' +
            ' var b=new Uint8Array(await (await fetch("/Mitarbeiter_IDS_Final_komplett.xlsx")).arrayBuffer()),z="";for(var i=0;i<b.length;i+=32768)z+=String.fromCharCode.apply(null,b.subarray(i,i+32768));\n' +
            ' window.__rcFiles={mapping:btoa(z)};window.__rcQuelle=await (await fetch("/esl_live_arena_v22.js?t="+Date.now(),{cache:"reload"})).text();(0,eval)(window.__rcQuelle);};\n' +
            'document.head.appendChild(s);\n' : '') +
        '})();</script></body></html>';
}

// Anmeldeformular. Autofill von Edge nachgebaut: die Felder stehen leer da, gefuellt
// werden sie erst von der ersten ECHTEN Geste (isTrusted) — ein click() aus JS gilt nicht.
function loginHtml(meldung) {
    return '<!doctype html><html><head><meta charset="utf-8"><title>snt ESL - Anmeldung</title></head><body>' +
        '<form id="loginform" name="loginform" method="post" action="/Agents/login_esl.xhtml"><input type="hidden" name="loginform" value="loginform">' +
        '<div id="loginform:msgs" class="ui-messages">' + (meldung ? '<span class="ui-messages-error-summary">' + meldung + '</span>' : '') + '</div>' +
        '<input id="loginform:user" name="loginform:user" type="text" autocomplete="username" value="">' +
        '<input id="loginform:pw" name="loginform:pw" type="password" autocomplete="current-password" value="">' +
        '<button id="loginform:btnLogin" name="loginform:btnLogin" type="submit">Anmelden</button></form>' +
        (Z.ohneautofill ? '' : '<script>(function(){var u=document.getElementById("loginform:user"),p=document.getElementById("loginform:pw"),fertig=false;' +
            'document.addEventListener("pointerdown",function(e){if(!e.isTrusted||fertig)return;fertig=true;u.value="schein";p.value="schein";},true);})();</script>') +
        '</body></html>';
}

const STATISCH = { '/esl_live_arena_v22.js': 'application/javascript', '/node_modules/xlsx/dist/xlsx.full.min.js': 'application/javascript',
    '/Mitarbeiter_IDS_Final_komplett.xlsx': 'application/octet-stream' };

http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const html = (s, code) => { res.writeHead(code || 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(s); };
    const xml = s => { res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(s); };
    if (STATISCH[u.pathname]) {
        res.writeHead(200, { 'Content-Type': STATISCH[u.pathname], 'Cache-Control': 'no-store' });
        return res.end(fs.readFileSync(path.join(DIR, u.pathname)));
    }
    if (u.pathname === '/esl/steuer') {
        const a = u.searchParams.get('aktion'), p = u.searchParams.get('p');
        if (a === 'sitzung' && DATEN[p]) { Z.sitzung = p; log('sitzung-von-aussen', { p }); }
        if (a === 'autorefresh') { Object.keys(Z.views).forEach(id => { Z.views[id].liste = Z.sitzung; }); log('autorefresh', { liste: Z.sitzung }); }
        if (a === 'leer' && DATEN[p]) { Z.leer[p] = u.searchParams.get('an') !== '0'; log('leer', { p, an: Z.leer[p] }); }
        if (a === 'ablauf') { Object.keys(Z.views).forEach(id => { Z.views[id].ab = true; }); log('ablauf', {}); }
        if (a === 'abmelden') { Z.angemeldet = false; log('abmelden', {}); }
        if (a === 'ohneautofill') { Z.ohneautofill = u.searchParams.get('an') !== '0'; log('ohneautofill', { an: Z.ohneautofill }); }
        if (a === 'gestern') { Z.gestern = u.searchParams.get('an') !== '0'; log('gestern', { an: Z.gestern }); }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ sitzung: Z.sitzung, leer: Z.leer, tab: Z.tab, views: Z.views, mf: MF.length, log: Z.log,
            angemeldet: Z.angemeldet, anmeldungen: Z.anmeldungen, ohneautofill: Z.ohneautofill, gestern: Z.gestern }));
    }
    if (u.pathname === '/Agents/login_esl.xhtml') {
        if (req.method === 'GET') return html(loginHtml());
        const teile = [];
        req.on('data', c => teile.push(c));
        return req.on('end', () => {
            const f = felder(req, Buffer.concat(teile));
            Z.anmeldungen++;
            if (f['loginform:user'] && f['loginform:pw']) {
                Z.angemeldet = true; log('anmeldung', { ok: true, n: Z.anmeldungen });
                res.writeHead(302, { Location: '/Agents/secure/main.xhtml' }); return res.end();
            }
            log('anmeldung', { ok: false, n: Z.anmeldungen });
            html(loginHtml('Anmeldung fehlgeschlagen: Benutzer und Kennwort eingeben.'));
        });
    }
    if (u.pathname.startsWith('/Agents/secure') && !Z.angemeldet) {   // abgemeldet: JEDE Anfrage geht zur Anmeldung
        res.writeHead(302, { Location: '/Agents/login_esl.xhtml' }); return res.end();
    }
    if (u.pathname === '/Agents/secure/main.xhtml') {
        log('main', { nach: Z.sitzung });
        res.writeHead(302, { Location: SEITEN[Z.sitzung] }); return res.end();
    }
    const seite = seiteVonPfad(u.pathname);
    if (!seite) return html('nicht da', 404);
    if (req.method === 'GET') { const vs = neueSicht(seite); return html(seiteHtml(seite, vs, u.searchParams.get('fertig') === '1', u.searchParams.get('dashboard') === '1')); }
    const teile = [];
    req.on('data', c => teile.push(c));
    req.on('end', () => {
        const f = felder(req, Buffer.concat(teile)), vs = f['javax.faces.ViewState'], v = Z.views[vs];
        const ajax = f['javax.faces.partial.ajax'] === 'true' || /partial/.test(req.headers['faces-request'] || '');
        const quelle = f['javax.faces.source'] || '';
        if (!v || v.ab) { log('abgelaufen', { vs, quelle }); return ajax ? xml(ABLAUF_TEIL) : html(ABLAUF_SEITE); }
        if (quelle === 'frmMainMenu:j_idt40') {
            const p = f.menue;
            if (p === Z.sitzung) { log('menue-gleich', { p }); return xml(partial([])); }   // KEINE Umleitung
            Z.sitzung = p; log('menue', { p });
            return xml('<?xml version="1.0" encoding="UTF-8"?><partial-response><redirect url="' + SEITEN[p] + '"></redirect></partial-response>');
        }
        if (quelle === 'sis_form_01:CTS_tabProjektQueries') {
            v.tab = true; log('reiter', { vs, seite: v.seite });
            return xml(partial([['bereich', bereichHtml(vs, v)]]));
        }
        const I = IDS[v.seite];
        if (quelle === 'filterForm:' + I.stat) {
            v.stat = true; Z.tab[v.seite] = true; log('statistik', { vs, seite: v.seite });
            return xml(partial([['bereich', bereichHtml(vs, v)]]));
        }
        if (quelle === 'data:dataTable') {
            v.liste = Z.sitzung; log('filter-neubau', { vs, seite: v.seite, liste: v.liste });
            return xml(partial([['data', dataHtml(vs, v)]]));
        }
        if (quelle === 'filterForm:' + I.such) {
            v.von = deZuIso(f['filterForm:' + I.von + '_input']); v.bis = deZuIso(f['filterForm:' + I.bis + '_input']);
            log('suche', { vs, seite: v.seite, liste: v.liste, von: v.von, bis: v.bis, zeilen: v.stat ? zeilen(v).length : 0 });
            return xml(partial([['filterForm', formHtml(vs, v)], ['data', dataHtml(vs, v)], ['j_id1:javax.faces.ViewState:0', vs]]));
        }
        if (('filterForm:' + I.exp) in f && v.stat && zeilen(v).length) {
            const e = exportXlsx(v);
            log('export', { vs, seite: v.seite, liste: v.liste, zeilen: e.zeilen });
            res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename=export.xlsx' });
            return res.end(e.buf);
        }
        // Unbekannter Knopf (z. B. Export ohne gerenderten Export-Knopf): JSF baut die Seite neu.
        log('seite-zurueck', { vs, quelle, knoepfe: Object.keys(f).filter(k => /^filterForm:j_idt\d+$/.test(k)).join(',') });
        html(seiteHtml(v.seite, vs, false, false));
    });
}).listen(PORT, '127.0.0.1', () => console.log('Schein-ESL auf http://127.0.0.1:' + PORT + ' — Kabel ' + DATEN.kabel.length + ' / Mobile ' + DATEN.mobile.length + ' / UM ' + DATEN.um.length + ' Zeilen (heute+' + (TAGE === 1 ? 'gestern' : TAGE + ' Vortage') + '), MF-Agenten ' + MF.length));
