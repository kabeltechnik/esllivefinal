# Mail-Zentrum für die Live-Arena (Vorhaben 3 von 4)

Stand 30.10.2026. Vorgänger: `2026-10-26-datendienst-design.md` (Vorhaben 1, gebaut, auf Citrix noch nicht abgenommen). Vorhaben 2 (Spiel ins Archiv) wird übersprungen.

## Absicht

Die Live-Arena soll das TL Command Center ablösen. Dessen Postfach-Seite (Outlook: Dispo, Management, Kalender, 1-Klick-Mail) fehlt in der Arena. Der Teamleiter will sie als eigene Seite im Dashboard, damit er morgens und zwischendurch an einer Stelle sieht: wer fehlt, was die Steuerung meldet, was die Leitung schreibt, welche Termine heute anstehen.

## Ziele

- Eigene Seite **„Postfach“**, Reiter direkt rechts neben „Steuerung“ (`cockpit`).
- Inhalte (Entwurf im Browser abgestimmt, `.superpowers/brainstorm/…/postfach-layout.html`):
  - Kopf: vier Kacheln — ungelesen · wichtig · abwesend heute · Termine heute — plus „Outlook gelesen HH:MM“.
  - Links: **Abwesend heute** (Dispo-Mails Typ „Grund“: Name, Team, Grund als farbiges Kennzeichen, ggf. Zeitraum) und **Mitarbeiterinfos** (Dispo-Mails Typ „Auffälligkeit“).
  - Mitte: **Wichtige Mails** (Absender aus der Wichtig-Liste) und **Posteingang** mit Filtern Alle · Steuerung · Management · Performance · Rest; je Mail „In Outlook öffnen“, „Antworten“, „als wichtig markieren“.
  - Rechts: **Termine heute** und **Mail an Team** (Outlook-Entwurf mit den heutigen Werten eines Teams; gesendet wird von Hand).
- **Wichtig-Liste** pflegbar ohne Code: Datei `Postfach_Wichtig.txt` neben `esl_dienst.js` UND Knopf in der Seite (markieren / entfernen), beide schreiben dieselbe Datei.

## Nicht-Ziele

- Handy-Mail (Push/Pull aus dem TL) — nicht in diesem Vorhaben.
- Automatisches Senden irgendeiner Mail. Es werden nur Entwürfe/Antwortfenster geöffnet.
- Abwesenheit beim Agenten in Arena/Ranglisten anzeigen (Nutzer: „Mail-Seite komplett getrennt“).
- Postfach im alten Betrieb (`ESL_Start.cmd`, Autopilot). Nur im Dienst-Betrieb.
- PureCloud-Anwesenheit (Vorhaben 4).

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es läuft)

- Mailinhalte, Namen mit Krankheitsgrund oder Kollegen-Adressen erscheinen auf einem Wandmonitor, im Seitenwechsel, in `Dienst_Daten/`, in `esl_dienst.log`, im Logbuch, in einem Update-Paket oder auf GitHub.
- Das Lesen von Outlook verzögert ESL- oder Liga-Abrufe.
- Eine Mail geht ohne Klick des Nutzers raus.
- Eine Dispo-Meldung verschwindet still (Name nicht im Mapping, Mail älter als die 45 neuesten).

## Randbedingungen

- Citrix (`ve1802`), keine Installation, keine Adminrechte. Node 22 (`node\node.exe` darf daneben liegen), PowerShell 5.1, Outlook klassisch (COM). Das „neue Outlook“ hat kein COM — dann meldet die Seite das, statt zu raten.
- `.ps1`-Dateien mit BOM; Ausgabe als UTF-8 erzwingen (`[Console]::OutputEncoding`), sonst brechen Umlaute in Namen.
- Datendienst-Regeln gelten weiter: nur `127.0.0.1`, Cookie `rcDienst`, R12 (keine Adresse/kein Geheimnis roh nach außen), Emojis verboten, Design `VODAFONE_DESIGN.md` (dunkel).
- `rcBuildAggSheets` und andere Export-Wege bleiben unberührt.
- Reiter-/Schalterlisten im Konfigurator: Zwei-Listen-Falle (Aufbau UND Handler) beachten; neue Seite darf in **keiner** Rotationsliste landen.

