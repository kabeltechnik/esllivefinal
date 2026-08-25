# ESL Live-Arena — Anleitung (Stand 27.10.2026)

Diese Anleitung beschreibt den Betrieb nach dem Umbau vom 06.08.2026: drei ESL-Projekte auf drei PCs, Crawler v6 ("du führst, er folgt"), Export/Reporting und die Mail-Automatik.

**Wichtig:** Der ganze Stand ab 06.08. ist offline geprüft, aber **am echten Portal noch nicht getestet**. Bitte beim ersten Durchlauf genau hinschauen und melden, wenn etwas nicht wie hier beschrieben läuft.

---

## Dienst-Betrieb (neu, seit 27.10.) — ein Datendienst holt die Zahlen

**Was sich ändert:** Ein eigener Hintergrund-Prozess (der Datendienst) holt ESL und Ligaliste in einem eigenen Edge-Fenster und meldet sich selbst wieder an. Das Dashboard ist eine normale Seite unter `http://127.0.0.1:8787/` und zeigt nur, was der Dienst liefert. Kein Autopilot, kein Ligalisten-Fenster aus dem Dashboard, kein Ok-Klick des Crawlers.

**Stand der Prüfung:** offline und an Schein-Portalen gemessen, **am echten Portal noch nicht**. Erst nach einem Arbeitstag auf Citrix (mit Logbuch und `esl_dienst.log` nach 2–3 Stunden und abends) gilt der Dienst als abgenommen.

**So startest du ihn:**
- **`ESL_Dienst_Start.cmd` doppelklicken** und das Fenster **offen lassen** (Schließen beendet den Dienst). Es braucht Node 22 oder neuer: `node\node.exe` neben die Datei legen (z. B. aus dem Ordner des TL Command Center kopieren).
- **Nie gleichzeitig mit `ESL_Start.cmd`** betreiben, und das **TL Command Center vorher ausschalten**. Der Dienst prüft das beim Start und bricht mit einem Klartext ab.
- **Das Kennwort fürs ESL muss im Edge-Profil des Dienstes gespeichert sein** (Ordner `EdgeProfil` neben der Datei). Beim ersten Mal einmal im Edge-Fenster des Dienstes anmelden und das Kennwort speichern lassen.
- **Einstellungen einmal umziehen:** die Seite hat eine andere Adresse, ihr Browser-Speicher ist neu. Im alten Dashboard Zahnrad → Sichern → Datei speichern; im neuen Zahnrad → Sichern → Einspielen.
- **Im Dienst-Betrieb gibt es genau eine Live-Arena, das Projekt wählst du per Klick** (Kabel | Mobile | UM). Die Vorgabe „ein PC, ein Projekt“ aus dem Kopf dieser Anleitung gilt für den alten Weg.
- **Bei Störung:** `esl_dienst.log` (liegt neben `esl_dienst.js`) **und** die Logbuch-Datei (Werkzeug-Menü → Logbuch) schicken.

