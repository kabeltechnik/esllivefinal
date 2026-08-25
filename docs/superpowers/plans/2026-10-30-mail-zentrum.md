# Mail-Zentrum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eigene Dashboard-Seite „Postfach“ (Outlook: Abwesende, Mitarbeiterinfos, wichtige Mails, Posteingang, Termine, Team-Entwurf), gespeist vom Datendienst, nur bei eingeschaltetem Schalter.

**Architecture:** Der Datendienst (`esl_dienst.js`) startet alle 180 s ein PowerShell-Leseskript (`postfach_lesen.ps1`, Outlook-COM), stuft das Ergebnis in Node ein (`esl_dienst_postfach.js`) und hält es nur im Speicher; `stand.json` trägt nur einen inhaltslosen Kopf. v22 holt die Daten über `GET /api/postfach`, sobald sich die Kopf-Nummer ändert, und zeichnet die Seite; Aktionen gehen als `POST /api/postfach/aktion` an ein zweites Skript (`postfach_aktion.ps1`).

**Tech Stack:** Node 22 (nur Bordmittel), PowerShell 5.1 + Outlook-COM (klassisch), v22-IIFE im Browser.

**Spec:** `docs/superpowers/specs/2026-10-30-mail-zentrum-design.md`

## Global Constraints

- Schalter `ESL_DIENST_POSTFACH`: nur der Wert `1` schaltet ein; in `ESL_Dienst_Start.cmd` ab Werk `set "ESL_DIENST_POSTFACH=0"`. Aus = kein PowerShell-Aufruf, `/api/postfach*` antwortet 404, `stand.json` ohne `postfach`, keine Seite.
- Takt 180 s (`ESL_DIENST_POSTFACH_TAKT_SEK`), Frist Lesen 60 s, Frist Aktion 30 s, höchstens ein Lesen gleichzeitig, erster Lauf direkt nach Start. Eigener Zeitgeber, nie in der ESL/Liga-Warteschlange.
- Lesefenster: 60 neueste Mails, Dispo 7 Tage, Termine nur heute (höchstens 25, abgesagte raus), Vorschau ≤ 180 Zeichen. `inhalt` wird weder gelesen noch ausgeliefert.
- Kein Mailinhalt, Betreff, Absender, Name oder Kollegen-Adresse in `stand.json`, `Dienst_Daten/`, `esl_dienst.log`, Logbuch (`rcLog`), `localStorage`, Update-Paket, Git.
- Nie `.Send()`. Nur `Display($false)` (Element, Antwortfenster, Entwurf).
- `.ps1` mit UTF-8-BOM; stdout als UTF-8 ohne BOM (`[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false`).
- `Postfach_Wichtig.txt` neben `esl_dienst.js`, in `.gitignore`, NICHT in `bundle_bauen.js`. Lesen entfernt BOM und `\r`; Schreiben atomar (tmp + rename).
- Seite `postfach` in keiner Rotationsliste (`rcAutoRotPages`, Konfigurator-Zeilen `cfgRot_*`), Dashboard startet nie darauf, Seite wird nicht gemerkt.
- „Abwesend heute“ und „Mitarbeiterinfos“ zeigen ALLE Dispo-Meldungen, unabhängig vom Dashboard-Filter, mit Team-Spalte. Nur „Mail an Team“ folgt dem Filter (`rcActiveScope()`).
- Emojis verboten; Design dunkel nach `VODAFONE_DESIGN.md` (Tokens `--vf-*`); eigene CSS-Klassen `rc-pf-*` (nicht `.rc-card`, damit der Konfigurator die Seite nicht einsammelt).
- v22-Helfer, die vor ihrer Definition laufen können: Funktionsdeklarationen, keine `const`-Funktionen (TDZ).
- Prüfwerkzeuge: Node-only, nichts installieren, echte Funktionen schneiden statt nachbauen, zu jeder Regel eine Gegenprobe; letzte Zeile enthält `<n> fehlgeschlagen` (Sammel-Einzeiler).
- Kein Commit, kein Push, kein Paket ohne ausdrückliche Anweisung des Nutzers (Commit-Schritte entfallen; nach jeder Aufgabe nur prüfen).

## Review Focus

1. **Outlook fehlt oder ist das „neue Outlook“** — Lesen scheitert: `grund` steht im Seitenkopf, der letzte gute Stand bleibt sichtbar, der Dienst läuft weiter (Task 2: Schein-Leser `fehler`/`kaputt`).
2. **PowerShell hängt** (Outlook zeigt einen Dialog) — nach 60 s beendet, kein zweites Lesen parallel, nächster Takt versucht neu (Task 2: Schein-Leser `haengt`).
3. **Umlaute in Namen/Betreff** kommen unverfälscht an (Task 2: Schein-Leser `umlaut`, Task 3: Encoding-Zeilen).
4. **Dispo-Varianten:** `dd.MM.` ohne Jahr, `AW:`/`WG:`/`RE:`/`FW:`, „Auffaelligkeit“ ohne Umlaut, `bis` vor `von`, unlesbarer `MA:`-Betreff (Task 1).
5. **`Postfach_Wichtig.txt` im Editor bearbeitet:** mit BOM und CRLF gespeichert (Notepad), währenddessen gesperrt, oder gelöscht (Task 1).

---

### Task 1: Regeln und Wichtig-Datei (`esl_dienst_postfach.js`, reiner Teil)

**Files:**
- Create: `esl_dienst_postfach.js`
- Create: `pruefwerkzeuge/postfach_pruefen.js`

