'use strict';
// Schein-Ligaliste fuer die Messungen des Datendienstes (27.10.).
// KEIN Pruefwerkzeug (heisst bewusst nicht *_pruefen.js). Start: .claude/launch.json
// -> "liga-schein" (Port 8414, PORT ueberschreibbar). Tests lenken ccs.vodafone.de und
// login.microsoftonline.com per --host-resolver-rules auf 127.0.0.1 mit diesem Port.
//   GET  <Basis>/dist/liga_listen.rb?script_id=11035   Seite mit #script_id_secure (SCHEIN),
//        #user_id (u1), leerer table#result-table und einem Ok-Knopf (#ok-button), der wie
//        der echte eine Abfrage schickt (damit die Auto-Abfrage des Crawlers etwas klicken kann)
//        — mit dem Baum, den der FENSTERNAME angibt (rcKpiQuelle_mob -> Mobile, rcKpiQuelle_um -> UM,
//        sonst Kabel), gelesen beim Klick; kein ?p= noetig
//   POST <Basis>/dist/scripts/get_data.rb              die Tabelle (Form wie der echte Export:
//        Gruppenzeile mit colspan + Leaf-Zeile, so liest sie parseKpiTable aus kpi_crawler.js)
// Daten: Test Excels/ligalisten.xls (Blatt mit "Agentenname"), Zeile fuer Zeile reihum auf
// die drei Projekte verteilt. Baum (nodeid_inlist): 11405 Kabel · 11317,11229 Mobile ·
// 12090 UM, jeder andere Baum -> leere Tabelle. Falsches Token -> 200 "keine Berechtigung".
// interval=day: je Tag von startdate bis enddate (YYYYMMDD) ein Block mit der Leaf-Spalte
// "Datum" (YYYY/MM/DD) hinter der CCS-ID. Mit figure_list nur die Gruppen dieser Kennzahlen
// (GRUPPE_FIG; Stammdaten immer), ohne figure_list alle. Ohne gueltige Daten: daterange=current_month ->
// Monatsanfang..heute, sonst nur heute (der Crawler schickt "undefined").
// Steuerung (JSON): /__steuer?aktion=
//   zustand · tot (naechste Abfragen 401) · lebt · ora&p=um (nur dieser Baum liefert
//   ORA-00936 ohne Tabelle; p leer/unbekannt loescht) · ms&an=1|0 (Liga-Seite leitet auf die
//   Schein-Microsoft-Anmeldung um, bis sie durchlaufen ist; an=1 setzt msAbsendungen auf 0;
//   &stufen=2: erst eine E-Mail-Maske mit Fokus im Mailfeld, "Weiter" fuehrt zur Kennwort-Maske;
//   &falsch=1: jedes Kennwort wird abgelehnt, die Kennwort-Maske kommt mit Meldung wieder; ohne
//   beides einstufig wie bisher) · langsam&ms=N (jede get_data.rb-Antwort kommt N ms spaeter; 0 = aus)
// Schein-Microsoft-Anmeldung (jeder Host, Pfad /__ms): E-Mail #i0116, Kennwort #i0118 (bleibt
// leer, bis die erste ECHTE Geste — pointerdown mit isTrusted — kommt), Weiter #idSIButton9;
// danach "Angemeldet bleiben?" (#idBtn_Back / #idSIButton9); dann zurueck zur Liga-Seite.
// msAbsendungen zaehlt jeden Absende-Klick der ersten Maske (auch mit leerem Kennwort).
const http = require('http'), path = require('path');
const DIR = path.join(__dirname, '..');
const XLSX = require(path.join(DIR, 'node_modules', 'xlsx'));
const PORT = +process.env.PORT || 8414;
const TOKEN = 'SCHEIN';
const PROJEKTE = ['kabel', 'mobile', 'um'];
const BAUM_ECHT = { kabel: '11405', mobile: '11317,11229', um: '12090' };   // Schreibweise wie RC_ABFRAGEN im Crawler
const FIGURES = '10004,10005,10006,10014,10082,10062,10339,10075,10355,10340,10080,10081,10063,10064,10065,10076,10077,10078,10067,10060,10061,10357,10358';
const baumKey = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean).sort().join(',');
const BAUM = {};   // sortierter Baum -> Projekt (Reihenfolge der Ids ist beim Abfragen egal)
PROJEKTE.forEach(p => { BAUM[baumKey(BAUM_ECHT[p])] = p; });
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const p2 = n => String(n).padStart(2, '0');
const slash = d => d.getUTCFullYear() + '/' + p2(d.getUTCMonth() + 1) + '/' + p2(d.getUTCDate());
const de = d => p2(d.getUTCDate()) + '.' + p2(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear();
const ymd = s => { const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(s || '').trim()); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : null; };