**Grenzen, die du kennen solltest:**
- Fragt Microsoft „Konto auswählen“, **einmal von Hand im Edge-Fenster des Dienstes klicken** — das macht weder der alte Starter noch der Dienst.
- **Warteschleife (Genesys) und Stundenmail laufen im Dienst-Betrieb nicht.**
- Die Mitarbeiter-Excel liest der Dienst bei **jedem Start** neu. Eine Excel mit verrutschter Kopfzeile kann das Mapping leeren, und zwar bis zum nächsten Start mit einer guten Datei.
- Stirbt Edge bei jedem Start, versucht der Dienst es zweimal sofort, danach alle 2 Minuten (steht in `esl_dienst.log`).
- Stürzt der Dienst ab oder steht er 20 Minuten ohne Fortschritt, startet `ESL_Dienst_Start.cmd` ihn nach 30 Sekunden neu („Dienst beendet mit Code …" im Fenster). Bei einem Hänger vorher `esl_dienst.log` sichern und schicken.
- Die alten APITool-Dateien liegen in `_abgeloest/APITool_2026-10-18/`.

### Postfach-Seite (neu seit 30.10.) — nur auf deinem eigenen PC

Die Seite „Postfach“ (Reiter rechts neben „Steuerung“) zeigt aus Outlook: wer heute abwesend ist (Dispo-Mails), Mitarbeiterinfos, wichtige Mails, den Posteingang, die Termine von heute und einen Knopf „Mail an Team“.

- **Einschalten:** in `ESL_Dienst_Start.cmd` die Zeile `set "ESL_DIENST_POSTFACH=0"` auf `1` ändern und den Dienst neu starten. **Nie am Wandmonitor einschalten** — dort gehören keine Mails hin.
- **Braucht Outlook (klassisch), geöffnet.** Das „neue Outlook“ geht nicht; dann steht oben „Outlook (klassisch) nicht erreichbar“.
- Gelesen wird alle 3 Minuten. Klappt es einmal nicht, bleibt der letzte Stand stehen und oben steht der Grund.
- **Wichtige Absender:** Datei `Postfach_Wichtig.txt` neben `ESL_Dienst_Start.cmd` (legt der Dienst beim Start an). Eine Zeile = ein Name oder eine Adresse; Änderungen wirken sofort. Oder auf der Seite bei einer Mail „als wichtig markieren“ klicken.
- **Es wird nie etwas gesendet.** „In Outlook öffnen“, „Antworten“ und „Mail an Team“ öffnen nur ein Outlook-Fenster; Empfänger trägst du selbst ein und schickst selbst ab.
- „Abwesend heute“ und „Mitarbeiterinfos“ zeigen alle Meldungen, egal welcher Filter oben steht. Nur „Mail an Team“ richtet sich nach dem Filter.

---

## NEU seit 05.10. spätabends — die Ligaliste läuft im Hintergrund weiter

**Warum:** Edge legt Tabs schlafen, die nicht vorn liegen. Dann laufen dort weder Zeitgeber noch Abrufe, bis jemand den Tab anklickt. Die Ligaliste liegt im Betrieb immer hinten, das Dashboard oft auch. Am 05.10. stand die Ligaliste so 13 Minuten, das Dashboard 50 Minuten.

- **Dashboard, Ligaliste und Genesys-Monitor halten sich jetzt selbst wach.** Du musst nichts einstellen. An echtem Edge gemessen: ohne den Schutz schläft ein verborgener Tab ein, mit Schutz nicht.
- **Auf der Ligaliste ist nichts mehr zu klicken.** Alle 3 Minuten kommt der Intraday-Stand von selbst, einmal am Tag die Woche. Klickst du selbst Ok mit einem anderen Zeitraum (Woche, Monat, Gestern), holt der Crawler den Intraday-Stand nach 2 bis 3 Sekunden selbst nach. Auf „Intraday" zurückstellen musst du nicht.
- **Knopf „Jetzt" bleibt nicht mehr hängen.** Am 05.10. stand er zwei Stunden auf „läuft", jeder Export wartete deshalb 50 Sekunden länger.
- **Die Ligaliste meldet sich im Logbuch.** Steht dort „Ligalisten-Tab war … eingefroren" oder „Tab war … vom Browser eingefroren … trotz Wachhalter", hat Edge den Tab doch schlafen gelegt. Dann einmal in Edge abschalten: Einstellungen → System und Leistung → „Ressourcen mit schlafenden Tabs sparen" aus. Oder dort bei „Diese Websites nie in den Ruhezustand versetzen" `esl.regiocom.net` und `ccs.vodafone.de` eintragen.
- **Ein Ligalisten-Tab, der nicht am Dashboard hängt, wird neu verbunden.** Das betrifft Tabs, die von Hand geöffnet oder von Edge wiederhergestellt wurden. Bekommt das Dashboard 5 Minuten nichts, verbindet der Starter es mit der Ligaliste. Am 29.09. kamen so drei Stunden lang keine Liga-Zahlen.
- **„Keine bekannte Portal-Seite" auf dem Ligalisten-Tab hieß: die Seite war gar nicht geladen.** Antwortet das Portal beim Neuladen nicht (Netz kurz weg), zeigt Edge seine eigene Fehlerseite („Diese Seite ist leider nicht erreichbar"). Dort stand der Hinweis, und danach lud nichts mehr neu, bis jemand den Tab ansah. **Jetzt lädt der Autopilot die Seite alle 20 Sekunden von selbst neu**, bis sie wieder da ist. An echtem Edge gemessen: Ligaliste nach 22 Sekunden zurück, auch wenn der Tab hinten liegt; die Fassung davor blieb mit genau dieser Meldung stehen. Im Logbuch steht dann „Ligalisten-Tab steht auf der Fehlerseite des Browsers (…)" mit dem Fehlercode.
- **Auf einem wirklich fremden Tab** (Postfach, Startseite) heißt der Hinweis „diese Seite (…) gehört nicht zu ESL oder Ligaliste — hier passiert nichts" und verschwindet nach 8 Sekunden.