## Gewählter Weg (Approaches)

Erwogen:

- **A — Dienst startet alle 3 Min ein PowerShell-Leseskript** (`execFile`), hält das Ergebnis nur im Speicher; Aktionen ebenfalls je Aufruf ein Skript. Ein Start, nichts auf Platte, TL-Logik fast 1:1. Kosten: 1–2 s PowerShell-Start je Lauf. **Gewählt (Nutzer).**
- B — eigenes PowerShell-Fenster wie der TL-Starter, schreibt eine Datei. Verworfen: zweites Fenster, Mailinhalte auf Platte.
- C — dauerhaft offener PowerShell-Prozess. Verworfen: hängt bei Outlook-Neustart, eigene Heilung nötig, mehr Code für 2 s Ersparnis.

## Entschiedenes zum Wie

**Schalter.** `ESL_Dienst_Start.cmd` bekommt `set "ESL_DIENST_POSTFACH=0"` (ab Werk aus). Nur `1` schaltet ein. Aus = der Dienst ruft nie PowerShell/Outlook auf, `/api/postfach*` antwortet 404, `stand.json` trägt kein `postfach`, die Seite entsteht nicht.

**Dienst-Seite (Node).**
- Neues Modul `esl_dienst_postfach.js`; Skripte `postfach_lesen.ps1` (liest, schreibt JSON auf stdout) und `postfach_aktion.ps1` (Parameter `-Art`, ein Aufruf je Aktion).
- Eigener Zeitgeber, **nicht** in der ESL/Liga-Warteschlange: Takt 180 s (`ESL_DIENST_POSTFACH_TAKT_SEK`), höchstens ein Lesen gleichzeitig, Frist 60 s (danach Prozess beenden, Fehler melden). Erster Lauf direkt nach Start.
- Ergebnis nur im Speicher. Scheitert ein Lauf, bleibt der letzte gute Stand und `grund` wird gesetzt (wie TL „Zero-Data-Loss“). `stand.json` bekommt nur `postfach:{nr, zeit, ok, grund}` — kein Inhalt. `nr` zählt bei jeder Lieferung hoch (R5-Gedanke).
- Log: nur Zählungen und Fehlertexte von PowerShell, nie Betreff, Absender oder Namen.
- API (hinter Cookie): `GET /api/postfach` → letzter Stand (JSON). `POST /api/postfach/aktion` mit `{art, entryId?, entwurf?, eintrag?}`, `art` ∈ `oeffnen` · `antworten` · `entwurf` · `wichtig_neu` · `wichtig_weg`. `wichtig_*` ändert die Datei in Node (kein PowerShell), danach sofort neu einstufen ohne Outlook neu zu lesen.

**Lesen (PowerShell, Vorlage `TL_Command_Center/TL_Starter.cmd`, `HoleOutlookDaten` ab Z. 172, Kalender ab Z. 285, Öffnen `OeffneOutlookElement` ab Z. 119).**
- Outlook: `GetActiveObject`, sonst `New-Object -ComObject` (wie TL).
- Posteingang: die neuesten 60 Mails für die Liste (Felder wie TL: `entryId, zeit, datum, absender, email (SMTP aufgelöst), betreff, ungelesen, vorschau ≤180, inhalt ≤2400`).
- Dispo getrennt: alle Mails der letzten **7 Tage** von `vodafone-disposition`/Betreff `MA: …` (per `Restrict` auf `[ReceivedTime]`), damit eine Krankmeldung vom Montag am Donnerstag noch zählt.
- Kalender: heute (00:00 bis 23:59), abgesagte raus, Ganztägiges getrennt (wie TL), höchstens 25.
- Zahlen: `ungelesen` aus `UnReadItemCount`.