// ---- Quelle: Blatt mit "Agentenname"; Kopf/Datenzeilen NIE ueber feste Zeilennummern ----
let KOPF = null, GRUPPEN = null, ZEILEN = null;
const wb = XLSX.readFile(path.join(DIR, 'Test Excels', 'ligalisten.xls'));
for (const n of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' });
    const k = rows.findIndex(r => r.indexOf('Agentenname') !== -1);
    if (k < 1) continue;                                   // Gruppenzeile steht eine Zeile darueber
    KOPF = rows[k];
    GRUPPEN = [];
    rows[k - 1].forEach((g, j) => { if (j < KOPF.length) { if (g !== '') GRUPPEN.push({ name: String(g), span: 1 }); else if (GRUPPEN.length) GRUPPEN[GRUPPEN.length - 1].span++; } });
    ZEILEN = {}; PROJEKTE.forEach(p => { ZEILEN[p] = []; });
    rows.slice(k + 1).filter(r => r[4] !== '' && r[5] !== '').forEach((r, i) => ZEILEN[PROJEKTE[i % 3]].push(r));
    break;
}
if (!KOPF) throw new Error('ligalisten.xls: kein Blatt mit "Agentenname" gefunden');

// Kennzahl-Gruppe -> figure-Ids (FIGURE_IDS im Crawler); Promotoren/Detraktoren/Neutrale gibt es fuer CS und TNPS.
// Wie das echte Portal liefert die Tabelle nur die Gruppen der angefragten figure_list (ohne Liste: alle).
const GRUPPE_FIG = { 'ACW': ['10005'], 'AHT': ['10006'], 'Auflegerquote': ['10082'], 'CS': ['10062'], 'TNPS': ['10075'],
    'TNPS Antwortquote %': ['10355'], 'TNPS Deep Detractor %': ['10340'], 'First-Time-Fix': ['10080'],
    'Promotoren': ['10063', '10076'], 'Detraktoren': ['10064', '10077'], 'Neutrale': ['10065', '10078'] };

// tage = null: ein Block ohne Datum-Spalte (cumulate), sonst Liste von Date (interval=day); figs = Set der figure-Ids oder null
function tabelle(proj, tage, bereich, figs) {
    const datum = !!tage, zeilen = proj ? ZEILEN[proj] : [];
    const spalten = [], gew = [];                          // behaltene Spalten (Index in KOPF) und Gruppen; Gruppe 0 = Stammdaten
    let ab = 0;
    GRUPPEN.forEach((g, i) => {
        if (i === 0 || !figs || (GRUPPE_FIG[g.name] || []).some(id => figs.has(id))) {
            gew.push(g); for (let j = 0; j < g.span; j++) spalten.push(ab + j);
        }
        ab += g.span;
    });
    const kopf = spalten.map(j => KOPF[j]);
    const leaf = datum ? kopf.slice(0, 6).concat('Datum', kopf.slice(6)) : kopf;
    const gruppen = gew.map((g, i) => ({ name: i === 0 ? bereich : g.name, span: g.span + (datum && i === 0 ? 1 : 0) }));
    const out = ['<table id="result-table" class="table">', '<thead>',
        '<tr>' + gruppen.map(g => '<th colspan="' + g.span + '">' + esc(g.name) + '</th>').join('') + '</tr>',
        '<tr>' + leaf.map(l => '<th>' + esc(l) + '</th>').join('') + '</tr>', '</thead>', '<tbody>'];
    let nr = 0;
    (tage || [null]).forEach(tag => zeilen.forEach(r => {
        const z = spalten.map(j => r[j]); z[0] = ++nr;
        const zellen = datum ? z.slice(0, 6).concat(slash(tag), z.slice(6)) : z;
        out.push('<tr>' + zellen.map((c, j) => '<td>' + (j === 4 ? '<a href="/user?user_id=' + esc(z[5]) + '">' + esc(c) + '</a>' : esc(c)) + '</td>').join('') + '</tr>');
    }));
    out.push('</tbody>', '</table>');
    return out.join('\n');                                 // je Zeile ein <tr> (zaehlbar mit grep -c)
}

