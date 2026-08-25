@echo off
title ESL Live-Arena v22.0 - Vollautomatischer CDP und APITool Server
cd /d "%~dp0"
echo ================================================================
echo   ESL LIVE-ARENA v22.0 - VOLLAUTOMATISCHER CDP + APITOOL START
echo ================================================================
echo   1. Startet lokalen APITool-Server auf http://127.0.0.1:8787
echo   2. Startet Microsoft Edge mit CDP-Port 9222 (EdgeProfil)
echo   3. Oeffnet Live-Arena + ESL-Worker + Ligaliste-Worker automatisch
echo   4. Zieht alle 20s ESL (.xlsx) und Ligaliste (23 KPIs) im Hintergrund
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
"%NODE%" "%~dp0esl_apitool_server.js"
pause