**Interfaces:**
- Consumes: `require('./esl_dienst_regeln').datumIso(d: Date): 'YYYY-MM-DD'`.
- Produces (alle per `module.exports`):
  - `normName(s: string): string` — klein, `.`/`,` zu Leerzeichen, ä→a ö→o ü→u ß→ss, Teile sortiert (gleiche Regel wie `window.rcNormName` in v22).
  - `datumLesen(text: string, jahr: number): string|null` — `d.M.yyyy`, `dd.MM.yyyy`, `dd.MM.`, `dd.MM` → `'YYYY-MM-DD'`; ungültig → `null`.
  - `dispoLesen(betreff: string, eingangIso: string): null | {ma, typ, grund, von, bis}` — `typ` ∈ `'grund' | 'auff' | 'unlesbar'`; `null`, wenn kein `MA:` im Betreff oder Betreff beginnt mit `AW:|WG:|RE:|FW:` (Groß/klein egal). `von` = gelesenes Datum oder `eingangIso`; `bis` = Datum oder `''`.
  - `abwesendHeute(dispo: Array<{ma,typ,grund,von,bis,zeit,entryId}>, heuteIso: string): Array<{ma,grund,von,bis,zeit,entryId}>`
  - `wichtigLesen(text: string): string[]`
  - `wichtigTreffer(zeilen: string[], absender: string, email: string): string` — getroffene Zeile oder `''`.
  - `einstufen(roh: LeserErgebnis, zeilen: string[], heuteIso: string): PostfachDaten`
  - `WICHTIG_VORLAGE: string`
  - `wichtigSichern(datei: string): string[]` — legt die Datei mit `WICHTIG_VORLAGE` an, wenn sie fehlt; liefert `wichtigLesen` des Inhalts; Lesefehler → `[]` (wirft nie).
  - `wichtigAendern(datei: string, art: 'neu'|'weg', eintrag: string): {ok: boolean, grund?: string}`
- `LeserErgebnis` (Vertrag mit Task 3): `{ ok: true, ungelesen: number, mails: [{entryId, zeit:'YYYY-MM-DDTHH:mm', absender, email, betreff, ungelesen: boolean, vorschau}], dispo: [{entryId, zeit, betreff}], termine: [{entryId, start:'HH:mm'|'', ende:'HH:mm'|'', titel, ganztaegig: boolean}] }` oder `{ ok: false, grund: string }`.
- `PostfachDaten` (Vertrag mit Task 2/4/5): `{ ok: true, grund: '', ungelesen, mails: [{entryId, zeit, absender, email, betreff, ungelesen, vorschau, kategorie, wichtig}], abwesend: [...], infos: [{ma, art, text, zeit, entryId}], termine: [...] }` — `kategorie` ∈ `'Steuerung'|'Management'|'Performance'|'Rest'`; `wichtig` = getroffene Zeile oder `''`; `infos.art` ∈ `'Auffälligkeit'|'nicht lesbar'`; `infos.text` = Grund bzw. bei „nicht lesbar“ der Betreff. Fehlende Arrays im Roh-Ergebnis gelten als `[]`.

Regeln (aus dem Spec, verbindlich):
- Dispo-Regex auf den Betreff: `MA:\s*([^,]+,\s*[^,]+),\s*(Grund|Auff[^:]*):\s*([^,]+)(?:,\s*von:\s*([^,]+))?(?:,\s*bis:\s*([^,]+))?` (Groß/klein egal für `Grund`/`Auff`).
- Kategorie: Steuerung, wenn `(absender + ' ' + email).toLowerCase()` `vodafone-disposition|disposition|steuerung` enthält ODER Betreff `/^ma:/i`; sonst Management bei Wichtig-Treffer; sonst Performance bei Betreff `/pix|wca|croco|storno|audit|connect|mystery|provision|ligaliste|zielvereinbarung/i`; sonst Rest. Steuerung schlägt Management; `wichtig` wird trotzdem gesetzt.
- Wichtig-Treffer: Zeile (klein) ist Teilstring von `(absender + ' ' + email).toLowerCase()`.
- `wichtigLesen`: BOM entfernen, an `\r?\n` trennen, trimmen, klein, `#`-Zeilen und Leerzeilen weg.
- Abwesend: nur `typ === 'grund'`; je `normName(ma)` gewinnt die Meldung mit dem größten `zeit`; angezeigt, wenn `von <= heute` und (`bis` ? `bis >= heute` : `von === heute`); `bis < von` → `bis` ignorieren. Sortiert nach `ma`.
- Infos: `typ` `'auff'` (art `'Auffälligkeit'`) und `'unlesbar'` (art `'nicht lesbar'`), neueste zuerst, nicht entdoppelt.
- `wichtigAendern`: `eintrag` trimmen + klein; 3–200 Zeichen, keine Steuerzeichen (`/[\x00-\x1f]/`), sonst `{ok:false, grund:'Eintrag ungueltig'}`. `'neu'`: vorhandene gleiche Zeile → `{ok:true}` ohne Schreiben, sonst anhängen. `'weg'`: genau gleiche Nicht-`#`-Zeile entfernen; nicht vorhanden → `{ok:false, grund:'nicht in Postfach_Wichtig.txt'}`. Schreiben über tmp + rename; Schreibfehler → `{ok:false, grund:'Datei nicht schreibbar (' + code + ')'}`. Vorher `wichtigSichern(datei)`.
- `WICHTIG_VORLAGE` (exakt, UTF-8 ohne BOM, Zeilenende `\r\n`):
```
# Postfach_Wichtig.txt - Absender, deren Mails als "wichtig" gelten.
# Eine Zeile = ein Muster (Teil des Namens oder der Adresse), Gross/klein egal.
# Zeilen mit # und leere Zeilen zaehlen nicht. Aenderungen wirken ohne Neustart.
projektleitung
standortleitung
britta
uensal
ünsal
tanju
oezdemir
özdemir
```

- [ ] **Step 1: Prüfwerkzeug mit den Regel-Tests schreiben** (`pruefwerkzeuge/postfach_pruefen.js`, Abschnitt „1 Regeln“; Kopf und `pruefe()` wie `dienst_kern_pruefen.js`; das Modul wird per `require('../esl_dienst_postfach.js')` geladen; Wichtig-Datei-Tests in einem Ordner unter `os.tmpdir()`, der am Ende gelöscht wird). Pflichtfälle:

```js
const P = require('../esl_dienst_postfach.js');
pruefe('Grund mit von/bis', JSON.stringify(P.dispoLesen('MA: Muster, Anna, Grund: KRV, von: 28.10.2026, bis: 31.10.2026', '2026-10-28')) ===
  JSON.stringify({ ma:'Muster, Anna', typ:'grund', grund:'KRV', von:'2026-10-28', bis:'2026-10-31' }));
pruefe('dd.MM. ohne Jahr', P.datumLesen('05.11.', 2026) === '2026-11-05');
pruefe('Auffaelligkeit ohne Umlaut', P.dispoLesen('MA: Probe, Lena, Auffaelligkeit: AHT hoch', '2026-10-30').typ === 'auff');
pruefe('AW: ist keine Meldung', P.dispoLesen('AW: MA: Muster, Anna, Grund: KRV', '2026-10-30') === null);
pruefe('WG: ist keine Meldung', P.dispoLesen('wg: MA: Muster, Anna, Grund: KRV', '2026-10-30') === null);
pruefe('unlesbar bleibt', P.dispoLesen('MA: kaputt ohne Komma', '2026-10-30').typ === 'unlesbar');
pruefe('ohne MA: null', P.dispoLesen('Newsletter IT', '2026-10-30') === null);
// abwesendHeute, heute = 2026-10-30
const A = (o) => Object.assign({ typ:'grund', grund:'KRV', bis:'', entryId:'X' }, o);
pruefe('von heute ohne bis', P.abwesendHeute([A({ ma:'A, B', von:'2026-10-30', zeit:'2026-10-30T08:00' })], '2026-10-30').length === 1);
pruefe('von gestern ohne bis = nicht heute', P.abwesendHeute([A({ ma:'A, B', von:'2026-10-29', zeit:'2026-10-29T08:00' })], '2026-10-30').length === 0);
pruefe('Zeitraum deckt heute', P.abwesendHeute([A({ ma:'A, B', von:'2026-10-27', bis:'2026-10-31', zeit:'2026-10-27T08:00' })], '2026-10-30').length === 1);
pruefe('bis vor von wird ignoriert', P.abwesendHeute([A({ ma:'A, B', von:'2026-10-30', bis:'2026-10-01', zeit:'2026-10-30T08:00' })], '2026-10-30').length === 1);
pruefe('juengste gewinnt', P.abwesendHeute([
  A({ ma:'Muster, Anna', von:'2026-10-27', bis:'2026-10-31', zeit:'2026-10-27T08:00' }),
  A({ ma:'Anna Muster', grund:'Urlaub', von:'2026-11-03', zeit:'2026-10-29T09:00' })], '2026-10-30').length === 0);
// Wichtig
pruefe('BOM und CRLF', JSON.stringify(P.wichtigLesen('﻿# Kopf\r\nBritta\r\n\r\nchef@firma.de\r\n')) === JSON.stringify(['britta', 'chef@firma.de']));
pruefe('Treffer im Namen', P.wichtigTreffer(['britta'], 'Britta Beispiel', 'b@x.de') === 'britta');
pruefe('kein Treffer', P.wichtigTreffer(['britta'], 'Anna', 'a@x.de') === '');
```
Dazu: `einstufen` mit einem Roh-Ergebnis aus je einer Steuerung-, Management-, Performance-, Rest-Mail (Kategorie je Mail), Steuerung-Absender, der zugleich Wichtig-Treffer ist (Kategorie `'Steuerung'`, `wichtig` gesetzt), Roh ohne `termine` (→ `[]`), keine Eigenschaft `inhalt` in `JSON.stringify(ergebnis)`. `wichtigSichern` auf fehlende Datei (legt an, enthält `'britta'`), `wichtigAendern` neu/doppelt/weg/nicht-vorhanden/ungültig (`'a\nb'`), Muster-Zeile `britta` bleibt bei `weg` von `'b@x.de'` stehen. Gegenproben: Regex ohne den Präfix-Ausschluss (Kopie der Regel im Test) muss `AW: MA: …` als Meldung lesen; eine `wichtigLesen`-Variante ohne BOM-Entfernung (`text.split(/\r?\n/)…`) muss `'﻿# kopf'` als Muster liefern.

- [ ] **Step 2: Laufen lassen, muss scheitern**
Run: `node pruefwerkzeuge/postfach_pruefen.js`
Expected: Abbruch mit `Cannot find module '../esl_dienst_postfach.js'`.

- [ ] **Step 3: `esl_dienst_postfach.js` mit den oben genannten Exporten schreiben** (`'use strict'`, nur `fs`, `path`, `./esl_dienst_regeln`; kein Start-Code beim `require`). Schreiben über `fs.writeFileSync(tmp)` + `fs.renameSync`.

- [ ] **Step 4: Laufen lassen, muss grün sein**
Run: `node pruefwerkzeuge/postfach_pruefen.js`
Expected: letzte Zeile `… 0 fehlgeschlagen`.

---

### Task 2: Laufsteuerung (Zeitgeber, Frist, letzter guter Stand, Aktionen)

**Files:**
- Modify: `esl_dienst_postfach.js` (Export ergänzen)
- Create: `pruefwerkzeuge/postfach_schein_leser.js`
- Create: `pruefwerkzeuge/postfach_schein_aktion.js`
- Modify: `pruefwerkzeuge/postfach_pruefen.js` (Abschnitt „2 Laufsteuerung“)

**Interfaces:**
- Consumes: alles aus Task 1.
- Produces: `postfachStarten(opt): Steuerung` mit
  - `opt`: `{ datei: string, leser: string, aktionSkript: string, taktSek: number, fristMs: number, aktionFristMs: number, log(text: string): void, beiLieferung(kopf: {nr, zeit, ok, grund}): void }`
  - `Steuerung`: `{ kopf(): {nr, zeit, ok, grund}, daten(): object, aktion(d: object): Promise<{ok: boolean, grund?: string}>, lesen(): Promise<void>, stoppen(): void }`
- Skript-Start: endet `leser`/`aktionSkript` auf `.js` → `child_process.execFile(process.execPath, [skript, ...args])`; sonst `execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', skript, ...args])`; immer `{ windowsHide: true, encoding: 'utf8', timeout: frist, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024 }`. stdout wird als JSON gelesen (führende/folgende Leerzeichen und BOM weg).