const Z = { tot: false, ora: null, ms: false, msAngemeldet: false, msAbsendungen: 0, msStufen: 1, msFalsch: false, msCcsStart: false, abfragen: 0, langsam: 0, log: [] };
const log = (was, info) => { Z.log.push(Object.assign({ t: new Date().toTimeString().slice(0, 8), was }, info)); if (Z.log.length > 400) Z.log.shift(); };

// Der Ok-Knopf schickt den Baum des Projekts, das der FENSTERNAME angibt (wie projektAusName im
// Crawler: rcKpiQuelle_mob -> Mobile, rcKpiQuelle_um -> UM, sonst Kabel). Gelesen wird er erst beim
// Klick; ein fester Baum liesse Mobile-/UM-Fenster Kabel-Pakete senden, die ihr Dashboard verwirft.
function ligaSeite() {
    const vorl = { kabel: 'Vodafone_Kabel', mobile: 'Vodafone_Mobile', um: 'Vodafone_UM' };
    const koerper = {};
    PROJEKTE.forEach(p => {
        const baum = BAUM_ECHT[p];
        koerper[p] = ['type=get-result', 'script_id=11035', 'script_id_secure=' + TOKEN, 'user_id=u1', 'nodeid_inlist=' + baum, 'nodeid_inlist_c=' + baum,
            'loc_inlist=Alanya', 'loc_inlist_c=Alanya', 'daterange=intraday', 'interval=cumulate', 'startdate=undefined', 'enddate=undefined',
            'figure_list=' + FIGURES, 'show_ccsid=1', 'table_type=2', 'description_settings_list=u1;11035;' + vorl[p]].join('&');
    });
    return '<!doctype html><html><head><meta charset="utf-8"><title>Ligalisten</title></head><body>' +
        '<input type="hidden" id="script_id_secure" name="script_id_secure" value="' + TOKEN + '">' +
        '<input type="hidden" id="user_id" name="user_id" value="u1">' +
        '<select id="daterange-list"><option value="intraday" selected>Intraday</option></select>' +
        '<button id="ok-button" type="button">Ok</button>' +
        '<table id="result-table"><thead><tr><th>Ligalisten</th></tr></thead><tbody></tbody></table>' +
        '<script>var KOERPER=' + JSON.stringify(koerper) + ';document.getElementById("ok-button").addEventListener("click",function(){' +
        'var n=String(window.name||""),p=/_mob$/.test(n)?"mobile":/_um$/.test(n)?"um":"kabel";' +
        'fetch("scripts/get_data.rb",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:KOERPER[p]})' +
        '.then(function(r){return r.text();}).then(function(t){var d=document.createElement("div");d.innerHTML=t;var n=d.querySelector("table");' +
        'if(n)document.getElementById("result-table").outerHTML=n.outerHTML;});});</script></body></html>';
}

