# Datendienst für die Live-Arena (Vorhaben 1 von 4)

Stand 26.10.2026. Entschieden im Gespräch mit dem Nutzer. Was mit „Vorschlag“ markiert ist, hat der Nutzer nicht ausdrücklich entschieden; es ist eine Festlegung beim Entwurf, die er beim Lesen prüfen soll.

## Absicht

Die Live-Arena verliert heute regelmäßig Daten: ESL-Sitzung nach 2–3 h, CCS-Token nach ~12 h (HTTP 401), schlafende Tabs, Edge-Fehlerseite, viewExpired-Dialog. Ursache ist nicht der Abrufweg, sondern dass das Dashboard **in** der ESL-Seite lebt und drei Heiler (Dashboard, Autopilot, Starter) gegeneinander arbeiten (Befund 10.10. in CLAUDE.md).

Neu: Ein Node-Dienst holt ESL und Ligaliste per Edge-Fernsteuerung (CDP) und ist der **einzige** Heiler. Das Dashboard läuft als eigene Seite unter `http://127.0.0.1:8787` und lebt nur von dem, was der Dienst liefert. Hängt die Portal-Seite, bleibt das Dashboard stehen und zeigt den letzten Stand mit Alter.

Am 26.10. auf Citrix gemessen (unveränderter APITool-Stand vom 18.10.): portable Node v22.23.4 aus `node\node.exe`, Edge per CDP gestartet, `Auto_ESL_kabel.xlsx` (295 KB) und Ligaliste mit 427 Agenten (Kabel 221, Mobile 153, UM 53) geholt. Abruf und Anmeldung außerhalb der Portal-Seite funktionieren. Nicht gemessen: Verhalten nach Sitzungsablauf.

Die Live-Arena soll später das TL Command Center ersetzen. Reihenfolge der Vorhaben: 1 Datendienst (dieses Dokument) · 2 Spiel ins Archiv · 3 Mail-Zentrum · 4 Live-Liste und Mithören über PureCloud. Vorhaben 1 darf nichts verbauen, was 3 und 4 brauchen (ein Dienst, ein Edge, später auch PureCloud-Tab und Outlook-Leser).

## Ziele

1. ESL (aktives Projekt) alle 20 s, Ligaliste einmal pro Minute, ohne dass das Dashboard je selbst ein Portal anfragt.
2. Eine Runde ist **sequenziell**: erst ESL, dann (jede dritte Runde) Ligaliste, dann **ein gemeinsamer Stand** an das Dashboard. Stückzahlen und Calls stammen damit aus derselben Minute (Nutzer-Vorgabe).
3. Der Knopf „Jetzt“ löst sofort eine volle Runde aus (ESL, dann Liga).
4. Projektwechsel per Klick im Dashboard (Kopfleiste/Stack-Filter wie heute); der Dienst stellt die ESL-Anmeldung um. Vor Export, Report und Mapping-Lücken-Liste frischt der Dienst die anderen Projekte auf (heutiges `rcFrischHolen`-Verhalten).
5. **Vortage**: Gestern, Woche, Monat und frei gewählte Zeiträume stehen für alle drei Projekte zur Verfügung (Nutzer-Vorgabe „auch Vortage“), für ESL und Ligaliste.
6. Alle Heil-Regeln des alten Starters/Autopiloten/Crawlers, die heute gelten, gelten im Dienst (Liste unten). Ein Ausfall ist immer sichtbar: Alter je Quelle, Grund im Klartext, Eintrag im Logbuch.
7. Der alte Weg (`ESL_Start.cmd`, Dashboard in der ESL-Seite) funktioniert unverändert weiter, als Rückweg.

## Nicht-Ziele (dieses Vorhabens)

