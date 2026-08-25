# ESL Live-Arena — Anleitung (Stand 16.08.2026 spätabends)

Diese Anleitung beschreibt den Betrieb nach dem Umbau vom 06.08.2026: drei ESL-Projekte auf drei PCs, Crawler v6 ("du führst, er folgt"), Export/Reporting und die Mail-Automatik.

**Wichtig:** Der ganze Stand ab 06.08. ist offline geprüft, aber **am echten Portal noch nicht getestet**. Bitte beim ersten Durchlauf genau hinschauen und melden, wenn etwas nicht wie hier beschrieben läuft.

---

## NEU seit 16.08. spätabends — der Konfigurator kann jetzt viel mehr

Zahnrad → **Module** → eine Seite wählen → unten bei „Eigene Module hinzufügen". Die Auswahl ist jetzt **nach Kategorien gruppiert** und hat ein **Suchfeld** (tippe z. B. „Rangliste", „Standort", „CS", „Verlauf").

**23 neue Kacheln in sechs Gruppen** — die meisten sind frei einstellbar, du baust dir also viel mehr als 22 Ansichten:

| Gruppe | Was drin ist |
|---|---|
| **Kampf** | Kampf (Standorte / Länder / Teams) mit Krone und Vorsprung · Duell zwei gegen zwei |
| **Rangliste** | Rangliste (frei wählbar: Ebene + Kennzahl + Plätze + Reihenfolge) · Produkt-Rangliste · Noch ohne Abschluss |
| **Verlauf** | Tagesverlauf kumuliert (Linie, je Standort trennbar, Gestern gestrichelt) · Abschlüsse je Stunde · Heatmap Stunde × Standort · Mehrtage-Trend |
| **Verteilung** | Produktmix (gestapeltes Band) · Anteil je Einheit (Ring) |
| **Qualität** | Kennzahl groß · Tacho gegen Ziel · Ampel-Tabelle · Streudiagramm zwei Kennzahlen · Zeitfresser (ACW/ACHT/AHT) · Verteilung einer Kennzahl · **Freie Portal-Kennzahl** |
| **Übersicht** | Tabelle (bis zu vier Kennzahlen frei) · Landkarte der Standorte · Abschluss-Ticker · Woran es scheitert · Ist gegen Ziel |

**Das Wichtigste: jede Kachel hat einen eigenen Zuschnitt.** Feld **„Zuschnitt"**:

- **folgt dem Dashboard-Filter** (Vorgabe) — die Kachel macht mit, wenn du oben filterst
- **ganzes Haus (Filter ignorieren)** — genau das, was du wolltest: der **Standort- und Länderkampf bleibt vollständig, auch wenn du oben auf Alanya filterst**
- **nur dieser Standort** / **nur dieses Land** / **nur dieses Team** / **nur dieser Stack** — fest eingestellt, unabhängig vom Dashboard

Über jeder Kachel steht, welchen Zuschnitt sie zeigt. Weicht er vom Dashboard-Filter ab, steht es **in Amber** da — damit nie der Eindruck entsteht, die Zahlen gehörten zum Filter oben.

**Kennzahlen frei wählbar** (je nach Kachel): BNT gesamt, KIP, Mobilfunk, VVL, Entertain, PTV, Fibre/DSL, Ansprachen, ESL-Kontakte, offene Angebote, Calls, CS, TNPS, Antwortquote, Deep Detractor, Auflegerquote, FF7, First-Time-Fix, Weiterleitungen, AHT, ACW, ACHT, ACD.

Dazu die Kachel **„Freie Portal-Kennzahl"**: sie bietet **alles an, was die Ligaliste gerade mitschickt** — auch Kennzahlen, die es im Dashboard noch gar nicht gibt. Hinter jedem Wert stehen Zähler und Nenner, weil der Portal-Name allein nichts über die Bezugsgröße sagt. Steht die Liste leer, hakst du die Kennzahl im Portal an und drückst Ok; der Crawler übernimmt sie beim nächsten Klick.

**Größe einstellen:** in der Modul-Liste stehen jetzt bei jeder Kachel Pfeile für **Höhe** (↓ ↑) und auf eigenen Seiten für **Breite** (← →). Jede Kachel bringt eine sinnvolle Vorgabehöhe mit, damit Diagramme nicht abgeschnitten sind.