**Einstufen (Node, damit testbar ohne Outlook).**
- Kategorie wie TL: Steuerung (Absender/Name enthält `vodafone-disposition|disposition|steuerung` oder Betreff `^MA:`) · Management (Wichtig-Liste) · Performance (Betreff `pix|wca|croco|storno|audit|connect|mystery|provision|ligaliste|zielvereinbarung`) · Rest. Steuerung schlägt Management.
- Dispo-Betreff: `MA:\s*([^,]+,\s*[^,]+),\s*(Grund|Auff[^:]*):\s*([^,]+)(?:,\s*von:\s*([^,]+))?(?:,\s*bis:\s*([^,]+))?` — `Grund` → Abwesend, `Auff…` → Mitarbeiterinfo.
- „Abwesend heute“: `von` ≤ heute und (`bis` ≥ heute, oder ohne `bis`: `von` = heute). Ohne `von` gilt das Eingangsdatum. Mehrere Meldungen derselben Person: die jüngste gewinnt.
- Team: Name „Nachname, Vorname“ über die Mitarbeiter-Excel (`rcNormName`-Logik: klein, Umlaute ersetzt, Teile sortiert). Kein Treffer → Eintrag bleibt, Team „—“.
- Wichtig: eine Zeile der Datei trifft, wenn sie (klein) in `absender + " " + email` (klein) vorkommt. `#`-Zeilen und Leerzeilen zählen nicht.

**`Postfach_Wichtig.txt`.** Fehlt sie beim Start mit eingeschaltetem Schalter, legt der Dienst sie an, vorbelegt mit den TL-Mustern (`projektleitung`, `standortleitung`, `britta`, `uensal`, `ünsal`, `tanju`, `oezdemir`, `özdemir`) und einer Kopfzeile, die das Format erklärt. Sie wird bei jedem Einstufen neu gelesen (Änderung im Editor wirkt ohne Neustart). Schreiben atomar (tmp + rename). In `.gitignore`; nicht in `bundle_bauen.js`.

**Dashboard (v22).**
- Seite nur, wenn `rcDienstModus()` und `stand.postfach` vorhanden. Reiter `rcPageBtnPostfach` rechts neben Steuerung; Seite in keiner Rotationsliste (`rcAutoRotPages`, Konfigurator-Rotationsschalter), auch nicht per Konfigurator hineinschaltbar.
- `rcDienstEmpfangTick` holt `GET /api/postfach` nur, wenn `stand.postfach.nr` sich geändert hat. Daten nur in einer Variable, nie in `localStorage`, nie im Logbuch/Flugschreiber-Inhalt.
- Aktionen per `rcDienstAnfrage` (POST). Rückmeldung als Toast.
- „Mail an Team“: je Team, das heute Daten hat (Scope wie Dashboard-Filter), ein Knopf; Entwurf = Betreff „Teamwerte <Team> <Datum>“, Text mit den Kennzahlen der Arena für dieses Team (Calls, Ansprachen, BNT, VVL, CS, TNPS, FQ; dieselben Rechenwege wie das Stand-Blatt). Empfänger leer — der Nutzer trägt ein (die Mitarbeiter-Excel hat keine verlässlichen Adressen; Annahme, s. u.).
- Re-Inject: Zeitgeber/Handler der Seite in die Clean-State-Liste; DOM-Singletons vor Neuanlage abräumen.
- Ohne Outlook / „neues Outlook“ / Fehler: Seite zeigt den Grund im Kopf, letzter Stand bleibt sichtbar.

## Prüfen

