# Call-Center-Arena — Style-Guide (nach Game-Assets-Enhancer-Skill)

Gilt für `callcenter_demo_v2.html` und jede spätere Umsetzung im Dashboard.

## Stilsatz
Handgemalter Cartoon-Look auf dunkler Bühne: dicke warme Umrisslinien, gesättigte
Farben, Cel-Schatten (klare Schatten-/Lichtflächen, kein Airbrush). Nachtbüro —
warmes Lampenlicht fällt auf gesättigte Dinge. Kein Foto-Look, keine Emojis.

## Palette (mit Aufgabe)
| Name | Wert | Aufgabe |
|---|---|---|
| Bühne | `#121212` / `#0b0b10` | Hintergrund, dunkle Bühne (wie Radar) |
| Karte | `#1D1D1D` | UI-Flächen |
| Vodafone-Rot | `#E60000` | Marke, Alarm, Aufstiegs-Banner, Telefon |
| Gold | `#E8B84B` | Reichtum, Münzen, Pokal, Chef-Suite |
| Holz warm | `#93744c` / `#4a3527` | Möbel einfach / edel |
| Erfolg | `#00B47D` | Telefonie aktiv, gesunde Werte |
| Warn-Braun | `#8F5C00` | verwelkte Pflanze, schlechte Qualität |
| Fensterlicht | `#ffd977` | Skyline-Fenster, warme Lichter |

Semantik ist heilig: Rot = Alarm/Marke, Grün = gut/aktiv, Gold = Feier/Reichtum,
Amber/Braun = Warnung. Nie tauschen.

## Licht
EINE Lichtrichtung: warmes Licht von OBEN RECHTS (Bürolampen).
- Iso-Flächen: Deckfläche am hellsten, rechte Seite beleuchtet, linke Seite Schatten.
- Dünner warmer Rim auf der Lichtseite, kühle klare Schattenformen gegenüber.
- Licht-Grade im Code: warmer radialer Schleier von oben rechts + Vignette
  (Mitte klar, Ränder ~0.35 schwarz) ÜBER die fertige Szene — verschmilzt die Ebenen.

## Fokus-Hierarchie
Spielfeld (Tische/Agenten) ist die hellste, kontrastreichste Zone (Lichtpool auf dem
Boden). Hintergrund immer ruhiger: Skyline entsättigt und verhangen, ferne Ebene am
blassesten (Luftperspektive). Blinzeltest: Spielfeld muss gewinnen.

## Ebenen-Stapel (hinten nach vorn, Parallaxe-Faktor bei Kamera-Schwenk)
1. Himmel + Sterne + Mond (0)
2. Wolken, eigene langsame Drift (0.08)
3a. Ferne Skyline — blass, verhangen, DOMINANT hoch (0.12)
3b. Nahe Skyline — wärmer, mehr Kontrast (0.30)
4. Fensterwand des Büros (Sprossen, Glasreflexe) (0.6)
5. Spielfeld: Boden, Teppiche, Tische, Agenten (1.0)
6. Vordergrund-Rahmen: große unscharfe Pflanzenblätter in den Ecken (statisch, nie klickbar)
7. Licht-Grade (Schleier + Vignette)

Skyline-Gebäude: EIN Gebäude = EIN Sprite, prozedural über Slots + deterministischen
Hash platziert (Variante, Höhe, Lücke, Fenster-Flackern). Keine gebackenen Streifen.

## Bewegungs-Regeln (Juice)
- Szene öffnet BEREITS in Bewegung (Wolken, Tipp-Bobbing, Monitor-Glimmen).
- Möbel-Lieferung bei Stufenaufstieg: Fall mit Ease-in, stoppt TOT am Kontakt,
  Squash (~1.12 breit / 0.78 hoch, unten verankert, ~0.09 s), Staubwolke am Kontakt,
  zurückfedern. Danach steht das Möbel für immer still.
- Verkaufs-Reaktion geschichtet: sofortiger Blitz im selben Frame, kurzes Rütteln
  des Tisches, Münzregen, Banner, ausklingen.
- setInterval statt requestAnimationFrame (Wandmonitor/Hintergrund-Tab-Regel),
  kein Math.random (deterministischer LCG), Zeitbasen im Zustand.

## Sprite-Manifest (jedes Teil einzeln gezeichnet)
Himmel, Mond, Stern, Wolke (2 Größen), Gebäude fern/nah (je Hash-Variante),
Fensterwand, Bodenfliese, Teppich (3 Stufen), Tisch (4 Ausbauten), L-Anbau,
Stuhl (2 Ausbauten), Agentenfigur + Headset, Monitor, Telefon, Kaffeebecher (+Dampf),
Pflanze (gesund/verwelkt), Pokal, Lampe, Kronleuchter, Namensschild (Code-Text),
Münze, Funke, Staubwolke, Papierchaos, Spotlight.