// ---- Schein-Microsoft-Anmeldung ----
// schritt 0: E-Mail-Maske (nur stufen=2): Adresse vom Konto vorbelegt, Fokus beim Laden im Mailfeld, das
// Kennwortfeld liegt wie bei Microsoft per "moveOffScreen" ausserhalb des Bildes. 1: Kennwort-Maske
// (einstufig mit sichtbarem Mailfeld, zweistufig ohne). 2: "Angemeldet bleiben?".
function msSeite(rueck, schritt, meldung) {
    const aktion = '/__ms/' + (schritt === 2 ? 'kmsi' : schritt === 0 ? 'email' : 'weiter') + '?rueck=' + encodeURIComponent(rueck);
    const kopf = '<!doctype html><html><head><meta charset="utf-8"><title>Anmelden</title></head><body><form method="post" action="' + esc(aktion) + '">';
    // start=1 (Citrix 29.10.): Fokus liegt auf dem Haken "Nicht mehr anzeigen" (ein INPUT).
    if (schritt === 2) return kopf + '<div>Angemeldet bleiben?</div>' + (Z.msCcsStart ? '<input type="checkbox" id="KmsiCheckboxField"> ' : '') +
        '<button type="submit" id="idBtn_Back" name="nein" value="1">Nein</button> ' +
        '<button type="submit" id="idSIButton9" name="ja" value="1">Ja</button></form>' +
        (Z.msCcsStart ? '<script>document.getElementById("KmsiCheckboxField").focus();</script>' : '') + '</body></html>';
    if (schritt === 0) return kopf + '<input id="i0116" name="loginfmt" type="email" value="konto@schein.invalid"> ' +
        '<input id="i0118" name="passwd" type="password" class="moveOffScreen" style="position:absolute;left:-10000px" value=""> ' +
        '<button type="submit" id="idSIButton9">Weiter</button></form>' +
        '<script>document.getElementById("i0116").focus();</script></body></html>';
    return kopf + (meldung ? '<div id="passwordError">' + esc(meldung) + '</div>' : '') +
        (Z.msStufen === 2 ? '' : '<input id="i0116" name="loginfmt" type="email" value=""> ') + '<input id="i0118" name="passwd" type="password" value=""> ' +
        '<button type="submit" id="idSIButton9">Weiter</button></form>' +
        '<script>(function(){var p=document.getElementById("i0118"),fertig=false;' +
        'document.addEventListener("pointerdown",function(e){if(!e.isTrusted||fertig)return;fertig=true;p.value="schein";},true);})();</script></body></html>';
}