- Node-Prüfwerkzeug `pruefwerkzeuge/postfach_pruefen.js` (im Sammel-Einzeiler): Einstufen, Dispo-Regex, Abwesend-heute-Regel (inkl. bis/ohne bis/jüngste gewinnt), Mapping-Zuordnung inkl. Nicht-Treffer, Wichtig-Datei lesen/anlegen/ändern, Schalter aus = kein PowerShell-Aufruf, Frist, letzter guter Stand, kein Inhalt in `stand.json`/Log. Zu jeder Regel eine Gegenprobe.
- Leser austauschbar über `ESL_DIENST_POSTFACH_LESER` (Pfad eines Ersatz-Skripts mit festem JSON), damit `dienst_messen.mjs` und die Offline-Seite ohne Outlook laufen.
- v22: Render der Seite gegen festes JSON (Mini-DOM oder Browser-Harness), Re-Inject-Doppeltest, Seite nicht in Rotation, ohne Schalter keine Seite.
- Echter Test mit Outlook nur auf dem PC des Nutzers (Citrix).

## Dem Builder überlassen

Genaue Optik im Rahmen von `VODAFONE_DESIGN.md` und dem Entwurf; Sortierung innerhalb der Listen; Aufteilung der Funktionen in den neuen Dateien; Text der Toasts; Format der Kopfzeile in `Postfach_Wichtig.txt`.

## Nach dem Builder-Check entschieden (Planer, Nutzer kann widersprechen)

- **Wandmonitor:** Der PC des Nutzers ist nicht der Wandmonitor (Nutzer: „nur auf meinem PC“, der Schalter ist nur dort an). Zusätzlich: nach Neuladen/Re-Inject startet das Dashboard nie auf „Postfach“, die Seite wird nicht als letzte Seite gemerkt.
- **Team-Zuordnung in v22**, nicht im Dienst (der Dienst hat keinen xlsx-Leser, keine Installation). Der Dienst liefert Namen roh; v22 löst sie über `ccsMap`/`rcNormName` auf. Der Prüfpunkt „Mapping-Zuordnung“ gehört in den v22-Test.
- **Dispo-Datum:** `dd.MM.yyyy`, zusätzlich `dd.MM.` ohne Jahr (= laufendes Jahr). Antworten/Weiterleitungen (`AW:`, `WG:`, `RE:`, `FW:`) zählen nicht als Dispo-Meldung.
- **Nicht lesbarer `MA:`-Betreff** verschwindet nicht: er steht unter „Mitarbeiterinfos“ als „nicht lesbar“ mit dem Betreff.
- **Mitarbeiterinfos** zeigen die letzten 7 Tage (Lesefenster), neueste zuerst.
- **Kein Filter (Nutzer, 30.10.):** „Abwesend heute“ und „Mitarbeiterinfos“ zeigen ALLE Dispo-Meldungen aus dem Postfach, unabhängig vom Dashboard-Filter, je mit Team-Spalte. Nur „Mail an Team“ folgt dem Filter.
- **Wichtig-Knopf** trägt die SMTP-Adresse des Absenders ein (exakt). „Entfernen“ löscht nur exakt diese Zeile; kommt der Treffer über ein Namensmuster, zeigt die Seite „kommt über ‚<Muster>‘ — in Postfach_Wichtig.txt ändern“.
- **Mailtext:** Die Seite zeigt nur die Vorschau (≤180 Zeichen). `inhalt` wird nicht gelesen und nicht ausgeliefert; ganze Mail = „In Outlook öffnen“.
- **Flugschreiber/Logbuch:** Antworten von `/api/postfach` werden dort nicht mitgeschnitten (nur Zeit, Größe, Status).

## Annahmen (vom Planer gesetzt, Nutzer kann widersprechen)

- Dispo-Betreffe haben das TL-Format; ein optionales `bis:` wird mitgelesen, falls es vorkommt.
- 60 Mails Liste / 7 Tage Dispo / 180 s Takt / 60 s Frist.
- „Mail an Team“ ohne vorbelegte Empfänger.
- Seite nur im Dienst-Betrieb.
