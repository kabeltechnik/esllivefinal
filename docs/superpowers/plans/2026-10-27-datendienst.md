# Datendienst für die Live-Arena (Vorhaben 1) – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Node-Dienst holt ESL (20 s), Ligaliste (jede dritte Runde) und Vortage per Edge-Fernsteuerung und ist der einzige Heiler; die Live-Arena läuft als eigene Seite unter `http://127.0.0.1:8787` und nimmt nur, was der Dienst liefert.

**Architecture:** `esl_dienst.js` (HTTP, Warteschlange, Stand) mit sechs Modulen (Regeln, Bündel, CDP, Edge, ESL, Liga). In den Portal-Tabs laufen Original-Funktionen, die der Dienst beim Start aus `esl_live_arena_v22.js` und `kpi_crawler.js` schneidet – kein zweiter Export- oder Parser-Weg. v22 bekommt `rcDienstModus()`: an, holt es nichts selbst, liest alle 2 s `/api/stand`, speist über die vorhandenen Eingänge (`rcProjektLieferung`, `handleKpiMessage`, `rcAggregateMultiDayBuffer`) und leitet „Jetzt“, Projektwechsel, Auffrischen und Zeiträume an den Dienst weiter. Aus: jede Zeile wie heute.

**Tech Stack:** Node ≥ 22 nur mit Bordmitteln (`http`, `fs`, `crypto`, `child_process`, `vm`, globales `fetch`/`WebSocket`), Edge über CDP, PowerShell 5.1 (`Get-CimInstance`, `Get-NetTCPConnection`) für Prozessprüfungen, v22 (Browser-IIFE), Prüfwerkzeuge im Projektmuster (`pruefwerkzeuge/*_pruefen.js`), Messgerät mit headless Edge (`pruefwerkzeuge/dienst_messen.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-26-datendienst-design.md`

## Vorbedingung

- Der Arbeitsbaum trägt seit `0449384` ungesicherten Stand (Aufräumen 11.10. und mehr). Vor Task 1 mit dem Nutzer klären, ob dieser Stand zuerst als eigener Commit gesichert wird; sonst landet er im ersten Plan-Commit.
- Commit-Schritte nur ausführen, wenn der Nutzer Commits für diese Ausführung freigegeben hat (globale Regel). Nie pushen.

## Präzisierungen gegenüber dem Design

Vom Nutzer beim Lesen zu bestätigen; alle anderen Punkte setzt der Plan wie im Design um.

1. Die Stand-Abfrage läuft in v22 (`rcDienstEmpfangTick`), nicht in der Gastseite. Grund: Weiterleitungen („Jetzt“, Auffrischen) müssen auf das Einspeisen warten, und Clean-State, Re-Inject und Prüfwerkzeuge greifen nur in v22. Die Gastseite setzt die Marke, holt die Mitarbeiter-Excel und lädt v22.
2. Kein mitgeliefertes `xlsx`: v22 lädt XLSX, confetti und Chart.js selbst vom CDN (Start-Block, wie heute im Portal).
3. Liga-Vortage über einen einzigen Weg: `daterange=user_defined`, `interval=day`, `startdate`/`enddate` als `YYYYMMDD` (wie `harvestRangeApi` im Crawler), für tägliche Vortage und für frei gewählte Zeiträume. Statt `current_month` plus `last_month`.
4. Zurück auf heute nach einem Bereichsexport: `Page.navigate` auf `/Agents/secure/main.xhtml` (eine frische Seite steht auf heute; `rcRahmenAufbau` nutzt das täglich). Festgeschrieben wird nur der Bereich, per echtem Klick.
5. Das Geheimnis ist ein HttpOnly-Cookie `rcDienst`, gesetzt per CDP `Storage.setCookies`. Es steht nie in einer Adresse.
6. Edge startet ohne `--remote-allow-origins=*` (öffnete die Fernsteuerung für jede Webseite; Node braucht es nicht, siehe `fehlerseite_messen.mjs`) und ohne `--disable-popup-blocking`.
7. Liga 401: Tab ersetzen. Der Widerspruch im Design (Heilung 3 sagte „neu laden“) ist dort behoben.

## Global Constraints

- Node ≥ 22; keine npm-Abhängigkeit im Dienst (kein `require` aus `node_modules`). Prüfwerkzeuge dürfen `node_modules/xlsx` nutzen (Entwicklungsrechner).
- Citrix: keine Adminrechte, nichts installieren. `.cmd` ohne `&` in `echo`-Zeilen. Alle neuen Dateien reines LF.
- Dienst bindet nur `127.0.0.1`, Port 8787. CDP-Port 9222. Edge-Profil `<Dienstordner>\EdgeProfil` (dasselbe wie `ESL_Start.cmd`).
- Edge-Argumente: `--remote-debugging-port=9222`, `--user-data-dir=<profil>`, `--no-first-run`, `--no-default-browser-check`, `--disable-background-timer-throttling`, `--disable-renderer-backgrounding`, `--disable-backgrounding-occluded-windows`, `--disable-features=Translate,IntensiveWakeUpThrottling,CalculateNativeWinOcclusion` (genau einmal; Zusätze werden in diese Liste gemischt), bei beschreibbarem Cache-Ordner `--disk-cache-dir=%LOCALAPPDATA%\regiocom_ESL_Cache\EdgeProfil` und `--disk-cache-size=314572800`, Adressen zuletzt.
- Takt: ESL alle 20 s, Liga in jeder 3. Runde (Runde 0 eingeschlossen), Vortage einmal täglich, bei Fehlschlag frühestens nach 60 Min erneut. Werte über Umgebungsvariablen `ESL_DIENST_TAKT_SEK`, `ESL_DIENST_LIGA_JEDE` einstellbar, an einer Stelle in `esl_dienst.js`.
- Referenzbäume kommen aus `RC_ABFRAGEN` in `kpi_crawler.js` (kabel `11405`, mobile `11317,11229`, um `12090`); `figure_list` live = `RC_FIGURES`, Vortage = `10004,10006` (ACD, AHT); Standorte = `RC_LOC_ALLE`.
- Heilung: ESL-Anmeldung höchstens 3 Absendungen je 30 Min, nur mit lesbarem Passwort, Absenden per `Input.dispatchMouseEvent`; Liga-Tab ersetzen höchstens alle 10 Min; Fehlerseite nach 20 s neu laden; jeder CDP-Befehl, jeder `fetch` und jedes Warten hat eine Frist.
- Keine Zugangsdaten, kein Token, kein Geheimnis in Log, Stand-Datei, Ereignissen oder Adressen. `Dienst_Daten/`, `esl_dienst.log*`, `esl_dienst.lock` stehen in `.gitignore` (Personendaten).
- v22-Regeln: neue Helfer als Funktionsdeklaration (TDZ); `node --check esl_live_arena_v22.js`; `node pruefwerkzeuge/tdz_pruefen.js` = 0; alle 55 Prüfwerkzeuge grün (Einzeiler aus `CLAUDE.md`); keine Emojis; Re-Inject sauber.
- Ohne `window.__rcDienst` verhält sich v22 wie heute; `ESL_Start.cmd`, Autopilot und `kpi_crawler.js` bleiben unverändert.
- Texte und Kommentare im Stil der Datei: in v22-Zeichenketten ASCII-Umschrift (`Datensaetze`), Prosa in Doku mit Umlauten.

## Review Focus

Fünf Fälle, die keine Regel-Prüfung abdeckt; jeder hat seine Messung in der genannten Task.

1. **Dienst startet neu, während die Seite offen ist.** Neues Geheimnis, neues Cookie: die Abfragen der offenen Seite bekommen kurz 403. Erwartet: der Dienst setzt das Cookie im Profil beim Start, die Seite erholt sich ohne Neuladen in ≤ 30 s. Messung: Task 13, Fall „Dienst-Neustart“.
2. **Seite wird neu geladen, während ein Bereichsauftrag läuft.** Das wartende Versprechen geht verloren, der Auftrag läuft weiter. Erwartet: kein zweiter Auftrag, die Vortage kommen über den nächsten Stand an. Messung: Task 13.
3. **Nutzer schließt Edge ganz.** Erwartet: Edge kommt gedrosselt wieder (≤ 150 s), samt Dashboard-Tab mit Cookie, ESL meldet sich wieder an. Messung: Task 7 und Task 13.
4. **Mitarbeiter-Excel fehlt oder ist gesperrt** (in Excel geöffnet). Erwartet: `/api/mapping.xlsx` antwortet 503 mit Grund, die Seite läuft mit dem gespeicherten Mapping weiter und zeigt den Grund sichtbar. Messung: Task 12.
5. **Zwei Dashboard-Tabs offen.** Erwartet: beide lesen, nur ein Klick stellt das Projekt um; das Abgleichen des aktiven Projekts geschieht einmal beim Start des Empfangs, nicht im Takt (sonst schalten zwei Tabs endlos hin und her). Messung: Task 11.

---

### Task 1: Reine Dienst-Regeln

**Files:**
- Create: `esl_dienst_regeln.js`
- Test: `pruefwerkzeuge/dienst_regeln_pruefen.js`

**Interfaces:**
- Consumes: nichts.
- Produces (CommonJS `module.exports`):
  - `PROJEKTE = ['kabel','mobile','um']`
  - `datumIso(d: Date) -> 'YYYY-MM-DD'`, `isoZuDe(iso) -> 'TT.MM.JJJJ'`, `isoZuYmd(iso) -> 'YYYYMMDD'`
  - `vortageBereich(heute: Date) -> {von, bis} | null` (von = früherer von Monatsanfang und Montag dieser Woche, bis = gestern, null wenn von > bis)
  - `ligaFaellig(rundeNr, jede) -> bool`
  - `vortageFaellig(heuteIso, merk: {tag, versuchUm}, jetzt, wiederholMin = 60) -> bool`
  - `anmeldungErlaubt(zeiten: number[], jetzt, max = 3, fensterMin = 30) -> bool`
  - `ligaAntwortArt({status, auszug, hatTabelle, zeilen}) -> 'ok'|'leer'|'sitzung-tot'|'ora'|'http'` (Reihenfolge wie `verwerteAntwort`: HTTP 401/403 tot; ohne Tabelle erst `ORA-\d{5}`, dann `/keine Berechtigung|Sitzung|password|login/i` tot; sonst Status ≠ 200 `http`; Tabelle mit 0 Zeilen `leer`)
  - `ligaZusammenfuehren(jeBaum) -> {payload, vollstaendig, fehlend}`; `jeBaum[p] = {rows: object[]|null, zeit, art, grund}`; Zeile bekommt `projekt = p`; gleiche `ccsId` in zwei Bäumen: größeres `callCount` gewinnt; `vollstaendig` = alle drei haben `rows` (auch leer).
  - `auftragSchluessel(a) -> string`, `einreihen(liste, auftrag) -> {neu: bool, auftrag}`
  - `edgeArgumente({port, profil, cacheDir, extra, urls}) -> string[]`
  - `flagZustand(kommandozeile|null) -> {zustand: 'erfuellt'|'verletzt'|'nicht-pruefbar', fehlt: string[]}`
  - `prozessKonflikt(prozesse|null, eigenePid) -> {art: null|'tl'|'altstarter'|'nicht-pruefbar', text}` (TL: `/TL_Starter|tl_dienst\.js/i`; alter Starter: `/ESL_Start(_Mobile|_UM)?\.(cmd|ps1)/i`)
  - `portZustand(listenerPid|null, prozesse|null, profil) -> 'frei'|'eigen'|'fremd'|'nicht-pruefbar'`
  - `sperreFrei(inhalt|null, jetzt, pidLebt) -> bool` (Lebenszeichen gilt 180 s)
  - `anfrageErlaubt({host, cookie}, geheimnis, port) -> bool` (Host genau `127.0.0.1:<port>`, Cookie `rcDienst=<geheimnis>`)
  - `ligaErsatzErlaubt(letzter, jetzt, abstandMin = 10) -> bool`, `fehlerseiteNeuladen(seit, jetzt, warteSek = 20) -> bool`

- [ ] **Step 1: Prüfwerkzeug schreiben** (Muster `neuanmeldung_pruefen.js`: `pruefe(name, ok, hinweis)`, Schluss `ALLE n PRUEFUNGEN BESTANDEN.` bzw. `n von m Pruefungen FEHLGESCHLAGEN.`, `process.exit`). Pflichtfälle:

```js
const R = require('../esl_dienst_regeln.js');
const T = (j, m, d) => new Date(j, m - 1, d);
const t = Date.now();
pruefe('Di 27.10.: Monatsanfang', JSON.stringify(R.vortageBereich(T(2026,10,27))) === '{"von":"2026-10-01","bis":"2026-10-26"}');
pruefe('Do 01.10.: Woche reicht in den Vormonat', JSON.stringify(R.vortageBereich(T(2026,10,1))) === '{"von":"2026-09-28","bis":"2026-09-30"}');
pruefe('Mo 01.06.: nichts zu holen', R.vortageBereich(T(2026,6,1)) === null);
pruefe('Liga Runde 0/1/3', R.ligaFaellig(0,3) && !R.ligaFaellig(1,3) && R.ligaFaellig(3,3));
pruefe('Deckel: 3 in 30 Min', !R.anmeldungErlaubt([t-60e3, t-120e3, t-180e3], t));
pruefe('Deckel: alte zaehlen nicht', R.anmeldungErlaubt([t-31*60e3, t-60e3, t-120e3], t));
pruefe('401 ist tot', R.ligaAntwortArt({status:401, auszug:'', hatTabelle:false, zeilen:0}) === 'sitzung-tot');
pruefe('ORA vor Sitzung', R.ligaAntwortArt({status:200, auszug:'ORA-00936 login', hatTabelle:false, zeilen:0}) === 'ora');
pruefe('Tabelle ohne Zeilen ist leer', R.ligaAntwortArt({status:200, auszug:'', hatTabelle:true, zeilen:0}) === 'leer');
const z = R.ligaZusammenfuehren({ kabel:{rows:[{ccsId:'1',callCount:5}]}, mobile:{rows:[{ccsId:'1',callCount:9},{ccsId:'2',callCount:1}]}, um:{rows:null, art:'ora'} });
pruefe('Zusammenfuehren: max calls', z.payload.find(r => r.ccsId === '1').projekt === 'mobile' && z.payload.length === 2);
pruefe('Zusammenfuehren: fehlender Baum', z.vollstaendig === false && z.fehlend.join() === 'um');
const a = R.edgeArgumente({ port:9222, profil:'C:\\x\\EdgeProfil', cacheDir:'', extra:['--disable-features=HttpsUpgrades','--headless=new'], urls:['http://127.0.0.1:8787/'] });
pruefe('disable-features genau einmal, gemischt', a.filter(x => x.startsWith('--disable-features=')).length === 1 && /HttpsUpgrades/.test(a.join(' ')) && /CalculateNativeWinOcclusion/.test(a.join(' ')));
pruefe('kein Cache ohne Ordner, Adresse zuletzt, kein allow-origins', !a.some(x => /disk-cache/.test(x)) && a[a.length-1] === 'http://127.0.0.1:8787/' && !a.some(x => /remote-allow-origins|disable-popup-blocking/.test(x)));
pruefe('Flags nicht pruefbar', R.flagZustand(null).zustand === 'nicht-pruefbar');
pruefe('TL erkannt', R.prozessKonflikt([{ProcessId:9, Name:'node.exe', CommandLine:'node tl_dienst.js 8790 1'}], 1).art === 'tl');
pruefe('eigener Start ist kein alter Starter', R.prozessKonflikt([{ProcessId:9, Name:'cmd.exe', CommandLine:'cmd /c ESL_Dienst_Start.cmd'}], 1).art === null);
pruefe('Port fremd', R.portZustand(7, [{ProcessId:7, Name:'msedge.exe', CommandLine:'msedge --user-data-dir="D:\\anders"'}], 'C:\\x\\EdgeProfil') === 'fremd');
pruefe('Port nicht pruefbar', R.portZustand(7, [{ProcessId:7, Name:'msedge.exe', CommandLine:null}], 'C:\\x\\EdgeProfil') === 'nicht-pruefbar');
pruefe('Anfrage: falscher Host', !R.anfrageErlaubt({host:'localhost:8787', cookie:'rcDienst=g'}, 'g', 8787));
pruefe('Anfrage: Cookie unter mehreren', R.anfrageErlaubt({host:'127.0.0.1:8787', cookie:'a=1; rcDienst=g'}, 'g', 8787));
```

Dazu je Regel die übrigen Fälle aus der Interfaces-Liste (Sperre frei/belegt/Prozess tot, `einreihen` mit gleichem und mit anderem Bereich, `vortageFaellig` gleicher Tag / anderer Tag / Wiederholsperre, `flagZustand` erfüllt / fehlendes Flag / zwei `--disable-features`). **Gegenproben im Werkzeug:** eine nachgebaute „von = Montag“-Regel muss den 27.10. falsch liefern; eine naive Verkettung von `extra` muss zwei `--disable-features` ergeben.

- [ ] **Step 2: Ausführen, erwartet Abbruch** – `node pruefwerkzeuge/dienst_regeln_pruefen.js` → `Cannot find module '../esl_dienst_regeln.js'`.
- [ ] **Step 3: `esl_dienst_regeln.js` schreiben** – reine Funktionen, keine Ein-/Ausgabe, Signaturen wie oben.
- [ ] **Step 4: Ausführen** – erwartet `ALLE … PRUEFUNGEN BESTANDEN.`; `node --check esl_dienst_regeln.js`.
- [ ] **Step 5: Commit** – `git add esl_dienst_regeln.js pruefwerkzeuge/dienst_regeln_pruefen.js` · `git commit -m "Datendienst: reine Regeln mit Pruefwerkzeug"`

---

### Task 2: Seiten-Bündel aus v22 und kpi_crawler.js

**Files:**
- Create: `esl_dienst_buendel.js`
- Test: `pruefwerkzeuge/dienst_buendel_pruefen.js`

**Interfaces:**
- Produces:
  - `schneideFunktion(src, kopf) -> string` (Klammerzählung wie `schneide` in `pruefwerkzeuge/_stack_regel.js`; fehlt `kopf`: `Error('Funktion fehlt: ' + kopf)`; jedes Stück mit `new Function` auf Syntax geprüft, sonst Fehler mit Namen)
  - `schneideAbschnitt(src, von, bis) -> string`
  - `ESL_FUNKTIONEN` = Köpfe `function rcJq(`, `function rcLeerlaufZurueck(`, `function rcPasswortSichtbar(`, `function rcFilterKnopf(`, `function rcProjektVonPfad(`, `function rcExportKnopfFinden(`, `function rcSuchAntwort(`, `function rcViewAbgelaufen(`, `function rcAnmeldeSeite(`, `async function rcRahmenExport(`
  - `eslBuendel(v22Src) -> string`: IIFE, setzt `window.__rcDienstEsl = { rcRahmenExport, rcFilterKnopf, rcProjektVonPfad, rcLeerlaufZurueck, rcPasswortSichtbar, rcAnmeldeSeite, version }`; tut nichts, wenn dieselbe `version` schon steht. `version` = erste 8 Zeichen SHA-1 des Bündeltexts.
  - `ligaBuendel(kpiSrc) -> string`: IIFE aus Abschnitt `function cleanText(` bis `// ---------- Tages-Historie`, Abschnitt `const RC_LOC_ALLE` bis `function baueAbfrage(`, Funktionen `snapshotOf`, `extractTableHtml`, `baueAbfrage`; setzt `window.__rcDienstLiga = { parseKpiTable, extractTableHtml, snapshotOf, datumKey, baueAbfrage, RC_ABFRAGEN, RC_FIGURES, RC_LOC_ALLE, version }`.
  - `offeneNamen(code, definiert: string[]) -> string[]` (aufgerufene `rc[A-Z]\w*` und `pad2`, die im Bündel nicht definiert sind)

- [ ] **Step 1: Prüfwerkzeug schreiben.** Ausführen im `vm`-Kontext mit `window`-Stub (`vm.createContext({window:w, console})`, `w.window = w`):

```js
const B = require('../esl_dienst_buendel.js');
const esl = B.eslBuendel(fs.readFileSync(v22, 'utf8'));
const w = {}; vm.runInContext(esl, ctx(w));
pruefe('ESL: Export-Funktion da', typeof w.__rcDienstEsl.rcRahmenExport === 'function');
pruefe('ESL: UM-Pfad mit %20', w.__rcDienstEsl.rcProjektVonPfad('/Agents/secure%20/sis_vodafone_um.xhtml') === 'um');
pruefe('ESL: Anmeldeseite', w.__rcDienstEsl.rcAnmeldeSeite('<input type=password>') === true);
pruefe('ESL: geschlossen', B.offeneNamen(esl, []).length === 0);
const liga = B.ligaBuendel(fs.readFileSync(kpi, 'utf8'));
const w2 = {}; vm.runInContext(liga, ctx(w2)); vm.runInContext(liga, ctx(w2));   // zweimal: IIFE, kein const-Fehler
pruefe('Liga: Mobile-Baum', w2.__rcDienstLiga.RC_ABFRAGEN.mobile.nodes === '11317,11229');
pruefe('Liga: datumKey braucht pad2', w2.__rcDienstLiga.datumKey('2026/10/7') === '2026-10-07');
w2.__rcLastGetData = { body: 'user_id=u1&script_id=11035&script_id_secure=S' };
const q = w2.__rcDienstLiga.baueAbfrage('um', 'user_defined', 'day', { startdate:'20261001', enddate:'20261026' });
pruefe('Liga: Abfrage UM', q.get('nodeid_inlist') === '12090' && q.get('startdate') === '20261001' && q.get('loc_inlist') === w2.__rcDienstLiga.RC_LOC_ALLE);
pruefe('Liga: snapshotOf', w2.__rcDienstLiga.snapshotOf([{ccsId:'7', standort:'Alanya', callCount:12}]).byAgent['7'].c === 12);
```

**Gegenprobe:** Bündel ohne `function rcJq(` gebaut → `offeneNamen` enthält `rcJq`. Fehlender Kopf → `schneideFunktion` wirft mit dem Kopf im Text.
- [ ] **Step 2: Ausführen, erwartet Abbruch** (Modul fehlt).
- [ ] **Step 3: `esl_dienst_buendel.js` schreiben.**
- [ ] **Step 4: Ausführen** – erwartet grün; `node --check esl_dienst_buendel.js`.
- [ ] **Step 5: Commit** – `git add esl_dienst_buendel.js pruefwerkzeuge/dienst_buendel_pruefen.js` · `git commit -m "Datendienst: Seiten-Buendel aus v22 und kpi_crawler"`

---

### Task 3: CDP und Edge

**Files:**
- Create: `esl_dienst_cdp.js`, `esl_dienst_edge.js`
- Create: `pruefwerkzeuge/dienst_messen.mjs` (Messgerät, heißt bewusst nicht `*_pruefen.js`; Aufbau wie `fehlerseite_messen.mjs`: Wegwerf-Profil, `--disable-sync`, `--headless=new`, räumt Edge per `taskkill /T /F` und das Profil selbst ab; Argument `fall=<name>`; Ausgabe `MESSUNG fall=<name>: n von m OK`)

**Interfaces:**
- Consumes: `edgeArgumente`, `flagZustand`, `portZustand` (Task 1).
- Produces (`esl_dienst_cdp.js`):
  - `cdpListe(port) -> Promise<target[]|null>` (GET `/json`, Frist 2500 ms)
  - `cdpBrowserWs(port) -> Promise<string|null>` (GET `/json/version`)
  - `seitenTabs(liste) -> target[]` (nur `type === 'page'` und `^https?://`)
  - `mitSitzung(wsUrl, fn, fristMs) -> Promise` mit `s.befehl(method, params, fristMs = 15000)`, `s.auswerten(ausdruck, fristMs = 15000)` (`returnByValue`, `awaitPromise`; Ausnahme wird `Error`), `s.seite(fn, arg, fristMs)` (sendet `'(' + fn + ')(' + JSON.stringify(arg) + ')'`)
  - `neuerTab(port, url) -> Promise<targetId>` (`Target.createTarget` über die Browser-Verbindung)
  - `tabSchliessen(port, targetId) -> Promise<bool>`
  - `echterKlick(s, x, y)`, `taste(s, key)` (`Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`)
  - `cookieSetzen(port, {name, value, url}) -> Promise<bool>` (`Storage.setCookies`, `httpOnly:true`, `sameSite:'Strict'`)
- Produces (`esl_dienst_edge.js`):
  - `edgeFinden() -> string|null` (drei Pfade wie `findEdgeBinary` im alten APITool-Server)
  - `cacheOrdner(profilName) -> string` (`%LOCALAPPDATA%\regiocom_ESL_Cache\<profilName>`, Schreibprobe `.schreibprobe` schreiben und löschen, sonst `''`)
  - `edgeStarten(exe, args) -> number` (pid; `spawn` detached, `stdio:'ignore'`, `unref`)
  - `prozesseLesen() -> Promise<{ProcessId, Name, CommandLine}[]|null>` (PowerShell `Get-CimInstance Win32_Process` für `msedge.exe`, `node.exe`, `cmd.exe`, `powershell.exe`, `ConvertTo-Json -Compress`, Frist 20 s, Fehler → `null`)
  - `portBesitzer(port) -> Promise<number|null>` (`Get-NetTCPConnection -LocalPort <port> -State Listen`)
  - `profilBelegt(profil) -> bool` (`fs.openSync(<profil>\lockfile, 'r+')` wirft `EBUSY`/`EPERM` → belegt)

- [ ] **Step 1: Messfall `fall=edge` schreiben.** Kleiner Hilfs-HTTP-Server auf einem freien Port, der den Cookie-Kopf zurückgibt. Prüft: Edge startet mit `edgeArgumente` und Zusatz `--headless=new --disable-sync`; `cdpListe` antwortet in ≤ 10 s; `portZustand(await portBesitzer(port), await prozesseLesen(), profil) === 'eigen'`; `flagZustand` der Edge-Kommandozeile `'erfuellt'`; `cookieSetzen` und danach `neuerTab` auf den Hilfsserver → Server sieht `rcDienst=<wert>`, `document.cookie` in der Seite enthält es nicht; `auswerten('1+1') === 2`; `auswerten('new Promise(()=>{})', 1000)` scheitert in ≤ 2 s; `tabSchliessen` liefert `true`.
- [ ] **Step 2: Ausführen, erwartet Abbruch** (Module fehlen).
- [ ] **Step 3: Beide Module schreiben.** `mitSitzung` übernimmt das Grundgerüst aus `withCdpSession` (`esl_apitool_server.js:360-448`), jeder Befehl mit eigener Frist.
- [ ] **Step 4: Ausführen** – `node pruefwerkzeuge/dienst_messen.mjs fall=edge` → `MESSUNG fall=edge: 7 von 7 OK`.
- [ ] **Step 5: Commit** – `git add esl_dienst_cdp.js esl_dienst_edge.js pruefwerkzeuge/dienst_messen.mjs` · `git commit -m "Datendienst: CDP- und Edge-Bausteine mit Messgeraet"`

---

### Task 4: Schein-Portale für die Messungen

**Files:**
- Modify: `pruefwerkzeuge/esl_schein_server.js`
- Create: `pruefwerkzeuge/liga_schein_server.js` (Port 8414, `PORT` überschreibbar)
- Modify: `.claude/launch.json` (Eintrag `liga-schein`, Port 8414)

**Interfaces:**
- Produces (Schein-ESL, zusätzlich zum heutigen Verhalten, das unverändert bleibt):
  - Umgebungsvariable `TAGE` (Vorgabe 1): Daten für heute und `TAGE` Vortage; ab dem zweiten Vortag nur die ersten 80 Zeilen je Projekt.
  - `GET /Agents/login_esl.xhtml`: Formular mit `loginform:user`, `loginform:pw` (Passwortfeld), `loginform:btnLogin`, `loginform:msgs`. Felder leer; das Seitenskript füllt beide erst beim ersten `pointerdown` mit `event.isTrusted` (bildet die Autofill-Freigabe von Edge nach). `POST` mit beiden Werten → angemeldet, 302 auf `main.xhtml`.
  - Steuerung: `aktion=abmelden` (alle `/Agents/secure/*` → 302 Anmeldung), `aktion=ohneautofill&an=1|0` (Felder bleiben leer), `aktion=gestern&an=1|0` (neue Seiten stehen auf gestern); `aktion=zustand` liefert zusätzlich `angemeldet` und `anmeldungen`.
- Produces (Schein-Ligaliste):
  - `GET …/LIGA_LISTEN_NEW/dist/liga_listen.rb?script_id=11035`: Seite mit `#script_id_secure` (`SCHEIN`), `#user_id` (`u1`), leerer `table#result-table`.
  - `POST …/dist/scripts/get_data.rb`: falsches Token → 200 mit „keine Berechtigung“. Baum aus `nodeid_inlist` (`11405`/`11317,11229`/`12090`, sonst leere Tabelle). Zeilen aus `Test Excels/ligalisten.xls` (Blatt mit `Agentenname`), nach Zeilennummer modulo 3 auf die Projekte verteilt; Kopf wie im echten Export (Gruppenzeile mit `colspan`, Leaf-Zeile). Bei `interval=day` je Tag von `startdate` bis `enddate` ein Block mit vorangestellter Leaf-Spalte `Datum` (Wert `YYYY/MM/DD`).
  - Steuerung `/__steuer?aktion=`: `tot` (nächste Abfragen 401, bis `aktion=lebt`), `ora&p=um` (nur dieser Baum liefert `ORA-00936` ohne Tabelle), `ms&an=1` (Liga-Seite leitet auf `http://login.microsoftonline.com:<port>/__ms` um: `#i0116`, Passwortfeld (gefüllt erst nach echtem `pointerdown`), `#idSIButton9`; danach „Angemeldet bleiben?“ mit `#idBtn_Back`; dann zurück), `zustand`.
- [ ] **Step 1: Schein-ESL erweitern.**
- [ ] **Step 2: Schein-Ligaliste schreiben.**
- [ ] **Step 3: Prüfen** – beide Server starten (`TAGE=10 node pruefwerkzeuge/esl_schein_server.js`, `node pruefwerkzeuge/liga_schein_server.js`), dann:
  - `curl -s "http://127.0.0.1:8413/esl/steuer?aktion=zustand"` → JSON mit `"angemeldet":true`
  - `curl -s "http://127.0.0.1:8413/esl/steuer?aktion=abmelden"`; danach `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://127.0.0.1:8413/Agents/secure/main.xhtml` → `302 …login_esl.xhtml`
  - `curl -s -X POST --data "script_id_secure=SCHEIN&nodeid_inlist=12090&interval=cumulate" http://127.0.0.1:8414/cgi-bin/AGENTEN_KENNZAHLEN_2/LIGA_LISTEN_NEW/dist/scripts/get_data.rb | grep -c "<tr"` → > 2
  - dasselbe mit `interval=day&startdate=20261020&enddate=20261022` → Ausgabe enthält `2026/10/20`, `2026/10/21` und `2026/10/22`
  - ohne `TAGE` und ohne neue Steuer-Aktionen verhält sich das Schein-ESL wie vorher: Projektseite ohne Umleitung, Daten nur heute und gestern.
- [ ] **Step 4: Commit** – `git add pruefwerkzeuge/esl_schein_server.js pruefwerkzeuge/liga_schein_server.js .claude/launch.json` · `git commit -m "Schein-Portale: Anmeldung, Vortage, Liga-Attrappe"`

---

### Task 5: ESL-Abruf im Dienst

**Files:**
- Create: `esl_dienst_esl.js`
- Modify: `pruefwerkzeuge/dienst_messen.mjs` (Fall `esl`)

**Interfaces:**
- Consumes: `mitSitzung`, `echterKlick` (Task 3); `eslBuendel` (Task 2); `anmeldungErlaubt`, `fehlerseiteNeuladen`, `datumIso`, `isoZuDe` (Task 1).
- Produces:
  - `ESL_PFADE = { anmeldung:'/Agents/login_esl.xhtml', haupt:'/Agents/secure/main.xhtml' }`
  - `MENUE = { kabel:'vodafone kabel', mobile:'vodafone mobile', um:'vodafone um' }` (exakter, kleingeschriebener Eintragstext)
  - `eslZustand(s) -> {href, fehlerseite, fehlerCode, anmeldung, kaputt, abgelaufen, projekt, filterForm, menue, datumHeute}` (`abgelaufen` = `#viewExpiredDialog` sichtbar; `anmeldung` = sichtbares Passwortfeld ohne `frmMainMenu`)
  - `eslAnmelden(s, merk, jetzt) -> 'abgeschickt'|'kein-passwort'|'keine-maske'|'gedeckelt'|'laedt'` – Ablauf wie `EinAnmeldeVersuch` (`ESL_Start.cmd:1180-1229`): Feld-Lage per `getBoundingClientRect` (Mitte), `kaputt` → `Page.navigate` gleiche Adresse und `'laedt'`, echter Klick auf neutrale Stelle (`elementFromPoint`-Raster ohne Eingabe, Knopf, Link), bis 5 s warten, bis Benutzer und Passwort Länge > 0 haben, dann echter Klick auf `loginform:btnLogin`; `merk.zeiten` bekommt den Zeitpunkt nur bei `'abgeschickt'`
  - `eslBereit(s, projekt, fristMs = 60000) -> {ok, grund}` – Schrittmaschine wie `navCheck` im alten APITool-Server (`esl_apitool_server.js:550-612`): Menüeintrag nur, wenn die Seite zu einem anderen Projekt gehört; Reiter „Projektergebnisse“; Statistik „Export Projektergebnisse“; bis `filterForm` steht. Bewirkt ein Menü-Klick nach 5 s nichts, wird `frmMainMenu:mainMenu` geöffnet und erneut geklickt. Steht die Seite weder auf Anmeldung noch auf Menü noch auf einer Projektseite (etwa `login_esl.xhtml` bei stehender Sitzung), folgt `Page.navigate(haupt)`. Schritt je 1 s.
  - `eslExport(s) -> {art, b64?, status?, grund?}` – ruft in der Seite `__rcDienstEsl.rcRahmenExport({contentWindow:window, contentDocument:document})`; `buf` wird in der Seite zu Base64
  - `eslBereichExport(s, projekt, von, bis) -> {art, b64?, grund?}` – `eslBereit`; Datumsfelder (die ersten zwei `input.hasDatepicker, .ui-calendar input` im `filterForm`) auf `isoZuDe(von)`/`isoZuDe(bis)`; echter Klick auf `rcFilterKnopf(form)` (vorher `scrollIntoView({block:'center'})`); warten, bis das alte `filterForm` aus dem DOM ist (≤ 15 s); `eslExport`; danach `Page.navigate(haupt)` und `eslBereit`
  - `eslPflege(s, name = 'rc_wach_dienst_esl')` – Web Lock mit Marke `window.__rcWachLock` (nie zurückgegeben), `__rcDienstEsl.rcLeerlaufZurueck(window)`
  - `eslRunde(s, projekt, merk) -> {art, b64?, grund?, zeit}` – Reihenfolge: Zustand; Fehlerseite → `fehlerseiteNeuladen` → `Page.reload`; abgelaufen → `Page.navigate(haupt)`; Anmeldung → `eslAnmelden`; Bündel einspielen (wenn `version` fehlt); `datumHeute === false` → `Page.navigate(haupt)`; `eslBereit`; `eslExport`; `eslPflege`. Jeder Ausstieg vor dem Export liefert `{art:'fehler', grund}` mit lesbarem Grund (z. B. `'ESL-Anmeldung abgeschickt'`, `'Kennwort im Edge-Profil nicht hinterlegt'`, `'Anmeldung gedeckelt (3 in 30 Min)'`).

- [ ] **Step 1: Messfall `fall=esl` schreiben.** Schein-ESL mit `TAGE=10` als Kindprozess; Edge mit `--host-resolver-rules=MAP esl.regiocom.net 127.0.0.1` und `--unsafely-treat-insecure-origin-as-secure=http://esl.regiocom.net:8413` (für Web Locks); Basis `http://esl.regiocom.net:8413`. Prüft:
  1. abgemeldet: erste `eslRunde('kabel')` → `grund` nennt die Anmeldung, Schein zählt `anmeldungen` 1; nächste → `art 'excel'`, Base64 beginnt mit `UEs` (PK).
  2. `eslRunde('mobile')` → `excel`; Schein `sitzung === 'mobile'`.
  3. `aktion=ablauf` → spätestens die dritte `eslRunde('mobile')` liefert wieder `excel`.
  4. `aktion=leer&p=kabel&an=1` → `eslRunde('kabel')` → `art 'leer'`.
  5. `aktion=ohneautofill&an=1` + abmelden → `eslAnmelden` → `'kein-passwort'`, `anmeldungen` unverändert; `merk.zeiten` mit drei frischen Zeiten → `'gedeckelt'`.
  6. `aktion=gestern&an=1`, Tab neu laden → `eslRunde` liefert `excel`, alle Zeilen tragen heutiges Datum.
  7. `eslBereichExport('kabel', heute-5, gestern)` → alle Zeilen im Bereich, mindestens 5 verschiedene Tage; danach `eslZustand().datumHeute === true`.
  8. `navigator.locks.query()` in der Seite enthält einen gehaltenen Lock `rc_wach_dienst_esl`.
  9. Schein-ESL beenden → `eslZustand().fehlerseite === true` nach Neuladen; Server nach 25 s wieder starten; die nächste `eslRunde` nach ≥ 20 s lädt neu und liefert `excel`.
- [ ] **Step 2: Ausführen, erwartet Abbruch** (Modul fehlt).
- [ ] **Step 3: `esl_dienst_esl.js` schreiben.** Seitenfunktionen als echte JS-Funktionen im Modul (von `node --check` erfasst), übergeben mit `s.seite(fn, arg)`.
- [ ] **Step 4: Ausführen** – `node pruefwerkzeuge/dienst_messen.mjs fall=esl` → `9 von 9 OK`.
- [ ] **Step 5: Commit** – `git add esl_dienst_esl.js pruefwerkzeuge/dienst_messen.mjs` · `git commit -m "Datendienst: ESL-Abruf mit Anmeldung, Projektwechsel, Bereich und Heilung"`

---

### Task 6: Liga-Abruf im Dienst

**Files:**
- Create: `esl_dienst_liga.js`
- Modify: `pruefwerkzeuge/dienst_messen.mjs` (Fall `liga`)

**Interfaces:**
- Consumes: Task 3 (`mitSitzung`, `echterKlick`, `taste`), Task 2 (`ligaBuendel`), Task 1 (`ligaAntwortArt`, `fehlerseiteNeuladen`, `isoZuYmd`).
- Produces:
  - `LIGA_PFAD = '/cgi-bin/AGENTEN_KENNZAHLEN_2/LIGA_LISTEN_NEW/dist/liga_listen.rb?script_id=11035'`, `GET_DATA_PFAD = '/cgi-bin/AGENTEN_KENNZAHLEN_2/LIGA_LISTEN_NEW/dist/scripts/get_data.rb'`
  - `ligaZustand(s) -> {href, fehlerseite, fehlerCode, ms: object|null, token: bool}` (`ms` nach `MsZustand`, `ESL_Start.cmd:2333-2395`: Masken `'E-Mail'`, `'Passwort'`, `'Angemeldet bleiben?'`, `'Authenticator-Bestaetigung'`)
  - `ligaMsHilfe(s, merk) -> 'kmsi'|'freigabe'|'absenden'|'vorschlag'|''` (Regeln aus `HilfMsAnmeldung`, `ESL_Start.cmd:2408-2484`: kein Eingriff bei echtem Tippen in den letzten 5 s; `absenden` höchstens 2 je Tab; `vorschlag` einmal: Klick ins Mailfeld, `ArrowDown`, `Enter`)
  - `ligaAbfrage(s, {projekt, daterange, interval, startdate, enddate, figuren}) -> {art, rows?, status?, grund?}` – in der Seite: `__rcLastGetData = {body}` aus `#user_id`/`#script_id_secure`; `__rcDienstLiga.baueAbfrage(...)`; bei `figuren` wird `figure_list` ersetzt; `fetch` mit `AbortController` (90 s); Rückgabe `{status, auszug (≤ 4000 Zeichen), hatTabelle, zeilen, rows}`; Einordnung in Node mit `ligaAntwortArt`
  - `ligaLive(s) -> {kabel, mobile, um}` (je Baum `{art, rows, zeit, grund}`; nacheinander, `intraday`/`cumulate`, `RC_FIGURES`)
  - `ligaBereich(s, projekt, von, bis) -> {art, tage: {iso: snapshot}, grund}` – `user_defined`, `day`, `isoZuYmd`, Figuren `10004,10006`; Zeilen nach `datumKey(datum)` gruppiert; je Tag `snapshotOf(rows)` mit zusätzlichem Feld `nurCalls: true`
  - `ligaPflege(s)` (Web Lock `rc_wach_dienst_liga`)
  - `ligaRunde(s, merk) -> {jeBaum|null, grund, ersetzen}` – Fehlerseite → neu laden nach 20 s; MS-Maske → `ligaMsHilfe`; kein Token → `grund`; Bündel einspielen; `ligaLive`; ein Baum `sitzung-tot` → `ersetzen: true`

- [ ] **Step 1: Messfall `fall=liga` schreiben** (Schein-Ligaliste, `MAP ccs.vodafone.de 127.0.0.1`, `MAP login.microsoftonline.com 127.0.0.1`, unsicherer Ursprung als sicher für beide). Prüft:
  1. `ligaRunde` → alle drei Bäume `ok`, Summe der Zeilen = Agentenzahl der Testdatei.
  2. `aktion=ora&p=um` → `um.art === 'ora'`, die anderen `ok`; `ligaZusammenfuehren` → `vollstaendig false`, `fehlend ['um']`.
  3. `aktion=tot` → `ersetzen === true`; nach `tabSchliessen` + `neuerTab` und `aktion=lebt` → wieder `ok`.
  4. `aktion=ms&an=1`, Tab neu → spätestens nach 6 `ligaRunde`-Aufrufen steht das Token, und der Schein zählt genau eine Absendung.
  5. `ligaBereich(s, 'kabel', heute-3, gestern)` → 3 Tage, jeder Snapshot `nurCalls === true`, `byAgent` mit `c > 0`, kein Feld `cs`.
  6. Server aus, 25 s, wieder an → `fehlerseite` erkannt, danach `ok`.
- [ ] **Step 2: Ausführen, erwartet Abbruch.**
- [ ] **Step 3: `esl_dienst_liga.js` schreiben.**
- [ ] **Step 4: Ausführen** – `node pruefwerkzeuge/dienst_messen.mjs fall=liga` → `6 von 6 OK`.
- [ ] **Step 5: Commit** – `git add esl_dienst_liga.js pruefwerkzeuge/dienst_messen.mjs` · `git commit -m "Datendienst: Liga-Abruf je Baum, Microsoft-Anmeldung, Vortage"`

---

### Task 7: Dienst-Kern

**Files:**
- Create: `esl_dienst.js`
- Delete: `esl_apitool_server.js` (`git rm`)
- Modify: `.gitignore` (`Dienst_Daten/`, `esl_dienst.log*`, `esl_dienst.lock`)
- Modify: `pruefwerkzeuge/dienst_messen.mjs` (Fall `dienst`)

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces:
  - Umgebung: `ESL_DIENST_PORT` (8787), `ESL_DIENST_CDP` (9222), `ESL_DIENST_ESL_BASIS` (`https://esl.regiocom.net`), `ESL_DIENST_CCS_BASIS` (`https://ccs.vodafone.de`), `ESL_DIENST_PROFIL` (`<Ordner>\EdgeProfil`), `ESL_DIENST_DATEN` (`<Ordner>\Dienst_Daten`), `ESL_DIENST_EDGE_EXTRA` (JSON-Liste), `ESL_DIENST_TAKT_SEK` (20), `ESL_DIENST_LIGA_JEDE` (3).
  - Startprüfung, in dieser Reihenfolge, jede mit Klartext und Exit-Code 2: Sperre `esl_dienst.lock` (`sperreFrei`); `prozessKonflikt` (TL → nicht starten; alter Starter → nicht starten; nicht prüfbar → Warnung, weiter); Port belegt und `portZustand` `fremd` → nicht starten; Port frei, aber `profilBelegt` → nicht starten („Edge läuft mit diesem Profil ohne Fernsteuerung“). Läuft das eigene Edge schon: `flagZustand` ins Log (drei Zustände).
  - Sperrdatei `{pid, port, lebenszeichen}`, atomar (`.tmp` + `rename`), alle 30 s.
  - Geheimnis: `crypto.randomBytes(24).toString('hex')` je Start; `cookieSetzen` bei jedem Start und nach jedem Edge-Neustart.
  - Der Autopilot (`esl_autopilot.user.js`) wird nie eingespielt, auch nicht als Hilfe: er würde auf Kabel zurückklicken.
  - Edge sicherstellen: kein `/json` → `edgeStarten` (höchstens alle 120 s) und bis 20 s warten; drei Tabs (Dashboard `http://127.0.0.1:<port>/`, ESL `<ESL_BASIS>/Agents/login_esl.xhtml`, Liga `<CCS_BASIS><LIGA_PFAD>`) über `seitenTabs` finden, fehlende per `neuerTab`; gemerkte Target-Ids; bei mehreren ESL-Tabs wird nur der gemerkte betreut.
  - Warteschlange: ein Arbeiter, Aufträge `{art:'runde', liga?:bool, projekt?}`, `{art:'abruf', projekt}`, `{art:'bereich', von, bis, projekte, quelle:'vortage'|'nutzer'}`; `einreihen` entdoppelt; der Takt reiht alle `TAKT_SEK` eine `runde` ein, wenn keine wartet.
  - Runde: Edge sicherstellen → ESL des aktiven Projekts (`eslRunde`) → wenn `ligaFaellig(rundeNr, LIGA_JEDE)` oder `liga:true`: `ligaRunde` (bei `ersetzen` und `ligaErsatzErlaubt`: Tab schließen und neu anlegen) → Stand schreiben. Vor der Runde: `vortageFaellig` → Auftrag `bereich` (alle drei Projekte, `vortageBereich(heute)`) einreihen.
  - Stand `Dienst_Daten/stand.json` (atomar), Nummern überleben einen Neustart:

```json
{ "nr": 0, "aktiv": "kabel",
  "dienst": { "start": 0, "edge": "eigen|neu gestartet|…", "flags": { "zustand": "", "fehlt": [] } },
  "esl":   { "kabel": { "nr": 0, "zeit": 0, "art": "excel|leer|fehler|abgelaufen|html|kein-form|kein-export|http|anmeldung", "status": null, "grund": "", "bytes": 0 } },
  "liga":  { "nr": 0, "zeit": 0, "versuch": 0, "art": "ok|teil|fehler", "grund": "", "vollstaendig": false,
             "jeBaum": { "kabel": { "zeit": 0, "art": "", "n": 0, "grund": "" } } },
  "vortage": { "kabel": { "nr": 0, "zeit": 0, "von": "", "bis": "", "esl": { "art": "", "grund": "" }, "liga": { "art": "", "tage": 0, "grund": "" } } },
  "ereignisse": [ { "nr": 0, "zeit": 0, "art": "E|W", "text": "" } ] }
```

  `liga.zeit` = Zeitpunkt der letzten erfolgreichen Lieferung, `versuch` = letzter Versuch. Dateien daneben: `esl_<p>.xlsx`, `liga.json` (`{zeit, vollstaendig, payload}`), `vortage_<p>.xlsx`, `vortage_<p>_liga.json`. Ereignisse: Ring 50.
  - HTTP (jede Anfrage über `anfrageErlaubt`, sonst 403 mit Text „Nur über ESL_Dienst_Start.cmd erreichbar“; `Cache-Control: no-store`):
    - `GET /` → `ESL_Live_Arena.html` (fehlt sie: kurze Seite „Datendienst läuft“), `GET /esl_live_arena_v22.js`, `GET /regiocom.png` (wenn vorhanden)
    - `GET /api/stand`, `GET /api/esl/<p>.xlsx`, `GET /api/liga.json`, `GET /api/vortage/<p>.xlsx`, `GET /api/vortage/<p>.liga.json`
    - `GET /api/mapping.xlsx` (`Mitarbeiter_IDS_Final_komplett.xlsx`; fehlt oder gesperrt → 503 mit Grund im Text)
    - `POST /api/runde {projekt?}` (setzt `aktiv`, reiht `runde` mit `liga:true` ein, wartet ≤ 150 s) → `{ok, nr, esl, liga}`
    - `POST /api/abruf {projekt}` (≤ 150 s) → `{ok, nr, grund}` mit `nr` = `stand.esl[projekt].nr` nach dem Abruf
    - `POST /api/bereich {von, bis, projekte}` (≤ 900 s) → `{ok, projekte: {p: {nr, esl, liga}}}`
    - `POST /api/projekt {projekt}` → sofort `{ok}`; die nächste Runde nutzt es
    - sonst 404; keine Ordner-Auslieferung
  - Protokoll `esl_dienst.log`, ab 2 MB nach `esl_dienst.log.1`; jede Zeile mit Uhrzeit; Ereignisse zusätzlich im Stand.

- [ ] **Step 1: Messfall `fall=dienst` schreiben.** Startet beide Schein-Portale, dann `node esl_dienst.js` als Kindprozess (Testports 8797/9232, Wegwerf-Profil und -Datenordner, `ESL_DIENST_TAKT_SEK=5`, Edge-Zusätze headless). Anfragen mit Cookie laufen per `fetch` aus dem Dashboard-Tab. Prüft:
  1. Zweiter Start mit demselben Datenordner endet mit Code 2 und „laeuft bereits“.
  2. `curl` ohne Cookie → 403; `fetch('/api/stand')` aus dem Dashboard-Tab → 200.
  3. Nach ≤ 60 s: `esl.kabel.art === 'excel'`, `liga.art === 'ok'`, `liga.nr` = Anzahl Runden mit `rundeNr % 3 === 0`.
  4. Im Log steht in jeder Runde mit Liga die ESL-Zeile vor der Liga-Zeile.
  5. `POST /api/runde {projekt:'mobile'}` → `ok`, danach `aktiv === 'mobile'`, `esl.mobile.art === 'excel'`.
  6. Dienst beenden und neu starten → `nr` ≥ vorher; `/api/esl/kabel.xlsx` sofort mit PK.
  7. Weder Log noch `stand.json` enthalten das Geheimnis oder `SCHEIN`.
  8. Edge per `taskkill` beenden → in ≤ 150 s wieder da, drei Tabs, Dashboard-Tab bekommt `/api/stand` mit 200.
  9. `Mitarbeiter_IDS_Final_komplett.xlsx` im Testordner fehlt → `/api/mapping.xlsx` → 503 mit Grund.
- [ ] **Step 2: Ausführen, erwartet Abbruch.**
- [ ] **Step 3: `esl_dienst.js` schreiben; `git rm esl_apitool_server.js`; `.gitignore` ergänzen.**
- [ ] **Step 4: Ausführen** – `node pruefwerkzeuge/dienst_messen.mjs fall=dienst` → `9 von 9 OK`; `node pruefwerkzeuge/dienst_regeln_pruefen.js` grün.
- [ ] **Step 5: Commit** – `git add esl_dienst.js .gitignore pruefwerkzeuge/dienst_messen.mjs` · `git commit -m "Datendienst: Kern mit Warteschlange, Stand, Schnittstelle und Startpruefung"`

---

### Task 8: Vortage und Zeiträume im Dienst

**Files:**
- Modify: `esl_dienst.js` (Auftrag `bereich`)
- Modify: `pruefwerkzeuge/dienst_messen.mjs` (Fall `bereich`)

**Interfaces:**
- Consumes: `eslBereichExport` (Task 5), `ligaBereich` (Task 6), `vortageBereich`/`vortageFaellig` (Task 1).
- Produces: Auftrag `bereich` – je Projekt nacheinander: `eslBereichExport` → `vortage_<p>.xlsx`; `ligaBereich` → `vortage_<p>_liga.json`; `stand.vortage[p]` mit neuer `nr`. Danach steht die ESL-Seite wieder auf heute; die nächste Runde fährt zum aktiven Projekt. Tägliche Vortage merken `{tag, versuchUm}` im Stand; als erledigt gilt der Tag erst, wenn alle drei Projekte ESL `excel` oder `leer` geliefert haben.

- [ ] **Step 1: Messfall `fall=bereich`** (Schein-ESL `TAGE=10`). Prüft: nach Start in ≤ 5 Min `vortage.kabel/mobile/um.esl.art === 'excel'` und `liga.tage` = Zahl der Tage in `vortageBereich(heute)`; danach `eslZustand().datumHeute` und `esl[aktiv].art === 'excel'`; `POST /api/bereich {von: heute-3, bis: gestern, projekte:['um']}` → `vortage.um.von === heute-3`, Datei mit genau diesen Tagen; Schein-ESL zählt keine zweite Anmeldung.
- [ ] **Step 2: Ausführen, erwartet FEHL.**
- [ ] **Step 3: Auftrag `bereich` und tägliche Einplanung schreiben.**
- [ ] **Step 4: Ausführen** → `fall=bereich` grün; `fall=dienst` weiter grün.
- [ ] **Step 5: Commit** – `git add esl_dienst.js pruefwerkzeuge/dienst_messen.mjs` · `git commit -m "Datendienst: Vortage und Zeitraeume je Projekt"` (kein `-a`: der Arbeitsbaum trägt fremde Änderungen)

---

### Task 9: Schalter und Weiterleitung in v22

**Files:**
- Modify: `esl_live_arena_v22.js`
- Test: `pruefwerkzeuge/dienst_schalter_pruefen.js`

**Interfaces:**
- Consumes: Schnittstelle aus Task 7 (`/api/abruf`, `/api/runde`, `/api/bereich`, `/api/projekt`).
- Produces (alle als Funktionsdeklaration in der IIFE):
  - `rcDienstModus() -> bool` = `!!(window.__rcDienst && window.__rcDienst.basis)` (neben `rcProjektErkennen`, ~Z. 230)
  - `rcDienstAnfrage(pfad, daten, fristMs) -> Promise<object>` (POST JSON an `__rcDienst.basis + pfad`, `credentials:'same-origin'`, `AbortController`; Fehler → `{ok:false, grund}`)
  - `rcDienstWarteAuf(pruef: () => bool, fristMs) -> Promise<bool>` (alle 250 ms)
  - `rcDienstAbruf(key) -> Promise<{ok, zeilen?, pruefung?, text?, grund?}>` – `/api/abruf` (Frist 160 s), dann warten (10 s), bis `window.rcDienstGesehen.esl[key] >= nr`; Ergebnis aus `window.rcDienstErgebnis[key].r`
  - `rcDienstRunde() -> Promise<{liga:{ok, agenten?, error?}, esl:{ok, error?}}>` – `/api/runde {projekt: rcAktivProjekt}` (160 s), dann warten, bis die gemeldete Nummer eingespeist ist
  - `rcDienstBereich(von, bis, projekte) -> Promise<{ok, projekte, text}>` – `/api/bereich` (910 s), dann warten, bis jede gemeldete `vortage[p].nr` eingespeist ist
  - `rcProjektLieferung(key, e) -> {ok, …}` – der Block aus `rcProjektAbruf` ab `if (e.art === 'anmeldung')` bis zum letzten `return rcProjektFehlschlag(...)`, unverändert verschoben; einzige Änderungen: `zeit: e.zeit || Date.now()` (beide Stellen) und `rcEslErfolg(e.zeit)`
  - `rcEslErfolg(zeit)` setzt `rcEslLastOk = zeit || Date.now()`

Einzubauende Weichen (je 1–3 Zeilen am Funktionsanfang, nach vorhandenen Busy-Prüfungen wo angegeben):

| Stelle | Im Dienst-Modus |
|---|---|
| `rcAlleProjekteAn` | erste Zeile: `true` |
| `rcProjektAbruf` | nach der `p`-Prüfung: `takt` → `{ok:true, grund:'Datendienst'}`, sonst `return rcDienstAbruf(key)`; der Export-Teil ruft `rcProjektLieferung(key, e)` |
| `rcLiveTick` | sofort zurück |
| `rcSessionLost` | nur `rcLog.warn` mit Grund, kein `clearInterval`, kein Banner, kein Retry |
| `rcKeepAliveTick`, `rcSessionWatchTick`, `rcWdTick`, `rcHarvestEslHistory`, `rcAutoKpiQuelle`, `rcDriftNachholen` | sofort zurück |
| `rcFetchRangeViaUI`, `rcFetchRangeBuffer` | `null` |
| `window.rcOpenKpiQuelle`, `window.rcOpenQueueQuelle` | `false` und Toast „Die Ligaliste holt der Datendienst.“ bzw. „Warteschleife im Dienst-Betrieb aus.“ |
| `rcJetztAktualisieren` | nach den Busy-Prüfungen und dem Setzen von `rcJetztBusy`: `liga`/`esl` aus `rcDienstRunde()` statt `RC_LIVE_NOW`/`holeExcelVomServer`; Text, Rückgabe `{liga, esl, sekunden}` und `finally` unverändert |
| `rcRangeLoad` (Closure in `rcOpenRange`) | statt `RC_HARVEST_RANGE` und `rcFetchRangeViaUI`: `rcDienstBereich(von, bis, ['kabel','mobile','um'])`, Bilanz in dieselbe Statuszeile |
| `frischDann` (Export-Dialog) | liegt `von` vor heute: zuerst `rcDienstBereich(von, min(bis, gestern), rcProjekteFuerScope(scope))`; Fehlschlag oder Frist → mit Grund weiter (Frist, keine Sperre) |

`holeExcelVomServer`, `rcPortalAufHeute`, `rcMitternachtPruefen`, `rcExportAnsichtSicherstellen`, `rcFrischHolen`, `rcProjektWechseln`, `rcProjektAktualisieren`, `rcProjekteAlleAktualisieren` bleiben ohne eigene Weiche: sie laufen über den Alle-Projekte-Zweig bzw. über die weitergeleiteten Funktionen. Das Prüfwerkzeug belegt es.

- [ ] **Step 1: Prüfwerkzeug schreiben.** Funktionen per `schneide` (`pruefwerkzeuge/_stack_regel.js`) aus v22 schneiden, mit `new Function` in einer Hülle mit Spionen auswerten: `fetch`, `window.open`, `location.reload`, `clearInterval`, `postMessage`, `rcRahmenAufbau`, `holeExcelVomServer`, `rcLeerlaufZurueck`, `rcDienstAnfrage`. Jede Funktion zweimal: mit `__rcDienst` (kein Portal-Abruf, kein Fenster, kein Neuladen, kein Klick; die Weiterleitung wird mit den richtigen Argumenten gerufen) und ohne (das bisherige Verhalten tritt ein – Gegenprobe). Pflichtfälle zusätzlich:
  - `rcProjektLieferung('mobile', {art:'excel', buf, zeit:1234})` mit `buf` aus `Test Excels/Export_20260928_212922.xlsx` (über `node_modules/xlsx`) → `rcProjektDaten.mobile.zeit === 1234`, `rcVerarbeiteAlle` gerufen.
  - `rcProjektLieferung('kabel', {art:'leer'})` mit Vorstand nur von gestern → `ok:true`; mit Vorstand von heute → `ok:false`, Grund enthält „ploetzlich“.
  - `rcProjektLieferung('um', {art:'fehler', grund:'ESL-Anmeldung abgeschickt'})` → `rcProjektFehlschlag` mit genau diesem Grund.
  - `rcDienstAbruf('um')`: Anfrage liefert `{ok:true, nr:7}`, `rcDienstGesehen.esl.um` wird 7 → Ergebnis aus `rcDienstErgebnis`; bleibt 6 → nach der Frist `ok:false` mit Grund „nicht eingespeist“.
  - `rcDienstAnfrage` mit nie antwortendem `fetch` und Frist 300 ms → `{ok:false}` in < 1 s.
  - `rcJetztAktualisieren` mit Marke → `rcDienstRunde` gerufen, `holeExcelVomServer` nicht, Rückgabe hat `liga`, `esl`, `sekunden`.
  - `rcRangeLoad` und `frischDann`: Block herausschneiden (Fallstrick 18), `rcDienstBereich` steht unter `rcDienstModus()` vor dem alten Weg.
- [ ] **Step 2: Ausführen, erwartet FEHL** (`rcDienstModus` fehlt).
- [ ] **Step 3: v22 ändern** wie oben.
- [ ] **Step 4: Prüfen** – `node pruefwerkzeuge/dienst_schalter_pruefen.js` grün; `node --check esl_live_arena_v22.js`; `node pruefwerkzeuge/tdz_pruefen.js` → 0; Einzeiler aller Prüfwerkzeuge → `ROTE WERKZEUGE: 0`.
- [ ] **Step 5: Commit** – `git add esl_live_arena_v22.js pruefwerkzeuge/dienst_schalter_pruefen.js` · `git commit -m "v22: Dienst-Schalter und Weiterleitung an den Datendienst"`

---

### Task 10: Historie je Projekt in v22

**Files:**
- Modify: `esl_live_arena_v22.js`
- Test: `pruefwerkzeuge/dienst_historie_pruefen.js`

**Interfaces:**
- Consumes: `rcDienstModus` (Task 9); vorhandene `rcAggregateMultiDayBuffer(buf)`, `rcBereichPruefen`, `rcKappeProdHistorie`, `rcHistorieSpeicherFehler`.
- Produces (Funktionsdeklarationen):
  - `rcProjSfx(p) -> '' | '_mob' | '_um'`
  - `rcHistSchluessel(basis) -> string[]` (Dienst: `[basis, basis+'_mob', basis+'_um']`; sonst `[rcKey(basis)]`)
  - `rcEslTagVereinen(a, b) -> agg` (summiert `rows, kontakte, ansp, bcr, nonBcr, bnt, vvl`, `byStd` je Code, `byAgent` vereinigt; gleiche VO: Zahlen summiert, `pg`/`pgB` addiert; Eingaben bleiben unverändert)
  - `rcLigaTagVereinen(a, b) -> snapshot` (`byAgent` vereinigt, gleiche CCS: größeres `c`; `byStd`/`tot` summiert; `nurCalls` wenn eins davon)
  - `rcHistorieVereint(basis) -> {tag: …}`
  - `rcDienstHistorieAblegen(projekt, buf|null, ligaTage|null, von, bis) -> {esl:{ok, tage, grund}, liga:{ok, tage}}` – ESL: `rcBereichPruefen(buf, von, bis, projekt)` → `rcAggregateMultiDayBuffer` → nur Tage < heute in `[von, bis]`, Ersetzungsregel wie `rcRangeLoad` (`!alt || alt.kontakte <= neu.kontakte`), 40 Tage, Schlüssel `'rcEslHistory' + rcProjSfx(projekt)`; Liga: Tage < heute, `'rcLigaHistDash' + rcProjSfx(projekt)`, 40 Tage; Speicherfehler über `rcHistorieSpeicherFehler`; danach `window.rcEslHistory = rcHistorieVereint('rcEslHistory')` (der heutige Eintrag aus dem Speicher der Seite bleibt erhalten) und `window.rcLigaHistory = rcHistorieVereint('rcLigaHistDash')`

Weitere Änderungen:
- `rcLoadEslHistory`: Dienst → `rcHistorieVereint('rcEslHistory')`.
- Laden der Liga-Historie (`try { window.rcLigaHistory = Object.assign(…rcKey('rcLigaHistDash')…` bei ~Z. 2198): Dienst → `rcHistorieVereint('rcLigaHistDash')`.
- Selbst-Archivierung in `processDataStream` (`histS[hKey] = …`, ~Z. 9923): Dienst → `histS = window.rcEslHistory || {}`, kein `localStorage.setItem` (heute steht nur im Speicher der Seite; Vortage kommen vom Dienst).
- `rcRepairEslHistory`, `rcSpeicherHistorieKappen`, `rcSpeicherWacht` (Stufe 1): über `rcHistSchluessel(basis)` statt `rcKey(basis)`; `rcRepairEslHistory` setzt danach `window.rcEslHistory = rcLoadEslHistory()`.
- `rcBereichPruefen(buf, fromStr, toStr, projekt)`: `rcProjektPruefen(projekt || rcEigenesProjektKey(), …)`.
- `rcStandRows`, Vortag-Zweig: `detr` wird `null` statt `0`, wenn `lig.nurCalls` (die Ligaliste hat für diesen Tag keine Detraktoren geliefert).

- [ ] **Step 1: Prüfwerkzeug schreiben** (Funktionen geschnitten, `localStorage`-Stub als Map, `rcKey`-Stub, Stubs für `rcAggregateMultiDayBuffer` und `rcBereichPruefen`):
  - `rcHistSchluessel` mit/ohne Marke.
  - `rcEslTagVereinen`: `kontakte` 10 + 5 = 15; gleiche VO addiert `k` und `pg`; Eingabe-Objekte unverändert.
  - `rcLigaTagVereinen`: gleiche CCS behält `c` 9 vor 5; `nurCalls` übernommen.
  - `rcDienstHistorieAblegen('mobile', …)` mit `{gestern: aggA, heute: aggX}` → `rcEslHistory_mob` hat nur `gestern`; `rcEslHistory` (Kabel) unverändert (**Gegenprobe**: ein Ablegen über `rcKey` hätte Kabel überschrieben); `window.rcEslHistory` enthält Kabel- und Mobile-Tage und den vorher gesetzten Heute-Eintrag.
  - Ersetzungsregel: alter Tag mit 50 Kontakten bleibt gegen neuen mit 40.
  - 41 Tage → 40 bleiben.
  - Selbst-Archivierung: Block herausschneiden; mit Marke kein `setItem`.
  - `rcBereichPruefen` reicht `projekt` an `rcProjektPruefen` weiter.
- [ ] **Step 2: Ausführen, erwartet FEHL.**
- [ ] **Step 3: v22 ändern.**
- [ ] **Step 4: Prüfen** – Werkzeug grün; `node --check`; TDZ 0; Einzeiler `ROTE WERKZEUGE: 0`.
- [ ] **Step 5: Commit** – `git add esl_live_arena_v22.js pruefwerkzeuge/dienst_historie_pruefen.js` · `git commit -m "v22: Historie je Projekt im Dienst-Betrieb"`

---

### Task 11: Empfang und Start im Dienst-Modus

**Files:**
- Modify: `esl_live_arena_v22.js`
- Test: `pruefwerkzeuge/dienst_empfang_pruefen.js`

**Interfaces:**
- Consumes: Tasks 9 und 10; `handleKpiMessage`, `rcProjektLieferung`, `rcDienstHistorieAblegen`, `rcEslFehlschlag`, `rcLogEreignis`, `rcLog.warn`.
- Produces (Funktionsdeklarationen):
  - `rcDienstEmpfangStarten()` – `window.rcDienstInterval = setInterval(rcDienstEmpfangTick, 2000)`, sofort ein Tick, **einmal** `rcDienstAnfrage('/api/projekt', {projekt: rcAktivProjekt})`
  - `async rcDienstEmpfangTick()` – Sperre `window.rcDienstEmpfangLaeuft`; `GET /api/stand` (Frist 8 s); Reihenfolge:
    1. ESL je Projekt mit `stand.esl[p].nr > rcDienstGesehen.esl[p]`: `art 'excel'` → Bytes von `/api/esl/<p>.xlsx`, `e = {art, buf, zeit}`; sonst `e = {art, status, grund, zeit}`; `r = rcProjektLieferung(p, e)`; `rcDienstErgebnis[p] = {nr, r}`
    2. Liga bei neuer `nr`: `ok`/`teil` und `zeit` neuer als gesehen → `/api/liga.json` → `handleKpiMessage({type:'KPI_BATCH', payload, vollstaendig, liveDaterange:'intraday'})`, danach `window.rcKpiLastUpdate = new Date(stand.liga.zeit)`; `teil` → `handleKpiMessage({type:'KPI_HINWEIS', text, zeit})`; `fehler` → `handleKpiMessage({type:'KPI_QUELLE_TOT', grund, zeit})`
    3. Vortage je Projekt bei neuer `nr`: beide Dateien → `rcDienstHistorieAblegen(p, buf, ligaTage, von, bis)`
    4. neue Ereignisse: `W` → `rcLog.warn('[Dienst] ' + text)`, `E` → `rcLogEreignis('[Dienst] ' + text)`
    5. Abfrage scheitert: `window.rcDienstLage = {zuletztOk, fehler}`; höchstens alle 20 s `rcEslFehlschlag('Datendienst antwortet nicht (' + grund + ')')`; bei 403: Grund „Zugang abgelehnt - Seite ueber ESL_Dienst_Start.cmd oeffnen“
  - `window.rcDienstGesehen = {esl:{kabel:0, mobile:0, um:0}, liga:0, vortage:{kabel:0, mobile:0, um:0}, ereignis:0}`, `window.rcDienstErgebnis = {}`, `window.rcDienstLage`

Weitere Änderungen:
- Start-Block (`Promise.all(ladeBibliothek…).then`): nach `rcAutoMapping()` und dem Anlegen von `rcLiveInterval`: Dienst → `rcDienstEmpfangStarten(); return;` (kein `holeExcelVomServer`, kein `rcAlleProjekteStart`, kein Harvest, kein `rcAutoKpiQuelle`); im `.catch` ebenso.
- Clean-State: `'rcDienstInterval'` in die Intervall-Liste; `rcDienstEmpfangLaeuft`, `rcDienstGesehen`, `rcDienstErgebnis` zurücksetzen (nach Re-Inject wird alles neu eingespeist, `rcProjektDaten` ist dann ohnehin leer).
- Warteschleifen-Modul: Boot `if(CFG.modulAus || rcDienstModus())` → `queueAbraeumen()`, Log „Warteschleife im Dienst-Betrieb aus (kommt mit Vorhaben 4).“

- [ ] **Step 1: Prüfwerkzeug schreiben** (Empfang geschnitten, falsches `fetch` liefert einen Stand und Dateien aus einem Objekt, Spione auf die Eingänge):
  - erster Tick: Kabel eingespeist mit `zeit` aus dem Stand; Liga als `KPI_BATCH` mit `vollstaendig`; `rcKpiLastUpdate` = `stand.liga.zeit`.
  - zweiter Tick mit demselben Stand: nichts eingespeist.
  - `esl.mobile.nr + 1`, `art 'fehler'` → `rcProjektLieferung('mobile', {art:'fehler', grund, zeit})`.
  - Liga `teil` → `KPI_HINWEIS`; `fehler` → `KPI_QUELLE_TOT`.
  - `fetch` scheitert 25 s lang (falsche Uhr) → `rcEslFehlschlag` genau zweimal.
  - Ereignis `W` → `rcLog.warn` mit `[Dienst]`.
  - zwei Ticks gleichzeitig → nur einer arbeitet.
  - `/api/projekt` genau einmal nach Start und nach 5 Ticks (Review Focus 5).
  - Start-Block: Block herausschneiden; `rcDienstEmpfangStarten` steht vor `holeExcelVomServer` und vor dem `return`; Clean-State-Liste enthält `rcDienstInterval`.
- [ ] **Step 2: Ausführen, erwartet FEHL.**
- [ ] **Step 3: v22 ändern.**
- [ ] **Step 4: Prüfen** – Werkzeug grün; `node --check`; TDZ 0; Einzeiler `ROTE WERKZEUGE: 0`.
- [ ] **Step 5: Commit** – `git add esl_live_arena_v22.js pruefwerkzeuge/dienst_empfang_pruefen.js` · `git commit -m "v22: Empfang der Dienst-Daten und Start im Dienst-Modus"`

---

### Task 12: Gastseite, Starter und Zahlengleichheit

**Files:**
- Create: `ESL_Live_Arena.html`, `ESL_Dienst_Start.cmd`
- Delete: `ESL_Live_Arena_APITool.html`, `ESL_APITool_Start.cmd` (`git rm`)
- Modify: `test_abgleich_esl.html` (Parameter `dienst=1`)

**Interfaces:**
- Consumes: Task 7 (`GET /`, `/api/mapping.xlsx`, `/esl_live_arena_v22.js`), Tasks 9–11.
- Produces:
  - `ESL_Live_Arena.html`: `<title>ESL Live-Arena</title>`, dunkler Hintergrund (`#121212`); Skript setzt `window.__rcDienst = { basis: location.origin }`, holt `/api/mapping.xlsx` (`cache:'no-store'`), wandelt in Base64 (in Stücken von 0x8000) nach `window.__rcFiles = { mapping }`; bei Fehler ein sichtbarer Hinweis mit dem Grund aus der Antwort, Start trotzdem; dann `<script src="/esl_live_arena_v22.js?v=<Date.now()>">`. Lädt keine Bibliothek selbst.
  - `ESL_Dienst_Start.cmd`: wie `ESL_APITool_Start.cmd` (Node-Suche, Version ≥ 22), Titel „ESL Live-Arena Datendienst“, startet `"%NODE%" "%~dp0esl_dienst.js"`, danach `pause`; Text nennt: nicht gleichzeitig mit `ESL_Start.cmd`, Fenster offen lassen.
  - `test_abgleich_esl.html?dienst=1&…`: vor dem Laden von v22 `window.__rcDienst = { basis: location.origin + '/__dienst' }`; `window.fetch` beantwortet `/__dienst/api/stand` (drei Projekte `nr 1`, `art 'excel'`, `liga.nr 0`, `vortage.kabel` mit `nr 1`), `/__dienst/api/esl/<p>.xlsx` (die drei Exporte, mit `aufHeute` umdatiert und per `XLSX.write` neu geschrieben), `/__dienst/api/vortage/kabel.liga.json` (ein Tag gestern, `nurCalls`, drei Agenten aus dem Mapping), `/__dienst/api/projekt` (`{ok:true}`); wartet, bis `rcProjektDaten` alle drei trägt (≤ 15 s), dann dieselben Prüfungen wie ohne Parameter.

- [ ] **Step 1: Prüfseite erweitern** – zusätzliche Prüfungen nur bei `dienst=1`: `rcStandRows(gestern)` liefert die drei Agenten mit `calls > 0` und `detr === null`; kein `window.open`, kein `location.reload` (Spione vor v22 gesetzt); Mitarbeiter-Excel fehlt (`&ohnemapping=1`: Antwort 503) → Hinweis sichtbar, Dashboard läuft mit gespeichertem Mapping weiter (Review Focus 4).
- [ ] **Step 2: Ausführen ohne die neuen Dateien** – Server `esl-offline` (Port 8412), `…/test_abgleich_esl.html?std=AL&k=Export_20260928_212911.xlsx&m=Export_20260928_212922.xlsx&u=Export_20260928_212931.xlsx&dienst=1` → `FEHL` beim Warten auf die Daten, solange v22 ohne Tasks 9–11 läuft (Gegenprobe mit `&src=<Fassung vor Task 9>` muss durchfallen).
- [ ] **Step 3: Gastseite und Starter schreiben; APITool-Dateien entfernen.**
- [ ] **Step 4: Prüfen** – mit `dienst=1`: `ALLE n PRUEFUNGEN BESTANDEN`, dieselben 20 Sollwerte wie ohne Parameter plus die neuen; ohne Parameter weiter 20/20; Re-Inject in der Prüfseite: je 1 `#rcLiveDashboard`, `#rcDetailModal`, `#rcToastContainer`, ein `rcDienstInterval`.
- [ ] **Step 5: Commit** – `git add ESL_Live_Arena.html ESL_Dienst_Start.cmd test_abgleich_esl.html` · `git commit -m "Datendienst: Gastseite, Starter, Zahlengleichheit im Dienst-Modus"`

---

### Task 13: Ende-zu-Ende gegen die Schein-Portale

**Files:**
- Modify: `pruefwerkzeuge/dienst_messen.mjs` (Fall `alles`)

**Interfaces:**
- Consumes: alles Vorige; Projektknöpfe `#rcProjWahl [data-rc-proj="mobile"]`.

- [ ] **Step 1: Messfall `fall=alles` schreiben.** Dienst wie in `fall=dienst`, Dashboard-Tab mit der echten Gastseite. Vor dem Laden der Seite (`Page.addScriptToEvaluateOnNewDocument` über die offen gehaltene Verbindung des Messgeräts) zählen Spione `window.open` und `location.reload`. Prüft:
  1. Start: in ≤ 90 s `rcProjektDaten.kabel` gefüllt, `Object.keys(rcKpiData).length > 0`, `#rcZeitEsl` und `#rcZeitLiga` zeigen eine Uhrzeit.
  2. Echter Klick auf den Mobile-Knopf → `stand.aktiv === 'mobile'`, `rcProjektDaten.mobile.zeit` neuer als der Klick.
  3. Schein-ESL `abmelden` → `anmeldungen + 1`, Daten in ≤ 2 Runden wieder da.
  4. Schein-ESL 30 s aus → `rcEslFehlserie ≥ 3` im Dashboard, danach wieder 0.
  5. Liga `tot` → Liga-Tab ersetzt (neue Target-Id), Daten wieder da.
  6. Schein-ESL `gestern` → nächste Runde liefert heutige Zeilen.
  7. Im Dashboard `rcExportStandZeitraum(heute-3, gestern, …)` mit `rcXlsxAbfangen` → Mappe abgefangen, `stand.vortage.kabel.nr` gestiegen (über `frischDann` bzw. vorhandene Vortage).
  8. Seite neu laden während `POST /api/bereich` läuft → kein zweiter Bereichsauftrag im Log, Vortage danach eingespeist (Review Focus 2).
  9. Dienst neu starten → `rcDienstLage.fehler === ''` in ≤ 30 s ohne Neuladen (Review Focus 1).
  10. Seite neu laden → `rcProjektDaten.kabel` in ≤ 10 s wieder da.
  11. Re-Inject (`(0,eval)(src)`) im Dashboard-Tab → je 1 `#rcLiveDashboard`, ein `rcDienstInterval`.
  12. Edge beenden → in ≤ 150 s wieder Daten im Dashboard (Review Focus 3).
  13. Spione: `window.open` und `location.reload` wurden im Dashboard-Tab nie aufgerufen.
- [ ] **Step 2: Ausführen** – `node pruefwerkzeuge/dienst_messen.mjs fall=alles` → `13 von 13 OK`. Rote Punkte: Ursache in der zuständigen Task beheben, deren Prüfwerkzeug um den Fall ergänzen, neu messen.
- [ ] **Step 3: Commit** – `git add pruefwerkzeuge/dienst_messen.mjs` (und die Korrekturen) · `git commit -m "Datendienst: Ende-zu-Ende-Messung"`

---

### Task 14: Betrieb, Doku, Update-Paket

**Files:**
- Modify: `ANLEITUNG.md`, `bundle_bauen.js`, `CLAUDE.md`

**Interfaces:**
- Consumes: alle neuen Dateien.

- [ ] **Step 1: `ANLEITUNG.md`** – neuer Abschnitt „Dienst-Betrieb (neu)“: Start per `ESL_Dienst_Start.cmd` (Fenster offen lassen), nie gleichzeitig mit `ESL_Start.cmd`, TL Command Center aus; das Kennwort fürs ESL muss im Edge-Profil gespeichert sein; Einstellungen einmal umziehen (altes Dashboard: Zahnrad → Sichern → Datei speichern; neues: Zahnrad → Sichern → Einspielen); Warteschleife und Stundenmail laufen im Dienst-Betrieb nicht; bei Störung `esl_dienst.log` und Logbuch-Datei schicken. Die Vorgabe „ein PC, ein Projekt“ gilt für den alten Weg; im Dienst-Betrieb genau eine Live-Arena, Projekt per Klick.
- [ ] **Step 2: `bundle_bauen.js`** – in `DATEIEN` (`pflicht:false`): `esl_dienst.js`, `esl_dienst_regeln.js`, `esl_dienst_buendel.js`, `esl_dienst_cdp.js`, `esl_dienst_edge.js`, `esl_dienst_esl.js`, `esl_dienst_liga.js`, `ESL_Live_Arena.html`, `ESL_Dienst_Start.cmd`. `node\node.exe` bleibt draußen.
- [ ] **Step 3: `CLAUDE.md`** – Abschnitt „DATENDIENST (Vorhaben 1)“ unter „Aktueller Stand“: Bauart in fünf Sätzen, Dateien, Prüfwerkzeuge (`dienst_regeln`, `dienst_buendel`, `dienst_schalter`, `dienst_historie`, `dienst_empfang`) und Messgerät, Präzisierungen 1–7, Zeile in der Prüfstand-Tabelle („Datendienst – nein, offline und an Schein-Portalen gemessen“), Werkzeug- und Prüfungszahl neu gezählt.
- [ ] **Step 4: Gesamtprüfung** – Einzeiler aller Prüfwerkzeuge → `ROTE WERKZEUGE: 0`; `node pruefwerkzeuge/tdz_pruefen.js` → 0; `node --check` für jede neue `.js`; `graphify update .`; `node bundle_bauen.js`, dann die Nutzdaten aus `<script id="nutzdaten">` dekodieren und auf `rcDienstModus` und `esl_dienst_regeln` prüfen.
- [ ] **Step 5: Commit** – `git add ANLEITUNG.md bundle_bauen.js CLAUDE.md` · `git commit -m "Datendienst: Anleitung, Update-Paket, Projektgedaechtnis"`
- [ ] **Step 6: Abnahme auf Citrix (Nutzer)** – Update-Paket einspielen, `node\node.exe` liegt im Ordner, `ESL_Dienst_Start.cmd` starten, einen Arbeitstag laufen lassen; nach 2–3 h (Sitzungsablauf) und abends Logbuch-Datei und `esl_dienst.log` anfordern. Erst danach gilt das Vorhaben als abgenommen.

## Nicht in diesem Plan

- `rcExportReportingAlle` (Knopf „Reporting ALLE Projekte“) nimmt für das eigene Projekt den Live-Stand aller Projekte (heute schon so im Alle-Projekte-Betrieb). Vortage stimmen je Projekt; der Heute-Teil des Kabel-Blocks zeigt alle Projekte. Eigener kleiner Folgeauftrag.
- Warteschleife/Genesys, Stundenmail, Mail-Zentrum, Spiel-Archiv, PureCloud: eigene Vorhaben.