- Mail-Zentrum, Spiel-Archiv, PureCloud/Mithören: eigene Vorhaben.
- Stundenmail (`SchickeStundenmail`, `esl_mail_report.ps1`): bleibt im alten Starter; im Dienst-Betrieb vorerst nicht. Ist ab Werk ohnehin aus.
- Warteschleife/Genesys im Dienst-Betrieb: vorerst nicht bedient (Modul aus, Hinweis auf der Seite). Kommt mit Vorhaben 4, das ohnehin einen weiteren Tab betreut.
- Keine neue Rechenlogik im Dashboard. Parser, Aggregation, Exporte, Stack-Regel bleiben, wie sie sind.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es läuft)

- Zahlen weichen vom Portal-Export desselben Moments ab (Fallstrick 8: zweiter Rechenweg).
- Stiller Stillstand: alte Zahlen ohne sichtbares Alter/Grund.
- Zwei Heiler: das Dashboard holt, meldet an oder lädt neu, während der Dienst es auch tut.
- Mehr Last auf der Ligaliste als bisher nötig (sie hat unter Last schon gehangen).
- Zugangsdaten oder Tokens in Dateien, Log oder Adresszeilen.
- Eine zweite, auseinanderlaufende Dashboard-Datei.

## Rahmen

- Citrix (ve1802), keine Adminrechte, kein Installieren. Node liegt portabel als `node\node.exe` im Ordner (Version ≥ 22 wegen globalem `WebSocket`; gemessen 22.23.4).
- Edge, ein Profil, Fernsteuerungs-Port 9222. ESL kennt **ein** Projekt je Anmeldung (28.09. gemessen); Wechsel nur über das Projekt-Menü.
- Browser-Speicher hängt an der Adresse: Was heute unter `esl.regiocom.net` liegt (Historie, Ziele, Layout, Report-Empfänger), ist unter `127.0.0.1` nicht da.
- Personendaten (Exporte, Mapping) bleiben lokal; der Dienst bindet nur `127.0.0.1`.
- Projektregeln aus CLAUDE.md gelten: TDZ-Regel, Re-Inject-Sauberkeit, Prüfwerkzeug mit Gegenprobe, `node --check`, Update-Paket über `bundle_bauen.js`.

## Ansätze

Zur Frage, wie Dashboard und Dienst zusammenarbeiten, standen drei Wege:

- **A. Dienst-Schalter in v22** — eine Abfrage `rcDienstModus()` in `esl_live_arena_v22.js`. An: v22 holt nichts selbst, nimmt nur Dienst-Daten. Aus: alles wie heute. **Gewählt (Nutzer).** Grund: ein Dashboard, beide Betriebsarten, alter Weg bleibt Rückweg.
- B. Hülle von außen (wie `ESL_Live_Arena_APITool.html` heute) — v22 unverändert, Funktionen überschrieben. Verworfen: erreicht nur Aufrufe über `window.`; interne Aufrufe und der Drift-Wächter (legt den Takt nach 1 s neu an) laufen vorbei. Genau der fehlerhafte Zustand des Tests.
- C. Eigene Dienst-Fassung von v22 — verworfen: zwei Fassungen von 28 000 Zeilen.

Davor entschieden (Nutzer): APITool fertig machen statt den TL-Dienst zu teilen, weil v22 unverändert rechnet und alles im Ordner liegt. Die Live-Arena darf eine eigene Seite werden.

## Was entschieden ist

### Bestandteile (Dateinamen: Vorschlag)

| Teil | Aus | Aufgabe |
|---|---|---|
| `esl_dienst.js` | wird aus `esl_apitool_server.js` gebaut | Edge starten/halten, Runden fahren, heilen, Stand halten, HTTP-Schnittstelle |
| `ESL_Live_Arena.html` | wird aus `ESL_Live_Arena_APITool.html` gebaut, stark verschlankt | Gastseite: setzt die Dienst-Marke, lädt `xlsx` und v22, holt den Stand vom Dienst und reicht ihn an v22 |
| `ESL_Dienst_Start.cmd` | aus `ESL_APITool_Start.cmd` | sucht Node, prüft Version, startet den Dienst |
| `esl_live_arena_v22.js` | bleibt | bekommt `rcDienstModus()` und den Dienst-Eingang |

