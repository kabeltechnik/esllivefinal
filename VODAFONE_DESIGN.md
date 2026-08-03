# Vodafone Classic — Design-Spezifikation (ESL Live-Arena v22)

Verbindliche Token- und Komponenten-Spezifikation für das helle Vodafone-Erscheinungsbild
des Dashboards. Basis: Vodafone Digital Design (WS10-Prinzipien) — Weiß, Hellgrau,
Vodafone-Rot, klare Typografie, ruhige Flächen. Emojis bleiben verboten.

## 1. Kern-Token (CSS Custom Properties in v22.js, `:root`)

| Token | Wert | Rolle |
|---|---|---|
| `--vf-red` | `#E60000` | Primärfarbe, Brand, aktive Zustände |
| `--vf-red-dark` | `#BD0000` | Hover auf Rot, Fehler-Text |
| `--vf-canvas` | `#F4F4F4` | Seitenhintergrund |
| `--vf-surface` | `#FFFFFF` | Karten, Header, Modals |
| `--vf-surface-2` | `#F9F9F9` | eingebettete Flächen (Tabellen-Zebra, Wells) |
| `--vf-ink` | `#0D0D0D` | Primärtext, Zahlen, Überschriften |
| `--vf-abbey` | `#333333` | Sekundärtext |
| `--vf-grey` | `#666666` | Tertiärtext, Labels, Units |
| `--vf-grey-mid` | `#999999` | deaktiviert, Platzhalter |
| `--vf-line` | `#EBEBEB` | Trennlinien, Karten-Border |
| `--vf-line-strong` | `#CCCCCC` | Interaktions-Border (Selects, Inputs) |
| `--vf-shadow` | `0 2px 8px rgba(0,0,0,0.08)` | Karten-Schatten |
| `--vf-font` | `'VodafoneVF','Vodafone',Arial,'Helvetica Neue',sans-serif` | bleibt |

## 2. Semantik (KPI-Zustände) — NICHT mehr monochrom

| Token | Wert | Verwendung |
|---|---|---|
| `--vf-ok` | `#008A00` | Ziel erreicht (CS ≥90, TNPS ≥70, …) |
| `--vf-warn` | `#EB9700` | nahe Grenze / Aufmerksamkeit (Flächen, Balken) |
| `--vf-warn-text` | `#8F5C00` | Warn-TEXT auf Weiß (Kontrast; #EB9700 nur als Fläche/Balken) |
| `--vf-breach` | `#E60000` | Ziel verfehlt / kritisch |

Regel: Status-Farben sind reserviert — niemals als Chart-Serienfarbe verwenden.
Status nie nur über Farbe: immer mit Label/Wert/Icon-Formen kombiniert.

## 3. Kategoriale Daten-Palette (Standort-gebunden, validiert)

Feste Reihenfolge, farbe folgt dem STANDORT (Entity), nie dem Rang. Alle 6 Checks
des Dataviz-Validators bestanden (Light-Surface, CVD, Kontrast ≥3:1):

| Slot | Hex | abgeleitet von (Vodafone-Sekundärpalette) |
|---|---|---|
| 1 | `#0068A0` | Aqua Blue, dunkler Schritt |
| 2 | `#647500` | Spring Green, dunkler Schritt |
| 3 | `#7D3572` | Aubergine, heller Schritt |
| 4 | `#0090B0` | Aqua Blue |
| 5 | `#997A00` | Lemon Yellow, dunkler Schritt |
| 6 | `#A32EA8` | Red Violet |

Zuordnung (feste Slots): AL=1, B=2, SER=3, ADP=4, E=5, ZWT=6; weitere Standorte
(NBB, P, SKA) erhalten Grau `#666666` in Charts („Other") — im Radar/War behalten
sie eigene Basisfarben (Spiel-Kontext, immer beschriftet).

Chart-Regeln: EINE Achse, Grid `rgba(0,0,0,0.08)`, Ticks `#666666`, Linien 2px,
Legende ab 2 Serien, Text in Text-Tokens (nie in Serienfarbe).

## 4. Komponenten

- **Header:** Weiß, 1px `--vf-line` unten, 3px `--vf-red` Brand-Bar oben.
  Speechmark-Logo bleibt. Aktiver Seiten-Tab: rotes Pill (weißer Text).
- **Karten:** Weiß, Radius 6px, `--vf-shadow`, 1px `--vf-line`. Karten-Titel:
  11px, 700, uppercase, `--vf-grey`, letter-spacing 1px.
- **KPI-Kacheln:** Zahl 28px+ `--vf-ink`; Zustand über 3px Unterkante in
  ok/warn/breach + kleinem Status-Wort, nicht über eingefärbte Riesenflächen.
- **Buttons:** Primär = rotes Pill; Sekundär = weiß mit 1px `#CCCCCC`, Text
  `#333333`; Hover: Border `#0D0D0D`. Rot-Outline nur für destruktiv/Filter-aktiv.
- **Tabellen:** Kopf `--vf-grey` uppercase 10px; Zeilen 1px `--vf-line`;
  Zebra `--vf-surface-2`; Hervorhebung über 3px linke Kante in Statusfarbe,
  nicht über rote Vollflächen-Zeilen.
- **Ticker/Marquee unten:** Weiß mit 1px Linie oben, Texte `--vf-abbey`,
  Alerts mit rotem Punkt + `--vf-red-dark` Text.
- **Modals:** Weiß, Radius 8px, Backdrop `rgba(13,13,13,0.4)`.

## 5. Radar / RC_WAR — zwei Skins

`rcWar.skin = 'vodafone'` (Default) | `'classic'` (alte Mittelalter-Optik als
Fallback, Umschalter in der Radar-Kopfzeile + Konsole). Der Vodafone-Skin:
helle Bühne (Karte `#FFFFFF`/Land `#E8E8E8`, Linien `#CCCCCC`), Einheiten in
Standort-Farben mit klaren Silhouetten, Effekte in Rot/Grau, alle Feed-/Banner-
Texte in Text-Tokens. Classic bleibt unverändert dunkel (eigener Codepfad).

## 6. Harte Regeln

1. Keine Emojis (Corporate Design).
2. Keine hartcodierten Theme-Farben in Komponenten — immer `var(--vf-*)`;
   Ausnahme: RC_WAR-Canvas-Sprites (eigene Skin-Paletten-Objekte).
3. Excel-Export Blätter 1–2 (`PIX_…xlsm`-Nachbau) bleiben unangetastet.
4. `esl_live_arena_v21.js` bleibt unangetastet (alter Fallback).
5. Statusfarben nie als Serienfarben; Serienfarben nie als Statusfarben.