Verhalten:
- `postfachStarten` liest sofort einmal und danach alle `taktSek` (`setInterval`). Läuft ein Lesen noch, tut der Takt nichts.
- Jede Lieferung (auch Fehlschlag): `kopf.nr++`, `kopf.zeit = Date.now()`, `ok`, `grund` (`''` bei ok), dann `beiLieferung({...kopf})`.
- Erfolg: `roh` merken, Daten = `einstufen(roh, wichtigSichern(datei), datumIso(new Date()))`. Fehlschlag (Exit ≠ 0, Frist, kein JSON, `ok:false`): Daten bleiben; `grund` = `'Frist ' + Math.round(fristMs / 1000) + ' s abgelaufen'` bzw. `roh.grund` bzw. `'Leser-Antwort nicht lesbar'` bzw. erste stderr-Zeile (gekürzt auf 200 Zeichen).
- `log`: Erfolg `'Postfach gelesen: <m> Mails, <d> Dispo, <t> Termine (<s> s)'`; Fehlschlag `'Postfach nicht gelesen: ' + grund`. Nie Betreff/Absender/Namen.
- `daten()`: `{ nr, zeit, ok, grund, ...letzteDaten }`; vor dem ersten Erfolg `{ nr, zeit, ok, grund, ungelesen: null, mails: [], abwesend: [], infos: [], termine: [] }` mit `grund` des Kopfs bzw. `'noch nicht gelesen'`.
- `aktion(d)`: `art` ∈ `oeffnen|antworten|entwurf|wichtig_neu|wichtig_weg`, sonst `{ok:false, grund:'unbekannte Aktion'}`.
  - `oeffnen`/`antworten`: `d.entryId` muss `/^[0-9A-Fa-f]{16,1024}$/` erfüllen; Aufruf `aktionSkript` mit `['-Art', art, '-EntryId', d.entryId]`.
  - `entwurf`: `d.entwurf = {betreff ≤ 300, text ≤ 20000}` (Strings); Aufruf mit `['-Art', 'entwurf', '-Daten', base64(JSON.stringify({betreff, text}))]`.
  - Skript-Antwort `{ok, grund}`; Frist `aktionFristMs` → `{ok:false, grund:'Outlook antwortet nicht (30 s)'}`.
  - `wichtig_neu`/`wichtig_weg`: `wichtigAendern(datei, 'neu'|'weg', d.eintrag)`; bei `ok` und vorhandenem `roh` sofort neu einstufen (ohne Outlook) und als Lieferung melden (nr++ , `beiLieferung`).

Schein-Skripte (Testwerkzeuge, kein `*_pruefen.js`):
- `postfach_schein_leser.js`: Modus aus `process.env.PF_SCHEIN`: `ok` (festes LeserErgebnis mit 3 Mails, 2 Dispo, 1 Termin), `umlaut` (wie ok, Absender `Özdemir, Ünal`, Betreff `Prüfung Größe`), `fehler` (`{ok:false, grund:'Outlook (klassisch) nicht erreichbar'}`), `kaputt` (stdout `kein json`), `haengt` (wartet 20 s, dann ok). Schreibt mit `process.stdout.write`.
- `postfach_schein_aktion.js`: hängt `JSON.stringify(process.argv.slice(2))` + `\n` an die Datei aus `process.env.PF_SCHEIN_PROTOKOLL` und gibt `{"ok":true}` aus.

- [ ] **Step 1: Tests schreiben** (Abschnitt „2 Laufsteuerung“, async, mit `taktSek: 3600`, damit nur der Startlauf zählt; `process.env.PF_SCHEIN` vor jedem `postfachStarten` setzen — `execFile` erbt die Umgebung):
  - `ok`: nach `await s.lesen()` (bzw. Warten auf `beiLieferung`) `kopf().nr >= 1`, `ok === true`, `daten().mails.length === 3`, `daten().abwesend` aus dem Fixture korrekt.
  - `umlaut`: `daten().mails[0].absender === 'Özdemir, Ünal'`.
  - letzter guter Stand: erst `ok`, dann Modus `fehler` und erneut `s.lesen()` → `kopf().ok === false`, `grund` enthält `nicht erreichbar`, `daten().mails.length === 3`, `nr` um 1 höher.
  - `kaputt` → `grund === 'Leser-Antwort nicht lesbar'`.
  - Frist: `haengt` mit `fristMs: 1500` → nach ≤ 4 s `grund === 'Frist 2 s abgelaufen'`, Kindprozess beendet.
  - kein Doppel-Lesen: zwei `s.lesen()` gleichzeitig im Modus `haengt` (Frist 1500) → genau eine Lieferung.
  - Aktionen: `oeffnen` mit `entryId:'00AB'.repeat(8)` → Protokoll enthält `["-Art","oeffnen","-EntryId","00AB00AB…"]`; `entryId:'x; rm'` → `{ok:false}` und KEIN neuer Protokolleintrag; `entwurf` → `-Daten` dekodiert ergibt `{betreff, text}` samt Umlauten; `art:'senden'` → `unbekannte Aktion`.
  - `wichtig_neu` mit `'chef@firma.de'` → Datei enthält die Zeile, `nr` erhöht, Mail von `chef@firma.de` im Fixture hat danach `wichtig === 'chef@firma.de'`.
  - Log-Wache: alle `log`-Texte eines `ok`-Laufs gegen jeden Betreff/Absender des Fixtures prüfen → kein Treffer; `JSON.stringify(kopf())` hat genau die Schlüssel `nr, zeit, ok, grund`.
  - Gegenprobe: eine Kopie der Antwortverarbeitung, die bei Fehlschlag die Daten leert, muss den Test „letzter guter Stand“ nicht bestehen (im Werkzeug als kleine Funktion nachgestellt und mit derselben Prüfung gemessen).
  - Am Ende jedes Falls `s.stoppen()`.

- [ ] **Step 2: Laufen lassen, muss scheitern**
Run: `node pruefwerkzeuge/postfach_pruefen.js`
Expected: FEHL-Zeilen in Abschnitt 2 (`postfachStarten is not a function`).

- [ ] **Step 3: `postfachStarten` in `esl_dienst_postfach.js` umsetzen und exportieren; Schein-Skripte anlegen.**

- [ ] **Step 4: Laufen lassen, muss grün sein**
Run: `node pruefwerkzeuge/postfach_pruefen.js`
Expected: `… 0 fehlgeschlagen`, Laufzeit unter 30 s.

---

### Task 3: PowerShell-Skripte (Outlook lesen, Aktion ausführen)

**Files:**
- Create: `postfach_lesen.ps1`
- Create: `postfach_aktion.ps1`
- Modify: `pruefwerkzeuge/postfach_pruefen.js` (Abschnitt „3 Skripte“)

