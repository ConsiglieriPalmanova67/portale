@echo off
rem Avvia il portale del condominio sul PC e lo apre nel browser.
rem Tenere aperta questa finestra finche si usa il portale; chiuderla per spegnerlo.
cd /d "%~dp0"
start "" http://localhost:5173
node scripts\server.js 5173
pause