**Zwei Ehrlichkeits-Regeln, die du sehen wirst:**
1. Steht „**n. geliefert**", liefert die Ligaliste die Spalte gerade nicht (typisch bei ACW/ACHT — dann im Portal anhaken und Ok drücken). Das ist etwas anderes als der Wert 0.
2. Ein paar Größen gibt es nur für den gefilterten Bereich (ESL-Kontakte, Ablehnungsgründe). Wählst du dort „Filter ignorieren", schreibt die Kachel „—" und sagt warum, statt heimlich zu wenig zu zeigen. Die Kachel **„Woran es scheitert"** hat deshalb bewusst gar keinen Zuschnitt.

---

## NEU seit 16.08. abends — Verschieben repariert, Automatik einstellbar

1. **Module verschieben ist repariert.** Vorher hat ein einziger Pfeil-Klick im Konfigurator die ganze Seite in ein Raster gekippt — „alles durcheinander, alle Seiten". Jetzt bewegt jeder Pfeil (Zahnrad → Module → ▲/▼) **genau eine Karte**, der Rest bleibt stehen. Die Seiten sehen immer so aus wie im Normalbetrieb; was du siehst, wird gespeichert. Beim ersten Start nach dem Update räumt sich das alte Durcheinander **von selbst** auf (Ausblenden und umbenannte Titel bleiben erhalten).
2. **Drag & Drop im Bearbeiten-Modus** (Zahnrad → Anzeige): Kartenkopf ziehen = verschieben, auch **in eine andere Spalte**. Untere Kante = Höhe. Rechte Kante = Breite (nur dort, wo es ein Raster gibt, z. B. Steuerung). Esc bricht ab.
3. **Neuer Knopf „Zurücksetzen"** (Zahnrad → Module, unter der Kachel-Liste): stellt die Anordnung **einer** Seite aufs Original zurück, falls doch mal etwas verrutscht. Ausblenden/Titel bleiben.
4. **Automatik jetzt einstellbar** (Zahnrad → Anzeige → **Automatik**, ganz oben): vier Schalter — *Ligaliste selbst öffnen*, *Liga-Abfrage automatisch*, *Autopilot navigiert selbst*, *Genesys-Monitor selbst öffnen*. Alles bleibt gespeichert.
5. **Die Ligaliste läuft jetzt ganz ohne deinen Klick an:** Ist „Liga-Abfrage automatisch" an (ab Werk ja) und kein Klick gemerkt, klickt der Crawler den **Ok-Knopf selbst** (nach 15 s, bis zu 5 Versuche). Du kannst weiterhin jederzeit selbst klicken — dein Klick hat immer Vorrang und bestimmt Vorlage/Kennzahlen. Wer das alte Verhalten will („nur ich klicke"), schaltet den Schalter aus.

---

## NEU seit 14.08. abends (großer Umbau) — was sich für dich ändert