**Interfaces:**
- `postfach_lesen.ps1` (keine Parameter) → stdout genau ein JSON = `LeserErgebnis` (Task 1). Vorlage: `../../TL_Command_Center/TL_Starter.cmd`, `HoleOutlookDaten` ab Z. 172, Kalender ab Z. 285.
- `postfach_aktion.ps1 -Art <oeffnen|antworten|entwurf> [-EntryId <hex>] [-Daten <base64>]` → stdout `{ok, grund}`. Vorlage: `OeffneOutlookElement` ab Z. 119.

Inhalt:
- Beide: UTF-8 mit BOM; erste Anweisungen `$ErrorActionPreference = 'Stop'` und `[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false`; Outlook über `[Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')`, sonst `New-Object -ComObject Outlook.Application`; scheitert beides → `{ok:false, grund:'Outlook (klassisch) nicht erreichbar: <Meldung>'}`. Gesamter Rumpf in `try/catch`, jede Ausgabe über `ConvertTo-Json -Depth 5 -Compress`, Exit-Code 0.
- Lesen: Posteingang `GetDefaultFolder(6)`, `Items.Sort('[ReceivedTime]', $true)`, die ersten 60 → `mails` (`zeit` = `ReceivedTime.ToString('yyyy-MM-ddTHH:mm')`, SMTP über `Sender.GetExchangeUser().PrimarySmtpAddress`, wenn die Adresse mit `/o=` beginnt oder kein `@` hat; `vorschau` = Body mit zusammengezogenen Leerräumen, ≤ 180 Zeichen + `...`). Dispo: `Items.Restrict("[ReceivedTime] >= '" + (Get-Date).Date.AddDays(-7).ToString('g') + "'")`, davon Betreff `-match 'MA:'` → `dispo` (`entryId, zeit, betreff`), höchstens 300. Kalender `GetDefaultFolder(9)`, `IncludeRecurrences = $true`, `Sort('[Start]')`, Restrict auf heute 00:00–23:59, `MeetingStatus` 5/7 oder Titel `^(Abgesagt|Canceled|Cancelled|Entfällt|Entfaellt)\s*:` raus, ganztägig wie TL, höchstens 25 → `termine` (`start`/`ende` = `HH:mm`, bei ganztägig `''`). `ungelesen` = `UnReadItemCount`. Arrays immer als `@(...)`; Fehler in einem einzelnen Element überspringen (inneres `try/catch`).
- Aktion: `GetNamespace('MAPI').GetItemFromID($EntryId)`; `oeffnen` → `.Display($false)`; `antworten` → `.Reply().Display($false)`; `entwurf` → Base64 → UTF-8 → `ConvertFrom-Json`, `CreateItem(0)`, `Subject`, `Body`, `To` leer, `.Display($false)`. Danach `AppActivate` wie TL (Fehler ignorieren).

- [ ] **Step 1: Tests schreiben** (Abschnitt „3 Skripte“): beide Dateien beginnen mit den Bytes `EF BB BF`; beide enthalten `UTF8Encoding $false`; keine Datei enthält `.Send(` (Groß/klein egal); `postfach_lesen.ps1` enthält nicht `inhalt` und liest höchstens 60 Mails (`60` im Quelltext der Mail-Schleife); `postfach_aktion.ps1` enthält `Display($false)` dreimal. PowerShell-Parserprobe über `execFileSync('powershell.exe', ['-NoProfile','-Command', "$e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('<pfad>',[ref]$null,[ref]$e); $e.Count"])` → `0` je Datei (fehlt `powershell.exe`, als `[--] übersprungen` melden, nicht grün). Gegenprobe: eine Kopie der Aktion mit eingefügtem `$m.Send()` in einen Temp-Text muss von der Send-Regel erkannt werden.

- [ ] **Step 2: Laufen lassen, muss scheitern** — Run: `node pruefwerkzeuge/postfach_pruefen.js`; Expected: FEHL in Abschnitt 3 (Datei fehlt).

- [ ] **Step 3: Beide Skripte schreiben** (Datei mit BOM speichern: in Node `fs.writeFileSync(p, '﻿' + text, 'utf8')` oder Editor-Speichern „UTF-8 mit BOM“).

- [ ] **Step 4: Laufen lassen, muss grün sein** — Expected: `… 0 fehlgeschlagen`.

- [ ] **Step 5 (nur wenn Outlook klassisch auf diesem PC läuft): Rauchprobe ohne Inhalt.** Mailinhalt darf nicht ins Terminal:
Run: `powershell -NoProfile -ExecutionPolicy Bypass -File postfach_lesen.ps1 | node -e "let t='';process.stdin.on('data',d=>t+=d).on('end',()=>{const j=JSON.parse(t.replace(/^﻿/,''));console.log('ok',j.ok,'grund',j.grund||'','mails',(j.mails||[]).length,'dispo',(j.dispo||[]).length,'termine',(j.termine||[]).length)})"`
Expected: `ok true … mails 60` (oder weniger bei kleinem Postfach). Läuft kein klassisches Outlook: `ok false grund Outlook (klassisch) nicht erreichbar…` — dann im Bericht vermerken, kein Fehler.

---

### Task 4: Einbau in den Datendienst (Schalter, Stand, Routen, Starter, Verteilung)

**Files:**
- Modify: `esl_dienst.js` (Einstellungen Z. ~39–50, `standSchreiben` Z. ~149, `bearbeiten` Z. ~484, `start` Z. ~575)
- Modify: `ESL_Dienst_Start.cmd`
- Modify: `.gitignore`
- Modify: `bundle_bauen.js` (Liste `DATEIEN`, Block „Datendienst“ Z. ~94)
- Modify: `pruefwerkzeuge/postfach_pruefen.js` (Abschnitt „4 Einbau“)

**Interfaces:**
- Consumes: `postfachStarten`, `WICHTIG_VORLAGE` (Task 1/2).
- Produces für v22: `stand.postfach = {nr, zeit, ok, grund}` (nur bei Schalter an); `GET /api/postfach` → `daten()`; `POST /api/postfach/aktion` → `{ok, grund?}` (Status 200; Körper nicht lesbar → 400 `{ok:false, grund:'Anfrage nicht lesbar'}`).