---

## NEU seit 05.10. abends — Kopfleiste steht ruhig, Zoom fest auf 100 %

**Warum:** Bei 150 % Zoom passte die Kopfleiste nicht mehr auf den Bildschirm. Der neue Zähler „ohne Stack" schob das Menü (☰, darin „Einstellungen") aus dem Bild, und bei jedem Filterklick sprangen alle Knöpfe.

- **Zoom steht auf 100 %.** Die Automatik („Größe folgt dem Fenster") ist ab Werk aus. Beim ersten Start nach dem Update wird einmal auf 100 % gestellt, auch wenn vorher etwas anderes gespeichert war. Wer es größer will: ☰ → `+` / `−`, oder Zahnrad → Anzeige → „Größe folgt dem Fenster". Das bleibt dann gespeichert.
- **Menü (☰) und Schließen (✕) bleiben immer rechts im Bild** — bei jeder Fensterbreite und jedem Zoom.
- **Die Knöpfe springen nicht mehr.** Der Zähler „… ohne Stack" steht jetzt ganz links in der Knopfreihe, das ✕ zum Zurücksetzen der Filter hat einen festen Platz.
- **Wird das Fenster schmaler als etwa 1700 px**, blendet die Leiste selbst Entbehrliches aus, in dieser Reihenfolge: LIVE-Marke und der Zusatz „ohne Stack" (die Zahl bleibt) · Uhr und „+Q" · Schriftzug und „Auto" · ESL-/Liga-Uhrzeit. Filter, Seiten, Projekt-Knöpfe, „Jetzt", Menü und Schließen bleiben immer.

---

## NEU seit 05.10. — niemand verschwindet mehr, und vor jeder Ausgabe wird aktualisiert

**Warum:** Unter einem Stack-Filter fehlten Mitarbeiter, die nicht in der Mitarbeiter-Excel stehen. Am 28.09. waren das 97 von 457. Ohne Filter stimmte alles.

- **Stack-Filter zeigt jetzt dasselbe wie die Excel.** Fehlt ein Mitarbeiter in der Mitarbeiter-Excel, bekommt er den Stack seiner Kollegen aus demselben ESL-Team, wenn die alle denselben Stack haben. Geraten wird nicht.
- **Zähler „… ohne Stack" links neben der ESL-/Liga-Uhrzeit (gelb).** Er nennt, wie viele Mitarbeiter keinem Stack zugeordnet werden konnten. Klick zeigt die Liste mit dem Grund. Sie zählen unter „Alle Stacks" und unter „… gesamt" mit, unter einem einzelnen Stack nicht.
- **Knopf „Mapping-Lücken als Excel"** in dieser Liste: schreibt eine Datei mit allen Mitarbeitern, die heute gebucht haben und in der Mitarbeiter-Excel fehlen (mit Stack-Vorschlag), und mit den Teams ohne Stack-Eintrag. **Damit die Mitarbeiter-Excel pflegen und neu einlesen** — das ist die eigentliche Abhilfe.
- **Stack-Filter: „Kabel gesamt", „Mobile gesamt", „UM gesamt".** Zeigt alles aus diesem Projekt, auch Mitarbeiter ohne Zuordnung. Gibt es auch im Export-Dialog und im Report.
- **Excel: neues Blatt „Ohne Stack"** mit genau diesen Mitarbeitern.
- **Export und Stundenmail holen vorher selbst frisch.** Der Bericht holt, was sein Filter braucht (ohne Stack-Filter alle drei Projekte), dann erst wird gebaut. Klappt ein Abruf nicht, wird trotzdem gebaut — der Grund steht in der Statuszeile bzw. im Starterfenster.
- **Klick auf eine Verkaufs-Kachel (BNT, KIP, Mobilfunk, VVL) zeigt jetzt nur die Abschlüsse des Filters.** Vorher stand dort unter einem Filter die Liste aller Standorte. Dasselbe gilt für eigene Kacheln mit Verkaufslisten (Produkt-Rangliste, Verlauf, Ticker).
- **Der Tagesstand wird auch bei gesetztem Filter gesichert** (alle 5 Minuten). Vorher fehlte er für „Gestern" und die Woche, wenn den ganzen Tag ein Stack-Filter stand.

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

## 1. Start — ein Dashboard für alle drei Projekte (seit 27.09., umgebaut 28.09.)

**Nur noch `ESL_Start.cmd` doppelklicken.** Das Dashboard zeigt Kabel, Mobile und UM zusammen. **Live mit läuft immer nur EIN Projekt — das, auf dem du stehst.** Das ESL kennt je Anmeldung nur ein aktuelles Projekt (am 27.09. gemessen); wer mehrere gleichzeitig holt, bekommt vertauschte Zahlen. Genau das war „erst Daten, dann 0".

- **Projekt wählen:** oben neben „Jetzt" die Knöpfe **Kabel | Mobile | UM** (rot = aktiv) — oder im **Stack-Filter** einen Stack wählen (VKD_Tech/OneC_Tech = Kabel, MF_* = Mobile, VUM_* = UM). Das Dashboard stellt das ESL dann kurz um, holt die Zahlen dieses Projekts und fragt die Ligaliste gleich mit neu ab.
- Ab dann wird **nur dieses Projekt alle 20 Sekunden** aktualisiert. Die anderen behalten ihren letzten Stand, bis du wieder umschaltest. Amber unterstrichen = Stand älter als 15 Minuten oder noch keiner. Die Wahl bleibt gespeichert.
- **Morgens vor dem ersten Datensatz** zeigt der Tooltip des Knopfs „noch keine Datensaetze heute" — das ist kein Fehler; sobald der erste Datensatz im ESL steht, kommen die Zahlen von selbst.
- Klick auf das schon aktive Projekt (oder „Jetzt") holt es sofort neu.
- **Jede Lieferung wird geprüft:** gehören die Mitarbeiter laut Mitarbeiter-Excel nicht zum Projekt, werden die Zahlen verworfen (roter Streifen mit Grund), und das Dashboard stellt beim nächsten Takt selbst zurück.
- **Im ESL bitte nicht mehr von Hand das Projekt wechseln** — das stellt die Anmeldung um. Das Dashboard fängt es ab, aber bis zum nächsten Takt fehlen Zahlen.
- Nach F5/Neustart ist zuerst nur das aktive Projekt da — die anderen einmal anklicken. Export und Stundenmail holen sie seit 05.10. selbst (Abschnitt 4 und 6).
- Die Ligaliste läuft einmal für alle und wird beim Neustart des Dashboards nicht mehr neu geladen. Für die Qualitätszahlen von Mobile/UM muss deine Ligalisten-Vorlage deren Stacks enthalten (der Crawler wiederholt deinen Ok-Klick).
- Die Warteschleife zeigt weiter nur Kabel.
- Ausschalten (zurück auf nur Kabel): in der Konsole `rcAlleProjekte(false)`, dann F5. Wieder an: `rcAlleProjekte(true)`, F5.

`ESL_Start_Mobile.cmd` / `ESL_Start_UM.cmd` brauchst du dafür nicht mehr. Sie funktionieren weiter, falls du ein Projekt einmal einzeln auf einem eigenen PC fahren willst — dort bleibt das Dashboard beim eigenen Projekt.

Das Fenster bleibt offen — es meldet nach einem Sitzungsablauf automatisch neu an und hält den Autopiloten am Leben. **Nicht schließen.**

Der Autopilot loggt sich ein, klickt sich zum richtigen Projekt durch und startet das Dashboard. Landet das Portal nach einem Re-Login versehentlich auf einem anderen Projekt, wechselt der Autopilot von selbst zurück (mit gelbem Banner) — das ist gewollt und kein Fehler.

---

## 2. Ligaliste — läuft seit 16.08. von selbst an

**Normalfall: nichts tun.** Ist „Liga-Abfrage automatisch" an (ab Werk ja, Zahnrad → Anzeige → Automatik), klickt der Crawler den Ok-Knopf selbst, sobald kein Klick gemerkt ist — die Daten kommen ohne dein Zutun. Der Starter setzt zusätzlich seinen eigenen Klick (1×/5 Min), falls die Sitzung neu ist.

**Willst du selbst führen** (bestimmte Vorlage, bestimmte Kennzahlen wie ACW/ACHT, anderer Zeitraum), klick einfach selbst — dein Klick gewinnt immer und wird gemerkt. So geht die volle Kette von Hand:

1. Im Dashboard oben den Knopf **„KPI-Quelle"** (bzw. das Werkzeug-Menü → KPI) klicken — öffnet die Ligaliste.
   → **Seit 21.08. läuft der KPI-Crawler dort binnen Sekunden an** statt erst nach mehreren Minuten. Der Starter verschläft seine Wartezeit nicht mehr, sondern sieht alle 2 s nach neuen Tabs und versorgt sie sofort. Voraussetzung ist wie immer, dass `ESL_Start.cmd` läuft — ohne Starter kommt der Crawler weiterhin nur über F12 oder das Lesezeichen in die Seite.
2. Dort deine Vorlage laden (Kabel TEC / MOB CARE / VUM CARE — je nach Projekt).
3. Auf **Ok** klicken — mit dem Zeitraum, den du sehen willst.
   → Der Klick wird gemerkt. Steht er nicht auf „Intraday", holt der Crawler den Intraday-Stand nach 2 bis 3 Sekunden selbst nach (seit 05.10.). Die Woche auf Tagesbasis zieht er einmal am Tag von selbst.

Ab jetzt läuft automatisch **alle 3 Minuten** ein Replay genau dieses Klicks — derselbe Baum, dieselben Standorte, dieselben Kennzahlen, nur auf Intraday gestellt. Ohne gemerkten Klick übernimmt seit 16.08. die Auto-Abfrage (Konsole: `rcCrawlerAutoKlick(false)` schaltet sie ab — dann wartet der Crawler wie früher auf dich).

Genesys läuft weiterhin komplett automatisch, wie bisher.

---

## 3. Dashboard-Takt

- **ESL**: alle 20 Sekunden — nur das aktive Projekt (Abschnitt 1)
- **Ligaliste**: alle 3 Minuten (Replay, siehe oben)
- **Genesys**: automatisch, unverändert

---

## 4. Excel-Export

Knopf **„Excel-Export"** auf der Steuerungs-Seite öffnet den Dialog.

**Oben im Dialog: „Projekte aktualisieren"** — zeigt je Projekt, wie alt der Stand ist. **Seit 05.10. holt der Bericht vor dem Bau selbst, was sein Filter braucht** (ohne Stack-Filter alle drei Projekte, mit Stack-Filter das Projekt dieses Stacks) — sobald heute im gewählten Zeitraum liegt. Die Statuszeile zeigt, was gerade geholt wird. Klappt ein Abruf nicht, entsteht die Mappe trotzdem; der Grund steht dann rot hinter dem „Fertig". Die Knöpfe „Kabel / Mobile / UM aktualisieren" brauchst du nur noch, wenn du einzeln nachholen willst. Das aktive Projekt bleibt dabei das aktive. Ein gesetzter Stack-Filter im Dashboard stört den Bericht nicht: der Export rechnet seit 28.09. immer mit dem vollen Bestand und schneidet erst dann nach den Filtern im Dialog zu.

**Stack-Filter im Dialog:** neben den Stacks stehen „Kabel gesamt", „Mobile gesamt" und „UM gesamt" — das ganze Projekt, auch Mitarbeiter ohne Stack-Zuordnung. Unter einem einzelnen Stack fehlen diese Mitarbeiter in den Summen; sie stehen dann im Blatt **„Ohne Stack"**.

Eine Mappe, vier Zeitbezüge:

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

1. **„Bericht erstellen"** — die volle Mappe (`regiocom_ESL_Report`): Stand, Vertrieb, Analyse, Struktur, Liga-Blätter, Stacks, Teams, Agenten, Entwicklung, Ohne Stack (nur wenn es solche Mitarbeiter gibt), Abdeckung.
2. **„Nur Reporting (kompakt)"** — schlanke Mappe (`regiocom_ESL_Reporting`) mit **nur** den zwei Block-Blättern (Vertrieb / Qualität, Standort → Stacks → Teams). Kein Stand-, Analyse- oder Liga-Blatt.
3. **„Reporting ALLE Projekte"** — siehe Abschnitt 5.

**Vertrieb und Qualität sind immer getrennte Blätter/Tabellen.** Nur das Screenshot-Blatt `AKTUELLER_STAND` (für die Mail) mischt beides, das ist Absicht.

**So wird gezählt (seit 28.09. in allen Blättern gleich):** Stück = Spalte `anzahl` bei „angenommen“; Potential Tracking („Info World“) zählt nicht. **Geräte** (Homebox, Fritzbox, SuperWLAN, Ultra Hub, CI+ Modul) und **NBA-Tipps** sind kein Verkauf — sie stehen nur im Blatt „Produkte“ als eigene Klasse, nie in BNT/VVL. „UM TV Connect“ und „UM Internet&Phone“ liefert das ESL im Mobile-Export ohne Produktgruppe — sie zählen als **VVL** (Vorgabe vom 29.09.). Andere Produkte **ohne Produktgruppe** stehen im Blatt „Produkte“ als „Ohne Produktgruppe“ und zählen weder als BNT noch als VVL. Im Blatt „Vertrieb“ zeigen die Produktspalten nur CR-relevante Stück; der Rest steht gebündelt in „nicht CR-rel.“. **Tage vor dem 28.09.** bleiben so gespeichert, wie sie gezählt wurden (Geräte noch in BNT), bis sie neu geholt werden.

---

## 5. Reporting über alle drei Projekte — Achtung, Praxis-Hinweis

**Seit 27.09. meist nicht mehr nötig:** Der normale Excel-Export enthält alle drei Projekte — seit 05.10. holt er sie vor dem Bau selbst frisch. Ohne Stack-/Standort-Filter geht er über alle Stacks bis auf Team-Ebene, mit Filter nur über den gewählten Bereich. Tage, an denen das Dashboard gar nicht lief, lädt es rückwirkend nur für Kabel nach.

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

**Seit 05.10.: erst aktualisieren, dann Mail.** Vor jeder Stundenmail lässt der Starter das Dashboard holen, was der Zuschnitt der Mail braucht — ohne Stack-Filter alle drei Projekte, mit Stack-Filter das Projekt dieses Stacks, dazu die Ligaliste. Im Starterfenster steht dann z. B. „Aktualisiert nach 9 s — Mobile: 1405 Zeilen". Dauert das länger als zwei Minuten oder klappt ein Projekt nicht, geht die Mail trotzdem raus, und der Grund steht im Fenster. Für eine Mail über ein ganzes Projekt in `ESL_Start.cmd` z. B. `$MailStack = 'P:kabel'` eintragen (`P:mobile`, `P:um`). Der Knopf „Report jetzt" und der Stundentakt im Dashboard aktualisieren genauso vorher.

---

## 7. Kurz-Referenz Konsole

| Befehl | Wirkung |
|---|---|
| `rcCrawlerSperre()` | zeigt, ob/wer die Ligalisten-Seite gerade belegt |
| `rcCrawlerHarvestWoche()` | Wochenlauf von Hand nachziehen |
| `rcJetztAktualisieren()` | ESL + Liga sofort holen (Knopf „Jetzt" in der Kopfleiste) |
| `rcZoomAuto(true)` / `rcZoomAuto(false)` | Zoom-Automatik an/aus (ab Werk aus, 100 %) |
| `rcReportNow()` | Report sofort erzeugen (ohne Mail) |
| `rcReport.setAuto(true/false)` | Stundentakt an/aus |
| `rcExportReporting(von, bis, scope)` | schlanke Mappe über Konsole |
| `rcExportReportingAlle(von, bis)` | Alle-Projekte-Mappe über Konsole |

---

## 8. Wenn etwas nicht stimmt

- **Zuerst immer: Werkzeug-Menü → „Logbuch" → die Datei `ESL-Logbuch-….txt` aus dem Download-Ordner schicken.** Seit 27.09. steckt darin der **Flugschreiber**: er läuft mit dem Dashboard von selbst mit (auch nach Neuladen) und hält jeden Abruf von Kabel/Mobile/UM, jeden Fehler, jeden Hänger, Sitzungswechsel, Liga-Pakete und Klicks fest — mit einem fertigen Befund oben drin. Nichts einfügen, nichts einschalten. Keine Namen, keine Kundendaten.
- **Ligaliste liefert zeitweise nichts, und es geht weiter, sobald du den Tab anklickst:** Edge hat den Tab schlafen gelegt. Seit 05.10. halten sich die Seiten selbst wach; steht im Logbuch trotzdem „… eingefroren", die schlafenden Tabs in Edge abschalten (siehe oben, „NEU seit 05.10. spätabends").
- **Auf dem Ligalisten-Tab steht Edges Fehlerseite („… nicht erreichbar"):** nichts tun. Unten rechts steht „… ist nicht erreichbar (Fehlercode) — lade in 20 s von selbst neu", und der Autopilot versucht es alle 20 Sekunden wieder. Bleibt das länger so, ist das Portal oder das Netz weg; der Fehlercode steht auch im Logbuch.
- **Ligaliste liefert nichts:** Konsole zeigt ORA-Fehlercode im Klartext oder „noch kein Ok-Klick gemerkt". Seit 16.08. versucht es die Auto-Abfrage von selbst; hilft das nicht (oder ist sie abgeschaltet), einmal Woche+Tag+Ok, Intraday+Ok von Hand (Abschnitt 2). Prüfen: Zahnrad → Anzeige → Automatik → „Liga-Abfrage automatisch".
- **Autopilot bleibt auf falschem Projekt stehen:** Startfenster nicht geschlossen? Es muss weiterlaufen, damit der Wächter aktiv bleibt.
- **Export-Knopf tut nichts / Fehlermeldung:** Steht unten im Dialog als Klartext (z. B. „keine Daten im gewählten Zeitraum") — meist fehlt die Historie für den gewählten Tag, dann zuerst „Zeitraum → Daten laden" ausführen.