1. **Kein Copy-Paste mehr für den Dashboard-Start.** Der Autopilot versucht den Start jetzt bis zu 10-mal (alle 30 s), und der Starter spielt das Dashboard notfalls **selbst direkt** in die Export-Ansicht ein. Wenn das Starter-Fenster läuft und du angemeldet bist, kommt das Dashboard von allein. (Fallback ohne Starter bleibt das rote Lesezeichen aus `Dashboard_Lesezeichen.html`.)
2. **Die Ligaliste merkt sich deinen Ok-Klick dauerhaft.** Nach F5, Citrix-Neustart oder Neuladen läuft das 3-Minuten-Replay ohne neuen Klick weiter (der gespeicherte Klick gilt ~3 h). Stirbt die Sitzung, meldet der Starter sich neu an und **klickt den einen Ok selbst** (höchstens 1×/5 Min) — die Kette läuft ohne dich durch.
3. ~~Module verschieben (12-Spalten-Raster)~~ — **überholt am 16.08.:** das Raster ist wieder raus, Verschieben arbeitet direkt im normalen Layout (siehe „NEU seit 16.08." oben).
4. **Zoom repariert.** Der Regler im Zahnrad kämpft nicht mehr gegen die Automatik, das Zahnrad-Panel skaliert mit, das Radar läuft nicht mehr über.
5. **Excel-Export mit Häkchen.** Im Export-Dialog gibt es die Karte **„Inhalt"**: Blätter einzeln an/aus, dazu die Kennzahlen der beiden Reporting-Blätter (Vertrieb und Qualität inkl. AHT) einzeln wählbar. Alles an = die gewohnte volle Mappe. Die Auswahl wird je Projekt gemerkt. (ACW gibt es nur live auf der Warteschleifen-Seite — Genesys liefert keine Historie, darum steht es nicht im Excel.)
6. **Alle Einstellungen sichern und wieder laden.** Zahnrad → Sichern → **„Komplett-Sicherung"**: schreibt Ziele, Report-Empfänger, Layout, Warteschleife, Zoom usw. in EINE Datei — und spielt sie nach einem Citrix-Aufräumen oder auf einem anderen PC wieder ein.
7. **Drei neue Live-Module** (Zahnrad → Module → „+"): **Ansprache-Quote (Liga)** mit Balken und Zielmarke je Standort, **Tagesverlauf (Diagramm)** mit Gestern-Vergleich, **Trichter Kontakte→Ansprachen→Abschlüsse**.
8. **Neues Design:** dunkler Look bleibt, Karten und Diagramme sind überarbeitet; jeder Standort trägt jetzt in jedem Diagramm dieselbe Farbe.

---

## 1. Start — ein PC, ein Projekt

Jeder der drei PCs fährt ab jetzt **genau ein** Projekt. Nicht mehr mehrere Tabs im selben Edge-Fenster — das hat sich früher gegenseitig umgeworfen (geteilte Server-Sitzung).

| PC | Doppelklick |
|---|---|
| Kabel-PC | `ESL_Start.cmd` (ohne Zusatz = Kabel) |
| Mobile-PC | `ESL_Start_Mobile.cmd` |
| UM-PC | `ESL_Start_UM.cmd` |

Das Fenster bleibt offen — es meldet nach einem Sitzungsablauf automatisch neu an und hält den Autopiloten am Leben. **Nicht schließen.**

Der Autopilot loggt sich ein, klickt sich zum richtigen Projekt durch und startet das Dashboard. Landet das Portal nach einem Re-Login versehentlich auf einem anderen Projekt, wechselt der Autopilot von selbst zurück (mit gelbem Banner) — das ist gewollt und kein Fehler.

---

## 2. Ligaliste — läuft seit 16.08. von selbst an

**Normalfall: nichts tun.** Ist „Liga-Abfrage automatisch" an (ab Werk ja, Zahnrad → Anzeige → Automatik), klickt der Crawler den Ok-Knopf selbst, sobald kein Klick gemerkt ist — die Daten kommen ohne dein Zutun. Der Starter setzt zusätzlich seinen eigenen Klick (1×/5 Min), falls die Sitzung neu ist.

**Willst du selbst führen** (bestimmte Vorlage, bestimmte Kennzahlen wie ACW/ACHT, anderer Zeitraum), klick einfach selbst — dein Klick gewinnt immer und wird gemerkt. So geht die volle Kette von Hand:

1. Im Dashboard oben den Knopf **„KPI-Quelle"** (bzw. das Werkzeug-Menü → KPI) klicken — öffnet die Ligaliste.
   → **Seit 21.08. läuft der KPI-Crawler dort binnen Sekunden an** statt erst nach mehreren Minuten. Der Starter verschläft seine Wartezeit nicht mehr, sondern sieht alle 2 s nach neuen Tabs und versorgt sie sofort. Voraussetzung ist wie immer, dass `ESL_Start.cmd` läuft — ohne Starter kommt der Crawler weiterhin nur über F12 oder das Lesezeichen in die Seite.
2. Dort deine Vorlage laden (Kabel TEC / MOB CARE / VUM CARE — je nach Projekt).
3. Zeitraum **„Aktuelle Woche"**, Intervall **„Tag"** wählen, auf **Ok** klicken.
   → Die Wochen-Historie geht sofort ans Dashboard.
4. Zeitraum auf **„Intraday"** umstellen, wieder auf **Ok** klicken.
   → Das Live-Paket geht ans Dashboard, und der Klick wird gemerkt.

Ab jetzt läuft automatisch **alle 3 Minuten** ein Replay genau dieses Klicks — derselbe Baum, dieselben Standorte, dieselben Kennzahlen, nur auf Intraday gestellt. Ohne gemerkten Klick übernimmt seit 16.08. die Auto-Abfrage (Konsole: `rcCrawlerAutoKlick(false)` schaltet sie ab — dann wartet der Crawler wie früher auf dich).

Genesys läuft weiterhin komplett automatisch, wie bisher.

---

## 3. Dashboard-Takt

- **ESL**: alle 20 Sekunden
- **Ligaliste**: alle 3 Minuten (Replay, siehe oben)
- **Genesys**: automatisch, unverändert

---

## 4. Excel-Export

Knopf **„Excel-Export"** auf der Steuerungs-Seite öffnet den Dialog. Eine Mappe, vier Zeitbezüge:

- **Aktuell** (heute)
- **Gestern**
- **Aktuelle Woche**
- **Zeitraum von–bis** (frei wählbar)

Dazu zwei Filter (Standort, Stack) — die Filter bestimmen, wie tief der Bericht aufgeschlüsselt wird:

| Filter | Bericht zeigt |
|---|---|
| kein Filter | Standorte → Stacks → Teams → Mitarbeiter |
| nur Standort | Stacks → Teams → Mitarbeiter |
| Standort + Stack | Teams → Mitarbeiter |

Drei Knöpfe:

1. **„Bericht erstellen"** — die volle Mappe (`regiocom_ESL_Report`): Stand, Vertrieb, Analyse, Struktur, Liga-Blätter, Stacks, Teams, Agenten, Entwicklung, Abdeckung.
2. **„Nur Reporting (kompakt)"** — schlanke Mappe (`regiocom_ESL_Reporting`) mit **nur** den zwei Block-Blättern (Vertrieb / Qualität, Standort → Stacks → Teams). Kein Stand-, Analyse- oder Liga-Blatt.
3. **„Reporting ALLE Projekte"** — siehe Abschnitt 5.

**Vertrieb und Qualität sind immer getrennte Blätter/Tabellen.** Nur das Screenshot-Blatt `AKTUELLER_STAND` (für die Mail) mischt beides, das ist Absicht.

---

## 5. Reporting über alle drei Projekte — Achtung, Praxis-Hinweis

Der Knopf **„Reporting ALLE Projekte"** baut eine Mappe mit Kabel, Mobile und UM nebeneinander (Deckblatt „Projekte im Vergleich" + je Projekt zwei Block-Blätter).

**Er liest die Daten, die auf DIESEM PC im Browser-Speicher archiviert sind** — nicht live vom Server. Bei der neuen „ein PC = ein Projekt"-Aufteilung heißt das in der Praxis:

- Läuft auf einem PC **ausschließlich** Kabel, hat dieser PC auch nur Kabel-Daten. Der Export zeigt für Mobile/UM dann „KEINE DATEN auf diesem PC" — das ist keine Fehlfunktion, sondern ehrlich.
- Damit alle drei wirklich in einer Mappe landen, brauchst du **einen** PC (egal welchen), auf dem du im ESL selbst einmal durch alle drei Projekte durchschaltest (so wie du es ursprünglich beschrieben hast: „einmal auf Kabel, Mobilfunk und UM umschalten"). Das Dashboard archiviert dabei automatisch im Hintergrund — du musst nichts extra klicken, nur kurz auf jeder Projektseite gewesen sein, während das Dashboard lief.
- Fehlt ein Projekt komplett, sagt die Mappe es offen statt es zu verschweigen; die anderen beiden werden trotzdem exportiert.

Der Export navigiert **nicht selbst** durch die ESL-Projekte — das würde die feste PC-Zuordnung durcheinanderbringen und das Dashboard bei jedem Wechsel neu starten.

### Empfohlener Ablauf auf EINEM PC (alle drei Projekte einsammeln)

**Nacheinander, nicht parallel** — alle drei Starts teilen sich Edge-Profil und Server-Sitzung; gleichzeitig kippen sie sich um.

1. `ESL_Start.cmd` (Kabel) → Dashboard abwarten.
2. Ligaliste kurz anwerfen: KPI-Knopf → Vorlage → „Aktuelle Woche"+„Tag"+Ok → „Intraday"+Ok. Eine Minute laufen lassen (archiviert ESL **und** Liga für dieses Projekt).
3. Edge und Startfenster **schließen**.
4. `ESL_Start_Mobile.cmd` → Schritte 1–3 wiederholen.
5. `ESL_Start_UM.cmd` → Schritte 1–2, diesmal **offen lassen**.
6. Excel-Export → **„Reporting ALLE Projekte"** → eine Mappe mit allen dreien.

Ohne Schritt 2 bleiben die Qualitäts-Spalten des jeweiligen Projekts leer (nur Vertrieb gefüllt). Für Gestern/Woche reicht oft die vorhandene Historie (~5 Wochen gespeichert) — dann direkt exportieren; die Spalte DATENSTAND im Deckblatt zeigt, wie frisch jedes Projekt ist. Im laufenden ESL einfach durchschalten funktioniert absichtlich nicht: der Autopilot ist auf das Start-Projekt festgenagelt und wechselt zurück.

---

## 6. Mail-Automatik — ab Werk AUS

Die Stundenmail verschickt sich **nicht mehr von selbst**. Kein Download, kein Versand ohne dein Zutun.

**Einschalten, falls gewünscht** (drei gleichwertige Wege):
- Zahnrad → Report → Schalter **„Stündlich automatisch"**
- Konsole: `rcReport.setAuto(true)`
- In `ESL_Start.cmd` die Zeile `$MailAktiv = $false` auf `$true` setzen

**Einzelne Mail von Hand**, ohne Automatik einzuschalten:
- Report jetzt erzeugen: Konsole `rcReportNow()`
- Danach verschicken: `esl_mail_report.ps1` doppelklicken (öffnet die Mail nur zur Kontrolle) — mit `-Senden` schickt sie sofort ab.

**Schlanke Reporting-Mappe an die Mail hängen:** Zahnrad → Report → Schalter **„Reporting-Mappe"** (ebenfalls ab Werk aus). Hängt zusätzlich zu den zwei Bildern die kompakte Excel an.

---

## 7. Kurz-Referenz Konsole

| Befehl | Wirkung |
|---|---|
| `rcCrawlerSperre()` | zeigt, ob/wer die Ligalisten-Seite gerade belegt |
| `rcCrawlerHarvestWoche()` | Wochenlauf von Hand nachziehen |
| `rcJetztAktualisieren()` | ESL + Liga sofort holen (Knopf „Jetzt" in der Kopfleiste) |
| `rcReportNow()` | Report sofort erzeugen (ohne Mail) |
| `rcReport.setAuto(true/false)` | Stundentakt an/aus |
| `rcExportReporting(von, bis, scope)` | schlanke Mappe über Konsole |
| `rcExportReportingAlle(von, bis)` | Alle-Projekte-Mappe über Konsole |

---

## 8. Wenn etwas nicht stimmt

- **Ligaliste liefert nichts:** Konsole zeigt ORA-Fehlercode im Klartext oder „noch kein Ok-Klick gemerkt". Seit 16.08. versucht es die Auto-Abfrage von selbst; hilft das nicht (oder ist sie abgeschaltet), einmal Woche+Tag+Ok, Intraday+Ok von Hand (Abschnitt 2). Prüfen: Zahnrad → Anzeige → Automatik → „Liga-Abfrage automatisch".
- **Autopilot bleibt auf falschem Projekt stehen:** Startfenster nicht geschlossen? Es muss weiterlaufen, damit der Wächter aktiv bleibt.
- **Export-Knopf tut nichts / Fehlermeldung:** Steht unten im Dialog als Klartext (z. B. „keine Daten im gewählten Zeitraum") — meist fehlt die Historie für den gewählten Tag, dann zuerst „Zeitraum → Daten laden" ausführen.
