@echo off
REM ==========================================================
REM  ESL Live-Arena - Start fuer den UM-PC.
REM  Duenner Wrapper: die ganze Logik steckt in ESL_Start.cmd
REM  (Parameter "um"). Bewusst KEINE Kopie der Logik -
REM  Kopien laufen auseinander (im Projekt schon passiert).
REM
REM  Seit 07.08. bringt jedes Projekt seinen EIGENEN Browser mit
REM  (eigenes Edge-Profil "EdgeProfil_um", eigener Port 9224,
REM  eigene Ligaliste, eigener Genesys-Monitor). Damit duerfen
REM  Kabel, Mobile und UM GLEICHZEITIG auf einem Rechner laufen.
REM  Grund: geteilt wurde nie der Rechner, sondern das Edge-PROFIL
REM  - ein Profil hat EINEN Cookie-Jar und damit EINE ESL-Sitzung,
REM  weshalb sich zwei Projekte darin gegenseitig umkippten.
REM  Der alte Weg "Tabs im laufenden Kabel-Edge dazuschalten"
REM  (ESL_Start_Mobile_UM.cmd) bricht deshalb jetzt ab.
REM ==========================================================
call "%~dp0ESL_Start.cmd" um
