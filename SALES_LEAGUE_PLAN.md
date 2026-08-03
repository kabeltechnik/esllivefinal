# REGIOCOM SALES LEAGUE — Finaler Plan (v1.1, 16.07.2026)

> [!IMPORTANT]
> **Umsetzungsstand 16.07.2026 — Stufe 1 ist GEBAUT** (in `esl_live_arena_v22.js`, Block `RC_LEAGUE`,
> umschaltbar per Button im Radar-Header bzw. `rcSetRadarMode('league'|'burg')`; der Burg-Modus bleibt
> vollstaendig erhalten). **User-Entscheidungen, die Teile von Abschnitt 1/4.2 ersetzen:**
> - KEINE Konferenz-/Team-Duelle: ALLE Agenten, die tracken, spielen in EINEM europaweiten
>   K.-o.-Turnier. Tagesende-Cut: 0 Tages-Tore = raus (haben alle getroffen: das Minimum fliegt);
>   Kranke/Urlauber scheiden dadurch natuerlich aus. Freitag = Finale der Uebriggebliebenen.
> - Trikot = Landesflagge des Standorts (TR/GR/DE/AT), Agentenname als Schild UEBER dem Trikot.
> - Torszenen je Produkt: KIP = Fallrueckzieher · MOB = Freistoss · ENV = Flachschuss ·
>   PTV = Schlenzer · GIGA/DSL = Abstauber · VVL = Keeper-Parade · Elfmeter geseedet (5 Team-Anspr.).
> - Demo: `test_league_demo.html` spielt den juengsten ECHTEN Export-Tag im Zeitraffer ab
>   (`league_demo_rows.js`, generiert aus `Test Excels/Export_20260714_205722.xlsx` + Mapping).

> Synthese aus: User-Ideen (Elfmeter, 40/20/20/20, Wochenturnier, Spannungskurve),
> Gemini-Konzepten (Champions Week, Glück & Qualität, Survival League) und
> Machbarkeits-Analyse gegen den echten Code (`esl_live_arena_v22.js`, RC_WAR-Engine).
> Dieses Dokument ist die einzige Quelle der Wahrheit. Alles andere ist Brainstorming-Historie.

---

## 0. Die fünf Grundgesetze (nicht verhandelbar)

1. **Ehrliche Anzeigetafel.** Jedes Tor auf dem Monitor ist ein echter ESL-Eintrag eines echten Agenten.
   Keine Bonus-Tore, kein Qualitäts-Roulette, keine erfundenen Ergebnisse. Tore können nur steigen, nie sinken.
2. **Glück nur als Elfmeter.** Sichtbar, begrenzt, aus Fleiß verdient (jede 5. Team-Ansprache).
   Deterministisch geseedet: `seed = hash(dateKey + teamId + elfmeterNr)` → alle Monitore an allen
   Standorten zeigen dasselbe Ergebnis, Re-Inject würfelt nicht neu, Replay ist exakt reproduzierbar.
3. **Eintrittskarte = Tracking.** Das Spielfeld ist morgens leer. Eine Figur läuft erst ein, wenn der
   Agent heute etwas im ESL eingetragen hat (Ansprache oder Sale). Wer nicht trackt, existiert im
   Stadion nicht. (Ersatz für den unmöglichen Live-Telefonstatus — und der direkte Hebel gegen die
   Tracking-Lücke: 7,6 % Alanya vs. 69,8 % Berlin.)
4. **Eskalation über die Bühne, nicht über Rauswurf.** Battle-Royale-Spannung ja — Eliminierung nein
   (Begründung in Abschnitt 6). Niemand fliegt vom Feld; die Kamera und das Licht erzeugen die Dramatik.
5. **Fairness über Struktur, nicht über Mathematik auf der Anzeigetafel.** Duelle nur innerhalb der
   Konferenz (Stack) und Größenklasse. Die CR bekommt eine eigene Wertung, verbiegt aber nie den Spielstand.

---

## 1. Liga-Struktur

- **Zwei Konferenzen** über `stackMap`: VKD-Konferenz (VKD_Tech: Alanya, Berlin, Potsdam, Essen) und
  OneC-Konferenz (OneC_Tech: Serres, Alexandroupolis, W_HOME).
- **Größenklassen** nach Liga-Calls des Vortags (aus `rcLigaHistory`), damit ein 400-Call-Team nie
  gegen ein 100-Call-Team spielt.
- **Tages-Paarungen** morgens fix per Schweizer System: innerhalb Konferenz + Größenklasse wird nach
  aktuellem Wochenpunktestand gepaart (1. vs 2., 3. vs 4., …). Paarung bleibt den ganzen Tag stabil
  (kein Duell-Wechsel um 14 Uhr — der Gegner ist das Gesicht des Tages).