Die APITool-Dateien gehen danach in diese über (nicht als dritte Variante stehen lassen).

### Der Schalter in v22

- `rcDienstModus()` ist wahr, wenn die Gastseite vor dem Laden von v22 eine Marke setzt (z. B. `window.__rcDienst = {basis:'http://127.0.0.1:8787'}`). Nicht über den Hostnamen raten. Als **Funktionsdeklaration** (TDZ-Regel).
- Im Dienst-Modus holt v22 **nichts** selbst. Betroffen (Liste aus der Erkundung, vom Bauer per grep zu vervollständigen): `rcLiveTick`, `holeExcelVomServer`, `rcProjektAbruf`/`rcRahmenAufbau`, `rcSessionLost`/`rcSessionRetryInterval`, `rcPortalAufHeute`/`rcMitternachtPruefen`, `rcExportAnsichtSicherstellen`, `rcAutoKpiQuelle`/`rcOpenKpiQuelle`/`rcKpiRetryBeiGeste`, die Liga- und ESL-Stufen des Watchdogs (`rcWdTick` — kein Fenster öffnen, kein Neuladen), `rcHarvestEslHistory`/`rcFetchRangeViaUI`/`rcFetchRangeBuffer`, `rcDriftNachholen`, `rcFrischHolen`, `rcJetztAktualisieren`. Der Schalter sitzt **in** diesen Funktionen (oder an ihrem gemeinsamen Eingang), nicht in einer äußeren Hülle.
- Wo eine Funktion eine Wirkung hat, die der Nutzer braucht, leitet sie im Dienst-Modus an den Dienst weiter statt nichts zu tun: „Jetzt“ → Runde beim Dienst; Projektwechsel → Dienst stellt um; Auffrischen vor Ausgabe → Dienst frischt auf; Zeitraum-Export → Dienst holt den Bereich.
- Der Quellen-Wächter und die Zeitanzeigen (`#rcZeitEsl`/`#rcZeitLiga`) zeigen weiter Alter und Grund — die Werte kommen aus dem Dienst-Stand, Gründe aus dessen Statusmeldungen. Der Watchdog darf warnen, aber nicht heilen.
- Ohne Marke: jede Zeile verhält sich wie heute. Das wird mit Gegenproben festgenagelt.

### Übergabe Dienst → Dashboard

- Der Dienst hält einen **Stand** mit laufender Nummer: je Projekt die ESL-Rohdaten (Excel-Bytes wie heute, Zeitpunkt), die Liga-Zeilen im `KPI_BATCH`-Format, Status je Quelle. Er schreibt ihn zusätzlich atomar auf Platte (`.tmp` + umbenennen), damit ein Neustart des Dienstes oder ein Neuladen der Seite sofort den letzten Stand hat.
- Die Gastseite fragt alle 2 s nach „gibt es eine neuere Nummer?“ (Vorschlag; Server-Sent Events wären gleichwertig, Bauer entscheidet). Neue ESL-Daten gehen über den erprobten Weg aus `test_abgleich_esl.html`: `rcProjektDaten[key]` + `rcVerarbeiteAlle()`. Liga als `postMessage({type:'KPI_BATCH', …})` an das eigene Fenster, mit `projekt`-Kennung und `vollstaendig` nur, wenn alle drei Bäume geliefert haben.
- Die Prüfung jeder ESL-Lieferung bleibt im Dashboard (`rcProjektPruefen`, „ein Tag kann nur wachsen“, Überlappung mit fremdem Projekt). Die Gastseite setzt `pruefung` **nicht** blind auf ok (heutiger APITool-Fehler).
- Die Mitarbeiter-Excel liefert der Dienst als Bytes; v22 liest sie mit dem eigenen `verarbeiteMappingExcel` (nicht mit dem Nachbau aus der APITool-Seite).

### Runde und Takt