Änderungen:
- Einstellungen: `const POSTFACH = U.ESL_DIENST_POSTFACH === '1';` `const POSTFACH_TAKT_SEK = Number(U.ESL_DIENST_POSTFACH_TAKT_SEK) || 180;` `const POSTFACH_LESER = U.ESL_DIENST_POSTFACH_LESER || path.join(ORDNER, 'postfach_lesen.ps1');` `const POSTFACH_AKTION = U.ESL_DIENST_POSTFACH_AKTION || path.join(ORDNER, 'postfach_aktion.ps1');` `let postfach = null;`
- `standSchreiben(nebenher)`: `fortschritt = Date.now()` nur, wenn `!nebenher` (der Hänger-Wächter misst den Arbeiter, nicht das Postfach).
- `start()`: direkt vor dem ersten `standSchreiben()` bei `POSTFACH`: `stand.postfach = { nr: 0, zeit: 0, ok: false, grund: 'noch nicht gelesen' }`; nach dem `log('Datendienst laeuft…')`, ebenfalls nur innerhalb von `if (POSTFACH)`: `postfach = postfachStarten({ datei: path.join(ORDNER, 'Postfach_Wichtig.txt'), leser: POSTFACH_LESER, aktionSkript: POSTFACH_AKTION, taktSek: POSTFACH_TAKT_SEK, fristMs: 60000, aktionFristMs: 30000, log, beiLieferung: (k) => { k.grund = sauber(k.grund); stand.postfach = k; wechsel('postfach', k.ok, k.ok ? 'Postfach: Outlook gelesen' : 'Postfach: ' + k.grund); standSchreiben(true); } })`. Logzeile beim Start ergänzen: `' | Postfach ' + (POSTFACH ? 'an' : 'aus')`. `standLaden` bleibt unverändert (übernimmt kein altes `postfach`).
- `bearbeiten`: GET `if (POSTFACH && pfad === '/api/postfach') return json(res, 200, postfach ? postfach.daten() : { ok: false, grund: 'startet' });` — POST `if (POSTFACH && req.method === 'POST' && pfad === '/api/postfach/aktion')` → `koerper(req)` (Fehler → 400), dann `json(res, 200, await postfach.aktion(d))`. Ohne Schalter greift die bestehende 404-Zeile.
- `ESL_Dienst_Start.cmd`, vor `setlocal EnableDelayedExpansion`:
```
rem Postfach-Seite (Outlook klassisch) - NUR auf dem eigenen PC einschalten, nie am Wandmonitor.
rem 1 = an, 0 = aus. Wichtige Absender: Postfach_Wichtig.txt (legt der Dienst beim ersten Start an).
set "ESL_DIENST_POSTFACH=0"
```
- `.gitignore`, unter dem Datendienst-Block: `Postfach_Wichtig.txt`
- `bundle_bauen.js`, im Datendienst-Block: `esl_dienst_postfach.js` (`'Datendienst: Postfach einstufen'`), `postfach_lesen.ps1` (`'Datendienst: Outlook lesen'`), `postfach_aktion.ps1` (`'Datendienst: Outlook-Aktion'`), alle `pflicht: false`.

- [ ] **Step 1: Tests schreiben** (Abschnitt „4 Einbau“, statisch + geschnitten wie `dienst_kern_pruefen.js`): `standSchreiben` aus `esl_dienst.js` schneiden und mit Stubs (`stand`, `schreibeAtomar`, `fortschritt`, `STAND`, `log`) auswerten: `standSchreiben(true)` lässt `fortschritt` stehen, `standSchreiben()` setzt ihn, beide zählen `stand.nr` hoch. Statisch: `esl_dienst.js` enthält `U.ESL_DIENST_POSTFACH === '1'`; beide Routen-Zeilen beginnen mit `POSTFACH &&` bzw. enthalten `if (POSTFACH &&`; `stand.postfach =` kommt nur innerhalb von `if (POSTFACH)` bzw. `beiLieferung` vor; `postfachStarten(` steht genau einmal in `esl_dienst.js` und innerhalb eines `if (POSTFACH)`-Blocks (Schalter aus = nie PowerShell); `ESL_Dienst_Start.cmd` enthält `set "ESL_DIENST_POSTFACH=0"` und keine Zeile `set "ESL_DIENST_POSTFACH=1"`; `.gitignore` enthält `Postfach_Wichtig.txt`; `bundle_bauen.js` enthält die drei Dateinamen und NICHT `Postfach_Wichtig`. Gegenprobe: dieselbe `standSchreiben`-Prüfung gegen die alte Fassung (Text mit unbedingtem `fortschritt = Date.now();`) muss rot werden.
- [ ] **Step 2: Laufen lassen, muss scheitern.** Run: `node pruefwerkzeuge/postfach_pruefen.js`
- [ ] **Step 3: Änderungen umsetzen.**
- [ ] **Step 4: Prüfen.** Run: `node --check esl_dienst.js && node pruefwerkzeuge/postfach_pruefen.js && node pruefwerkzeuge/dienst_kern_pruefen.js && node pruefwerkzeuge/dienst_regeln_pruefen.js`
Expected: kein Syntaxfehler, alle drei Werkzeuge `0 fehlgeschlagen`.

---

### Task 5: Dashboard-Seite „Postfach“ in v22

**Files:**
- Modify: `esl_live_arena_v22.js` — `rcDienstEmpfangTick` (Z. ~423, neuer Schritt 5), neuer Block `rcPostfach*` direkt hinter `rcDienstEmpfangTick`, Clean-State (Z. ~536: `rcDienstGesehen` um `postfach: 0` ergänzen; dazu `window.rcPostfachDaten = null; window.rcPostfachKopfStand = null; window.rcPostfachFilter = 'Alle';`)
- Create: `pruefwerkzeuge/postfach_seite_pruefen.js`
- Create: `test_postfach.html`

