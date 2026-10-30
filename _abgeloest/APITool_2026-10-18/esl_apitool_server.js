/**
 * esl_apitool_server.js
 * Lokaler APITool / Excel-API & CDP-Auto-Harvester Server fuer die ESL Live-Arena v22.0
 *
 * 100 % Vollautomatisch ohne Drag & Drop:
 *  1. Startet/verbindet Microsoft Edge mit --remote-debugging-port=9222 und --user-data-dir=EdgeProfil
 *  2. Oeffnet automatisch:
 *     - Tab 1: http://127.0.0.1:8787/ESL_Live_Arena_APITool.html (Entkoppelte Live-Arena)
 *     - Tab 2: https://esl.regiocom.net/Agents/login_esl.xhtml (Hintergrund-Worker ESL)
 *     - Tab 3: https://ccs.vodafone.de/cgi-bin/AGENTEN_KENNZAHLEN_2/LIGA_LISTEN_NEW/dist/liga_listen.rb?script_id=11035 (Hintergrund-Worker Ligaliste)
 *  3. Zieht alle 20 Sekunden vollautomatisch per Chrome DevTools Protocol (CDP):
 *     - Frischen ESL-Excel-Export (.xlsx) direkt aus dem #filterForm von esl.regiocom.net -> Test Excels/Auto_ESL_<projekt>.xlsx
 *     - Frische Ligaliste-KPIs (Kabel 11405, Mobile 11317/11229, UM 12090) direkt ueber get_data.rb -> Test Excels/Auto_Liga_Live.json
 *  4. Bindet zusaetzlich G:\Meine Ablage\ESL_Stunden_Reporte_Automated und Test Excels ein.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || 8787);
const CDP_PORT = Number(process.env.CDP_PORT || 9222);
const NO_EDGE_LAUNCH = process.env.NO_EDGE_LAUNCH === '1';

const LIVE_ARENA_DIR = __dirname;
const ROOT_DIR = path.resolve(__dirname, '..');
const TEST_EXCELS_DIR = path.join(LIVE_ARENA_DIR, 'Test Excels');
const PARENT_TEST_EXCELS_DIR = path.join(ROOT_DIR, 'Test Excels');
const GDRIVE_ESL_DIR = 'G:\\Meine Ablage\\ESL_Stunden_Reporte_Automated';

const DASHBOARD_URL = `http://127.0.0.1:${PORT}/ESL_Live_Arena_APITool.html`;
const ESL_LOGIN_URL = 'https://esl.regiocom.net/Agents/login_esl.xhtml';
const LIGA_URL = 'https://ccs.vodafone.de/cgi-bin/AGENTEN_KENNZAHLEN_2/LIGA_LISTEN_NEW/dist/liga_listen.rb?script_id=11035';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Sicherstellen, dass Test Excels existiert
try {
    if (!fs.existsSync(TEST_EXCELS_DIR)) {
        fs.mkdirSync(TEST_EXCELS_DIR, { recursive: true });
    }
} catch (_) {}

// ============================================================================
//  1. SKRIPTE AUS BESTAND LADEN (esl_autopilot.user.js & kpi_crawler.js)
// ============================================================================
let autopilotCode = '';
let kpiParserBundle = '';

function loadHelperScripts() {
    try {
        const apPath = path.join(LIVE_ARENA_DIR, 'esl_autopilot.user.js');
        if (fs.existsSync(apPath)) {
            autopilotCode = fs.readFileSync(apPath, 'utf8');
        }
    } catch (e) {
        console.warn('[APITool] Konnte esl_autopilot.user.js nicht lesen:', e.message);
    }

    try {
        const kpiPath = path.join(LIVE_ARENA_DIR, 'kpi_crawler.js');
        if (fs.existsSync(kpiPath)) {
            const raw = fs.readFileSync(kpiPath, 'utf8');
            const iClean = raw.indexOf('function cleanText(');
            const iHist = raw.indexOf('// ---------- Tages-Historie');
            const iExt = raw.indexOf('function extractTableHtml(');
            const iStandort = raw.indexOf('// ---------- Standort-Auswahl:');
            const iLoc = raw.indexOf('const RC_LOC_ALLE =');
            const iFetchDr = raw.indexOf('async function fetchDaterangeKpis(');

            const partParser = (iClean !== -1 && iHist !== -1) ? raw.slice(iClean, iHist) : '';
            const partExtract = (iExt !== -1 && iStandort !== -1) ? raw.slice(iExt, iStandort) : '';
            const partAbfrage = (iLoc !== -1 && iFetchDr !== -1) ? raw.slice(iLoc, iFetchDr) : '';

            if (partParser && partExtract) {
                kpiParserBundle = [
                    partParser,
                    partExtract,
                    partAbfrage,
                    'window.__rcApitoolKpiParser = { parseKpiTable, extractTableHtml, RC_LOC_ALLE, RC_FIGURES, RC_ABFRAGEN };'
                ].join('\n');
            }
        }
    } catch (e) {
        console.warn('[APITool] Konnte kpi_crawler.js Parser nicht extrahieren:', e.message);
    }
}
loadHelperScripts();

// ============================================================================
//  2. HARVESTER-STATUS & LIVE-KPI-CACHE
// ============================================================================
const harvesterState = {
    cdpConnected: false,
    cdpPort: CDP_PORT,
    activeProject: 'kabel',
    esl: {
        status: 'init',        // 'init' | 'login' | 'navigating' | 'ok' | 'empty' | 'error'
        message: 'Warte auf Browser-Verbindung...',
        lastAttempt: 0,
        lastSuccess: 0,
        lastFile: null,
        bytes: 0,
        projekt: 'kabel',
        tabUrl: ''
    },
    liga: {
        status: 'init',        // 'init' | 'login' | 'ok' | 'error'
        message: 'Warte auf Ligaliste-Tab...',
        lastAttempt: 0,
        lastSuccess: 0,
        agentCount: 0,
        byTreeCounts: { kabel: 0, mobile: 0, um: 0 },
        tabUrl: ''
    }
};

let liveKpiCache = null;
const autoLigaJsonPath = path.join(TEST_EXCELS_DIR, 'Auto_Liga_Live.json');
try {
    if (fs.existsSync(autoLigaJsonPath)) {
        liveKpiCache = JSON.parse(fs.readFileSync(autoLigaJsonPath, 'utf8'));
        if (liveKpiCache && Array.isArray(liveKpiCache.payload)) {
            harvesterState.liga.status = 'ok';
            harvesterState.liga.agentCount = liveKpiCache.payload.length;
            harvesterState.liga.lastSuccess = liveKpiCache.timestampMs || Date.now();
            harvesterState.liga.message = `Geladen aus Auto_Liga_Live.json (${liveKpiCache.payload.length} Agenten)`;
        }
    }
} catch (_) {}

// ============================================================================
//  3. DATEI-SCANNER (Test Excels & Google Drive)
// ============================================================================
function listExcelFiles(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) return [];
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const files = [];
        for (const entry of entries) {
            if (!entry.isFile()) continue;
            if (!/\.(xlsx|xls)$/i.test(entry.name)) continue;
            if (entry.name.startsWith('~$')) continue;
            const fullPath = path.join(dirPath, entry.name);
            const stat = fs.statSync(fullPath);
            files.push({
                name: entry.name,
                fullPath,
                size: stat.size,
                mtimeMs: stat.mtimeMs,
                mtimeIso: stat.mtime.toISOString()
            });
        }
        files.sort((a, b) => b.mtimeMs - a.mtimeMs);
        return files;
    } catch (_) {
        return [];
    }
}

function listAllTestExcels() {
    const map = new Map();
    for (const dir of [TEST_EXCELS_DIR, PARENT_TEST_EXCELS_DIR]) {
        for (const f of listExcelFiles(dir)) {
            if (!map.has(f.name) || f.mtimeMs > map.get(f.name).mtimeMs) {
                map.set(f.name, f);
            }
        }
    }
    return Array.from(map.values()).sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function classifyTestExcels(files) {
    const result = {
        mapping: null,
        eslKabel: null,
        eslMobile: null,
        eslUm: null,
        eslAuto: null,
        ligaliste: null,
        pix: null,
        all: files.map(f => ({
            name: f.name,
            size: f.size,
            mtimeMs: f.mtimeMs,
            mtimeIso: f.mtimeIso,
            url: '/api/test-excels/' + encodeURIComponent(f.name)
        }))
    };

    for (const f of files) {
        const lower = f.name.toLowerCase();
        const item = {
            name: f.name,
            size: f.size,
            mtimeMs: f.mtimeMs,
            mtimeIso: f.mtimeIso,
            url: '/api/test-excels/' + encodeURIComponent(f.name)
        };
        if (!result.mapping && (lower.includes('mitarbeiter_ids') || (lower.includes('mapping') && !lower.includes('luecken') && !lower.includes('lücken')))) {
            result.mapping = item;
        } else if (!result.eslAuto && lower.startsWith('auto_esl_')) {
            result.eslAuto = item;
        } else if (!result.eslKabel && (lower.includes('kabel') || lower.includes('212911'))) {
            result.eslKabel = item;
        } else if (!result.eslMobile && (lower.includes('mobile') || lower.includes('212922'))) {
            result.eslMobile = item;
        } else if (!result.eslUm && (lower === 'um.xlsx' || lower.includes('vodafone_um') || lower.includes('_um') || lower.startsWith('um') || lower.includes('212931'))) {
            result.eslUm = item;
        } else if (!result.ligaliste && lower.includes('liga')) {
            result.ligaliste = item;
        } else if (!result.pix && lower.includes('pix')) {
            result.pix = item;
        }
    }
    // Wenn Auto_ESL_<projekt>.xlsx vorhanden und neuer als statische Datei ist, bevorzugen:
    for (const f of files) {
        const lower = f.name.toLowerCase();
        const item = {
            name: f.name,
            size: f.size,
            mtimeMs: f.mtimeMs,
            mtimeIso: f.mtimeIso,
            url: '/api/test-excels/' + encodeURIComponent(f.name)
        };
        if (lower === 'auto_esl_kabel.xlsx' && (!result.eslKabel || f.mtimeMs >= result.eslKabel.mtimeMs)) {
            result.eslKabel = item;
        }
        if (lower === 'auto_esl_mobile.xlsx' && (!result.eslMobile || f.mtimeMs >= result.eslMobile.mtimeMs)) {
            result.eslMobile = item;
        }
        if (lower === 'auto_esl_um.xlsx' && (!result.eslUm || f.mtimeMs >= result.eslUm.mtimeMs)) {
            result.eslUm = item;
        }
    }
    return result;
}

// ============================================================================
//  4. MICROSOFT EDGE STARTER & CDP-CLIENT (Port 9222)
// ============================================================================
function findEdgeBinary() {
    const candidates = [
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(process.env['LOCALAPPDATA'] || '', 'Microsoft\\Edge\\Application\\msedge.exe')
    ];
    for (const p of candidates) {
        if (p && fs.existsSync(p)) return p;
    }
    return null;
}

async function fetchCdpTargets() {
    try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`, {
            signal: AbortSignal.timeout(2500)
        });
        if (!res.ok) return null;
        const list = await res.json();
        harvesterState.cdpConnected = true;
        return Array.isArray(list) ? list : null;
    } catch (_) {
        harvesterState.cdpConnected = false;
        return null;
    }
}

async function openCdpTab(targetUrl) {
    try {
        const endpoint = `http://127.0.0.1:${CDP_PORT}/json/new?${targetUrl}`;
        let res = await fetch(endpoint, { method: 'PUT', signal: AbortSignal.timeout(3000) }).catch(() => null);
        if (!res || !res.ok) {
            res = await fetch(endpoint, { method: 'GET', signal: AbortSignal.timeout(3000) }).catch(() => null);
        }
        return !!(res && res.ok);
    } catch (_) {
        return false;
    }
}

let edgeLaunchAttempted = false;

async function ensureEdgeAndTabs() {
    let targets = await fetchCdpTargets();
    if (!targets && !NO_EDGE_LAUNCH && !edgeLaunchAttempted) {
        edgeLaunchAttempted = true;
        const edgeExe = findEdgeBinary();
        if (edgeExe) {
            const profileDir = path.join(ROOT_DIR, 'EdgeProfil');
            const cacheDir = path.join(process.env.LOCALAPPDATA || path.join(ROOT_DIR, '.cache'), 'regiocom_ESL_Cache', 'EdgeProfil');
            try { fs.mkdirSync(profileDir, { recursive: true }); } catch (_) {}
            try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (_) {}

            console.log(`[APITool] Starte Microsoft Edge mit Fernsteuerungs-Port ${CDP_PORT} (Profil: ${profileDir})...`);
            const args = [
                `--remote-debugging-port=${CDP_PORT}`,
                '--remote-allow-origins=*',
                `--user-data-dir=${profileDir}`,
                `--disk-cache-dir=${cacheDir}`,
                '--disable-popup-blocking',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--no-first-run',
                '--no-default-browser-check',
                DASHBOARD_URL,
                ESL_LOGIN_URL,
                LIGA_URL
            ];
            try {
                const child = spawn(edgeExe, args, { detached: true, stdio: 'ignore' });
                child.unref();
            } catch (e) {
                console.warn('[APITool] Fehler beim Edge-Start:', e.message);
            }

            // Warte bis zu 8 Sekunden auf Port 9222
            for (let i = 0; i < 16; i++) {
                await new Promise(r => setTimeout(r, 500));
                targets = await fetchCdpTargets();
                if (targets) break;
            }
        }
    }

    if (!targets) return null;

    // Pruefen, ob ESL-Tab und Ligaliste-Tab offen sind (falls Edge schon lief)
    const pages = targets.filter(t => t && t.type === 'page');
    const hasEsl = pages.some(t => /esl\.regiocom\.net/i.test(t.url || ''));
    const hasLiga = pages.some(t => /ccs\.vodafone\.de|login\.microsoftonline\.com/i.test(t.url || ''));
    const hasDash = pages.some(t => /ESL_Live_Arena_APITool\.html/i.test(t.url || ''));

    if (!NO_EDGE_LAUNCH) {
        if (!hasDash) await openCdpTab(DASHBOARD_URL);
        if (!hasEsl) await openCdpTab(ESL_LOGIN_URL);
        if (!hasLiga) await openCdpTab(LIGA_URL);
        if (!hasDash || !hasEsl || !hasLiga) {
            await new Promise(r => setTimeout(r, 600));
            targets = (await fetchCdpTargets()) || targets;
        }
    }
    return targets;
}

// Einzelnen CDP-Befehl oder Serie ueber WebSocket an einen Tab senden
function withCdpSession(wsUrl, fn, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
        if (!wsUrl || typeof WebSocket === 'undefined') {
            return reject(new Error('WebSocket nicht verfuegbar oder keine wsUrl'));
        }
        let ws;
        let settled = false;
        let msgId = 0;
        const pending = new Map();

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            try { ws.close(); } catch (_) {}
            reject(new Error(`CDP Timeout nach ${timeoutMs}ms`));
        }, timeoutMs);

        const finish = (err, val) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            for (const [, p] of pending) p.reject(err || new Error('Session closed'));
            pending.clear();
            try { ws.close(); } catch (_) {}
            if (err) reject(err);
            else resolve(val);
        };

        try {
            ws = new WebSocket(wsUrl);
        } catch (e) {
            clearTimeout(timer);
            return reject(e);
        }

        const sendCmd = (method, params = {}) => new Promise((resCmd, rejCmd) => {
            const id = ++msgId;
            pending.set(id, { resolve: resCmd, reject: rejCmd });
            try {
                ws.send(JSON.stringify({ id, method, params }));
            } catch (e) {
                pending.delete(id);
                rejCmd(e);
            }
        });

        ws.addEventListener('message', (ev) => {
            try {
                const data = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
                if (data.id && pending.has(data.id)) {
                    const p = pending.get(data.id);
                    pending.delete(data.id);
                    if (data.error) p.reject(new Error(data.error.message || JSON.stringify(data.error)));
                    else p.resolve(data.result);
                }
            } catch (_) {}
        });

        ws.addEventListener('error', (err) => {
            finish(new Error(err && err.message ? err.message : 'WebSocket Fehler'));
        });

        ws.addEventListener('close', () => {
            if (!settled) finish(new Error('WebSocket vorzeitig geschlossen'));
        });

        ws.addEventListener('open', async () => {
            try {
                const evalJs = async (expression, awaitPromise = true) => {
                    const r = await sendCmd('Runtime.evaluate', {
                        expression,
                        awaitPromise,
                        returnByValue: true
                    });
                    if (r && r.exceptionDetails) {
                        const txt = (r.exceptionDetails.exception && r.exceptionDetails.exception.description)
                            || r.exceptionDetails.text || 'JS Eval Error';
                        throw new Error(txt);
                    }
                    return r && r.result ? r.result.value : undefined;
                };
                const result = await fn({ sendCmd, evalJs });
                finish(null, result);
            } catch (e) {
                finish(e);
            }
        });
    });
}

// Echten Mausklick an neutraler Stelle im Tab ausloesen (entsperrt Edge Passwort-Autofill)
async function unlockAutofillWithClick(session) {
    try {
        const pt = await session.evalJs(`(function(){
            var el = document.querySelector('h1, .login-title, img, form, body');
            if (!el) return { x: 20, y: 20 };
            var r = el.getBoundingClientRect();
            return { x: Math.max(10, Math.min(400, Math.round(r.left + 12))), y: Math.max(10, Math.min(300, Math.round(r.top + 12))) };
        })()`, false);
        const x = (pt && pt.x) || 20;
        const y = (pt && pt.y) || 20;
        await session.sendCmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await session.sendCmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        await new Promise(r => setTimeout(r, 350));
    } catch (_) {}
}

// ============================================================================
//  5. ESL-PORTAL HARVESTER (esl.regiocom.net -> Auto_ESL_<projekt>.xlsx)
// ============================================================================
async function harvestEslTab(targets, requestedProject) {
    const pages = (targets || []).filter(t => t && t.type === 'page');
    const eslTab = pages.find(t => /esl\.regiocom\.net/i.test(t.url || ''));
    if (!eslTab || !eslTab.webSocketDebuggerUrl) {
        harvesterState.esl.status = 'init';
        harvesterState.esl.message = 'Kein offener esl.regiocom.net Tab gefunden';
        return { ok: false, reason: 'kein-esl-tab' };
    }

    harvesterState.esl.lastAttempt = Date.now();
    harvesterState.esl.tabUrl = eslTab.url || '';
    const targetProj = requestedProject || harvesterState.activeProject || 'kabel';

    return await withCdpSession(eslTab.webSocketDebuggerUrl, async (session) => {
        // 1. Pruefen, wo der ESL-Tab steht, und Autopilot (ohne schweres Dashboard!) injizieren
        const pageState = await session.evalJs(`(function(){
            // Verhindert, dass esl_autopilot.user.js das 2 MB Dashboard ins Portal injiziert!
            // Autopilot navigiert trotzdem automatisch bis #filterForm ("Export Projektergebnisse").
            window.rcLiveInterval = 999999;

            var pw = document.getElementById('loginform:pw') || document.querySelector('input[type="password"]');
            var pwVisible = false;
            if (pw) {
                var r = pw.getBoundingClientRect();
                var st = window.getComputedStyle(pw);
                pwVisible = (r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && !document.getElementById('frmMainMenu'));
            }
            var form = document.getElementById('filterForm');
            var menu = document.getElementById('frmMainMenu');
            var expired = document.getElementById('viewExpiredDialog');
            var expiredVisible = !!(expired && (expired.offsetWidth > 0 || expired.offsetHeight > 0));
            return {
                href: location.href,
                pathname: location.pathname,
                pwVisible: pwVisible,
                hasFilterForm: !!form,
                hasMainMenu: !!menu,
                expiredVisible: expiredVisible,
                autopilotLoaded: !!window.__rcAutopilotInjected
            };
        })()`, false);

        if (pageState && pageState.expiredVisible) {
            await session.evalJs(`location.href = 'https://esl.regiocom.net/Agents/login_esl.xhtml';`, false);
            harvesterState.esl.status = 'login';
            harvesterState.esl.message = 'ESL-Sitzung abgelaufen (viewExpired), lade neu...';
            return { ok: false, reason: 'view-expired-reload' };
        }

        // Autopilot einmalig in die Seite einspielen, damit Menü-Navigation und Login-Helfer laufen
        if (autopilotCode && pageState && !pageState.autopilotLoaded) {
            const safeAp = JSON.stringify(autopilotCode);
            await session.evalJs(`(function(){
                window.rcLiveInterval = 999999;
                window.__rcAutopilotInjected = true;
                try { (0, eval)(${safeAp}); } catch(e) { console.warn('[APITool Autopilot]', e); }
            })()`, false);
        }

        // Falls Login-Maske sichtbar: Echten Mausklick senden (entsperrt Edge Autofill) + Login klicken
        if (pageState && pageState.pwVisible) {
            await unlockAutofillWithClick(session);
            const loginRes = await session.evalJs(`(function(){
                var u = document.getElementById('loginform:user') || document.querySelector('input[type="text"]');
                var p = document.getElementById('loginform:pw') || document.querySelector('input[type="password"]');
                var b = document.getElementById('loginform:btnLogin') || document.querySelector('button[type="submit"], input[type="submit"]');
                if (u && p && u.value && p.value && b) {
                    b.click();
                    return 'clicked-login';
                }
                return 'waiting-credentials';
            })()`, false);
            harvesterState.esl.status = 'login';
            harvesterState.esl.message = loginRes === 'clicked-login'
                ? 'ESL-Anmeldung automatisch abgeschickt...'
                : 'ESL-Anmeldemaske offen (warte auf gespeicherte Zugangsdaten)...';
            return { ok: false, reason: loginRes };
        }

        // Falls Hauptmenue da ist, pruefen ob das gewuenschte Projekt aktiv ist und ob #filterForm bereitsteht
        const navCheck = await session.evalJs(`(function(zielProjekt){
            function norm(s){ return (s || '').replace(/\\s+/g, ' ').trim().toLowerCase(); }
            function projVonPfad(pfad){
                var s = String(pfad || '');
                try { s = decodeURIComponent(s); } catch(e){}
                var d = s.split('/').pop().toLowerCase();
                if (d.indexOf('sis_vodafone') !== 0) return '';
                return d.indexOf('_mobile') !== -1 ? 'mobile' : d.indexOf('_um') !== -1 ? 'um' : 'kabel';
            }
            var aktProj = projVonPfad(location.pathname);
            var zielMenue = zielProjekt === 'mobile' ? 'vodafone mobile'
                          : zielProjekt === 'um' ? 'vodafone um'
                          : 'vodafone kabel';

            // 1. Wenn wir auf main.xhtml oder einem anderen Projekt stehen -> Menuepunkt klicken
            if (aktProj !== zielProjekt && document.getElementById('frmMainMenu')) {
                var links = Array.from(document.querySelectorAll('a.ui-menuitem-link'));
                var link = links.find(function(a){ return norm(a.textContent) === zielMenue; });
                if (link) { link.click(); return { state: 'switching-project', from: aktProj, to: zielProjekt }; }
            }

            // 2. Reiter "Projektergebnisse" pruefen
            var statSelect = Array.from(document.querySelectorAll('select')).find(function(s){
                return Array.from(s.options || []).some(function(o){ return norm(o.textContent).indexOf('export projektergebnisse') !== -1; });
            });
            if (!statSelect) {
                var tab = document.getElementById('sis_form_01:CTS_tabProjektQueries') ||
                    Array.from(document.querySelectorAll('span.ui-menuitem-text, a.ui-tabs-anchor, a')).find(function(el){
                        return norm(el.textContent).indexOf('projektergebnisse') !== -1;
                    });
                if (tab) { (tab.closest('a') || tab).click(); return { state: 'clicking-tab-projektergebnisse', proj: aktProj }; }
                return { state: 'waiting-for-menu', proj: aktProj };
            }

            // 3. Statistik-Auswahl "Export Projektergebnisse" sicherstellen
            var box = statSelect.closest ? statSelect.closest('.ui-selectonemenu') : null;
            var lab = box ? box.querySelector('.ui-selectonemenu-label') : null;
            var ansichtSteht = false;
            if (lab && norm(lab.textContent).indexOf('export projektergebnisse') !== -1) ansichtSteht = true;
            if (!ansichtSteht) {
                for (var o = 0; o < statSelect.options.length; o++) {
                    var op = statSelect.options[o];
                    if ((op.selected || op.defaultSelected) && op.value && norm(op.textContent).indexOf('export projektergebnisse') !== -1) {
                        ansichtSteht = true; break;
                    }
                }
            }
            if (!ansichtSteht) {
                var trig = box ? box.querySelector('.ui-selectonemenu-trigger') : null;
                if (trig) trig.click();
                setTimeout(function(){
                    var items = document.querySelectorAll('li.ui-selectonemenu-item, li[role="option"]');
                    for (var i = 0; i < items.length; i++) {
                        if (norm(items[i].textContent).indexOf('export projektergebnisse') !== -1) { items[i].click(); return; }
                    }
                }, 400);
                return { state: 'selecting-export-view', proj: aktProj };
            }

            var form = document.getElementById('filterForm');
            if (!form) return { state: 'waiting-filterForm', proj: aktProj };
            return { state: 'ready', proj: aktProj || zielProjekt };
        })(${JSON.stringify(targetProj)})`, false);

        if (!navCheck || navCheck.state !== 'ready') {
            harvesterState.esl.status = 'navigating';
            harvesterState.esl.message = `ESL navigiert automatisch (${(navCheck && navCheck.state) || 'warte'})...`;
            return { ok: false, reason: (navCheck && navCheck.state) || 'not-ready' };
        }

        // 4. #filterForm ist bereit -> Such-Postback (mit heutigem Datum) + Excel-Export per fetch() ziehen!
        const exportResult = await session.evalJs(`(async function(){
            try {
                var form = document.getElementById('filterForm');
                if (!form) return { ok: false, reason: 'kein-filterForm' };

                function pad2(n){ return String(n).padStart(2, '0'); }
                var d = new Date();
                var heuteDe = pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear();

                // Datumsfelder auf heute stellen
                var dateInputs = Array.from(form.querySelectorAll('input.hasDatepicker, .ui-calendar input')).filter(function(i){ return i.name; });
                dateInputs.slice(0, 2).forEach(function(inp){
                    if (inp.value !== heuteDe) {
                        inp.value = heuteDe;
                        try { inp.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){}
                        try { inp.dispatchEvent(new Event('change', { bubbles: true })); } catch(e){}
                    }
                });

                var buttons = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"], button'));
                var searchBtn = buttons.find(function(b){
                    var t = ((b.title || '') + ' ' + (b.innerText || b.value || '')).toLowerCase();
                    return /suchen|aktualisieren|filtern|anzeigen/.test(t) || /refresh/i.test(b.innerHTML || '');
                });

                var exportBtnIdFromAjax = null;
                var ajaxEmpty = false;

                if (searchBtn && (searchBtn.id || searchBtn.name)) {
                    var sid = searchBtn.id || searchBtn.name;
                    var sd = new FormData(form);
                    dateInputs.slice(0, 2).forEach(function(inp){ sd.set(inp.name, heuteDe); });
                    sd.append(sid, sid);
                    sd.append('javax.faces.partial.ajax', 'true');
                    sd.append('javax.faces.source', sid);
                    sd.append('javax.faces.partial.execute', 'filterForm data');
                    sd.append('javax.faces.partial.render', 'filterForm data');

                    var sResp = await fetch(form.action || location.href, {
                        method: 'POST',
                        body: sd,
                        credentials: 'include',
                        headers: { 'Faces-Request': 'partial/ajax', 'X-Requested-With': 'XMLHttpRequest' }
                    });
                    var sTxt = await sResp.text();
                    if (/ViewExpiredException|viewExpiredDialog/.test(sTxt)) {
                        return { ok: false, reason: 'view-expired' };
                    }
                    if (/Statistik liefert kein Ergebnis/i.test(sTxt)) {
                        ajaxEmpty = true;
                    }
                    // Frisches ViewState in ALLE Formulare schreiben (verhindert ViewExpiredException!)
                    var vs = sTxt.match(/<update id="[^"]*javax\\.faces\\.ViewState[^"]*"><!\\[CDATA\\[(.*?)\\]\\]><\\/update>/) ||
                             sTxt.match(/name="javax\\.faces\\.ViewState".*?value="([^"]+)"/);
                    if (vs && vs[1]) {
                        document.querySelectorAll('input[name="javax.faces.ViewState"]').forEach(function(inp){ inp.value = vs[1]; });
                    }
                    // Export-Knopf aus der frischen Ajax-Antwort lesen
                    var mForm = sTxt.match(/<update id="filterForm"><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/update>/);
                    if (mForm && mForm[1]) {
                        var doc = new DOMParser().parseFromString(mForm[1], 'text/html');
                        var cand = Array.from(doc.querySelectorAll('button[type="submit"], input[type="submit"], a, button')).find(function(b){
                            var t = ((b.title || '') + ' ' + (b.innerText || b.textContent || b.value || '') + ' ' + (b.innerHTML || '')).toLowerCase();
                            return t.indexOf('excel') !== -1 || t.indexOf('export') !== -1;
                        });
                        if (cand) exportBtnIdFromAjax = cand.id || cand.name || null;
                    }
                }

                var domExportBtn = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"], a, button')).find(function(b){
                    var t = ((b.title || '') + ' ' + (b.innerText || b.textContent || b.value || '') + ' ' + (b.innerHTML || '')).toLowerCase();
                    return t.indexOf('excel') !== -1 || t.indexOf('export') !== -1;
                });
                var expName = exportBtnIdFromAjax || (domExportBtn && (domExportBtn.id || domExportBtn.name));
                if (!expName) {
                    return { ok: false, reason: ajaxEmpty ? '0-datensaetze-heute' : 'kein-export-knopf' };
                }

                var fd = new FormData(form);
                dateInputs.slice(0, 2).forEach(function(inp){ fd.set(inp.name, heuteDe); });
                fd.append(expName, expName);

                var eResp = await fetch(form.action || location.href, {
                    method: 'POST',
                    body: fd,
                    credentials: 'include'
                });
                if (!eResp.ok) return { ok: false, reason: 'http-' + eResp.status };
                var buf = await eResp.arrayBuffer();
                var bytes = new Uint8Array(buf);
                // Echte .xlsx beginnt mit PK (0x50, 0x4B)
                if (bytes.length < 200 || bytes[0] !== 0x50 || bytes[1] !== 0x4B) {
                    return { ok: false, reason: 'keine-xlsx-antwort', size: bytes.length };
                }

                var bin = '';
                var chunk = 0x8000;
                for (var i = 0; i < bytes.length; i += chunk) {
                    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
                }
                return {
                    ok: true,
                    b64: btoa(bin),
                    bytes: bytes.length
                };
            } catch (err) {
                return { ok: false, reason: String(err && err.message || err) };
            }
        })()`, true);

        if (!exportResult || !exportResult.ok || !exportResult.b64) {
            const reason = (exportResult && exportResult.reason) || 'unbekannt';
            if (reason === 'view-expired') {
                await session.evalJs(`location.reload();`, false);
            }
            harvesterState.esl.status = reason === '0-datensaetze-heute' ? 'empty' : 'error';
            harvesterState.esl.message = reason === '0-datensaetze-heute'
                ? `ESL (${navCheck.proj}): Heute noch 0 Datensaetze`
                : `ESL-Export noch nicht bereit: ${reason}`;
            return { ok: false, reason };
        }

        const projKey = navCheck.proj || targetProj || 'kabel';
        const fileName = `Auto_ESL_${projKey}.xlsx`;
        const filePath = path.join(TEST_EXCELS_DIR, fileName);
        const fileBuf = Buffer.from(exportResult.b64, 'base64');
        fs.writeFileSync(filePath, fileBuf);

        harvesterState.esl.status = 'ok';
        harvesterState.esl.lastSuccess = Date.now();
        harvesterState.esl.lastFile = fileName;
        harvesterState.esl.bytes = fileBuf.length;
        harvesterState.esl.projekt = projKey;
        harvesterState.esl.message = `Live-Export ${fileName} (${Math.round(fileBuf.length / 1024)} KB) aktualisiert`;

        return { ok: true, fileName, bytes: fileBuf.length, projekt: projKey };
    }, 25000).catch(err => {
        harvesterState.esl.status = 'error';
        harvesterState.esl.message = `CDP-Fehler (ESL): ${err.message}`;
        return { ok: false, reason: err.message };
    });
}

// ============================================================================
//  6. LIGALISTE HARVESTER (ccs.vodafone.de -> Auto_Liga_Live.json)
// ============================================================================
async function harvestLigaTab(targets) {
    const pages = (targets || []).filter(t => t && t.type === 'page');
    const ligaTab = pages.find(t => /ccs\.vodafone\.de|login\.microsoftonline\.com/i.test(t.url || ''));
    if (!ligaTab || !ligaTab.webSocketDebuggerUrl) {
        harvesterState.liga.status = 'init';
        harvesterState.liga.message = 'Kein offener Ligaliste-Tab (ccs.vodafone.de) gefunden';
        return { ok: false, reason: 'kein-liga-tab' };
    }

    harvesterState.liga.lastAttempt = Date.now();
    harvesterState.liga.tabUrl = ligaTab.url || '';

    return await withCdpSession(ligaTab.webSocketDebuggerUrl, async (session) => {
        // 1. Pruefen ob wir auf Login oder liga_listen.rb sind + Autopilot injizieren
        const pageInfo = await session.evalJs(`(function(){
            var sidEl = document.getElementById('script_id_secure');
            var uidEl = document.getElementById('user_id');
            var pw = document.querySelector('input[type="password"]');
            var pwVisible = !!(pw && (pw.offsetWidth > 0 || pw.offsetHeight > 0));
            return {
                href: location.href,
                sid: sidEl ? (sidEl.value || '') : '',
                uid: uidEl ? (uidEl.value || '') : '',
                pwVisible: pwVisible,
                autopilotLoaded: !!window.__rcAutopilotInjected,
                parserLoaded: !!(window.__rcApitoolKpiParser && typeof window.__rcApitoolKpiParser.parseKpiTable === 'function')
            };
        })()`, false);

        if (autopilotCode && pageInfo && !pageInfo.autopilotLoaded) {
            const safeAp = JSON.stringify(autopilotCode);
            await session.evalJs(`(function(){
                window.__rcAutopilotInjected = true;
                try { (0, eval)(${safeAp}); } catch(e) {}
            })()`, false);
        }

        if (pageInfo && pageInfo.pwVisible) {
            await unlockAutofillWithClick(session);
            await session.evalJs(`(function(){
                var b = document.querySelector('input[type="submit"], button[type="submit"]');
                var p = document.querySelector('input[type="password"]');
                if (p && p.value && b) b.click();
            })()`, false);
            harvesterState.liga.status = 'login';
            harvesterState.liga.message = 'Ligaliste / Microsoft SSO Anmeldung laeuft...';
            return { ok: false, reason: 'sso-login' };
        }

        if (!pageInfo || !pageInfo.sid || !pageInfo.uid) {
            harvesterState.liga.status = 'login';
            harvesterState.liga.message = 'Warte auf Ligaliste-Token (#script_id_secure)...';
            return { ok: false, reason: 'kein-token-im-dom' };
        }

        // 2. KPI-Parser-Funktionen aus kpi_crawler.js injizieren, falls noch nicht geladen
        if (!pageInfo.parserLoaded && kpiParserBundle) {
            await session.evalJs(kpiParserBundle, false);
        }

        // 3. Direkt-Abfrage von get_data.rb fuer alle 3 Baeume (Kabel 11405, Mobile 11317,11229, UM 12090)
        const ligaResult = await session.evalJs(`(async function(){
            try {
                var P = window.__rcApitoolKpiParser;
                if (!P || typeof P.parseKpiTable !== 'function') {
                    return { ok: false, reason: 'parser-nicht-geladen' };
                }
                var sid = (document.getElementById('script_id_secure') || {}).value || '';
                var uid = (document.getElementById('user_id') || {}).value || '';
                if (!sid || !uid) return { ok: false, reason: 'token-leer' };

                var trees = [
                    { key: 'kabel',  nodes: '11405',       vorlage: 'Vodafone_Kabel'  },
                    { key: 'mobile', nodes: '11317,11229', vorlage: 'Vodafone_Mobile' },
                    { key: 'um',     nodes: '12090',       vorlage: 'Vodafone_UM'     }
                ];

                var byTree = { kabel: [], mobile: [], um: [] };
                var byTreeCounts = { kabel: 0, mobile: 0, um: 0 };
                var mergedByCcs = {};

                for (var i = 0; i < trees.length; i++) {
                    var t = trees[i];
                    var p = new URLSearchParams();
                    p.set('type', 'get-result');
                    p.set('script_id', '11035');
                    p.set('script_id_secure', sid);
                    p.set('user_id', uid);
                    p.set('tree_template', 'null');
                    p.set('ffr_template', '');
                    p.set('nodeid_inlist', t.nodes);
                    p.set('nodeid_inlist_c', t.nodes);
                    p.set('spid_inlist', '10026');
                    p.set('spid_inlist_c', '10026');
                    p.set('cumulate_provider', '0');
                    p.set('cumulate_locations', '0');
                    p.set('cumulate_teams', '0');
                    p.set('loc_inlist', P.RC_LOC_ALLE);
                    p.set('loc_inlist_c', P.RC_LOC_ALLE);
                    p.set('teamid_inlist', '');
                    p.set('daterange', 'intraday');
                    p.set('interval', 'cumulate');
                    p.set('startdate', 'undefined');
                    p.set('enddate', 'undefined');
                    p.set('show_more_settings', '1');
                    p.set('figure_list', P.RC_FIGURES);
                    p.set('figure_group_list', '');
                    p.set('show_hms', '1');
                    p.set('show_nodes', '0');
                    p.set('show_employeeid', '0');
                    p.set('show_ccsid', '1');
                    p.set('show_notready_durations', '0');
                    p.set('show_ffr_templates', '0');
                    p.set('show_excel_pivot_header', '0');
                    p.set('agent_select', '-1');
                    p.set('ccsid', '');
                    p.set('table_type', '2');
                    p.set('all_provider_selected', 'false');
                    p.set('all_locations_selected', 'false');
                    p.set('all_teams_selected', 'true');
                    p.set('description_settings_list', uid + ';11035;' + t.vorlage);
                    p.set('setting_type', 'personal');

                    var resp = await fetch('/cgi-bin/AGENTEN_KENNZAHLEN_2/LIGA_LISTEN_NEW/dist/scripts/get_data.rb', {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
                            'accept': '*/*',
                            'x-requested-with': 'XMLHttpRequest'
                        },
                        body: p.toString()
                    });
                    if (!resp.ok) continue;
                    var txt = await resp.text();
                    var html = P.extractTableHtml(txt);
                    if (!html) continue;
                    var doc = new DOMParser().parseFromString(html, 'text/html');
                    var table = doc.querySelector('table#result-table') || doc.querySelector('table');
                    if (!table) continue;
                    var rows = P.parseKpiTable(table) || [];
                    byTree[t.key] = rows;
                    byTreeCounts[t.key] = rows.length;

                    rows.forEach(function(r){
                        if (!r || !r.ccsId) return;
                        r.projekt = t.key;
                        var prev = mergedByCcs[r.ccsId];
                        if (!prev || (r.callCount || 0) > (prev.callCount || 0)) {
                            mergedByCcs[r.ccsId] = r;
                        }
                    });
                }

                // Falls alle 3 Projekt-Baeume leer waren, versuche als Fallback die sichtbare DOM-Tabelle
                var payload = Object.values(mergedByCcs);
                if (!payload.length) {
                    var domTable = document.querySelector('table#result-table');
                    if (domTable) {
                        payload = P.parseKpiTable(domTable) || [];
                    }
                }

                return {
                    ok: true,
                    payload: payload,
                    byTreeCounts: byTreeCounts
                };
            } catch (err) {
                return { ok: false, reason: String(err && err.message || err) };
            }
        })()`, true);

        if (!ligaResult || !ligaResult.ok) {
            const reason = (ligaResult && ligaResult.reason) || 'unbekannt';
            harvesterState.liga.status = 'error';
            harvesterState.liga.message = `Ligaliste-Abruf fehlgeschlagen: ${reason}`;
            return { ok: false, reason };
        }

        const payload = Array.isArray(ligaResult.payload) ? ligaResult.payload : [];
        const nowMs = Date.now();
        liveKpiCache = {
            type: 'KPI_BATCH',
            liveDaterange: 'intraday',
            vollstaendig: true,
            timestampMs: nowMs,
            timestampIso: new Date(nowMs).toISOString(),
            byTreeCounts: ligaResult.byTreeCounts || {},
            payload
        };

        try {
            fs.writeFileSync(autoLigaJsonPath, JSON.stringify(liveKpiCache, null, 2), 'utf8');
        } catch (_) {}

        harvesterState.liga.status = 'ok';
        harvesterState.liga.lastSuccess = nowMs;
        harvesterState.liga.agentCount = payload.length;
        harvesterState.liga.byTreeCounts = ligaResult.byTreeCounts || { kabel: 0, mobile: 0, um: 0 };
        harvesterState.liga.message = `Ligaliste Live (${payload.length} Agenten: K=${harvesterState.liga.byTreeCounts.kabel || 0}, M=${harvesterState.liga.byTreeCounts.mobile || 0}, UM=${harvesterState.liga.byTreeCounts.um || 0})`;

        return { ok: true, agentCount: payload.length, byTreeCounts: harvesterState.liga.byTreeCounts };
    }, 30000).catch(err => {
        harvesterState.liga.status = 'error';
        harvesterState.liga.message = `CDP-Fehler (Ligaliste): ${err.message}`;
        return { ok: false, reason: err.message };
    });
}

// ============================================================================
//  7. HINTERGRUND-SCHLEIFE (ALLE 20 SEKUNDEN)
// ============================================================================
let harvestRunning = false;

async function runHarvesterCycle(options = {}) {
    if (harvestRunning) return { ok: false, busy: true };
    harvestRunning = true;
    const t0 = Date.now();
    try {
        if (options.projekt && ['kabel', 'mobile', 'um'].includes(options.projekt)) {
            harvesterState.activeProject = options.projekt;
        }
        const targets = await ensureEdgeAndTabs();
        if (!targets) {
            harvesterState.cdpConnected = false;
            harvesterState.esl.message = `Kein Browser auf CDP-Port ${CDP_PORT} erreichbar`;
            harvesterState.liga.message = `Kein Browser auf CDP-Port ${CDP_PORT} erreichbar`;
            return { ok: false, reason: 'no-cdp-browser' };
        }

        const [eslRes, ligaRes] = await Promise.all([
            harvestEslTab(targets, harvesterState.activeProject),
            harvestLigaTab(targets)
        ]);

        return {
            ok: !!(eslRes.ok || ligaRes.ok),
            esl: eslRes,
            liga: ligaRes,
            durationMs: Date.now() - t0
        };
    } finally {
        harvestRunning = false;
    }
}

// Starte den 20-Sekunden-Auto-Harvester
setTimeout(() => {
    runHarvesterCycle().catch(() => {});
    setInterval(() => {
        runHarvesterCycle().catch(() => {});
    }, 20000);
}, 1500);

// ============================================================================
//  8. HTTP-SERVER & API-ENDPUNKTE
// ============================================================================
function sendJson(res, statusCode, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
    });
    res.end(body);
}

function sendFile(res, filePath) {
    try {
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Datei nicht gefunden: ' + path.basename(filePath));
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        const stat = fs.statSync(filePath);
        res.writeHead(200, {
            'Content-Type': mime,
            'Content-Length': stat.size,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store'
        });
        fs.createReadStream(filePath).pipe(res);
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Server-Fehler: ' + err.message);
    }
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    // 1. API: Status & Dateiliste + CDP-Harvester-Status
    if (pathname === '/api/status') {
        const testFiles = listAllTestExcels();
        const gdriveFiles = listExcelFiles(GDRIVE_ESL_DIR);
        const latestGdrive = gdriveFiles.length > 0 ? {
            name: gdriveFiles[0].name,
            size: gdriveFiles[0].size,
            mtimeMs: gdriveFiles[0].mtimeMs,
            mtimeIso: gdriveFiles[0].mtimeIso,
            url: '/api/gdrive-latest'
        } : null;

        sendJson(res, 200, {
            ok: true,
            serverTime: new Date().toISOString(),
            testExcelsDir: TEST_EXCELS_DIR,
            gdriveDir: GDRIVE_ESL_DIR,
            testExcels: classifyTestExcels(testFiles),
            gdriveLatest: latestGdrive,
            harvester: harvesterState
        });
        return;
    }

    // 2. API: Live-KPIs aus dem CDP-Ligaliste-Harvester
    if (pathname === '/api/live-kpis') {
        if (liveKpiCache && Array.isArray(liveKpiCache.payload)) {
            sendJson(res, 200, {
                ok: true,
                ...liveKpiCache
            });
        } else {
            sendJson(res, 200, {
                ok: false,
                payload: [],
                message: harvesterState.liga.message
            });
        }
        return;
    }

    // 3. API: Sofort-Harvest ausloesen ("Jetzt synchronisieren" / Projektwechsel)
    if (pathname === '/api/harvest-now') {
        const reqProj = parsedUrl.searchParams.get('projekt') || '';
        const cycleRes = await runHarvesterCycle({ projekt: reqProj || undefined });
        sendJson(res, 200, {
            ...cycleRes,
            harvester: harvesterState
        });
        return;
    }

    // 4. API: Neueste Google-Drive ESL-Excel ausliefern
    if (pathname === '/api/gdrive-latest') {
        const gdriveFiles = listExcelFiles(GDRIVE_ESL_DIR);
        if (!gdriveFiles.length) {
            sendJson(res, 404, { ok: false, error: 'Keine Excel-Datei in G:\\Meine Ablage\\ESL_Stunden_Reporte_Automated gefunden.' });
            return;
        }
        sendFile(res, gdriveFiles[0].fullPath);
        return;
    }

    // 5. API: Datei aus Test Excels ausliefern (prueft LIVE ARENA/Test Excels und CRAW ESL/Test Excels)
    if (pathname.startsWith('/api/test-excels/')) {
        const fileName = path.basename(pathname.slice('/api/test-excels/'.length));
        const p1 = path.join(TEST_EXCELS_DIR, fileName);
        const p2 = path.join(PARENT_TEST_EXCELS_DIR, fileName);
        const targetPath = fs.existsSync(p1) ? p1 : p2;
        sendFile(res, targetPath);
        return;
    }

    // 6. Root -> ESL_Live_Arena_APITool.html
    if (pathname === '/' || pathname === '/index.html') {
        sendFile(res, path.join(LIVE_ARENA_DIR, 'ESL_Live_Arena_APITool.html'));
        return;
    }

    // 7. Statische Dateien aus LIVE ARENA
    const safeRel = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
    const staticPath = path.join(LIVE_ARENA_DIR, safeRel);
    if (staticPath.startsWith(LIVE_ARENA_DIR) && fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
        sendFile(res, staticPath);
        return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Nicht gefunden: ' + pathname);
});

server.listen(PORT, '127.0.0.1', () => {
    console.log('================================================================');
    console.log('  ESL LIVE-ARENA v22.0 — VOLLAUTOMATISCHER APITOOL & CDP SERVER');
    console.log('================================================================');
    console.log('  URL Dashboard : ' + DASHBOARD_URL);
    console.log('  CDP Browser   : http://127.0.0.1:' + CDP_PORT + ' (Auto-Harvester alle 20s)');
    console.log('  Test Excels   : ' + TEST_EXCELS_DIR);
    console.log('  Google Drive  : ' + GDRIVE_ESL_DIR);
    console.log('================================================================');
});