- Runde alle 20 s: ESL des aktiven Projekts. In jeder dritten Runde danach die Ligaliste (drei `get_data.rb`-Abfragen, eine je Baum). Dann ein Stand mit neuer Nummer.
- Keine zwei Runden gleichzeitig. „Jetzt“, Projektwechsel und Auffrischen reihen sich ein; eine laufende Runde wird nicht abgebrochen.
- Liga-Abfrage wie im APITool (Token aus der Seite, Parametersatz wie `baueAbfrage`, `figure_list = RC_FIGURES`). Verbesserung gegenüber heute: Ergebnis je Baum mit Status; ein fehlender Baum ist ein Teilerfolg mit Grund, kein „ok, 0 Agenten“, und ersetzt den Bestand dieses Projekts nicht.
- Der Takt ist an einer Stelle einstellbar (ESL-Sekunden, Liga jede n-te Runde).

### Projekte

- Das aktive Projekt bestimmt das Dashboard (wie heute `rcAktivProjekt`) und meldet es dem Dienst. Der Dienst stellt die ESL-Anmeldung über das Projekt-Menü um und fährt Reiter und Ansicht an (Schrittfolge wie APITool; ein Wechsel dauert einige Runden).
- Vor einer Ausgabe fordert das Dashboard die betroffenen Projekte an; der Dienst holt sie nacheinander und kehrt zum aktiven zurück. Frist, keine Sperre (Fallstrick 13): bei Ablauf wird mit Grund ausgegeben.
- Der Autopilot wird im Dienst-Betrieb **nicht** in die Portal-Tabs eingespielt. Er würde auf Kabel zurückklicken (`sollProjekt()` ohne Projekt-Marke). Navigation, Anmelde-Hilfe und Fehlerseite übernimmt der Dienst.

### Vortage und Zeiträume

- Einmal täglich (erste Runde nach dem Start, dann nach Mitternacht) und je Projekt: ESL-Bereichsexport vom früheren der beiden Tage „Monatsanfang“ und „Montag dieser Woche“ bis gestern. Am Monatsanfang reicht er damit in den Vormonat, wenn die Woche dort beginnt.
- Ligaliste einmal täglich als Monat auf Tagesbasis (`current_month`, `interval=day`) je Baum, dazu `last_month`, wenn die Woche in den Vormonat reicht. **Zweck ist die Ansprache-Quote der Vortage** (Nutzer): abgefragt wird nur die Call-Kennzahl (AHT, Rückfall ACD — Nenner = Calls, wie im Live-Pfad), dafür **alle Standorte**. Die schmale Abfrage hält die Last klein; der frühere Monatslauf über alle Standorte und alle Kennzahlen ließ die Seite hängen. Qualitätsspalten (CS, TNPS, AHT usw.) stehen für Vortage als „—“ (nicht 0); heute bleiben sie vollständig.
- Das Dashboard legt beides über die vorhandenen Wege ab: ESL über `rcAggregateMultiDayBuffer`, Liga über `rcMergeLigaHistory` im Format von `loadHistory()` aus `kpi_crawler.js`.
- **Speicher je Projekt getrennt** (meine Entscheidung): `rcEslHistory`/`_mob`/`_um` und `rcLigaHistDash` je Projekt, wie es „Reporting ALLE Projekte“ schon liest. Die heutigen Einzel-Schlüssel-Leser (Export-Dialog, Stack-Filter, „<Projekt> gesamt“) lesen im Dienst-Betrieb die Vereinigung der drei. Grund: in einen gemeinsamen Schlüssel geschrieben überschreibt `hist[tag] = …` das vorige Projekt, `rcMergeLigaHistory` verdrängt kleinere Projekte, und `rcHistorieFremdeTage` würde Mobile-Tage löschen (Befund Builder-Check). Unter `127.0.0.1` liegen keine Code-Blobs und keine Alt-Historie, der Speicher beginnt also leer.
- Frei gewählter Zeitraum im Export-Dialog: das Dashboard fordert den Bereich beim Dienst an (ESL je Projekt, Ligaliste je Baum), der Dienst holt ihn auf demselben Weg, dann baut v22 die Mappe wie heute.
- Zurück auf heute: Nach jedem Bereichsexport stellt der Dienst die ESL-Datumsfelder wieder auf heute (Fallstricke 15/16: frisch geholte Knoten, Wirkung prüfen).
- Datum festschreiben per **echtem Klick** auf „Liste aktualisieren“, nicht per fetch-Postback: der Postback baut die Liste nicht neu (28.09. gemessen). Meine Entscheidung.
- Ligaliste-Sitzung tot (401): Tab **ersetzen** statt im selben Tab neu laden; am 10.10. heilte Neuladen nicht, ein frisches Fenster schon. Meine Entscheidung.