- **Standort-Derbys** als Rahmen-Erzählung im Ticker (Alanya vs. Serres = Länderderby, Berlin vs.
  Potsdam = Lokalderby), rein redaktionell, keine eigene Mechanik in Stufe 1.

## 2. Tor- und Punktregeln (40/20/20/20 übersetzt)

### Spielstand im Duell (nur echte Ereignisse, monoton steigend)

| Ereignis | Animation | Wertung |
|---|---|---|
| KIP BNT / Mobilfunk BNT | **Traumtor** (Fallrückzieher / Volley, Replay, Screenshake) | **2 Tore** |
| ENV / PTV / DSL BNT | Tor (Flachschuss / Schlenzer / Abstauber) | 1 Tor |
| Elfmetertreffer | Elfmeter-Sequenz (geseedet) | 1 Tor |
| Ansprache, Ergebnis offen | **Pfostenkracher** — Schütze lauert sichtbar auf den Abpraller | 0 (Zähler für Elfmeter) |
| Ansprache, abgelehnt | **Glanzparade des Gegners** — gefeierte Großchance | 0 (Zähler für Elfmeter) |
| VVL | **Parade des eigenen Keepers** | Paraden-Zähler (s. u.) |

- **Duell-Sieger** = mehr Tore. **Bei Gleichstand** entscheidet die Paraden-Zahl (VVL), danach die
  Ansprachen-Zahl. So gewinnt Abwehrarbeit enge Spiele — wie im echten Fußball.
- **Tagestabelle** = Punkte: Sieg 3 / Remis 1 / Niederlage 0. Zusatzspalte CR-Index (Info, sortiert nicht).

### Scorerpunkte der Agenten (Einzelwertung, spiegelt die Gewichtung)

| Aktion | Punkte |
|---|---|
| KIP/MOB BNT | 4 |
| ENV/PTV/DSL BNT | 2 |
| VVL | 2 |
| Elfmetertreffer (Schütze) | 2 |
| Ansprache | 1 |

Alle Werte sind Konstanten in einem `RC_LEAGUE.cfg`-Block — zentral tunebar.

### Elfmeter (User-Regel, präzisiert)

- Zähler pro Team über `_anspIds` (Doppelzählungs-Schutz existiert). Jede 5. Ansprache → Elfmeter,
  Schütze = Agent der auslösenden Ansprache.
- Standard-Chance 1/3, **Underdog** (Tabellenletzter der eigenen Konferenz) 2/3.
- Seed-RNG (mulberry32 o. ä.), Eingabe `dateKey|teamId|floor(count/5)` → überall synchron.
- Bursts (mehrere Ansprachen in einem 20s-Poll) werden über die vorhandene `RC_WAR.queue`
  nacheinander abgespielt.

## 3. Tagesdramaturgie — vier Akte statt Eliminierung

**Akt 1 · Anpfiff (08:00–13:00).** Konferenz-Modus: Hauptbühne zeigt das Top-Duell, rechts die
Tabelle, unten der Ticker. Figuren laufen mit dem ersten Track des Tages ins Stadion ein
(Einlauf-Animation mit Namens-Bauchbinde — der Moment gehört dem Agenten).

**Akt 2 · Zweite Halbzeit (13:00–16:00).** Um 13:00 Halbzeit-Show: Zwischenstand-Panel,
beste Szene des Vormittags als Replay, „Trainer-Analyse" im Ticker (z. B. „Viel Ballbesitz,
kein Zug zum Tor" bei vielen Calls / wenig Ansprachen). Danach rotiert die Hauptbühne alle
paar Minuten auf das jeweils engste Duell.

**Akt 3 · Finalfeld (16:00–17:45).** Das Flutlicht geht an (Licht-Zyklus, s. Abschnitt 5) —
die Bühne wechselt zum **Scorer-Rennen**: die Top 5 Agenten europaweit stehen als große Figuren
im Flutlicht-Stadion, live sortiert. **Joker-Prinzip statt Rauswurf:** JEDES Tor katapultiert
den Schützen sofort sichtbar auf die Bühne (Einwechsel-Animation mit Sirene im Ticker);
ein KIP/MOB-Traumtor übernimmt die Spitzenposition mit Übernahme-Inszenierung. Niemand ist je
„raus" — die Team-Duelle laufen parallel in der Konferenzleiste weiter und zählen voll.