**Interfaces:**
- Consumes: `GET /api/postfach` → `PostfachDaten` + `{nr, zeit, ok, grund}`; `stand.postfach`; `rcDienstHole(pfad, 'json', ms)`, `rcDienstAnfrage(pfad, daten, ms)` (Z. ~281/401); `window.rcNormName` (Z. ~2234); `window.rcWcaMapping.ccsMap[ccs] = {name, team, standort, ccsId}`; `window.rcActiveScope()`; `rcStandRows(null, scope).rows`; `rcAggTeams(rows)`; `rcPoolQuote(t, key)`; `window.rcToast(html, ms)`; `window.__rcPagesRef`, `window.__rcSwitchPageFn`, `window.__rcOverlayEl`.
- Produces (Funktionsdeklarationen):
  - `rcPostfachTeamIndex(map): Object<normName, {team, standort}>` aus `map.ccsMap` (leeres Objekt ohne Mapping).
  - `rcPostfachTeam(idx, ma): string` — Team oder `'—'`.
  - `rcPostfachHtml(d, kopf, idx, filter, teams): string` — reine Funktion, jeder Datenwert durch eine Escape-Funktion (`& < > "`).
  - `rcPostfachMailText(team, t, uhr): {betreff, text}` — `t` = Zeile aus `rcAggTeams`.
  - `rcPostfachTeams(): Array` — `rcAggTeams(rcStandRows(null, window.rcActiveScope()).rows)`, nur Teams mit `calls > 0` oder `mitEsl > 0`.
  - `rcPostfachSeiteSicher()`, `rcPostfachKopf(pf)`, `rcPostfachAnnehmen(d)`, `rcPostfachZeichnen()`, `rcPostfachAktion(d)`.

Verhalten:
- Schritt 5 in `rcDienstEmpfangTick` (nach den Ereignissen): `const PF = S.postfach; if (PF) { rcPostfachKopf(PF); if (PF.nr !== G.postfach) { const f = await rcDienstHole('/api/postfach', 'json', 15000); G.postfach = PF.nr; if (f.ok && f.daten) rcPostfachAnnehmen(f.daten); else rcPostfachKopf(Object.assign({}, PF, { grund: 'Postfach nicht abrufbar (' + f.grund + ')' })); } }` — `!==`, nicht `>` (ein Dienst-Neustart beginnt wieder bei 0). Ohne `S.postfach` passiert nichts (keine Seite).
- `rcPostfachSeiteSicher()`: legt einmal an (Prüfung per id): Reiter `button.rc-page-btn#rcPagePostfach[data-page=postfach]` „Postfach“ direkt hinter `#rcPageCockpit` in `.rc-pageswitch`; Inhalt `div#rcPagePostfachContent` (`display:none`) vor `.rc-marquee` in `window.__rcOverlayEl`; `window.__rcPagesRef.postfach = ['rcPagePostfach', 'rcPagePostfachContent', 'block']`; Klick → `window.__rcSwitchPageFn('postfach')`; EIN Klick-Listener (Delegation) auf dem Inhalt; Stil `<style id="rcPostfachCss">` (vorhandenes ersetzen). Nie in `rcAutoRotPages`.
- Seite (Aufbau nach Entwurf `.superpowers/brainstorm/1483-1793324403/content/postfach-layout.html`): Kopf mit vier Kacheln — ungelesen (`d.ungelesen`), wichtig (Mails mit `wichtig` UND `ungelesen`), abwesend heute (`d.abwesend.length`), Termine heute (`d.termine.length`) — und rechts „Outlook gelesen HH:MM“ aus `kopf.zeit`; bei `kopf.ok === false` stattdessen amber „Nicht gelesen: <grund>“, letzter Stand bleibt darunter. Spalten: links Abwesend heute (Name, Team, Grund-Kennzeichen, `bis` als „bis TT.MM.“) und Mitarbeiterinfos (Name, Team, art, text); Mitte Wichtige Mails (`wichtig` gesetzt) und Posteingang mit Chips Alle · Steuerung · Management · Performance · Rest (`window.rcPostfachFilter`, nicht gespeichert); je Mail Knöpfe „In Outlook öffnen“ (`oeffnen`), „Antworten“ (`antworten`), „als wichtig markieren“ (`wichtig_neu`, `eintrag = email`) bzw. bei gesetztem `wichtig` „Entfernen“: nur wenn `wichtig === email.toLowerCase()` → `wichtig_weg`, sonst Hinweis-Toast `kommt über ‚<wichtig>‘ — in Postfach_Wichtig.txt ändern`; rechts Termine heute (Uhrzeit/„Ganztägig“, Titel) und „Mail an Team“ (ein Knopf je `rcPostfachTeams()`-Zeile → `entwurf` mit `rcPostfachMailText`). Knöpfe tragen `data-pf-art`, `data-pf-id` bzw. `data-pf-team`.
- `rcPostfachMailText(team, t, uhr)` (exakt; Zahl ohne Wert = `—`, Dezimal mit Komma, eine Nachkommastelle):
```
betreff: 'Teamwerte ' + team + ' ' + TT.MM.JJJJ
text:
Hallo Team <team>,

hier eure Werte von heute (Stand <uhr>):
Calls: <t.calls>
Ansprachen: <t.ansp>
BNT: <t.bnt>
VVL: <t.vvl>
CS: <rcPoolQuote(t,'cs')>
TNPS: <rcPoolQuote(t,'tnps')>
FQ: <rcPoolQuote(t,'fq')> %

Viele Grüße
```
- `rcPostfachAktion(d)`: `rcDienstAnfrage('/api/postfach/aktion', d, 45000)` → Toast „Erledigt“ bzw. „Nicht ausgeführt: <grund>“ (escaped).
- Datenschutz: keine `rcLog`-/`rcLogEreignis`-Zeile mit Betreff, Absender, Name, Vorschau (erlaubt: Zählwerte, `grund`); kein `localStorage` im Block.