### Heilung (der Dienst ist der einzige Heiler)

Übernommen aus `ESL_Start.cmd`, Autopilot und Crawler; Fundstellen in CLAUDE.md:

1. ESL-Anmeldung höchstens 3 Absendungen je 30 Minuten; ohne lesbares Passwort nichts absenden; Absenden über echte Maus-Geste (CDP `Input.dispatchMouseEvent`), nicht über `.click()`.
2. Microsoft-Anmeldung der Ligaliste wie im alten Starter (`MsZustand`/`HilfMsAnmeldung` als Vorlage).
3. Ligaliste HTTP 401/403 oder Fehlerinhalt = Sitzung tot → Liga-Tab ersetzen (schließen, neu anlegen; höchstens alle 10 Minuten), Grund im Stand.
4. Edge-Fehlerseite (`chrome-error:`, `chromewebdata`) in einem Portal-Tab → nach 20 s neu laden, Fehlercode im Stand. `/json` meldet dort die alte Adresse; der Dienst muss es in der Seite prüfen.
5. viewExpired-Dialog → ESL-Startseite laden; ESL leitet selbst zur Anmeldung.
6. Wachhalten: Web Lock in ESL- und Liga-Tab (idempotent mit Marke, wie `wachhalten()`), dazu die Edge-Startargumente aus `ESL_Start.cmd` (`$edgeArgs`, inkl. `--disable-features=…` in **einer** Liste, Cache-Umleitung mit Schreibprobe). Hängt der Dienst sich an ein schon laufendes Edge, prüft er dessen Argumente und meldet drei Zustände (erfüllt / verletzt / nicht prüfbar).
7. Fehlt Edge, startet der Dienst es neu (gedrosselt), nicht nur einmal pro Lebensdauer. Fehlende Tabs per `Target.createTarget`, nicht `PUT /json/new`.
8. Nur `http(s)`-Seiten vom Typ `page`; bei mehreren ESL-Tabs wird genau einer betreut.
9. Datumswechsel: Datumsfelder werden in jeder ESL-Runde auf heute gesetzt (wie APITool). Morgens leer ist gültig („noch keine Datensätze“), plötzlich leer nach Daten ist ein Fehlschlag (Stand bleibt).
10. Der Leerlauf-Monitor der ESL-Seite (PrimeFaces Idle) wird zurückgesetzt.
11. Kein Schritt hängt ohne Frist (CDP-Aufrufe, Abrufe, Lesen der Antwort).

### Betrieb

