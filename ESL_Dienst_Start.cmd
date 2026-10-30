@echo off
title ESL Live-Arena Datendienst
cd /d "%~dp0"
echo ================================================================
echo   ESL LIVE-ARENA - DATENDIENST
echo ================================================================
echo   Holt ESL und Ligaliste im Hintergrund, das Dashboard laeuft
echo   als eigene Seite unter http://127.0.0.1:8787/
echo.
echo   NICHT gleichzeitig mit ESL_Start.cmd betreiben.
echo   Dieses Fenster offen lassen - Schliessen beendet den Dienst.
echo ================================================================

rem Node suchen: Systempfad, dann portable node.exe im Unterordner node (wie TL Command Center)
set "NODE="
where node >nul 2>&1 && set "NODE=node"
if not defined NODE if exist "%~dp0node\node.exe" set "NODE=%~dp0node\node.exe"
if not defined NODE if exist "%~dp0..\node\node.exe" set "NODE=%~dp0..\node\node.exe"
if not defined NODE (
  echo.
  echo   Node.js wurde nicht gefunden.
  echo   Gesucht: im Systempfad, in "%~dp0node\node.exe" und "%~dp0..\node\node.exe".
  echo   Abhilfe: node.exe ^(Version 22 oder neuer^) als node\node.exe in diesen Ordner legen,
  echo   z. B. aus dem Ordner node des TL Command Center kopieren.
  echo.
  pause
  exit /b 1
)
echo   Node: %NODE%
"%NODE%" -e "var v=+process.versions.node.split('.')[0]; console.log('  Node-Version ' + process.version); if (v < 22) { console.log('  ZU ALT: der Dienst braucht Node 22 oder neuer.'); process.exit(1); }" || (pause & exit /b 1)
rem Postfach-Seite (Outlook klassisch) - NUR auf dem eigenen PC einschalten, nie am Wandmonitor.
rem 1 = an, 0 = aus. Wichtige Absender: Postfach_Wichtig.txt (legt der Dienst beim ersten Start an).
set "ESL_DIENST_POSTFACH=0"
rem Neustart nach Absturz oder Haenger (Code 3). Code 0 = beendet, Code 2 = Startpruefung hat abgelehnt: kein Neustart.
rem Schleife ohne goto/Sprungmarke: die Datei ist LF, Sprungmarken sind dann unzuverlaessig.
setlocal EnableDelayedExpansion
for /l %%i in (1,1,10000) do (
  "%NODE%" "%~dp0esl_dienst.js"
  set "RC=!errorlevel!"
  if "!RC!"=="0" (pause
    exit /b 0)
  if "!RC!"=="2" (pause
    exit /b 2)
  echo.
  echo   Dienst beendet mit Code !RC! - Neustart in 30 Sekunden. Fenster offen lassen.
  ping -n 31 127.0.0.1 >nul
)
pause