- [ ] **Step 1: `pruefwerkzeuge/postfach_seite_pruefen.js` schreiben** — schneidet `rcPostfachTeamIndex`, `rcPostfachTeam`, `rcPostfachHtml`, `rcPostfachMailText` und `window.rcNormName = function` aus v22 (Klammer-Zählung wie in `quoten_modul_pruefen.js`) und wertet mit `new Function` aus. Pflichtfälle: Mapping-Name `Muster Anna` trifft Dispo `Muster, Anna`; Mapping `Özdemir Ünal` trifft Dispo `Özdemir, Ünal`; Mapping `Oezdemir Uenal` trifft `Özdemir, Ünal` NICHT (`rcNormName` macht aus `ö` ein `o`, nicht `oe`) → `'—'`, hält die bestehende Regel fest; unbekannter Name → `'—'` und Eintrag steht trotzdem im HTML; Betreff `<script>alert(1)</script>` erscheint nur escaped; HTML enthält alle Abwesenden unabhängig von einem gesetzten Filterobjekt (es gibt keinen Filter-Parameter für Abwesend); bei `kopf.ok === false` steht der Grund im HTML und die Mails stehen weiter darin; Muster-Treffer (`wichtig: 'britta'`) erzeugt keinen `wichtig_weg`-Knopf; `rcPostfachMailText` mit `cs: null` → Zeile `CS: —`, mit `fq` 31.25 → `FQ: 31,3 %`. Statisch: `'postfach'` steht nicht in `window.rcAutoRotPages = [...]` und nicht in den beiden `cfgRot_`-Listen (Zeilen mit `['queue','Warteschleife']` und `[['queue'],['info']]`); `rcDienstGesehen` enthält `postfach:0` bzw. `postfach: 0`; der `rcPostfach`-Block enthält kein `localStorage`; jede `rcLog`-Zeile im Block enthält keines der Wörter `betreff|absender|vorschau|\.ma\b|email`; der Flugschreiber (`wickleFetch` in `rcFlugschreiberStarten`) wertet weiter nur POSTs mit FormData aus (`istFormData(body)` steht in der Bedingung) — damit zeichnet er `/api/postfach*` nicht auf, eine Änderung dort ist nicht nötig. Gegenprobe: eine `rcPostfachHtml`-Variante mit abgeschaltetem Escape (Escape-Funktion durch Identität ersetzt) muss die Escape-Prüfung verfehlen.
- [ ] **Step 2: Laufen lassen, muss scheitern.** Run: `node pruefwerkzeuge/postfach_seite_pruefen.js` — Expected: Abbruch `rcPostfachHtml fehlt`.
- [ ] **Step 3: Block in v22 umsetzen** (Funktionsdeklarationen; Clean-State-Ergänzungen; Schritt 5 im Empfang).
- [ ] **Step 4: Prüfen.** Run: `node --check esl_live_arena_v22.js && node pruefwerkzeuge/tdz_pruefen.js 2>&1 | grep -Eo "aufgerufen: +[0-9]+" && node pruefwerkzeuge/postfach_seite_pruefen.js && node pruefwerkzeuge/dienst_empfang_pruefen.js && node pruefwerkzeuge/dienst_schalter_pruefen.js`
Expected: TDZ `aufgerufen: 0`, alle Werkzeuge `0 fehlgeschlagen`.
- [ ] **Step 5: Browser-Prüfseite `test_postfach.html`** (Aufbau wie `test_reportbilder.html`; vor dem Laden von v22 `window.__rcDienst = { basis: '' }` setzen und `window.fetch` so ersetzen, dass `/api/stand` einen Stand mit `postfach:{nr:1, zeit:<jetzt>, ok:true, grund:''}` und leeren `esl/liga/vortage`-Nummern liefert, `/api/postfach` ein festes `PostfachDaten` (2 Abwesende, 1 Info, 4 Mails davon 1 wichtig, 2 Termine), `POST /api/postfach/aktion` den Körper in `window.__pfAktionen` ablegt und `{ok:true}` antwortet, alles andere 404). Die Seite meldet in `window.__pfErgebnis` je Prüfung ok/fehl: Reiter `#rcPagePostfach` steht direkt hinter `#rcPageCockpit`; nach Klick ist `#rcPagePostfachContent` sichtbar und zeigt vier Kacheln; `rcActivePage` war beim Start `'arena'`; `rcAutoRotPages` ohne `'postfach'`; Klick auf „Antworten“ legt `{art:'antworten', entryId:…}` in `__pfAktionen`; Re-Inject (`(0,eval)(quelltext)` mit Cache-Buster) → genau 1 `#rcPagePostfach`, 1 `#rcPagePostfachContent`, 1 `#rcLiveDashboard`; zweiter Durchlauf mit Stand OHNE `postfach` (Query `?aus=1`) → kein `#rcPagePostfach`.
Run: Server `esl-offline` aus `.claude/launch.json` starten (Port 8412), `http://localhost:8412/test_postfach.html` und `…?aus=1` öffnen, nach ~20 s `window.__pfErgebnis` lesen (Skill `run-esl-live-arena` bzw. Browser-Pane).
Expected: alle Einträge ok, keine Konsolenfehler aus dem `rcPostfach`-Block.

---

### Task 6: Doku und Gesamtprüfung

**Files:**
- Modify: `CLAUDE.md` (Abschnitt „Aktueller Stand“: neuer Absatz „MAIL-ZENTRUM (Vorhaben 3, 30.10.)“ hinter „DATENDIENST“; Werkzeugliste „NEU 30.10.“ mit `postfach_pruefen.js` und `postfach_seite_pruefen.js` samt gezählten Prüfungen; Sammel-Einzeiler-Text „von 62“ → neue Zahl; Prüfstand-Tabelle Zeile „Mail-Zentrum 30.10.“ mit „nein — offline + Browser-Prüfseite“)
- Modify: `ANLEITUNG.md` (kurzer Abschnitt „Postfach-Seite“: Schalter in `ESL_Dienst_Start.cmd` auf 1, nur eigener PC, `Postfach_Wichtig.txt` bearbeiten oder Knopf, braucht Outlook klassisch)

- [ ] **Step 1: Doku schreiben** (Inhalt aus Spec und tatsächlichen Messwerten; Prüfzahlen aus den Werkzeug-Ausgaben, nicht geschätzt).
- [ ] **Step 2: Gesamtprüfung.** Run (Bash, aus dem Projektordner): den Sammel-Einzeiler aus `CLAUDE.md` (Abschnitt 5aa), `node pruefwerkzeuge/tdz_pruefen.js 2>&1 | grep -Eo "aufgerufen: +[0-9]+"`, `for f in esl_dienst*.js esl_live_arena_v22.js; do node --check "$f" || echo "SYNTAX $f"; done`
Expected: `ROTE WERKZEUGE: 0`, TDZ `aufgerufen: 0`, keine `SYNTAX`-Zeile.
- [ ] **Step 3: Graph nachziehen.** Run: `graphify update .`
Expected: läuft ohne Fehler durch.
- [ ] **Step 4: Bericht an den Nutzer:** was offline gemessen ist, dass der echte Outlook-Test nur auf seinem PC geht, Schalter ab Werk aus. Kein Commit, kein Paket ohne Anweisung.