http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const html = (s, code) => { res.writeHead(code || 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(s); };
    const lies = fn => { const t = []; req.on('data', c => t.push(c)); req.on('end', () => fn(new URLSearchParams(Buffer.concat(t).toString('utf8')))); };
    const host = req.headers.host || ('127.0.0.1:' + PORT);

    if (u.pathname === '/__steuer') {
        const a = u.searchParams.get('aktion'), p = u.searchParams.get('p');
        if (a === 'tot') { Z.tot = true; log('tot', {}); }
        if (a === 'lebt') { Z.tot = false; log('lebt', {}); }
        if (a === 'langsam') { Z.langsam = Math.max(0, +u.searchParams.get('ms') || 0); log('langsam', { ms: Z.langsam }); }
        if (a === 'ora') { Z.ora = PROJEKTE.indexOf(p) !== -1 ? p : null; log('ora', { p: Z.ora }); }
        if (a === 'ms') {
            Z.ms = u.searchParams.get('an') !== '0';
            if (Z.ms) { Z.msAngemeldet = false; Z.msAbsendungen = 0; }
            Z.msStufen = u.searchParams.get('stufen') === '2' ? 2 : 1; Z.msFalsch = u.searchParams.get('falsch') === '1';
            Z.msCcsStart = u.searchParams.get('start') === '1';
            log('ms', { an: Z.ms, stufen: Z.msStufen, falsch: Z.msFalsch, start: Z.msCcsStart });
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify(Object.assign({ projekte: PROJEKTE.map(p => p + ':' + ZEILEN[p].length).join(' ') }, Z)));
    }

    if (u.pathname === '/__ms' || u.pathname.indexOf('/__ms/') === 0) {
        const rueck = u.searchParams.get('rueck') || '';
        if (req.method === 'GET') return html(msSeite(rueck, Z.msStufen === 2 ? 0 : 1));
        return lies(f => {
            if (u.pathname === '/__ms/email') { log('ms-email', {}); return html(msSeite(rueck, 1)); }   // keine Kennwort-Absendung
            if (u.pathname === '/__ms/weiter') {
                Z.msAbsendungen++; log('ms-weiter', { n: Z.msAbsendungen, pw: !!f.get('passwd') });
                if (f.get('passwd') && !Z.msFalsch) return html(msSeite(rueck, 2));
                return html(msSeite(rueck, 1, f.get('passwd') ? 'Ihr Kennwort ist falsch.' : 'Geben Sie Ihr Kennwort ein.'));
            }
            Z.msAngemeldet = true; log('ms-fertig', {});
            // start=1: CCS landet nach der Anmeldung auf seiner Startseite statt auf der Ligaliste (Citrix 28./29.10.).
            const ziel = !/^https?:\/\//.test(rueck) ? '/' : Z.msCcsStart ? new URL(rueck).origin + '/cgi-bin/LOGIN/start.rb' : rueck;
            res.writeHead(302, { Location: ziel }); res.end();
        });
    }

    if (u.pathname === '/cgi-bin/LOGIN/start.rb') log('ccs-start', {});
    if (u.pathname === '/cgi-bin/LOGIN/start.rb') return html('<!doctype html><html><head><meta charset="utf-8"><title>Customer Care Support</title></head><body><p>CCS Startseite</p></body></html>');

    if (/\/liga_listen\.rb$/.test(u.pathname) && req.method === 'GET') {
        if (Z.ms && !Z.msAngemeldet) {
            res.writeHead(302, { Location: 'http://login.microsoftonline.com:' + (host.split(':')[1] || PORT) + '/__ms?rueck=' + encodeURIComponent('http://' + host + req.url) });
            return res.end();
        }
        return html(ligaSeite());
    }

    if (/\/get_data\.rb$/.test(u.pathname) && req.method === 'POST') {
        return lies(f => setTimeout(() => {
            Z.abfragen++;
            const proj = BAUM[baumKey(f.get('nodeid_inlist'))] || null, iv = f.get('interval') || 'cumulate';
            log('abfrage', { projekt: proj, daterange: f.get('daterange'), interval: iv, tot: Z.tot });
            if (Z.tot) { res.writeHead(401, { 'Content-Type': 'text/plain' }); return res.end('Unauthorized'); }
            if (f.get('script_id_secure') !== TOKEN) return html('<html><body><p>Fehler: keine Berechtigung fuer dieses Skript.</p></body></html>');
            if (proj && Z.ora === proj) return html('<html><body><p>Fehler: ORA-00936: Ausdruck fehlt</p></body></html>');
            const heute = new Date(); heute.setUTCHours(12, 0, 0, 0);
            let von = ymd(f.get('startdate')), bis = ymd(f.get('enddate'));
            if (!von || !bis || bis < von) {
                bis = heute; von = f.get('daterange') === 'current_month' ? new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth(), 1, 12)) : heute;
            }
            const tage = []; for (let d = von; d <= bis && tage.length < 62; d = new Date(d.getTime() + 86400000)) tage.push(d);
            const fl = f.get('figure_list');
            html(tabelle(proj, iv === 'day' ? tage : null, de(von) + ' - ' + de(bis), fl ? new Set(fl.split(',').map(x => x.trim())) : null));
        }, Z.langsam));
    }
    html('nicht da', 404);
}).listen(PORT, '127.0.0.1', () => console.log('Schein-Ligaliste auf http://127.0.0.1:' + PORT + ' — Zeilen je Projekt: ' + PROJEKTE.map(p => p + ' ' + ZEILEN[p].length).join(' / ')));