- Start über `ESL_Dienst_Start.cmd`. Edge-Profil = `<Ordner>\EdgeProfil`, also **dasselbe** wie `ESL_Start.cmd` (gespeicherte Passwörter gelten weiter). Folge: alter Starter und Dienst laufen nicht gleichzeitig; der Start sagt das klar, wenn das Profil belegt ist.
- Das TL Command Center wird nicht genutzt (Nutzer) und läuft nicht parallel. Es steuert dasselbe Profil und klickt ESL auf Kabel zurück; findet der Dienst beim Start `TL_Starter`/`tl_dienst` laufend, startet er nicht und sagt warum.
- Citrix ist ein geteilter Server: `127.0.0.1` sehen alle angemeldeten Nutzer. Die Schnittstelle verlangt deshalb ein Geheimnis, das der Dienst je Start neu würfelt und nur der Gastseite mitgibt (meine Entscheidung). Den CDP-Port prüft der Dienst vor dem Anhängen auf den eigenen Edge-Prozess.
- `xlsx` liefert der Dienst aus einer mitgelieferten Datei, nicht aus `node_modules` (gibt es auf Citrix nicht).
- **Genau eine** Live-Arena mit einem Dienst (Nutzer); das Projekt wechselt per Klick. Keine Bildschirme mit festem Projekt. Sperrdatei mit Lebenszeichen gegen eine zweite Instanz (Muster `tl_dienst.lock`). `ANLEITUNG.md` („ein PC, ein Projekt“) wird für den Dienst-Betrieb umgeschrieben.
- Protokoll in eine Datei mit Größendeckel und einer Vorgängerdatei. Ereignisse (Wechsel, Ausfälle, Anmeldungen) landen außerdem im Logbuch des Dashboards.
- Der Dienst liefert nur die Gastseite, `xlsx`, v22 und die Schnittstelle — nicht den ganzen Ordner (heute würde er Mapping und Exporte an jeden lokalen Aufrufer ausliefern).
- Umzug der Einstellungen: einmalig im alten Dashboard Zahnrad → Sichern, im neuen Einspielen (`rcEinstellungenSammeln`/`rcEinstellungenEinspielen`). Historie holt der Dienst frisch. `ANLEITUNG.md` sagt das.
- `bundle_bauen.js` nimmt die neuen Dateien auf; `node\node.exe` nicht (Binärdatei, liegt auf Citrix).

## Dem Bauer überlassen

- Schnittstellen-Namen, Format der Stand-Datei, Polling vs. Server-Sent Events.
- Wo genau der Schalter in jeder Funktion sitzt, solange er drin sitzt und die Gegenprobe greift.
- Aufteilung von `esl_dienst.js` in Module.
- Wie viel aus `esl_apitool_server.js` übernommen und wie viel neu geschrieben wird.

## Prüfung und Abnahme

- Alle 55 Prüfwerkzeuge grün, TDZ 0, `node --check` für jede geänderte Datei.
- Neues Prüfwerkzeug für den Schalter: jede betroffene Funktion funktional mit Stubs in beiden Betriebsarten; Gegenprobe, dass ohne Marke das alte Verhalten bleibt, und dass mit Marke kein Portal-Abruf, kein Fenster, kein Neuladen passiert.
- Prüfwerkzeug für die reinen Dienst-Regeln (Rundenfolge ESL→Liga, jede dritte Runde, Anmelde-Deckel, 401 → Neuladen, leerer Baum ersetzt nichts, Bereichsberechnung Monatsanfang/Montag, Datumsrückstellung), je Regel mit Gegenprobe.
- Ende-zu-Ende offline: Dienst gegen das Schein-ESL (`pruefwerkzeuge/esl_schein_server.js`, Port 8413) und eine Ligalisten-Attrappe in headless Edge (Muster `fehlerseite_messen.mjs`, `--host-resolver-rules`, `--disable-sync`). Szenarien: Start, Daten kommen, Projektwechsel, Sitzungsablauf, Fehlerseite, Liga 401, Datumswechsel, Bereichsexport, Dienst-Neustart, Seite neu laden. Wo das Schein-ESL Bereichsexporte nicht kann, wird es erweitert.
- Zahlengleichheit: Dashboard im Dienst-Betrieb gegen die Sollwerte von `test_abgleich_esl.html` (gleiche Exporte → gleiche Mappe).
- Auf Citrix (Nutzer): Dienst einen Arbeitstag laufen lassen; Logbuch nach Sitzungsablauf (2–3 h) und abends anfordern. Erst danach gilt das Vorhaben als abgenommen.