**Akt 4 · Nachspielzeit & Schlusspfiff (17:45–18:00).** Anzeigetafel und Tabelle werden verdeckt
(Schloss-Symbol), Animationen laufen weiter — niemand weiß, ob es reicht. 18:00: Schlusspfiff,
Highlight-Reel im Schnelldurchlauf (Replay-Mechanik über `rcAllSales` existiert), Tabelle deckt
sich Zeile für Zeile auf. Finale: **Last-One-Standing-Zeremonie** — das Stadion wird dunkel,
ein einziger Spot, die MVP-Figur steht allein auf dem Rasen, Name in Großformat. Meisterschale
für das Siegerteam des Tages.

Damit ist die Battle-Royale-Idee des Users vollständig drin — als Bild („am Ende steht EINER im
Licht") und als Spannungskurve — ohne dass um 13:00 die halbe Fläche unsichtbar wird.

## 4. Wochenmodus (Stufe 2 — „Champions Week")

### 4.1 Architektur: Rebuild statt Speicherstand (Citrix-fest)

**Grundsatz: Die Woche ist eine FUNKTION, kein Speicherstand.** Auf Citrix kann `localStorage`
jederzeit verschwinden (non-persistentes Profil) — deshalb wird der Wochenzustand NIE als Wahrheit
gespeichert, sondern bei jedem Start deterministisch aus Serverdaten neu berechnet:

```
rcLeagueRebuild():
  1. Kalender: ISO-Woche + Wochentag bestimmen → heute ist Spieltag N.
  2. Für jeden vergangenen Spieltag (Mo..gestern):
     a. ESL-Tagesaggregat holen: aus rcEslHistory, fehlt es → Auto-Harvest
        via rcFetchRangeViaUI(Montag, gestern) vom Server nachladen.
     b. Liga-Calls je Tag: aus rcLigaHistory, fehlt es → Crawler
        last_week/current_week (Montag-Falle: Vortage aus last_week).
     c. Team-Aggregation: byAgent[vo] → ccs → Team via aktuelles Mapping.
     d. Paarungen des Tages deterministisch berechnen (s. 4.2).
     e. Duell-Ergebnisse + Elfmeter aus den Aggregaten + Seeds nachrechnen.
  3. Wochen-Tabelle steht. localStorage nur als CACHE (schnellerer Start);
     bei Laden validieren (richtige Woche? alle Tage da?) — sonst Rebuild.
```

Die Datenlage reicht dafür bereits aus (im Code verifiziert): das Tagesaggregat speichert pro
Agent `k/a/bcr/bnt/vvl/mob/kip` + `ccs/nm` (`rcNewAgg`/`rcAccumRow`/`rcFinalizeAgg`, ~L5195),
und `classify` (~L1566) zählt `mob`/`kip` sauber NUR als BNT (VVL läuft separat als
`mobVvl`/`kipVvl`). Daraus rekonstruierbar: Traumtore = `mob+kip`, Rest-BNT = `bnt−mob−kip`,
Paraden = `vvl`, Elfmeter-Anzahl = `floor(teamAnsprachen/5)`, jedes Elfmeter-Ergebnis aus dem
Seed. **Kein neues Speicherformat nötig.** Voraussetzung: `byAgent` hat `ccs`
(`rcRepairEslHistory` läuft nach jedem Mapping-Import automatisch).

Konsequenzen dieser Architektur:
- **Citrix-Wipe ist egal** — nach Re-Inject baut sich die Woche in Sekunden neu auf.
- **Alle Monitore an allen Standorten zeigen identische Wochenstände** ohne jede Synchronisation
  (gleiche Serverdaten + gleiche Seeds = gleiches Ergebnis).
- **Nachträge werden ehrlich gewertet:** Trägt ein Agent einen Montag-Sale erst Dienstag ein,
  ändert der Rebuild die Montag-Wertung. Das ist gewollt (Server = Wahrheit) und wird im Ticker
  als „Nachträgliche Wertung" gemeldet statt versteckt.
- **Tage ohne Daten** (Feiertag, Ausfall) sind einfach kein Spieltag — Spieltag-Nummer = Anzahl
  Werktage mit Daten in der Woche.

### 4.2 Determinismus-Regel für Paarungen und Underdog

Damit der Rebuild exakt dasselbe ergibt wie der Live-Tag, dürfen Paarungen und Underdog-Status
NICHT vom Live-Zwischenstand abhängen (der ist aus Tagesaggregaten nicht rekonstruierbar):
- **Paarungen des Tages** werden aus dem Wochenstand NACH dem Vortag berechnet (Spieltag 1:
  Größenklassen + Reihenfolge aus der Vorwoche via `last_week`). Sie stehen morgens fest.
- **Underdog-Status** (2/3-Elfmeterchance) wird ebenso morgens fixiert: Tabellenletzter der
  Konferenz nach Vortagesstand — den ganzen Tag gültig. (Nebeneffekt: kommunizierbar —
  „Ihr seid heute das Underdog-Team, euer Elfmeter trifft doppelt so oft.")

### 4.3 Spielplan der Woche

- Spieltage Mo–Do per Schweizer System (Paarungsregel aus 4.2).
- **Donnerstags-Cut auf TEAM-Ebene:** obere Hälfte spielt Freitag um die Meisterschaft, untere um
  den Aufstiegs-Pokal. Beide Hälften spielen — jeder hat am Freitag ein eigenes Finale.
- **Freitag:** Flutlicht-Modus ab morgens, verdeckte Nachspielzeit ab 16:00 (statt 17:45),
  großes Highlight-Reel + Doppel-Siegerehrung um 18:00. Das Finale rechnet Mo–Do aus dem Rebuild
  plus den Live-Freitag.
- **Wochen-Awards:** Goldener Schuh (meiste KIP/MOB), Spielmacher (meiste Ansprachen),
  Abwehr-Titan (meiste VVL), Elfmeter-Held (beste Quote), Effizienz-Meister (beste CR — hier
  lebt die CR-Fairness, ohne den Spielstand zu verbiegen).

## 5. Visualität — der „Broadcast-Look" (Anti-Billig-Spezifikation)

Leitidee: **keine Landkarte mit Männchen, sondern eine Fernsehübertragung.** Referenz ist die
Samstags-Konferenz, nicht ein Browserspiel. Alles Canvas-2D, keine externen Assets, keine Emojis.

### 5.1 Bühnenbild
- **Studio-Rahmen:** dunkles UI (#1F2D3D-Basis), Panels als „Glas" (leichte Transparenz, 1px helle
  Lichtkante oben), eingebetteter Vodafone-Font für alle Overlays.
- **Spielfeld in 3/4-Perspektive** (Trapez mit Fluchtpunkt), nicht flach von oben: Rasen mit
  Mähstreifen (zwei Grüntöne im Wechsel), weiße Linien mit dezentem Glow, Tor mit gezeichnetem Netz
  (Linienraster), Netz-Ripple beim Einschlag.
- **Tribünen** als dicht gepunktete Menge mit Farbrauschen in Teamfarben; Zuschauerdichte =
  Stimmungswert (Stufe 3: TNPS). **Werbebanden** als ruhige Farbflächen in Corporate-Farben.
- **Licht-Zyklus nach Uhrzeit** (das stärkste Einzel-Feature gegen „billig"): vormittags neutral
  kühl, nachmittags warm/golden, ab 16:00 Flutlicht — Himmel dunkel, vier Lichtkegel, Vignette,
  Farben satter. Die Dramaturgie des Tages entsteht damit fast gratis.

### 5.2 Figuren
- Keine Strichmännchen: kompakte Vektor-Spieler mit Trikot-Torso in Teamfarbe, Rückennummer,
  Kopf, zweigliedrigen Beinen; **Skelett-Laufzyklus** (Sinus-Phase), weicher Ellipsen-Schatten.
- **Squash & Stretch** beim Schuss, **Antizipation** (~200 ms Ausholen) vor jedem Abschluss,
  Ball mit Motion-Trail, Torwart-Hechtsprung mit Nachfedern.
- **Namen als TV-Bauchbinde** (Lower Third: Balken mit Name + Team + Aktion), nicht als
  schwebender Text überm Kopf.

### 5.3 Event-Regie (die wichtigste Regel)
Jedes Großereignis läuft in **drei Phasen**: Ankündigung (Bauchbinde slidet ein, 0,5 s) →
Aktion (eine „Kamera": Zoom/Schwenk auf den Strafraum, Abschluss, Ergebnis) → Abgang (Banner raus,
Kamera zurück zur Totalen). **Nie zwei Großereignisse gleichzeitig** — die vorhandene Queue
serialisiert. Das Traumtor ist das EINZIGE Event mit Screenshake und bekommt ein Replay:
weißer Wipe, Wiederholung in 0,4-facher Zeitlupe, zweite Bauchbinde „TRAUMTOR — [Name]".

### 5.4 Disziplin
- Easing überall (cubic-out / spring), nichts bewegt sich linear.
- Partikel sparsam: Konfetti nur bei Meisterschale und Traumtor; Grasstaub bei Grätsche. Kein Dauerfeuerwerk.
- Max. 12–16 sichtbare Figuren pro Bühne (Startelf-Deckel bleibt), Ticker mit Tabular-Ziffern.
- Verboten: Emojis, Clipart-Ästhetik, große Flächen in Reinfarben, hektisches Blinken.

Farben: Dark #1F2D3D (Studio), Electric Red #E2241A (Akzente/Alerts), Blue #2C57D2,
Orange #FF4C02, Green #009864 (Rasenableitungen), Pink #FF679B (sparsam).

## 6. Warum die Survival-League-Eliminierung NICHT umgesetzt wird

1. **Der Joker rechnet sich nicht.** Rückkehr nur per KIP/MOB-BNT — davon gibt es laut echten Daten
   0–5 pro Team und Tag, standortweit vielleicht 3–10. Die um 13:00 eliminierte Hälfte bliebe fast
   vollständig bis Feierabend unsichtbar.
2. **Eliminierung trifft die Falschen.** Wer morgens schwach startet oder erst zur Spätschicht um
   13/14 Uhr anfängt, wird sofort weggeschnitten — exakt die Leute, die der Monitor motivieren soll.
   Das Underdog-Prinzip (das der User selbst gesetzt hat) würde ins Gegenteil verkehrt.
3. **Der Monitor verliert sein Publikum.** Ab dem „Viertelfinale" sehen 30+ von 40 Agenten ihren
   Namen nie mehr — genau die schauen dann weg. Ein Motivationsmonitor, den die Mehrheit ignoriert,
   ist gescheitert.

**Was von der Survival-Idee übernommen wird:** die Eintrittskarte durch Tracking (Regel 3), die
eskalierende Spannungskurve (Akte 3–4), das Joker-Comeback (verallgemeinert: jedes Tor bringt dich
auf die Bühne) und das Schlussbild „EINER bleibt im Licht" (Last-One-Standing-Zeremonie).

## 7. Technische Verankerung (Stufe 1)

| Bestehend | Wird zu | Anker |
|---|---|---|
| `rcWarPickTarget` (Ziel = Vordermann-Burg) | Ziel = eigenes Tor (Friendly Fire entfällt strukturell) | L~2721 |
| `rcWarDrawBase` (Burg) | Stadion (Perspektiv-Feld, Tribüne, Flutlicht) | Funktions-Landkarte |
| `rcWarDrawMan` (Ritter/Katapult) | Spieler-Rig (Schütze, Keeper, Elfmeter-Posen) | Funktions-Landkarte |
| `rcWarSpawn`/`rcRadarPing` | Event-Router: Produkt → Schussart, Ergebnis → Ausgang | vorhanden |
| `RC_WAR.queue` | Event-Regie (3-Phasen-Sequenzen, Serialisierung) | vorhanden |
| `rcAllSales`-Replay | Highlight-Reel 18:00 / Freitag | vorhanden |
| — neu — | `RC_LEAGUE.cfg` (Punktwerte, Zeiten), Seed-RNG, Akt-Steuerung nach Uhrzeit, Licht-Zyklus | neu |
| — neu (Stufe 2) — | `rcLeagueRebuild()` — Woche deterministisch aus `rcEslHistory`/`rcLigaHistory` + Auto-Harvest neu berechnen (s. 4.1) | neu |

- Feld-Präsenz aus dem heutigen `byAgent`-Stand (wer getrackt hat), Elfmeter-Zähler aus `_anspIds`.
- Kein neuer Datenstrom nötig; Datenlatenz (Eintrag nach dem Call, 20s-Poll) ist konzeptkonform —
  es ist eine Live-KONFERENZ mit Ticker, keine Echtzeit-Kamera.
- Offline-Test: `test_dashboard_offline.html` + `window.rcWarStep(dt)`; nach jeder Änderung
  `node --check esl_live_arena_v22.js`; Re-Inject-Clean-State beachten (Chart-/RAF-Teardown).

## 8. Ausbaustufen

- **Stufe 1 (spielbar):** Broadcast-Reskin, 4-Akte-Tag, Tor-/Punktregeln, Seed-Elfmeter,
  Tages-Duelle + Tagestabelle, Schlusspfiff-Zeremonie. Keine Woche, keine Qualität.
- **Stufe 2:** Champions Week (Wochen-Tabelle, Donnerstags-Cut, Freitags-Finale, verdeckte
  Nachspielzeit ab 16:00, Doppel-Siegerehrung, Wochen-Awards).
- **Stufe 3:** Qualität rein visuell und deterministisch: CS ≥ 90 = goldener Keeper (hält
  gegnerische Elfmeter häufiger — geseedet, kein Live-Würfel), TNPS = Tribünenfüllung,
  FF7 = Rasenzustand. Weiterhin keine Bonus-Tore.
